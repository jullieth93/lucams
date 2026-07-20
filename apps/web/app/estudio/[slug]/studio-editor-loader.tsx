"use client";

/*
 * Frontera CLIENTE para cargar el Estudio con `ssr: false`.
 *
 * POR QUÉ EXISTE (ADR-073 — build roto de /_global-error):
 *   StudioEditor arrastra react-konva (react-reconciler). Ese módulo, al EVALUARSE en el build del
 *   servidor, corrompe las internals de React (dispatcher null) y rompe el prerender de la ruta
 *   interna /_global-error de Next (`Cannot read properties of null (reading 'useContext')`) → build
 *   y deploys de Vercel fallando.
 *   `dynamic(ssr: false)` NO se permite dentro de un Server Component, así que la página `page.tsx`
 *   (server) hacía `dynamic()` SIN ssr:false → StudioEditor se renderizaba en el servidor pese a que
 *   la intención SIEMPRE fue client-only ("Konva requiere window"). Este wrapper cliente restaura esa
 *   intención: react-konva queda fuera del bundle del servidor.
 *
 * Verificado con un repro mínimo: react-konva en el servidor → build falla; tras esta frontera → build OK.
 */

import nextDynamic from "next/dynamic";
import type { StudioEditorProps } from "./studio-editor";

const StudioEditor = nextDynamic(
  () => import("./studio-editor").then((mod) => ({ default: mod.StudioEditor })),
  {
    ssr: false,
    loading: () => (
      <div className="flex flex-1 items-center justify-center p-12">
        <div className="text-brand-muted flex items-center gap-3">
          <div className="border-brand-purple/30 border-t-brand-purple h-6 w-6 animate-spin rounded-full border-2" />
          <span>Cargando estudio...</span>
        </div>
      </div>
    ),
  },
);

export function StudioEditorLoader(props: StudioEditorProps) {
  return <StudioEditor {...props} />;
}
