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
const FALLBACK = `
## Devoluciones y Retracto

En **Lucams_shop** queremos que ames lo que recibes. Aquí te contamos, en cristiano, cómo funciona el **derecho de retracto**, cuándo puedes devolver un producto y cómo te regresamos tu dinero. Nuestro mapache está pendiente de que todo salga bien.

> Esta política aplica a compras hechas en **lucamsshop.com**. Para defectos de fabricación revisa además nuestra [Política de Garantía](/legal/garantias).

## Tu derecho de retracto

De acuerdo con la **Ley 1480 de 2011 (art. 47)**, tienes **5 días hábiles** contados desde la entrega del producto para **retractarte de tu compra sin darnos ninguna justificación**. Es tu derecho y lo respetamos.

## ¿Qué productos tienen retracto?

| Producto | ¿Aplica retracto? |
| --- | --- |
| **Catálogo estándar** (imanes y diseños pre-armados, sin personalización tuya) | ✅ **Sí** — 5 días hábiles desde la entrega |
| **Productos del Estudio de Personalización** (con tu foto o tu texto) | ❌ **No** — la ley los exceptúa |
| **Combos del catálogo estándar** | ✅ **Sí** |
| **Combos que incluyen al menos un producto personalizado** | ❌ **No** |

Los productos personalizados quedan por fuera del retracto porque la ley exceptúa los bienes _"confeccionados conforme a las especificaciones del consumidor o claramente personalizados"_ (Ley 1480, art. 47). Como los hacemos con tu foto o tu texto, no podemos revenderlos: por eso no tienen retracto. Esto también te lo avisamos en la página de cada producto antes de comprar.

## ¿Cómo ejerces el retracto?

Es sencillo, y estamos para ayudarte en cada paso:

1. **Escríbenos dentro de los 5 días hábiles** siguientes a la entrega, a **retracto@lucamsshop.com** o por **WhatsApp**. Cuéntanos tu número de pedido.
2. Te confirmamos que tu retracto aplica y te damos las instrucciones para la **devolución del producto**.
3. **Devuelves el producto** en las mismas condiciones en que lo recibiste (sin uso, con su empaque original y lo que venía incluido).
4. Nos indicas los datos para hacerte el **reembolso**.
5. Cuando recibimos el producto de vuelta te confirmamos; el **reembolso** se hace dentro del plazo legal (máximo **15 días calendario** contados **desde que ejerciste el retracto**, como se explica más abajo).

## ¿Quién paga el envío de la devolución?

Cuando te retractas (o sea, cambiaste de opinión, sin que el producto tenga ningún problema), **el costo del envío de la devolución corre por tu cuenta**. Es la condición para ejercer el retracto: el producto debe regresar a nosotros.

**Importante:** si el producto te llegó **defectuoso, dañado o equivocado**, eso **no es un retracto sino una garantía**, y ahí el costo **no lo asumes tú**. Escríbenos igual y lo resolvemos por [Garantías](/legal/garantias).

## Tu reembolso

Una vez ejerces el retracto y devuelves el producto, te regresamos **todo el dinero que pagaste**, en un plazo máximo de **15 días calendario** contados **desde el día en que ejerciste el retracto** (Ley 1480, art. 47, modificado por la **Ley 2439 de 2024**).

- Si pagaste con **tarjeta, PSE o botón de pago**, el reembolso se hace al **mismo medio de pago**.
- Si pagaste **contraentrega (en efectivo)**, el reembolso se hace por **transferencia bancaria** a la cuenta que nos indiques.

## Reversión del pago

Si pagaste con **medios electrónicos** (tarjeta, PSE, botón de pago), la **Ley 1480 (art. 51)** te da además el derecho a solicitar la **reversión del pago** cuando:

- fuiste víctima de **fraude**,
- la compra corresponde a una **operación no solicitada**,
- el producto **no fue recibido**,
- el producto entregado **no corresponde** a lo que pediste, o
- el producto resultó **defectuoso**.

Para pedirla, avísanos a **retracto@lucamsshop.com** (o al canal de contacto) y solicita la reversión ante la entidad que emitió tu medio de pago. La reversión debe atenderse dentro de los **21 días calendario** siguientes a la solicitud.

## ¿Dudas?

Estamos para ayudarte. Escríbenos a **retracto@lucamsshop.com**, a **hola@lucamsshop.com** o por **WhatsApp**, y con gusto te acompañamos en el proceso. También puedes conocer más sobre tus derechos en la [Superintendencia de Industria y Comercio (SIC)](https://www.sic.gov.co).

---

_Versión 2 · vigente desde 2026-07-19 · en revisión por asesoría legal antes del lanzamiento_
`;

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
