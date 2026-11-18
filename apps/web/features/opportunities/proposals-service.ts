/*
 * Servicio del Constructor de Propuestas B2B / Eventos (`OpportunityProposal` · `ADR-210`).
 *
 * Responsabilidades:
 *   1. Cotizar envío en vivo (Aveonline + Envío propio LUCAMS en Bogotá) con cálculo de
 *      bultos recomendados (`suggestedPackageCount`) según peso consolidado.
 *   2. Crear/actualizar borradores versionados (`v1, v2...`) validando piso de costo BOM
 *      (`unitPriceCents >= Product.cost` salvo override explícito de `SUPERADMIN`).
 *   3. Subir muestra digital comprimida y sanitizada (`sharp-safe`) al bucket privado
 *      `design-previews` (`b2b-proofs/<proposalId>/proof.webp`).
 *   4. Emitir la propuesta (`SENT`) generando secreto CSPRNG de 256 bits, guardando solo
 *      `tokenHash` SHA-256, reemplazando propuestas previas (`SUPERSEDED`), actualizando
 *      la `Opportunity` a `PROPOSAL_SENT` y despachando `b2b-proposal-sent`.
 */

import "server-only";
import { randomBytes } from "node:crypto";
import type { AdminRole } from "@lucams/db";
import { prisma } from "@/lib/db";
import { logger } from "@/lib/logger";
import { sendEmail } from "@/lib/resend";
import { getSettingValue } from "@/lib/cms";
import { hashBearerToken, verifyTokenHashTimingSafe } from "@/lib/token-hash";
import { getDirectPaymentConfig } from "@/lib/direct-payment-config";
import { DEPARTMENTS, getCityByCode } from "@/lib/dane-divipola";
import { formatDateCO } from "@/lib/datetime";
import { supabaseService } from "@/lib/supabase/service";
import { compressPreviewImage } from "@/features/personalization/sharp-safe";
import { getEffectiveShippingDims } from "@/features/products/shipping-schemas";
import { declaredValueCopPerInventoryUnit } from "@/features/personalization/design-units";
import { getShippingProvider } from "@/features/shipping/provider";
import {
  getCarrierRules,
  getDisabledCarriersNormalized,
  getLucamsShippingSettings,
  normalizeCarrierKey,
} from "@/features/shipping/settings";
import { computePackedPackage } from "@/features/shipping/aveonline";
import { LUCAMS_CARRIER, LUCAMS_CARRIER_NAME } from "@/features/shipping/lucams-shipping";
import { renderB2bProposalSentEmail } from "@/features/emails/registry";
import { computeProposalMarginSummary, piecesPerCommercialUnit } from "./configurator-math";
import { OpportunityValidationError } from "./service";
import type { SaveProposalDraftInput } from "./schemas";

export const B2B_MANUAL_CARRIER = "b2b-manual";
const PROOF_BUCKET = "design-previews";
const MAX_SINGLE_BOX_WEIGHT_KG = 25;

export interface B2bShippingQuoteOption {
  carrier: string;
  carrierName: string;
  fleteCents: number;
  deliveryDays: number;
}

