"use client";

/*
 * StudioToolbar — header sticky del Estudio v2 (M.3.b Capa 2).
 *
 * Muestra:
 *   - Back link al PDP (ARIA labeled)
 *   - Producto + indicador "X/N fotos" mini
 *   - Auto-save indicator (Editando · Guardando · Auto-guardado hace Xs · Error)
 *   - Botón "¡Listo!" con canFinalize fix (solo habilitado si TODOS los
 *     slots tienen assetUrl — el bug crítico de M.3 corregido)
 *
 * El botón "¡Listo!" tiene 3 estados visuales:
 *   - Deshabilitado (rojo claro + tooltip explicando qué falta)
 *   - Habilitado (morado solid + shine on hover)
 *   - Saving (loader + texto "Guardando diseño...")
 */

import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowLeft, Check, Loader2, AlertCircle, Sparkles } from "lucide-react";
import type { StoreApi } from "zustand";
import { useStore } from "zustand";
import { selectSlotProgress, type StudioStoreState } from "./lib/store";

type StudioToolbarProps = {
  store: StoreApi<StudioStoreState>;
  productName: string;
  productSlug: string;
  onFinalize: () => void;
};

export function StudioToolbar({ store, productName, productSlug, onFinalize }: StudioToolbarProps) {
  const autoSaveStatus = useStore(store, (s) => s.autoSaveStatus);
  const isFinalizing = useStore(store, (s) => s.isFinalizing);
  const progress = useStore(store, selectSlotProgress);

  const canFinalize = progress.complete && !isFinalizing;

  // Tooltip dinámico cuando deshabilitado
  const disabledTooltip = !progress.complete
    ? `Faltan ${progress.total - progress.filled} fotos por cargar antes de poder finalizar`
    : undefined;

  return (
    <header
      role="banner"
      className="border-brand-purple/10 sticky top-0 z-10 border-b bg-white backdrop-blur"
    >
      <div className="flex items-center justify-between gap-4 px-4 py-3 sm:px-6">
        <Link
          href={`/producto/${productSlug}`}
          aria-label={`Volver al producto ${productName}`}
          className="text-brand-purple-dark/70 hover:text-brand-purple focus:ring-brand-purple flex items-center gap-1.5 rounded text-sm focus:ring-2 focus:outline-none"
        >
          <ArrowLeft className="h-4 w-4" />
          <span className="hidden sm:inline">Volver</span>
        </Link>

        <div className="hidden flex-1 items-center justify-center gap-3 md:flex">
          <p className="text-brand-purple-dark text-sm font-semibold">
            Personalizar: {productName}
          </p>
          <span aria-hidden className="text-brand-purple/30">
            ·
          </span>
          <ProgressBadge filled={progress.filled} total={progress.total} />
        </div>

        <div className="flex items-center gap-3">
          <AutoSaveIndicator status={autoSaveStatus} isFinalizing={isFinalizing} />
          <button
            type="button"
            disabled={!canFinalize}
            onClick={onFinalize}
            title={disabledTooltip}
            aria-label={
              canFinalize
                ? "Listo, generar diseño final"
                : (disabledTooltip ?? "No se puede finalizar todavía")
            }
            aria-disabled={!canFinalize}
            className={[
              "focus:ring-brand-purple inline-flex h-10 items-center gap-2 rounded-md px-4 text-sm font-semibold transition-all focus:ring-2 focus:ring-offset-2 focus:outline-none",
              canFinalize
                ? "bg-brand-purple hover:bg-brand-purple-dark shadow-brand-purple/20 hover:shadow-brand-purple/30 text-white shadow-md hover:shadow-lg"
                : "bg-brand-purple/30 cursor-not-allowed text-white",
            ].join(" ")}
          >
            {isFinalizing ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                <span>Guardando diseño...</span>
              </>
            ) : (
              <>
                <Sparkles className="h-4 w-4" aria-hidden />
                <span>¡Listo!</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Progress badge mobile (visible solo < md) */}
      <div className="border-brand-purple/10 bg-brand-cream/50 flex items-center justify-center border-t py-2 md:hidden">
        <ProgressBadge filled={progress.filled} total={progress.total} />
      </div>
    </header>
  );
}

// ──────────── Sub-components ────────────

function ProgressBadge({ filled, total }: { filled: number; total: number }) {
  const complete = filled === total && total > 0;
  return (
    <span
      role="status"
      aria-live="polite"
      className={[
        "inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-bold tabular-nums",
        complete
          ? "bg-emerald-100 text-emerald-700"
          : filled === 0
            ? "bg-red-50 text-red-700"
            : "bg-brand-purple/10 text-brand-purple-dark",
      ].join(" ")}
    >
      {complete && <Check className="h-3 w-3" aria-hidden />}
      <span>
        {filled}/{total} fotos
      </span>
    </span>
  );
}

function AutoSaveIndicator({
  status,
  isFinalizing,
}: {
  status: StudioStoreState["autoSaveStatus"];
  isFinalizing: boolean;
}) {
  if (isFinalizing) return null;
  return (
    <AnimatePresence mode="wait">
      <motion.span
        key={status.kind}
        initial={{ opacity: 0, y: -2 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -2 }}
        transition={{ duration: 0.15 }}
        className="hidden items-center gap-1 text-xs sm:flex"
      >
        {status.kind === "idle" && <span className="text-brand-purple-dark/40">Editando…</span>}
        {status.kind === "saving" && (
          <>
            <Loader2 className="text-brand-purple/70 h-3 w-3 animate-spin" />
            <span className="text-brand-purple/70">Guardando...</span>
          </>
        )}
        {status.kind === "saved" && (
          <>
            <Check className="h-3 w-3 text-emerald-600" />
            <span className="text-brand-purple-dark/60">{formatRelative(status.at)}</span>
          </>
        )}
        {status.kind === "error" && (
          <span
            title={status.message}
            className="flex items-center gap-1 text-red-600"
            role="alert"
          >
            <AlertCircle className="h-3 w-3" />
            Error al guardar
          </span>
        )}
      </motion.span>
    </AnimatePresence>
  );
}

function formatRelative(timestamp: number): string {
  const diffMs = Date.now() - timestamp;
  const sec = Math.floor(diffMs / 1000);
  if (sec < 5) return "Guardado";
  if (sec < 60) return `Guardado hace ${sec}s`;
  const min = Math.floor(sec / 60);
  return `Guardado hace ${min}m`;
}
