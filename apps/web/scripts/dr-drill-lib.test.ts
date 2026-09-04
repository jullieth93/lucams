/*
 * Test de los helpers puros del DR drill de DB (dr-drill-lib.mjs): parseo de
 * errores de psql, clasificación esperado/inesperado y conteo de filas COPY.
 * La clasificación es la línea entre un drill útil (ruido interno tolerado) y
 * uno ciego (errores reales silenciados) — los mensajes "esperados" de estos
 * tests son los OBSERVADOS, idénticos, en el run verde 30972179553 (2026-08-05)
 * y en el rojo 33632291276 (2026-09-02).
 */

import { describe, it, expect } from "vitest";
import {
  classifyRestoreError,
  parsePsqlErrors,
  summarizeRestoreErrors,
  dumpCopyRowCounts,
} from "./dr-drill-lib.mjs";

// Mensajes reales del restore del 2026-09-02 (extraídos del log del service
// container del run 33632291276; el run verde del 2026-08-05 tuvo el MISMO set).
const OBSERVED_EXPECTED = [
  'schema "auth" already exists',
  'schema "extensions" already exists',
  'schema "graphql" already exists',
  'schema "graphql_public" already exists',
  'schema "pgbouncer" already exists',
  'schema "realtime" already exists',
  'schema "storage" already exists',
  'schema "vault" already exists',
  'relation "users" already exists',
  'relation "instances" already exists',
  'relation "refresh_tokens" already exists',
  'relation "refresh_tokens_id_seq" already exists',
  'relation "audit_log_entries" already exists',
  'relation "schema_migrations" already exists',
  'relation "users_instance_id_idx" already exists',
  'relation "users_instance_id_email_idx" already exists',
  'relation "refresh_tokens_instance_id_idx" already exists',
  'relation "refresh_tokens_instance_id_user_id_idx" already exists',
  'relation "audit_logs_instance_id_idx" already exists',
  'relation "auth.users_email_partial_key" does not exist',
  'function "uid" already exists with same argument types',
  'function "email" already exists with same argument types',
  'function "role" already exists with same argument types',
  'function "get_auth" already exists with same argument types',
  'function "graphql" already exists with same argument types',
  'function "set_graphql_placeholder" already exists with same argument types',
  'function "pgrst_ddl_watch" already exists with same argument types',
  'function "pgrst_drop_watch" already exists with same argument types',
  'function "grant_pg_cron_access" already exists with same argument types',
  'function "grant_pg_net_access" already exists with same argument types',
  'function "grant_pg_graphql_access" already exists with same argument types',
  'event trigger "pgrst_ddl_watch" already exists',
  'event trigger "pgrst_drop_watch" already exists',
  'event trigger "issue_pg_cron_access" already exists',
  'event trigger "issue_pg_net_access" already exists',
  'event trigger "issue_pg_graphql_access" already exists',
  'event trigger "issue_graphql_placeholder" already exists',
  'publication "supabase_realtime" already exists',
  'multiple primary keys for table "users" are not allowed',
  'multiple primary keys for table "instances" are not allowed',
  'multiple primary keys for table "refresh_tokens" are not allowed',
  'multiple primary keys for table "audit_log_entries" are not allowed',
  'multiple primary keys for table "schema_migrations" are not allowed',
  'duplicate key value violates unique constraint "schema_migrations_pkey"',
  'insert or update on table "sessions" violates foreign key constraint "sessions_user_id_fkey"',
  'insert or update on table "identities" violates foreign key constraint "identities_user_id_fkey"',
  'insert or update on table "mfa_factors" violates foreign key constraint "mfa_factors_user_id_fkey"',
  'column "is_sso_user" of relation "auth.users" does not exist',
  'column "email_confirmed_at" of relation "users" does not exist',
  'column "parent" of relation "refresh_tokens" does not exist',
  'column "ip_address" of relation "audit_log_entries" does not exist',
  'column "is_sso_user" does not exist at character 86',
  'column "reauthentication_token" does not exist at character 107',
  'column "email_change_token_current" does not exist at character 115',
  'column "email_change_token_new" does not exist at character 107',
  'column "is_anonymous" does not exist',
  'column "session_id" does not exist',
  'column "parent" does not exist',
  'column "session_id" referenced in foreign key constraint does not exist',
  'column "phone" named in key does not exist',
];

