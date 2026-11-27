#!/usr/bin/env node
/*
 * DR drill for the Supabase Storage mirror backup (finding F-16, audit
 * 2026-09-04; hardened in Phase 4 · #17; companion of dr-drill.mjs).
 *
 * A backup that is never read back is not a backup. This script verifies the
 * FRESHNESS, 5-BUCKET COVERAGE, and READABILITY of the storage mirror monthly
 * without doing a full restore:
 *   1. Lists objects under <BACKUP_PREFIX>-storage/ preserving R2 LastModified.
 *   2. Verifies the newest per-run manifest is fresh (≤ DRILL_MAX_BACKUP_AGE_HOURS,
 *      default 36h — fail-closed via backupFreshnessError).
 *   3. Verifies the manifest covers ALL 5 expected Storage buckets
 *      (customer-uploads, production-assets, design-previews, cms-media,
 *      product-images) and that every bucket's archive exists in R2 and is ≤ 36h old.
 *   4. Downloads each target bucket's archive (.tar.gz.gpg), DECRYPTS it with
 *      gpg (passphrase via fd 3, never argv/env) and streams it through gunzip,
 *      counting tar entries and bytes WITHOUT writing plaintext to disk.
 *   5. Fails unless every verified archive is a valid tar matching the manifest
 *      counts/bytes exactly and at least one bucket holds objects > 0.
 *
 * Runs from .github/workflows/dr-drill.yml (monthly + manual). NEVER prints
 * secrets or object contents. Required env: R2_ACCOUNT_ID, R2_BUCKET,
 * R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, BACKUP_GPG_PASSPHRASE.
 * Optional: BACKUP_PREFIX (default "db"), BACKUP_STORAGE_BUCKETS (default 5 buckets),
 * DRILL_STORAGE_BUCKET (verify only that bucket after checking 5-bucket manifest
 * coverage), DRILL_MAX_BACKUP_AGE_HOURS (default 36).
 */

import { spawn } from "node:child_process";
import { pipeline } from "node:stream/promises";
import { createGunzip } from "node:zlib";
import { pathToFileURL } from "node:url";
import { S3Client, GetObjectCommand, ListObjectsV2Command } from "@aws-sdk/client-s3";
import { normalizeR2AccountId, explainR2ConnectError } from "./backup-lib.mjs";
import {
  STORAGE_MANIFEST_KEY_RE,
  parseStorageBuckets,
  storageManifestCoverageError,
  parseTarHeader,
  tarPaddingSize,
} from "./backup-storage-lib.mjs";
import { backupFreshnessError, DEFAULT_MAX_BACKUP_AGE_HOURS } from "./dr-drill-lib.mjs";

function requireEnv(name) {
  const v = process.env[name];
  if (v && v.trim()) return v.trim();
  throw new Error(`Missing environment variable ${name}`);
}

/** Lists ALL objects under a prefix preserving Key and LastModified (pages at 1000). */
async function listAllObjects(client, bucket, prefix) {
  const objects = [];
  let ContinuationToken;
  do {
    const page = await client.send(
      new ListObjectsV2Command({ Bucket: bucket, Prefix: prefix, ContinuationToken }),
    );
    for (const o of page.Contents || []) {
      if (o.Key) objects.push({ key: o.Key, lastModified: o.LastModified });
    }
    ContinuationToken = page.IsTruncated ? page.NextContinuationToken : undefined;
  } while (ContinuationToken);
  return objects;
}

async function bodyToString(body) {
  const chunks = [];
  for await (const chunk of body) chunks.push(chunk);
  return Buffer.concat(chunks).toString("utf8");
}

/**
 * Counts file entries (and their total bytes) in a tar stream, parsing 512-byte
 * headers and skipping entry bodies. Only headers are ever held in memory.
 */
