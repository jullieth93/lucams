/*
 * Unit tests — lib/payment-logos (Paquete F, 2026-10-02).
 * La fila de logos del checkout debe calzar con la lista textual de
 * lib/payment-methods.ts (WOMPI_METHODS_SHORT) y apuntar a assets que
 * existen en public/payments/.
 */

import { describe, expect, it } from "vitest";
import { existsSync } from "node:fs";
import path from "node:path";
import { paymentLogo, WOMPI_PAYMENT_LOGOS } from "./payment-logos";
import { WOMPI_METHODS_SHORT } from "./payment-methods";

describe("paymentLogo", () => {
  it("mapea cada medio conocido a su badge en /payments/", () => {
    for (const method of ["visa", "mastercard", "pse", "nequi", "daviplata", "bancolombia"]) {
      const logo = paymentLogo(method);
      expect(logo, method).not.toBeNull();
      expect(logo!.src).toBe(`/payments/${method}.svg`);
      expect(logo!.alt.length).toBeGreaterThan(0);
    }
  });

  it("tolera mayúsculas y espacios", () => {
    expect(paymentLogo(" PSE ")?.src).toBe("/payments/pse.svg");
    expect(paymentLogo("Nequi")?.src).toBe("/payments/nequi.svg");
  });

  it("medio sin badge o vacío → null (el caller muestra solo texto)", () => {
    expect(paymentLogo("amex")).toBeNull();
    expect(paymentLogo("efecty")).toBeNull();
    expect(paymentLogo(null)).toBeNull();
    expect(paymentLogo(undefined)).toBeNull();
    expect(paymentLogo("")).toBeNull();
  });
});

describe("WOMPI_PAYMENT_LOGOS", () => {
  it("cubre los medios del texto WOMPI_METHODS_SHORT en el mismo orden", () => {
    // "Tarjeta · PSE · Nequi · Daviplata · Bancolombia" → tarjeta se despliega
    // en Visa + Mastercard al frente de la fila.
    const alts = WOMPI_PAYMENT_LOGOS.map((l) => l.alt);
    expect(alts).toEqual(["Visa", "Mastercard", "PSE", "Nequi", "Daviplata", "Bancolombia"]);
    for (const method of ["PSE", "Nequi", "Daviplata", "Bancolombia"]) {
      expect(WOMPI_METHODS_SHORT).toContain(method);
    }
    expect(WOMPI_METHODS_SHORT).toContain("Tarjeta");
  });

  it("todos los assets referenciados existen en public/", () => {
    for (const logo of WOMPI_PAYMENT_LOGOS) {
      const file = path.join(process.cwd(), "public", logo.src);
      expect(existsSync(file), `${logo.src} debe existir en public/`).toBe(true);
    }
  });
});
