/*
 * normalize-magnet-attr.mjs (2026-09-14) — normaliza la clave `magnet` en las
 * variantes "Con imán" creadas ANTES de la dimensión «¿Con imán?» (2026-09-08b).
 *
 * Por qué (hallazgo del paquete ADR-100): en PRD 30 variantes base activas no
 * tienen la clave `magnet` en sus attributes (STG/LOCAL: 0). Efectos medidos
 * en vivo: `conImanDefaultVariant` no preselecciona la opción Con imán → la
 * PDP abre sin variante elegida → el precio tachado no se renderiza (bug
 * reportado por Lucy en "Calendario Set 12 Tarjetas") y el grupo de chips
 * «Con/Sin imán» ni siquiera aparece (la gemela -NOMAG queda inalcanzable).
 *
 * Regla (quirúrgica): variante ACTIVA con attributes.magnet ausente/null y
 * SKU que NO termina en -NOMAG → magnet:true. Nunca toca precio, stock,
 * imágenes ni las gemelas -NOMAG (esas ya traen magnet:false). Idempotente.
 *
 * Guardarraíles (patrón N-06): DRY-RUN por defecto; `--apply` ejecuta;
 * env-guard fail-closed; backup JSON previo en tmp/backups.
 *
 * Uso:
 *   cd packages/db && npx dotenv -e ../../.env.local.nube-backup -- node scripts/normalize-magnet-attr.mjs          # DRY-RUN
 *   cd packages/db && npx dotenv -e ../../.env.local.nube-backup -- node scripts/normalize-magnet-attr.mjs --apply  # ejecuta
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { PrismaClient } from "@prisma/client";
import { assertDestructiveAllowed } from "./lib/env-guard.mjs";

const stripQuotes = (v) => v?.replace(/^["']|["']$/g, "");
process.env.DATABASE_URL = stripQuotes(process.env.DATABASE_URL);
process.env.DIRECT_URL = stripQuotes(process.env.DIRECT_URL);

assertDestructiveAllowed("normalize-magnet-attr.mjs");

const prisma = new PrismaClient();
const APPLY = process.argv.includes("--apply");
const HERE = dirname(fileURLToPath(import.meta.url));
const BACKUP_DIR = join(HERE, "..", "..", "..", "tmp", "backups");

async function main() {
  console.log(`=== normalize-magnet-attr (${APPLY ? "APPLY" : "DRY-RUN"}) ===\n`);
  const targets = await prisma.productVariant.findMany({
    where: {
      deletedAt: null,
      isActive: true,
      product: { deletedAt: null, isActive: true },
      NOT: { sku: { endsWith: "-NOMAG" } },
    },
    select: { id: true, sku: true, attributes: true, product: { select: { slug: true } } },
  });
  const missing = targets.filter((v) => (v.attributes ?? {}).magnet == null);
  console.log(`Variantes activas (sin -NOMAG): ${targets.length} · sin clave magnet: ${missing.length}\n`);
  for (const v of missing) {
    console.log(`  ${APPLY ? "✓" : "→"} ${v.sku} (${v.product.slug}) → magnet:true`);
    if (APPLY) {
      await prisma.productVariant.update({
        where: { id: v.id },
        data: { attributes: { ...(v.attributes ?? {}), magnet: true } },
      });
    }
  }
  if (APPLY && missing.length > 0) {
    mkdirSync(BACKUP_DIR, { recursive: true });
    const file = join(BACKUP_DIR, `magnet-attr-normalize-${Date.now()}.json`);
    writeFileSync(file, JSON.stringify(missing, null, 2));
    console.log(`\nBackup: ${file}`);
  }
  console.log(
    APPLY
      ? `\n✓ ${missing.length} variantes normalizadas.`
      : `\nDRY-RUN (sin cambios). Para ejecutar: --apply`,
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
