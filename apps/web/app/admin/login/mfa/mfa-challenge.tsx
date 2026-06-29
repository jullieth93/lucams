"use client";

/*
 * <MfaChallenge> — reto de verificación en 2 pasos al iniciar sesión.
 * Lucy 2026-06-27 (Bloque C / A6). Tras login con contraseña (aal1), si la
 * cuenta tiene TOTP verificado, se pide el código para subir a aal2.
 */

import { useActionState, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, ShieldCheck, KeyRound } from "lucide-react";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import { useRecoveryCodeAction, type RecoveryLoginState } from "./actions";

export function MfaChallenge({ factorId }: { factorId: string }) {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [mode, setMode] = useState<"totp" | "recovery">("totp");
  const [recoveryState, recoveryAction, recoveryPending] = useActionState<
    RecoveryLoginState | null,
    FormData
  >(useRecoveryCodeAction, null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setPending(true);
    const supabase = createSupabaseBrowserClient();
    const { error: verifyErr } = await supabase.auth.mfa.challengeAndVerify({
      factorId,
      code: code.trim(),
    });
    if (verifyErr) {
      setPending(false);
      setError("Código incorrecto o vencido. Mira el código actual en tu app e intenta de nuevo.");
      return;
    }
    // aal2 alcanzado → al panel.
    router.replace("/admin/dashboard");
    router.refresh();
  }

  // Modo código de respaldo (perdió el teléfono).
  if (mode === "recovery") {
    return (
      <form action={recoveryAction} className="space-y-4">
        <div>
          <label
            htmlFor="recovery"
            className="text-brand-purple-dark mb-1 block text-sm font-semibold"
          >
            Código de respaldo
          </label>
          <input
            id="recovery"
            name="code"
            autoFocus
            autoComplete="off"
            placeholder="XXXXX-XXXXX"
            className="border-brand-purple/25 focus:border-brand-purple focus:ring-brand-purple/20 h-12 w-full rounded-md border bg-white px-3 text-center font-mono text-lg tracking-widest uppercase focus:ring-2 focus:outline-none"
          />
          <p className="text-brand-purple-dark/55 mt-1 text-xs">
            Es uno de los códigos que guardaste al activar la verificación. Tras usarlo,
            reconfigura la verificación en 2 pasos.
          </p>
        </div>
        {recoveryState?.error && <p className="text-sm text-rose-600">{recoveryState.error}</p>}
        <button
          type="submit"
          disabled={recoveryPending}
          className="bg-gradient-brand inline-flex h-11 w-full items-center justify-center gap-1.5 rounded-md text-sm font-semibold text-white disabled:opacity-50"
        >
          {recoveryPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <KeyRound className="h-4 w-4" />}
          Entrar con código de respaldo
        </button>
        <button
          type="button"
          onClick={() => setMode("totp")}
          className="text-brand-purple hover:text-brand-purple-dark w-full text-center text-xs font-semibold"
        >
          ← Volver a usar el código de la app
        </button>
      </form>
    );
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <div>
        <label htmlFor="code" className="text-brand-purple-dark mb-1 block text-sm font-semibold">
          Código de tu app de autenticación
        </label>
        <input
          id="code"
          inputMode="numeric"
          autoComplete="one-time-code"
          autoFocus
          maxLength={6}
          value={code}
          onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
          placeholder="123456"
          className="border-brand-purple/25 focus:border-brand-purple focus:ring-brand-purple/20 h-12 w-full rounded-md border bg-white px-3 text-center font-mono text-2xl tracking-[0.4em] focus:ring-2 focus:outline-none"
        />
      </div>
      {error && <p className="text-sm text-rose-600">{error}</p>}
      <button
        type="submit"
        disabled={pending || code.length !== 6}
        className="bg-gradient-brand inline-flex h-11 w-full items-center justify-center gap-1.5 rounded-md text-sm font-semibold text-white disabled:opacity-50"
      >
        {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
        Verificar y entrar
      </button>
      <button
        type="button"
        onClick={() => setMode("recovery")}
        className="text-brand-purple hover:text-brand-purple-dark w-full text-center text-xs font-semibold"
      >
        ¿No tienes el teléfono? Usar un código de respaldo
      </button>
    </form>
  );
}
