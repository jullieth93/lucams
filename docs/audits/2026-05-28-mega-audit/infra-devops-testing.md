I have enough evidence now. Let me compile the audit findings.

# Dimensión: INFRA + DEVOPS + TESTING

## Estado actual real

CI existe en GitHub Actions con 4 jobs (quality build, vitest, gitleaks, prettier) cubriendo push/PR a `develop` y `main`, con concurrency cancel y env placeholders embebidos. No hay `vercel.json` (deploys de Vercel corren con defaults). Testing harness está configurado (Vitest 4 + Playwright 1.60 + k6) pero con **solo 4 archivos de test reales** (3 unit + 1 smoke e2e) para 23 API routes, 50 features y flujos críticos como checkout/Wompi/Aveonline sin cobertura automatizada. Error boundaries y observabilidad (logger estructurado, request-id, web vitals, audit log, RFC 7807) están bien construidos como helpers/cross-cutting, pero la integración E2E con tests está vacía.

## Fortalezas

- CI bien estructurado en `.github/workflows/ci.yml`: jobs paralelos (quality, unit, secrets-scan, format-check), concurrency cancel, timeouts explícitos, Node 22 + pnpm 11.0.9 pinned.
- Gitleaks config personalizada en `/.gitleaks.toml` con reglas extra (Supabase secret_key pattern, Wompi prv_*, Anthropic sk-ant-, Resend re_) y allowlist para `.env.example`/docs.
- Cross-cutting helpers maduros y consistentes: `lib/logger.ts` (JSON estructurado con redaction PII), `lib/request-id.ts` (AsyncLocalStorage), `lib/errors.ts` (RFC 7807 completo con `problemResponse`), `lib/admin-audit.ts` (con fail-safe), `lib/resend.ts` (retry + circuit breaker), `lib/rate-limit.ts` (Postgres-based).
- Error boundaries reales: `app/error.tsx` y `app/global-error.tsx` rendereando branding kawaii (logo/mascote/colores), `app/not-found.tsx` con CMS-managed copy.
- Web Vitals RUM funcional end-to-end: `components/web-vitals.tsx` con `useReportWebVitals` + `sendBeacon`, route normalization, integrado en `app/layout.tsx:94`, persistido en `WebVital` table vía `/api/vitals` con Zod validation.
- `proxy.ts` (Next 16 rename de middleware) implementa headers de seguridad (HSTS, CSP, COOP/CORP, Permissions-Policy), CORS estricto API, admin gate, maintenance gate, request-id propagado.
- `next.config.ts` documenta `bodySizeLimit: 50mb` con racional explícito (Server Action multipart limit Next 16).
- Local dev paridad con Vercel: Makefile root con primitivos (`build`/`typecheck`/`lint`/`format`/seeds), Makefile state-dir (`/home/ansible/workspaces/lucams-shop-local/Makefile`) con orquestación procesos (web/ngrok), env-check, vercel-parity.
- `.env.example` completo y bien documentado (~107 líneas con comentarios racional) cubriendo Supabase, Wompi, Venndelo, Aveonline, Resend, Anthropic, Turnstile, R2.
- k6 load test escrito en `tests/load/storefront-browsing.js` (storefront browsing scenario con thresholds p95<500ms).

## Debilidades

