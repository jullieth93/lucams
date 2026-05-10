# Estado del proyecto — Lucams_shop

> **Cómo leer este archivo.** Es el índice narrativo del proyecto. La fuente de verdad de cada dominio sigue siendo el `.md` correspondiente (ROADMAP, ARCHITECTURE, DECISIONS, etc.) — STATE.md te dice **dónde estás parado** y **qué pasó en la última sesión** sin tener que leer todo.
>
> **Cómo se mantiene.** Al cerrar cualquier sesión con cambios, Claude Code actualiza:
> 1. El bloque **Resumen actual** (un párrafo, siempre arriba).
> 2. La sección **Última sesión** (qué se hizo en esta iteración).
> 3. El bloque **Próximo paso** (qué viene cuando se reanude).
> 4. Una entrada nueva en **Bitácora** (append-only, más reciente arriba).

---

## Resumen actual

**Fase 0a + 0b cerradas. Fase 1 EN CURSO (scaffolding inicial + paridad Vercel completados, 2026-05-09).** Monorepo pnpm + Next.js **16.2.6** + React 19.2.4 + Tailwind v4 + shadcn/ui (`radix-nova`) + Turbopack default. Tokens Lucams (paleta brand) y Fredoka + Inter aplicados. Home placeholder HTTP 200 local. Build de producción limpio (4 páginas estáticas, 0 warnings). `vercel.json` declarativo en root para que Vercel buildee correctamente desde monorepo. **Makefile orquestador** en `/tmp/lucams-shop-local/` con comandos para stack (`make up/down/status/logs`), quality gates (`make build/typecheck/lint/format`) y validación local↔cloud (`make env-check/health/vercel-parity`). **Acciones pendientes de la operadora:** (1) reemplazar `[YOUR-PASSWORD]` literal en `DATABASE_URL` y `DIRECT_URL` de `.env.local` (detectado por `make env-check`); (2) sincronizar las 11 env vars en Vercel Dashboard antes del próximo deploy con código que use Supabase. **Próximo bloque de Fase 1:** RLS policies, Auth Supabase, patrones cross-cutting (RFC 7807, capa de servicio, idempotency, request ID, logger pino con redact).

---

## Última sesión — 2026-05-09 (segunda iteración: productive readiness)

**Origen:** el usuario reframea — "lo de la primera sesión es el piso, no el techo. Para productivo falta más". Lanza segunda auditoría completa.

**Hechos:**

