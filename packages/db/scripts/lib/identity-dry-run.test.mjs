/*
 * Unit tests del motor puro de perfilamiento de identidad (ADR-193 · Fase 5).
 * Corre con `node --test` vía `pnpm --filter @lucams/db test`.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  formatIdentityDryRunReport,
  isAnonymizedPlaceholderEmail,
  normalizeEmailIdentity,
  normalizePhoneE164,
  normalizeTaxDocKey,
  simulateIdentityResolution,
} from "./identity-dry-run.mjs";

describe("identity-dry-run normalizers", () => {
  it("normaliza emails y descarta placeholders de supresión Ley 1581", () => {
    assert.equal(normalizeEmailIdentity("  Cliente.VIP@Gmail.com "), "cliente.vip@gmail.com");
    assert.equal(normalizeEmailIdentity(""), "");
    assert.equal(normalizeEmailIdentity("sin-arroba"), "");
    assert.equal(normalizeEmailIdentity("deleted-cm123@deleted.lucamsshop.com"), "");
    assert.equal(isAnonymizedPlaceholderEmail("DELETED-abc@deleted.lucamsshop.com"), true);
    assert.equal(isAnonymizedPlaceholderEmail("comprador@lucamsshop.com"), false);
  });

  it("normaliza móviles colombianos e internacionales a E.164 estricto", () => {
    assert.equal(normalizePhoneE164("300 111 2233"), "+573001112233");
    assert.equal(normalizePhoneE164("+57 (312) 555-6677"), "+573125556677");
    assert.equal(normalizePhoneE164("00573159998877"), "+573159998877");
    assert.equal(normalizePhoneE164("+1 305-444-7788"), "+13054447788");
    assert.equal(normalizePhoneE164("deleted"), "");
    assert.equal(normalizePhoneE164("123"), "");
    assert.equal(normalizePhoneE164(null), "");
  });

  it("normaliza documentos tributarios DIAN eliminando separadores", () => {
    assert.equal(normalizeTaxDocKey("cc", "1.020.304-0"), "CC:10203040");
    assert.equal(normalizeTaxDocKey("NIT", "900.123.456-7"), "NIT:9001234567");
    assert.equal(normalizeTaxDocKey(null, "10203040"), "");
    assert.equal(normalizeTaxDocKey("CC", "  "), "");
  });
});

describe("simulateIdentityResolution (ADR-193 matrix)", () => {
  it("aísla destinatarios de regalo, excluye suprimidos Ley 1581, no auto-fusiona teléfonos y cero PII sale en el reporte", () => {
    const dataset = {
      customers: [
        {
          id: "cust_ana",
          email: "ana.secreta@correo.co",
          phone: "300 111 2233",
          supabaseUserId: "uid-ana-111",
          documentType: "CC",
          documentNumber: "10.203.040",
          deletedAt: null,
        },
        {
          id: "cust_carlos",
          email: "carlos.familia@correo.co",
          phone: "+573001112233", // mismo móvil familiar que Ana
          supabaseUserId: "uid-carlos-222",
          documentType: null,
          documentNumber: null,
          deletedAt: null,
        },
        {
          id: "cust_deleted",
          email: "deleted-cust_deleted@deleted.lucamsshop.com",
          phone: null,
          supabaseUserId: "uid-del-333",
          documentType: null,
          documentNumber: null,
          deletedAt: new Date("2026-10-01T00:00:00Z"),
        },
      ],
      orders: [
        // 1. Orden normal de Ana
        {
          id: "ord_ana_1",
          customerId: "cust_ana",
          email: "ana.secreta@correo.co",
          phone: "3001112233",
          isGift: false,
          recipientPhone: null,
          billingDocumentType: "CC",
          billingDocumentNumber: "10203040",
        },
        // 2. Orden de regalo de Ana: recipientPhone jamás debe entrar como identidad ni colisión
        {
          id: "ord_ana_gift",
          customerId: "cust_ana",
          email: "ana.secreta@correo.co",
          phone: "3001112233",
          isGift: true,
          recipientPhone: "3998887766",
          billingDocumentType: "CC",
          billingDocumentNumber: "10203040",
        },
        // 3. Anomalía histórica [ID-01]: orden autenticada de Ana con email de invitado B (no regalo)
        {
          id: "ord_ana_id01",
          customerId: "cust_ana",
          email: "invitado.b@correo.co",
          phone: "3001112233",
          isGift: false,
          recipientPhone: null,
          billingDocumentType: null,
          billingDocumentNumber: null,
        },
        // 4. Orden invitada previa de Ana (mismo email -> vínculo contextual Nivel 2 sin crear nuevo Contact)
        {
          id: "ord_ana_guest_prev",
          customerId: null,
          email: "ANA.SECRETA@correo.co",
          phone: "3001112233",
          isGift: false,
          recipientPhone: null,
          billingDocumentType: null,
          billingDocumentNumber: null,
        },
        // 5. Orden invitada pura de B con la misma cédula DIAN que Ana -> nuevo Contact GUEST_ORDER + merge candidate
        {
          id: "ord_guest_b",
          customerId: null,
          email: "invitado.b@correo.co",
          phone: "3112223344",
          isGift: false,
          recipientPhone: null,
          billingDocumentType: "CC",
          billingDocumentNumber: "10203040",
        },
        // 6. Orden terminal anonimizada Ley 1581 -> preservada con contactId null
        {
          id: "ord_deleted",
          customerId: null,
          email: "deleted-cust_deleted@deleted.lucamsshop.com",
          phone: "0000000000",
          isGift: false,
          recipientPhone: null,
        },
      ],
      supportTickets: [
        {
          id: "tkt_guest",
          customerId: null,
          email: "soporte.nuevo@correo.co",
        },
        {
          id: "tkt_deleted",
          customerId: null,
          email: "deleted-cust_deleted@deleted.lucamsshop.com",
        },
      ],
      quotes: [
        // Cotización solo por WhatsApp compartiendo el móvil 3112223344 de invitado.b -> NO auto-fusiona, crea Contact QUOTE + candidato
        {
          id: "quo_wa_only",
          customerEmail: null,
          customerWhatsapp: "3112223344",
          deletedAt: null,
        },
        // Cotización del destinatario del regalo con su teléfono 3998887766 -> NO debe colisionar con Ana porque Ana jamás absorbió recipientPhone
        {
          id: "quo_gift_recipient",
          customerEmail: null,
          customerWhatsapp: "3998887766",
          deletedAt: null,
        },
      ],
      abandonedCarts: [
        {
          id: "ac_1",
          email: "carrito.abandonado@correo.co",
          cartCustomerId: null,
        },
      ],
      consents: [
        {
          id: "con_news_1",
          customerId: null,
          email: "boletin.lector@correo.co",
          phone: null,
          scope: "NEWSLETTER",
          accepted: true,
          acceptedAt: new Date("2026-10-05T10:00:00Z"),
        },
        {
          id: "con_news_revoked",
          customerId: null,
          email: "revocado.lector@correo.co",
          phone: null,
          scope: "NEWSLETTER",
          accepted: true,
          acceptedAt: new Date("2026-10-01T10:00:00Z"),
        },
        {
          id: "con_news_revoked_2",
          customerId: null,
          email: "revocado.lector@correo.co",
          phone: null,
          scope: "NEWSLETTER",
          accepted: false,
          acceptedAt: new Date("2026-10-06T10:00:00Z"),
        },
      ],
      warrantyClaims: [
        { id: "wc_1", customerId: null, orderId: "ord_guest_b" },
        { id: "wc_del", customerId: null, orderId: "ord_deleted" },
      ],
      retractRequests: [
        { id: "rr_1", orderId: "ord_guest_b" },
        { id: "rr_del", orderId: "ord_deleted" },
      ],
    };

    const result = simulateIdentityResolution(dataset);

    assert.equal(result.sourceCounts.activeCustomers, 2);
    assert.equal(result.sourceCounts.softDeletedCustomers, 1);
    assert.equal(result.sourceCounts.activeOrders, 6);
    assert.equal(result.sourceCounts.registeredOrders, 3);
    assert.equal(result.sourceCounts.guestOrders, 3);
    assert.equal(result.sourceCounts.giftOrdersTotal, 1);
    assert.equal(result.sourceCounts.activeNewsletterUniqueEmails, 1);

    // Forensics
    assert.equal(result.forensics.authOrderEmailMismatchTotal, 1);
    assert.equal(result.forensics.authOrderEmailMismatchGift, 0);
    assert.equal(result.forensics.authOrderEmailMismatchNonGift, 1);
    assert.equal(result.forensics.sharedPhonesAcrossActiveCustomers, 1);
    assert.equal(result.forensics.sharedPhonesAcrossContacts, 2); // +573001112233 (Ana/Carlos) y +573112223344 (guest B / quote WA)
    assert.equal(result.forensics.sharedTaxDocsAcrossContacts, 1); // CC:10203040 (Ana / guest B)
    assert.equal(result.forensics.giftRecipientPhonesIsolated, 1);
    assert.equal(result.forensics.anonymizedRecordsPreservedNull.orders, 1);
    assert.equal(result.forensics.anonymizedRecordsPreservedNull.supportTickets, 1);
    assert.equal(result.forensics.anonymizedRecordsPreservedNull.warrantyClaims, 1);
    assert.equal(result.forensics.anonymizedRecordsPreservedNull.retractRequests, 1);

    // Contactos proyectados:
    // 2 CUSTOMER_AUTH (Ana, Carlos)
    // + 1 GUEST_ORDER (invitado.b)
    // + 1 SUPPORT_TICKET (soporte.nuevo)
    // + 2 QUOTE (quo_wa_only, quo_gift_recipient)
    // + 1 ABANDONED_CART (carrito.abandonado)
    // + 2 NEWSLETTER (boletin.lector, revocado.lector)
    // = 9 contactos totales
    assert.equal(result.simulatedProjection.totalContacts, 9);
    assert.equal(result.simulatedProjection.contactsWithCustomerAccount, 2);
    assert.equal(result.simulatedProjection.contactsGuestOrLeadOnly, 7);
    assert.deepEqual(result.simulatedProjection.contactsBySource, {
      CUSTOMER_AUTH: 2,
      GUEST_ORDER: 1,
      SUPPORT_TICKET: 1,
      QUOTE: 2,
      ABANDONED_CART: 1,
      NEWSLETTER: 2,
    });

    assert.equal(
      result.simulatedProjection.foreignKeyResolution.ordersLinkedContextuallyToExistingContact,
      1,
    );
    assert.equal(result.simulatedProjection.foreignKeyResolution.ordersLinkedToNewGuestContact, 1);
    assert.equal(result.simulatedProjection.foreignKeyResolution.warrantyClaimsLinked, 1);
    assert.equal(result.simulatedProjection.foreignKeyResolution.retractRequestsLinked, 1);

    // Pares candidatos:
    // 1. (cust_ana, cust_carlos) -> SAME_BUYER_PHONE_E164
    // 2. (cust_ana, guest_b) -> SAME_BILLING_DOCUMENT + HISTORICAL_ID01_EMAIL_MISMATCH (1 solo par deduplicado con 2 razones)
    // 3. (guest_b, quo_wa_only) -> SAME_BUYER_PHONE_E164
    // (quo_gift_recipient NO colisiona con Ana gracias al aislamiento de regalos)
    assert.equal(result.simulatedProjection.mergeCandidatesTotalPairs, 3);
    assert.deepEqual(result.simulatedProjection.mergeCandidatesByReason, {
      SAME_BUYER_PHONE_E164: 2,
      SAME_BILLING_DOCUMENT: 1,
      HISTORICAL_ID01_EMAIL_MISMATCH: 1,
    });

    // Garantía cero PII en JSON y en reporte humano
    const fullReport = {
      generatedAt: "2026-11-04T15:00:00.000Z",
      readOnlyVerified: true,
      scoped: false,
      ...result,
    };
    const serialized = `${JSON.stringify(fullReport)}\n${formatIdentityDryRunReport(fullReport)}`;
    for (const secret of [
      "ana.secreta",
      "carlos.familia",
      "invitado.b",
      "soporte.nuevo",
      "carrito.abandonado",
      "boletin.lector",
      "@correo.co",
      "3001112233",
      "3112223344",
      "3998887766",
      "10203040",
      "uid-ana-111",
    ]) {
      assert.ok(
        !serialized.includes(secret),
        `Fuga de PII detectada en salida del dry-run: "${secret}"`,
      );
    }
  });
});

