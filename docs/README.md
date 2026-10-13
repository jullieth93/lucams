# Documentación — Lucams Shop

> Mapa de la documentación del proyecto. Todo doc aquí es **canónico y vigente** (documento vivo, política de `CLAUDE.md`): describe el sistema tal como está hoy. Si algo en el código contradice un doc, es un bug de documentación: repórtalo y corrígelo. Auditorías, incidentes y reportes son efímeros: se trabajan en `tmp/` (gitignored) y su conocimiento se consolida aquí al cerrarse; la historia de todo lo demás vive en git.

## Leer primero

| Doc                                 | Qué responde                                                 |
| ----------------------------------- | ------------------------------------------------------------ |
| [`README.md`](../README.md)         | Qué es el proyecto y cómo correrlo                           |
| [`CLAUDE.md`](../CLAUDE.md)         | Mandatos + guía de lectura para agentes                      |
| [`docs/STATE.md`](STATE.md)         | Estado actual: qué existe, qué corre, qué falta (pendientes) |
| [`docs/ROADMAP.md`](ROADMAP.md)     | Visión y alcance + fases (completadas en una línea) + futuro |
| [`docs/DECISIONS.md`](DECISIONS.md) | Decisiones vigentes por dominio (anclas ADR estables)        |

## Referencia del sistema (verificada contra el código)

| Doc                                    | Dominio                                                                                         |
| -------------------------------------- | ----------------------------------------------------------------------------------------------- |
| [`ARCHITECTURE.md`](ARCHITECTURE.md)   | Estructura del monorepo, módulos, schema, saga, jobs, storage, cache                            |
| [`CONVENTIONS.md`](CONVENTIONS.md)     | Patrones de código (naming, RSC, forms, errores RFC 7807, idempotencia, migraciones, retención) |
| [`SECURITY.md`](SECURITY.md)           | Auth, RBAC, RLS, headers, CORS, rate limit, secretos, IRP                                       |
| [`TESTING.md`](TESTING.md)             | Estrategia y comandos de tests (unit/integración/e2e/RLS/carga)                                 |
| [`OBSERVABILITY.md`](OBSERVABILITY.md) | Healthchecks, alertas, centro de notificaciones, SLOs, retención                                |
| [`OPERATIONS.md`](OPERATIONS.md)       | Env vars, entornos (local/stg/prd), despliegue, backups/DR, runbook de incidentes               |
| [`COMPLIANCE.md`](COMPLIANCE.md)       | Ley 1581/1480, retracto, garantías, habeas data, DIAN                                           |

## Integraciones

| Doc                                                      | Dominio                                                                |
| -------------------------------------------------------- | ---------------------------------------------------------------------- |
| [`INTEGRATIONS.md`](INTEGRATIONS.md)                     | Wompi, Resend, Supabase, Gemini, Turnstile, HIBP, WhatsApp, R2, Vercel |
| [`INTEGRATIONS_AVEONLINE.md`](INTEGRATIONS_AVEONLINE.md) | Aveonline a fondo (API, webhook, estados, credenciales)                |
| [`EMAIL_TEMPLATES.md`](EMAIL_TEMPLATES.md)               | Inventario y convenciones de los emails transaccionales                |

## Producto y diseño

| Doc                                        | Dominio                                                                                                                |
| ------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------- |
| [`BRANDING.md`](BRANDING.md)               | Paleta, tipografías, tono, tokens Tailwind v4 + pendientes de branding                                                 |
| [`PLAN_CATALOG_V2.md`](PLAN_CATALOG_V2.md) | Consensos de diseño del catálogo (80 decisiones con numeración estable — citadas desde headers de código; ADR-038/039) |
| [`CATALOG_SEED.md`](CATALOG_SEED.md)       | 📜 Histórico (2026-05): catálogo semilla original                                                                      |
| [`QA_CHECKLIST.md`](QA_CHECKLIST.md)       | Checklist manual pre-release (se recorre con la dueña)                                                                 |

## Módulos con doc propia

- Estudio de personalización: [`apps/web/app/estudio/[slug]/README.md`](../apps/web/app/estudio/%5Bslug%5D/README.md)
- App web (estructura y comandos): [`apps/web/README.md`](../apps/web/README.md)
- Assets de marca: [`apps/web/public/brand/README.md`](../apps/web/public/brand/README.md)
- Contenido legal (datos servidos al cliente, no documentación): `packages/db/legal-content/`
