"use client";

/*
 * StudioStyleToolbar — Ola 10 (Lucy 2026-07-24).
 *
 * Muestra los controles de ESTILO de la tarjeta justo ARRIBA del canvas, para que
 * el cliente vea el cambio en vivo mientras edita. Reemplaza la ubicación de los
 * controles en el sidebar (donde la acción y el resultado quedaban separados).
 *
 * Controles que se muestran según el producto/plantilla:
 *   - Color de tarjeta / marco (paleta completa o binario blanco/negro para Instagram).
 *   - Borde de foto: con borde / sin borde (foto a sangre).
 *
 * El componente es store-aware: lee la plantilla activa, el color actual y el
 * rect base del placeholder, y escribe en canvasData.borderColor y
 * canvasData.unitTemplate.layers (image-placeholder) via setBorderColor y
 * setImagePlaceholderRect.
 */

import { useStore } from "zustand";
import type { StoreApi } from "zustand";
import { Frame, Image as ImageIcon, Check } from "lucide-react";
import {
  frameColorById,
  isInstagramTemplate,
} from "@/features/personalization/frame-palette";
import type { StudioStoreState } from "./lib/store";

const LIGHT_HEXES = new Set(["#FFFFFF", "#FFD93D"]);

/** Check legible sobre cualquier color. */
function ActiveCheck({ dark }: { dark: boolean }) {
  return (
    <Check
      className="absolute inset-0 m-auto h-3.5 w-3.5"
      strokeWidth={3}
      style={{
        color: dark ? "#3D2E5C" : "#FFFFFF",
        filter: "drop-shadow(0 0 2px rgba(0,0,0,0.35))",
      }}
      aria-hidden
    />
  );
}

type StudioStyleToolbarProps = {
  store: StoreApi<StudioStoreState>;
  /** Opciones de marco declaradas por el producto. */
  frameOptions?: string[];
};

