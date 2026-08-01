# Operations — Lucams_shop

Variables de entorno consolidadas, comandos de despliegue, runbook de incidentes y plan de monitoreo. Este documento se actualiza cada vez que se agrega una integración nueva o se cambia un proceso operativo.

> **Estado actual:** la mayoría de comandos no aplican porque aún no hay código. Se completa al avanzar las fases.

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
├── .env.example          # Versionado en git, valores placeholder
├── .env.local            # Gitignored, valores reales para tu desarrollo
└── apps/web/.env.local   # (opcional) overrides específicos del Next.js
```

- **`.env.example`** se commitea siempre que se agrega/quita una variable.
- **`.env.local`** nunca se commitea (ver `.gitignore`).
- En Vercel se configuran por entorno (Production / Preview / Development) en el dashboard.

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
- **pg_cron:** instalado + job `lucams-cms-publish-scheduled` (cada 5 min,
  igual que nube — habilitado con `CREATE EXTENSION pg_cron` en el setup).

**Notas operativas:**

- `db-local-start` tras `db-local-stop`: si el CLI falla con `volume already
exists` (manejo de volúmenes distinto a docker), basta `podman volume rm
supabase_db_lucams-local supabase_storage_lucams-local` y repetir (reset
  total; re-correr `db-local-setup` + `db-local-seed`).
- El Nightly CI usa el MISMO enfoque con docker real en el runner
  (`.github/ci/localstack`) — los resultados son comparables.

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
# Una vez levantado el dev server
curl -f http://localhost:3000/api/health           # 200 si DB y app OK
curl -f http://localhost:3000/api/health/db        # 200 si Postgres responde
curl -f http://localhost:3000/api/health/integrations
# Encadenado:
curl -f http://localhost:3000/api/health && echo OK
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
(+ la `016` de purge-event-logs y la `021` de cms-publish-scheduled, roadmap C3).
Antes vivían solo como comandos manuales aquí → en un `db reset`, proyecto nuevo o DR se perdían
silenciosamente (alertas, resumen diario, palancas de ingreso, purga de retención). La migración es
GUARDADA (pg_cron + pg_net) e IDEMPOTENTE.

**Sin secreto en el SQL (mandato #12):** el comando de cada job lee en runtime la base URL y el
`CRON_SECRET` desde **Supabase Vault** (`vault.decrypted_secrets`) y manda el secreto por el header
`x-cron-secret` (no en la URL). El texto versionado solo contiene la BÚSQUEDA en el vault.

| Job                            | Schedule (UTC) | Endpoint                          | Qué hace                                                       |
| ------------------------------ | -------------- | --------------------------------- | -------------------------------------------------------------- |
| `lucams-alerts`                | `*/5 * * * *`  | `/api/cron/alerts`                | Alertas (5xx en pico, reconciliación, webhooks)                |
| `lucams-daily-summary`         | `0 13 * * *`   | `/api/cron/daily-summary`         | Resumen diario 8am Colombia                                    |
| `lucams-review-request`        | `0 17 * * *`   | `/api/cron/review-request`        | Solicitud de reseña 7–30 días post-entrega                     |
| `lucams-cart-recovery`         | `0 * * * *`    | `/api/cron/cart-recovery`         | Recordatorio de carrito abandonado (≥4h)                       |
| `lucams-back-in-stock`         | `*/30 * * * *` | `/api/cron/back-in-stock`         | "Avísame cuando vuelva"                                        |
| `lucams-purge-anon-designs`    | `0 8 * * *`    | `/api/cron/purge-anon-designs`    | Retención: purga diseños DRAFT anónimos (Ley 1581)             |
| `lucams-cms-publish-scheduled` | `*/5 * * * *`  | `/api/cron/cms-publish-scheduled` | CMS: publica versiones programadas (roadmap C3, e.g. campañas) |

**Env var:** `CRON_SECRET` (generar con `openssl rand -hex 32`) — en `.env.local` y en Vercel. Sin
ella los endpoints responden 401 (fail-closed). El destinatario de alertas/resumen sale de la setting
`ALERT_EMAIL` (default `hola@lucamsshop.com`).

**ACCIÓN HUMANA REQUERIDA (Lucy, al configurar prod — UNA sola vez):** habilitar `pg_cron` + `pg_net`
en el dashboard, y crear los 2 secretos del Vault (así el SQL versionado nunca contiene el valor):

```sql
select vault.create_secret('https://lucamsshop.com', 'cron_base_url');
select vault.create_secret('<CRON_SECRET real>',    'cron_secret');
```

Luego re-aplicar la migración 15 (agenda los 6 jobs). Para rotar el secreto: `vault.update_secret`.
Sin los secretos, los jobs quedan agendados pero fallan en runtime hasta setearlos.

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
- **Nada de credenciales** en historial de shell ni en archivos versionados.

---

## Compatibilidad local ↔ Vercel (paridad de runtime)

> Mandato #10 dice que la VM funciona como **símil-Vercel local**. Esta sección documenta la paridad entre comandos/configuración local y los que Vercel ejecuta en cada deploy.

### Matriz de paridad

| Aspecto                 | Local (VM)                                                      | Vercel                                                                                           | Estado |
| ----------------------- | --------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ | ------ |
| Versión Node            | 22.22.2 (NodeSource RPM)                                        | 22 (default Next 16)                                                                             | ✅     |
| Package manager         | pnpm 11.0.9 (vía corepack)                                      | pnpm (detectado por `pnpm-lock.yaml`)                                                            | ✅     |
| **Build command**       | `pnpm --filter web build`                                       | igual (declarado en `vercel.json`)                                                               | ✅     |
| **Install command**     | `pnpm install --frozen-lockfile`                                | igual (declarado en `vercel.json`)                                                               | ✅     |
| **Output directory**    | `apps/web/.next/`                                               | igual (declarado en `vercel.json`)                                                               | ✅     |
| **Framework detection** | Next.js auto                                                    | Forced `"nextjs"` en `vercel.json` (evita falsa detección por `package.json` root del workspace) | ✅     |
| Image optimization      | `sharp` 0.34.5 (build script aprobado en `pnpm-workspace.yaml`) | Vercel managed (mismo binary)                                                                    | ✅     |
| Edge runtime            | no usado                                                        | no usado (mantenemos `proxy.ts` con runtime nodejs)                                              | ✅     |
| Telemetry               | `NEXT_TELEMETRY_DISABLED=1` en `.env.local`                     | Idem en Vercel env vars                                                                          | ✅     |

### Gap crítico — sincronización de env vars

**Vercel NO tiene las env vars del proyecto configuradas todavía.** En local viven en `.env.local`; en Vercel hay que copiarlas a Project Settings → Environment Variables. Antes de Fase 1 con código que toque Supabase (`lib/supabase/*`, Prisma, Auth), **es bloqueante**.

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
| `develop`    | Trabajo diario + staging     | Preview deploys (o Production hasta migrar el setup) |
| `production` | Release / producción en vivo | **Production Branch objetivo**                       |

- **NO hay `main`** — la rama de producción se llama `production` (decisión de Lucy).
- **Flujo diario:** commitear en `develop` + `git push origin develop` al cerrar cada tanda (no acumular commits locales sin subir — pasó un atraso de 116).
- **Release:** con OK explícito de Lucy, `git checkout production && git merge --ff-only develop && git push` → Vercel despliega producción. `production` solo avanza en releases.
- **ACCIÓN HUMANA (Lucy):** en Vercel → Settings → Git, cambiar **Production Branch** de `develop` a `production`. Mientras siga en `develop`, cada push a develop actualiza el sitio en vivo.
- **CI (2026-07-24):** [`.github/workflows/ci.yml`](../.github/workflows/ci.yml) pasa a disparar en `develop`, `production` y `catalogo-whatsapp`. Antes apuntaba a `[develop, main]` y **`main` no existe** → `production` se desplegaba sin ningún gate (auditoría 2026-07-21, A4).

  ⚠️ **Todavía no aplica en `production`.** En un evento `push`, GitHub usa el workflow **de la rama pusheada**, y `production` conserva la config vieja hasta que este cambio se mergee hasta allá (`git show production:.github/workflows/ci.yml` sigue mostrando `[develop, main]`). Es decir: la rama productiva sigue sin gate hasta el merge.

  **ACCIÓN HUMANA (Lucy), en este orden:**
  1. Mergear `catalogo-whatsapp` → `develop` → `production` para que el workflow nuevo viaje.
  2. Conseguir **un primer run verde** en `production`. Sin esto, marcar los checks como obligatorios deja la rama sin poder mergear.
  3. Recién entonces: GitHub → Settings → Branches → branch protection de `production` → marcar los 7 jobs como _required status checks_.

### `vercel.json` del repo

Vive en el root: [`vercel.json`](../vercel.json). Es **minimal por diseño** — solo declara el `ignoreCommand`. La configuración de framework/build/install/output viene del **Root Directory** del proyecto en Vercel UI (debe estar seteado a `apps/web`).

| Campo           | Valor                                                                                                                      | Por qué                                                                                                                                                         |
| --------------- | -------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ignoreCommand` | `git diff HEAD^ HEAD --quiet -- ./apps/web ./packages ./pnpm-lock.yaml ./package.json ./pnpm-workspace.yaml ./vercel.json` | Skip deploy cuando solo cambian docs (ahorra build minutes). Se ejecuta desde la raíz del repo (no del Root Directory), por eso los paths son `./apps/web` etc. |

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

# STORE_MODE (ADR pendiente, plan de salida 2026-07-21): "catalog" = tienda
# catálogo + cotización por WhatsApp (Etapa 1, sin pagos/envíos/IA);
# "full" (default si falta) = tienda completa. En "catalog" las vars de
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
NEXT_PUBLIC_WOMPI_PUBLIC_KEY=$WOMPI_PUBLIC_KEY    # Para widget en cliente

# ─── Aveonline (Etapa 2 — requerido en prod solo en modo "full") ───
AVEONLINE_USUARIO=xxxxxxxxxxxxxx
AVEONLINE_CLAVE=xxxxxxxxxxxxxx
AVEONLINE_WEBHOOK_SECRET=xxxxxxxxxxxxxx
AVEONLINE_ENV=test                                 # test | production

# ─── Resend ───
RESEND_API_KEY=re_xxxxxxxxxxxxxx
EMAIL_FROM=Lucams_shop <onboarding@resend.dev>     # dev
# EMAIL_FROM=Lucams_shop <hola@mail.lucamsshop.com>  # prod
EMAIL_REPLY_TO=hola@mail.lucamsshop.com            # prod (respuestas de clientes)

# ─── Gemini (IA del Estudio — proveedor elegido ADR-058; modo "full" o dev) ───
GEMINI_API_KEY=xxxxxxxxxxxxxx
GEMINI_MODEL_PRIMARY=gemini-2.5-flash              # verificar nombre vigente en doc oficial
GEMINI_MODEL_FALLBACK=gemini-2.0-flash             # idem

# ─── Cloudflare Turnstile (CAPTCHA invisible en checkout y registro) ───
NEXT_PUBLIC_TURNSTILE_SITE_KEY=0x4AAAAAAAxxxxxxxxx  # Para widget en cliente
TURNSTILE_SECRET_KEY=0x4AAAAAAAxxxxxxxxx            # Server-only, validación de token

# ─── Cloudflare R2 (backups en producción) ───
R2_ACCOUNT_ID=xxxxxxxxxxxxxx
R2_ACCESS_KEY_ID=xxxxxxxxxxxxxx
R2_SECRET_ACCESS_KEY=xxxxxxxxxxxxxx
R2_BUCKET=lucams-backups

# ─── Crons (pg_cron → /api/cron/* — OBLIGATORIO en prod) ───
CRON_SECRET=GENERATE_WITH_OPENSSL_RAND_HEX_32

# ─── Misc ───
# Modo mantenimiento: "1" (y solo "1") redirige todo el tráfico público a /maintenance
# (apps/web/proxy.ts). Al ser NEXT_PUBLIC_* queda inlineada en el build → cambiarla en Vercel
# NO surte efecto sin un redeploy. Ver § Disaster Recovery.
# NEXT_PUBLIC_MAINTENANCE_MODE=1
CSRF_SECRET=GENERATE_WITH_OPENSSL_RAND_HEX_32      # firma HMAC de cookies de sesión (carrito/checkout)
NODE_ENV=development                               # development | production
LOG_LEVEL=info                                     # debug | info | warn | error
NEXT_TELEMETRY_DISABLED=1                          # Anonymous telemetry de Next.js apagada
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
| Anthropic API key       | 6 meses        | Cambio de equipo                                                                                                                |
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
pnpm test:e2e

# Lighthouse local
pnpm lighthouse
```

### Despliegue

```bash
# Vercel hace deploy automático en push a main + preview en cada PR.
# Despliegue manual:
vercel deploy --prod

# Promover preview a producción:
vercel promote <deployment-url>

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
`seed-cms.mjs`, `seed-legal-content-2026-07.mjs`, `update-legal-ley-2439.mjs`,
`remove-owner-name-legal-2026-07-22.mjs`, `update-domain-to-com.mjs`, `fix-voseo-cms.mjs`):

1. Entra a **`/admin/contenido`** (índice de páginas).
2. Click en **"Actualizar caché de contenido"**.

Eso llama `refreshCmsCacheAction` → `updateTag("cms")` + queda en `AdminActionLog`
(`cms.cache.refresh`). Si no se hace, el sitio sirve la versión vieja hasta 1 hora.

---

## Runbook de incidentes

> Cada incidente debe quedar registrado en un archivo `docs/incidents/YYYY-MM-DD-titulo.md` con: descripción, impacto, root cause, mitigación, prevención.

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

- Implementar reintentos con backoff cuando el webhook handler falle (vía `pgmq` con visibility timeout, ADR-017).
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

- Cola `shipment_creation_retry` en `pgmq` con visibility timeout 60s y backoff implícito por reintentos del consumer.
- Job `pg_cron` cada 15 min: detecta órdenes `PAID` sin `trackingNumber` con > 1h y las enqueue.
- Consumer idempotente: chequea `trackingNumber` antes de crear (no duplicar guías en Aveonline).

---

## Plan de monitoreo (TBD — Fase 7)

> **Decisión pendiente:** se evaluará una alternativa gratuita antes del lanzamiento. Opciones:
>
> 1. **Sentry Free** — 5k eventos/mes, 1 usuario. Stack traces + alertas.
> 2. **BetterStack** — logging + uptime monitor, free tier generoso.
> 3. **Highlight.io** — session replay + errores.
> 4. **Vercel Logs + alertas custom** — `error.tsx` global que postea a Resend cuando se capture un error 500.
>
> Decisión final se documenta como ADR-016 cuando se tome.

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
- **Export adicional semanal a Cloudflare R2** (ADR-059) — implementado:
  - Script: [`apps/web/scripts/backup-db-to-r2.mjs`](../apps/web/scripts/backup-db-to-r2.mjs) — `pg_dump` (plano, `--no-owner --no-privileges`) → gzip → sube a R2 (S3-compatible, `@aws-sdk/client-s3`) → poda backups viejos (conserva los últimos `BACKUP_KEEP`, default 8 ≈ 2 meses). Llaves `db/lucams-<UTC>.sql.gz` ordenables.
  - Workflow: [`.github/workflows/backup.yml`](../.github/workflows/backup.yml) — cron semanal (lunes 07:00 UTC) + `workflow_dispatch`. Instala `postgresql-client-17` (el server Supabase es PG17; `pg_dump` < 17 rechaza el volcado). Un job `gate` **salta limpio** si faltan los secrets (sin correos de error hasta configurar).
  - **ACCIÓN HUMANA (al provisionar R2):** crear el bucket `lucams-backups` + un token de API R2 en Cloudflare, y configurar los GitHub secrets `BACKUP_DATABASE_URL` (conexión DIRECTA, no pooler), `R2_ACCOUNT_ID`, `R2_BUCKET`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`. Luego disparar el workflow manualmente una vez para validar.
  - Local: `pnpm --filter web db:backup` con el entorno cargado (requiere `pg_dump` 17 local).
- Verificar restauración cada trimestre con un environment de testing.

---

## Healthchecks

> A implementar en Fase 1.

- `GET /api/health` — devuelve 200 si DB y Supabase responden.
- `GET /api/health/wompi` — verifica que Wompi responde (consulta a `/v1/merchants/[id]`).
- `GET /api/health/aveonline` — verifica que Aveonline responde.

Configurar en BetterStack (free) o UptimeRobot (free) para alertas si alguno cae > 3 min.

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
| Anthropic      | Variable        | —                     | Alerta si > $30/mes                                                                                                                                        |
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

### Branching strategy: trunk-based con PRs

- **`main`** es la rama de producción. Siempre deployable.
- **Feature branches:** `feat/<slug>`, `fix/<slug>`, `chore/<slug>`, `docs/<slug>`, `refactor/<slug>`.
- **PRs obligatorios** a `main` con:
  - Status checks pasando (typecheck, lint, unit, integration, RLS, e2e, audit, secrets).
  - Review (cuando haya equipo > 1).
  - Branch up to date con `main`.
- **Squash merge** por default (mantiene `main` con historial limpio).
- **Branch protection** en `main`: no force push, no deletes, signed commits requeridos.
- **Branches efímeros:** se eliminan tras merge.

### Release strategy: continuous deployment + canary cuando aplique

| Tipo           | Trigger                   | Audiencia                                                 |
| -------------- | ------------------------- | --------------------------------------------------------- |
| **Preview**    | Cada PR                   | Reviewer / QA manual / Lighthouse CI                      |
| **Production** | Merge a `main`            | 100% del tráfico                                          |
| **Canary**     | Manual (cuando se quiere) | 10% del tráfico vía Vercel split o feature flag (Fase 7+) |

- **Versionado:** tags `vX.Y.Z` (semver) en cada release de producción significativa.
  - `X` mayor: cambios que rompen compatibilidad de schema o API público.
  - `Y` menor: features nuevas no rompedoras.
  - `Z` patch: bugfixes y mejoras menores.
- **Changelog:** `CHANGELOG.md` actualizado en cada release tag con entradas Conventional Commits agrupadas (Keep a Changelog format).

### Environments

| Environment        | Cómo se levanta               | Usado para                            | DB                                                              |
| ------------------ | ----------------------------- | ------------------------------------- | --------------------------------------------------------------- |
| **Local (dev)**    | `pnpm dev` + `supabase start` | Desarrollo del usuario                | Supabase local en Docker                                        |
| **Vercel Preview** | Push a feature branch         | QA por PR, Lighthouse CI, smoke tests | **Supabase Free del proyecto** (mismo que prod hasta tener Pro) |
| **Production**     | Merge a `main`                | Tráfico real                          | Supabase Pro (al lanzar)                                        |

#### ¿Necesitamos staging?

- **Pre-lanzamiento (Fase 0–6):** **No.** Vercel Previews + Supabase local cubren el caso. Agregar staging multiplica costos sin beneficio claro.
- **Post-lanzamiento:** **Re-evaluar** si se introducen migraciones complejas o features que requieren validación real con datos de producción anonimizados.

> **Si se decide staging después:** ADR nuevo. Implicaría Vercel Pro + Supabase Pro extra + sync manual o automático de schema (no de datos PII).

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

| Capa                 | Mecanismo                                             | Recuperación                                                     |
| -------------------- | ----------------------------------------------------- | ---------------------------------------------------------------- |
| App (Vercel)         | Inmutable deploys + Git                               | Rollback a deployment previo: `vercel rollback <url>` (segundos) |
| DB (Supabase Pro)    | PITR 7 días + backup diario                           | Restore desde dashboard (~30 min)                                |
| Storage (Supabase)   | Replicación interna AWS                               | — (transparente)                                                 |
| Backup off-site (R2) | Export semanal a R2                                   | Restore manual desde dump SQL (~2h)                              |
| DNS (Cloudflare)     | Configuración versionada en repo (Terraform o manual) | Recreación manual (~30 min)                                      |

### Procedimiento de recuperación end-to-end

```
1. ¿Qué se cayó?
   - Solo Vercel: rollback al deployment previo. ETA 5 min.
   - Solo DB: restore PITR al punto sano. ETA 30 min.
   - Storage: depender de replicación interna o R2 backup. ETA 2 h.
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

### DR drills (cuatrimestral)

> Mandato: probar la restauración real cada 3 meses. Sin drills, el plan de DR no existe.

#### Drill #1: Restore parcial de DB desde PITR

```bash
# 1. En un proyecto Supabase de testing, restaurar un PITR de hace 24h.
# 2. Verificar que la app conecta con la DB restaurada.
# 3. Ejecutar smoke tests E2E.
# 4. Documentar tiempo total y cualquier issue encontrado.
# 5. Resultado en docs/incidents/YYYY-Qx-dr-drill.md.
```

#### Drill #2: Restore desde backup R2

```bash
# 1. Bajar el último backup semanal de R2.
# 2. Aplicar a Supabase de testing.
# 3. Validar integridad (counts de tablas críticas, queries de cross-check).
# 4. Documentar.
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

| Trimestre   | Drill                      | Responsable |
| ----------- | -------------------------- | ----------- |
| Q1 cada año | Drill #1 (PITR DB)         | Operador    |
| Q2          | Drill #2 (R2 backup)       | Operador    |
| Q3          | Drill #3 (Vercel rollback) | Operador    |
| Q4          | Drill combinado (todos)    | Operador    |

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

| Modelo                                              | Input USD/MTok | Output USD/MTok | Context     | Max output  |
| --------------------------------------------------- | -------------- | --------------- | ----------- | ----------- |
| **Claude Sonnet 4.6** (recomendado para Estudio IA) | **$3**         | **$15**         | 1M tokens   | 64k tokens  |
| Claude Haiku 4.5 (alternativa más barata)           | $1             | $5              | 200k tokens | 64k tokens  |
| Claude Opus 4.7 (más potente)                       | $5             | $25             | 1M tokens   | 128k tokens |

> **Modelo elegido:** Sonnet 4.6 (per `INTEGRATIONS.md § Claude API`). Estimación de costo por sugerencia: ~500 tokens input + ~300 tokens output = **~$0.006 USD por sugerencia única**. Con cache 24h en Postgres (ADR-016) y rate limit por usuario, 1.000 sugerencias únicas/mes ≈ **$6 USD/mes**. Manejable. Tokens "Priority Tier" disponibles para escalado futuro.

### Cloudflare R2 Free — [developers.cloudflare.com/r2/pricing](https://developers.cloudflare.com/r2/pricing/)

| Item                              | Valor verificado                        |
| --------------------------------- | --------------------------------------- |
| Storage                           | 10 GB-mes                               |
| Class A operations (writes/lists) | 1.000.000/mes                           |
| Class B operations (reads)        | 10.000.000/mes                          |
| **Egress**                        | **Free** (zero egress fees)             |
| Aplica solo a                     | Standard storage (no Infrequent Access) |

> **Implicación:** más que suficiente para backups semanales del proyecto durante años. Egress gratis es la ventaja clave vs S3 (donde restore implica $$$). Activar en Fase 0b.

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
| Sonnet 4.6 a $0.006/sugerencia                 | Con cache 24h, 1.000 sugerencias únicas/mes = $6 USD. Manejable                                                                         |

---

## Changelog operativo

> Registrar cambios en infraestructura, vars o procesos.

- **2026-05-09** — Cierre de Fase 0a. Auditoría de coherencia aplicada (21 hallazgos resueltos). 6 ADRs nuevos (014–019). Variables de entorno expandidas con Turnstile (`TURNSTILE_*`) y R2 (`R2_*`). Política de stock cerrada (reserva al `PENDING_PAYMENT` + descuento al `PAID`). Background jobs migran de Vercel Cron a `pgmq` + `pg_cron`. Rate-limit y cache se mueven a Postgres. Documento `SECURITY.md` creado como fuente única de seguridad.
- **2026-05-09** — Documento creado en Fase 0a.

> **Estado pg_cron (verificado 2026-07-18 con la key de la DB).** Los 7 jobs HTTP (`lucams-*`) quedaron **agendados y corriendo** en el proyecto Supabase de dev: se crearon los secretos `cron_base_url` (= URL ngrok fija de dev) y `cron_secret` (= `CRON_SECRET`) en el Vault, y se aplicaron las migraciones `supabase/migrations/015` + `016`. Confirmado end-to-end: el endpoint responde 200 con el header `x-cron-secret` y 401 sin él; `cron.job_run_details` + los heartbeats (`AlertState cron:*`, dead-man switch #15) muestran ejecuciones reales. **Para producción:** actualizar el secreto `cron_base_url` del Vault a `https://lucamsshop.com` cuando el dominio esté vivo (`select vault.update_secret((select id from vault.secrets where name='cron_base_url'), 'https://lucamsshop.com');`).
