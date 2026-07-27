/*
 * E2E — núcleo de la ruta de ingresos (Bloque E, Lucy 2026-06-29).
 *
 * Cubre la parte DETERMINISTA del flujo de compra, sin dependencias externas
 * (Aveonline/Wompi) ni auth: PDP → agregar al carrito → carrito → llegar al
 * checkout de datos. La cotización de envío (Aveonline en vivo) y el pago Wompi
 * (redirect externo) van en specs aparte por su fragilidad de red.
 *
 * El catálogo real es 100% personalizable (va al Estudio, no muestra "Añadir al
 * carrito"), así que el test CREA su propio producto efímero NO personalizable
 * (igual que los tests de integración) y lo LIMPIA en afterAll. Requiere
 * DATABASE_URL (correr con `dotenv -e .env.local -- playwright test`).
 */

import { test, expect, type Page } from "@playwright/test";
import "../setup-env";
// PrismaClient vía @lucams/db (re-exporta @prisma/client) — resoluble por tsc
// desde apps/web y sin el import `server-only` de @/lib/db (rompería en Node).
import { PrismaClient } from "@lucams/db";

const prisma = new PrismaClient();
const RUN = `e2e-${Date.now()}`;

let slug = "";
let productId = "";
let categoryId = "";
let variantId = "";

test.beforeAll(async () => {
  const category = await prisma.category.create({
    data: { slug: `${RUN}-cat`, name: `Cat ${RUN}` },
  });
  categoryId = category.id;

  // isPersonalizable NO se setea → default false → la PDP muestra "Añadir al
  // carrito" (no el CTA del Estudio). Una sola variante -DEFAULT con stock.
  const product = await prisma.product.create({
    data: {
      slug: `${RUN}-simple`,
      name: `E2E Simple ${RUN}`,
      description: "Producto efímero para el E2E de compra.",
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
});

test.afterAll(async () => {
  // Limpieza: primero los CartItem que referencian la variante (FK), luego
  // variante → producto → categoría. .catch para no romper el teardown.
  await prisma.cartItem.deleteMany({ where: { variantId } }).catch(() => {});
  await prisma.productVariant.deleteMany({ where: { productId } }).catch(() => {});
  await prisma.product.delete({ where: { id: productId } }).catch(() => {});
  await prisma.category.delete({ where: { id: categoryId } }).catch(() => {});
  await prisma.$disconnect();
});

async function addToCart(page: Page) {
  await page.goto(`/producto/${slug}`, { waitUntil: "domcontentloaded" });
  const addBtn = page.getByRole("button", { name: /añadir al carrito/i });
  await expect(addBtn).toBeVisible({ timeout: 15_000 });
  // Next.js dev puede hidratar tarde el botón; aseguramos que esté habilitado
  // antes de clickear para evitar clicks fantasmas.
  await expect(addBtn).toBeEnabled({ timeout: 15_000 });
  await addBtn.click();
  // El server action inserta el ítem y redirige a `${returnTo}?added=1` — esperar
  // ESE redirect es la señal fiable de que el ítem quedó en DB. NO gateamos en el
  // conteo del header ("Carrito (N ítems)"): ese es un read de una sola vez por el
  // pooler de Supabase y, bajo carga, puede verse stale (0 ítems) sin reintentarse,
  // colgando el wait en vano. La verificación real la hace el toPass del caller
  // sobre /carrito o /checkout, que sí tolera el read-after-write del pooler.
  await page.waitForURL(/[?&]added=1/, { timeout: 30_000 });
}

test.describe("compra — núcleo del carrito", () => {
  test("agregar al carrito deja el ítem visible en /carrito", async ({ page }) => {
    await addToCart(page);
    // toPass reintenta goto+assert: bajo carga concurrente, el read-after-write
    // del pooler de Supabase puede tardar en reflejar el ítem en /carrito.
    await expect(async () => {
      await page.goto("/carrito");
      await expect(page.getByRole("heading", { name: /tu carrito está vacío/i })).toHaveCount(0);
      await expect(page.getByText(`E2E Simple ${RUN}`).first()).toBeVisible();
    }).toPass({ timeout: 60_000 });
    await expect(page.locator('a[href="/checkout/datos"]').first()).toBeVisible();
  });

  test("con ítems en el carrito, el checkout de datos carga su formulario", async ({ page }) => {
    await addToCart(page); // contexto fresco por test → re-agregamos
    // toPass: con el read-after-write del pooler, el checkout puede ver el
    // carrito vacío por un instante y rebotar a /carrito; reintentamos.
    await expect(async () => {
      await page.goto("/checkout/datos");
      await expect(page).toHaveURL(/\/checkout\/datos/);
      await expect(page.locator('input[name="fullName"]')).toBeVisible();
    }).toPass({ timeout: 60_000 });
    await expect(page.locator('input[name="email"]')).toBeVisible();
  });
});
