# Auditoría fullstack pre-lanzamiento — 2026-07-21

> **Tipo:** auditoría integral (arquitectura, seguridad, funcional, datos, integraciones, testing, compliance, operación, documentación).
> **Alcance:** todo el monorepo (`apps/web`, `packages/db`, `supabase/migrations`), configuración de Vercel/Cloudflare/Supabase/Resend, y estado del go-live según `docs/STATE.md` + `docs/RUNBOOK_GO_LIVE.md`.
> **Método:** exploración multi-agente del código (~35 rutas API, 31 features, 15 migraciones, schema Prisma de 49 modelos), spot-checks manuales con archivo:línea, y ejecución real de `typecheck`, `lint --max-warnings 0`, `pnpm audit`, suite Vitest completa y build de producción en la VM.
> **Contexto:** esta auditoría se emite junto con `docs/PLAN_SALIDA_PRODUCCION.md`, que define la salida en 2 etapas (Etapa 1: catálogo + WhatsApp sin integraciones; Etapa 2: tienda full con pagos y envíos).

---

## 1. Resumen ejecutivo

**Veredicto general: el proyecto está en muy buen estado técnico — notablemente por encima de lo habitual para un pre-launch.** La seguridad es madura (CSP por nonce, RLS estructural con event trigger, MFA aal2 verificado en servidor, webhooks con anti-replay e idempotencia), el modelo de datos es sólido (centavos enteros, audit fields, soft delete) y la cobertura de tests es alta. Los bloqueantes reales para vender con pagos en línea **no son de código**: son trámites (NIT, abogado) y provisionamiento de terceros (Wompi prod, R2).

**Veredicto por dimensión:**

| Dimensión | Estado | Veredicto |
|---|---|---|
| Arquitectura y stack | 🟢 | Sano. Next 16.2.6 + React 19.2.4 (versiones parcheadas dic-2025), monorepo limpio |
| Seguridad | 🟢 con observaciones | Madura. 2 hallazgos medios, 5 bajos — ninguno bloqueante |
| Funcional storefront | 🟢 | Completo: home, catálogo, PDP, carrito, checkout, estudio, cuenta |
| Funcional admin | 🟢 con observaciones | ~25 módulos operativos; 10 placeholders de Fase 4/5 (no bloquean) |
| Datos (Prisma + RLS) | 🟢 | Ejemplar. Triple red de cobertura RLS |
| Integraciones | 🟡 | Cableadas y endurecidas, pero Wompi = sandbox ajeno y Aveonline = modo test |
| Testing y QA | 🟡 | Tests automatizados altos; QA manual virgen; load test pendiente |
| Compliance (Ley 1581/1480/DIAN) | 🟡 | Código compliant; trámites humanos abiertos |
| Operación (backups, obs., DR) | 🔴 parcial | **Backups R2 rotos (FASE 10)** — sin backup verificado no hay DR |
| Documentación | 🟡 | Docs de go-live vivos; docs fundacionales con desactualizaciones conocidas |

**Decisión que habilita esta auditoría:** con la estrategia de 2 etapas, **Etapa 1 (catálogo + cotización por WhatsApp) puede salir YA** — no requiere NIT, ni Wompi, ni Aveonline. Etapa 2 (pagos/envíos) queda en NO-GO hasta cerrar los P0 humanos y operativos.

### Tabla de hallazgos (totales)

| Severidad | Cantidad | Bloquean Etapa 1 | Bloquean Etapa 2 |
|---|---|---|---|
| Críticos | 0 | — | — |
| Medios | 8 | 1 (OPS-01 backups, condicionante) | 4 |
| Bajos | 12 | 0 | 0 |

---

## 2. Arquitectura y stack

