/*
 * saveDesignPreviewPages + artefactos watermark del finalize (2026-10-13).
 *
 * Cubre el pipeline de exhibición con marca de agua:
 *   - saveDesignPreviewPages sube pages/NN.webp (limpia) + wm/pages/NN.webp
 *     (watermark) + thumb.webp (primera página, ≤800 px) y sella
 *     Design.previewPagesCount / previewWatermarkedAt.
 *   - Ownership y estado: solo el dueño y solo diseños READY/USED_IN_ORDER.
 *   - Página no decodificable → ok:false sin sellar (best-effort, fallback al
 *     preview global en las superficies).
 *
 * Mismo enfoque que save-canvas-draft-preview.integration.test.ts: mockea SOLO
 * el I/O de Storage (supabaseService) y usa Prisma + sharp reales — corre en el
 * job con Postgres aunque no haya llaves Supabase.
 */

import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const mock = vi.hoisted(() => {
  const uploads: { bucket: string; path: string; bytes: number; upsert: boolean }[] = [];
  const from = (bucket: string) => ({
    upload: async (path: string, body: Buffer, opts?: { upsert?: boolean }) => {
      uploads.push({
        bucket,
        path,
        bytes: Buffer.isBuffer(body) ? body.length : 0,
        upsert: opts?.upsert === true,
      });
      return { data: { path }, error: null };
    },
    getPublicUrl: (path: string) => ({
      data: { publicUrl: `https://mock.supabase/storage/v1/object/public/${bucket}/${path}` },
    }),
    remove: async () => ({ data: [], error: null }),
  });
  return { uploads, from };
});

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/service", () => ({
  supabaseService: { storage: { from: mock.from } },
}));

import sharp from "sharp";
import { prisma } from "@/lib/db";
import { saveDesignPreviewPages } from "./service";

const RUN = `pvwpages${Date.now()}${Math.floor(Math.random() * 1e6)}`.toLowerCase();
const hasDb = Boolean(process.env.DATABASE_URL);

const VALID_CANVAS = {
  version: 2 as const,
  unitTemplate: {
    version: 1 as const,
    stage: { width: 100, height: 100, dpiPreview: 90, dpiProduction: 300 },
    layers: [],
  },
  slotCount: 4,
  unitCount: 2,
  unitSlots: 2,
  slots: [],
  gridLayout: { cols: 2, rows: 2, gap: 0 },
};

let productId = "";
let ownerId = "";

async function tinyWebp(bg: { r: number; g: number; b: number }): Promise<Buffer> {
  return sharp({ create: { width: 48, height: 48, channels: 3, background: bg } })
    .webp()
    .toBuffer();
}

async function makeDesign(status: "DRAFT" | "READY" = "READY"): Promise<string> {
  const d = await prisma.design.create({
    data: {
      customerId: ownerId,
      productId,
      status,
      canvasData: VALID_CANVAS,
      previewUrl: null,
    },
    select: { id: true },
  });
  return d.id;
}

beforeAll(async () => {
  if (!hasDb) return;
  const category = await prisma.category.create({
    data: { slug: `${RUN}-cat`, name: `Cat ${RUN}` },
    select: { id: true },
  });
  const product = await prisma.product.create({
    data: {
      slug: `${RUN}-prod`,
      name: `Fotoimán ${RUN}`,
      description: "fixture preview pages",
      basePrice: 10_000,
      sku: `${RUN}-PROD`.toUpperCase(),
      categoryId: category.id,
      isPersonalizable: true,
      personalizationKind: "PHOTO_PACK",
    },
    select: { id: true },
  });
  productId = product.id;
  const customer = await prisma.customer.create({
    data: {
      email: `${RUN}@lucams.test`,
      supabaseUserId: `${RUN}-sub`,
      referralCode: `${RUN}-ref`,
    },
    select: { id: true },
  });
  ownerId = customer.id;
});

afterAll(async () => {
  if (!hasDb) return;
  const safe = (p: Promise<unknown>) => p.catch(() => {});
  await safe(prisma.design.deleteMany({ where: { productId } }));
  await safe(prisma.product.deleteMany({ where: { id: productId } }));
  await safe(prisma.category.deleteMany({ where: { slug: `${RUN}-cat` } }));
  await safe(prisma.customer.deleteMany({ where: { email: { contains: RUN } } }));
});

describe.skipIf(!hasDb)("saveDesignPreviewPages (2026-10-13)", () => {
  it("sube páginas limpias + watermark y el thumb de la primera página; sella las columnas", async () => {
    const designId = await makeDesign("READY");
    const before = mock.uploads.length;

    const result = await saveDesignPreviewPages({
      designId,
      owner: { customerId: ownerId, sessionId: null },
      pages: [await tinyWebp({ r: 200, g: 30, b: 90 }), await tinyWebp({ r: 30, g: 90, b: 200 })],
    });

    expect(result).toEqual({ ok: true, pagesCount: 2 });
    const paths = mock.uploads.slice(before).map((u) => u.path);
    expect(paths).toEqual(
      expect.arrayContaining([
        `${designId}/pages/01.webp`,
        `${designId}/wm/pages/01.webp`,
        `${designId}/pages/02.webp`,
        `${designId}/wm/pages/02.webp`,
        `${designId}/thumb.webp`,
      ]),
    );
    const design = await prisma.design.findUnique({ where: { id: designId } });
    expect(design?.previewPagesCount).toBe(2);
    // previewWatermarkedAt solo avanza si el preview-wm global existe: este
    // diseño no tiene previewUrl → no se puede regenerar → no se sella.
    expect(design?.previewWatermarkedAt).toBeNull();
  });

  it("rechaza diseños de otro dueño y diseños en DRAFT", async () => {
    const ajeno = await makeDesign("READY");
    const r1 = await saveDesignPreviewPages({
      designId: ajeno,
      owner: { customerId: "cus_ajeno", sessionId: null },
      pages: [await tinyWebp({ r: 1, g: 1, b: 1 })],
    });
    expect(r1.ok).toBe(false);

    const draft = await makeDesign("DRAFT");
    const r2 = await saveDesignPreviewPages({
      designId: draft,
      owner: { customerId: ownerId, sessionId: null },
      pages: [await tinyWebp({ r: 1, g: 1, b: 1 })],
    });
    expect(r2.ok).toBe(false);
    const design = await prisma.design.findUnique({ where: { id: draft } });
    expect(design?.previewPagesCount).toBeNull();
  });

  it("una página no decodificable aborta SIN sellar el conteo (fallback al global)", async () => {
    const designId = await makeDesign("READY");
    const before = mock.uploads.length;

    const result = await saveDesignPreviewPages({
      designId,
      owner: { customerId: ownerId, sessionId: null },
      pages: [await tinyWebp({ r: 9, g: 9, b: 9 }), Buffer.from("no-es-imagen")],
    });

    expect(result.ok).toBe(false);
    const design = await prisma.design.findUnique({ where: { id: designId } });
    expect(design?.previewPagesCount).toBeNull();
    // Nada quedó subido del lote (el decode corre antes de subir cada página).
    expect(mock.uploads.slice(before).filter((u) => u.path.startsWith(designId))).toHaveLength(0);
  });
});
