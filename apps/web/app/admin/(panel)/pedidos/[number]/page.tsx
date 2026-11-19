/*
 * Admin > Pedidos > [number] — Ficha operativa y comercial 360° de un pedido (Bloque 5).
 *
 * Incluye:
 *   - Stepper visual ejecutivo del ciclo de vida del pedido
 *   - Ítems con especificaciones físicas, galería 300 DPI y barra de progreso de RenderJob
 *   - Redacción server-side y visual de PII y montos COP según capacidades reales del rol
 *   - Ecosistema 360° vinculado (Contacto 360, Moderación, Soporte, Garantías, Retractos,
 *     Cupones, Conciliación COD y Oportunidades B2B) filtrado con canAccessAdminPath
 *   - Acciones segregadas por etapa (Taller vs Despachos vs Operaciones vs Administradora)
 *
 * Acepta /admin/pedidos/<id> Y /admin/pedidos/<number> (LCM-2026-0001).
 */

import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import { notFound } from "next/navigation";
import {
  Box,
  User,
  MapPin,
  CreditCard,
  Truck,
  Package,
  Undo2,
  History,
  ShieldCheck,
  Check,
  Network,
  ArrowUpRight,
  Ban,
} from "lucide-react";
import { WhatsAppIcon } from "@/components/icons/brand";
import { AdminPage, AdminPageHeader, AdminPageBody, AdminBadge } from "@/components/admin-page";
import { Hint } from "@/components/ui/tooltip";
import {
  ADMIN_ROLE_SETS,
  canAccessAdminPath,
  canManageOrderRenderJobs,
  canRetryOrderShipment,
  canSeeOrderCodCollectionAmount,
  canSeeOrderCommercialBreakdown,
  canTransitionOrderTo,
  hasCapability,
} from "@/lib/admin-rbac";
import { requireRole } from "@/lib/admin-rbac-guard";
import { prisma } from "@/lib/db";
import { getOrderComplementaryContextForActor, getOrderForActor } from "@/features/orders/service";
import { getProductionAssetSignedUrls, refreshCustomerUploadSignedUrl } from "@/lib/storage";
import { LUCAMS_CARRIER, carrierDisplayName } from "@/features/shipping/lucams-shipping";
import {
  parseShipmentLastError,
  suggestShipmentFailureCause,
  type ShipmentLastError,
} from "@/features/orders/shipment-error";
import {
  formatLucamsDeliveryEstimate,
  lucamsDeliveryDays,
  maxProductionDaysOf,
} from "@/lib/delivery-estimate";
import { getLucamsShippingSettings } from "@/features/shipping/settings";
import { formatCOP } from "@/lib/format";
import {
  describeVariantAttributes,
  parseVariantAttributes,
} from "@/features/products/variant-schemas";
import { customerWaLink } from "@/lib/wa";
import { CrmWorkspacePanel } from "@/components/admin/crm-workspace-panel";
import {
  listActivitiesForEntity,
  listAssignableCrmAdmins,
  listTasksForEntity,
} from "@/features/crm/service";
import { OrderActions } from "./order-actions";
import { B2bWorkshopMastersPanel, DirectPaymentVerificationPanel } from "./b2b-order-panels";
import { RegenLettersetButton } from "./regen-letterset-button";
import { RetryRenderJobButton } from "./retry-render-job-button";
import { ProductionPiecesGallery } from "./production-pieces-gallery";
import { previewRefToAuthorizedUrl } from "@/features/personalization/preview-artifacts";
import {
  resolveProductionSpec,
  productionPieceGroups,
  type ProductionSpec,
} from "@/features/personalization/production-spec";
import { formatDateTimeCO } from "@/lib/datetime";
import { listShipmentEvents } from "@/features/shipping/shipment-events";
import { maskEmail, maskOrderOperationalTextForActor } from "@/lib/pii-mask";

export const metadata: Metadata = { title: "Detalle de pedido" };

// Esta ruta aloja la server action de reintento de guía (order-actions →
// processPaidOrder → createShipment 20s no-idempotente + auth cold). Ver ADR-049.
export const maxDuration = 60;

const STATUS_LABEL: Record<string, string> = {
  PENDING_PAYMENT: "Esperando pago",
  PAID: "Pagado",
  FULFILLING: "En preparación",
  SHIPPED: "Enviado",
  DELIVERED: "Entregado",
  CANCELLED: "Cancelado",
  REFUNDED: "Reembolsado",
  DRAFT: "Borrador",
};

const STATUS_TONE: Record<string, "emerald" | "amber" | "purple" | "rose" | "slate" | "turquoise"> =
  {
    PENDING_PAYMENT: "amber",
    PAID: "purple",
    FULFILLING: "turquoise",
    SHIPPED: "purple",
    DELIVERED: "emerald",
    CANCELLED: "rose",
    REFUNDED: "rose",
    DRAFT: "slate",
  };

const SOURCE_LABEL: Record<string, string> = {
  admin: "Equipo admin",
  webhook: "Webhook",
  cron: "Automático",
  system: "Sistema",
};

const PAYMENT_METHOD_LABEL: Record<string, string> = {
  WOMPI: "Pago en línea (Wompi)",
  COD: "Contraentrega (efectivo)",
  DIRECT_TRANSFER: "Pago directo (Bre-B / Transferencia)",
};

const WOMPI_STATUS_LABEL: Record<string, string> = {
  OPEN: "Abierto",
  IN_FLIGHT: "En curso",
  APPROVED: "Aprobado",
  DECLINED: "Rechazado",
  VOIDED: "Anulado",
  ERROR: "Con error",
  EXPIRED: "Expirado",
  PENDING: "Pendiente",
};

const TICKET_STATUS_LABEL: Record<string, string> = {
  OPEN: "Abierto",
  IN_PROGRESS: "En gestión",
  CLOSED: "Cerrado",
};

const COD_RECON_LABEL: Record<
  string,
  {
    label: string;
    filter: "pending" | "remitted" | "discrepancy";
    tone: "amber" | "emerald" | "rose";
  }
> = {
  PENDING_REMIT: { label: "Por remitir", filter: "pending", tone: "amber" },
  REMITTED: { label: "Remitido", filter: "remitted", tone: "emerald" },
  DISCREPANCY: { label: "Discrepancia", filter: "discrepancy", tone: "rose" },
};

type ShippingAddrSnapshot = {
  fullName?: string;
  email?: string;
  phone?: string;
  documentType?: string;
  documentNumber?: string;
  city?: string;
  department?: string;
  addressLine1?: string;
  addressLine2?: string;
  zip?: string;
  localityName?: string;
  neighborhood?: string;
  notes?: string;
};

function jsonRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function productionPieceLabel(index: number, spec: ProductionSpec): string {
  const base = `Pieza ${String(index + 1).padStart(2, "0")}`;
  if (spec.formatoFisico.tipo === "inserto-circular") {
    const unit = spec.formatoFisico.caras === 2 ? Math.floor(index / 2) + 1 : index + 1;
    const face = spec.formatoFisico.caras === 2 && index % 2 === 1 ? "B (reverso)" : "A (frente)";
    return `Inserto ${String(unit).padStart(2, "0")} · cara ${face}`;
  }
  if (spec.formatoFisico.tipo === "tira-desplegada" && spec.formatoFisico.plana) {
    return spec.reversosConMarcaAgua.includes(index + 1)
      ? `${base} · frente A + reverso B con marca de agua Lucams`
      : `${base} · frente A + reverso B`;
  }
  return base;
}

type AdminRole = Parameters<typeof getOrderForActor>[1];
type AdminOrder = NonNullable<Awaited<ReturnType<typeof getOrderForActor>>>;
type AdminOrderItem = AdminOrder["items"][number];
type AdminComplementaryContext = Awaited<ReturnType<typeof getOrderComplementaryContextForActor>>;
type AdminCrmTask = Awaited<ReturnType<typeof listTasksForEntity>>[number];
type AdminAssignableStaff = Awaited<ReturnType<typeof listAssignableCrmAdmins>>[number];
type AdminShipmentEventRow = {
  id: string;
  status: string;
  carrierStatusRaw: string;
  description: string | null;
  occurredAt: Date;
};
type AdminStatusEventRow = {
  id: string;
  fromStatus: string | null;
  toStatus: string;
  source: string;
  note: string | null;
  createdAt: Date;
};
type EcosystemLinkItem = {
  key: string;
  label: string;
  detail: string;
  href: string;
  tone: "purple" | "amber" | "emerald" | "rose" | "turquoise" | "slate";
};

function resolveAdminOrderCapabilities(role: AdminRole, encodedOrderNum: string) {
  const canReadPii = hasCapability(role, "orders:read_pii");
  const canRead360 = canAccessAdminPath(role, "/admin/clientes");
  return {
    canReadPii,
    canRead360,
    canSeeMoney: canSeeOrderCommercialBreakdown(role),
    canSeeCodTotal: canSeeOrderCodCollectionAmount(role),
    canDownloadProduction: canAccessAdminPath(role, `/admin/pedidos/${encodedOrderNum}/produccion`),
    canManageRenders: canManageOrderRenderJobs(role),
    canModerate: canAccessAdminPath(role, "/admin/moderacion"),
    canPrepare: canTransitionOrderTo(role, "FULFILLING"),
    canDispatch: canTransitionOrderTo(role, "SHIPPED"),
    canCancelRole: canTransitionOrderTo(role, "CANCELLED"),
    canReconcile: hasCapability(role, "orders:reconcile"),
    canBlockAddress: hasCapability(role, "finance:reconcile_cod"),
    canRefund: role === "SUPERADMIN",
    canPrintGuide: canAccessAdminPath(role, `/admin/pedidos/${encodedOrderNum}/guia`),
    canManageTasks: hasCapability(role, "crm:manage_tasks"),
    canManageActivities: hasCapability(role, "crm:manage_activities"),
    canViewActivities: canRead360 && canReadPii,
    canViewCatalog: canAccessAdminPath(role, "/admin/productos"),
    canConfirmDirectPayment: hasCapability(role, "finance:confirm_direct_payment"),
    canReadStaffIdentity:
      hasCapability(role, "staff:manage") || hasCapability(role, "contacts:read_pii"),
  };
}

type AdminOrderCapabilities = ReturnType<typeof resolveAdminOrderCapabilities>;

