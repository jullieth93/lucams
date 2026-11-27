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
 *
 * 3) N-19b (auditoría 2026-09-11) — frescura del dump: el drill elegía el .gpg
 *    más nuevo POR NOMBRE y lo restauraba aunque tuviera meses. Un drill verde
 *    sobre un backup viejo certifica un pipeline que ya murió: el backup diario
 *    pudo estar roto 20 días y el drill mensual seguía diciendo "restaurable".
 *    Ahora el dump más nuevo debe tener ≤ DRILL_MAX_BACKUP_AGE_HOURS (default
 *    36h — el backup corre diario; mismo tope que la regla backup_stale de la
 *    app) medido por el LastModified de R2, y si no, el drill FALLA.
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
// one_time_tokens se sumó el 2026-10-02 (run 37022691317): prod tuvo su primera
// fila (OTP de recuperación de contraseña) y es la misma clase de colisión —
// la tabla del drill queda vacía por el drift, no por un dump inconsistente.
const AUTH_DATA_TABLES = new Set(["sessions", "identities", "mfa_factors", "one_time_tokens"]);

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

/**
 * Tope de frescura del dump que restaura el drill (N-19b): el backup corre
 * DIARIO, así que 36h da margen para retrasos/reintentos sin falsos positivos
 * y aun así detecta un pipeline muerto en menos de 2 corridas perdidas. Mismo
 * tope que la regla backup_stale de la app (cron-heartbeat.ts, BACKUP_STALE_MS).
 * Configurable vía DRILL_MAX_BACKUP_AGE_HOURS.
 */
export const DEFAULT_MAX_BACKUP_AGE_HOURS = 36;

/**
 * Verifica la frescura del dump elegido para el drill. Devuelve null si es
 * fresco, o el mensaje de error (para lanzar) si no se puede certificar.
 *
 * `lastModified` es el LastModified del objeto en el listado de R2 (la fuente
 * autoritativa — el timestamp del NOMBRE de la llave solo ordena; no prueba
 * cuándo se subió). Fail-closed: sin fecha no hay frescura verificable → error.
 * Un drill verde sobre un dump viejo certifica un backup que ya no existe.
 */
export function backupFreshnessError({
  key,
  lastModified,
  now,
  maxAgeHours = DEFAULT_MAX_BACKUP_AGE_HOURS,
}) {
  if (!(lastModified instanceof Date) || Number.isNaN(lastModified.getTime())) {
    return (
      `El objeto ${key} no trae un LastModified válido en el listado de R2: no se puede ` +
      `verificar su frescura (fail-closed — un drill sin frescura verificada no certifica nada).`
    );
  }
  if (!(now instanceof Date) || Number.isNaN(now.getTime()) || !Number.isFinite(maxAgeHours)) {
    return `Parámetros de frescura inválidos (now o maxAgeHours) — fail-closed.`;
  }
  const ageMs = now.getTime() - lastModified.getTime();
  const limitMs = maxAgeHours * 3600 * 1000;
  if (ageMs <= limitMs) return null;
  const ageHours = (ageMs / 3600000).toFixed(1);
  return (
    `El dump más nuevo (${key}) tiene ${ageHours}h y el máximo permitido es ${maxAgeHours}h ` +
    `(DRILL_MAX_BACKUP_AGE_HOURS): el backup DIARIO está roto aunque este dump viejo restaure ` +
    `bien. Un drill verde acá certificaría un pipeline de backup que ya no corre — revisar el ` +
    `workflow backup.yml (y la regla backup_stale del panel) antes de confiar en este drill.`
  );
}

// ─── Integridad de auth.users y auth.mfa_factors en el dump (Fase 4 · #17) ────

