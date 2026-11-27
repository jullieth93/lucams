/*
 * Conversión transaccional de Propuesta B2B (`/propuesta/[token]`) a `Order` real
 * y flujo de Pago Directo Verificado (Bre-B / Transferencia con MFA) (`ADR-210`).
 */

import "server-only";
import { randomBytes } from "node:crypto";
import { Prisma } from "@lucams/db";
import { prisma } from "@/lib/db";
import { logger } from "@/lib/logger";
import { sendEmail } from "@/lib/resend";
import { getSettingValue } from "@/lib/cms";
import { hashBearerToken, verifyTokenHashTimingSafe } from "@/lib/token-hash";
import { getDirectPaymentConfig } from "@/lib/direct-payment-config";
import { supabaseService } from "@/lib/supabase/service";
import { compressPreviewImage } from "@/features/personalization/sharp-safe";
import { composeAddressLine, type AddressInput } from "@/features/checkout/schemas";
import { computeShippingAddressKey } from "@/features/checkout/address-key";
import { BILLING_DOCUMENT_ENABLED } from "@/features/checkout/billing-document";
import { getZone } from "@/lib/lucams-zones";
import { generateOrderNumber } from "@/features/orders/order-number";
import { resolveOrderCustomerId, emailsEqual } from "@/features/orders/order-customer";
import { resolveWompiPaymentReference } from "@/features/orders/payment-reference";
import { processPaidOrder } from "@/features/orders/saga";
import { getPaymentProvider } from "@/features/payments/provider";
import { notify } from "@/features/notifications/service";
import { renderB2bDirectPaymentReportedEmail } from "@/features/emails/registry";
import { hasStockForSale, netAvailableStock } from "@/features/products/fulfillment";
import {
  B2B_ARTWORK_MODE_LABELS,
  B2B_PACKAGING_TYPE_LABELS,
  DIRECT_PAYMENT_METHOD_LABELS,
  isB2bArtworkMode,
  isB2bPackagingType,
  type DirectPaymentMethodKind,
} from "./schemas";
import { piecesPerCommercialUnit } from "./configurator-math";
import { B2B_MANUAL_CARRIER } from "./proposals-service";
import { OpportunityValidationError } from "./service";

const RECEIPT_BUCKET = "customer-uploads";

function normalizeTenDigitPhone(raw: string): string {
  const digits = raw.replace(/\D/g, "");
  if (digits.startsWith("57") && digits.length === 12) return digits.slice(2);
  return digits.slice(-10) || "3000000000";
}

function isOrderNumberUniqueError(err: unknown): boolean {
  return (
    err instanceof Prisma.PrismaClientKnownRequestError &&
    err.code === "P2002" &&
    JSON.stringify(err.meta ?? {}).includes("number")
  );
}

export type ConvertProposalOutcome =
  | { kind: "redirect_wompi"; checkoutUrl: string; orderId: string; orderNumber: string }
  | { kind: "redirect_gracias"; redirectPath: string; orderId: string; orderNumber: string }
  | { kind: "awaiting_direct_transfer"; orderId: string; orderNumber: string };

