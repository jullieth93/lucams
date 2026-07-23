"use client";

/*
 * StudioMessageField — Ola 3c (Lucy 2026-07-22, 2ª queja del texto).
 *
 * "No deja modificar texto" (Polaroid Clásica): la edición dependía 100% de tocar
 * el texto EXACTO en el canvas Konva (hit-area chica, doble-panel táctil). UX
 * elegida: un CAMPO DE TEXTO en la sidebar como vía principal (simple y robusta)
 * + el click/tap sobre el texto del canvas queda como atajo (abre el modal con
 * fuente/color/tamaño).
 *
 * Regla de presentación: solo se muestra cuando la plantilla tiene EXACTAMENTE
 * UNA capa de texto editable (Polaroid Clásica: "message"). Con varias (Instagram:
 * usuario/likes/título/hashtags) un solo campo sería ambiguo → esas se editan
 * tocando cada texto en el canvas.
 *
 * El mensaje es PACK-LEVEL: escribe el override en TODOS los slots (la misma
 * frase va impresa en cada imán del pack). Vaciar el campo = volver al texto
 * base de la plantilla.
 */

import { useStore } from "zustand";
import type { StoreApi } from "zustand";
import { MessageSquareHeart } from "lucide-react";
import type { StudioStoreState } from "./lib/store";

export function StudioMessageField({ store }: { store: StoreApi<StudioStoreState> }) {
  // Selectores atómicos: el layer editable (JSON estable) y el override vigente.
  const layerJson = useStore(store, (s) => {
    const layers = s.canvasData?.unitTemplate?.layers ?? [];
    const editable = layers.filter(
      (l) => l.type === "text" && (l as { editable?: boolean }).editable === true,
    );
    return editable.length === 1 ? JSON.stringify(editable[0]) : null;
  });
  const layerId = layerJson ? (JSON.parse(layerJson) as { id: string }).id : null;
  const baseText = layerJson ? ((JSON.parse(layerJson) as { text?: string }).text ?? "") : "";
  const currentText = useStore(store, (s) => {
    if (!layerId || !s.canvasData) return null;
    for (const slot of s.canvasData.slots) {
      const t = slot.textOverrides?.[layerId]?.text;
      if (typeof t === "string") return t;
    }
    return null;
  });
  const setTextOverrideAllSlots = useStore(store, (s) => s.setTextOverrideAllSlots);

  if (!layerId) return null;
  const value = currentText ?? baseText;

  return (
    <section aria-labelledby="sidebar-mensaje" className="border-brand-purple/10 border-t pt-5">
      <label
        htmlFor="studio-message-input"
        id="sidebar-mensaje"
        className="text-brand-purple-dark mb-3 flex items-center gap-2 text-sm font-semibold"
      >
        <MessageSquareHeart className="text-brand-purple h-4 w-4" />
        Tu mensaje
      </label>
      <input
        id="studio-message-input"
        type="text"
        value={value}
        maxLength={120}
        placeholder="Escribe tu mensaje"
        onChange={(e) => {
          const text = e.target.value;
          // Vacío o igual al base → limpiar overrides (vuelve el texto de la plantilla).
          setTextOverrideAllSlots(
            layerId,
            text === baseText || text.trim() === "" ? null : { text },
          );
        }}
        className="border-brand-purple/15 text-brand-purple-dark focus:border-brand-turquoise focus:ring-brand-turquoise/30 w-full rounded-md border px-3 py-2 text-sm transition-colors focus:ring-2 focus:outline-none"
      />
      <p className="text-brand-muted mt-2 text-xs">
        Se imprime en la franja de cada foto. Para cambiar fuente o color, toca el texto en la
        imagen.
      </p>
    </section>
  );
}