async function countTarEntries(stream) {
  let pending = Buffer.alloc(0);
  let skip = 0; // bytes of the current entry body + padding still to skip
  let entries = 0;
  let totalBytes = 0;
  let sawEnd = false;

  for await (const chunk of stream) {
    if (sawEnd) continue; // drain trailing zero blocks + gzip CRC32/ISIZE trailer cleanly
    pending = pending.length === 0 ? chunk : Buffer.concat([pending, chunk]);
    let consumed = 0;
    for (;;) {
      if (skip > 0) {
        const available = pending.length - consumed;
        if (available <= 0) break;
        const take = Math.min(skip, available);
        skip -= take;
        consumed += take;
        continue;
      }
      if (pending.length - consumed < 512) break;
      const header = parseTarHeader(pending.subarray(consumed, consumed + 512));
      consumed += 512;
      if (header === null) {
        sawEnd = true;
        break;
      }
      if (header.type === "0") {
        entries += 1;
        totalBytes += header.size;
      }
      skip = header.size + tarPaddingSize(header.size);
    }
    pending = sawEnd ? Buffer.alloc(0) : pending.subarray(consumed);
  }
  if (!sawEnd) throw new Error("truncated tar: end-of-archive block never arrived");
  return { entries, bytes: totalBytes };
}

/**
 * Downloads, decrypts (gpg fd 3), gunzips, and stream-counts one bucket archive
 * without ever writing plaintext to disk.
 */
async function verifyBucketArchive({ client, r2Bucket, accountId, gpgPassphrase, entry }) {
  let archive;
  try {
    archive = await client.send(new GetObjectCommand({ Bucket: r2Bucket, Key: entry.key }));
  } catch (err) {
    throw explainR2ConnectError(err, accountId);
  }
  const gpg = spawn("gpg", ["-d", "--batch", "--yes", "--passphrase-fd", "3", "-o", "-"], {
    stdio: ["pipe", "pipe", "pipe", "pipe"],
  });
  let gpgStderr = "";
  gpg.stderr.on("data", (d) => {
    gpgStderr += d.toString();
  });
  const gpgDone = new Promise((resolve, reject) => {
    gpg.on("error", (e) =>
      reject(e.code === "ENOENT" ? new Error("gpg is not installed in this environment") : e),
    );
    gpg.on("close", (code) =>
      code === 0
        ? resolve()
        : reject(
            new Error(
              `gpg -d exited with code ${code} (wrong BACKUP_GPG_PASSPHRASE?): ` +
                gpgStderr.trim().slice(0, 300),
            ),
          ),
    );
  });
  gpg.stdio[3].on("error", () => {});
  gpg.stdin.on("error", () => {});
  gpg.stdio[3].end(`${gpgPassphrase}\n`);
  const gunzip = createGunzip();
  const inDone = pipeline(archive.Body, gpg.stdin);
  const gunzipDone = pipeline(gpg.stdout, gunzip);
  let counted;
  try {
    [counted] = await Promise.all([countTarEntries(gunzip), gpgDone, inDone, gunzipDone]);
  } catch (err) {
    if (gpg.exitCode === null) gpg.kill("SIGTERM");
    throw new Error(
      `Could not decrypt/decompress ${entry.key} (wrong BACKUP_GPG_PASSPHRASE ` +
        `or corrupt archive?): ${err.message}`,
    );
  }

  if (counted.entries !== entry.objects || counted.bytes !== entry.bytes) {
    throw new Error(
      `Manifest mismatch for ${entry.bucket}: manifest says ${entry.objects} objects / ` +
        `${entry.bytes} bytes, archive holds ${counted.entries} / ${counted.bytes}`,
    );
  }
  return counted;
}

