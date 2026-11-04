/*
 * Servicio del Pipeline Consultivo B2B / Eventos (`Opportunity` · `Fase 12 · S24`).
 *
 * Regla de arquitectura:
 *   - CERO pedidos B2C self-service crean `Opportunity`. Este pipeline existe únicamente
 *     para ventas consultivas de volumen (regalos corporativos, bodas, grados, marcas).
 *   - Al recibir una solicitud pública en `/empresas-y-eventos`, resuelve/crea `Contact` +
 *     `Organization` (si aplica), persiste prueba de consentimiento Ley 1581 (`HABEAS_DATA`
 *     y opcionalmente `NEWSLETTER`), crea la `Opportunity` (`OP-XXXXXX`) y agenda una
 *     `Task` automática de seguimiento visible en `/admin/hoy`.
 */

import "server-only";
import { randomBytes } from "node:crypto";
import { Prisma } from "@lucams/db";
import { prisma } from "@/lib/db";
import { rolesWithCapability } from "@/lib/admin-rbac";
import {
  normalizeTaxDocumentIdentity,
  resolveQuoteContactTx,
} from "@/features/identity/resolution-service";
import {
  isOpportunityEventType,
  isOpportunityStage,
  OPPORTUNITY_EVENT_LABELS,
  type B2bInquiryInput,
  type OpportunityEventType,
  type OpportunityStage,
} from "./schemas";

const OP_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function generateOpportunityNumber(): string {
  const bytes = randomBytes(6);
  let code = "";
  for (let i = 0; i < 6; i++) {
    code += OP_ALPHABET[bytes[i]! % OP_ALPHABET.length];
  }
  return `OP-${code}`;
}

function sanitizeUtmSlug(raw: string | null | undefined, maxLen = 100): string | null {
  if (!raw) return null;
  const cleaned = raw
    .trim()
    .replace(/[^\w\-./:@ ]/g, "")
    .slice(0, maxLen);
  return cleaned || null;
}

export class OpportunityValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OpportunityValidationError";
  }
}

