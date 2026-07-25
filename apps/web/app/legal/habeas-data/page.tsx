import type { Metadata } from "next";
import { CmsMarkdown } from "@/components/cms/cms-markdown";
import { LegalPageHeader } from "@/components/legal/legal-page-header";

export const metadata: Metadata = {
  title: "Hábeas Data",
};

// Fallback que se renderiza cuando el CmsBlock no existe, no está publicado o la DB falla.
// Es COPIA EXACTA de packages/db/legal-content/legal.habeas-data.md (la fuente canónica) y viaja en git,
// así que es el único texto legal garantizado ante una caída de la base.
// legal-content-sync.test.ts falla si ambos divergen.
const FALLBACK = `
Aquí te contamos, sin letra chiquita imposible, qué hacemos con tus datos y cómo los controlas. Esta es la **Política de Tratamiento de Datos Personales** de Lucams_shop, conforme a la **Ley 1581 de 2012** y su **Decreto reglamentario 1377 de 2013**. Léela con confianza: tú mandas sobre tu información. 🦝

## Responsable del tratamiento

El tratamiento de tus datos está a cargo de:

- **Responsable:** **Lucams_shop (persona natural), Bogotá D.C., Colombia**, titular de la marca **Lucams_shop**.
- **Domicilio:** Bogotá D.C., Colombia.
- **Correo de contacto:** hola@lucamsshop.com
- **WhatsApp:** disponible en el sitio (botón de WhatsApp).

Si necesitas nuestros datos para un trámite formal o una reclamación, escríbenos a **habeas-data@lucamsshop.com** y te los damos.

## Qué datos tratamos

Según cómo uses la tienda, podemos recolectar y tratar:

- **Identificación y contacto:** nombre, correo electrónico y teléfono.
- **Datos de envío:** dirección de entrega y ciudad.
- **Datos de tu cotización:** los productos que elegiste, tu nombre, tu número de WhatsApp, tu ciudad y las notas que nos dejes. Hoy es la vía principal por la que cerramos un pedido contigo.
- **Datos de la compra:** productos, historial de pedidos, reseñas y favoritos. **Cuando activemos la compra en línea**, los **datos sensibles de pago** (número de tarjeta, etc.) los procesará directamente nuestra pasarela **Wompi**; nosotros no los almacenamos en ningún caso.
- **Fotos e imágenes** que subes al **Estudio de Personalización** para crear tu producto.
- **Datos de navegación:** cookies y datos técnicos (ver nuestra [Política de Cookies](/legal/cookies)).

## Para qué usamos tus datos

Tratamos tus datos únicamente para estas finalidades:

- **Procesar tu pedido**, cobrarlo y coordinar el envío hasta tu puerta.
- **Atender tu cotización:** responderte por WhatsApp, confirmarte el total y el envío, y coordinar la entrega.
- **Comunicarnos contigo** sobre el estado de tu compra (correos y mensajes transaccionales).
- **Producir tu diseño personalizado** a partir de las fotos y textos que subes al Estudio.
- **Atender tus peticiones, quejas y reclamos** (PQR) y el ejercicio de tus derechos.
- **Enviarte novedades y promociones** — solo si nos das tu autorización específica para marketing (es opcional y puedes retirarla cuando quieras).
- **Mejorar la tienda** con estadísticas agregadas y anonimizadas.
- **Cumplir obligaciones legales** (por ejemplo, la retención tributaria de tus comprobantes de compra).

No usamos tus datos para finalidades distintas a estas sin pedirte una nueva autorización.

## Datos sensibles y de menores

Las **fotos** que subes al Estudio pueden contener rostros u otra información personal. Solo las tratamos para producir tu producto y las eliminamos cuando ya no son necesarias (ver los plazos de retención más abajo). Puedes negarte a entregarlas, aunque en ese caso no podríamos personalizar tu producto.

Nuestra tienda no está dirigida a menores de edad. Si eres madre, padre o representante y detectas que un menor nos entregó datos, escríbenos y los suprimimos. El tratamiento de datos de niñas, niños y adolescentes solo procede con autorización de su representante legal y respetando su interés superior.

## Transferencia y transmisión internacional de datos

Para operar la tienda usamos proveedores de tecnología ("encargados del tratamiento"). Algunos están **fuera de Colombia**, por lo que tus datos pueden almacenarse o procesarse en el exterior:

| Proveedor                | Para qué                                                    | País        |
| ------------------------ | ----------------------------------------------------------- | ----------- |
| Supabase                 | Base de datos, cuentas y almacenamiento                     | EE.UU. / UE |
| Vercel                   | Hospedaje de la tienda                                      | EE.UU.      |
| Resend                   | Correos transaccionales                                     | EE.UU.      |
| Google (Gemini API)      | Asistente de diseño con IA (sin datos de contacto directos) | EE.UU.      |
| Cloudflare               | Seguridad anti-bot y protección contra ataques              | EE.UU.      |
| Wompi                    | Procesamiento de pagos                                      | Colombia    |
| Aveonline / Coordinadora | Logística y envíos                                          | Colombia    |

**Base de legitimación:** estas transferencias y transmisiones se realizan con **tu autorización** y porque son **necesarias para ejecutar tu compra**, con acuerdos de tratamiento (DPA) y medidas de seguridad (cifrado en tránsito y en reposo) con cada proveedor. La lista completa y actualizada vive en [Subprocesadores](/legal/subprocesadores).

## Autorización

Antes de recolectar tus datos te pedimos una autorización **previa, expresa e informada**, con una **casilla que tú marcas**: al pedir tu cotización por WhatsApp, al crear tu cuenta, al completar tus datos de compra y al elegir tus cookies. Guardamos el registro de esa autorización como prueba. Puedes **revocarla** en cualquier momento por los canales de esta política, salvo que exista un deber legal que nos obligue a conservar ciertos datos (como los comprobantes de tus pedidos).

## Tus derechos

Como titular de tus datos personales, la Ley 1581 (art. 8) te garantiza:

- **Conocer, actualizar y rectificar** tus datos.
- **Solicitar prueba de la autorización** que otorgaste, salvo cuando la ley no lo exija.
- **Ser informado**, cuando lo pidas, del **uso** que le hemos dado a tus datos.
- **Presentar quejas ante la SIC** por infracciones a la ley.
- **Revocar la autorización** y/o **solicitar la supresión** de tus datos cuando no exista un deber legal o contractual de conservarlos.
- **Acceder de forma gratuita** a tus datos personales.

## Área responsable de la atención

La atención de peticiones, consultas y reclamos sobre tus datos está a cargo del **canal de Protección de Datos de Lucams_shop**:

- **Correo:** hola@lucamsshop.com
- **WhatsApp:** botón disponible en el sitio.

Es el punto único al que puedes escribir para ejercer cualquiera de tus derechos.

## Cómo ejercer tus derechos

Tienes dos caminos:

1. **Tú mismo, al instante:** puedes eliminar tu cuenta y tus datos desde [Mi cuenta → Seguridad](/mi-cuenta/seguridad). Para dejar de recibir correos de marketing, usa el enlace **"Cancelar suscripción"** al final de cualquier correo nuestro.
2. **Escribiéndonos:** manda tu solicitud a **hola@lucamsshop.com** o por WhatsApp, indicando:
   - Tu nombre completo y documento de identidad.
   - El correo **o el número de WhatsApp** con el que nos escribiste o pediste tu cotización (si cotizaste como invitado, el correo es opcional y tu WhatsApp basta para identificarte).
   - El derecho que quieres ejercer.
   - Una breve descripción de tu solicitud.

**Plazos de respuesta (Ley 1581, art. 14 y 15):**

- **Consultas:** respondemos en máximo **10 días hábiles**. Si no alcanzamos, te avisamos el motivo y la fecha en que responderemos, que no pasará de **5 días hábiles** adicionales.
- **Reclamos:** los atendemos en máximo **15 días hábiles**. Si necesitamos más, te informamos el motivo y la nueva fecha, que no superará **8 días hábiles** adicionales.
- Si tu reclamo llega incompleto, te pediremos completarlo dentro de los **5 días** siguientes; si pasan **2 meses** sin tu respuesta, se entenderá que desististe.

## Reclamo ante la SIC

Si no quedas conforme con nuestra respuesta, puedes acudir a la **Superintendencia de Industria y Comercio (SIC)**, autoridad colombiana de protección de datos: [sic.gov.co](https://www.sic.gov.co). Antes de presentar el reclamo ante la SIC, la ley pide que primero hayas agotado el trámite de consulta o reclamo con nosotros.

## Vigencia y cambios

Esta política rige desde su fecha de entrada en vigencia y se mantiene mientras Lucams_shop trate datos personales. Conservamos tus datos **mientras exista una relación contigo** y durante los **plazos que la ley exija** (por ejemplo, la retención tributaria de tus comprobantes de compra); cumplidos esos plazos, los suprimimos o anonimizamos. Si cambiamos esta política, publicaremos la nueva versión aquí y, si el cambio es relevante, te lo informaremos.

---

_Versión 3 · vigente desde 2026-07-24 · en revisión por asesoría legal antes del lanzamiento_
`;

export default function Page() {
  return (
    <>
      <LegalPageHeader blockKey="legal.habeas-data.heading" defaultTitle="Hábeas Data" />
      <CmsMarkdown blockKey="legal.habeas-data" fallback={FALLBACK} className="mt-6" />
    </>
  );
}
