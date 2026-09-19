import { test, expect, type Page } from "@playwright/test";
import "../setup-env";
import { PrismaClient } from "@lucams/db";
import { createClient } from "@supabase/supabase-js";
import fs from "node:fs";
import path from "node:path";
import { completeMfaChallengeIfNeeded, enrollTotpFactor } from "./_helpers/mfa";

/*
 * Auditoría responsive del panel admin (iniciativa UX responsive 2026-09 —
 * generalización de mobile-admin-audit.spec.ts, que queda como herramienta
 * 375-only referenciada por docs/specs históricos).
 *
 * Recorre TODAS las rutas de primer nivel del nav admin (extraídas de
 * lib/admin-nav.ts parseando el fuente — los specs no resuelven el alias
 * `@/`, y así la lista se mantiene sola al agregar rutas) en 4 anchos:
 *
 *   - 375×812  (móvil — Lucy opera desde el celular)
 *   - 768×1024 (tablet retrato)
 *   - 1024×768 (tablet paisaje — aquí ya entra el breakpoint lg + sidebar)
 *   - 1280×800 (desktop — happy path actual, regresión)
 *
 * Por cada ruta × ancho: screenshot + medición OBJETIVA de overflow
 * horizontal (documentElement.scrollWidth > clientWidth — el
 * `overflow-x-hidden` del shell enmascara overflows, por eso se mide en el
 * documentElement). Salida: PNGs por ancho + summary.json consolidado en
 * tmp/screenshots/responsive-admin/ (gitignored).
 *
 * Rutas con 404/redirect por falta de datos o por modo de tienda se registran
 * con su status en el summary pero NO cuentan como overflow.
 *
 * NO gatea CI todavía (sin asserts — el gate se cablea en otra fase); termina
 * con el conteo de overflows por ancho en consola.
 *
 * Local: corre contra el dev server (:4000).
 */

