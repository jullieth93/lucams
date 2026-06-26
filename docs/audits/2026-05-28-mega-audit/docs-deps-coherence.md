I have enough context now to produce the audit.

# Dimensión: Docs Coherence + Dependencies + Bundle

## Estado actual real

`STATE.md` cierra con bitácora del **2026-05-11** (Fase 2 catálogo+cart anon) mientras git registra 47+ commits hasta el **2026-05-27** cubriendo Fase 2 cierre, checkout multi-step, integración real Aveonline, webhook Wompi, saga POST-PAID, emails transaccionales, admin /pedidos, link mágico guest /pedido/<token>, catálogo modular, Sub-fases A/B/C admin, CMS Visual In-Place Editor, Estudio M.3.b WOW, plantillas SVG strategy. `ROADMAP.md` marca Fase 2 como "🟡 EN CURSO" cuando en realidad está prácticamente cerrada y Fase 3 (Estudio) + Fase 4 (Checkout/pagos/logística) están ampliamente avanzadas. `INTEGRATIONS.md` sigue describiendo **Venndelo como proveedor activo** con `VENNDELO_*` env vars cuando ADR-039 ya consolidó **Aveonline + interface ShippingProvider** y el código real vive en `apps/web/features/shipping/aveonline.ts`. `ARCHITECTURE.md` y `PLAN.md` siguen citando **Next.js 15** y carpeta `lib/cart.ts (Zustand)` que ya no existe. Deps: Next 16.2.6 / React 19.2.4 / Prisma 6.18 / Tailwind v4 / react-konva 19 / sharp 0.34.5 — todas actuales; única outdated trivial: prettier 3.8.3→3.8.4. Tests: 5 archivos reales (no 1 como dijo el scout) pero sin coverage de flujos críticos (checkout, saga, webhooks, RLS).

## Fortalezas

- Sistema documental rico y modular (24 docs en `docs/`), con `CLAUDE.md` que indexa lecturas condicionales por tarea — patrón sano para fan-out de contexto.
- ADRs disciplinados (55 entradas, hasta ADR-039) con formato consistente (contexto / decisión / razones / trade-offs / consecuencias / cuándo reabrir).
- Mandato #9 (argumentación con cita) se aplica visiblemente: tier Free verificado con URL y fecha, ADR-024 cita doc local Next.js 16.
- Dependencias core en la última estable: Next 16.2.6, React 19.2.4, Prisma 6.18, Tailwind v4, react-konva 19.2.4, sharp 0.34.5, Zod 4.4. Pocas deudas técnicas en versiones.
- `pnpm-workspace.yaml` con `allowBuilds` whitelisting (`sharp`, `prisma`, `@prisma/engines`, `unrs-resolver`, `msw`) — cumple política pnpm 11+ de security-by-default.
- Bundle del editor lazy-loaded con `react-konva` (~50KB gzipped) y server actions con `bodySizeLimit: 50mb` documentado con justificación (saveCanvas/finalize).
- ADR-039 (Aveonline) y ADR-038 (API Catálogo RAG-ready) registran fielmente las decisiones recientes, aunque el cuerpo principal de `INTEGRATIONS.md` quedó sin actualizar.

## Debilidades

