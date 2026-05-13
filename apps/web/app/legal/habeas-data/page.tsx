import type { Metadata } from "next";
import { CmsMarkdown } from "@/components/cms/cms-markdown";

export const metadata: Metadata = {
  title: "Hábeas Data",
};

const FALLBACK = `Como titular de datos personales, conforme a la **Ley 1581 de 2012** tienes los siguientes derechos sobre la información que Lucams_shop ha recolectado de ti.

## Tus derechos

- **Acceso:** conocer qué datos tuyos tenemos.
- **Rectificación:** corregir datos inexactos o desactualizados.
- **Actualización:** agregar información faltante.
- **Supresión:** eliminar datos cuando no haya base legal para conservarlos.
- **Revocación de la autorización:** retirar tu consentimiento en cualquier momento (newsletter, marketing, etc.).
- **Reclamo ante la SIC:** si consideras que vulneramos tus derechos puedes presentar queja ante la Superintendencia de Industria y Comercio.

## Cómo ejercer tus derechos

Escríbenos a **hola@lucamsshop.co** indicando:

1. Tu nombre completo y documento de identidad
2. Email con el que te registraste
3. El derecho que deseas ejercer
4. Una breve descripción de tu solicitud

Tenemos hasta **10 días hábiles** para responder consultas y **15 días hábiles** para reclamos. Si necesitamos más tiempo te avisaremos.

## Reclamo ante la SIC

Si no estás conforme con nuestra respuesta puedes acudir a la Superintendencia de Industria y Comercio: [sic.gov.co](https://www.sic.gov.co).`;

export default function Page() {
  return (
    <>
      <h1 className="font-display text-brand-purple-dark text-3xl sm:text-4xl">Hábeas Data</h1>
      <p className="text-brand-purple-dark/60 mt-2 text-sm">
        Última actualización: 2026-05-12 · Versión v1
      </p>
      <CmsMarkdown blockKey="legal.habeas-data" fallback={FALLBACK} className="mt-6" />
    </>
  );
}
