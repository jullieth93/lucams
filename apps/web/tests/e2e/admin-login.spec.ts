/*
 * E2E — login del panel admin (Bloque E, Lucy 2026-06-29).
 *
 * Control de acceso al panel: un admin válido (sin MFA) entra al dashboard;
 * credenciales inválidas no entran. Crea un AdminUser efímero (auth user vía
 * service role + fila AdminUser) y lo limpia. Sin MFA enrolado → no pasa por el
 * reto TOTP. La pantalla de login NO tiene Turnstile. Requiere DATABASE_URL +
 * llaves Supabase (`dotenv -e .env.local -- playwright test`).
 */

import { test, expect } from "@playwright/test";
import { PrismaClient } from "@lucams/db";
import { createClient } from "@supabase/supabase-js";

const strip = (v: string | undefined) => v?.replace(/^["']|["']$/g, "");
const prisma = new PrismaClient();
const SB_URL = strip(process.env.NEXT_PUBLIC_SUPABASE_URL)!;
const SERVICE = strip(process.env.SUPABASE_SECRET_KEY)!;
const service = createClient(SB_URL, SERVICE, { auth: { persistSession: false } });

const EMAIL = `e2e-admin-${Date.now()}@example.com`;
const PASSWORD = "E2E-Admin-Test-918273650";
let supabaseUserId = "";
let adminId = "";

test.beforeAll(async () => {
  const { data, error } = await service.auth.admin.createUser({
    email: EMAIL,
    password: PASSWORD,
    email_confirm: true,
  });
  if (error || !data.user) throw new Error(`E2E admin: no se pudo crear auth user: ${error?.message}`);
  supabaseUserId = data.user.id;
  const admin = await prisma.adminUser.create({
    data: { supabaseUserId, email: EMAIL, role: "SUPERADMIN", isActive: true },
    select: { id: true },
  });
  adminId = admin.id;
});

test.afterAll(async () => {
  if (adminId) await prisma.adminUser.deleteMany({ where: { id: adminId } }).catch(() => {});
  if (supabaseUserId) await service.auth.admin.deleteUser(supabaseUserId).catch(() => {});
  await prisma.$disconnect();
});

test.describe("admin login", () => {
  test("un admin válido (sin MFA) inicia sesión y llega al dashboard", async ({ page }) => {
    await page.goto("/admin/login");
    await page.locator('input[name="email"]').fill(EMAIL);
    await page.locator('input[name="password"]').fill(PASSWORD);
    await page.getByRole("button", { name: /iniciar sesión/i }).click();
    await page.waitForURL(/\/admin\/dashboard/, { timeout: 20_000 });
    await expect(page).toHaveURL(/\/admin\/dashboard/);
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
