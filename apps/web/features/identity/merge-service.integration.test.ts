import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/db";
import {
  listMergeCandidatesForActor,
  mergeContactsByHumanApproval,
  MergeValidationError,
  rejectMergeCandidate,
} from "./merge-service";
import { resolveContactRouteParam } from "./contact-360-service";
import { enqueueMergeCandidateTx } from "./resolution-service";

vi.mock("server-only", () => ({}));

const HAS_DB = Boolean(process.env.DATABASE_URL);

describe.skipIf(!HAS_DB)(
  "Merge Service — fusión humana gobernada, bloqueo de doble cuenta y do-not-suggest (S20)",
  () => {
    const createdAdminIds: string[] = [];
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
      if (createdAdminIds.length > 0) {
        await prisma.adminUser
          .deleteMany({ where: { id: { in: createdAdminIds } } })
          .catch(() => {});
      }
    });

    it("transfiere pedidos, tickets, consentimientos e identidades al sobreviviente con snapshot reversible y redirige Contact absorbido", async () => {
      const suffix = randomUUID().slice(0, 8);
      const admin = await prisma.adminUser.create({
        data: {
          email: `merge-admin-${suffix}@lucams.test`,
          supabaseUserId: `supa-admin-${suffix}`,
          role: "OPERATIONS_MANAGER",
          isActive: true,
        },
      });
      createdAdminIds.push(admin.id);

      const authEmail = `auth-merge-${suffix}@lucams.test`;
      const guestEmail = `guest-merge-${suffix}@lucams.test`;

      const authContact = await prisma.contact.create({
        data: {
          primaryEmail: authEmail,
          displayName: "Camila Registrada",
          source: "CUSTOMER_AUTH",
          identities: {
            create: [
              {
                type: "EMAIL",
                normalizedValue: authEmail,
                verificationStatus: "VERIFIED",
                verifiedAt: new Date(),
                verificationSource: "SIGNUP_OTP",
              },
            ],
          },
        },
      });
      createdContactIds.push(authContact.id);

      const authCustomer = await prisma.customer.create({
        data: {
          contactId: authContact.id,
          email: authEmail,
          firstName: "Camila",
          lastName: "Registrada",
          supabaseUserId: `supa-cust-${suffix}`,
          referralCode: `REFM${suffix.toUpperCase()}`,
          loyaltyPoints: 450,
        },
      });
      createdCustomerIds.push(authCustomer.id);

      const guestContact = await prisma.contact.create({
        data: {
          primaryEmail: guestEmail,
          primaryPhoneE164: "+573157776655",
          documentType: "CC",
          documentNumber: `9988${suffix.slice(0, 4)}`,
          displayName: "Camila Invitada",
          source: "GUEST_ORDER",
          identities: {
            create: [
              {
                type: "EMAIL",
                normalizedValue: guestEmail,
                verificationStatus: "UNVERIFIED_OBSERVED",
              },
              {
                type: "PHONE",
                normalizedValue: "+573157776655",
                verificationStatus: "UNVERIFIED_OBSERVED",
              },
            ],
          },
        },
      });
      createdContactIds.push(guestContact.id);

      const guestOrder = await prisma.order.create({
        data: {
          number: `LUC-MRG-${suffix.toUpperCase()}`,
          contactId: guestContact.id,
          email: guestEmail,
          phone: "+573157776655",
          status: "PAID",
          paymentMethod: "WOMPI",
          subtotal: 8_900_000,
          shipping: 1_200_000,
          discount: 0,
          loyaltyDiscount: 0,
          total: 10_100_000,
          shippingAddress: {
            fullName: "Camila Invitada",
            line1: "Cra 15 # 85-10",
            city: "Bogotá",
            department: "Cundinamarca",
          },
        },
      });
      createdOrderIds.push(guestOrder.id);

      const guestTicket = await prisma.supportTicket.create({
        data: {
          contactId: guestContact.id,
          email: guestEmail,
          name: "Camila Invitada",
          subject: "Consulta de empaque de regalo",
          message: "Hola, ¿pueden incluir tarjeta personalizada?",
          status: "OPEN",
          orderNumber: guestOrder.number,
        },
      });
      createdTicketIds.push(guestTicket.id);

      const guestConsent = await prisma.consent.create({
        data: {
          contactId: guestContact.id,
          email: guestEmail,
          scope: "NEWSLETTER",
          accepted: true,
          version: "v1.0",
        },
      });
      createdConsentIds.push(guestConsent.id);

      await prisma.$transaction(async (tx) => {
        await enqueueMergeCandidateTx(tx, {
          contactIdA: authContact.id,
          contactIdB: guestContact.id,
          reasonCode: "SAME_BUYER_PHONE_E164",
          evidence: { phoneE164: "+573157776655", orderNumber: guestOrder.number },
        });
      });

      const listBefore = await listMergeCandidatesForActor(
        { status: "PENDING" },
        "OPERATIONS_MANAGER",
      );
      const candidate = listBefore.items.find(
        (it) =>
          (it.primaryContact.id === authContact.id && it.secondaryContact.id === guestContact.id) ||
          (it.primaryContact.id === guestContact.id && it.secondaryContact.id === authContact.id),
      );
      expect(candidate).toBeDefined();
      expect(candidate!.bothHaveActiveCustomerAccounts).toBe(false);
      expect(candidate!.forcedSurvivorContactId).toBe(authContact.id);

      // Si se intenta elegir al invitado como sobreviviente habiendo cuenta activa, debe rechazar.
      await expect(
        mergeContactsByHumanApproval({
          candidateId: candidate!.id,
          survivorContactId: guestContact.id,
          actorAdminId: admin.id,
        }),
      ).rejects.toMatchObject({ code: "INVALID_SURVIVOR" });

      const mergeResult = await mergeContactsByHumanApproval({
        candidateId: candidate!.id,
        survivorContactId: authContact.id,
        actorAdminId: admin.id,
        note: "Mismo comprador confirmado por celular y pedido previo",
      });

      expect(mergeResult.survivorContactId).toBe(authContact.id);
      expect(mergeResult.absorbedContactId).toBe(guestContact.id);
      expect(mergeResult.movedCounts.orders).toBe(1);
      expect(mergeResult.movedCounts.supportTickets).toBe(1);
      expect(mergeResult.movedCounts.consents).toBe(1);

      const [updatedOrder, updatedTicket, updatedSurvivor, updatedAbsorbed, savedCandidate] =
        await Promise.all([
          prisma.order.findUniqueOrThrow({ where: { id: guestOrder.id } }),
          prisma.supportTicket.findUniqueOrThrow({ where: { id: guestTicket.id } }),
          prisma.contact.findUniqueOrThrow({
            where: { id: authContact.id },
            include: { identities: true },
          }),
          prisma.contact.findUniqueOrThrow({ where: { id: guestContact.id } }),
          prisma.identityMergeCandidate.findUniqueOrThrow({ where: { id: candidate!.id } }),
        ]);

      expect(updatedOrder.contactId).toBe(authContact.id);
      expect(updatedTicket.contactId).toBe(authContact.id);
      expect(updatedSurvivor.primaryPhoneE164).toBe("+573157776655");
      expect(updatedSurvivor.documentType).toBe("CC");
      expect(
        updatedSurvivor.identities.some(
          (i) =>
            i.type === "EMAIL" &&
            i.normalizedValue === guestEmail &&
            i.verificationStatus !== "REVOKED",
        ),
      ).toBe(true);
      expect(updatedAbsorbed.deletedAt).not.toBeNull();
      expect(savedCandidate.status).toBe("APPROVED");
      expect(savedCandidate.mergeSnapshotJson).toMatchObject({
        version: 1,
        survivorContactId: authContact.id,
        absorbedContactId: guestContact.id,
      });

      // Visitar la URL antigua del contacto absorbido redirige al sobreviviente activo.
      const routeResolution = await resolveContactRouteParam(guestContact.id);
      expect(routeResolution).toEqual({
        kind: "redirect",
        contactId: authContact.id,
      });
    });

    it("bloquea fusionar dos contactos que poseen cuentas autenticadas independientes", async () => {
      const suffix = randomUUID().slice(0, 8);
      const admin = await prisma.adminUser.create({
        data: {
          email: `merge-admin2-${suffix}@lucams.test`,
          supabaseUserId: `supa-admin2-${suffix}`,
          role: "SUPERADMIN",
          isActive: true,
        },
      });
      createdAdminIds.push(admin.id);

      const emailA = `dual-a-${suffix}@lucams.test`;
      const emailB = `dual-b-${suffix}@lucams.test`;

      const contactA = await prisma.contact.create({
        data: { primaryEmail: emailA, displayName: "Hermana A", source: "CUSTOMER_AUTH" },
      });
      const contactB = await prisma.contact.create({
        data: { primaryEmail: emailB, displayName: "Hermana B", source: "CUSTOMER_AUTH" },
      });
      createdContactIds.push(contactA.id, contactB.id);

      const custA = await prisma.customer.create({
        data: {
          contactId: contactA.id,
          email: emailA,
          firstName: "Hermana",
          lastName: "A",
          supabaseUserId: `supa-duala-${suffix}`,
          referralCode: `REFA${suffix.toUpperCase()}`,
        },
      });
      const custB = await prisma.customer.create({
        data: {
          contactId: contactB.id,
          email: emailB,
          firstName: "Hermana",
          lastName: "B",
          supabaseUserId: `supa-dualb-${suffix}`,
          referralCode: `REFB${suffix.toUpperCase()}`,
        },
      });
      createdCustomerIds.push(custA.id, custB.id);

      await prisma.$transaction(async (tx) => {
        await enqueueMergeCandidateTx(tx, {
          contactIdA: contactA.id,
          contactIdB: contactB.id,
          reasonCode: "SAME_BUYER_PHONE_E164",
        });
      });

      const [minId, maxId] = [contactA.id, contactB.id].sort();
      const candidate = await prisma.identityMergeCandidate.findUniqueOrThrow({
        where: {
          primaryContactId_secondaryContactId: {
            primaryContactId: minId,
            secondaryContactId: maxId,
          },
        },
      });

      await expect(
        mergeContactsByHumanApproval({
          candidateId: candidate.id,
          survivorContactId: contactA.id,
          actorAdminId: admin.id,
        }),
      ).rejects.toBeInstanceOf(MergeValidationError);

      await expect(
        mergeContactsByHumanApproval({
          candidateId: candidate.id,
          survivorContactId: contactA.id,
          actorAdminId: admin.id,
        }),
      ).rejects.toMatchObject({ code: "BOTH_HAVE_CUSTOMER_ACCOUNTS" });

      // Sí permite descartar el par como personas distintas y el bloqueo do-not-suggest persiste.
      await rejectMergeCandidate({
        candidateId: candidate.id,
        actorAdminId: admin.id,
        note: "Hermanas con celular familiar compartido",
      });

      await prisma.$transaction(async (tx) => {
        await enqueueMergeCandidateTx(tx, {
          contactIdA: contactB.id,
          contactIdB: contactA.id,
          reasonCode: "SAME_BILLING_DOCUMENT",
        });
      });

      const afterResuggest = await prisma.identityMergeCandidate.findUniqueOrThrow({
        where: { id: candidate.id },
      });
      expect(afterResuggest.status).toBe("REJECTED");
    });
  },
);
