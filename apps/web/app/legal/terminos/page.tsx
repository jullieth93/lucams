import type { Metadata } from "next";
import { CmsMarkdown } from "@/components/cms/cms-markdown";

export const metadata: Metadata = {
  title: "Términos y Condiciones",
};

const FALLBACK = `Al usar **lucamsshop.co** aceptas estos Términos y Condiciones. Productos sujetos a la legislación colombiana, en particular la **Ley 1480 de 2011** (Estatuto del Consumidor).

Documento en revisión legal — versión final próximamente.`;

export default function Page() {
  return (
    <>
      <h1 className="font-display text-brand-purple-dark text-3xl sm:text-4xl">
        Términos y Condiciones
      </h1>
      <p className="text-brand-purple-dark/60 mt-2 text-sm">
        Última actualización: 2026-05-12 · Versión v1
      </p>
      <CmsMarkdown blockKey="legal.terminos" fallback={FALLBACK} className="mt-6" />
    </>
  );
}
