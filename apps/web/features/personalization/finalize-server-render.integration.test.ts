/*
 * El finalize del Estudio, de punta a punta y contra Supabase de verdad (ADR-081).
 *
 * Por qué existe. Durante meses el Estudio no funcionó en producción y ninguna prueba lo detectó: el
 * cliente generaba los N PNG de imprenta y los mandaba en el body de la Server Action —hasta ~57 MB en
 * un calendario de 12 páginas— contra el techo de 4.5 MB que Vercel impone al body de una Function
 * (https://vercel.com/docs/functions/limitations, consulta 2026-07-25). El 413 vuelve como HTML, el
 * runtime de Next no lo sabe leer y el cliente veía "An unexpected response was received from the
 * server". En local nunca pasó porque el server de dev no tiene ese techo. La lección es que esto solo
 * se prueba de verdad ejerciendo el camino completo: render server-side, subida a Storage y READY.
 *
 * Se cubren los DOS caminos:
 *   1. El normal — el servidor renderiza los PNG y el cliente no manda ninguno.
 *   2. El fallback — NINGÚN tier server-side logra renderizar el diseño: el servidor emite URLs
 *      firmadas, el cliente sube DIRECTO a Storage (camino que no pasa por la Function y por tanto
 *      no tiene techo) y el finalize las recoge de ahí. El test lo fuerza con `vi.mock` sobre los
 *      DOS motores de render (sharp y canvas): la premisa vieja —"la Polaroid no es renderizable
 *      en servidor por su marco SVG con fuentes horneadas"— quedó obsoleta cuando el tier canvas
 *      aprendió a hornear el marco (service.ts, rama "con marco"), y sin forzar el fallo este
 *      test quedó rojo fijo (detectado 2026-09-11).
 *
 * AUTOCONTENIDA (A11-05, remediación R3 2026-09-26): antes clonaba diseños REALES de la
 * base compartida de dev (productos separadores-magneticos / set-fotoimanes-polaroid con
 * fotos ya subidas) — data construida por decenas de scripts históricos, irreproducible
 * en un stack limpio, y por eso estaba excluida de TODO pipeline (NIGHTLY_LOCALSTACK en
 * vitest.config.ts). Ahora siembra TODO lo que necesita en el beforeAll: categoría +
 * producto photo-pack efímeros, 2 PNG subidos a customer-uploads y, por caso, un Design
 * DRAFT con canvasData V2 + DesignAssets propios que apuntan a esos PNG. Corre contra
 * cualquier stack con Supabase real (nightly localstack incluido); salta limpio sin llaves.
 *
 * Cada diseño que se crea acá se borra en el afterAll, junto con sus filas de assets,
 * sus objetos de Storage y el producto/categoría fixture.
 */

import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { prisma } from "@/lib/db";
import { createClientSlotUploadTickets, finalizeDesign } from "./service";

/*
 * Interruptor del test de fallback: con `failAll` activo, AMBOS motores de render
 * server-side fallan (el sharp se declara incapaz como con una plantilla con texto
 * —RenderNeedsKonvaError real, para que el servicio caiga al tier canvas— y el
 * canvas lanza). Así se ejerce el camino REAL del fallback de forma determinista;
 * con el flag apagado los módulos delegan al motor verdadero y el resto de tests
 * del archivo corren el render completo contra Storage.
 * `attempts` cuenta las llamadas interceptadas: prueba de que el NEEDS_CLIENT_SLOTS
 * vino de motores que se INTENTARON y fallaron, no de otro camino.
 */
const renderControl = vi.hoisted(() => ({ failAll: false, attempts: 0 }));

vi.mock("./production-render", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./production-render")>();
  return {
    ...actual,
    renderProductionSlots: async (...args: Parameters<typeof actual.renderProductionSlots>) => {
      if (renderControl.failAll) {
        renderControl.attempts += 1;
        throw new actual.RenderNeedsKonvaError("forzado por el test: tier sharp fuera de juego");
      }
      return actual.renderProductionSlots(...args);
    },
  };
});

vi.mock("./production-render-canvas", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./production-render-canvas")>();
  return {
    ...actual,
    renderProductionSlotsCanvas: async (
      ...args: Parameters<typeof actual.renderProductionSlotsCanvas>
    ) => {
      if (renderControl.failAll) {
        renderControl.attempts += 1;
        throw new Error("forzado por el test: tier canvas fuera de juego");
      }
      return actual.renderProductionSlotsCanvas(...args);
    },
  };
});