function maskStaffEmailIfNeeded(
  email: string | null,
  canReadStaffIdentity: boolean,
): string | null {
  if (!email || canReadStaffIdentity) return email;
  return maskEmail(email);
}

function maskOptionalOperationalText(text: string | null, role: AdminRole): string | null {
  return text === null ? null : maskOrderOperationalTextForActor(text, role);
}

async function checkOrderBuyerIsStaff(contactId: string | null): Promise<boolean> {
  if (!contactId) return false;
  const rows = await prisma.$queryRaw<Array<{ staff: boolean }>>`
    SELECT (c."isStaff" OR EXISTS (
      SELECT 1
      FROM "AdminUser" au
      WHERE au."isActive" = TRUE
        AND au."deletedAt" IS NULL
        AND LOWER(au."email") = LOWER(COALESCE(c."primaryEmail", ''))
    )) AS staff
    FROM "Contact" c
    WHERE c."id" = ${contactId} AND c."deletedAt" IS NULL
  `;
  return rows[0]?.staff ?? false;
}

async function loadAdminOrderSupportingData(
  order: AdminOrder,
  role: AdminRole,
  caps: AdminOrderCapabilities,
) {
  const shouldLoadActivities = Boolean(caps.canViewActivities && order.contactId);
  const shouldSignReceipt = Boolean(caps.canSeeMoney && order.directPaymentReceiptPath);
  const [
    rawCrmTasks,
    crmActivities,
    rawAssignableAdmins,
    rawStatusEvents,
    complementary,
    rawShipmentEvents,
    orderBuyerIsStaff,
    directReceiptSignedUrl,
  ] = await Promise.all([
    listTasksForEntity({ orderId: order.id }),
    shouldLoadActivities ? listActivitiesForEntity({ orderId: order.id }) : Promise.resolve([]),
    caps.canManageTasks ? listAssignableCrmAdmins() : Promise.resolve([]),
    prisma.orderStatusEvent.findMany({
      where: { orderId: order.id },
      orderBy: { createdAt: "asc" },
    }),
    getOrderComplementaryContextForActor(order.id, order.number, order.paymentMethod, role),
    order.trackingNumber ? listShipmentEvents(order.id) : Promise.resolve([]),
    checkOrderBuyerIsStaff(order.contactId),
    shouldSignReceipt && order.directPaymentReceiptPath
      ? refreshCustomerUploadSignedUrl(order.directPaymentReceiptPath).catch(() => null)
      : Promise.resolve(null),
  ]);

  const crmTasks: AdminCrmTask[] = rawCrmTasks.map((task) => ({
    ...task,
    title: maskOrderOperationalTextForActor(task.title, role),
    description: maskOptionalOperationalText(task.description, role),
    ownerAdminEmail: maskStaffEmailIfNeeded(task.ownerAdminEmail, caps.canReadStaffIdentity),
    createdByAdminEmail: maskStaffEmailIfNeeded(
      task.createdByAdminEmail,
      caps.canReadStaffIdentity,
    ),
  }));

  const assignableAdmins: AdminAssignableStaff[] = rawAssignableAdmins.map((admin) => ({
    ...admin,
    email: caps.canReadStaffIdentity ? admin.email : maskEmail(admin.email),
  }));

  const statusEvents: AdminStatusEventRow[] = rawStatusEvents.map((ev) => ({
    id: ev.id,
    fromStatus: ev.fromStatus,
    toStatus: ev.toStatus,
    source: ev.source,
    note: maskOptionalOperationalText(ev.note, role),
    createdAt: ev.createdAt,
  }));

  const shipmentEvents: AdminShipmentEventRow[] = rawShipmentEvents.map((ev) => ({
    id: ev.id,
    status: ev.status,
    carrierStatusRaw: ev.carrierStatusRaw,
    description: maskOptionalOperationalText(ev.description, role),
    occurredAt: ev.occurredAt,
  }));

  return {
    crmTasks,
    crmActivities,
    assignableAdmins,
    statusEvents,
    shipmentEvents,
    complementary,
    orderBuyerIsStaff,
    directReceiptSignedUrl,
  };
}

type AdminOrderSupportingData = Awaited<ReturnType<typeof loadAdminOrderSupportingData>>;

function buildB2bWorkshopLines(order: AdminOrder) {
  if (!order.b2bProposalId) return [];
  return order.items
    .filter((it) => it.variant.product.fulfillmentMode !== "PHYSICAL_STOCK" || Boolean(it.design))
    .map((it) => ({
      orderItemId: it.id,
      title: `${it.variant.product.name} · ${it.variant.name}`,
      sku: it.variant.sku,
      qty: it.qty,
      designUnits: it.designUnits,
      productionCount: it.design?.productionUrls?.length ?? 0,
      moderationStatus: it.design?.moderationStatus ?? null,
    }));
}

function summarizeProductionApproval(items: AdminOrderItem[]) {
  const productionPaths = items.flatMap((it) => it.design?.productionUrls ?? []);
  let approvedPieceCount = 0;
  let unapprovedPieceCount = 0;
  for (const it of items) {
    const pieceCount = it.design?.productionUrls?.length ?? 0;
    if (pieceCount === 0) continue;
    if (it.design?.moderationStatus === "APPROVED") approvedPieceCount += pieceCount;
    else unapprovedPieceCount += pieceCount;
  }
  return {
    productionPaths,
    hasProduction: productionPaths.length > 0,
    approvedPieceCount,
    unapprovedPieceCount,
    hasUnapproved: unapprovedPieceCount > 0,
  };
}

function resolveDeliveryNote(
  orderNotes: string | null | undefined,
  shipNotes: string | undefined,
): string | null {
  const fromOrder = orderNotes?.trim();
  if (fromOrder) return fromOrder;
  const fromShip = shipNotes?.trim();
  if (fromShip) return fromShip;
  return null;
}

async function resolveInternalDeliveryEstimate(
  order: AdminOrder,
  isInternalDelivery: boolean,
): Promise<string | null> {
  if (!isInternalDelivery) return null;
  const lucamsSettings = await getLucamsShippingSettings();
  const promiseDays = lucamsDeliveryDays({
    maxProductionDays: maxProductionDaysOf(
      order.items.map((it) => it.variant.product.productionDays),
    ),
    cutoffHour: lucamsSettings.cutoffHour,
    now: order.createdAt,
  });
  return formatLucamsDeliveryEstimate(promiseDays);
}

function resolveContactProfileHref(
  order: AdminOrder,
  canRead360: boolean,
  canReadPii: boolean,
): string | null {
  if (!canRead360) return null;
  if (order.contactId) return `/admin/clientes/${encodeURIComponent(order.contactId)}`;
  if (canReadPii && order.customer?.email) {
    return `/admin/clientes?q=${encodeURIComponent(order.customer.email)}`;
  }
  return null;
}

function buildModerationEcosystemLink(
  items: AdminOrderItem[],
  encodedOrderNum: string,
): EcosystemLinkItem | null {
  const customItems = items.filter((it) => Boolean(it.design));
  if (customItems.length === 0) return null;

  const pendingModCount = customItems.filter(
    (it) => it.design?.moderationStatus === "PENDING",
  ).length;
  const rejectedModCount = customItems.filter(
    (it) => it.design?.moderationStatus === "REJECTED",
  ).length;

  if (pendingModCount > 0) {
    return {
      key: "moderation",
      label: "Moderación de diseños",
      detail: `${pendingModCount} pendiente(s) de aprobar`,
      href: `/admin/moderacion?q=${encodedOrderNum}`,
      tone: "amber",
    };
  }
  if (rejectedModCount > 0) {
    return {
      key: "moderation",
      label: "Moderación de diseños",
      detail: `${rejectedModCount} rechazado(s)`,
      href: `/admin/moderacion?vista=historial&q=${encodedOrderNum}`,
      tone: "rose",
    };
  }
  return {
    key: "moderation",
    label: "Moderación de diseños",
    detail: `${customItems.length} aprobado(s)`,
    href: `/admin/moderacion?vista=historial&q=${encodedOrderNum}`,
    tone: "emerald",
  };
}

function buildCodEcosystemLinks(order: AdminOrder, role: AdminRole): EcosystemLinkItem[] {
  if (order.paymentMethod !== "COD") return [];
  const links: EcosystemLinkItem[] = [];

  if (canAccessAdminPath(role, "/admin/finanzas/conciliacion")) {
    const reconMeta = order.codReconciliation
      ? COD_RECON_LABEL[order.codReconciliation.status]
      : undefined;
    links.push({
      key: "cod-recon",
      label: "Conciliación contraentrega",
      detail: reconMeta ? reconMeta.label : "Sin remesa registrada aún",
      href: reconMeta
        ? `/admin/finanzas/conciliacion?filter=${reconMeta.filter}`
        : "/admin/finanzas/conciliacion",
      tone: reconMeta ? reconMeta.tone : "slate",
    });
  }

  if (canAccessAdminPath(role, "/admin/finanzas/bloqueos")) {
    links.push({
      key: "cod-blocks",
      label: "Bloqueos anti-abuso COD",
      detail: order.noShowAt ? "Marcado no recibido" : "Gestionar lista de vetos",
      href: "/admin/finanzas/bloqueos",
      tone: order.noShowAt ? "amber" : "slate",
    });
  }
  return links;
}

function resolveWarrantyTone(status: string): "emerald" | "slate" | "amber" {
  if (status === "RESOLVED") return "emerald";
  if (status === "REJECTED") return "slate";
  return "amber";
}

function resolveRetractTone(status: string): "emerald" | "slate" | "rose" {
  if (status === "REFUNDED") return "emerald";
  if (status === "REJECTED") return "slate";
  return "rose";
}

function buildOpportunityAndTicketEcosystemLinks(
  order: AdminOrder,
  role: AdminRole,
  complementary: AdminComplementaryContext,
): EcosystemLinkItem[] {
  const links: EcosystemLinkItem[] = [];

  for (const opp of order.convertedOpportunities ?? []) {
    const oppHref = `/admin/oportunidades/${encodeURIComponent(opp.id)}`;
    if (canAccessAdminPath(role, oppHref)) {
      links.push({
        key: `opp-${opp.id}`,
        label: `Oportunidad ${opp.number}`,
        detail: opp.title,
        href: oppHref,
        tone: "purple",
      });
    }
  }

  for (const tk of complementary.supportTickets) {
    const tkHref = `/admin/soporte/${encodeURIComponent(tk.id)}`;
    if (canAccessAdminPath(role, tkHref)) {
      links.push({
        key: `ticket-${tk.id}`,
        label: "Ticket de soporte",
        detail: `${TICKET_STATUS_LABEL[tk.status] ?? tk.status} · ${tk.subject}`,
        href: tkHref,
        tone: tk.status === "CLOSED" ? "slate" : "amber",
      });
    }
  }

  return links;
}