- **Test coverage: 4 archivos de test totales** (`lib/format.test.ts`, `lib/cookie-consent.test.ts`, `lib/rate-limit-keys.test.ts`, `features/support/schemas.test.ts`, `tests/e2e/smoke.spec.ts`) — para un e-commerce con saga POST-PAID, webhook Wompi, checkout multi-step, generarGuia Aveonline, RLS policies, CMS in-place editor. La pirámide `TESTING.md` está en papel pero no implementada.
- **No hay tests RLS automatizados** — `make test-rls` solo imprime "pendientes". RLS solo es papel hasta que existan estos tests (mandato del propio `TESTING.md`: "Sin estos tests, RLS solo es un papel").
- **No hay tests del happy path crítico:** ningún test cubre creación de Order, webhook Wompi signature verification, generación de guía Aveonline, saga post-PAID, idempotency.
- **CI no ejecuta build de packages/db**, no corre `pnpm format:check` en el job de quality (está aislado), y no corre Playwright E2E ni audit-deps ni Lighthouse (todos previstos en `TESTING.md:548`).
- **No existe `vercel.json`** — sin pinning de framework/regions/build override. El Makefile state-dir hace referencia a "/home/ansible/workspaces/lucams_shop/vercel.json" como fuente para `vercel-parity`, pero no existe.
- **`.env.example` drift:** local tiene `AVEONLINE_WEBHOOK_SECRET` (ADR-reciente), `NGROK_AUTHTOKEN`, `NGROK_DOMAIN`, `PORT` que NO están documentados en `.env.example`. Inverso: `.env.example` documenta `ANTHROPIC_API_KEY`, `ANTHROPIC_MODEL`, `R2_*` (4 vars), `CSRF_SECRET`, `RESEND_NEWSLETTER_SEGMENT_ID` que **no se referencian en código** todavía.
- **`lib/idempotency.ts` no existe** — TESTING.md lo lista como cubierto, CONVENTIONS habla de patrón idempotency. Webhooks Wompi/Aveonline no tienen helper centralizado; cualquier dedup vive ad-hoc en cada route.
- **Circuit breaker solo existe en `lib/resend.ts`** — Wompi/Aveonline/Venndelo no tienen breaker centralizado; falla en cascada no protegida.
- **Logger usa `console.log` no pino** — funcional pero el comentario en `lib/logger.ts:8-11` muestra que pino fue arrancado y abandonado por bug Next 16/Turbopack. Trade-off documentado, pero perdimos features pino (transports, child loggers, sampling).
- **Smoke E2E nunca corre en CI** — `playwright.config.ts` está bien armado, hay 1 spec `smoke.spec.ts` con 9 tests útiles, pero el job CI no lo ejecuta (no aparece en `ci.yml`).
- **STATE.md/ROADMAP.md drift ~2 semanas** — STATE dice "Fase 2 EN CURSO" con fecha 2026-05-11, pero hay commits posteriores `feat(checkout): webhook Wompi + saga`, `feat(orders): emails`, `feat(shipping): Aveonline real`, `feat: link mágico guest` (todo Fase 3+ y Fase 4). Roadmap dice Fases 3-7 "Pendiente sin aprobar".
- **No hay coverage thresholds en vitest.config.ts** — TESTING.md prescribe ≥70% project-wide pero `coverage.thresholds` está ausente, así que CI nunca rompe por coverage.
- **No hay job `audit-deps` (pnpm audit)** ni `lighthouse-ci` ni `audit-secrets-baseline` ni `accessibility (axe)` ni `visual-regression` — todos prescritos en `TESTING.md:545-585`.
- **No hay Dependabot/Renovate config** — sin auto-update de deps de seguridad.
- **No existe `CODEOWNERS` ni branch protection rules visibles** (no auditable desde local, requiere GitHub).

## Findings detallados

### [P0] T-001 — Test coverage casi cero en flujos pre-launch críticos
- **Categoría**: gap
- **Evidencia**: 4 archivos de test reales en todo el repo (`apps/web/lib/format.test.ts`, `apps/web/lib/cookie-consent.test.ts`, `apps/web/lib/rate-limit-keys.test.ts`, `apps/web/features/support/schemas.test.ts`). 1 spec E2E (`apps/web/tests/e2e/smoke.spec.ts`). El roadmap dice fases 3-4 (checkout, Wompi, Aveonline saga) ya están funcionando — pero sin un solo test que cubra: webhook Wompi signature verification (`lib/wompi.ts:185 verifyWebhookSignature`), saga post-PAID, generarGuia2 idempotency, cart merge anon→user, integrity signature de Wompi.
- **Impacto**: cualquier regresión rompe ventas en silencio hasta que un cliente reporta. Sin red de seguridad para Fase 7 (lanzamiento). El propio `docs/TESTING.md` lo dice: "Sin pruebas, no hay productivo".
- **Recomendación**: cubrir 6 vectores mínimos antes de Fase 7: (a) `verifyWebhookSignature` con webhook real Wompi grabado, (b) `generateIntegritySignature` valor pre-calculado, (c) integration tests de `createOrder` con stock reservation (con Supabase local), (d) E2E Playwright "happy path Wompi sandbox 4242", (e) RLS impostor tests (Customer A no lee Order B), (f) test del flow webhook Aveonline `tracking.updated`.
- **Horas estimadas**: 18-24
- **Acción humana Lucy**: ninguna (puedo implementarlos cuando autorices)

