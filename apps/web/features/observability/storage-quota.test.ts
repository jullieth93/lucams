/*
 * Unit — getStorageQuota (Fase 3D): consumo de Supabase Storage por bucket
 * desde tablas de la app (sin Management API). Determinista: Prisma mockeado
 * con vi.hoisted (mismo patrón que lib/cms-media.test.ts); `server-only` lo
 * stubea vitest.config.ts.
 *
 * FOCO:
 *  - Bytes reales solo donde el schema los guarda: customer-uploads
 *    (DesignAsset.sizeBytes) y cms-media (CmsMedia.bytes).
 *  - Los buckets sin bytes persistidos (design-previews, production-assets,
 *    product-images) reportan bytes: null + conteo de archivos — número
 *    honesto, nunca estimado.
 *  - measuredBytes = piso (suma solo de buckets con bytes reales).
 *  - Aggregates vacíos (_sum null) → 0, no null que rompa el tile.
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

import { getStorageQuota } from "./service";

describe("getStorageQuota", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    cmsMediaAggregate.mockResolvedValue({ _sum: { bytes: 2048 }, _count: { _all: 3 } });
    designAssetAggregate.mockResolvedValue({ _sum: { sizeBytes: 4096 }, _count: { _all: 5 } });
    designCount.mockResolvedValue(4);
    // Dos $queryRaw: production-assets (cardinality) y product-images.
    // (target < ES2020: BigInt() función, no literal 7n.)
    queryRaw
      .mockResolvedValueOnce([{ files: BigInt(7) }])
      .mockResolvedValueOnce([{ files: BigInt(12) }]);
  });

  it("suma bytes reales de customer-uploads y cms-media; el resto va por archivos", async () => {
    const quota = await getStorageQuota();

    const byBucket = new Map(quota.buckets.map((b) => [b.bucket, b]));
    expect(byBucket.get("customer-uploads")).toMatchObject({ bytes: 4096, files: 5 });
    expect(byBucket.get("cms-media")).toMatchObject({ bytes: 2048, files: 3 });
    expect(byBucket.get("design-previews")).toMatchObject({ bytes: null, files: 4 });
    expect(byBucket.get("production-assets")).toMatchObject({ bytes: null, files: 7 });
    expect(byBucket.get("product-images")).toMatchObject({ bytes: null, files: 12 });

    // Piso honesto: solo los buckets con bytes guardados.
    expect(quota.measuredBytes).toBe(4096 + 2048);
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
    queryRaw.mockResolvedValue([]);
    const quota = await getStorageQuota();
    const byBucket = new Map(quota.buckets.map((b) => [b.bucket, b]));
    expect(byBucket.get("production-assets")).toMatchObject({ bytes: null, files: 0 });
    expect(byBucket.get("product-images")).toMatchObject({ bytes: null, files: 0 });
  });
});
