#!/usr/bin/env node
/*
 * DR drill for the Supabase Storage mirror backup (finding F-16, audit
 * 2026-09-04; companion of dr-drill.mjs, which covers the DB dump).
 *
 * A backup that is never read back is not a backup. This script verifies the
 * READABILITY of the storage mirror, monthly, without doing a full restore:
 *   1. Downloads the newest per-run manifest from R2
 *      (<BACKUP_PREFIX>-storage/lucams-<UTC>.manifest.json — counts only, no
 *      personal data).
 *   2. Picks a bucket that the manifest says holds N > 0 objects (or the one
 *      forced via DRILL_STORAGE_BUCKET).
 *   3. Downloads that bucket's archive (.tar.gz.gpg), DECRYPTS it with gpg
 *      (passphrase via fd 3, never argv/env) and streams it through gunzip,
 *      counting tar entries and bytes WITHOUT writing plaintext to disk.
 *   4. Fails unless the archive is a valid tar, holds N > 0 entries, and the
 *      entry count / byte total match the manifest exactly.
 *
 * Runs from .github/workflows/dr-drill.yml (monthly + manual). NEVER prints
 * secrets or object contents. Required env: R2_ACCOUNT_ID, R2_BUCKET,
 * R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, BACKUP_GPG_PASSPHRASE (the same one
 * backup.yml encrypts with). Optional: BACKUP_PREFIX (default "db" → storage
 * prefix "db-storage"), DRILL_STORAGE_BUCKET (force which bucket to verify;
 * default: the first manifest bucket with objects > 0).
 */

import { spawn } from "node:child_process";
import { createGunzip } from "node:zlib";
import { pathToFileURL } from "node:url";
import { S3Client, GetObjectCommand, ListObjectsV2Command } from "@aws-sdk/client-s3";
import { normalizeR2AccountId, explainR2ConnectError } from "./backup-lib.mjs";
import { STORAGE_MANIFEST_KEY_RE, parseTarHeader, tarPaddingSize } from "./backup-storage-lib.mjs";

function requireEnv(name) {
  const v = process.env[name];
  if (v && v.trim()) return v.trim();
  throw new Error(`Missing environment variable ${name}`);
}

/** Lists ALL keys under a prefix (ListObjectsV2 pages at 1000 keys). */
async function listAllKeys(client, bucket, prefix) {
  const keys = [];
  let ContinuationToken;
  do {
    const page = await client.send(
      new ListObjectsV2Command({ Bucket: bucket, Prefix: prefix, ContinuationToken }),
    );
    for (const o of page.Contents || []) if (o.Key) keys.push(o.Key);
    ContinuationToken = page.IsTruncated ? page.NextContinuationToken : undefined;
  } while (ContinuationToken);
  return keys;
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
    pending = pending.subarray(consumed);
    if (sawEnd) break;
  }
  if (!sawEnd) throw new Error("truncated tar: end-of-archive block never arrived");
  return { entries, bytes: totalBytes };
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

  const client = new S3Client({
    region: "auto",
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId, secretAccessKey },
  });

  // 1. Newest manifest.
  const keys = await listAllKeys(client, bucket, `${storagePrefix}/`);
  const manifests = keys.filter((k) => STORAGE_MANIFEST_KEY_RE.test(k)).sort();
  if (manifests.length === 0) {
    throw new Error(
      `No storage backup manifests in r2://${bucket}/${storagePrefix}/ — ` +
        `has backup-storage-to-r2.mjs ever run?`,
    );
  }
  const manifestKey = manifests[manifests.length - 1];
  let manifestObj;
  try {
    manifestObj = await client.send(new GetObjectCommand({ Bucket: bucket, Key: manifestKey }));
  } catch (err) {
    throw explainR2ConnectError(err, accountId);
  }
  const manifest = JSON.parse(await bodyToString(manifestObj.Body));
  console.log(`→ manifest: ${manifestKey} (${manifest.buckets?.length ?? 0} bucket entries)`);

  // 2. Pick the bucket to verify.
  const entries = Array.isArray(manifest.buckets) ? manifest.buckets : [];
  const forced = (process.env.DRILL_STORAGE_BUCKET || "").trim();
  const chosen = forced
    ? entries.find((e) => e.bucket === forced)
    : entries.find((e) => e.objects > 0);
  if (!chosen) {
    throw new Error(
      forced
        ? `Bucket "${forced}" is not in the latest manifest (${manifestKey})`
        : `Latest manifest (${manifestKey}) has no bucket with objects > 0 to verify`,
    );
  }
  console.log(
    `→ verifying ${chosen.bucket}: archive ${chosen.key} (manifest says ${chosen.objects} objects, ${chosen.bytes} bytes)`,
  );

  // 3. Download → gpg -d → gunzip → count tar entries. The passphrase enters
  //    through fd 3 (never argv/env), the ciphertext through stdin; plaintext
  //    is streamed and counted, never written to disk.
  let archive;
  try {
    archive = await client.send(new GetObjectCommand({ Bucket: bucket, Key: chosen.key }));
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
  archive.Body.pipe(gpg.stdin);
  gpg.stdio[3].end(`${gpgPassphrase}\n`);
  const gunzip = createGunzip();
  gpg.stdout.pipe(gunzip);
  let counted;
  try {
    [counted] = await Promise.all([countTarEntries(gunzip), gpgDone]);
  } catch (err) {
    throw new Error(
      `Could not decrypt/decompress ${chosen.key} (wrong BACKUP_GPG_PASSPHRASE ` +
        `or corrupt archive?): ${err.message}`,
    );
  }

  // 4. The archive must be a real tar, hold N > 0 objects, and match the
  //    manifest exactly.
  if (counted.entries <= 0) {
    throw new Error(`${chosen.key} decrypts but holds 0 tar entries — empty archive`);
  }
  if (counted.entries !== chosen.objects || counted.bytes !== chosen.bytes) {
    throw new Error(
      `Manifest mismatch for ${chosen.bucket}: manifest says ${chosen.objects} objects / ` +
        `${chosen.bytes} bytes, archive holds ${counted.entries} / ${counted.bytes}`,
    );
  }
  console.log(
    `✓ storage DR drill OK: ${chosen.key} decrypts, is a valid tar with ${counted.entries} ` +
      `entries (${counted.bytes} bytes) and matches ${manifestKey}.`,
  );
}

const invokedDirectly = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (invokedDirectly) {
  main().catch((err) => {
    console.error(`✗ storage DR drill FAILED: ${err.message}`);
    process.exit(1);
  });
}
