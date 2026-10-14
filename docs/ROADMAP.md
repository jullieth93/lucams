# Roadmap — Lucams Shop

> **Documento vivo** (fusiona los antiguos `PLAN.md`, `ROADMAP.md` y `CMS_ROADMAP.md`): visión y alcance, estado de las fases (una línea por fase completada) y el futuro en bullets. Sin checklists históricos ni bitácora — la historia vive en git. El estado operativo del día a día está en [`STATE.md`](STATE.md); el "por qué" de las decisiones, en [`DECISIONS.md`](DECISIONS.md).

## Visión y alcance

**Lucams Shop** es un e-commerce colombiano de productos magnéticos personalizados. Referencia funcional: magneticas.cl, con mandato de **superarla**, no copiarla. Mandatos no negociables: **no es MVP** (nace 100 % productivo), stack fijo (Next.js 16 + TS + Tailwind v4 + shadcn/ui, monorepo pnpm, Supabase, Vercel), Wompi + Aveonline, WhatsApp solo `wa.me`, sin Sentry (mandatos completos en `CLAUDE.md`).

**Diferenciadores ya operativos:** Estudio de personalización en vivo (Konva) con vistas 3D y asistente IA (Gemini), pagos múltiples (Wompi + COD), envío propio Bogotá además de Aveonline, programa de fidelidad (Puntos Lucams) y referidos, reseñas con moderación, recuperación de carrito abandonado administrable desde el panel (`/admin/carritos`, ADR-153), CMS total administrable por no-técnicos.

**Diferenciadores aún sin construir:** Bundle Creator, portal mayorista B2B público, blog/SEO, realtime inventory, PWA, multi-idioma, A/B testing.

## Stack y costos

| Capa                | Servicio   | Dev     | Producción | Costo prod USD/mes                                                |
| ------------------- | ---------- | ------- | ---------- | ----------------------------------------------------------------- |
| App                 | Vercel     | Hobby   | **Pro**    | $20 (obligatorio: Hobby prohíbe uso comercial)                    |
| DB + Auth + Storage | Supabase   | Free    | Free hoy   | $0 (Pro $25 cuando haga falta PITR)                               |
| Email               | Resend     | Free    | Free hoy   | $0 (Pro $20 si el volumen lo exige)                               |
| DNS + CDN           | Cloudflare | Free    | Free       | $0                                                                |
| Dominio             | mi.com.co  | —       | activo     | ~$3-5                                                             |
| Pasarela            | Wompi      | sandbox | producción | 2.65 % + $700 + IVA por trx (plan Avanzado mensual) + retenciones |
| Logística           | Aveonline  | sandbox | producción | costo de envío (0 % comisión)                                     |

Hitos de upgrade: Supabase Pro cuando se necesite PITR o se supere la cuota Free (la cuota de Storage se vigila en `/admin/observability`); Resend Pro si se superan 3k emails/mes; monitoreo de errores externo (ADR-022) si el volumen lo justifica.

## Estado de las fases (completadas)

- **0a/0b — Documentación y cuentas:** ✅
- **1 — Base sólida:** ✅ monorepo, Next.js 16, Prisma, Auth + RLS, CI/CD con gates (lint/typecheck/tests/RLS/gitleaks/Lighthouse).
- **2 — Catálogo y carrito:** ✅ storefront completo + admin del catálogo.
- **3 — Estudio de personalización:** ✅ canvas por tipo de producto, 3D, compartir, plantillas, render de producción asíncrono (RenderJob), watermark anti-copia.
- **4 — Checkout, pagos y logística:** ✅ certificada (Wompi + COD + Aveonline + saga + reconciliación + emails).
- **5 — Marketing (parcial):** cupones, referidos, recuperación de carrito, Puntos Lucams ✅; el resto queda en «Futuro».
- **6 — Backoffice:** ✅ construido y en operación (pedidos, inventario, clientes 360, moderación, garantías/retractos, soporte, dashboards, auditoría, MFA). Falta solo la parte B2B pública.
- **7 — Pulido productivo y lanzamiento:** ✅ lanzado — `lucamsshop.com` vende en modo `full` desde 2026-09-03 (ADR-077); auditorías OWASP/360°/release cerradas (certificación CERTIFIED con PR obligatorio a `production`, ADR-105).
- **CMS total:** ✅ roadmap CMS v2 completado (20/20 + backlog): el 100 % del contenido visible es administrable y el CMS crece vía site map (`make migrate-cms-v2`), sin roadmap aparte.

## Futuro (sin orden de prioridad; cada ítem se agenda por decisión del owner)

**Legal/fiscal (bloquea la formalización, no la operación):**

- Trámites DIAN/NIT + revisión de abogado de los 8 documentos legales (ADR-020) — ver `STATE.md` § Pendientes.
- Integración DIAN: adaptador `InvoiceProvider` (patrón `PaymentProvider`), resolución de numeración, flujo `Order.PAID → Invoice` con saga + retry, notas crédito para reembolsos, IVA/retenciones B2B.

**Producto:**

- Portal mayorista `/mayorista` público (hoy solo existe la gestión admin de tiers): flag `isWholesale`, listas de precios, cotización con PDF.
- Bundle Creator (arma tu cajita con descuento progresivo).
- Blog con MDX (`BlogPost` persiste en el schema como FUTURO_APROBADO) para SEO local.
- ADR-118: unificar el preview del cliente con el renderer de producción server-side (propuesta registrada).
- Palanca de marketing sobre wishlist (diferida por cumplimiento — ADR-098).
- Oferta «Sin imán» (gemelas `-NOMAG`) en PRD, si el owner lo decide (ADR-099).

**Plataforma:**

- Monitoreo de errores externo (ADR-022, decisión pendiente; hoy la captura propia en DB + alertas cubre).
- Pen test externo (proveedor + alcance) como complemento de las auditorías internas ya hechas.
- Email lifecycle marketing (welcome series, recompra 30/60/90) + `List-Unsubscribe` en emails de marketing.
- Feature flags/A-B testing básico (ADR-026 ya tiene la tabla; falta operación).
- PWA instalable, realtime inventory, multi-idioma (es-CO base preparada).
- Lighthouse ≥ 95 en todas las páginas críticas (gate móvil ya en CI; hoy los hotspots conocidos son el init del Estudio y el peso de la home).