- **Drift narrativo masivo**: `STATE.md`, `ROADMAP.md`, `ARCHITECTURE.md`, `PLAN.md`, `INTEGRATIONS.md` no reflejan ~2 semanas de cambios productivos (commits del 2026-05-12 al 2026-05-27).
- **Stack misdeclarado**: 3 docs maestros aún dicen "Next.js 15" y la mitad de `INTEGRATIONS.md` describe Venndelo cuando el código corre Aveonline (ADR-039 lo registró pero no propagó).
- **CLAUDE.md table-of-contents incompleta**: faltan referencias a `PLAN_CATALOG_V2.md`, `INTEGRATIONS_AVEONLINE.md` (76KB), `QA_CHECKLIST.md`, `EMAIL_TEMPLATES.md`, `incidents/`, `claude-project/`.
- **ADRs faltantes** para decisiones tomadas en código: dev domain ngrok (`kebab-late-batting.ngrok-free.dev` en next.config), magic link guest `/pedido/<token>` (commit f3a64ef), M.3.b multi-slot canvas paradigm shift, business data de Aveonline movida de env → SiteSettings (commit c9e12fa), AVEONLINE_ENV test|production, COD oculto al cliente (commit a96d5b4).
- **Saltos de numeración ADR**: 022, 023, 025, 027, 028, 032 marcados como "próximos a documentar" + saltos 040/041/042 en uso (ADR-039 fue el último). No hay disciplina de "reservar" números.
- **Subprocesadores desactualizados**: COMPLIANCE.md tabla 459-470 sigue listando "Venndelo / Coordinadora" y no menciona Aveonline ni los 7 carriers reales (Servientrega, TCC, Envia, Domina, Interrapidísimo, Saferbo). Riesgo legal Ley 1581 art. 26 (transferencias).
- **Tests**: 5 archivos (.test.ts) cubren format/rate-limit-keys/cookie-consent/support-schemas + 1 e2e smoke. Sin tests RLS, sin tests de saga, sin tests checkout, sin tests webhook idempotency — el ROADMAP criterio Fase 1 ("RLS verificada con tests automatizados") sigue abierto.
- `apps/web/AGENTS.md` advierte "This is NOT the Next.js you know" pero los docs internos no propagan el aviso fuera del ADR-024.
- `packages/ui/` listado en pnpm-workspace y en `CLAUDE.md` mandato #3 pero no existe físicamente (solo `packages/db/`).
- `OPERATIONS.md` líneas 280-282 + 331 + 513-515 siguen citando `VENNDELO_API_URL`, `Venndelo API key Anual` y runbook "envío no se creó en Venndelo" — runbook no aplica.

## Findings detallados

### [P0] DOC-001 — STATE.md desactualizado ~17 días; siguiente sesión arranca sin contexto reciente

- **Categoría**: docs-drift
- **Evidencia**: `docs/STATE.md` "Resumen actual" línea 16 dice "Fase 2 AVANZADA (2026-05-11)"; última bitácora línea 613 "2026-05-11". Git log muestra commits hasta 2026-05-27 (f3a64ef link mágico, e727b78 Aveonline real, 4884eb3 webhook Wompi+saga, cb0e88f emails transaccionales, 051954d admin /pedidos, 8b33e7f catálogo Lucy real 9 productos).
- **Impacto**: La regla "Lectura mínima al iniciar sesión (siempre)" de CLAUDE.md apunta a STATE.md como índice narrativo. Cualquier nueva sesión Claude leerá un estado 17 días viejo y tomará decisiones sin saber que Fase 3+4 ya están vivas, que Aveonline reemplazó a Venndelo, ni que el Visual Editor M.3.b está en producción.
- **Recomendación**: Agregar bitácoras desde 2026-05-12 al 2026-05-27 (mínimo 1 entrada por "hito" — F2.0 setup Wompi+Aveonline, F2.1 checkout multi-step, saga POST-PAID, admin sub-fases A/B/C, M.3.b WOW, catálogo Lucy real, link mágico guest). Actualizar el bloque "Resumen actual" para reflejar que F2 cierra y F3/F4 están en curso real. Actualizar "Próximo paso".
- **Horas estimadas**: 2.5
- **Acción humana Lucy**: ninguna (Claude lo redacta basado en git log + commits).

### [P0] DOC-002 — INTEGRATIONS.md sigue documentando Venndelo cuando el código real corre Aveonline

