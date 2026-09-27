# Auditoría de Certificación de Release (Discovery) — 2026-09-26

> **Alcance:** certificación integral pre-producción según `LUCAMS_RELEASE_CERTIFICATION_PROMPT.md`:
> Cliente ↔ Admin ↔ dominio ↔ DB/Supabase ↔ Storage ↔ integraciones ↔ infraestructura ↔ CI/CD.
> Fase ejecutada: **DISCOVERY completo hasta Checkpoint 6 (Discovery Verdict)**. Sin remediación,
> sin cambios de código productivo, PRD estrictamente read-only.
>
> **Target congelado:**
> ```text
> CERTIFICATION_TARGET_BRANCH=develop
> CERTIFICATION_TARGET_SHA=742dcf8a69e17e0ccfc84301fee56afdf142b82e
> CERTIFICATION_STARTED_AT=2026-09-26T14:53:47-05:00
> WORKTREE_CLEAN=yes (único untracked: el propio archivo de misión)
> ```
>
> **Método:** 15 roles (A0 commander + A1–A12 + runtime + CBJ) ejecutados como subagentes con
> scopes no solapados, regla de evidencia estricta (PROVEN exige evidencia reproducible
> STATIC/UNIT/INTEGRATION/E2E/DATA/RUNTIME/CONFIG/SECURITY), fase adversarial (A11) y juicio de
> evidencia independiente (A12) con degradaciones.
>
> **Anexos completos** (reportes por agente, matrices, logs con comandos y exit codes):
> `tmp/audit-20260926-cert/` — índice en `13-evidence-index.md`. Nota: `tmp/` no se versiona;
> si esta auditoría debe conservarse más allá del working tree, promover los anexos a una
> ubicación versionada o consolidar su contenido aquí al cierre.

---

## 1. Resumen ejecutivo

Producto maduro y correctamente cableado en lo esencial — 41/50 aristas de wiring PROVEN, 28/40
critical business journeys PROVEN, **0 hallazgos P0**, postura de seguridad fuerte verificada
adversarialmente, y el dinero protegido por capas redundantes testeadas con DB real (saga atómica,
idempotencia cartId, dedup webhook P2002, monto siempre server-side, claim anti doble-guía).

**Veredicto: NO certificado todavía.** Bloquean: 1 P1 (el journey de dinero E2E navegador nunca
corre en CI), 1 arista de wiring BROKEN P2 (categoría inactiva → cards fantasma 404), y dos
defectos P2 del dominio de dinero multi-transacción (doble pago silencioso y cancelación
silenciosa de orden potencialmente pagada). Todo con causa raíz identificada y fix acotado.

## 2. Inventario (A1)

113 páginas (48 cliente + 65 admin) · 65 server actions · 42 API routes (3 webhooks, 13 cron,
8 health) · 57 modelos Prisma / 20 enums · 98 migraciones (60 Prisma + 38 Supabase) · 5 buckets ·
26 plantillas de email + overrides · 11 jobs pg_cron · 263 archivos vitest + 68 specs Playwright ·
5 workflows CI. Detalle: `tmp/audit-20260926-cert/01-inventory.md`.

## 3. Matriz global de cableado (A4)

50 aristas Admin↔DB↔Cliente: **PROVEN 41 · PARTIALLY_PROVEN 4 · UNPROVEN 1 · BROKEN 1**.
El dinero nunca depende de los stacks de lectura: el carrito snapshotea precio, la orden cobra el
snapshot, el cupón se revalida atómicamente, Wompi cobra `order.total`. Matriz completa (columnas
writer/action/validation/domain/DB/side-effects/cache/readers/security/tests/status/gap):
`tmp/audit-20260926-cert/02-wiring-matrix.md`.

## 4. Critical business journeys

