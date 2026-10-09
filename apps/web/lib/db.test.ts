/*
 * Unit — Prisma runtime URL arming + retry transitorio (F-14, audit 2026-09-04;
 * ADR-131, 2026-10-08).
 *
 * @lucams/db pins `connection_limit` y `pool_timeout` on the RUNTIME datasource
 * url so that N serverless lambdas cannot exhaust the Supabase pooler's upstream
 * slots (Prisma's default pool is num_cpus×2+1 per process), y envuelve el
 * cliente con un retry para errores de ADQUISICIÓN de conexión (P1001/P1017/
 * P2024 — la query nunca se ejecutó, reintentar es seguro hasta para writes).
 * Covered here:
 *  - PRISMA_CONNECTION_LIMIT / PRISMA_POOL_TIMEOUT parsing (missing/invalid →
 *    defaults 5 / 20s — ADR-131; los defaults 3/10s colapsaban en P2024 bajo
 *    concurrencia moderada en el incidente STG 2026-10-08).
 *  - Param injection that returns the original URL verbatim apart from the
 *    appended params (no re-serialization), preserving existing params
 *    (pgbouncer=true) and explicit connection_limit / pool_timeout if present.
 *  - isRetryableConnectionError: solo códigos de adquisición de conexión.
 *  - runWithDbRetry: reintenta con backoff ante transitorios, propaga el resto
 *    sin reintentar, respeta maxAttempts.
 *
 * DIRECT_URL is out of scope by construction: packages/db/src/index.ts only
 * reads process.env.DATABASE_URL and injects the armed url via the
 * PrismaClient `datasources` override, so `prisma migrate` / `db push` and
 * the one-off scripts in packages/db/scripts (own PrismaClient) never see it.
 *
 * Importing "@lucams/db" evaluates the client singleton; construction does
 * not open connections (verified against Prisma 6.x), so no DB is needed.
 */

import { describe, expect, it, vi } from "vitest";
import {
  DEFAULT_CONNECTION_LIMIT,
  DEFAULT_POOL_TIMEOUT_S,
  isRetryableConnectionError,
  parseConnectionLimit,
  parsePoolTimeout,
  runWithDbRetry,
  withConnectionLimit,
} from "@lucams/db";

const POOLER_URL =
  "postgresql://postgres:pass@aws-0-us-east-1.pooler.supabase.com:6543/postgres?pgbouncer=true";

describe("parseConnectionLimit", () => {
  it("defaults to 5 when the env var is missing (ADR-131)", () => {
    expect(DEFAULT_CONNECTION_LIMIT).toBe(5);
    expect(parseConnectionLimit(undefined)).toBe(5);
    expect(parseConnectionLimit("")).toBe(5);
  });

  it("accepts a positive integer", () => {
    expect(parseConnectionLimit("1")).toBe(1);
    expect(parseConnectionLimit("10")).toBe(10);
  });

  it("falls back to the default on invalid values", () => {
    expect(parseConnectionLimit("abc")).toBe(5);
    expect(parseConnectionLimit("0")).toBe(5);
    expect(parseConnectionLimit("-5")).toBe(5);
    expect(parseConnectionLimit("2.9")).toBe(2); // parseInt truncates
  });
});

describe("parsePoolTimeout", () => {
  it("defaults to 20s when the env var is missing (ADR-131)", () => {
    expect(DEFAULT_POOL_TIMEOUT_S).toBe(20);
    expect(parsePoolTimeout(undefined)).toBe(20);
    expect(parsePoolTimeout("")).toBe(20);
  });

  it("accepts a positive integer and rejects invalid values", () => {
    expect(parsePoolTimeout("45")).toBe(45);
    expect(parsePoolTimeout("abc")).toBe(20);
    expect(parsePoolTimeout("0")).toBe(20);
  });
});

