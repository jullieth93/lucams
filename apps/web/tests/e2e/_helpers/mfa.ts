/*
 * Helpers MFA (TOTP) para specs E2E con admins efímeros — auditoría 2026-08-24 · B-1.
 *
 * El MFA es OBLIGATORIO para todo admin: un admin sin factor TOTP ya NO aterriza
 * en el dashboard tras el login — el guard/layout lo mandan a
 * /admin/seguridad?enroll=required. Los specs que crean su propio AdminUser deben
 * ENROLAR TOTP vía API (precedente: admin-mfa.spec) y completar el reto tras el
 * login por UI.
 */

import { createClient } from "@supabase/supabase-js";
import type { Page } from "@playwright/test";
import { totp } from "./totp";

const strip = (v: string | undefined) => v?.replace(/^["']|["']$/g, "");

/**
 * Enrola + verifica un factor TOTP para el usuario vía GoTrue (signIn con
 * password en un cliente efímero sin persistencia). Devuelve el secret base32
 * para generar códigos con `totp()` durante el reto del login por UI.
 */
export async function enrollTotpFactor(email: string, password: string): Promise<string> {
  const cli = createClient(
    strip(process.env.NEXT_PUBLIC_SUPABASE_URL)!,
    strip(process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY)!,
    { auth: { persistSession: false } },
  );
  const { error: siErr } = await cli.auth.signInWithPassword({ email, password });
  if (siErr) throw new Error(`[e2e mfa] signIn para enroll falló: ${siErr.message}`);
  const { data: en, error: ee } = await cli.auth.mfa.enroll({ factorType: "totp" });
  if (ee || !en) throw new Error(`[e2e mfa] enroll falló: ${ee?.message}`);
  const { error: ve } = await cli.auth.mfa.challengeAndVerify({
    factorId: en.id,
    code: totp(en.totp.secret, Date.now()),
  });
  if (ve) throw new Error(`[e2e mfa] verify del enroll falló: ${ve.message}`);
  return en.totp.secret;
}

/**
 * Completa el reto TOTP de /admin/login/mfa SI aparece tras el login por UI.
 * No-op si el input del código nunca aparece (sesión ya en aal2). Tras verificar
 * espera salir del reto.
 */
export async function completeMfaChallengeIfNeeded(page: Page, secret: string): Promise<void> {
  const input = page.getByPlaceholder("123456");
  const challenged = await input
    .waitFor({ state: "visible", timeout: 15_000 })
    .then(() => true)
    .catch(() => false);
  if (!challenged) return;
  await input.fill(totp(secret, Date.now()));
  await page.getByRole("button", { name: /verificar y entrar/i }).click();
  await page.waitForURL((url) => !url.pathname.startsWith("/admin/login/mfa"), {
    timeout: 20_000,
  });
}

/**
 * Login admin por UI COMPLETO: credenciales → reto TOTP → dashboard.
 * Exige que el admin tenga TOTP enrolado (ver enrollTotpFactor) — con MFA
 * obligatorio, sin factor el login termina en /admin/seguridad?enroll=required.
 */
export async function loginAdminWithTotp(
  page: Page,
  opts: { email: string; password: string; totpSecret: string },
): Promise<void> {
  await page.goto("/admin/login", { waitUntil: "domcontentloaded" });
  await page.locator('input[name="email"]').fill(opts.email);
  await page.locator('input[name="password"]').fill(opts.password);
  await page.getByRole("button", { name: /iniciar sesión/i }).click();
  await page.waitForURL(/\/admin\/login\/mfa/, { timeout: 20_000 });
  await page.getByPlaceholder("123456").fill(totp(opts.totpSecret, Date.now()));
  await page.getByRole("button", { name: /verificar y entrar/i }).click();
  await page.waitForURL(/\/admin\/dashboard/, { timeout: 20_000 });
}
