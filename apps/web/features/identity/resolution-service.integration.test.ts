/*
 * Integración PostgreSQL — Resolución determinista, concurrencia, aislamiento de regalos
 * y supresión Ley 1581 sobre `Contact` (S15 · Fase 7 · ADR-193).
 */

import { afterAll, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/db";

vi.mock("@/lib/supabase/service", () => ({
  supabaseService: {
    storage: {
      from: () => ({
        remove: vi.fn().mockResolvedValue({ data: [], error: null }),
        list: vi.fn().mockResolvedValue({ data: [], error: null }),
      }),
    },
    auth: {
      admin: {
        deleteUser: vi.fn().mockResolvedValue({ data: {}, error: null }),
        updateUserById: vi.fn().mockResolvedValue({ data: {}, error: null }),
      },
    },
  },
}));

vi.mock("@/features/newsletter/unsubscribe", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/features/newsletter/unsubscribe")>();
  return {
    ...actual,
    markResendContactUnsubscribed: vi.fn().mockResolvedValue(undefined),
  };
});

import { deleteCustomerAccount } from "@/features/account/delete-service";
import {
  ensureCustomerContact,
  resolveAbandonedCartContact,
  resolveConsentContact,
  resolveOrderContactTx,
  resolvePostSaleContact,
  resolveQuoteContactTx,
  resolveSupportTicketContact,
} from "./resolution-service";

const hasDb = Boolean(process.env.DATABASE_URL);
const RUN = `s15id${Date.now().toString(36)}${Math.floor(Math.random() * 1e4).toString(36)}`;