40 journeys evaluados: **PROVEN 28 · PARTIALLY_PROVEN 12 · UNPROVEN 0 · BROKEN 0** (tras
degradaciones del juez de evidencia: CBJ-27 por A4-02; CBJ-03/04 y CBJ-10 por evidencia dinámica
solo manual; COD E2E manual). Tabla y detalle journey por journey:
`tmp/audit-20260926-cert/03-critical-business-journeys.md`. Máquinas de estado (15) en
`04-domain-state-machines.md`: Order sana (todos los escritores pasan por `transitionOrder`);
divergencias menores en WarrantyClaim (garantías vs reclamos), Quote y SupportTicket (sin matriz).

## 5. Hallazgos por severidad

Registro completo con Expected/Actual/Evidence/Root cause/Fix/Verification:
`tmp/audit-20260926-cert/12-findings.md` (+ reportes fuente por agente).

### P0 — ninguno

### P1 (1)

- **F-01 · QA/E2E · UNPROVEN — El journey de dinero E2E nunca corre en CI.** `wompi-sandbox.spec.ts`
  y `fullmode-checkout-wompi.spec.ts` son solo-manuales (`fullmode-checkout-wompi.spec.ts:43`); el
  gate PR se detiene antes de pagar (`ci.yml:207`, `compra.spec.ts:104-117`). La evidencia continua
  del pago es webhook-level, no browser-level.

### P2 (10)

- **F-02 · Payments · BROKEN(traza) — Doble pago Wompi silencioso (A11-01).** 2ª tx APPROVED misma
  reference, txId distinto: pasa dedup (`route.ts:166`) y la saga retorna `already_processed` sin
  comparar `order.wompiTransactionId` (`saga.ts:157-185,466-500`); sin reconciliación ni alerta.
- **F-03 · Payments · UNPROVEN — Orden pagada cancelable en silencio (A8-01).** Webhook perdido del
  todo + cliente que no vuelve a /gracias → cron cancela a 24h con veredicto `no_txid` sin flag
  (`expire-pending.ts:137,238-246`).
- **F-04 · Catálogo · BROKEN — Categoría inactiva → cards fantasma 404 (A4-02).** Stack B
  (`lib/catalog.ts:359-362`) no filtra `category.isActive/deletedAt`; stack SSR sí
  (`public-service.ts:88-92`). Afecta /ocasion, cross-sell, recomendador y APIs del bot.
- **F-05 · Auth cliente — Login/recuperación sin ningún test en CI** (A10-03; solo spec manual).
- **F-06 · CI — RLS behavior, MFA/admin E2E, CMS E2E y cross-browser solo en nightly**; no gatean
  release (A9-01).
- **F-07 · Release — Push directo a `production` despliega sin gates** (checks gatean PRs, no
  pushes; verificado `gh api`, A9-02).
- **F-08 · Ops — Sin smoke post-deploy automatizado** (A9-03).
- **F-09 · Legal — Contenido legal solo describe modo `full`** (A2-01; OK si el release sale en
  full — confirmar).
- **F-10 · Cliente — Retracto/garantía: UI cliente sin E2E** (A2-02; servicios sí testeados).

### P3 (26) y P4 (~45)

Selección P3: diseño rechazado sigue público vía share token (A4-01); imágenes de producto sin
`updateTag("catalog")` (A3-01); sin polling backup de tracking Aveonline (A8-03); R2 sin Bucket
Lock (A9-05); CRON_SECRET en 3 lugares sin runbook (A9-07); rollback nunca ensayado (A9-09);
rename de slug sin redirect → URLs viejas 404 (A11-02); nightly nunca corrió sobre el SHA congelado
(A11-06); `AdminRecoveryCode` ausente de migraciones Prisma (A5-01); `secretOk` duplicado ×15
(A6-09); 12 rutas REST públicas sin consumidor en repo (A6-04); `db-stg-setup.sh` re-agenda crons
de email en STG (A9B-09); retries globales lavan no-determinismo (A10-05). Lista exhaustiva en
`12-findings.md`.

