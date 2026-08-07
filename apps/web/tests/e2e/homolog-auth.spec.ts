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

/** Extrae el código OTP (6 dígitos, plantilla {{ .Token }}) del Mailpit para un destinatario. */
async function mailpitOtpCode(toEmail: string): Promise<string> {
  // El correo tarda un instante tras el submit (y más bajo carga) — sondear.
  const deadline = Date.now() + 30_000;
  let lastErr: unknown = null;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`${MAILPIT_API}/messages?limit=50`);
      const data = (await res.json()) as {
        messages: Array<{ ID: string; Created: string; To: Array<{ Address: string }> }>;
      };
      const mine = data.messages
        .filter((m) => m.To.some((t) => t.Address === toEmail))
        // Por fecha DESC — un .sort() pelado compara objetos como "[object
        // Object]" y devuelve orden arbitrario: con 2 correos (signup + recovery)
        // agarraba el código VIEJO (flake reproducido 2026-08-07).
        .sort((a, b) => new Date(b.Created).getTime() - new Date(a.Created).getTime());
      if (mine.length > 0) {
        const full = (await (await fetch(`${MAILPIT_API}/message/${mine[0]!.ID}`)).json()) as {
          Text?: string;
          HTML?: string;
        };
        const body = `${full.Text ?? ""}${full.HTML ?? ""}`;
        const m = body.match(/\b(\d{6})\b/);
        if (m) return m[1]!;
        lastErr = new Error(`sin código OTP en el email de ${toEmail}`);
      } else {
        lastErr = new Error(`sin emails para ${toEmail} en Mailpit`);
      }
    } catch (err) {
      lastErr = err;
    }
    await new Promise((r) => setTimeout(r, 1_000));
  }
  throw lastErr;
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
      // Los buckets de auth (signup / reset-password, 30/h por IP en dev) se
      // llenan con las iteraciones de la propia suite y bloquean el flujo sin
      // redirect — limpiarlos al inicio (mismo patrón que homolog-rate-limit).
      await db()
        .$executeRaw`DELETE FROM rate_limit_buckets WHERE key LIKE 'signup:%' OR key LIKE 'reset-password:%' OR key LIKE 'verify-otp:%'`;
      // ─── LOCAL: flujo OTP REAL (H12 cerrado 2026-08-07: el stack recreado
      // aplica enable_confirmations + plantillas {{ .Token }} — el registro ya
      // NO autoconfirma; el código llega a Mailpit y se tipea en la app). ───
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
      // Con OTP activo NO hay sesión directa: la app redirige a /confirmar-codigo.
      await anonPage.waitForURL(/\/confirmar-codigo/, { timeout: 30_000 });
      const confirmUrl = anonPage.url();
      expect(await isLoggedIn(), "SIN sesión antes de confirmar el código").toBe(false);
      record(
        "signup-redirect-otp",
        true,
        "registro → /confirmar-codigo (sin autoconfirm — H12 cerrado)",
        await shot(anonPage, "1-signup"),
      );

      // 2. OTP desde Mailpit → confirmar → sesión. (isLoggedIn navega a
      // /mi-cuenta para la sonda → volver a la página del código.)
      await anonPage.goto(confirmUrl, { waitUntil: "domcontentloaded" });
      await expect(anonPage.locator('input[name="token"]')).toBeVisible({ timeout: 20_000 });
      const code = await mailpitOtpCode(EMAIL);
      await anonPage.locator('input[name="token"]').fill(code);
      await anonPage.locator('button[type="submit"]').first().click();
      // Esperar la respuesta de la action ANTES de cualquier sonda: una
      // navegación prematura cancela el fetch y la Set-Cookie de sesión nunca
      // aterriza (flake reproducido 2026-08-07: la toPass-sonda navegaba a
      // /mi-cuenta en pleno vuelo del POST).
      await anonPage.waitForURL((url) => url.pathname === "/", { timeout: 30_000 });
      expect(await isLoggedIn(), "sesión tras OTP correcto").toBe(true);
      record("otp-confirm-session", true, "código del Mailpit → sesión activa");

      // 3. DB: Customer + Consent HABEAS_DATA (Ley 1581) del registro.
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

      // 4. Logout → login con contraseña. Esperar la respuesta del POST de
      // logout ANTES de la sonda (navegar a /mi-cuenta en pleno vuelo cancela
      // el fetch y la sesión sigue viva — flake 2026-08-07).
      await Promise.all([
        anonPage.waitForResponse((r) => r.request().method() === "POST", { timeout: 20_000 }),
        anonPage
          .getByRole("button", { name: /cerrar sesión|salir/i })
          .first()
          .click(),
      ]);
      await expect(async () => {
        expect(await isLoggedIn(), "sin sesión tras logout").toBe(false);
      }).toPass({ timeout: 20_000 });
      await login(EMAIL, PASSWORD);
      expect(await isLoggedIn(), "login con contraseña tras logout").toBe(true);
      record("logout-login", true);

      // 5. Recuperar por OTP: request → /restablecer-password → código de
      //    Mailpit → nueva contraseña → sesión. El bucket reset-password
      //    (30/h por IP en dev) se llena con las iteraciones de la propia
      //    suite → limpiarlo antes (mismo patrón que homolog-rate-limit).
      await db().$executeRaw`DELETE FROM rate_limit_buckets WHERE key LIKE 'reset-password:%'`;
      await anonPage.goto("/recuperar-password", { waitUntil: "domcontentloaded" });
      // El form de recuperación tiene SU widget Turnstile; el footer tiene otro
      // (newsletter) — el token se lee DENTRO del form de recuperación.
      const recoverForm = anonPage.locator("form", {
        has: anonPage.getByRole("button", { name: /enviar código|enviar/i }),
      });
      // toPass con efectos: un fill que cae antes de la hidratación se revierte
      // en silencio y el submit muere en zod sin redirect (flake 2026-08-07).
      await expect(async () => {
        await recoverForm.locator('input[name="email"]').fill(EMAIL);
        await expect(recoverForm.locator('input[name="email"]')).toHaveValue(EMAIL, {
          timeout: 1_500,
        });
        const token = await recoverForm.locator('input[name="cf-turnstile-response"]').inputValue();
        expect(token.length).toBeGreaterThan(0);
      }).toPass({ timeout: 20_000 });
      await recoverForm.getByRole("button", { name: /enviar código|enviar|recuperar/i }).click();
      await anonPage.waitForURL(/\/restablecer-password/, { timeout: 30_000 });
      const recoveryCode = await mailpitOtpCode(EMAIL);
      const newPassword = `${PASSWORD}Nv`;
      await anonPage.locator('input[name="token"]').fill(recoveryCode);
      await anonPage.locator('input[name="password"]').fill(newPassword);
      await anonPage.locator('input[name="passwordConfirm"]').fill(newPassword);
      await anonPage.locator('button[type="submit"]').first().click();
      // La acción cierra TODAS las sesiones (global signOut) y redirige a
      // /login?reset=ok — la prueba de fuego es entrar con la NUEVA clave.
      await anonPage.waitForURL(/\/login\?reset=ok/, { timeout: 30_000 });
      await login(EMAIL, newPassword);
      expect(await isLoggedIn(), "login con la contraseña nueva tras el reset").toBe(true);
      record(
        "recover-otp-session",
        true,
        "OTP recovery → /login?reset=ok → login con la nueva contraseña",
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
