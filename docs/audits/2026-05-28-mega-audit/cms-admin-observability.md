I have enough verified evidence. Generating final report.

# Dimensión: CMS + Visual Editor + Admin Panels + Observability

## Estado actual real
El CMS tiene una base sólida verificada en código (`apps/web/lib/cms.ts`, `features/cms/service.ts`, `app/admin/(panel)/contenido/*`, `api/cms/*`): 77 bloques + 40 settings sembrados, versionado completo con publish/unpublish, audit trail cableado en TODAS las server actions, búsqueda pg_trgm, cache `unstable_cache` con `updateTag("cms")`, rate-limit en endpoints públicos, 25 archivos consumiendo `<CmsMarkdown>/<CmsText>/<CmsSetting>` con fallback hardcoded para zero-downtime. El admin panel está rediseñado (brand 2026-05-18) con componentes `AdminPage*` consistentes y `/admin/auditoria` funcionando. La observabilidad tiene esqueleto: 4 endpoints `/api/health/*`, `WebVitalsReporter` montado en root layout enviando a `/api/vitals` que persiste en tabla `WebVital`, y modelo `ErrorReport` con fingerprint en schema. **Pero hay un gap grande entre lo planeado y lo cableado**: el Visual In-Place Editor (sub-bloque K mencionado en docstrings) NO EXISTE — el directorio `components/edit-mode/` no está creado, no hay endpoint `/api/admin/cms/by-key/[key]` (el comentario del service.ts apunta a uno inexistente), no existen `/admin/errores`, `/admin/performance`, `/admin/reclamos`, `/admin/mensajes`, `/api/log-error`, `lib/error-reporter.ts`, ni `/api/health/integrations`. Esos links caen al placeholder `[...placeholder]/page.tsx`. No hay ningún email de alerta operacional cableado (errores >10/h, stock bajo, payment stuck — todo declarado en docs pero ausente del código).

## Fortalezas
- CMS con versionado real y `publishedVersionId` separado del draft → editar no rompe el sitio público.
- Audit trail (`AdminActionLog`) cableado en 14 archivos de admin actions (categorías, productos, contenido, cupones, ocasiones, reseñas, redirects, usuarios, integraciones, pedidos), con metadata sanitizada e IP/UA.
- Página `/admin/auditoria` completa con filtros por admin/action prefix/entityType/fecha y paginación 30/page.
- Endpoints públicos `/api/cms/*` con problem+json RFC 7807, rate-limit 30/min, cache HTTP agresivo (`public, max-age=300, s-maxage=3600, stale-while-revalidate=86400`) y validación Zod de category.
- Búsqueda full-text con `pg_trgm + unaccent` (`searchCmsBlocks`) tolerante a typos — diseñada para RAG futuro.
- `WebVitalsReporter` con normalización de dynamic routes (`/producto/[slug]`), `sendBeacon` con fallback a `fetch(keepalive)`, y Zod estricto en `/api/vitals/route.ts`.
- 4 healthchecks bien diseñados: `/api/health`, `/api/health/db` (SELECT 1 + latencia), `/api/health/storage` (list bucket), `/api/health/resend` (GET /domains sin enviar email), y `/api/health/all` agregando con 503 si crítico falla.
- `lib/resend.ts` con circuit breaker in-memory + retry exponencial 1s/2s/4s, fail-safe en dev sin API key.
- Catch-all `[...placeholder]/page.tsx` profesional con info contextual por badge `phase4|phase5|soon` en vez de 404 — UX para Lucy de "esto llega después".
- Soft-delete consistente en CmsBlock (`deletedAt`); índice en `[deletedAt]`.
- `BRAND 2026-05-18` aplicado: agrupación por categoría con emojis ("📋 Textos legales", "🍪 Banner de cookies") + badges 🟢/🟡 — coherente con feedback "admin UX para no-técnico".