function buildClaimsEcosystemLinks(order: AdminOrder, role: AdminRole): EcosystemLinkItem[] {
  const links: EcosystemLinkItem[] = [];

  const warrantyClaims = order.items.flatMap((it) => it.warrantyClaims ?? []);
  const latestWarranty = warrantyClaims[0];
  if (latestWarranty && canAccessAdminPath(role, "/admin/garantias")) {
    links.push({
      key: "warranty",
      label: `Garantías (${warrantyClaims.length})`,
      detail: `Último estado: ${latestWarranty.status}`,
      href: `/admin/garantias?status=all&q=${encodeURIComponent(order.number)}`,
      tone: resolveWarrantyTone(latestWarranty.status),
    });
  }

  const retractRequests = order.items
    .map((it) => it.retractRequest)
    .filter((r): r is NonNullable<typeof r> => Boolean(r));
  const latestRetract = retractRequests[0];
  if (latestRetract && canAccessAdminPath(role, "/admin/retractos")) {
    links.push({
      key: "retract",
      label: `Retractos (${retractRequests.length})`,
      detail: `Estado: ${latestRetract.status}`,
      href: `/admin/retractos?status=all&q=${encodeURIComponent(order.number)}`,
      tone: resolveRetractTone(latestRetract.status),
    });
  }

  return links;
}

function buildOrderEcosystemLinks(params: {
  order: AdminOrder;
  role: AdminRole;
  caps: AdminOrderCapabilities;
  encodedOrderNum: string;
  contactProfileHref: string | null;
  orderBuyerIsStaff: boolean;
  complementary: AdminComplementaryContext;
}): EcosystemLinkItem[] {
  const { order, role, caps, encodedOrderNum, contactProfileHref, orderBuyerIsStaff } = params;
  const links: EcosystemLinkItem[] = [];

  if (contactProfileHref) {
    links.push({
      key: "contact-360",
      label: "Ficha Contacto 360",
      detail: orderBuyerIsStaff ? "Perfil interno del equipo" : "Historial unificado del cliente",
      href: contactProfileHref,
      tone: "purple",
    });
  }

  if (caps.canModerate) {
    const modLink = buildModerationEcosystemLink(order.items, encodedOrderNum);
    if (modLink) links.push(modLink);
  }

  if (
    caps.canSeeMoney &&
    order.coupon &&
    canAccessAdminPath(role, `/admin/cupones/${order.coupon.id}`)
  ) {
    links.push({
      key: "coupon",
      label: `Cupón ${order.coupon.code}`,
      detail: order.discount > 0 ? `Descuento ${formatCOP(order.discount)}` : "Cupón aplicado",
      href: `/admin/cupones/${encodeURIComponent(order.coupon.id)}`,
      tone: "turquoise",
    });
  }

  links.push(
    ...buildCodEcosystemLinks(order, role),
    ...buildOpportunityAndTicketEcosystemLinks(order, role, params.complementary),
    ...buildClaimsEcosystemLinks(order, role),
  );
  return links;
}

function canActorRetryOrderShipment(
  order: AdminOrder,
  role: AdminRole,
  isInternalDelivery: boolean,
): boolean {
  if (!canRetryOrderShipment(role) || isInternalDelivery) return false;
  if (order.status === "PAID") return true;
  return order.status === "FULFILLING" && !order.trackingNumber;
}

function resolveAdminOrderStatusLabel(status: string, isInternalDelivery: boolean): string {
  if (isInternalDelivery && status === "SHIPPED") return "En ruta";
  return STATUS_LABEL[status] ?? status;
}

function resolveCustomerWhatsAppHref(params: {
  canReadPii: boolean;
  phone: string;
  fullName: string | undefined;
  orderNumber: string;
}): string | null {
  if (!params.canReadPii) return null;
  return customerWaLink(
    params.phone,
    `Hola ${params.fullName ?? ""}, te escribo de Lucams por tu pedido ${params.orderNumber}. `,
  );
}

export default async function AdminPedidoDetallePage({
  params,
}: Readonly<{
  params: Promise<{ number: string }>;
}>) {
  const session = await requireRole(ADMIN_ROLE_SETS.ALL);
  const role = session.admin.role;

  const { number } = await params;
  const order = await getOrderForActor(decodeURIComponent(number), role);
  if (!order) notFound();

  const encodedOrderNum = encodeURIComponent(order.number);
  const caps = resolveAdminOrderCapabilities(role, encodedOrderNum);
  const prodSummary = summarizeProductionApproval(order.items);
  const isInternalDelivery = order.shippingCarrier === LUCAMS_CARRIER;

  const [supporting, signedProduction, internalEstimate] = await Promise.all([
    loadAdminOrderSupportingData(order, role, caps),
    caps.canDownloadProduction
      ? getProductionAssetSignedUrls(prodSummary.productionPaths)
      : Promise.resolve(new Map<string, string>()),
    resolveInternalDeliveryEstimate(order, isInternalDelivery),
  ]);

  const ship = order.shippingAddress as ShippingAddrSnapshot;
  const deliveryNote = resolveDeliveryNote(order.notes, ship.notes);
  const statusLabel = resolveAdminOrderStatusLabel(order.status, isInternalDelivery);
  const contactProfileHref = resolveContactProfileHref(order, caps.canRead360, caps.canReadPii);
  const customerWa = resolveCustomerWhatsAppHref({
    canReadPii: caps.canReadPii,
    phone: order.phone,
    fullName: ship.fullName,
    orderNumber: order.number,
  });
  const ecosystemLinks = buildOrderEcosystemLinks({
    order,
    role,
    caps,
    encodedOrderNum,
    contactProfileHref,
    orderBuyerIsStaff: supporting.orderBuyerIsStaff,
    complementary: supporting.complementary,
  });
  const canRetryShipment = canActorRetryOrderShipment(order, role, isInternalDelivery);
  const showB2bMasters = Boolean(order.b2bProposalId && caps.canDownloadProduction);

  return (
    <AdminPage>
      <AdminPageHeader
        icon={<Box className="h-5 w-5" />}
        title={order.number}
        subtitle={
          <AdminOrderSubtitle
            status={order.status}
            statusLabel={statusLabel}
            createdAt={order.createdAt}
            deliveredAt={order.deliveredAt}
            canReadPii={caps.canReadPii}
          />
        }
        breadcrumbs={[
          { label: "Inicio", href: "/admin/dashboard" },
          { label: "Pedidos", href: "/admin/pedidos" },
          { label: order.number },
        ]}
      />

      <AdminPageBody>
        <OrderLifecycleStepper
          status={order.status}
          isInternalDelivery={isInternalDelivery}
          createdAt={order.createdAt}
          deliveredAt={order.deliveredAt}
          refundedAt={order.refundedAt}
        />

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          <div className="space-y-4 lg:col-span-2">
            {showB2bMasters && (
              <B2bWorkshopMastersPanel
                orderId={order.id}
                b2bArtworkReady={order.b2bArtworkReady}
                lines={buildB2bWorkshopLines(order)}
              />
            )}

            <AdminOrderItemsCard
              order={order}
              encodedOrderNum={encodedOrderNum}
              caps={caps}
              prodSummary={prodSummary}
              signedProduction={signedProduction}
            />

            <AdminOrderCustomerCard
              order={order}
              ship={ship}
              orderBuyerIsStaff={supporting.orderBuyerIsStaff}
              contactProfileHref={contactProfileHref}
              customerWa={customerWa}
            />

            <AdminOrderAddressCard order={order} ship={ship} deliveryNote={deliveryNote} />

            {ecosystemLinks.length > 0 && <AdminOrderEcosystemCard links={ecosystemLinks} />}
          </div>

          <AdminOrderSidebar
            order={order}
            ship={ship}
            encodedOrderNum={encodedOrderNum}
            statusLabel={statusLabel}
            isInternalDelivery={isInternalDelivery}
            internalEstimate={internalEstimate}
            canRetryShipment={canRetryShipment}
            currentAdminId={session.admin.id}
            caps={caps}
            supporting={supporting}
          />
        </div>
      </AdminPageBody>
    </AdminPage>
  );
}

function AdminOrderSubtitle({
  status,
  statusLabel,
  createdAt,
  deliveredAt,
  canReadPii,
}: Readonly<{
  status: string;
  statusLabel: string;
  createdAt: Date;
  deliveredAt: Date | null;
  canReadPii: boolean;
}>) {
  return (
    <span className="flex flex-wrap items-center gap-2">
      <AdminBadge tone={STATUS_TONE[status] ?? "slate"}>{statusLabel}</AdminBadge>
      <span>· creado {formatDateTimeCO(createdAt)}</span>
      {deliveredAt && <span>· entregado {formatDateTimeCO(deliveredAt)}</span>}
      {!canReadPii && (
        <Hint content="Por privacidad (Ley 1581), los datos de contacto y dirección exacta vienen protegidos desde el servidor para tu rol.">
          <span className="border-brand-purple/20 bg-brand-cream text-brand-purple-dark inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[11px] font-semibold">
            <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" />
            Datos personales protegidos
          </span>
        </Hint>
      )}
    </span>
  );
}

function computeItemProductionSpec(it: AdminOrderItem): ProductionSpec | null {
  if (!it.design) return null;
  return resolveProductionSpec({
    personalizationKind: it.variant.product.personalizationKind,
    productSchema: jsonRecord(it.variant.product.personalizationSchema),
    variantAttrs: jsonRecord(it.variant.attributes),
    physicalSpecs: jsonRecord(it.variant.product.physicalSpecs),
    canvasData: jsonRecord(it.design.canvasData),
    designMetadata: jsonRecord(it.design.metadata),
    productionUrls: it.design.productionUrls,
    lineQty: it.qty,
  });
}

