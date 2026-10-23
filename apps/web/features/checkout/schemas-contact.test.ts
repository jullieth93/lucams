/*
 * Tests del ContactSchema — superRefine de documento coherente con su tipo
 * (2026-10-22): los campos siguen opcionales (órdenes/perfiles sin documento
 * pasan), pero si hay valor se exige el par tipo+número y el número debe
 * cumplir el regex de su tipo (misma fuente que la validación cliente del
 * checkout y el perfil de /mi-cuenta: lib/colombia-validators).
 */

import { describe, expect, it } from "vitest";
import { ContactSchema } from "./schemas";

/** Contacto base válido (sin documento). */
function contact(over: Record<string, unknown> = {}) {
  return {
    fullName: "Valentina Rojas",
    email: "valentina@test.co",
    phone: "3001234567",
    ...over,
  };
}

function docErrors(data: Record<string, unknown>): string[] {
  const res = ContactSchema.safeParse(data);
  if (res.success) return [];
  const flat = res.error.flatten();
  return [
    ...((flat.fieldErrors.documentType as string[] | undefined) ?? []),
    ...((flat.fieldErrors.documentNumber as string[] | undefined) ?? []),
  ];
}

describe("ContactSchema — documento opcional", () => {
  it("pasa sin tipo ni número (campos vacíos siguen siendo válidos)", () => {
    expect(ContactSchema.safeParse(contact()).success).toBe(true);
  });

  it("rechaza número sin tipo", () => {
    const errs = docErrors(contact({ documentNumber: "1234567890" }));
    expect(errs[0]).toContain("Completa el tipo y el número de documento");
  });

  it("rechaza tipo sin número", () => {
    const errs = docErrors(contact({ documentType: "CC" }));
    expect(errs[0]).toContain("Completa el tipo y el número de documento");
  });
});

describe("ContactSchema — formato por tipo (casos válidos)", () => {
  it.each([
    ["CC", "1234567890"],
    ["CE", "1234567"],
    ["NIT", "900123456-7"],
    ["PP", "AB123456"],
    ["TI", "1029384756"],
  ] as const)("%s %s válido pasa", (documentType, documentNumber) => {
    expect(ContactSchema.safeParse(contact({ documentType, documentNumber })).success).toBe(true);
  });
});

describe("ContactSchema — formato por tipo (casos inválidos)", () => {
  it.each([
    ["CC", "12345A"], // letra (el min 6 del schema base tapa los cortos)
    ["CC", "12345678901"], // largo (máx 10)
    ["CE", "12345678"], // largo (máx 7)
    ["NIT", "12345678"], // corto (9 + DV opcional)
    ["PP", "AB-123"], // símbolo no alfanumérico
    ["TI", "1234567"], // corto (mín 8)
  ] as const)("%s %s inválido se rechaza con ayuda del tipo", (documentType, documentNumber) => {
    const res = ContactSchema.safeParse(contact({ documentType, documentNumber }));
    expect(res.success).toBe(false);
    const errs = docErrors(contact({ documentType, documentNumber }));
    expect(errs.some((e) => e.includes("Formato inválido."))).toBe(true);
  });

  it("el mensaje incluye la ayuda específica del tipo (ej. CC 6 a 10 dígitos)", () => {
    const errs = docErrors(contact({ documentType: "CC", documentNumber: "12345A" }));
    expect(errs.some((e) => e.includes("6 a 10 dígitos"))).toBe(true);
  });
});
