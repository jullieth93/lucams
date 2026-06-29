"use client";

/*
 * <MfaEnroll> — enrolamiento de verificación en 2 pasos (TOTP) para el admin.
 * Lucy 2026-06-27 (Bloque C / A6). Usa Supabase Auth MFA desde el cliente
 * (la sesión vive en cookies, el browser client la lee).
 *
 * Flujo:
 *   1. mfa.enroll({ factorType: 'totp' }) → QR + secret.
 *   2. Lucy escanea con Google Authenticator / Authy.
 *   3. Ingresa el código de 6 dígitos → mfa.challengeAndVerify → factor verificado.
 *   4. Recarga: el server marca "activado".
 *
 * Si pierde el teléfono: break-glass `make admin-mfa-reset EMAIL=...` (service role).
 */

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, ShieldCheck, ShieldAlert } from "lucide-react";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";

export function MfaEnroll() {
  const router = useRouter();
  const [step, setStep] = useState<"idle" | "qr" | "done">("idle");
  const [qrSvg, setQrSvg] = useState<string | null>(null);
  const [secret, setSecret] = useState<string | null>(null);
  const [factorId, setFactorId] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function startEnroll() {
    setError(null);
    setPending(true);
    const supabase = createSupabaseBrowserClient();
    // Limpia cualquier factor TOTP sin verificar previo (re-enroll limpio).
    const { data: factors } = await supabase.auth.mfa.listFactors();
    for (const f of factors?.all ?? []) {
      if (f.factor_type === "totp" && f.status === "unverified") {
        await supabase.auth.mfa.unenroll({ factorId: f.id });
      }
    }
    const { data, error: enrollErr } = await supabase.auth.mfa.enroll({
      factorType: "totp",
      friendlyName: `admin-${Date.now()}`,
    });
    setPending(false);
    if (enrollErr || !data) {
      setError(enrollErr?.message ?? "No se pudo iniciar el enrolamiento.");
      return;
    }
    setFactorId(data.id);
    setQrSvg(data.totp.qr_code);
    setSecret(data.totp.secret);
    setStep("qr");
  }

  async function verify(e: React.FormEvent) {
    e.preventDefault();
    if (!factorId) return;
    setError(null);
    setPending(true);
    const supabase = createSupabaseBrowserClient();
    const { error: verifyErr } = await supabase.auth.mfa.challengeAndVerify({
      factorId,
      code: code.trim(),
    });
    setPending(false);
    if (verifyErr) {
      setError("Código incorrecto o vencido. Revisa el código actual en tu app e intenta de nuevo.");
      return;
    }
    setStep("done");
    router.refresh();
  }

  if (step === "done") {
    return (
      <div className="flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
        <ShieldCheck className="h-5 w-5" />
        ¡Listo! La verificación en 2 pasos quedó activada. La próxima vez que entres te pediremos el
        código.
      </div>
    );
  }

  if (step === "qr" && qrSvg) {
    return (
      <div className="space-y-4">
        <ol className="text-brand-purple-dark/80 list-inside list-decimal space-y-1 text-sm">
          <li>Abre tu app de autenticación (Google Authenticator, Authy, 1Password…).</li>
          <li>Escanea este código QR.</li>
          <li>Escribe abajo el código de 6 dígitos que te muestra la app.</li>
        </ol>
        <div className="flex flex-col items-center gap-3 sm:flex-row sm:items-start">
          {/* qr_code es un SVG (data URI o markup). Lo mostramos. */}
          <div
            className="border-brand-purple/15 rounded-lg border bg-white p-2"
            dangerouslySetInnerHTML={{ __html: qrSvg }}
          />
          {secret && (
            <div className="text-brand-purple-dark/70 text-xs">
              <p className="mb-1 font-semibold">¿No puedes escanear?</p>
              <p>Escribe esta clave en tu app manualmente:</p>
              <code className="bg-brand-purple/10 mt-1 inline-block rounded px-2 py-1 font-mono break-all">
                {secret}
              </code>
            </div>
          )}
        </div>
        <form onSubmit={verify} className="flex flex-wrap items-end gap-2">
          <div>
            <label htmlFor="mfa-code" className="text-brand-purple-dark mb-1 block text-xs font-semibold">
              Código de 6 dígitos
            </label>
            <input
              id="mfa-code"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              value={code}
              onChange={(ev) => setCode(ev.target.value.replace(/\D/g, ""))}
              placeholder="123456"
              className="border-brand-purple/25 focus:border-brand-purple focus:ring-brand-purple/20 h-10 w-32 rounded-md border bg-white px-3 text-center font-mono text-lg tracking-widest focus:ring-2 focus:outline-none"
            />
          </div>
          <button
            type="submit"
            disabled={pending || code.length !== 6}
            className="bg-gradient-brand inline-flex h-10 items-center gap-1.5 rounded-md px-4 text-sm font-semibold text-white disabled:opacity-50"
          >
            {pending && <Loader2 className="h-4 w-4 animate-spin" />}
            Verificar y activar
          </button>
        </form>
        {error && (
          <p className="flex items-center gap-1 text-sm text-rose-600">
            <ShieldAlert className="h-4 w-4" /> {error}
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <button
        type="button"
        onClick={startEnroll}
        disabled={pending}
        className="bg-gradient-brand inline-flex h-10 items-center gap-1.5 rounded-md px-4 text-sm font-semibold text-white disabled:opacity-50"
      >
        {pending && <Loader2 className="h-4 w-4 animate-spin" />}
        Activar verificación en 2 pasos
      </button>
      {error && (
        <p className="flex items-center gap-1 text-sm text-rose-600">
          <ShieldAlert className="h-4 w-4" /> {error}
        </p>
      )}
    </div>
  );
}
