# CLAUDE.md — Contexto y Mandatos Canónicos

> Se carga automáticamente al iniciar cada sesión. Define los mandatos no negociables y el
> enrutamiento de **divulgación progresiva en 3 niveles** para minimizar consumo de tokens sin
> perder detalle técnico.

## Nivel 0 — Lectura mínima al iniciar (siempre)

- [`docs/STATE.md`](docs/STATE.md) — fotografía ejecutiva vigente (≤ 10 KB): qué corre hoy, topología de ambientes y pendientes reales.

## Niveles 1 y 2 — Lectura condicional según la tarea

> El mapa completo vive en [`docs/README.md`](docs/README.md). Carga **solo** los archivos que tu tarea requiere:

| Si tu tarea toca…                                                                                      | Lee primero                                                                                                                                                             |
| ------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Schema Prisma (73 modelos), estructura del monorepo, RBAC, RLS                                         | [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md)                                                                                                                          |
| Catálogo, gemelas `-NOMAG`, precios mayoristas, CMS v2 (3 capas) y APIs `/api/catalog\|cms`            | [`docs/domains/catalog-and-cms.md`](docs/domains/catalog-and-cms.md)                                                                                                    |
| Estudio de personalización (Konva, 7 escenas 3D, auto-save `clientRev`, renders 300 DPI)               | [`docs/domains/studio-and-production.md`](docs/domains/studio-and-production.md) + [`apps/web/app/estudio/[slug]/README.md`](apps/web/app/estudio/%5Bslug%5D/README.md) |
| Carrito, checkout en 3 pasos, saga `Order`, riesgo COD, conciliación y costeo por receta               | [`docs/domains/checkout-payments-shipping.md`](docs/domains/checkout-payments-shipping.md)                                                                              |
| CRM `Contact` 360°, `/admin/hoy`, RFM/LTV, B2B `/empresas-y-eventos`, cotizaciones, puntos y referidos | [`docs/domains/crm-b2b-and-loyalty.md`](docs/domains/crm-b2b-and-loyalty.md)                                                                                            |
| Seguimiento `/pedido/[token]`, posventa invitado, retractos, garantías, soporte PQR y reseñas          | [`docs/domains/post-sale-and-support.md`](docs/domains/post-sale-and-support.md)                                                                                        |
| Mapa de integraciones, timeouts, circuit breakers, retries y health checks                             | [`docs/integrations/README.md`](docs/integrations/README.md)                                                                                                            |
| Vercel (`vercel.json`, `maxDuration`, `proxy.ts`, CSP nonce, caché, Deployment Protection)             | [`docs/integrations/vercel.md`](docs/integrations/vercel.md)                                                                                                            |
| Supabase (DB/Supavisor, Auth OTP+MFA, 5 buckets Storage, RLS, Vault, **18 crons**)                     | [`docs/integrations/supabase.md`](docs/integrations/supabase.md)                                                                                                        |
| Pagos en línea Wompi (Hosted Checkout, firmas SHA-256, ledger por intento, webhook)                    | [`docs/integrations/wompi.md`](docs/integrations/wompi.md)                                                                                                              |
| Logística Aveonline + mensajería interna Bogotá (`LUCAMS`), guías PDF y rastreo híbrido                | [`docs/integrations/aveonline.md`](docs/integrations/aveonline.md)                                                                                                      |
| Resend, 30 plantillas React Email + 2 Auth OTP, webhook Svix y `/admin/email-templates`                | [`docs/integrations/resend-and-emails.md`](docs/integrations/resend-and-emails.md)                                                                                      |
| Cloudflare (DNS, Email Routing, Turnstile en 10 flujos, backups cifrados R2 y DR drill)                | [`docs/integrations/cloudflare.md`](docs/integrations/cloudflare.md)                                                                                                    |
| Google Gemini IA (Estudio + Copiloto soporte 0-PII), GA4, UTM, Merchant XML y GSC                      | [`docs/integrations/google-and-ai.md`](docs/integrations/google-and-ai.md)                                                                                              |
| GitHub Actions (6 workflows, secrets, ruleset), HIBP k-anonymity, WhatsApp `wa.me`, dominio `.co`      | [`docs/integrations/github-and-ops.md`](docs/integrations/github-and-ops.md)                                                                                            |
| Variables de entorno (matriz maestra), ambientes, homologación STG↔PRD y runbooks                      | [`docs/OPERATIONS.md`](docs/OPERATIONS.md)                                                                                                                              |
| Seguridad transversal (sesiones, RBAC/MFA `aal2`, rate limits, PII, respuesta a incidentes)            | [`docs/SECURITY.md`](docs/SECURITY.md)                                                                                                                                  |
| Cumplimiento legal colombiano (Ley 1480/2439, Ley 1581, paquete legal v3, tributario)                  | [`docs/COMPLIANCE.md`](docs/COMPLIANCE.md)                                                                                                                              |
| Convenciones de código, errores RFC 7807, zona horaria `America/Bogota`, migraciones                   | [`docs/CONVENTIONS.md`](docs/CONVENTIONS.md)                                                                                                                            |
| Observabilidad, alertas operativas (12 reglas), SLOs, Web Vitals y embudo first-party                  | [`docs/OBSERVABILITY.md`](docs/OBSERVABILITY.md)                                                                                                                        |
| Suites de pruebas (Vitest, RLS real, Playwright E2E, k6) y guardas de scripts                          | [`docs/TESTING.md`](docs/TESTING.md)                                                                                                                                    |
| Identidad visual, paleta, tipografías locales `.subset.woff2` / `.ttf` y voz de marca                  | [`docs/BRANDING.md`](docs/BRANDING.md)                                                                                                                                  |
| Por qué se tomó una decisión técnica o de producto (anclas `ADR-XXX`)                                  | [`docs/DECISIONS.md`](docs/DECISIONS.md)                                                                                                                                |
| Consensos de diseño del catálogo referenciados en código (`1.1`–`8.10`)                                | [`docs/PLAN_CATALOG_V2.md`](docs/PLAN_CATALOG_V2.md)                                                                                                                    |
| Alcance macro por etapas, costos operativos y checklist manual pre-release                             | [`docs/ROADMAP.md`](docs/ROADMAP.md) · [`docs/QA_CHECKLIST.md`](docs/QA_CHECKLIST.md)                                                                                   |
| Auditorías puntuales o diagnóstico de incidentes                                                       | Efímeros en `tmp/` (gitignored): consolida aprendizajes en el doc vivo y cierra con `make clean-tmp`                                                                    |

