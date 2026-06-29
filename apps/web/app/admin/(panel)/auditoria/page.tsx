/*
 * /admin/auditoria — Tabla paginada del AdminActionLog.
 *
 * Filtros opcionales (query params):
 *   - admin: id de AdminUser
 *   - action: prefijo (ej. "cms.block" matchea cms.block.publish,
 *     cms.block.inline_publish, etc.)
 *   - entity: entityType exacto (ej. "Product", "CmsBlock")
 *   - from / to: ISO date YYYY-MM-DD
 *   - page: número (paginación 30/page)
 *
 * Cada fila expande mostrando metadata sanitizada (JSON pretty).
 */

import type { Metadata } from "next";
import Link from "next/link";
import { Activity, ChevronLeft, ChevronRight } from "lucide-react";
import type { Prisma } from "@lucams/db";
import { prisma } from "@/lib/db";
import { requireRole } from "@/lib/admin-rbac-guard";
import {
  AdminPage,
  AdminPageHeader,
  AdminPageBody,
  AdminCard,
  AdminTable,
  AdminTableHead,
  AdminTableBody,
  AdminTableRow,
  AdminButton,
} from "@/components/admin-page";

export const metadata: Metadata = {
  title: "Auditoría",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

const PAGE_SIZE = 30;

type SearchParams = Promise<{ [key: string]: string | string[] | undefined }>;

function pickString(sp: Record<string, string | string[] | undefined>, key: string) {
  const v = sp[key];
  return typeof v === "string" ? v : undefined;
}

export default async function AuditoriaPage({ searchParams }: { searchParams: SearchParams }) {
  const session = await requireRole(["SUPERADMIN"]);

  const sp = await searchParams;
  const filterAdmin = pickString(sp, "admin");
  const filterAction = pickString(sp, "action");
  const filterEntity = pickString(sp, "entity");
  const fromDate = pickString(sp, "from");
  const toDate = pickString(sp, "to");
  const page = Math.max(1, Number.parseInt(pickString(sp, "page") ?? "1", 10) || 1);

  const where: Prisma.AdminActionLogWhereInput = {
    ...(filterAdmin ? { actorId: filterAdmin } : {}),
    ...(filterAction ? { action: { startsWith: filterAction } } : {}),
    ...(filterEntity ? { entityType: filterEntity } : {}),
    ...(fromDate || toDate
      ? {
          createdAt: {
            ...(fromDate ? { gte: new Date(fromDate) } : {}),
            ...(toDate ? { lte: new Date(`${toDate}T23:59:59.999Z`) } : {}),
          },
        }
      : {}),
  };

  const [total, logs, admins] = await Promise.all([
    prisma.adminActionLog.count({ where }),
    prisma.adminActionLog.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: PAGE_SIZE,
      skip: (page - 1) * PAGE_SIZE,
    }),
    prisma.adminUser.findMany({
      where: { deletedAt: null },
      orderBy: { email: "asc" },
      select: { id: true, email: true },
    }),
  ]);
  const adminMap = new Map(admins.map((a) => [a.id, a.email]));
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <AdminPage>
      <AdminPageHeader
        icon={<Activity className="h-5 w-5" />}
        title="Auditoría"
        subtitle={
          <>
            Registro inmutable de todas las acciones admin sobre el sitio.{" "}
            <strong className="text-brand-purple">{total.toLocaleString("es-CO")}</strong>{" "}
            {total === 1 ? "evento registrado" : "eventos registrados"}.
          </>
        }
        breadcrumbs={[
          { label: "Admin", href: "/admin/dashboard" },
          { label: "Analítica" },
          { label: "Auditoría" },
        ]}
      />

      <AdminPageBody>
        {/* Filtros */}
        <form
          method="GET"
          className="border-brand-purple/10 grid grid-cols-1 gap-3 rounded-xl border bg-white p-4 shadow-sm sm:grid-cols-2 lg:grid-cols-5"
        >
          <div>
            <label
              htmlFor="f-admin"
              className="text-brand-purple-dark/70 mb-1 block text-xs font-semibold"
            >
              Admin
            </label>
            <select
              id="f-admin"
              name="admin"
              defaultValue={filterAdmin ?? ""}
              className="border-brand-purple/20 focus:border-brand-purple focus:ring-brand-purple/20 w-full rounded-md border bg-white px-2 py-1.5 text-sm focus:ring-2 focus:outline-none"
            >
              <option value="">Todos</option>
              {admins.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.email}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label
              htmlFor="f-action"
              className="text-brand-purple-dark/70 mb-1 block text-xs font-semibold"
            >
              Acción (prefix)
            </label>
            <input
              id="f-action"
              name="action"
              defaultValue={filterAction ?? ""}
              placeholder="ej. cms.block"
              className="border-brand-purple/20 focus:border-brand-purple focus:ring-brand-purple/20 w-full rounded-md border bg-white px-2 py-1.5 text-sm focus:ring-2 focus:outline-none"
            />
          </div>
          <div>
            <label
              htmlFor="f-entity"
              className="text-brand-purple-dark/70 mb-1 block text-xs font-semibold"
            >
              Tipo
            </label>
            <input
              id="f-entity"
              name="entity"
              defaultValue={filterEntity ?? ""}
              placeholder="ej. Product"
              className="border-brand-purple/20 focus:border-brand-purple focus:ring-brand-purple/20 w-full rounded-md border bg-white px-2 py-1.5 text-sm focus:ring-2 focus:outline-none"
            />
          </div>
          <div>
            <label
              htmlFor="f-from"
              className="text-brand-purple-dark/70 mb-1 block text-xs font-semibold"
            >
              Desde
            </label>
            <input
              id="f-from"
              name="from"
              type="date"
              defaultValue={fromDate ?? ""}
              className="border-brand-purple/20 focus:border-brand-purple focus:ring-brand-purple/20 w-full rounded-md border bg-white px-2 py-1.5 text-sm focus:ring-2 focus:outline-none"
            />
          </div>
          <div>
            <label
              htmlFor="f-to"
              className="text-brand-purple-dark/70 mb-1 block text-xs font-semibold"
            >
              Hasta
            </label>
            <input
              id="f-to"
              name="to"
              type="date"
              defaultValue={toDate ?? ""}
              className="border-brand-purple/20 focus:border-brand-purple focus:ring-brand-purple/20 w-full rounded-md border bg-white px-2 py-1.5 text-sm focus:ring-2 focus:outline-none"
            />
          </div>
          <div className="flex items-end gap-2 sm:col-span-2 lg:col-span-5">
            <AdminButton type="submit" variant="primary" size="sm">
              Aplicar filtros
            </AdminButton>
            <Link
              href="/admin/auditoria"
              className="text-brand-purple-dark/60 hover:text-brand-purple-dark text-xs font-semibold"
            >
              Limpiar
            </Link>
          </div>
        </form>

        {/* Tabla */}
        <AdminCard className="overflow-x-auto p-0">
          <AdminTable className="border-0 shadow-none">
            <AdminTableHead>
              <tr>
                <th className="px-4 py-3 text-left font-semibold">Cuándo</th>
                <th className="px-4 py-3 text-left font-semibold">Admin</th>
                <th className="px-4 py-3 text-left font-semibold">Acción</th>
                <th className="px-4 py-3 text-left font-semibold">Entidad</th>
                <th className="px-4 py-3 text-left font-semibold">Metadata</th>
                <th className="px-4 py-3 text-left font-semibold">IP</th>
              </tr>
            </AdminTableHead>
            <AdminTableBody>
              {logs.length === 0 ? (
                <tr>
                  <td colSpan={6} className="text-brand-purple-dark/55 px-4 py-10 text-center">
                    Sin eventos con los filtros aplicados.
                  </td>
                </tr>
              ) : (
                logs.map((row) => (
                  <AdminTableRow key={row.id}>
                    <td className="text-brand-purple-dark/75 px-4 py-2 text-xs">
                      {row.createdAt.toLocaleString("es-CO", {
                        dateStyle: "short",
                        timeStyle: "short",
                      })}
                    </td>
                    <td className="text-brand-purple-dark px-4 py-2 text-xs">
                      {adminMap.get(row.actorId) ?? (
                        <span className="text-brand-purple-dark/40 font-mono">
                          {row.actorId.slice(0, 8)}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-2 font-mono text-xs">
                      <span className="bg-brand-purple/10 text-brand-purple-dark rounded px-1.5 py-0.5">
                        {row.action}
                      </span>
                    </td>
                    <td className="px-4 py-2 text-xs">
                      <span className="text-brand-purple-dark/85">{row.entityType}</span>
                      <span className="text-brand-purple-dark/40 ml-1 font-mono">
                        {row.entityId.slice(0, 8)}
                      </span>
                    </td>
                    <td className="px-4 py-2 text-xs">
                      <details className="cursor-pointer">
                        <summary className="text-brand-purple-dark/55 hover:text-brand-purple-dark">
                          {Object.keys(row.metadata ?? {}).length} campos
                        </summary>
                        <pre className="bg-brand-purple/5 mt-1 max-w-md overflow-x-auto rounded p-2 text-[10px] leading-tight">
                          {JSON.stringify(row.metadata, null, 2)}
                        </pre>
                      </details>
                    </td>
                    <td className="text-brand-purple-dark/55 px-4 py-2 font-mono text-xs">
                      {row.ip ?? "—"}
                    </td>
                  </AdminTableRow>
                ))
              )}
            </AdminTableBody>
          </AdminTable>
        </AdminCard>

        {/* Pagination */}
        {totalPages > 1 && (
          <nav className="flex items-center justify-between" aria-label="Paginación">
            <p className="text-brand-purple-dark/70 text-xs">
              Página {page} de {totalPages}
            </p>
            <div className="flex gap-2">
              {page > 1 && (
                <Link
                  href={`?${new URLSearchParams({ ...buildParamsObject(sp), page: String(page - 1) }).toString()}`}
                  className="border-brand-purple/20 text-brand-purple-dark hover:bg-brand-purple/5 inline-flex items-center gap-1 rounded-md border bg-white px-3 py-1.5 text-xs font-semibold"
                >
                  <ChevronLeft className="h-3 w-3" />
                  Anterior
                </Link>
              )}
              {page < totalPages && (
                <Link
                  href={`?${new URLSearchParams({ ...buildParamsObject(sp), page: String(page + 1) }).toString()}`}
                  className="border-brand-purple/20 text-brand-purple-dark hover:bg-brand-purple/5 inline-flex items-center gap-1 rounded-md border bg-white px-3 py-1.5 text-xs font-semibold"
                >
                  Siguiente
                  <ChevronRight className="h-3 w-3" />
                </Link>
              )}
            </div>
          </nav>
        )}
      </AdminPageBody>
    </AdminPage>
  );
}

function buildParamsObject(sp: Record<string, string | string[] | undefined>) {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(sp)) {
    if (typeof v === "string") out[k] = v;
  }
  return out;
}
