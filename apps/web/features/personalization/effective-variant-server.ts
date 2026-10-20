import "server-only";
import { prisma } from "@/lib/db";
import {
  effectivePersonalizationSchema,
  resolveEffectiveVariant,
  variantIdFromDesignMetadata,
} from "./effective-variant";
import { parsePhotoProductConfig, type CanvasData, type CanvasDataV2 } from "./schemas";

export async function loadEffectiveProductConfig(design: {
  productId: string;
  metadata: unknown;
  canvasData: unknown;
}) {
  const canvasData = design.canvasData as CanvasData;
  const metadataVariantId = variantIdFromDesignMetadata(design.metadata);
  const declaresPackVariant =
    canvasData?.version === 2 && typeof (canvasData as CanvasDataV2).photoSlots === "number";

  const product = await prisma.product.findUnique({
    where: { id: design.productId },
    select: {
      personalizationKind: true,
      personalizationSchema: true,
      variants: {
        where: { isActive: true, deletedAt: null },
        select: { id: true, price: true, stock: true, attributes: true },
      },
    },
  });
  if (!product) throw new Error(`Product ${design.productId} not found`);

  const effectiveVariant = resolveEffectiveVariant({
    variants: product.variants ?? [],
    canvasData,
    variantId: metadataVariantId,
  });
  if ((metadataVariantId || declaresPackVariant) && !effectiveVariant) {
    throw new Error("NO_DEFAULT_VARIANT: el diseño ya no tiene una variante activa exacta");
  }

  const productSchema = effectivePersonalizationSchema(
    product.personalizationSchema as Record<string, unknown> | null,
    effectiveVariant,
  );
  return {
    product,
    productSchema,
    productConfig: parsePhotoProductConfig(productSchema),
    effectiveVariant,
    metadataVariantId,
  };
}
