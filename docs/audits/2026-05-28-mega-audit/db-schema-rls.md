I have a complete picture. Let me write up the report.

# Dimensión: DATABASE + SCHEMA + RLS + MIGRATIONS + SEEDS

## Estado actual real

37 modelos Prisma (1229 LOC en `schema.prisma`), 9 migraciones Prisma + 5 migraciones Supabase (RLS, rate-limit, pg_trgm/unaccent, 4 buckets Storage). Schema cubre conceptualmente todas las áreas del proyecto (catálogo, checkout, personalización, CMS, observabilidad, compliance DIAN, consents Ley 1581, redirects, recomendaciones). Pero hay drift significativo entre lo declarado y lo cableado: tablas críticas existen sin lógica de aplicación (StockReservation, ErrorReport, RecommendationLog, SiteEvent), RLS policies sólo cubren 19 de 37 tablas, y las extensiones obligatorias por ADR-016/017 (pgmq, pg_cron) no están habilitadas. 26 scripts en `packages/db/scripts/` mezclan seeds, probes, refactors one-off y simulators sin separación de directorios.

## Fortalezas

- **Modelado de dominio rico y honesto**: el schema documenta el "por qué" de cada decisión en comentarios (legacy `customDesign`/`isPersonalizable`, V1→V2 migrations, ADR refs).
- **Compliance colombiano operativizado**: `DocumentType`, `TaxResponsibility`, `DianStatus`, `Consent` con scope granular + revocación auditable + `version` para re-consentimiento están bien modelados (`schema.prisma:69-104, 758-780`).
- **Idempotency hardening**: `WebhookEvent @@unique([source, externalId])` (`schema.prisma:715`), `Order.number @unique`, `CouponUsage.orderId @unique` (`schema.prisma:601`), `EmailEvent.resendId @unique`.
- **Soft-delete + audit fields consistentes en entidades mutables principales** (Customer, Address, Product, Order, Coupon, BlogPost, CmsBlock, etc.) — 16 modelos con `deletedAt/deletedBy`.
- **Search rica configurada**: pg_trgm + unaccent + función `immutable_unaccent` + 5 índices GIN sobre Product (`search_and_storage.sql:25-35`, `catalog_v2_consolidated:198`).
- **Storage policies bien diseñadas**: 4 buckets (`product-images`, `customer-uploads`, `design-previews`, `production-assets`) con `is_active_admin()` helper y policies SELECT/INSERT/DELETE granulares (`00000000000005_search_and_storage.sql`, `00000000000006_storage_personalization.sql`).
- **Connection pooling correcto**: `DATABASE_URL` (PgBouncer 6543) + `DIRECT_URL` (5432 para migrate) + singleton Prisma anti-leak en dev (`packages/db/src/index.ts:25-42`).
- **Migration history limpia**: 9 migraciones nombradas semánticamente, sin reverts ni DROP TABLE.

## Debilidades

- **18 tablas sin RLS policies declaradas explícitamente**. La auditoría 2026-05-09 declaró RLS por defecto pero las migraciones nuevas (CMS, Personalization, OcasionTag, RecommendationLog, UrlRedirect, observability) no extienden `00000000000002_rls_policies.sql` ni habilitan RLS en sus tablas.
- **StockReservation, RecommendationLog, SiteEvent, ErrorReport, AbandonedCart, LoyaltyTxn, Referral, InventoryLog**: tablas existen en schema con índices y FKs, pero ZERO references desde `apps/web/`. Schema-shaped, app-blind.
- **No hay decremento de stock al crear orden** (comentario en `features/orders/service.ts:6` lo promete pero ninguna línea del código lo hace) — sobreventa posible cuando se publique stock real.
- **pgmq y pg_cron NO instalados** pese a ADR-016/017 obligatorios (PLAN.md líneas 217, 240). Las TODOs explícitas en `00000000000003_rate_limit.sql:78` y `00000000000004:32` documentan la deuda; sin cleanup la tabla `rate_limit_buckets` crece monotónicamente.
- **`cache_entries` documentada en docs/ARCHITECTURE.md:501-569 pero nunca creada** — promesa rota.
- **Audit fields inconsistentes**: `SupportTicket`, `Design` tienen `updatedAt` pero faltan `deletedAt/createdBy/deletedBy`; `AbandonedCart` no tiene `createdBy/deletedBy` (es legítimo en append-ish pero ambiguo); `Design.deletedAt` ausente pese a tener status `ARCHIVED` que actúa como soft-delete.
- **Legacy fields sin plan de deprecación**: `Product.isPersonalizable` (overridable por `personalizationKind`), `CartItem.customDesign`/`OrderItem.customDesign` (con `designId` ya existente), `Order.venndeloShipmentId` — todos comentados como "legacy/compat" pero ninguno tiene timeline de remoción ni feature flag.
- **`scripts/` sin estructura**: 26 archivos `.mjs` mezclan seeds productivos, refactors one-off ya consumidos (rename-family-base-slugs, consolidate-product-families, refactor-abecedario-separadores), probes externos (probe-aveonline), simulators (simulate-wompi-webhook) y audits. Riesgo: alguien re-ejecuta `consolidate-product-families.mjs` y rompe el catálogo.
- **Drift trigger auth.users → Customer**: archivado por incompatibilidad con Supabase Auth API (documentado bien en `00000000000004_sync_auth_users_delete.sql`), pero no se implementó la alternativa Database Webhooks / pg_cron prometida; huérfanos en `Customer` quedan al borrar usuarios.