### [P0] T-002 — RLS solo es papel: no hay un solo test que la valide
- **Categoría**: risk
- **Evidencia**: `Makefile:120-121` — target `test-rls` imprime "RLS automated tests pendientes — sub-bloque L". `docs/TESTING.md:259` dice textual "Críticos. Sin estos tests, RLS solo es un papel". Hay 5 migraciones SQL con RLS policies en `supabase/migrations/` pero ninguna verificación automatizada.
- **Impacto**: una migración que rompa una policy (típicamente: olvidar `enable row level security` en una tabla nueva con anon_key access) deja datos expuestos en producción. Riesgo legal (Ley 1581) además de comercial.
- **Recomendación**: implementar suite `__tests__/rls.test.ts` con dos clientes Supabase (customerA, customerB, admin) que valide isolation por tabla sensible: `Order`, `Customer`, `Address`, `Cart`, `AdminActionLog`, `Design`. Correr en CI bloqueante. Patrón ya está en `docs/TESTING.md:262-301`.
- **Horas estimadas**: 6-8 (más unas 2 si requiere levantar Supabase local en GH Actions)
- **Acción humana Lucy**: ninguna técnica; decidir si CI corre contra Supabase local en GH Actions (más lento) o contra un proyecto Supabase Test dedicado (necesita crear).

### [P0] T-003 — Falta helper `lib/idempotency.ts` para webhooks de pagos
- **Categoría**: stub
- **Evidencia**: `docs/TESTING.md:131` lista `lib/idempotency.ts` como cubierto por unit tests, `docs/CONVENTIONS.md` (referenciado) menciona patrón idempotency. `grep -rln idempotencyKey` solo encuentra `lib/resend.ts` (Resend Idempotency-Key header) y `app/admin/.../image-actions.ts` (no relacionado). El archivo `lib/idempotency.ts` no existe.
- **Impacto**: Wompi puede reenviar webhooks; sin dedup centralizada cada handler debe rodar su propia lógica → riesgo de doble update de Order o doble creación de envío Aveonline.
- **Recomendación**: crear `lib/idempotency.ts` con función `withIdempotency(key, ttl, fn)` que usa una tabla `IdempotencyKey` o `Cache` con UPSERT atómico. Usarlo en `app/api/webhooks/wompi/route.ts` (key = `transaction.id`) y `app/api/webhooks/aveonline/route.ts` (key = `guia + status + timestamp`).
- **Horas estimadas**: 4-5
- **Acción humana Lucy**: ninguna

### [P1] T-004 — CI no corre Playwright smoke ni format:check ni audit-deps
- **Categoría**: gap
- **Evidencia**: `.github/workflows/ci.yml` tiene 4 jobs (`quality`, `unit-tests`, `secrets-scan`, `format-check`). NO corre `pnpm test:e2e` (Playwright config y smoke spec existen y son útiles), no corre `pnpm audit --audit-level=high`, no corre Lighthouse CI (todo prescrito en `docs/TESTING.md:548-584`). `format-check` existe pero con install separado (sin cache compartido).
- **Impacto**: la única red E2E que hay (smoke con 9 chequeos) nunca evita merges rotos. Vulns de deps no se detectan hasta release. Perf budget no se enforza.
- **Recomendación**: agregar 3 jobs: (a) `e2e-smoke` (Playwright contra `pnpm dev` con cache), (b) `audit-deps` (`pnpm audit --audit-level=high`), (c) `lighthouse` (treosh/lighthouse-ci-action contra Vercel preview, solo en PRs). Bloquear merge en (a) y (b); (c) solo report.
- **Horas estimadas**: 3-4
- **Acción humana Lucy**: ninguna

