/*
 * Admin > Usuarios y acceso — gestión de AdminUser.
 *
 * Solo SUPERADMIN puede ver y operar acá. Otros roles ven mensaje de
 * permiso insuficiente. UI permite:
 *   - Listar admins existentes (con filtro estado + rol + búsqueda)
 *   - Promover un cliente existente a admin (selección de rol)
 *   - Cambiar rol de admin existente (inline select)
 *   - Activar/desactivar admin (con confirmación)
 *
 * Anti-lockout enforced en service layer.
 */

import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Lock, ShieldCheck, UserPlus } from "lucide-react";
import {
  AdminBadge,
  AdminCard,
  AdminEmpty,
  AdminNotice,
  AdminPage,
  AdminPageBody,
  AdminPageHeader,
  AdminTable,
  AdminTableBody,
  AdminTableHead,
  AdminTableRow,
} from "@/components/admin-page";
import { ConfirmAction } from "@/components/admin/confirm-action";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { getCurrentAdmin } from "@/lib/auth";
import { ADMIN_ROLE_LABEL } from "@/lib/admin-roles";
import { listAdminUsers } from "@/features/admin-users/service";
import { changeAdminRoleAction, toggleAdminActiveAction } from "./actions";
import { PromoteForm } from "./promote-form";

export const metadata: Metadata = {
  title: "Usuarios y acceso",
  robots: { index: false, follow: false },
};

type SearchParams = Promise<{ [key: string]: string | string[] | undefined }>;

function pickString(sp: Record<string, string | string[] | undefined>, key: string) {
  const v = sp[key];
  return typeof v === "string" ? v : undefined;
}

const STATUS_OPTIONS = ["active", "inactive", "all"] as const;
const STATUS_LABEL: Record<(typeof STATUS_OPTIONS)[number], string> = {
  active: "Activos",
  inactive: "Desactivados",
  all: "Todos",
};

const ROLE_TONE: Record<string, "purple" | "blue" | "amber"> = {
  SUPERADMIN: "purple",
  MANAGER: "blue",
  FULFILLMENT: "amber",
};
// Diccionario único compartido (lib/admin-roles) — consistente con el sidebar.
const ROLE_LABEL = ADMIN_ROLE_LABEL;

