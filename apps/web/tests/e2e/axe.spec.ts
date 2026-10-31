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

async function auditPage(
  page: import("@playwright/test").Page,
  label: string,
  path: string,
  beforeScan?: () => Promise<void>,
) {
  test.slow();
  await page.goto(path, { waitUntil: "domcontentloaded" });
  // Settle (auditoría experto 2026-07-26): axe analizaba la página a mitad de carga y los
  // skeletons/estados transitorios (shimmer de bajo contraste) disparaban falsos positivos
  // de color-contrast que variaban por corrida. Esperar a que el contenido real termine de
  // pintar estabiliza el gate (0 violaciones serious/critical verificadas tras el settle).
  await page.waitForTimeout(3000);
  if (beforeScan) await beforeScan();
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
    // 2026-10-31 (nightly): el tour de onboarding abre con un setTimeout de 800ms
    // TRAS montar el editor (studio-onboarding.tsx) — cerrarlo a ciegas era una
    // carrera: en runners lentos el chequeo corría antes de que existiera y la
    // modal quedaba abierta, interceptando clics y ensuciando el escaneo. Se
    // pre-siembran las claves "ya lo vi" de TODAS las superficies ANTES de
    // navegar (tourStorageKey: lucams_studio_onboarded_<surface> = "v1").
    await page.addInitScript(() => {
      try {
        const surfaces = ["polaroid-ig", "calendar", "bookmarks", "strips", "cards", "default"];
        for (const s of surfaces) window.localStorage.setItem(`lucams_studio_onboarded_${s}`, "v1");
      } catch {
        // localStorage no disponible: el fallback de cierre por clic queda abajo.
      }
    });
    await auditPage(page, "Estudio", `/estudio/${studioSlug}`, async () => {
      // Fallback por si el tour igual quedó abierto (p.ej. localStorage bloqueado).
      const onboarding = page.locator('div[role="dialog"][aria-labelledby="onboarding-title"]');
      if (await onboarding.isVisible().catch(() => false)) {
        await page
          .getByRole("button", { name: /Saltar tutorial/i })
          .first()
          .click()
          .catch(() => {});
        await onboarding.waitFor({ state: "detached", timeout: 5_000 }).catch(() => {});
      }
      const acceptCookies = page.getByRole("button", { name: /Aceptar todas/i });
      if (await acceptCookies.isVisible().catch(() => false)) {
        await acceptCookies
          .first()
          .click()
          .catch(() => {});
      }
      // ADR-167: con >1 plantilla el lienzo queda deshabilitado hasta elegir —
      // el gate mide el editor USABLE (estado en el que el cliente trabaja).
      // OJO: la página tiene OTROS radios (packs/variantes/colores) — la
      // plantilla se ubica por su radiogroup (aria-label de
      // texts.plantillas.elegirAria), NO por posición en la página.
      const templateGroup = page.getByRole("radiogroup", { name: /Selecciona plantilla/i });
      const firstTemplate = templateGroup.getByRole("radio").first();
      if (await firstTemplate.isVisible().catch(() => false)) {
        if ((await firstTemplate.getAttribute("aria-checked")) !== "true") {
          await firstTemplate.click();
          // El lienzo se re-monta al aplicar la plantilla (AnimatePresence) y el
          // auto-save corre con debounce de 2s (lib/store.ts): si el escaneo cae
          // en el fundido de entrada del estado «Guardado» (0.15s), axe mide el
          // texto con opacidad parcial y reporta un contraste espurio. 5s =
          // debounce + guardado + fundido + margen.
          await page.waitForTimeout(5_000);
        }
      }
    });
  });
});
