import { test, expect, type Page } from "@playwright/test";
import "../setup-env";
import { PrismaClient } from "@lucams/db";
import { createClient } from "@supabase/supabase-js";
import { enrollTotpFactor, loginAdminWithTotp } from "./_helpers/mfa";
import { AdminContenidoPage } from "./pages/admin-contenido";

/*
 * D4 — E2E del flujo de edición del CMS (roadmap D4): login admin → editar un
 * campo de Inicio → publicar → ver el cambio en `/` → REVERTIR la versión
 * desde el historial → ver el texto original de vuelta en `/`.
 *
 * Corre en el NIGHTLY contra el stack Supabase local del runner (A3): crea y
 * borra su propio admin vía service role. NO gatea el CI por-PR (el filtro del
 * gate no la incluye) ni toca producción.
 */

const strip = (v: string | undefined) => v?.replace(/^["']|["']$/g, "");
const prisma = new PrismaClient();
const service = createClient(
  strip(process.env.NEXT_PUBLIC_SUPABASE_URL)!,
  strip(process.env.SUPABASE_SECRET_KEY)!,
  { auth: { persistSession: false } },
);

const RUN = `d4-${Date.now()}`;
const ADMIN_EMAIL = `${RUN}@example.com`;
const ADMIN_PASSWORD = "D4-Admin-918273650";
let supabaseUserId = "";
let adminId = "";
let totpSecret = "";

const FIELD_KEY = "home.categories.cta-all";
const ORIGINAL = "Ver todas las categorías y productos →";
const VARIANT = "Ver todo el catálogo →";

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

test.afterAll(async () => {
  if (adminId) await prisma.adminUser.deleteMany({ where: { id: adminId } }).catch(() => {});
  if (supabaseUserId) await service.auth.admin.deleteUser(supabaseUserId).catch(() => {});
  await prisma.$disconnect();
});

async function adminLogin(page: Page) {
  await loginAdminWithTotp(page, {
    email: ADMIN_EMAIL,
    password: ADMIN_PASSWORD,
    totpSecret,
  });
}

test("D4 — flujo de edición CMS: editar → publicar → ver en / → revertir versión", async ({
  page,
}) => {
  await adminLogin(page);

  const contenido = new AdminContenidoPage(page);
  await contenido.editFieldAndPublish("inicio", FIELD_KEY, VARIANT);

  // El cambio se ve en la home pública.
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await expect(page.locator("body")).toContainText(VARIANT, { timeout: 30_000 });
  console.log("✓ variante publicada y visible en /");

  // Revertir desde el historial de versiones del editor de campo.
  const field = await prisma.cmsField.findUnique({
    where: { key: FIELD_KEY },
    select: { id: true },
  });
  await page.goto(`/admin/contenido/campos/${field!.id}`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(2000);
  // "Volver a esta" en la versión anterior (la que tiene el texto original).
  const originalRow = page.locator("li", { hasText: ORIGINAL }).first();
  await expect(originalRow).toBeVisible({ timeout: 20_000 });
  await expect(async () => {
    await originalRow.getByRole("button", { name: /Volver a esta/i }).click();
    await page.waitForURL(/published=1/, { timeout: 5_000 });
  }).toPass({ timeout: 30_000 });

  // La home vuelve al texto original.
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await expect(page.locator("body")).toContainText(ORIGINAL, { timeout: 30_000 });
  console.log("✓ revert desde el historial — / vuelve al texto original");
});