export default async function AdminUsuariosPage({ searchParams }: { searchParams: SearchParams }) {
  const session = await getCurrentAdmin();
  if (!session) redirect("/admin/login");

  const sp = await searchParams;
  const isSuperadmin = session.admin.role === "SUPERADMIN";

  // Gate visual: los no-SUPERADMIN ven un mensaje, no la lista.
  if (!isSuperadmin) {
    return (
      <AdminPage>
        <AdminPageHeader
          icon={<ShieldCheck className="h-5 w-5" />}
          title="Usuarios y acceso"
          subtitle="Permiso insuficiente"
          breadcrumbs={[
            { label: "Admin", href: "/admin/dashboard" },
            { label: "Configuración" },
            { label: "Usuarios y acceso" },
          ]}
        />
        <AdminPageBody>
          <AdminCard className="p-6">
            <div className="flex items-start gap-4">
              <div className="bg-brand-purple/10 text-brand-purple-dark flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-full">
                <Lock className="h-6 w-6" />
              </div>
              <div>
                <h2 className="text-brand-purple-dark font-display text-lg font-bold">
                  Solo SUPERADMIN puede gestionar usuarios
                </h2>
                <p className="text-brand-purple-dark/75 mt-1 text-sm">
                  Tu rol actual es <strong>{ROLE_LABEL[session.admin.role]}</strong>. Pídele a un
                  SUPERADMIN del equipo que te promueva si necesitas acceso a este módulo.
                </p>
                <Link
                  href="/admin/dashboard"
                  className="text-brand-purple-dark hover:text-brand-purple mt-3 inline-block text-sm font-semibold"
                >
                  ← Volver al dashboard
                </Link>
              </div>
            </div>
          </AdminCard>
        </AdminPageBody>
      </AdminPage>
    );
  }

  const q = pickString(sp, "q");
  const statusRaw = pickString(sp, "status");
  const status = (STATUS_OPTIONS as readonly string[]).includes(statusRaw ?? "")
    ? (statusRaw as (typeof STATUS_OPTIONS)[number])
    : "active";
  const roleFilter = pickString(sp, "role");
  const role =
    roleFilter && ["SUPERADMIN", "MANAGER", "FULFILLMENT"].includes(roleFilter)
      ? (roleFilter as "SUPERADMIN" | "MANAGER" | "FULFILLMENT")
      : undefined;
  const sortRaw = pickString(sp, "sort");
  const sort = (["recent", "email", "role"] as const).includes(sortRaw as "recent")
    ? (sortRaw as "recent" | "email" | "role")
    : "recent";
  const page = Number(sp.page) || 1;

  const { items, total, totalPages, superadminCount } = await listAdminUsers({
    q,
    status,
    role,
    sort,
    page,
  });
  const hasActiveFilters = !!q || status !== "active" || sort !== "recent" || role !== undefined;

  const dateFmt = new Intl.DateTimeFormat("es-CO", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });

  return (
    <AdminPage>
      <AdminPageHeader
        icon={<ShieldCheck className="h-5 w-5" />}
        title="Usuarios y acceso"
        subtitle={
          <>
            {total} {total === 1 ? "admin" : "admins"} · {superadminCount} superadmin
            {superadminCount === 1 ? "" : "s"} activo{superadminCount === 1 ? "" : "s"}
            {hasActiveFilters && " · con filtros aplicados"}
          </>
        }
        breadcrumbs={[
          { label: "Admin", href: "/admin/dashboard" },
          { label: "Configuración" },
          { label: "Usuarios y acceso" },
        ]}
      />

      <AdminPageBody>
        <AdminNotice tone="info">
          <strong>¿Cómo funciona?</strong> Para sumar un admin nuevo: la persona se registra primero
          como cliente en{" "}
          <Link href="/signup" className="underline" target="_blank">
            /signup
          </Link>{" "}
          y luego usa el form de abajo para promoverla. Roles: <strong>Superadmin</strong> (control
          total), <strong>Manager</strong> (operación + contenido), <strong>Fulfillment</strong>{" "}
          (solo pedidos + envíos).
        </AdminNotice>

        {sp.promoted === "1" && (
          <AdminNotice tone="success">Admin promovido correctamente.</AdminNotice>
        )}
        {sp.role_changed === "1" && <AdminNotice tone="success">Rol actualizado.</AdminNotice>}
        {sp.activated === "1" && <AdminNotice tone="success">Admin reactivado.</AdminNotice>}
        {sp.deactivated === "1" && <AdminNotice tone="warning">Admin desactivado.</AdminNotice>}
        {typeof sp.error === "string" && <AdminNotice tone="error">{sp.error}</AdminNotice>}

        {/* Form promover */}
        <AdminCard className="p-5">
          <h2 className="text-brand-purple-dark font-display mb-4 flex items-center gap-2 text-base font-bold">
            <UserPlus className="h-5 w-5" />
            Promover cliente a admin
          </h2>
          <PromoteForm />
        </AdminCard>

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
              placeholder="Email del admin…"
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
              {STATUS_OPTIONS.map((s) => (
                <option key={s} value={s}>
                  {STATUS_LABEL[s]}
                </option>
              ))}
            </select>
          </div>
          <div className="sm:col-span-3">
            <label
              htmlFor="f-role"
              className="text-brand-purple-dark/70 mb-1 block text-xs font-semibold"
            >
              Rol
            </label>
            <select
              id="f-role"
              name="role"
              defaultValue={role ?? ""}
              className="border-brand-purple/20 focus:border-brand-purple focus:ring-brand-purple/20 w-full rounded-md border bg-white px-2 py-1.5 text-sm focus:ring-2 focus:outline-none"
            >
              <option value="">Todos</option>
              <option value="SUPERADMIN">Superadmin</option>
              <option value="MANAGER">Manager</option>
              <option value="FULFILLMENT">Fulfillment</option>
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
                href="/admin/usuarios"
                className="text-brand-muted hover:text-brand-purple-dark text-xs font-semibold"
              >
                Limpiar filtros
              </Link>
            </div>
          )}
        </form>

        {items.length === 0 ? (
          <AdminEmpty
            icon={<ShieldCheck className="h-5 w-5" />}
            title={hasActiveFilters ? "Sin resultados" : "No hay admins"}
            description={
              hasActiveFilters
                ? "Prueba quitar algún filtro."
                : "Usa el form de arriba para promover el primer admin."
            }
          />
        ) : (
          <AdminTable>
            <AdminTableHead>
              <tr>
                <th className="px-4 py-3 text-left font-semibold">Email</th>
                <th className="px-4 py-3 text-left font-semibold">Rol</th>
                <th className="px-4 py-3 text-left font-semibold">Estado</th>
                <th className="px-4 py-3 text-left font-semibold">Alta</th>
                <th className="px-4 py-3 text-right font-semibold">Acciones</th>
              </tr>
            </AdminTableHead>
            <AdminTableBody>
              {items.map((a) => {
                const isSelf = a.id === session.admin.id;
                return (
                  <AdminTableRow key={a.id}>
                    <td className="text-brand-purple-dark px-4 py-3 text-xs font-medium">
                      {a.email}
                      {isSelf && (
                        <span className="text-brand-muted ml-2 text-[10px]">(tú)</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <AdminBadge tone={ROLE_TONE[a.role] ?? "slate"}>
                        {ROLE_LABEL[a.role] ?? a.role}
                      </AdminBadge>
                    </td>
                    <td className="px-4 py-3">
                      {a.isActive ? (
                        <AdminBadge tone="emerald">Activo</AdminBadge>
                      ) : (
                        <AdminBadge tone="slate">Desactivado</AdminBadge>
                      )}
                    </td>
                    <td className="text-brand-muted px-4 py-3 text-xs">
                      {dateFmt.format(a.createdAt)}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap items-center justify-end gap-2">
                        {!isSelf && (
                          <form action={changeAdminRoleAction} className="flex items-center gap-1">
                            <input type="hidden" name="id" value={a.id} />
                            <select
                              name="role"
                              defaultValue={a.role}
                              className="border-brand-purple/25 focus:border-brand-purple focus:ring-brand-purple/20 rounded-md border bg-white px-2 py-1 text-[11px] focus:ring-1 focus:outline-none"
                            >
                              <option value="SUPERADMIN">Superadmin</option>
                              <option value="MANAGER">Manager</option>
                              <option value="FULFILLMENT">Fulfillment</option>
                            </select>
                            <button
                              type="submit"
                              className="text-brand-purple-dark hover:text-brand-purple text-[11px] font-semibold"
                              title="Cambiar rol"
                            >
                              Guardar
                            </button>
                          </form>
                        )}
                        {!isSelf && (
                          <ConfirmAction
                            action={toggleAdminActiveAction}
                            message={
                              a.isActive
                                ? `¿Desactivar ${a.email}? No podrá acceder al panel hasta que se reactive.`
                                : `¿Reactivar ${a.email}?`
                            }
                          >
                            <input type="hidden" name="id" value={a.id} />
                            <button
                              type="submit"
                              className={
                                a.isActive
                                  ? "text-[11px] font-medium text-rose-600 hover:text-rose-800"
                                  : "text-[11px] font-medium text-emerald-700 hover:text-emerald-900"
                              }
                            >
                              {a.isActive ? "Desactivar" : "Reactivar"}
                            </button>
                          </ConfirmAction>
                        )}
                      </div>
                    </td>
                  </AdminTableRow>
                );
              })}
            </AdminTableBody>
          </AdminTable>
        )}

        {totalPages > 1 && (
          <div className="text-brand-purple-dark/70 flex items-center justify-between text-sm">
            <span>
              {total} admins · página {page} de {totalPages}
            </span>
            <div className="flex gap-1">
              {page > 1 && (
                <PaginationLink page={page - 1} q={q} status={status} sort={sort} role={role}>
                  ← Anterior
                </PaginationLink>
              )}
              {page < totalPages && (
                <PaginationLink page={page + 1} q={q} status={status} sort={sort} role={role}>
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
  role,
  children,
}: {
  page: number;
  q?: string;
  status?: string;
  sort?: string;
  role?: string;
  children: React.ReactNode;
}) {
  const params = new URLSearchParams();
  params.set("page", String(page));
  if (q) params.set("q", q);
  if (status && status !== "active") params.set("status", status);
  if (sort && sort !== "recent") params.set("sort", sort);
  if (role) params.set("role", role);
  return (
    <Link
      href={`/admin/usuarios?${params.toString()}`}
      className="border-brand-purple/20 hover:bg-brand-purple/5 text-brand-purple-dark rounded-md border bg-white px-3 py-1.5 text-xs font-medium"
    >
      {children}
    </Link>
  );
}
