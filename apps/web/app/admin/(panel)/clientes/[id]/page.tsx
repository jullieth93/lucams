/*
 * Admin > Clientes > [id] — Ficha unificada `Contacto 360` (Fase 9 · S19).
 *
 * Acepta tanto `Contact.id` como `Customer.id` legacy (redirigiendo al `Contact.id`
 * canónico). Registra lectura sensible en `AdminActionLog` (`contact.view_360`) y
 * respeta enmascaramiento determinista de PII en servidor.
 */

import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import {
  AlertTriangle,
  ArrowLeft,
  Building2,
  CreditCard,
  Hash,
  Mail,
  Phone,
  ShieldAlert,
  ShieldCheck,
  TrendingUp,
  Users,
} from "lucide-react";
import {
  AdminPage,
  AdminPageHeader,
  AdminPageBody,
  AdminCard,
  AdminBadge,
} from "@/components/admin-page";
import { recordAdminAction } from "@/lib/admin-audit";
import { hasCapability } from "@/lib/admin-rbac";
import { requireCapability } from "@/lib/admin-rbac-guard";
import {
  getContact360ForActor,
  resolveContactRouteParam,
} from "@/features/identity/contact-360-service";
import { customerWaLink } from "@/lib/wa";
import { WhatsAppIcon } from "@/components/icons/brand";
import { formatCOP, formatRelativeTime } from "@/lib/format";
import { CrmWorkspacePanel } from "@/components/admin/crm-workspace-panel";
import {
  listActivitiesForEntity,
  listAssignableCrmAdmins,
  listTasksForEntity,
} from "@/features/crm/service";
import { Contact360Tabs } from "./contact-360-tabs";