### [P1] T-005 — Drift en `.env.example` vs realidad (vars sin documentar y vars docs sin uso)
- **Categoría**: docs-drift
- **Evidencia**:
  - `.env.local` tiene `AVEONLINE_WEBHOOK_SECRET`, `NGROK_AUTHTOKEN`, `NGROK_DOMAIN`, `PORT` no documentados en `.env.example`.
  - `.env.example` documenta `ANTHROPIC_API_KEY`, `ANTHROPIC_MODEL`, `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET`, `CSRF_SECRET`, `RESEND_NEWSLETTER_SEGMENT_ID` que `grep` confirma NO se usan en código (solo CSRF_SECRET aparece en CI).
- **Impacto**: dev nuevo (Lucy reset de VM o futuro contributor) instala variables que no necesita y omite las que sí. Mantenibilidad y onboarding rotos.
- **Recomendación**: (a) agregar a `.env.example` la sección `AVEONLINE_WEBHOOK_SECRET` (ya hay commit reciente `feat: ... admin webhook Aveonline + secret env`) + `# NGROK_* (solo dev)`. (b) Eliminar de `.env.example` las vars `ANTHROPIC_*`/`R2_*` o marcarlas claramente `# Fase 7 — pendiente`.
- **Horas estimadas**: 0.5
- **Acción humana Lucy**: ninguna

### [P1] T-006 — STATE.md/ROADMAP.md drift ~2 semanas; no refleja Fase 3/4 reales
- **Categoría**: docs-drift
- **Evidencia**: `docs/STATE.md` "Resumen actual" dice "Fase 2 EN CURSO (2026-05-11)" mientras `git log` muestra ya implementados (sin actualizar STATE): webhook Wompi + saga POST-PAID (`4884eb3`), emails transaccionales (`cb0e88f`), admin pedidos (`051954d`), shipping Aveonline real con guías generadas (`e727b78`), link mágico guest (`f3a64ef`). `docs/ROADMAP.md` declara Fases 3-7 "Pendiente sin aprobar" cuando Fase 3 (Estudio) y Fase 4 (Checkout+pagos+logística) ya están parcialmente en producción.
- **Impacto**: cualquier futura sesión (yo u otra) carga contexto incorrecto y planea mal. Auditorías como esta deben adivinar el estado.
- **Recomendación**: actualizar STATE.md "Resumen actual" + agregar entrada de bitácora cubriendo trabajo entre 2026-05-11 y hoy 2026-05-28. Actualizar ROADMAP checklist de Fases 3 y 4 marcando lo completado.
- **Horas estimadas**: 1
- **Acción humana Lucy**: ninguna técnica; revisar/aprobar redacción

### [P1] T-007 — No hay coverage thresholds: CI nunca rompe por baja cobertura
- **Categoría**: gap
- **Evidencia**: `apps/web/vitest.config.ts:22-26` define `coverage.provider/reporter/exclude` pero NO `coverage.thresholds`. `docs/TESTING.md:602-604` declara targets 90/80/70/70/50 y "CI rompe si baja del threshold definido (`vitest.config.ts` → `coverage.thresholds`)".
- **Impacto**: nada fuerza que el coverage suba. Pendiente perpetuo.
- **Recomendación**: agregar `coverage: { thresholds: { lines: 70, functions: 70, branches: 60, statements: 70 } }` cuando T-001 esté cumplido (forzar antes solo ahogará PRs sin valor).
- **Horas estimadas**: 0.5 (config) + dependencia de T-001
- **Acción humana Lucy**: ninguna

