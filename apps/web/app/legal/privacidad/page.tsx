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
// Fallback que se renderiza cuando el CmsBlock no existe, no está publicado o la DB falla.
// Es COPIA EXACTA de packages/db/legal-content/legal.privacidad.md (la fuente canónica) y viaja en git,
// así que es el único texto legal garantizado ante una caída de la base.
// legal-content-sync.test.ts falla si ambos divergen.
const FALLBACK = `
En **Lucams_shop** cuidamos tus datos personales con el mismo cariño con el que hacemos tus imanes. Este Aviso de Privacidad te explica, en cristiano, quién es responsable de tus datos, qué recolectamos, para qué, cuáles son tus derechos y cómo ejercerlos, conforme a la **Ley 1581 de 2012** y su **Decreto reglamentario 1377 de 2013, compilado en el Decreto 1074 de 2015**.

Este aviso es un resumen. El documento vinculante y completo es nuestra **Política de Tratamiento de Datos Personales**, que puedes consultar en cualquier momento (ver más abajo).

## Quién es responsable de tus datos

**Lucams_shop (persona natural), Bogotá D.C., Colombia**, titular de la marca **Lucams_shop**, es la responsable del tratamiento de tus datos personales.

Puedes contactarnos por:

- **Correo:** hola@lucamsshop.com
- **Habeas Data (trámites de datos personales):** habeas-data@lucamsshop.com
- **WhatsApp:** el botón de WhatsApp que ves en el sitio.

> Si necesitas nuestros datos para un trámite formal o una reclamación, escríbenos por cualquiera de estos canales y te los damos.

## Qué datos recolectamos

- **Identificación:** nombre, correo electrónico y teléfono.
- **Contacto y envío:** dirección de entrega.
- **Cotización por WhatsApp:** tu nombre, tu número de WhatsApp, tu ciudad y departamento, tu correo (opcional) y las notas que nos escribas en el formulario.
- **Pago:** cuando pagas en línea, los datos sensibles de tu tarjeta los procesa **Wompi**, nuestra pasarela de pagos, en su propia página segura — **nosotros no los vemos ni los almacenamos**. Solo conservamos la información mínima de la transacción (referencia, valor y estado del pago).
- **Asistente de diseño con IA:** solo el **texto de la ocasión** que describes (por ejemplo, "el cumpleaños de mi mamá"). No enviamos tus fotos ni tus datos de contacto; y si el texto parece contener datos personales (números de documento, correos o celulares), lo reemplazamos por un texto neutro antes de enviarlo.
- **Comportamiento:** historial de pedidos, productos vistos y reseñas.
- **Imágenes:** las fotos que subes al **Estudio de Personalización**.

## Con qué finalidad los usamos

- Atender tu **cotización** y contactarte por WhatsApp para cerrarla contigo.
- Procesar tu pedido, cobrarlo y enviártelo.
- Enviarte comunicaciones sobre tu compra (confirmación, despacho, entrega).
- Sugerirte **ideas de diseño** con el asistente de IA del Estudio, a partir del texto de la ocasión que nos cuentas.
- Enviarte novedades y promociones **solo si nos das tu consentimiento** — es opcional y puedes cancelarlo cuando quieras.
- Mejorar el servicio con analítica **agregada y anonimizada**.

No usamos tus datos para finalidades distintas a estas sin informarte y pedirte autorización antes.

## Tus fotos del Estudio (esto lo cuidamos con lupa)

Las fotos que subes al Estudio de Personalización pueden incluir **rostros u otra información sensible**. Por eso:

- Solo las tratamos para **armar y producir tu diseño**.
- Tratar datos sensibles requiere tu **autorización expresa**, y **no estás obligado/a** a autorizar el tratamiento de datos sensibles.
- Puedes pedir que las eliminemos, y los diseños abandonados se **borran automáticamente** pasado un tiempo sin actividad.

## Tus derechos como titular

De acuerdo con la Ley 1581 de 2012 (art. 8), tienes derecho a:

- **Conocer, actualizar y rectificar** tus datos.
- Solicitar **prueba de la autorización** que nos diste.
- Ser **informado** del uso que les damos.
- **Revocar** la autorización y/o **solicitar la supresión** de tus datos, cuando proceda.
- **Acceder gratuitamente** a tus datos.
- Presentar quejas ante la **Superintendencia de Industria y Comercio (SIC)** por infracciones a la Ley 1581.

## Cómo ejercer tus derechos

Escríbenos a **habeas-data@lucamsshop.com** (o a hola@lucamsshop.com, o por WhatsApp). Según la ley:

- Respondemos tus **consultas** en máximo **10 días hábiles**.
- Respondemos tus **reclamos** en máximo **15 días hábiles**.

Si quieres el detalle completo de cómo ejercerlos, visita nuestra página de **[Hábeas Data](/legal/habeas-data)**.

## Con quién compartimos tus datos y transferencias internacionales

Para prestarte el servicio compartimos datos con proveedores que actúan como **encargados del tratamiento** (hosting, correo, pagos, logística e inteligencia artificial del Estudio). Todos están obligados contractualmente a proteger tus datos.

Algunos de estos encargados operan **fuera de Colombia (Estados Unidos)** — por ejemplo, la infraestructura de nube y de correo, y el asistente de IA del Estudio. Jurídicamente esto es una **transmisión internacional**, no una transferencia: ellos tratan los datos **por nuestra cuenta y siguiendo nuestras instrucciones**, y nosotras seguimos siendo las responsables (Decreto 1074 de 2015, art. 2.2.2.25.1.3, numerales 4 y 5). Con cada uno tenemos un **contrato de transmisión** que fija el alcance del tratamiento y exige garantías de seguridad (cifrado en tránsito y en reposo).

Puedes ver la lista actualizada de terceros y los países donde operan en **[Subprocesadores](/legal/subprocesadores)**.

## Tu autorización

Al entregarnos tus datos y aceptar este aviso, **autorizas** su tratamiento para las finalidades descritas. Te pedimos esa autorización de forma expresa —con una casilla que tú marcas— cuando:

- **creas tu cuenta**,
- **pides tu cotización por WhatsApp**,
- **completas tus datos de compra** en el sitio, y
- **eliges tus cookies** en el banner.

De cada una guardamos el registro (fecha, versión de este aviso y el correo o el número de WhatsApp con el que la diste) como **prueba de la autorización**. Puedes **revocarla** en cualquier momento por los canales indicados, salvo cuando exista un deber legal o contractual de conservar cierta información (por ejemplo, datos de facturación o de un pedido en curso).

## Política de Tratamiento completa

Este aviso resume nuestras prácticas. El documento completo y vinculante es nuestra **Política de Tratamiento de Datos Personales**, disponible en **[Hábeas Data](/legal/habeas-data)**. También puedes consultar:

- [Política de Cookies](/legal/cookies)
- [Términos y Condiciones](/legal/terminos)

## Cambios a este aviso

Si cambiamos este aviso de forma sustancial, te lo informaremos y actualizaremos la versión y la fecha de vigencia que aparecen abajo.

---

_Versión 5 · vigente desde 2026-09-04 · actualizada: el pago en línea con Wompi y el asistente de diseño con IA ya están activos · en revisión por asesoría legal._
`;

export default function Page() {
  return (
    <>
      <LegalPageHeader blockKey="legal.privacidad.heading" defaultTitle="Aviso de Privacidad" />
      <CmsMarkdown blockKey="legal.privacidad" fallback={FALLBACK} className="mt-6" />
    </>
  );
}
