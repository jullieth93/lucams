/*
 * Detección y carga del ambiente E2E — suite de homologación (docs/TESTING.md).
 *
 * `E2E_ENV=local|stg|prd` (default `local`) decide:
 *   - qué .env carga el runner de Playwright (`.env.local` / `.env.stg` del repo,
 *     con el mismo criterio no-override de dotenv que usa vitest-global-teardown:
 *     la shell/CI siempre manda);
 *   - el baseURL (STG sale de NEXT_PUBLIC_SITE_URL del .env.stg; LOCAL del PORT);
 *   - los headers de bypass de Vercel (solo STG, si hay VERCEL_BYPASS_TOKEN).
 *
 * `PLAYWRIGHT_BASE_URL` explícita siempre gana (compat con preview-cert /
 * release-check-a1 y con corridas puntuales contra previews).
 *
 * Este módulo NO importa nada de Playwright: lo usa tanto el config (proceso
 * runner) como el global.setup/teardown y los fixtures (workers).
 */

import { config as dotenvConfig } from "dotenv";
import { existsSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";

export type E2EEnv = "local" | "stg" | "prd";

const SETUP_DIR = __dirname; // apps/web/tests/e2e/_setup
const WEB_ROOT = resolve(SETUP_DIR, "../../.."); // apps/web
const REPO_ROOT = resolve(WEB_ROOT, "../.."); // repo root

/** Ambiente activo. E2E_ENV inválido = error ruidoso (nunca se adivina). */
export function currentEnv(): E2EEnv {
  const raw = (process.env.E2E_ENV ?? "local").trim().toLowerCase();
  if (raw === "local" || raw === "stg" || raw === "prd") return raw;
  throw new Error(`E2E_ENV="${raw}" inválido. Valores: local | stg | prd.`);
}

let loadedFor: E2EEnv | null = null;

/**
 * Carga el .env del ambiente en process.env (idempotente, sin pisar vars ya
 * definidas). `prd` no tiene archivo en el repo: es solo-lectura contra la URL
 * pública y cualquier acceso a DB/Supabase de PRD exige vars de shell
 * deliberadas (el env-guard del repo sigue bloqueando lo destructivo).
 */
export function loadEnvFor(env: E2EEnv): void {
  if (loadedFor === env) return;
  loadedFor = env;
  const candidates =
    env === "local"
      ? // Mismo orden que vitest-global-teardown: apps/web/.env.local primero
        // (es el que lee Next al correr desde apps/web), raíz como respaldo.
        [resolve(WEB_ROOT, ".env.local"), resolve(REPO_ROOT, ".env.local")]
      : env === "stg"
        ? [resolve(REPO_ROOT, ".env.stg")]
        : [];
  for (const path of candidates) {
    if (existsSync(path)) {
      dotenvConfig({ path });
      break;
    }
  }
}

/** baseURL del ambiente. PLAYWRIGHT_BASE_URL explícita siempre gana. */
export function baseUrlFor(env: E2EEnv): string {
  if (process.env.PLAYWRIGHT_BASE_URL) return process.env.PLAYWRIGHT_BASE_URL;
  if (env === "stg") {
    const url = strip(process.env.NEXT_PUBLIC_SITE_URL);
    if (!url) throw new Error("E2E_ENV=stg requiere NEXT_PUBLIC_SITE_URL en .env.stg");
    return url;
  }
  if (env === "prd") return "https://lucamsshop.com";
  return `http://localhost:${process.env.PORT ?? "4000"}`;
}

/** Headers extra por ambiente: bypass de Vercel solo para STG con token. */
export function extraHeadersFor(env: E2EEnv): Record<string, string> {
  if (env !== "stg") return {};
  const token = strip(process.env.VERCEL_BYPASS_TOKEN);
  return token ? { "x-vercel-protection-bypass": token } : {};
}

/** Directorio de storageState por ambiente (gitignored — ver .gitignore). */
export function authStateDir(env: E2EEnv): string {
  return resolve(SETUP_DIR, "../.auth", env);
}

export function authStatePath(env: E2EEnv, role: "admin" | "client"): string {
  return resolve(authStateDir(env), `${role}.json`);
}

export function authManifestPath(env: E2EEnv): string {
  return resolve(authStateDir(env), "manifest.json");
}

export function ensureAuthStateDir(env: E2EEnv): void {
  mkdirSync(authStateDir(env), { recursive: true });
}

/** ¿El ambiente tiene las llaves para crear usuarios efímeros vía service role? */
export function hasServiceSecrets(): boolean {
  return Boolean(
    strip(process.env.NEXT_PUBLIC_SUPABASE_URL) && strip(process.env.SUPABASE_SECRET_KEY),
  );
}

/** Quita comillas envolventes (los .env del repo las usan en varias vars). */
export function strip(v: string | undefined): string | undefined {
  return v?.replace(/^["']|["']$/g, "");
}

/**
 * Contraseñas de los usuarios EFÍMEROS del global.setup (no son secretos: los
 * usuarios se crean y borran por corrida). Centralizadas acá para que los
 * specs que ejercen login/cambio de contraseña las compartan con el setup.
 */
export const E2E_SETUP_ADMIN_PASSWORD = "E2E-Setup-Admin-918273650";
export const E2E_SETUP_CLIENT_PASSWORD = "E2E-Setup-Client-918273650";