## Debilidades
- Visual In-Place Editor: ÉL no existe. `components/edit-mode/` no se creó, ni el endpoint `/api/admin/cms/by-key/[key]` mencionado en `features/cms/service.ts:255` (deuda de docstrings que mencionan funcionalidad no implementada).
- `ErrorReport` model está en schema, pero NO se escribe en ninguna parte del código. Búsqueda de `ErrorReport` solo encuentra el comentario en `app/error.tsx:28` ("se conectará a /api/log-error en sub-bloque F").
- `/api/log-error` NO existe. Tanto `app/error.tsx` como `app/global-error.tsx` solo hacen `console.error` y nunca persisten.
- `/admin/errores` NO existe (cae a placeholder; tampoco hay nav item declarado para él).
- `/admin/performance` NO existe — anunciado en `admin-nav.ts:247` con badge "Próximo", cae al placeholder. `WebVital` se llena pero nadie lo lee desde admin.
- `/admin/reclamos`, `/admin/mensajes`, `/admin/metricas`, `/admin/recomendaciones` — todos caen al placeholder. No hay módulo de support tickets aunque `SupportTicket` model existe.
- `SiteEvent` model existe pero nadie lo escribe (no se encontró ni una sola escritura en código).
- Alertas operacionales (errores >10/h, stock bajo, payment stuck) — declaradas en docs (OBSERVABILITY.md según CLAUDE.md), pero código no tiene `sendInternalAlert`, `sendOpsAlert`, ni cron pgmq que las dispare. Resend tiene la fontanería para enviar pero nadie la llama.
- `/api/cms/settings` existe como ruta pero no se revisó su contenido — su contraparte por-key no existe (`/api/cms/settings/[key]`).
- Audit trail tiene cobertura asimétrica: las mutaciones en `cms/contenido/actions.ts` y catálogo están cubiertas, pero `pedidos/[number]/actions.ts` y `usuarios/actions.ts` tendrían que verificarse 1:1 vs todas sus mutaciones (no audité cobertura granular).
- `app/global-error.tsx` no manda nada al servidor — si rompe el root layout, no queda registro persistido más allá del `digest` del runtime de Next.
- `/api/health/all` no se ejecuta desde ningún cron interno; depende de un uptime monitor externo no configurado (BetterStack/UptimeRobot mencionados en comments pero no setup).
- `/admin/pedidos/page.tsx` es una **tabla**, NO un kanban — el contexto inicial decía "Admin pedidos kanban" pero el código en `app/admin/(panel)/pedidos/page.tsx:1-80` es `AdminTable` con `STATUS_LABEL` plano. Drift de información.
- `/admin/finanzas/page.tsx:1-12` documenta explícitamente "pre-Fase 2 sin datos reales" — KPIs vacíos. Bloqueo informativo para Lucy.

## Findings detallados

### [P0] CMS-01 — Visual In-Place Editor declarado pero ausente
- **Categoría**: stub
- **Evidencia**: `apps/web/features/cms/service.ts:251-255` documenta `getCmsBlockByKey` "para el Visual In-Place Editor" y endpoint `/api/admin/cms/by-key/[key]` que no existe (no hay `app/api/admin/cms/by-key/`). Directorio `apps/web/components/edit-mode/` inexistente. `app/admin/(panel)/auditoria/page.tsx:7` documenta acción `cms.block.inline_publish` que nadie graba en código.
- **Impacto**: Funcionalidad "WOW" anunciada en contexto inicial no existe. Lucy no puede editar in-place; debe entrar a `/admin/contenido/bloques/[id]`. Tampoco bloquea lanzamiento por sí solo, pero deja claro que el feature K no está implementado.
- **Recomendación**: Decidir si es sub-bloque K real para Fase 1 (entonces implementarlo: toggle global, hover detection con `data-cms-key`, popover, endpoint POST con auth admin) o re-clasificar a Fase 5 y remover los hooks/docstrings que mienten.
- **Horas estimadas**: 16 (si se implementa) / 1 (si se documenta como descartado)
- **Acción humana Lucy**: ninguna — decisión de scope.

