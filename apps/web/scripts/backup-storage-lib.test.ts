/*
 * Tests for the pure helpers of the Storage mirror backup (F-16, audit
 * 2026-09-04): R2 key naming, bucket-list parsing, the manifest shape, the
 * minimal ustar encode/decode, and retention via selectStaleKeys() with the
 * storage patterns. No network, no SDKs — same philosophy as
 * backup-lib.test.ts. Retention bugs here mean either lost backups or an
 * ever-growing R2 bucket; a tar bug means an unrestorable archive.
 */

import { describe, it, expect } from "vitest";
import {
  DEFAULT_STORAGE_BUCKETS,
  parseStorageBuckets,
  buildStorageBackupKey,
  buildStorageManifestKey,
  STORAGE_BACKUP_KEY_RE,
  STORAGE_MANIFEST_KEY_RE,
  buildManifest,
  buildTarHeader,
  parseTarHeader,
  tarPaddingSize,
  TAR_BLOCK_SIZE,
} from "./backup-storage-lib.mjs";
import { selectStaleKeys, BACKUP_KEY_RE } from "./backup-lib.mjs";

describe("parseStorageBuckets", () => {
  it("returns the five default buckets when unset or empty", () => {
    expect(parseStorageBuckets(undefined)).toEqual(DEFAULT_STORAGE_BUCKETS);
    expect(parseStorageBuckets("")).toEqual(DEFAULT_STORAGE_BUCKETS);
    expect(parseStorageBuckets("   ")).toEqual(DEFAULT_STORAGE_BUCKETS);
    expect(DEFAULT_STORAGE_BUCKETS).toContain("customer-uploads");
  });

  it("parses a comma list, trimming whitespace and dropping empties", () => {
    expect(parseStorageBuckets("cms-media, product-images ,,")).toEqual([
      "cms-media",
      "product-images",
    ]);
  });

  it("rejects names outside the Supabase bucket charset (no path injection into R2 keys)", () => {
    expect(() => parseStorageBuckets("ok-bucket,Bad_Name")).toThrow(/BACKUP_STORAGE_BUCKETS/);
    expect(() => parseStorageBuckets("../escape")).toThrow(/BACKUP_STORAGE_BUCKETS/);
    expect(() => parseStorageBuckets("with/slash")).toThrow(/BACKUP_STORAGE_BUCKETS/);
  });
});

describe("storage R2 key naming", () => {
  const date = new Date("2026-09-04T07:13:00.123Z");

  it("buildStorageBackupKey nests the archive under <prefix>/<bucket>/ with a sortable UTC timestamp", () => {
    expect(buildStorageBackupKey(date, "db-storage", "customer-uploads")).toBe(
      "db-storage/customer-uploads/lucams-2026-09-04T071300Z.tar.gz.gpg",
    );
  });

  it("strips a trailing slash from the prefix", () => {
    expect(buildStorageBackupKey(date, "db-storage/", "cms-media")).toBe(
      "db-storage/cms-media/lucams-2026-09-04T071300Z.tar.gz.gpg",
    );
  });

  it("archive keys match STORAGE_BACKUP_KEY_RE (and manifests / DB dumps do not)", () => {
    const key = buildStorageBackupKey(date, "db-storage", "product-images");
    expect(STORAGE_BACKUP_KEY_RE.test(key)).toBe(true);
    expect(STORAGE_BACKUP_KEY_RE.test(buildStorageManifestKey(date, "db-storage"))).toBe(false);
    expect(STORAGE_BACKUP_KEY_RE.test("db/lucams-2026-09-04T071300Z.sql.gz.gpg")).toBe(false);
    expect(BACKUP_KEY_RE.test(key)).toBe(false); // DB retention must never touch archives
  });

  it("manifest keys match STORAGE_MANIFEST_KEY_RE only", () => {
    const key = buildStorageManifestKey(date, "db-storage");
    expect(key).toBe("db-storage/lucams-2026-09-04T071300Z.manifest.json");
    expect(STORAGE_MANIFEST_KEY_RE.test(key)).toBe(true);
    expect(STORAGE_MANIFEST_KEY_RE.test(buildStorageBackupKey(date, "db-storage", "b"))).toBe(
      false,
    );
  });

  it("keys sort chronologically (lexical order)", () => {
    const early = buildStorageBackupKey(new Date("2026-09-04T01:00:00Z"), "db-storage", "b");
    const late = buildStorageBackupKey(new Date("2026-09-05T01:00:00Z"), "db-storage", "b");
    expect([late, early].sort()).toEqual([early, late]);
  });
});

describe("retention of storage backups (selectStaleKeys with storage patterns)", () => {
  const archives = [
    "db-storage/customer-uploads/lucams-2026-09-01T071300Z.tar.gz.gpg",
    "db-storage/customer-uploads/lucams-2026-09-02T071300Z.tar.gz.gpg",
    "db-storage/customer-uploads/lucams-2026-09-03T071300Z.tar.gz.gpg",
    "db-storage/customer-uploads/lucams-2026-09-04T071300Z.tar.gz.gpg",
  ];

  it("keeps the N newest archives and prunes the oldest", () => {
    expect(selectStaleKeys(archives, 2, STORAGE_BACKUP_KEY_RE)).toEqual([
      "db-storage/customer-uploads/lucams-2026-09-01T071300Z.tar.gz.gpg",
      "db-storage/customer-uploads/lucams-2026-09-02T071300Z.tar.gz.gpg",
    ]);
  });

  it("SAFEGUARD: keep<=0 prunes nothing", () => {
    expect(selectStaleKeys(archives, 0, STORAGE_BACKUP_KEY_RE)).toEqual([]);
    expect(selectStaleKeys(archives, NaN, STORAGE_BACKUP_KEY_RE)).toEqual([]);
  });

  it("archive retention never proposes manifests (and vice versa)", () => {
    const mixed = [
      ...archives,
      "db-storage/lucams-2026-09-01T071300Z.manifest.json",
      "db-storage/lucams-2026-09-02T071300Z.manifest.json",
      "db-storage/README.txt", // foreign object — must never be pruned
    ];
    expect(selectStaleKeys(mixed, 1, STORAGE_BACKUP_KEY_RE)).toEqual(archives.slice(0, 3));
    expect(selectStaleKeys(mixed, 1, STORAGE_MANIFEST_KEY_RE)).toEqual([
      "db-storage/lucams-2026-09-01T071300Z.manifest.json",
    ]);
  });
});

