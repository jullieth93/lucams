/*
 * HOMOLOGACIÓN E2E — cruces admin→cliente de la matriz §5.3 del prompt
 * (trazabilidad cliente-admin), modo catálogo:
 *
 *   1. Toggle COD_ENABLED (admin contenido global) → chip "contraentrega" del
 *      hero aparece/desaparece en la home → revertir → vuelve.
 *   2. Desactivar un producto (admin productos, checkbox Visibilidad) → la PDP
 *      deja de mostrarse al cliente SIN borrarse de la DB → reactivar → vuelve.
 *   3. Aprobar una reseña pendiente (admin resenas) → la PDP la muestra con su
 *      autor y texto → limpieza.
 *   4. Marcar leída una notificación QUOTE (admin notificaciones) → la pill de
 *      no leídas del nav desaparece.
 *
 * Dos filas de la matriz §5.3 NO aplican en modo catálogo y quedan
 * documentadas en la auditoría (no se fuerzan): cupones (Etapa 2 — el modo
 * catálogo no tiene campo de cupón) y "estado de cotización visible en
 * /cotizacion/[token]" (la página pública de confirmación NO muestra estado
 * por diseño — solo número, ítems y CTA de WhatsApp).
 *
 * Corre en LOCAL y STG × desktop/mobile. En PRD PROHIBIDO (mutaciones).
 * Admin vía storageState (E2E_AUTH=1); el cliente es anonPage (sin cookies
 * de admin). Datos efímeros con RUN y limpieza total al final de cada cruce.
 * Valores iniciales leídos de la DB del ambiente (cero hardcoding) y
 * revertidos al final. Evidencia: JSON + screenshots por corrida.
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import type { Page } from "@playwright/test";
import { E2E_ENV, expect, test } from "./fixtures/auth";
import { db, disconnectDb, getCmsFieldState } from "./fixtures/db";
import {
  createEphemeralProduct,
  deleteEphemeralProduct,
  fakeCustomer,
  type EphemeralProduct,
} from "./fixtures/data-factory";
import { newRunId } from "./fixtures/run";
import { AdminContenidoPage } from "./pages/admin-contenido";

const EVIDENCE_DIR = resolve(__dirname, "../../tmp/e2e-homologacion");
const shotsDir = resolve(EVIDENCE_DIR, "shots");

test.skip(E2E_ENV === "prd", "Los cruces admin→cliente mutan datos: prohibidos en PRD.");
test.setTimeout(240_000);

const run = newRunId("cruces");
const customer = fakeCustomer(run);

type Step = { step: string; ok: boolean; detail?: string; screenshot?: string; at: string };
const steps: Step[] = [];
function record(step: string, ok: boolean, detail?: string, screenshot?: string) {
  steps.push({ step, ok, detail, screenshot, at: new Date().toISOString() });
}

let resultsPath = "";
let projectName = "";

async function shot(page: Page, name: string) {
  mkdirSync(shotsDir, { recursive: true });
  const path = resolve(shotsDir, `${E2E_ENV}-${projectName}-${run}-${name}.png`);
  await page.screenshot({ path, fullPage: false });
  return path;
}

function writeEvidence(status: "pass" | "fail", error?: unknown) {
  mkdirSync(EVIDENCE_DIR, { recursive: true });
  writeFileSync(
    resultsPath,
    JSON.stringify(
      {
        spec: "homolog-admin-cruces",
        env: E2E_ENV,
        project: projectName,
        run,
        status,
        ...(error ? { error: String(error) } : {}),
        steps,
      },
      null,
      2,
    ),
  );
}

test.afterAll(async () => {
  await disconnectDb();
});

/* ═══ Cruz 1 — COD_ENABLED → chip del hero ═══ */

