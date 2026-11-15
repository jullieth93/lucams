/*
 * Admin > Clientes y Contactos — Directorio unificado sobre `Contact` (Fase 9 · S19).
 *
 * Unifica cuentas autenticadas (`Customer`) con compradores invitados, oportunidades B2B
 * WhatsApp, tickets de soporte, carritos abandonados y suscriptores bajo la entidad
 * canónica `Contact` (ADR-193), respetando RBAC por capacidades y enmascaramiento
 * determinista de PII en servidor.
 */

import type { Metadata } from "next";
import Link from "next/link";
import { ChevronRight, Crown, GitMerge, ShieldCheck, TrendingUp, Users } from "lucide-react";
import {
  AdminPage,
  AdminPageHeader,
  AdminPageBody,
  AdminCard,
  AdminDonutChart,
  AdminSegmentedBar,
  AdminTable,
  AdminTableHead,
  AdminTableBody,
  AdminTableRow,
  AdminEmpty,
  AdminBadge,
  SortableHeader,
  type ChartTone,
} from "@/components/admin-page";
import { CountUp } from "@/components/admin/count-up";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { hasCapability } from "@/lib/admin-rbac";
import { requireCapability } from "@/lib/admin-rbac-guard";
import {
  isContactSegmentFilter,
  isContactSortOption,
  listContactsForActor,
  type ContactSegmentFilter,
  type ContactSortOption,
} from "@/features/identity/contact-360-service";
import { formatCOP, formatRelativeTime } from "@/lib/format";

