import type { Metadata } from "next";
import { CmsMarkdown } from "@/components/cms/cms-markdown";
import { LegalPageHeader } from "@/components/legal/legal-page-header";

export const metadata: Metadata = {
  title: "Subprocesadores",
  description:
    "Proveedores que tratan datos personales por cuenta de Lucams Shop, qué datos manejan y con qué garantías.",
  alternates: { canonical: "/legal/subprocesadores" },
};

// P0-008 (Bloque B 2026-06-27) — subprocesadores reales (ADR-039).
// Aveonline es un agregador logístico que rutea cada envío por una de varias
// transportadoras colombianas; esas transportadoras reciben los datos de entrega
// (nombre, dirección, teléfono) para hacer la entrega, por eso se listan.
// Fallback que se renderiza cuando el CmsBlock no existe, no está publicado o la DB falla.
// Es COPIA EXACTA de packages/db/legal-content/legal.subprocesadores.md (la fuente canónica) y viaja en git,
// así que es el único texto legal garantizado ante una caída de la base.
// legal-content-sync.test.ts falla si ambos divergen.
const FALLBACK = `
Para armar tus imanes, cobrarte de forma segura y llevarte el pedido hasta la puerta, un pequeño equipo de proveedores de confianza nos ayuda entre bambalinas. A esos proveedores la ley los llama **encargados del tratamiento**: tratan tus datos personales **por cuenta nuestra**, solo para lo necesario y bajo un contrato que les exige cuidarlos.

El **responsable del tratamiento** de tus datos es **Lucams Shop (persona natural), Bogotá D.C., Colombia**. Puedes escribirnos a **{{email_contacto}}** o por **WhatsApp** (el número está en el pie de página del sitio). Si necesitas nuestros datos para un trámite formal, escríbenos y te los damos.

## ¿Qué es un subprocesador?

Es un tercero (una empresa proveedora) que trata algunos de tus datos **en nuestro nombre y siguiendo nuestras instrucciones**, únicamente para prestarte el servicio: alojar el sitio, enviarte correos, procesar el pago o entregar tu pedido. Con cada uno nos acogemos a un **Acuerdo de Tratamiento de Datos (DPA) / contrato de transmisión** que fija los alcances del tratamiento y exige garantías de seguridad, tal como lo pide el **artículo 2.2.2.25.5.2 del Decreto 1074 de 2015** (que compiló el art. 25 del Decreto 1377 de 2013).

## Proveedores que tratan tus datos

> Esta lista refleja a los proveedores que **hoy** participan en la operación de la tienda en línea (cobros con Wompi, envíos con Aveonline, correo con Resend, analítica opcional bajo tu consentimiento, asistente de IA sin datos personales y atención por WhatsApp). Si agregamos o cambiamos un proveedor, actualizamos esta página.

| Proveedor                           | País                             | Qué hace                                                                                                                       | Qué datos tuyos trata                                                                                                | DPA                                                        |
| ----------------------------------- | -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------- |
| **Supabase**                        | EE.UU. (con opción de región EU) | Base de datos, autenticación y almacenamiento de archivos                                                                      | Los datos de tu cuenta, pedidos, soporte y las fotos que subes al Estudio (protegidos con control de acceso y RLS)   | [Ver](https://supabase.com/legal/dpa)                      |
| **Vercel**                          | EE.UU.                           | Hosting, despliegue y CDN del sitio                                                                                            | Datos en tránsito durante tu visita y registros técnicos (incluida tu IP)                                            | [Ver](https://vercel.com/legal/dpa)                        |
| **Resend**                          | EE.UU.                           | Envío de correos transaccionales y gestión de suscriptores del boletín                                                         | Tu correo electrónico, estado de entrega y el contenido del mensaje                                                  | [Ver](https://resend.com/legal/dpa)                        |
| **Google (Gemini API)**             | EE.UU.                           | Asistente de ocasión en el Estudio y apoyo interno de redacción en soporte                                                     | Solo textos previamente depurados y anonimizados (sin fotos, nombres, correos, teléfonos, direcciones ni documentos) | [Ver](https://ai.google.dev/gemini-api/terms)              |
| **Google LLC (Google Analytics 4)** | EE.UU.                           | Medición analítica agregada de páginas y campañas (**solo si aceptas cookies Analíticas**)                                     | Eventos de navegación con URLs depuradas (sin enlaces privados) e identificadores de cookie \`_ga\`                    | [Ver](https://business.safety.google/adsprocessorterms/)   |
| **Cloudflare**                      | EE.UU. / global                  | Anti-bot (Turnstile), DNS, enrutamiento de correo entrante y protección contra ataques                                         | Tu dirección IP, datos en tránsito y correos que nos escribes a nuestro buzón de contacto                            | [Ver](https://www.cloudflare.com/cloudflare-customer-dpa/) |
| **Cloudflare R2**                   | EE.UU. / global                  | Respaldo cifrado externo de la base de datos y de los archivos de almacenamiento (retención de ~30 días)                       | Una copia cifrada con AES-256 para continuidad del negocio ante desastres                                            | [Ver](https://www.cloudflare.com/cloudflare-customer-dpa/) |
| **Meta / WhatsApp**                 | EE.UU. / global                  | Canal de atención al cliente: dudas, cotizaciones y ejercicio de tus derechos                                                  | Tu nombre, tu número de teléfono y el contenido de los mensajes que nos escribes                                     | [Ver](https://www.whatsapp.com/legal/)                     |
| **Wompi**                           | Colombia                         | Procesamiento de pagos en línea (tarjetas y PSE)                                                                               | Datos de la transacción y datos para prevención de fraude                                                            | [Ver](https://wompi.com/legal)                             |
| **Aveonline**                       | Colombia                         | Agregador de logística: cotiza el envío en el checkout, genera la guía, informa el rastreo y gestiona el recaudo contraentrega | Nombre, dirección, ciudad y teléfono de entrega                                                                      | [Ver](https://www.aveonline.co/)                           |

> **Sobre las herramientas de IA:** según el nivel (tier) de la Gemini API que tengamos activo, Google puede tratar los textos enviados conforme a sus términos del servicio. Por eso nunca enviamos fotos ni datos personales: tanto en el Estudio como en el apoyo interno de soporte aplicamos filtros deterministas en nuestro servidor que suprimen documentos, correos, teléfonos y direcciones antes de hacer cualquier consulta.

### Transportadoras

Aveonline entrega tu pedido a través de **una** de estas transportadoras aliadas (además de nuestra opción de mensajería local en Bogotá cuando aplica), según la cobertura y la tarifa de tu ciudad. La transportadora recibe tus datos de entrega (**nombre, dirección y teléfono**) únicamente para completar el envío:

- Envía
- Coordinadora
- Servientrega
- Interrapidísimo
- TCC
- Deprisa
- Saferbo

## Transferencias internacionales

Algunos de estos proveedores (Supabase, Vercel, Resend, Google, Cloudflare y Meta/WhatsApp) están ubicados en **Estados Unidos** u operan de forma **global**, país al que la Superintendencia de Industria y Comercio (SIC) **no ha declarado como de nivel adecuado** de protección de datos. Que tus datos se traten allí es, por tanto, una **transferencia/transmisión internacional**, amparada en:

1. **Tu autorización previa, expresa e informada**, que recogemos en el [Aviso de Privacidad](/legal/privacidad), en el banner de cookies y en la Política de Tratamiento de Datos.
2. El **contrato de transmisión / DPA** que tenemos con cada proveedor, con garantías de seguridad (artículo 2.2.2.25.5.2 del Decreto 1074 de 2015).
3. **Medidas técnicas**: cifrado de tus datos en tránsito y en reposo, y minimización previa de lo que se transmite.

Todo esto se hace conforme al **artículo 26 de la Ley 1581 de 2012**, que regula las transferencias internacionales de datos personales.

> Si en el futuro activamos la **facturación electrónica**, sumaremos aquí, como nuevo encargado, al proveedor tecnológico autorizado por la DIAN que corresponda. Hasta entonces, ningún proveedor de facturación trata tus datos.

## Cómo ejercer tus derechos

Puedes **conocer, actualizar, rectificar y suprimir** tus datos, **revocar** la autorización y **pedir prueba** de la autorización otorgada. Escríbenos a **{{email_habeas_data}}** (o a **{{email_contacto}}**) o revisa el detalle en [Hábeas Data](/legal/habeas-data). Los plazos legales son:

- **Consultas:** te respondemos en máximo **{{habeas_consulta_dias}} días hábiles** (Ley 1581, art. 14).
- **Reclamos:** los resolvemos en máximo **{{habeas_reclamo_dias}} días hábiles** (Ley 1581, art. 15).

Si consideras que no atendimos bien tu solicitud, puedes acudir a la **Superintendencia de Industria y Comercio (SIC)**.

## Cambios en esta lista

Si vamos a **agregar o cambiar** un subprocesador, avisaremos por correo a los clientes registrados con al menos **30 días** de anticipación, para que puedas conocer el cambio antes de que ocurra.

---

_Versión 3 · vigente desde 2026-11-05_
`;

export default function Page() {
  return (
    <>
      <LegalPageHeader blockKey="legal.subprocesadores.heading" defaultTitle="Subprocesadores" />
      <CmsMarkdown blockKey="legal.subprocesadores" fallback={FALLBACK} className="mt-6" />
    </>
  );
}