test("cruz 1: toggle COD_ENABLED → chip contraentrega del hero aparece/desaparece", async ({
  adminPage,
  anonPage,
}, testInfo) => {
  projectName = testInfo.project.name;
  resultsPath = resolve(EVIDENCE_DIR, `results-${E2E_ENV}-${projectName}-${run}.json`);
  try {
    const FIELD_KEY = "COD_ENABLED";
    const CHIP = /pago contraentrega/i;
    const contenido = new AdminContenidoPage(adminPage);

    // Valor actual DESDE LA DB (setting BOOLEAN publicado).
    const before = await getCmsFieldState(FIELD_KEY);
    expect(before, "el setting COD_ENABLED debe existir").not.toBeNull();
    const originalValue = before!.publishedBody === "true";
    record("c1-db-read", true, `COD_ENABLED=${originalValue} (leído de DB ${E2E_ENV})`);

    const seesChip = async () => {
      await anonPage.goto("/", { waitUntil: "domcontentloaded" });
      return (await anonPage.locator("body").innerText()).match(CHIP) !== null;
    };

    // Baseline coherente: el cliente ve el chip solo si el setting está ON.
    expect(await seesChip(), "baseline: chip coherente con el setting").toBe(originalValue);
    record("c1-baseline", true, `chip visible=${originalValue}`);

    // Flip por la UI del admin → el cliente ve el cambio.
    await contenido.editBooleanSettingAndPublish("global", FIELD_KEY, !originalValue);
    const flipped = await db()
      .cmsField.findUnique({ where: { key: FIELD_KEY }, select: { body: true } })
      .then((f) => f?.body === "true");
    expect(flipped).toBe(!originalValue);
    expect(await seesChip(), "el chip debe reflejar el flip").toBe(!originalValue);
    record(
      "c1-flip-visible",
      true,
      `COD=${!originalValue} → chip ${!originalValue ? "visible" : "oculto"}`,
      await shot(anonPage, "c1-flip"),
    );

    // Revertir por la misma UI → vuelve al estado inicial.
    await contenido.editBooleanSettingAndPublish("global", FIELD_KEY, originalValue);
    expect(await seesChip(), "el chip debe volver al estado inicial").toBe(originalValue);
    record("c1-revert", true, `COD vuelve a ${originalValue}`);
    writeEvidence("pass");
  } catch (err) {
    writeEvidence("fail", err);
    throw err;
  }
});

/* ═══ Cruz 2 — Desactivar producto → fuera del storefront, en la DB ═══ */

test("cruz 2: desactivar producto → la PDP deja de mostrarse sin borrarse de la DB", async ({
  adminPage,
  anonPage,
}, testInfo) => {
  projectName = testInfo.project.name;
  resultsPath = resolve(EVIDENCE_DIR, `results-${E2E_ENV}-${projectName}-${run}.json`);
  let product: EphemeralProduct | null = null;
  try {
    product = await createEphemeralProduct(run);

    // Activo: la PDP responde y muestra el producto.
    await anonPage.goto(`/producto/${product.slug}`, { waitUntil: "domcontentloaded" });
    await expect(anonPage.locator("h1").first()).toBeVisible();
    await expect(anonPage.locator("body")).toContainText(product.name);
    record("c2-pdp-visible", true, `/producto/${product.slug} 200 con el producto`);

    // Admin: apagar "Visible en la tienda" y guardar. El form no muestra
    // mensaje de éxito (solo errores) → la señal real es la DB.
    await adminPage.goto(`/admin/productos/${product.productId}`, {
      waitUntil: "domcontentloaded",
    });
    const activeCheckbox = adminPage.locator('input[name="isActive"]');
    await expect(activeCheckbox).toBeChecked();
    await activeCheckbox.uncheck();
    await adminPage
      .getByRole("button", { name: /guardar/i })
      .first()
      .click();
    await expect(async () => {
      const p = await db().product.findUnique({
        where: { id: product!.productId },
        select: { isActive: true },
      });
      expect(p!.isActive, "isActive=false persistido").toBe(false);
    }).toPass({ timeout: 30_000 });
    record("c2-admin-deactivated", true, "isActive=false guardado por la UI del admin");

    // La PDP deja de mostrarse y la fila SIGUE en la DB.
    await expect(async () => {
      await anonPage.goto(`/producto/${product!.slug}`, { waitUntil: "domcontentloaded" });
      await expect(anonPage.locator("body")).not.toContainText(product!.name);
    }).toPass({ timeout: 30_000 });
    const stillThere = await db().product.findUnique({
      where: { id: product.productId },
      select: { id: true, isActive: true, deletedAt: true },
    });
    expect(stillThere).not.toBeNull();
    expect(stillThere!.isActive).toBe(false);
    expect(stillThere!.deletedAt).toBeNull();
    record(
      "c2-pdp-404-db-intact",
      true,
      "PDP sin el producto; fila intacta (isActive=false, deletedAt=null)",
      await shot(anonPage, "c2-hidden"),
    );
    writeEvidence("pass");
  } catch (err) {
    writeEvidence("fail", err);
    throw err;
  } finally {
    if (product) await deleteEphemeralProduct(product);
  }
});

