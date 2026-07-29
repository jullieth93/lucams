import { test, type Page } from "@playwright/test";
import "../setup-env";
import { PrismaClient } from "@lucams/db";
import { createClient } from "@supabase/supabase-js";

const strip = (v: string | undefined) => v?.replace(/^["']|["']$/g, "");
const prisma = new PrismaClient();
const service = createClient(
  strip(process.env.NEXT_PUBLIC_SUPABASE_URL)!,
  strip(process.env.SUPABASE_SECRET_KEY)!,
  {
    auth: { persistSession: false },
  },
);

const RUN = `shot-${Date.now()}`;
const ADMIN_EMAIL = `${RUN}@example.com`;
const ADMIN_PASSWORD = "Shot-Admin-918273650";
let supabaseUserId = "";
let adminId = "";

const MODULES = [
  "reclamos",
  "mensajes",
  "mayorista",
  "materiales",
  "costos",
  "metricas",
  "performance",
];
const ROUTES = [...MODULES.map((m) => `/admin/${m}`), "/admin/canales/tienda"];

test.setTimeout(240_000);

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

async function adminLogin(page: Page) {
  await page.goto("/admin", { waitUntil: "domcontentloaded" });
  const emailInput = page.locator('input[name="email"], input[type="email"]').first();
  if (await emailInput.count()) {
    await emailInput.fill(ADMIN_EMAIL);
    await page
      .locator('input[name="password"], input[type="password"]')
      .first()
      .fill(ADMIN_PASSWORD);
    await page
      .getByRole("button", { name: /Iniciar sesión|Ingresar|Entrar/i })
      .first()
      .click();
    await page
      .locator('input[name="email"], input[type="email"]')
      .first()
      .waitFor({ state: "detached", timeout: 30_000 })
      .catch(() => {});
  }
  await page.waitForTimeout(2000);
}

test("capturas de los 8 módulos nuevos", async ({ page }) => {
  await adminLogin(page);
  for (const route of ROUTES) {
    await page.goto(route, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(1500);
    const name = route.replace("/admin/", "").replace(/\//g, "-");
    await page.screenshot({ path: `/tmp/admin100-${name}.png`, fullPage: false });
  }
});