function buildGalleryPieceRow(params: {
  path: string;
  index: number;
  orderNumber: string;
  signedProduction: Map<string, string>;
  labelByIndex: Map<number, string>;
  productionSpec: ProductionSpec | null;
  approved: boolean;
}) {
  const url = params.signedProduction.get(params.path);
  if (!url) return null;
  const pieceNum = String(params.index + 1).padStart(2, "0");
  const fallbackLabel = params.productionSpec
    ? productionPieceLabel(params.index, params.productionSpec)
    : `Pieza ${pieceNum}`;
  return {
    index: params.index,
    label: params.labelByIndex.get(params.index) ?? fallbackLabel,
    url,
    downloadName: `${params.orderNumber}-pieza-${pieceNum}.png`,
    approved: params.approved,
  };
}

function resolveItemGalleryData(
  it: AdminOrderItem,
  orderNumber: string,
  signedProduction: Map<string, string>,
  productionSpec: ProductionSpec | null,
) {
  const design = it.design;
  if (!design || design.productionUrls.length === 0) {
    return { galleryPieces: [], galleryGroups: null };
  }

  const productSchema = jsonRecord(it.variant.product.personalizationSchema);
  const startMonth =
    typeof productSchema?.startMonth === "number" ? productSchema.startMonth : undefined;
  const productionGroups = productionPieceGroups({
    personalizationKind: it.variant.product.personalizationKind,
    canvasData: jsonRecord(design.canvasData),
    designMetadata: jsonRecord(design.metadata),
    productionCount: design.productionUrls.length,
    productSchema,
    startMonth,
  });

  const labelByIndex = new Map<number, string>();
  for (const g of productionGroups ?? []) {
    for (const p of g.pieces) labelByIndex.set(p.index, p.label);
  }

  const approved = design.moderationStatus === "APPROVED";
  const galleryPieces = design.productionUrls
    .map((path, index) =>
      buildGalleryPieceRow({
        path,
        index,
        orderNumber,
        signedProduction,
        labelByIndex,
        productionSpec,
        approved,
      }),
    )
    .filter((p): p is NonNullable<typeof p> => p !== null);

  const galleryGroups = productionGroups
    ? productionGroups.map((g) => ({
        key: g.key,
        title: g.title,
        note: g.note,
        pieceIndexes: g.pieces.map((p) => p.index),
      }))
    : null;

  return { galleryPieces, galleryGroups };
}

function formatPhysicalUnitsSummary(
  it: AdminOrderItem,
  productionSpec: ProductionSpec | null,
): string | null {
  if (!it.design || (it.designUnits <= 1 && it.qty <= 1)) return null;
  const designWord = it.designUnits === 1 ? "diseño" : "diseños";
  const copyWord = it.qty === 1 ? "copia" : "copias";
  const totalPhysical = productionSpec?.unidadesFisicas ?? it.designUnits * it.qty;
  return `${it.designUnits} ${designWord} × ${it.qty} ${copyWord} = ${totalPhysical}`;
}

function ModerationStatusPill({ status }: Readonly<{ status: string | null | undefined }>) {
  if (status === "APPROVED") {
    return (
      <span className="rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] font-bold text-emerald-700">
        aprobado
      </span>
    );
  }
  if (status === "REJECTED") {
    return (
      <span className="rounded bg-rose-100 px-1.5 py-0.5 text-[10px] font-bold text-rose-700">
        rechazado — no imprimir
      </span>
    );
  }
  return (
    <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold text-amber-700">
      sin aprobar en Moderación
    </span>
  );
}

function AdminOrderItemDesignWithoutAssets({
  design,
  orderNumber,
  canManageRenders,
}: Readonly<{
  design: NonNullable<AdminOrderItem["design"]>;
  orderNumber: string;
  canManageRenders: boolean;
}>) {
  const job = design.renderJob;
  if (job && (job.status === "PENDING" || job.status === "PROCESSING")) {
    const jobProgressPct =
      job.totalUnits > 0 ? Math.min(100, Math.round((job.doneUnits / job.totalUnits) * 100)) : 0;
    return (
      <div className="text-brand-muted mt-1.5 text-[11px]">
        <div className="max-w-sm space-y-1">
          <span className="font-semibold text-sky-700">
            Preparando archivos 300 DPI… {job.doneUnits} de {job.totalUnits} piezas (
            {jobProgressPct}%)
          </span>
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-sky-100">
            <div
              className="admin-bar-grow-x h-full rounded-full bg-sky-600"
              style={{ width: `${Math.max(6, jobProgressPct)}%` }}
            />
          </div>
        </div>
      </div>
    );
  }

  if (job?.status === "FAILED") {
    return (
      <div className="text-brand-muted mt-1.5 text-[11px]">
        {canManageRenders ? (
          <RetryRenderJobButton
            designId={design.id}
            orderNumber={orderNumber}
            lastError={job.error}
          />
        ) : (
          <span className="font-semibold text-rose-700">
            Render 300 DPI con error pendiente de reintento por taller.
          </span>
        )}
      </div>
    );
  }

  return (
    <div className="text-brand-muted mt-1.5 text-[11px]">
      Sin archivos de producción todavía (el diseño no está finalizado).
    </div>
  );
}

function AdminOrderProductionSpecBox({
  productionSpec,
  designId,
  orderNumber,
  canManageRenders,
}: Readonly<{
  productionSpec: ProductionSpec;
  designId: string;
  orderNumber: string;
  canManageRenders: boolean;
}>) {
  return (
    <div className="border-brand-purple/10 bg-brand-cream/30 mb-2 rounded-md border p-2 text-[11px]">
      <p className="text-brand-purple-dark font-semibold">{productionSpec.queEsCadaArchivo}</p>
      {productionSpec.reversosConMarcaAgua.length > 0 && (
        <p className="mt-1 font-bold text-amber-800">
          Reverso B con marca de agua Lucams (ya viene en el archivo): unidad(es){" "}
          {productionSpec.reversosConMarcaAgua.join(", ")}.
        </p>
      )}
      {canManageRenders && productionSpec.formatoFisico.tipo === "lamina-fichas" && (
        <RegenLettersetButton designId={designId} orderNumber={orderNumber} />
      )}
    </div>
  );
}

function AdminOrderItemProductionSection({
  it,
  orderNumber,
  caps,
  signedProduction,
  productionSpec,
}: Readonly<{
  it: AdminOrderItem;
  orderNumber: string;
  caps: AdminOrderCapabilities;
  signedProduction: Map<string, string>;
  productionSpec: ProductionSpec | null;
}>) {
  const design = it.design;
  if (!design) return null;

  if (design.productionUrls.length === 0) {
    return (
      <AdminOrderItemDesignWithoutAssets
        design={design}
        orderNumber={orderNumber}
        canManageRenders={caps.canManageRenders}
      />
    );
  }

  const { galleryPieces, galleryGroups } = resolveItemGalleryData(
    it,
    orderNumber,
    signedProduction,
    productionSpec,
  );

  return (
    <div className="mt-1.5">
      <div className="text-brand-muted mb-1 flex flex-wrap items-center gap-1.5 text-[11px] font-semibold">
        Archivos de impresión · {design.productionUrls.length} PNG (300 DPI)
        <ModerationStatusPill status={design.moderationStatus} />
        {design.qualityAcknowledgedAt && (
          <Hint
            content={`Aceptación registrada el ${formatDateTimeCO(design.qualityAcknowledgedAt)}`}
          >
            <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold text-amber-700">
              ⚠️ aceptó calidad de fotos ({formatDateTimeCO(design.qualityAcknowledgedAt)})
            </span>
          </Hint>
        )}
      </div>

      {productionSpec && (
        <AdminOrderProductionSpecBox
          productionSpec={productionSpec}
          designId={design.id}
          orderNumber={orderNumber}
          canManageRenders={caps.canManageRenders}
        />
      )}

      {caps.canDownloadProduction && (
        <>
          <ProductionPiecesGallery pieces={galleryPieces} groups={galleryGroups} copies={it.qty} />
          {galleryPieces.length === 0 && (
            <p className="text-brand-muted text-[11px]">
              Piezas no disponibles para firma en este momento.
            </p>
          )}
        </>
      )}

      {caps.canManageRenders && design.renderJob?.status === "FAILED" && (
        <RetryRenderJobButton
          designId={design.id}
          orderNumber={orderNumber}
          lastError={design.renderJob.error}
        />
      )}
    </div>
  );
}

function AdminOrderItemThumbnail({
  previewUrl,
  qty,
}: Readonly<{ previewUrl: string | null; qty: number }>) {
  return (
    <div className="bg-brand-purple/5 relative h-16 w-16 flex-shrink-0 overflow-hidden rounded-lg p-1">
      {previewUrl ? (
        <Image src={previewUrl} alt="" fill sizes="64px" className="object-contain" unoptimized />
      ) : (
        <div className="text-brand-muted flex h-full w-full items-center justify-center text-xs">
          sin foto
        </div>
      )}
      <span className="bg-brand-purple-dark/85 absolute top-0 right-0 inline-flex h-5 min-w-5 items-center justify-center rounded-bl-md px-1 text-[10px] font-bold text-white">
        {qty}
      </span>
    </div>
  );
}

function AdminOrderItemTitle({
  productId,
  productName,
  variantName,
  canViewCatalog,
}: Readonly<{
  productId: string;
  productName: string;
  variantName: string;
  canViewCatalog: boolean;
}>) {
  return (
    <div className="text-brand-purple-dark text-sm font-semibold">
      {canViewCatalog ? (
        <Link
          href={`/admin/productos/${encodeURIComponent(productId)}`}
          className="hover:text-brand-purple hover:underline"
        >
          {productName}
        </Link>
      ) : (
        productName
      )}
      <span className="text-brand-muted font-normal"> · {variantName}</span>
    </div>
  );
}

