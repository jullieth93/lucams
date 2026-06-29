/*
 * Admin > Seguridad — verificación en 2 pasos (MFA/TOTP).
 * Lucy 2026-06-27 (Bloque C / A6). Decisión: MFA activa para SUPERADMIN desde día 1.
 */

import type { Metadata } from "next";
import { ShieldCheck, ShieldAlert, KeyRound } from "lucide-react";
import {
  AdminPage,
  AdminPageHeader,
  AdminPageBody,
  AdminCard,
  AdminNotice,
} from "@/components/admin-page";
import { requireRole } from "@/lib/admin-rbac-guard";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { countUnusedRecoveryCodes } from "@/features/admin-mfa/recovery-codes";
import { MfaEnroll } from "./mfa-enroll";
import { RecoveryCodesPanel } from "./recovery-codes-panel";
import { disableMfaAction, changeMfaDeviceAction } from "./actions";

export const metadata: Metadata = { title: "Seguridad" };

type SearchParams = Promise<{ [key: string]: string | string[] | undefined }>;

export default async function AdminSeguridadPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const session = await requireRole(["SUPERADMIN"]);
  const sp = await searchParams;

  const supabase = await createSupabaseServerClient();
  const { data: factorsData } = await supabase.auth.mfa.listFactors();
  const verifiedTotp = (factorsData?.all ?? []).find(
    (f) => f.factor_type === "totp" && f.status === "verified",
  );
  const isEnabled = !!verifiedTotp;
  const unusedCodes = isEnabled ? await countUnusedRecoveryCodes(session.admin.id) : 0;

  return (
    <AdminPage>
      <AdminPageHeader
        icon={<KeyRound className="h-5 w-5" />}
        title="Seguridad de tu cuenta"
        subtitle="Verificación en 2 pasos para proteger el acceso al panel."
        breadcrumbs={[
          { label: "Admin", href: "/admin/dashboard" },
          { label: "Seguridad" },
        ]}
      />

      <AdminPageBody>
        <AdminCard className="p-5">
          <div className="mb-3 flex items-center gap-2">
            {isEnabled ? (
              <ShieldCheck className="h-6 w-6 text-emerald-600" />
            ) : (
              <ShieldAlert className="text-brand-coral h-6 w-6" />
            )}
            <h2 className="text-brand-purple-dark text-lg font-bold">
              Verificación en 2 pasos {isEnabled ? "· activada" : "· desactivada"}
            </h2>
          </div>

          {isEnabled ? (
            <div className="space-y-6">
              <AdminNotice tone="success">
                Tu cuenta está protegida: al entrar al panel te pediremos un código de tu app de
                autenticación, además de la contraseña.
              </AdminNotice>

              {/* Códigos de respaldo */}
              <div className="border-brand-purple/10 border-t pt-5">
                <RecoveryCodesPanel unusedCount={unusedCodes} />
              </div>

              {/* Cambiar dispositivo */}
              <div className="border-brand-purple/10 border-t pt-5">
                <h3 className="text-brand-purple-dark mb-1 font-semibold">
                  Cambiar de autenticador / dispositivo
                </h3>
                <p className="text-brand-purple-dark/70 mb-3 text-sm">
                  ¿Cambiaste de celular o de app? Esto desactiva el actual y te muestra un código QR
                  nuevo para volver a configurarlo.
                </p>
                <form action={changeMfaDeviceAction}>
                  <button
                    type="submit"
                    className="border-brand-purple/25 text-brand-purple-dark hover:bg-brand-purple/5 rounded-md border bg-white px-4 py-2 text-sm font-semibold"
                  >
                    Cambiar dispositivo
                  </button>
                </form>
              </div>

              {/* Desactivar */}
              <div className="border-brand-purple/10 border-t pt-5">
                <h3 className="text-brand-purple-dark mb-1 font-semibold">Desactivar</h3>
                <p className="text-brand-purple-dark/70 mb-3 text-sm">
                  Quita la verificación en 2 pasos (también borra tus códigos de respaldo). Tu cuenta
                  quedará protegida solo con la contraseña.
                </p>
                <form action={disableMfaAction}>
                  <button
                    type="submit"
                    className="rounded-md border border-rose-200 bg-white px-4 py-2 text-sm font-semibold text-rose-600 hover:bg-rose-50"
                  >
                    Desactivar verificación en 2 pasos
                  </button>
                </form>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              {sp.reconfig === "1" && (
                <AdminNotice tone="info">
                  Desactivamos tu autenticador anterior. Escanea el código QR de abajo con tu nuevo
                  dispositivo para volver a activar la verificación en 2 pasos.
                </AdminNotice>
              )}
              <p className="text-brand-purple-dark/75 text-sm">
                Tu panel ve finanzas y datos de clientes. La verificación en 2 pasos agrega una capa
                extra: además de tu contraseña, pediremos un código que cambia cada 30 segundos en tu
                celular. Necesitas una app gratuita como{" "}
                <strong>Google Authenticator</strong>, <strong>Authy</strong> o 1Password.
              </p>
              <MfaEnroll />
            </div>
          )}
        </AdminCard>
      </AdminPageBody>
    </AdminPage>
  );
}
