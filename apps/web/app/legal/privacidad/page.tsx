import type { Metadata } from "next";
import { CmsMarkdown } from "@/components/cms/cms-markdown";
import { LegalPageHeader } from "@/components/legal/legal-page-header";

export const metadata: Metadata = {
  title: "Aviso de Privacidad",
  description: "Política de tratamiento de datos personales · Ley 1581 de 2012 (Colombia).",
};

// P0-006 (Bloque B 2026-06-27) — texto sustantivo basado en docs/COMPLIANCE.md
// (texto base aviso de privacidad) + Ley 1581 de 2012 + Decreto 1377 de 2013.
// Persona natural; la identificación completa (CC + dirección) vive en el CMS, no en git (PII).
// Sigue sujeto a revisión de abogado antes del lanzamiento.
const FALLBACK = `**Lucy Jullieth Hurtado Rodríguez** (persona natural), titular de la marca **Lucams_shop**,
es responsable del tratamiento de tus datos personales, conforme a la **Ley 1581 de 2012** y el
**Decreto 1377 de 2013** de Colombia. Sus datos de identificación y contacto para ejercer tus
derechos figuran en la sección de **Hábeas Data**.

## Qué datos recolectamos

- **Identificación**: nombre, correo electrónico y teléfono.
- **Contacto**: dirección de envío.
- **Pago**: información mínima de la transacción (los datos sensibles de tu
  tarjeta los maneja Wompi, no nosotros).
- **Comportamiento**: historial de pedidos, productos vistos y reseñas.
- **Imágenes**: las fotos que subes al Estudio de Personalización.

## Para qué los usamos

- Procesar tu pedido, cobrarlo y enviarlo.
- Enviarte comunicaciones sobre tu compra (confirmación, despacho, entrega).
- Enviarte novedades y promociones **solo si das tu consentimiento** (opcional, y
  puedes cancelarlo cuando quieras).
- Mejorar el servicio con analítica agregada y anonimizada.

## Tus derechos como titular

- Conocer, actualizar y rectificar tus datos.
- Solicitar prueba de la autorización que nos diste.
- Ser informado del uso que les damos.
- Revocar la autorización y/o solicitar la supresión de tus datos.
- Acceder gratuitamente a tus datos.
- Presentar quejas ante la **Superintendencia de Industria y Comercio (SIC)** por
  infracciones a la Ley 1581.

## Cómo ejercer tus derechos

Escríbenos a **habeas-data@lucamsshop.co**. Respondemos las consultas en máximo 10
días hábiles y los reclamos en máximo 15 días hábiles, según la ley.

## Encargados del tratamiento

Para prestarte el servicio compartimos datos con proveedores que actúan como
encargados (hosting, correos, pagos, logística). Puedes ver la lista en
**Subprocesadores**. Todos están obligados contractualmente a proteger tus datos.

> Última actualización: junio de 2026. Este aviso se revisa periódicamente; si
> cambia de forma sustancial, te lo informaremos.`;

export default function Page() {
  return (
    <>
      <LegalPageHeader blockKey="legal.privacidad.heading" defaultTitle="Aviso de Privacidad" />
      <CmsMarkdown blockKey="legal.privacidad" fallback={FALLBACK} className="mt-6" />
    </>
  );
}
