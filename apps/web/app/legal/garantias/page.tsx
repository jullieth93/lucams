import type { Metadata } from "next";
import { CmsMarkdown } from "@/components/cms/cms-markdown";
import { LegalPageHeader } from "@/components/legal/legal-page-header";

export const metadata: Metadata = {
  title: "Garantías",
};

const FALLBACK = `## Garantía legal (Ley 1480 art. 11)

Todos los productos Lucams_shop tienen garantía legal de **1 año** desde la fecha de entrega para defectos de fabricación, materiales o funcionamiento.

Escribe a **hola@lucamsshop.co** con tu número de pedido y fotos del defecto.`;

export default function Page() {
  return (
    <>
      <LegalPageHeader blockKey="legal.garantias.heading" defaultTitle="Garantías" />
      <CmsMarkdown blockKey="legal.garantias" fallback={FALLBACK} className="mt-6" />
    </>
  );
}