export async function quoteB2bProposalShipping(input: {
  cityCode: string;
  departmentCode: string;
  items: ReadonlyArray<{
    variantId: string;
    qty: number;
    designUnits: number;
    unitPriceCents: number;
  }>;
}): Promise<{
  quotes: B2bShippingQuoteOption[];
  estimated: boolean;
  totalWeightKg: number;
  suggestedPackageCount: number;
}> {
  const dept = DEPARTMENTS.find((d) => d.code === input.departmentCode);
  const city = getCityByCode(input.cityCode);
  if (!dept || !city || city.deptCode !== dept.code) {
    throw new OpportunityValidationError("Selecciona un departamento y municipio DANE válidos.");
  }
  if (input.items.length === 0) {
    throw new OpportunityValidationError("Agrega al menos una línea para cotizar el envío.");
  }

  const variants = await prisma.productVariant.findMany({
    where: { id: { in: input.items.map((i) => i.variantId) }, deletedAt: null },
    select: {
      id: true,
      attributes: true,
      product: { select: { slug: true, physicalSpecs: true, productionDays: true } },
    },
  });
  const byId = new Map(variants.map((v) => [v.id, v]));

  const shipmentItems: Array<{
    productSlug: string;
    qty: number;
    weightGrams: number;
    widthCm: number;
    heightCm: number;
    depthCm: number;
    declaredValueCop: number;
  }> = [];

  for (const row of input.items) {
    const v = byId.get(row.variantId);
    if (!v) {
      throw new OpportunityValidationError("Una de las opciones seleccionadas ya no existe.");
    }
    const dims = getEffectiveShippingDims(v.product.physicalSpecs, v.attributes);
    if (!dims) {
      throw new OpportunityValidationError(
        `El producto ${v.product.slug} no tiene peso/dimensiones configurados para cotizar transporte.`,
      );
    }
    const packPieces = piecesPerCommercialUnit(v.attributes);
    const inventoryUnits = Math.max(1, row.qty) * Math.max(1, row.designUnits) * packPieces;
    shipmentItems.push({
      productSlug: v.product.slug,
      qty: inventoryUnits,
      weightGrams: dims.weightGrams,
      widthCm: dims.widthCm,
      heightCm: dims.heightCm,
      depthCm: dims.depthCm,
      declaredValueCop: declaredValueCopPerInventoryUnit({
        unitPriceCop: row.unitPriceCents,
        qty: row.qty * row.designUnits,
        inventoryUnits,
      }),
    });
  }

  const packed = computePackedPackage(shipmentItems);
  const suggestedPackageCount = Math.max(1, Math.ceil(packed.pesoKg / MAX_SINGLE_BOX_WEIGHT_KG));

  const [pickupCity, pickupDept, disabledCarriers, carrierRules, lucamsSettings, provider] =
    await Promise.all([
      getSettingValue("PICKUP_CITY", "Bogotá"),
      getSettingValue("PICKUP_DEPARTMENT", "Cundinamarca"),
      getDisabledCarriersNormalized(),
      getCarrierRules(),
      getLucamsShippingSettings(),
      getShippingProvider(),
    ]);

  const quotes: B2bShippingQuoteOption[] = [];
  if (lucamsSettings.enabled && (lucamsSettings.zones[city.code] ?? []).length > 0) {
    quotes.push({
      carrier: LUCAMS_CARRIER,
      carrierName: LUCAMS_CARRIER_NAME,
      fleteCents: lucamsSettings.priceCop,
      deliveryDays: 2,
    });
  }

  let estimated = false;
  try {
    const aveQuotes = await provider.quote({
      origin: { city: pickupCity, department: pickupDept },
      destination: { city: city.name, department: dept.name },
      contraentrega: false,
      items: shipmentItems,
    });
    for (const q of aveQuotes) {
      if (q.estimated) estimated = true;
      const carrierKey = normalizeCarrierKey(q.carrierName || q.carrier);
      if (disabledCarriers.includes(carrierKey)) continue;
      const rule = carrierRules[carrierKey];
      if (rule?.minWeightKg != null && packed.pesoKg < rule.minWeightKg) continue;
      if (rule?.maxWeightKg != null && packed.pesoKg > rule.maxWeightKg) continue;
      quotes.push({
        carrier: q.carrier,
        carrierName: q.carrierName,
        fleteCents: q.fleteCop,
        deliveryDays: q.deliveryDays,
      });
    }
  } catch (err) {
    logger.warn({
      event: "b2b.proposal.quote_shipping_degraded",
      city: city.name,
      err: err instanceof Error ? err.message : String(err),
    });
    if (quotes.length === 0) {
      throw new OpportunityValidationError(
        "Aveonline no respondió a tiempo. Intenta nuevamente o define una tarifa pactada.",
      );
    }
  }

  quotes.sort((a, b) => a.fleteCents - b.fleteCents);
  return {
    quotes,
    estimated,
    totalWeightKg: packed.pesoKg,
    suggestedPackageCount,
  };
}

