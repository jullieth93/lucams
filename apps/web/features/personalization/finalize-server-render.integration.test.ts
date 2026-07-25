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
 *   2. El fallback — ningún tier reproduce el diseño (hoy solo la Polaroid, por su marco SVG con
 *      fuentes horneadas): el servidor emite URLs firmadas, el cliente sube DIRECTO a Storage (camino
 *      que no pasa por la Function y por tanto no tiene techo) y el finalize las recoge de ahí.
 *
 * ATENCIÓN: dev y producción comparten la MISMA Supabase. Cada diseño que se crea acá se borra en el
 * afterAll, junto con sus filas de assets y sus objetos de Storage.
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createClient } from "@supabase/supabase-js";
import { prisma } from "@/lib/db";
import { createClientSlotUploadTickets, finalizeDesign } from "./service";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SECRET_KEY!,
);

/** Todo lo que cree esta prueba lleva esta marca, para poder borrarlo sin tocar datos reales. */
const RUN = `itest-finalize-${Date.now()}`;
const OWNER = { customerId: null, sessionId: RUN };

const creados: string[] = [];

/** PNG 1×1 válido — sirve como snapshot del cliente en el camino de fallback. */
const PNG_1X1 = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);

/**
 * Clona un diseño REAL de la base (con sus fotos ya subidas) a un borrador nuestro. Partir de datos
 * reales es lo que da valor a la prueba: los assets existen en Storage y el render server-side tiene
 * material de verdad que componer.
 */
async function clonarBorradorReal(slug: string): Promise<string | null> {
  const product = await prisma.product.findFirst({ where: { slug }, select: { id: true } });
  if (!product) return null;

  const candidatos = await prisma.design.findMany({
    where: { productId: product.id },
    orderBy: { updatedAt: "desc" },
    take: 60,
    select: { id: true, canvasData: true, templateId: true, metadata: true },
  });
  const origen = candidatos.find((d) => {
    const cd = d.canvasData as { version?: number; slots?: { assetId?: string }[] } | null;
    return cd?.version === 2 && !!cd.slots?.length && cd.slots.every((s) => !!s.assetId);
  });
  if (!origen) return null;

  const assets = await prisma.designAsset.findMany({ where: { designId: origen.id } });
  if (assets.length === 0) return null;

  const clon = await prisma.design.create({
    data: {
      productId: product.id,
      templateId: origen.templateId,
      sessionId: RUN,
      status: "DRAFT",
      canvasData: origen.canvasData as never,
      metadata: (origen.metadata ?? undefined) as never,
    },
    select: { id: true },
  });
  creados.push(clon.id);

  // Filas de asset nuevas apuntando al MISMO objeto de Storage (solo se lee), y se remapean los
  // assetId del canvas a los ids nuevos — igual que hace cloneDesignToDraft en el servicio.
  const mapa = new Map<string, string>();
  for (const a of assets) {
    const nuevo = await prisma.designAsset.create({
      data: {
        designId: clon.id,
        storageUrl: a.storageUrl,
        mimeType: a.mimeType,
        sizeBytes: a.sizeBytes,
        width: a.width,
        height: a.height,
      },
      select: { id: true },
    });
    mapa.set(a.id, nuevo.id);
  }
  const cd = origen.canvasData as { slots: { assetId?: string }[] };
  const remapeado = {
    ...(origen.canvasData as object),
    slots: cd.slots.map((s) => ({
      ...s,
      assetId: s.assetId ? (mapa.get(s.assetId) ?? s.assetId) : s.assetId,
    })),
  };
  await prisma.design.update({ where: { id: clon.id }, data: { canvasData: remapeado as never } });

  return clon.id;
}

beforeAll(() => {
  if (!process.env.SUPABASE_SECRET_KEY) throw new Error("falta SUPABASE_SECRET_KEY");
});

