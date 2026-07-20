import { describe, expect, it } from "vitest";
import { computeShippingAddressKey } from "./address-key";

describe("computeShippingAddressKey — clave de dirección para anti-abuso COD (ADR-065)", () => {
  const base = {
    department: "Bogotá D.C.",
    city: "Bogotá",
    addressLine1: "Carrera 7A # 23-45",
    zip: "110111",
  };

  it("misma dirección → misma clave (aunque cambie mayúsculas/tildes/espacios)", () => {
    const a = computeShippingAddressKey(base);
    const b = computeShippingAddressKey({
      department: "bogota d.c.",
      city: "  BOGOTÁ ",
      addressLine1: "carrera 7a # 23-45",
      zip: "110111",
    });
    expect(a).toBeTruthy();
    expect(a).toBe(b);
  });

  it("direcciones distintas → claves distintas", () => {
    const a = computeShippingAddressKey(base);
    const c = computeShippingAddressKey({ ...base, addressLine1: "Calle 100 # 15-20" });
    expect(a).not.toBe(c);
  });

  it("el zip suma a la clave (misma calle, distinto zip → distinta clave)", () => {
    const a = computeShippingAddressKey(base);
    const d = computeShippingAddressKey({ ...base, zip: "110222" });
    expect(a).not.toBe(d);
  });

  it("faltan datos → null (no colapsa 'sin dirección' en una sola clave)", () => {
    expect(computeShippingAddressKey({ city: "Bogotá" })).toBeNull();
    expect(computeShippingAddressKey(null)).toBeNull();
    expect(computeShippingAddressKey({})).toBeNull();
    expect(computeShippingAddressKey("nope")).toBeNull();
  });
});
