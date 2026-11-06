# Manual de Operaciones, Ambientes y Disaster Recovery — Lucams Shop

> Guía operativa viva y exhaustiva de **Lucams Shop** para desarrollo diario en VM Linux, administración de ambientes (`LOCAL`, `STG`, `PRD`), variables de entorno, despliegues, homologación de datos, operación de subsistemas, recuperación ante desastres (DR) y respuesta a incidentes.
> Para el resumen ejecutivo revisa [`STATE.md`](STATE.md); para la arquitectura del sistema consulta [`ARCHITECTURE.md`](ARCHITECTURE.md); y para el detalle por proveedor externo revisa [`integrations/README.md`](integrations/README.md).

## Tabla de contenido

1. [Topología de los 3 ambientes y paridad local ↔ Vercel](#1-topología-de-los-3-ambientes-y-paridad-local--vercel)
2. [Entorno de desarrollo en VM Linux + Podman rootless](#2-entorno-de-desarrollo-en-vm-linux--podman-rootless)
3. [Matriz maestra de variables de entorno y secretos](#3-matriz-maestra-de-variables-de-entorno-y-secretos)
4. [Estrategia de ramas, flujo GitHub, CI/CD y despliegues](#4-estrategia-de-ramas-flujo-github-cicd-y-despliegues)
5. [Configuración, operación, monitoreo y reset de Staging (`lucams-stg`)](#5-configuración-operación-monitoreo-y-reset-de-staging-lucams-stg)
6. [Homologación y sincronización entre ambientes (`PRD ↔ STG ↔ LOCAL`)](#6-homologación-y-sincronización-entre-ambientes-prd--stg--local)
7. [Catálogo exhaustivo de scripts operativos (`packages/db/scripts`, `apps/web/scripts` y `scripts`)](#7-catálogo-exhaustivo-de-scripts-operativos-packagesdbscripts-appswebscripts-y-scripts)
8. [Operación de subsistemas en `/admin` y proceso físico de taller](#8-operación-de-subsistemas-en-admin-y-proceso-físico-de-taller)
9. [Disaster Recovery (DR), backups en R2, modo mantenimiento y simulacros](#9-disaster-recovery-dr-backups-en-r2-modo-mantenimiento-y-simulacros)
10. [Runbooks detallados de respuesta a incidentes](#10-runbooks-detallados-de-respuesta-a-incidentes)
11. [Verificación de límites Free/Pro contra documentación oficial, costos y escalamiento](#11-verificación-de-límites-freepro-contra-documentación-oficial-costos-y-escalamiento)
12. [Lecciones operativas vigentes](#12-lecciones-operativas-vigentes)

---

## 1. Topología de los 3 ambientes y paridad local ↔ Vercel

### 1.1 Mapa de ambientes activos

| Ambiente    | URL de aplicación                                                                                              | Rama Git asociada                                               | Base de datos y servicios Supabase                                                                           | Propósito operativo                                                                                                                                  |
| ----------- | -------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| **`LOCAL`** | `http://localhost:4000` (Studio `:54323`, Mailpit `:54324`, Kong `:54321`)                                     | `develop` y ramas cortas `feat/*`, `fix/*`, `docs/*`, `chore/*` | Stack Supabase local en **Podman rootless** (`127.0.0.1:54322`) gestionado con `make db-local-*`             | Desarrollo diario aislado, ejecución de `make check`, `make test-local`, `make test-rls` y Playwright E2E sin tocar la nube.                         |
| **`STG`**   | Previews de Vercel (`lucams-shop-git-develop-jullieth93s-projects.vercel.app` y PRs) con Vercel Authentication | `develop` y PRs abiertos                                        | Proyecto Supabase **`lucams-stg`** (`ref: mjbdiqdkykhsixvqlrrp`, `us-east-2`, pooler en clúster **`aws-0`**) | Certificación previa a lanzamiento, curaduría controlada, pruebas con pasarelas sandbox/demo y alojamiento del monitor externo `uptime-monitor-prd`. |
| **`PRD`**   | `https://lucamsshop.com` (Vercel Production Branch)                                                            | `production` _(no existe rama `main`)_                          | Proyecto Supabase **`lucams-prod`** (organización `Lucams`, pooler en clúster **`aws-1`**)                   | Tienda real abierta al público, pagos reales, logística real, backups diarios cifrados hacia Cloudflare R2 y monitoreo 24/7.                         |

### 1.2 Matriz de paridad Local (VM dedicada) ↔ Vercel

La VM Linux dedicada opera como un espejo fiel del runtime de Vercel (detalle adicional de plataforma en [`integrations/vercel.md`](integrations/vercel.md)):

| Dimensión                        | Entorno Local (VM Linux)                                | Vercel (Preview / Production)                             | Notas críticas de paridad                                                                                                                                                         |
| -------------------------------- | ------------------------------------------------------- | --------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Runtime Node.js                  | `Node.js 22.x` (`>=22.0.0`)                             | `Node.js 22.x`                                            | Definido en `package.json` (`engines`) y Vercel Settings → General.                                                                                                               |
| Gestor de paquetes               | `pnpm 11.0.9` (Corepack)                                | `pnpm 11.0.9` (`packageManager`)                          | Instalación determinista con `pnpm install --frozen-lockfile`.                                                                                                                    |
| Root Directory                   | Trabajo desde raíz con `--filter web`                   | **`apps/web`** (configurado en Vercel UI)                 | **Obligatorio en Vercel UI:** Vercel valida `next` en el `package.json` del Root Directory antes de leer `vercel.json`; sin `apps/web` falla con _"No Next.js version detected"_. |
| `vercel.json`                    | [`apps/web/vercel.json`](../apps/web/vercel.json)       | [`apps/web/vercel.json`](../apps/web/vercel.json)         | Minimalista (`{ "framework": "nextjs" }`). No existe `vercel.json` en la raíz del repositorio.                                                                                    |
| Build y salida                   | `pnpm --filter web build` → `apps/web/.next/`           | Auto-detectado sobre `apps/web` (`next build` → `.next/`) | Idéntico grafo de compilación y empaquetado de funciones serverless.                                                                                                              |
| Procesamiento nativo de imágenes | `sharp@0.35.5` (override fijo en `pnpm-workspace.yaml`) | `sharp@0.35.5` empaquetado en la lambda                   | Fijado explícitamente (`LUC-SEC-011`) y encapsulado tras `features/personalization/sharp-safe.ts`.                                                                                |
| Intercepción HTTP                | `apps/web/proxy.ts` en Node.js runtime                  | `apps/web/proxy.ts` en Node.js runtime                    | No se usa Edge Runtime en ninguna ruta ni proxy.                                                                                                                                  |
| Telemetría Next.js               | `NEXT_TELEMETRY_DISABLED=1`                             | `NEXT_TELEMETRY_DISABLED=1`                               | Desactivada en los tres entornos.                                                                                                                                                 |

---

## 2. Entorno de desarrollo en VM Linux + Podman rootless

### 2.1 Prerrequisitos globales de la máquina (instalación única)

La estación de trabajo es una VM Linux dedicada donde las herramientas base se instalan de forma global (sin entornos virtuales innecesarios y usando Podman rootless en lugar de Docker daemon con privilegios de root):

```bash
# 1. Node.js 22 LTS (vía fnm o paquete del sistema) y Corepack / pnpm 11.0.9
curl -fsSL https://fnm.vercel.app/install | bash
fnm install 22 && fnm use 22
corepack enable && corepack prepare pnpm@11.0.9 --activate

# 2. Habilitar socket de Podman rootless para el usuario actual
systemctl --user enable --now podman.socket

# 3. Herramientas CLI operativas (Vercel CLI, GitHub CLI, PostgreSQL client 17, gitleaks, k6)
pnpm add -g vercel
sudo dnf install -y gh gnupg2   # o apt equivalente según distribución
gh auth login

# 4. Activar el hook pre-commit versionado del repositorio (escaneo gitleaks sobre staged)
git config core.hooksPath scripts/git-hooks
```

El binario de Supabase CLI (`2.111.0`, fijado en paridad con CI para evitar incompatibilidades de GoTrue en versiones posteriores) reside en `tmp/bin/supabase` (gitignored y preservado por `make clean-tmp`) y opera contra el directorio `supabase-local/` (que incluye `supabase/snippets/` vacío requerido por los bind mounts de Podman).

### 2.2 Estructura de archivos `.env*` y mecánica del switch `db-local-on/off`

```text
lucams-shop/
├── apps/web/.env.example        # ÚNICA plantilla versionada en Git (con placeholders seguros; sin secretos)
├── .env.local                   # Gitignored (chmod 600) — fuente activa que leen la app y los scripts locales
├── .env.local.nube-backup       # Gitignored (chmod 600) — respaldo de credenciales cloud escrito por el flip
├── .env.stg                     # Gitignored (chmod 600) — credenciales exclusivas de `lucams-stg`
└── apps/web/.env.local          # SYMLINK → ../../.env.local (garantiza fuente única entre Next.js y scripts)
```

- **Por qué existe el symlink `apps/web/.env.local -> ../../.env.local`:** Next.js carga automáticamente archivos `.env*` desde el directorio de la aplicación (`apps/web/`), mientras los scripts de `packages/db/scripts/` y `Makefile` referencian la raíz. El enlace simbólico evita que ambos diverjan tras alternar ambientes.
- **Cómo funciona `scripts/db-local-env.sh` (`make db-local-on` / `make db-local-off`):**
  - `make db-local-on`: respalda `.env.local` en `.env.local.nube-backup` (si aún no existe respaldo previo) y reescribe en `.env.local` únicamente las 5 variables de conexión (`DATABASE_URL`, `DIRECT_URL`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SECRET_KEY`) con las llaves deterministas devueltas por `supabase status -o env`, dejando el resto del archivo intacto y sin imprimir ningún secreto por terminal.
  - `make db-local-off`: restaura `.env.local` desde `.env.local.nube-backup`. **Regla de seguridad:** si en algún momento realizas una tarea puntual contra la nube y vuelves a desarrollar, ejecuta `make db-local-on` de inmediato al terminar.

### 2.3 Stack Supabase local en Podman rootless y prohibición de `supabase stop`

El stack local levanta en contenedores rootless todos los servicios requeridos por Lucams: PostgreSQL + `pg_cron` (`:54322`), GoTrue Auth, Kong API Gateway (`:54321`), PostgREST, Storage API (con los 5 buckets y sus políticas), `pg_meta`, **Supabase Studio (`http://localhost:54323`)**, **Mailpit (`http://localhost:54324`, bandeja local donde caen los correos OTP y de prueba)** y Logflare. Excluye deliberadamente `-x imgproxy,edge-runtime,realtime`, que la aplicación no utiliza y cuya inicialización falla bajo Podman rootless.

> **Regla crítica — jamás ejecutes `supabase stop` directamente:** en Podman rootless, `supabase stop` destruye los contenedores dejando los volúmenes nombrados y el siguiente `supabase start` aborta con `volume already exists`. Usa siempre **`make db-local-stop`** (que ejecuta `podman stop` nativo preservando contenedores y datos) y **`make db-local-start`** (que detecta los `>=10` contenedores `supabase_*` y los reanuda en segundos con `podman start`). Si alguna vez el stack queda a medias (`1..9` contenedores), recupéralo limpio con **`make db-local-reset`**.

### 2.4 Referencia completa de targets del `Makefile`

Todos los targets declarados en [`Makefile`](../Makefile):

| Categoría                       | Target `make ...`          | Qué ejecuta exactamente y cuándo usarlo                                                                                                                                                                                                          |
| ------------------------------- | -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Día a día local**             | `make local-up`            | Ejecuta `db-local-start` + `web-start`: deja arriba Supabase local y Next.js dev en `http://localhost:4000`.                                                                                                                                     |
|                                 | `make local-down`          | Ejecuta `web-stop` + `db-local-stop`: detiene Next.js y apaga contenedores Podman **conservando todos los datos**.                                                                                                                               |
|                                 | `make local-status`        | Muestra `supabase status` (puertos/estado) y verifica si el PID en `tmp/pids/web-dev.pid` sigue vivo.                                                                                                                                            |
|                                 | `make web-start`           | Arranca `pnpm --filter web dev` en segundo plano (`setsid`) exportando `.env.local` (`PORT=4000`), escribiendo PID en `tmp/pids/web-dev.pid` y log en `tmp/logs/web-dev.log`.                                                                    |
|                                 | `make web-stop`            | Termina limpiamente el grupo de procesos de Next.js dev y limpia `tmp/pids/web-dev.pid`.                                                                                                                                                         |
| **BD local (Podman)**           | `make db-local-start`      | Habilita `podman.socket`; si ya existen `>=10` contenedores `supabase_*` los reanuda con `podman start`, si hay `0` los crea con `supabase start -x imgproxy,edge-runtime,realtime`.                                                             |
|                                 | `make db-local-stop`       | Detiene los contenedores `supabase_*` con `podman stop` nativo sin borrarlos.                                                                                                                                                                    |
|                                 | `make db-local-setup`      | Corre `scripts/db-local-setup.sh`: instala `pg_trgm`/`unaccent`, ejecuta `prisma migrate deploy`, aplica las 56 `supabase/migrations/*.sql` como `supabase_admin` y desactiva en local los jobs HTTP de `pg_cron`.                               |
|                                 | `make db-local-on`         | Apunta `.env.local` al stack local Podman respaldando antes `.env.local.nube-backup`.                                                                                                                                                            |
|                                 | `make db-local-off`        | Restaura `.env.local` desde `.env.local.nube-backup`.                                                                                                                                                                                            |
|                                 | `make db-local-seed`       | Siembra en orden sobre `.env.local`: catálogo canónico, plantillas, ocasiones, catálogo v2, sets de fichas, site map CMS v2, backfill de `Contact` y cinco Lifecycle Journeys en borrador.                                                       |
|                                 | `make db-local-reset`      | Destrucción y reconstrucción total local: elimina contenedores y volúmenes `supabase_*` y encadena `db-local-start` → `db-local-setup` → `db-local-on` → `db-local-seed`.                                                                        |
| **Calidad, tests y build**      | `make check`               | **Gate rápido obligatorio antes de entregar:** `pnpm format:check` + `pnpm -r typecheck` + `pnpm -r lint` + `pnpm --filter @lucams/db test` + `audit-script-guards` + `audit-content` + escaneo regex anti-voseo (`es-CO` tuteo estricto).       |
|                                 | `make verify-db`           | Corre `audit-schema-drift.mjs check` (0 deriva Prisma↔SQL) y `verify-security-posture.mjs` (5/5 invariantes RLS/grants/buckets/event trigger) contra `.env.local`.                                                                               |
|                                 | `make audit-script-guards` | Ejecuta `packages/db/scripts/lib/check-script-guards.mjs` para verificar que todo script de escritura importa `env-guard.mjs`.                                                                                                                   |
|                                 | `make audit-content`       | Ejecuta `lib/cms-sitemap-parity.test.ts` (0 diferencias AST entre claves CMS leídas en código y `cms-site-map.mjs`).                                                                                                                             |
|                                 | `make test-local`          | Corre la suite completa de Vitest de `apps/web` (`pnpm --filter web test`) contra el stack local.                                                                                                                                                |
|                                 | `make test-rls`            | Corre `rls-coverage.integration.test.ts` y `rls-matrix.integration.test.ts` contra PostgREST/GoTrue local.                                                                                                                                       |
|                                 | `make test-e2e`            | Ejecuta la suite Playwright E2E (`pnpm --filter web test:e2e`).                                                                                                                                                                                  |
|                                 | `make test-e2e-fullmode`   | Ejecuta `scripts/e2e-fullmode.sh`: levanta un servidor dedicado en `:4100` con `NEXT_PUBLIC_STORE_MODE=full` y `RESEND_API_KEY=` vacío, y corre las specs `fullmode-*`.                                                                          |
|                                 | `make test-load`           | Ejecuta el escenario de carga `tests/load/storefront-browsing.js` con `k6` contra `BASE_URL` (default `http://localhost:4000`).                                                                                                                  |
|                                 | `make build`               | Ejecuta `pnpm --filter web build`. **Convención de RAM:** en VMs con ≤4 GB de RAM libre ejecuta antes `make db-local-stop` para evitar muerte por OOM durante el empaquetado de Next.js, y vuelve a subir con `make db-local-start` al terminar. |
| **Semillas, break-glass y STG** | `make migrate-cms-v2`      | Ejecuta `migrate-cms-v2.mjs --apply` contra `.env.local` (upsert aditivo sin pisar contenido publicado).                                                                                                                                         |
|                                 | `make seed-products`       | Ejecuta `seed-catalog-canonical.mjs --apply` contra `.env.local`.                                                                                                                                                                                |
|                                 | `make seed-letter-sets`    | Ejecuta `seed-letter-sets.mjs` contra `.env.local`.                                                                                                                                                                                              |
|                                 | `make seed-admin`          | Alta o reactivación break-glass de `SUPERADMIN` (`EMAIL=correo@dominio.com make seed-admin`).                                                                                                                                                    |
|                                 | `make admin-mfa-reset`     | Borrado break-glass de factores TOTP de un administrador que perdió su teléfono (`EMAIL=correo@dominio.com make admin-mfa-reset`; exige teclear el host destino).                                                                                |
|                                 | `make db-stg-setup`        | Ejecuta `scripts/db-stg-setup.sh` contra `.env.stg` (esquema completo + desagendado idempotente de los 5 crons de email).                                                                                                                        |
|                                 | `make db-stg-seed`         | Ejecuta los 8 scripts idempotentes de semilla y backfill contra `.env.stg`, incluidos cinco Lifecycle Journeys en borrador.                                                                                                                      |
|                                 | `make stg-reset`           | Ejecuta `stg-reset-transactional.mjs` en **dry-run** contra `.env.stg` (muestra conteos sin borrar nada).                                                                                                                                        |
|                                 | `make stg-reset-apply`     | Ejecuta `stg-reset-transactional.mjs --apply` contra `.env.stg` (limpia datos de prueba conservando catálogo, CMS y `SUPERADMIN`).                                                                                                               |
| **Higiene**                     | `make clean`               | Elimina `apps/web/.next` y `apps/web/node_modules/.cache`.                                                                                                                                                                                       |
|                                 | `make clean-tmp`           | Limpia artefactos temporales de `tmp/` preservando únicamente `tmp/bin/`, `tmp/pids/` y `tmp/logs/`.                                                                                                                                             |

### 2.5 Lectura de logs locales y política de redacción

```bash
# Seguir en tiempo real el servidor Next.js levantado con `make web-start` (:4000)
tail -f tmp/logs/web-dev.log

# Inspeccionar logs de contenedores específicos de Supabase en Podman
podman ps --filter name=supabase_ --format "{{.Names}}\t{{.Status}}"
podman logs --tail 100 -f supabase_db_supabase-local
podman logs --tail 100 -f supabase_auth_supabase-local
```

> **Nota sobre puertos:** `PORT=4000` en `.env.local` es leído cuando se exporta al shell (`make web-start`); si ejecutas `pnpm --filter web dev` directamente sin exportar `PORT`, Next.js arranca en `:3000`.
> **Política estricta de logs (`apps/web/lib/logger.ts`):** salida JSON estructurada (`level`, `event`, `requestId`, `route`, `latencyMs`) con redacción obligatoria de secretos y PII (nunca se imprimen correos completos, teléfonos, direcciones ni datos de medios de pago).

### 2.6 Contrato completo de Healthchecks (`/api/health*`)

Todos los endpoints bajo `apps/web/app/api/health/` son `force-dynamic`, aplican rate limit de **30 req/min por IP** (`429` + `Retry-After: 60`) y ocultan metadatos internos de topología a menos que se envíe el header `x-cron-secret: <CRON_SECRET>` (comparación timing-safe):

| Endpoint                    | Qué verifica                                                                                                                                                                                       | Respuesta sana → degradada            | Crítico en `/all` |
| --------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------- | :---------------: |
| `GET /api/health`           | Liveness puro del proceso Next.js (`{ status, service, timestamp }`; nunca filtra SHA ni entorno en público).                                                                                      | `200`                                 |         —         |
| `GET /api/health/db`        | Consulta real `SELECT 1` a PostgreSQL mediante Prisma.                                                                                                                                             | `200` → `500`                         |      **Sí**       |
| `GET /api/health/storage`   | Acceso real a Supabase Storage.                                                                                                                                                                    | `200` → `500`                         |      **Sí**       |
| `GET /api/health/resend`    | Validez de `RESEND_API_KEY` y verificación del dominio de `EMAIL_FROM` (sin enviar correo).                                                                                                        | `200` (`ok`/`warn`/`skipped`) → `500` |        No         |
| `GET /api/health/aveonline` | Autenticación contra Aveonline y coherencia entre cuenta y `AVEONLINE_ENV`.                                                                                                                        | `200` (`ok`/`warn`) → `500`           |        No         |
| `GET /api/health/wompi`     | `GET /merchants/{publicKey}` (timeout 6 s) contra `WOMPI_ENV`; devuelve `skipped` en modo `catalog` sin llaves.                                                                                    | `200` (`ok`/`skipped`) → `503`        |        No         |
| `GET /api/health/crons`     | Dead-man switch de los **16 procesos monitoreados** (`> 2×` intervalo sin latido = `overdue`). Público: `{ status, timestamp }`; con `x-cron-secret` incluye `overdue[]`, `disabled[]` y `jobs[]`. | `200` → `503`                         |   Independiente   |
| `GET /api/health/all`       | Agregador único `{ status, totalLatencyMs, timestamp, checks[] }` (+ `version`/`environment` solo con `x-cron-secret`). Devuelve `503` **únicamente** si fallan `db` o `storage`.                  | `200` → `503`                         |     Agregador     |

Comprobación rápida local:

```bash
curl -fsS http://localhost:4000/api/health/all | jq .
curl -fsS -H "x-cron-secret: $CRON_SECRET" http://localhost:4000/api/health/crons | jq .
```

---

## 3. Matriz maestra de variables de entorno y secretos

La validación tipada vive en `apps/web/lib/env.ts` y la plantilla canónica en [`apps/web/.env.example`](../apps/web/.env.example).

### 3.1 Variables validadas por la aplicación (`apps/web/lib/env.ts`)

#### A. `CoreEnv` — Obligatorias en absolutamente todos los entornos (6 variables)

| Variable                               | Visibilidad        | Formato / Ejemplo                                      | Propósito y notas operativas                                                                        |
| -------------------------------------- | ------------------ | ------------------------------------------------------ | --------------------------------------------------------------------------------------------------- |
| `NEXT_PUBLIC_SUPABASE_URL`             | Cliente + Servidor | `https://<ref>.supabase.co` o `http://127.0.0.1:54321` | Endpoint base de Supabase Auth y Storage.                                                           |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Cliente + Servidor | `sb_publishable_...` / `eyJ...`                        | Llave pública para sesión SSR y GoTrue (PostgREST tiene 0 privilegios en `public`).                 |
| `SUPABASE_SECRET_KEY`                  | **Solo servidor**  | `sb_secret_...` / `eyJ...`                             | Llave privilegiada exclusiva para `auth.admin.*` y Storage server-side (`lib/supabase/service.ts`). |
| `DATABASE_URL`                         | **Solo servidor**  | `postgresql://...:6543/postgres?pgbouncer=true`        | Conexión principal de Prisma a través del pooler Supavisor en modo transacción.                     |
| `DIRECT_URL`                           | **Solo servidor**  | `postgresql://...:5432/postgres`                       | Conexión de sesión directa para `prisma migrate deploy`, DDL y scripts masivos.                     |
| `CSRF_SECRET`                          | **Solo servidor**  | Hex aleatorio `>=32` chars (`openssl rand -hex 32`)    | Secreto HMAC para firmado criptográfico de cookies de sesión (carrito, checkout, Live Edit).        |

#### B. `PROD_REQUIRED` — Obligatorias cuando `NODE_ENV=production` en deploy real (10 variables)

| Variable                         | Visibilidad        | Valor en `STG` (Preview)                                   | Valor en `PRD` (Production)                   | Propósito                                                                                                        |
| -------------------------------- | ------------------ | ---------------------------------------------------------- | --------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `NEXT_PUBLIC_STORE_MODE`         | Cliente + Servidor | `"full"` o `"catalog"` explícito                           | `"full"` (o `"catalog"` en Etapa 1)           | Define etapa funcional (`ADR-077`). En `production` no tiene default: si falta, aborta el arranque.              |
| `NEXT_PUBLIC_SITE_URL`           | Cliente + Servidor | _(Usa `VERCEL_URL` automático)_                            | `https://lucamsshop.com`                      | **Fuente única de URL canónica** (`lib/origin.ts`): sitemap, robots, canonicals, OpenGraph y enlaces en correos. |
| `NEXT_PUBLIC_WA_NUMBER`          | Cliente + Servidor | _(Lee `WA_NUMBER` de CMS STG)_                             | `573208873826`                                | Número oficial de WhatsApp (código de país sin `+`) para respaldo pre-CMS.                                       |
| `RESEND_API_KEY`                 | **Solo servidor**  | Llave Resend (con crons de email apagados)                 | `re_...` de producción                        | Envío HTTP transaccional hacia la API de Resend (`lib/resend.ts`).                                               |
| `EMAIL_FROM`                     | **Solo servidor**  | `Lucams Shop <hola@mail.lucamsshop.com>`                   | `Lucams Shop <hola@mail.lucamsshop.com>`      | Remitente verificado con SPF, DKIM y DMARC.                                                                      |
| `EMAIL_REPLY_TO`                 | **Solo servidor**  | `hola@lucamsshop.com`                                      | `hola@lucamsshop.com`                         | Buzón al que llegan las respuestas de clientes.                                                                  |
| `RESEND_WEBHOOK_SECRET`          | **Solo servidor**  | `whsec_...` (si aplica)                                    | `whsec_...`                                   | Verificación de firma Svix en `/api/webhooks/resend` (fail-closed en producción).                                |
| `NEXT_PUBLIC_TURNSTILE_SITE_KEY` | Cliente + Servidor | Site key de prueba Cloudflare (`1x00000000000000000000AA`) | Site key real atada a `lucamsshop.com`        | Widget anti-bot invisible en checkout, registro, soporte y B2B.                                                  |
| `TURNSTILE_SECRET_KEY`           | **Solo servidor**  | Secret key de prueba Cloudflare                            | Secret key real de Cloudflare                 | Verificación server-side contra `/turnstile/v0/siteverify`.                                                      |
| `CRON_SECRET`                    | **Solo servidor**  | Hex `>=32` propio de STG (igual en Vault STG)              | Hex `>=32` propio de PRD (igual en Vault PRD) | Autenticación timing-safe de `/api/cron/*` y detalle de `/api/health/*`.                                         |

#### C. `FULL_MODE_REQUIRED` — Exigidas adicionalmente en `production` cuando `NEXT_PUBLIC_STORE_MODE=full` (8 variables + `AVEONLINE_ENV`)

| Variable                   | Visibilidad       | `STG` (Preview)         | `PRD` (Production)      | Propósito                                                                                         |
| -------------------------- | ----------------- | ----------------------- | ----------------------- | ------------------------------------------------------------------------------------------------- |
| `WOMPI_ENV`                | **Solo servidor** | `sandbox`               | `production`            | Selecciona base URL de Wompi y bloquea mezclar llaves `pub_test_` en `production`.                |
| `WOMPI_PUBLIC_KEY`         | **Solo servidor** | `pub_test_...`          | `pub_prod_...`          | Identificador de comercio al construir el redirect hospedado _(jamás `NEXT_PUBLIC_WOMPI_*`)_.     |
| `WOMPI_PRIVATE_KEY`        | **Solo servidor** | `prv_test_...`          | `prv_prod_...`          | Consultas autenticadas server-to-server a Wompi.                                                  |
| `WOMPI_INTEGRITY_SECRET`   | **Solo servidor** | `test_integrity_...`    | `prod_integrity_...`    | Firma SHA-256 de integridad (`referencia + monto + moneda + secreto`).                            |
| `WOMPI_EVENTS_SECRET`      | **Solo servidor** | `test_events_...`       | `prod_events_...`       | Verificación de firma del webhook `/api/webhooks/wompi`.                                          |
| `AVEONLINE_USUARIO`        | **Solo servidor** | Usuario demo de pruebas | Usuario comercial real  | Autenticación contra Aveonline.                                                                   |
| `AVEONLINE_CLAVE`          | **Solo servidor** | Clave demo de pruebas   | Clave comercial real    | Contraseña API de Aveonline.                                                                      |
| `AVEONLINE_WEBHOOK_SECRET` | **Solo servidor** | Secreto de prueba       | Secreto compartido real | Autenticación de novedades entrantes en `/api/webhooks/aveonline`.                                |
| `AVEONLINE_ENV`            | **Solo servidor** | `test` (default)        | `production`            | Guard de coherencia en `/api/health/aveonline` para impedir operar con cuenta demo en producción. |

#### D. Variables opcionales de ajuste de pool, kill-switches, retención, IA y analítica

| Variable                                           | Default en código                            | Dónde se lee                                      | Comportamiento exacto                                                                                                                                                                                               |
| -------------------------------------------------- | -------------------------------------------- | ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `PRISMA_CONNECTION_LIMIT`                          | `5`                                          | `packages/db/src/index.ts`                        | Límite de conexiones por instancia serverless hacia Supavisor (evita saturar el pool en picos de concurrencia).                                                                                                     |
| `PRISMA_POOL_TIMEOUT`                              | `20` (segundos)                              | `packages/db/src/index.ts`                        | Tiempo máximo esperando conexión libre del pool antes de lanzar `P2024` (acompañado de retry automático en lecturas).                                                                                               |
| `PRISMA_LOG`                                       | Solo `error` (`warn` en dev)                 | `packages/db/src/index.ts`                        | En `"query"` habilita trazado SQL de diagnóstico local.                                                                                                                                                             |
| `EMAIL_SEND_DISABLED`                              | Ausente (`"1"` en Vitest)                    | `apps/web/lib/resend.ts`                          | Kill-switch anti-spam: cuando vale exactamente `"1"`, omite toda llamada saliente a Resend devolviendo `skipped` limpio.                                                                                            |
| `CRON_JOBS_DISABLED`                               | `""`                                         | `features/observability/cron-heartbeat.ts`        | Lista separada por comas de jobs desagendados deliberadamente (en STG: `alerts,daily-summary,review-request,cart-recovery,back-in-stock`) para que `/api/health/crons` los marque `disabled: true, overdue: false`. |
| `LIFECYCLE_DRY_RUN`                                | Ausente (`"1"` en E2E Lifecycle)             | `features/lifecycle/settings.ts`                  | En `"1"`/`"true"` registra `DRY_RUN` sin Resend ni tareas. `VERCEL_ENV=preview` lo fuerza siempre, sin override para envíos reales en STG.                                                                          |
| `NEXT_PUBLIC_MAINTENANCE_MODE`                     | Ausente                                      | `apps/web/proxy.ts`                               | Cuando vale exactamente `"1"` (comparación estricta) redirige el storefront a `/maintenance`. **Exige Redeploy en Vercel** (ver § 9.3).                                                                             |
| `PURGE_IDLE_DESIGN_AFTER_DAYS`                     | `30` (`14` en STG Vercel)                    | `features/personalization/retention-service.ts`   | Días de inactividad para purgar diseños `DRAFT` de clientes autenticados.                                                                                                                                           |
| `PURGE_IDLE_READY_AFTER_DAYS`                      | `90` (`14` en STG Vercel)                    | `features/personalization/retention-service.ts`   | Días de inactividad para purgar diseños `READY` que nunca llegaron a pedido ni cotización viva (`ADR-130`).                                                                                                         |
| `PURGE_DELIVERED_DESIGN_AFTER_DAYS`                | `90` (`14` en STG Vercel)                    | `features/personalization/retention-delivered.ts` | Días desde `Order.deliveredAt` tras los cuales se borran fotos crudas y renders 300 DPI de pedidos entregados sin posventa abierta.                                                                                 |
| `GEMINI_API_KEY`                                   | Opcional                                     | `features/ai/gemini-provider.ts`                  | Habilita sugerencias del Estudio y copiloto de soporte; sin ella degrada limpiamente (`AiUnavailableError`).                                                                                                        |
| `GEMINI_MODEL_PRIMARY` / `FALLBACK`                | `gemini-2.5-flash-lite` / `gemini-2.5-flash` | `features/ai/gemini-provider.ts`                  | Modelos REST `v1beta` primario y de respaldo automático.                                                                                                                                                            |
| `NEXT_PUBLIC_GA4_ID` / `NEXT_PUBLIC_META_PIXEL_ID` | Opcionales                                   | `components/analytics/`                           | Se inyectan **únicamente** si el usuario otorgó `COOKIES_ANALYTICS` / `COOKIES_MARKETING`.                                                                                                                          |
| `PAYMENT_PROVIDER`                                 | `"wompi"`                                    | `features/payments/provider.ts`                   | Selector del adaptador de pagos (`"wompi"` único activo).                                                                                                                                                           |
| `LOG_LEVEL` / `PORT` / `NEXT_TELEMETRY_DISABLED`   | `info` / `4000` / `1`                        | `lib/logger.ts` / `Makefile` / Next               | Nivel de detalle de logs, puerto de `make web-start` y apagado de telemetría.                                                                                                                                       |

> **Aclaración importante — constantes en código que NO son variables de entorno:**
>
> - En `apps/web/features/cart/cart-retention.ts`, los plazos `PURGE_STALE_CART_AFTER_DAYS = 60` (carritos vivos inactivos), `PURGE_EMPTY_CART_AFTER_DAYS = 7` (carritos vacíos) y `PURGE_ABANDONED_CART_AFTER_DAYS = 90` (filas de `AbandonedCart`) son **constantes TypeScript exportadas**, no leen `process.env`.
> - En `apps/web/features/personalization/retention-service.ts`, `PURGE_ANON_DESIGN_AFTER_DAYS = 7`, `PURGE_AFTER_QUOTE_CLOSED_DAYS = 90`, `PURGE_STALE_QUOTE_AFTER_DAYS = 365` y el techo no-productivo `RETENTION_NONPROD_MAX_DAYS = 14` (`capRetentionDaysNonProd`, aplicado cuando `VERCEL_ENV` existe y es distinto de `"production"` salvo override explícito por env var) también son constantes en código.
> - En `apps/web/features/checkout/billing-document.ts`, el interruptor de solicitud de factura en checkout es la constante `BILLING_DOCUMENT_ENABLED = false` (apagado mientras la operación tributaria no requiera facturación electrónica DIAN, conservando intacto el esquema y la visualización de órdenes históricas).

### 3.2 Secretos exclusivos de GitHub Actions, Cloudflare R2 y pruebas (`backup.yml` y `dr-drill.yml`)

Estos valores viven en **GitHub Actions Secrets** (solo se cargan localmente si deseas ejecutar un backup o drill manual):

| Secreto / Variable                                                       | Consumidor                                    | Propósito                                                                                                                                               |
| ------------------------------------------------------------------------ | --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `BACKUP_DATABASE_URL`                                                    | `backup.yml`, `post-deploy-smoke.yml`         | URL directa (o session mode) de `lucams-prod` para `pg_dump` PG17 y verificación de `_prisma_migrations`.                                               |
| `BACKUP_SUPABASE_URL` / `BACKUP_SUPABASE_SECRET_KEY`                     | `backup.yml` (`backup-storage`)               | Lectura server-side de los 5 buckets de Storage de `lucams-prod` para el espejo cifrado diario.                                                         |
| `R2_ACCOUNT_ID`, `R2_BUCKET`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY` | `backup.yml`, `dr-drill.yml`                  | Credenciales S3-compatibles del bucket `lucams-backups` en Cloudflare R2 (`normalizeR2AccountId` limpia URLs pegadas por error).                        |
| `BACKUP_GPG_PASSPHRASE`                                                  | `backup.yml`, `dr-drill.yml`                  | Passphrase simétrica AES-256 entregada a `gpg` por descriptor `--passphrase-fd 3` (jamás por `argv` ni variables del subproceso). Fail-closed si falta. |
| `BACKUP_PREFIX` / `BACKUP_KEEP` / `BACKUP_STORAGE_BUCKETS`               | Opcionales en scripts                         | Prefijo (`"db"` → `"db-storage"`), retención de copias (`30` en el workflow = 1 mes diario) y lista de buckets.                                         |
| `DRILL_DATABASE_URL` / `DRILL_MIN_PRODUCTS` / `DRILL_STORAGE_BUCKET`     | `dr-drill.yml`                                | Base limpia efímera del runner, umbral detector de volcados vacíos (`default 5`) y bucket objetivo del drill de Storage.                                |
| `VERCEL_BYPASS_TOKEN`                                                    | `.env.stg` / Vault STG (`cron_vercel_bypass`) | Secreto de _Protection Bypass for Automation_ de Vercel para atravesar SSO en Previews mediante el header `x-vercel-protection-bypass`.                 |

### 3.3 Política de rotación y gestión en Vercel API/CLI

| Credencial                            | Periodicidad                 | Procedimiento sin caída / notas                                                                                                                            |
| ------------------------------------- | ---------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Llaves productivas de Wompi           | Anual o ante sospecha        | Coordinar ventana corta, actualizar en Vercel Production y redesplegar.                                                                                    |
| `SUPABASE_SECRET_KEY` (`sb_secret_*`) | Anual o ad-hoc               | Las llaves `sb_secret_*` permiten múltiples llaves activas simultáneas: crear nueva → actualizar Vercel + GitHub Secrets → redesplegar → revocar anterior. |
| `RESEND_API_KEY` / `AVEONLINE_*`      | Anual o ante sospecha        | Emitir nueva credencial en el proveedor, actualizar en Vercel (y Vault STG si aplica al monitor) y revocar la previa.                                      |
| `GEMINI_API_KEY`                      | Semestral o cambio de equipo | Rotar en Google AI Studio y actualizar en Vercel.                                                                                                          |
| `CRON_SECRET`                         | Anual o ante sospecha        | Actualizar simultáneamente en Vercel, GitHub Secrets y `vault.update_secret` en Supabase.                                                                  |

- **Variables `sensitive` en Vercel API:** una vez creadas como `sensitive`, la API de Vercel devuelve `decrypted: false` y jamás permite releer su valor en claro; la fuente de verdad humana es el gestor de contraseñas de la propietaria.
- **Por qué no usar `vercel deploy` desde la raíz del monorepo:** el CLI empaqueta el árbol local completo (>250 MB con workspaces/activos) y choca contra el límite de subida de 100 MB de Vercel. Todo despliegue debe entrar por **Git push / PR** (o excepcionalmente vía API `POST /v13/deployments` con `gitSource`).

---

## 4. Estrategia de ramas, flujo GitHub, CI/CD y despliegues

### 4.1 Ramas protegidas y ruleset `protect-ramas-criticas`

En el repositorio sólo existen **dos ramas permanentes**: **`develop`** (integración y STG) y **`production`** (tienda en vivo; **no existe `main`**). Ambas están blindadas por el ruleset de GitHub `protect-ramas-criticas` (`id: 26248226`, `ADR-105`):

- `bypass_actors: []` (ni siquiera los administradores del repositorio pueden hacer push directo, `force-push` ni eliminar ramas).
- Exige Pull Request con rama estrictamente actualizada respecto a la base (`strict: true`).
- Exige en verde los **5 status checks obligatorios**:
  1. `Gitleaks secret scan`
  2. `Typecheck + Lint + Build` (incluye `prettier --check`, `pnpm audit --prod`, `audit-script-guards`, `audit-content` y filtro anti-voseo)
  3. `Vitest tests (unit + integración con Postgres)` (incluye `audit-schema-drift.mjs`)
  4. `RLS behavior (rls-matrix contra Supabase local)`
  5. `E2E + a11y + Lighthouse — Playwright`

### 4.2 Los 6 workflows de GitHub Actions

Todos los workflows en [`.github/workflows/`](../.github/workflows/) fijan acciones de terceros por SHA completo y declaran `permissions: contents: read`:

| Workflow                | Disparador (`on`)                                                                                       | Qué ejecuta                                                                                                                                                                                                           |
| ----------------------- | ------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ci.yml`                | `pull_request` (`develop`, `production`) + `workflow_dispatch` _(sin `push` para no duplicar corridas)_ | Detector fail-closed `changes` (fast-path ~30–50 s para cambios exclusivos de `docs/**`, `README.md`, `CLAUDE.md`, `AGENTS.md`; `packages/db/legal-content/*.md` corre siempre CI completo) + los 5 gates requeridos. |
| `post-deploy-smoke.yml` | `deployment_status` nativo de Vercel (`Production` + `success`) + `workflow_dispatch`                   | Hace checkout explícito de `ref: production`, sondea `/api/health`, `/api/health/db`, `/api/health/crons`, `/` y `/productos`, y verifica 0 migraciones pendientes en `_prisma_migrations` de PRD.                    |
| `nightly-full.yml`      | `schedule` diario `06:00 UTC` (con guarda de actividad de 24 h) + `workflow_dispatch`                   | Levanta el stack Supabase completo en Docker para las 6 suites Vitest de GoTrue/Storage/Wompi, las 8 specs E2E de Auth/MFA/Admin/CMS y el smoke Firefox/WebKit.                                                       |
| `backup.yml`            | `schedule` diario `07:13 UTC` + `workflow_dispatch`                                                     | Ejecuta `pg_dump` PG17 + espejo de los 5 buckets de Storage cifrados con GPG AES-256 hacia Cloudflare R2 y reporta latido a `POST /api/cron/backup-heartbeat`.                                                        |
| `dr-drill.yml`          | `schedule` mensual `27 8 2 * *` (día 2, `08:27 UTC`) + `workflow_dispatch`                              | Descifra y restaura el backup más reciente de R2 en `supabase/postgres`, cuadra conteos exactos contra las sentencias `COPY` y verifica en streaming el espejo de Storage (`drill-storage`).                          |
| `domain-watch.yml`      | `schedule` mensual `23 11 5 * *` (día 5, `11:23 UTC`) + `workflow_dispatch`                             | Consulta RDAP de Verisign sobre `lucamsshop.com` y envía el resultado a `POST /api/cron/domain-watch`.                                                                                                                |

### 4.3 Flujo paso a paso de promoción y orden de migraciones

1. **Desarrollo en rama corta:** crea tu rama desde `origin/develop` (`git checkout -b feat/mi-cambio origin/develop`), valida localmente con `make check && pnpm test` (+ `make build` si tocas rutas o configuración de Next.js) y abre PR hacia `develop`.
2. **Aterrizaje en `develop` (STG):** una vez verde el PR, haz merge (`gh pr merge --merge --delete-branch`). Si el cambio incluye migraciones o semillas:
   - Ejecuta `make db-stg-setup` (o `prisma migrate deploy` + migración SQL puntual contra `.env.stg`).
   - Si agregaste campos en `cms-site-map.mjs`, corre `cd packages/db && npx dotenv -e ../../.env.stg -- node scripts/migrate-cms-v2.mjs --apply` e invalida caché en `/admin/contenido` del Preview.
3. **Promoción a `production` (PRD — requiere autorización explícita):**
   - Abre PR `develop → production` (`gh pr create --base production --head develop`) y espera los 5 checks en verde.
   - **Orden crítico de migraciones respecto al deploy de código:**
     - **Migraciones aditivas de tablas/columnas/RLS (`expand-then-contract`):** aplícalas contra PRD **antes** o inmediatamente al fusionar (`cd packages/db && npx dotenv -e ../../.env.local.nube-backup -- pnpm exec prisma migrate deploy` y `psql "$DIRECT_URL" -v ON_ERROR_STOP=1 -f supabase/migrations/<nueva>.sql`), porque el build de Vercel **no** ejecuta `migrate deploy`.
     - **Migraciones SQL que agendan un job HTTP `pg_cron` hacia un endpoint `/api/cron/*` nuevo (ej. `041`, `044`):** aplícalas **inmediatamente después** de que el deploy de Vercel esté en `Ready`, para evitar que `pg_cron` golpee una ruta que aún responde `404`.
   - Fusiona el PR, confirma que `post-deploy-smoke.yml` termine en verde y **verifica siempre que el dominio `lucamsshop.com` haya actualizado su alias al nuevo deployment** (si Vercel deja el deploy `Ready` sin reasignar el alias, ejecuta `vercel promote <deployment-url>`).

---

## 5. Configuración, operación, monitoreo y reset de Staging (`lucams-stg`)

### 5.1 Particularidades de red y pooler en Supabase Cloud

- **Clúster de Supavisor (`aws-0` vs `aws-1`):** cada proyecto Supabase reside en un clúster regional específico (`lucams-stg` está en `aws-0-us-east-2.pooler.supabase.com`, mientras `lucams-prod` opera en `aws-1`). Si alguna vez recreas un proyecto, consulta el host exacto en _Project Settings → Database → Connection string_ o vía Management API (`GET /v1/projects/{ref}/config/database/pooler`). Un clúster equivocado responde `Tenant or user not found`.
- **Host directo IPv6-only:** el host directo `db.<ref>.supabase.co:5432` en Supabase resuelve únicamente registros `AAAA` (IPv6). Desde máquinas o redes solo IPv4 (como esta VM), tanto `DATABASE_URL` (`:6543?pgbouncer=true`, transaction mode) como `DIRECT_URL` (`:5432`, session mode) deben usar el hostname del **Supavisor pooler** (`aws-0-...pooler.supabase.com`), que sí expone IPv4.

### 5.2 Setup inicial, semillas y secretos en Supabase Vault

Para inicializar o poner al día `lucams-stg` desde la VM (con `.env.stg` configurado):

```bash
make db-stg-setup   # Extensiones + Prisma migrations + 56 SQL migrations + desagendado idempotente de los 5 crons de email
make db-stg-seed    # Catálogo + plantillas + ocasiones + catálogo v2 + sets de letras + CMS v2 + Contact backfill + Lifecycle en borrador
```

Secretos requeridos en `supabase_vault` (ejecutados una sola vez en el SQL Editor del proyecto correspondiente; jamás se versionan valores reales en archivos `.sql`):

```sql
-- 1. En PRD (`lucams-prod`):
SELECT vault.create_secret('https://lucamsshop.com', 'cron_base_url');
SELECT vault.create_secret('<CRON_SECRET_PRD>',      'cron_secret');

-- 2. En STG (`lucams-stg`): incluye el bypass de Vercel Authentication para atravesar SSO
SELECT vault.create_secret('https://lucams-shop-git-develop-jullieth93s-projects.vercel.app', 'cron_base_url');
SELECT vault.create_secret('<CRON_SECRET_STG>',      'cron_secret');
SELECT vault.create_secret('<VERCEL_BYPASS_TOKEN>',  'cron_vercel_bypass');

-- 3. Exclusivo en STG para el monitor externo 24/7 hacia PRD (`scripts/monitor-uptime-stg.sql`):
SELECT vault.create_secret('https://lucamsshop.com',                    'monitor_prd_base_url');
SELECT vault.create_secret('<RESEND_API_KEY>',                          'monitor_resend_api_key');
SELECT vault.create_secret('Lucams Shop <hola@mail.lucamsshop.com>',    'monitor_email_from');
SELECT vault.create_secret('hola@lucamsshop.com',                       'monitor_alert_email');
SELECT vault.create_secret('<CRON_SECRET_PRD>',                         'monitor_cron_secret');
```

Para rotar cualquiera de estos valores en el futuro usa `SELECT vault.update_secret('<id-del-secreto>', '<nuevo-valor>');`.

### 5.3 Postura de los jobs `pg_cron` por ambiente y monitor externo en STG

| Job en `cron.job`                    | Expresión UTC        | Tipo / Destino                                                  |   `PRD`   |      `STG`      |  `LOCAL`  |
| ------------------------------------ | -------------------- | --------------------------------------------------------------- | :-------: | :-------------: | :-------: |
| `lucams-alerts`                      | `*/5 * * * *`        | HTTP `/api/cron/alerts` (emite email)                           |  Activo   | **Desagendado** | Inactivo  |
| `lucams-daily-summary`               | `0 13 * * *`         | HTTP `/api/cron/daily-summary` (emite email)                    |  Activo   | **Desagendado** | Inactivo  |
| `lucams-review-request`              | `0 17 * * *`         | HTTP `/api/cron/review-request` (emite email)                   |  Activo   | **Desagendado** | Inactivo  |
| `lucams-cart-recovery`               | `0 * * * *`          | HTTP `/api/cron/cart-recovery` (emite email)                    |  Activo   | **Desagendado** | Inactivo  |
| `lucams-back-in-stock`               | `*/30 * * * *`       | HTTP `/api/cron/back-in-stock` (emite email)                    |  Activo   | **Desagendado** | Inactivo  |
| `lucams-cms-publish-scheduled`       | `*/5 * * * *`        | HTTP `/api/cron/cms-publish-scheduled` (con idle-skip SQL)      |  Activo   |     Activo      | Inactivo  |
| `lucams-process-render-jobs`         | `* * * * *`          | HTTP `/api/cron/process-render-jobs` (con idle-skip SQL)        |  Activo   |     Activo      | Inactivo  |
| `lucams-expire-pending-orders`       | `23 * * * *`         | HTTP `/api/cron/expire-pending-orders`                          |  Activo   |     Activo      | Inactivo  |
| `lucams-tracking-sync`               | `4,19,34,49 * * * *` | HTTP `/api/cron/tracking-sync`                                  |  Activo   |     Activo      | Inactivo  |
| `lucams-fiscal-watch`                | `5 12 * * *`         | HTTP `/api/cron/fiscal-watch` (email interno 90 %/100 %)        |  Activo   |     Activo      | Inactivo  |
| `lucams-lifecycle`                   | `*/15 * * * *`       | HTTP `/api/cron/lifecycle` (recorridos en borrador por defecto) |  Activo   |     Activo      | Inactivo  |
| `lucams-purge-event-logs`            | `0 3 * * *`          | HTTP `/api/cron/purge-event-logs`                               |  Activo   |     Activo      | Inactivo  |
| `lucams-purge-anon-designs`          | `0 8 * * *`          | HTTP `/api/cron/purge-anon-designs`                             |  Activo   |     Activo      | Inactivo  |
| `lucams-purge-delivered-designs`     | `0 9 * * *`          | HTTP `/api/cron/purge-delivered-designs`                        |  Activo   |     Activo      | Inactivo  |
| `lucams-purge-rate-limits`           | `29 5 * * *`         | SQL puro (`purge_rate_limit_buckets()`)                         |  Activo   |     Activo      |  Activo   |
| `lucams-internal-cron-history-purge` | `17 4 * * *`         | SQL puro (`cron.job_run_details` >14d)                          |  Activo   |     Activo      |  Activo   |
| `lucams-internal-net-response-purge` | `43 4 * * *`         | SQL puro (`net._http_response` >24h)                            |  Activo   |     Activo      |  Activo   |
| `uptime-monitor-prd`                 | `*/10 * * * *`       | `scripts/monitor-uptime-stg.sql` (STG sondea PRD)               | No existe |   **Activo**    | No existe |

- **Por qué los 5 crons de correo están desagendados en STG:** los despliegues Preview cuentan con `RESEND_API_KEY` para permitir pruebas manuales de flujos transaccionales; mantener activos los crons automáticos enviaría correos reales desde datos de prueba. **No re-apliques manualmente las migraciones `015` o `023` crudas en STG** sin correr a continuación el bloque de `cron.unschedule(...)` incluido al final de `scripts/db-stg-setup.sh`.
- **Cómo funciona `uptime-monitor-prd` desde STG (`scripts/monitor-uptime-stg.sql`):** ofrece un dominio de fallo independiente de Vercel/PRD a costo `$0`. Cada 10 minutos evalúa las respuestas asíncronas de la corrida anterior sobre los 5 healthchecks de PRD (`/api/health/all`, `/api/health/crons`, `/api/health/resend`, `/api/health/wompi`, `/api/health/aveonline`), dispara el nuevo lote, reporta latido a `POST /api/cron/monitor-heartbeat` de PRD y, si detecta **2+ corridas consecutivas fallidas** (~20 min), envía alerta directa a `ALERT_EMAIL` vía Resend con enfriamiento anti-spam de 30 minutos.

### 5.4 Reset transaccional limpio de STG (`make stg-reset`)

Cuando se requiere iniciar un ciclo limpio de QA en STG sin perder la curaduría comercial ni las cuentas administrativas:

```bash
make stg-reset         # Paso 1 (obligatorio): DRY-RUN — imprime conteos exactos de filas que se borrarían
make stg-reset-apply   # Paso 2: ejecuta el borrado atómico en STG (exige confirmación y pasa por env-guard)
```

- **Qué elimina `stg-reset-transactional.mjs`:** pedidos (`Order`, ítems, estados, hitos de envío, ledger Wompi, conciliaciones COD, retractos, garantías), cotizaciones, carritos y abandonados, clientes (`Customer` + sus `auth.users` no-admin), grafo completo `Contact` (identidades, candidatos de fusión, actividades, tareas, oportunidades, organizaciones), tickets de soporte, consentimientos, fidelización, referidos, reseñas, direcciones, lista de deseos, alertas de stock, diseños/assets/`RenderJob` y tablas de bitácoras/errores.
- **Qué preserva intacto:** todo el catálogo (`Category`, `Product`, `ProductVariant`, `OcasionTag`, `WholesaleTier`, `Material`, `ProductMaterial`), plantillas, sets de letras, galería prediseñada, redirecciones, cupones de configuración, el CMS v2 completo (`CmsPage`, `CmsSection`, `CmsField`, versiones, listas, mediateca, overrides de email) y los usuarios `AdminUser` con rol `SUPERADMIN` junto con su cuenta `auth.users`.

---

## 6. Homologación y sincronización entre ambientes (`PRD ↔ STG ↔ LOCAL`)

### 6.1 Herramientas vigentes de auditoría y sincronización

1. **Verificación de deriva de esquema y postura de seguridad (cualquier ambiente, solo lectura):**
   ```bash
   cd packages/db
   npx dotenv -e ../../.env.local -- node scripts/audit-schema-drift.mjs check
   npx dotenv -e ../../.env.local -- node scripts/verify-security-posture.mjs
   ```
   _(Cambiando `../../.env.local` por `../../.env.stg` o `../../.env.local.nube-backup` auditas STG o PRD sin escribir un solo byte)._
2. **Diagnóstico comparativo SQL STG ↔ PRD:** `bash scripts/diag-stg/homologacion.sh` ejecuta `05-homologacion-schema.sql` (columnas, índices, triggers, políticas RLS) y `06-homologacion-datos.sql` (checksums vivos de catálogo, variantes, plantillas, galería y CMS, separando divergencias vivas de filas archivadas).
3. **Homologación comercial `PRD → LOCAL` o `PRD → STG` (`homologate-catalog-from-prd.mjs`):**
   - Lee PRD en modo solo lectura desde `.env.local.nube-backup` y alinea en el ambiente destino (bloqueando PRD como destino mediante `env-guard.mjs`): estados `isActive`/`deletedAt` de productos y variantes, contenido comercial de `Product` y la galería `DesignGalleryImage` (copiando objetos faltantes en `product-images`).
   ```bash
   cd packages/db
   npx dotenv -e ../../.env.stg -- node scripts/homologate-catalog-from-prd.mjs           # Dry-run
   npx dotenv -e ../../.env.stg -- node scripts/homologate-catalog-from-prd.mjs --apply   # Aplica en STG
   ```
4. **Promoción puntual de curaduría `STG → PRD` (`sync-catalog-stg-to-prd.mjs` y `sync-gallery-stg-to-prd.mjs`):**
   - Empareja por claves naturales (`slug`, `sku`, `key`, `(tag, name)`) preservando los CUIDs existentes en PRD para no romper FKs históricas, y copia binarios nuevos de Storage.
   ```bash
   cd packages/db
   # Siempre correr primero en dry-run y revisar línea por línea el diff antes de --apply:
   node scripts/sync-catalog-stg-to-prd.mjs
   LUCAMS_ALLOW_DESTRUCTIVE_REMOTE=1 DATABASE_URL="$DIRECT_URL" node scripts/sync-catalog-stg-to-prd.mjs --apply
   ```

### 6.2 Reglas invariantes de homologación

- **El stock jamás viaja de `STG` a `PRD`:** en PRD las existencias son físicas y reales; toda variante nueva creada en PRD por sincronización nace con `stock = 0` para carga manual verificada en `/admin/inventario`.
- **Excepciones deliberadas entre ambientes:** `AdminUser` (las cuentas de prueba de STG nunca se copian a PRD), tablas transaccionales (`Order`, `Customer`, `Contact`), secretos de Vault y `CRON_JOBS_DISABLED`.
- **Trampa de `Json?` en Prisma:** al escribir columnas JSON anulables (como `DesignGalleryImage.variantFilter`), pasar `null` plano escribe el literal JSON `'null'` en vez de `SQL NULL`; usa siempre `Prisma.DbNull` en updates o `undefined` en creates.
- **Jamás ejecutes Vitest con `.env.local.nube-backup` exportado en tu shell:** las suites de integración crean fixtures y `env-guard.mjs` protege scripts administrativos, no runners de pruebas arbitrarios.

### 6.3 Receta `pg_dump` / `pg_restore` data-only y manejo de las 3 FKs circulares del CMS v2

Cuando necesites clonar un volcado binario `--data-only` de las tablas de catálogo/CMS desde PRD hacia LOCAL o STG usando `pg_dump -Fc --data-only` (PostgreSQL client 17) y `pg_restore --data-only`:

- **Por qué falla `--disable-triggers` en Supabase:** en las imágenes de Supabase (tanto cloud como local), el rol `postgres` **no es `SUPERUSER`** (el superusuario interno es `supabase_admin`), por lo que `pg_restore --disable-triggers` aborta con `permission denied: "RI_ConstraintTrigger_..." is a system trigger`.
- **Cómo resolver el ciclo `CmsField ↔ CmsFieldVersion` sin superuser:** `CmsField.publishedVersionId` referencia a `CmsFieldVersion(id)` mientras `CmsFieldVersion.fieldId` y `CmsListItem.fieldId` referencian a `CmsField(id)`. Antes de ejecutar `pg_restore --data-only` en el ambiente destino (LOCAL o STG), suelta temporalmente las **3 restricciones de clave foránea**, restaura los datos y recréalas validando integridad:

```sql
-- 1. En el destino (LOCAL o STG), ANTES de pg_restore --data-only:
BEGIN;
ALTER TABLE public."CmsField"        DROP CONSTRAINT IF EXISTS "CmsField_publishedVersionId_fkey";
ALTER TABLE public."CmsFieldVersion" DROP CONSTRAINT IF EXISTS "CmsFieldVersion_fieldId_fkey";
ALTER TABLE public."CmsListItem"     DROP CONSTRAINT IF EXISTS "CmsListItem_fieldId_fkey";
TRUNCATE TABLE
  public."Category", public."Product", public."ProductVariant",
  public."OcasionTag", public."ProductOcasionTag",
  public."PersonalizationTemplate", public."DesignGalleryImage",
  public."CmsPage", public."CmsSection", public."CmsField",
  public."CmsFieldVersion", public."CmsListItem", public."CmsMedia"
  RESTART IDENTITY CASCADE;
COMMIT;

-- 2. Ejecutar desde shell:
-- pg_restore --data-only --no-owner --no-privileges -d "$DEST_DIRECT_URL" catalogo-cms.dump

-- 3. En el destino, DESPUÉS de pg_restore (fallará si faltara alguna fila referenciada):
BEGIN;
ALTER TABLE public."CmsFieldVersion"
  ADD CONSTRAINT "CmsFieldVersion_fieldId_fkey"
  FOREIGN KEY ("fieldId") REFERENCES public."CmsField"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE public."CmsListItem"
  ADD CONSTRAINT "CmsListItem_fieldId_fkey"
  FOREIGN KEY ("fieldId") REFERENCES public."CmsField"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE public."CmsField"
  ADD CONSTRAINT "CmsField_publishedVersionId_fkey"
  FOREIGN KEY ("publishedVersionId") REFERENCES public."CmsFieldVersion"("id") ON DELETE SET NULL ON UPDATE CASCADE;
COMMIT;
```

---

## 7. Catálogo exhaustivo de scripts operativos (`packages/db/scripts`, `apps/web/scripts` y `scripts`)

### 7.1 Librerías de guarda obligatorias (`packages/db/scripts/lib/`)

Todo script que ejecute operaciones de escritura o borrado en `packages/db/scripts/` está auditado en CI por `make audit-script-guards` y comparte estas utilidades:

| Módulo                                                                          | Propósito y reglas de seguridad                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| ------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [`env-guard.mjs`](../packages/db/scripts/lib/env-guard.mjs)                     | Exporta `assertDestructiveAllowed(scriptName, rawUrl)`. Permite por defecto conexiones locales (`localhost`, `127.0.0.1`, `host.docker.internal`, `host.containers.internal`) y el proyecto STG registrado (`mjbdiqdkykhsixvqlrrp`). Rechaza con `process.exit(2)` cualquier intento contra `lucams-prod` o proyectos `*.supabase.co` no listados a menos que exportes explícitamente `LUCAMS_ALLOW_DESTRUCTIVE_REMOTE=1`. _(Alcance declarado: inspecciona hosts `*.supabase.co`; conexiones directas a proveedores Postgres externos no caen bajo ese patrón)._ |
| [`confirm-target.mjs`](../packages/db/scripts/lib/confirm-target.mjs)           | Confirmación interactiva en TTY que obliga al operador a teclear literalmente el hostname de destino antes de ejecutar acciones irreversibles (usado en `admin-mfa-reset.mjs --apply`).                                                                                                                                                                                                                                                                                                                                                                           |
| [`check-script-guards.mjs`](../packages/db/scripts/lib/check-script-guards.mjs) | Gate estático invocado por `make audit-script-guards` (incluido en `make check`): verifica que ningún script destructivo omita `assertDestructiveAllowed`.                                                                                                                                                                                                                                                                                                                                                                                                        |
| [`test-coupon-signal.mjs`](../packages/db/scripts/lib/test-coupon-signal.mjs)   | Señal canónica (`^(?:CAT\|SAGA\|ord)[0-9]{13,}-`) compartida para distinguir cupones efímeros filtrados por suites de integración de cupones comerciales reales.                                                                                                                                                                                                                                                                                                                                                                                                  |
| [`zombie-settings.mjs`](../packages/db/scripts/lib/zombie-settings.mjs)         | Lista declarativa de claves `SETTING` retiradas del CMS v2 para poda limpia mediante `remove-zombie-settings.mjs`.                                                                                                                                                                                                                                                                                                                                                                                                                                                |

### 7.2 Los 29 scripts vigentes en `packages/db/scripts/`

> **Regla de conexión para scripts sobre Supabase Cloud:** cuando ejecutes escrituras masivas, migraciones o sincronizaciones contra STG o PRD, pasa `DATABASE_URL="$DIRECT_URL"` (session pooler `:5432`) para evitar timeouts o bloqueos de prepared statements en PgBouncer transaccional (`:6543`).

| #   | Script (`packages/db/scripts/`)                                                               | Modo por defecto                           | Flags y variables admitidas                                                  | Propósito exacto                                                                                                                                                                                                                                     |
| --- | --------------------------------------------------------------------------------------------- | ------------------------------------------ | ---------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | [`admin-mfa-reset.mjs`](../packages/db/scripts/admin-mfa-reset.mjs)                           | `--dry-run`                                | `--apply`, `EMAIL=<correo>`, `LUCAMS_ALLOW_DESTRUCTIVE_REMOTE=1`             | Procedimiento break-glass para eliminar factores MFA (`auth.mfa_factors`) de un administrador bloqueado y registrar `AdminAuditLog`; en `--apply` exige escribir el hostname vía `confirm-target.mjs`.                                               |
| 2   | [`audit-schema-drift.mjs`](../packages/db/scripts/audit-schema-drift.mjs)                     | Solo lectura                               | `snapshot [--out FILE]`, `check [--baseline FILE]`                           | Audita deriva estructural entre `schema.prisma` y `public.*` en PostgreSQL (tablas, columnas, enums, índices y FKs; admite `rate_limit_buckets` como tabla SQL pura).                                                                                |
| 3   | [`audit-slugs.mjs`](../packages/db/scripts/audit-slugs.mjs)                                   | Solo lectura                               | —                                                                            | Lista categorías y productos activos (`deletedAt: null`) con sus `slug` e indicador `isActive` para revisión rápida de rutas SEO.                                                                                                                    |
| 4   | [`audit-storefront-consistency.mjs`](../packages/db/scripts/audit-storefront-consistency.mjs) | Solo lectura                               | —                                                                            | Auditoría integral de coherencia entre admin, PDP y Estudio: escaleras de slots por variante, promos válidas, aspect ratio de plantillas (`±0.05`), geometría física de tiras y cordura de capas SVG.                                                |
| 5   | [`audit-variants.mjs`](../packages/db/scripts/audit-variants.mjs)                             | Solo lectura                               | —                                                                            | Inspecciona las variantes activas agrupadas por producto con SKU, atributos, precio y stock.                                                                                                                                                         |
| 6   | [`backfill-contacts.mjs`](../packages/db/scripts/backfill-contacts.mjs)                       | `--dry-run` (`transaction_read_only = on`) | `--apply`, `--batch-size=200`, `--json`, `LUCAMS_ALLOW_DESTRUCTIVE_REMOTE=1` | Backfill progresivo por cursores (`ADR-193`) que consolida 8 fuentes históricas en el grafo `Contact` + `ContactIdentity` sin emitir PII por consola.                                                                                                |
| 7   | [`cleanup-test-junk.mjs`](../packages/db/scripts/cleanup-test-junk.mjs)                       | Escritura protegida (`env-guard`)          | `LUCAMS_ALLOW_DESTRUCTIVE_REMOTE=1`                                          | Limpia categorías/productos fugados de suites (`Cat <runId>`, aplicando soft-delete si hay `OrderItem` con FK `Restrict`) y fixtures `AdminUser` (`mfaitest_*`, `*@lucams.test`).                                                                    |
| 8   | [`cms-site-map.mjs`](../packages/db/scripts/cms-site-map.mjs)                                 | Módulo declarativo                         | Importado por scripts y tests AST                                            | Fuente estructural canónica del CMS v2 (`SITE_MAP`: 9 páginas, 29 secciones y 168 campos = 105 `BLOCK` + 63 `SETTING`).                                                                                                                              |
| 9   | [`homologate-catalog-from-prd.mjs`](../packages/db/scripts/homologate-catalog-from-prd.mjs)   | `--dry-run`                                | `--apply` _(bloquea PRD como destino)_                                       | Lee PRD en solo lectura (`.env.local.nube-backup`) y alinea en `LOCAL` o `STG` estados de productos/variantes, textos comerciales y `DesignGalleryImage` (+ binarios en `product-images`), sin tocar stock.                                          |
| 10  | [`identity-dry-run.mjs`](../packages/db/scripts/identity-dry-run.mjs)                         | Solo lectura estricta                      | `--json`                                                                     | Perfilador de colisiones de identidad sobre la base de datos bajo `SET TRANSACTION READ ONLY`; reporta candidatos de fusión sin escribir filas ni exponer PII.                                                                                       |
| 11  | [`migrate-cms-v2.mjs`](../packages/db/scripts/migrate-cms-v2.mjs)                             | `--dry-run`                                | `--apply`, `LUCAMS_ALLOW_DESTRUCTIVE_REMOTE=1`                               | Upsert aditivo e idempotente de `SITE_MAP` hacia `CmsPage`, `CmsSection` y `CmsField` preservando el `body` publicado y el historial editorial existente.                                                                                            |
| 12  | [`purge-test-coupons.mjs`](../packages/db/scripts/purge-test-coupons.mjs)                     | `--dry-run`                                | `--apply`, `LUCAMS_ALLOW_DESTRUCTIVE_REMOTE=1`                               | Purga cupones de prueba detectados por `test-coupon-signal.mjs`; aborta si alguno tiene `Order` o `CouponUsage` asociados y guarda respaldo JSON en `tmp/backups/` al aplicar.                                                                       |
| 13  | [`remove-zombie-settings.mjs`](../packages/db/scripts/remove-zombie-settings.mjs)             | `--dry-run`                                | `--apply`, `LUCAMS_ALLOW_DESTRUCTIVE_REMOTE=1`                               | Elimina en una transacción las claves `SETTING` obsoletas definidas en `lib/zombie-settings.mjs` junto con sus `CmsFieldVersion` y `CmsListItem`.                                                                                                    |
| 14  | [`seed-admin.mjs`](../packages/db/scripts/seed-admin.mjs)                                     | `--dry-run`                                | `--apply`, `EMAIL=<correo>`, `LUCAMS_ALLOW_DESTRUCTIVE_REMOTE=1`             | Crea o reactiva un `AdminUser` con rol `SUPERADMIN` vinculado al usuario existente en `auth.users` (por `EMAIL` o el primer usuario registrado).                                                                                                     |
| 15  | [`seed-catalog-canonical.mjs`](../packages/db/scripts/seed-catalog-canonical.mjs)             | `--dry-run`                                | `--apply`, `LUCAMS_ALLOW_DESTRUCTIVE_REMOTE=1`                               | Seed canónico e idempotente del catálogo base; jamás sobrescribe precios, imágenes, `isActive`, `deletedAt` ni `isFeatured` editados en `/admin`.                                                                                                    |
| 16  | [`seed-catalog-v2.mjs`](../packages/db/scripts/seed-catalog-v2.mjs)                           | Escritura protegida (`env-guard`)          | `LUCAMS_ALLOW_DESTRUCTIVE_REMOTE=1`                                          | Delta idempotente de jerarquía comercial: subcategorías hijas, ventanas estacionales, `richDescription`/`idealFor`/`physicalSpecs` y enlaces iniciales `ProductOcasionTag`.                                                                          |
| 17  | [`seed-letter-sets.mjs`](../packages/db/scripts/seed-letter-sets.mjs)                         | Escritura protegida (`env-guard`)          | `LUCAMS_ALLOW_DESTRUCTIVE_REMOTE=1`                                          | Upsert de los sets base `LetterTileSet` (`es` y `en`, `ADR-057`) para distribución de letras imantadas Scrabble.                                                                                                                                     |
| 18  | [`seed-ocasiones.mjs`](../packages/db/scripts/seed-ocasiones.mjs)                             | `--dry-run`                                | `--apply`, `LUCAMS_ALLOW_DESTRUCTIVE_REMOTE=1`                               | Upsert de las 15 etiquetas comerciales colombianas en `OcasionTag` (Amor y Amistad, Día de la Madre, Navidad, etc.).                                                                                                                                 |
| 19  | [`seed-templates.mjs`](../packages/db/scripts/seed-templates.mjs)                             | `--dry-run`                                | `--apply`, `LUCAMS_ALLOW_DESTRUCTIVE_REMOTE=1`                               | Upsert de las plantillas `PersonalizationTemplate` activas con sus capas SVG y slots configurables.                                                                                                                                                  |
| 20  | [`shipping-dims-audit.mjs`](../packages/db/scripts/shipping-dims-audit.mjs)                   | Solo lectura                               | —                                                                            | Replica `getEffectiveShippingDims` sobre todos los productos y variantes activos para detectar huecos de peso o dimensiones antes de que Aveonline lance `MissingShippingDimsError`.                                                                 |
| 21  | [`simulate-aveonline-webhook.mjs`](../packages/db/scripts/simulate-aveonline-webhook.mjs)     | Dev helper (HTTP local)                    | `<TRACKING_NUMBER> [ESTADO]` _(default `ENTREGADA`)_                         | Envía un webhook firmado válido a `/api/webhooks/aveonline` en entorno local para probar cambios de guía sin esperar a la transportadora.                                                                                                            |
| 22  | [`simulate-wompi-webhook.mjs`](../packages/db/scripts/simulate-wompi-webhook.mjs)             | Dev helper (HTTP local)                    | `<ORDER_NUMBER>` _(ej. `LCM-2026-0001`)_                                     | Calcula el checksum HMAC real con `WOMPI_EVENTS_SECRET` y dispara `transaction.updated` `APPROVED` contra `/api/webhooks/wompi` en local.                                                                                                            |
| 23  | [`stg-reset-transactional.mjs`](../packages/db/scripts/stg-reset-transactional.mjs)           | `--dry-run`                                | `--apply` _(invocado vía `make stg-reset` / `make stg-reset-apply`)_         | Limpieza transaccional atómica de órdenes, clientes, contactos, diseños y logs de prueba preservando catálogo, CMS, cupones de configuración y `SUPERADMIN`.                                                                                         |
| 24  | [`sync-and-prune-cms-v2.mjs`](../packages/db/scripts/sync-and-prune-cms-v2.mjs)               | `--dry-run`                                | `--apply`, `LUCAMS_ALLOW_DESTRUCTIVE_REMOTE=1`                               | Sincroniza la estructura `SITE_MAP`, republica semillas tokenizadas solo cuando el SHA-256 coincide con la semilla previa intacta y poda campos retirados a Capa 3.                                                                                  |
| 25  | [`sync-catalog-stg-to-prd.mjs`](../packages/db/scripts/sync-catalog-stg-to-prd.mjs)           | `--dry-run`                                | `--apply`, `DATABASE_URL="$DIRECT_URL"`, `LUCAMS_ALLOW_DESTRUCTIVE_REMOTE=1` | Promueve curaduría de catálogo, plantillas y CMS desde `.env.stg` hacia `.env.local.nube-backup` por claves naturales preservando CUIDs de PRD y dejando variantes nuevas en `stock = 0`.                                                            |
| 26  | [`sync-gallery-stg-to-prd.mjs`](../packages/db/scripts/sync-gallery-stg-to-prd.mjs)           | `--dry-run`                                | `--apply`, `DATABASE_URL="$DIRECT_URL"`, `LUCAMS_ALLOW_DESTRUCTIVE_REMOTE=1` | Promueve motivos de `DesignGalleryImage` y sus binarios de Storage desde STG hacia PRD emparejando por `id` y luego por `(tag, name)`.                                                                                                               |
| 27  | [`verify-cms-v2-integrity.mjs`](../packages/db/scripts/verify-cms-v2-integrity.mjs)           | Solo lectura (exit `0`/`1`)                | —                                                                            | Verifica invariantes del CMS v2: 0 campos publicados sin `publishedVersionId`, 0 referencias rotas a `CmsMedia` y 0 listas JSON inválidas.                                                                                                           |
| 28  | [`verify-security-posture.mjs`](../packages/db/scripts/verify-security-posture.mjs)           | Solo lectura (exit `0`/`1`)                | —                                                                            | Audita los 5 invariantes de seguridad en Postgres/Storage: RLS en el 100 % de `public.*`, 0 grants a `anon`/`authenticated`, 0 DML a `service_role`, 3 buckets sensibles con `public = false` y event trigger `enforce_rls_on_new_table_trg` activo. |
| 29  | [`seed-lifecycle.mjs`](../packages/db/scripts/seed-lifecycle.mjs)                             | `--dry-run`                                | `--apply`, `LUCAMS_ALLOW_DESTRUCTIVE_REMOTE=1` para PRD                      | Siembra cinco recorridos Lifecycle en `DRAFT`, preservando personalizaciones, estados y pasos editados.                                                                                                                                              |

### 7.3 Scripts de backup, DR, smoke y rendimiento en `apps/web/scripts/`

| Script (`apps/web/scripts/`)                                               | Comando / Invocación                                                                | Propósito operativo                                                                                                                                                                          |
| -------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [`backup-db-to-r2.mjs`](../apps/web/scripts/backup-db-to-r2.mjs)           | `pnpm --filter web db:backup` (ejecutado por `backup.yml`)                          | Genera `pg_dump` de `public`, comprime con `gzip`, cifra con GPG simétrico AES-256, sube `db/YYYY-MM-DD/lucams-*.sql.gz.gpg` a Cloudflare R2 y poda respaldos con `> 30` días.               |
| [`backup-storage-to-r2.mjs`](../apps/web/scripts/backup-storage-to-r2.mjs) | `pnpm --filter web storage:backup` (ejecutado por `backup.yml`)                     | Descarga los 5 buckets de Supabase Storage, empaqueta y cifra `storage/YYYY-MM-DD/lucams-storage-*.tar.gz.gpg` + `manifest.json` libre de PII en R2 y poda archivos con `> 30` días.         |
| [`dr-drill.mjs`](../apps/web/scripts/dr-drill.mjs)                         | Ejecutado por `.github/workflows/dr-drill.yml`                                      | Descarga el último `.sql.gz.gpg` desde R2, descifra en memoria, restaura sobre Postgres 17 efímero y valida conteos exactos de filas contra los bloques `COPY` del dump.                     |
| [`dr-drill-storage.mjs`](../apps/web/scripts/dr-drill-storage.mjs)         | Ejecutado por `.github/workflows/dr-drill.yml` (`drill-storage`)                    | Descarga el último tarball cifrado de Storage y su `manifest.json`, descifra en streaming sin escribir archivos en claro a disco y verifica conteos y bytes por bucket.                      |
| [`post-deploy-smoke.mjs`](../apps/web/scripts/post-deploy-smoke.mjs)       | `SMOKE_BASE_URL=https://lucamsshop.com node apps/web/scripts/post-deploy-smoke.mjs` | Smoke test post-deploy y post-DR: verifica HTTP `200` en home, `/catalogo`, `/api/health`, cabecera `Content-Security-Policy` y ausencia de redirect inesperado a `/mantenimiento`.          |
| [`profile-studio-entry.mjs`](../apps/web/scripts/profile-studio-entry.mjs) | `node apps/web/scripts/profile-studio-entry.mjs`                                    | Perfilador Playwright + Chrome DevTools Protocol (throttling CPU ×6 móvil) para auditar `longTasks`, TBT e hidratación de Konva al entrar a `/estudio/[slug]` (`ADR-166`).                   |
| [`uptime-monitor.mjs`](../apps/web/scripts/uptime-monitor.mjs)             | `node apps/web/scripts/uptime-monitor.mjs [--dry-run]`                              | Sonda manual de contingencia equivalente a la Edge Function `uptime-monitor-prd` (lee credenciales de `~/.config/lucams/uptime.env` si la sonda primaria de STG estuviera en mantenimiento). |

### 7.4 Scripts de infraestructura y diagnóstico en `scripts/`

| Script (`scripts/`)                                                           | Uso y argumentos                                                                                                           | Propósito operativo                                                                                                                                                                                    |
| ----------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| [`db-local-env.sh`](../scripts/db-local-env.sh)                               | `bash scripts/db-local-env.sh on\|off` _(vía `make db-local-on/off`)_                                                      | Conmuta de forma segura `.env.local` entre el stack Podman local y el respaldo `.env.local.nube-backup`, recreando el symlink `apps/web/.env.local`.                                                   |
| [`db-local-setup.sh`](../scripts/db-local-setup.sh)                           | `bash scripts/db-local-setup.sh` _(vía `make db-local-setup`)_                                                             | Arranca Supabase CLI sobre Podman rootless, aplica `prisma db push` y las migraciones SQL `002..058` compatibles con local, y regenera el cliente Prisma.                                              |
| [`db-stg-setup.sh`](../scripts/db-stg-setup.sh)                               | `bash scripts/db-stg-setup.sh` _(vía `make db-stg-setup`)_                                                                 | Aplica `prisma migrate deploy` y las migraciones SQL sobre `.env.stg` verificando la postura RLS final.                                                                                                |
| [`e2e-fullmode.sh`](../scripts/e2e-fullmode.sh)                               | `bash scripts/e2e-fullmode.sh [specs...]` _(vía `make test-e2e-full`)_                                                     | Levanta el servidor con `NEXT_PUBLIC_STORE_MODE=full` en `:4000`, espera `/api/health`, corre Playwright y limpia procesos al terminar.                                                                |
| [`git-hooks/pre-commit`](../scripts/git-hooks/pre-commit)                     | Instalado con `make install-hooks`                                                                                         | Bloquea commits con llaves privadas, archivos `.env*`, artefactos temporales o voseo accidental en código/docs.                                                                                        |
| [`monitor-uptime-stg.sql`](../scripts/monitor-uptime-stg.sql)                 | Referencia SQL en SQL Editor de `lucams-stg`                                                                               | Registra los secretos `monitor_*` en Vault y agenda el job `uptime-monitor-prd` cada 5 min contra `lucamsshop.com/api/health/all`.                                                                     |
| [`supabase-auth-email-config.mjs`](../scripts/supabase-auth-email-config.mjs) | `SUPABASE_ACCESS_TOKEN=... RESEND_API_KEY=... node scripts/supabase-auth-email-config.mjs --ref <project-ref> [--dry-run]` | Configura por Management API el SMTP custom de Resend (`smtp.resend.com:465`, remitente `hola@lucamsshop.com`) y las plantillas HTML de OTP en español (`supabase/auth-templates/*.html`).             |
| [`vercel-runtime-errors.sh`](../scripts/vercel-runtime-errors.sh)             | `bash scripts/vercel-runtime-errors.sh [alias] [segundos]` _(default `lucamsshop.com` y `25` s)_                           | Conecta `vercel logs --json` en vivo sobre el deployment activo para capturar trazas `statusCode >= 500` y `level=error` cuando la base de datos misma está caída y `ErrorLog` no puede recibir filas. |
| [`diag-stg/`](../scripts/diag-stg/)                                           | `bash scripts/diag-stg/homologacion.sh` y consultas `01..07-*.sql`                                                         | Suite SQL de solo lectura para auditar en STG/PRD zonas de envío (`01`), Web Vitals/INP (`04`), deriva de esquema (`05`), paridad de datos vivos (`06`) y `ErrorLog` recientes (`07`).                 |

---

## 8. Operación de subsistemas en `/admin` y proceso físico de taller

### Operación de Lifecycle Journeys (`ADR-198`)

El módulo `/admin/lifecycle` incluye cinco configuraciones iniciales **siempre en `DRAFT`**. La semilla es idempotente, no reemplaza personalizaciones ni activa mensajes; únicamente reconcilia los antiguos pasos de carrito y la espera B2B cuando el recorrido sigue en versión 1, borrador y sin historial. Para inspeccionar el plan sin escribir:

```bash
cd packages/db
npx dotenv -e ../../.env.local -- node scripts/seed-lifecycle.mjs
# Aplicar en LOCAL o STG (este último mediante make db-stg-seed):
npx dotenv -e ../../.env.local -- node scripts/seed-lifecycle.mjs --apply
```

El bloque **Control general del motor** define `LIFECYCLE_ENABLED` y `LIFECYCLE_MAX_MESSAGES_PER_DAY` (dos settings privadas de `global/comercio`). El límite global se aplica entre todos los recorridos por contacto/día Colombia y se suma al límite individual. Cambiarlo exige MFA reciente y deja auditoría. Las cinco rutas siguen en borrador: empieza solo por Primera compra, Segunda compra y Reactivación, revisa audiencia, previsualiza cada paso y prueba antes de activar. Pausar un recorrido detiene sus ejecuciones; finalizar una inscripción impide su recreación; solo `ADMIN_PAUSED` admite reanudación. Un fallo se reintenta cada 30 minutos y, tras cinco intentos, la inscripción queda suprimida con `MESSAGE_FAILED`. Un circuito abierto de Resend frena el lote sin consumir intentos.

`VERCEL_ENV=preview` fuerza `DRY_RUN`: el motor procesa inscripciones y pasos, pero marca mensajes `SUPPRESSED/DRY_RUN`, no llama a Resend ni crea tareas B2B. La acción «Enviarme una prueba» solo valida el render y tampoco envía. `LIFECYCLE_DRY_RUN=1` o `true` fuerza el mismo comportamiento en local o PRD para una contingencia; no existe un override que habilite correos Lifecycle reales en Preview.

Verificación del cron real sin exponer el secreto:

```bash
set -a; source .env.local; set +a
curl -fsS -H "x-cron-secret: $CRON_SECRET" http://localhost:4000/api/cron/lifecycle | jq .
```

El resultado debe incluir `errors: 0` y `dryRun` acorde al ambiente; cualquier error parcial hace fallar el endpoint y se investiga en `/admin/observability`. `messagesDeferred` indica trabajo aplazado por circuito o presupuesto de ejecución y `tasksCreated` cuenta tareas B2B. La atribución usa el último clic anterior a una orden creada dentro de 30 días que ya esté pagada, una única vez por `convertedOrderId`. Las métricas de entrega, rebote, queja y diferido salen del `resendId` enlazado con `EmailEvent`.

En PRD, después de aplicar las migraciones Prisma y RLS y dejar el endpoint desplegado, siembra las configuraciones sin activarlas:

```bash
cd packages/db
LUCAMS_ALLOW_DESTRUCTIVE_REMOTE=1 npx dotenv -e ../../.env.local.nube-backup -- node scripts/seed-lifecycle.mjs --apply
```

La migración `058` que agenda `lucams-lifecycle` se aplica **después** del despliegue `Ready` del endpoint. Para revertir código, desagenda primero ese job; las tablas nuevas son aditivas y no afectan la versión anterior.

### 8.1 Módulo configurable de recuperación de carritos abandonados (`ADR-153`)

La recuperación de carritos abandonados combina captura progresiva de contacto en checkout (`/api/checkout/abandoned`), detección y envío horario (`/api/cron/abandoned-carts`) y un panel administrativo completo en `/admin/carritos-abandonados` junto con su configuración en `/admin/configuracion` (`SystemSetting`):

| Clave en `SystemSetting`       | Valor inicial                | Rango permitido            | Comportamiento operativo                                                                                                                                                                                                 |
| ------------------------------ | ---------------------------- | -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `CART_RECOVERY_ENABLED`        | `"false"` (apagado al nacer) | `"true"` / `"false"`       | **Kill-switch maestro:** cuando es `"false"`, el cron sigue detectando y marcando carritos abandonados para analítica en `/admin`, pero **no despacha ningún correo**.                                                   |
| `CART_RECOVERY_MODE`           | `"manual"`                   | `"automatic"` / `"manual"` | En `"manual"`, los correos solo salen cuando un operador pulsa **«Enviar recordatorio»** en `/admin/carritos-abandonados`; en `"automatic"`, el cron horario despacha recordatorios dentro de las ventanas configuradas. |
| `CART_RECOVERY_IDLE_HOURS`     | `"4"`                        | `1` – `72` horas           | Horas de inactividad mínimas desde `lastActivityAt` antes de elegibilidad para el primer recordatorio.                                                                                                                   |
| `CART_RECOVERY_MAX_REMINDERS`  | `"1"`                        | `1` – `3` envíos           | Tope máximo de correos de recuperación por carrito (`reminderCount < maxReminders`).                                                                                                                                     |
| `CART_RECOVERY_INTERVAL_HOURS` | `"24"`                       | `1` – `168` horas          | Horas mínimas de espera entre un recordatorio y el siguiente cuando `maxReminders > 1`.                                                                                                                                  |

- **Garantías operativas:** idempotencia por intento en Resend (`Idempotency-Key: cart-recovery-<abandonedCartId>-<attemptNumber>`), respeto estricto de `EmailSuppression` y baja firmada HMAC en 1 clic (`/api/unsubscribe`), vista previa con token ficticio en `/admin` que jamás muta contadores reales, atribución exacta en `Order.recoveredFromCartId` al convertir y trazabilidad completa en `AdminAuditLog` (`cart_recovery.config_updated`, `cart_recovery.manual_send`).

### 8.2 Cola asíncrona de producción `RenderJob` (`ADR-136`)

Los entregables de impresión a **300 DPI** (`production-assets/{orderId}/...`) se generan fuera del request sincrónico de compra mediante la tabla `RenderJob` y [`features/personalization/render-job-service.ts`](../apps/web/features/personalization/render-job-service.ts):

1. **Encolado y kick inmediato:** al finalizar un diseño o confirmar el pago (`PAID`), se inserta/actualiza `RenderJob(status = PENDING)` y se ejecuta un _best-effort kick_ con presupuesto máximo de **8 s** antes de responder al navegador.
2. **Worker por lotes (`lucams-process-render-jobs`):** se ejecuta cada minuto con _idle-skip_ SQL en PostgreSQL (0 invocaciones HTTP a Vercel cuando no hay filas elegibles). Reclama jobs con lease atómico de **5 minutos** (`lockedAt`), avanza por unidades (`doneUnits / totalUnits`) y tras **3 intentos fallidos** marca `status = FAILED` disparando alerta administrativa.
3. **Separación Node vs navegador (`NEEDS_KONVA`):** `@napi-rs/canvas` renderiza en servidor fotos, cuadrículas, tiras, mosaicos, textos y stickers; si una plantilla compleja requiere el motor Konva del navegador del operador, el job queda señalizado con `lastError = 'NEEDS_KONVA'` para generación asistida desde `/admin/pedidos/[number]/produccion`.
4. **Bloqueo de paquetes incompletos y control visual en `/produccion`:**
   - El endpoint de descarga ZIP en `/admin/pedidos/[number]/produccion` devuelve **HTTP `409 Conflict`** mientras exista un `RenderJob` en `PENDING` o `PROCESSING`, evitando que el taller descargue carpetas a medias.
   - Las miniaturas de troquel en la ficha de taller se muestran con `object-contain` sobre cuadrícula de transparencia (nunca `object-cover`) para que el operario verifique sangrado, esquinas redondeadas y perforaciones reales antes de imprimir.
   - En productos de doble cara (separadores magnéticos y tarjetas dedicatoria), el paquete incluye los PNG de reverso a 300 DPI (`reverso-patron-lucams.png` o `reverso-blanco.png`). En tiras planas de una sola cara (`noFold`), el generador exige foto a sangre completa (`PHOTO_NOT_FULL_BLEED`) y el reverso es la lámina magnética física.

### 8.3 Higiene de 4 capas en los 5 buckets de Supabase Storage

Para operar con holgura dentro del límite de **1 GB** del tier Free (y mantener costos mínimos en Pro), la higiene de binarios se ejecuta en cuatro capas complementarias:

1. **Capa 1 — Purga por diseño y minimización Ley 1581 (`03:30 UTC`):**
   - `purgeExpiredDesigns` elimina en `customer-uploads` y `design-previews` borradores `DRAFT` inactivos (`> 30` días en PRD, cap de `14` días en STG/dev) y diseños `READY` sin orden asociada (`> 90` días en PRD, cap de `14` días en STG/dev).
   - `purgeDeliveredOrderDesigns` (`03:45 UTC`) purga fotos originales, previews y `production-assets` de órdenes `DELIVERED` tras `90` días desde `deliveredAt` (preservando registros contables de la orden).
2. **Capa 2 — Retención previa de carritos (`03:15 UTC`):** `purgeStaleCarts` limpia carritos vacíos (`> 7` días), carritos activos inactivos (`> 60` días) y `AbandonedCart` cerrados (`> 90` días) antes de que corra la purga de diseños, liberando referencias huérfanas.
3. **Capa 3 — Barrido diario de objetos huérfanos (`sweepOrphanStorageObjects`):** dentro del cron de `03:30 UTC`, inspecciona hasta **500 objetos por corrida** en `customer-uploads`, `design-previews` y `production-assets` con **doble verificación** antes de borrar: (a) ningún `Design`, `DesignAsset` ni `OrderItem` referencia la ruta y (b) para prefijos `pending/` en `customer-uploads`, el objeto supera **7 días de gracia** (protegiendo sesiones largas en el Estudio).
4. **Capa 4 — Monitoreo real y limpieza editorial:** `/api/health/all` suma `metadata->>'size'` directamente sobre `storage.objects` y emite alerta preventiva ámbar al superar **800 MB** (`80 %` de 1 GB). Para los buckets editoriales (`cms-media` y `product-images`), `/admin/contenido/mediateca` incluye el filtro **«Sin uso»** para auditar y depurar activos sin referencias en CMS ni catálogo.

### 8.4 Procedimiento de reembolso de pedidos (`/admin/pedidos/[number]`)

> **Advertencia financiera crítica:** la acción administrativa `refundOrder` **no mueve dinero automáticamente en Wompi ni ejecuta transferencias bancarias**. El reembolso monetario es deliberadamente **100 % manual** para impedir salidas irreversibles de caja por error humano o compromiso de sesión.

1. **Paso 1 — Ejecutar primero la devolución del dinero fuera del backoffice:**
   - **Pagos online (Wompi):** ingresa al comercios dashboard de Wompi (`comercios.wompi.co`), localiza la transacción `APPROVED` por referencia `LCM-YYYY-NNNN` (verificando en la pestaña de pagos de la orden que corresponda al `wompiTransactionId` ganador), ejecuta la anulación/reembolso y conserva el comprobante.
   - **Contraentrega (`COD`):** coordina y transfiere el monto acordado a la cuenta bancaria certificada del cliente y guarda el soporte de transferencia.
2. **Paso 2 — Registrar el reembolso en `/admin/pedidos/[number]`:**
   - Con rol autorizado (`SUPERADMIN`, `ORDER_MANAGER` o `CUSTOMER_SUPPORT` con MFA `aal2`), pulsa **«Reembolsar pedido»** e ingresa el motivo detallado.
   - `refundOrder` ejecuta en una sola transacción: cambia `Order.status → REFUNDED` (`paymentStatus → REFUNDED`), **revierte de forma idempotente el stock** de cada variante física descontada, **libera el cupón** (`CouponUsage` y `Coupon.usageCount`) para que el cliente o cupón conserve su cupo exacto, inserta `OrderStatusHistory` + `AdminAuditLog` y despacha el correo transaccional de confirmación (_best-effort_).
3. **Qué NO hace automáticamente `refundOrder`:**
   - **No anula la guía en Aveonline:** si ya se había emitido `trackingNumber` y el paquete no ha salido del taller, anula la guía en el portal de Aveonline o desde el módulo de envíos antes de la recolección.
   - **No procesa reembolsos parciales de centavos en el estado de la orden:** las compensaciones parciales (ej. cupón o reposición por garantía en `/admin/garantias`) se gestionan por flujo de garantía/soporte sin marcar toda la orden como `REFUNDED`.

### 8.5 Proceso operativo físico de taller, formatos de corte y empaque/unboxing

La ficha imprimible en `/admin/pedidos/[number]/produccion` traduce cada ítem mediante [`features/personalization/production-spec.ts`](../apps/web/features/personalization/production-spec.ts) (`resolveProductionSpec` y `productionPieceGroups`) en instrucciones físicas inequívocas para impresión, laminado, troquelado y empaque:

#### A. Formatos físicos de salida en taller (`ProductionOutputFormat`)

| Formato (`outputFormat`) | Productos típicos                                                                         | Instrucción física de producción y corte                                                                                                                                                      |
| ------------------------ | ----------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `fichas-sueltas`         | Fotoimanes cuadrados/rectangulares, Polaroid, Spotify, Save the Date, stickers imantados  | Impresión a 300 DPI con sangrado perimetral, laminado protector UV, adhesión a lámina magnética flexible (salvo variante sin imán) y corte individual por pieza con esquinas según plantilla. |
| `lamina-fichas`          | Abecedarios / sets Scrabble (`LetterTileSet`), rompecabezas magnéticos y sets troquelados | Impresión en lámina agrupada y troquelado en grilla de fichas individuales verificando el conteo total de piezas del set.                                                                     |
| `tira-continua`          | Tiras fotográficas clásicas de cabina (1 cara) y tiras planas (`noFold`)                  | Impresión continua vertical a sangre completa sobre sustrato magnético flexible; corte recto por el contorno exterior sin pliegue central.                                                    |
| `tira-desplegada`        | Separadores magnéticos plegables de libro (doble cara tête-bêche)                         | Impresión desplegada con cara frontal + cara trasera rotada `180°` (_tête-bêche_) separadas por línea de hendido central; doblar por el eje e imantar caras internas enfrentadas.             |
| `caras-sueltas`          | Tarjetas dedicatoria y piezas impresas por ambas caras rígidas                            | Impresión de frente y reverso (`reverso-patron-lucams` o `reverso-blanco`) alineados a registro antes del refilado final.                                                                     |
| `piezas-sueltas`         | Productos físicos sin personalización fotográfica (accesorios, kits listos)               | Picking directo de inventario verificado por SKU en estantería.                                                                                                                               |

- **Variantes sin imán (`attributes.magnet === false` / sufijo SKU `-NOMAG`):** la ficha de producción resalta una alerta explícita de sustrato fotográfico/rígido **sin lámina magnética**, evitando desperdicio de insumo magnético en taller.

#### B. Estándar físico de empaque y experiencia de unboxing (`PackagingType`)

Cada producto define su `Product.packagingType` (sobreescrito automáticamente cuando el pedido marca `Order.isGift = true`):

| `PackagingType`    | Cuándo aplica                                                                                                               | Composición física en mesa de empaque                                                                                                                                                                                               | Regla de documentos e impresos internos                                                                                                                    |
| ------------------ | --------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **`STANDARD_BAG`** | Pedidos B2C regulares de fotoimanes, Polaroid, tiras, separadores y coleccionables (`isGift = false`)                       | Sobre/bolsa kraft protectora con papel seda libre de ácido, cierre con **sticker de marca Lucams** y tarjeta breve de cuidados del imán.                                                                                            | Incluye resumen de orden estándar.                                                                                                                         |
| **`GIFT_BOX`**     | Productos con `packagingType = GIFT_BOX` o **cualquier orden marcada como regalo (`Order.isGift = true`)**                  | Caja rígida/armable de regalo estética kawaii con papel seda, cinta decorativa, sticker sello **Lucams** y tarjeta impresa con el mensaje personalizado (`Order.giftMessage` y `giftSenderName`).                                   | **Prohibido incluir precios, descuentos o montos COP** dentro del paquete; la ficha de empaque oculta importes para proteger la sorpresa del destinatario. |
| **`BULK_BOX`**     | Pedidos mayoristas B2B, recordatorios corporativos, bodas y eventos masivos (`x50+` unidades / cotizaciones `QuoteRequest`) | Caja máster corrugada de alta resistencia con separadores internos por lotes contados (paquetes de 25/50 unidades protegidos contra roce magnético), sin decoración individual por unidad salvo acuerdo explícito en la cotización. | Incluye remisión de conteo por lote/SKU para recepción rápida del cliente corporativo o wedding planner.                                                   |
| **`ENVELOPE`**     | Piezas planas livianas individuales (tarjetas dedicatoria sueltas, láminas planas pequeñas)                                 | Sobre rígido acartonado anti-doblez con refuerzo interno e identificación exterior «No doblar».                                                                                                                                     | Incluye comprobante resumido de pedido.                                                                                                                    |

---

## 9. Disaster Recovery (DR), backups en R2, modo mantenimiento y simulacros

### 9.1 Objetivos RPO / RTO, las 5 capas de defensa y alcance real de los backups

- **Objetivos comprometidos en producción:** **`RPO ≤ 24 h`** (pérdida máxima tolerable de datos ante catástrofe total de proveedor) y **`RTO ≤ 4 h`** (tiempo máximo para restituir operación verificada en `https://lucamsshop.com`).

| Capa                     | Componente                                      | Mecanismo primario de resiliencia                                                                     | Respaldo secundario independiente                                                                                                                                                 | RPO efectivo                        |
| ------------------------ | ----------------------------------------------- | ----------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------- |
| **1. Cómputo y CDN**     | Vercel (`apps/web`)                             | Deployments inmutables por commit en GitHub + **Instant Rollback** en `< 5 min`                       | Código fuente íntegro en GitHub (`production` protegida) desplegable en proyecto nuevo                                                                                            | `0 min` (stateless)                 |
| **2. Base de datos**     | Supabase PostgreSQL (`lucams-prod`)             | Snapshots diarios / PITR nativo de Supabase (en plan Pro) + migraciones versionadas en Git            | Cron diario `backup.yml` (`07:13 UTC`): `pg_dump` de `public` comprimido y cifrado **GPG AES-256** en Cloudflare R2 (retención **30 días**) + latido `/api/cron/backup-heartbeat` | `≤ 24 h` (`≤ minutos` con PITR Pro) |
| **3. Objetos binarios**  | Supabase Storage (5 buckets)                    | Almacenamiento redundante S3 subyacente de Supabase                                                   | Cron diario `backup.yml` (`07:13 UTC`): tarball de los 5 buckets cifrado **GPG AES-256** + `manifest.json` sin PII en Cloudflare R2 (retención **30 días**)                       | `≤ 24 h`                            |
| **4. Respaldo off-site** | Cloudflare R2 (`lucams-backups`)                | Infraestructura independiente de AWS/Supabase/Vercel con cifrado en cliente (`BACKUP_GPG_PASSPHRASE`) | Verificación automática el día `2` de cada mes (`08:27 UTC`) por `.github/workflows/dr-drill.yml` (DB + Storage)                                                                  | Verificado mensualmente             |
| **5. Dominio y DNS**     | `lucamsshop.com` (`mi.com.co` + Cloudflare DNS) | DNS Anycast en Cloudflare con TTL corto (`300 s`)                                                     | Vigilancia mensual RDAP (`.github/workflows/domain-watch.yml`, día `5` `11:23 UTC` → `POST /api/cron/domain-watch`) contra vencimiento o cambio de nameservers/EPP                | N/A                                 |

- **Alcance y exclusiones explícitas de `backup.yml` (transparencia operativa):**
  - **Incluido y ensayado mensualmente:** el 100 % de las tablas e índices del esquema `public` (vía [`backup-db-to-r2.mjs`](../apps/web/scripts/backup-db-to-r2.mjs)) y el 100 % de los objetos de los 5 buckets de Storage (vía [`backup-storage-to-r2.mjs`](../apps/web/scripts/backup-storage-to-r2.mjs)).
  - **Excluido del dump lógico diario:** el esquema interno `auth.*` de GoTrue (`auth.users`, `auth.mfa_factors`), los secretos de `vault.decrypted_secrets` y la configuración de proyecto de Supabase. Ante pérdida total del proyecto Supabase sin PITR de plataforma, los clientes recuperan acceso de inmediato porque el login de tienda es **passwordless por código OTP de email** (al iniciar sesión se vincula por email verificado al perfil `Customer`/`Contact` restaurado en `public`), y los administradores se reenrolan ejecutando `scripts/supabase-auth-email-config.mjs` + `seed-admin.mjs` + registro MFA TOTP en `/admin/seguridad`.

### 9.2 Procedimiento de recuperación end-to-end (7 pasos)

Ante una caída catastrófica o corrupción severa en producción, ejecuta en orden estricto:

1. **Activar cortafuegos de mantenimiento:** establece `NEXT_PUBLIC_MAINTENANCE_MODE=1` en Vercel Production y lanza un Redeploy inmediato (o activa regla temporal 503 en Cloudflare si necesitas corte al segundo; ver §9.3) para frenar nuevas órdenes y mutaciones.
2. **Evaluar el alcance del incidente:** determina si el fallo es de código/build (ir directo a Drill #3 Rollback Vercel), corrupción parcial reciente en BD con proyecto vivo (usar PITR de Supabase si está activo) o pérdida total del proyecto/región (continuar al paso 3 con R2).
3. **Aprovisionar destino y restaurar base de datos:**
   - Si creas un proyecto Supabase nuevo, aplica la estructura base (`prisma migrate deploy` + migraciones `supabase/migrations/002..058`) o restaura directamente el último `db/YYYY-MM-DD/lucams-*.sql.gz.gpg` desde Cloudflare R2 y ejecuta `node packages/db/scripts/verify-security-posture.mjs`.
   - Recrea los secretos en `vault.secrets` (§5.2) y aplica la configuración SMTP/plantillas OTP con `node scripts/supabase-auth-email-config.mjs --ref <nuevo-ref>`.
4. **Restaurar los 5 buckets de Storage (si aplica):** descarga y descifra el último `storage/YYYY-MM-DD/lucams-storage-*.tar.gz.gpg` desde R2 y sube los objetos respetando los nombres exactos de bucket y rutas internas (`product-images`, `cms-media`, `customer-uploads`, `design-previews` privado, `production-assets` privado).
5. **Reapuntar variables de entorno en Vercel:** actualiza `DATABASE_URL`, `DIRECT_URL`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` y `SUPABASE_SECRET_KEY` en Vercel Production y dispara un Redeploy limpio.
6. **Ejecutar smoke test integral antes de abrir tráfico público:** corre `SMOKE_BASE_URL=https://lucamsshop.com node apps/web/scripts/post-deploy-smoke.mjs`, verifica `/api/health/all` con `Authorization: Bearer $CRON_SECRET` y comprueba conciliación de pagos pendientes en Wompi.
7. **Desactivar modo mantenimiento y documentar post-mortem:** cambia `NEXT_PUBLIC_MAINTENANCE_MODE=0` en Vercel Production, ejecuta Redeploy, verifica `curl -sI https://lucamsshop.com/` (`HTTP/2 200`) y registra tiempos reales de detección, restauración y causa raíz.

### 9.3 Modo mantenimiento (`NEXT_PUBLIC_MAINTENANCE_MODE=1`)

[`apps/web/proxy.ts`](../apps/web/proxy.ts) evalúa `process.env.NEXT_PUBLIC_MAINTENANCE_MODE === "1"` (comparación estricta contra el string `"1"`):

| Ruta solicitada cuando `NEXT_PUBLIC_MAINTENANCE_MODE="1"`                                        | Respuesta de `proxy.ts`                          | Motivo                                                                                |
| ------------------------------------------------------------------------------------------------ | ------------------------------------------------ | ------------------------------------------------------------------------------------- |
| Storefront público (`/`, `/catalogo`, `/productos/*`, `/estudio/*`, `/checkout`, `/mi-cuenta/*`) | **`307 Temporary Redirect` → `/mantenimiento`**  | Muestra página estática amigable en español sin consultar la base de datos.           |
| `/mantenimiento`                                                                                 | `200 OK`                                         | Evita bucles de redirección y sirve la pantalla informativa.                          |
| `/admin/*`                                                                                       | **Permitido** (sigue flujo normal de auth + MFA) | Permite al equipo operar el backoffice y verificar estado interno durante la ventana. |
| `/api/*` (`/api/health*`, `/api/webhooks/*`, `/api/cron/*`)                                      | **Permitido**                                    | No pierde webhooks tardíos de Wompi/Aveonline/Resend ni bloquea sondas de salud.      |
| `/_next/*`, `/favicon.ico` y estáticos con extensión                                             | **Permitido**                                    | Necesarios para renderizar estilos y tipografías de `/mantenimiento`.                 |

> **Por qué cambiar `NEXT_PUBLIC_MAINTENANCE_MODE` en Vercel exige obligatoriamente un Redeploy (~2–4 min):**
> En Next.js, toda variable con prefijo `NEXT_PUBLIC_*` se incrusta (_inlining_) en tiempo de compilación (`next build`). Como advierte textualmente la documentación oficial de Next.js (`docs/01-app/02-guides/environment-variables.md`):
> _"After being built, your app will no longer respond to changes to these environment variables."_
> Por lo tanto, editar el valor en **Vercel → Settings → Environment Variables** no surte efecto hasta pulsar **Deployments → Redeploy** sobre el deployment activo de `production`.

Comprobación inmediata desde terminal tras el Redeploy:

```bash
# Con modo mantenimiento ACTIVO (debe responder 307 y location: /mantenimiento):
curl -sI https://lucamsshop.com/ | grep -iE '^HTTP|^location'

# Con modo mantenimiento INACTIVO (debe responder 200 sin cabecera location):
curl -sI https://lucamsshop.com/ | grep -iE '^HTTP|^location'
```

- **Alternativa de corte instantáneo (< 5 s) si no puedes esperar 2–4 min de build:** activa una regla temporal de mantenimiento/503 en **Cloudflare Rules** sobre `lucamsshop.com/*` (excluyendo `/api/webhooks/*` y `/api/health*`) mientras termina el Redeploy de Vercel.

### 9.4 Los 3 simulacros de recuperación (DR Drills) y calendario anual

#### Drill #1 — Restauración parcial / Point-in-Time Recovery (PITR en Supabase)

Valida la recuperación quirúrgica ante un borrado humano accidental o migración defectuosa sin pérdida de las últimas horas:

```bash
# 1. En un proyecto de prueba / rama de restauración de Supabase, restaurar al timestamp previo al incidente
#    (Dashboard Supabase -> Database -> Backups -> Point in Time / Restore to new project).

# 2. Exportar únicamente la(s) tabla(s) afectada(s) desde la instancia restaurada:
pg_dump --data-only --format=custom \
  --table='public."Product"' \
  --table='public."ProductVariant"' \
  "$PITR_RESTORED_DIRECT_URL" -f partial-recovery.dump

# 3. Verificar conteos en local/STG antes de reinyectar y validar postura:
pg_restore --list partial-recovery.dump
DATABASE_URL="$TARGET_DIRECT_URL" node packages/db/scripts/verify-security-posture.mjs
```

#### Drill #2 — Restauración completa desde Cloudflare R2 (`dr-drill.yml` + procedimiento manual)

El workflow [`.github/workflows/dr-drill.yml`](../.github/workflows/dr-drill.yml) ejecuta automáticamente el **día 2 de cada mes a las `08:27 UTC`** (y bajo demanda con `workflow_dispatch`) dos jobs paralelos:

1. **`drill` (PostgreSQL 17 efímero):** ejecuta [`apps/web/scripts/dr-drill.mjs`](../apps/web/scripts/dr-drill.mjs), descarga el último `.sql.gz.gpg` desde R2, lo descifra, aplica el SQL completo y comprueba que el `COUNT(*)` real de las tablas críticas (`Product`, `ProductVariant`, `Order`, `Customer`, `CmsField`, `AdminUser`) coincida exactamente con las líneas de cada bloque `COPY` del respaldo.
2. **`drill-storage` (Streaming sin disco en claro):** ejecuta [`apps/web/scripts/dr-drill-storage.mjs`](../apps/web/scripts/dr-drill-storage.mjs), descarga el último tarball `.tar.gz.gpg` y su `manifest.json`, descifra y recorre el stream `tar` en memoria sin escribir archivos de clientes al disco del runner y valida conteos de objetos y bytes por bucket.

> **Nota crítica de privacidad y PII en GitHub Actions:** aunque `dr-drill.mjs` y `dr-drill-storage.mjs` solo imprimen conteos agregados y nombres de tablas/buckets (cero PII en logs), el runner descarga y descifra temporalmente datos reales de producción. Mantén el repositorio **privado** o ejecuta `dr-drill.yml` en un **runner privado/self-hosted con logs restringidos** para cumplir Ley 1581 de 2012.

Procedimiento manual equivalente en terminal de emergencia (usando `--passphrase-fd 3` para no exponer la frase GPG en `ps aux` ni `.bash_history`):

```bash
# 1. Descifrar y restaurar el backup de BD sobre una instancia Postgres 17 limpia:
gpg -d --batch --yes --passphrase-fd 3 3<<<"$BACKUP_GPG_PASSPHRASE" \
  lucams-2026-11-01.sql.gz.gpg | gunzip | psql "$RESTORE_DIRECT_URL" -v ON_ERROR_STOP=1

# 2. Verificar conteos e invariantes de seguridad sobre la BD restaurada:
DATABASE_URL="$RESTORE_DIRECT_URL" node packages/db/scripts/verify-security-posture.mjs
DATABASE_URL="$RESTORE_DIRECT_URL" node packages/db/scripts/verify-cms-v2-integrity.mjs

# 3. Inspeccionar o extraer el backup de Storage sin dejar el passphrase en historial:
gpg -d --batch --yes --passphrase-fd 3 3<<<"$BACKUP_GPG_PASSPHRASE" \
  lucams-storage-2026-11-01.tar.gz.gpg | tar -tzf - | head -n 30
```

#### Drill #3 — Instant Rollback de cómputo en Vercel (`< 5 min`)

Cuando un despliegue nuevo en `production` introduce una regresión de código pero la base de datos sigue intacta:

```bash
# 1. Listar los deployments recientes de producción e identificar el último estable:
vercel ls --prod

# 2. Promover instantáneamente el deployment previo sano al alias lucamsshop.com (sin rebuild):
vercel promote <url-deployment-previo-sano> --yes

# 3. Ejecutar el smoke test de producción para confirmar restablecimiento:
SMOKE_BASE_URL=https://lucamsshop.com node apps/web/scripts/post-deploy-smoke.mjs
```

#### Calendario obligatorio de simulacros DR

| Frecuencia                       | Ventana programada                      | Simulacro / Actividad                                                                                                                 | Responsable / Evidencia                                                                      |
| -------------------------------- | --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| **Diaria (automática)**          | `07:13 UTC` (`02:13 COT`)               | Respaldo cifrado de BD + Storage hacia Cloudflare R2 (`backup.yml`) + latido a `/api/cron/backup-heartbeat`                           | Run verde en GitHub Actions; regla `backup_stale` alerta si pasan `> 36 h` sin latido.       |
| **Mensual (automática — día 2)** | Día `2` de cada mes `08:27 UTC`         | **Drill #2 completo** (`dr-drill.yml`: `drill` BD + `drill-storage` binarios)                                                         | Artefacto de ejecución en GitHub Actions; alerta de fallo en GitHub Actions si no cuadra.    |
| **Mensual (automática — día 5)** | Día `5` de cada mes `11:23 UTC`         | Vigilancia RDAP de `lucamsshop.com` (`domain-watch.yml` → `POST /api/cron/domain-watch`)                                              | Baseline en `AlertState`; alerta por vencimiento (`60/30/14/7/3/1` días) o cambio de NS/EPP. |
| **Trimestral (Q1–Q4, asistida)** | Primera semana de ene / abr / jul / oct | **Drill #3** en Preview/PRD + ensayo de **modo mantenimiento** + revisión de **Drill #1** y rotación preventiva de secretos si aplica | Revisión humana del equipo técnico verificando RTO real `< 4 h`.                             |

---

## 10. Runbooks detallados de respuesta a incidentes

### 10.1 Orden estancada en `PENDING_PAYMENT`, retraso de webhook Wompi o cobro multi-transacción

- **Síntoma:** el cliente reporta débito exitoso en su banco/Nequi, pero el pedido `LCM-YYYY-NNNN` sigue en `PENDING_PAYMENT` o aparece en `/admin/pedidos?reconcile=1` (`needsReconciliation = true`).
- **Diagnóstico:**
  1. Abre `/admin/pedidos/[number]` y revisa la tabla `WompiPaymentTransaction` asociada a la orden y el `wompiTransactionId` principal.
  2. Si el webhook de Wompi aún no llegó, consulta en `comercios.wompi.co` por la referencia `LCM-YYYY-NNNN`. El job `lucams-expire-pending-orders` (cada 15 min) consulta proactivamente la API de Wompi antes de expirar órdenes con `> 30 min`, por lo que pagos `APPROVED` rezagados suelen autoconciliarse en el siguiente ciclo.
  3. **Caso multi-transacción (`flagForeignApprovedPayment`):** si el cliente intentó pagar dos veces y se aprobaron dos transacciones distintas para la misma orden, el receptor marca `Order.needsReconciliation = true` sin duplicar despacho.
- **Resolución:** verifica en Wompi cuál ID de transacción conservar y anula/reembolsa la transacción duplicada directamente en `comercios.wompi.co`; luego limpia la bandera de conciliación desde `/admin/pedidos/[number]` dejando nota en auditoría.

### 10.2 Colisión concurrente por la última unidad de stock (`notifyStockSaleLost`)

- **Síntoma:** llega alerta de `notifyStockSaleLost` (deduplicada cada 6 h) y una orden pagada aparece con `needsReconciliation = true`.
- **Causa arquitectónica:** en Lucams Shop **no existe reserva temporal de inventario en checkout** (el modelo legado de reservas fue retirado para impedir bloqueo de stock por carritos abandonados). El descuento atómico (`stock >= quantity`) ocurre únicamente en la transición verificada a `PAID`. Si dos compradores pagan exactamente al mismo segundo la última unidad física, el primero descuenta el stock y el segundo queda registrado en `PAID` con `needsReconciliation = true`.
- **Resolución:** revisa en taller si es factible producir la unidad adicional en el turno actual; si lo es, repón `+1` en `/admin/inventario` y procesa el pedido normalmente. Si es un artículo agotado no fabricable, contacta al comprador de inmediato, ejecuta el reembolso en Wompi y aplica §8.4 (`refundOrder`).

### 10.3 Orden `PAID` sin guía generada en Aveonline

- **Síntoma:** la orden está en `PAID` / `PROCESSING`, pero `trackingNumber` sigue vacío o `/admin/pedidos` muestra error de despacho.
- **Orden exacto de diagnóstico:**
  1. Lee `Order.shipmentLastError` en `/admin/pedidos/[number]`.
  2. Busca en `/admin/errores` (`ErrorLog`) entradas con código/contexto `shipping.aveonline.createshipment.fail`.
  3. Consulta `GET /api/health/aveonline` (autenticado con `Bearer $CRON_SECRET`) para descartar credenciales vencidas, saldo insuficiente en billetera Aveonline o caída de la API de la transportadora.
  4. Si el error es `MissingShippingDimsError`, audita pesos y dimensiones con `node packages/db/scripts/shipping-dims-audit.mjs` y completa las medidas del producto/variante en `/admin/productos`.
- **Resolución:** corregida la causa (dimensiones, dirección Dane o saldo en Aveonline), reintenta la emisión de guía desde `/admin/pedidos/[number]`. Una vez emitida, si el webhook de Aveonline fallara más adelante, el job `lucams-tracking-sync` (`4,19,34,49 * * * *`) sincroniza estados cada 15 min.

### 10.4 Fallos en `RenderJob` 300 DPI o decodificación de imagen en `sharp@0.35.5`

- **Síntoma:** un `RenderJob` pasa a `FAILED` tras 3 intentos, queda bloqueado en `PROCESSING` o la descarga ZIP en `/produccion` responde HTTP `409`.
- **Diagnóstico y resolución:**
  - Si un worker murió a mitad de ejecución, espera a que venza el lease de **5 minutos** (`lockedAt`): el siguiente pulso de `lucams-process-render-jobs` lo retomará automáticamente desde `doneUnits`.
  - Si `lastError === 'NEEDS_KONVA'`, abre `/admin/pedidos/[number]/produccion` en navegador de escritorio para completar el render asistido y subir el asset final.
  - Si `lastError` reporta imagen corrupta o límite de píxeles excedido en [`sharp-safe.ts`](../apps/web/features/personalization/sharp-safe.ts), descarga el archivo original desde `customer-uploads`, valida que no esté truncado, re-encola el job desde `/produccion` o coordina con soporte al cliente el reemplazo de la fotografía dañada.

### 10.5 Correo transaccional que no llega al cliente (Resend / Svix)

- **Síntoma:** el cliente no recibe OTP de acceso, confirmación de compra o guía de envío.
- **Diagnóstico y resolución:**
  1. Verifica que `EMAIL_SEND_DISABLED` no sea `"true"` en el ambiente y consulta `GET /api/health/email`.
  2. Busca el destinatario en `EmailDeliveryLog` y verifica que no esté listado en `EmailSuppression` por rebote duro (`bounced`) o queja (`complained`).
  3. Revisa en el dashboard de Resend el estado del mensaje y del endpoint Svix (`/api/webhooks/resend`). **Regla de oro:** en la suscripción del webhook de Resend mantén activos únicamente `email.sent`, `email.delivered`, `email.delivery_delayed`, `email.bounced` y `email.complained`; jamás actives el grupo global `emails` (incluye `email.received` y contamina logs con HTTP `400`).

### 10.6 Proyecto Supabase en tier Free pausado por inactividad de 7 días

- **Síntoma:** `lucams-stg` (o un entorno en plan Free sin tráfico) rechaza conexiones TCP y `/api/health/db` falla con timeout o host inalcanzable.
- **Prevención activa:** en `PRD` el cron `uptime-monitor-prd` (cada 5 min) y los jobs `pg_cron` mantienen actividad constante; en `STG`, `uptime-monitor-prd` corre desde `lucams-stg` cada 5 min manteniendo despierto el proyecto.
- **Resolución si ocurre una pausa:** ingresa a `supabase.com/dashboard` → selecciona el proyecto pausado → pulsa **Restore project** (tarda ~2–5 min), verifica conectividad con `GET /api/health/db` y ejecuta `node packages/db/scripts/verify-security-posture.mjs`.

### 10.7 Fallo de build en Vercel o deploy de `production` que no actualiza `lucamsshop.com`

- **Síntoma A (build rojo):** revisa el log de compilación en Vercel; las causas típicas son `Root Directory` distinto de `apps/web`, falta de una variable `PROD_REQUIRED` / `FULL_MODE_REQUIRED` en [`apps/web/lib/env.ts`](../apps/web/lib/env.ts) o error de tipos que no pasó por `make check`.
- **Síntoma B (build `READY`, pero `lucamsshop.com` sigue sirviendo el commit anterior):** ocurre cuando Vercel deja el deployment con `stage` sin promover automáticamente el alias de dominio. Ejecuta:
  ```bash
  vercel ls --prod
  vercel promote <deployment-url-nuevo-ready> --yes
  SMOKE_BASE_URL=https://lucamsshop.com node apps/web/scripts/post-deploy-smoke.mjs
  ```

### 10.8 Edición directa en BD de CMS v2 o catálogo que no se refleja en tienda

- **Síntoma:** ejecutaste un script de sincronización (`sync-catalog-stg-to-prd.mjs`, `migrate-cms-v2.mjs`) o una corrección SQL directa y el storefront sigue mostrando el texto o producto anterior.
- **Causa:** los scripts CLI se conectan directo a PostgreSQL y no invalidan la Data Cache en memoria/CDN de las lambdas de Vercel (`revalidateTag` / `updateTag`).
- **Resolución:**
  - **Para textos, secciones y settings del CMS (`cms`):** entra a `/admin/contenido` y pulsa el botón **«Actualizar caché de contenido»** (invoca `revalidateCmsAction` → `updateTag("cms")` inmediato).
  - **Para catálogo y variantes (`catalog`):** edita y guarda cualquier producto en `/admin/productos` (dispara invalidación del tag `catalog`) o espera su ventana máxima de expiración automática (**5 minutos**, `revalidate: 300`).

### 10.9 Pérdida de dispositivo MFA TOTP de un administrador y reconfiguración SMTP Auth

- **Bloqueo de MFA TOTP (teléfono extraviado o dañado):**
  1. Verifica la identidad del miembro del equipo por canal secundario directo con dirección.
  2. Desde una estación autorizada con credenciales directas del ambiente, ejecuta primero en dry-run y luego con confirmación interactiva de host:
     ```bash
     EMAIL=operador@lucamsshop.com make admin-mfa-reset
     # Para aplicar en local/STG (en PRD requiere además LUCAMS_ALLOW_DESTRUCTIVE_REMOTE=1 y DIRECT_URL):
     cd packages/db
     EMAIL=operador@lucamsshop.com node scripts/admin-mfa-reset.mjs --apply
     ```
  3. El administrador inicia sesión inmediatamente en `/admin/login` y el proxy lo redirige a `/admin/seguridad` para enrolar su nuevo autenticador TOTP (`aal2`).
- **Desconfiguración de correos OTP de Supabase Auth:** si GoTrue vuelve al límite por defecto o pierde las plantillas en español, reaplica SMTP de Resend y los HTML de [`supabase/auth-templates/`](../supabase/auth-templates/) con:
  ```bash
  SUPABASE_ACCESS_TOKEN=... RESEND_API_KEY=... \
    node scripts/supabase-auth-email-config.mjs --ref <project-ref>
  ```

### 10.10 Alerta de vigilancia RDAP del dominio (`domain-watch.yml`) y errores en vivo sin BD

- **Alerta `domain-watch` (`/api/cron/domain-watch` + `AlertState`):**
  - El workflow mensual [`.github/workflows/domain-watch.yml`](../.github/workflows/domain-watch.yml) (día `5`, `11:23 UTC`) consulta RDAP de Verisign sobre `lucamsshop.com` (registrador **CO Internet / `mi.com.co`**) y reporta a `POST /api/cron/domain-watch` con `x-cron-secret`.
  - Si alerta por **proximidad de vencimiento (umbrales `60 / 30 / 14 / 7 / 3 / 1` días)**: renueva el dominio de inmediato en el panel titular de `mi.com.co` y re-ejecuta `domain-watch.yml` con `workflow_dispatch` para actualizar el baseline en `AlertState`.
  - Si alerta por **cambio inesperado de nameservers o pérdida de `clientTransferProhibited`**: trátalo como incidente de seguridad crítico (`P0`), audita accesos al registrador `mi.com.co` y Cloudflare con MFA y escala a dirección.
- **Diagnóstico de errores `500` cuando PostgreSQL está caído y `/admin/errores` no carga:** usa el extractor en vivo de lambdas de Vercel (no requiere conexión a BD):
  ```bash
  bash scripts/vercel-runtime-errors.sh lucamsshop.com 45
  ```

---

## 11. Verificación de límites Free/Pro contra documentación oficial, costos y escalamiento

### 11.1 Límites verificados por proveedor externo (Mandato de exactitud operativa)

| Proveedor y plan                  | Cuotas y límites técnicos verificados                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | Regla contractual / umbral de upgrade en Lucams Shop                                                                                                                                                                                                                                                | Fuente oficial verificada                                                                                                                                            |
| --------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Vercel** (`Hobby` vs `Pro`)     | **Hobby:** `100 GB` Fast Data Transfer/mes, `1M` Edge Requests, funciones Node con `maxDuration` hasta `60 s` (300 s con Fluid Compute), **1 cron Vercel/día** (no usamos Vercel Cron; usamos `pg_cron`). **Pro (\$20 USD/mes):** `1 TB` transferencia, comercialización permitida, soporte y analítica ampliada.                                                                                                                                                                                                             | **Obligatorio `Pro` antes de facturar comercialmente en `lucamsshop.com`:** los términos de Vercel establecen textualmente: _"Hobby accounts are restricted to non-commercial personal use only."_ (`STG`/desarrollo personal puede operar en Hobby; tienda comercial activa exige **Vercel Pro**). | [Vercel Fair Use & Hobby Restriction](https://vercel.com/docs/limits/fair-use-guidelines) · [Vercel Functions Limits](https://vercel.com/docs/functions/limitations) |
| **Supabase** (`Free` vs `Pro`)    | **Free (\$0):** `500 MB` DB Postgres, **`1 GB` Storage**, `5 GB` egress, `50 000` MAU Auth, **pausa tras 7 días sin actividad**, sin PITR nativo. **Pro (\$25 USD/mes):** `8 GB` DB, `100 GB` Storage, `250 GB` egress, backups diarios nativos + PITR opcional, cero pausas por inactividad.                                                                                                                                                                                                                                 | Alerta automática ámbar en **800 MB** de Storage (`80 %` de 1 GB) y monitoreo de tamaño de BD. Migrar `lucams-prod` a **Supabase Pro** al superar `350 MB` de BD, `800 MB` de Storage sostenidos o al requerir PITR continuo.                                                                       | [Supabase Pricing & Quotas](https://supabase.com/pricing) · [Supabase Storage Limits](https://supabase.com/docs/guides/storage/uploads/file-limits)                  |
| **Supabase `pg_cron` + `pg_net`** | Extensión nativa en Postgres sin cuota de invocaciones externas (reemplaza por completo Vercel Cron). _(Nota arquitectónica: `pgmq` fue evaluado y descartado en favor de `pg_cron` + tabla `RenderJob` en `public` con leases SQL atómicos)._                                                                                                                                                                                                                                                                                | Los 20 procesos programados usan _idle-skip_ SQL cuando no hay trabajo pendiente para minimizar llamadas HTTP hacia Vercel.                                                                                                                                                                         | [Supabase Cron Docs](https://supabase.com/docs/guides/cron)                                                                                                          |
| **Resend** (`Free` vs `Pro`)      | **Free (\$0):** **`3 000` emails/mes** y tope estricto de **`100` emails/día**, 1 dominio verificado (`lucamsshop.com`). **Pro (\$20 USD/mes):** `50 000` emails/mes **sin tope diario de 100/día**.                                                                                                                                                                                                                                                                                                                          | Con ~3–4 correos transaccionales por pedido + OTP de login, el tope de **100 correos/día** del plan Free se alcanza con ~20–25 pedidos diarios o campañas de recuperación; pasar a **Resend Pro** antes de lanzar pauta comercial masiva.                                                           | [Resend Pricing & Quotas](https://resend.com/pricing)                                                                                                                |
| **Cloudflare R2** (`Free tier`)   | **`10 GB`-mes** de almacenamiento, `1 000 000` operaciones Clase A (escrituras/listados) y `10 000 000` Clase B/mes, **$0 USD egress**.                                                                                                                                                                                                                                                                                                                                                                                       | Con retención de 30 días de dumps `.sql.gz.gpg` + `.tar.gz.gpg`, el consumo inicial permanece dentro del tramo gratuito; exceso marginal cuesta `\$0.015/GB-mes`.                                                                                                                                   | [Cloudflare R2 Pricing](https://developers.cloudflare.com/r2/pricing/)                                                                                               |
| **Cloudflare Turnstile** (`Free`) | Hasta **`1 000 000` verificaciones/mes** sin costo y sin fricción visual agresiva, con modo degradado auditable en servidor.                                                                                                                                                                                                                                                                                                                                                                                                  | Holgado para el tráfico de formularios públicos, cotizaciones, cupones y contacto.                                                                                                                                                                                                                  | [Cloudflare Turnstile Docs](https://developers.cloudflare.com/turnstile/plans/)                                                                                      |
| **Google Gemini API** (`ADR-058`) | `gemini-2.5-flash-lite` (`GEMINI_MODEL_PRIMARY`) con fallback automático a `gemini-2.5-flash` (`GEMINI_MODEL_FALLBACK`) por REST `v1beta` (`fetch` directo sin SDK npm, timeout `12 s`) para sugerencias creativas del Estudio y copiloto de soporte. En Free tier existen cuotas estrictas de RPM/RPD; en **Pay-as-you-go (Tier 1)** escala a fracción de centavo por millón de tokens. _(Proveedores comerciales alternativos evaluados al inicio del proyecto fueron descartados sin dejar SDKs ni variables en el repo)._ | Si `GEMINI_API_KEY` se omite, el costo y las llamadas externas son exactamente **\$0** (degradación limpia con `AiUnavailableError`). Activar facturación Tier 1 en Google AI Studio si el tráfico del Estudio supera la cuota gratuita.                                                            | [Gemini API Rate Limits & Pricing](https://ai.google.dev/gemini-api/docs/rate-limits)                                                                                |

### 11.2 Estructura mensual de costos fijos y variables

| Categoría                  | Servicio                                     | Etapa pre-lanzamiento / catálogo                        | Operación comercial activa (`full` mode)                                   | Naturaleza del costo    |
| -------------------------- | -------------------------------------------- | ------------------------------------------------------- | -------------------------------------------------------------------------- | ----------------------- |
| Hosting y funciones        | Vercel (`apps/web`)                          | \$0 (solo preview/no comercial)                         | **\$20 USD / mes** (Vercel Pro obligatorio para uso comercial)             | Fijo mensual            |
| Base de datos y Storage    | Supabase (`lucams-prod` + `lucams-stg`)      | \$0 (Free tier vigilado con purgas)                     | **\$0 – \$25 USD / mes** (Pro al crecer BD/Storage o activar PITR)         | Fijo mensual            |
| Correo transaccional y OTP | Resend                                       | \$0 (`≤ 100` correos/día, `≤ 3 000`/mes)                | **\$0 – \$20 USD / mes** (Pro al superar ~20 pedidos/día)                  | Fijo mensual por tramo  |
| Backups DR y DNS/WAF       | Cloudflare DNS + Turnstile + R2              | \$0 (dentro de Free tier de `10 GB`)                    | **\$0 – \$2 USD / mes**                                                    | Fijo / consumo marginal |
| Dominio oficial            | `lucamsshop.com` (registrador / `mi.com.co`) | Renovación anual prorrateada (~**\$12–\$18 USD / año**) | Vigilado mensualmente por `domain-watch.yml`                               | Anual                   |
| Pasarela de pagos          | Wompi Colombia (Bancolombia)                 | \$0 fijo mensual                                        | Comisión variable por transacción aprobada + IVA y retenciones aplicables  | Variable por venta      |
| Logística nacional y COD   | Aveonline                                    | \$0 fijo de plataforma                                  | Valor de cada flete despachado + comisión de recaudo contraentrega (`COD`) | Variable por guía       |
| IA opcional                | Google Gemini API                            | \$0 (sin `GEMINI_API_KEY` o Free tier)                  | \$0 – pago marginal por uso en Tier 1 (`gemini-2.5-flash-lite` / `flash`)  | Variable opcional       |

### 11.3 Matriz de canales de soporte, seguridad y escalamiento

| Dominio / Incidente                                     | Canal interno / Buzón oficial                                                                                                   | Escalación en proveedor externo                                                         |
| ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| Vulnerabilidades de seguridad y divulgación responsable | **`security@lucamsshop.com`** (`public/.well-known/security.txt`)                                                               | Rotación inmediata de credenciales en Vercel + Supabase Vault + Resend + GitHub Secrets |
| Privacidad, Habeas Data (Ley 1581) y bajas              | Panel `/admin/clientes` / flujo ARCO documentado en [`COMPLIANCE.md`](COMPLIANCE.md)                                            | Resend Suppressions + purga verificada en DB/Storage                                    |
| Atención al comprador, retractos y garantías            | **`hola@lucamsshop.com`** + WhatsApp oficial + `/admin/soporte`, `/admin/retractos` y `/admin/garantias`                        | Portal comercios Wompi (`comercios.wompi.co`) y portal operativo Aveonline              |
| Incidentes de infraestructura (`P0` caída total / DR)   | Alertas automáticas Resend → `ADMIN_NOTIFICATION_EMAIL` + Issues en GitHub (`uptime-monitor-prd`, `backup.yml`, `dr-drill.yml`) | Status pages oficiales: `vercel-status.com`, `status.supabase.com`, `resend-status.com` |

---

## 12. Lecciones operativas vigentes

1. **Jamás ejecutes `supabase stop` en la VM con Podman rootless:** usa siempre `make db-local-stop` / `make db-local-start` para no corromper el estado de red de los contenedores locales.
2. **En VMs con memoria RAM ajustada, detén la BD local antes de compilar producción:** ejecuta `make db-local-stop` antes de `make build` y vuelve a levantarla con `make db-local-start`.
3. **Nunca corras `vercel deploy` desde la raíz del monorepo:** la CLI empaquetaría el workspace entero (`> 100 MB`); todo despliegue a `STG` o `PRD` viaja por push/PR en GitHub con **Root Directory = `apps/web`**.
4. **Cualquier cambio en variables `NEXT_PUBLIC_*` requiere un Redeploy explícito en Vercel:** editar el valor en el panel de Vercel no altera un build ya compilado (crítico para `NEXT_PUBLIC_MAINTENANCE_MODE` y `NEXT_PUBLIC_STORE_MODE`).
5. **Usa siempre el pooler IPv4 (`:6543` en runtime y `:5432` en `DIRECT_URL`) y verifica el clúster exacto (`aws-0` en STG vs `aws-1` en PRD):** el host directo `db.<ref>.supabase.co` es IPv6-only y falla desde redes IPv4 y runners de GitHub Actions.
6. **En Vercel, no leas variables marcadas como `sensitive` en `Preview` vía CLI:** `vercel env pull --environment=preview` falla por diseño de seguridad de la API de Vercel.
7. **Protege el webhook de Resend:** suscribe únicamente los 5 eventos de entrega (`sent`, `delivered`, `delivery_delayed`, `bounced`, `complained`), nunca el grupo comodín `emails`.
8. **Toda herramienta CLI destructiva nace en `--dry-run` y pasa por `env-guard.mjs`:** revisa siempre el conteo impreso en seco antes de añadir `--apply`, y nunca exportes `.env.local.nube-backup` al correr Vitest.
9. **El stock físico nunca se copia de `STG` a `PRD`:** las variantes nuevas sincronizadas a producción nacen con `stock = 0` para conteo real en taller.
10. **En reembolsos, el dinero se devuelve primero en Wompi o banco y después se confirma en `/admin`:** `refundOrder` actualiza estado, inventario y cupones de forma atómica, pero jamás ordena giros automáticos ni anula guías ya emitidas en Aveonline.
11. **En PostgreSQL de Supabase el rol `postgres` no es `SUPERUSER`:** para `pg_restore --data-only` del CMS v2 no uses `--disable-triggers`; suelta y recrea en transacción las 3 FKs circulares de `CmsField` / `CmsFieldVersion` / `CmsListItem` (§6.3).
12. **Si la base de datos cae y `/admin/errores` no puede escribir ni leer `ErrorLog`, inspecciona las lambdas en vivo:** ejecuta `bash scripts/vercel-runtime-errors.sh lucamsshop.com 45` y apóyate en los correos de `uptime-monitor-prd` alojado en `lucams-stg`.
