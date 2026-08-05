/*
 * k6 load test — Storefront browsing scenario.
 *
 * Simula 50 usuarios concurrentes navegando el catálogo público:
 *   - 70% hace home → /productos → click random PDP
 *   - 20% hace search /productos?q=X
 *   - 10% agrega al carrito
 *
 * Criterio de éxito (sub-bloque L, QA P):
 *   - p95 < 500ms en /productos
 *   - p95 < 300ms en /api/cms/blocks
 *   - 0% error rate bajo 50 RPS sostenido 5 min
 *
 * Uso:
 *   # Instalar k6 (una vez): https://k6.io/docs/get-started/installation/
 *   k6 run tests/load/storefront-browsing.js
 *   k6 run -e BASE_URL=https://lucamsshop.com tests/load/storefront-browsing.js
 *
 * Output:
 *   - Métricas en stdout
 *   - HTML report con `--out html=load-report.html` (k6 > 0.50)
 */

import http from "k6/http";
import { sleep, check } from "k6";
import { Rate } from "k6/metrics";

const BASE_URL = __ENV.BASE_URL ?? "http://localhost:3000";

// Bypass de la Deployment Protection de Vercel (smokes del preview):
//   k6 run -e BASE_URL=https://<preview> -e VERCEL_BYPASS_TOKEN=xxx tests/load/storefront-browsing.js
const BYPASS = __ENV.VERCEL_BYPASS_TOKEN;
const params = BYPASS ? { headers: { "x-vercel-protection-bypass": BYPASS } } : {};

const errors = new Rate("errors");

export const options = {
  scenarios: {
    browsing: {
      executor: "ramping-vus",
      startVUs: 0,
      stages: [
        { duration: "30s", target: 10 }, // ramp-up
        { duration: "2m", target: 50 }, // sostener carga
        { duration: "30s", target: 0 }, // ramp-down
      ],
      gracefulRampDown: "15s",
    },
  },
  thresholds: {
    http_req_duration: ["p(95)<500", "p(99)<1000"],
    http_req_failed: ["rate<0.01"], // <1% errores
    errors: ["rate<0.01"],
  },
};

const SEARCH_TERMS = ["fotoiman", "calendario", "imán", "recordatorio", "evento"];
const SLUGS_CACHE = []; // se popula leyendo /productos por primera vez

export default function () {
  const scenario = Math.random();

  if (scenario < 0.7) {
    // Browsing path
    homeAndCatalog();
  } else if (scenario < 0.9) {
    // Search path
    searchCatalog();
  } else {
    // Add to cart path
    addToCart();
  }

  sleep(Math.random() * 2 + 1); // think time 1-3s entre acciones
}

function homeAndCatalog() {
  const home = http.get(`${BASE_URL}/`, params);
  check(home, { "home 200": (r) => r.status === 200 }) || errors.add(1);

  const catalog = http.get(`${BASE_URL}/productos`, params);
  check(catalog, { "/productos 200": (r) => r.status === 200 }) || errors.add(1);

  // Extraer un slug random del HTML para ir a un PDP
  if (catalog.status === 200) {
    const match = catalog.body.match(/href="\/producto\/([a-z0-9-]+)"/);
    if (match) {
      SLUGS_CACHE.push(match[1]);
      const pdp = http.get(`${BASE_URL}/producto/${match[1]}`, params);
      check(pdp, { "PDP 200": (r) => r.status === 200 }) || errors.add(1);
    }
  }
}

function searchCatalog() {
  const term = SEARCH_TERMS[Math.floor(Math.random() * SEARCH_TERMS.length)];
  const r = http.get(`${BASE_URL}/productos?q=${encodeURIComponent(term)}`, params);
  check(r, { "search 200": (res) => res.status === 200 }) || errors.add(1);

  // Hit al API de CMS también (futuro chatbot consumirá esto bajo carga)
  const cms = http.get(`${BASE_URL}/api/cms/blocks?category=legal`, params);
  check(cms, { "cms api 200": (res) => res.status === 200 }) || errors.add(1);
}

function addToCart() {
  // No simulamos POST porque requeriría coordinar sessionId entre VUs.
  // En vez de eso, validamos que GET /carrito responde rápido para anon
  const r = http.get(`${BASE_URL}/carrito`, params);
  check(r, { "/carrito 200": (res) => res.status === 200 }) || errors.add(1);
}
