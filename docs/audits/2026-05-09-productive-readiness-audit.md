# Auditoría de productive readiness — Lucams_shop

**Fecha:** 2026-05-09
**Tipo:** Completeness audit (no coherencia — eso fue la primera auditoría)
**Alcance:** Backend, Frontend, Base de datos, Middleware, Seguridad, Compliance, Observabilidad, DevOps, Testing
**Origen:** segunda iteración pedida por el usuario tras observar que la primera auditoría de coherencia, aunque útil, no cubría las exigencias mínimas de un sitio productivo. Cita textual: *"si estamos hablando de un producto productivo, no debería estar? es más creo que me quedé corto"*.

## Context

La primera auditoría (2026-05-09 mañana) cerró 21 hallazgos de coherencia y dejó la documentación consistente, pero seguía siendo "documentación que describe el plan", no "documentación que aterriza un proyecto productivo completo". Esta segunda auditoría suma:

- **Patrones cross-cutting de código** que evitan que cada feature reinvente convenciones (errores, logging, idempotencia, sagas, etc.).
- **Compliance colombiano operativizado** (DIAN, Ley 1480 retracto + garantías, Habeas Data con tabla `Consent`).
- **Observabilidad explícita** (SLOs cuantitativos, dashboards, alertas accionables, postmortem process).
- **DevOps maduro** (branching, releases, environments, feature flags, DR drills cuatrimestrales).
- **Testing estratégico** (pirámide, RLS automatizado, visual regression, load testing).
- **Seguridad profunda** (STRIDE por flujo, IRP por tipo de incidente, clasificación de datos formal, cookie consent banner).

## Hallazgos por severidad

> **Bloqueante:** sin este, el sitio no puede operar legalmente o de forma sostenible.
> **Importante:** se debería tener antes del lanzamiento, pero no estrictamente bloqueante.
> **Nice-to-have:** mejora la operación pero diferible.

### 🔴 Bloqueantes para Fase 7 (lanzamiento productivo)

