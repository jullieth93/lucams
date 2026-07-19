"use client";

/*
 * SceneGallery — galería inmersiva "míralo en tu espacio" para los FOTOIMANES (ADR-063 · FOTO4).
 * En vez de una barra con muchos botones (que se desborda en móvil), UN solo modal reúne todas las
 * escenas del hogar y el cliente cambia con chips:
 *   🧊 Nevera  — imanes en la nevera (3D)         · escena original P1.4
 *   🖼️ Mural   — imanes en un tablero de un cuarto (3D) · FOTO4-A (RoomBoardView3D, corcho)
 *   📚 Repisa  — piezas apoyadas en un estante (2D)     · FOTO4-B (compose-shelf-flatlay)
 *   🎁 Regalo  — la pieza como obsequio (2D)            · FOTO3 (compose-gift-flatlay)
 *
 * Las texturas por imán (recortadas a su silueta) se calculan UNA vez en el editor y se pasan acá;
 * las escenas 3D las usan directo y los compositores 2D se arman perezosamente al abrir su chip y se
 * cachean. Las vistas 3D se importan diferidas (WebGL, client-only).
 */

import { useEffect, useState } from "react";
import nextDynamic from "next/dynamic";
import { X } from "lucide-react";
import type { Magnet3D } from "./fridge-3d-view";
import { composeGiftFlatlay } from "./lib/compose-gift-flatlay";
import { composeShelfFlatlay } from "./lib/compose-shelf-flatlay";
import { useIsTouch } from "./use-is-touch";

const FridgeView3D = nextDynamic(() => import("./fridge-3d-view"), {
  ssr: false,
  loading: () => (
    <div className="text-brand-muted flex h-full items-center justify-center text-sm">
      Cargando la nevera 3D…
    </div>
  ),
});
const RoomBoardView3D = nextDynamic(() => import("./room-board-view-3d"), {
  ssr: false,
  loading: () => (
    <div className="text-brand-muted flex h-full items-center justify-center text-sm">
      Cargando tu tablero 3D…
    </div>
  ),
});

type Scene = "fridge" | "board" | "shelf" | "gift";

const SCENES: { key: Scene; label: string; emoji: string }[] = [
  { key: "fridge", label: "Nevera", emoji: "🧊" },
  { key: "board", label: "Mural", emoji: "🖼️" },
  { key: "shelf", label: "Repisa", emoji: "📚" },
  { key: "gift", label: "Regalo", emoji: "🎁" },
];

export function SceneGallery({
  magnets,
  cols,
  onClose,
}: {
  magnets: Magnet3D[];
  cols: number;
  onClose: () => void;
}) {
  const [scene, setScene] = useState<Scene>("fridge");
  const isTouch = useIsTouch(); // #9 — copy del gesto de zoom según táctil vs mouse.
  // Compositores 2D: se arman perezosamente al abrir su chip y se cachean.
  const [shelfUrl, setShelfUrl] = useState<string | null>(null);
  const [giftUrl, setGiftUrl] = useState<string | null>(null);
  const [building, setBuilding] = useState(false);
  // #18 — escenas cuyo compositor falló: mostramos un fallback claro en vez de un panel colgado.
  const [failed, setFailed] = useState<Record<Scene, boolean>>({
    fridge: false,
    board: false,
    shelf: false,
    gift: false,
  });

  // Cerrar con Escape (a11y).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  // Armar el compositor 2D de la escena activa (una sola vez por escena).
  useEffect(() => {
    let cancelled = false;
    const build = async () => {
      const need =
        (scene === "shelf" && shelfUrl === null) || (scene === "gift" && giftUrl === null);
      if (!need) return;
      setBuilding(true);
      if (!cancelled) setFailed((f) => (f[scene] ? { ...f, [scene]: false } : f)); // #18 limpiar al reintentar
      try {
        if (scene === "shelf") {
          const url = await composeShelfFlatlay(magnets);
          if (!cancelled) setShelfUrl(url);
        } else if (scene === "gift") {
          const url = await composeGiftFlatlay(magnets);
          if (!cancelled) setGiftUrl(url);
        }
      } catch {
        // #18 — marcar la escena como fallida (fallback visible) en vez de dejarla colgada en carga.
        // No rompemos el editor: el cliente puede cambiar de escena o reintentar.
        if (!cancelled) setFailed((f) => ({ ...f, [scene]: true }));
      } finally {
        if (!cancelled) setBuilding(false);
      }
    };
    void build();
    return () => {
      cancelled = true;
    };
  }, [scene, magnets, shelfUrl, giftUrl]);

  const is3D = scene === "fridge" || scene === "board";
  const flatUrl = scene === "shelf" ? shelfUrl : scene === "gift" ? giftUrl : null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Mira tu diseño en tu espacio"
      className="bg-brand-purple-dark/85 fixed inset-0 z-50 flex flex-col backdrop-blur-sm"
    >
      <div className="flex items-center justify-between px-4 py-3 text-white sm:px-6">
        <span className="font-display text-lg font-bold">✨ Míralo en tu espacio</span>
        <button
          type="button"
          onClick={onClose}
          aria-label="Cerrar"
          autoFocus
          className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-white/15 text-white transition-colors hover:bg-white/25 focus:ring-2 focus:ring-white focus:outline-none"
        >
          <X className="h-5 w-5" />
        </button>
      </div>

      {/* Chips de escena */}
      <div
        role="tablist"
        aria-label="Escenas"
        className="flex flex-wrap items-center justify-center gap-2 px-4 pb-2"
      >
        {SCENES.map((s) => {
          const active = s.key === scene;
          return (
            <button
              key={s.key}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => setScene(s.key)}
              className={`inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-sm font-bold transition-colors focus:ring-2 focus:ring-white focus:outline-none ${
                active
                  ? "text-brand-purple-dark bg-white shadow-md"
                  : "bg-white/15 text-white hover:bg-white/25"
              }`}
            >
              <span aria-hidden>{s.emoji}</span>
              <span>{s.label}</span>
            </button>
          );
        })}
      </div>

      <div className="relative flex-1">
        {is3D ? (
          scene === "fridge" ? (
            <FridgeView3D magnets={magnets} cols={cols} />
          ) : (
            <RoomBoardView3D magnets={magnets} cols={cols} style="cork" />
          )
        ) : building && !flatUrl ? (
          <div className="text-brand-cream/90 flex h-full items-center justify-center text-sm">
            Armando la escena…
          </div>
        ) : failed[scene] ? (
          <div className="text-brand-cream/90 flex h-full flex-col items-center justify-center gap-2 p-6 text-center text-sm">
            <p>No pudimos armar esta escena en este momento.</p>
            <p className="text-brand-cream/70 text-xs">Prueba otra escena o vuelve al editor.</p>
          </div>
        ) : flatUrl ? (
          <div className="flex h-full items-center justify-center p-4">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={flatUrl}
              alt={
                scene === "gift" ? "Tu diseño presentado como un regalo" : "Tu diseño en una repisa"
              }
              className="max-h-full max-w-full rounded-2xl object-contain shadow-2xl"
            />
          </div>
        ) : null}

        <p className="pointer-events-none absolute bottom-4 left-1/2 -translate-x-1/2 rounded-full bg-black/40 px-3 py-1.5 text-center text-xs text-white">
          {is3D
            ? isTouch
              ? "Arrastra para girar · pellizca con 2 dedos para acercar"
              : "Arrastra para girar · rueda o pellizca para acercar"
            : "Mantén presionada la imagen para guardarla o compartirla 💛"}
        </p>
      </div>
    </div>
  );
}
