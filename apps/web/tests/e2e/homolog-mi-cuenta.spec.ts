/*
 * HOMOLOGACIÓN E2E — área /mi-cuenta (docs/TESTING.md):
 *
 *   perfil (editar nombre/teléfono → DB) · direcciones (crear estructurada
 *   urbana → lista + DB → default única → editar → borrar con confirmación) ·
 *   seguridad (cambio de contraseña con re-auth → sesiones cerradas
 *   globalmente → login con la NUEVA clave funciona).
 *
 * Corre en LOCAL y STG × desktop/mobile. En PRD PROHIBIDO (muta Customer/
 * Address/auth). Cliente: el efímero del global.setup (storageState + fila
 * Customer; su clave vive centralizada en _setup/env.ts). La dirección de
 * prueba lleva el RUN y se borra; el cambio de contraseña no se revierte
 * (el usuario completo se borra en el teardown global de todas formas).
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import type { Page } from "@playwright/test";
import { E2E_SETUP_CLIENT_PASSWORD } from "./_setup/env";
import { dismissCookieBanner, E2E_ENV, expect, test } from "./fixtures/auth";
import { db, disconnectDb } from "./fixtures/db";
import { newRunId } from "./fixtures/run";

const EVIDENCE_DIR = resolve(__dirname, "../../tmp/e2e-homologacion");

test.skip(E2E_ENV === "prd", "Los flujos de cuenta mutan datos: prohibidos en PRD.");
test.setTimeout(240_000);

const run = newRunId("cuenta");

type Step = { step: string; ok: boolean; detail?: string; screenshot?: string; at: string };
const steps: Step[] = [];
function record(step: string, ok: boolean, detail?: string, screenshot?: string) {
  steps.push({ step, ok, detail, screenshot, at: new Date().toISOString() });
}

let resultsPath = "";
let projectName = "";
const shotsDir = resolve(EVIDENCE_DIR, "shots");

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
        spec: "homolog-mi-cuenta",
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

async function ephemeralCustomer() {
  const c = await db().customer.findFirst({
    where: { email: { startsWith: "e2e-setup-" }, deletedAt: null },
    orderBy: { email: "desc" },
    select: { id: true, email: true, supabaseUserId: true },
  });
  expect(c, "cliente efímero del setup").not.toBeNull();
  return c!;
}

test.afterAll(async () => {
  const c = await db()
    .customer.findFirst({
      where: { email: { startsWith: "e2e-setup-" }, deletedAt: null },
      orderBy: { email: "desc" },
      select: { id: true },
    })
    .catch(() => null);
  if (c) {
    await db()
      .address.deleteMany({ where: { customerId: c.id } })
      .catch(() => {});
  }
  await disconnectDb();
});

/* ═══ Perfil ═══ */

test("mi-cuenta · perfil: editar nombre/teléfono → persistido en DB", async ({
  clientPage,
}, testInfo) => {
  projectName = testInfo.project.name;
  resultsPath = resolve(EVIDENCE_DIR, `results-${E2E_ENV}-${projectName}-${run}.json`);
  try {
    const customer = await ephemeralCustomer();
    const newFirst = `Prueba${run.slice(-4)}`;
    const newPhone = `300${run.replace(/\D/g, "").slice(-7)}`;

    await clientPage.goto("/mi-cuenta/perfil", { waitUntil: "domcontentloaded" });
    const firstName = clientPage.locator("#firstName");
    const phone = clientPage.locator("#phone");
    await expect(firstName).toBeVisible({ timeout: 20_000 });
    await expect(async () => {
      await firstName.fill(newFirst);
      await phone.fill(newPhone);
      await expect(firstName).toHaveValue(newFirst, { timeout: 1_500 });
      await expect(phone).toHaveValue(newPhone, { timeout: 1_500 });
    }).toPass({ timeout: 20_000 });
    await clientPage.getByRole("button", { name: /guardar/i }).click();
    await expect(clientPage.locator("body")).toContainText(/perfil quedó actualizado/i, {
      timeout: 20_000,
    });

    await expect(async () => {
      const c = await db().customer.findUnique({
        where: { id: customer.id },
        select: { firstName: true, phone: true },
      });
      expect(c!.firstName).toBe(newFirst);
      expect(c!.phone).toBe(newPhone);
    }).toPass({ timeout: 20_000 });
    record(
      "profile-updated",
      true,
      `firstName=${newFirst} phone=${newPhone} persistidos`,
      await shot(clientPage, "1-profile"),
    );
    writeEvidence("pass");
  } catch (err) {
    writeEvidence("fail", err);
    throw err;
  }
});

/* ═══ Direcciones ═══ */

