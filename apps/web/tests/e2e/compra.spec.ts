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
import { PrismaClient } from "@prisma/client";

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
  await page.goto(`/producto/${slug}`);
  const addBtn = page.getByRole("button", { name: /añadir al carrito/i });
  await expect(addBtn).toBeVisible();
  await addBtn.click();
  // Tras el server action + refresh, el header refleja "Carrito (1 ítem)" —
  // señal fiable de que la cookie de sesión y el ítem ya existen.
  await expect(page.getByRole("link", { name: /carrito \(1 ítem/i })).toBeVisible({
    timeout: 15_000,
  });
}

test.describe("compra — núcleo del carrito", () => {
  test("agregar al carrito deja el ítem visible en /carrito", async ({ page }) => {
    await addToCart(page);
    await page.goto("/carrito");

    // El carrito NO está vacío y muestra el producto agregado.
    await expect(page.getByRole("heading", { name: /tu carrito está vacío/i })).toHaveCount(0);
    await expect(page.getByText(`E2E Simple ${RUN}`).first()).toBeVisible();
    await expect(page.getByText(/ítem|ítems/i).first()).toBeVisible();
    await expect(page.locator('a[href="/checkout/datos"]').first()).toBeVisible();
  });

  test("con ítems en el carrito, el checkout de datos carga su formulario", async ({ page }) => {
    await addToCart(page); // contexto fresco por test → re-agregamos
    // Con ítems, loadCheckoutContext NO lanza CART_EMPTY → no redirige a /carrito.
    await page.goto("/checkout/datos");

    await expect(page).toHaveURL(/\/checkout\/datos/);
    await expect(page.locator('input[name="fullName"]')).toBeVisible();
    await expect(page.locator('input[name="email"]')).toBeVisible();
  });
});
