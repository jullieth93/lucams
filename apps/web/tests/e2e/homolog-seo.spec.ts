/*
 * HOMOLOGACIÓN E2E — SEO/estáticos (docs/TESTING.md):
 *   sitemap.xml (productos + legales), robots.txt (bloquea /admin, SIN /_next),
 *   OG image real, canonical al dominio del ambiente, JSON-LD home + PDP (en modo
 *   catálogo el Product NO emite Offer/InStock — la tienda no vende en línea),
 *   PDP inexistente → noindex garantizado (el 404 HTTP duro lo impide el boundary
 *   loading.tsx del segmento; ver comentario en el paso 7) y /status con noindex.
 *   Solo lectura — corre en LOCAL y STG × desktop.
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { E2E_ENV, expect, test } from "./fixtures/auth";
import { disconnectDb, getActiveProduct } from "./fixtures/db";
import { newRunId } from "./fixtures/run";

const EVIDENCE_DIR = resolve(__dirname, "../../tmp/e2e-homologacion");

test.skip(E2E_ENV === "prd", "La corrida de homologación es LOCAL/STG (PRD solo smoke read-only).");
test.setTimeout(180_000);

const run = newRunId("seo");

type Step = { step: string; ok: boolean; detail?: string; at: string };

test.afterAll(async () => {
  await disconnectDb();
});

test("seo: sitemap + robots + OG image + canonical + JSON-LD home/PDP (sin Offer en catálogo)", async ({
  anonPage,
  request,
}, testInfo) => {
  mkdirSync(EVIDENCE_DIR, { recursive: true });
  const resultsPath = resolve(
    EVIDENCE_DIR,
    `results-${E2E_ENV}-${testInfo.project.name}-${run}.json`,
  );
  const steps: Step[] = [];
  const record = (step: string, ok: boolean, detail?: string) =>
    steps.push({ step, ok, detail, at: new Date().toISOString() });

  try {
    // 1. sitemap.xml: incluye productos y páginas legales.
    const sitemap = await request.get("/sitemap.xml");
    expect(sitemap.ok()).toBeTruthy();
    const sitemapBody = await sitemap.text();
    expect(sitemapBody).toContain("/productos");
    expect(sitemapBody).toContain("/legal/privacidad");
    expect(sitemapBody).toContain("/producto/");
    record("sitemap", true, "productos + legales + PDPs");

    // 2. robots.txt: bloquea /admin y NO bloquea /_next (auditoría SEO 2026-10-28:
    // el disallow de /_next impedía a Googlebot-Image rastrear /_next/image).
    const robots = await request.get("/robots.txt");
    expect(robots.ok()).toBeTruthy();
    const robotsBody = (await robots.text()).toLowerCase();
    expect(robotsBody).toContain("disallow: /admin");
    expect(robotsBody, "robots.txt no debe bloquear /_next").not.toContain("/_next");
    record("robots", true);

    // 3. OG image real: la home declara og:image y responde imagen.
    await anonPage.goto("/", { waitUntil: "domcontentloaded" });
    const ogImage = await anonPage.locator('meta[property="og:image"]').getAttribute("content");
    expect(ogImage, "la home debe declarar og:image").toBeTruthy();
    const ogRes = await request.get(ogImage!);
    expect(ogRes.ok(), `og:image ${ogImage} debe responder 200`).toBeTruthy();
    expect(ogRes.headers()["content-type"] ?? "").toMatch(/image\//);
    record("og-image", true, ogImage!);

    // 4. Canonical: la home lo emite (fix H13) apuntando al dominio CANÓNICO
    // del ambiente — en previews es el dominio de marca por diseño
    // (lib/public-url.ts: "NO usar VERCEL_URL: es el host del deployment, no
    // el dominio canónico").
    const canonical = await anonPage.locator('link[rel="canonical"]').getAttribute("href");
    expect(canonical, "la home debe emitir canonical (H13)").toBeTruthy();
    if (E2E_ENV === "stg") {
      expect(canonical!.replace(/\/+$/, "")).toBe("https://lucamsshop.com");
    } else {
      const siteUrl = (process.env.NEXT_PUBLIC_SITE_URL ?? "").replace(/\/$/, "");
      expect(canonical).toContain(siteUrl.replace(/^https?:\/\//, ""));
    }
    record("canonical", true, canonical!);

    // 5. JSON-LD home: WebSite/Organization presente.
    const homeScripts = await anonPage
      .locator('script[type="application/ld+json"]')
      .allInnerTexts();
    expect(homeScripts.length).toBeGreaterThan(0);
    record("jsonld-home", true, `${homeScripts.length} scripts JSON-LD en home`);

    // 6. JSON-LD PDP: Product SIN Offer/InStock en modo catálogo (la tienda no
    // vende en línea — regresión del bug SEO de 2026-07).
    const product = await getActiveProduct();
    expect(product).not.toBeNull();
    await anonPage.goto(`/producto/${product!.slug}`, { waitUntil: "domcontentloaded" });
    const pdpScripts = await anonPage.locator('script[type="application/ld+json"]').allInnerTexts();
    const productLd = pdpScripts.find(
      (s) => s.includes('"@type":"Product"') || s.includes('"@type": "Product"'),
    );
    expect(productLd, "la PDP debe tener JSON-LD Product").toBeTruthy();
    expect(productLd!, "en modo catálogo el Product NO emite Offer").not.toContain('"Offer"');
    expect(productLd!).not.toContain("InStock");
    record("jsonld-pdp-catalog", true, `Product sin Offer/InStock (${product!.slug})`);

    // 7. PDP inexistente → protección anti-indexación. Auditoría SEO 2026-10-28:
    // el segmento tiene loading.tsx, así que Next confirma el shell con 200 antes de
    // que notFound() resuelva (streaming) — un 404 HTTP duro requeriría chequear la
    // existencia del slug en el proxy (pendiente, ver tmp/seo-audit). Lo que SÍ se
    // garantiza acá es que la respuesta no es indexable: meta robots noindex + UI 404.
    const notFound = await request.get("/producto/producto-inexistente-seo-audit");
    const notFoundBody = await notFound.text();
    expect(
      notFoundBody,
      "una PDP inexistente debe emitir meta robots noindex",
    ).toContain("noindex");
    expect(notFoundBody).toContain("no encontrada");
    record("pdp-inexistente-noindex", true, `status ${notFound.status()} + noindex`);

    // 8. /status es una página interna de salud de servicios: meta robots noindex.
    await anonPage.goto("/status", { waitUntil: "domcontentloaded" });
    const statusRobots = await anonPage.locator('meta[name="robots"]').getAttribute("content");
    expect(statusRobots ?? "", "/status debe emitir meta robots noindex").toContain("noindex");
    record("status-noindex", true, statusRobots!);

    writeFileSync(
      resultsPath,
      JSON.stringify(
        {
          spec: "homolog-seo",
          env: E2E_ENV,
          project: testInfo.project.name,
          run,
          status: "pass",
          steps,
        },
        null,
        2,
      ),
    );
    console.log(`✓ evidencia seo: ${resultsPath}`);
  } catch (err) {
    writeFileSync(
      resultsPath,
      JSON.stringify(
        {
          spec: "homolog-seo",
          env: E2E_ENV,
          project: testInfo.project.name,
          run,
          status: "fail",
          error: String(err),
          steps,
        },
        null,
        2,
      ),
    );
    throw err;
  }
});
