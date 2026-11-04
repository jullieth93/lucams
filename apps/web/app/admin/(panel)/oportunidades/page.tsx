/*
 * Admin > Ventas > Oportunidades B2B (`/admin/oportunidades` · `Fase 12 · S24`).
 */

import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowRight,
  Building2,
  Calendar,
  ExternalLink,
  Search,
  Sparkles,
  TrendingUp,
  Trophy,
} from "lucide-react";
import {
  AdminBadge,
  AdminCard,
  AdminPage,
  AdminPageBody,
  AdminPageHeader,
} from "@/components/admin-page";
import { WhatsAppIcon } from "@/components/icons/brand";
import { requireCapability } from "@/lib/admin-rbac-guard";
import { customerWaLink } from "@/lib/wa";
import { formatCOP } from "@/lib/format";
import {
  isOpportunityStage,
  OPPORTUNITY_EVENT_LABELS,
  OPPORTUNITY_STAGE_LABELS,
  OPPORTUNITY_STAGE_TONES,
  OPPORTUNITY_STAGES,
} from "@/features/opportunities/schemas";
import { listOpportunitiesForAdmin } from "@/features/opportunities/service";

export const metadata: Metadata = {
  title: "Oportunidades B2B y Eventos",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

type SearchParams = Promise<{ stage?: string; q?: string }>;

const dateFmt = new Intl.DateTimeFormat("es-CO", {
  day: "2-digit",
  month: "short",
  year: "numeric",
});

export default async function AdminOportunidadesPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  await requireCapability("opportunities:manage");
  const sp = await searchParams;
  const activeStage = sp.stage && isOpportunityStage(sp.stage) ? sp.stage : undefined;
  const q = sp.q?.trim() ?? "";

  const { items, kpis } = await listOpportunitiesForAdmin({
    stage: activeStage,
    q,
  });

  const openCount =
    kpis.stageCounts.NEW + kpis.stageCounts.QUALIFYING + kpis.stageCounts.PROPOSAL_SENT;

  return (
    <AdminPage>
      <AdminPageHeader
        icon={<Building2 className="h-5 w-5" />}
        title="Oportunidades B2B y Eventos"
        subtitle="Pipeline consultivo para empresas, bodas, grados y proyectos por volumen (separado de pedidos B2C)"
        breadcrumbs={[
          { label: "Admin", href: "/admin/dashboard" },
          { label: "Ventas" },
          { label: "Oportunidades B2B" },
        ]}
        actions={
          <Link
            href="/empresas-y-eventos"
            target="_blank"
            className="border-brand-purple/25 text-brand-purple-dark hover:bg-brand-purple/10 inline-flex min-h-11 items-center gap-1.5 rounded-xl border bg-white px-3.5 py-2 text-xs font-semibold transition-colors"
          >
            Ver formulario público
            <ExternalLink className="h-3.5 w-3.5" />
          </Link>
        }
      />

      <AdminPageBody>
        {/* KPIs del pipeline consultivo */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <AdminCard className="p-4">
            <div className="text-brand-muted flex items-center gap-1.5 text-xs font-semibold uppercase">
              <Sparkles className="text-brand-purple h-4 w-4" />
              Oportunidades activas
            </div>
            <div className="text-brand-purple-dark font-display mt-1 text-2xl font-bold tabular-nums">
              {openCount}
            </div>
            <p className="text-brand-muted mt-1 text-xs">
              {kpis.stageCounts.NEW} nuevas · {kpis.stageCounts.PROPOSAL_SENT} con propuesta
            </p>
          </AdminCard>

          <AdminCard className="p-4">
            <div className="text-brand-muted flex items-center gap-1.5 text-xs font-semibold uppercase">
              <TrendingUp className="h-4 w-4 text-blue-600" />
              Pipeline abierto estimado
            </div>
            <div className="text-brand-purple font-display mt-1 text-2xl font-bold tabular-nums">
              {formatCOP(kpis.openPipelineCents)}
            </div>
            <p className="text-brand-muted mt-1 text-xs">
              Suma de presupuestos en calificación o propuesta
            </p>
          </AdminCard>

          <AdminCard className="p-4">
            <div className="text-brand-muted flex items-center gap-1.5 text-xs font-semibold uppercase">
              <Trophy className="h-4 w-4 text-emerald-600" />
              Negocios ganados
            </div>
            <div className="font-display mt-1 text-2xl font-bold text-emerald-700 tabular-nums">
              {formatCOP(kpis.wonRevenueCents)}
            </div>
            <p className="text-brand-muted mt-1 text-xs">
              {kpis.stageCounts.WON} oportunidad{kpis.stageCounts.WON === 1 ? "" : "es"} cerrada
              {kpis.stageCounts.WON === 1 ? "" : "s"} con éxito
            </p>
          </AdminCard>

          <AdminCard className="p-4">
            <div className="text-brand-muted flex items-center gap-1.5 text-xs font-semibold uppercase">
              <Building2 className="h-4 w-4 text-slate-600" />
              Histórico total
            </div>
            <div className="text-brand-purple-dark font-display mt-1 text-2xl font-bold tabular-nums">
              {kpis.total}
            </div>
            <p className="text-brand-muted mt-1 text-xs">
              {kpis.stageCounts.LOST} marcada{kpis.stageCounts.LOST === 1 ? "" : "s"} como perdida
              {kpis.stageCounts.LOST === 1 ? "" : "s"}
            </p>
          </AdminCard>
        </div>

        {/* Filtros por etapa + buscador */}
        <AdminCard className="p-4">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex flex-wrap items-center gap-1.5">
              <Link
                href={
                  q ? `/admin/oportunidades?q=${encodeURIComponent(q)}` : "/admin/oportunidades"
                }
                className={`inline-flex min-h-10 items-center gap-1.5 rounded-xl border px-3 py-1.5 text-xs font-semibold transition-colors ${
                  !activeStage
                    ? "border-brand-purple bg-brand-purple text-white"
                    : "border-brand-purple/15 text-brand-purple-dark hover:bg-brand-purple/10 bg-[#FFF8F0]/60"
                }`}
              >
                Todas ({kpis.total})
              </Link>
              {OPPORTUNITY_STAGES.map((st) => {
                const selected = activeStage === st;
                const params = new URLSearchParams();
                params.set("stage", st);
                if (q) params.set("q", q);
                return (
                  <Link
                    key={st}
                    href={`/admin/oportunidades?${params.toString()}`}
                    className={`inline-flex min-h-10 items-center gap-1.5 rounded-xl border px-3 py-1.5 text-xs font-semibold transition-colors ${
                      selected
                        ? "border-brand-purple bg-brand-purple text-white"
                        : "border-brand-purple/15 text-brand-purple-dark hover:bg-brand-purple/10 bg-[#FFF8F0]/60"
                    }`}
                  >
                    {OPPORTUNITY_STAGE_LABELS[st]} ({kpis.stageCounts[st]})
                  </Link>
                );
              })}
            </div>

            <form action="/admin/oportunidades" method="GET" className="relative w-full lg:w-72">
              {activeStage && <input type="hidden" name="stage" value={activeStage} />}
              <Search className="text-brand-muted pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2" />
              <input
                type="search"
                name="q"
                defaultValue={q}
                placeholder="Buscar OP-..., empresa o cliente..."
                className="border-brand-purple/20 text-brand-purple-dark focus:border-brand-purple min-h-10 w-full rounded-xl border bg-white pr-3 pl-9 text-xs focus:outline-none"
              />
            </form>
          </div>
        </AdminCard>

        {/* Listado de oportunidades */}
        {items.length === 0 ? (
          <AdminCard className="p-8 text-center">
            <p className="text-brand-purple-dark font-display text-base font-bold">
              No hay oportunidades en esta vista
            </p>
            <p className="text-brand-muted mt-1 text-xs">
              Las solicitudes recibidas desde <code className="font-mono">/empresas-y-eventos</code>{" "}
              aparecen aquí automáticamente con su tarea en Bandeja Hoy.
            </p>
          </AdminCard>
        ) : (
          <ul className="space-y-3">
            {items.map((opp) => {
              const wa = opp.contactPhone
                ? customerWaLink(
                    opp.contactPhone,
                    `Hola ${opp.contactName}, te escribo de Lucams Shop sobre tu proyecto ${opp.number}. `,
                  )
                : null;
              return (
                <li
                  key={opp.id}
                  className="border-brand-purple/15 rounded-2xl border bg-white p-4 shadow-xs"
                >
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-brand-purple font-mono text-xs font-bold">
                          {opp.number}
                        </span>
                        <AdminBadge tone={OPPORTUNITY_STAGE_TONES[opp.stage]}>
                          {OPPORTUNITY_STAGE_LABELS[opp.stage]}
                        </AdminBadge>
                        <AdminBadge tone="slate">
                          {OPPORTUNITY_EVENT_LABELS[opp.eventType]}
                        </AdminBadge>
                        {opp.expectedUnits !== null && (
                          <span className="text-brand-purple-dark text-xs font-semibold">
                            · {opp.expectedUnits} uds.
                          </span>
                        )}
                        {opp.expectedAmountCop > 0 && (
                          <span className="text-xs font-bold text-emerald-700">
                            · {formatCOP(opp.expectedAmountCop)}
                          </span>
                        )}
                      </div>

                      <h2 className="text-brand-purple-dark mt-1.5 text-sm font-bold">
                        {opp.title}
                      </h2>

                      <div className="text-brand-muted mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
                        <span>
                          Contacto:{" "}
                          <Link
                            href={`/admin/clientes/${encodeURIComponent(opp.contactId)}`}
                            className="text-brand-purple-dark hover:text-brand-purple font-medium underline underline-offset-2"
                          >
                            {opp.contactName}
                          </Link>
                        </span>
                        {opp.organizationName && <span>Empresa: {opp.organizationName}</span>}
                        {opp.city && <span>Ciudad: {opp.city}</span>}
                        {opp.eventDate && (
                          <span className="inline-flex items-center gap-1">
                            <Calendar className="h-3 w-3" />
                            Evento: {dateFmt.format(opp.eventDate)}
                          </span>
                        )}
                        <span>
                          Responsable:{" "}
                          <strong className="text-brand-purple-dark font-medium">
                            {opp.ownerAdminEmail ?? "Sin asignar"}
                          </strong>
                        </span>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2 sm:shrink-0">
                      {wa && (
                        <a
                          href={wa}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex min-h-10 items-center gap-1.5 rounded-xl border border-emerald-600/30 bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-800 hover:bg-emerald-100"
                        >
                          <WhatsAppIcon className="h-3.5 w-3.5 text-emerald-700" />
                          WhatsApp
                        </a>
                      )}
                      <Link
                        href={`/admin/oportunidades/${encodeURIComponent(opp.id)}`}
                        className="bg-brand-purple inline-flex min-h-10 items-center gap-1.5 rounded-xl px-3.5 py-2 text-xs font-semibold text-white hover:brightness-110"
                      >
                        Gestionar
                        <ArrowRight className="h-3.5 w-3.5" />
                      </Link>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </AdminPageBody>
    </AdminPage>
  );
}
