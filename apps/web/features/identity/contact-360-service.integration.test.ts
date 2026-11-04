import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/db";
import {
  getContact360ForActor,
  listContactsForActor,
  resolveContactRouteParam,
} from "./contact-360-service";

vi.mock("server-only", () => ({}));

const HAS_DB = Boolean(process.env.DATABASE_URL);

describe.skipIf(!HAS_DB)(
  "Contacto 360 — directorio unificado, señales de abandono y enmascaramiento PII",
  () => {
    const createdContactIds: string[] = [];
    const createdCustomerIds: string[] = [];
    const createdOrderIds: string[] = [];
    const createdTicketIds: string[] = [];
    const createdConsentIds: string[] = [];

    afterAll(async () => {
      if (createdConsentIds.length > 0) {
        await prisma.consent
          .deleteMany({ where: { id: { in: createdConsentIds } } })
          .catch(() => {});
      }
      if (createdTicketIds.length > 0) {
        await prisma.supportTicket
          .deleteMany({ where: { id: { in: createdTicketIds } } })
          .catch(() => {});
      }
      if (createdOrderIds.length > 0) {
        await prisma.order.deleteMany({ where: { id: { in: createdOrderIds } } }).catch(() => {});
      }
      if (createdCustomerIds.length > 0) {
        await prisma.customer
          .deleteMany({ where: { id: { in: createdCustomerIds } } })
          .catch(() => {});
      }
      if (createdContactIds.length > 0) {
        await prisma.contact
          .deleteMany({ where: { id: { in: createdContactIds } } })
          .catch(() => {});
      }
    });

    it("unifica invitados y cuentas registradas, resuelve Customer.id legacy y enmascara PII en roles restringidos", async () => {
      const suffix = randomUUID().slice(0, 8);
      const guestEmail = `guest-360-${suffix}@lucams.test`;
      const authEmail = `auth-360-${suffix}@lucams.test`;

      const guestContact = await prisma.contact.create({
        data: {
          primaryEmail: guestEmail,
          primaryPhoneE164: "+573109998877",
          displayName: "Valentina Invitada",
          documentType: "CC",
          documentNumber: "1032445566",
          source: "GUEST_ORDER",
        },
      });
      createdContactIds.push(guestContact.id);

      const authContact = await prisma.contact.create({
        data: {
          primaryEmail: authEmail,
          primaryPhoneE164: "+573201112233",
          displayName: "Camila Registrada",
          source: "CUSTOMER_AUTH",
        },
      });
      createdContactIds.push(authContact.id);

      const customer = await prisma.customer.create({
        data: {
          contactId: authContact.id,
          email: authEmail,
          supabaseUserId: randomUUID(),
          firstName: "Camila",
          lastName: "Registrada",
          loyaltyPoints: 450,
          referralCode: `REF360-${suffix.toUpperCase()}`,
        },
      });
      createdCustomerIds.push(customer.id);

      const paidGuestOrder = await prisma.order.create({
        data: {
          number: `LCM-TEST-${suffix.toUpperCase()}-1`,
          contactId: guestContact.id,
          email: guestEmail,
          phone: "+573109998877",
          shippingAddress: { city: "Bogotá D.C.", department: "Bogotá D.C." },
          subtotal: 5_000_000,
          shipping: 800_000,
          total: 5_800_000,
          status: "PAID",
          paymentMethod: "WOMPI",
        },
      });
      createdOrderIds.push(paidGuestOrder.id);

      const openTicket = await prisma.supportTicket.create({
        data: {
          contactId: guestContact.id,
          email: guestEmail,
          name: "Valentina Invitada",
          subject: "Consulta sobre fecha estimada",
          message: "Hola, quería saber cuándo sale mi pedido.",
          status: "OPEN",
          orderNumber: paidGuestOrder.number,
        },
      });
      createdTicketIds.push(openTicket.id);

      const mktConsent = await prisma.consent.create({
        data: {
          contactId: guestContact.id,
          email: guestEmail,
          scope: "NEWSLETTER",
          accepted: true,
          version: "v1.0",
        },
      });
      createdConsentIds.push(mktConsent.id);

      // 1. Resolución de ruta: Contact.id directo vs Customer.id legacy -> redirect
      const directRoute = await resolveContactRouteParam(guestContact.id);
      expect(directRoute).toEqual({ kind: "contact", contactId: guestContact.id });

      const legacyRoute = await resolveContactRouteParam(customer.id);
      expect(legacyRoute).toEqual({ kind: "redirect", contactId: authContact.id });

      // 2. CUSTOMER_SUPPORT ve ambos contactos con PII completa y filtros reales
      const supportDir = await listContactsForActor({ q: suffix }, "CUSTOMER_SUPPORT");
      expect(supportDir.piiMasked).toBe(false);
      expect(supportDir.total).toBe(2);

      const guestRow = supportDir.items.find((i) => i.id === guestContact.id)!;
      expect(guestRow.hasCustomerAccount).toBe(false);
      expect(guestRow.paidOrdersCount).toBe(1);
      expect(guestRow.netLtvCents).toBe(5_800_000);
      expect(guestRow.openCareCount).toBe(1);
      expect(guestRow.marketingOptIn).toBe(true);

      // 3. Anti-oráculo y enmascaramiento PII en rol sin contacts:read_pii (PRINT_WORKSHOP)
      const workshopPiiOracle = await listContactsForActor(
        { q: "+573109998877" },
        "PRINT_WORKSHOP",
      );
      expect(workshopPiiOracle.items.some((i) => i.id === guestContact.id)).toBe(false);

      const full360 = await getContact360ForActor(guestContact.id, "CUSTOMER_SUPPORT");
      expect(full360).not.toBeNull();
      expect(full360!.primaryEmail).toBe(guestEmail);
      expect(full360!.kpis.netLtvCents).toBe(5_800_000);
      expect(full360!.kpis.openCareCount).toBe(1);
      expect(full360!.kpis.marketingOptIn).toBe(true);
      expect(full360!.aftersales).toHaveLength(1);

      const masked360 = await getContact360ForActor(guestContact.id, "PRINT_WORKSHOP");
      expect(masked360).not.toBeNull();
      expect(masked360!.piiMasked).toBe(true);
      expect(masked360!.primaryEmail).not.toBe(guestEmail);
      expect(masked360!.primaryPhoneE164).not.toContain("31099988");
      expect(masked360!.waPhoneRaw).toBeNull();
      expect(masked360!.documentLabel).not.toContain("10324455");
    });
  },
);