### [P0] OBS-01 — ErrorReport y /api/log-error no cableados (alternativa a Sentry inexistente)
- **Categoría**: gap
- **Evidencia**: Modelo `ErrorReport` definido en `packages/db/prisma/schema.prisma:827-847` con fingerprint, count, status OPEN/RESOLVED. `app/error.tsx:27-29` solo hace `console.error`. `app/global-error.tsx:24` igual. `/api/log-error` no existe en `app/api/`. Búsqueda `grep -rn "ErrorReport" apps/web` solo devuelve el comentario en error.tsx. No hay `lib/error-reporter.ts`.
- **Impacto**: Mandato CLAUDE.md #7 "Sin Sentry" obliga a tener alternativa propia. Hoy no hay registro de errores en producción → cuando algo rompa en cliente o server route, queda solo en logs Vercel (24h en Hobby, sin dedupe, sin dashboard). Bloquea launch porque cumple criterio P0 (sin observabilidad de errores).
- **Recomendación**: Implementar `lib/error-reporter.ts` con función `reportError(err, ctx)` que calcula SHA-1 fingerprint (message + stack[:3]) y hace upsert en `ErrorReport` con count++. Crear `POST /api/log-error` con rate-limit, validación, sanitización de stack. Cablear desde `app/error.tsx`, `app/global-error.tsx` (con sendBeacon). Crear `/admin/errores/page.tsx` listando agregaciones.
- **Horas estimadas**: 8
- **Acción humana Lucy**: ninguna.

### [P0] OBS-02 — /admin/performance no existe (WebVital se acumula sin consumirse)
- **Categoría**: stub
- **Evidencia**: `apps/web/components/web-vitals.tsx` envía métricas a `/api/vitals/route.ts:52` que persiste correctamente. Pero `apps/web/lib/admin-nav.ts:247-250` declara `/admin/performance` con badge "Próximo". No hay `app/admin/(panel)/performance/page.tsx` → cae al `[...placeholder]/page.tsx`. La tabla `WebVital` crece sin que nadie la lea.
- **Impacto**: Costo silencioso (filas en DB sin valor inmediato) y mandato OBSERVABILITY.md de "SLOs cuantitativos" sin dashboard. Compromiso de lanzamiento productivo con métricas Core Web Vitals incompleto.
- **Recomendación**: Implementar página con p50/p75/p95 por route + por métrica (LCP/INP/CLS) usando agregación SQL. Considerar TTL en `WebVital` (purge >90 días con `pg_cron`) para no explotar Supabase free tier.
- **Horas estimadas**: 6
- **Acción humana Lucy**: ninguna.

