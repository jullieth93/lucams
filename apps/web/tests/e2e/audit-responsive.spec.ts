import fs from "node:fs";
import path from "node:path";
import type { Page, TestInfo } from "@playwright/test";
// OJO: el import de Prisma debe ser ESTÁTICO (patrón de a11y.spec.ts /
// audit-cliente.spec.ts). Un `await import("@lucams/db")` en beforeAll revienta
// en el worker de Playwright ("exports is not defined in ES module scope").
import { PrismaClient } from "@lucams/db";
import { test, expect, dismissCookieBanner, E2E_ENV } from "./fixtures/auth";

/*
 * AUDITORÍA RESPONSIVE GLOBAL — Fase 5.1-5.2 (2026-10-13): harness de la
 * auditoría responsive cliente + admin en 6 perfiles de viewport:
 *
 *   - desktop-chrome    1280×800  (proyecto base, ya existía)
 *   - mobile-chrome      390×844  (proyecto base, ya existía)
 *   - mobile-landscape   844×390
 *   - tablet             768×1024
 *   - tablet-landscape  1024×768
 *   - desktop-large     1920×1080
 *
 * Matriz de pantallas (rutas reales de app/ y app/admin/(panel)/):
 *   - cliente público: /, /productos, /producto/<slug vivo>, /carrito,
 *     /checkout/datos, /login, /registro.
 *   - cliente autenticado (storageState "client" del global.setup): /mi-cuenta,
 *     pedidos, disenos, perfil. Se SALTA sin storageState (patrón fixtures/auth).
 *   - admin (storageState "admin"): dashboard, pedidos, productos, clientes,
 *     carritos, cupones, contenido/paginas, metricas. Idem skip sin state.
 *
 * Chequeos por pantalla × perfil:
 *   a. Overflow horizontal OBJETIVO (documentElement.scrollWidth > clientWidth+1)
 *      → critical, con el elemento culpable (el de mayor borde derecho).
 *   b. Tap targets en perfiles táctiles: a/button visibles en viewport con
 *      alto <40px → WARNING (medium, NO fallo duro).
 *   c. Screenshot full-page en tmp/audit-20261013/<perfil>/<ruta>.png.
 *
 * Reporte: cada test escribe su parte en tmp/audit-20261013/parts/ y el
 * global.teardown las consolida en tmp/audit-20261013/report.json (los workers
 * corren perfiles en paralelo — el merge centralizado evita escrituras
 * concurrentes del mismo archivo).
 *
 * Gate: los hallazgos critical (overflow / carga rota) FALLAN el test; los
 * medium (tap targets) solo se reportan. Corre con E2E_ENV=local|stg (auth
 * vía storageState compartido, igual que los specs de homologación).
 *
 * OJO viewport: los contextos de fixtures/auth (adminPage/clientPage) se crean
 * con browser.newContext() manual y NO heredan el viewport del proyecto
 * (precedente: mobile-admin-audit.spec.ts fija el suyo) — acá se fija
 * explícito desde testInfo.project.use.viewport en los 3 grupos.
 */

const OUT_DIR = path.resolve(__dirname, "../../../../tmp/audit-20261013");
const PARTS_DIR = path.join(OUT_DIR, "parts");

type Severidad = "critical" | "medium" | "info";

type Hallazgo = { severidad: Severidad; tipo: string; detalle: string };

type PantallaAudit = {
  ruta: string;
  grupo: string;
  status: number | null;
  urlFinal: string;
  screenshot: string;
  scrollWidth: number;
  clientWidth: number;
  hallazgos: Hallazgo[];
};

type PartePerfil = {
  proyecto: string;
  viewport: { width: number; height: number };
  tactil: boolean;
  ambiente: string;
  generado: string;
  pantallas: PantallaAudit[];
};

const RUTAS_CLIENTE_AUTH = [
  "/mi-cuenta",
  "/mi-cuenta/pedidos",
  "/mi-cuenta/disenos",
  "/mi-cuenta/perfil",
];

const RUTAS_ADMIN = [
  "/admin/dashboard",
  "/admin/pedidos",
  "/admin/productos",
  "/admin/clientes",
  "/admin/carritos",
  "/admin/cupones",
  "/admin/contenido/paginas",
  "/admin/metricas",
];

// PDP: slug del catálogo VIVO (los slugs cambian con archivados/renombres —
// hardcodearlos ya rompió audits, ver audit-cliente.spec.ts). Fallback al
// primer slug del seed dev si no hay DB accesible.
let pdpSlug = "set-fotoimanes-polaroid";

