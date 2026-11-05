/*
 * /admin/auditoria — Tabla paginada del AdminActionLog.
 *
 * Filtros opcionales (query params):
 *   - admin: id de AdminUser
 *   - action: prefijo (ej. "product." matchea product.create,
 *     product.update, product.archive, etc.)
 *   - entity: entityType exacto (ej. "Product", "Order")
 *   - from / to: ISO date YYYY-MM-DD
 *   - page: número (paginación 30/page)
 *
 * Cada fila expande mostrando metadata sanitizada (JSON pretty).
 */

import type { Metadata } from "next";
import Link from "next/link";
import { Activity, ChevronLeft, ChevronRight, ShieldAlert } from "lucide-react";
import type { Prisma } from "@lucams/db";
import { prisma } from "@/lib/db";
import { ADMIN_ROLE_SETS } from "@/lib/admin-rbac";
import { requireRole } from "@/lib/admin-rbac-guard";
import { formatDateTimeCO } from "@/lib/datetime";
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

type AuditPresetKey = "all" | "pii" | "finance" | "staff" | "crm";

const AUDIT_PRESETS: ReadonlyArray<{
  key: AuditPresetKey;
  label: string;
  description: string;
  prefixes: readonly string[];
}> = [
  {
    key: "all",
    label: "Todos",
    description: "Todas las acciones administrativas registradas.",
    prefixes: [],
  },
  {
    key: "pii",
    label: "Accesos y exportaciones PII",
    description:
      "Vistas de Contacto 360, impresión de guías, descargas ZIP de taller y exportaciones CSV.",
    prefixes: [
      "contact.view_360",
      "order.print_shipping_guide",
      "order.design_zip_download",
      "newsletter.export_csv",
      "marketing.export_segment_csv",
      "finance.export_orders_csv",
    ],
  },
  {
    key: "finance",
    label: "Reembolsos y finanzas",
    description: "Reembolsos de pedidos, retractos, garantías, conciliación COD y costos.",
    prefixes: ["order.refund", "retract.", "warranty.", "finance.", "cod.", "cost."],
  },
  {
    key: "staff",
    label: "Usuarios y roles",
    description: "Altas de equipo, cambios de rol, desactivaciones y seguridad MFA.",
    prefixes: ["admin.", "security."],
  },
  {
    key: "crm",
    label: "Fusiones CRM",
    description: "Fusiones aprobadas o descartadas en la cola de duplicados de Contact.",
    prefixes: ["contact.merge"],
  },
];

function isAuditPresetKey(value: string | undefined): value is AuditPresetKey {
  return AUDIT_PRESETS.some((p) => p.key === value);
}

type SearchParams = Promise<{ [key: string]: string | string[] | undefined }>;

function pickString(sp: Record<string, string | string[] | undefined>, key: string) {
  const v = sp[key];
  return typeof v === "string" ? v : undefined;
}

