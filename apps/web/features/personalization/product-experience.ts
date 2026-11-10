export const PRODUCT_EXPERIENCES = ["standard", "christmas-ornament", "mini-book"] as const;

export type ProductExperience = (typeof PRODUCT_EXPERIENCES)[number];

export type ProductExperienceConfig = {
  experience: ProductExperience;
  freeUnitDesign: boolean;
  volumePricingByPhysicalUnit: boolean;
  spineWidthCm: number;
};

const DEFAULT_SPINE_WIDTH_CM = 0.5;

export function readProductExperience(raw: unknown): ProductExperienceConfig {
  const schema = raw !== null && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const experience = PRODUCT_EXPERIENCES.includes(schema.experience as ProductExperience)
    ? (schema.experience as ProductExperience)
    : "standard";
  const spineWidthCm =
    typeof schema.spineWidthCm === "number" &&
    Number.isFinite(schema.spineWidthCm) &&
    schema.spineWidthCm > 0 &&
    schema.spineWidthCm <= 5
      ? schema.spineWidthCm
      : DEFAULT_SPINE_WIDTH_CM;
  return {
    experience,
    freeUnitDesign: schema.freeUnitDesign === true,
    volumePricingByPhysicalUnit: schema.volumePricingByPhysicalUnit === true,
    spineWidthCm,
  };
}

export function physicalUnitsFromFaces(slotCount: number, facesPerUnit = 1): number {
  if (!Number.isFinite(slotCount) || slotCount <= 0) return 0;
  return Math.ceil(slotCount / (facesPerUnit === 2 ? 2 : 1));
}

export type TwoFaceConstruction = "duplex" | "folded-strip";

export function twoFaceConstructionForProduct(raw: unknown, slug = ""): TwoFaceConstruction | null {
  const experience = readProductExperience(raw).experience;
  if (experience === "christmas-ornament") return "duplex";
  if (experience === "mini-book") return null;
  const schema = raw !== null && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const galleryTag = typeof schema.galleryTag === "string" ? schema.galleryTag : slug;
  return galleryTag.startsWith("separadores") ? "folded-strip" : null;
}

export function supportsTwoFaceDesign(raw: unknown, slug = ""): boolean {
  return twoFaceConstructionForProduct(raw, slug) !== null;
}

export function parseExtendedSizeCm(sizeCm: string | undefined): {
  widthCm: number;
  heightCm: number;
} | null {
  if (!sizeCm) return null;
  const match = sizeCm.match(/^(\d+(?:[.,]\d+)?)\s*[×x]\s*(\d+(?:[.,]\d+)?)$/i);
  if (!match) return null;
  const widthCm = Number(match[1]!.replace(",", "."));
  const heightCm = Number(match[2]!.replace(",", "."));
  if (!Number.isFinite(widthCm) || !Number.isFinite(heightCm) || widthCm <= 0 || heightCm <= 0) {
    return null;
  }
  return { widthCm, heightCm };
}

export type MiniBookGeometry = {
  widthCm: number;
  heightCm: number;
  thicknessCm: number;
  spineWidthCm: number;
  coverWidthCm: number;
  regions: {
    back: { offsetX: number; width: number };
    spine: { offsetX: number; width: number };
    front: { offsetX: number; width: number };
  };
};

export function miniBookGeometry(
  sizeCm: string | undefined,
  spineWidthCm = DEFAULT_SPINE_WIDTH_CM,
): MiniBookGeometry | null {
  const size = parseExtendedSizeCm(sizeCm);
  if (!size || spineWidthCm <= 0 || spineWidthCm >= size.widthCm) return null;
  const coverWidthCm = (size.widthCm - spineWidthCm) / 2;
  const backWidth = coverWidthCm / size.widthCm;
  const spineWidth = spineWidthCm / size.widthCm;
  const frontWidth = backWidth;
  return {
    ...size,
    thicknessCm: spineWidthCm,
    spineWidthCm,
    coverWidthCm,
    regions: {
      back: { offsetX: 0, width: backWidth },
      spine: { offsetX: backWidth, width: spineWidth },
      front: { offsetX: backWidth + spineWidth, width: frontWidth },
    },
  };
}

export function miniBookTemplateGeometry(width: number, height: number, spineWidth = 50) {
  if (width <= spineWidth || spineWidth <= 0 || height <= 0) {
    throw new Error("La geometría de la carátula no deja espacio para ambas tapas.");
  }
  const coverWidth = (width - spineWidth) / 2;
  return {
    back: { x: 0, width: coverWidth },
    spine: { x: coverWidth, width: spineWidth },
    front: { x: coverWidth + spineWidth, width: coverWidth },
    height,
  };
}
