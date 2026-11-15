# Estado Actual del Proyecto — Lucams Shop

> **Documento vivo de Nivel 0 (≤ 10 KB).** Resume operación, homologación y pendientes vigentes. Mapa completo en [`docs/README.md`](README.md).

## Fotografía ejecutiva

- **Tienda:** `lucamsshop.com` opera exclusivamente en modo **`full`** (`ADR-204`) con Wompi, contraentrega, Aveonline y Envío Lucams Bogotá. Las compras individuales cierran como pedidos y las negociaciones de empresas/eventos siguen como oportunidades B2B; no existe cotización individual por WhatsApp.
- **Base técnica:** monorepo `pnpm` con `apps/web` (Next.js **16.4.6**, TS strict, Tailwind v4, shadcn/ui) y `packages/db` (**75 modelos Prisma**, **32 enums**, **98 migraciones Prisma** + **59 SQL Supabase**). RLS cubre el dominio y `enforce_rls_on_new_table` fija `search_path` vacío e identificadores `%I.%I`.
- **Ramas protegidas (`ADR-105`):** `develop` (STG) y `production` (PRD) exigen PR y cinco checks: `Typecheck + Lint + Build`, `Vitest`, `RLS behavior`, `E2E + a11y + Lighthouse — Playwright` y `Gitleaks secret scan`.
- **Legal:** paquete **Versión 3** sincronizado en `packages/db/legal-content`, fallbacks, mapa y CMS de STG/PRD; historial intacto.

## Ambientes y homologación STG ↔ PRD

| Ambiente  | Infraestructura                                                      | Estado                                                                                                     |
| --------- | -------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| **LOCAL** | Supabase en Podman (`:54321`/`:54322`/`:54324`) + Next dev (`:4000`) | `full` homologado (`ADR-203`); seed local idempotente; 3 crons SQL; túnel ngrok opcional con autenticación |
| **STG**   | `develop` → Vercel Preview + Supabase STG                            | Operativo; aloja `uptime-monitor-prd` (12 jobs); reset con `make stg-reset`                                |
| **PRD**   | `production` → Vercel Pro (`iad1`) + Supabase PRD                    | `full`; 17 jobs `pg_cron`; backups diarios GPG de DB + Storage en R2                                       |

### Excepciones deliberadas (`ADR-099`, `ADR-121`, `ADR-126`, `ADR-203`)

- Migraciones, categorías (84 por ambiente), ocasiones, redirects y **168/168 campos CMS** están homologados. El catálogo activo de referencia contiene los 8 productos originales de PRD + `bola-navidena-personalizada` (9); el resto permanece pausado fuera de PRD.
- PRD conserva el catálogo vigente e históricos archivados (13 productos); STG/LOCAL conservan además el catálogo pausado (54). Plantillas y tramos de `mini-libros-magneticos` existen solo en STG/LOCAL; PRD mantiene nueve galerías archivadas de separadores como auditoría.
- `nombre-personalizado` está archivado en PRD; `set-fotoimanes-circulares` y `set-fotoimanes-corazon`, en los tres ambientes. Cuadrados tiene 12 variantes `-NOMAG` inactivas. El stock real nunca se sincroniza.
- `uptime-monitor-prd` y sus tablas viven solo en STG. Los cinco crons de correo existen en STG/PRD; STG fuerza `CRON_JOBS_DISABLED`, recuperación manual y Lifecycle `DRY_RUN`. `AVEONLINE_WEBHOOK_SECRET` solo está en PRD; `VERCEL_BYPASS_TOKEN`, solo en STG.
- `pg_net` difiere por versión gestionada de Supabase sin impacto funcional. El cupón de prueba `LOCURA` existe solo en STG.

## Capacidades operativas

### Catálogo, SEO y CMS v2 ([`domains/catalog-and-cms.md`](domains/catalog-and-cms.md))

- Categorías padre/hija, facetas configurables, producto insignia, 16 ocasiones, búsqueda difusa, PDP con escalas mayoristas y zoom, 404 real sobre slugs cacheados, feed Google Merchant y APIs `/api/catalog|cms`.
- **CMS v2 (`ADR-187`):** 9 contenedores, 30 secciones y 168 campos (105 `BLOCK` + 63 `SETTING`), paridad AST en CI, versionado append-only, publicación programada y tokens legales dinámicos.
- `/admin/mayorista`: lectura para `SUPERADMIN`, `OPERATIONS_MANAGER`, `MANAGER` y `FINANCE_ANALYST`; escritura para los tres primeros. El bloque «Ahorra llevando más» usa solo ahorro real por volumen.

