/*
 * E2E — reto MFA admin (Bloque E, Lucy 2026-07-03).
 *
 * La joya del control de acceso: un admin con MFA (TOTP) verificado debe pasar el
 * reto para entrar; también puede entrar con un código de respaldo (que desactiva
 * el TOTP → reconfigurar). Crea un AdminUser efímero, le ENROLA MFA vía supabase-js
 * (generando el código con nuestra impl. TOTP RFC 6238) e inserta un código de
 * respaldo conocido. Requiere DATABASE_URL + llaves Supabase (stack real).
 *
 * serial: el test de código de respaldo DESACTIVA el MFA, así que va después del
 * de TOTP (que necesita el MFA activo).
 */

import { test, expect, type Page } from "@playwright/test";
import { PrismaClient } from "@lucams/db";
import { createClient } from "@supabase/supabase-js";
import { createHmac } from "node:crypto";
import { totp } from "./_helpers/totp";

const strip = (v: string | undefined) => v?.replace(/^["']|["']$/g, "");
const prisma = new PrismaClient();
const SB_URL = strip(process.env.NEXT_PUBLIC_SUPABASE_URL)!;
const ANON = strip(process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY)!;
const SERVICE = strip(process.env.SUPABASE_SECRET_KEY)!;
const service = createClient(SB_URL, SERVICE, { auth: { persistSession: false } });

const EMAIL = `e2e-mfa-${Date.now()}@example.com`;
const PASSWORD = "E2E-Mfa-Test-918273650";
const RECOVERY_CODE = "E2ERC-ODE01";
let supabaseUserId = "";
let adminId = "";
let totpSecret = "";

// Mismo hash que features/admin-mfa/recovery-codes.ts (HMAC-SHA256 del código
// normalizado, keyed con CSRF_SECRET — pepper de servidor desde B-5).
function hashCode(code: string): string {
  return createHmac("sha256", strip(process.env.CSRF_SECRET) ?? "")
    .update(code.toUpperCase().replace(/[^A-Z0-9]/g, ""))
    .digest("hex");
}

test.beforeAll(async () => {
  const { data, error } = await service.auth.admin.createUser({
    email: EMAIL,
    password: PASSWORD,
    email_confirm: true,
  });
  if (error || !data.user)
    throw new Error(`E2E MFA: no se pudo crear auth user: ${error?.message}`);
  supabaseUserId = data.user.id;
  const admin = await prisma.adminUser.create({
    data: { supabaseUserId, email: EMAIL, role: "SUPERADMIN", isActive: true },
    select: { id: true },
  });
  adminId = admin.id;

  // Enrolar + verificar MFA (TOTP) con nuestra impl. de código.
  const cli = createClient(SB_URL, ANON, { auth: { persistSession: false } });
  await cli.auth.signInWithPassword({ email: EMAIL, password: PASSWORD });
  const { data: en, error: ee } = await cli.auth.mfa.enroll({ factorType: "totp" });
  if (ee || !en) throw new Error(`E2E MFA: enroll falló: ${ee?.message}`);
  totpSecret = en.totp.secret;
  const { error: ve } = await cli.auth.mfa.challengeAndVerify({
    factorId: en.id,
    code: totp(totpSecret, Date.now()),
  });
  if (ve) throw new Error(`E2E MFA: verify falló: ${ve.message}`);

  // Código de respaldo conocido.
  await prisma.adminRecoveryCode.create({
    data: { adminUserId: adminId, codeHash: hashCode(RECOVERY_CODE) },
  });
});

test.afterAll(async () => {
  if (adminId)
    await prisma.adminRecoveryCode.deleteMany({ where: { adminUserId: adminId } }).catch(() => {});
  if (adminId) await prisma.adminUser.deleteMany({ where: { id: adminId } }).catch(() => {});
  if (supabaseUserId) await service.auth.admin.deleteUser(supabaseUserId).catch(() => {});
  await prisma.$disconnect();
});

async function loginToMfa(page: Page) {
  await page.goto("/admin/login");
  await page.locator('input[name="email"]').fill(EMAIL);
  await page.locator('input[name="password"]').fill(PASSWORD);
  await page.getByRole("button", { name: /iniciar sesión/i }).click();
  // Con MFA verificado, el login redirige al reto en vez del dashboard.
  await page.waitForURL(/\/admin\/login\/mfa/, { timeout: 20_000 });
}

test.describe.serial("admin — reto MFA", () => {
  test("con el código TOTP correcto entra al dashboard", async ({ page }) => {
    // Diagnóstico A3: escuchar la consola del browser (el componente loguea
    // el error REAL de challengeAndVerify con prefijo [mfa]).
    page.on("console", (msg) => {
      if (msg.text().includes("[mfa]")) console.log(`[browser-console] ${msg.text()}`);
    });
    await loginToMfa(page);
    // Diagnóstico A3: ¿la sesión de Supabase quedó en cookies tras el login?
    const cookieNames = (await page.context().cookies()).map((c) => c.name);
    console.log(`[mfa-diag] cookies tras login: ${cookieNames.join(", ") || "(ninguna)"}`);
    await page.getByPlaceholder("123456").fill(totp(totpSecret, Date.now()));
    // Diagnóstico A3: captura la respuesta REAL de GoTrue al challenge/verify
    // (el componente muestra un mensaje genérico para cualquier verifyErr).
    const verifyRespPromise = page
      .waitForResponse((r) => r.url().includes("/auth/v1/"), { timeout: 15_000 })
      .catch(() => null);
    await page.getByRole("button", { name: /verificar y entrar/i }).click();
    const verifyResp = await verifyRespPromise;
    if (verifyResp) {
      console.log(
        `[mfa-diag] ${verifyResp.url()} → ${verifyResp.status()} :: ${await verifyResp.text().catch(() => "<sin body>")}`,
      );
    } else {
      console.log("[mfa-diag] ninguna request a /auth/v1/* tras el click (¿sin sesión?)");
    }
    await page.waitForURL(/\/admin\/dashboard/, { timeout: 20_000 });
    await expect(page).toHaveURL(/\/admin\/dashboard/);
  });

  test("con un código de respaldo entra y va a reconfigurar (desactiva el MFA)", async ({
    page,
  }) => {
    await loginToMfa(page);
    await page.getByRole("button", { name: /usar un código de respaldo/i }).click();
    await page.getByPlaceholder("XXXX-XXXX-XXXX-XXXX").fill(RECOVERY_CODE);
    await page.getByRole("button", { name: /entrar con código de respaldo/i }).click();
    await page.waitForURL(/\/admin\/seguridad\?reconfig=1/, { timeout: 20_000 });
    await expect(page).toHaveURL(/reconfig=1/);
  });
});
