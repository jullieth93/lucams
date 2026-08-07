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
| **área /mi-cuenta** — `homolog-mi-cuenta.spec`: perfil (editar nombre/teléfono → DB) · direcciones (crear urbana → lista+DB → **default única** → editar → borrar con confirmación/soft-delete) · seguridad (cambio contraseña con re-auth → re-login con la nueva; usuario efímero dedicado auto-contenido) | ✅ 3/3 módulos | ✅ 3/3 módulos | ⛔ muta cuenta |
| **rastrear pedido** — `homolog-rastrear.spec`: número+email → /pedido/[token] con estado → **anti-enumeración: mensaje idéntico** para número inexistente y email equivocado → rate-limit 10/hora con mensaje claro | ✅ 3/3 pasos | ✅ 3/3 pasos | ⛔ crea orden + consume rate-limit |
| **recomendador wizard** — `homolog-recomendador.spec`: 4 pasos con h2 enfocado (WCAG 2.4.3) → resultados con productos REALES (link verificado en DB) → vacío con "Ajustar respuestas" → error del API con "Reintentar" (route.fulfill) | ✅ 4/4 pasos | ✅ 4/4 pasos | ◻️ read-only (no corre en PRD por alcance de corrida) |
| **landings de ocasión** — `homolog-ocasion.spec`: 2 landings top con h1 + productos reales (links verificados en DB) + breadcrumb sin link roto + JSON-LD BreadcrumbList + CollectionPage | ✅ 2/2 landings | ✅ 2/2 landings | ◻️ read-only |
| **vistas 3D** — `homolog-3d.spec`: foto-imán → galería con Nevera/Mural/Repisa/Regalo + cambio aria-pressed → **foco atrapado (10 Tab dentro del dialog)** + Esc cierra → separadores → libro 3D directo + sin desborde móvil | ✅ 3/3 pasos | ✅ 3/3 pasos | ◻️ read-only |
| **auth de clientes** — `homolog-auth.spec`: LOCAL (stack actual, ver H12): registro por UI → **sesión directa** (autoconfirm) → Customer + Consent HABEAS_DATA en DB → logout → login con contraseña → recuperar → **link PKCE leído de Mailpit** → sesión activa · STG: login/logout/recover-request con usuario service-role (el email sale por Resend real, no legible) — desktop y mobile | ✅ 4/4 pasos | ✅ 2/2 pasos (parcial por diseño §6.1) | ⛔ crea usuarios (skip forzado) |
| **contacto + legales/ayuda** — `homolog-contacto.spec`: form con Turnstile → **SupportTicket OPEN en DB** (+ 2 emails Resend donde el ambiente los envía — el ticket es la prueba durable) → 8 páginas legales 200 con su h1 → /ayuda: 10 preguntas del FAQ en acordeón, coherente con modo catálogo ("sin paga en línea") — desktop y mobile | ✅ 4/4 pasos | ✅ 4/4 pasos | ⛔ crea ticket (skip forzado) |
| **SEO/estáticos** — `homolog-seo.spec`: sitemap.xml (productos + legales + PDPs) · robots.txt (bloquea /admin y /api) · OG image real 200 · **canonical al dominio canónico** (H13: STG emite `https://lucamsshop.com` por diseño, nunca VERCEL_URL) · JSON-LD home + **PDP sin Offer/InStock en modo catálogo** — desktop y mobile | ✅ 6/6 pasos | ✅ 6/6 pasos | ◻️ read-only |
| **errores y resiliencia** — `homolog-errores.spec`: 404 de marca (soft-404 con la página de marca, no la de Next) · **noindex+nofollow en /estudio** · caída 500 de la acción de cotización (route.fulfill) → **error boundary de marca con reintento — nunca blanco ni stack** — desktop y mobile | ✅ 3/3 pasos | ✅ 3/3 pasos | ⛔ crea quote para el fallo controlado |
| **a11y — invariantes manuales + axe-core** (~90 reglas WCAG 2.1 A/AA) en 9 páginas (home, catálogo, carrito, ayuda, contacto, login, registro, PDP, Estudio) × 2 proyectos — `a11y.spec` + `axe.spec` | ✅ 36/36 tests, **0 violaciones serious/critical** | ✅ 36/36 tests, **0 violaciones serious/critical** | ◻️ no corrido (read-only duplicado) |
| **Lighthouse** (lhci collect, desktop) — tabla de scores en §4.1 | ✅ home **100/100/100/100** (tras fix H15a) | ✅ home 95/97/93/SEO 61 · productos 96/100/93/SEO 61 — **SEO 61 por diseño**: el preview emite `X-Robots-Tag: noindex` (verificado por curl) | ◻️ no corrido |
| **paridad de datos** (query directa a la DB del ambiente) | 612 productos / 572 categorías / 772 variantes / 115 ocasiones / 981 campos CMS / 50 migraciones | **idéntico a LOCAL** | homologado el 2026-08-05 (19 tablas idénticas, bitácora STATE) |

