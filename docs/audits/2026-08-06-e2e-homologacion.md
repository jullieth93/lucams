# Homologación E2E de flujos — LOCAL / STG / PRD (2026-08-06)

> Ejecución del PROMPT MAESTRO de certificación E2E (`docs/PROMPT_E2E_HOMOLOGACION.md`).
> Regla aplicada: CERO suposiciones — toda fila de la matriz tiene evidencia
> (screenshot, response, query o log) referenciada. Lo que no se ejecutó queda
> marcado PENDIENTE, nunca asumido.

## 1. Qué se entregó en esta sesión

1. **Mapa conceptual revisado** contra el repo real (sección 2).
2. **`apps/web/playwright.config.ts` reescrito**: projects `desktop-chrome`
   (1280×800) + `mobile-chrome` (390×844), ambiente explícito `E2E_ENV`,
   bypass Vercel condicional en `extraHTTPHeaders`, evidencia
   (trace retain-on-failure / screenshot on-failure / video on-first-retry /
   reporter json en CI), `globalSetup`/`globalTeardown`.
3. **POM + fixtures**: `tests/e2e/pages/{home,catalogo,pdp,estudio,carrito,
   cotizacion,admin-login,admin-dashboard,admin-cotizaciones,admin-contenido,
   admin-notificaciones}.ts` y `tests/e2e/fixtures/{run,data-factory,db,
   storage,auth}.ts` + `_setup/{env,global.setup,global.teardown}.ts`.
4. **Spec de integración admin→cliente** `homolog-admin-cms.spec.ts`
   ejecutado en LOCAL y STG (matriz en sección 4).
5. **Esta matriz** con evidencia y hallazgos (secciones 4-6).

## 2. Mapa conceptual — plan revisado contra el repo real

Verificado el 2026-08-06 directamente contra código/DB/ambientes (no desde el
prompt):

- **Config previa**: 1 project `chromium`, sin mobile, sin storageState, bypass
  inyectado por-spec (`preview-cert`). El gate CI y el nightly fijaban
  `--project=chromium` → ambos workflows actualizados a `--project=desktop-chrome`.
- **Specs existentes**: 37; helpers solo `_helpers/{axe-scan,totp}.ts`. No había
  POM ni fixtures ni global.setup.
- **Auth admin**: el admin real (`r.julliethhr@gmail.com`) tiene MFA TOTP
  enrolado en LOCAL/PRD (secret no disponible para automatización; STG por
  enrolar). El repo ya resolvía esto con **admins efímeros vía service role**
  (release-check-a1, cms-editing-flow, admin-mfa, catalog-mode) → se adoptó ese
  patrón en el `global.setup` (mismo camino de UI, borrado garantizado en
  teardown). El reto MFA real lo cubre `admin-mfa.spec.ts`.
- **CMS**: el storefront lee `publishedVersion.body` (join), no `CmsField.body`
  (que es el borrador) — `lib/cms.ts` + `features/cms/service.ts`. El spec lee
  el original desde la DB del ambiente (cero hardcoding, a diferencia de
  release-check-a1 que lo tiene quemado).
- **Limpieza**: `vitest-global-teardown.ts` purga por patrones (13+/15+ dígitos,
  `test-`/`itest`, `%.test`); `env-guard.mjs` bloquea PRD y remotos desconocidos,
  permite localhost + STG (ref `mjbdiqdkykhsixvqlrrp`). Setup/teardown E2E la
  reusan; `E2E_AUTH=1` en PRD hace throw.
- **Sin faker en deps** → generadores deterministas propios (no se agregaron
  dependencias). Bucket real de uploads: `customer-uploads` (sharp 0.34.4 ya
  era dep).

## 3. Ambientes verificados (2026-08-06, evidencia directa)

| Ambiente | App | DB | Verificación |
| -------- | --- | -- | ------------ |
| LOCAL | `http://localhost:4000` → 200 | Supabase podman (up 10h) | `/api/health/db` → `{"status":"ok"}` |
| STG | preview develop → 200 con bypass | `lucams-stg` | `/api/health/db` → 200 con bypass |
| PRD | `https://lucamsshop.com` | prod | solo lectura (env-guard) |

