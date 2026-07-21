/*
 * Admin — Cotizaciones (Etapa 1: catálogo + WhatsApp).
 *
 * Lista paginada con filtros (estado, búsqueda por número/nombre/WhatsApp,
 * rango de fechas) sobre features/quotes/admin-service.listQuotes. Click en
 * "Ver detalle" → /admin/cotizaciones/[id] (contacto, items, cambio de
 * estado, notas internas).
 *
 * Default sin filtros: PENDIENTES (lo que requiere acción de Lucy), igual que
 * Soporte (OPEN) y Retractos (PENDING).
 */

import type { Metadata } from "next";
import Link from "next/link";
import { ChevronRight, FileText } from "lucide-react";
import { requireRole } from "@/lib/admin-rbac-guard";
import { formatCOP } from "@/lib/format";
import { listQuotes } from "@/features/quotes/admin-service";
import type { QuoteStatus } from "@lucams/db";
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

export const metadata: Metadata = { title: "Cotizaciones" };

type SearchParams = Promise<{ [key: string]: string | string[] | undefined }>;

const STATUS_LABEL: Record<QuoteStatus, string> = {
  PENDING: "Pendiente",
  CONTACTED: "Contactada",
  CLOSED: "Cerrada",
  DISCARDED: "Descartada",
};

const STATUS_TONE: Record<QuoteStatus, "amber" | "blue" | "emerald" | "slate"> = {
  PENDING: "amber",
  CONTACTED: "blue",
  CLOSED: "emerald",
  DISCARDED: "slate",
};

const QUOTE_STATUSES = Object.keys(STATUS_LABEL) as QuoteStatus[];

