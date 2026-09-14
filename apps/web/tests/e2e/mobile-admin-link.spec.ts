import { test, expect } from "@playwright/test";
import "../setup-env";
import { PrismaClient } from "@lucams/db";
import { createClient } from "@supabase/supabase-js";

/*
 * Regresión e2e — acceso "Panel admin" en móvil (bug PO 2026-09).
 *
 * El chip "Panel admin" del header es `hidden sm:inline-flex` → en móvil la
 * única entrada es el drawer hamburguesa (ShopMegaMenu). Este spec crea un
 * admin efímero (SUPERADMIN, patrón mobile-admin-audit.spec.ts), entra por la
 * UI de /login (JIT-provisioning de Customer, actions.ts) y verifica:
 *   1. Desktop: el chip existe con href /admin/dashboard.
 *   2. Móvil (390×844): el chip ya no existe y el drawer muestra el link
 *      "Panel admin" como entrada a /admin/dashboard.
 *
 * Local: corre contra el dev server (:4000) con el stack Supabase local.
 */

const strip = (v: string | undefined) => v?.replace(/^["']|["']$/g, "");
const prisma = new PrismaClient();
const service = createClient(
  strip(process.env.NEXT_PUBLIC_SUPABASE_URL)!,
  strip(process.env.SUPABASE_SECRET_KEY)!,
  { auth: { persistSession: false } },
);

const RUN = `madlink-${Date.now()}`;
const ADMIN_EMAIL = `${RUN}@example.com`;
const ADMIN_PASSWORD = "MA-Link-918273650";
let supabaseUserId = "";
let adminId = "";

test.beforeAll(async () => {
  const { data, error } = await service.auth.admin.createUser({
    email: ADMIN_EMAIL,
    password: ADMIN_PASSWORD,
    email_confirm: true,
  });
  if (error || !data.user) throw new Error(`no auth user: ${error?.message}`);
  supabaseUserId = data.user.id;
  const admin = await prisma.adminUser.create({
    data: { supabaseUserId, email: ADMIN_EMAIL, role: "SUPERADMIN", isActive: true },
  });
  adminId = admin.id;
});

test.afterAll(async () => {
  if (adminId) await prisma.adminUser.deleteMany({ where: { id: adminId } }).catch(() => {});
  if (supabaseUserId) await service.auth.admin.deleteUser(supabaseUserId).catch(() => {});
  await prisma.$disconnect();
});

async function loginViaUi(page: import("@playwright/test").Page) {
  await page.goto("/login", { waitUntil: "domcontentloaded" });
  await page.locator('input[name="email"], input[type="email"]').first().fill(ADMIN_EMAIL);
  await page.locator('input[name="password"], input[type="password"]').first().fill(ADMIN_PASSWORD);
  await page
    .getByRole("button", { name: /Ingresar|Entrar|Iniciar sesión/i })
    .first()
    .click();
  await page.waitForURL("**/", { timeout: 30_000 });
}

test("regresión — admin ve 'Panel admin' en desktop y en el drawer móvil", async ({ page }) => {
  await loginViaUi(page);

  // Desktop: chip en el header.
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto("/", { waitUntil: "domcontentloaded" });
  const chip = page.getByRole("link", { name: "Panel admin" }).first();
  await expect(chip).toBeVisible();
  await expect(chip).toHaveAttribute("href", "/admin/dashboard");

  // Móvil: viewport <sm → el chip desaparece y la entrada es el drawer.
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("link", { name: "Panel admin" })).toHaveCount(0);
  await page.getByRole("button", { name: "Abrir menú" }).click();
  const drawerLink = page.getByRole("link", { name: "Panel admin" });
  await expect(drawerLink).toBeVisible();
  await expect(drawerLink).toHaveAttribute("href", "/admin/dashboard");
});