/*
 * En CI las vars de Supabase van vacías A PROPÓSITO (ci.yml: los tests que exigen Supabase
 * real se saltan ahí) y esta prueba se salta entera — ejerce Storage de verdad y no hay
 * cómo fingirlo. En local corre siempre (.env.local vía tests/setup-env.ts), y si ahí
 * falta la llave el beforeAll falla en voz alta: omitir en silencio sería fingir cobertura.
 */
const HAS_SUPABASE = !!(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SECRET_KEY);
const SKIP = !HAS_SUPABASE && process.env.CI === "true";

// Cliente perezoso: crearlo al importar el módulo reventaba la recolección de vitest en CI.
let supabase: SupabaseClient;

/** Todo lo que cree esta prueba lleva esta marca, para poder borrarlo sin tocar datos reales. */
const RUN = `itest-finalize-${Date.now()}`;
const OWNER = { customerId: null, sessionId: RUN };

const creados: string[] = [];

/** PNG 1×1 válido — sirve como snapshot del cliente en el camino de fallback. */
const PNG_1X1 = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);

/** Fixture efímero: producto photo-pack + categoría, y los paths de las 2 fotos subidas. */
let productId = "";
let categoryId = "";
const assetPaths: string[] = [];

/**
 * Crea un borrador PROPIO, renderizable en servidor: canvasData V2 con una
 * unitTemplate solo-foto embebida (background + un image-placeholder que cubre el
 * stage — la forma mínima que el tier sharp reproduce con fidelidad, ver
 * production-render.ts assertServerRenderable) y 2 slots con assetIds de filas
 * DesignAsset NUEVAS que apuntan a los PNG subidos en el beforeAll (el mismo
 * patrón de cloneDesignToDraft: el objeto de Storage se comparte, solo se lee).
 */
async function crearBorradorPropio(): Promise<string> {
  const clon = await prisma.design.create({
    data: {
      productId,
      templateId: null,
      sessionId: RUN,
      status: "DRAFT",
      canvasData: {},
      metadata: { kind: "PHOTO_PACK", surface: "photo", schemaVersion: 2 },
    },
    select: { id: true },
  });
  creados.push(clon.id);

  const assetIds: string[] = [];
  for (const path of assetPaths) {
    const asset = await prisma.designAsset.create({
      data: {
        designId: clon.id,
        sessionId: RUN,
        storageUrl: path,
        mimeType: "image/png",
        sizeBytes: PNG_1X1.length,
        width: 1,
        height: 1,
      },
      select: { id: true },
    });
    assetIds.push(asset.id);
  }

  const canvasData = {
    version: 2,
    slotCount: assetIds.length,
    unitTemplate: {
      version: 1,
      stage: { width: 300, height: 300 },
      layers: [
        { id: "bg", type: "background", color: "#FFFFFF" },
        { id: "ph", type: "image-placeholder", x: 0, y: 0, width: 300, height: 300 },
      ],
    },
    slots: assetIds.map((assetId, i) => ({
      slotIndex: i,
      assetId,
      // assetUrl solo se exige truthy en la validación de finalize (INCOMPLETE_SLOTS);
      // el render server-side resuelve los bytes por assetId → DesignAsset.storageUrl.
      assetUrl: assetPaths[i],
      photoTransform: { offsetX: 0, offsetY: 0, scale: 1 },
    })),
  };
  await prisma.design.update({
    where: { id: clon.id },
    data: { canvasData: canvasData as never },
  });

  return clon.id;
}

beforeAll(async () => {
  if (SKIP) return;
  if (!process.env.SUPABASE_SECRET_KEY) throw new Error("falta SUPABASE_SECRET_KEY");
  supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY);

  // Fixture autocontenido: las 2 fotos del pack subidas al bucket real
  // (customer-uploads — el mismo del que loadAsset descarga en el finalize).
  for (let i = 0; i < 2; i++) {
    const path = `${RUN}/asset-${i}.png`;
    const { error } = await supabase.storage
      .from("customer-uploads")
      .upload(path, PNG_1X1, { contentType: "image/png" });
    if (error) throw new Error(`no se pudo subir la foto fixture ${path}: ${error.message}`);
    assetPaths.push(path);
  }

  // Producto photo-pack efímero: el schema declara 2 slots (el cap de tickets de
  // createClientSlotUploadTickets sale de acá, no del canvas) y forma rectangle
  // (nada de heart/circle → el tier sharp la reproduce sin caer al canvas).
  const category = await prisma.category.create({
    data: { slug: `${RUN}-cat`, name: `TEST ${RUN} Categoría` },
  });
  categoryId = category.id;
  const product = await prisma.product.create({
    data: {
      slug: `${RUN}-fotopack`,
      name: `TEST ${RUN} Foto Pack`,
      description: "Fixture efímero del test de finalize server-render (autocontenido).",
      basePrice: 1_000_000,
      sku: `${RUN}-FP`.toUpperCase(),
      categoryId,
      isPersonalizable: true,
      personalizationKind: "PHOTO_PACK",
      personalizationSchema: { photoSlots: 2, shape: "rectangle", allowText: false },
      variants: {
        create: [{ name: "Default", sku: `${RUN}-FP-D`.toUpperCase(), stock: 100, attributes: {} }],
      },
    },
  });
  productId = product.id;
}, 120_000);

