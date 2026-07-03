/*
 * E2E — accesibilidad, capa sin dependencia (Bloque E, Lucy 2026-07-03).
 *
 * Invariantes de a11y verificables con Playwright nativo, sin @axe-core (dep por
 * aprobar). Guarda lo que YA está bien (lang, landmark main, alt en imágenes,
 * jerarquía de headings) contra regresiones, y prueba el skip-link (WCAG 2.4.1)
 * que se agregó en esta sesión. La capa AUTOMATIZADA de reglas WCAG (axe) queda
 * pendiente de aprobar la dependencia — ver nota en STATE.md.
 *
 * Requiere el dev server + DATABASE_URL (para resolver un slug de producto real).
 */

import { test, expect } from "@playwright/test";
import { PrismaClient } from "@lucams/db";

const prisma = new PrismaClient();
let pdpSlug = "";

test.beforeAll(async () => {
  const p = await prisma.product.findFirst({
    where: { isActive: true },
    select: { slug: true },
    orderBy: { createdAt: "asc" },
  });
  pdpSlug = p?.slug ?? "";
});

test.afterAll(async () => {
  await prisma.$disconnect();
});

// Páginas públicas que cargan sin setup (sin carrito/auth previos).
const PAGES = ["/", "/productos", "/carrito", "/ayuda", "/contacto"];

test.describe("a11y — invariantes en páginas clave", () => {
  for (const path of PAGES) {
    test(`${path}: lang es-CO, un <main id=contenido>, imágenes con alt, ≥1 h1`, async ({
      page,
    }) => {
      await page.goto(path);
      await expect(page.locator("html")).toHaveAttribute("lang", "es-CO");
      // Exactamente un landmark main, y con el id que ancla el skip-link.
      await expect(page.locator("main#contenido")).toHaveCount(1);
      // Ninguna imagen sin atributo alt (decorativa = alt=""; el lector la salta).
      expect(
        await page.locator("img:not([alt])").count(),
        `imágenes sin atributo alt en ${path}`,
      ).toBe(0);
      // Al menos un h1 (sin encabezado principal, el lector no tiene ancla).
      expect(await page.locator("h1").count(), `sin h1 en ${path}`).toBeGreaterThanOrEqual(1);
    });
  }

  test("PDP real: main#contenido único, imágenes con alt, ≥1 h1", async ({ page }) => {
    test.skip(!pdpSlug, "no hay producto activo en la DB");
    await page.goto(`/producto/${pdpSlug}`);
    await expect(page.locator("main#contenido")).toHaveCount(1);
    expect(await page.locator("img:not([alt])").count()).toBe(0);
    expect(await page.locator("h1").count()).toBeGreaterThanOrEqual(1);
  });

  // Nombres accesibles en formularios (WCAG 4.1.2 / 3.3.2): un input sin label
  // asociado es invisible para un lector de pantalla. Comprobamos los formularios
  // de auth (cargan sin setup de carrito/sesión).
  for (const path of ["/login", "/registro"]) {
    test(`${path}: todos los campos del formulario tienen nombre accesible`, async ({ page }) => {
      // Rutas no golpeadas por otros specs → `next dev` las compila on-demand al
      // primer hit (>60s local); slow() lo absorbe. Instantáneo en CI (build prod).
      test.slow();
      await page.goto(path);
      const sinNombre = await page
        .locator(
          "input:not([type=hidden]):not([type=submit]):not([type=button]), textarea, select",
        )
        .evaluateAll((els) =>
          els
            .filter((el) => {
              const id = (el as HTMLElement).id;
              const byFor = !!id && !!document.querySelector(`label[for="${CSS.escape(id)}"]`);
              const wrapped = !!el.closest("label");
              const ariaLabel = ((el.getAttribute("aria-label") ?? "").trim().length > 0);
              const lb = el.getAttribute("aria-labelledby");
              const byLabelledby = lb ? lb.split(/\s+/).some((i) => !!document.getElementById(i)) : false;
              const title = ((el.getAttribute("title") ?? "").trim().length > 0);
              return !(byFor || wrapped || ariaLabel || byLabelledby || title);
            })
            .map((el) => el.getAttribute("name") || (el as HTMLElement).id || el.tagName),
        );
      expect(sinNombre, `campos sin nombre accesible en ${path}`).toEqual([]);
    });
  }

  test("skip-link (WCAG 2.4.1): primer foco por teclado y salta al contenido", async ({
    page,
  }) => {
    await page.goto("/");
    const skip = page.getByRole("link", { name: /saltar al contenido/i });
    await expect(skip).toHaveAttribute("href", "#contenido");
    // Primer Tab desde el body enfoca el skip-link (es el primer elemento enfocable).
    await page.keyboard.press("Tab");
    await expect(skip).toBeFocused();
    // Al recibir foco deja de estar oculto (focus:not-sr-only).
    await expect(skip).toBeVisible();
    // Activarlo mueve el foco al landmark principal (tabIndex=-1) y ancla la URL.
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/#contenido$/);
    await expect(page.locator("main#contenido")).toBeFocused();
  });
});
