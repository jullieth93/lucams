/*
 * Tests — saveAddressAction (/mi-cuenta/direcciones):
 *  - Localidad/zona OBLIGATORIA cuando la ciudad está en el catálogo de zonas
 *    (lib/lucams-zones) — misma regla que saveDatosAction del checkout.
 *  - Teléfono con indicativo (PhoneInput): CO → 10 dígitos locales; inválido
 *    → error fail-closed coherente con el cliente.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

const getCurrentCustomer = vi.hoisted(() => vi.fn());
const createAddress = vi.hoisted(() =>
  vi.fn(async (_customerId: string, _input: unknown) => ({ id: "addr-1" })),
);
const updateAddress = vi.hoisted(() =>
  vi.fn(async (_customerId: string, _id: string, _input: unknown) => ({ id: "addr-1" })),
);

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/auth", () => ({ getCurrentCustomer }));
vi.mock("@/features/addresses/service", async (importActual) => {
  const actual = await importActual<typeof import("@/features/addresses/service")>();
  return {
    ...actual,
    createAddress,
    updateAddress,
    deleteAddress: vi.fn(),
    setDefaultAddress: vi.fn(),
  };
});

import { saveAddressAction } from "./actions";

/** FormData válida: Bogotá urbana (en el catálogo de zonas → exige localidad).
 *  Incluye destinationType (obligatorio en capturas urbanas desde 2026-10). */
function addressForm(over: Record<string, string> = {}): FormData {
  const fd = new FormData();
  fd.set("name", "Casa");
  fd.set("phone", "+57 3208873826");
  fd.set("deptCode", "11");
  fd.set("cityCode", "11001");
  fd.set("addressKind", "urban");
  fd.set("viaType", "Calle");
  fd.set("viaNumber", "100");
  fd.set("cruceNumber", "15-20");
  fd.set("destinationType", "casa");
  fd.set("localityId", "chapinero");
  for (const [k, v] of Object.entries(over)) fd.set(k, v);
  return fd;
}

beforeEach(() => {
  vi.clearAllMocks();
  getCurrentCustomer.mockResolvedValue({ customer: { id: "cust-1" } });
});

describe("saveAddressAction — localidad obligatoria en ciudades del catálogo", () => {
  it("Bogotá SIN localidad → error de campo localityId", async () => {
    const fd = addressForm();
    fd.delete("localityId");
    const res = await saveAddressAction(null, fd);
    expect(res.success).toBeUndefined();
    expect(res.fieldErrors?.localityId?.[0]).toMatch(/Elige tu localidad/);
    expect(createAddress).not.toHaveBeenCalled();
  });

  it("Bogotá con localidad válida → se guarda y viaja en structured", async () => {
    const res = await saveAddressAction(null, addressForm());
    expect(res.success).toBeDefined();
    expect(createAddress).toHaveBeenCalledTimes(1);
    const input = createAddress.mock.calls[0]?.[1] as { structured: Record<string, unknown> };
    expect(input.structured.localityId).toBe("chapinero");
  });

  it("localidad de otra ciudad (anti-tamper) → se descarta y se exige una válida", async () => {
    const res = await saveAddressAction(null, addressForm({ localityId: "mordor" }));
    expect(res.fieldErrors?.localityId?.[0]).toMatch(/Elige tu localidad/);
    expect(createAddress).not.toHaveBeenCalled();
  });

  it("ciudad fuera del catálogo de zonas (Medellín) → localidad no se exige", async () => {
    const res = await saveAddressAction(
      null,
      addressForm({ deptCode: "05", cityCode: "05001", localityId: "" }),
    );
    expect(res.success).toBeDefined();
    expect(createAddress).toHaveBeenCalledTimes(1);
  });
});

describe("saveAddressAction — teléfono con indicativo", () => {
  it("'+57 3208873826' se persiste normalizado a 10 dígitos", async () => {
    const res = await saveAddressAction(null, addressForm({ phone: "+57 3208873826" }));
    expect(res.success).toBeDefined();
    expect((createAddress.mock.calls[0]?.[1] as { phone: string }).phone).toBe("3208873826");
  });

  it("móvil CO bare de 10 dígitos (legado) sigue válido", async () => {
    const res = await saveAddressAction(null, addressForm({ phone: "3208873826" }));
    expect(res.success).toBeDefined();
    expect((createAddress.mock.calls[0]?.[1] as { phone: string }).phone).toBe("3208873826");
  });

  it("fijo o largo incorrecto → error fail-closed (mismo criterio del checkout)", async () => {
    const res = await saveAddressAction(null, addressForm({ phone: "+57 6011234567" }));
    expect(res.fieldErrors?.phone?.[0]).toMatch(/10 dígitos/);
    expect(createAddress).not.toHaveBeenCalled();
  });

  it("otro país válido se persiste como '+<indicativo><nacional>'", async () => {
    const res = await saveAddressAction(null, addressForm({ phone: "+52 5512345678" }));
    expect(res.success).toBeDefined();
    expect((createAddress.mock.calls[0]?.[1] as { phone: string }).phone).toBe("+525512345678");
  });

  it("sin sesión → error, sin tocar el servicio", async () => {
    getCurrentCustomer.mockResolvedValue(null);
    const res = await saveAddressAction(null, addressForm());
    expect(res.error).toMatch(/sesión expiró/i);
    expect(createAddress).not.toHaveBeenCalled();
  });
});
