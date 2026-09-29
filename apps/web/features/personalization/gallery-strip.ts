/*
 * Galería de diseños prediseñados — subida de UNA SOLA imagen con AMBAS caras
 * (formato imprenta/doblez "cabezas al doblez", igual que la tira que compone
 * bookmark-strips.ts para producción):
 *
 *   ┌───────────┐
 *   │  B (↑180°)│  ← mitad SUPERIOR = cara B, ROTADA 180° en la imagen fuente
 *   ├─ doblez ──┤
 *   │  A (0°)   │  ← mitad INFERIOR = cara A, orientación normal
 *   └───────────┘
 *
 * Al subirla, el admin la parte a la mitad vertical:
 *   - imageUrl  = mitad inferior TAL CUAL (cara A).
 *   - imageUrlB = mitad superior ROTADA 180° (normalizada: el Estudio la muestra
 *     derecha y producción la vuelve a rotar en composeFaceStrips, como ya hace).
 *
 * Validación de proporción: la tira debe ser VERTICAL y su alto/2 debe ser
 * coherente con alguna de las caras esperadas del producto (sus variantes con
 * attrs.sizeCm — ej. separadores 2×6 → tira 2×12, ratio 6; 4×4.2 → 4×8.4,
 * ratio 2.1). Si no cuadra con ninguna, se rechaza con un error amable que
 * sugiere subir por caras (flujo por caras intacto).
 */

import "server-only";
import sharp from "./sharp-safe";
import { prisma } from "@/lib/db";
import { parseVariantAttributes } from "@/features/products/variant-schemas";
import { resolvePersonalizationSurface } from "./surface";

/** Tolerancia relativa de la proporción alto/ancho de la tira (±8%). */
const STRIP_RATIO_TOLERANCE = 0.08;

export type StripExpectation = {
  /** sizeCm de la CARA tal como lo declara la variante ("2×6", "4×4.2"). */
  sizeCm: string;
  /** Proporción esperada de la tira desplegada: (2 × lado mayor) / lado menor. */
  ratio: number;
};

export class GalleryStripError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GalleryStripError";
  }
}

/**
 * Proporciones de tira esperadas para un tag de galería, derivadas de las
 * variantes activas del producto que resuelve ese tag (misma resolución que
 * listGalleryTagOptions: galleryTag explícito o, sin él, el slug si la
 * superficie del Estudio es de foto). Si el producto tiene UN solo tamaño,
 * la validación es contra ese único ratio. [] si el tag no resuelve producto
 * o sus variantes no declaran sizeCm.
 */
export async function getGalleryStripExpectations(tag: string): Promise<StripExpectation[]> {
  const products = await prisma.product.findMany({
    where: { isActive: true, deletedAt: null },
    select: {
      slug: true,
      personalizationKind: true,
      personalizationSchema: true,
      variants: {
        where: { isActive: true },
        select: { attributes: true },
      },
    },
  });
  for (const p of products) {
    const schema = p.personalizationSchema as { galleryTag?: unknown } | null;
    const explicit = typeof schema?.galleryTag === "string" ? schema.galleryTag : null;
    const resolved =
      explicit ??
      (resolvePersonalizationSurface(
        p.personalizationKind,
        p.personalizationSchema as Record<string, unknown> | null,
      ).surface === "photo"
        ? p.slug
        : null);
    if (resolved !== tag) continue;
    const seen = new Set<string>();
    const out: StripExpectation[] = [];
    for (const v of p.variants) {
      const sizeCm = parseVariantAttributes(v.attributes).sizeCm;
      if (!sizeCm || seen.has(sizeCm)) continue;
      const ratio = stripRatioOfFaceSize(sizeCm);
      if (ratio === null) continue;
      seen.add(sizeCm);
      out.push({ sizeCm, ratio });
    }
    return out;
  }
  return [];
}

/**
 * Proporción de la tira desplegada para un sizeCm de cara ("2×6" → 2×12 → 6;
 * "4×4.2" → 4×8.4 → 2.1). Misma geometría que deployedSizeCm del Estudio:
 * el doblez parte la dimensión larga → al desplegar se duplica la mayor.
 * null si no parsea.
 */
