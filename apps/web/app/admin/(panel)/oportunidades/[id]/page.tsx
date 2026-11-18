/*
 * Admin > Oportunidades B2B > [id] — Detalle, seguimiento y Constructor de Propuestas (`S24` + `ADR-210`).
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
import { canAccessAdminPath, hasCapability } from "@/lib/admin-rbac";
import { requireCapability } from "@/lib/admin-rbac-guard";
import { getDirectPaymentConfig } from "@/lib/direct-payment-config";
import { getCanonicalSiteUrl } from "@/lib/origin";
import { maskEmail, maskPersonName, maskPhone, maskTaxDocument } from "@/lib/pii-mask";
import { customerWaLink } from "@/lib/wa";
import { formatCOP } from "@/lib/format";
import { formatDateCO } from "@/lib/datetime";
import {
  listActivitiesForEntity,
  listAssignableCrmAdmins,
  listTasksForEntity,
} from "@/features/crm/service";
import {
  B2B_ARTWORK_MODE_LABELS,
  B2B_PACKAGING_TYPE_LABELS,
  B2bRequestedConfigSchema,
  isOpportunityEventType,
  isOpportunityStage,
  isProposalStatus,
  OPPORTUNITY_EVENT_LABELS,
  OPPORTUNITY_STAGE_LABELS,
  OPPORTUNITY_STAGE_TONES,
  PROPOSAL_STATUS_LABELS,
  PROPOSAL_STATUS_TONES,
} from "@/features/opportunities/schemas";
import {
  getOpportunityDetail,
  getServerNowMs,
  listAssignableOpportunityAdmins,
} from "@/features/opportunities/service";
import { getAdminProposalCatalog } from "@/features/opportunities/configurator-catalog";
import { OpportunityEditForm } from "./opportunity-edit-form";
import { ProposalBuilder, type ExistingProposalSummary } from "./proposal-builder";

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
  const canReadPii = hasCapability(role, "contacts:read_pii");
  const canPropose = hasCapability(role, "opportunities:propose");
  const canManageTasks = hasCapability(role, "crm:manage_tasks");
  const canManageActivities = hasCapability(role, "crm:manage_activities");
  const canViewActivities = hasCapability(role, "contacts:read_360") && canReadPii;
  const canViewContacts = canAccessAdminPath(role, "/admin/clientes");
  const canViewOrders = canAccessAdminPath(role, "/admin/pedidos");
  const canViewSupport = canAccessAdminPath(role, "/admin/soporte");

  const { id } = await params;
  const [opp, assignableAdmins, crmAssignableAdmins, nowMs, proposalCatalog] = await Promise.all([
    getOpportunityDetail(decodeURIComponent(id)),
    listAssignableOpportunityAdmins(),
    canManageTasks ? listAssignableCrmAdmins() : Promise.resolve([]),
    getServerNowMs(),
    canPropose ? getAdminProposalCatalog() : Promise.resolve(null),
  ]);
  if (!opp) notFound();

  const [crmTasks, crmActivities] = await Promise.all([
    listTasksForEntity({ opportunityId: opp.id }),
    canViewActivities
      ? listActivitiesForEntity({ contactId: opp.contact.id })
      : Promise.resolve([]),
  ]);

  const parsedConfig = B2bRequestedConfigSchema.safeParse(opp.requestedConfig);
  const requestedConfig = parsedConfig.success ? parsedConfig.data : null;
  const directPaymentConfigured = getDirectPaymentConfig().enabled;
  const siteOrigin = getCanonicalSiteUrl();

  const stage = isOpportunityStage(opp.stage) ? opp.stage : "NEW";
  const eventType = isOpportunityEventType(opp.eventType) ? opp.eventType : "OTHER";
  const isOpenStage = stage === "NEW" || stage === "QUALIFYING" || stage === "PROPOSAL_SENT";
  const eventMs = opp.eventDate ? opp.eventDate.getTime() : null;
  const isEventOverdue = isOpenStage && eventMs !== null && eventMs < nowMs;
  const isEventSoon =
    isOpenStage &&
    eventMs !== null &&
    eventMs >= nowMs &&
    eventMs <= nowMs + 14 * 24 * 60 * 60 * 1000;

  const rawContactName =
    opp.contactName ??
    opp.contact.displayName ??
    opp.contactEmail ??
    opp.contact.primaryEmail ??
    "Contacto B2B";
  const rawContactEmail = opp.contactEmail ?? opp.contact.primaryEmail;
  const rawContactWhatsapp = opp.contactWhatsapp ?? opp.contact.primaryPhoneE164;

  const contactName = canReadPii ? rawContactName : maskPersonName(rawContactName);
  const contactEmail = rawContactEmail
    ? canReadPii
      ? rawContactEmail
      : maskEmail(rawContactEmail)
    : null;
  const contactWhatsapp = rawContactWhatsapp
    ? canReadPii
      ? rawContactWhatsapp
      : maskPhone(rawContactWhatsapp)
    : null;
  const displayTitle = canReadPii
    ? opp.title
    : opp.organization
      ? `${opp.organization.name} · ${OPPORTUNITY_EVENT_LABELS[eventType]}`
      : opp.number;
  const waLink =
    canReadPii && rawContactWhatsapp
      ? customerWaLink(
          rawContactWhatsapp,
          `Hola ${rawContactName}, te escribo de Lucams Shop sobre tu solicitud ${opp.number}. `,
        )
      : null;

  const proposalSummaries: ExistingProposalSummary[] = opp.proposals.map((p) => ({
    id: p.id,
    version: p.version,
    number: p.number,
    status: p.status,
    validUntilIso: p.validUntil.toISOString(),
    proofMode: p.proofMode,
    hasProofAsset: Boolean(p.proofAssetPath),
    artworkMode: p.artworkMode,
    packagingType: p.packagingType,
    estimatedProductionDays: p.estimatedProductionDays,
    shippingMode: p.shippingMode,
    shippingCarrier: p.shippingCarrier,
    shippingService: p.shippingService,
    packageCount: p.packageCount,
    departmentCode: p.departmentCode,
    cityCode: p.cityCode,
    subtotalCents: p.subtotalCents,
    discountCents: p.discountCents,
    shippingCents: p.shippingCents,
    totalCents: p.totalCents,
    allowDirectTransfer: p.allowDirectTransfer,
    clientNotes: p.clientNotes,
    termsNotes: p.termsNotes,
    sentAtIso: p.sentAt ? p.sentAt.toISOString() : null,
    orderNumber: p.order?.number ?? null,
    orderStatus: p.order?.status ?? null,
    items: p.items.map((it) => ({
      id: it.id,
      variantId: it.variantId,
      titleSnapshot: it.titleSnapshot,
      skuSnapshot: it.skuSnapshot,
      qty: it.qty,
      designUnits: it.designUnits,
      unitPriceCents: it.unitPriceCents,
      packagingNote: it.packagingNote,
    })),
  }));

  return (
    <AdminPage>
      <AdminPageHeader
        icon={<Building2 className="h-5 w-5" />}
        title={`${opp.number} · ${displayTitle}`}
        subtitle={
          <span className="inline-flex flex-wrap items-center gap-2">
            <AdminBadge tone={OPPORTUNITY_STAGE_TONES[stage]}>
              {OPPORTUNITY_STAGE_LABELS[stage]}
            </AdminBadge>
            <AdminBadge tone="slate">{OPPORTUNITY_EVENT_LABELS[eventType]}</AdminBadge>
            {isEventOverdue && <AdminBadge tone="rose">Evento vencido</AdminBadge>}
            {isEventSoon && <AdminBadge tone="amber">Evento ≤ 14 días</AdminBadge>}
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
            {/* Solicitud original y configuración estructurada del cliente */}
            <AdminCard className="p-5">
              <h2 className="text-brand-purple-dark font-display text-base font-bold">
                Requerimiento configurado por el cliente
              </h2>

              {requestedConfig && requestedConfig.lines.length > 0 && (
                <div className="mt-3 rounded-xl border bg-[#FFF8F0]/60 p-3.5 text-xs">
                  <p className="text-brand-purple-dark font-bold">Referencias solicitadas</p>
                  <ul className="mt-1.5 space-y-1">
                    {requestedConfig.lines.map((line, i) => (
                      <li
                        key={`${line.variantId}-${i}`}
                        className="flex flex-wrap justify-between gap-2"
                      >
                        <span>
                          <strong>{line.productName}</strong> · {line.variantName} ({line.sku})
                        </span>
                        <span className="font-semibold">
                          {line.piecesPerUnit > 1
                            ? `${line.commercialQty} packs (${line.physicalPieces} piezas)`
                            : `${line.physicalPieces} uds.`}{" "}
                          · ref. {formatCOP(line.indicativeUnitCents)}
                        </span>
                      </li>
                    ))}
                  </ul>
                  <div className="text-brand-muted mt-2 flex flex-wrap gap-x-4 gap-y-1 border-t pt-2 text-[11px]">
                    <span>Arte: {B2B_ARTWORK_MODE_LABELS[requestedConfig.artworkMode]}</span>
                    <span>Empaque: {B2B_PACKAGING_TYPE_LABELS[requestedConfig.packagingType]}</span>
                    {requestedConfig.estimatedMinCents != null &&
                      requestedConfig.estimatedMaxCents != null && (
                        <span>
                          Rango orientativo visto: {formatCOP(requestedConfig.estimatedMinCents)} –{" "}
                          {formatCOP(requestedConfig.estimatedMaxCents)}
                        </span>
                      )}
                  </div>
                </div>
              )}

              <p className="text-brand-purple-dark/90 mt-3 text-sm whitespace-pre-wrap">
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
                  <span
                    className={`inline-flex items-center gap-1 ${
                      isEventOverdue
                        ? "font-semibold text-rose-700"
                        : isEventSoon
                          ? "font-semibold text-amber-800"
                          : ""
                    }`}
                  >
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

            {/* Constructor de Propuestas (roles con opportunities:propose) o vista de lectura para Soporte */}
            {canPropose && proposalCatalog ? (
              <ProposalBuilder
                opportunityId={opp.id}
                opportunityNumber={opp.number}
                contactName={rawContactName}
                contactEmail={canReadPii ? rawContactEmail : null}
                contactWhatsappE164={canReadPii ? rawContactWhatsapp : null}
                defaultCityName={opp.city}
                defaultDeptName={opp.department}
                requestedConfig={requestedConfig}
                existingProposals={proposalSummaries}
                catalog={proposalCatalog}
                directPaymentConfigured={directPaymentConfigured}
                isSuperadmin={role === "SUPERADMIN"}
                siteOrigin={siteOrigin}
              />
            ) : (
              proposalSummaries.length > 0 && (
                <AdminCard className="p-5">
                  <h2 className="text-brand-purple-dark font-display text-base font-bold">
                    Propuestas comerciales emitidas
                  </h2>
                  <div className="mt-3 divide-y rounded-xl border text-xs">
                    {proposalSummaries.map((p) => {
                      const st = isProposalStatus(p.status) ? p.status : "DRAFT";
                      return (
                        <div
                          key={p.id}
                          className="flex flex-wrap items-center justify-between gap-2 px-3.5 py-2.5"
                        >
                          <div className="flex items-center gap-2">
                            <span className="font-mono font-bold">{p.number}</span>
                            <AdminBadge tone={PROPOSAL_STATUS_TONES[st]}>
                              {PROPOSAL_STATUS_LABELS[st]}
                            </AdminBadge>
                          </div>
                          <span className="font-semibold">{formatCOP(p.totalCents)}</span>
                        </div>
                      );
                    })}
                  </div>
                </AdminCard>
              )
            )}

            <OpportunityEditForm
              opportunityId={opp.id}
              initialStage={stage}
              initialExpectedUnits={opp.expectedUnits}
              initialExpectedAmountCop={opp.expectedAmountCop}
              initialOwnerAdminId={opp.ownerAdminId}
              initialInternalNotes={opp.internalNotes}
              initialLostReason={opp.lostReason}
              initialConvertedOrderNumber={opp.convertedOrder?.number ?? null}
              initialContactName={rawContactName}
              initialContactEmail={rawContactEmail}
              initialContactWhatsapp={rawContactWhatsapp}
              canEditContactPii={canReadPii}
              currentAdminId={session.admin.id}
              assignableAdmins={assignableAdmins}
            />

            <CrmWorkspacePanel
              title="Tareas y bitácora de esta oportunidad"
              contactId={canViewActivities ? opp.contact.id : null}
              opportunityId={opp.id}
              opportunityNumber={opp.number}
              currentAdminId={session.admin.id}
              canManageTasks={canManageTasks}
              canViewActivities={canViewActivities}
              canManageActivities={canManageActivities}
              canLinkOrder={canViewOrders}
              canLinkTicket={canViewSupport}
              canLinkOpportunity={true}
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
              {canViewContacts && (
                <Link
                  href={`/admin/clientes/${encodeURIComponent(opp.contact.id)}`}
                  className="text-brand-purple hover:text-brand-purple-dark mt-2 inline-block text-xs font-semibold underline underline-offset-2"
                >
                  Abrir Contacto 360 →
                </Link>
              )}
            </AdminCard>

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
                    {canReadPii
                      ? `${opp.organization.taxIdType ?? "NIT"} ${opp.organization.taxIdNumber}`
                      : maskTaxDocument(
                          opp.organization.taxIdType ?? "NIT",
                          opp.organization.taxIdNumber,
                        )}
                  </p>
                )}
              </AdminCard>
            )}

            {opp.convertedOrder && (
              <AdminCard className="border-emerald-500/30 bg-emerald-50/40 p-4">
                <h2 className="flex items-center gap-1.5 text-sm font-bold text-emerald-900">
                  <Package className="h-4 w-4" /> Pedido convertido
                </h2>
                {canViewOrders ? (
                  <Link
                    href={`/admin/pedidos/${encodeURIComponent(opp.convertedOrder.number)}`}
                    className="mt-2 inline-block font-mono text-sm font-bold text-emerald-800 underline underline-offset-2"
                  >
                    {opp.convertedOrder.number}
                  </Link>
                ) : (
                  <p className="mt-2 font-mono text-sm font-bold text-emerald-800">
                    {opp.convertedOrder.number}
                  </p>
                )}
                <p className="mt-0.5 text-xs text-emerald-800">
                  Total pedido: {formatCOP(opp.convertedOrder.total)} · {opp.convertedOrder.status}
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
