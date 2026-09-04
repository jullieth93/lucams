/*
 * Helpers PUROS del DR drill de DB (dr-drill.mjs — ADR-059): clasificación de
 * los errores que psql reporta durante el restore y conteo de las filas COPY
 * que trae el dump. Sin I/O ni SDKs — todo es testeable con vitest
 * (dr-drill-lib.test.ts), mismo patrón que backup-lib.mjs / backup-storage-lib.mjs.
 *
 * 2026-09-04 — por qué existe este módulo (hallazgo del drill mensual rojo):
 *
 * 1) El run 33632291276 (2026-09-02) salió ROJO por `Product=11 < umbral 100`,
 *    NO por un restore roto: el set de errores del restore es IDÉNTICO al del
 *    run verde 30972179553 (2026-08-05) — 60 colisiones contra los schemas
 *    internos de Supabase que la imagen supabase/postgres ya trae pre-creados
 *    (auth, storage, vault, extensions, pgbouncer, realtime, graphql…). El
 *    catálogo real pasó de 612 a 11 productos con la depuración pre-producción
 *    del 2026-08-10 (commit 0229a07: 555 productos fixture hard-deleted,
 *    aprobado por Lucy; estado final 9 activos + 2 archivados = 11). El dump
 *    del 2026-09-02 es fiel a prod; el umbral estaba calibrado al catálogo
 *    semilla. Por eso la verificación de conteos ahora es EXACTA contra las
 *    filas COPY del propio dump (autocalibrada) y el piso DRILL_MIN_PRODUCTS
 *    solo queda como detector de dumps vacíos.
 *
 * 2) Bug de observabilidad: psql en modo archivo prefija los errores con
 *    `psql:<archivo>:<línea>: ERROR: …`, así que el viejo filtro
 *    `line.startsWith("ERROR")` NO VEÍA NINGÚN error — ambos runs reportaron
 *    "errores SQL durante restore: 0" con 60 errores reales. El drill volaba
 *    a ciegas: un error de restore VERDADERO (datos truncados, constraint
 *    rota en public) hubiera pasado igual de inadvertido. Ahora el drill es
 *    FAIL-CLOSED: cualquier error fuera de la allowlist explícita de abajo
 *    (colisiones esperadas contra objetos internos de Supabase) lo pone en
 *    rojo. Si Supabase cambia sus internos, el drill avisa y la lista se
 *    actualiza A PROPÓSITO, nunca se silencia por omisión.
 */

// Schemas internos que la imagen supabase/postgres pre-crea (y que un proyecto
// Supabase gestionado — el destino REAL de una recuperación — también trae).
export const INTERNAL_SCHEMAS = new Set([
  "auth",
  "extensions",
  "graphql",
  "graphql_public",
  "pgbouncer",
  "realtime",
  "storage",
  "supabase_functions",
  "supabase_migrations",
  "vault",
]);

// Objetos internos observados en los logs de ambos runs (verificados
// 2026-09-04 contra `gh run view 33632291276 --log`): tablas auth.*, sus
// índices y secuencias, y supabase_migrations.schema_migrations.
const INTERNAL_RELATIONS = new Set([
  "users",
  "instances",
  "refresh_tokens",
  "refresh_tokens_id_seq",
  "audit_log_entries",
  "schema_migrations",
  "users_instance_id_idx",
  "users_instance_id_email_idx",
  "refresh_tokens_instance_id_idx",
  "refresh_tokens_instance_id_user_id_idx",
  "audit_logs_instance_id_idx",
]);

// Funciones internas: helpers JWT de auth (uid/email/role…), watchers de
// PostgREST/pg_graphql y los grant_* de las extensiones preinstaladas.
const INTERNAL_FUNCTIONS = new Set([
  "uid",
  "email",
  "role",
  "get_auth",
  "graphql",
  "set_graphql_placeholder",
  "pgrst_ddl_watch",
  "pgrst_drop_watch",
  "grant_pg_cron_access",
  "grant_pg_net_access",
  "grant_pg_graphql_access",
]);

