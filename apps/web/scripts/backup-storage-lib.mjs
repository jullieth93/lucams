/*
 * PURE helpers for the Supabase Storage mirror backup to R2 (finding F-16,
 * audit 2026-09-04; ADR-059, OPERATIONS.md): key naming, bucket-list parsing,
 * the per-run manifest shape, and the minimal ustar encode/decode used to pack
 * a bucket with zero extra dependencies. No I/O and no SDKs in this file —
 * everything is unit-testable without network (backup-storage-lib.test.ts).
 * Retention reuses selectStaleKeys() from backup-lib.mjs with the patterns
 * below.
 */

// Storage backups live under `<BACKUP_PREFIX>-storage/` (default "db-storage"):
//   db-storage/<bucket>/lucams-YYYY-MM-DDThhmmssZ.tar.gz.gpg   (encrypted archive)
//   db-storage/lucams-YYYY-MM-DDThhmmssZ.manifest.json         (per-run manifest)
// The timestamp is UTC and lexicographically sortable (alphabetical order =
// chronological order), the same convention as the DB backup keys.
export const STORAGE_BACKUP_KEY_RE = /(^|\/)lucams-\d{4}-\d{2}-\d{2}T\d{6}Z\.tar\.gz\.gpg$/;
export const STORAGE_MANIFEST_KEY_RE = /(^|\/)lucams-\d{4}-\d{2}-\d{2}T\d{6}Z\.manifest\.json$/;

// Buckets mirrored by default. customer-uploads holds the raw photos customers
// upload for production (PII — Ley 1581); production-assets is the material
// the print pipeline consumes. Overridable via BACKUP_STORAGE_BUCKETS.
export const DEFAULT_STORAGE_BUCKETS = [
  "customer-uploads",
  "production-assets",
  "design-previews",
  "cms-media",
  "product-images",
];

/**
 * Parses BACKUP_STORAGE_BUCKETS (comma-separated). Empty/unset → the default
 * list. Bucket names are validated against the Supabase naming charset so a
 * stray value can never inject path segments into the R2 keys.
 */
export function parseStorageBuckets(raw) {
  const value = String(raw ?? "").trim();
  if (!value) return [...DEFAULT_STORAGE_BUCKETS];
  const buckets = value
    .split(",")
    .map((b) => b.trim())
    .filter(Boolean);
  if (buckets.length === 0) return [...DEFAULT_STORAGE_BUCKETS];
  for (const b of buckets) {
    if (!/^[a-z0-9][a-z0-9-]*$/.test(b)) {
      throw new Error(
        `BACKUP_STORAGE_BUCKETS: "${b}" is not a valid Supabase bucket name ` +
          `(lowercase letters, digits and dashes, starting with letter/digit).`,
      );
    }
  }
  return buckets;
}

function utcTimestamp(date) {
  const iso = date.toISOString(); // 2026-09-04T07:13:00.123Z
  const [day, time] = iso.split("T");
  return `${day}T${time.slice(0, 8).replace(/:/g, "")}Z`; // "2026-09-04T071300Z"
}

/**
 * R2 key of the encrypted archive of one bucket for a run at `date` (UTC).
 * Example: buildStorageBackupKey(d, "db-storage", "customer-uploads") →
 * "db-storage/customer-uploads/lucams-2026-09-04T071300Z.tar.gz.gpg"
 */
export function buildStorageBackupKey(date, prefix, bucket) {
  const clean = prefix.replace(/\/+$/, "");
  return `${clean}/${bucket}/lucams-${utcTimestamp(date)}.tar.gz.gpg`;
}

/**
 * R2 key of the per-run manifest (counts only, no paths, no personal data):
 * "db-storage/lucams-2026-09-04T071300Z.manifest.json"
 */
export function buildStorageManifestKey(date, prefix) {
  const clean = prefix.replace(/\/+$/, "");
  return `${clean}/lucams-${utcTimestamp(date)}.manifest.json`;
}

/**
 * Builds the per-run manifest object. ONLY aggregate counts travel here —
 * never object paths or contents — because the manifest is stored unencrypted
 * (it has to be readable to pick which archive a DR drill verifies) and the
 * repo/Actions logs are public.
 * buckets: [{ bucket, objects, bytes, key, encryptedBytes }]
 */
export function buildManifest({ startedAt, finishedAt, prefix, keep, buckets }) {
  return {
    version: 1,
    tool: "backup-storage-to-r2.mjs",
    startedAt: startedAt.toISOString(),
    finishedAt: finishedAt.toISOString(),
    prefix,
    keep,
    buckets: buckets.map((b) => ({
      bucket: b.bucket,
      objects: b.objects,
      bytes: b.bytes,
      key: b.key,
      encryptedBytes: b.encryptedBytes,
    })),
  };
}

// ─── Minimal ustar (POSIX tar) encode/decode ───────────────────────────────
// Just enough to pack a bucket streaming, with no tar binary and no npm
// dependency. Every entry is a regular file; names longer than 100 bytes use
// the ustar prefix split (155-byte prefix + 100-byte name).