afterAll(async () => {
  for (const id of creados) {
    // Storage primero: si falla el borrado de las filas, al menos no quedan archivos huérfanos.
    for (const bucket of ["production-assets", "design-previews"]) {
      const { data } = await supabase.storage.from(bucket).list(id);
      if (data?.length) {
        await supabase.storage.from(bucket).remove(data.map((f) => `${id}/${f.name}`));
      }
      const { data: staged } = await supabase.storage.from(bucket).list(`${id}/_client`);
      if (staged?.length) {
        await supabase.storage.from(bucket).remove(staged.map((f) => `${id}/_client/${f.name}`));
      }
    }
    await prisma.designAsset.deleteMany({ where: { designId: id } });
    await prisma.design.delete({ where: { id } }).catch(() => undefined);
  }
  // Red de seguridad: nada con nuestra marca puede sobrevivir a la prueba.
  const restos = await prisma.design.findMany({ where: { sessionId: RUN }, select: { id: true } });
  for (const r of restos) {
    await prisma.designAsset.deleteMany({ where: { designId: r.id } });
    await prisma.design.delete({ where: { id: r.id } }).catch(() => undefined);
  }
});

describe("finalizeDesign — el cliente ya no manda los PNG de imprenta", () => {
  it("camino normal: el servidor renderiza y el diseño queda READY sin recibir un solo blob", async () => {
    const designId = await clonarBorradorReal("separadores-libros");
    // Omitir en silencio sería fingir cobertura — justo lo que dejó vivir este bug meses.
    expect(designId, "no hay ningún diseño real de separadores-libros que clonar").toBeTruthy();

    const design = await finalizeDesign({
      designId: designId!,
      previewBuffer: PNG_1X1,
      // productionBuffers ausente A PROPÓSITO: eso es lo que se está probando.
      ...OWNER,
    });

    expect(design.status).toBe("READY");
    expect(design.productionUrls.length).toBeGreaterThan(0);
    expect(design.previewUrl).toBeTruthy();

    // Y los archivos existen de verdad en Storage, no solo la fila en la base.
    const { data: files } = await supabase.storage.from("production-assets").list(designId!);
    const png = (files ?? []).filter((f) => f.name.endsWith(".png"));
    expect(png.length).toBe(design.productionUrls.length);
  }, 600_000);

  it("fallback: si ningún tier puede renderizar, se piden los PNG al cliente y suben por Storage", async () => {
    const designId = await clonarBorradorReal("set-fotoimanes-polaroid");
    expect(
      designId,
      "no hay ningún diseño real de set-fotoimanes-polaroid que clonar",
    ).toBeTruthy();

    // 1) Sin blobs y sin render posible → el servicio lo dice con un error reconocible.
    await expect(
      finalizeDesign({ designId: designId!, previewBuffer: PNG_1X1, ...OWNER }),
    ).rejects.toThrow(/NEEDS_CLIENT_SLOTS/);

    // El diseño NO puede haberse quedado a medias.
    const trasFallo = await prisma.design.findUnique({
      where: { id: designId! },
      select: { status: true },
    });
    expect(trasFallo?.status).toBe("DRAFT");

    // 2) URLs firmadas de subida, una por slot.
    const tickets = await createClientSlotUploadTickets({ designId: designId!, ...OWNER });
    const cd = (await prisma.design.findUnique({
      where: { id: designId! },
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
      expect(res.ok, `subida del slot ${t.slotIndex + 1}: ${res.status} ${await res.text()}`).toBe(
        true,
      );
    }

    // 4) Segunda pasada: el servidor los recoge del área de paso.
    const design = await finalizeDesign({
      designId: designId!,
      previewBuffer: PNG_1X1,
      useStagedClientSlots: true,
      ...OWNER,
    });
    expect(design.status).toBe("READY");
    expect(design.productionUrls.length).toBe(cd.slotCount);

    // 5) El área de paso queda limpia: los definitivos son los que sube finalizeDesign.
    const { data: staged } = await supabase.storage
      .from("production-assets")
      .list(`${designId!}/_client`);
    expect(staged ?? []).toHaveLength(0);
  }, 600_000);

  it("no emite URLs de subida para un diseño ajeno", async () => {
    const designId = await clonarBorradorReal("set-fotoimanes-polaroid");
    expect(designId).toBeTruthy();
    await expect(
      createClientSlotUploadTickets({
        designId: designId!,
        customerId: null,
        sessionId: `${RUN}-otra-sesion`,
      }),
    ).rejects.toThrow(/not owned/i);
  }, 600_000);
});
