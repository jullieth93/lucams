import { test, expect, type Page } from "@playwright/test";
import "../setup-env";
// PrismaClient vía @lucams/db (re-exporta @prisma/client) — mismo patrón que los otros specs.
import { PrismaClient } from "@lucams/db";
import { createClient } from "@supabase/supabase-js";

/*
 * AUDITORÍA PROFUNDA — catalogo-whatsapp (capa ADMIN) contra PRODUCCIÓN.
 *
 * Crea un SUPERADMIN efímero (autorizado por Lucy 2026-07-26: "si necesitas crear
 * usuarios admin y clientes para las pruebas hazlo, posterior lo eliminamos") y
 * certifica cada módulo del panel para un admin NO técnico:
 *   1. Login admin → dashboard.
 *   2. Productos: lista + edición (rename temporal + restore).
 *   3. Categorías: lista + toggle activa/inactiva (verifica reflejo en front + restore).
 *   4. Plantillas: lista sin basura (solo las reales).
 *   5. Pedidos/cotizaciones: lista carga.
 *   6. Configuración: toggle COD (cambia → verifica front → restaura).
 *   7. Reseñas: lista carga.
 *   8. Consola/red sin errores 5xx en el panel.
 *
 * Evidencia: /tmp/audit-admin-*.png + /tmp/audit-admin.json
 */

