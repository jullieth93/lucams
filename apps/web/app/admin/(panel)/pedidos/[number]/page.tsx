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
import { getProductionAssetSignedUrls } from "@/lib/storage";
import { LUCAMS_CARRIER, carrierDisplayName } from "@/features/shipping/lucams-shipping";
import {
  parseShipmentLastError,
  suggestShipmentFailureCause,
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

export default async function AdminPedidoDetallePage({
  params,
}: {
  params: Promise<{ number: string }>;
}) {
  const session = await requireRole(ADMIN_ROLE_SETS.ALL);
  const role = session.admin.role;

  const { number } = await params;
  const order = await getOrderForActor(decodeURIComponent(number), role);
  if (!order) notFound();

  const encodedOrderNum = encodeURIComponent(order.number);
  const canReadPii = hasCapability(role, "orders:read_pii");
  const canRead360 = canAccessAdminPath(role, "/admin/clientes");
  const canSeeMoney = canSeeOrderCommercialBreakdown(role);
  const canSeeCodTotal = canSeeOrderCodCollectionAmount(role);
  const canDownloadProduction = canAccessAdminPath(
    role,
    `/admin/pedidos/${encodedOrderNum}/produccion`,
  );
  const canManageRenders = canManageOrderRenderJobs(role);
  const canModerate = canAccessAdminPath(role, "/admin/moderacion");
  const canPrepare = canTransitionOrderTo(role, "FULFILLING");
  const canDispatch = canTransitionOrderTo(role, "SHIPPED");
  const canCancelRole = canTransitionOrderTo(role, "CANCELLED");
  const canReconcile = hasCapability(role, "orders:reconcile");
  const canBlockAddress = hasCapability(role, "finance:reconcile_cod");
  const canRefund = role === "SUPERADMIN";
  const canPrintGuide = canAccessAdminPath(role, `/admin/pedidos/${encodedOrderNum}/guia`);
  const canManageTasks = hasCapability(role, "crm:manage_tasks");
  const canManageActivities = hasCapability(role, "crm:manage_activities");
  const canViewActivities = canRead360 && canReadPii;
  const canViewCatalog = canAccessAdminPath(role, "/admin/productos");

  const [crmTasks, crmActivities, assignableAdmins, statusEvents, complementary] =
    await Promise.all([
      listTasksForEntity({ orderId: order.id }),
      canViewActivities && order.contactId
        ? listActivitiesForEntity({ orderId: order.id })
        : Promise.resolve([]),
      canManageTasks ? listAssignableCrmAdmins() : Promise.resolve([]),
      prisma.orderStatusEvent.findMany({
        where: { orderId: order.id },
        orderBy: { createdAt: "asc" },
      }),
      getOrderComplementaryContextForActor(order.id, order.number, order.paymentMethod, role),
    ]);

  const shipmentEvents = order.trackingNumber ? await listShipmentEvents(order.id) : [];

  const orderBuyerIsStaff = order.contactId
    ? ((
        await prisma.$queryRaw<Array<{ staff: boolean }>>`
          SELECT (c."isStaff" OR EXISTS (
            SELECT 1
            FROM "AdminUser" au
            WHERE au."isActive" = TRUE
              AND au."deletedAt" IS NULL
              AND LOWER(au."email") = LOWER(COALESCE(c."primaryEmail", ''))
          )) AS staff
          FROM "Contact" c
          WHERE c."id" = ${order.contactId} AND c."deletedAt" IS NULL
        `
      )[0]?.staff ?? false)
    : false;

  const productionPaths = order.items.flatMap((it) => it.design?.productionUrls ?? []);
  const signedProduction = canDownloadProduction
    ? await getProductionAssetSignedUrls(productionPaths)
    : new Map<string, string>();

  const labelSignedUrl =
    canPrintGuide && order.labelPath
      ? ((await getProductionAssetSignedUrls([order.labelPath], 900)).get(order.labelPath) ?? null)
      : null;

  const hasProduction = productionPaths.length > 0;
  const productionItems = order.items.filter((it) => (it.design?.productionUrls?.length ?? 0) > 0);
  const customDesignItems = order.items.filter((it) => Boolean(it.design));
  let approvedPieceCount = 0;
  let unapprovedPieceCount = 0;
  for (const it of productionItems) {
    const pieceCount = it.design?.productionUrls?.length ?? 0;
    if (it.design?.moderationStatus === "APPROVED") approvedPieceCount += pieceCount;
    else unapprovedPieceCount += pieceCount;
  }
  const hasUnapproved = unapprovedPieceCount > 0;

  const ship = order.shippingAddress as ShippingAddrSnapshot;
  const deliveryNote = order.notes?.trim() || ship.notes?.trim() || null;
  const isInternalDelivery = order.shippingCarrier === LUCAMS_CARRIER;
  const lucamsSettings = isInternalDelivery ? await getLucamsShippingSettings() : null;
  const internalPromiseDays =
    isInternalDelivery && lucamsSettings
      ? lucamsDeliveryDays({
          maxProductionDays: maxProductionDaysOf(
            order.items.map((it) => it.variant.product.productionDays),
          ),
          cutoffHour: lucamsSettings.cutoffHour,
          now: order.createdAt,
        })
      : null;
  const internalEstimate =
    internalPromiseDays === null ? null : formatLucamsDeliveryEstimate(internalPromiseDays);
  const statusLabel =
    isInternalDelivery && order.status === "SHIPPED"
      ? "En ruta"
      : (STATUS_LABEL[order.status] ?? order.status);
  const isSimulatedTracking = order.trackingNumber?.startsWith("TEST-") ?? false;
  const shipmentLastError = order.trackingNumber
    ? null
    : parseShipmentLastError(order.shipmentLastError);
  const canRetryShipment =
    canRetryOrderShipment(role) &&
    !isInternalDelivery &&
    (order.status === "PAID" || (order.status === "FULFILLING" && !order.trackingNumber));

  const customerWa = canReadPii
    ? customerWaLink(
        order.phone,
        `Hola ${ship.fullName ?? ""}, te escribo de Lucams por tu pedido ${order.number}. `,
      )
    : null;

  // Conexiones 360° verificadas estrictamente con canAccessAdminPath(role, href)
  const contactProfileHref =
    canRead360 && order.contactId
      ? `/admin/clientes/${encodeURIComponent(order.contactId)}`
      : canRead360 && canReadPii && order.customer?.email
        ? `/admin/clientes?q=${encodeURIComponent(order.customer.email)}`
        : null;

  const warrantyClaims = order.items.flatMap((it) => it.warrantyClaims ?? []);
  const retractRequests = order.items
    .map((it) => it.retractRequest)
    .filter((r): r is NonNullable<typeof r> => Boolean(r));

  const ecosystemLinks: Array<{
    key: string;
    label: string;
    detail: string;
    href: string;
    tone: "purple" | "amber" | "emerald" | "rose" | "turquoise" | "slate";
  }> = [];

  if (contactProfileHref) {
    ecosystemLinks.push({
      key: "contact-360",
      label: "Ficha Contacto 360",
      detail: orderBuyerIsStaff ? "Perfil interno del equipo" : "Historial unificado del cliente",
      href: contactProfileHref,
      tone: "purple",
    });
  }

  if (customDesignItems.length > 0 && canModerate) {
    const pendingModCount = customDesignItems.filter(
      (it) => it.design?.moderationStatus === "PENDING",
    ).length;
    const rejectedModCount = customDesignItems.filter(
      (it) => it.design?.moderationStatus === "REJECTED",
    ).length;
    ecosystemLinks.push({
      key: "moderation",
      label: "Moderación de diseños",
      detail:
        pendingModCount > 0
          ? `${pendingModCount} pendiente(s) de aprobar`
          : rejectedModCount > 0
            ? `${rejectedModCount} rechazado(s)`
            : `${customDesignItems.length} aprobado(s)`,
      href:
        pendingModCount > 0
          ? `/admin/moderacion?q=${encodedOrderNum}`
          : `/admin/moderacion?vista=historial&q=${encodedOrderNum}`,
      tone: pendingModCount > 0 ? "amber" : rejectedModCount > 0 ? "rose" : "emerald",
    });
  }

  if (
    canSeeMoney &&
    order.coupon &&
    canAccessAdminPath(role, `/admin/cupones/${order.coupon.id}`)
  ) {
    ecosystemLinks.push({
      key: "coupon",
      label: `Cupón ${order.coupon.code}`,
      detail: order.discount > 0 ? `Descuento ${formatCOP(order.discount)}` : "Cupón aplicado",
      href: `/admin/cupones/${encodeURIComponent(order.coupon.id)}`,
      tone: "turquoise",
    });
  }

  if (order.paymentMethod === "COD" && canAccessAdminPath(role, "/admin/finanzas/conciliacion")) {
    const reconMeta = order.codReconciliation
      ? COD_RECON_LABEL[order.codReconciliation.status]
      : null;
    ecosystemLinks.push({
      key: "cod-recon",
      label: "Conciliación contraentrega",
      detail: reconMeta ? reconMeta.label : "Sin remesa registrada aún",
      href: reconMeta
        ? `/admin/finanzas/conciliacion?filter=${reconMeta.filter}`
        : "/admin/finanzas/conciliacion",
      tone: reconMeta ? reconMeta.tone : "slate",
    });
  }

  if (order.paymentMethod === "COD" && canAccessAdminPath(role, "/admin/finanzas/bloqueos")) {
    ecosystemLinks.push({
      key: "cod-blocks",
      label: "Bloqueos anti-abuso COD",
      detail: order.noShowAt ? "Marcado no recibido" : "Gestionar lista de vetos",
      href: "/admin/finanzas/bloqueos",
      tone: order.noShowAt ? "amber" : "slate",
    });
  }

  for (const opp of order.convertedOpportunities ?? []) {
    const oppHref = `/admin/oportunidades/${encodeURIComponent(opp.id)}`;
    if (canAccessAdminPath(role, oppHref)) {
      ecosystemLinks.push({
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
      ecosystemLinks.push({
        key: `ticket-${tk.id}`,
        label: "Ticket de soporte",
        detail: `${TICKET_STATUS_LABEL[tk.status] ?? tk.status} · ${tk.subject}`,
        href: tkHref,
        tone: tk.status === "CLOSED" ? "slate" : "amber",
      });
    }
  }

  if (warrantyClaims.length > 0 && canAccessAdminPath(role, "/admin/garantias")) {
    const latestWarranty = warrantyClaims[0]!;
    ecosystemLinks.push({
      key: "warranty",
      label: `Garantías (${warrantyClaims.length})`,
      detail: `Último estado: ${latestWarranty.status}`,
      href: `/admin/garantias?status=${encodeURIComponent(latestWarranty.status)}`,
      tone:
        latestWarranty.status === "RESOLVED"
          ? "emerald"
          : latestWarranty.status === "REJECTED"
            ? "slate"
            : "amber",
    });
  }

  if (retractRequests.length > 0 && canAccessAdminPath(role, "/admin/retractos")) {
    const latestRetract = retractRequests[0]!;
    ecosystemLinks.push({
      key: "retract",
      label: `Retractos (${retractRequests.length})`,
      detail: `Estado: ${latestRetract.status}`,
      href: `/admin/retractos?status=${encodeURIComponent(latestRetract.status)}`,
      tone:
        latestRetract.status === "REFUNDED"
          ? "emerald"
          : latestRetract.status === "REJECTED"
            ? "slate"
            : "rose",
    });
  }

  return (
    <AdminPage>
      <AdminPageHeader
        icon={<Box className="h-5 w-5" />}
        title={order.number}
        subtitle={
          <span className="flex flex-wrap items-center gap-2">
            <AdminBadge tone={STATUS_TONE[order.status] ?? "slate"}>{statusLabel}</AdminBadge>
            <span>· creado {formatDateTimeCO(order.createdAt)}</span>
            {order.deliveredAt && <span>· entregado {formatDateTimeCO(order.deliveredAt)}</span>}
            {!canReadPii && (
              <Hint content="Por privacidad (Ley 1581), los datos de contacto y dirección exacta vienen protegidos desde el servidor para tu rol.">
                <span className="border-brand-purple/20 bg-brand-cream text-brand-purple-dark inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[11px] font-semibold">
                  <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" />
                  Datos personales protegidos
                </span>
              </Hint>
            )}
          </span>
        }
        breadcrumbs={[
          { label: "Inicio", href: "/admin/dashboard" },
          { label: "Pedidos", href: "/admin/pedidos" },
          { label: order.number },
        ]}
      />

      <AdminPageBody>
        {/* Stepper ejecutivo del ciclo de vida del pedido */}
        <OrderLifecycleStepper
          status={order.status}
          isInternalDelivery={isInternalDelivery}
          createdAt={order.createdAt}
          deliveredAt={order.deliveredAt}
          refundedAt={order.refundedAt}
        />

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          {/* Columna principal */}
          <div className="space-y-4 lg:col-span-2">
            {/* Ítems */}
            <Card icon={<Package className="h-4 w-4" />} title={`Ítems (${order.items.length})`}>
              {hasProduction && canDownloadProduction && (
                <div className="border-brand-purple/10 bg-brand-cream/40 mb-3 flex flex-wrap items-center justify-between gap-2 rounded-lg border px-3 py-2.5">
                  <div className="min-w-0">
                    <div className="text-brand-purple-dark text-xs font-bold">
                      Archivos de impresión 300 DPI
                    </div>
                    <div className="text-brand-muted text-[11px]">
                      {productionPaths.length} pieza(s) ·{" "}
                      <span className="text-emerald-700">
                        {approvedPieceCount} listas para imprimir
                      </span>
                      {hasUnapproved && (
                        <span className="ml-1 font-semibold text-amber-700">
                          · {unapprovedPieceCount} pendiente(s) de aprobación
                        </span>
                      )}
                    </div>
                    {hasUnapproved && canModerate && (
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
                {order.items.map((it) => {
                  const previewRef = it.designAssetUrl ?? it.design?.previewUrl ?? null;
                  const previewUrl = previewRef ? previewRefToAuthorizedUrl(previewRef) : null;
                  const variantBreakdown = describeVariantAttributes(
                    parseVariantAttributes(it.variant.attributes),
                    it.variant.product.personalizationSchema,
                  );
                  const productionSpec = it.design
                    ? resolveProductionSpec({
                        personalizationKind: it.variant.product.personalizationKind,
                        productSchema: jsonRecord(it.variant.product.personalizationSchema),
                        variantAttrs: jsonRecord(it.variant.attributes),
                        physicalSpecs: jsonRecord(it.variant.product.physicalSpecs),
                        canvasData: jsonRecord(it.design.canvasData),
                        designMetadata: jsonRecord(it.design.metadata),
                        productionUrls: it.design.productionUrls,
                        lineQty: it.qty,
                      })
                    : null;
                  const productionGroups =
                    it.design && it.design.productionUrls.length > 0
                      ? productionPieceGroups({
                          personalizationKind: it.variant.product.personalizationKind,
                          canvasData: jsonRecord(it.design.canvasData),
                          designMetadata: jsonRecord(it.design.metadata),
                          productionCount: it.design.productionUrls.length,
                          productSchema: jsonRecord(it.variant.product.personalizationSchema),
                          startMonth:
                            typeof jsonRecord(it.variant.product.personalizationSchema)
                              ?.startMonth === "number"
                              ? (jsonRecord(it.variant.product.personalizationSchema)!
                                  .startMonth as number)
                              : undefined,
                        })
                      : null;
                  const galleryPieces = (it.design?.productionUrls ?? [])
                    .map((path, i) => {
                      const url = signedProduction.get(path);
                      if (!url) return null;
                      const groupLabel = productionGroups
                        ?.flatMap((g) => g.pieces)
                        .find((p) => p.index === i)?.label;
                      const displayLabel =
                        groupLabel ??
                        (productionSpec
                          ? productionPieceLabel(i, productionSpec)
                          : `Pieza ${String(i + 1).padStart(2, "0")}`);
                      return {
                        index: i,
                        label: displayLabel,
                        url,
                        downloadName: `${order.number}-pieza-${String(i + 1).padStart(2, "0")}.png`,
                        approved: it.design?.moderationStatus === "APPROVED",
                      };
                    })
                    .filter((p): p is NonNullable<typeof p> => p !== null);
                  const galleryGroups = productionGroups
                    ? productionGroups.map((g) => ({
                        key: g.key,
                        title: g.title,
                        note: g.note,
                        pieceIndexes: g.pieces.map((p) => p.index),
                      }))
                    : null;

                  const productHref = canViewCatalog
                    ? `/admin/productos/${encodeURIComponent(it.variant.productId)}`
                    : null;

                  const jobProgressPct =
                    it.design?.renderJob && it.design.renderJob.totalUnits > 0
                      ? Math.min(
                          100,
                          Math.round(
                            (it.design.renderJob.doneUnits / it.design.renderJob.totalUnits) * 100,
                          ),
                        )
                      : 0;

                  return (
                    <li key={it.id} className="flex items-start gap-3 py-3">
                      <div className="bg-brand-purple/5 relative h-16 w-16 flex-shrink-0 overflow-hidden rounded-lg p-1">
                        {previewUrl ? (
                          <Image
                            src={previewUrl}
                            alt=""
                            fill
                            sizes="64px"
                            className="object-contain"
                            unoptimized
                          />
                        ) : (
                          <div className="text-brand-muted flex h-full w-full items-center justify-center text-xs">
                            sin foto
                          </div>
                        )}
                        <span className="bg-brand-purple-dark/85 absolute top-0 right-0 inline-flex h-5 min-w-5 items-center justify-center rounded-bl-md px-1 text-[10px] font-bold text-white">
                          {it.qty}
                        </span>
                      </div>

                      <div className="min-w-0 flex-1">
                        <div className="text-brand-purple-dark text-sm font-semibold">
                          {productHref ? (
                            <Link
                              href={productHref}
                              className="hover:text-brand-purple hover:underline"
                            >
                              {it.variant.product.name}
                            </Link>
                          ) : (
                            it.variant.product.name
                          )}
                          <span className="text-brand-muted font-normal"> · {it.variant.name}</span>
                        </div>

                        {variantBreakdown.length > 0 && (
                          <div className="text-brand-purple-dark/70 text-xs">
                            {variantBreakdown.join(" · ")}
                          </div>
                        )}

                        <div className="text-brand-muted text-xs">
                          {canSeeMoney ? `${formatCOP(it.unitPrice)} c/u · ` : ""}
                          cant. {it.qty} · <span className="font-mono">{it.variant.sku}</span>
                        </div>

                        {it.design?.productionUrls && it.design.productionUrls.length > 0 ? (
                          <div className="mt-1.5">
                            <div className="text-brand-muted mb-1 flex flex-wrap items-center gap-1.5 text-[11px] font-semibold">
                              Archivos de impresión · {it.design.productionUrls.length} PNG (300
                              DPI)
                              {it.design.moderationStatus === "APPROVED" ? (
                                <span className="rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] font-bold text-emerald-700">
                                  aprobado
                                </span>
                              ) : (
                                <span
                                  className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${
                                    it.design.moderationStatus === "REJECTED"
                                      ? "bg-rose-100 text-rose-700"
                                      : "bg-amber-100 text-amber-700"
                                  }`}
                                >
                                  {it.design.moderationStatus === "REJECTED"
                                    ? "rechazado — no imprimir"
                                    : "sin aprobar en Moderación"}
                                </span>
                              )}
                              {it.design.qualityAcknowledgedAt && (
                                <Hint
                                  content={`Aceptación registrada el ${formatDateTimeCO(it.design.qualityAcknowledgedAt)}`}
                                >
                                  <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold text-amber-700">
                                    ⚠️ aceptó calidad de fotos (
                                    {formatDateTimeCO(it.design.qualityAcknowledgedAt)})
                                  </span>
                                </Hint>
                              )}
                            </div>

                            {productionSpec && (
                              <div className="border-brand-purple/10 bg-brand-cream/30 mb-2 rounded-md border p-2 text-[11px]">
                                <p className="text-brand-purple-dark font-semibold">
                                  {productionSpec.queEsCadaArchivo}
                                </p>
                                {productionSpec.reversosConMarcaAgua.length > 0 && (
                                  <p className="mt-1 font-bold text-amber-800">
                                    Reverso B con marca de agua Lucams (ya viene en el archivo):
                                    unidad(es) {productionSpec.reversosConMarcaAgua.join(", ")}.
                                  </p>
                                )}
                                {canManageRenders &&
                                  productionSpec.formatoFisico.tipo === "lamina-fichas" &&
                                  it.design && (
                                    <RegenLettersetButton
                                      designId={it.design.id}
                                      orderNumber={order.number}
                                    />
                                  )}
                              </div>
                            )}

                            {canDownloadProduction && (
                              <>
                                <ProductionPiecesGallery
                                  pieces={galleryPieces}
                                  groups={galleryGroups}
                                />
                                {galleryPieces.length === 0 && (
                                  <p className="text-brand-muted text-[11px]">
                                    Piezas no disponibles para firma en este momento.
                                  </p>
                                )}
                              </>
                            )}

                            {canManageRenders && it.design.renderJob?.status === "FAILED" && (
                              <RetryRenderJobButton
                                designId={it.design.id}
                                orderNumber={order.number}
                                lastError={it.design.renderJob.error}
                              />
                            )}
                          </div>
                        ) : it.design ? (
                          <div className="text-brand-muted mt-1.5 text-[11px]">
                            {it.design.renderJob &&
                            (it.design.renderJob.status === "PENDING" ||
                              it.design.renderJob.status === "PROCESSING") ? (
                              <div className="max-w-sm space-y-1">
                                <span className="font-semibold text-sky-700">
                                  Preparando archivos 300 DPI… {it.design.renderJob.doneUnits} de{" "}
                                  {it.design.renderJob.totalUnits} piezas ({jobProgressPct}%)
                                </span>
                                <div className="h-1.5 w-full overflow-hidden rounded-full bg-sky-100">
                                  <div
                                    className="admin-bar-grow-x h-full rounded-full bg-sky-600"
                                    style={{ width: `${Math.max(6, jobProgressPct)}%` }}
                                  />
                                </div>
                              </div>
                            ) : it.design.renderJob?.status === "FAILED" && canManageRenders ? (
                              <RetryRenderJobButton
                                designId={it.design.id}
                                orderNumber={order.number}
                                lastError={it.design.renderJob.error}
                              />
                            ) : it.design.renderJob?.status === "FAILED" ? (
                              <span className="font-semibold text-rose-700">
                                Render 300 DPI con error pendiente de reintento por taller.
                              </span>
                            ) : (
                              "Sin archivos de producción todavía (el diseño no está finalizado)."
                            )}
                          </div>
                        ) : null}
                      </div>

                      {canSeeMoney && (
                        <div className="text-brand-purple-dark flex-shrink-0 text-right text-sm font-semibold tabular-nums">
                          {formatCOP(it.unitPrice * it.qty)}
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            </Card>

            {/* Cliente */}
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
                <Row
                  label="Documento"
                  value={
                    ship.documentType && ship.documentNumber
                      ? `${ship.documentType} ${ship.documentNumber}`
                      : "—"
                  }
                />
                <Row
                  label="Perfil cliente"
                  value={
                    contactProfileHref ? (
                      <Link
                        href={contactProfileHref}
                        className="text-brand-purple-dark hover:text-brand-purple font-semibold underline"
                      >
                        Ver ficha Contacto 360 →
                      </Link>
                    ) : order.customer ? (
                      <span className="text-brand-muted">Con cuenta registrada</span>
                    ) : (
                      <span className="text-brand-muted">Compra como invitado</span>
                    )
                  }
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

            {/* Dirección */}
            <Card icon={<MapPin className="h-4 w-4" />} title="Dirección de envío">
              <div className="text-brand-purple-dark text-sm">
                {ship.addressLine1}
                {ship.addressLine2 ? ` · ${ship.addressLine2}` : ""}
              </div>
              <div className="text-brand-muted mt-1 text-xs">
                {ship.city}, {ship.department}
                {ship.localityName ? ` · Localidad ${ship.localityName}` : ""}
                {ship.neighborhood ? ` · Barrio ${ship.neighborhood}` : ""}
                {ship.zip ? ` · ${ship.zip}` : ""}
              </div>
              {deliveryNote && (
                <div className="text-brand-muted mt-2 text-xs italic">Nota: {deliveryNote}</div>
              )}

              {order.recipientName && (
                <div className="border-brand-purple/20 bg-brand-purple/5 mt-3 rounded-md border px-3 py-2">
                  <p className="text-brand-purple-dark text-xs font-bold">
                    🎁 Lo recibe otra persona
                  </p>
                  <p className="text-brand-purple-dark mt-0.5 text-xs">
                    Recibe: <strong>{order.recipientName}</strong>
                    {order.recipientPhone ? ` · Tel ${order.recipientPhone}` : ""} — la guía sale a
                    su nombre.
                  </p>
                  {order.isGift && (
                    <p className="mt-1 text-[11px] font-semibold text-amber-800">
                      Es regalo: empacar SIN factura ni precios visibles.
                    </p>
                  )}
                  {order.isGift && order.giftMessage && (
                    <p className="text-brand-muted mt-1 text-xs italic">
                      Mensaje para la tarjeta: “{order.giftMessage}”
                    </p>
                  )}
                </div>
              )}
            </Card>

            {/* Ecosistema 360° vinculado al pedido (filtrado por rol) */}
            {ecosystemLinks.length > 0 && (
              <Card icon={<Network className="h-4 w-4" />} title="Ecosistema 360° vinculado">
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  {ecosystemLinks.map((link) => (
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
                        <p className="text-brand-muted mt-0.5 truncate text-[11px]">
                          {link.detail}
                        </p>
                      </div>
                      <ArrowUpRight className="text-brand-muted group-hover:text-brand-purple h-4 w-4 flex-shrink-0 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
                    </Link>
                  ))}
                </div>
              </Card>
            )}
          </div>

          {/* Sidebar: reconciliación + finanzas/recaudo + envío + historial + CRM + acciones */}
          <div className="space-y-4 lg:col-span-1">
            {(order.needsReconciliation || order.reconciledAt) && (
              <Card icon={<Undo2 className="h-4 w-4" />} title="Reconciliación">
                {order.needsReconciliation ? (
                  <>
                    <p className="text-[11px] font-bold text-red-800">
                      🔴 Pendiente — requiere gestión manual
                    </p>
                    {order.reconciliationReason && (
                      <p className="mt-1 text-xs text-red-900">{order.reconciliationReason}</p>
                    )}
                    <p className="text-brand-muted mt-1.5 text-[11px]">
                      Cuando lo resuelvas (reembolso en Wompi, reposición de stock, etc.), ciérralo
                      con «Marcar reconciliación como gestionada» en Acciones operativas.
                    </p>
                  </>
                ) : (
                  <>
                    <p className="text-[11px] font-bold text-emerald-800">✔ Gestionada</p>
                    {order.reconciliationReason && (
                      <p className="text-brand-muted mt-1 text-[11px]">
                        Motivo original: {order.reconciliationReason}
                      </p>
                    )}
                    {order.reconciliationNote && (
                      <p className="mt-1 text-xs text-emerald-900">
                        Resolución: {order.reconciliationNote}
                      </p>
                    )}
                    {order.reconciledAt && (
                      <p className="text-brand-muted mt-1 text-[10px]">
                        Cerrada el {formatDateTimeCO(order.reconciledAt)}
                      </p>
                    )}
                  </>
                )}
              </Card>
            )}

            {/* Desglose comercial: completo para finanzas/operaciones/soporte; solo recaudo en Despachos; oculto en Taller */}
            {canSeeMoney ? (
              <>
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
                  </dl>
                </Card>

                {order.status === "REFUNDED" && (
                  <Card icon={<Undo2 className="h-4 w-4" />} title="Reembolso">
                    <Row label="Monto" value={formatCOP(order.refundAmount ?? order.total)} />
                    {order.refundedAt && (
                      <Row label="Fecha" value={formatDateTimeCO(order.refundedAt)} />
                    )}
                    {order.refundReason && <Row label="Motivo" value={order.refundReason} />}
                    <p className="mt-2 text-[11px] text-amber-700">
                      ⚠️ El movimiento de dinero se ejecuta manualmente por Wompi o transferencia.
                    </p>
                  </Card>
                )}

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
                      <p className="text-brand-purple-dark text-xs font-bold">
                        Intentos y transacciones
                      </p>
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
                                  {tx.status
                                    ? (WOMPI_STATUS_LABEL[tx.status] ?? tx.status)
                                    : "Sin verificar"}{" "}
                                  · <span className="font-mono">{tx.externalId}</span>
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
              </>
            ) : canSeeCodTotal ? (
              <Card
                icon={<CreditCard className="h-4 w-4" />}
                title="Condición de entrega y recaudo"
              >
                {order.paymentMethod === "COD" ? (
                  <div className="rounded-lg border border-amber-300 bg-amber-50 p-3">
                    <p className="text-xs font-bold text-amber-900">
                      💵 Contraentrega — cobrar al entregar
                    </p>
                    <p className="font-display mt-1 text-xl font-bold text-amber-950 tabular-nums">
                      {formatCOP(order.total)}
                    </p>
                    <p className="mt-1 text-[11px] text-amber-800">
                      Verifica que el monto coincida en la guía física antes de despachar.
                    </p>
                  </div>
                ) : (
                  <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3">
                    <p className="text-xs font-bold text-emerald-900">
                      ✔ Pagado en línea — no cobrar al entregar
                    </p>
                    <p className="mt-0.5 text-[11px] text-emerald-800">
                      El pago ya fue procesado; entrega el paquete sin recaudar efectivo.
                    </p>
                  </div>
                )}
              </Card>
            ) : null}

            {/* Envío */}
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
                <>
                  <Row
                    label={isInternalDelivery ? "Referencia" : "N° de guía"}
                    value={
                      <span className="text-brand-purple-dark/85 font-mono text-xs">
                        {order.trackingNumber}
                      </span>
                    }
                  />
                  {isInternalDelivery && (
                    <>
                      {ship.localityName && (
                        <Row label="Zona de entrega" value={ship.localityName} />
                      )}
                      {internalEstimate && <Row label="Estimación" value={internalEstimate} />}
                      <p className="text-brand-muted mt-1 text-[10px]">
                        Entrega interna (mensajería propia): marca la salida en ruta y la entrega en
                        Acciones operativas ↓.
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
                  )}
                  {isSimulatedTracking && (
                    <p className="mt-1 text-[10px] text-amber-700">
                      ⚠️ Guía simulada (modo prueba). En producción genera guía real.
                    </p>
                  )}
                  {labelSignedUrl && (
                    <a
                      href={labelSignedUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="bg-brand-purple hover:bg-brand-purple-dark mt-2 inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold text-white transition-colors"
                    >
                      📄 Descargar etiqueta PDF
                    </a>
                  )}
                  {order.trackingUrl && (
                    <a
                      href={order.trackingUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-brand-purple mt-2 block text-xs underline"
                    >
                      {labelSignedUrl
                        ? "Ver guía en Aveonline (enlace externo, puede expirar) →"
                        : "Ver guía en Aveonline →"}
                    </a>
                  )}
                  {order.labelUrl && (
                    <a
                      href={order.labelUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={`mt-1 block text-xs underline ${
                        labelSignedUrl ? "text-brand-muted" : "text-brand-purple"
                      }`}
                    >
                      {labelSignedUrl
                        ? "Etiqueta en Aveonline (respaldo externo) →"
                        : "Descargar etiqueta PDF →"}
                    </a>
                  )}
                  {shipmentEvents.length > 0 && (
                    <div className="border-brand-purple/10 mt-3 border-t pt-3">
                      <p className="text-brand-muted mb-2 text-[10px] font-semibold tracking-wider uppercase">
                        Movimientos de la guía
                      </p>
                      <ol className="space-y-2">
                        {[...shipmentEvents].reverse().map((ev) => (
                          <li key={ev.id} className="text-[11px] leading-snug">
                            <span className="text-brand-purple-dark font-semibold">
                              {formatDateTimeCO(ev.occurredAt)}
                            </span>
                            <span className="text-brand-purple-dark/80">
                              {" "}
                              — {ev.carrierStatusRaw}
                            </span>
                            {ev.description && (
                              <span className="text-brand-muted"> · {ev.description}</span>
                            )}
                          </li>
                        ))}
                      </ol>
                    </div>
                  )}
                </>
              ) : (
                <>
                  <p className="text-brand-muted text-xs">Sin guía generada todavía</p>
                  {!isInternalDelivery && !shipmentLastError && canRetryShipment && (
                    <p className="text-brand-muted mt-1 text-[11px]">
                      Créala con el botón «Generar guía Aveonline» en Acciones operativas ↓.
                    </p>
                  )}
                  {shipmentLastError && !isInternalDelivery && (
                    <div className="mt-2 rounded-lg border border-rose-200 bg-rose-50/60 p-3">
                      <p className="text-[11px] font-bold text-rose-800">
                        Último error de la transportadora
                        {shipmentLastError.at &&
                          ` · ${formatDateTimeCO(new Date(shipmentLastError.at))}`}
                      </p>
                      <p className="mt-1 font-mono text-[11px] break-words text-rose-900">
                        {shipmentLastError.message}
                      </p>
                      {(shipmentLastError.destination.city ||
                        shipmentLastError.destination.department) && (
                        <p className="text-brand-muted mt-1 text-[10px]">
                          Destino:{" "}
                          {[
                            shipmentLastError.destination.city,
                            shipmentLastError.destination.department,
                          ]
                            .filter(Boolean)
                            .join(", ")}
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
                          Acción sugerida: reintenta con «Generar guía Aveonline» en Acciones
                          operativas ↓.
                        </p>
                      )}
                    </div>
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
              )}
            </Card>

            {/* Historial del pedido */}
            {statusEvents.length > 0 && (
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
                          {ev.fromStatus === null
                            ? "Pedido creado"
                            : `${(STATUS_LABEL[ev.fromStatus] ?? ev.fromStatus) as string} → ${(STATUS_LABEL[ev.toStatus] ?? ev.toStatus) as string}`}
                        </span>
                        <span className="text-brand-muted">
                          · {SOURCE_LABEL[ev.source] ?? ev.source}
                        </span>
                      </div>
                      {ev.note && (
                        <p className="text-brand-muted mt-0.5 text-[11px] italic">“{ev.note}”</p>
                      )}
                      <p className="text-brand-muted mt-0.5 text-[10px]">
                        {formatDateTimeCO(ev.createdAt)}
                      </p>
                    </li>
                  ))}
                </ol>
              </Card>
            )}

            {/* Tareas operativas y seguimiento CRM del pedido */}
            <CrmWorkspacePanel
              title="Tareas y seguimiento del pedido"
              contactId={canViewActivities ? order.contactId : null}
              orderId={order.id}
              orderNumber={order.number}
              currentAdminId={session.admin.id}
              canManageTasks={canManageTasks}
              canViewActivities={canViewActivities && Boolean(order.contactId)}
              canManageActivities={canManageActivities && Boolean(order.contactId)}
              tasks={crmTasks}
              activities={crmActivities}
              assignableAdmins={assignableAdmins}
              compact
            />

            {/* Acciones segregadas por etapa */}
            <OrderActions
              orderId={order.id}
              orderStatus={order.status}
              hasTracking={Boolean(order.trackingNumber)}
              paymentMethod={order.paymentMethod}
              isNoShow={Boolean(order.noShowAt)}
              hasAddressKey={complementary.hasBlockableCodAddress}
              isInternalDelivery={isInternalDelivery}
              needsReconciliation={order.needsReconciliation}
              canPrepare={canPrepare}
              canDispatch={canDispatch}
              canCancelRole={canCancelRole}
              canReconcile={canReconcile}
              canBlockAddress={canBlockAddress}
              canRefund={canRefund}
            />
          </div>
        </div>
      </AdminPageBody>
    </AdminPage>
  );
}

const LIFECYCLE_STEPS = [
  { key: "PENDING_PAYMENT", label: "Esperando pago" },
  { key: "PAID", label: "Pagado" },
  { key: "FULFILLING", label: "En preparación" },
  { key: "SHIPPED", label: "Enviado" },
  { key: "DELIVERED", label: "Entregado" },
] as const;

function OrderLifecycleStepper({
  status,
  isInternalDelivery,
  createdAt,
  deliveredAt,
  refundedAt,
}: {
  status: string;
  isInternalDelivery: boolean;
  createdAt: Date;
  deliveredAt?: Date | null;
  refundedAt?: Date | null;
}) {
  if (status === "CANCELLED" || status === "REFUNDED") {
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

  const activeIdx = Math.max(
    0,
    LIFECYCLE_STEPS.findIndex((s) => s.key === status),
  );
  const pct = Math.round((activeIdx / (LIFECYCLE_STEPS.length - 1)) * 100);

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
          return (
            <div key={step.key} className="flex flex-col items-center text-center">
              <span
                className={`flex h-6 w-6 items-center justify-center rounded-full text-[11px] font-bold transition-all ${
                  isDone
                    ? "bg-emerald-600 text-white"
                    : isCurrent
                      ? "bg-brand-purple ring-brand-purple/25 text-white ring-4"
                      : "bg-slate-100 text-slate-400"
                }`}
              >
                {isDone ? <Check className="h-3.5 w-3.5" /> : idx + 1}
              </span>
              <span
                className={`mt-1.5 text-[11px] leading-tight font-semibold ${
                  isDone
                    ? "text-emerald-800"
                    : isCurrent
                      ? "text-brand-purple-dark"
                      : "text-slate-400"
                }`}
              >
                {stepLabel}
              </span>
            </div>
          );
        })}
      </div>
      <div className="mt-2.5 h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
        <div
          className="admin-bar-grow-x from-brand-purple h-full rounded-full bg-gradient-to-r to-emerald-500"
          style={{ width: `${status === "DELIVERED" ? 100 : Math.max(8, pct)}%` }}
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

function Card({
  icon,
  title,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  children: React.ReactNode;
}) {
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

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3 py-1">
      <dt className="text-brand-muted text-xs">{label}</dt>
      <dd className="text-brand-purple-dark text-right text-xs font-medium">{value}</dd>
    </div>
  );
}
