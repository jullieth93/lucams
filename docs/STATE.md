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

**Fase 0a completada (2026-05-09) — versión productive readiness.** Tras dos auditorías (coherencia + productive readiness, 21 + 43 hallazgos), la documentación cubre patrones cross-cutting, compliance colombiano (Ley 1581, Ley 1480, DIAN), observabilidad cuantitativa, DevOps maduro y testing estratégico. **Sin código todavía.** Esperando autorización del usuario para arrancar Fase 0b (cuentas externas en tier Free).

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

**Fase 0b — cuentas externas en Free.** Cuando el usuario autorice, se guía paso a paso para crear:

1. Supabase (proyecto Free, región `sa-east-1` o más cercana a Colombia).
2. Vercel (Hobby, conectado al repo de GitHub).
3. Resend (Free, sin dominio aún).
4. Cloudflare (Free, sin dominio aún) — habilitar Turnstile.
5. Wompi (sandbox, gestión en curso del comercio).
6. Venndelo (sandbox).
7. Anthropic (API key con presupuesto mensual).
8. GitHub (repo creado y conectado a Vercel).

**Bloqueadores antes de Fase 0b:** ninguno técnico. Espera autorización explícita del usuario.

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