- **Next.js 16.2.6 + React 19.2.4** (`apps/web/package.json`): versiones recientes que incluyen los parches de seguridad de diciembre 2025. App Router, `proxy.ts` (sucesor de middleware en Next 16), Server Actions, RSC.
- **Monorepo pnpm**: `apps/web` (app) + `packages/db` (Prisma 6.19 + `@lucams/db`). `packages/ui` del plan original no existe — la UI vive en `apps/web/components` (shadcn/ui). Desviación benigna, no documentada como ADR.
- **Supabase** (Postgres + Auth + Storage): proyecto único `zxkucphbsfygakgxcnik` compartido dev/prod (ver OPS-02). Realtime no se usa (solo aparece en CSP).
- **Vercel**: despliegue por rama (`develop`, `production`); `vercel.json` trivial (los headers salen del proxy por diseño — CSP con nonce no es posible desde config estático).
- **Cloudflare**: DNS del dominio, Email Routing (5 buzones), Turnstile, R2 (backups — ver OPS-01).
- **Background jobs**: `pg_cron` en Supabase llamando 7 rutas `/api/cron/*` con `x-cron-secret` desde Supabase Vault (migraciones 015/016) — sin secretos en SQL versionado. Correcto.
- **Dinero en centavos `Int` en todo el schema** — mandato cumplido, verificado en `packages/db/prisma/schema.prisma`.

**Sin hallazgos arquitectónicos.** La estructura `app/` + `features/` (31 módulos con `service.ts` + tests) + `lib/` es consistente y mantenible.

---

## 3. Seguridad

### 3.1 Fortalezas verificadas (citar como estado actual, no aspiracional)

- **CSP por nonce con `strict-dynamic` en prod** (`lib/security-headers.ts:26-46`): `object-src 'none'`, `base-uri 'self'`, `frame-src` solo Turnstile+Wompi, `connect-src` mínimo. Headers estáticos completos (HSTS 2 años+preload, `X-Frame-Options: DENY`, `nosniff`, COOP/CORP, Permissions-Policy deny-all).
- **CORS estricto en `/api/*`** con allowlist que exige el sufijo de scope del equipo Vercel (`security-headers.ts:49-65`) — cierra el ataque de proyecto Vercel homónimo. Origen no allowlisted → 403 (`proxy.ts:178-183`).
- **RLS con triple red**: sweeps (migraciones 007/010) + verificación inline que aborta la migración + **event trigger `enforce_rls_on_new_table()`** (migración 014) que habilita RLS en toda tabla futura. Sin `USING (true)` ni escritura anónima en ninguna policy.
- **Auth/RBAC admin**: `requireAdminAction()` valida sesión + **MFA aal2 en el servidor** al inicio de cada action (`lib/admin-rbac-guard.ts:30-48`) — no se puede saltar el 2FA invocando la action directa. Login admin con anti-enumeration y rate limit doble IP+email. Recovery codes TOTP sha256-hasheados de uso único.
- **Webhooks endurecidos**: Wompi con HMAC-SHA256 + anti-replay ±5min + validación de monto contra la orden + idempotencia (`app/api/webhooks/wompi/route.ts`); Resend con verificación Svix completa fail-closed en prod; Aveonline con secret timing-safe + estados monotónicos.
- **Sesiones de invitado firmadas con HMAC** (`CSRF_SECRET`) para carrito/checkout; idle-timeout admin de 30 min con cookie sellada anti-bypass (`proxy.ts:232-246`).
- **Uploads**: doble validación MIME (declarado + magic bytes, `lib/storage.ts:70-104`), EXIF strip + re-encode con sharp (destruye payloads embebidos), buckets privados operados solo vía service_role (migración 013 eliminó policies authenticated con scoping deficiente).
- **Validación Zod generalizada** (~50 archivos, 124 usos de `z.object/safeParse`); rate limit Postgres atómico (`rate_limit_check()`, migración 003) en todas las actions/endpoints sensibles.
- **Logger con redacción de PII** por claves y sufijos (`lib/logger.ts:47-99`); `bodyHead` de webhooks acotado con purga a 180 días (cron `lucams-purge-event-logs`).
- **Env fail-fast** (`lib/env.ts`): CORE siempre; PROD_REQUIRED en producción; guard explícito que prohíbe `WOMPI_DISABLE_TIMESTAMP_CHECK=true` en prod (`env.ts:84-89`).
- **gitleaks en CI** (`.gitleaks.toml`) y sin secretos hardcodeados (barrido por `sk_`, `eyJ`, `service_role`, `PRIVATE KEY`, `whsec_`: solo placeholders en `.env.example`).

### 3.2 Hallazgos medios

