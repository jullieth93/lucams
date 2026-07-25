/*
 * Tests de lib/env.ts — validación fail-fast de variables de entorno.
 *
 * FOCO: el comportamiento nuevo del modo catálogo (Etapa 1,
 * NEXT_PUBLIC_STORE_MODE=catalog): las vars de tienda FULL (Wompi, Aveonline,
 * Gemini) NO se exigen en producción cuando la tienda sale como catálogo +
 * cotización WhatsApp. El resto (DB, Supabase, Resend, Turnstile, crons,
 * WA) sigue siendo obligatorio en prod en AMBOS modos.
 *
 * Estrategia: validateEnv() lee process.env EN CADA llamada, pero el modo se
 * resuelve en lib/store-mode.ts AL IMPORTAR el módulo (const de módulo) → cada
 * caso corre con vi.resetModules() + import dinámico tras fijar las vars.
 * Las vars se controlan con vi.stubEnv (undefined = borrar) y se restauran
 * con vi.unstubAllEnvs(). El logger se mockea para silenciar los warns de
 * dev/preview y poder afirmarlos.
 */

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

/** Todas las vars presentes; luego cada test borra las que quiera probar. */
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

describe("validateEnv — modo tienda FULL (default)", () => {
  it("prod con TODAS las vars presentes → no lanza", async () => {
    stubEnvBase();
    vi.stubEnv("VERCEL_ENV", "production");
    vi.stubEnv("NEXT_PUBLIC_STORE_MODE", "full");
    const validateEnv = await loadValidateEnv();
    expect(() => validateEnv()).not.toThrow();
  });

  it("prod sin vars de Wompi/Aveonline/Gemini → throw listándolas", async () => {
    stubEnvBase();
    vi.stubEnv("VERCEL_ENV", "production");
    vi.stubEnv("NEXT_PUBLIC_STORE_MODE", "full");
    for (const k of FULL_VARS) vi.stubEnv(k, undefined);
    const validateEnv = await loadValidateEnv();
    expect(() => validateEnv()).toThrowError(/Faltan variables de PRODUCCIÓN/);
    expect(() => validateEnv()).toThrowError(/WOMPI_PUBLIC_KEY/);
    expect(() => validateEnv()).toThrowError(/AVEONLINE_WEBHOOK_SECRET/);
    expect(() => validateEnv()).toThrowError(/GEMINI_API_KEY/);
  });
});

/*
 * El modo de tienda debe ser EXPLÍCITO en producción (auditoría 2026-07-21).
 * `readStoreMode()` cae a "full" ante ausencia o typo — bien para dev (un error de config no le
 * apaga el checkout a una tienda que vende), pero en producción ese mismo default significa que
 * BORRAR la variable publica en silencio toda la superficie transaccional de una tienda que
 * legalmente aún no vende. Se exige el valor escrito: ningún modo se activa por accidente.
 */