describe("withConnectionLimit", () => {
  it("appends connection_limit and pool_timeout to the pooler URL, verbatim apart from the params", () => {
    expect(withConnectionLimit(POOLER_URL, 5, 20)).toBe(
      `${POOLER_URL}&connection_limit=5&pool_timeout=20`,
    );
  });

  it("uses '?' when the URL has no query string yet", () => {
    expect(withConnectionLimit("postgresql://u:p@localhost:6543/postgres", 5)).toBe(
      "postgresql://u:p@localhost:6543/postgres?connection_limit=5&pool_timeout=20",
    );
  });

  it("respects explicit connection_limit / pool_timeout already present in DATABASE_URL", () => {
    const withParam = `${POOLER_URL}&connection_limit=7`;
    expect(withConnectionLimit(withParam, 5, 20)).toBe(`${withParam}&pool_timeout=20`);
    const onlyParam = "postgresql://u:p@h:6543/db?connection_limit=9";
    expect(withConnectionLimit(onlyParam, 5, 20)).toBe(`${onlyParam}&pool_timeout=20`);
    const both = "postgresql://u:p@h:6543/db?connection_limit=9&pool_timeout=33";
    expect(withConnectionLimit(both, 5, 20)).toBe(both);
  });

  it("does not duplicate the params", () => {
    const armed = withConnectionLimit(POOLER_URL, 5, 20);
    expect(armed.match(/connection_limit/g)).toHaveLength(1);
    expect(armed.match(/pool_timeout/g)).toHaveLength(1);
    expect(withConnectionLimit(armed, 8, 44)).toBe(armed);
  });
});

describe("isRetryableConnectionError", () => {
  const errWithCode = (code: string) => Object.assign(new Error("boom"), { code });

  it("reintenta SOLO errores de adquisición de conexión (la query nunca se ejecutó)", () => {
    expect(isRetryableConnectionError(errWithCode("P1001"))).toBe(true); // can't reach
    expect(isRetryableConnectionError(errWithCode("P1017"))).toBe(true); // server closed connection
    expect(isRetryableConnectionError(errWithCode("P2024"))).toBe(true); // pool timeout
  });

  it("NO reintenta errores de ejecución/lógica (la query SÍ corrió)", () => {
    expect(isRetryableConnectionError(errWithCode("P2002"))).toBe(false); // unique constraint
    expect(isRetryableConnectionError(errWithCode("P2025"))).toBe(false); // record not found
    expect(isRetryableConnectionError(errWithCode("P1008"))).toBe(false); // operation timeout
    expect(isRetryableConnectionError(new Error("sin código"))).toBe(false);
    expect(isRetryableConnectionError(null)).toBe(false);
    expect(isRetryableConnectionError("P1001")).toBe(false);
  });
});

describe("runWithDbRetry", () => {
  const noSleep = async () => {};
  const errWithCode = (code: string) => Object.assign(new Error("boom"), { code });

  it("devuelve el resultado a la primera si no hay error", async () => {
    const fn = vi.fn(async () => 42);
    await expect(runWithDbRetry(fn, { sleep: noSleep })).resolves.toBe(42);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("reintenta ante P1001 y se recupera en el segundo intento", async () => {
    const fn = vi.fn().mockRejectedValueOnce(errWithCode("P1001")).mockResolvedValueOnce("ok");
    await expect(runWithDbRetry(fn, { sleep: noSleep })).resolves.toBe("ok");
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it("agota los intentos (3) ante transitorios persistentes y propaga el último error", async () => {
    const err = errWithCode("P2024");
    const fn = vi.fn(async () => {
      throw err;
    });
    await expect(runWithDbRetry(fn, { sleep: noSleep })).rejects.toBe(err);
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it("NO reintenta errores no transitorios (P2002 propaga al instante)", async () => {
    const fn = vi.fn(async () => {
      throw errWithCode("P2002");
    });
    await expect(runWithDbRetry(fn, { sleep: noSleep })).rejects.toThrow("boom");
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("aplica backoff lineal entre intentos (300ms × intento)", async () => {
    const sleeps: number[] = [];
    const fn = vi.fn(async () => {
      throw errWithCode("P1017");
    });
    await expect(runWithDbRetry(fn, { sleep: async (ms) => void sleeps.push(ms) })).rejects.toThrow(
      "boom",
    );
    expect(sleeps).toEqual([300, 600]);
  });
});
