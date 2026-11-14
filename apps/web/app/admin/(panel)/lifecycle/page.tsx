import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Filter, MailCheck, Plus, ShoppingCart, Target, Workflow } from "lucide-react";
import {
  AdminBadge,
  AdminCard,
  AdminDonutChart,
  AdminEmpty,
  AdminNotice,
  AdminPage,
  AdminPageBody,
  AdminPageHeader,
  AdminSegmentedBar,
  AdminTable,
  AdminTableBody,
  AdminTableHead,
  AdminTableRow,
  KpiCard,
} from "@/components/admin-page";
import {
  ADMIN_ROLE_SETS,
  adminHomePath,
  canAccessAdminPath,
  hasCapability,
} from "@/lib/admin-rbac";
import { requireRole } from "@/lib/admin-rbac-guard";
import { formatCOP } from "@/lib/format";
import { formatDateTimeNoYearCO } from "@/lib/datetime";
import {
  getLifecycleJourneyMetrics,
  listLifecycleJourneys,
} from "@/features/lifecycle/admin-service";
import { getLifecycleSettings } from "@/features/lifecycle/settings";
import { LifecycleEngineControls } from "./action-buttons";

export const metadata: Metadata = {
  title: "Lifecycle Journeys",
  robots: { index: false, follow: false },
};

const TRIGGER_LABELS = {
  FIRST_PURCHASE: "Primera compra",
  SECOND_PURCHASE: "Segunda compra",
  REACTIVATION: "Reactivación",
  HIGH_INTENT: "Alta intención",
  B2B_FOLLOW_UP: "Seguimiento B2B",
} as const;

const STATUS_LABELS = {
  DRAFT: "Borrador",
  ACTIVE: "Activo",
  PAUSED: "Pausado",
  ARCHIVED: "Archivado",
} as const;

