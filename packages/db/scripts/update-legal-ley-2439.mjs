/*
 * Script ONE-SHOT (2026-05-13) — actualiza bloques CmsBlock legal.* con
 * la versión Ley 2439/2024.
 *
 * Por qué este script existe (y por qué es one-shot):
 *
 *   seed-cms.mjs preserva ediciones manuales de Lucy: si un bloque ya
 *   existe en DB, NO pisa el body. Eso protege contra "el seed pisó mi
 *   cambio". Pero significa que actualizaciones LEGALES (Ley 2439/2024
 *   modificó el plazo de reembolso de 30 días hábiles a 15 días
 *   calendario) tampoco se aplican al simplemente re-correr el seed.
 *
 *   Este script publica nueva versión PUBLICADA para 3 bloques legal.*
 *   solo si el body actual matchea el texto VIEJO (heurística:
 *   contiene "30 días siguientes"). Si Lucy ya editó el texto, log
 *   warning y no toca — ella decide.
 *
 *   Se ejecuta una vez. Después de eso, los bloques quedan al día.
 *   Futuras actualizaciones legales = nuevo script one-shot con
 *   fecha en el nombre del archivo.
 *
 * Bloques afectados:
 *   - legal.devoluciones — 30 días hábiles → 15 días calendario
 *   - legal.terminos — agregar mención Ley 2439/2024
 *   - legal.privacidad — mejorar copy completo (no era inválido legalmente,
 *     pero mejora claridad y agrega responsable + finalidades explícitas)
 *
 * Uso:
 *   make update-legal-ley-2439
 */

import { PrismaClient } from "@prisma/client";

