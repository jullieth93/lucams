import { afterAll, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/db";
import {
  buildCrmSegmentCsv,
  listAllConsentedSegmentMembersForExport,
  listCrmSegmentMembers,
} from "./segments-service";

vi.mock("server-only", () => ({}));

const HAS_DB = Boolean(process.env.DATABASE_URL);

describe.skipIf(!HAS_DB)(
  "Segmentos comerciales CRM — gate duro Ley 1581 + neutralización CSV (S25)",
  () => {
    const createdOrderIds: string[] = [];
    const createdQuoteIds: string[] = [];
    const createdContactIds: string[] = [];
    const createdEmails: string[] = [];

    afterAll(async () => {
      if (createdOrderIds.length > 0) {
        await prisma.order.deleteMany({ where: { id: { in: createdOrderIds } } }).catch(() => {});
      }
      if (createdQuoteIds.length > 0) {
        await prisma.quote.deleteMany({ where: { id: { in: createdQuoteIds } } }).catch(() => {});
      }
      if (createdEmails.length > 0) {
        await prisma.consent
          .deleteMany({ where: { email: { in: createdEmails } } })
          .catch(() => {});
      }
      if (createdContactIds.length > 0) {
        await prisma.contact
          .deleteMany({ where: { id: { in: createdContactIds } } })
          .catch(() => {});
      }
    });

    it("exporta únicamente contactos con NEWSLETTER opt-in vigente y excluye bajas o sin consentimiento", async () => {
      const suffix = `${Date.now()}${Math.floor(Math.random() * 1000)}`;
      const emailOptedIn = `itest-seg-in-${suffix}@lucams.test`;
      const emailNoConsent = `itest-seg-noconsent-${suffix}@lucams.test`;
      const emailUnsubscribed = `itest-seg-unsub-${suffix}@lucams.test`;
      const emailIntentIn = `itest-seg-intent-${suffix}@lucams.test`;

      createdEmails.push(emailOptedIn, emailNoConsent, emailUnsubscribed, emailIntentIn);

      const [cOptedIn, cNoConsent, cUnsubscribed, cIntentIn] = await Promise.all([
        prisma.contact.create({
          data: {
            primaryEmail: emailOptedIn,
            displayName: "=CMD('calc') Valentina VIP",
            source: "GUEST_ORDER",
          },
        }),
        prisma.contact.create({
          data: {
            primaryEmail: emailNoConsent,
            displayName: "itest Camilo Sin OptIn",
            source: "GUEST_ORDER",
          },
        }),
        prisma.contact.create({
          data: {
            primaryEmail: emailUnsubscribed,
            displayName: "itest Laura Dada De Baja",
            source: "GUEST_ORDER",
          },
        }),
        prisma.contact.create({
          data: {
            primaryEmail: emailIntentIn,
            displayName: "itest Mateo Cotizador",
            source: "QUOTE",
          },
        }),
      ]);

      createdContactIds.push(cOptedIn.id, cNoConsent.id, cUnsubscribed.id, cIntentIn.id);

      // Crear 3 órdenes pagadas para los 3 contactos VIP
      const vipContacts = [
        { contact: cOptedIn, email: emailOptedIn, isGift: true, utm: "instagram" },
        { contact: cNoConsent, email: emailNoConsent, isGift: true, utm: "google" },
        { contact: cUnsubscribed, email: emailUnsubscribed, isGift: false, utm: "tiktok" },
      ];

      for (const entry of vipContacts) {
        for (let i = 1; i <= 3; i += 1) {
          const ord = await prisma.order.create({
            data: {
              number: `LCM-SEG-${suffix.slice(-5)}-${entry.contact.id.slice(-4)}-${i}`,
              contactId: entry.contact.id,
              email: entry.email,
              phone: "3001112233",
              status: "PAID",
              paymentMethod: "WOMPI",
              subtotal: 5000000,
              shipping: 1000000,
              discount: 0,
              total: 6000000,
              isGift: entry.isGift,
              utmSource: entry.utm,
              shippingAddress: { city: "Bogotá", department: "Cundinamarca" },
            },
          });
          createdOrderIds.push(ord.id);
        }
      }

      // Cotización sin compra para Mateo (alta intención)
      const quote = await prisma.quote.create({
        data: {
          number: `COT-${suffix.slice(-6)}`,
          contactId: cIntentIn.id,
          status: "PENDING",
          customerName: "itest Mateo Cotizador",
          customerWhatsapp: "3004445566",
          customerEmail: emailIntentIn,
          city: "Medellín",
          department: "Antioquia",
          subtotal: 8000000,
          total: 8000000,
          publicAccessTokenHash: `seg-hash-${suffix}`,
        },
      });
      createdQuoteIds.push(quote.id);

      // Ledger Consent:
      // 1) Valentina: opt-in activo
      // 2) Camilo: sin fila NEWSLETTER (solo HABEAS_DATA transaccional)
      // 3) Laura: opt-in inicial + revocación posterior (accepted = false)
      // 4) Mateo: opt-in activo
      const earlier = new Date(Date.now() - 60_000);
      const later = new Date();
      await prisma.consent.createMany({
        data: [
          {
            contactId: cOptedIn.id,
            email: emailOptedIn,
            scope: "NEWSLETTER",
            accepted: true,
            version: "v1 · 2026-09-29",
            acceptedAt: earlier,
          },
          {
            contactId: cNoConsent.id,
            email: emailNoConsent,
            scope: "HABEAS_DATA",
            accepted: true,
            version: "v1 · 2026-09-29",
            acceptedAt: earlier,
          },
          {
            contactId: cUnsubscribed.id,
            email: emailUnsubscribed,
            scope: "NEWSLETTER",
            accepted: true,
            version: "v1 · 2026-09-29",
            acceptedAt: earlier,
          },
          {
            contactId: cUnsubscribed.id,
            email: emailUnsubscribed,
            scope: "NEWSLETTER",
            accepted: false,
            version: "v1 · 2026-09-29",
            acceptedAt: later,
          },
          {
            contactId: cIntentIn.id,
            email: emailIntentIn,
            scope: "NEWSLETTER",
            accepted: true,
            version: "v1 · 2026-09-29",
            acceptedAt: later,
          },
        ],
      });

      // Consultar VIP filtrando por nuestro sufijo
      const vipPage = await listCrmSegmentMembers({
        segment: "vip",
        q: suffix,
      });

      expect(vipPage.items.map((m) => m.email)).toEqual([emailOptedIn]);
      expect(vipPage.items[0]?.lastUtmSource).toBe("instagram");
      expect(vipPage.excludedNoOptInCount).toBeGreaterThanOrEqual(2);

      // Export completo de VIP tampoco incluye nunca a Camilo ni a Laura
      const allVipExport = await listAllConsentedSegmentMembersForExport("vip");
      const exportedEmails = new Set(allVipExport.map((m) => m.email));
      expect(exportedEmails.has(emailOptedIn)).toBe(true);
      expect(exportedEmails.has(emailNoConsent)).toBe(false);
      expect(exportedEmails.has(emailUnsubscribed)).toBe(false);

      // Verificar neutralización de formula injection en CSV
      const csv = buildCrmSegmentCsv(vipPage.items, "vip");
      expect(csv.startsWith("\uFEFFsegmento,email,nombre")).toBe(true);
      expect(csv).toContain(`'=CMD('calc') Valentina VIP`);
      expect(csv).not.toContain(emailNoConsent);
      expect(csv).not.toContain(emailUnsubscribed);

      // Segmento de alta intención sin compra incluye a Mateo
      const intentPage = await listCrmSegmentMembers({
        segment: "high_intent_no_order",
        q: suffix,
      });
      expect(intentPage.items.map((m) => m.email)).toEqual([emailIntentIn]);
      expect(intentPage.items[0]?.intentSignals).toContain("Cotización");
    });
  },
);