## 6. BROKEN (evidencia de comportamiento incorrecto)

1. **A4-02 (P2):** stack B de catálogo muestra productos de categorías inactivas → 404 al click.
2. **A4-01 (P3):** `rejectDesign` no revoca el share token; diseño rechazado sigue público en
   `/d/<token>` (`personalization/service.ts:1631-1645`).
3. **A11-01 (P2):** doble aprobación Wompi por misma reference no se detecta (traza estática
   completa; reproducción dinámica programada en el plan).
4. **A11-02 (P3):** rename de slug público no genera redirect → URLs compartidas quedan 404.
5. **A3-01 (P3, acotado por TTL):** cambio de imágenes de producto no invalida el tag "catalog".

## 7. UNPROVEN relevante (requiere validación controlada para certificar)

- Tramo navegador del pago (F-01) — corrida sandbox certificada o automatización en nightly.
- Anomalías multi-transacción Wompi (F-02/F-03) — reproducción en integration test.
- Evidencia nightly sobre el SHA congelado (A11-06) — dispatch de `nightly-full.yml`.
- Webhook Aveonline perdido (A8-03); webhooks Wompi fuera de orden end-to-end (A8-02);
  `order_not_found` con cobro huérfano (A8-04); evento Resend perdido tras fallo (A8-06).
- Restore de `auth.users`/storage/config (CBJ-F6); rollback de despliegue (A9-09).
- Paridad viva LOCAL/STG/PRD (histórica 2026-09-20, no re-verificable read-only).
- Invariantes transaccionales I-11/12/13/21 sin evidencia DATA (DB local sin órdenes).
- WholesaleTier sin consumidor fuera del admin (A4-04); rutas REST del bot WhatsApp (A6-04).

## 8. Código muerto / duplicado / legacy (A6)

- **Muerto confirmado:** `flattenSlotToV1` (0 refs); 5 subclases de `AppError` sin uso;
  `getRelatedProducts` (solo tests); 12 scripts one-shot ya ejecutados fuera de `one-shot/`.
- **Duplicación conceptual (la importante):** doble stack de catálogo storefront con gate de
  visibilidad implementado 2× (→ A4-02); dos ProductCard con regla de descuento divergente (impacto
  acotado a drift por scripts — A4-03); regla `variant.price ?? basePrice` en ≥8 puntos; `secretOk`
  copiado ×15. **Sin duplicación** en máquinas de estado, cupones, stock, RBAC, moneda, CMS, emails.
- **Duplicación textual:** `escapeHtml` ×20, `pickString` ×13 (P4).
- **Dependencias:** `next-themes` vestigial; 0 claramente muertas. Detalle: `05-code-health.md`.

## 9. Inconsistencias Admin ↔ Cliente ↔ DB

Confirmadas: las 5 BROKEN de §6. Verificadas sin impacto material: A3-04 (categorías sin
revalidatePath — el tag sí se emite), A6-06 (las dos reglas de descuento coinciden gracias a
`syncProductBasePrice`; control detective `audit-storefront-consistency.mjs` existe). Fuera de
estos casos, Admin y Storefront leen la misma realidad (invalidación inmediata o lectura directa;
ventanas de stale documentadas en la sección cache de `02-wiring-matrix.md`).

## 10. Gaps de pruebas (A10)

El problema no es la calidad de la suite (bien escrita: 0 `.only`, 0 `expect(true)`, mocks solo en
fronteras externas) sino **dónde corre**: 57/68 specs e2e fuera de todo workflow; login/reset
cliente, pago navegador, rastrear, mi-cuenta, cupones E2E, admin transaccional, wishlist y
anti-abuse sin tests en CI; `retry: 2` global en vitest; 2 suites del diferenciador #1 (render
servidor del Estudio) huérfanas de todo pipeline. Specs gold identificados para el Evidence
Reviewer en `11-test-quality.md`.

