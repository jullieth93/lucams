/*
 * Admin > Finanzas — dashboard financiero.
 *
 * Pre-Fase 2 (sin checkout productivo) este módulo NO tiene datos reales
 * — Order existe en schema pero no se generan filas hasta que Wompi esté
 * cableado. Mostramos el marco preparado con KPIs vacíos + explicación
 * clara de qué llega con Fase 2.
 *
 * Cuando Fase 2 esté cerrada (checkout + Wompi + Aveonline), este page
 * pasa a leer Order.total agregado por período + breakdown por método de
 * pago + IVA + conciliación con Wompi. Ese trabajo está scopeado en
 * sub-bloques N (Wompi reconciliación) y Q.6 (reportes admin).
 */

import type { Metadata } from "next";
import Link from "next/link";
import { DollarSign, TrendingUp, Receipt, CreditCard, FileText, ArrowRight } from "lucide-react";
import {
  AdminBadge,
  AdminCard,
  AdminNotice,
  AdminPage,
  AdminPageBody,
  AdminPageHeader,
} from "@/components/admin-page";
import { requireRole } from "@/lib/admin-rbac-guard";
import { prisma } from "@/lib/db";
import { formatCOP } from "@/lib/format";
import { getCodReconciliationTotals } from "@/features/orders/cod-reconciliation";

