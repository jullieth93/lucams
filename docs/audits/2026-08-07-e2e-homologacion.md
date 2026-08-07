# Homologación E2E — §6.21 rate-limit/CSRF + §8 webhooks + cross-browser + §7.5 (parcial) (2026-08-07)

> Continuación del PROMPT MAESTRO (`docs/PROMPT_E2E_HOMOLOGACION.md`), segunda
> jornada. La matriz §6 modo catálogo quedó cerrada el 2026-08-06 (ver
> `2026-08-06-e2e-homologacion.md`). Esta sesión cubre la cola restante:
> §6.21, §8 (webhooks sintéticos), cross-browser ampliado, un incremento de
> §7.5 y la evaluación del nightly. Regla aplicada: CERO suposiciones — toda
> afirmación con evidencia (response, query, screenshot o log).

## 1. Qué se entregó en esta sesión

1. **`homolog-rate-limit.spec.ts`** (§6.21) — verificado en LOCAL y STG ×
   desktop/mobile.
2. **`homolog-webhooks.spec.ts`** (§8 + incremento §7.5.2) — verificado en
   LOCAL y STG × desktop/mobile.
3. **Hallazgo H16 (config STG, corregido)**: `RESEND_WEBHOOK_SECRET` no
   existía en el scope Preview de Vercel → el webhook de Resend en STG
   rechazaba eventos con firma VÁLIDA (401 fail-closed). Se agregó la var
   (sensitive, mismo valor que `.env.stg`) y se desplegó preview fresco.
4. **Cross-browser §8**: projects `desktop-firefox` + `desktop-webkit` en
   `playwright.config.ts` (smoke read-only). Firefox 9/9 en LOCAL y STG;
   WebKit verificado NO ejecutable en Oracle Linux 9 (deps del SO).
5. **Fix CI roja en develop** (causada por el aterrizaje de la familia
   `homolog-*`): el filtro `estudio` de `ci.yml`/`nightly-full.yml` matcheaba
   `homolog-estudio-uploads.spec.ts` → filtros anclados a `<nombre>.spec`.
6. **Evaluación homolog-* en nightly** (sección 5): NO cablear todavía;
   criterio y diseño propuesto.
7. **§7.5 (Etapa 2)**: incremento verificable en build catálogo entregado
   (monto adulterado → `needsReconciliation`); el resto de la suite modo
   `full` queda planificado (sección 6).

## 2. Adaptación honesta de §6.21 al sistema real

El prompt pide "429 tras N intentos…". Verificado leyendo el código: las
acciones de login/registro/cotización/contacto son **Server Actions** — no
devuelven 429 sino `{error}` con mensaje claro que la UI muestra en
`role="alert"` (el 429 literal solo existe en API routes: `/api/unsubscribe`,
`/api/log-error`, `/api/vitals`). Lo que se certifica es el COMPORTAMIENTO
exigido, con el bucket real de `rate_limit_buckets` como prueba en DB:

| Flujo | Límite real (código) | Lo que ejecuta el spec | Resultado |
| ----- | -------------------- | ---------------------- | --------- |
| login | 50/15 min (`login:ip` + `login:email`; `isProd = VERCEL_ENV==="production"`) | Loop REAL por UI con contraseña errada | Bloquea en el intento **51** con "Demasiados intentos…"; ambos buckets en 51 en DB |
| registro | 30/hora (`signup:email`) | El schema zod + consent + Turnstile van ANTES del rate-limit → un loop real necesitaría 30 Turnstiles frescos. Se pre-siembra el bucket con la MISMA función SQL de la app (`rate_limit_check` ×30) y se hace 1 intento real por UI | Mensaje "demasiados intentos de registro" visible y **0 Customer creado** en DB |
| contacto | 3/día (`contact:email`) | 4 envíos REALES por UI mismo email | 3 `SupportTicket` OPEN + 4º con "recibimos varios mensajes desde tu cuenta hoy"; bucket en 4 |
| cotización | 3/día (`quote:phone` + `quote:ip`) | (a) doble submit: click + `requestSubmit()` concurrente con el POST retardado 1.5 s (ventana determinista de pending); (b) 4 envíos reales mismo WhatsApp | (a) botón `disabled` en pending + claim atómico del carrito → **exactamente 1 Quote** en DB (el desenlace visible puede ser redirect, "ya recibimos esta cotización" o "carrito está vacío" según dónde caiga el 2º dispatch — el invariante es la DB); (b) 3 Quotes + 4ª bloqueada con mensaje; buckets phone=4, ip=4 |

