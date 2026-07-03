/*
 * E2E — Estudio de Personalización, el diferenciador #1 (Bloque E, Lucy 2026-07-03).
 *
 * El "plus" real frente a magneticas.cl: el editor en vivo (react-konva). Konva
 * necesita `window`, así que el editor entra por dynamic import — este smoke
 * verifica que, para un producto REAL personalizable, el editor carga (pasa el
 * "Cargando estudio…") y MONTA el lienzo Konva (<canvas>) junto con su chrome
 * (barra de herramientas). No conduce el canvas (drag/drop de shapes Konva es
 * demasiado frágil en Playwright y no aporta señal fiable); el finalize/add-to-cart
 * del diseño vive en el flujo de compra personalizada aparte.
 *
 * Usa un producto seeded (el catálogo real es 100% personalizable) — solo
 * navegación, sin mutación → sin cleanup. Requiere DATABASE_URL.
 */

import { test, expect } from "@playwright/test";
import { PrismaClient } from "@lucams/db";

const prisma = new PrismaClient();
let slug = "";
let variantId = "";

test.beforeAll(async () => {
  // Primer producto activo con personalización (kind != NONE) que la tienda muestra.
  const product = await prisma.product.findFirst({
    where: { personalizationKind: { not: "NONE" }, isActive: true },
    select: {
      slug: true,
      variants: { where: { isActive: true }, select: { id: true }, take: 1 },
    },
    orderBy: { createdAt: "asc" },
  });
  if (product) {
    slug = product.slug;
    variantId = product.variants[0]?.id ?? "";
  }
});

test.afterAll(async () => {
  await prisma.$disconnect();
});

test.describe("estudio de personalización — el diferenciador", () => {
  test("el editor carga y monta el lienzo (canvas) para un producto personalizable", async ({
    page,
  }) => {
    test.skip(!slug, "no hay producto personalizable activo en la DB");
    // El Estudio arrastra Konva (dep pesada); en `next dev` la ruta se compila
    // on-demand al primer hit y puede tardar >60s. En CI (build prod) es instantáneo.
    // slow() triplica el timeout para absorber ese cold-compile local.
    test.slow();
    // domcontentloaded (no "load"): el editor monta el canvas vía JS cliente tras
    // el DOM; no esperamos a que TODAS las imágenes/realtime disparen "load".
    await page.goto(`/estudio/${slug}${variantId ? `?variant=${variantId}` : ""}`, {
      waitUntil: "domcontentloaded",
    });

    // El editor es dynamic import (Konva requiere window): primero se ve
    // "Cargando estudio…"/"Preparando tu lienzo…", luego cada slot monta su
    // Konva Stage → <canvas>. Su presencia prueba que el editor es funcional.
    await expect(page.locator("canvas").first()).toBeVisible({ timeout: 30_000 });

    // Chrome del editor: la barra de herramientas (sidebar) visible en desktop.
    await expect(page.locator('aside[aria-label="Herramientas del Estudio"]')).toBeVisible();

    // Y dentro, la acción de subir foto — el corazón del flujo de personalización.
    await expect(page.getByLabel("Subir foto desde el dispositivo")).toBeAttached();
  });

  test("un producto NO personalizable no expone el Estudio (404)", async ({ page }) => {
    // El Estudio hace notFound() si personalizationKind === NONE. Un slug
    // inexistente también → 404. Verificamos que la ruta no es un agujero abierto.
    const res = await page.goto("/estudio/__no-existe-jamas__");
    expect(res?.status()).toBe(404);
  });
});
