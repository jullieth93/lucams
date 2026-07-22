import { test, expect } from "@playwright/test";
import { mkdirSync } from "node:fs";
test.skip(process.env.VISUAL_SHOTS !== "1", "solo VISUAL_SHOTS=1");
const SHOTS = "/tmp/shots";
mkdirSync(SHOTS, { recursive: true });
test("PDPs renovadas", async ({ page }) => {
  test.setTimeout(240_000);
  const pdps: Array<[string, string]> = [
    ["separadores-libros", "pdp-separadores"],
    ["set-fotoimanes-cuadrados", "pdp-fotoimanes"],
    ["set-fotoimanes-polaroid", "pdp-polaroid"],
    ["pack-vocales", "pdp-vocales"],
  ];
  for (const [slug, name] of pdps) {
    await page.goto(`/producto/${slug}`, { waitUntil: "domcontentloaded" });
    await expect(page.locator("h1").first()).toBeVisible();
    await page.waitForTimeout(1_200);
    await page.screenshot({ path: `${SHOTS}/${name}.png` });
    await page.evaluate(() => window.scrollTo(0, 500));
    await page.waitForTimeout(400);
    await page.screenshot({ path: `${SHOTS}/${name}-b.png` });
  }
});
