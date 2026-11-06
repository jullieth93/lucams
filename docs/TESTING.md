# Estrategia y Suites de Pruebas — Lucams Shop

> **Documento vivo de Nivel 1 ([`README.md`](README.md)).** Define con exactitud la pirámide de pruebas, las guardas de seguridad e higiene del entorno (`EMAIL_SEND_DISABLED=1`, bloqueo duro anti-PRD y limpieza determinista), la regla Mock vs Real, los patrones con código real de cada capa (Vitest unit, RTL, `node --test`, integración PostgreSQL, matriz RLS y Playwright E2E), el inventario 1:1 de los **57 archivos `.spec.ts`**, las pruebas de carga/rendimiento y los workflows de certificación en GitHub Actions.

## Tabla de contenido

1. [Pirámide de pruebas, stack y convenciones](#1-pirámide-de-pruebas-stack-y-convenciones)
2. [Guardas innegociables del entorno (`EMAIL_SEND_DISABLED=1`, anti-PRD y teardown)](#2-guardas-innegociables-del-entorno-email_send_disabled1-anti-prd-y-teardown)
3. [Regla de oro Mock vs Real, suites `*.live.test.ts` y anti-patrones prohibidos](#3-regla-de-oro-mock-vs-real-suites-livetestts-y-anti-patrones-prohibidos)
4. [Comandos maestros de verificación](#4-comandos-maestros-de-verificación)
5. [Pruebas unitarias, componentes RTL y scripts de DB (ejemplos reales 1, 2 y 3)](#5-pruebas-unitarias-componentes-rtl-y-scripts-de-db-ejemplos-reales-1-2-y-3)
6. [Pruebas de integración contra PostgreSQL real (ejemplo real 4)](#6-pruebas-de-integración-contra-postgresql-real-ejemplo-real-4)
7. [Pruebas reales de cobertura y matriz de seguridad RLS (ejemplo real 5)](#7-pruebas-reales-de-cobertura-y-matriz-de-seguridad-rls-ejemplo-real-5)
8. [Pruebas End-to-End con Playwright e inventario 57/57 (ejemplo real 6)](#8-pruebas-end-to-end-con-playwright-e-inventario-5757-ejemplo-real-6)
9. [Carga k6, Lighthouse CI, perfilado CDP del Estudio y arquitectura CI/CD](#9-carga-k6-lighthouse-ci-perfilado-cdp-del-estudio-y-arquitectura-cicd)

---

## 1. Pirámide de pruebas, stack y convenciones

```text
          ╱─────────────────────────────╲
         ╱  Playwright E2E (57 specs) +  ╲   Flujos críticos, MFA TOTP, a11y (axe),
        ╱   k6 + Lighthouse + CDP Studio  ╲  responsive en 6 perfiles y sandbox Wompi
       ╱───────────────────────────────────╲
      ╱   Integración PostgreSQL real (86)  ╲  Sagas, concurrencia, webhooks, Storage,
     ╱    + Cobertura y Matriz RLS real      ╲ GoTrue OTP/MFA y deriva Prisma ↔ SQL
    ╱─────────────────────────────────────────╲
   ╱  Unitarias, componentes RTL y gates AST   ╲ Reglas en centavos COP, Zod v4, HMAC,
  ╱     (Vitest 4 en web + node --test en db)   ╲ paridad CMS 166/166, textos legales y guards
 ╱───────────────────────────────────────────────╲
```

### Stack vigente por capa

| Capa                                  | Herramienta real en el monorepo                                         | Propósito técnico                                                                        |
| ------------------------------------- | ----------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| Unitarias e integración en `apps/web` | **Vitest 4** (`vitest@^4.1.12`) + `@vitest/coverage-v8`                 | Ejecución ESM/TS nativa en entorno `node` y umbrales por _ratchet_                       |
| Componentes interactivos React 19     | **Vitest + `@testing-library/react`** (`jsdom` por archivo)             | Queries accesibles por rol/etiqueta sobre Client Components                              |
| Guardas y utilidades de `@lucams/db`  | **Runner nativo `node --test`** (Node 22)                               | Certifica `env-guard.mjs` y helpers de `packages/db/scripts/lib/` sin dependencias extra |
| Base de datos, Auth y RLS real        | **Supabase local en Podman** (local) / **Supabase CLI localstack** (CI) | Valida transacciones, triggers, índices parciales, GoTrue, Storage y RLS real            |
| Interceptación HTTP de terceros       | **`vi.stubGlobal("fetch", ...)`** por prueba (sin MSW)                  | Aísla pasarelas y APIs externas sin alterar el código de producción                      |
| Navegador End-to-End                  | **Playwright** (`apps/web/playwright.config.ts`)                        | Multi-viewport, multi-navegador, trazas en fallos y bypass de Staging                    |
| Accesibilidad automatizada            | **`@axe-core/playwright`** + `apps/web/tests/a11y-contrast.test.ts`     | Gate estricto WCAG 2.1 A/AA (`0` violaciones `serious`/`critical`) y contraste de paleta |
| Rendimiento, Web Vitals y carga       | **Lighthouse CI** (desktop + móvil), **k6** y **Playwright + CDP**      | Presupuestos sobre build productivo, rampa de 50 VUs y longtasks del Estudio             |

### Convenciones de naming y estructura AAA

| Patrón de archivo              | Ubicación                                                             | Qué prueba y dónde corre                                                                                                   |
| ------------------------------ | --------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| `<modulo>.test.ts`             | Junto al archivo bajo prueba en `apps/web/**`                         | Lógica pura, validadores Zod v4, firmas criptográficas, servicios con dependencias externas aisladas y gates estáticos AST |
| `<componente>.test.tsx`        | Junto al componente (`// @vitest-environment jsdom` en línea 1)       | Renderizado, accesibilidad e interacciones de hojas `"use client"`                                                         |
| `<modulo>.integration.test.ts` | Junto a la feature (`apps/web/**`) — **86 suites**                    | Consultas Prisma reales, sagas, concurrencia, webhooks, Storage y RLS contra PostgreSQL/Supabase                           |
| `<proveedor>.live.test.ts`     | `lib/wompi.live.test.ts`, `features/shipping/aveonline*.live.test.ts` | Smokes no destructivos contra sandboxes externos reales (`skipIf` automático sin credenciales sandbox)                     |
| `<helper>.test.mjs`            | `packages/db/scripts/lib/*.test.mjs` — **6 suites**                   | Guardas fail-closed de scripts operativos (`pnpm --filter @lucams/db test`)                                                |
| `<flujo>.spec.ts`              | `apps/web/tests/e2e/` — **57 specs**                                  | Recorridos completos de navegador en local, `:4100`, Staging o smoke de solo lectura                                       |

- **Estructura _Arrange – Act – Assert_ (AAA):** prepara datos explícitos sin magia compartida (_Arrange_), invoca una única acción observable (_Act_) y verifica el estado resultante o efecto persistido (_Assert_). Con `globals: false` en `vitest.config.ts`, importa siempre `describe`, `it`, `expect`, `vi`, `beforeEach` y `afterAll` explícitamente desde `"vitest"`.
- **Qué pruebas NO escribimos:** no testeamos internals privados de Next.js, Prisma o Supabase; no escribimos snapshots de objetos JSON gigantes; no mockeamos funciones puras internas; y no duplicamos un spec E2E por cada producto del catálogo cuando las variantes están cubiertas en unit/integración.

---

## 2. Guardas innegociables del entorno (`EMAIL_SEND_DISABLED=1`, anti-PRD y teardown)

### Protecciones en `apps/web/tests/setup-env.ts`

Vitest carga `apps/web/tests/setup-env.ts` antes de ejecutar cualquier worker e impone tres barreras obligatorias:

1. **`EMAIL_SEND_DISABLED=1` por defecto (cero spam hacia buzones reales):**
   - Si la shell no define `EMAIL_SEND_DISABLED`, `setup-env.ts` lo fija en `"1"`, activando el kill-switch de `apps/web/lib/resend.ts`. Ninguna corrida local o de CI envía correos reales ni genera rebotes hacia `hola@lucamsshop.com`, aunque `.env.local` tenga una `RESEND_API_KEY` activa.
   - Solo `apps/web/lib/resend.test.ts` limpia temporalmente la variable con `vi.stubEnv("EMAIL_SEND_DISABLED", undefined)` sobre un `fetch` interceptado para ejercitar el cliente HTTP. En paralelo, `scripts/e2e-fullmode.sh` levanta el servidor `:4100` con `RESEND_API_KEY=` vacío.
2. **Bloqueo duro anti-Producción sin _escape hatch_:**
   - Evalúa `checkDestructiveAllowed()` (`packages/db/scripts/lib/env-guard.mjs`) antes del primer test y **lanza excepción inmediata si `!guard.allowed || guard.bypassed`**.
   - Aunque alguien exportara `LUCAMS_ALLOW_DESTRUCTIVE_REMOTE=1` en su terminal, Vitest rechaza correr contra `PRD` (`zxkucphbsfygakgxcnik`) o cualquier host remoto distinto de local/STG, impidiendo crear órdenes fantasma o consumir numeración `LCM-YYYY-NNNN` productiva.
3. **Modo transaccional completo:** si la shell no define `NEXT_PUBLIC_STORE_MODE`, lo fuerza a `"full"` para ejercitar carrito, checkout, cupones, pagos y envíos sin bloqueos de `stage-guard.ts`.

```ts
// Extracto real de apps/web/tests/setup-env.ts
import { checkDestructiveAllowed } from "../../../packages/db/scripts/lib/env-guard.mjs";

const guard = checkDestructiveAllowed();
if (!guard.allowed || guard.bypassed) {
  throw new Error(
    `[setup-env] SUITE ABORTADA: las pruebas de vitest NO pueden correr contra este destino. ` +
      `${guard.reason || "destino bloqueado"} ` +
      `Apunta DATABASE_URL/DIRECT_URL al Supabase local (make db-local-start) o a STG.`,
  );
}

if (process.env.NEXT_PUBLIC_STORE_MODE === undefined) {
  process.env.NEXT_PUBLIC_STORE_MODE = "full";
}

if (process.env.EMAIL_SEND_DISABLED === undefined) {
  process.env.EMAIL_SEND_DISABLED = "1";
}
```

### Limpieza determinista en `apps/web/tests/vitest-global-teardown.ts` y regla `scrubPii`

- **Cómo opera el teardown global:** cada suite `*.integration.test.ts` etiqueta sus registros con un `RUN` único y limpia sus propias filas en `afterAll`. Como red de seguridad ante timeouts o fallos a mitad de corrida, `vitest-global-teardown.ts` se ejecuta en el **proceso principal** de Vitest (cargando `.env.local` por su cuenta porque `setupFiles` solo corren en los workers), verifica `checkDestructiveAllowed()` y barre **únicamente patrones sintéticos de prueba**:
  - Catálogo de test (`Product`, `Category`, `OcasionTag`, `ProductVariant`, `PersonalizationTemplate`): soft-delete (`deletedAt = NOW()`, `isActive = false`) solo cuando el `slug` o `sku` coincide con `[0-9]{13,}`, `test-%` o `itest%`. **El catálogo y el CMS sembrados jamás se tocan.**
  - Datos transaccionales de test (`Order`, `Customer`, `Contact`, `Coupon`, `SupportTicket`, etc.): limpieza selectiva cuando el identificador/correo contiene un `run-id` numérico de 15+ dígitos (`[0-9]{15,}`) o dominios sintéticos de prueba.
- **Regla obligatoria anti-colisión con `scrubPii`:** en suites que insertan en tablas sanitizadas por `scrubPii` (`ErrorLog` y `ErrorReport` vía `lib/error-capture.ts`), el identificador `RUN` **nunca debe contener secuencias de 10+ dígitos**, porque `scrubPii` las enmascara como teléfonos colombianos al guardar y el `DELETE` del `afterAll` ya no encuentra la fila. Convierte siempre los dígitos a letras (`String(Date.now()).replace(/[0-9]/g, (d) => String.fromCharCode(65 + Number(d)))`).

---

## 3. Regla de oro Mock vs Real, suites `*.live.test.ts` y anti-patrones prohibidos

> **Regla de oro:** usa infraestructura **real** para todo lo que define integridad de datos, concurrencia y seguridad (PostgreSQL, constraints, triggers, Auth, Storage, RLS); intercepta **únicamente** proveedores HTTP externos que cuestan dinero, tienen efectos laterales fuera de nuestro control o introducen latencia/flakiness de terceros.

| Dependencia                                                                                        | Estrategia obligatoria                                                                                            | Dónde y cómo se aplica                                                      |
| -------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| **PostgreSQL + Prisma (`@lucams/db`)**                                                             | Mock solo en unit puros de dominio; **100 % real** en `*.integration.test.ts`                                     | Stack local Podman (`make test-local`) y contenedor `postgres:15` en CI     |
| **Políticas RLS, `REVOKE` y triggers DDL**                                                         | **100 % real (prohibido mockear)**                                                                                | `make test-rls` contra Supabase completo (PostgREST + GoTrue + Storage)     |
| **Supabase Auth (OTP, sesiones, MFA `aal2`)**                                                      | **Real** en integración nocturna y E2E con `E2E_AUTH=1`                                                           | GoTrue + Mailpit (`:54324`) en local y en `nightly-full.yml`                |
| **Supabase Storage (5 buckets)**                                                                   | **Real** en suites de renders, fichas y retención                                                                 | `finalize-server-render`, `letter-tiles` y `retention-service`              |
| **Wompi, Aveonline, Gemini, HIBP**                                                                 | `vi.stubGlobal("fetch", ...)` en unit/integración; **real sandbox** en `*.live.test.ts` y `wompi-sandbox.spec.ts` | Restaura siempre con `vi.unstubAllGlobals()` en `afterEach`                 |
| **Resend (correos)**                                                                               | Apagado globalmente por `EMAIL_SEND_DISABLED=1`                                                                   | Solo `lib/resend.test.ts` ejercita el adaptador HTTP sobre `fetch` mockeado |
| **`next/cache` fuera de request Next 16**                                                          | Passthrough de `unstable_cache` + no-op en `revalidateTag`/`updateTag`                                            | En `*.integration.test.ts` que importan `lib/catalog.ts` o `service.ts`     |
| **Utilidades puras internas** (`lib/money.ts`, `lib/datetime.ts`, `lib/format.ts`, `photo-fit.ts`) | **Cero mocks** — invocación directa                                                                               | Mockear funciones deterministas internas es un anti-patrón                  |

### Cuándo corren las suites `*.live.test.ts`

Los tres archivos `*.live.test.ts` (`apps/web/lib/wompi.live.test.ts`, `apps/web/features/shipping/aveonline.live.test.ts` y `apps/web/features/shipping/aveonline.coverage-probe.live.test.ts`) ejecutan sondas **de solo lectura y no facturables** contra los sandboxes reales de Wompi y Aveonline para detectar cambios de contrato del proveedor. Usan `describe.skipIf(...)` estricto para saltar limpiamente cuando hay placeholders de CI y **nunca** apuntar a producción:

```ts
// apps/web/lib/wompi.live.test.ts — guarda estricta solo-sandbox
const cfg = (() => {
  try {
    return getWompiConfig();
  } catch {
    return null;
  }
})();

const liveSandbox =
  !!cfg &&
  cfg.env === "sandbox" &&
  cfg.publicKey.startsWith("pub_test_") &&
  cfg.publicKey.length > 20;

describe.skipIf(!liveSandbox)("Wompi — smoke LIVE sandbox (no-destructivo)", () => {
  it("la public key obtiene el merchant y el acceptance_token real", async () => {
    const res = await fetch(`${cfg!.apiUrl}/merchants/${cfg!.publicKey}`, {
      cache: "no-store",
      signal: AbortSignal.timeout(10_000),
    });
    expect(res.status).toBe(200);
  });
});
```

### Catálogo de anti-patrones prohibidos

1. **Mockear Prisma para «probar» SQL, constraints o RLS:** un mock de `prisma.order.create` jamás detecta violaciones de FK, índices parciales únicos (`InventoryLog`), bloqueos `pg_advisory_xact_lock` ni deriva de columnas.
2. **Usar `supabase.from(...)` como acceso administrativo de negocio:** en Lucams Shop el backend lee/escribe por `prisma` (`@/lib/db`); los clientes `@supabase/supabase-js` en tests de RLS se usan precisamente para demostrar que `anon` y `authenticated` **no pueden** leer ni mutar tablas por PostgREST.
3. **Dejar `vi.stubGlobal` o `vi.stubEnv` sucios entre tests:** limpia siempre en `afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); })`.
4. **Usar `page.waitForTimeout(...)` arbitrarios o selectores CSS frágiles en Playwright:** prioriza siempre `getByRole`, `getByLabel`, `getByText` y aserciones auto-reintentables (`await expect(...).toBeVisible()`, `expect.poll`, `toPass`).
5. **Reintentos locales activados (`retry > 0` en local):** tanto `vitest.config.ts` como `playwright.config.ts` fijan `0` reintentos en local para exponer inmediatamente cualquier condición de carrera; `retry: 2` solo aplica cuando `CI=true`.

---

## 4. Comandos maestros de verificación

| Comando                                   | Qué ejecuta exactamente                                                                                                                                                               | Cuándo debes correrlo                                   |
| ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------- |
| `make check`                              | `pnpm format:check` + `pnpm -r typecheck` + `pnpm -r lint` + `pnpm --filter @lucams/db test` + `make audit-script-guards` + `make audit-content` + escaneo anti-voseo (`es-CO` tuteo) | **Siempre** antes de cada commit / push                 |
| `pnpm test`                               | `pnpm -r test`: corre las **486 suites** Vitest de `apps/web` y las **6 suites** `node --test` de `@lucams/db`                                                                        | Antes de abrir o actualizar cualquier PR                |
| `make test-local`                         | `pnpm --filter web test` contra el stack Supabase local en Podman                                                                                                                     | Validación integral con DB local arriba                 |
| `pnpm --filter web test:coverage`         | Vitest con proveedor V8 verificando `coverage.thresholds` globales                                                                                                                    | Réplica local exacta del job `unit-tests`               |
| `pnpm --filter @lucams/db test`           | `node --test "scripts/lib/*.test.mjs"` en `packages/db`                                                                                                                               | Al tocar scripts o helpers en `packages/db/scripts/`    |
| `make audit-script-guards`                | `node scripts/lib/check-script-guards.mjs` (exige `env-guard.mjs` en scripts con escritura)                                                                                           | Al crear o modificar scripts `.mjs`                     |
| `make audit-content`                      | `vitest run lib/cms-sitemap-parity.test.ts` (paridad AST `166/166` del CMS v2)                                                                                                        | Al tocar `<CmsText>`, `lib/cms.ts` o `cms-site-map.mjs` |
| `make verify-db`                          | `audit-schema-drift.mjs check` + `verify-security-posture.mjs` (5/5 invariantes RLS/grants/buckets)                                                                                   | Al crear o editar migraciones Prisma o SQL              |
| `make test-rls`                           | `vitest run` de `rls-coverage.integration.test.ts` + `rls-matrix.integration.test.ts`                                                                                                 | Al crear tablas, buckets o políticas RLS                |
| `make test-e2e`                           | `pnpm --filter web test:e2e` (`playwright test` según `E2E_ENV=local\|stg\|prd`)                                                                                                      | Validación E2E sobre `:4000` o Staging                  |
| `make test-e2e-fullmode`                  | `scripts/e2e-fullmode.sh`: servidor aislado en `:4100` (`full`, `RESEND_API_KEY=`) + `fullmode-*.spec.ts`                                                                             | Cambios en carrito, checkout, cupones, pagos o stock    |
| `pnpm --filter web test:audit-responsive` | Ejecuta `audit-responsive.spec.ts` en los **6 perfiles de viewport**                                                                                                                  | Cambios visuales, de navegación o responsive            |
| `make test-load`                          | `k6 run tests/load/storefront-browsing.js` contra `BASE_URL` (default `http://localhost:4000`)                                                                                        | Certificación de capacidad pre-release                  |

---

## 5. Pruebas unitarias, componentes RTL y scripts de DB (ejemplos reales 1, 2 y 3)

### Configuración de Vitest 4 y cobertura por _ratchet_ (`apps/web/vitest.config.ts`)

- **Entorno por defecto:** `environment: "node"` para máxima velocidad; el módulo virtual `"server-only"` de Next.js se redirige mediante alias al stub `apps/web/tests/stubs/server-only.ts`.
- **Umbrales globales obligatorios (`coverage.thresholds` con V8):** **`lines: 71 %`**, **`statements: 69.5 %`**, **`functions: 68.5 %`** y **`branches: 62 %`**. Están calibrados sobre la medición real de CI y operan como _ratchet_ (cualquier regresión rompe `unit-tests`). Las metas orientativas por capa son: `lib/` utilitario `≥ 90 %`, `features/*/service.ts` `≥ 80 %`, `app/api/*/route.ts` `≥ 70 %` y `components/` `≥ 50 %`.
- **Suites transversales de regresión crítica:**
  - Paridad estática y cumplimiento: `lib/cms-sitemap-parity.test.ts` (`166/166`), `app/legal/legal-content-sync.test.ts` (paquete legal Versión 3 `2026-11-05` + uso obligatorio de `{{tokens}}`), `lib/datetime-convention.test.ts` (`America/Bogota`) y `tests/a11y-contrast.test.ts`.
  - Artefactos de imprenta 300 DPI y promesas de entrega: `photo-fit.test.ts` (encuadre cover sin bordes blancos descubiertos, rotación 90° y topes de paneo), `production-spec.test.ts` (reverso B opcional vacío reportado como blanco y nunca espejo) y `delivery-estimate.test.ts` (corte horario y lenguaje estimado).

### Ejemplo real 1 — Test unitario puro en Vitest (centavos COP y firmas SHA-256/HMAC)

```ts
// apps/web/lib/wompi.test.ts (extracto real adaptado)
import crypto from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { generateIntegritySignature, verifyWebhookSignature } from "./wompi";

const INTEGRITY_SECRET = "test_integrity_FIXED";
const EVENTS_SECRET = "test_events_FIXED";

describe("lib/wompi — firmas criptográficas en centavos COP", () => {
  beforeEach(() => {
    vi.stubEnv("WOMPI_ENV", "sandbox");
    vi.stubEnv("WOMPI_INTEGRITY_SECRET", INTEGRITY_SECRET);
    vi.stubEnv("WOMPI_EVENTS_SECRET", EVENTS_SECRET);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("calcula SHA-256 exacto sobre reference + amountInCents (Int) + currency + secret", () => {
    // $15.000 COP representados estrictamente como entero en centavos (1_500_000)
    const reference = "8b4e2f10-3a91-4d7c-9c12-001122334455";
    const amountInCents = 1_500_000;
    const expected = crypto
      .createHash("sha256")
      .update(`${reference}${amountInCents}COP${INTEGRITY_SECRET}`)
      .digest("hex");

    const sig = generateIntegritySignature({ reference, amountInCents, currency: "COP" });
    expect(sig).toBe(expected);
  });

  it("rechaza un webhook cuya cantidad en centavos fue alterada después de firmar", () => {
    const nowSec = Math.floor(Date.now() / 1000);
    const legitConcat = `txn_01APPROVED1500000${nowSec}${EVENTS_SECRET}`;
    const checksum = crypto.createHash("sha256").update(legitConcat).digest("hex");

    // Atacante intenta cambiar amount_in_cents de 1_500_000 ($15.000) a 100_000 ($1.000)
    const tamperedBody = JSON.stringify({
      event: "transaction.updated",
      data: { transaction: { id: "txn_01", status: "APPROVED", amount_in_cents: 100_000 } },
      signature: {
        properties: ["transaction.id", "transaction.status", "transaction.amount_in_cents"],
        checksum,
      },
      timestamp: nowSec,
    });

    const verification = verifyWebhookSignature(tamperedBody);
    expect(verification.valid).toBe(false);
  });
});
```

### Ejemplo real 2 — Test de componente con React Testing Library (`*.test.tsx`)

Todo test de componente declara `// @vitest-environment jsdom` en la primera línea y ejecuta `cleanup()` en `afterEach` (porque `globals: false` desactiva el auto-cleanup implícito):

```tsx
// @vitest-environment jsdom
// apps/web/app/producto/[slug]/copies-qty-input.test.tsx (patrón real)
import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { CopiesQtyInput } from "./copies-qty-input";
import { SelectedVariantProvider } from "./variant-actions";

const replace = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace }),
  useSearchParams: () => new URLSearchParams(),
}));

afterEach(() => cleanup());
beforeEach(() => replace.mockClear());

describe("CopiesQtyInput", () => {
  it("arranca en 1 unidad, actualiza el hidden input qty y respeta el mínimo 1", () => {
    render(
      <SelectedVariantProvider variantIds={["v1"]} initialId="v1">
        <CopiesQtyInput />
      </SelectedVariantProvider>,
    );

    const group = screen.getByRole("group", { name: "Unidades" });
    const hidden = document.querySelector<HTMLInputElement>('input[name="qty"]')!;

    expect(within(group).getByText("1")).toBeInTheDocument();
    expect(hidden.value).toBe("1");
    expect(screen.getByLabelText("Disminuir unidades")).toBeDisabled();

    fireEvent.click(screen.getByLabelText("Aumentar unidades"));
    expect(within(group).getByText("2")).toBeInTheDocument();
    expect(hidden.value).toBe("2");
  });
});
```

### Ejemplo real 3 — Test de scripts de DB con `node --test` (`packages/db/scripts/lib/*.test.mjs`)

El paquete `@lucams/db` certifica sus 6 módulos críticos de scripts (`env-guard.test.mjs`, `catalog-sync.test.mjs`, `gallery-sync.test.mjs`, `identity-dry-run.test.mjs`, `test-coupon-signal.test.mjs` y `zombie-settings.test.mjs`) con `node:test` y `node:assert/strict` dentro de `make check` y del job `quality`:

```js
// packages/db/scripts/lib/env-guard.test.mjs (extracto real)
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { checkDestructiveAllowed, classifyUrl } from "./env-guard.mjs";

const LOCAL = "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
const STG =
  "postgresql://postgres.mjbdiqdkykhsixvqlrrp:pw@aws-1-us-east-1.pooler.supabase.com:6543/postgres";
const PRD =
  "postgresql://postgres.zxkucphbsfygakgxcnik:pw@aws-1-us-east-1.pooler.supabase.com:6543/postgres";

describe("checkDestructiveAllowed (fail-closed)", () => {
  it("permite local y STG sin fricción", () => {
    assert.equal(checkDestructiveAllowed({ DIRECT_URL: LOCAL, DATABASE_URL: LOCAL }).allowed, true);
    assert.equal(checkDestructiveAllowed({ DIRECT_URL: STG, DATABASE_URL: STG }).allowed, true);
  });

  it("bloquea PRD, hosts desconocidos y URLs malformadas sin filtrar credenciales", () => {
    const prdRes = checkDestructiveAllowed({ DIRECT_URL: PRD, DATABASE_URL: PRD });
    assert.equal(prdRes.allowed, false);
    assert.ok(!prdRes.reason.includes(":pw@"));
    assert.equal(classifyUrl("postgresql://p:p@vps.example.com:5432/postgres"), "other");
    assert.equal(checkDestructiveAllowed({ DATABASE_URL: "no-es-url" }).allowed, false);
  });
});
```

---

## 6. Pruebas de integración contra PostgreSQL real (ejemplo real 4)

### Preparación del stack local y passthrough de `next/cache`

Para correr las **86 suites `*.integration.test.ts`** localmente contra Supabase en Podman:

```bash
make db-local-start   # Levanta/reanuda contenedores Podman conservando volúmenes
make db-local-setup   # Aplica extensiones, migraciones Prisma y SQL de RLS/grants
make db-local-on      # Apunta .env.local al stack local (:54321 / :54322)
make db-local-seed    # Siembra catálogo canónico, plantillas, ocasiones, fichas y CMS v2
make test-local       # Ejecuta toda la suite de apps/web contra PostgreSQL local
```

**Por qué mockear `next/cache` como passthrough en integración:** módulos como `apps/web/lib/catalog.ts` o `features/products/service.ts` envuelven lecturas en `unstable_cache` e invalidan con `updateTag` / `revalidateTag`. Fuera de un request HTTP real de Next.js 16, `unstable_cache` lanza `Invariant: incrementalCache missing` y `updateTag` falla por ausencia de contexto de Server Action. Sustituir únicamente `next/cache` por un passthrough ejecuta el **100 % de las consultas Prisma reales** contra PostgreSQL:

### Ejemplo real 4 — Suite `*.integration.test.ts` con `next/cache` passthrough y limpieza acotada

```ts
// Patrón real de apps/web/lib/catalog.integration.test.ts y features/products/service.integration.test.ts
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

// 1) Passthrough de next/cache ANTES de importar el módulo bajo prueba
vi.mock("next/cache", () => ({
  unstable_cache:
    <T extends (...args: never[]) => unknown>(fn: T) =>
    (...args: Parameters<T>) =>
      fn(...args),
  revalidateTag: vi.fn(),
  revalidatePath: vi.fn(),
  updateTag: vi.fn(),
}));

import { prisma } from "@/lib/db";
import { getCategoryTree, listCatalogProducts } from "@/lib/catalog";

const hasDb = Boolean(process.env.DATABASE_URL);
// Prefijo único con timestamp de 15+ dígitos: aísla de datos reales y es compatible con global-teardown
const RUN = `itest-${Date.now()}${Math.floor(Math.random() * 1_000_000)}`;

describe.skipIf(!hasDb)("Catálogo contra PostgreSQL real", () => {
  let categoryId = "";
  let productId = "";

  beforeAll(async () => {
    const cat = await prisma.category.create({
      data: { name: `Categoría ${RUN}`, slug: `cat-${RUN}`, isActive: true, sortOrder: 99 },
    });
    categoryId = cat.id;

    const prod = await prisma.product.create({
      data: {
        name: `Imán ${RUN}`,
        slug: `prod-${RUN}`,
        description: "Imán personalizado de prueba",
        categoryId: cat.id,
        isActive: true,
        variants: {
          create: {
            name: "Set x9",
            sku: `SKU-${RUN}`,
            price: 3_500_000,
            stock: 15,
            isActive: true,
          },
        },
      },
    });
    productId = prod.id;
  }, 30_000);

  afterAll(async () => {
    // Limpieza estrictamente acotada al RUN de esta corrida (en orden inverso de FK Restrict)
    await prisma.productVariant.deleteMany({ where: { productId } });
    await prisma.product.deleteMany({ where: { id: productId } });
    await prisma.category.deleteMany({ where: { id: categoryId } });
  });

  it("incluye la categoría activa con conteo real y excluye variantes borradas", async () => {
    const tree = await getCategoryTree();
    const created = tree.find((c) => c.id === categoryId);
    expect(created?.productCount).toBe(1);

    const listing = await listCatalogProducts({ categorySlug: `cat-${RUN}` });
    expect(listing.items).toHaveLength(1);
    expect(listing.items[0]?.minPrice).toBe(3_500_000); // $35.000 COP en centavos
  });
});
```

---

## 7. Pruebas reales de cobertura y matriz de seguridad RLS (ejemplo real 5)

El comando **`make test-rls`** certifica en vivo contra Supabase real (tanto en local como en el check obligatorio **`rls-behavior`** de cada PR) que nuestra defensa de base de datos no tiene grietas ([`SECURITY.md`](SECURITY.md)):

1. **`rls-coverage.integration.test.ts`:** consulta `pg_tables` y falla si cualquier tabla de `public` (excepto `_prisma_migrations`) tiene `rowsecurity = false`.
2. **`rls-matrix.integration.test.ts`:** instancia clientes reales `@supabase/supabase-js` con los roles **`anon`**, **`authenticated`** (creando un usuario efímero real vía GoTrue con el cliente **`service_role`**) y contrasta contra **`prisma`** (conexión de servidor) para demostrar dos invariantes simultáneos:
   - Que la tabla **sí contiene registros reales** leídos por `prisma` (evitando falsos positivos sobre tablas vacías).
   - Que tanto `anon` como un usuario `authenticated` impostor reciben `42501 permission denied` o `0` filas en `SELECT`, y error explícito en `INSERT`, `UPDATE` y `DELETE` sobre todas las tablas sensibles (`Customer`, `Order`, `AdminUser`, `AdminActionLog`, `WompiPaymentAttempt`, `FunnelEventDaily`, `Organization`, `Contact`, `ContactIdentity`, `IdentityMergeCandidate`, `ContactActivity`, `Task`, `Opportunity`, etc.) y que los buckets privados de Storage (`customer-uploads`, `design-previews`, `production-assets`) rechazan lecturas anónimas.

### Ejemplo real 5 — `rls-coverage` y `rls-matrix` (`anon`, `authenticated` y `service_role`)

```ts
// 1) apps/web/features/security/rls-coverage.integration.test.ts (real)
import { describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";

describe.skipIf(!process.env.DATABASE_URL)(
  "RLS coverage — toda tabla pública tiene candado",
  () => {
    it("ninguna tabla de public (excepto _prisma_*) está sin RLS", async () => {
      const rows = await prisma.$queryRaw<Array<{ tablename: string }>>`
      SELECT tablename FROM pg_tables
      WHERE schemaname = 'public' AND rowsecurity = false AND tablename NOT LIKE '_prisma%'
      ORDER BY tablename
    `;
      expect(rows.map((r) => r.tablename)).toEqual([]);
    });
  },
);
```

```ts
// 2) apps/web/features/security/rls-matrix.integration.test.ts (extracto real)
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { prisma } from "@/lib/db";

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const ANON = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const SERVICE = process.env.SUPABASE_SECRET_KEY;
const canRun = Boolean(process.env.DATABASE_URL && URL && ANON && SERVICE);

const SENSITIVE = [
  "Customer",
  "Order",
  "AdminUser",
  "AdminActionLog",
  "Contact",
  "ContactIdentity",
  "Opportunity",
] as const;

describe.skipIf(!canRun)("RLS matrix — PostgREST cerrado para anon y authenticated", () => {
  let anon: SupabaseClient;
  let authed: SupabaseClient;
  let service: SupabaseClient;
  let ephemeralUserId: string | undefined;
  let fixtureAdminId: string | undefined;

  beforeAll(async () => {
    anon = createClient(URL!, ANON!, { auth: { persistSession: false } });
    service = createClient(URL!, SERVICE!, { auth: { persistSession: false } });

    // Aprovisiona sesión authenticated real en GoTrue usando service_role
    const email = `rls-matrix-${Date.now()}@example.com`;
    const password = "Rls-Matrix-Test-9182734650";
    const { data } = await service.auth.admin.createUser({ email, password, email_confirm: true });
    ephemeralUserId = data.user?.id;

    authed = createClient(URL!, ANON!, { auth: { persistSession: false } });
    await authed.auth.signInWithPassword({ email, password });

    // Siembra fila real vía Prisma tipado (@lucams/db) para probar que el filtro no es tabla vacía
    const adminAuth = await service.auth.admin.createUser({
      email: `rls-admin-${Date.now()}@example.com`,
      password,
      email_confirm: true,
    });
    const admin = await prisma.adminUser.create({
      data: {
        supabaseUserId: adminAuth.data.user!.id,
        email: adminAuth.data.user!.email!,
        role: "SUPERADMIN",
      },
    });
    fixtureAdminId = admin.id;
  });

  afterAll(async () => {
    if (fixtureAdminId) {
      const adm = await prisma.adminUser.findUnique({ where: { id: fixtureAdminId } });
      await prisma.adminUser.deleteMany({ where: { id: fixtureAdminId } });
      if (adm) await service.auth.admin.deleteUser(adm.supabaseUserId);
    }
    if (ephemeralUserId) await service.auth.admin.deleteUser(ephemeralUserId);
  });

  const leaked = (res: { data: unknown[] | null; error: unknown }) =>
    !res.error && (res.data?.length ?? 0) > 0;

  it.each(SENSITIVE)("anon NO puede leer %s", async (table) => {
    expect(leaked(await anon.from(table).select("*").limit(1))).toBe(false);
  });

  it.each(SENSITIVE)("authenticated impostor NO puede leer %s", async (table) => {
    expect(leaked(await authed.from(table).select("*").limit(1))).toBe(false);
  });

  it("AdminUser existe vía Prisma en servidor pero devuelve 0 filas vía anon y rechaza INSERT/UPDATE/DELETE", async () => {
    expect(await prisma.adminUser.count()).toBeGreaterThan(0);
    expect((await anon.from("AdminUser").select("id")).data ?? []).toHaveLength(0);
    expect((await anon.from("Order").insert({ number: "EVIL-1", total: 1 })).error).not.toBeNull();
    expect(
      (await anon.from("Order").update({ total: 0 }).eq("number", "EVIL-1")).error,
    ).not.toBeNull();
    expect((await anon.from("Customer").delete().eq("email", "x@y.com")).error).not.toBeNull();
  });
});
```

---

## 8. Pruebas End-to-End con Playwright e inventario 57/57 (ejemplo real 6)

### Resolución de ambientes (`E2E_ENV`), `:4100` fullmode, bypass de STG y MFA TOTP

1. **Selector explícito `E2E_ENV=local|stg|prd` (`apps/web/tests/e2e/_setup/env.ts`):**
   - `local` (por defecto): carga `.env.local` sin pisar variables de la shell, apunta a `http://localhost:4000` (`PORT` configurable) y gestiona el `webServer` (`next dev` con `1` worker en local para evitar carreras en mutaciones de carrito; `next start` con `2` workers en CI). Si defines `PLAYWRIGHT_BASE_URL`, desactiva el arranque automático.
   - `stg`: carga `.env.stg`, apunta a `NEXT_PUBLIC_SITE_URL` e inyecta automáticamente la cabecera `x-vercel-protection-bypass: <VERCEL_BYPASS_TOKEN>` en `extraHTTPHeaders` para atravesar **Vercel Deployment Protection** ([`integrations/vercel.md`](integrations/vercel.md)).
   - `prd`: modo exclusivamente de solo lectura contra `https://lucamsshop.com`.
2. **Servidor aislado `:4100` para modo `full` (`make test-e2e-fullmode` / `scripts/e2e-fullmode.sh`):**
   - Como Next.js 16 permite un solo `next dev` activo por directorio, el script detiene limpiamente `:4000` si estaba corriendo, levanta un servidor dedicado en `:4100` con `NEXT_PUBLIC_STORE_MODE=full` y **`RESEND_API_KEY=` vacío** (cero correos salientes), y corre los specs `fullmode-*.spec.ts` (o un filtro puntual como `PW_CHANNEL=chromium scripts/e2e-fullmode.sh wompi-sandbox` contra el checkout hospedado de Wompi, que requiere Chromium completo y no headless shell).
3. **MFA TOTP `aal2` obligatorio en specs de `/admin` (`_helpers/mfa.ts` y `_helpers/totp.ts`):**
   - Ningún rol administrativo entra al panel sin factor TOTP verificado (`ADR-183`; sin factor es redirigido a `/admin/seguridad?enroll=required`).
   - Cuando `E2E_AUTH=1`, `_setup/global.setup.ts` aprovisiona cuentas efímeras de cliente y administrador enrolando TOTP real y guarda su `storageState` en `apps/web/tests/e2e/.auth/<env>/`. Los specs que crean admins propios usan `enrollTotpFactor(email, password)`, `completeMfaChallengeIfNeeded(page, secret)` o `loginAdminWithTotp(page, { email, password, totpSecret })`.
4. **Auditoría responsive en 6 perfiles de viewport (`audit-responsive.spec.ts`, `ADR-154`):**
   - Corre sobre **`desktop-chrome`** (`1280×800`), **`mobile-chrome`** (`390×844`), **`mobile-landscape`** (`844×390`), **`tablet`** (`768×1024`), **`tablet-landscape`** (`1024×768`) y **`desktop-large`** (`1920×1080`). Los cuatro perfiles táctiles usan `devices["Pixel 5"]` (`isMobile: true`, `hasTouch: true`).
   - Recorre rutas públicas, `/mi-cuenta/*` y `/admin/*`: **falla en rojo (`critical`)** si detecta cualquier desbordamiento horizontal (`document.documentElement.scrollWidth > clientWidth` identificando el nodo culpable) y reporta tap targets táctiles `< 40 px` (manteniendo cumplimiento estricto de WCAG 2.5.8 AA ≥ `24 px`). Como `adminPage` y `clientPage` abren contextos manuales, el spec les inyecta explícitamente `testInfo.project.use.viewport`.

### Ejemplo real 6 — Spec Playwright E2E (login `/admin` con MFA TOTP `aal2` + escaneo WCAG `axe`)

```ts
// Patrón real combinado de apps/web/tests/e2e/admin-mfa.spec.ts y axe.spec.ts
import { test, expect } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { prisma } from "@/lib/db";
import { enrollTotpFactor, loginAdminWithTotp } from "./_helpers/mfa";
import { scanA11y } from "./_helpers/axe-scan";

const canProvisionAdmin = Boolean(
  process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SECRET_KEY,
);

test.describe("Acceso administrativo con MFA TOTP obligatorio y WCAG 2.1 AA", () => {
  test.skip(!canProvisionAdmin, "Requiere SUPABASE_SECRET_KEY (GoTrue real)");

  let authUserId = "";
  let email = "";
  const password = "Admin-E2E-Password-987654!";
  let totpSecret = "";

  test.beforeAll(async () => {
    email = `e2e-admin-${Date.now()}@example.com`;
    const service = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SECRET_KEY!,
      { auth: { persistSession: false } },
    );
    const { data } = await service.auth.admin.createUser({ email, password, email_confirm: true });
    authUserId = data.user!.id;

    await prisma.adminUser.create({
      data: { supabaseUserId: authUserId, email, role: "SUPERADMIN", isActive: true },
    });
    totpSecret = await enrollTotpFactor(email, password);
  });

  test.afterAll(async () => {
    if (!authUserId) return;
    await prisma.adminUser.deleteMany({ where: { supabaseUserId: authUserId } });
    const service = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SECRET_KEY!,
      { auth: { persistSession: false } },
    );
    await service.auth.admin.deleteUser(authUserId);
  });

  test("completa credenciales → reto TOTP aal2 → dashboard sin violaciones axe críticas", async ({
    page,
  }) => {
    await loginAdminWithTotp(page, { email, password, totpSecret });
    await expect(page).toHaveURL(/\/admin\/dashboard/);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();

    const violations = await scanA11y(page);
    const blocking = violations.filter((v) => v.impact === "serious" || v.impact === "critical");
    expect(blocking).toEqual([]);
  });
});
```

### Inventario completo vigente de los 57 specs E2E (`apps/web/tests/e2e/*.spec.ts`)

El directorio `apps/web/tests/e2e/` contiene exactamente **57 archivos `.spec.ts`** verificados 1:1 en el repositorio:

#### A. Gates públicos por Pull Request en `ci.yml` (6 specs)

- `smoke.spec.ts` — Salud de endpoints (`/api/health`, `/api/health/db`), home, `/productos`, `/ayuda`, `/contacto`, legales, `/status`, `sitemap.xml` y `robots.txt` (también en Firefox/WebKit en el nightly).
- `a11y.spec.ts` — Invariantes estructurales de accesibilidad (`lang="es-CO"`, skip-link `#contenido`, `<main id="contenido">`, `<h1>` y atributos `alt`).
- `axe.spec.ts` — Auditoría automatizada WCAG 2.1 A/AA con `@axe-core/playwright` (`0` violaciones `serious` o `critical`).
- `compra.spec.ts` — Recorrido público de catálogo → PDP → carrito → paso inicial `/checkout/datos`.
- `estudio.spec.ts` — Carga interactiva, edición sobre lienzo Konva y validaciones principales del Estudio.
- `mobile-storefront-audit.spec.ts` — Gate anti-overflow horizontal y ergonomía móvil en el storefront público.

#### B. Estudio 2D/3D, PDP y edición desde carrito (7 specs)

- `cart-edit-calendario.spec.ts` — Clonación y edición desde `/carrito` de calendarios personalizados reemplazando la línea en sitio sin duplicarla.
- `estudio-letterset.spec.ts` — Personalización de Abecedario y Vocales multi-set (estilos por set, bordes y láminas).
- `estudio-studio-ux.spec.ts` — Selección explícita de plantilla, checklist guiado, bottom-sheet móvil «resumen + Listo» y barra de estilo.
- `generate-template-previews.spec.ts` — Generación y verificación determinista de miniaturas de plantillas del Estudio.
- `pdp-cantidad-tira.spec.ts` — Selector de variantes y cantidades en el producto híbrido de tiras fotográficas.
- `pdp-unidades.spec.ts` — Propagación del stepper «Unidades» (`?copies=N`) desde la PDP hacia el Estudio y el carrito.
- `studio-gestures.spec.ts` — Gestos táctiles y de puntero: zoom, paneo y encuadre fotográfico dentro del Estudio.

#### C. Checkout transaccional en modo `full` y pasarela real (8 specs)

- `catalog-mode.spec.ts` — Certifica que `NEXT_PUBLIC_STORE_MODE=catalog` oculte y bloquee cobros, fletes dinámicos e IA.
- `fullmode-checkout-wompi.spec.ts` — Creación de orden, registro en ledger `WompiPaymentAttempt` y firma de integridad hacia Wompi.
- `fullmode-cod.spec.ts` — Compra completa contraentrega (`COD`), reglas de riesgo y confirmación de pedido.
- `fullmode-cupones.spec.ts` — Aplicación, exclusiones, vigencia y topes de uso de cupones en checkout.
- `fullmode-envio.spec.ts` — Cotización de fletes, «Envío Lucams» en Bogotá y verificación del sello HMAC de tarifas.
- `fullmode-pasarela.spec.ts` — Retorno en `/checkout/gracias`, reconciliación de estado contra Wompi y reintentos seguros.
- `fullmode-stock.spec.ts` — Control de topes de inventario, quiebres de stock y mensajes nombrando el producto afectado.
- `wompi-sandbox.spec.ts` — **Journey real de dinero** (`PW_CHANNEL=chromium`): pago aprobado con tarjeta `4242` en Wompi sandbox → webhook firmado → orden `PAID` + guía en Aveonline sandbox.

#### D. Administración, MFA, CMS v2, posventa y auditorías responsive (15 specs)

- `admin-help.spec.ts` — Onboarding opcional, ayuda contextual, recorrido con progreso, búsqueda RBAC y retroalimentación persistida en `/admin/ayuda`. Los helpers MFA compartidos descartan el onboarding por defecto para aislar los demás escenarios administrativos y esta spec lo conserva explícitamente con `dismissOnboarding: false`.
- `admin-lifecycle.spec.ts` — Creación, activación, pausa y edición versionada de un recorrido con MFA real y limpieza del administrador y recorrido sintéticos. Verifica navegación, audiencia y controles sin crear clientes ni enviar correos reales.
- `admin-inventory.spec.ts` — Ajustes de stock auditados y umbrales de alerta en `/admin/inventario`.
- `admin-login.spec.ts` — Flujo de login administrativo separado en `/admin/login` y guardas de acceso.
- `admin-mfa.spec.ts` — Enrolamiento obligatorio TOTP, reto `/admin/login/mfa` (`aal2`) y _step-up_ en acciones sensibles.
- `admin-transactional.spec.ts` — Operación administrativa de pedidos, transiciones de estado, guías y conciliación.
- `audit-admin.spec.ts` — Recorrido integral de salud y permisos RBAC en las secciones de `/admin`.
- `audit-cliente.spec.ts` — Auditoría integral del portal autenticado de cliente.
- `audit-responsive.spec.ts` — Auditoría responsive maestra en los **6 perfiles de viewport** sobre tienda pública, cliente y `/admin`.
- `cms-edit-mode.spec.ts` — Overlay y edición contextual Live Edit sobre páginas públicas (`isCmsEditMode`).
- `cms-editing-flow.spec.ts` — Ciclo completo borrador → vista previa → publicación e invalidación de caché en `/admin/contenido`.
- `mobile-admin-audit.spec.ts` — Usabilidad móvil y ausencia de overflow en vistas operativas de `/admin` (`375×812`).
- `mobile-admin-link.spec.ts` — Regresión `ADR-162`: navegar en tienda con sesión admin no cierra sesión por prefetch hacia `/admin`.
- `responsive-admin-audit.spec.ts` — Auditoría responsive de tablas, filtros y cajones del backoffice.
- `retracto-garantia-cliente.spec.ts` — Autoservicio posventa sobre pedidos `DELIVERED`: radicación de retracto y garantía, acuse y bloqueo de ventanas legales vencidas.

#### E. Suite de homologación funcional punta a punta (`homolog-*.spec.ts` — 21 specs)

- `homolog-3d.spec.ts` — Montaje WebGL sin errores y controles de las **7 escenas 3D** del Estudio.
- `homolog-admin-cms.spec.ts` — Integridad de lectura/escritura de bloques y settings en CMS v2.
- `homolog-admin-cruces.spec.ts` — Consistencia cruzada entre pedidos, clientes/contactos, inventario, finanzas y métricas en `/admin`.
- `homolog-admin-modulos.spec.ts` — Verificación funcional de los módulos operativos del panel administrativo.
- `homolog-auth.spec.ts` — Ciclo completo con GoTrue + Mailpit real: registro → código OTP → login → recuperación → cambio de clave.
- `homolog-back-in-stock.spec.ts` — Suscripción y notificación de reposición en variantes agotadas.
- `homolog-contacto.spec.ts` — Radicación pública en contacto/soporte con validación Turnstile.
- `homolog-cookies.spec.ts` — Banner de consentimiento Ley 1581, preferencias por categoría y bloqueo previo de GA4 (`ADR-088`).
- `homolog-cotizacion.spec.ts` — Solicitud y seguimiento comercial B2B/personalizado en `/cotizacion/[token]`.
- `homolog-errores.spec.ts` — Páginas `404`, error boundaries y reporte hacia `/api/log-error`.
- `homolog-estudio-uploads.spec.ts` — Subida firmada de fotos (JPEG/PNG/WebP/HEIC), derivados `.canvas.webp` y alertas DPI.
- `homolog-mi-cuenta.spec.ts` — Perfil, direcciones estructuradas DANE/MinTIC, diseños, pedidos, soporte y seguridad en `/mi-cuenta`.
- `homolog-newsletter.spec.ts` — Alta con consentimiento expreso y baja de comunicaciones comerciales.
- `homolog-ocasion.spec.ts` — Landings dinámicas `/ocasion/[slug]` y filtrado en catálogo.
- `homolog-rastrear.spec.ts` — Búsqueda en `/rastrear` y portal `/pedido/[token]` con doble factor para invitados.
- `homolog-rate-limit.spec.ts` — Activación efectiva de respuestas HTTP `429` respaldadas por `rate_limit_check` en PostgreSQL.
- `homolog-recomendador.spec.ts` — Recomendador interactivo de productos/regalos del storefront.
- `homolog-resenas.spec.ts` — Envío de reseñas verificadas (`/resena/[token]`, solo `DELIVERED`) y moderación admin.
- `homolog-seo.spec.ts` — Metadatos canónicos, Open Graph, JSON-LD, redirecciones CMS y feed `/merchant.xml`.
- `homolog-webhooks.spec.ts` — Rechazo `401` ante firmas inválidas e idempotencia ante reintentos en `/api/webhooks/*`.
- `homolog-wishlist.spec.ts` — Guardado y eliminación de favoritos en `/mi-cuenta/favoritos`.

---

## 9. Carga k6, Lighthouse CI, perfilado CDP del Estudio y arquitectura CI/CD

### Pruebas de carga con k6 (`tests/load/storefront-browsing.js`)

Simula una rampa de hasta **50 usuarios virtuales concurrentes** (70 % home → `/productos` → PDP aleatoria, 20 % búsqueda `/productos?q=` + `/api/cms/blocks`, 10 % `/carrito`) exigiendo **`p(95) < 500 ms`**, **`p(99) < 1000 ms`** y tasa de errores **`< 1 %`**:

```js
// Extracto real de tests/load/storefront-browsing.js
export const options = {
  scenarios: {
    browsing: {
      executor: "ramping-vus",
      startVUs: 0,
      stages: [
        { duration: "30s", target: 10 },
        { duration: "2m", target: 50 },
        { duration: "30s", target: 0 },
      ],
      gracefulRampDown: "15s",
    },
  },
  thresholds: {
    http_req_duration: ["p(95)<500", "p(99)<1000"],
    http_req_failed: ["rate<0.01"],
    errors: ["rate<0.01"],
  },
};
```

```bash
# Ejecución contra local (:4000) o contra preview STG protegido
make test-load
k6 run -e BASE_URL="https://<preview-stg>.vercel.app" \
       -e VERCEL_BYPASS_TOKEN="<secreto_bypass>" \
       tests/load/storefront-browsing.js
```

### Lighthouse CI (`lighthouserc.json` y `lighthouserc.mobile.js`) y profiler CDP del Estudio

- **Lighthouse CI por PR:** dentro del job `e2e` corren `pnpm lhci` (preset `desktop`) y `pnpm lhci:mobile` (emulación móvil Moto G Power + 4G simulado) sobre `/` y `/productos` servidos con `next start`. Ambos bloquean con **`error`** si `categories:accessibility < 0.90` o `categories:seo < 0.90`, y emiten `warn` en `best-practices` (`0.85`) y `performance` (`0.50` desktop / `0.40` móvil).
- **Profiler de entrada al Estudio (`apps/web/scripts/profile-studio-entry.mjs`, `ADR-166`/`ADR-169`):** conecta Playwright con los dominios **`Performance`** y **`Profiler`** de Chrome DevTools Protocol sobre los 8 productos con Estudio vivo en viewport `390×844` (`deviceScaleFactor: 3`) con estrangulamiento `CPU ×6` y contexto frío por corrida. Mide `ScriptDuration`, conteo/duración de _longtasks_ hasta lograr `1.5 s` de quietud del hilo principal y funciones calientes por _self-time_, alertando si algún producto supera **+30 % de JS** frente al control (`set-fotoimanes-cuadrados`):
  ```bash
  # Ejecutar SIEMPRE contra un build de producción (jamás contra next dev)
  pnpm build
  cd apps/web && set -a && source ../../.env.local && set +a && pnpm exec next start -p 4000 &
  pnpm --filter web exec node scripts/profile-studio-entry.mjs --runs 3
  ```

### Arquitectura completa de los workflows en `.github/workflows/`

#### 1. `.github/workflows/ci.yml` — Los 5 gates obligatorios por Pull Request

Se dispara en `pull_request` hacia `develop` y `production` y en `workflow_dispatch` (con cancelación automática de runs previos de la misma rama). Abre con el job **`changes`**, que calcula `docs_only` en modo **fail-closed**: solo activa el fast-path (`~30 s`) cuando el diff modifica únicamente `docs/**`, `README.md`, `CLAUDE.md`, `AGENTS.md` o `apps/web/**/README.md` (**excluyendo siempre `packages/db/legal-content/*.md`**, que fuerza corrida completa).

El ruleset **`protect-ramas-criticas`** exige en verde estos **5 checks** antes de habilitar el botón de merge ([`integrations/github-and-ops.md`](integrations/github-and-ops.md)):

| #   | Check requerido en GitHub (`job id`)                                   | Infraestructura efímera                                      | Qué valida exactamente                                                                                                                                                                                                                                                            |
| --- | ---------------------------------------------------------------------- | ------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | **`Gitleaks secret scan`** (`secrets-scan`)                            | Ubuntu limpio (`fetch-depth: 0`)                             | Escaneo completo de commits del PR con `.gitleaks.toml` (corre **siempre**, aun con `docs_only=true`)                                                                                                                                                                             |
| 2   | **`Typecheck + Lint + Build`** (`quality`)                             | Node 22 + `pnpm@11.0.9`                                      | **Siempre:** `pnpm format:check` y `pnpm audit --prod --audit-level=high`. **Con código:** `pnpm -r typecheck`, `pnpm -r lint`, `cms-sitemap-parity.test.ts` (`166/166`), `check-script-guards.mjs`, `pnpm --filter @lucams/db test`, lint anti-voseo y `pnpm --filter web build` |
| 3   | **`Vitest tests (unit + integración con Postgres)`** (`unit-tests`)    | Service container `postgres:15` + `supabase-compat.sql`      | `prisma migrate deploy` → snapshot + `audit-schema-drift.mjs check` tras aplicar todas las `supabase/migrations/*.sql` → `pnpm --filter web test:coverage` validando los umbrales V8                                                                                              |
| 4   | **`RLS behavior (rls-matrix contra Supabase local)`** (`rls-behavior`) | Stack Supabase CLI completo (`.github/ci/localstack`)        | Levanta GoTrue, PostgREST y Storage reales, aplica migraciones Prisma y SQL como `supabase_admin`, y certifica `rls-coverage` + `rls-matrix`                                                                                                                                      |
| 5   | **`E2E + a11y + Lighthouse — Playwright`** (`e2e`)                     | `postgres:15` + semillas + `next build` / `next start :4000` | Corre `smoke`, `a11y`, `axe`, `compra`, `estudio` y `mobile-storefront-audit` en `desktop-chrome`, seguidos de `pnpm lhci` y `pnpm lhci:mobile` (sube `e2e-lighthouse-reports` por 7 días si falla)                                                                               |

#### 2. `.github/workflows/nightly-full.yml` — Certificación nocturna y gate de release

Corre diariamente a las `06:00 UTC` (`01:00 America/Bogota`, saltando limpio vía `gate-activity` si no hubo commits en las últimas 24 h) y siempre bajo demanda con `workflow_dispatch`:

- **`vitest-supabase-real`:** levanta Supabase local completo y corre las 6 suites profundas de GoTrue/Storage/sandbox (`auth-actions.integration.test.ts`, `finalize-server-render.integration.test.ts`, `personalization/service.integration.test.ts`, `letter-tiles.integration.test.ts`, `retention-service.integration.test.ts` y `lib/wompi.live.test.ts`).
- **`e2e-supabase-real`:** siembra catálogo completo + CMS v2 y ejecuta `admin-login.spec`, `admin-mfa.spec`, `admin-help.spec`, `admin-lifecycle.spec`, `cms-editing-flow.spec`, `responsive-admin-audit.spec`, `audit-cliente.spec`, `homolog-auth.spec` y `retracto-garantia-cliente.spec` (9 specs), más el smoke cross-browser en Firefox y WebKit.
- **`e2e-wompi-sandbox`:** ejecuta `wompi-sandbox.spec.ts` con `PW_CHANNEL=chromium` contra los sandboxes reales de Wompi y Aveonline y archiva `wompi-sandbox-evidence` durante 30 días. Antes de fusionar un release PR `develop → production`, `nightly-full.yml` debe estar en verde sobre `develop` (o haberse certificado manualmente `scripts/e2e-fullmode.sh wompi-sandbox` sobre el SHA candidato si faltaran secretos sandbox en el runner), acompañado del recorrido de [`QA_CHECKLIST.md`](QA_CHECKLIST.md).

#### 3. `.github/workflows/post-deploy-smoke.yml` — Verificación automática post-deploy en PRD

Se activa automáticamente al recibir el evento nativo `deployment_status` de Vercel (`environment == "Production"` y `state == "success"`) haciendo checkout explícito de **`ref: production`** (nunca `develop`):

1. Ejecuta `node apps/web/scripts/post-deploy-smoke.mjs` (Node 22 puro sin dependencias) contra `https://lucamsshop.com`, exigiendo HTTP `200` en `/api/health`, `/api/health/db`, `/api/health/crons`, `/` y `/productos`, además de verificar los marcadores estructurales del HTML (`lang="es-CO"`, `href="#contenido"`, `<main id="contenido">`).
2. Compara las carpetas de `packages/db/prisma/migrations/` en `production` contra `_prisma_migrations` en la base de PRD (`BACKUP_DATABASE_URL`) y falla en rojo si quedó alguna migración pendiente de aplicar ([`OPERATIONS.md`](OPERATIONS.md)).
