/*
 * Admin > Usuarios y acceso — gestión de AdminUser (SUPERADMIN / staff:manage).
 *
 * UI permite:
 *   - Visualizar postura de seguridad del equipo (cobertura MFA, custodia Superadmin,
 *     distribución por rol y actividad reciente en auditoría)
 *   - Dar de alta un miembro del equipo (identidad limpia sin contaminar clientes)
 *   - Cambiar rol operativo (con re-autenticación MFA step-up)
 *   - Activar/desactivar miembro (con revocación global inmediata de sesiones)
 *
 * Anti-lockout y bloqueo de auto-edición enforced en service layer + transacción.
 */

import type { Metadata } from "next";
import Link from "next/link";
import {
  Activity,
  ArrowUpRight,
  KeyRound,
  ShieldAlert,
  ShieldCheck,
  UserCheck,
  UserPlus,
  Users,
} from "lucide-react";
import {
  AdminBadge,
  AdminButton,
  AdminCard,
  AdminEmpty,
  AdminNotice,
  AdminPage,
  AdminPageBody,
  AdminPageHeader,
  AdminSegmentedBar,
  AdminTable,
  AdminTableBody,
  AdminTableHead,
  AdminTableRow,
  SortableHeader,
  type ChartTone,
} from "@/components/admin-page";
import { CountUp } from "@/components/admin/count-up";
import { ReauthForm } from "@/components/admin/mfa-reauth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Hint } from "@/components/ui/tooltip";
import { requireCapability } from "@/lib/admin-rbac-guard";
import {
  ADMIN_ASSIGNABLE_ROLES,
  ADMIN_ROLES_ALL,
  ADMIN_ROLE_LABEL,
  isValidAdminRole,
} from "@/lib/admin-roles";
import { listAdminUsers } from "@/features/admin-users/service";
import { formatDateCO, formatDateTimeNoYearCO } from "@/lib/datetime";
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

const ROLE_TONE: Record<
  string,
  "purple" | "blue" | "amber" | "emerald" | "slate" | "pink" | "turquoise"
> = {
  SUPERADMIN: "purple",
  OPERATIONS_MANAGER: "blue",
  CUSTOMER_SUPPORT: "turquoise",
  PRINT_WORKSHOP: "amber",
  FINANCE_ANALYST: "emerald",
  CMS_EDITOR: "pink",
  FULFILLMENT: "slate",
  MANAGER: "blue",
};

const ROLE_CHART_TONE: Record<string, ChartTone> = {
  SUPERADMIN: "purple",
  OPERATIONS_MANAGER: "blue",
  CUSTOMER_SUPPORT: "turquoise",
  PRINT_WORKSHOP: "amber",
  FINANCE_ANALYST: "emerald",
  CMS_EDITOR: "pink",
  FULFILLMENT: "slate",
  MANAGER: "coral",
};

const ROLE_LABEL = ADMIN_ROLE_LABEL;

