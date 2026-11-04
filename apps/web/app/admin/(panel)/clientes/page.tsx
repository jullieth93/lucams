/*
 * Admin > Clientes y Contactos — Directorio unificado sobre `Contact` (Fase 9 · S19).
 *
 * Unifica cuentas autenticadas (`Customer`) con compradores invitados, cotizaciones
 * WhatsApp, tickets de soporte, carritos abandonados y suscriptores bajo la entidad
 * canónica `Contact` (ADR-193), respetando RBAC por capacidades y enmascaramiento
 * determinista de PII en servidor.
 */

import type { Metadata } from "next";
import Link from "next/link";
import { ChevronRight, GitMerge, ShieldCheck, Users } from "lucide-react";
import {
  AdminPage,
  AdminPageHeader,
  AdminPageBody,
  AdminTable,
  AdminTableHead,
  AdminTableBody,
  AdminTableRow,
  AdminEmpty,
  AdminBadge,
} from "@/components/admin-page";
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
  QUOTE: "Cotización WA",
  ABANDONED_CART: "Carrito",
  NEWSLETTER: "Newsletter",
  B2B_INQUIRY: "Empresas / Eventos",
  MANUAL: "Manual",
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
  const page = Math.max(1, Number(sp.page) || 1);

  const { items, total, totalPages, pendingMergesCount, piiMasked } = await listContactsForActor(
    { q, segment, sort, page },
    session.admin.role,
  );
  const hasActiveFilters = Boolean(q) || segment !== "all" || sort !== "recent";

  return (
    <AdminPage>
      <AdminPageHeader
        icon={<Users className="h-5 w-5" />}
        title="Clientes y contactos"
        subtitle={
          <>
            {total.toLocaleString("es-CO")} {total === 1 ? "persona" : "personas"} en el grafo
            unificado (cuentas + invitados + posventa)
            {hasActiveFilters && " · con filtros aplicados"}
          </>
        }
        breadcrumbs={[
          { label: "Admin", href: "/admin/dashboard" },
          { label: "Ventas" },
          { label: "Clientes" },
        ]}
        actions={
          canMerge ? (
            <Link
              href="/admin/clientes/duplicados"
              className="border-brand-purple/25 text-brand-purple-dark hover:bg-brand-purple/10 inline-flex min-h-11 items-center gap-2 rounded-lg border bg-white px-3.5 py-2 text-sm font-semibold transition-colors"
            >
              <GitMerge className="h-4 w-4" />
              Posibles duplicados
              {pendingMergesCount > 0 && <AdminBadge tone="amber">{pendingMergesCount}</AdminBadge>}
            </Link>
          ) : undefined
        }
      />

      <AdminPageBody>
        {/* Píldoras interactivas de segmento */}
        <div className="flex flex-wrap gap-2" role="navigation" aria-label="Segmentos de contactos">
          {SEGMENT_PILLS.map((pill) => {
            const active = pill.key === segment;
            const params = new URLSearchParams();
            if (q) params.set("q", q);
            if (pill.key !== "all") params.set("segment", pill.key);
            if (sort !== "recent") params.set("sort", sort);
            const href = params.toString()
              ? `/admin/clientes?${params.toString()}`
              : "/admin/clientes";
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
              <option value="ltv">Mayor LTV neto ($)</option>
              <option value="orders">Más pedidos pagados</option>
              <option value="name">Nombre A–Z</option>
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
                : "Cuando ingrese el primer pedido, cotización o registro, aparecerá acá."
            }
          />
        ) : (
          <AdminTable>
            <AdminTableHead>
              <tr>
                <th className="px-4 py-3 text-left font-semibold">Contacto</th>
                <th className="px-4 py-3 text-left font-semibold">Tipo / Origen</th>
                <th className="px-4 py-3 text-left font-semibold">Email y teléfono</th>
                <th className="px-4 py-3 text-center font-semibold">Pedidos pagados</th>
                <th className="px-4 py-3 text-right font-semibold">LTV neto</th>
                <th className="px-4 py-3 text-center font-semibold">Posventa</th>
                <th className="px-4 py-3 text-center font-semibold">Marketing</th>
                <th className="px-4 py-3 text-left font-semibold">Última actividad</th>
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
                      {c.hasCustomerAccount ? (
                        <AdminBadge tone="purple">Con cuenta</AdminBadge>
                      ) : (
                        <AdminBadge tone="slate">Invitado</AdminBadge>
                      )}
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
                <PaginationLink page={page - 1} q={q} segment={segment} sort={sort}>
                  ← Anterior
                </PaginationLink>
              )}
              {page < totalPages && (
                <PaginationLink page={page + 1} q={q} segment={segment} sort={sort}>
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
  children,
}: {
  page: number;
  q?: string;
  segment?: ContactSegmentFilter;
  sort?: ContactSortOption;
  children: React.ReactNode;
}) {
  const params = new URLSearchParams();
  params.set("page", String(page));
  if (q) params.set("q", q);
  if (segment && segment !== "all") params.set("segment", segment);
  if (sort && sort !== "recent") params.set("sort", sort);
  return (
    <Link
      href={`/admin/clientes?${params.toString()}`}
      className="border-brand-purple/20 hover:bg-brand-purple/5 text-brand-purple-dark inline-flex min-h-10 items-center rounded-md border bg-white px-3 py-1.5 text-xs font-medium"
    >
      {children}
    </Link>
  );
}
