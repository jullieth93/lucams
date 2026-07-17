# Plan: Lucams_shop — E-commerce productivo (no MVP) que supera a magneticas.cl

> **Fuente de verdad canónica.** Cualquier cambio de rumbo se refleja primero aquí, luego en los demás `.md` del proyecto.
>
> **🔄 Refresh 2026-06-27.** Este plan se actualizó para corregir desfases con la realidad del
> código: **stack = Next.js 16** (no 15), **logística = Aveonline** (Venndelo queda como Plan B,
> ver [ADR-039](DECISIONS.md)). El avance real por fase vive en [`STATE.md`](STATE.md) +
> [`ROADMAP.md`](ROADMAP.md) (refrescado el mismo día): a hoy, el **checkout/pagos está certificado
> (Bloque A, 48 tests)**, compliance básico hecho, y el admin del catálogo restructurado y pulido.
> Pendiente pre-launch: Seguridad (C), Observabilidad (D), Testing (E), Refund/Cupones (F).

## Context

**Lucams_shop** es un e-commerce colombiano de productos magnéticos personalizados. Hoy solo existe en Instagram ([@lucams_shop](https://www.instagram.com/lucams_shop)) y Linktree ([linktr.ee/Lucams_shop](https://linktr.ee/Lucams_shop)). Toma como referencia funcional a [magneticas.cl](https://www.magneticas.cl) (Chile) pero el mandato es **superarla en valor agregado**, no copiarla.

**Mandatos del usuario (no negociables):**

- **No es MVP**. El sitio debe nacer 100% productivo, listo para vender desde el día 1.
- **Free durante todo el desarrollo**, upgrade a Pro únicamente al lanzar a producción.
- Datos en **Supabase** y su ecosistema (Auth, Storage, Realtime, Edge Functions).
- Stack: **Next.js 16 (App Router) + TypeScript + Tailwind v4 + shadcn/ui**.
- Despliegue en **Vercel** (decisión justificada abajo).
- Pasarela: **Wompi** (en gestión por el usuario).
- Logística: **Aveonline** (Coordinadora + contraentrega + API pública). _Venndelo = Plan B (ADR-039)._
- Dominio: `lucamsshop.co` registrado en **mi.com.co** (al lanzar).

---

## Vercel vs Render — decisión: **Vercel**

| Criterio            | Vercel                        | Render                                            |
| ------------------- | ----------------------------- | ------------------------------------------------- |
| Soporte Next.js     | Nativo (lo construyen ellos)  | Genérico                                          |
| ISR / Edge runtime  | Sí, automático                | Manual / limitado                                 |
| Image Optimization  | Integrada                     | No                                                |
| Preview deployments | Automáticos por PR            | Sí pero más lento                                 |
| Costo Pro           | $20/mes/miembro               | Web Service $7 + DB $7 = $14/mes                  |
| Mejor para          | Apps Next.js con SSR/ISR/edge | Backends largos, workers, websockets persistentes |

Render es excelente para apps Rails/Django o servicios con estado en memoria. **Para un Next.js + Supabase + Wompi como este, Vercel es la elección obvia**: ISR para revalidar páginas de producto cuando cambia stock o precio, Edge Functions de baja latencia para webhooks de Wompi/Aveonline, integración 1-clic con Supabase, y la mejor DX del mercado.

---

## Stack: Free durante dev → Pro al lanzar

| Capa                | Servicio               | Tier en **desarrollo**                   | Tier en **producción**               | Costo dev | Costo prod USD/mes                                             |
| ------------------- | ---------------------- | ---------------------------------------- | ------------------------------------ | --------- | -------------------------------------------------------------- |
| App                 | **Vercel**             | Hobby (Free)                             | Pro                                  | $0        | $20                                                            |
| DB + Auth + Storage | **Supabase**           | Free                                     | Pro                                  | $0        | $25                                                            |
| Email transaccional | **Resend**             | Free (3k emails/mes, dominio resend.dev) | Pro (50k emails/mes, dominio propio) | $0        | $20                                                            |
| WhatsApp            | `wa.me` link (sin API) | —                                        | —                                    | $0        | $0                                                             |
| DNS + CDN           | **Cloudflare**         | Free                                     | Free                                 | $0        | $0                                                             |
| Dominio             | `lucamsshop.co`        | — (`*.vercel.app`)                       | **mi.com.co**                        | $0        | ~$3-5 (~$50.000 COP/año)                                       |
| Pasarela            | **Wompi**              | Sandbox                                  | Producción                           | $0        | 2.65% + $700 + IVA por trx (plan Avanzado, frecuencia mensual) |
| Logística           | **Aveonline**          | Sandbox                                  | Producción                           | $0        | Costo de envío (0% comisión)                                   |
| Monitoreo errores   | _Fuera del plan_       | —                                        | —                                    | $0        | $0                                                             |

**Costo durante desarrollo: $0/mes.**
**Costo al pasar a producción: ~$68 USD/mes (~$272.000 COP/mes)** + comisiones variables.

> **Nota sobre comisiones Wompi (verificado: [wompi.com/es/co/planes-tarifas](https://wompi.com/es/co/planes-tarifas/) a 2026-05-09):** la estructura `2.65% + $700 + IVA` aplica al plan Avanzado con frecuencia de liquidación mensual. Frecuencias semanal y diaria suben a 2.75% / 2.85%. Adicional ([soporte Wompi — cobros adicionales](https://soporte.wompi.co/hc/es-419/articles/360042471394)): el comerciante también enfrenta retenciones gubernamentales 1.5% renta + 0.2% ICA + 15% IVA-retención sobre la comisión cobrada. Ver ADR-004 para razones de elegir Wompi sobre Mercado Pago.

### Limitaciones a tener en cuenta en Free (no son bloqueantes)

- **Vercel Hobby:** sin Web Analytics ni Speed Insights, function timeout 60s, 100 GB bandwidth/mes. La ToS no permite uso comercial — al recibir el primer pago real migramos a Pro.
- **Supabase Free:** 500 MB DB, 1 GB storage, 50k MAU auth. **El proyecto se pausa tras 1 semana de inactividad**.
- **Resend Free:** 3.000 emails/mes, 100/día, solo subdominio `resend.dev`.
- **Sin Sentry/monitoreo:** durante dev usamos `console.error` + Vercel logs. Antes del lanzamiento se decide alternativa gratuita y se documenta en `OPERATIONS.md`.

### Hitos de upgrade

| Trigger                                         | Servicio a migrar                             |
| ----------------------------------------------- | --------------------------------------------- |
| Primera transacción real (sandbox → prod Wompi) | Vercel → Pro, Supabase → Pro                  |
| Verificación de dominio para email              | Resend → Pro, configurar `mail.lucamsshop.co` |
| Compra del dominio                              | mi.com.co (`lucamsshop.co`)                   |
| Volumen >1k visitas/día                         | Evaluar monitoreo (Sentry Free u otro)        |

---

## Branding Lucams_shop

**Logo:** insignia circular con mascota mapache estilo kawaii sobre fondo morado lavanda; tipografía "LUCAMS" estilo bubble multicolor; "SHOP" en pequeño debajo; corazones amarillos como acento.

**Paleta (design tokens):**

| Token                     | HEX       | Uso                                          |
| ------------------------- | --------- | -------------------------------------------- |
| `brand-purple` (primario) | `#7C6AAD` | Fondos destacados, header, botones primarios |
| `brand-purple-dark`       | `#3D2E5C` | Texto principal, headings                    |
| `brand-turquoise`         | `#5DD9D1` | Acento, badges "nuevo", links                |
| `brand-pink`              | `#E85B9F` | CTAs secundarias, precios en oferta          |
| `brand-coral`             | `#F58A6F` | Acentos cálidos, banners                     |
| `brand-yellow`            | `#FFD93D` | Highlights, corazones, badges envío gratis   |
| `brand-cream`             | `#FFF8F0` | Fondos suaves alternativos                   |
| `neutral-white`           | `#FFFFFF` | Fondos principales                           |

**Tono de diseño:** kawaii, lúdico, cercano, familiar — opuesto al minimalismo blanco de magneticas.cl.

**Mascota mapache** (recurrente): loader, estado vacío del carrito, página 404, badges del programa de fidelidad, emails, empty states del estudio de personalización.

**Tipografía sugerida:** `Fredoka` o `Baloo 2` (display) + `Inter` o `Nunito` (cuerpo).

> Detalles completos en [`BRANDING.md`](./BRANDING.md).

---

## Diferenciadores fuertes vs. magneticas.cl

Magneticas.cl es un Shopify/Jumpseller estándar. Lucams_shop debe nacer con features que ellos no tienen:

1. **Estudio de Personalización en vivo** (react-konva) — editor canvas con plantillas, fotos, texto, fondos, en tiempo real. Guarda JSON del diseño + PNG alta resolución para producción. **Diferenciador #1.**
2. **Vista previa 3D en nevera** (Three.js) — el imán renderizado sobre nevera 3D rotable.
3. **Asistente IA de diseño** (Claude API) — sugiere plantillas según ocasión + paleta.
4. **Pagos múltiples** — Wompi (tarjeta + PSE + Nequi + Bancolombia) + contraentrega Aveonline.
5. **WhatsApp `wa.me`** con mensaje pre-armado contextual (sin Twilio API por ahora).
6. **Programa de fidelidad** (`puntos Lucams`).
7. **Programa de referidos** con códigos únicos.
8. **Bundle Creator** — arma tu cajita con descuentos progresivos.
9. **Portal mayorista B2B** (`/mayorista`) para imanes publicitarios.
10. **Reseñas con foto** (UGC).
11. **Realtime inventory** (Supabase Realtime).
12. **PWA instalable**.
13. **Blog/SEO** local (`/blog/ideas-regalo-dia-madre-colombia`).
14. **Email automation** (carrito abandonado, post-compra, reactivación).
15. **Multi-idioma preparado** (es-CO base, expandible).
16. **A/B testing** con Vercel Edge Config.

---

## Arquitectura

```
lucams_shop/
├── apps/
│   └── web/                              # Next.js 16 (App Router)
│       ├── app/
│       │   ├── (storefront)/
│       │   │   ├── page.tsx              # Home
│       │   │   ├── catalogo/
│       │   │   ├── categoria/[slug]/
│       │   │   ├── producto/[slug]/
│       │   │   ├── personalizar/[slug]/  # Estudio de personalización
│       │   │   ├── bundle/
│       │   │   ├── carrito/
│       │   │   ├── checkout/
│       │   │   ├── orden/[id]/
│       │   │   ├── cuenta/
│       │   │   ├── mayorista/
│       │   │   └── blog/[slug]/
│       │   ├── admin/
│       │   │   ├── productos/
│       │   │   ├── inventario/
│       │   │   ├── ordenes/
│       │   │   ├── clientes/
│       │   │   ├── envios/
│       │   │   ├── cupones/
│       │   │   ├── reseñas/
│       │   │   ├── blog/
│       │   │   └── analytics/
│       │   └── api/
│       │       ├── wompi/webhook/
│       │       ├── venndelo/webhook/
│       │       ├── checkout/create/
│       │       ├── shipping/quote/
│       │       ├── ai/design-suggest/
│       │       └── upload/sign/
│       ├── components/
│       │   ├── storefront/
│       │   ├── studio/                   # Personalizador (react-konva)
│       │   ├── preview3d/                # Vista 3D (three.js)
│       │   └── admin/
│       ├── lib/
│       │   ├── supabase/
│       │   ├── payment/                  # Adaptador PaymentProvider
│       │   │   ├── types.ts
│       │   │   └── wompi.ts
│       │   ├── venndelo.ts
│       │   ├── whatsapp.ts
│       │   ├── ai.ts
│       │   ├── cart.ts
│       │   ├── i18n.ts
│       │   └── format.ts
│       └── messages/                     # i18n
├── packages/
│   ├── db/                               # Prisma schema + migraciones
│   └── ui/                               # Componentes shadcn compartidos
├── prisma/schema.prisma
└── supabase/
    ├── migrations/
    └── functions/
```

**Monorepo con pnpm workspaces.** Detalles completos en [`ARCHITECTURE.md`](./ARCHITECTURE.md).

---

## Modelo de datos (resumen)

```prisma
// Identidad
Customer, Address, AdminUser

// Catálogo
Category, Product, ProductVariant, InventoryLog

// Carrito y órdenes
Cart, CartItem, Order, OrderItem, Coupon, Review

// Marketing
AbandonedCart, LoyaltyTxn, Referral, BlogPost

// Idempotencia
WebhookEvent (source: WOMPI|VENNDELO, externalId UNIQUE)
```

**Reglas:**

- Precios en **enteros (centavos COP)**.
- Row-Level Security en Supabase para `Customer`, `Cart`, `Order`, `Address`, `Review`.
- Admin pasa por server-only routes con la **secret key** (`sb_secret_*`, mapea al rol Postgres `service_role`).
- `WebhookEvent.@@unique` garantiza idempotencia ante reintentos.
- **Reserva de stock al `PENDING_PAYMENT` con TTL 15 min** (ADR-014); descuento real al `PAID`.
- **Background jobs en `pgmq` + `pg_cron`** (ADR-017), no Vercel Cron.

> Schema completo en [`ARCHITECTURE.md`](./ARCHITECTURE.md).

---

## Integraciones — resumen

- **Wompi**: pasarela principal. Adaptador `PaymentProvider` permite sumar Mercado Pago después sin reescribir.
- **Aveonline**: cotización + creación de envíos + tracking + COD. Partner Coordinadora.
- **Claude API**: asistente de diseño en el estudio de personalización.
- **Resend**: emails transaccionales (confirmación, recuperación carrito, reseña).
- **WhatsApp `wa.me`**: botón flotante con mensaje pre-armado contextual.

> Detalles, firmas, webhooks y vars de entorno en [`INTEGRATIONS.md`](./INTEGRATIONS.md).

---

## Seguridad y cumplimiento

> **Fuente única detallada:** [`SECURITY.md`](./SECURITY.md). Aquí solo el resumen ejecutivo.

- HTTPS automático (Vercel) + HSTS preload.
- **Rate limiting en endpoints públicos sobre Postgres + `pg_cron`** (ADR-016) — sin Redis externo durante dev y arranque productivo.
- CAPTCHA invisible (Cloudflare Turnstile) en checkout y registro.
- Logs PCI-friendly: nunca persistir tarjetas, todo vía Wompi.
- Política de privacidad y Términos acorde a Ley 1581 (datos) y Ley 1480 (consumidor).
- Backup automático (Supabase Pro al lanzar) + export semanal a Cloudflare R2.
- Roles admin con `AdminUser.role` y middleware en `/admin/*`.
- **RLS por defecto** en toda tabla accesible desde el cliente público (publishable key, rol Postgres `anon`). Mandato #12.
- **Headers de seguridad** (CSP, X-Frame-Options, Referrer-Policy, Permissions-Policy) configurados desde Fase 1.
- **Validación de input centralizada** con Zod en `lib/validation/`.
- **Audit log** (`AdminActionLog`) para acciones administrativas (cambio manual de orden, ajuste manual de inventario, aprobación de reseña).
- **Webhook signatures** verificados con HMAC + idempotencia (`WebhookEvent.@@unique`).

---

## SEO + Performance

- Metadata por página, `sitemap.xml` dinámico, `robots.txt`, JSON-LD.
- ISR `revalidate: 60` en home/catálogo, on-demand revalidate en cambios de stock/precio.
- `next/image` con AVIF/WebP.
- **Lighthouse > 95** en Performance/SEO/A11y/Best Practices como criterio de aceptación.
- OG + Twitter Cards dinámicos por producto.

---

## Decisiones cerradas

| Item                                                                               | ADR      | Estado |
| ---------------------------------------------------------------------------------- | -------- | ------ |
| Stack Next.js 16 + TS + **Tailwind v4 + React 19** + shadcn/ui sobre monorepo pnpm | 001, 015 | ✅     |
| Hosting Vercel (Free dev → Pro prod)                                               | 002      | ✅     |
| DB Supabase (Free dev → Pro prod)                                                  | 003      | ✅     |
| Pasarela Wompi (con adaptador para sumar MP)                                       | 004      | ✅     |
| Logística Aveonline + COD día 1                                                    | 005, 009 | ✅     |
| WhatsApp `wa.me` (sin Twilio API)                                                  | 006      | ✅     |
| Catálogo seed: 30+ productos espejo de magneticas.cl con placeholders              | 010      | ✅     |
| Branding: paleta kawaii con mascota mapache                                        | —        | ✅     |
| Dominio `lucamsshop.co` en mi.com.co (al lanzar)                                   | 011      | ✅     |
| Sentry/monitoreo: fuera del alcance hasta Fase 7                                   | 008      | ✅     |
| WhatsApp temporal `+57 320 887 3826`                                               | —        | ✅     |
| **Stock**: reserva al `PENDING_PAYMENT` (TTL 15 min) + descuento al `PAID`         | 014      | ✅     |
| **Rate limit + cache** en Postgres + `pg_cron`, sin Redis externo                  | 016      | ✅     |
| **Background jobs** en `pgmq` + `pg_cron`, no Vercel Cron                          | 017      | ✅     |
| **Argumentación obligatoria** — no suposiciones, citar fuente oficial              | 018      | ✅     |
| **Traceability** vía `docs/STATE.md` y `docs/audits/`                              | 019      | ✅     |

> Cronología completa en [`DECISIONS.md`](./DECISIONS.md).

---

## Pendientes del usuario (cuando arranquemos código)

- **Branding:** ver lista exhaustiva en [`BRANDING.md` § Pendientes de branding](./BRANDING.md#pendientes-de-branding) (logo, mascota en variantes, tipografías, tagline, foto del equipo).
- **Decisión legal:** plantilla colombiana adaptada por mí, o esperamos a un abogado (ADR-020 a tomar).

---

## Fases de implementación

> Detalle con criterios de aceptación en [`ROADMAP.md`](./ROADMAP.md). **Estado real refrescado
> 2026-06-27** (fuente fiel: [`STATE.md`](./STATE.md) + git):

- **Fase 0a** ✅ — Estructura de documentación.
- **Fase 0b** ✅ — Cuentas externas en Free (Supabase, Vercel, Resend, Wompi sandbox, Aveonline sandbox, Cloudflare).
- **Fase 1** ✅ — Base sólida: monorepo, Next.js 16, Prisma, Supabase Auth + RLS, layout base. _(CI/CD + tests RLS → Bloques C/E pendientes.)_
- **Fase 2** ✅ — Catálogo y carrito (storefront público + SEO). Admin del catálogo restructurado y pulido (2026-06-27).
- **Fase 3** 🔄 — Estudio de Personalización (canvas hecho; faltan plantillas ≈2/30, 3D y compartir).
- **Fase 4** ✅ **certificada** — Checkout, pagos y logística (Wompi sandbox + COD + Aveonline + saga + emails). **Bloque A, 48 tests.** Pendiente: llaves de producción + refund/retracto (Bloque F).
- **Fase 5** ⏳ — Marketing engine (cupones, fidelidad, referidos, bundles, blog). _Incluye la redención de cupones en checkout (Bloque F)._
- **Fase 6** ⏳ — Backoffice y B2B (admin, mayorista, analytics).
- **Fase 7** ⏳ — Pulido productivo + migración Free→Pro + dominio + lanzamiento. _Incluye Bloques C (Seguridad), D (Observabilidad), E (Testing)._

---

## Verificación (criterios de aceptación productivos)

1. **Funcional**: compra Wompi sandbox + COD + personalización + stock realtime, todos verdes.
2. **Performance**: Lighthouse ≥ 95 en mobile y desktop.
3. **Tests**: Vitest unitarios + Playwright E2E para flujo de compra completo.
4. **Seguridad**: RLS verificada, rate limit verificado, webhooks rechazan firma inválida.
5. **Operacional**: Vercel Logs y backup verificados; runbook de incidentes documentado.

---

## Histórico de versiones de este plan

- **v1** — Plan inicial con MVP genérico.
- **v2** — Producción 100%, paid tiers, Twilio, Sentry, dominio Cloudflare.
- **v3** — Free durante dev → Pro al lanzar; sin Sentry; comparativa Wompi vs MP; dominio mi.com.co; alcance Fase 0a aislado.
