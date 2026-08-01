# Auditoría integral pre-producción — 2026-08-01

> **Alcance:** código (no solo docs), los 3 ambientes (LOCAL podman / STG `lucams-stg` + previews Vercel / PRD Supabase + lucamsshop.com), integraciones (Wompi, Aveonline, Resend, Turnstile, WhatsApp, Gemini, Supabase Auth), UX/UI y accesibilidad, paridad de env vars, estrategia de tests. Método: 6 auditorías especializadas en paralelo (estáticas, verificadas contra código real) + ejecución real de suites, smokes HTTP contra STG/PRD y correcciones certificadas en LOCAL → STG → PRD.
> **Regla aplicada:** todo probado y certificado en ambientes de prueba antes de tocar PRD; los cambios en PRD fueron de contenido CMS (reversibles por historial de versiones) y re-agendamiento de crons (idempotente, sin cambio de comportamiento).

## Veredicto

**1 BLOQUEANTE y 1 ALTO de copy encontrados y CORREGIDOS** (la home prometía "Pagas en línea" estando en modo catálogo, y se prometía entrega total "en máx. 3 días" incluyendo la pierna del courier). **2 fallas reales de infraestructura STG encontradas y CORREGIDAS** (crons comidos por el SSO de Vercel; llaves Supabase del scope Preview erradas). El resto: postura de seguridad e integraciones sólida (verificado: RLS 57/57 tablas, webhooks firmados, fail-closed, defensa en capas), con una tanda de MEDIO/BAJO corregidos en la misma sesión.

## Hallazgos y estado

### BLOQUEANTE

| # | Hallazgo | Evidencia | Estado |
|---|---|---|---|
| B-1 | La home prometía **"Pagas en línea de forma segura"** en modo catálogo (sin pagos en línea en prod) — publicidad engañosa (Ley 1480 art. 23) en la página más visitada | `components/home/how-it-works.tsx:41` (fallback) + campo CMS `home.howitworks.step3.description` publicado en PRD | **CORREGIDO** en código (fallback gateado por `isCatalogMode()`) y en contenido (LOCAL/STG/PRD, script `update-delivery-copy-20260801.mjs`) |

### ALTO

| # | Hallazgo | Estado |
|---|---|---|
| A-1 | **Promesa de entrega total** "entregamos en máx. 3 días hábiles (2 fab + 1 entrega)" en 9 superficies (hero chip, how-it-works, PDP, FAQ, checkout, email confirmación, preview interno, seed) — incluye el tránsito del courier, que no controlamos; contradice la regla de certificación ("NUNCA fecha de entrega"). Decisión del usuario (2026-08-01): corregir a despacho + courier | **CORREGIDO** en las 9 superficies + contenido CMS en los 3 ambientes. Nueva narrativa: "despachamos en máx. {{fab}} días hábiles; la transportadora tarda ~{{entrega}} días según tu ciudad" |
| A-2 | **Crons de STG no ejecutaban** (el SSO de Vercel devolvía la página de login a los jobs pg_cron → `/api/health/crons` con `lastRunAt: null` en todos) | **CORREGIDO**: migración `00000000000023_pgcron_cron_vercel_bypass.sql` (header bypass opcional vía secreto Vault `cron_vercel_bypass`, solo ambientes con SSO) aplicada a LOCAL/STG/PRD + secreto creado en STG. Verificado: `net._http_response` devuelve JSON real desde 21:20 UTC; `alerts` al día en health/crons |
| A-3 | **`SUPABASE_SECRET_KEY`/`NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` del scope Preview de Vercel erradas** (storage health 500 "Invalid Compact JWS") | **CORREGIDO** vía API de Vercel con los valores verificados de `.env.stg` (efectivo en el próximo deploy de preview) |
| A-4 | **Tests y scripts destructivos sin guarda de ambiente** (el teardown de vitest podía soft-borrar el catálogo real si se corría contra la nube; purgas sin verificación de host) | **CORREGIDO**: helper `packages/db/scripts/lib/env-guard.mjs` (permite local/STG, bloquea PRD y remotos desconocidos, escape `LUCAMS_ALLOW_DESTRUCTIVE_REMOTE=1`) aplicado al teardown y a 5 scripts destructivos |
| A-5 | `release-check-a1.spec.ts` publicaba copy en PRD y no lo revertía si moría a mitad | **CORREGIDO**: reversión garantizada en `afterAll` |

