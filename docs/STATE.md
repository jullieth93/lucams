# Estado del proyecto — Lucams Shop

> **Documento vivo.** Describe el estado ACTUAL: qué existe, qué corre y qué falta. Sin bitácora de sesiones ni fechas de oleadas — esa historia vive en git (`git log -- docs/STATE.md`). Al cerrar una sesión con cambios, se actualiza el contenido EN EL SITIO (política de documentación de `CLAUDE.md`).

## Qué es hoy

**Lucams Shop** (`lucamsshop.com`): e-commerce colombiano de productos magnéticos personalizados (fotoimanes, separadores, calendarios, tiras, letras/abecedario). **En producción y vendiendo en modo `full`** (`NEXT_PUBLIC_STORE_MODE=full` — ADR-077): pagos reales con Wompi + contraentrega (COD), envíos con Aveonline + «Envío Lucams» propio en Bogotá. Monorepo pnpm: `apps/web` (Next.js 16 + TS + Tailwind v4 + shadcn/ui) y `packages/db` (Prisma + Supabase). Despliegue en Vercel (`develop` → previews/STG, `production` → PRD vía PR con 8 required checks — ADR-105).

## Módulos y features operativos

**Storefront / catálogo**

- Catálogo con categorías jerárquicas, sub-categorías, ocasiones (tags transversales), mega-menú, buscador, recomendador y filtros; API pública `/api/catalog/*` + `/api/cms/*` + `/api/coupons/public` versionada y RAG-ready (ADR-038/093).
- PDP con precio vivo por variante, tachado promocional con reflejo total, badge «Solo quedan N», precios por volumen (`WholesaleTier`) públicos en carrito/checkout (ADR-124).
- Carrito anónimo/registrado con dedupe, «Ver» paginado por unidad, miniatura = primera página, retención: idle 60 d, vacíos 7 d, `AbandonedCart` 90 d (ADR-143).
- CMS v2 completo (`CmsPage→Section→Field→Version` + `CmsListItem` + mediateca): el 100 % del contenido visible es administrable desde `/admin/contenido` vía site map (`make migrate-cms-v2`); edición in-place en el storefront; banners, FAQs, textos legales, copy de auth/checkout/mi-cuenta, logo del sitio (`site.logo`).
- Wishlist (`/mi-cuenta/favoritos`), reseñas con moderación + token firmado de un solo uso en email de entrega (ADR-111), newsletter, cupones, referidos con short-link `/r/<codigo>` y cupón de bienvenida (referidos v2, ADR-127).

