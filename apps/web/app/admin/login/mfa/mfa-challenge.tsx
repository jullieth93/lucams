"use client";

/*
 * <MfaChallenge> — reto de verificación en 2 pasos al iniciar sesión.
 * Lucy 2026-06-27 (Bloque C / A6). Tras login con contraseña (aal1), si la
 * cuenta tiene TOTP verificado, se pide el código para subir a aal2.
 */

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, ShieldCheck } from "lucide-react";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";

export function MfaChallenge({ factorId }: { factorId: string }) {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

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
    </form>
  );
}
