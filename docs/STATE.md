# Estado Actual del Proyecto — Lucams Shop

> **Documento vivo de Nivel 0 (≤ 10 KB).** Resume operación, homologación y pendientes vigentes. Mapa completo en [`docs/README.md`](README.md).

## Fotografía ejecutiva

- **Tienda:** `lucamsshop.com` opera exclusivamente en modo **`full`** (`ADR-204`) con Wompi, contraentrega, Aveonline y Envío Lucams Bogotá. Las compras individuales cierran en el checkout y los proyectos corporativos/eventos usan el configurador multicategoría `/empresas-y-eventos` → propuesta formal `/propuesta/[token]` → `Order` real (`ADR-210`); no existe cotización individual por WhatsApp.
- **Base técnica:** monorepo `pnpm` con `apps/web` (Next.js **16.4.6**, TS strict, Tailwind v4, shadcn/ui) y `packages/db` (**77 modelos Prisma**, **32 enums**, **101 migraciones Prisma** + **61 SQL Supabase**). RLS cubre el dominio y `enforce_rls_on_new_table` fija `search_path` vacío e identificadores `%I.%I`.
- **Integraciones (`ADR-206`):** `/admin/integraciones` usa registro tipado, resolución viva y componentes separados para los 7 proveedores; distingue configuración, conexión, activación y salud sin toggles ficticios ni duplicar rutas operativas.
- **Ramas protegidas (`ADR-105`):** `develop` (STG) y `production` (PRD) exigen PR y 5 checks: `Typecheck + Lint + Build`, `Vitest`, `RLS behavior`, `E2E + a11y + Lighthouse — Playwright` y `Gitleaks secret scan`.
- **Legal:** paquete **Versión 3** sincronizado en `packages/db/legal-content`, fallbacks, mapa y CMS de STG/PRD.

## Ambientes y homologación STG ↔ PRD

| Ambiente  | Infraestructura                                                      | Estado                                                                                                     |
| --------- | -------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| **LOCAL** | Supabase en Podman (`:54321`/`:54322`/`:54324`) + Next dev (`:4000`) | `full` homologado (`ADR-203`); seed local idempotente; 3 crons SQL; túnel ngrok opcional con autenticación |
| **STG**   | `develop` → Vercel Preview + Supabase STG                            | Operativo; aloja `uptime-monitor-prd` (12 jobs); reset con `make stg-reset`                                |
| **PRD**   | `production` → Vercel Pro (`iad1`) + Supabase PRD                    | `full`; 17 jobs `pg_cron`; backups diarios GPG de DB + Storage en R2                                       |

### Excepciones deliberadas (`ADR-099`, `ADR-121`, `ADR-126`, `ADR-203`)

- Migraciones, categorías (84 por ambiente), ocasiones, redirects y **168/168 campos CMS** están homologados. El catálogo activo de referencia contiene los 8 productos originales de PRD + `bola-navidena-personalizada` (9); el resto permanece pausado fuera de PRD.
- PRD conserva el catálogo vigente e históricos archivados (13 productos); STG/LOCAL conservan además el catálogo pausado (54). Plantillas y tramos de `mini-libros-magneticos` existen solo en STG/LOCAL; PRD mantiene nueve galerías archivadas de separadores como auditoría.
- `nombre-personalizado` está archivado en PRD; `set-fotoimanes-circulares` y `set-fotoimanes-corazon`, en los tres ambientes. Cuadrados conserva 2 variantes base `-NOMAG` inactivas (`5×5` y `7×7 cm`, `ADR-209`). El stock real nunca se sincroniza.
- `uptime-monitor-prd` y sus tablas viven solo en STG. Los cinco crons de correo existen en STG/PRD; STG fuerza `CRON_JOBS_DISABLED`, recuperación manual y Lifecycle `DRY_RUN`. `AVEONLINE_WEBHOOK_SECRET` solo está en PRD; `VERCEL_BYPASS_TOKEN`, solo en STG.
- `pg_net` difiere por versión gestionada de Supabase sin impacto funcional. El cupón de prueba `LOCURA` existe solo en STG.

## Capacidades operativas

### Catálogo, SEO y CMS v2 ([`domains/catalog-and-cms.md`](domains/catalog-and-cms.md))

- Categorías padre/hija, facetas configurables, producto insignia, 16 ocasiones, búsqueda difusa, PDP con escalas mayoristas y zoom, 404 real sobre slugs cacheados, feed Google Merchant y APIs `/api/catalog|cms`.
- **CMS v2 (`ADR-187`):** 9 contenedores, 30 secciones y 168 campos (105 `BLOCK` + 63 `SETTING`), paridad AST en CI, versionado append-only, publicación programada y tokens legales dinámicos.
- **Opciones base y `/admin/mayorista` (`ADR-209`):** `ProductVariant` modela solo atributos físicos de `1` unidad base (`1` pieza, `1` pack de `6` o `1` set; multi-pack históricos pausados). `WholesaleTier` centraliza descuentos por volumen (`minQty >= 2`) con sombra `opción > producto > global`.

### Estudio 2D/3D y producción 300 DPI ([`domains/studio-and-production.md`](domains/studio-and-production.md))