export async function saveOpportunityProposalDraft(
  input: SaveProposalDraftInput,
  actor: { id: string; role: AdminRole },
) {
  const dept = DEPARTMENTS.find((d) => d.code === input.departmentCode);
  const city = getCityByCode(input.cityCode);
  if (!dept || !city || city.deptCode !== dept.code) {
    throw new OpportunityValidationError("Selecciona un departamento y municipio destino válidos.");
  }

  if (input.allowDirectTransfer && !getDirectPaymentConfig().enabled) {
    throw new OpportunityValidationError(
      "No puedes activar Pago Directo (Bre-B / Transferencia) porque aún no están configuradas las variables privadas en el servidor.",
    );
  }

  if (input.shippingMode === "QUOTED" && !input.shippingCarrier.trim()) {
    throw new OpportunityValidationError(
      "Elige la transportadora cotizada o cambia el envío a tarifa pactada / despacho asistido.",
    );
  }

  const opp = await prisma.opportunity.findFirst({
    where: { id: input.opportunityId, deletedAt: null },
    select: { id: true, number: true, stage: true },
  });
  if (!opp) {
    throw new OpportunityValidationError("La oportunidad no existe o fue archivada.");
  }
  if (opp.stage === "LOST") {
    throw new OpportunityValidationError(
      "Esta oportunidad figura como perdida. Cámbiala a En calificación antes de crear propuestas.",
    );
  }

  const variants = await prisma.productVariant.findMany({
    where: {
      id: { in: input.items.map((it) => it.variantId) },
      deletedAt: null,
      isActive: true,
      product: { deletedAt: null, isActive: true },
    },
    select: {
      id: true,
      name: true,
      sku: true,
      product: { select: { id: true, name: true, cost: true } },
    },
  });
  const variantById = new Map(variants.map((v) => [v.id, v]));

  const resolvedItems = input.items.map((it, idx) => {
    const v = variantById.get(it.variantId);
    if (!v) {
      throw new OpportunityValidationError(
        `La opción de la línea #${idx + 1} está inactiva o ya no existe.`,
      );
    }
    return {
      variantId: v.id,
      titleSnapshot: `${v.product.name} · ${v.name}`,
      skuSnapshot: v.sku,
      qty: it.qty,
      designUnits: it.designUnits,
      unitPriceCents: it.unitPricePesos * 100,
      unitCostSnapshotCents: v.product.cost,
      packagingNote: it.packagingNote?.trim() || null,
      designId: it.designId?.trim() || null,
      sortOrder: idx,
    };
  });

  const discountCents = input.discountPesos * 100;
  const shippingCents = input.shippingPesos * 100;
  const margin = computeProposalMarginSummary({
    items: resolvedItems.map((r) => ({
      sku: r.skuSnapshot,
      qty: r.qty,
      designUnits: r.designUnits,
      unitPriceCents: r.unitPriceCents,
      unitCostCents: r.unitCostSnapshotCents,
    })),
    discountCents,
    shippingCents,
  });

  if (margin.hasBelowCostLine) {
    if (actor.role !== "SUPERADMIN" || !input.allowBelowCostOverride) {
      throw new OpportunityValidationError(
        `El precio negociado queda por debajo del costo unitario (BOM) en: ${margin.belowCostSkus.join(", ")}. Ajusta el precio o autoriza explícitamente como SUPERADMIN.`,
      );
    }
  }

  // Vigencia hasta las 23:59:59 hora Colombia (`UTC-5`) del día elegido.
  const validUntil = new Date(`${input.validUntilDate}T23:59:59.999-05:00`);
  if (Number.isNaN(validUntil.getTime())) {
    throw new OpportunityValidationError("Fecha de vigencia inválida.");
  }

  const shippingCarrier =
    input.shippingMode === "QUOTED"
      ? input.shippingCarrier.trim()
      : input.shippingCarrier.trim() || B2B_MANUAL_CARRIER;

  return prisma.$transaction(async (tx) => {
    if (input.proposalId) {
      const existing = await tx.opportunityProposal.findFirst({
        where: { id: input.proposalId, opportunityId: opp.id },
        select: { id: true, status: true },
      });
      if (!existing) {
        throw new OpportunityValidationError("El borrador de propuesta no existe.");
      }
      if (existing.status !== "DRAFT") {
        throw new OpportunityValidationError(
          "Solo se pueden editar propuestas en estado Borrador. Crea una nueva versión.",
        );
      }

      await tx.opportunityProposalItem.deleteMany({ where: { proposalId: existing.id } });
      return tx.opportunityProposal.update({
        where: { id: existing.id },
        data: {
          validUntil,
          proofMode: input.proofMode,
          artworkMode: input.artworkMode,
          packagingType: input.packagingType,
          clientNotes: input.clientNotes?.trim() || null,
          termsNotes: input.termsNotes?.trim() || null,
          estimatedProductionDays: input.estimatedProductionDays,
          shippingMode: input.shippingMode,
          shippingCarrier,
          shippingService: input.shippingService?.trim() || null,
          packageCount: input.packageCount,
          departmentCode: dept.code,
          departmentName: dept.name,
          cityCode: city.code,
          cityName: city.name,
          subtotalCents: margin.subtotalCents,
          discountCents: margin.discountCents,
          shippingCents: margin.shippingCents,
          totalCents: margin.totalCents,
          allowDirectTransfer: input.allowDirectTransfer,
          items: { create: resolvedItems },
        },
        include: { items: { orderBy: { sortOrder: "asc" } } },
      });
    }

    const last = await tx.opportunityProposal.findFirst({
      where: { opportunityId: opp.id },
      orderBy: { version: "desc" },
      select: { version: true },
    });
    const nextVersion = (last?.version ?? 0) + 1;
    const cleanOppCode = opp.number.replace(/[^A-Z0-9]/gi, "").toUpperCase();
    const proposalNumber = `PROP-${cleanOppCode}-V${nextVersion}`;

    return tx.opportunityProposal.create({
      data: {
        opportunityId: opp.id,
        version: nextVersion,
        number: proposalNumber,
        status: "DRAFT",
        validUntil,
        proofMode: input.proofMode,
        artworkMode: input.artworkMode,
        packagingType: input.packagingType,
        clientNotes: input.clientNotes?.trim() || null,
        termsNotes: input.termsNotes?.trim() || null,
        estimatedProductionDays: input.estimatedProductionDays,
        shippingMode: input.shippingMode,
        shippingCarrier,
        shippingService: input.shippingService?.trim() || null,
        packageCount: input.packageCount,
        departmentCode: dept.code,
        departmentName: dept.name,
        cityCode: city.code,
        cityName: city.name,
        subtotalCents: margin.subtotalCents,
        discountCents: margin.discountCents,
        shippingCents: margin.shippingCents,
        totalCents: margin.totalCents,
        allowDirectTransfer: input.allowDirectTransfer,
        createdByAdminId: actor.id,
        items: { create: resolvedItems },
      },
      include: { items: { orderBy: { sortOrder: "asc" } } },
    });
  });
}