export async function createPublicB2bOpportunity(
  input: B2bInquiryInput,
  context: {
    customerId?: string | null;
    ip: string | null;
    userAgent: string | null;
    privacyPolicyVersion: string;
    utmSource?: string | null;
    utmMedium?: string | null;
    utmCampaign?: string | null;
    landingPath?: string | null;
  },
): Promise<{ id: string; number: string; contactId: string }> {
  const now = new Date();
  const dueIn24h = new Date(now.getTime() + 24 * 60 * 60 * 1000);
  const eventDate = input.eventDate ? new Date(`${input.eventDate}T12:00:00.000-05:00`) : null;

  const cleanOrgName = input.organizationName?.trim() || "";
  const normalizedNit = input.nit?.trim() ? normalizeTaxDocumentIdentity("NIT", input.nit) : null;

  const titlePrefix = cleanOrgName || input.contactName.trim();
  const title =
    `${titlePrefix} · ${OPPORTUNITY_EVENT_LABELS[input.eventType]} (${input.expectedUnits} uds.)`.slice(
      0,
      190,
    );

  return prisma.$transaction(
    async (tx) => {
      const contactId = await resolveQuoteContactTx(tx, {
        customerId: context.customerId ?? null,
        customerName: input.contactName,
        customerWhatsapp: input.whatsapp,
        customerEmail: input.email,
      });

      if (!contactId) {
        throw new OpportunityValidationError(
          "No pudimos registrar tus datos de contacto. Verifica tu correo y celular.",
        );
      }

      // Vincular o crear `Organization` si indicó empresa o NIT.
      let organizationId: string | null = null;
      if (cleanOrgName) {
        if (normalizedNit) {
          const existingOrg = await tx.organization.findFirst({
            where: {
              deletedAt: null,
              taxIdType: "NIT",
              taxIdNumber: normalizedNit.documentNumber,
            },
            select: { id: true },
          });
          if (existingOrg) {
            organizationId = existingOrg.id;
          }
        }

        if (!organizationId) {
          const createdOrg = await tx.organization.create({
            data: {
              name: cleanOrgName,
              taxIdType: normalizedNit ? "NIT" : null,
              taxIdNumber: normalizedNit ? normalizedNit.documentNumber : null,
              city: input.city.trim(),
              department: input.department?.trim() || null,
            },
            select: { id: true },
          });
          organizationId = createdOrg.id;
        }

        await tx.contact.updateMany({
          where: { id: contactId, organizationId: null },
          data: { organizationId },
        });
      }

      // Reintentar hasta 5 veces si hubiera colisión P2002 en `OP-XXXXXX`.
      let createdOpp: { id: string; number: string } | null = null;
      for (let attempt = 0; attempt < 5; attempt++) {
        const candidateNumber = generateOpportunityNumber();
        try {
          createdOpp = await tx.opportunity.create({
            data: {
              number: candidateNumber,
              contactId,
              organizationId,
              title,
              eventType: input.eventType,
              stage: "NEW",
              expectedUnits: input.expectedUnits,
              expectedAmountCop: 0,
              eventDate: eventDate && !Number.isNaN(eventDate.getTime()) ? eventDate : null,
              city: input.city.trim(),
              department: input.department?.trim() || null,
              notes: input.notes.trim(),
              dataConsentAt: now,
              dataConsentVersion: context.privacyPolicyVersion,
              utmSource: sanitizeUtmSlug(context.utmSource),
              utmMedium: sanitizeUtmSlug(context.utmMedium),
              utmCampaign: sanitizeUtmSlug(context.utmCampaign),
              landingPath: sanitizeUtmSlug(context.landingPath, 160),
            },
            select: { id: true, number: true },
          });
          break;
        } catch (err) {
          if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
            continue;
          }
          throw err;
        }
      }

      if (!createdOpp) {
        throw new OpportunityValidationError(
          "No se pudo generar el radicado de tu oportunidad. Intenta nuevamente.",
        );
      }

      // Evidencia inmutable Ley 1581 (`HABEAS_DATA` obligatoria + `NEWSLETTER` opcional).
      await tx.consent.create({
        data: {
          contactId,
          customerId: context.customerId ?? null,
          email: input.email.trim().toLowerCase(),
          scope: "HABEAS_DATA",
          accepted: true,
          version: context.privacyPolicyVersion,
          ipAddress: context.ip,
          userAgent: context.userAgent,
        },
      });

      if (input.acceptNewsletter) {
        await tx.consent.create({
          data: {
            contactId,
            customerId: context.customerId ?? null,
            email: input.email.trim().toLowerCase(),
            scope: "NEWSLETTER",
            accepted: true,
            version: context.privacyPolicyVersion,
            ipAddress: context.ip,
            userAgent: context.userAgent,
          },
        });
      }

      // Tarea automática en Bandeja Hoy para respuesta comercial rápida (< 24h).
      await tx.task.create({
        data: {
          title: `Contactar oportunidad ${createdOpp.number} (${titlePrefix})`,
          description: `${input.expectedUnits} unidades · ${OPPORTUNITY_EVENT_LABELS[input.eventType]} · Ciudad: ${input.city}`,
          status: "OPEN",
          priority: input.expectedUnits >= 100 ? "URGENT" : "HIGH",
          dueAt: dueIn24h,
          contactId,
          opportunityId: createdOpp.id,
        },
      });

      // Bitácora automática en Contacto 360.
      await tx.contactActivity.create({
        data: {
          contactId,
          kind: "SYSTEM",
          body: `Solicitud B2B / Eventos ${createdOpp.number} recibida (${input.expectedUnits} unidades · ${OPPORTUNITY_EVENT_LABELS[input.eventType]}).`,
          metadata: {
            opportunityId: createdOpp.id,
            opportunityNumber: createdOpp.number,
            expectedUnits: input.expectedUnits,
          },
        },
      });

      return {
        id: createdOpp.id,
        number: createdOpp.number,
        contactId,
      };
    },
    { maxWait: 10_000, timeout: 25_000 },
  );
}

export type OpportunityListItem = {
  id: string;
  number: string;
  title: string;
  stage: OpportunityStage;
  eventType: OpportunityEventType;
  expectedUnits: number | null;
  expectedAmountCop: number;
  eventDate: Date | null;
  city: string | null;
  contactId: string;
  contactName: string;
  contactEmail: string | null;
  contactPhone: string | null;
  organizationName: string | null;
  ownerAdminEmail: string | null;
  createdAt: Date;
  updatedAt: Date;
};

