/*
 * HOMOLOGACIÓN E2E — Capa ADMIN §7 (módulos no cubiertos por la matriz §6):
 * cotizaciones (detalle/cambio de estado/WhatsApp), notificaciones (filtros/
 * deep link/marcar todas), observability y RBAC. El resto de §7 ya está
 * certificado: auth+MFA (admin-login/admin-mfa), contenido CMS
 * (homolog-admin-cms), cruces §5.3 (homolog-admin-cruces: toggle COD,
 * desactivar producto, aprobar reseña, marcar leída), inventario
 * (homolog-back-in-stock) y mobile admin integral (mobile-admin-audit).
 *
 * Corre en LOCAL y STG (modo catálogo — la capa admin es la misma en ambos
 * modos) × desktop/mobile; requiere E2E_AUTH=1 (storageState del admin
 * efímero SUPERADMIN del setup). En PRD skip (crea y muta datos de prueba).
 *
 * Flujo §7.2: una cotización REAL creada por UI (anónimo) → el admin la ve en
 * la lista → detalle → link wa.me/57<phone> del cliente → "Marcar contactada"
 * (con confirm() nativo) → success en UI + status CONTACTED en DB +
 * AdminActionLog escrito (entityId = quote.id). La cotización es efímera del
 * RUN: se soft-borra en afterAll (patrón del repo); la notificación QUOTE se
 * borra; el Consent queda (ledger legal). En STG cada corrida envía 1 email
 * real al admin (canal de venta activo en previews — esperado y documentado).
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { createClient } from "@supabase/supabase-js";
import { baseUrlFor, extraHeadersFor, strip } from "./_setup/env";
import { E2E_ENV, dismissCookieBanner, expect, test } from "./fixtures/auth";
import { db, disconnectDb } from "./fixtures/db";
import { newRunId } from "./fixtures/run";
import {
  createEphemeralProduct,
  deleteEphemeralProductsByTag,
  fakeCustomer,
  type EphemeralProduct,
} from "./fixtures/data-factory";
import { PdpPage } from "./pages/pdp";
import { CarritoPage } from "./pages/carrito";
import { CotizacionPage } from "./pages/cotizacion";
import { enrollTotpFactor, loginAdminWithTotp } from "./_helpers/mfa";

const EVIDENCE_DIR = resolve(__dirname, "../../tmp/e2e-homologacion");

test.skip(E2E_ENV === "prd", "La capa §7 crea/muta datos de prueba: prohibido en PRD.");

const run = newRunId("admin7");
const customer = fakeCustomer(run);
let product: EphemeralProduct | null = null;
let quoteId = "";
let quoteNumber = "";
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
  // Cotización efímera: soft-delete (patrón homolog-cotizacion).
  if (quoteId) {
    await db()
      .quote.update({ where: { id: quoteId }, data: { deletedAt: new Date() } })
      .catch(() => {});
    await db()
      .adminActionLog.deleteMany({ where: { entityId: quoteId } })
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
  // Barrido por tag: cubre los retries (cada intento crea su producto y
  // el último proceso solo ve el suyo — fuga reproducida 2026-08-07).
  await deleteEphemeralProductsByTag("e2e-admin7");
  for (const scope of ["quote"]) {
    await db()
      .$executeRawUnsafe(`DELETE FROM rate_limit_buckets WHERE key LIKE '${scope}:%'`)
      .catch(() => {});
  }
  await disconnectDb();
});

/* ═══ §7.2 — Cotizaciones admin: lista → detalle → WhatsApp → cambio de estado ═══ */

