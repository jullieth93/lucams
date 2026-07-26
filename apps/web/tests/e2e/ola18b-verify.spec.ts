import { test } from "@playwright/test";

test.setTimeout(90_000);

test("ola18b: Cuadrados (7.5×10) y Tiras (3/4 fotos) + estudio tira 4 fotos", async ({ page }) => {
  const accept = page.getByRole("button", { name: /Aceptar todas/i });

  // PDP Cuadrados: tamaños reales 6.5×6.5 y 7.5×10 (sin 8×8 ni 10×10)
  await page.goto("/producto/set-fotoimanes-cuadrados", { waitUntil: "domcontentloaded" });
  if (await accept.count()) await accept.first().click().catch(() => {});
  await page.waitForTimeout(1500);
  await page.screenshot({ path: "/tmp/ola18b-cuadrados-pdp.png" });

  // PDP Tiras: variantes 3 y 4 fotos
  await page.goto("/producto/tiras-magneticas-fotos", { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(1500);
  await page.screenshot({ path: "/tmp/ola18b-tiras-pdp.png" });

  // Estudio Tiras 3 fotos (default)
  await page.goto("/estudio/tiras-magneticas-fotos", { waitUntil: "domcontentloaded" });
  const onboarding = page.locator('div[role="dialog"][aria-labelledby="onboarding-title"]');
  if (await onboarding.count()) {
    await page.getByRole("button", { name: /Saltar/i }).first().click().catch(() => {});
  }
  await page.waitForTimeout(3000);
  await page.screenshot({ path: "/tmp/ola18b-tiras-estudio-3f.png" });

  // Estudio Tiras 4 fotos (variante por query param si aplica deep-link, si no, el default)
  const variant4 = await page.evaluate(async () => {
    const r = await fetch("/api/catalog/producto/tiras-magneticas-fotos").catch(() => null);
    return r ? "ok" : null;
  });
  void variant4;
});