### [P1] T-008 — Falta `vercel.json` con framework, regions y headers explícitos
- **Categoría**: gap
- **Evidencia**: `ls /home/ansible/workspaces/lucams_shop/vercel.json` → no existe. Local Makefile (`/home/ansible/workspaces/lucams-shop-local/Makefile:9`) referencia `vercel.json` como fuente para `vercel-parity`.
- **Impacto**: deploys dependen de defaults Vercel + auto-detect. Sin pinning: `regions`, `framework`, `installCommand` (necesario para monorepo pnpm), `crons` futuro (cuando se autorice), `headers` (security headers SSR-only no cubiertos por `proxy.ts`).
- **Recomendación**: crear `vercel.json` mínimo con `{ "framework": "nextjs", "installCommand": "pnpm install --frozen-lockfile && pnpm --filter @lucams/db db:generate", "buildCommand": "pnpm --filter web build", "regions": ["iad1"] }`. Documentar en ADR-XXX por qué `iad1` (latencia vs Bogotá).
- **Horas estimadas**: 1
- **Acción humana Lucy**: confirmar región preferida (iad1 East US default; gru1 Brasil más cerca de CO con latencia ~50ms vs ~70ms).

### [P2] T-009 — Circuit breaker solo en Resend; falta en Wompi/Aveonline/Venndelo
- **Categoría**: improvement
- **Evidencia**: `grep -rln circuit` → solo `lib/resend.ts:37` tiene breaker. `lib/wompi.ts:149 getTransaction`, `features/shipping/aveonline.ts`, `features/shipping/venndelo.ts` usan `fetch + AbortSignal.timeout` pero sin breaker → si Wompi/Aveonline cae, cada request espera timeout (10s) → cascada que degrada todo el checkout.
- **Impacto**: durante incidente de partner, p95 se degrada y errors visibles al cliente.
- **Recomendación**: extraer breaker de `lib/resend.ts` a `lib/circuit-breaker.ts` (genérico por servicio), wrappear `getTransaction(id)` Wompi, `cotizarEnvio`/`generarGuia2` Aveonline, Venndelo client.
- **Horas estimadas**: 4
- **Acción humana Lucy**: ninguna

### [P2] T-010 — No hay tests para webhooks signature verification
- **Categoría**: gap
- **Evidencia**: `lib/wompi.ts:185 verifyWebhookSignature` es la línea de defensa contra impersonation. No tiene test ni con webhook grabado válido ni con tampering (checksum modificado, timestamp viejo, properties faltantes).
- **Impacto**: cualquier refactor (ej. cambio en concat order, encoding) rompe webhook prod en silencio hasta primer evento.
- **Recomendación**: dejar en repo dos fixtures (`fixtures/wompi-webhook-valid.json`, `fixtures/wompi-webhook-tampered.json`) y un test que valide `valid=true` y `valid=false` respectivamente. Idem para `app/api/webhooks/aveonline/route.ts`.
- **Horas estimadas**: 3 (incluye capturar fixture real)
- **Acción humana Lucy**: ninguna (puedo usar fixture sintético firmado con el secret de test)

### [P2] T-011 — Logger sin niveles configurables por módulo ni sampling
- **Categoría**: improvement
- **Evidencia**: `lib/logger.ts:96-98` define `minLevel` global por `LOG_LEVEL` env. No hay child loggers ni sampling (Pino lo tenía pero se removió por bug Turbopack).
- **Impacto**: módulos ruidosos (catalog, cms cache) inundan logs prod. Sin sampling, costos de log ingest crecen lineal con tráfico.
- **Recomendación**: agregar `logger.child({ module: "checkout" })` con override level por módulo desde env `LOG_LEVEL_CHECKOUT=warn`. Sampling se puede dejar para post-launch si Vercel logs queda saturado.
- **Horas estimadas**: 3
- **Acción humana Lucy**: ninguna

### [P2] T-012 — `proxy.ts` carga Supabase auth en CADA request (incluye assets en matcher)
- **Categoría**: improvement
- **Evidencia**: `proxy.ts:228-232` matcher excluye `/_next/static`, `/_next/image`, favicon, fonts e images por extensión, pero NO excluye `/api/health`, `/api/vitals`, `/api/cms/blocks` que son hot paths que no necesitan refresh de sesión.
- **Impacto**: cada `sendBeacon` a `/api/vitals` o request a `/api/health` paga el costo de `createServerClient + getUser()` → latencia añadida y conexiones DB innecesarias.
- **Recomendación**: separar el bloque de Supabase auth refresh en helper y skipearlo para `/api/health`, `/api/vitals`, `/api/cms/blocks` (rutas públicas sin sesión).
- **Horas estimadas**: 2
- **Acción humana Lucy**: ninguna