const stripQuotes = (v) => v?.replace(/^["']|["']$/g, "");
process.env.DATABASE_URL = stripQuotes(process.env.DATABASE_URL);
process.env.DIRECT_URL = stripQuotes(process.env.DIRECT_URL);

const prisma = new PrismaClient();

console.log("=== update-legal-ley-2439 ===");
console.log("");

// ──────────── Heurísticas de detección de texto "viejo" ────────────
//
// Si el body actual contiene CUALQUIERA de estos marcadores, asumimos
// que Lucy NO lo editó (es el texto seed v1). Solo entonces actualizamos.
//
// Si Lucy editó (texto ya no matchea), log warning + no tocar.

const updates = [
  {
    key: "legal.devoluciones",
    detectOld: (body) =>
      body.includes("Reembolso al medio de pago original dentro de los 30 días siguientes") ||
      body.includes("dentro de los 30 días siguientes a la recepción"),
    newBody: `## Derecho de retracto (Ley 1480 art. 47 + Ley 2439 de 2024)

Tienes **5 días hábiles** desde la entrega para retractarte sin justificación.

### Productos que NO admiten retracto

Conforme al **artículo 47 numeral 1 de la Ley 1480**, no se acepta retracto sobre productos personalizados conforme a tus especificaciones:

- Foto-imanes con tus fotos
- Calendarios con tus 12 fotos
- Recordatorios de eventos con datos personalizados (cumpleaños, bautizo, matrimonio, etc.)
- Imanes publicitarios con tu logo o información empresarial
- Cualquier producto donde tú hayas elegido la imagen, texto, layout o composición final

Esta excepción está claramente identificada en el catálogo: cualquier producto con la etiqueta "Personalizable" cae aquí.

## Cómo retractarte (productos NO personalizados)

1. **Escríbenos** a **hola@lucamsshop.com** o por WhatsApp dentro de los 5 días hábiles desde que recibiste el producto.
2. **Indica el medio de devolución** elegido (el mismo medio de pago original o cuenta bancaria).
3. **Devuelve el producto** en su empaque original sin uso (el costo del envío de devolución lo asume el consumidor según Ley 1480 art. 47).
4. **Reembolso** dentro de **15 días calendario** desde el momento en que cumpliste los requisitos (informaste el medio + devolviste el producto), conforme a la **Ley 2439 de 2024**.

Este plazo de 15 días calendario reemplaza el anterior de 30 días hábiles previsto en la Ley 1480 original.

## Garantía legal

Para defectos de fabricación o calidad (no retracto), ver [Garantías](/legal/garantias). El plazo y procedimiento es distinto.

## Reclamos

Si no quedas conforme con nuestra respuesta puedes acudir a la Superintendencia de Industria y Comercio (SIC): [sic.gov.co](https://www.sic.gov.co/).

*Actualizado 13 de mayo de 2026 — Ley 2439 de 2024.*`,
  },
  {
    key: "legal.terminos",
    detectOld: (body) =>
      body.includes("*Documento en revisión legal — versión final próximamente.*") ||
      !body.includes("Ley 2439"),
    newBody: `Al usar **lucamsshop.com** aceptas estos Términos y Condiciones de uso y compra. Los productos vendidos están sujetos a la legislación colombiana, en particular la **Ley 1480 de 2011** (Estatuto del Consumidor) y la **Ley 2439 de 2024** que modifica disposiciones de comercio electrónico.

## Precios y pagos

Todos los precios en pesos colombianos (COP) incluyen IVA cuando aplique. Aceptamos los siguientes medios de pago:

- Tarjetas crédito/débito y PSE vía Wompi
- Nequi, Bancolombia transferencia, Daviplata (vía Wompi)
- Pago contraentrega con Coordinadora (donde aplique)

## Derecho de retracto

Según el **artículo 47 de la Ley 1480 de 2011**, tienes derecho a retractarte dentro de los **5 días hábiles** siguientes a la entrega, sin necesidad de justificar tu decisión. Conforme a la **Ley 2439 de 2024**, una vez ejerces el retracto y nos entregas el producto, el reembolso se efectúa dentro de **15 días calendario**.

Este derecho no aplica a **productos personalizados conforme a tus especificaciones** (foto-imanes, calendarios con tus fotos, recordatorios de eventos con datos de tu evento, imanes publicitarios con tu logo, etc.) por su naturaleza única e irrepetible (Ley 1480 art. 47 numeral 1).

Ver [Devoluciones y Retracto](/legal/devoluciones) para el procedimiento detallado.

## Garantía legal

Conforme al **artículo 11 de la Ley 1480**, ofrecemos garantía legal de **un año** contado desde la fecha de entrega para defectos de fabricación, materiales o funcionamiento. Ver [Garantías](/legal/garantias).

## Privacidad

Tu información se trata conforme a la **Ley 1581 de 2012** y el **Decreto 1377 de 2013**. Detalles en [Aviso de Privacidad](/legal/privacidad).

## Reclamos

Si tu reclamo no se resuelve, puedes acudir a la Superintendencia de Industria y Comercio (SIC): [sic.gov.co](https://www.sic.gov.co/).

*Documento en revisión por asesoría legal — versión 1.1 actualizada el 13 de mayo de 2026 con Ley 2439 de 2024.*`,
  },
  {
    key: "legal.privacidad",
    detectOld: (body) =>
      body.includes("Estamos puliendo el documento final con asesoría legal") &&
      !body.includes("Conservación de datos"),
    newBody: `En **Lucams_shop** protegemos tus datos personales conforme a la **Ley 1581 de 2012** (Régimen General de Protección de Datos Personales) y el **Decreto 1377 de 2013** que la reglamenta.

## Responsable del tratamiento

**Lucams_shop** opera como emprendimiento de comercio electrónico de productos magnéticos personalizados con domicilio en **Bogotá D.C., Colombia**.

Datos de contacto del responsable:

- Email: **hola@lucamsshop.com**
- WhatsApp: +57 320 887 3826
- Sitio web: [lucamsshop.com](https://lucamsshop.com)

## Datos personales que tratamos

Recolectamos datos para procesar tu pedido y mejorar tu experiencia:

- **Identificación:** nombre, apellidos, documento de identidad (para facturación si aplica)
- **Contacto:** email, teléfono, dirección de envío
- **Comerciales:** historial de pedidos, productos vistos, preferencias
- **Técnicos:** dirección IP, navegador, dispositivo (en cumplimiento con tu consentimiento de cookies)
- **Imágenes:** fotos que subes para personalizar productos (tratadas con confidencialidad — ver Estudio de Personalización)

## Finalidades del tratamiento

Tus datos se usan únicamente para:

1. Procesar y entregar tus pedidos
2. Comunicarte el estado de tus pedidos (email/WhatsApp)
3. Cumplir obligaciones contables, tributarias y de garantía
4. Mejorar el sitio y los productos (analítica anónima si autorizas cookies analíticas)
5. Enviarte comunicaciones comerciales (solo si te suscribes al newsletter)

**No vendemos ni compartimos tus datos con terceros para sus propios fines comerciales.**

## Derechos como titular

Conforme al **artículo 8 de la Ley 1581**, tienes derecho a:

- **Conocer** qué datos tuyos tenemos y para qué los usamos
- **Actualizar** o **rectificar** información inexacta
- **Solicitar prueba** de la autorización otorgada
- **Ser informado** sobre el uso dado a tus datos
- **Revocar la autorización** o **solicitar la supresión** cuando no se respeten los principios legales
- **Presentar queja ante la SIC** (Superintendencia de Industria y Comercio)

Procedimiento detallado en [Hábeas Data](/legal/habeas-data).

## Subprocesadores

Algunos servicios técnicos tratan datos en nuestro nombre (hosting, procesamiento de pagos, envío de emails, logística). Lista completa con DPA firmado en [Subprocesadores](/legal/subprocesadores).

## Cookies

Usamos cookies necesarias para que el sitio funcione y opcionales para mejorar la experiencia. Detalle y panel de preferencias en [Política de Cookies](/legal/cookies).

## Conservación de datos

Mantenemos tus datos mientras tengas cuenta activa o exista relación comercial. Datos contables se conservan por **10 años** conforme al Código de Comercio. Puedes solicitar supresión anticipada vía [Hábeas Data](/legal/habeas-data) — evaluamos cada solicitud según base legal.

## Reclamos

Si consideras que vulneramos tus derechos, puedes presentar queja ante la **Superintendencia de Industria y Comercio (SIC)**: [sic.gov.co](https://www.sic.gov.co/).

## Más información

- [Términos y Condiciones](/legal/terminos)
- [Hábeas Data — ejercicio de derechos](/legal/habeas-data)
- [Política de Cookies](/legal/cookies)
- [Subprocesadores](/legal/subprocesadores)

*Versión 1.1 — actualizada el 13 de mayo de 2026. Documento sujeto a revisión por asesoría legal antes del lanzamiento productivo.*`,
  },
];

let updated = 0;
let skipped = 0;
let notFound = 0;

for (const u of updates) {
  const block = await prisma.cmsBlock.findUnique({
    where: { key: u.key },
    include: { publishedVersion: true },
  });

  if (!block) {
    console.log(`  ⚠ ${u.key}  — no existe en DB, skip`);
    notFound++;
    continue;
  }

  const currentBody = block.publishedVersion?.body ?? "";

  if (!u.detectOld(currentBody)) {
    console.log(
      `  ⚠ ${u.key}  — body actual no matchea seed v1 (Lucy lo editó manualmente); NO tocando`,
    );
    skipped++;
    continue;
  }

  // Calcular el próximo número de versión
  const latestVersion = await prisma.cmsBlockVersion.findFirst({
    where: { blockId: block.id },
    orderBy: { version: "desc" },
    select: { version: true },
  });
  const nextVersion = (latestVersion?.version ?? 0) + 1;

  // Crear nueva versión + marcarla como publicada
  await prisma.$transaction(async (tx) => {
    const v = await tx.cmsBlockVersion.create({
      data: {
        blockId: block.id,
        version: nextVersion,
        title: block.title,
        body: u.newBody,
        format: block.format,
        metadata: block.metadata ?? {},
        publishedAt: new Date(),
        createdBy: "system:ley-2439-2024",
      },
    });
    await tx.cmsBlock.update({
      where: { id: block.id },
      data: {
        publishedVersionId: v.id,
        isPublished: true,
        updatedBy: "system:ley-2439-2024",
      },
    });
  });

  console.log(`  ✓ ${u.key}  — versión ${nextVersion} publicada (Ley 2439/2024)`);
  updated++;
}

console.log("");
console.log(
  `Resumen: ${updated} actualizados, ${skipped} preservados (editados por Lucy), ${notFound} no encontrados.`,
);
console.log("");

if (updated > 0) {
  console.log("⚠️ Reminder: el caché de Next.js puede tener el body viejo cacheado.");
  console.log("    Lucy: refresca lucamsshop.com/legal/* y verificá que se vea el texto nuevo.");
  console.log("    Si tarda, hacer purge desde Vercel Dashboard.");
}

await prisma.$disconnect();
process.exit(0);