export const TAR_BLOCK_SIZE = 512;

/** Bytes of zero padding after an entry of `size` bytes (entries are 512-aligned). */
export function tarPaddingSize(size) {
  return (TAR_BLOCK_SIZE - (size % TAR_BLOCK_SIZE)) % TAR_BLOCK_SIZE;
}

function writeOctal(header, value, offset, length) {
  // Field of `length` bytes: (length-1) octal digits + NUL terminator.
  const s = value.toString(8).padStart(length - 1, "0");
  if (s.length > length - 1) {
    throw new Error(`tar field overflow: value ${value} does not fit in ${length - 1} octal digits`);
  }
  header.write(s, offset, "ascii");
  header.writeUInt8(0, offset + length - 1);
}

/**
 * Builds the 512-byte ustar header of a regular file entry.
 * `name` is the path inside the archive (UTF-8, relative, no ".."), `size` in
 * bytes, `mtimeSec` unix seconds. Throws loudly when the name cannot be
 * represented (silent truncation would corrupt the archive).
 */
export function buildTarHeader(name, size, mtimeSec = 0) {
  if (typeof name !== "string" || name.length === 0) {
    throw new Error("tar entry name must be a non-empty string");
  }
  if (name.startsWith("/") || name.split("/").includes("..")) {
    throw new Error(`tar entry name must be relative and must not contain "..": ${name}`);
  }
  if (!Number.isSafeInteger(size) || size < 0) {
    throw new Error(`tar entry size must be a non-negative integer (got ${size})`);
  }

  // ustar long-name split: name ≤100 bytes, prefix ≤155 bytes, split at "/".
  let namePart = name;
  let prefixPart = "";
  if (Buffer.byteLength(name, "utf8") > 100) {
    let split = -1;
    for (let i = name.lastIndexOf("/"); i > 0; i = name.lastIndexOf("/", i - 1)) {
      if (
        Buffer.byteLength(name.slice(i + 1), "utf8") <= 100 &&
        Buffer.byteLength(name.slice(0, i), "utf8") <= 155
      ) {
        split = i;
        break;
      }
    }
    if (split === -1) {
      throw new Error(
        `tar entry name does not fit ustar (100-byte name / 155-byte prefix): ${name.length} chars`,
      );
    }
    namePart = name.slice(split + 1);
    prefixPart = name.slice(0, split);
  }

  const header = Buffer.alloc(TAR_BLOCK_SIZE, 0);
  header.write(namePart, 0, "utf8"); // name [0,100)
  header.write("0000644", 100, "ascii"); // mode [100,108)
  header.write("0000000", 108, "ascii"); // uid  [108,116)
  header.write("0000000", 116, "ascii"); // gid  [116,124)
  writeOctal(header, size, 124, 12); // size [124,136)
  writeOctal(header, Math.floor(mtimeSec), 136, 12); // mtime [136,148)
  header.writeUInt8("0".charCodeAt(0), 156); // typeflag: regular file
  header.write("ustar", 257, "ascii"); // magic [257,262) + NUL already 0
  header.write("00", 263, "ascii"); // version [263,265)
  if (prefixPart) header.write(prefixPart, 345, "utf8"); // prefix [345,500)

  // Checksum: sum of all header bytes with the chksum field itself as spaces,
  // stored as 6 octal digits + NUL + space.
  header.fill(0x20, 148, 156);
  let sum = 0;
  for (const byte of header) sum += byte;
  header.write(sum.toString(8).padStart(6, "0"), 148, "ascii");
  header.writeUInt8(0, 154);
  header.writeUInt8(0x20, 155);
  return header;
}

function readCString(buf, offset, maxLength) {
  const end = buf.indexOf(0, offset);
  const stop = end === -1 || end > offset + maxLength ? offset + maxLength : end;
  return buf.toString("utf8", offset, stop);
}

/**
 * Parses one 512-byte tar header block. Returns null for the all-zero
 * end-of-archive block; otherwise { name, size, type } with the ustar prefix
 * re-joined into `name`. Throws on a bad checksum (corrupt archive).
 */
export function parseTarHeader(block) {
  if (block.length < TAR_BLOCK_SIZE) {
    throw new Error(`tar header block too short: ${block.length} bytes`);
  }
  if (block.every((b) => b === 0)) return null;

  const stored = Number.parseInt(readCString(block, 148, 8).trim(), 8);
  const copy = Buffer.from(block.subarray(0, TAR_BLOCK_SIZE));
  copy.fill(0x20, 148, 156);
  let sum = 0;
  for (const byte of copy) sum += byte;
  if (stored !== sum) {
    throw new Error("tar header checksum mismatch — archive is corrupt or truncated");
  }

  const size = Number.parseInt(readCString(block, 124, 12).trim(), 8);
  const name = readCString(block, 0, 100);
  const isUstar = block.toString("ascii", 257, 262) === "ustar";
  const prefix = isUstar ? readCString(block, 345, 155) : "";
  const type = String.fromCharCode(block[156] || "0".charCodeAt(0));
  return { name: prefix ? `${prefix}/${name}` : name, size, type };
}
