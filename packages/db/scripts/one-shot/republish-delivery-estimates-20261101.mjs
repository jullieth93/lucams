#!/usr/bin/env node
/*
 * Republica el lenguaje de entrega como ESTIMACIÓN (preparación antes del
 * despacho + tránsito después del despacho) en campos CMS que ya podían tener
 * publicado el default anterior. `migrate-cms-v2` no pisa bodies existentes.
 *
 * Seguridad:
 *   - dry-run por defecto; solo escribe con --apply;
 *   - un campo exacto solo cambia si conserva el default anterior;
 *   - legal.terminos reemplaza únicamente el párrafo anterior exacto y conserva
 *     cualquier edición del owner fuera de ese párrafo;
 *   - crea una CmsFieldVersion nueva: historial intacto y reversible.
 *
 * Su caso de uso incluye una promoción futura a PRD, únicamente después de la
 * aprobación explícita del owner. En esta jornada se ejecuta SOLO contra STG.
 * Por eso está allowlistado como PRD-deliberado en check-script-guards.mjs.
 *
 * Uso desde packages/db:
 *   npx dotenv -e ../../.env.stg -- node scripts/one-shot/republish-delivery-estimates-20261101.mjs
 *   npx dotenv -e ../../.env.stg -- node scripts/one-shot/republish-delivery-estimates-20261101.mjs --apply
 *
 * Tras aplicar: invalidar caché CMS desde /admin/contenido o esperar 1 hora.
 */

import { PrismaClient } from "@prisma/client";

const APPLY = process.argv.includes("--apply");
const prisma = new PrismaClient();

const EXACT_FIELDS = [
  {
    key: "checkout.shipping.note",
    oldBody:
      "Son tiempos **estimados por la transportadora**, no una fecha garantizada. Antes fabricamos tu pedido a mano: lo **despachamos en máximo 2 días hábiles** y el tránsito corre **después del despacho**.",
    newBody:
      "Son tiempos **estimados**, no una fecha garantizada. La **preparación toma alrededor de 2 días hábiles antes del despacho** y el tránsito se cuenta **después del despacho**. En todo caso, el plazo máximo legal de entrega es de **30 días calendario**.",
  },
  {
    key: "checkout.shipping.lucams-today",
    oldBody: "Te llega hoy · pedido antes de las {{cutoff}}:00",
    newBody:
      "Entrega estimada hoy · pedido antes de las {{cutoff}}:00 · sujeta a disponibilidad de ruta",
  },
  {
    key: "checkout.shipping.lucams-days",
    oldBody: "Te llega en {{daysLabel}} · fabricación incluida, entrega el mismo día del despacho",
    newBody: "Entrega estimada en alrededor de {{daysLabel}} · incluye preparación y ruta local",
  },
  {
    key: "checkout.shipping.lucams-badge-today",
    oldBody: "LUCAMS · mismo día",
    newBody: "LUCAMS · estimado hoy",
  },
  {
    key: "pdp.envio.lucams-entrega",
    oldBody: "(localidades habilitadas) la entrega es el",
    newBody: "(localidades habilitadas), la ruta se estima para el",
  },
  {
    key: "pdp.envio.lucams-mismo-dia",
    oldBody: "mismo día del despacho",
    newBody: "mismo día del despacho, sujeta a disponibilidad",
  },
  {
    key: "home.hero.chip-eta",
    oldBody:
      "Despacho en máx. {{fab}} días hábiles · la transportadora tarda ~{{entrega}} días según tu ciudad",
    newBody:
      "Preparación estimada: alrededor de {{fab}} días hábiles · tránsito estimado: ~{{entrega}} días después del despacho",
  },
  {
    key: "home.howitworks.step3.description",
    oldBody:
      "Lo producimos a mano y despachamos en máximo {{fab}} días hábiles; desde ahí, la transportadora tarda ~{{entrega}} días más según tu ciudad. Pagas en línea de forma segura — contraentrega disponible.",
    newBody:
      "La preparación toma alrededor de {{fab}} días hábiles antes del despacho; desde ahí, el tránsito estimado es de ~{{entrega}} días según tu ciudad. Pagas en línea de forma segura — contraentrega disponible.",
  },
  {
    key: "faq.02-cuanto-demora",
    oldBody:
      "Lo producimos a mano y lo **despachamos en máximo {{fab}} días hábiles** desde que confirmas. Desde ahí, la transportadora tarda ~{{entrega}} días según tu ciudad; al despachar te enviamos el número de guía para que sigas tu pedido.",
    newBody:
      "La **preparación toma alrededor de {{fab}} días hábiles antes del despacho**. Desde ahí, el tránsito estimado de la transportadora es de ~{{entrega}} días según tu ciudad; al despachar te enviamos el número de guía para que sigas tu pedido.",
  },
];