export async function convertApprovedProposalToOrder(input: {
  rawToken: string;
  paymentChoice: "WOMPI" | "DIRECT_TRANSFER";
  recipientFullName: string;
  recipientPhone: string;
  address: AddressInput;
  acceptProof: boolean;
  acceptTermsAndHabeas: boolean;
  sessionCustomerId: string | null;
  sessionCustomerEmail: string | null;
  ip: string | null;
  userAgent: string | null;
  redirectBaseUrl: string;
}): Promise<ConvertProposalOutcome> {
  const cleanToken = input.rawToken.trim();
  if (!/^[a-f0-9]{64}$/i.test(cleanToken)) {
    throw new OpportunityValidationError("Enlace de propuesta inválido.");
  }
  if (!input.acceptTermsAndHabeas) {
    throw new OpportunityValidationError(
      "Debes aceptar los términos comerciales y el tratamiento de datos personales.",
    );
  }

  const tokenHash = hashBearerToken(cleanToken);
  const proposal = await prisma.opportunityProposal.findUnique({
    where: { tokenHash },
    include: {
      order: true,
      items: {
        orderBy: { sortOrder: "asc" },
        include: {
          design: { select: { id: true, moderationStatus: true, productionUrls: true } },
          variant: {
            select: {
              id: true,
              name: true,
              sku: true,
              stock: true,
              safetyStock: true,
              isActive: true,
              deletedAt: true,
              attributes: true,
              product: {
                select: {
                  id: true,
                  name: true,
                  isActive: true,
                  deletedAt: true,
                  fulfillmentMode: true,
                  warrantyMonths: true,
                },
              },
            },
          },
        },
      },
      opportunity: {
        include: {
          contact: { select: { id: true, displayName: true, primaryEmail: true } },
          organization: { select: { name: true, taxIdType: true, taxIdNumber: true } },
        },
      },
    },
  });

  if (
    !proposal ||
    proposal.opportunity.deletedAt !== null ||
    !verifyTokenHashTimingSafe(cleanToken, proposal.tokenHash)
  ) {
    throw new OpportunityValidationError(
      "Esta propuesta no existe o fue reemplazada por una nueva versión.",
    );
  }

  if (proposal.status === "SUPERSEDED" || proposal.status === "CANCELLED") {
    throw new OpportunityValidationError(
      "Esta versión de propuesta fue reemplazada. Solicita o revisa el enlace más reciente.",
    );
  }

  if (!proposal.order && proposal.validUntil.getTime() < Date.now()) {
    await prisma.opportunityProposal
      .updateMany({ where: { id: proposal.id, status: "SENT" }, data: { status: "EXPIRED" } })
      .catch(() => null);
    throw new OpportunityValidationError(
      "La vigencia de esta propuesta venció. Escríbenos para renovarla.",
    );
  }

  if (proposal.departmentCode && input.address.deptCode !== proposal.departmentCode) {
    throw new OpportunityValidationError(
      "El departamento de entrega debe coincidir con el destino cotizado en la propuesta.",
    );
  }
  if (proposal.cityCode && input.address.cityCode !== proposal.cityCode) {
    throw new OpportunityValidationError(
      "El municipio de entrega debe coincidir con la ciudad cotizada en la propuesta.",
    );
  }

  if (proposal.proofMode === "BEFORE_PAYMENT" && !proposal.proofApprovedAt && !input.acceptProof) {
    throw new OpportunityValidationError(
      "Debes confirmar la aprobación de la muestra digital antes de continuar al pago.",
    );
  }

  const directConfig = getDirectPaymentConfig();
  if (input.paymentChoice === "DIRECT_TRANSFER") {
    if (!proposal.allowDirectTransfer || !directConfig.enabled) {
      throw new OpportunityValidationError(
        "El pago directo no está habilitado para esta propuesta. Elige pago en línea con Wompi.",
      );
    }
  }

  // Validar disponibilidad de opciones físicas antes de abrir cobro (agregando por variantId
  // para coincidir con aggregateByVariant en decrementStockForOrder).
  const physicalTotals = new Map<
    string,
    {
      needed: number;
      available: number;
      stock: number;
      safetyStock: number;
      title: string;
    }
  >();
  for (const it of proposal.items) {
    const v = it.variant;
    if (
      !v.isActive ||
      v.deletedAt !== null ||
      !v.product.isActive ||
      v.product.deletedAt !== null
    ) {
      throw new OpportunityValidationError(
        `La referencia "${it.titleSnapshot}" ya no está activa. Escríbenos para actualizar tu propuesta.`,
      );
    }
    if (v.product.fulfillmentMode === "PHYSICAL_STOCK") {
      const neededPhysical = it.qty * it.designUnits * piecesPerCommercialUnit(v.attributes);
      const prev = physicalTotals.get(v.id);
      if (prev) {
        prev.needed += neededPhysical;
      } else {
        physicalTotals.set(v.id, {
          needed: neededPhysical,
          available: netAvailableStock(v.stock, v.safetyStock),
          stock: v.stock,
          safetyStock: v.safetyStock,
          title: it.titleSnapshot,
        });
      }
    }
  }
  for (const entry of physicalTotals.values()) {
    if (
      !hasStockForSale("PHYSICAL_STOCK", entry.stock, entry.safetyStock) ||
      entry.available < entry.needed
    ) {
      throw new OpportunityValidationError(
        `Stock insuficiente para "${entry.title}". Contáctanos para ajustar tu propuesta.`,
      );
    }
  }

  const buyerEmail = (
    proposal.opportunity.contactEmail ??
    proposal.opportunity.contact.primaryEmail ??
    ""
  )
    .trim()
    .toLowerCase();
  if (!buyerEmail) {
    throw new OpportunityValidationError(
      "La propuesta no tiene un correo electrónico de comprador asociado.",
    );
  }

  const buyerPhone = normalizeTenDigitPhone(input.recipientPhone);
  const addressLine1 = composeAddressLine(input.address);
  const zone = input.address.localityId
    ? getZone(input.address.cityCode, input.address.localityId)
    : null;

  const shippingSnapshot = {
    fullName: input.recipientFullName,
    email: buyerEmail,
    phone: buyerPhone,
    city: input.address.city,
    department: input.address.department,
    addressLine1,
    zip: input.address.zip || undefined,
    localityId: zone?.id ?? input.address.localityId ?? undefined,
    localityName: zone?.name ?? undefined,
    neighborhood: input.address.neighborhood || undefined,
    notes: proposal.clientNotes ?? undefined,
  };
  const shippingAddressKey = computeShippingAddressKey(shippingSnapshot);
  const privacyVersion = await getSettingValue("PRIVACY_POLICY_VERSION", "v3 · 2026-11-05");
  const now = new Date();

  const resolvedCarrier =
    proposal.shippingMode === "QUOTED" && proposal.packageCount === 1 && proposal.shippingCarrier
      ? proposal.shippingCarrier
      : proposal.shippingCarrier === "lucams" && proposal.packageCount === 1
        ? "lucams"
        : B2B_MANUAL_CARRIER;

  const allItemsHaveReadyArtwork = proposal.items.every(
    (it) =>
      vNeedsNoArtwork(it.variant.product.fulfillmentMode, it.designId) ||
      Boolean(
        it.design &&
        it.design.moderationStatus === "APPROVED" &&
        it.design.productionUrls.length > 0,
      ),
  );

  // Si ya existe una Order asociada a esta propuesta:
  let activeOrder = proposal.order;
  if (activeOrder) {
    if (activeOrder.status !== "PENDING_PAYMENT") {
      return {
        kind: "redirect_gracias",
        redirectPath: `/propuesta/${encodeURIComponent(cleanToken)}`,
        orderId: activeOrder.id,
        orderNumber: activeOrder.number,
      };
    }
    // Permite cambiar entre WOMPI y DIRECT_TRANSFER o actualizar dirección mientras siga PENDING_PAYMENT y sin comprobante confirmado.
    activeOrder = await prisma.order.update({
      where: { id: activeOrder.id },
      data: {
        paymentMethod: input.paymentChoice,
        phone: buyerPhone,
        shippingAddress: shippingSnapshot as unknown as Prisma.InputJsonValue,
        shippingAddressKey,
        paymentExpiresAt: proposal.validUntil,
      },
    });
  } else {
    const artworkLabel = isB2bArtworkMode(proposal.artworkMode)
      ? B2B_ARTWORK_MODE_LABELS[proposal.artworkMode]
      : proposal.artworkMode;
    const packagingLabel = isB2bPackagingType(proposal.packagingType)
      ? B2B_PACKAGING_TYPE_LABELS[proposal.packagingType]
      : proposal.packagingType;

    // Vincular Customer SOLO si la sesión autenticada pertenece al mismo correo del comprador ([ID-01]).
    const eligibleSessionCustomerId =
      input.sessionCustomerId && emailsEqual(input.sessionCustomerEmail, buyerEmail)
        ? input.sessionCustomerId
        : null;

    for (let attempt = 1; attempt <= 8; attempt++) {
      try {
        activeOrder = await prisma.$transaction(async (tx) => {
          const existingInTx = await tx.order.findUnique({
            where: { b2bProposalId: proposal.id },
          });
          if (existingInTx) return existingInTx;

          const orderNumber = await generateOrderNumber(tx, now);
          const resolvedCustomerId = await resolveOrderCustomerId(
            tx,
            eligibleSessionCustomerId,
            buyerEmail,
          );
          const publicToken = randomBytes(16).toString("hex");
          const org = proposal.opportunity.organization;
          const wantsInvoice = Boolean(BILLING_DOCUMENT_ENABLED && org?.taxIdNumber);

          const createdOrder = await tx.order.create({
            data: {
              number: orderNumber,
              customerId: resolvedCustomerId,
              contactId: proposal.opportunity.contact.id,
              email: buyerEmail,
              phone: buyerPhone,
              shippingAddress: shippingSnapshot as unknown as Prisma.InputJsonValue,
              shippingAddressKey,
              subtotal: proposal.subtotalCents,
              discount: proposal.discountCents,
              shipping: proposal.shippingCents,
              tax: 0,
              total: proposal.totalCents,
              currency: "COP",
              status: "PENDING_PAYMENT",
              paymentMethod: input.paymentChoice,
              shippingCarrier: resolvedCarrier,
              contentRightsAcceptedAt: now,
              publicAccessTokenHash: hashBearerToken(publicToken),
              b2bProposalId: proposal.id,
              paymentExpiresAt: proposal.validUntil,
              b2bArtworkReady: allItemsHaveReadyArtwork,
              billingDocumentType: wantsInvoice ? "NIT" : null,
              billingDocumentNumber: wantsInvoice ? (org?.taxIdNumber ?? null) : null,
              billingName: wantsInvoice ? (org?.name ?? null) : null,
              dianStatus: wantsInvoice ? "PENDING" : "NOT_REQUIRED",
              utmSource: proposal.opportunity.utmSource,
              utmMedium: proposal.opportunity.utmMedium,
              utmCampaign: proposal.opportunity.utmCampaign,
              landingPath: `/propuesta/${proposal.number}`,
              notes: proposal.clientNotes,
              items: {
                create: proposal.items.map((it) => ({
                  variantId: it.variantId,
                  qty: it.qty,
                  designUnits: it.designUnits,
                  unitPrice: it.unitPriceCents,
                  // Paridad con Storefront (`createOrderFromCartTx`): OrderItem.titleSnapshot
                  // guarda el nombre del producto (las vistas renderizan variant.name aparte).
                  titleSnapshot: it.variant.product.name,
                  skuSnapshot: it.skuSnapshot ?? it.variant.sku,
                  warrantyMonths: it.variant.product.warrantyMonths,
                  designId: it.designId,
                  metadata: {
                    b2bProposalNumber: proposal.number,
                    b2bArtworkLabel: artworkLabel,
                    b2bPackagingLabel: packagingLabel,
                    ...(it.packagingNote ? { b2bWorkshopNote: it.packagingNote } : {}),
                  },
                })),
              },
              statusEvents: {
                create: {
                  fromStatus: null,
                  toStatus: "PENDING_PAYMENT",
                  source: "system",
                  note: `Creado desde propuesta B2B ${proposal.number}`,
                },
              },
            },
          });

          await tx.opportunityProposal.update({
            where: { id: proposal.id },
            data: {
              status: "CONVERTED",
              approvedAt: now,
              ...(proposal.proofMode === "BEFORE_PAYMENT" && !proposal.proofApprovedAt
                ? { proofApprovedAt: now, proofApprovedByIp: input.ip }
                : {}),
            },
          });

          await tx.opportunity.update({
            where: { id: proposal.opportunityId },
            data: { convertedOrderId: createdOrder.id },
          });

          await tx.consent.create({
            data: {
              contactId: proposal.opportunity.contact.id,
              customerId: resolvedCustomerId,
              email: buyerEmail,
              scope: "HABEAS_DATA",
              accepted: true,
              version: privacyVersion,
              ipAddress: input.ip,
              userAgent: input.userAgent,
            },
          });

          return createdOrder;
        });
        break;
      } catch (err) {
        if (isOrderNumberUniqueError(err) && attempt < 8) {
          continue;
        }
        throw err;
      }
    }
  }

  if (!activeOrder) {
    throw new OpportunityValidationError("No pudimos generar tu pedido. Intenta nuevamente.");
  }

  if (input.paymentChoice === "DIRECT_TRANSFER") {
    return {
      kind: "awaiting_direct_transfer",
      orderId: activeOrder.id,
      orderNumber: activeOrder.number,
    };
  }

  const refRes = await resolveWompiPaymentReference(activeOrder.id);
  if (refRes.kind === "approved") {
    return {
      kind: "redirect_gracias",
      redirectPath: `/checkout/gracias?id=${encodeURIComponent(refRes.txId)}`,
      orderId: activeOrder.id,
      orderNumber: activeOrder.number,
    };
  }
  if (refRes.kind === "in_flight") {
    return {
      kind: "redirect_gracias",
      redirectPath: `/checkout/gracias?id=${encodeURIComponent(refRes.txId)}`,
      orderId: activeOrder.id,
      orderNumber: activeOrder.number,
    };
  }
  if (refRes.kind !== "ready") {
    throw new OpportunityValidationError(
      "No pudimos verificar el estado en Wompi en este momento. Intenta nuevamente en unos minutos.",
    );
  }

  const provider = getPaymentProvider();
  const orgNitDigits = proposal.opportunity.organization?.taxIdNumber?.replace(/\D/g, "") ?? "";
  const checkout = await provider.createCheckout({
    reference: refRes.reference,
    amountInCents: refRes.amountInCents,
    currency: "COP",
    customerEmail: buyerEmail,
    redirectUrl: `${input.redirectBaseUrl}/checkout/gracias`,
    customer: {
      fullName: input.recipientFullName,
      phone: buyerPhone,
      ...(orgNitDigits ? { legalId: orgNitDigits, legalIdType: "NIT" as const } : {}),
    },
  });

  return {
    kind: "redirect_wompi",
    checkoutUrl: checkout.checkoutUrl,
    orderId: activeOrder.id,
    orderNumber: activeOrder.number,
  };
}