- **Categoría**: docs-drift
- **Evidencia**: `docs/INTEGRATIONS.md:128-217` describe "## 2. Venndelo (logística)" con env vars `VENNDELO_*`, endpoints `api.venndelo.com/v1`, mapeo de estados Venndelo→OrderStatus. Pero ADR-039 (`DECISIONS.md:1234-1352`) cierra Aveonline + interface ShippingProvider, y `apps/web/features/shipping/aveonline.ts` (30KB) es el código real con `lib/aveonline.ts` + `lib/aveonline-auth.ts`. `INTEGRATIONS_AVEONLINE.md` (76KB, fecha 2026-05-21) tiene la doc real pero `INTEGRATIONS.md` no la referencia.
- **Impacto**: Cualquier desarrollador (o Claude) que lea INTEGRATIONS.md cree que está integrando Venndelo. Mapeo de estados, costos, env vars son falsas. Es el doc citado por `CLAUDE.md` para "Implementar o depurar Wompi, Venndelo, Resend".
- **Recomendación**: Reescribir sección "2. Venndelo" como "2. Aveonline (logística)" reflejando ADR-039 + remitiendo a `INTEGRATIONS_AVEONLINE.md` para detalle. Mover sub-sección Venndelo a un apéndice "Plan B dormido" con 5 líneas, NO la doc completa. Actualizar la tabla resumen línea 7-15 (sandbox real no existe en Aveonline — `AVEONLINE_ENV=test|production`).
- **Horas estimadas**: 3
- **Acción humana Lucy**: ninguna.

### [P0] DOC-003 — ROADMAP.md mantiene Fase 2 EN CURSO y Fase 3+4 PENDIENTE cuando realmente están avanzadas

- **Categoría**: docs-drift
- **Evidencia**: `docs/ROADMAP.md:12-14` tabla: Fase 2 🟡 EN CURSO (admin CRUD + storefront + cart anon listos, 2026-05-11), Fase 3 ⏸️ Pendiente, Fase 4 ⏸️ Pendiente. Realidad: F2 cerrada (imágenes Storage, variantes admin, filtros, paginación, M.3.b WOW son del 2026-05-13 al 2026-05-21); F3 Estudio Personalización entregada extensamente (ADR-035, ADR-037, M.3.b multi-slot, 9 kinds, 3 buckets); F4 Checkout multi-step + Wompi Hosted + saga POST-PAID + webhook + Aveonline real con guías (86732744650, 535738810) ya en branch develop.
- **Impacto**: ROADMAP es la fuente para autorización de fases (mandato del usuario "el resto requiere aprobación explícita"). Decir "Fase 4 ⏸️ Pendiente" cuando en producción ya hay carriers cotizando y guías reales emitidas es confuso. Auditorías futuras no pueden chequear contra esta línea base.
- **Recomendación**: Subir Fase 2 a 🟢 Completada, marcar Fase 3 como 🟡 EN CURSO (Estudio core hecho, falta IA Claude API + 3D), Fase 4 como 🟡 EN CURSO (checkout + Wompi + Aveonline reales pero faltan: COD activo al cliente, DIAN, retracto, cookie consent, sagaLog, IdempotencyKey en `/api/checkout/create`). Marcar criterios cumplidos/abiertos con checkboxes. Mover Fase 6 admin a 🟡 EN CURSO (admin sub-fases A/B/C cerradas).
- **Horas estimadas**: 2
- **Acción humana Lucy**: confirmar interpretación de "cerrada" vs "completada" para cada fase.

### [P1] DOC-004 — ARCHITECTURE.md cita Next.js 15 + carpetas `lib/cart.ts (Zustand persistido)` + `middleware.ts`

- **Categoría**: docs-drift
- **Evidencia**: `docs/ARCHITECTURE.md:5,44` dice "Next.js 15"; línea 95 `lib/cart.ts # Zustand persistido` cuando ADR está en Postgres + sessionId cookie (commit 7bfc879); línea 101 `middleware.ts` cuando Next 16 renombró a `proxy.ts` (ADR-024). PLAN.md:14,129,268 también cita "Next.js 15".
- **Impacto**: Carpeta y patrón mostrados en el "structure tree" no coinciden con la realidad. Confunde a nuevos contributors. Mandato #3 CLAUDE.md ya dice "Next.js 16" pero los docs de soporte no se sincronizaron.
- **Recomendación**: Search/replace global "Next.js 15" → "Next.js 16" en ARCHITECTURE.md, PLAN.md, COMPETITIVE_ANALYSIS.md. Reescribir carpeta tree para reflejar realidad: `lib/cart-session.ts` + Cart model en Postgres, `proxy.ts`, `app/admin/login/`, `app/admin/dashboard/`, `app/api/aveonline/webhook/`, `app/pedido/[token]/`, `features/shipping/`, `features/cms/`. Actualizar diagrama ASCII para reemplazar "Venndelo" por "Aveonline".
- **Horas estimadas**: 2.5
- **Acción humana Lucy**: ninguna.

