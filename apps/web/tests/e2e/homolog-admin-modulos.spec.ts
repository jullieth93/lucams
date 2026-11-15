/*
 * HOMOLOGACIÓN E2E — Capa ADMIN §7 (módulos no cubiertos por la matriz §6):
 * notificaciones (filtros/deep link/marcar todas), observability y RBAC.
 * El resto de §7 ya está
 * certificado: auth+MFA (admin-login/admin-mfa), contenido CMS
 * (homolog-admin-cms), cruces §5.3 (homolog-admin-cruces: toggle COD,
 * desactivar producto, aprobar reseña, marcar leída), inventario
 * (homolog-back-in-stock) y mobile admin integral (mobile-admin-audit).
 *
 * Corre en LOCAL y STG × desktop/mobile; requiere E2E_AUTH=1 (storageState
 * del admin efímero SUPERADMIN del setup). En PRD skip (crea y muta datos de
 * prueba). Las oportunidades B2B y sus contactos se limpian al terminar.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { createClient } from "@supabase/supabase-js";
import { baseUrlFor, extraHeadersFor, strip } from "./_setup/env";
import { E2E_ENV, expect, test } from "./fixtures/auth";
import { db, disconnectDb } from "./fixtures/db";
import { newRunId } from "./fixtures/run";
import { fakeCustomer } from "./fixtures/data-factory";
import { enrollTotpFactor, loginAdminWithTotp } from "./_helpers/mfa";

const EVIDENCE_DIR = resolve(__dirname, "../../tmp/e2e-homologacion");

test.skip(E2E_ENV === "prd", "La capa §7 crea/muta datos de prueba: prohibido en PRD.");

const run = newRunId("admin7");
const customer = fakeCustomer(run);
let opportunityId = "";
let opportunityNumber = "";
let opportunityContactId = "";
let managerAuthId = "";
let managerRowId = "";
const MANAGER_EMAIL = `${run}-mgr@e2e.test`;
const MANAGER_PASSWORD = "E2E-Manager-918273650";

type Step = { step: string; ok: boolean; detail?: string; screenshot?: string; at: string };
const steps: Step[] = [];
let projectName = "";
let resultsPath = "";
const record = (step: string, ok: boolean, detail?: string, screenshot?: string) =>
  steps.push({ step, ok, detail, screenshot, at: new Date().toISOString() });
function writeEvidence(status: "pass" | "fail", error?: unknown) {
  mkdirSync(EVIDENCE_DIR, { recursive: true });
  writeFileSync(
    resultsPath,
    JSON.stringify(
      {
        spec: "homolog-admin-modulos",
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
  if (opportunityContactId) {
    await db()
      .contact.deleteMany({ where: { id: opportunityContactId } })
      .catch(() => {});
  }
  await db()
    .notification.deleteMany({ where: { title: { contains: "Prueba" } } })
    .catch(() => {});
  // Admin MANAGER efímero del test RBAC (auth.users + AdminUser).
  if (managerRowId) {
    await db()
      .adminUser.deleteMany({ where: { id: managerRowId } })
      .catch(() => {});
  }
  if (
    managerAuthId &&
    strip(process.env.NEXT_PUBLIC_SUPABASE_URL) &&
    strip(process.env.SUPABASE_SECRET_KEY)
  ) {
    try {
      const service = createClient(
        strip(process.env.NEXT_PUBLIC_SUPABASE_URL)!,
        strip(process.env.SUPABASE_SECRET_KEY)!,
        { auth: { autoRefreshToken: false, persistSession: false } },
      );
      await service.auth.admin.deleteUser(managerAuthId).catch(() => {});
    } catch {
      /* limpieza best-effort */
    }
  }
  await disconnectDb();
});

/* ═══ §7.4 — Notificaciones: filtros, deep link, marcar todas ═══ */

