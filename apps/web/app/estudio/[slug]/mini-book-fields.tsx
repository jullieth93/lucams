"use client";

import { useId } from "react";
import { useStore } from "zustand";
import type { StoreApi } from "zustand";
import { BookOpenText } from "lucide-react";
import type { StudioStoreState } from "./lib/store";

export function MiniBookFields({ store }: { store: StoreApi<StudioStoreState> }) {
  const id = useId();
  const assisted = useStore(store, (s) => {
    const layers = s.canvasData?.unitTemplate.layers ?? [];
    return (
      layers.some((layer) => layer.type === "text" && layer.id === "title") &&
      layers.some((layer) => layer.type === "text" && layer.id === "spine_title")
    );
  });
  const slotIndex = useStore(store, (s) => s.selectedSlotIndex ?? 0);
  const unitCount = useStore(store, (s) => s.canvasData?.unitCount ?? 1);
  const slot = useStore(store, (s) =>
    s.canvasData?.slots.find((candidate) => candidate.slotIndex === slotIndex),
  );
  const setOverrides = useStore(store, (s) => s.setSlotTextOverrides);
  if (!assisted || !slot) return null;

  const title = slot.textOverrides?.title?.text ?? "";
  const author = slot.textOverrides?.author?.text ?? "";
  const backMessage = slot.textOverrides?.back_message?.text ?? "";
  const setText = (layerId: string, value: string) => {
    const override = value.trim() ? { text: value } : null;
    if (layerId === "title") {
      setOverrides(slotIndex, { title: override, spine_title: override });
    } else {
      setOverrides(slotIndex, { [layerId]: override });
    }
  };

  return (
    <section aria-labelledby={`${id}-heading`} className="border-brand-purple/10 border-t pt-5">
      <div className="mb-3 flex items-start gap-2">
        <BookOpenText className="text-brand-purple mt-0.5 h-4 w-4 shrink-0" aria-hidden />
        <div>
          <h3 id={`${id}-heading`} className="text-brand-purple-dark text-sm font-semibold">
            Datos de tu mini libro
          </h3>
          <p className="text-brand-muted mt-0.5 text-xs">
            Unidad {slotIndex + 1} de {unitCount}. El título coordina portada y lomo.
          </p>
        </div>
      </div>
      <div className="space-y-3">
        <div>
          <label
            htmlFor={`${id}-title`}
            className="text-brand-purple-dark mb-1 block text-xs font-semibold"
          >
            Título
          </label>
          <input
            id={`${id}-title`}
            type="text"
            value={title}
            maxLength={60}
            placeholder="Ej. Nuestra historia"
            onChange={(event) => setText("title", event.target.value)}
            className="border-brand-purple/15 text-brand-purple-dark focus:border-brand-turquoise focus:ring-brand-turquoise/30 w-full rounded-md border px-3 py-2 text-sm focus:ring-2 focus:outline-none"
          />
        </div>
        <div>
          <label
            htmlFor={`${id}-author`}
            className="text-brand-purple-dark mb-1 block text-xs font-semibold"
          >
            Autor o dedicatoria corta
          </label>
          <input
            id={`${id}-author`}
            type="text"
            value={author}
            maxLength={60}
            placeholder="Ej. Con amor, Lucía"
            onChange={(event) => setText("author", event.target.value)}
            className="border-brand-purple/15 text-brand-purple-dark focus:border-brand-turquoise focus:ring-brand-turquoise/30 w-full rounded-md border px-3 py-2 text-sm focus:ring-2 focus:outline-none"
          />
        </div>
        <div>
          <label
            htmlFor={`${id}-back`}
            className="text-brand-purple-dark mb-1 block text-xs font-semibold"
          >
            Mensaje para la contraportada
          </label>
          <textarea
            id={`${id}-back`}
            value={backMessage}
            maxLength={300}
            rows={3}
            placeholder="Escribe una dedicatoria para quien recibirá este mini libro"
            onChange={(event) => setText("back_message", event.target.value)}
            className="border-brand-purple/15 text-brand-purple-dark focus:border-brand-turquoise focus:ring-brand-turquoise/30 w-full resize-y rounded-md border px-3 py-2 text-sm focus:ring-2 focus:outline-none"
          />
        </div>
      </div>
      <p className="text-brand-muted mt-2 text-xs leading-relaxed">
        La foto se ajusta solo en la portada. No necesitas alinear las tres zonas manualmente.
      </p>
    </section>
  );
}
