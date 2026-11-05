import type { Metadata } from "next";
import Link from "next/link";
import {
  CalendarHeart,
  Crown,
  Gift,
  RotateCcw,
  Search,
  ShieldCheck,
  Sparkles,
  Users,
} from "lucide-react";
import {
  AdminBadge,
  AdminCard,
  AdminEmpty,
  AdminPage,
  AdminPageBody,
  AdminPageHeader,
  AdminSegmentedBar,
  AdminTable,
  AdminTableBody,
  AdminTableHead,
  AdminTableRow,
  type ChartTone,
} from "@/components/admin-page";
import { requireCapability } from "@/lib/admin-rbac-guard";
import { hasCapability } from "@/lib/admin-rbac";
import { formatCOP } from "@/lib/format";
import {
  CRM_SEGMENT_DEFINITIONS,
  CRM_SEGMENT_KEYS,
  isCrmSegmentKey,
  listCrmSegmentMembers,
  type CrmSegmentKey,
} from "@/features/crm/segments-service";
import { ExportSegmentCsvButton } from "./export-segment-button";
import { formatDateCO } from "@/lib/datetime";

export const metadata: Metadata = {
  title: "Segmentos CRM · Admin",
};

export const dynamic = "force-dynamic";

const SEGMENT_ICON: Record<CrmSegmentKey, typeof Crown> = {
  vip: Crown,
  gift_buyers: Gift,
  winback_90d: RotateCcw,
  annual_occasion: CalendarHeart,
  high_intent_no_order: Sparkles,
};

const SEGMENT_TONE: Record<CrmSegmentKey, ChartTone> = {
  vip: "purple",
  gift_buyers: "pink",
  winback_90d: "amber",
  annual_occasion: "turquoise",
  high_intent_no_order: "coral",
};

type SearchParams = Promise<{
  segment?: string;
  q?: string;
  page?: string;
}>;

