import type { Metadata } from "next";
import { CmsMarkdown } from "@/components/cms/cms-markdown";
import { LegalPageHeader } from "@/components/legal/legal-page-header";

export const metadata: Metadata = {
  title: "Subprocesadores",
};

// P0-008 (Bloque B 2026-06-27) — actualizado de Venndelo a Aveonline (ADR-039).
// Aveonline es un agregador logístico que rutea cada envío por una de varias
// transportadoras colombianas; esas transportadoras reciben los datos de entrega
// (nombre, dirección, teléfono) para hacer la entrega, por eso se listan.
// Fallback que se renderiza cuando el CmsBlock no existe, no está publicado o la DB falla.
// Es COPIA EXACTA de packages/db/legal-content/legal.subprocesadores.md (la fuente canónica) y viaja en git,
// así que es el único texto legal garantizado ante una caída de la base.
// legal-content-sync.test.ts falla si ambos divergen.
const FALLBACK = `
Para armar tus imanes, cobrarte de forma segura y llevarte el pedido hasta la puerta, un pequeño equipo de proveedores de confianza nos ayuda entre bambalinas. A esos proveedores la ley los llama **encargados del tratamiento**: tratan tus datos personales **por cuenta nuestra**, solo para lo necesario y bajo un contrato que les exige cuidarlos.

El **responsable del tratamiento** de tus datos es **Lucams_shop (persona natural), Bogotá D.C., Colombia**. Puedes escribirnos a **hola@lucamsshop.com** o por **WhatsApp** (el número está en el pie de página del sitio). Si necesitas nuestros datos para un trámite formal, escríbenos y te los damos.

## ¿Qué es un subprocesador?

Es un tercero (una empresa proveedora) que trata algunos de tus datos **en nuestro nombre y siguiendo nuestras instrucciones**, únicamente para prestarte el servicio: alojar el sitio, enviarte correos, procesar el pago o entregar tu pedido. Con cada uno nos acogemos a un **Acuerdo de Tratamiento de Datos (DPA) / contrato de transmisión** que fija los alcances del tratamiento y exige garantías de seguridad, tal como lo pide el **artículo 2.2.2.25.5.2 del Decreto 1074 de 2015** (que compiló el art. 25 del Decreto 1377 de 2013).

## Proveedores que tratan tus datos

> **Hoy la tienda opera por cotización por WhatsApp**, así que los proveedores marcados con ⏳ todavía **no tratan** ningún dato tuyo: entrarán en operación cuando activemos la compra en línea, y actualizaremos esta lista antes de que eso pase.

| Proveedor                  | País                             | Qué hace                                                                                                                              | Qué datos tuyos trata                                                                             | DPA                                                            |
| -------------------------- | -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- | -------------------------------------------------------------- |
| **Supabase**               | EE.UU. (con opción de región EU) | Base de datos, autenticación y almacenamiento de archivos                                                                             | Casi todos los datos de tu cuenta y pedidos (protegidos con RLS) y las fotos que subes al Estudio | [Ver](https://supabase.com/legal/dpa)                          |
| **Vercel**                 | EE.UU.                           | Hosting, despliegue y CDN del sitio                                                                                                   | Datos en tránsito durante tu visita y registros técnicos (incluida tu IP)                         | [Ver](https://vercel.com/legal/dpa)                            |
| **Resend**                 | EE.UU.                           | Envío de correos transaccionales y del boletín                                                                                        | Tu correo electrónico y el contenido del mensaje                                                  | [Ver](https://resend.com/legal/dpa)                            |
| **Google (Gemini API)** ⏳ | EE.UU.                           | Asistente de IA que sugiere ideas de diseño en el Estudio — **cuando lo activemos**                                                   | El texto de tu solicitud de diseño (sin datos de identificación directa)                          | [Ver](https://cloud.google.com/terms/data-processing-addendum) |
| **Cloudflare**             | EE.UU. / global                  | Anti-bot (Turnstile) y protección contra ataques                                                                                      | Tu dirección IP y datos en tránsito                                                               | [Ver](https://www.cloudflare.com/cloudflare-customer-dpa/)     |
| **Wompi** ⏳               | Colombia                         | Procesamiento de pagos en línea (tarjetas y PSE) — **cuando activemos la compra en línea**                                            | Datos de la transacción y datos para prevención de fraude                                         | [Ver](https://wompi.com/legal)                                 |
| **Aveonline** ⏳           | Colombia                         | Agregador de logística: cotiza el envío, genera la guía y gestiona el recaudo contraentrega — **cuando activemos la compra en línea** | Nombre, dirección y teléfono de entrega                                                           | [Ver](https://www.aveonline.co/)                               |

### Transportadoras

Aveonline entrega tu pedido a través de **una** de estas transportadoras, según la cobertura y la tarifa de tu ciudad. La transportadora recibe tus datos de entrega (**nombre, dirección y teléfono**) únicamente para completar el envío:

- Envía
- Coordinadora
- Servientrega
- Interrapidísimo
- TCC
- Deprisa
- Saferbo

## Transferencias internacionales

Algunos de estos proveedores (Supabase, Vercel, Resend, Google/Gemini y Cloudflare) están ubicados en **Estados Unidos**, país al que la Superintendencia de Industria y Comercio (SIC) **no ha declarado como de nivel adecuado** de protección de datos. Que tus datos se traten allí es, por tanto, una **transferencia/transmisión internacional**, amparada en:

1. **Tu autorización previa, expresa e informada**, que recogemos en el [Aviso de Privacidad](/legal/privacidad) y la Política de Tratamiento de Datos.
2. El **contrato de transmisión / DPA** que tenemos con cada proveedor, con garantías de seguridad (artículo 2.2.2.25.5.2 del Decreto 1074 de 2015).
3. **Medidas técnicas**: cifrado de tus datos en tránsito y en reposo.

Todo esto se hace conforme al **artículo 26 de la Ley 1581 de 2012**, que regula las transferencias internacionales de datos personales.

> Si en el futuro activamos la **facturación electrónica**, sumaremos aquí, como nuevo encargado, al proveedor tecnológico autorizado por la DIAN que corresponda. Hasta entonces, ningún proveedor de facturación trata tus datos.

## Cómo ejercer tus derechos

Puedes **conocer, actualizar, rectificar y suprimir** tus datos, **revocar** la autorización y **pedir prueba** de la autorización otorgada. Escríbenos a **hola@lucamsshop.com** o usa el formulario de la página de [Habeas Data](/legal/habeas-data). Los plazos legales son:

- **Consultas:** te respondemos en máximo **10 días hábiles** (Ley 1581, art. 14).
- **Reclamos:** los resolvemos en máximo **15 días hábiles** (Ley 1581, art. 15).

Si consideras que no atendimos bien tu solicitud, puedes acudir a la **Superintendencia de Industria y Comercio (SIC)**.

## Cambios en esta lista

Si vamos a **agregar o cambiar** un subprocesador, avisaremos por correo a los clientes registrados con al menos **30 días** de anticipación, para que puedas conocer el cambio antes de que ocurra.

---

_Versión 3 · vigente desde 2026-07-24 · en revisión por asesoría legal antes del lanzamiento_
`;

export default function Page() {
  return (
    <>
      <LegalPageHeader blockKey="legal.subprocesadores.heading" defaultTitle="Subprocesadores" />
      <CmsMarkdown blockKey="legal.subprocesadores" fallback={FALLBACK} className="mt-6" />
    </>
  );
}
