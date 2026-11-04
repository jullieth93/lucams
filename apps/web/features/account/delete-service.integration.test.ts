/*
 * Integración DB — deleteCustomerAccount (supresión Ley 1581). Verifica que la
 * transacción anonimiza/scrubbea la PII core y llama a la revocación del auth user.
 * Supabase (Storage + auth admin) se mockea (no tocamos infra externa en tests).
 *
 * Aislamiento: Customer de prueba RUN-prefijado; afterAll borra lo creado.
 */

import { afterAll, describe, expect, it, vi } from "vitest";

const { removeMock, deleteUserMock, listMock, fetchWithTimeoutMock } = vi.hoisted(() => ({
  removeMock: vi.fn().mockResolvedValue({ error: null }),
  deleteUserMock: vi.fn().mockResolvedValue({ error: null }),
  listMock: vi.fn().mockResolvedValue({ data: [], error: null }),
  fetchWithTimeoutMock: vi.fn().mockResolvedValue({ ok: true, status: 200 }),
}));
vi.mock("@/lib/supabase/service", () => ({
  supabaseService: {
    storage: { from: () => ({ remove: removeMock, list: listMock }) },
    auth: {
      admin: {
        deleteUser: deleteUserMock,
        updateUserById: vi.fn().mockResolvedValue({ error: null }),
      },
    },
  },
}));
vi.mock("@/lib/fetch-with-timeout", () => ({
  fetchWithTimeout: fetchWithTimeoutMock,
}));

import { prisma } from "@/lib/db";
import { deleteCustomerAccount } from "./delete-service";
import { listNewsletterSubscribers } from "@/features/newsletter/admin-service";

const hasDb = Boolean(process.env.DATABASE_URL);
const RUN = `ITESTDELACC${Date.now()}${Math.floor(Math.random() * 1e6)}`;

