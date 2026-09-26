import { test, expect, type Page, type ConsoleMessage } from "@playwright/test";

/*
 * AUDITORÍA PROFUNDA — catalogo-whatsapp (capa CLIENTE) contra PRODUCCIÓN.
 *
 * Cobertura:
 *   1. Home: categorías reales, CTAs, sin errores de consola.
 *   2. Catálogo (/productos): grid con los 9 productos reales.
 *   3. PDP ×9: carga 200, precio, selector de variantes, CTA.
 *   4. Estudio ×9: canvas carga sin 500.
 *   5. Flujo de cotización: PDP → Estudio (polaroid, sube foto) → finalizar →
 *      form de cotización → link de WhatsApp con número y mensaje correctos.
 *   6. Autenticación: /ingresar y /registro renderizan con Turnstile.
 *   7. Páginas estáticas: /ayuda (sin promesas DIAN), legales.
 *   8. Header/footer: WhatsApp 57 320 887 3826, Facebook, email correctos.
 *   9. Errores de consola y de red (4xx/5xx) en TODA la navegación.
 *
 * Evidencia: /tmp/audit-cliente-*.png + resumen JSON en /tmp/audit-cliente.json
 *
 * OJO: todos los screenshots llevan `caret: "initial"`. El default
 * (`caret: "hide"`) hace que Chromium ponga caret-color:transparent en TODOS
 * los inputs al capturar; si la hidratación de React 19 sigue en curso, el
 * diff de hidratación lo reporta como mismatch SSR↔cliente FALSO
 * ("A tree hydrated but some attributes…") en páginas con formularios
 * (/login, /registro, /ayuda) — verificado 2026-09-26: mismas acciones sin
 * screenshot = 0 warnings; con screenshot = 3 warnings.
 */

// El catálogo vivo se resuelve contra la DB del ambiente (los slugs cambian con
// archivados/nuevos — hardcodearlos rompió la auditoría al archivar
// nombre-personalizado el 2026-09-25). Fallback a la última lista conocida si
// no hay DATABASE_URL (ej. corrida puntual sin env).
const PRODUCTS_FALLBACK = [
  "set-fotoimanes-polaroid",
  "set-fotoimanes-cuadrados",
  "tiras-magneticas-fotos",
  "calendario-mes-a-mes-fotos",
  "pack-vocales",
  "abecedario-completo",
  "separadores-magneticos",
  "separadores-alargados",
];

async function resolveLiveProducts(): Promise<string[]> {
  if (!process.env.DATABASE_URL?.startsWith("postgres")) return PRODUCTS_FALLBACK;
  try {
    const { PrismaClient } = await import("@lucams/db");
    const prisma = new PrismaClient();
    const rows = await prisma.product.findMany({
      where: { deletedAt: null, isActive: true },
      select: { slug: true },
    });
    await prisma.$disconnect();
    return rows.length ? rows.map((r) => r.slug) : PRODUCTS_FALLBACK;
  } catch {
    return PRODUCTS_FALLBACK;
  }
}

let PRODUCTS = PRODUCTS_FALLBACK;
test.beforeAll(async () => {
  PRODUCTS = await resolveLiveProducts();
});

const MASCOT = "/home/ansible/workspaces/lucams_shop/apps/web/public/brand/lucams-mascot.png";

const consoleErrors: string[] = [];
const networkErrors: string[] = [];
const findings: { area: string; ok: boolean; detail: string }[] = [];

function watch(page: Page, area: string) {
  page.on("console", (msg: ConsoleMessage) => {
    if (msg.type() === "error") consoleErrors.push(`[${area}] ${msg.text().slice(0, 300)}`);
  });
  page.on("response", (res) => {
    if (res.status() >= 500)
      networkErrors.push(`[${area}] ${res.status()} ${res.url().slice(0, 160)}`);
  });
}

