"use client";

/*
 * <EditModeWelcome> — onboarding tip que aparece la primera vez que
 * Lucy activa el modo edición. Persiste en localStorage que ya lo
 * vio para no volver a mostrarlo.
 *
 * Diseño: card flotante centrada inferior con flecha apuntando al
 * borde editable. Cierra con click "Entendido ✨" o tras 12s
 * automático.
 */

import { useEffect, useState } from "react";
import { Sparkles, X } from "lucide-react";

const SEEN_KEY = "lucams_edit_mode_onboarding_seen";

export function EditModeWelcome() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (localStorage.getItem(SEEN_KEY) !== "1") {
      queueMicrotask(() => setShow(true));
    }
  }, []);

  useEffect(() => {
    if (!show) return;
    const t = setTimeout(() => {
      localStorage.setItem(SEEN_KEY, "1");
      setShow(false);
    }, 12_000);
    return () => clearTimeout(t);
  }, [show]);

  function dismiss() {
    localStorage.setItem(SEEN_KEY, "1");
    setShow(false);
  }

  if (!show) return null;

  return (
    <div
      data-edit-mode-ui
      className="pointer-events-none fixed inset-x-0 bottom-24 z-[9999] flex justify-center px-4"
    >
      <div className="border-brand-purple/20 pointer-events-auto max-w-md rounded-2xl border bg-white p-5 shadow-2xl">
        <div className="flex items-start gap-3">
          <div className="bg-brand-purple/10 text-brand-purple flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full">
            <Sparkles className="size-5" />
          </div>
          <div className="flex-1">
            <h3 className="font-display text-brand-purple-dark text-base font-semibold">
              ¡Modo edición activo!
            </h3>
            <p className="text-brand-purple-dark/75 mt-1 text-sm leading-relaxed">
              Los textos editables ahora tienen un{" "}
              <span className="bg-brand-purple inline-flex h-4 w-4 items-center justify-center rounded-full text-[10px] text-white">
                ✏
              </span>{" "}
              y un borde punteado. Hacé click en cualquiera para editarlo y publicar al instante.
            </p>
            <p className="text-brand-purple-dark/55 mt-2 text-xs">
              Tip: si no ves el lapicito sobre algún texto, es porque ese contenido se gestiona
              desde otro lado (ej. productos en <span className="font-mono">/admin/productos</span>
              ).
            </p>
            <button
              type="button"
              onClick={dismiss}
              className="bg-brand-purple hover:bg-brand-purple-dark mt-3 inline-flex items-center gap-1 rounded-full px-4 py-1.5 text-xs font-semibold text-white"
            >
              Entendido ✨
            </button>
          </div>
          <button
            type="button"
            onClick={dismiss}
            className="rounded-full p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
            aria-label="Cerrar"
          >
            <X className="size-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
