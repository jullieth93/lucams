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
 *   4. INMEDIATAMENTE se generan los códigos de respaldo (server action) y se
 *      muestran UNA sola vez; sin marcar "Ya guardé mis códigos" no se puede
 *      finalizar. Fase 3B (feedback Lucy 2026-09-18): antes el flujo pasaba
 *      directo a "listo" y Lucy quedaba enrolada SIN códigos si no los generaba
 *      a mano en el panel.
 *   5. Recarga: el server marca "activado".
 *
 * Si pierde el teléfono: break-glass `make admin-mfa-reset EMAIL=...` (service role).
 */

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, ShieldCheck, ShieldAlert, KeyRound } from "lucide-react";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import { generateRecoveryCodesAction } from "./actions";
import { RecoveryCodesReveal } from "./recovery-codes-reveal";

export function MfaEnroll() {
  const router = useRouter();
  const [step, setStep] = useState<"idle" | "qr" | "codes" | "done">("idle");
  const [qrSvg, setQrSvg] = useState<string | null>(null);
  const [secret, setSecret] = useState<string | null>(null);
  const [factorId, setFactorId] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  // Paso "codes": códigos de respaldo recién generados (en claro, una sola vista).
  const [codes, setCodes] = useState<string[] | null>(null);
  const [codesError, setCodesError] = useState<string | null>(null);
  const [codesSaved, setCodesSaved] = useState(false);

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

  /*
   * Genera los códigos de respaldo tras verificar el TOTP. Se puede reintentar
   * sin re-enrolar (el factor ya quedó verificado). Re-enroll: la regeneración
   * REEMPLAZA los códigos anteriores — generateRecoveryCodes borra el set previo
   * y crea uno nuevo en una transacción (features/admin-mfa/recovery-codes.ts).
   */
  async function loadCodes() {
    setCodesError(null);
    setPending(true);
    try {
      const res = await generateRecoveryCodesAction();
      if (res.error || !res.codes) {
        setCodesError(res.error ?? "No se pudieron generar los códigos de respaldo.");
      } else {
        setCodes(res.codes);
      }
    } catch {
      setCodesError("No se pudieron generar los códigos de respaldo. Intenta de nuevo.");
    } finally {
      setPending(false);
    }
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
    if (verifyErr) {
      setPending(false);
      setError(
        "Código incorrecto o vencido. Revisa el código actual en tu app e intenta de nuevo.",
      );
      return;
    }
    // Factor verificado: el paso siguiente (códigos de respaldo) es OBLIGATORIO,
    // no opcional — loadCodes maneja `pending` de aquí en adelante.
    setStep("codes");
    await loadCodes();
  }

  function finish() {
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

  if (step === "codes") {
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          <ShieldCheck className="h-5 w-5" />
          Tu app de autenticación quedó vinculada. Falta un último paso.
        </div>
        <div className="flex items-center gap-2">
          <KeyRound className="text-brand-muted h-5 w-5" />
          <h3 className="text-brand-purple-dark font-semibold">Guarda tus códigos de respaldo</h3>
        </div>
        <p className="text-brand-purple-dark/70 text-sm">
          Son tu única forma de entrar si pierdes el teléfono o cambias de app. Se muestran{" "}
          <strong>una única vez</strong>: cópialos o descárgalos y guárdalos en un lugar seguro.
        </p>

        {pending && !codes && !codesError && (
          <p className="text-brand-purple-dark/70 flex items-center gap-2 text-sm">
            <Loader2 className="h-4 w-4 animate-spin" /> Generando tus códigos de respaldo…
          </p>
        )}

        {codesError && (
          <div className="space-y-2">
            <p className="flex items-center gap-1 text-sm text-rose-600">
              <ShieldAlert className="h-4 w-4" /> {codesError}
            </p>
            {/* El TOTP YA quedó verificado: reintentar NO repite el enrolamiento. */}
            <button
              type="button"
              onClick={loadCodes}
              disabled={pending}
              className="border-brand-purple/25 text-brand-purple-dark hover:bg-brand-purple/5 inline-flex items-center gap-1.5 rounded-md border bg-white px-4 py-2 text-sm font-semibold disabled:opacity-60"
            >
              {pending && <Loader2 className="h-4 w-4 animate-spin" />}
              Reintentar
            </button>
          </div>
        )}

        {codes && (
          <RecoveryCodesReveal codes={codes}>
            <div className="border-brand-purple/10 mt-4 space-y-3 border-t pt-4">
              <label className="text-brand-purple-dark flex items-start gap-2 text-sm font-medium">
                <input
                  type="checkbox"
                  checked={codesSaved}
                  onChange={(ev) => setCodesSaved(ev.target.checked)}
                  className="accent-brand-purple mt-0.5 h-4 w-4"
                />
                Ya guardé mis códigos de respaldo en un lugar seguro
              </label>
              <button
                type="button"
                onClick={finish}
                disabled={!codesSaved}
                className="bg-gradient-brand inline-flex h-10 items-center gap-1.5 rounded-md px-4 text-sm font-semibold text-white disabled:opacity-50"
              >
                Finalizar
              </button>
            </div>
          </RecoveryCodesReveal>
        )}
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
          {/* SEC-01 (auditoría 2026-07-21): el QR se renderiza como <img> con
              data URI — una imagen NO ejecuta markup/script. Antes se inyectaba
              el SVG crudo con dangerouslySetInnerHTML: si la respuesta del Auth
              server se manipulaba, un SVG con <script> corría en contexto admin.
              Supabase devuelve `qr_code` como markup SVG o como data URI según
              versión; se soportan ambos. */}
          {/* eslint-disable-next-line @next/next/no-img-element -- data URI dinámico del enroll TOTP; next/image no aplica */}
          <img
            src={
              qrSvg.startsWith("data:")
                ? qrSvg
                : `data:image/svg+xml;utf8,${encodeURIComponent(qrSvg)}`
            }
            alt="Código QR para enrolar tu app de autenticación"
            className="border-brand-purple/15 rounded-lg border bg-white p-2"
            width={192}
            height={192}
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
            <label
              htmlFor="mfa-code"
              className="text-brand-purple-dark mb-1 block text-xs font-semibold"
            >
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
