/*
 * La huella que decide si dos diseños son "exactamente el mismo".
 *
 * El riesgo asimétrico manda el diseño de estas pruebas: un FALSO NEGATIVO deja dos líneas en el
 * carrito (molesto, es lo que pasaba hasta hoy); un FALSO POSITIVO fusiona dos diseños DISTINTOS y
 * el cliente recibe dos veces lo mismo. Por eso hay más casos de "no deben agruparse" que al revés.
 */

import { describe, expect, it } from "vitest";
import { designIdentity } from "./design-identity";

const base = { productId: "prod-1", canvasData: { version: 2, slotCount: 1, color: "turquesa" } };

describe("designIdentity", () => {
  it("dos diseños con el mismo contenido tienen la misma huella", () => {
    expect(designIdentity(base)).toBe(designIdentity({ ...base }));
  });

  it("el orden de las claves no cambia la huella (la serialización es canónica)", () => {
    const otro = {
      productId: "prod-1",
      canvasData: { color: "turquesa", slotCount: 1, version: 2 },
    };
    expect(designIdentity(otro)).toBe(designIdentity(base));
  });

  /*
   * `assetUrl` es una URL FIRMADA: lleva un token que caduca y cambia en cada lectura. Si entrara en
   * la huella, dos diseños idénticos nunca coincidirían y la agrupación sería código muerto.
   */
  it("ignora las URLs firmadas, que cambian solas", () => {
    const conUrl = {
      productId: "prod-1",
      canvasData: {
        version: 2,
        slots: [{ slotIndex: 0, assetId: "a1", assetUrl: "https://x/y.jpg?token=AAA" }],
      },
    };
    const conOtraUrl = {
      productId: "prod-1",
      canvasData: {
        version: 2,
        slots: [{ slotIndex: 0, assetId: "a1", assetUrl: "https://x/y.jpg?token=ZZZ" }],
      },
    };
    expect(designIdentity(conUrl)).toBe(designIdentity(conOtraUrl));
  });

  it("pero NO ignora el asset: otra foto es otro diseño", () => {
    const a = {
      productId: "prod-1",
      canvasData: { version: 2, slots: [{ slotIndex: 0, assetId: "foto-A" }] },
    };
    const b = {
      productId: "prod-1",
      canvasData: { version: 2, slots: [{ slotIndex: 0, assetId: "foto-B" }] },
    };
    expect(designIdentity(a)).not.toBe(designIdentity(b));
  });

  it("distingue el encuadre: la misma foto movida es otro producto físico", () => {
    const a = {
      productId: "p",
      canvasData: { slots: [{ slotIndex: 0, assetId: "f", photoTransform: { x: 0, y: 0 } }] },
    };
    const b = {
      productId: "p",
      canvasData: { slots: [{ slotIndex: 0, assetId: "f", photoTransform: { x: 12, y: 0 } }] },
    };
    expect(designIdentity(a)).not.toBe(designIdentity(b));
  });

  // El orden de los slots ES identidad: "foto A arriba" no es lo mismo que "foto A abajo".
  it("el orden de los slots importa", () => {
    const a = { productId: "p", canvasData: { slots: [{ assetId: "A" }, { assetId: "B" }] } };
    const b = { productId: "p", canvasData: { slots: [{ assetId: "B" }, { assetId: "A" }] } };
    expect(designIdentity(a)).not.toBe(designIdentity(b));
  });

  it("dos productos distintos nunca son el mismo diseño", () => {
    expect(designIdentity(base)).not.toBe(designIdentity({ ...base, productId: "prod-2" }));
  });

  it("el color del marco es identidad: es un cambio físico del producto", () => {
    const a = { productId: "p", canvasData: { borderColor: "#E85B9F" } };
    const b = { productId: "p", canvasData: { borderColor: "#5DD9D1" } };
    expect(designIdentity(a)).not.toBe(designIdentity(b));
  });

  it("el año del calendario, que vive en metadata, también es identidad", () => {
    const a = { productId: "p", canvasData: {}, metadata: { calendarYear: 2027 } };
    const b = { productId: "p", canvasData: {}, metadata: { calendarYear: 2028 } };
    expect(designIdentity(a)).not.toBe(designIdentity(b));
  });

  it("las marcas de tiempo no cuentan", () => {
    const a = { productId: "p", canvasData: { v: 1, updatedAt: "2026-07-25T10:00:00Z" } };
    const b = { productId: "p", canvasData: { v: 1, updatedAt: "2026-07-25T18:30:00Z" } };
    expect(designIdentity(a)).toBe(designIdentity(b));
  });
});
