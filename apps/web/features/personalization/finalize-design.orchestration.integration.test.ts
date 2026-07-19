/*
 * finalizeDesign — ORQUESTACIÓN (audit v3 · #7).
 *
 * finalizeDesign es el corazón del Estudio (diferenciador #1): valida, renderiza la producción EN EL
 * SERVIDOR (ADR-057 A1a), decide server-render vs. fallback al PNG del cliente, sube a Storage y hace
 * la transición DRAFT→READY. Hasta ahora su ÚNICA cobertura vivía en tests que exigen Supabase
 * Storage REAL (service.integration.test.ts, describe.skipIf) → se SALTABA en el gate por-PR y solo
 * corría en el nightly. Un cambio que rompiera la orquestación (una validación, la selección de
 * buffers, la transición de estado) pasaba verde en el PR.
 *
 * Este test cierra ese hueco: mockea SOLO el I/O de Storage (supabaseService) y usa Prisma real, así
 * corre en el job unit-tests por-PR (que tiene Postgres pero NO llaves Supabase). Los dos tests que
 * verifican el round-trip de BYTES real siguen en service.integration.test.ts para el nightly.
 *
 * Comparte la Supabase de dev (DIRECT_URL) en local. Todo fixture lleva prefijo RUN único y se borra
 * en afterAll — no se crean objetos de storage reales (todo está mockeado). Ver
 * project_integration_tests_share_dev_db.
 */

import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

// Mock del I/O de Storage: captura los buffers subidos (para asertar QUÉ se subió a cada bucket) y
// alimenta un PNG sintético a las descargas (lo que loadAsset le pasa al render server-side). El
// estado vive en vi.hoisted porque la factory de vi.mock se iza por encima de los imports.
const mock = vi.hoisted(() => {
  const uploads: { bucket: string; path: string; bytes: Buffer }[] = [];
  // photoPng se rellena en beforeAll (necesita sharp async); download solo se invoca en tiempo de test.
  const state: { photoPng: Buffer | null } = { photoPng: null };
  const from = (bucket: string) => ({
    upload: async (path: string, body: Buffer) => {
      uploads.push({ bucket, path, bytes: Buffer.isBuffer(body) ? body : Buffer.from(body) });
      return { data: { path }, error: null };
    },
    getPublicUrl: (path: string) => ({
      data: { publicUrl: `https://mock.supabase/${bucket}/${path}` },
    }),
    download: async () => {
      // Supabase.download() devuelve un Blob-like; loadAsset (service.ts) solo llama .arrayBuffer(),
      // así que devolvemos justo eso (evita el choque de tipos Buffer↔BlobPart de Node).
      if (!state.photoPng) return { data: null, error: new Error("sin foto sintética") };
      const png = state.photoPng;
      return { data: { arrayBuffer: async () => new Uint8Array(png).buffer }, error: null };
    },
    remove: async () => ({ data: [], error: null }),
  });
  return { uploads, state, from };
});

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/service", () => ({
  supabaseService: { storage: { from: mock.from } },
}));

import sharp from "sharp";
import { prisma } from "@/lib/db";
import { finalizeDesign } from "./service";

const RUN = `finalorch${Date.now()}${Math.floor(Math.random() * 1e6)}`.toLowerCase();
const hasDb = Boolean(process.env.DATABASE_URL);

const STAGE = { width: 1080, height: 1080, dpiPreview: 90, dpiProduction: 300 };
// Solo-foto (fondo + un image-placeholder): el motor sharp lo renderiza server-side con fidelidad.
const PHOTO_ONLY_LAYERS = [
  { id: "bg", type: "background", color: "#FFF8F0" },
  { id: "ph", type: "image-placeholder", x: 90, y: 90, width: 900, height: 900 },
];

let categoryId = "";
let productId = "";
let ownerId = "";
let strangerId = "";

async function tinyPng(w: number, h: number): Promise<Buffer> {
  return sharp({
    create: { width: w, height: h, channels: 3, background: { r: 10, g: 20, b: 30 } },
  })
    .png()
    .toBuffer();
}

