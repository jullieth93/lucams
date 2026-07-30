/*
 * Loading del Estudio (auditoría v3 · #15). El CTA insignia "Personalizar"/"Editar diseño" carga un
 * server component pesado (plantillas + assets) → sin este loading quedaba sin feedback. Next lo
 * muestra automáticamente mientras streamea. Mantiene el header para evitar layout shift.
 *
 * Roadmap B1 — textos CMS (estudio.lienzo.loading-*) vía <CmsText> con fallback exacto pre-CMS.
 */

import { Loader2 } from "lucide-react";
import { SiteHeader } from "@/components/site-header";
import { CmsText } from "@/components/cms/cms-text";

export default function Loading() {
  return (
    <div className="bg-brand-cream flex min-h-screen flex-col">
      <SiteHeader />
      <main className="flex flex-1 flex-col items-center justify-center gap-4 px-6 py-16 text-center">
        <Loader2 className="text-brand-purple h-10 w-10 animate-spin" />
        <div>
          <p className="text-brand-purple-dark text-lg font-bold">
            <CmsText blockKey="estudio.lienzo.loading-titulo" fallback="Abriendo tu Estudio…" />
          </p>
          <p className="text-brand-muted mt-1 text-sm">
            <CmsText
              blockKey="estudio.lienzo.loading-subtitulo"
              fallback="Estamos preparando tu lienzo para personalizar 🦝"
            />
          </p>
        </div>
      </main>
    </div>
  );
}
