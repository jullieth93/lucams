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

  it("vereda + referencia ≥20 chars sigue pasando", () => {
    expect(AddressSchema.safeParse(rural).success).toBe(true);
  });

  it("referencia corta sigue rechazada", () => {
    expect(AddressSchema.safeParse({ ...rural, referencia: "corta" }).success).toBe(false);
  });

  it("referencia de 10-19 caracteres ahora se rechaza (mín 20, 2026-10)", () => {
    expect(AddressSchema.safeParse({ ...rural, referencia: "casa azul portón" }).success).toBe(
      false,
    );
  });
});

/*
 * Tipo de destino (2026-10, anti-devoluciones): destinationType es OPCIONAL en
 * el schema (backward-compat con direcciones/órdenes viejas) pero cuando viene,
 * el superRefine exige los campos del tipo (DESTINATION_CONFIG.required).
 */
describe("AddressSchema urbano — obligatoriedad por tipo de destino", () => {
  it("sin destinationType (legacy) sigue parseando", () => {
    expect(AddressSchema.safeParse(urban()).success).toBe(true);
  });

  it("destinationType inválido (anti-tamper) se rechaza", () => {
    expect(AddressSchema.safeParse(urban({ destinationType: "mordor" })).success).toBe(false);
  });

  it("casa: sin campos extra pasa", () => {
    expect(AddressSchema.safeParse(urban({ destinationType: "casa" })).success).toBe(true);
  });

  it("edificio: sin apartamento → error específico; con apartamento pasa", () => {
    expect(firstError(urban({ destinationType: "edificio" }), "apartment")).toContain(
      "Falta el número de apartamento",
    );
    expect(
      AddressSchema.safeParse(urban({ destinationType: "edificio", apartment: "401" })).success,
    ).toBe(true);
  });

  it("conjunto_torres: exige torre Y apartamento", () => {
    const faltaTodo = AddressSchema.safeParse(urban({ destinationType: "conjunto_torres" }));
    expect(faltaTodo.success).toBe(false);
    expect(firstError(urban({ destinationType: "conjunto_torres" }), "tower")).toContain(
      "Falta la torre",
    );
    expect(
      firstError(urban({ destinationType: "conjunto_torres", tower: "2" }), "apartment"),
    ).toContain("Falta el número de apartamento");
    expect(
      AddressSchema.safeParse(
        urban({ destinationType: "conjunto_torres", tower: "2", apartment: "401" }),
      ).success,
    ).toBe(true);
  });

  it("conjunto_casas: exige número de casa; manzana opcional", () => {
    expect(firstError(urban({ destinationType: "conjunto_casas" }), "houseNumber")).toContain(
      "Falta el número de casa",
    );
    expect(
      AddressSchema.safeParse(urban({ destinationType: "conjunto_casas", houseNumber: "15" }))
        .success,
    ).toBe(true);
  });

  it("oficina: exige número de oficina; empresa opcional", () => {
    expect(firstError(urban({ destinationType: "oficina" }), "officeNumber")).toContain(
      "Falta el número de oficina",
    );
    expect(
      AddressSchema.safeParse(
        urban({ destinationType: "oficina", officeNumber: "302", companyName: "Lucams" }),
      ).success,
    ).toBe(true);
  });
});

describe("composeAddressLine — estructurado por tipo de destino (2026-10)", () => {
  it("conjunto_torres: unidad primero, contenedores después, referencia al final", () => {
    const res = AddressSchema.safeParse(
      urban({
        viaNumber: "100",
        cruceNumber: "15-20",
        destinationType: "conjunto_torres",
        apartment: "401",
        tower: "B",
        complexName: "Conjunto Lucams",
        referencePoint: "portería norte",
      }),
    );
    expect(res.success).toBe(true);
    if (res.success) {
      expect(composeAddressLine(res.data)).toBe(
        "Calle 100 # 15-20 (Apto 401, Torre B, Conjunto Lucams · Ref: portería norte)",
      );
    }
  });

  it("oficina: oficina + piso + empresa", () => {
    const res = AddressSchema.safeParse(
      urban({
        destinationType: "oficina",
        officeNumber: "302",
        floor: "3",
        companyName: "Lucams",
      }),
    );
    expect(res.success).toBe(true);
    if (res.success) {
      expect(composeAddressLine(res.data)).toBe("Calle 3 # 15-20 (Oficina 302, Piso 3, Lucams)");
    }
  });

  it("casa con solo punto de referencia", () => {
    const res = AddressSchema.safeParse(
      urban({ destinationType: "casa", referencePoint: "frente al parque" }),
    );
    expect(res.success).toBe(true);
    if (res.success) {
      expect(composeAddressLine(res.data)).toBe("Calle 3 # 15-20 (Ref: frente al parque)");
    }
  });

  it("los campos estructurados se prefieren sobre el detail legacy", () => {
    const res = AddressSchema.safeParse(
      urban({ destinationType: "edificio", apartment: "401", detail: "texto viejo" }),
    );
    expect(res.success).toBe(true);
    if (res.success) {
      expect(composeAddressLine(res.data)).toBe("Calle 3 # 15-20 (Apto 401)");
    }
  });

  it("sin campos estructurados, el detail legacy sigue intacto", () => {
    const res = AddressSchema.safeParse(urban({ detail: "apto 402" }));
    expect(res.success).toBe(true);
    if (res.success) {
      expect(composeAddressLine(res.data)).toBe("Calle 3 # 15-20 (apto 402)");
    }
  });
});

describe("AddressSchema rural — teléfono alternativo en la zona (2026-10)", () => {
  const rural = {
    kind: "rural" as const,
    deptCode: "11",
    cityCode: "11001",
    department: "Bogotá, D.C.",
    city: "Bogotá, D.C.",
    vereda: "El Roble",
    referencia: "a 200m del puente, casa azul portón negro",
  };

  it("altPhone válido se compone al final como «Tel. zona: X»", () => {
    const res = AddressSchema.safeParse({ ...rural, altPhone: "3001234567" });
    expect(res.success).toBe(true);
    if (res.success) {
      expect(composeAddressLine(res.data)).toBe(
        "Vereda El Roble · Ref: a 200m del puente, casa azul portón negro · Tel. zona: 3001234567",
      );
    }
  });

  it("altPhone inválido (no es móvil CO) se rechaza", () => {
    const res = AddressSchema.safeParse({ ...rural, altPhone: "12345" });
    expect(res.success).toBe(false);
    if (!res.success) {
      const fields = res.error.flatten().fieldErrors as Record<string, string[] | undefined>;
      expect(fields.altPhone?.[0]).toContain("móvil colombiano");
    }
  });

  it("sin altPhone la línea rural no cambia", () => {
    const res = AddressSchema.safeParse(rural);
    expect(res.success).toBe(true);
    if (res.success) {
      expect(composeAddressLine(res.data)).toBe(
        "Vereda El Roble · Ref: a 200m del puente, casa azul portón negro",
      );
    }
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
