/*
 * Integración — certificación end-to-end de las FICHAS (letter tiles, Ola 2A).
 * Recorre el cableado real que usa el admin /admin/fichas y el Estudio:
 *
 *   createLetterSet (crear set) → uploadProductImage (subir PNG de prueba al bucket real)
 *   → upsertLetterTile (LetterTile en DB) → listLetterStyles / listLetterThemeOptions
 *   (lo que alimenta los chips del editor) → createLetterSetDesign con styleSetId+language
 *   (sobre el producto REAL "Pack Vocales") → finalizeDesign (preview + producción a Storage).
 *
 * Sin assets reales: las fichas son PNGs de color sólido generados con sharp. Todos los
 * fixtures llevan prefijo RUN único y se borran en afterAll (set, tiles, diseño, objetos
 * de storage). Comparte la Supabase de dev; salta si faltan llaves (CI sin Supabase).
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import sharp from "sharp";
import { prisma } from "@/lib/db";
import { supabaseService } from "@/lib/supabase/service";
import { uploadProductImage } from "@/lib/storage";
import {
  createLetterSet,
  upsertLetterTile,
  listLetterStyles,
  listLetterThemeOptions,
  getLetterSet,
  getLetterTilesForLanguage,
} from "./letter-tiles";
import { createLetterSetDesign, finalizeDesign } from "./service";

const RUN = `fichas${Date.now()}${Math.floor(Math.random() * 1e6)}`.toLowerCase();

const strip = (v: string | undefined) => v?.replace(/^["']|["']$/g, "");
const canRunStorage = Boolean(
  strip(process.env.NEXT_PUBLIC_SUPABASE_URL) && strip(process.env.SUPABASE_SECRET_KEY),
);

const storageCleanup: { bucket: string; paths: string[] }[] = [];

let setId = "";
let designId = "";
const tilePaths: string[] = [];

/** PNG de color sólido 200×260 (ficha vertical de prueba). */
async function solidTile(hex: string): Promise<Buffer> {
  return sharp({ create: { width: 200, height: 260, channels: 3, background: hex } })
    .png()
    .toBuffer();
}

beforeAll(async () => {
  // 1) Crear el set de prueba (misma función que createLetterSetAction del admin).
  const set = await createLetterSet({
    name: `TEST ${RUN} · Español`,
    language: "es",
    adminId: `test-${RUN}`,
  });
  setId = set.id;

  // 2) Subir 2 fichas (A y E) al bucket real — mismo path que uploadLetterTileAction.
  for (const [char, hex] of [
    ["A", "#5DD9D1"],
    ["E", "#E85B9F"],
  ] as const) {
    const buf = await solidTile(hex);
    const file = new File([new Uint8Array(buf)], `${char}.png`, { type: "image/png" });
    const { path, publicUrl } = await uploadProductImage({ productId: setId, file });
    tilePaths.push(path);
    // 3) Persistir la ficha en DB (misma función que el admin action).
    await upsertLetterTile({
      setId,
      char,
      imageUrl: publicUrl,
      label: `Prueba ${char}`,
      adminId: `test-${RUN}`,
    });
  }
  storageCleanup.push({ bucket: "product-images", paths: tilePaths });
});

afterAll(async () => {
  const safe = (p: Promise<unknown>) => p.catch(() => {});
  for (const { bucket, paths } of storageCleanup) {
    await safe(supabaseService.storage.from(bucket).remove(paths));
  }
  if (designId) {
    await safe(prisma.design.deleteMany({ where: { id: designId } }));
  }
  if (setId) {
    await safe(prisma.letterTile.deleteMany({ where: { setId } }));
    await safe(prisma.letterTileSet.deleteMany({ where: { id: setId } }));
  }
});

describe.skipIf(!canRunStorage)("certificación fichas end-to-end (Ola 2A)", () => {
  it("el set de prueba existe con sus 2 fichas (admin grid)", async () => {
    const set = await getLetterSet(setId);
    expect(set).not.toBeNull();
    expect(set!.tiles.map((t) => t.char).sort()).toEqual(["A", "E"]);
  });

  it("listLetterStyles lo expone al editor con las fichas mapeadas por letra", async () => {
    const styles = await listLetterStyles("es");
    const mine = styles.find((s) => s.id === setId);
    expect(mine).toBeDefined();
    expect(mine!.tiles.A?.imageUrl).toContain("http");
    expect(mine!.tiles.E?.label).toBe("Prueba E");
    // El fallback por idioma también lo puede resolver (default del idioma si aplica).
    const fallback = await getLetterTilesForLanguage("es");
    expect(typeof fallback).toBe("object");
  });

  it("listLetterThemeOptions lo incluye con su conteo de fichas (selector de tema Ola 2A)", async () => {
    const options = await listLetterThemeOptions("es");
    const mine = options.find((o) => o.id === setId);
    expect(mine).toBeDefined();
    expect(mine!.tileCount).toBe(2);
  });

  it("la URL pública de la ficha es servible (lo que el <img>/canvas del editor necesita)", async () => {
    const styles = await listLetterStyles("es");
    const url = styles.find((s) => s.id === setId)!.tiles.A!.imageUrl;
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