function vNeedsNoArtwork(
  fulfillmentMode: "MADE_TO_ORDER" | "PHYSICAL_STOCK",
  designId: string | null,
): boolean {
  return fulfillmentMode === "PHYSICAL_STOCK" && designId === null;
}

export async function reportDirectTransferByClient(input: {
  rawToken: string;
  method: DirectPaymentMethodKind;
  reference: string;
  notes?: string;
  receiptBuffer?: Buffer | null;
}): Promise<{ orderNumber: string }> {
  const cleanToken = input.rawToken.trim();
  if (!/^[a-f0-9]{64}$/i.test(cleanToken)) {
    throw new OpportunityValidationError("Enlace de propuesta inválido.");
  }

  const tokenHash = hashBearerToken(cleanToken);
  const proposal = await prisma.opportunityProposal.findUnique({
    where: { tokenHash },
    include: {
      order: true,
      opportunity: {
        include: {
          contact: { select: { id: true, displayName: true, primaryEmail: true } },
          organization: { select: { name: true } },
        },
      },
    },
  });

  if (!proposal || !proposal.order || !verifyTokenHashTimingSafe(cleanToken, proposal.tokenHash)) {
    throw new OpportunityValidationError(
      "No encontramos un pedido pendiente asociado a esta propuesta.",
    );
  }

  if (proposal.order.status !== "PENDING_PAYMENT") {
    throw new OpportunityValidationError("Este pedido ya fue procesado.");
  }
  if (!proposal.allowDirectTransfer || proposal.order.paymentMethod !== "DIRECT_TRANSFER") {
    throw new OpportunityValidationError(
      "Este pedido no tiene habilitado el reporte de pago directo.",
    );
  }

  let receiptPath: string | null = proposal.order.directPaymentReceiptPath;
  if (input.receiptBuffer && input.receiptBuffer.length > 0) {
    if (input.receiptBuffer.length > 5 * 1024 * 1024) {
      throw new OpportunityValidationError("El comprobante adjunto no puede superar 5 MB.");
    }
    let compressed: Awaited<ReturnType<typeof compressPreviewImage>>;
    try {
      compressed = await compressPreviewImage(input.receiptBuffer);
    } catch {
      throw new OpportunityValidationError(
        "El comprobante debe ser una imagen válida (PNG, JPG o WebP).",
      );
    }
    const targetPath = `b2b-receipts/${proposal.order.id}/receipt.webp`;
    const { error } = await supabaseService.storage
      .from(RECEIPT_BUCKET)
      .upload(targetPath, compressed.buffer, {
        contentType: compressed.mime,
        upsert: true,
      });
    if (error) {
      logger.error({
        event: "b2b.direct_payment.receipt_upload_failed",
        orderId: proposal.order.id,
        err: error.message,
      });
      throw new OpportunityValidationError("No pudimos adjuntar la imagen del comprobante.");
    }
    receiptPath = targetPath;
  }

  const cleanRef = input.reference.trim();
  const cleanNotes = input.notes?.trim() || null;
  const now = new Date();

  await prisma.order.update({
    where: { id: proposal.order.id },
    data: {
      directPaymentMethod: input.method,
      directPaymentReference: cleanRef,
      directPaymentReceiptPath: receiptPath,
      directPaymentReportedAt: now,
      directPaymentNotes: cleanNotes,
    },
  });

  const contactName =
    proposal.opportunity.contactName ?? proposal.opportunity.contact.displayName ?? "Cliente B2B";
  const contactEmail =
    proposal.opportunity.contactEmail ??
    proposal.opportunity.contact.primaryEmail ??
    proposal.order.email;
  const methodLabel = DIRECT_PAYMENT_METHOD_LABELS[input.method];

  await notify({
    type: "ORDER",
    severity: "warning",
    title: `Pago directo por verificar: ${proposal.order.number}`,
    detail: `${contactName} reportó ${methodLabel} (Ref: ${cleanRef}). Confirma el abono real en banco con MFA.`,
    actionUrl: `/admin/pedidos/${proposal.order.number}`,
    actionLabel: "Confirmar pago",
    dedupKey: `direct-payment-reported:${proposal.order.id}:${cleanRef}`,
  }).catch(() => null);

  try {
    const alertEmail = await getSettingValue("ALERT_EMAIL", "hola@lucamsshop.com");
    const tpl = await renderB2bDirectPaymentReportedEmail({
      orderNumber: proposal.order.number,
      proposalNumber: proposal.number,
      contactName,
      contactEmail,
      organizationName: proposal.opportunity.organization?.name ?? null,
      methodLabel,
      reference: cleanRef,
      totalCents: proposal.order.total,
      notes: cleanNotes,
    });
    await sendEmail({
      to: alertEmail,
      subject: tpl.subject,
      html: tpl.html,
      text: tpl.text,
      replyTo: tpl.replyTo,
      idempotencyKey: `b2b-direct-reported:${proposal.order.id}:${cleanRef}`,
      tags: [
        { name: "type", value: "b2b_direct_payment_reported" },
        { name: "order_number", value: proposal.order.number },
      ],
    });
  } catch (err) {
    logger.warn({
      event: "b2b.direct_payment.alert_email_failed",
      orderId: proposal.order.id,
      err: err instanceof Error ? err.message : String(err),
    });
  }

  return { orderNumber: proposal.order.number };
}

