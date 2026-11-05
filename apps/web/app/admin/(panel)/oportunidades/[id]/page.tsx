/*
 * Admin > Oportunidades B2B > [id] — Detalle y seguimiento de oportunidad consultiva (`S24`).
 */

import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Building2, Calendar, MapPin, Package, ShieldCheck, User } from "lucide-react";
import {
  AdminBadge,
  AdminCard,
  AdminPage,
  AdminPageBody,
  AdminPageHeader,
} from "@/components/admin-page";
import { CrmWorkspacePanel } from "@/components/admin/crm-workspace-panel";
import { WhatsAppIcon } from "@/components/icons/brand";
import { hasCapability } from "@/lib/admin-rbac";
import { requireCapability } from "@/lib/admin-rbac-guard";
import { customerWaLink } from "@/lib/wa";
import { formatCOP } from "@/lib/format";
import {
  listActivitiesForEntity,
  listAssignableCrmAdmins,
  listTasksForEntity,
} from "@/features/crm/service";
import {
  isOpportunityEventType,
  isOpportunityStage,
  OPPORTUNITY_EVENT_LABELS,
  OPPORTUNITY_STAGE_LABELS,
  OPPORTUNITY_STAGE_TONES,
} from "@/features/opportunities/schemas";
import {
  getOpportunityDetail,
  listAssignableOpportunityAdmins,
} from "@/features/opportunities/service";
import { OpportunityEditForm } from "./opportunity-edit-form";
import { formatDateCO } from "@/lib/datetime";

