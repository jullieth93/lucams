import type { Metadata } from "next";
import { CmsMarkdown } from "@/components/cms/cms-markdown";
import { LegalPageHeader } from "@/components/legal/legal-page-header";

export const metadata: Metadata = {
  title: "Devoluciones y Retracto",
};

const FALLBACK = `## Derecho de retracto (Ley 1480 art. 47)

Tienes **5 días hábiles** desde la entrega para retractarte sin justificación, EXCEPTO en productos personalizados.

Escríbenos a **hola@lucamsshop.co** o por WhatsApp dentro de los 5 días hábiles.`;

export default function Page() {
  return (
    <>
      <LegalPageHeader
        blockKey="legal.devoluciones.heading"
        defaultTitle="Devoluciones y Retracto"
      />
      <CmsMarkdown blockKey="legal.devoluciones" fallback={FALLBACK} className="mt-6" />
    </>
  );
}
