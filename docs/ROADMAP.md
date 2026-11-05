# Roadmap — Lucams Shop

> **Documento vivo** (fusiona los antiguos `PLAN.md`, `ROADMAP.md` y `CMS_ROADMAP.md`): visión y alcance, modo de tienda por etapas (`catalog` vs `full`), stack con estructura real de costos mensuales, estado consolidado de las fases completadas y evolución futura en bullets. Sin checklists históricos ni bitácoras — la historia detallada vive en `git log`. El estado operativo del día a día está en [`STATE.md`](STATE.md); el «por qué» de cada decisión arquitectónica, en [`DECISIONS.md`](DECISIONS.md).

## Visión y alcance

**Lucams Shop** (`lucamsshop.com`) es un e-commerce colombiano de productos magnéticos personalizados operando en producción en modo **`full`** (`NEXT_PUBLIC_STORE_MODE=full`). Referencia funcional original: `magneticas.cl`, con mandato explícito de **superarla**, no copiarla. Mandatos no negociables: **no es un MVP** (nace y opera con calidad 100 % productiva), stack fijo (Next.js 16 + TypeScript strict + Tailwind v4 + shadcn/ui, monorepo `pnpm`, Prisma + Supabase, Vercel Pro `iad1`), Wompi + Aveonline, WhatsApp solo mediante enlaces `wa.me`, sin Sentry ni SaaS superfluos (mandatos completos en [`../CLAUDE.md`](../CLAUDE.md)).

### Modelo operativo por bandera (`catalog` vs `full`, `ADR-077`)

Una única base de código soporta dos modos controlados por `NEXT_PUBLIC_STORE_MODE` y `apps/web/lib/stage-guard.ts`:

- **`catalog` (Etapa 1 histórica / contingencia comercial):** escaparate completo, Estudio 2D/3D interactivo y cierre consultivo por WhatsApp sin pasarela ni fletes en línea, ajustando automáticamente copys y metadatos para cumplir Ley 1480 art. 23.
- **`full` (modo activo hoy en LOCAL, STG y PRD):** checkout transaccional completo en 3 pasos, pagos Wompi + contraentrega COD, cotización/emisión de guías Aveonline + «Envío Lucams» Bogotá, render 300 DPI automatizado y posventa autoservicio.

### Diferenciadores ya operativos en producción

- **Estudio de personalización 2D/3D y Taller 300 DPI:** lienzo en vivo (Konva sobre derivados ligeros `.canvas.webp`), **7 escenas 3D** en React Three Fiber (incluyendo reverso con patrón «Lucams», `ADR-190`), `LetterSetEditor`/`NameEditor` multi-set, auto-save serial con `clientRev`, retomador de borradores invitado+cliente (`[STU-02]`), vistas previas limpias sin marca de agua (`ADR-191`), asistente creativo con IA (Gemini) y cola asíncrona `RenderJob` a 300 DPI con exportación ZIP agrupada para taller.
- **Catálogo rico y flexible:** jerarquía de categorías y subcategorías, 16 ocasiones dinámicas, variantes multidimensionales, **oferta gemela «Sin imán» (`-NOMAG`, `ADR-099`) activa en producción**, escalas mayoristas por volumen (`WholesaleTier`) y feed XML para Google Merchant Center.
- **Pagos múltiples y logística híbrida:** Wompi Hosted Checkout con ledger por intento (`WompiPaymentAttempt`) y reconciliación activa + contraentrega (`COD`) con blocklist y conciliación financiera; Aveonline multi-transportadora con reglas de peso por carrier, archivo propio de guías PDF y rastreo híbrido (`ShipmentEvent`) + mensajería interna en Bogotá (**«Envío Lucams»**, carrier `LUCAMS`).
- **Fidelización, posventa invitado y confianza:** programa **Puntos Lucams** (con incentivo a invitados, retrocrédito al verificar correo y reversión proporcional en retractos), referidos `/r/[codigo]`, recuperación de carrito abandonado administrable desde `/admin/carritos` (`ADR-153`), seguimiento sin cuenta en `/pedido/[token]` con **autoservicio posventa 2FA para invitados**, retractos Ley 2439, garantías modulares selladas por ítem (`1..120` meses) y reseñas verificadas (`DELIVERED`) con moderación.
- **CRM operacional nativo y gobierno (`ADR-193`):** grafo de identidad `Contact` (`Contacto 360°` invitados+registrados, banderas `isStaff`/`selfDealing` y cola de fusión asistida `/admin/clientes/duplicados`), bandeja operativa `/admin/hoy` con relojes SLA en días hábiles colombianos, canal consultivo B2B y de eventos `/empresas-y-eventos` → `/admin/oportunidades` → cotizador `/cotizacion/[token]` con hoja de taller, segmentos comerciales con filtro duro Ley 1581 (`/admin/marketing/segmentos`), copiloto de soporte 0-PII, matriz RFM + LTV de margen neto en `/admin/metricas`, RBAC de **8 roles × 34 capacidades** con MFA `aal2` y **CMS v2 total** (`166` campos con paridad AST `166/166`, edición en vivo y paquete legal **Versión 3**).

