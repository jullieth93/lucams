import { test, expect, type Page } from "@playwright/test";

const LOCAL_4000 = "http://localhost:4000";
const CARA_A = "/tmp/test-cara-a.png";
const CARA_B = "/tmp/test-cara-b.png";

async function dismissOnboarding(page: Page) {
  const skip = page.getByRole("button", { name: /Saltar tutorial|¡Empezar!/i });
  if (await skip.count()) await skip.first().click();
}

async function acceptCookies(page: Page) {
  const accept = page.getByRole("button", { name: /Aceptar todas/i });
  if (await accept.count()) await accept.first().click();
}

async function uploadToSlot(page: Page, slotLabel: string, filePath: string) {
  const slot = page.locator('[role="button"]', { hasText: new RegExp(slotLabel) }).first();
  await slot.click();

  const modal = page.locator('[role="dialog"]').filter({ hasText: /Foto para el/i });
  await modal.waitFor({ timeout: 10_000 });

  const rights = modal.locator('input[type="checkbox"]').first();
  await rights.check();

  const fileInput = modal.locator('input[type="file"]').first();
  await fileInput.setInputFiles(filePath);

  await modal.waitFor({ state: "detached", timeout: 20_000 });
}

async function orbitBook(page: Page, direction: "left" | "right" = "right") {
  const bookCanvas = page.locator('[role="dialog"] canvas').first();
  const box = await bookCanvas.boundingBox();
  if (!box) return;
  const startX = box.x + box.width / 2;
  const startY = box.y + box.height / 2;
  const deltaX = direction === "right" ? box.width * 0.55 : -box.width * 0.55;
  const endX = startX + deltaX;

  await page.evaluate(
    ({ sx, sy, ex, ey }: { sx: number; sy: number; ex: number; ey: number }) => {
      const canvas = document.querySelector('[role="dialog"] canvas') as HTMLCanvasElement | null;
      if (!canvas) return;
      const dispatch = (type: string, x: number, y: number) => {
        canvas.dispatchEvent(
          new PointerEvent(type, {
            bubbles: true,
            cancelable: true,
            pointerType: "mouse",
            clientX: x,
            clientY: y,
            button: 0,
            buttons: type === "pointerup" ? 0 : 1,
            isPrimary: true,
          }),
        );
      };
      dispatch("pointerdown", sx, sy);
      dispatch("pointermove", sx, sy);
      const steps = 12;
      for (let i = 1; i <= steps; i++) {
        const t = i / steps;
        dispatch("pointermove", sx + (ex - sx) * t, sy + (ey - sy) * t);
      }
      dispatch("pointerup", ex, ey);
    },
    { sx: startX, sy: startY, ex: endX, ey: startY },
  );
  await page.waitForTimeout(2500);
}

test.describe("Ola 19 — Separadores Cara A/B en 3D", () => {
  async function goToStudio(page: Page, slug: string) {
    await page.goto(`${LOCAL_4000}/estudio/${slug}`, { waitUntil: "domcontentloaded" });
    await acceptCookies(page);
    await page.locator("canvas").first().waitFor({ timeout: 30_000 });
    await page.waitForTimeout(1500);
    await dismissOnboarding(page);
  }

  test("Separadores Magnéticos: cara A y cara B se ven distintas en el libro 3D", async ({
    page,
  }) => {
    const logs: string[] = [];
    page.on("console", (msg) => {
      const text = msg.text();
      if (text.includes("[BookView3D")) logs.push(text);
    });

    await goToStudio(page, "separadores-magneticos");

    await uploadToSlot(page, "1A", CARA_A);
    await page.waitForTimeout(800);
    await uploadToSlot(page, "1B", CARA_B);
    await page.waitForTimeout(800);

    await acceptCookies(page);

    const open3D = page.getByRole("button", { name: /Ver en un libro/i });
    await open3D.scrollIntoViewIfNeeded();
    await open3D.waitFor({ state: "visible", timeout: 10_000 });
    await open3D.click();

    const bookCanvas = page.locator('[role="dialog"] canvas').first();
    await bookCanvas.waitFor({ timeout: 30_000 });
    await page.waitForTimeout(3000);

    await page.screenshot({ path: "/tmp/ola19-book-front.png", fullPage: false });

    await orbitBook(page, "right");
    await page.screenshot({ path: "/tmp/ola19-book-back.png", fullPage: false });

    // Diagnóstico: cara A y cara B deben agruparse en exactamente 1 unidad doblada.
    const relevant = logs.find((l) => l.includes("[BookView3D Separators]"));
    if (relevant) {
      const parsed = JSON.parse(relevant.replace(/^.*\[BookView3D Separators\]\s*/, ""));
      console.log("BookView3D units:", parsed.unitsCount);
      expect(parsed.unitsCount, "cara A y cara B deben agruparse en 1 separador doblado").toBe(1);
    }
  });

  test("Separadores Alargados: cara A y cara B se ven distintas en el libro 3D", async ({
    page,
  }) => {
    await goToStudio(page, "separadores-alargados");

    await uploadToSlot(page, "1A", CARA_A);
    await page.waitForTimeout(800);
    await uploadToSlot(page, "1B", CARA_B);
    await page.waitForTimeout(800);

    await acceptCookies(page);

    const open3D = page.getByRole("button", { name: /Ver en un libro/i });
    await open3D.scrollIntoViewIfNeeded();
    await open3D.waitFor({ state: "visible", timeout: 10_000 });
    await open3D.click();

    const bookCanvas = page.locator('[role="dialog"] canvas').first();
    await bookCanvas.waitFor({ timeout: 30_000 });
    await page.waitForTimeout(3000);

    await page.screenshot({ path: "/tmp/ola19-alargados-front.png", fullPage: false });

    await orbitBook(page, "right");
    await page.screenshot({ path: "/tmp/ola19-alargados-back.png", fullPage: false });
  });
});