### [P1] DOC-005 — Subprocesadores en COMPLIANCE.md desactualizados (Ley 1581 art. 26)

- **Categoría**: risk
- **Evidencia**: `docs/COMPLIANCE.md:459-470` tabla de subprocesadores activos sigue listando "Venndelo / Coordinadora". No menciona Aveonline ni a los 7 carriers que Aveonline interconecta (Servientrega, TCC, Envia, Coordinadora, Domina, Interrapidísimo, Saferbo). El proveedor DIAN sigue "TBD".
- **Impacto**: Antes de lanzar, la lista publicada en `/legal/subprocesadores` se genera de este doc. Si transferimos datos del cliente (nombre/dirección/teléfono) a Aveonline para emitir guías y no está declarado, hay incumplimiento Ley 1581 art. 26 (transferencias internacionales/terceros). Aunque Aveonline es CO, los datos viajan a 7 carriers. Riesgo legal pre-launch.
- **Recomendación**: Reescribir fila "Venndelo / Coordinadora" → "Aveonline (agregador multi-carrier)" + sub-bullet listando los 7 carriers con país (todos CO). Mantener nota: "Lista de carriers se actualiza si Aveonline suma o quita partners — chequeo trimestral". Una vez ADR-025 elija proveedor DIAN (Alegra/Siigo/Facture), actualizar fila correspondiente.
- **Horas estimadas**: 1
- **Acción humana Lucy**: revisar con abogado al activar pre-launch.

### [P1] DOC-006 — ADRs faltantes para decisiones ya implementadas en código

- **Categoría**: docs-drift
- **Evidencia**: Los siguientes cambios viven en repo sin ADR de respaldo:
  - **Aveonline business data en SiteSettings** (commit c9e12fa "refactor(shipping): mover business data Aveonline de env a SiteSettings") — patrón inverso al original (env vars).
  - **AVEONLINE_ENV=test|production** (commit 3a0dc86) — modelo dual ambiente diferente a sandbox tradicional.
  - **`cotizarDoble` + filtro numbererror** (commit 34d6567) — workaround a quirks API Aveonline documentado en INTEGRATIONS_AVEONLINE.md pero sin ADR.
  - **Link mágico guest `/pedido/<token>`** (commit f3a64ef) — token público en URL, decisión de seguridad y UX.
  - **COD oculto al cliente** (commit a96d5b4) — contradice ADR-009 "contraentrega activa desde día 1".
  - **Dev domain ngrok** `kebab-late-batting.ngrok-free.dev` (next.config.ts:13) — patrón compartido entre desarrolladores sin doc.
  - **M.3.b multi-slot paradigm shift** — está en ADR-035 pero las decisiones de FormData + bodySizeLimit 50mb (next.config) no tienen ADR; commit 43c1d86 los describe.
- **Impacto**: Re-evaluar estas decisiones en el futuro requiere reverse-engineering del commit. ADR-009 (COD día 1) y commit a96d5b4 (ocultar COD) se contradicen directamente sin nota de superseded.
- **Recomendación**: Crear ADR-040 (Aveonline ambiente test/prod + business data en SiteSettings + cotizarDoble), ADR-041 (Link mágico guest /pedido/<token>: token entropy, TTL, scope), ADR-042 (COD diferido a post-launch — superseded ADR-009 parcialmente), ADR-043 (FormData server actions + bodySizeLimit 50mb). Mover ADR-009 a "Superseded en parte por ADR-042".
- **Horas estimadas**: 4
- **Acción humana Lucy**: confirmar TTL del token de /pedido/ + cuándo se reactivará COD.