export default async function LifecyclePage() {
  const session = await requireRole(ADMIN_ROLE_SETS.LIFECYCLE_READ);
  const role = session.admin.role;
  const homeHref = adminHomePath(role);
  const canManage = hasCapability(role, "lifecycle:manage");

  const [journeys, metrics, settings] = await Promise.all([
    listLifecycleJourneys(),
    getLifecycleJourneyMetrics(),
    getLifecycleSettings(),
  ]);

  return (
    <AdminPage>
      <AdminPageHeader
        icon={<Workflow className="h-5 w-5" />}
        title="Lifecycle Journeys"
        subtitle="Recorridos configurables para activación, recompra, reactivación y seguimiento comercial."
        breadcrumbs={[
          { label: "Admin", href: homeHref },
          { label: "Marketing" },
          { label: "Lifecycle" },
        ]}
        actions={
          canManage ? (
            <Link
              href="/admin/lifecycle/nuevo"
              className="bg-brand-purple hover:bg-brand-purple-dark inline-flex min-h-10 items-center gap-2 rounded-md px-4 py-2 text-sm font-semibold text-white"
            >
              <Plus className="h-4 w-4" /> Nuevo recorrido
            </Link>
          ) : undefined
        }
      />
      <AdminPageBody>
        {/* Tira de navegación del ecosistema Marketing y CRM */}
        <div className="flex flex-wrap items-center gap-2">
          {canAccessAdminPath(role, "/admin/carritos") && (
            <Link
              href="/admin/carritos"
              className="border-brand-purple/15 text-brand-purple-dark hover:bg-brand-purple/5 inline-flex min-h-9 items-center gap-1.5 rounded-lg border bg-white px-3 py-1.5 text-xs font-semibold transition-colors"
            >
              <ShoppingCart className="h-3.5 w-3.5" />
              Carritos abandonados
            </Link>
          )}
          <span className="border-brand-purple bg-brand-purple/10 text-brand-purple-dark inline-flex min-h-9 items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-semibold">
            <Workflow className="h-3.5 w-3.5" />
            Lifecycle Journeys
          </span>
          {canAccessAdminPath(role, "/admin/marketing/suscriptores") && (
            <Link
              href="/admin/marketing/suscriptores"
              className="border-brand-purple/15 text-brand-purple-dark hover:bg-brand-purple/5 inline-flex min-h-9 items-center gap-1.5 rounded-lg border bg-white px-3 py-1.5 text-xs font-semibold transition-colors"
            >
              <MailCheck className="h-3.5 w-3.5" />
              Suscriptores
            </Link>
          )}
          {canAccessAdminPath(role, "/admin/marketing/segmentos") && (
            <Link
              href="/admin/marketing/segmentos"
              className="border-brand-purple/15 text-brand-purple-dark hover:bg-brand-purple/5 inline-flex min-h-9 items-center gap-1.5 rounded-lg border bg-white px-3 py-1.5 text-xs font-semibold transition-colors"
            >
              <Filter className="h-3.5 w-3.5" />
              Segmentos RFM
            </Link>
          )}
          {canAccessAdminPath(role, "/admin/oportunidades") && (
            <Link
              href="/admin/oportunidades"
              className="border-brand-purple/15 text-brand-purple-dark hover:bg-brand-purple/5 inline-flex min-h-9 items-center gap-1.5 rounded-lg border bg-white px-3 py-1.5 text-xs font-semibold transition-colors"
            >
              <Target className="h-3.5 w-3.5" />
              Oportunidades B2B
            </Link>
          )}
        </div>

        {!canManage ? (
          <AdminNotice tone="info">
            <strong>Modo analítico 0-PII:</strong> consulta el rendimiento, embudo de entregabilidad
            y conversión de cada recorrido sin datos personales en claro. Motor global actual:{" "}
            <strong>{settings.enabled ? "Activo" : "Pausado"}</strong> (límite:{" "}
            {settings.maxMessagesPerDay} mensaje{settings.maxMessagesPerDay === 1 ? "" : "s"}/día
            por contacto{settings.dryRun ? " · DRY_RUN activo" : ""}).
          </AdminNotice>
        ) : (
          <LifecycleEngineControls
            enabled={settings.enabled}
            maxMessagesPerDay={settings.maxMessagesPerDay}
            dryRun={settings.dryRun}
          />
        )}

        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-6">
          <KpiCard label="Inscripciones activas" value={metrics.active} />
          <KpiCard label="Mensajes enviados" value={metrics.messagesSent} />
          <KpiCard
            label="Entregados por Resend"
            value={`${metrics.messagesDelivered} · ${Math.round(metrics.deliveryRate * 100)} %`}
          />
          <KpiCard label="Clics en enlaces" value={`${Math.round(metrics.clickRate * 100)} %`} />
          <KpiCard label="Conversiones" value={metrics.conversions} />
          <KpiCard label="Ingresos atribuidos" value={formatCOP(metrics.revenueCents)} />
        </div>

        {/* Embudo ejecutivo de mensajes + estado de inscripciones */}
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-5">
          <AdminCard className="p-5 lg:col-span-3">
            <h2 className="text-brand-purple-dark font-display mb-1 text-sm font-bold">
              Embudo de entregabilidad y atribución
            </h2>
            <p className="text-brand-muted mb-4 text-xs">
              Tránsito acumulado desde envíos efectivos hasta conversiones pagadas atribuidas.
              {metrics.messagesBounced + metrics.messagesComplained > 0 &&
                ` · Rebotes/quejas: ${metrics.messagesBounced + metrics.messagesComplained}.`}
            </p>
            <AdminSegmentedBar
              ariaLabel="Embudo acumulado de mensajes Lifecycle"
              items={[
                {
                  key: "sent",
                  label: "Enviados",
                  count: metrics.messagesSent,
                  tone: "purple",
                },
                {
                  key: "delivered",
                  label: "Entregados",
                  count: metrics.messagesDelivered,
                  tone: "blue",
                  sublabel: `${Math.round(metrics.deliveryRate * 100)}%`,
                },
                {
                  key: "clicked",
                  label: "Con clic",
                  count: metrics.messagesClicked,
                  tone: "turquoise",
                  sublabel: `${Math.round(metrics.clickRate * 100)}%`,
                },
                {
                  key: "converted",
                  label: "Convertidos",
                  count: metrics.conversions,
                  tone: "emerald",
                  sublabel: formatCOP(metrics.revenueCents),
                },
                {
                  key: "bounced",
                  label: "Rebote / Queja",
                  count: metrics.messagesBounced + metrics.messagesComplained,
                  tone: "rose",
                },
              ]}
            />
          </AdminCard>

          <AdminCard className="p-5 lg:col-span-2">
            <h2 className="text-brand-purple-dark font-display mb-3 text-sm font-bold">
              Estado global de inscripciones
            </h2>
            <AdminDonutChart
              ariaLabel="Distribución de inscripciones Lifecycle por estado"
              centerValue={metrics.enrollments.toLocaleString("es-CO")}
              centerLabel="Inscripciones"
              slices={[
                { key: "active", label: "Activas", count: metrics.active, tone: "emerald" },
                {
                  key: "completed",
                  label: "Completadas",
                  count: metrics.completed,
                  tone: "purple",
                },
                { key: "exited", label: "Finalizadas", count: metrics.exited, tone: "slate" },
                {
                  key: "suppressed",
                  label: "Suprimidas",
                  count: metrics.suppressed,
                  tone: "amber",
                },
              ]}
            />
          </AdminCard>
        </div>

        <section>
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h2 className="font-display text-brand-purple-dark text-xl font-bold">Recorridos</h2>
              <p className="text-brand-muted mt-1 text-sm">
                {journeys.length} configurados · {metrics.conversions} conversiones atribuidas
              </p>
            </div>
          </div>

          {journeys.length === 0 ? (
            <AdminEmpty
              title="Aún no hay recorridos"
              description="Crea el primero para acompañar a tus contactos con pasos, condiciones y medición de conversión."
            />
          ) : (
            <AdminTable>
              <AdminTableHead>
                <tr>
                  <th>Recorrido</th>
                  <th>Disparador</th>
                  <th>Estado</th>
                  <th>Versión</th>
                  <th>Pasos</th>
                  <th>Inscripciones</th>
                  <th>Actualizado</th>
                  <th className="w-10">
                    <span className="sr-only">Abrir</span>
                  </th>
                </tr>
              </AdminTableHead>
              <AdminTableBody>
                {journeys.map((journey) => (
                  <AdminTableRow key={journey.id}>
                    <td>
                      <Link
                        href={`/admin/lifecycle/${journey.id}`}
                        className="text-brand-purple-dark font-semibold hover:underline"
                      >
                        {journey.name}
                      </Link>
                      <p className="text-brand-muted mt-1 max-w-md text-xs">
                        {journey.description}
                      </p>
                    </td>
                    <td className="text-sm">{TRIGGER_LABELS[journey.trigger]}</td>
                    <td>
                      <AdminBadge
                        tone={
                          journey.status === "ACTIVE"
                            ? "emerald"
                            : journey.status === "PAUSED"
                              ? "amber"
                              : "slate"
                        }
                      >
                        {STATUS_LABELS[journey.status]}
                      </AdminBadge>
                    </td>
                    <td className="text-sm">v{journey.version}</td>
                    <td className="text-sm">{journey._count.steps}</td>
                    <td className="text-sm">{journey._count.enrollments}</td>
                    <td className="text-brand-muted text-xs">
                      {formatDateTimeNoYearCO(journey.updatedAt)}
                    </td>
                    <td>
                      <Link
                        href={`/admin/lifecycle/${journey.id}`}
                        aria-label={`Abrir ${journey.name}`}
                      >
                        <ArrowRight className="text-brand-purple h-4 w-4" />
                      </Link>
                    </td>
                  </AdminTableRow>
                ))}
              </AdminTableBody>
            </AdminTable>
          )}
        </section>
      </AdminPageBody>
    </AdminPage>
  );
}