/** Crea un Design DRAFT V2 con 1 asset y devuelve su id. Parametriza filtro/assetUrl/slotCount/dueño. */
async function makeDraft(opts: {
  layers?: unknown[];
  filter?: string | null;
  assetUrl?: string | null;
  slotCount?: number;
  customerId?: string;
}): Promise<string> {
  const slotCount = opts.slotCount ?? 1;
  const design = await prisma.design.create({
    data: {
      customerId: opts.customerId ?? ownerId,
      sessionId: `${RUN}-${Math.random().toString(36).slice(2, 8)}`,
      productId,
      status: "DRAFT",
      canvasData: {},
    },
    select: { id: true },
  });
  const asset = await prisma.designAsset.create({
    data: {
      designId: design.id,
      storageUrl: `${RUN}/photo.png`,
      width: 1200,
      height: 900,
      sizeBytes: 100,
      mimeType: "image/png",
    },
    select: { id: true },
  });
  const canvasData = {
    version: 2,
    unitTemplate: { version: 1, stage: STAGE, layers: opts.layers ?? PHOTO_ONLY_LAYERS },
    slotCount,
    slots: Array.from({ length: slotCount }, (_, i) => ({
      slotIndex: i,
      assetId: asset.id,
      assetUrl: opts.assetUrl === undefined ? "https://cdn.lucams.test/a.png" : opts.assetUrl,
      filter: opts.filter ?? null,
      photoTransform: { offsetX: 0, offsetY: 0, scale: 1 },
    })),
    gridLayout: { cols: 1, rows: slotCount, gap: 0 },
  };
  await prisma.design.update({
    where: { id: design.id },
    data: { canvasData: canvasData as never },
  });
  return design.id;
}

/** Buffer subido al bucket de producción para el slot 1 de un diseño. */
function productionUpload(designId: string) {
  return mock.uploads.find(
    (u) => u.bucket === "production-assets" && u.path === `${designId}/slot-01.png`,
  );
}