- Konva multi-unidad (`ADR-167`/`173`/`209`), tope de `1..15` diseños por tanda (`1..6` packs, `1..4` calendarios, `1..10` sets de letras, `MAX_DESIGN_SLOTS = 60`) y «Copias iguales de esta tanda» hasta `100` uds. (`16` packs), sellando `OrderItem.designUnits`. Derivados WebP, auto-fill, galería, letras, IA, 10 escenas 3D, `-NOMAG` y reverso de marca (`ADR-190`).
- Tiras photobooth compuestas, previews de packs en grilla y réplica entre unidades. Portada con popup tras consentimiento, logo estacional, nieve con movimiento reducido y CTA B2B (`/empresas-y-eventos` desde 25 uds.).
- **Bola Navideña (`ADR-199`/`201`/`209`):** activa en los 3 ambientes; inserto dúplex de 8 cm, cara B obligatoria, hasta 15 diseños/tanda y 100 copias. Sin/con imán a $10.000/$11.000 COP; promos 3 × $27.000 y 5 × $40.000.
- **Mini Libros (`ADR-200`):** carátulas 7,1 × 5 y 5 × 2,5 cm, lomo 0,5 cm, con/sin imán; inactivos fuera de referencia. Plantilla «Reino de cristal» y visor 3D completo.
- Auto-save serial con `clientRev` y `STALE_REVISION`; recuperación de borradores; previews privados por `/api/design-preview/*`; `RenderJob` 300 DPI a sangre y ZIP de taller.

### Carrito, checkout, pagos y logística ([`domains/checkout-payments-shipping.md`](domains/checkout-payments-shipping.md))

- Carrito auto-sanado (`ADR-171`), checkout de tres pasos (`ADR-155`), direcciones DANE + CP MinTIC (171 ciudades) y modo regalo sin precios en guía/correos.
- Fletes HMAC por peso, ledger Wompi por intento, webhook con ventana de 25 h, COD con blocklist y conciliación, CSV contable DIAN con PII redactada y decremento atómico de stock post-pago.
- Aveonline con PDF y `ShipmentEvent`; etiquetas autenticadas/auditadas; segregación Taller/Alistamiento, confidencialidad COP, costeo BOM y cupones personales no transferibles.

### CRM 360, B2B, posventa y operación ([`domains/crm-b2b-and-loyalty.md`](domains/crm-b2b-and-loyalty.md), [`domains/post-sale-and-support.md`](domains/post-sale-and-support.md))

- Grafo `Contact` con aislamiento de staff, detección `selfDealing` y fusión humana asistida; `/admin/hoy`, tareas, RFM/LTV y cierre B2B de punta a punta (`ADR-210`: configurador `/empresas-y-eventos` desde 25 pzas., propuestas versionadas con margen BOM y muestra digital en `/propuesta/[token]`, conversión a `Order` por Wompi o Pago Directo Bre-B/transferencia verificado con MFA + retenciones, y carga de arte 300 DPI en taller).
- Puntos Lucams con tope ≤25 %, retrocrédito y reversión (excluidos en propuestas B2B); referidos por `/r/[codigo]`. Posventa invitado con token + correo, retractos y garantías con reembolso final `SUPERADMIN` + MFA; soporte PQR con SLA e IA 0-PII.
- Vigilancia fiscal diaria (`ADR-196`) sobre umbrales DIAN de 3.500 UVT (incluyendo Wompi y `DIRECT_TRANSFER`), proyección anual y alertas 70/90/100 %.
- Panel con 8 roles × 38 capacidades, deny-by-default, MFA `aal2`, step-up en acciones sensibles, inactividad de 30 min, PII redactada en servidor, auditoría y confirmaciones destructivas.
- Centro de ayuda con 43 guías y ocho recorridos (`ADR-197`); Lifecycle y Marketing respetan Ley 1581, supresión por rebote/queja y `DRY_RUN` en STG (`ADR-198`).
- 33 plantillas React Email + 2 Auth OTP; fechas `America/Bogota`; GA4 y UTM bajo consentimiento; backups diarios y DR mensual.

## Pendientes abiertos reales

### Negocio y operación externa

1. **Facturación electrónica DIAN:** faltan NIT/RUT de facturador, acompañamiento contador/abogado y proveedor tecnológico; `BILLING_DOCUMENT_ENABLED = false`. La vigilancia de umbrales ya opera.
2. **SEO post-indexación:** revisar Search Console y confirmar aprobación del feed en Merchant Center.
3. **Núcleo omnicanal de stock (`ADR-208`):** activo (`MADE_TO_ORDER` vs `PHYSICAL_STOCK`, `publishedOnStorefront`, `safetyStock` y kardex por canal); tras desplegar en STG/PRD resta normalizar a `0` el stock legado de `MADE_TO_ORDER` y retirar `MADE_TO_ORDER_STOCK` del seed.
4. **Mercado Libre (`ADR-205`):** arquitectura en pausa en [`integrations/mercadolibre.md`](integrations/mercadolibre.md) (solo `PHYSICAL_STOCK`, `ChannelPack`/`ChannelOrder`, precios `FORMULA`/`MANUAL`, `ME2` + Flex Bogotá). Pendiente habilitación de App en DevCenter `MCO`.
5. **Meta (`ADR-207`):** arquitectura en pausa en [`integrations/meta.md`](integrations/meta.md) (`Meta Catalog` `PHYSICAL_STOCK`, `System User` `v25.0`, Pixel + CAPI deduplicados con `MetaOrderAttribution` y ajuste previo Ley 1581). Pendiente Fase M0.

### Higiene técnica diferida (no bloqueante)

1. Observar consumo mensual de GitHub Actions antes de cambiar CI; alternativas en [`integrations/github-and-ops.md`](integrations/github-and-ops.md) § 7.
2. Regenerar códigos MFA antiguos para retirar el fallback legacy SHA-256.
3. Leaked Password Protection nativo está activo en PRD; HIBP k-anonymity permanece como segunda capa.
4. Evaluar unificación de previews (`ADR-118`), conexión de `texture-resolution.ts`, filtros de categoría en `/api/catalog/filters` y vectores SVG de marca.
5. Extender el DR drill a `auth.users` y ajustes del proyecto Supabase, además de DB + Storage.