function AdminOrderItemRow({
  it,
  orderNumber,
  caps,
  signedProduction,
}: Readonly<{
  it: AdminOrderItem;
  orderNumber: string;
  caps: AdminOrderCapabilities;
  signedProduction: Map<string, string>;
}>) {
  const previewRef = it.designAssetUrl ?? it.design?.previewUrl ?? null;
  const previewUrl = previewRef ? previewRefToAuthorizedUrl(previewRef) : null;
  const variantBreakdown = describeVariantAttributes(
    parseVariantAttributes(it.variant.attributes),
    it.variant.product.personalizationSchema,
  );
  const productionSpec = computeItemProductionSpec(it);
  const physicalSummary = formatPhysicalUnitsSummary(it, productionSpec);
  const unitPricePrefix = caps.canSeeMoney ? `${formatCOP(it.unitPrice)} c/u · ` : "";

  return (
    <li className="flex items-start gap-3 py-3">
      <AdminOrderItemThumbnail previewUrl={previewUrl} qty={it.qty} />

      <div className="min-w-0 flex-1">
        <AdminOrderItemTitle
          productId={it.variant.productId}
          productName={it.variant.product.name}
          variantName={it.variant.name}
          canViewCatalog={caps.canViewCatalog}
        />

        {variantBreakdown.length > 0 && (
          <div className="text-brand-purple-dark/70 text-xs">{variantBreakdown.join(" · ")}</div>
        )}

        <div className="text-brand-muted text-xs">
          {unitPricePrefix}
          cant. {it.qty}
          {physicalSummary ? ` (${physicalSummary} uds.)` : ""} ·{" "}
          <span className="font-mono">{it.variant.sku}</span>
        </div>

        {physicalSummary && (
          <div className="mt-1 inline-flex items-center gap-1.5 rounded-md border border-amber-300 bg-amber-50 px-2 py-0.5 text-[11px] font-bold text-amber-900">
            Producir y empacar: {physicalSummary} uds. físicas
          </div>
        )}

        <AdminOrderItemProductionSection
          it={it}
          orderNumber={orderNumber}
          caps={caps}
          signedProduction={signedProduction}
          productionSpec={productionSpec}
        />
      </div>

      {caps.canSeeMoney && (
        <div className="text-brand-purple-dark flex-shrink-0 text-right text-sm font-semibold tabular-nums">
          {formatCOP(it.unitPrice * it.qty)}
        </div>
      )}
    </li>
  );
}

function AdminOrderItemsCard({
  order,
  encodedOrderNum,
  caps,
  prodSummary,
  signedProduction,
}: Readonly<{
  order: AdminOrder;
  encodedOrderNum: string;
  caps: AdminOrderCapabilities;
  prodSummary: ReturnType<typeof summarizeProductionApproval>;
  signedProduction: Map<string, string>;
}>) {
  return (
    <Card icon={<Package className="h-4 w-4" />} title={`Ítems (${order.items.length})`}>
      {prodSummary.hasProduction && caps.canDownloadProduction && order.b2bArtworkReady && (
        <div className="border-brand-purple/10 bg-brand-cream/40 mb-3 flex flex-wrap items-center justify-between gap-2 rounded-lg border px-3 py-2.5">
          <div className="min-w-0">
            <div className="text-brand-purple-dark text-xs font-bold">
              Archivos de impresión 300 DPI
            </div>
            <div className="text-brand-muted text-[11px]">
              {prodSummary.productionPaths.length} pieza(s) ·{" "}
              <span className="text-emerald-700">
                {prodSummary.approvedPieceCount} listas para imprimir
              </span>
              {prodSummary.hasUnapproved && (
                <span className="ml-1 font-semibold text-amber-700">
                  · {prodSummary.unapprovedPieceCount} pendiente(s) de aprobación
                </span>
              )}
            </div>
            {prodSummary.hasUnapproved && caps.canModerate && (
              <div className="mt-0.5 text-[11px] text-amber-800">
                ⚠️ Revisa los diseños de este pedido en{" "}
                <Link
                  href={`/admin/moderacion?q=${encodedOrderNum}`}
                  className="text-brand-purple-dark hover:text-brand-purple font-semibold underline"
                >
                  Moderación ({order.number})
                </Link>{" "}
                antes de imprimir.
              </div>
            )}
          </div>
          <a
            href={`/admin/pedidos/${encodedOrderNum}/produccion`}
            className="bg-brand-purple hover:bg-brand-purple-dark inline-flex flex-shrink-0 items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-bold text-white transition-colors"
          >
            ⬇ Descargar todo (ZIP)
          </a>
        </div>
      )}

      <ul className="divide-brand-purple/10 divide-y">
        {order.items.map((it) => (
          <AdminOrderItemRow
            key={it.id}
            it={it}
            orderNumber={order.number}
            caps={caps}
            signedProduction={signedProduction}
          />
        ))}
      </ul>
    </Card>
  );
}

function renderCustomerProfileValue(
  contactProfileHref: string | null,
  hasRegisteredCustomer: boolean,
): React.ReactNode {
  if (contactProfileHref) {
    return (
      <Link
        href={contactProfileHref}
        className="text-brand-purple-dark hover:text-brand-purple font-semibold underline"
      >
        Ver ficha Contacto 360 →
      </Link>
    );
  }
  if (hasRegisteredCustomer) {
    return <span className="text-brand-muted">Con cuenta registrada</span>;
  }
  return <span className="text-brand-muted">Compra como invitado</span>;
}

function AdminOrderCustomerCard({
  order,
  ship,
  orderBuyerIsStaff,
  contactProfileHref,
  customerWa,
}: Readonly<{
  order: AdminOrder;
  ship: ShippingAddrSnapshot;
  orderBuyerIsStaff: boolean;
  contactProfileHref: string | null;
  customerWa: string | null;
}>) {
  const docLabel =
    ship.documentType && ship.documentNumber ? `${ship.documentType} ${ship.documentNumber}` : "—";

  return (
    <Card icon={<User className="h-4 w-4" />} title="Cliente">
      {orderBuyerIsStaff && (
        <p className="mb-2 inline-flex items-center gap-1.5 rounded-full border border-amber-300 bg-amber-50 px-2.5 py-1 text-[11px] font-bold text-amber-800">
          ⚑ Equipo interno — compra del staff (excluida de segmentos y RFM)
        </p>
      )}
      <dl className="grid grid-cols-1 gap-x-4 gap-y-2 text-sm sm:grid-cols-2">
        <Row label="Nombre" value={ship.fullName ?? "—"} />
        <Row label="Correo" value={order.email} />
        <Row label="Teléfono" value={order.phone} />
        <Row label="Documento" value={docLabel} />
        <Row
          label="Perfil cliente"
          value={renderCustomerProfileValue(contactProfileHref, Boolean(order.customer))}
        />
      </dl>

      {order.billingDocumentType && order.billingDocumentNumber && (
        <div className="border-brand-purple/20 bg-brand-purple/5 mt-3 rounded-md border px-3 py-2">
          <p className="text-brand-purple-dark text-xs font-bold">Documento de venta</p>
          <p className="text-brand-purple-dark mt-0.5 text-xs">
            {order.billingDocumentType} {order.billingDocumentNumber}
            {order.billingName ? ` · ${order.billingName}` : ""}
          </p>
        </div>
      )}

      {customerWa && (
        <a
          href={customerWa}
          target="_blank"
          rel="noopener noreferrer"
          className="text-brand-purple-dark hover:bg-brand-purple/5 mt-3 inline-flex items-center gap-1.5 rounded-md border border-emerald-600/30 bg-emerald-50 px-3 py-1.5 text-xs font-semibold"
        >
          <WhatsAppIcon className="h-3.5 w-3.5 text-emerald-700" />
          Escribir al WhatsApp del cliente
        </a>
      )}
    </Card>
  );
}

function AdminOrderRecipientGiftBox({
  recipientName,
  recipientPhone,
  isGift,
  giftMessage,
}: Readonly<{
  recipientName: string;
  recipientPhone: string | null;
  isGift: boolean;
  giftMessage: string | null;
}>) {
  return (
    <div className="border-brand-purple/20 bg-brand-purple/5 mt-3 rounded-md border px-3 py-2">
      <p className="text-brand-purple-dark text-xs font-bold">🎁 Lo recibe otra persona</p>
      <p className="text-brand-purple-dark mt-0.5 text-xs">
        Recibe: <strong>{recipientName}</strong>
        {recipientPhone ? ` · Tel ${recipientPhone}` : ""} — la guía sale a su nombre.
      </p>
      {isGift && (
        <p className="mt-1 text-[11px] font-semibold text-amber-800">
          Es regalo: empacar SIN factura ni precios visibles.
        </p>
      )}
      {isGift && giftMessage && (
        <p className="text-brand-muted mt-1 text-xs italic">
          Mensaje para la tarjeta: “{giftMessage}”
        </p>
      )}
    </div>
  );
}

function AdminOrderAddressCard({
  order,
  ship,
  deliveryNote,
}: Readonly<{
  order: AdminOrder;
  ship: ShippingAddrSnapshot;
  deliveryNote: string | null;
}>) {
  const locationExtras = [
    ship.localityName ? `Localidad ${ship.localityName}` : null,
    ship.neighborhood ? `Barrio ${ship.neighborhood}` : null,
    ship.zip ?? null,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <Card icon={<MapPin className="h-4 w-4" />} title="Dirección de envío">
      <div className="text-brand-purple-dark text-sm">
        {ship.addressLine1}
        {ship.addressLine2 ? ` · ${ship.addressLine2}` : ""}
      </div>
      <div className="text-brand-muted mt-1 text-xs">
        {ship.city}, {ship.department}
        {locationExtras ? ` · ${locationExtras}` : ""}
      </div>
      {deliveryNote && (
        <div className="text-brand-muted mt-2 text-xs italic">Nota: {deliveryNote}</div>
      )}

      {order.recipientName && (
        <AdminOrderRecipientGiftBox
          recipientName={order.recipientName}
          recipientPhone={order.recipientPhone}
          isGift={order.isGift}
          giftMessage={order.giftMessage}
        />
      )}
    </Card>
  );
}

function AdminOrderEcosystemCard({ links }: Readonly<{ links: EcosystemLinkItem[] }>) {
  return (
    <Card icon={<Network className="h-4 w-4" />} title="Ecosistema 360° vinculado">
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {links.map((link) => (
          <Link
            key={link.key}
            href={link.href}
            className="border-brand-purple/10 hover:border-brand-purple/30 hover:bg-brand-purple/[0.03] group flex items-center justify-between gap-2 rounded-lg border bg-slate-50/50 px-3 py-2.5 transition-colors"
          >
            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                <span className="text-brand-purple-dark truncate text-xs font-semibold">
                  {link.label}
                </span>
                <AdminBadge tone={link.tone}>Ver</AdminBadge>
              </div>
              <p className="text-brand-muted mt-0.5 truncate text-[11px]">{link.detail}</p>
            </div>
            <ArrowUpRight className="text-brand-muted group-hover:text-brand-purple h-4 w-4 flex-shrink-0 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
          </Link>
        ))}
      </div>
    </Card>
  );
}