**CSRF (origen adulterado)**: POST de server action a `/login` con
`Origin: https://evil.example` → **500 "Invalid Server Actions request"**
(rechazo PRE-dispatcher de Next 16; el MISMO request con el origen correcto
llega al dispatcher y responde 404 action-not-found — el contraste prueba que
el chequeo de origen corre primero). Prueba de que nada se ejecutó: buckets
`login:%` intactos en 0. Además `/api/vitals` con origen adulterado → **403
Forbidden** (proxy CORS); con origen bueno → 400 (zod) = handler alcanzado.

## 3. Webhooks sintéticos (§8) — sin compras ni guías reales

Se golpean las rutas REALES del ambiente por HTTP (LOCAL `:4000` / STG con
bypass) con eventos sintéticos firmados con los secrets del propio ambiente
(cargados del `.env` por `_setup/env` — nunca hardcodeados):

| Webhook | Aserciones ejecutadas (todas con evidencia DB/response) |
| ------- | ------------------------------------------------------ |
| Wompi `POST /api/webhooks/wompi` | GET → 405 · checksum adulterado → 401 `invalid signature` · firma válida con orden inexistente → 200 `order not found, ignored` + `WebhookEvent` sellado · MISMO evento otra vez → 200 `already processed` (1 sola fila) · timestamp 26 h → 401 `timestamp out of window` (ventana 25 h — la ventana de 5 min mataba los reintentos legítimos de Wompi, ver ADR en código) · **environment-match dinámico**: exactamente UNO de `{test, prod}` es aceptado y el otro → 401 `environment mismatch` (la aserción no asume `WOMPI_ENV`, lo descubre) |
| Resend `POST /api/webhooks/resend` (Svix) | sin headers → 401 · firma adulterada → 401 · firma válida (HMAC-SHA256 base64 sobre `${id}.${ts}.${rawBody}`) → 200 + `EmailEvent` por `resendId` en DB · reintento del mismo evento → 200 y sigue 1 fila (upsert) · `svix-timestamp` 10 min viejo → 401 (tolerancia 5 min) |
| Aveonline `POST /api/webhooks/aveonline` | GET → 405 · secret malo DE LA MISMA LONGITUD que el real → 401 `invalid secret` (el rechazo no depende del largo — comparación timing-safe `lib/timing-safe.ts`) · guía sintética inexistente firmada → 200 + `WebhookEvent` sellado (saga `no_match`) · MISMO evento → 200 `already processed` (1 fila) · secret por query-string también aceptado (rama documentada en código como deuda: viaja en logs) |
| **Wompi §7.5.2 — monto adulterado** | orden `PENDING_PAYMENT` sembrada (ítem + variante con stock conocido) + evento APPROVED firmado con `amount_in_cents ≠ total` → 200 `amount mismatch, manual review` + `needsReconciliation=true` con motivo + orden **sin transicionar** + **stock intacto** + `WebhookEvent` sellado. No llama nada externo. (El camino APPROVED feliz → saga → guía Aveonline ya lo cubre `wompi-sandbox.spec.ts` contra sandbox.) |

Limpieza verificada por diseño del spec: `WebhookEvent`/`EmailEvent` del RUN,
orden e ítems y producto efímero se borran en `afterAll` (patrón
hijas→madres); en PRD el spec entero hace skip (escribe tablas de eventos).