## Findings detallados

### [P0] DB-001 — Stock no se decrementa en createOrderFromCart

- **Categoría**: bug
- **Evidencia**: `apps/web/features/orders/service.ts:6` comenta "decremento de stock + asociación de Designs" pero el `prisma.$transaction` (líneas 100-194 aprox según source map) sólo crea Order + OrderItems + update designs; nunca toca `ProductVariant.stock` ni `InventoryLog`. Confirmado por `grep -rn "stock" features/orders/service.ts` → 1 hit (comment).
- **Impacto**: cuando Lucy publique stock real (productos sin reposición instantánea), una saga PAID podrá generarse para más unidades de las que existen físicamente → sobreventa, refunds manuales, daño reputacional.
- **Recomendación**: añadir `tx.productVariant.update({ where:{id}, data:{stock:{decrement: qty}}})` + `tx.inventoryLog.create({delta:-qty, reason:"ORDER_CREATED", orderId})` dentro de la transacción. Validar `stock >= qty` antes con `for update` o aceptar fallo P2002-like.
- **Horas estimadas**: 4
- **Acción humana Lucy**: ninguna

### [P0] DB-002 — RLS NO habilitada en 18 tablas (incluye Design, DesignAsset, Consent, SiteSetting, CmsBlock)

- **Categoría**: risk (security)
- **Evidencia**: `supabase/migrations/00000000000002_rls_policies.sql:27-46` habilita RLS sólo en 19 tablas. Las migraciones posteriores (`20260512_add_cms`, `20260512_add_compliance_dian_obs_support`, `20260513_add_personalization`, `20260515_catalog_v2_consolidated`, `20260520_add_url_redirect`) crean tablas nuevas sin `ENABLE ROW LEVEL SECURITY`. Tablas afectadas: `Consent, WebVital, SiteEvent, ErrorReport, EmailEvent, SupportTicket, CmsBlock, CmsBlockVersion, SiteSetting, Design, DesignAsset, PersonalizationTemplate, OcasionTag, ProductOcasionTag, CouponUsage, RecommendationLog, UrlRedirect`.
- **Impacto**: viola mandato CLAUDE.md #12 ("Toda tabla con acceso vía anon_key debe tener RLS habilitada"). `Design`/`DesignAsset` contienen fotos privadas de clientes — anon con anon_key puede leer/escribir. `SiteSetting` contiene config negocio. `Consent` es PII Ley 1581.
- **Recomendación**: nueva migration `supabase/migrations/00000000000007_rls_phase2.sql` que (1) `ENABLE ROW LEVEL SECURITY` en las 18 tablas restantes, (2) define policies SELECT public para `CmsBlock` (isPublished=true), `SiteSetting`, `PersonalizationTemplate.isActive`, `OcasionTag.isActive`, `UrlRedirect.isActive`; deny-by-default para el resto; owner-only para `Design`/`DesignAsset` por `Customer.supabaseUserId` o `sessionId`.
- **Horas estimadas**: 6
- **Acción humana Lucy**: Aplicar migration vía `supabase db push` o psql directo + verificar en Supabase Studio.

### [P1] DB-003 — StockReservation declarada pero nunca usada (ADR-014 incompleto)

