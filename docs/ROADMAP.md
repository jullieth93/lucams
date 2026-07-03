# Roadmap — Lucams_shop

Ocho fases (0a–7). Este roadmap se **refrescó el 2026-06-27** para reflejar el estado real del código — antes marcaba "Fase 2 en curso" cuando checkout, pagos y admin ya estaban hechos.

> **⚠️ Cómo leer las fases vs. el estado real.** El detalle por fase abajo conserva el plan original (con sus checklists históricos), pero **la fuente fiel del avance día a día es [`STATE.md`](STATE.md) + el historial git**, no los checkboxes de cada fase. Cuando un checklist y la tabla de abajo se contradigan, gana la tabla + STATE.md.

### Mapeo: "Bloques A–F" (nomenclatura de trabajo) ↔ Fases

El trabajo reciente se nombró por **bloques**; equivalen a:

| Bloque | Qué es | Fase(s) | Estado |
| --- | --- | --- | --- |
| **A** | Checkout + Pagos + Saga (Wompi + Aveonline) | Fase 4 | ✅ **Certificado** (48 tests) |
| **B** | Compliance + Emails (Ley 1581/1480, retracto) | transversal (Fase 2/4) | ✅ Hecho (55 tests) |
| **Opción C** | Restructura admin del catálogo | Fase 2/6 | ✅ Hecho |
| **C** | Seguridad (RBAC, MFA admin, RLS, CSRF, Turnstile, CSP nonce) | Fase 1 + Fase 7 | ✅ Hecho (7/7 — ADR-042/043; matriz RLS completa R3 → en E) |
| **D** | Observabilidad (dashboard, alertas, SLOs) | Fase 7 | ⏳ Pendiente |
| **E** | Testing (RLS, E2E, visual, a11y) | transversal / Fase 7 | 🟡 En curso (~**1.529 vitest** en 4 lotes de servicio/lib + **83 de UI (componentes)** con revisión adversarial; **CI-DB LISTO** — todo corre contra Postgres real y se enforza en cada PR (antes: 0); **E2E Playwright 24/24** (smoke + compra + login admin + **reto MFA TOTP/código de respaldo** + **Estudio Konva** + **a11y**) + **6 bugs reales arreglados**; runner local serial estable (next dev + pooler no toleran concurrencia; CI paralelo contra build prod). **a11y sin dep:** skip-link (WCAG 2.4.1, faltaba) + `main#contenido` en 19 páginas + admin + spec de invariantes (lang, landmark, alt, h1). Falta: **a11y con axe automatizado** (dep `@axe-core/playwright` por aprobar), E2E envío/pago (deps externas Aveonline/Wompi), visual, load) |
| **F** | Refund + Cupones (redención en checkout, reembolso admin) | Fase 4/5 | ⏳ Pendiente |

## Vista general

| Fase | Nombre                                           | Estado                                                                | Aprobado |
| ---- | ------------------------------------------------ | --------------------------------------------------------------------- | -------- |
| 0a   | Estructura de documentación                      | 🟢 Completada (2026-05-09)                                            | ✅ Sí    |
| 0b   | Cuentas externas críticas para Fase 1 (re-scope) | 🟢 Completada (2026-05-09)                                            | ✅ Sí    |
| 1    | Base sólida (core técnico)                       | 🟢 Completada (auth + seguridad base; CI/CD y tests RLS → Bloques C/E) | ✅ Sí    |
| 2    | Catálogo y carrito (storefront)                  | 🟢 Completada (admin CRUD + storefront + carrito + admin pulido 2026-06-27) | ✅ Sí    |
| 3    | Estudio de Personalización                       | 🔄 Núcleo hecho; faltan plantillas (≈2/30), vista 3D y compartir       | ✅ Sí    |
| 4    | Checkout, pagos y logística                      | 🟢 **Completada y CERTIFICADA** (Bloque A · Wompi + Aveonline + saga · 48 tests) | ✅ Sí    |
| 5    | Marketing engine                                 | ⏸️ Pendiente (incl. redención de cupones → Bloque F)                  | ❌ No    |
| 6    | Backoffice y B2B                                 | ⏸️ Pendiente                                                          | ❌ No    |
| 7    | Pulido productivo + lanzamiento                  | ⏸️ Pendiente (incl. Bloques C Seguridad · D Observabilidad · E Testing) | ❌ No    |

> **Logística:** el plan original citaba **Venndelo**; la integración **realmente implementada es Aveonline** (ver [ADR-039](DECISIONS.md) e [INTEGRATIONS.md](INTEGRATIONS.md)). Donde abajo se lea "Venndelo" en tareas de Fase 4+, léase **Aveonline** (Venndelo queda como Plan B). **Stack:** Next.js **16** (no 15).

---

## Fase 0a — Estructura de documentación 🟢 Completada (2026-05-09)