1. **Verificaciones contra fuentes oficiales** (mandato #9):
   - DIAN facturación electrónica: Resolución 165/2023, sanciones 1% ingresos / 950 UVT ([DIAN — Obligados](https://www.dian.gov.co/impuestos/sociedades/Paginas/obligadosfacturar.aspx)).
   - Ley 1480 art. 47: 5 días hábiles retracto, 15 días reembolso, **exclusión por personalización** ([Función Pública](https://www.funcionpublica.gov.co/eva/gestornormativo/norma.php?i=44306)).
   - RFC 7807 Problem Details: schema y campos verificados ([RFC 7807](https://datatracker.ietf.org/doc/html/rfc7807)).
   - STRIDE: definiciones textuales de las 6 categorías ([Microsoft Learn](https://learn.microsoft.com/en-us/azure/security/develop/threat-modeling-tool-threats)).
   - Tailwind v4 `@theme` directive: sintaxis confirmada ([tailwindcss.com/docs/theme](https://tailwindcss.com/docs/theme)).

2. **Auditoría productive readiness:** 43 hallazgos clasificados en 9 bloqueantes + 21 importantes + 13 nice-to-have. Documento en [`docs/audits/2026-05-09-productive-readiness-audit.md`](audits/2026-05-09-productive-readiness-audit.md).

3. **4 documentos nuevos creados:**
   - **[`docs/CONVENTIONS.md`](CONVENTIONS.md)** — patrones FE+BE+DB, naming, error format RFC 7807, capa de servicio, **saga pattern**, idempotency keys, migration strategy expand-then-contract, indexing, soft delete + audit fields, FK cascade, retention, resiliencia (timeouts/retry/circuit breaker), logging con request ID.
   - **[`docs/OBSERVABILITY.md`](OBSERVABILITY.md)** — SLOs cuantitativos, SLIs, error budgets, dashboards, alertas accionables, postmortem process, métricas custom.
   - **[`docs/COMPLIANCE.md`](COMPLIANCE.md)** — Ley 1581 con tabla `Consent` versionada, Ley 1480 (retracto art. 47 con `RetractRequest` schema, garantía art. 7-15, reversión pago art. 51), DIAN facturación electrónica con `InvoiceProvider` interface, IVA y retenciones, subprocesadores, calendario de cumplimiento.
   - **[`docs/TESTING.md`](TESTING.md)** — pirámide, mock vs real, tests RLS automatizados, E2E con Playwright, visual regression, accesibilidad automatizada, performance/load (k6), smoke tests post-deploy, coverage targets.

4. **5 documentos expandidos:**
   - **`SECURITY.md`** — STRIDE aplicado a 4 flujos críticos (registro/login, checkout, estudio, jobs), IRP con runbooks por escenario (4 IRPs concretos), clasificación de datos formal, cookie consent banner con código de implementación.
   - **`ARCHITECTURE.md`** — sección "Patrones cross-cutting" referenciando CONVENTIONS + nota sobre audit fields auto-aplicados.
   - **`INTEGRATIONS.md`** — Sección 7 DIAN provider (`InvoiceProvider` interface + flujo emisión + notas crédito) + Sección 8 Resiliencia compartida (tabla timeouts/retries/circuit breakers por integración) + Sección 9 Background jobs renumerada.
   - **`OPERATIONS.md`** — DevOps strategy (branching trunk-based, releases CD + canary, environments, feature flags con comparación de proveedores) + DR (RPO/RTO + procedimiento + drills cuatrimestrales con calendario).
   - **`ROADMAP.md`** — tareas distribuidas en cada fase con subsecciones "productive readiness audit": Fase 1 (patrones cross-cutting + observabilidad), Fase 2 (estados UI + visual regression), Fase 3 (security upload), Fase 4 (saga + retracto + cookie banner + idempotency), Fase 5 (feature flags + email lifecycle), Fase 6 (audit log admin + MFA + garantía), Fase 7 (DIAN + threat model + pen test + DR drill + IRP).

5. **Decisiones nuevas a tomar (ADRs futuros):**
   - ADR-025: proveedor DIAN (Alegra / Siigo / Facture) — antes de Fase 7.
   - ADR-026: proveedor de feature flags (sugerencia: GrowthBook cloud Free) — antes de Fase 5.
   - ADR-027: necesidad de staging environment — re-evaluar post-lanzamiento.

---

## Última sesión — 2026-05-09 (primera iteración: coherencia + endurecimiento productivo)

**Alcance:** carga de contexto inicial + auditoría de coherencia + endurecimiento productivo de toda la documentación.

**Hechos:**
1. **Auditoría de coherencia** completa de los 7 documentos del proyecto. 21 hallazgos detectados, registrados en [`docs/audits/2026-05-09-coherence-audit.md`](audits/2026-05-09-coherence-audit.md). H5 retirado tras verificación contra Wompi docs.
2. **Verificación contra fuentes oficiales** de las afirmaciones técnicas críticas:
   - Wompi: `2.65% + $700 + IVA` confirmado ([wompi.com/es/co/planes-tarifas](https://wompi.com/es/co/planes-tarifas/)).
   - Tarjeta sandbox `4242 4242 4242 4242` confirmada ([docs.wompi.co](https://docs.wompi.co/en/docs/colombia/datos-de-prueba-en-sandbox/)).
   - shadcn/ui soporta Tailwind v4 + React 19 en producción ([ui.shadcn.com/docs/tailwind-v4](https://ui.shadcn.com/docs/tailwind-v4)).
   - Vercel KV deprecado desde dic-2024, migrado a Upstash ([vercel.com/docs/redis](https://vercel.com/docs/redis)).
   - Upstash Free: 500K cmd/mes + 256 MB ([upstash.com/pricing](https://upstash.com/pricing)).
   - Supabase Queues = pgmq, durable, exactly-once ([supabase.com/docs/guides/queues](https://supabase.com/docs/guides/queues)).
3. **6 decisiones nuevas cerradas** (ADRs 014–019):
   - **ADR-014** — Reserva de stock al `PENDING_PAYMENT` con TTL 15 min + descuento al `PAID`.
   - **ADR-015** — Tailwind v4 + React 19 (alineado con default oficial de shadcn/ui).
   - **ADR-016** — Rate-limit y cache en Postgres + `pg_cron`, sin proveedor externo. Migrar solo si p95 > 50 ms.
   - **ADR-017** — Background jobs en Supabase Queues (`pgmq`) + `pg_cron`, no Vercel Cron.
   - **ADR-018** — Mandato "argumentación obligatoria, sin suposiciones".
   - **ADR-019** — Traceability inter-sesión vía `docs/STATE.md` y `docs/audits/`.
4. **Documentos creados:**
   - `docs/STATE.md` (este archivo).
   - `docs/SECURITY.md` (fuente única de seguridad: RLS, CORS, headers, rate limit, RBAC, validación, secrets, CSP, TTLs, file upload, audit logs).
   - `docs/audits/2026-05-09-coherence-audit.md` (auditoría inicial).
   - `.gitignore` exhaustivo en raíz del repo.
   - `.env.example` con todas las variables placeholder.
5. **Documentos actualizados:**
   - `CLAUDE.md` — estado, monorepo en mandato #3, mandatos #9 (argumentación), #10 (VM dedicada), #11 (background jobs en Supabase), #12 (seguridad por defecto). Lectura mínima incluye STATE.md y SECURITY.md.
   - `ROADMAP.md` — Fase 0a marcada completa con fecha; Fase 0b/1 actualizadas (sin Upstash, con `pgmq` + `pg_cron`, healthchecks, Turnstile).
   - `PLAN.md` — comisión Wompi completa, política stock, dedupe pendientes, sustitución Vercel KV/Upstash, sección background jobs.
   - `ARCHITECTURE.md` — snippet Tailwind v4 CSS-first, sección Storage buckets, sección Extensiones Postgres, workers consumidores de pgmq.
   - `INTEGRATIONS.md` — `VENNDELO_ORIGIN_CITY` declarado, sección Background jobs (pgmq+pg_cron), referencias Vercel KV eliminadas.
   - `OPERATIONS.md` — comisión Wompi completa, política stock, runbook con consumers pgmq, vars Turnstile, sección Entorno de desarrollo (VM dedicada símil Vercel local).
   - `BRANDING.md` — snippet Tailwind v4, dedupe pendientes.
   - `README.md` — monorepo mencionado en stack.
   - `DECISIONS.md` — 6 ADRs nuevos (014–019).

---

## Próximo paso

**Fase 1 — Base sólida (core técnico).** Cuando la operadora autorice, se inicia:

1. Inicializar monorepo con `pnpm-workspace.yaml`.
2. `pnpm create next-app@latest apps/web` (Next.js 15 + TS + **Tailwind v4** + React 19 + App Router).
3. Instalar shadcn/ui (style `new-york`, `tw-animate-css`, `sonner` per ADR-015).
4. `packages/db` con Prisma + schema completo. SQL migrations habilitan `pgmq`, `pg_cron`, `pgcrypto`, `pg_stat_statements` (ya disponibles en proyecto Supabase).
5. Migración inicial aplicada en Supabase (la integración GitHub→Supabase ya está activa).
6. Clientes Supabase (`browser.ts`, `server.ts`, `service.ts`) usando **publishable + secret keys** (no anon/service_role legacy).
7. RLS policies + tests automáticos con cliente impostor (criterio bloqueante de aceptación).
8. Auth Supabase (registro, login, recuperación de password).
9. Layout base con tokens Tailwind v4 (Fredoka + Inter, paleta de `BRANDING.md`).
10. CI en GitHub Actions: typecheck + lint + tests + RLS + secret scanning (gitleaks) + dep audit.
11. Healthchecks `/api/health/*`.
12. Patrones cross-cutting de `CONVENTIONS.md`: RFC 7807 errors, capa de servicio, idempotency keys, request ID con AsyncLocalStorage, logger `pino` con redact PII, `fetchWithTimeout`/`withRetry`/`CircuitBreaker`, `safeRedirectTarget`.
13. Crear cuenta Cloudflare + habilitar Turnstile (en simultáneo con el signup form).

**Bloqueadores antes de Fase 1:** ninguno técnico. Espera autorización explícita de la operadora.

**Cuentas creadas just-in-time durante fases posteriores:**
- Cloudflare (DNS + Turnstile + R2) → durante Fase 1 (Turnstile en signup) y Fase 7 (DNS + R2 al lanzar productivo).
- Anthropic API key → durante Fase 3 (Estudio de IA con Claude).
- Venndelo sandbox → durante Fase 4 (checkout con cotización).
- Wompi sandbox → durante Fase 4 (en gestión externa de la operadora).

**Cola de verificación pendiente** (mandato #9):

✅ **Verificadas el 2026-05-09** (registradas con cita en `OPERATIONS.md § Verificación de tiers Free`):
- Vercel Hobby: 60s function timeout · 100GB bandwidth · 1M invocations · 4 CPU-hrs · 1h log retention · **ToS prohíbe uso comercial** (cita textual).
- Supabase Free: 500 MB DB · 1 GB storage · 50k MAU · 500k Edge Function invocations · 5 GB egress · pausa a 1 semana · 2 proyectos máx.
- Resend Free: 3k/mes · 100/día · 1 dominio custom · 30 días retención.
- Anthropic: Sonnet 4.6 = $3/MTok input + $15/MTok output, 1M context, 64k max output.
- Cloudflare R2 Free: 10 GB · 1M Class A ops · 10M Class B ops · egress gratis.
- Cloudflare Turnstile Free: 1M siteverify/mes/sitio · 20 widgets/cuenta.

✅ **Cerrado el 2026-05-09 (sesión 7):**
- `pgmq`, `pg_cron`, `pgcrypto`, `pg_stat_statements` habilitados sin error en proyecto Supabase Free `zxkucphbsfygakgxcnik`. Validan ADR-016 (rate-limit/cache en Postgres + pg_cron) y ADR-017 (background jobs en pgmq).

🟡 **Pendiente todavía (consultas dirigidas al crear cuentas o tomar ADRs):**
- TTL configurable de access/refresh tokens en Supabase Auth Free → `supabase.com/docs/guides/auth/sessions` (revisar al implementar Auth en Fase 1).
- Política de password configurable en plan Free → `supabase.com/docs/guides/auth/password-security` (Fase 1).
- Coordinadora 1.100+ destinos vía Venndelo → confirmar al crear cuenta sandbox Venndelo (Fase 0b).
- Costos y APIs de Alegra/Siigo/Facture → para ADR-025 (antes de Fase 7).
- RNBD ante SIC: ¿obligatorio para nuestro volumen? → consulta legal cuando contratemos abogado (ADR-020, antes de Fase 7).
- UVT 2026 valor exacto en COP (impacta tope sanciones DIAN) → `dian.gov.co` cuando se redacten T&C.

---

## Bitácora (append-only, más reciente arriba)

### 2026-05-09 — Compatibilidad local↔Vercel + Makefile orquestador (sesión 10)

**Operadora pidió:** (1) validar que el entorno local sea compatible con Vercel dado que la VM es ambiente de desarrollo; (2) crear un `Makefile` + sistema de logs en `/tmp/lucams-shop-local/` siguiendo el patrón de `/tmp/commerce-ops-local/`.

**Hechos:**

1. **Vercel CLI 53.3.1 instalado** globalmente (`sudo npm install -g vercel`). No se hizo `vercel link` interactivo — la operadora puede hacerlo después si quiere `vercel pull`. Para validación documental no fue necesario.

2. **Hallazgo crítico de paridad:** Vercel está deployando desde la raíz del repo (donde el `package.json` es del workspace, no de Next.js) → todos los deploys post-push devuelven HTTP 404 con `x-vercel-error: NOT_FOUND`. **Solución implementada:** `vercel.json` en la raíz del repo declarando explícitamente:
   - `framework: "nextjs"` (forzar)
   - `buildCommand: "pnpm --filter web build"`
   - `installCommand: "pnpm install --frozen-lockfile"`
   - `outputDirectory: "apps/web/.next"`
   - `ignoreCommand` que skipea deploy cuando solo cambian docs

3. **Makefile creado en `/tmp/lucams-shop-local/Makefile`** con comandos espejo del runtime de Vercel:
   - **Stack:** `make up`, `down`, `restart`, `status`, `logs SERVICE=web`, `clean`.
   - **Quality gates:** `make build`, `typecheck`, `lint`, `format`.
   - **Validación local↔cloud:** `make env-check` (lista vars sin exponer valores, detecta placeholders), `make health` (healthchecks Supabase Auth + REST + web local), `make vercel-parity` (reproduce el build EXACTO de Vercel).
   - Patrón heredado del otro proyecto: `nohup` + PID files + log redirection + healthcheck por `kill -0`.
   - Make instalado en la VM con `sudo dnf install -y make`.

4. **Smoke test del Makefile completo verde:** `up`, `status` (RUNNING + PID), `health` (3/3 checks 200), `down`, `vercel-parity` (build limpio, BUILD_ID generado), `env-check` (detecta correctamente vars cargadas vs placeholders).

5. **Hallazgo CRÍTICO descubierto por `make env-check`:** en `.env.local` los campos `DATABASE_URL` y `DIRECT_URL` **siguen con `[YOUR-PASSWORD]` literal** — la operadora copió las connection strings de Supabase Dashboard pero no reemplazó el placeholder con la database password real. **No bloquea hoy** (el código actual no toca DB) **pero bloqueará Fase 1 schema** cuando Prisma intente conectar. **Acción de la operadora**: reemplazar `[YOUR-PASSWORD]` en ambas líneas de `.env.local` con la password generada al crear el proyecto Supabase.

6. **Gap pendiente para Vercel** (no bloqueante para deploy actual del Hello World, sí para Fase 1 con Supabase):
   - Las env vars del proyecto NO están en Vercel UI todavía. Antes del próximo deploy con código que use Supabase, la operadora debe ir a Vercel Dashboard → Settings → Environment Variables y copiar las 11 variables de `.env.local` para los 3 entornos (Production, Preview, Development), marcando como Encrypted las que son secretas.

**Documentación añadida:**
- `OPERATIONS.md` § "Compatibilidad local ↔ Vercel" — matriz de paridad + lista de env vars a sincronizar + descripción del `vercel.json`.
- `OPERATIONS.md` § "Entorno local con Make (símil-Vercel)" — comandos disponibles, convenciones, cuándo usarlo.

### 2026-05-09 — Fase 1 scaffolding inicial (sesión 9)

**Modo autonomía:** la operadora pidió que actuara con más autonomía dentro de los permisos `Bash(*)` de la VM dedicada (mandato #10). Procedí con bloques digeribles + commits frecuentes + pausa solo en decisiones destructivas.

**Hechos:**
- **Tooling instalado:** Node.js 22.22.2 (NodeSource RPM en Oracle Linux 9.7) + pnpm 11.0.9 (vía corepack) + npm 10.9.7.
- **Monorepo inicializado:** `pnpm-workspace.yaml` con `apps/*` y `packages/*`. `package.json` root con scripts compartidos (`dev`, `build`, `lint`, `typecheck`, `format`). `engines` y `packageManager` declarados.
- **`apps/web` creado:** `pnpm create next-app@latest --typescript --tailwind --eslint --app --no-src-dir --import-alias "@/*" --use-pnpm --turbopack`. Llegó **Next.js 16.2.6** (no 15.x como decían los docs originales — actualizamos).
- **Hallazgo crítico:** Next.js 16 trae breaking changes vs 15. La advertencia oficial `apps/web/AGENTS.md` lo señala explícitamente: *"This is NOT the Next.js you know."* Leí `node_modules/next/dist/docs/01-app/02-guides/upgrading/version-16.md` y documenté los cambios que afectan nuestra arquitectura (saga, middleware, async APIs, themeColor, revalidateTag, images config) en **ADR-024**.
- **shadcn/ui v4 instalado:** `pnpm dlx shadcn@latest init --defaults --no-monorepo --base radix`. Style `radix-nova` (la evolución del antiguo "new-york" — actualizamos ADR-021 para reflejar el nombre real). Dependencias: `class-variance-authority`, `clsx`, `lucide-react`, `radix-ui`, `tailwind-merge`, `tw-animate-css`.
- **Branding aplicado en código:**
  - `lib/utils.ts` con `cn()` helper.
  - `app/globals.css` reemplazado: `@theme inline` con paleta brand Lucams (morado/turquesa/coral/rosa/amarillo/cream) + tokens semánticos shadcn mapeados a la paleta + `--font-display: Fredoka` y `--font-body: Inter` + radii kawaii (12px) + estilos base con `prefers-reduced-motion`.
  - `app/layout.tsx`: `lang="es-CO"`, fuentes vía `next/font/google` con `display: swap`, metadata + viewport export separados (Next 16 breaking change), título y descripción Lucams.
  - `app/page.tsx`: home placeholder con mascota mapache 🦝, paleta brand visible, propuesta de valor, link a Instagram. Reemplaza la default Next welcome.
  - Assets default removidos (`next.svg`, `vercel.svg`, etc.).
- **Quality gates pasando:**
  - Typecheck: ✅ sin errores.
  - Lint (ESLint flat config): ✅ sin errores.
  - Build de producción: ✅ 4.6s con Turbopack, 4 páginas estáticas pre-renderizadas, **sin warnings** tras mover `themeColor` a `viewport` export.
  - Dev server: arranca en ~500ms con Turbopack default.
- **Prettier:** instalado en root con `prettier-plugin-tailwindcss`. `.prettierrc.json` y `.prettierignore` configurados. Scripts `format` y `format:check` ya estaban en root `package.json`.
- **pnpm build approvals:** `sharp` (next/image), `unrs-resolver` (tailwind/eslint), `msw` (testing) aprobados explícitamente vía `pnpm-workspace.yaml` `allowBuilds`.

**Documentación actualizada:**
- ADR-024 nuevo en `DECISIONS.md` documentando Next.js 16 + breaking changes que adoptamos.
- ARCHITECTURE.md: tabla de versiones actualizada (Next.js 15.x → 16.x).
- CLAUDE.md mandato #3: stack actualizado con Next.js 16 + style `radix-nova` + advertencia sobre breaking changes.

**Lo que NO hicimos en este bloque (Fase 1 continúa):**
- Prisma + `packages/db` schema (siguiente).
- RLS policies + tests automáticos.
- Auth Supabase (registro, login, recuperación).
- Patrones cross-cutting (`lib/errors.ts`, `lib/rate-limit.ts`, `lib/cache.ts`, `lib/queue.ts`, `lib/logger.ts`, `lib/idempotency.ts`, `lib/circuit-breaker.ts`, etc. per CONVENTIONS.md).
- Healthchecks `/api/health/*`.
- Header + Footer + WhatsApp FAB.
- CI GitHub Actions (typecheck + lint + tests + secret scanning).
- Cloudflare + Turnstile (cuenta a crear cuando lleguemos a signup form).

### 2026-05-09 — Cierre Fase 0b con re-scope (sesión 8)

**Decisión de la operadora:** cerrar Fase 0b con las 4 cuentas críticas (GitHub, Supabase, Vercel, Resend) y diferir Cloudflare/Anthropic/Venndelo a sus fases respectivas. Razón pragmática: ninguna de las 4 postergadas bloquea Fase 1, y mantener cuentas "frías" no usadas suma surface area sin beneficio.

**Lo creado y validado en esta tanda:**
- **Vercel Hobby** (`lucams-shop.vercel.app`): conectado a GitHub `jullieth93/lucams`, primer deploy exitoso con HTTP 404 esperado (no hay código aún), webhook GitHub→Vercel funcionando.
- **Resend Free**: API key con scope "Sending access" (least privilege), validada con `restricted_api_key` error code (confirma key válida + scoped). Dominio default `resend.dev`.

**Incidente de seguridad #2 durante esta tanda:** al diagnosticar un 401 de Resend (que era esperado por el scope, no por key inválida), Claude usó `cat -A .env.local` con regex de redacción `[A-Za-z0-9]+` que NO incluía underscore. La key real quedó parcialmente visible en transcript. Resuelto: rotación + revocación + actualización de memoria con anti-patrones específicos (no usar `cat`, no combinar prefix+suffix, no redacciones parciales).

**Documentación actualizada:**
- `ROADMAP.md` Fase 0b marcada 🟢 con re-scope explícito documentado.
- `STATE.md` resumen actual y próximo paso ahora apuntan a Fase 1.
- `feedback_never_read_env_files.md` ampliada con sección "Anti-patrones específicos" (cat, regex incompletas, prefix+suffix combinados).

### 2026-05-09 — Setup proyecto Supabase + extensiones + connection test (sesión 7)

**Hechos:**
- Proyecto Supabase creado: `zxkucphbsfygakgxcnik.supabase.co`, region `sa-east-1` (São Paulo), Postgres standard (NO OrioleDB Alpha), GitHub linked a `jullieth93/lucams`, Auto-RLS ON, Auto-expose tables OFF, Data API ON.
- Las 5 vars de Supabase copiadas a `.env.local` (ignorado por git): URL + Publishable + Secret + DATABASE_URL pooled (6543) + DIRECT_URL direct (5432).
- 4 extensiones habilitadas vía dashboard: `pgmq`, `pg_cron`, `pgcrypto`, `pg_stat_statements`. **Cierra el último pendiente práctico de la cola de verificación.** Confirma que ADR-016 y ADR-017 son ejecutables en plan Free.
- Connection test ejecutado sin exponer credenciales (`set -a; source .env.local; set +a; curl`). Resultados:
  - Auth health, Auth settings, Storage list: HTTP 200 con publishable key.
  - REST root con secret key: HTTP 200.
  - **Hallazgo nuevo:** REST root `/rest/v1/` con publishable da HTTP 401 con mensaje *"Only secret API keys can be used for this endpoint"* — comportamiento nuevo del sistema publishable/secret. La introspección OpenAPI del schema ahora requiere secret. Es **mejor postura de seguridad** (la publishable no puede leak schema completo). Documentado en `INTEGRATIONS.md` § Supabase.

**Bug en `.env.example` corregido:** `EMAIL_FROM=Lucams_shop <onboarding@resend.dev>` rompía bash `source` por los `<`/`>`. Corregido a `EMAIL_FROM="Lucams_shop <onboarding@resend.dev>"` (con quotes) en `.env.example` y `.env.local`.

**Var rename:** `DIRECT_DATABASE_URL` → `DIRECT_URL` (convención oficial Supabase+Prisma per [supabase.com/docs/guides/database/prisma](https://supabase.com/docs/guides/database/prisma)). Aplicado a `.env.example`, `.env.local` (vía `sed`, sin leer contenido para no exponer secretos), `docs/OPERATIONS.md`, `docs/INTEGRATIONS.md`, `docs/ARCHITECTURE.md`.

**⚠️ Incidente de seguridad — leak de secret key:**
- Mientras hacía un Edit a `.env.local`, la herramienta Edit exigió Read previo. Al hacer `Read .env.local`, la `SUPABASE_SECRET_KEY` real (`sb_secret_REDACTED`) entró a mi contexto y por lo tanto al transcript del chat.
- Severidad real: P0 según runbook IRP-001. Severidad práctica: baja (DB vacía, dev environment, no producción).
- Operadora decidió no rotar inmediatamente — queda como **deuda crítica obligatoria antes de cerrar la sesión**.
- Aprendizaje guardado en memory `feedback_never_read_env_files.md`: **nunca usar Read/Edit/Write sobre `.env*`**. Solo `sed` via Bash, que modifica in-place sin exponer contenido. Inspeccionar nombres de vars con `grep`/`cut`. Cargar valores en subshell con `set -a; source; set +a` para que vivan en el subprocess y no en mi contexto.

### 2026-05-09 — Migración a publishable/secret keys de Supabase (sesión 6)

**Hallazgo del operador (Lucy):** al copiar credenciales del dashboard Supabase a `.env.local`, observó que las API keys ya no se llaman `anon` y `service_role` sino **Publishable** y **Secret**.

**Verificación contra docs oficiales** ([supabase.com/docs/guides/api/api-keys](https://supabase.com/docs/guides/api/api-keys), [Supabase Discussion #29260](https://github.com/orgs/supabase/discussions/29260)):
- Las legacy `anon`/`service_role` (formato JWT) están siendo reemplazadas por `sb_publishable_*` y `sb_secret_*` (token strings con prefijo).
- Cita textual crítica: *"Projects restored from 1st November 2025 will no longer be restored with the legacy API keys. **New projects no longer have anon and service_role available for use.**"*
- Nuestro proyecto se creó hoy (2026-05-09) → solo tiene las nuevas keys.
- Mapeo de seguridad idéntico: publishable → rol Postgres `anon`, secret → rol Postgres `service_role`. Drop-in replacement.
- Ventaja del nuevo sistema: múltiples secret keys revocables (rotación sin downtime).

**Cambios aplicados:**
- `.env.example` y `.env.local`: `NEXT_PUBLIC_SUPABASE_ANON_KEY` → `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`; `SUPABASE_SERVICE_ROLE_KEY` → `SUPABASE_SECRET_KEY` (editado por el operador).
- `docs/OPERATIONS.md`: bloque env vars + política de rotación actualizada.
- `docs/SECURITY.md`: inventario de claves, runbook IRP-001 (con nuevo paso "revocar la key vieja explícitamente"), threat model, clasificación de datos.
- `docs/INTEGRATIONS.md`: nota explicativa al inicio de la sección Supabase con cita oficial; bloque env vars; snippets de `lib/supabase/{browser,server,service}.ts`.
- `docs/ARCHITECTURE.md`: comentarios en estructura de carpetas; sección RLS aclarando equivalencia publishable→`anon`, secret→`service_role`.
- `docs/PLAN.md`: 2 menciones puntuales en sección de seguridad y reglas.

**Decisión operativa:** Las menciones a "rol `anon`" y "rol `service_role`" en docs (cuando refieren al rol Postgres y no al nombre de la key) **se mantienen** — los roles no cambiaron, solo cambió el formato de las API keys que activan cada rol.

### 2026-05-09 — Verificaciones de tiers Free (sesión 5)

Cola de verificación pendiente cerrada para los 6 servicios externos críticos. Resultados documentados en `OPERATIONS.md § Verificación de tiers Free contra docs oficiales` con cita y URL por cada cifra.

**Hallazgo crítico:** Vercel Hobby ToS **prohíbe explícitamente uso comercial** — *"You shall only use the Services under a Hobby plan for your personal or non-commercial use."* Implica que el upgrade a Vercel Pro al primer pago real es **obligación contractual**, no preferencia de capacidad. Ya estaba planeado en Fase 7; queda confirmado como bloqueante.

**Resumen de cifras clave verificadas:**
- Vercel Hobby: 60s function timeout, 100 GB bandwidth, 1M invocations, 1h log retention, ToS no comercial.
- Supabase Free: 500 MB DB + 1 GB storage + 50k MAU + 500k Edge Function invocations + pausa a 1 semana + 2 proyectos máx.
- Resend Free: 3k/mes + 100/día + 1 dominio + 30 días retención.
- Anthropic Sonnet 4.6: $3 input / $15 output por MTok, 1M context, 64k max output. Costo estimado por sugerencia IA: ~$0.006 USD.
- Cloudflare R2 Free: 10 GB + 1M Class A + 10M Class B + **egress gratis**.
- Cloudflare Turnstile Free: 1M siteverify/mes/sitio + 20 widgets/cuenta.

**Único pendiente práctico:** confirmar `pgmq` y `pg_cron` disponibles en Supabase Free al crear el proyecto real (Fase 0b). Si estuvieran restringidos, replanteamos ADR-017.

### 2026-05-09 — Cierre de ADRs pendientes (sesión 4) + commit inicial

**ADRs cerrados con input del usuario:**
- **ADR-020 — Estrategia legal:** Lucams redacta plantillas con base en COMPLIANCE.md + abogado colombiano especialista en consumo/comercio digital revisa antes de Fase 7. Costo estimado ~$300–600 USD, 2–4 semanas. Bloqueante para lanzamiento.
- **ADR-021 — Tipografías:** **Fredoka** (display) + **Inter** (body). Ambas Google Fonts, vía `next/font/google` con `display: swap`. Definidas en `globals.css` `@theme` desde Fase 1.
- **ADR-026 — Feature flags:** tabla `FeatureFlag` en Postgres + helper `lib/feature-flags.ts` con cache 60s. Sin vendor externo (mismo principio que ADR-016). Criterios de migración futura a GrowthBook documentados.

**Commit hygiene:**
- Configurado `git config --local user.name "Lucy Hurtado" --local user.email "r.julliethhr@gmail.com"`.
- `.claude/` agregado a `.gitignore` (settings.json es personal, no se comparte).
- Branch `develop` se mantiene como rama de trabajo. Se renombra a `main` al crear el repo en GitHub (Fase 0b).
- **Commit `9a2c826`** ejecutado: 21 files, 8.854 inserciones, 8 borrados. Conventional Commits style. Sin Co-Authored-By per preferencia del operador.

**Estado de ADRs:**
- 22 ADRs cerrados (001 a 021, 026).
- 6 ADRs todavía abiertos: 022 (monitoreo errores, Fase 7), 023 (Redis trigger, futuro), 024 (OpenTelemetry, futuro), 025 (DIAN provider, antes de Fase 7), 027 (staging, post-lanzamiento), 028 (GrowthBook trigger, futuro).

### 2026-05-09 — Análisis competitivo + catálogo seed (sesión 3)

Reconocimiento real de magneticas.cl ejecutado: home + sitemap.xml + 6 categorías (packs fotos, recuerdos, calendarios, organización, publicitarios, juegos, decoración, coleccionables) + FAQ + política de devolución. Creados [`docs/CATALOG_SEED.md`](CATALOG_SEED.md) (37 productos paritarios + 6 productos NUEVOS exclusivos Lucams + 11 descartados con motivo legal/cultural) y [`docs/COMPETITIVE_ANALYSIS.md`](COMPETITIVE_ANALYSIS.md) (visión general del competidor, lo que copiamos, lo que mejoramos, riesgos legales detectados, gaps de UX). Categorías Lucams definidas (8): foto-imanes, recorditos-eventos, organizate, calendarios, pequenes, decora-espacio, regalos-corazon, mayorista. Política firme: **no replicar productos con marcas registradas no licenciadas** (Snoopy/Disney/Harry Potter/Coca-Cola/Spotify/Bad Bunny/Katy Perry/Hannah Montana — descartados con motivo en el doc).

### 2026-05-09 — Auditoría productive readiness (sesión 2)

Tras feedback del usuario reframeando "esto no es ambicioso, es el piso para productivo", se ejecutó segunda auditoría con 43 hallazgos. Creados 4 docs nuevos (CONVENTIONS, OBSERVABILITY, COMPLIANCE, TESTING). Expandidos 5 docs existentes (SECURITY con STRIDE+IRP, ARCHITECTURE referenciando convenciones, INTEGRATIONS con DIAN+resiliencia, OPERATIONS con DevOps+DR, ROADMAP con tareas por fase). Compliance colombiano operativizado (Ley 1581 con tabla `Consent`, Ley 1480 con `RetractRequest` y exclusión por personalización, DIAN con `InvoiceProvider` adapter). Threat model STRIDE por flujo crítico. IRP con 4 runbooks concretos. SLOs cuantitativos definidos. DR drills cuatrimestrales programados.

### 2026-05-09 — Endurecimiento productivo + auditoría inicial

**Sesión completa con tres bloques:**

1. **Carga de contexto** (lectura completa de los 7 docs + README + CLAUDE.md).
2. **Auditoría de coherencia** (21 hallazgos, 6 ADRs nuevos, fuentes verificadas con WebFetch).
3. **Endurecimiento productivo:**
   - Creación de `docs/SECURITY.md` con cobertura completa (autenticación, autorización, RLS, CORS, headers, rate limit, secrets, validación, RBAC, CSP, CSRF, TTLs, file upload, audit logs, PII/Habeas Data, dependency scanning, webhook security).
   - `.gitignore` y `.env.example` listos.
   - Sección "Entorno de desarrollo" en OPERATIONS.md con setup local símil-Vercel (logs, env, Supabase local, healthchecks).

**Salida:** documentación lista para arrancar Fase 0b sin sorpresas.

### 2026-05-09 — Creación inicial de la documentación (Fase 0a)

Antes de esta sesión, ya existían los 7 docs base + CLAUDE.md + README.md. Estado al inicio de la sesión actual: documentos completos pero con inconsistencias internas, referencias obsoletas a tecnologías y suposiciones técnicas sin verificar.
