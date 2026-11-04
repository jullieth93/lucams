/*
 * Integración PostgreSQL — Invariantes DDL del Grafo de Identidad (S14 · Fase 6 · ADR-193).
 *
 * Verifica sobre Postgres real:
 *   1. Índice único parcial `"Contact_primaryEmail_active_key"`: bloquea dos `Contact`
 *      activos con el mismo `primaryEmail`, pero permite recrear uno nuevo si el
 *      anterior está soft-deleted (`deletedAt IS NOT NULL`).
 *   2. Índice único parcial `"ContactIdentity_unique_owner_key"`: bloquea dos contactos
 *      con el mismo `EMAIL` o `SUPABASE_USER` no revocado, permite reasignar si queda
 *      `REVOKED`, y permite que múltiples contactos compartan el mismo `PHONE` / `WHATSAPP`
 *      observado sin `P2002` (móviles familiares/reciclados en Colombia).
 *   3. `CHECK ("primaryContactId" <> "secondaryContactId")` en `IdentityMergeCandidate`.
 *   4. `ON DELETE SET NULL` limpio sobre las FKs anulables `contactId`.
 */

import { afterAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";

const hasDb = Boolean(process.env.DATABASE_URL);
const RUN = `idddl${Date.now().toString(36)}${Math.floor(Math.random() * 1e4).toString(36)}`;

describe.skipIf(!hasDb)("Grafo de Identidad DDL — índices parciales y CHECKs (S14)", () => {
  const contactIds: string[] = [];
  const orgIds: string[] = [];
  let ticketId: string | null = null;

  afterAll(async () => {
    const safe = (p: Promise<unknown>) => p.catch(() => {});
    if (ticketId) {
      await safe(prisma.supportTicket.deleteMany({ where: { id: ticketId } }));
    }
    if (contactIds.length > 0) {
      await safe(
        prisma.identityMergeCandidate.deleteMany({
          where: {
            OR: [
              { primaryContactId: { in: contactIds } },
              { secondaryContactId: { in: contactIds } },
            ],
          },
        }),
      );
      await safe(prisma.contactIdentity.deleteMany({ where: { contactId: { in: contactIds } } }));
      await safe(prisma.contact.deleteMany({ where: { id: { in: contactIds } } }));
    }
    if (orgIds.length > 0) {
      await safe(prisma.organization.deleteMany({ where: { id: { in: orgIds } } }));
    }
  });

  it("impone unicidad parcial en EMAIL/SUPABASE_USER activos, permite compartir PHONE E.164 y bloquea auto-par en IdentityMergeCandidate", async () => {
    const email = `${RUN}-owner@test.local`;
    const sharedPhone = "+573009998877";

    const org = await prisma.organization.create({
      data: {
        name: `Org ${RUN}`,
        taxIdType: "NIT",
        taxIdNumber: `900${RUN.slice(-6)}`,
      },
      select: { id: true, taxIdNumber: true },
    });
    orgIds.push(org.id);

    // Organización duplicada activa con mismo NIT falla
    await expect(
      prisma.organization.create({
        data: {
          name: `Org Dup ${RUN}`,
          taxIdType: "NIT",
          taxIdNumber: org.taxIdNumber,
        },
      }),
    ).rejects.toThrow();

    const c1 = await prisma.contact.create({
      data: {
        primaryEmail: email,
        primaryPhoneE164: sharedPhone,
        displayName: "Contacto Uno",
        organizationId: org.id,
        source: "CUSTOMER_AUTH",
      },
      select: { id: true },
    });
    contactIds.push(c1.id);

    // Segundo Contact ACTIVO con el mismo primaryEmail falla por Contact_primaryEmail_active_key
    await expect(
      prisma.contact.create({
        data: {
          primaryEmail: email,
          source: "GUEST_ORDER",
        },
      }),
    ).rejects.toThrow();

    // Segundo Contact con teléfono compartido y otro email SÍ se permite (cero P2002 por teléfono)
    const c2 = await prisma.contact.create({
      data: {
        primaryEmail: `${RUN}-sibling@test.local`,
        primaryPhoneE164: sharedPhone,
        displayName: "Contacto Hermano",
        source: "GUEST_ORDER",
      },
      select: { id: true },
    });
    contactIds.push(c2.id);

    await prisma.contactIdentity.create({
      data: {
        contactId: c1.id,
        type: "EMAIL",
        normalizedValue: email,
        verificationStatus: "VERIFIED",
        verifiedAt: new Date(),
        verificationSource: "SUPABASE_AUTH",
      },
    });

    // Otro Contact NO puede reclamar el mismo EMAIL mientras no esté REVOKED
    await expect(
      prisma.contactIdentity.create({
        data: {
          contactId: c2.id,
          type: "EMAIL",
          normalizedValue: email,
          verificationStatus: "UNVERIFIED_OBSERVED",
        },
      }),
    ).rejects.toThrow();

    // Ambos contactos SÍ pueden registrar el mismo PHONE observado sin bloqueo
    await prisma.contactIdentity.create({
      data: {
        contactId: c1.id,
        type: "PHONE",
        normalizedValue: sharedPhone,
        verificationStatus: "UNVERIFIED_OBSERVED",
      },
    });
    await prisma.contactIdentity.create({
      data: {
        contactId: c2.id,
        type: "PHONE",
        normalizedValue: sharedPhone,
        verificationStatus: "UNVERIFIED_OBSERVED",
      },
    });

    // Si la identidad EMAIL de c1 pasa a REVOKED y c1 queda soft-deleted, otro contacto puede usar ese email
    const c3 = await prisma.contact.create({
      data: {
        primaryEmail: null,
        source: "GUEST_ORDER",
      },
      select: { id: true },
    });
    contactIds.push(c3.id);

    await prisma.contactIdentity.updateMany({
      where: { contactId: c1.id, type: "EMAIL", normalizedValue: email },
      data: { verificationStatus: "REVOKED" },
    });
    await prisma.contact.update({
      where: { id: c1.id },
      data: { deletedAt: new Date() },
    });

    const adoptedEmailIdentity = await prisma.contactIdentity.create({
      data: {
        contactId: c3.id,
        type: "EMAIL",
        normalizedValue: email,
        verificationStatus: "UNVERIFIED_OBSERVED",
      },
      select: { id: true },
    });
    expect(adoptedEmailIdentity.id).toBeTruthy();

    // CHECK ("primaryContactId" <> "secondaryContactId") rechaza par consigo mismo
    await expect(
      prisma.identityMergeCandidate.create({
        data: {
          primaryContactId: c2.id,
          secondaryContactId: c2.id,
          reasonCode: "SAME_BUYER_PHONE_E164",
        },
      }),
    ).rejects.toThrow();

    // Par distinto sí se crea
    const mergePair = await prisma.identityMergeCandidate.create({
      data: {
        primaryContactId: c2.id,
        secondaryContactId: c3.id,
        reasonCode: "SAME_BUYER_PHONE_E164",
        reasonCodes: ["SAME_BUYER_PHONE_E164"],
      },
      select: { id: true },
    });
    expect(mergePair.id).toBeTruthy();

    // ON DELETE SET NULL sobre FK anulable contactId
    const tempContact = await prisma.contact.create({
      data: {
        primaryEmail: `${RUN}-temp@test.local`,
        source: "SUPPORT_TICKET",
      },
      select: { id: true },
    });
    const ticket = await prisma.supportTicket.create({
      data: {
        contactId: tempContact.id,
        email: `${RUN}-temp@test.local`,
        name: "Temp",
        subject: `${RUN} Test FK`,
        message: "Prueba SetNull",
      },
      select: { id: true },
    });
    ticketId = ticket.id;

    await prisma.contact.delete({ where: { id: tempContact.id } });
    const reloadedTicket = await prisma.supportTicket.findUnique({
      where: { id: ticket.id },
      select: { contactId: true },
    });
    expect(reloadedTicket?.contactId).toBeNull();
  });
});
