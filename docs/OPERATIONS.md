# Operations — Lucams_shop

Variables de entorno consolidadas, comandos de despliegue, runbook de incidentes y plan de monitoreo. Este documento se actualiza cada vez que se agrega una integración nueva o se cambia un proceso operativo.

> **Estado actual:** el stack opera end-to-end en 3 ambientes (DEV local podman, STG `lucams-stg`, PRD `lucamsshop.com`) — los comandos y runbooks de este documento aplican tal cual. Los cambios de infraestructura, vars o procesos se reflejan editando la sección correspondiente (doc vivo, sin changelog — el historial está en git).

---

## Entorno de desarrollo (VM dedicada — símil Vercel local)

> **Mandato #10:** la VM es 100% dedicada al proyecto, usuario con `sudo`, persistencia local, instalación global permitida. **No usar venvs Python ni contenedores Docker** salvo necesidad explícita y justificada. La VM debe **funcionar como símil local de Vercel** (logs accesibles, variables de entorno configuradas, hot reload, healthchecks).

### Prerrequisitos a instalar globalmente (una sola vez)

```bash
# Node.js 22 LTS (gestor recomendado: fnm o nvm)
curl -fsSL https://fnm.vercel.app/install | bash
fnm install 22 && fnm use 22

# pnpm (verificar instrucciones oficiales: pnpm.io/installation)
curl -fsSL https://get.pnpm.io/install.sh | sh -

# Supabase CLI (para dev local con Postgres + Auth + Storage en Docker)
# Doc oficial: supabase.com/docs/guides/local-development/cli/getting-started
curl -fsSL https://supabase.com/install.sh | sh

# Vercel CLI (para emular el runtime de Vercel localmente)
pnpm add -g vercel

# GitHub CLI (para PRs, issues, secrets)
sudo dnf install -y gh   # o equivalente según distro
gh auth login
```

> **Verificación pendiente (mandato #9):** cuando se ejecuten estos comandos por primera vez, confirmar versiones contra docs oficiales y registrar versiones en `STATE.md` para que la VM sea reproducible.

### Estructura de variables de entorno locales

```
lucams_shop/
├── apps/web/.env.example     # Versionado en git, valores placeholder (el ÚNICO example — no hay uno en la raíz)
├── .env.local                # Gitignored (600) — FUENTE ÚNICA: el flip la alterna local↔nube
├── .env.local.nube-backup    # Gitignored (600) — respaldo con credenciales de prod (lo escribe el flip)
├── .env.stg                  # Gitignored (600) — credenciales de lucams-stg (make db-stg-*)
└── apps/web/.env.local       # SYMLINK → ../../.env.local (Next.js solo lee env de su propio
                              # directorio; el symlink garantiza que app y scripts usen la MISMA
                              # fuente. Antes era una copia estática y quedó apuntando a prod
                              # tras el flip — corregido 2026-08-01)
```

- **`.env.example`** se commitea siempre que se agrega/quita una variable.
- **`.env.local`** nunca se commitea (ver `.gitignore` — la regla `.env.*` cubre todos estos archivos, incluido el symlink).
- En Vercel se configuran por entorno (Production / Preview / Development) en el dashboard — matriz ejecutada en «Variables de entorno por ambiente».

### Símil Vercel local: cómo correr el stack

```bash
# 1. Levantar Supabase local (Postgres + Auth + Storage + Realtime + Edge Functions, todo en Docker)
#    Esto evita depender de Supabase Free (que se pausa) y da paridad con producción.
supabase start
# Salida: publishable key, secret key, DB URL → copiar a .env.local

# 2. Levantar Next.js en modo dev (símil a Vercel)
pnpm --filter web dev
# Por defecto en http://localhost:3000

# 3. Alternativa: usar Vercel CLI para emular el runtime de Vercel exactamente
vercel dev
# Esto incluye: rutas dinámicas, Edge Functions, Image Optimization, ISR

# 4. Aplicar migraciones a la DB local
pnpm --filter @lucams/db prisma migrate dev

# 5. Sembrar productos seed
pnpm --filter @lucams/db prisma db seed
```

### Supabase LOCAL del día a día (espejo nube, podman rootless)

> Implementado 2026-08-01. La VM no tiene Docker; el stack corre con **podman
> rootless** (socket del usuario) — espejo de la nube para TODO lo que la app
> toca: Postgres 15 + pg_cron, GoTrue (auth), Kong (API :54321), PostgREST,
> Storage (uploads), Mailpit (emails :54324), pg_meta, **Studio (:54323)** y
> Logflare. Excluidos deliberadamente: `imgproxy`, `edge-runtime`, `realtime`
> (la app no los usa y su init rompe el start del CLI en podman).

**Setup una sola vez (ya hecho en esta VM):**

- CLI Supabase **2.111.0** en `tmp/bin/supabase` (herramienta local gitignored;
  es la versión fijada en CI — las nuevas traen GoTrue incompatible).
- Socket podman: `systemctl --user enable --now podman.socket`.
- Workdir `supabase-local/` (config.toml + `supabase/snippets/` vacío — el CLI
  bind-mountea esa carpeta y sin ella el start falla en podman).

**Flujo diario (Makefile):**

```bash
make db-local-start   # levanta el stack (idempotente; datos persisten en volúmenes)
make db-local-setup   # extensiones + prisma migrate deploy + supabase/migrations (orden CI)
make db-local-on      # .env.local → stack local (respaldo en .env.local.nube-backup)
make db-local-seed    # catálogo + plantillas Estudio + ocasiones + CMS (854 campos)
pnpm --filter web dev # la app ya habla con el stack local
make test-local       # suite vitest completa contra la DB local (excluye las 2 suites de la DB compartida)
make db-local-off     # .env.local → nube compartida (restaura el respaldo)
make db-local-stop    # apaga el stack (los datos quedan en los volúmenes)
```

**Supabase Studio (GUI) — completo y verificado:**

- **URL:** http://localhost:54323 → redirige a `/project/default`. Sin login
  (default del CLI local; SOLO dev, nunca exponer fuera de la VM).
- **Table editor / SQL editor:** pg_meta responde (verificado: lista todas las
  tablas del esquema, `auth.*` incluidas).
- **Auth users:** pestaña Authentication lee `auth.users` del GoTrue local.
- **Storage:** buckets del repo (customer-uploads, product-images, cms-media,
  production-assets) con las mismas policies (migraciones `supabase/migrations`).
- **Emails:** Mailpit en http://localhost:54324 (bandeja de los correos que
  emita la app en dev — registro, recuperación, cotizaciones).
- **Logs:** Logflare en :54323 (pestaña Logs del Studio).
- **pg_cron:** instalado + los 11 jobs de la nube (10 HTTP + 1 SQL puro —
  habilitado con `CREATE EXTENSION pg_cron` en el setup; homologación verificada
  2026-08-05; conteo actualizado 2026-09-12: entró `lucams-expire-pending-orders` (032)
  y salió `stock_reservation_cleanup` (033); 2026-09-19: entró
  `lucams-purge-delivered-designs` (035)).

**Notas operativas:**

- `db-local-start` tras `db-local-stop`: si el CLI falla con `volume already
exists` (manejo de volúmenes distinto a docker), basta `make db-local-reset`
  (borra los volúmenes y rehace todo: start + setup + seed; los datos se resiembran).
- El Nightly CI usa el MISMO enfoque con docker real en el runner
  (`.github/ci/localstack`) — los resultados son comparables.
- **Guarda de ambiente anti-PRD:** los scripts destructivos (purgas/limpiezas
  masivas, teardown de vitest) pasan por `packages/db/scripts/lib/env-guard.mjs`
  — permite hosts locales y STG, y bloquea PRD y cualquier `*.supabase.co`
  desconocido. Escape hatch para una intervención deliberada:
  `LUCAMS_ALLOW_DESTRUCTIVE_REMOTE=1`. **OJO — alcance declarado:** la guarda NO
  cubre hosts remotos ajenos a Supabase — un `DATABASE_URL`/`DIRECT_URL` contra
  un Postgres remoto no-Supabase pasa sin bloqueo.

### Logs locales (símil Vercel Logs)

Durante `pnpm dev` los logs salen a stdout. Para una experiencia más cercana a Vercel:

```bash
# Logs del Next.js
pnpm --filter web dev | tee logs/next-$(date +%F).log

# Logs de Supabase local
supabase status                  # ver puertos
supabase logs --tail             # stream en vivo de Postgres + servicios

# Logs estructurados por nivel (desde el código usar pino o similar)
LOG_LEVEL=debug pnpm --filter web dev
```