test("§7.2 cotizaciones: cotización real aparece en admin · detalle con wa.me · cambio de estado con log", async ({
  anonPage,
  adminPage,
}, testInfo) => {
  test.setTimeout(300_000);
  projectName = testInfo.project.name;
  resultsPath = resolve(EVIDENCE_DIR, `results-${E2E_ENV}-${projectName}-${run}-cotizaciones.json`);

  try {
    // 1. El cliente crea una cotización REAL por UI (modo catálogo Etapa 1).
    product = await createEphemeralProduct(run);
    const pdp = new PdpPage(anonPage, product.slug);
    await pdp.goto();
    await dismissCookieBanner(anonPage);
    await pdp.addToCart();
    const carrito = new CarritoPage(anonPage);
    await carrito.expectItem(product.name);
    await carrito.quoteCta().click();
    const cotizacion = new CotizacionPage(anonPage);
    await cotizacion.expectLoaded();
    await cotizacion.fill({
      name: customer.name,
      whatsapp: customer.whatsapp,
      email: customer.email,
      notes: `Admin §7.2 ${run}`,
    });
    await cotizacion.submitAndWaitConfirmation();
    const quote = await db().quote.findFirstOrThrow({
      where: { customerWhatsapp: customer.whatsapp, deletedAt: null },
      orderBy: { createdAt: "desc" },
      select: { id: true, number: true, status: true },
    });
    quoteId = quote.id;
    quoteNumber = quote.number;
    record("quote-creada-por-ui", true, `${quote.number} PENDING (cliente anónimo)`);

    // 2. El admin la ve en la lista de cotizaciones.
    await adminPage.goto("/admin/cotizaciones", { waitUntil: "domcontentloaded" });
    await expect(
      adminPage.getByText(quoteNumber).first(),
      "la cotización del RUN aparece en la lista",
    ).toBeVisible({ timeout: 30_000 });
    record("admin-lista", true, `${quoteNumber} visible en /admin/cotizaciones`);

    // 3. Detalle: link de WhatsApp del cliente bien formado (wa.me/57<10 dígitos>).
    await adminPage.goto(`/admin/cotizaciones/${quoteId}`, { waitUntil: "domcontentloaded" });
    const waLink = adminPage.getByRole("link", { name: /abrir whatsapp/i }).first();
    await expect(waLink, "link 'Abrir WhatsApp' presente").toBeVisible({ timeout: 30_000 });
    const href = await waLink.getAttribute("href");
    expect(href, "wa.me con prefijo 57 + móvil de 10 dígitos").toContain(
      `wa.me/57${customer.whatsapp}`,
    );
    record("detalle-wa-link", true, `href=${href?.slice(0, 60)}…`);

    // 4. Cambio de estado PENDING → CONTACTED (confirm() nativo aceptado).
    adminPage.once("dialog", (d) => void d.accept());
    await adminPage.getByRole("button", { name: /marcar contactada/i }).click();
    await expect(
      adminPage.getByText(/cotización marcada como contactada/i),
      "feedback de éxito",
    ).toBeVisible({ timeout: 20_000 });
    await expect(async () => {
      const q = await db().quote.findUniqueOrThrow({
        where: { id: quoteId },
        select: { status: true },
      });
      expect(q.status).toBe("CONTACTED");
      const logs = await db().adminActionLog.count({ where: { entityId: quoteId } });
      expect(logs, "AdminActionLog escrito (§7.1)").toBeGreaterThanOrEqual(1);
    }).toPass({ timeout: 20_000 });
    record("estado-contactada-con-log", true, "UI success + DB CONTACTED + AdminActionLog ≥1");

    writeEvidence("pass");
  } catch (err) {
    writeEvidence("fail", err);
    throw err;
  }
});

/* ═══ §7.4 — Notificaciones: filtros, deep link, marcar todas ═══ */

