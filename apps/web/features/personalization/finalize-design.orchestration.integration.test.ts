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
import { processRenderJobs } from "./render-job-service";

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
let sepProductId = ""; // separador 2 caras con backOptional (cara B en blanco)
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

/**
 * ÚLTIMO upload al slot 1 (ADR-131): el finalize sube primero el PNG del cliente y el
 * RenderJob de mejora lo pisa después con el render server-side (upsert, mismo path) — lo
 * que vale es la última escritura.
 */
function productionUploadLast(designId: string) {
  return mock.uploads.findLast(
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
    // Separador 2 caras con cara B OPCIONAL (regla owner 2026-10-07: B vacía → EN BLANCO).
    const sep = await prisma.product.create({
      data: {
        slug: `${RUN}-sep`,
        name: `Separador ${RUN}`,
        description: "fixture sep",
        basePrice: 12_000,
        sku: `${RUN}-SEP`.toUpperCase(),
        categoryId,
        isPersonalizable: true,
        personalizationKind: "PHOTO_PACK",
        personalizationSchema: { photoSlots: 2, facesPerUnit: 2, backOptional: true },
      },
      select: { id: true },
    });
    sepProductId = sep.id;
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
    await safe(prisma.designAsset.deleteMany({ where: { design: { productId: sepProductId } } }));
    await safe(prisma.design.deleteMany({ where: { productId } }));
    await safe(prisma.design.deleteMany({ where: { productId: sepProductId } }));
    await safe(prisma.product.deleteMany({ where: { id: { in: [productId, sepProductId] } } }));
    await safe(prisma.category.deleteMany({ where: { id: categoryId } }));
    await safe(prisma.customer.deleteMany({ where: { email: { contains: RUN } } }));
  });

  it("camino feliz solo-foto: el cliente sube su PNG y el RenderJob lo MEJORA a server-side (3240px) en background", async () => {
    const designId = await makeDraft({ layers: PHOTO_ONLY_LAYERS });
    // El cliente manda un PNG minúsculo (50px). ADR-131: el finalize lo sube tal cual (READY
    // inmediato) y encola el job de mejora; el render server-side corre en el WORKER.
    const updated = await finalizeDesign({
      designId,
      previewBuffer: await tinyPng(100, 100),
      productionBuffers: [await tinyPng(50, 50)],
      customerId: ownerId,
      sessionId: null,
    });
    expect(updated.status).toBe("READY");
    expect(updated.productionUrls).toEqual([`${designId}/slot-01.png`]);
    // LUC-SEC-001 — se persiste la URL autorizada del handler, no la pública.
    expect(updated.previewUrl).toBe(`/api/design-preview/${designId}/preview.png`);
    // Antes del worker: lo último subido es el PNG del cliente (50px).
    const first = productionUploadLast(designId);
    expect(first).toBeDefined();
    expect((await sharp(first!.bytes).metadata()).width).toBe(50);

    const jobResult = await processRenderJobs({ onlyDesignId: designId });
    expect(jobResult.done).toBe(1);
    const up = productionUploadLast(designId);
    const meta = await sharp(up!.bytes).metadata();
    // 3240 = 1080×3 (PRODUCTION_SCALE) → el render del servidor corrió EN EL WORKER y
    // reemplazó el 50px del cliente (misma calidad garantizada que el render síncrono viejo).
    expect(meta.width).toBe(1080 * 3);
    expect(meta.height).toBe(1080 * 3);
    const job = await prisma.renderJob.findUnique({ where: { designId } });
    expect(job?.status).toBe("DONE");
    expect(job?.doneUnits).toBe(job?.totalUnits);
  }, 30000);

  it("vía asíncrona (sin PNG del cliente): finalize marca READY de inmediato y el worker produce los archivos", async () => {
    const designId = await makeDraft({ layers: PHOTO_ONLY_LAYERS });
    const updated = await finalizeDesign({
      designId,
      previewBuffer: await tinyPng(100, 100),
      customerId: ownerId,
      sessionId: null,
    });
    // READY inmediato aunque el render siga en curso: el carrito puede seguir (ADR-131).
    expect(updated.status).toBe("READY");
    await processRenderJobs({ onlyDesignId: designId });
    const row = await prisma.design.findUnique({
      where: { id: designId },
      select: { productionUrls: true },
    });
    expect(row!.productionUrls).toEqual([`${designId}/slot-01.png`]);
    const up = productionUploadLast(designId);
    expect(up).toBeDefined();
    const meta = await sharp(up!.bytes).metadata();
    expect(meta.width).toBe(1080 * 3); // 3240 → lo produjo el worker, no el cliente
    const job = await prisma.renderJob.findUnique({ where: { designId } });
    expect(job?.status).toBe("DONE");
  }, 30000);

  it("guard estático: un slot con FILTRO y SIN PNG del cliente → NEEDS_CLIENT_SLOTS sin encolar job", async () => {
    const designId = await makeDraft({ layers: PHOTO_ONLY_LAYERS, filter: "vivid" });
    await expect(
      finalizeDesign({
        designId,
        previewBuffer: await tinyPng(100, 100),
        customerId: ownerId,
        sessionId: null,
      }),
    ).rejects.toThrow(/NEEDS_CLIENT_SLOTS/);
    // No quedó ni job ni cambio de estado: el diseño sigue DRAFT para la segunda pasada.
    expect(await prisma.renderJob.findUnique({ where: { designId } })).toBeNull();
    const row = await prisma.design.findUnique({
      where: { id: designId },
      select: { status: true },
    });
    expect(row?.status).toBe("DRAFT");
  });

  it("fallback: un slot con FILTRO conserva el PNG del cliente (50px) aun tras el job de mejora", async () => {
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
    // El job de mejora corre: NEEDS_KONVA permanente + archivos del cliente presentes →
    // DONE sin tocar nada (los PNG del cliente quedan vigentes — el fallback de siempre).
    const jobResult = await processRenderJobs({ onlyDesignId: designId });
    expect(jobResult.done).toBe(1);
    const job = await prisma.renderJob.findUnique({ where: { designId } });
    expect(job?.status).toBe("DONE");
    const up = productionUploadLast(designId);
    expect(up).toBeDefined();
    const meta = await sharp(up!.bytes).metadata();
    // 50 → se conserva el PNG del cliente, no un render server-side.
    expect(meta.width).toBe(50);
  }, 30000);

  it("guard: un Design ya READY con producción no se re-finaliza (no-op idempotente)", async () => {
    const designId = await makeDraft({ layers: PHOTO_ONLY_LAYERS });
    await prisma.design.update({
      where: { id: designId },
      data: { status: "READY", productionUrls: [`${designId}/slot-01.png`] },
    });
    const uploadsAntes = mock.uploads.length;
    const again = await finalizeDesign({
      designId,
      previewBuffer: await tinyPng(10, 10),
      productionBuffers: [await tinyPng(10, 10)],
      customerId: ownerId,
      sessionId: null,
    });
    // No-op: no re-renderiza, no re-sube, no toca nada (idempotencia 2026-07-25).
    expect(again.productionUrls).toEqual([`${designId}/slot-01.png`]);
    expect(mock.uploads.length).toBe(uploadsAntes);
  });

  it("guard: READY con render AÚN EN CURSO (job vivo) es no-op; FAILED re-encola y re-patea", async () => {
    const designId = await makeDraft({ layers: PHOTO_ONLY_LAYERS });
    await finalizeDesign({
      designId,
      previewBuffer: await tinyPng(100, 100),
      productionBuffers: [await tinyPng(50, 50)],
      customerId: ownerId,
      sessionId: null,
    });
    // Simula "en curso": productionUrls aún vacío (como recién finalizado por la vía
    // asíncrona, antes de que el worker escriba los paths) con el job vivo.
    await prisma.design.update({ where: { id: designId }, data: { productionUrls: [] } });
    const uploadsAntes = mock.uploads.length;
    const again = await finalizeDesign({
      designId,
      previewBuffer: await tinyPng(10, 10),
      customerId: ownerId,
      sessionId: null,
    });
    expect(again.status).toBe("READY");
    expect(mock.uploads.length).toBe(uploadsAntes); // no-op: el job sigue vivo

    // Job FAILED (agotó reintentos): el re-finalize lo re-encola y lo patea (kick) —
    // el cliente nunca se queda en el callejón «only DRAFT can be finalized».
    await prisma.renderJob.update({
      where: { designId },
      data: { status: "FAILED", attempts: 3 },
    });
    const retry = await finalizeDesign({
      designId,
      previewBuffer: await tinyPng(10, 10),
      customerId: ownerId,
      sessionId: null,
    });
    expect(retry.status).toBe("READY");
    const job = await prisma.renderJob.findUnique({ where: { designId } });
    expect(job?.attempts).toBe(0); // reseteado por el re-encolar
    // El kick pudo completarlo dentro del request (1 slot chico); procesar por si quedó.
    await processRenderJobs({ onlyDesignId: designId });
    const finalJob = await prisma.renderJob.findUnique({ where: { designId } });
    expect(finalJob?.status).toBe("DONE");
    const row = await prisma.design.findUnique({
      where: { id: designId },
      select: { productionUrls: true },
    });
    expect(row!.productionUrls).toEqual([`${designId}/slot-01.png`]);
  }, 30000);

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

  it("backOptional (owner 2026-10-07): cara B VACÍA se imprime EN BLANCO — la tira sube A|blanco, nunca espejo", async () => {
    // Diseño de separador 2 caras: solo la cara A (slot 0) diseñada; la B (slot 1) vacía.
    const design = await prisma.design.create({
      data: {
        customerId: ownerId,
        sessionId: `${RUN}-sep-session`,
        productId: sepProductId,
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
      unitTemplate: { version: 1, stage: STAGE, layers: PHOTO_ONLY_LAYERS },
      slotCount: 2,
      slots: [
        {
          slotIndex: 0, // cara A diseñada
          assetId: asset.id,
          assetUrl: "https://cdn.lucams.test/a.png",
          filter: null,
          photoTransform: { offsetX: 0, offsetY: 0, scale: 1 },
        },
        {
          slotIndex: 1, // cara B VACÍA (backOptional)
          assetId: null,
          assetUrl: null,
          filter: null,
          photoTransform: { offsetX: 0, offsetY: 0, scale: 1 },
        },
      ],
      gridLayout: { cols: 1, rows: 2, gap: 0 },
    };
    await prisma.design.update({
      where: { id: design.id },
      data: { canvasData: canvasData as never },
    });

    const updated = await finalizeDesign({
      designId: design.id,
      previewBuffer: await tinyPng(100, 100),
      // Solo UN snapshot: el de la cara A (las B vacías no reciben ticket).
      productionBuffers: [await tinyPng(50, 50)],
      customerId: ownerId,
      sessionId: null,
    });
    expect(updated.status).toBe("READY");
    // Separador 2 caras → UNA tira desplegada (cabeza al doblez: B arriba, A abajo).
    expect(updated.productionUrls).toEqual([`${design.id}/tira-01.png`]);
    const up = mock.uploads.find(
      (u) => u.bucket === "production-assets" && u.path === `${design.id}/tira-01.png`,
    );
    expect(up).toBeDefined();
    const meta = await sharp(up!.bytes).metadata();
    const w = meta.width!;
    const h = meta.height!;
    const pixel = async (x: number, y: number) => {
      const { data } = await sharp(up!.bytes)
        .extract({ left: x, top: y, width: 1, height: 1 })
        .raw()
        .toBuffer({ resolveWithObject: true });
      return [data[0], data[1], data[2]];
    };
    // Mitad SUPERIOR (cara B) → BLANCO PURO: es la cara B en blanco de la
    // regla nueva (antes: copia espejo de la cara A).
    expect(await pixel(Math.floor(w / 2), Math.floor(h / 4))).toEqual([255, 255, 255]);
    // Mitad INFERIOR (cara A) → la foto del cliente (azul del fixture), NO blanca:
    // prueba de que el blanco de arriba no es "toda la tira vacía".
    const [r, g, b] = await pixel(Math.floor(w / 2), Math.floor((3 * h) / 4));
    expect(b).toBeGreaterThan(r);
    expect(g).toBeGreaterThan(r);
  }, 30000);
});
