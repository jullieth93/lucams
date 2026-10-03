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

- Correo: **{{email_contacto}}**
- WhatsApp: el número que ves en nuestro sitio.

Si necesitas nuestros datos completos de identificación, te los damos con gusto por estos mismos canales.

## Cuánto dura (art. 8)

Tienes **3 meses de garantía**, contados **desde el día en que recibes tu producto**. La ley (art. 8) dice que, a falta de un término fijado por la autoridad competente, la garantía dura **lo que el productor anuncie** —y solo si no se anuncia nada, un año—. Nuestros productos son **papelería magnética personalizada** —impresos hechos a pedido, de alta manipulación— así que fijamos este término acorde a su naturaleza y te lo informamos expresamente aquí, antes de que compres. Aplica a todo nuestro catálogo, sin importar si compraste en línea o si cerramos tu pedido por WhatsApp a partir de una cotización del sitio.

## Cómo se cuenta el plazo (art. 9)

- **Si tu producto entra a reparación, el reloj se pausa.** El término de la garantía se **suspende** durante todo el tiempo que estés sin tu producto por efectividad de la garantía, y se retoma cuando te lo devolvemos. Esos días nunca cuentan en tu contra.
- **Si te reponemos el producto completo** por uno nuevo, el término **corre de nuevo desde cero**: 3 meses completos contados desde la entrega del producto repuesto.

## Qué cubre (art. 7 y 11)

La garantía cubre los **defectos de fabricación, de materiales o de impresión** que no sean culpa del uso. Por ejemplo:

- El imán que se despega o pierde adherencia con uso normal (adherencia del imán de fábrica).
- Impresión que se borra o destiñe rápido sin haber estado al sol o al agua.
- Productos que llegan rotos o defectuosos por fabricación o por embalaje.

**Tus productos personalizados del Estudio también tienen garantía.** La personalización solo te quita el derecho de retracto (la devolución por arrepentimiento), pero nunca la garantía por defectos.

## Qué NO cubre (art. 16)

La ley (art. 16) exonera la garantía cuando el daño no viene de un defecto del producto sino de:

- **Mal uso**: golpes, caídas, dobladuras o un uso distinto al previsto.
- **Fuerza mayor o caso fortuito**: inundaciones, incendios u otros eventos fuera de nuestro control.
- **El hecho de un tercero**: daños causados por otra persona.
- **No seguir las instrucciones de uso y conservación** que te damos abajo: agua, humedad, calor extremo, sol prolongado o químicos de limpieza.

Tampoco es un defecto el **desgaste natural** por el uso normal del producto con el paso del tiempo.

Eso sí: si creemos que tu caso entra en alguna de estas causales, **nos toca a nosotros demostrarlo** (así lo exige el art. 16). No pierdes tu garantía porque nosotros lo digamos; tienes derecho a que te expliquemos por qué, con razones.

## Cómo cuidar tus productos (instrucciones de uso y conservación)

La ley (art. 11) nos pide darte las instrucciones de uso y mantenimiento del producto —y seguirlas mantiene tu garantía a salvo:

- **Nada de agua ni humedad**: no los sumerjas, no los laves bajo el grifo y no los dejes en sitios húmedos.
- **Lejos del calor y del sol**: no los expongas a calor extremo (estufas, carros al sol) ni a sol directo prolongado, para que la impresión no se degrade.
- **Limpieza suave**: usa un paño suave y seco o apenas húmedo; nunca químicos, solventes ni abrasivos.
- **Superficies adecuadas**: úsalos sobre superficies limpias, lisas, secas y ferromagnéticas (nevera, tablero metálico).
- **Sin doblar ni golpear**: manipúlalos por los bordes y evita doblarlos o dejarlos caer.
- **Piezas pequeñas**: mantenlas lejos de niños y niñas **menores de 3 años** (riesgo de atragantamiento).

## Qué puedes pedir (art. 11)

Si tu producto sale con defecto dentro de los **3 meses de garantía**, la ley fija esta escalera:

1. **Primero, reparación totalmente gratis.** El transporte o el envío del producto también corre por nuestra cuenta, nunca por la tuya.
2. **Si el producto no admite reparación**, te lo **reponemos por uno nuevo** o te **devolvemos el dinero que pagaste**.
3. **Si la falla se repite** después de haberlo reparado, ahí **tú eliges** entre:
   - una **nueva reparación** (también gratis),
   - la **devolución total o parcial** del precio que pagaste, o
   - el **cambio** por otro producto de **iguales o mejores características**.

## Quién prueba qué (art. 10)

- A ti te basta **mostrar el defecto** (una foto o un video y tu número de pedido): la ley pone la carga de la prueba de nuestro lado, no del tuyo.
- **Productor y proveedor respondemos solidariamente** por la garantía legal. En Lucams_shop somos ambos, así que respondemos directamente y sin intermediarios.
- Solo quedamos exonerados si **probamos** que el daño viene de una causal del art. 16 (mal uso, fuerza mayor o caso fortuito, hecho de un tercero, o no seguir las instrucciones de uso y conservación).

## Cómo la haces efectiva

1. Escríbenos a **{{email_contacto}}** (o por WhatsApp) con:
   - tu número de pedido o de cotización,
   - una foto o un video del defecto,
   - una breve descripción de qué pasó.
2. Revisamos tu caso y te respondemos en el **menor tiempo posible**. En todo caso, la ley nos da un máximo de **15 días hábiles** para responder tu reclamación (art. 58).
3. Si la garantía procede, coordinamos contigo la reparación, el cambio o la devolución del dinero, **sin ningún costo de envío para ti**.

## Si no llegamos a un acuerdo

Queremos resolverlo directamente contigo, de la mejor manera. Pero si no quedas conforme, puedes acudir a la **Superintendencia de Industria y Comercio (SIC)**, que es la autoridad que protege tus derechos como consumidor en Colombia.

---

_Versión 1 · vigente desde 2026-09-29_
`;

export default function Page() {
  return (
    <>
      <LegalPageHeader blockKey="legal.garantias.heading" defaultTitle="Garantías" />
      <CmsMarkdown blockKey="legal.garantias" fallback={FALLBACK} className="mt-6" />
    </>
  );
}