describe.skipIf(!hasDb)("finalizeDesign — orquestación (I/O de storage mockeado)", () => {
  beforeAll(async () => {
    // Foto sintética que el render server-side compone (1200×900 → cabe en el placeholder 900×900).
    mock.state.photoPng = await sharp({
      create: { width: 1200, height: 900, channels: 3, background: { r: 80, g: 160, b: 220 } },
    })
      .png()
      .toBuffer();

    const category = await prisma.category.create({
      data: { slug: `${RUN}-cat`, name: `Cat ${RUN}` },
      select: { id: true },
    });
    categoryId = category.id;
    const product = await prisma.product.create({
      data: {
        slug: `${RUN}-prod`,
        name: `Fotoimán ${RUN}`,
        description: "fixture orch",
        basePrice: 10_000,
        sku: `${RUN}-PROD`.toUpperCase(),
        categoryId,
        isPersonalizable: true,
        personalizationKind: "PHOTO_PACK",
      },
      select: { id: true },
    });
    productId = product.id;
    const owner = await prisma.customer.create({
      data: {
        email: `${RUN}-owner@lucams.test`,
        supabaseUserId: `${RUN}-owner-sub`,
        referralCode: `${RUN}-owner-ref`,
      },
      select: { id: true },
    });
    ownerId = owner.id;
    const stranger = await prisma.customer.create({
      data: {
        email: `${RUN}-str@lucams.test`,
        supabaseUserId: `${RUN}-str-sub`,
        referralCode: `${RUN}-str-ref`,
      },
      select: { id: true },
    });
    strangerId = stranger.id;
  });

  afterAll(async () => {
    const safe = (p: Promise<unknown>) => p.catch(() => {});
    await safe(prisma.designAsset.deleteMany({ where: { design: { productId } } }));
    await safe(prisma.design.deleteMany({ where: { productId } }));
    await safe(prisma.product.deleteMany({ where: { id: productId } }));
    await safe(prisma.category.deleteMany({ where: { id: categoryId } }));
    await safe(prisma.customer.deleteMany({ where: { email: { contains: RUN } } }));
  });

  it("camino feliz solo-foto: el render server-side reemplaza el PNG del cliente (3240px) y pasa a READY", async () => {
    const designId = await makeDraft({ layers: PHOTO_ONLY_LAYERS });
    // El cliente manda un PNG minúsculo (50px). Si lo subido mide 3240px, corrió el servidor.
    const updated = await finalizeDesign({
      designId,
      previewBuffer: await tinyPng(100, 100),
      productionBuffers: [await tinyPng(50, 50)],
      customerId: ownerId,
      sessionId: null,
    });
    expect(updated.status).toBe("READY");
    expect(updated.productionUrls).toEqual([`${designId}/slot-01.png`]);
    expect(updated.previewUrl).toBe(
      `https://mock.supabase/design-previews/${designId}/preview.png`,
    );
    const up = productionUpload(designId);
    expect(up).toBeDefined();
    const meta = await sharp(up!.bytes).metadata();
    // 3240 = 1080×3 (PRODUCTION_SCALE) → el render del servidor corrió y reemplazó el 50px del cliente.
    expect(meta.width).toBe(1080 * 3);
    expect(meta.height).toBe(1080 * 3);
  }, 30000);

  it("fallback: un slot con FILTRO fuerza NEEDS_KONVA en ambos motores → conserva el PNG del cliente (50px)", async () => {
    // El filtro es la fidelidad exacta de Konva → sharp y canvas lo rechazan (fidelidad → cliente).
    const designId = await makeDraft({ layers: PHOTO_ONLY_LAYERS, filter: "vivid" });
    const updated = await finalizeDesign({
      designId,
      previewBuffer: await tinyPng(100, 100),
      productionBuffers: [await tinyPng(50, 50)],
      customerId: ownerId,
      sessionId: null,
    });
    expect(updated.status).toBe("READY");
    const up = productionUpload(designId);
    expect(up).toBeDefined();
    const meta = await sharp(up!.bytes).metadata();
    // 50 → se subió el PNG del cliente (el server hizo fallback), no un render server-side.
    expect(meta.width).toBe(50);
  }, 30000);

  it("guard: un Design ya READY no se puede re-finalizar", async () => {
    const designId = await makeDraft({ layers: PHOTO_ONLY_LAYERS });
    await prisma.design.update({ where: { id: designId }, data: { status: "READY" } });
    await expect(
      finalizeDesign({
        designId,
        previewBuffer: await tinyPng(10, 10),
        productionBuffers: [await tinyPng(10, 10)],
        customerId: ownerId,
        sessionId: null,
      }),
    ).rejects.toThrow(/only DRAFT/);
  });

  it("guard: cantidad de production buffers ≠ slotCount → INCOMPLETE_SLOTS", async () => {
    const designId = await makeDraft({ layers: PHOTO_ONLY_LAYERS, slotCount: 1 });
    await expect(
      finalizeDesign({
        designId,
        previewBuffer: await tinyPng(10, 10),
        productionBuffers: [], // 0 ≠ 1
        customerId: ownerId,
        sessionId: null,
      }),
    ).rejects.toThrow(/INCOMPLETE_SLOTS/);
  });

  it("guard: un slot V2 sin assetUrl → INCOMPLETE_SLOTS", async () => {
    const designId = await makeDraft({ layers: PHOTO_ONLY_LAYERS, assetUrl: null });
    await expect(
      finalizeDesign({
        designId,
        previewBuffer: await tinyPng(10, 10),
        productionBuffers: [await tinyPng(10, 10)],
        customerId: ownerId,
        sessionId: null,
      }),
    ).rejects.toThrow(/INCOMPLETE_SLOTS/);
  });

  it("guard: un Design de otro cliente → no se finaliza (not owned)", async () => {
    const designId = await makeDraft({ layers: PHOTO_ONLY_LAYERS });
    await expect(
      finalizeDesign({
        designId,
        previewBuffer: await tinyPng(10, 10),
        productionBuffers: [await tinyPng(10, 10)],
        customerId: strangerId, // no es el dueño
        sessionId: null,
      }),
    ).rejects.toThrow(/not owned/);
  });

  it("calendarYear numérico se persiste en metadata (ADR-063 CAL2)", async () => {
    const designId = await makeDraft({ layers: PHOTO_ONLY_LAYERS });
    const updated = await finalizeDesign({
      designId,
      previewBuffer: await tinyPng(100, 100),
      productionBuffers: [await tinyPng(50, 50)],
      customerId: ownerId,
      sessionId: null,
      calendarYear: 2027,
    });
    expect(updated.status).toBe("READY");
    expect((updated.metadata as { calendarYear?: number }).calendarYear).toBe(2027);
  }, 30000);
});
