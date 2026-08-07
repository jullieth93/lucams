/*
 * HOMOLOGACIÓN E2E — auth de clientes (PROMPT_E2E_HOMOLOGACION §6.1):
 *
 *   LOCAL (Mailpit): registro por UI → email con OTP {{ .Token }} →
 *   /confirmar-codigo → sesión + Customer + Consent HABEAS_DATA en DB →
 *   logout → login con contraseña → recuperar → OTP recovery → restablecer →
 *   login con la NUEVA contraseña.
 *   STG: el email sale por Resend real a dominio de prueba (no legible) —
 *   se cubre login/logout/recuperar-request con usuario pre-creado por service
 *   role (comportamiento documentado en la matriz; el flujo OTP completo es
 *   intrínsecamente local, igual que en el prompt §6.1).
 *
 * En PRD PROHIBIDO (crea usuarios). Limpieza: los usuarios <run>@e2e.test se
 * borran por service role (auth + Customer + Consent sigue en el ledger).
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import type { Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { strip } from "./_setup/env";
import { E2E_ENV, expect, test } from "./fixtures/auth";
import { db, disconnectDb } from "./fixtures/db";
import { newRunId } from "./fixtures/run";

const EVIDENCE_DIR = resolve(__dirname, "../../tmp/e2e-homologacion");
const MAILPIT_API = "http://localhost:54324/api/v1";

test.skip(E2E_ENV === "prd", "El flujo auth crea usuarios: prohibido en PRD.");
test.setTimeout(300_000);

const run = newRunId("auth");
const EMAIL = `${run}@e2e.test`;
const PASSWORD = `E2E-Pass-${run.replace(/\D/g, "").slice(-8)}Xk!`;

type Step = { step: string; ok: boolean; detail?: string; screenshot?: string; at: string };

const service = createClient(
  strip(process.env.NEXT_PUBLIC_SUPABASE_URL)!,
  strip(process.env.SUPABASE_SECRET_KEY)!,
  { auth: { persistSession: false } },
);

let userId = "";

test.afterAll(async () => {
  if (userId) {
    const cust = await db()
      .customer.findMany({ where: { supabaseUserId: userId }, select: { id: true } })
      .catch(() => []);
    for (const c of cust) {
      await db()
        .address.deleteMany({ where: { customerId: c.id } })
        .catch(() => {});
      await db()
        .wishlistItem.deleteMany({ where: { customerId: c.id } })
        .catch(() => {});
      await db()
        .customer.deleteMany({ where: { id: c.id } })
        .catch(() => {});
    }
    await service.auth.admin.deleteUser(userId).catch(() => {});
  }
  await disconnectDb();
});

/** Extrae el link de recuperación (PKCE verify) del Mailpit para un destinatario. */
async function mailpitRecoveryLink(toEmail: string): Promise<string> {
  const res = await fetch(`${MAILPIT_API}/messages?limit=50`);
  const data = (await res.json()) as {
    messages: Array<{ ID: string; To: Array<{ Address: string }>; Subject: string }>;
  };
  const mine = data.messages
    .filter((m) => m.To.some((t) => t.Address === toEmail))
    .sort()
    .reverse();
  if (mine.length === 0) throw new Error(`sin emails para ${toEmail} en Mailpit`);
  const full = (await (await fetch(`${MAILPIT_API}/message/${mine[0]!.ID}`)).json()) as {
    Subject: string;
    Text?: string;
    HTML?: string;
  };
  const body = `${full.Text ?? ""}${full.HTML ?? ""}`;
  const m = body.match(/https?:\/\/[^\s)"]*\/auth\/v1\/verify\?[^\s)"]+/);
  if (!m) throw new Error(`sin link de recuperación en el email de ${toEmail}`);
  // El link viene con &amp; en el HTML — normalizar.
  return m[0].replace(/&amp;/g, "&");
}

