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
import { Prisma, type AdminRole } from "@lucams/db";
import { prisma } from "@/lib/db";
import { hasCapability, rolesWithCapability } from "@/lib/admin-rbac";
import { capitalizeName } from "@/lib/colombia-validators";
import { maskEmail, maskPersonName, maskPhone } from "@/lib/pii-mask";
import {
  normalizeEmailIdentity,
  normalizePhoneIdentityE164,
  normalizeTaxDocumentIdentity,
  resolveCommercialContactTx,
} from "@/features/identity/resolution-service";
import {
  B2B_ARTWORK_MODE_LABELS,
  B2B_PACKAGING_TYPE_LABELS,
  B2bConfiguredLineInputSchema,
  isB2bArtworkMode,
  isB2bPackagingType,
  isOpportunityEventType,
  isOpportunityStage,
  OPPORTUNITY_EVENT_LABELS,
  OPPORTUNITY_EVENT_TYPES,
  todayBogotaIso,
  type B2bArtworkMode,
  type B2bInquiryInput,
  type B2bPackagingType,
  type B2bRequestedConfig,
  type OpportunityEventType,
  type OpportunityStage,
} from "./schemas";
import {
  computeConfiguratorEstimate,
  evaluateEventDateFeasibility,
  MIN_B2B_PHYSICAL_UNITS,
} from "./configurator-math";
import { getPublicB2bConfiguratorCatalog } from "./configurator-catalog";

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
  const cleanContactName = capitalizeName(input.contactName.trim());
  const cleanContactEmail = normalizeEmailIdentity(input.email);
  const cleanContactWhatsapp = normalizePhoneIdentityE164(input.whatsapp) || input.whatsapp.trim();

  const artworkMode: B2bArtworkMode =
    input.artworkMode && isB2bArtworkMode(input.artworkMode) ? input.artworkMode : "SAME_DESIGN";
  const packagingType: B2bPackagingType =
    input.packagingType && isB2bPackagingType(input.packagingType)
      ? input.packagingType
      : "BULK_STANDARD";

  let effectiveExpectedUnits = input.expectedUnits;
  let effectiveExpectedAmountCop = 0;
  let maxBaseProductionDays = 2;
  let requestedConfig: B2bRequestedConfig;
  const structuredSummaryLines: string[] = [];

  if (input.configMode === "CATALOG_LINES") {
    let rawLines: unknown = [];
    try {
      rawLines = JSON.parse(input.configuredLinesJson || "[]");
    } catch {
      throw new OpportunityValidationError(
        "La selección de productos del configurador es inválida.",
      );
    }
    const parsedLines = B2bConfiguredLineInputSchema.array().min(1).max(5).safeParse(rawLines);
    if (!parsedLines.success) {
      throw new OpportunityValidationError(
        "Selecciona entre 1 y 5 referencias válidas del catálogo.",
      );
    }

    const catalog = await getPublicB2bConfiguratorCatalog();
    const estimate = computeConfiguratorEstimate(
      catalog,
      parsedLines.data,
      artworkMode,
      packagingType,
    );

    if (estimate.resolvedLines.length === 0) {
      throw new OpportunityValidationError(
        "Las opciones seleccionadas ya no están disponibles. Actualiza la página e intenta de nuevo.",
      );
    }
    if (!estimate.meetsMinimumUnits) {
      throw new OpportunityValidationError(
        `Para proyectos empresariales o eventos atendemos desde ${MIN_B2B_PHYSICAL_UNITS} unidades físicas en total.`,
      );
    }

    effectiveExpectedUnits = estimate.totalPhysicalPieces;
    effectiveExpectedAmountCop = estimate.estimatedMaxCents;

    for (const line of estimate.resolvedLines) {
      const prod = catalog.products.find((p) => p.id === line.productId);
      if (prod && prod.productionDays > maxBaseProductionDays) {
        maxBaseProductionDays = prod.productionDays;
      }
      const packDetail =
        line.piecesPerUnit > 1
          ? `${line.commercialQty} packs (${line.physicalPieces} uds.)`
          : `${line.physicalPieces} uds.`;
      structuredSummaryLines.push(`• ${line.productName} — ${line.variantName}: ${packDetail}`);
    }

    const feasibility = evaluateEventDateFeasibility({
      todayIso: todayBogotaIso(),
      eventDateIso: input.eventDate ?? "",
      cityCode: input.cityCode || null,
      cityName: input.city,
      totalPhysicalPieces: effectiveExpectedUnits,
      maxBaseProductionDays,
      artworkMode,
      packagingType,
    });

    requestedConfig = {
      version: 1,
      mode: "CATALOG_LINES",
      lines: estimate.resolvedLines,
      artworkMode,
      packagingType,
      cityCode: input.cityCode || null,
      departmentCode: input.departmentCode || null,
      dateSemaphore: feasibility.state,
      businessDaysAvailable: feasibility.businessDaysAvailable,
      recommendedMinBusinessDays: feasibility.recommendedMinBusinessDays,
      estimatedMinCents: estimate.estimatedMinCents,
      estimatedMaxCents: estimate.estimatedMaxCents,
    };
  } else {
    const feasibility = evaluateEventDateFeasibility({
      todayIso: todayBogotaIso(),
      eventDateIso: input.eventDate ?? "",
      cityCode: input.cityCode || null,
      cityName: input.city,
      totalPhysicalPieces: effectiveExpectedUnits,
      maxBaseProductionDays,
      artworkMode,
      packagingType,
    });

    requestedConfig = {
      version: 1,
      mode: "ADVISORY_OPEN",
      lines: [],
      artworkMode,
      packagingType,
      cityCode: input.cityCode || null,
      departmentCode: input.departmentCode || null,
      dateSemaphore: feasibility.state,
      businessDaysAvailable: feasibility.businessDaysAvailable,
      recommendedMinBusinessDays: feasibility.recommendedMinBusinessDays,
      estimatedMinCents: null,
      estimatedMaxCents: null,
    };
  }

  const clientFreeNotes = (input.notes ?? "").trim();
  const configFooter = [
    `Arte: ${B2B_ARTWORK_MODE_LABELS[artworkMode]}`,
    `Empaque: ${B2B_PACKAGING_TYPE_LABELS[packagingType]}`,
  ].join(" · ");
  const composedNotes =
    structuredSummaryLines.length > 0
      ? [
          "Configuración solicitada:",
          ...structuredSummaryLines,
          configFooter,
          ...(clientFreeNotes ? ["", `Notas del cliente: ${clientFreeNotes}`] : []),
        ]
          .join("\n")
          .slice(0, 2500)
      : clientFreeNotes || configFooter;

  const taskPriority: "URGENT" | "HIGH" =
    effectiveExpectedUnits >= 100 ||
    requestedConfig.dateSemaphore === "CRITICAL_TIGHT" ||
    requestedConfig.dateSemaphore === "URGENT_VIABLE"
      ? "URGENT"
      : "HIGH";

  const titlePrefix = cleanOrgName || cleanContactName;
  const title =
    `${titlePrefix} · ${OPPORTUNITY_EVENT_LABELS[input.eventType]} (${effectiveExpectedUnits} uds.)`.slice(
      0,
      190,
    );

  return prisma.$transaction(
    async (tx) => {
      const contactId = await resolveCommercialContactTx(tx, {
        customerId: context.customerId ?? null,
        customerName: cleanContactName,
        customerWhatsapp: input.whatsapp,
        customerEmail: cleanContactEmail,
        sourceOverride: "B2B_INQUIRY",
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
              contactName: cleanContactName,
              contactEmail: cleanContactEmail || null,
              contactWhatsapp: cleanContactWhatsapp || null,
              title,
              eventType: input.eventType,
              stage: "NEW",
              expectedUnits: effectiveExpectedUnits,
              expectedAmountCop: effectiveExpectedAmountCop,
              eventDate: eventDate && !Number.isNaN(eventDate.getTime()) ? eventDate : null,
              city: input.city.trim(),
              department: input.department?.trim() || null,
              notes: composedNotes,
              requestedConfig: requestedConfig as unknown as Prisma.InputJsonValue,
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
          description: `${effectiveExpectedUnits} unidades · ${OPPORTUNITY_EVENT_LABELS[input.eventType]} · Ciudad: ${input.city}`,
          status: "OPEN",
          priority: taskPriority,
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
          body: `Solicitud B2B / Eventos ${createdOpp.number} recibida (${effectiveExpectedUnits} unidades · ${OPPORTUNITY_EVENT_LABELS[input.eventType]}).`,
          metadata: {
            opportunityId: createdOpp.id,
            opportunityNumber: createdOpp.number,
            expectedUnits: effectiveExpectedUnits,
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

export async function listOpportunitiesForAdmin(
  opts: {
    stage?: string;
    eventType?: string;
    q?: string;
    page?: number;
    pageSize?: number;
  },
  actorRole?: AdminRole,
) {
  const canReadPii = !actorRole || hasCapability(actorRole, "contacts:read_pii");
  const cleanQ = opts.q?.trim() || "";
  const stageFilter = opts.stage && isOpportunityStage(opts.stage) ? opts.stage : undefined;
  const eventTypeFilter =
    opts.eventType && isOpportunityEventType(opts.eventType) ? opts.eventType : undefined;
  const pageSize = Math.min(Math.max(opts.pageSize ?? 25, 1), 100);

  const searchOr: Prisma.OpportunityWhereInput[] = cleanQ
    ? canReadPii
      ? [
          { number: { contains: cleanQ, mode: "insensitive" } },
          { title: { contains: cleanQ, mode: "insensitive" } },
          { city: { contains: cleanQ, mode: "insensitive" } },
          { contactName: { contains: cleanQ, mode: "insensitive" } },
          { contactEmail: { contains: cleanQ, mode: "insensitive" } },
          { contactWhatsapp: { contains: cleanQ } },
          { contact: { displayName: { contains: cleanQ, mode: "insensitive" } } },
          { contact: { primaryEmail: { contains: cleanQ, mode: "insensitive" } } },
          { organization: { name: { contains: cleanQ, mode: "insensitive" } } },
        ]
      : [
          { number: { contains: cleanQ, mode: "insensitive" } },
          { title: { contains: cleanQ, mode: "insensitive" } },
          { city: { contains: cleanQ, mode: "insensitive" } },
          { organization: { name: { contains: cleanQ, mode: "insensitive" } } },
        ]
    : [];

  const where: Prisma.OpportunityWhereInput = {
    deletedAt: null,
    ...(stageFilter ? { stage: stageFilter } : {}),
    ...(eventTypeFilter ? { eventType: eventTypeFilter } : {}),
    ...(searchOr.length > 0 ? { OR: searchOr } : {}),
  };

  const [totalFiltered, allActiveForKpi] = await Promise.all([
    prisma.opportunity.count({ where }),
    prisma.opportunity.findMany({
      where: { deletedAt: null },
      select: {
        stage: true,
        eventType: true,
        expectedAmountCop: true,
        eventDate: true,
      },
    }),
  ]);

  const totalPages = Math.max(1, Math.ceil(totalFiltered / pageSize));
  const clampedPage = Math.min(Math.max(opts.page ?? 1, 1), totalPages);

  const rows = await prisma.opportunity.findMany({
    where,
    orderBy: [{ createdAt: "desc" }],
    skip: (clampedPage - 1) * pageSize,
    take: pageSize,
    include: {
      contact: {
        select: {
          id: true,
          displayName: true,
          primaryEmail: true,
          primaryPhoneE164: true,
          identities: {
            where: {
              type: { in: ["WHATSAPP", "PHONE"] },
              verificationStatus: { not: "REVOKED" },
            },
            orderBy: { createdAt: "desc" },
            take: 2,
            select: { type: true, normalizedValue: true },
          },
        },
      },
      organization: { select: { name: true } },
      ownerAdmin: { select: { email: true } },
    },
  });

  const stageCounts: Record<OpportunityStage, number> = {
    NEW: 0,
    QUALIFYING: 0,
    PROPOSAL_SENT: 0,
    WON: 0,
    LOST: 0,
  };
  const byEventType: Record<OpportunityEventType, { count: number; amountCents: number }> = {
    CORPORATE_GIFT: { count: 0, amountCents: 0 },
    WEDDING_SOCIAL: { count: 0, amountCents: 0 },
    SCHOOL_GRADUATION: { count: 0, amountCents: 0 },
    BRAND_MERCH: { count: 0, amountCents: 0 },
    OTHER: { count: 0, amountCents: 0 },
  };
  let openPipelineCents = 0;
  let wonRevenueCents = 0;
  let upcomingEvents14dCount = 0;
  const serverNowMs = Date.now();
  const horizon14dMs = serverNowMs + 14 * 24 * 60 * 60 * 1000;

  for (const r of allActiveForKpi) {
    const st: OpportunityStage = isOpportunityStage(r.stage) ? r.stage : "NEW";
    const ev: OpportunityEventType = isOpportunityEventType(r.eventType) ? r.eventType : "OTHER";
    stageCounts[st] += 1;
    byEventType[ev].count += 1;
    byEventType[ev].amountCents += r.expectedAmountCop;

    if (st === "NEW" || st === "QUALIFYING" || st === "PROPOSAL_SENT") {
      openPipelineCents += r.expectedAmountCop;
      if (r.eventDate && r.eventDate.getTime() <= horizon14dMs) {
        upcomingEvents14dCount += 1;
      }
    } else if (st === "WON") {
      wonRevenueCents += r.expectedAmountCop;
    }
  }

  const closedCount = stageCounts.WON + stageCounts.LOST;
  const winRatePct = closedCount > 0 ? Math.round((stageCounts.WON / closedCount) * 100) : null;

  const items: OpportunityListItem[] = rows.map((r) => {
    const rawName =
      r.contactName ??
      r.contact.displayName ??
      r.contactEmail ??
      r.contact.primaryEmail ??
      "Contacto B2B";
    const rawEmail = r.contactEmail ?? r.contact.primaryEmail;
    const rawPhone =
      r.contactWhatsapp ??
      r.contact.primaryPhoneE164 ??
      r.contact.identities.find((i) => i.type === "WHATSAPP")?.normalizedValue ??
      r.contact.identities.find((i) => i.type === "PHONE")?.normalizedValue ??
      null;

    return {
      id: r.id,
      number: r.number,
      title: canReadPii
        ? r.title
        : r.organization?.name
          ? `${r.organization.name} · ${OPPORTUNITY_EVENT_LABELS[isOpportunityEventType(r.eventType) ? r.eventType : "OTHER"]}`
          : r.number,
      stage: isOpportunityStage(r.stage) ? r.stage : "NEW",
      eventType: isOpportunityEventType(r.eventType) ? r.eventType : "OTHER",
      expectedUnits: r.expectedUnits,
      expectedAmountCop: r.expectedAmountCop,
      eventDate: r.eventDate,
      city: r.city,
      contactId: r.contact.id,
      contactName: canReadPii ? rawName : maskPersonName(rawName),
      contactEmail: rawEmail ? (canReadPii ? rawEmail : maskEmail(rawEmail)) : null,
      contactPhone: rawPhone ? (canReadPii ? rawPhone : maskPhone(rawPhone)) : null,
      organizationName: r.organization?.name ?? null,
      ownerAdminEmail: r.ownerAdmin?.email ?? null,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
    };
  });

  const orderedEventBreakdown = OPPORTUNITY_EVENT_TYPES.map((ev) => ({
    eventType: ev,
    label: OPPORTUNITY_EVENT_LABELS[ev],
    count: byEventType[ev].count,
    amountCents: byEventType[ev].amountCents,
  })).sort((a, b) => b.count - a.count || b.amountCents - a.amountCents);

  return {
    items,
    page: clampedPage,
    pageSize,
    totalFiltered,
    totalPages,
    piiMasked: !canReadPii,
    serverNowMs,
    kpis: {
      total: allActiveForKpi.length,
      stageCounts,
      byEventType: orderedEventBreakdown,
      openPipelineCents,
      wonRevenueCents,
      winRatePct,
      upcomingEvents14dCount,
    },
  };
}

export async function getServerNowMs(): Promise<number> {
  return Date.now();
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
      convertedOrder: {
        select: {
          id: true,
          number: true,
          total: true,
          status: true,
          paymentMethod: true,
          b2bArtworkReady: true,
          directPaymentReportedAt: true,
          directPaymentConfirmedAt: true,
        },
      },
      proposals: {
        orderBy: [{ version: "desc" }],
        include: {
          createdByAdmin: { select: { id: true, email: true } },
          order: {
            select: {
              id: true,
              number: true,
              status: true,
              total: true,
              paymentMethod: true,
              directPaymentMethod: true,
              directPaymentReference: true,
              directPaymentReportedAt: true,
              directPaymentConfirmedAt: true,
            },
          },
          items: {
            orderBy: [{ sortOrder: "asc" }],
            include: {
              variant: {
                select: {
                  id: true,
                  name: true,
                  sku: true,
                  attributes: true,
                  product: {
                    select: {
                      id: true,
                      name: true,
                      slug: true,
                    },
                  },
                },
              },
            },
          },
        },
      },
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
  contactName?: string | null;
  contactEmail?: string | null;
  contactWhatsapp?: string | null;
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

  const contactPatch: Prisma.OpportunityUncheckedUpdateInput = {};
  if (input.contactName !== undefined) {
    const trimmed = input.contactName?.trim() ?? "";
    contactPatch.contactName = trimmed ? capitalizeName(trimmed) : null;
  }
  if (input.contactEmail !== undefined) {
    const normEmail = normalizeEmailIdentity(input.contactEmail);
    contactPatch.contactEmail = normEmail || null;
  }
  if (input.contactWhatsapp !== undefined) {
    const rawPhone = input.contactWhatsapp?.trim() ?? "";
    contactPatch.contactWhatsapp = rawPhone
      ? normalizePhoneIdentityE164(rawPhone) || rawPhone
      : null;
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
      ...contactPatch,
    },
  });
}
