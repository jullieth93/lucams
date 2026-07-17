/*
 * Integración — compartir diseño (Fase 3). Cubre la superficie de SEGURIDAD del
 * feature: aislamiento por customerId (nadie ve ni comparte ni archiva el diseño de
 * otro), idempotencia del shareToken, y que la vista pública /d/<token> NO filtre
 * diseños en DRAFT/ARCHIVED ni acepte tokens malformados.
 *
 * Comparte la Supabase de dev (DIRECT_URL). Todo fixture lleva prefijo RUN único y se
 * borra en afterAll. Ver project_integration_tests_share_dev_db.
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import sharp from "sharp";
import { prisma } from "@/lib/db";
import { supabaseService } from "@/lib/supabase/service";
import {
  listCustomerDesigns,
  ensureDesignShareToken,
  archiveCustomerDesign,
  getSharedDesign,
  finalizeDesign,
} from "./service";

const RUN = `perso${Date.now()}${Math.floor(Math.random() * 1e6)}`.toLowerCase();

// Los tests de finalizeDesign suben/descargan de Supabase Storage REAL (bucket
// production-assets). Sin llaves Supabase (p.ej. el job unit-tests de CI, que las deja vacías
// para saltar los tests que exigen Supabase real) → skipIf. Los demás describes de este archivo
// usan solo Prisma (Postgres) y sí corren siempre.
const strip = (v: string | undefined) => v?.replace(/^["']|["']$/g, "");
const canRunStorage = Boolean(
  strip(process.env.NEXT_PUBLIC_SUPABASE_URL) && strip(process.env.SUPABASE_SECRET_KEY),
);

// Objetos de storage creados por los tests de finalize → limpiar en afterAll.
const storageCleanup: { bucket: string; paths: string[] }[] = [];

let categoryId = "";
let productId = "";
let ownerId = "";
let strangerId = "";

// Diseños del dueño en cada estado relevante.
let readyId = "";
let usedId = "";
let draftId = "";
let archivedFixtureId = "";

async function makeCustomer(tag: string): Promise<string> {
  const c = await prisma.customer.create({
    data: {
      email: `${RUN}-${tag}@lucams.test`,
      supabaseUserId: `${RUN}-${tag}-sub`,
      referralCode: `${RUN}-${tag}-ref`,
    },
    select: { id: true },
  });
  return c.id;
}

async function makeDesign(opts: {
  customerId: string;
  status: "READY" | "USED_IN_ORDER" | "DRAFT" | "ARCHIVED";
  previewUrl?: string | null;
}): Promise<string> {
  const d = await prisma.design.create({
    data: {
      customerId: opts.customerId,
      sessionId: `${RUN}-${Math.random().toString(36).slice(2)}`,
      productId,
      status: opts.status,
      canvasData: {},
      previewUrl: opts.previewUrl === undefined ? "https://cdn.lucams.test/p.png" : opts.previewUrl,
    },
    select: { id: true },
  });
  return d.id;
}

beforeAll(async () => {
  const category = await prisma.category.create({
    data: { slug: `${RUN}-cat`, name: `Cat ${RUN}` },
    select: { id: true },
  });
  categoryId = category.id;

  const product = await prisma.product.create({
    data: {
      slug: `${RUN}-prod`,
      name: `Fotoimán ${RUN}`,
      description: "fixture perso",
      basePrice: 10_000,
      sku: `${RUN}-PROD`.toUpperCase(),
      categoryId,
      isPersonalizable: true,
      personalizationKind: "PHOTO_PACK",
    },
    select: { id: true },
  });
  productId = product.id;

  ownerId = await makeCustomer("owner");
  strangerId = await makeCustomer("stranger");

  readyId = await makeDesign({ customerId: ownerId, status: "READY" });
  usedId = await makeDesign({ customerId: ownerId, status: "USED_IN_ORDER" });
  draftId = await makeDesign({ customerId: ownerId, status: "DRAFT" });
  archivedFixtureId = await makeDesign({ customerId: ownerId, status: "ARCHIVED" });
});

afterAll(async () => {
  const safe = (p: Promise<unknown>) => p.catch(() => {});
  // Storage primero (objetos de los tests de finalize).
  for (const { bucket, paths } of storageCleanup) {
    await safe(supabaseService.storage.from(bucket).remove(paths));
  }
  await safe(prisma.designAsset.deleteMany({ where: { design: { productId } } }));
  await safe(prisma.design.deleteMany({ where: { productId } }));
  await safe(prisma.product.deleteMany({ where: { id: productId } }));
  await safe(prisma.category.deleteMany({ where: { id: categoryId } }));
  await safe(prisma.customer.deleteMany({ where: { email: { contains: RUN } } }));
});

describe("listCustomerDesigns", () => {
  it("devuelve solo READY/USED_IN_ORDER con preview, del dueño", async () => {
    const rows = await listCustomerDesigns(ownerId);
    const ids = rows.map((r) => r.id);
    expect(ids).toContain(readyId);
    expect(ids).toContain(usedId);
    expect(ids).not.toContain(draftId);
    expect(ids).not.toContain(archivedFixtureId);
  });

  it("no filtra diseños de otro cliente", async () => {
    const rows = await listCustomerDesigns(strangerId);
    expect(rows).toHaveLength(0);
  });

  it("excluye diseños sin previewUrl", async () => {
    const noPreview = await makeDesign({ customerId: ownerId, status: "READY", previewUrl: null });
    const rows = await listCustomerDesigns(ownerId);
    expect(rows.map((r) => r.id)).not.toContain(noPreview);
  });
});

describe("ensureDesignShareToken", () => {
  it("genera un token de 32 hex y es idempotente", async () => {
    const t1 = await ensureDesignShareToken(readyId, ownerId);
    expect(t1).toMatch(/^[a-f0-9]{32}$/);
    const t2 = await ensureDesignShareToken(readyId, ownerId);
    expect(t2).toBe(t1); // no regenera
  });

  it("comparte un USED_IN_ORDER", async () => {
    const t = await ensureDesignShareToken(usedId, ownerId);
    expect(t).toMatch(/^[a-f0-9]{32}$/);
  });

  it("rechaza el diseño de otro cliente (sin IDOR)", async () => {
    expect(await ensureDesignShareToken(readyId, strangerId)).toBeNull();
  });

  it("no comparte un DRAFT", async () => {
    expect(await ensureDesignShareToken(draftId, ownerId)).toBeNull();
  });
});

describe("getSharedDesign (vista pública)", () => {
  it("resuelve un token válido de un diseño compartible", async () => {
    const token = await ensureDesignShareToken(readyId, ownerId);
    const design = await getSharedDesign(token!);
    expect(design).not.toBeNull();
    expect(design!.previewUrl).toBeTruthy();
    expect(design!.product.name).toContain(RUN);
  });

  it("rechaza token malformado sin tocar la DB", async () => {
    expect(await getSharedDesign("no-hex")).toBeNull();
    expect(await getSharedDesign("g".repeat(32))).toBeNull();
    expect(await getSharedDesign("")).toBeNull();
  });

  it("no resuelve un token inexistente", async () => {
    expect(await getSharedDesign("a".repeat(32))).toBeNull();
  });

  it("deja de resolver cuando el diseño se archiva", async () => {
    const shareId = await makeDesign({ customerId: ownerId, status: "READY" });
    const token = (await ensureDesignShareToken(shareId, ownerId))!;
    expect(await getSharedDesign(token)).not.toBeNull();

    const archived = await archiveCustomerDesign(shareId, ownerId);
    expect(archived).toBe(true);
    expect(await getSharedDesign(token)).toBeNull(); // link muerto tras archivar

    // Revocación real: el shareToken se anula (no solo se apoya en el filtro ARCHIVED).
    const row = await prisma.design.findUnique({
      where: { id: shareId },
      select: { shareToken: true, status: true },
    });
    expect(row!.status).toBe("ARCHIVED");
    expect(row!.shareToken).toBeNull();
  });
});

describe("archiveCustomerDesign", () => {
  it("no permite archivar el diseño de otro cliente", async () => {
    const victim = await makeDesign({ customerId: ownerId, status: "READY" });
    expect(await archiveCustomerDesign(victim, strangerId)).toBe(false);
    const row = await prisma.design.findUnique({ where: { id: victim }, select: { status: true } });
    expect(row!.status).toBe("READY"); // intacto
  });

  it("devuelve false para un id inexistente", async () => {
    expect(await archiveCustomerDesign("does-not-exist", ownerId)).toBe(false);
  });
});

// ════════════════════════════════════════════════════════════════════════
// ADR-057 Fase A1a — finalizeDesign renderiza la producción EN EL SERVIDOR
// ════════════════════════════════════════════════════════════════════════

describe.skipIf(!canRunStorage)(
  "finalizeDesign — render de producción server-side (ADR-057 A1a)",
  () => {
    const STAGE = { width: 1080, height: 1080, dpiPreview: 90, dpiProduction: 300 };
    const photoOnlyLayers = [
      { id: "bg", type: "background", color: "#FFF8F0" },
      { id: "ph", type: "image-placeholder", x: 90, y: 90, width: 900, height: 900 },
    ];

    async function tinyPng(w: number, h: number): Promise<Buffer> {
      return sharp({
        create: { width: w, height: h, channels: 3, background: { r: 10, g: 20, b: 30 } },
      })
        .png()
        .toBuffer();
    }

    async function setupDesign(layers: unknown[], tag: string) {
      // Foto sintética → customer-uploads (path RUN-prefijado).
      const photo = await sharp({
        create: { width: 1200, height: 900, channels: 3, background: { r: 80, g: 160, b: 220 } },
      })
        .png()
        .toBuffer();
      const photoPath = `${RUN}/${tag}.png`;
      await supabaseService.storage
        .from("customer-uploads")
        .upload(photoPath, photo, { contentType: "image/png", upsert: true });
      storageCleanup.push({ bucket: "customer-uploads", paths: [photoPath] });

      const design = await prisma.design.create({
        data: {
          customerId: ownerId,
          sessionId: `${RUN}-${tag}`,
          productId,
          status: "DRAFT",
          canvasData: {},
        },
        select: { id: true },
      });
      const asset = await prisma.designAsset.create({
        data: {
          designId: design.id,
          storageUrl: photoPath,
          width: 1200,
          height: 900,
          sizeBytes: photo.length,
          mimeType: "image/png",
        },
        select: { id: true },
      });
      const canvasData = {
        version: 2,
        unitTemplate: { version: 1, stage: STAGE, layers },
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
      };
      await prisma.design.update({
        where: { id: design.id },
        data: { canvasData: canvasData as never },
      });
      storageCleanup.push({ bucket: "production-assets", paths: [`${design.id}/slot-01.png`] });
      storageCleanup.push({ bucket: "design-previews", paths: [`${design.id}/preview.png`] });
      return design.id;
    }

    it("pack solo-foto: la producción se renderiza en el servidor (3240px), NO el PNG de 50px del cliente", async () => {
      const designId = await setupDesign(photoOnlyLayers, "photoonly");
      // Cliente manda un PNG minúsculo (50px) — si el resultado es 3240px, corrió el servidor.
      await finalizeDesign({
        designId,
        previewBuffer: await tinyPng(100, 100),
        productionBuffers: [await tinyPng(50, 50)],
        customerId: ownerId,
        sessionId: null,
      });
      const row = await prisma.design.findUnique({
        where: { id: designId },
        select: { status: true, productionUrls: true },
      });
      expect(row!.status).toBe("READY");
      expect(row!.productionUrls).toHaveLength(1);
      const { data } = await supabaseService.storage
        .from("production-assets")
        .download(row!.productionUrls[0]);
      const meta = await sharp(Buffer.from(await data!.arrayBuffer())).metadata();
      expect(meta.width).toBe(1080 * 3); // 3240 → server render corrió y reemplazó el del cliente
      expect(meta.height).toBe(1080 * 3);
    }, 30000);

    it("plantilla con TEXTO (Polaroid): se renderiza en el servidor vía canvas A1b (3240px), no el 50px del cliente", async () => {
      const withText = [...photoOnlyLayers, { id: "t", type: "text", text: "Mi recuerdo" }];
      const designId = await setupDesign(withText, "withtext");
      await finalizeDesign({
        designId,
        previewBuffer: await tinyPng(100, 100),
        productionBuffers: [await tinyPng(50, 50)],
        customerId: ownerId,
        sessionId: null,
      });
      const row = await prisma.design.findUnique({
        where: { id: designId },
        select: { status: true, productionUrls: true },
      });
      expect(row!.status).toBe("READY");
      const { data } = await supabaseService.storage
        .from("production-assets")
        .download(row!.productionUrls[0]);
      const meta = await sharp(Buffer.from(await data!.arrayBuffer())).metadata();
      expect(meta.width).toBe(1080 * 3); // 3240 → el tier canvas (A1b) renderizó el texto server-side
    }, 30000);
  },
);
