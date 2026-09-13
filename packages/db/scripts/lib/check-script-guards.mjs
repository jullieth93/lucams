/*
 * Lint de guards de ambiente (N-06, 2026-09-12) — gate del job quality en CI
 * (.github/workflows/ci.yml) y `make audit-script-guards`.
 *
 * Regla: TODO script .mjs de packages/db/scripts que ESCRIBE en la DB debe
 * importar lib/env-guard.mjs (la guarda fail-closed que bloquea PRD/remotos no
 * reconocidos). Antes de N-06, 63/79 scripts escribían sin guarda — incluidos
 * los 5 canónicos del Makefile y los break-glass de administración.
 *
 * Heurística de "escribe en la DB" (conservadora — mejor un falso positivo
 * que un script destructivo sin guarda):
 *   - (prisma|tx|db).<modelo>.<create|update|delete|upsert|deleteMany|
 *     updateMany|createMany>   (tx = clientes de $transaction)
 *   - $executeRaw (SQL crudo con efectos)
 *   - auth.admin.(createUser|deleteUser|updateUserById|mfa.deleteFactor)
 *     (escrituras vía Supabase Admin API, ej. admin-mfa-reset)
 *
 * Alcance: packages/db/scripts (raíz y one-shot/, recursivo). EXCEPTO:
 *   - lib/ (módulos importados por los entrypoints, no scripts ejecutables) y
 *   - *.test.mjs (tests del runner nativo).
 *
 * ALLOWLIST (PRD-deliberado — su caso de uso ES correr contra PRD; ya tienen
 * dry-run por defecto + `--apply` y la justificación en su header):
 *   - update-public-content-20260911.mjs
 *   - update-production-days-20260911.mjs
 *   - publish-legal-v5-20260911.mjs
 * Agregar a la allowlist exige editar ESTE archivo (dif visible en PR) con la
 * misma justificación en el header del script exento.
 *
 * Uso:
 *   node scripts/lib/check-script-guards.mjs    # exit 1 lista los infractores
 */

import { readdirSync, readFileSync, existsSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const SCRIPTS_DIR = join(HERE, "..");

const ALLOWLIST_PRD_DELIBERADO = new Set([
  "update-public-content-20260911.mjs",
  "update-production-days-20260911.mjs",
  "publish-legal-v5-20260911.mjs",
]);

const WRITE_RE =
  /(?:prisma|tx|db)\.[a-zA-Z_$][\w$]*\.(?:create|update|delete|upsert|deleteMany|updateMany|createMany|createManyAndReturn)\b|\$executeRaw|auth\.admin\.(?:createUser|deleteUser|updateUserById|mfa\.deleteFactor)/;
const GUARD_RE = /from\s+["'][./]*lib\/env-guard\.mjs["']/;

/** Lista recursiva de .mjs bajo dir, excluyendo lib/ y *.test.mjs. */
function listScripts(dir) {
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "lib") continue;
      out.push(...listScripts(full));
    } else if (entry.name.endsWith(".mjs") && !entry.name.endsWith(".test.mjs")) {
      out.push(full);
    }
  }
  return out;
}

const offenders = [];
let checked = 0;
let guarded = 0;
let readOnly = 0;

for (const file of listScripts(SCRIPTS_DIR)) {
  const rel = relative(SCRIPTS_DIR, file);
  if (ALLOWLIST_PRD_DELIBERADO.has(rel)) continue;
  const src = readFileSync(file, "utf-8");
  if (!WRITE_RE.test(src)) {
    readOnly++;
    continue;
  }
  checked++;
  if (GUARD_RE.test(src)) {
    guarded++;
  } else {
    offenders.push(rel);
  }
}

// Allowlist sana: cada entrada debe existir (si se borra/renombra el script,
// la entrada sobrante es deuda que hay que limpiar acá).
for (const rel of ALLOWLIST_PRD_DELIBERADO) {
  if (!existsSync(join(SCRIPTS_DIR, rel))) {
    offenders.push(`(allowlist huérfana) ${rel} — el script ya no existe; limpiar check-script-guards.mjs`);
  }
}

if (offenders.length > 0) {
  console.error("✗ check-script-guards: scripts que ESCRIBEN en DB sin env-guard:");
  for (const o of offenders) console.error(`  - ${o}`);
  console.error(
    "\nFix: importar y llamar assertDestructiveAllowed de lib/env-guard.mjs al inicio " +
      "(patrón: cleanup-test-junk.mjs). Si el script es PRD-deliberado, justificarlo en su " +
      "header y allowlistarlo acá.",
  );
  process.exit(1);
}

console.log(
  `✓ check-script-guards: ${guarded}/${checked} scripts con escritura importan env-guard ` +
    `(+${ALLOWLIST_PRD_DELIBERADO.size} PRD-deliberado allowlistados, ${readOnly} solo-lectura).`,
);
