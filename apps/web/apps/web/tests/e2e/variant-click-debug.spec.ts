/*
 * Test real con browser headless: simular click en chip y verificar
 * si el chip cambia visualmente.
 */
import { test, expect } from "@playwright/test";

test("click en chip de Cantidad debe cambiar aria-checked", async ({ page }) => {
  // Captura errores de consola para detectar hydration issues
  const consoleErrors: string[] = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") consoleErrors.push(msg.text());
  });
  page.on("pageerror", (err) => consoleErrors.push(`PAGE ERROR: ${err.message}`));

  await page.goto("http://localhost:4000/producto/set-fotoimanes-polaroid");

  // Esperar a que el componente client-side termine de hidratar
  await page.waitForLoadState("networkidle");
  await page.waitForTimeout(500);

  // Estado inicial: "6 unidades" debería estar seleccionado (primer variant)
  const chip6 = page.locator('button[role="radio"]', { hasText: "6 unidades" });
  const chip9 = page.locator('button[role="radio"]', { hasText: "9 unidades" });
  const chip12 = page.locator('button[role="radio"]', { hasText: "12 unidades" });

  console.log("=== Estado inicial ===");
  console.log("  chip 6:", await chip6.getAttribute("aria-checked"));
  console.log("  chip 9:", await chip9.getAttribute("aria-checked"));
  console.log("  chip 12:", await chip12.getAttribute("aria-checked"));

  // Cursor sobre el chip 9
  const cursor = await chip9.evaluate((el) => getComputedStyle(el).cursor);
  console.log("  cursor sobre chip 9:", cursor);

  // CLICK en "9 unidades"
  console.log("\n=== Click en '9 unidades' ===");
  await chip9.click();
  await page.waitForTimeout(200); // dar tiempo a React rendering

  console.log("  chip 6:", await chip6.getAttribute("aria-checked"));
  console.log("  chip 9:", await chip9.getAttribute("aria-checked"));
  console.log("  chip 12:", await chip12.getAttribute("aria-checked"));

  // Verificar precio (esperar tiempo suficiente para que aparezca)
  await page.waitForTimeout(500);
  const priceCard = page.locator("text=Precio").locator("..");
  const priceText = await priceCard.textContent();
  console.log("  precio card:", priceText);

  console.log("\n=== Errores de consola ===");
  if (consoleErrors.length === 0) console.log("  (ninguno)");
  else for (const e of consoleErrors) console.log(`  ${e}`);

  // Assertion: chip 9 debe estar seleccionado tras click
  expect(await chip9.getAttribute("aria-checked")).toBe("true");
});