## 4. Hallazgos de la sesión

### H16 (config STG, CORREGIDO) — `RESEND_WEBHOOK_SECRET` ausente en Vercel Preview

- **Síntoma**: `homolog-webhooks` Resend en STG → 401 con firma VÁLIDA
  (evidencia: `results-stg-*-resend.json` de las corridas previas al fix).
- **Causa raíz** (evidencia: `vercel env ls`): la var existía solo en scope
  **Production** (creada 5 días antes); Preview nunca la tuvo. La ruta es
  fail-closed en `NODE_ENV=production` (la preview corre como prod) → 401 a
  todo evento, firmado o no.
- **Impacto operativo real**: bajo — el webhook registrado en el dashboard de
  Resend apunta a `lucamsshop.com` (PRD sí tiene la var); ningún evento real
  de Resend se entrega al preview. Era un gap de homologación, no de negocio.
- **Fix**: var agregada al scope Preview vía API de Vercel (`type: sensitive`,
  mismo valor que `.env.stg`) + deploy fresco de develop (`7ba56f1` →
  `dpl_F2KAPxwsTMmMXfnUrmWiy4cok97U`, alias `git-develop` re-apuntado).
  Verificado: spec Resend verde en STG tras el deploy (matriz §7).
- **Trampas documentadas** (para el próximo):
  1. `vercel env pull` escribe `""` para las vars **sensitive** — NO significa
     que estén vacías (PRD "vacío" devolvía 401 configurado, no 503).
  2. `vercel env add` pide rama interactivamente aun con `--yes` (stdin no-TTY
     lo aborta) → usar la API `v10/projects/{id}/env?upsert=true`.
  3. `.env.stg` tiene comentarios inline tras el valor: parsear con dotenv
     (el parser de la app), nunca con `cut/sed` — el primer intento publicó
     valor+comentario (sha12 errado) y se corrigió con PATCH (sha12
     `cc3e2e3df1c1`).
  4. `vercel redeploy` reutiliza el snapshot de env del deployment original —
     las vars nuevas exigen un deploy FRESCO (push o `vercel deploy`).

### H17 (descartado con evidencia) — `AVEONLINE_WEBHOOK_SECRET` "vacío" en el pull

El `env pull` lo muestra como `""`, pero el preview en vivo responde 401 con
secret malo y 200 con el de `.env.stg` → la var está bien en el deployment; el
`""` es el artefacto sensitive del punto H16.1. Sin acción.

### Flakes de harness corregidos en la sesión (causa raíz, no se acomodó la prueba)

1. **POM cotización — strict violation**: `getByText(/pide tu cotización/i)`
   matcheaba también un `role="alert"` de validación previa → afinado a
   `getByRole("heading", …)` (`pages/cotizacion.ts`).
2. **Turnstile intermitente en /registro**: el widget rota el token entre la
   espera y el submit ("No pudimos verificar que no eres un robot"). La app
   misma prescribe al usuario recargar e intentar de nuevo → el test ejerce
   exactamente esa recuperación UNA vez; si persiste, falla (no se enmascara).
3. **CSRF `/api/vitals` → 429 inesperado**: los beacons RUM de las ~70 páginas
   que carga el test de rate-limit (mismo IP del runner) llenaban el bucket
   `vitals:<ip>` (120/60 s). El test CSRF ahora limpia el bucket `vitals` al
   inicio (mismo patrón que `login`) — usa solo `request`, sin páginas, así
   que queda determinista.
4. **Cold-start de STG** (documentado desde 2026-08-06 como H10): tras un
   deploy fresco, el primer POST a `/login` puede superar 20 s. Práctica del
   runner: precalentar `/`, `/login`, `/registro`, `/contacto`, `/carrito`,
   `/api/health` con el bypass antes de la corrida.
