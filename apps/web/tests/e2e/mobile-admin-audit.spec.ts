import { test, type Page } from "@playwright/test";
import "../setup-env";
import { PrismaClient } from "@lucams/db";
import { createClient } from "@supabase/supabase-js";
import fs from "node:fs";
import path from "node:path";

/*
 * Auditoría móvil del panel admin (roadmap E1 — pedido del usuario 2026-07-30:
 * "la versión móvil, sobre todo capa admin, está poco eficiente"; Lucy opera
 * desde el celular).
 *
 * Recorre las pantallas críticas del admin con viewport móvil (375×812) y
 * por cada una: screenshot full-page + medición OBJETIVA de overflow
 * horizontal (scrollWidth > clientWidth = la página se sale de la pantalla).
 * Salida: PNGs + summary.json en tmp/screenshots/e1/ (gitignored) para el
 * inventario de problemas que alimenta E2 (fixes).
 *
 * Local: corre contra el dev server (:4000). NO gatea CI (el job e2e de PR
 * corre solo smoke/a11y/axe/compra/estudio).
 */

const strip = (v: string | undefined) => v?.replace(/^["']|["']$/g, "");
const prisma = new PrismaClient();
const service = createClient(
  strip(process.env.NEXT_PUBLIC_SUPABASE_URL)!,
  strip(process.env.SUPABASE_SECRET_KEY)!,
  { auth: { persistSession: false } },
);

const RUN = `e1-${Date.now()}`;
const ADMIN_EMAIL = `${RUN}@example.com`;
const ADMIN_PASSWORD = "E1-Admin-918273650";
let supabaseUserId = "";
let adminId = "";

const OUT_DIR = path.resolve(__dirname, "../../../../tmp/screenshots/e1");

test.setTimeout(300_000);

// Viewport móvil (iPhone 375px) para todo el spec.
test.use({ viewport: { width: 375, height: 812 } });

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

test("auditoría móvil E1 — pantallas críticas del admin a 375px", async ({ page }) => {
  // Campos reales para el editor de campo y el editor de lista.
  const [heroField, listField] = await Promise.all([
    prisma.cmsField.findUnique({ where: { key: "home.hero.title" }, select: { id: true } }),
    prisma.cmsField.findUnique({ where: { key: "footer.legal.links" }, select: { id: true } }),
  ]);

  const ROUTES: { name: string; path: string }[] = [
    { name: "dashboard", path: "/admin/dashboard" },
    { name: "contenido-indice", path: "/admin/contenido" },
    { name: "contenido-editor-pagina", path: "/admin/contenido/paginas/inicio" },
    ...(heroField
      ? [{ name: "contenido-editor-campo", path: `/admin/contenido/campos/${heroField.id}` }]
      : []),
    ...(listField
      ? [{ name: "contenido-editor-lista", path: `/admin/contenido/campos/${listField.id}` }]
      : []),
    { name: "contenido-mediateca", path: "/admin/contenido/mediateca" },
    { name: "contenido-borradores", path: "/admin/contenido/borradores" },
    { name: "pedidos", path: "/admin/pedidos" },
    { name: "cotizaciones", path: "/admin/cotizaciones" },
    { name: "productos", path: "/admin/productos" },
  ];

  fs.mkdirSync(OUT_DIR, { recursive: true });
  await adminLogin(page);

  const summary: {
    route: string;
    screenshot: string;
    horizontalOverflow: boolean;
    scrollWidth: number;
    clientWidth: number;
    status: number | null;
  }[] = [];

  for (const route of ROUTES) {
    const resp = await page.goto(route.path, { waitUntil: "domcontentloaded" }).catch(() => null);
    await page.waitForTimeout(2500); // hidratación + datos (dev server)
    const metrics = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
    }));
    const shot = `${route.name}.png`;
    await page.screenshot({ path: path.join(OUT_DIR, shot), fullPage: true });
    const horizontalOverflow = metrics.scrollWidth > metrics.clientWidth + 1;
    summary.push({
      route: route.path,
      screenshot: `tmp/screenshots/e1/${shot}`,
      horizontalOverflow,
      scrollWidth: metrics.scrollWidth,
      clientWidth: metrics.clientWidth,
      status: resp?.status() ?? null,
    });
    console.log(
      `${horizontalOverflow ? "❌ OVERFLOW" : "✅"} ${route.path} — scrollW ${metrics.scrollWidth} / clientW ${metrics.clientWidth} (HTTP ${resp?.status() ?? "?"})`,
    );
  }

  fs.writeFileSync(path.join(OUT_DIR, "summary.json"), JSON.stringify(summary, null, 2));
  const withOverflow = summary.filter((s) => s.horizontalOverflow).length;
  console.log(
    `\nRESUMEN E1: ${withOverflow}/${summary.length} pantallas con overflow horizontal a 375px`,
  );
});
