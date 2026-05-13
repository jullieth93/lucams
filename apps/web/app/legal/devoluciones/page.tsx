import type { Metadata } from "next";
import { CmsMarkdown } from "@/components/cms/cms-markdown";

export const metadata: Metadata = {
  title: "Devoluciones y Retracto",
};

const FALLBACK = `## Derecho de retracto (Ley 1480 art. 47)

Tienes **5 días hábiles** desde la entrega para retractarte sin justificación, EXCEPTO en productos personalizados.

Escríbenos a **hola@lucamsshop.co** o por WhatsApp dentro de los 5 días hábiles.`;

export default function Page() {
  return (
    <>
      <h1 className="font-display text-brand-purple-dark text-3xl sm:text-4xl">
        Devoluciones y Retracto
      </h1>
      <p className="text-brand-purple-dark/60 mt-2 text-sm">
        Última actualización: 2026-05-12 · Versión v1
      </p>
      <CmsMarkdown blockKey="legal.devoluciones" fallback={FALLBACK} className="mt-6" />
    </>
  );
}
