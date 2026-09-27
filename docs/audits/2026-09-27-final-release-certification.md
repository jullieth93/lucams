# FINAL RELEASE CERTIFICATION — Lucams Shop

> Formato §21 de `LUCAMS_RELEASE_CERTIFICATION_PROMPT.md`. Discovery, remediación, evidencia y
> anexos: `docs/audits/2026-09-26-release-certification.md` + `tmp/audit-20260926-cert/`.

# Release Candidate

```text
Branch: develop
SHA: 431df5a (contenido de producto idéntico a 7f07c43; encima solo docs + allowlist drift)
Date: 2026-09-27
Audited environments: LOCAL (stack Supabase local, ejecución completa), CI GitHub Actions
  (PR + develop push + nightly despachados), STG (migración aplicada + drift check),
  PRD (read-only: health endpoints, branch protection, secrets inventory)
RECERTIFICATION_TARGET_SHA=0ba0fa6 → 7f07c43 → 431df5a (mismo árbol de producto)
```

# Scope

Certificación integral del producto: Cliente ↔ Admin ↔ dominio ↔ DB/Supabase ↔ Storage ↔
integraciones (Wompi, Aveonline, Resend, Gemini, Turnstile, HIBP, R2) ↔ infraestructura ↔ CI/CD.
15 roles de auditoría + 8 agentes de remediación + adversario y juez de evidencia independientes.

# Product inventory summary

113 páginas (48 cliente + 65 admin) · 65 server actions · 42 API routes (3 webhooks, 13 cron,
8 health) · 57 modelos Prisma / 20 enums · 98+1 migraciones · 5 buckets · 26 plantillas de email ·
11 jobs pg_cron · 5+1 workflows CI · 270 archivos vitest (4275 tests) · 68 specs Playwright.

# Critical journeys

| Journey | Status | Evidence |
|---|---|---|
| CBJ-01…40 (40 journeys) | 29 PROVEN · 11 PARTIALLY_PROVEN · 0 UNPROVEN · 0 BROKEN | `03-critical-business-journeys.md`; degrada-ciones A12 aplicadas y restauradas tras remediación |
| Dinero E2E (CBJ-10/11) | **PROVEN (E2E-CI)** desde 2026-09-27 | nightly run 36328807610: checkout Wompi sandbox 4242 → PAID → guía Aveonline real, artifacts 30d |
| Webhook perdido (CBJ-15) | PARTIALLY_PROVEN (mitigado) | fallback /gracias + cron heal + cancelaciones `no_txid` ahora visibles en resumen diario (F-03) |
| Restore (CBJ-34) | PARTIALLY_PROVEN | DR drill mensual real (tablas públicas); auth.users/storage/config fuera del drill (A9-11) |
| Release/rollback (CBJ-40) | PARTIALLY_PROVEN | CI/nightly gates verificados; rollback documentado sin drill (A9-09) |

# Cross-layer integrity

| Domain | Admin→Customer | Customer→Admin | Status |
|---|---|---|---|
| Catálogo (producto/precio/stock/categoría) | ✅ predicado de visibilidad único (F-04 cerrado) | ✅ | PROVEN |
| Promociones/cupones | ✅ | ✅ revalidación atómica en tx | PROVEN |
| CMS → storefront | ✅ updateTag("cms") | n/a | PROVEN |
| Plantillas → Estudio | ✅ | ✅ diseños cliente → admin | PROVEN |
| Órdenes/pagos/envíos | ✅ admin lee saga real | ✅ saga + resumen diario + needsReconciliation (F-02/F-03/A11R-01 cerrados) | PROVEN |
| Moderación de diseños | ✅ revoca share token (A4-01 cerrado) | ✅ | PROVEN |
| Wiring total | 50 aristas | 41 PROVEN · 4 PARTIAL · 1 UNPROVEN (WholesaleTier, write-only documentado) · 0 BROKEN | — |

# Code health

```text
Dead code: eliminado (flattenSlotToV1, 5 AppError, getRelatedProducts) + 11 one-shots archivados
Duplicate logic: predicado de visibilidad unificado (era ×3); cron-auth consolidado (era ×15);
  resto: sin duplicación en state machines/cupones/stock/RBAC/moneda/CMS/emails
Legacy paths: deliberados y documentados (redirects admin, mapa 301, canvas V1, plugin aveonline)
Unused dependencies: next-themes vestigial (P4); 0 muertas
Orphan routes/actions: 0 server actions huérfanas; 12 rutas REST del bot sin consumidor en repo
  (ADR-038, decisión documentada pendiente — A6-04)
```

# Data integrity

60+1 migraciones Prisma aplicadas (LOCAL y STG), 0 drift inesperado (drift check nuevo en CI;
tolerancias documentadas: rate_limit_buckets, uptime_monitor_* STG). RLS on 59/60 tablas + event
trigger; grants anon/authenticated = 0; 39 CHECKs de dinero/stock; índices físicos de idempotencia
(InventoryLog, cartId, WebhookEvent, CouponUsage). A5-01 (AdminRecoveryCode doble fuente) CERRADO:
migración Prisma aditiva `20260926120000` aplicada y verificada en LOCAL y STG; pendiente llegar a
PRD con el deploy (camino verificado, tabla ya existe vía SQL 008, migración IF NOT EXISTS).

# Security