Campo CMS `home.categories.cta-all` antes de la corrida: MISMO id
(`cms6w6zzm002kjyimgioq74i2`) y MISMO body publicado ("Ver todas las categorías
y productos →") en LOCAL y STG (queries del 2026-08-06).

## 4. Matriz de homologación flujo × ambiente

Corridas canónicas del 2026-08-06 con el código final. Evidencia por fila en
`apps/web/tmp/e2e-homologacion/` (gitignored) y salidas de los runners.

| Flujo | LOCAL | STG | PRD |
| ----- | ----- | --- | --- |
| **admin→cliente CMS** `home.categories.cta-all` (editar→publicar→cliente ve→revertir→original) — desktop 1280×800 | ✅ 9/9 pasos, 1er intento | ✅ 9/9 pasos, 1er intento | ⛔ no corre (mutación prohibida; skip forzado en el spec) |
| **admin→cliente CMS** — mobile 390×844 | ✅ 9/9 pasos, 1er intento | ✅ 9/9 pasos, 1er intento | ⛔ idem |
| **smoke storefront** (home, /productos, /ayuda, /contacto, legal, /status, health, sitemap, robots) — desktop | ✅ 9/9 | ✅ 9/9 | ✅ 9/9 (read-only) |
| **smoke storefront** — mobile | ✅ 9/9 | ✅ 9/9 | ◻️ no corrido (read-only innecesario duplicado) |
| **flujo cotización Etapa 1** (home→catálogo→PDP→carrito→CTA WhatsApp→form + validación de vacíos) — `catalog-mode.spec` | ✅ 2/2 | ✅ 2/2 | ⛔ crea datos efímeros |
| **panel admin /admin/cotizaciones** (login + lista + filtros) — `catalog-mode.spec` | ✅ 2/2 | ✅ 2/2 | ⛔ crea admin efímero |
| **cotización Etapa 1 COMPLETA (submit real)** — `homolog-cotizacion.spec`: PDP→carrito→form (consent Ley 1581 + Turnstile test)→Quote PENDING en DB + Consent HABEAS_DATA + Notification QUOTE + confirmación con wa.me bien formado (número del ambiente, ítem, total, link) + carrito vacío + idempotencia (2º intento no duplica) — desktop | ✅ 11/11 pasos (COT-VR34B2) | ✅ 11/11 pasos (COT-W4Z96J) | ⛔ crea datos (skip forzado) |
| **cotización Etapa 1 COMPLETA** — mobile | ✅ 11/11 pasos (COT-PNUUPR) | ✅ 11/11 pasos (COT-SXE3M9) | ⛔ idem |
| **matriz de uploads del Estudio** — `homolog-estudio-uploads.spec`: consentimiento Ley 1581 obligatorio (CTA deshabilitado hasta aceptar derechos) → JPG/PNG/WebP → HEIC iPhone→JPEG server → >4.5 MB compresión cliente (11.22 MB→2.03 MB, 2400×1829px en DB) → >10 MB rechazo visible sin asset → no-imagen rechazada por magic bytes con mensaje — desktop | ✅ 15/15 pasos | ✅ 15/15 pasos | ⛔ crea assets (skip forzado) |
| **matriz de uploads del Estudio** — mobile (sidebar vía FAB+Sheet, banner cookies cerrado primero) | ✅ 16/16 pasos | ✅ 16/16 pasos | ⛔ idem |
| **cookies Ley 1581** — `homolog-cookies.spec`: banner 3 botones → modal 4 switches (necesarias bloqueadas ON) → granular (funcional+analíticas ON, marketing OFF) → cookie persistida + reload sin banner → /legal/cookies tabla + reabrir → **4 filas Consent por alcance con accepted correctos** (escenarios aceptar-todas / solo-necesarias / granular) — desktop y mobile | ✅ 8/8 pasos (3 escenarios) | ✅ 8/8 pasos (3 escenarios) | ⛔ escribe Consent (skip forzado) |
| **cruces admin→cliente §5.3** — `homolog-admin-cruces.spec` (desktop y mobile): ① toggle `COD_ENABLED` → chip contraentrega del hero flip+revert; ② desactivar producto → PDP soft-404 con la fila intacta en DB; ③ aprobar reseña pendiente → visible en la PDP con autor; ④ marcar leída notificación QUOTE → pill del nav desaparece/decrementa | ✅ 4/4 cruces | ✅ 4/4 cruces (COD revertido a `true`, 0 residuo) | ⛔ mutaciones (skip forzado) |
| **newsletter + unsubscribe** — `homolog-newsletter.spec`: suscribir con consent → Consent NEWSLETTER → **duplicado → "ya estabas suscrito" sin reenviar welcome** (fix H9) → baja HMAC (página + revocación revokesId) → re-suscripción → One-Click POST /api/unsubscribe | ✅ 7/7 pasos | ✅ 7/7 pasos | ⛔ escribe Consent/contacto Resend |
| **wishlist** — `homolog-wishlist.spec`: marcar en PDP → WishlistItem en DB → /mi-cuenta/favoritos lista → quitar → fila borrada; anónimo → /login?next=… sin romper | ✅ 4/4 pasos | ✅ 4/4 pasos | ⛔ escribe WishlistItem |
| **reseñas cliente** — `homolog-resenas.spec`: compra verificada (orden PAID) → submit 5★ → "gracias, la revisamos" (gate) → Review isApproved=false → PENDING invisible en PDP → duplicado bloqueado por gate (1 fila) | ✅ 6/6 pasos | ✅ 6/6 pasos | ⛔ crea Review/Order |
| **back-in-stock** — `homolog-back-in-stock.spec`: PDP agotado → suscribir con email → Subscription + Consent BACK_IN_STOCK → **re-stock por la UI admin (/admin/inventario)** → cron `x-cron-secret` → notifiedAt (aviso enviado) | ✅ 6/6 pasos | ✅ 6/6 pasos | ⛔ crea datos + email |
| **paridad de datos** (query directa a la DB del ambiente) | 612 productos / 572 categorías / 772 variantes / 115 ocasiones / 981 campos CMS / 50 migraciones | **idéntico a LOCAL** | homologado el 2026-08-05 (19 tablas idénticas, bitácora STATE) |

**Filas de §5.3 que NO aplican en modo catálogo** (documentadas, no forzadas):
cupones (Etapa 2 — el flujo de cotización no tiene campo de cupón) y "estado de
cotización visible en `/cotizacion/[token]`" (la página pública de confirmación
no muestra estado por diseño: solo número, ítems y CTA de WhatsApp — verificado
leyendo `app/cotizacion/[token]/page.tsx`).