/*
 * La limpieza lleva timeout EXPLÍCITO y generoso. El de vitest son 10 s, y con varios diseños —cada
 * uno con dos listados de Storage por bucket— se agota: el hook muere a medias, la prueba "pasa" y
 * quedan filas de prueba en la tienda EN VIVO, que es la misma base. Un afterAll que no alcanza a
 * terminar es peor que uno que falla.
 */
afterAll(async () => {
  if (SKIP) return;
  // Los diseños se limpian en paralelo: en serie el tiempo crece con cada caso nuevo.
  await Promise.all(
    creados.map(async (id) => {
      // Storage primero: si falla el borrado de las filas, al menos no quedan archivos huérfanos.
      for (const bucket of ["production-assets", "design-previews"]) {
        for (const prefix of [id, `${id}/_client`]) {
          const { data } = await supabase.storage.from(bucket).list(prefix);
          if (data?.length) {
            await supabase.storage.from(bucket).remove(data.map((f) => `${prefix}/${f.name}`));
          }
        }
      }
      await prisma.designAsset.deleteMany({ where: { designId: id } });
      await prisma.design.delete({ where: { id } }).catch(() => undefined);
    }),
  );
  // Red de seguridad: nada con nuestra marca puede sobrevivir a la prueba.
  const restos = await prisma.design.findMany({ where: { sessionId: RUN }, select: { id: true } });
  for (const r of restos) {
    await prisma.designAsset.deleteMany({ where: { designId: r.id } });
    await prisma.design.delete({ where: { id: r.id } }).catch(() => undefined);
  }
  expect(await prisma.design.count({ where: { sessionId: RUN } })).toBe(0);
  // Fotos fixture de customer-uploads y producto/categoría propios.
  if (assetPaths.length > 0) {
    await supabase.storage
      .from("customer-uploads")
      .remove(assetPaths)
      .catch(() => undefined);
  }
  if (productId) {
    await prisma.productVariant.deleteMany({ where: { productId } }).catch(() => undefined);
    await prisma.product.deleteMany({ where: { id: productId } }).catch(() => undefined);
  }
  if (categoryId) {
    await prisma.category.deleteMany({ where: { id: categoryId } }).catch(() => undefined);
  }
}, 180_000);

