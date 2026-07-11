/*
 * Integración DB — deleteCustomerAccount (supresión Ley 1581). Verifica que la
 * transacción anonimiza/scrubbea la PII core y llama a la revocación del auth user.
 * Supabase (Storage + auth admin) se mockea (no tocamos infra externa en tests).
 *
 * Aislamiento: Customer de prueba RUN-prefijado; afterAll borra lo creado.
 */

import { afterAll, describe, expect, it, vi } from "vitest";

const { removeMock, deleteUserMock } = vi.hoisted(() => ({
  removeMock: vi.fn().mockResolvedValue({ error: null }),
  deleteUserMock: vi.fn().mockResolvedValue({ error: null }),
}));
vi.mock("@/lib/supabase/service", () => ({
  supabaseService: {
    storage: { from: () => ({ remove: removeMock }) },
    auth: {
      admin: {
        deleteUser: deleteUserMock,
        updateUserById: vi.fn().mockResolvedValue({ error: null }),
      },
    },
  },
}));

import { prisma } from "@/lib/db";
import { deleteCustomerAccount } from "./delete-service";

const hasDb = Boolean(process.env.DATABASE_URL);
const RUN = `ITESTDELACC${Date.now()}${Math.floor(Math.random() * 1e6)}`;

describe.skipIf(!hasDb)("deleteCustomerAccount — supresión Ley 1581", { timeout: 30_000 }, () => {
  const ids: { customerId?: string } = {};

  afterAll(async () => {
    if (ids.customerId) {
      await prisma.supportTicket.deleteMany({ where: { customerId: ids.customerId } }).catch(() => {});
      // Los tickets fueron desvinculados (customerId null) — borrar por email placeholder.
      await prisma.supportTicket
        .deleteMany({ where: { email: `deleted-${ids.customerId}@deleted.lucamsshop.co` } })
        .catch(() => {});
      await prisma.address.deleteMany({ where: { customerId: ids.customerId } }).catch(() => {});
      await prisma.customer.deleteMany({ where: { id: ids.customerId } }).catch(() => {});
    }
  });

  it("anonimiza Customer, scrubbea Address, desvincula/scrubbea SupportTicket y revoca el auth user", async () => {
    const supabaseUserId = `${RUN}-uid`;
    const customer = await prisma.customer.create({
      data: {
        email: `${RUN}@test.local`,
        supabaseUserId,
        referralCode: `${RUN}`.slice(0, 40),
        firstName: "Juana",
        lastName: "Pérez",
        phone: "3001234567",
      },
      select: { id: true },
    });
    ids.customerId = customer.id;

    await prisma.address.create({
      data: {
        customerId: customer.id,
        name: "Casa",
        line1: "Calle 1 # 2-3",
        city: "Bogotá",
        department: "Cundinamarca",
        phone: "3001234567",
        isDefault: true,
      },
    });
    await prisma.supportTicket.create({
      data: {
        customerId: customer.id,
        email: `${RUN}@test.local`,
        name: "Juana Pérez",
        subject: "Ayuda",
        message: "Mi teléfono es 3001234567 y vivo en...", // PII en texto libre
      },
    });

    await deleteCustomerAccount(customer.id, supabaseUserId);

    // Customer anonimizado.
    const c = await prisma.customer.findUnique({ where: { id: customer.id } });
    expect(c?.email).toBe(`deleted-${customer.id}@deleted.lucamsshop.co`);
    expect(c?.firstName).toBeNull();
    expect(c?.lastName).toBeNull();
    expect(c?.phone).toBeNull();
    expect(c?.supabaseUserId).toBe(`deleted-${customer.id}`);
    expect(c?.deletedAt).not.toBeNull();

    // Address scrubbeada + soft-deleted.
    const addr = await prisma.address.findFirst({ where: { customerId: customer.id } });
    expect(addr?.name).toBe("Cliente eliminado");
    expect(addr?.phone).toBe("");
    expect(addr?.line1).toBe("");
    expect(addr?.deletedAt).not.toBeNull();

    // SupportTicket desvinculado + scrubbeado.
    const ticket = await prisma.supportTicket.findFirst({
      where: { email: `deleted-${customer.id}@deleted.lucamsshop.co` },
    });
    expect(ticket?.customerId).toBeNull();
    expect(ticket?.name).toBe("Cliente eliminado");
    expect(ticket?.message).not.toContain("3001234567");

    // Auth user revocado.
    expect(deleteUserMock).toHaveBeenCalledWith(supabaseUserId);
  });
});