### MEDIO

| # | Hallazgo | Estado |
|---|---|---|
| M-1 | Server Action de IA (`suggestDesignAction`) invocable en modo catálogo (UI oculta ≠ autorización) | **CORREGIDO**: guard con `isCatalogMode()` + test |
| M-2 | Webhook Wompi: 500 crudo si faltan vars (caso catalog-prod) | **CORREGIDO**: 503 limpio `{error:"webhook not configured"}` + test de integración |
| M-3 | Cotizaciones sin aviso por email (si el cliente no pulsaba "Enviar por WhatsApp", la venta se perdía) | **CORREGIDO**: email transaccional al admin al crear cotización (fire-and-forget vía `after()`, idempotente, plantilla nueva + tests 71/71) |
| M-4 | Link "Cambiar contraseña" del shell admin → 404 | **CORREGIDO**: repuntado a `/admin/seguridad` (label "Seguridad") |
| M-5 | Foco invisible en slots del Estudio, swatches y toolbar (WCAG 2.4.7) | **CORREGIDO** (ring púrpura foco vs turquesa selección) |
| M-6 | Contraste links rosados footer 3.69:1 (< 4.5:1 AA) | **CORREGIDO** → `brand-coral` (5.02:1) + archivos agregados al test de contraste |
| M-7 | Carruseles con autoplay sin pausa ni reduced-motion; dots 8px único control móvil | **CORREGIDO**: botón pausa/play, no-autoplay con `prefers-reduced-motion`, dots 24px |
| M-8 | Wishlist anidado dentro del Link de la card (HTML inválido) | **CORREGIDO**: stretched-link inverso + test |
| M-9 | Lightbox PDP sin DialogTitle; editor Estudio sin h1 | **CORREGIDO** (sr-only ambos) |
| M-10 | DDL de `AdminRecoveryCode` fuera de Prisma (drift de contrato; funciona por orden de setup) | **DIFERIDO** (deuda técnica documentada; CI y setups aplican en orden correcto) |

### BAJO (todos corregidos en sesión salvo indicación)

- `WA_NUMBER` del CMS sin sanitizar (un `+57...` rompía el link wa.me) → **CORREGIDO** + tests.
- aria-labels en inglés ("Breadcrumb", "Close") → **CORREGIDO** a español.
- Estrellas de reseña sin alternativa textual; chips de filtro sin "Quitar filtro X"; QuoteForm sin asterisco en email y errores no asociados → **CORREGIDO**.
- Comentario "HMAC" incorrecto en `features/payments/wompi.ts` (es SHA-256 plano) → **CORREGIDO**.
- Carpeta de migración duplicada `supabase/migrations/20260726085530_*` → **ELIMINADA**.
- Drift documental masivo (INTEGRATIONS: webhook Resend/Gemini/ruta Wompi; OPERATIONS: `EMAIL_REPLY_TO` con dominio errado, var muerta Wompi, modelo Gemini, health endpoints inexistentes, "push a main", vercel.json; TESTING: coverage sí enforced, tabla objetivo vs real, test-rls; OBSERVABILITY: cron error-budgets inexistente) → **CORREGIDO**.
- Índices faltantes en queries calientes (`Order.email/phone`, composite grid productos) → **DIFERIDO** (impacto nulo hoy; preventivo cuando el catálogo/transaccional crezca).
- Rate limits de auth en valores "pre-launch" (TODO del propio código para endurecer al lanzar) → **DECISIÓN PENDIENTE del negocio** (Turnstile fail-closed mitiga).
- Login sin Turnstile (solo rate limit) → riesgo aceptado, monitorear.
- `radiogroup` sin arrow-keys (filtros/toolbar) → deuda a11y menor documentada.

## Verificación ejecutada (evidencia)

