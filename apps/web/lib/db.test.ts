/*
 * Unit — Prisma runtime URL arming (F-14, audit 2026-09-04).
 *
 * @lucams/db pins `connection_limit` on the RUNTIME datasource url so that
 * N serverless lambdas cannot exhaust the Supabase pooler's upstream slots
 * (Prisma's default pool is num_cpus×2+1 per process). Covered here:
 *  - PRISMA_CONNECTION_LIMIT parsing (missing/invalid → default 3).
 *  - Param injection that returns the original URL verbatim apart from the
 *    appended `connection_limit` (no re-serialization), preserving existing
 *    params (pgbouncer=true) and an explicit connection_limit if present.
 *
 * DIRECT_URL is out of scope by construction: packages/db/src/index.ts only
 * reads process.env.DATABASE_URL and injects the armed url via the
 * PrismaClient `datasources` override, so `prisma migrate` / `db push` and
 * the one-off scripts in packages/db/scripts (own PrismaClient) never see it.
 *
 * Importing "@lucams/db" evaluates the client singleton; construction does
 * not open connections (verified against Prisma 6.x), so no DB is needed.
 */

import { describe, expect, it } from "vitest";
import { DEFAULT_CONNECTION_LIMIT, parseConnectionLimit, withConnectionLimit } from "@lucams/db";

const POOLER_URL =
  "postgresql://postgres:pass@aws-0-us-east-1.pooler.supabase.com:6543/postgres?pgbouncer=true";

describe("parseConnectionLimit", () => {
  it("defaults to 3 when the env var is missing", () => {
    expect(DEFAULT_CONNECTION_LIMIT).toBe(3);
    expect(parseConnectionLimit(undefined)).toBe(3);
    expect(parseConnectionLimit("")).toBe(3);
  });

  it("accepts a positive integer", () => {
    expect(parseConnectionLimit("1")).toBe(1);
    expect(parseConnectionLimit("10")).toBe(10);
  });

  it("falls back to the default on invalid values", () => {
    expect(parseConnectionLimit("abc")).toBe(3);
    expect(parseConnectionLimit("0")).toBe(3);
    expect(parseConnectionLimit("-5")).toBe(3);
    expect(parseConnectionLimit("2.9")).toBe(2); // parseInt truncates
  });
});

describe("withConnectionLimit", () => {
  it("appends connection_limit to the pooler URL, verbatim apart from the param", () => {
    expect(withConnectionLimit(POOLER_URL, 3)).toBe(`${POOLER_URL}&connection_limit=3`);
  });

  it("uses '?' when the URL has no query string yet", () => {
    expect(withConnectionLimit("postgresql://u:p@localhost:6543/postgres", 5)).toBe(
      "postgresql://u:p@localhost:6543/postgres?connection_limit=5",
    );
  });

  it("respects an explicit connection_limit already present in DATABASE_URL", () => {
    const withParam = `${POOLER_URL}&connection_limit=7`;
    expect(withConnectionLimit(withParam, 3)).toBe(withParam);
    const onlyParam = "postgresql://u:p@h:6543/db?connection_limit=9";
    expect(withConnectionLimit(onlyParam, 3)).toBe(onlyParam);
  });

  it("does not duplicate the param", () => {
    const armed = withConnectionLimit(POOLER_URL, 3);
    expect(armed.match(/connection_limit/g)).toHaveLength(1);
    expect(withConnectionLimit(armed, 8)).toBe(armed);
  });
});
