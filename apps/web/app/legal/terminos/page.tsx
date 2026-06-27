import type { Metadata } from "next";
import { CmsMarkdown } from "@/components/cms/cms-markdown";
import { LegalPageHeader } from "@/components/legal/legal-page-header";

export const metadata: Metadata = {
  title: "Términos y Condiciones",
};

// P0-006 (Bloque B 2026-06-27) — texto sustantivo basado en las obligaciones de
// información del art. 23 y ss. de la Ley 1480 de 2011 (Estatuto del Consumidor),
// documentadas en docs/COMPLIANCE.md. Sujeto a revisión de abogado (NIT pendiente).
const FALLBACK = `Al comprar en **lucamsshop.co** aceptas estos Términos y Condiciones. Toda venta
se rige por la legislación colombiana, en particular la **Ley 1480 de 2011**
(Estatuto del Consumidor).

## Quiénes somos

**Lucams_shop S.A.S.** (NIT en trámite), tienda de productos magnéticos
personalizados en Colombia. Contacto: **hola@lucamsshop.co** · WhatsApp disponible
en el sitio.

## Los productos

Vendemos imanes y productos personalizables. Cada producto muestra sus
características (medidas, materiales), su precio total **con IVA incluido**, y el
tiempo estimado de producción y entrega. Los colores pueden variar levemente
respecto a la pantalla.

## Precios y pago

- Los precios están en **pesos colombianos (COP)** e incluyen IVA.
- El costo de envío se calcula y muestra antes de pagar.
- Aceptamos pago con tarjeta y PSE a través de **Wompi**, y **contraentrega**
  donde esté disponible.

## Entrega

Despachamos a través de transportadoras aliadas (ver Subprocesadores). El tiempo
de entrega depende de tu ciudad y se te informa antes de comprar. Te enviamos el
número de guía para que hagas seguimiento.

## Derecho de retracto y garantía

- Tienes **derecho de retracto** en los términos de la Ley 1480 (ver Devoluciones
  y Retracto). No aplica a productos personalizados con tu foto o tu texto.
- Todos los productos tienen **garantía legal** (ver Garantías).

## Personalización

Al subir fotos o textos al Estudio de Personalización, declaras que tienes derecho
a usarlos y que no infringen derechos de terceros. Usamos esas imágenes únicamente
para producir tu pedido.

## Propiedad intelectual

Las marcas, diseños y contenidos del sitio son de Lucams_shop o de sus titulares.
No pueden reproducirse sin autorización.

> Última actualización: junio de 2026. Estos términos se revisan periódicamente.`;

export default function Page() {
  return (
    <>
      <LegalPageHeader blockKey="legal.terminos.heading" defaultTitle="Términos y Condiciones" />
      <CmsMarkdown blockKey="legal.terminos" fallback={FALLBACK} className="mt-6" />
    </>
  );
}