> **Alcance:** únicamente archivos `.md` y configuración base (`.gitignore`, `.env.example`). Cero código de aplicación.

### Tareas

- [x] Crear `docs/`
- [x] Escribir `docs/PLAN.md`
- [x] Escribir `README.md`
- [x] Escribir `CLAUDE.md`
- [x] Escribir `docs/BRANDING.md`
- [x] Escribir `docs/ARCHITECTURE.md`
- [x] Escribir `docs/INTEGRATIONS.md`
- [x] Escribir `docs/ROADMAP.md` (este archivo)
- [x] Escribir `docs/DECISIONS.md`
- [x] Escribir `docs/OPERATIONS.md`
- [x] Borrar archivos globales de `~/.claude/plans/` (verificado vacío al 2026-05-09)
- [x] Auditoría de coherencia inicial — `docs/audits/2026-05-09-coherence-audit.md` (21 hallazgos resueltos)
- [x] Crear `docs/STATE.md` (traceability inter-sesión, ADR-019)
- [x] Crear `docs/SECURITY.md` (fuente única de seguridad)
- [x] Crear `.gitignore` exhaustivo
- [x] Crear `.env.example` con todas las variables placeholder
- [x] ADR-014 a ADR-019 documentados en `docs/DECISIONS.md`

### Criterio de aceptación — todos cumplidos

