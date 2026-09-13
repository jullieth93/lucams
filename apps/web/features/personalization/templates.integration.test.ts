/*
 * Integración — ciclo de vida de PLANTILLAS en el Estudio (N-08, 2026-09-11).
 *
 * Cubre las reglas que antes dejaban discrepar al servidor con el cliente y a la
 * PDP con el Estudio:
 *   - listTemplatesForKind filtra mode=EDITABLE por defecto (una PREMADE del
 *     mismo kind ya no se cuela como punto de partida); el modo es opt-in.
 *   - createDraftDesign con templateId explícito valida COMPLETO (activa, no
 *     borrada, EDITABLE, kind del producto, producto-o-global) — antes solo
 *     isActive/deletedAt.
 *   - createDraftDesign SIN templateId arranca con la primera plantilla VISIBLE
 *     (específicas > globales + filtro de aspect), la MISMA que vería el cliente.
 *   - saveCanvas persiste Design.templateId cuando el cliente cambia de
 *     plantilla en el sidebar, validada en servidor; si no pasa la validación el
 *     canvasData se guarda igual y el templateId queda como estaba.
 *
 * Mismo patrón que service.integration.test.ts: DB real (DIRECT_URL compartida de
 * dev), todo fixture con prefijo RUN único y limpieza scoped en afterAll. Sin DB
 * se salta (skipIf) para no romper CI sin DB.
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { createDraftDesign, listTemplatesForKind, saveCanvas } from "./service";

const hasDb = Boolean(process.env.DATABASE_URL);

const RUN = `tpl${Date.now()}${Math.floor(Math.random() * 1e6)}`.toLowerCase();
const T = 30_000;
const OWNER = { customerId: null, sessionId: RUN };

const STAGE_1X1 = { width: 1080, height: 1080, dpiPreview: 90, dpiProduction: 300 };
const STAGE_4X5 = { width: 1080, height: 1350, dpiPreview: 90, dpiProduction: 300 };

function canvasV1(stage: typeof STAGE_1X1) {
  return {
    version: 1,
    stage,
    layers: [{ id: "background", type: "background", color: "#FFF8F0" }],
  };
}

let categoryId = "";
let productAId = ""; // PHOTO_PACK, aspect 1:1, CON plantillas específicas
let productBId = ""; // PHOTO_PACK, aspect 1:1, con su propia específica

// Templates (ids se llenan en beforeAll)
let specA1x1Id = ""; // específica de A, aspect correcto, order 1
let specA4x5Id = ""; // específica de A, aspect INCORRECTO, order 0
let globEditId = ""; // global EDITABLE
let globPremadeId = ""; // global PREMADE (concepto retirado del storefront)
let specBId = ""; // específica de OTRO producto
let wrongKindId = ""; // de A pero kind distinto
let inactiveId = ""; // de A, isActive=false
let deletedId = ""; // de A, deletedAt set

describe.skipIf(!hasDb)("plantillas del Estudio — reglas N-08", { timeout: T }, () => {
  beforeAll(async () => {
    const category = await prisma.category.create({
      data: { slug: `${RUN}-cat`, name: `Cat ${RUN}` },
      select: { id: true },
    });
    categoryId = category.id;

    const mkProduct = (tag: string) =>
      prisma.product.create({
        data: {
          slug: `${RUN}-${tag}`,
          name: `Fotoimán ${tag} ${RUN}`,
          description: "fixture templates N-08",
          basePrice: 10_000,
          sku: `${RUN}-${tag}`.toUpperCase(),
          categoryId,
          isPersonalizable: true,
          personalizationKind: "PHOTO_PACK",
          personalizationSchema: { photoSlots: 2, aspectRatio: "1:1" },
        },
        select: { id: true },
      });
    productAId = (await mkProduct("prod-a")).id;
    productBId = (await mkProduct("prod-b")).id;

    const mkTemplate = (data: {
      productId?: string | null;
      kind?: "PHOTO_PACK" | "CALENDAR_PHOTO_MONTH";
      mode?: "EDITABLE" | "PREMADE";
      slug: string;
      order?: number;
      stage?: typeof STAGE_1X1;
      isActive?: boolean;
      deletedAt?: Date;
    }) =>
      prisma.personalizationTemplate.create({
        data: {
          productId: data.productId ?? null,
          kind: data.kind ?? "PHOTO_PACK",
          mode: data.mode ?? "EDITABLE",
          name: `Tpl ${data.slug}`,
          slug: data.slug,
          previewUrl: `https://cdn.lucams.test/${data.slug}.png`,
          canvasData: canvasV1(data.stage ?? STAGE_1X1),
          order: data.order ?? 0,
          isActive: data.isActive ?? true,
          deletedAt: data.deletedAt ?? null,
        },
        select: { id: true },
      });

    specA4x5Id = (
      await mkTemplate({
        productId: productAId,
        slug: `${RUN}-spec-a-4x5`,
        order: 0,
        stage: STAGE_4X5,
      })
    ).id;
    specA1x1Id = (await mkTemplate({ productId: productAId, slug: `${RUN}-spec-a-1x1`, order: 1 }))
      .id;
    globEditId = (await mkTemplate({ slug: `${RUN}-glob-edit`, order: 0 })).id;
    globPremadeId = (await mkTemplate({ slug: `${RUN}-glob-premade`, mode: "PREMADE", order: 0 }))
      .id;
    specBId = (await mkTemplate({ productId: productBId, slug: `${RUN}-spec-b` })).id;
    wrongKindId = (
      await mkTemplate({
        productId: productAId,
        slug: `${RUN}-wrong-kind`,
        kind: "CALENDAR_PHOTO_MONTH",
      })
    ).id;
    inactiveId = (
      await mkTemplate({ productId: productAId, slug: `${RUN}-inactive`, isActive: false })
    ).id;
    deletedId = (
      await mkTemplate({ productId: productAId, slug: `${RUN}-deleted`, deletedAt: new Date() })
    ).id;
  }, T);

  afterAll(async () => {
    const safe = (p: Promise<unknown>) => p.catch(() => {});
    await safe(
      prisma.design.deleteMany({ where: { productId: { in: [productAId, productBId] } } }),
    );
    await safe(
      prisma.personalizationTemplate.deleteMany({
        where: {
          OR: [{ productId: { in: [productAId, productBId] } }, { slug: { startsWith: RUN } }],
        },
      }),
    );
    await safe(prisma.product.deleteMany({ where: { id: { in: [productAId, productBId] } } }));
    await safe(prisma.category.deleteMany({ where: { id: categoryId } }));
  }, T);

  // ──────────── listTemplatesForKind — filtro mode + visibilidad ────────────

  describe("listTemplatesForKind", () => {
    it("por defecto solo EDITABLE: específicas del producto, aspect filtrado, sin PREMADE ni otro kind", async () => {
      const list = await listTemplatesForKind("PHOTO_PACK", {
        productId: productAId,
        productAspectRatio: "1:1",
      });
      const ids = list.map((t) => t.id);
      // Específica con aspect correcto: visible.
      expect(ids).toContain(specA1x1Id);
      // Aspect incorrecto (4:5 contra 1:1): fuera.
      expect(ids).not.toContain(specA4x5Id);
      // Hay específicas → las globales NO se mezclan (Ola 19).
      expect(ids).not.toContain(globEditId);
      // Inactiva, borrada y de otro kind: fuera.
      expect(ids).not.toContain(inactiveId);
      expect(ids).not.toContain(deletedId);
      expect(ids).not.toContain(wrongKindId);
    });

    it("sin específicas cae a las globales EDITABLES (la PREMADE no se cuela)", async () => {
      // Sin productId → solo globales.
      const list = await listTemplatesForKind("PHOTO_PACK");
      const ids = list.map((t) => t.id);
      expect(ids).toContain(globEditId);
      expect(ids).not.toContain(globPremadeId);
    });

    it("mode es opt-in: pidiendo PREMADE explícitamente sí la devuelve", async () => {
      const list = await listTemplatesForKind("PHOTO_PACK", { mode: "PREMADE" });
      const ids = list.map((t) => t.id);
      expect(ids).toContain(globPremadeId);
      expect(ids).not.toContain(globEditId);
    });
  });

  // ──────────── createDraftDesign — templateId explícito y default ────────────

  describe("createDraftDesign", () => {
    it("acepta una específica válida del producto y la fija como unitTemplate", async () => {
      const design = await createDraftDesign({
        productId: productAId,
        templateId: specA1x1Id,
        ...OWNER,
      });
      expect(design.templateId).toBe(specA1x1Id);
      const cd = design.canvasData as { unitTemplate: { stage: { width: number } } };
      expect(cd.unitTemplate.stage.width).toBe(1080);
    });

    it("acepta una global (productId null)", async () => {
      const design = await createDraftDesign({
        productId: productAId,
        templateId: globEditId,
        ...OWNER,
      });
      expect(design.templateId).toBe(globEditId);
    });

    it("rechaza PREMADE, otro kind, otro producto, inactiva, borrada e inexistente", async () => {
      const invalid = [
        globPremadeId, // mode PREMADE
        wrongKindId, // kind distinto al del producto
        specBId, // específica de OTRO producto
        inactiveId, // isActive=false
        deletedId, // deletedAt set
        `${RUN}-no-existe`,
      ];
      for (const templateId of invalid) {
        await expect(
          createDraftDesign({ productId: productAId, templateId, ...OWNER }),
        ).rejects.toThrow(/not available/);
      }
    });

    it("sin templateId arranca con la primera VISIBLE (aspect), no con la primera activa a secas", async () => {
      // specA4x5 tiene order 0 (ganaría sin filtro de aspect) pero es 4:5 contra
      // el 1:1 del producto → el draft debe arrancar con specA1x1 (order 1), la
      // misma plantilla que el cliente vería primera en el sidebar.
      const design = await createDraftDesign({ productId: productAId, ...OWNER });
      expect(design.templateId).toBe(specA1x1Id);
    });
  });

  // ──────────── saveCanvas — persistencia del cambio de plantilla ────────────

  describe("saveCanvas · templateId", () => {
    it("persiste una plantilla válida (global o del producto)", async () => {
      const design = await createDraftDesign({ productId: productAId, ...OWNER });
      const canvasData = design.canvasData as object;

      await saveCanvas({
        designId: design.id,
        canvasData: canvasData as never,
        templateId: globEditId,
        ...OWNER,
      });
      let row = await prisma.design.findUnique({
        where: { id: design.id },
        select: { templateId: true },
      });
      expect(row!.templateId).toBe(globEditId);

      await saveCanvas({
        designId: design.id,
        canvasData: canvasData as never,
        templateId: specA1x1Id,
        ...OWNER,
      });
      row = await prisma.design.findUnique({
        where: { id: design.id },
        select: { templateId: true },
      });
      expect(row!.templateId).toBe(specA1x1Id);
    });

    it("con templateId inválido guarda el canvas igual y CONSERVA el templateId anterior", async () => {
      const design = await createDraftDesign({ productId: productAId, ...OWNER });
      expect(design.templateId).toBe(specA1x1Id);

      const nuevoCanvas = { ...(design.canvasData as object), marca: RUN };
      await saveCanvas({
        designId: design.id,
        canvasData: nuevoCanvas as never,
        templateId: globPremadeId, // PREMADE → no pasa la validación
        ...OWNER,
      });
      const row = await prisma.design.findUnique({
        where: { id: design.id },
        select: { templateId: true, canvasData: true },
      });
      // El canvasData SÍ se guardó (el canvas es la SoT; el auto-save no se rompe).
      expect((row!.canvasData as { marca?: string }).marca).toBe(RUN);
      // …pero la FK informativa no quedó apuntando a una plantilla inválida.
      expect(row!.templateId).toBe(specA1x1Id);
    });

    it("sin templateId en el payload no toca Design.templateId", async () => {
      const design = await createDraftDesign({ productId: productAId, ...OWNER });
      await saveCanvas({ designId: design.id, canvasData: design.canvasData as never, ...OWNER });
      const row = await prisma.design.findUnique({
        where: { id: design.id },
        select: { templateId: true },
      });
      expect(row!.templateId).toBe(specA1x1Id);
    });
  });
});