### Estudio 2D/3D y producción 300 DPI ([`domains/studio-and-production.md`](domains/studio-and-production.md))

- Konva multi-unidad (`ADR-167`/`173`), derivados WebP, lazy-mount, auto-fill, galería, letras e IA. Diez escenas 3D, filtrado `-NOMAG` y reverso de marca (`ADR-190`).
- Tiras photobooth compuestas para imprenta, previews de packs en grilla, réplica entre unidades y curva de volumen en packs. Portada admite popup tras consentimiento, logo estacional, nieve con movimiento reducido y CTA B2B.
- **Bola Navideña (`ADR-199`/`201`):** activa en los tres ambientes; inserto plano dúplex de 8 cm en una esfera, cara B obligatoria, máximo 25 unidades. Variantes sin/con imán a $10.000/$11.000 COP; promociones 3 × $27.000 y 5 × $40.000.
- **Mini Libros (`ADR-200`):** carátulas 7,1 × 5 y 5 × 2,5 cm, lomo 0,5 cm, con/sin imán; inactivos fuera del catálogo de referencia. Incluyen plantilla asistida «Reino de cristal» y visor 3D con portada, lomo, contraportada y carátula extendida.
- Auto-save serial con `clientRev` y `STALE_REVISION`; recuperación de borradores; previews privados por `/api/design-preview/*`; `RenderJob` 300 DPI a sangre y ZIP de taller.

### Carrito, checkout, pagos y logística ([`domains/checkout-payments-shipping.md`](domains/checkout-payments-shipping.md))

- Carrito auto-sanado (`ADR-171`), checkout de tres pasos (`ADR-155`), direcciones DANE + CP MinTIC (171 ciudades) y modo regalo sin precios en guía/correos.
- Fletes HMAC por peso, ledger Wompi por intento, webhook con ventana de 25 h, COD con blocklist y conciliación, CSV contable DIAN con PII redactada y decremento atómico de stock post-pago.
- Aveonline con PDF y `ShipmentEvent`; etiquetas autenticadas/auditadas; segregación Taller/Alistamiento, confidencialidad COP, costeo BOM y cupones personales no transferibles.

### CRM 360, B2B, posventa y operación ([`domains/crm-b2b-and-loyalty.md`](domains/crm-b2b-and-loyalty.md), [`domains/post-sale-and-support.md`](domains/post-sale-and-support.md))

- Grafo `Contact` con aislamiento de staff, detección `selfDealing` y fusión humana asistida; `/admin/hoy`, tareas, RFM/LTV y embudo B2B `Opportunity` → pedido.
- Puntos Lucams con tope ≤25 %, retrocrédito y reversión; referidos por `/r/[codigo]`. Posventa invitado con token + correo, retractos y garantías con reembolso final `SUPERADMIN` + MFA; soporte PQR con SLA e IA 0-PII.
- Vigilancia fiscal diaria (`ADR-196`) sobre umbrales DIAN de 3.500 UVT, proyección anual y alertas 70/90/100 %.
- Panel con 8 roles × 36 capacidades, deny-by-default, MFA `aal2`, step-up en acciones sensibles, inactividad de 30 min, PII redactada en servidor, auditoría y confirmaciones destructivas.
- Centro de ayuda con 43 guías y ocho recorridos (`ADR-197`); Lifecycle y Marketing respetan Ley 1581, supresión por rebote/queja y `DRY_RUN` en STG (`ADR-198`).
- 31 plantillas React Email + 2 Auth OTP; fechas `America/Bogota`; GA4 y UTM bajo consentimiento; backups diarios y DR mensual.

## Pendientes abiertos reales

### Negocio y operación externa

1. **Facturación electrónica DIAN:** faltan NIT/RUT de facturador, acompañamiento contador/abogado y proveedor tecnológico; `BILLING_DOCUMENT_ENABLED = false`. La vigilancia de umbrales ya opera.
2. **SEO post-indexación:** revisar Search Console y confirmar aprobación del feed en Merchant Center.

### Higiene técnica diferida (no bloqueante)

1. Observar consumo mensual de GitHub Actions antes de cambiar CI; alternativas en [`integrations/github-and-ops.md`](integrations/github-and-ops.md) § 7.
2. Regenerar códigos MFA antiguos para retirar el fallback legacy SHA-256.
3. Leaked Password Protection nativo está activo en PRD; HIBP k-anonymity permanece como segunda capa.
4. Evaluar unificación de previews (`ADR-118`), conexión de `texture-resolution.ts`, filtros de categoría en `/api/catalog/filters` y vectores SVG de marca.
5. Extender el DR drill a `auth.users` y ajustes del proyecto Supabase, además de DB + Storage.
