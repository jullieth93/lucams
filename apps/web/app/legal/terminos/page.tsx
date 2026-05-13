import type { Metadata } from "next";
import { CmsMarkdown } from "@/components/cms/cms-markdown";
import { LegalPageHeader } from "@/components/legal/legal-page-header";

export const metadata: Metadata = {
  title: "Términos y Condiciones",
};

const FALLBACK = `Al usar **lucamsshop.co** aceptas estos Términos y Condiciones. Productos sujetos a la legislación colombiana, en particular la **Ley 1480 de 2011** (Estatuto del Consumidor).

Documento en revisión legal — versión final próximamente.`;

export default function Page() {
  return (
    <>
      <LegalPageHeader blockKey="legal.terminos.heading" defaultTitle="Términos y Condiciones" />
      <CmsMarkdown blockKey="legal.terminos" fallback={FALLBACK} className="mt-6" />
    </>
  );
}
