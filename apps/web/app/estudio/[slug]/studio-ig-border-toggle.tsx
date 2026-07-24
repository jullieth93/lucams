"use client";

/*
 * StudioIgBorderToggle — Ola 3c (Lucy 2026-07-22).
 *
 * Polaroid Instagram: "con borde o sin borde, y ya está la otra plantilla (clásica)
 * para el color". La plantilla Instagram trae su chrome propio (ig_post_3x4.svg:
 * cabecera + íconos) y NO usa el marco de color — la única decisión visual es la
 * foto:
 *
 *   - Con borde (default): la ventana del seed (25,88 → 400×400 en stage 450×600)
 *     deja la franja blanca lateral estándar de un post de Instagram.
 *   - Sin borde: la foto crece A SANGRE lateral (0,88 → 450×412), quedando detrás
 *     del chrome (cabecera arriba, íconos/textos abajo) como un post borderless.
 *
 * Implementación: el toggle reescribe la GEOMETRÍA del image-placeholder en
 * canvasData.unitTemplate (store.setImagePlaceholderRect) → viaja con el diseño
 * y producción la dibuja igual (WYSIWYG automático, sin flags extra).
 *
 * Solo se muestra cuando la plantilla activa es la Instagram (asset ig_post).
 */

import { useStore } from "zustand";
import type { StoreApi } from "zustand";
import { Frame, Image as ImageIcon } from "lucide-react";
import type { StudioStoreState } from "./lib/store";

// Geometría "sin borde" del diseño 450×600 (ventana del SVG: cabecera hasta y=58,
// íconos desde y=468). Se escala proporcionalmente si el stage difiere.
const IG_BASE_STAGE = { width: 450, height: 600 };
const IG_FULL_BLEED = { x: 0, y: 58, width: 450, height: 410 };

function IgBorderOption({
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

export function StudioIgBorderToggle({ store }: { store: StoreApi<StudioStoreState> }) {
  const isIgTemplate = useStore(store, (s) =>
    (s.canvasData?.unitTemplate?.layers ?? []).some(
      (l) =>
        l.type === "asset" &&
        typeof (l as { src?: unknown }).src === "string" &&
        (l as { src: string }).src.includes("ig_post"),
    ),
  );
  const stageW = useStore(store, (s) => s.canvasData?.unitTemplate?.stage?.width ?? 0);
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

  if (!isIgTemplate || !stageW || !photoWidth) return null;
  const isFullBleed = photoWidth >= stageW;
  const scale = stageW / IG_BASE_STAGE.width;
  const fullBleedRect = {
    x: IG_FULL_BLEED.x,
    y: Math.round(IG_FULL_BLEED.y * scale),
    width: stageW,
    height: Math.round(IG_FULL_BLEED.height * scale),
  };
  const baseRect = baseRectJson
    ? (JSON.parse(baseRectJson) as { x: number; y: number; width: number; height: number })
    : null;

  return (
    <section aria-labelledby="sidebar-ig-borde" className="border-brand-purple/10 border-t pt-5">
      <div
        id="sidebar-ig-borde"
        className="text-brand-purple-dark mb-3 flex items-center gap-2 text-sm font-semibold"
      >
        <Frame className="text-brand-purple h-4 w-4" />
        Foto del post
      </div>
      <div
        role="radiogroup"
        aria-label="Foto con o sin borde"
        className="ring-brand-purple/15 flex gap-1 rounded-lg p-1 ring-1"
      >
        <IgBorderOption
          active={!isFullBleed}
          label="Con borde"
          icon={<Frame className="h-3.5 w-3.5" aria-hidden />}
          onClick={() => baseRect && setImagePlaceholderRect(baseRect)}
        />
        <IgBorderOption
          active={isFullBleed}
          label="Sin borde"
          icon={<ImageIcon className="h-3.5 w-3.5" aria-hidden />}
          onClick={() => setImagePlaceholderRect(fullBleedRect)}
        />
      </div>
      <p className="text-brand-muted mt-2 text-xs">
        Sin borde: la foto llega hasta los bordes, como un post de Instagram a sangre.
      </p>
    </section>
  );
}