5. **Banner de cookies tapa el submit de /login en 390px** (STG mobile): el
   click quedaba interceptado, el POST nunca salía y el test moría en
   `waitForResponse` (20 s) — 3/3 intentos rojos en la canónica STG. Se
   descarta el banner una vez al entrar (`dismissCookieBanner`, patrón
   vigente; el consentimiento persiste en el contexto para las fases
   siguientes). Verificado: 2/2 al primer intento (`ed651c0`).

### CI roja en develop (corregida en la sesión)

Al aterrizar la familia `homolog-*` (commits del 2026-08-06/07), el paso
`playwright test smoke a11y axe compra estudio` del gate matcheó
`homolog-estudio-uploads.spec.ts` (substring `estudio`), que exige el catálogo
real (producto PHOTO_PACK) → rojo en 3 corridas de develop (31134920767,
31135442053, 31144209920). Fix: filtros anclados `<nombre>.spec` en
`ci.yml` y `nightly-full.yml`, verificado con `--list`: exactamente
smoke/a11y/axe/compra/estudio (9/9/2/2/9) sin fuga de homolog-*.

## 5. Evaluación — ¿meter los `homolog-*` al nightly?

**Veredicto: todavía NO.** La anotación decía "después de unos días estable":
la matriz se cerró el 2026-08-06 y esta sesión encontró 3 flakes de harness +
1 gap de config STG + 1 rotura de CI — la suite aún se está asentando. Diseño
evaluado con evidencia para cuando toque:

- **Opción A — nightly contra el localstack efímero del runner** (el nightly
  actual ya levanta Supabase local en CI). Bloqueantes verificados:
  (1) el seed CI (`seed-catalog-v2.mjs` ≈86 slugs + `migrate-cms-v2.mjs`)
  NO reproduce el catálogo/CMS real — p.ej. no existe `home.categories.cta-all`
  → `homolog-admin-cms` y los specs que leen datos específicos fallarían; hay
  que extender el seed CI o hacer esos specs más tolerantes.
  (2) El workflow no carga llaves Turnstile; los specs esperan token real →
  agregar las llaves de PRUEBA públicas de Cloudflare (no son secretos).
  (3) `E2E_AUTH=1` con las llaves deterministas del localstack: ya disponible.
  A favor: aislado, sin estado compartido, sin correos reales.
- **Opción B — nightly contra STG**. Costos verificados: secrets nuevos en
  GitHub (bypass + Supabase STG + DATABASE_URL); escribe en el STG compartido
  (limpieza probada, pero residuo si matan el job a mitad); **cada cotización/
  ticket de prueba envía email REAL al admin** desde previews (canal de venta
  activo — verificado hoy en las corridas STG): serían 4-6 correos nocturnos a
  `hola@lucamsshop.com`; cold-starts de 12-20 s alargan la corrida (LOCAL 3.6
  min vs STG 8.4 min para los 12 tests de hoy).
- **Recomendación**: soak local ~1 semana (correr la suite homolog en cada
  sesión); luego Opción A con un subset verde conocido que no exija catálogo
  real ni Resend (`homolog-seo`, `homolog-errores`, `homolog-ocasion`,
  `homolog-recomendador`, `homolog-3d`, `homolog-cookies`, `homolog-webhooks`,
  `homolog-rate-limit`) + extender el seed CI. Opción B solo si Lucy acepta
  los correos nocturnos o se agrega un mute de emails en previews.

## 6. §7.5 (Etapa 2, modo `full`) — estado y plan

- **Entregado hoy** (corre en el build catálogo actual, LOCAL+STG): monto
  adulterado → `needsReconciliation` + stock intacto (parte de §7.5.2).
- **Ya existía**: `wompi-sandbox.spec.ts` (checkout real invitado contra
  sandbox Wompi + Aveonline, ~10 min, frágil por anti-bot del hosted checkout;
  requiere `PW_CHANNEL=chromium`), `compra.spec.ts` (núcleo determinista),
  `admin-transactional.spec.ts` (admin sobre la orden PAID del e2e).
