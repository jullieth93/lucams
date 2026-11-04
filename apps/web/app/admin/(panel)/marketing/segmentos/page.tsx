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

export const metadata: Metadata = {
  title: "Segmentos CRM · Admin",
};

export const dynamic = "force-dynamic";

const BOGOTA_SHORT_DATE = new Intl.DateTimeFormat("es-CO", {
  day: "2-digit",
  month: "short",
  year: "numeric",
  timeZone: "America/Bogota",
});

const SEGMENT_ICON: Record<CrmSegmentKey, typeof Crown> = {
  vip: Crown,
  gift_buyers: Gift,
  winback_90d: RotateCcw,
  annual_occasion: CalendarHeart,
  high_intent_no_order: Sparkles,
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
    <div className="space-y-6">
      {/* Cabecera */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="text-brand-purple flex items-center gap-2 text-xs font-semibold tracking-wider uppercase">
            <Users className="h-4 w-4" />
            Marketing · Audiencias nativas
          </div>
          <h1 className="font-display text-brand-purple-dark mt-1 text-2xl font-bold">
            Segmentos comerciales CRM
          </h1>
          <p className="mt-1 max-w-2xl text-sm text-slate-600">
            Audiencias accionables construidas sobre el historial real de compras e intención del
            cliente, listas para exportar a tus campañas con cumplimiento estricto de Ley 1581.
          </p>
        </div>

        {canExport ? (
          <ExportSegmentCsvButton segment={activeSegment} disabled={data.total === 0} />
        ) : null}
      </div>

      {/* Garantía Ley 1581 */}
      <div className="flex items-start gap-3 rounded-2xl border border-emerald-200 bg-emerald-50/70 p-4 text-sm text-emerald-950">
        <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-emerald-700" />
        <div className="space-y-1">
          <p className="font-semibold">
            Filtro automático de Habeas Data (Ley 1581 de 2012) activo
          </p>
          <p className="text-xs leading-relaxed text-emerald-900/90">
            Esta vista y su archivo CSV incluyen únicamente contactos con autorización comercial{" "}
            <span className="font-semibold">NEWSLETTER vigente</span> (sin baja posterior ni
            anonimización). En el segmento actual hay{" "}
            <span className="font-semibold">{data.excludedNoOptInCount}</span>{" "}
            {data.excludedNoOptInCount === 1
              ? "contacto excluido automáticamente"
              : "contactos excluidos automáticamente"}{" "}
            por no contar con opt-in de marketing activo.
          </p>
        </div>
      </div>

      {/* Tarjetas selectoras de segmento */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        {CRM_SEGMENT_KEYS.map((key) => {
          const def = CRM_SEGMENT_DEFINITIONS[key];
          const counter = data.counters.find((c) => c.key === key) ?? {
            key,
            consentedCount: 0,
            excludedNoOptInCount: 0,
          };
          const Icon = SEGMENT_ICON[key];
          const selected = key === activeSegment;
          return (
            <Link
              key={key}
              href={buildHref({ segment: key, page: 1 })}
              className={`group flex min-h-28 flex-col justify-between rounded-2xl border p-4 transition-all ${
                selected
                  ? "border-brand-purple bg-brand-cream/70 ring-brand-purple/25 shadow-sm ring-2"
                  : "border-slate-200 bg-white hover:border-slate-300 hover:shadow-xs"
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <span
                  className={`inline-flex h-8 w-8 items-center justify-center rounded-xl ${
                    selected
                      ? "bg-brand-purple text-white"
                      : "bg-brand-purple/10 text-brand-purple-dark"
                  }`}
                >
                  <Icon className="h-4 w-4" />
                </span>
                <span className="font-display text-brand-purple-dark text-2xl font-bold tabular-nums">
                  {counter.consentedCount}
                </span>
              </div>
              <div className="mt-3">
                <p className="text-brand-purple-dark text-sm font-semibold">{def.shortLabel}</p>
                <p className="mt-0.5 text-[11px] text-slate-500">
                  {counter.excludedNoOptInCount} sin opt-in excluidos
                </p>
              </div>
            </Link>
          );
        })}
      </div>

      {/* Playbook recomendado + buscador */}
      <div className="grid gap-4 rounded-2xl border border-slate-200 bg-white p-5 lg:grid-cols-[1fr_auto] lg:items-center">
        <div>
          <h2 className="text-brand-purple-dark text-base font-bold">{data.segment.label}</h2>
          <p className="mt-0.5 text-sm text-slate-600">{data.segment.description}</p>
          <p className="text-brand-purple-dark mt-2 inline-flex items-center gap-1.5 rounded-lg bg-[#FFF8F0] px-3 py-1.5 text-xs font-medium">
            <Sparkles className="text-brand-magenta h-3.5 w-3.5 shrink-0" />
            <span>
              <strong>Acción sugerida:</strong> {data.segment.recommendedPlaybook}
            </span>
          </p>
        </div>

        <form action="/admin/marketing/segmentos" method="GET" className="flex items-center gap-2">
          <input type="hidden" name="segment" value={activeSegment} />
          <div className="relative">
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

      {/* Tabla de contactos con opt-in vigente */}
      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xs">
        {data.items.length === 0 ? (
          <div className="p-10 text-center">
            <p className="text-brand-purple-dark text-sm font-semibold">
              No hay contactos con opt-in comercial vigente en este segmento
            </p>
            <p className="mt-1 text-xs text-slate-500">
              {q
                ? "Prueba limpiando la búsqueda o seleccionando otra audiencia arriba."
                : "Cuando tus compradores acepten recibir novedades en el checkout o en el pie de página, aparecerán automáticamente aquí."}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-slate-200 bg-slate-50/80 text-xs font-semibold tracking-wide text-slate-600 uppercase">
                <tr>
                  <th className="px-4 py-3">Contacto</th>
                  <th className="px-4 py-3">Compras / LTV</th>
                  <th className="px-4 py-3">Última compra</th>
                  <th className="px-4 py-3">Señales / Canal UTM</th>
                  <th className="px-4 py-3">Evidencia Ley 1581</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {data.items.map((member) => (
                  <tr key={member.contactId} className="hover:bg-slate-50/60">
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
                        ? BOGOTA_SHORT_DATE.format(member.lastPaidOrderAt)
                        : "Sin compra aún"}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-1.5">
                        {member.intentSignals.map((sig) => (
                          <span
                            key={sig}
                            className="bg-brand-purple/10 text-brand-purple-dark inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium"
                          >
                            {sig}
                          </span>
                        ))}
                        {member.lastUtmSource ? (
                          <span className="inline-flex rounded-full bg-teal-50 px-2.5 py-0.5 text-xs font-medium text-teal-800">
                            UTM: {member.lastUtmSource}
                          </span>
                        ) : null}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-600">
                      <div className="font-medium text-emerald-800">
                        Opt-in {BOGOTA_SHORT_DATE.format(member.consentAcceptedAt)}
                      </div>
                      <div className="text-[11px] text-slate-400">{member.consentVersion}</div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Paginación */}
        {data.totalPages > 1 ? (
          <div className="flex items-center justify-between border-t border-slate-200 bg-slate-50/50 px-4 py-3 text-xs text-slate-600">
            <span>
              Página {data.page} de {data.totalPages} ({data.total} contactos con opt-in)
            </span>
            <div className="flex items-center gap-2">
              {data.page > 1 ? (
                <Link
                  href={buildHref({ page: data.page - 1 })}
                  className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 font-semibold hover:bg-slate-50"
                >
                  Anterior
                </Link>
              ) : null}
              {data.page < data.totalPages ? (
                <Link
                  href={buildHref({ page: data.page + 1 })}
                  className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 font-semibold hover:bg-slate-50"
                >
                  Siguiente
                </Link>
              ) : null}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
