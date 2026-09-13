/*
 * Test de la guarda de ambiente (lib/env-guard.mjs) — corre con `node --test`
 * (packages/db no tiene vitest; el runner nativo de Node 22 basta para helpers
 * puros y no agrega dependencias).
 *
 * Lo crítico cubierto: la filosofía FAIL-CLOSED (N-06, 2026-09-12) — cualquier
 * destino que no sea local/STG queda bloqueado por defecto, incluidos los hosts
 * remotos ajenos a Supabase ("other") y las URLs no parseables ("unknown"),
 * que antes pasaban de largo (fail-open).
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { checkDestructiveAllowed, classifyUrl } from "./env-guard.mjs";

const LOCAL = "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
const STG = "postgresql://postgres.mjbdiqdkykhsixvqlrrp:pw@aws-1-us-east-1.pooler.supabase.com:6543/postgres";
const PRD = "postgresql://postgres.zxkucphbsfygakgxcnik:pw@aws-1-us-east-1.pooler.supabase.com:6543/postgres";

describe("classifyUrl", () => {
  it("reconoce hosts locales", () => {
    assert.equal(classifyUrl(LOCAL), "local");
    assert.equal(classifyUrl("postgresql://p:p@localhost:5432/postgres"), "local");
    assert.equal(classifyUrl("postgresql://p:p@host.docker.internal:5432/postgres"), "local");
  });

  it("reconoce STG y PRD por el ref en la URL (host o usuario pooler)", () => {
    assert.equal(classifyUrl(STG), "stg");
    assert.equal(classifyUrl("postgresql://postgres:pw@db.mjbdiqdkykhsixvqlrrp.supabase.co:5432/postgres"), "stg");
    assert.equal(classifyUrl(PRD), "prd");
  });

  it("otro proyecto Supabase = supabase-remote", () => {
    assert.equal(
      classifyUrl("postgresql://postgres:pw@db.abcdefghijklmno.supabase.co:5432/postgres"),
      "supabase-remote",
    );
  });

  it("host remoto ajeno a Supabase = other (antes se permitía — fail-open)", () => {
    assert.equal(classifyUrl("postgresql://p:p@mi-vps.example.com:5432/postgres"), "other");
  });

  it("URL no parseable = unknown (antes se permitía — fail-open)", () => {
    assert.equal(classifyUrl("esto-no-es-una-url"), "unknown");
  });

  it("ausente = absent", () => {
    assert.equal(classifyUrl(undefined), "absent");
    assert.equal(classifyUrl(""), "absent");
  });
});

describe("checkDestructiveAllowed (fail-closed)", () => {
  it("permite local y STG sin fricción", () => {
    assert.deepEqual(checkDestructiveAllowed({ DIRECT_URL: LOCAL, DATABASE_URL: LOCAL }), {
      allowed: true,
      bypassed: false,
      reason: "",
    });
    assert.equal(checkDestructiveAllowed({ DIRECT_URL: STG, DATABASE_URL: STG }).allowed, true);
  });

  it("bloquea PRD", () => {
    const res = checkDestructiveAllowed({ DIRECT_URL: PRD, DATABASE_URL: PRD });
    assert.equal(res.allowed, false);
    assert.match(res.reason, /LUCAMS_ALLOW_DESTRUCTIVE_REMOTE=1/);
    // El mensaje nunca expone credenciales de la URL.
    assert.ok(!res.reason.includes("postgres.zxkucphbsfygakgxcnik:pw"));
  });

  it("bloquea otro Supabase remoto", () => {
    const res = checkDestructiveAllowed({
      DATABASE_URL: "postgresql://postgres:pw@db.abcdefghijklmno.supabase.co:5432/postgres",
    });
    assert.equal(res.allowed, false);
  });

  it("bloquea hosts remotos ajenos a Supabase (fail-closed, N-06)", () => {
    const res = checkDestructiveAllowed({
      DATABASE_URL: "postgresql://p:p@mi-vps.example.com:5432/postgres",
    });
    assert.equal(res.allowed, false);
    assert.match(res.reason, /host remoto no reconocido/);
  });

  it("bloquea URLs no parseables (fail-closed, N-06)", () => {
    const res = checkDestructiveAllowed({ DATABASE_URL: "esto-no-es-una-url" });
    assert.equal(res.allowed, false);
    assert.match(res.reason, /URL no parseable/);
  });

  it("una sola URL bloqueada basta aunque la otra sea local", () => {
    const res = checkDestructiveAllowed({ DIRECT_URL: LOCAL, DATABASE_URL: PRD });
    assert.equal(res.allowed, false);
  });

  it("sin URLs en el env → permite (el script fallará por falta de DATABASE_URL, no por la guarda)", () => {
    assert.equal(checkDestructiveAllowed({}).allowed, true);
  });

  it("el bypass LUCAMS_ALLOW_DESTRUCTIVE_REMOTE=1 permite y deja constancia", () => {
    const res = checkDestructiveAllowed({
      DATABASE_URL: PRD,
      LUCAMS_ALLOW_DESTRUCTIVE_REMOTE: "1",
    });
    assert.equal(res.allowed, true);
    assert.equal(res.bypassed, true);
    assert.match(res.reason, /bypass manual/);
  });

  it("el bypass no se activa con otros valores", () => {
    for (const v of ["0", "true", "yes", ""]) {
      const res = checkDestructiveAllowed({ DATABASE_URL: PRD, LUCAMS_ALLOW_DESTRUCTIVE_REMOTE: v });
      assert.equal(res.allowed, false, `valor ${JSON.stringify(v)} no debe bypasear`);
    }
  });
});