describe("buildManifest", () => {
  it("carries aggregate counts only (no object paths, no personal data)", () => {
    const manifest = buildManifest({
      startedAt: new Date("2026-09-04T07:13:00Z"),
      finishedAt: new Date("2026-09-04T07:14:30Z"),
      prefix: "db-storage",
      keep: 30,
      buckets: [
        {
          bucket: "customer-uploads",
          objects: 12,
          bytes: 3456,
          key: "db-storage/customer-uploads/lucams-2026-09-04T071300Z.tar.gz.gpg",
          encryptedBytes: 4000,
        },
      ],
    });
    expect(manifest).toEqual({
      version: 1,
      tool: "backup-storage-to-r2.mjs",
      startedAt: "2026-09-04T07:13:00.000Z",
      finishedAt: "2026-09-04T07:14:30.000Z",
      prefix: "db-storage",
      keep: 30,
      buckets: [
        {
          bucket: "customer-uploads",
          objects: 12,
          bytes: 3456,
          key: "db-storage/customer-uploads/lucams-2026-09-04T071300Z.tar.gz.gpg",
          encryptedBytes: 4000,
        },
      ],
    });
  });
});

describe("minimal ustar encode/decode", () => {
  it("buildTarHeader returns a 512-byte block that parseTarHeader reads back", () => {
    const header = buildTarHeader("customer-uploads/design-1/photo.jpg", 1234, 1757005980);
    expect(header.length).toBe(TAR_BLOCK_SIZE);
    const parsed = parseTarHeader(header);
    expect(parsed).toEqual({ name: "customer-uploads/design-1/photo.jpg", size: 1234, type: "0" });
  });

  it("roundtrips names longer than 100 bytes via the ustar prefix field", () => {
    const longName = `cms-media/${"a".repeat(90)}/${"b".repeat(60)}.webp`;
    const parsed = parseTarHeader(buildTarHeader(longName, 10, 0));
    expect(parsed?.name).toBe(longName);
    expect(parsed?.size).toBe(10);
  });

  it("a zero block parses as end-of-archive (null)", () => {
    expect(parseTarHeader(Buffer.alloc(TAR_BLOCK_SIZE))).toBeNull();
  });

  it("rejects a tampered header (checksum mismatch)", () => {
    const header = buildTarHeader("product-images/a.png", 5, 0);
    header[200] = header[200] ^ 0xff; // flip a byte outside the checksum field
    expect(() => parseTarHeader(header)).toThrow(/checksum/);
  });

  it("rejects names that would corrupt or escape the archive", () => {
    expect(() => buildTarHeader("/absolute/path.png", 1, 0)).toThrow(/relative/);
    expect(() => buildTarHeader("a/../../escape.png", 1, 0)).toThrow(/\.\./);
    expect(() => buildTarHeader("x".repeat(101), 1, 0)).toThrow(/ustar/); // no "/" to split on
  });

  it("rejects sizes that overflow the 11-octal-digit field (> ~8 GB)", () => {
    expect(() => buildTarHeader("big.bin", 2 ** 33, 0)).toThrow(/octal/);
  });

  it("tarPaddingSize aligns entries to 512 bytes", () => {
    expect(tarPaddingSize(0)).toBe(0);
    expect(tarPaddingSize(512)).toBe(0);
    expect(tarPaddingSize(1)).toBe(511);
    expect(tarPaddingSize(513)).toBe(511);
  });

  it("full-archive roundtrip: headers + bodies + padding parse back to the same entries", () => {
    const files = [
      { name: "product-images/p1.png", body: Buffer.alloc(1000, 7) },
      { name: "product-images/p2.png", body: Buffer.alloc(512, 9) },
      { name: "product-images/empty.png", body: Buffer.alloc(0) },
    ];
    const parts = [];
    for (const f of files) {
      parts.push(buildTarHeader(f.name, f.body.length, 0));
      parts.push(f.body);
      const pad = tarPaddingSize(f.body.length);
      if (pad > 0) parts.push(Buffer.alloc(pad));
    }
    parts.push(Buffer.alloc(2 * TAR_BLOCK_SIZE));
    const archive = Buffer.concat(parts);

    // Walk it with the same header math the DR drill uses.
    let offset = 0;
    let entries = 0;
    let bytes = 0;
    const seen = [];
    for (;;) {
      const header = parseTarHeader(archive.subarray(offset, offset + TAR_BLOCK_SIZE));
      offset += TAR_BLOCK_SIZE;
      if (header === null) break;
      entries += 1;
      bytes += header.size;
      seen.push(header.name);
      offset += header.size + tarPaddingSize(header.size);
    }
    expect(entries).toBe(3);
    expect(bytes).toBe(1512);
    expect(seen).toEqual(files.map((f) => f.name));
  });
});