export async function confirmDirectTransferByAdmin(input: {
  orderId: string;
  actorAdminId: string;
  receivedCashCents: number;
  withholdingCents: number;
  referenceOverride?: string;
  notes?: string;
}): Promise<{ orderNumber: string; targetEmail: string; sagaStatus: string }> {
  const order = await prisma.order.findFirst({
    where: { id: input.orderId, deletedAt: null },
    select: {
      id: true,
      number: true,
      email: true,
      total: true,
      status: true,
      paymentMethod: true,
      directPaymentReference: true,
    },
  });
  if (!order) {
    throw new OpportunityValidationError("Pedido no encontrado.");
  }
  if (order.paymentMethod !== "DIRECT_TRANSFER") {
    throw new OpportunityValidationError(
      "Solo los pedidos de Pago Directo (Bre-B / Transferencia) admiten esta confirmación.",
    );
  }
  if (order.status !== "PENDING_PAYMENT") {
    throw new OpportunityValidationError(
      `El pedido ${order.number} ya no está pendiente de pago (estado actual: ${order.status}).`,
    );
  }
  if (input.receivedCashCents < 0 || input.withholdingCents < 0) {
    throw new OpportunityValidationError("Los importes deben ser mayores o iguales a $0.");
  }
  if (input.receivedCashCents + input.withholdingCents !== order.total) {
    throw new OpportunityValidationError(
      "La suma del efectivo recibido en banco más las retenciones practicadas debe cuadrar exactamente con el total del pedido.",
    );
  }

  const finalRef = input.referenceOverride?.trim() || order.directPaymentReference;
  if (!finalRef || finalRef.length < 4) {
    throw new OpportunityValidationError(
      "Registra el número de referencia o comprobante bancario verificado.",
    );
  }

  await prisma.order.update({
    where: { id: order.id },
    data: {
      withholdingCents: input.withholdingCents,
      directPaymentReference: finalRef,
      directPaymentConfirmedAt: new Date(),
      directPaymentConfirmedBy: input.actorAdminId,
      directPaymentNotes: input.notes?.trim() || null,
    },
  });

  const saga = await processPaidOrder({ orderId: order.id });
  if (saga.status === "transition_failed") {
    throw new OpportunityValidationError(
      saga.reason ?? "No se pudo completar la confirmación del pedido.",
    );
  }

  return {
    orderNumber: order.number,
    targetEmail: order.email,
    sagaStatus: saga.status,
  };
}
