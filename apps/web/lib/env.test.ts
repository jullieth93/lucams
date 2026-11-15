import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/logger", () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

import { logger } from "@/lib/logger";

const CORE_VARS = [
  "DATABASE_URL",
  "DIRECT_URL",
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
  "SUPABASE_SECRET_KEY",
  "CSRF_SECRET",
] as const;

const PROD_VARS = [
  "NEXT_PUBLIC_SITE_URL",
  "RESEND_API_KEY",
  "RESEND_WEBHOOK_SECRET",
  "EMAIL_FROM",
  "EMAIL_REPLY_TO",
  "TURNSTILE_SECRET_KEY",
  "NEXT_PUBLIC_TURNSTILE_SITE_KEY",
  "CRON_SECRET",
  "NEXT_PUBLIC_WA_NUMBER",
] as const;

const FULL_VARS = [
  "WOMPI_PUBLIC_KEY",
  "WOMPI_PRIVATE_KEY",
  "WOMPI_EVENTS_SECRET",
  "WOMPI_INTEGRITY_SECRET",
  "AVEONLINE_USUARIO",
  "AVEONLINE_CLAVE",
  "AVEONLINE_WEBHOOK_SECRET",
  "GEMINI_API_KEY",
] as const;

const ALL_VARS = [...CORE_VARS, ...PROD_VARS, ...FULL_VARS];

function stubEnvBase() {
  vi.stubEnv("NEXT_PHASE", undefined);
  delete process.env.NEXT_PHASE;
  for (const k of ALL_VARS) vi.stubEnv(k, `test-${k.toLowerCase()}`);
}

async function loadValidateEnv() {
  const mod = await import("./env");
  return mod.validateEnv;
}

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("validateEnv", () => {
  it("prod con TODAS las vars presentes → no lanza", async () => {
    stubEnvBase();
    vi.stubEnv("VERCEL_ENV", "production");
    const validateEnv = await loadValidateEnv();
    expect(() => validateEnv()).not.toThrow();
  });

  it("prod sin vars de Wompi/Aveonline/Gemini → throw listándolas", async () => {
    stubEnvBase();
    vi.stubEnv("VERCEL_ENV", "production");
    for (const k of FULL_VARS) vi.stubEnv(k, undefined);
    const validateEnv = await loadValidateEnv();
    expect(() => validateEnv()).toThrowError(/Faltan variables de PRODUCCIÓN/);
    expect(() => validateEnv()).toThrowError(/WOMPI_PUBLIC_KEY/);
    expect(() => validateEnv()).toThrowError(/AVEONLINE_WEBHOOK_SECRET/);
    expect(() => validateEnv()).toThrowError(/GEMINI_API_KEY/);
  });

  it("prod sin RESEND_WEBHOOK_SECRET → throw", async () => {
    stubEnvBase();
    vi.stubEnv("VERCEL_ENV", "production");
    vi.stubEnv("RESEND_WEBHOOK_SECRET", undefined);
    const validateEnv = await loadValidateEnv();
    expect(() => validateEnv()).toThrowError(/RESEND_WEBHOOK_SECRET/);
  });

  it("dev/preview sin vars de prod → solo warn, no bloquea", async () => {
    stubEnvBase();
    vi.stubEnv("VERCEL_ENV", "preview");
    for (const k of [...PROD_VARS, ...FULL_VARS]) vi.stubEnv(k, undefined);
    const validateEnv = await loadValidateEnv();
    expect(() => validateEnv()).not.toThrow();
    expect(logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({ event: "env.prod_vars_missing" }),
      expect.any(String),
    );
    const missing = (logger.warn as ReturnType<typeof vi.fn>).mock.calls[0]?.[0] as {
      missing: string[];
    };
    expect(missing.missing).toContain("WOMPI_PUBLIC_KEY");
    expect(missing.missing).toContain("RESEND_API_KEY");
  });

  it("sin DATABASE_URL → throw CORE", async () => {
    stubEnvBase();
    vi.stubEnv("VERCEL_ENV", "production");
    vi.stubEnv("DATABASE_URL", undefined);
    const validateEnv = await loadValidateEnv();
    expect(() => validateEnv()).toThrowError(/Faltan variables CORE: DATABASE_URL/);
  });

  it("no valida durante el build (NEXT_PHASE=phase-production-build)", async () => {
    stubEnvBase();
    vi.stubEnv("NEXT_PHASE", "phase-production-build");
    vi.stubEnv("DATABASE_URL", undefined);
    const validateEnv = await loadValidateEnv();
    expect(() => validateEnv()).not.toThrow();
  });

  it("SEC-06: AVEONLINE_ALLOW_QUERY_SECRET=true falla cerrado en producción", async () => {
    stubEnvBase();
    vi.stubEnv("VERCEL_ENV", "production");
    vi.stubEnv("AVEONLINE_ALLOW_QUERY_SECRET", "true");
    const validateEnv = await loadValidateEnv();
    expect(() => validateEnv()).toThrowError(/AVEONLINE_ALLOW_QUERY_SECRET/);
  });
});
