/*
 * Admin > Clientes — Listado con búsqueda + filtros + paginación.
 *
 * Schema Customer ya existe (Supabase Auth + Prisma). Ley 1581:
 * admin solo LEE, no edita perfil ajeno. Click en fila → Customer 360.
 */

import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ChevronRight, Users } from "lucide-react";
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
import { getCurrentAdmin } from "@/lib/auth";
import { listCustomers } from "@/features/customers/service";

export const metadata: Metadata = {
  title: "Clientes",
};

type SearchParams = Promise<{ [key: string]: string | string[] | undefined }>;

function pickString(sp: Record<string, string | string[] | undefined>, key: string) {
  const v = sp[key];
  return typeof v === "string" ? v : undefined;
}

export default async function AdminClientesPage({ searchParams }: { searchParams: SearchParams }) {
  const session = await getCurrentAdmin();
  if (!session) redirect("/admin/login");

  const sp = await searchParams;
  const q = pickString(sp, "q");
  const statusRaw = pickString(sp, "status");
  const status = (["with-orders", "no-orders"].includes(statusRaw ?? "") ? statusRaw : "all") as
    | "all"
    | "with-orders"
    | "no-orders";
  const sortRaw = pickString(sp, "sort");
  const sort = (["name", "orders"].includes(sortRaw ?? "") ? sortRaw : "recent") as
    | "recent"
    | "name"
    | "orders";
  const page = Number(sp.page) || 1;

  const { items, total, totalPages } = await listCustomers({ q, status, sort, page });
  const hasActiveFilters = !!q || status !== "all" || sort !== "recent";

  const dateFmt = new Intl.DateTimeFormat("es-CO", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });

  return (
    <AdminPage>
      <AdminPageHeader
        icon={<Users className="h-5 w-5" />}
        title="Clientes"
        subtitle={
          <>
            {total} {total === 1 ? "cliente" : "clientes"}
            {hasActiveFilters && " · con filtros aplicados"}
          </>
        }
        breadcrumbs={[
          { label: "Admin", href: "/admin/dashboard" },
          { label: "Ventas" },
          { label: "Clientes" },
        ]}
      />

      <AdminPageBody>
        {/* Toolbar */}
        <form
          method="GET"
          className="border-brand-purple/10 grid grid-cols-1 gap-3 rounded-xl border bg-white p-4 shadow-sm sm:grid-cols-12"
        >
          <div className="sm:col-span-5">
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
              placeholder="Email, nombre, documento o teléfono…"
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
              <option value="all">Todos</option>
              <option value="with-orders">Con pedidos</option>
              <option value="no-orders">Sin pedidos aún</option>
            </select>
          </div>
          <div className="sm:col-span-3">
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
              className="border-brand-purple/20 focus:border-brand-purple focus:ring-brand-purple/20 w-full rounded-md border bg-white px-2 py-1.5 text-sm focus:ring-2 focus:outline-none"
            >
              <option value="recent">Registro más reciente</option>
              <option value="name">Nombre A-Z</option>
              <option value="orders">Más pedidos primero</option>
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
                className="text-brand-purple/70 hover:text-brand-purple-dark text-xs font-semibold"
              >
                Limpiar filtros
              </Link>
            </div>
          )}
        </form>

        {items.length === 0 ? (
          <AdminEmpty
            icon={<Users className="h-5 w-5" />}
            title={hasActiveFilters ? "Sin resultados" : "Aún no hay clientes registrados"}
            description={
              hasActiveFilters
                ? "Prueba quitar algún filtro o cambiar el texto de búsqueda."
                : "Cuando el primer cliente se registre, aparecerá acá."
            }
          />
        ) : (
          <AdminTable>
            <AdminTableHead>
              <tr>
                <th className="px-4 py-3 text-left font-semibold">Cliente</th>
                <th className="px-4 py-3 text-left font-semibold">Email</th>
                <th className="px-4 py-3 text-left font-semibold">Documento</th>
                <th className="px-4 py-3 text-center font-semibold">Pedidos</th>
                <th className="px-4 py-3 text-center font-semibold">Reseñas</th>
                <th className="px-4 py-3 text-right font-semibold">Puntos</th>
                <th className="px-4 py-3 text-left font-semibold">Registro</th>
                <th className="px-4 py-3" />
              </tr>
            </AdminTableHead>
            <AdminTableBody>
              {items.map((c) => (
                <AdminTableRow key={c.id}>
                  <td className="px-4 py-3">
                    <div className="text-brand-purple-dark font-medium">{c.fullName}</div>
                    {c.phone && <div className="text-brand-purple-dark/55 text-xs">{c.phone}</div>}
                  </td>
                  <td className="text-brand-purple-dark/85 px-4 py-3 text-xs">{c.email}</td>
                  <td className="text-brand-purple-dark/75 px-4 py-3 text-xs">
                    {c.documentType && c.documentNumber
                      ? `${c.documentType} ${c.documentNumber}`
                      : "—"}
                  </td>
                  <td className="px-4 py-3 text-center">
                    {c.ordersCount > 0 ? (
                      <AdminBadge tone="emerald">{c.ordersCount}</AdminBadge>
                    ) : (
                      <span className="text-brand-purple-dark/40 text-xs">0</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-center">
                    {c.reviewsCount > 0 ? (
                      <span className="text-brand-purple-dark/85 text-xs tabular-nums">
                        {c.reviewsCount}
                      </span>
                    ) : (
                      <span className="text-brand-purple-dark/40 text-xs">—</span>
                    )}
                  </td>
                  <td className="text-brand-purple-dark/85 px-4 py-3 text-right text-xs tabular-nums">
                    {c.loyaltyPoints.toLocaleString("es-CO")}
                  </td>
                  <td className="text-brand-purple-dark/65 px-4 py-3 text-xs">
                    {dateFmt.format(c.createdAt)}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Link
                      href={`/admin/clientes/${c.id}`}
                      className="text-brand-purple hover:text-brand-purple-dark inline-flex items-center gap-1 text-xs font-medium"
                    >
                      Ver perfil
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
              {total} clientes · página {page} de {totalPages}
            </span>
            <div className="flex gap-1">
              {page > 1 && (
                <PaginationLink page={page - 1} q={q} status={status} sort={sort}>
                  ← Anterior
                </PaginationLink>
              )}
              {page < totalPages && (
                <PaginationLink page={page + 1} q={q} status={status} sort={sort}>
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
  sort,
  children,
}: {
  page: number;
  q?: string;
  status?: string;
  sort?: string;
  children: React.ReactNode;
}) {
  const params = new URLSearchParams();
  params.set("page", String(page));
  if (q) params.set("q", q);
  if (status && status !== "all") params.set("status", status);
  if (sort && sort !== "recent") params.set("sort", sort);
  return (
    <Link
      href={`/admin/clientes?${params.toString()}`}
      className="border-brand-purple/20 hover:bg-brand-purple/5 text-brand-purple-dark rounded-md border bg-white px-3 py-1.5 text-xs font-medium"
    >
      {children}
    </Link>
  );
}