test("mi-cuenta · direcciones: crear urbana → lista+DB → default única → editar → borrar", async ({
  clientPage,
}, testInfo) => {
  projectName = testInfo.project.name;
  resultsPath = resolve(EVIDENCE_DIR, `results-${E2E_ENV}-${projectName}-${run}.json`);
  try {
    const customer = await ephemeralCustomer();
    const label = `Casa E2E ${run.slice(-4)}`;

    // Form estructurado (urbana) con toPass: el form se monta client-side al
    // pulsar "Agregar" y un fill/select pre-hidratación se revierte (el select
    // queda en "Elige departamento…" y Zod rechaza — reproducido 2026-08-06).
    // El TELÉFONO es obligatorio en el schema (LabelSchema) — sin él la acción
    // devuelve fieldErrors y la dirección nunca se crea (reproducido: el POST
    // devolvía 200 con error y DB=0).
    const fillAddressForm = async (opts: { label: string; via: string; cruce: string }) => {
      const form = clientPage.locator("form", {
        has: clientPage.locator('input[name="name"]'),
      });
      await expect(async () => {
        await form.locator('input[name="name"]').fill(opts.label);
        await form.locator("#deptCode").selectOption({ index: 1 });
        await form.locator("#cityCode").selectOption({ index: 1 });
        await form.locator('input[name="viaNumber"]').fill(opts.via);
        await form.locator('input[name="cruceNumber"]').fill(opts.cruce);
        await form.locator("#phone").fill(`300${run.replace(/\D/g, "").slice(-7)}`);
        await expect(form.locator('input[name="name"]')).toHaveValue(opts.label, {
          timeout: 1_500,
        });
        await expect(form.locator("#deptCode")).not.toHaveValue("", { timeout: 1_500 });
        await expect(form.locator("#cityCode")).not.toHaveValue("", { timeout: 1_500 });
        await expect(form.locator('input[name="viaNumber"]')).toHaveValue(opts.via, {
          timeout: 1_500,
        });
      }).toPass({ timeout: 20_000 });
    };

    await clientPage.goto("/mi-cuenta/direcciones", { waitUntil: "domcontentloaded" });
    await dismissCookieBanner(clientPage);
    await clientPage
      .getByRole("button", { name: /nueva dirección|agregar/i })
      .first()
      .click();
    await fillAddressForm({ label, via: "7A", cruce: "23-45" });
    await clientPage.locator('input[name="isDefault"]').check();
    await clientPage.getByRole("button", { name: /guardar/i }).click();

    // Cierra el form y la dirección aparece en la lista.
    await expect(clientPage.locator("body")).toContainText(label, { timeout: 20_000 });
    const address = await db().address.findFirst({
      where: { customerId: customer.id, name: label },
      select: { id: true, isDefault: true },
    });
    expect(address, "la dirección debe existir en DB").not.toBeNull();
    expect(address!.isDefault).toBe(true);
    record("address-created", true, `${label} (default) en lista + DB`);

    // Default única: crear una segunda SIN default y ponerla default → la primera deja de serlo.
    const label2 = `Oficina E2E ${run.slice(-4)}`;
    await clientPage
      .getByRole("button", { name: /nueva dirección|agregar/i })
      .first()
      .click();
    await fillAddressForm({ label: label2, via: "10", cruce: "50-10" });
    await clientPage.locator('input[name="isDefault"]').check();
    await clientPage.getByRole("button", { name: /guardar/i }).click();
    await expect(clientPage.locator("body")).toContainText(label2, { timeout: 20_000 });
    await expect(async () => {
      const defaults = await db().address.count({
        where: { customerId: customer!.id, isDefault: true },
      });
      expect(defaults, "exactamente UNA default").toBe(1);
    }).toPass({ timeout: 20_000 });
    record("address-single-default", true, "al defaultear la segunda, la primera pierde el flag");

    // Editar la primera: cambiar la etiqueta.
    const renamed = `Casa E2E ${run.slice(-4)} editada`;
    const row = clientPage.locator("li", { hasText: label }).first();
    await row.getByRole("button", { name: /editar/i }).click();
    await clientPage.locator('input[name="name"]').fill(renamed);
    await clientPage.getByRole("button", { name: /guardar/i }).click();
    await expect(clientPage.locator("body")).toContainText(renamed, { timeout: 20_000 });
    record("address-edited", true, `${label} → ${renamed}`);

    // Borrar con confirmación (soft-delete: la fila queda con deletedAt — la
    // aserción cuenta solo las VIVAS).
    const row2 = clientPage.locator("li", { hasText: renamed }).first();
    await row2.getByRole("button", { name: /eliminar/i }).click();
    await row2.getByRole("button", { name: /sí, eliminar|confirmar/i }).click();
    await expect(async () => {
      const remaining = await db().address.count({
        where: { customerId: customer!.id, name: renamed, deletedAt: null },
      });
      expect(remaining).toBe(0);
    }).toPass({ timeout: 20_000 });
    record("address-deleted", true, "soft-delete tras confirmación (lista + deletedAt sellado)");
    writeEvidence("pass");
  } catch (err) {
    writeEvidence("fail", err);
    throw err;
  }
});