### [P1] DEP-001 — `packages/ui/` referenciada pero no existe

- **Categoría**: gap
- **Evidencia**: `CLAUDE.md` mandato #3 cita "monorepo pnpm (`apps/web` + `packages/db` + `packages/ui`)". `pnpm-workspace.yaml:1-3` glob `packages/*`. `docs/ARCHITECTURE.md:112-113` describe `packages/ui/` con `package.json`. Realidad: `ls packages/` solo muestra `db`. No hay `packages/ui/`. Toda la UI vive en `apps/web/components/` directamente.
- **Impacto**: Discrepancia documento↔repo. No es bloqueante pero confunde el modelo mental "shadcn components compartidos en packages/ui".
- **Recomendación**: Decidir: (a) crear `packages/ui/` real y mover componentes shadcn compartidos ahí (probablemente innecesario hoy con un solo app), o (b) actualizar CLAUDE.md + ARCHITECTURE.md + PLAN.md para reflejar "monorepo pnpm con `apps/web` + `packages/db`. `packages/ui/` se creará cuando exista una segunda app que comparta componentes".
- **Horas estimadas**: 0.5
- **Acción humana Lucy**: ninguna.

### [P1] DEP-002 — Cero tests de RLS / saga / webhook idempotency / checkout pese a ser criterio de aceptación

- **Categoría**: gap
- **Evidencia**: ROADMAP Fase 1 criterio: "RLS verificada con tests automatizados: usuario A no ve datos de usuario B". Fase 4 criterio: "Webhook idempotente: enviar el mismo evento 2 veces no duplica nada" + "Saga test E2E: simular falla en createShipment después de commitStock". Realidad: 5 archivos `.test.ts` cubren solo `format.ts`, `rate-limit-keys.ts`, `cookie-consent.ts`, `support/schemas.ts`, + 1 e2e smoke. Ningún test sobre `features/cart`, `features/checkout`, `features/shipping/aveonline.ts`, `app/api/wompi/webhook`, RLS policies.
- **Impacto**: La saga POST-PAID corre en producción sin red de seguridad para regresiones. Webhook Wompi sin test de idempotencia (criterio explícito Fase 4). RLS depende solo de testing manual.
- **Recomendación**: Antes de lanzar, escribir mínimo: (a) test integration de RLS por modelo crítico (Customer, Cart, Order) usando Supabase service vs anon, (b) test de saga POST-PAID con mock Aveonline que falla → assert rollback, (c) test idempotencia webhook Wompi (mismo `transactionId` 2 veces → 1 Order PAID), (d) e2e Playwright del checkout multi-step.
- **Horas estimadas**: 16
- **Acción humana Lucy**: ninguna.

### [P2] DOC-007 — CLAUDE.md tabla "Lectura condicional" no menciona docs nuevos

- **Categoría**: docs-drift
- **Evidencia**: `CLAUDE.md` líneas 15-30 lista condicional. No cita `PLAN_CATALOG_V2.md` (1656 líneas, 109KB, doc central para catálogo + IA-ready), `INTEGRATIONS_AVEONLINE.md` (76KB), `QA_CHECKLIST.md`, `EMAIL_TEMPLATES.md`, `docs/incidents/`, `docs/claude-project/`.
- **Impacto**: Claude Code en sesiones futuras no encuentra los docs por su sistema indexado. Re-investiga lo ya documentado.
- **Recomendación**: Agregar filas en la tabla: "Tocar catálogo / variants / ocasiones / wizard" → `PLAN_CATALOG_V2.md`; "Tocar Aveonline a fondo" → `INTEGRATIONS_AVEONLINE.md`; "Hacer QA pre-merge" → `QA_CHECKLIST.md`; "Tocar templates email Supabase Auth" → `EMAIL_TEMPLATES.md`; "Investigar incident histórico" → `docs/incidents/`.
- **Horas estimadas**: 0.5
- **Acción humana Lucy**: ninguna.

