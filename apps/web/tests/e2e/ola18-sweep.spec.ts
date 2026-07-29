import { test } from "@playwright/test";

/*
 * Barrido visual de homogeneización (Ola 18) — PDP + Estudio de los 9 productos
 * del catálogo, en desktop y móvil. Sirve para certificar:
 *   - Estilo unificado del selector de variantes (lista/chips/stepper).
 *   - Proporción del estudio (slots y modal) respecto a la pantalla.
 * Salida: /tmp/sweep-{pdp|estudio}-{slug}-{desktop|mobile}.png
 */

const PRODUCTS = [
  "set-fotoimanes-polaroid",
  "set-fotoimanes-cuadrados",
  "tiras-magneticas-fotos",
  "calendario-mes-a-mes-fotos",
  "nombre-personalizado",
  "pack-vocales",
  "abecedario-completo",
  "separadores-libros",
  "separadores-alargados",
];

test.setTimeout(240_000);

async function dismissOverlays(page: import("@playwright/test").Page) {
  const accept = page.getByRole("button", { name: /Aceptar todas/i });
  if (await accept.count())
    await accept
      .first()
      .click()
      .catch(() => {});
  const onboarding = page.locator('div[role="dialog"][aria-labelledby="onboarding-title"]');
  if (await onboarding.count()) {
    await page
      .getByRole("button", { name: /Saltar/i })
      .first()
      .click()
      .catch(() => {});
    await onboarding.waitFor({ state: "detached", timeout: 4_000 }).catch(() => {});
  }
}

test.describe("Barrido visual catálogo completo", () => {
  for (const viewport of [
    { name: "desktop", width: 1280, height: 800 },
    { name: "mobile", width: 390, height: 844 },
  ]) {
    test.describe(viewport.name, () => {
      test.use({ viewport: { width: viewport.width, height: viewport.height } });

      for (const slug of PRODUCTS) {
        test(`${slug}`, async ({ page }) => {
          // PDP
          await page.goto(`/producto/${slug}`, { waitUntil: "domcontentloaded" });
          await dismissOverlays(page);
          await page.waitForTimeout(1200);
          await page.screenshot({ path: `/tmp/sweep-pdp-${slug}-${viewport.name}.png` });

          // Estudio (los de nombre/vocales/abecedario pueden redirigir a editor propio o PDP)
          const resp = await page.goto(`/estudio/${slug}`, { waitUntil: "domcontentloaded" });
          await dismissOverlays(page);
          await page.waitForTimeout(2500);
          const url = page.url();
          if (url.includes("/estudio/")) {
            await page.screenshot({ path: `/tmp/sweep-estudio-${slug}-${viewport.name}.png` });
          } else {
            // Redirigió (superficie direct-cart / editor propio): evidencia igual.
            await page.screenshot({
              path: `/tmp/sweep-estudio-${slug}-${viewport.name}-redirect.png`,
            });
          }
          void resp;
        });
      }
    });
  }
});
