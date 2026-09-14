/*
 * Eliminación de SETTINGS CMS ZOMBI (N-10 / CF-19, 2026-09-12): CmsField
 * kind=SETTING sin ningún lector en el código (lista en
 * lib/zombie-settings.mjs — 15 keys verificadas contra apps/web en la
 * auditoría 360°), con TODAS sus versiones (CmsFieldVersion) e items
 * (CmsListItem). Son texto muerto editable en /admin/contenido que promete un
 * efecto que nunca ocurre.
 *
 * Origen de las filas: migración legacy SiteSetting→CmsField (2026-07-30).
 * NO están inline en cms-site-map.mjs → migrate-cms-v2 no las resiembra
 * (hay un test en lib/zombie-settings.test.mjs que bloquea su regreso al
 * site map). Por eso este script NO toca cms-site-map.mjs: no hay nada que
 * quitar ahí.
 *
 * Guardarraíles: DRY-RUN por defecto (`--apply` ejecuta), env-guard
 * fail-closed, transacción única, conteos antes/después. Reporta también las
 * keys de la lista que NO existen en la DB (la auditoría hablaba de ~14; el
 * conteo real por ambiente sale de este reporte).
 *
 * Uso:
 *   node scripts/remove-zombie-settings.mjs            # DRY-RUN
 *   node scripts/remove-zombie-settings.mjs --apply    # elimina (transacción)
 */

import { PrismaClient } from "@prisma/client";
import { assertDestructiveAllowed } from "./lib/env-guard.mjs";
import { ZOMBIE_SETTING_KEYS } from "./lib/zombie-settings.mjs";

const stripQuotes = (v) => v?.replace(/^["']|["']$/g, "");
process.env.DATABASE_URL = stripQuotes(process.env.DATABASE_URL);
process.env.DIRECT_URL = stripQuotes(process.env.DIRECT_URL);

// Guarda de ambiente: hard delete de campos CMS — bloquea PRD/remotos no STG.
assertDestructiveAllowed("remove-zombie-settings.mjs");

const prisma = new PrismaClient();
const APPLY = process.argv.includes("--apply");

async function main() {
  console.log(`=== remove-zombie-settings (${APPLY ? "APPLY" : "DRY-RUN"}) ===\n`);

  const fields = await prisma.cmsField.findMany({
    where: { key: { in: ZOMBIE_SETTING_KEYS } },
    select: {
      id: true,
      key: true,
      kind: true,
      label: true,
      deletedAt: true,
      _count: { select: { versions: true, items: true } },
    },
    orderBy: { key: "asc" },
  });

  const foundKeys = new Set(fields.map((f) => f.key));
  const missing = ZOMBIE_SETTING_KEYS.filter((k) => !foundKeys.has(k));
  const wrongKind = fields.filter((f) => f.kind !== "SETTING");

  const settingsBefore = await prisma.cmsField.count({ where: { kind: "SETTING" } });
  console.log(`CmsField SETTING en DB (antes): ${settingsBefore}`);
  console.log(`Keys zombi declaradas: ${ZOMBIE_SETTING_KEYS.length} · encontradas: ${fields.length}`);
  if (missing.length > 0) console.log(`Ausentes en esta DB (nada que borrar): ${missing.join(", ")}`);

  if (fields.length === 0) {
    console.log("\nNada que eliminar (idempotente ✓).");
    return;
  }

  console.log("\nCampos a eliminar (con versiones e items):");
  let versions = 0;
  let items = 0;
  for (const f of fields) {
    versions += f._count.versions;
    items += f._count.items;
    console.log(
      `  ⊘ ${f.key} [${f.kind}] — "${f.label}" · ${f._count.versions} versiones · ${f._count.items} items${f.deletedAt ? " · ya soft-deleted" : ""}`,
    );
  }
  if (wrongKind.length > 0) {
    console.error(
      `\n✗ ABORTO: ${wrongKind.length} campo(s) de la lista NO son kind=SETTING — la lista exige revisión antes de borrar:`,
    );
    for (const f of wrongKind) console.error(`  ${f.key} es ${f.kind}`);
    process.exit(1);
  }

  if (!APPLY) {
    console.log(
      `\nDRY-RUN (sin cambios). Se eliminarían ${fields.length} campos + ${versions} versiones + ${items} items.`,
    );
    console.log("Para ejecutar: node scripts/remove-zombie-settings.mjs --apply");
    return;
  }

  const result = await prisma.$transaction(async (tx) => {
    const ids = fields.map((f) => f.id);
    // publishedVersionId es una FK del propio campo a una de sus versiones
    // (SetNull): se desliga primero para que el borrado de versiones no choque.
    await tx.cmsField.updateMany({ where: { id: { in: ids } }, data: { publishedVersionId: null } });
    const v = await tx.cmsFieldVersion.deleteMany({ where: { fieldId: { in: ids } } });
    const i = await tx.cmsListItem.deleteMany({ where: { fieldId: { in: ids } } });
    const f = await tx.cmsField.deleteMany({ where: { id: { in: ids } } });
    return { fields: f.count, versions: v.count, items: i.count };
  });

  const settingsAfter = await prisma.cmsField.count({ where: { kind: "SETTING" } });
  console.log(
    `\n✓ Eliminados ${result.fields} campos + ${result.versions} versiones + ${result.items} items (transacción única).`,
  );
  console.log(`CmsField SETTING en DB (después): ${settingsAfter} (antes: ${settingsBefore}).`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
