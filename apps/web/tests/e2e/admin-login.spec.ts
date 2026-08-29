/*
 * E2E — login del panel admin (Bloque E, Lucy 2026-06-29).
 *
 * Control de acceso al panel: un admin válido CON MFA pasa el reto TOTP y entra
 * al dashboard; credenciales inválidas no entran. Crea AdminUsers efímeros
 * (auth user vía service role + fila AdminUser) y los limpia. Desde B-1
 * (auditoría 2026-08-24) el MFA es OBLIGATORIO: el admin principal enrola TOTP
 * vía API (helper _helpers/mfa), y un segundo admin SIN factor verifica el gate
 * de enrolamiento forzado. La pantalla de login NO tiene Turnstile. Requiere
 * DATABASE_URL + llaves Supabase (`dotenv -e .env.local -- playwright test`).
 */

import { test, expect } from "@playwright/test";
import { PrismaClient } from "@lucams/db";
import { createClient } from "@supabase/supabase-js";
import { enrollTotpFactor, loginAdminWithTotp } from "./_helpers/mfa";

const strip = (v: string | undefined) => v?.replace(/^["']|["']$/g, "");
const prisma = new PrismaClient();
const SB_URL = strip(process.env.NEXT_PUBLIC_SUPABASE_URL)!;
const SERVICE = strip(process.env.SUPABASE_SECRET_KEY)!;
const service = createClient(SB_URL, SERVICE, { auth: { persistSession: false } });

const EMAIL = `e2e-admin-${Date.now()}@example.com`;
const PASSWORD = "E2E-Admin-Test-918273650";
// Segundo admin SIN MFA: verifica el gate de enrolamiento forzado (B-1).
const EMAIL_NO_MFA = `e2e-admin-nomfa-${Date.now()}@example.com`;
let supabaseUserId = "";
let adminId = "";
let noMfaSupabaseUserId = "";
let noMfaAdminId = "";
let totpSecret = "";

test.beforeAll(async () => {
  const { data, error } = await service.auth.admin.createUser({
    email: EMAIL,
    password: PASSWORD,
    email_confirm: true,
  });
  if (error || !data.user)
    throw new Error(`E2E admin: no se pudo crear auth user: ${error?.message}`);
  supabaseUserId = data.user.id;
  const admin = await prisma.adminUser.create({
    data: { supabaseUserId, email: EMAIL, role: "SUPERADMIN", isActive: true },
    select: { id: true },
  });
  adminId = admin.id;
  totpSecret = await enrollTotpFactor(EMAIL, PASSWORD);

  const { data: noMfa, error: noMfaErr } = await service.auth.admin.createUser({
    email: EMAIL_NO_MFA,
    password: PASSWORD,
    email_confirm: true,
  });
  if (noMfaErr || !noMfa.user)
    throw new Error(`E2E admin: no se pudo crear el auth user sin MFA: ${noMfaErr?.message}`);
  noMfaSupabaseUserId = noMfa.user.id;
  const noMfaAdmin = await prisma.adminUser.create({
    data: {
      supabaseUserId: noMfaSupabaseUserId,
      email: EMAIL_NO_MFA,
      role: "MANAGER",
      isActive: true,
    },
    select: { id: true },
  });
  noMfaAdminId = noMfaAdmin.id;
});

test.afterAll(async () => {
  if (adminId) await prisma.adminUser.deleteMany({ where: { id: adminId } }).catch(() => {});
  if (noMfaAdminId)
    await prisma.adminUser.deleteMany({ where: { id: noMfaAdminId } }).catch(() => {});
  if (supabaseUserId) await service.auth.admin.deleteUser(supabaseUserId).catch(() => {});
  if (noMfaSupabaseUserId) await service.auth.admin.deleteUser(noMfaSupabaseUserId).catch(() => {});
  await prisma.$disconnect();
});

test.describe("admin login", () => {
  test("un admin válido con MFA pasa el reto TOTP y llega al dashboard", async ({ page }) => {
    await loginAdminWithTotp(page, { email: EMAIL, password: PASSWORD, totpSecret });
    await expect(page).toHaveURL(/\/admin\/dashboard/);
  });

  test("B-1: un admin SIN factor TOTP cae en el enrolamiento forzado (no en el dashboard)", async ({
    page,
  }) => {
    await page.goto("/admin/login");
    await page.locator('input[name="email"]').fill(EMAIL_NO_MFA);
    await page.locator('input[name="password"]').fill(PASSWORD);
    await page.getByRole("button", { name: /iniciar sesión/i }).click();
    await page.waitForURL(/\/admin\/seguridad\?enroll=required/, { timeout: 20_000 });
    await expect(page).toHaveURL(/\/admin\/seguridad\?enroll=required/);
  });

  test("credenciales inválidas no entran (se queda en /admin/login)", async ({ page }) => {
    await page.goto("/admin/login");
    await page.locator('input[name="email"]').fill(EMAIL);
    await page.locator('input[name="password"]').fill("contraseña-incorrecta-xyz");
    await page.getByRole("button", { name: /iniciar sesión/i }).click();
    // No debe llegar al dashboard; se queda en login (mensaje de error genérico).
    await page.waitForTimeout(2_000);
    await expect(page).not.toHaveURL(/\/admin\/dashboard/);
    await expect(page).toHaveURL(/\/admin\/login/);
  });
});
