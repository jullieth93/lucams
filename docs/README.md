# Documentación Canónica — Lucams Shop

> **Índice maestro único del repositorio.** Toda la documentación listada aquí es **viva, exhaustiva
> y 100 % verificada contra el código real**. Está organizada en **3 niveles de divulgación
> progresiva** para que cualquier persona o agente de IA entienda el sistema al detalle mínimo
> cargando únicamente los archivos que su tarea requiere.

## Reglas de lectura y mantenimiento

1. **Código y documentación siempre alineados:** cada documento describe el sistema tal como opera
   hoy. Si el código contradice un documento, trátalo como un bug documental y corrígelo en el sitio
   en la misma sesión.
2. **Prohibido apilar arqueología:** no agregues bitácoras fechadas, crónicas de sprints ni diarios
   de incidentes dentro de `docs/` (la historia completa de cambios vive en `git log`).
3. **Auditorías y diagnósticos son efímeros:** se trabajan en `tmp/` (gitignored), sus aprendizajes
   permanentes se consolidan en el documento vivo correspondiente y al cerrar se corre
   `make clean-tmp`.

---

## Nivel 0 — Arranque rápido (leer primero en toda sesión)

| Documento                      | Propósito                                                                                |
| ------------------------------ | ---------------------------------------------------------------------------------------- |
| [`../README.md`](../README.md) | Resumen ejecutivo del proyecto, salida en 2 etapas (`ADR-077`), stack, costos y arranque |
| [`../AGENTS.md`](../AGENTS.md) | Reglas esenciales multi-agente (entrada canónica para cualquier herramienta de IA)       |
| [`../CLAUDE.md`](../CLAUDE.md) | Mandatos no negociables, política documental, branding rápido y tabla de enrutamiento    |
| [`STATE.md`](STATE.md)         | Fotografía ejecutiva vigente (≤ 10 KB): qué opera en LOCAL/STG/PRD y pendientes reales   |

---

## Nivel 1 — Arquitectura, operación y gobierno transversal

| Documento                                  | Qué documenta                                                                                                                                         |
| ------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| [`ARCHITECTURE.md`](ARCHITECTURE.md)       | Estructura del monorepo, los **71 modelos y 26 enums** de Prisma, rutas App Router, RBAC (8 roles × 34 capacidades), RLS y caché                      |
| [`OPERATIONS.md`](OPERATIONS.md)           | **Matriz maestra de variables de entorno**, ciclo `feature/* → develop → production`, homologación STG↔PRD, backups/DR y runbooks                     |
| [`SECURITY.md`](SECURITY.md)               | Sesiones Auth/admin, MFA `aal2`, CSP con nonce, CORS, rate limiting en Postgres, clasificación PII, guardarraíles anti-IDOR e IRP                     |
| [`COMPLIANCE.md`](COMPLIANCE.md)           | Estatuto del Consumidor (Ley 1480 y Ley 2439), Ley 1581 (Hábeas Data), paquete legal **Versión 3** (8 documentos + `{{tokens}}`) y régimen tributario |
| [`OBSERVABILITY.md`](OBSERVABILITY.md)     | Health checks, dead-man switch de **14 crons monitoreados**, **12 reglas de alerta**, SLOs, Web Vitals RUM y embudo first-party sin cookies           |
| [`CONVENTIONS.md`](CONVENTIONS.md)         | Patrones obligatorios de código: Next 16, centavos COP, `America/Bogota`, errores RFC 7807, CMS de 3 capas, migraciones duales y guardas de scripts   |
| [`TESTING.md`](TESTING.md)                 | Pirámide de pruebas: Vitest unit/integración, suite RLS real, Playwright E2E, auditoría responsive, carga k6 y gates de CI                            |
| [`BRANDING.md`](BRANDING.md)               | Identidad «Lucams Shop» (`ADR-138`), paleta Tailwind v4 (`@theme`), fuentes locales `.subset.woff2` / `.ttf`, reverso 3D y tono kawaii `es-CO`        |
| [`DECISIONS.md`](DECISIONS.md)             | Registro limpio de decisiones arquitectónicas vigentes con anclas estables `ADR-001`…`ADR-195` (181 ADRs documentados)                                |
| [`PLAN_CATALOG_V2.md`](PLAN_CATALOG_V2.md) | Especificación completa de los 80 consensos de diseño del catálogo (`[1.1]`–`[8.10]`) citados en código y su vigencia actual                          |
| [`ROADMAP.md`](ROADMAP.md)                 | Visión por etapas (`catalog` vs `full`), costos reales de infraestructura y evolución futura                                                          |
| [`QA_CHECKLIST.md`](QA_CHECKLIST.md)       | Recorrido manual pre-release de punta a punta (storefront, Estudio, pagos, posventa invitado, B2B y 8 roles admin)                                    |

---

## Nivel 2A — Dominios de negocio (`docs/domains/`)

Especificaciones funcionales y técnicas completas de cada subsistema de la aplicación:

| Documento                                                                        | Subsistema                                                                                                                                                                                 |
| -------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| [`domains/catalog-and-cms.md`](domains/catalog-and-cms.md)                       | Catálogo jerárquico, variantes y gemelas `-NOMAG`, escalas mayoristas, **CMS v2 de 3 capas** (`166` campos + paridad AST), Live Edit y APIs `/api/catalog\|cms`                            |
| [`domains/studio-and-production.md`](domains/studio-and-production.md)           | Estudio Konva 2D + **7 escenas 3D**, `LetterSet`/`NameEditor`, auto-save `clientRev`, recuperación invitado+cliente, cola `RenderJob` 300 DPI, taller ZIP y retención                      |
| [`domains/checkout-payments-shipping.md`](domains/checkout-payments-shipping.md) | Carrito resiliente, checkout en 3 pasos, direcciones urbanas/rurales DANE/MinTIC, sello HMAC de fletes, saga `Order` (`LCM-YYYY-NNNN`), riesgo/conciliación COD y costeo por receta        |
| [`domains/crm-b2b-and-loyalty.md`](domains/crm-b2b-and-loyalty.md)               | Grafo CRM `Contact` 360° (`isStaff`, `selfDealing`, fusión asistida), bandeja `/admin/hoy`, RFM/LTV, embudo B2B `/empresas-y-eventos` → `Opportunity` → `Quote`, puntos y referidos        |
| [`domains/post-sale-and-support.md`](domains/post-sale-and-support.md)           | Portal `/pedido/[token]`, autenticación posventa de doble factor para invitados, retractos, garantías modulares (`1..120` meses), tickets PQR con SLAs y reseñas verificadas (`DELIVERED`) |

---

## Nivel 2B — Integraciones y consolas externas (`docs/integrations/`)

Contratos de código al detalle mínimo (clientes, payloads, firmas, timeouts, circuit breakers,
webhooks) **más checklists paso a paso de configuración en cada panel externo**:

| Documento                                                                | Proveedor / Plataforma                                                                                                                                                     |
| ------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [`integrations/README.md`](integrations/README.md)                       | Mapa general de integraciones, matriz maestra de resiliencia y sondas de salud                                                                                             |
| [`integrations/vercel.md`](integrations/vercel.md)                       | Hosting serverless (`iad1`), las 9 rutas con `maxDuration`, `next.config.ts`, `proxy.ts`, CSP nonce, caché por tags y Deployment Protection                                |
| [`integrations/supabase.md`](integrations/supabase.md)                   | Proyectos PRD/STG/Local, pooling Supavisor (`:6543`), Auth OTP + MFA `aal2`, **los 5 buckets de Storage**, postura RLS, Vault y **los 18 procesos programados**            |
| [`integrations/wompi.md`](integrations/wompi.md)                         | Hosted Web Checkout, firma SHA-256, ledger `WompiPaymentAttempt`/`Transaction`, webhook con ventana anti-replay de 25 h y conciliación                                     |
| [`integrations/aveonline.md`](integrations/aveonline.md)                 | Cotización `cotizarDoble`, empaque apilado, doble compuerta de facturación en `generarGuia2`, archivo propio de PDFs, webhook + `tracking-sync` y carrier interno `LUCAMS` |
| [`integrations/resend-and-emails.md`](integrations/resend-and-emails.md) | Envío `mail.lucamsshop.com`, Contacts/Segments, baja RFC 8058, webhook Svix, **inventario de las 30 plantillas registradas + 2 Auth + alertas** y `/admin/email-templates` |
| [`integrations/cloudflare.md`](integrations/cloudflare.md)               | Zona DNS, Email Routing (`hola@`, `security@`), Turnstile (**10 puntos de validación**) y backups diarios cifrados en **Cloudflare R2** + DR drill mensual                 |
| [`integrations/google-and-ai.md`](integrations/google-and-ai.md)         | Gemini REST `v1beta` (Estudio + Copiloto de soporte cero-PII), GA4 y `lucams_utm` bajo consentimiento estricto, feed Google Merchant XML y Search Console                  |
| [`integrations/github-and-ops.md`](integrations/github-and-ops.md)       | Los **6 workflows de GitHub Actions**, secretos, ruleset `protect-ramas-criticas`, HIBP k-anonymity, WhatsApp `wa.me` y vigilancia del dominio `.co`                       |

---

## Documentación colocada junto a módulos y fuentes canónicas

| Ruta en el repositorio                                                                     | Propósito                                                                                                        |
| ------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------- |
| [`../apps/web/app/estudio/[slug]/README.md`](../apps/web/app/estudio/%5Bslug%5D/README.md) | Guía exhaustiva de ingeniería local del Estudio (Konva, geometría por plantilla, 7 escenas 3D, `store` y a11y)   |
| [`../apps/web/AGENTS.md`](../apps/web/AGENTS.md)                                           | Reglas específicas de Next.js 16 (APIs asíncronas, `proxy.ts`, caché y directivas de framework)                  |
| [`../apps/web/README.md`](../apps/web/README.md)                                           | Estructura de carpetas, fuentes locales y scripts directos del paquete `apps/web`                                |
| [`../apps/web/public/brand/README.md`](../apps/web/public/brand/README.md)                 | Inventario de activos gráficos de marca, dimensiones recomendadas y convenciones de optimización                 |
| `packages/db/legal-content/*.md`                                                           | Fuentes Markdown canónicas del paquete legal servidas al público (sincronizadas con `FALLBACK` en `app/legal/*`) |

## Verificación automática de paridad y calidad

Cada cambio de código o de documentación debe superar las puertas automáticas antes de entregarse:

- `make check` — valida formato Prettier (incluyendo todos los `.md`), `typecheck`, `lint`, guardas
  de scripts, ausencia total de voseo y paridad AST `166/166` del mapa CMS (`make audit-content`).
- `make verify-db` — certifica `0` deriva entre migraciones Prisma y SQL de Supabase más los `5/5`
  invariantes de postura RLS y privilegios (`verify-supabase-posture.mjs`).
- `pnpm test` — ejecuta la suite unitaria y de integración con cobertura gateada en `apps/web`.
- `scripts/diag-stg/homologacion.sh` — audita en solo lectura la paridad estructural entre STG y PRD
  (esquema, semillas, variantes `-NOMAG`, CMS, crons y variables de entorno).