const dateFmt = new Intl.DateTimeFormat("es-CO", {
  day: "2-digit",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

function pickString(sp: Record<string, string | string[] | undefined>, key: string) {
  const v = sp[key];
  return typeof v === "string" ? v : undefined;
}

/** Parsea "YYYY-MM-DD" del input date; `endOfDay` incluye todo el día final. */
function parseDateParam(raw: string | undefined, endOfDay = false): Date | undefined {
  if (!raw || !/^\d{4}-\d{2}-\d{2}$/.test(raw)) return undefined;
  const d = new Date(`${raw}T${endOfDay ? "23:59:59.999" : "00:00:00.000"}`);
  return Number.isNaN(d.getTime()) ? undefined : d;
}

export default async function AdminCotizacionesPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  await requireRole(["SUPERADMIN", "MANAGER"]);

  const sp = await searchParams;
  const q = pickString(sp, "q");
  const statusRaw = pickString(sp, "status");
  const validStatus = QUOTE_STATUSES.find((s) => s === statusRaw);
  // Default: pendientes (lo que requiere acción). "all" = sin filtro de estado.
  const status = statusRaw === "all" ? "all" : (validStatus ?? "PENDING");
  const from = pickString(sp, "from");
  const to = pickString(sp, "to");
  const page = Number(sp.page) || 1;

  const { items, total, totalPages } = await listQuotes({
    status,
    q,
    from: parseDateParam(from),
    to: parseDateParam(to, true),
    page,
  });
  const hasActiveFilters = !!q || status !== "PENDING" || !!from || !!to;

  return (
    <AdminPage>
      <AdminPageHeader
        icon={<FileText className="h-5 w-5" />}
        title="Cotizaciones"
        subtitle={
          <>
            {total} {total === 1 ? "cotización" : "cotizaciones"}
            {hasActiveFilters && " · con filtros aplicados"}
          </>
        }
        breadcrumbs={[
          { label: "Admin", href: "/admin/dashboard" },
          { label: "Ventas" },
          { label: "Cotizaciones" },
        ]}
      />

      <AdminPageBody>
        <form
          method="GET"
          className="border-brand-purple/10 grid grid-cols-1 gap-3 rounded-xl border bg-white p-4 shadow-sm sm:grid-cols-12"
        >
          <div className="sm:col-span-4">
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
              placeholder="Número (COT-XXXXXX), nombre o WhatsApp…"
              className="border-brand-purple/20 focus-visible:ring-brand-purple/30"
            />
          </div>
          <div className="sm:col-span-3">
            <label
              htmlFor="f-status"
              className="text-brand-purple-dark/70 mb-1 block text-xs font-semibold"
            >
              Estado
            </label>
            <select
              id="f-status"
              name="status"
              defaultValue={status}
              className="border-brand-purple/20 focus:border-brand-purple focus:ring-brand-purple/20 w-full rounded-md border bg-white px-2 py-1.5 text-sm focus:ring-2 focus:outline-none"
            >
              <option value="PENDING">Pendientes</option>
              <option value="CONTACTED">Contactadas</option>
              <option value="CLOSED">Cerradas</option>
              <option value="DISCARDED">Descartadas</option>
              <option value="all">Todas</option>
            </select>
          </div>
          <div className="sm:col-span-2">
            <label
              htmlFor="f-from"
              className="text-brand-purple-dark/70 mb-1 block text-xs font-semibold"
            >
              Desde
            </label>
            <Input
              id="f-from"
              name="from"
              type="date"
              defaultValue={from ?? ""}
              className="border-brand-purple/20 focus-visible:ring-brand-purple/30"
            />
          </div>
          <div className="sm:col-span-2">
            <label
              htmlFor="f-to"
              className="text-brand-purple-dark/70 mb-1 block text-xs font-semibold"
            >
              Hasta
            </label>
            <Input
              id="f-to"
              name="to"
              type="date"
              defaultValue={to ?? ""}
              className="border-brand-purple/20 focus-visible:ring-brand-purple/30"
            />
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
                href="/admin/cotizaciones"
                className="text-brand-muted hover:text-brand-purple-dark text-xs font-semibold"
              >
                Limpiar filtros
              </Link>
            </div>
          )}
        </form>

        {items.length === 0 ? (
          <AdminEmpty
            icon={<FileText className="h-5 w-5" />}
            title={hasActiveFilters ? "Sin resultados" : "Aún no hay cotizaciones pendientes"}
            description={
              hasActiveFilters
                ? "Prueba quitar algún filtro o cambiar el texto de búsqueda."
                : "Cuando un cliente pida su cotización desde el catálogo, aparecerá acá. 🦝"
            }
          />
        ) : (
          <AdminTable>
            <AdminTableHead>
              <tr>
                <th className="px-4 py-3 text-left font-semibold">Número</th>
                <th className="px-4 py-3 text-left font-semibold">Cliente</th>
                <th className="px-4 py-3 text-left font-semibold">Ciudad</th>
                <th className="px-4 py-3 text-center font-semibold">Items</th>
                <th className="px-4 py-3 text-right font-semibold">Total</th>
                <th className="px-4 py-3 text-left font-semibold">Estado</th>
                <th className="px-4 py-3 text-left font-semibold">Creada</th>
                <th className="px-4 py-3" />
              </tr>
            </AdminTableHead>
            <AdminTableBody>
              {items.map((quote) => (
                <AdminTableRow key={quote.id}>
                  <td className="px-4 py-3">
                    <span className="text-brand-purple-dark font-mono text-sm font-semibold">
                      {quote.number}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="text-brand-purple-dark text-sm font-medium">
                      {quote.customerName}
                    </div>
                    <div className="text-brand-muted text-xs tabular-nums">
                      {quote.customerWhatsapp}
                    </div>
                  </td>
                  <td className="text-brand-purple-dark/85 px-4 py-3 text-xs">
                    {quote.city}
                    <span className="text-brand-muted block text-[10px]">{quote.department}</span>
                  </td>
                  <td className="px-4 py-3 text-center">
                    <span className="text-brand-purple-dark/85 text-xs tabular-nums">
                      {quote._count.items}
                    </span>
                  </td>
                  <td className="text-brand-purple-dark px-4 py-3 text-right text-sm font-semibold tabular-nums">
                    {formatCOP(quote.total)}
                  </td>
                  <td className="px-4 py-3">
                    <AdminBadge tone={STATUS_TONE[quote.status]}>
                      {STATUS_LABEL[quote.status]}
                    </AdminBadge>
                  </td>
                  <td className="text-brand-muted px-4 py-3 text-xs">
                    {dateFmt.format(quote.createdAt)}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Link
                      href={`/admin/cotizaciones/${quote.id}`}
                      className="text-brand-purple-dark hover:text-brand-purple inline-flex items-center gap-1 text-xs font-medium"
                    >
                      Ver detalle
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
              {total} {total === 1 ? "cotización" : "cotizaciones"} · página {page} de {totalPages}
            </span>
            <div className="flex gap-1">
              {page > 1 && (
                <PaginationLink page={page - 1} q={q} status={status} from={from} to={to}>
                  ← Anterior
                </PaginationLink>
              )}
              {page < totalPages && (
                <PaginationLink page={page + 1} q={q} status={status} from={from} to={to}>
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
  from,
  to,
  children,
}: {
  page: number;
  q?: string;
  status?: string;
  from?: string;
  to?: string;
  children: React.ReactNode;
}) {
  const params = new URLSearchParams();
  params.set("page", String(page));
  if (q) params.set("q", q);
  if (status && status !== "PENDING") params.set("status", status);
  if (from) params.set("from", from);
  if (to) params.set("to", to);
  return (
    <Link
      href={`/admin/cotizaciones?${params.toString()}`}
      className="border-brand-purple/20 hover:bg-brand-purple/5 text-brand-purple-dark rounded-md border bg-white px-3 py-1.5 text-xs font-medium"
    >
      {children}
    </Link>
  );
}
