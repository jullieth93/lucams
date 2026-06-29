/*
 * Admin > Seguridad — verificación en 2 pasos (MFA/TOTP).
 * Lucy 2026-06-27 (Bloque C / A6). Decisión: MFA activa para SUPERADMIN desde día 1.
 */

import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { ShieldCheck, ShieldAlert, KeyRound } from "lucide-react";
import {
  AdminPage,
  AdminPageHeader,
  AdminPageBody,
  AdminCard,
  AdminNotice,
} from "@/components/admin-page";
import { getCurrentAdmin } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { MfaEnroll } from "./mfa-enroll";
import { disableMfaAction } from "./actions";

export const metadata: Metadata = { title: "Seguridad" };

export default async function AdminSeguridadPage() {
  const session = await getCurrentAdmin();
  if (!session) redirect("/admin/login");

  const supabase = await createSupabaseServerClient();
  const { data: factorsData } = await supabase.auth.mfa.listFactors();
  const verifiedTotp = (factorsData?.all ?? []).find(
    (f) => f.factor_type === "totp" && f.status === "verified",
  );
  const isEnabled = !!verifiedTotp;

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
            <div className="space-y-4">
              <AdminNotice tone="success">
                Tu cuenta está protegida: al entrar al panel te pediremos un código de tu app de
                autenticación, además de la contraseña.
              </AdminNotice>
              <div className="text-brand-purple-dark/70 text-sm">
                <p className="mb-1 font-semibold">¿Perdiste el teléfono?</p>
                <p>
                  Hay un mecanismo de emergencia: desde el servidor se ejecuta{" "}
                  <code className="bg-brand-purple/10 rounded px-1.5 py-0.5 text-xs">
                    make admin-mfa-reset
                  </code>{" "}
                  para desactivar la verificación y volver a enrolarla. (Lo corre quien administra el
                  servidor.)
                </p>
              </div>
              <form action={disableMfaAction}>
                <button
                  type="submit"
                  className="rounded-md border border-rose-200 bg-white px-4 py-2 text-sm font-semibold text-rose-600 hover:bg-rose-50"
                >
                  Desactivar verificación en 2 pasos
                </button>
              </form>
            </div>
          ) : (
            <div className="space-y-4">
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
