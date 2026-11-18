export const FULFILLMENT_MODES = ["MADE_TO_ORDER", "PHYSICAL_STOCK"] as const;
export type FulfillmentMode = (typeof FULFILLMENT_MODES)[number];

export type StudioProductInput = {
  personalizationKind?: string | null;
  isPersonalizable?: boolean | null;
  personalizationSchema?: unknown;
  variants?: ReadonlyArray<{ attributes: unknown }>;
};

export function requiresMadeToOrder(input: StudioProductInput): boolean {
  const letterSet =
    input.personalizationSchema !== null &&
    typeof input.personalizationSchema === "object" &&
    "letterSet" in input.personalizationSchema
      ? input.personalizationSchema.letterSet
      : undefined;

  return (
    (input.personalizationKind != null && input.personalizationKind !== "NONE") ||
    input.isPersonalizable === true ||
    letterSet === "full" ||
    letterSet === "vowels" ||
    (input.variants ?? []).some(
      (variant) =>
        variant.attributes !== null &&
        typeof variant.attributes === "object" &&
        "variant" in variant.attributes &&
        variant.attributes.variant === "name",
    )
  );
}

export function tracksPhysicalStock(mode: FulfillmentMode | null | undefined): boolean {
  return mode !== "MADE_TO_ORDER";
}

export function hasStockForSale(mode: FulfillmentMode | null | undefined, stock: number): boolean {
  return !tracksPhysicalStock(mode) || stock > 0;
}

export function netAvailableStock(stock: number, safetyStock: number): number {
  return Math.max(0, stock - safetyStock);
}
