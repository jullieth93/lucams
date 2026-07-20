I now have a complete and accurate picture. Here is my report.

# Lector 3 — Pre-launch C/D/E

> Fuente: `docs/SECURITY.md` (1340 líneas, leído completo), `docs/OBSERVABILITY.md` (364 líneas, completo), `docs/TESTING.md` (616 líneas, completo), cruzado contra el código real en `apps/web/` (`lib/`, `proxy.ts`, `app/`, `tests/`, `.github/workflows/ci.yml`). Los docs mezclan spec con marcadores "implementado"; verifiqué cada afirmación contra el repo.

---

## BLOQUE C — Seguridad (`docs/SECURITY.md`)

El doc es enorme y mezcla **lo ya implementado** (auth, webhooks, headers) con **spec pendiente** (RBAC middleware, tests RLS, MFA). Esfuerzo global del bloque: **L**.

### 1. Qué exige el doc para estar listo pre-launch

- **Autenticación** (§ Auth): email+password con confirmación, cookies HttpOnly+Secure+SameSite=Lax, TTL access 1h / refresh 30d, logout server-side, sesión admin expira 30 min idle, política de password (min 8, strength meter, Pwned Passwords, rate-limit doble IP+email, OTP de recovery, confirmar password, signOut global).
- **MFA admin obligatorio** (rol SUPERADMIN/MANAGER) desde Fase 6 — TOTP vía Supabase. MFA cliente opcional en `/cuenta/seguridad`.
- **RBAC** (§ Autorización): tabla `AdminUser` con `role`+`isActive`; middleware `app/middleware.ts` que valida rol por ruta `/admin/*`; defense-in-depth (cada Server Action revalida rol).
- **RLS** en toda tabla accesible por `anon` (mandato #12) + **tests RLS automatizados** (criterio de aceptación de Fase 1).
- **Headers HTTP** base (HSTS, X-Frame DENY, nosniff, Referrer-Policy, Permissions-Policy) + **CSP** (idealmente con nonce).
- **CORS**: bloquear orígenes no-allowlist en `/api/*`.
- **CSRF**: SameSite=Lax + verificación Origin/Referer + token sincronizador (`lib/csrf.ts`) para flujos críticos.
- **Rate limiting** Postgres+pg_cron con buckets por endpoint (AI, checkout, signup, login, shipping, upload, webhooks, storefront).
- **Validación Zod** de todo input externo; sanitización HTML user-generated; mass-assignment prevention.
- **File upload**: allowlist MIME, ≤10MB, nombre UUID, validación MIME real post-upload (`file-type`), EXIF stripping (`sharp`).
- **Webhooks** Wompi/Aveonline: HMAC timing-safe + idempotencia + replay protection (±5min) + environment match.
- **Audit logs** (`AdminActionLog`), **logging** estructurado con PII redactada.
- **PII/Habeas Data**: páginas `/cuenta/privacidad`, export, soft-delete + hard-delete a 30d, políticas legales publicadas.
- **Secret scanning**: gitleaks pre-commit + CI + GitHub Push Protection.
- **CI/CD security**: branch protection en `main`, signed commits, `pnpm audit --audit-level=high`, license-check.
- **Otros vectores**: open-redirect (`lib/redirects.ts`), honeypots, idempotency keys cliente, paginación con límites, modo mantenimiento, `timingSafeEqual`, backup verification, DR (RPO ≤24h / RTO ≤4h).

### 2. Ya implementado vs. falta

**✅ Implementado (confirmado en código):**
- Política de contraseñas completa — el doc cita commits reales (`68da751`, `8b640ee`); existen `lib/password-strength.ts`, `lib/pwned-passwords.ts`, `lib/rate-limit-keys.ts` (+ sus `.test.ts`).
- **Headers de seguridad + CSP**: implementados en `apps/web/proxy.ts` (HSTS línea 60, X-Frame-Options DENY 61, Referrer-Policy, COOP/CORP, `Content-Security-Policy` seteado línea 217). Nota: el doc dice `next.config.mjs`/`middleware`, pero la implementación real vive en `proxy.ts` (232 líneas).
- **CORS**: `ALLOWED_ORIGINS` + `isOriginAllowed` + rechazo de `/api/*` cross-origin en `proxy.ts` (líneas 99-166).
- **RBAC base (parcial)**: `lib/auth.ts` valida `AdminUser` con `isActive:true, deletedAt:null` (línea 71). El check de rol existe a nivel de helper/Server Action.
- **Turnstile**: `components/turnstile-widget.tsx` + `lib/turnstile.ts` (`verifyTurnstileToken` server-side contra siteverify) usado en contacto, newsletter, support.
- **Webhooks**: certificados (Bloque A 2026-06-27) — HMAC timing-safe, idempotencia, replay ±5min, environment match (`lib/wompi.ts`, `/api/webhooks/aveonline`).
- **Rate-limit runtime**: `lib/rate-limit.ts` (`rateLimit()` sobre RPC `rate_limit_increment`).
- **Healthchecks**: `/api/health`, `/health/db`, `/health/resend`, `/health/storage`, `/health/all`.
- **Cookie consent**: `lib/cookie-consent.ts` + test.
- **gitleaks en CI**: job "Gitleaks secret scan" en `ci.yml` (líneas 91-100) + `.gitleaks.toml` en raíz. GitHub Push Protection validado (incidente 2026-05-09).
- **Open-redirect, validators**: `lib/colombia-validators.ts`, `lib/origin.ts`.

**⏳ Falta / `[pendiente verificación]`:**
- **MFA admin** (obligatorio pre-launch por el doc): grep de `mfa/TOTP/enroll` en `app/ features/ lib/` → **0 resultados**. No implementado. (S-M)
- **Middleware `/admin/*` formal**: NO existe `middleware.ts` ni `app/middleware.ts`. La protección de admin vive en helpers (`lib/auth.ts`) y `proxy.ts`, no en el middleware nombrado por el doc. Verificar que toda ruta `/admin/*` esté efectivamente cubierta (defense-in-depth real). (M)
- **Tests RLS automatizados** (criterio de aceptación Fase 1): NO existe ningún archivo `*rls*`. Spec sin implementar. (M-L — depende de Supabase local)
- **`lib/csrf.ts`**: NO existe. El doc lo especifica con código; solo hay protección base SameSite. (S)
- **CSP con nonce**: el doc lo marca como ideal; verificar si `proxy.ts` usa `'unsafe-inline'` o nonces. `[pendiente verificación]` del valor exacto.
- **EXIF stripping / validación MIME real post-upload** (`file-type`, `sharp`): hay `lib/photo-validation.ts` y `lib/storage.ts` — verificar que cubran MIME real + EXIF, no solo extensión. `[pendiente verificación]`
- **Páginas legales / Habeas Data** (`/cuenta/privacidad`, export, delete account): no confirmado en este barrido. `[pendiente verificación]`
- **Branch protection + signed commits + license-check + `pnpm audit` en CI**: `ci.yml` tiene typecheck/lint/build, vitest, gitleaks, prettier — **NO** tiene `pnpm audit` ni license-check ni e2e/rls. Falta. (S)
- **TTLs Supabase / política password en Free**: ya marcados `[ ]` en el propio doc (§ "Pendiente de verificación").
- **Pen test externo pre-lanzamiento**: pendiente (acción humana / proveedor).

### 3. Dependencias
- Tests RLS dependen de **Supabase local** + de que las políticas RLS estén escritas (las define `ARCHITECTURE.md`).
- MFA admin depende de configuración Supabase Auth TOTP.
- Observabilidad de seguridad (§ 19) depende del Bloque D (alertas Resend, `/admin/observability`).

---

## BLOQUE D — Observabilidad (`docs/OBSERVABILITY.md`)

El doc es **mayoritariamente spec**, no implementación. Esfuerzo: **M**.

### 1. Qué exige para estar listo pre-launch (Fase 0–6, "lo mínimo viable")

- Logs estructurados (`pino` + `requestId` propagado vía AsyncLocalStorage).
- Vercel Logs como única vista + Supabase dashboard para DB.
- **Alertas vía Resend** (`alertas@lucamsshop.com`) con reglas: 5+ errores 500/5min, webhook fallando >3x, saga compensation fallida, `/api/health` 503 >3min, stock oversold, firma webhook inválida 3+/5min, Resend bounce >5%, DB >80%, pgmq lag >30min, etc. Con dedup (<30min) + resumen diario 8am.
- **Healthchecks** `/api/health/*`.
- **Dashboards en `/admin/observability`** (queries SQL contra logs y tablas): "Operación diaria", "Salud técnica", "SLOs".
- **SLOs/SLIs** definidos con error budgets; cron mensual (`pg_cron`) que calcula budgets y publica en `/admin/observability/slos`.
- Healthchecks de integraciones (Wompi/Venndelo/Resend).

### 2. Ya implementado vs. falta

**✅ Implementado:**
- **Healthchecks**: `/api/health`, `/health/db`, `/health/resend`, `/health/storage`, `/health/all` (más completos que el doc, que solo nombraba 3).
- **Logger estructurado**: `lib/logger.ts` + `lib/request-id.ts` (requestId existe). Eventos `security.*`, `auth.*` ya se loggean (confirmado en SECURITY.md).

**⏳ Falta:**
- **Dashboard `/admin/observability`** (los 3 paneles): `find app -path "*observability*"` → **0 resultados**. No existe. (M)
- **`/admin/observability/slos`** + cron mensual de error budgets: no existe. (M)
- **Sistema de alertas Resend** con las ~13 reglas + dedup + resumen diario: hay envíos Resend transaccionales (`lib/resend.ts`), pero NO un motor de alertas operacionales. Falta. (M)
- **`/api/metrics`** (Prometheus/JSON con token Bearer): `find app -path "*metrics*"` → **0 resultados**. No existe. (S-M)
- **Healthcheck de integraciones agregado** existe (`/health/all`) — verificar que cubra Wompi/Venndelo realmente. `[pendiente verificación]`
- Monitoreo externo (UptimeRobot/BetterStack), tracing OTel: explícitamente **post-lanzamiento (Fase 7)** — no bloquea launch.

### 3. Dependencias y alternativa gratuita
- **Sin Sentry** (mandato #7): la alternativa pre-launch definida es **Vercel Logs + Supabase dashboard + alertas Resend + `/admin/observability`**. Decisión definitiva de error-monitoring diferida a **ADR-022 (Fase 7)**; tracing a **ADR-024**.
- Las alertas dependen de Resend configurado (`alertas@lucamsshop.com` — acción humana: verificar dominio/DNS).
- SLOs de saga/webhook/oversold dependen de tablas del Bloque A (ya certificadas: `SagaLog`, `WebhookEvent`, `InventoryLog`).
- Cron de error budgets depende de `pg_cron`.

---

## BLOQUE E — Testing (`docs/TESTING.md`)

El doc es **spec de estrategia**; la implementación real está **en etapa muy temprana**. Esfuerzo: **L**.

### 1. Qué exige para estar listo pre-launch

- **Pirámide**: ~60% unit (Vitest), ~30% integración+RLS, ~10% E2E/smoke/visual.
- **Unit** (Vitest+RTL): `lib/format`, `wompi` (firma), `csrf`, `idempotency`, `redirects`, `retry`, `circuit-breaker`, `validation/*`, `service.ts` de cada feature, componentes.
- **Integración** (Supabase local): `repository.ts` real, saga, `pgmq`, `rate-limit`, `cache`, webhook handlers (firma válida/inválida).
- **Tests RLS** (críticos, "sin estos RLS solo es papel") — cliente impostor, aislamiento Customer, admin sí lee. **Bloquea merge** en CI.
- **E2E Playwright**: compra Wompi sandbox, compra COD, personalización+compra, auth completo, cupón, admin crear producto, admin cambiar estado, retracto (Fase 4+), stock oversold negative-path.
- **Visual regression** (Playwright screenshots + Pixelmatch) en home, catálogo, PDP, carrito, checkout, orden confirmada, 404, 500.
- **A11y automatizada** (`@axe-core/playwright` + RTL) — violación nueva bloquea merge.
- **Performance**: Lighthouse CI (budget) + k6 load (pre-release Fase 7).
- **Smoke post-deploy**: home <3s, `/api/health`, `/api/health/db`, PDP seed, checkout happy path — fallo ⇒ rollback.
- **Tests de seguridad**: `pnpm audit`, gitleaks, headers, rate-limit loop→429, webhook firma inválida, RLS impostor.
- **CI workflow** con jobs: typecheck, lint, unit (coverage), integration, rls, build, e2e, audit-deps, audit-secrets, lighthouse.
- **Coverage targets**: lib 90%, service 80%, repository 70%, routes 70%, components 50%, total ≥70% (CI rompe si baja).

### 2. Ya implementado vs. falta

**✅ Implementado (parcial):**
- **Vitest + Playwright configurados**: `vitest.config.ts`, `playwright.config.ts` existen.
- **8 archivos unit/integration**: `lib/format.test.ts`, `lib/rate-limit-keys.test.ts`, `lib/cookie-consent.test.ts`, `lib/wompi-env.test.ts`, `features/support/schemas.test.ts`, `features/newsletter/unsubscribe.test.ts`, `features/orders/stock.integration.test.ts`, `features/orders/order-transitions.test.ts`. Hay carpeta `coverage/`.
- **1 E2E**: `tests/e2e/smoke.spec.ts` (smoke).
- **CI con vitest + gitleaks + typecheck/lint/build + prettier**.

**⏳ Falta (la mayoría):**
- **Tests RLS**: 0 archivos. **Criterio crítico/bloqueante** del doc, sin implementar. (L — requiere Supabase local + políticas RLS escritas)
- **E2E de flujos críticos**: solo existe smoke. Faltan compra Wompi, COD, personalización, auth, cupón, admin CRUD, admin estado. (L)
- **Visual regression**: 0 `toHaveScreenshot`, 0 snapshots `.png`. No implementado. (M)
- **A11y automatizada**: 0 referencias a `axe` en `tests/`. No implementado. (M)
- **Lighthouse CI**: no hay job en `ci.yml`. Falta. (S)
- **k6 load**: explícitamente Fase 7 — no bloquea launch.
- **Cobertura unit insuficiente**: solo 8 tests para ~todo el dominio; lejos del ≥70% total. Faltan tests de `wompi` firma, `redirects`, `circuit-breaker`, `validation/*`, services de checkout. (L)
- **CI no tiene jobs `integration`, `rls`, `e2e`, `audit-deps`, `lighthouse`** que el doc especifica (solo unit). Falta ampliar el workflow. (M)
- **Coverage thresholds en `vitest.config.ts`**: verificar si están seteados (CI debe romper bajo umbral). `[pendiente verificación]`

### 3. Dependencias
- **Tests RLS y E2E dependen de RBAC/RLS reales** (Bloque C) — no se pueden escribir antes de que las políticas RLS existan y el middleware/role-check esté firme.
- **Integración + RLS dependen de Supabase local** corriendo en CI (GH Actions service).
- **E2E de compra depende de Wompi sandbox** (Bloque A, ya certificado) + MSW para mocks.
- **E2E admin depende de RBAC** (Bloque C).
- **A11y/visual dependen del storefront UI** estabilizado.

---

## Síntesis de lo accionable pendiente (pre-launch)

| # | Pendiente | Bloque | Esfuerzo | Dependencia |
|---|-----------|--------|----------|-------------|
| 1 | Middleware `/admin/*` formal + verificar cobertura RBAC defense-in-depth | C | M | — |
| 2 | MFA admin obligatorio (TOTP Supabase) | C | S-M | Supabase Auth |
| 3 | `lib/csrf.ts` (token sincronizador flujos críticos) | C | S | — |
| 4 | `pnpm audit` + license-check + branch protection/signed commits en CI | C | S | — |
| 5 | Verificar EXIF stripping + MIME real post-upload; CSP nonce; páginas Habeas Data | C | S-M | `[pend. verif.]` |
| 6 | Dashboards `/admin/observability` (operación, salud técnica, SLOs) | D | M | tablas Bloque A |
| 7 | Motor de alertas Resend (~13 reglas + dedup + resumen diario) | D | M | Resend DNS (acción humana) |
| 8 | `/api/metrics` + cron error budgets | D | S-M | pg_cron |
| 9 | **Tests RLS automatizados (bloqueante CI)** | E | L | Supabase local + RLS escrita (C) |
| 10 | E2E flujos críticos (Wompi, COD, auth, cupón, admin) | E | L | Bloque A + RBAC (C) |
| 11 | Visual regression + a11y (`axe`) + Lighthouse CI | E | M | UI estable |
| 12 | Ampliar cobertura unit a ≥70% + jobs CI (integration/rls/e2e/lighthouse) | E | L | — |

**Cadena de dependencias clave:** C (RBAC/RLS) **antes** de E (tests RLS y E2E admin); D (alertas) depende de Resend DNS verificado (acción humana ya señalada en el plan); el Bloque A certificado ya provee las tablas (`SagaLog`, `WebhookEvent`, `InventoryLog`) que D y E consumen.

**Nota de divergencia doc↔código:** los docs nombran `app/middleware.ts` y `next.config.mjs` para headers/CORS/RBAC, pero la implementación real vive en `apps/web/proxy.ts` y `lib/auth.ts`. No existe `middleware.ts`. Recomiendo conciliar la nomenclatura en los docs o verificar que `proxy.ts` cubra efectivamente todas las rutas `/admin/*` (`[pendiente verificación]`).