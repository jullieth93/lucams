/*
 * Admin > Seguridad — verificación en 2 pasos (MFA/TOTP).
 * Lucy 2026-06-27 (Bloque C / A6).
 * Auditoría 2026-08-24 · B-1: el MFA es OBLIGATORIO para todo rol admin, así que
 * esta pantalla (enrolamiento + autoservicio de la propia cuenta) es la única
 * ruta del panel abierta a TODOS los roles (ADMIN_ROLE_SETS.ALL_PLUS_CMS). El
 * guard redirige acá (?enroll=required) a cualquier admin sin factor verificado.
 */

import type { Metadata } from "next";
import Link from "next/link";
import {
  Clock,
  FileSearch,
  KeyRound,
  LockKeyhole,
  RefreshCw,
  ShieldAlert,
  ShieldCheck,
  Smartphone,
} from "lucide-react";
import {
  AdminBadge,
  AdminCard,
  AdminNotice,
  AdminPage,
  AdminPageBody,
  AdminPageHeader,
} from "@/components/admin-page";
import { requireAdminAction } from "@/lib/admin-rbac-guard";
import { ADMIN_ROLE_SETS, hasCapability } from "@/lib/admin-rbac";
import { adminRoleLabel } from "@/lib/admin-roles";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { countUnusedRecoveryCodes } from "@/features/admin-mfa/recovery-codes";
import { ReauthForm } from "@/components/admin/mfa-reauth";
import { MfaEnroll } from "./mfa-enroll";
import { AdminChangePasswordForm, RecoveryCodesPanel } from "./recovery-codes-panel";
import { changeMfaDeviceAction } from "./actions";

export const metadata: Metadata = { title: "Seguridad" };

type SearchParams = Promise<{ [key: string]: string | string[] | undefined }>;

