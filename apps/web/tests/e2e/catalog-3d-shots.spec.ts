/*
 * Utilidad E2E — capturas visuales de las escenas 3D del Estudio y de las
 * PDPs renovadas (Frentes C/D/E, 2026-07-22). NO corre en CI: solo con
 * VISUAL_SHOTS=1. Guarda PNGs en /tmp/shots/.
 *
 * Uso:
 *   set -a; source .env.local; set +a; unset NODE_ENV
 *   NEXT_PUBLIC_STORE_MODE=catalog VISUAL_SHOTS=1 \
 *     pnpm exec playwright test tests/e2e/catalog-3d-shots.spec.ts
 */

import { test, expect } from "@playwright/test";
import { mkdirSync } from "node:fs";

test.skip(process.env.VISUAL_SHOTS !== "1", "Solo corre con VISUAL_SHOTS=1.");

const SHOTS = "/tmp/shots";
mkdirSync(SHOTS, { recursive: true });

test("capturas 3D (galería interna) + PDPs renovadas", async ({ page }) => {
  test.setTimeout(300_000);

  // Galería interna de escenas 3D (6 secciones: nevera, polaroid, tablero memo,
  // tablero corcho, libro, calendario). WebGL tarda: esperar los 6 canvases + settle.
  await page.goto("/internal/3d-preview", { waitUntil: "domcontentloaded" });
  await page.waitForSelector("section canvas", { timeout: 60_000 });
  await page.waitForTimeout(12_000); // texturas + sombras horneadas + autoRotate

  // Una captura por sección (el título va dentro del propio card).
  const sections = page.locator("section");
  const count = await sections.count();
  for (let i = 0; i < count; i++) {
    const card = sections.nth(i);
    const title = (await card.locator("div").first().innerText())
      .toLowerCase()
      .replace(/[^a-záéíóúñ]+/gi, "-")
      .slice(0, 40);
    await card.scrollIntoViewIfNeeded();
    await page.waitForTimeout(800);
    await card.screenshot({ path: `${SHOTS}/3d-scene-${i}-${title}.png` });
  }

  // PDPs renovadas (Frentes C/D): variantes ampliadas visibles.
  const pdps: Array<[string, string]> = [
    ["separadores-libros", "pdp-separadores"],
    ["set-fotoimanes-cuadrados", "pdp-fotoimanes"],
    ["set-fotoimanes-polaroid", "pdp-polaroid"],
    ["pack-vocales", "pdp-vocales"],
  ];
  for (const [slug, name] of pdps) {
    await page.goto(`/producto/${slug}`, { waitUntil: "domcontentloaded" });
    await expect(page.locator("h1").first()).toBeVisible();
    await page.waitForTimeout(1_000);
    await page.screenshot({ path: `${SHOTS}/${name}.png`, fullPage: true });
  }
});