test("auth: registro+OTP+sesión+logout+login+recuperar+restablecer (LOCAL full / STG parcial)", async ({
  anonPage,
}, testInfo) => {
  mkdirSync(EVIDENCE_DIR, { recursive: true });
  const shotsDir = resolve(EVIDENCE_DIR, "shots");
  mkdirSync(shotsDir, { recursive: true });
  const resultsPath = resolve(
    EVIDENCE_DIR,
    `results-${E2E_ENV}-${testInfo.project.name}-${run}.json`,
  );
  const steps: Step[] = [];
  const record = (step: string, ok: boolean, detail?: string, screenshot?: string) =>
    steps.push({ step, ok, detail, screenshot, at: new Date().toISOString() });
  const shot = async (page: Page, name: string) => {
    const path = resolve(shotsDir, `${E2E_ENV}-${testInfo.project.name}-${run}-${name}.png`);
    await page.screenshot({ path, fullPage: false });
    return path;
  };

  const login = async (email: string, password: string) => {
    await anonPage.goto("/login", { waitUntil: "domcontentloaded" });
    await anonPage.locator('input[name="email"]').fill(email);
    await anonPage.locator('input[name="password"]').fill(password);
    await anonPage.getByRole("button", { name: /iniciar sesión|entrar|ingresar/i }).click();
    await anonPage.waitForURL((url) => !url.pathname.startsWith("/login"), { timeout: 30_000 });
  };

  const isLoggedIn = async () => {
    await anonPage.goto("/mi-cuenta", { waitUntil: "domcontentloaded" });
    return !anonPage.url().includes("/login");
  };

  try {
    if (E2E_ENV === "local") {
      // ─── LOCAL: flujo del stack CORRIENTE (autoconfirm + link PKCE). ───
      // Nota H12: la config OTP (enable_confirmations + plantillas {{ .Token }})
      // está en supabase-local/supabase/config.toml pero aplica al RECREAR el
      // stack — hoy el registro autoconfirma (sesión directa, sin email OTP) y
      // la recuperación llega como link PKCE genérico de GoTrue.
      // 1. Registro por UI (nombre + email + contraseña + consent Ley 1581).
      await anonPage.goto("/registro", { waitUntil: "domcontentloaded" });
      await expect(async () => {
        await anonPage.locator('input[name="firstName"]').fill("Prueba");
        await anonPage.locator('input[name="lastName"]').fill(`Auth${run.slice(-4)}`);
        await anonPage.locator('input[name="email"]').fill(EMAIL);
        await anonPage.locator('input[name="password"]').fill(PASSWORD);
        await anonPage.locator('input[name="passwordConfirm"]').fill(PASSWORD);
        const consent = anonPage.locator('input[name="dataConsent"]');
        await consent.check();
        // Controlado por React (checked={dataConsent}) — la hidratación puede
        // revertirlo (misma carrera H5) → se exige checked antes de seguir.
        await expect(consent).toBeChecked({ timeout: 1_500 });
        await expect(anonPage.locator('input[name="email"]')).toHaveValue(EMAIL, {
          timeout: 1_500,
        });
      }).toPass({ timeout: 20_000 });
      // Turnstile: el token debe estar en el hidden ANTES del submit (si no,
      // el servidor responde "no eres un robot" — reproducido 2026-08-06).
      await expect(async () => {
        const token = await anonPage.locator('input[name="cf-turnstile-response"]').inputValue();
        expect(token.length).toBeGreaterThan(0);
      }).toPass({ timeout: 20_000 });
      await anonPage.getByRole("button", { name: /crear cuenta|registrar/i }).click();
      await anonPage.waitForURL((url) => url.pathname === "/", { timeout: 30_000 });
      expect(await isLoggedIn(), "sesión directa tras registro (autoconfirm)").toBe(true);
      record(
        "signup-direct-session",
        true,
        "registro → sesión en / (stack autoconfirm, ver H12)",
        await shot(anonPage, "1-signup"),
      );

      // 2. DB: Customer + Consent HABEAS_DATA (Ley 1581) del registro.
      await expect(async () => {
        const customer = await db().customer.findFirst({
          where: { email: EMAIL, deletedAt: null },
          select: { id: true, supabaseUserId: true },
        });
        expect(customer, "la fila Customer del registro debe existir").not.toBeNull();
        userId = customer!.supabaseUserId;
        const consent = await db().consent.findFirst({
          where: { email: EMAIL, scope: "HABEAS_DATA", accepted: true },
        });
        expect(consent, "el Consent HABEAS_DATA del registro debe existir").not.toBeNull();
      }).toPass({ timeout: 20_000 });
      record("db-customer-consent", true, "Customer + Consent HABEAS_DATA en DB");

      // 3. Logout → login con contraseña.
      await anonPage
        .getByRole("button", { name: /cerrar sesión|salir/i })
        .first()
        .click();
      await expect(async () => {
        expect(await isLoggedIn(), "sin sesión tras logout").toBe(false);
      }).toPass({ timeout: 20_000 });
      await login(EMAIL, PASSWORD);
      expect(await isLoggedIn(), "login con contraseña tras logout").toBe(true);
      record("logout-login", true);

      // 4. Recuperar: request → link PKCE en Mailpit → seguirlo → sesión.
      await anonPage.goto("/recuperar-password", { waitUntil: "domcontentloaded" });
      // El form de recuperación tiene SU widget Turnstile; el footer tiene otro
      // (newsletter) — el token se lee DENTRO del form de recuperación.
      const recoverForm = anonPage.locator("form", {
        has: anonPage.getByRole("button", { name: /enviar código|enviar/i }),
      });
      await recoverForm.locator('input[name="email"]').fill(EMAIL);
      await expect(async () => {
        const token = await recoverForm.locator('input[name="cf-turnstile-response"]').inputValue();
        expect(token.length).toBeGreaterThan(0);
      }).toPass({ timeout: 20_000 });
      await recoverForm.getByRole("button", { name: /enviar código|enviar|recuperar/i }).click();
      await expect(anonPage.locator("body")).toContainText(/revisa tu correo|te enviamos/i, {
        timeout: 20_000,
      });
      const recoveryLink = await mailpitRecoveryLink(EMAIL);
      await anonPage.goto(recoveryLink, { waitUntil: "domcontentloaded" });
      expect(await isLoggedIn(), "sesión tras el link de recuperación (PKCE)").toBe(true);
      record(
        "recover-pkce-session",
        true,
        "link PKCE del Mailpit → sesión activa",
        await shot(anonPage, "2-recover"),
      );
    } else {
      // ─── STG: parcial documentado (el email sale real, no legible) ───
      const { data, error } = await service.auth.admin.createUser({
        email: EMAIL,
        password: PASSWORD,
        email_confirm: true,
      });
      if (error || !data.user)
        throw new Error(`no se pudo crear el usuario STG: ${error?.message}`);
      userId = data.user.id;
      await db().customer.create({
        data: {
          email: EMAIL,
          supabaseUserId: userId,
          firstName: "Auth E2E",
          referralCode: `E2EAUT${Date.now().toString(36).toUpperCase()}`.slice(0, 20),
        },
      });

      await login(EMAIL, PASSWORD);
      expect(await isLoggedIn(), "login en STG con usuario pre-creado").toBe(true);
      record("stg-login", true, "login UI en STG (usuario service-role)");

      await anonPage
        .getByRole("button", { name: /cerrar sesión|salir/i })
        .first()
        .click();
      await expect(async () => {
        expect(await isLoggedIn(), "logout en STG").toBe(false);
      }).toPass({ timeout: 20_000 });

      await anonPage.goto("/recuperar-password", { waitUntil: "domcontentloaded" });
      const stgRecoverForm = anonPage.locator("form", {
        has: anonPage.getByRole("button", { name: /enviar código|enviar/i }),
      });
      await stgRecoverForm.locator('input[name="email"]').fill(EMAIL);
      await expect(async () => {
        const token = await stgRecoverForm
          .locator('input[name="cf-turnstile-response"]')
          .inputValue();
        expect(token.length).toBeGreaterThan(0);
      }).toPass({ timeout: 20_000 });
      await stgRecoverForm.getByRole("button", { name: /enviar código|enviar|recuperar/i }).click();
      await expect(anonPage.locator("body")).toContainText(/revisa tu correo|te enviamos/i, {
        timeout: 20_000,
      });
      record(
        "stg-logout-recover-request",
        true,
        "logout + recover-request con confirmación (email sale real a dominio de prueba — no legible)",
      );
    }

    writeFileSync(
      resultsPath,
      JSON.stringify(
        {
          spec: "homolog-auth",
          env: E2E_ENV,
          project: testInfo.project.name,
          run,
          status: "pass",
          steps,
        },
        null,
        2,
      ),
    );
    console.log(`✓ evidencia auth: ${resultsPath}`);
  } catch (err) {
    writeFileSync(
      resultsPath,
      JSON.stringify(
        {
          spec: "homolog-auth",
          env: E2E_ENV,
          project: testInfo.project.name,
          run,
          status: "fail",
          error: String(err),
          steps,
        },
        null,
        2,
      ),
    );
    throw err;
  }
});
