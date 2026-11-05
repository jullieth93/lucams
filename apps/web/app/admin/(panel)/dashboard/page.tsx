/*
 * Panel admin — Dashboard (rediseño brand 2026-05-18).
 *
 * Estructura:
 *   - Hero: saludo con name + tagline + chip alerta si hay pendientes
 *   - Operaciones: OpsCards (Por producir, Agotadas, Stock bajo, Reseñas
 *     pendientes, Tickets de soporte, Reclamos de garantía) — urgentes si >0
 *   - Negocio: 4 KpiCards (Clientes con trend del mes, Productos,
 *     Sub-categorías, Cupones vigentes)
 *   - Acceso rápido: QuickLinks (catálogo, cupones, contenido, ajustes)
 *   - Diseños del Estudio: QuickLinks (plantillas, fichas, prediseñados)
 *   - Trazabilidad: QuickLinks (auditoría, ajustes del sitio)
 *
 * Datos: Prisma queries en paralelo. Soft-delete filtrado.
 */

import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import type { LucideIcon } from "lucide-react";
import {
  LayoutDashboard,
  Zap,
  ShoppingBag,
  Layers,
  Tag,
  Ticket,
  BookOpen,
  Activity,
  Settings,
  Cog,
  Box,
  AlertCircle,
  AlertTriangle,
  Star,
  LifeBuoy,
  ShieldCheck,
  ShieldAlert,
  Undo2,
  Printer,
  Scale,
  Shapes,
  LayoutTemplate,
  HeartPulse,
  ArrowRight,
} from "lucide-react";
import {
  AdminPage,
  AdminPageHeader,
  AdminPageBody,
  AdminCard,
  AdminComboBarLineChart,
  AdminDeltaPill,
  AdminNotice,
  OpsCard,
  KpiCard,
  QuickLink,
} from "@/components/admin-page";
import { getCurrentAdmin } from "@/lib/auth";
import { canAccessAdminPath, hasCapability } from "@/lib/admin-rbac";
import { prisma } from "@/lib/db";
import { formatCOP } from "@/lib/format";
import { isCatalogMode } from "@/lib/store-mode";
import { getPeriodAggregates } from "@/features/finanzas/service";
import { getInventorySummary } from "@/features/products/inventory-service";
import { countOpenSupportTickets } from "@/features/support/admin-service";
import { countOpenWarrantyClaims } from "@/features/warranty/service";
import { countOrdersNeedingReconciliation } from "@/features/orders/service";
import { countPendingModeration } from "@/features/moderation/service";
import { countOpenRetractRequests } from "@/features/retract/service";

export const metadata: Metadata = {
  title: "Dashboard",
};

