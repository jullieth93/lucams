/*
 * Unit — buildAddressInput: mapeo dirección-estructurada → AddressInput del libro.
 * Fuente única compartida por /mi-cuenta/direcciones y "guardar al pagar", así que
 * el display (line1) debe quedar IDÉNTICO al que arma el courier (composeAddressLine)
 * y `structured` debe viajar intacto (reuso 100%). line2 siempre null (no duplicar).
 */

import { describe, expect, it } from "vitest";
import { buildAddressInput } from "./service";
import type { AddressInput as StructuredAddress } from "@/features/checkout/schemas";

const urban: StructuredAddress = {
  deptCode: "05",
  cityCode: "05001",
  department: "Antioquia",
  city: "Medellín",
  zip: "050001",
  kind: "urban",
  viaType: "Carrera",
  viaNumber: "70",
  viaBis: true,
  viaCardinal: "Sur",
  cruceNumber: "45-11",
  cruceCardinal: "",
  detail: "Apto 401",
};

const rural: StructuredAddress = {
  deptCode: "05",
  cityCode: "05002",
  department: "Antioquia",
  city: "Abejorral",
  kind: "rural",
  vereda: "El Roble",
  finca: "Las Flores",
  referencia: "A 200m del puente, casa azul de dos pisos",
};

describe("buildAddressInput", () => {
  it("urbana: line1 canónico (con detail), line2 null, structured intacto", () => {
    const input = buildAddressInput(urban, { name: "Casa", phone: "3001234567" });
    expect(input.name).toBe("Casa");
    expect(input.phone).toBe("3001234567");
    expect(input.line1).toBe("Carrera 70 Bis Sur # 45-11 (Apto 401)");
    expect(input.line2).toBeNull();
    expect(input.city).toBe("Medellín");
    expect(input.department).toBe("Antioquia");
    expect(input.zip).toBe("050001");
    expect((input.structured as Record<string, unknown>).viaType).toBe("Carrera");
    expect((input.structured as Record<string, unknown>).detail).toBe("Apto 401");
  });

  it("rural: line1 incluye Vereda + Finca + Ref; line2 null", () => {
    const input = buildAddressInput(rural, { name: "Finca", phone: "3009999999" });
    expect(input.line1).toBe(
      "Vereda El Roble · Finca Las Flores · Ref: A 200m del puente, casa azul de dos pisos",
    );
    expect(input.line2).toBeNull();
    expect(input.zip).toBeNull(); // sin zip → null, no ""
  });

  it("propaga isDefault y limpia undefined del structured (JSON round-trip)", () => {
    const input = buildAddressInput(urban, { name: "Casa", phone: "3001234567", isDefault: true });
    expect(input.isDefault).toBe(true);
    // undefined no debe sobrevivir el round-trip (Prisma.Json no lo acepta).
    expect(JSON.stringify(input.structured)).not.toContain("undefined");
  });
});
