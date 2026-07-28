/*
 * Integración — certificación end-to-end de las FICHAS (letter tiles, Ola 2A + regla Ola 19).
 * Recorre el cableado real que usa el admin /admin/fichas y el Estudio:
 *
 *   createLetterSet (crear set) → uploadProductImage (subir PNG de prueba al bucket real)
 *   → upsertLetterTile (LetterTile en DB) → listLetterStyles / listLetterThemeOptions
 *   (lo que alimenta los chips del editor) → createLetterSetDesign con styleSetId+language
 *   (sobre el producto REAL "Pack Vocales") → finalizeDesign (preview + producción a Storage).
 *
 * REGLA OLA 19 que se certifica acá (antes este test esperaba el comportamiento viejo y
 * fallaba): el Estudio SOLO muestra sets con el alfabeto COMPLETO (27 fichas en "es");
 * un set incompleto se oculta del editor (se veía "roto": letras ilustradas mezcladas con
 * planas) pero SIGUE existiendo para el admin y para finalize. Por eso se crean DOS sets:
 *   - set incompleto (2 fichas: A, E) → NO aparece en listLetterStyles/ThemeOptions,
 *     pero sí en el grid del admin (getLetterSet) y sirve para el finalize de vocales.
 *   - set completo (27 fichas) → SÍ aparece en ambos listados del editor, con tiles
 *     mapeados por letra y URL pública servible (lo que el <img>/canvas necesita).
 *
 * Sin assets reales: las fichas son PNGs de color sólido generados con sharp. Todos los
 * fixtures llevan prefijo RUN único y se borran en afterAll (sets, tiles, diseño, objetos
 * de storage). Comparte la Supabase de dev; salta si faltan llaves (CI sin Supabase).
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import sharp from "sharp";
import { prisma } from "@/lib/db";
import { supabaseService } from "@/lib/supabase/service";
import { uploadProductImage } from "@/lib/storage";
import {
  ALPHABET,
  createLetterSet,
  upsertLetterTile,
  listLetterStyles,
  listLetterThemeOptions,
  getLetterSet,
  getLetterTilesForLanguage,
} from "./letter-tiles";
import { createLetterSetDesign, finalizeDesign } from "./service";

const RUN = `fichas${Date.now()}${Math.floor(Math.random() * 1e6)}`.toLowerCase();

// Alfabeto "es" (27 letras, incluye Ñ) — fuente única para el set completo y las aserciones.
const ES_ALPHABET = ALPHABET.es ?? [];

const strip = (v: string | undefined) => v?.replace(/^["']|["']$/g, "");
const canRunStorage = Boolean(
  strip(process.env.NEXT_PUBLIC_SUPABASE_URL) && strip(process.env.SUPABASE_SECRET_KEY),
);

const storageCleanup: { bucket: string; paths: string[] }[] = [];

let setId = "";
let fullSetId = "";
let designId = "";

/** PNG de color sólido 200×260 (ficha vertical de prueba). */
async function solidTile(hex: string): Promise<Buffer> {
  return sharp({ create: { width: 200, height: 260, channels: 3, background: hex } })
    .png()
    .toBuffer();
}

/** Sube una ficha de prueba al bucket real y la persiste (mismo path que uploadLetterTileAction). */
async function uploadAndPersistTile(
  targetSetId: string,
  char: string,
  hex: string,
): Promise<string> {
  const buf = await solidTile(hex);
  const file = new File([new Uint8Array(buf)], `${char}.png`, { type: "image/png" });
  const { path, publicUrl } = await uploadProductImage({ productId: targetSetId, file });
  await upsertLetterTile({
    setId: targetSetId,
    char,
    imageUrl: publicUrl,
    label: `Prueba ${char}`,
    adminId: `test-${RUN}`,
  });
  return path;
}

beforeAll(async () => {
  // 1) Set INCOMPLETO (2 fichas: A y E) — certifica la regla Ola 19 de ocultamiento.
  const set = await createLetterSet({
    name: `TEST ${RUN} · Español`,
    language: "es",
    adminId: `test-${RUN}`,
  });
  setId = set.id;
  const tilePaths: string[] = [];
  for (const [char, hex] of [
    ["A", "#5DD9D1"],
    ["E", "#E85B9F"],
  ] as const) {
    tilePaths.push(await uploadAndPersistTile(setId, char, hex));
  }
  storageCleanup.push({ bucket: "product-images", paths: tilePaths });

  // 2) Set COMPLETO (las 27 fichas del alfabeto "es") — certifica la exposición en el editor.
  const fullSet = await createLetterSet({
    name: `TEST ${RUN} Completo · Español`,
    language: "es",
    adminId: `test-${RUN}`,
  });
  fullSetId = fullSet.id;
  const palette = ["#5DD9D1", "#E85B9F", "#7C6AAD", "#FFD93D", "#FF8A5C", "#8BC34A"];
  const fullTilePaths: string[] = [];
  for (const [i, char] of ES_ALPHABET.entries()) {
    fullTilePaths.push(await uploadAndPersistTile(fullSetId, char, palette[i % palette.length]!));
  }
  storageCleanup.push({ bucket: "product-images", paths: fullTilePaths });
}, 180_000); // 29 uploads reales a Supabase Storage: el default de 10s no alcanza.