Evidencia canónica del flujo admin→cliente (JSON con pasos, valores de DB y
screenshots del CTA visible):

- LOCAL: `results-local-desktop-chrome-e2e-cms-1785989076993.json`,
  `results-local-mobile-chrome-e2e-cms-1785989101556.json` (+ shots `1-baseline`
  / `2-variant` / `3-original`).
- STG: `results-stg-desktop-chrome-e2e-cms-1785989214506.json`,
  `results-stg-mobile-chrome-e2e-cms-1785989243580.json` (+ shots).
- Estado post-corrida verificado por query: `publishedBody` = texto original en
  AMBOS ambientes; 0 usuarios efímeros residuales; 0 productos/categorías de
  test creados hoy.

Evidencia del flujo de cotización completo (`results-…-e2e-quote-….json`):

- LOCAL: desktop `e2e-quote-1785992357040` (COT-VR34B2) / mobile
  `e2e-quote-1785992367550` (COT-PNUUPR).
- STG: desktop `e2e-quote-1785992509285` (COT-W4Z96J) / mobile
  `e2e-quote-1785992537993` (COT-SXE3M9).
- Limpieza verificada por query en ambos: 0 quotes de test vivas (soft-deleted),
  0 notificaciones/productos residuales, 0 buckets `quote:%`; las 2 filas
  `Consent` por ambiente QUEDAN (ledger legal append-only, marcadas con el RUN).
- STG: cada corrida disparó el email real de "nueva cotización" al admin (canal
  de venta — RESEND_API_KEY activa en previews). Esperado y documentado: 1
  correo por quote de prueba, cliente `Cliente Prueba <run-en-letras>`.

Evidencia de la matriz de uploads del Estudio (`results-…-e2e-upload-….json`,
producto del ambiente: `set-fotoimanes-cuadrados` leído de la DB):

- LOCAL: desktop `e2e-upload-1786015900605` / mobile `e2e-upload-1786015913636`.
- STG: desktop `e2e-upload-1786016085811` / mobile `e2e-upload-1786016115433`.
- Evidencia clave (idéntica en ambos): `11.22 MB → 2.03 MB · 2400×1829px` en la
  fila DesignAsset del grande (compresión cliente, regresión §4c cerrada contra
  la infraestructura REAL de Vercel, que fue donde el bug nació); HEIC del
  fixture real → `image/jpeg` en DB (§4b); >10 MB y no-imagen rechazados con
  alerta visible y SIN asset (§4d); warnings DPI legítimos registrados como
  información, no como fallo.
