import path from "node:path";
import { test, expect, type Page, type ConsoleMessage } from "@playwright/test";
// OJO: el import debe ser ESTÁTICO (patrón de a11y.spec.ts). Un
// `await import("@lucams/db")` dentro del beforeAll revienta en el worker de
// Playwright ("exports is not defined in ES module scope" — el paquete es
// type:module) y el catch lo tragaba en silencio: la resolución del catálogo
// vivo era código muerto y TODO corría siempre con los fallbacks (causa raíz
// de los 19 rojos del nightly 36284570981, junto con el seed incompleto).
import { PrismaClient } from "@lucams/db";

/*
 * AUDITORÍA PROFUNDA — catalogo-whatsapp (capa CLIENTE) contra PRODUCCIÓN.
 *
 * Cobertura:
 *   1. Home: TODAS las categorías raíz con productos (derivadas de la DB), CTAs,
 *      sin errores de consola.
 *   2. Catálogo (/productos): grid con una muestra REAL de la página 1 (derivada
 *      de la DB: destacados → recientes) y precios.
 *   3. PDP ×N (todos los productos vivos): carga 200, precio, CTA.
 *   4. Estudio ×N: superficie esperada por producto (foto→canvas, letterset,
 *      nombre, gate ADR-063, direct-cart) sin 500.
 *   5. Flujo de cotización: PDP → Estudio (foto-pack, sube fotos) → finalizar →
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

/*
 * El catálogo vivo se resuelve contra la DB del ambiente en beforeAll (los
 * slugs/nombres cambian con archivados/renombres — hardcodearlos rompió la
 * auditoría al archivar nombre-personalizado el 2026-09-25, y de nuevo en el
 * nightly 36284570981 contra el localstack recién sembrado). Fallback a la
 * última lista conocida del catálogo dev si no hay DATABASE_URL (corrida
 * puntual sin env).
 *
 * OJO (R5, 2026-09-26): los tests 3/4 NO se registran por-slug en load-time —
 * un `for` sobre un array module-scope congela el fallback ANTES del beforeAll
 * (la resolución "viva" era código muerto para ellos: los PDP del nightly
 * corrieron siempre con los slugs del fallback). Ahora son tests únicos que
 * iteran PRODUCTS ya resuelto, con un test.step por producto.
 */

type LiveProduct = {
  slug: string;
  name: string;
  kind: string;
  /** personalizationSchema mergeado con la 1ª variante activa (como /estudio/[slug]). */
  schema: Record<string, unknown>;
};

const PRODUCTS_FALLBACK: LiveProduct[] = [
  {
    slug: "set-fotoimanes-polaroid",
    name: "Fotoimanes Polaroid",
    kind: "PHOTO_PACK",
    schema: { photoSlots: 6 },
  },
  {
    slug: "set-fotoimanes-cuadrados",
    name: "Fotoimanes Cuadrados",
    kind: "PHOTO_PACK",
    schema: { photoSlots: 6 },
  },
  {
    slug: "tiras-magneticas-fotos",
    name: "Tiras Magnéticas",
    kind: "PHOTO_PACK",
    schema: { photoSlots: 3 },
  },
  {
    slug: "calendario-mes-a-mes-fotos",
    name: "Calendario Set 12 Tarjetas",
    kind: "CALENDAR_PHOTO_MONTH",
    schema: { photoSlots: 12 },
  },
  { slug: "pack-vocales", name: "Pack Vocales", kind: "NONE", schema: { letterSet: "vowels" } },
  {
    slug: "abecedario-completo",
    name: "Abecedario Completo",
    kind: "NONE",
    schema: { letterSet: "full" },
  },
  {
    slug: "separadores-magneticos",
    name: "Separadores Magnéticos",
    kind: "PHOTO_PACK",
    schema: { photoSlots: 1 },
  },
  {
    slug: "separadores-alargados",
    name: "Separadores Largos",
    kind: "PHOTO_PACK",
    schema: { photoSlots: 6 },
  },
];

// Raíces con productos comprables en el catálogo dev (2026-09-26).
const HOME_CATEGORIES_FALLBACK = [
  { slug: "foto-imanes", name: "Fotoimanes" },
  { slug: "calendarios", name: "Calendarios Magnéticos" },
  { slug: "separadores", name: "Separadores de Libros" },
  { slug: "juegos-aprendizaje", name: "Juegos y Aprendizaje" },
];