async function main() {
  const accountId = normalizeR2AccountId(requireEnv("R2_ACCOUNT_ID"));
  const bucket = requireEnv("R2_BUCKET");
  const accessKeyId = requireEnv("R2_ACCESS_KEY_ID");
  const secretAccessKey = requireEnv("R2_SECRET_ACCESS_KEY");
  // Fail-closed (A-3): without the passphrase the archive cannot be decrypted.
  const gpgPassphrase = requireEnv("BACKUP_GPG_PASSPHRASE");
  const prefix = (process.env.BACKUP_PREFIX || "db").trim().replace(/\/+$/, "");
  const storagePrefix = `${prefix}-storage`;
  const expectedBuckets = parseStorageBuckets(process.env.BACKUP_STORAGE_BUCKETS);
  const parsedMaxAge = Number.parseInt(process.env.DRILL_MAX_BACKUP_AGE_HOURS || "", 10);
  const maxBackupAgeHours = Number.isFinite(parsedMaxAge)
    ? parsedMaxAge
    : DEFAULT_MAX_BACKUP_AGE_HOURS;

  const client = new S3Client({
    region: "auto",
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId, secretAccessKey },
  });

  // 1. Newest manifest + strict freshness check (≤ 36h, Phase 4 · #17).
  const allObjects = await listAllObjects(client, bucket, `${storagePrefix}/`);
  const objectByKey = new Map(allObjects.map((o) => [o.key, o]));
  const manifests = allObjects
    .filter((o) => STORAGE_MANIFEST_KEY_RE.test(o.key))
    .sort((a, b) => (a.key < b.key ? -1 : 1));
  if (manifests.length === 0) {
    throw new Error(
      `No storage backup manifests in r2://${bucket}/${storagePrefix}/ — ` +
        `has backup-storage-to-r2.mjs ever run?`,
    );
  }
  const latestManifestObj = manifests[manifests.length - 1];
  const manifestKey = latestManifestObj.key;
  const now = new Date();
  const manifestFreshErr = backupFreshnessError({
    key: manifestKey,
    lastModified: latestManifestObj.lastModified,
    now,
    maxAgeHours: maxBackupAgeHours,
  });
  if (manifestFreshErr) throw new Error(manifestFreshErr);
  const manifestAgeHours = (
    (now.getTime() - latestManifestObj.lastModified.getTime()) /
    3600000
  ).toFixed(1);

  let manifestObj;
  try {
    manifestObj = await client.send(new GetObjectCommand({ Bucket: bucket, Key: manifestKey }));
  } catch (err) {
    throw explainR2ConnectError(err, accountId);
  }
  const manifest = JSON.parse(await bodyToString(manifestObj.Body));
  console.log(
    `→ manifest: ${manifestKey} (${manifest.buckets?.length ?? 0} bucket entries · age ${manifestAgeHours}h ≤ ${maxBackupAgeHours}h)`,
  );

  // 2. Coverage check: ALL 5 expected buckets must be present and valid, and
  //    each bucket's archive must exist in R2 and pass freshness ≤ 36h.
  const entries = Array.isArray(manifest.buckets) ? manifest.buckets : [];
  const coverageErr = storageManifestCoverageError({
    manifestKey,
    manifestBuckets: entries,
    expectedBuckets,
  });
  if (coverageErr) throw new Error(coverageErr);

  const entryByBucket = new Map(entries.map((e) => [e.bucket, e]));
  for (const expectedBucket of expectedBuckets) {
    const entry = entryByBucket.get(expectedBucket);
    const r2Obj = objectByKey.get(entry.key);
    if (!r2Obj) {
      throw new Error(
        `Archive missing in R2 for bucket "${expectedBucket}": expected ${entry.key} (from ${manifestKey})`,
      );
    }
    const archiveFreshErr = backupFreshnessError({
      key: entry.key,
      lastModified: r2Obj.lastModified,
      now,
      maxAgeHours: maxBackupAgeHours,
    });
    if (archiveFreshErr) throw new Error(archiveFreshErr);
  }

  // 3. Decrypt + stream-verify archives (all 5 buckets by default, or single forced bucket).
  const forced = (process.env.DRILL_STORAGE_BUCKET || "").trim();
  const targets = forced ? [entryByBucket.get(forced)] : expectedBuckets.map((b) => entryByBucket.get(b));
  if (forced && !targets[0]) {
    throw new Error(`Bucket "${forced}" is not in the latest manifest (${manifestKey})`);
  }

  let totalVerifiedEntries = 0;
  let totalVerifiedBytes = 0;
  for (const target of targets) {
    console.log(
      `→ verifying [${target.bucket}]: ${target.key} (manifest: ${target.objects} objects, ${target.bytes} bytes)`,
    );
    const counted = await verifyBucketArchive({
      client,
      r2Bucket: bucket,
      accountId,
      gpgPassphrase,
      entry: target,
    });
    totalVerifiedEntries += counted.entries;
    totalVerifiedBytes += counted.bytes;
  }

  if (totalVerifiedEntries <= 0) {
    throw new Error(
      `Verified ${targets.length} storage archive(s) from ${manifestKey} but total entries = 0 — empty storage backup`,
    );
  }

  console.log(
    `✓ storage DR drill OK: ${targets.length}/${expectedBuckets.length} bucket(s) verified ` +
      `(${totalVerifiedEntries} entries, ${totalVerifiedBytes} bytes · age ${manifestAgeHours}h ≤ ${maxBackupAgeHours}h) ` +
      `matching ${manifestKey}.`,
  );
}

const invokedDirectly = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (invokedDirectly) {
  main().catch((err) => {
    console.error(`✗ storage DR drill FAILED: ${err.message}`);
    process.exit(1);
  });
}
