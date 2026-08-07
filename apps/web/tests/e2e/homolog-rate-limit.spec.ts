/*
 * HOMOLOGACIÓN E2E — rate-limit + CSRF + doble submit (PROMPT_E2E_HOMOLOGACION
 * §6.21): "429 tras N intentos en login/registro/cotización/contacto con
 * mensaje claro; server action con origen adulterado rechazada; doble submit
 * de cotización no duplica (idempotencia en UI + DB)".
 *
 * Adaptación honesta al sistema real (verificado leyendo el código, §6.21 del
 * doc de auditoría): las acciones son SERVER ACTIONS — no devuelven 429, sino
 * `{error}` con mensaje claro que la UI muestra en role="alert" (el 429 literal
 * solo existe en API routes: /api/unsubscribe, /api/log-error, /api/vitals).
 * Lo que se certifica acá es el COMPORTAMIENTO exigido: tras N intentos el
 * flujo se bloquea con mensaje claro, y el bucket real en rate_limit_buckets
 * lo prueba.
 *
 * Test 1 (rate-limit):
 *   - login: loop REAL por UI con contraseña errada (sin Turnstile en login)
 *     hasta el mensaje "Demasiados intentos…" — 51º intento (límite 50/15min
 *     en LOCAL y STG: isProd = VERCEL_ENV==="production", verificado en
 *     app/(auth)/login/actions.ts). Bucket login:ip + login:email = 51 en DB.
 *   - registro: el schema zod + consent + Turnstile van ANTES del rate-limit,
 *     así que un loop real necesita 30 turnstiles frescos — en cambio se
 *     pre-siembra el bucket signup:email con la MISMA función SQL de la app
 *     (rate_limit_check ×30, mecanismo ya certificado por
     rate-limit.integration.test.ts) y se hace 1 intento real por UI →
 *     mensaje visible y CERO usuario creado en DB.
 *   - contacto: 4 envíos REALES por UI con el mismo email (contact:email es
 *     3/día) → 3 tickets OPEN + 4º con el mensaje; bucket en 4.
 *   - cotización: (a) doble submit — click + requestSubmit() concurrente →
 *     UNA sola Quote en DB (idempotencia: botón disabled en pending + claim
 *     atómico del carrito server-side; el desenlace visible puede ser el
 *     redirect, "ya recibimos esta cotización" o "carrito está vacío" según
 *     dónde cae el 2º dispatch — el invariante certificado es la DB);
 *     (b) 4 envíos reales con el mismo WhatsApp (quote:phone es 3/día) →
 *     3 Quotes + 4º con el mensaje; buckets phone=4, ip=4.
 *
 * Test 2 (CSRF):
 *   - POST de server action con Origin adulterado → 500 "Invalid Server
 *     Actions request" (rechazo PRE-dispatch de Next 16: el MISMO request con
 *     Origin correcto llega al dispatcher y devuelve 404 action-not-found).
 *     Prueba de que no se ejecutó nada: bucket login:% sigue en 0.
 *   - POST /api/vitals con Origin adulterado → 403 "Forbidden" (proxy CORS,
 *     proxy.ts); con Origin correcto llega al handler → 400 (zod).
 *
 * En PRD PROHIBIDO (crea tickets/quotes y envenenaría buckets reales).
 * Limpieza: tickets y quotes (soft-delete, patrón del repo) borrados, buckets
 * login/signup/contact/quote reseteados, producto efímero borrado. Las filas
 * Consent de las cotizaciones QUEDAN (ledger legal append-only, marcadas RUN).
 * En STG cada cotización/ticket dispara los emails reales al admin (canal de
 * venta activo en previews — esperado y documentado).
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import type { Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { strip } from "./_setup/env";
import { E2E_ENV, dismissCookieBanner, expect, test } from "./fixtures/auth";
import { db, disconnectDb } from "./fixtures/db";
import { newRunId } from "./fixtures/run";
import {
  createEphemeralProduct,
  deleteEphemeralProduct,
  fakeCustomer,
  type EphemeralProduct,
} from "./fixtures/data-factory";
import { hashEmail } from "../../lib/rate-limit-keys";
import { PdpPage } from "./pages/pdp";
import { CarritoPage } from "./pages/carrito";
import { CotizacionPage } from "./pages/cotizacion";

const EVIDENCE_DIR = resolve(__dirname, "../../tmp/e2e-homologacion");

test.skip(E2E_ENV === "prd", "Rate-limit/CSRF crean datos y envenenan buckets: prohibido en PRD.");

const run = newRunId("rl");
const EMAIL = `${run}@e2e.test`;
const EMAIL_SIGNUP = `${run}-su@e2e.test`;
// Teléfonos colombianos sintéticos (10 dígitos, nunca reales) por fase.
const digits = run.replace(/\D/g, "").slice(-7);
const PHONE_A = `300${digits}`;
const PHONE_B = `311${digits}`;

type Step = { step: string; ok: boolean; detail?: string; screenshot?: string; at: string };

function evidenceWriter(tag: string, project: string) {
  mkdirSync(resolve(EVIDENCE_DIR, "shots"), { recursive: true });
  const resultsPath = resolve(EVIDENCE_DIR, `results-${E2E_ENV}-${project}-${run}-${tag}.json`);
  const steps: Step[] = [];
  const record = (step: string, ok: boolean, detail?: string, screenshot?: string) =>
    steps.push({ step, ok, detail, screenshot, at: new Date().toISOString() });
  const shot = async (page: Page, name: string) => {
    const path = resolve(EVIDENCE_DIR, "shots", `${E2E_ENV}-${project}-${run}-${tag}-${name}.png`);
    await page.screenshot({ path, fullPage: false });
    return path;
  };
  const write = (status: "pass" | "fail", error?: unknown) => {
    writeFileSync(
      resultsPath,
      JSON.stringify(
        {
          spec: "homolog-rate-limit",
          env: E2E_ENV,
          project,
          run,
          status,
          ...(error ? { error: String(error) } : {}),
          steps,
        },
        null,
        2,
      ),
    );
    console.log(`✓ evidencia ${tag}: ${resultsPath}`);
  };
  return { record, shot, write };
}

const cleanBuckets = async (scope: string) =>
  db().$executeRaw`DELETE FROM rate_limit_buckets WHERE key LIKE ${scope + ":%"}`;

async function bucketCounts(scope: string): Promise<{ key: string; count: number }[]> {
  return db().$queryRaw<{ key: string; count: number }[]>`
    SELECT key, count FROM rate_limit_buckets WHERE key LIKE ${scope + ":%"} ORDER BY key`;
}

let product: EphemeralProduct | null = null;

test.afterAll(async () => {
  if (product) await deleteEphemeralProduct(product);
  await db()
    .supportTicket.deleteMany({ where: { email: EMAIL } })
    .catch(() => {});
  await db()
    .$executeRaw`UPDATE "Quote" SET "deletedAt" = NOW(), "updatedAt" = NOW() WHERE "deletedAt" IS NULL AND "customerEmail" ILIKE ${"%" + run + "%"}`;
  await db()
    .notification.deleteMany({ where: { title: { contains: "Prueba" } } })
    .catch(() => {});
  // Seguridad: el test de registro NO debe crear usuario — si un bug lo creara,
  // lo borramos por service role (auth + Customer). Consent queda (ledger).
  if (strip(process.env.NEXT_PUBLIC_SUPABASE_URL) && strip(process.env.SUPABASE_SECRET_KEY)) {
    try {
      const admin = createClient(
        strip(process.env.NEXT_PUBLIC_SUPABASE_URL)!,
        strip(process.env.SUPABASE_SECRET_KEY)!,
        { auth: { autoRefreshToken: false, persistSession: false } },
      );
      const customer = await db().customer.findFirst({ where: { email: EMAIL_SIGNUP } });
      if (customer) {
        await db()
          .customer.delete({ where: { id: customer.id } })
          .catch(() => {});
        await admin.auth.admin.deleteUser(customer.supabaseUserId).catch(() => {});
      }
    } catch {
      /* limpieza best-effort */
    }
  }
  for (const scope of ["login", "signup", "contact", "quote"]) await cleanBuckets(scope);
  await disconnectDb();
});

