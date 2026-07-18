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
  const ids: { customerId?: string; productId?: string; categoryId?: string } = {};

  afterAll(async () => {
    const safe = (p: Promise<unknown>) => p.catch(() => {});
    if (ids.customerId) {
      await safe(prisma.supportTicket.deleteMany({ where: { customerId: ids.customerId } }));
      // Los tickets fueron desvinculados (customerId null) — borrar por email placeholder.
      await safe(
        prisma.supportTicket.deleteMany({
          where: { email: `deleted-${ids.customerId}@deleted.lucamsshop.co` },
        }),
      );
      await safe(prisma.abandonedCart.deleteMany({ where: { email: { contains: RUN } } }));
      await safe(prisma.cart.deleteMany({ where: { sessionId: { startsWith: RUN } } }));
      await safe(
        prisma.backInStockSubscription.deleteMany({ where: { email: { contains: RUN } } }),
      );
      await safe(prisma.address.deleteMany({ where: { customerId: ids.customerId } }));
    }
    if (ids.productId) {
      await safe(prisma.orderItem.deleteMany({ where: { variant: { productId: ids.productId } } }));
      await safe(prisma.order.deleteMany({ where: { number: { startsWith: RUN } } }));
      await safe(prisma.productVariant.deleteMany({ where: { productId: ids.productId } }));
      await safe(prisma.product.deleteMany({ where: { id: ids.productId } }));
    }
    if (ids.categoryId) await safe(prisma.category.deleteMany({ where: { id: ids.categoryId } }));
    // Por email (cubre reintentos que crearon varios) + el placeholder de supresión.
    await safe(prisma.customer.deleteMany({ where: { email: { contains: RUN } } }));
    if (ids.customerId)
      await safe(
        prisma.customer.deleteMany({
          where: { email: `deleted-${ids.customerId}@deleted.lucamsshop.co` },
        }),
      );
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

    // H8 — pedido ENTREGADO con email/phone del titular en columnas propias + suscripciones activas.
    const category = await prisma.category.create({
      data: { slug: `${RUN}-c`, name: "c" },
      select: { id: true },
    });
    ids.categoryId = category.id;
    const product = await prisma.product.create({
      data: {
        slug: `${RUN}-p`,
        name: `Imán ${RUN}`,
        description: "x",
        basePrice: 1000,
        sku: `${RUN}-P`.toUpperCase(),
        categoryId: category.id,
        variants: {
          create: [
            { name: "u", sku: `${RUN}-V`.toUpperCase(), price: 1000, stock: 5, attributes: {} },
          ],
        },
      },
      select: { id: true, variants: { select: { id: true } } },
    });
    ids.productId = product.id;
    await prisma.order.create({
      data: {
        number: `${RUN}-ORD`,
        customerId: customer.id,
        email: `${RUN}@test.local`,
        phone: "3001234567",
        shippingAddress: { fullName: "Juana Pérez", city: "Bogotá", department: "Cundinamarca" },
        subtotal: 1000,
        shipping: 0,
        total: 1000,
        paymentMethod: "COD",
        status: "DELIVERED",
        deliveredAt: new Date(),
        items: { create: [{ variantId: product.variants[0]!.id, qty: 1, unitPrice: 1000 }] },
      },
    });
    await prisma.backInStockSubscription.create({
      data: { productId: product.id, email: `${RUN}@test.local`, customerId: customer.id },
    });
    const cart = await prisma.cart.create({
      data: { sessionId: `${RUN}-cart`, currency: "COP" },
      select: { id: true },
    });
    await prisma.abandonedCart.create({
      data: { cartId: cart.id, email: `${RUN}@test.local` },
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

    // H8 — el pedido conservado ya NO identifica al titular: email/phone scrubbeados.
    const order = await prisma.order.findFirst({ where: { number: `${RUN}-ORD` } });
    expect(order?.email).toBe(`deleted-${customer.id}@deleted.lucamsshop.co`);
    expect(order?.phone).toBe("");

    // H8 — suscripciones cortadas: los crons ya no le escriben al titular borrado.
    expect(
      await prisma.backInStockSubscription.count({ where: { email: `${RUN}@test.local` } }),
    ).toBe(0);
    expect(await prisma.abandonedCart.count({ where: { email: `${RUN}@test.local` } })).toBe(0);
  });
});