**Estudio de personalización (diferenciador #1)**

- Konva + vistas 3D (three.js) por tipo de producto (ADR-035/057): fotoimanes Polaroid/Instagram y Cuadrados (packs de 6), separadores (incl. libro 3D multi-unidad), calendario con grilla real horneada, tiras, letras/abecedario/vocales, nombre personalizado.
- Plantilla unificada adaptativa (dimensionado por ancho, tarjeta-unidad universal — ADR-103/104), recover robusto por `assetId`, snapshot local reconciliado por `clientRev` (ADR-133) + `sendBeacon` como mejor esfuerzo (ADR-129), marcador «Continuar donde quedaste».
- Cara B vacía = EN BLANCO en 3D/preview/producción (ADR-128, supersede ADR-114).
- Asistente IA con Gemini vía adaptador `AiProvider` (ADR-058).
- Uploads con compresión WebP obligatoria: presupuesto 4 MB con piso 300 DPI, HEIC fail-closed (ADR-142).

**Render de producción (imprenta)**

- **Asíncrono (ADR-136):** tabla `RenderJob`, kick de 8 s en el finalize, worker por cron `lucams-process-render-jobs` (cada minuto, migración supabase **041**), progreso real en UI vía `/api/designs/<id>/render-status`; el ZIP de admin responde 409 mientras el render vive.
- Los PNG 300 DPI los renderiza el servidor (3 tiers), no el navegador (ADR-081). Watermark anti-copia tiling LUCAMS en TODAS las vistas servidas (carrito, Mis diseños, /d + OG, cotización, gracias, pedido); canvas/3D/admin/producción limpios (ADR-148).
- Mis diseños: thumbnails de borrador (`draftPreviewUrl`), CTA «Editar» para READY, badges de estado (ADR-147).

**Checkout / pagos / envíos**

- Checkout en pasos (datos → envío → pago) con sello HMAC de la oferta y re-validación server-side; localidad como dato de dirección (catálogo DANE, 20 en Bogotá), barrio opcional, CP real, PhoneInput con indicativo, validadores colombianos (NIT con DV) (ADR-108/146).
- Wompi con **referencia por intento** (`paymentAttempt` + sufijo `-N`, ventana de reuso de 3 min, bloqueo ante APPROVED/PENDING — ADR-137); reconciliación con flag `needsReconciliation` y cierre de la carrera TOCTOU (ADR-109). Fallback `/checkout/gracias` sin auth con riesgo aceptado y mitigaciones (ADR-094).
- COD (contraentrega) con anti-abuso por identidad y ledger de conciliación `/admin/conciliacion` (ADR-055/064/065).
- Aveonline (cotización + guías + webhook de tracking; guías archivadas en Storage propio con `Order.labelPath`) + «Envío Lucams» propio Bogotá por localidades (tarifa fija, cutoff 12:00, sin guía Aveonline — ADR-107). Regla única de promesa de entrega `lib/delivery-estimate.ts`.
- Flujo regalo nativo (destinatario, mensaje, guía al destinatario, emails sin precios) y pedido vinculado al email de contacto, no a la sesión (ADR-127).

**Fidelización**

- «Invita y gana» configurable desde `/admin/fidelizacion` y **Puntos Lucams**: 1 pt/$1.000, 100 pts = $1.000, orden cupón→puntos, reserva atómica en `createOrderFromCart`, restauración en CANCELLED/REFUNDED, UI en mi-cuenta (ADR-145).

**Admin (RBAC: SUPERADMIN/MANAGER/FULFILLMENT/CMS_EDITOR, MFA TOTP enforceado + step-up aal2 en acciones destructivas)**

- Pedidos (transiciones, guía, reintento), inventario con razón, clientes 360, moderación de reseñas/diseños, cupones con edición/archivo, garantías+reclamos fusionados (ADR-110), retractos, soporte end-to-end con email (bandeja en `/mi-cuenta` diferida — ADR-092), cotizaciones, diseños prediseñados (variantFilter, watermark, eliminar permanente), papelera de productos con borrado permanente (ADR-134), contenido CMS, fidelización, observability (errores, webhooks, crons, SLOs, RUM con p75/LONGTASK/PAGEWEIGHT — ADR-135), performance, auditoría (`AdminActionLog`).

**Infra / operación**

- Crons `pg_cron + pg_net → /api/cron/*` con secreto en Vault (9 HTTP + 1 SQL + `lucams-process-render-jobs`); dead-man switch por latidos en `AlertState`; alertas por email con dedup.
- Monitor de uptime externo: job pg_cron en Supabase STG que sondea PRD y reporta a `/api/cron/monitor-heartbeat` (OPERATIONS § Plan de monitoreo).
- Backups diarios DB + Storage a Cloudflare R2 cifrados (gpg), con heartbeat `backup_stale` (>36 h) y DR drill mensual automatizado que exige dump fresco.
- Rate limit en Postgres (`rate_limit_check`), cache con `unstable_cache` (tags `cms`, `catalog`, `redirects`); pool Prisma por lambda 5 conexiones/20 s + retry transitorio (ADR-131).
- RLS en toda tabla (58/58, gate en CI), Turnstile en checkout/registro/reseña, headers CSP con nonce, gitleaks pre-commit + CI + GitHub Push Protection.

## Ambientes

| Ambiente  | Qué es                                                            | Estado                                                                                                                                                                   |
| --------- | ----------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **LOCAL** | Supabase local en podman (espejo nube) + `make web-start` (:4000) | Operativo; superset del catálogo para desarrollo                                                                                                                         |
| **STG**   | Preview Vercel de `develop` + proyecto Supabase STG               | Operativo; referencia curada de contenido; hospeda el uptime-monitor; jobs de email desagendados a propósito; previews bajo Vercel SSO (crons/webhooks con bypass token) |
| **PRD**   | `lucamsshop.com` (rama `production`) + Supabase PRD               | **Vendiendo en modo `full`**; homologado con STG (excepciones deliberadas ADR-121); último paquete (ADR-136…149) implementado y testeado, **pendiente de deploy**        |

Reglas vigentes: PRD es la fuente de verdad comercial del catálogo (ADR-099); sincronización STG→PRD con los scripts reusables de clave natural (ADR-126); homologación verificable con `scripts/diag-stg/homologacion.sh`.

## Pendientes

**Bloqueantes de negocio (no técnicos):**

1. **Trámites de facturación electrónica:** NIT, abogado/contador, DIAN. Los pagos ya operan; esto habilita la facturación formal.

**Operativos inmediatos:** 2. **Promover a PRD el paquete en `develop`** (render asíncrono, Wompi por intento, Puntos Lucams, watermark, higiene de Storage — ADR-136…149) y **aplicar la migración supabase `041` en PRD solo DESPUÉS del deploy** del endpoint `/api/cron/process-render-jobs` (ver OPERATIONS § Render asíncrono). 3. Masters prediseñados: **no requiere acción** — verificado 2026-10-13: los 178 prediseños activos son de separadores (≤15 cm → 2000 px ≈ 318 DPI, suficiente); el print-grade 4000 px (ADR-142) aplica a subidas futuras (p.ej. si algún día hay prediseños de tiras de 26,5 cm). 4. **Logo oficial de Transprensa** (carrier): hoy hay placeholder con warning (ADR-144). 5. **Publicar las claves CMS nuevas** si se quieren overrides de los textos introducidos en la última jornada (sin publicar, sirven los fallbacks).

**Decisiones del owner aplazadas:** 6. Cupón `LOCURA` (30 %, activo) existe solo en STG: ¿llevarlo a PRD o era de prueba? 7. `Category.visibleFilters` / `featuredProductSlug`: sin consumidor real — implementar en la UI pública o retirar del payload. 8. Oferta «Sin imán» (gemelas `-NOMAG`): vive en LOCAL/STG como banco de validación; decidir si llega a PRD (ADR-099).

**Higiene técnica diferida:** 9. Regenerar recovery codes de los admins y retirar el fallback legacy SHA-256 (`features/admin-mfa/recovery-codes.ts`, TODO marcado). 10. Activar Leaked Password Protection en Supabase Auth al pasar el proyecto a plan pago (cubierto mientras tanto por el HIBP propio de la app). 11. ADR-118 (propuesta registrada, no implementada): unificar el preview del cliente con el renderer de producción server-side. 12. Backup Storage a R2: ACTIVO y verificado (secrets `BACKUP_SUPABASE_*` creados; run 38418418178 del 2026-10-13 con `HAS_STORAGE=true`). Pendiente menor: no hay restore validado de `auth.users` ni de la config del proyecto Supabase. 13. Vigilancia Supavisor 2×/día y medición de LCP p75 móvil PRD programadas hasta el 2026-10-16 (tema banner-cookies; bitácora en `tmp/diag-20261008/`).