export async function uploadProposalProofImage(input: {
  proposalId: string;
  fileBuffer: Buffer;
}): Promise<{ proofAssetPath: string }> {
  const proposal = await prisma.opportunityProposal.findUnique({
    where: { id: input.proposalId },
    select: { id: true, status: true },
  });
  if (!proposal) {
    throw new OpportunityValidationError("La propuesta no existe.");
  }
  if (proposal.status !== "DRAFT" && proposal.status !== "SENT") {
    throw new OpportunityValidationError(
      "Solo puedes adjuntar muestra digital en propuestas en Borrador o Enviadas.",
    );
  }
  if (input.fileBuffer.length === 0 || input.fileBuffer.length > 8 * 1024 * 1024) {
    throw new OpportunityValidationError("La imagen de muestra debe pesar máximo 8 MB.");
  }

  let compressed: Awaited<ReturnType<typeof compressPreviewImage>>;
  try {
    compressed = await compressPreviewImage(input.fileBuffer);
  } catch {
    throw new OpportunityValidationError(
      "El archivo subido no es una imagen válida (usa PNG, JPG o WebP).",
    );
  }

  const storagePath = `b2b-proofs/${proposal.id}/proof.webp`;
  const { error } = await supabaseService.storage
    .from(PROOF_BUCKET)
    .upload(storagePath, compressed.buffer, {
      contentType: compressed.mime,
      upsert: true,
    });
  if (error) {
    logger.error({
      event: "b2b.proposal.proof_upload_failed",
      proposalId: proposal.id,
      err: error.message,
    });
    throw new OpportunityValidationError("No pudimos guardar la muestra digital en Storage.");
  }

  await prisma.opportunityProposal.update({
    where: { id: proposal.id },
    data: { proofAssetPath: storagePath },
  });

  return { proofAssetPath: storagePath };
}