describe.skipIf(SKIP)("finalizeDesign — el cliente ya no manda los PNG de imprenta", () => {
  it("camino normal: el servidor renderiza y el diseño queda READY sin recibir un solo blob", async () => {
    const designId = await crearBorradorPropio();

    const design = await finalizeDesign({
      designId,
      previewBuffer: PNG_1X1,
      // productionBuffers ausente A PROPÓSITO: eso es lo que se está probando.
      ...OWNER,
    });

    expect(design.status).toBe("READY");
    expect(design.productionUrls.length).toBeGreaterThan(0);
    expect(design.previewUrl).toBeTruthy();

    // Y los archivos existen de verdad en Storage, no solo la fila en la base.
    const { data: files } = await supabase.storage.from("production-assets").list(designId);
    const png = (files ?? []).filter((f) => f.name.endsWith(".png"));
    expect(png.length).toBe(design.productionUrls.length);
  }, 600_000);

  it("fallback: si ningún tier puede renderizar, se piden los PNG al cliente y suben por Storage", async () => {
    const designId = await crearBorradorPropio();

    // Forzar el fallo de TODOS los tiers de render server (ver el comentario de
    // renderControl arriba): el fixture ES renderizable en servidor, así que
    // el "no se puede" del escenario lo ponen los mocks, no el diseño elegido.
    renderControl.failAll = true;
    renderControl.attempts = 0;
    try {
      // 1) Sin blobs y sin render posible → el servicio lo dice con un error reconocible.
      await expect(finalizeDesign({ designId, previewBuffer: PNG_1X1, ...OWNER })).rejects.toThrow(
        /NEEDS_CLIENT_SLOTS/,
      );

      // Los motores se INTENTARON y fallaron — si attempts fuera 0, el error
      // vendría de otro lado y el test no estaría probando el fallback.
      expect(renderControl.attempts).toBeGreaterThan(0);

      // El diseño NO puede haberse quedado a medias.
      const trasFallo = await prisma.design.findUnique({
        where: { id: designId },
        select: { status: true },
      });
      expect(trasFallo?.status).toBe("DRAFT");

      // 2) URLs firmadas de subida, una por slot.
      const tickets = await createClientSlotUploadTickets({ designId, ...OWNER });
      const cd = (await prisma.design.findUnique({
        where: { id: designId },
        select: { canvasData: true },
      }))!.canvasData as { slotCount: number };
      expect(tickets.length).toBe(cd.slotCount);

      // 3) El navegador sube DIRECTO a Storage — este es el camino sin techo de 4.5 MB.
      for (const t of tickets) {
        const res = await fetch(t.url, {
          method: "PUT",
          headers: { "content-type": "image/png", "cache-control": "max-age=3600" },
          body: new Uint8Array(PNG_1X1),
        });
        expect(
          res.ok,
          `subida del slot ${t.slotIndex + 1}: ${res.status} ${await res.text()}`,
        ).toBe(true);
      }

      // 4) Segunda pasada: el servidor vuelve a intentar el render (sigue
      // fallando, por eso importa) y recoge los blobs del área de paso.
      const design = await finalizeDesign({
        designId,
        previewBuffer: PNG_1X1,
        useStagedClientSlots: true,
        ...OWNER,
      });
      expect(design.status).toBe("READY");
      expect(design.productionUrls.length).toBe(cd.slotCount);

      // 5) El área de paso queda limpia: los definitivos son los que sube finalizeDesign.
      const { data: staged } = await supabase.storage
        .from("production-assets")
        .list(`${designId}/_client`);
      expect(staged ?? []).toHaveLength(0);
    } finally {
      renderControl.failAll = false;
    }
  }, 600_000);

  /*
   * El callejón sin salida: si el finalize pasa pero el CARRITO falla, el diseño queda READY. Antes
   * el reintento moría con «Design is READY — only DRAFT can be finalized» y no había forma de
   * completar la compra. Como un READY ya no se puede editar, re-finalizarlo debe ser un no-op.
   */
  it("finalizar dos veces es idempotente: el segundo intento no rompe el reintento del carrito", async () => {
    const designId = await crearBorradorPropio();

    const primero = await finalizeDesign({
      designId,
      previewBuffer: PNG_1X1,
      ...OWNER,
    });
    expect(primero.status).toBe("READY");

    const segundo = await finalizeDesign({
      designId,
      previewBuffer: PNG_1X1,
      ...OWNER,
    });
    expect(segundo.status).toBe("READY");
    expect(segundo.productionUrls).toEqual(primero.productionUrls);
  }, 600_000);

  /*
   * `canvasData.slotCount` lo escribe el propio cliente y el esquema solo lo topa en 50: sin
   * contrastarlo contra el producto, pedir el fallback regalaba hasta 50 permisos de escritura.
   */
  it("no emite más URLs de subida que piezas admite el producto", async () => {
    const designId = await crearBorradorPropio();

    const d = await prisma.design.findUnique({
      where: { id: designId },
      select: { canvasData: true },
    });
    const cd = d!.canvasData as Record<string, unknown>;
    // El cliente infla el contador a 50 (el máximo que deja pasar el esquema).
    await prisma.design.update({
      where: { id: designId },
      data: { canvasData: { ...cd, slotCount: 50 } as never },
    });

    await expect(createClientSlotUploadTickets({ designId, ...OWNER })).rejects.toThrow(/admite/i);
  }, 600_000);

  it("no emite URLs de subida para un diseño ajeno", async () => {
    const designId = await crearBorradorPropio();
    await expect(
      createClientSlotUploadTickets({
        designId,
        customerId: null,
        sessionId: `${RUN}-otra-sesion`,
      }),
    ).rejects.toThrow(/not owned/i);
  }, 600_000);
});
