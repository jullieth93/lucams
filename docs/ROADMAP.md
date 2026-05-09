# Roadmap — Lucams_shop

Ocho fases. La Fase 0a es la única que está autorizada al momento de escribir este documento. El resto requiere aprobación explícita del usuario antes de arrancar.

## Vista general

| Fase | Nombre | Estado | Aprobado |
|---|---|---|---|
| 0a | Estructura de documentación | 🟢 Completada (2026-05-09) | ✅ Sí |
| 0b | Cuentas externas en Free | ⏸️ Pendiente | ❌ No |
| 1 | Base sólida (core técnico) | ⏸️ Pendiente | ❌ No |
| 2 | Catálogo y carrito (storefront) | ⏸️ Pendiente | ❌ No |
| 3 | Estudio de Personalización | ⏸️ Pendiente | ❌ No |
| 4 | Checkout, pagos y logística | ⏸️ Pendiente | ❌ No |
| 5 | Marketing engine | ⏸️ Pendiente | ❌ No |
| 6 | Backoffice y B2B | ⏸️ Pendiente | ❌ No |
| 7 | Pulido productivo + lanzamiento | ⏸️ Pendiente | ❌ No |

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

## Fase 0b — Cuentas externas en Free ⏸️

> **Alcance:** crear cuentas en servicios externos. El usuario hace, Claude guía.

### Tareas (todas en tier Free)

- [ ] Cuenta **Supabase** (proyecto Free, región más cercana a Colombia: South America `sa-east-1` o `us-east-1`)
- [ ] Cuenta **Vercel** (Hobby, conectada a GitHub del proyecto)
- [ ] Cuenta **Resend** (Free, sin dominio aún)
- [ ] Cuenta **Cloudflare** (Free, sin dominio aún) → **habilitar Turnstile** dentro de la cuenta para CAPTCHA
- [ ] Avanzar gestión de **Wompi** (sandbox primero)
- [ ] Cuenta **Venndelo** (sandbox)
- [ ] Cuenta **Anthropic** (API key con presupuesto mensual)
- [ ] **GitHub** repositorio creado y conectado a Vercel
- [ ] **Cloudflare R2** activado dentro de la cuenta Cloudflare (para backups en Fase 7)

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

## Fase 1 — Base sólida (core técnico) ⏸️

> **Alcance:** scaffolding del monorepo, modelo de datos, autenticación, sistema de diseño base. Sin features de producto todavía.

### Tareas

#### Scaffolding y stack
- [ ] Inicializar monorepo con `pnpm-workspace.yaml`
- [ ] `pnpm create next-app@latest apps/web` con TS + **Tailwind v4** + App Router + React 19
- [ ] Instalar **shadcn/ui** con style `new-york`, `tw-animate-css`, `sonner` (per Tailwind v4 caveats verificados)
- [ ] `packages/db` con Prisma + schema completo (incluye `pgmq`, `pg_cron` extensions)
- [ ] Migración inicial aplicada en Supabase Free
- [ ] Habilitar extensiones Postgres: `pgmq`, `pg_cron`, `uuid-ossp` (vía SQL migration en `supabase/migrations/`)
- [ ] Clientes Supabase (`browser.ts`, `server.ts`, `service.ts`)

#### Seguridad base (ver `docs/SECURITY.md`)
- [ ] **RLS policies** aplicadas para `Customer`, `Cart`, `Order`, `Address`, `Review` con tests automáticos
- [ ] **Security headers** en `next.config.mjs` o middleware: CSP, X-Frame-Options, HSTS, Referrer-Policy, Permissions-Policy
- [ ] **CORS** configurado restrictivo en API routes (whitelist de orígenes)
- [ ] **Rate limit** sobre Postgres (`lib/rate-limit.ts` + tabla `rate_limit_buckets`)
- [ ] **Cache** sobre Postgres (`lib/cache.ts` + tabla `cache_entries` + cleanup vía `pg_cron`)
- [ ] **Validación de input** centralizada con Zod en `lib/validation/`
- [ ] **Auth Supabase** (registro, login, recuperación de password) con cookies HttpOnly + SameSite=Lax
- [ ] **Middleware** `/admin/*` con guard de rol (`AdminUser.role`)
- [ ] **Healthchecks** `/api/health`, `/api/health/db`, `/api/health/integrations`