**SEC-01 (medio) — SVG del QR de MFA inyectado sin sanitizar.**
`app/admin/(panel)/seguridad/mfa-enroll.tsx:99-102` — `dangerouslySetInnerHTML={{ __html: qrSvg }}` con el SVG que devuelve el enroll TOTP de Supabase. La fuente es el Auth server (confianza razonable), pero un SVG con `<script>` inline se ejecutaría en contexto admin si esa respuesta se manipulara; la CSP por nonce **no bloquea scripts dentro de SVG inline** en todos los navegadores.
**Fix:** sanitizar el SVG (allowlist de elementos/atributos) o renderizarlo como `<img src={dataUri}>` (contexto de imagen no ejecuta script). Esfuerzo: <1h. Aplicado en esta sesión (ver §12).

**SEC-02 (medio) — Fallback `?? "dev"` en el HMAC de unsubscribe.**
`features/newsletter/unsubscribe.ts:29` — `process.env.CSRF_SECRET ?? "dev"` para el token SHA-256 de baja de newsletter. Está mitigado porque `lib/env.ts` hace `CSRF_SECRET` CORE-obligatorio al arranque, pero el fallback silencioso no debería existir: si alguna vez se invoca en un contexto sin env cargado (script, test), firma con una clave pública conocida.
**Fix:** lanzar error si falta (o importar el getter de `lib/env.ts`). Esfuerzo: 15 min. Aplicado en esta sesión.

### 3.3 Hallazgos bajos (defensa en profundidad)

- **SEC-03 (bajo) — Redirects admin aceptan `http://` absoluto.** `lib/safe-redirect.ts:74` permite cualquier `https?://` explícito como destino del CMS de redirects. Los vectores disfrazados (`//evil.com`, `/\evil.com`) sí están bloqueados (ADR-046, tests de integración). Solo admins escriben y hay MFA+audit log, pero forzar `https:` reduce el abanico ante una cuenta admin comprometida. **Fix menor en `isAllowedRedirectDestination`.**
- **SEC-04 (bajo) — `serverActions.bodySizeLimit: "50mb"` global** (`next.config.ts`). Justificado por el render PNG 300 DPI del Estudio, pero toda action presente o futura hereda 50MB/request. Las actions sensibles tienen caps propios (`features/personalization/actions.ts:181-241`). Documentar y revisar al agregar actions nuevas.
- **SEC-05 (bajo) — Sin escaneo antimalware real en uploads.** `DesignAsset.malwareScanned` existe pero siempre es `false`. Mitigación real: magic bytes + re-encode sharp. Recomendación: renombrar/comentar el campo para no prometer de más, o integrar ClamAV en Fase 5+.
- **SEC-06 (bajo) — Webhook Aveonline sin HMAC** (el proveedor no lo ofrece). Mitigado con secret compartido timing-safe (`lib/timing-safe.ts`), monotonía de estados e idempotencia. Pendiente humano ya logueado: dejar de aceptar el secret por query string y exigir header.
- **SEC-07 (bajo) — Health endpoints públicos** (`/api/health/*`) revelan latencias y proveedores. Rate-limited (30/min) y sin datos sensibles. Aceptable; opcional: requerir un token para el detalle.
- **SEC-08 (bajo) — `getClientIp` confía en `x-vercel-forwarded-for`** — correcto en Vercel (el edge lo sobrescribe); spoofeable fuera de Vercel. Documentado en código. Sin acción mientras el hosting sea Vercel.

### 3.4 Dependencias (`pnpm audit --prod`, ejecutado 2026-07-21)

2 vulnerabilidades, ambas **transitivas de Next.js y solo en build-time** (no llegan al runtime del servidor ni al cliente):
- `postcss <8.5.10` (moderada, XSS vía `</style>` en stringify — GHSA-qx2v-qp2m-jg93) — se explota solo procesando CSS malicioso en build.
- `@babel/core <=7.29.0` (baja, file read vía sourceMappingURL — GHSA-4x5r-pxfx-6jf8) — idem, solo build.

**Acción:** ninguna urgente; se resuelven con el próximo bump de Next. Re-correr `pnpm audit` en cada mantenimiento (ya está en CI).

---

## 4. Funcional — storefront

Todo el flujo público está implementado y operativo (verificado por lectura de código, no solo docs):