test("rate-limit §6.21: login loop real · registro pre-sembrado · contacto×4 · cotización×4 + doble submit", async ({
  anonPage,
}, testInfo) => {
  test.setTimeout(480_000);
  const { record, shot, write } = evidenceWriter("ratelimit", testInfo.project.name);
  const customer = fakeCustomer(run);

  try {
    // ═══ 1. LOGIN — loop real por UI hasta el bloqueo (sin Turnstile en login).
    await cleanBuckets("login");
    await anonPage.goto("/login", { waitUntil: "domcontentloaded" });
    // El banner de cookies (fixed abajo) tapa el submit en 390px y el click
    // queda interceptado → el POST nunca sale (flake STG mobile 2026-08-07).
    // Una sola vez: el consentimiento persiste en el contexto para las fases
    // siguientes (registro/contacto/cotización).
    await dismissCookieBanner(anonPage);
    const loginForm = anonPage.locator("form").first();
    const loginBtn = loginForm.locator('button[type="submit"]');
    await expect(async () => {
      await loginForm.locator('input[name="email"]').fill(EMAIL);
      await loginForm.locator('input[name="password"]').fill("ClaveErrada-E2E-123");
      await expect(loginForm.locator('input[name="email"]')).toHaveValue(EMAIL, {
        timeout: 1_500,
      });
      await expect(loginForm.locator('input[name="password"]')).not.toHaveValue("", {
        timeout: 1_500,
      });
    }).toPass({ timeout: 20_000 });

    let blockedAt = 0;
    for (let i = 1; i <= 80; i++) {
      // OJO: el alert va SCOPED al form — el <next-route-announcer> del App
      // Router vive al final del body con role="alert" VACÍO y un .last()
      // global lo capturaría (bug reproducido: mensaje visible y aserción en "").
      const alert = loginForm.locator('[role="alert"]');
      // Cada intento es un POST de server action a /login: esperamos la
      // respuesta de ESE roundtrip (no el estado del botón, que es una carrera)
      // y luego el texto del alert — determinista intento a intento.
      await Promise.all([
        anonPage.waitForResponse(
          (r) => r.request().method() === "POST" && new URL(r.url()).pathname === "/login",
          { timeout: 20_000 },
        ),
        loginBtn.click(),
      ]);
      await expect(alert).toHaveText(/credenciales incorrectas|demasiados intentos/i, {
        timeout: 20_000,
      });
      const alertText = await alert.innerText();
      if (i === 1) {
        expect(alertText, "intento 1 debe ser credenciales incorrectas").toMatch(
          /credenciales incorrectas/i,
        );
      }
      if (/demasiados intentos/i.test(alertText)) {
        blockedAt = i;
        break;
      }
    }
    expect(blockedAt, "el rate-limit de login debe bloquear tras 50 intentos").toBe(51);
    const loginBuckets = await bucketCounts("login");
    expect(
      loginBuckets.filter((b) => b.count === 51).length,
      "login:ip y login:email deben quedar en 51",
    ).toBe(2);
    record(
      "login-51-bloqueado",
      true,
      `intento 51 → "Demasiados intentos…" · buckets ${JSON.stringify(loginBuckets)}`,
      await shot(anonPage, "1-login-ratelimit"),
    );
    await cleanBuckets("login");

    // ═══ 2. REGISTRO — bucket pre-sembrado con la función SQL real + 1 intento UI.
    await cleanBuckets("signup");
    const signupKey = `signup:email:${hashEmail(EMAIL_SIGNUP)}`;
    for (let i = 0; i < 30; i++) {
      // SELECT * (columnas separadas): `SELECT rate_limit_check(...)` devuelve
      // un record compuesto que Prisma no deserializa.
      await db().$queryRaw`SELECT * FROM rate_limit_check(${signupKey}, 30, 3600)`;
    }
    await anonPage.goto("/registro", { waitUntil: "domcontentloaded" });
    const regForm = anonPage.locator("form").first();
    const fillRegistro = async () => {
      await expect(async () => {
        await regForm.locator('input[name="firstName"]').fill("Cliente");
        await regForm.locator('input[name="lastName"]').fill("Prueba");
        await regForm.locator('input[name="email"]').fill(EMAIL_SIGNUP);
        await regForm.locator('input[name="password"]').fill("PruebaE2E-segura-123");
        await regForm.locator('input[name="passwordConfirm"]').fill("PruebaE2E-segura-123");
        await regForm.locator('input[name="dataConsent"]').check();
        await expect(regForm.locator('input[name="email"]')).toHaveValue(EMAIL_SIGNUP, {
          timeout: 1_500,
        });
        await expect(regForm.locator('input[name="dataConsent"]')).toBeChecked({ timeout: 1_500 });
      }).toPass({ timeout: 20_000 });
      await expect(async () => {
        const token = await regForm.locator('input[name="cf-turnstile-response"]').inputValue();
        expect(token.length).toBeGreaterThan(0);
      }).toPass({ timeout: 20_000 });
    };
    // El widget puede rotar el token entre la espera y el submit y el sitio
    // responde "No pudimos verificar que no eres un robot" (flake reproducido
    // 2026-08-07). La propia app prescribe la recuperación al usuario: recargar
    // e intentar de nuevo. Se ejerce UNA vez; si persiste, es fallo real.
    let blockedSeen = false;
    for (let attempt = 1; attempt <= 2 && !blockedSeen; attempt++) {
      await fillRegistro();
      await regForm.locator('button[type="submit"]').click();
      const outcome = await Promise.race([
        anonPage
          .getByText(/demasiados intentos de registro/i)
          .waitFor({ state: "visible", timeout: 20_000 })
          .then(() => "blocked" as const),
        anonPage
          .getByText(/no pudimos verificar que no eres un robot/i)
          .waitFor({ state: "visible", timeout: 20_000 })
          .then(() => "turnstile-rejected" as const),
      ]);
      if (outcome === "blocked") {
        blockedSeen = true;
      } else if (attempt < 2) {
        await anonPage.reload({ waitUntil: "domcontentloaded" });
      } else {
        throw new Error("Turnstile rechazó el token 2 veces seguidas: fallo real, no flake.");
      }
    }
    const signupCustomer = await db().customer.findFirst({ where: { email: EMAIL_SIGNUP } });
    expect(signupCustomer, "NO debe crearse Customer tras el bloqueo").toBeNull();
    const signupBuckets = await bucketCounts("signup");
    record(
      "registro-bloqueado-sin-usuario",
      true,
      `mensaje visible, 0 Customer, bucket ${JSON.stringify(signupBuckets)}`,
      await shot(anonPage, "2-registro-ratelimit"),
    );
    await cleanBuckets("signup");

    // ═══ 3. CONTACTO — 4 envíos reales mismo email (límite 3/día por email).
    await cleanBuckets("contact");
    for (let i = 1; i <= 4; i++) {
      await anonPage.goto("/contacto", { waitUntil: "domcontentloaded" });
      const form = anonPage.locator("form", { has: anonPage.locator("#contact-email") });
      await expect(async () => {
        await form.locator('input[name="name"]').fill(customer.name);
        await form.locator('input[name="email"]').fill(EMAIL);
        await form.locator("#contact-subject").selectOption({ index: 1 });
        await form
          .locator("#contact-message")
          .fill(`Mensaje ${i}/4 de homologación rate-limit ${run}.`);
        await expect(form.locator("#contact-message")).not.toHaveValue("", { timeout: 1_500 });
      }).toPass({ timeout: 20_000 });
      await expect(async () => {
        const token = await form.locator('input[name="cf-turnstile-response"]').inputValue();
        expect(token.length).toBeGreaterThan(0);
      }).toPass({ timeout: 20_000 });
      await form.getByRole("button", { name: /enviar/i }).click();
      if (i <= 3) {
        await expect(anonPage.locator("body")).toContainText(/recibimos tu mensaje/i, {
          timeout: 20_000,
        });
      } else {
        await expect(anonPage.locator("body")).toContainText(
          /recibimos varios mensajes desde tu cuenta hoy/i,
          { timeout: 20_000 },
        );
      }
    }
    const tickets = await db().supportTicket.count({ where: { email: EMAIL } });
    expect(tickets, "3 tickets reales, el 4º bloqueado").toBe(3);
    const contactBuckets = await bucketCounts("contact");
    record(
      "contacto-3-mas-1-bloqueado",
      true,
      `3 tickets OPEN + 4º con mensaje · buckets ${JSON.stringify(contactBuckets)}`,
      await shot(anonPage, "3-contacto-ratelimit"),
    );
    await cleanBuckets("contact");

    // ═══ 4. COTIZACIÓN — (a) doble submit → 1 Quote; (b) 4 envíos → 3 + bloqueo.
    product = await createEphemeralProduct(run);
    await cleanBuckets("quote");

    // (a) doble submit: click real + requestSubmit concurrente (doble-click
    // agresivo). La UI protege (botón disabled en pending) y el servidor
    // reclama el carrito atómicamente (DUPLICATE_SUBMIT) → 1 sola Quote.
    // La ventana de pending se hace DETERMINISTA retardando 1.5s el fulfill
    // del POST de la acción (el servidor procesa igual; solo el cliente espera).
    await anonPage.route("**/checkout/datos", async (route) => {
      if (route.request().method() === "POST") {
        const response = await route.fetch();
        await new Promise((r) => setTimeout(r, 1_500));
        await route.fulfill({ response });
      } else {
        await route.continue();
      }
    });
    const pdp = new PdpPage(anonPage, product.slug);
    await pdp.goto();
    await pdp.addToCart();
    const carrito = new CarritoPage(anonPage);
    await carrito.expectItem(product.name);
    await carrito.quoteCta().click();
    const cotizacion = new CotizacionPage(anonPage);
    await cotizacion.expectLoaded();
    await cotizacion.fill({
      name: customer.name,
      whatsapp: PHONE_A,
      email: EMAIL,
      notes: `Doble submit ${run}`,
    });
    const quoteForm = anonPage.locator("form", {
      has: anonPage.locator('input[name="customerName"]'),
    });
    await cotizacion.submitButton().click();
    // El botón se localiza por type=submit (no por nombre): en pending el label
    // cambia a "Enviando…" y un getByRole(name) pierde el match (bug reproducido).
    const submitByType = quoteForm.locator('button[type="submit"]');
    await expect(submitByType, "botón disabled durante el pending").toBeDisabled({
      timeout: 3_000,
    });
    await quoteForm.evaluate((f) => (f as HTMLFormElement).requestSubmit());
    // Tres desenlaces legítimos de la carrera (el invariante es la DB: 1 Quote):
    // redirect a la confirmación (gana el 1º) · "ya recibimos esta cotización"
    // (DUPLICATE_SUBMIT si el 2º llega durante el claim) · "carrito está vacío"
    // (si el 2º llega justo DESPUÉS del claim — verificado 2026-08-07: con el
    // doble-dispatch artificial, React aplica la última respuesta; la quote del
    // 1º ya existe en DB. Un usuario real no llega ahí: el botón queda disabled).
    const dupText = anonPage.getByText(/ya recibimos esta cotización/i);
    const emptyText = anonPage.getByText(/tu carrito está vacío/i);
    const outcome = await Promise.race([
      anonPage.waitForURL(/\/cotizacion\/[a-f0-9]{32}/, { timeout: 30_000 }).then(() => "redirect"),
      dupText.waitFor({ state: "visible", timeout: 30_000 }).then(() => "duplicate-msg"),
      emptyText.waitFor({ state: "visible", timeout: 30_000 }).then(() => "empty-cart-msg"),
    ]);
    await anonPage.unroute("**/checkout/datos");
    await expect(async () => {
      const quotesA = await db().quote.count({
        where: { customerWhatsapp: PHONE_A, deletedAt: null },
      });
      expect(quotesA, "doble submit → exactamente 1 Quote").toBe(1);
    }).toPass({ timeout: 20_000 });
    record(
      "quote-doble-submit-1-quote",
      true,
      `desenlace en UI: ${outcome} · PHONE_A=${PHONE_A} → exactamente 1 Quote (idempotencia UI+DB)`,
      await shot(anonPage, "4-quote-doble-submit"),
    );
    await cleanBuckets("quote");

    // (b) 4 envíos reales mismo WhatsApp (quote:phone 3/día) → 3 + bloqueado.
    for (let i = 1; i <= 4; i++) {
      await pdp.goto();
      await pdp.addToCart();
      await carrito.expectItem(product.name);
      await carrito.quoteCta().click();
      await cotizacion.expectLoaded();
      await cotizacion.fill({
        name: customer.name,
        whatsapp: PHONE_B,
        email: EMAIL,
        notes: `Rate-limit ${i}/4 ${run}`,
      });
      if (i <= 3) {
        const token = await cotizacion.submitAndWaitConfirmation();
        expect(token).toMatch(/^[a-f0-9]{32}$/);
      } else {
        await cotizacion.submitButton().click();
        await expect(anonPage.locator("body")).toContainText(
          /recibimos varias cotizaciones tuyas hoy/i,
          { timeout: 30_000 },
        );
      }
    }
    const quotesB = await db().quote.count({
      where: { customerWhatsapp: PHONE_B, deletedAt: null },
    });
    expect(quotesB, "3 quotes reales, la 4ª bloqueada").toBe(3);
    const quoteBuckets = await bucketCounts("quote");
    record(
      "quote-3-mas-1-bloqueada",
      true,
      `3 Quotes + 4ª con mensaje · buckets ${JSON.stringify(quoteBuckets)}`,
      await shot(anonPage, "4-quote-ratelimit"),
    );
    await cleanBuckets("quote");

    write("pass");
  } catch (err) {
    write("fail", err);
    throw err;
  }
});