- **Categoría**: stub
- **Evidencia**: `schema.prisma:721-732` define el modelo completo con FKs e índices. `grep -rn "StockReservation\|stockReservation" apps/web/` → 0 hits (sólo aparece en chunks Supabase de `node_modules` falsos positivos). ADR-014 referenciado en schema header (`schema.prisma:6`).
- **Impacto**: el flujo de checkout no reserva stock entre añadir-al-carrito y pagar; dos clientes pueden añadir las mismas 5 unidades únicas al carrito y ambos llegar a Wompi. Si DB-001 se arregla pero esto no, el segundo paga y al `decrement` se va a stock negativo.
- **Recomendación**: implementar reservation en `cart/service.ts:addItem` (insert `StockReservation` con `expiresAt = now() + 15 min`) + cleanup pg_cron + verificar `stock - SUM(reservations.qty)` en `addItem` y `createOrderFromCart`. Si se posterga, marcar ADR-014 como "deferred" en `docs/DECISIONS.md`.
- **Horas estimadas**: 16
- **Acción humana Lucy**: ninguna (decisión técnica)

### [P1] DB-004 — pgmq y pg_cron NO habilitadas pese a ADR-016/017 obligatorios

- **Categoría**: gap
- **Evidencia**: `grep -n "pgmq\|pg_cron" supabase/migrations/*.sql packages/db/prisma/migrations/*/migration.sql` → sólo TODOs en `00000000000003_rate_limit.sql:78`. `docs/PLAN.md:217,240,280-281` declaran ADR-016 y ADR-017 como ✅ pero sólo en docs. `apps/web/.env.example:41` reconoce que "el código usa polling pg_cron" — no implementado.
- **Impacto**: (1) `rate_limit_buckets` crece sin cleanup (cada IP que pega un endpoint deja fila para siempre); (2) no hay infra de jobs durables para abandoned-cart reminders, expiración de reservas, retry de webhooks, expiración de tokens guest. La saga POST-PAID actual depende de webhook sincrónico sin retry durable.
- **Recomendación**: nueva migration `00000000000007_pgmq_pgcron.sql` que `CREATE EXTENSION pg_cron, pgmq`. Agendar como mínimo cleanup de `rate_limit_buckets` (cada 15 min) y de `StockReservation` (cada 5 min) cuando se implemente DB-003. Documentar en `docs/STATE.md` la pendiente real.
- **Horas estimadas**: 6
- **Acción humana Lucy**: ninguna (Supabase Free soporta pgmq + pg_cron en `extensions` schema; encender desde Dashboard si no se permite vía SQL).

### [P1] DB-005 — Trigger auth.users → Customer descartado sin reemplazo activo

- **Categoría**: gap
- **Evidencia**: `supabase/migrations/00000000000004_sync_auth_users_delete.sql:28-34` documenta que se descartó el trigger por incompatibilidad con Supabase Auth API y promete "Supabase Database Webhooks o pg_cron periódico" para Fase 4 Right-to-Deletion. Ninguna de las dos existe.
- **Impacto**: si Lucy borra un usuario desde Supabase Studio (acción humana plausible), el `Customer` y `AdminUser` quedan huérfanos. Viola Ley 1581 derecho de supresión.
- **Recomendación**: implementar pg_cron job que cada 24h `DELETE FROM "Customer" WHERE supabaseUserId NOT IN (SELECT id::text FROM auth.users)` con `RETURNING` para audit. Requiere DB-004 primero.
- **Horas estimadas**: 3
- **Acción humana Lucy**: ninguna

### [P1] DB-006 — 26 scripts sin categorizar; one-offs ya consumidos al lado de seeds productivos

- **Categoría**: tech-debt
- **Evidencia**: `packages/db/scripts/` ls. Mezcla de:
  - **Seeds productivos**: `seed-admin.mjs`, `seed-catalog-v2.mjs` (37 KB), `seed-clean.mjs`, `seed-cms.mjs` (36 KB), `seed-ocasiones.mjs`, `seed-product-dims.mjs`, `seed-products.mjs` (61 KB), `seed-reviews-demo.mjs`, `seed-templates.mjs`, `seed-test-customer.mjs`
  - **Refactors one-off (deberían estar archivados)**: `consolidate-product-families.mjs`, `rename-family-base-slugs.mjs`, `refactor-abecedario-separadores.mjs`, `fix-voseo-cms.mjs`, `backfill-variant-prices.mjs`, `update-legal-ley-2439.mjs`, `cleanup-empty-categories.mjs`, `cleanup-slugs.mjs`, `activate-lucy-catalog.mjs`
  - **Probes externos**: `probe-aveonline.mjs`, `probe-aveonline-agents-guide.mjs`
  - **Audits**: `audit-slugs.mjs`, `audit-variants.mjs`, `certify-fase2.mjs`
  - **Simulators**: `simulate-aveonline-webhook.mjs`, `simulate-wompi-webhook.mjs`
