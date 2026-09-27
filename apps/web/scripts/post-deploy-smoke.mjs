#!/usr/bin/env node
/*
 * post-deploy-smoke.mjs — Smoke post-deploy de PRD (F-08, auditoría 2026-09-26,
 * remediación R3). Antes la verificación post-deploy era un spec manual; este
 * script la automatiza y FALLA (exit 1) si algo no responde.
 *
 * SOLO LECTURA, todo GET público (no inventa secretos ni toca nada autenticado):
 *   - /api/health        liveness de la app
 *   - /api/health/db     Postgres vía Prisma
 *   - /api/health/crons  dead-man de los crons pg_cron (503 si alguno está stale)
 *   - /                  homepage (journey read-only crítico)
 *   - /productos         catálogo (journey read-only crítico)
 *
 * Cada sonda exige HTTP 200 con hasta 3 reintentos (backoff 10s/20s) para tolerar
 * la propagación del deploy de Vercel justo tras el push. Un 429 (rate limit
 * 30/min de los healthchecks) se reintenta igual — las 5 sondas están muy por
 * debajo del límite, un 429 indicaría otra cosa golpeando desde la misma IP.
 *
 * A11R-04 (revisión adversarial de la remediación, 2026-09-27): las sondas HTML
 * además aserten CONTENIDO mínimo — marcadores estructurales estables del
 * storefront que NO dependen de datos (landmarks del layout raíz). Un 200 con
 * body vacío/degradado (crash del render, layout roto, error page sin main) ya
 * no sale verde. Los marcadores son los mismos en / y /productos:
 *   - `lang="es-CO"`      <html> del root layout
 *   - `href="#contenido"` skip-link (WCAG 2.4.1), primer elemento del <body>
 *   - `id="contenido"`    landmark <main> de la página
 * No se aserta contenido de catálogo (productos/categorías concretos): eso es
 * dato, no estructura, y volvería el smoke frágil ante cambios de catálogo.
 *
 * Uso:
 *   node apps/web/scripts/post-deploy-smoke.mjs
 *   SMOKE_BASE_URL=https://staging.example.com node apps/web/scripts/post-deploy-smoke.mjs
 */

const BASE_URL = (process.env.SMOKE_BASE_URL ?? "https://lucamsshop.com").replace(/\/$/, "");

// A11R-04 — marcadores estructurales del storefront (ver header del script).
const STOREFRONT_MARKERS = ['lang="es-CO"', 'href="#contenido"', 'id="contenido"'];

const PROBES = [
  { path: "/api/health", label: "liveness app" },
  { path: "/api/health/db", label: "postgres (Prisma)" },
  { path: "/api/health/crons", label: "dead-man crons pg_cron" },
  { path: "/", label: "homepage", mustContain: STOREFRONT_MARKERS },
  { path: "/productos", label: "catálogo", mustContain: STOREFRONT_MARKERS },
];

const ATTEMPTS = 3;
const BACKOFF_MS = [10_000, 20_000];
const TIMEOUT_MS = 15_000;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function probe({ path, label, mustContain }) {
  const url = `${BASE_URL}${path}`;
  let lastDetail = "";
  for (let attempt = 1; attempt <= ATTEMPTS; attempt++) {
    const start = Date.now();
    try {
      const res = await fetch(url, {
        redirect: "manual",
        signal: AbortSignal.timeout(TIMEOUT_MS),
        headers: { "user-agent": "lucams-post-deploy-smoke/1.0" },
      });
      const latencyMs = Date.now() - start;
      if (res.status === 200) {
        // A11R-04 — aserción de contenido: un 200 sin los marcadores estructurales
        // es una página vacía/degradada → la sonda FALLA igual que un 500.
        if (mustContain) {
          const body = await res.text();
          const missing = mustContain.filter((marker) => !body.includes(marker));
          if (missing.length > 0) {
            lastDetail = `HTTP 200 pero faltan marcadores: ${missing.join(", ")}`;
          } else {
            console.log(`  ✓ ${label.padEnd(26)} ${path.padEnd(20)} 200 + contenido (${latencyMs}ms)`);
            return true;
          }
        } else {
          console.log(`  ✓ ${label.padEnd(26)} ${path.padEnd(20)} 200 (${latencyMs}ms)`);
          return true;
        }
      } else {
        lastDetail = `HTTP ${res.status}`;
      }
    } catch (err) {
      lastDetail = err instanceof Error ? err.message : String(err);
    }
    if (attempt < ATTEMPTS) {
      console.warn(
        `  … ${label} intento ${attempt}/${ATTEMPTS}: ${lastDetail} — reintentando en ${BACKOFF_MS[attempt - 1] / 1000}s`,
      );
      await sleep(BACKOFF_MS[attempt - 1]);
    }
  }
  console.error(`  ✗ ${label.padEnd(26)} ${path.padEnd(20)} FALLO: ${lastDetail}`);
  return false;
}

console.log(`Post-deploy smoke contra ${BASE_URL} (${PROBES.length} sondas read-only)`);
const results = await Promise.all(PROBES.map(probe));
const failed = PROBES.filter((_, i) => !results[i]);

if (failed.length > 0) {
  console.error(
    `\nSMOKE POST-DEPLOY ROJO: ${failed.map((p) => p.path).join(", ")} no responden 200 con el contenido esperado. ` +
      `Evaluar rollback (docs/OPERATIONS.md) antes de certificar el release.`,
  );
  process.exit(1);
}
console.log("\nOK: smoke post-deploy verde.");