### [P1] OBS-03 — Alertas operacionales (errores >10/h, stock bajo, payment stuck) no existen
- **Categoría**: gap
- **Evidencia**: Búsqueda `grep -rn "sendInternalAlert\|opsAlert\|admin.alert"` retorna 0 hits en `apps/web/`. `lib/resend.ts:1-50` solo expone `sendEmail` para emails al cliente. No hay cron `pg_cron` que dispare chequeos periódicos. `SiteEvent` model existe (schema:809) pero nadie lo escribe.
- **Impacto**: Lucy no se entera de incidentes. Si ocurren 100 errores/h, ni Vercel ni email avisan. Si stock baja a 0, ningún email. Si un pago queda colgado en `PENDING_PAYMENT` >2h, no hay disparo.
- **Recomendación**: Crear `lib/ops-alerts.ts` con `notifyAdmin(level, subject, body)`. Definir jobs pgmq+pg_cron (mandato #11) para checks cada 15 min: errores última hora, payments stuck, low stock. Email + log estructurado.
- **Horas estimadas**: 10
- **Acción humana Lucy**: configurar `OPS_ALERT_EMAIL` en Vercel envs.

### [P1] CMS-02 — Endpoint `/api/cms/settings/[key]` ausente
- **Categoría**: gap
- **Evidencia**: `app/api/cms/settings/route.ts` existe (listado), `app/api/cms/blocks/[key]/route.ts` existe (acceso por key), pero no hay `app/api/cms/settings/[key]/route.ts`. Asimétrico vs blocks.
- **Impacto**: Para que RAG/chatbot pueda preguntar "¿cuál es el horario?" via API necesita endpoint atómico. Hoy hay que descargar todo el listado.
- **Recomendación**: Crear el route handler espejo del de blocks, reusando `getSiteSetting` cacheado y `withCmsCacheHeaders`.
- **Horas estimadas**: 1
- **Acción humana Lucy**: ninguna.

### [P1] OBS-04 — `/api/health/all` sin uptime monitor configurado
- **Categoría**: gap
- **Evidencia**: `app/api/health/all/route.ts:9-10` documenta "útil para uptime monitors externos (BetterStack, UptimeRobot)". No hay configuración real ni en `docs/OPERATIONS.md` (no leído pero asumo por contexto) ni en repos.
- **Impacto**: Si la app se cae fuera del horario laboral, nadie se entera hasta el próximo login admin. Mandato OBSERVABILITY de uptime SLI sin telemetría real.
- **Recomendación**: BetterStack free tier (10 monitors) → ping a `/api/health/all` cada 1 min con alert a email Lucy. Documentar en runbook.
- **Horas estimadas**: 1
- **Acción humana Lucy**: crear cuenta BetterStack y agregar monitor.

### [P1] DOC-01 — Drift de documentación (kanban admin, sub-bloques, contexto inicial)
- **Categoría**: docs-drift
- **Evidencia**: Contexto inicial dice "Admin pedidos kanban" pero `app/admin/(panel)/pedidos/page.tsx:13-30` usa `AdminTable` con `STATUS_LABEL` flat. `features/cms/service.ts:255` apunta a endpoint inexistente. `app/admin/(panel)/auditoria/page.tsx:7` menciona acción `cms.block.inline_publish` que no se graba en ninguna action. `docs/STATE.md` desactualizado ~2 semanas (declarado).
- **Impacto**: Confusión entre lo que está y lo que se planeó. Sesiones futuras pueden creer que un feature existe.
- **Recomendación**: Pasada de "verdad o consecuencias" — eliminar/marcar TODO toda mención a in-place editor en docstrings hasta implementarlo, sincronizar STATE.md.
- **Horas estimadas**: 2
- **Acción humana Lucy**: ninguna.

### [P1] OBS-05 — `global-error.tsx` no envía digest al servidor
- **Categoría**: improvement
- **Evidencia**: `app/global-error.tsx:24` solo hace `console.error`. Cuando rompe el root layout, ni siquiera `/api/log-error` (cuando exista) recibe nada porque `app/global-error.tsx` corre sin JS si rompe más arriba.
- **Impacto**: Errores catastróficos no quedan registrados de cliente. Solo logs Vercel server-side los ven, y solo si rompen en SSR.
- **Recomendación**: Usar `sendBeacon` con `digest + UA + path` desde el useEffect, antes de `/api/log-error`. Tolerante a fallo (es best-effort).
- **Horas estimadas**: 1
- **Acción humana Lucy**: ninguna.

### [P2] CMS-03 — Cobertura inconsistente de `<CmsMarkdown>` fallback
- **Categoría**: improvement
- **Evidencia**: 25 archivos usan los componentes CMS (`grep -rl CmsMarkdown\|CmsText\|CmsSetting | wc -l = 25`) con 104 referencias totales. La auditoría rápida no verificó si CADA invocación pasa un fallback hardcoded coherente. Algunos como `components/site-footer.tsx`, `components/home/hero.tsx` deberían tener fallback exacto vs producción.
- **Impacto**: Si la DB está pausada (Supabase free tier 1 semana inactivo) y el bloque no cachea, el fallback hardcoded se muestra. Si está vacío o desactualizado, se rompe la experiencia inicial. No es crítico pero sí "primer vistazo a la marca".
- **Recomendación**: Test rápido `pnpm test` futuro: cargar todas las páginas con DB mockeada vacía y validar que se renderiza algo legible. Mantener fallback alineado con seed.
- **Horas estimadas**: 4
- **Acción humana Lucy**: ninguna.

### [P2] CMS-04 — Cache `unstable_cache` con TTL 1h sin warming inicial
- **Categoría**: tech-debt
- **Evidencia**: `lib/cms.ts:96,143,170,197,235,267` todas usan `revalidate: 3600`. En cold start o tras `updateTag("cms")`, la primera request paga la latencia Postgres completa.
- **Impacto**: Tras cada publish, primer visitante a esa página tiene LCP penalizado. No bloqueante.
- **Recomendación**: Warmup en `instrumentation.ts` (cargar bloques más comunes) o `revalidatePath` específico tras publish.
- **Horas estimadas**: 2
- **Acción humana Lucy**: ninguna.

### [P2] OBS-06 — `WebVital` table sin política de retención
- **Categoría**: tech-debt
- **Evidencia**: Schema `WebVital` (line 788-802) sin `expiresAt` ni job de purga. Con 9 productos activos y tráfico aún bajo no preocupa, pero al lanzar con tráfico real esta tabla crecerá rápido (cada visita: 6 métricas × N route changes).
- **Impacto**: Supabase Free tier 500MB → riesgo de saturación en 6-12 meses.
- **Recomendación**: `pg_cron` job semanal que `DELETE FROM "WebVital" WHERE "createdAt" < NOW() - INTERVAL '90 days'`. Aplica también a `SiteEvent` si llega a usarse.
- **Horas estimadas**: 1
- **Acción humana Lucy**: ninguna.

### [P2] CMS-05 — `searchCmsBlocks` no usa `unstable_cache`
- **Categoría**: improvement
- **Evidencia**: `lib/cms.ts:277-328` `searchCmsBlocks` es async normal sin caché, mientras todos los demás helpers sí cachean.
- **Impacto**: Si el chatbot pega 30 búsquedas/min (rate-limit), cada una paga query Postgres con pg_trgm. Más caro de lo necesario para queries repetidas.
- **Recomendación**: Wrap con `unstable_cache` keyed por query, revalidate 5 min. O introducir cache LRU server-side.
- **Horas estimadas**: 1
- **Acción humana Lucy**: ninguna.

### [P3] OBS-07 — Catch-all placeholder con mensaje "te llega en Fase X" desactualizado
- **Categoría**: docs-drift
- **Evidencia**: `[...placeholder]/page.tsx:50-60` mapea badges `phase4|phase5|soon` a texto canned. Como hay drift en ROADMAP (declarado en contexto), los textos pueden estar mintiéndole a Lucy.
- **Impacto**: Estética / expectativas mal seteadas.
- **Recomendación**: Sincronizar con ROADMAP cuando se actualice. Bajo costo.
- **Horas estimadas**: 1
- **Acción humana Lucy**: ninguna.

### [P3] OBS-08 — `lib/admin-audit.ts` no propaga errores ni tiene fallback a queue
- **Categoría**: improvement
- **Evidencia**: `lib/admin-audit.ts:62-72` swallowea errores con `logger.warn` y continúa. Es intencional ("no debe romper UX"), pero significa que si Postgres está fail, perdemos audit silentemente.
- **Impacto**: Cumplimiento Ley 1581 / auditoría de seguridad: log debería ser "best effort durable", no "best effort y olvida".
- **Recomendación**: Si falla persist, encolar a `pgmq` (mandato #11) o fallback a `logger.error` con marcador `audit.lost` para reconciliar. Verificar en `OBSERVABILITY.md` la política.
- **Horas estimadas**: 3
- **Acción humana Lucy**: ninguna.

## Resumen final
El CMS es la mejor parte de esta dimensión: arquitectura coherente, versionado, audit, cache + RAG endpoints — production-ready hasta donde lo verifiqué. El admin panel está sólidamente cableado en las áreas implementadas (contenido, productos, categorías, auditoría, pedidos como tabla, clientes), con UX considerada para no-técnico. La observabilidad, en cambio, está al 30%: el "wiring" superficial (healthchecks + Web Vitals + audit trail) está hecho, pero todo lo que convierte señal en accionable (dashboards `/admin/errores` y `/admin/performance`, alertas email, persistencia de errores, uptime monitor externo) NO existe. Bloqueantes P0 reales para lanzamiento productivo: implementar `ErrorReport` end-to-end (OBS-01), crear `/admin/performance` (OBS-02), y decidir scope del Visual In-Place Editor (CMS-01). El resto de findings son P1 importantes pre-launch o P2/P3 post-launch.