#### UI base
- [ ] Layout base con tokens de diseño Tailwind v4 (`@theme` directive, paleta de `BRANDING.md`)
- [ ] Header + Footer + WhatsApp FAB
- [ ] Página 404 con mascota
- [ ] Página `error.tsx` global (sin filtrar PII en mensajes)
- [ ] i18n routing es-CO/en con `next-intl`

#### CI/CD y observabilidad
- [ ] CI en GitHub Actions: typecheck + lint + tests + secret scanning + dep audit
- [ ] Pre-commit hook con `lint-staged` (formato + lint en archivos staged)
- [ ] Vercel Logs como monitoreo básico
- [ ] Vercel Preview deployment funcionando
- [ ] Renovate o Dependabot configurado para PRs automáticos de actualización

#### Patrones cross-cutting (productive readiness audit 2026-05-09)

- [ ] **Error format RFC 7807** — `lib/errors.ts` con `ProblemDetails` + helpers (`problem.validation`, `problem.notFound`, etc.) + página `/legal/problems/[slug]` para que los URIs sean dereferenceables
- [ ] **Capa de servicio** — estructura `features/<feat>/{service.ts, repository.ts, server-actions.ts, schemas.ts}` con tests unitarios sobre service mockeando repository
- [ ] **Idempotency keys** — tabla `IdempotencyKeys` + `lib/idempotency.ts` + cleanup vía `pg_cron`
- [ ] **Audit fields auto-fill** — `createdBy/updatedBy/deletedAt/deletedBy` en repositories
- [ ] **Soft delete consistente** — filtro default `WHERE "deletedAt" IS NULL` en repositories
- [ ] **Request ID correlation** — middleware genera UUID, `AsyncLocalStorage` lo propaga, header `X-Request-Id` en respuesta
- [ ] **Logger estructurado** — `pino` con redact de PII (emails, phones, tokens, *Secret/*Key)
- [ ] **`/api/metrics`** protegido con bearer token (preparado para scraper Prometheus futuro)
- [ ] **Migration strategy** documentada — expand-then-contract aplicado desde la primera migración
- [ ] **Indexing inicial** — set definido en CONVENTIONS aplicado vía migration
- [ ] **`fetchWithTimeout` + `withRetry` + `CircuitBreaker`** en `lib/` con uso obligatorio en llamadas externas
- [ ] **`safeRedirectTarget`** en `lib/redirects.ts` para prevenir open redirects
- [ ] **Tests RLS automatizados** con cliente impostor (criterio de aceptación)
- [ ] **`@axe-core/react`** en dev mode + `axe-playwright` en CI

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

## Fase 2 — Catálogo y carrito (storefront público) ⏸️

> **Alcance:** todo lo navegable sin checkout.

### Tareas

- [ ] Seed de DB con 30+ productos espejo de magneticas.cl (placeholders)
- [ ] Home con hero, categorías destacadas, productos destacados, testimonios
- [ ] `/catalogo` con filtros (categoría, precio, en stock) y orden
- [ ] `/categoria/[slug]` con paginación
- [ ] `/producto/[slug]` con galería, descripción, variantes, agregar al carrito
- [ ] Carrito persistente (Zustand + `localStorage`) con realtime de stock (Supabase Realtime)
- [ ] `/carrito` con resumen, modificar cantidades, código de cupón
- [ ] Reseñas con foto en PDP (lectura)
- [ ] Productos relacionados / recomendaciones simples
- [ ] SEO: metadata por página, sitemap dinámico, robots, JSON-LD `Product`
- [ ] Open Graph e Twitter Cards dinámicos por producto

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

## Fase 3 — Estudio de Personalización (diferenciador #1) ⏸️

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

## Fase 4 — Checkout, pagos y logística ⏸️

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
