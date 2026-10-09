/*
 * Tests del AddressSchema urbano — validación reforzada de dirección
 * (fix QA STG 2026-10): el owner pudo diligenciar "Calle 3 sur #" (sin
 * cruce) y el error era genérico. Ahora viaNumber/cruceNumber validan con
 * los mensajes ESPECÍFICOS de lib/colombia-validators (qué falta), con
 * casos de nomenclatura colombiana real. El flujo rural y composeAddressLine
 * (lo que va a Aveonline) quedan intactos.
 */

import { describe, expect, it } from "vitest";
import { AddressSchema, composeAddressLine, type AddressInput } from "./schemas";

/** Base urbana válida (Bogotá DANE): los overrides van sobre los campos de vía. */
function urban(over: Record<string, unknown> = {}) {
  return {
    kind: "urban" as const,
    deptCode: "11",
    cityCode: "11001",
    department: "Bogotá, D.C.",
    city: "Bogotá, D.C.",
    viaType: "Calle",
    viaNumber: "3",
    cruceNumber: "15-20",
    ...over,
  };
}

function firstError(data: Record<string, unknown>, field: string): string | undefined {
  const res = AddressSchema.safeParse(data);
  if (res.success) return undefined;
  const flat = res.error.flatten();
  const errs = flat.fieldErrors[field as keyof typeof flat.fieldErrors] as string[] | undefined;
  return errs?.[0];
}

describe("AddressSchema urbano — casos colombianos reales aceptados", () => {
  it('"Cra 7 # 45-10"', () => {
    const res = AddressSchema.safeParse(
      urban({ viaType: "Carrera", viaNumber: "7", cruceNumber: "45-10" }),
    );
    expect(res.success).toBe(true);
  });

  it('"Calle 13 # 68-95 apto 402" (complemento opcional)', () => {
    const res = AddressSchema.safeParse(
      urban({ viaNumber: "13", cruceNumber: "68-95", detail: "apto 402" }),
    );
    expect(res.success).toBe(true);
    if (res.success) {
      expect(composeAddressLine(res.data)).toBe("Calle 13 # 68-95 (apto 402)");
    }
  });

  it('"Transv 2Bis # 1-50" (letras en la vía)', () => {
    const res = AddressSchema.safeParse(
      urban({ viaType: "Transversal", viaNumber: "2BIS", cruceNumber: "1-50" }),
    );
    expect(res.success).toBe(true);
  });

  it("variantes diagonal / avenida / avenida carrera", () => {
    expect(
      AddressSchema.safeParse(
        urban({ viaType: "Diagonal", viaNumber: "40A", cruceNumber: "12-30" }),
      ).success,
    ).toBe(true);
    expect(
      AddressSchema.safeParse(urban({ viaType: "Avenida", viaNumber: "19", cruceNumber: "100-15" }))
        .success,
    ).toBe(true);
    expect(
      AddressSchema.safeParse(
        urban({ viaType: "Avenida Carrera", viaNumber: "7", cruceNumber: "32-16" }),
      ).success,
    ).toBe(true);
  });

  it("cruce con letras en ambos tramos (13B-42C) y cardinal", () => {
    const res = AddressSchema.safeParse(
      urban({ viaNumber: "13B", cruceNumber: "42C-10", cruceCardinal: "Sur" }),
    );
    expect(res.success).toBe(true);
  });
});

describe("AddressSchema urbano — direcciones incompletas rechazadas con mensaje específico", () => {
  it('"Calle 3 sur #" (sin cruce) → falta el número del cruce', () => {
    const msg = firstError(urban({ viaCardinal: "Sur", cruceNumber: "" }), "cruceNumber");
    expect(msg).toContain("Falta el número del cruce");
  });

  it('cruce "15" (sin segundo tramo) → falta el número después del guion', () => {
    expect(firstError(urban({ cruceNumber: "15" }), "cruceNumber")).toContain(
      "Falta el número después del guion",
    );
  });

  it('cruce "15-" (guion sin dígitos) → falta el número después del guion', () => {
    expect(firstError(urban({ cruceNumber: "15-" }), "cruceNumber")).toContain(
      "Falta el número después del guion",
    );
  });

  it("vía sin número → falta el número de la vía", () => {
    expect(firstError(urban({ viaNumber: "" }), "viaNumber")).toContain(
      "Falta el número de la vía",
    );
  });

  it("letras sueltas en la vía ('sur' en el campo número) → debe empezar con número", () => {
    expect(firstError(urban({ viaNumber: "SUR" }), "viaNumber")).toContain("empieza con número");
  });

  it("cruce con formato inválido → mensaje de formato número-número", () => {
    expect(firstError(urban({ cruceNumber: "abc" }), "cruceNumber")).toContain(
      "Formato: número-número",
    );
  });
});

describe("AddressSchema — flujo rural intacto", () => {
  const rural = {
    kind: "rural" as const,
    deptCode: "11",
    cityCode: "11001",
    department: "Bogotá, D.C.",
    city: "Bogotá, D.C.",
    vereda: "El Roble",
    referencia: "a 200m del puente, casa azul",
  };

  it("vereda + referencia ≥10 chars sigue pasando", () => {
    expect(AddressSchema.safeParse(rural).success).toBe(true);
  });

  it("referencia corta sigue rechazada", () => {
    expect(AddressSchema.safeParse({ ...rural, referencia: "corta" }).success).toBe(false);
  });
});

describe("composeAddressLine — lo que va a Aveonline no cambia", () => {
  it("urbana con bis + cardinal + complemento", () => {
    const input: AddressInput = {
      ...urban({
        viaType: "Carrera",
        viaNumber: "7A",
        viaBis: true,
        viaCardinal: "Sur",
        cruceNumber: "23-45",
        detail: "Apto 401",
      }),
      kind: "urban",
    } as AddressInput;
    expect(composeAddressLine(input)).toBe("Carrera 7A Bis Sur # 23-45 (Apto 401)");
  });
});
