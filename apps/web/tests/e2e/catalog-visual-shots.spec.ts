/*
 * Utilidad E2E — capturas visuales del flujo de cotización en modo catálogo.
 *
 * NO es parte de la suite de CI: solo corre cuando VISUAL_SHOTS=1 (además de
 * NEXT_PUBLIC_STORE_MODE=catalog). Hace el submit REAL del formulario de
 * cotización (correr con TURNSTILE_SECRET_KEY vacía → bypass dev) y guarda
 * screenshots en /tmp/shots/catalog-*.png para revisión visual.
 *
 * Uso:
 *   set -a; source .env.local; set +a; unset NODE_ENV TURNSTILE_SECRET_KEY
 *   NEXT_PUBLIC_STORE_MODE=catalog VISUAL_SHOTS=1 \
 *     pnpm exec playwright test tests/e2e/catalog-visual-shots.spec.ts
 *
 * Crea producto/admin/cotización efímeros y los limpia en afterAll.
 */

import { test, expect } from "@playwright/test";
import { PrismaClient } from "@lucams/db";
import { createClient } from "@supabase/supabase-js";
import { mkdirSync } from "node:fs";

test.skip(
  process.env.NEXT_PUBLIC_STORE_MODE !== "catalog" || process.env.VISUAL_SHOTS !== "1",
  "Solo corre con NEXT_PUBLIC_STORE_MODE=catalog y VISUAL_SHOTS=1.",
);

const SHOTS = "/tmp/shots";
mkdirSync(SHOTS, { recursive: true });

