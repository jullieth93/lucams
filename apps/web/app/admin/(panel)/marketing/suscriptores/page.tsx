/*
 * Admin > Marketing > Suscriptores — audiencia del newsletter (Fase 3A,
 * feedback Lucy 2026-09-18).
 *
 * Antes no existía vista: los emails iban a Resend Contacts + tabla Consent
 * (scope=NEWSLETTER) y el negocio no podía ver su audiencia. Acá se lista el
 * ledger deduplicado por email (estado = ÚLTIMA fila: la baja es otra fila
 * accepted=false, ver features/newsletter/admin-service.ts), con contadores
 * (activos / de baja / total), búsqueda, paginación y export CSV (botón de
 * arriba, descarga server-side en ./export/route.ts).
 *
 * SOLO LECTURA + export (Ley 1581: la revocación la inicia el titular con su
 * link firmado de baja; el admin no da de baja a terceros desde acá).
 *
 * RBAC: CATALOG (SUPERADMIN + MANAGER), misma matriz que /admin/clientes —
 * declarada en lib/admin-rbac.ts y enforceada por el layout del (panel).
 */

import type { Metadata } from "next";
import Link from "next/link";
import { Filter, MailCheck, Repeat, ShieldCheck, ShoppingCart } from "lucide-react";
import {
  AdminBadge,
  AdminCard,
  AdminComboBarLineChart,
  AdminEmpty,
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
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { adminHomePath, canAccessAdminPath, hasCapability } from "@/lib/admin-rbac";
import { requireCapability } from "@/lib/admin-rbac-guard";
import {
  getNewsletterDailyPulse,
  listNewsletterSubscribers,
} from "@/features/newsletter/admin-service";
import { ExportSubscribersCsvButton } from "./export-csv-button";
import { formatDateCO } from "@/lib/datetime";

export const metadata: Metadata = {
  title: "Suscriptores del newsletter",
  robots: { index: false, follow: false },
};

type SearchParams = Promise<{ [key: string]: string | string[] | undefined }>;

function pickString(sp: Record<string, string | string[] | undefined>, key: string) {
  const v = sp[key];
  return typeof v === "string" ? v : undefined;
}

const STATUS_OPTIONS = ["all", "active", "unsubscribed"] as const;
type StatusOption = (typeof STATUS_OPTIONS)[number];

const STATUS_LABEL: Record<StatusOption, string> = {
  all: "Todos",
  active: "Activos",
  unsubscribed: "De baja",
};

export default async function AdminSuscriptoresPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const session = await requireCapability("marketing:read");
  const role = session.admin.role;
  const homeHref = adminHomePath(role);
  const canExport = hasCapability(role, "marketing:export_csv");
  const isSuperadmin = role === "SUPERADMIN";
  const canRead360 =
    hasCapability(role, "contacts:read_360") && canAccessAdminPath(role, "/admin/clientes");

  const sp = await searchParams;
  const q = pickString(sp, "q");
  const statusRaw = pickString(sp, "status");
  const status: StatusOption = (STATUS_OPTIONS as readonly string[]).includes(statusRaw ?? "")
    ? (statusRaw as StatusOption)
    : "all";
  const page = Number(sp.page) || 1;

  const [{ items, counters, total, totalPages }, pulse] = await Promise.all([
    listNewsletterSubscribers({
      q,
      status,
      page,
    }),
    getNewsletterDailyPulse(14),
  ]);
  const hasActiveFilters = !!q || status !== "all";

  const pillCounts: Record<StatusOption, number> = {
    all: counters.total,
    active: counters.active,
    unsubscribed: counters.unsubscribed,
  };

  return (
    <AdminPage>
      <AdminPageHeader
        icon={<MailCheck className="h-5 w-5" />}
        title="Suscriptores del newsletter"
        subtitle={
          <>
            {total} {total === 1 ? "suscriptor" : "suscriptores"}
            {hasActiveFilters && " · con filtros aplicados"}
          </>
        }
        breadcrumbs={[
          { label: "Admin", href: homeHref },
          { label: "Marketing" },
          { label: "Suscriptores" },
        ]}
        actions={
          canExport ? <ExportSubscribersCsvButton canExportAuditLedger={isSuperadmin} /> : undefined
        }
      />

      <AdminPageBody>
        {/* Tira de navegación del ecosistema Marketing */}
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
          {canAccessAdminPath(role, "/admin/lifecycle") && (
            <Link
              href="/admin/lifecycle"
              className="border-brand-purple/15 text-brand-purple-dark hover:bg-brand-purple/5 inline-flex min-h-9 items-center gap-1.5 rounded-lg border bg-white px-3 py-1.5 text-xs font-semibold transition-colors"
            >
              <Repeat className="h-3.5 w-3.5" />
              Lifecycle Journeys
            </Link>
          )}
          <span className="border-brand-purple bg-brand-purple/10 text-brand-purple-dark inline-flex min-h-9 items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-semibold">
            <MailCheck className="h-3.5 w-3.5" />
            Suscriptores
          </span>
          {canAccessAdminPath(role, "/admin/marketing/segmentos") && (
            <Link
              href="/admin/marketing/segmentos"
              className="border-brand-purple/15 text-brand-purple-dark hover:bg-brand-purple/5 inline-flex min-h-9 items-center gap-1.5 rounded-lg border bg-white px-3 py-1.5 text-xs font-semibold transition-colors"
            >
              <Filter className="h-3.5 w-3.5" />
              Segmentos RFM
            </Link>
          )}
        </div>

        {/* Garantía Ley 1581 */}
        <div className="flex items-start gap-3 rounded-2xl border border-emerald-200 bg-emerald-50/70 p-4 text-sm text-emerald-950">
          <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-emerald-700" />
          <div className="space-y-1">
            <p className="font-semibold">
              Protección de Habeas Data (Ley 1581 de 2012) en campañas y exportaciones
            </p>
            <p className="text-xs leading-relaxed text-emerald-900/90">
              Las cuentas internas del equipo están excluidas de este conteo comercial. La descarga
              CSV estándar exporta <strong>únicamente suscriptores activos</strong> sin rebote duro
              ni queja registrada en Resend; la revocación la inicia siempre el titular mediante su
              enlace firmado.
              {isSuperadmin &&
                " Como SUPERADMIN dispones además del botón «Ledger SIC» para evidencia regulatoria completa."}
            </p>
          </div>
        </div>

        {/* Contadores del universo comercial completo */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <KpiCard label="Activos" value={counters.active} trendLabel="Reciben las campañas" />
          <KpiCard
            label="De baja"
            value={counters.unsubscribed}
            trendLabel="Revocaron el consentimiento"
          />
          <KpiCard
            label="Total audiencia"
            value={counters.total}
            trendLabel="Altas + bajas (sin staff)"
          />
        </div>

        {/* Pulso 14 días + salud de la audiencia */}
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-5">
          <AdminCard className="p-5 lg:col-span-3">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-brand-purple-dark font-display text-sm font-bold">
                Pulso 14 días: altas opt-in vs bajas revocadas
              </h2>
              <span className="text-brand-muted text-xs">Hora Colombia (COT)</span>
            </div>
            <AdminComboBarLineChart
              ariaLabel="Pulso de 14 días de suscripciones opt-in vs bajas de newsletter"
              barLegend="Altas opt-in"
              lineLegend="Bajas (opt-out)"
              data={pulse.map((b) => ({
                key: b.key,
                label: b.label,
                tickLabel: b.tickLabel,
                barValue: b.optInCount,
                barFormatted: `${b.optInCount} alta${b.optInCount === 1 ? "" : "s"}`,
                lineValue: b.optOutCount,
                lineFormatted: `${b.optOutCount} baja${b.optOutCount === 1 ? "" : "s"}`,
              }))}
            />
          </AdminCard>

          <AdminCard className="flex flex-col justify-between p-5 lg:col-span-2">
            <div>
              <h2 className="text-brand-purple-dark font-display mb-1 text-sm font-bold">
                Balance de consentimientos
              </h2>
              <p className="text-brand-muted mb-4 text-xs">
                Proporción actual entre titulares habilitados y revocaciones registradas.
              </p>
              <AdminSegmentedBar
                ariaLabel="Proporción entre suscriptores activos y dados de baja"
                items={[
                  {
                    key: "active",
                    label: "Activos (opt-in)",
                    count: counters.active,
                    tone: "emerald",
                    href: "/admin/marketing/suscriptores?status=active",
                  },
                  {
                    key: "unsubscribed",
                    label: "De baja",
                    count: counters.unsubscribed,
                    tone: "slate",
                    href: "/admin/marketing/suscriptores?status=unsubscribed",
                  },
                ]}
              />
            </div>
          </AdminCard>
        </div>

        {/* Pestañas rápidas por estado */}
        <div className="flex flex-wrap items-center gap-2">
          {STATUS_OPTIONS.map((st) => {
            const active = status === st;
            const params = new URLSearchParams();
            if (st !== "all") params.set("status", st);
            if (q) params.set("q", q);
            const qs = params.toString();
            return (
              <Link
                key={st}
                href={qs ? `/admin/marketing/suscriptores?${qs}` : "/admin/marketing/suscriptores"}
                className={`inline-flex min-h-10 items-center gap-1.5 rounded-xl border px-3 py-1.5 text-xs font-semibold transition-colors ${
                  active
                    ? "border-brand-purple bg-brand-purple text-white"
                    : "border-brand-purple/15 text-brand-purple-dark hover:bg-brand-purple/10 bg-white"
                }`}
              >
                <span>{STATUS_LABEL[st]}</span>
                <span
                  className={`rounded-full px-1.5 py-0.5 text-[10px] tabular-nums ${
                    active ? "bg-white/20 text-white" : "bg-brand-purple/10 text-brand-purple-dark"
                  }`}
                >
                  {pillCounts[st]}
                </span>
              </Link>
            );
          })}
        </div>

        {/* Toolbar */}
        <form
          method="GET"
          className="border-brand-purple/10 grid grid-cols-1 gap-3 rounded-xl border bg-white p-4 shadow-sm sm:grid-cols-12"
        >
          {status !== "all" && <input type="hidden" name="status" value={status} />}
          <div className="sm:col-span-9">
            <label
              htmlFor="f-q"
              className="text-brand-purple-dark/70 mb-1 block text-xs font-semibold"
            >
              Buscar por correo o nombre del contacto
            </label>
            <Input
              id="f-q"
              name="q"
              type="search"
              defaultValue={q ?? ""}
              placeholder="cliente@correo.com o nombre…"
              className="border-brand-purple/20 focus-visible:ring-brand-purple/30"
            />
          </div>
          <div className="flex items-end gap-2 sm:col-span-3">
            <Button
              type="submit"
              size="sm"
              className="bg-gradient-brand h-9 w-full text-white hover:brightness-110"
            >
              Buscar
            </Button>
          </div>
          {hasActiveFilters && (
            <div className="sm:col-span-12">
              <Link
                href="/admin/marketing/suscriptores"
                className="text-brand-muted hover:text-brand-purple-dark text-xs font-semibold"
              >
                Limpiar filtros
              </Link>
            </div>
          )}
        </form>

        {items.length === 0 ? (
          <AdminEmpty
            icon={<MailCheck className="h-5 w-5" />}
            title={hasActiveFilters ? "Sin resultados" : "Aún no hay suscriptores"}
            description={
              hasActiveFilters
                ? "Prueba quitar algún filtro o cambiar el texto de búsqueda."
                : "Cuando el primer visitante se suscriba desde el formulario del sitio, aparecerá acá."
            }
          />
        ) : (
          <AdminTable>
            <AdminTableHead>
              <tr>
                <th className="px-4 py-3 text-left font-semibold">Suscriptor</th>
                <th className="px-4 py-3 text-left font-semibold">Estado</th>
                <th className="px-4 py-3 text-left font-semibold">Suscripción</th>
                <th className="px-4 py-3 text-left font-semibold">Baja</th>
                <th className="px-4 py-3 text-left font-semibold">Aviso de privacidad</th>
              </tr>
            </AdminTableHead>
            <AdminTableBody>
              {items.map((s) => (
                <AdminTableRow key={s.email}>
                  <td className="px-4 py-3">
                    {s.displayName && (
                      <p className="text-brand-purple-dark text-xs font-bold">{s.displayName}</p>
                    )}
                    <p className="text-brand-purple-dark font-medium">{s.email}</p>
                    {canRead360 && s.contactId && (
                      <Link
                        href={`/admin/clientes/${encodeURIComponent(s.contactId)}`}
                        className="text-brand-purple text-[11px] font-semibold hover:underline"
                      >
                        Ver Contacto 360 →
                      </Link>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap items-center gap-1.5">
                      {s.status === "active" ? (
                        <AdminBadge tone="emerald">Activo</AdminBadge>
                      ) : (
                        <AdminBadge tone="slate">De baja</AdminBadge>
                      )}
                      {s.bouncedOrComplained && <AdminBadge tone="rose">Rebote / Queja</AdminBadge>}
                    </div>
                  </td>
                  <td className="text-brand-purple-dark/85 px-4 py-3 text-xs">
                    {s.subscribedAt ? formatDateCO(s.subscribedAt) : "—"}
                  </td>
                  <td className="text-brand-muted px-4 py-3 text-xs">
                    {s.unsubscribedAt ? formatDateCO(s.unsubscribedAt) : "—"}
                  </td>
                  <td className="text-brand-muted px-4 py-3 text-xs">{s.version ?? "—"}</td>
                </AdminTableRow>
              ))}
            </AdminTableBody>
          </AdminTable>
        )}

        {totalPages > 1 && (
          <div className="text-brand-purple-dark/70 flex items-center justify-between text-sm">
            <span>
              {total} {total === 1 ? "suscriptor" : "suscriptores"} · página {page} de {totalPages}
            </span>
            <div className="flex gap-1">
              {page > 1 && (
                <PaginationLink page={page - 1} q={q} status={status}>
                  ← Anterior
                </PaginationLink>
              )}
              {page < totalPages && (
                <PaginationLink page={page + 1} q={q} status={status}>
                  Siguiente →
                </PaginationLink>
              )}
            </div>
          </div>
        )}
      </AdminPageBody>
    </AdminPage>
  );
}

function PaginationLink({
  page,
  q,
  status,
  children,
}: {
  page: number;
  q?: string;
  status?: string;
  children: React.ReactNode;
}) {
  const params = new URLSearchParams();
  params.set("page", String(page));
  if (q) params.set("q", q);
  if (status && status !== "all") params.set("status", status);
  return (
    <Link
      href={`/admin/marketing/suscriptores?${params.toString()}`}
      className="border-brand-purple/20 hover:bg-brand-purple/5 text-brand-purple-dark rounded-md border bg-white px-3 py-1.5 text-xs font-medium"
    >
      {children}
    </Link>
  );
}
