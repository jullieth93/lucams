/* Utilidad E2E — capturas del Estudio (ola 3). Solo con VISUAL_SHOTS=1. */
import { test } from "@playwright/test";
import { mkdirSync } from "node:fs";

test.skip(process.env.VISUAL_SHOTS !== "1", "Solo corre con VISUAL_SHOTS=1.");
const SHOTS = "/tmp/shots";
mkdirSync(SHOTS, { recursive: true });

test("capturas del Estudio (ola 3)", async ({ page }) => {
  test.setTimeout(420_000);
  await page.addInitScript(() => {
    try { window.localStorage.setItem("lucams_studio_onboarded", "v1"); } catch {}
  });
  const studios: Array<[string, string]> = [
    ["separadores-libros", "studio-separadores-2caras"],
    ["set-fotoimanes-polaroid", "studio-polaroid"],
    ["set-fotoimanes-cuadrados", "studio-cuadrados"],
    ["tiras-magneticas-fotos", "studio-tiras"],
    ["nombre-personalizado", "studio-nombre-temas"],
    ["calendario-mes-a-mes-fotos", "studio-calendario"],
  ];
  for (const [slug, name] of studios) {
    try {
      await page.goto(`/estudio/${slug}`, { waitUntil: "domcontentloaded" });
      // Lienzo listo = hay canvas Konva montado (el loader no cuenta: puede no
      // existir aún al evaluar y resolver el "hidden" en falso positivo).
      await page.waitForSelector("canvas", { timeout: 90_000 });
      // Tour de bienvenida OFF vía localStorage (studio-onboarding lee
      // 'lucams_studio_onboarded' === "v1" al montar).
      await page.evaluate(() => {
        try { window.localStorage.setItem("lucams_studio_onboarded", "v1"); } catch {}
      });
      await page.waitForTimeout(2_500); // settle de texturas/grilla
      await page.screenshot({ path: `${SHOTS}/${name}.png`, fullPage: false });
    } catch {
      // siguiente producto
    }
  }
});
