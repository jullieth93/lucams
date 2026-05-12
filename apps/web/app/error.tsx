/*
 * Error boundary — route-level.
 *
 * Captura errores no manejados dentro de un route segment (no de root).
 * Para errores de root, ver app/global-error.tsx.
 *
 * Logueamos al servidor (no exponer stack al cliente). El componente
 * recibe `error` (con un `digest` que apunta al log del servidor) y
 * `reset` para reintentar.
 */

"use client";

import { useEffect } from "react";
import Link from "next/link";
import { LucamsLogo } from "@/components/lucams-logo";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Logueamos al cliente; el server-side ya tiene el detalle vía digest.
    // En sub-bloque F esto se conectará a /api/log-error para registro
    // estructurado con dedup en ErrorReport.
    console.error("[route-error]", { digest: error.digest, message: error.message });
  }, [error]);

  return (
    <div className="bg-brand-cream flex min-h-screen flex-col items-center justify-center px-6 py-16 text-center">
      <div className="motion-safe:animate-[var(--animate-float)] motion-safe:[animation-duration:3s]">
        <LucamsLogo variant="full" size={140} className="drop-shadow-md" />
      </div>

      <h1 className="font-display text-brand-purple-dark mt-8 text-3xl sm:text-4xl">
        Algo salió mal de nuestro lado
      </h1>
      <p className="text-brand-purple-dark/70 mt-3 max-w-md text-base">
        Ya quedó registrado. Podés intentar de nuevo o volver al inicio.
      </p>

      {error.digest && (
        <p className="text-brand-purple-dark/40 mt-2 font-mono text-xs">Ref: {error.digest}</p>
      )}

      <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
        <button
          type="button"
          onClick={() => reset()}
          className="bg-brand-purple hover:bg-brand-purple-dark rounded-full px-6 py-3 text-base font-semibold text-white shadow-md transition-colors"
        >
          Intentar de nuevo
        </button>
        <Link
          href="/"
          className="border-brand-purple/30 text-brand-purple-dark hover:bg-brand-purple/5 rounded-full border bg-white px-6 py-3 text-base font-semibold"
        >
          Volver al inicio
        </Link>
      </div>
    </div>
  );
}
