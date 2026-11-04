/*
 * Unit tests de resolveOrderCustomerId / emailsEqual ([ID-01], auditoría 2026-11).
 *
 * Regla de seguridad bajo test:
 *  - guest sin sesión (`sessionCustomerId === null`) → `null` sin consultar la DB
 *    (jamás vincula pedidos no autenticados a un Customer existente por email).
 *  - sesión activa (`cust_a` no borrado) → siempre `cust_a`, aunque `contactEmail`
 *    coincida con otro Customer `cust_b` o con un correo externo (impide robo de
 *    Puntos Lucams y fuga de diseños/datos privados entre cuentas).
 *  - sesión cuyo Customer fue eliminado (`deletedAt != null`) → `null` (tampoco
 *    cae a buscar por `contactEmail`).
 */

import { describe, expect, it, vi } from "vitest";

import { emailsEqual, resolveOrderCustomerId } from "./order-customer";

function stubClient(byId: { id: string } | null) {
  const findFirst = vi.fn(async (args: { where: { id?: string } }) => {
    if (args.where.id) return byId;
    throw new Error("PROHIBIDO buscar Customer por email sin sesión verificada ([ID-01])");
  });
  return {
    client: { customer: { findFirst } } as never,
    findFirst,
  };
}

describe("emailsEqual", () => {
  it("compara case-insensitive y tolera espacios laterales", () => {
    expect(emailsEqual("Crittan01@Gmail.com", " crittan01@gmail.com ")).toBe(true);
    expect(emailsEqual("a@x.co", "b@x.co")).toBe(false);
    expect(emailsEqual(null, "a@x.co")).toBe(false);
    expect(emailsEqual("", "a@x.co")).toBe(false);
  });
});

describe("resolveOrderCustomerId ([ID-01])", () => {
  it("guest sin sesión (customerId null) → null sin consultar la DB aunque el correo exista", async () => {
    const { client, findFirst } = stubClient({ id: "cust_victim" });
    await expect(resolveOrderCustomerId(client, null, "victim@x.co")).resolves.toBeNull();
    expect(findFirst).not.toHaveBeenCalled();
  });

  it("sesión activa con mismo correo (distinto case) → customerId de la sesión", async () => {
    const { client, findFirst } = stubClient({ id: "cust_a" });
    await expect(resolveOrderCustomerId(client, "cust_a", "ANA@X.co")).resolves.toBe("cust_a");
    expect(findFirst).toHaveBeenCalledTimes(1);
  });

  it("BLOCKER [ID-01]: sesión de cust_a con email de cust_b NUNCA reasigna el pedido a cust_b", async () => {
    const { client, findFirst } = stubClient({ id: "cust_a" });
    await expect(resolveOrderCustomerId(client, "cust_a", "victim_b@x.co")).resolves.toBe("cust_a");
    expect(findFirst).toHaveBeenCalledTimes(1);
  });

  it("sesión de cust_a con correo secundario sin cuenta → conserva cust_a (evita claim ajeno posterior)", async () => {
    const { client } = stubClient({ id: "cust_a" });
    await expect(resolveOrderCustomerId(client, "cust_a", "trabajo@empresa.co")).resolves.toBe(
      "cust_a",
    );
  });

  it("Customer de sesión soft-deleted/inexistente → null sin caer a búsqueda por email", async () => {
    const { client, findFirst } = stubClient(null);
    await expect(
      resolveOrderCustomerId(client, "cust_borrado", "victim_b@x.co"),
    ).resolves.toBeNull();
    expect(findFirst).toHaveBeenCalledTimes(1);
  });
});