- **Home** (`app/page.tsx`): hero, categorías, carrusel de destacados (Embla), reseñas reales, CTA WhatsApp. Contenido desde CMS con fallback.
- **Catálogo** (`app/productos/*`): filtros, búsqueda, paginación, conteos reales.
- **PDP** (`app/producto/[slug]/page.tsx`, 485 líneas): galería, variantes, reseñas + form con Turnstile, wishlist, back-in-stock, relacionados, JSON-LD, add-to-cart real. *Comentario obsoleto menor:* la cabecera dice "añadir al carrito (placeholder)" pero está cableado (UX-02).
- **Carrito** (`app/carrito/`): funcional con sesión anónima firmada por cookie, merge al login, cross-sell, recuperación de abandonados vía cron + email.
- **Checkout** (`app/checkout/`): 3 pasos (datos → envío → pago) con validadores colombianos (DANE/DIVIPOLA), cotización Aveonline con retry, cupones, Wompi/contraentrega con antifraude COD (`features/checkout/cod-risk.ts`), Turnstile, guest checkout.
- **Estudio de personalización** (`app/estudio/[slug]/`, 29 archivos): editor Konva completo, 3 vistas 3D (nevera, libro, calendario), panel IA Gemini fail-safe, editor de nombre con abecedarios ilustrados, calendarios con festivos colombianos, smart-crop, **render de producción 300 DPI server-side** (`@napi-rs/canvas`) + hoja de ensamblaje. Es el diferenciador #1 y está completo.
- **Cuenta** (`app/mi-cuenta/`): perfil, pedidos, direcciones, diseños, favoritos, reseñas, seguridad, borrado de cuenta (Ley 1581).
- **Extras**: recomendador wizard, rastreo público, vista de pedido guest por token 128-bit, diseño compartido `/d/[token]`, 8 páginas legales, FAQ/contacto, sitemap/robots/OG.

**Sin gaps funcionales bloqueantes en storefront.** Hallazgos menores: comentarios obsoletos (UX-02) y legales con notas `[pendiente verificación]` (LEG-02).

## 5. Funcional — admin

- **~25 módulos operativos**: dashboard, pedidos (+ hoja de producción), moderación de diseños, retractos, clientes 360°, reseñas, productos/variantes/bulk, inventario, categorías, ocasiones, plantillas del Estudio, cupones, finanzas + conciliación COD, CMS versionado, email-templates, diseños, fichas/abecedarios, garantías, soporte, seguridad MFA, usuarios/RBAC, integraciones, redirects, auditoría, observability.
- **10 módulos placeholder** (catch-all `[...placeholder]` con roadmap): Reclamos, Mayorista B2B, Materiales, Costos, Canales, Bot WhatsApp, Métricas, Performance, Mensajes. Corresponden a Fases 4/5 — no bloquean el lanzamiento.
- **UX-01 (bajo) — NAV huérfano:** `/admin/soporte` y `/admin/garantias` existen y operan, pero no están en `lib/admin-nav.ts` (solo accesibles por URL directa). **Fix:** agregarlos al NAV. Aplicado en esta sesión.
- RBAC por ruta (SUPERADMIN/MANAGER/FULFILLMENT) con doble guard (layout + `requireAdminAction` por action) y `AdminActionLog` en mutaciones.

---

## 6. Datos (Prisma + Postgres + RLS)

- **Schema** (`packages/db/prisma/schema.prisma`, 1.625 líneas, 49 modelos): dinero en centavos `Int`; `createdAt/updatedAt/createdBy/updatedBy/deletedAt/deletedBy` en toda entidad mutable; soft delete con índices `[deletedAt]`; `onDelete` explícito en cada relación; logs append-only (InventoryLog, AdminActionLog, WebhookEvent, Consent, CmsBlockVersion); índice parcial único de idempotencia en InventoryLog; `CouponUsage` por email (cierra evasión logueado→invitado); `Order.publicAccessToken` guest; `Order.shippingAddressKey` anti-abuso COD; campos DIAN-ready; Consent granular Ley 1581 con IP/UA/versión/revocación.
- **Migraciones Supabase (15)**: RLS en todo con verificación que aborta la migración si queda tabla sin RLS; event trigger para tablas futuras (014); rate limit atómico (003); buckets con límites y mime allowlist (005/006); pg_cron de limpieza y jobs HTTP con secretos desde Vault (012/015/016).
- **Punto a verificar en vivo (no verificable desde código):** que el rol de `DATABASE_URL` (Prisma) sea el owner con bypass RLS y no `authenticated`. Si fuera `authenticated`, las queries del servidor estarían limitadas por policies pensadas para clientes. Acción: una query `SELECT current_role` en la próxima sesión de operación.