describe.skipIf(!hasDb)(
  "Grafo de Identidad — resolution-service + Dual-Write + Ley 1581 (S15)",
  () => {
    const createdCustomerIds: string[] = [];
    const createdOrderIds: string[] = [];
    const createdTicketIds: string[] = [];
    const createdQuoteIds: string[] = [];
    const createdCartIds: string[] = [];
    const createdConsentIds: string[] = [];
    const createdContactIds = new Set<string>();

    afterAll(async () => {
      const safe = (p: Promise<unknown>) => p.catch(() => {});
      if (createdTicketIds.length > 0) {
        await safe(prisma.supportTicket.deleteMany({ where: { id: { in: createdTicketIds } } }));
      }
      if (createdQuoteIds.length > 0) {
        await safe(prisma.quote.deleteMany({ where: { id: { in: createdQuoteIds } } }));
      }
      if (createdConsentIds.length > 0) {
        await safe(prisma.consent.deleteMany({ where: { id: { in: createdConsentIds } } }));
      }
      if (createdOrderIds.length > 0) {
        await safe(prisma.order.deleteMany({ where: { id: { in: createdOrderIds } } }));
      }
      if (createdCartIds.length > 0) {
        await safe(prisma.abandonedCart.deleteMany({ where: { cartId: { in: createdCartIds } } }));
        await safe(prisma.cart.deleteMany({ where: { id: { in: createdCartIds } } }));
      }
      if (createdCustomerIds.length > 0) {
        await safe(prisma.customer.deleteMany({ where: { id: { in: createdCustomerIds } } }));
      }
      const cIds = Array.from(createdContactIds);
      if (cIds.length > 0) {
        await safe(
          prisma.identityMergeCandidate.deleteMany({
            where: {
              OR: [{ primaryContactId: { in: cIds } }, { secondaryContactId: { in: cIds } }],
            },
          }),
        );
        await safe(prisma.contactIdentity.deleteMany({ where: { contactId: { in: cIds } } }));
        await safe(prisma.contact.deleteMany({ where: { id: { in: cIds } } }));
      }
    });

    it("serializa 5 resoluciones concurrentes del mismo email invitado sin P2002 ni duplicados", async () => {
      const raceEmail = `${RUN}-race-guest@test.local`;
      const results = await Promise.all(
        Array.from({ length: 5 }, (_, idx) =>
          prisma.$transaction((tx) =>
            resolveOrderContactTx(tx, {
              sessionCustomerId: null,
              orderEmail: `  ${raceEmail.toUpperCase()} `,
              buyerPhone: `300111220${idx}`,
              buyerFullName: "Valeria Invitada",
            }),
          ),
        ),
      );

      const uniqueIds = Array.from(new Set(results));
      expect(uniqueIds).toHaveLength(1);
      expect(uniqueIds[0]).toBeTruthy();
      createdContactIds.add(uniqueIds[0]!);

      const contactsInDb = await prisma.contact.findMany({
        where: { primaryEmail: raceEmail, deletedAt: null },
      });
      expect(contactsInDb).toHaveLength(1);
      expect(contactsInDb[0]!.source).toBe("GUEST_ORDER");

      const emailIdentities = await prisma.contactIdentity.findMany({
        where: { contactId: uniqueIds[0]!, type: "EMAIL" },
      });
      expect(emailIdentities).toHaveLength(1);
      expect(emailIdentities[0]!.verificationStatus).toBe("UNVERIFIED_OBSERVED");
    });

    it("protege contra defacement pre-OTP y promueve EMAIL a VERIFIED al confirmar OTP adoptando historial previo", async () => {
      const email = `${RUN}-journey@test.local`;

      // 1. Primero interactúa como invitado (carrito abandonado + ticket público)
      const cart = await prisma.cart.create({
        data: { sessionId: `${RUN}-sess-1` },
        select: { id: true },
      });
      createdCartIds.push(cart.id);

      const guestContactId = await resolveAbandonedCartContact(prisma, {
        email,
      });
      expect(guestContactId).toBeTruthy();
      createdContactIds.add(guestContactId!);

      const ticket = await prisma.supportTicket.create({
        data: {
          name: "Laura Real",
          email,
          subject: "OTRO",
          message: "Consulta antes de registrarme en la tienda.",
          status: "OPEN",
          contactId: null, // simula histórico previo sin contactId aún
        },
        select: { id: true },
      });
      createdTicketIds.push(ticket.id);

      await prisma.contact.update({
        where: { id: guestContactId! },
        data: { displayName: "Laura Real" },
      });

      // 2. Alguien envía /registro sin verificar OTP todavía (emailVerified: false) con otro nombre
      const customer = await prisma.customer.create({
        data: {
          email,
          firstName: "Intento",
          lastName: "SinOTP",
          supabaseUserId: `${RUN}-uid-journey`,
          referralCode: `REF-${RUN.slice(-8).toUpperCase()}`,
        },
        select: { id: true },
      });
      createdCustomerIds.push(customer.id);

      const preOtpContactId = await ensureCustomerContact(prisma, {
        customerId: customer.id,
        emailVerified: false,
        verificationSource: "SIGNUP_PENDING_OTP",
      });
      expect(preOtpContactId).toBe(guestContactId);

      // Antes del OTP: EMAIL sigue UNVERIFIED_OBSERVED, displayName previo NO fue pisado y ticket sigue sin adoptar
      const preOtpIdentity = await prisma.contactIdentity.findFirst({
        where: { contactId: guestContactId!, type: "EMAIL", normalizedValue: email },
      });
      expect(preOtpIdentity?.verificationStatus).toBe("UNVERIFIED_OBSERVED");
      const preOtpContact = await prisma.contact.findUnique({ where: { id: guestContactId! } });
      expect(preOtpContact?.displayName).toBe("Laura Real");
      const preOtpTicket = await prisma.supportTicket.findUnique({ where: { id: ticket.id } });
      expect(preOtpTicket?.contactId).toBeNull();

      // 3. El titular real verifica OTP (`emailVerified: true`)
      await prisma.customer.update({
        where: { id: customer.id },
        data: { firstName: "Laura", lastName: "Verificada" },
      });
      const postOtpContactId = await ensureCustomerContact(prisma, {
        customerId: customer.id,
        emailVerified: true,
        verificationSource: "SUPABASE_OTP",
      });
      expect(postOtpContactId).toBe(guestContactId);

      const postOtpIdentity = await prisma.contactIdentity.findFirst({
        where: { contactId: guestContactId!, type: "EMAIL", normalizedValue: email },
      });
      expect(postOtpIdentity?.verificationStatus).toBe("VERIFIED");
      expect(postOtpIdentity?.verifiedAt).toBeInstanceOf(Date);

      const postOtpContact = await prisma.contact.findUnique({ where: { id: guestContactId! } });
      expect(postOtpContact?.source).toBe("CUSTOMER_AUTH");
      expect(postOtpContact?.displayName).toBe("Laura Verificada");

      const adoptedTicket = await prisma.supportTicket.findUnique({ where: { id: ticket.id } });
      expect(adoptedTicket?.contactId).toBe(guestContactId);
    });

    it("cumple [ID-01] en checkout autenticado con email ajeno y aísla 100% destinatarios de regalo", async () => {
      const buyerEmail = `${RUN}-buyer-auth@test.local`;
      const altEmail = `${RUN}-third-party@test.local`;
      const giftNotifEmail = `${RUN}-gift-notif@test.local`;
      const recipientPhone = "3159990001";

      const buyer = await prisma.customer.create({
        data: {
          email: buyerEmail,
          firstName: "Camila",
          lastName: "Compradora",
          phone: "3007771122",
          supabaseUserId: `${RUN}-uid-buyer`,
          referralCode: `BUY-${RUN.slice(-8).toUpperCase()}`,
        },
        select: { id: true },
      });
      createdCustomerIds.push(buyer.id);

      // Caso A: Comprador autenticado compra NO-regalo digitando un correo alterno
      const nonGiftContactId = await prisma.$transaction((tx) =>
        resolveOrderContactTx(tx, {
          sessionCustomerId: buyer.id,
          orderEmail: altEmail,
          buyerPhone: "3007771122",
          buyerFullName: "Camila Compradora",
          isGift: false,
        }),
      );

      const buyerReloaded = await prisma.customer.findUnique({
        where: { id: buyer.id },
        select: { contactId: true },
      });
      expect(nonGiftContactId).toBe(buyerReloaded?.contactId);
      createdContactIds.add(nonGiftContactId!);

      // El correo alterno NUNCA se anexa como ContactIdentity de Camila
      const buyerEmails = await prisma.contactIdentity.findMany({
        where: { contactId: nonGiftContactId!, type: "EMAIL" },
      });
      expect(buyerEmails.map((i) => i.normalizedValue)).toEqual([buyerEmail]);

      // Se creó contacto observado para altEmail y candidato AUTH_BUYER_ALT_ORDER_EMAIL
      const altContact = await prisma.contact.findFirst({
        where: { primaryEmail: altEmail, deletedAt: null },
      });
      expect(altContact).toBeTruthy();
      createdContactIds.add(altContact!.id);

      const mergeCand = await prisma.identityMergeCandidate.findFirst({
        where: {
          OR: [
            { primaryContactId: nonGiftContactId!, secondaryContactId: altContact!.id },
            { primaryContactId: altContact!.id, secondaryContactId: nonGiftContactId! },
          ],
        },
      });
      expect(mergeCand?.status).toBe("PENDING");
      expect(mergeCand?.reasonCodes).toContain("AUTH_BUYER_ALT_ORDER_EMAIL");

      // Caso B: Pedido marcado como regalo (`isGift: true`) -> NO genera candidato por email ni filtra destinatario
      const giftContactId = await prisma.$transaction((tx) =>
        resolveOrderContactTx(tx, {
          sessionCustomerId: buyer.id,
          orderEmail: giftNotifEmail,
          buyerPhone: "3007771122",
          buyerFullName: "Nombre Homenajeado En Envio",
          isGift: true,
          hasThirdPartyRecipient: true,
        }),
      );
      expect(giftContactId).toBe(nonGiftContactId);

      const giftEmailContact = await prisma.contact.findFirst({
        where: { primaryEmail: giftNotifEmail },
      });
      expect(giftEmailContact).toBeNull();

      const leakedRecipientPhone = await prisma.contactIdentity.findFirst({
        where: { normalizedValue: `+57${recipientPhone}` },
      });
      expect(leakedRecipientPhone).toBeNull();
    });

    it("permite teléfono familiar y NIT/CC compartidos sin P2002, encola revisión humana y respeta REJECTED", async () => {
      const sharedPhone = "3114445566";
      const emailA = `${RUN}-hermana-a@test.local`;
      const emailB = `${RUN}-hermana-b@test.local`;

      const cA = await prisma.$transaction((tx) =>
        resolveOrderContactTx(tx, {
          sessionCustomerId: null,
          orderEmail: emailA,
          buyerPhone: sharedPhone,
          billingDocumentType: "CC",
          billingDocumentNumber: `1099${RUN.slice(-4).replace(/\D/g, "8")}`,
        }),
      );
      const docNum = (await prisma.contact.findUnique({ where: { id: cA! } }))!.documentNumber!;

      const cB = await prisma.$transaction((tx) =>
        resolveOrderContactTx(tx, {
          sessionCustomerId: null,
          orderEmail: emailB,
          buyerPhone: `+57 ${sharedPhone}`,
          billingDocumentType: "CC",
          billingDocumentNumber: docNum,
        }),
      );

      expect(cA).toBeTruthy();
      expect(cB).toBeTruthy();
      expect(cA).not.toBe(cB);
      createdContactIds.add(cA!);
      createdContactIds.add(cB!);

      const [pId, sId] = cA! < cB! ? [cA!, cB!] : [cB!, cA!];
      const candidate = await prisma.identityMergeCandidate.findUnique({
        where: {
          primaryContactId_secondaryContactId: { primaryContactId: pId, secondaryContactId: sId },
        },
      });
      expect(candidate?.status).toBe("PENDING");
      expect(candidate?.reasonCodes).toEqual(
        expect.arrayContaining(["SAME_BUYER_PHONE_E164", "SAME_BILLING_DOCUMENT"]),
      );

      // Si un operador humano marca REJECTED (do-not-suggest), nuevas compras NO lo reabren a PENDING
      await prisma.identityMergeCandidate.update({
        where: { id: candidate!.id },
        data: { status: "REJECTED", reviewNote: "Son hermanas distintas" },
      });

      await prisma.$transaction((tx) =>
        resolveOrderContactTx(tx, {
          sessionCustomerId: null,
          orderEmail: emailB,
          buyerPhone: sharedPhone,
        }),
      );

      const afterReject = await prisma.identityMergeCandidate.findUnique({
        where: { id: candidate!.id },
      });
      expect(afterReject?.status).toBe("REJECTED");
    });

    it("resuelve cotizaciones solo-WhatsApp, ignora cookies anónimas y ejecuta cascada completa Ley 1581", async () => {
      // 1. Cookie banner anónimo -> null (cero filas basura en Contact)
      const anonConsentContact = await resolveConsentContact(prisma, {
        customerId: null,
        email: null,
        phone: null,
      });
      expect(anonConsentContact).toBeNull();

      // 2. Quote solo-WhatsApp reutiliza su Contact sin email
      const waPhone = "3228887766";
      const q1Contact = await prisma.$transaction((tx) =>
        resolveQuoteContactTx(tx, {
          customerName: "Cliente Evento",
          customerWhatsapp: waPhone,
          customerEmail: null,
        }),
      );
      const q2Contact = await prisma.$transaction((tx) =>
        resolveQuoteContactTx(tx, {
          customerName: "Cliente Evento",
          customerWhatsapp: `+57 ${waPhone}`,
          customerEmail: null,
        }),
      );
      expect(q1Contact).toBeTruthy();
      expect(q1Contact).toBe(q2Contact);
      createdContactIds.add(q1Contact!);

      // 3. Cascada completa Ley 1581 en deleteCustomerAccount
      const eraseEmail = `${RUN}-erase@test.local`;
      const cust = await prisma.customer.create({
        data: {
          email: eraseEmail,
          firstName: "Titular",
          lastName: "Suprimido",
          phone: "3012223344",
          documentType: "CC",
          documentNumber: "80111222",
          supabaseUserId: `${RUN}-uid-erase`,
          referralCode: `ERA-${RUN.slice(-8).toUpperCase()}`,
        },
        select: { id: true, supabaseUserId: true },
      });
      createdCustomerIds.push(cust.id);

      const erasedContactId = await ensureCustomerContact(prisma, {
        customerId: cust.id,
        emailVerified: true,
        verificationSource: "SUPABASE_OTP",
      });
      expect(erasedContactId).toBeTruthy();
      createdContactIds.add(erasedContactId!);

      const support = await prisma.supportTicket.create({
        data: {
          name: "Titular Suprimido",
          email: eraseEmail,
          subject: "OTRO",
          message: "Quiero ejercer supresión",
          status: "OPEN",
          customerId: cust.id,
          contactId: erasedContactId,
        },
        select: { id: true },
      });
      createdTicketIds.push(support.id);

      const postSaleResolved = await resolvePostSaleContact(prisma, {
        orderContactId: erasedContactId,
      });
      expect(postSaleResolved).toBe(erasedContactId);

      const supportResolved = await resolveSupportTicketContact(prisma, {
        customerId: cust.id,
        email: eraseEmail,
      });
      expect(supportResolved).toBe(erasedContactId);

      // Encolar candidato PENDING con otro contacto para verificar que la supresión lo purga
      await prisma.identityMergeCandidate.create({
        data: {
          primaryContactId: erasedContactId! < q1Contact! ? erasedContactId! : q1Contact!,
          secondaryContactId: erasedContactId! < q1Contact! ? q1Contact! : erasedContactId!,
          reasonCode: "SAME_BUYER_PHONE_E164",
          reasonCodes: ["SAME_BUYER_PHONE_E164"],
          status: "PENDING",
        },
      });

      await deleteCustomerAccount(cust.id, cust.supabaseUserId);

      const contactAfter = await prisma.contact.findUnique({ where: { id: erasedContactId! } });
      expect(contactAfter?.primaryEmail).toBeNull();
      expect(contactAfter?.primaryPhoneE164).toBeNull();
      expect(contactAfter?.displayName).toBeNull();
      expect(contactAfter?.documentType).toBeNull();
      expect(contactAfter?.documentNumber).toBeNull();
      expect(contactAfter?.anonymizedAt).toBeInstanceOf(Date);
      expect(contactAfter?.deletedAt).toBeInstanceOf(Date);

      const remainingIdentities = await prisma.contactIdentity.count({
        where: { contactId: erasedContactId! },
      });
      expect(remainingIdentities).toBe(0);

      const remainingPendingMerges = await prisma.identityMergeCandidate.count({
        where: {
          OR: [{ primaryContactId: erasedContactId! }, { secondaryContactId: erasedContactId! }],
        },
      });
      expect(remainingPendingMerges).toBe(0);

      const custAfter = await prisma.customer.findUnique({ where: { id: cust.id } });
      expect(custAfter?.contactId).toBeNull();

      const ticketAfter = await prisma.supportTicket.findUnique({ where: { id: support.id } });
      expect(ticketAfter?.contactId).toBeNull();

      // El índice parcial libera el email para un nuevo registro legítimo futuro sin P2002
      const freshContact = await resolveConsentContact(prisma, {
        email: eraseEmail,
        emailVerified: false,
      });
      expect(freshContact).toBeTruthy();
      expect(freshContact).not.toBe(erasedContactId);
      createdContactIds.add(freshContact!);
    });
  },
);
