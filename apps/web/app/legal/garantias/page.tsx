import type { Metadata } from "next";
import { CmsMarkdown } from "@/components/cms/cms-markdown";
import { LegalPageHeader } from "@/components/legal/legal-page-header";

export const metadata: Metadata = {
  title: "Garantías",
};

// Fallback que se renderiza cuando el CmsBlock no existe, no está publicado o la DB falla.
// Es COPIA EXACTA de packages/db/legal-content/legal.garantias.md (la fuente canónica) y viaja en git,
// así que es el único texto legal garantizado ante una caída de la base.
// legal-content-sync.test.ts falla si ambos divergen.
const FALLBACK = `
En Lucams_shop respondemos por lo que hacemos. Todos nuestros productos tienen **garantía legal** — la que te da la ley colombiana (Ley 1480 de 2011, Estatuto del Consumidor). Aquí te contamos cómo funciona, sin letra pequeña y sin trucos.

## Quién responde por tu garantía

Lucams_shop es una marca operada por **Lucams_shop (persona natural), Bogotá D.C., Colombia**. Somos quienes respondemos directamente por la garantía de todo lo que compras aquí.

- Correo: **hola@lucamsshop.com**
- WhatsApp: el número que ves en nuestro sitio.

Si necesitas nuestros datos completos de identificación, te los damos con gusto por estos mismos canales.

## Cuánto dura (art. 8)

Tienes **1 año de garantía legal**, contado **desde el día en que recibes tu producto**. Es el mínimo que exige la ley y aplica a todo nuestro catálogo, sin importar si compraste en línea o si cerramos tu pedido por WhatsApp a partir de una cotización del sitio.

Mientras reparamos un producto en garantía, ese tiempo **no cuenta en tu contra**: el plazo se suspende y se extiende por los días que el producto esté con nosotros.

## Qué cubre (art. 7 y 11)

La garantía cubre los **defectos de fabricación, de materiales o de funcionamiento** que no sean culpa del uso. Por ejemplo:

- Imanes que se desprenden del soporte con uso normal.
- Impresión que se borra o destiñe rápido sin haber estado al sol o al agua.
- Productos que llegan rotos o defectuosos por fabricación o por embalaje.

**Tus productos personalizados del Estudio también tienen garantía.** La personalización solo te quita el derecho de retracto (la devolución por arrepentimiento), pero nunca la garantía por defectos.

## Qué NO cubre (art. 16)

La garantía no cubre los daños que no vienen de fabricación, como:

- Mal uso, golpes, caídas o exposición prolongada al sol, al agua o al calor.
- Desgaste normal del adhesivo al pegarlo en superficies no magnéticas.
- Daños causados por un tercero o por no seguir las instrucciones de uso y cuidado.

Eso sí: si creemos que tu caso entra en alguna de estas causales, **nos toca a nosotros demostrarlo** (así lo exige el art. 16). No pierdes tu garantía porque nosotros lo digamos; tienes derecho a que te expliquemos por qué, con razones.

## Qué puedes pedir (art. 11)

Si tu producto sale con defecto dentro del año de garantía:

1. Lo **reparamos totalmente gratis**. El transporte o el envío del producto también corre por nuestra cuenta, nunca por la tuya.
2. Si el producto **no se puede reparar**, o si **la falla se repite** después de arreglarlo, **tú eliges** entre:
   - que te lo **cambiemos** por uno nuevo, o
   - que te **devolvamos el dinero que pagaste**.

## Cómo la haces efectiva

1. Escríbenos a **hola@lucamsshop.com** (o por WhatsApp) con:
   - tu número de pedido o de cotización,
   - una foto o un video del defecto,
   - una breve descripción de qué pasó.
2. Revisamos tu caso y te respondemos en el **menor tiempo posible**. En todo caso, la ley nos da un máximo de **15 días hábiles** para responder tu reclamación (art. 58).
3. Si la garantía procede, coordinamos contigo la reparación, el cambio o la devolución del dinero, **sin ningún costo de envío para ti**.

## Si no llegamos a un acuerdo

Queremos resolverlo directamente contigo, de la mejor manera. Pero si no quedas conforme, puedes acudir a la **Superintendencia de Industria y Comercio (SIC)**, que es la autoridad que protege tus derechos como consumidor en Colombia.

---

_Versión 5 · vigente desde 2026-09-04 · sin cambios de fondo; se alinea la versión con el paquete legal v5 (tienda en línea activa) · en revisión por asesoría legal_
`;

export default function Page() {
  return (
    <>
      <LegalPageHeader blockKey="legal.garantias.heading" defaultTitle="Garantías" />
      <CmsMarkdown blockKey="legal.garantias" fallback={FALLBACK} className="mt-6" />
    </>
  );
}
