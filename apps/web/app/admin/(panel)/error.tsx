/*
 * Error boundary del panel admin (auditoría v3 · #16). Sin esto, un error en cualquier página de
 * /admin dejaba a Lucy en el error global genérico (con logo y link a "/"). Este boundary da contexto
 * admin: reintento + volver al panel, y reporta el error a ErrorReport (Bloque D). Client Component.
 */

"use client";

import { useEffect } from "react";
import Link from "next/link";

export default function AdminError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[admin-error]", { digest: error.digest, message: error.message });
    void fetch("/api/log-error", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      keepalive: true,
      body: JSON.stringify({
        message: error.message,
        stack: error.stack,
        digest: error.digest,
        url: typeof window !== "undefined" ? window.location.href : undefined,
        source: "admin-error",
      }),
    }).catch(() => {});
  }, [error]);

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center px-6 py-16 text-center">
      <h1 className="text-brand-purple-dark text-2xl font-bold">Algo falló en el panel</h1>
      <p className="text-brand-purple-dark/70 mt-3 max-w-md text-sm">
        Ya quedó registrado. Puedes reintentar o volver al panel.
      </p>
      {error.digest && (
        <p className="text-brand-muted mt-2 font-mono text-xs">Ref: {error.digest}</p>
      )}
      <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
        <button
          type="button"
          onClick={reset}
          className="bg-brand-purple hover:bg-brand-purple-dark rounded-lg px-4 py-2 text-sm font-semibold text-white"
        >
          Intentar de nuevo
        </button>
        <Link
          href="/admin/dashboard"
          className="border-brand-purple/30 text-brand-purple-dark rounded-lg border px-4 py-2 text-sm font-semibold"
        >
          Volver al panel
        </Link>
      </div>
    </div>
  );
}