export default async function AdminUsuariosPage({ searchParams }: { searchParams: SearchParams }) {
  const session = await requireCapability("staff:manage");
  const sp = await searchParams;

  const q = pickString(sp, "q");
  const statusRaw = pickString(sp, "status");
  const status = (STATUS_OPTIONS as readonly string[]).includes(statusRaw ?? "")
    ? (statusRaw as (typeof STATUS_OPTIONS)[number])
    : "active";
  const roleFilter = pickString(sp, "role");
  const role = roleFilter && isValidAdminRole(roleFilter) ? roleFilter : undefined;
  const sortRaw = pickString(sp, "sort");
  const sort = (["recent", "email", "role"] as const).includes(sortRaw as "recent")
    ? (sortRaw as "recent" | "email" | "role")
    : "recent";
  const page = Number(sp.page) || 1;

  const {
    items,
    total,
    totalPages,
    superadminCount,
    activeCount,
    inactiveCount,
    mfaVerifiedActiveCount,
    roleCounts,
  } = await listAdminUsers({
    q,
    status,
    role,
    sort,
    page,
  });

  const hasActiveFilters = !!q || status !== "active" || sort !== "recent" || role !== undefined;
  const mfaCoveragePct =
    activeCount > 0 ? Math.round((mfaVerifiedActiveCount / activeCount) * 100) : 100;
  const pendingMfaCount = Math.max(0, activeCount - mfaVerifiedActiveCount);
  const filterRoles =
    (roleCounts.MANAGER ?? 0) > 0 || role === "MANAGER" ? ADMIN_ROLES_ALL : ADMIN_ASSIGNABLE_ROLES;

  const roleSegments = ADMIN_ROLES_ALL.filter((r) => (roleCounts[r] ?? 0) > 0).map((r) => ({
    key: r,
    label: ROLE_LABEL[r] ?? r,
    count: roleCounts[r] ?? 0,
    tone: ROLE_CHART_TONE[r] ?? "purple",
    href: role === r ? "/admin/usuarios" : `/admin/usuarios?role=${r}`,
  }));

  return (
    <AdminPage>
      <AdminPageHeader
        icon={<UserPlus className="h-5 w-5" />}
        title="Usuarios y acceso"
        subtitle={
          <>
            {activeCount} {activeCount === 1 ? "miembro activo" : "miembros activos"} ·{" "}
            {superadminCount} superadmin{superadminCount === 1 ? "" : "s"}
            {inactiveCount > 0 &&
              ` · ${inactiveCount} desactivado${inactiveCount === 1 ? "" : "s"}`}
            {hasActiveFilters && " · vista filtrada"}
          </>
        }
        breadcrumbs={[
          { label: "Admin", href: "/admin" },
          { label: "Configuración" },
          { label: "Usuarios y acceso" },
        ]}
        actions={
          <>
            <AdminButton href="/admin/seguridad" variant="ghost" size="sm">
              <KeyRound className="h-3.5 w-3.5" />
              Mi seguridad
            </AdminButton>
            <AdminButton href="/admin/auditoria?preset=staff" variant="secondary" size="sm">
              <Activity className="h-3.5 w-3.5" />
              Auditoría de equipo
            </AdminButton>
          </>
        }
      />

      <AdminPageBody>
        {/* Mensajes de resultado de acciones */}
        {sp.promoted === "1" && (
          <AdminNotice tone="success">
            Miembro del equipo dado de alta correctamente. Ya puede definir su contraseña desde el
            enlace de invitación o en{" "}
            <Link href="/recuperar-password" className="underline" target="_blank">
              Recuperar contraseña
            </Link>{" "}
            e iniciar sesión en <span className="font-mono text-xs">/admin/login</span>.
          </AdminNotice>
        )}
        {sp.role_changed === "1" && (
          <AdminNotice tone="success">
            Rol actualizado y registrado en el rastro de auditoría.
          </AdminNotice>
        )}
        {sp.activated === "1" && (
          <AdminNotice tone="success">Cuenta administrativa reactivada.</AdminNotice>
        )}
        {sp.deactivated === "1" && (
          <AdminNotice tone="warning">
            Cuenta administrativa desactivada y sesiones activas revocadas globalmente.
          </AdminNotice>
        )}
        {typeof sp.error === "string" && <AdminNotice tone="error">{sp.error}</AdminNotice>}

        {/* Postura de seguridad e identidad del equipo */}
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <AdminCard className="p-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-brand-muted text-xs font-semibold tracking-wider uppercase">
                  Equipo activo
                </p>
                <p className="text-brand-purple-dark font-display mt-1.5 text-3xl font-bold tabular-nums">
                  <CountUp value={activeCount} />
                </p>
              </div>
              <div className="bg-brand-purple/10 text-brand-purple flex h-10 w-10 items-center justify-center rounded-xl">
                <Users className="h-5 w-5" />
              </div>
            </div>
            <div className="mt-3 flex items-center justify-between text-xs">
              <span className="text-slate-600">
                {roleSegments.length} {roleSegments.length === 1 ? "rol en uso" : "roles en uso"}
              </span>
              {inactiveCount > 0 ? (
                <Link
                  href={
                    status === "inactive" ? "/admin/usuarios" : "/admin/usuarios?status=inactive"
                  }
                  className="text-brand-purple hover:text-brand-purple-dark font-semibold hover:underline"
                >
                  {status === "inactive"
                    ? "Ver activos"
                    : `${inactiveCount} desactivado${inactiveCount === 1 ? "" : "s"} →`}
                </Link>
              ) : (
                <span className="font-medium text-emerald-700">Sin bajas pendientes</span>
              )}
            </div>
          </AdminCard>

          <AdminCard className="p-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-brand-muted text-xs font-semibold tracking-wider uppercase">
                  Cobertura 2FA (TOTP)
                </p>
                <p className="text-brand-purple-dark font-display mt-1.5 text-3xl font-bold tabular-nums">
                  {mfaVerifiedActiveCount}
                  <span className="text-lg font-medium text-slate-400">/{activeCount}</span>
                </p>
              </div>
              <div
                className={`flex h-10 w-10 items-center justify-center rounded-xl ${
                  pendingMfaCount === 0
                    ? "bg-emerald-50 text-emerald-600"
                    : "bg-amber-50 text-amber-600"
                }`}
              >
                <ShieldCheck className="h-5 w-5" />
              </div>
            </div>
            <div className="mt-2.5 h-2 overflow-hidden rounded-full bg-slate-100">
              <div
                className={`admin-bar-grow-x h-full rounded-full ${
                  pendingMfaCount === 0 ? "bg-emerald-500" : "bg-amber-500"
                }`}
                style={{ width: `${Math.max(4, mfaCoveragePct)}%` }}
              />
            </div>
            <p className="mt-2 text-xs text-slate-600">
              {pendingMfaCount === 0
                ? "100 % del equipo activo tiene segundo factor verificado."
                : `${pendingMfaCount} pendiente${pendingMfaCount === 1 ? "" : "s"} de enrolar en su primer ingreso.`}
            </p>
          </AdminCard>

          <AdminCard className="p-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-brand-muted text-xs font-semibold tracking-wider uppercase">
                  Custodia Superadmin
                </p>
                <p className="text-brand-purple-dark font-display mt-1.5 text-3xl font-bold tabular-nums">
                  <CountUp value={superadminCount} />
                </p>
              </div>
              <div
                className={`flex h-10 w-10 items-center justify-center rounded-xl ${
                  superadminCount >= 2
                    ? "bg-emerald-50 text-emerald-600"
                    : "bg-amber-50 text-amber-600"
                }`}
              >
                {superadminCount >= 2 ? (
                  <UserCheck className="h-5 w-5" />
                ) : (
                  <ShieldAlert className="h-5 w-5" />
                )}
              </div>
            </div>
            <p className="mt-3 text-xs text-slate-600">
              {superadminCount >= 2
                ? "Redundancia saludable y protección anti-lockout activa."
                : "Único Superadmin activo (protegido contra baja). Guarda tus códigos de respaldo MFA en un lugar seguro."}
            </p>
          </AdminCard>
        </div>

        {/* Barra interactiva de distribución por rol */}
        {roleSegments.length > 0 && (
          <AdminCard className="p-5">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <div>
                <h2 className="text-brand-purple-dark text-xs font-bold tracking-wider uppercase">
                  Distribución activa por rol (clic para filtrar)
                </h2>
              </div>
              {role && (
                <Link
                  href="/admin/usuarios"
                  className="text-brand-purple hover:text-brand-purple-dark text-xs font-semibold hover:underline"
                >
                  Mostrar todos los roles
                </Link>
              )}
            </div>
            <AdminSegmentedBar
              items={roleSegments}
              ariaLabel="Distribución de miembros activos por rol"
            />
          </AdminCard>
        )}

        {/* Alta limpia de staff */}
        <AdminCard className="p-5">
          <div className="mb-4 flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
            <h2 className="text-brand-purple-dark font-display flex items-center gap-2 text-base font-bold">
              <UserPlus className="text-brand-purple h-5 w-5" />
              Dar de alta miembro del equipo
            </h2>
            <span className="text-brand-muted text-xs">
              Identidad separada de clientes · MFA obligatorio en el primer ingreso
            </span>
          </div>
          <PromoteForm />
        </AdminCard>

        {/* Toolbar de búsqueda y filtrado */}
        <form
          method="GET"
          className="border-brand-purple/10 grid grid-cols-1 gap-3 rounded-xl border bg-white p-4 shadow-sm sm:grid-cols-12"
        >
          <div className="sm:col-span-5">
            <label
              htmlFor="f-q"
              className="text-brand-purple-dark/70 mb-1 block text-xs font-semibold"
            >
              Buscar por correo
            </label>
            <Input
              id="f-q"
              name="q"
              type="search"
              defaultValue={q ?? ""}
              placeholder="nombre@lucams.co…"
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
              className="border-brand-purple/20 focus:border-brand-purple focus:ring-brand-purple/20 h-9 w-full rounded-md border bg-white px-2.5 text-sm focus:ring-2 focus:outline-none"
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
              Rol operativo
            </label>
            <select
              id="f-role"
              name="role"
              defaultValue={role ?? ""}
              className="border-brand-purple/20 focus:border-brand-purple focus:ring-brand-purple/20 h-9 w-full rounded-md border bg-white px-2.5 text-sm focus:ring-2 focus:outline-none"
            >
              <option value="">Todos los roles</option>
              {filterRoles.map((r) => (
                <option key={r} value={r}>
                  {ROLE_LABEL[r] ?? r}
                </option>
              ))}
            </select>
          </div>
          <div className="flex items-end gap-2 sm:col-span-1">
            <Button
              type="submit"
              size="sm"
              className="bg-gradient-brand h-9 w-full text-white hover:brightness-110"
            >
              Filtrar
            </Button>
          </div>
          {hasActiveFilters && (
            <div className="flex items-center justify-between pt-1 sm:col-span-12">
              <span className="text-brand-muted text-xs">
                Mostrando {total} {total === 1 ? "resultado" : "resultados"} con los filtros
                actuales.
              </span>
              <Link
                href="/admin/usuarios"
                className="text-brand-purple hover:text-brand-purple-dark text-xs font-semibold hover:underline"
              >
                Limpiar filtros
              </Link>
            </div>
          )}
        </form>

        {items.length === 0 ? (
          <AdminEmpty
            icon={<ShieldCheck className="h-5 w-5" />}
            title={hasActiveFilters ? "Sin resultados para este filtro" : "No hay miembros"}
            description={
              hasActiveFilters
                ? "Prueba limpiar los filtros para ver todo el equipo."
                : "Usa el formulario superior para dar de alta al primer integrante."
            }
          />
        ) : (
          <AdminTable minWidth={880}>
            <AdminTableHead>
              <tr>
                <SortableHeader
                  label="Miembro"
                  ascValue="email"
                  currentSort={sort}
                  basePath="/admin/usuarios"
                  preserve={{ q, status: status !== "active" ? status : undefined, role }}
                />
                <SortableHeader
                  label="Rol"
                  ascValue="role"
                  currentSort={sort}
                  basePath="/admin/usuarios"
                  preserve={{ q, status: status !== "active" ? status : undefined, role }}
                />
                <th className="px-4 py-3 text-left font-semibold">Seguridad 2FA</th>
                <SortableHeader
                  label="Estado y alta"
                  ascValue="recent"
                  currentSort={sort}
                  basePath="/admin/usuarios"
                  preserve={{ q, status: status !== "active" ? status : undefined, role }}
                />
                <th className="px-4 py-3 text-left font-semibold">Actividad y auditoría</th>
                <th className="px-4 py-3 text-right font-semibold">Acciones</th>
              </tr>
            </AdminTableHead>
            <AdminTableBody>
              {items.map((a) => {
                const isSelf = a.id === session.admin.id;
                const roleOptions = a.role === "MANAGER" ? ADMIN_ROLES_ALL : ADMIN_ASSIGNABLE_ROLES;
                const lowRecovery = a.hasVerifiedMfa === true && a.unusedRecoveryCodesCount <= 2;

                return (
                  <AdminTableRow key={a.id}>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2.5">
                        <div className="from-brand-purple/15 to-brand-pink/15 text-brand-purple-dark flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-gradient-to-br text-xs font-bold uppercase">
                          {a.email[0] ?? "A"}
                        </div>
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <span className="text-brand-purple-dark truncate text-xs font-semibold">
                              {a.email}
                            </span>
                            {isSelf && (
                              <span className="bg-brand-purple/10 text-brand-purple-dark rounded-full px-2 py-0.5 text-[10px] font-bold">
                                Tú
                              </span>
                            )}
                            {a.role === "MANAGER" && (
                              <span className="rounded bg-amber-50 px-1.5 py-0.5 text-[10px] font-medium text-amber-800">
                                alias legado
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    </td>

                    <td className="px-4 py-3">
                      <AdminBadge tone={ROLE_TONE[a.role] ?? "slate"}>
                        {ROLE_LABEL[a.role] ?? a.role}
                      </AdminBadge>
                    </td>

                    <td className="px-4 py-3">
                      <div className="flex flex-col items-start gap-1">
                        {a.hasVerifiedMfa === true ? (
                          <AdminBadge tone="emerald">TOTP activo</AdminBadge>
                        ) : a.hasVerifiedMfa === false ? (
                          <AdminBadge tone="amber">Pendiente enrolar</AdminBadge>
                        ) : (
                          <AdminBadge tone="slate">Sin datos</AdminBadge>
                        )}
                        <span
                          className={`text-[11px] tabular-nums ${
                            lowRecovery ? "font-semibold text-amber-700" : "text-slate-500"
                          }`}
                        >
                          {a.unusedRecoveryCodesCount}/10 códigos de respaldo
                        </span>
                      </div>
                    </td>

                    <td className="px-4 py-3">
                      <div className="flex flex-col items-start gap-1">
                        {a.isActive ? (
                          <AdminBadge tone="emerald">Activo</AdminBadge>
                        ) : (
                          <AdminBadge tone="slate">Desactivado</AdminBadge>
                        )}
                        <span className="text-[11px] text-slate-500">
                          Alta {formatDateCO(a.createdAt)}
                        </span>
                      </div>
                    </td>

                    <td className="px-4 py-3 text-xs">
                      <div className="flex flex-col items-start gap-1">
                        {a.totalActions > 0 && a.lastAuditAt ? (
                          <span className="text-brand-purple-dark font-medium tabular-nums">
                            {a.totalActions.toLocaleString("es-CO")}{" "}
                            {a.totalActions === 1 ? "acción" : "acciones"} ·{" "}
                            <span className="font-normal text-slate-500">
                              {formatDateTimeNoYearCO(a.lastAuditAt)}
                            </span>
                          </span>
                        ) : (
                          <span className="text-slate-400">Sin acciones registradas</span>
                        )}
                        <div className="flex flex-wrap items-center gap-2.5">
                          <Link
                            href={`/admin/auditoria?admin=${encodeURIComponent(a.id)}`}
                            className="text-brand-purple hover:text-brand-purple-dark inline-flex items-center gap-0.5 text-[11px] font-semibold hover:underline"
                          >
                            Ver rastro
                            <ArrowUpRight className="h-3 w-3" />
                          </Link>
                          {isSelf && (
                            <Link
                              href="/admin/seguridad"
                              className="hover:text-brand-purple-dark inline-flex items-center gap-0.5 text-[11px] font-medium text-slate-600 hover:underline"
                            >
                              Mi seguridad
                              <ArrowUpRight className="h-3 w-3" />
                            </Link>
                          )}
                        </div>
                      </div>
                    </td>

                    <td className="px-4 py-3">
                      {isSelf ? (
                        <div className="text-right text-[11px] text-slate-400">
                          Protegido (tu cuenta)
                        </div>
                      ) : (
                        <div className="flex flex-wrap items-center justify-end gap-2">
                          <ReauthForm
                            action={changeAdminRoleAction}
                            className="flex items-center gap-1.5"
                          >
                            <input type="hidden" name="id" value={a.id} />
                            <select
                              name="role"
                              aria-label={`Rol de ${a.email}`}
                              defaultValue={a.role}
                              className="border-brand-purple/25 focus:border-brand-purple focus:ring-brand-purple/20 rounded-md border bg-white px-2 py-1 text-[11px] focus:ring-1 focus:outline-none"
                            >
                              {roleOptions.map((r) => (
                                <option key={r} value={r}>
                                  {ROLE_LABEL[r] ?? r}
                                </option>
                              ))}
                            </select>
                            <Hint content="Confirmar cambio de rol (exige MFA reciente)">
                              <button
                                type="submit"
                                className="border-brand-purple/20 text-brand-purple-dark hover:bg-brand-purple/5 rounded-md border px-2 py-1 text-[11px] font-semibold transition-colors"
                              >
                                Guardar
                              </button>
                            </Hint>
                          </ReauthForm>

                          <ReauthForm
                            action={toggleAdminActiveAction}
                            confirmMessage={
                              a.isActive
                                ? `¿Desactivar a ${a.email}? Se cerrarán todas sus sesiones activas de inmediato y no podrá ingresar al panel hasta que se reactive.`
                                : `¿Reactivar el acceso administrativo de ${a.email}?`
                            }
                          >
                            <input type="hidden" name="id" value={a.id} />
                            <button
                              type="submit"
                              className={
                                a.isActive
                                  ? "rounded-md px-2 py-1 text-[11px] font-semibold text-rose-600 transition-colors hover:bg-rose-50 hover:text-rose-800"
                                  : "rounded-md px-2 py-1 text-[11px] font-semibold text-emerald-700 transition-colors hover:bg-emerald-50 hover:text-emerald-900"
                              }
                            >
                              {a.isActive ? "Desactivar" : "Reactivar"}
                            </button>
                          </ReauthForm>
                        </div>
                      )}
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
              {total} {total === 1 ? "miembro" : "miembros"} · página {page} de {totalPages}
            </span>
            <div className="flex gap-1.5">
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