const QUALIFIED_COPY_HEADER_RE =
  /^COPY\s+(?:(?:"([^"]+)"|([\w$]+))\.)?(?:"([^"]+)"|([\w$]+))\s+\((.+)\)\s+FROM\s+stdin;$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function parseCopyColumns(rawCols) {
  return rawCols.split(",").map((c) => c.trim().replace(/^"|"$/g, ""));
}

/**
 * Inspecciona los bloques COPY de `auth.users`, `auth.mfa_factors` y
 * `public."AdminUser"` dentro del SQL descifrado (sin emitir jamás PII ni
 * secretos en resultados o errores).
 *
 * Verifica:
 *   1. Presencia estructural de COPY `auth.users` (con columnas `id`, `email`) y
 *      COPY `auth.mfa_factors` (con columnas `id`, `user_id`, `factor_type`, `status`).
 *   2. Exactitud de columnas por fila TSV (detecta truncamiento/corrupción de COPY).
 *   3. UUID válido en cada `auth.users.id` y mínimo `minAuthUsers` (default 1).
 *   4. Integridad referencial: 0 filas huérfanas en `auth.mfa_factors.user_id`
 *      respecto al conjunto `auth.users.id` del mismo dump.
 *   5. Vínculo de `AdminUser` activos (`isActive = t` y `deletedAt = \N`): cada
 *      `supabaseUserId` (UUID) debe existir en `auth.users.id`.
 */
export function inspectAuthDumpIntegrity(sqlText, { minAuthUsers = 1 } = {}) {
  const TARGETS = new Set(["auth.users", "auth.mfa_factors", "public.AdminUser"]);
  const blocks = new Map();
  let current = null;

  for (const line of String(sqlText).replaceAll("\r\n", "\n").split("\n")) {
    if (current === null) {
      const m = line.match(QUALIFIED_COPY_HEADER_RE);
      if (!m) continue;
      const schema = m[1] ?? m[2] ?? "public";
      const table = m[3] ?? m[4];
      const key = `${schema}.${table}`;
      if (!TARGETS.has(key)) continue;
      const columns = parseCopyColumns(m[5]);
      current = { key, columns, rows: [] };
      blocks.set(key, current);
    } else if (line === "\\.") {
      current = null;
    } else {
      current.rows.push(line);
    }
  }

  const errors = [];

  if (current !== null) {
    errors.push(`Bloque COPY de "${current.key}" truncado (falta terminador "\\.").`);
  }

  const usersBlock = blocks.get("auth.users");
  const mfaBlock = blocks.get("auth.mfa_factors");
  const adminBlock = blocks.get("public.AdminUser");

  const userIds = new Set();
  let invalidUserRows = 0;

  if (!usersBlock) {
    errors.push('El dump no incluye el bloque COPY de "auth.users".');
  } else {
    const idIdx = usersBlock.columns.indexOf("id");
    const emailIdx = usersBlock.columns.indexOf("email");
    if (idIdx === -1 || emailIdx === -1) {
      errors.push('COPY "auth.users" carece de columnas estructurales requeridas (id, email).');
    } else {
      for (const row of usersBlock.rows) {
        const fields = row.split("\t");
        if (fields.length !== usersBlock.columns.length) {
          invalidUserRows += 1;
          continue;
        }
        const id = fields[idIdx];
        if (!UUID_RE.test(id)) {
          invalidUserRows += 1;
          continue;
        }
        userIds.add(id.toLowerCase());
      }
      if (invalidUserRows > 0) {
        errors.push(`COPY "auth.users" contiene ${invalidUserRows} fila(s) corruptas o sin UUID válido.`);
      }
      if (usersBlock.rows.length < minAuthUsers) {
        errors.push(
          `COPY "auth.users" contiene ${usersBlock.rows.length} usuario(s) (< mínimo ${minAuthUsers}).`,
        );
      }
    }
  }

  let mfaFactorsCount = 0;
  let verifiedMfaFactorsCount = 0;
  let invalidMfaRows = 0;
  let orphanMfaFactors = 0;

  if (!mfaBlock) {
    errors.push('El dump no incluye el bloque COPY de "auth.mfa_factors".');
  } else {
    const idIdx = mfaBlock.columns.indexOf("id");
    const userIdIdx = mfaBlock.columns.indexOf("user_id");
    const factorTypeIdx = mfaBlock.columns.indexOf("factor_type");
    const statusIdx = mfaBlock.columns.indexOf("status");
    if (idIdx === -1 || userIdIdx === -1 || factorTypeIdx === -1 || statusIdx === -1) {
      errors.push(
        'COPY "auth.mfa_factors" carece de columnas estructurales requeridas (id, user_id, factor_type, status).',
      );
    } else {
      mfaFactorsCount = mfaBlock.rows.length;
      for (const row of mfaBlock.rows) {
        const fields = row.split("\t");
        if (fields.length !== mfaBlock.columns.length) {
          invalidMfaRows += 1;
          continue;
        }
        const id = fields[idIdx];
        const userId = fields[userIdIdx];
        const status = fields[statusIdx];
        if (!UUID_RE.test(id) || !UUID_RE.test(userId)) {
          invalidMfaRows += 1;
          continue;
        }
        if (status === "verified") verifiedMfaFactorsCount += 1;
        if (usersBlock && !userIds.has(userId.toLowerCase())) {
          orphanMfaFactors += 1;
        }
      }
      if (invalidMfaRows > 0) {
        errors.push(
          `COPY "auth.mfa_factors" contiene ${invalidMfaRows} fila(s) corruptas o sin UUID válido.`,
        );
      }
      if (orphanMfaFactors > 0) {
        errors.push(
          `Integridad referencial rota: ${orphanMfaFactors} factor(es) en "auth.mfa_factors" apuntan a usuarios ausentes en "auth.users".`,
        );
      }
    }
  }

  let activeAdminsChecked = 0;
  let missingActiveAdminAuthLinks = 0;
  if (adminBlock && usersBlock) {
    const supaIdIdx = adminBlock.columns.indexOf("supabaseUserId");
    const activeIdx = adminBlock.columns.indexOf("isActive");
    const deletedIdx = adminBlock.columns.indexOf("deletedAt");
    if (supaIdIdx !== -1) {
      for (const row of adminBlock.rows) {
        const fields = row.split("\t");
        if (fields.length !== adminBlock.columns.length) continue;
        const isActive = activeIdx === -1 ? true : fields[activeIdx] === "t";
        const isDeleted = deletedIdx !== -1 && fields[deletedIdx] !== "\\N";
        if (!isActive || isDeleted) continue;
        const supaId = fields[supaIdIdx];
        if (!UUID_RE.test(supaId)) continue;
        activeAdminsChecked += 1;
        if (!userIds.has(supaId.toLowerCase())) {
          missingActiveAdminAuthLinks += 1;
        }
      }
      if (missingActiveAdminAuthLinks > 0) {
        errors.push(
          `Integridad Auth↔Admin rota: ${missingActiveAdminAuthLinks} AdminUser activo(s) no tienen registro correspondiente en "auth.users".`,
        );
      }
    }
  }

  return {
    ok: errors.length === 0,
    usersPresent: Boolean(usersBlock),
    mfaFactorsPresent: Boolean(mfaBlock),
    usersCount: usersBlock ? usersBlock.rows.length : 0,
    mfaFactorsCount,
    verifiedMfaFactorsCount,
    orphanMfaFactors,
    activeAdminsChecked,
    missingActiveAdminAuthLinks,
    errors,
  };
}

/**
 * Devuelve `true` solo si el restore encontró colisiones reales de esquema/FK
 * de GoTrue (`auth-column-drift` o `auth-data-fk`) que impidieron cargar filas
 * en `auth.users` / `auth.mfa_factors`. Un simple `relation "users" already exists`
 * (`internal-relation`) NO indica drift de columnas y no debe desactivar la
 * verificación de conteos en Postgres.
 */
export function hasAuthRestoreDrift(summary) {
  return [...summary.expected.keys()].some((msg) => {
    const { kind } = classifyRestoreError(msg);
    return kind === "auth-column-drift" || kind === "auth-data-fk";
  });
}

const SAFE_PG_IDENT_RE = /^[a-z_][a-z0-9_]*$/;

/**
 * Construye una consulta `EXISTS` sobre `pg_catalog.pg_class` + `pg_namespace`
 * completamente inmune al `search_path` de la sesión (`to_regclass('auth.users')::text`
 * omite el prefijo `auth.` cuando `auth` está en `search_path`, como ocurre en
 * la imagen `supabase/postgres` del DR drill).
 */
export function buildSystemTableExistsSql(schema, table) {
  if (!SAFE_PG_IDENT_RE.test(schema) || !SAFE_PG_IDENT_RE.test(table)) {
    throw new Error(`Identificador SQL inválido para verificación de tabla: ${schema}.${table}`);
  }
  return (
    `SELECT EXISTS (` +
    `SELECT 1 FROM pg_catalog.pg_class c ` +
    `JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace ` +
    `WHERE n.nspname = '${schema}' AND c.relname = '${table}' AND c.relkind IN ('r', 'p')` +
    `);`
  );
}
