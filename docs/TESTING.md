# Testing — Lucams_shop

> Estrategia de pruebas. Qué probamos, con qué herramienta, qué cubrimos manualmente y qué no probamos. Sin pruebas, no hay productivo.

## Tabla de contenido

1. [Pirámide de pruebas](#pirámide-de-pruebas)
2. [Stack](#stack)
3. [Convenciones](#convenciones)
4. [Mock vs real](#mock-vs-real)
5. [Tests unitarios (Vitest)](#tests-unitarios-vitest)
6. [Tests de integración](#tests-de-integración)
7. [Tests de RLS](#tests-de-rls)
8. [Tests E2E (Playwright)](#tests-e2e-playwright)
9. [Visual regression](#visual-regression)
10. [Accesibilidad automatizada](#accesibilidad-automatizada)
11. [Performance / load testing](#performance--load-testing)
12. [Smoke tests post-deploy](#smoke-tests-post-deploy)
13. [Tests de seguridad](#tests-de-seguridad)
14. [CI workflow](#ci-workflow)
15. [Coverage targets](#coverage-targets)
16. [Tests que NO escribimos](#tests-que-no-escribimos)

---

## Pirámide de pruebas

```
        ╱─────────╲
       ╱   E2E    ╲     ~10% — caros, lentos, frágiles. Solo flujos críticos.
      ╱  smoke +   ╲
     ╱  visual reg.  ╲
    ╱─────────────────╲
   ╱  Integración +    ╲   ~30% — service ↔ DB real, RLS, webhook signature
  ╱       RLS           ╲
 ╱───────────────────────╲
╱   Unit (puros, fast)    ╲   ~60% — service.ts mockeado, formatters, validators
─────────────────────────────
```

**Principio:** la base es ancha (rápida, barata) y la cima es estrecha (lenta, valiosa). Si el unit cubre 90% de la lógica, los E2E solo necesitan validar flujos.

---

## Stack

| Capa                      | Herramienta                                         | Por qué                                                                  |
| ------------------------- | --------------------------------------------------- | ------------------------------------------------------------------------ |
| Unit + integración rápida | **Vitest**                                          | Rápido, ESM-native, compatible con TS, mejor DX que Jest                 |
| Component (React)         | **Vitest + Testing Library**                        | Idem + RTL para query semántico                                          |
| E2E navegador             | **Playwright**                                      | Soporta multi-browser, autoespera, generación de codegen, paralelización |
| Visual regression         | **Playwright screenshots** + comparación Pixelmatch | Suficiente sin pagar Chromatic/Percy en MVP                              |
| Performance               | **Lighthouse CI** + **k6** (load testing)           | Lighthouse para web vitals, k6 para load API                             |
| Accesibilidad             | **`@axe-core/playwright`** + **`@axe-core/react`**  | Automatiza WCAG 2.1 AA                                                   |
| Mocking de red            | **MSW** (Mock Service Worker)                       | Intercepta fetch sin tocar el código bajo test                           |
| DB tests (RLS)            | **Supabase local** + Vitest                         | DB real, no mock, único modo de validar RLS                              |

---

## Convenciones

### Naming

- Archivos: `*.test.ts` o `*.test.tsx` al lado del archivo bajo test.
- E2E: `e2e/<flujo>.spec.ts` en raíz del repo o `apps/web/e2e/`.
- Bloques: `describe('Service: createOrder', ...)`, `it('rejects invalid email', ...)`.
- Mensajes en presente, en español es OK: `it('rechaza email inválido', ...)`.

### Estructura

```
features/checkout/
├── service.ts
├── service.test.ts          # Unit (con repo mockeado)
├── service.integration.test.ts  # Integración (DB real)
├── repository.ts
├── repository.test.ts       # DB real, transacciones rollbackeadas
└── components/
    └── checkout-form.tsx
    └── checkout-form.test.tsx   # Component (RTL)
```

### Hooks comunes

```ts
// __tests__/setup.ts
import { beforeAll, afterAll, afterEach } from "vitest";
import { server } from "./msw-server";

beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());
```

---

## Mock vs real

### Regla de oro

> **Mock cuando el dependiente cuesta dinero, lentitud o flakiness. Real en todo lo demás.**

| Dependencia                                             | Estrategia                            | Razón                                                         |
| ------------------------------------------------------- | ------------------------------------- | ------------------------------------------------------------- |
| **Postgres**                                            | Real (Supabase local)                 | RLS, transacciones, pgmq, pg_cron solo se validan con DB real |
| **Wompi API**                                           | MSW intercept con respuestas grabadas | Cuenta de costo + sandbox lento                               |
| **Aveonline API**                                       | MSW intercept                         | Idem                                                          |
| **Anthropic API**                                       | MSW intercept                         | Costo + lentitud + variabilidad de respuesta IA               |
| **Resend API**                                          | MSW intercept                         | Costo del free tier                                           |
| **Supabase Storage**                                    | Real (Supabase local)                 | Validar URL firmada, MIME, etc.                               |
| **Supabase Auth**                                       | Real (Supabase local)                 | Sesiones, MFA, etc.                                           |
| **Lib internas** (`lib/cart.ts`, `lib/format.ts`, etc.) | Sin mock — funciones puras            | Mock de funciones puras es antipatrón                         |
| **Repository**                                          | Mock en unit, real en integración     | Permite separar lógica de dominio de infraestructura          |

### Anti-patrones a evitar

- **Mockear lo que estás probando.** Si `service.ts` llama a `repository.ts` y mockeas el repo en `service.test.ts`, OK. Si en `repository.test.ts` mockeas Prisma → no hay test real, hay test del mock.
- **Mockear funciones puras.** No tiene sentido. Llámalas directo.
- **Snapshots gigantes.** Frágiles y nadie los lee. Usar assertions explícitas en campos importantes.

---

## Tests unitarios (Vitest)

### Qué cubrimos

- `lib/format.ts` (formatCOP, fechas, etc.)
- `lib/payment/wompi.ts` — cálculo de firma de integridad y verificación de webhook
- `lib/csrf.ts` — generación y verificación de tokens
- `lib/idempotency.ts` — cache hit/miss/conflict
- `lib/redirects.ts` — `safeRedirectTarget` (open redirect prevention)
- `lib/retry.ts`, `lib/circuit-breaker.ts`
- `lib/validation/*` — schemas Zod (casos válidos e inválidos)
- `features/<feature>/service.ts` — toda la lógica de dominio con repo mockeado

### Ejemplo

```ts
// lib/payment/wompi.test.ts
import { describe, it, expect } from "vitest";
import { generateIntegritySignature } from "./wompi";

describe("Wompi integrity signature", () => {
  it("genera SHA256 correcto del concatenado", () => {
    const sig = generateIntegritySignature("REF-123", 1500000, "COP", "test_secret");
    expect(sig).toBe("e8a4f..."); // valor pre-calculado
  });

  it("valor distinto si cambia un solo carácter", () => {
    const a = generateIntegritySignature("REF-123", 1500000, "COP", "test_secret");
    const b = generateIntegritySignature("REF-124", 1500000, "COP", "test_secret");
    expect(a).not.toBe(b);
  });
});
```

### Componentes (React Testing Library)

```tsx
// components/storefront/product-card.test.tsx
import { render, screen } from "@testing-library/react";
import { ProductCard } from "./product-card";

describe("ProductCard", () => {
  const product = { id: "p1", name: "Imán de prueba", basePrice: 1500000, images: ["/p.jpg"] };

  it("muestra el nombre y el precio formateado", () => {
    render(<ProductCard product={product} />);
    expect(screen.getByText("Imán de prueba")).toBeInTheDocument();
    expect(screen.getByText("$15.000")).toBeInTheDocument();
  });

  it("tiene alt text descriptivo en la imagen", () => {
    render(<ProductCard product={product} />);
    expect(screen.getByRole("img")).toHaveAccessibleName(/imán de prueba/i);
  });
});
```

---

## Tests de integración

### Setup

```ts
// __tests__/integration/setup.ts
import { execSync } from "child_process";
import { beforeAll, afterAll, beforeEach } from "vitest";

beforeAll(() => {
  execSync("supabase start", { stdio: "inherit" });
  execSync("pnpm prisma migrate deploy", { stdio: "inherit" });
  execSync("pnpm prisma db seed", { stdio: "inherit" });
});

beforeEach(async () => {
  // Cada test corre en su propia transacción que se rollbackea
  // (alternativa: TRUNCATE las tablas relevantes entre tests)
});

afterAll(() => {
  // No detener supabase entre runs locales para no perder cache
});
```

### Qué cubrimos

- `repository.ts` directo contra Postgres real (transacciones, FK cascades, constraints).
- `service.ts` con repository real (saga pattern, idempotencia, transacciones).
- `lib/queue.ts` — enqueue + read + delete contra `pgmq` real.
- `lib/rate-limit.ts` y `lib/cache.ts` — UPSERT atómico, TTL, cleanup.
- Webhook handlers con request mock (firma válida e inválida).

### Ejemplo

```ts
// features/checkout/service.integration.test.ts
import { describe, it, expect } from "vitest";
import { createOrder } from "./service";
import { createTestCart, createTestCustomer } from "@/__tests__/factories";

describe("createOrder (integration)", () => {
  it("reserva stock al crear order PENDING_PAYMENT", async () => {
    const customer = await createTestCustomer();
    const cart = await createTestCart({
      customerId: customer.id,
      items: [{ variantId: "v1", qty: 2 }],
    });

    const result = await createOrder(
      {
        cartId: cart.id,
        email: customer.email /* ... */,
      },
      "req-test-1",
    );

    const reservation = await prisma.stockReservation.findFirst({
      where: { orderId: result.orderId },
    });
    expect(reservation).toBeTruthy();
    expect(reservation!.qty).toBe(2);
    expect(reservation!.expiresAt.getTime()).toBeGreaterThan(Date.now());
  });

  it("rechaza si no hay stock suficiente", async () => {
    // Setup variant con stock = 0
    // Llamar createOrder
    // Esperar ConflictError
  });
});
```

> **Cobertura del ciclo de reseñas (auditoría v3 · #21, 2026-07-19).** `features/reviews/` tiene
> dos suites de integración contra la BD real (prefijo `RUN` + `afterAll` scoped):
> `service.integration.test.ts` cubre `getProductRatingAggregate` (solo aprobadas de clientes
> reales, ignora demo `customerId=null`), `listFeaturedReviews` (featured + producto activo, orden
> y límite), `listReviewsAdmin` (estado/rating/productId/`pendingCount`) y las transiciones
> approve/reject/toggleFeatured/archive/restore + bulk; `actions.integration.test.ts` cubre
> `submitReviewAction` (gate de sesión, gate de compra, validación, creación pendiente y unicidad
> por cliente/producto — respaldada por el índice único parcial `Review_productId_customerId_active_unique`).

---

## Tests de RLS

> **Críticos.** Sin estos tests, RLS solo es un papel.

> **Cobertura de CI (auditoría 2026-07-13; actualizado 2026-07-31 con A3).** El gate por-PR ENFORCEA
> que _toda tabla tenga RLS habilitada_ (la migración `..._10_rls_sweep_new_tables.sql` hace
> `RAISE EXCEPTION` si queda alguna destapada → un `CREATE TABLE` nuevo sin candado rompe la
> migración). Además, `features/security/rls-coverage.integration.test.ts` corre en el vitest
> por-PR y falla si cualquier tabla de `public` queda sin RLS habilitada. El COMPORTAMIENTO de
> las políticas (que un anon no lea filas de otro) lo valida
> `features/security/rls-matrix.integration.test.ts`, que requiere PostgREST/GoTrue reales y se
> salta en el gate por-PR (Postgres pelado) → corre en **`.github/workflows/nightly-full.yml`**
> (scheduled +
> on-demand). **A3 (2026-07-31):** el "Supabase real" del nightly es el **stack LOCAL de Supabase
> levantado en el propio runner** (`supabase start` desde `.github/ci/localstack`, + `prisma
migrate deploy` + las SQL de `supabase/migrations` aplicadas con el rol `supabase_admin`) —
> ya NO hacen falta un proyecto externo ni secrets `STAGING_*`: cada corrida es efímera y
> reproducible. Exclusiones documentadas por depender del universo del catálogo real completo
> (566 productos — cifra corregida 2026-08-07, la histórica 612 incluía 46
> fixtures de tests ya barridos; los seeds del runner/local siembran el subconjunto base):
> `finalize-server-render` y `letter-tiles` (env `NIGHTLY_LOCALSTACK` en `vitest.config.ts`).
> La postura de grants de prod (PostgREST cerrado para anon/authenticated) quedó codificada en
> `supabase/migrations/00000000000022_revoke_anon_table_grants.sql` para que cualquier ambiente
> nuevo la reproduzca.

```ts
// __tests__/rls.test.ts
import { describe, it, expect } from "vitest";
import { createClient } from "@supabase/supabase-js";

const URL = process.env.SUPABASE_TEST_URL!;
const ANON = process.env.SUPABASE_TEST_ANON!;

async function asUser(email: string, password: string) {
  const sb = createClient(URL, ANON);
  await sb.auth.signInWithPassword({ email, password });
  return sb;
}

describe("RLS: Customer isolation", () => {
  it("cliente A no ve órdenes de cliente B", async () => {
    const sbA = await asUser("a@test.local", "pwdA");
    const { data, error } = await sbA.from("Order").select("*").eq("customerId", "CUSTOMER_B_ID");
    expect(error).toBeNull();
    expect(data).toEqual([]);
  });

  it("cliente sin auth no lee Customer table", async () => {
    const sb = createClient(URL, ANON);
    const { data } = await sb.from("Customer").select("*");
    expect(data).toEqual([]);
  });

  it("cliente normal no lee AdminActionLog", async () => {
    const sbA = await asUser("a@test.local", "pwdA");
    const { data } = await sbA.from("AdminActionLog").select("*");
    expect(data).toEqual([]);
  });

  it("admin SÍ lee órdenes de cualquier cliente", async () => {
    const sbAdmin = await asUser("admin@test.local", "pwdAdmin");
    const { data, error } = await sbAdmin.from("Order").select("*").limit(5);
    expect(error).toBeNull();
    expect(data!.length).toBeGreaterThan(0);
  });
});
```

> **CI:** `rls-coverage` corre en cada PR y bloquea merge si falla; `rls-matrix` corre en el nightly. `make test-rls` corre ambos localmente vía vitest.

---

## Tests E2E (Playwright)

> **⚠️ Estado real en CI (actualizado 2026-08-01).** La tabla de "Flujos críticos" de abajo es el
> ESTADO OBJETIVO; la mayoría de esos flujos **no tiene E2E real todavía** (columna "Estado
> real"). Lo que **sí se gatea en cada PR** hoy (job `e2e` en `.github/workflows/ci.yml`, contra
> el build de producción + Postgres real):
>
> - **`smoke`** — páginas públicas cargan (home, /productos, /ayuda, /contacto, /legal, /status,
>   health, sitemap, robots).
> - **`a11y`** — invariantes por página (lang es-CO, `<main id=contenido>`, alt, ≥1 h1).
> - **`axe`** — auditoría WCAG 2.1 A/AA (gate estricta: 0 serious/critical) en las páginas públicas.
> - **`compra`** — núcleo del carrito → checkout de datos.
> - **`estudio`** — el editor de personalización (canvas Konva), el diferenciador #1.
>
> **Solo en nightly** (`.github/workflows/nightly-full.yml`, con el stack Supabase local levantado
> en el propio runner): **`admin-login`/`admin-mfa`** y **`cms-editing-flow`** (crean usuarios vía
> service role → necesitan GoTrue real). **Sin correr en CI:** la **regresión visual**
> (`visual.spec`, snapshots por-píxel → requieren baseline en imagen pinneada para ser
> deterministas cross-máquina) y el E2E de **compra pagada real** (Wompi sandbox, redirect +
> retorno + webhook) — pendiente por fragilidad de red; hoy el pago se valida a nivel de webhook
> en integración, no end-to-end en navegador.

### Flujos críticos (ESTADO OBJETIVO — no todos tienen E2E real)

| Flujo                                 | Descripción                                                                          | Frecuencia objetivo         | Estado real (2026-08-01)                                                       |
| ------------------------------------- | ------------------------------------------------------------------------------------ | --------------------------- | ------------------------------------------------------------------------------ |
| **Compra Wompi sandbox completa**     | Catálogo → PDP → carrito → checkout → tarjeta `4242` → orden PAID                    | Cada PR + cada deploy       | Objetivo — sin E2E; el pago se valida a nivel de webhook en integración        |
| **Compra COD completa**               | Idem pero contraentrega                                                              | Cada PR                     | Objetivo — sin E2E dedicado                                                    |
| **Personalización + compra**          | Estudio canvas → guardar diseño → checkout                                           | Cada PR                     | Parcial — `estudio` corre por PR; el flujo combinado hasta checkout pagado no  |
| **Registro + login + reset password** | Auth completo                                                                        | Cada PR                     | Objetivo — auth de cliente sin E2E (`admin-login`/`admin-mfa` solo en nightly) |
| **Aplicar cupón**                     | Cupón válido, vencido, agotado                                                       | Cada PR                     | Objetivo — sin E2E                                                             |
| **Admin: crear producto**             | Login admin → CRUD producto → revalidate                                             | Cada PR                     | Objetivo — los E2E de admin corren solo en nightly                             |
| **Admin: cambiar estado de orden**    | Manual con razón → email notificación                                                | Cada PR                     | Objetivo — sin E2E                                                             |
| **Retracto**                          | Solicitar retracto → aprobar → recibir → reembolsar                                  | Fase 4+                     | Objetivo (Fase 4+)                                                             |
| **Stock oversold (negative path)**    | Dos clientes compran último item simultáneamente → uno gana, otro recibe error claro | Cada PR (después de Fase 4) | Objetivo — sin E2E                                                             |

### Estructura

```ts
// e2e/checkout-wompi.spec.ts
import { test, expect } from "@playwright/test";

test.describe("Compra Wompi sandbox", () => {
  test("flujo completo aprobado", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("link", { name: /catálogo/i }).click();
    await page.getByRole("link", { name: /imán/i }).first().click();
    await page.getByRole("button", { name: /agregar al carrito/i }).click();
    await page.getByRole("link", { name: /carrito/i }).click();
    await page.getByRole("button", { name: /pagar/i }).click();

    // Llenar formulario de checkout
    await page.getByLabel("Email").fill("test@example.com");
    await page.getByLabel("Nombre").fill("Test User");
    // ... resto

    await page.getByRole("button", { name: /pagar ahora/i }).click();

    // Mock o sandbox real de Wompi: usar tarjeta 4242
    // ... interactuar con widget

    // Volver al sitio
    await expect(page).toHaveURL(/\/orden\//);
    await expect(page.getByText(/pedido confirmado/i)).toBeVisible();
  });
});
```

### Convenciones Playwright

- **Selectores accesibles primero:** `getByRole`, `getByLabel`, `getByText`. Evitar CSS selectors frágiles.
- **No usar `waitForTimeout`** salvo último recurso. Usar `waitForResponse`, `expect().toBeVisible()`.
- **Una sola aserción crítica por test** cuando sea posible (otros chequeos como soft-asserts).
- **Test data factory** en `e2e/fixtures.ts` para crear cuentas test, productos test, etc.

---

## Visual regression

### Setup mínimo (sin Chromatic/Percy)

```ts
// e2e/visual.spec.ts
test("home se ve igual que el snapshot", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveScreenshot("home.png", { maxDiffPixels: 100 });
});
```

- **Máscaras** sobre regiones dinámicas (timestamps, contador de stock).
- **Snapshots por viewport:** mobile-only y desktop-only se generan separados.
- **Update workflow:** `pnpm test:e2e --update-snapshots` cuando UI cambia intencionalmente.

### Páginas con visual regression obligatorio

- Home
- Catálogo
- PDP (con/sin variantes, con/sin oferta)
- Carrito (vacío y con items)
- Checkout (cada paso)
- Orden confirmada
- 404
- Error 500

---

## Accesibilidad automatizada

### En unit (RTL)

```tsx
import { axe } from "jest-axe"; // o vitest-axe
test("ProductCard no tiene violaciones de a11y", async () => {
  const { container } = render(<ProductCard product={mockProduct} />);
  const results = await axe(container);
  expect(results).toHaveNoViolations();
});
```

### En E2E (Playwright)

```ts
import { injectAxe, checkA11y } from "axe-playwright";

test("home cumple WCAG 2.1 AA", async ({ page }) => {
  await page.goto("/");
  await injectAxe(page);
  await checkA11y(page, null, {
    detailedReport: true,
    detailedReportOptions: { html: true },
  });
});
```

> **Bloqueante en CI:** una violación nueva (no presente en `main`) bloquea el merge.

---

## Performance / load testing

### Lighthouse CI

```yaml
# .github/workflows/lighthouse.yml
- uses: treosh/lighthouse-ci-action@v9
  with:
    urls: |
      ${{ steps.deploy.outputs.preview-url }}
      ${{ steps.deploy.outputs.preview-url }}/catalogo
    budgetPath: ./lighthouse-budget.json
    uploadArtifacts: true
```

```json
// lighthouse-budget.json
[
  {
    "path": "/*",
    "timings": [
      { "metric": "interactive", "budget": 3000 },
      { "metric": "first-contentful-paint", "budget": 1500 }
    ],
    "resourceSizes": [
      { "resourceType": "script", "budget": 250 },
      { "resourceType": "total", "budget": 1000 }
    ]
  }
]
```

### Load testing con k6

```js
// load/checkout-burst.js
import http from "k6/http";
import { check, sleep } from "k6";

export const options = {
  stages: [
    { duration: "30s", target: 50 }, // ramp-up
    { duration: "1m", target: 50 }, // sostenido 50 RPS
    { duration: "30s", target: 100 }, // pico
    { duration: "1m", target: 100 },
    { duration: "30s", target: 0 }, // ramp-down
  ],
  thresholds: {
    http_req_duration: ["p(95)<2000"], // p95 < 2s
    http_req_failed: ["rate<0.01"], // < 1% errores
  },
};

export default function () {
  const res = http.post(`${__ENV.BASE_URL}/api/checkout/create`, JSON.stringify({/* ... */}));
  check(res, { "status 200": (r) => r.status === 200 });
  sleep(1);
}
```

> **Cuándo:** antes de cada release de Fase 7. No en cada PR (caro).

---

## Smoke tests post-deploy

Set mínimo de tests E2E que correr **inmediatamente después de un deploy a producción**. Si fallan: rollback automático.

```ts
// e2e/smoke.spec.ts
test.describe.parallel("Smoke", () => {
  test("home carga en < 3s", async ({ page }) => {
    const start = Date.now();
    await page.goto("/");
    expect(Date.now() - start).toBeLessThan(3000);
  });

  test("/api/health responde 200", async ({ request }) => {
    const res = await request.get("/api/health");
    expect(res.status()).toBe(200);
  });

  test("/api/health/db responde 200", async ({ request }) => {
    const res = await request.get("/api/health/db");
    expect(res.status()).toBe(200);
  });

  test("PDP de producto seed carga", async ({ page }) => {
    await page.goto("/producto/iman-foto-personalizado");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  });

  test("checkout completo con tarjeta sandbox", async ({ page }) => {
    // Variante reducida del E2E completo, solo el happy path
  });
});
```

---

## Tests de seguridad

| Test                                | Herramienta                                        | Cuándo            |
| ----------------------------------- | -------------------------------------------------- | ----------------- |
| `pnpm audit --audit-level=high`     | npm audit                                          | Cada PR           |
| `gitleaks detect` (secret scanning) | gitleaks                                           | Cada PR           |
| Headers de seguridad presentes      | Playwright (assertions sobre `response.headers()`) | Cada deploy       |
| Rate limit funciona                 | Playwright (loop hasta 429)                        | Cada PR (Fase 1+) |
| Webhook firma inválida es rechazada | Vitest integration                                 | Cada PR (Fase 4+) |
| RLS impostor falla                  | Vitest integration                                 | Cada PR           |
| Pen test manual                     | Externo                                            | Pre-lanzamiento   |

---

## CI workflow

```yaml
# .github/workflows/ci.yml (estructura propuesta)
on: [pull_request, push]
jobs:
  install:
    # Cache pnpm + node_modules
  typecheck: [needs: install]
  lint: [needs: install]
  unit:
    needs: install
    run: pnpm test --coverage
  integration:
    needs: install
    services:
      supabase: # supabase local en GH Actions
    run: pnpm test:integration
  rls:
    needs: install
    services:
      supabase:
    run: pnpm test:rls
  build: [needs: [typecheck, lint, unit, integration, rls]]
  e2e:
    needs: build
    services:
      supabase:
    run: pnpm test:e2e
  audit-deps:
    needs: install
    run: pnpm audit --audit-level=high
  audit-secrets:
    runs-on: ubuntu-latest
    steps:
      - uses: gitleaks/gitleaks-action@v2
  lighthouse:
    needs: e2e
    if: github.event_name == 'pull_request'
    run: lhci autorun
```

> Total típico de CI por PR: ~6-10 minutos. Si crece más, paralelizar más fino o cachear más agresivo.

---

## Coverage targets

> Coverage no es la meta — es la consecuencia. Pero sirve como salud check.

| Capa                            | Coverage mínimo (line)  |
| ------------------------------- | ----------------------- |
| `lib/` (utils puros)            | 90%                     |
| `features/<feat>/service.ts`    | 80%                     |
| `features/<feat>/repository.ts` | 70% (tests integración) |
| `app/api/*/route.ts`            | 70%                     |
| `components/`                   | 50% (rendering + a11y)  |
| **Total proyecto**              | ≥ 70%                   |

La tabla de arriba son las METAS por capa. **Estado real (actualizado 2026-08-01):** el coverage
SÍ se mide y se enforza — `apps/web/vitest.config.ts` define `coverage.thresholds` globales
(lines 71 / statements 69.5 / functions 68.5 / branches 62, calibrados por ratchet contra la
medición real de CI) y el job de tests de CI corre `pnpm --filter web test:coverage`
(`.github/workflows/ci.yml`), que falla si la cobertura cae por debajo del piso. Los thresholds
se aprietan de nuevo a medida que sube la cobertura real (ratchet).

---

## Tests que NO escribimos

- **Tests de Prisma/Next.js/Supabase nativos.** Son librerías; sus mantenedores los testean.
- **Tests de implementación interna privada** que no afecta comportamiento observable.
- **Snapshots de objetos enteros.** Frágiles y no se leen.
- **Mocks de funciones puras.** No hay nada que probar ahí.
- **Tests E2E de cada PDP.** Uno solo es suficiente; lo demás es unit + integración.
- **UI tests pixel-perfect en cada componente.** Solo páginas críticas tienen visual regression.