### Diferenciadores aún sin construir

- Bundle Creator interactivo (armador visual de cajas regalo con descuento progresivo).
- Catálogo mayorista B2B autenticado con listas de precios cerradas por cuenta (`/mayorista` autenticado).
- Blog editorial MDX (`/blog`) para contenido orgánico de fechas especiales.
- Inventario colaborativo en tiempo real, PWA instalable, soporte multi-idioma y A/B testing con tabla dedicada.

## Stack y costos

| Capa                                       | Servicio      | Dev / STG                 | Producción                         | Costo prod USD/mes                                                                   |
| ------------------------------------------ | ------------- | ------------------------- | ---------------------------------- | ------------------------------------------------------------------------------------ |
| App y Compute serverless                   | Vercel        | Preview (incluido)        | **Pro (`iad1`)**                   | **$20** (obligatorio: plan Hobby prohíbe uso comercial)                              |
| DB + Auth + Storage + `pg_cron`            | Supabase      | Free (`lucams-stg`)       | Free hoy (`lucams-prod`)           | **$0** (Pro **$25** cuando se requiera PITR continuo o se supere 500 MB DB / 1 GB)   |
| Email transaccional y marketing            | Resend        | Free / suprimido en tests | Free hoy (`mail.lucamsshop.com`)   | **$0** (Pro **$20** si el volumen supera 100 correos/día o 3.000/mes)                |
| DNS + CDN + Email Routing + Turnstile + R2 | Cloudflare    | Free                      | Free (R2 ≤ 10 GB para backups GPG) | **$0** (cero costo de salida en R2)                                                  |
| Dominio (`lucamsshop.com`)                 | Registrador   | —                         | Activo                             | **~$1–5** prorrateado mensual                                                        |
| Inteligencia Artificial                    | Google Gemini | Free / Pay-as-you-go      | `gemini-2.5-flash-lite`            | **~$0–2** según volumen (Estudio + Copiloto de soporte 0-PII)                        |
| Pasarela de pagos                          | Wompi         | Sandbox                   | Producción                         | **2,65 % + $700 COP + IVA** por trx aprobada (plan Avanzado, sin mensualidad) + ret. |
| Logística nacional                         | Aveonline     | Cuenta demo               | Producción (`GENERATE_REAL=true`)  | Costo por guía facturada (**0 % comisión** adicional de plataforma)                  |

Hitos de upgrade: pasar `lucams-prod` a **Supabase Pro** cuando se requiera PITR continuo nativo o se acerque al tope de cuota Free (la cuota de DB y Storage se vigila en `/admin/observability` y con alertas automáticas, mientras los backups diarios cifrados en Cloudflare R2 + DR drill mensual cubren recuperación); pasar a **Resend Pro** al superar 3.000 correos/mes; evaluar monitoreo externo de errores (`ADR-022`) solo si el volumen de tráfico lo justifica.

## Estado de las fases (completadas)