- Limpieza verificada por query: 0 DesignAsset residuales en LOCAL y STG; los
  objetos del bucket se borraron por path exacto (de las filas creadas).

Evidencia de cookies y cruces:

- Cookies (`results-…-e2e-cookies-….json`): LOCAL `1786017969143` (desktop) /
  `1786018000559` (mobile); STG `1786018131810` / `1786018148031`. Las filas
  Consent de las corridas QUEDAN en el ledger (append-only) marcadas con el
  User-Agent de prueba `lucams-e2e-homolog/<run>`.
- Cruces (`results-…-e2e-cruces-….json`): LOCAL `1786020310276` (desktop) /
  `1786020880341` (mobile); STG `1786021181788` / `1786021230974`. Post-corrida
  verificado por query en STG: `COD_ENABLED=true` (revertido), 0 reviews /
  notificaciones / productos residuales.
- Newsletter (`results-…-e2e-newsletter-….json`): LOCAL `1786034739244` /
  `1786034759851`; STG `1786035135998` / `1786035166656`. Filas Consent quedan
  en el ledger (email `<run>@e2e.test`); contacto Resend borrado por API.
- Wishlist (`results-…-e2e-wishlist-….json`): LOCAL `1786034944222` /
  `1786035021463`; STG `1786035607405` / `1786035625444`.
- Reseñas (`results-…-e2e-review-….json`): LOCAL `1786037597827` /
  `1786037606956`; STG `1786037770185` / `1786037794594`. Orden TEST borrada
  completa (0 residuo verificado).
- Back-in-stock (`results-…-e2e-bis-….json`): LOCAL `1786041529333` /
  `1786041534390`; STG `1786041744227` / `1786041773580`. **0 residuo
  verificado en ambos** (suscripción, producto, categoría e InventoryLog).

## 5. Hallazgos

**H1 — (harness, corregido) `fill()` no despierta React tras navegación SPA al
editor CMS.** El input inline de `/admin/contenido` (`field-row.tsx`) habilita
Guardar solo con `isDirty`; tras SPA-nav a una página ya montada en la sesión,
el evento sintético de `fill()` no siempre llega al `onChange` de React 19 →
botón disabled permanente. Reproducido con specs de diagnóstico desechables
(diag3/diag5): **el tipeo real sí funciona siempre → NO es bug de la app** (un
admin humano no la padece); es artefacto del harness. Fix en el POM
(`pages/admin-contenido.ts`): reload duro al entrar al editor + interacción por
teclado real (click → select-all → borrar → `pressSequentially`) con
`toPass(fill→valor→habilitado)`. Tras el fix: 4/4 corridas deterministas
(LOCAL+STG × desktop+mobile, 1er intento).

**H2 — (proceso, corregido en el diseño) baseline con CMS viejo por caché del
servidor.** La primera versión del spec leía la baseline sin invalidar la caché
`unstable_cache("cms")` del servidor → veía la variante de una corrida anterior.
Fix: paso `admin-cache-refresh` al inicio (patrón ya documentado en
release-check-a1). La reversión garantizada (afterAll por DB + red del
global.teardown) quedó demostrada en las corridas fallidas: la DB nunca quedó
con la variante publicada.

**H3 — (entorno local, documentado) `.next/dev/types/validator.ts` se corrompe
intermitentemente** (escritura no atómica de Turbopack dev) y rompe
`pnpm typecheck` con errores de sintaxis en archivo generado. No aplica a CI
(build limpio) ni indica problema de código. Workaround: borrar el archivo y
re-correr. Candidato a exclusión en tsconfig si se vuelve frecuente.

**H4 — (limpieza, cerrado) huérfanos de la corrida matada por timeout.** El
primer run de homologación murió por timeout de shell (300s) sin correr el
global.teardown → quedaron el admin y el cliente efímeros de ESE setup en
LOCAL. Borrados a mano (verificado: 0 residuales; los 46 productos/categorías
`e2e-*` que quedan en LOCAL y STG son soft-deleted HISTÓRICOS de sesiones
previas — 0 creados hoy — invisibles en el storefront y cubiertos por la red
de limpieza del repo).

