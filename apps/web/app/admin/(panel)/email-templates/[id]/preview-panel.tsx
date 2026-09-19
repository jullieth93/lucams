"use client";

/*
 * Panel de preview del detalle de plantilla (Fase 4 — feedback Lucy 2026-09-18).
 * Iframe contra la ruta HTML /admin/email-templates/[id]/preview (documento
 * propio → estilos del correo aislados del admin) con toggle de ancho
 * desktop (600px) / móvil (375px) y botón de recarga para ver los overrides
 * recién guardados sin refrescar la página.
 */

import { useState } from "react";
import { Monitor, Smartphone, RefreshCw } from "lucide-react";

const WIDTHS = {
  desktop: { label: "Desktop", px: 600, icon: Monitor },
  mobile: { label: "Móvil", px: 375, icon: Smartphone },
} as const;

type WidthKey = keyof typeof WIDTHS;

export function PreviewPanel({ src, title }: { src: string; title: string }) {
  const [width, setWidth] = useState<WidthKey>("desktop");
  // Al guardar un override el iframe NO se recarga solo (su src no cambia);
  // este contador lo remonta bajo demanda.
  const [reloads, setReloads] = useState(0);

  return (
    <div>
      <div className="mb-3 flex items-center gap-2">
        {(Object.keys(WIDTHS) as WidthKey[]).map((key) => {
          const { label, icon: Icon } = WIDTHS[key];
          const active = width === key;
          return (
            <button
              key={key}
              type="button"
              onClick={() => setWidth(key)}
              aria-pressed={active}
              className={`inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs font-semibold transition-colors ${
                active
                  ? "border-brand-purple bg-brand-purple/10 text-brand-purple-dark"
                  : "border-brand-purple/20 text-brand-purple-dark/60 hover:border-brand-purple/40"
              }`}
            >
              <Icon className="h-3.5 w-3.5" />
              {label} · {WIDTHS[key].px}px
            </button>
          );
        })}
        <button
          type="button"
          onClick={() => setReloads((n) => n + 1)}
          className="border-brand-purple/20 text-brand-purple-dark/60 hover:border-brand-purple/40 ml-auto inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs font-semibold transition-colors"
        >
          <RefreshCw className="h-3.5 w-3.5" />
          Recargar preview
        </button>
      </div>
      <div className="border-brand-purple/15 overflow-x-auto rounded-xl border bg-[#FFF8F0] p-4">
        <iframe
          key={reloads}
          title={title}
          src={src}
          sandbox=""
          style={{ width: WIDTHS[width].px, maxWidth: "100%", height: 640 }}
          className="mx-auto block rounded-lg bg-white shadow-sm"
        />
      </div>
      <p className="text-brand-muted mt-2 text-xs">
        Renderizado con datos de ejemplo. Si acabas de guardar un texto, toca «Recargar preview».
      </p>
    </div>
  );
}
