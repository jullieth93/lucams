Note el desfase entre los docs y el estado real descrito en el prompt. Los docs (ROADMAP/PLAN) están desactualizados respecto a lo que el prompt describe como ya hecho (Bloque A/B/Opción C). Lo señalo explícitamente.

# Lector 1 — ROADMAP + PLAN

> **Fuentes leídas:** `/home/ansible/workspaces/lucams_shop/docs/ROADMAP.md` (completo) + `/home/ansible/workspaces/lucams_shop/docs/PLAN.md` (completo).
>
> **⚠️ Aviso de desfase doc-vs-realidad:** ROADMAP.md y PLAN.md están **desactualizados** respecto al estado real que describe el prompt del refresh. Los docs no mencionan "Bloque A/B/C" ni "Opción C" ni los commits de hoy (2026-06-27); su última fecha registrada es **2026-05-11**. PLAN.md aún cita "Next.js 15" en varios puntos (líneas 14, 129, 268, 300-308), pese a que CLAUDE.md mandata **Next.js 16**. Todo lo etiquetado abajo como estado refleja **lo que dicen los docs**, no el avance real posterior. Donde el doc no cubre algo, lo marco `[pendiente verificación]`.

---

## 1. Lista ORDENADA de fases (numeración/nombre tal cual)

El plan está estructurado en **ocho fases** (ROADMAP.md líneas 7-17). Numeración y nombres literales:

| Fase | Nombre (literal) | Estado en doc | Aprobado |
| --- | --- | --- | --- |
| **0a** | Estructura de documentación | 🟢 Completada (2026-05-09) | ✅ Sí |
| **0b** | Cuentas externas críticas para Fase 1 (re-scope) | 🟢 Completada (2026-05-09) | ✅ Sí |
| **1** | Base sólida (core técnico) | 🟢 Completada (auth completo, 2026-05-11) | ✅ Sí |
| **2** | Catálogo y carrito (storefront) | 🟡 EN CURSO (2026-05-11) | ✅ Sí |
| **3** | Estudio de Personalización | ⏸️ Pendiente | ❌ No |
| **4** | Checkout, pagos y logística | ⏸️ Pendiente | ❌ No |
| **5** | Marketing engine | ⏸️ Pendiente | ❌ No |
| **6** | Backoffice y B2B | ⏸️ Pendiente | ❌ No |
| **7** | Pulido productivo + lanzamiento | ⏸️ Pendiente | ❌ No |

> PLAN.md (líneas 300-308) lista las mismas fases en su sección "Fases de implementación", con descripción de una línea cada una. **Nota:** el plan NO usa la terminología "Bloque A/B/C" del prompt — esa nomenclatura no existe en estos dos docs `[pendiente verificación: probablemente vive en docs/STATE.md o docs/audits/, no leídos en este encargo]`.

---

## 2. Por fase — objetivo + criterios de aceptación + estado del checklist