export function stripRatioOfFaceSize(sizeCm: string): number | null {
  const m = sizeCm.match(/(\d+(?:[.,]\d+)?)\s*[×x]\s*(\d+(?:[.,]\d+)?)/i);
  if (!m) return null;
  const a = parseFloat(m[1]!.replace(",", "."));
  const b = parseFloat(m[2]!.replace(",", "."));
  if (!(a > 0) || !(b > 0)) return null;
  return (2 * Math.max(a, b)) / Math.min(a, b);
}

export type StripSplitResult = {
  /** Cara A (mitad inferior, orientación normal) en WebP. */
  faceA: Buffer;
  /** Cara B (mitad superior, ya rotada 180° para normalizarla) en WebP. */
  faceB: Buffer;
  width: number;
  /** Alto de CADA cara (la mitad de la tira). */
  faceHeight: number;
  /** sizeCm de la cara contra la que validó la proporción. */
  matchedSizeCm: string;
};

/**
 * Parte la tira vertical a la mitad y normaliza ambas caras. Lanza
 * GalleryStripError con mensaje amable (es-CO) si la imagen no es una tira
 * vertical coherente con las proporciones esperadas del producto.
 *
 * `swapFaces`: para diseños que vienen al revés (cara A arriba). Intercambia
 * qué mitad alimenta cada cara ANTES de normalizar la rotación.
 */
export async function splitGalleryStripImage(input: {
  buffer: Buffer;
  expected: StripExpectation[];
  swapFaces?: boolean;
}): Promise<StripSplitResult> {
  // Auto-orient por EXIF antes de medir (una foto exportada con orientación
  // 90° se mediría "acostada" y se rechazaría por error).
  let normalized: Buffer;
  let w: number;
  let h: number;
  try {
    const out = await sharp(input.buffer).rotate().toBuffer({ resolveWithObject: true });
    normalized = out.data;
    w = out.info.width;
    h = out.info.height;
  } catch {
    throw new GalleryStripError("No pudimos leer la imagen. ¿Está completa y sin daños?");
  }

  if (w <= 0 || h <= 0 || h <= w) {
    throw new GalleryStripError(
      "La imagen debe ser una tira VERTICAL (más alta que ancha): la cara A abajo y la cara B arriba, cabeza abajo. Si tus caras vienen por separado, súbelas con la opción «Por caras».",
    );
  }

  const ratio = h / w;
  const matched = input.expected.find(
    (e) => Math.abs(ratio - e.ratio) / e.ratio <= STRIP_RATIO_TOLERANCE,
  );
  if (!matched) {
    const expectedList = input.expected
      .map((e) => `${e.sizeCm} cm por cara (tira ≈ ${e.ratio.toFixed(1)}× más alta que ancha)`)
      .join(" o ");
    throw new GalleryStripError(
      `La proporción de la tira no cuadra con este producto: se espera ${expectedList}, y la imagen es ${ratio.toFixed(1)}× más alta que ancha. Revisa que la tira tenga las 2 caras completas o súbelas por separado con «Por caras».`,
    );
  }

  const faceH = Math.floor(h / 2);
  // Mitad inferior = cara A (derecha); mitad superior = cara B (rotada 180° en
  // la fuente → la rotamos para que quede derecha en el Estudio).
  const bottomHalf = await sharp(normalized)
    .extract({ left: 0, top: h - faceH, width: w, height: faceH })
    .webp({ quality: 95 })
    .toBuffer();
  const topHalfRotated = await sharp(normalized)
    .extract({ left: 0, top: 0, width: w, height: faceH })
    .rotate(180)
    .webp({ quality: 95 })
    .toBuffer();

  return {
    faceA: input.swapFaces ? topHalfRotated : bottomHalf,
    faceB: input.swapFaces ? bottomHalf : topHalfRotated,
    width: w,
    faceHeight: faceH,
    matchedSizeCm: matched.sizeCm,
  };
}
