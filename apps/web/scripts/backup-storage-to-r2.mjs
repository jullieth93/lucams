#!/usr/bin/env node
/*
 * Off-site encrypted mirror of Supabase Storage buckets to Cloudflare R2
 * (finding F-16, audit 2026-09-04; ADR-059, OPERATIONS.md). The DB backup
 * (backup-db-to-r2.mjs) never covered Storage objects — including
 * customer-uploads, which holds the photos customers upload for production
 * (PII, Ley 1581). The owner approved an encrypted mirror.
 *
 * What it does, per bucket:
 *   1. Lists ALL objects through the Storage API with the service key
 *      (server-side only) — recursive folder walk + offset pagination (the
 *      list endpoint pages at max 1000 entries).
 *   2. Streams every object download through a minimal ustar writer → gzip →
 *      gpg symmetric AES256 (passphrase via fd 3, NEVER argv/env) → a temp
 *      file. Only CIPHERTEXT touches disk; memory stays flat no matter how
 *      large an object is (nothing buffers a whole bucket).
 *   3. Uploads the archive to R2 (S3-compatible) with a known ContentLength:
 *      <BACKUP_PREFIX>-storage/<bucket>/lucams-<UTC>.tar.gz.gpg
 *   4. Prunes old archives of that bucket (keeps the BACKUP_KEEP newest).
 * Finally it writes a per-run JSON manifest (bucket, object count, bytes —
 * counts only, never paths or personal data) to
 * <BACKUP_PREFIX>-storage/lucams-<UTC>.manifest.json and prunes old manifests
 * with the same retention.
 *
 * Full snapshot per bucket, NOT incremental: the buckets hold hundreds of
 * small objects, an incremental scheme would need deletion tracking plus
 * multi-archive restores, and a single self-contained archive per bucket per
 * day is exactly what the DR drill (dr-drill-storage.mjs) can verify and what
 * a restore wants to unpack. R2 storage at this scale costs cents; the simple
 * thing wins.
 *
 * Runs daily from .github/workflows/backup.yml (after the DB backup).
 * Local: `pnpm --filter web storage:backup` with the env loaded.
 *
 * NEVER prints secrets, signed URLs or object contents. Required env:
 *   BACKUP_SUPABASE_URL (fallback NEXT_PUBLIC_SUPABASE_URL): project URL.
 *   BACKUP_SUPABASE_SECRET_KEY (fallback SUPABASE_SECRET_KEY): service/secret
 *     key, server-side only — it bypasses RLS so private buckets are readable.
 *   R2_ACCOUNT_ID, R2_BUCKET, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY.
 *   BACKUP_GPG_PASSPHRASE: same symmetric passphrase as the DB backup —
 *     fail-closed on purpose: no passphrase, no backup.
 * Optional: BACKUP_PREFIX (default "db" → storage prefix "db-storage"),
 * BACKUP_KEEP (default 8; the daily workflow pins 30 ≈ 1 month),
 * BACKUP_STORAGE_BUCKETS (comma list; default the five known buckets).
 */

