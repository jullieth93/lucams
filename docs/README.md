# Documentación — Lucams Shop

> Mapa de la documentación del proyecto. Todo doc aquí es **canónico y vigente** — si algo en el
> código contradice un doc, es un bug de documentación: repórtalo y corrígelo (mandato #9 de
> CLAUDE.md). Las auditorías/planes de trabajo ya ejecutados se consolidaron fuera del árbol el
> 2026-09-03 (recuperables vía git history); lo que queda es lo que describe el sistema **tal como
> está hoy**.

## Leer primero

| Doc                                 | Qué responde                                             |
| ----------------------------------- | -------------------------------------------------------- |
| [`README.md`](../README.md)         | Qué es el proyecto y cómo correrlo                       |
| [`CLAUDE.md`](../CLAUDE.md)         | Mandatos + guía de lectura para agentes                  |
| [`docs/STATE.md`](STATE.md)         | Dónde estamos parados + bitácora (resumen actual arriba) |
| [`docs/PLAN.md`](PLAN.md)           | Visión y alcance global (fuente canónica de rumbo)       |
| [`docs/ROADMAP.md`](ROADMAP.md)     | Fases y checklist de lanzamiento                         |
| [`docs/DECISIONS.md`](DECISIONS.md) | ADRs — el "por qué" de cada decisión                     |

## Referencia del sistema (verificada contra el código)

| Doc                                    | Dominio                                                                                         |
| -------------------------------------- | ----------------------------------------------------------------------------------------------- |
| [`ARCHITECTURE.md`](ARCHITECTURE.md)   | Estructura del monorepo, módulos, schema, saga, jobs, storage, cache                            |
| [`CONVENTIONS.md`](CONVENTIONS.md)     | Patrones de código (naming, RSC, forms, errores RFC 7807, idempotencia, migraciones, retención) |
| [`SECURITY.md`](SECURITY.md)           | Auth, RBAC, RLS, headers, CORS, rate limit, secretos, IRP                                       |
| [`TESTING.md`](TESTING.md)             | Estrategia y comandos de tests (unit/integración/e2e/RLS/carga)                                 |
| [`OBSERVABILITY.md`](OBSERVABILITY.md) | Healthchecks, alertas, centro de notificaciones, SLOs, retención                                |
| [`OPERATIONS.md`](OPERATIONS.md)       | Env vars, entornos (local/stg/prd), despliegue, backups/DR, runbook                             |
| [`COMPLIANCE.md`](COMPLIANCE.md)       | Ley 1581/1480, retracto, garantías, habeas data, DIAN                                           |

## Integraciones

| Doc                                                      | Dominio                                                                |
| -------------------------------------------------------- | ---------------------------------------------------------------------- |
| [`INTEGRATIONS.md`](INTEGRATIONS.md)                     | Wompi, Resend, Supabase, Gemini, Turnstile, HIBP, WhatsApp, R2, Vercel |
| [`INTEGRATIONS_AVEONLINE.md`](INTEGRATIONS_AVEONLINE.md) | Aveonline a fondo (API, webhook, estados, credenciales)                |
| [`EMAIL_TEMPLATES.md`](EMAIL_TEMPLATES.md)               | Inventario y convenciones de los emails transaccionales                |

## Producto y diseño

| Doc                                                  | Dominio                                                           |
| ---------------------------------------------------- | ----------------------------------------------------------------- |
| [`BRANDING.md`](BRANDING.md)                         | Paleta, tipografías, tono, tokens Tailwind v4                     |
| [`PLAN_CATALOG_V2.md`](PLAN_CATALOG_V2.md)           | Modelo del catálogo (ADR-038 — citado desde headers de código)    |
| [`CMS_ROADMAP.md`](CMS_ROADMAP.md)                   | Ecosistema CMS v2 (completado 2026-08; el CMS crece vía site map) |
| [`CATALOG_SEED.md`](CATALOG_SEED.md)                 | 📜 Histórico (2026-05): catálogo semilla original                 |
| [`COMPETITIVE_ANALYSIS.md`](COMPETITIVE_ANALYSIS.md) | 📜 Histórico (2026-05): análisis de magneticas.cl                 |
| [`design/`](design/)                                 | Prompts de assets de diseño (plantillas de producto)              |

## Operación y lanzamiento

| Doc                                        | Dominio                                                       |
| ------------------------------------------ | ------------------------------------------------------------- |
| [`RUNBOOK_GO_LIVE.md`](RUNBOOK_GO_LIVE.md) | Salida a producción por fases (env vars, Wompi/Aveonline, DR) |
| [`QA_CHECKLIST.md`](QA_CHECKLIST.md)       | Checklist manual pre-launch (se recorre con la dueña)         |
| [`incidents/`](incidents/)                 | Post-mortems de incidentes reales                             |

## Auditorías

Ver [`audits/README.md`](audits/README.md) — convención: una auditoría se cierra con sección de
remediación y, una vez absorbida por los docs canónicos, se consolida (git conserva la historia).
Vigente: la auditoría OWASP Top 10 (2026-08-24, cerrada 2026-08-30).

## Módulos con doc propia

- Estudio de personalización: [`apps/web/app/estudio/[slug]/README.md`](../apps/web/app/estudio/%5Bslug%5D/README.md)
- App web (estructura y comandos): [`apps/web/README.md`](../apps/web/README.md)
- Assets de marca: [`apps/web/public/brand/README.md`](../apps/web/public/brand/README.md)
- Contenido legal (datos servidos al cliente, no documentación): `packages/db/legal-content/`
