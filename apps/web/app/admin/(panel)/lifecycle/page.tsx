import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Plus, Workflow } from "lucide-react";
import {
  AdminBadge,
  AdminEmpty,
  AdminPage,
  AdminPageBody,
  AdminPageHeader,
  AdminTable,
  AdminTableBody,
  AdminTableHead,
  AdminTableRow,
  KpiCard,
} from "@/components/admin-page";
import { requireAdminAction } from "@/lib/admin-rbac-guard";
import { formatCOP } from "@/lib/format";
import { formatDateTimeNoYearCO } from "@/lib/datetime";
import {
  getLifecycleJourneyMetrics,
  listLifecycleJourneys,
} from "@/features/lifecycle/admin-service";
import { getLifecycleSettings } from "@/features/lifecycle/settings";
import { LifecycleEngineControls } from "./action-buttons";

export const metadata: Metadata = { title: "Lifecycle Journeys" };

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
  await requireAdminAction({ capability: "lifecycle:manage" });
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
          { label: "Admin", href: "/admin/dashboard" },
          { label: "Marketing" },
          { label: "Lifecycle" },
        ]}
        actions={
          <Link
            href="/admin/lifecycle/nuevo"
            className="bg-brand-purple hover:bg-brand-purple-dark inline-flex min-h-10 items-center gap-2 rounded-md px-4 py-2 text-sm font-semibold text-white"
          >
            <Plus className="h-4 w-4" /> Nuevo recorrido
          </Link>
        }
      />
      <AdminPageBody>
        <LifecycleEngineControls
          enabled={settings.enabled}
          maxMessagesPerDay={settings.maxMessagesPerDay}
          dryRun={settings.dryRun}
        />
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
