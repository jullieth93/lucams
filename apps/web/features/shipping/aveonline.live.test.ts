/*
 * Test EN VIVO del código real de cotización (no un stub): instancia el
 * AveonlineProvider compilado y llama a quote() contra la API real de Aveonline.
 * Ejercita buildCotizarProductos + auth + fetch + circuit breaker de verdad.
 *
 * NO corre en CI: guardado por AVEONLINE_LIVE_TEST. Ejecutar con:
 *   dotenv -e ../../.env.local -- env AVEONLINE_LIVE_TEST=1 npx vitest run \
 *     features/shipping/aveonline.live.test.ts
 */

import { describe, expect, it } from "vitest";
import { AveonlineProvider } from "./aveonline";
import type { ShipmentItem } from "./provider";

const live = Boolean(process.env.AVEONLINE_LIVE_TEST && process.env.AVEONLINE_USUARIO);

// Producto real de la tienda: Fotoimanes Cuadrados — 30g, 15×10×3 cm, $45.000 (4.500.000 centavos).
const fotoiman = (qty: number): ShipmentItem => ({
  productSlug: "fotoimanes-cuadrados",
  qty,
  weightGrams: 30,
  widthCm: 15,
  heightCm: 10,
  depthCm: 3,
  declaredValueCop: 4_500_000, // centavos
});

describe.skipIf(!live)("AveonlineProvider.quote — EN VIVO (API real)", () => {
  const provider = new AveonlineProvider();

  it("cotiza 5 Fotoimanes Bogotá→Medellín y devuelve transportadoras con precio", async () => {
    const quotes = await provider.quote({
      origin: { city: "Bogotá D.C.", department: "Bogotá D.C." },
      destination: { city: "Medellín", department: "Antioquia" },
      items: [fotoiman(5)],
      contraentrega: false,
    });
    console.log(
      "Cotizaciones Bogotá→Medellín (5 imanes):",
      quotes
        .map((q) => `${q.carrierName}=$${(q.fleteCop / 100).toLocaleString("es-CO")}`)
        .join(" · "),
    );
    expect(quotes.length).toBeGreaterThan(0);
    for (const q of quotes) {
      expect(q.fleteCop).toBeGreaterThan(0);
      expect(q.quoteId).not.toBe(""); // seleccionable (min(1) del schema)
      expect(q.deliveryDays).toBeLessThanOrEqual(30); // clamp del schema
      expect(Number.isInteger(q.fleteCop)).toBe(true);
    }
  }, 40_000);

  it("cotiza mismo-ciudad Bogotá→Bogotá (el caso que fallaba) y devuelve opciones", async () => {
    const quotes = await provider.quote({
      origin: { city: "Bogotá D.C.", department: "Bogotá D.C." },
      destination: { city: "Bogotá D.C.", department: "Bogotá D.C." },
      items: [fotoiman(5)],
      contraentrega: false,
    });
    console.log(
      "Cotizaciones Bogotá→Bogotá (5 imanes):",
      quotes
        .map((q) => `${q.carrierName}=$${(q.fleteCop / 100).toLocaleString("es-CO")}`)
        .join(" · "),
    );
    expect(quotes.length).toBeGreaterThan(0);
  }, 40_000);
});