---

## 7. Integraciones

| Proveedor | Estado código | Estado operativo | Env vars | Riesgo |
|---|---|---|---|---|
| **Wompi** | Cableado E2E (cliente REST + webhook HMAC + saga) | 🔴 **Sandbox de un tercero ("KAIU")** — no hay cuenta propia prod (espera NIT) | `WOMPI_*` (6) | No se puede cobrar de verdad → bloquea Etapa 2 |
| **MercadoPago** | Solo interface `PaymentProvider` | No existe (singleton lanza error) | — | Ninguno: no está en el alcance |
| **Aveonline** | Cableado E2E (1.116 líneas, CB, webhook, tracking) | 🟡 **Modo test** confirmado a propósito (guías reales = facturables) | `AVEONLINE_*` | Bloquea Etapa 2 hasta FASE 8 |
| **Venndelo** | Stub total (todos los métodos lanzan) | Plan B documentado (swap 8-12h) | `VENNDELO_*` | Ninguno mientras sea Plan B |
| **Resend** | Cableado E2E (retry, CB, webhook Svix, 18 plantillas) | 🟢 Prod verificado (SPF/DKIM PASS, `hola@mail.lucamsshop.com`) | `RESEND_*` | Bajo |
| **Supabase** | Cableado (Auth SSR+MFA, Storage, Postgres+RLS) | 🟢 Prod — pero compartido con dev (OPS-02) | `*_SUPABASE_*`, `DATABASE_URL`, `DIRECT_URL` | Medio (aislamiento) |
| **Turnstile** | Cableado (6 superficies, fail-closed en prod) | 🟢 Resuelto el incidente de hostnames `.co`→`.com` | `TURNSTILE_*` | Bajo |
| **Gemini (IA)** | Cableado (REST, primario+fallback, rate limit 20/h, fail-safe) | 🟢 Opcional (degrada a "sin ideas") | `GEMINI_*` | Bajo |
| **WhatsApp** | wa.me con 6 contextos de mensaje desde CMS | 🟢 | `NEXT_PUBLIC_WA_NUMBER` | Bajo |
| **Cloudflare R2** | Script `db:backup` operativo | 🔴 **Handshake TLS rechazado** (FASE 10 — hipótesis: bucket no aprovisionado) | `R2_*` | **Sin backups verificados** (OPS-01) |
| **Crons** | 7 rutas `/api/cron/*` + pg_cron | 🟢 Validado en prod (0 atrasados) | `CRON_SECRET` | Bajo |

**INT-01 (medio):** Wompi apunta a sandbox de tercero → riesgo contable y de datos si alguien "compra" hoy. Mitigado de hecho: el checkout con tarjeta no está abierto al público como canal real (Etapa 1 lo elimina por completo).
**INT-02 (medio):** Aveonline en modo test — toda cotización de envío es simulada. Correcto como decisión; bloquea Etapa 2.

---

## 8. Testing y QA (verificado por ejecución real, 2026-07-21)

| Chequeo | Resultado |
|---|---|
| `pnpm typecheck` (monorepo) | ✅ Verde (`tsc --noEmit`) |
| `pnpm lint` (`eslint --max-warnings 0`) | ✅ Verde |
| `pnpm audit --prod` | 2 vulns build-time transitivas de Next (§3.4) |
| Vitest completo (con env, 2026-07-21) | ✅ **114/115 archivos verdes, 2.145 tests pasados, 2 skipped** (~17 min por latencia del pooler remoto). Única falla detectada: `daily-summary.integration.test.ts` — timeout de 5s por defecto vs DB remota compartida; corregido con el timeout explícito de 30s que ya usan sus vecinos (2/2 verde tras el fix). Nota: una primera corrida sin `.env.local` cargado falló 5 archivos solo por `DATABASE_URL` ausente — ambiental, no de código |
| Build de producción | ✅ Verde. Nota operativa: si se hereda `NODE_ENV=development` de `.env.local`, `next build` usa el build dev de React y falla el prerender de `/_global-error` — artefacto del entorno local, no del código (en Vercel `NODE_ENV` lo fija la plataforma) |
| E2E Playwright (9 specs, 26 tests) | Reportado 26/26 verde en STATE.md 2026-07-20; smoke de la rama verificado en FASE 5 del plan de salida |
| Cobertura | Gate ratchet activo (líneas 72/stmts 70/funcs 70/branches 62; baseline ~79%) |