0 hallazgos P0/P1/P2 (A7 adversarial + A12). RBAC deny-by-default 41/41 actions admin con guard;
MFA aal2 + step-up verificado; 3/3 webhooks con firma timing-safe; 13/13 crons fail-closed;
auth cliente probada contra GoTrue real (rate limit real, anti-enumeración, OTP vía Mailpit).
Excepciones: todas justificadas y documentadas. Menores P3/P4 registrados (A7-01…A7-06).

# Integrations

- **Wompi:** PROVEN E2E en CI (sandbox 4242 → PAID → webhook → saga → guía). Anomalías multi-tx
  ahora detectadas (reconciliación). Amount siempre server-side.
- **Aveonline:** PROVEN (cotización real SERVIENTREGA en CI; guía con claim atómico). Sin polling
  backup de tracking (A8-03, P3 aceptado-pendiente).
- **Resend:** PROVEN (26 plantillas, retry/breaker/idempotencyKey, webhook Svix). Evento perdido
  tras fallo de proceso: P4 (A8-06).
- **COD:** PROVEN (fail-closed, anti-abuso, conciliación manual con step-up MFA).

# Operations

Backups diarios reales + heartbeat (verificado en vivo) · DR drill mensual con restores reales ·
health endpoints vivos en PRD · post-deploy-smoke NUEVO (workflow + script con aserciones de
contenido estructural, verificado 5/5 contra PRD) · CRON_SECRET en 3 lugares con dead-man switch
(`/api/health/crons`) · rollback documentado, sin drill (riesgo abierto).

# CI/CD

| Gate | Estado |
|---|---|
| PR: typecheck/lint/build, vitest+coverage, E2E+a11y, Lighthouse, gitleaks, prettier, pnpm audit | ✅ verdes sobre `431df5a` (run 36329770404 y ss.) |
| PR: RLS behavior (NUEVO) | ✅ corre y verde; **pendiente agregarlo a required checks de production (acción owner — verificado 2026-09-27 que aún no está)** |
| PR: drift check Prisma↔Supabase + tests packages/db (NUEVOS) | ✅ en job quality |
| Nightly: E2E admin/MFA/Estudio/audit-cliente/homolog-auth/retracto, RLS matrix, cross-browser | ✅ 4/4 verde (run 36328807610) |
| Nightly: E2E dinero Wompi sandbox (NUEVO) | ✅ verde con secrets cargados; artifacts 30d |
| Post-deploy smoke (NUEVO) | ✅ workflow listo; primera corrida real pendiente del próximo deploy |

# Environment parity

LOCAL/STG/PRD espejo desde la homologación 2026-09-20 (histórica). Verificaciones frescas de esta
certificación: drift check verde en LOCAL y STG (2026-09-27); migración `20260926120000` aplicada
en STG limpio. Drift intencional documentado: crons de email OFF en STG, monitor uptime STG-only,
gemelas -NOMAG (ADR-099), password_min_length auth (no config-as-code, P4).

# Open risks

1. **F-07 (P2, decisión owner):** push directo a `production` despliega sin esperar gates
   (convención actual = push ff). Requiere decisión explícita: restringir o aceptar.
2. **A9-09 (P3):** rollback de despliegue nunca ensayado (drill o aceptación explícita).
3. **Required check pendiente:** `RLS behavior` corre en PRs pero aún no bloquea merges a
   `production` hasta agregarlo en Settings → Branches.
4. **Deploy pendiente:** aplicar migración en PRD + primera corrida del post-deploy-smoke.

# Accepted risks

Heredados de la firma 2026-09-20 (§T): bus factor 1, Supabase Free sin PITR, autoreferido DIAN.
Nuevos menores (P3/P4 con seguimiento en `12-findings.md`): A8-03 (sin polling Aveonline),
A11-03 (doble email en carrera extrema), A11R-02 (sin vía admin para limpiar needsReconciliation),
A6-04 (rutas REST del bot), A9-05 (R2 Bucket Lock), A10-02 (57 specs fuera de workflows).

# Evidence index

Índice completo: `tmp/audit-20260926-cert/13-evidence-index.md` (+ `recert/`, runs CI/nightly
citados por ID, `17-adversary-remediation.md`, `18-evidence-review-remediation.md`). Gates
locales: 4275/4275 tests, typecheck/lint/build/format ✅, RLS 58/58, drift 0, E2E local ✅.

# Release gate

```text
P0 = 0 · P1 = 0 · BROKEN critical journeys = 0 · UNPROVEN critical journeys = 0
Aristas críticas Admin↔Cliente UNPROVEN/BROKEN = 0 · Controles críticos de seguridad = todos PROVEN
Migration path producción = PROVEN en LOCAL+STG · Env contract = resuelto
```

## Veredicto: **NOT_CERTIFIED** (formalismo de la misión, §20)

Dos bloqueos de gate siguen abiertos y ambos son **decisión/acción de la owner, no código**:

1. `rollback/forward recovery for release UNPROVEN` (A9-09): se requiere un drill de rollback
   (`vercel rollback` ensayado) o aceptación de riesgo explícita firmada.
2. F-07 (push directo a production sin gates): aceptación de riesgo explícita o restricción.

Además, como follow-up operativo no bloqueante pero recomendado antes del release: agregar el
required check `RLS behavior` en branch protection de `production` y verificar la migración
`20260926120000` en PRD durante el deploy.

**En cuanto la owner registre esas dos decisiones (aceptación o remediación), este SHA pasa a
CERTIFIED sin más evidencia de código.** Todo lo demás está probado y verde.
