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
import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowLeft, Check, Loader2, AlertCircle, Sparkles, HelpCircle } from "lucide-react";
import type { StoreApi } from "zustand";
import { useStore } from "zustand";
import { compareSizeToObject } from "./lib/size-comparator";
import { LucamsLogo } from "@/components/lucams-logo";
import {
  selectFilledSlotCount,
  selectIsComplete,
  selectTotalSlotCount,
  type StudioStoreState,
} from "./lib/store";

type StudioToolbarProps = {
  store: StoreApi<StudioStoreState>;
  productName: string;
  productSlug: string;
  /** A1.1 — URL de la imagen del producto (mini avatar en el header). */
  productImageUrl?: string;
  /** A1.1 — Tamaño físico del imán, ej "5×5 cm". */
  productSizeCm?: string;
  /** A1.1 — Cantidad total de imanes del pack (ej 6, 12). */
  productSlotCount?: number;
  /** M.3.b.B.1 — toggle bleed + safe area overlay guides. */
  showRealismGuides?: boolean;
  /** M.3.b.B.1 — callback al cambiar el toggle. */
  onToggleRealismGuides?: () => void;
  /** M.3.b.UX.bug v3 — abre el modal de Vista previa final. */
  /** M.3.b.UX.v12 (Lucy 2026-05-15) — Abrir banner de gestos manualmente
   *  (drag/zoom/dblclick). El cliente puede re-leer las instrucciones cuando
   *  quiera. */
  onOpenGesturesHint?: () => void;
  onFinalize: () => void;
};

export function StudioToolbar({
  store,
  productName,
  productSlug,
  productImageUrl,
  productSizeCm,
  productSlotCount,
  showRealismGuides,
  onToggleRealismGuides: _onToggleRealismGuides,
  onOpenGesturesHint,
  onFinalize,
}: StudioToolbarProps) {
  const autoSaveStatus = useStore(store, (s) => s.autoSaveStatus);
  const isFinalizing = useStore(store, (s) => s.isFinalizing);
  // Suscripciones atómicas (primitivos) — evitan re-render infinito que daba
  // un selector compuesto. Ver lib/store.ts comment "Selectores ATÓMICOS".
  const filled = useStore(store, selectFilledSlotCount);
  const total = useStore(store, selectTotalSlotCount);
  const complete = useStore(store, selectIsComplete);

  const canFinalize = complete && !isFinalizing;

  const disabledTooltip = !complete
    ? `Faltan ${total - filled} fotos por cargar antes de poder finalizar`
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

        {/* A1.1 — Hero del estudio: avatar producto + nombre + medidas físicas grandes */}
        <div className="hidden flex-1 items-center justify-center gap-3 md:flex">
          <ProductAvatar productImageUrl={productImageUrl} productName={productName} />
          <div className="flex flex-col items-start leading-tight">
            <p className="text-brand-purple-dark text-sm font-semibold">
              Personalizar · {productName}
            </p>
            {(productSizeCm || productSlotCount) && (
              <p className="text-brand-purple-dark/55 mt-0.5 flex items-center gap-1.5 text-[11px] font-medium">
                {productSizeCm && <SizeChipWithComparator sizeCm={productSizeCm} />}
                {productSlotCount && (
                  <span className="text-brand-purple-dark/55">
                    · {productSlotCount} {productSlotCount === 1 ? "imán" : "imanes"}
                  </span>
                )}
              </p>
            )}
          </div>
          <span aria-hidden className="text-brand-purple/20">
            ·
          </span>
          <ProgressBadge filled={filled} total={total} />
        </div>

        <div className="flex items-center gap-2 sm:gap-3">
          {/* Lucy 2026-05-21 round 4: toggle eliminado. La línea punteada
              de "zona segura" no matcheaba visualmente la silueta del
              corazón/círculo y confundía al cliente sin aportar valor real
              (la silueta del producto YA define el borde de impresión).
              Mantenemos prop onToggleRealismGuides en la API para futuras
              expansiones, pero NO renderea botón. */}
          {/* M.3.b.UX.v12 (Lucy 2026-05-15) — Botón "?" para re-ver gestos.
            Icon-only para no ocupar espacio. Visible en mobile y desktop. */}
          {onOpenGesturesHint && (
            <button
              type="button"
              onClick={onOpenGesturesHint}
              aria-label="Ver instrucciones de gestos del editor"
              title="Cómo editar tu foto (drag, zoom, doble click)"
              className="text-brand-purple-dark/70 hover:bg-brand-purple/10 hover:text-brand-purple-dark focus:ring-brand-purple inline-flex h-9 w-9 items-center justify-center rounded-md transition-colors focus:ring-2 focus:ring-offset-1 focus:outline-none"
            >
              <HelpCircle className="h-4 w-4" aria-hidden />
            </button>
          )}
          <AutoSaveIndicator status={autoSaveStatus} isFinalizing={isFinalizing} />
          {/* M.3.b.UX.1 — Finalize button INLINE solo desktop (sm+).
              En mobile el FAB es la única forma de finalizar (montado por
              StudioEditor afuera del toolbar para que flote sobre el canvas). */}
          <div className="hidden sm:block">
            <FinalizeButton
              isFinalizing={isFinalizing}
              canFinalize={canFinalize}
              disabledTooltip={disabledTooltip}
              onFinalize={onFinalize}
              variant="inline"
            />
          </div>
        </div>
      </div>

      {/* Progress badge mobile (visible solo < md) */}
      <div className="border-brand-purple/10 bg-brand-cream/50 flex items-center justify-center gap-2 border-t py-2 md:hidden">
        <ProgressBadge filled={filled} total={total} />
        {/* AutoSave indicator mobile abajo del progress */}
        <AutoSaveIndicator status={autoSaveStatus} isFinalizing={isFinalizing} />
      </div>

      {/* M.3.b.UX.v4 Lucy 2026-05-15 — leyenda simplificada y contextualizada.
        Una sola guide ahora (la silueta del producto YA es el borde físico).
        Anclamos al tamaño real del imán para que el cliente entienda la
        proporción concreta (no solo "una línea adentro"). */}
      {showRealismGuides && (
        <div className="border-brand-purple/15 bg-brand-purple/5 text-brand-purple-dark flex flex-wrap items-center justify-center gap-x-3 gap-y-1 border-t px-3 py-1.5 text-[11px]">
          <span className="inline-flex items-center gap-1.5">
            <span
              aria-hidden
              className="inline-block h-0.5 w-4 rounded-sm"
              style={{ borderTop: "2.5px dashed rgb(124 106 173 / 0.85)" }}
            />
            <strong>Línea morada</strong> = mantén texto y caras adentro para que no se corten al
            imprimir
          </span>
          {productSizeCm && (
            <span className="text-brand-purple-dark/60">
              · Tu imán físico mide <strong>{productSizeCm} cm</strong>
            </span>
          )}
        </div>
      )}
    </header>
  );
}