const INTERNAL_EVENT_TRIGGERS = new Set([
  "pgrst_ddl_watch",
  "pgrst_drop_watch",
  "issue_pg_cron_access",
  "issue_pg_net_access",
  "issue_pg_graphql_access",
  "issue_graphql_placeholder",
]);

const INTERNAL_PUBLICATIONS = new Set(["supabase_realtime"]);

// Tablas internas que la imagen ya crea con PK → el ADD CONSTRAINT del dump
// choca ("multiple primary keys"). Mismo universo que INTERNAL_RELATIONS.
const INTERNAL_TABLES = new Set([
  "users",
  "instances",
  "refresh_tokens",
  "audit_log_entries",
  "schema_migrations",
]);

// La imagen 17.6.1.156 trae un auth (GoTrue) MÁS VIEJO que prod: su auth.users
// no tiene columnas que el dump referencia en ALTERs/índices/COPY. Son los
// errores "column … does not exist" observados — todos sobre tablas auth.*.
const AUTH_DRIFT_COLUMNS = new Set([
  "is_sso_user",
  "is_anonymous",
  "reauthentication_token",
  "email_change_token_current",
  "email_change_token_new",
  "email_confirmed_at",
  "session_id",
  "phone",
  "parent",
]);

// Blancos de "column X of relation Y does not exist" (drift de auth.* arriba).
const INTERNAL_RELATION_TARGETS = new Set([
  "users",
  "auth.users",
  "instances",
  "auth.instances",
  "refresh_tokens",
  "auth.refresh_tokens",
  "audit_log_entries",
  "auth.audit_log_entries",
]);

// COPYs de datos auth.* que fallan por FK al quedar auth.users vacía (la COPY
// de auth.users revienta por el drift de columnas y la tabla queda vacía).
const AUTH_DATA_TABLES = new Set(["sessions", "identities", "mfa_factors"]);

// Objetos que el dump intenta dropear/referenciar y la imagen no tiene.
const INTERNAL_MISSING_RELATIONS = new Set(["auth.users_email_partial_key"]);

// Reglas de clasificación: si el patrón matchea, el nombre capturado (grupo 1)
// debe estar en `names` (cuando aplica). Lo que NO cuadre con ninguna regla es
// un error INESPERADO y tumba el drill.
const RULES = [
  { kind: "internal-schema", re: /^schema "([^"]+)" already exists$/, names: INTERNAL_SCHEMAS },
  {
    kind: "internal-relation",
    re: /^relation "([^"]+)" already exists$/,
    names: INTERNAL_RELATIONS,
  },
  {
    kind: "internal-function",
    re: /^function "([^"]+)" already exists with same argument types$/,
    names: INTERNAL_FUNCTIONS,
  },
  {
    kind: "internal-event-trigger",
    re: /^event trigger "([^"]+)" already exists$/,
    names: INTERNAL_EVENT_TRIGGERS,
  },
  {
    kind: "internal-publication",
    re: /^publication "([^"]+)" already exists$/,
    names: INTERNAL_PUBLICATIONS,
  },
  {
    kind: "internal-primary-key",
    re: /^multiple primary keys for table "([^"]+)" are not allowed$/,
    names: INTERNAL_TABLES,
  },
  {
    // supabase_migrations.schema_migrations viene con filas de la propia imagen.
    kind: "internal-seed-rows",
    re: /^duplicate key value violates unique constraint "schema_migrations_pkey"$/,
  },
  {
    kind: "auth-data-fk",
    re: /^insert or update on table "([^"]+)" violates foreign key constraint "[^"]+"$/,
    names: AUTH_DATA_TABLES,
  },
  {
    kind: "auth-column-drift",
    re: /^column "[^"]+" of relation "([^"]+)" does not exist$/,
    names: INTERNAL_RELATION_TARGETS,
  },
  {
    kind: "auth-column-drift",
    re: /^column "([^"]+)" named in key does not exist$/,
    names: AUTH_DRIFT_COLUMNS,
  },
  {
    kind: "auth-column-drift",
    re: /^column "([^"]+)" referenced in foreign key constraint does not exist$/,
    names: AUTH_DRIFT_COLUMNS,
  },
  {
    kind: "auth-column-drift",
    re: /^column "([^"]+)" does not exist(?: at character \d+)?$/,
    names: AUTH_DRIFT_COLUMNS,
  },
  {
    kind: "internal-missing-relation",
    re: /^relation "([^"]+)" does not exist$/,
    names: INTERNAL_MISSING_RELATIONS,
  },
];

