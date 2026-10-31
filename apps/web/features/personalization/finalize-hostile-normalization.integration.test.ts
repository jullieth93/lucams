/*
 * LUC-SEC-004 (auditoría 2026-10-30) — finalizeDesign normaliza los snapshots
 * de producción del cliente ANTES de escribir en production-assets.
 *
 * Antes: tanto la vía inline (`production_i`) como el área de paso
 * (`_client` slots) solo validaban tamaño/existencia — bytes arbitrarios
 * (texto, HTML, una bomba de píxeles) llegaban al bucket privado de imprenta
 * con MIME `image/png` impuesto por el servidor.
 *
 * Se certifica con Prisma real + I/O de Storage mockeado (patrón de
 * finalize-design.orchestration.integration.test.ts):
 *   - buffer hostil inline → finalize rechaza, NADA se sube al bucket;
 *   - staged hostil → rechaza y el área de paso se borra de inmediato;
 *   - PNG legítimo → se acepta y lo que se sube es PNG CANÓNICO normalizado
 *     (magic bytes reales, sin EXIF), no los bytes crudos del cliente.
 */

import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const mock = vi.hoisted(() => {
  const uploads: { bucket: string; path: string; bytes: Buffer }[] = [];
  const removed: { bucket: string; paths: string[] }[] = [];
  // stagedBytes: lo que "el cliente subió" al área de paso (lo alimenta cada test).
  const state: { stagedBytes: Buffer | null } = { stagedBytes: null };
  const from = (bucket: string) => ({
    upload: async (path: string, body: Buffer) => {
      uploads.push({ bucket, path, bytes: Buffer.isBuffer(body) ? body : Buffer.from(body) });
      return { data: { path }, error: null };
    },
    getPublicUrl: (path: string) => ({
      data: { publicUrl: `https://mock.supabase/${bucket}/${path}` },
    }),
    download: async () => {
      if (!state.stagedBytes) return { data: null, error: new Error("sin staged") };
      const b = state.stagedBytes;
      return { data: { arrayBuffer: async () => new Uint8Array(b).buffer }, error: null };
    },
    remove: async (paths: string[]) => {
      removed.push({ bucket, paths: [...paths] });
      return { data: [], error: null };
    },
  });
  return { uploads, removed, state, from };
});

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/service", () => ({
  supabaseService: { storage: { from: mock.from } },
}));

import sharp from "sharp";
import { prisma } from "@/lib/db";
import { sniffImageMime } from "@/lib/image-sniff";
import { finalizeDesign } from "./service";

const RUN = `hostile${Date.now()}${Math.floor(Math.random() * 1e6)}`.toLowerCase();
const hasDb = Boolean(process.env.DATABASE_URL);

const STAGE = { width: 1080, height: 1080, dpiPreview: 90, dpiProduction: 300 };
const LAYERS = [
  { id: "bg", type: "background", color: "#FFF8F0" },
  { id: "ph", type: "image-placeholder", x: 90, y: 90, width: 900, height: 900 },
];

let productId = "";
let ownerId = "";

async function tinyPng(w = 900, h = 900): Promise<Buffer> {
  return sharp({
    create: { width: w, height: h, channels: 3, background: { r: 124, g: 106, b: 173 } },
  })
    .png()
    .toBuffer();
}

