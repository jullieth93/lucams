/*
 * Tests — updateProfileAction (/mi-cuenta/perfil): validación y transformación
 * estandarizada con lib/colombia-validators (misma regla del checkout).
 *  - Nombre máx 3 palabras / apellido máx 2, solo letras, capitalizeName.
 *  - Teléfono con indicativo: CO → 10 dígitos locales; otro país → "+dial+n".
 *  - Documento por tipo (validateDocument); NIT de 9 dígitos recibe el DV DIAN.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

const getCurrentCustomer = vi.hoisted(() => vi.fn());
const customerUpdate = vi.hoisted(() => vi.fn(async () => ({})));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/auth", () => ({ getCurrentCustomer }));
vi.mock("@/lib/db", () => ({ prisma: { customer: { update: customerUpdate } } }));
vi.mock("@/lib/logger", () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { updateProfileAction } from "./actions";

function profileForm(over: Record<string, string> = {}): FormData {
  const fd = new FormData();
  fd.set("firstName", "Valentina");
  fd.set("lastName", "Rojas");
  fd.set("phone", "+57 3208873826");
  fd.set("documentType", "CC");
  fd.set("documentNumber", "1234567890");
  for (const [k, v] of Object.entries(over)) fd.set(k, v);
  return fd;
}

beforeEach(() => {
  vi.clearAllMocks();
  getCurrentCustomer.mockResolvedValue({ customer: { id: "cust-1" } });
});

describe("updateProfileAction — sesión", () => {
  it("sin sesión → error de sesión expirada, sin tocar la DB", async () => {
    getCurrentCustomer.mockResolvedValue(null);
    const res = await updateProfileAction(null, profileForm());
    expect(res.error).toMatch(/sesión expiró/i);
    expect(customerUpdate).not.toHaveBeenCalled();
  });
});

describe("updateProfileAction — nombre/apellido estandarizados", () => {
  it("persiste title case (capitalizeName) respetando preposiciones", async () => {
    const res = await updateProfileAction(
      null,
      profileForm({ firstName: "lucy del pilar", lastName: "DE LEÓN" }),
    );
    expect(res.success).toBeDefined();
    expect(customerUpdate).toHaveBeenCalledWith({
      where: { id: "cust-1" },
      data: expect.objectContaining({
        firstName: "Lucy del Pilar",
        lastName: "De León",
      }),
    });
  });

  it("nombre de 4 palabras → error (máx 3)", async () => {
    const res = await updateProfileAction(null, profileForm({ firstName: "Ana Maria De la Cruz" }));
    expect(res.fieldErrors?.firstName?.[0]).toContain("3 palabras");
    expect(customerUpdate).not.toHaveBeenCalled();
  });

  it("apellido de 3 palabras → error (máx 2)", async () => {
    const res = await updateProfileAction(null, profileForm({ lastName: "García De León" }));
    expect(res.fieldErrors?.lastName?.[0]).toContain("2 palabras");
  });

  it("nombre con dígitos → error solo letras", async () => {
    const res = await updateProfileAction(null, profileForm({ firstName: "Ana2" }));
    expect(res.fieldErrors?.firstName?.[0]).toMatch(/letras/);
  });
});

describe("updateProfileAction — teléfono con indicativo", () => {
  it("Colombia: '+57 320 887 3826' se persiste como 10 dígitos locales", async () => {
    const res = await updateProfileAction(null, profileForm({ phone: "+57 320 887 3826" }));
    expect(res.success).toBeDefined();
    expect(customerUpdate).toHaveBeenCalledWith({
      where: { id: "cust-1" },
      data: expect.objectContaining({ phone: "3208873826" }),
    });
  });

  it("Colombia: fijo (601…) o largo incorrecto → error fail-closed", async () => {
    const res = await updateProfileAction(null, profileForm({ phone: "+57 6011234567" }));
    expect(res.fieldErrors?.phone?.[0]).toMatch(/10 dígitos/);
    expect(customerUpdate).not.toHaveBeenCalled();
  });

  it("otro país: '+54 9112345678' se persiste como +549112345678", async () => {
    const res = await updateProfileAction(null, profileForm({ phone: "+54 9112345678" }));
    expect(res.success).toBeDefined();
    expect(customerUpdate).toHaveBeenCalledWith({
      where: { id: "cust-1" },
      data: expect.objectContaining({ phone: "+549112345678" }),
    });
  });

  it("teléfono vacío → se persiste null (campo opcional)", async () => {
    const res = await updateProfileAction(null, profileForm({ phone: "" }));
    expect(res.success).toBeDefined();
    expect(customerUpdate).toHaveBeenCalledWith({
      where: { id: "cust-1" },
      data: expect.objectContaining({ phone: null }),
    });
  });
});

describe("updateProfileAction — documento por tipo", () => {
  it("CC con letras → error con la ayuda del tipo", async () => {
    const res = await updateProfileAction(null, profileForm({ documentNumber: "12345a" }));
    expect(res.fieldErrors?.documentNumber?.[0]).toContain("6 a 10 dígitos");
    expect(customerUpdate).not.toHaveBeenCalled();
  });

  it("CE de 8 dígitos → inválida (máx 7)", async () => {
    const res = await updateProfileAction(
      null,
      profileForm({ documentType: "CE", documentNumber: "12345678" }),
    );
    expect(res.fieldErrors?.documentNumber?.[0]).toMatch(/Formato inválido/);
  });

  it("Pasaporte alfanumérico → aceptado", async () => {
    const res = await updateProfileAction(
      null,
      profileForm({ documentType: "PP", documentNumber: "AB123456" }),
    );
    expect(res.success).toBeDefined();
    expect(customerUpdate).toHaveBeenCalledWith({
      where: { id: "cust-1" },
      data: expect.objectContaining({ documentType: "PP", documentNumber: "AB123456" }),
    });
  });

  it("NIT de 9 dígitos sin DV → se persiste con el dígito de verificación DIAN", async () => {
    const res = await updateProfileAction(
      null,
      profileForm({ documentType: "NIT", documentNumber: "900123456" }),
    );
    expect(res.success).toBeDefined();
    // calculateNitDV("900123456") = "8" (verificado en colombia-validators.test).
    expect(customerUpdate).toHaveBeenCalledWith({
      where: { id: "cust-1" },
      data: expect.objectContaining({ documentNumber: "900123456-8" }),
    });
  });

  it("tipo sin número (o viceversa) → error ambos-o-ninguno", async () => {
    const res = await updateProfileAction(null, profileForm({ documentNumber: "" }));
    expect(res.fieldErrors?.documentNumber?.[0]).toMatch(/Completa el tipo y el número/);
  });

  it("ambos vacíos → documento null (opcional)", async () => {
    const res = await updateProfileAction(
      null,
      profileForm({ documentType: "", documentNumber: "" }),
    );
    expect(res.success).toBeDefined();
    expect(customerUpdate).toHaveBeenCalledWith({
      where: { id: "cust-1" },
      data: expect.objectContaining({ documentType: null, documentNumber: null }),
    });
  });
});
