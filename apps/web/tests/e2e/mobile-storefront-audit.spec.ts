import { test, expect } from "@playwright/test";
import "../setup-env";
import { PrismaClient } from "@lucams/db";
import fs from "node:fs";
import path from "node:path";

/*
 * Auditoría responsive del STOREFRONT (roadmap E3 — capa cliente; generalizada
 * 2026-09-18 a 4 anchos + GATE de overflow): recorrido por las pantallas
 * críticas del cliente (home, catálogo, PDP, carrito, checkout vacío y el
 * Estudio) midiendo overflow horizontal OBJETIVO
 * (documentElement.scrollWidth > clientWidth). El gate nace de la auditoría
 * UX 2026-09-18: el owner validó web/tablet/móvil y aparecieron overflows
 * reales en estudios a 768-1280px — este spec es la trampa para que no
 * regresen (corre en el gate de PR, ci.yml).
 *
 * No requiere auth. Local: corre contra el dev server (:4000).
 */

const prisma = new PrismaClient();
const OUT_DIR = path.resolve(__dirname, "../../../../tmp/screenshots/e3");

// Móvil / tablet vertical / tablet horizontal (o laptop sin sidebar admin) / desktop.
const VIEWPORTS = [
  { width: 375, height: 812 },
  { width: 768, height: 1024 },
  { width: 1024, height: 768 },
  { width: 1280, height: 800 },
];

test.setTimeout(600_000);

test.afterAll(async () => {
  await prisma.$disconnect();
});

test("auditoría responsive E3 — storefront sin overflow en 4 anchos (gate)", async ({ page }) => {
  // Producto para la PDP: el primero activo del catálogo; si el ambiente no
  // tiene (CI siembra placeholders isActive:false — el gate de PR falló el
  // 2026-09-18 por eso), se crea una fixture efímera no-personalizable
  // (patrón de compra.spec) y se borra al terminar.
  let slug = (
    await prisma.product.findFirst({
      where: { isActive: true },
      select: { slug: true },
      orderBy: { createdAt: "asc" },
    })
  )?.slug;
  let fixtureCategoryId: string | null = null;
  let fixtureProductId: string | null = null;
  if (!slug) {
    const RUN = `e3-${Date.now()}`;
    const category = await prisma.category.create({
      data: { slug: `${RUN}-cat`, name: `Cat ${RUN}` },
    });
    fixtureCategoryId = category.id;
    const product = await prisma.product.create({
      data: {
        slug: `${RUN}-simple`,
        name: `E3 Simple ${RUN}`,
        description: "Producto efímero para la auditoría E3.",
        basePrice: 19_900,
        sku: `${RUN}-SIMPLE`.toUpperCase(),
        categoryId,
        variants: {
          create: [
            {
              name: "Default",
              sku: `${RUN}-SIMPLE-DEFAULT`.toUpperCase(),
              price: 19_900,
              stock: 100,
              attributes: {},
            },
          ],
        },
      },
      select: { id: true, slug: true },
    });
    fixtureProductId = product.id;
    slug = product.slug;
  }
  // Ruta del Estudio: solo si hay producto personalizable ACTIVO en el ambiente
  // (local: sí; CI con placeholders: no — se reporta y sigue, patrón test.skip
  // de estudio.spec; el lienzo del Estudio queda gateado por las 70 capturas
  // de la auditoría de estudios y los specs de estudio).
  const studioSlug = (
    await prisma.product.findFirst({
      where: { personalizationKind: { not: "NONE" }, isActive: true },
      select: { slug: true },
      orderBy: { createdAt: "asc" },
    })
  )?.slug;
  if (!studioSlug) {
    console.log(
      "⚠️  sin producto personalizable activo: la ruta /estudio se omite en este ambiente",
    );
  }

  const ROUTES: { name: string; path: string; waitMs?: number }[] = [
    { name: "home", path: "/" },
    { name: "catalogo", path: "/productos" },
    { name: "pdp", path: `/producto/${slug}` },
    { name: "carrito", path: "/carrito" },
    { name: "checkout", path: "/checkout" },
    // El Estudio es una app client pesada (canvas) — espera extra.
    ...(studioSlug ? [{ name: "estudio", path: `/estudio/${studioSlug}`, waitMs: 7000 }] : []),
  ];

  fs.mkdirSync(OUT_DIR, { recursive: true });
  const summary: {
    route: string;
    width: number;
    screenshot: string;
    horizontalOverflow: boolean;
    scrollWidth: number;
    clientWidth: number;
    status: number | null;
  }[] = [];

  try {
    for (const vp of VIEWPORTS) {
      await page.setViewportSize(vp);
      for (const route of ROUTES) {
        const resp = await page
          .goto(route.path, { waitUntil: "domcontentloaded" })
          .catch(() => null);
        await page.waitForTimeout(route.waitMs ?? 3000);
        const metrics = await page.evaluate(() => ({
          scrollWidth: document.documentElement.scrollWidth,
          clientWidth: document.documentElement.clientWidth,
        }));
        const shot = `${vp.width}/${route.name}.png`;
        await page.screenshot({ path: path.join(OUT_DIR, shot), fullPage: true });
        const horizontalOverflow = metrics.scrollWidth > metrics.clientWidth + 1;
        summary.push({
          route: route.path,
          width: vp.width,
          screenshot: `tmp/screenshots/e3/${shot}`,
          horizontalOverflow,
          scrollWidth: metrics.scrollWidth,
          clientWidth: metrics.clientWidth,
          status: resp?.status() ?? null,
        });
        console.log(
          `${horizontalOverflow ? "❌ OVERFLOW" : "✅"} @${vp.width} ${route.path} — scrollW ${metrics.scrollWidth} / clientW ${metrics.clientWidth} (HTTP ${resp?.status() ?? "?"})`,
        );
      }
    }

    fs.writeFileSync(path.join(OUT_DIR, "summary.json"), JSON.stringify(summary, null, 2));
    const failures = summary.filter((s) => s.horizontalOverflow);
    console.log(
      `\nRESUMEN E3: ${failures.length}/${summary.length} mediciones con overflow horizontal`,
    );
    // GATE (ci.yml, 2026-09-18): CERO overflow horizontal en cualquier ancho.
    expect(
      failures.map(
        (f) => `@${f.width} ${f.route} (scrollW ${f.scrollWidth} > clientW ${f.clientWidth})`,
      ),
      `Overflow horizontal detectado:\n${failures.map((f) => `  @${f.width} ${f.route}`).join("\n")}`,
    ).toEqual([]);
  } finally {
    // La fixture efímera se borra pase o falle el gate.
    if (fixtureProductId) {
      await prisma.productVariant
        .deleteMany({ where: { productId: fixtureProductId } })
        .catch(() => {});
      await prisma.product.delete({ where: { id: fixtureProductId } }).catch(() => {});
    }
    if (fixtureCategoryId) {
      await prisma.category.delete({ where: { id: fixtureCategoryId } }).catch(() => {});
    }
  }
});