> **Política de logs:** estructurados (JSON), con campos `level`, `requestId`, `userId` (si autenticado), `route`, `latencyMs`. **PII redactada:** nunca loggear emails completos, teléfonos, direcciones, payloads de tarjetas. Detalle en [`SECURITY.md` § Logging](./SECURITY.md#logging).

### Healthchecks locales (mismos que producción)

```bash
# Una vez levantado el dev server (:4000 con `make web-start` — la PORT sale de
# .env.local exportada al shell; un `pnpm --filter web dev` pelado arranca en :3000)
curl -f http://localhost:4000/api/health           # 200 si el servidor corre (liveness; no chequea DB)
curl -f http://localhost:4000/api/health/db        # 200 si Postgres responde
curl -f http://localhost:4000/api/health/all       # 200 si db + storage OK (agregado)
# Encadenado:
curl -f http://localhost:4000/api/health && echo OK
```

### Jobs de limpieza pg_cron — VERSIONADOS (auditoría 2026-07-13)

Los jobs de limpieza internos (solo SQL, sin secret) están versionados en
`supabase/migrations/00000000000012_pgcron_cleanup_jobs.sql`: **`rate_limit_cleanup`** (borra
buckets viejos, cada 15 min) y **`stock_reservation_cleanup`** (libera reservas expiradas, cada
minuto). La migración es GUARDADA (se salta limpio si pg_cron no está instalado, ej. el Postgres
de CI) e IDEMPOTENTE (re-agenda por nombre). Al habilitar `pg_cron` en el dashboard de Supabase,
re-aplicar la migración agenda los jobs.

### Jobs HTTP pg_cron — VERSIONADOS vía Vault (auditoría 2026-07-17)

Los jobs que llaman a `GET /api/cron/*` (protegidos por `CRON_SECRET`, mandato #11 — no Vercel
Cron) **también están versionados** en `supabase/migrations/00000000000015_pgcron_http_jobs.sql`
(+ la `016` de purge-event-logs, la `021` de cms-publish-scheduled —roadmap C3— y la `032` de
expire-pending-orders —N-12—).
Antes vivían solo como comandos manuales aquí → en un `db reset`, proyecto nuevo o DR se perdían
silenciosamente (alertas, resumen diario, palancas de ingreso, purga de retención). La migración es
GUARDADA (pg_cron + pg_net) e IDEMPOTENTE.

**Sin secreto en el SQL (mandato #12):** el comando de cada job lee en runtime la base URL y el
`CRON_SECRET` desde **Supabase Vault** (`vault.decrypted_secrets`) y manda el secreto por el header
`x-cron-secret` (no en la URL). El texto versionado solo contiene la BÚSQUEDA en el vault.

| Job                                  | Schedule (UTC) | Endpoint                            | Qué hace                                                                                                                                                                                                               |
| ------------------------------------ | -------------- | ----------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `lucams-alerts`                      | `*/5 * * * *`  | `/api/cron/alerts`                  | Alertas (5xx en pico, reconciliación, webhooks)                                                                                                                                                                        |
| `lucams-daily-summary`               | `0 13 * * *`   | `/api/cron/daily-summary`           | Resumen diario 8am Colombia                                                                                                                                                                                            |
| `lucams-review-request`              | `0 17 * * *`   | `/api/cron/review-request`          | Solicitud de reseña 7–30 días post-entrega                                                                                                                                                                             |
| `lucams-cart-recovery`               | `0 * * * *`    | `/api/cron/cart-recovery`           | Recordatorio de carrito abandonado (idle ≥4h por default; configurable desde `/admin/carritos/configuracion` — ver la sección de abajo)                                                                                |
| `lucams-back-in-stock`               | `*/30 * * * *` | `/api/cron/back-in-stock`           | "Avísame cuando vuelva"                                                                                                                                                                                                |
| `lucams-purge-anon-designs`          | `0 8 * * *`    | `/api/cron/purge-anon-designs`      | Retención: diseños DRAFT anónimos (Ley 1581) + DRAFT idle de logueados (90d) + READYs abandonados (ADR-130) + carritos (AbandonedCart ≥90d, carts idle ≥60d/vacíos ≥7d) + barrido de huérfanos de Storage (2026-10-12) |
| `lucams-purge-delivered-designs`     | `0 9 * * *`    | `/api/cron/purge-delivered-designs` | Retención post-entrega: borra fotos crudas + renders de diseños entregados ≥90d (migración 035)                                                                                                                        |
| `lucams-purge-event-logs`            | `0 3 * * *`    | `/api/cron/purge-event-logs`        | Retención: purga logs con PII — EmailEvent + WebhookEvent > 180d (migración 016)                                                                                                                                       |
| `lucams-cms-publish-scheduled`       | `*/5 * * * *`  | `/api/cron/cms-publish-scheduled`   | CMS: publica versiones programadas (roadmap C3, e.g. campañas)                                                                                                                                                         |
| `lucams-expire-pending-orders`       | `23 * * * *`   | `/api/cron/expire-pending-orders`   | Expira órdenes WOMPI en PENDING_PAYMENT > 24h (N-12, migración 032)                                                                                                                                                    |
| `lucams-process-render-jobs`         | `* * * * *`    | `/api/cron/process-render-jobs`     | Render de producción 300 DPI ASÍNCRONO (ADR-136, migración 041): procesa la cola RenderJob página por página con progreso real (doneUnits) y reintentos acotados (FAILED tras 3 → ErrorLog). Ver la sección de abajo   |
| `lucams-internal-cron-history-purge` | `17 4 * * *`   | SQL puro (sin HTTP)                 | Higiene interna: purga `cron.job_run_details` > 14d (migración 043 — pg_cron NO se auto-limpia; su historial fue el consumidor #1 de la BD: 93 MB en PRD al 2026-10-20)                                                |
| `lucams-internal-net-response-purge` | `43 4 * * *`   | SQL puro (sin HTTP)                 | Higiene interna: purga `net._http_response` > 24h (migración 043). La app nunca lee las respuestas (fire-and-forget); el único lector es `monitor_uptime_prd()` de STG ~10 min después — 24h cubre con holgura         |

> **STG difiere (2026-08-05): los 5 jobs que envían email quedaron DESAGENDADOS en stg**
> (`lucams-alerts`, `lucams-daily-summary`, `lucams-review-request`, `lucams-cart-recovery`,
> `lucams-back-in-stock`). Motivo: los previews de Vercel recibieron `RESEND_API_KEY` el
> 2026-08-04 y los crons de stg empezaron a enviar correos reales (alertas cada 30 min,
> resumen diario duplicado). En stg quedan agendados solo `lucams-cms-publish-scheduled`,
> `lucams-purge-anon-designs`, `lucams-purge-event-logs` y los 2 SQL puros
> (`rate_limit_cleanup`, `stock_reservation_cleanup`); PRD conserva los 10 (+ el
> `lucams-expire-pending-orders` de la migración 032 — N-12). **OJO:** las
> migraciones 015/023 re-agendan por patrón unschedule→schedule — re-aplicarlas en stg
> devuelve los crons de email, y el estado deseado en stg es desagendados. La 032, en
> cambio, es SEGURA de aplicar en stg: agenda únicamente su job nuevo (sin email) y no
> toca los desagendados.

**Env var:** `CRON_SECRET` (generar con `openssl rand -hex 32`) — en `.env.local` y en Vercel. Sin
ella los endpoints responden 401 (fail-closed). El destinatario de alertas/resumen sale de la setting
`ALERT_EMAIL` (default `hola@lucamsshop.com`).

**ACCIÓN HUMANA REQUERIDA (Lucy, al configurar prod — UNA sola vez):** habilitar `pg_cron` + `pg_net`
en el dashboard, y crear los 2 secretos del Vault (así el SQL versionado nunca contiene el valor):

```sql
select vault.create_secret('https://lucamsshop.com', 'cron_base_url');
select vault.create_secret('<CRON_SECRET real>',    'cron_secret');
-- SOLO ambientes detrás de Vercel Authentication (previews STG) — migración 023:
select vault.create_secret('<VERCEL_BYPASS_TOKEN>', 'cron_vercel_bypass');
```

Luego re-aplicar las migraciones con jobs (la 015 agenda 6; la 016 y la 021 agregan 1 cada una; la 032 agenda `lucams-expire-pending-orders`; la 035 agenda `lucams-purge-delivered-designs` → los 10 HTTP + 1 SQL puro). Para rotar el secreto: `vault.update_secret`.
Sin los secretos, los jobs quedan agendados pero fallan en runtime hasta setearlos.

> **Tercer secreto `cron_vercel_bypass` (migración 023, 2026-08-01):** los previews de Vercel tienen
> Deployment Protection (SSO) — sin bypass, los jobs HTTP reciben la página de login de Vercel (200
> HTML) en vez de ejecutar el endpoint, y `/api/health/crons` reporta `lastRunAt: null` en todos
> (el detalle de jobs requiere `x-cron-secret` desde la auditoría 2026-08-24, C-4).
> La migración 023 re-agenda los jobs HTTP añadiendo el header `x-vercel-protection-bypass` SOLO si el
> secreto existe en el Vault (la 032 replica el patrón para `lucams-expire-pending-orders`). En PRD
> (dominio público) no se crea → headers sin cambios. En STG ya
> está creado (verificado 2026-08-01: `net._http_response` devuelve JSON real de los endpoints).
> El valor es el "protection bypass for automation" del proyecto Vercel (también en `.env.stg` como
> `VERCEL_BYPASS_TOKEN`).

### Recuperación de carritos abandonados — módulo admin configurable (ADR-153, 2026-10-13)

El módulo `/admin/carritos` convirtió la palanca de recuperación en una capacidad operada
desde el panel, SIN tocar el agendamiento: el cron `lucams-cart-recovery` conserva su
schedule pg_cron (`0 * * * *`, migración 015) y lee la config en cada corrida.

- **Configuración (`/admin/carritos/configuracion`, solo SUPERADMIN):** settings
  `CmsField` kind SETTING (misma convención de loyalty/shipping —
  `features/cart/recovery-settings.ts`): `CART_RECOVERY_ENABLED` (kill-switch total: ni
  cron ni manual), `CART_RECOVERY_MODE` (`automatic` = el cron decide; `manual` = solo
  envíos a voluntad desde el panel), `CART_RECOVERY_IDLE_HOURS` (default 4),
  `CART_RECOVERY_MAX_REMINDERS` (default 1), `CART_RECOVERY_INTERVAL_HOURS` (default 24).
  **Los defaults reproducen el comportamiento histórico** (un recordatorio a las 4h):
  desplegar sin configurar nada no cambia la conducta. Los cambios publican al guardar
  (kind SETTING) e invalidan el tag `cms` desde la Server Action — el cron los ve en la
  próxima corrida, sin redeploy.
- **Comportamiento del cron:** módulo apagado o modo `manual` → responde ok con
  `skippedReason` (`"disabled"` / `"manual"`) y el heartbeat se registra igual (el
  dead-man switch mide que el job está vivo, no que haya enviado). En `automatic` aplica
  idleHours/maxReminders/intervalHours. Con `maxReminders > 1` los recordatorios al mismo
  carrito se espaciaban por `intervalHours`.
- **Envío manual (MANAGER_UP / permiso CATALOG):** individual desde el detalle
  `/admin/carritos/<id>` o bulk desde `enviar/`. `sendReminderToCart(id)` respeta el
  kill-switch y `intervalHours` (anti-duplicación), NO `maxReminders` (el tope es del
  brazo automático). El detalle muestra el **preview real del email en iframe** con un
  token ficticio — el token real solo se genera al enviar (F-11 intacto).
- **Audit log:** `cart_recovery.settings.save`, `cart_recovery.reminder.send`,
  `cart_recovery.reminder.bulk_send` (visibles en `/admin/auditoria`).
- **Migración `20261013140000_abandoned_cart_reminder_count`:** agrega
  `AbandonedCart.reminderCount Int @default(0)` con backfill =1 donde ya hubo
  recordatorio. **Aplicada a STG el 2026-10-13; a PRD llega con el deploy del merge**
  (es aditiva: el código viejo convive con la columna).
- **Fix asociado:** la idempotency-key de Resend ahora es por intento
  (`cart-recovery-<id>-<n>`) — con más de un recordatorio por carrito, la clave única por
  carrito hubiera suprimido los envíos 2..N.

### Render de producción asíncrono — RenderJob (ADR-136, 2026-10-13)

> **Orden de despliegue en PRD (obligatorio):** la migración supabase
> `00000000000041_pgcron_render_jobs.sql` (agenda el cron `lucams-process-render-jobs`)
> debe aplicarse **DESPUÉS** de desplegar el código que expone
> `/api/cron/process-render-jobs` — si el cron corre antes del deploy, cada tick pega un
> 404 hasta que salga el release. En **STG la 041 ya está aplicada**. Las migraciones
> Prisma de la jornada 2026-10-12/13 (`20261012120000_order_wompi_payment_attempt`,
> `20261012130000_loyalty_points_program`, `20261012140000_design_draft_preview_url`,
> `20261013120000_render_job_async_production`, `20261013130000_design_preview_watermark`)
> ya están aplicadas en **STG y PRD** (la tabla `RenderJob` existe en ambos; solo la
> agenda del cron es la que espera al deploy en PRD).

El render de los PNG 300 DPI ya **no corre en el request** de "Agregar al carrito" (un set de
calendario ×3 = 36 páginas contra `maxDuration=60` → 500/504, incidente STG 2026-10). El
finalize sube el preview, crea el `RenderJob` y responde; el Estudio muestra progreso real por
polling (`GET /api/designs/<id>/render-status`) y el render corre en background:

- **Worker**: `processRenderJobs` (`features/personalization/render-job-service.ts`), por lotes
  y unidad por unidad, actualizando `RenderJob.doneUnits`. Lo llama el cron
  `lucams-process-render-jobs` (cada minuto, migración `supabase/migrations/00000000000041_pgcron_render_jobs.sql`)
  y el propio finalize como _kick_ acotado (8 s) para que diseños chicos terminen en el request.
- **Reintentos**: `attempts` cuenta solo FALLOS y reclamos de lease vencido (5 min), no ticks;
  a los 3 → `FAILED` + ErrorLog (lo recoge la alerta `errors_spike`). `NEEDS_KONVA` (diseño no
  reproducible server-side) es terminal inmediato: si el diseño ya tiene los PNG del cliente
  (ADR-081) el job cierra DONE y los conserva; si no hay nada que imprimir, FAILED.
- **Retención**: `RenderJob.design` es `ON DELETE CASCADE` — purgar el diseño mata el job; no
  hay barrido de jobs huérfanos porque no pueden existir.
- **STG/PRD**: la migración 041 agenda solo su job (patrón seguro como la 032 — no re-agenda
  los de email desagendados en STG). Usa los mismos secretos Vault `cron_base_url` /
  `cron_secret` (+ `cron_vercel_bypass` en STG); sin pasos manuales nuevos si 015 ya corrió.
- **Comportamiento admin con render en curso**: una orden puede pagarse con el render en
  background (el SLA de producción lo absorbe; son minutos). El detalle del pedido muestra
  "Preparando archivos de impresión… X de N" / "el render falló" según el `RenderJob`, y el ZIP
  de producción (`/admin/pedidos/<n>/produccion`) responde **409** mientras haya un job vivo
  (nunca un ZIP a medias) y grita en el LEEME.txt los items con render FAILED.

### Migraciones de la jornada integral 2026-10-17/20 (fases 1-6, ADR-155…160)

| Migración                                                         | Qué crea                                                         | STG           | PRD                       |
| ----------------------------------------------------------------- | ---------------------------------------------------------------- | ------------- | ------------------------- |
| Prisma `20261017120000_wompi_payment_ledger`                      | Ledger `WompiPaymentAttempt`/`WompiPaymentTransaction` (ADR-137) | ✅ 2026-10-20 | pendiente (con el deploy) |
| Prisma `20261017130000_design_client_rev`                         | `Design.clientRev` — concurrencia optimista del editor (ADR-156) | ✅ 2026-10-20 | pendiente (con el deploy) |
| Prisma `20261020120000_design_archived_from`                      | `Design.archivedFrom`                                            | ✅ 2026-10-20 | pendiente (con el deploy) |
| SQL `supabase/migrations/00000000000042_wompi_payment_ledger.sql` | RLS del ledger                                                   | ✅ 2026-10-20 | pendiente (con el deploy) |

- Las Prisma viajan con el `prisma migrate deploy` del release (mismo orden de siempre). La SQL
  042 **no agenda crons** (solo RLS de las tablas nuevas) — segura de aplicar en cualquier
  momento y no toca los jobs desagendados de STG.
- **Backfill del ledger:** one-shot
  `packages/db/scripts/one-shot/wompi-payment-ledger-backfill.mjs` (dry-run por defecto,
  `--apply` con env-guard) — copia al ledger la evidencia local histórica de órdenes WOMPI
  (`wompiReference`/`paymentAttempt`/`wompiTransactionId`, marcando `backfilled`); NO consulta
  la API de Wompi ni infiere estados. **Corrido en STG el 2026-10-20: 0 cambios necesarios.**
  En PRD: correr tras el `migrate deploy` del release (desde `packages/db`:
  `pnpm exec dotenv -e ../../.env.local.nube-backup -- node scripts/one-shot/wompi-payment-ledger-backfill.mjs`
  y luego con `--apply`).
- **Claves CMS nuevas** de la jornada (`estudio.lienzo.borrar-diseno-*`,
  `estudio.texto.ig-reaplicar-*`, `estudio.exportar.zoom-*-aria`, `estudio.letras.set-pager-*`,
  `estudio.plantillas.reemplazo-*`, confirms `account.designs.*` — 7 claves — y el texto
  `editor-desc` actualizado): ya registradas en `packages/db/scripts/cms-site-map.mjs`; se
  materializan por ambiente con `make migrate-cms-v2` + «Actualizar caché de contenido» en
  `/admin/contenido` (mientras no se siembren, sirven los fallbacks del código).

### Higiene de Supabase Storage — estrategia completa (2026-10-12)

Contexto: el 2026-10-12 se midieron **~316 MB de objetos huérfanos en PRD** (217 MB en
`production-assets`, 99 MB en `customer-uploads`) — bytes de diseños borrados antes de que las
purgas de retención existieran, invisibles para la métrica de cuota (que solo medía 2 buckets).
Se barrió con el one-shot `packages/db/scripts/one-shot/purge-orphan-storage-20261012.mjs` y se
cerraron los puntos ciegos con cuatro capas que corren en **STG y PRD** (el job
`lucams-purge-anon-designs` NO es de los desagendados en STG — corre en ambos):

1. **Purgas por diseño (retención, Ley 1581)** — cron `lucams-purge-anon-designs` (08:00 UTC) +
   `lucams-purge-delivered-designs` (09:00 UTC). Borran bytes + filas cuando un diseño cumple su
   TTL: DRAFT anónimo ≥30d, DRAFT de logueado ≥90d, READY nunca ordenado ≥90d (ADR-130),
   entregado ≥90d (retention-delivered). Si el borrado de bytes falla, las filas NO se borran →
   reintento en el próximo ciclo (nunca bytes sin registro). Detalle y TTLs en
   [COMPLIANCE.md](COMPLIANCE.md).
2. **Retención de carritos** — misma corrida, PRIMERA fase (`features/cart/cart-retention.ts`).
   Un cart VIVO blindaba sus diseños para siempre (guard `NO_LIVE_CART_ITEM`); ahora:
   `AbandonedCart` ≥90d se borra (el email de recuperación ya no es útil) y carts vivos idle
   ≥60d / vacíos ≥7d se hard-deletan (patrón de `mergeAnonCartIntoCustomer`; CartItem cae por
   CASCADE). NO borra diseños: los deja libres para la capa 1 en la misma corrida.
3. **Barrido de huérfanos (orphan sweep)** — misma corrida, ÚLTIMA fase
   (`sweepOrphanStorageObjects` en `features/personalization/retention-service.ts`). Red de
   fondo para la deriva que las capas 1–2 no ven (objetos cuya fila `Design` ya no existe).
   Propiedades: **acotado** (500 objetos/corrida, más viejos primero — el backlog se barre en
   corridas sucesivas), **fail-safe** (anti-join SQL contra `storage.objects` + doble
   verificación en JS que relee los `Design` antes de borrar; un bug en el SQL nunca borra
   bytes de un diseño vivo), **no fatal** (si falla, se loguea a ErrorLog vía
   `cron.purge_anon_designs.orphan_sweep_fail` sin tumbar las purgas legales ni el heartbeat) y
   **loggeado** (`retention.orphan_sweep` con scanned/deleted/failed). Reglas: `<designId>/…`
   en `production-assets`/`design-previews`; `<ownerId>/<designId>/…` en `customer-uploads` con
   gracia de 7 días para `<ownerId>/pending/…` (mismas del one-shot).
4. **Monitoreo de cuota de TODOS los buckets** — `/admin/observability` mide bytes y archivos
   reales de los 5 buckets directamente desde `storage.objects` (`metadata.size`), incluidos
   los huérfanos aún no barridos (antes `production-assets` — el más pesado — reportaba solo
   conteo y la alerta no lo veía). Pill «Total real» en ámbar si supera **800 MB** (plan Free:
   1 GB). Si la consulta a `storage.objects` falla, el tile degrada a las columnas de la app
   (total parcial marcado «Lectura degradada» + log `observability.storage_quota_fail`).

**Verificación manual de huérfanos** (dry-run de la capa 3, contra cualquier ambiente):

```bash
cd packages/db
pnpm exec dotenv -e ../../.env.stg -- node scripts/one-shot/purge-orphan-storage-20261012.mjs
```

(con `--apply` + `LUCAMS_ALLOW_DESTRUCTIVE_REMOTE=1` ejecuta; el cron diario hace innecesario
correrlo a mano salvo diagnóstico). Frontera conocida: los huérfanos de `product-images` y
`cms-media` no los barre la capa 3 (su dueño es el catálogo/CMS, no Design) — la mediateca
tiene filtro «Sin uso» en `/admin/contenido/mediateca`.

### Symlink de Supabase local con datos de prueba

```bash
# Reset rápido de la DB local con seed
supabase db reset                # destruye datos locales y re-aplica migraciones + seed

# Snapshot manual antes de un cambio peligroso
supabase db dump --local > backups/local-$(date +%F-%H%M).sql
```

### Convenciones de la VM

- **Repo en:** `/home/ansible/workspaces/lucams_shop/`
- **Logs locales en:** `/home/ansible/workspaces/lucams_shop/logs/` (gitignored)
- **Backups locales en:** `/home/ansible/workspaces/lucams_shop/backups/` (gitignored)
- **Git remote:** GitHub del usuario (configurado en Fase 0b).
- **Hook pre-commit versionado:** `scripts/git-hooks/pre-commit` corre gitleaks sobre lo
  staged (auditoría 2026-08-24, A-2/A-4). Activación una vez por clon:
  `git config core.hooksPath scripts/git-hooks` — ya hecho en esta VM. Si gitleaks no está
  instalado el hook avisa y deja pasar el commit: las capas que mandan son GitHub Push
  Protection + el job `secrets-scan` de CI.
- **Nada de credenciales** en historial de shell ni en archivos versionados.

---

## Compatibilidad local ↔ Vercel (paridad de runtime)

> Mandato #10 dice que la VM funciona como **símil-Vercel local**. Esta sección documenta la paridad entre comandos/configuración local y los que Vercel ejecuta en cada deploy.

### Matriz de paridad

| Aspecto                 | Local (VM)                                                                                                                                                | Vercel                                                                                           | Estado |
| ----------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ | ------ |
| Versión Node            | 22.22.2 (NodeSource RPM)                                                                                                                                  | 22 (default Next 16)                                                                             | ✅     |
| Package manager         | pnpm 11.0.9 (vía corepack)                                                                                                                                | pnpm (detectado por `pnpm-lock.yaml`)                                                            | ✅     |
| **Build command**       | `pnpm --filter web build`                                                                                                                                 | igual (declarado en `vercel.json`)                                                               | ✅     |
| **Install command**     | `pnpm install --frozen-lockfile`                                                                                                                          | igual (declarado en `vercel.json`)                                                               | ✅     |
| **Output directory**    | `apps/web/.next/`                                                                                                                                         | igual (declarado en `vercel.json`)                                                               | ✅     |
| **Framework detection** | Next.js auto                                                                                                                                              | Forced `"nextjs"` en `vercel.json` (evita falsa detección por `package.json` root del workspace) | ✅     |
| Image optimization      | `sharp` 0.34.4 (clavado a propósito: la línea 0.35.x rompía las lambdas de Vercel — comentario en `pnpm-workspace.yaml`; build script aprobado ahí mismo) | Vercel managed (mismo binary)                                                                    | ✅     |
| Edge runtime            | no usado                                                                                                                                                  | no usado (mantenemos `proxy.ts` con runtime nodejs)                                              | ✅     |
| Telemetry               | `NEXT_TELEMETRY_DISABLED=1` en `.env.local`                                                                                                               | Idem en Vercel env vars                                                                          | ✅     |

### Gap crítico — sincronización de env vars (RESUELTO 2026-08-01)

**Resuelto:** la matriz completa de env vars quedó distribuida por ambiente en Vercel (Production/Preview) el 2026-08-01 — ver «Variables de entorno por ambiente» más abajo. Esta subsección queda como referencia del set mínimo inicial (Fase 0): en local viven en `.env.local`; en Vercel se configuran en Project Settings → Environment Variables.

#### Vars a sincronizar (de `.env.local` a Vercel UI)

Para los 3 environments de Vercel: **Production**, **Preview**, **Development**.

| Variable                               | Pública (visible al cliente) | Notas                                                                                                                                                                                                                                                                                                                                  |
| -------------------------------------- | ---------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `NEXT_PUBLIC_SITE_URL`                 | ✅                           | Cambia entre local (`http://localhost:3000`) y prod (`https://lucamsshop.com` cuando se compre). **Fuente ÚNICA de la URL canónica** (audit v3 #28): `lib/origin.ts:getCanonicalSiteUrl()` la lee para sitemap, robots, canonicals, OG y `metadataBase`. NO usar el setting CMS `SITE_URL` para esas superficies (causaba split-brain) |
| `NEXT_PUBLIC_SUPABASE_URL`             | ✅                           | Igual en todos los entornos                                                                                                                                                                                                                                                                                                            |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | ✅                           | Igual en todos los entornos                                                                                                                                                                                                                                                                                                            |
| `SUPABASE_SECRET_KEY`                  | ❌ Solo server               | **Marcar como Encrypted en Vercel**                                                                                                                                                                                                                                                                                                    |
| `DATABASE_URL`                         | ❌                           | Pooler (puerto 6543), reemplazar `[YOUR-PASSWORD]` con la db password                                                                                                                                                                                                                                                                  |
| `DIRECT_URL`                           | ❌                           | Direct (puerto 5432), idem                                                                                                                                                                                                                                                                                                             |
| `RESEND_API_KEY`                       | ❌ Solo server               | Encrypted                                                                                                                                                                                                                                                                                                                              |
| `EMAIL_FROM`                           | ❌                           | Texto plano (`Lucams_shop <onboarding@resend.dev>`)                                                                                                                                                                                                                                                                                    |
| `NEXT_PUBLIC_WA_NUMBER`                | ✅                           | `573208873826`                                                                                                                                                                                                                                                                                                                         |
| `NODE_ENV`                             | ❌                           | `production` en Vercel (no se setea manual; Vercel lo maneja)                                                                                                                                                                                                                                                                          |
| `NEXT_TELEMETRY_DISABLED`              | ❌                           | `1`                                                                                                                                                                                                                                                                                                                                    |

> **Cómo agregarlas:** Vercel Dashboard → Project `lucams-shop` → Settings → Environment Variables → "Add New". Para cada var, marcar los 3 entornos (Production, Preview, Development) salvo que el valor difiera. Las que tienen `*_KEY`, `*_SECRET`, `DATABASE_*` deben marcarse como **Encrypted** (default checkbox).

> **Verificación:** después de configurarlas, push cualquier commit. El log del deploy en Vercel debe mostrar `pnpm install` y `pnpm --filter web build` ejecutarse sin "Missing environment variable" warnings.

### Estrategia de ramas y releases (2026-07-03)

Dos ramas en `github.com/jullieth93/lucams`:

| Rama         | Rol                          | Vercel                                               |
| ------------ | ---------------------------- | ---------------------------------------------------- |
| `develop`    | Trabajo diario + staging     | Preview deploys                                      |
| `production` | Release / producción en vivo | **Production Branch de Vercel (vigente 2026-08-05)** |

- **NO hay `main`** — la rama de producción se llama `production` (decisión de Lucy).
- **Flujo diario:** commitear en `develop` + `git push origin develop` al cerrar cada tanda (no acumular commits locales sin subir — pasó un atraso de 116).
- **Release:** con OK explícito de Lucy, `git checkout production && git merge --ff-only develop && git push` → Vercel despliega producción. `production` solo avanza en releases.
- **Hecho (verificado 2026-08-05):** la Production Branch de Vercel ya es `production` (Settings → Git) — los push a `develop` generan previews; solo el release (ff a `production`) actualiza el sitio en vivo.
- **Seeds de la ola (cuando el merge trae cambios de DATOS):** tras el push a `develop` (STG) y tras el release (PRD), correr por ambiente los scripts de `packages/db/scripts` que apliquen — `migrate-cms-v2.mjs` (keys CMS nuevas del site map) y/o `seed-templates.mjs` (plantillas del Estudio). Son upserts idempotentes (nunca pisan campos CMS ya editados; el barrido de legacy del seed archiva plantillas fuera del listado canónico). Se corren con el env del ambiente (`set -a && source .env.stg && set +a` para STG; el `.env.local.nube-backup` para PRD) y después se invalida el caché CMS (ver la nota de «migrate-cms-v2» abajo). Precedente completo: release 2026-09-11 (Ola 26-29) en `docs/STATE.md`.
- **CI (2026-07-24):** [`.github/workflows/ci.yml`](../.github/workflows/ci.yml) dispara en `develop` y `production`. Antes apuntaba a `[develop, main]` y **`main` no existe** → `production` se desplegaba sin ningún gate (auditoría 2026-07-21, A4). El fix ya viajó a `production` (merge del 2026-08-06; `git show production:.github/workflows/ci.yml` muestra los triggers nuevos) y CI corre verde en ambas ramas (homologación 2026-08-29). (También vigiló `catalogo-whatsapp` mientras esa rama vivió; se retiró con su borrado el 2026-09-11.) Los 7 jobs: `quality` (typecheck+lint+build), `unit-tests`, `e2e`, `lighthouse`, `secrets-scan` (gitleaks), `format-check` y `dep-audit` (`pnpm audit --prod --audit-level=high` — verde gracias a los `overrides` y al `auditConfig.ignoreGhsas` de [`pnpm-workspace.yaml`](../pnpm-workspace.yaml), cada uno con su justificación en comentario ahí). Todas las actions de los workflows están pineadas por SHA (auditoría 2026-08-24).

  **HECHO (2026-09-19, FASE B de la auditoría integral — hallazgo F-01):** `production` y `develop` tienen branch protection activa vía API de GitHub: los 7 jobs de CI como _required status checks_, `enforce_admins: true` (sin bypass administrativo), historia lineal (ff-only), force-push y delete bloqueados. Sin required reviews (operador único — riesgo residual aceptado). Rollback si una emergencia lo exige: `gh api -X DELETE repos/jullieth93/lucams/branches/<rama>/protection`. El mismo día se activaron también secret scanning, push protection y Dependabot security updates (hallazgo F-02; `validity_checks` y `non_provider_patterns` no son activables vía API en este repo — quedan como pendientes menores en Settings → Code security).

### Homologación de ambientes — procedimiento verificable (ADR-102, 2026-09-15)

Los 3 ambientes (local / STG / PRD) deben tener **0 divergencias VIVAS** en catálogo, variantes, plantillas y CMS. Procedimiento (todo desde `packages/db`):

```bash
# 1. Snapshot por ambiente (solo lectura):
pnpm exec dotenv -e ../../.env.local            -- node scripts/one-shot/homologation-dump-20260915.mjs local
pnpm exec dotenv -e ../../.env.stg              -- node scripts/one-shot/homologation-dump-20260915.mjs stg
pnpm exec dotenv -e ../../.env.local.nube-backup -- node scripts/one-shot/homologation-dump-20260915.mjs prd

# 2. Diff cruzado (debe decir "HOMOLOGADOS en lo VIVO" en los 3 pares):
node scripts/one-shot/homologation-diff-20260915.mjs local stg
node scripts/one-shot/homologation-diff-20260915.mjs stg prd
node scripts/one-shot/homologation-diff-20260915.mjs local prd
```

- El diff separa divergencias **vivas** (bloquean) de **drift en filas archivadas** (ruido histórico de soft-deletes — se reporta, no bloquea).
- Las divergencias de DATOS CURADOS (precios, activación de productos) NO se auto-normalizan: se le preguntan a Lucy y se registran como decisión (precedente: ADR-102 ②).
- La normalización masiva usa `homologate-20260915.mjs` (espejo STG + overrides documentados, dry-run por defecto, env-guard; PRD con bypass).
- **Diseños prediseñados (2026-10-03):** `DesignGalleryImage` no lo cubría nada — se creó `packages/db/scripts/one-shot/sync-gallery-stg-to-prd.mjs` (dry-run por defecto; `--apply` con env-guard). Cruce por `id` y por `(tag, name)` — las filas sembradas independiente en cada ambiente tienen cuid distinta y el update conserva el id de PRD (FK `DesignAsset.galleryImageId`). Copia además los objetos del bucket `product-images` que falten en PRD. Preflight: aborta si PRD no tiene la columna `variantFilter` (correr `migrate deploy` antes). El comparador `scripts/diag-stg/06-homologacion-datos.sql` incluye `imageUrlB` y `variantFilter` en el checksum desde la misma fecha.
- El drift archivado NO se persigue: modificar historia archivada no aporta y confunde.
- **Homologación comercial PRD → espejo (2026-10-13):** `packages/db/scripts/homologate-catalog-from-prd.mjs` (dry-run por defecto, `--apply`, env-guard que bloquea PRD como destino; PRD se lee vía `.env.local.nube-backup`, NUNCA se escribe) alinea en LOCAL/STG: ① estados isActive/deletedAt de productos/variantes (gemelas `-NOMAG` intactas), ② contenido completo de Product (los campos del checksum de `06-homologacion-datos.sql`), ③ `DesignGalleryImage` (cruce por id y `(tag, name)`, inserts conservan el id de PRD) copiando al bucket del espejo los objetos de `product-images` que falten (mismo path, URLs reescritas al host del espejo). Filas del espejo ausentes en PRD: solo se reportan. Stock NUNCA se sincroniza. Ojo Prisma: en campos `Json?` el `null` plano escribe JSON `'null'` — SQL NULL exige `undefined` (create) o `Prisma.DbNull` (update), y el checksum compara `variantFilter::text`.
- **Sync de catálogo/CMS (2026-10-03):** `packages/db/scripts/one-shot/sync-catalog-stg-to-prd.mjs` cubre Category/Product/ProductVariant/CmsPage/CmsSection/CmsField/PersonalizationTemplate con el mismo patrón (dry-run, env-guard, clave natural, conserva ids de PRD). El **stock NUNCA se sincroniza** (PRD es operativo real; las variantes nuevas entran con stock 0 y se reportan para carga manual). Ejecutado el 2026-10-03: 6 inserts (producto `separadores-magneticos-delgados` + su variante + 4 settings `LUCAMS_SHIPPING_*`), 83 updates (incl. precio Abecedario $34.900→$33.900, decisión de Lucy), 4 versiones CMS publicadas, 1 objeto de storage.
- **Excepciones permanentes del comparador (DIFF deliberado, no perseguir):** `AdminUser` (los admins extra de STG son de pruebas; no se replican a PRD por seguridad), `Order`/`Customer` (datos transaccionales por ambiente), env vars por scope (`AVEONLINE_WEBHOOK_SECRET` solo Production, `CRON_JOBS_DISABLED` solo Preview — deliberado). **Incidente 2026-10-03:** los 130 `UrlRedirect` de PRD eran TODOS artefactos `/itest…` de una corrida de tests de integración apuntada a PRD — eliminados; lección: jamás correr suites de integración con el env de PRD cargado (el env-guard de scripts no aplica a vitest; ojo con `dotenv -e .env.local.nube-backup`).
- **Gate pre-push (lección CI 2026-09-15):** además de typecheck/lint/test/build, correr `pnpm format:check` y `node packages/db/scripts/audit-content-coverage.mjs --check` antes de cada push — fueron los 2 rojos del día (formato + ratchet CMS).
- **Drift check de SCHEMA Prisma ↔ Supabase (A9-08, remediación R3 2026-09-26):** la homologación de arriba cubre DATOS; la estructura la gatea `packages/db/scripts/audit-schema-drift.mjs` (solo lectura) en el job `unit-tests` de CI: snapshot del schema `public` tras `prisma migrate deploy` → se aplican las SQL de `supabase/migrations` → `check --baseline` falla el PR si falta algo declarado en `schema.prisma`, si las SQL crean tablas/columnas no allowlisteadas o si quitan algo que Prisma creó. Tolerancias conocidas (warning, con su historia en el header del script): `rate_limit_buckets` (SQL-only, 003). (`AdminRecoveryCode`/A5-01 se resolvió en R6 2026-09-27: la migración Prisma `20260926120000_admin_recovery_code` la crea y la SQL 008 quedó idempotente — salió de la allowlist.) Local: `pnpm --filter @lucams/db exec node scripts/audit-schema-drift.mjs check`.

### `vercel.json` del repo

El único `vercel.json` versionado es [`apps/web/vercel.json`](../apps/web/vercel.json) y es **minimal**: solo declara `{ "framework": "nextjs" }` (+ `$schema`). **No hay `vercel.json` en la raíz del repo** ni `ignoreCommand` en el código. La configuración de build/install/output viene del **Root Directory** del proyecto en Vercel UI (debe estar seteado a `apps/web`).

> **Skip de deploys docs-only:** si está activo, vive en la UI de Vercel (Settings → Git → Ignored Build Step) y **no es auditable desde el repo** — verificarlo ahí, no en el código.

> **Por qué Root Directory en UI y no `framework`/`buildCommand` en `vercel.json`:** Vercel valida la presencia de `next` en el `package.json` del **Root Directory** **antes** de leer `vercel.json`. Como nuestro `package.json` del repo root es del workspace (no de Next.js), declarar `framework: nextjs` en `vercel.json` no supera esa validación — produce el error _"No Next.js version detected"_. La solución correcta para monorepos es Root Directory = `apps/web`. Aprendido el 2026-05-09 al fallar el primer deploy con `vercel.json` "completo" — ver [`STATE.md` § sesión 12](STATE.md).

### Configuración requerida en Vercel UI

| Setting            | Valor                          | Cómo                                                                                                                     |
| ------------------ | ------------------------------ | ------------------------------------------------------------------------------------------------------------------------ |
| **Root Directory** | `apps/web`                     | Settings → General → Root Directory → input. **Crítico**: sin esto los deploys fallan con "No Next.js version detected". |
| Framework          | (auto-detect)                  | Vercel detecta Next.js en `apps/web/package.json`                                                                        |
| Build Command      | (auto-detect = `next build`)   | —                                                                                                                        |
| Install Command    | (auto-detect = `pnpm install`) | Detecta `pnpm-workspace.yaml` en el padre, instala desde root del workspace                                              |
| Output Directory   | (auto-detect = `.next`)        | —                                                                                                                        |
| Node Version       | 22.x                           | Settings → General → Node.js Version                                                                                     |

---

## Entorno local con Make (símil-Vercel)

> Patrón inspirado en `commerce-ops-platform`. Centraliza todos los comandos del entorno de desarrollo local en un Makefile en `/home/ansible/workspaces/lucams-shop-local/Makefile` para que la VM se sienta como un símil-Vercel sin necesidad de memorizar comandos pnpm largos.

### Estructura

```
/home/ansible/workspaces/lucams-shop-local/
├── Makefile          ← orquestador
├── logs/             ← un .log por servicio (web.log, etc.)
└── pids/             ← un .pid por servicio (track/kill)
```

> Vive en `/home/ansible/workspaces/lucams-shop-local/` (paralelo al repo, no dentro) para **persistir entre reinicios** de la VM. La operadora rechazó la ubicación inicial `/tmp/` precisamente para que el histórico de logs no se pierda por antigüedad o reboot. Al ser paralelo (no adentro del repo) tampoco contamina el árbol git.

### Comandos disponibles

```bash
cd /home/ansible/workspaces/lucams-shop-local && make help
```

#### Stack

| Comando                 | Acción                                                                              |
| ----------------------- | ----------------------------------------------------------------------------------- |
| `make up`               | Inicia Next.js dev server (background, log a `logs/web.log`, pid en `pids/web.pid`) |
| `make down`             | Mata el dev server                                                                  |
| `make restart`          | down + up                                                                           |
| `make status`           | Lista procesos vivos con su PID                                                     |
| `make logs SERVICE=web` | `tail -f logs/web.log`                                                              |
| `make clean`            | Borra logs/ y pids/                                                                 |

#### Quality gates (sin levantar dev server)

| Comando          | Acción                                                 |
| ---------------- | ------------------------------------------------------ |
| `make build`     | Build de producción (mismo comando que Vercel ejecuta) |
| `make typecheck` | `tsc --noEmit`                                         |
| `make lint`      | ESLint                                                 |
| `make format`    | Prettier --write                                       |

#### Validación local-cloud

| Comando              | Acción                                                                                           |
| -------------------- | ------------------------------------------------------------------------------------------------ |
| `make env-check`     | Lista vars de `.env.local` con su estado (loaded / missing / placeholder). **No expone valores** |
| `make health`        | Healthchecks: Supabase Auth, Supabase REST, web local (si está arriba)                           |
| `make vercel-parity` | Reproduce el build EXACTO que Vercel ejecuta. Si funciona local, funciona en Vercel              |

### Convenciones del Makefile

- **No usa Read/cat sobre `.env.local`.** Carga las vars con `set -a && source .env.local && set +a` en una subshell, evitando exposure al transcript.
- **`env-check` solo muestra nombres + length**, nunca valores. Detecta placeholders como `[YOUR-PASSWORD]` o `PLACEHOLDER` y los marca con ❌.
- **PID tracking robusto**: si un proceso muere fuera del control de make, `make status` detecta y limpia el PID huérfano.
- **No expone secretos en stdout**, solo HTTP codes y nombres de variables.

### Cuándo lo usás

- **Día a día de desarrollo:** `make up` por la mañana, `make logs SERVICE=web` mientras codeás, `make down` al final.
- **Antes de pushear:** `make typecheck && make lint && make build` para verificar que todos los gates pasan.
- **Si algo en Vercel falla:** `make vercel-parity` para reproducir el problema localmente con los mismos comandos.
- **Onboarding de un dev nuevo:** `make help` da todo el panorama en 30 segundos.

---

## Variables de entorno

### Lista consolidada

```bash
# ─── App ───
NEXT_PUBLIC_SITE_URL=http://localhost:3000        # dev
# NEXT_PUBLIC_SITE_URL=https://lucamsshop.com       # prod

NEXT_PUBLIC_WA_NUMBER=573208873826                # WhatsApp temporal del usuario

# STORE_MODE (ADR-077, plan de salida 2026-07-21): "catalog" = tienda
# catálogo + cotización por WhatsApp (Etapa 1, sin pagos/envíos/IA);
# "full" = tienda completa. **Producción corre en "full" por decisión de Lucy
# (2026-09-03)** — la tienda vende con pagos reales. En "catalog" las vars de
# Wompi/Aveonline/Gemini NO se exigen en producción.
# NEXT_PUBLIC_STORE_MODE=catalog

# ─── Supabase ───
NEXT_PUBLIC_SUPABASE_URL=https://xxxxx.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=eyJxxxxx
SUPABASE_SECRET_KEY=eyJxxxxx                # Server-only, NUNCA al cliente
DATABASE_URL=postgresql://postgres:[pwd]@xxx.pooler.supabase.com:6543/postgres?pgbouncer=true
DIRECT_URL=postgresql://postgres:[pwd]@xxx.supabase.com:5432/postgres

# ─── Wompi (Etapa 2 — requerido en prod solo en modo "full") ───
WOMPI_ENV=sandbox                                  # sandbox | production
WOMPI_PUBLIC_KEY=pub_test_xxxxxxxxxxxxxx
WOMPI_PRIVATE_KEY=prv_test_xxxxxxxxxxxxxx
WOMPI_INTEGRITY_SECRET=test_integrity_xxxxxxxxxxxxxx
WOMPI_EVENTS_SECRET=test_events_xxxxxxxxxxxxxx
# (La llave pública de Wompi NO se expone al navegador: el checkout es redirección al
# hosted checkout de Wompi. No declarar NEXT_PUBLIC_WOMPI_* — ver apps/web/.env.example.)

# ─── Aveonline (Etapa 2 — requerido en prod solo en modo "full") ───
AVEONLINE_USUARIO=xxxxxxxxxxxxxx
AVEONLINE_CLAVE=xxxxxxxxxxxxxx
AVEONLINE_WEBHOOK_SECRET=xxxxxxxxxxxxxx
AVEONLINE_ENV=test                                 # test | production

# ─── Resend ───
RESEND_API_KEY=re_xxxxxxxxxxxxxx
EMAIL_FROM=Lucams_shop <onboarding@resend.dev>     # dev
# EMAIL_FROM=Lucams_shop <hola@mail.lucamsshop.com>  # prod
EMAIL_REPLY_TO=hola@lucamsshop.com                     # prod (respuestas de clientes)
RESEND_WEBHOOK_SECRET=whsec_xxxxxxxxxxxxxx         # firma Svix del webhook de Resend (rebotes/quejas).
                                                   # PROD_REQUIRED: sin ella el endpoint rechaza fail-closed
                                                   # y la lista de supresión deja de alimentarse. En el
                                                   # dashboard de Resend suscribir SOLO el grupo "emails".

# ─── Gemini (IA del Estudio — proveedor elegido ADR-058; modo "full" o dev) ───
GEMINI_API_KEY=xxxxxxxxxxxxxx
GEMINI_MODEL_PRIMARY=gemini-2.5-flash-lite         # primario (free tier; verificar nombre vigente en doc oficial)
GEMINI_MODEL_FALLBACK=gemini-2.5-flash             # respaldo si el primario falla

# ─── Cloudflare Turnstile (CAPTCHA invisible en checkout y registro) ───
NEXT_PUBLIC_TURNSTILE_SITE_KEY=0x4AAAAAAAxxxxxxxxx  # Para widget en cliente
TURNSTILE_SECRET_KEY=0x4AAAAAAAxxxxxxxxx            # Server-only, validación de token

# ─── Cloudflare R2 (backups en producción) ───
R2_ACCOUNT_ID=xxxxxxxxxxxxxx
R2_ACCESS_KEY_ID=xxxxxxxxxxxxxx
R2_SECRET_ACCESS_KEY=xxxxxxxxxxxxxx
R2_BUCKET=lucams-backups
# BACKUP_GPG_PASSPHRASE: passphrase del cifrado gpg de los dumps (desde 2026-08-29).
# Vive como GitHub Secret (fail-closed en backup.yml y dr-drill.yml; valor en el
# gestor de Lucy); en .env* solo hace falta para correr `pnpm --filter web db:backup`
# o `apps/web/scripts/dr-drill.mjs` a mano.

# ─── Crons (pg_cron → /api/cron/* — OBLIGATORIO en prod) ───
CRON_SECRET=GENERATE_WITH_OPENSSL_RAND_HEX_32

# ─── Misc ───
# Modo mantenimiento: "1" (y solo "1") redirige todo el tráfico público a /maintenance
# (apps/web/proxy.ts). Al ser NEXT_PUBLIC_* queda inlineada en el build → cambiarla en Vercel
# NO surte efecto sin un redeploy. Ver § Disaster Recovery.
# NEXT_PUBLIC_MAINTENANCE_MODE=1
CSRF_SECRET=GENERATE_WITH_OPENSSL_RAND_HEX_32      # firma HMAC de cookies de sesión (carrito/checkout)
NODE_ENV=development                               # development | production
PORT=4000                                          # puerto del dev server local (lo exporta `make web-start`;
                                                   # Next NO lo lee del .env — un `pnpm dev` pelado usa :3000)
LOG_LEVEL=info                                     # debug | info | warn | error
NEXT_TELEMETRY_DISABLED=1                          # Anonymous telemetry de Next.js apagada

# ─── Retención (opcionales — ajuste sin redeploy; defaults entre paréntesis) ───
# PURGE_STALE_CART_AFTER_DAYS=60        # carritos vivos idle (ADR-143)
# PURGE_EMPTY_CART_AFTER_DAYS=7         # carritos vacíos
# PURGE_ABANDONED_CART_AFTER_DAYS=90    # AbandonedCart (email de recuperación)
# PURGE_IDLE_READY_AFTER_DAYS=90        # diseños READY nunca ordenados (ADR-130)
# Nota (auditoría 2026-10-20): en ambientes Vercel NO productivos (VERCEL_ENV ≠ "production",
# p.ej. STG) los plazos de diseños se ACOTAN automáticamente a 14 días
# (capRetentionDaysNonProd, features/personalization/retention-service.ts) — STG no retiene
# renders 300-DPI de pruebas durante meses. Un override explícito (estas vars) siempre manda.
```

> **Nunca commitear los valores reales.** Mantener el archivo `.env.example` (con placeholders) versionado en el repo y `.env.local` (con valores reales) ignorado. Ver [`/.gitignore`](../.gitignore).

### Convenciones

- **Vars con `NEXT_PUBLIC_`** son accesibles desde el navegador. **No poner secretos** ahí.
- **`SUPABASE_SECRET_KEY`** y **`*_PRIVATE_KEY`** son server-only.
- En desarrollo: archivo `.env.local` (gitignored).
- En Vercel: configurar por entorno (Production / Preview / Development) en el dashboard.
- **Nunca commitear** valores reales. Mantener un `.env.example` con valores ficticios como referencia.

### Política de rotación

| Secreto                 | Frecuencia     | Después de                                                                                                                      |
| ----------------------- | -------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| Wompi production keys   | Anual          | Compromiso sospechoso                                                                                                           |
| Supabase secret key     | Anual o ad-hoc | Compromiso sospechoso. Las nuevas secret keys (`sb_secret_*`) son revocables/rotables sin downtime — múltiples activas a la vez |
| Resend API key          | Anual          | Compromiso sospechoso                                                                                                           |
| Gemini API key          | 6 meses        | Cambio de equipo                                                                                                                |
| Aveonline usuario/clave | Anual          | Compromiso sospechoso                                                                                                           |

---

## Comandos (cuando exista código)

### Desarrollo local

```bash
# Instalar dependencias
pnpm install

# Levantar dev server
pnpm --filter web dev

# Aplicar migración de Prisma
pnpm --filter @lucams/db prisma migrate dev

# Generar cliente Prisma
pnpm --filter @lucams/db prisma generate

# Seed inicial de productos
pnpm --filter @lucams/db prisma db seed

# Lint
pnpm lint

# Typecheck
pnpm typecheck

# Tests unitarios
pnpm test

# Tests E2E (Playwright)
pnpm --filter web test:e2e

# Auditoría responsive en 6 perfiles de viewport (cliente público/auth/admin;
# reporte consolidado en tmp/audit-20261013/report.json — ADR-154; con
# E2E_ENV=stg E2E_AUTH=1 audita también las rutas autenticadas de STG)
pnpm --filter web test:audit-responsive

# Lighthouse local (Lighthouse CI autorun — el mismo gate del job `lighthouse` de CI)
pnpm lhci
```

### Despliegue

```bash
# Vercel despliega producción desde la rama `production` (release = fast-forward
# de `develop`; no existe `main`) y previews en cada push a `develop` / PR.
# Ver «Estrategia de ramas y releases» y «Environments» más abajo.
# OJO: `vercel deploy` CLI desde la raíz NO sirve en este monorepo (sube ~250 MB
# y revienta el límite de 100 MB de Vercel — el deploy real es vía git push;
# ver «Checklist STG» punto 7).
# Despliegue manual (excepcional):
vercel deploy --prod

# Promover preview a producción:
vercel promote <deployment-url>
# OJO (incidente 2026-10-01): tras un merge a `production`, verificar que el
# dominio lucamsshop.com quedó apuntando al deployment nuevo — Vercel puede
# dejar el deployment del merge SIN alias de dominio (el sitio sigue sirviendo
# el build anterior aunque el deploy esté Ready). Si pasa:
#   vercel promote <deployment-url>
# Prevención: revisar Settings → Domains en Vercel (asignación del dominio a
# la rama production) y/o migrar los nameservers de Cloudflare a Vercel DNS.

# Rollback:
vercel rollback <deployment-url>
```

### Supabase

```bash
# Aplicar migración SQL adicional (RLS, funciones)
supabase db push

# Conectarse a la DB
supabase db connect

# Backup manual
supabase db dump --data-only > backup-$(date +%F).sql
```

### Editar contenido CMS por script → invalidar caché

Las páginas públicas (legales, home, footer, mensajes) leen el modelo CMS v2
(`CmsPage`/`CmsSection`/`CmsField`, antes `CmsBlock`/`SiteSetting` — DEPRECATED 2026-07-30)
con `unstable_cache` tag `"cms"` (TTL 1h, `apps/web/lib/cms.ts`). Las acciones del admin lo
invalidan solas (`updateTag("cms")`), pero **un script de `packages/db/scripts` que edite
CMS directo en DB NO puede invalidarlo** (`updateTag` solo corre dentro de una Server
Action de Next — confirmado: la opción "script que dispara el tag" no es viable fuera de
un request). Después de correr cualquiera de esos scripts (`migrate-cms-v2.mjs`,
`update-delivery-copy-20260801.mjs`):

1. Entra a **`/admin/contenido`** (índice de páginas).
2. Click en **"Actualizar caché de contenido"**.

Eso llama `refreshCmsCacheAction` → `updateTag("cms")` + queda en `AdminActionLog`
(`cms.cache.refresh`). Si no se hace, el sitio sirve la versión vieja hasta 1 hora.

> **Nota (2026-09-04):** los scripts one-shot `seed-legal-content-2026-07.mjs`,
> `update-legal-ley-2439.mjs` y `fix-voseo-cms.mjs` ya se ejecutaron y se eliminaron
> (commit `c436195`); la publicación de textos legales hoy es manual vía
> `/admin/contenido` (CMS v2, campos `legal.*`).

---

## Procedimientos operativos frecuentes

### Procedimiento: Reembolso de un pedido (dinero 100% manual)

Qué hace el SISTEMA cuando reembolsas desde `/admin/pedidos/[number]` → "Reembolsar pedido…"
(requiere SUPERADMIN + MFA reciente + checkbox "el dinero ya fue devuelto"):

1. **Tú primero mueves el dinero, a mano**: Wompi → dashboard → transacción → "Devolver"
   (tarjeta/billetera), o transferencia bancaria si el pedido fue contraentrega (COD — no
   existe transacción Wompi que revertir). NO hay llamada automática a la API de Wompi:
   el sistema nunca mueve plata.
2. Con el checkbox marcado, la acción registra de forma **atómica** (una sola transacción DB):
   - `Order.status = REFUNDED` con `refundedAt/By`, motivo y monto total del pedido.
   - **Stock repuesto** de cada variante (revert del decremento del pago, idempotente).
   - **Cupón liberado** si el pedido usó uno (vuelve a estar disponible para el cliente).
   - Auditoría `order.refund` con quién confirmó el dinero.
3. **Email automático al cliente** ("Reembolso procesado — pedido \<n\>") con monto, motivo
   opcional y la nota de que la acreditación puede tardar unos días hábiles (esa espera la
   define Wompi/el banco, no nosotros).
4. Lo que el sistema **NO hace**: anular la guía Aveonline (si ya se generó, gestión manual),
   ni tocar retractos (flujo aparte: `/admin/retractos`, también con dinero manual), ni
   reembolsos parciales (siempre es por el total del pedido).

Si el email no llega, ver "Incidente: Email no llega al cliente". El registro del reembolso
NO depende del email (es best-effort): la orden ya quedó REFUNDED aunque el correo falle.

---

## Runbook de incidentes

> Los incidentes son efímeros (política de documentación): se trabajan en `tmp/` (gitignored) con descripción, impacto, root cause, mitigación y prevención; al cerrarse, la postura resultante se consolida en `SECURITY.md` o aquí y el archivo se borra.

### Incidente: Webhook de Wompi no procesó una orden

**Síntomas:** cliente pagó (recibe email de Wompi), pero `Order` sigue en `PENDING_PAYMENT`.

**Diagnóstico:**

1. Verificar `WebhookEvent` en DB: ¿se recibió el evento? Si no, el problema está en Wompi (panel de eventos).
2. Si se recibió: ver `processedAt`. Si está null, ver Vercel Logs del request `/api/wompi/webhook` para errores.
3. Verificar que la firma del webhook era válida.

**Mitigación:**

1. Validar manualmente el pago en panel Wompi.
2. Marcar `Order.status = PAID` desde admin con razón "manual_after_webhook_failure".
3. Crear envío (guía) Aveonline manualmente.
4. Notificar al cliente.

**Prevención:**

- Implementar reintentos con backoff cuando el webhook handler falle (vía `pgmq` con visibility timeout, ADR-017). (2026-09-04: pgmq nunca se adoptó — ADR-017 SUPERSEDED; si esta prevención sigue pendiente, rediseñar sobre pg_cron + pg_net).
- Job `pg_cron` cada 15 min que enqueue en `order_reconciliation` las órdenes en `PENDING_PAYMENT` con > 1h y consume los mensajes consultando Wompi por su estado real.

---

### Incidente: Stock negativo o sobreventa

**Síntomas:** dos órdenes pagaron por el mismo último item disponible.

**Diagnóstico:**

1. Ver `InventoryLog` del variant afectado en orden cronológico.
2. Verificar timing: ¿hubo dos pagos en menos de 1s?

**Mitigación:**

1. Una de las órdenes ya pagada se contacta al cliente para ofrecer:
   - Reembolso completo, o
   - Reservar para próxima reposición + cupón de compensación.
2. Marcar la orden como `CANCELLED` con razón "oversold_compensated".

**Prevención (modelo cerrado en ADR-014):**

- **Reserva de stock al pasar a `PENDING_PAYMENT`** vía tabla `StockReservation` con `expiresAt = NOW() + 15 min`.
- **Cleanup vía `pg_cron`** cada minuto: `DELETE FROM "StockReservation" WHERE "expiresAt" < NOW()` (libera la reserva).
- **Descuento real** al pasar a `PAID`: transacción atómica con `SELECT ... FOR UPDATE` sobre `ProductVariant`, registrar `InventoryLog` con `reason='ORDER_PAID'`.
- Constraint `CHECK ("stock" >= 0)` a nivel DB sobre `ProductVariant`.
- Si la reserva expiró antes del PAID y ya no hay stock: webhook handler aborta, marca orden `CANCELLED`, notifica al cliente y reembolsa vía Wompi.

---

### Incidente: Supabase pausado por inactividad (solo Free)

**Síntomas:** el sitio devuelve 500 al consultar la DB.

**Diagnóstico:** dashboard Supabase muestra el proyecto en estado "paused".

**Mitigación:**

1. Click "Restore" en el dashboard.
2. Esperar 1-2 min a que la DB esté disponible.

**Prevención:**

- Migrar a Pro antes del lanzamiento (no se pausa).
- Mientras tanto, en dev hacer al menos un deploy o consulta semanal.

---

### Incidente: Email no llega al cliente

**Síntomas:** cliente reporta no haber recibido confirmación.

**Diagnóstico:**

1. Buscar el email en panel Resend (logs de envío).
2. Si dice "delivered" → revisar SPAM del cliente; problema del MTA.
3. Si dice "bounced" → email inválido o blocklist.
4. Si no aparece → el código no llamó al SDK; revisar Vercel Logs.

**Mitigación:**

- Reenviar manualmente desde admin.
- Si el dominio está blocklisted, contactar al ISP para deslistar.

**Prevención:**

- Alertar en Resend cuando bounce rate > 5%.
- Validar email en checkout con regex + DNS MX lookup opcional.

---

### Incidente: Vercel deploy falla

**Síntomas:** PR muestra "Build failed" en Vercel.

**Diagnóstico:** Logs de build en el dashboard de Vercel.

**Mitigación:**

- Si es error de TS/lint: arreglar y hacer push.
- Si es error de instalación: verificar `package.json` y `pnpm-lock.yaml` versionados.
- Si Vercel está caído: esperar (status.vercel.com).

**Prevención:**

- CI en GitHub Actions corre antes del merge para no llegar a Vercel con errores triviales.

---

### Incidente: Pago realizado pero guía no se creó en Aveonline

**Síntomas:** orden en `PAID` sin `trackingNumber`.

**Diagnóstico:** Vercel Logs del flujo post-pago.

**Mitigación:**

1. Crear el envío manualmente desde admin (`/admin/ordenes/[id]/crear-envio`).
2. Si Aveonline está caído (verificar status), reintentar después.

**Prevención:**

- Cola `shipment_creation_retry` en `pgmq` con visibility timeout 60s y backoff implícito por reintentos del consumer. (2026-09-04: pgmq nunca se adoptó — ADR-017 SUPERSEDED; si esta prevención sigue pendiente, rediseñar sobre pg_cron + pg_net).
- Job `pg_cron` cada 15 min: detecta órdenes `PAID` sin `trackingNumber` con > 1h y las enqueue.
- Consumer idempotente: chequea `trackingNumber` antes de crear (no duplicar guías en Aveonline).

---

## Plan de monitoreo (RESUELTO 2026-09-14 — job pg_cron en Supabase STG, sin SaaS/Actions/VM)

> **Decisión (Lucy, 2026-09-13/14):** ningún monitor SaaS gratuito (UptimeRobot/BetterStack/
> Sentry) por dependencia de tiers que luego piden suscripción; ningún consumo de minutos de
> GitHub Actions; y **tampoco la VM de desarrollo** (no siempre está encendida). En su lugar,
> **job pg_cron `uptime-monitor-prd` dentro del proyecto Supabase de STG** — infraestructura
> administrada 24/7 (la misma que ya corre los crons de la app), dominio de fallo independiente
> de Vercel/PRD, $0:
>
> - **Definición versionada:** `scripts/monitor-uptime-stg.sql` (se aplica SOLO en STG, nunca
>   en PRD; no forma parte de `supabase/migrations/*` justamente para no replicarse). Como
>   pg_net es asíncrono, el job trabaja en **2 fases por corrida** (cada 10 min): colecta el
>   lote anterior y dispara el nuevo. Una falla solo cuenta si se sostiene **2+ corridas
>   seguidas** (~20 min) — las transitorias no alertan.
> - **Alerta:** con falla persistente, POST a Resend desde SQL (email a `ALERT_EMAIL`,
>   anti-spam 30 min, estado en la tabla `uptime_monitor_state` de STG). **Reporte:** cada
>   corrida hace POST a `/api/cron/monitor-heartbeat` de PRD → tile «Monitor externo
>   (Supabase STG)» en `/admin/observability` y reglas `uptime_monitor_failing` /
>   `uptime_monitor_stale` (esta última = el dead-man del propio job).
> - **Secretos en el Vault de STG** (nunca en el SQL): `monitor_prd_base_url`,
>   `monitor_resend_api_key`, `monitor_email_from`, `monitor_alert_email`,
>   `monitor_cron_secret`.
> - **Respaldo manual:** `node apps/web/scripts/uptime-monitor.mjs` (o `make uptime-monitor`)
>   sondea desde cualquier máquina con `~/.config/lucams/uptime.env` — útil si STG está
>   en mantenimiento.
>
> Cubre el ciego histórico: caída del propio sistema de alertas (dead-man de crons), caída de
> Vercel y probes reales de Wompi/Aveonline/Resend caídos. **Limitación declarada:** si el
> proyecto Supabase de STG está caído/en pausa, no hay monitor externo (los alertas in-app
> siguen) — `uptime_monitor_stale` lo delata a los 30 min. ~~Workflow GHA y monitor por VM~~:
> existieron 1 día cada uno y se retiraron (2026-09-13/14); si algún día se quiere redundancia,
> el repo es público y Actions no cobra.
>
> Complemento in-app (ya implementado en la remediación 360°): heartbeat de backups vía
> `POST /api/cron/backup-heartbeat` (lo invoca `backup.yml` al terminar; regla `backup_stale`
> si pasan >36 h sin latido) y `/api/health/crons` con los 11 jobs.
>
> **Vigilante del dominio lucamsshop.com (2026-09-19 — L-H3/L-N1 de la auditoría 360°):**
> el dominio (expira 2027-07-19) no tenía alerta de renovación ni detección de secuestro.
> Productor: **workflow `domain-watch.yml` de GitHub Actions** (**mensual: día 5, 11:23 UTC ≈
> 6:23 AM Colombia** — decisión Lucy 2026-09-20: mensual, no diario, porque el repo no será
> público siempre y en privado los minutos de GHA contarían; trade-off aceptado: umbrales de
> expiración alcanzables 60/30 días y detección de cambio de NS/status en hasta ~30 días; runners
> Azure) — la vía pg_cron+pg_net desde Supabase STG se descartó el mismo
> día: Verisign y rdap.org RECHAZAN las conexiones HTTPS salientes de pg_net (verificado en
> vivo; api.github.com sí responde desde el mismo pg_net — el bloqueo es del lado RDAP). El
> workflow consulta `https://rdap.verisign.com/com/v1/domain/lucamsshop.com` (2 intentos ×
> 20 s) y hace POST a `/api/cron/domain-watch` de PRD con `x-cron-secret` (el MISMO secret
> `CRON_SECRET` ya existente en GitHub — no hay secreto nuevo). La app
> (`features/observability/domain-watch.ts`, estado en `AlertState` keys `domain-watch:*`)
> siembra el baseline en la primera observación sin alertar y luego alerta: **expiración**
> (crítica al cruzar 60/30/14/7/3/1 días, una vez por umbral; con ≤3 días, recordatorio si
> la última alerta tiene >20 h), **cambio de nameservers o status EPP** (crítica — posible
> secuestro/suspensión ICANN, p.ej. aparece `client hold`; se alerta por CAMBIO y se
> actualiza el baseline) y **RDAP caído** (alta a la 2ª corrida seguida con `rdapOk=false`).
> El latido `cron:domain-watch` (CRON_JOBS, 24 h) lo cubre el dead-man switch: si el workflow
> deja de correr, `cron_stale_domain-watch` dispara a las 48 h. Acción humana ante alerta de
> NS/status: verificar en el registrador (mi.com.co) que el cambio sea propio; si no, rotar
> clave de la cuenta + MFA + transfer-lock y contactar soporte (posible secuestro en curso).
>
> ~~Decisión pendiente: alternativa gratuita antes del lanzamiento.~~ (Las opciones SaaS quedan
> descartadas; ADR futura solo si se necesita algo más fino que el monitor de STG.)

### Mientras tanto (Fase 0a–6)

- `console.error` con contexto en cada catch.
- Vercel Logs accesible vía dashboard.
- Cliente reporta errores manualmente vía WhatsApp / email.

---

## Backup y recuperación

### Durante desarrollo (Free)

- **Supabase Free** no tiene backups automáticos. **Crítico:** export semanal manual:
  ```bash
  supabase db dump --data-only > backups/$(date +%F).sql
  ```
- Subir a un repo privado o Drive del usuario.

### En producción (Supabase Pro)

- **PITR 7 días** automático.
- **Export adicional diario a Cloudflare R2** (ADR-059) — implementado:
  - Script: [`apps/web/scripts/backup-db-to-r2.mjs`](../apps/web/scripts/backup-db-to-r2.mjs) — `pg_dump` (plano, `--no-owner --no-privileges`) → gzip → **cifrado gpg simétrico AES256** (desde 2026-08-29, hallazgo A-3 de la auditoría 2026-08-24: el dump lleva PII — Ley 1581 — y su confidencialidad no puede depender solo del ACL del bucket) → sube a R2 (S3-compatible, `@aws-sdk/client-s3`) → poda backups viejos (conserva los últimos `BACKUP_KEEP` — default 8 en el script; el workflow fija 30 ≈ 1 mes de diarios). Llaves `db/lucams-<UTC>.sql.gz.gpg` ordenables (los `.sql.gz` legacy sin cifrar los va podando la retención y ya no entran al DR drill).
  - Workflow: [`.github/workflows/backup.yml`](../.github/workflows/backup.yml) — cron diario (07:13 UTC; era semanal — lunes 07:00 — hasta 2026-08-04) + `workflow_dispatch`. Instala `postgresql-client-17` (el server Supabase es PG17; `pg_dump` < 17 rechaza el volcado). Un job `gate` **salta limpio** si faltan los secrets (sin correos de error hasta configurar).
  - **R2 ya provisionado (opera desde 2026-07-27):** bucket `lucams-backups` + token de API R2 creados en Cloudflare y los GitHub secrets `BACKUP_DATABASE_URL` (conexión DIRECTA, no pooler), `R2_ACCOUNT_ID`, `R2_BUCKET`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY` configurados; workflow validado en corrida manual. Los `R2_*` de los `.env*` quedan como placeholder — los reales viven solo en GitHub Secrets (llenarlos solo para correr `pnpm db:backup` a mano). **`BACKUP_GPG_PASSPHRASE`** (GitHub Secret desde 2026-08-29; el valor está en el gestor de Lucy): sin ella el backup **falla a propósito** (fail-closed — un dump sin cifrar en R2 es peor que un correo de error) y el DR drill la usa para descifrar.
  - Local: `pnpm --filter web db:backup` con el entorno cargado (requiere `pg_dump` 17 y `gpg` locales + `BACKUP_GPG_PASSPHRASE`).
- **Mirror diario de Supabase Storage a R2** (hallazgo F-16, auditoría 2026-09-04) — implementado:
  - Script: [`apps/web/scripts/backup-storage-to-r2.mjs`](../apps/web/scripts/backup-storage-to-r2.mjs) — lista TODOS los objetos de cada bucket con la API de Storage (service key server-side; recorrido recursivo + paginación de a 1000), los empaqueta en `tar.gz` por bucket con un ustar mínimo propio (sin dependencias nuevas), los cifra con **gpg simétrico AES256** (misma `BACKUP_GPG_PASSPHRASE` del backup de la DB — las fotos de `customer-uploads` son PII, Ley 1581) y sube a R2 en streaming (solo el CIFRADO toca disco, en un temp 0600; la memoria no crece con el tamaño de los objetos). Snapshot COMPLETO por bucket (no incremental): a esta escala (cientos de objetos) un archivo autocontenido por bucket y día es lo más simple de verificar y restaurar. Llaves `db-storage/<bucket>/lucams-<UTC>.tar.gz.gpg`; manifiesto JSON por corrida en `db-storage/lucams-<UTC>.manifest.json` (solo conteos por bucket: objetos y bytes — NUNCA paths ni datos personales, el manifiesto va sin cifrar para que el drill elija qué verificar). Retención `BACKUP_KEEP` por bucket y para manifiestos (el workflow fija 30).
  - Buckets cubiertos (configurable vía `BACKUP_STORAGE_BUCKETS`): `customer-uploads`, `production-assets`, `design-previews`, `cms-media`, `product-images`.
  - Workflow: job `backup-storage` de [`.github/workflows/backup.yml`](../.github/workflows/backup.yml), tras el backup de la DB, con gate propio (`storage_configured`): si faltan los secrets nuevos el job se SALTA limpio sin apagar el backup de la DB.
  - Secrets `BACKUP_SUPABASE_URL` y `BACKUP_SUPABASE_SECRET_KEY`: **configurados y mirror ACTIVO** (verificado 2026-10-13, run 38418418178 con `HAS_STORAGE=true`). Si algún día falta alguno, el job se salta limpio con aviso amarillo sin apagar el backup de la DB.
  - Local: `pnpm --filter web storage:backup` (cae a `NEXT_PUBLIC_SUPABASE_URL` / `SUPABASE_SECRET_KEY` si no hay `BACKUP_SUPABASE_*`; requiere `gpg` y `BACKUP_GPG_PASSPHRASE`).
  - **Lo que el backup NO cubre:** `auth.users` sigue sin restore validado (el dump `pg_dump` la incluye como schema `auth`, pero nunca se ha ensayado re-enlazarla con GoTrue en un restore real — el drill #2 verifica solo tablas públicas). Tampoco cubre la configuración del proyecto Supabase (auth providers, políticas de Storage, Vault, edge functions): se recrean a mano desde el repo/dashboard.
- Verificar restauración cada trimestre con un environment de testing.

---

## Healthchecks

> Implementados en `apps/web/app/api/health/`.

- `GET /api/health` — liveness de la app (200 si el servidor corre; no chequea dependencias externas). Respuesta mínima `{ status, service, timestamp }` — **sin `version` ni `environment`** (auditoría 2026-08-24, C-3: el SHA exacto identifica el commit en el repo público — fingerprinting del deploy).
- `GET /api/health/db` — 200 si Postgres responde (`SELECT 1` vía Prisma).
- `GET /api/health/storage` — 200 si el bucket de Supabase Storage responde.
- `GET /api/health/resend` — 200 si la API key de Resend es válida y el dominio de `EMAIL_FROM` está verificado (no envía emails).
- `GET /api/health/aveonline` — autentica contra Aveonline y reporta qué cuenta responde (detecta la cuenta demo en `production`).
- `GET /api/health/wompi` — 200 si `GET /merchants/{publicKey}` responde OK contra el ambiente `WOMPI_ENV` (no crea transacciones). Sin `WOMPI_*` (modo catálogo) devuelve `skipped`.
- `GET /api/health/crons` — dead-man switch de los jobs pg_cron: 503 si alguno no corrió en 2× su intervalo. En público solo devuelve `{ status, timestamp }`; el detalle (jobs/overdue/disabled) exige el header `x-cron-secret` (auditoría 2026-08-24, C-4). Los jobs de `CRON_JOBS_DISABLED` se listan aparte (con secreto) y no degradan.
- `GET /api/health/all` — agrega los checks en un solo JSON: 200 si db + storage están OK (Resend/Aveonline/Wompi son no bloqueantes). `version` y `environment` **solo se incluyen con el header `x-cron-secret`** (C-3). El endpoint pensado para monitors externos.

Configurar en BetterStack (free) o UptimeRobot (free) para alertas si alguno cae > 3 min.

### Health API (para monitores externos)

Contrato de los endpoints `/api/health*` para integrar un monitor (BetterStack, UptimeRobot, etc.).
Todos devuelven el **status agregado en público** (sin auth), `force-dynamic`, con **rate-limit de 30 req/min por IP**
(429 + `Retry-After: 60` al exceder) y responden JSON con al menos `status` y `timestamp`.
**El detalle topológico queda tras el header `x-cron-secret: <CRON_SECRET>`** (auditoría 2026-08-24, C-3/C-4):
en `/api/health/crons` los jobs/overdue/disabled, y en `/api/health/all` el `version`/`environment`, solo se
devuelven con ese header (los monitores de uptime aceptan headers custom — configurarlo quedó como acción
pendiente en los monitores externos, ver STATE 2026-08-29).

| Endpoint                | Qué verifica                                                            | HTTP sano → degradado             |
| ----------------------- | ----------------------------------------------------------------------- | --------------------------------- |
| `/api/health`           | Liveness del servidor Next (sin dependencias)                           | 200 siempre (si hay proceso)      |
| `/api/health/db`        | Postgres responde (`SELECT 1` vía Prisma)                               | 200 → 500                         |
| `/api/health/storage`   | Bucket de Supabase Storage responde                                     | 200 → 500                         |
| `/api/health/resend`    | API key válida + dominio de `EMAIL_FROM` verificado                     | 200 (`ok`/`warn`/`skipped`) → 500 |
| `/api/health/aveonline` | Autentica contra Aveonline; reporta modo (`test`/`production`) y cuenta | 200 (`ok`/`warn`) → 500           |
| `/api/health/wompi`     | `GET /merchants/{publicKey}` (6s timeout); `skipped` sin `WOMPI_*`      | 200 (`ok`/`skipped`) → 503        |
| `/api/health/crons`     | Latido de los 9 jobs pg_cron (2× intervalo sin correr = overdue)        | 200 → 503                         |
| `/api/health/all`       | Agrega db + storage + resend + aveonline + wompi en un solo JSON        | 200 → 503                         |

- **Shape de `/api/health/all`:**
  `{ status, totalLatencyMs, timestamp, checks: [{ service, status, latencyMs, detail? }] }`
  (`version` y `environment` solo se agregan con `x-cron-secret`)
  con `status` global `"ok" | "degraded"` y cada check `"ok" | "warn" | "fail" | "skipped"`.
- **Pesos:** solo **postgres y storage son críticos** — si alguno reporta `fail`, `/all` responde
  **503** (`status: "degraded"`). **resend, aveonline y wompi son no bloqueantes** (`warn`/`fail`
  quedan visibles en `checks` pero el global sigue 200). `skipped` = integración no configurada
  a propósito en ese ambiente (p.ej. Wompi en modo catálogo); tampoco degrada.
- **Shape de `/api/health/crons`:** en público `{ status, timestamp }` (503 si hay jobs vencidos — alcanza
  para que el monitor alerte). Con `x-cron-secret`:
  `{ status, overdue: [{ job, lastRunAt }], disabled: [job], jobs: [{ job, overdue, disabled, lastRunAt }], timestamp }` —
  503 si `overdue` es no vacío. Los jobs de **`CRON_JOBS_DISABLED`** (comma-separado, ver
  `.env.example`) llegan con `disabled: true, overdue: false` y se listan en `disabled`: en
  ambientes con jobs desagendados a propósito (STG: los 5 crons de email, ver «Jobs HTTP pg_cron»)
  el monitor no queda en falso degraded eterno.
- **Previews con Deployment Protection:** los previews de Vercel exigen SSO → el monitor debe
  mandar el header `x-vercel-protection-bypass: <VERCEL_BYPASS_TOKEN>` (valor en `.env.stg` /
  Vercel → Settings → Deployment Protection) o recibirá la página de login (200 HTML) en vez del
  JSON. En PRD (dominio público) no hace falta.

---

## Performance budget — alertas

Cuando se rompan estos límites, abrir issue automático:

| Métrica                 | Umbral           | Acción                          |
| ----------------------- | ---------------- | ------------------------------- |
| Lighthouse Performance  | < 90             | Bloquear merge en PR            |
| Bundle JS por página    | > 250 KB gz      | Revisar imports                 |
| TTFB home (ISR)         | > 500 ms         | Investigar regresión            |
| Function execution time | > 30 s           | Revisar logs y queries          |
| DB connections          | > 80% del límite | Migrar a Pro / añadir pgBouncer |

---

## Costos — tracking mensual

> A revisar el día 1 de cada mes una vez en producción.

| Servicio       | Plan            | Costo                 | Notas                                                                                                                                                      |
| -------------- | --------------- | --------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Vercel Pro     | $20/mes         | —                     | —                                                                                                                                                          |
| Supabase Pro   | $25/mes         | —                     | —                                                                                                                                                          |
| Resend Pro     | $20/mes         | —                     | —                                                                                                                                                          |
| Gemini (IA)    | Free tier       | —                     | Proveedor elegido (ADR-058; reemplazó a Anthropic). Alerta si se sale del nivel gratuito                                                                   |
| Wompi          | Por trx         | —                     | 2.65% + $700 + IVA (plan Avanzado, frecuencia mensual). [Verificado: wompi.com/es/co/planes-tarifas a 2026-05-09](https://wompi.com/es/co/planes-tarifas/) |
| Aveonline      | Por envío       | —                     | Plan mensual + comisión COD desde 2.40% (ver `INTEGRATIONS_AVEONLINE.md` §11)                                                                              |
| Dominio        | $50.000 COP/año | —                     | mi.com.co                                                                                                                                                  |
| **Total fijo** |                 | **~$272.000 COP/mes** |                                                                                                                                                            |

---

## Contacto y escalamiento

| Tipo de incidente      | A quién avisar                                   |
| ---------------------- | ------------------------------------------------ |
| Pasarela de pago caída | Soporte Wompi (panel) + usuario                  |
| Logística caída        | Soporte Aveonline + usuario                      |
| DB caída               | Soporte Supabase + usuario                       |
| Sitio caído            | Vercel status + usuario                          |
| Pregunta del cliente   | WhatsApp del usuario (+57 320 887 3826 temporal) |

---

## DevOps — branching, releases, environments, feature flags

### Branching strategy (vigente — detalle en «Estrategia de ramas y releases (2026-07-03)» arriba)

- **`develop`** es la rama de trabajo diario: commits atómicos, push al cerrar cada tanda, CI en cada push. **No existe `main`** (decisión de Lucy).
- **`production`** es la rama en vivo: solo avanza por release (`git merge --ff-only develop`, con OK explícito de Lucy). Es la **Production Branch** de Vercel (Settings → Git).
- **Ramas de feature de largo aliento** (ej. `catalogo-whatsapp`): nacen de `develop` y vuelven con merge; `ci.yml` las vigila igual (dispara en `develop`, `production`, `catalogo-whatsapp`).
- **Rollback:** tag de restauración antes de cada cambio grande (ej. `pre-cms-v2`); el procedimiento se documenta en `docs/STATE.md` al usarlo.

### Release strategy

| Tipo           | Trigger                                        | Audiencia / DB                                                                                         |
| -------------- | ---------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| **Preview**    | Push a `develop` o rama feature                | Dev / reviewer — DB de **STG** (`lucams-stg`) desde 2026-08-01 (previews aislados: ver «Environments») |
| **Production** | Release: `production` fast-forward a `develop` | 100% del tráfico (`lucamsshop.com`)                                                                    |

- **Smoke post-release:** dos capas. (a) **Automatizada** (F-08, remediación R3 2026-09-26): `.github/workflows/post-deploy-smoke.yml` corre `apps/web/scripts/post-deploy-smoke.mjs` contra PRD — dispara al completarse el CI sobre `production` (proxy del deploy de Vercel, que se integra por Git sin workflow propio), cada 30 min vía schedule (segunda red independiente del monitor de STG) y on-demand. Sonda 5 GETs públicos read-only (`/api/health`, `/api/health/db`, `/api/health/crons`, `/`, `/productos`), exige 200 con reintentos y —desde 2026-09-27 (A11R-04, R7)— aserte contenido mínimo en `/` y `/productos` (marcadores estructurales del layout: `lang="es-CO"`, skip-link `href="#contenido"`, `<main id="contenido">`; un 200 vacío/degradado ya no sale verde) — y sale ROJO si algo no responde — un smoke rojo post-release = evaluar rollback antes de certificar. Sin secrets (todo público). Local/otro ambiente: `SMOKE_BASE_URL=https://… node apps/web/scripts/post-deploy-smoke.mjs`. (b) **Manual profunda:** `apps/web/tests/e2e/release-check-a1.spec.ts` con `PLAYWRIGHT_BASE_URL` apuntando a prod (herramienta A1 del roadmap CMS, reutilizable en cada release).
- **Versionado:** tags `vX.Y.Z` (semver) en cada release de producción significativa.
  - `X` mayor: cambios que rompen compatibilidad de schema o API público.
  - `Y` menor: features nuevas no rompedoras.
  - `Z` patch: bugfixes y mejoras menores.
- **Changelog:** `CHANGELOG.md` actualizado en cada release tag con entradas Conventional Commits agrupadas (Keep a Changelog format).

### Environments

Mapa real al 2026-08-01 (tras la separación dev/prod con Supabase local podman):

| Ambiente | Deploy / URL                                                                  | Rama git                                    | Base de datos                                                                                     |
| -------- | ----------------------------------------------------------------------------- | ------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| **DEV**  | `http://127.0.0.1:4000` (+ Studio `:54323`, Mailpit `:54324`)                 | `develop` (+ ramas feature)                 | Supabase **LOCAL** podman (`127.0.0.1:54322`) — `make db-local-*`                                 |
| **STG**  | Previews de Vercel (`lucams-shop-git-<rama>-jullieth93s-projects.vercel.app`) | `develop` y ramas feature                   | Supabase Free **`lucams-stg`** (ref `mjbdiqdkykhsixvqlrrp`, us-east-2) — **✅ creado 2026-08-01** |
| **PRD**  | `https://lucamsshop.com` (Vercel Production)                                  | `production` (release = ff desde `develop`) | Supabase nube **`lucams-prod`** (org `Lucams`, hoy tier Free)                                     |

- **Previews aislados desde 2026-08-01:** las env vars de Vercel quedaron distribuidas por ambiente (matriz abajo) — los previews ya NO tocan la DB de prod ni servicios reales. **Flip hecho (2026-08-05):** la Production Branch de Vercel ya es `production` — los push a `develop` despliegan **preview**, no producción.

#### Variables de entorno por ambiente (matriz ejecutada 2026-08-01)

- **Scope separado (valor distinto Production/Preview):** las 5 de Supabase/DB (`DATABASE_URL`, `DIRECT_URL`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SECRET_KEY` — preview → `lucams-stg`) · `CRON_SECRET` y `CSRF_SECRET` (valores nuevos en preview) · `WOMPI_ENV` + `WOMPI_PUBLIC_KEY`/`PRIVATE_KEY`/`EVENTS_SECRET`/`INTEGRITY_SECRET` (hoy sandbox en ambos scopes — al lanzar, las claves reales van SOLO en Production y preview conserva test) · `NEXT_PUBLIC_TURNSTILE_SITE_KEY`/`TURNSTILE_SECRET_KEY` (preview = claves de prueba públicas de Cloudflare — las reales están restringidas por dominio y fallarían en `*.vercel.app`) · `NEXT_PUBLIC_STORE_MODE` (`catalog` explícito en ambos al ejecutar la matriz — sin ella, preview caería al default `full` y activaría pagos/envíos; **Preview pasó a `full` el 2026-08-07** para la suite E2E modo full §7.5 — ver STATE.md — y Production debe conservar `catalog` hasta Etapa 2) · `AVEONLINE_USUARIO`/`AVEONLINE_CLAVE` (set único desde 2026-08-01: Production = cuenta real · Preview = cuenta demo pública).
- **Solo Production (el preview no las recibe):** `AVEONLINE_ENV` (modo declarado para el guard del health check — en preview default `test`, que acepta la cuenta demo) · `NEXT_PUBLIC_SITE_URL` (preview usa el `VERCEL_URL` automático del deployment — `lib/origin.ts`) · `NEXT_PUBLIC_WA_NUMBER` (preview lee `WA_NUMBER` del CMS de stg). **`RESEND_API_KEY` estaba en esta lista — el 2026-08-04 se agregó TAMBIÉN a scope Preview y los crons de stg empezaron a enviar correos reales; por eso los 5 jobs de email de stg quedaron desagendados el 2026-08-05 (ver «Jobs HTTP pg_cron»).**
- **Compartidas a propósito:** `GEMINI_API_KEY` (cuota de IA compartida), `EMAIL_FROM`/`EMAIL_REPLY_TO` (identidad de remitente — ojo: desde 2026-08-04 preview también tiene `RESEND_API_KEY`, así que stg SÍ puede enviar), `LOG_LEVEL`, `NEXT_TELEMETRY_DISABLED`, `AVEONLINE_WEBHOOK_SECRET`.
- **Alineada con `lib/env.ts`:** las CORE exigidas en todo entorno están en preview (Supabase/DB + `CSRF_SECRET`); las `PROD_REQUIRED` solo aplican a `VERCEL_ENV=production` (en preview advierten, no bloquean); las `FULL_MODE_REQUIRED` no aplican en `catalog`.

#### Homologación de ambientes (verificada 2026-08-01)

Los 3 ambientes están homologados en **catálogo y configuración**; difieren solo en datos transaccionales (cada uno genera los suyos en pruebas) y en los valores que por diseño apuntan a cada ambiente:

| Check                                                                                                                                                                                                                                                                                                                                                                                                                 | PRD | STG      | LOCAL    |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --- | -------- | -------- |
| Extensiones app (`pg_trgm`, `unaccent`, `pg_cron`, `pg_net`, `pgmq`)                                                                                                                                                                                                                                                                                                                                                  | 5   | 5        | 5        |
| Jobs pg_cron                                                                                                                                                                                                                                                                                                                                                                                                          | 10  | 5 (†)    | 10       |
| Tablas con RLS (incluye `_prisma_migrations` y `Notification`)                                                                                                                                                                                                                                                                                                                                                        | 59  | 59       | 59       |
| Buckets storage                                                                                                                                                                                                                                                                                                                                                                                                       | 5   | 5        | 5        |
| Migraciones Prisma aplicadas                                                                                                                                                                                                                                                                                                                                                                                          | 52  | 52       | 52       |
| Secretos Vault (`cron_base_url`, `cron_secret`)                                                                                                                                                                                                                                                                                                                                                                       | ✓   | ✓        | ✓        |
| Catálogo (566 productos, 526 categorías, 726 variantes, 115 ocasiones, 981 campos CMS, 130 redirects, 24 plantillas, 43 cupones reales — corregido 2026-08-07: las cifras históricas 612/572/772 incluían 46 fixtures de tests, barridos en LOCAL/STG; en PRD siguen soft-deleted e invisibles hasta limpieza autorizada — medición de la homologación 2026-08-07, auditorías históricas consolidadas fuera del repo) | ✓   | ✓ (sync) | ✓ (sync) |

**Verificado por re-medición el 2026-08-05 (homologación completa):** las 19 tablas de catálogo con conteos IDÉNTICOS en los 3 ambientes (query lado a lado); LOCAL re-sincronizado desde PRD tras los resets del 2026-08-01/02 (procedimiento del punto «Re-sincronizar» aplicado con dump fresco); RLS de `_prisma_migrations` habilitado en local; duplicado de `20260731130000_drop_cms_legacy` en `_prisma_migrations` de PRD eliminado (registro fallido con 0 pasos); fixtures de diseño para tests de personalización recreados con assets REALES en `customer-uploads` (finalize-server-render y letter-tiles pasan en local: 10/10 junto a la suite completa 2763 verde). Las diferencias restantes son INTENCIONALES (crons de email desagendados en stg, transaccional por ambiente, notificaciones por ambiente).

**Actualización 2026-08-29 (auditoría OWASP cerrada y homologada):** migraciones Supabase **025–029** aplicadas y verificadas en LOCAL/STG/PRD (drop de la función huérfana `rls_auto_enable` + su event trigger, hardening de grants de tablas y de funciones públicas — `search_path` fijo y EXECUTE acotado, policies backstop RLS endurecidas, `pg_net` convergido al schema `extensions` — la 029 lo mueve con DROP+CREATE en una transacción porque pg_net no es relocatable) y migraciones Prisma **51–52** (`20260829150200_bearer_tokens_hash_at_rest`, `20260829150300_coupon_usage_per_customer_trigger`) aplicadas en los 3 ambientes en el mismo deploy → Prisma queda en **52/52** (la fila de arriba ya lo refleja).

- **(†) Jobs pg_cron en STG = 5 a propósito (2026-08-05):** desagendados los 5 que envían email (`lucams-alerts`, `lucams-daily-summary`, `lucams-review-request`, `lucams-cart-recovery`, `lucams-back-in-stock`) — los previews recibieron `RESEND_API_KEY` el 2026-08-04 y los crons de stg empezaron a mandar correos reales. Quedan `lucams-cms-publish-scheduled`, `lucams-purge-anon-designs`, `lucams-purge-event-logs` y los 2 SQL puros. **No re-aplicar las migraciones 015/023 en stg:** re-agendan por patrón unschedule→schedule y el estado deseado es desagendados (detalle en «Jobs HTTP pg_cron» y changelog 2026-08-05). Desde la remediación R6 (2026-09-26, A9B-09) `scripts/db-stg-setup.sh` incluye un paso final idempotente (4/4) que des-agenda estos 5 jobs tras aplicar migraciones, así un re-setup de STG no los devuelve.
- **Difieren a propósito (cada valor apunta a SU ambiente):** `cron_base_url` del Vault (PRD → `https://lucamsshop.com` · STG → alias estable del preview de `develop` · LOCAL → `http://host.containers.internal:4000` — los jobs solo funcionan con el dev server arriba; sin él fallan en silencio en `cron.job_run_details`), `cron_secret` (propio por ambiente) y las URLs de DB.
- **Imágenes de producto:** el catálogo usa URLs externas (0 productos en el bucket propio hoy) → se ven igual en los 3 ambientes sin copiar archivos. Si un día se suben fotos al bucket `product-images` de prod, las URLs públicas absolutas se leen igual desde stg/local (solo lectura).
- **Re-sincronizar el catálogo PRD → STG/LOCAL** (tras cambios de catálogo en prod que se quieran ensayar): dump data-only de las 19 tablas de catálogo (`pg_dump -Fc --data-only -t …`, el de hoy quedó en `tmp/backups/catalogo-prod-20260801.dump`) → `TRUNCATE … RESTART IDENTITY CASCADE` en el destino → `pg_restore --data-only`. **Ojo:** la FK circular `CmsField↔CmsFieldVersion` obliga a soltar y recrear 3 constraints (`CmsField_publishedVersionId_fkey`, `CmsFieldVersion_fieldId_fkey`, `CmsListItem_fieldId_fkey`) — el rol `postgres` de las imágenes Supabase (cloud y local) **no es superuser** (el superuser es `supabase_admin`) y `--disable-triggers` falla con `permission denied … is a system trigger`. Terminar borrando los cupones con código de prueba.
- **DEV sí tiene rama git:** el trabajo diario es sobre `develop` en la VM; las ramas feature nacen y vuelven a `develop`. La DB local no depende de ninguna rama (espejo del esquema + seeds).
- **Supabase «main» ≠ git:** el dashboard de Supabase muestra cada proyecto en una rama interna llamada `main` (su propia rama por defecto). No tiene relación con las ramas git del repo.
- **Flip de `.env.local`:** el dev alterna local↔nube con `make db-local-on/off`. **Antes de tocar la nube** (migraciones, seeds, invalidar caché en prod) correr `make db-local-off`; al terminar, `make db-local-on`.

#### ¿Necesitamos staging?

- **Ya existe (creado 2026-08-01):** `lucams-stg` montado end-to-end con token de Management API — esquema + seeds + pg_cron + secretos Vault + env vars Preview en Vercel — y verificado con smoke (preview `stg-verify`: home/catálogo/admin 200, catálogo servido desde stg vía pooler `aws-0`, host exclusivo de ese proyecto).
- ~~⚠️ PENDIENTE: la `SUPABASE_SECRET_KEY` de `lucams-stg` es inválida~~ **RESUELTO (2026-08-02):** Lucy copió la llave real del dashboard (Settings → API Keys) a `.env.stg`; propagada a Vercel scope Preview y redeploy verificado: `/api/health/storage` = ok (antes 401/JWS en auth/PostgREST/Storage). Mismo día creado el admin `r.julliethhr@gmail.com` (SUPERADMIN) en stg vía Admin API + `seed-admin.mjs` — password aleatorio, Lucy lo restablece con "recuperar contraseña" en el preview (OTP a su Gmail real).
- **Costo: $0.** Supabase Free permite **2 proyectos activos** por org (prod + stg) y Vercel Hobby ya incluye previews. NO hace falta Vercel Pro ni Supabase Pro para tener STG.
- **Cuándo pagar (momento oportuno = abrir al público):** Vercel **Pro** (Hobby está limitado a uso no comercial — una tienda abierta al público debe migrar) y Supabase **Pro** en `lucams-prod` (backups diarios + PITR, garantía de no-pausa, recursos). `lucams-stg` puede quedarse Free.

#### Checklist STG (ejecutada 2026-08-01 — queda como referencia para rehacer o clonar el ambiente)

1. **Proyecto:** creado vía Management API (`POST /v1/projects`, org `qaomfftpzubbkhimucsi`, Free, us-east-2) con token temporal de Lucy (revocable en supabase.com/dashboard/account/tokens). Por dashboard: org `Lucams` → **New project** (misma región que prod).
2. **VM/repo:** `.env.stg` (fuera de git por `.env.*`) copiando `.env.local.nube-backup` con las 5 vars del proyecto nuevo **y ajustando los servicios a prueba**: SIN `RESEND_API_KEY` (stg no envía emails reales), SIN `AVEONLINE_USUARIO`/`AVEONLINE_CLAVE` (cae a modo test con la cuenta demo), `CRON_SECRET`/`CSRF_SECRET` **propios de stg** (los mismos valores que Vercel scope Preview y el Vault de stg — no los de prod), `NEXT_PUBLIC_STORE_MODE="catalog"`, `NEXT_PUBLIC_SITE_URL`=alias estable del preview de `develop`. **No tocar el flip** (`db-local-on/off` solo alterna local↔prod). ⚠️ **Pooler:** el host puede ser `aws-0` o `aws-1` según el clúster asignado — descubrirlo con `GET /v1/projects/{ref}/config/database/pooler` (stg quedó en `aws-0`; prod está en `aws-1`). Y la conexión directa `db.<ref>.supabase.co` es **IPv6-only** (la VM no tiene ruta IPv6) — siempre pooler.
3. **Esquema:** `make db-stg-setup` (script `scripts/db-stg-setup.sh`: extensiones → `prisma migrate deploy` → SQL de `supabase/migrations` → grants, mismo orden del Nightly; el rol `postgres` del proyecto es superuser en Supabase cloud, cubre el event trigger de la 014). Luego **habilitar pg_cron + pg_net** (`create extension if not exists pg_cron; create extension if not exists pg_net;` — en cloud vienen deshabilitadas y las migraciones con jobs se auto-omiten) y **re-aplicar las 5 migraciones con jobs (012, 015, 016, 021, 023)**: quedan los 10 jobs agendados, en paridad con prod. **(2026-08-05: tras esto hay que desagendar en stg los 5 jobs de email — el estado deseado ya no es paridad completa; ver «Jobs HTTP pg_cron» y el (†) de «Homologación».)**
4. **Seeds:** `make db-stg-seed` (catálogo + plantillas + ocasiones + CMS — 59 productos, 75 categorías, 16 ocasiones, 854 campos CMS).
5. **Secretos Vault para pg_cron** (los jobs leen `cron_base_url`/`cron_secret` del Vault en runtime): creados con los comandos del header de `scripts/db-stg-setup.sh` — `cron_base_url` = `https://lucams-shop-git-develop-jullieth93s-projects.vercel.app` (alias estable del preview de `develop`) y `cron_secret` = el MISMO valor de `CRON_SECRET` scope Preview.
6. **Vercel env vars (vía CLI/API):** la matriz completa quedó con scope por ambiente (ver «Variables de entorno por ambiente» arriba) — mecánica: la existente se acota a `["production"]` (`PATCH /v9/projects/{id}/env/{envId}`) y se crea el valor stg con `["preview"]` (`POST /v10/projects/{id}/env`, type `sensitive`). Ojo: las vars `sensitive` NO se pueden leer por API (`decrypted: false`) — los valores de preview salieron de la copia local `.env.local.nube-backup` (mismas claves test) o se generaron nuevos (`CRON_SECRET`, `CSRF_SECRET`).
7. **Verificar:** los previews tienen **Vercel Authentication** (SSO) — para el smoke automatizado generar un bypass: `PATCH /v1/projects/{id}/protection-bypass` con `{}` y usar el header `x-vercel-protection-bypass: <secret>`. Smoke ejecutado: home/`/productos`/`/admin/login` 200 + categoría «Separadores Magnéticos» servida desde stg. (`vercel deploy` CLI desde la raíz NO sirve: sube 250 MB y revienta el límite de 100 MB — el deploy debe ser vía git o `POST /v13/deployments` con `gitSource`.)
8. **Documentar:** STG ✅ en la tabla de arriba + `docs/STATE.md` al día.

### Feature flags

> Patrón obligatorio para features arriesgadas o experimentales. ADR pendiente sobre proveedor (ADR-026 a tomar).

#### Opciones a evaluar antes de Fase 5

| Proveedor                              | Tier Free                        | Pros                                                        | Contras                                        |
| -------------------------------------- | -------------------------------- | ----------------------------------------------------------- | ---------------------------------------------- |
| **Vercel Edge Config**                 | Hobby incluido                   | Integrado, edge-fast, sin red extra                         | Sin UI rica de targeting · funciones limitadas |
| **GrowthBook** (cloud Free)            | 5 ambientes, sin límite usuarios | UI completa, A/B testing nativo, gratis para nuestra escala | +1 vendor                                      |
| **Self-hosted GrowthBook en Supabase** | Sin costo extra                  | Control total, no exfiltra datos                            | Mantenimiento extra                            |
| **Tabla `FeatureFlag` en Postgres**    | Cero                             | Cero vendors, fácil                                         | Sin UI; cambios requieren SQL                  |
| **LaunchDarkly**                       | Sin Free real                    | Industria estándar                                          | Caro                                           |

**Recomendación inicial (a confirmar en ADR-026):** **GrowthBook cloud Free** + cliente JS simple. Coherente con free-tier-first y da UI de targeting.

#### Patrón de uso

```ts
// lib/feature-flags.ts
import { evaluateFlag } from "@/lib/feature-flags-client";

export async function isFeatureEnabled(flagKey: string, userId?: string): Promise<boolean> {
  return await evaluateFlag(flagKey, { userId, env: process.env.NODE_ENV });
}

// uso:
if (await isFeatureEnabled("ai-design-suggest", user?.id)) {
  // ...
}
```

#### Convenciones

- Nombres de flag en `kebab-case`: `ai-design-suggest`, `cod-payment`, `wholesale-portal`.
- Cada flag tiene un **owner**, una **fecha de activación esperada**, y una **fecha de cleanup** (cuándo se quita el flag y queda 100% on).
- Tabla de flags activos en `STATE.md` (sección "Feature flags activos") para que el operador siempre sepa qué está experimental.

---

## Disaster Recovery (DR)

### Objetivos

- **RPO (Recovery Point Objective):** ≤ 24 h. Aceptamos perder hasta 24h de datos en el peor escenario.
- **RTO (Recovery Time Objective):** ≤ 4 h. El sitio debe estar de vuelta en máximo 4h.

### Capas de defensa

| Capa                 | Mecanismo                                                                                                                                                                            | Recuperación                                                                                             |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------- |
| App (Vercel)         | Inmutable deploys + Git                                                                                                                                                              | Rollback a deployment previo: `vercel rollback <url>` (segundos)                                         |
| DB (Supabase)        | La capa real hoy es el backup diario a R2 (fila de abajo). **`lucams-prod` sigue en tier Free: sin PITR ni backups del dashboard** — PITR 7 días aplica al subir a Pro               | Con Pro: restore PITR desde dashboard (~30 min). Hoy (Free): restore desde el dump R2 (~2h)              |
| Storage (Supabase)   | Replicación interna AWS + **mirror diario cifrado a R2** (`backup-storage-to-r2.mjs`, F-16 2026-09-04); legibilidad verificada por el drill mensual `drill-storage` (`dr-drill.yml`) | Restore manual: `gpg -d` con `BACKUP_GPG_PASSPHRASE` + `tar xzf` + re-subida por la API de Storage (~2h) |
| Backup off-site (R2) | Export diario a R2, **cifrado gpg AES256 desde 2026-08-29**; restore verificado por drill automatizado mensual (`dr-drill.yml`)                                                      | Restore manual: `gpg -d` con `BACKUP_GPG_PASSPHRASE` + `psql` (~2h)                                      |
| DNS (Cloudflare)     | Configuración versionada en repo (Terraform o manual)                                                                                                                                | Recreación manual (~30 min)                                                                              |

### Procedimiento de recuperación end-to-end

```
1. ¿Qué se cayó?
   - Solo Vercel: rollback al deployment previo. ETA 5 min.
   - Solo DB: restore PITR al punto sano (requiere Supabase Pro — hoy Free). ETA 30 min.
     Sin Pro: restaurar el último dump de R2 (descifrando con gpg). ETA ~2 h.
   - Storage: restaurar desde el mirror de R2 (`gpg -d` + `tar xzf` del archivo del bucket
     + re-subir los objetos con la API de Storage y la service key). ETA 2 h.
     (Antes de 2026-09-04 no había copia off-site: solo la replicación interna de AWS.)
   - Todo: combinación de los anteriores.

2. Comunicar a clientes (status page o email masivo si los emails funcionan).

3. Activar el modo mantenimiento: NEXT_PUBLIC_MAINTENANCE_MODE=1 en Vercel
   + REDEPLOY (ver abajo — sin redeploy la variable no hace nada).

4. Ejecutar restore.

5. Verificar:
   - /api/health/* responde 200.
   - Datos críticos (Order, Customer) están consistentes vs último estado conocido.
   - Smoke tests E2E en staging o producción passed.

6. Desactivar el modo mantenimiento: borrar (o poner en 0) NEXT_PUBLIC_MAINTENANCE_MODE
   + REDEPLOY otra vez.

7. Post-mortem dentro de 48 h.
```

#### Modo mantenimiento — la variable real y por qué exige redeploy

Hasta 2026-07-24 este runbook decía `MAINTENANCE_MODE=true`: **esa variable no existe en el
código**. Quien la hubiera puesto en medio de un incidente habría creído que el sitio estaba
cerrado mientras seguía atendiendo tráfico.

|                     | Valor real                                                                              |
| ------------------- | --------------------------------------------------------------------------------------- |
| Variable            | `NEXT_PUBLIC_MAINTENANCE_MODE`                                                          |
| Valor que activa    | exactamente `1` (comparación estricta con el string `"1"`; `true` **no** sirve)         |
| Quién la lee        | [`apps/web/proxy.ts`](../apps/web/proxy.ts) — redirige todo el tráfico a `/maintenance` |
| Qué sigue accesible | `/maintenance`, `/admin/*`, `/api/health/*`, `/_next/*`                                 |

> 🔁 **Cambiar la variable en Vercel NO basta: hay que redesplegar.** Al llevar el prefijo
> `NEXT_PUBLIC_`, Next.js **reemplaza `process.env.NEXT_PUBLIC_MAINTENANCE_MODE` por su valor
> literal durante `next build`** — también en el código de servidor —, y la doc oficial es
> explícita: _"After being built, your app will no longer respond to changes to these environment
> variables"_ ([Next.js 16.2.11, `docs/01-app/02-guides/environment-variables.md`, § Bundling
> Environment Variables for the Browser](https://nextjs.org/docs/app/guides/environment-variables#bundling-environment-variables-for-the-browser),
> consultado 2026-07-24 en la copia que trae el paquete `next` del repo). El build vigente quedó
> congelado con el valor que existía cuando se compiló.
>
> Procedimiento correcto: Vercel → Settings → Environment Variables → setear/borrar la var →
> **Deployments → Redeploy** (desmarcando "Use existing Build Cache" no hace falta, pero el
> redeploy sí). Comprobación, ya con el redeploy en **Ready**:
> `curl -sI https://lucamsshop.com/ | grep -iE '^HTTP|^location'` debe mostrar un redirect hacia
> `/maintenance` al activar, y `HTTP/2 200` sin `location` al desactivar. _(La forma exacta del
> header — relativa o absoluta — no se pudo comprobar en vivo: exigiría cerrar la tienda real.
> [pendiente verificación])_
>
> ⏱️ **Consecuencia operativa:** cerrar la tienda cuesta un build completo (~2-4 min), no un
> toggle instantáneo. Si el incidente exige cortar tráfico YA, es más rápido pausar el dominio en
> Vercel o poner una regla en Cloudflare que esperar el redeploy.

### DR drills (mensual automatizado + calendario cuatrimestral)

> Mandato: probar la restauración real cada 3 meses. Sin drills, el plan de DR no existe.
> Desde 2026-08-05 el drill #2 además corre **automatizado cada mes** (ver abajo).

#### Drill #1: Restore parcial de DB desde PITR

```bash
# 1. En un proyecto Supabase de testing, restaurar un PITR de hace 24h.
# 2. Verificar que la app conecta con la DB restaurada.
# 3. Ejecutar smoke tests E2E.
# 4. Documentar tiempo total y cualquier issue encontrado.
# 5. Resultado en tmp/dr-drill-YYYY-Qx.md (efímero, gitignored).
```

#### Drill #2: Restore desde backup R2 — automatizado (2026-08-05)

El workflow [`.github/workflows/dr-drill.yml`](../.github/workflows/dr-drill.yml) corre **mensual** (día 2 a las 08:27 UTC — el backup, **diario desde 2026-08-05**, ya habrá corrido) y a demanda (`workflow_dispatch`): baja el dump más nuevo de R2 (solo llaves `.sql.gz.gpg` — los legacy sin cifrar ya no son candidatos), lo **descifra con gpg** (`BACKUP_GPG_PASSPHRASE`, el mismo secret del backup — desde 2026-08-29 los dumps viajan cifrados), lo restaura en un Postgres vacío del runner (imagen `supabase/postgres`, el mismo engine de prod) y verifica conteos de tablas clave. **Verificaciones:** run 30972179553 (2026-08-05, dump legacy sin cifrar); run **33926922592 (2026-09-04, VERDE)** — conteos restaurados **exactos** contra las filas COPY del propio dump (`Product=11/11 · Category=84/84 · OcasionTag=115/115 · CmsField=982/982 · Order=0/0 · Customer=1/1`), 60 errores SQL esperados (colisiones de schemas internos Supabase, allowlist en `dr-drill-lib.mjs`) y 0 inesperados. El run del 2026-09-02 falló por el umbral `DRILL_MIN_PRODUCTS=100` (obsoleto tras la depuración del catálogo: quedan 11 productos reales) y por un contador de errores SQL que era código muerto; la reparación del 2026-09-04 reemplazó el umbral por conteo exacto vs COPY (el umbral queda como detector de dumps vacíos, default 5) e hizo la clasificación de errores fail-closed. Un backup que no se restaura no es un backup.

Desde 2026-09-04 (F-16) el mismo workflow corre el job **`drill-storage`**: prueba de legibilidad del mirror de Supabase Storage ([`apps/web/scripts/dr-drill-storage.mjs`](../apps/web/scripts/dr-drill-storage.mjs)) — baja el manifiesto más nuevo de `db-storage/`, elige un bucket con N>0 objetos (o el forzado por `DRILL_STORAGE_BUCKET`), descarga su `lucams-<UTC>.tar.gz.gpg`, lo descifra y cuenta las entradas del tar en streaming (el plaintext jamás toca disco), y exige que conteo y bytes cuadren EXACTO con el manifiesto. No restaura nada: verifica que el archivo se puede leer, que es un tar válido y que el cifrado cuadra. Corre bajo el gate `storage_configured` (mismos secrets `BACKUP_SUPABASE_*` que activan el mirror — sin ellos se salta limpio).

> **Privacidad (PII):** el drill restaura datos reales de prod en el runner de CI. La máquina es **efímera** (GitHub la destruye al terminar el job) y los logs solo publican **conteos** y líneas `^ERROR` del restore — nunca filas. Ojo: el repo es **público**, así que los logs de Actions también lo son; que el script nunca imprima datos de filas es lo que mantiene la PII fuera.

El drill manual sigue vigente para el calendario cuatrimestral de abajo:

```bash
# 1. Bajar el último backup diario de R2 (objeto .sql.gz.gpg).
# 2. Descifrar + descomprimir (la passphrase es el secret BACKUP_GPG_PASSPHRASE):
#    gpg -d --batch --passphrase-fd 3 -o dump.sql.gz backup.sql.gz.gpg 3<<<"$BACKUP_GPG_PASSPHRASE" && gunzip dump.sql.gz
#    (o correr apps/web/scripts/dr-drill.mjs a mano con el entorno cargado — hace todo esto).
# 3. Aplicar a Supabase de testing.
# 4. Validar integridad (counts de tablas críticas, queries de cross-check).
# 5. Documentar.
```

#### Drill #3: Rollback de Vercel

```bash
# 1. Deploy intencionalmente "roto" a producción (ej. respuesta 500 forzada en /api/health).
# 2. Detectar vía monitoreo.
# 3. Rollback con `vercel rollback`.
# 4. Verificar resolución < 5 min.
# 5. Documentar.
```

### Calendario de DR drills

| Trimestre   | Drill                                                   | Responsable    |
| ----------- | ------------------------------------------------------- | -------------- |
| Mensual     | Drill #2 automatizado (`dr-drill.yml`, día 2 08:27 UTC) | GitHub Actions |
| Q1 cada año | Drill #1 (PITR DB)                                      | Operador       |
| Q2          | Drill #2 (R2 backup, manual)                            | Operador       |
| Q3          | Drill #3 (Vercel rollback)                              | Operador       |
| Q4          | Drill combinado (todos)                                 | Operador       |

---

## Verificación de tiers Free contra docs oficiales (mandato #9)

> Verificaciones ejecutadas el **2026-05-09**. Cada cifra cita fuente y fecha. Mandato #9 (CLAUDE.md) exige que toda afirmación técnica esté respaldada por doc oficial; este bloque cierra la cola que estaba pendiente en `STATE.md`.

### Vercel Hobby — [vercel.com/docs/limits](https://vercel.com/docs/limits) + [vercel.com/legal/terms](https://vercel.com/legal/terms)

| Item                   | Valor verificado                                          |
| ---------------------- | --------------------------------------------------------- |
| Function timeout       | 10 s default, **60 s máximo**                             |
| Fast Data Transfer     | 100 GB/mes                                                |
| Function invocations   | 1.000.000/mes                                             |
| Active CPU             | 4 CPU-hrs/mes                                             |
| Provisioned Memory     | 360 GB-hrs/mes                                            |
| Build minutes          | 6.000/mes (45 min máximo por deployment)                  |
| Cron Jobs              | 100 por proyecto (no usamos — ADR-017 prefiere `pg_cron`) |
| Concurrent Builds      | 1                                                         |
| Deployments por día    | 100                                                       |
| Static file uploads    | 100 MB                                                    |
| Runtime logs retention | **1 hora**                                                |
| Domains por proyecto   | 50                                                        |

> ⚠️ **Crítico — ToS uso comercial:** cita textual del [Vercel Terms](https://vercel.com/legal/terms): _"You shall only use the Services under a Hobby plan for your personal or non-commercial use."_ Hobby **no permite uso comercial**. Adicionalmente: _"We may shut down and terminate projects or deployments using the Hobby plan without notice for any reason or no reason."_
>
> **Implicación:** Lucams_shop debe migrar a Vercel Pro **antes de la primera transacción Wompi real** (no es preferencia, es obligación contractual). El upgrade ya estaba planeado en Fase 7; queda confirmado como bloqueante.

### Supabase Free — [supabase.com/pricing](https://supabase.com/pricing)

| Item                        | Valor verificado                              |
| --------------------------- | --------------------------------------------- |
| Database size               | 500 MB                                        |
| Database compute            | Shared CPU + 500 MB RAM                       |
| File storage                | 1 GB                                          |
| Monthly Active Users (Auth) | 50.000                                        |
| Edge Function invocations   | 500.000/mes                                   |
| Egress (bandwidth)          | 5 GB + 5 GB cached                            |
| **Pausa por inactividad**   | **1 semana** sin actividad → proyecto pausado |
| Active projects             | Máximo 2 por organización                     |

> **Implicación operativa:** durante dev, hacer al menos un deploy o consulta semanal para no perder horas re-activando el proyecto. Si quisiéramos un staging environment separado en Free (ADR-027 pendiente), consume 1 de los 2 proyectos disponibles — no bloqueante pero limita.

### Supabase Queues (`pgmq`) y `pg_cron` — [supabase.com/docs/guides/queues](https://supabase.com/docs/guides/queues)

| Item                         | Valor verificado                                                                                                            |
| ---------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| `pgmq` disponibilidad        | **Disponible** vía dashboard → Integrations en proyectos con Postgres ≥ 15.6.1.143. Plan Free no excluido en docs públicas. |
| `pg_cron` disponibilidad     | **Disponible** vía dashboard → Integrations en plan Free.                                                                   |
| Límites específicos por tier | **No publicados explícitamente** en docs oficiales para Free.                                                               |

> **`[pendiente verificación práctica]` (mandato #9):** confirmar al crear el proyecto Supabase real (Fase 0b) que ambos extensions activan sin errores y registrar cualquier límite que aparezca. Si fueran restringidos a planes pagos, replanteamos ADR-017 (Vercel Cron como fallback).

### Resend Free — [resend.com/pricing](https://resend.com/pricing)

| Item                | Valor verificado                                      |
| ------------------- | ----------------------------------------------------- |
| Emails por mes      | 3.000                                                 |
| Emails por día      | 100                                                   |
| Dominios custom     | 1 (verificable cuando tengamos `mail.lucamsshop.com`) |
| Retención de emails | 30 días                                               |

> **Implicación:** suficiente para dev y soft launch. 100 emails/día cubren ~30 órdenes/día con 3 emails por orden (confirmación + envío + entrega). Migrar a Pro al activar dominio propio en Fase 7 (ya planeado).

### Anthropic Claude API — [platform.claude.com/docs/en/about-claude/models/overview](https://platform.claude.com/docs/en/about-claude/models/overview)

> **Superado por ADR-058 (2026-07-13):** el asistente IA del Estudio quedó con **Gemini** (Flash-Lite, nivel gratuito), no con Anthropic. Esta tabla queda como referencia histórica de la evaluación de costos.

| Modelo                                              | Input USD/MTok | Output USD/MTok | Context     | Max output  |
| --------------------------------------------------- | -------------- | --------------- | ----------- | ----------- |
| **Claude Sonnet 4.6** (recomendado para Estudio IA) | **$3**         | **$15**         | 1M tokens   | 64k tokens  |
| Claude Haiku 4.5 (alternativa más barata)           | $1             | $5              | 200k tokens | 64k tokens  |
| Claude Opus 4.7 (más potente)                       | $5             | $25             | 1M tokens   | 128k tokens |

> **Modelo elegido:** Sonnet 4.6 (per `INTEGRATIONS.md § Claude API`). Estimación de costo por sugerencia: ~500 tokens input + ~300 tokens output = **~$0.006 USD por sugerencia única**. Con cache 24h en Postgres (ADR-016) y rate limit por usuario, 1.000 sugerencias únicas/mes ≈ **$6 USD/mes**. Manejable. Tokens "Priority Tier" disponibles para escalado futuro.
>
> (2026-09-04: el proveedor real implementado es Gemini — ADR-058; Claude nunca se integró; ANTHROPIC_* eliminadas 2026-08-01).

### Cloudflare R2 Free — [developers.cloudflare.com/r2/pricing](https://developers.cloudflare.com/r2/pricing/)

| Item                              | Valor verificado                        |
| --------------------------------- | --------------------------------------- |
| Storage                           | 10 GB-mes                               |
| Class A operations (writes/lists) | 1.000.000/mes                           |
| Class B operations (reads)        | 10.000.000/mes                          |
| **Egress**                        | **Free** (zero egress fees)             |
| Aplica solo a                     | Standard storage (no Infrequent Access) |

> **Implicación:** más que suficiente para backups diarios del proyecto durante años. Egress gratis es la ventaja clave vs S3 (donde restore implica $$$). Activo desde 2026-07-27 (backup diario + DR drill mensual).

### Cloudflare Turnstile Free — [cloudflare.com/products/turnstile](https://www.cloudflare.com/products/turnstile/) + [community.cloudflare.com](https://community.cloudflare.com/t/turnstile-1-million-verify-requests-limit/469162)

| Item                       | Valor verificado                            |
| -------------------------- | ------------------------------------------- |
| Plan                       | $0/mes                                      |
| Siteverify endpoint calls  | **1.000.000/mes por sitio**                 |
| Widgets máximos por cuenta | 20                                          |
| Aplica para                | Personal/hobby/business no-mission-critical |

> **Implicación:** suficiente para checkout + registro + cualquier formulario público en Lucams. Activar dentro de la cuenta Cloudflare en Fase 0b.

### Resumen ejecutivo de impacto en el plan

| Hallazgo                                       | Impacto en ROADMAP/decisiones                                                                                                           |
| ---------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| Vercel Hobby = sin uso comercial (ToS)         | Adelantar migración a Pro al primer pago real (ya planeado en Fase 7, ahora **confirmado como obligación contractual**, no preferencia) |
| Supabase Free se pausa a 1 semana              | Disciplina de actividad semanal durante dev. Pro antes del lanzamiento (ya planeado)                                                    |
| Supabase Free = 2 proyectos máx                | Si queremos staging Free, consume 1 de 2. No bloqueante para Fase 0b                                                                    |
| `pgmq`/`pg_cron` en Free no confirmado por doc | **Verificar en Fase 0b al crear proyecto.** Si están restringidos, ADR-017 se replantea (Vercel Cron como fallback)                     |
| Resend 100/día                                 | OK para soft launch (~30 órdenes/día)                                                                                                   |
| R2 egress gratis                               | Backups robustos sin temer costo de restore                                                                                             |
| Turnstile 1M/sitio                             | Sin preocupación de tope                                                                                                                |
| Sonnet 4.6 a $0.006/sugerencia                 | Con cache 24h, 1.000 sugerencias únicas/mes = $6 USD. Manejable. **Superado por ADR-058: el proveedor real es Gemini (free tier)**      |

---

## Lecciones operativas (vigentes)

- **Scripts de datos masivos contra Supabase remoto: correrlos con `DATABASE_URL="$DIRECT_URL"`.** Contra el pooler (pgbouncer) un script con miles de upserts secuenciales se estanca («idle in transaction», 0 progreso); con la conexión directa (5432) completa en minutos. El env-guard exige además `LUCAMS_ALLOW_DESTRUCTIVE_REMOTE=1` para PRD.
- **Mutar catálogo por SQL directo NO invalida el route cache de la app:** un archivado/reactivado por SQL deja el 404/200 viejo servido hasta el TTL o el próximo deploy. Para estados rápidos usar el admin (emite `revalidatePath`) o invalidar tras el SQL.
- **`PrismaClientInitializationError` no siempre trae `code`:** el P2024 de cold start llega sin código; todo manejo de errores Prisma que discrimine por `code` debe tener fallback por mensaje (ya implementado en el retry de `packages/db/src/index.ts`).
- **Un redeploy NO purga el Data Cache del CMS** (`revalidate: 3600`): los valores CMS publicados por script se reflejan solos en ≤1 h, o al instante con «Actualizar caché de contenido» en `/admin/contenido`.
- **El `pg_dump` local (v13) es más viejo que los servidores (PG17):** para firmas de esquema usar queries `information_schema`/`pg_catalog` vía `psql`, NO `pg_dump --schema-only` (ver § Homologación de ambientes).
- **Webhook de Resend:** la selección de eventos en el dashboard debe quedar SOLO en el grupo _emails_ — contacts/domains/suppression no traen `email_id` y la ruta responde 400 (los reintentos Svix auto-deshabilitarían el endpoint).
- **Tras un merge a `production`, verificar que `lucamsshop.com` quedó apuntando al deployment nuevo** — Vercel puede dejar el deploy del merge sin alias (el sitio sigue sirviendo el build anterior aunque esté Ready). Si pasa: `vercel promote <deployment-url>`.
- **Escaneo de errores de runtime sin depender de la DB:** `scripts/vercel-runtime-errors.sh <alias> <segundos>` (para cuando `/admin/observability` queda ciego por la misma falla de DB).
- **Estado deseado de crons en STG: los 5 jobs de email DESAGENDADOS.** Las migraciones 015/016/021/023 re-agendan por patrón unschedule→schedule: re-aplicarlas en STG devuelve los crons de email (no hacerlo salvo que se quiera eso). Las migraciones nuevas (032, 035, 041) agendan solo su propio job y son seguras en STG.
- **Diagnóstico de guías Aveonline fallidas:** `Order.shipmentLastError` (detalle del pedido) → log `shipping.aveonline.createshipment.fail` → health `/api/health/aveonline`, en ese orden.
- **Assets de medios de pago:** mantener `apps/web/public/payments/` + `lib/payment-logos.ts` a la par con `lib/payment-methods.ts` (todo método nuevo necesita su logo y su entrada en el mapper).
- **Historial operativo:** el changelog fechado se retiró de este documento (política de documentación de CLAUDE.md); la historia completa está en git (`git log -- docs/OPERATIONS.md`).