- **Vitest LOCAL oficial (`make test-local`): 165 archivos, 2741 passed / 2 skipped, 0 failed** (incluye quotes 71/71, webhooks 13/13, wa 39/39, a11y-contrast, product-card, quote-form). Las 2 suites excluidas (`finalize-server-render`, `letter-tiles` por `NIGHTLY_LOCALSTACK`) corren en nightly CI; `letter-tiles` además pasó aparte 5/5 tras sembrar abecedario.
- **Build de producción `next build`: OK** (tabla de rutas completa, 0 errores).
- **Playwright contra dev LOCAL en modo catálogo: smoke 9/9 + catalog-mode 2/2** (flujo de ingresos Etapa 1: home → catálogo → PDP → carrito → "Cotizar por WhatsApp" → form; panel admin cotizaciones).
- **Gates CI replicados en local:** typecheck ✓, eslint ✓, prettier ✓, lint voseo ✓, content-coverage ratchet ✓ (baseline regenerado con los 4 literales nuevos legítimos: sr-only a11y + rama catálogo PDP).
- **PRD en vivo:** `/` 200, `/api/health/all` ok (postgres/storage/resend), `/api/health/crons` sin atrasos tras aplicar 023 (21:25 UTC).
- **STG en vivo (con bypass):** 8 rutas 200, FAQ sirviendo texto nuevo desde la DB de STG, crons ejecutando JSON real, db health ok. Storage health quedará ok con el redeploy de preview (llaves corregidas).
- **DB/RLS:** 57/57 tablas con RLS en SQL versionado; grants anon revocados (022); storage 5 buckets con policies correctas; 10/10 jobs pg_cron en los 3 ambientes.

## Acciones humanas pendientes (bloqueantes para Etapa 2 o higiene operativa)

1. **Lucy — flip Production Branch `develop`→`production` en Vercel** (Settings → Git; la API no lo permite). Hoy cada push a `develop` despliega en vivo. Secuencia: merge `develop`→`production` (fast-forward) → flip → smoke `release-check-a1.spec.ts` → branch protection con los 7 jobs required.
2. **Lucy — invalidar caché CMS en PRD** tras el deploy: /admin/contenido → "Actualizar caché de contenido" (el contenido corregido ya está en la DB de PRD; el caché se auto-cura ≤1 h o con el deploy).
3. **Backups R2 (P0-4) siguen inactivos** — workflow implementado, secrets nunca configurados; PRD está en Supabase Free (sin PITR). El único respaldo real hoy: dumps manuales en la VM. ~2-4 h provisionar bucket + secrets + un run manual.
4. **Monitor externo (UptimeRobot/BetterStack) sobre `/api/health/all` + `/api/health/crons`** — hoy una caída solo la reporta un cliente.
5. **Trámites Etapa 2 (sin cambios):** NIT/RUT, abogado, DIAN/contador, cuenta Wompi propia (las llaves sandbox actuales son de otro comercio), cuenta Aveonline real + webhook con header (no query).
6. **Decisión:** endurecer rate limits de auth a los valores "de lanzamiento" del TODO (`registro/actions.ts:114-128`).

## Estado por integración (resumen)

- **Wompi:** firma SHA-256 + timingSafeEqual + anti-replay + environment-match + idempotencia P2002 — OK. Webhook vivo en catálogo, fail-closed sin config (503 limpio desde hoy). Prod espera cuenta propia (Etapa 2).
- **Aveonline:** multi-carrier, circuit breakers, retry solo idempotente, guía sin retry, facturación con doble gate — OK. Credenciales reales solo en scope Production. Webhook con secret (migrar de query a header cuando AveCRM lo permita).
- **Resend:** 11 flujos verificados + webhook Svix activo + unsubscribe RFC 8058 — OK. Nuevo: aviso de cotización al admin (hoy).
- **Turnstile:** 6 formularios, verificación server, fail-closed — OK.
- **WhatsApp:** fuente única CMS + sanitizado de dígitos (hoy) + mensajes pre-armados — OK.
- **Gemini:** key solo servidor, oculto en catálogo + guard server-side (hoy) — OK.
- **Supabase Auth:** OTP-only, anti-enumeración, 3 clientes separados — OK. Verificación manual de Site URL/redirects por proyecto (dashboard) ya cubierta en STG/PRD al crear stg.