- **Factibilidad del build propio verificada hoy**: `NEXT_PUBLIC_STORE_MODE=full
  PORT=4100 pnpm dev` arranca y sirve la UI de pago (200, "Pago" visible).
  La suite dedicada corre con `NEXT_PUBLIC_STORE_MODE=full
  PLAYWRIGHT_BASE_URL=http://localhost:4100 E2E_ENV=local` (el runner lee el
  modo de la shell; `loadEnvFor` no pisa vars de shell).
- **Pendiente (próxima sesión dedicada)**: checkout registrado, pasarela por
  interceptación completa (éxito/DECLINED→reintento misma reference/timeout),
  COD (toggle + pedido sin pago + ledger), cupones, stock (reserva/decremento/
  oversold/liberación por cron), envíos (cotización multi-transportadora,
  selección sellada HMAC re-validada, `bloquegenerarguia="1"` en el payload),
  emails transaccionales. Todo LOCAL-only por definición: STG/PRD corren en
  modo catálogo y no deben cambiar.

## 7. Matriz de homologación — corrida canónica 2026-08-07

LOCAL = app `next dev` :4000 + stack podman · STG = preview develop
`dpl_F2KAPxwsTMmMXfnUrmWiy4cok97U` (commit `7ba56f1`) con bypass.
Evidencia JSON+screenshots: `apps/web/tmp/e2e-homologacion/results-*` del RUN
de cada corrida (prefijos `e2e-rl-`, `e2e-webhooks-`).

| Spec | LOCAL desktop | LOCAL mobile | STG desktop | STG mobile |
| ---- | ------------- | ------------ | ----------- | ---------- |
| §6.21 rate-limit (login 51 · registro · contacto 3+1 · cotización doble-submit + 3+1) | ✅ | ✅ | ✅ | ✅ |
| §6.21 CSRF (server action origen 500/404 · /api CORS 403/400) | ✅ | ✅ | ✅ | ✅ |
| §8 Wompi (firma 200/401 · dedup · env-match · 25 h) | ✅ | ✅ | ✅ | ✅ |
| §8 Resend Svix (firma · anti-replay · upsert) | ✅ | ✅ | ✅ | ✅ (tras fix H16) |
| §8 Aveonline (secret timing-safe · dedup · query) | ✅ | ✅ | ✅ | ✅ |
| §7.5.2 Wompi monto adulterado → needsReconciliation | ✅ | ✅ | ✅ | ✅ |
| smoke cross-browser Firefox | ✅ (9/9) | n/a | ✅ (9/9) | n/a |
| smoke cross-browser WebKit | ⛔ host OL9 sin deps (libicu74/libgtk-4) — documentado | n/a | ⛔ idem | n/a |

Comandos canónicos (3.6 min LOCAL, ~8.4 min STG):

```bash
cd apps/web
E2E_ENV=local pnpm exec playwright test homolog-rate-limit homolog-webhooks
E2E_ENV=stg   pnpm exec playwright test homolog-rate-limit homolog-webhooks
# cross-browser (smoke read-only):
E2E_ENV=local pnpm exec playwright test --project=desktop-firefox
E2E_ENV=stg   pnpm exec playwright test --project=desktop-firefox
```

Post-corrida: DBs LOCAL y STG verificadas sin residuo por query directa
(0 `WebhookEvent` / `EmailEvent` / `Order` E2E-TAMPER / `SupportTicket` /
`Quote` activa del RUN; buckets login/signup/contact/quote vacíos). Solo
quedan las filas `Consent` del ledger legal (51 en LOCAL, 28 en STG de todas
las corridas del día, marcadas con RUN — append-only por diseño) y las Quotes
soft-deleted que les corresponden. La celda STG-mobile de rate-limit quedó
certificada por la corrida dirigida posterior al fix del banner (2/2 verde);
el resto de celdas por la canónica.
