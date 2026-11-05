/*
 * Integración PostgreSQL — Guardrails staff=cliente (2026-11-04).
 *
 * Certifica la decisión "no prohibir, gobernar":
 *  1. El resolution-service marca `Contact.isStaff` cuando el email pertenece a un
 *     AdminUser activo (flujo vivo de cliente registrado).
 *  2. `recordAdminAction` marca `selfDealing: true` cuando el actor gestiona un
 *     registro asociado a su PROPIO correo (segregación de funciones, fail-open).
 *  3. El flag NO se marca cuando actor y titular son personas distintas.
 */

import { afterAll, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/db";

// recordAdminAction lee headers() de Next — en tests de integración lo mockeamos.
vi.mock("next/headers", () => ({
  headers: async () => new Headers({ "user-agent": "vitest" }),
}));

import { ensureCustomerContact } from "@/features/identity/resolution-service";
import { recordAdminAction } from "@/lib/admin-audit";

const hasDb = Boolean(process.env.DATABASE_URL);
const RUN = `stfg${Date.now().toString(36)}${Math.floor(Math.random() * 1e4).toString(36)}`;
const STAFF_EMAIL = `${RUN}-admin@lucams.test`;
const CLIENT_EMAIL = `${RUN}-cliente@lucams.test`;

describe.skipIf(!hasDb)("Guardrails staff=cliente", () => {
  const cleanupIds: { admins: string[]; customers: string[]; orders: string[] } = {
    admins: [],
    customers: [],
    orders: [],
  };

  afterAll(async () => {
    const safe = (p: Promise<unknown>) => p.catch(() => {});
    await safe(
      prisma.adminActionLog.deleteMany({
        where: { entityId: { in: cleanupIds.orders } },
      }),
    );
    await safe(prisma.contact.deleteMany({ where: { primaryEmail: { contains: RUN } } }));
    await safe(prisma.order.deleteMany({ where: { id: { in: cleanupIds.orders } } }));
    await safe(prisma.customer.deleteMany({ where: { id: { in: cleanupIds.customers } } }));
    await safe(prisma.adminUser.deleteMany({ where: { id: { in: cleanupIds.admins } } }));
  });

  it("el contacto de un Customer con email de staff queda marcado isStaff", async () => {
    const admin = await prisma.adminUser.create({
      data: {
        email: STAFF_EMAIL,
        supabaseUserId: `${RUN}-sub-admin`,
        role: "SUPERADMIN",
      },
      select: { id: true },
    });
    cleanupIds.admins.push(admin.id);

    const customer = await prisma.customer.create({
      data: {
        email: STAFF_EMAIL,
        supabaseUserId: `${RUN}-sub-cust`,
        referralCode: `${RUN}-ref`,
      },
      select: { id: true },
    });
    cleanupIds.customers.push(customer.id);

    const contactId = await ensureCustomerContact(prisma, {
      customerId: customer.id,
      emailVerified: true,
      verificationSource: "TEST",
    });
    expect(contactId).toBeTruthy();

    const contact = await prisma.contact.findUnique({
      where: { id: contactId! },
      select: { isStaff: true },
    });
    expect(contact?.isStaff).toBe(true);
  });

  it("un Customer sin email de staff NO queda marcado", async () => {
    const customer = await prisma.customer.create({
      data: {
        email: CLIENT_EMAIL,
        supabaseUserId: `${RUN}-sub-cli`,
        referralCode: `${RUN}-ref2`,
      },
      select: { id: true },
    });
    cleanupIds.customers.push(customer.id);

    const contactId = await ensureCustomerContact(prisma, {
      customerId: customer.id,
      emailVerified: true,
      verificationSource: "TEST",
    });
    const contact = await prisma.contact.findUnique({
      where: { id: contactId! },
      select: { isStaff: true },
    });
    expect(contact?.isStaff).toBe(false);
  });

  it("recordAdminAction marca selfDealing cuando el actor gestiona su propio pedido", async () => {
    const admin = await prisma.adminUser.findFirst({
      where: { email: STAFF_EMAIL },
      select: { id: true, email: true },
    });
    expect(admin).toBeTruthy();

    // Pedido cuyo correo de compra ES el del actor admin (staff comprando como cliente).
    const ownOrder = await prisma.order.create({
      data: {
        number: `${RUN}-own`,
        email: STAFF_EMAIL,
        phone: "3001112233",
        shippingAddress: { fullName: "Staff", city: "Bogotá", department: "Bogotá D.C." },
        subtotal: 10_000,
        shipping: 0,
        total: 10_000,
        paymentMethod: "COD",
        status: "DELIVERED",
      },
      select: { id: true },
    });
    cleanupIds.orders.push(ownOrder.id);

    await recordAdminAction({
      actorId: admin!.id,
      action: "cod.mark_remitted",
      entityType: "Order",
      entityId: ownOrder.id,
      metadata: { amountCents: 10_000 },
    });

    const log = await prisma.adminActionLog.findFirst({
      where: { entityId: ownOrder.id, action: "cod.mark_remitted" },
      orderBy: { createdAt: "desc" },
      select: { metadata: true },
    });
    expect((log?.metadata as Record<string, unknown>)?.selfDealing).toBe(true);

    // Pedido de OTRA persona con la misma acción → sin flag.
    const otherOrder = await prisma.order.create({
      data: {
        number: `${RUN}-other`,
        email: CLIENT_EMAIL,
        phone: "3001112233",
        shippingAddress: { fullName: "Cliente", city: "Bogotá", department: "Bogotá D.C." },
        subtotal: 10_000,
        shipping: 0,
        total: 10_000,
        paymentMethod: "COD",
        status: "DELIVERED",
      },
      select: { id: true },
    });
    cleanupIds.orders.push(otherOrder.id);

    await recordAdminAction({
      actorId: admin!.id,
      action: "cod.mark_remitted",
      entityType: "Order",
      entityId: otherOrder.id,
      metadata: { amountCents: 10_000 },
    });

    const log2 = await prisma.adminActionLog.findFirst({
      where: { entityId: otherOrder.id, action: "cod.mark_remitted" },
      orderBy: { createdAt: "desc" },
      select: { metadata: true },
    });
    expect((log2?.metadata as Record<string, unknown>)?.selfDealing).toBeUndefined();
  });
});