// ──────────────────────────────────────────────────────────────────
//  M.3.b.UX.1 — FinalizeButton (extraído para reusar como FAB mobile)
// ──────────────────────────────────────────────────────────────────
//
// Botón ¡Listo! con 2 variantes:
//  - "inline": versión del toolbar desktop (h-10 px-4)
//  - "fab":    versión floating mobile bottom-right (h-14, sombra deep,
//              pulse animation cuando canFinalize)

export function FinalizeButton({
  isFinalizing,
  canFinalize,
  disabledTooltip,
  onFinalize,
  variant,
}: {
  isFinalizing: boolean;
  canFinalize: boolean;
  disabledTooltip?: string;
  onFinalize: () => void;
  variant: "inline" | "fab";
}) {
  if (variant === "fab") {
    return (
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
          "focus:ring-brand-purple fixed right-4 bottom-4 z-30 inline-flex h-14 items-center gap-2 rounded-full px-5 text-sm font-bold transition-all focus:ring-2 focus:ring-offset-2 focus:outline-none sm:hidden",
          canFinalize
            ? "bg-brand-purple hover:bg-brand-purple-dark shadow-brand-purple/30 ring-brand-purple/20 text-white shadow-2xl ring-4 hover:scale-105 active:scale-95"
            : "bg-brand-purple/40 cursor-not-allowed text-white shadow-md",
        ].join(" ")}
      >
        {isFinalizing ? (
          <>
            <Loader2 className="h-5 w-5 animate-spin" aria-hidden />
            <span>Guardando...</span>
          </>
        ) : (
          <>
            <Sparkles className="h-5 w-5" aria-hidden />
            <span>¡Listo!</span>
          </>
        )}
      </button>
    );
  }

  // Inline (desktop toolbar)
  return (
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
  );
}

// ──────────────────────────────────────────────────────────────────
//  StudioFinalizeFab — FAB ¡Listo! mobile (montado desde editor)
// ──────────────────────────────────────────────────────────────────
//
// Hijo del editor (no del toolbar) porque debe flotar fuera del header
// sticky. Lee del store los mismos selectores que el toolbar.

