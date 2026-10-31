/*
 * saveCanvas — miniatura del DRAFT para "Mis diseños" (2026-10-13).
 *
 * El auto-save del Estudio envía opcionalmente `draftPreviewDataUrl` (≤400 px
 * WebP/JPEG, throttled 1/min); el service la sube best-effort al bucket
 * design-previews (privado desde la migración 046) en el path FIJO
 * `<designId>/draft-preview.<ext>` (upsert: NO acumula archivos) y la persiste
 * en Design.draftPreviewUrl como URL AUTORIZADA del handler /api/design-preview/*
 * (LUC-SEC-001), que listCustomerDesigns devuelve para la tarjeta del borrador.
 *
 * Mismo enfoque que finalize-design.orchestration.integration.test.ts: mockea
 * SOLO el I/O de Storage (supabaseService) y usa Prisma real — corre en el job
 * con Postgres aunque no haya llaves Supabase. Fixtures con prefijo RUN único,
 * borrados en afterAll.
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
import { saveCanvas, listCustomerDesigns } from "./service";

const RUN = `draftthumb${Date.now()}${Math.floor(Math.random() * 1e6)}`.toLowerCase();
const hasDb = Boolean(process.env.DATABASE_URL);

const VALID_CANVAS = {
  version: 2 as const,
  unitTemplate: {
    version: 1 as const,
    stage: { width: 100, height: 100, dpiPreview: 90, dpiProduction: 300 },
    layers: [],
  },
  slotCount: 1,
  slots: [{ slotIndex: 0, assetId: null, assetUrl: null }],
  gridLayout: { cols: 1, rows: 1, gap: 0 },
};

let productId = "";
let ownerId = "";

async function tinyWebpDataUrl(): Promise<string> {
  const buf = await sharp({
    create: { width: 32, height: 32, channels: 3, background: { r: 124, g: 106, b: 173 } },
  })
    .webp()
    .toBuffer();
  return `data:image/webp;base64,${buf.toString("base64")}`;
}

async function makeDraft(): Promise<string> {
  const d = await prisma.design.create({
    data: {
      customerId: ownerId,
      productId,
      status: "DRAFT",
      canvasData: VALID_CANVAS,
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
      description: "fixture draft thumb",
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

describe.skipIf(!hasDb)("saveCanvas — miniatura del borrador (2026-10-13)", () => {
  it("con draftPreviewDataUrl válido: sube al path fijo del diseño (upsert) y persiste draftPreviewUrl", async () => {
    const designId = await makeDraft();
    const before = mock.uploads.length;

    await saveCanvas({
      designId,
      canvasData: VALID_CANVAS,
      draftPreviewDataUrl: await tinyWebpDataUrl(),
      customerId: ownerId,
      sessionId: null,
    });

    const design = await prisma.design.findUnique({ where: { id: designId } });
    // LUC-SEC-001 — se persiste la URL AUTORIZADA del handler (el bucket ya
    // no es público); el objeto sigue en el mismo path de Storage.
    expect(design?.draftPreviewUrl).toBe(
      `/api/design-preview/${designId}/draft-preview.webp`,
    );
    const newUploads = mock.uploads.slice(before);
    expect(newUploads).toHaveLength(1);
    expect(newUploads[0]).toMatchObject({
      bucket: "design-previews",
      path: `${designId}/draft-preview.webp`,
      upsert: true,
    });
    expect(newUploads[0]!.bytes).toBeGreaterThan(0);
  });

  it("un segundo save REESCRIBE el mismo path (no acumula archivos)", async () => {
    const designId = await makeDraft();
    const dataUrl = await tinyWebpDataUrl();
    const before = mock.uploads.length;

    await saveCanvas({
      designId,
      canvasData: VALID_CANVAS,
      draftPreviewDataUrl: dataUrl,
      customerId: ownerId,
      sessionId: null,
    });
    await saveCanvas({
      designId,
      canvasData: VALID_CANVAS,
      draftPreviewDataUrl: dataUrl,
      customerId: ownerId,
      sessionId: null,
    });

    const paths = mock.uploads.slice(before).map((u) => u.path);
    expect(paths).toEqual([`${designId}/draft-preview.webp`, `${designId}/draft-preview.webp`]);
  });

  it("dataURL con bytes que NO son el mime declarado → no sube nada y el canvas se guarda igual (best-effort)", async () => {
    const designId = await makeDraft();
    const before = mock.uploads.length;
    // PNG real disfrazado de WebP: el sniff de magic bytes lo rechaza.
    const pngBuf = await sharp({
      create: { width: 8, height: 8, channels: 3, background: { r: 1, g: 2, b: 3 } },
    })
      .png()
      .toBuffer();

    await saveCanvas({
      designId,
      canvasData: VALID_CANVAS,
      draftPreviewDataUrl: `data:image/webp;base64,${pngBuf.toString("base64")}`,
      customerId: ownerId,
      sessionId: null,
    });

    const design = await prisma.design.findUnique({ where: { id: designId } });
    expect(design?.draftPreviewUrl).toBeNull();
    expect(mock.uploads.slice(before)).toHaveLength(0);
    // El canvas sí quedó guardado (el thumbnail nunca rompe el save).
    expect(design?.canvasData).toMatchObject({ version: 2 });
  });

  it("sin draftPreviewDataUrl el save funciona como antes (campo opcional)", async () => {
    const designId = await makeDraft();
    const before = mock.uploads.length;

    await saveCanvas({
      designId,
      canvasData: VALID_CANVAS,
      customerId: ownerId,
      sessionId: null,
    });

    const design = await prisma.design.findUnique({ where: { id: designId } });
    expect(design?.draftPreviewUrl).toBeNull();
    expect(mock.uploads.slice(before)).toHaveLength(0);
  });

  it("listCustomerDesigns devuelve el draftPreviewUrl del borrador", async () => {
    const designId = await makeDraft();
    await saveCanvas({
      designId,
      canvasData: { ...VALID_CANVAS, clientRev: 1 },
      draftPreviewDataUrl: await tinyWebpDataUrl(),
      customerId: ownerId,
      sessionId: null,
    });

    const rows = await listCustomerDesigns(ownerId);
    const row = rows.find((r) => r.id === designId);
    expect(row?.status).toBe("DRAFT");
    expect(row?.draftPreviewUrl).toBe(`/api/design-preview/${designId}/draft-preview.webp`);
  });

  it("un diseño de OTRO cliente no acepta thumbnail (ownership intacto)", async () => {
    const designId = await makeDraft();
    await expect(
      saveCanvas({
        designId,
        canvasData: VALID_CANVAS,
        draftPreviewDataUrl: await tinyWebpDataUrl(),
        customerId: "cus_ajeno",
        sessionId: null,
      }),
    ).rejects.toThrow();
  });

  it("una revisión vieja no sobrescribe el canvas ni la revisión persistida", async () => {
    const designId = await makeDraft();
    await saveCanvas({
      designId,
      canvasData: { ...VALID_CANVAS, clientRev: 200 },
      customerId: ownerId,
      sessionId: null,
    });

    await expect(
      saveCanvas({
        designId,
        canvasData: { ...VALID_CANVAS, clientRev: 100 },
        customerId: ownerId,
        sessionId: null,
      }),
    ).rejects.toThrow("STALE_REVISION");

    const design = await prisma.design.findUnique({ where: { id: designId } });
    expect(design?.clientRev).toBe(BigInt(200));
    expect(design?.canvasData).toMatchObject({ clientRev: 200 });
  });

  it("dos saves que terminan fuera de orden convergen en la revisión mayor", async () => {
    const designId = await makeDraft();
    const results = await Promise.allSettled([
      saveCanvas({
        designId,
        canvasData: { ...VALID_CANVAS, clientRev: 400 },
        customerId: ownerId,
        sessionId: null,
      }),
      saveCanvas({
        designId,
        canvasData: { ...VALID_CANVAS, clientRev: 300 },
        customerId: ownerId,
        sessionId: null,
      }),
    ]);

    expect(results[0]?.status).toBe("fulfilled");
    const design = await prisma.design.findUnique({ where: { id: designId } });
    expect(design?.clientRev).toBe(BigInt(400));
    expect(design?.canvasData).toMatchObject({ clientRev: 400 });
  });

  it("un save legacy sin revisión no puede pisar una revisión nueva", async () => {
    const designId = await makeDraft();
    await saveCanvas({
      designId,
      canvasData: { ...VALID_CANVAS, clientRev: 500 },
      customerId: ownerId,
      sessionId: null,
    });

    await expect(
      saveCanvas({
        designId,
        canvasData: VALID_CANVAS,
        customerId: ownerId,
        sessionId: null,
      }),
    ).rejects.toThrow("STALE_REVISION");
    const design = await prisma.design.findUnique({ where: { id: designId } });
    expect(design?.canvasData).toMatchObject({ clientRev: 500 });
  });

  it("el primer guardado adopta los assets huérfanos referenciados por el canvas", async () => {
    const designId = await makeDraft();
    const orphan = await prisma.designAsset.create({
      data: {
        customerId: ownerId,
        designId: null,
        storageUrl: `${RUN}/orphan.jpg`,
        mimeType: "image/jpeg",
        sizeBytes: 100,
        width: 100,
        height: 100,
      },
      select: { id: true },
    });

    await saveCanvas({
      designId,
      canvasData: {
        ...VALID_CANVAS,
        clientRev: 600,
        slots: [{ slotIndex: 0, assetId: orphan.id, assetUrl: "https://signed.example/photo.jpg" }],
      },
      customerId: ownerId,
      sessionId: null,
    });

    const asset = await prisma.designAsset.findUnique({ where: { id: orphan.id } });
    expect(asset?.designId).toBe(designId);
  });
});