test("§7.4 notificaciones: filtro QUOTE · deep link al detalle · marcar todas → pill baja", async ({
  adminPage,
}, testInfo) => {
  test.setTimeout(180_000);
  projectName = testInfo.project.name;
  resultsPath = resolve(
    EVIDENCE_DIR,
    `results-${E2E_ENV}-${projectName}-${run}-notificaciones.json`,
  );

  try {
    // Usa la cotización del test anterior; en un retry AISLADO (ese test no
    // re-corre) quoteId viene vacío → semilla directa en DB con el mismo shape
    // (patrón homolog-admin-cruces ④).
    if (!quoteId) {
      product ??= await createEphemeralProduct(run);
      const { createHash } = await import("node:crypto");
      const seeded = await db().quote.create({
        data: {
          number: `E2E-${run}`,
          customerName: customer.name,
          customerWhatsapp: customer.whatsapp,
          customerEmail: customer.email,
          city: "Bogotá",
          department: "Cundinamarca",
          subtotal: 19_900,
          total: 19_900,
          // F-11 — solo el hash sha256 del token se persiste (NOT NULL + unique).
          publicAccessTokenHash: createHash("sha256").update(`e2e-${run}`).digest("hex"),
          items: {
            create: [
              { productName: product.name, variantName: "Default", unitPrice: 19_900, quantity: 1 },
            ],
          },
        },
        select: { id: true, number: true },
      });
      quoteId = seeded.id;
      quoteNumber = seeded.number;
      await db().notification.create({
        data: {
          type: "QUOTE",
          severity: "info",
          title: `Nueva cotización ${quoteNumber} — ${customer.name} (Bogotá)`,
          detail: `Total: $199 · 1 item(s) · WhatsApp: ${customer.whatsapp}`,
          actionUrl: `/admin/cotizaciones/${quoteId}`,
          actionLabel: "Ver cotización",
          dedupKey: `quote:${quoteId}`,
        },
      });
    }
    // toPass: read-after-write del pooler — la fila puede tardar un instante.
    let notif: { id: string; title: string; actionUrl: string | null } | null = null;
    await expect(async () => {
      notif = await db().notification.findFirstOrThrow({
        where: { title: { contains: quoteNumber } },
        orderBy: { createdAt: "desc" },
        select: { id: true, title: true, actionUrl: true },
      });
    }).toPass({ timeout: 20_000 });
    expect(notif!.actionUrl).toBe(`/admin/cotizaciones/${quoteId}`);

    // 1. Filtro por tipo QUOTE (vista "Todas" para incluir leídas).
    await adminPage.goto("/admin/notificaciones?view=all&type=QUOTE", {
      waitUntil: "domcontentloaded",
    });
    await expect(
      adminPage.getByText(new RegExp(quoteNumber)).first(),
      "la notificación QUOTE del RUN aparece con el filtro",
    ).toBeVisible({ timeout: 30_000 });
    record("filtro-quote", true, `?view=all&type=QUOTE muestra "${notif!.title.slice(0, 60)}…"`);

    // 2. Deep link "Ver cotización" → detalle de la cotización.
    await adminPage
      .getByRole("link", { name: /ver cotización/i })
      .first()
      .click();
    await expect(adminPage).toHaveURL(new RegExp(`/admin/cotizaciones/${quoteId}`), {
      timeout: 20_000,
    });
    await expect(adminPage.getByText(quoteNumber).first()).toBeVisible({ timeout: 20_000 });
    record("deep-link", true, `actionUrl → /admin/cotizaciones/${quoteId}`);

    // 3. Marcar todas como leídas → pill del nav desaparece (o queda en 0).
    await adminPage.goto("/admin/notificaciones", { waitUntil: "domcontentloaded" });
    await adminPage.getByRole("button", { name: /marcar todas como leídas/i }).click();
    // El contrato es "las que existían quedan leídas" — NO "0 globales para
    // siempre": un cron puede crear una alerta nueva entre el click y la
    // consulta (flake reproducido 2026-08-07: 2 no leídas nuevas en la ventana).
    const clickedAt = new Date();
    await expect(async () => {
      const unread = await db().notification.count({
        where: { readAt: null, createdAt: { lte: clickedAt } },
      });
      expect(unread, "toda notificación previa al click quedó leída").toBe(0);
    }).toPass({ timeout: 20_000 });
    // Pill del nav: en mobile vive dentro del drawer (hamburguesa).
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

test("§7.7 RBAC: MANAGER no entra a finanzas (redirect) ni ve el nav item, sí entra a cotizaciones", async ({
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

      // Módulo permitido (cotizaciones = MANAGER_UP) → carga.
      await page.goto("/admin/cotizaciones", { waitUntil: "domcontentloaded" });
      await expect(page).toHaveURL(/\/admin\/cotizaciones/, { timeout: 20_000 });
      await expect(
        page.getByRole("heading", { name: /cotizaciones/i }).first(),
        "cotizaciones carga para MANAGER",
      ).toBeVisible({ timeout: 20_000 });
      record("cotizaciones-permitido", true, "MANAGER sí carga /admin/cotizaciones");
    } finally {
      await context.close();
    }

    writeEvidence("pass");
  } catch (err) {
    writeEvidence("fail", err);
    throw err;
  }
});