- **Impacto**: ejecutar por error un script one-off arruina el catálogo prod. `simulate-wompi-webhook.mjs` no debe llegar a prod por error.
- **Recomendación**: reorganizar en `scripts/seed/`, `scripts/probe/`, `scripts/simulate/`, `scripts/maintenance/`, `scripts/archive/` (one-offs ya consumidos). Documentar en cada script su estado en el header.
- **Horas estimadas**: 2
- **Acción humana Lucy**: ninguna

### [P1] DB-007 — Promesa `cache_entries` (ADR-016) sin implementar

- **Categoría**: docs-drift
- **Evidencia**: `docs/ARCHITECTURE.md:501-569` declara tabla `cache_entries` con shape y uso. `grep -rn "cache_entries" supabase/ packages/db/` → 0 hits en migrations.
- **Impacto**: cualquier feature que asuma cache Postgres (catálogo, settings) falla silenciosamente o no se cachea. Pero no rompe nada en prod hoy porque nadie la usa.
- **Recomendación**: agregar la tabla en la misma migration DB-004 o marcar ADR-016 explícitamente como "cache deferred to Redis evaluation" en `docs/DECISIONS.md`.
- **Horas estimadas**: 1
- **Acción humana Lucy**: ninguna

### [P1] DB-008 — Audit fields inconsistentes: Design sin deletedAt, SupportTicket parcial

- **Categoría**: tech-debt
- **Evidencia**: `schema.prisma:1007-1051` (Design) — tiene `createdBy/updatedBy/updatedAt` pero **no** `deletedAt/deletedBy`, pese a tener status `ARCHIVED` que actúa como soft-delete semántico. `SupportTicket` (linea 871) tiene `updatedAt` pero no `deletedAt/createdBy/updatedBy/deletedBy`. `DesignAsset` (1053) sin `updatedAt/deletedAt`.
- **Impacto**: imposibilita auditoría "¿quién archivó este diseño y cuándo?" para soporte; el `ARCHIVED` status no distingue archivado-por-cliente vs archivado-por-admin-por-abuso.
- **Recomendación**: agregar `deletedAt/deletedBy` a Design + DesignAsset + SupportTicket. Migration de 6 líneas + indexes.
- **Horas estimadas**: 2
- **Acción humana Lucy**: ninguna

### [P2] DB-009 — ErrorReport, RecommendationLog, SiteEvent, AbandonedCart, InventoryLog, LoyaltyTxn, Referral: schema sin caller

- **Categoría**: stub
- **Evidencia**: grep en `apps/web/` retorna 0 escrituras a estas tablas (excepto `WebVital` que sí está cableado vía `/api/vitals/route.ts:52`).
- **Impacto**: el dashboard de observabilidad (sub-bloque F) y los flows de abandoned cart / loyalty / referrals están pre-modelados pero sin telemetría real. La promesa de "alternativa propia a Sentry" en schema comment (línea 825) no se cumple.
- **Recomendación**: priorizar `ErrorReport` write desde `app/error.tsx` + `app/global-error.tsx` (existe el comentario en `error.tsx:28`). `AbandonedCart` cuando se active email Resend con dominio verificado. Marcar el resto como "stub para Fase X" en `docs/STATE.md`.
- **Horas estimadas**: 6
- **Acción humana Lucy**: ninguna

### [P2] DB-010 — Legacy fields sin plan de retirement

- **Categoría**: tech-debt
- **Evidencia**: 
  - `Product.isPersonalizable` (`schema.prisma:302`) + `personalizationKind` coexisten; el código aún lo lee (`apps/web/app/api/catalog/products/route.ts:49`, `app/admin/(panel)/productos/product-form.tsx:38,248`).
  - `CartItem.customDesign` + `OrderItem.customDesign` coexisten con `designId` (`features/cart/service.ts:456`, `features/orders/service.ts:186` lo siguen escribiendo).
  - `Order.venndeloShipmentId` queda como columna nullable sin que ningún caller lo lea.
  - `Design.productionUrl` (single) + `productionUrls[]` coexisten.
- **Impacto**: contradice mandato CLAUDE.md de claridad post-launch; bugs futuros donde un consumer mira el campo viejo y otro el nuevo.
- **Recomendación**: ADR explícito en `docs/DECISIONS.md` con cronograma "retirar isPersonalizable en migration X, mes Y"; mientras tanto agregar un test que valide `isPersonalizable === (personalizationKind !== NONE)`.
- **Horas estimadas**: 3
- **Acción humana Lucy**: ninguna

### [P2] DB-011 — Order.publicAccessToken sin index dedicado (sólo unique)

