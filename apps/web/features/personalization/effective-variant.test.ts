import { describe, expect, it } from "vitest";
import {
  effectivePersonalizationSchema,
  resolveEffectiveVariant,
  variantIdFromDesignMetadata,
} from "./effective-variant";

const variants = [
  {
    id: "var-a",
    price: 10_000,
    stock: 5,
    attributes: { photoSlots: 6, sizeCm: "2×6", magnet: true, shape: "rectangle" },
  },
  {
    id: "var-b",
    price: 12_000,
    stock: 3,
    attributes: { photoSlots: 6, sizeCm: "4×4.2", magnet: false, shape: "circle" },
  },
];

describe("resolveEffectiveVariant", () => {
  const canvas = {
    version: 2,
    photoSlots: 6,
    sizeCm: "4×4.2",
    magnet: false,
  };

  it("el diseño manda sobre el variantId viejo de la PDP", () => {
    expect(resolveEffectiveVariant({ variants, canvasData: canvas, variantId: "var-a" })?.id).toBe(
      "var-b",
    );
  });

  it("sin datos de pack en el canvas usa el variantId persistido", () => {
    expect(
      resolveEffectiveVariant({ variants, canvasData: { version: 2 }, variantId: "var-a" })?.id,
    ).toBe("var-a");
  });

  it("un pack que ya no existe en catálogo no cae silenciosamente a otra variante", () => {
    expect(
      resolveEffectiveVariant({
        variants,
        canvasData: { ...canvas, sizeCm: "9×9" },
        variantId: "var-a",
      }),
    ).toBeNull();
  });

  it("lee la variante persistida en metadata de forma defensiva", () => {
    expect(variantIdFromDesignMetadata({ variantId: "var-a" })).toBe("var-a");
    expect(variantIdFromDesignMetadata({ variantId: 42 })).toBeUndefined();
    expect(variantIdFromDesignMetadata(null)).toBeUndefined();
  });
});

describe("effectivePersonalizationSchema", () => {
  it("la variante efectiva sobrescribe el schema base", () => {
    expect(
      effectivePersonalizationSchema({ photoSlots: 3, sizeCm: "2×6", shape: "rect" }, variants[1]),
    ).toMatchObject({ photoSlots: 6, sizeCm: "4×4.2", shape: "circle" });
  });

  it("sin variante conserva el schema base", () => {
    expect(effectivePersonalizationSchema({ photoSlots: 3 }, null)).toEqual({ photoSlots: 3 });
  });
});