test("§7.4 notificaciones: filtro ORDER · deep link B2B · marcar todas → pill baja", async ({
  adminPage,
}, testInfo) => {
  test.setTimeout(180_000);
  projectName = testInfo.project.name;
  resultsPath = resolve(
    EVIDENCE_DIR,
    `results-${E2E_ENV}-${projectName}-${run}-notificaciones.json`,
  );

  try {
    const contact = await db().contact.create({
      data: {
        primaryEmail: customer.email,
        displayName: customer.name,
        source: "B2B_INQUIRY",
      },
      select: { id: true },
    });
    opportunityContactId = contact.id;
    const opportunity = await db().opportunity.create({
      data: {
        number: `OP-${run}`,
        contactId: contact.id,
        title: `Evento empresarial ${run}`,
        expectedUnits: 100,
      },
      select: { id: true, number: true },
    });
    opportunityId = opportunity.id;
    opportunityNumber = opportunity.number;
    await db().notification.create({
      data: {
        type: "ORDER",
        severity: "info",
        title: `Nueva oportunidad ${opportunityNumber} — ${customer.name} (100 uds.)`,
        detail: `Evento empresarial · Bogotá · WhatsApp: ${customer.whatsapp}`,
        actionUrl: `/admin/oportunidades/${opportunityId}`,
        actionLabel: "Ver oportunidad",
        dedupKey: `opportunity:${opportunityId}`,
      },
    });

    let notif: { id: string; title: string; actionUrl: string | null } | null = null;
    await expect(async () => {
      notif = await db().notification.findFirstOrThrow({
        where: { title: { contains: opportunityNumber } },
        orderBy: { createdAt: "desc" },
        select: { id: true, title: true, actionUrl: true },
      });
    }).toPass({ timeout: 20_000 });
    expect(notif!.actionUrl).toBe(`/admin/oportunidades/${opportunityId}`);

    await adminPage.goto("/admin/notificaciones?view=all&type=ORDER", {
      waitUntil: "domcontentloaded",
    });
    await expect(
      adminPage.getByText(new RegExp(opportunityNumber)).first(),
      "la notificación ORDER del RUN aparece con el filtro",
    ).toBeVisible({ timeout: 30_000 });
    record("filtro-order", true, `?view=all&type=ORDER muestra "${notif!.title.slice(0, 60)}…"`);

    await adminPage
      .getByRole("link", { name: /ver oportunidad/i })
      .first()
      .click();
    await expect(adminPage).toHaveURL(new RegExp(`/admin/oportunidades/${opportunityId}`), {
      timeout: 20_000,
    });
    await expect(adminPage.getByText(opportunityNumber).first()).toBeVisible({ timeout: 20_000 });
    record("deep-link", true, `actionUrl → /admin/oportunidades/${opportunityId}`);

    await adminPage.goto("/admin/notificaciones", { waitUntil: "domcontentloaded" });
    await adminPage.getByRole("button", { name: /marcar todas como leídas/i }).click();
    const clickedAt = new Date();
    await expect(async () => {
      const unread = await db().notification.count({
        where: { readAt: null, createdAt: { lte: clickedAt } },
      });
      expect(unread, "toda notificación previa al click quedó leída").toBe(0);
    }).toPass({ timeout: 20_000 });
    const hamburger = adminPage.getByRole("button", { name: /abrir menú/i });
    if (await hamburger.isVisible().catch(() => false)) await hamburger.click();
    const pill = adminPage.locator('span[aria-label*="notificaciones sin leer"]:visible');
    await expect(pill, "la pill de no leídas desaparece del nav").toHaveCount(0, {
      timeout: 15_000,
    });
    record(
      "marcar-todas-pill-0",
      true,
      "todas las previas al click leídas en DB + pill ausente del nav",
    );

    writeEvidence("pass");
  } catch (err) {
    writeEvidence("fail", err);
    throw err;
  }
});

/* ═══ §7.6 — Observability ═══ */

test("§7.6 observability: salud técnica carga + sección de crons + /api/health/crons fiel a la DB", async ({
  adminPage,
  request,
}, testInfo) => {
  test.setTimeout(120_000);
  projectName = testInfo.project.name;
  resultsPath = resolve(
    EVIDENCE_DIR,
    `results-${E2E_ENV}-${projectName}-${run}-observability.json`,
  );

  try {
    await adminPage.goto("/admin/observability", { waitUntil: "domcontentloaded" });
    // La página colapsa el bloque técnico en un <details> ("Detalle técnico
    // (para soporte)") — los h2 de Salud técnica/crons son "hidden" hasta
    // abrirlo (fallo reproducido 2026-08-07 en ambos proyectos).
    await adminPage.getByText(/detalle técnico/i).click();
    await expect(
      adminPage.getByRole("heading", { name: /salud técnica/i }).first(),
      "encabezado de salud técnica",
    ).toBeVisible({ timeout: 30_000 });
    await expect(
      adminPage.getByRole("heading", { name: /trabajos automáticos/i }).first(),
      "sección de crons",
    ).toBeVisible({ timeout: 30_000 });
    // Nunca el error boundary de marca ni pantalla en blanco.
    await expect(adminPage.getByText(/algo salió mal/i)).toHaveCount(0);
    record("pagina-carga", true, "Salud técnica + Trabajos automáticos (crons) visibles");

    // Contrato real del endpoint (route.ts): 200↔"ok", 503↔"degraded" —
    // el estado es del AMBIENTE (en LOCAL el stack recién levantado deja
    // heartbeats vencidos y el 503 es la verdad, no un fallo). Lo certificable:
    // el payload es FIEL a AlertState (cron:<job>.lastSentAt) en la DB.
    // Auditoría 2026-08-24 (C-4): el detalle (jobs/overdue/disabled) exige el
    // header x-cron-secret; sin secreto la respuesta pública es MÍNIMA.
    const pub = await request.get("/api/health/crons");
    expect([200, 503], "200 ok ó 503 degraded (público)").toContain(pub.status());
    const pubBody = (await pub.json()) as Record<string, unknown>;
    expect(pubBody.status).toBe(pub.status() === 200 ? "ok" : "degraded");
    expect(pubBody, "sin secreto no hay detalle de jobs").not.toHaveProperty("jobs");

    const cronSecret = (process.env.CRON_SECRET ?? "").trim();
    const res = await request.get("/api/health/crons", {
      headers: { "x-cron-secret": cronSecret },
    });
    expect([200, 503], "200 ok ó 503 degraded").toContain(res.status());
    const body = (await res.json()) as {
      status: string;
      overdue: { job: string; lastRunAt: string | null }[];
      jobs: { job: string; lastRunAt: string | null }[];
    };
    expect(res.status() === 200 ? "ok" : "degraded").toBe(body.status);
    const rows = await db().alertState.findMany({
      where: { key: { startsWith: "cron:" } },
      select: { key: true, lastSentAt: true },
    });
    const truth = new Map(rows.map((r) => [r.key.slice(5), r.lastSentAt]));
    for (const j of body.jobs) {
      const dbLast = truth.get(j.job) ?? null;
      const payloadLast = j.lastRunAt ? new Date(j.lastRunAt).toISOString() : null;
      expect(payloadLast, `lastRunAt de ${j.job} debe ser el de la DB`).toBe(
        dbLast ? dbLast.toISOString() : null,
      );
    }
    record(
      "health-crons",
      true,
      `HTTP ${res.status()} · status=${body.status} · overdue=[${body.overdue.map((o) => o.job).join(",")}] · payload fiel a AlertState`,
    );

    writeEvidence("pass");
  } catch (err) {
    writeEvidence("fail", err);
    throw err;
  }
});