describe("parsePsqlErrors", () => {
  it("REGRESIÓN 2026-09-04: ve los errores con prefijo psql:<archivo>:<línea> (el filtro viejo veía 0)", () => {
    const out =
      'psql:/tmp/dr-drill-abc/dump.sql:803: ERROR:  schema "auth" already exists\n' +
      'psql:/tmp/dr-drill-abc/dump.sql:805: ERROR:  schema "vault" already exists\n';
    expect(parsePsqlErrors(out)).toEqual([
      'schema "auth" already exists',
      'schema "vault" already exists',
    ]);
  });

  it("también acepta errores desnudos (modo -c) y limpia el doble espacio de ERROR:", () => {
    expect(parsePsqlErrors('ERROR:  relation "users" already exists\n')).toEqual([
      'relation "users" already exists',
    ]);
  });

  it("ignora NOTICE, WARNING, tags de comando y ruido de stdout", () => {
    const out = [
      'psql:/docker-entrypoint-initdb.d/migrations/00-extension.sql:1: NOTICE:  schema "extensions" already exists, skipping',
      "WARNING:  there is no transaction in progress",
      "SET",
      "COPY 11",
      "",
    ].join("\n");
    expect(parsePsqlErrors(out)).toEqual([]);
  });
});

describe("classifyRestoreError — allowlist de colisiones internas Supabase", () => {
  it.each(OBSERVED_EXPECTED)("tolerable: %s", (message) => {
    expect(classifyRestoreError(message)).toEqual({
      expected: true,
      kind: expect.any(String),
    });
  });

  it.each([
    // Colisiones con objetos de NEGOCIO: jamás tolerables.
    'relation "Product" already exists',
    'relation "Order" already exists',
    'schema "public" already exists',
    'function "my_business_fn" already exists with same argument types',
    'multiple primary keys for table "Product" are not allowed',
    'insert or update on table "Order" violates foreign key constraint "Order_customerId_fkey"',
    'column "price" does not exist',
    'column "email" of relation "Customer" does not exist',
    'relation "public"."Product" does not exist',
    // Errores de restore VERDADEROS que el drill debe cazar.
    'syntax error at or near "00000000" at character 1',
    "permission denied for table Product",
    'duplicate key value violates unique constraint "Product_pkey"',
    "out of memory",
  ])("INESPERADO (drill rojo): %s", (message) => {
    expect(classifyRestoreError(message)).toEqual({ expected: false, kind: null });
  });
});

describe("summarizeRestoreErrors", () => {
  it("separa esperados de inesperados y cuenta repeticiones", () => {
    const out = [
      'psql:/tmp/x/dump.sql:1: ERROR:  schema "auth" already exists',
      'psql:/tmp/x/dump.sql:2: ERROR:  schema "auth" already exists',
      'psql:/tmp/x/dump.sql:3: ERROR:  relation "Product" already exists',
      'ERROR:  syntax error at or near "SELECT"',
    ].join("\n");
    const s = summarizeRestoreErrors(out);
    expect(s.total).toBe(4);
    expect(s.expected.get('schema "auth" already exists')).toBe(2);
    expect(s.unexpected.get('relation "Product" already exists')).toBe(1);
    expect(s.unexpected.get('syntax error at or near "SELECT"')).toBe(1);
  });

  it("restore limpio → todo en cero", () => {
    const s = summarizeRestoreErrors("SET\nSET\nCOPY 11\n");
    expect(s.total).toBe(0);
    expect(s.expected.size).toBe(0);
    expect(s.unexpected.size).toBe(0);
  });
});

describe("dumpCopyRowCounts", () => {
  const dump = [
    "--",
    "-- Name: Product; Type: TABLE; Schema: public",
    "--",
    'CREATE TABLE public."Product" ("id" text NOT NULL);',
    'COPY public."Product" ("id", "name") FROM stdin;',
    "p1\tRosas",
    "p2\t\\N",
    "p3\tTul\\tpanes", // tab escapado dentro del dato
    "\\.",
    'COPY public."Category" ("id") FROM stdin;', // tabla vacía: 0 filas
    "\\.",
    "COPY public.orders (id) FROM stdin;", // sin comillas
    "o1",
    "\\.",
    "SELECT pg_catalog.setval('public.\"Product_id_seq\"', 3, true);",
  ].join("\n");

  it("cuenta las filas de cada bloque COPY por nombre de tabla", () => {
    const counts = dumpCopyRowCounts(dump);
    expect(counts.get("Product")).toBe(3);
    expect(counts.get("Category")).toBe(0);
    expect(counts.get("orders")).toBe(1);
    expect(counts.size).toBe(3);
  });

  it("ignora DDL y setvals fuera de los bloques COPY", () => {
    const counts = dumpCopyRowCounts(dump);
    expect(counts.has("Product_id_seq")).toBe(false);
  });

  it("tolera fin de línea CRLF", () => {
    const crlf = 'COPY public."Product" (id) FROM stdin;\r\na\r\n\\.\r\n';
    expect(dumpCopyRowCounts(crlf).get("Product")).toBe(1);
  });
});