export default async function AdminCrmSegmentsPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const session = await requireCapability("marketing:read");
  const canExport = hasCapability(session.admin.role, "marketing:export_csv");
  const canOpenContact360 = hasCapability(session.admin.role, "contacts:read_360");

  const sp = await searchParams;
  const activeSegment: CrmSegmentKey = isCrmSegmentKey(sp.segment) ? sp.segment : "vip";
  const q = typeof sp.q === "string" ? sp.q.trim() : "";
  const page = Math.max(1, Number.parseInt(sp.page ?? "1", 10) || 1);

  const data = await listCrmSegmentMembers({
    segment: activeSegment,
    q,
    page,
  });

  function buildHref(overrides: { segment?: CrmSegmentKey; q?: string; page?: number }): string {
    const params = new URLSearchParams();
    const nextSeg = overrides.segment ?? activeSegment;
    const nextQ = overrides.q !== undefined ? overrides.q : q;
    const nextPage = overrides.page ?? 1;
    params.set("segment", nextSeg);
    if (nextQ) params.set("q", nextQ);
    if (nextPage > 1) params.set("page", String(nextPage));
    return `/admin/marketing/segmentos?${params.toString()}`;
  }

  return (
    <AdminPage>
      <AdminPageHeader
        icon={<Users className="h-5 w-5" />}
        title="Segmentos comerciales CRM"
        subtitle="Audiencias accionables construidas sobre compras reales e intención de clientes (excluye cuentas internas), listas para exportar con cumplimiento estricto de Ley 1581."
        breadcrumbs={[
          { label: "Admin", href: "/admin/dashboard" },
          { label: "Comercial" },
          { label: "Segmentos CRM" },
        ]}
        actions={
          canExport ? (
            <ExportSegmentCsvButton segment={activeSegment} disabled={data.total === 0} />
          ) : undefined
        }
      />

      <AdminPageBody>
        {/* Garantía Ley 1581 */}
        <div className="flex items-start gap-3 rounded-2xl border border-emerald-200 bg-emerald-50/70 p-4 text-sm text-emerald-950">
          <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-emerald-700" />
          <div className="space-y-1">
            <p className="font-semibold">
              Filtro automático de Habeas Data (Ley 1581 de 2012) activo
            </p>
            <p className="text-xs leading-relaxed text-emerald-900/90">
              Esta vista y su archivo CSV incluyen únicamente contactos de clientes con autorización
              comercial <span className="font-semibold">NEWSLETTER vigente</span> (sin baja
              posterior, sin cuentas internas ni anonimización). En el segmento actual hay{" "}
              <span className="font-semibold">{data.excludedNoOptInCount}</span>{" "}
              {data.excludedNoOptInCount === 1
                ? "contacto excluido automáticamente"
                : "contactos excluidos automáticamente"}{" "}
              por no contar con opt-in de marketing activo.
            </p>
          </div>
        </div>

        {/* Panorama visual comparativo de las 5 audiencias */}
        <AdminCard className="p-4">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-brand-purple-dark text-xs font-bold tracking-wide uppercase">
              Volumen contactable por audiencia (con opt-in vigente)
            </h2>
            <span className="text-brand-muted text-xs">
              Haz clic en cualquier segmento para inspeccionar su audiencia
            </span>
          </div>
          <AdminSegmentedBar
            ariaLabel="Comparativa de contactos con opt-in comercial por segmento CRM"
            items={CRM_SEGMENT_KEYS.map((key) => {
              const def = CRM_SEGMENT_DEFINITIONS[key];
              const counter = data.counters.find((c) => c.key === key);
              return {
                key,
                label: def.shortLabel,
                count: counter?.consentedCount ?? 0,
                tone: SEGMENT_TONE[key],
                href: buildHref({ segment: key, page: 1 }),
              };
            })}
          />
        </AdminCard>

        {/* Tarjetas selectoras de segmento (responsive móvil / tablet / desktop) */}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
          {CRM_SEGMENT_KEYS.map((key) => {
            const def = CRM_SEGMENT_DEFINITIONS[key];
            const counter = data.counters.find((c) => c.key === key) ?? {
              key,
              consentedCount: 0,
              excludedNoOptInCount: 0,
            };
            const totalAudience = counter.consentedCount + counter.excludedNoOptInCount;
            const optInPct =
              totalAudience > 0 ? Math.round((counter.consentedCount / totalAudience) * 100) : 0;
            const Icon = SEGMENT_ICON[key];
            const selected = key === activeSegment;
            return (
              <Link
                key={key}
                href={buildHref({ segment: key, page: 1 })}
                aria-current={selected ? "true" : undefined}
                className={`group flex min-h-32 flex-col justify-between rounded-2xl border p-4 transition-all ${
                  selected
                    ? "border-brand-purple bg-brand-cream/70 ring-brand-purple/25 shadow-sm ring-2"
                    : "border-brand-purple/10 hover:border-brand-purple/30 bg-white hover:shadow-xs"
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span
                    className={`inline-flex h-9 w-9 items-center justify-center rounded-xl ${
                      selected
                        ? "bg-brand-purple text-white"
                        : "bg-brand-purple/10 text-brand-purple-dark"
                    }`}
                  >
                    <Icon className="h-4 w-4" />
                  </span>
                  <span className="font-display text-brand-purple-dark text-2xl font-bold tabular-nums">
                    {counter.consentedCount.toLocaleString("es-CO")}
                  </span>
                </div>
                <div className="mt-3 space-y-1.5">
                  <p className="text-brand-purple-dark text-sm font-semibold">{def.shortLabel}</p>
                  <div className="h-1.5 overflow-hidden rounded-full bg-slate-100">
                    <div
                      className="bg-brand-purple h-full rounded-full transition-all"
                      style={{
                        width: `${counter.consentedCount > 0 ? Math.max(6, optInPct) : 0}%`,
                      }}
                    />
                  </div>
                  <p className="text-[11px] text-slate-500">
                    {totalAudience > 0 ? `${optInPct}% habilitados · ` : ""}
                    {counter.excludedNoOptInCount} sin opt-in
                  </p>
                </div>
              </Link>
            );
          })}
        </div>

        {/* Playbook recomendado + buscador */}
        <AdminCard className="p-5">
          <div className="grid gap-4 lg:grid-cols-[1fr_auto] lg:items-center">
            <div>
              <h2 className="text-brand-purple-dark font-display text-base font-bold">
                {data.segment.label}
              </h2>
              <p className="mt-0.5 text-sm text-slate-600">{data.segment.description}</p>
              <p className="text-brand-purple-dark bg-brand-cream/80 border-brand-purple/10 mt-2.5 inline-flex items-start gap-1.5 rounded-xl border px-3 py-2 text-xs font-medium">
                <Sparkles className="text-brand-pink mt-0.5 h-3.5 w-3.5 shrink-0" />
                <span>
                  <strong>Acción sugerida:</strong> {data.segment.recommendedPlaybook}
                </span>
              </p>
            </div>

            <form
              action="/admin/marketing/segmentos"
              method="GET"
              className="flex flex-col gap-2 sm:flex-row sm:items-center"
            >
              <input type="hidden" name="segment" value={activeSegment} />
              <div className="relative flex-1">
                <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  type="search"
                  name="q"
                  defaultValue={q}
                  placeholder="Buscar nombre o email…"
                  className="focus:border-brand-purple focus:ring-brand-purple/20 min-h-11 w-full rounded-xl border border-slate-200 bg-slate-50/70 pr-3 pl-9 text-sm focus:bg-white focus:ring-2 focus:outline-none sm:w-64"
                />
              </div>
              <button
                type="submit"
                className="bg-brand-purple hover:bg-brand-purple-dark min-h-11 rounded-xl px-4 text-sm font-semibold text-white transition-colors"
              >
                Filtrar
              </button>
            </form>
          </div>
        </AdminCard>

        {/* Tabla de contactos con opt-in vigente (auto-cards en móvil/tablet) */}
        {data.items.length === 0 ? (
          <AdminEmpty
            icon={<Users className="h-5 w-5" />}
            title="No hay contactos con opt-in comercial vigente en este segmento"
            description={
              q
                ? "Prueba limpiando la búsqueda o seleccionando otra audiencia arriba."
                : "Cuando tus compradores acepten recibir novedades en el checkout, en Empresas y Eventos o en el pie de página, aparecerán automáticamente aquí."
            }
          />
        ) : (
          <div className="space-y-3">
            <AdminTable minWidth={680}>
              <AdminTableHead>
                <tr>
                  <th className="px-4 py-3 text-left font-semibold">Contacto</th>
                  <th className="px-4 py-3 text-left font-semibold">Compras / LTV</th>
                  <th className="px-4 py-3 text-left font-semibold">Última compra</th>
                  <th className="px-4 py-3 text-left font-semibold">Señales / Canal UTM</th>
                  <th className="px-4 py-3 text-left font-semibold">Evidencia Ley 1581</th>
                </tr>
              </AdminTableHead>
              <AdminTableBody>
                {data.items.map((member) => (
                  <AdminTableRow key={member.contactId}>
                    <td className="px-4 py-3">
                      <div className="font-semibold text-slate-900">
                        {canOpenContact360 ? (
                          <Link
                            href={`/admin/clientes/${member.contactId}`}
                            className="text-brand-purple-dark hover:text-brand-purple underline-offset-2 hover:underline"
                          >
                            {member.displayName || member.email}
                          </Link>
                        ) : (
                          <span>{member.displayName || member.email}</span>
                        )}
                      </div>
                      <div className="text-xs text-slate-500">{member.email}</div>
                    </td>
                    <td className="px-4 py-3 tabular-nums">
                      <div className="font-semibold text-slate-900">
                        {formatCOP(member.lifetimePaidCopCents)}
                      </div>
                      <div className="text-xs text-slate-500">
                        {member.paidOrdersCount}{" "}
                        {member.paidOrdersCount === 1 ? "pedido pagado" : "pedidos pagados"}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-700">
                      {member.lastPaidOrderAt
                        ? formatDateCO(member.lastPaidOrderAt)
                        : "Sin compra aún"}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-1.5">
                        {member.intentSignals.map((sig) => (
                          <AdminBadge key={sig} tone="purple">
                            {sig}
                          </AdminBadge>
                        ))}
                        {member.lastUtmSource ? (
                          <AdminBadge tone="turquoise">UTM: {member.lastUtmSource}</AdminBadge>
                        ) : null}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-600">
                      <div className="font-medium text-emerald-800">
                        Opt-in {formatDateCO(member.consentAcceptedAt)}
                      </div>
                      <div className="text-[11px] text-slate-400">{member.consentVersion}</div>
                    </td>
                  </AdminTableRow>
                ))}
              </AdminTableBody>
            </AdminTable>

            {/* Paginación */}
            {data.totalPages > 1 ? (
              <AdminCard className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 text-xs text-slate-600">
                <span>
                  Página {data.page} de {data.totalPages} ({data.total} contactos con opt-in)
                </span>
                <div className="flex items-center gap-2">
                  {data.page > 1 ? (
                    <Link
                      href={buildHref({ page: data.page - 1 })}
                      className="inline-flex min-h-9 items-center rounded-lg border border-slate-200 bg-white px-3 py-1.5 font-semibold hover:bg-slate-50"
                    >
                      Anterior
                    </Link>
                  ) : null}
                  {data.page < data.totalPages ? (
                    <Link
                      href={buildHref({ page: data.page + 1 })}
                      className="inline-flex min-h-9 items-center rounded-lg border border-slate-200 bg-white px-3 py-1.5 font-semibold hover:bg-slate-50"
                    >
                      Siguiente
                    </Link>
                  ) : null}
                </div>
              </AdminCard>
            ) : null}
          </div>
        )}
      </AdminPageBody>
    </AdminPage>
  );
}