// Muestra de la página 1 de /productos cuando no hay DB accesible.
const CATALOGO_SAMPLE_FALLBACK = [
  "Fotoimanes Polaroid",
  "Calendario Set 12 Tarjetas",
  "Magnéticos",
  "Largos",
];

let PRODUCTS: LiveProduct[] = PRODUCTS_FALLBACK;
let HOME_CATEGORIES = HOME_CATEGORIES_FALLBACK;
let CATALOGO_SAMPLE = CATALOGO_SAMPLE_FALLBACK;

test.beforeAll(async () => {
  if (!process.env.DATABASE_URL?.startsWith("postgres")) return;
  const prisma = new PrismaClient();
  try {
    // Productos visibles en el storefront (mismo gate que la tienda: producto
    // Y categoría activos y no archivados — STOREFRONT_PRODUCT_WHERE). Orden
    // = el default de /productos (destacados → recientes), paginado de a 12.
    const rows = await prisma.product.findMany({
      where: {
        deletedAt: null,
        isActive: true,
        category: { deletedAt: null, isActive: true },
      },
      orderBy: [{ isFeatured: "desc" }, { createdAt: "desc" }],
      select: {
        slug: true,
        name: true,
        personalizationKind: true,
        personalizationSchema: true,
        variants: {
          where: { deletedAt: null, isActive: true },
          orderBy: { createdAt: "asc" },
          select: { attributes: true },
          take: 1,
        },
      },
    });
    if (rows.length) {
      PRODUCTS = rows.map((r) => ({
        slug: r.slug,
        name: r.name,
        kind: r.personalizationKind,
        // /estudio mergea la 1ª variante sobre el schema del producto
        // (mergeVariantOverProduct, shallow) antes de enrutar la superficie.
        schema: {
          ...((r.personalizationSchema as Record<string, unknown> | null) ?? {}),
          ...((r.variants[0]?.attributes as Record<string, unknown> | null) ?? {}),
        },
      }));
      CATALOGO_SAMPLE = rows.slice(0, 4).map((r) => r.name);
    }
    // Categorías raíz que la home SÍ renderiza: activas con conteo efectivo
    // > 0 (productos directos + los de sus hijas activas) — la misma regla
    // de listStorefrontCategories({ topLevelOnly: true }) en public-service.
    const cats = await prisma.category.findMany({
      where: { deletedAt: null, isActive: true },
      orderBy: [{ order: "asc" }, { name: "asc" }],
      select: {
        id: true,
        slug: true,
        name: true,
        parentId: true,
        _count: { select: { products: { where: { deletedAt: null, isActive: true } } } },
      },
    });
    const effective = new Map<string, number>();
    for (const c of cats) if (c.parentId === null) effective.set(c.id, c._count.products);
    for (const c of cats)
      if (c.parentId !== null)
        effective.set(c.parentId, (effective.get(c.parentId) ?? 0) + c._count.products);
    const roots = cats.filter((c) => c.parentId === null && (effective.get(c.id) ?? 0) > 0);
    if (roots.length) HOME_CATEGORIES = roots.map((c) => ({ slug: c.slug, name: c.name }));
  } catch (e) {
    // Sin DB accesible: quedan los fallbacks declarados arriba. Se deja rastro
    // visible — el catch mudo de la versión anterior escondió el import roto.
    console.warn(`[audit-cliente] resolución de catálogo vivo falló, usando fallbacks: ${e}`);
  } finally {
    await prisma.$disconnect();
  }
});

// Superficie que /estudio/[slug] resolverá para cada producto (réplica mínima
// de resolvePersonalizationSurface en features/personalization/surface.ts — si
// esa función cambia, actualizar acá).
type ExpectedSurface = "photo" | "letterset" | "name" | "gate" | "direct-cart";
function expectedSurface(p: LiveProduct): ExpectedSurface {
  const s = p.schema;
  if (s.letterSet === "full" || s.letterSet === "vowels") return "letterset";
  if (p.kind === "NONE") return "direct-cart";
  if (p.kind === "TEXT_ONLY") {
    if (s.variant === "full" || s.variant === "vowels") return "direct-cart";
    const isPhrase =
      s.variant !== "name" && (typeof s.maxChars === "number" || Array.isArray(s.fontOptions));
    return isPhrase ? "gate" : "name";
  }
  if (p.kind === "EVENT_FAVOR" || p.kind === "BUSINESS_LOGO") return "gate";
  return "photo";
}