/* ═══ §7.7 — RBAC: deny-by-default para rol no-SUPER ═══ */

test("§7.7 RBAC: MANAGER no entra a finanzas (redirect) ni ve el nav item, sí entra a oportunidades", async ({
  browser,
}, testInfo) => {
  test.setTimeout(180_000);
  projectName = testInfo.project.name;
  resultsPath = resolve(EVIDENCE_DIR, `results-${E2E_ENV}-${projectName}-${run}-rbac.json`);

  try {
    // Admin efímero con rol MANAGER (service role del ambiente — mismo patrón
    // que el global.setup; auto-contenido: se borra en afterAll).
    const service = createClient(
      strip(process.env.NEXT_PUBLIC_SUPABASE_URL)!,
      strip(process.env.SUPABASE_SECRET_KEY)!,
      { auth: { autoRefreshToken: false, persistSession: false } },
    );
    const { data: authData, error } = await service.auth.admin.createUser({
      email: MANAGER_EMAIL,
      password: MANAGER_PASSWORD,
      email_confirm: true,
    });
    expect(error, "crear auth user MANAGER").toBeNull();
    managerAuthId = authData.user!.id;
    const mgr = await db().adminUser.create({
      data: {
        supabaseUserId: managerAuthId,
        email: MANAGER_EMAIL,
        role: "MANAGER",
        isActive: true,
      },
      select: { id: true },
    });
    managerRowId = mgr.id;
    // MFA obligatorio (B-1): el MANAGER efímero enrola TOTP, si no el login
    // caería en /admin/seguridad?enroll=required en vez del dashboard.
    const managerTotpSecret = await enrollTotpFactor(MANAGER_EMAIL, MANAGER_PASSWORD);

    const context = await browser.newContext({
      baseURL: baseUrlFor(E2E_ENV),
      extraHTTPHeaders: extraHeadersFor(E2E_ENV),
      ignoreHTTPSErrors: true,
    });
    const page = await context.newPage();
    try {
      // Login por UI (MANAGER → reto TOTP → home /admin/dashboard).
      await loginAdminWithTotp(page, {
        email: MANAGER_EMAIL,
        password: MANAGER_PASSWORD,
        totpSecret: managerTotpSecret,
      });
      record("manager-login", true, "login MANAGER (con reto TOTP) → /admin/dashboard");

      // Módulo restringido (finanzas = SUPERADMIN only) → redirect al home del rol.
      await page.goto("/admin/finanzas", { waitUntil: "domcontentloaded" });
      await expect(page).toHaveURL(/\/admin\/dashboard/, { timeout: 20_000 });
      await expect(page.getByText(/conciliación|finanzas/i).first()).not.toBeVisible();
      // El nav tampoco lo ofrece (filterNavByRole).
      await expect(
        page.getByRole("link", { name: /finanzas/i }),
        "el nav no muestra Finanzas a MANAGER",
      ).toHaveCount(0);
      record(
        "finanzas-denegado",
        true,
        "/admin/finanzas → redirect /admin/dashboard + sin nav item",
      );

      // Módulo permitido (Oportunidades B2B = MANAGER_UP) → carga.
      await page.goto("/admin/oportunidades", { waitUntil: "domcontentloaded" });
      await expect(page).toHaveURL(/\/admin\/oportunidades/, { timeout: 20_000 });
      await expect(
        page.getByRole("heading", { name: /oportunidades/i }).first(),
        "oportunidades carga para MANAGER",
      ).toBeVisible({ timeout: 20_000 });
      record("oportunidades-permitido", true, "MANAGER sí carga /admin/oportunidades");
    } finally {
      await context.close();
    }

    writeEvidence("pass");
  } catch (err) {
    writeEvidence("fail", err);
    throw err;
  }
});