export const metadata: Metadata = {
  title: "Finanzas",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default async function AdminFinanzasPage() {
  const _session = await requireRole(["SUPERADMIN"]);

  // Probar contadores reales: si hay alguna orden pagada en DB ya, los
  // mostramos; si no, mantenemos los placeholders educativos.
  const [
    totalPaidOrders,
    wompiRevenue,
    codDeliveredRevenue,
    codToCollect,
    totalRefunded,
    ordersThisMonth,
    dianPending,
  ] = await Promise.all([
    prisma.order.count({
      where: { deletedAt: null, status: { in: ["PAID", "FULFILLING", "SHIPPED", "DELIVERED"] } },
    }),
    // Ingresos = efectivo REALMENTE cobrado: Wompi capturado online + COD ENTREGADO
    // (el efectivo del contraentrega solo entra al entregar). Revisión adversarial COD.
    prisma.order
      .aggregate({
        where: {
          deletedAt: null,
          paymentMethod: "WOMPI",
          status: { in: ["PAID", "FULFILLING", "SHIPPED", "DELIVERED"] },
        },
        _sum: { total: true },
      })
      .then((r) => r._sum?.total ?? 0),
    prisma.order
      .aggregate({
        where: { deletedAt: null, paymentMethod: "COD", status: "DELIVERED" },
        _sum: { total: true },
      })
      .then((r) => r._sum?.total ?? 0),
    // COD confirmado pero NO entregado → efectivo por cobrar (no es ingreso todavía).
    prisma.order
      .aggregate({
        where: {
          deletedAt: null,
          paymentMethod: "COD",
          status: { in: ["PAID", "FULFILLING", "SHIPPED"] },
        },
        _sum: { total: true },
      })
      .then((r) => r._sum?.total ?? 0),
    prisma.order.count({ where: { deletedAt: null, status: "REFUNDED" } }),
    prisma.order.count({
      where: {
        deletedAt: null,
        status: { in: ["PAID", "FULFILLING", "SHIPPED", "DELIVERED"] },
        createdAt: { gte: new Date(new Date().getFullYear(), new Date().getMonth(), 1) },
      },
    }),
    prisma.order.count({
      where: { deletedAt: null, dianStatus: "PENDING" },
    }),
  ]);

  // ADR-064 — efectivo COD entregado pendiente de remesa del mensajero + discrepancias.
  const codRecon = await getCodReconciliationTotals();

  // El COD entregado se reconoce como cobrado, PERO el faltante confirmado por discrepancias (efectivo
  // que el mensajero no remitió / se perdió) NO es caja real → se resta de "Ingresos" (review ADR-064).
  const totalRevenue = wompiRevenue + codDeliveredRevenue - codRecon.shortfallCop;
  const hasRealData = totalPaidOrders > 0;

  return (
    <AdminPage>
      <AdminPageHeader
        icon={<DollarSign className="h-5 w-5" />}
        title="Finanzas"
        subtitle={
          hasRealData
            ? `${totalPaidOrders} pedido${totalPaidOrders === 1 ? "" : "s"} confirmado${totalPaidOrders === 1 ? "" : "s"}`
            : "Aún sin ventas registradas"
        }
        breadcrumbs={[{ label: "Admin", href: "/admin/dashboard" }, { label: "Finanzas" }]}
      />

      <AdminPageBody>
        {!hasRealData && (
          <AdminNotice tone="info">
            <strong>Este panel está esperando ventas.</strong> Las métricas reales se llenan solas
            apenas empieces a vender. Mientras tanto, te muestro cómo se verá para que sepas qué vas
            a encontrar aquí.
          </AdminNotice>
        )}

        {/* KPIs principales */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Kpi
            icon={<TrendingUp className="h-5 w-5" />}
            label="Ingresos totales"
            value={hasRealData ? formatCOP(totalRevenue) : "—"}
            hint={
              hasRealData
                ? "Efectivo cobrado: Wompi + contra entrega ya entregado"
                : "Disponible cuando haya ventas"
            }
            highlight={hasRealData}
          />
          <Kpi
            icon={<Receipt className="h-5 w-5" />}
            label="Pedidos confirmados"
            value={hasRealData ? totalPaidOrders.toLocaleString("es-CO") : "0"}
            hint={
              hasRealData ? "Pagados + en producción + enviados + entregados" : "Pendiente checkout"
            }
          />
          <Kpi
            icon={<CreditCard className="h-5 w-5" />}
            label="Este mes"
            value={hasRealData ? ordersThisMonth.toLocaleString("es-CO") : "0"}
            hint={
              hasRealData
                ? "Pedidos confirmados del mes corriente"
                : "Disponible cuando haya ventas"
            }
          />
          <Kpi
            icon={<FileText className="h-5 w-5" />}
            label="DIAN pendientes"
            value={dianPending.toLocaleString("es-CO")}
            hint="Facturas electrónicas por emitir"
          />
        </div>

        {codToCollect > 0 && (
          <AdminNotice tone="info">
            💵 <strong>{formatCOP(codToCollect)}</strong> en pedidos contra entrega{" "}
            <strong>por cobrar</strong> — el efectivo entra cuando el mensajero los entregue.{" "}
            <em>No está incluido en Ingresos totales</em> (se cuenta al entregar).
          </AdminNotice>
        )}

        {/* ADR-064 — conciliación del efectivo contra entrega ya cobrado por el mensajero */}
        {(codRecon.pendingCop > 0 || codRecon.discrepancyCount > 0) && (
          <AdminNotice tone={codRecon.discrepancyCount > 0 ? "warning" : "info"}>
            🚚{" "}
            {codRecon.pendingCop > 0 && (
              <>
                <strong>{formatCOP(codRecon.pendingCop)}</strong> de pedidos entregados están{" "}
                <strong>por remitir</strong> (el mensajero ya cobró y aún no te deposita).{" "}
              </>
            )}
            {codRecon.discrepancyCount > 0 && (
              <>
                Hay <strong>{codRecon.discrepancyCount}</strong> con discrepancia
                {codRecon.shortfallCop > 0 ? (
                  <>
                    {" "}
                    (<strong>{formatCOP(codRecon.shortfallCop)}</strong> que no llegó)
                  </>
                ) : null}
                .{" "}
              </>
            )}
            <Link href="/admin/finanzas/conciliacion" className="font-semibold underline">
              Conciliar contra entrega
            </Link>
          </AdminNotice>
        )}

        {totalRefunded > 0 && (
          <AdminNotice tone="warning">
            Hay {totalRefunded} pedido{totalRefunded === 1 ? "" : "s"} reembolsado
            {totalRefunded === 1 ? "" : "s"}. Revísalo
            {totalRefunded === 1 ? "" : "s"} en{" "}
            <Link href="/admin/pedidos" className="underline">
              /admin/pedidos
            </Link>{" "}
            con filtro estado = Reembolsada.
          </AdminNotice>
        )}

        {/* Bloques previstos */}
        <section>
          <h2 className="text-brand-purple-dark font-display mb-3 text-base font-bold">
            Qué verás aquí próximamente
          </h2>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <BlocoFuturo
              icon={<TrendingUp className="h-5 w-5" />}
              title="Ingresos por período"
              description="Gráfico de ventas día/semana/mes/año con comparativo vs período anterior. Detección automática de picos y caídas."
              phase="Próximamente"
            />
            <BlocoFuturo
              icon={<CreditCard className="h-5 w-5" />}
              title="Breakdown por método de pago"
              description="Cuánto entra por tarjeta vs PSE vs Nequi vs contraentrega. Útil para negociar comisiones con Wompi."
              phase="Próximamente"
            />
            <BlocoFuturo
              icon={<Receipt className="h-5 w-5" />}
              title="IVA cobrado vs pagado"
              description="Total IVA cobrado al cliente + IVA a pagar a DIAN. Listo para tu contador."
              phase="Próximamente"
            />
            <BlocoFuturo
              icon={<FileText className="h-5 w-5" />}
              title="Facturación electrónica DIAN"
              description="Estado por orden (PENDIENTE / ENVIADA / ACEPTADA / RECHAZADA), descarga XML/PDF, reintentos."
              phase="Próximamente"
            />
            <BlocoFuturo
              icon={<DollarSign className="h-5 w-5" />}
              title="Conciliación Wompi"
              description="Job diario que compara transacciones Wompi vs Orders en DB. Reporta discrepancias."
              phase="Próximamente"
            />
            <BlocoFuturo
              icon={<TrendingUp className="h-5 w-5" />}
              title="Ticket promedio y AOV"
              description="Promedio de pedido (Average Order Value), productos con mejor margen, ranking categorías."
              phase="Próximamente"
            />
          </div>
        </section>

        <AdminCard className="p-5">
          <h3 className="text-brand-purple-dark font-display mb-2 text-base font-bold">
            ¿Mientras tanto, qué puedo hacer?
          </h3>
          <p className="text-brand-purple-dark/75 mb-3 text-sm">
            Mientras tanto, puedes ir dejando todo listo:
          </p>
          <ul className="text-brand-purple-dark/75 list-inside list-disc space-y-1.5 text-sm">
            <li>
              Configurar la pasarela Wompi en{" "}
              <Link href="/admin/integraciones" className="text-brand-purple underline">
                /admin/integraciones
              </Link>
              .
            </li>
            <li>
              Crear cupones promocionales en{" "}
              <Link href="/admin/cupones" className="text-brand-purple underline">
                /admin/cupones
              </Link>
              .
            </li>
            <li>
              Revisar pedidos por WhatsApp manual (los clientes pueden hacer wa.me directos hoy).
            </li>
            <li>
              Tener listo el catálogo en{" "}
              <Link href="/admin/productos" className="text-brand-purple underline">
                /admin/productos
              </Link>{" "}
              con fotos reales y precios definitivos.
            </li>
          </ul>
        </AdminCard>
      </AdminPageBody>
    </AdminPage>
  );
}

function Kpi({
  icon,
  label,
  value,
  hint,
  highlight,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  hint: string;
  highlight?: boolean;
}) {
  return (
    <AdminCard className="p-4">
      <div className="text-brand-muted mb-1 flex items-center gap-1.5 text-xs font-semibold tracking-wide uppercase">
        {icon}
        {label}
      </div>
      <div
        className={
          highlight
            ? "text-brand-purple-dark font-display text-2xl font-bold tabular-nums"
            : "text-brand-purple-dark/85 font-display text-2xl font-bold tabular-nums"
        }
      >
        {value}
      </div>
      <p className="text-brand-muted mt-1 text-xs">{hint}</p>
    </AdminCard>
  );
}

function BlocoFuturo({
  icon,
  title,
  description,
  phase,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  phase: string;
}) {
  return (
    <AdminCard className="p-4">
      <div className="flex items-start gap-3">
        <div className="bg-brand-purple/10 text-brand-purple-dark flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg">
          {icon}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h4 className="text-brand-purple-dark text-sm font-semibold">{title}</h4>
            <AdminBadge tone="blue">{phase}</AdminBadge>
          </div>
          <p className="text-brand-muted mt-1 text-xs">{description}</p>
        </div>
        <ArrowRight className="text-brand-purple-dark/30 mt-1 h-4 w-4 flex-shrink-0" />
      </div>
    </AdminCard>
  );
}