import { spawn } from "node:child_process";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { createGzip } from "node:zlib";
import { createReadStream, createWriteStream, mkdtempSync, rmSync } from "node:fs";
import { stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import {
  S3Client,
  PutObjectCommand,
  ListObjectsV2Command,
  DeleteObjectsCommand,
} from "@aws-sdk/client-s3";
import { createClient } from "@supabase/supabase-js";
import {
  normalizeR2AccountId,
  explainR2ConnectError,
  selectStaleKeys,
} from "./backup-lib.mjs";
import {
  parseStorageBuckets,
  buildStorageBackupKey,
  buildStorageManifestKey,
  buildManifest,
  buildTarHeader,
  tarPaddingSize,
  STORAGE_BACKUP_KEY_RE,
  STORAGE_MANIFEST_KEY_RE,
  TAR_BLOCK_SIZE,
} from "./backup-storage-lib.mjs";

function requireEnv(name, ...fallbacks) {
  for (const key of [name, ...fallbacks]) {
    const v = process.env[key];
    if (v && v.trim()) return v.trim();
  }
  throw new Error(
    `Missing environment variable ${name}${fallbacks.length ? ` (or ${fallbacks.join("/")})` : ""}`,
  );
}

/** Lists every object of a bucket, recursively, page by page (max 1000/page). */
async function listAllObjects(supabase, bucket) {
  const PAGE = 1000;
  const objects = [];
  async function walk(prefix) {
    let offset = 0;
    for (;;) {
      const { data, error } = await supabase.storage.from(bucket).list(prefix, {
        limit: PAGE,
        offset,
        sortBy: { column: "name", order: "asc" },
      });
      if (error) {
        throw new Error(`listing ${bucket}/${prefix ? `${prefix}/` : ""}: ${error.message}`);
      }
      const entries = data || [];
      for (const entry of entries) {
        const path = prefix ? `${prefix}/${entry.name}` : entry.name;
        if (entry.id === null) {
          // Folders come back with id === null → walk into them.
          await walk(path);
        } else if (entry.name === ".emptyFolderPlaceholder") {
          // Supabase's own folder marker — not a real object.
        } else {
          const size = Number(entry.metadata?.size);
          if (!Number.isSafeInteger(size) || size < 0) {
            throw new Error(
              `${bucket}/${path}: list metadata has no usable size — ` +
                `cannot build the tar archive safely, aborting instead of ` +
                `writing a corrupt backup`,
            );
          }
          const mtime = Date.parse(entry.metadata?.mtime ?? entry.updated_at ?? "");
          objects.push({ path, size, mtimeSec: Number.isFinite(mtime) ? mtime / 1000 : 0 });
        }
      }
      if (entries.length < PAGE) break;
      offset += PAGE;
    }
  }
  await walk("");
  return objects;
}

/** Opens a download stream for one object (Blob → web stream → node stream). */
async function openObjectStream(supabase, bucket, path) {
  const { data, error } = await supabase.storage.from(bucket).download(path);
  if (error) throw new Error(`downloading ${bucket}/${path}: ${error.message}`);
  if (!data) throw new Error(`downloading ${bucket}/${path}: empty response body`);
  return Readable.fromWeb(data.stream());
}

/**
 * Async generator of a ustar archive: one entry per object, downloaded lazily
 * (one object in flight at a time), paths stored as `<bucket>/<path>`. The
 * caller pipes this into gzip → gpg, so memory stays flat.
 */
async function* tarEntries(supabase, bucket, objects) {
  for (const obj of objects) {
    yield buildTarHeader(`${bucket}/${obj.path}`, obj.size, obj.mtimeSec);
    const stream = await openObjectStream(supabase, bucket, obj.path);
    let written = 0;
    for await (const chunk of stream) {
      written += chunk.length;
      yield chunk;
    }
    if (written !== obj.size) {
      throw new Error(
        `${bucket}/${obj.path}: size drifted between listing (${obj.size} B) and ` +
          `download (${written} B) — the object changed mid-backup, archive aborted`,
      );
    }
    const pad = tarPaddingSize(obj.size);
    if (pad > 0) yield Buffer.alloc(pad);
  }
  yield Buffer.alloc(2 * TAR_BLOCK_SIZE); // end-of-archive marker
}

/**
 * Encrypts `source` (a readable tar stream) with gzip → gpg symmetric AES256
 * into `outPath`. The passphrase enters through fd 3 (never argv/env, where it
 * would be visible in /proc or logs) and data through stdin — which is why
 * `--passphrase-fd 0` is NOT used. Only ciphertext reaches the disk.
 */
async function gzipEncryptToFile(source, passphrase, outPath) {
  const gpg = spawn(
    "gpg",
    ["--symmetric", "--cipher-algo", "AES256", "--batch", "--yes", "--passphrase-fd", "3", "-o", "-"],
    { stdio: ["pipe", "pipe", "pipe", "pipe"] },
  );
  let stderr = "";
  gpg.stderr.on("data", (d) => {
    stderr += d.toString();
  });
  const gpgDone = new Promise((resolve, reject) => {
    gpg.on("error", (e) =>
      reject(e.code === "ENOENT" ? new Error("gpg is not installed in this environment") : e),
    );
    gpg.on("close", (code) =>
      code === 0
        ? resolve()
        : reject(new Error(`gpg exited with code ${code}: ${stderr.trim().slice(0, 500)}`)),
    );
  });
  const inDone = pipeline(source, createGzip({ level: 9 }), gpg.stdin);
  const outDone = pipeline(gpg.stdout, createWriteStream(outPath, { mode: 0o600 }));
  gpg.stdio[3].end(`${passphrase}\n`);
  await Promise.all([gpgDone, inDone, outDone]);
}

/** Lists ALL keys under a prefix (ListObjectsV2 pages at 1000 keys). */
async function listAllKeys(r2, bucket, prefix) {
  const keys = [];
  let ContinuationToken;
  do {
    const page = await r2.send(new ListObjectsV2Command({ Bucket: bucket, Prefix: prefix, ContinuationToken }));
    for (const o of page.Contents || []) if (o.Key) keys.push(o.Key);
    ContinuationToken = page.IsTruncated ? page.NextContinuationToken : undefined;
  } while (ContinuationToken);
  return keys;
}

async function pruneStale(r2, bucket, keys, keep, pattern) {
  const stale = selectStaleKeys(keys, keep, pattern);
  if (stale.length > 0) {
    await r2.send(
      new DeleteObjectsCommand({
        Bucket: bucket,
        Delete: { Objects: stale.map((Key) => ({ Key })), Quiet: true },
      }),
    );
  }
  return stale.length;
}

async function main() {
  // Dedicated BACKUP_SUPABASE_* names so the backup credentials never mix with
  // the app runtime env; the NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SECRET_KEY
  // fallbacks exist for local manual runs only.
  const supabaseUrl = requireEnv("BACKUP_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_URL");
  const supabaseSecretKey = requireEnv("BACKUP_SUPABASE_SECRET_KEY", "SUPABASE_SECRET_KEY");
  const accountId = normalizeR2AccountId(requireEnv("R2_ACCOUNT_ID"));
  const r2Bucket = requireEnv("R2_BUCKET");
  const accessKeyId = requireEnv("R2_ACCESS_KEY_ID");
  const secretAccessKey = requireEnv("R2_SECRET_ACCESS_KEY");
  // Fail-closed (A-3): without the passphrase there is no backup — ciphertext
  // in R2 is the whole point (customer photos carry PII, Ley 1581).
  const gpgPassphrase = requireEnv("BACKUP_GPG_PASSPHRASE");
  const prefix = (process.env.BACKUP_PREFIX || "db").trim().replace(/\/+$/, "");
  const storagePrefix = `${prefix}-storage`;
  const keep = Number.parseInt(process.env.BACKUP_KEEP || "8", 10);
  const buckets = parseStorageBuckets(process.env.BACKUP_STORAGE_BUCKETS);

  const supabase = createClient(supabaseUrl, supabaseSecretKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const r2 = new S3Client({
    region: "auto",
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId, secretAccessKey },
  });

  const startedAt = new Date();
  console.log(`→ storage mirror: ${buckets.length} bucket(s) → r2://${r2Bucket}/${storagePrefix}/`);

  const manifestBuckets = [];
  for (const bucket of buckets) {
    console.log(`→ [${bucket}] listing objects…`);
    const objects = await listAllObjects(supabase, bucket);
    const bytes = objects.reduce((acc, o) => acc + o.size, 0);
    console.log(
      `→ [${bucket}] ${objects.length} object(s), ${(bytes / 1024 / 1024).toFixed(2)} MB — tar + gzip + gpg (AES256)…`,
    );

    const tmpDir = mkdtempSync(join(tmpdir(), "storage-backup-"));
    try {
      const tmpPath = join(tmpDir, "archive.tar.gz.gpg");
      await gzipEncryptToFile(
        Readable.from(tarEntries(supabase, bucket, objects)),
        gpgPassphrase,
        tmpPath,
      );
      const { size: encryptedBytes } = await stat(tmpPath);
      const key = buildStorageBackupKey(startedAt, storagePrefix, bucket);

      console.log(
        `→ [${bucket}] uploading ${key} (${(encryptedBytes / 1024 / 1024).toFixed(2)} MB encrypted)…`,
      );
      try {
        await r2.send(
          new PutObjectCommand({
            Bucket: r2Bucket,
            Key: key,
            Body: createReadStream(tmpPath),
            ContentLength: encryptedBytes,
            ContentType: "application/pgp-encrypted",
          }),
        );
      } catch (err) {
        throw explainR2ConnectError(err, accountId);
      }

      const bucketKeys = await listAllKeys(r2, r2Bucket, `${storagePrefix}/${bucket}/`);
      const pruned = await pruneStale(r2, r2Bucket, bucketKeys, keep, STORAGE_BACKUP_KEY_RE);
      console.log(
        `→ [${bucket}] done. Retention: kept ${Math.min(bucketKeys.length + 1, keep)}, pruned ${pruned}.`,
      );
      manifestBuckets.push({ bucket, objects: objects.length, bytes, key, encryptedBytes });
    } finally {
      rmSync(tmpDir, { recursive: true, force: true });
    }
  }

  // Per-run manifest: aggregate counts ONLY (no object paths, no personal
  // data) — it is stored unencrypted so the DR drill can pick an archive.
  const manifest = buildManifest({
    startedAt,
    finishedAt: new Date(),
    prefix: storagePrefix,
    keep,
    buckets: manifestBuckets,
  });
  const manifestKey = buildStorageManifestKey(startedAt, storagePrefix);
  await r2.send(
    new PutObjectCommand({
      Bucket: r2Bucket,
      Key: manifestKey,
      Body: JSON.stringify(manifest, null, 2),
      ContentType: "application/json",
    }),
  );

  const allKeys = await listAllKeys(r2, r2Bucket, `${storagePrefix}/`);
  const prunedManifests = await pruneStale(r2, r2Bucket, allKeys, keep, STORAGE_MANIFEST_KEY_RE);

  const totalObjects = manifestBuckets.reduce((acc, b) => acc + b.objects, 0);
  const totalBytes = manifestBuckets.reduce((acc, b) => acc + b.bytes, 0);
  console.log(
    `✓ storage mirror done: ${manifestBuckets.length} bucket(s), ${totalObjects} object(s), ` +
      `${(totalBytes / 1024 / 1024).toFixed(2)} MB. Manifest: ${manifestKey} ` +
      `(old manifests pruned: ${prunedManifests}).`,
  );
}

// Only runs when invoked directly (not when imported by tests).
const invokedDirectly = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (invokedDirectly) {
  main().catch((err) => {
    console.error(`✗ storage backup failed: ${err.message}`);
    process.exit(1);
  });
}