export default async function AdminSeguridadPage({ searchParams }: { searchParams: SearchParams }) {
  const session = await requireAdminAction({
    roles: ADMIN_ROLE_SETS.ALL_PLUS_CMS,
    allowMfaEnrollment: true,
  });
  const sp = await searchParams;

  const supabase = await createSupabaseServerClient();
  const { data: factorsData } = await supabase.auth.mfa.listFactors();
  const verifiedTotp = (factorsData?.all ?? []).find(
    (f) => f.factor_type === "totp" && f.status === "verified",
  );
  const isEnabled = !!verifiedTotp;
  const unusedCodes = isEnabled ? await countUnusedRecoveryCodes(session.admin.id) : 0;
  const canReadAudit = hasCapability(session.admin.role, "audit:read");

  return (
    <AdminPage>
      <AdminPageHeader
        icon={<ShieldCheck className="h-5 w-5" />}
        title="Seguridad de tu cuenta"
        subtitle={`Protección de identidad, segundo factor obligatorio y credenciales para ${session.admin.email}.`}
        breadcrumbs={[{ label: "Admin", href: "/admin" }, { label: "Seguridad" }]}
        actions={
          isEnabled && canReadAudit ? (
            <Link
              href={`/admin/auditoria?admin=${encodeURIComponent(session.admin.id)}`}
              className="border-brand-purple/20 text-brand-purple-dark hover:bg-brand-purple/5 inline-flex items-center gap-1.5 rounded-lg border bg-white px-3 py-1.5 text-xs font-semibold shadow-2xs transition-colors"
            >
              <FileSearch className="h-3.5 w-3.5" />
              Ver mi actividad en Auditoría
            </Link>
          ) : undefined
        }
      />

      <AdminPageBody>
        {/* Resumen visual de postura de seguridad */}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div className="border-brand-purple/12 flex items-start gap-3 rounded-xl border bg-white p-4 shadow-2xs">
            <div
              className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${
                isEnabled
                  ? "bg-emerald-50 text-emerald-600 ring-1 ring-emerald-200/70"
                  : "bg-amber-50 text-amber-600 ring-1 ring-amber-200/70"
              }`}
            >
              {isEnabled ? (
                <ShieldCheck className="h-5 w-5" />
              ) : (
                <ShieldAlert className="h-5 w-5" />
              )}
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <p className="text-brand-purple-dark text-xs font-bold">Segundo factor (TOTP)</p>
                <AdminBadge tone={isEnabled ? "emerald" : "amber"}>
                  {isEnabled ? "Activo · AAL2" : "Pendiente"}
                </AdminBadge>
              </div>
              <p className="text-brand-muted mt-1 text-xs leading-snug">
                {isEnabled
                  ? "Obligatorio en cada inicio de sesión y en acciones sensibles."
                  : "Actívalo abajo para desbloquear los módulos de tu rol."}
              </p>
            </div>
          </div>

          <div className="border-brand-purple/12 flex items-start gap-3 rounded-xl border bg-white p-4 shadow-2xs">
            <div
              className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${
                !isEnabled
                  ? "bg-slate-100 text-slate-500"
                  : unusedCodes >= 4
                    ? "bg-brand-turquoise/15 text-teal-700 ring-1 ring-teal-200/70"
                    : "bg-rose-50 text-rose-600 ring-1 ring-rose-200/70"
              }`}
            >
              <KeyRound className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <p className="text-brand-purple-dark text-xs font-bold">Respaldo de emergencia</p>
                <AdminBadge tone={!isEnabled ? "slate" : unusedCodes >= 4 ? "turquoise" : "rose"}>
                  {isEnabled ? `${unusedCodes} / 10` : "Tras enrolar"}
                </AdminBadge>
              </div>
              <p className="text-brand-muted mt-1 text-xs leading-snug">
                {isEnabled
                  ? unusedCodes >= 4
                    ? "Cobertura saludable ante pérdida o cambio de celular."
                    : "Nivel bajo: regenera tus 10 códigos de emergencia hoy."
                  : "Se generarán automáticamente al vincular tu app."}
              </p>
            </div>
          </div>

          <div className="border-brand-purple/12 flex items-start gap-3 rounded-xl border bg-white p-4 shadow-2xs">
            <div className="bg-brand-purple/10 text-brand-purple ring-brand-purple/15 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ring-1">
              <Clock className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <p className="text-brand-purple-dark text-xs font-bold">Blindaje de sesión</p>
                <AdminBadge tone="purple">{adminRoleLabel(session.admin.role)}</AdminBadge>
              </div>
              <p className="text-brand-muted mt-1 text-xs leading-snug">
                Cierre automático tras 30 min de inactividad y confirmación MFA cada 10 min.
              </p>
            </div>
          </div>
        </div>

        {isEnabled ? (
          <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-12">
            {/* Columna izquierda: 2FA obligatorio + Códigos + Rotación de dispositivo */}
            <AdminCard className="space-y-6 p-5 lg:col-span-7">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-2.5">
                  <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600">
                    <Smartphone className="h-5 w-5" />
                  </div>
                  <div>
                    <h2 className="text-brand-purple-dark font-display text-base font-bold">
                      Autenticador en 2 pasos (TOTP)
                    </h2>
                    <p className="text-brand-muted text-xs">
                      Política permanente del panel: la verificación en 2 pasos no se puede apagar.
                    </p>
                  </div>
                </div>
                <AdminBadge tone="emerald">Protegido</AdminBadge>
              </div>

              <AdminNotice tone="success">
                Tu cuenta exige contraseña + código temporal de 6 dígitos en cada ingreso. Si algún
                día pierdes tu celular, usa uno de tus códigos de respaldo para entrar y vincular el
                nuevo equipo.
              </AdminNotice>

              {/* Códigos de respaldo */}
              <div className="border-brand-purple/10 border-t pt-5">
                <RecoveryCodesPanel unusedCount={unusedCodes} />
              </div>

              {/* Rotar autenticador / cambiar dispositivo */}
              <div className="border-brand-purple/10 border-t pt-5">
                <div className="mb-2 flex items-center gap-2">
                  <RefreshCw className="text-brand-purple h-4 w-4" />
                  <h3 className="text-brand-purple-dark text-sm font-bold">
                    Cambiar de celular o app autenticadora
                  </h3>
                </div>
                <p className="text-brand-purple-dark/75 mb-3 text-xs leading-relaxed">
                  ¿Estrenaste teléfono o cambiaste de app (Google Authenticator, Authy, 1Password)?
                  Al continuar te pediremos tu código actual de 6 dígitos, desvincularemos el equipo
                  anterior y verás un código QR nuevo de inmediato.
                </p>
                <ReauthForm
                  action={changeMfaDeviceAction}
                  confirmMessage="¿Cambiar de dispositivo autenticador? Se desvinculará tu app actual y deberás escanear un código QR nuevo enseguida."
                >
                  <button
                    type="submit"
                    className="border-brand-purple/25 text-brand-purple-dark hover:bg-brand-purple/5 inline-flex items-center gap-1.5 rounded-lg border bg-white px-4 py-2 text-xs font-semibold shadow-2xs transition-colors"
                  >
                    <RefreshCw className="h-3.5 w-3.5" />
                    Cambiar dispositivo autenticador
                  </button>
                </ReauthForm>
              </div>
            </AdminCard>

            {/* Columna derecha: Cambio de contraseña con step-up MFA + HIBP */}
            <AdminCard className="space-y-4 p-5 lg:col-span-5">
              <div className="flex items-center gap-2.5">
                <div className="bg-brand-purple/10 text-brand-purple flex h-9 w-9 items-center justify-center rounded-xl">
                  <LockKeyhole className="h-5 w-5" />
                </div>
                <div>
                  <h2 className="text-brand-purple-dark font-display text-base font-bold">
                    Cambiar contraseña
                  </h2>
                  <p className="text-brand-muted text-xs">
                    Rotación segura sin perder tu sesión actual
                  </p>
                </div>
              </div>

              <AdminChangePasswordForm />
            </AdminCard>
          </div>
        ) : (
          <AdminCard className="p-5">
            <div className="mb-3 flex items-center gap-2">
              <ShieldAlert className="text-brand-coral h-6 w-6" />
              <h2 className="text-brand-purple-dark font-display text-lg font-bold">
                Activa la verificación en 2 pasos
              </h2>
            </div>
            <div className="space-y-4">
              {sp.enroll === "required" && (
                <AdminNotice tone="info">
                  La verificación en 2 pasos es obligatoria para usar el panel administrativo de
                  Lucams. Actívala abajo para continuar — te toma menos de un minuto.
                </AdminNotice>
              )}
              {sp.reconfig === "1" && (
                <AdminNotice tone="info">
                  Desvinculamos tu autenticador anterior. Escanea el código QR de abajo con tu nuevo
                  dispositivo para reactivar la verificación en 2 pasos.
                </AdminNotice>
              )}
              <p className="text-brand-purple-dark/75 text-sm">
                Además de tu contraseña, pediremos un código que cambia cada 30 segundos en tu
                celular. Puedes usar una app gratuita como <strong>Google Authenticator</strong>,{" "}
                <strong>Authy</strong> o <strong>1Password</strong>.
              </p>
              <MfaEnroll />
            </div>
          </AdminCard>
        )}
      </AdminPageBody>
    </AdminPage>
  );
}
