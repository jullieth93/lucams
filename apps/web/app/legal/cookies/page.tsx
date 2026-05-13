import type { Metadata } from "next";
import { CmsMarkdown } from "@/components/cms/cms-markdown";

export const metadata: Metadata = {
  title: "Política de Cookies",
};

const FALLBACK = `Usamos cookies para que el sitio funcione (autenticación, carrito) y para mejorar tu experiencia.

Detallamos cada cookie y su propósito en cumplimiento de la **Ley 1581 de 2012**.`;

export default function Page() {
  return (
    <>
      <h1 className="font-display text-brand-purple-dark text-3xl sm:text-4xl">
        Política de Cookies
      </h1>
      <p className="text-brand-purple-dark/60 mt-2 text-sm">
        Última actualización: 2026-05-12 · Versión v1
      </p>
      <CmsMarkdown blockKey="legal.cookies" fallback={FALLBACK} className="mt-6" />
    </>
  );
}
