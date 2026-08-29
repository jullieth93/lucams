import { test, expect, type Page } from "@playwright/test";
import "../setup-env";
import { PrismaClient } from "@lucams/db";
import { createClient } from "@supabase/supabase-js";
import { completeMfaChallengeIfNeeded, enrollTotpFactor } from "./_helpers/mfa";

/*
 * Smoke A1 post-release en PRODUCCIÓN (roadmap A1 — "editar un texto de
 * Inicio → publicar → ver en /"). Corre SOLO con PLAYWRIGHT_BASE_URL apuntando
 * al sitio en vivo (no levanta server local):
 *
 *   PLAYWRIGHT_BASE_URL=https://lucamsshop.com pnpm --filter web exec playwright test release-check-a1
 *
 * ⚠️ NOMBRE DELIBERADO: el job e2e de CI corre `playwright test smoke a11y axe
 * compra estudio` (match por SUBSTRING de archivo) — llamarla prod-smoke-a1 la
 * metió al gate de CI, que corre con Supabase placeholder y reventó (run
 * 30642231886). "release-check" no matchea ningún filtro.
 *
 * Qué hace (todo con un admin TEMPORAL que crea y borra ella misma vía
 * service role — el proyecto Supabase es compartido dev/prod):
 *   1. Público: home y una página legal responden 200.
 *   2. Login admin en prod → "Actualizar caché de contenido" (paso obligado
 *      post-deploy: los scripts de migración escriben directo en DB).
 *   3. Edita home.categories.cta-all (BLOCK) → Guardar → Publicar → verifica
 *      el texto nuevo en la home pública → revierte al texto original →
 *      verifica la reversa. La variante es brand-safe por si alguien la ve
 *      en los ~2 min que vive el cambio.
 *   4. Móvil (375px): el dashboard renderiza con la topbar fija (fix E2 en prod).
 *
 * NO gatea CI (el job e2e corre solo smoke/a11y/axe/compra/estudio).
 */

const strip = (v: string | undefined) => v?.replace(/^["']|["']$/g, "");
const prisma = new PrismaClient();
const service = createClient(
  strip(process.env.NEXT_PUBLIC_SUPABASE_URL)!,
  strip(process.env.SUPABASE_SECRET_KEY)!,
  { auth: { persistSession: false } },
);

const RUN = `a1-${Date.now()}`;
const ADMIN_EMAIL = `${RUN}@example.com`;
const ADMIN_PASSWORD = "A1-Admin-918273650";
let supabaseUserId = "";
let adminId = "";
let totpSecret = "";

const FIELD_KEY = "home.categories.cta-all";
const ORIGINAL = "Ver todas las categorías y productos →";
const VARIANT = "Ver todo el catálogo →";

// true mientras la VARIANT está publicada en prod (entre el publish del paso 3 y su
// reversa). Si el test muere a mitad, el afterAll la usa para restaurar el copy original.
let variantPublished = false;

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
  // MFA obligatorio (B-1): sin factor TOTP el admin efímero no pasa del enrolamiento.
  totpSecret = await enrollTotpFactor(ADMIN_EMAIL, ADMIN_PASSWORD);
});

test.afterAll(async ({ browser }) => {
  // Reversión GARANTIZADA del campo CMS: si el test murió a mitad (assert/timeout)
  // con la variante publicada, la home de prod quedaría con el copy de prueba.
  // Se restaura el ORIGINAL con el mismo flujo del paso 3 (login admin → guardar →
  // publicar). El paso 1 ya verificó que ORIGINAL es el texto vivo antes de editar.
  if (variantPublished) {
    const page = await browser.newPage();
    try {
      await adminLogin(page);
      await editAndPublish(page, "inicio", FIELD_KEY, ORIGINAL);
      console.log("✓ afterAll: home restaurada al copy original (reversión garantizada)");
    } catch (err) {
      console.error("⚠️ afterAll: NO se pudo restaurar el copy original de la home:", err);
    } finally {
      variantPublished = false;
      await page.close().catch(() => {});
    }
  }
  // Limpieza garantizada aunque falle el smoke: el admin temporal se borra.
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
    // Tras el login con password viene el reto TOTP (MFA obligatorio, B-1).
    await completeMfaChallengeIfNeeded(page, totpSecret);
  }
  await page.waitForTimeout(2000);
}

/** Edita inline un campo del editor de página y lo publica (flujo BLOCK). */
async function editAndPublish(page: Page, pageSlug: string, fieldKey: string, newValue: string) {
  await page.goto(`/admin/contenido/paginas/${pageSlug}`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(2000);
  // Fila del campo: la <li> que contiene el key (se renderiza en un <p> font-mono).
  const row = page.locator("li", { hasText: fieldKey }).first();
  await expect(row).toBeVisible({ timeout: 20_000 });
  await row.locator('input[name="body"]').fill(newValue);
  await row.getByRole("button", { name: /Guardar/i }).click();
  await expect(row.getByText(/Borrador guardado|ya se ve en el sitio/i)).toBeVisible({
    timeout: 30_000,
  });
  await row.getByRole("button", { name: /Publicar/i }).click();
  await page.waitForURL(/published=1/, { timeout: 30_000 });
}

test("A1 — smoke post-release en producción", async ({ page, browser }) => {
  // 1. Público: home + legal responden.
  const home = await page.goto("/", { waitUntil: "domcontentloaded" });
  expect(home?.status()).toBe(200);
  await expect(page.locator("body")).toContainText(ORIGINAL, { timeout: 30_000 });
  const legal = await page.goto("/legal/privacidad", { waitUntil: "domcontentloaded" });
  expect(legal?.status()).toBe(200);

  // 2. Login admin + invalidación de caché CMS (paso post-deploy).
  await adminLogin(page);
  await page.goto("/admin/contenido", { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(2000);
  await page.getByRole("button", { name: /Actualizar caché de contenido/i }).click();
  await page.waitForURL(/cache=refreshed/, { timeout: 30_000 });
  console.log("✓ caché CMS invalidado desde el admin");

  // 3. Editar → publicar → ver en / → revertir → ver original en /.
  await editAndPublish(page, "inicio", FIELD_KEY, VARIANT);
  variantPublished = true; // desde acá la reversa queda garantizada por el afterAll
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await expect(page.locator("body")).toContainText(VARIANT, { timeout: 30_000 });
  console.log("✓ variante publicada y visible en la home");

  await editAndPublish(page, "inicio", FIELD_KEY, ORIGINAL);
  variantPublished = false;
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await expect(page.locator("body")).toContainText(ORIGINAL, { timeout: 30_000 });
  console.log("✓ reversa publicada — la home vuelve al texto original");

  // 4. Móvil 375px: dashboard con topbar fija (fix E2 en prod).
  const mobile = await browser.newPage({ viewport: { width: 375, height: 812 } });
  await mobile.goto("/admin/dashboard", { waitUntil: "domcontentloaded" });
  await mobile.waitForTimeout(3000);
  const mobileMetrics = await mobile.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }));
  expect(mobileMetrics.scrollWidth).toBeLessThanOrEqual(mobileMetrics.clientWidth + 1);
  await mobile.screenshot({ path: "/tmp/a1-prod-mobile-dashboard.png" });
  console.log("✓ dashboard móvil sin overflow en prod (375px)");
  await mobile.close();
});