### Fase 0a — Estructura de documentación · 🟢 Completada (2026-05-09)
- **Alcance:** solo archivos `.md` + config base (`.gitignore`, `.env.example`). Cero código de aplicación.
- **Checklist:** 15/15 ítems marcados `[x]` (crear `docs/`, PLAN/README/CLAUDE/BRANDING/ARCHITECTURE/INTEGRATIONS/ROADMAP/DECISIONS/OPERATIONS/STATE/SECURITY, `.gitignore`, `.env.example`, ADR-014 a ADR-019, auditoría de coherencia con 21 hallazgos resueltos).
- **Criterios de aceptación (todos ✅):** todos los `.md` existen; `~/.claude/plans/` vacío; doc auditada sin contradicciones; afirmaciones técnicas verificadas (mandato #9); decisiones documentadas como ADRs.

### Fase 0b — Cuentas externas críticas para Fase 1 · 🟢 Completada (2026-05-09)
- **Objetivo:** crear las cuentas externas (tier Free) que bloquean Fase 1. Re-scope: de 8 cuentas originales, solo 4 son críticas; las otras 4 se difieren.
- **Checklist tareas (4/4 `[x]`):** GitHub (repo `jullieth93/lucams`, branch `develop`, integrado con Vercel) · Supabase (proyecto `zxkucphbsfygakgxcnik` Free, región `sa-east-1`, extensiones `pgmq`/`pg_cron`/`pgcrypto`/`pg_stat_statements`) · Vercel (Hobby, proyecto `lucams-shop` deployado) · Resend (Free, key con scope "Sending access", dominio `resend.dev`).
- **Movidas a fases posteriores (con justificación):** Cloudflare → Fase 1 (Turnstile) + Fase 7 (DNS+R2) · Anthropic → Fase 3 · Venndelo sandbox → Fase 4 · Wompi sandbox → Fase 4.
- **Sub-checklist "Verificación de tiers Free" (líneas 88-93):** aparece con 4 ítems `[ ]` SIN marcar (Vercel/Supabase/Resend/Anthropic), pero el texto de la sección previa (líneas 73-75) dice que la verificación está "completada" — **inconsistencia interna del propio doc** `[pendiente verificación]`.
- **Incidentes durante la fase (resueltos):** 2 leaks de credenciales por `Read`/`cat` sobre `.env.local` (`SUPABASE_SECRET_KEY` y `RESEND_API_KEY`), ambos rotados/revocados; mitigaciones permanentes en SECURITY.md + IRP-001 + memoria.
- **Criterios de aceptación:** cuentas creadas + credenciales en gestor del usuario; vars en `.env.local` (nunca commiteadas); Vercel sirviendo el repo; tiers Free verificados con fecha.

### Fase 1 — Base sólida (core técnico) · 🟢 Completada (auth completo, 2026-05-11)
- **Objetivo:** scaffolding monorepo, modelo de datos, autenticación, sistema de diseño base. Sin features de producto.
- **Estado declarado:** ✅ customer completo y testeado (signup OTP + login + logout + recuperar/restablecer password + brand assets + hardening) · ✅ admin completo y testeado (`/admin/login` + `/admin/dashboard` + gate proxy + seed scripts + 4/4 pruebas Lucy) · ⏸️ diferido: profile editing + right-to-deletion Ley 1581.
- **Sub-bloques y su estado:**
  - *Scaffolding y stack* — 🟢 Completado: monorepo pnpm, `create next-app` con TS+Tailwind v4+App Router+React 19, shadcn/ui style `radix-nova`, `packages/db` Prisma con 20 modelos, migración inicial (`init`, commit `e572ebf`), clientes Supabase. **Pendiente del bloque:** habilitar `pgmq`+`pg_cron` (nota: 0b dice que ya se habilitaron — inconsistencia menor).
  - *Seguridad base* — 🟢 Completado: RLS en las 20 tablas, security headers en `proxy.ts`, CORS restrictivo, rate limit sobre Postgres (doble bucket IP+email), validación Zod, Auth Supabase con OTP 6-10 dígitos, Pwned Passwords check, signOut global, eventos `security.*` en pino, healthchecks `/api/health` y `/api/health/db`. **Pendientes abiertos `[ ]`:** middleware `/admin/*` con guard de rol (preparado, falta activar) · `/api/health/integrations` (Fases 4/5) · cache sobre Postgres (diferido).
  - *UI base* — 🟡 EN CURSO: `[x]` layout con tokens Tailwind v4, BrandMark+LucamsLogo, SiteHeader dinámico, footer auth con WhatsApp. `[ ]` pendientes: WhatsApp FAB global, 404 con mascota, `error.tsx` global, i18n es-CO/en con next-intl (diferido, pre-launch solo es-CO).
  - *CI/CD y observabilidad* — TODO `[ ]` sin marcar: CI GitHub Actions (typecheck/lint/tests/secret-scan/dep-audit), pre-commit `lint-staged`, Vercel Logs, Vercel Preview, Renovate/Dependabot.
  - *Patrones cross-cutting* — 🟡 EN CURSO: `[x]` error format RFC 7807 (`lib/errors.ts`, falta página dereferenceable → Fase 4), audit fields en schema (falta auto-fill via `$extends`), soft delete (convención lista, falta aplicar en repos), request ID correlation, logger pino, migration strategy, indexing inicial. `[ ]` pendientes: capa de servicio (Fase 2/4), idempotency keys (Fase 4), `/api/metrics` (Fase 7), `fetchWithTimeout`/`withRetry`/`CircuitBreaker` (Fase 4-5), `safeRedirectTarget`, tests RLS automatizados, `@axe-core/react`.
- **Criterios de aceptación (mezcla cumplido/pendiente):** build CI con todos los checks · Lighthouse ≥95 home vacío · login/registro E2E ✅ · **RLS verificada con tests automatizados** (pendiente, los tests RLS no están hechos) · headers seguridad presentes ✅ · `/api/health`+`/db`+`/integrations` 200 (integrations pendiente) · toda mutación devuelve `application/problem+json` en error · todo log con `requestId` ✅.

### Fase 2 — Catálogo y carrito (storefront público) · 🟡 EN CURSO (2026-05-11)
- **Objetivo:** todo lo navegable sin checkout.
- **Pivote registrado:** Carrito en **Postgres** (Cart + CartItem) con sessionId cookie, NO Zustand+localStorage (server-authoritative, habilita abandoned-cart, alineado a mandato #11). Stock realtime se mueve a Fase 3.
- **Checklist:**
  - `[x]` Admin CRUD productos (`d9fab6b`) · Admin CRUD categorías (`8714985`) · Seed catálogo demo 4 cat + 8 prod (`d31f037`) · Storefront público `/productos`+`/producto/[slug]` (`c77e641`) · Carrito anon E2E con merge al login (`7bfc879`).
  - `[ ]` Imágenes vía Supabase Storage (bucket `product-images`) · admin de variantes reales · home con hero + destacados · filtros adicionales (precio/stock/orden) · reseñas con foto en PDP (lectura) · productos relacionados · SEO (metadata/sitemap/robots/JSON-LD Product) · OG + Twitter Cards por producto.
  - *Adicionales (productive readiness audit), todos `[ ]`:* estados loading/empty/error/success por vista · error boundaries por nivel · skeleton screens (reduced-motion) · visual regression baseline (Playwright) · páginas legales placeholder (8 rutas `/legal/*`).
- **Criterios de aceptación:** Lighthouse ≥95 (home/catálogo/PDP) · carrito persiste tras refresh · stock realtime con 2 pestañas · productos OK en mobile · cada vista con estados cubiertos · visual regression sin cambios no intencionales.

### Fase 3 — Estudio de Personalización (diferenciador #1) · ⏸️ Pendiente / ❌ No aprobada
- **Objetivo:** el "plus" frente a magneticas.cl — editor visual + 3D + IA. **Todo el checklist `[ ]`.**
- **Tareas:** editor canvas react-konva (capas, ≥10 plantillas/categoría, subida a Storage con URL firmada, recorte/rotación, snap/undo/redo) · render server-side PNG 300 DPI · vista 3D react-three-fiber (nevera, imán texturizado, cámara orbital touch) · asistente IA Claude (`/api/ai/design-suggest` con rate limit, UI prompt por ocasión, cache 24h) · guardar en `CartItem.customDesign` (JSON) · botón "Pedir igual".
- **Adicionales audit:** honeypots, validación MIME real post-upload (`file-type`), EXIF stripping (`sharp`), allowlist MIME + máx 10MB, tests de MIME spoofing, cache Claude en `cache_entries` (pg_cron, ADR-016).
- **Criterios:** diseño persiste tras refresh · render PNG descargable desde admin · sugerencias IA <5s · funciona en mobile (touch) · MIME-spoof rechazado · EXIF/GPS eliminado.

### Fase 4 — Checkout, pagos y logística · ⏸️ Pendiente / ❌ No aprobada
- **Objetivo:** convertir carritos en órdenes pagadas y enviadas. **Todo `[ ]`.**
- **Tareas:** checkout multi-paso (react-hook-form + Zod: contacto → dirección+depto/ciudad → cotización Venndelo en vivo+pago → revisión) · adaptador `PaymentProvider` con `WompiProvider` · `/api/checkout/create` (Order→Wompi sandbox) · `/api/wompi/webhook` (firma + idempotencia) · `/api/venndelo/webhook` (tracking) · COD bypass de Wompi · `/orden/[id]` con tracking · 3 emails Resend (confirmación, salió a reparto, llegó+reseña).
- **Adicionales audit:** saga `processPaidOrder` (stock→shipment→email, con compensaciones+idempotencia) · tabla `SagaLog` + dashboard `/admin/observability/sagas` · `Idempotency-Key` en checkout · schema `RetractRequest` (Ley 1480 art. 47) · schema `Chargeback` (art. 51, 21 días) · cookie consent + tabla `Consent` · email `retracto@lucamsshop.co` · página `/cuenta/orden/:id/retractar` (5 días hábiles) · email factura electrónica DIAN · tests E2E retracto.
- **Criterios (verificados con fuentes en el doc):** compra tarjeta sandbox Wompi `4242…` → `PAID` · compra COD → `PAID` + envío Venndelo · webhook idempotente (`WebhookEvent.@@unique([source, externalId])`) · stock reservado al `PENDING_PAYMENT` TTL 15 min (`SELECT FOR UPDATE`), descontado al `PAID` (ADR-014), liberado si declina/expira · saga test E2E (falla en `createShipment` → rollback stock + orden `CANCELLED`) · doble-click "Pagar" → una sola orden (idempotency) · retracto E2E (<15 días calendario).

### Fase 5 — Marketing engine · ⏸️ Pendiente / ❌ No aprobada
- **Objetivo:** recurrencia, ticket promedio, crecimiento orgánico. **Todo `[ ]`.**
- **Tareas:** CRUD cupones + aplicación en checkout · fidelidad (`LoyaltyTxn` 1% por compra + por reseña aprobada + redención + `/cuenta/puntos`) · referidos (`referralCode` único, link, `Referral`, reward bilateral a primera orden) · Bundle Creator (3/5/10 imanes, descuento 5/10/15%) · recuperación carrito abandonado (pg_cron 5 min → pgmq, consumidora 1h/24h con dedupe, cupón en 1er recordatorio, marca `recovered`) · blog MDX (`/blog/[slug]` SEO + admin).
- **Adicionales audit:** feature flags (ADR-026 a tomar) + `lib/feature-flags.ts` · tabla `FeatureFlag`/EdgeConfig · A/B testing básico · email lifecycle (welcome series 3, cumpleaños, recompra 30/60/90) · `List-Unsubscribe` en marketing.
- **Criterios:** cupón 10% reduce total · compra suma puntos · referido convertido suma reward bilateral · email recuperación llega en sandbox Resend · feature flag refleja sin redeploy.

### Fase 6 — Backoffice y B2B · ⏸️ Pendiente / ❌ No aprobada
- **Objetivo:** operar el negocio sin tocar código. **Todo `[ ]`.**
- **Tareas:** layout admin con guard auth+rol · CRUD productos con imágenes · CRUD categorías drag-and-drop · inventario (ajustes con razón obligatoria) · listado órdenes con filtros/búsqueda · detalle orden con descarga PNG producción · reimprimir guía Venndelo · cambio estado manual (con razón) · listado clientes · aprobación reseñas (queue) · editor blog · dashboard analytics (ingresos mes, órdenes pendientes, más vendidos, sin stock, conversión carritos) · portal mayorista `/mayorista` (flag `isWholesale`, precios escalonados, cotización PDF).
- **Adicionales audit:** `AdminActionLog` en TODA acción mutante · página `/admin/audit` con filtros · MFA obligatorio para `SUPERADMIN`/`MANAGER` · schema `WarrantyClaim` (Ley 1480 art. 7-15) · B2B IVA+retenciones · resolución numeración DIAN B2B.
- **Criterios:** admin agrega producto+foto+publica → aparece en storefront tras revalidate · admin marca orden enviada → cliente recibe email · B2B ve precios distintos · toda acción admin en `AdminActionLog` · admin sin MFA no ejecuta acciones destructivas.

### Fase 7 — Pulido productivo + lanzamiento · ⏸️ Pendiente / ❌ No aprobada
- **Objetivo:** todo lo que falta para abrir. **Aquí se migra Free → Pro.** Todo `[ ]`.
- **Pre-lanzamiento:** auditoría de seguridad (headers con `curl -I`, rate limit con load test, **CAPTCHA Turnstile en checkout y registro**, RLS con cliente impostor, threat model STRIDE, pen test externo) · tests E2E Playwright (Wompi sandbox, COD, personalización, admin, retracto, smoke post-deploy) · visual regression baseline · load testing k6 (`/api/checkout/create` + `/api/ai/design-suggest`) · Lighthouse ≥95 · carga real de productos con fotos (entregable del usuario) · documentos legales con revisión de abogado (ADR-020: privacidad/términos/devoluciones/garantías/habeas-data+PQR/cookies/subprocesadores/security) · cookie consent banner v1 + tabla `Consent` · **DIAN** (adaptador `InvoiceProvider`, resolución numeración, cuenta proveedor Alegra/Siigo/Facture, `Order.PAID→Invoice` con saga+retry, notas crédito) · monitoreo de errores elegido (ADR-022) · constituir negocio (RUES+Cámara+RUT resp. 42) · DR drill #1 (PITR restore) · IRP runbook leído · postmortem en seco.
- **Migración Free→Pro:** Vercel Pro · Supabase Pro (PITR 7 días) · Resend Pro · compra dominio `lucamsshop.co` en mi.com.co · DNS Cloudflare · dominio→Vercel · DNS email `mail.lucamsshop.co` (SPF/DKIM/DMARC) · Wompi prod · Venndelo prod · cambio número WhatsApp.
- **Soft launch:** compra de prueba real valor mínimo · verificar webhooks Wompi+Venndelo en prod · verificar email desde dominio propio · lanzamiento público (Instagram + Linktree) · monitoreo activo 72h.
- **Criterios:** compra real con tarjeta real procesa · cliente recibe email desde `hola@mail.lucamsshop.co` · envío llega vía Coordinadora/Venndelo · sin errores 500 en Vercel Logs durante 24h · Lighthouse ≥95 en críticas.

---

## 3. Fases AUTORIZADAS vs bloqueadas/esperando aprobación

ROADMAP.md línea 3 (encabezado) es **explícito**: *"La Fase 0a es la única que está autorizada al momento de escribir este documento. El resto requiere aprobación explícita del usuario antes de arrancar."* — pero la tabla de la línea 7-17 muestra que la autorización avanzó:

- **✅ Autorizadas (`Aprobado: ✅ Sí`):** Fase 0a, 0b, 1, 2.
- **❌ NO autorizadas / bloqueadas esperando aprobación de Lucy (`Aprobado: ❌ No`):** Fase 3, 4, 5, 6, 7.

> Es decir: el frente autorizado llega hasta **Fase 2 (catálogo y carrito, en curso)**. De la Fase 3 en adelante todo está bloqueado. **⚠️ Contradicción con el prompt:** el prompt afirma que checkout/pagos/saga (≈ Fase 4) ya está "CERTIFICADO" y compliance/emails (≈ Fases 4/6/7) "hecho". Los docs leídos NO reflejan esa autorización ni ese avance → el desfase doc-vs-realidad es **material**. `[pendiente verificación: el avance real probablemente está documentado en docs/STATE.md, no en ROADMAP/PLAN; estos dos docs necesitan refresh para alinearse]`.

---

## 4. Menciones de "100% productivo día 1" y qué se exige

El mandato aparece literal en ambos docs:

- **PLAN.md línea 11:** *"No es MVP. El sitio debe nacer 100% productivo, listo para vender desde el día 1."* (también en el título, línea 1: "E-commerce productivo (no MVP)").
- **PLAN.md línea 7:** mandato de **superar** a magneticas.cl en valor agregado, no copiarla.

**Qué se exige para considerarlo "listo" (criterios productivos consolidados):**

- **PLAN.md "Verificación" (líneas 312-318):** (1) Funcional — compra Wompi sandbox + COD + personalización + stock realtime, todos verdes; (2) Performance — **Lighthouse ≥95 mobile y desktop**; (3) Tests — Vitest unitarios + Playwright E2E del flujo de compra; (4) Seguridad — RLS verificada, rate limit verificado, webhooks rechazan firma inválida; (5) Operacional — Vercel Logs + backup verificados, runbook de incidentes documentado.
- **El "día 1" real está definido por la Fase 7** (criterios de aceptación líneas 489-495): compra real con tarjeta real OK · email desde `hola@mail.lucamsshop.co` · envío llega vía Coordinadora/Venndelo · cero errores 500 en 24h continuas · Lighthouse ≥95 en todas las páginas críticas.
- **Hitos de migración Free→Pro condicionan el lanzamiento** (PLAN.md líneas 63-70): primera transacción real dispara Vercel Pro + Supabase Pro; verificación de dominio dispara Resend Pro. Vercel Hobby ToS **prohíbe uso comercial** (ROADMAP.md línea 75: upgrade a Pro = obligación contractual antes del primer pago real).

---

**Resumen ejecutivo del Lector 1:** Plan de 8 fases (0a, 0b, 1–7). Según los docs: 0a/0b/1 completadas, 2 en curso, 3–7 pendientes y NO aprobadas. El frente autorizado documentado llega a Fase 2. **El estado real descrito en el prompt va muy por delante de lo que ROADMAP.md y PLAN.md registran** (no mencionan Bloques A/B/C, "Opción C", ni los avances de checkout/compliance/admin de mayo-junio 2026); ambos docs requieren actualización y PLAN.md aún dice "Next.js 15" donde el mandato vigente es Next.js 16. Lo bloqueado pre-launch que el prompt menciona (Seguridad RBAC/Turnstile/RLS, Observabilidad, Testing, Refund/Cupones, verificar DNS Resend) mapea a tareas dispersas en Fases 1, 4, 5, 6 y 7 de este plan, no a un "bloque" propio en estos dos archivos.