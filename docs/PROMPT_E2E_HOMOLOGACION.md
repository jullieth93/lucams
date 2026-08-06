# PROMPT MAESTRO — Suite E2E de Certificación y Homologación (Lucams Shop)

Actúa como un Ingeniero QA Automation Senior (Staff Engineer) experto en Playwright,
TypeScript y arquitecturas de e-commerce complejas. Tu misión: diseñar e implementar
una suite End-to-End absoluta, exhaustiva y con CERO suposiciones que certifique que
Lucams Shop (Capa Cliente + Capa Admin) está 100% listo para producción Y que los 3
ambientes están HOMOLOGADOS a nivel de FLUJOS (no solo de datos).

## 1. CONTEXTO DEL PROYECTO (léelo antes de escribir una línea)

**Lucams Shop** — e-commerce colombiano de productos magnéticos personalizados.
Monorepo pnpm (`apps/web` + `packages/db`):

- **App**: Next.js 16 (App Router, RSC, Server Actions, Turbopack) + React 19 +
  TypeScript + Tailwind v4 + shadcn/ui + Konva (Estudio de personalización, el
  diferenciador #1) + Prisma 6.
- **Datos**: Supabase (Postgres + Auth OTP + Storage + RLS deny-by-default +
  pg_cron/pgmq). 57+ tablas, 59 con RLS.
- **Infra**: Vercel (hosting), Resend (emails), Cloudflare Turnstile (anti-bot),
  Wompi (pagos, Etapa 2), Aveonline (envíos, Etapa 2), Google Gemini (IA del Estudio).
- **Modo de tienda por flag** `NEXT_PUBLIC_STORE_MODE`:
  - `catalog` (Etapa 1, EN PRODUCCIÓN): catálogo + carrito → **cotización que cierra
    por WhatsApp** (modelo `Quote`). SIN pago en línea visible, SIN cálculo de envío
    en UI, SIN panel IA. Turnstile + consentimiento Ley 1581 en formularios.
  - `full` (Etapa 2, pendiente de trámites): checkout Wompi + guías Aveonline + IA.
- **CMS v2 propio** (`CmsPage/CmsSection/CmsField/CmsFieldVersion`): todo el copy del
  sitio es administrable desde `/admin/contenido`; los fallbacks de código existen.
- **Catálogo real**: 612 productos (9 activos reales + placeholders inactivos),
  572 categorías, 772 variantes, 115 ocasiones, 981 campos CMS.
- **Centro de notificaciones** (`/admin/notificaciones`, tabla `Notification`):
  alertas/crons/cotizaciones/resumen viven ahí; el email solo sale para críticas y
  para cotización nueva.
- **Health API**: `/api/health/{,db,storage,resend,aveonline,wompi,crons,all}` con
  contrato documentado en `docs/OPERATIONS.md` § Health API.

## 2. AMBIENTES Y SU CONFIGURACIÓN EXACTA

| Ambiente  | App                                                                       | DB/Auth                                                                                               | Acceso                                                                         |
| --------- | ------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| **LOCAL** | `http://localhost:4000` (o IP LAN de la VM)                               | Supabase local podman: API `127.0.0.1:54321`, DB `127.0.0.1:54322`, Studio `:54323`, Mailpit `:54324` | directo                                                                        |
| **STG**   | Preview `https://lucams-shop-git-develop-jullieth93s-projects.vercel.app` | Supabase `lucams-stg` (ref `mjbdiqdkykhsixvqlrrp`)                                                    | header `x-vercel-protection-bypass: $VERCEL_BYPASS_TOKEN` (está en `.env.stg`) |
| **PRD**   | `https://lucamsshop.com`                                                  | Supabase prod (ref `zxkucphbsfygakgxcnik`)                                                            | público                                                                        |

- Credenciales de test permitidas: admin `r.julliethhr@gmail.com` / `1234567890`
  (los 3 ambientes; MFA TOTP enrolado en LOCAL y PRD, por enrolar/usar en STG).
- Turnstile: llaves de PRUEBA de Cloudflare fuera de PRD (todo pasa; en PRD son reales).
- El túnel ngrok (`kebab-late-batting.ngrok-free.dev`) existe para webhooks locales.
- `make local-up` / `local-down` / `web-start` gestionan el entorno local completo.

## 3. OBJETIVO DE HOMOLOGACIÓN (qué se certifica)

**Homologación de FLUJOS**: el mismo flujo funciona igual en los 3 ambientes, salvo
las diferencias INTENCIONALES documentadas. La suite debe correr la matriz de flujos
completa en LOCAL y STG, y el subconjunto no-destructivo en PRD.

**Debe ser idéntico**: catálogo (612/572/772/115/981 CMS), esquema+RLS (59 tablas),
migraciones Prisma (50), jobs pg_cron (10, menos los de email desagendados SOLO en
STG), módulos del admin, Health API, crons al día, flujos cliente (catálogo, PDP,
estudio, carrito, cotización, confirmación, wa.me), uploads (JPG/PNG/WebP/HEIC/≤4MB/>4.5MB).

**Difiere a propósito** (no es fallo): transaccional (pedidos/clientes/carritos/
sesiones/notificaciones), secrets/URLs por ambiente, emails reales (PRD sí, STG crons
de email apagados, local a Mailpit), Turnstile (test vs real), llaves Wompi
(sandbox vs prod), credenciales Aveonline (demo vs real).

## 4. ESTADO ACTUAL (qué YA existe — construir SOBRE esto, no duplicar)

- `apps/web/playwright.config.ts`: 1 project chromium, baseURL por env, webServer
  auto, retries 2, PW_CHANNEL para el checkout Wompi.
- `apps/web/tests/e2e/`: 35+ specs (`smoke`, `a11y`, `axe`, `compra`, `estudio`,
  `catalog-mode` (flujo cotización Etapa 1), `admin-login`, `admin-mfa`,
  `cms-editing-flow`, `wompi-sandbox`, `preview-cert`, `release-check-a1`,
  `mobile-admin-audit`).
- Vitest: 2760+ tests (unit + integración DB real + RLS matrix + storage real).
- `tests/load/storefront-browsing.js` (k6, con bypass para STG).
- Gates CI: typecheck, lint, vitest+coverage, E2E, Lighthouse, gitleaks, prettier,
  content-coverage.
- **Bugs YA corregidos que la suite DEBE cubrir como regresión permanente**:
  (a) comprador primerizo crea diseño (F1 — `peekCartSession`→`getOrCreateCartSession`);
  (b) upload HEIC de iPhone (`heic-decode` server-side, fixture en
  `apps/web/tests/fixtures/sample.heic`);
  (c) fotos >4.5 MB comprimidas en cliente (2400px JPEG — caso real 8.23 MB→1.76 MB);
  (d) UI muda ante 413/500/red en el estudio (catch con mensaje);
  (e) thumbnails del diseño (remotePatterns con STG + stack local);
  (f) CSP permite vercel.live solo en previews.

## 5. PLAN DE TRABAJO (entregar primero el mapa conceptual)

### 5.1 Estrategia de datos

- **Fixtures dinámicos con prefijo de corrida**: `RUN = e2e-<slug>-<Date.now()>` en
  cada spec; TODA entidad creada lleva el RUN en slug/email/nombre (el teardown
  global del repo limpia SOLO patrones de test — slug/email/número con 13+ dígitos o
  prefijos `test-`/`itest`). NUNCA tocar datos sembrados reales (los 612 productos).
- **Datos desde la DB, no inventados**: productos/variantes/categorías se leen de la
  DB del ambiente (paridad verificada); los precios esperados se consultan, no se
  hardcodean. Faker solo para datos de cliente/cotización de prueba.
- **Cuentas**: admin existente (arriba); clientes efímeros por corrida, borrados al
  final (auth.users + Customer, vía service key del ambiente).
- **Storage**: archivos generados por corrida (sharp) + fixture HEIC existente;
  limpieza de objetos de bucket al finalizar.

### 5.2 Orden de ejecución

1. Setup por ambiente (seed mínimo si falta, bypass, storageState admin y cliente).
2. Capa cliente feliz (home → catálogo → PDP → estudio → carrito → cotización →
   confirmación → wa.me → notificación QUOTE en DB).
3. Capa admin (login + MFA → módulos → acción que toca contenido).
4. Cruces admin→cliente (matriz de trazabilidad abajo).
5. Resiliencia (route.fulfill para fallos/latencia en APIs).
6. Homologación cruzada (misma aserción en LOCAL y STG lado a lado).

### 5.3 Matriz de trazabilidad cliente-admin (mínima, ampliable)

| Acción Admin                                                           | Verificación Cliente                                           |
| ---------------------------------------------------------------------- | -------------------------------------------------------------- |
| Edita campo CMS (p.ej. `home.hero.title`) + publicar + invalidar caché | Home muestra el texto nuevo (y vuelve al original al revertir) |
| Toggle `COD_ENABLED`                                                   | Chip COD del hero aparece/desaparece                           |
| Cambia estado de una cotización                                        | Página pública `/cotizacion/[token]` refleja el estado         |
| Desactiva un producto                                                  | El producto sale de /productos sin borrarse de la DB           |
| Crea cupón válido                                                      | El form de cotización/checkout lo acepta (Etapa 2 lo cobra)    |
| Marca reseña como aprobada                                             | La PDP la muestra                                              |
| Lee una notificación QUOTE                                             | Badge de no leídas del nav baja a 0                            |

## 6. CAPA CLIENTE — flujos a cubrir (Desktop 1280×800 + Mobile 390×844)

1. **Registro/Auth OTP**: registro con email efímero → código (Mailpit en local;
   comportamiento documentado en STG) → sesión → `/mi-cuenta`. Login, logout global,
   recuperar contraseña por OTP. Persistencia con `storageState`.
2. **Catálogo**: 9 activos visibles; filtros por categoría/subcategoría/precio/
   personalizable/descuento/destacado; orden asc/desc; paginación; búsqueda fuzzy
   con typo ("calenadrio"→"calendario", pg_trgm); chips y "limpiar filtros"; empty
   state; caracteres especiales en query sin romper nada.
3. **PDP**: galería + lightbox, variantes y precio por variante, CTA Personalizar vs
   Añadir al carrito según tipo de producto, JSON-LD, relacionados.
4. **Estudio** (diferenciador — matriz completa por producto):
   - Consentimiento Ley 1581 obligatorio para subir.
   - Upload: JPG, PNG, WebP, HEIC (iPhone), >4.5 MB (compresión cliente — verificar
     que el objeto final es JPEG ≤2400px y <4 MB), >10 MB (rechazo visible), archivo
     no-imagen renombrado (rechazo por magic bytes con mensaje).
   - Slots: arrastre/encuadre/zoom, modal unificado Foto/Texto, cantidades, precio
     unitario correcto.
   - HEIC real (`tests/fixtures/sample.heic`) transcodifica a JPEG.
   - Fresh buyer (F1): usuario SIN cookie puede crear diseño de nombre (regresión).
5. **Carrito**: merge anónimo→cuenta, cantidades con límite de stock, precios COP
   correctos, preview del diseño (thumbnails sin 500/400 en LOCAL y STG), persistencia
   tras refresh y tras login.
6. **Cotización (Etapa 1)**: form completo (nombre, WhatsApp, email, depto+ciudad,
   notas, consentimiento, Turnstile) → Quote PENDING en DB + página de confirmación +
   mensaje wa.me bien formado (número, ítems, total, link) + `Notification` QUOTE en
   DB + email admin (donde aplique) + idempotencia (doble submit no duplica).
7. **Cuenta (/mi-cuenta)**: perfil (editar nombre/teléfono), direcciones (crear,
   default única, editar, borrar), favoritos (lista = lo marcado en PDP), seguridad
   (cambio de contraseña con sesiones cerradas globalmente), y borrado de cuenta
   (flujo de supresión: qué se anonimiza/borra y qué queda por ley).
8. **Cookies Ley 1581**: banner con 3 botones (solo necesarias / personalizar /
   aceptar todas), modal con 4 switches (necesarias bloqueadas ON), persistencia en
   refresh, /legal/cookies con tabla + reabrir preferencias, y filas `Consent`
   correctas en DB por alcance.
9. **Newsletter + unsubscribe**: suscripción con consent obligatorio → welcome;
   duplicado → "ya estabas suscrito"; baja por link del email (HMAC) → consent
   revocado + no vuelve a llegar; List-Unsubscribe One-Click presente en headers.
10. **Wishlist**: marcar/desmarcar en PDP y tarjeta, badge del header actualiza,
    página /mi-cuenta/favoritos, persistencia por cuenta (y anon sin romper).
11. **Reseñas**: submit con validación (rating, comentario mínimo), estado PENDING
    hasta moderación, admin aprueba → visible en PDP con fecha es-CO y conteo real.
12. **Back-in-stock**: suscribir a reposición de variante agotada (consent), fila en
    DB, y tras re-stock (cambio admin) sale el aviso (email en PRD; registro en DB).
13. **Recomendador wizard** (/recomendador): los 4 pasos navegan, gestión de foco
    por paso, resultado con productos reales de DB, sin resultados → salidas claras,
    error del API → reintento visible.
14. **Rastrear** (/rastrear): pedido por número+email (anti-enumeración: mismo
    mensaje exista o no), estados visibles, rate-limit del form.
15. **Ocasiones** (/ocasion/[slug]): landings por ocasión sembrada (6 top), productos
    reales filtrados, breadcrumb sin link roto, JSON-LD CollectionPage.
16. **Vistas 3D** ("Ver en tu espacio"): el modal 3D abre por producto elegible,
    escenas correctas por tipo (nevera/mural/repisa/regalo), foco atrapado y cierre
    Esc, sin desborde móvil; tiras como pieza completa y separadores con doblez.
17. **SEO/estáticos**: sitemap, robots, OG image real, canonical, JSON-LD home/PDP.
18. **Legales/ayuda/contacto**: 8 páginas legales 200, FAQ coherente con modo
    catálogo, form contacto con Turnstile → ticket en DB + 2 emails (donde aplique).
19. **Errores y resiliencia de red**: 404 personalizado, error boundaries, noindex en
    checkout/cotización; con `route.fulfill` caídas/lentitud en Resend/Turnstile/
    cotización → mensaje visible, nunca pantalla en blanco.
20. **a11y E2E + performance**: axe WCAG 2.1 AA (0 serious/critical) en home,
    catálogo, PDP, estudio, cotización, admin; contraste de CTAs (esmerald-700 AA);
    Lighthouse móvil+desktop ≥90 en perf/a11y/best-practices/SEO en home, /productos,
    1 PDP y 1 estudio (los budgets del CI no bajan).
21. **Rate-limit y CSRF (comportamiento)**: 429 tras N intentos en login/registro/
    cotización/contacto con mensaje claro; server action con origen adulterado
    rechazada; doble submit de cotización no duplica (idempotencia en UI + DB).

## 7. CAPA ADMIN — flujos a cubrir (Desktop 1280×800 + Mobile 375×812)

El admin es responsive y se certifica en AMBOS viewports (precedente del repo:
`mobile-admin-audit.spec.ts` y `release-check-a1` verificando 375px).

1. **Auth**: login con credenciales, MFA challenge (TOTP generado en test, helper en
   `tests/e2e/_helpers/totp.ts` como referencia), AAL2 exigido en /admin/*, redirect
   sin sesión, AdminActionLog escrito.
2. **Cotizaciones**: lista, detalle, cambio de estado, link WhatsApp del cliente,
   la cotización de prueba aparece tras crearla desde el cliente.
3. **Contenido CMS**: editar campo inline en `/admin/contenido`, publicar, invalidar
   caché, ver el cambio en el storefront y revertir (regresión: release-check-a1).
4. **Notificaciones**: badge no leídas, marcar leída/todas, filtros, deep links.
5. **Productos/Categorías**: activar/desactivar producto (reflejado en /productos al
   instante), precio por variante, orden; sin desborde en menús.
6. **Observability**: salud técnica carga, crons al día, /api/health/crons 200,
   errores recientes visibles.
7. **RBAC**: rol no-SUPER no entra a módulos restringidos; deny-by-default.
8. **Mobile admin (obligatorio)**: drawer hamburguesa abre/cierra y navega a todos
   los módulos; tablas pasan a tarjetas apiladas <640px (`admin-table-auto-cards`
   con `data-label` legible); editor inline de `/admin/contenido` usable en 375px
   (campos, botones, editor completo); badge de notificaciones visible en el drawer;
   touch targets ≥44px en acciones clave (publicar, marcar leída, cambiar estado);
   **cero overflow horizontal en 375px** en dashboard, cotizaciones, contenido,
   productos y notificaciones.

## 7.5 CAPA TRANSACCIONAL — MODO `full` (Etapa 2, suite separada)

La misma app con `NEXT_PUBLIC_STORE_MODE=full`. Se corre como suite dedicada
(build propio, no mezclada con la de catálogo) — el precedente es
`tests/e2e/wompi-sandbox.spec.ts`, que ya hace el flujo real contra sandbox.

1. **Checkout completo** (invitado y registrado): datos → envío (cotización
   Aveonline real sandbox/test con selección sellada HMAC) → pago Wompi hosted
   (tarjeta 4242 sandbox) → /gracias con estado y guía.
2. **Pasarela por interceptación**: éxito, rechazo (DECLINED → reintento con misma
   reference), timeout de creación, monto adulterado → `needsReconciliation` y NO
   descuento de stock prematuro; firma de webhook válida e inválida (401).
3. **COD (contraentrega)**: toggle COD_ENABLED on/off (chip hero modular), pedido
   COD creado sin pago, ledger COD y conciliación visible en admin.
4. **Cupones**: válido (descuento aplicado al total), inválido/expirado/agotado
   (mensaje claro), uso registrado en `CouponUsage`.
5. **Stock**: reserva al iniciar checkout, decremento al pago aprobado, oversold
   imposible (2 clientes por la última unidad → el segundo no paga), liberación de
   reserva al expirar (cron `stock_reservation_cleanup`).
6. **Envíos**: cotización multi-transportadora con precio, selección sellada
   re-validada al finalizar, guía NO facturable fuera de prod
   (`bloquegenerarguia="1"` verificable en el payload), webhook Aveonline con
   secret (dedup + timing-safe).
7. **Emails transaccionales**: confirmación de pedido, despacho, entrega (donde el
   ambiente envíe); datos coherentes con el pedido.

## 8. REQUISITOS TÉCNICOS ESTRICTOS

- **Cero hardcoding ni suposiciones**: datos esperados se leen de la DB del ambiente;
  fixtures con RUN prefix obligatorio; generadores con Faker solo para inputs de
  prueba; NUNCA tocar el catálogo real ni crear cosas en PRD fuera del patrón de
  limpieza verificada.
- **Interceptación de red**: `route.fulfill` para simular fallo/timeout/latencia en
  Wompi, Aveonline, Resend, Turnstile siteverify — la UI debe degradar con mensaje,
  nunca romper en blanco (regresión del catch del estudio).
- **Evidencia**: `trace: "retain-on-failure"`, screenshot automático al fallo, video
  on-first-retry, y un JSON de resultado por flujo con aserciones (estilo
  `apps/web/tmp/estudio-verify/results-*.json`).
- **Paralelización y aislamiento**: specs independientes; auth compartida SOLO vía
  `storageState` generado en `global.setup` por ambiente; workers 2 en CI; nada de
  estado compartido entre tests salvo lectura.
- **Ambiente-correcto**: el runner detecta LOCAL (sin bypass) vs STG (con bypass
  header vía `extraHTTPHeaders`); PRD solo lectura y flujos idempotentes seguros.
- **Guardas anti-desastre**: la suite NUNCA debe correr limpieza destructiva fuera de
  los patrones test (el env-guard del repo ya bloquea PRD; respétalo).
- **Webhooks como flujo**: firma Wompi sintética bien/mal formada (200/401),
  dedup por reintento del mismo evento, environment-match (sandbox≠prod); Resend
  Svix (firma + tolerancia anti-replay + idempotencia por resendId); Aveonline con
  secret por header (dedup + timing-safe). Sin compras ni guías reales.
- **Cross-browser**: Chromium obligatorio; WebKit/Firefox como matriz ampliada.

## 9. ENTREGABLES

1. Mapa conceptual del plan (este documento revisado contra el repo real).
2. `playwright.config.ts` ajustado: projects Desktop Chrome + Mobile Chrome,
   storageState por ambiente, evidencia (trace/video/screenshot), reporters
   (line + html + json), bypass condicional por ambiente.
3. Estructura POM: `tests/e2e/pages/{home,catalogo,pdp,estudio,carrito,cotizacion,
admin-login,admin-dashboard,admin-cotizaciones,admin-contenido,admin-notificaciones}.ts`
   y `tests/e2e/fixtures/{run,data-factory,db,storage,auth}.ts`.
4. Spec de integración REAL admin→cliente como ejemplo ejecutable: el admin edita
   `home.categories.cta-all` por la UI de `/admin/contenido` (o service) → el cliente
   lo ve en la home → revertir → original visible (versión productiva del patrón
   `release-check-a1.spec.ts`, corriendo en LOCAL y STG con bypass).
5. Matriz de homologación final ejecutada: tabla flujo × ambiente con evidencia
   (screenshots, responses, queries) y TODO hallazgo documentado en
   `docs/audits/<fecha>-e2e-homologacion.md`.

## 10. REGLAS DURAS

- CERO suposiciones: toda afirmación con evidencia (screenshot, response, query, log).
- Nada queda sin limpiar (excepto el ledger legal `Consent`, append-only por diseño).
- Si algo difiere entre ambientes y NO está en la lista de diferencias intencionales
  de la §3, es un hallazgo con severidad y causa raíz — nunca se acomoda la prueba
  al resultado.
- Todo pasa también por los gates del repo: typecheck, eslint, prettier --check.