describe("validateEnv — el modo de tienda debe ser explícito en producción", () => {
  it("prod SIN NEXT_PUBLIC_STORE_MODE → throw nombrando la variable (no un fallo colateral)", async () => {
    stubEnvBase();
    vi.stubEnv("VERCEL_ENV", "production");
    vi.stubEnv("NEXT_PUBLIC_STORE_MODE", undefined);
    const validateEnv = await loadValidateEnv();
    expect(() => validateEnv()).toThrowError(/NEXT_PUBLIC_STORE_MODE/);
    expect(() => validateEnv()).toThrowError(/ausente/);
  });

  it("prod con un typo ('catalogue') → throw citando el valor recibido", async () => {
    stubEnvBase();
    vi.stubEnv("VERCEL_ENV", "production");
    vi.stubEnv("NEXT_PUBLIC_STORE_MODE", "catalogue");
    const validateEnv = await loadValidateEnv();
    expect(() => validateEnv()).toThrowError(/NEXT_PUBLIC_STORE_MODE/);
    expect(() => validateEnv()).toThrowError(/catalogue/);
  });

  it("falla ANTES de reportar vars faltantes: la causa raíz es el modo, no lo que arrastra", async () => {
    stubEnvBase();
    vi.stubEnv("VERCEL_ENV", "production");
    vi.stubEnv("NEXT_PUBLIC_STORE_MODE", undefined);
    vi.stubEnv("WOMPI_PUBLIC_KEY", undefined);
    const validateEnv = await loadValidateEnv();
    expect(() => validateEnv()).toThrowError(/NEXT_PUBLIC_STORE_MODE/);
    expect(() => validateEnv()).not.toThrowError(/WOMPI_PUBLIC_KEY/);
  });

  it("en dev/preview NO se exige (el default a 'full' sigue siendo válido fuera de producción)", async () => {
    stubEnvBase();
    vi.stubEnv("VERCEL_ENV", "preview");
    vi.stubEnv("NEXT_PUBLIC_STORE_MODE", undefined);
    const validateEnv = await loadValidateEnv();
    expect(() => validateEnv()).not.toThrow();
  });
});

describe("validateEnv — modo CATÁLOGO (Etapa 1)", () => {
  it("prod sin Wompi/Aveonline/Gemini → NO lanza (la Etapa 1 sale sin ellas)", async () => {
    stubEnvBase();
    vi.stubEnv("VERCEL_ENV", "production");
    vi.stubEnv("NEXT_PUBLIC_STORE_MODE", "catalog");
    for (const k of FULL_VARS) vi.stubEnv(k, undefined);
    const validateEnv = await loadValidateEnv();
    expect(() => validateEnv()).not.toThrow();
  });

  it("prod sigue exigiendo Resend/Turnstile/crons/WA aunque sea catálogo", async () => {
    stubEnvBase();
    vi.stubEnv("VERCEL_ENV", "production");
    vi.stubEnv("NEXT_PUBLIC_STORE_MODE", "catalog");
    for (const k of FULL_VARS) vi.stubEnv(k, undefined);
    vi.stubEnv("RESEND_API_KEY", undefined);
    vi.stubEnv("NEXT_PUBLIC_WA_NUMBER", undefined);
    const validateEnv = await loadValidateEnv();
    expect(() => validateEnv()).toThrowError(/RESEND_API_KEY/);
    expect(() => validateEnv()).toThrowError(/NEXT_PUBLIC_WA_NUMBER/);
    // y el mensaje NO debe listar las vars full (no aplican en catálogo).
    expect(() => validateEnv()).not.toThrowError(/WOMPI_PUBLIC_KEY/);
  });

  it("dev/preview sin vars de prod → solo warn, no bloquea", async () => {
    stubEnvBase();
    vi.stubEnv("VERCEL_ENV", "preview");
    vi.stubEnv("NEXT_PUBLIC_STORE_MODE", "catalog");
    for (const k of [...PROD_VARS, ...FULL_VARS]) vi.stubEnv(k, undefined);
    const validateEnv = await loadValidateEnv();
    expect(() => validateEnv()).not.toThrow();
    expect(logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({ event: "env.prod_vars_missing" }),
      expect.any(String),
    );
    // En catálogo el warn NO incluye las vars full (no aplican).
    const missing = (logger.warn as ReturnType<typeof vi.fn>).mock.calls[0]?.[0] as {
      missing: string[];
    };
    expect(missing.missing).not.toContain("WOMPI_PUBLIC_KEY");
    expect(missing.missing).toContain("RESEND_API_KEY");
  });
});

describe("validateEnv — CORE (ambos modos)", () => {
  it("sin DATABASE_URL → throw CORE aunque sea modo catálogo", async () => {
    stubEnvBase();
    vi.stubEnv("VERCEL_ENV", "production");
    vi.stubEnv("NEXT_PUBLIC_STORE_MODE", "catalog");
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
});
