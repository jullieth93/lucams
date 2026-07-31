import { test } from "@playwright/test";
import "../setup-env";
import { PrismaClient } from "@lucams/db";
import fs from "node:fs";
import path from "node:path";

/*
 * Auditoría móvil del STOREFRONT (roadmap E3 — capa cliente): recorrido a
 * 375×812 por las pantallas críticas del cliente: home, catálogo, PDP,
 * carrito, checkout (estado vacío) y el Estudio (crítico: canvas + gestures).
 * Misma estrategia que E1: screenshot full-page + medición objetiva de
 * overflow horizontal por pantalla → tmp/screenshots/e3/ (gitignored).
 *
 * No requiere auth. Local: corre contra el dev server (:4000).
 */

const prisma = new PrismaClient();
const OUT_DIR = path.resolve(__dirname, "../../../../tmp/screenshots/e3");

test.setTimeout(300_000);
test.use({ viewport: { width: 375, height: 812 } });

test.afterAll(async () => {
  await prisma.$disconnect();
});

test("auditoría móvil E3 — storefront a 375px", async ({ page }) => {
  // Un producto real publicado para PDP y Estudio.
  const product = await prisma.product.findFirst({
    where: { isActive: true, slug: { not: undefined } },
    select: { slug: true },
    orderBy: { createdAt: "asc" },
  });
  const slug = product?.slug;
  if (!slug) throw new Error("No hay producto activo para la auditoría E3");

  const ROUTES: { name: string; path: string; waitMs?: number }[] = [
    { name: "home", path: "/" },
    { name: "catalogo", path: "/productos" },
    { name: "pdp", path: `/producto/${slug}` },
    { name: "carrito", path: "/carrito" },
    { name: "checkout", path: "/checkout" },
    // El Estudio es una app client pesada (canvas) — espera extra.
    { name: "estudio", path: `/estudio/${slug}`, waitMs: 7000 },
  ];

  fs.mkdirSync(OUT_DIR, { recursive: true });
  const summary: {
    route: string;
    screenshot: string;
    horizontalOverflow: boolean;
    scrollWidth: number;
    clientWidth: number;
    status: number | null;
  }[] = [];

  for (const route of ROUTES) {
    const resp = await page.goto(route.path, { waitUntil: "domcontentloaded" }).catch(() => null);
    await page.waitForTimeout(route.waitMs ?? 3000);
    const metrics = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
    }));
    const shot = `${route.name}.png`;
    await page.screenshot({ path: path.join(OUT_DIR, shot), fullPage: true });
    const horizontalOverflow = metrics.scrollWidth > metrics.clientWidth + 1;
    summary.push({
      route: route.path,
      screenshot: `tmp/screenshots/e3/${shot}`,
      horizontalOverflow,
      scrollWidth: metrics.scrollWidth,
      clientWidth: metrics.clientWidth,
      status: resp?.status() ?? null,
    });
    console.log(
      `${horizontalOverflow ? "❌ OVERFLOW" : "✅"} ${route.path} — scrollW ${metrics.scrollWidth} / clientW ${metrics.clientWidth} (HTTP ${resp?.status() ?? "?"})`,
    );
  }

  fs.writeFileSync(path.join(OUT_DIR, "summary.json"), JSON.stringify(summary, null, 2));
  const withOverflow = summary.filter((s) => s.horizontalOverflow).length;
  console.log(
    `\nRESUMEN E3: ${withOverflow}/${summary.length} pantallas con overflow horizontal a 375px`,
  );
});
