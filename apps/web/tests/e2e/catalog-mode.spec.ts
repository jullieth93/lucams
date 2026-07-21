/*
 * E2E — modo catálogo (Etapa 1, NEXT_PUBLIC_STORE_MODE=catalog).
 *
 * Cubre el flujo de cotización SIN dependencias externas (Turnstile/Wompi):
 *   home → catálogo → PDP → agregar al carrito → carrito → CTA "Cotizar por
 *   WhatsApp" → formulario de cotización (render + validación de vacíos; NO se
 *   hace submit real porque depende de Turnstile) + panel admin /admin/cotizaciones
 *   (login con admin efímero, mismo patrón que admin-login.spec.ts).
 *
 * SOLO corre en modo catálogo: si la var no es "catalog" se salta entero (el
 * server que levanta playwright hereda la env, así que UI y test van en el
 * mismo modo). Requiere DATABASE_URL + llaves Supabase
 * (`dotenv -e .env.local -- playwright test`). Producto y admin efímeros se
 * limpian en afterAll (igual que compra.spec.ts / admin-login.spec.ts).
 */

import { test, expect } from "@playwright/test";
// PrismaClient vía @lucams/db (re-exporta @prisma/client) — resoluble por tsc
// desde apps/web y sin el import `server-only` de @/lib/db (rompería en Node).
import { PrismaClient } from "@lucams/db";
import { createClient } from "@supabase/supabase-js";

test.skip(
  process.env.NEXT_PUBLIC_STORE_MODE !== "catalog",
  "Este spec solo corre en modo catálogo (NEXT_PUBLIC_STORE_MODE=catalog).",
);