function AdminOrderReconciliationCard({ order }: Readonly<{ order: AdminOrder }>) {
  if (order.needsReconciliation) {
    return (
      <Card icon={<Undo2 className="h-4 w-4" />} title="Reconciliación">
        <p className="text-[11px] font-bold text-red-800">🔴 Pendiente — requiere gestión manual</p>
        {order.reconciliationReason && (
          <p className="mt-1 text-xs text-red-900">{order.reconciliationReason}</p>
        )}
        <p className="text-brand-muted mt-1.5 text-[11px]">
          Cuando lo resuelvas (reembolso en Wompi, reposición de stock, etc.), ciérralo con «Marcar
          reconciliación como gestionada» en Acciones operativas.
        </p>
      </Card>
    );
  }

  return (
    <Card icon={<Undo2 className="h-4 w-4" />} title="Reconciliación">
      <p className="text-[11px] font-bold text-emerald-800">✔ Gestionada</p>
      {order.reconciliationReason && (
        <p className="text-brand-muted mt-1 text-[11px]">
          Motivo original: {order.reconciliationReason}
        </p>
      )}
      {order.reconciliationNote && (
        <p className="mt-1 text-xs text-emerald-900">Resolución: {order.reconciliationNote}</p>
      )}
      {order.reconciledAt && (
        <p className="text-brand-muted mt-1 text-[10px]">
          Cerrada el {formatDateTimeCO(order.reconciledAt)}
        </p>
      )}
    </Card>
  );
}

function AdminOrderTotalsCard({ order }: Readonly<{ order: AdminOrder }>) {
  return (
    <Card icon={<Box className="h-4 w-4" />} title="Totales">
      <dl className="space-y-1.5 text-sm">
        <Row label="Subtotal" value={formatCOP(order.subtotal)} />
        <Row label="Envío" value={formatCOP(order.shipping)} />
        {order.discount > 0 && (
          <Row
            label={order.coupon ? `Cupón (${order.coupon.code})` : "Descuento"}
            value={`- ${formatCOP(order.discount)}`}
          />
        )}
        {order.loyaltyDiscount > 0 && (
          <Row
            label={`Puntos Lucams (${order.loyaltyPointsRedeemed.toLocaleString("es-CO")} pts)`}
            value={`- ${formatCOP(order.loyaltyDiscount)}`}
          />
        )}
        <div className="border-brand-purple/10 mt-2 flex justify-between border-t pt-2">
          <dt className="text-brand-purple-dark font-bold">Total</dt>
          <dd className="text-brand-purple-dark font-bold tabular-nums">
            {formatCOP(order.total)}
          </dd>
        </div>
        {order.withholdingCents > 0 && (
          <>
            <Row label="Retenciones B2B" value={`- ${formatCOP(order.withholdingCents)}`} />
            <Row
              label="Efectivo neto en banco"
              value={formatCOP(Math.max(0, order.total - order.withholdingCents))}
            />
          </>
        )}
      </dl>
    </Card>
  );
}

function AdminOrderRefundCard({ order }: Readonly<{ order: AdminOrder }>) {
  return (
    <Card icon={<Undo2 className="h-4 w-4" />} title="Reembolso">
      <Row label="Monto" value={formatCOP(order.refundAmount ?? order.total)} />
      {order.refundedAt && <Row label="Fecha" value={formatDateTimeCO(order.refundedAt)} />}
      {order.refundReason && <Row label="Motivo" value={order.refundReason} />}
      <p className="mt-2 text-[11px] text-amber-700">
        ⚠️ El movimiento de dinero se ejecuta manualmente por Wompi o transferencia.
      </p>
    </Card>
  );
}