### Reglas de contexto

- **No releer** un archivo ya cargado en la sesión.
- **Leer todo de una vez** solo si el usuario lo pide explícitamente, el cambio toca **4+ áreas** o auditas coherencia entre documentos.
- Si una solicitud contradice un mandato o un ADR vigente, señala el conflicto y pide confirmación antes de editar.

## Política permanente de documentación e higiene

1. **Documentos VIVOS, cero arqueología:** todo archivo en `docs/` describe únicamente lo vigente hoy. Al cambiar el sistema se actualiza en el sitio; está prohibido apilar crónicas fechadas o historiales de sprints (eso vive en `git log`).
2. **`docs/DECISIONS.md` conserva las anclas `ADR-XXX`** citadas en código; cuando una decisión cambia se reescribe o marca `SUPERSEDED` en su lugar sin apilar bitácoras.
3. **Densidad por nivel:** `docs/STATE.md` se mantiene compacto (**≤ 10 KB**) sin bitácoras fechadas, mientras que los documentos de Nivel 1 y Nivel 2 mantienen detalle técnico exhaustivo sin arqueología histórica.
4. **Auditorías e incidentes son efímeros en `tmp/` (gitignored):** sus aprendizajes permanentes pasan al doc vivo correspondiente y al cerrar se ejecuta `make clean-tmp`. Los agentes **jamás exploran ni leen `tmp/`** salvo instrucción explícita.
5. **Prohibido versionar basura o temporales:** capturas sueltas, artefactos de QA, dumps, reportes puntuales o scripts `one-shot` ya ejecutados.

## Qué es este proyecto y mandatos no negociables

**Lucams Shop** (`lucamsshop.com`, registrado en `mi.com.co`, WhatsApp `+57 320 887 3826`, ~$20
USD/mes en Vercel Pro) es un e-commerce colombiano 100 % productivo de productos magnéticos
personalizados (fotoimanes, separadores, calendarios, tiras, abecedarios/letras), operando en
producción en modo **`full`** (`NEXT_PUBLIC_STORE_MODE=full`; referencia a superar: `magneticas.cl`).

1. **Calidad productiva total:** no es un MVP.
2. **Stack fijo:** Next.js **16** (App Router, RSC, Server Actions, Turbopack; lee
   [`apps/web/AGENTS.md`](apps/web/AGENTS.md)) + TypeScript strict + **Tailwind v4** + shadcn/ui,
   monorepo `pnpm` (`apps/web` + `packages/db`), Prisma + Supabase, Vercel Pro (`iad1`).
