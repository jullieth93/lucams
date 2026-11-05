import { afterAll, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/db";
import {
  createPublicB2bOpportunity,
  getOpportunityDetail,
  listOpportunitiesForAdmin,
  OpportunityValidationError,
  updateOpportunityByAdmin,
} from "./service";

vi.mock("server-only", () => ({}));

const HAS_DB = Boolean(process.env.DATABASE_URL);

describe.skipIf(!HAS_DB)(
  "Oportunidades B2B / Eventos — captación consultiva, Organization, Ley 1581 y tarea Hoy (S24)",
  () => {
    const createdOppIds: string[] = [];
    const createdContactIds: string[] = [];
    const createdOrgIds: string[] = [];
    const createdOrderIds: string[] = [];

    afterAll(async () => {
      if (createdOppIds.length > 0) {
        await prisma.task
          .deleteMany({ where: { opportunityId: { in: createdOppIds } } })
          .catch(() => {});
        await prisma.opportunity
          .deleteMany({ where: { id: { in: createdOppIds } } })
          .catch(() => {});
      }
      if (createdOrderIds.length > 0) {
        await prisma.order.deleteMany({ where: { id: { in: createdOrderIds } } }).catch(() => {});
      }
      if (createdContactIds.length > 0) {
        await prisma.consent
          .deleteMany({ where: { contactId: { in: createdContactIds } } })
          .catch(() => {});
        await prisma.contact
          .deleteMany({ where: { id: { in: createdContactIds } } })
          .catch(() => {});
      }
      if (createdOrgIds.length > 0) {
        await prisma.organization
          .deleteMany({ where: { id: { in: createdOrgIds } } })
          .catch(() => {});
      }
    });

    it("crea Contact + Organization deduplicada por NIT + Consent Ley 1581 + Task automática y transiciona etapas", async () => {
      const suffix = `${Date.now()}${Math.floor(Math.random() * 1000)}`;
      const nit = `901${suffix.slice(-6)}-1`;
      const email = `itest-b2b-${suffix}@lucams.test`;

      const created = await createPublicB2bOpportunity(
        {
          contactName: "itest Carolina Mejía",
          organizationName: `itest Estudio Creativo ${suffix}`,
          nit,
          email,
          whatsapp: "3005556677",
          eventType: "CORPORATE_GIFT",
          expectedUnits: 120,
          eventDate: "2026-12-10",
          city: "Bogotá",
          department: "Cundinamarca",
          notes: "Necesitamos 120 fotoimanes corporativos con empaque navideño.",
          acceptHabeasData: true,
          acceptNewsletter: true,
        },
        {
          ip: "127.0.0.1",
          userAgent: "vitest",
          privacyPolicyVersion: "v1 · 2026-09-29",
          utmSource: "linkedin",
          utmMedium: "cpc",
          utmCampaign: "navidad-b2b",
          landingPath: "/empresas-y-eventos",
        },
      );

      createdOppIds.push(created.id);
      createdContactIds.push(created.contactId);
      expect(created.number).toMatch(/^OP-[A-Z2-9]{6}$/);

      const detail = await getOpportunityDetail(created.id);
      expect(detail).not.toBeNull();
      expect(detail?.stage).toBe("NEW");
      expect(detail?.expectedUnits).toBe(120);
      expect(detail?.organization?.name).toContain("Estudio Creativo");
      expect(detail?.utmSource).toBe("linkedin");
      if (detail?.organization?.id) createdOrgIds.push(detail.organization.id);

      // Consentimientos HABEAS_DATA y NEWSLETTER registrados con contactId
      const consents = await prisma.consent.findMany({
        where: { contactId: created.contactId },
      });
      expect(consents.some((c) => c.scope === "HABEAS_DATA" && c.accepted)).toBe(true);
      expect(consents.some((c) => c.scope === "NEWSLETTER" && c.accepted)).toBe(true);

      // Tarea URGENT (>= 100 uds.) creada automáticamente para Bandeja Hoy
      const autoTasks = await prisma.task.findMany({
        where: { opportunityId: created.id },
      });
      expect(autoTasks).toHaveLength(1);
      expect(autoTasks[0]?.priority).toBe("URGENT");

      // Exige motivo al marcar LOST
      await expect(
        updateOpportunityByAdmin({
          id: created.id,
          stage: "LOST",
          expectedUnits: 120,
          expectedAmountCop: 150000000,
          ownerAdminId: null,
          internalNotes: null,
          lostReason: "",
        }),
      ).rejects.toThrow(OpportunityValidationError);

      // Vincula pedido convertido al ganar
      const order = await prisma.order.create({
        data: {
          number: `TEST-B2B-${suffix}`,
          email,
          phone: "+573005556677",
          contactId: created.contactId,
          status: "PAID",
          paymentMethod: "WOMPI",
          subtotal: 150000000,
          shipping: 0,
          discount: 0,
          total: 150000000,
          shippingAddress: {
            fullName: "Carolina Mejía",
            city: "Bogotá",
          },
        },
      });
      createdOrderIds.push(order.id);

      const won = await updateOpportunityByAdmin({
        id: created.id,
        stage: "WON",
        expectedUnits: 120,
        expectedAmountCop: 150000000,
        ownerAdminId: null,
        internalNotes: "Anticipo confirmado",
        lostReason: null,
        convertedOrderNumber: order.number,
      });
      expect(won.stage).toBe("WON");
      expect(won.convertedOrderId).toBe(order.id);

      const board = await listOpportunitiesForAdmin({ q: created.number });
      expect(board.items.some((i) => i.id === created.id && i.stage === "WON")).toBe(true);
    });
  },
);
