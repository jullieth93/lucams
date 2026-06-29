/*
 * Admin > Login > MFA — reto de verificación en 2 pasos tras el login.
 * Lucy 2026-06-27 (Bloque C / A6).
 *
 * El proxy deja pasar /admin/login/* sin sesión, pero esta página SÍ requiere
 * sesión (aal1) + un factor TOTP verificado. Si no aplica, redirige.
 */

import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { ShieldCheck } from "lucide-react";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { MfaChallenge } from "./mfa-challenge";

export const metadata: Metadata = { title: "Verificación en 2 pasos" };

export default async function AdminMfaPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/admin/login");

  const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  // Ya verificado (aal2) → al panel. No hay reto pendiente.
  if (aal?.currentLevel === "aal2") redirect("/admin/dashboard");

  const { data: factorsData } = await supabase.auth.mfa.listFactors();
  const totp = (factorsData?.totp ?? []).find((f) => f.status === "verified");
  // No tiene MFA → no hay nada que retar.
  if (!totp) redirect("/admin/dashboard");

  return (
    <div className="bg-brand-cream flex min-h-screen items-center justify-center px-4">
      <div className="border-brand-purple/15 w-full max-w-sm rounded-2xl border bg-white p-6 shadow-sm">
        <div className="mb-4 flex flex-col items-center text-center">
          <div className="bg-brand-purple/10 mb-3 flex h-12 w-12 items-center justify-center rounded-full">
            <ShieldCheck className="text-brand-purple h-6 w-6" />
          </div>
          <h1 className="text-brand-purple-dark font-display text-xl font-bold">
            Verificación en 2 pasos
          </h1>
          <p className="text-brand-purple-dark/65 mt-1 text-sm">
            Escribe el código de 6 dígitos de tu app de autenticación para entrar.
          </p>
        </div>
        <MfaChallenge factorId={totp.id} />
      </div>
    </div>
  );
}
