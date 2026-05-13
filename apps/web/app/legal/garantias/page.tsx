import type { Metadata } from "next";
import { CmsMarkdown } from "@/components/cms/cms-markdown";

export const metadata: Metadata = {
  title: "Garantías",
};

const FALLBACK = `## Garantía legal (Ley 1480 art. 11)

Todos los productos Lucams_shop tienen garantía legal de **1 año** desde la fecha de entrega para defectos de fabricación, materiales o funcionamiento.

Escribe a **hola@lucamsshop.co** con tu número de pedido y fotos del defecto.`;

export default function Page() {
  return (
    <>
      <h1 className="font-display text-brand-purple-dark text-3xl sm:text-4xl">Garantías</h1>
      <p className="text-brand-purple-dark/60 mt-2 text-sm">
        Última actualización: 2026-05-12 · Versión v1
      </p>
      <CmsMarkdown blockKey="legal.garantias" fallback={FALLBACK} className="mt-6" />
    </>
  );
}
