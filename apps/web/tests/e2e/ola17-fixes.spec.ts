import { test, expect } from "@playwright/test";

const MASCOT = "/home/ansible/workspaces/lucams_shop/apps/web/public/brand/lucams-mascot.png";
const LOGO = "/home/ansible/workspaces/lucams_shop/apps/web/public/brand/lucams-logo.png";

test.describe("Ola 17 fixes — Alargados: modal sin scroll + 3D con cara B", () => {
  test.setTimeout(120_000);

  test("flujo completo", async ({ page }) => {
    await page.goto("/estudio/separadores-alargados", { waitUntil: "domcontentloaded" });

    // Cookies + onboarding
    const accept = page.getByRole("button", { name: /Aceptar todas/i });
    if (await accept.count()) await accept.first().click();
    const onboarding = page.locator('div[role="dialog"][aria-labelledby="onboarding-title"]');
    if (await onboarding.count()) {
      await page.getByRole("button", { name: /Saltar/i }).first().click();
      await onboarding.waitFor({ state: "detached", timeout: 5_000 }).catch(() => {});
    }

    // Consentimiento Ley 1581 (sin él el upload se rechaza)
    const consent = page.getByRole("checkbox", { name: /Tengo derecho a usar esta foto/i });
    await consent.check();

    // Subir 2 fotos distintas (frente y reverso)
    const input = page.locator('input[type="file"]').first();
    await input.setInputFiles([MASCOT, LOGO]);
    await page.waitForTimeout(10_000); // las subidas a Supabase toman unos segundos

    // El onboarding puede (re)aparecer tras hidratar/subir: cerrarlo de nuevo si está.
    if (await onboarding.count()) {
      await page.getByRole("button", { name: /Saltar/i }).first().click().catch(() => {});
      await onboarding.waitFor({ state: "detached", timeout: 5_000 }).catch(() => {});
    }

    // Repartir las fotos en los slots (frente + reverso)
    const wand = page.getByRole("button", { name: /Llenar slots con mis fotos/i });
    if (await wand.count()) await wand.first().click();
    await page.waitForTimeout(4000);
    await page.screenshot({ path: "/tmp/ola17f-studio-2fotos.png", fullPage: false });

    // Abrir el modal de edición del primer slot (botón "Ajustar foto…", force por overlays Konva)
    const ajustar = page.getByRole("button", { name: /Ajustar foto/i }).first();
    if (await ajustar.count()) {
      await ajustar.click({ force: true });
      await page.waitForTimeout(2500);
      await page.screenshot({ path: "/tmp/ola17f-modal-editar.png", fullPage: false });
      // Verificación dura: el canvas del modal NO excede el tope de alto (sin scroll).
      const modalCanvas = page.locator('div[role="dialog"] canvas').last();
      if (await modalCanvas.count()) {
        const box = await modalCanvas.boundingBox();
        if (box) expect(box.height).toBeLessThanOrEqual(580);
      }
      await page.keyboard.press("Escape");
      await page.waitForTimeout(800);
    }

    // Abrir el 3D
    const ver3d = page.getByRole("button", { name: /Ver en un libro/i }).first();
    await ver3d.click({ force: true });
    await page.waitForTimeout(7000);
    await page.screenshot({ path: "/tmp/ola17f-3d-frente.png", fullPage: false });

    // Orbitar hacia abajo para ver el respaldo (drag vertical sobre el canvas 3D)
    const box = await page.locator("canvas").last().boundingBox();
    if (box) {
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
      await page.mouse.down();
      await page.mouse.move(box.x + box.width / 2, box.y + box.height * 0.95, { steps: 25 });
      await page.mouse.up();
      await page.waitForTimeout(1800);
      await page.screenshot({ path: "/tmp/ola17f-3d-respaldo.png", fullPage: false });
    }
  });
});