### [P2] DOC-008 — OPERATIONS.md runbook + env vars con referencias Venndelo

- **Categoría**: docs-drift
- **Evidencia**: `docs/OPERATIONS.md:280-282` "─── Venndelo ───" + `VENNDELO_API_URL=https://api.venndelo.com/v1`. Línea 331 "Venndelo API key Anual". Líneas 513-515 runbook "Pago realizado pero envío no se creó en Venndelo".
- **Impacto**: Runbooks de incidente apuntan al proveedor incorrecto. En un incidente real con Aveonline, el operador busca "envío no se creó" y encuentra instrucciones obsoletas (`POST /shipments` etc).
- **Recomendación**: Reescribir sección env vars con `SHIPPING_PROVIDER=aveonline`, `AVEONLINE_USUARIO`, `AVEONLINE_CLAVE`, `AVEONLINE_ENV=test|production`. Reescribir runbook "Pago realizado pero envío no se creó" en términos de `aveonline.generarGuia2` + agente 28013 + `bloquegenerarguia=0`. Actualizar política de rotación.
- **Horas estimadas**: 2
- **Acción humana Lucy**: ninguna.

### [P2] DOC-009 — SECURITY.md CSP `connect-src` y rate-limit tabla aún citan Venndelo

- **Categoría**: docs-drift
- **Evidencia**: `docs/SECURITY.md:277` `connect-src ... https://api.venndelo.com ...`; línea 397 rate-limit `/api/shipping/quote` "Genera tráfico a Venndelo"; línea 597 sección "Webhooks (Wompi, Venndelo)".
- **Impacto**: CSP real en `proxy.ts` debe permitir Aveonline endpoints (`integraciones.aveonline.co`), no Venndelo. Si Lucy o un dev sigue este doc para revisar CSP, lo deja roto.
- **Recomendación**: Cambiar `connect-src` allowlist a `https://*.aveonline.co https://integraciones.aveonline.co`. Renombrar sección webhooks a "(Wompi, Aveonline)" con HMAC docs específicos. Actualizar threat model línea 38 "Webhook falso de Wompi/Aveonline".
- **Horas estimadas**: 1
- **Acción humana Lucy**: ninguna.

### [P2] DOC-010 — Salto y reservas inconsistentes en numeración ADR

- **Categoría**: tech-debt
- **Evidencia**: `DECISIONS.md` reserva al final del archivo "ADR-022/023/025/027/028/032/036". ADRs implementados saltan: 029, 030, 031, 033, 034, 035, 036, 037, 038, 039. ADR-036 existe doble (en lista de "futuros" + como "Information Architecture del catálogo" ya cerrado). No hay ADR-024 reserva inconsistente: existe 024 (Next.js 16) y luego saltan 025-028. ADR-032 está reservado para "OpenTelemetry" pero ya hay decisiones de Aveonline/CMS/Estudio que ocuparon otros números.
- **Impacto**: Confusión sobre disponibilidad de números. Riesgo de colisión si dos sesiones simultáneas reclaman el mismo número.
- **Recomendación**: Reescribir bloque "próximos a documentar" al final de DECISIONS.md eliminando ADR-036 (ya usado) y dejando una nota "siguiente número libre: 040". Alternativa: dejar de pre-asignar números — usar el siguiente disponible cuando se cree el ADR.
- **Horas estimadas**: 0.5
- **Acción humana Lucy**: ninguna.

### [P3] DEP-003 — Prettier 3.8.3 → 3.8.4 outdated (patch)

- **Categoría**: tech-debt
- **Evidencia**: `pnpm outdated` muestra solo `prettier 3.8.3 → 3.8.4` (devDep root). Resto del workspace en latest.
- **Impacto**: Despreciable.
- **Recomendación**: Bump opcional en próxima limpieza de deps. No urgente.
- **Horas estimadas**: 0.1
- **Acción humana Lucy**: ninguna.