**QA-01 (medio) — `docs/QA_CHECKLIST.md` virgen y desactualizado.** 20 secciones sin marcar ("Sin corridas todavía", línea 274) y con contenido de mayo (dice que el botón "Ir a pagar" está deshabilitado "Próximamente" — el checkout ya existe hace meses). **Acción:** refrescar contra la realidad actual y ejecutar la primera corrida como parte del go-live de Etapa 1 (versión reducida catálogo) y la corrida completa en Etapa 2.
**QA-02 (medio) — Load testing pendiente.** Existe `tests/load/storefront-browsing.js` (k6) pero nunca se corrió formalmente (ROADMAP bloque E). **Acción:** corrida k6 antes de Etapa 2 (Etapa 1 sin pagos tiene riesgo de carga muy bajo).
**QA-03 (bajo) — Falta E2E de pago y envío reales** (sandbox E2E): cubierto por FASE 12 del runbook (compra real de punta a punta).

---

## 9. Compliance y legal

**Implementado en código (verificado):** consentimiento versionado append-only con IP/UA (Ley 1581); export/borrado de datos en mi-cuenta; retracto 5 días con excepción de personalizados y máquina de estados (Ley 1480/2439); garantías con flujo admin; reversión del pago (art. 51) en la saga de refunds; 8 páginas `/legal/*` publicadas; lista de subprocesadores; cookie consent; token de unsubscribe RFC 8058.

**LEG-01 (medio, humano) — Trámites abiertos:** NIT/RUT + Cámara de Comercio (ADR-071, persona natural), revisión de abogado de los textos legales (ADR-020: los drafts son base compliant, no reemplazan abogado), decisión de régimen DIAN con contador. **Bloquean Etapa 2** (facturación electrónica obligatoria al vender con pagos en línea; Resolución 165/2023). Para Etapa 1 (cotización por WhatsApp sin cobro en línea) el riesgo es el de cualquier venta informal por WhatsApp — mismo que el negocio ya opera hoy en Instagram.
**LEG-02 (bajo):** `/legal/cookies` marca `__cf_bm` como `[pendiente verificación]` y `/legal/terminos` tiene "ADR pendiente de abogado". Cerrar con la revisión legal.

---

## 10. Operación

**OPS-01 (medio, condicionante Etapa 1) — Backups rotos.** FASE 10 en curso: el dump se genera (0,65 MB) pero el endpoint S3 de R2 rechaza el handshake TLS (alert 40); hipótesis documentada: R2 no aprovisionado en la cuenta. **Sin backup verificado no hay DR.** Requiere acción humana (verificar bucket en Cloudflare → Overview) + DR drill posterior. No bloquea el tráfico de Etapa 1, pero debe cerrarse en la misma semana.
**OPS-02 (medio, riesgo aceptado) — Supabase compartida dev/prod.** Decisión explícita de Lucy (2026-07-21): migraciones, seeds y tests de integración escriben en la tienda en vivo. Los tests usan prefijo RUN y hay `cleanup-test-junk`, pero el riesgo residual existe. **Recomendación:** separar antes de Etapa 2 (con pagos reales, un test que toque una orden es inaceptable). Documentado como riesgo aceptado mientras tanto.
**OPS-03 (bajo):** Observabilidad sin Sentry (mandato del proyecto) — compensada con ErrorLog/ErrorReport/SiteEvent/WebVital en DB, alertas y daily-summary por cron, heartbeat de crons. SLOs cuantitativos del bloque D aún pendientes.
**OPS-04 (bajo):** Vercel Hobby prohíbe uso comercial → FASE 11.b (upgrade a Pro + Supabase Pro) debe ejecutarse **antes de abrir ventas reales de Etapa 1** (ya hay transacciones comerciales aunque sean por WhatsApp).

---

## 11. Deuda documental