export function StudioFinalizeFab({
  store,
  onFinalize,
}: {
  store: StoreApi<StudioStoreState>;
  onFinalize: () => void;
}) {
  const isFinalizing = useStore(store, (s) => s.isFinalizing);
  const filled = useStore(store, selectFilledSlotCount);
  const total = useStore(store, selectTotalSlotCount);
  const complete = useStore(store, selectIsComplete);
  const canFinalize = complete && !isFinalizing;
  const disabledTooltip = !complete
    ? `Faltan ${total - filled} fotos por cargar antes de poder finalizar`
    : undefined;
  return (
    <FinalizeButton
      isFinalizing={isFinalizing}
      canFinalize={canFinalize}
      disabledTooltip={disabledTooltip}
      onFinalize={onFinalize}
      variant="fab"
    />
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
            className="flex max-w-[300px] items-center gap-1 truncate text-red-600 sm:max-w-[480px]"
            role="alert"
          >
            <AlertCircle className="h-3 w-3 flex-shrink-0" />
            <span className="truncate" title={status.message}>
              {status.message || "Error al guardar"}
            </span>
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

// ──────────────────────────────────────────────────────────────────
//  FIX-3 — ProductAvatar con fallback al mascote
// ──────────────────────────────────────────────────────────────────
//
// Si el productImageUrl no carga (Unsplash tarda, CSP, red caída) el
// avatar quedaba como cuadrado blanco vacío. Fallback con mascote Lucams.

function ProductAvatar({
  productImageUrl,
  productName,
}: {
  productImageUrl?: string;
  productName: string;
}) {
  const [errored, setErrored] = useState(false);

  // Sin URL → directo al fallback con mascote
  if (!productImageUrl || errored) {
    return (
      <div
        className="ring-brand-purple/15 from-brand-cream to-brand-pink/15 flex h-10 w-10 items-center justify-center overflow-hidden rounded-md bg-gradient-to-br shadow-sm ring-1"
        aria-label={productName}
      >
        <LucamsLogo variant="mascot" size={28} />
      </div>
    );
  }

  return (
    <div className="ring-brand-purple/15 relative h-10 w-10 overflow-hidden rounded-md shadow-sm ring-1">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={productImageUrl}
        alt={productName}
        className="h-full w-full object-cover"
        onError={() => setErrored(true)}
      />
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────
//  P0.5 — Chip de tamaño con comparador a objeto cotidiano
// ──────────────────────────────────────────────────────────────────
//
// Click sobre el chip → toggle popover con visual "🍪 como una galleta Oreo".
// Diferenciador "tienda que envidiar": ningún competidor del rubro magnetos lo
// hace, reduce devoluciones por "llegó más chico de lo esperado".

function SizeChipWithComparator({ sizeCm }: { sizeCm: string }) {
  const [open, setOpen] = useState(false);
  const comparison = compareSizeToObject(sizeCm);

  if (!comparison) {
    // Sin match — render chip plano sin clickable.
    return (
      <span className="bg-brand-cream text-brand-purple-dark ring-brand-purple/10 inline-flex items-center gap-1 rounded-full px-2 py-0.5 ring-1">
        📐 {sizeCm} cm
      </span>
    );
  }

  return (
    <span className="relative inline-block">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-label={`Tamaño físico ${sizeCm} cm. Click para ver comparación con objeto cotidiano.`}
        className="bg-brand-cream text-brand-purple-dark ring-brand-purple/15 hover:bg-brand-yellow/20 hover:ring-brand-purple/40 focus:ring-brand-turquoise inline-flex items-center gap-1 rounded-full px-2 py-0.5 ring-1 transition-colors focus:ring-2 focus:ring-offset-1 focus:outline-none"
      >
        📐 {sizeCm} cm
        <span className="text-brand-purple-dark/40 text-[9px]">{open ? "▴" : "▾"}</span>
      </button>

      <AnimatePresence>
        {open && (
          <>
            {/* Backdrop click-to-close */}
            <button
              type="button"
              aria-label="Cerrar comparador"
              onClick={() => setOpen(false)}
              className="fixed inset-0 z-30 cursor-default"
              tabIndex={-1}
            />
            <motion.div
              initial={{ opacity: 0, y: -4, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -4, scale: 0.96 }}
              transition={{ duration: 0.18, ease: "easeOut" }}
              role="tooltip"
              className="ring-brand-purple/15 absolute top-full left-1/2 z-40 mt-2 w-64 -translate-x-1/2 rounded-xl bg-white p-3 shadow-xl ring-1"
            >
              <div className="flex items-center gap-2">
                <span className="text-3xl leading-none" aria-hidden>
                  {comparison.emoji}
                </span>
                <div className="flex flex-col">
                  <p className="text-brand-purple-dark text-xs leading-tight font-bold">
                    Tu imán será {comparison.phrase}
                  </p>
                  <p className="text-brand-purple-dark/60 mt-0.5 text-[10px]">{comparison.name}</p>
                </div>
              </div>
              {/* FIX-5 — Dimensión explícita ancho × alto para evitar la
                  ambigüedad "7×9 o 9×7". Convención del catálogo: primero
                  ancho, después alto. */}
              <p className="text-brand-purple-dark/55 border-brand-purple/10 mt-2 border-t pt-1.5 text-[10px]">
                <span className="font-bold">Medida:</span> {comparison.humanLabel}
              </p>
              {/* Pico apuntando al chip */}
              <span
                aria-hidden
                className="ring-brand-purple/15 absolute -top-1.5 left-1/2 h-3 w-3 -translate-x-1/2 rotate-45 bg-white ring-1"
              />
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </span>
  );
}