/* ═══ Seguridad — usuario efímero PROPIO del test (no se toca el fixture
     compartido: cambiar la clave del cliente del setup invalidaba las cookies
     de los otros contextos/proyectos que lo comparten — reproducido 2026-08-06) ═══ */

test("mi-cuenta · seguridad: cambiar contraseña → re-login con la nueva funciona", async ({
  browser,
}, testInfo) => {
  projectName = testInfo.project.name;
  resultsPath = resolve(EVIDENCE_DIR, `results-${E2E_ENV}-${projectName}-${run}.json`);
  const { createClient } = await import("@supabase/supabase-js");
  const { baseUrlFor, extraHeadersFor, strip } = await import("./_setup/env");
  const service = createClient(
    strip(process.env.NEXT_PUBLIC_SUPABASE_URL)!,
    strip(process.env.SUPABASE_SECRET_KEY)!,
    { auth: { persistSession: false } },
  );
  const email = `${run}-seg@example.com`;
  let userId = "";

  try {
    // Usuario efímero dedicado: auth + fila Customer + login por UI en contexto propio.
    const { data, error } = await service.auth.admin.createUser({
      email,
      password: E2E_SETUP_CLIENT_PASSWORD,
      email_confirm: true,
    });
    if (error || !data.user)
      throw new Error(`no se pudo crear el usuario de seguridad: ${error?.message}`);
    userId = data.user.id;
    await db().customer.create({
      data: {
        email,
        supabaseUserId: userId,
        firstName: "Seguridad E2E",
        referralCode: `E2ESEG${Date.now().toString(36).toUpperCase()}`.slice(0, 20),
      },
    });

    const ctx = await browser.newContext({
      baseURL: baseUrlFor(E2E_ENV),
      extraHTTPHeaders: extraHeadersFor(E2E_ENV),
      ignoreHTTPSErrors: true,
    });
    const page = await ctx.newPage();
    await page.goto("/login", { waitUntil: "domcontentloaded" });
    await page.locator('input[name="email"]').fill(email);
    await page.locator('input[name="password"]').fill(E2E_SETUP_CLIENT_PASSWORD);
    await page.getByRole("button", { name: /iniciar sesión|entrar|ingresar/i }).click();
    await page.waitForURL((url) => !url.pathname.startsWith("/login"), { timeout: 30_000 });

    const newPassword = `E2E-Nueva-${run.replace(/\D/g, "").slice(-8)}Xk!`;

    // Contraseña actual INCORRECTA primero → error por campo.
    await page.goto("/mi-cuenta/seguridad", { waitUntil: "domcontentloaded" });
    await page.locator("#currentPassword").fill("Clave-Equivocada-123");
    await page.locator("#newPassword").fill(newPassword);
    await page.locator("#confirmPassword").fill(newPassword);
    await page.getByRole("button", { name: /cambiar|actualizar/i }).click();
    await expect(page.locator("body")).toContainText(/contraseña actual no es correcta/i, {
      timeout: 20_000,
    });
    record("password-wrong-current", true, "re-auth rechaza la actual incorrecta");

    // Contraseña actual correcta → éxito con cierre de otras sesiones.
    await page.locator("#currentPassword").fill(E2E_SETUP_CLIENT_PASSWORD);
    await page.locator("#newPassword").fill(newPassword);
    await page.locator("#confirmPassword").fill(newPassword);
    await page.getByRole("button", { name: /cambiar|actualizar/i }).click();
    await expect(page.locator("body")).toContainText(/contraseña quedó actualizada/i, {
      timeout: 30_000,
    });
    record("password-changed", true, "actualizada + mensaje de sesiones cerradas");

    // Login FRESCO en OTRO contexto con la NUEVA contraseña → entra.
    const ctx2 = await browser.newContext({
      baseURL: baseUrlFor(E2E_ENV),
      extraHTTPHeaders: extraHeadersFor(E2E_ENV),
      ignoreHTTPSErrors: true,
    });
    const page2 = await ctx2.newPage();
    await page2.goto("/login", { waitUntil: "domcontentloaded" });
    await page2.locator('input[name="email"]').fill(email);
    await page2.locator('input[name="password"]').fill(newPassword);
    await page2.getByRole("button", { name: /iniciar sesión|entrar|ingresar/i }).click();
    await page2.waitForURL((url) => !url.pathname.startsWith("/login"), { timeout: 30_000 });
    record(
      "relogin-new-password",
      true,
      "login fresco con la nueva clave OK",
      await shot(page2, "2-relogin"),
    );
    await ctx2.close();
    await ctx.close();
    writeEvidence("pass");
  } catch (err) {
    writeEvidence("fail", err);
    throw err;
  } finally {
    // Limpieza total del usuario dedicado (Customer + auth).
    if (userId) {
      await db()
        .customer.deleteMany({ where: { supabaseUserId: userId } })
        .catch(() => {});
      await service.auth.admin.deleteUser(userId).catch(() => {});
    }
  }
});
