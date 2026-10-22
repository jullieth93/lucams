// CERTIFICACIÓN TEMPORAL (2026-10-22) — el escenario EXACTO de Lucy:
// cuenta ADMIN que entra por /login (tienda) con la marca admin_last_activity
// VIEJA (>30 min sin tocar el panel). Al cargar el home, el header muestra
// «PANEL ADMIN» y Next prefetcha /admin/dashboard → el idle-timeout admin NO
// debe revocar la sesión por un prefetch (antes: signOut global → sesión
// muerta en el primer F5). BORRAR tras certificar (o promover a spec fijo).
import { test, expect } from "@playwright/test";
import crypto from "node:crypto";
import { PrismaClient } from "@lucams/db";
import { createClient } from "@supabase/supabase-js";
import { baseUrlFor, currentEnv, extraHeadersFor, loadEnvFor } from "./_setup/env";

const E2E_ENV = currentEnv();
loadEnvFor(E2E_ENV);
test.use({ baseURL: baseUrlFor(E2E_ENV), extraHTTPHeaders: extraHeadersFor(E2E_ENV) });
test.setTimeout(180_000);

const RUN = `lucy-${Date.now()}`;
const EMAIL = `${RUN}@example.com`;
const PASSWORD = "Repro-Session-123!";

// Marca admin firmada con timestamp viejo (mismo formato que lib/activity-mark).
function staleAdminMark(): string {
  const ts = String(Date.now() - 45 * 60 * 1000); // 45 min — vencida
  const sig = crypto
    .createHmac("sha256", process.env.CSRF_SECRET!.trim())
    .update(ts)
    .digest("base64url");
  return `${ts}.${sig}`;
}

test("admin con marca vieja entra por /login y el prefetch de PANEL ADMIN no mata la sesión", async ({
  page,
  context,
}) => {
  const prisma = new PrismaClient();
  const service = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SECRET_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
  const { data, error } = await service.auth.admin.createUser({
    email: EMAIL,
    password: PASSWORD,
    email_confirm: true,
  });
  expect(error).toBeNull();
  const admin = await prisma.adminUser.create({
    data: { supabaseUserId: data.user!.id, email: EMAIL, role: "SUPERADMIN", isActive: true },
    select: { id: true },
  });
  await prisma.customer.create({
    data: {
      email: EMAIL,
      supabaseUserId: data.user!.id,
      firstName: "Lucy Test",
      referralCode: `LT${Date.now().toString(36).toUpperCase()}`,
    },
  });

  const loggedIn = async () =>
    (await page.getByRole("link", { name: /ingresar/i }).count()) === 0;
  const sessionCount = async () =>
    Number(
      (
        await prisma.$queryRaw<{ n: bigint }[]>`
          SELECT count(*)::bigint AS n FROM auth.sessions WHERE user_id = ${data.user!.id}::uuid`
      )[0]?.n ?? 0,
    );

  try {
    // Login por la TIENDA (sella solo la marca de cliente).
    await page.goto("/login", { waitUntil: "domcontentloaded" });
    const banner = page.getByRole("button", { name: /solo necesarias/i });
    if (await banner.isVisible().catch(() => false)) {
      await banner.click();
      await expect(banner).toBeHidden({ timeout: 10_000 });
    }
    // Hidratación: el fill puede caer ANTES de que React hidrate y el input
    // controlado se resetea (email truncado = submit inválido). Reintenta
    // hasta que el valor quede completo.
    const emailBox = page.getByRole("textbox", { name: /correo electrónico/i });
    const passBox = page.getByRole("textbox", { name: /^contraseña$/i });
    for (let i = 0; i < 6; i++) {
      await emailBox.fill(EMAIL);
      await passBox.fill(PASSWORD);
      if ((await emailBox.inputValue()) === EMAIL && (await passBox.inputValue()) === PASSWORD)
        break;
      await page.waitForTimeout(500);
    }
    // El banner puede aparecer TARDE (post-hidratación): re-chequear.
    if (await banner.isVisible().catch(() => false)) {
      await banner.click();
      await expect(banner).toBeHidden({ timeout: 10_000 });
    }
    let ok = false;
    for (let i = 0; i < 4 && !ok; i++) {
      await page.getByRole("button", { name: /iniciar sesión/i }).click();
      ok = await page
        .waitForURL((url) => !url.pathname.startsWith("/login"), { timeout: 8_000 })
        .then(() => true)
        .catch(() => false);
    }
    if (!ok) {
      const alertText = await page
        .locator("[role='alert'], .text-destructive, p.text-red-500")
        .allTextContents()
        .catch(() => []);
      console.log("[dbgL] login falló | url:", page.url(), "| alertas:", JSON.stringify(alertText));
      throw new Error("login nunca navegó");
    }
    await page.waitForTimeout(1_000);
    expect(await loggedIn()).toBe(true);
    expect(await sessionCount()).toBe(1);

    // La marca admin quedó de "hace 45 min" (Lucy no ha tocado el panel hoy).
    const base = new URL(baseUrlFor(E2E_ENV));
    await context.addCookies([
      {
        name: "admin_last_activity",
        value: staleAdminMark(),
        domain: base.hostname,
        path: "/admin",
        httpOnly: true,
        secure: true,
        sameSite: "Lax",
      },
    ]);

    // Home logueado → el header muestra «PANEL ADMIN» → prefetch automático.
    await page.goto("/", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(3_000); // margen para que el prefetch ocurra
    expect(await sessionCount()).toBe(1); // la sesión NO fue revocada
    expect(await loggedIn()).toBe(true);

    // El F5 de Lucy.
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForTimeout(2_000);
    expect(await loggedIn()).toBe(true);
    expect(await sessionCount()).toBe(1);

    // Segundo F5 (Lucy reportó que tampoco volvía).
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForTimeout(2_000);
    expect(await loggedIn()).toBe(true);

    // Y la navegación REAL al panel sí aplica el timeout (seguridad intacta):
    // al ir de verdad a /admin con la marca vencida, expira y pide re-login.
    await page.goto("/admin/dashboard", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(1_500);
    expect(page.url()).toContain("/admin/login");
  } finally {
    await service.auth.admin.deleteUser(data.user!.id).catch(() => {});
    await prisma.adminUser.delete({ where: { id: admin.id } }).catch(() => {});
    await prisma.customer.deleteMany({ where: { email: EMAIL } }).catch(() => {});
    await prisma.$disconnect();
  }
});