**H5 — (harness, corregido) la misma carrera de hidratación aplica al form de
cotización.** `quote-form.tsx` manda `customerWhatsapp`/`department`/`city` en
hidden inputs alimentados por estado React: un `fill()` pre-hidratación los
deja vacíos y el submit muere en Zod con el genérico "Revisa los campos
marcados". Fix en el POM `pages/cotizacion.ts`: llenado dentro de `toPass`
exigiendo los EFECTOS React (hidden con valor, checkbox marcado) + submit que
falla RUIDOSO con el mensaje real del servidor en vez de un timeout opaco.
Lección reusable: en esta stack (Next 16 + React 19 + useActionState) ningún
spec debe confiar en `fill()` a pelo sobre inputs controlados — siempre con
aserción del efecto.

**H6 — (datos de prueba, corregido) el schema Zod manda sobre el RUN.**
`QuoteFormSchema.customerName` solo admite letras; el nombre de prueba con el
timestamp en dígitos fue rechazado ("El nombre solo puede tener letras").
`fakeCustomer` ahora codifica el timestamp en letras (0→a…9→j) y la llave de
limpieza va en el email (`<run>@e2e.test`), que sí admite el RUN completo.
Detectado gracias al error ruidoso de H5.

**H7 — (app, CORREGIDO y verificado en STG) el mensaje de rechazo >10 MB
difería entre LOCAL y STG.** En STG el usuario veía el genérico ("Revisa tu
conexión…") porque Vercel responde el 413 con HTML no-RSC y el regex `tooBig`
de `studio-sidebar.tsx` no reconocía el "An unexpected response…" de Next. Fix
(`ad76d77`): `tooBig` cubre también "unexpected response" y cualquier archivo
preparado >10 MB. Verificado: tras el deploy, STG muestra el hint de tamaño
("es muy grande para el servidor. Prueba con una foto de menos de ~4 MB…").

**H8 — (app, CORREGIDO y desplegado) el banner de cookies tapaba el FAB de
edición del Estudio en mobile.** Ambos `fixed` abajo: el FAB quedaba
inalcanzable hasta cerrar el banner. Fix (`ad76d77`): el banner dispara de
verdad el evento documentado `cookie-consent-changed` y el FAB sube
(`bottom-28`) mientras no haya consentimiento persistido, volviendo a su sitio
al elegir. Verificado E2E en LOCAL y en STG tras el deploy.

**H9 — (app, CORREGIDO y verificado en STG) la idempotencia del newsletter
estaba rota: Resend hace UPSERT, nunca 409.** El servicio asumía que un
duplicado devolvía 409/422 para marcar `alreadySubscribed`; verificado contra
`api.resend.com` que devuelve **201 siempre** (upsert) → el duplicado mostraba
"¡Listo! Te avisaremos del lanzamiento" y reenviaba el welcome, y la
re-suscripción tras una baja no creaba el nuevo `accepted` en el ledger (la
fila `accepted` original nunca se voltea; la baja es otra fila). Fix
(`5485166`): regla única `isNewsletterSubscribed()` — vigente = `accepted`
(misma versión del aviso) SIN revocación posterior — usada por el pre-check y
por `persistConsent`. Duplicado ahora: "Ya estabas suscrito" sin tocar Resend
ni reenviar. Verificado E2E en LOCAL y STG (7/7 pasos).

**H10 — (harness, no es bug de app) hidratación lenta del preview en arranque
frío.** El `CompactStockEditor` de /admin/inventario parecía "no hidratar" en
STG: es LATENCIA del primer hit serverless (>12-20s hasta que el island cobra
vida; en LOCAL es inmediata). Con espera activa de la señal React (sonda
estricta de una tecla exigiendo el botón habilitado) el flujo corre idéntico
en ambos. Queda como observación operativa: las páginas admin del preview
tienen cold-start de hidratación alto en el primer hit; usuarios reales lo
perciben como un input "muerto" por unos segundos en la primera visita fría.

**H11 — (app, cosmético, documentado — no requiere acción) el thanks-div del
ReviewForm es inalcanzable.** Tras el submit de una reseña, `revalidatePath`
re-renderiza la PDP y el gate de `product-reviews.tsx` reemplaza de inmediato
el mensaje de éxito del ReviewForm por "Ya dejaste tu reseña de este producto
✨ ¡Gracias por opinar!". El usuario ve una confirmación equivalente (la del
gate), así que el div de éxito propio del ReviewForm es código muerto en la
práctica. La aserción E2E usa el texto del gate (la señal real y persistente).