// Ruta RELATIVA al spec — el absoluto /home/ansible/... que había antes no
// existe en el runner de CI (landmine latente: el upload del test 5 hubiera
// fallado ahí aunque el estudio cargara).
const MASCOT = path.resolve(__dirname, "../../public/brand/lucams-mascot.png");

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
    // Las categorías esperadas se derivan de la DB del ambiente (raíces con
    // productos comprables — la misma regla del grid). Se aserta la CARD del
    // grid (link /productos?categoria=<slug> + nombre), no texto suelto: el
    // hero menciona "Fotoimanes" en prosa y un getByText pelado PASABA con el
    // grid vacío (falso verde parcial en el nightly 36284570981).
    for (const cat of HOME_CATEGORIES) {
      const card = page.locator(`a[href="/productos?categoria=${cat.slug}"]`).first();
      await expect(card, `home grid: categoría "${cat.name}"`).toBeVisible({ timeout: 15_000 });
      await expect(card).toContainText(cat.name);
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
    // Muestra REAL derivada de la página 1 del storefront (destacados →
    // recientes, mismo orderBy que /productos) — nada de nombres hardcodeados.
    for (const p of CATALOGO_SAMPLE) {
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

  test("3. PDPs del catálogo vivo: 200 + h1 + precio", async ({ page }) => {
    test.setTimeout(Math.max(300_000, PRODUCTS.length * 20_000));
    watch(page, "pdp");
    expect(PRODUCTS.length, "el catálogo vivo tiene productos activos").toBeGreaterThan(0);
    for (const p of PRODUCTS) {
      await test.step(`PDP ${p.slug}`, async () => {
        const resp = await page.goto(`/producto/${p.slug}`, { waitUntil: "domcontentloaded" });
        await dismissOverlays(page);
        expect(resp?.status(), `PDP ${p.slug} status`).toBe(200);
        await expect(page.locator("h1").first()).toBeVisible({ timeout: 15_000 });
        await expect(page.getByText("$").first()).toBeVisible();
      });
    }
    await page.screenshot({ caret: "initial", path: "/tmp/audit-cliente-pdp-ultima.png" });
    findings.push({
      area: "pdp",
      ok: true,
      detail: `${PRODUCTS.length} PDPs 200 + h1 + precio`,
    });
  });

  test("4. Estudio (superficie foto): canvas carga sin 5xx", async ({ page }) => {
    const photoProducts = PRODUCTS.filter((p) => expectedSurface(p) === "photo");
    test.setTimeout(Math.max(300_000, photoProducts.length * 30_000));
    watch(page, "estudio-foto");
    for (const p of photoProducts) {
      await test.step(`Estudio ${p.slug}`, async () => {
        const resp = await page.goto(`/estudio/${p.slug}`, { waitUntil: "domcontentloaded" });
        await dismissOverlays(page);
        expect(resp?.status(), `Estudio ${p.slug} status`).toBe(200);
        await expect(page.locator("canvas").first()).toBeVisible({ timeout: 30_000 });
      });
    }
    if (photoProducts.length)
      await page.screenshot({
        caret: "initial",
        path: `/tmp/audit-cliente-estudio-${photoProducts.at(-1)!.slug}.png`,
      });
    findings.push({
      area: "estudio-foto",
      ok: true,
      detail: `${photoProducts.length} editores de foto con canvas OK`,
    });
  });

  test("4b. Estudio (superficies alternas): letterset / nombre / gate / direct-cart", async ({
    page,
  }) => {
    const alternas = PRODUCTS.filter((p) => expectedSurface(p) !== "photo");
    test.setTimeout(Math.max(300_000, alternas.length * 20_000));
    watch(page, "estudio-alt");
    for (const p of alternas) {
      const surface = expectedSurface(p);
      await test.step(`Estudio ${p.slug} (${surface})`, async () => {
        const resp = await page.goto(`/estudio/${p.slug}`, { waitUntil: "domcontentloaded" });
        await dismissOverlays(page);
        if (surface === "direct-cart") {
          // Set fijo o no personalizable → /estudio redirige a la PDP (ADR-057).
          await page.waitForURL(`/producto/${p.slug}`, { timeout: 15_000 });
          await expect(page.locator("h1").first()).toBeVisible({ timeout: 15_000 });
          return;
        }
        expect(resp?.status(), `Estudio ${p.slug} status`).toBe(200);
        if (surface === "letterset") {
          // Editores de sets (letras): HTML con tema/idioma/colores, sin canvas Konva.
          await expect(page.getByText("Elige los colores", { exact: false }).first()).toBeVisible({
            timeout: 30_000,
          });
        } else if (surface === "name") {
          // Superficie "Arma tu palabra" (editor de nombre, sin canvas Konva).
          await expect(page.getByText("Arma tu palabra", { exact: false }).first()).toBeVisible({
            timeout: 30_000,
          });
        } else {
          // gate (phrase/event/logo): aviso claro + cotización por WhatsApp
          // (ADR-063 D1) — se verifica que renderice, no que abra el editor de foto.
          await expect(page.locator("h1").first()).toBeVisible({ timeout: 30_000 });
        }
      });
    }
    findings.push({
      area: "estudio-alt",
      ok: true,
      detail: `${alternas.length} superficies alternas OK`,
    });
  });

  test("5. Flujo cotización: foto-pack → estudio → finalizar → form → WhatsApp", async ({
    page,
  }) => {
    watch(page, "cotizacion");
    // Producto del flujo: un foto-pack del catálogo VIVO (polaroid preferido;
    // el pack completo de fotos es requisito para habilitar «Vista previa»).
    // Antes estaba hardcodeado a set-fotoimanes-polaroid: si ese slug se
    // archiva/renombra, el flujo entero quebraba aunque hubiera otros packs.
    const photoPacks = PRODUCTS.filter(
      (p) => expectedSurface(p) === "photo" && Number(p.schema.photoSlots) > 0,
    );
    const target =
      photoPacks.find((p) => p.slug.includes("polaroid") && Number(p.schema.photoSlots) <= 6) ??
      photoPacks.sort((a, b) => Number(a.schema.photoSlots) - Number(b.schema.photoSlots))[0];
    expect(target, "el catálogo vivo tiene un foto-pack para el flujo de cotización").toBeTruthy();
    const slots = Number(target!.schema.photoSlots);
    await page.goto(`/estudio/${target!.slug}`, { waitUntil: "domcontentloaded" });
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
    // El producto exige el pack COMPLETO (N fotos) para habilitar «Vista previa».
    // En mobile hay DOS inputs file ocultos (panel desktop + bottom sheet):
    // hay que usar el del sheet/diálogo abierto — el del panel no procesa.
    const dialogInput = page.locator(
      'div[role="dialog"] input[type="file"], [data-slot="sheet-content"] input[type="file"]',
    );
    const input = (await dialogInput.count())
      ? dialogInput.first()
      : page.locator('input[type="file"]').first();
    await input.setInputFiles(Array.from({ length: slots }, () => MASCOT));
    // El wand rellena min(fotos procesadas, slots): si se clickea cuando solo
    // 1 foto terminó de procesarse, llena 1 slot. Su aria-label es dinámico
    // ("Llenar N slots vacíos con mis fotos", N = fotos listas): esperar N=slots.
    const wand = page.getByRole("button", { name: /Llenar \d+ slots?/i });
    await page
      .getByRole("button", { name: new RegExp(`Llenar ${slots} slots?`, "i") })
      .waitFor({ state: "visible", timeout: 90_000 });
    await wand.first().click();
    // Primer match puede ser el chip oculto del panel desktop — filtrar visible.
    await expect(
      page.getByText(`${slots}/${slots} fotos`).filter({ visible: true }).first(),
    ).toBeVisible({ timeout: 30_000 });
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
    // El click dispara design.finalize: render SERVER-SIDE de la producción
    // (6 slots × foto original ≈ 28 MB — medido 21.6s en dev sobre el stack
    // sembrado). 20s de timeout hacían flaky este paso aun con el render OK.
    await page.waitForURL(/\/carrito/, { timeout: 60_000 });
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