### 4.1 Lighthouse — scores por página (desktop, lhci 0.15.1)

| Página | LOCAL (perf/a11y/BP/SEO) | STG (perf/a11y/BP/SEO) |
| ------ | ------------------------ | ---------------------- |
| home `/` | **100/100/100/100** (tras fix H15a; antes 99/100/100/100) | 95/97/93/**61** |
| catálogo `/productos` | 93/100/100/100 | 96/100/93/**61** |
| PDP | 87/100/100/100 | — |
| estudio | 84/100/100/**66** (noindex deliberado de /estudio) | — |

El SEO 61 de STG es `is-crawlable: 0` + `robots-txt: 0` **por diseño del preview**:
Vercel envía `X-Robots-Tag: noindex` en todo preview (verificado por curl con
bypass) y el robots.txt del preview lo refleja; no es un defecto de la app (en
PRD el dominio es indexable y el canonical apunta ahí — H13). Los dos audits de
best-practices a 0 que STG mostró en home (`label-content-name-mismatch`,
`target-size`) están resueltos en H15.

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
- /mi-cuenta (`results-…-e2e-cuenta-….json`): LOCAL/STG — perfil, direcciones
  y seguridad (cambio de clave con usuario dedicado auto-contenido). Direcciones
  borradas; usuarios dedicados eliminados.
- Rastrear (`results-…-e2e-track-….json`): LOCAL `1786048878333` (mobile) y
  desktop par; STG `1786049069380` y desktop par. Orden TEST borrada (0 residuo)
  y buckets `rastrear:%` reseteados.
- Recomendador (`results-…-e2e-wizard-….json`): LOCAL `1786050854180`; STG
  `1786051081288`. Read-only.
- Ocasiones (`results-…-e2e-ocasion-….json`): LOCAL `1786051583896`; STG
  `1786051690967`. Read-only.
- 3D (`results-…-e2e-3d-….json`): LOCAL `1786052456456`; STG `1786052605434`.
  Read-only.
- Auth (`results-…-e2e-auth-….json`): corrida canónica post-código-final —
  LOCAL `1786061504402` (desktop) / `1786061543521` (mobile); STG
  `1786061633222` / `1786061699159`. Usuarios `<run>@e2e.test` borrados por
  service role en afterAll (auth.users + Customer); las filas Consent
  HABEAS_DATA quedan en el ledger marcadas con el RUN.
- Contacto (`results-…-e2e-contacto-….json`): LOCAL `1786061521311` /
  `1786061559442`; STG `1786061651871` / `1786061714964`. Ticket de prueba
  borrado en afterAll; en STG los 2 emails (ack al cliente + aviso al admin)
  salen por Resend real — esperado y documentado.
- SEO (`results-…-e2e-seo-….json`): LOCAL `1786061539970` / `1786061578428`;
  STG `1786061691107` / `1786061754491`. Read-only.
- Errores (`results-…-e2e-errores-….json`): LOCAL `1786061530631` /
  `1786061568757`; STG `1786061669369` / `1786061731741`. La quote del caso de
  fallo se crea con la acción interceptada (500 forzado por route.fulfill) y se
  borra en afterAll; 0 residuo verificado.
- a11y/axe: 36/36 verde en ambos ambientes (salida de los runners; las
  violaciones moderate/minor quedan logueadas por página — ninguna bloqueante).
- Lighthouse: LHRs en `.lighthouseci/` (gitignored); corrida LOCAL home post-fix
  H15a con `label-content-name-mismatch: 1`, `target-size: 1`,
  `errors-in-console: 1` y categorías 100/100/100/100.

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

**H12 — (entorno local, documentado — decisión humana pendiente) el stack
Supabase LOCAL corre con autoconfirm viejo.** El `supabase-local/.../config.toml`
ya trae `enable_confirmations = true` + plantillas OTP `{{ .Token }}`, pero eso
solo aplica al RECREAR el stack (`make db-local-reset`, que borra volúmenes y
resiembra — destructivo; NO ejecutado en esta sesión por requerir OK de Lucy).
El spec `homolog-auth` certifica el comportamiento del stack CORRIENTE (ver
comentario en el propio spec): registro → sesión directa sin email, recover →
link PKCE leído de Mailpit. Cuando se aplique el reset, el spec se ajusta al
flujo OTP `/confirmar-codigo` que describe su encabezado (el objetivo §6.1).

**H13 — (app, CORREGIDO y verificado en ambos) la home no emitía canonical.**
Fix (`82b98e8`): canonical explícito vía `getCanonicalSiteUrl()`
(`lib/public-url.ts` — nunca `VERCEL_URL`). Verificado por `homolog-seo` en
LOCAL (`http://localhost:4000`) y STG (`https://lucamsshop.com` por diseño:
el preview canonicaliza al dominio de producción).

**H14 — (app, CORREGIDO y verificado en STG) el CSP de previews tenía
`vercel.live` en `script-src` pero NO en `frame-src`.** El fix del 2026-08-05
cubrió solo el script; la toolbar de Vercel carga en un iframe y seguía
bloqueada (capturado por Lighthouse STG como `errors-in-console: 0`). Fix
(`30ba0b1`) + tests CSP 16/16 verdes. Verificación post-deploy con bypass:
`frame-src 'self' https://challenges.cloudflare.com https://checkout.wompi.co
https://vercel.live` en el header de STG.

**H15 — (app, un fix + un artefacto de medición) dos audits best-practices a 0
en Lighthouse STG home.**

- **(a) `label-content-name-mismatch` — CORREGIDO.** El botón Buscar del header
  tenía el hint `⌘K` como texto visible fuera del nombre accesible
  (`aria-label="Buscar"`): un usuario de control por voz que dice "click ⌘K" no
  accionaba el botón (menor, pero real). OJO: `aria-hidden` en el `<kbd>` NO
  bastaba — la regla compara el texto VISUAL, que no cambia con aria-hidden.
  Fix: el hint se pinta por CSS `::after` (`after:content-['⌘K']`), así el texto
  DOM del botón es exactamente "Buscar" (verificado en el DOM servido:
  `textContent === "Buscar"`, `::after` pinta `⌘K`). Test unitario con la
  aserción que bloquea la regresión. Verificado con re-corrida Lighthouse LOCAL:
  audit en 1 y home **100/100/100/100**. La verificación en STG queda atada al
  deploy de este commit (mismo componente compartido).
- **(b) `target-size` — artefacto de medición, sin cambio de código.** LH
  reportó la flecha "Producto anterior" del carrusel de destacados "parcialmente
  oscurecida (1.1px)". NO reproducible: sondeo `elementFromPoint` en LOCAL y STG
  (build real con bypass) — 10/10 puntos de la superficie 40×40 resuelven al
  botón; además el `boundingRect` reportado por LH (y≈2083, viewport emulado
  1350×940) no existe en la página asentada (el carrusel está en y≈379): LH
  midió durante el movimiento del autoplay/carga. Re-corridas Lighthouse dan
  `target-size: 1`.

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

# Área /mi-cuenta (E2E_AUTH=1 — perfil, direcciones, seguridad):
cd apps/web && E2E_ENV=local E2E_AUTH=1 pnpm exec playwright test homolog-mi-cuenta
cd apps/web && E2E_ENV=stg E2E_AUTH=1 pnpm exec playwright test homolog-mi-cuenta

# Rastrear (E2E_AUTH=1 — siembra orden del cliente efímero + rate-limit):
cd apps/web && E2E_ENV=local E2E_AUTH=1 pnpm exec playwright test homolog-rastrear
cd apps/web && E2E_ENV=stg E2E_AUTH=1 pnpm exec playwright test homolog-rastrear

# Recomendador / ocasiones / 3D (read-only, sin E2E_AUTH):
cd apps/web && E2E_ENV=local pnpm exec playwright test homolog-recomendador homolog-ocasion homolog-3d
cd apps/web && E2E_ENV=stg pnpm exec playwright test homolog-recomendador homolog-ocasion homolog-3d

# Auth / contacto / SEO / errores (anónimos o con usuarios propios auto-contenidos;
# NINGUNO necesita E2E_AUTH — no usan el storageState compartido):
cd apps/web && E2E_ENV=local pnpm exec playwright test homolog-auth homolog-contacto homolog-seo homolog-errores
cd apps/web && E2E_ENV=stg pnpm exec playwright test homolog-auth homolog-contacto homolog-seo homolog-errores

# a11y manual + axe (9 páginas × 2 proyectos por ambiente):
cd apps/web && E2E_ENV=local pnpm exec playwright test a11y axe
cd apps/web && E2E_ENV=stg pnpm exec playwright test a11y axe

# Lighthouse (lhci contra filesystem; en STG agregar el bypass):
CHROME_PATH=$(ls -d ~/.cache/ms-playwright/chromium-*/chrome-linux64/chrome) \
  npx @lhci/cli@0.15.1 collect --url=http://localhost:4000/ --settings.preset=desktop \
  --upload.target=filesystem --upload.outputDir=.lighthouseci
# STG: mismo comando con --url=$NEXT_PUBLIC_SITE_URL/ y
# --settings.extraHeaders='{"x-vercel-protection-bypass":"<VERCEL_BYPASS_TOKEN>"}'

# Smoke read-only en PRD (sin E2E_AUTH — nunca muta):
cd apps/web && E2E_ENV=prd pnpm exec playwright test smoke --project=desktop-chrome
```

Artefactos por corrida (gitignored): `apps/web/tmp/e2e-homologacion/`
(JSON `results-<env>-<project>-<run>.json` con pasos/valores DB + screenshots).
Los storageState viven solo en `apps/web/tests/e2e/.auth/<env>/` (gitignored)
y los usuarios efímeros se borran en el teardown global.
