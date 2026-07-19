/*
 * Loading del Estudio (auditoría v3 · #15). El CTA insignia "Personalizar"/"Editar diseño" carga un
 * server component pesado (plantillas + assets) → sin este loading quedaba sin feedback. Next lo
 * muestra automáticamente mientras streamea. Mantiene el header para evitar layout shift.
 */

import { Loader2 } from "lucide-react";
import { SiteHeader } from "@/components/site-header";

export default function Loading() {
  return (
    <div className="bg-brand-cream flex min-h-screen flex-col">
      <SiteHeader />
      <main className="flex flex-1 flex-col items-center justify-center gap-4 px-6 py-16 text-center">
        <Loader2 className="text-brand-purple h-10 w-10 animate-spin" />
        <div>
          <p className="text-brand-purple-dark text-lg font-bold">Abriendo tu Estudio…</p>
          <p className="text-brand-muted mt-1 text-sm">
            Estamos preparando tu lienzo para personalizar 🦝
          </p>
        </div>
      </main>
    </div>
  );
}