export function StudioStyleToolbar({ store, frameOptions = [] }: StudioStyleToolbarProps) {
  const selectedTemplateId = useStore(store, (s) => s.selectedTemplateId);
  const templates = useStore(store, (s) => s.templates);
  const canvasData = useStore(store, (s) => s.canvasData);
  const borderColor = useStore(store, (s) => s.canvasData?.borderColor ?? null);
  const setBorderColor = useStore(store, (s) => s.setBorderColor);
  const setImagePlaceholderRect = useStore(store, (s) => s.setImagePlaceholderRect);

  if (!canvasData) return null;

  const unitTemplate = canvasData.unitTemplate;
  const isIg = isInstagramTemplate(unitTemplate.layers);
  const selectedTemplate = templates.find((t) => t.id === selectedTemplateId);
  const isPolaroidClasica = selectedTemplate?.slug === "photo-pack-polaroid-clasica";

  // Solo mostrar la barra si hay algo configurable.
  const hasConfigurableFrame =
    frameOptions.length > 0 || isIg || isPolaroidClasica;
  if (!hasConfigurableFrame) return null;

  const stageW = unitTemplate.stage.width;
  const stageH = unitTemplate.stage.height;

  // Rect base "con borde" = el que trae la plantilla original seleccionada.
  const baseRect = (() => {
    if (!selectedTemplate) return null;
    const ph = selectedTemplate.canvasData?.layers?.find((l) => l.type === "image-placeholder") as
      | { x: number; y: number; width: number; height: number }
      | undefined;
    if (!ph) return null;
    const scaleX = stageW / selectedTemplate.canvasData.stage.width;
    const scaleY = stageH / selectedTemplate.canvasData.stage.height;
    return {
      x: Math.round(ph.x * scaleX),
      y: Math.round(ph.y * scaleY),
      width: Math.round(ph.width * scaleX),
      height: Math.round(ph.height * scaleY),
    };
  })();

  // Rect "sin borde": la foto a sangre. Instagram conserva el chrome arriba/abajo.
  const fullBleedRect = (() => {
    if (isIg) {
      const base = { width: 450, height: 600 };
      const scale = stageW / base.width;
      return {
        x: 0,
        y: Math.round(58 * scale),
        width: stageW,
        height: Math.round(410 * scale),
      };
    }
    return { x: 0, y: 0, width: stageW, height: stageH };
  })();

  const photoPlaceholder = unitTemplate.layers.find((l) => l.type === "image-placeholder") as
    | { width?: number }
    | undefined;
  const isFullBleed = !!photoPlaceholder && (photoPlaceholder.width ?? 0) >= stageW - 1;

  // Paleta efectiva: Instagram solo blanco/negro; el resto todas las opciones válidas.
  const frameColors = (frameOptions ?? [])
    .map((id) => frameColorById(id))
    .filter((c): c is NonNullable<typeof c> => c !== null)
    .filter((c) => (isIg ? c.id === "blanco" || c.id === "negro" : true));

  const handleBorderChange = (hex: string | null) => {
    setBorderColor(hex);
  };

  const handleBorderToggle = (fullBleed: boolean) => {
    if (fullBleed) {
      setImagePlaceholderRect(fullBleedRect);
    } else if (baseRect) {
      setImagePlaceholderRect(baseRect);
    }
  };

  return (
    <div className="border-brand-purple/10 bg-white/95 mb-4 w-full max-w-xl rounded-2xl border px-4 py-3 shadow-sm">
      <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-3">
        {/* Color de tarjeta */}
        {frameColors.length > 0 && (
          <div className="flex items-center gap-2">
            <span className="text-brand-purple-dark text-xs font-semibold">Color de tarjeta</span>
            <div role="radiogroup" aria-label="Color de tarjeta" className="flex items-center gap-1.5">
              {isIg ? null : (
                <ColorButton
                  active={borderColor === null}
                  label="Sin color"
                  onClick={() => handleBorderChange(null)}
                  kind="none"
                />
              )}
              {frameColors.map((c) => (
                <ColorButton
                  key={c.id}
                  active={borderColor?.toUpperCase() === c.hex.toUpperCase()}
                  color={c.hex}
                  label={c.label}
                  onClick={() => handleBorderChange(c.hex)}
                />
              ))}
            </div>
          </div>
        )}

        {/* Borde de foto */}
        {(isIg || isPolaroidClasica || frameColors.length > 0) && (
          <div className="flex items-center gap-2">
            <span className="text-brand-purple-dark text-xs font-semibold">Borde de foto</span>
            <div
              role="radiogroup"
              aria-label="Borde de foto"
              className="ring-brand-purple/15 flex gap-1 rounded-lg p-1 ring-1"
            >
              <BorderOption
                active={!isFullBleed}
                label="Con borde"
                icon={<Frame className="h-3.5 w-3.5" aria-hidden />}
                onClick={() => handleBorderToggle(false)}
              />
              <BorderOption
                active={isFullBleed}
                label="Sin borde"
                icon={<ImageIcon className="h-3.5 w-3.5" aria-hidden />}
                onClick={() => handleBorderToggle(true)}
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function BorderOption({
  active,
  label,
  icon,
  onClick,
}: {
  active: boolean;
  label: string;
  icon: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={active}
      onClick={onClick}
      className={[
        "flex items-center justify-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-semibold transition-all focus:outline-none",
        active ? "bg-brand-purple text-white shadow-sm" : "text-brand-purple-dark/70 hover:bg-brand-purple/10",
      ].join(" ")}
    >
      {icon}
      {label}
    </button>
  );
}

function ColorButton({
  active,
  color,
  label,
  onClick,
  kind = "color",
}: {
  active: boolean;
  color?: string;
  label: string;
  onClick: () => void;
  kind?: "color" | "none";
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={active}
      aria-label={label}
      title={label}
      onClick={onClick}
      className={[
        "focus:ring-brand-turquoise relative flex h-8 w-8 cursor-pointer items-center justify-center rounded-full transition-all focus:ring-2 focus:outline-none",
        active ? "ring-brand-turquoise shadow-md ring-2 ring-offset-2" : "ring-brand-purple/20 hover:ring-brand-purple/50 ring-1",
      ].join(" ")}
      style={
        kind === "none"
          ? { background: "white" }
          : { backgroundColor: color }
      }
    >
      {kind === "none" ? (
        <span className="text-brand-muted text-lg leading-none" aria-hidden>
          ∅
        </span>
      ) : active ? (
        <ActiveCheck dark={LIGHT_HEXES.has(color?.toUpperCase() ?? "")} />
      ) : null}
    </button>
  );
}