export async function listOpportunitiesForAdmin(opts: { stage?: string; q?: string }) {
  const cleanQ = opts.q?.trim() || "";
  const stageFilter = opts.stage && isOpportunityStage(opts.stage) ? opts.stage : undefined;

  const where: Prisma.OpportunityWhereInput = {
    deletedAt: null,
    ...(stageFilter ? { stage: stageFilter } : {}),
    ...(cleanQ
      ? {
          OR: [
            { number: { contains: cleanQ, mode: "insensitive" } },
            { title: { contains: cleanQ, mode: "insensitive" } },
            { contact: { displayName: { contains: cleanQ, mode: "insensitive" } } },
            { contact: { primaryEmail: { contains: cleanQ, mode: "insensitive" } } },
            { organization: { name: { contains: cleanQ, mode: "insensitive" } } },
          ],
        }
      : {}),
  };

  const [rows, allActiveForKpi] = await Promise.all([
    prisma.opportunity.findMany({
      where,
      orderBy: [{ createdAt: "desc" }],
      take: 80,
      include: {
        contact: {
          select: {
            id: true,
            displayName: true,
            primaryEmail: true,
            primaryPhoneE164: true,
          },
        },
        organization: { select: { name: true } },
        ownerAdmin: { select: { email: true } },
      },
    }),
    prisma.opportunity.findMany({
      where: { deletedAt: null },
      select: { stage: true, expectedAmountCop: true },
    }),
  ]);

  const stageCounts: Record<OpportunityStage, number> = {
    NEW: 0,
    QUALIFYING: 0,
    PROPOSAL_SENT: 0,
    WON: 0,
    LOST: 0,
  };
  let openPipelineCents = 0;
  let wonRevenueCents = 0;

  for (const r of allActiveForKpi) {
    const st: OpportunityStage = isOpportunityStage(r.stage) ? r.stage : "NEW";
    stageCounts[st] += 1;
    if (st === "NEW" || st === "QUALIFYING" || st === "PROPOSAL_SENT") {
      openPipelineCents += r.expectedAmountCop;
    } else if (st === "WON") {
      wonRevenueCents += r.expectedAmountCop;
    }
  }

  const items: OpportunityListItem[] = rows.map((r) => ({
    id: r.id,
    number: r.number,
    title: r.title,
    stage: isOpportunityStage(r.stage) ? r.stage : "NEW",
    eventType: isOpportunityEventType(r.eventType) ? r.eventType : "OTHER",
    expectedUnits: r.expectedUnits,
    expectedAmountCop: r.expectedAmountCop,
    eventDate: r.eventDate,
    city: r.city,
    contactId: r.contact.id,
    contactName: r.contact.displayName ?? r.contact.primaryEmail ?? "Contacto B2B",
    contactEmail: r.contact.primaryEmail,
    contactPhone: r.contact.primaryPhoneE164,
    organizationName: r.organization?.name ?? null,
    ownerAdminEmail: r.ownerAdmin?.email ?? null,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
  }));

  return {
    items,
    kpis: {
      total: allActiveForKpi.length,
      stageCounts,
      openPipelineCents,
      wonRevenueCents,
    },
  };
}

export async function getOpportunityDetail(idOrNumber: string) {
  const clean = idOrNumber.trim();
  if (!clean) return null;

  return prisma.opportunity.findFirst({
    where: {
      deletedAt: null,
      OR: [{ id: clean }, { number: clean.toUpperCase() }],
    },
    include: {
      contact: {
        select: {
          id: true,
          displayName: true,
          primaryEmail: true,
          primaryPhoneE164: true,
        },
      },
      organization: {
        select: {
          id: true,
          name: true,
          taxIdType: true,
          taxIdNumber: true,
          city: true,
          department: true,
        },
      },
      ownerAdmin: { select: { id: true, email: true } },
      convertedOrder: { select: { id: true, number: true, total: true, status: true } },
      convertedQuote: { select: { id: true, number: true, total: true, status: true } },
    },
  });
}

export async function listAssignableOpportunityAdmins() {
  const roles = rolesWithCapability("opportunities:manage");
  return prisma.adminUser.findMany({
    where: { isActive: true, deletedAt: null, role: { in: roles } },
    select: { id: true, email: true, role: true },
    orderBy: { email: "asc" },
  });
}

export async function updateOpportunityByAdmin(input: {
  id: string;
  stage: OpportunityStage;
  expectedUnits: number | null;
  expectedAmountCop: number;
  ownerAdminId: string | null;
  internalNotes: string | null;
  lostReason: string | null;
  convertedOrderNumber?: string | null;
}) {
  if (!isOpportunityStage(input.stage)) {
    throw new OpportunityValidationError("Etapa de oportunidad inválida.");
  }
  if (!Number.isInteger(input.expectedAmountCop) || input.expectedAmountCop < 0) {
    throw new OpportunityValidationError("El presupuesto estimado debe ser mayor o igual a $0.");
  }
  if (
    input.expectedUnits !== null &&
    (!Number.isInteger(input.expectedUnits) || input.expectedUnits < 0)
  ) {
    throw new OpportunityValidationError("Las unidades estimadas deben ser un entero positivo.");
  }
  if (input.stage === "LOST" && (!input.lostReason || input.lostReason.trim().length < 3)) {
    throw new OpportunityValidationError(
      "Indica brevemente el motivo de pérdida para alimentar el aprendizaje comercial.",
    );
  }

  let convertedOrderId: string | null | undefined = undefined;
  if (input.convertedOrderNumber !== undefined) {
    const cleanOrd = (input.convertedOrderNumber ?? "").trim().toUpperCase();
    if (!cleanOrd) {
      convertedOrderId = null;
    } else {
      const order = await prisma.order.findFirst({
        where: { deletedAt: null, number: cleanOrd },
        select: { id: true },
      });
      if (!order) {
        throw new OpportunityValidationError(`No existe un pedido activo con número ${cleanOrd}.`);
      }
      convertedOrderId = order.id;
    }
  }

  return prisma.opportunity.update({
    where: { id: input.id },
    data: {
      stage: input.stage,
      expectedUnits: input.expectedUnits,
      expectedAmountCop: input.expectedAmountCop,
      ownerAdminId: input.ownerAdminId,
      internalNotes: input.internalNotes?.trim() || null,
      lostReason: input.stage === "LOST" ? input.lostReason?.trim() || null : null,
      ...(convertedOrderId !== undefined ? { convertedOrderId } : {}),
    },
  });
}