export const metadata: Metadata = {
  title: "Detalle Oportunidad B2B",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default async function AdminOpportunityDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await requireCapability("opportunities:manage");
  const role = session.admin.role;
  const canManageTasks = hasCapability(role, "crm:manage_tasks");
  const canManageActivities = hasCapability(role, "crm:manage_activities");
  const canViewActivities =
    hasCapability(role, "contacts:read_360") && hasCapability(role, "contacts:read_pii");

  const { id } = await params;
  const [opp, assignableAdmins, crmAssignableAdmins] = await Promise.all([
    getOpportunityDetail(decodeURIComponent(id)),
    listAssignableOpportunityAdmins(),
    canManageTasks ? listAssignableCrmAdmins() : Promise.resolve([]),
  ]);
  if (!opp) notFound();

  const [crmTasks, crmActivities] = await Promise.all([
    listTasksForEntity({ opportunityId: opp.id }),
    canViewActivities
      ? listActivitiesForEntity({ contactId: opp.contact.id })
      : Promise.resolve([]),
  ]);

  const stage = isOpportunityStage(opp.stage) ? opp.stage : "NEW";
  const eventType = isOpportunityEventType(opp.eventType) ? opp.eventType : "OTHER";
  const contactName =
    opp.contactName ??
    opp.contact.displayName ??
    opp.contactEmail ??
    opp.contact.primaryEmail ??
    "Contacto B2B";
  const contactEmail = opp.contactEmail ?? opp.contact.primaryEmail;
  const contactWhatsapp = opp.contactWhatsapp ?? opp.contact.primaryPhoneE164;
  const waLink = contactWhatsapp
    ? customerWaLink(
        contactWhatsapp,
        `Hola ${contactName}, te escribo de Lucams Shop sobre tu solicitud ${opp.number}. `,
      )
    : null;

  return (
    <AdminPage>
      <AdminPageHeader
        icon={<Building2 className="h-5 w-5" />}
        title={`${opp.number} · ${opp.title}`}
        subtitle={
          <span className="inline-flex flex-wrap items-center gap-2">
            <AdminBadge tone={OPPORTUNITY_STAGE_TONES[stage]}>
              {OPPORTUNITY_STAGE_LABELS[stage]}
            </AdminBadge>
            <AdminBadge tone="slate">{OPPORTUNITY_EVENT_LABELS[eventType]}</AdminBadge>
            <span>Creada el {formatDateCO(opp.createdAt)}</span>
          </span>
        }
        breadcrumbs={[
          { label: "Admin", href: "/admin/dashboard" },
          { label: "Oportunidades B2B", href: "/admin/oportunidades" },
          { label: opp.number },
        ]}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            {waLink && (
              <a
                href={waLink}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex min-h-11 items-center gap-1.5 rounded-xl border border-emerald-600/30 bg-emerald-50 px-3.5 py-2 text-xs font-semibold text-emerald-800 hover:bg-emerald-100"
              >
                <WhatsAppIcon className="h-4 w-4 text-emerald-700" />
                WhatsApp
              </a>
            )}
            <Link
              href="/admin/oportunidades"
              className="border-brand-purple/25 text-brand-purple-dark hover:bg-brand-purple/10 inline-flex min-h-11 items-center gap-1.5 rounded-xl border bg-white px-3.5 py-2 text-xs font-semibold"
            >
              <ArrowLeft className="h-4 w-4" />
              Volver
            </Link>
          </div>
        }
      />

      <AdminPageBody>
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
          <div className="space-y-5 lg:col-span-2">
            {/* Solicitud original del cliente */}
            <AdminCard className="p-5">
              <h2 className="text-brand-purple-dark font-display text-base font-bold">
                Requerimiento del cliente
              </h2>
              <p className="text-brand-purple-dark/90 mt-2 text-sm whitespace-pre-wrap">
                {opp.notes || "Sin notas adicionales."}
              </p>

              <div className="text-brand-muted mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 border-t pt-3 text-xs">
                {opp.city && (
                  <span className="inline-flex items-center gap-1">
                    <MapPin className="h-3.5 w-3.5" />
                    {opp.city}
                    {opp.department ? `, ${opp.department}` : ""}
                  </span>
                )}
                {opp.eventDate && (
                  <span className="inline-flex items-center gap-1">
                    <Calendar className="h-3.5 w-3.5" />
                    Fecha ideal: {formatDateCO(opp.eventDate)}
                  </span>
                )}
                {opp.utmSource && (
                  <span>
                    Origen UTM: <code className="font-mono">{opp.utmSource}</code>
                    {opp.utmCampaign ? ` / ${opp.utmCampaign}` : ""}
                  </span>
                )}
              </div>
            </AdminCard>

            <OpportunityEditForm
              opportunityId={opp.id}
              initialStage={stage}
              initialExpectedUnits={opp.expectedUnits}
              initialExpectedAmountCop={opp.expectedAmountCop}
              initialOwnerAdminId={opp.ownerAdminId}
              initialInternalNotes={opp.internalNotes}
              initialLostReason={opp.lostReason}
              initialConvertedOrderNumber={opp.convertedOrder?.number ?? null}
              initialContactName={contactName}
              initialContactEmail={contactEmail}
              initialContactWhatsapp={contactWhatsapp}
              currentAdminId={session.admin.id}
              assignableAdmins={assignableAdmins}
            />

            <CrmWorkspacePanel
              title="Tareas y bitácora de esta oportunidad"
              contactId={canViewActivities ? opp.contact.id : null}
              currentAdminId={session.admin.id}
              canManageTasks={canManageTasks}
              canViewActivities={canViewActivities}
              canManageActivities={canManageActivities}
              tasks={crmTasks}
              activities={crmActivities}
              assignableAdmins={crmAssignableAdmins}
              compact
            />
          </div>

          <aside className="space-y-4">
            <AdminCard className="p-4">
              <h2 className="text-brand-purple-dark flex items-center gap-1.5 text-sm font-bold">
                <User className="h-4 w-4" /> Contacto del cliente
              </h2>
              <p className="text-brand-purple-dark mt-2 text-sm font-semibold">{contactName}</p>
              {contactEmail && <p className="text-brand-muted text-xs break-all">{contactEmail}</p>}
              {contactWhatsapp && (
                <p className="text-brand-muted text-xs tabular-nums">{contactWhatsapp}</p>
              )}
              <Link
                href={`/admin/clientes/${encodeURIComponent(opp.contact.id)}`}
                className="text-brand-purple hover:text-brand-purple-dark mt-2 inline-block text-xs font-semibold underline underline-offset-2"
              >
                Abrir Contacto 360 →
              </Link>
            </AdminCard>

            {opp.convertedQuote && (
              <AdminCard className="border-brand-purple/25 bg-[#FFF8F0]/60 p-4">
                <h2 className="text-brand-purple-dark flex items-center gap-1.5 text-sm font-bold">
                  <Package className="h-4 w-4" /> Cotización origen
                </h2>
                <Link
                  href={`/admin/cotizaciones/${encodeURIComponent(opp.convertedQuote.id)}`}
                  className="text-brand-purple hover:text-brand-purple-dark mt-2 inline-block font-mono text-sm font-bold underline underline-offset-2"
                >
                  {opp.convertedQuote.number}
                </Link>
                <p className="text-brand-muted mt-0.5 text-xs">
                  Total cotizado: {formatCOP(opp.convertedQuote.total)}
                </p>
              </AdminCard>
            )}

            {opp.organization && (
              <AdminCard className="p-4">
                <h2 className="text-brand-purple-dark flex items-center gap-1.5 text-sm font-bold">
                  <Building2 className="h-4 w-4" /> Organización B2B
                </h2>
                <p className="text-brand-purple-dark mt-2 text-sm font-semibold">
                  {opp.organization.name}
                </p>
                {opp.organization.taxIdNumber && (
                  <p className="text-brand-muted mt-0.5 font-mono text-xs">
                    {opp.organization.taxIdType ?? "NIT"} {opp.organization.taxIdNumber}
                  </p>
                )}
              </AdminCard>
            )}

            {opp.convertedOrder && (
              <AdminCard className="border-emerald-500/30 bg-emerald-50/40 p-4">
                <h2 className="flex items-center gap-1.5 text-sm font-bold text-emerald-900">
                  <Package className="h-4 w-4" /> Pedido convertido
                </h2>
                <Link
                  href={`/admin/pedidos/${encodeURIComponent(opp.convertedOrder.number)}`}
                  className="mt-2 inline-block font-mono text-sm font-bold text-emerald-800 underline underline-offset-2"
                >
                  {opp.convertedOrder.number}
                </Link>
                <p className="mt-0.5 text-xs text-emerald-800">
                  Total pedido: {formatCOP(opp.convertedOrder.total)}
                </p>
              </AdminCard>
            )}

            <AdminCard className="p-4">
              <h2 className="text-brand-purple-dark flex items-center gap-1.5 text-sm font-bold">
                <ShieldCheck className="h-4 w-4" /> Evidencia Ley 1581
              </h2>
              <p className="text-brand-muted mt-1.5 text-xs">
                {opp.dataConsentAt
                  ? `Autorización otorgada el ${formatDateCO(opp.dataConsentAt)} (${opp.dataConsentVersion ?? "vigente"}).`
                  : "Registrada internamente."}
              </p>
            </AdminCard>
          </aside>
        </div>
      </AdminPageBody>
    </AdminPage>
  );
}