**Limpieza InventoryLog (suite, corregida):** las variantes con re-stock por la
UI admin acumulan filas `InventoryLog` (Restrict) que bloqueaban el borrado del
producto efímero — el `catch` de la factory lo tragaba dejando residuo vivo.
`deleteEphemeralProduct` ahora borra `inventoryLog` antes de la variante;
verificado 0 residuo en LOCAL y STG tras corridas canónicas.

**Sin hallazgos de homologación de flujo**: todos los flujos ejecutados se
comportan idéntico en LOCAL y STG; las únicas diferencias observadas son las
intencionales de §3 del prompt (dev server Turbopack vs build Vercel, latencia,
bypass header, email real al admin solo donde el ambiente lo envía).

## 6. Cómo reproducir

```bash
# LOCAL (stack podman + app en :4000, ver make local-up):
cd apps/web && E2E_ENV=local E2E_AUTH=1 pnpm exec playwright test homolog-admin-cms

# STG (preview develop con bypass — lo toma de .env.stg):
cd apps/web && E2E_ENV=stg E2E_AUTH=1 pnpm exec playwright test homolog-admin-cms

# Flujo de cotización Etapa 1 (submit real; anónimo — no necesita E2E_AUTH):
cd apps/web && E2E_ENV=local pnpm exec playwright test homolog-cotizacion
cd apps/web && E2E_ENV=stg pnpm exec playwright test homolog-cotizacion

# Matriz de uploads del Estudio (anónimo; genera y borra assets/objetos):
cd apps/web && E2E_ENV=local pnpm exec playwright test homolog-estudio-uploads
cd apps/web && E2E_ENV=stg pnpm exec playwright test homolog-estudio-uploads

# Cookies Ley 1581 (anónimo; Consent queda en el ledger marcado con UA de prueba):
cd apps/web && E2E_ENV=local pnpm exec playwright test homolog-cookies
cd apps/web && E2E_ENV=stg pnpm exec playwright test homolog-cookies

# Cruces admin→cliente §5.3 (requiere storageState — E2E_AUTH=1):
cd apps/web && E2E_ENV=local E2E_AUTH=1 pnpm exec playwright test homolog-admin-cruces
cd apps/web && E2E_ENV=stg E2E_AUTH=1 pnpm exec playwright test homolog-admin-cruces

# Newsletter (anónimo; Consent queda en el ledger, contacto Resend se borra):
cd apps/web && E2E_ENV=local pnpm exec playwright test homolog-newsletter
cd apps/web && E2E_ENV=stg pnpm exec playwright test homolog-newsletter

# Wishlist (cliente efímero del setup — E2E_AUTH=1):
cd apps/web && E2E_ENV=local E2E_AUTH=1 pnpm exec playwright test homolog-wishlist
cd apps/web && E2E_ENV=stg E2E_AUTH=1 pnpm exec playwright test homolog-wishlist

# Reseñas cliente (E2E_AUTH=1 — siembra orden PAID del cliente efímero):
cd apps/web && E2E_ENV=local E2E_AUTH=1 pnpm exec playwright test homolog-resenas
cd apps/web && E2E_ENV=stg E2E_AUTH=1 pnpm exec playwright test homolog-resenas

# Back-in-stock (E2E_AUTH=1 — re-stock por la UI admin + cron x-cron-secret):
cd apps/web && E2E_ENV=local E2E_AUTH=1 pnpm exec playwright test homolog-back-in-stock
cd apps/web && E2E_ENV=stg E2E_AUTH=1 pnpm exec playwright test homolog-back-in-stock

# Smoke read-only en PRD (sin E2E_AUTH — nunca muta):
cd apps/web && E2E_ENV=prd pnpm exec playwright test smoke --project=desktop-chrome
```

Artefactos por corrida (gitignored): `apps/web/tmp/e2e-homologacion/`
(JSON `results-<env>-<project>-<run>.json` con pasos/valores DB + screenshots).
Los storageState viven solo en `apps/web/tests/e2e/.auth/<env>/` (gitignored)
y los usuarios efímeros se borran en el teardown global.