- **0a/0b — Documentación fundacional y cuentas externas:** ✅ completado.
- **1 — Base sólida de ingeniería:** ✅ monorepo `pnpm`, Next.js 16, Prisma (`71` modelos), Supabase Auth OTP + 100 % RLS con trigger automático `049`, CI/CD con gates bloqueantes (format/typecheck/lint/tests/RLS/gitleaks/Lighthouse) y backups diarios cifrados GPG en Cloudflare R2 + DR drill mensual.
- **2 — Catálogo, variantes `-NOMAG` y carrito:** ✅ storefront jerárquico completo, variantes multidimensionales y gemelas sin imán (`ADR-099`), precios mayoristas (`WholesaleTier`), búsqueda difusa, feed Google Merchant XML y CRUD administrativo.
- **3 — Estudio de personalización y producción 300 DPI:** ✅ lienzo Konva por familia de producto, **7 escenas 3D** con reverso «Lucams» (`ADR-190`), `LetterSetEditor`/`NameEditor`, plantillas y galería curada `DesignGalleryImage`, retomador invitado+cliente (`[STU-02]`), render asíncrono `RenderJob` + ZIP de taller y vistas previas limpias sin marca de agua (`ADR-191`).
- **4 — Checkout, pagos y logística:** ✅ certificada en producción (checkout 3 pasos DANE/MinTIC, tarifas con sello HMAC, Wompi con ledger por intento + reconciliación, COD con blocklist y conciliación contable, Aveonline con PDF propio + `ShipmentEvent`, «Envío Lucams» Bogotá y 30 plantillas React Email).
- **5 — Marketing y crecimiento (operativo salvo secuencias automáticas):** ✅ cupones, referidos `/r/[codigo]`, recuperación de carrito (`/admin/carritos`), Puntos Lucams, atribución `lucams_utm` bajo consentimiento Analíticas, embudo propio sin cookies (`FunnelEventDaily`) y segmentos comerciales con opt-in Ley 1581 (`/admin/marketing/segmentos`); la automatización de series de email queda en «Futuro».
- **6 — Backoffice y CRM operacional nativo (`ADR-193`):** ✅ en operación (`Bandeja Hoy` `/admin/hoy`, pedidos y costeo por receta, inventario, `Contacto 360°` sobre `Contact` + cola `/admin/clientes/duplicados`, moderación, retractos/garantías/soporte PQR con relojes SLA hábiles colombianos y copiloto 0-PII, posventa 2FA para invitados, pipeline B2B `/empresas-y-eventos` → `/admin/oportunidades` → `/cotizacion/[token]`, dashboards RFM/LTV, RBAC de 8 roles × 34 capacidades con PII enmascarada, auditoría y MFA `aal2`).
- **7 — Pulido productivo y lanzamiento:** ✅ `lucamsshop.com` opera y vende en modo `full` desde `2026-09-03` (`ADR-077`), con paquete legal **Versión 3 (`2026-11-05`)**, auditorías OWASP/360° cerradas y promoción protegida por PR hacia `production` (`ADR-105`).
- **CMS total (v2 de 3 capas):** ✅ completado (`9` contenedores, `29` secciones y `166` campos `BLOCK + SETTING` con paridad AST `166/166` en CI y modo «Editar en el sitio»); crece de forma declarativa vía `cms-site-map.mjs` (`make migrate-cms-v2`).

## Futuro (sin orden de prioridad; cada ítem se agenda por decisión de dirección)

### Legal y fiscal (bloquea la facturación electrónica automática, no la operación comercial actual)

- Trámites DIAN/NIT/RUT como facturador electrónico y revisión contable/jurídica continua de los 8 documentos legales (`ADR-020`) — ver [`STATE.md`](STATE.md) § Pendientes abiertos reales y [`COMPLIANCE.md`](COMPLIANCE.md).
- Integración técnica DIAN: activar el flujo preparado detrás de `BILLING_DOCUMENT_ENABLED` (`apps/web/features/checkout/billing-document.ts`) e implementar el adaptador `InvoiceProvider` (siguiendo el patrón `PaymentProvider`), resolución de numeración, flujo `Order.PAID → Invoice` con saga + reintentos, notas crédito automáticas en reembolsos e IVA/retenciones B2B.

### Producto

- Portal mayorista `/mayorista` autenticado para cuentas corporativas recurrentes (`isWholesale` con listas de precios dedicadas), complementando las escalas públicas de `WholesaleTier` y el canal consultivo actual de `/empresas-y-eventos` + `/cotizacion/[token]`.
- Bundle Creator interactivo (armador visual de cajas regalo con descuento progresivo).
- Blog editorial con MDX (`/blog`, modelo `BlogPost` reservado en Prisma como `FUTURO_APROBADO`) orientado a guías de regalo y SEO orgánico en Colombia.
- `ADR-118`: unificación opcional entre el motor de vista previa del cliente y el renderizador server-side de producción.
- Palanca comercial sobre lista de deseos / wishlist (diferida por criterios de cumplimiento — `ADR-098`).
- Entregables vectoriales opcionales de marca (`.svg` del logotipo y poses ilustradas adicionales de la mascota mapache — ver [`BRANDING.md`](BRANDING.md) § Pendientes de branding).

### Plataforma

- Upgrade a Supabase Pro en `lucams-prod` para habilitar PITR continuo nativo de 7 días y ampliar cuotas de almacenamiento y transferencia.
- Evaluación de monitoreo externo de errores (`ADR-022`, pendiente de volumen; hoy cubierto por registro propio en PostgreSQL + 12 reglas de alerta operativas).
- Pentest externo por firma independiente como complemento de las auditorías internas y suites automatizadas RLS/E2E.
- Automatización de series de email lifecycle (bienvenida escalonada, recompra a 30/60/90 días) sobre segmentos con consentimiento `MARKETING` Ley 1581 y baja `List-Unsubscribe` RFC 8058.
- Sistema dedicado de Feature Flags / A-B testing en base de datos (`ADR-026` definió el contrato conceptual; hoy las banderas viven en variables de entorno y ajustes CMS).
- PWA instalable, inventario colaborativo en tiempo real y soporte multi-idioma (`es-CO` ya estructurado como base).
- Sostenimiento de Lighthouse ≥ 95 en todas las rutas críticas (gate móvil activo en CI; mejora continua sobre la hidratación inicial del Estudio y el presupuesto JS de la portada).
