/*
 * E2E — auditoría automatizada WCAG con axe-core (Bloque E, Lucy 2026-07-03).
 *
 * Complementa a11y.spec.ts (invariantes manuales) con las ~90 reglas de axe
 * (contraste, ARIA, roles, nombres, orden de headings, etc.) sobre WCAG 2.1 A/AA.
 * Cada test loguea TODAS las violaciones (para triage) y falla si hay alguna de
 * impacto `serious`/`critical` — el umbral que rompe el uso real con lector de
 * pantalla / bajo contraste. Las `moderate`/`minor` quedan visibles en el log.
 *
 * Requiere el dev server + DATABASE_URL (para slugs reales). test.slow() absorbe
 * el cold-compile on-demand de `next dev` (instantáneo en CI, build prod).
 */

import { test, expect } from "@playwright/test";
import { PrismaClient } from "@lucams/db";
import { scanA11y, formatViolations } from "./_helpers/axe-scan";

const prisma = new PrismaClient();
let pdpSlug = "";
let studioSlug = "";

test.beforeAll(async () => {
  const p = await prisma.product.findFirst({
    where: { isActive: true },
    select: { slug: true },
    orderBy: { createdAt: "asc" },
  });
  pdpSlug = p?.slug ?? "";
  const s = await prisma.product.findFirst({
    where: { isActive: true, personalizationKind: { not: "NONE" } },
    select: { slug: true },
    orderBy: { createdAt: "asc" },
  });
  studioSlug = s?.slug ?? "";
});

test.afterAll(async () => {
  await prisma.$disconnect();
});

const BLOCKING = new Set(["serious", "critical"]);
// Gate ESTRICTA: cero violaciones serious/critical, contraste INCLUIDO. La paleta
// kawaii se conservó intacta; el contraste AA se logró con tonos de texto derivados
// (brand-muted / pink-ink / coral-ink) — ver ADR-044 en docs/DECISIONS.md.

async function auditPage(page: import("@playwright/test").Page, label: string, path: string) {
  test.slow();
  await page.goto(path, { waitUntil: "domcontentloaded" });
  const violations = await scanA11y(page);
  // Visible en el output para triage (incluye moderate/minor).
  console.log(formatViolations(label, violations));
  const blocking = violations.filter((v) => v.impact && BLOCKING.has(v.impact));
  expect(
    blocking.map((v) => `${v.id} (${v.impact})`),
    `violaciones serious/critical en ${label}`,
  ).toEqual([]);
}

test.describe("axe — auditoría WCAG 2.1 A/AA", () => {
  const PUBLIC = [
    ["home", "/"],
    ["catálogo", "/productos"],
    ["carrito vacío", "/carrito"],
    ["ayuda", "/ayuda"],
    ["contacto", "/contacto"],
    ["login", "/login"],
    ["registro", "/registro"],
  ] as const;

  for (const [label, path] of PUBLIC) {
    test(`${label} (${path})`, async ({ page }) => {
      await auditPage(page, label, path);
    });
  }

  test("PDP (producto real)", async ({ page }) => {
    test.skip(!pdpSlug, "no hay producto activo");
    await auditPage(page, "PDP", `/producto/${pdpSlug}`);
  });

  test("Estudio (producto personalizable)", async ({ page }) => {
    test.skip(!studioSlug, "no hay producto personalizable");
    await auditPage(page, "Estudio", `/estudio/${studioSlug}`);
  });
});
