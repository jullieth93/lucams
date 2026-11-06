import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Workflow } from "lucide-react";
import {
  AdminBadge,
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
  getLifecycleJourney,
  getLifecycleJourneyMessages,
  getLifecycleJourneyMetrics,
  previewLifecycleAudience,
} from "@/features/lifecycle/admin-service";
import type { LifecycleJourneyInput } from "@/features/lifecycle/types";
import { LifecycleJourneyForm } from "../journey-form";
import {
  EnrollmentActionButtons,
  LifecycleStatusButtons,
  RetryMessageButton,
} from "../action-buttons";

export const metadata: Metadata = { title: "Detalle de recorrido · Lifecycle" };

const STATUS_LABELS = {
  ACTIVE: "Activa",
  COMPLETED: "Completada",
  EXITED: "Finalizada",
  SUPPRESSED: "Suprimida",
} as const;

const MESSAGE_LABELS = {
  PENDING: "Pendiente",
  SENT: "Enviado",
  FAILED: "Fallido",
  SUPPRESSED: "Suprimido",
  CANCELLED: "Cancelado",
} as const;

export default async function LifecycleJourneyDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireAdminAction({ capability: "lifecycle:manage" });
  const { id } = await params;
  const journey = await getLifecycleJourney(id);
  if (!journey) notFound();
  const [metrics, messages, audience] = await Promise.all([
    getLifecycleJourneyMetrics(id),
    getLifecycleJourneyMessages(id),
    previewLifecycleAudience(id),
  ]);

  const initialJourney: LifecycleJourneyInput = {
    key: journey.key,
    name: journey.name,
    description: journey.description,
    trigger: journey.trigger,
    status: journey.status,
    requireOptIn: journey.requireOptIn,
    inactivityDays: journey.inactivityDays,
    entryLookbackDays: journey.entryLookbackDays,
    cooldownDays: journey.cooldownDays,
    maxMessagesPerDay: journey.maxMessagesPerDay,
    quietStartHour: journey.quietStartHour,
    quietEndHour: journey.quietEndHour,
    steps: journey.steps.map((step) => ({
      id: step.id,
      position: step.position,
      delayMinutes: step.delayMinutes,
      subject: step.subject,
      heading: step.heading,
      preheader: step.preheader,
      body: step.body,
      ctaLabel: step.ctaLabel,
      ctaPath: step.ctaPath,
      commercial: step.commercial,
      condition: step.condition,
    })),
  };

  return (
    <AdminPage>
      <AdminPageHeader
        icon={<Workflow className="h-5 w-5" />}
        title={journey.name}
        subtitle={`${journey.description} · versión ${journey.version}`}
        breadcrumbs={[
          { label: "Admin", href: "/admin/dashboard" },
          { label: "Marketing" },
          { label: "Lifecycle", href: "/admin/lifecycle" },
          { label: journey.name },
        ]}
        actions={
          <LifecycleStatusButtons
            journeyId={journey.id}
            status={journey.status}
            firstStepId={journey.steps[0]?.id}
          />
        }
      />
      <AdminPageBody>
        <Link
          href="/admin/lifecycle"
          className="text-brand-purple-dark inline-flex items-center gap-1 text-xs font-semibold"
        >
          <ArrowLeft className="h-3.5 w-3.5" /> Volver a recorridos
        </Link>

        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <KpiCard label="Inscripciones activas" value={metrics.active} />
          <KpiCard label="Mensajes enviados" value={metrics.messagesSent} />
          <KpiCard label="Clics" value={`${Math.round(metrics.clickRate * 100)} %`} />
          <KpiCard label="Ingresos atribuidos" value={formatCOP(metrics.revenueCents)} />
        </div>

        <section className="border-brand-purple/10 rounded-xl border bg-white p-5 shadow-sm">
          <h2 className="font-display text-brand-purple-dark text-lg font-bold">
            Audiencia elegible ahora
          </h2>
          <p className="text-brand-muted mt-1 text-sm">
            {audience.eligible} contactos cumplen las reglas.{" "}
            {audience.excludedNoOptIn > 0 &&
              `${audience.excludedNoOptIn} quedan excluidos por falta de consentimiento.`}
          </p>
          {audience.sample.length > 0 && (
            <ul className="mt-3 grid gap-2 text-sm md:grid-cols-2">
              {audience.sample.map((member) => (
                <li key={member.contactId} className="rounded-lg bg-slate-50 px-3 py-2">
                  <span className="text-brand-purple-dark font-medium">
                    {member.displayName ?? member.email}
                  </span>
                  {member.triggerRef && (
                    <span className="text-brand-muted ml-2 text-xs">{member.triggerRef}</span>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>

        <LifecycleJourneyForm journeyId={journey.id} initialJourney={initialJourney} />

        <section>
          <h2 className="font-display text-brand-purple-dark mb-3 text-lg font-bold">
            Inscripciones
          </h2>
          <AdminTable>
            <AdminTableHead>
              <tr>
                <th>Contacto</th>
                <th>Ciclo</th>
                <th>Estado</th>
                <th>Paso actual</th>
                <th>Próxima ejecución</th>
                <th>Salida</th>
                <th>Acciones</th>
              </tr>
            </AdminTableHead>
            <AdminTableBody>
              {journey.enrollments.map((enrollment) => (
                <AdminTableRow key={enrollment.id}>
                  <td>
                    <p className="text-brand-purple-dark font-medium">
                      {enrollment.contact.displayName ?? enrollment.contact.primaryEmail}
                    </p>
                    <p className="text-brand-muted text-xs">{enrollment.contact.primaryEmail}</p>
                  </td>
                  <td className="text-sm">{enrollment.cycle}</td>
                  <td>
                    <AdminBadge tone={enrollment.status === "ACTIVE" ? "emerald" : "slate"}>
                      {STATUS_LABELS[enrollment.status]}
                    </AdminBadge>
                  </td>
                  <td className="text-sm">
                    {enrollment.currentStep
                      ? `Paso ${enrollment.currentStep.position}`
                      : "Finalizado"}
                  </td>
                  <td className="text-brand-muted text-xs">
                    {formatDateTimeNoYearCO(enrollment.nextRunAt)}
                  </td>
                  <td className="text-brand-muted text-xs">{enrollment.exitReason ?? "—"}</td>
                  <td>
                    <EnrollmentActionButtons
                      enrollmentId={enrollment.id}
                      status={enrollment.status}
                    />
                  </td>
                </AdminTableRow>
              ))}
            </AdminTableBody>
          </AdminTable>
        </section>

        <section>
          <h2 className="font-display text-brand-purple-dark mb-3 text-lg font-bold">
            Mensajes y atribución
          </h2>
          <AdminTable>
            <AdminTableHead>
              <tr>
                <th>Contacto</th>
                <th>Asunto</th>
                <th>Estado</th>
                <th>Programado</th>
                <th>Clic</th>
                <th>Conversión</th>
                <th>Acciones</th>
              </tr>
            </AdminTableHead>
            <AdminTableBody>
              {messages.map((message) => (
                <AdminTableRow key={message.id}>
                  <td>
                    <p className="text-brand-purple-dark font-medium">
                      {message.contact.displayName ?? message.contact.primaryEmail}
                    </p>
                    <p className="text-brand-muted text-xs">
                      Ciclo {message.enrollment.cycle} · paso {message.step.position}
                    </p>
                  </td>
                  <td className="max-w-sm text-sm">
                    {message.subject}
                    {message.status === "FAILED" && message.error && (
                      <span className="mt-1 block text-xs text-rose-700">{message.error}</span>
                    )}
                  </td>
                  <td>
                    <AdminBadge
                      tone={
                        message.status === "SENT"
                          ? "emerald"
                          : message.status === "FAILED"
                            ? "rose"
                            : "slate"
                      }
                    >
                      {MESSAGE_LABELS[message.status]}
                    </AdminBadge>
                  </td>
                  <td className="text-brand-muted text-xs">
                    {formatDateTimeNoYearCO(message.scheduledFor)}
                  </td>
                  <td className="text-brand-muted text-xs">
                    {message.clickedAt ? formatDateTimeNoYearCO(message.clickedAt) : "—"}
                  </td>
                  <td className="text-sm">
                    {message.convertedAt ? (
                      <span className="text-emerald-700">
                        {formatCOP(message.revenueCents)}
                        <span className="block text-xs">
                          {formatDateTimeNoYearCO(message.convertedAt)}
                        </span>
                      </span>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td>
                    {message.status === "FAILED" && <RetryMessageButton messageId={message.id} />}
                  </td>
                </AdminTableRow>
              ))}
            </AdminTableBody>
          </AdminTable>
        </section>
      </AdminPageBody>
    </AdminPage>
  );
}