| ID | Hallazgo | Cubierto en | Tarea ROADMAP |
|---|---|---|---|
| PR-001 | **Facturación electrónica DIAN obligatoria** (Resolución 165/2023). Sin proveedor integrado no se puede facturar legalmente. Sanción: 1% ingresos hasta 950 UVT o cierre 3 días. | [`COMPLIANCE.md` § DIAN](../COMPLIANCE.md#facturación-electrónica-dian-resolución-165-de-2023) + [`INTEGRATIONS.md` § 7](../INTEGRATIONS.md) | Fase 7 — DIAN provider |
| PR-002 | **Derecho de retracto Ley 1480 art. 47** no modelado. 5 días hábiles desde entrega; reembolso en 15 días calendario. **Excepción crítica:** productos personalizados quedan exentos — necesitamos `retractEligible` por item. | [`COMPLIANCE.md` § Ley 1480](../COMPLIANCE.md#ley-1480-de-2011--estatuto-del-consumidor) | Fase 4 — schema `RetractRequest` |
| PR-003 | **Política de garantía** (Ley 1480 art. 7-15) no definida. Mínimo 1 año garantía legal. | [`COMPLIANCE.md` § Garantía](../COMPLIANCE.md#garantía-legal-art-7-15) | Fase 6 — schema `WarrantyClaim` |
| PR-004 | **Habeas Data operativo:** tabla `Consent` versionada, endpoints `/api/me/data-export` y `DELETE /api/me/account`, flujo de hard-delete a 30 días, formulario PQR `/legal/habeas-data`. | [`COMPLIANCE.md` § Ley 1581](../COMPLIANCE.md#ley-1581-de-2012--protección-de-datos-personales-habeas-data) | Fase 1 |
| PR-005 | **Documentos legales** (Privacidad, T&C, Cookies, Devoluciones, Garantías, Subprocesadores, Seguridad) sin redactar y sin revisión legal. ADR-020 abierto. | [`COMPLIANCE.md` § Documentos](../COMPLIANCE.md#documentos-legales-requeridos-en-el-sitio) | Fase 7 |
| PR-006 | **Saga pattern** para `Wompi APPROVED → reservar stock → crear envío Venndelo → enviar email`. Sin esto, una falla a mitad deja la base inconsistente. | [`CONVENTIONS.md` § Saga](../CONVENTIONS.md#backend--saga-pattern-para-flujos-distribuidos) | Fase 4 |
| PR-007 | **Cookie consent banner** con tabla `Consent` + carga condicional de scripts. Aunque Ley 1581 no lo exige tan estricto como GDPR, lo hacemos para alineación internacional. | [`SECURITY.md` § Cookie banner](../SECURITY.md#cookie-consent-banner--implementación) + [`COMPLIANCE.md`](../COMPLIANCE.md#cookie-consent-alineación-gdpr-voluntaria) | Fase 4 / 7 |
| PR-008 | **Plan de respuesta a incidentes (IRP)** con runbooks por escenario y reporte a SIC dentro de 15 días hábiles ante brecha de PII. | [`SECURITY.md` § IRP](../SECURITY.md#plan-de-respuesta-a-incidentes-irp) | Fase 7 |
| PR-009 | **Constitución del negocio** (RUES + Cámara de Comercio + RUT con responsabilidad 42). Trámite externo. | [`COMPLIANCE.md` § Calendario](../COMPLIANCE.md#calendario-de-cumplimiento) | Fase 7 (trámite del usuario) |

### 🟠 Importantes (debieran estar antes del lanzamiento)

| ID | Hallazgo | Cubierto en | Fase |
|---|---|---|---|
| PR-010 | **Capa de servicio** (`service.ts` + `repository.ts` + `server-actions.ts`) que separe lógica de dominio de HTTP/Prisma. Sin esto, el código se entrelaza y no es testeable sin DB. | [`CONVENTIONS.md` § Capa de servicio](../CONVENTIONS.md#backend--capa-de-servicio) | 1 |
| PR-011 | **Formato estándar de errores RFC 7807** (`application/problem+json`). Sin esto, cada feature inventa su propio formato. | [`CONVENTIONS.md` § Errores](../CONVENTIONS.md#backend--formato-estándar-de-errores-rfc-7807) | 1 |
| PR-012 | **Idempotency keys** para mutaciones críticas (doble-click en Pagar no crea dos órdenes). Tabla `IdempotencyKeys` + helper. | [`CONVENTIONS.md` § Idempotency](../CONVENTIONS.md#backend--idempotency-keys) | 1 / 4 |
| PR-013 | **Audit fields** (`createdBy/updatedBy/deletedAt/deletedBy`) en entidades del dominio. Sin esto, no hay forensics. | [`CONVENTIONS.md` § Audit fields](../CONVENTIONS.md#db--soft-delete--audit-fields) | 1 |
| PR-014 | **Migration strategy expand-then-contract.** Sin esto, una migración rompe en producción. | [`CONVENTIONS.md` § Migration](../CONVENTIONS.md#db--migration-strategy-expand-then-contract) | 1 |
| PR-015 | **Indexing strategy explícita** más allá de UNIQUE. Performance de queries críticos depende de esto. | [`CONVENTIONS.md` § Indexing](../CONVENTIONS.md#db--indexing-strategy) | 1 |
| PR-016 | **Foreign key cascade explícito** por relación. RESTRICT vs SET NULL vs CASCADE no se infiere. | [`CONVENTIONS.md` § FK](../CONVENTIONS.md#db--foreign-keys-cascade-explícito) | 1 |
| PR-017 | **Resiliencia: timeouts + retries + circuit breakers** en cada llamada externa (Wompi, Venndelo, Anthropic, Resend, DIAN). Sin esto, una caída de tercero tumba todo. | [`CONVENTIONS.md` § Resiliencia](../CONVENTIONS.md#resiliencia--timeouts-retries-circuit-breakers) + [`INTEGRATIONS.md` § 8](../INTEGRATIONS.md) | 1 / 4 |
| PR-018 | **Request ID correlation** (HTTP → DB → jobs → emails) para debug y forensics. | [`CONVENTIONS.md` § Logging](../CONVENTIONS.md#logging-y-request-id-correlation) | 1 |
| PR-019 | **Logging estructurado con redact PII** (pino + redact por path). Sin esto, los logs filtran datos personales. | Idem | 1 |
| PR-020 | **SLOs cuantitativos** (no solo "Lighthouse 95"). Sin SLO no hay forma objetiva de saber si estamos bien. | [`OBSERVABILITY.md` § SLOs](../OBSERVABILITY.md#slos-service-level-objectives) | 1 (definición) / 7 (operativo) |
| PR-021 | **Alertas accionables** (no "algo está mal"). Sin esto, el ruido oculta lo importante. | [`OBSERVABILITY.md` § Alertas](../OBSERVABILITY.md#alertas) | 1 |
| PR-022 | **Process de postmortem blameless** documentado. Sin esto, los incidentes no generan aprendizaje. | [`OBSERVABILITY.md` § Postmortem](../OBSERVABILITY.md#process-de-postmortem) | 7 |
| PR-023 | **Threat model formal por flujo** (STRIDE aplicado a registro/login, checkout, estudio, jobs). | [`SECURITY.md` § STRIDE](../SECURITY.md#threat-model-formal-stride) | 7 |
| PR-024 | **Clasificación de datos** (Público / Interno / PII directa / Sensible / Crítica / Regulada) con tabla maestra de campos. | [`SECURITY.md` § Clasificación](../SECURITY.md#clasificación-de-datos) | 1 (al diseñar schema) |
| PR-025 | **Lista de subprocesadores** publicada en `/legal/subprocesadores` (Habeas Data). | [`COMPLIANCE.md` § Subprocesadores](../COMPLIANCE.md#subprocessor-list-y-transferencias-internacionales) | 7 |
| PR-026 | **Tests RLS automatizados** con cliente impostor en CI. Sin esto, RLS solo es papel. | [`TESTING.md` § Tests RLS](../TESTING.md#tests-de-rls) | 1 |
| PR-027 | **Pirámide de testing** definida (60% unit / 30% integración / 10% E2E). Sin esto, el equipo deriva al testing solo manual. | [`TESTING.md` § Pirámide](../TESTING.md#pirámide-de-pruebas) | 1 |
| PR-028 | **Visual regression** con screenshots Playwright en páginas críticas. Sin esto, regresiones de UI pasan desapercibidas. | [`TESTING.md` § Visual](../TESTING.md#visual-regression) | 2 |
| PR-029 | **Branching strategy + release strategy** documentados (trunk-based, squash merge, semver, CD). | [`OPERATIONS.md` § DevOps](../OPERATIONS.md#devops--branching-releases-environments-feature-flags) | 1 |
| PR-030 | **DR drills cuatrimestrales** programados. Sin drills, el plan de DR no existe. | [`OPERATIONS.md` § DR](../OPERATIONS.md#disaster-recovery-dr) | 7 (primer drill) |

### 🟢 Nice-to-have / mejoras de robustez

| ID | Hallazgo | Cubierto en | Fase |
|---|---|---|---|
| PR-031 | **`/api/metrics`** endpoint Prometheus-format protegido con bearer. Habilita scrapers futuros. | [`OBSERVABILITY.md` § Métricas](../OBSERVABILITY.md#métricas-custom) | 1 / 7 |
| PR-032 | **EXIF stripping** server-side antes de mover a `production-assets`. | [`SECURITY.md` § File upload](../SECURITY.md#file-upload-y-storage) | 3 |
| PR-033 | **Honeypots** en formularios públicos como anti-bot adicional al rate limit. | [`SECURITY.md` § Otros vectores](../SECURITY.md#otros-vectores-cubiertos) | 3 |
| PR-034 | **`safeRedirectTarget`** helper para prevenir open redirects. | Idem | 1 |
| PR-035 | **Modo mantenimiento** activable vía env var. | Idem | 1 |
| PR-036 | **Feature flags** integrados (proveedor a elegir, ADR-026). | [`OPERATIONS.md` § Feature flags](../OPERATIONS.md#feature-flags) | 5 |
| PR-037 | **MFA obligatorio para admin.** | [`SECURITY.md` § Auth](../SECURITY.md#autenticación-supabase-auth) | 6 |
| PR-038 | **Email lifecycle marketing** (welcome series, recompra, cumpleaños). | ROADMAP Fase 5 | 5 |
| PR-039 | **Visual regression baseline** sobre todas las páginas críticas. | [`TESTING.md`](../TESTING.md#visual-regression) | 2 |
| PR-040 | **Load testing con k6** sobre endpoints críticos. | [`TESTING.md` § Performance](../TESTING.md#performance--load-testing) | 7 |
| PR-041 | **Error boundaries por nivel** (global, route, componente). | [`CONVENTIONS.md` § Estados UI](../CONVENTIONS.md#frontend--estados-de-ui-loading-error-empty) | 2 |
| PR-042 | **Pagination cursor-based** preferida sobre offset. | Implícito en CONVENTIONS § APIs | 2 |
| PR-043 | **Mass assignment prevention** — schemas Zod sin `.passthrough()`. | [`SECURITY.md` § Otros](../SECURITY.md#otros-vectores-cubiertos) | 1 |

### Total: 43 hallazgos (9 bloqueantes + 21 importantes + 13 nice-to-have)

## Documentos creados en esta sesión

| Archivo | Líneas | Propósito |
|---|---|---|
| [`docs/CONVENTIONS.md`](../CONVENTIONS.md) | ~830 | Patrones FE+BE+DB, error format RFC 7807, saga, idempotency, audit fields, migration strategy, resiliencia |
| [`docs/OBSERVABILITY.md`](../OBSERVABILITY.md) | ~340 | SLOs/SLIs, dashboards, alertas, postmortem |
| [`docs/COMPLIANCE.md`](../COMPLIANCE.md) | ~370 | Ley 1581, Ley 1480 (retracto + garantías), DIAN facturación, IVA, retenciones, subprocesadores |
| [`docs/TESTING.md`](../TESTING.md) | ~480 | Pirámide, RLS, E2E, visual regression, load testing, smoke tests |

## Documentos expandidos

| Archivo | Cambios |
|---|---|
| [`docs/SECURITY.md`](../SECURITY.md) | +STRIDE por flujo + IRP runbooks (4 escenarios) + clasificación de datos + cookie consent banner implementación |
| [`docs/ARCHITECTURE.md`](../ARCHITECTURE.md) | +Patrones cross-cutting (referencia a CONVENTIONS) + nota de audit fields en schema |
| [`docs/INTEGRATIONS.md`](../INTEGRATIONS.md) | +Sección 7 DIAN provider con `InvoiceProvider` interface + Sección 8 Resiliencia compartida con tabla por integración |
| [`docs/OPERATIONS.md`](../OPERATIONS.md) | +DevOps (branching, releases, environments, feature flags) + DR drills cuatrimestrales |
| [`docs/ROADMAP.md`](../ROADMAP.md) | Tareas distribuidas por fase: 1, 2, 3, 4, 5, 6, 7 con subsecciones "productive readiness audit" |

## Verificaciones contra fuentes oficiales (mandato #9)

| Afirmación | Fuente verificada | Fecha |
|---|---|---|
| DIAN: facturación electrónica obligatoria, Resolución 165/2023, sanciones hasta 1% ingresos / 950 UVT | [DIAN — Obligados a Facturar](https://www.dian.gov.co/impuestos/sociedades/Paginas/obligadosfacturar.aspx) + [Resolución 000202 de 2025](https://www.dian.gov.co/normatividad/Normatividad/Resoluci%C3%B3n%20000202%20de%2031-03-2025.pdf) | 2026-05-09 |
| Ley 1480 art. 47: 5 días hábiles retracto, 15 días calendario reembolso, exclusión por personalización | [Función Pública](https://www.funcionpublica.gov.co/eva/gestornormativo/norma.php?i=44306) + [leyes.co](https://leyes.co/el_estatuto_del_consumidor/47.htm) | 2026-05-09 |
| RFC 7807 Problem Details: schema, fields, content-type | [datatracker.ietf.org/doc/html/rfc7807](https://datatracker.ietf.org/doc/html/rfc7807) | 2026-05-09 |
| STRIDE: 6 categorías con definiciones textuales | [Microsoft Learn — Threat Modeling Tool: Threats](https://learn.microsoft.com/en-us/azure/security/develop/threat-modeling-tool-threats) | 2026-05-09 |

## Verificaciones pendientes (cola en STATE.md)

Antes de Fase 7:

- [ ] Costos y APIs reales de Alegra/Siigo/Facture (DIAN provider) — ADR-025
- [ ] Feature flag provider final — ADR-026 (sugerencia: GrowthBook cloud Free)
- [ ] Configurabilidad de TTLs de tokens en Supabase Free — `supabase.com/docs/guides/auth/sessions`
- [ ] Disponibilidad real de `pgmq` y `pg_cron` en Supabase Free — confirmar
- [ ] Consultoría legal sobre RNBD (Registro Nacional de Bases de Datos) ante SIC — ADR-020 amplía a esto

## Decisiones que deben documentarse próximamente (ADRs futuros)

- ADR-020: ¿plantilla legal por nosotros o por abogado? (ya estaba abierto)
- ADR-021: tipografías finales (ya estaba abierto)
- ADR-022: alternativa de monitoreo de errores (ya estaba abierto)
- ADR-023: criterio de migración Postgres → Redis externo (ya estaba abierto)
- **ADR-025: proveedor de facturación electrónica DIAN** (NUEVO — abrir antes de Fase 7)
- **ADR-026: proveedor de feature flags** (NUEVO — abrir antes de Fase 5)
- **ADR-027: necesidad de staging environment** (NUEVO — re-evaluar post-lanzamiento)

## Cambio en framing del proyecto

> Reflexión meta tras la auditoría: en la primera sesión llamé a este trabajo "grande y ambicioso". El usuario corrigió la framing: para un sitio que procesará pagos reales y manejará PII en Colombia, **esto es el piso, no el techo**.

La documentación actual cumple "productive readiness baseline":
- Patrones de código consistentes y testeables.
- Compliance colombiano operativizado.
- Observabilidad cuantitativa.
- DevOps maduro con DR.
- Testing estratégico.
- Seguridad por capas con threat model.

Sigue habiendo deuda — pero ahora está **identificada, clasificada, distribuida en el ROADMAP y verificable**. Eso es la diferencia entre "vamos a ver" y "sabemos qué falta y cuándo".