describe.skipIf(!hasDb)("deleteCustomerAccount — supresión Ley 1581", { timeout: 30_000 }, () => {
  const ids: {
    customerId?: string;
    productId?: string;
    categoryId?: string;
    designId?: string;
    couponId?: string;
    consentIds?: string[];
  } = {};

  afterAll(async () => {
    const safe = (p: Promise<unknown>) => p.catch(() => {});
    if (ids.consentIds && ids.consentIds.length > 0) {
      await safe(
        prisma.consent.deleteMany({
          where: {
            OR: [{ id: { in: ids.consentIds } }, { revokesId: { in: ids.consentIds } }],
          },
        }),
      );
    }
    if (ids.couponId) {
      await safe(prisma.couponUsage.deleteMany({ where: { couponId: ids.couponId } }));
      await safe(prisma.coupon.deleteMany({ where: { id: ids.couponId } }));
    }
    await safe(prisma.referral.deleteMany({ where: { referrerId: { startsWith: RUN } } }));
    if (ids.designId) {
      await safe(prisma.designAsset.deleteMany({ where: { designId: ids.designId } }));
      await safe(prisma.design.deleteMany({ where: { id: ids.designId } }));
    }
    if (ids.customerId) {
      await safe(prisma.supportTicket.deleteMany({ where: { customerId: ids.customerId } }));
      // Los tickets fueron desvinculados (customerId null) — borrar por email placeholder.
      await safe(
        prisma.supportTicket.deleteMany({
          where: { email: `deleted-${ids.customerId}@deleted.lucamsshop.com` },
        }),
      );
      await safe(prisma.abandonedCart.deleteMany({ where: { email: { contains: RUN } } }));
      await safe(prisma.cart.deleteMany({ where: { sessionId: { startsWith: RUN } } }));
      await safe(
        prisma.backInStockSubscription.deleteMany({ where: { email: { contains: RUN } } }),
      );
      await safe(prisma.wishlistItem.deleteMany({ where: { customerId: ids.customerId } }));
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
          where: { email: `deleted-${ids.customerId}@deleted.lucamsshop.com` },
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
    const ticket1 = await prisma.supportTicket.create({
      data: {
        customerId: customer.id,
        email: `${RUN}@test.local`,
        name: "Juana Pérez",
        subject: "Ayuda",
        message: "Mi teléfono es 3001234567 y vivo en...", // PII en texto libre
        messages: {
          create: [
            {
              authorKind: "CUSTOMER",
              authorId: customer.id,
              body: "Mi cédula es 1020304050 y mi correo es juana@ejemplo.co",
            },
            {
              authorKind: "ADMIN",
              authorId: "admin_1",
              body: "Caso gestionado por soporte.",
            },
          ],
        },
      },
      select: { id: true },
    });
    // [PRI-01] Ticket abierto como invitado ANTES de crear cuenta con el mismo correo:
    const guestTicket = await prisma.supportTicket.create({
      data: {
        customerId: null,
        email: `${RUN}@test.local`.toUpperCase(),
        name: "Juana Invitada",
        subject: "Consulta previa",
        message: "Escribo desde mi celular 3001234567 antes de registrarme",
      },
      select: { id: true },
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
    const createdOrder = await prisma.order.create({
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
      select: { id: true },
    });

    // [PRI-01] (S08) — Diseño adoptado con foto subida como invitado (customerId null en DesignAsset)
    // + texto personal en canvasData + preview autorizado /api/design-preview/* + páginas derivadas.
    const design = await prisma.design.create({
      data: {
        customerId: customer.id,
        productId: product.id,
        status: "READY",
        canvasData: { slots: [{ caption: "Familia Pérez @juanaperez" }] },
        metadata: { note: "Regalo Juana" },
        previewUrl: "/api/design-preview/placeholder",
        draftPreviewUrl: "/api/design-preview/placeholder-draft",
        previewPagesCount: 2,
        shareTokenHash: `${RUN}-sharehash`,
        productionUrls: [`${RUN}/piece-01.png`],
      },
      select: { id: true },
    });
    ids.designId = design.id;
    await prisma.design.update({
      where: { id: design.id },
      data: {
        previewUrl: `/api/design-preview/${design.id}/preview.webp`,
        draftPreviewUrl: `/api/design-preview/${design.id}/draft-preview.webp`,
      },
    });
    await prisma.designAsset.create({
      data: {
        designId: design.id,
        customerId: null, // subido antes del login
        sessionId: `${RUN}-anon-sess`,
        storageUrl: `anon/${RUN}/master.jpg`,
        canvasPath: `anon/${RUN}/master.canvas.webp`,
        mimeType: "image/jpeg",
        sizeBytes: 1024,
        width: 1200,
        height: 1200,
      },
    });

    // [PRI-01] (S08) — Consentimientos (NEWSLETTER vigente + HABEAS_DATA), cupón personal,
    // uso de cupón con email y referido.
    const newsletterConsent = await prisma.consent.create({
      data: {
        customerId: customer.id,
        email: `${RUN}@test.local`.toLowerCase(),
        phone: "3001234567",
        scope: "NEWSLETTER",
        accepted: true,
        version: "v1-test",
        ipAddress: "190.1.2.3",
        userAgent: "Mozilla/5.0 Test",
      },
      select: { id: true },
    });
    const habeasConsent = await prisma.consent.create({
      data: {
        customerId: customer.id,
        email: `${RUN}@test.local`.toLowerCase(),
        scope: "HABEAS_DATA",
        accepted: true,
        version: "v1-test",
        ipAddress: "190.1.2.3",
      },
      select: { id: true },
    });
    ids.consentIds = [newsletterConsent.id, habeasConsent.id];

    const personalCoupon = await prisma.coupon.create({
      data: {
        code: `${RUN}-CPN`.toUpperCase().slice(0, 32),
        type: "PERCENT",
        value: 10,
        validFrom: new Date(Date.now() - 60_000),
        validTo: new Date(Date.now() + 86_400_000),
        isActive: true,
        customerId: customer.id,
        description: "Premio de bienvenida para Juana Pérez",
      },
      select: { id: true },
    });
    ids.couponId = personalCoupon.id;
    await prisma.couponUsage.create({
      data: {
        couponId: personalCoupon.id,
        customerId: customer.id,
        email: `${RUN}@test.local`.toLowerCase(),
        orderId: createdOrder.id,
        amount: 100,
      },
    });
    await prisma.referral.create({
      data: {
        referrerId: `${RUN}-referrer`,
        referredEmail: `${RUN}@test.local`.toLowerCase(),
        status: "REWARDED",
      },
    });
    await prisma.backInStockSubscription.create({
      data: { productId: product.id, email: `${RUN}@test.local`, customerId: customer.id },
    });
    // N-18 — wishlist del titular: debe quedar vacía tras la supresión.
    await prisma.wishlistItem.create({
      data: { customerId: customer.id, productId: product.id },
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
    expect(c?.email).toBe(`deleted-${customer.id}@deleted.lucamsshop.com`);
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

    // SupportTicket (logueado + invitado por email) y SupportTicketMessage scrubbeados.
    const t1 = await prisma.supportTicket.findUnique({
      where: { id: ticket1.id },
      include: { messages: true },
    });
    expect(t1?.customerId).toBeNull();
    expect(t1?.name).toBe("Cliente eliminado");
    expect(t1?.message).not.toContain("3001234567");
    const customerMsgs = t1?.messages.filter((m) => m.authorKind === "CUSTOMER") ?? [];
    expect(customerMsgs).toHaveLength(1);
    expect(customerMsgs[0]?.authorId).toBeNull();
    expect(customerMsgs[0]?.body).not.toContain("1020304050");
    const adminMsgs = t1?.messages.filter((m) => m.authorKind === "ADMIN") ?? [];
    expect(adminMsgs[0]?.body).toBe("Caso gestionado por soporte.");

    const gt = await prisma.supportTicket.findUnique({ where: { id: guestTicket.id } });
    expect(gt?.email).toBe(`deleted-${customer.id}@deleted.lucamsshop.com`);
    expect(gt?.name).toBe("Cliente eliminado");
    expect(gt?.message).not.toContain("3001234567");

    // [PRI-01] (S08) — Design + DesignAsset pre-login + Storage paths (preview/draft/pages/thumb).
    expect(await prisma.designAsset.count({ where: { designId: design.id } })).toBe(0);
    const wipedDesign = await prisma.design.findUnique({ where: { id: design.id } });
    expect(wipedDesign?.customerId).toBeNull();
    expect(wipedDesign?.previewUrl).toBeNull();
    expect(wipedDesign?.draftPreviewUrl).toBeNull();
    expect(wipedDesign?.shareTokenHash).toBeNull();
    expect(wipedDesign?.canvasData).toEqual({});
    expect(wipedDesign?.metadata).toEqual({});
    const removedPaths = removeMock.mock.calls.flatMap((call) => call[0] as string[]);
    expect(removedPaths).toContain(`anon/${RUN}/master.jpg`);
    expect(removedPaths).toContain(`anon/${RUN}/master.canvas.webp`);
    expect(removedPaths).toContain(`${design.id}/preview.webp`);
    expect(removedPaths).toContain(`${design.id}/draft-preview.webp`);
    expect(removedPaths).toContain(`${design.id}/thumb.webp`);
    expect(removedPaths).toContain(`${design.id}/pages/01.webp`);
    expect(removedPaths).toContain(`${design.id}/pages/02.webp`);

    // [PRI-01] (S08) — Consent revocado + anonimizado y excluido del listado/export de newsletter.
    const consentsAfter = await prisma.consent.findMany({
      where: {
        OR: [{ id: { in: ids.consentIds! } }, { revokesId: newsletterConsent.id }],
      },
    });
    expect(
      consentsAfter.some((row) => row.revokesId === newsletterConsent.id && !row.accepted),
    ).toBe(true);
    for (const row of consentsAfter) {
      expect(row.customerId).toBeNull();
      expect(row.email).toBeNull();
      expect(row.phone).toBeNull();
      expect(row.ipAddress).toBeNull();
      expect(row.userAgent).toBeNull();
    }
    const newsletterSubs = await listNewsletterSubscribers({
      q: `${RUN}@test.local`.toLowerCase(),
    });
    expect(newsletterSubs.total).toBe(0);

    // [PRI-01] (S08) — CouponUsage.email, Coupon personal y Referral.referredEmail limpios.
    const cu = await prisma.couponUsage.findFirst({ where: { couponId: personalCoupon.id } });
    expect(cu?.customerId).toBeNull();
    expect(cu?.email).toBeNull();
    const cpn = await prisma.coupon.findUnique({ where: { id: personalCoupon.id } });
    expect(cpn?.customerId).toBeNull();
    expect(cpn?.isActive).toBe(false);
    expect(cpn?.description).toBeNull();
    expect(cpn?.deletedAt).not.toBeNull();
    const ref = await prisma.referral.findFirst({ where: { referrerId: `${RUN}-referrer` } });
    expect(ref?.referredEmail).toBe(`deleted-${customer.id}@deleted.lucamsshop.com`);

    // Auth user revocado.
    expect(deleteUserMock).toHaveBeenCalledWith(supabaseUserId);

    // H8 — el pedido conservado ya NO identifica al titular: email/phone scrubbeados.
    const order = await prisma.order.findFirst({ where: { number: `${RUN}-ORD` } });
    expect(order?.email).toBe(`deleted-${customer.id}@deleted.lucamsshop.com`);
    expect(order?.phone).toBe("");

    // H8 — suscripciones cortadas: los crons ya no le escriben al titular borrado.
    expect(
      await prisma.backInStockSubscription.count({ where: { email: `${RUN}@test.local` } }),
    ).toBe(0);
    expect(await prisma.abandonedCart.count({ where: { email: `${RUN}@test.local` } })).toBe(0);

    // N-18 — wishlist borrada: la FK no queda huérfana sobre la cuenta anonimizada.
    expect(await prisma.wishlistItem.count({ where: { customerId: customer.id } })).toBe(0);
  });
});