test.beforeAll(async () => {
  if (!process.env.DATABASE_URL?.startsWith("postgres")) return;
  const prisma = new PrismaClient();
  try {
    const vivo = await prisma.product.findFirst({
      where: {
        deletedAt: null,
        isActive: true,
        category: { deletedAt: null, isActive: true },
      },
      orderBy: [{ isFeatured: "desc" }, { createdAt: "desc" }],
      select: { slug: true },
    });
    if (vivo) pdpSlug = vivo.slug;
  } catch (e) {
    console.warn(`[audit-responsive] resolución de PDP viva falló, usando fallback: ${e}`);
  } finally {
    await prisma.$disconnect();
  }
});

function perfilDe(testInfo: TestInfo): PartePerfil {
  return {
    proyecto: testInfo.project.name,
    viewport: testInfo.project.use.viewport ?? { width: 1280, height: 720 },
    tactil: testInfo.project.use.hasTouch === true,
    ambiente: E2E_ENV,
    generado: new Date().toISOString(),
    pantallas: [],
  };
}

function slugDeRuta(ruta: string): string {
  return ruta === "/" ? "home" : ruta.replace(/^\//, "").replaceAll("/", "-");
}

async function auditPantalla(
  page: Page,
  ruta: string,
  grupo: string,
  perfil: PartePerfil,
  { cookies = false }: { cookies?: boolean } = {},
): Promise<PantallaAudit> {
  const hallazgos: Hallazgo[] = [];
  const resp = await page.goto(ruta, { waitUntil: "domcontentloaded" }).catch(() => null);
  // Estabilización (patrón de responsive-admin-audit.spec.ts): hidratación +
  // datos, generosa con el dev server.
  await page.waitForTimeout(2200);
  // El banner de cookies (fixed, z-9000) solo existe en el storefront: tapa
  // CTAs bajo el fold e inflaría los tap targets <40px reportados.
  if (cookies) await dismissCookieBanner(page);

  const status = resp?.status() ?? null;
  const urlFinal = new URL(page.url()).pathname;
  if (status === null || status >= 400) {
    hallazgos.push({
      severidad: "critical",
      tipo: "carga",
      detalle: `HTTP ${status ?? "sin respuesta"}`,
    });
  }
  if (urlFinal !== ruta) {
    // Redirects esperados (checkout sin carrito → /carrito, guards RBAC…) se
    // registran como info, no como fallo.
    hallazgos.push({ severidad: "info", tipo: "redirect", detalle: `${ruta} → ${urlFinal}` });
  }

  const overflow = await page.evaluate(() => {
    const cw = document.documentElement.clientWidth;
    const sw = document.documentElement.scrollWidth;
    const describe = (el: Element) => {
      const tag = el.tagName.toLowerCase();
      const id = el.id ? `#${el.id}` : "";
      const cls = (el.getAttribute("class") ?? "")
        .trim()
        .split(/\s+/)
        .filter(Boolean)
        .slice(0, 3)
        .join(".");
      const txt = (el.textContent ?? "").trim().replace(/\s+/g, " ").slice(0, 40);
      return `${tag}${id}${cls ? `.${cls}` : ""} "${txt}"`;
    };
    let culpable: string | null = null;
    if (sw > cw + 1) {
      // El elemento con mayor borde derecho es el que empuja el ancho del
      // documento (más útil que el primero en orden de documento, que suele
      // ser un ancestro genérico).
      let maxRight = 0;
      for (const el of document.querySelectorAll("body *")) {
        const r = el.getBoundingClientRect();
        if (r.width > 0 && r.right > cw + 1 && r.right > maxRight) {
          maxRight = r.right;
          culpable = describe(el);
        }
      }
    }
    return { desborda: sw > cw + 1, scrollWidth: sw, clientWidth: cw, culpable };
  });
  if (overflow.desborda) {
    hallazgos.push({
      severidad: "critical",
      tipo: "overflow-horizontal",
      detalle:
        `scrollWidth ${overflow.scrollWidth} > clientWidth ${overflow.clientWidth}` +
        (overflow.culpable ? `; culpable: ${overflow.culpable}` : ""),
    });
  }

  if (perfil.tactil) {
    const pequenos = await page.evaluate(() => {
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      const malos: string[] = [];
      for (const el of Array.from(document.querySelectorAll("a, button"))) {
        const r = el.getBoundingClientRect();
        if (r.width === 0 || r.height === 0) continue;
        const s = getComputedStyle(el);
        if (s.display === "none" || s.visibility === "hidden") continue;
        // Solo targets visibles EN viewport (lo que el usuario ve sin scroll).
        if (r.bottom < 0 || r.top > vh || r.right < 0 || r.left > vw) continue;
        // WCAG apunta a 44px; <40px se reporta como WARNING (no fallo duro).
        if (r.height < 40) {
          const txt = (el.textContent ?? "").trim().replace(/\s+/g, " ").slice(0, 30);
          malos.push(`${el.tagName.toLowerCase()} "${txt}" (${Math.round(r.height)}px)`);
        }
        if (malos.length >= 15) break;
      }
      return malos;
    });
    if (pequenos.length > 0) {
      hallazgos.push({
        severidad: "medium",
        tipo: "tap-target",
        detalle: `${pequenos.length} targets <40px en viewport: ${pequenos.slice(0, 5).join(" | ")}`,
      });
    }
  }

  const relShot = `${perfil.proyecto}/${slugDeRuta(ruta)}.png`;
  fs.mkdirSync(path.join(OUT_DIR, perfil.proyecto), { recursive: true });
  // caret:"initial" — el default (hide) marca carets transparent y dispara
  // falsos mismatches de hidratación en páginas con forms (ver audit-cliente).
  await page.screenshot({ caret: "initial", path: path.join(OUT_DIR, relShot), fullPage: true });

  const peor = hallazgos.some((h) => h.severidad === "critical")
    ? "❌"
    : hallazgos.some((h) => h.severidad === "medium")
      ? "⚠️"
      : "✅";
  console.log(
    `${peor} [${perfil.proyecto}] ${ruta} — HTTP ${status ?? "?"} · scrollW ${overflow.scrollWidth}/clientW ${overflow.clientWidth} · ${hallazgos.length} hallazgos`,
  );

  return {
    ruta,
    grupo,
    status,
    urlFinal,
    screenshot: `tmp/audit-20261013/${relShot}`,
    scrollWidth: overflow.scrollWidth,
    clientWidth: overflow.clientWidth,
    hallazgos,
  };
}

async function correrGrupo(
  page: Page,
  grupo: string,
  rutas: string[],
  testInfo: TestInfo,
  opts: { cookies?: boolean } = {},
): Promise<void> {
  const perfil = perfilDe(testInfo);
  await page.setViewportSize(perfil.viewport);
  fs.mkdirSync(PARTS_DIR, { recursive: true });

  const pantallas: PantallaAudit[] = [];
  for (const ruta of rutas) pantallas.push(await auditPantalla(page, ruta, grupo, perfil, opts));
  perfil.pantallas = pantallas;
  fs.writeFileSync(
    path.join(PARTS_DIR, `${perfil.proyecto}-${grupo}.json`),
    JSON.stringify(perfil, null, 2),
  );

  const criticos = pantallas.flatMap((p) =>
    p.hallazgos
      .filter((h) => h.severidad === "critical")
      .map((h) => `  [${perfil.proyecto}] ${p.ruta} — ${h.tipo}: ${h.detalle}`),
  );
  expect(
    criticos,
    `Hallazgos CRÍTICOS en ${grupo} @${perfil.proyecto}:\n${criticos.join("\n")}`,
  ).toEqual([]);
}

test.describe("auditoría responsive global — cliente + admin × 6 perfiles", () => {
  test.setTimeout(600_000);

  test("cliente público", async ({ page }, testInfo) => {
    await correrGrupo(
      page,
      "cliente-publico",
      // 2026-10-13 — `/checkout` no tiene page.tsx (solo subrutas datos/envio/
      // pago/gracias) → 404 por diseño. Se audita `/checkout/datos`, que sin
      // carrito redirige a /carrito (queda registrado como info).
      [
        "/",
        "/productos",
        `/producto/${pdpSlug}`,
        `/estudio/${pdpSlug}`,
        "/carrito",
        "/checkout/datos",
        "/login",
        "/registro",
      ],
      testInfo,
      { cookies: true },
    );
  });

  // Requiere E2E_AUTH=1 (storageState del global.setup); sin state se salta
  // con mensaje claro (patrón fixtures/auth.ts).
  test("cliente autenticado", async ({ clientPage }, testInfo) => {
    await correrGrupo(clientPage, "cliente-auth", RUTAS_CLIENTE_AUTH, testInfo, {
      cookies: true,
    });
  });

  test("admin", async ({ adminPage }, testInfo) => {
    await correrGrupo(adminPage, "admin", RUTAS_ADMIN, testInfo);
  });
});
