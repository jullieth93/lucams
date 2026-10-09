/*
 * Unit tests de resolveOrderCustomerId / emailsEqual (bug STG 2026-10, pedido
 * LCM-2026-0010): con sesión activa, el pedido quedaba amarrado al Customer de
 * la sesión aunque el contacto digitado fuera otro correo.
 *
 * Regla bajo test:
 *  - guest sin sesión → null (sin cambios).
 *  - email del contacto === email del Customer de sesión (case-insensitive)
 *    → customerId de la sesión.
 *  - difieren → Customer dueño del email digitado si existe; null si no
 *    (Customer no se puede crear sin supabaseUserId — ver order-customer.ts).
 *
 * Sin DB: el client es un stub con customer.findFirst programado.
 */

import { describe, expect, it, vi } from "vitest";

import { emailsEqual, resolveOrderCustomerId } from "./order-customer";

function stubClient(byId: { id: string; email: string } | null, byEmail: { id: string } | null) {
  const findFirst = vi.fn(async (args: { where: { id?: string; email?: unknown } }) => {
    if (args.where.id) return byId;
    return byEmail;
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

describe("resolveOrderCustomerId", () => {
  it("guest sin sesión (customerId null) → null sin consultar la DB", async () => {
    const { client, findFirst } = stubClient(null, null);
    await expect(resolveOrderCustomerId(client, null, "guest@x.co")).resolves.toBeNull();
    expect(findFirst).not.toHaveBeenCalled();
  });

  it("emails coinciden (distinto case) → customerId de la sesión", async () => {
    const { client, findFirst } = stubClient({ id: "cust_a", email: "Ana@X.co" }, null);
    await expect(resolveOrderCustomerId(client, "cust_a", "ana@x.co")).resolves.toBe("cust_a");
    // Match a la primera: no hace falta el lookup por email.
    expect(findFirst).toHaveBeenCalledTimes(1);
  });

  it("emails difieren y el del contacto YA tiene Customer → re-vincula a ese", async () => {
    const { client } = stubClient({ id: "cust_a", email: "admin@x.co" }, { id: "cust_b" });
    await expect(resolveOrderCustomerId(client, "cust_a", "buyer@x.co")).resolves.toBe("cust_b");
  });

  it("emails difieren y el del contacto NO tiene Customer → null (pedido guest)", async () => {
    const { client } = stubClient({ id: "cust_a", email: "admin@x.co" }, null);
    await expect(resolveOrderCustomerId(client, "cust_a", "nuevo@x.co")).resolves.toBeNull();
  });

  it("el Customer de sesión ya no existe: cae al lookup por email del contacto", async () => {
    const { client, findFirst } = stubClient(null, { id: "cust_b" });
    await expect(resolveOrderCustomerId(client, "cust_borrao", "buyer@x.co")).resolves.toBe(
      "cust_b",
    );
    expect(findFirst).toHaveBeenCalledTimes(2);
  });

  it("el lookup por email es case-insensitive y trimmed (delegado a Prisma)", async () => {
    const { client, findFirst } = stubClient({ id: "cust_a", email: "a@x.co" }, null);
    await resolveOrderCustomerId(client, "cust_a", "  Buyer@X.co ");
    expect(findFirst).toHaveBeenLastCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          email: { equals: "Buyer@X.co", mode: "insensitive" },
          deletedAt: null,
        }),
      }),
    );
  });
});