async function makeDraft(): Promise<string> {
  const design = await prisma.design.create({
    data: {
      customerId: ownerId,
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
  await prisma.design.update({
    where: { id: design.id },
    data: {
      canvasData: {
        version: 2,
        unitTemplate: { version: 1, stage: STAGE, layers: LAYERS },
        slotCount: 1,
        slots: [
          {
            slotIndex: 0,
            assetId: asset.id,
            assetUrl: "https://cdn.lucams.test/a.png",
            photoTransform: { offsetX: 0, offsetY: 0, scale: 1 },
          },
        ],
        gridLayout: { cols: 1, rows: 1, gap: 0 },
      } as never,
    },
  });
  return design.id;
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
      name: `Imán ${RUN}`,
      description: "fixture hostile normalization",
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
    data: { email: `${RUN}@lucams.test`, supabaseUserId: `${RUN}-sub`, referralCode: `${RUN}-ref` },
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
  await safe(prisma.customer.deleteMany({ where: { id: ownerId } }));
});

describe.skipIf(!hasDb)(
  "finalizeDesign — normalización adversarial de producción (LUC-SEC-004)",
  () => {
    it("buffer hostil INLINE (texto etiquetado como snapshot): rechaza y NO se sube nada a production-assets", async () => {
      const designId = await makeDraft();
      const uploadsBefore = mock.uploads.length;

      await expect(
        finalizeDesign({
          designId,
          previewBuffer: await tinyPng(),
          previewMime: "image/png",
          productionBuffers: [Buffer.from("<html>soy un poliglota</html>")],
          customerId: ownerId,
          sessionId: null,
        }),
      ).rejects.toThrow();

      // Ni el preview ni producción quedaron escritos (fail-closed total).
      expect(mock.uploads.slice(uploadsBefore)).toHaveLength(0);
      const design = await prisma.design.findUnique({ where: { id: designId } });
      expect(design?.status).toBe("DRAFT"); // nunca pasó a READY
    });

    it("staged hostil: rechaza y BORRA el área de paso de inmediato", async () => {
      const designId = await makeDraft();
      mock.state.stagedBytes = Buffer.from("definitivamente no es un png");
      const removedBefore = mock.removed.length;

      await expect(
        finalizeDesign({
          designId,
          previewBuffer: await tinyPng(),
          previewMime: "image/png",
          useStagedClientSlots: true,
          customerId: ownerId,
          sessionId: null,
        }),
      ).rejects.toThrow();

      const removed = mock.removed.slice(removedBefore);
      expect(
        removed.some(
          (r) => r.bucket === "production-assets" && r.paths.some((p) => p.includes(designId)),
        ),
      ).toBe(true);
      const design = await prisma.design.findUnique({ where: { id: designId } });
      expect(design?.status).toBe("DRAFT");
    });

    it("bomba de píxeles inline (declara 50.000×50.000): rechazada por presupuesto, no por crash", async () => {
      const designId = await makeDraft();
      // PNG sintético con IHDR enorme (igual que el fixture del unit test).
      const { deflateSync, crc32 } = await import("node:zlib");
      const chunk = (type: string, data: Buffer) => {
        const len = Buffer.alloc(4);
        len.writeUInt32BE(data.length);
        const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
        const crc = Buffer.alloc(4);
        crc.writeUInt32BE(crc32(body) >>> 0);
        return Buffer.concat([len, body, crc]);
      };
      const ihdr = Buffer.alloc(13);
      ihdr.writeUInt32BE(50_000, 0);
      ihdr.writeUInt32BE(50_000, 4);
      ihdr[8] = 8;
      ihdr[9] = 2;
      const bomba = Buffer.concat([
        Buffer.from("89504e470d0a1a0a", "hex"),
        chunk("IHDR", ihdr),
        chunk("IDAT", deflateSync(Buffer.alloc(16))),
        chunk("IEND", Buffer.alloc(0)),
      ]);

      await expect(
        finalizeDesign({
          designId,
          previewBuffer: await tinyPng(),
          previewMime: "image/png",
          productionBuffers: [bomba],
          customerId: ownerId,
          sessionId: null,
        }),
      ).rejects.toThrow();
      const design = await prisma.design.findUnique({ where: { id: designId } });
      expect(design?.status).toBe("DRAFT");
    });

    it("PNG legítimo: aceptado y lo que llega a production-assets es PNG CANÓNICO (no los bytes crudos)", async () => {
      const designId = await makeDraft();
      const legit = await tinyPng();
      const uploadsBefore = mock.uploads.length;

      const result = await finalizeDesign({
        designId,
        previewBuffer: legit,
        previewMime: "image/png",
        productionBuffers: [legit],
        customerId: ownerId,
        sessionId: null,
      });
      expect(result.status).toBe("READY");

      const prod = mock.uploads
        .slice(uploadsBefore)
        .find((u) => u.bucket === "production-assets" && u.path === `${designId}/slot-01.png`);
      expect(prod).toBeDefined();
      // La salida es PNG real (magic bytes) y re-codificada (no identidad de bytes):
      expect(sniffImageMime(prod!.bytes)).toBe("image/png");
      const meta = await sharp(prod!.bytes).metadata();
      expect(meta.exif).toBeUndefined();
    });
  },
);
