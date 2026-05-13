"use client";

/*
 * <EditOverlay> — handlers globales para hover + click sobre
 * elementos con data-cms-key (renderizados por <CmsMarkdown>,
 * <CmsText>, <CmsSetting>).
 *
 * Visual: outline punteado morado 2px + badge esquina con la key
 * + cursor pointer. Click → llama onSelect con la key, lo cual
 * abre el InlineEditor.
 *
 * Bloquea propagación de click para que links/botones del sitio
 * no se activen en modo edición. Pero respeta otros eventos
 * (hover, focus) para no romper la UI completa.
 *
 * Performance: solo monta listeners cuando edit mode está ON.
 * Throttling de mousemove via rAF (16ms ≈ 60fps).
 */

import { useEffect, useRef, useState } from "react";
import { Pencil } from "lucide-react";

type Highlight = {
  key: string;
  kind: "block" | "setting";
  rect: DOMRect;
} | null;

export function EditOverlay({ onSelect }: { onSelect: (key: string) => void }) {
  const [hover, setHover] = useState<Highlight>(null);
  const frameRef = useRef<number | null>(null);

  useEffect(() => {
    // Inject CSS para los elementos data-cms-key (cursor + ligero hover state)
    const styleEl = document.createElement("style");
    styleEl.id = "lucams-edit-overlay-styles";
    styleEl.textContent = `
      [data-cms-key] { cursor: pointer !important; }
      [data-cms-key]:hover { outline: 2px dashed #7c6aad; outline-offset: 4px; }
    `;
    document.head.appendChild(styleEl);

    return () => {
      styleEl.remove();
    };
  }, []);

  useEffect(() => {
    const handleMove = (e: MouseEvent) => {
      if (frameRef.current !== null) return;
      frameRef.current = requestAnimationFrame(() => {
        frameRef.current = null;
        const target = e.target as HTMLElement | null;
        if (!target) {
          setHover(null);
          return;
        }
        const el = target.closest<HTMLElement>("[data-cms-key]");
        if (!el) {
          setHover(null);
          return;
        }
        const key = el.getAttribute("data-cms-key");
        const kind = el.getAttribute("data-cms-kind") === "setting" ? "setting" : "block";
        if (!key) {
          setHover(null);
          return;
        }
        setHover({ key, kind, rect: el.getBoundingClientRect() });
      });
    };

    const handleClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement | null;
      // Si el click es sobre nuestra propia toolbar/modal lo dejamos pasar.
      if (target?.closest("[data-edit-mode-ui]")) return;
      const el = target?.closest<HTMLElement>("[data-cms-key]");
      if (!el) return;
      // Bloquear TODA propagación + navegación. stopImmediatePropagation
      // garantiza que React (que escucha en bubble) NO recibe el click,
      // por lo que Next.Link.onClick nunca dispara router.push.
      e.preventDefault();
      e.stopImmediatePropagation();
      e.stopPropagation();
      const key = el.getAttribute("data-cms-key");
      if (key) onSelect(key);
    };

    // Capture phase + window-level para correr antes que React (que
    // delega en root container) y antes que cualquier listener nativo.
    document.addEventListener("mousemove", handleMove, { passive: true });
    window.addEventListener("click", handleClick, { capture: true });

    return () => {
      document.removeEventListener("mousemove", handleMove);
      window.removeEventListener("click", handleClick, { capture: true } as EventListenerOptions);
      if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
    };
  }, [onSelect]);

  if (!hover) return null;

  // Badge flotante con la key + ícono — pinta encima del elemento.
  // Posicionado relativo al viewport (no se ve afectado por scroll después
  // del hover, pero como sigue mousemove, se redibuja en el próximo move).
  return (
    <div
      className="pointer-events-none fixed z-[9998]"
      style={{
        top: Math.max(hover.rect.top - 28, 4),
        left: hover.rect.left,
      }}
    >
      <span className="bg-brand-purple flex items-center gap-1 rounded-md px-2 py-1 font-mono text-[10px] font-medium text-white shadow-md">
        <Pencil className="size-3" />
        {hover.kind === "setting" ? "⚙ " : ""}
        {hover.key}
      </span>
    </div>
  );
}