3. **Modo de tienda por bandera (`ADR-077`):** `NEXT_PUBLIC_STORE_MODE` = `catalog` | `full` sobre
   una única base de código (`lib/stage-guard.ts`). PRD y STG operan en `full`.
4. **Pagos y logística:** Wompi (`PaymentProvider`; listo para sumar pasarelas después) y Aveonline
   (`ADR-039`) + mensajería interna Bogotá (`ShippingProvider`).
5. **Comunicaciones y SaaS austeros:** correo por Resend (`mail.lucamsshop.com` + `hola@lucamsshop.com`
   vía Cloudflare Email Routing); WhatsApp solo con enlaces `wa.me` contextuales (**sin Twilio**);
   **sin Sentry** ni SaaS pagos innecesarios.
6. **Jobs, caché y rate limit sin infra extra:** crons vía Supabase `pg_cron` + `pg_net` →
   `/api/cron/*` con secretos en Vault (`ADR-017` `SUPERSEDED`; `pgmq` descartado) más workflows en
   GitHub Actions; rate limit y caché ligera en Postgres (`ADR-016`).
7. **VM dedicada de desarrollo:** sin Docker pesado ni `venvs` de Python salvo necesidad
   justificada; Podman rootless únicamente para el espejo local de Supabase.
8. **Seguridad y privacidad por defecto:** RLS en el 100 % de las tablas (con trigger `049`),
   panel `/admin/*` con RBAC por capacidades + MFA TOTP `aal2`, secretos solo en `.env*`
   (gitignored) y buzón único `security@lucamsshop.com`.
9. **Argumentación y rigor legal:** toda cifra técnica, límite o costo cita fuente oficial con fecha
   (o `[pendiente verificación]`); **ningún texto público promete lo que la tienda no opera hoy**
   (Ley 1480 arts. 23 y 29) y el copy sensible a `STORE_MODE` se gatea en código.
10. **Convenciones base:** UI en español de Colombia (**tuteo** estricto; el voseo rompe CI), código
    y commits en inglés (`feat:`, `fix:`, `docs:`, `chore:`, `refactor:`, `test:`), docs en español,
    slugs `kebab-case`, precios en **centavos COP (`Int`)** y fechas vía `lib/datetime.ts` (`America/Bogota`).

## Resumen rápido de Branding ([`docs/BRANDING.md`](docs/BRANDING.md))

- **Nombre de marca (`ADR-138`):** siempre **«Lucams»** o **«Lucams Shop»** (`SITE_NAME` en
  `apps/web/lib/site.ts`). Nunca usar apóstrofo ni guion bajo en textos visibles o prosa (el guion
  bajo solo existe en handles externos como `@lucams_shop` o identificadores técnicos).
- **Paleta exacta:** `#7C6AAD` purple, `#3D2E5C` purple-dark, `#5DD9D1` turquoise, `#E85B9F` pink,
  `#F58A6F` coral, `#FFD93D` yellow, `#FFF8F0` cream.
- **Identidad y diferenciador #1:** tipografías **Fredoka** (display) + **Inter** (cuerpo), mascota
  mapache kawaii y **Estudio de Personalización** (Konva 2D + 7 escenas 3D en Three.js).

## Reglas operativas en este repositorio

- **No instalar dependencias ni crear archivos de proyecto** sin aprobación explícita.
- **No modificar la paleta** sin ADR previo. **No agregar Sentry ni Twilio** salvo solicitud expresa.
- **Gobierno de decisiones y estado:** decisión arquitectónica nueva → actualizar
  [`docs/DECISIONS.md`](docs/DECISIONS.md) en el sitio (si contradice un mandato, tras confirmación
  actualizar este `CLAUDE.md` primero). Al cerrar cualquier sesión con cambios → actualizar
  [`docs/STATE.md`](docs/STATE.md) en el sitio (sin bitácora).
- **Sincronización obligatoria de contenido público y legal:** cualquier cambio en textos públicos
  (CMS y sus fallbacks, FAQs, `/contacto`, `/rastrear`, `packages/db/legal-content/*.md` ↔
  `FALLBACK` en `app/legal/*/page.tsx`, tiempos de entrega, medios de pago o correos) exige dejar
  actualizados **en la misma sesión** [`docs/STATE.md`](docs/STATE.md) y
  [`docs/COMPLIANCE.md`](docs/COMPLIANCE.md) (más [`docs/OPERATIONS.md`](docs/OPERATIONS.md) si toca
  entorno, semillas, scripts o base de datos).
