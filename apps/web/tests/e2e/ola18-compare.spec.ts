import { test } from "@playwright/test";

test.setTimeout(60_000);

test("comparativa Magnéticos vs Alargados (homogeneización)", async ({ page }) => {
  for (const slug of ["separadores-libros", "separadores-alargados"]) {
    await page.goto(`/producto/${slug}`, { waitUntil: "domcontentloaded" });
    const accept = page.getByRole("button", { name: /Aceptar todas/i });
    if (await accept.count())
      await accept
        .first()
        .click()
        .catch(() => {});
    await page.waitForTimeout(1500);
    // Captura enfocada en la zona del selector de variantes (buy-box).
    await page.screenshot({ path: `/tmp/ola18-compare-${slug}.png`, fullPage: false });
  }
});
