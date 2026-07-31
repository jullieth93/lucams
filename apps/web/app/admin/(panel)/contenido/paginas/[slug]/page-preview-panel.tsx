"use client";

/*
 * <PagePreviewPanel> — vista previa en vivo junto al editor de página
 * (roadmap C1). Un iframe de la página PÚBLICA (CmsPage.path) empotrado al
 * lado del editor, para ver el resultado sin cambiar de pestaña.
 *
 * Recarga automática: guardar/publicar/despublicar un campo dispara una
 * Server Action que (1) invalida el caché "cms" y (2) re-renderiza esta
 * página admin con un `refreshSignal` nuevo (max updatedAt de los campos) —
 * el efecto de abajo recarga el iframe, que ya trae el contenido fresco.
 * También hay recarga manual y abrir-en-pestaña. El framing same-origin está
 * permitido por X-Frame-Options: SAMEORIGIN + frame-ancestors 'self' (ver
 * lib/security-headers.ts); sitios externos siguen sin poder enmarcarnos.
 *
 * La vista previa muestra lo PUBLICADO: un borrador guardado se ve en el
 * iframe solo después de Publicar.
 */

import { useEffect, useRef, useState } from "react";
import { ExternalLink, Eye, EyeOff, RotateCw } from "lucide-react";
import { Button } from "@/components/ui/button";

export function PagePreviewPanel({
  path,
  refreshSignal,
}: {
  /** Ruta pública de la página (CmsPage.path), ej. "/" o "/contacto". */
  path: string;
  /** Cambia cuando el servidor re-renderiza tras guardar/publicar. */
  refreshSignal: string;
}) {
  const [open, setOpen] = useState(true);
  const [reloadKey, setReloadKey] = useState(0);
  const firstRender = useRef(true);

  // Recarga el iframe cuando cambia la señal (post guardar/publicar). El
  // primer render se salta: el iframe ya carga fresco al montarse.
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    setReloadKey((k) => k + 1);
  }, [refreshSignal]);

  return (
    <aside className="border-brand-purple/15 self-start rounded-xl border bg-white shadow-sm xl:sticky xl:top-6">
      <div className="border-brand-purple/10 flex flex-wrap items-center justify-between gap-2 border-b px-4 py-2.5">
        <div className="min-w-0">
          <p className="text-brand-purple-dark text-sm font-semibold">Vista previa en vivo</p>
          <p className="text-brand-muted truncate text-xs">
            {path} · muestra lo <b>publicado</b> · se recarga sola al guardar o publicar
          </p>
        </div>
        <div className="flex items-center gap-1">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setReloadKey((k) => k + 1)}
            className="text-brand-purple-dark hover:bg-brand-purple/10 h-8 w-8 p-0"
            title="Recargar la vista previa"
            aria-label="Recargar la vista previa"
          >
            <RotateCw className="h-4 w-4" />
          </Button>
          <a
            href={path}
            target="_blank"
            rel="noopener noreferrer"
            className="text-brand-purple-dark hover:bg-brand-purple/10 inline-flex h-8 w-8 items-center justify-center rounded-md transition-colors"
            title="Abrir la página en otra pestaña"
            aria-label="Abrir la página en otra pestaña"
          >
            <ExternalLink className="h-4 w-4" />
          </a>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setOpen((v) => !v)}
            className="text-brand-purple-dark hover:bg-brand-purple/10 h-8 w-8 p-0"
            title={open ? "Ocultar la vista previa" : "Mostrar la vista previa"}
            aria-label={open ? "Ocultar la vista previa" : "Mostrar la vista previa"}
          >
            {open ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </Button>
        </div>
      </div>
      {open && (
        <iframe
          key={reloadKey}
          src={path}
          title={`Vista previa de la página pública ${path}`}
          className="h-[70vh] w-full rounded-b-xl bg-white"
        />
      )}
    </aside>
  );
}