const strip = (v: string | undefined) => v?.replace(/^["']|["']$/g, "");
const prisma = new PrismaClient();
const service = createClient(
  strip(process.env.NEXT_PUBLIC_SUPABASE_URL)!,
  strip(process.env.SUPABASE_SECRET_KEY)!,
  { auth: { persistSession: false } },
);

const RUN = `ra-${Date.now()}`;
const ADMIN_EMAIL = `${RUN}@example.com`;
const ADMIN_PASSWORD = "RA-Admin-918273650";
let supabaseUserId = "";
let adminId = "";
let totpSecret = "";

const OUT_DIR = path.resolve(__dirname, "../../../../tmp/screenshots/responsive-admin");
const ADMIN_NAV_SOURCE = path.resolve(__dirname, "../../lib/admin-nav.ts");

const VIEWPORTS = [
  { name: "375", width: 375, height: 812 },
  { name: "768", width: 768, height: 1024 },
  { name: "1024", width: 1024, height: 768 },
  { name: "1280", width: 1280, height: 800 },
] as const;

/** Hrefs de primer nivel del nav admin (grupos hoja + items), deduped. */
function extractAdminRoutes(): string[] {
  const source = fs.readFileSync(ADMIN_NAV_SOURCE, "utf8");
  const hrefs = new Set<string>();
  for (const match of source.matchAll(/href:\s*"(\/admin\/[^"#]*)"/g)) {
    hrefs.add(match[1]);
  }
  return [...hrefs];
}

// 39 rutas × 4 anchos con dev server (compilación por ruta) necesita bastante
// más que el default de 60s.
test.setTimeout(1_800_000);

test.beforeAll(async () => {
  const { data, error } = await service.auth.admin.createUser({
    email: ADMIN_EMAIL,
    password: ADMIN_PASSWORD,
    email_confirm: true,
  });
  if (error || !data.user) throw new Error(`no auth user: ${error?.message}`);
  supabaseUserId = data.user.id;
  const admin = await prisma.adminUser.create({
    data: { supabaseUserId, email: ADMIN_EMAIL, role: "SUPERADMIN", isActive: true },
  });
  adminId = admin.id;
  // MFA obligatorio (B-1): sin factor TOTP el admin efímero no pasa del enrolamiento.
  totpSecret = await enrollTotpFactor(ADMIN_EMAIL, ADMIN_PASSWORD);
});

test.afterAll(async () => {
  if (adminId) await prisma.adminUser.deleteMany({ where: { id: adminId } }).catch(() => {});
  if (supabaseUserId) await service.auth.admin.deleteUser(supabaseUserId).catch(() => {});
  await prisma.$disconnect();
});

async function adminLogin(page: Page) {
  await page.goto("/admin", { waitUntil: "domcontentloaded" });
  const emailInput = page.locator('input[name="email"], input[type="email"]').first();
  if (await emailInput.count()) {
    await emailInput.fill(ADMIN_EMAIL);
    await page
      .locator('input[name="password"], input[type="password"]')
      .first()
      .fill(ADMIN_PASSWORD);
    await page
      .getByRole("button", { name: /Iniciar sesión|Ingresar|Entrar/i })
      .first()
      .click();
    await page
      .locator('input[name="email"], input[type="email"]')
      .first()
      .waitFor({ state: "detached", timeout: 30_000 })
      .catch(() => {});
    // Tras el login con password viene el reto TOTP (MFA obligatorio, B-1).
    await completeMfaChallengeIfNeeded(page, totpSecret);
  }
  await page.waitForTimeout(2000);
}

type SummaryEntry = {
  width: number;
  route: string;
  screenshot: string;
  horizontalOverflow: boolean;
  scrollWidth: number;
  clientWidth: number;
  status: number | null;
  /** URL final tras redirects (modo catálogo, guards RBAC, etc.). */
  finalUrl: string;
};

test("auditoría responsive admin — todas las secciones × 4 anchos", async ({ page }) => {
  // Campos reales para los editores dinámicos (misma cobertura que E1).
  const [heroField, listField] = await Promise.all([
    prisma.cmsField.findUnique({ where: { key: "home.hero.title" }, select: { id: true } }),
    prisma.cmsField.findUnique({ where: { key: "footer.legal.links" }, select: { id: true } }),
  ]);

  const navRoutes = extractAdminRoutes();
  const extras: string[] = [
    "/admin/contenido/paginas/inicio",
    ...(heroField ? [`/admin/contenido/campos/${heroField.id}`] : []),
    ...(listField ? [`/admin/contenido/campos/${listField.id}`] : []),
  ];
  const ROUTES = [...navRoutes, ...extras.filter((r) => !navRoutes.includes(r))];

  fs.mkdirSync(OUT_DIR, { recursive: true });
  await adminLogin(page);

  const summary: SummaryEntry[] = [];

  for (const vp of VIEWPORTS) {
    await page.setViewportSize({ width: vp.width, height: vp.height });
    const dir = path.join(OUT_DIR, vp.name);
    fs.mkdirSync(dir, { recursive: true });
    let overflows = 0;

    for (const routePath of ROUTES) {
      const resp = await page.goto(routePath, { waitUntil: "domcontentloaded" }).catch(() => null);
      await page.waitForTimeout(2200); // hidratación + datos (dev server)
      const metrics = await page.evaluate(() => ({
        scrollWidth: document.documentElement.scrollWidth,
        clientWidth: document.documentElement.clientWidth,
      }));
      const name = routePath.replace(/^\/admin\/?/, "").replaceAll("/", "-") || "index";
      const shot = `${vp.name}/${name}.png`;
      await page.screenshot({ path: path.join(OUT_DIR, shot), fullPage: true });
      const status = resp?.status() ?? null;
      const finalPath = new URL(page.url()).pathname;
      // 404 o redirect por falta de datos / modo de tienda: se registra pero
      // no cuenta como overflow real.
      const counts = status === 200 && finalPath === routePath;
      const horizontalOverflow = counts && metrics.scrollWidth > metrics.clientWidth + 1;
      if (horizontalOverflow) overflows += 1;
      summary.push({
        width: vp.width,
        route: routePath,
        screenshot: `tmp/screenshots/responsive-admin/${shot}`,
        horizontalOverflow,
        scrollWidth: metrics.scrollWidth,
        clientWidth: metrics.clientWidth,
        status,
        finalUrl: finalPath,
      });
      console.log(
        `${horizontalOverflow ? "❌ OVERFLOW" : counts ? "✅" : "⚠️ "} [${vp.name}] ${routePath} — scrollW ${metrics.scrollWidth} / clientW ${metrics.clientWidth} (HTTP ${status ?? "?"}${finalPath !== routePath ? ` → ${finalPath}` : ""})`,
      );
    }
    console.log(`\n══ ANCHO ${vp.name}: ${overflows} overflows reales ══\n`);
  }

  fs.writeFileSync(path.join(OUT_DIR, "summary.json"), JSON.stringify(summary, null, 2));

  // Verificación del AdminTabBar sticky bajo la topbar móvil (60px): tras
  // hacer scroll en <lg la tabbar debe quedar visible justo bajo la topbar
  // (antes quedaba oculta tras ella — ambas eran sticky top-0).
  for (const vp of VIEWPORTS.filter((v) => v.width < 1024)) {
    await page.setViewportSize({ width: vp.width, height: vp.height });
    await page.goto("/admin/disenos", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(2200);
    await page.evaluate(() => window.scrollTo(0, 600));
    await page.waitForTimeout(400);
    const tabBar = page.locator('[role="tablist"]').first();
    const box = await tabBar.boundingBox();
    const visible = box !== null && box.y >= 55 && box.y <= 70;
    console.log(
      `${visible ? "✅" : "❌"} [${vp.name}] AdminTabBar tras scroll — y=${box ? Math.round(box.y) : "n/a"} (esperado ~60, bajo la topbar móvil)`,
    );
    await page.screenshot({ path: path.join(OUT_DIR, vp.name, "disenos-scrolled.png") });
  }

  const totals = VIEWPORTS.map((vp) => {
    const entries = summary.filter((s) => s.width === vp.width);
    return `${vp.name}px: ${entries.filter((s) => s.horizontalOverflow).length}/${entries.length}`;
  });
  console.log(`\nRESUMEN RESPONSIVE-ADMIN — overflows por ancho → ${totals.join(" · ")}`);

  // GATE (nightly-full.yml, 2026-09-18): CERO overflow horizontal en cualquier
  // ancho. Las rutas con 404/redirect por falta de datos o modo de tienda ya
  // quedaron fuera del conteo (`counts`), así que el gate es estable.
  const failures = summary.filter((s) => s.horizontalOverflow);
  expect(
    failures.map(
      (f) => `@${f.width} ${f.route} (scrollW ${f.scrollWidth} > clientW ${f.clientWidth})`,
    ),
    `Overflow horizontal detectado en admin:\n${failures.map((f) => `  @${f.width} ${f.route}`).join("\n")}`,
  ).toEqual([]);
});