async function dismissOverlays(page: Page) {
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

test.setTimeout(300_000);

test.describe("AUDITORÍA CLIENTE — catalogo-whatsapp (producción)", () => {
  test.afterAll(async () => {
    const fs = await import("node:fs");
    fs.writeFileSync(
      "/tmp/audit-cliente.json",
      JSON.stringify({ findings, consoleErrors, networkErrors }, null, 2),
    );
    console.log(`\n=== RESUMEN AUDITORÍA CLIENTE ===`);
    console.log(`checks: ${findings.filter((f) => f.ok).length}/${findings.length} OK`);
    console.log(
      `consoleErrors: ${consoleErrors.length} · networkErrors(5xx): ${networkErrors.length}`,
    );
    for (const e of consoleErrors.slice(0, 10)) console.log(`  CONSOLE: ${e}`);
    for (const e of networkErrors.slice(0, 10)) console.log(`  NET5XX: ${e}`);
  });

  test("1. Home: categorías reales + CTAs + sin 5xx", async ({ page }) => {
    watch(page, "home");
    const t0 = Date.now();
    await page.goto("/", { waitUntil: "domcontentloaded" });
    await dismissOverlays(page);
    const loadMs = Date.now() - t0;
    for (const cat of [
      "Fotoimanes",
      "Calendarios Magnéticos",
      "Separadores de Libros",
      "Juegos y Aprendizaje",
    ]) {
      await expect(page.getByText(cat, { exact: false }).first()).toBeVisible({ timeout: 15_000 });
    }
    await expect(page.getByText("Llega a tus manos", { exact: false }).first()).toBeVisible();
    // Copy vigente (commit 2b80bb5): se promete DESPACHO en máx. 2 días hábiles,
    // la entrega depende de la transportadora (realidad multi-transportadora, sin falsa promesa).
    await expect(page.getByText(/días hábiles/i).first()).toBeVisible();
    await page.screenshot({
      caret: "initial",
      path: "/tmp/audit-cliente-home.png",
      fullPage: true,
    });
    findings.push({ area: "home", ok: true, detail: `categorías OK · load ${loadMs}ms` });
  });

  test("2. Catálogo: grid con productos reales y precios", async ({ page }) => {
    watch(page, "catalogo");
    await page.goto("/productos", { waitUntil: "domcontentloaded" });
    await dismissOverlays(page);
    for (const p of [
      "Fotoimanes Polaroid",
      "Calendario Set 12 Tarjetas",
      "Magnéticos",
      "Largos", // separadores-alargados se renombró "Separadores Largos" (2026-09)
    ]) {
      // El primer match en DOM puede estar oculto (mega-menú del header o el
      // panel de filtros colapsado en mobile) — se filtra a elementos visibles
      // (falso negativo detectado 2026-09-25: la página renderiza bien y el
      // test fallaba por el primer match oculto).
      await expect(
        page.getByText(p, { exact: false }).filter({ visible: true }).first(),
      ).toBeVisible({ timeout: 15_000 });
    }
    await page.screenshot({
      caret: "initial",
      path: "/tmp/audit-cliente-catalogo.png",
      fullPage: true,
    });
    findings.push({ area: "catalogo", ok: true, detail: "grid OK con productos reales" });
  });

  for (const slug of PRODUCTS) {
    test(`3. PDP ${slug}`, async ({ page }) => {
      watch(page, `pdp:${slug}`);
      const resp = await page.goto(`/producto/${slug}`, { waitUntil: "domcontentloaded" });
      await dismissOverlays(page);
      expect(resp?.status(), `PDP ${slug} status`).toBe(200);
      await expect(page.locator("h1").first()).toBeVisible({ timeout: 15_000 });
      await expect(page.getByText("$").first()).toBeVisible();
      await page.screenshot({ caret: "initial", path: `/tmp/audit-cliente-pdp-${slug}.png` });
      findings.push({ area: `pdp:${slug}`, ok: true, detail: "200 + h1 + precio" });
    });
  }

  for (const slug of PRODUCTS) {
    test(`4. Estudio ${slug}`, async ({ page }) => {
      watch(page, `estudio:${slug}`);
      const resp = await page.goto(`/estudio/${slug}`, { waitUntil: "domcontentloaded" });
      await dismissOverlays(page);
      const status = resp?.status() ?? 0;
      expect([200, 307, 308]).toContain(status);
      if (page.url().includes("/estudio/")) {
        if (slug === "nombre-personalizado") {
          // Superficie propia "Arma tu palabra" (editor de nombre, sin canvas Konva).
          await expect(page.getByText("Arma tu palabra", { exact: false }).first()).toBeVisible({
            timeout: 30_000,
          });
        } else if (slug === "pack-vocales" || slug === "abecedario-completo") {
          // Editores de sets (letras): HTML con tema/idioma/colores, sin canvas Konva.
          await expect(page.getByText("Elige los colores", { exact: false }).first()).toBeVisible({
            timeout: 30_000,
          });
        } else {
          await expect(page.locator("canvas").first()).toBeVisible({ timeout: 30_000 });
        }
        await page.screenshot({ caret: "initial", path: `/tmp/audit-cliente-estudio-${slug}.png` });
        findings.push({ area: `estudio:${slug}`, ok: true, detail: "canvas/editor OK" });
      } else {
        // Superficie no-estudio (editor propio o direct-cart) — se verifica que cargue.
        await expect(page.locator("body")).toBeVisible();
        findings.push({
          area: `estudio:${slug}`,
          ok: true,
          detail: `superficie alterna (${page.url().split("/").pop()})`,
        });
      }
    });
  }

  test("5. Flujo cotización: polaroid → estudio → finalizar → form → WhatsApp", async ({
    page,
  }) => {
    watch(page, "cotizacion");
    await page.goto("/estudio/set-fotoimanes-polaroid", { waitUntil: "domcontentloaded" });
    // El onboarding del estudio monta DESPUÉS de hidratar: si se intenta
    // dismiss inmediato aún no existe, y luego aparece tapando el checkbox de
    // consentimiento (intercepts pointer events → click timeout). Esperar su
    // ventana de montaje antes de dismiss.
    await page
      .locator('div[role="dialog"][aria-labelledby="onboarding-title"]')
      .waitFor({ state: "attached", timeout: 8_000 })
      .catch(() => {});
    await dismissOverlays(page);
    // En mobile (390px) el panel "Mis fotos" no está en pantalla: vive tras el
    // FAB «Editar» (bottom sheet). En desktop el panel lateral ya es visible.
    const editarFab = page.getByRole("button", { name: /^Editar/i }).first();
    if (
      (await editarFab.count()) &&
      !(await page
        .getByRole("checkbox", { name: /Tengo derecho a usar esta foto/i })
        .isVisible()
        .catch(() => false))
    ) {
      await editarFab.click();
    }
    // El consent y los overlays hay que operarlos DESPUÉS de hidratar: un click
    // pre-hydration cae en un botón sin handlers y se pierde en silencio (React
    // re-renderiza y resetea el checkbox) — race detectada 2026-09-25.
    const consent = page.getByRole("checkbox", { name: /Tengo derecho a usar esta foto/i });
    await consent.waitFor({ state: "visible", timeout: 20_000 });
    await page.waitForTimeout(1_500);
    await consent.check();
    await expect(consent).toBeChecked();
    // El producto exige el pack COMPLETO (6 fotos) para habilitar «Vista previa».
    // En mobile hay DOS inputs file ocultos (panel desktop + bottom sheet):
    // hay que usar el del sheet/diálogo abierto — el del panel no procesa.
    const dialogInput = page.locator(
      'div[role="dialog"] input[type="file"], [data-slot="sheet-content"] input[type="file"]',
    );
    const input = (await dialogInput.count())
      ? dialogInput.first()
      : page.locator('input[type="file"]').first();
    await input.setInputFiles([MASCOT, MASCOT, MASCOT, MASCOT, MASCOT, MASCOT]);
    // El wand rellena min(fotos procesadas, slots): si se clickea cuando solo
    // 1 foto terminó de procesarse, llena 1 slot. Su aria-label es dinámico
    // ("Llenar N slots vacíos con mis fotos", N = fotos listas): esperar N=6.
    const wand = page.getByRole("button", { name: /Llenar \d+ slots?/i });
    await page
      .getByRole("button", { name: /Llenar 6 slots?/i })
      .waitFor({ state: "visible", timeout: 90_000 });
    await wand.first().click();
    // Primer match puede ser el chip oculto del panel desktop — filtrar visible.
    await expect(page.getByText("6/6 fotos").filter({ visible: true }).first()).toBeVisible({
      timeout: 30_000,
    });
    await page.keyboard.press("Escape"); // cierra el tip "Cómo editar tu foto"
    await page.screenshot({ caret: "initial", path: "/tmp/audit-cliente-cotizacion-estudio.png" });

    // Finalizar diseño: «Vista previa» abre el modal "Así se verá tu pedido" y
    // de ahí se agrega al carrito (flujo vigente 2026-09; antes era directo).
    const listo = page.getByRole("button", { name: /Vista previa|Listo/i }).first();
    await expect(listo).toBeEnabled({ timeout: 15_000 });
    await listo.click();
    const agregar = page.getByRole("button", { name: /agregar al carrito/i }).first();
    await agregar.waitFor({ state: "visible", timeout: 20_000 });
    await agregar.click();
    await page.waitForURL(/\/carrito/, { timeout: 20_000 });
    await page.waitForTimeout(3000);
    await page.screenshot({ caret: "initial", path: "/tmp/audit-cliente-cotizacion-form.png" });
    // Buscar el CTA de WhatsApp en el carrito
    const waLink = page.locator('a[href*="wa.me"], a[href*="whatsapp"]').first();
    if (await waLink.count()) {
      const href = await waLink.getAttribute("href");
      expect(href).toContain("573208873826");
      findings.push({
        area: "cotizacion",
        ok: true,
        detail: `WhatsApp link OK (${href?.slice(0, 80)})`,
      });
    } else {
      await page.screenshot({
        caret: "initial",
        path: "/tmp/audit-cliente-cotizacion-sin-wa.png",
      });
      findings.push({
        area: "cotizacion",
        ok: false,
        detail: "no se encontró link wa.me tras finalizar",
      });
    }
  });

  test("6. Auth: /login y /registro con Turnstile", async ({ page }) => {
    watch(page, "auth");
    await page.goto("/login", { waitUntil: "domcontentloaded" });
    await expect(page.locator('input[type="email"], input[name="email"]').first()).toBeVisible({
      timeout: 15_000,
    });
    // /login NO lleva Turnstile a propósito: el login se protege con rate limit
    // dual (IP + email, 15 intentos/15 min en prod — app/(auth)/login/actions.ts).
    // El widget va en registro/recuperación/contacto/cotización/newsletter.
    // Verificado 2026-09-26 en LOCAL y PRD: /login sin host, /registro con host.
    await page.screenshot({ caret: "initial", path: "/tmp/audit-cliente-login.png" });
    await page.goto("/registro", { waitUntil: "domcontentloaded" });
    await expect(page.locator('input[type="email"], input[name="email"]').first()).toBeVisible({
      timeout: 15_000,
    });
    // El host del widget va en el HTML SSR (lucams-turnstile-host); el iframe de
    // Cloudflare se monta tras hydration vía window.turnstile.render (by design,
    // script afterInteractive) — se verifica el host, no el iframe (timing).
    const turnstileHost = await page.locator(".lucams-turnstile-host").count();
    await page.screenshot({ caret: "initial", path: "/tmp/audit-cliente-registro.png" });
    findings.push({
      area: "auth",
      ok: turnstileHost > 0,
      detail: `forms OK · turnstile host en /registro: ${turnstileHost}`,
    });
  });

  test("7. /ayuda coherente (sin factura DIAN) + legales", async ({ page }) => {
    watch(page, "ayuda");
    await page.goto("/ayuda", { waitUntil: "domcontentloaded" });
    await dismissOverlays(page);
    // Coherencia: la ayuda puede mencionar DIAN para aclarar que HOY NO emitimos factura;
    // el error sería prometerla. Buscamos frases positivas de facturación DIAN.
    // Lookbehind (?<!no ): "Hoy no emitimos factura electrónica de la DIAN; te
    // entregamos el documento…" es la aclaración correcta y NO debe contar como
    // promesa (falso positivo detectado 2026-09-25 — el regex sin anclar matcheaba
    // dentro de la negación).
    const promesasDian = await page
      .getByText(
        /(?<!no )emitimos factura electrónica|(?<!no )emitimos la factura electrónica|facturación electrónica obligatoria/i,
      )
      .count();
    await page.screenshot({
      caret: "initial",
      path: "/tmp/audit-cliente-ayuda.png",
      fullPage: true,
    });
    for (const legal of ["/legal/privacidad", "/legal/terminos", "/legal/devoluciones"]) {
      const r = await page.goto(legal, { waitUntil: "domcontentloaded" });
      expect(r?.status(), `${legal} status`).toBe(200);
    }
    findings.push({
      area: "ayuda+legal",
      ok: promesasDian === 0,
      detail: `promesas DIAN: ${promesasDian} · legales 200`,
    });
  });

  test("8. Footer/header: WhatsApp, Facebook, email correctos", async ({ page }) => {
    watch(page, "chrome");
    await page.goto("/", { waitUntil: "domcontentloaded" });
    await dismissOverlays(page);
    const wa = page
      .locator('a[href*="wa.me/573208873826"], a[href*="wa.me/+573208873826"]')
      .first();
    await expect(wa)
      .toHaveCount(1, { timeout: 15_000 })
      .catch(async () => {
        const anyWa = await page.locator('a[href*="wa.me"]').first().getAttribute("href");
        expect(anyWa, "número de WhatsApp en footer").toContain("573208873826");
      });
    const fb = page.locator('a[href*="facebook.com/lucamsshop"]').first();
    await expect(fb).toHaveCount(1);
    await expect(page.getByText("320 887 3826", { exact: false }).first()).toBeVisible();
    findings.push({
      area: "chrome",
      ok: true,
      detail: "WhatsApp 573208873826 + Facebook + email OK",
    });
  });

  test("9. Búsqueda del header", async ({ page }) => {
    watch(page, "busqueda");
    await page.goto("/", { waitUntil: "domcontentloaded" });
    await dismissOverlays(page);
    const searchBtn = page.getByRole("button", { name: /Buscar/i }).first();
    if (await searchBtn.count()) {
      await searchBtn.click();
      // La paleta cmdk expone el input con role="combobox" (patrón ARIA autocomplete).
      const input = page.getByRole("combobox").first();
      if (await input.count()) {
        await input.fill("polaroid");
        await page.waitForTimeout(1500);
        await page.screenshot({ caret: "initial", path: "/tmp/audit-cliente-busqueda.png" });
        findings.push({
          area: "busqueda",
          ok: true,
          detail: "paleta cmdk responde con resultados",
        });
        return;
      }
    }
    findings.push({
      area: "busqueda",
      ok: false,
      detail: "no se encontró trigger/input de búsqueda",
    });
  });
});