const strip = (v: string | undefined) => v?.replace(/^["']|["']$/g, "");
const prisma = new PrismaClient();
const SB_URL = strip(process.env.NEXT_PUBLIC_SUPABASE_URL)!;
const SERVICE = strip(process.env.SUPABASE_SECRET_KEY)!;
const service = createClient(SB_URL, SERVICE, { auth: { persistSession: false } });

const RUN = `e2e-cat-${Date.now()}`;
const ADMIN_EMAIL = `${RUN}@example.com`;
const ADMIN_PASSWORD = "E2E-Catalog-Test-918273650";

let slug = "";
let productId = "";
let categoryId = "";
let variantId = "";
let supabaseUserId = "";
let adminId = "";

test.beforeAll(async () => {
  // Producto efímero NO personalizable → la PDP muestra "Añadir al carrito"
  // (el catálogo real es 100% personalizable y va al Estudio).
  const category = await prisma.category.create({
    data: { slug: `${RUN}-cat`, name: `Cat ${RUN}` },
  });
  categoryId = category.id;

  const product = await prisma.product.create({
    data: {
      slug: `${RUN}-simple`,
      name: `E2E Catalog ${RUN}`,
      description: "Producto efímero para el E2E de modo catálogo.",
      basePrice: 19_900,
      sku: `${RUN}-SIMPLE`.toUpperCase(),
      categoryId,
      variants: {
        create: [
          {
            name: "Default",
            sku: `${RUN}-SIMPLE-DEFAULT`.toUpperCase(),
            price: 19_900,
            stock: 100,
            attributes: {},
          },
        ],
      },
    },
    select: { id: true, slug: true, variants: { select: { id: true } } },
  });
  productId = product.id;
  slug = product.slug;
  variantId = product.variants[0]!.id;

  // Admin efímero sin MFA (login directo al dashboard — patrón admin-login.spec).
  const { data, error } = await service.auth.admin.createUser({
    email: ADMIN_EMAIL,
    password: ADMIN_PASSWORD,
    email_confirm: true,
  });
  if (error || !data.user)
    throw new Error(`E2E catalog: no se pudo crear auth user: ${error?.message}`);
  supabaseUserId = data.user.id;
  const admin = await prisma.adminUser.create({
    data: { supabaseUserId, email: ADMIN_EMAIL, role: "SUPERADMIN", isActive: true },
    select: { id: true },
  });
  adminId = admin.id;
});

test.afterAll(async () => {
  await prisma.cartItem.deleteMany({ where: { variantId } }).catch(() => {});
  await prisma.productVariant.deleteMany({ where: { productId } }).catch(() => {});
  await prisma.product.delete({ where: { id: productId } }).catch(() => {});
  await prisma.category.delete({ where: { id: categoryId } }).catch(() => {});
  if (adminId) await prisma.adminUser.deleteMany({ where: { id: adminId } }).catch(() => {});
  if (supabaseUserId) await service.auth.admin.deleteUser(supabaseUserId).catch(() => {});
  await prisma.$disconnect();
});

test.describe("modo catálogo — flujo público de cotización", () => {
  test("home → catálogo → PDP → carrito → CTA 'Cotizar por WhatsApp' → form de cotización", async ({
    page,
  }) => {
    // Home y catálogo renderizan normal (el modo catálogo no los bloquea).
    await page.goto("/");
    await expect(page).toHaveTitle(/./);
    await page.goto("/productos");
    await expect(page.locator("h1").first()).toBeVisible();
    // El grid de catálogo aplica curaduría (imágenes/destacados) que el producto
    // efímero no cumple; compra.spec navega DIRECTO a la PDP por URL — el mismo
    // patrón acá (lo que se prueba es el flujo de cotización, no el grid).
    await page.goto(`/producto/${slug}`);
    await expect(page).toHaveURL(new RegExp(`/producto/${slug}`));

    // PDP → agregar al carrito (redirect ?added=1 confirma el insert — patrón
    // compra.spec: es la señal fiable, no el conteo del header).
    const addBtn = page.getByRole("button", { name: /añadir al carrito/i });
    await expect(addBtn).toBeVisible();
    await addBtn.click();
    await page.waitForURL(/[?&]added=1/, { timeout: 15_000 });

    // Carrito: el CTA principal es "Cotizar por WhatsApp" (NO "Ir a pagar").
    await expect(async () => {
      await page.goto("/carrito");
      await expect(page.getByText(`E2E Catalog ${RUN}`).first()).toBeVisible();
    }).toPass({ timeout: 30_000 });
    const cta = page.getByRole("link", { name: /cotizar por whatsapp/i });
    await expect(cta).toBeVisible();
    await expect(page.getByRole("link", { name: /ir a pagar/i })).toHaveCount(0);

    // El CTA lleva al formulario de cotización de 1 paso.
    await cta.click();
    await expect(async () => {
      await expect(page).toHaveURL(/\/checkout\/datos/);
      await expect(page.getByText(/pide tu cotización/i)).toBeVisible();
    }).toPass({ timeout: 30_000 });

    // Render: los campos que espera createQuoteAction + copy de coordinación.
    await expect(page.locator('input[name="customerName"]')).toBeVisible();
    await expect(page.locator("#whatsapp-display")).toBeVisible();
    await expect(page.locator('input[name="customerEmail"]')).toBeVisible();
    await expect(page.locator("#deptCode")).toBeVisible();
    await expect(page.locator('textarea[name="notes"]')).toBeVisible();
    await expect(
      page.getByText(/el envío se coordina por whatsapp al confirmar tu cotización/i).first(),
    ).toBeVisible();
    // En modo catálogo el stepper de 3 pasos NO se muestra.
    await expect(page.locator('nav[aria-label="Progreso del checkout"]')).toHaveCount(0);

    // Validación de vacíos (sin submit real — Turnstile): el browser bloquea
    // el envío nativo y el form sigue inválido, sin salir de la página.
    await page.getByRole("button", { name: /pedir cotización/i }).click();
    await expect(page).toHaveURL(/\/checkout\/datos/);
    const formValid = await page
      .locator("form")
      .first()
      .evaluate((f) => (f as HTMLFormElement).checkValidity());
    expect(formValid).toBe(false);
  });
});

test.describe("modo catálogo — panel admin", () => {
  test("un admin entra y /admin/cotizaciones renderiza (lista + filtros)", async ({ page }) => {
    await page.goto("/admin/login");
    await page.locator('input[name="email"]').fill(ADMIN_EMAIL);
    await page.locator('input[name="password"]').fill(ADMIN_PASSWORD);
    await page.getByRole("button", { name: /iniciar sesión/i }).click();
    await page.waitForURL(/\/admin\/dashboard/, { timeout: 20_000 });

    // El sidebar muestra "Cotizaciones" como primer item de Ventas.
    await expect(page.getByRole("link", { name: "Cotizaciones" }).first()).toBeVisible();

    await page.goto("/admin/cotizaciones");
    await expect(page.getByRole("heading", { name: "Cotizaciones" })).toBeVisible();
    await expect(page.locator('input[name="q"]')).toBeVisible();
    await expect(page.locator('select[name="status"]')).toBeVisible();
  });
});