/**
 * Clasifica UN mensaje de error de Postgres (ya sin el prefijo psql/ERROR:).
 * Devuelve { expected, kind }: expected=true solo para las colisiones
 * documentadas contra objetos internos de Supabase pre-creados por la imagen.
 */
export function classifyRestoreError(message) {
  for (const rule of RULES) {
    const m = message.match(rule.re);
    if (!m) continue;
    if (!rule.names || rule.names.has(m[1])) return { expected: true, kind: rule.kind };
    // El patrón es de colisión interna pero el NOMBRE no está allowlisteado
    // (ej. relation "Product" already exists): inesperado → drill rojo.
    return { expected: false, kind: null };
  }
  return { expected: false, kind: null };
}

// psql en modo archivo (-f) prefija cada error con `psql:<archivo>:<línea>: `;
// en modo -c el ERROR llega desnudo. Ambas formas cuentan (regresión
// 2026-09-04: el viejo startsWith("ERROR") solo veía la segunda — o sea NADA).
const PSQL_ERROR_RE = /^(?:psql:.+?:\d+:\s*)?ERROR:\s+(.+)$/;

/** Extrae los mensajes de ERROR de la salida combinada (stdout+stderr) de psql. */
export function parsePsqlErrors(output) {
  return String(output)
    .split("\n")
    .map((line) => line.match(PSQL_ERROR_RE))
    .filter(Boolean)
    .map((m) => m[1].trim());
}

/**
 * Resume la salida de un restore psql: total de errores y dos histogramas
 * (mensaje → veces) separando esperados de inesperados. Cualquier entrada en
 * `unexpected` es motivo de drill rojo.
 */
export function summarizeRestoreErrors(output) {
  const expected = new Map();
  const unexpected = new Map();
  const messages = parsePsqlErrors(output);
  for (const message of messages) {
    const bucket = classifyRestoreError(message).expected ? expected : unexpected;
    bucket.set(message, (bucket.get(message) ?? 0) + 1);
  }
  return { total: messages.length, expected, unexpected };
}

// Cabecera COPY de un pg_dump plano: `COPY public."Product" ("id", …) FROM stdin;`
// (schema opcional y con o sin comillas; las filas terminan con una línea `\.`).
const COPY_HEADER_RE =
  /^COPY\s+(?:(?:"[^"]+"|[\w$]+)\.)?(?:"([^"]+)"|([\w$]+))\s+\(.*\)\s+FROM\s+stdin;$/;

/**
 * Cuenta las filas de datos de cada bloque COPY del dump (texto plano de
 * pg_dump). Clave: nombre de tabla SIN schema ni comillas (las tablas de
 * negocio — Product, Category… — son únicas entre schemas en este proyecto).
 * Sirve como expectativa EXACTA del restore: una COPY es atómica, así que la
 * tabla restaurada debe tener exactamente estas filas. En COPY de texto los
 * saltos de línea del dato viajan escapados → una línea = una fila, y `\.`
 * sola cierra el bloque (un "\." literal iría escapado como "\\.").
 */
export function dumpCopyRowCounts(sqlText) {
  const counts = new Map();
  let current = null; // tabla cuyo bloque COPY estamos leyendo
  for (const line of String(sqlText).replaceAll("\r\n", "\n").split("\n")) {
    if (current === null) {
      const m = line.match(COPY_HEADER_RE);
      if (m) {
        current = m[1] ?? m[2];
        counts.set(current, 0);
      }
    } else if (line === "\\.") {
      current = null;
    } else {
      counts.set(current, counts.get(current) + 1);
    }
  }
  return counts;
}
