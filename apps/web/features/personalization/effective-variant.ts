import {
  mergeVariantOverProduct,
  parseVariantAttributes,
} from "@/features/products/variant-schemas";
import {
  readPhotoPackDesignInfo,
  resolvePhotoPackVariant,
  type PhotoPackVariant,
} from "@/features/products/photo-pack-resolve";

export function variantIdFromDesignMetadata(metadata: unknown): string | undefined {
  if (!metadata || typeof metadata !== "object") return undefined;
  const value = (metadata as { variantId?: unknown }).variantId;
  return typeof value === "string" && value.trim() ? value : undefined;
}

export function resolveEffectiveVariant<T extends PhotoPackVariant>(opts: {
  variants: readonly T[];
  canvasData?: unknown;
  variantId?: string;
}): T | null {
  const packInfo = readPhotoPackDesignInfo(opts.canvasData);
  if (packInfo) return resolvePhotoPackVariant(opts.variants, packInfo);
  return opts.variants.find((variant) => variant.id === opts.variantId) ?? null;
}

export function effectivePersonalizationSchema(
  productSchema: Record<string, unknown> | null | undefined,
  variant: Pick<PhotoPackVariant, "attributes"> | null,
): Record<string, unknown> {
  const base = productSchema ?? {};
  if (!variant) return base;
  return mergeVariantOverProduct(base, parseVariantAttributes(variant.attributes));
}
