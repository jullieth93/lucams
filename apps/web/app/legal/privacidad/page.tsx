import type { Metadata } from "next";
import { CmsMarkdown } from "@/components/cms/cms-markdown";
import { LegalPageHeader } from "@/components/legal/legal-page-header";

export const metadata: Metadata = {
  title: "Aviso de Privacidad",
  description: "Política de tratamiento de datos personales · Ley 1581 de 2012 (Colombia).",
};

const FALLBACK = `En **Lucams_shop** nos tomamos en serio la protección de tus datos personales en cumplimiento de la **Ley 1581 de 2012** y el **Decreto 1377 de 2013** de Colombia.

Este es el aviso de privacidad versión 1. Estamos puliendo el documento final con asesoría legal.

Si tienes preguntas o quieres ejercer tus derechos como titular (acceso, rectificación, supresión, revocación), escríbenos a **hola@lucamsshop.co**.`;

export default function Page() {
  return (
    <>
      <LegalPageHeader blockKey="legal.privacidad.heading" defaultTitle="Aviso de Privacidad" />
      <CmsMarkdown blockKey="legal.privacidad" fallback={FALLBACK} className="mt-6" />
    </>
  );
}
