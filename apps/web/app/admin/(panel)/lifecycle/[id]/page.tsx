import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Workflow } from "lucide-react";
import {
  AdminBadge,
  AdminCard,
  AdminDonutChart,
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
import { maskEmail, maskEmailsInText, maskPersonName } from "@/lib/pii-mask";
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

export const metadata: Metadata = {
  title: "Detalle de recorrido · Lifecycle",
  robots: { index: false, follow: false },
};

const SAFE_ID_RE = /^[a-zA-Z0-9_-]{6,64}$/;

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
  const session = await requireRole(ADMIN_ROLE_SETS.LIFECYCLE_READ);
  const role = session.admin.role;
  const homeHref = adminHomePath(role);
  const canManage = hasCapability(role, "lifecycle:manage");
  const canReadPii = hasCapability(role, "contacts:read_pii");
  const canRead360 =
    hasCapability(role, "contacts:read_360") && canAccessAdminPath(role, "/admin/clientes");
  const canReadOrders = canAccessAdminPath(role, "/admin/pedidos");

  const { id } = await params;
  if (!SAFE_ID_RE.test(id)) notFound();

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
          { label: "Admin", href: homeHref },
          { label: "Marketing" },
          { label: "Lifecycle", href: "/admin/lifecycle" },
          { label: journey.name },
        ]}
        actions={
          canManage ? (
            <LifecycleStatusButtons
              journeyId={journey.id}
              status={journey.status}
              steps={journey.steps.map((step) => ({
                id: step.id,
                position: step.position,
                subject: step.subject,
              }))}
            />
          ) : (
            <AdminBadge
              tone={
                journey.status === "ACTIVE"
                  ? "emerald"
                  : journey.status === "PAUSED"
                    ? "amber"
                    : "slate"
              }
            >
              {journey.status}
            </AdminBadge>
          )
        }
      />
      <AdminPageBody>
        <Link
          href="/admin/lifecycle"
          className="text-brand-purple-dark inline-flex items-center gap-1 text-xs font-semibold"
        >
          <ArrowLeft className="h-3.5 w-3.5" /> Volver a recorridos
        </Link>

        {!canManage && (
          <AdminNotice tone="info">
            <strong>Modo analítico 0-PII:</strong> las métricas de conversión y previsualizaciones
            sintéticas están disponibles; la identidad de contactos y la edición del recorrido
            requieren permisos de gestión Lifecycle.
          </AdminNotice>
        )}

        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-6">
          <KpiCard label="Inscripciones activas" value={metrics.active} />
          <KpiCard label="Mensajes enviados" value={metrics.messagesSent} />
          <KpiCard
            label="Entregados por Resend"
            value={`${metrics.messagesDelivered} · ${Math.round(metrics.deliveryRate * 100)} %`}
          />
          <KpiCard label="Clics" value={`${Math.round(metrics.clickRate * 100)} %`} />
          <KpiCard label="Conversiones" value={metrics.conversions} />
          <KpiCard label="Ingresos atribuidos" value={formatCOP(metrics.revenueCents)} />
        </div>
        <p className="text-brand-muted text-xs">
          Rebotes: {metrics.messagesBounced} · quejas: {metrics.messagesComplained} · diferidos:{" "}
          {metrics.messagesDelayed}
        </p>

        {/* Embudo y distribución de este recorrido */}
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-5">
          <AdminCard className="p-5 lg:col-span-3">
            <h2 className="text-brand-purple-dark font-display mb-1 text-sm font-bold">
              Embudo de este recorrido
            </h2>
            <p className="text-brand-muted mb-4 text-xs">
              Conversión de envíos a entregas efectivas, clics y pedidos pagados.
            </p>
            <AdminSegmentedBar
              ariaLabel={`Embudo del recorrido ${journey.name}`}
              items={[
                { key: "sent", label: "Enviados", count: metrics.messagesSent, tone: "purple" },
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
              Estado de inscripciones
            </h2>
            <AdminDonutChart
              ariaLabel={`Estado de inscripciones de ${journey.name}`}
              centerValue={metrics.enrollments.toLocaleString("es-CO")}
              centerLabel="Inscritos"
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
              {audience.sample.map((member) => {
                const label = member.displayName
                  ? canReadPii
                    ? member.displayName
                    : maskPersonName(member.displayName)
                  : member.email
                    ? canReadPii
                      ? member.email
                      : maskEmail(member.email)
                    : "Contacto sin correo";
                return (
                  <li
                    key={member.contactId}
                    className="flex items-center justify-between gap-2 rounded-lg bg-slate-50 px-3 py-2"
                  >
                    <div>
                      <span className="text-brand-purple-dark font-medium">{label}</span>
                      {member.triggerRef && (
                        <span className="text-brand-muted ml-2 text-xs">
                          {canReadPii ? member.triggerRef : maskEmailsInText(member.triggerRef)}
                        </span>
                      )}
                    </div>
                    {canRead360 && (
                      <Link
                        href={`/admin/clientes/${encodeURIComponent(member.contactId)}`}
                        className="text-brand-purple shrink-0 text-xs font-semibold hover:underline"
                      >
                        Contacto 360 →
                      </Link>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <section className="border-brand-purple/10 space-y-3 rounded-xl border bg-white p-5 shadow-sm">
          <div>
            <h2 className="font-display text-brand-purple-dark text-lg font-bold">
              Previsualización de mensajes y enlaces
            </h2>
            <p className="text-brand-muted mt-1 text-sm">
              El enlace final de atribución se genera al enviar. Aquí se valida la ruta interna de
              destino con datos sintéticos.
            </p>
          </div>
          {journey.steps.map((step) => (
            <details key={step.id} className="rounded-lg border border-slate-200 p-3">
              <summary className="cursor-pointer text-sm font-semibold text-slate-800">
                Paso {step.position}: {step.subject}
              </summary>
              <p className="text-brand-muted mt-2 text-xs">
                Botón: {step.ctaLabel} · destino: <code>{step.ctaPath}</code>
              </p>
              <iframe
                src={`/admin/lifecycle/${journey.id}/preview?stepId=${step.id}`}
                title={`Vista previa del paso ${step.position}`}
                loading="lazy"
                sandbox=""
                className="mt-3 h-[720px] w-full rounded-md border border-slate-200 bg-white"
              />
            </details>
          ))}
        </section>

        {canManage ? (
          <LifecycleJourneyForm journeyId={journey.id} initialJourney={initialJourney} />
        ) : (
          <AdminCard className="p-5">
            <h2 className="font-display text-brand-purple-dark mb-2 text-lg font-bold">
              Reglas configuradas del recorrido (solo lectura)
            </h2>
            <dl className="grid grid-cols-2 gap-3 text-xs sm:grid-cols-4">
              <div className="rounded-lg bg-slate-50 p-3">
                <dt className="text-brand-muted font-semibold">Clave / Disparador</dt>
                <dd className="text-brand-purple-dark mt-0.5 font-mono font-bold">
                  {journey.key} · {journey.trigger}
                </dd>
              </div>
              <div className="rounded-lg bg-slate-50 p-3">
                <dt className="text-brand-muted font-semibold">Inactividad / Enfriamiento</dt>
                <dd className="text-brand-purple-dark mt-0.5 font-bold">
                  {journey.inactivityDays} d · cooldown {journey.cooldownDays} d
                </dd>
              </div>
              <div className="rounded-lg bg-slate-50 p-3">
                <dt className="text-brand-muted font-semibold">Horario silencioso (COT)</dt>
                <dd className="text-brand-purple-dark mt-0.5 font-bold">
                  {journey.quietStartHour}:00 a {journey.quietEndHour}:00
                </dd>
              </div>
              <div className="rounded-lg bg-slate-50 p-3">
                <dt className="text-brand-muted font-semibold">Consentimiento Ley 1581</dt>
                <dd className="text-brand-purple-dark mt-0.5 font-bold">
                  {journey.requireOptIn ? "Exige opt-in activo" : "Transaccional / relación"}
                </dd>
              </div>
            </dl>
          </AdminCard>
        )}

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
                {canManage && <th>Acciones</th>}
              </tr>
            </AdminTableHead>
            <AdminTableBody>
              {journey.enrollments.map((enrollment) => {
                const rawEmail = enrollment.contact.primaryEmail ?? "";
                const displayEmail = rawEmail ? (canReadPii ? rawEmail : maskEmail(rawEmail)) : "—";
                const displayName = enrollment.contact.displayName
                  ? canReadPii
                    ? enrollment.contact.displayName
                    : maskPersonName(enrollment.contact.displayName)
                  : displayEmail;
                return (
                  <AdminTableRow key={enrollment.id}>
                    <td>
                      <p className="text-brand-purple-dark font-medium">{displayName}</p>
                      <p className="text-brand-muted text-xs">{displayEmail}</p>
                      {canRead360 && (
                        <Link
                          href={`/admin/clientes/${encodeURIComponent(enrollment.contact.id)}`}
                          className="text-brand-purple text-[11px] font-semibold hover:underline"
                        >
                          Ver Contacto 360 →
                        </Link>
                      )}
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
                    {canManage && (
                      <td>
                        <EnrollmentActionButtons
                          enrollmentId={enrollment.id}
                          status={enrollment.status}
                          exitReason={enrollment.exitReason}
                        />
                      </td>
                    )}
                  </AdminTableRow>
                );
              })}
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
                {canManage && <th>Acciones</th>}
              </tr>
            </AdminTableHead>
            <AdminTableBody>
              {messages.map((message) => {
                const rawEmail = message.contact.primaryEmail ?? "";
                const displayEmail = rawEmail ? (canReadPii ? rawEmail : maskEmail(rawEmail)) : "—";
                const displayName = message.contact.displayName
                  ? canReadPii
                    ? message.contact.displayName
                    : maskPersonName(message.contact.displayName)
                  : displayEmail;
                return (
                  <AdminTableRow key={message.id}>
                    <td>
                      <p className="text-brand-purple-dark font-medium">{displayName}</p>
                      <p className="text-brand-muted text-xs">
                        Ciclo {message.enrollment.cycle} · paso {message.step.position}
                      </p>
                      {canRead360 && (
                        <Link
                          href={`/admin/clientes/${encodeURIComponent(message.contact.id)}`}
                          className="text-brand-purple text-[11px] font-semibold hover:underline"
                        >
                          Contacto 360 →
                        </Link>
                      )}
                    </td>
                    <td className="max-w-sm text-sm">
                      {message.subject}
                      {message.error && (
                        <span className="mt-1 block text-xs text-rose-700">
                          {canReadPii ? message.error : maskEmailsInText(message.error)}
                        </span>
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
                          <strong className="tabular-nums">
                            {formatCOP(message.revenueCents)}
                          </strong>
                          {message.convertedOrder && canReadOrders && (
                            <Link
                              href={`/admin/pedidos/${encodeURIComponent(message.convertedOrder.number)}`}
                              className="block font-mono text-xs font-bold text-emerald-800 hover:underline"
                            >
                              Pedido {message.convertedOrder.number}
                            </Link>
                          )}
                          <span className="block text-xs">
                            {formatDateTimeNoYearCO(message.convertedAt)}
                          </span>
                        </span>
                      ) : (
                        "—"
                      )}
                    </td>
                    {canManage && (
                      <td>
                        {message.status === "FAILED" && (
                          <RetryMessageButton messageId={message.id} />
                        )}
                      </td>
                    )}
                  </AdminTableRow>
                );
              })}
            </AdminTableBody>
          </AdminTable>
        </section>
      </AdminPageBody>
    </AdminPage>
  );
}