- **Categoría**: improvement
- **Evidencia**: `schema.prisma:502` declara `publicAccessToken String? @unique`. La unique constraint crea un B-tree index, pero la mayoría de lookups por token deberían ser O(1) y el filtro `WHERE publicAccessToken = ? AND deletedAt IS NULL` no aprovecha índice compuesto.
- **Impacto**: minor; correctness OK, performance pico aceptable.
- **Recomendación**: no urgente. Eventualmente añadir `@@index([publicAccessToken, deletedAt])` si el endpoint /pedido/<token> aparece en N+1 queries.
- **Horas estimadas**: 0.5
- **Acción humana Lucy**: ninguna

### [P2] DB-012 — Migration drift: AVEONLINE webhook enum value en migration mini sin lock SQL ni `ADD VALUE IF NOT EXISTS`

- **Categoría**: risk
- **Evidencia**: `20260522_webhook_source_aveonline/migration.sql` añade `ALTER TYPE "WebhookSource" ADD VALUE IF NOT EXISTS 'AVEONLINE'`. OK, pero el `IF NOT EXISTS` en enum values es PG14+. Supabase pro corre PG15 — soportado. **Pero**: `ALTER TYPE ... ADD VALUE` no se puede ejecutar dentro de un `BEGIN` (PG limit), así que si la migration corre con Prisma envolviéndola en una transacción puede fallar.
- **Impacto**: riesgo bajo de fallo idempotencia al reaplicar migrations en una DB fresca de prod.
- **Recomendación**: confirmar que `prisma migrate deploy` no envuelve esta migration en BEGIN. Si falla, separar el statement en archivo dedicado con `--without-transactions`.
- **Horas estimadas**: 1
- **Acción humana Lucy**: ninguna (verificación)

### [P3] DB-013 — `migration_lock.toml` y políticas idempotencia en sql nativos no tienen test

- **Categoría**: improvement
- **Evidencia**: 0 tests en `packages/db/`. La idempotencia de `00000000000002_rls_policies.sql` (claims con DROP/CREATE) y del UPSERT en `rate_limit_check` son críticas pero no testeadas.
- **Impacto**: bajo a mediano. Un cambio que rompa idempotencia pasaría sin alarmas.
- **Recomendación**: en Fase TESTING (TESTING.md menciona "RLS automatizado"), añadir suite `pgtap` o tests integración con DB efímera que reapliquen migrations 3x y validen policies.
- **Horas estimadas**: 8
- **Acción humana Lucy**: ninguna

### [P3] DB-014 — Singleton Prisma OK, pero falta connection pool tuning explícito

- **Categoría**: improvement
- **Evidencia**: `packages/db/src/index.ts:36-40` instancia `PrismaClient` sin `connection_limit` ni `pool_timeout` explícitos en `DATABASE_URL`. Por defecto Prisma usa `num_cpus * 2 + 1`.
- **Impacto**: en Vercel serverless cada función Lambda abre su propio pool; con tráfico pico se puede saturar PgBouncer.
- **Recomendación**: documentar en `.env.example` que `DATABASE_URL` debe llevar `?connection_limit=5&pool_timeout=20` para serverless. No urgente pre-launch.
- **Horas estimadas**: 0.5
- **Acción humana Lucy**: editar `.env.example` con sed (la regla de memoria prohíbe abrirlo).

## Resumen final

El modelo de datos es ambicioso y bien documentado conceptualmente, pero hay un **gap claro entre lo declarado en schema y lo cableado en código**: ~8 modelos son schema-only sin escritura desde la app, dos features arquitecturales obligatorias (pgmq/pg_cron, StockReservation) no están implementadas, y RLS sólo cubre la mitad de las tablas. Los P0 (stock no se decrementa, RLS faltante en 18 tablas) son bloqueantes para lanzamiento productivo con stock real y datos PII; el resto es deuda manejable post-launch siempre que se documente honestamente en `docs/STATE.md` y `docs/DECISIONS.md`.

Archivos relevantes:
- `/home/ansible/workspaces/lucams_shop/packages/db/prisma/schema.prisma`
- `/home/ansible/workspaces/lucams_shop/supabase/migrations/00000000000002_rls_policies.sql`
- `/home/ansible/workspaces/lucams_shop/supabase/migrations/00000000000003_rate_limit.sql`
- `/home/ansible/workspaces/lucams_shop/apps/web/features/orders/service.ts`
- `/home/ansible/workspaces/lucams_shop/packages/db/scripts/` (26 archivos sin categorizar)