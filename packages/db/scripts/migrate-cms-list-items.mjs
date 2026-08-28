/*
 * Migración de datos — campos LISTA (CMS v2, roadmap B4, 2026-07-30).
 *
 * Crea las filas CmsListItem de todo CmsField que tenga `metadata.listSchema`
 * (hoy: footer.legal.links — los 8 enlaces legales del footer) a partir de su
 * body JSON actual. Los items son la representación de EDICIÓN en el admin
 * (filas con inputs por subcampo); el body/versión del campo NO se toca — la
 * lectura pública sigue leyendo el mismo JSON de siempre.
 *
 * IDEMPOTENTE: si un campo ya tiene items, se salta (seguro de re-ejecutar).
 *
 * FAQ NO se migra a lista en esta fase: los bloques faq.* individuales (uno
 * por pregunta) funcionan bien con el editor actual de Markdown. Convertir el
 * FAQ completo en un campo lista es una decisión futura (requeriría además
 * consolidar N bloques en uno solo y cambiar la lectura de /ayuda).
 *
 * Uso:
 *   pnpm --filter @lucams/db exec dotenv -e ../../.env.local -- node scripts/migrate-cms-list-items.mjs
 *
 * ⚠️ Este script NO invalida el caché CMS (no toca body ni publicación); no
 * hace falta "Actualizar caché de contenido" después de correrlo.
 */

import { PrismaClient } from "@prisma/client";

const stripQuotes = (v) => v?.replace(/^["']|["']$/g, "");
process.env.DATABASE_URL = stripQuotes(process.env.DATABASE_URL);
process.env.DIRECT_URL = stripQuotes(process.env.DIRECT_URL);

const prisma = new PrismaClient();

console.log("=== migrate-cms-list-items ===\n");

// Extrae el listSchema de la metadata (null si el campo no es LISTA).
// Misma lógica defensiva que getCmsListSchema del service (duplicada acá
// porque los scripts no importan código de apps/web).
function listSchemaOf(metadata) {
  if (typeof metadata !== "object" || metadata === null || Array.isArray(metadata)) return null;
  const raw = metadata.listSchema;
  if (!Array.isArray(raw)) return null;
  const schema = raw.filter(
    (v) =>
      typeof v === "object" &&
      v !== null &&
      typeof v.name === "string" &&
      typeof v.type === "string" &&
      typeof v.label === "string",
  );
  return schema.length > 0 ? schema : null;
}

const report = { listFields: 0, migrated: 0, skipped: 0, itemsCreated: 0, anomalies: [] };

try {
  // Prisma no filtra por dentro de JSON de forma portable → traer los campos
  // vivos y filtrar en JS (son pocos cientos).
  const fields = await prisma.cmsField.findMany({
    where: { deletedAt: null },
    select: { id: true, key: true, body: true, metadata: true },
  });
  const listFields = fields.filter((f) => listSchemaOf(f.metadata));
  report.listFields = listFields.length;

  for (const field of listFields) {
    const existing = await prisma.cmsListItem.count({ where: { fieldId: field.id } });
    if (existing > 0) {
      console.log(`- ${field.key}: ya tiene ${existing} items → se salta.`);
      report.skipped++;
      continue;
    }

    let parsed;
    try {
      parsed = JSON.parse(field.body);
    } catch {
      report.anomalies.push(`${field.key}: body no es JSON válido`);
      continue;
    }
    if (!Array.isArray(parsed)) {
      report.anomalies.push(`${field.key}: body JSON no es un array`);
      continue;
    }

    // Solo los subcampos declarados en el listSchema, como string (el mismo
    // saneo que hace saveCmsFieldItems al guardar desde el admin).
    const schema = listSchemaOf(field.metadata);
    const items = parsed
      .filter((v) => typeof v === "object" && v !== null && !Array.isArray(v))
      .map((entry, position) => {
        const values = {};
        for (const sub of schema) {
          const raw = entry[sub.name];
          values[sub.name] = typeof raw === "string" ? raw : raw == null ? "" : String(raw);
        }
        return { fieldId: field.id, position, values };
      });

    if (items.length > 0) {
      await prisma.cmsListItem.createMany({ data: items });
    }
    console.log(`- ${field.key}: ${items.length} items creados.`);
    report.migrated++;
    report.itemsCreated += items.length;
  }

  console.log("\n--- REPORTE ---");
  console.log(`Campos lista encontrados: ${report.listFields}`);
  console.log(
    `Migrados: ${report.migrated} (${report.itemsCreated} items) · Saltados: ${report.skipped}`,
  );
  if (report.anomalies.length > 0) {
    console.log("⚠️  Anomalías (revisar a mano):");
    for (const a of report.anomalies) console.log(`   - ${a}`);
  }
  console.log("\nListo.");
} finally {
  await prisma.$disconnect();
}