/* ═══ Cruz 3 — Aprobar reseña pendiente → visible en la PDP ═══ */

test("cruz 3: admin aprueba reseña pendiente → la PDP la muestra", async ({
  adminPage,
  anonPage,
}, testInfo) => {
  projectName = testInfo.project.name;
  resultsPath = resolve(EVIDENCE_DIR, `results-${E2E_ENV}-${projectName}-${run}.json`);
  // Producto real (solo se le ADJUNTA una reseña de prueba, que se borra).
  const product = await db().product.findFirst({
    where: { isActive: true, deletedAt: null },
    select: { id: true, slug: true },
    orderBy: { createdAt: "asc" },
  });
  expect(product).not.toBeNull();

  const comment = `Homologación ${run}: calidad y empaque verificados en prueba E2E.`;
  const review = await db().review.create({
    data: {
      productId: product!.id,
      authorName: customer.name,
      rating: 5,
      comment,
      isApproved: false,
    },
    select: { id: true },
  });

  try {
    // Pendiente: la PDP no la muestra.
    await anonPage.goto(`/producto/${product!.slug}`, { waitUntil: "domcontentloaded" });
    await expect(anonPage.locator("body")).not.toContainText(comment);
    record("c3-pending-hidden", true, "la reseña pendiente no se muestra en la PDP");

    // Admin: aprobar la reseña con el texto del run (la lista es una TABLA en
    // desktop y TARJETAS en mobile — el DOM sigue siendo tr/td).
    await adminPage.goto("/admin/resenas?status=pending", { waitUntil: "domcontentloaded" });
    const row = adminPage.locator("tr", { hasText: run }).first();
    await expect(row).toBeVisible({ timeout: 20_000 });
    await row.getByRole("button", { name: /aprobar/i }).click();
    // La señal de éxito es la DB (en mobile el redirect ?approved=1 puede
    // perderse tras la re-render de las tarjetas).
    await expect(async () => {
      const r = await db().review.findUnique({
        where: { id: review.id },
        select: { isApproved: true },
      });
      expect(r!.isApproved, "isApproved persistido").toBe(true);
    }).toPass({ timeout: 30_000 });
    record("c3-admin-approved", true, "aprobada desde /admin/resenas (isApproved en DB)");

    // La PDP la muestra con autor y texto.
    await expect(async () => {
      await anonPage.goto(`/producto/${product!.slug}`, { waitUntil: "domcontentloaded" });
      await expect(anonPage.locator("body")).toContainText(comment);
      await expect(anonPage.locator("body")).toContainText(customer.name);
    }).toPass({ timeout: 30_000 });
    record("c3-pdp-shows-review", true, undefined, await shot(anonPage, "c3-review-visible"));
    writeEvidence("pass");
  } catch (err) {
    writeEvidence("fail", err);
    throw err;
  } finally {
    await db()
      .review.delete({ where: { id: review.id } })
      .catch(() => {});
  }
});

