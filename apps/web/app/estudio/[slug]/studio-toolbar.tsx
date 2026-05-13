"use client";

/*
 * StudioToolbar — header del Estudio (M.3).
 *
 * Muestra:
 *   - Back link al PDP
 *   - Nombre del producto
 *   - Estado auto-save (Guardando · Auto-save hace 12s · Error)
 *   - Botón "✨ Listo" (deshabilitado hasta tener slots requeridos llenos)
 */

import Link from "next/link";
import { ArrowLeft, Check, Loader2, AlertCircle, Sparkles } from "lucide-react";
import type { AutoSaveStatus, StudioProduct } from "./types";

type StudioToolbarProps = {
  product: StudioProduct;
  autoSaveStatus: AutoSaveStatus;
  canFinalize: boolean;
  isFinalizing: boolean;
  onFinalize: () => void;
};

export function StudioToolbar({
  product,
  autoSaveStatus,
  canFinalize,
  isFinalizing,
  onFinalize,
}: StudioToolbarProps) {
  return (
    <header className="border-brand-purple/10 bg-white sticky top-0 z-10 border-b">
      <div className="flex items-center justify-between gap-4 px-4 py-3 sm:px-6">
        <Link
          href={`/producto/${product.slug}`}
          className="text-brand-purple-dark/70 hover:text-brand-purple flex items-center gap-1.5 text-sm"
        >
          <ArrowLeft className="h-4 w-4" />
          <span className="hidden sm:inline">Volver al producto</span>
        </Link>

        <div className="hidden flex-1 text-center md:block">
          <p className="text-brand-purple-dark text-sm font-semibold">
            Personalizar: {product.name}
          </p>
        </div>

        <div className="flex items-center gap-3">
          <AutoSaveIndicator status={autoSaveStatus} />
          <button
            type="button"
            disabled={!canFinalize || isFinalizing}
            onClick={onFinalize}
            className="bg-brand-purple hover:bg-brand-purple-dark inline-flex h-10 items-center gap-2 rounded-md px-4 text-sm font-semibold text-white shadow-md shadow-brand-purple/20 transition-all disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isFinalizing ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Guardando diseño...
              </>
            ) : (
              <>
                <Sparkles className="h-4 w-4" />
                ¡Listo!
              </>
            )}
          </button>
        </div>
      </div>
    </header>
  );
}

function AutoSaveIndicator({ status }: { status: AutoSaveStatus }) {
  switch (status.kind) {
    case "idle":
      return <span className="text-brand-purple-dark/40 hidden text-xs sm:block">Editando…</span>;
    case "saving":
      return (
        <span className="text-brand-purple/70 hidden items-center gap-1 text-xs sm:flex">
          <Loader2 className="h-3 w-3 animate-spin" />
          Guardando...
        </span>
      );
    case "saved":
      return (
        <span className="text-brand-purple-dark/60 hidden items-center gap-1 text-xs sm:flex">
          <Check className="h-3 w-3" />
          {formatRelative(status.at)}
        </span>
      );
    case "error":
      return (
        <span className="hidden items-center gap-1 text-xs text-red-600 sm:flex" title={status.message}>
          <AlertCircle className="h-3 w-3" />
          Error al guardar
        </span>
      );
  }
}

function formatRelative(timestamp: number): string {
  const diffMs = Date.now() - timestamp;
  const sec = Math.floor(diffMs / 1000);
  if (sec < 5) return "Guardado";
  if (sec < 60) return `Auto-guardado hace ${sec}s`;
  const min = Math.floor(sec / 60);
  return `Auto-guardado hace ${min}m`;
}
