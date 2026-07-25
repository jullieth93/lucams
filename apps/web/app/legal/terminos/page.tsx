import type { Metadata } from "next";
import { CmsMarkdown } from "@/components/cms/cms-markdown";
import { LegalPageHeader } from "@/components/legal/legal-page-header";

export const metadata: Metadata = {
  title: "Términos y Condiciones",
};

// P0-006 (Bloque B 2026-06-27) — texto sustantivo basado en las obligaciones de
// información del art. 23 y ss. de la Ley 1480 de 2011 (Estatuto del Consumidor),
// documentadas en docs/COMPLIANCE.md. Figura jurídica: persona natural (ADR pendiente de abogado).
// La identificación completa (CC + dirección de notificación) vive en el CMS, no en git (PII).
// Fallback que se renderiza cuando el CmsBlock no existe, no está publicado o la DB falla.
// Es COPIA EXACTA de packages/db/legal-content/legal.terminos.md (la fuente canónica) y viaja en git,
// así que es el único texto legal garantizado ante una caída de la base.
// legal-content-sync.test.ts falla si ambos divergen.
const FALLBACK = `
Al comprar en **lucamsshop.com** aceptas estos Términos y Condiciones. Léelos con calma: aquí te contamos quiénes somos, cómo funciona la compra y cuáles son tus derechos. Toda venta se rige por la legislación colombiana, en especial la **Ley 1480 de 2011 (Estatuto del Consumidor)** y la **Ley 1581 de 2012 (Protección de Datos Personales)**.

> **Cómo operamos hoy: venta por cotización.** En esta etapa lucamsshop.com es un **catálogo con cotización por WhatsApp**. Eliges tus productos, nos dejas tus datos y cerramos el pedido contigo por WhatsApp, donde acordamos el pago y la entrega. **Todavía no cobramos en línea en el sitio.** Las partes de estos Términos que hablan de pago en línea, contraentrega y cálculo del envío en el sitio aplican **cuando activemos la compra en línea**; cuando eso pase, lo publicaremos aquí con una versión nueva. Tus derechos de **garantía legal** y **retracto** te los da la ley y no dependen del canal: aplican igual si cerramos tu pedido por WhatsApp a partir de una cotización del sitio, porque sigue siendo una **venta a distancia** (Ley 1480 de 2011, arts. 5 num. 16, 47 y 49). La **reversión del pago** es distinta: la ley la condiciona a haber pagado con tarjeta u otro medio electrónico (art. 51), así que aplicará cuando activemos la compra en línea.

## Quiénes somos

**Lucams_shop** es una marca de productos magnéticos personalizados en Colombia, operada por **Lucams_shop (persona natural), Bogotá D.C., Colombia**.

- Correo de contacto: **hola@lucamsshop.com**
- WhatsApp: disponible en el sitio (botón de contacto).
- Peticiones de datos personales (Hábeas Data): **habeas-data@lucamsshop.com**
- Retracto y devoluciones: **retracto@lucamsshop.com**

Si necesitas nuestros datos para un trámite formal o una reclamación, escríbenos a **hola@lucamsshop.com** y te los damos.

## Objeto

Estos Términos regulan la relación entre tú (el **consumidor**) y Lucams_shop (la **vendedora**) cuando visitas el sitio, personalizas un producto, pides una cotización o realizas una compra. Al usar el sitio o hacer un pedido, aceptas estas condiciones. Si no estás de acuerdo, por favor no completes tu pedido.

## Los productos

Vendemos imanes y otros productos, algunos de catálogo estándar y otros personalizables en nuestro **Estudio de Personalización**. En la página de cada producto encuentras sus características (medidas, materiales y advertencias cuando aplican), su precio y el tiempo estimado de producción y entrega.

Los colores y acabados pueden variar levemente respecto a lo que ves en pantalla, por diferencias propias de cada monitor y del proceso de impresión.

## Cómo comprar

**Hoy, con la tienda operando por cotización:**

1. Eliges tu producto y, si es personalizable, lo diseñas en el Estudio.
2. Lo agregas al carrito y pides tu cotización dejándonos tu nombre, tu WhatsApp y tu ciudad.
3. Te damos un número de cotización y seguimos la conversación por WhatsApp.
4. Ahí te confirmamos el total, el costo del envío y el medio de pago **antes** de que pagues, y coordinamos la entrega.

**Cuando activemos la compra en línea**, el flujo será:

1. Eliges tu producto y, si es personalizable, lo diseñas en el Estudio.
2. Lo agregas al carrito y confirmas los datos de envío.
3. Ves el costo de envío y el total **antes** de pagar.
4. Eliges el medio de pago y confirmas el pedido.
5. Recibes la confirmación por correo y, cuando despachamos, el número de guía para hacer seguimiento.

## Precios y pago

- Los precios están en **pesos colombianos (COP)** y son el **valor final que pagas** por el producto.
- El **costo de envío** se te informa **antes** de que pagues: hoy por WhatsApp al confirmar tu cotización y, cuando activemos la compra en línea, calculado en el sitio. No hay cobros ocultos.
- Mientras la tienda opere por cotización, el **medio de pago lo acordamos contigo por WhatsApp** antes de producir tu pedido. Cuando activemos la compra en línea aceptaremos **tarjeta de crédito y débito, PSE y otros medios** a través de **Wompi**, y **pago contraentrega** donde esté disponible.
- **Sobre comprobantes.** Hoy la vendedora **no está obligada a expedir factura de venta**, por ser persona natural **no responsable de IVA** (Estatuto Tributario, art. 437 parágrafo 3, y Decreto 1625 de 2016, art. 1.6.1.4.3 numeral 3). Por cada compra te entregamos la **constancia de la operación** con el detalle de lo que pediste, lo que pagaste y la fecha. Si en el futuro quedamos obligadas a facturar, lo publicaremos aquí antes de que aplique.

## Envío y entrega

Despachamos a través de **transportadoras aliadas** (ver [Subprocesadores](/legal/subprocesadores)). El tiempo de entrega depende de tu ciudad y se te informa **antes** de que pagues. Cuando el pedido incluye personalización, al plazo de envío se suma el tiempo de producción, que también se indica en el producto.

Hoy el envío se **coordina y se cotiza por WhatsApp** al cerrar tu cotización. Cuando activemos la compra en línea, el costo se calculará en el sitio a través de nuestro operador logístico y, donde ofrezcamos **contraentrega**, el recaudo del pago lo gestionará ese operador al momento de la entrega.

## Derecho de retracto

Como consumidor tienes **derecho de retracto** (Ley 1480 de 2011, art. 47): dentro de los **cinco (5) días hábiles** siguientes a la entrega puedes retractarte de la compra **sin dar explicaciones**, siempre que devuelvas el producto en las mismas condiciones en que lo recibiste. Es un derecho de las **ventas a distancia**, así que también cubre los pedidos que cerramos contigo por WhatsApp a partir de una cotización del sitio.

Cuando ejerces el retracto, te **devolvemos el dinero en un máximo de quince (15) días calendario** contados desde que ejerces el derecho (plazo de la **Ley 2439 de 2024**, que modificó el art. 47).

**Excepción — productos personalizados:** conforme al mismo art. 47, los productos **claramente personalizados o confeccionados según tus especificaciones** —los que llevan tu foto, tu texto o tu diseño hecho en el Estudio— **no admiten retracto**, porque se elaboran solo para ti. Los productos del **catálogo estándar** (sin personalización tuya) **sí tienen retracto**.

Para ejercerlo, escríbenos a **retracto@lucamsshop.com** o por WhatsApp. Más detalle en [Devoluciones y Retracto](/legal/devoluciones).

## Garantía legal

Todos los productos cuentan con **garantía legal** (Ley 1480 de 2011, arts. 7 a 16) de **mínimo un (1) año** contado desde la entrega, frente a defectos de fabricación o de calidad. La garantía no cubre el daño causado por uso indebido, descuido o desgaste normal.

Ante un defecto cubierto, primero lo **reparamos totalmente gratis**, y el transporte corre por nuestra cuenta. Si el producto **no admite reparación** o **la falla se repite** después de arreglarlo, ahí **eliges tú** entre que te lo **cambiemos** por uno nuevo o que te **devolvamos el dinero** (Ley 1480 de 2011, art. 11). Para hacerla efectiva, contáctanos por los canales de arriba. Más detalle en [Garantías](/legal/garantias).

## Reversión del pago

Este derecho aplica **cuando activemos la compra en línea**, porque la ley lo condiciona a que hayas pagado con **tarjeta de crédito, débito u otro instrumento de pago electrónico** (Ley 1480 de 2011, art. 51). Mientras el pago se acuerde por WhatsApp, tus derechos son la **garantía** y el **retracto**, que sí aplican siempre.

Cuando aplique: si ocurre una compra no solicitada o fraudulenta, el producto **no se entrega**, o lo entregado **no corresponde** con lo pedido o está defectuoso, pides la reversión ante la entidad que emitió tu medio de pago y nos avisas. El plazo para atenderla corre contra **los participantes del proceso de pago** —tu banco, la pasarela, el emisor de la tarjeta—, que tienen **quince (15) días hábiles** para devolver el dinero (Decreto 1074 de 2015, art. 2.2.2.51.8). Nosotras te acompañamos en el trámite y respondemos lo que nos corresponda.

## Personalización y contenido que subes

Al subir fotos o textos al Estudio de Personalización, y al confirmar tu pedido, declaras que:

- Tienes derecho a usar ese contenido.
- Cuentas con la autorización de las personas que aparezcan en las imágenes (Ley 1581 de 2012).
- El contenido no infringe derechos de terceros.

Nos autorizas a imprimir ese contenido **únicamente** para producir tu pedido. Revisamos cada pedido antes de imprimirlo y nos reservamos el derecho de **no producir** —y de cancelar y reembolsar— pedidos cuyo contenido sea ilegal, ofensivo o que infrinja derechos de terceros. Si eso ocurre, te avisamos con el motivo.

## Propiedad intelectual

Las marcas, ilustraciones, la mascota, los diseños y los contenidos del sitio son de Lucams_shop o de sus titulares. No pueden reproducirse ni usarse sin autorización previa y escrita.

## Tus datos personales

Tratamos tus datos conforme a la **Ley 1581 de 2012** y sus decretos reglamentarios, con tu autorización previa, expresa e informada. Puedes conocer, actualizar, rectificar y suprimir tus datos, revocar la autorización y pedir prueba de ella. Consulta el detalle en el [Aviso de Privacidad](/legal/privacidad) y ejerce tus derechos en [Hábeas Data](/legal/habeas-data).

Algunos de nuestros proveedores tecnológicos están fuera de Colombia (por ejemplo alojamiento y correo en EE. UU.). Como tratan tus datos **por nuestra cuenta**, eso es una **transmisión internacional** —no una transferencia— y va amparada por un contrato de transmisión con cada uno, con las garantías descritas en el Aviso de Privacidad y en la lista de [Subprocesadores](/legal/subprocesadores).

## PQR y atención al cliente

Estamos para ayudarte. Escríbenos a **hola@lucamsshop.com**, por WhatsApp, o —para temas de datos— a **habeas-data@lucamsshop.com**.

- Respondemos tus **consultas** en máximo **diez (10) días hábiles**.
- Respondemos tus **reclamos** en máximo **quince (15) días hábiles** (Ley 1581 de 2012, arts. 14 y 15).

## Ley aplicable y solución de controversias

Estos Términos se rigen por las **leyes de Colombia**. Cualquier controversia se resuelve ante los **jueces colombianos**. Como consumidor, también puedes acudir a la **Superintendencia de Industria y Comercio (SIC)**, autoridad de protección al consumidor y de protección de datos personales en Colombia.

## Cambios en estos Términos

Podemos actualizar estos Términos para reflejar cambios legales o de nuestro servicio. Publicaremos la versión vigente en esta página con su fecha; los cambios importantes se comunican y, cuando corresponda, se solicita tu nueva aceptación.

---

_Versión 3 · vigente desde 2026-07-24 · en revisión por asesoría legal antes del lanzamiento_
`;

export default function Page() {
  return (
    <>
      <LegalPageHeader blockKey="legal.terminos.heading" defaultTitle="Términos y Condiciones" />
      <CmsMarkdown blockKey="legal.terminos" fallback={FALLBACK} className="mt-6" />
    </>
  );
}