- **DOC-01:** `CLAUDE.md` "Estado actual" (líneas 109-113) dice *"Sigue sin haber código. No intentar `npm install`…"* — falso desde hace meses; la app está desplegada. **Fix aplicado en esta sesión.**
- **DOC-02:** `CLAUDE.md` mandato #5 dice "Logística: Venndelo"; la integración real es **Aveonline** (ADR-039). `OPERATIONS.md` lista solo env vars `VENNDELO_*`. **Fix aplicado en esta sesión.**
- **DOC-03:** `OPERATIONS.md` no lista `CRON_SECRET` ni `EMAIL_REPLY_TO` (obligatorias en prod según runbook) y lista `ANTHROPIC_*` cuando el proveedor IA elegido es Gemini (ADR-058). **Fix aplicado en esta sesión.**
- **DOC-04:** `QA_CHECKLIST.md` desactualizado (ver QA-01).
- **DOC-05:** Comentarios de código obsoletos: PDP "añadir al carrito (placeholder)" (ya cableado), `features/support/actions.ts` "email difiere a sub-bloque G / Turnstile pendiente" (ya importa ambos). Menor.

---

## 12. Plan de remediación

### P0 — bloqueantes Etapa 2 (pagos/envíos) — ninguno bloquea Etapa 1 salvo lo indicado

| # | Hallazgo | Acción | Dueño | Esfuerzo |
|---|---|---|---|---|
| P0-1 | LEG-01 | NIT/RUT + Cámara de Comercio; abogado revisa legales; régimen DIAN con contador | Lucy (humano) | Trámite |
| P0-2 | INT-01 | Cuenta Wompi propia + llaves prod (FASE 7) | Lucy + código | 2h tras NIT |
| P0-3 | INT-02 | `AVEONLINE_ENV=production` + FASE 12 compra real E2E | Código + Lucy | 1 día |
| P0-4 | OPS-01 | Verificar bucket R2, cerrar handshake TLS, DR drill | Lucy + código | 2-4h |
| P0-5 | OPS-04 | Vercel Pro + Supabase Pro (FASE 11.b) — **antes de abrir Etapa 1** | Lucy | 1h |
| P0-6 | QA-01 | Refrescar QA_CHECKLIST + primera corrida (versión Etapa 1) | Código | 3h |

### P1 — esta semana (aplicados en esta sesión los 4 primeros)

| # | Hallazgo | Acción | Estado |
|---|---|---|---|
| P1-1 | SEC-01 | Sanitizar/encapsular SVG del QR MFA | ✅ Aplicado |
| P1-2 | SEC-02 | Eliminar `?? "dev"` de unsubscribe | ✅ Aplicado |
| P1-3 | SEC-03 | Forzar `https:` en redirects admin | ✅ Aplicado |
| P1-4 | UX-01 | Soporte/Garantías al NAV admin | ✅ Aplicado |
| P1-5 | OPS-02 | Separar Supabase dev/prod antes de Etapa 2 (decisión explícita) | Pendiente (Lucy) |
| P1-6 | QA-02 | Corrida k6 de load testing | Pendiente |
| P1-7 | DOC-01/02/03 | Corregir CLAUDE.md y OPERATIONS.md | ✅ Aplicado |

### P2 — backlog (documentado, sin fecha compromiso)

SEC-04 a SEC-08, QA-03, OPS-03, LEG-02, DOC-04/05, bump de Next que arrastre los fixes de postcss/@babel (§3.4).

---

## Anexo A — Comandos de verificación ejecutados

```bash
pnpm typecheck                 # ✅ verde
pnpm lint                      # ✅ verde (--max-warnings 0)
pnpm audit --prod              # 2 vulns build-time (postcss, @babel/core) — §3.4
pnpm --filter web test         # ✅ 2.145 passed / 2 skipped (con .env.local; ~17 min pooler remoto)
pnpm --filter web build        # ✅ verde (requiere NO heredar NODE_ENV=development del .env.local)
```

## Anexo B — Auditorías históricas relacionadas

`2026-05-09-coherence-audit.md` (21 hallazgos, cerrada), `2026-05-09-productive-readiness-audit.md` (43, absorbida), `2026-05-28-mega-audit/` (8 dimensiones), `2026-06-26-certify-bloque-a/` (checkout certificado con 48 tests), `2026-06-27-security-bloque-c/` (7/7 cerrado), `2026-07-18-adversarial-v3.md` (218 hallazgos, blockers+highs certificados), `2026-07-18-coupon-flow.md` (cerrada). Esta auditoría **no re-abre** esos frentes: verifica el estado actual y concentra lo abierto.