## 11. Verificación (gates sobre el SHA congelado)

| Gate | Resultado |
|---|---|
| install / db:generate / typecheck / lint / build / db-test | ✅ exit 0 |
| format:check | ❌ solo por el archivo de misión untracked (no es código) |
| `pnpm -r test` | 4191/4203 ✅ — 4 rojos = suites acopladas a la DB compartida de dev (FLAKY-ENV verificado 3/3; excluidas por diseño en CI/nightly) |
| E2E gate PR local (smoke/a11y/axe/compra/estudio/mobile) | ✅ 32/32 |
| E2E admin-login local (con TOTP) | ✅ 3/3 |
| `make test-rls` | ✅ 58/58 |
| Health local + `/` | ✅ 200 |
| CI push remoto sobre `742dcf8` | ✅ verde (run 36260596837) |
| Branch protection production (gh api) | ✅ 7 required checks + enforce_admins |
| `make audit-script-guards` | ✅ 78/78 scripts con env-guard |

## 12. Plan de remediación

`tmp/audit-20260926-cert/14-remediation-plan.md` — 6 bloques: (0) evidencia operativa (dispatch
nightly, corrida sandbox, confirmar modo); (1) P1: cablear pago sandbox al nightly; (2) dinero
multi-tx: reconciliación en doble APPROVED + resumen de canceladas `no_txid` + flag en
shipment_failed; (3) catálogo: predicado de visibilidad único, revocación de share token, updateTag
imágenes, redirect en rename de slug; (4) gates: tests auth cliente, RLS/MFA a PR gate, PR
obligatorio a production, smoke post-deploy; (5) P3/P4 agrupados.

## 13. Checkpoint 6 — Discovery Verdict

```text
Target SHA: 742dcf8a69e17e0ccfc84301fee56afdf142b82e (develop)
Capabilities inventoried: 113 páginas · 65 actions · 42 API routes · 57 modelos · 26 emails · 11 crons
Wiring edges: 50 (41 PROVEN / 4 PARTIAL / 1 UNPROVEN / 1 BROKEN)
Critical journeys: 40 (28 PROVEN / 12 PARTIAL / 0 UNPROVEN / 0 BROKEN)
P0: 0 · P1: 1 · P2: 10 · P3: 26 · P4: ~45
```

**BLOCKERS BEFORE REMEDIATION:**

1. Autorización para `workflow_dispatch` del nightly sobre el SHA congelado (acción de escritura en
   GitHub Actions, sin tocar PRD).
2. Autorización para corrida manual del spec sandbox de pago (LOCAL/sandbox Wompi; no PRD).
3. Decisión de la owner: modo del release (`full` esperado → F-09 queda NOT_APPLICABLE).
4. Decisión sobre F-07 (restringir pushes a production): cambio de settings de GitHub.

**Estado:** DISCOVERY COMPLETO. Release gate actual: **NOT_CERTIFIED** (P1 > 0; arista crítica
Admin↔Cliente BROKEN — A4-02; smoke/rollback UNPROVEN). Ningún blocker exige rediseño; la
remediación release-blocking estimada es de 6–8 cambios pequeños con tests de regresión + 2
acciones operativas.

---

## 14. Remediación (2026-09-26/27) — ejecutada

Sobre el worktree de `develop` (base `742dcf8a`, **sin commitear** — el nuevo SHA se congela al
commit). 7 agentes de remediación (R1–R7), cada fix con causa raíz + test de regresión. Detalle y
evidencia por fix: `tmp/audit-20260926-cert/17-adversary-remediation.md`,
`18-evidence-review-remediation.md` y logs `recert/`.