const LEGAL_OLD =
  "Despachamos a través de **transportadoras aliadas** (ver [Subprocesadores](/legal/subprocesadores)). El tiempo de entrega depende de tu ciudad y se te informa **antes** de que pagues. Cuando el pedido incluye personalización, al plazo de envío se suma el tiempo de producción, que también se indica en el producto.";
const LEGAL_NEW =
  "Despachamos a través de **transportadoras aliadas** (ver [Subprocesadores](/legal/subprocesadores)). Antes de pagar te mostramos por separado el tiempo **estimado de preparación antes del despacho** y el tiempo **estimado de tránsito después del despacho**. Ambos pueden variar según el producto, el destino, la capacidad operativa y la transportadora; no constituyen una fecha garantizada.";

async function publish(field, body) {
  const last = await prisma.cmsFieldVersion.findFirst({
    where: { fieldId: field.id },
    orderBy: { version: "desc" },
    select: { version: true },
  });
  const version = await prisma.cmsFieldVersion.create({
    data: {
      fieldId: field.id,
      version: (last?.version ?? 0) + 1,
      title: field.publishedVersion?.title ?? null,
      body,
      metadata: field.publishedVersion?.metadata ?? {},
      publishedAt: new Date(),
      createdBy: "script:republish-delivery-estimates-20261101",
    },
  });
  await prisma.cmsField.update({
    where: { id: field.id },
    data: { body, publishedVersionId: version.id, isPublished: true },
  });
  return version.version;
}

async function inspectExact(entry) {
  const field = await prisma.cmsField.findUnique({
    where: { key: entry.key },
    include: { publishedVersion: true },
  });
  if (!field) return { status: "skip", message: "no existe; migrate-cms-v2 lo sembrará" };
  const current = field.publishedVersion?.body ?? "";
  if (current === entry.newBody) return { status: "skip", message: "ya actualizado" };
  if (current !== entry.oldBody) {
    return { status: "skip", message: "difiere del default anterior; posible edición del owner" };
  }
  const version = APPLY ? await publish(field, entry.newBody) : null;
  return { status: "update", message: version ? `publicado v${version}` : "actualizable" };
}

async function inspectLegal() {
  const field = await prisma.cmsField.findUnique({
    where: { key: "legal.terminos" },
    include: { publishedVersion: true },
  });
  if (!field) return { status: "skip", message: "legal.terminos no existe" };
  const current = field.publishedVersion?.body ?? "";
  if (current.includes(LEGAL_NEW)) return { status: "skip", message: "ya actualizado" };
  if (!current.includes(LEGAL_OLD)) {
    return { status: "skip", message: "no contiene el párrafo anterior exacto; no se toca" };
  }
  const next = current.replace(LEGAL_OLD, LEGAL_NEW);
  const version = APPLY ? await publish(field, next) : null;
  return { status: "update", message: version ? `publicado v${version}` : "actualizable" };
}

async function main() {
  console.log(APPLY ? "=== APPLY (ambiente seleccionado) ===" : "=== DRY-RUN (sin cambios) ===");
  let updates = 0;
  for (const entry of EXACT_FIELDS) {
    const result = await inspectExact(entry);
    if (result.status === "update") updates++;
    console.log(`${result.status === "update" ? "→" : "="} ${entry.key}: ${result.message}`);
  }
  const legal = await inspectLegal();
  if (legal.status === "update") updates++;
  console.log(`${legal.status === "update" ? "→" : "="} legal.terminos: ${legal.message}`);
  console.log(`Listo: ${updates} campo(s) ${APPLY ? "actualizado(s)" : "actualizable(s)"}.`);
  if (!APPLY) console.log("Para ejecutar en el ambiente seleccionado: agrega --apply.");
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