export const metadata: Metadata = {
  title: "Contacto 360",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

type RouteParams = Promise<{ id: string }>;

const DROP_OFF_BADGE: Record<
  "PAYMENT_DECLINED" | "CART_ABANDONED" | "STUDIO_DRAFT",
  { label: string; tone: "rose" | "amber" | "purple" }
> = {
  PAYMENT_DECLINED: { label: "Pago rechazado", tone: "rose" },
  CART_ABANDONED: { label: "Carrito abandonado", tone: "amber" },
  STUDIO_DRAFT: { label: "Borrador Estudio", tone: "purple" },
};

export default async function ClienteDetailPage({ params }: { params: RouteParams }) {
  const session = await requireCapability("contacts:read_360");
  const canMerge = hasCapability(session.admin.role, "contacts:merge");
  const canManageTasks = hasCapability(session.admin.role, "crm:manage_tasks");
  const canManageActivities = hasCapability(session.admin.role, "crm:manage_activities");

  const { id } = await params;
  const resolved = await resolveContactRouteParam(id);
  if (resolved.kind === "not_found") notFound();
  if (resolved.kind === "redirect") {
    redirect(`/admin/clientes/${encodeURIComponent(resolved.contactId)}`);
  }

  const [data, crmTasks, crmActivities, assignableAdmins] = await Promise.all([
    getContact360ForActor(resolved.contactId, session.admin.role),
    listTasksForEntity({ contactId: resolved.contactId }),
    listActivitiesForEntity({ contactId: resolved.contactId }),
    canManageTasks ? listAssignableCrmAdmins() : Promise.resolve([]),
  ]);
  if (!data) notFound();

  await recordAdminAction({
    actorId: session.admin.id,
    action: "contact.view_360",
    entityType: "Contact",
    entityId: data.id,
    metadata: {
      hasCustomerAccount: Boolean(data.customer),
      piiMasked: data.piiMasked,
    },
  });

  const waLink = data.waPhoneRaw
    ? customerWaLink(data.waPhoneRaw, `Hola ${data.displayName}, te escribo de Lucams Shop. `)
    : null;

  const dateFmt = new Intl.DateTimeFormat("es-CO", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });

  return (
    <AdminPage>
      <AdminPageHeader
        icon={<Users className="h-5 w-5" />}
        title={data.displayName}
        subtitle={
          <span className="inline-flex flex-wrap items-center gap-2">
            <span>Contacto desde {dateFmt.format(data.createdAt)}</span>
            {data.customer ? (
              <AdminBadge tone="purple">Cuenta verificada</AdminBadge>
            ) : (
              <AdminBadge tone="slate">Invitado / sin cuenta</AdminBadge>
            )}
            {data.anonymizedAt && <AdminBadge tone="rose">Anonimizado Ley 1581</AdminBadge>}
            {data.kpis.paidOrdersCount >= 3 && <AdminBadge tone="emerald">Cliente VIP</AdminBadge>}
          </span>
        }
        breadcrumbs={[
          { label: "Admin", href: "/admin/dashboard" },
          { label: "Ventas" },
          { label: "Clientes", href: "/admin/clientes" },
          { label: data.displayName },
        ]}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            {waLink && (
              <a
                href={waLink}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex min-h-11 items-center gap-1.5 rounded-lg border border-emerald-600/30 bg-emerald-50 px-3.5 py-2 text-sm font-semibold text-emerald-800 transition-colors hover:bg-emerald-100"
              >
                <WhatsAppIcon className="h-4 w-4 text-emerald-700" />
                WhatsApp
              </a>
            )}
            <Link
              href="/admin/clientes"
              className="border-brand-purple/25 text-brand-purple-dark hover:bg-brand-purple/10 inline-flex min-h-11 items-center gap-1.5 rounded-lg border bg-white px-3.5 py-2 text-sm font-semibold transition-colors"
            >
              <ArrowLeft className="h-4 w-4" />
              Volver
            </Link>
          </div>
        }
      />

      <AdminPageBody>
        {/* Banner interactivo de embudo / abandono individual */}
        {data.dropOffSignals.length > 0 && (
          <AdminCard className="border-brand-purple/25 bg-gradient-to-r from-[#FFF8F0] to-white p-4">
            <div className="mb-2.5 flex items-center gap-2">
              <AlertTriangle className="text-brand-purple h-4 w-4" />
              <h2 className="text-brand-purple-dark text-xs font-bold tracking-wide uppercase">
                ¿Dónde quedó esta persona en su recorrido de compra?
              </h2>
            </div>
            <ul className="space-y-2.5">
              {data.dropOffSignals.map((sig, idx) => {
                const badge = DROP_OFF_BADGE[sig.stage];
                return (
                  <li
                    key={`${sig.stage}-${idx}`}
                    className="border-brand-purple/10 flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-white p-3"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <AdminBadge tone={badge.tone}>{badge.label}</AdminBadge>
                        <span className="text-brand-purple-dark text-sm font-semibold">
                          {sig.title}
                        </span>
                        <span className="text-brand-muted text-xs">
                          · {formatRelativeTime(sig.occurredAt)}
                        </span>
                      </div>
                      <p className="text-brand-purple-dark/80 mt-1 text-xs">{sig.detail}</p>
                    </div>
                    {sig.actionHref && sig.actionLabel && (
                      <Link
                        href={sig.actionHref}
                        className="bg-brand-purple inline-flex min-h-10 items-center rounded-lg px-3 py-1.5 text-xs font-semibold text-white hover:brightness-110"
                      >
                        {sig.actionLabel}
                      </Link>
                    )}
                  </li>
                );
              })}
            </ul>
          </AdminCard>
        )}

        {/* KPIs financieros + riesgo COD + cumplimiento Ley 1581 */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <AdminCard className="p-4">
            <div className="text-brand-muted flex items-center gap-1.5 text-xs font-semibold uppercase">
              <TrendingUp className="h-4 w-4" />
              LTV neto cobrado
            </div>
            <div className="text-brand-purple font-display mt-1 text-2xl font-bold tabular-nums">
              {formatCOP(data.kpis.netLtvCents)}
            </div>
            <p className="text-brand-muted mt-1 text-xs">
              {data.kpis.paidOrdersCount} compra{data.kpis.paidOrdersCount === 1 ? "" : "s"} · AOV{" "}
              {data.kpis.aovCents > 0 ? formatCOP(data.kpis.aovCents) : "—"}
            </p>
          </AdminCard>

          <AdminCard className="p-4">
            <div className="text-brand-muted flex items-center gap-1.5 text-xs font-semibold uppercase">
              <CreditCard className="h-4 w-4" />
              Semáforo contra entrega
            </div>
            <div className="mt-1.5">
              {data.kpis.codRiskLevel === "CLEAN" ? (
                <AdminBadge tone="emerald">Habilitado · Sin incidentes</AdminBadge>
              ) : data.kpis.codRiskLevel === "WATCH" ? (
                <AdminBadge tone="amber">En observación (no-show previo)</AdminBadge>
              ) : (
                <AdminBadge tone="rose">Bloqueado para COD</AdminBadge>
              )}
            </div>
            <p className="text-brand-muted mt-1.5 text-xs">{data.kpis.codRiskReason}</p>
          </AdminCard>

          <AdminCard className="p-4">
            <div className="text-brand-muted flex items-center gap-1.5 text-xs font-semibold uppercase">
              <ShieldCheck className="h-4 w-4" />
              Comunicaciones comerciales
            </div>
            <div className="mt-1.5">
              {data.kpis.marketingOptIn ? (
                <AdminBadge tone="emerald">Opt-in vigente (Ley 1581)</AdminBadge>
              ) : (
                <AdminBadge tone="slate">Sin opt-in comercial activo</AdminBadge>
              )}
            </div>
            <p className="text-brand-muted mt-1.5 text-xs">
              {data.kpis.marketingOptIn && data.kpis.marketingOptInAt
                ? `Autorizado el ${dateFmt.format(data.kpis.marketingOptInAt)}`
                : "Solo recibe notificaciones transaccionales de sus pedidos."}
            </p>
          </AdminCard>

          <AdminCard className="p-4">
            <div className="text-brand-muted flex items-center gap-1.5 text-xs font-semibold uppercase">
              <ShieldAlert className="h-4 w-4" />
              Posventa activa
            </div>
            <div className="text-brand-purple-dark font-display mt-1 text-2xl font-bold tabular-nums">
              {data.kpis.openCareCount}
            </div>
            <p className="text-brand-muted mt-1 text-xs">
              {data.kpis.openCareCount === 0
                ? "Sin tickets, garantías ni retractos abiertos"
                : "Caso(s) abierto(s) pendientes de gestión"}
            </p>
          </AdminCard>
        </div>

        {/* Datos de contacto + Organización B2B */}
        <AdminCard className="p-5">
          <h3 className="text-brand-purple-dark font-display mb-4 text-base font-bold">
            Ficha de identidad canónica
          </h3>
          <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Field
              icon={<Mail className="h-3.5 w-3.5" />}
              label="Email principal"
              value={
                data.primaryEmail && !data.piiMasked ? (
                  <a
                    href={`mailto:${data.primaryEmail}`}
                    className="text-brand-purple-dark hover:text-brand-purple"
                  >
                    {data.primaryEmail}
                  </a>
                ) : (
                  (data.primaryEmail ?? "—")
                )
              }
            />
            <Field
              icon={<Phone className="h-3.5 w-3.5" />}
              label="Celular principal"
              value={
                data.primaryPhoneE164 && !data.piiMasked ? (
                  <a
                    href={`tel:${data.primaryPhoneE164}`}
                    className="text-brand-purple-dark hover:text-brand-purple"
                  >
                    {data.primaryPhoneE164}
                  </a>
                ) : (
                  (data.primaryPhoneE164 ?? "—")
                )
              }
            />
            <Field
              icon={<Hash className="h-3.5 w-3.5" />}
              label="Documento tributario"
              value={data.documentLabel ?? "Sin registrar"}
            />
            <Field
              icon={<Building2 className="h-3.5 w-3.5" />}
              label="Organización / Responsable"
              value={
                data.organization
                  ? `${data.organization.name}${data.organization.taxLabel ? ` (${data.organization.taxLabel})` : ""}`
                  : data.ownerAdminEmail
                    ? `Asignado a ${data.ownerAdminEmail}`
                    : "Persona natural (B2C)"
              }
            />
          </dl>
        </AdminCard>

        {/* Seguimiento CRM: tareas operativas + bitácora transversal */}
        <CrmWorkspacePanel
          contactId={data.id}
          currentAdminId={session.admin.id}
          canManageTasks={canManageTasks}
          canViewActivities={!data.piiMasked}
          canManageActivities={canManageActivities && !data.piiMasked}
          tasks={crmTasks}
          activities={data.piiMasked ? [] : crmActivities}
          assignableAdmins={assignableAdmins}
        />

        {/* Pestañas interactivas 360 */}
        <Contact360Tabs data={data} canMerge={canMerge} />
      </AdminPageBody>
    </AdminPage>
  );
}

function Field({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div>
      <dt className="text-brand-muted mb-0.5 flex items-center gap-1 text-[11px] font-semibold tracking-wider uppercase">
        {icon}
        {label}
      </dt>
      <dd className="text-brand-purple-dark text-sm font-medium break-all">{value}</dd>
    </div>
  );
}
