import { expect, test, type Page } from "@playwright/test";
import "../setup-env";
import { PrismaClient } from "@lucams/db";
import { createClient } from "@supabase/supabase-js";
import { completeMfaChallengeIfNeeded, enrollTotpFactor } from "./_helpers/mfa";

/*
 * Verificación del modo edición in-place (roadmap C1 paso 2).
 *
 * Local: corre contra el dev server (:4000). NO gatea CI (compañera de
 * mobile-admin-audit.spec.ts / mobile-storefront-audit.spec.ts — herramienta
 * de verificación y regresión manual).
 *
 * Flujo certificado: admin temporal → login → /admin/contenido → «Editar en
 * el sitio» → portada con banner + textos CMS anotados (data-cms-key) →
 * click en el título del hero → puerta por-key → editor de ESE campo →
 * volver a / → «Salir» → el banner y las anotaciones desaparecen.
 */

const strip = (v: string | undefined) => v?.replace(/^["']|["']$/g, "");
const prisma = new PrismaClient();
const service = createClient(
  strip(process.env.NEXT_PUBLIC_SUPABASE_URL)!,
  strip(process.env.SUPABASE_SECRET_KEY)!,
  { auth: { persistSession: false } },
);

const RUN = `c1p2-${Date.now()}`;
const ADMIN_EMAIL = `${RUN}@example.com`;
const ADMIN_PASSWORD = "C1P2-Admin-918273650";
let supabaseUserId = "";
let adminId = "";
let totpSecret = "";

test.setTimeout(180_000);

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
      .waitFor({ state: "detached", timeout: 30_000 });
    // Tras el login con password viene el reto TOTP (MFA obligatorio, B-1).
    await completeMfaChallengeIfNeeded(page, totpSecret);
  }
}

test("modo edición in-place: banner, anotación, click → editor del campo, salir", async ({
  page,
}) => {
  await adminLogin(page);

  // Prender el modo desde el índice de contenido → cae en la portada.
  await page.goto("/admin/contenido", { waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: /Editar en el sitio/i }).click();
  await page.waitForURL((url) => url.pathname === "/");

  // Banner visible + textos CMS anotados con data-cms-key.
  await expect(page.getByText(/Modo edición:/i)).toBeVisible();
  const heroTitle = page.locator('[data-cms-key="home.hero.title-prefix"]').first();
  await expect(heroTitle).toBeVisible();

  // Click → la puerta por-key redirige al editor real del campo (/campos/<id>).
  await heroTitle.click();
  await page.waitForURL(/\/admin\/contenido\/campos\/(?!por-key)[^/]+$/, { timeout: 30_000 });

  // De vuelta a la portada: «Salir» apaga el modo (banner y anotaciones fuera).
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: /^Salir$/i }).click();
  await page.waitForURL((url) => url.pathname === "/");
  await expect(page.getByText(/Modo edición:/i)).toHaveCount(0);
  await expect(page.locator("[data-cms-key]")).toHaveCount(0);
});