export default async function AdminDashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ denied?: string }>;
}) {
  const session = await getCurrentAdmin();
  if (!session) redirect("/admin/login");
  // #28 — el guard RBAC redirige aquí con ?denied=1; hasta ahora nada explicaba el porqué.
  const denied = (await searchParams).denied === "1";

  // H1 (veredicto UX) — la tarjeta de pedidos cuenta los PAGADOS listos para
  // producción (PAID + FULFILLING): ese es el trabajo real de Lucy.
  // PENDING_PAYMENT ("esperando pago" = acción del cliente) queda solo como
  // dato secundario en la descripción de la tarjeta.
  // Lucy 2026-06-26 — antes orderCount era count total, mostraba ruido en KPI.
  const pendingOrdersWhere = {
    deletedAt: null,
    status: "PENDING_PAYMENT" as const,
  };

  // Trend real del KPI Clientes: altas del mes en curso (el resto de KPIs son
  // conteos de catálogo — "total acumulado" es su trend honesto).
  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);

  const role = session.admin.role;
  const showCommercialPulse = !isCatalogMode() && canAccessAdminPath(role, "/admin/metricas");

  const [
    customerCount,
    newCustomersThisMonth,
    productionOrderCount,
    pendingOrderCount,
    productCount,
    pendingReviews,
    ocasionCount,
    activeCouponCount,
    subCategoryCount,
    inventorySummary,
    openTickets,
    openWarranty,
    reconciliationOrders,
    pendingModeration,
    openRetracts,
    failedRenderJobs,
    pulse7d,
  ] = await Promise.all([
    prisma.customer.count({ where: { deletedAt: null } }),
    prisma.customer.count({ where: { deletedAt: null, createdAt: { gte: monthStart } } }),
    prisma.order.count({
      where: { deletedAt: null, status: { in: ["PAID", "FULFILLING"] } },
    }),
    prisma.order.count({ where: pendingOrdersWhere }),
    prisma.product.count({ where: { deletedAt: null } }),
    prisma.review.count({ where: { isApproved: false, deletedAt: null } }),
    prisma.ocasionTag.count({ where: { deletedAt: null, isActive: true } }),
    prisma.coupon.count({
      where: {
        deletedAt: null,
        isActive: true,
        validFrom: { lte: new Date() },
        validTo: { gte: new Date() },
      },
    }),
    prisma.category.count({ where: { deletedAt: null, parentId: { not: null } } }),
    // Lucy 2026-06-26 — Opción C Sprint 1: KPI real de inventario reemplaza
    // los hardcoded `0` que mentían sobre stock y reclamos.
    getInventorySummary(),
    countOpenSupportTickets(),
    countOpenWarrantyClaims(),
    countOrdersNeedingReconciliation(),
    countPendingModeration(),
    countOpenRetractRequests(),
    prisma.renderJob.count({
      where: {
        status: "FAILED",
        design: {
          orderItems: {
            some: { order: { deletedAt: null, status: { in: ["PAID", "FULFILLING"] } } },
          },
        },
      },
    }),
    showCommercialPulse ? getPeriodAggregates("7d") : Promise.resolve(null),
  ]);

  // Lucy 2026-06-26 hotfix #2 P0-12: el saludo antes mostraba "Hola, crittan01"
  // (username del email) — violaba el mandato admin no-técnico. Ahora derivamos
  // un nombre legible quitando dígitos trailing y separadores; si queda algo
  // raro o muy corto, fallback "Hola 👋" sin nombre.
  const displayName = deriveAdminDisplayName(session.admin.email);

  type OpsCardDef = {
    href: string;
    icon: LucideIcon;
    label: string;
    value: number;
    description: string;
    tone: "purple" | "amber" | "coral" | "pink" | "turquoise";
    urgent: boolean;
    countInHeaderAlert?: boolean;
    visible?: boolean;
  };

  const allOpsCards: OpsCardDef[] = [
    {
      href: "/admin/pedidos",
      icon: Box,
      label: "Por producir / enviar",
      value: productionOrderCount,
      description:
        productionOrderCount > 0
          ? `Pagados listos para producir${pendingOrderCount > 0 ? ` · ${pendingOrderCount} esperando pago` : ""}`
          : "Sin pedidos por producir",
      tone: "purple",
      urgent: productionOrderCount > 0,
      countInHeaderAlert: true,
    },
    {
      href: "/admin/pedidos?atencion=1",
      icon: Scale,
      label: "Por reconciliar",
      value: reconciliationOrders,
      description:
        reconciliationOrders > 0
          ? "Pagos o devoluciones que requieren revisión"
          : "Sin anomalías por reconciliar",
      tone: "coral",
      urgent: reconciliationOrders > 0,
      countInHeaderAlert: true,
      // Reconciliación manual exige orders:reconcile en markOrderReconciledAction.
      visible: hasCapability(role, "orders:reconcile"),
    },
    {
      href: "/admin/moderacion",
      icon: ShieldAlert,
      label: "Diseños por moderar",
      value: pendingModeration,
      description:
        pendingModeration > 0 ? "Aprobar antes de imprimir y despachar" : "Sin diseños pendientes",
      tone: "amber",
      urgent: pendingModeration > 0,
      countInHeaderAlert: true,
    },
    {
      href: "/admin/pedidos",
      icon: Printer,
      label: "Renders 300 DPI fallidos",
      value: failedRenderJobs,
      description:
        failedRenderJobs > 0 ? "Reintentar generación en el pedido" : "Archivos de taller al día",
      tone: "coral",
      urgent: failedRenderJobs > 0,
      countInHeaderAlert: true,
      visible: hasCapability(role, "orders:transition"),
    },
    {
      href: "/admin/soporte",
      icon: LifeBuoy,
      label: "Tickets de soporte",
      value: openTickets,
      description: openTickets > 0 ? "Clientes esperan respuesta" : "Sin tickets abiertos",
      tone: "turquoise",
      urgent: openTickets > 0,
      countInHeaderAlert: true,
    },
    {
      href: "/admin/retractos",
      icon: Undo2,
      label: "Retractos activos",
      value: openRetracts,
      description:
        openRetracts > 0 ? "Revisión, recepción o reembolso pendiente" : "Sin retractos abiertos",
      tone: "pink",
      urgent: openRetracts > 0,
      countInHeaderAlert: true,
    },
    {
      href: "/admin/garantias",
      icon: ShieldCheck,
      label: "Reclamos de garantía",
      value: openWarranty,
      description: openWarranty > 0 ? "Requieren diagnóstico" : "Sin reclamos activos",
      tone: "purple",
      urgent: openWarranty > 0,
      countInHeaderAlert: true,
    },
    {
      href: "/admin/resenas",
      icon: Star,
      label: "Reseñas por moderar",
      value: pendingReviews,
      description: pendingReviews > 0 ? "Requieren tu visto bueno" : "Todo aprobado",
      tone: "pink",
      urgent: pendingReviews > 0,
      countInHeaderAlert: true,
    },
    {
      href: "/admin/inventario?estado=out",
      icon: AlertTriangle,
      label: "Opciones agotadas",
      value: inventorySummary.outCount,
      description:
        inventorySummary.outCount > 0 ? "No se pueden vender hasta reponer" : "Todo con stock",
      tone: "amber",
      urgent: inventorySummary.outCount > 0,
      countInHeaderAlert: true,
    },
    {
      href: "/admin/inventario?estado=low",
      icon: AlertCircle,
      label: "Stock bajo",
      value: inventorySummary.lowCount,
      description:
        inventorySummary.lowCount > 0 ? "5 unidades o menos" : "Sin alertas de stock bajo",
      tone: "coral",
      urgent: false,
      countInHeaderAlert: false,
    },
  ];

  // Filtrado por rol (S11): ningún rol operativo ve tarjetas ni atajos cuya ruta le daría ?denied=1.
  const visibleOpsCards = allOpsCards.filter(
    (card) => (card.visible ?? true) && canAccessAdminPath(role, card.href),
  );

  type QuickLinkDef = {
    href: string;
    icon: LucideIcon;
    label: string;
    description: string;
  };

  const quickLinksCatalog: QuickLinkDef[] = [
    {
      href: "/admin/productos",
      icon: ShoppingBag,
      label: "Productos",
      description: "Crear, editar y archivar el catálogo.",
    },
    {
      href: "/admin/categorias",
      icon: Layers,
      label: "Categorías",
      description: "Agrupar productos por tipo. Sub-categorías incluidas.",
    },
    {
      href: "/admin/ocasiones",
      icon: Tag,
      label: "Ocasiones",
      description: "Tags transversales para que el cliente filtre por momento.",
    },
    {
      href: "/admin/cupones",
      icon: Ticket,
      label: "Cupones",
      description: "Códigos de descuento: porcentaje, monto fijo, envío gratis.",
    },
    {
      href: "/admin/contenido",
      icon: BookOpen,
      label: "Páginas del sitio",
      description: "Edita los textos del sitio por página (legales, FAQ, hero).",
    },
    {
      href: "/admin/contenido/paginas/global",
      icon: Cog,
      label: "Configuración general",
      description: "Email, WhatsApp, horario, redes y datos del negocio.",
    },
  ].filter((item) => canAccessAdminPath(role, item.href));

  const quickLinksStudio: QuickLinkDef[] = [
    {
      href: "/admin/plantillas",
      icon: LayoutTemplate,
      label: "Plantillas",
      description: "Diseños base que el cliente personaliza en el Estudio (fotoimanes, marcos…).",
    },
    {
      href: "/admin/disenos?tab=fichas",
      icon: Shapes,
      label: "Fichas del abecedario",
      description:
        "Los dibujos de cada letra (A de Avión…). Alimentan el editor de nombres y los sets.",
    },
    {
      href: "/admin/disenos",
      icon: LayoutTemplate,
      label: "Diseños prediseñados",
      description:
        "Imágenes listas que el cliente aplica con un toque en el editor (separadores, fotoimanes).",
    },
  ].filter((item) => canAccessAdminPath(role, item.href));

  const quickLinksAudit: QuickLinkDef[] = [
    {
      href: "/admin/auditoria",
      icon: Activity,
      label: "Auditoría",
      description: "Quién cambió qué y cuándo. Registro inmutable de acciones admin.",
    },
    {
      href: "/admin/contenido/paginas/global",
      icon: Settings,
      label: "Ajustes del sitio",
      description: "Banners legales, plazos, contacto, copyrights y subprocesadores.",
    },
  ].filter((item) => canAccessAdminPath(role, item.href));

  const opsAlerts = visibleOpsCards
    .filter((card) => card.countInHeaderAlert)
    .reduce((acc, card) => acc + card.value, 0);
  const hasAlerts = opsAlerts > 0;

  return (
    <AdminPage>
      <AdminPageHeader
        icon={<LayoutDashboard className="h-5 w-5" />}
        title={
          displayName ? (
            <>
              Hola, <span className="text-gradient-brand">{displayName}</span>{" "}
              <span className="inline-block">👋</span>
            </>
          ) : (
            <>
              <span className="text-gradient-brand">Hola</span>{" "}
              <span className="inline-block">👋</span>
            </>
          )
        }
        subtitle={
          <>
            Bienvenida al panel. Aquí puedes gestionar todo el negocio:{" "}
            <strong className="text-brand-purple">{productCount}</strong> productos,{" "}
            <strong className="text-brand-purple">{ocasionCount}</strong> ocasiones,{" "}
            <strong className="text-brand-purple">{activeCouponCount}</strong> cupones vigentes.
          </>
        }
        actions={
          <div className="flex flex-wrap items-center gap-2">
            {canAccessAdminPath(role, "/admin/hoy") && (
              <Link
                href="/admin/hoy"
                className="bg-brand-purple inline-flex min-h-10 items-center gap-1.5 rounded-full px-3.5 py-1.5 text-sm font-semibold text-white shadow-xs transition-all hover:brightness-110"
              >
                <HeartPulse className="h-4 w-4" />
                Abrir Bandeja Hoy
                <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            )}
            {hasAlerts ? (
              <div className="bg-brand-coral/10 text-brand-coral ring-brand-coral/30 inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-sm font-semibold ring-1">
                <Zap className="h-4 w-4" />
                {opsAlerts} {opsAlerts === 1 ? "alerta" : "alertas"}
              </div>
            ) : (
              <div className="inline-flex items-center gap-2 rounded-full bg-emerald-50 px-3 py-1.5 text-sm font-semibold text-emerald-700 ring-1 ring-emerald-200/60">
                <span className="h-2 w-2 rounded-full bg-emerald-500" />
                Todo al día
              </div>
            )}
          </div>
        }
      />

      <AdminPageBody>
        {/* #28 — explica el redirect del guard RBAC (antes ?denied=1 no mostraba nada). */}
        {denied && (
          <AdminNotice tone="warning">
            No tienes permiso para esa sección. Si crees que es un error, pídele acceso a un
            administrador.
          </AdminNotice>
        )}
        {/* ─────────────── Operaciones ─────────────── */}
        {visibleOpsCards.length > 0 && (
          <section>
            <h2 className="text-brand-muted mb-3 text-xs font-bold tracking-widest uppercase">
              Operaciones del día
            </h2>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {visibleOpsCards.map((card) => (
                <OpsCard
                  key={`${card.href}:${card.label}`}
                  href={card.href}
                  icon={card.icon}
                  label={card.label}
                  value={card.value}
                  description={card.description}
                  tone={card.tone}
                  urgent={card.urgent}
                />
              ))}
            </div>
          </section>
        )}

        {/* ─────────────── Pulso comercial 7 días ─────────────── */}
        {pulse7d && (
          <section>
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-brand-muted text-xs font-bold tracking-widest uppercase">
                Pulso comercial (últimos 7 días)
              </h2>
              <Link
                href="/admin/metricas?ventana=7"
                className="text-brand-purple text-xs font-semibold hover:underline"
              >
                Abrir analítica completa →
              </Link>
            </div>
            <AdminCard className="p-5">
              {(() => {
                const maxPulseCents = Math.max(0, ...pulse7d.buckets.map((b) => b.totalCents));
                return (
                  <>
                    <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                      <p className="text-brand-muted text-xs">
                        <strong className="text-brand-purple-dark text-sm">
                          {formatCOP(pulse7d.netTotalCents)}
                        </strong>{" "}
                        cobrados netos en{" "}
                        <strong className="text-brand-purple-dark">{pulse7d.orderCount}</strong>{" "}
                        pedido{pulse7d.orderCount === 1 ? "" : "s"}
                      </p>
                      <AdminDeltaPill
                        deltaPct={pulse7d.netRevenueDeltaPct}
                        comparisonLabel={pulse7d.range.previousLabel}
                      />
                    </div>
                    <AdminComboBarLineChart
                      ariaLabel="Pulso comercial de ingresos y pedidos en los últimos 7 días"
                      barLegend="Ingresos cobrados (COP)"
                      lineLegend="Pedidos confirmados"
                      maxAxisFormatted={maxPulseCents > 0 ? formatCOP(maxPulseCents) : "$0"}
                      midAxisFormatted={
                        maxPulseCents > 0 ? formatCOP(Math.round(maxPulseCents / 2)) : undefined
                      }
                      data={pulse7d.buckets.map((b) => ({
                        key: b.start.toISOString(),
                        label: b.label,
                        tickLabel: b.tickLabel,
                        barValue: b.totalCents,
                        barFormatted: formatCOP(b.totalCents),
                        lineValue: b.count,
                        lineFormatted: `${b.count} pedido${b.count === 1 ? "" : "s"}`,
                      }))}
                    />
                  </>
                );
              })()}
            </AdminCard>
          </section>
        )}

        {/* ─────────────── Negocio (KPIs) ─────────────── */}
        {role !== "FULFILLMENT" && (
          <section>
            <h2 className="text-brand-muted mb-3 text-xs font-bold tracking-widest uppercase">
              Estado del negocio
            </h2>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <KpiCard
                label="Clientes"
                value={customerCount}
                trend={newCustomersThisMonth > 0 ? "up" : "neutral"}
                trendLabel={
                  newCustomersThisMonth > 0
                    ? `+${newCustomersThisMonth} este mes`
                    : "Sin altas este mes"
                }
              />
              <KpiCard label="Productos" value={productCount} />
              <KpiCard label="Sub-categorías" value={subCategoryCount} />
              <KpiCard label="Cupones vigentes" value={activeCouponCount} />
            </div>
          </section>
        )}

        {/* ─────────────── Acceso rápido ─────────────── */}
        {quickLinksCatalog.length > 0 && (
          <section>
            <h2 className="text-brand-muted mb-3 text-xs font-bold tracking-widest uppercase">
              Acceso rápido
            </h2>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {quickLinksCatalog.map((item) => (
                <QuickLink
                  key={item.href}
                  href={item.href}
                  icon={item.icon}
                  label={item.label}
                  description={item.description}
                />
              ))}
            </div>
          </section>
        )}

        {/* ─────────────── Diseños del Estudio ─────────────── */}
        {quickLinksStudio.length > 0 && (
          <section>
            <h2 className="text-brand-muted mb-3 text-xs font-bold tracking-widest uppercase">
              Diseños del Estudio
            </h2>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {quickLinksStudio.map((item) => (
                <QuickLink
                  key={item.href}
                  href={item.href}
                  icon={item.icon}
                  label={item.label}
                  description={item.description}
                />
              ))}
            </div>
          </section>
        )}

        {/* ─────────────── Auditoría ─────────────── */}
        {quickLinksAudit.length > 0 && (
          <section>
            <h2 className="text-brand-muted mb-3 text-xs font-bold tracking-widest uppercase">
              Trazabilidad
            </h2>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {quickLinksAudit.map((item) => (
                <QuickLink
                  key={item.href}
                  href={item.href}
                  icon={item.icon}
                  label={item.label}
                  description={item.description}
                />
              ))}
            </div>
          </section>
        )}
      </AdminPageBody>
    </AdminPage>
  );
}

/**
 * Deriva un nombre legible del email del admin (mientras AdminUser no tenga
 * un campo displayName explícito).
 *
 *  crittan01@gmail.com  → "Crittan"
 *  lucy@lucamsshop.com   → "Lucy"
 *  r.julliethhr@...     → "R Julliethhr"
 *  abc@…                → null  (muy corto → fallback "Hola 👋")
 *
 * Si quieres tu nombre exacto en el dashboard, agregalo a AdminUser
 * cuando hagamos el form de perfil admin (backlog).
 */
function deriveAdminDisplayName(email: string): string | null {
  if (!email) return null;
  const local = email.split("@")[0];
  if (!local) return null;
  const clean = local
    .replace(/\d+$/, "") // dígitos al final ("crittan01" → "crittan")
    .replace(/[._-]+/g, " ") // separadores → espacio
    .trim();
  if (clean.length < 2) return null;
  // Capitaliza la primera letra de cada palabra.
  return clean.replace(/\b\p{L}/gu, (c) => c.toUpperCase());
}
