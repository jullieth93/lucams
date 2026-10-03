/*
 * La huella que decide si dos diseños son "exactamente el mismo".
 *
 * El riesgo asimétrico manda el diseño de estas pruebas: un FALSO NEGATIVO deja dos líneas en el
 * carrito (molesto, es lo que pasaba hasta hoy); un FALSO POSITIVO fusiona dos diseños DISTINTOS y
 * el cliente recibe dos veces lo mismo. Por eso hay más casos de "no deben agruparse" que al revés.
 */

import { describe, expect, it } from "vitest";
import type { Prisma } from "@lucams/db";
import { consolidateIdenticalLines, designIdentity, sameLineContent } from "./design-identity";

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

/*
 * Paquete H (2026-10-02) — la comparación por CONTENIDO aplicada a líneas de
 * carrito/pedido: es la regla que los merges (login, recuperación) y la
 * consolidación de createOrderFromCart usan para no duplicar líneas.
 */
describe("sameLineContent", () => {
  const diseno = (canvasData: Prisma.JsonValue) => ({ productId: "prod-1", canvasData });

  it("líneas sin personalización de la misma variante son la misma compra", () => {
    expect(
      sameLineContent({ variantId: "v1", designId: null }, { variantId: "v1", designId: null }),
    ).toBe(true);
  });

  it("variantes distintas NUNCA se agrupan, aunque el diseño sea idéntico", () => {
    const canvas = { version: 2, color: "turquesa" };
    expect(
      sameLineContent(
        { variantId: "v1", designId: "d1", design: diseno(canvas) },
        { variantId: "v2", designId: "d2", design: diseno(canvas) },
      ),
    ).toBe(false);
  });

  it("mismo designId → misma línea (aunque no venga el diseño cargado)", () => {
    expect(
      sameLineContent({ variantId: "v1", designId: "d1" }, { variantId: "v1", designId: "d1" }),
    ).toBe(true);
  });

  it("designs distintos con MISMO contenido (dos pasadas por el Estudio) → misma línea", () => {
    const a = { version: 2, slots: [{ slotIndex: 0, assetId: "foto-A" }] };
    const b = { slots: [{ slotIndex: 0, assetId: "foto-A" }], version: 2 };
    expect(
      sameLineContent(
        { variantId: "v1", designId: "d1", design: diseno(a) },
        { variantId: "v1", designId: "d2", design: diseno(b) },
      ),
    ).toBe(true);
  });

  it("designs distintos con contenido distinto → líneas separadas", () => {
    expect(
      sameLineContent(
        { variantId: "v1", designId: "d1", design: diseno({ slots: [{ assetId: "A" }] }) },
        { variantId: "v1", designId: "d2", design: diseno({ slots: [{ assetId: "B" }] }) },
      ),
    ).toBe(false);
  });

  it("uno con diseño y otro sin diseño → líneas separadas", () => {
    expect(
      sameLineContent(
        { variantId: "v1", designId: "d1", design: diseno({}) },
        { variantId: "v1", designId: null },
      ),
    ).toBe(false);
  });

  it("designId distinto sin el diseño cargado → NO agrupa (falla seguro)", () => {
    expect(
      sameLineContent({ variantId: "v1", designId: "d1" }, { variantId: "v1", designId: "d2" }),
    ).toBe(false);
  });
});

describe("consolidateIdenticalLines", () => {
  const linea = (over: Record<string, unknown>) => ({
    variantId: "v1",
    designId: null as string | null,
    design: null,
    qty: 1,
    unitPrice: 10_000,
    ...over,
  });

  it("suma el qty de líneas idénticas y conserva la primera (su diseño/preview)", () => {
    const canvas = { version: 2, color: "turquesa" };
    const out = consolidateIdenticalLines([
      linea({ designId: "d1", design: { productId: "p", canvasData: canvas }, qty: 1 }),
      linea({ designId: "d2", design: { productId: "p", canvasData: { ...canvas } }, qty: 2 }),
    ]);
    expect(out).toHaveLength(1);
    expect(out[0].qty).toBe(3);
    expect(out[0].designId).toBe("d1"); // la primera línea es la que sobrevive
  });

  it("diseños realmente distintos quedan como líneas separadas", () => {
    const out = consolidateIdenticalLines([
      linea({ designId: "d1", design: { productId: "p", canvasData: { n: 1 } } }),
      linea({ designId: "d2", design: { productId: "p", canvasData: { n: 2 } } }),
    ]);
    expect(out).toHaveLength(2);
  });

  it("sin personalización: consolida por variante, sin mezclar variantes", () => {
    const out = consolidateIdenticalLines([
      linea({ qty: 2 }),
      linea({ variantId: "v2", qty: 1 }),
      linea({ qty: 3 }),
    ]);
    expect(out).toHaveLength(2);
    expect(out.find((l) => l.variantId === "v1")!.qty).toBe(5);
    expect(out.find((l) => l.variantId === "v2")!.qty).toBe(1);
  });

  it("no muta la entrada y no topa el qty (el cap 99 es del carrito, no del pedido)", () => {
    const input = [linea({ qty: 99 }), linea({ qty: 99 })];
    const out = consolidateIdenticalLines(input);
    expect(out[0].qty).toBe(198);
    expect(input[0].qty).toBe(99);
    expect(input[1].qty).toBe(99);
  });
});