### [P2] T-013 — Falta Dependabot/Renovate y baseline de gitleaks
- **Categoría**: gap
- **Evidencia**: no hay `.github/dependabot.yml` ni `renovate.json`. `gitleaks-action@v2` corre sin `--baseline-path` que evite false-positive recurrente de fixtures históricos.
- **Impacto**: deps con CVE quedan obsoletas hasta auditoría manual. Gitleaks puede empezar a fallar PRs por commits viejos cuando se agreguen reglas.
- **Recomendación**: agregar `.github/dependabot.yml` con grupos `next-ecosystem`, `prisma`, `radix-ui`, `dev-deps`, schedule weekly. Generar baseline gitleaks con `gitleaks detect --report-path .gitleaks-baseline.json` y commitear.
- **Horas estimadas**: 1.5
- **Acción humana Lucy**: ninguna

### [P3] T-014 — `cookie-consent.test.ts` y `rate-limit-keys.test.ts` no se nombran como ejemplo en TESTING.md
- **Categoría**: docs-drift
- **Evidencia**: TESTING.md menciona `lib/redirects.ts`, `lib/retry.ts`, `lib/circuit-breaker.ts`, `lib/idempotency.ts` como targets unit. Los tests reales (cookie-consent, rate-limit-keys) no figuran.
- **Impacto**: doc no refleja qué hay vs qué falta. Confunde planificación.
- **Recomendación**: en TESTING.md agregar bloque "Tests ya implementados" antes de la lista deseada.
- **Horas estimadas**: 0.25
- **Acción humana Lucy**: ninguna

### [P3] T-015 — Smoke spec usa selectores frágiles (heading level 1)
- **Categoría**: tech-debt
- **Evidencia**: `tests/e2e/smoke.spec.ts:31,42` usa `page.getByRole("heading", { level: 1 })` que rompe si el CMS llega a un H2 por edición visual.
- **Impacto**: false-positive en CI cuando Lucy edita /ayuda o /legal/privacidad.
- **Recomendación**: usar `getByRole("heading", { name: /text esperable/i })` o `data-testid="page-h1"`.
- **Horas estimadas**: 0.5
- **Acción humana Lucy**: ninguna

### [P3] T-016 — No hay Makefile target ni script de smoke post-deploy
- **Categoría**: gap
- **Evidencia**: TESTING.md §"Smoke tests post-deploy" (línea ~496-540) prescribe set mínimo + rollback automático. No hay target `make smoke-prod` ni workflow `on: deployment_status`.
- **Impacto**: post-deploy regresions invisibles hasta tráfico real las dispare.
- **Recomendación**: agregar workflow `.github/workflows/post-deploy-smoke.yml` que dispare con `deployment_status == 'success'`, corra `PLAYWRIGHT_BASE_URL=<deployment-url> pnpm test:e2e --grep @smoke`, y notifique a WhatsApp/email Lucy en fail.
- **Horas estimadas**: 2
- **Acción humana Lucy**: ninguna (sólo confirmar canal de notificación)

## Resumen final

La infra cross-cutting (logger estructurado con redaction, request-id propagado, errores RFC 7807, audit log, web vitals RUM end-to-end, error boundaries con branding, helpers Wompi/Resend/Turnstile bien construidos) está sólida y consciente — uno de los puntos más fuertes del repo. El CI mínimo de calidad existe y funciona. El gap crítico está en testing: la pirámide está escrita en `TESTING.md` pero con 4 archivos de test reales para un e-commerce que ya tiene saga POST-PAID, Wompi webhook y guías Aveonline reales operando, la red de seguridad para Fase 7 es inexistente. Antes de lanzar productivo hay 3 P0 indispensables (T-001 cobertura crítica, T-002 RLS tests, T-003 idempotency helper) y 1 P0/P1 de DevOps (T-004 CI debe correr smoke E2E + audit-deps). El drift documental (T-005, T-006) es chico de horas pero grande de costo cognitivo para futuras sesiones.