const strip = (v: string | undefined) => v?.replace(/^["']|["']$/g, "");
const prisma = new PrismaClient();
const SB_URL = strip(process.env.NEXT_PUBLIC_SUPABASE_URL)!;
const SERVICE = strip(process.env.SUPABASE_SECRET_KEY)!;
const service = createClient(SB_URL, SERVICE, { auth: { persistSession: false } });

const RUN = `shots-${Date.now()}`;
const ADMIN_EMAIL = `${RUN}@example.com`;
const ADMIN_PASSWORD = "E2E-Shots-Test-918273650";
// Teléfono CO móvil (3 + 9 dígitos) ÚNICO por corrida: createQuoteAction limita
// a 3 cotizaciones/día por número — reusar uno fijo agotaba el cupo entre corridas.
const PHONE_DISPLAY = `3${String(Date.now()).slice(-9)}`.replace(
  /(\d{3})(\d{3})(\d{4})/,
  "$1 $2 $3",
);

let slug = "";
let productId = "";
let categoryId = "";
let variantId = "";
let quoteId = "";
let supabaseUserId = "";
let adminId = "";

test.beforeAll(async () => {
  const category = await prisma.category.create({
    data: { slug: `${RUN}-cat`, name: `Cat ${RUN}` },
  });
  categoryId = category.id;

  const product = await prisma.product.create({
    data: {
      slug: `${RUN}-simple`,
      name: `Imán Corazón ${RUN}`,
      description: "Producto efímero para capturas visuales del modo catálogo.",
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

  const { data, error } = await service.auth.admin.createUser({
    email: ADMIN_EMAIL,
    password: ADMIN_PASSWORD,
    email_confirm: true,
  });
  if (error || !data.user) throw new Error(`shots: no se pudo crear auth user: ${error?.message}`);
  supabaseUserId = data.user.id;
  const admin = await prisma.adminUser.create({
    data: { supabaseUserId, email: ADMIN_EMAIL, role: "SUPERADMIN", isActive: true },
    select: { id: true },
  });
  adminId = admin.id;
});

test.afterAll(async () => {
  if (quoteId) {
    await prisma.quoteItem.deleteMany({ where: { quoteId } }).catch(() => {});
    await prisma.quote.deleteMany({ where: { id: quoteId } }).catch(() => {});
  }
  // Buckets de rate-limit `quote:*` generados por las corridas (IP local compartida):
  // sin esta limpieza, ~5 corridas agotan el cupo diario por IP y el submit rebota.
  await prisma
    .$executeRawUnsafe(`DELETE FROM rate_limit_buckets WHERE key LIKE 'quote:%'`)
    .catch(() => {});
  await prisma.cartItem.deleteMany({ where: { variantId } }).catch(() => {});
  await prisma.productVariant.deleteMany({ where: { productId } }).catch(() => {});
  await prisma.product.delete({ where: { id: productId } }).catch(() => {});
  await prisma.category.delete({ where: { id: categoryId } }).catch(() => {});
  if (adminId) await prisma.adminUser.deleteMany({ where: { id: adminId } }).catch(() => {});
  if (supabaseUserId) await service.auth.admin.deleteUser(supabaseUserId).catch(() => {});
  await prisma.$disconnect();
});

test("flujo completo de cotización con capturas", async ({ page }) => {
  test.setTimeout(180_000);

  // 1. Home
  await page.goto("/");
  await page.screenshot({ path: `${SHOTS}/catalog-01-home.png`, fullPage: true });

  // 2. Catálogo (la página renderiza; el producto efímero no cumple la
  // curaduría del grid — se navega directo a la PDP, patrón compra.spec)
  await page.goto("/productos");
  await expect(page.locator("h1").first()).toBeVisible();
  await page.screenshot({ path: `${SHOTS}/catalog-02-catalogo.png`, fullPage: true });

  // 3. PDP
  await page.goto(`/producto/${slug}`);
  await expect(page).toHaveURL(new RegExp(`/producto/${slug}`));
  await page.screenshot({ path: `${SHOTS}/catalog-03-pdp.png`, fullPage: true });

  // 4. Agregar al carrito → carrito
  await page.getByRole("button", { name: /añadir al carrito/i }).click();
  await page.waitForURL(/[?&]added=1/, { timeout: 15_000 });
  await expect(async () => {
    await page.goto("/carrito");
    await expect(page.getByText(`Imán Corazón ${RUN}`).first()).toBeVisible();
  }).toPass({ timeout: 30_000 });
  await page.screenshot({ path: `${SHOTS}/catalog-04-carrito.png`, fullPage: true });

  // 5. Formulario de cotización
  await page.getByRole("link", { name: /cotizar por whatsapp/i }).click();
  await expect(async () => {
    await expect(page).toHaveURL(/\/checkout\/datos/);
    await expect(page.getByText(/pide tu cotización/i)).toBeVisible();
  }).toPass({ timeout: 30_000 });

  await page.locator("#customerName").fill("Valentina Prueba");
  await page.locator("#whatsapp-display").fill(PHONE_DISPLAY);
  await page.locator("#deptCode").selectOption({ index: 1 });
  await page.locator("#cityCode").selectOption({ index: 1 });
  await page.locator("#notes").fill("Es para un regalo, ¿me ayudan con el empaque?");
  // Email es required en el form (validación HTML5) — sin él el submit no dispara.
  await page.locator('input[name="customerEmail"]').fill(`${RUN}@example.com`);
  // Consentimiento Ley 1581 (checkbox required) — sin él el submit HTML5 no dispara.
  await page.locator('input[name="dataConsent"]').check();
  await page.screenshot({ path: `${SHOTS}/catalog-05-form-cotizacion.png`, fullPage: true });

  // 6. Submit real (Turnstile en bypass dev) → confirmación
  await page.getByRole("button", { name: /pedir cotización/i }).click();
  await page.waitForURL(/\/cotizacion\//, { timeout: 30_000 });
  await expect(page.getByText(/COT-/i).first()).toBeVisible();
  await page.screenshot({ path: `${SHOTS}/catalog-06-confirmacion.png`, fullPage: true });

  const token = page.url().split("/cotizacion/")[1]!.split(/[?#]/)[0]!;
  const quote = await prisma.quote.findUnique({
    where: { publicAccessToken: token },
    select: { id: true, number: true },
  });
  expect(quote, "la cotización debió persistirse en DB").toBeTruthy();
  quoteId = quote!.id;

  // 7. Admin: lista de cotizaciones
  await page.goto("/admin/login");
  await page.locator('input[name="email"]').fill(ADMIN_EMAIL);
  await page.locator('input[name="password"]').fill(ADMIN_PASSWORD);
  await page.getByRole("button", { name: /iniciar sesión/i }).click();
  await page.waitForURL(/\/admin\/dashboard/, { timeout: 20_000 });
  await page.goto("/admin/cotizaciones");
  await expect(page.getByText(quote!.number).first()).toBeVisible();
  await page.screenshot({ path: `${SHOTS}/catalog-07-admin-lista.png`, fullPage: true });

  // 8. Admin: detalle de la cotización (el link de la fila es "Ver detalle")
  await page
    .getByRole("link", { name: /ver detalle/i })
    .first()
    .click();
  await expect(page).toHaveURL(new RegExp(`/admin/cotizaciones/${quoteId}`));
  await expect(page.getByText("Valentina Prueba").first()).toBeVisible();
  await page.screenshot({ path: `${SHOTS}/catalog-08-admin-detalle.png`, fullPage: true });
});