/* ═══ Cruz 4 — Marcar leída una notificación QUOTE → pill del nav desaparece ═══ */

test("cruz 4: admin marca leída una notificación QUOTE → la pill de no leídas baja", async ({
  adminPage,
}, testInfo) => {
  projectName = testInfo.project.name;
  resultsPath = resolve(EVIDENCE_DIR, `results-${E2E_ENV}-${projectName}-${run}.json`);
  // Semilla: una notificación QUOTE no leída (mismo shape que notify() de quotes).
  const seed = await db().notification.create({
    data: {
      type: "QUOTE",
      severity: "info",
      title: `Nueva cotización COT-TEST — Cliente Prueba ${run}`,
      detail: `Total: $199 · 1 item(s) · WhatsApp: ${customer.whatsapp}`,
      actionUrl: "/admin/cotizaciones",
      actionLabel: "Ver cotización",
      dedupKey: run,
    },
    select: { id: true },
  });
  const pill = adminPage.locator('span[aria-label*="notificaciones sin leer"]:visible');

  // En mobile la pill vive dentro del drawer (hamburguesa) — hay que abrirlo
  // para que sea visible. En desktop el sidebar está siempre visible.
  const openNavIfMobile = async () => {
    const hamburger = adminPage.getByRole("button", { name: /abrir menú/i });
    if (await hamburger.isVisible().catch(() => false)) await hamburger.click();
  };
  // El drawer abierto TAPA el contenido de la página: hay que cerrarlo antes
  // de interactuar con la lista (su X tiene aria-label "Cerrar").
  const closeNavIfMobile = async () => {
    const close = adminPage.getByRole("button", { name: "Cerrar", exact: true });
    if (await close.isVisible().catch(() => false)) await close.click();
  };

  try {
    // La pill del nav marca no leídas (el grupo "Analítica" abre solo al estar
    // en /admin/notificaciones — defaultOpen ?? hasActive en admin-shell).
    await adminPage.goto("/admin/notificaciones", { waitUntil: "domcontentloaded" });
    await openNavIfMobile();
    await expect(pill).toBeVisible({ timeout: 15_000 });
    const before = await pill.innerText();
    record("c4-pill-before", true, `pill visible con conteo "${before}"`);
    await closeNavIfMobile();

    // Marcar leída desde el centro de notificaciones.
    const row = adminPage.locator("li", { hasText: run }).first();
    await expect(row).toBeVisible({ timeout: 20_000 });
    await row.getByRole("button", { name: /marcar leída/i }).click();
    await expect(async () => {
      const n = await db().notification.findUnique({
        where: { id: seed.id },
        select: { readAt: true },
      });
      expect(n!.readAt, "readAt persistido").not.toBeNull();
    }).toPass({ timeout: 30_000 });

    // La pill baja: sin otras no leídas, desaparece del nav; si hay ajenas,
    // muestra exactamente ese conteo (verificado contra DB, no contra UI).
    const unread = await db().notification.count({ where: { readAt: null } });
    await adminPage.goto("/admin/notificaciones", { waitUntil: "domcontentloaded" });
    await openNavIfMobile();
    if (unread === 0) {
      await expect(pill).toHaveCount(0);
      record(
        "c4-pill-gone",
        true,
        "0 no leídas → pill desaparece",
        await shot(adminPage, "c4-pill"),
      );
    } else {
      await expect(pill).toContainText(String(unread));
      record(
        "c4-pill-decrement",
        true,
        `quedan ${unread} no leídas ajenas → pill muestra ${unread}`,
        await shot(adminPage, "c4-pill"),
      );
    }
    writeEvidence("pass");
  } catch (err) {
    writeEvidence("fail", err);
    throw err;
  } finally {
    await db()
      .notification.delete({ where: { id: seed.id } })
      .catch(() => {});
  }
});
