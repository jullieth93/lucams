/*
 * HOMOLOGACIÓN E2E — rate-limit + CSRF (docs/TESTING.md): "429 tras N intentos
 * en login/registro/contacto con mensaje claro; server action con origen
 * adulterado rechazada".
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
 *
 * Test 2 (CSRF):
 *   - POST de server action con Origin adulterado → 500 "Invalid Server
 *     Actions request" (rechazo PRE-dispatch de Next 16: el MISMO request con
 *     Origin correcto llega al dispatcher y devuelve 400 action-not-found).
 *     Prueba de que no se ejecutó nada: bucket login:% sigue en 0.
 *   - POST /api/vitals con Origin adulterado → 403 "Forbidden" (proxy CORS,
 *     proxy.ts); con Origin correcto llega al handler → 400 (zod).
 *
 * En PRD PROHIBIDO (crea tickets y envenenaría buckets reales).
 * Limpieza: tickets y buckets login/signup/contact reseteados. Los consentimientos
 * quedan como ledger legal append-only, marcados con el RUN. En STG cada ticket
 * puede disparar el aviso operativo configurado.
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import type { Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { strip } from "./_setup/env";
import { E2E_ENV, dismissCookieBanner, expect, test } from "./fixtures/auth";
import { db, disconnectDb } from "./fixtures/db";
import { newRunId } from "./fixtures/run";
import { fakeCustomer } from "./fixtures/data-factory";
import { hashEmail } from "../../lib/rate-limit-keys";
import { capitalizeName } from "../../lib/colombia-validators";

const EVIDENCE_DIR = resolve(__dirname, "../../tmp/e2e-homologacion");

test.skip(E2E_ENV === "prd", "Rate-limit/CSRF crean datos y envenenan buckets: prohibido en PRD.");

const run = newRunId("rl");
const EMAIL = `${run}@e2e.test`;
const EMAIL_SIGNUP = `${run}-su@e2e.test`;
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

test.afterAll(async () => {
  await db()
    .supportTicket.deleteMany({ where: { email: EMAIL } })
    .catch(() => {});
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
  for (const scope of ["login", "signup", "contact"]) await cleanBuckets(scope);
  await disconnectDb();
});

test("rate-limit §6.21: login loop real · registro pre-sembrado · contacto×4", async ({
  anonPage,
}, testInfo) => {
  test.setTimeout(300_000);
  const { record, shot, write } = evidenceWriter("ratelimit", testInfo.project.name);
  const customer = fakeCustomer(run);
  const contactName = capitalizeName(customer.name);

  try {
    // ═══ 1. LOGIN — loop real por UI hasta el bloqueo (sin Turnstile en login).
    await cleanBuckets("login");
    await anonPage.goto("/login", { waitUntil: "domcontentloaded" });
    // El banner de cookies (fixed abajo) tapa el submit en 390px y el click
    // queda interceptado → el POST nunca sale (flake STG mobile 2026-08-07).
    // Una sola vez: el consentimiento persiste en el contexto para las fases
    // siguientes (registro/contacto).
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
    let turnstileRecoveries = 0;
    for (let i = 1; i <= 4; i++) {
      await anonPage.goto("/contacto", { waitUntil: "domcontentloaded" });
      const form = anonPage.locator("form", { has: anonPage.locator("#contact-email") });
      await expect(async () => {
        await form.locator('input[name="name"]').fill(contactName);
        await form.locator('input[name="email"]').fill(EMAIL);
        await form.locator("#contact-subject").selectOption({ index: 1 });
        await form
          .locator("#contact-message")
          .fill(`Mensaje ${i}/4 de homologación rate-limit ${run}.`);
        await form.locator('input[name="dataConsent"]').check();
        await expect(form.locator('input[name="name"]')).toHaveValue(contactName, {
          timeout: 1_500,
        });
        await expect(form.locator('input[name="email"]')).toHaveValue(EMAIL, { timeout: 1_500 });
        await expect(form.locator("#contact-subject")).toHaveValue("PERSONALIZACION", {
          timeout: 1_500,
        });
        await expect(form.locator("#contact-message")).not.toHaveValue("", { timeout: 1_500 });
        await expect(form.locator('input[name="dataConsent"]')).toBeChecked({ timeout: 1_500 });
      }).toPass({ timeout: 20_000 });
      await expect(async () => {
        const token = await form.locator('input[name="cf-turnstile-response"]').inputValue();
        expect(token.length).toBeGreaterThan(0);
      }).toPass({ timeout: 20_000 });
      await anonPage.waitForLoadState("networkidle", { timeout: 15_000 }).catch(() => {});
      await Promise.all([
        anonPage.waitForResponse(
          (r) =>
            r.request().method() === "POST" &&
            new URL(r.url()).pathname === "/contacto" &&
            Boolean(r.request().headers()["next-action"]),
          { timeout: 20_000 },
        ),
        form.getByRole("button", { name: /enviar/i }).click(),
      ]);
      const outcome = await Promise.race([
        anonPage
          .locator("#contenido")
          .getByText(
            i <= 3 ? /recibimos tu mensaje/i : /recibimos varios mensajes desde tu cuenta hoy/i,
          )
          .waitFor({ state: "visible", timeout: 20_000 })
          .then(() => "accepted" as const),
        anonPage
          .getByText(/Validación anti-bot falló/i)
          .waitFor({ state: "visible", timeout: 20_000 })
          .then(() => "turnstile-rejected" as const),
      ]);
      if (outcome === "turnstile-rejected") {
        if (turnstileRecoveries >= 1) {
          throw new Error("Turnstile rechazó el token 2 veces en contacto: fallo real.");
        }
        turnstileRecoveries += 1;
        i -= 1;
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
    // request muere ANTES del dispatcher; con origen correcto Next 16 valida
    // el ID inexistente y responde 400 — el contraste prueba que el origen corre primero.
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
    expect(good.status(), "mismo request con buen origen → Next valida el ID inexistente").toBe(
      400,
    );
    expect(await good.text()).toContain("Invalid Server Action request");
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