function AdminOrderPaymentCard({
  order,
  statusLabel,
}: Readonly<{ order: AdminOrder; statusLabel: string }>) {
  return (
    <Card icon={<CreditCard className="h-4 w-4" />} title="Pago">
      <Row
        label="Método"
        value={PAYMENT_METHOD_LABEL[order.paymentMethod] ?? order.paymentMethod}
      />
      {order.wompiTransactionId && (
        <Row
          label="Transacción Wompi"
          value={
            <a
              href={`https://comercios.wompi.co/transactions/${order.wompiTransactionId}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-brand-purple-dark hover:text-brand-purple font-mono text-xs underline"
            >
              {order.wompiTransactionId.slice(0, 18)}…
            </a>
          }
        />
      )}
      {order.wompiAttempts.length > 0 && (
        <div className="border-brand-purple/10 mt-3 space-y-2 border-t pt-3">
          <p className="text-brand-purple-dark text-xs font-bold">Intentos y transacciones</p>
          {order.wompiAttempts.map((attempt) => (
            <div key={attempt.id} className="bg-brand-cream rounded-lg p-2.5 text-xs">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-semibold">
                  Intento {attempt.sequence} ·{" "}
                  {WOMPI_STATUS_LABEL[attempt.status] ?? attempt.status}
                </span>
                <span className="tabular-nums">{formatCOP(attempt.amountInCents)}</span>
              </div>
              <code className="text-brand-muted mt-1 block text-[10px] break-all">
                {attempt.reference}
              </code>
              {attempt.transactions.length > 0 && (
                <ul className="mt-1.5 space-y-1">
                  {attempt.transactions.map((tx) => (
                    <li key={tx.id} className="break-all">
                      {tx.status ? (WOMPI_STATUS_LABEL[tx.status] ?? tx.status) : "Sin verificar"} ·{" "}
                      <span className="font-mono">{tx.externalId}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ))}
        </div>
      )}
      <Row label="Estado" value={statusLabel} />
    </Card>
  );
}

function AdminOrderCodCollectionCard({ order }: Readonly<{ order: AdminOrder }>) {
  if (order.paymentMethod === "COD") {
    return (
      <Card icon={<CreditCard className="h-4 w-4" />} title="Condición de entrega y recaudo">
        <div className="rounded-lg border border-amber-300 bg-amber-50 p-3">
          <p className="text-xs font-bold text-amber-900">💵 Contraentrega — cobrar al entregar</p>
          <p className="font-display mt-1 text-xl font-bold text-amber-950 tabular-nums">
            {formatCOP(order.total)}
          </p>
          <p className="mt-1 text-[11px] text-amber-800">
            Verifica que el monto coincida en la guía física antes de despachar.
          </p>
        </div>
      </Card>
    );
  }

  const paidMethodLabel =
    order.paymentMethod === "DIRECT_TRANSFER" ? "Pago directo B2B" : "Pagado en línea";
  return (
    <Card icon={<CreditCard className="h-4 w-4" />} title="Condición de entrega y recaudo">
      <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3">
        <p className="text-xs font-bold text-emerald-900">
          ✔ {paidMethodLabel} — no cobrar al entregar
        </p>
        <p className="mt-0.5 text-[11px] text-emerald-800">
          El pago ya fue procesado; entrega el paquete sin recaudar efectivo.
        </p>
      </div>
    </Card>
  );
}

function AdminOrderFinancialSection({
  order,
  statusLabel,
  directReceiptSignedUrl,
  caps,
}: Readonly<{
  order: AdminOrder;
  statusLabel: string;
  directReceiptSignedUrl: string | null;
  caps: AdminOrderCapabilities;
}>) {
  if (caps.canSeeMoney) {
    return (
      <>
        <AdminOrderTotalsCard order={order} />

        {order.paymentMethod === "DIRECT_TRANSFER" && (
          <DirectPaymentVerificationPanel
            orderId={order.id}
            orderNumber={order.number}
            orderStatus={order.status}
            totalCents={order.total}
            withholdingCents={order.withholdingCents}
            directPaymentMethod={order.directPaymentMethod}
            directPaymentReference={order.directPaymentReference}
            directPaymentReportedLabel={
              order.directPaymentReportedAt ? formatDateTimeCO(order.directPaymentReportedAt) : null
            }
            directPaymentConfirmedLabel={
              order.directPaymentConfirmedAt
                ? formatDateTimeCO(order.directPaymentConfirmedAt)
                : null
            }
            directPaymentNotes={order.directPaymentNotes}
            receiptSignedUrl={directReceiptSignedUrl}
            canConfirm={caps.canConfirmDirectPayment}
          />
        )}

        {order.status === "REFUNDED" && <AdminOrderRefundCard order={order} />}

        <AdminOrderPaymentCard order={order} statusLabel={statusLabel} />
      </>
    );
  }

  if (caps.canSeeCodTotal) {
    return <AdminOrderCodCollectionCard order={order} />;
  }

  return null;
}

function AdminInternalDeliveryGuideMeta({
  localityName,
  internalEstimate,
  encodedOrderNum,
  canPrintGuide,
}: Readonly<{
  localityName: string | undefined;
  internalEstimate: string | null;
  encodedOrderNum: string;
  canPrintGuide: boolean;
}>) {
  return (
    <>
      {localityName && <Row label="Zona de entrega" value={localityName} />}
      {internalEstimate && <Row label="Estimación" value={internalEstimate} />}
      <p className="text-brand-muted mt-1 text-[10px]">
        Entrega interna (mensajería propia): marca la salida en ruta y la entrega en Acciones
        operativas ↓.
      </p>
      {canPrintGuide && (
        <a
          href={`/admin/pedidos/${encodedOrderNum}/guia`}
          target="_blank"
          rel="noopener noreferrer"
          className="bg-brand-purple hover:bg-brand-purple-dark mt-2 inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold text-white transition-colors"
        >
          🖨 Imprimir guía de entrega
        </a>
      )}
    </>
  );
}

function AdminExternalGuideDocumentLinks({
  carrierLabelHref,
  trackingUrl,
  hasArchivedAndExternalLabel,
}: Readonly<{
  carrierLabelHref: string | null;
  trackingUrl: string | null;
  hasArchivedAndExternalLabel: boolean;
}>) {
  const aveonlineLinkText = carrierLabelHref
    ? "Ver guía en Aveonline (enlace externo, puede expirar) →"
    : "Ver guía en Aveonline →";

  return (
    <>
      {carrierLabelHref && (
        <a
          href={carrierLabelHref}
          target="_blank"
          rel="noopener noreferrer"
          className="bg-brand-purple hover:bg-brand-purple-dark mt-2 inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold text-white transition-colors"
        >
          📄 Descargar etiqueta PDF
        </a>
      )}
      {trackingUrl && (
        <a
          href={trackingUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="text-brand-purple mt-2 block text-xs underline"
        >
          {aveonlineLinkText}
        </a>
      )}
      {hasArchivedAndExternalLabel && (
        <a
          href={`${carrierLabelHref}?fuente=externa`}
          target="_blank"
          rel="noopener noreferrer"
          className="text-brand-muted mt-1 block text-xs underline"
        >
          Etiqueta en Aveonline (respaldo externo) →
        </a>
      )}
    </>
  );
}

function AdminTrackedGuideBody({
  order,
  trackingNumber,
  ship,
  encodedOrderNum,
  isInternalDelivery,
  internalEstimate,
  canPrintGuide,
  shipmentEvents,
}: Readonly<{
  order: AdminOrder;
  trackingNumber: string;
  ship: ShippingAddrSnapshot;
  encodedOrderNum: string;
  isInternalDelivery: boolean;
  internalEstimate: string | null;
  canPrintGuide: boolean;
  shipmentEvents: AdminShipmentEventRow[];
}>) {
  const hasLabelSource = Boolean(order.labelPath) || Boolean(order.labelUrl);
  const carrierLabelHref =
    canPrintGuide && hasLabelSource ? `/admin/pedidos/${encodedOrderNum}/guia/etiqueta` : null;
  const hasArchivedAndExternalLabel = Boolean(
    carrierLabelHref && order.labelPath && order.labelUrl,
  );
  const isSimulatedTracking = trackingNumber.startsWith("TEST-");

  return (
    <>
      <Row
        label={isInternalDelivery ? "Referencia" : "N° de guía"}
        value={
          <span className="text-brand-purple-dark/85 font-mono text-xs">{trackingNumber}</span>
        }
      />
      {isInternalDelivery && (
        <AdminInternalDeliveryGuideMeta
          localityName={ship.localityName}
          internalEstimate={internalEstimate}
          encodedOrderNum={encodedOrderNum}
          canPrintGuide={canPrintGuide}
        />
      )}
      {isSimulatedTracking && (
        <p className="mt-1 text-[10px] text-amber-700">
          ⚠️ Guía simulada (modo prueba). En producción genera guía real.
        </p>
      )}
      <AdminExternalGuideDocumentLinks
        carrierLabelHref={carrierLabelHref}
        trackingUrl={order.trackingUrl}
        hasArchivedAndExternalLabel={hasArchivedAndExternalLabel}
      />
      {shipmentEvents.length > 0 && (
        <ShipmentCarrierTimeline orderStatus={order.status} shipmentEvents={shipmentEvents} />
      )}
    </>
  );
}

function ShipmentLastErrorCallout({
  shipmentLastError,
  canRetryShipment,
}: Readonly<{
  shipmentLastError: ShipmentLastError;
  canRetryShipment: boolean;
}>) {
  const destinationLabel = [
    shipmentLastError.destination.city,
    shipmentLastError.destination.department,
  ]
    .filter(Boolean)
    .join(", ");

  return (
    <div className="mt-2 rounded-lg border border-rose-200 bg-rose-50/60 p-3">
      <p className="text-[11px] font-bold text-rose-800">
        Último error de la transportadora
        {shipmentLastError.at ? ` · ${formatDateTimeCO(new Date(shipmentLastError.at))}` : ""}
      </p>
      <p className="mt-1 font-mono text-[11px] break-words text-rose-900">
        {shipmentLastError.message}
      </p>
      {destinationLabel.length > 0 && (
        <p className="text-brand-muted mt-1 text-[10px]">
          Destino: {destinationLabel}
          {shipmentLastError.carrier
            ? ` · transportadora ${carrierDisplayName(shipmentLastError.carrier)}`
            : ""}
        </p>
      )}
      <p className="mt-1.5 text-[11px] text-amber-800">
        💡 {suggestShipmentFailureCause(shipmentLastError)}
      </p>
      {canRetryShipment && (
        <p className="mt-1.5 text-[11px] font-medium text-rose-800">
          Acción sugerida: reintenta con «Generar guía Aveonline» en Acciones operativas ↓.
        </p>
      )}
    </div>
  );
}

function AdminUntrackedGuideBody({
  order,
  encodedOrderNum,
  isInternalDelivery,
  canPrintGuide,
  canRetryShipment,
}: Readonly<{
  order: AdminOrder;
  encodedOrderNum: string;
  isInternalDelivery: boolean;
  canPrintGuide: boolean;
  canRetryShipment: boolean;
}>) {
  const shipmentLastError = parseShipmentLastError(order.shipmentLastError);
  return (
    <>
      <p className="text-brand-muted text-xs">Sin guía generada todavía</p>
      {!isInternalDelivery && !shipmentLastError && canRetryShipment && (
        <p className="text-brand-muted mt-1 text-[11px]">
          Créala con el botón «Generar guía Aveonline» en Acciones operativas ↓.
        </p>
      )}
      {shipmentLastError && !isInternalDelivery && (
        <ShipmentLastErrorCallout
          shipmentLastError={shipmentLastError}
          canRetryShipment={canRetryShipment}
        />
      )}
      {isInternalDelivery && canPrintGuide && (
        <a
          href={`/admin/pedidos/${encodedOrderNum}/guia`}
          target="_blank"
          rel="noopener noreferrer"
          className="bg-brand-purple hover:bg-brand-purple-dark mt-2 inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold text-white transition-colors"
        >
          🖨 Imprimir guía de entrega
        </a>
      )}
    </>
  );
}

function AdminOrderShippingCard({
  order,
  ship,
  encodedOrderNum,
  isInternalDelivery,
  internalEstimate,
  canPrintGuide,
  canRetryShipment,
  shipmentEvents,
}: Readonly<{
  order: AdminOrder;
  ship: ShippingAddrSnapshot;
  encodedOrderNum: string;
  isInternalDelivery: boolean;
  internalEstimate: string | null;
  canPrintGuide: boolean;
  canRetryShipment: boolean;
  shipmentEvents: AdminShipmentEventRow[];
}>) {
  return (
    <Card icon={<Truck className="h-4 w-4" />} title="Envío">
      <Row
        label="Transportadora"
        value={
          <span className="inline-flex items-center gap-1.5">
            {carrierDisplayName(order.shippingCarrier)}
            {isInternalDelivery && (
              <span className="bg-brand-turquoise/40 rounded px-1.5 py-0.5 text-[10px] font-bold text-teal-900">
                Entrega propia
              </span>
            )}
          </span>
        }
      />
      {order.trackingNumber ? (
        <AdminTrackedGuideBody
          order={order}
          trackingNumber={order.trackingNumber}
          ship={ship}
          encodedOrderNum={encodedOrderNum}
          isInternalDelivery={isInternalDelivery}
          internalEstimate={internalEstimate}
          canPrintGuide={canPrintGuide}
          shipmentEvents={shipmentEvents}
        />
      ) : (
        <AdminUntrackedGuideBody
          order={order}
          encodedOrderNum={encodedOrderNum}
          isInternalDelivery={isInternalDelivery}
          canPrintGuide={canPrintGuide}
          canRetryShipment={canRetryShipment}
        />
      )}
    </Card>
  );
}

function formatStatusTransitionHeadline(ev: AdminStatusEventRow): string {
  if (ev.fromStatus === null) return "Pedido creado";
  const fromLabel = STATUS_LABEL[ev.fromStatus] ?? ev.fromStatus;
  const toLabel = STATUS_LABEL[ev.toStatus] ?? ev.toStatus;
  return `${fromLabel} → ${toLabel}`;
}

function AdminOrderStatusHistoryCard({
  statusEvents,
}: Readonly<{ statusEvents: AdminStatusEventRow[] }>) {
  return (
    <Card icon={<History className="h-4 w-4" />} title="Historial de estados">
      <ol className="relative ml-1.5 space-y-3">
        {statusEvents.map((ev, i) => (
          <li key={ev.id} className="relative pl-5">
            {i < statusEvents.length - 1 && (
              <span
                aria-hidden
                className="bg-brand-purple/15 absolute top-3.5 left-[3px] h-[calc(100%+2px)] w-px"
              />
            )}
            <span
              aria-hidden
              className={`absolute top-1.5 left-0 h-[7px] w-[7px] rounded-full ${
                i === statusEvents.length - 1
                  ? "bg-brand-pink ring-brand-pink/30 ring-2"
                  : "bg-brand-purple/50"
              }`}
            />
            <div className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-xs">
              <span className="text-brand-purple-dark font-semibold">
                {formatStatusTransitionHeadline(ev)}
              </span>
              <span className="text-brand-muted">· {SOURCE_LABEL[ev.source] ?? ev.source}</span>
            </div>
            {ev.note && <p className="text-brand-muted mt-0.5 text-[11px] italic">“{ev.note}”</p>}
            <p className="text-brand-muted mt-0.5 text-[10px]">{formatDateTimeCO(ev.createdAt)}</p>
          </li>
        ))}
      </ol>
    </Card>
  );
}

function AdminOrderSidebar({
  order,
  ship,
  encodedOrderNum,
  statusLabel,
  isInternalDelivery,
  internalEstimate,
  canRetryShipment,
  currentAdminId,
  caps,
  supporting,
}: Readonly<{
  order: AdminOrder;
  ship: ShippingAddrSnapshot;
  encodedOrderNum: string;
  statusLabel: string;
  isInternalDelivery: boolean;
  internalEstimate: string | null;
  canRetryShipment: boolean;
  currentAdminId: string;
  caps: AdminOrderCapabilities;
  supporting: AdminOrderSupportingData;
}>) {
  const showReconciliationCard = Boolean(order.needsReconciliation || order.reconciledAt);
  const hasContactForCrm = Boolean(order.contactId);

  return (
    <div className="space-y-4 lg:col-span-1">
      {showReconciliationCard && <AdminOrderReconciliationCard order={order} />}

      <AdminOrderFinancialSection
        order={order}
        statusLabel={statusLabel}
        directReceiptSignedUrl={supporting.directReceiptSignedUrl}
        caps={caps}
      />

      <AdminOrderShippingCard
        order={order}
        ship={ship}
        encodedOrderNum={encodedOrderNum}
        isInternalDelivery={isInternalDelivery}
        internalEstimate={internalEstimate}
        canPrintGuide={caps.canPrintGuide}
        canRetryShipment={canRetryShipment}
        shipmentEvents={supporting.shipmentEvents}
      />

      {supporting.statusEvents.length > 0 && (
        <AdminOrderStatusHistoryCard statusEvents={supporting.statusEvents} />
      )}

      <CrmWorkspacePanel
        title="Tareas y seguimiento del pedido"
        contactId={caps.canViewActivities ? order.contactId : null}
        orderId={order.id}
        orderNumber={order.number}
        currentAdminId={currentAdminId}
        canManageTasks={caps.canManageTasks}
        canViewActivities={caps.canViewActivities && hasContactForCrm}
        canManageActivities={caps.canManageActivities && hasContactForCrm}
        tasks={supporting.crmTasks}
        activities={supporting.crmActivities}
        assignableAdmins={supporting.assignableAdmins}
        compact
      />

      <OrderActions
        orderId={order.id}
        orderStatus={order.status}
        hasTracking={Boolean(order.trackingNumber)}
        paymentMethod={order.paymentMethod}
        isNoShow={Boolean(order.noShowAt)}
        hasAddressKey={supporting.complementary.hasBlockableCodAddress}
        isInternalDelivery={isInternalDelivery}
        needsReconciliation={order.needsReconciliation}
        canPrepare={caps.canPrepare}
        canDispatch={caps.canDispatch}
        canCancelRole={caps.canCancelRole}
        canReconcile={caps.canReconcile}
        canBlockAddress={caps.canBlockAddress}
        canRefund={caps.canRefund}
      />
    </div>
  );
}

const LIFECYCLE_STEPS = [
  { key: "PENDING_PAYMENT", label: "Esperando pago" },
  { key: "PAID", label: "Pagado" },
  { key: "FULFILLING", label: "En preparación" },
  { key: "SHIPPED", label: "Enviado" },
  { key: "DELIVERED", label: "Entregado" },
] as const;

function resolveLifecycleStepStyles(
  isDone: boolean,
  isCurrent: boolean,
): { badgeClass: string; labelClass: string } {
  if (isDone) {
    return { badgeClass: "bg-emerald-600 text-white", labelClass: "text-emerald-800" };
  }
  if (isCurrent) {
    return {
      badgeClass: "bg-brand-purple ring-brand-purple/25 text-white ring-4",
      labelClass: "text-brand-purple-dark",
    };
  }
  return { badgeClass: "bg-slate-100 text-slate-400", labelClass: "text-slate-400" };
}

function CancelledOrderLifecycleBanner({
  status,
  createdAt,
  refundedAt,
}: Readonly<{
  status: string;
  createdAt: Date;
  refundedAt?: Date | null;
}>) {
  const isRefund = status === "REFUNDED";
  return (
    <section className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-rose-200 bg-rose-50/70 px-4 py-3">
      <div className="flex items-center gap-2.5">
        <span className="flex h-7 w-7 items-center justify-center rounded-full bg-rose-600 text-white">
          {isRefund ? <Undo2 className="h-3.5 w-3.5" /> : <Ban className="h-3.5 w-3.5" />}
        </span>
        <div>
          <p className="text-xs font-bold text-rose-900">
            {isRefund ? "Pedido reembolsado" : "Pedido cancelado"}
          </p>
          <p className="text-[11px] text-rose-800">
            Creado el {formatDateTimeCO(createdAt)}
            {isRefund && refundedAt ? ` · reembolsado el ${formatDateTimeCO(refundedAt)}` : ""}
          </p>
        </div>
      </div>
      <AdminBadge tone="rose">{isRefund ? "Reembolsado" : "Cancelado"}</AdminBadge>
    </section>
  );
}

function OrderLifecycleStepper({
  status,
  isInternalDelivery,
  createdAt,
  deliveredAt,
  refundedAt,
}: Readonly<{
  status: string;
  isInternalDelivery: boolean;
  createdAt: Date;
  deliveredAt?: Date | null;
  refundedAt?: Date | null;
}>) {
  if (status === "CANCELLED" || status === "REFUNDED") {
    return (
      <CancelledOrderLifecycleBanner
        status={status}
        createdAt={createdAt}
        refundedAt={refundedAt}
      />
    );
  }

  const activeIdx = Math.max(
    0,
    LIFECYCLE_STEPS.findIndex((s) => s.key === status),
  );
  const pct = Math.round((activeIdx / (LIFECYCLE_STEPS.length - 1)) * 100);
  const barWidthPct = status === "DELIVERED" ? 100 : Math.max(8, pct);

  return (
    <section
      aria-label="Progreso del ciclo de vida del pedido"
      className="border-brand-purple/10 rounded-xl border bg-white px-4 py-3.5 shadow-sm"
    >
      <div className="grid grid-cols-5 gap-2">
        {LIFECYCLE_STEPS.map((step, idx) => {
          const isDone = idx < activeIdx || status === "DELIVERED";
          const isCurrent = idx === activeIdx && status !== "DELIVERED";
          const stepLabel = step.key === "SHIPPED" && isInternalDelivery ? "En ruta" : step.label;
          const { badgeClass, labelClass } = resolveLifecycleStepStyles(isDone, isCurrent);
          return (
            <div key={step.key} className="flex flex-col items-center text-center">
              <span
                className={`flex h-6 w-6 items-center justify-center rounded-full text-[11px] font-bold transition-all ${badgeClass}`}
              >
                {isDone ? <Check className="h-3.5 w-3.5" /> : idx + 1}
              </span>
              <span className={`mt-1.5 text-[11px] leading-tight font-semibold ${labelClass}`}>
                {stepLabel}
              </span>
            </div>
          );
        })}
      </div>
      <div className="mt-2.5 h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
        <div
          className="admin-bar-grow-x from-brand-purple h-full rounded-full bg-gradient-to-r to-emerald-500"
          style={{ width: `${barWidthPct}%` }}
        />
      </div>
      {deliveredAt && status === "DELIVERED" && (
        <p className="mt-1.5 text-right text-[10px] font-medium text-emerald-700">
          Entregado el {formatDateTimeCO(deliveredAt)}
        </p>
      )}
    </section>
  );
}

function carrierStatusPill(status: string): React.ReactNode {
  if (status === "EXCEPTION") {
    return (
      <span className="ml-1.5 inline-block rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-900">
        Novedad
      </span>
    );
  }
  if (status === "RETURNED") {
    return (
      <span className="ml-1.5 inline-block rounded bg-rose-100 px-1.5 py-0.5 text-[10px] font-semibold text-rose-900">
        Devolución
      </span>
    );
  }
  if (status === "DELIVERED") {
    return (
      <span className="ml-1.5 inline-block rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-900">
        Entregado
      </span>
    );
  }
  return null;
}

function ActiveCarrierIncidentCallout({
  orderStatus,
  latestEvent,
}: Readonly<{
  orderStatus: string;
  latestEvent: AdminShipmentEventRow | undefined;
}>) {
  if (!latestEvent) return null;
  if (!["PAID", "FULFILLING", "SHIPPED"].includes(orderStatus)) return null;

  if (latestEvent.status === "EXCEPTION") {
    return (
      <div className="mb-3 rounded-lg border border-amber-200 bg-amber-50/80 p-3">
        <p className="text-[11px] font-bold text-amber-900">
          ⚠️ Novedad en ruta (EXCEPTION) · {formatDateTimeCO(latestEvent.occurredAt)}
        </p>
        <p className="mt-0.5 text-[11px] font-medium text-amber-950">
          {latestEvent.carrierStatusRaw}
          {latestEvent.description ? ` — ${latestEvent.description}` : ""}
        </p>
        <p className="mt-1 text-[10px] text-amber-800">
          El paquete sigue con la transportadora (suele salir a reintento el siguiente día hábil).
          Revisa en Aveonline solo si requiere aclarar dirección/teléfono. No activa reconciliación
          de pago.
        </p>
      </div>
    );
  }

  if (latestEvent.status === "RETURNED") {
    return (
      <div className="mb-3 rounded-lg border border-rose-200 bg-rose-50/80 p-3">
        <p className="text-[11px] font-bold text-rose-900">
          ↩️ Devolución confirmada a origen (RETURNED) · {formatDateTimeCO(latestEvent.occurredAt)}
        </p>
        <p className="mt-0.5 text-[11px] font-medium text-rose-950">
          {latestEvent.carrierStatusRaw}
          {latestEvent.description ? ` — ${latestEvent.description}` : ""}
        </p>
        <p className="mt-1 text-[10px] text-rose-800">
          La transportadora confirmó devolución hacia Lucams. Gestiona reenvío, reposición o
          reembolso desde Reconciliación / Acciones operativas.
        </p>
      </div>
    );
  }

  return null;
}

function ShipmentCarrierTimeline({
  orderStatus,
  shipmentEvents,
}: Readonly<{
  orderStatus: string;
  shipmentEvents: AdminShipmentEventRow[];
}>) {
  const latestEvent = shipmentEvents[shipmentEvents.length - 1];
  return (
    <div className="border-brand-purple/10 mt-3 border-t pt-3">
      <ActiveCarrierIncidentCallout orderStatus={orderStatus} latestEvent={latestEvent} />
      <p className="text-brand-muted mb-2 text-[10px] font-semibold tracking-wider uppercase">
        Movimientos de la guía
      </p>
      <ol className="space-y-2">
        {[...shipmentEvents].reverse().map((ev) => (
          <li key={ev.id} className="text-[11px] leading-snug">
            <span className="text-brand-purple-dark font-semibold">
              {formatDateTimeCO(ev.occurredAt)}
            </span>
            <span className="text-brand-purple-dark/80"> — {ev.carrierStatusRaw}</span>
            {carrierStatusPill(ev.status)}
            {ev.description && <span className="text-brand-muted"> · {ev.description}</span>}
          </li>
        ))}
      </ol>
    </div>
  );
}

function Card({
  icon,
  title,
  children,
}: Readonly<{
  icon: React.ReactNode;
  title: string;
  children: React.ReactNode;
}>) {
  return (
    <section className="border-brand-purple/10 rounded-xl border bg-white p-5 shadow-sm">
      <h2 className="text-brand-purple-dark mb-3 flex items-center gap-2 text-sm font-bold">
        {icon}
        {title}
      </h2>
      {children}
    </section>
  );
}

function Row({ label, value }: Readonly<{ label: string; value: React.ReactNode }>) {
  return (
    <div className="flex items-start justify-between gap-3 py-1">
      <dt className="text-brand-muted text-xs">{label}</dt>
      <dd className="text-brand-purple-dark text-right text-xs font-medium">{value}</dd>
    </div>
  );
}