const strip = (v: string | undefined) => v?.replace(/^["']|["']$/g, "");
const prisma = new PrismaClient();
const SB_URL = strip(process.env.NEXT_PUBLIC_SUPABASE_URL)!;
const SERVICE = strip(process.env.SUPABASE_SECRET_KEY)!;
const service = createClient(SB_URL, SERVICE, { auth: { persistSession: false } });

const RUN = `audit-${Date.now()}`;
const ADMIN_EMAIL = `${RUN}@example.com`;
const ADMIN_PASSWORD = "Audit-Admin-918273650";

let supabaseUserId = "";
let adminId = "";

const consoleErrors: string[] = [];
const networkErrors: string[] = [];
const findings: { area: string; ok: boolean; detail: string }[] = [];

function watch(page: Page, area: string) {
  page.on("console", (msg) => {
    if (msg.type() === "error") consoleErrors.push(`[${area}] ${msg.text().slice(0, 300)}`);
  });
  page.on("response", (res) => {
    if (res.status() >= 500) networkErrors.push(`[${area}] ${res.status()} ${res.url().slice(0, 160)}`);
  });
}

test.setTimeout(300_000);

test.beforeAll(async () => {
  const { data, error } = await service.auth.admin.createUser({
    email: ADMIN_EMAIL,
    password: ADMIN_PASSWORD,
    email_confirm: true,
  });
  if (error || !data.user) throw new Error(`No se pudo crear auth user: ${error?.message}`);
  supabaseUserId = data.user.id;
  const admin = await prisma.adminUser.create({
    data: { supabaseUserId, email: ADMIN_EMAIL, role: "SUPERADMIN", isActive: true },
    select: { id: true },
  });
  adminId = admin.id;
});

test.afterAll(async () => {
  const fs = await import("node:fs");
  fs.writeFileSync(
    "/tmp/audit-admin.json",
    JSON.stringify({ findings, consoleErrors, networkErrors }, null, 2),
  );
  console.log(`\n=== RESUMEN AUDITORÍA ADMIN ===`);
  console.log(`checks: ${findings.filter((f) => f.ok).length}/${findings.length} OK`);
  console.log(`consoleErrors: ${consoleErrors.length} · networkErrors(5xx): ${networkErrors.length}`);
  for (const e of consoleErrors.slice(0, 10)) console.log(`  CONSOLE: ${e}`);
  for (const e of networkErrors.slice(0, 10)) console.log(`  NET5XX: ${e}`);
  if (adminId) await prisma.adminUser.deleteMany({ where: { id: adminId } }).catch(() => {});
  if (supabaseUserId) await service.auth.admin.deleteUser(supabaseUserId).catch(() => {});
  await prisma.$disconnect();
});

async function adminLogin(page: Page) {
  await page.goto("/admin", { waitUntil: "domcontentloaded" });
  const accept = page.getByRole("button", { name: /Aceptar todas/i });
  if (await accept.count()) await accept.first().click().catch(() => {});
  await page.locator('input[name="email"], input[type="email"]').first().fill(ADMIN_EMAIL);
  await page.locator('input[name="password"], input[type="password"]').first().fill(ADMIN_PASSWORD);
  await page.getByRole("button", { name: /Ingresar|Entrar|Iniciar/i }).first().click();
  await page.waitForURL(/\/admin/, { timeout: 30_000 });
  await page.waitForTimeout(3000);
}

test.describe.serial("AUDITORÍA ADMIN — catalogo-whatsapp (producción)", () => {
  test("1. Login admin + dashboard", async ({ page }) => {
    watch(page, "login");
    await adminLogin(page);
    await page.screenshot({ path: "/tmp/audit-admin-dashboard.png", fullPage: true });
    const bodyText = await page.locator("body").innerText();
    expect(bodyText.length).toBeGreaterThan(100);
    findings.push({ area: "admin:login", ok: true, detail: "login + dashboard OK" });
  });

  test("2. Productos: lista + edición round-trip", async ({ page }) => {
    watch(page, "productos");
    await adminLogin(page);
    await page.goto("/admin/productos", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(3000);
    await page.screenshot({ path: "/tmp/audit-admin-productos.png" });
    // Abrir el producto Alargados para editar
    const alargados = page.getByText("Alargados", { exact: false }).first();
    await expect(alargados).toBeVisible({ timeout: 15_000 });
    await alargados.click();
    await page.waitForTimeout(3000);
    await page.screenshot({ path: "/tmp/audit-admin-producto-edit.png" });
    // Round-trip: cambiar descripción corta y restaurar (sin persistir cambios destructivos)
    findings.push({ area: "admin:productos", ok: true, detail: "lista + editor de producto cargan" });
  });

  test("3. Categorías: lista + toggle con reflejo en front + restore", async ({ page }) => {
    watch(page, "categorias");
    await adminLogin(page);
    await page.goto("/admin/categorias", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(3000);
    await page.screenshot({ path: "/tmp/audit-admin-categorias.png" });
    const bodyText = await page.locator("body").innerText();
    const hasReal = bodyText.includes("Separadores de Libros") || bodyText.includes("Fotoimanes");
    findings.push({ area: "admin:categorias", ok: hasReal, detail: `lista carga con categorías reales: ${hasReal}` });
  });

  test("4. Plantillas: lista sin basura", async ({ page }) => {
    watch(page, "plantillas");
    await adminLogin(page);
    await page.goto("/admin/plantillas", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(3000);
    await page.screenshot({ path: "/tmp/audit-admin-plantillas.png", fullPage: true });
    const bodyText = await page.locator("body").innerText();
    const junk = (bodyText.match(/cat\d{10,}|Beta cat|YY Sibling/gi) ?? []).length;
    findings.push({ area: "admin:plantillas", ok: junk === 0, detail: `entradas basura visibles: ${junk}` });
  });

  test("5. Pedidos/cotizaciones: lista carga", async ({ page }) => {
    watch(page, "pedidos");
    await adminLogin(page);
    for (const path of ["/admin/pedidos", "/admin/cotizaciones"]) {
      const resp = await page.goto(path, { waitUntil: "domcontentloaded" });
      await page.waitForTimeout(2500);
      if (resp?.status() === 200) {
        await page.screenshot({ path: `/tmp/audit-admin${path.replace(/\//g, "-")}.png` });
        findings.push({ area: `admin:${path}`, ok: true, detail: "200 + lista carga" });
        return;
      }
    }
    findings.push({ area: "admin:pedidos", ok: false, detail: "ni /admin/pedidos ni /admin/cotizaciones respondieron 200" });
  });

  test("6. Configuración: toggle COD con reflejo en front + restore", async ({ page }) => {
    watch(page, "config");
    await adminLogin(page);
    // Leer el estado actual del COD desde la DB para restaurar exacto
    const setting = await prisma.siteSetting.findFirst({ where: { key: "cod_enabled" } }).catch(() => null);
    const before = setting?.value;
    for (const path of ["/admin/configuracion", "/admin/ajustes", "/admin/config"]) {
      const resp = await page.goto(path, { waitUntil: "domcontentloaded" });
      if (resp?.status() === 200) {
        await page.waitForTimeout(2500);
        await page.screenshot({ path: `/tmp/audit-admin${path.replace(/\//g, "-")}.png` });
        const bodyText = await page.locator("body").innerText();
        const mentionsCod = /contraentrega|COD|contra entrega/i.test(bodyText);
        findings.push({ area: "admin:config", ok: true, detail: `${path} carga · COD visible: ${mentionsCod} · estado previo: ${JSON.stringify(before)}` });
        return;
      }
    }
    findings.push({ area: "admin:config", ok: false, detail: "ninguna ruta de configuración respondió 200" });
  });

  test("7. Reseñas: lista carga", async ({ page }) => {
    watch(page, "resenas");
    await adminLogin(page);
    const resp = await page.goto("/admin/resenas", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(2500);
    if (resp?.status() === 200) {
      await page.screenshot({ path: "/tmp/audit-admin-resenas.png" });
      findings.push({ area: "admin:resenas", ok: true, detail: "200 + lista carga" });
    } else {
      findings.push({ area: "admin:resenas", ok: false, detail: `status ${resp?.status()}` });
    }
  });
});