afterAll(async () => {
  const safe = (p: Promise<unknown>) => p.catch(() => {});
  for (const { bucket, paths } of storageCleanup) {
    await safe(supabaseService.storage.from(bucket).remove(paths));
  }
  if (designId) {
    await safe(prisma.design.deleteMany({ where: { id: designId } }));
  }
  for (const id of [setId, fullSetId]) {
    if (id) {
      await safe(prisma.letterTile.deleteMany({ where: { setId: id } }));
      await safe(prisma.letterTileSet.deleteMany({ where: { id } }));
    }
  }
});

describe.skipIf(!canRunStorage)("certificación fichas end-to-end (Ola 2A + Ola 19)", () => {
  it("el set incompleto existe con sus 2 fichas (admin grid)", async () => {
    const set = await getLetterSet(setId);
    expect(set).not.toBeNull();
    expect(set!.tiles.map((t) => t.char).sort()).toEqual(["A", "E"]);
  });

  it("listLetterStyles: oculta el set incompleto y expone el completo (regla Ola 19)", async () => {
    const styles = await listLetterStyles("es");
    // Incompleto (2/27): NO se ofrece en el editor (se vería roto).
    expect(styles.find((s) => s.id === setId)).toBeUndefined();
    // Completo (27/27): SÍ se ofrece, con las fichas mapeadas por letra.
    const full = styles.find((s) => s.id === fullSetId);
    expect(full).toBeDefined();
    expect(full!.tiles.A?.imageUrl).toContain("http");
    expect(full!.tiles.E?.label).toBe("Prueba E");
    expect(full!.tiles["Ñ"]?.imageUrl).toContain("http");
    // El fallback por idioma también lo puede resolver (default del idioma si aplica).
    const fallback = await getLetterTilesForLanguage("es");
    expect(typeof fallback).toBe("object");
  });

  it("listLetterThemeOptions: misma regla — solo el completo, con su conteo de fichas", async () => {
    const options = await listLetterThemeOptions("es");
    expect(options.find((o) => o.id === setId)).toBeUndefined();
    const full = options.find((o) => o.id === fullSetId);
    expect(full).toBeDefined();
    expect(full!.tileCount).toBe(ES_ALPHABET.length);
  });

  it("la URL pública de la ficha es servible (lo que el <img>/canvas del editor necesita)", async () => {
    const styles = await listLetterStyles("es");
    const url = styles.find((s) => s.id === fullSetId)!.tiles.A!.imageUrl;
    const res = await fetch(url);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("image");
  });

  it(
    "diseño de vocales con styleSetId + language → finalize (preview + producción en Storage)",
    { timeout: 60_000 },
    async () => {
      // Producto REAL Pack Vocales (compartido) + una variante activa suya.
      const product = await prisma.product.findUnique({
        where: { slug: "pack-vocales" },
        select: { id: true },
      });
      expect(product).not.toBeNull();
      const variant = await prisma.productVariant.findFirst({
        where: { productId: product!.id, isActive: true, deletedAt: null },
        select: { id: true },
      });
      expect(variant).not.toBeNull();

      const created = await createLetterSetDesign({
        productId: product!.id,
        variantId: variant!.id,
        frameTheme: "arcoiris",
        colors: ["#5DD9D1", "#E85B9F", "#7C6AAD", "#FFD93D", "#5DD9D1"],
        styleSetId: setId,
        language: "es",
        customerId: null,
        sessionId: `test-${RUN}`,
      });
      designId = created.id;
      // El diseño queda con las 5 vocales y el idioma del Estudio (no el de la variante).
      expect(created.letters).toEqual(["A", "E", "I", "O", "U"]);
      expect(created.language).toBe("es");
      const meta = await prisma.design.findUnique({
        where: { id: designId },
        select: { metadata: true },
      });
      expect((meta!.metadata as { styleSetId?: string }).styleSetId).toBe(setId);
      expect((meta!.metadata as { language?: string }).language).toBe("es");

      // Finalize: preview + producción (1 PNG, canvasData V1) a los buckets reales.
      const preview = await solidTile("#FFF8F0");
      storageCleanup.push({ bucket: "design-previews", paths: [`${designId}/preview.png`] });
      storageCleanup.push({ bucket: "production-assets", paths: [`${designId}/slot-01.png`] });
      const finalized = await finalizeDesign({
        designId,
        previewBuffer: preview,
        productionBuffers: [preview],
        customerId: null,
        sessionId: `test-${RUN}`,
      });
      expect(finalized.status).toBe("READY");
      expect(finalized.previewUrl).toContain("design-previews");
      expect(finalized.productionUrls).toHaveLength(1);

      // El preview quedó público (es el thumbnail que ve el carrito/cotización).
      const res = await fetch(finalized.previewUrl!);
      expect(res.status).toBe(200);
    },
  );
});