export default async function AuditoriaPage({ searchParams }: { searchParams: SearchParams }) {
  const _session = await requireRole(ADMIN_ROLE_SETS.SUPER);

  const sp = await searchParams;
  const presetRaw = pickString(sp, "preset");
  const preset: AuditPresetKey = isAuditPresetKey(presetRaw) ? presetRaw : "all";
  const activePreset = AUDIT_PRESETS.find((p) => p.key === preset) ?? AUDIT_PRESETS[0]!;
  const filterAdmin = pickString(sp, "admin");
  const filterAction = pickString(sp, "action");
  const filterEntity = pickString(sp, "entity");
  const fromDate = pickString(sp, "from");
  const toDate = pickString(sp, "to");
  const page = Math.max(1, Number.parseInt(pickString(sp, "page") ?? "1", 10) || 1);

  const andConditions: Prisma.AdminActionLogWhereInput[] = [];
  if (activePreset.prefixes.length > 0) {
    andConditions.push({
      OR: activePreset.prefixes.map((prefix) => ({
        action: { startsWith: prefix },
      })),
    });
  }
  if (filterAction) {
    andConditions.push({ action: { startsWith: filterAction } });
  }

  const where: Prisma.AdminActionLogWhereInput = {
    ...(filterAdmin ? { actorId: filterAdmin } : {}),
    ...(filterEntity ? { entityType: filterEntity } : {}),
    ...(andConditions.length > 0 ? { AND: andConditions } : {}),
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
        {/* Filtros rápidos por familia de seguridad */}
        <div className="border-brand-purple/10 rounded-xl border bg-white p-4 shadow-sm">
          <div className="mb-2 flex items-center gap-2">
            <ShieldAlert className="text-brand-purple h-4 w-4" />
            <span className="text-brand-purple-dark text-xs font-bold tracking-wide uppercase">
              Vistas rápidas de cumplimiento y seguridad
            </span>
          </div>
          <div className="flex flex-wrap gap-2" role="navigation" aria-label="Filtros rápidos">
            {AUDIT_PRESETS.map((item) => {
              const isSelected = item.key === preset;
              const nextParams = new URLSearchParams(buildParamsObject(sp));
              nextParams.delete("page");
              if (item.key === "all") {
                nextParams.delete("preset");
              } else {
                nextParams.set("preset", item.key);
              }
              const href = nextParams.toString()
                ? `/admin/auditoria?${nextParams.toString()}`
                : "/admin/auditoria";
              return (
                <Link
                  key={item.key}
                  href={href}
                  aria-current={isSelected ? "page" : undefined}
                  className={
                    isSelected
                      ? "bg-brand-purple inline-flex min-h-9 items-center rounded-full px-3.5 py-1.5 text-xs font-semibold text-white shadow-xs transition-colors"
                      : "border-brand-purple/20 text-brand-purple-dark hover:border-brand-purple/50 hover:bg-brand-purple/5 inline-flex min-h-9 items-center rounded-full border bg-white px-3.5 py-1.5 text-xs font-semibold transition-colors"
                  }
                >
                  {item.label}
                </Link>
              );
            })}
          </div>
          <p className="text-brand-muted mt-2 text-xs">{activePreset.description}</p>
        </div>

        {/* Filtros */}
        <form
          method="GET"
          className="border-brand-purple/10 grid grid-cols-1 gap-3 rounded-xl border bg-white p-4 shadow-sm sm:grid-cols-2 lg:grid-cols-5"
        >
          {preset !== "all" && <input type="hidden" name="preset" value={preset} />}
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
              Acción (prefijo)
            </label>
            <input
              id="f-action"
              name="action"
              defaultValue={filterAction ?? ""}
              placeholder="ej. product.update"
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
              placeholder="ej. Order"
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
              className="text-brand-muted hover:text-brand-purple-dark text-xs font-semibold"
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
                  <td colSpan={6} className="text-brand-muted px-4 py-10 text-center">
                    Sin eventos con los filtros aplicados.
                  </td>
                </tr>
              ) : (
                logs.map((row) => (
                  <AdminTableRow key={row.id}>
                    <td className="text-brand-purple-dark/75 px-4 py-2 text-xs">
                      {formatDateTimeCO(row.createdAt)}
                    </td>
                    <td className="text-brand-purple-dark px-4 py-2 text-xs">
                      {adminMap.get(row.actorId) ?? (
                        <span className="text-brand-muted font-mono">
                          {row.actorId.slice(0, 8)}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-2 font-mono text-xs">
                      <span className="bg-brand-purple/10 text-brand-purple-dark rounded px-1.5 py-0.5">
                        {row.action}
                      </span>
                      {(row.metadata as Record<string, unknown> | null)?.selfDealing === true && (
                        <span className="ml-1 rounded border border-amber-300 bg-amber-50 px-1.5 py-0.5 font-sans text-[10px] font-bold text-amber-800">
                          auto-gestión staff
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-2 text-xs">
                      <span className="text-brand-purple-dark/85">{row.entityType}</span>
                      <span className="text-brand-muted ml-1 font-mono">
                        {row.entityId.slice(0, 8)}
                      </span>
                    </td>
                    <td className="px-4 py-2 text-xs">
                      <details className="cursor-pointer">
                        <summary className="text-brand-muted hover:text-brand-purple-dark">
                          {Object.keys(row.metadata ?? {}).length} campos
                        </summary>
                        <pre className="bg-brand-purple/5 mt-1 max-w-md overflow-x-auto rounded p-2 text-[10px] leading-tight">
                          {JSON.stringify(row.metadata, null, 2)}
                        </pre>
                      </details>
                    </td>
                    <td className="text-brand-muted px-4 py-2 font-mono text-xs">
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