| Bloque | Fixes | Resultado |
|---|---|---|
| R1 dinero multi-tx | F-02 (`flagForeignApprovedPayment` en 3 salidas de la saga + espejo en /gracias), F-03 (cancelaciones `no_txid` visibles en resumen diario), A11-04 (`missing_dims` → needsReconciliation) | 6 tests nuevos, suites 35/35 y 19/19 |
| R2 catálogo/wiring | F-04 (predicado único `STOREFRONT_PRODUCT_WHERE`/`STOREFRONT_CATEGORY_WHERE` consumido por ambos stacks), A4-01 (rejectDesign revoca share token + backstop REJECTED + cola incluye solo-compartidos), A3-01 (`updateTag("catalog")` en image-actions), A11-02 (redirect 301 automático en rename de slug con política de colisiones) | 26 tests nuevos, 381 verdes |
| R3 CI/gates | F-01 (job `e2e-wompi-sandbox` en nightly con guard de secrets), F-06 (job `rls-behavior` en PR + `pnpm --filter @lucams/db test` en quality), A9-08 (`audit-schema-drift.mjs` en CI), F-08 (`post-deploy-smoke.yml` + script sin deps), A11-05 (suites finalize-server-render/letter-tiles autocontenidas, exclusión eliminada) | drift check exit 0; smoke 5/5 contra PRD |
| R4 tests journeys | F-05 (25 unit + 7 integration contra GoTrue real: login/OTP/rate-limit real/anti-enumeración; homolog-auth al nightly), F-10 (spec `retracto-garantia-cliente` 4/4 en local, cableado al nightly) | 45/45 auth, 61/61 vecinos |
| R5 nightly rojo | Causa raíz triple: nightly sembraba solo el delta de catálogo (0 productos en localstack), resolución viva del spec era código muerto (import dinámico roto + catch mudo), y **bug real**: seed canónico declaraba 13 productos con slugs legacy → soft-404 en DBs frescas. Fix: cadena de seeds completa en nightly + spec con expectativas derivadas de la DB + seed saneado | rehearsal de alta fidelidad 10/10 |
| R6 P3/P4 | A6-09 (`cron-auth.ts` compartido, 15 handlers), A9B-09 (db-stg-setup des-agenda crons de email en STG), A5-01 (migración Prisma aditiva `AdminRecoveryCode` + SQL 008 idempotente; drift sin warning), muertos eliminados (flattenSlotToV1, 5 AppError, getRelatedProducts), 11 one-shots archivados, retries solo-CI, cupón PERCENT 1-100, docstrings stale | todas las suites vecinas verdes |
| R7 bordes adversario | Gate rojo aal2 (mock `next/cache`), A11R-01 (APPROVED tardío sobre orden reusada a COD: persiste txId + flag + NO guía con recaudo), A11R-03 (alta con slug ocupado por redirect → redirect archivado), A11R-04 (smoke con marcadores estructurales) | 297/297 en suites tocadas |
| Cierre tests | flake latente de retención (cota de 90 días sin epsilon) + 2 specs e2e con expectativas obsoletas (tinta con tolerancia cero vs antialiasing; MIMEs pre-upscale-WebP del 2026-09-22) — ambos reproducidos idénticos en HEAD puro vía git worktree: **0 regresiones de la remediación** | specs verdes |

## 15. Recertificación (gates sobre el worktree remediado)

```text
RECERTIFICATION_TARGET_SHA=742dcf8a + diff de remediación (pendiente commit → nuevo SHA)
```

| Gate | Resultado |
|---|---|
| typecheck / lint / build / db-test / script-guards | ✅ exit 0 |
| `pnpm -r test` | ✅ **4275 passed / 0 failed** / 8 skip ambientales (270 archivos) |
| `pnpm format:check` | ❌ solo por `LUCAMS_RELEASE_CERTIFICATION_PROMPT.md` (no commitear) |
| drift check Prisma↔Supabase | ✅ exit 0, 2 tolerancias conocidas (AdminRecoveryCode ya no) |
| `make test-rls` | ✅ 58/58 |
| E2E local (gate PR + admin-login + retracto-garantía + specs estudio corregidos) | ✅ 45+6 passed (1 flaky recuperado, 1 skip de proyecto) |
| Revisión adversarial de la remediación (A11 fase 2) | 12/13 fixes SOBREVIVEN; smoke degradado→cerrado por R7.4; 2 P3 residuales cerrados por R7 |
| Juicio de evidencia (A12 fase 2) | F-02/F-03/F-04/F-05 + P3 remediados: **CERRADOS**; CBJ-27/03/04 restauradas a PROVEN |

