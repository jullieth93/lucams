import { test, expect } from "@playwright/test";

test.setTimeout(90_000);

test("preview 3D interno: marcapáginas plano renderiza con su textura", async ({ page }) => {
  await page.goto("/internal/3d-preview", { waitUntil: "domcontentloaded" });
  const section = page
    .locator("section")
    .filter({ hasText: "marcapáginas plano" })
    .first();
  await section.waitFor({ timeout: 20_000 });
  await page.waitForTimeout(8000);
  // La escena montó su canvas WebGL.
  await expect(section.locator("canvas").first()).toBeVisible();
  await section.screenshot({ path: "/tmp/ola17f-internal-flat-frente.png" });
});
