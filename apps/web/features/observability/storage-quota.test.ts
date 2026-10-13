/*
 * Unit — getStorageQuota (Fase 3D): consumo de Supabase Storage por bucket.
 * Determinista: Prisma mockeado con vi.hoisted (mismo patrón que
 * lib/cms-media.test.ts); `server-only` lo stubea vitest.config.ts.
 *
 * FOCO:
 *  - Fuente primaria (2026-10-12): `storage.objects` — bytes REALES de los 5
 *    buckets (metadata.size) y conteo de objetos reales (incluye huérfanos,
 *    que es justo lo que se quiere ver en la alerta de cuota).
 *  - Buckets ausentes del agregado cuentan como 0 (no null que rompa el tile).
 *  - measuredBytes = consumo total real (suma los 5 buckets).
 *  - Si la consulta a storage.objects falla → fallback a las columnas de la
 *    app (bytes solo en customer-uploads/cms-media, resto por archivos) con
 *    `degraded: true`.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

const { cmsMediaAggregate, designAssetAggregate, designCount, queryRaw } = vi.hoisted(() => ({
  cmsMediaAggregate: vi.fn(),
  designAssetAggregate: vi.fn(),
  designCount: vi.fn(),
  queryRaw: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  prisma: {
    cmsMedia: { aggregate: cmsMediaAggregate },
    designAsset: { aggregate: designAssetAggregate },
    design: { count: designCount },
    $queryRaw: queryRaw,
  },
}));
vi.mock("@/lib/logger", () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { getStorageQuota } from "./service";

// (target < ES2020: BigInt() función, no literal 7n.)
const storageObjectsRows = [
  { bucket: "customer-uploads", files: BigInt(5), bytes: BigInt(4096) },
  { bucket: "cms-media", files: BigInt(3), bytes: BigInt(2048) },
  { bucket: "design-previews", files: BigInt(4), bytes: BigInt(1000) },
  { bucket: "production-assets", files: BigInt(7), bytes: BigInt(900_000_000) },
  { bucket: "product-images", files: BigInt(12), bytes: BigInt(5000) },
];

describe("getStorageQuota — fuente primaria (storage.objects)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    queryRaw.mockResolvedValue(storageObjectsRows);
  });

  it("mide bytes REALES de los 5 buckets (production-assets entra en el total)", async () => {
    const quota = await getStorageQuota();

    const byBucket = new Map(quota.buckets.map((b) => [b.bucket, b]));
    expect(byBucket.get("customer-uploads")).toMatchObject({ bytes: 4096, files: 5 });
    expect(byBucket.get("cms-media")).toMatchObject({ bytes: 2048, files: 3 });
    expect(byBucket.get("design-previews")).toMatchObject({ bytes: 1000, files: 4 });
    expect(byBucket.get("production-assets")).toMatchObject({ bytes: 900_000_000, files: 7 });
    expect(byBucket.get("product-images")).toMatchObject({ bytes: 5000, files: 12 });

    // Total real: suma los 5 buckets — la alerta ámbar (>800 MB) ve el bucket pesado.
    expect(quota.measuredBytes).toBe(4096 + 2048 + 1000 + 900_000_000 + 5000);
    expect(quota.degraded).toBe(false);
    // La fuente primaria no toca las tablas de la app.
    expect(cmsMediaAggregate).not.toHaveBeenCalled();
    expect(designAssetAggregate).not.toHaveBeenCalled();
  });

  it("un bucket ausente del agregado reporta 0 bytes y 0 archivos (no null)", async () => {
    queryRaw.mockResolvedValue([storageObjectsRows[3]]); // solo production-assets

    const quota = await getStorageQuota();
    const byBucket = new Map(quota.buckets.map((b) => [b.bucket, b]));
    expect(byBucket.get("customer-uploads")).toMatchObject({ bytes: 0, files: 0 });
    expect(byBucket.get("production-assets")).toMatchObject({ bytes: 900_000_000, files: 7 });
    expect(quota.measuredBytes).toBe(900_000_000);
  });

  it("agregado vacío (sin objetos) → todo en 0 y total 0", async () => {
    queryRaw.mockResolvedValue([]);

    const quota = await getStorageQuota();
    expect(quota.measuredBytes).toBe(0);
    expect(quota.buckets.every((b) => b.bytes === 0 && b.files === 0)).toBe(true);
  });
});

describe("getStorageQuota — fallback a tablas de la app", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // La consulta a storage.objects revienta (permisos/pooler) → fallback.
    queryRaw.mockRejectedValueOnce(new Error("permission denied for schema storage"));
    cmsMediaAggregate.mockResolvedValue({ _sum: { bytes: 2048 }, _count: { _all: 3 } });
    designAssetAggregate.mockResolvedValue({ _sum: { sizeBytes: 4096 }, _count: { _all: 5 } });
    designCount.mockResolvedValue(4);
    // Dos $queryRaw del fallback: production-assets (cardinality) y product-images.
    queryRaw
      .mockResolvedValueOnce([{ files: BigInt(7) }])
      .mockResolvedValueOnce([{ files: BigInt(12) }]);
  });

  it("degrada a bytes parciales + conteo de archivos, sin reventar la página", async () => {
    const quota = await getStorageQuota();

    const byBucket = new Map(quota.buckets.map((b) => [b.bucket, b]));
    expect(byBucket.get("customer-uploads")).toMatchObject({ bytes: 4096, files: 5 });
    expect(byBucket.get("cms-media")).toMatchObject({ bytes: 2048, files: 3 });
    expect(byBucket.get("design-previews")).toMatchObject({ bytes: null, files: 4 });
    expect(byBucket.get("production-assets")).toMatchObject({ bytes: null, files: 7 });
    expect(byBucket.get("product-images")).toMatchObject({ bytes: null, files: 12 });

    // Piso honesto: solo los buckets con bytes guardados.
    expect(quota.measuredBytes).toBe(4096 + 2048);
    expect(quota.degraded).toBe(true);
  });

  it("aggregates sin filas (_sum null) cuentan como 0 bytes y 0 archivos", async () => {
    cmsMediaAggregate.mockResolvedValue({ _sum: { bytes: null }, _count: { _all: 0 } });
    designAssetAggregate.mockResolvedValue({ _sum: { sizeBytes: null }, _count: { _all: 0 } });

    const quota = await getStorageQuota();
    const byBucket = new Map(quota.buckets.map((b) => [b.bucket, b]));
    expect(byBucket.get("customer-uploads")).toMatchObject({ bytes: 0, files: 0 });
    expect(byBucket.get("cms-media")).toMatchObject({ bytes: 0, files: 0 });
    expect(quota.measuredBytes).toBe(0);
  });

  it("un $queryRaw vacío (sin filas) reporta 0 archivos en vez de NaN", async () => {
    queryRaw.mockReset();
    queryRaw.mockRejectedValueOnce(new Error("sin storage"));
    queryRaw.mockResolvedValue([]);
    const quota = await getStorageQuota();
    const byBucket = new Map(quota.buckets.map((b) => [b.bucket, b]));
    expect(byBucket.get("production-assets")).toMatchObject({ bytes: null, files: 0 });
    expect(byBucket.get("product-images")).toMatchObject({ bytes: null, files: 0 });
  });
});