export async function sendOpportunityProposal(input: {
  proposalId: string;
  actorAdminId: string;
  sendEmailToClient: boolean;
}): Promise<{
  proposalId: string;
  proposalNumber: string;
  opportunityId: string;
  contactId: string;
  plainToken: string;
  emailedTo: string | null;
}> {
  const proposal = await prisma.opportunityProposal.findUnique({
    where: { id: input.proposalId },
    include: {
      items: {
        orderBy: { sortOrder: "asc" },
        include: { variant: { select: { attributes: true } } },
      },
      opportunity: {
        include: {
          contact: { select: { id: true, displayName: true, primaryEmail: true } },
          organization: { select: { name: true } },
        },
      },
    },
  });

  if (!proposal || proposal.opportunity.deletedAt !== null) {
    throw new OpportunityValidationError("La propuesta no existe.");
  }
  if (proposal.status !== "DRAFT" && proposal.status !== "SENT") {
    throw new OpportunityValidationError(
      "Esta propuesta ya fue convertida, reemplazada o cancelada. Crea una nueva versión.",
    );
  }
  if (proposal.validUntil.getTime() <= Date.now()) {
    throw new OpportunityValidationError(
      "La fecha de vigencia ya venció. Extiéndela antes de emitir el enlace.",
    );
  }
  if (proposal.proofMode === "BEFORE_PAYMENT" && !proposal.proofAssetPath) {
    throw new OpportunityValidationError(
      "Adjunta primero la imagen de la muestra digital (o cambia el modo a «Aprobar muestra después del pago»).",
    );
  }

  const plainToken = randomBytes(32).toString("hex");
  const tokenHash = hashBearerToken(plainToken);
  const now = new Date();
  const totalPhysicalUnits = proposal.items.reduce(
    (acc, it) => acc + it.qty * it.designUnits * piecesPerCommercialUnit(it.variant.attributes),
    0,
  );

  await prisma.$transaction(async (tx) => {
    await tx.opportunityProposal.updateMany({
      where: {
        opportunityId: proposal.opportunityId,
        id: { not: proposal.id },
        status: "SENT",
      },
      data: {
        status: "SUPERSEDED",
        tokenHash: null,
      },
    });

    await tx.opportunityProposal.update({
      where: { id: proposal.id },
      data: {
        status: "SENT",
        tokenHash,
        sentAt: now,
      },
    });

    await tx.opportunity.update({
      where: { id: proposal.opportunityId },
      data: {
        stage: proposal.opportunity.stage === "WON" ? "WON" : "PROPOSAL_SENT",
        expectedAmountCop: proposal.totalCents,
        expectedUnits: totalPhysicalUnits,
      },
    });

    await tx.contactActivity.create({
      data: {
        contactId: proposal.opportunity.contact.id,
        authorAdminId: input.actorAdminId,
        kind: "SYSTEM",
        body: `Propuesta formal ${proposal.number} emitida por $${Math.round(proposal.totalCents / 100).toLocaleString("es-CO")} COP (vigente hasta ${formatDateCO(proposal.validUntil)}).`,
        metadata: {
          opportunityId: proposal.opportunityId,
          proposalId: proposal.id,
          proposalNumber: proposal.number,
          version: proposal.version,
          totalCents: proposal.totalCents,
        },
      },
    });
  });

  const recipientEmail =
    proposal.opportunity.contactEmail ?? proposal.opportunity.contact.primaryEmail ?? null;
  let emailedTo: string | null = null;

  if (input.sendEmailToClient && recipientEmail) {
    try {
      const contactName =
        proposal.opportunity.contactName ?? proposal.opportunity.contact.displayName ?? "Cliente";
      const tpl = await renderB2bProposalSentEmail({
        proposalNumber: proposal.number,
        opportunityNumber: proposal.opportunity.number,
        version: proposal.version,
        contactName,
        organizationName: proposal.opportunity.organization?.name ?? null,
        totalCents: proposal.totalCents,
        validUntilLabel: formatDateCO(proposal.validUntil),
        city: proposal.cityName ?? proposal.opportunity.city ?? "Colombia",
        department: proposal.departmentName ?? proposal.opportunity.department ?? null,
        proposalToken: plainToken,
        proofIncludedLabel:
          proposal.proofMode === "BEFORE_PAYMENT"
            ? "Adjunta en el enlace para aprobación previa al pago"
            : "Se validará contigo después de confirmar tu pedido",
        items: proposal.items.map((it) => ({
          title: it.titleSnapshot,
          qty: it.qty * it.designUnits,
          unitPriceCents: it.unitPriceCents,
          lineTotalCents: it.unitPriceCents * it.qty * it.designUnits,
        })),
        clientNotes: proposal.clientNotes,
      });

      const sent = await sendEmail({
        to: recipientEmail,
        subject: tpl.subject,
        html: tpl.html,
        text: tpl.text,
        idempotencyKey: `b2b-proposal-sent:${proposal.id}:${tokenHash.slice(0, 12)}`,
        tags: [
          { name: "type", value: "b2b_proposal_sent" },
          { name: "proposal_number", value: proposal.number },
        ],
      });
      if (sent.sent) emailedTo = recipientEmail;
    } catch (err) {
      logger.error({
        event: "b2b.proposal.email_failed",
        proposalId: proposal.id,
        err: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return {
    proposalId: proposal.id,
    proposalNumber: proposal.number,
    opportunityId: proposal.opportunityId,
    contactId: proposal.opportunity.contact.id,
    plainToken,
    emailedTo,
  };
}

export async function getPublicProposalByToken(rawToken: string) {
  const clean = rawToken.trim();
  if (!/^[a-f0-9]{64}$/i.test(clean)) return null;

  const tokenHash = hashBearerToken(clean);
  const proposal = await prisma.opportunityProposal.findUnique({
    where: { tokenHash },
    include: {
      items: {
        orderBy: { sortOrder: "asc" },
        include: {
          variant: {
            select: {
              attributes: true,
              product: { select: { images: true, warrantyMonths: true } },
            },
          },
        },
      },
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
      opportunity: {
        select: {
          id: true,
          number: true,
          eventType: true,
          contactName: true,
          contactEmail: true,
          contactWhatsapp: true,
          deletedAt: true,
          contact: {
            select: {
              displayName: true,
              primaryEmail: true,
              primaryPhoneE164: true,
            },
          },
          organization: {
            select: {
              name: true,
              taxIdType: true,
              taxIdNumber: true,
            },
          },
        },
      },
    },
  });

  if (!proposal || proposal.opportunity.deletedAt !== null) return null;
  if (!verifyTokenHashTimingSafe(clean, proposal.tokenHash)) return null;

  // Auto-expirar en lectura si venció sin orden activa.
  if (proposal.status === "SENT" && !proposal.order && proposal.validUntil.getTime() < Date.now()) {
    await prisma.opportunityProposal
      .updateMany({
        where: { id: proposal.id, status: "SENT" },
        data: { status: "EXPIRED" },
      })
      .catch(() => null);
    proposal.status = "EXPIRED";
  }

  const isExpired = proposal.status === "EXPIRED" || proposal.validUntil.getTime() < Date.now();

  // Jamás retornar costos BOM internos a una ruta pública.
  return {
    id: proposal.id,
    number: proposal.number,
    version: proposal.version,
    status: proposal.status,
    validUntil: proposal.validUntil,
    isExpired,
    proofMode: proposal.proofMode,
    hasProofAsset: Boolean(proposal.proofAssetPath),
    proofApprovedAt: proposal.proofApprovedAt,
    artworkMode: proposal.artworkMode,
    packagingType: proposal.packagingType,
    clientNotes: proposal.clientNotes,
    termsNotes: proposal.termsNotes,
    estimatedProductionDays: proposal.estimatedProductionDays,
    shippingMode: proposal.shippingMode,
    shippingCarrier: proposal.shippingCarrier,
    shippingService: proposal.shippingService,
    packageCount: proposal.packageCount,
    departmentCode: proposal.departmentCode,
    departmentName: proposal.departmentName,
    cityCode: proposal.cityCode,
    cityName: proposal.cityName,
    subtotalCents: proposal.subtotalCents,
    discountCents: proposal.discountCents,
    shippingCents: proposal.shippingCents,
    totalCents: proposal.totalCents,
    allowDirectTransfer: proposal.allowDirectTransfer,
    opportunity: {
      number: proposal.opportunity.number,
      eventType: proposal.opportunity.eventType,
      contactName:
        proposal.opportunity.contactName ?? proposal.opportunity.contact.displayName ?? "Cliente",
      contactEmail:
        proposal.opportunity.contactEmail ?? proposal.opportunity.contact.primaryEmail ?? "",
      contactPhone:
        proposal.opportunity.contactWhatsapp ?? proposal.opportunity.contact.primaryPhoneE164 ?? "",
      organizationName: proposal.opportunity.organization?.name ?? null,
      organizationNit: proposal.opportunity.organization?.taxIdNumber ?? null,
    },
    items: proposal.items.map((it) => ({
      id: it.id,
      titleSnapshot: it.titleSnapshot,
      skuSnapshot: it.skuSnapshot,
      qty: it.qty,
      designUnits: it.designUnits,
      piecesPerUnit: piecesPerCommercialUnit(it.variant.attributes),
      unitPriceCents: it.unitPriceCents,
      lineTotalCents: it.unitPriceCents * it.qty * it.designUnits,
      packagingNote: it.packagingNote,
      warrantyMonths: it.variant.product.warrantyMonths,
      imageUrl: it.variant.product.images[0] ?? null,
    })),
    order: proposal.order,
  };
}
