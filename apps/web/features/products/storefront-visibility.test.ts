/*
 * Unit tests — features/products/storefront-visibility.
 *
 * El helper replica el gate del storefront (STOREFRONT_WHERE de
 * public-service.ts + reglas de la PDP: opciones activas no archivadas e
 * inStock = alguna con stock > 0). Acá se fija esa semántica: si el gate
 * cambia a propósito, estos tests deben cambiar con él.
 */

import { describe, it, expect } from "vitest";
import { getStorefrontVisibility, type StorefrontVisibilityInput } from "./storefront-visibility";

/** Base "todo en regla": producto activo, categoría activa, opciones con stock. */
const VISIBLE: StorefrontVisibilityInput = {
  productIsActive: true,
  productDeletedAt: null,
  categoryIsActive: true,
  categoryDeletedAt: null,
  activeVariantCount: 2,
  inStockAny: true,
};

describe("getStorefrontVisibility", () => {
  it("producto activo con categoría activa y opciones con stock → visible (sin razón)", () => {
    expect(getStorefrontVisibility(VISIBLE)).toEqual({ status: "visible" });
  });

  it("producto pausado (isActive=false) → no visible: 'Producto pausado'", () => {
    expect(getStorefrontVisibility({ ...VISIBLE, productIsActive: false })).toEqual({
      status: "no-visible",
      reason: "Producto pausado",
    });
  });

  it("producto archivado (deletedAt!=null) → no visible: 'Producto archivado'", () => {
    expect(getStorefrontVisibility({ ...VISIBLE, productDeletedAt: new Date() })).toEqual({
      status: "no-visible",
      reason: "Producto archivado",
    });
  });

  it("categoría pausada → no visible: 'Categoría pausada'", () => {
    expect(getStorefrontVisibility({ ...VISIBLE, categoryIsActive: false })).toEqual({
      status: "no-visible",
      reason: "Categoría pausada",
    });
  });

  it("categoría archivada → no visible: 'Categoría archivada'", () => {
    expect(getStorefrontVisibility({ ...VISIBLE, categoryDeletedAt: new Date() })).toEqual({
      status: "no-visible",
      reason: "Categoría archivada",
    });
  });

  it("sin opciones activas → no visible: 'Sin opciones activas' (aunque inStockAny=false)", () => {
    // Un producto sin opciones activas no es comprable en la PDP (no hay
    // variante que poner en el carrito) → no-visible, no "agotado".
    expect(
      getStorefrontVisibility({ ...VISIBLE, activeVariantCount: 0, inStockAny: false }),
    ).toEqual({
      status: "no-visible",
      reason: "Sin opciones activas",
    });
  });

  it("opciones activas pero ninguna con stock → visible-agotado (sigue en la tienda)", () => {
    expect(getStorefrontVisibility({ ...VISIBLE, inStockAny: false })).toEqual({
      status: "visible-agotado",
      reason: "Visible con todas las opciones agotadas",
    });
  });

  it("una sola opción activa con stock basta para visible", () => {
    expect(
      getStorefrontVisibility({ ...VISIBLE, activeVariantCount: 1, inStockAny: true }),
    ).toEqual({ status: "visible" });
  });

  it("prioridad: archivado gana a pausado (la papelera es lo primero a resolver)", () => {
    expect(
      getStorefrontVisibility({ ...VISIBLE, productDeletedAt: new Date(), productIsActive: false }),
    ).toEqual({ status: "no-visible", reason: "Producto archivado" });
  });

  it("prioridad: problema del producto gana a problema de la categoría", () => {
    expect(
      getStorefrontVisibility({ ...VISIBLE, productIsActive: false, categoryIsActive: false }),
    ).toEqual({ status: "no-visible", reason: "Producto pausado" });
  });

  it("prioridad: categoría archivada gana a categoría pausada", () => {
    expect(
      getStorefrontVisibility({
        ...VISIBLE,
        categoryDeletedAt: new Date(),
        categoryIsActive: false,
      }),
    ).toEqual({ status: "no-visible", reason: "Categoría archivada" });
  });

  it("prioridad: sin opciones activas gana a agotado", () => {
    expect(
      getStorefrontVisibility({ ...VISIBLE, activeVariantCount: 0, inStockAny: false }),
    ).toEqual({ status: "no-visible", reason: "Sin opciones activas" });
  });
});