### [P3] DOC-011 — PLAN.md árbol de carpetas muy desactualizado

- **Categoría**: docs-drift
- **Evidencia**: `docs/PLAN.md:129` describe carpeta tree con `apps/web/messages/` (i18n), `middleware.ts`, `lib/cart.ts (Zustand)`, sin `features/`, sin `lib/cms.ts`, sin `lib/aveonline*.ts`, sin `/estudio/`, sin `/admin/contenido/`, sin `/admin/pedidos/`, sin `/pedido/[token]/`.
- **Impacto**: PLAN.md fue marcado en CLAUDE.md como "para entender alcance global". Si está stale, da una vista incorrecta del proyecto.
- **Recomendación**: Marcar PLAN.md como "documento histórico fase 0" o reescribir árbol con la realidad de 2026-05-27. Dado que ROADMAP.md y STATE.md ya cumplen ese rol, PLAN.md puede congelarse como referencia histórica con banner al principio.
- **Horas estimadas**: 1
- **Acción humana Lucy**: decidir si congelar o reescribir.

### [P3] DEP-004 — `next-themes` listada en deps pero sin uso obvio (dark mode no implementado)

- **Categoría**: tech-debt
- **Evidencia**: `apps/web/package.json:32` `"next-themes": "^0.4.6"`. No hay branding docs que indiquen dark mode kawaii. Brand es lavanda+cream — single theme.
- **Impacto**: Bundle size marginal. Posible dependencia muerta.
- **Recomendación**: Verificar uso con grep `next-themes` en imports; si nulo, removerla. Si está en uso por shadcn radix-nova como soft dep, dejar.
- **Horas estimadas**: 0.25
- **Acción humana Lucy**: ninguna.

## Resumen final

La capa documental es **rica pero desincronizada** del código en ~2 semanas críticas (Fase 2 cierre + Fase 3/4 inicio real). El stack en sí está sano (deps actuales, single outdated trivial), pero ADR-039 (Aveonline) no se propagó al cuerpo de `INTEGRATIONS.md`, `COMPLIANCE.md` subprocesadores, `SECURITY.md` CSP, ni `OPERATIONS.md` runbooks — generando contradicciones internas y riesgo legal pre-launch (Ley 1581). 4-6 decisiones recientes viven en commits sin ADR de respaldo (link mágico guest, COD oculto que contradice ADR-009, ngrok dev, business data en SiteSettings). Prioridad inmediata: actualizar STATE.md + ROADMAP.md + INTEGRATIONS.md + COMPLIANCE.md subprocesadores antes de cualquier auditoría externa o consulta legal, y abrir ADR-040..043 para sellar las decisiones recientes.

Archivos relevantes para el seguimiento:
- `/home/ansible/workspaces/lucams_shop/docs/STATE.md`
- `/home/ansible/workspaces/lucams_shop/docs/ROADMAP.md`
- `/home/ansible/workspaces/lucams_shop/docs/INTEGRATIONS.md`
- `/home/ansible/workspaces/lucams_shop/docs/INTEGRATIONS_AVEONLINE.md`
- `/home/ansible/workspaces/lucams_shop/docs/DECISIONS.md`
- `/home/ansible/workspaces/lucams_shop/docs/ARCHITECTURE.md`
- `/home/ansible/workspaces/lucams_shop/docs/COMPLIANCE.md`
- `/home/ansible/workspaces/lucams_shop/docs/SECURITY.md`
- `/home/ansible/workspaces/lucams_shop/docs/OPERATIONS.md`
- `/home/ansible/workspaces/lucams_shop/CLAUDE.md`
- `/home/ansible/workspaces/lucams_shop/apps/web/next.config.ts`
- `/home/ansible/workspaces/lucams_shop/apps/web/features/shipping/aveonline.ts`
- `/home/ansible/workspaces/lucams_shop/apps/web/package.json`
- `/home/ansible/workspaces/lucams_shop/packages/db/package.json`
- `/home/ansible/workspaces/lucams_shop/pnpm-workspace.yaml`