## 16. Release gate tras remediación

**Estado al 2026-09-27 (post-push):** paquete commiteado en 4 commits convencionales
(`ce74f6d` orders, `c5fa1be` catalog, `4843bd0` tests auth/retracto, `c326d1b` ci/higiene +
`0ba0fa6` formato). **CI sobre `0ba0fa6`: verde (8/8 jobs, incl. el nuevo `rls-behavior`).**
**Nightly sobre `c326d1b` (idéntico salvo formato): verde** — E2E completo (admin-login + MFA +
Estudio + audit-cliente con la cadena de seeds reparada + homolog-auth + retracto-garantía) y
RLS-matrix de comportamiento pasan; el guard de secrets detectó correctamente la ausencia de
secrets sandbox y saltó el job de dinero con warning (como está diseñado).

**NOT_CERTIFIED todavía** — las condiciones restantes ya no son de código sino operativas/decisión:

1. ~~Commit + push del paquete y CI verde sobre el nuevo SHA~~ **HECHO** (`0ba0fa6`, CI 8/8).
2. ~~Nightly verde sobre el SHA remediado~~ **HECHO** (runs 36323483460 sobre `c326d1b` y
   36324374129 sobre `0ba0fa6` — ambos verdes; el job de dinero saltó por diseño: secrets sandbox
   ausentes).
3. ~~**F-01 (condicionado):**~~ **CERRADO 2026-09-27.** Secrets sandbox cargados en GitHub
   (verificado `gh secret list`). Primera corrida (run 36325762084) reveló un hueco real de
   fixtures: el localstack no tenía los settings BUSINESS de recogida (se configuran manual en
   admin; ningún seed los crea) → guía Aveonline fallaba. Fix `7f07c43` (fixture idempotente
   `tests/e2e/fixtures/pickup-settings.ts`, rehearsal de alta fidelidad con cotización real
   SERVIENTREGA + 4242 APPROVED + trackingNumber). **Run 36328807610: 4/4 jobs verdes, incluido
   "E2E dinero — checkout Wompi sandbox (4242 → PAID + guía)"** — el journey de dinero completo
   ahora corre en CI cada noche con artifacts de 30 días.
4. ~~**Branch protection:**~~ **HECHO 2026-09-27 (vía API, PATCH):** `production` ahora exige 8
   required checks, incluido `RLS behavior (rls-matrix contra Supabase local)` (verificado: la
   regla lista los 8 contexts). `e2e-wompi-sandbox` corre solo en nightly: su verde es gate de
   release por política (documentado en TESTING.md), no por required check.
5. **Decisiones owner:** modo del release (`full` — PRD opera en `full` por decisión de Lucy del
   2026-09-03 → F-09 NOT_APPLICABLE para este release) y política de push directo a `production`
   (F-07 — hoy abierto, verificado `gh api`; la convención actual es push ff directo).
6. **Migración `20260926120000_admin_recovery_code`:** llega a STG/PRD con el deploy vía
   `prisma migrate deploy` (verificado en local; en nube postgres es owner y aplica completa).
7. Primera corrida de `post-deploy-smoke` tras el deploy.

Riesgos abiertos aceptables (P4): A11R-02 (sin vía admin para limpiar `needsReconciliation`),
A11-03 (doble email en carrera extrema), A8-03 (sin polling Aveonline), rollback sin drill (A9-09).

