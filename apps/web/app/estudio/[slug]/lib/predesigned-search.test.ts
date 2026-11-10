import { describe, expect, it } from "vitest";
import {
  assistedDesignRequestHref,
  filterPredesignedByName,
  normalizePredesignedQuery,
} from "./predesigned-search";

const items = [
  { id: "1", name: "Bosque Encantado · Fantasía · Grande" },
  { id: "2", name: "Amor entre Páginas · Romance · Grande" },
  { id: "3", name: "Navidad en Casa · Navidad · Pequeño" },
];

describe("filterPredesignedByName", () => {
  it("busca por tema sin distinguir tildes, mayúsculas ni espacios repetidos", () => {
    expect(filterPredesignedByName(items, "  fantasia   bosque ").map((item) => item.id)).toEqual([
      "1",
    ]);
  });

  it("exige todos los términos y permite encontrar tamaño y ocasión", () => {
    expect(filterPredesignedByName(items, "navidad pequeno").map((item) => item.id)).toEqual(["3"]);
    expect(filterPredesignedByName(items, "navidad grande")).toEqual([]);
  });

  it("devuelve todo el catálogo cuando la búsqueda está vacía", () => {
    expect(filterPredesignedByName(items, "")).toHaveLength(3);
  });
});

describe("solicitud de diseño asistido", () => {
  it("conserva producto y búsqueda en la ruta de contacto", () => {
    const href = assistedDesignRequestHref("mini-libros-magneticos", "Harry Potter");
    expect(href).toBe(
      "/contacto?asunto=PERSONALIZACION&producto=mini-libros-magneticos&busqueda=Harry+Potter",
    );
  });

  it("normaliza la búsqueda para comparar y limita el texto enviado", () => {
    expect(normalizePredesignedQuery("  ÁRBOL   navideño ")).toBe("arbol navideno");
    const href = assistedDesignRequestHref("bola-navidena-personalizada", ` ${"x".repeat(240)} `);
    expect(href).not.toContain("busqueda=x".repeat(2));
    expect(new URL(href, "https://lucamsshop.com").searchParams.get("busqueda")).toHaveLength(200);
  });
});
