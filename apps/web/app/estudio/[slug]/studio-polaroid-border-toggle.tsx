"use client";

/*
 * StudioPolaroidBorderToggle — Ola 6 (Lucy 2026-07-23).
 *
 * Polaroid Clásica: "Con borde o sin borde".
 *   - Con borde (default): foto cuadrada arriba + franja gruesa abajo con el
 *     mensaje editable (la silueta clásica de la polaroid).
 *   - Sin borde: la foto cubre TODA la tarjeta y el texto editable sigue
 *     visible sobre la foto. El marco blanco queda oculto debajo de la foto.
 *
 * Implementación: el toggle reescribe la GEOMETRÍA del image-placeholder en
 * canvasData.unitTemplate (store.setImagePlaceholderRect), igual que el toggle
 * de Instagram. El texto editable ya vive en una capa `text` por encima, así
 * que solo con cambiar el placeholder se logra el efecto WYSIWYG en el editor
 * y en producción.
 *
 * Solo se muestra cuando la plantilla activa es la Polaroid Clásica.
 */

import { useStore } from "zustand";
import type { StoreApi } from "zustand";
import { Frame, Image as ImageIcon } from "lucide-react";
import type { StudioStoreState } from "./lib/store";

const POLAROID_BASE_STAGE = { width: 450, height: 600 };

function PolaroidBorderOption({
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
        "flex flex-1 items-center justify-center gap-1.5 rounded-md px-2 py-2 text-xs font-semibold transition-all focus:outline-none",
        active
          ? "bg-brand-purple text-white shadow-sm"
          : "text-brand-purple-dark/70 hover:bg-brand-purple/10",
      ].join(" ")}
    >
      {icon}
      {label}
    </button>
  );
}

export function StudioPolaroidBorderToggle({ store }: { store: StoreApi<StudioStoreState> }) {
  const isPolaroidClasica = useStore(store, (s) => {
    const tpl = s.templates.find((t) => t.id === s.selectedTemplateId);
    return tpl?.slug === "photo-pack-polaroid-clasica";
  });
  const stageW = useStore(store, (s) => s.canvasData?.unitTemplate?.stage?.width ?? 0);
  const stageH = useStore(store, (s) => s.canvasData?.unitTemplate?.stage?.height ?? 0);
  const photoWidth = useStore(store, (s) => {
    const ph = s.canvasData?.unitTemplate?.layers?.find((l) => l.type === "image-placeholder") as
      | { width?: number }
      | undefined;
    return ph?.width ?? 0;
  });
  // Rect "con borde" canónico: el de la plantilla seleccionada (seed).
  const baseRectJson = useStore(store, (s) => {
    const tpl = s.templates.find((t) => t.id === s.selectedTemplateId);
    const ph = tpl?.canvasData?.layers?.find((l) => l.type === "image-placeholder") as
      | { x: number; y: number; width: number; height: number }
      | undefined;
    return ph ? JSON.stringify({ x: ph.x, y: ph.y, width: ph.width, height: ph.height }) : null;
  });
  const setImagePlaceholderRect = useStore(store, (s) => s.setImagePlaceholderRect);

  if (!isPolaroidClasica || !stageW || !photoWidth) return null;
  const isFullBleed = photoWidth >= stageW;
  const scaleX = stageW / POLAROID_BASE_STAGE.width;
  const scaleY = stageH / POLAROID_BASE_STAGE.height;
  const fullBleedRect = {
    x: 0,
    y: 0,
    width: stageW,
    height: stageH,
  };
  const baseRect = baseRectJson
    ? (JSON.parse(baseRectJson) as { x: number; y: number; width: number; height: number })
    : null;
  // Si el stage difiere del canónico, escalar el rect con borde proporcionalmente.
  const scaledBaseRect = baseRect
    ? {
        x: Math.round(baseRect.x * scaleX),
        y: Math.round(baseRect.y * scaleY),
        width: Math.round(baseRect.width * scaleX),
        height: Math.round(baseRect.height * scaleY),
      }
    : null;

  return (
    <section
      aria-labelledby="sidebar-polaroid-borde"
      className="border-brand-purple/10 border-t pt-5"
    >
      <div
        id="sidebar-polaroid-borde"
        className="text-brand-purple-dark mb-3 flex items-center gap-2 text-sm font-semibold"
      >
        <Frame className="text-brand-purple h-4 w-4" />
        Borde de la Polaroid
      </div>
      <div
        role="radiogroup"
        aria-label="Foto con o sin borde polaroid"
        className="ring-brand-purple/15 flex gap-1 rounded-lg p-1 ring-1"
      >
        <PolaroidBorderOption
          active={!isFullBleed}
          label="Con borde"
          icon={<Frame className="h-3.5 w-3.5" aria-hidden />}
          onClick={() => scaledBaseRect && setImagePlaceholderRect(scaledBaseRect)}
        />
        <PolaroidBorderOption
          active={isFullBleed}
          label="Sin borde"
          icon={<ImageIcon className="h-3.5 w-3.5" aria-hidden />}
          onClick={() => setImagePlaceholderRect(fullBleedRect)}
        />
      </div>
      <p className="text-brand-muted mt-2 text-xs">
        Sin borde: la foto cubre toda la tarjeta y el texto se imprime encima.
      </p>
    </section>
  );
}
