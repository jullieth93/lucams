import { test, type Page } from "@playwright/test";
import "../setup-env";
import { PrismaClient } from "@lucams/db";
import { createClient } from "@supabase/supabase-js";

/*
 * Inventario REAL de rutas del panel admin (para la habilitación total, Lucy 2026-07-26).
 * Clasifica cada ruta del NAV como: REAL (página con contenido propio) ·
 * PLACEHOLDER ("En desarrollo") · 404. Salida: tabla en consola + /tmp/admin-inventory.json.
 */

const strip = (v: string | undefined) => v?.replace(/^["']|["']$/g, "");
const prisma = new PrismaClient();
const service = createClient(
  strip(process.env.NEXT_PUBLIC_SUPABASE_URL)!,
  strip(process.env.SUPABASE_SECRET_KEY)!,
  {
    auth: { persistSession: false },
  },
);

const RUN = `inv-${Date.now()}`;
const ADMIN_EMAIL = `${RUN}@example.com`;
const ADMIN_PASSWORD = "Inv-Admin-918273650";
let supabaseUserId = "";
let adminId = "";

const ROUTES = [
  "/admin/dashboard",
  "/admin/cotizaciones",
  "/admin/pedidos",
  "/admin/moderacion",
  "/admin/retractos",
  "/admin/garantias",
  "/admin/soporte",
  "/admin/clientes",
  "/admin/reclamos",
  "/admin/resenas",
  "/admin/productos",
  "/admin/inventario",
  "/admin/categorias",
  "/admin/ocasiones",
  "/admin/plantillas",
  "/admin/cupones",
  "/admin/mayorista",
  "/admin/materiales",
  "/admin/costos",
  "/admin/canales/tienda",
  "/admin/finanzas",
  "/admin/finanzas/conciliacion",
  "/admin/finanzas/bloqueos",
  "/admin/contenido",
  "/admin/contenido/borradores",
  "/admin/contenido/mediateca",
  "/admin/metricas",
  "/admin/observability",
  "/admin/performance",
  "/admin/auditoria",
  "/admin/contenido/paginas/global",
  "/admin/seguridad",
  "/admin/usuarios",
  "/admin/integraciones",
  "/admin/email-templates",
  "/admin/redirects",
  "/admin/mensajes",
];

test.setTimeout(300_000);

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

test("inventario de rutas admin", async ({ page }) => {
  test.setTimeout(240_000);
  await adminLogin(page);
  const results: { route: string; status: string }[] = [];
  for (const route of ROUTES) {
    const resp = await page.goto(route, { waitUntil: "domcontentloaded" }).catch(() => null);
    await page.waitForTimeout(1200);
    const body = await page
      .locator("body")
      .innerText()
      .catch(() => "");
    let status = "REAL";
    if (!resp || resp.status() === 404) status = "404";
    else if (/en desarrollo|en construcción/i.test(body)) status = "PLACEHOLDER";
    else if (/acceso restringido|iniciar sesión/i.test(body)) status = "AUTH-FAIL";
    results.push({ route, status });
    console.log(
      `${status === "REAL" ? "✅" : status === "PLACEHOLDER" ? "🚧" : "❌"} ${route} — ${status}`,
    );
  }
  const fs = await import("node:fs");
  fs.writeFileSync("/tmp/admin-inventory.json", JSON.stringify(results, null, 2));
  const counts = results.reduce(
    (acc, r) => ({ ...acc, [r.status]: (acc[r.status] ?? 0) + 1 }),
    {} as Record<string, number>,
  );
  console.log("\nRESUMEN:", JSON.stringify(counts));
});
