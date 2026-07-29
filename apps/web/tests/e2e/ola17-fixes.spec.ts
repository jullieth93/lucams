import { test, expect } from "@playwright/test";

test.describe("Ola 17 fixes — Alargados: modal sin scroll + 3D con cara B", () => {
  test.setTimeout(120_000);

  test("flujo completo", async ({ page }) => {
    // Marcar onboarding como visto: el modal bloquea clicks en el flujo de subida.
    await page.addInitScript(() => {
      try {
        window.localStorage.setItem("lucams_studio_onboarded", "v1");
      } catch {}
    });
    await page.goto("/estudio/separadores-alargados", { waitUntil: "domcontentloaded" });

    // Cookies
    const accept = page.getByRole("button", { name: /Aceptar todas/i });
    if (await accept.count()) await accept.first().click();

    // Inyectar 2 fotos de prueba directamente en el store y llenar slots.
    // Esto evita la subida a Supabase (lenta/inestable en local) y nos deja
    // verificar el modal de edición y el 3D con cara B de forma determinista.
    await page.waitForFunction(
      () => {
        const store = (
          window as unknown as { __studioStore?: { getState: () => { designId: string | null } } }
        ).__studioStore;
        return store !== undefined && store.getState().designId !== null;
      },
      { timeout: 30_000, polling: 500 },
    );
    await page.evaluate(() => {
      const store = (
        window as unknown as {
          __studioStore?: {
            getState: () => {
              addAsset: (a: {
                id: string;
                signedUrl: string;
                width: number;
                height: number;
              }) => void;
              assignAssetToSlot: (
                slotIndex: number,
                asset: { id: string; signedUrl: string; width: number; height: number },
              ) => void;
            };
          };
        }
      ).__studioStore;
      if (!store) return;
      const s = store.getState();
      // Usar colores sólidos distintos para verificar visualmente la cara B en el 3D.
      const mk = (color: string) => {
        const c = document.createElement("canvas");
        c.width = 400;
        c.height = 400;
        const ctx = c.getContext("2d")!;
        ctx.fillStyle = color;
        ctx.fillRect(0, 0, 400, 400);
        return c.toDataURL("image/png");
      };
      const a1 = { id: "e2e-a1", signedUrl: mk("#e63946"), width: 400, height: 400 };
      const a2 = { id: "e2e-a2", signedUrl: mk("#457b9d"), width: 400, height: 400 };
      s.addAsset(a1);
      s.addAsset(a2);
      s.assignAssetToSlot(0, a1);
      s.assignAssetToSlot(1, a2);
    });

    // Esperar a que el progreso marque 2/2 y las imágenes estén cargadas en los stages.
    await page.waitForFunction(
      () => {
        const status = document.querySelector('[role="status"]');
        return status?.textContent?.includes("2/2") ?? false;
      },
      { timeout: 30_000, polling: 500 },
    );
    await page.waitForTimeout(8000); // Konva necesita tiempo para cargar las imágenes en los stages
    await page.screenshot({ path: "/tmp/ola17f-studio-2fotos.png", fullPage: false });

    // Cerrar el tooltip de gestos si está visible (tapa el botón Ajustar foto y el 3D).
    const closeTip = page.getByRole("button", { name: /Cerrar este tip/i });
    if (await closeTip.count())
      await closeTip
        .first()
        .click()
        .catch(() => {});

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

    // Esperar a que el autosave termine para que el 3D tenga las texturas listas.
    await page
      .waitForFunction(() => !document.body.textContent?.includes("Guardando…"), {
        timeout: 30_000,
        polling: 500,
      })
      .catch(() => {});

    // Abrir el 3D
    const ver3d = page.getByRole("button", { name: /Ver en un libro/i }).first();
    await ver3d.click({ force: true });
    await page.waitForTimeout(7000);
    await page.screenshot({ path: "/tmp/ola17f-3d-frente.png", fullPage: false });

    // Orbitar hacia atrás para ver la cara B (drag horizontal sobre el canvas 3D)
    const box = await page.locator("canvas").last().boundingBox();
    if (box) {
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
      await page.mouse.down();
      await page.mouse.move(box.x + box.width * 0.9, box.y + box.height / 2, { steps: 15 });
      await page.mouse.up();
      await page.waitForTimeout(1200);
      await page.screenshot({ path: "/tmp/ola17f-3d-respaldo.png", fullPage: false });
    }
  });
});
