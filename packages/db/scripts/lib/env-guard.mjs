/*
 * Guarda de AMBIENTE para operaciones destructivas (borrados/purgas masivas).
 *
 * Por qué existe: los scripts de limpieza (seed-clean, purge-*, cleanup-*) y el
 * global-teardown de vitest hacen borrados/soft-deletes masivos, y nada impedía
 * correrlos por accidente contra la DB de PRODUCCIÓN (ej. con el .env equivocado
 * cargado, o un DATABASE_URL de PRD en la shell). Un solo `node scripts/purge-….mjs`
 * con el env de PRD hubiera sido un incidente.
 *
 * FILOSOFÍA FAIL-CLOSED (cambio 2026-09-12, N-06 — antes era fail-open):
 *   la guarda PERMITE solo los destinos que reconoce como seguros y BLOQUEA
 *   todo lo demás. Antes los hosts remotos ajenos a Supabase y las URLs no
 *   parseables caían en la clase "other" y NO se bloqueaban (limitación
 *   declarada en este mismo header) — un typo en el host o una URL con formato
 *   raro dejaba la puerta abierta. Ahora "other"/"unknown" = BLOQUEADO con el
 *   mismo escape hatch que PRD.
 *
 * Qué permite SIN fricción (la guarda es un no-op):
 *   - hosts locales: 127.0.0.1, localhost, ::1, host.docker.internal
 *     (Supabase LOCAL vía podman / `supabase start` y Postgres de CI).
 *   - el proyecto de STG (Supabase cloud ref mjbdiqdkykhsixvqlrrp), detectado por
 *     el ref en la URL — aparece en el host (db.<ref>.supabase.co) o en el usuario
 *     del pooler (postgres.<ref>@…pooler.supabase.com).
 *
 * Qué BLOQUEA con mensaje claro:
 *   - el proyecto de PRD (ref zxkucphbsfygakgxcnik),
 *   - CUALQUIER otro *.supabase.co / *.supabase.com desconocido,
 *   - CUALQUIER host remoto ajeno a Supabase (clase "other"), y
 *   - URLs presentes pero no parseables (clase "unknown").
 *
 * Escape hatch (documentado, usar sabiendo lo que se hace):
 *   LUCAMS_ALLOW_DESTRUCTIVE_REMOTE=1 node scripts/purge-test-orders.mjs --apply
 *   pensado para una purga DELIBERADA contra un remoto (ej. limpiar STG cloud con
 *   URL distinta, o una intervención autorizada en PRD).
 *
 * Las URLs se leen de process.env (DIRECT_URL y DATABASE_URL; cualquiera de las
 * dos que apunte a un destino bloqueado bloquea la operación). Los scripts cargan
 * el .env vía dotenv-cli ANTES de importar este helper, así que acá solo miramos
 * process.env.
 */

const STG_REF = "mjbdiqdkykhsixvqlrrp";
const PRD_REF = "zxkucphbsfygakgxcnik";
const LOCAL_HOSTS = new Set(["127.0.0.1", "localhost", "::1", "host.docker.internal"]);

/**
 * Clasifica una URL de conexión.
 * @param {string | undefined} url
 * @returns {"local" | "stg" | "prd" | "supabase-remote" | "other" | "unknown" | "absent"}
 */
export function classifyUrl(url) {
  if (!url) return "absent";
  if (url.includes(PRD_REF)) return "prd";
  if (url.includes(STG_REF)) return "stg";
  let host = "";
  try {
    host = new URL(url).hostname;
  } catch {
    return "unknown"; // URL no parseable: fail-closed → se bloquea (N-06, 2026-09-12).
  }
  if (LOCAL_HOSTS.has(host)) return "local";
  if (
    host === "supabase.co" ||
    host.endsWith(".supabase.co") ||
    host === "supabase.com" ||
    host.endsWith(".supabase.com")
  ) {
    return "supabase-remote";
  }
  return "other";
}

/** Clases que BLOQUEAN la operación (todo lo que no sea local/STG/ausente). */
const BLOCKED_KINDS = new Set(["prd", "supabase-remote", "other", "unknown"]);

/**
 * Evalúa si una operación destructiva está permitida con el env actual.
 * @param {NodeJS.ProcessEnv} [env]
 * @returns {{ allowed: boolean, bypassed: boolean, reason: string }}
 */
export function checkDestructiveAllowed(env = process.env) {
  const urls = [env.DIRECT_URL, env.DATABASE_URL].filter(Boolean);
  const kinds = urls.map(classifyUrl);
  const blockedIdx = kinds.findIndex((k) => BLOCKED_KINDS.has(k));
  const blocked = blockedIdx !== -1;

  if (!blocked) return { allowed: true, bypassed: false, reason: "" };

  const target =
    urls[blockedIdx]?.replace(/\/\/[^@]*@/, "//***@") ?? "(sin URL)";
  const kindLabel =
    kinds[blockedIdx] === "unknown"
      ? "URL no parseable"
      : kinds[blockedIdx] === "other"
        ? "host remoto no reconocido"
        : "destino remoto NO permitido";
  const reason =
    `${kindLabel} (${target}). Solo se permiten hosts locales ` +
    `(127.0.0.1/localhost/host.docker.internal) y STG (${STG_REF}). ` +
    `Si la operación contra este destino es DELIBERADA, corre con LUCAMS_ALLOW_DESTRUCTIVE_REMOTE=1.`;

  if (env.LUCAMS_ALLOW_DESTRUCTIVE_REMOTE === "1") {
    return {
      allowed: true,
      bypassed: true,
      reason: `bypass manual LUCAMS_ALLOW_DESTRUCTIVE_REMOTE=1 → ${target}`,
    };
  }
  return { allowed: false, bypassed: false, reason };
}

/**
 * Guarda para scripts destructivos: si el destino está bloqueado, explica y sale con 1.
 * Llamar al inicio del main (antes de crear el PrismaClient / tocar la DB).
 * @param {string} scriptName nombre del script, para el mensaje.
 */
export function assertDestructiveAllowed(scriptName) {
  const res = checkDestructiveAllowed();
  if (res.allowed) {
    if (res.bypassed) console.warn(`[env-guard] ${scriptName}: ${res.reason}`);
    return;
  }
  console.error(`[env-guard] ${scriptName}: BLOQUEADO — ${res.reason}`);
  process.exit(1);
}