export const metadata: Metadata = {
  title: "Clientes y contactos",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

type SearchParams = Promise<{ [key: string]: string | string[] | undefined }>;

function pickString(sp: Record<string, string | string[] | undefined>, key: string) {
  const v = sp[key];
  return typeof v === "string" ? v : undefined;
}

const SEGMENT_PILLS: ReadonlyArray<{ key: ContactSegmentFilter; label: string }> = [
  { key: "all", label: "Todos" },
  { key: "registered", label: "Con cuenta" },
  { key: "guest", label: "Invitados sin cuenta" },
  { key: "paid", label: "Con compras pagadas" },
  { key: "vip", label: "VIP (≥ 3 compras)" },
  { key: "open-care", label: "Con posventa abierta" },
  { key: "marketing-optin", label: "Opt-in comercial" },
];

const SOURCE_LABEL: Record<string, string> = {
  CUSTOMER_AUTH: "Cuenta web",
  GUEST_ORDER: "Compra invitado",
  SUPPORT_TICKET: "Soporte",
  ABANDONED_CART: "Carrito",
  NEWSLETTER: "Newsletter",
  B2B_INQUIRY: "Empresas / Eventos",
  MANUAL: "Manual",
};

const SOURCE_TONE: Record<string, ChartTone> = {
  CUSTOMER_AUTH: "purple",
  GUEST_ORDER: "turquoise",
  B2B_INQUIRY: "pink",
  NEWSLETTER: "emerald",
  ABANDONED_CART: "amber",
  SUPPORT_TICKET: "blue",
  MANUAL: "slate",
};

export default async function AdminClientesPage({ searchParams }: { searchParams: SearchParams }) {
  const session = await requireCapability("contacts:read_360");
  const canMerge = hasCapability(session.admin.role, "contacts:merge");

  const sp = await searchParams;
  const q = pickString(sp, "q");
  const segmentRaw = pickString(sp, "segment") ?? pickString(sp, "status");
  const legacyMappedSegment = segmentRaw === "with-orders" ? "paid" : segmentRaw;
  const segment: ContactSegmentFilter = isContactSegmentFilter(legacyMappedSegment)
    ? legacyMappedSegment
    : "all";

  const sortRaw = pickString(sp, "sort");
  const legacyMappedSort = sortRaw === "spent" ? "ltv" : sortRaw;
  const sort: ContactSortOption = isContactSortOption(legacyMappedSort)
    ? legacyMappedSort
    : "recent";
  const includeStaff = pickString(sp, "staff") === "1";
  const requestedPage = Math.max(1, Number(sp.page) || 1);

  const {
    items,
    total,
    page,
    totalPages,
    pendingMergesCount,
    piiMasked,
    summary,
    sourceBreakdown,
  } = await listContactsForActor(
    { q, segment, sort, page: requestedPage, includeStaff },
    session.admin.role,
  );
  const hasActiveFilters = Boolean(q) || segment !== "all" || sort !== "recent" || includeStaff;
  const sortPreserve = {
    q,
    segment: segment !== "all" ? segment : undefined,
    staff: includeStaff ? "1" : undefined,
  };

  function buildSegmentHref(seg: ContactSegmentFilter): string {
    const params = new URLSearchParams();
    if (q) params.set("q", q);
    if (seg !== "all") params.set("segment", seg);
    if (sort !== "recent") params.set("sort", sort);
    if (includeStaff) params.set("staff", "1");
    return params.toString() ? `/admin/clientes?${params.toString()}` : "/admin/clientes";
  }

  const staffToggleParams = new URLSearchParams();
  if (q) staffToggleParams.set("q", q);
  if (segment !== "all") staffToggleParams.set("segment", segment);
  if (sort !== "recent") staffToggleParams.set("sort", sort);
  if (!includeStaff) staffToggleParams.set("staff", "1");
  const staffToggleHref = staffToggleParams.toString()
    ? `/admin/clientes?${staffToggleParams.toString()}`
    : "/admin/clientes";

  return (
    <AdminPage>
      <AdminPageHeader
        icon={<Users className="h-5 w-5" />}
        title="Clientes y contactos"
        subtitle={
          <>
            {total.toLocaleString("es-CO")} {total === 1 ? "cliente" : "clientes"} en el directorio
            comercial unificado (cuentas + invitados + posventa)
            {!includeStaff && " · cuentas internas ocultas"}
            {hasActiveFilters && " · con filtros aplicados"}
          </>
        }
        breadcrumbs={[
          { label: "Admin", href: "/admin/dashboard" },
          { label: "Ventas" },
          { label: "Clientes" },
        ]}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Link
              href={staffToggleHref}
              className={
                includeStaff
                  ? "inline-flex min-h-11 items-center gap-1.5 rounded-lg border border-amber-400/50 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-900 transition-colors hover:bg-amber-100"
                  : "border-brand-purple/20 text-brand-purple-dark hover:bg-brand-purple/5 inline-flex min-h-11 items-center gap-1.5 rounded-lg border bg-white px-3 py-2 text-xs font-semibold transition-colors"
              }
            >
              {includeStaff ? "Ocultar cuentas internas" : "Ver cuentas internas"}
            </Link>
            {canMerge && (
              <Link
                href="/admin/clientes/duplicados"
                className="border-brand-purple/25 text-brand-purple-dark hover:bg-brand-purple/10 inline-flex min-h-11 items-center gap-2 rounded-lg border bg-white px-3.5 py-2 text-sm font-semibold transition-colors"
              >
                <GitMerge className="h-4 w-4" />
                Posibles duplicados
                {pendingMergesCount > 0 && (
                  <AdminBadge tone="amber">{pendingMergesCount}</AdminBadge>
                )}
              </Link>
            )}
          </div>
        }
      />

      <AdminPageBody>
        {/* KPIs ejecutivos del directorio Contact 360 */}
        <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <AdminCard className="p-4">
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="text-brand-muted text-xs font-semibold tracking-wider uppercase">
                  Directorio activo
                </p>
                <p className="text-brand-purple-dark font-display mt-1 text-2xl font-bold tabular-nums">
                  <CountUp value={summary.totalContacts} />
                </p>
                <p className="text-brand-muted mt-1 text-xs">
                  {summary.registeredCount.toLocaleString("es-CO")} con cuenta ·{" "}
                  {summary.guestCount.toLocaleString("es-CO")} invitados
                </p>
              </div>
              <span className="bg-brand-purple/10 text-brand-purple rounded-lg p-2">
                <Users className="h-4 w-4" />
              </span>
            </div>
          </AdminCard>

          <AdminCard className="p-4">
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="text-brand-muted text-xs font-semibold tracking-wider uppercase">
                  Compradores pagados
                </p>
                <p className="text-brand-purple-dark font-display mt-1 text-2xl font-bold tabular-nums">
                  <CountUp value={summary.buyersCount} />
                </p>
                <p className="text-brand-muted mt-1 text-xs">
                  {summary.vipCount.toLocaleString("es-CO")} clientes VIP (≥ 3 compras)
                </p>
              </div>
              <span className="bg-brand-pink/12 text-brand-pink-ink rounded-lg p-2">
                <Crown className="h-4 w-4" />
              </span>
            </div>
          </AdminCard>

          <AdminCard className="p-4">
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="text-brand-muted text-xs font-semibold tracking-wider uppercase">
                  LTV neto cobrado
                </p>
                <p className="text-brand-purple font-display mt-1 text-2xl font-bold tabular-nums">
                  {formatCOP(summary.totalNetLtvCents)}
                </p>
                <p className="text-brand-muted mt-1 text-xs">
                  Órdenes pagadas netas de retractos reembolsados
                </p>
              </div>
              <span className="rounded-lg bg-emerald-50 p-2 text-emerald-700">
                <TrendingUp className="h-4 w-4" />
              </span>
            </div>
          </AdminCard>

          <AdminCard className="p-4">
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="text-brand-muted text-xs font-semibold tracking-wider uppercase">
                  Opt-in Ley 1581 vigente
                </p>
                <p className="text-brand-purple-dark font-display mt-1 text-2xl font-bold tabular-nums">
                  <CountUp value={summary.marketingOptInCount} />
                </p>
                <p className="text-brand-muted mt-1 text-xs">
                  {summary.openCareContactsCount > 0
                    ? `${summary.openCareContactsCount.toLocaleString("es-CO")} con posventa abierta`
                    : "0 con posventa abierta"}
                </p>
              </div>
              <span className="bg-brand-turquoise/15 rounded-lg p-2 text-cyan-700">
                <ShieldCheck className="h-4 w-4" />
              </span>
            </div>
          </AdminCard>
        </section>

        {/* Analítica visual: composición de cuentas y canales de captación */}
        {summary.totalContacts > 0 && (
          <section className="grid grid-cols-1 gap-4 lg:grid-cols-12">
            <AdminCard className="flex flex-col justify-between p-5 lg:col-span-7">
              <div className="space-y-3">
                <div>
                  <h2 className="text-brand-purple-dark font-display text-sm font-bold">
                    Composición de identidad comercial
                  </h2>
                  <p className="text-brand-muted text-xs">
                    Proporción entre cuentas verificadas y contactos invitados o consultivos (haz
                    clic para filtrar).
                  </p>
                </div>
                <AdminSegmentedBar
                  ariaLabel="Composición del directorio entre cuentas registradas e invitados"
                  items={[
                    {
                      key: "registered",
                      label: "Con cuenta web",
                      count: summary.registeredCount,
                      tone: "purple",
                      href: buildSegmentHref("registered"),
                    },
                    {
                      key: "guest",
                      label: "Invitados sin cuenta",
                      count: summary.guestCount,
                      tone: "turquoise",
                      href: buildSegmentHref("guest"),
                    },
                  ]}
                />
              </div>

              <div className="border-brand-purple/10 mt-4 grid grid-cols-3 gap-2 border-t pt-3 text-xs">
                <Link
                  href={buildSegmentHref("paid")}
                  className="hover:bg-brand-purple/5 rounded-lg p-2 transition-colors"
                >
                  <p className="text-brand-muted text-[11px]">Con compras</p>
                  <p className="text-brand-purple-dark font-bold tabular-nums">
                    {summary.buyersCount.toLocaleString("es-CO")}
                  </p>
                </Link>
                <Link
                  href={buildSegmentHref("vip")}
                  className="hover:bg-brand-purple/5 rounded-lg p-2 transition-colors"
                >
                  <p className="text-brand-muted text-[11px]">VIP (≥ 3)</p>
                  <p className="text-brand-purple-dark font-bold tabular-nums">
                    {summary.vipCount.toLocaleString("es-CO")}
                  </p>
                </Link>
                <Link
                  href={buildSegmentHref("open-care")}
                  className="hover:bg-brand-purple/5 rounded-lg p-2 transition-colors"
                >
                  <p className="text-brand-muted text-[11px]">Posventa activa</p>
                  <p className="text-brand-purple-dark font-bold tabular-nums">
                    {summary.openCareContactsCount.toLocaleString("es-CO")}
                  </p>
                </Link>
              </div>
            </AdminCard>

            <AdminCard className="p-5 lg:col-span-5">
              <div className="mb-3">
                <h2 className="text-brand-purple-dark font-display text-sm font-bold">
                  Origen de primer contacto
                </h2>
                <p className="text-brand-muted text-xs">
                  Canal por el que ingresó cada identidad al grafo CRM.
                </p>
              </div>
              <AdminDonutChart
                ariaLabel="Distribución de contactos por canal de origen"
                centerValue={summary.totalContacts.toLocaleString("es-CO")}
                centerLabel="Contactos"
                slices={sourceBreakdown.slice(0, 6).map((row) => ({
                  key: row.source,
                  label: SOURCE_LABEL[row.source] ?? row.source,
                  count: row.count,
                  tone: SOURCE_TONE[row.source] ?? "slate",
                }))}
              />
            </AdminCard>
          </section>
        )}

        {/* Píldoras interactivas de segmento */}
        <div className="flex flex-wrap gap-2" role="navigation" aria-label="Segmentos de contactos">
          {SEGMENT_PILLS.map((pill) => {
            const active = pill.key === segment;
            const href = buildSegmentHref(pill.key);
            return (
              <Link
                key={pill.key}
                href={href}
                aria-current={active ? "page" : undefined}
                className={
                  active
                    ? "bg-brand-purple inline-flex min-h-10 items-center rounded-full px-3.5 py-1.5 text-xs font-semibold text-white shadow-xs transition-colors"
                    : "border-brand-purple/20 text-brand-purple-dark hover:border-brand-purple/50 hover:bg-brand-purple/5 inline-flex min-h-10 items-center rounded-full border bg-white px-3.5 py-1.5 text-xs font-semibold transition-colors"
                }
              >
                {pill.label}
              </Link>
            );
          })}
        </div>

        {/* Toolbar de búsqueda y ordenamiento */}
        <form
          method="GET"
          className="border-brand-purple/10 grid grid-cols-1 gap-3 rounded-xl border bg-white p-4 shadow-sm sm:grid-cols-12"
        >
          {segment !== "all" && <input type="hidden" name="segment" value={segment} />}
          {includeStaff && <input type="hidden" name="staff" value="1" />}
          <div className="sm:col-span-7">
            <label
              htmlFor="f-q"
              className="text-brand-purple-dark/70 mb-1 block text-xs font-semibold"
            >
              Buscar
            </label>
            <Input
              id="f-q"
              name="q"
              type="search"
              defaultValue={q ?? ""}
              placeholder={
                piiMasked
                  ? "ID de contacto u organización…"
                  : "Nombre, email, celular, documento DIAN u organización…"
              }
              className="border-brand-purple/20 focus-visible:ring-brand-purple/30"
            />
          </div>
          <div className="sm:col-span-4">
            <label
              htmlFor="f-sort"
              className="text-brand-purple-dark/70 mb-1 block text-xs font-semibold"
            >
              Ordenar por
            </label>
            <select
              id="f-sort"
              name="sort"
              defaultValue={sort}
              className="border-brand-purple/20 focus:border-brand-purple focus:ring-brand-purple/20 h-9 w-full rounded-md border bg-white px-2 py-1.5 text-sm focus:ring-2 focus:outline-none"
            >
              <option value="recent">Actividad más reciente</option>
              <option value="recent-asc">Actividad más antigua</option>
              <option value="ltv">Mayor LTV neto ($)</option>
              <option value="ltv-asc">Menor LTV neto ($)</option>
              <option value="orders">Más pedidos pagados</option>
              <option value="orders-asc">Menos pedidos pagados</option>
              <option value="name">Nombre A–Z</option>
              <option value="name-desc">Nombre Z–A</option>
            </select>
          </div>
          <div className="flex items-end gap-2 sm:col-span-1">
            <Button
              type="submit"
              size="sm"
              className="bg-gradient-brand h-9 w-full text-white hover:brightness-110"
            >
              Aplicar
            </Button>
          </div>
          {hasActiveFilters && (
            <div className="sm:col-span-12">
              <Link
                href="/admin/clientes"
                className="text-brand-muted hover:text-brand-purple-dark text-xs font-semibold"
              >
                Limpiar filtros
              </Link>
            </div>
          )}
        </form>

        {items.length === 0 ? (
          <AdminEmpty
            icon={<Users className="h-5 w-5" />}
            title={hasActiveFilters ? "Sin resultados" : "Aún no hay contactos registrados"}
            description={
              hasActiveFilters
                ? "Prueba quitar algún filtro o cambiar el texto de búsqueda."
                : "Cuando ingrese el primer pedido, solicitud B2B o registro, aparecerá aquí."
            }
          />
        ) : (
          <AdminTable minWidth={880}>
            <AdminTableHead>
              <tr>
                <SortableHeader
                  label="Contacto"
                  ascValue="name"
                  descValue="name-desc"
                  currentSort={sort}
                  basePath="/admin/clientes"
                  preserve={sortPreserve}
                />
                <th className="px-4 py-3 text-left font-semibold">Tipo / Origen</th>
                <th className="px-4 py-3 text-left font-semibold">Email y teléfono</th>
                <SortableHeader
                  label="Pedidos pagados"
                  ascValue="orders"
                  descValue="orders-asc"
                  currentSort={sort}
                  basePath="/admin/clientes"
                  preserve={sortPreserve}
                  align="center"
                />
                <SortableHeader
                  label="LTV neto"
                  ascValue="ltv"
                  descValue="ltv-asc"
                  currentSort={sort}
                  basePath="/admin/clientes"
                  preserve={sortPreserve}
                  align="right"
                />
                <th className="px-4 py-3 text-center font-semibold">Posventa</th>
                <th className="px-4 py-3 text-center font-semibold">Marketing</th>
                <SortableHeader
                  label="Última actividad"
                  ascValue="recent-asc"
                  descValue="recent"
                  currentSort={sort}
                  basePath="/admin/clientes"
                  preserve={sortPreserve}
                />
                <th className="px-4 py-3" />
              </tr>
            </AdminTableHead>
            <AdminTableBody>
              {items.map((c) => (
                <AdminTableRow key={c.id}>
                  <td className="px-4 py-3">
                    <div className="text-brand-purple-dark font-medium">{c.displayName}</div>
                    <div className="text-brand-muted flex flex-wrap items-center gap-1.5 text-xs">
                      {c.organizationName && <span>{c.organizationName}</span>}
                      {c.documentLabel && <span>· {c.documentLabel}</span>}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-col items-start gap-1">
                      <div className="flex flex-wrap items-center gap-1">
                        {c.hasCustomerAccount ? (
                          <AdminBadge tone="purple">Con cuenta</AdminBadge>
                        ) : (
                          <AdminBadge tone="slate">Invitado</AdminBadge>
                        )}
                        {c.isStaffAdmin && <AdminBadge tone="amber">Equipo interno</AdminBadge>}
                      </div>
                      <span className="text-brand-muted text-[11px]">
                        {SOURCE_LABEL[c.source] ?? c.source}
                      </span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-xs">
                    <div className="text-brand-purple-dark/85">{c.primaryEmail ?? "—"}</div>
                    {c.primaryPhoneE164 && (
                      <div className="text-brand-muted mt-0.5">{c.primaryPhoneE164}</div>
                    )}
                  </td>
                  <td className="px-4 py-3 text-center">
                    {c.paidOrdersCount >= 3 ? (
                      <AdminBadge tone="purple">VIP · {c.paidOrdersCount}</AdminBadge>
                    ) : c.paidOrdersCount > 0 ? (
                      <AdminBadge tone="emerald">{c.paidOrdersCount}</AdminBadge>
                    ) : (
                      <span className="text-brand-muted text-xs">0</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right">
                    {c.netLtvCents > 0 ? (
                      <span className="text-brand-purple-dark text-xs font-semibold tabular-nums">
                        {formatCOP(c.netLtvCents)}
                      </span>
                    ) : (
                      <span className="text-brand-muted text-xs">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-center">
                    {c.openCareCount > 0 ? (
                      <AdminBadge tone="amber">{c.openCareCount} abierto(s)</AdminBadge>
                    ) : (
                      <span className="text-brand-muted text-xs">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-center">
                    {c.marketingOptIn ? (
                      <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-700">
                        <ShieldCheck className="h-3.5 w-3.5" />
                        Opt-in
                      </span>
                    ) : (
                      <span className="text-brand-muted text-xs">No</span>
                    )}
                  </td>
                  <td className="text-brand-muted px-4 py-3 text-xs">
                    {formatRelativeTime(c.lastActivityAt)}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Link
                      href={`/admin/clientes/${c.id}`}
                      className="text-brand-purple-dark hover:text-brand-purple -my-2 inline-flex min-h-11 items-center gap-1 text-xs font-semibold"
                    >
                      Contacto 360
                      <ChevronRight className="h-3.5 w-3.5" />
                    </Link>
                  </td>
                </AdminTableRow>
              ))}
            </AdminTableBody>
          </AdminTable>
        )}

        {totalPages > 1 && (
          <div className="text-brand-purple-dark/70 flex items-center justify-between text-sm">
            <span>
              {total.toLocaleString("es-CO")} contactos · página {page} de {totalPages}
            </span>
            <div className="flex gap-1">
              {page > 1 && (
                <PaginationLink
                  page={page - 1}
                  q={q}
                  segment={segment}
                  sort={sort}
                  includeStaff={includeStaff}
                >
                  ← Anterior
                </PaginationLink>
              )}
              {page < totalPages && (
                <PaginationLink
                  page={page + 1}
                  q={q}
                  segment={segment}
                  sort={sort}
                  includeStaff={includeStaff}
                >
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
  segment,
  sort,
  includeStaff,
  children,
}: {
  page: number;
  q?: string;
  segment?: ContactSegmentFilter;
  sort?: ContactSortOption;
  includeStaff?: boolean;
  children: React.ReactNode;
}) {
  const params = new URLSearchParams();
  params.set("page", String(page));
  if (q) params.set("q", q);
  if (segment && segment !== "all") params.set("segment", segment);
  if (sort && sort !== "recent") params.set("sort", sort);
  if (includeStaff) params.set("staff", "1");
  return (
    <Link
      href={`/admin/clientes?${params.toString()}`}
      className="border-brand-purple/20 hover:bg-brand-purple/5 text-brand-purple-dark inline-flex min-h-10 items-center rounded-md border bg-white px-3 py-1.5 text-xs font-medium"
    >
      {children}
    </Link>
  );
}
