import type { Metadata } from "next";
import { CmsMarkdown } from "@/components/cms/cms-markdown";
import { LegalPageHeader } from "@/components/legal/legal-page-header";

export const metadata: Metadata = {
  title: "Devoluciones y Retracto",
};

// P0-007 (Bloque B 2026-06-27) — texto verificado contra Ley 1480 art. 47 +
// Ley 2439 de 2024. El retracto sigue siendo 5 días hábiles; lo que la Ley 2439
// cambió es el plazo de reembolso para comercio electrónico: de 30 días hábiles
// a 15 días CALENDARIO desde que ejerces el retracto. Ver memoria
// reference_retracto_ley_2439_2024 + docs/COMPLIANCE.md.
const FALLBACK = `## Derecho de retracto

Según la Ley 1480 de 2011 (artículo 47), tienes **5 días hábiles** contados desde
la entrega del producto para retractarte de tu compra **sin necesidad de
justificación**.

### ¿Qué productos tienen retracto?

- ✅ **Productos del catálogo estándar** (imanes y diseños pre-armados sin
  personalización tuya): sí aplican retracto.
- ❌ **Productos personalizados en el Estudio** (con tu foto o tu texto): la ley
  los exceptúa, porque son confeccionados según tus especificaciones (art. 47).

### ¿Cómo lo ejerces?

1. Escríbenos a **hola@lucamsshop.co** o por WhatsApp dentro de los **5 días
   hábiles** siguientes a la entrega.
2. Devuelve el producto en las mismas condiciones en que lo recibiste.
3. Indícanos los datos para hacerte el reembolso.

### Reembolso

Una vez ejerces el retracto y cumples con devolver el producto, te devolvemos el
dinero en un plazo máximo de **15 días calendario** (Ley 2439 de 2024), contados
desde el momento en que ejerciste el retracto.

> Los costos de envío de la devolución corren por tu cuenta, salvo que el producto
> haya llegado defectuoso o equivocado (en ese caso, ver Garantías).`;

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
