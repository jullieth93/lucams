import type { Metadata } from "next";
import { CmsMarkdown } from "@/components/cms/cms-markdown";
import { LegalPageHeader } from "@/components/legal/legal-page-header";

export const metadata: Metadata = {
  title: "Política de Cookies",
};

const FALLBACK = `Usamos cookies para que el sitio funcione (autenticación, carrito) y para mejorar tu experiencia.

Detallamos cada cookie y su propósito en cumplimiento de la **Ley 1581 de 2012**.`;

export default function Page() {
  return (
    <>
      <LegalPageHeader blockKey="legal.cookies.heading" defaultTitle="Política de Cookies" />
      <CmsMarkdown blockKey="legal.cookies" fallback={FALLBACK} className="mt-6" />
    </>
  );
}
