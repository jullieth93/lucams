/*
 * Tests de predesigned-variety (Paquete A, 2026-10-02):
 *  - roundRobinPredesigned: sin repetición mientras haya catálogo, wrap-around
 *    al agotarse, offset de inicio, casos borde (vacío, count 0).
 *  - predesignedFaceBadge: "two"/"one"/null según caras del producto y del
 *    diseño (regla del badge de las tarjetas de prediseñado, T2).
 */

import { describe, expect, it } from "vitest";
import { predesignedFaceBadge, roundRobinPredesigned } from "./predesigned-variety";

const catalog = ["d1", "d2", "d3", "d4", "d5"];

describe("roundRobinPredesigned — variedad sin repetición (bug: 20 slots con el mismo diseño)", () => {
  it("count <= catálogo: todos distintos y en orden del catálogo", () => {
    expect(roundRobinPredesigned(catalog, 5)).toEqual(catalog);
    expect(roundRobinPredesigned(catalog, 3)).toEqual(["d1", "d2", "d3"]);
  });

  it("count > catálogo: agota el catálogo y repite desde el inicio", () => {
    expect(roundRobinPredesigned(catalog, 8)).toEqual([
      "d1",
      "d2",
      "d3",
      "d4",
      "d5",
      "d1",
      "d2",
      "d3",
    ]);
  });

  it("con 20 slots y catálogo de 6 nunca repite antes de agotar", () => {
    const six = ["a", "b", "c", "d", "e", "f"];
    const picked = roundRobinPredesigned(six, 20);
    expect(picked).toHaveLength(20);
    // Cada bloque de 6 consecutivos contiene los 6 diseños (variedad máxima).
    for (let block = 0; block + 6 <= 20; block += 6) {
      expect(new Set(picked.slice(block, block + 6)).size).toBe(6);
    }
  });

  it("respeta el startIndex (continuar la variedad tras aplicaciones previas)", () => {
    expect(roundRobinPredesigned(catalog, 2, 3)).toEqual(["d4", "d5"]);
    expect(roundRobinPredesigned(catalog, 3, 4)).toEqual(["d5", "d1", "d2"]);
  });

  it("casos borde: catálogo vacío y count 0", () => {
    expect(roundRobinPredesigned([], 5)).toEqual([]);
    expect(roundRobinPredesigned(catalog, 0)).toEqual([]);
  });

  it("catálogo de 1: repite el único diseño (no hay variedad posible)", () => {
    expect(roundRobinPredesigned(["x"], 3)).toEqual(["x", "x", "x"]);
  });
});

describe("predesignedFaceBadge — badge 1 cara / 2 caras (T2)", () => {
  it("producto de 1 cara: sin badge (aunque el diseño tenga B)", () => {
    expect(predesignedFaceBadge(1, "https://x/b.png")).toBeNull();
    expect(predesignedFaceBadge(1, null)).toBeNull();
    expect(predesignedFaceBadge(undefined, null)).toBeNull();
  });

  it("producto de 2 caras + diseño con cara B → 'two'", () => {
    expect(predesignedFaceBadge(2, "https://x/b.png")).toBe("two");
  });

  it("producto de 2 caras + diseño SIN cara B → 'one' (respaldo EN BLANCO, owner 2026-10-07)", () => {
    expect(predesignedFaceBadge(2, null)).toBe("one");
    expect(predesignedFaceBadge(2, undefined)).toBe("one");
    expect(predesignedFaceBadge(2, "")).toBe("one");
  });
});