test("csrf §6.21: server action con origen adulterado rechazada + CORS estricto en /api", async ({
  request,
}, testInfo) => {
  test.setTimeout(120_000);
  const { record, write } = evidenceWriter("csrf", testInfo.project.name);

  try {
    await cleanBuckets("login");
    // /api/vitals rate-limita por IP (120/60s): los beacons RUM de las páginas
    // que cargó el test anterior (mismo IP del runner) llenan el bucket y el
    // probe CORS recibiría 429 en vez de 400 (flake reproducido 2026-08-07).
    // Este test solo usa `request` (sin páginas) → limpiar lo vuelve determinista.
    await cleanBuckets("vitals");
    // Action id sintético (40 hex, formato real). Con origen adulterado el
    // request muere ANTES del dispatcher; con origen correcto llega y el
    // dispatcher responde 404 (action inexistente) — el contraste prueba que
    // el chequeo de origen corre primero.
    const fakeActionId = `7f${"0".repeat(38)}`;
    const evil = await request.post("/login", {
      headers: {
        "Next-Action": fakeActionId,
        Origin: "https://evil.example",
        "Content-Type": "text/plain;charset=UTF-8",
      },
      data: "[]",
    });
    const evilBody = await evil.text();
    expect(evil.status(), "origen adulterado → rechazo").toBe(500);
    if (E2E_ENV === "local") {
      expect(evilBody).toContain("Invalid Server Actions request");
    }
    record(
      "csrf-server-action-origen-malo",
      true,
      `POST /login Next-Action + Origin evil.example → ${evil.status()} (${E2E_ENV === "local" ? '"Invalid Server Actions request"' : "digest opaco en prod, sin filtrar info"})`,
    );

    const good = await request.post("/login", {
      headers: {
        "Next-Action": fakeActionId,
        Origin: new URL("/login", testInfo.project.use.baseURL as string).origin,
        "Content-Type": "text/plain;charset=UTF-8",
      },
      data: "[]",
    });
    expect(good.status(), "mismo request con buen origen → llega al dispatcher (404)").toBe(404);
    const bucketsAfter = await bucketCounts("login");
    expect(
      bucketsAfter.length,
      "el POST con origen adulterado NO ejecutó la acción (bucket intacto en 0)",
    ).toBe(0);
    record(
      "csrf-contraste-y-sin-efecto",
      true,
      `buen origen → ${good.status()} (dispatcher alcanzado) · buckets login tras ambos POSTs: ${JSON.stringify(bucketsAfter)}`,
    );

    const apiEvil = await request.post("/api/vitals", {
      headers: { Origin: "https://evil.example", "Content-Type": "application/json" },
      data: {},
    });
    const apiEvilBody = await apiEvil.text();
    expect(apiEvil.status()).toBe(403);
    expect(apiEvilBody).toContain("Forbidden");
    const apiGood = await request.post("/api/vitals", {
      headers: {
        Origin: new URL("/", testInfo.project.use.baseURL as string).origin,
        "Content-Type": "application/json",
      },
      data: {},
    });
    expect(apiGood.status(), "buen origen llega al handler (400 por zod)").toBe(400);
    record(
      "csrf-api-cors",
      true,
      `/api/vitals: origen malo → 403 Forbidden (proxy CORS) · buen origen → ${apiGood.status()} (handler alcanzado)`,
    );

    write("pass");
  } catch (err) {
    write("fail", err);
    throw err;
  }
});
