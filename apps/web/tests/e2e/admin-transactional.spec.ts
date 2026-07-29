/*
 * E2E — admin transaccional (develop): finanzas + pedidos con una orden PAID real.
 *
 * A diferencia de Fase A (modo catálogo), develop corre en modo FULL: el admin
 * debe mostrar finanzas/pedidos operativos. Se restaura (deletedAt=null) la
 * última orden REAL pagada por el e2e Wompi sandbox (FULFILLING, con guía
 * Aveonline) y se verifica que:
 *   1. /admin/pedidos la lista con su número.
 *   2. /admin/finanzas carga sin error boundary.
 *   3. /admin/moderacion y /admin/disenos cargan operativos.
 * afterAll vuelve a soft-borrar la orden y limpia el admin efímero.
 * Requiere DATABASE_URL + llaves Supabase (`dotenv -e .env.local -- playwright test`).
 */

import { test, expect } from "@playwright/test";
import { PrismaClient } from "@lucams/db";
import { createClient } from "@supabase/supabase-js";

const strip = (v: string | undefined) => v?.replace(/^["']|["']$/g, "");
const prisma = new PrismaClient();
const SB_URL = strip(process.env.NEXT_PUBLIC_SUPABASE_URL)!;
const SERVICE = strip(process.env.SUPABASE_SECRET_KEY)!;
const service = createClient(SB_URL, SERVICE, { auth: { persistSession: false } });

const EMAIL = `e2e-admin-tx-${Date.now()}@example.com`;
const PASSWORD = "E2E-Admin-Tx-918273650";
let supabaseUserId = "";
let adminId = "";
let orderId = "";
let orderNumber = "";

test.beforeAll(async () => {
  // Orden PAID real del e2e Wompi (email wompi-e2e-*, soft-borrada por su afterAll).
  const order = await prisma.order.findFirst({
    where: {
      email: { contains: "wompi-e2e" },
      deletedAt: { not: null },
      status: { in: ["PAID", "FULFILLING", "SHIPPED", "DELIVERED"] },
    },
    orderBy: { createdAt: "desc" },
    select: { id: true, number: true },
  });
  if (!order) throw new Error("no hay orden e2e Wompi para restaurar (corre wompi-sandbox antes)");
  await prisma.order.update({ where: { id: order.id }, data: { deletedAt: null } });
  orderId = order.id;
  orderNumber = order.number;

  const { data, error } = await service.auth.admin.createUser({
    email: EMAIL,
    password: PASSWORD,
    email_confirm: true,
  });
  if (error || !data.user) throw new Error(`E2E admin-tx: ${error?.message}`);
  supabaseUserId = data.user.id;
  const admin = await prisma.adminUser.create({
    data: { supabaseUserId, email: EMAIL, role: "SUPERADMIN", isActive: true },
    select: { id: true },
  });
  adminId = admin.id;
});

test.afterAll(async () => {
  if (orderId)
    await prisma.order
      .update({ where: { id: orderId }, data: { deletedAt: new Date() } })
      .catch(() => {});
  if (adminId) await prisma.adminUser.deleteMany({ where: { id: adminId } }).catch(() => {});
  if (supabaseUserId) await service.auth.admin.deleteUser(supabaseUserId).catch(() => {});
  await prisma.$disconnect();
});

async function login(page: import("@playwright/test").Page) {
  await page.goto("/admin/login");
  await page.locator('input[name="email"]').fill(EMAIL);
  await page.locator('input[name="password"]').fill(PASSWORD);
  await page.getByRole("button", { name: /iniciar sesión/i }).click();
  await page.waitForURL(/\/admin\/dashboard/, { timeout: 20_000 });
}

test.describe("admin transaccional (modo full)", () => {
  test("/admin/pedidos lista la orden PAID real con su número", async ({ page }) => {
    await login(page);
    await page.goto("/admin/pedidos");
    await expect(page.getByText(orderNumber).first()).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText(/algo salió mal/i)).toHaveCount(0);
  });

  test("/admin/finanzas carga operativa (sin error boundary)", async ({ page }) => {
    await login(page);
    await page.goto("/admin/finanzas");
    await expect(page.locator("main").first()).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText(/algo salió mal/i)).toHaveCount(0);
    await page.screenshot({ path: "/tmp/admin-tx-finanzas.png", fullPage: true });
  });

  test("/admin/moderacion y /admin/disenos cargan operativos", async ({ page }) => {
    await login(page);
    await page.goto("/admin/moderacion");
    await expect(page.locator("main").first()).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText(/algo salió mal/i)).toHaveCount(0);
    await page.goto("/admin/disenos");
    await expect(page.locator("main").first()).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText(/algo salió mal/i)).toHaveCount(0);
  });
});