- ✅ Todos los `.md` existen en el repo.
- ✅ Plan global de plan-mode borrado (`~/.claude/plans/` vacío).
- ✅ Documentación auditada, sin contradicciones internas.
- ✅ Afirmaciones técnicas críticas verificadas contra docs oficiales (mandato #9).
- ✅ Decisiones de stack, seguridad y traceability documentadas como ADRs.

---

## Fase 0b — Cuentas externas críticas para Fase 1 🟢 Completada (2026-05-09)

> **Re-scope al final de Fase 0b:** la lista original incluía 8 cuentas. Al revisar **qué bloquea realmente arrancar Fase 1**, solo 4 son críticas. Las otras 4 (Cloudflare, Anthropic, Venndelo, Wompi sandbox) se mueven a sus fases respectivas — se crean cuando se vayan a usar, no antes. Esto evita el costo de mantener cuentas "frías" y reduce surface area mientras no se necesitan.

### Tareas (todas en tier Free) — completadas

- [x] **GitHub** repositorio `jullieth93/lucams` creado, branch `develop`, 7 commits pusheados, integrado con Vercel.
- [x] **Supabase** proyecto `zxkucphbsfygakgxcnik` Free, región `sa-east-1` (São Paulo), Postgres standard. GitHub linked. Auto-RLS ON, Auto-expose tables OFF, Data API ON. Extensiones habilitadas: `pgmq`, `pg_cron`, `pgcrypto`, `pg_stat_statements`. Connection test OK.
- [x] **Vercel** Hobby (cuenta `jullieth93`) conectado al repo. Proyecto `lucams-shop` deployado (build vacío esperado, sirve 404 hasta que llegue código en Fase 1). Webhook GitHub→Vercel funcionando.
- [x] **Resend** Free. API key con scope "Sending access" (least privilege). Dominio default `resend.dev` mientras no tengamos `mail.lucamsshop.co`.

### Movidas a fases posteriores (con justificación)

- **Cloudflare** (DNS + Turnstile + R2) → Fase 1 (Turnstile junto al signup) y Fase 7 (DNS + R2 al lanzar).
- **Anthropic** API key → Fase 3 (cuando se implemente el Estudio de Personalización con IA).
- **Venndelo** sandbox → Fase 4 (cuando se implemente el checkout con cotización).
- **Wompi** sandbox → Fase 4 (cuando se implemente el checkout). Su gestión la lleva la operadora externamente.

### Verificación de tiers Free contra docs oficiales (mandato #9) — completada

Ver [`OPERATIONS.md` § Verificación de tiers Free](OPERATIONS.md#verificación-de-tiers-free-contra-docs-oficiales-mandato-9). Todas las cifras citadas con URL y fecha. Hallazgo crítico: Vercel Hobby ToS prohíbe uso comercial — upgrade a Pro confirmado como obligación contractual antes del primer pago real (Fase 7).

### Incidentes de seguridad durante Fase 0b — resueltos

Dos leaks de credenciales por uso inadvertido de `Read`/`cat` sobre `.env.local`:

1. **2026-05-09 ~20:48** — `SUPABASE_SECRET_KEY` expuesta en transcript. Resuelto: rotación + revocación de la vieja. Post-mortem en [`docs/incidents/2026-05-09-secret-key-leak.md`](incidents/2026-05-09-secret-key-leak.md).
2. **2026-05-09 ~22:50** — `RESEND_API_KEY` parcialmente expuesta (regex de redacción incompleta). Resuelto: rotación + revocación.

Mitigaciones permanentes aplicadas: nueva sección en [`SECURITY.md` § Manipulación segura de archivos de credenciales por agentes IA](SECURITY.md#manipulación-segura-de-archivos-de-credenciales-por-agentes-ia), nuevos vectores en runbook IRP-001, memoria `feedback_never_read_env_files.md` actualizada con anti-patrones específicos. GitHub Push Protection bloqueó el push de un commit con la secret key — sistema funcionó como esperado.

### Verificación de tiers Free contra docs oficiales (mandato #9)

Antes de iniciar la fase, citar fuente con fecha en `OPERATIONS.md` para:

- [ ] Vercel Hobby: function timeout, bandwidth/mes, ToS uso comercial → `vercel.com/docs/limits` y `vercel.com/legal/terms`
- [ ] Supabase Free: límites DB/Storage/MAU/pausa → `supabase.com/pricing`
- [ ] Resend Free: límites de envío y dominio → `resend.com/pricing`
- [ ] Anthropic pricing del modelo elegido → `anthropic.com/pricing`

### Criterio de aceptación

- Todas las cuentas creadas y credenciales sandbox guardadas en el gestor de contraseñas del usuario.
- Variables de entorno listadas en `OPERATIONS.md` actualizadas con los valores reales (en `.env.local`, **nunca commiteadas**).
- Vercel previewing un Hello World del repo vacío.
- Tiers Free verificados contra fuente oficial con fecha.

---

## Fase 1 — Base sólida (core técnico) 🟢 Completada (auth completo, 2026-05-11)

> **Alcance:** scaffolding del monorepo, modelo de datos, autenticación, sistema de diseño base. Sin features de producto todavía.
>
> **Estado (2026-05-11):**
>
> - ✅ lado **customer** completo y testeado (signup OTP + login + logout + recuperar-password + restablecer + brand assets + security hardening + email autocomplete)
> - ✅ lado **admin** completo y testeado (`/admin/login` + `/admin/dashboard` + gate proxy + seed scripts + 4/4 pruebas Lucy pasadas)
> - ⏸️ Pendiente: **profile editing + right-to-deletion Ley 1581** (diferido a próximas fases por priorización; el flow customer básico ya cubre el caso de uso principal)

### Tareas

#### Scaffolding y stack — 🟢 Completado (2026-05-09)

- [x] Inicializar monorepo con `pnpm-workspace.yaml`
- [x] `pnpm create next-app@latest apps/web` con TS + **Tailwind v4** + App Router + React 19
- [x] Instalar **shadcn/ui** con style `radix-nova` (no `new-york` — preset evolucionó), `tw-animate-css`
- [x] `packages/db` con Prisma + schema completo (20 modelos)
- [x] Migración inicial aplicada en Supabase Free (`prisma migrate dev --name init`, commit `e572ebf`)
- [x] Clientes Supabase (`browser.ts`, `server.ts`, `service.ts`)

> Pendiente del bloque: habilitar extensiones Postgres `pgmq` + `pg_cron` para cron jobs (background tasks de Fase 4-5).

#### Seguridad base — 🟢 Completado (2026-05-11)

- [x] **RLS policies** aplicadas en TODAS las 20 tablas (`supabase/migrations/00000000000002_rls_policies.sql`)
- [x] **Security headers** en `apps/web/proxy.ts`: CSP (gateado por VERCEL_ENV), HSTS, X-Frame-Options, X-Content-Type-Options, Referrer-Policy, Permissions-Policy, X-DNS-Prefetch-Control
- [x] **CORS** restrictivo en `/api/*` (allowlist con Vercel preview branches + localhost dev)
- [x] **Rate limit** sobre Postgres (`lib/rate-limit.ts` + `lib/rate-limit-keys.ts` + tabla + función SQL atómica). Doble bucket por IP + email.
- [x] **Validación de input** centralizada con Zod en cada server action
- [x] **Auth Supabase** (registro, login, recuperación) con OTP de 6-10 dígitos en lugar de magic links (evita bug Gmail prefetch). Cookies HttpOnly + SameSite=Lax via @supabase/ssr.
- [x] **Pwned Passwords check** (HaveIBeenPwned k-anonymity) en signup + reset
- [x] **signOut global** al cambiar password (`scope: 'global'`)
- [x] **Eventos `security.*`** en logger estructurado pino
- [x] **Healthchecks** `/api/health`, `/api/health/db`

> Pendientes del bloque (siguen abiertos):
>
> - [ ] Middleware `/admin/*` con guard de rol — preparado en proxy.ts, falta activar cuando exista admin flow
> - [ ] `/api/health/integrations` (Wompi/Venndelo/Anthropic) — cuando esas integraciones existan en Fases 4/5
> - [ ] Cache sobre Postgres (`lib/cache.ts` + tabla `cache_entries`) — diferido a cuando aparezca el primer caso de uso real

#### UI base — 🟡 EN CURSO

- [x] Layout base con tokens Tailwind v4 (`@theme inline` directive con paleta brand-purple/turquoise/pink/coral/yellow/cream + Fredoka/Inter via next/font/google)
- [x] **BrandMark + LucamsLogo** unificados — logo real PNG 468×468 RGBA en `public/brand/lucams-logo.png`, servido como WebP 5KB via Next Image optimizer
- [x] **SiteHeader dinámico** (logged-in vs logged-out)
- [x] Footer mínimo en /(auth) layout con link a WhatsApp
- [ ] WhatsApp FAB global (todavía pendiente — solo está en footer de auth)
- [ ] Página 404 con mascota
- [ ] Página `error.tsx` global (sin filtrar PII)
- [ ] i18n routing es-CO/en con `next-intl` (diferido — pre-launch solo es-CO)

#### CI/CD y observabilidad

- [ ] CI en GitHub Actions: typecheck + lint + tests + secret scanning + dep audit
- [ ] Pre-commit hook con `lint-staged` (formato + lint en archivos staged)
- [ ] Vercel Logs como monitoreo básico
- [ ] Vercel Preview deployment funcionando
- [ ] Renovate o Dependabot configurado para PRs automáticos de actualización

#### Patrones cross-cutting (productive readiness audit 2026-05-09) — 🟡 EN CURSO

- [x] **Error format RFC 7807** — `lib/errors.ts` con `AppError` + 8 subclases + `problemResponse()`. Falta página `/legal/problems/[slug]` dereferenceable (diferido a Fase 4 cuando se generen errores RFC 7807 reales)
- [ ] **Capa de servicio** — pendiente. Cuando aparezca el primer feature de dominio complejo (probable Cart o Order en Fase 2/4)
- [ ] **Idempotency keys** — pendiente. Necesario en Fase 4 (webhook Wompi)
- [x] **Audit fields uniformes** en schema Prisma (createdBy/updatedBy/deletedAt/deletedBy en mutables). Falta auto-fill desde sesión en Prisma `$extends` middleware
- [x] **Soft delete consistente** — convención documentada en CONVENTIONS.md, schema lo soporta. Aplicación en repositories pendiente
- [x] **Request ID correlation** — `lib/request-id.ts` con AsyncLocalStorage, generado en proxy.ts, header X-Request-Id en respuesta
- [x] **Logger estructurado** — `pino` con redact paths para *Secret/*Key/\*Token/email/phone/password + bindings + ISO timestamp
- [ ] **`/api/metrics`** con bearer token — diferido a Fase 7 observabilidad
- [x] **Migration strategy** — Prisma migrations + supabase/migrations/\*.sql para SQL custom (RLS, rate-limit, etc.). Convención documentada
- [x] **Indexing inicial** — schema Prisma incluye índices en deletedAt + columns de lookup + composite indexes
- [ ] **`fetchWithTimeout` + `withRetry` + `CircuitBreaker`** — pendiente. Necesario en Fase 4-5 (Wompi/Venndelo/Anthropic calls)
- [ ] **`safeRedirectTarget`** — pendiente
- [ ] **Tests RLS automatizados** — pendiente, criterio importante antes de tráfico real
- [ ] **`@axe-core/react`** — pendiente a11y automation

### Criterio de aceptación

- Build pasa en CI con todos los checks (typecheck, lint, tests, security scan, RLS, a11y).
- Lighthouse ≥ 95 en home vacío.
- Login/registro funciona end-to-end con un usuario de prueba.
- **RLS verificada con tests automatizados:** usuario A no ve datos de usuario B (cliente impostor falla).
- Headers de seguridad presentes (verificable con `curl -I`).
- `/api/health`, `/api/health/db`, `/api/health/integrations` responden 200.
- Toda mutación devuelve `application/problem+json` en errores.
- Todo log incluye `requestId`.

---

## Fase 2 — Catálogo y carrito (storefront público) 🟢 Completada

> **Actualización 2026-06-27:** completada y luego ampliada. Admin CRUD de productos/categorías,
> storefront público (`/productos`, `/producto/[slug]`), carrito anónimo en Postgres con merge al
> login, imágenes y variantes/opciones. El admin del catálogo se restructuró ("Opción C") y se
> pulió la UX (sub-categorías, fotos por opción, ordenar por clic, etc. — ver ADR-040 y git
> 2026-06-27). Lo de abajo es el checklist histórico de cuando arrancó la fase.

> **Alcance:** todo lo navegable sin checkout.

> **Pivote vs plan original:** Carrito en **Postgres** (Cart + CartItem) con sessionId cookie, NO Zustand+localStorage. Razón: server-authoritative, habilita abandoned-cart emails posterior, alineado con mandato #11 CLAUDE.md (Postgres en pre-launch). Stock realtime queda para Fase 3 (junto con checkout).

### Tareas

- [x] **Admin CRUD productos** (commit `d9fab6b`) — listado paginado, crear con auto-slug, editar, archivar (soft-delete)
- [x] **Admin CRUD categorías** (commit `8714985`) — listado + create inline, archivar bloqueado si hay productos
- [x] **Seed catálogo demo** (commit `d31f037`) — 4 categorías + 8 productos via `make seed-products` (idempotente, upsert by slug)
- [x] **Storefront público** (commit `c77e641`) — `/productos` con filtro por categoría chips + `/producto/[slug]` con detalle + breadcrumb + WhatsApp deep-link
- [x] **Carrito anon end-to-end** (commit `7bfc879`) — cookie sessionId UUID, Cart/CartItem Postgres, merge inteligente al login/signup, variant Default auto-creada por producto
- [ ] **Imágenes de productos vía Supabase Storage** — bucket `product-images` + upload en admin form + render real en cards/detail/cart
- [ ] **Admin de variantes reales** — multi-variant products (el "Default" pattern es bridge, no destino final)
- [ ] **Home con hero + productos destacados** — reemplazar placeholder actual con featured products grid
- [ ] **Filtros adicionales en /productos** — precio rango, en stock, orden (precio asc/desc, recientes, destacados)
- [ ] **Reseñas con foto en PDP** (lectura) — Review model ya existe
- [ ] **Productos relacionados / recomendaciones simples**
- [ ] **SEO: metadata por página, sitemap dinámico, robots, JSON-LD `Product`**
- [ ] **Open Graph e Twitter Cards dinámicos por producto**

#### Tareas adicionales (productive readiness audit)

- [ ] **Estados explícitos en cada vista:** loading skeleton + empty state con mascota + error boundary + success
- [ ] **Error boundaries por nivel:** global (`global-error.tsx`), por route group, por componente crítico
- [ ] **Skeleton screens** (no spinners) que respetan `prefers-reduced-motion`
- [ ] **Visual regression baseline** con screenshots de Playwright sobre home/catálogo/PDP/carrito vacío
- [ ] **Páginas legales placeholder** (`/legal/privacidad`, `/legal/terminos`, `/legal/cookies`, `/legal/devoluciones`, `/legal/garantias`, `/legal/habeas-data`, `/legal/subprocesadores`, `/legal/security`)

### Criterio de aceptación

- Lighthouse ≥ 95 en home, catálogo, PDP.
- Carrito persiste tras refresh.
- Stock realtime funciona (probado con 2 pestañas).
- Productos se ven correctamente en mobile.
- Cada vista tiene estados loading/empty/error/success cubiertos.
- Visual regression no detecta cambios no intencionales.

---

## Fase 3 — Estudio de Personalización (diferenciador #1) 🔄 Núcleo hecho, incompleto

> **Actualización 2026-06-27:** el núcleo del Estudio (editor canvas + finalize→PNG alta
> resolución) está construido, pero faltan los assets y vistas extra: **solo ≈2 de las ~30
> plantillas SVG**, **no existe la vista 3D en nevera** ni el **compartir diseño** (`/d/[token]`),
> y tiene 0% de cobertura de tests. Deseable-no-bloqueante del primer lanzamiento salvo las
> plantillas (acción humana: diseñarlas/contratarlas).

> **Alcance:** el "plus" frente a magneticas.cl. Editor visual + 3D + IA.

### Tareas

- [ ] Editor canvas con `react-konva`
  - [ ] Capas: imágenes, texto, formas, fondos
  - [ ] Plantillas pre-armadas (mín. 10 por categoría)
  - [ ] Subida de fotos a Supabase Storage con URL firmada
  - [ ] Recorte y rotación de imágenes
  - [ ] Snap a grid, alineación, undo/redo
- [ ] Renderizado server-side a PNG alta resolución (300 DPI mínimo) para producción
- [ ] Vista previa 3D con `react-three-fiber`
  - [ ] Modelo simple de nevera estilizada
  - [ ] Imán texturizado con el render del editor
  - [ ] Cámara orbital con touch support
- [ ] Asistente IA con Claude API
  - [ ] Endpoint `/api/ai/design-suggest` con rate limit
  - [ ] UI de prompt con ocasión + cantidad de fotos
  - [ ] Cache 24h por combinación
- [ ] Guardar diseño en `CartItem.customDesign` (JSON)
- [ ] Botón "Pedir igual" desde una orden previa (clona el diseño)

#### Tareas adicionales (productive readiness audit)

- [ ] **Honeypots** en formularios públicos del estudio (anti-bot adicional al rate limit)
- [ ] **Validación post-upload** de MIME real (con `file-type`) — no confiar en cliente
- [ ] **EXIF stripping** server-side (con `sharp`) antes de mover a `production-assets`
- [ ] **Allowlist de MIME** + tamaño máximo 10MB enforced antes de generar URL firmada
- [ ] **Tests de seguridad:** intentar subir archivo con MIME falso → debe rechazar
- [ ] **Cache Claude API** en tabla `cache_entries` (Postgres + pg_cron, ADR-016)

### Criterio de aceptación

- Diseño persistente: agrego al carrito, refresco, sigue ahí.
- Render PNG de producción se descarga correctamente desde admin.
- Sugerencias IA aparecen en < 5 s.
- Funciona en mobile (touch para arrastrar/zoom).
- Cliente intenta subir archivo malformado/MIME-spoofed → rechazado en post-validation.
- EXIF (GPS) eliminado de fotos producidas.

---

## Fase 4 — Checkout, pagos y logística 🟢 Completada y CERTIFICADA (Bloque A)

> **Actualización 2026-06-27:** este es el **Bloque A**, que pasó una **certificación adversarial
> multi-agente** y quedó con **48 tests de integración (DB real) en verde**. Incluye: checkout con
> **Wompi (sandbox)**, **saga post-pago** (stock → envío → email con compensaciones), webhooks de
> Wompi y **Aveonline** (HMAC, anti-replay, idempotencia física del ledger, env-match), logística
> **Aveonline** (Coordinadora + contraentrega), claim atómico de guía, VOIDED→REFUNDED con revert
> de stock, y reconciliación visible en `/admin/pedidos`. **Pendiente solo:** llaves/cuenta de
> **producción** (acción humana) + el flujo de **retracto E2E** y **refund desde admin** (Bloque F).
> El checklist de abajo es el plan original; donde dice "Venndelo", léase **Aveonline**.

> **Alcance:** convertir carritos en órdenes pagadas y enviadas.

### Tareas

- [ ] Checkout multi-paso con `react-hook-form` + Zod
  - [ ] Paso 1: datos de contacto
  - [ ] Paso 2: dirección de envío + selector de departamento/ciudad
  - [ ] Paso 3: cotización Venndelo en vivo + selección de método de pago
  - [ ] Paso 4: revisión y confirmación
- [ ] Adaptador `PaymentProvider` con `WompiProvider` implementado
- [ ] `/api/checkout/create` crea Order y redirige a Wompi (sandbox)
- [ ] `/api/wompi/webhook` con verificación de firma e idempotencia
- [ ] `/api/venndelo/webhook` para tracking
- [ ] Pago contraentrega (COD) bypass de Wompi
- [ ] `/orden/[id]` con estado actual + tracking de Venndelo
- [ ] Email de confirmación (Resend) con plantilla react-email
- [ ] Email "tu pedido salió a reparto" con tracking URL
- [ ] Email "tu pedido llegó" pidiendo reseña

#### Tareas adicionales (productive readiness audit)

- [ ] **Saga pattern** `processPaidOrder`: stock commit → shipment create → email enqueue, con compensaciones e idempotencia (CONVENTIONS § Saga)
- [ ] **Tabla `SagaLog`** + dashboard `/admin/observability/sagas` para forensics
- [ ] **`Idempotency-Key` header** en `/api/checkout/create` (cliente envía UUID v4)
- [ ] **Schema `RetractRequest`** (Ley 1480 art. 47) + flujo end-to-end
- [ ] **Schema `Chargeback`** para tracking de reversiones de pago (Ley 1480 art. 51, plazo 21 días calendario para responder)
- [ ] **Cookie consent banner** funcional con tabla `Consent` + carga condicional de scripts
- [ ] **Email `retracto@lucamsshop.co`** operativo
- [ ] **Página `/cuenta/orden/:id/retractar`** con validación de elegibilidad (5 días hábiles + retractEligible flag)
- [ ] **Email transaccional** "tu factura electrónica" cuando DIAN emite (Fase 7 si DIAN no se integra antes)
- [ ] **Tests E2E:** flujo de retracto completo (solicitar → aprobar → recibir → reembolsar)

### Criterio de aceptación

- Compra completa con tarjeta sandbox Wompi `4242 4242 4242 4242` (verificado: [docs.wompi.co/datos-de-prueba-en-sandbox](https://docs.wompi.co/en/docs/colombia/datos-de-prueba-en-sandbox/) a 2026-05-09) → orden a `PAID`.
- Compra COD → orden a `PAID` con envío Venndelo creado.
- Webhook idempotente: enviar el mismo evento 2 veces no duplica nada (garantizado por `WebhookEvent.@@unique([source, externalId])`).
- **Stock se reserva al `PENDING_PAYMENT` con TTL 15 min** (transacción atómica `SELECT FOR UPDATE`) y se descuenta cuando pasa a `PAID` (ADR-014).
- Si Wompi declina (`DECLINED`/`ERROR`/`VOIDED`) o la reserva expira, el stock se libera.
- **Saga test E2E:** simular falla en `createShipment` después de `commitStock` → verificar que el stock se rollbackea y la orden queda en `CANCELLED` con razón clara.
- **Doble click en "Pagar":** crea una sola orden (idempotency key valida).
- **Retracto E2E:** cliente solicita retracto de imán no personalizado dentro de 5 días → recibe instrucciones → reembolso ejecutado en menos de 15 días calendario.

---

## Fase 5 — Marketing engine ⏸️

> **Alcance:** features que aumentan recurrencia, ticket promedio y crecimiento orgánico.

### Tareas

- [ ] CRUD de cupones (admin) + aplicación en checkout
- [ ] Programa de fidelidad
  - [ ] `LoyaltyTxn` por compra (1% del total en puntos)
  - [ ] `LoyaltyTxn` por reseña aprobada
  - [ ] Redención de puntos como descuento
  - [ ] Página `/cuenta/puntos` con historial
- [ ] Programa de referidos
  - [ ] `referralCode` único por cliente
  - [ ] Link compartible
  - [ ] `Referral` se crea cuando alguien usa el código
  - [ ] Reward para ambos cuando el referido paga su primera orden
- [ ] Bundle Creator
  - [ ] UI para elegir 3, 5 o 10 imanes
  - [ ] Descuento progresivo automático (5%, 10%, 15%)
- [ ] Recuperación de carrito abandonado
  - [ ] Job `pg_cron` cada 5 min que busca carritos elegibles y los enqueue en `pgmq`
  - [ ] Edge Function consumidora a 1h y 24h con dedupe vía `AbandonedCart.lastReminderSentAt`
  - [ ] Email con cupón en el primer recordatorio
  - [ ] `AbandonedCart.recovered` se marca cuando vuelve y compra
- [ ] Blog con MDX
  - [ ] `/blog/[slug]` con SEO completo
  - [ ] Admin para crear/editar posts

#### Tareas adicionales (productive readiness audit)

- [ ] **Feature flags integrados** (ADR-026 a tomar) — proveedor elegido + `lib/feature-flags.ts`
- [ ] **Tabla `FeatureFlag` o EdgeConfig** con flags activos documentados en `STATE.md`
- [ ] **A/B testing** infra básica (un test por release como mucho)
- [ ] **Email lifecycle marketing:** welcome series (3 emails), cumpleaños, recompra a 30/60/90 días
- [ ] **List-Unsubscribe header** en todos los emails de marketing (no transaccionales)

### Criterio de aceptación

- Cupón de 10% reduce el total correctamente.
- Compra suma puntos al cliente.
- Referido convertido suma reward a ambos.
- Email de recuperación llega en sandbox de Resend.
- Feature flag activado/desactivado se refleja en producción sin redeploy.

---

## Fase 6 — Backoffice y B2B ⏸️

> **Alcance:** que el negocio se pueda operar sin tocar código.

### Tareas

- [ ] Layout de admin con guard de auth + rol
- [ ] CRUD productos con subida de imágenes
- [ ] CRUD categorías con orden drag-and-drop
- [ ] Gestión de inventario (ajustes manuales con razón obligatoria)
- [ ] Listado de órdenes con filtros y búsqueda
- [ ] Detalle de orden con descarga de PNG de producción
- [ ] Reimprimir guía Venndelo
- [ ] Cambiar estado manual de orden (con razón)
- [ ] Listado de clientes
- [ ] Aprobación de reseñas (queue)
- [ ] Editor de blog
- [ ] Dashboard analytics
  - [ ] Ingresos del mes
  - [ ] Órdenes pendientes
  - [ ] Productos más vendidos
  - [ ] Productos sin stock
  - [ ] Conversión de carritos
- [ ] Portal mayorista `/mayorista`
  - [ ] Login separado o flag `isWholesale` en `Customer`
  - [ ] Listas de precios escalonados
  - [ ] Cotización con generación de PDF

#### Tareas adicionales (productive readiness audit)

- [ ] **`AdminActionLog` populated** en TODA acción mutante de admin (cambio estado, ajuste inventario, aprobación reseña, edición precio, etc.)
- [ ] **Página `/admin/audit`** para consultar `AdminActionLog` con filtros por actor/entidad/fecha
- [ ] **MFA obligatorio** para `SUPERADMIN` y `MANAGER`
- [ ] **Schema `WarrantyClaim`** + flujo de garantía (Ley 1480 art. 7-15)
- [ ] **B2B IVA + retenciones:** lógica de cálculo en checkout B2B (cliente como agente retenedor)
- [ ] **Resolución de numeración DIAN** para B2B (puede ser distinta del B2C)

### Criterio de aceptación

- Admin puede agregar un producto, subir foto, publicarlo, y aparece en storefront tras revalidate.
- Admin puede marcar una orden como enviada y el cliente recibe email.
- Cliente B2B ve precios distintos a los del retail.
- Toda acción admin queda registrada en `AdminActionLog` con actor, entidad, metadata.
- Admin sin MFA no puede ejecutar acciones destructivas.

---

## Fase 7 — Pulido productivo + lanzamiento ⏸️

> **Alcance:** todo lo que falta para abrir las puertas. Aquí migramos a Pro.

### Tareas pre-lanzamiento

- [ ] Auditoría de seguridad
  - [ ] Headers CSP, X-Frame-Options, Referrer-Policy, HSTS, Permissions-Policy verificados con `curl -I`
  - [ ] Rate limit en endpoints públicos validado con load test
  - [ ] CAPTCHA Turnstile en checkout y registro
  - [ ] Verificar RLS con cliente impostor (tests automatizados verdes)
  - [ ] **Threat model formal por flujo crítico** (STRIDE) revisado
  - [ ] **Pen test externo** (proveedor + alcance + reporte resuelto)
- [ ] Tests E2E con Playwright
  - [ ] Flujo de compra Wompi sandbox
  - [ ] Flujo de compra COD
  - [ ] Flujo de personalización
  - [ ] Flujo de admin
  - [ ] Flujo de retracto
  - [ ] Smoke tests post-deploy
- [ ] **Visual regression** baseline aprobada
- [ ] **Load testing con k6** sobre `/api/checkout/create` y `/api/ai/design-suggest`
- [ ] Lighthouse ≥ 95 en todas las páginas críticas
- [ ] Carga real de productos con fotos profesionales (entregable del usuario)
- [ ] **Documentos legales con revisión de abogado (ADR-020)**
  - [ ] Política de privacidad (Ley 1581)
  - [ ] Términos y condiciones (Ley 1480)
  - [ ] Política de devoluciones y retracto (Ley 1480 art. 47)
  - [ ] Política de garantías (Ley 1480 art. 7-15)
  - [ ] Habeas data + formulario PQR
  - [ ] Política de cookies
  - [ ] Lista de subprocesadores (`/legal/subprocesadores`)
  - [ ] Política de seguridad (`/legal/security`)
- [ ] **Cookie consent banner v1** con tabla `Consent` + carga condicional de scripts
- [ ] **DIAN: integración con proveedor tecnológico** (ADR-025)
  - [ ] Adaptador `InvoiceProvider` implementado con `WompiProvider`-style abstraction
  - [ ] Resolución de numeración aprobada por DIAN
  - [ ] Cuenta del proveedor activada (Alegra/Siigo/Facture)
  - [ ] Flujo `Order.PAID → Invoice` end-to-end con saga + retry
  - [ ] Notas crédito vía mismo provider para reembolsos
- [ ] **Monitoreo de errores elegido** (ADR-022) e implementado
- [ ] **Constituir el negocio:** RUES + Cámara de Comercio + RUT con responsabilidad 42 (trámites del usuario)
- [ ] **DR drill #1 ejecutado** (PITR restore) y documentado
- [ ] **IRP runbook** revisado y leído por el operador
- [ ] **Process de postmortem** validado con un ejercicio en seco

### Tareas de migración Free → Pro

- [ ] **Vercel Pro** activado
- [ ] **Supabase Pro** activado (verificar PITR de 7 días)
- [ ] **Resend Pro** activado
- [ ] Compra de dominio `lucamsshop.co` en **mi.com.co**
- [ ] DNS configurado en Cloudflare
- [ ] Dominio conectado a Vercel
- [ ] DNS de email `mail.lucamsshop.co` configurado en Resend (SPF/DKIM/DMARC)
- [ ] Wompi en producción (cuentas reales)
- [ ] Venndelo en producción
- [ ] Cambio de número WhatsApp temporal por el definitivo

### Tareas de soft launch

- [ ] Compra de prueba real con valor mínimo
- [ ] Verificar webhook de Wompi en producción
- [ ] Verificar webhook de Venndelo en producción
- [ ] Verificar email transaccional desde dominio propio
- [ ] Lanzamiento público (anuncio en Instagram + Linktree)
- [ ] Monitoreo activo las primeras 72h

### Criterio de aceptación

- Una compra real con tarjeta real procesa correctamente.
- El cliente recibe email desde `hola@mail.lucamsshop.co`.
- El envío llega al destino vía Coordinadora/Venndelo.
- No hay errores 500 en Vercel Logs durante 24h continuas.
- Todas las páginas críticas con Lighthouse ≥ 95.

---

## Después del lanzamiento (post-Fase 7)

Ideas para iteraciones futuras (no comprometidas):

- WhatsApp Business API (Twilio) cuando el volumen lo justifique
- Mercado Pago como pasarela alterna (con el adaptador ya listo)
- App móvil nativa (React Native) si la PWA no alcanza
- Multi-tenant para franquiciar
- Marketplace de diseños hechos por la comunidad
- Suscripciones (caja mensual de imanes sorpresa)
- Expansión a México y Argentina con Mercado Pago
