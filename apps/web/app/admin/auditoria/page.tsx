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
import { redirect } from "next/navigation";
import { ChevronLeft, ChevronRight } from "lucide-react";
import type { Prisma } from "@lucams/db";
import { prisma } from "@/lib/db";
import { getCurrentAdmin } from "@/lib/auth";

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
  const session = await getCurrentAdmin();
  if (!session) redirect("/admin/login");

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
    <div className="bg-slate-50 px-6 py-8">
      <div className="mx-auto max-w-6xl">
        <header className="mb-6">
          <Link
            href="/admin/dashboard"
            className="mb-2 inline-block text-xs text-slate-500 hover:text-slate-700"
          >
            ← Volver al dashboard
          </Link>
          <h1 className="font-display text-2xl text-slate-900">Auditoría</h1>
          <p className="text-sm text-slate-600">
            Registro inmutable de todas las acciones admin sobre el sitio.{" "}
            <span className="font-semibold">{total.toLocaleString("es-CO")}</span>{" "}
            {total === 1 ? "evento registrado" : "eventos registrados"}.
          </p>
        </header>

        {/* Filtros */}
        <form
          method="GET"
          className="mb-4 grid grid-cols-1 gap-3 rounded-lg border border-slate-200 bg-white p-4 sm:grid-cols-2 lg:grid-cols-5"
        >
          <div>
            <label htmlFor="f-admin" className="mb-1 block text-xs font-medium text-slate-600">
              Admin
            </label>
            <select
              id="f-admin"
              name="admin"
              defaultValue={filterAdmin ?? ""}
              className="w-full rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm"
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
            <label htmlFor="f-action" className="mb-1 block text-xs font-medium text-slate-600">
              Acción (prefix)
            </label>
            <input
              id="f-action"
              name="action"
              defaultValue={filterAction ?? ""}
              placeholder="ej. cms.block"
              className="w-full rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm"
            />
          </div>
          <div>
            <label htmlFor="f-entity" className="mb-1 block text-xs font-medium text-slate-600">
              Tipo
            </label>
            <input
              id="f-entity"
              name="entity"
              defaultValue={filterEntity ?? ""}
              placeholder="ej. Product"
              className="w-full rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm"
            />
          </div>
          <div>
            <label htmlFor="f-from" className="mb-1 block text-xs font-medium text-slate-600">
              Desde
            </label>
            <input
              id="f-from"
              name="from"
              type="date"
              defaultValue={fromDate ?? ""}
              className="w-full rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm"
            />
          </div>
          <div>
            <label htmlFor="f-to" className="mb-1 block text-xs font-medium text-slate-600">
              Hasta
            </label>
            <input
              id="f-to"
              name="to"
              type="date"
              defaultValue={toDate ?? ""}
              className="w-full rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm"
            />
          </div>
          <div className="flex items-end gap-2 sm:col-span-2 lg:col-span-5">
            <button
              type="submit"
              className="rounded-md bg-slate-800 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-900"
            >
              Aplicar filtros
            </button>
            <Link
              href="/admin/auditoria"
              className="text-xs font-semibold text-slate-500 hover:text-slate-700"
            >
              Limpiar
            </Link>
          </div>
        </form>

        {/* Tabla */}
        <div className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200 text-sm">
              <thead className="bg-slate-100 text-xs tracking-wider text-slate-600 uppercase">
                <tr>
                  <th className="px-4 py-2 text-left">Cuándo</th>
                  <th className="px-4 py-2 text-left">Admin</th>
                  <th className="px-4 py-2 text-left">Acción</th>
                  <th className="px-4 py-2 text-left">Entidad</th>
                  <th className="px-4 py-2 text-left">Metadata</th>
                  <th className="px-4 py-2 text-left">IP</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {logs.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-10 text-center text-slate-500">
                      Sin eventos con los filtros aplicados.
                    </td>
                  </tr>
                ) : (
                  logs.map((row) => (
                    <tr key={row.id} className="hover:bg-slate-50">
                      <td className="px-4 py-2 text-xs text-slate-600">
                        {row.createdAt.toLocaleString("es-CO", {
                          dateStyle: "short",
                          timeStyle: "short",
                        })}
                      </td>
                      <td className="px-4 py-2 text-xs">
                        {adminMap.get(row.actorId) ?? (
                          <span className="font-mono text-slate-400">
                            {row.actorId.slice(0, 8)}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-2 font-mono text-xs">
                        <span className="rounded bg-slate-100 px-1.5 py-0.5">{row.action}</span>
                      </td>
                      <td className="px-4 py-2 text-xs">
                        <span className="text-slate-700">{row.entityType}</span>
                        <span className="ml-1 font-mono text-slate-400">
                          {row.entityId.slice(0, 8)}
                        </span>
                      </td>
                      <td className="px-4 py-2 text-xs">
                        <details className="cursor-pointer">
                          <summary className="text-slate-500 hover:text-slate-700">
                            {Object.keys(row.metadata ?? {}).length} campos
                          </summary>
                          <pre className="mt-1 max-w-md overflow-x-auto rounded bg-slate-100 p-2 text-[10px] leading-tight">
                            {JSON.stringify(row.metadata, null, 2)}
                          </pre>
                        </details>
                      </td>
                      <td className="px-4 py-2 font-mono text-xs text-slate-500">
                        {row.ip ?? "—"}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <nav className="mt-4 flex items-center justify-between" aria-label="Paginación">
            <p className="text-xs text-slate-600">
              Página {page} de {totalPages}
            </p>
            <div className="flex gap-2">
              {page > 1 && (
                <Link
                  href={`?${new URLSearchParams({ ...buildParamsObject(sp), page: String(page - 1) }).toString()}`}
                  className="inline-flex items-center gap-1 rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                >
                  <ChevronLeft className="h-3 w-3" />
                  Anterior
                </Link>
              )}
              {page < totalPages && (
                <Link
                  href={`?${new URLSearchParams({ ...buildParamsObject(sp), page: String(page + 1) }).toString()}`}
                  className="inline-flex items-center gap-1 rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                >
                  Siguiente
                  <ChevronRight className="h-3 w-3" />
                </Link>
              )}
            </div>
          </nav>
        )}
      </div>
    </div>
  );
}

function buildParamsObject(sp: Record<string, string | string[] | undefined>) {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(sp)) {
    if (typeof v === "string") out[k] = v;
  }
  return out;
}
