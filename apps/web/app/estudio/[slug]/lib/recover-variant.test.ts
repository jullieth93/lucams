/*
 * Unit tests de resolveRecoverVariantId (recover flow ?designId=, 2026-10-05).
 *
 * El link «Editar» del carrito solo trae designId: la variante con la que se creó
 * el diseño viaja en Design.metadata.variantId y la página la usa para reabrir el
 * Estudio con la variante correcta (precio mostrado). Diseños legacy sin la clave
 * (y variantes archivadas) caen a la primera variante, el comportamiento histórico.
 */

import { describe, expect, it } from "vitest";
import { resolveRecoverVariantId } from "./recover-variant";

const VARIANTS = ["var-a", "var-b", "var-c"];

describe("resolveRecoverVariantId", () => {
  it("con metadata.variantId vigente → entra al Estudio con ESA variante", () => {
    expect(
      resolveRecoverVariantId({
        designMetadata: { variantId: "var-b", surface: "name" },
        productVariantIds: VARIANTS,
      }),
    ).toBe("var-b");
  });

  it("diseño legacy SIN la clave → undefined (la página cae a la primera variante, como hoy)", () => {
    expect(
      resolveRecoverVariantId({
        designMetadata: { surface: "letterset", language: "es" },
        productVariantIds: VARIANTS,
      }),
    ).toBeUndefined();
  });

  it("sin diseño recuperado (metadata null) → undefined", () => {
    expect(
      resolveRecoverVariantId({ designMetadata: null, productVariantIds: VARIANTS }),
    ).toBeUndefined();
  });

  it("variante archivada (ya no existe en el producto) → undefined, nunca un id colgado", () => {
    expect(
      resolveRecoverVariantId({
        designMetadata: { variantId: "var-archivada" },
        productVariantIds: VARIANTS,
      }),
    ).toBeUndefined();
  });

  it("un ?variant= explícito en la URL siempre manda sobre la metadata", () => {
    expect(
      resolveRecoverVariantId({
        urlVariantId: "var-c",
        designMetadata: { variantId: "var-b" },
        productVariantIds: VARIANTS,
      }),
    ).toBe("var-c");
  });

  it("metadata con variantId de tipo inválido (no string) → undefined", () => {
    expect(
      resolveRecoverVariantId({
        designMetadata: { variantId: 42 },
        productVariantIds: VARIANTS,
      }),
    ).toBeUndefined();
  });
});
