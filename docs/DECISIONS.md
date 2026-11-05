# Decisiones Arquitectónicas y de Producto — Lucams Shop

> **Documento vivo de Nivel 1 ([`README.md`](README.md)).** Registra todas las decisiones técnicas, operativas y de producto con anclas estables `ADR-XXX` citadas en comentarios del código. No es una bitácora: si una decisión cambia, se actualiza aquí o se marca `Superseded` apuntando al ADR vigente; la historia vive en `git log -- docs/DECISIONS.md`.

- **Regla de numeración:** nunca reutilices ni renombres un `ADR-XXX`. Asigna el siguiente entero libre en la sección temática correspondiente.
- **Estados:** `Vigente`, `Parcialmente superseded por ADR-YYY`, `Superseded por ADR-YYY`, `Propuesta no implementada`, `Pendiente de activación externa`.

---

## 1. Stack e infraestructura

### ADR-001 — Arquitectura web sobre Next.js 16 App Router

- **Estado:** `Vigente`
- **Decisión:** Unificar tienda y `/admin` en `apps/web` sobre Next.js 16 (`16.4.x`, App Router, RSC, Server Actions, Turbopack) y TypeScript `strict`.
- **Motivo:** Menor JS en cliente y contratos tipados extremo a extremo ([`ARCHITECTURE.md`](ARCHITECTURE.md)).

### ADR-002 — Hosting serverless en Vercel Pro

- **Estado:** `Vigente`
- **Decisión:** Desplegar `apps/web` en Vercel Pro (`iad1`) con rama `develop` para STG y `production` para PRD.
- **Motivo:** Soporte nativo Next.js 16, caché por tags y licencia comercial ([`integrations/vercel.md`](integrations/vercel.md)).

### ADR-003 — Persistencia unificada en Supabase con Prisma y RLS total

- **Estado:** `Vigente`
- **Decisión:** Usar Supabase (PostgreSQL 15, Auth, Storage, `pg_cron`, `pg_net`) vía Prisma tipado (`@lucams/db`) sobre Supavisor (`:6543`) con RLS en el 100 % de las tablas.
- **Motivo:** Productividad tipada con defensa en profundidad SQL y PostgREST bloqueado ([`integrations/supabase.md`](integrations/supabase.md)).

### ADR-007 — Escalamiento gradual de costos de infraestructura

- **Estado:** `Vigente`
- **Decisión:** Pagar Vercel Pro en PRD y operar tiers base en Supabase/Resend/Cloudflare bajo umbral, supliendo PITR con backups diarios cifrados en R2 (`ADR-059`).
- **Motivo:** Costos fijos mínimos con alertas preventivas de cuota (`ADR-161`, [`ROADMAP.md`](ROADMAP.md)).

### ADR-011 — Dominio inicial `.co` como primario

- **Estado:** `Superseded por ADR-076`
- **Decisión:** Descartado `.co` como dominio canónico principal en favor de `lucamsshop.com`.
- **Motivo:** Se vigila solo como activo defensivo de marca ([`integrations/github-and-ops.md`](integrations/github-and-ops.md)).

### ADR-015 — Sistema de estilos con Tailwind CSS v4 y shadcn/ui

- **Estado:** `Vigente`
- **Decisión:** Usar Tailwind CSS v4 (`@theme inline` en `apps/web/app/globals.css`, sin `tailwind.config.ts`), `shadcn/ui` (`new-york`) y `sonner`.
- **Motivo:** Tokens CSS nativos de marca y modo oscuro controlado por clase ([`BRANDING.md`](BRANDING.md)).

### ADR-024 — Adopción de convenciones nativas de Next.js 16

- **Estado:** `Vigente`
- **Decisión:** Operar `apps/web/proxy.ts` (en vez de `middleware.ts`), `await` en `params`/`searchParams`/`cookies()`/`headers()`, `updateTag(tag)` en Server Actions y `revalidateTag(tag, "max")` en Route Handlers.
- **Motivo:** Cumplir el contrato nativo de Next.js 16 sin shims heredados ([`CONVENTIONS.md`](CONVENTIONS.md)).

### ADR-029 — Ubicación de `vercel.json` en `apps/web/`

- **Estado:** `Vigente`
- **Decisión:** Mantener `apps/web/vercel.json` dentro del Root Directory configurado en Vercel y nunca en la raíz del monorepo.
- **Motivo:** Garantiza aplicación real de `regions`, cabeceras y `maxDuration` ([`integrations/vercel.md`](integrations/vercel.md)).

### ADR-076 — Dominio canónico `lucamsshop.com` sobre Cloudflare

- **Estado:** `Vigente`
- **Decisión:** Operar `lucamsshop.com` (registrado en `mi.com.co`) con DNS, Email Routing y Turnstile en Cloudflare, y correo saliente desde `mail.lucamsshop.com`.
- **Motivo:** Aísla reputación SMTP y enruta `hola@lucamsshop.com` y `security@lucamsshop.com` ([`integrations/cloudflare.md`](integrations/cloudflare.md)).

---

## 2. Pagos, inventario y dinero

### ADR-004 — Pasarela Wompi y montos enteros en centavos COP

- **Estado:** `Vigente`
- **Decisión:** Integrar Wompi (Hosted Web Checkout) tras `PaymentProvider` y representar todo dinero como entero en **centavos COP (`Int`)**, nunca flotantes.
- **Motivo:** Cobertura de medios locales (PSE/Nequi/tarjetas) y cero errores IEEE-754 ([`integrations/wompi.md`](integrations/wompi.md)).

### ADR-009 — Contraentrega (COD) habilitada como medio de pago nativo

- **Estado:** `Vigente`
- **Decisión:** Soportar pago contraentrega (`COD`) con máquina de estados, filtro antifraude previo y despacho inmediato.
- **Motivo:** Atiende demanda local contraentrega con riesgo controlado ([`domains/checkout-payments-shipping.md`](domains/checkout-payments-shipping.md)).

### ADR-014 — Reservas temporales de inventario con TTL

- **Estado:** `Superseded por ADR-091 y ADR-109`
- **Decisión:** Eliminado `StockReservation`; el stock se descuenta atómicamente solo al confirmar pago (`PAID`) o pedido `COD`.
- **Motivo:** Evita bloqueos artificiales de stock por carritos abandonados.

### ADR-055 — Flujo operativo completo de pedidos COD

- **Estado:** `Vigente`
- **Decisión:** En pedidos `COD`, evaluar riesgo, descontar inventario con ledger idempotente, generar guía con recaudo y conciliar remesa tras `DELIVERED`.
- **Motivo:** Unifica logística de prepago y contraentrega sin duplicar sagas.

### ADR-064 — Ledger de conciliación financiera COD (`CodReconciliation`)

- **Estado:** `Vigente`
- **Decisión:** Persistir liquidación COD en `CodReconciliation` (1 fila idempotente por `orderId` al resolver); «por remitir» se deriva de `COD` `DELIVERED` sin fila `REMITTED`.
- **Motivo:** Separa entrega física del ingreso efectivo de caja en `/admin/finanzas`.

### ADR-065 — Motor anti-abuso COD por identidad (`cod-risk.ts`)

- **Estado:** `Vigente`
- **Decisión:** Evaluar riesgo COD por teléfono o correo (más `BlockedIdentity`), nunca por IP, midiendo velocidad, no-recogidos y monto abierto.
- **Motivo:** Frena abuso reiterado sin castigar redes móviles NAT (`features/checkout/cod-risk.ts`).

### ADR-094 — Página `/checkout/gracias?id=<txId>` sin sesión obligatoria

- **Estado:** `Vigente`
- **Decisión:** Permitir acceso con `transactionId` no enumerable de Wompi, `noindex`, rate limit `gracias:ip:` (20/5 min) y consulta obligatoria a la API de Wompi.
- **Motivo:** Retorno fluido de invitados sin confiar en query params para marcar `PAID` ([`integrations/wompi.md`](integrations/wompi.md)).

### ADR-109 — Tope por línea y descuento atómico anti-sobreventa

- **Estado:** `Vigente`
- **Decisión:** Limitar carrito a `min(99, stock)`, descontar con `UPDATE ... WHERE stock >= qty` + índice único `InventoryLog` y marcar `needsReconciliation = true` si se agota post-cobro.
- **Motivo:** Cierra carreras TOCTOU y escala alerta crítica si falta stock tras aprobarse Wompi.

### ADR-137 — Ledger Wompi con referencia UUID única por intento

- **Estado:** `Vigente`
- **Decisión:** Registrar cada cobro en `WompiPaymentAttempt` + `WompiPaymentTransaction` (`payment-reference.ts`), reconciliando contra Wompi antes de rotar y bloqueando nuevos intentos si hay `APPROVED`/`PENDING`.
- **Motivo:** Elimina «La referencia ya ha sido usada» e impide que webhooks viejos pisen el intento activo ([`integrations/wompi.md`](integrations/wompi.md)).

### ADR-174 — Errores de stock con nombre de producto y alerta in-app

- **Estado:** `Vigente`
- **Decisión:** Propagar `STOCK_UNAVAILABLE` nombrando el producto hasta `/carrito` y emitir alerta in-app deduplicada (6 h en `AlertState`) vía `notifyStockSaleLost` (`critical` en `saga_paid`).
- **Motivo:** Orienta al comprador y avisa al instante ventas perdidas por quiebre (`features/orders/stock-alerts.ts`).

---

## 3. Envíos y logística

### ADR-005 — Proveedor logístico inicial Venndelo

- **Estado:** `Superseded por ADR-039`
- **Decisión:** Descartado Venndelo en favor de Aveonline detrás de `ShippingProvider`.
- **Motivo:** Mejor API multi-transportadora y soporte de recaudo COD en Colombia.

### ADR-039 — Aveonline como agregador logístico nacional (`ShippingProvider`)

- **Estado:** `Vigente`
- **Decisión:** Encapsular cotización, emisión de guías, copia de rótulos PDF en Storage y tracking tras `features/shipping/provider.ts`.
- **Motivo:** Desacopla múltiples transportadoras bajo un contrato único ([`integrations/aveonline.md`](integrations/aveonline.md)).

### ADR-040 — Cotización vía `cotizarDoble` y filtrado de errores por carrier

- **Estado:** `Vigente`
- **Decisión:** Consumir `cotizarDoble`, descartar carriers con `numbererror` y firmar cada tarifa válida con HMAC-SHA256.
- **Motivo:** Impide mostrar cotizaciones inválidas o alterar fletes desde el cliente ([`integrations/aveonline.md`](integrations/aveonline.md)).

### ADR-049 — Presupuesto `maxDuration` explícito en rutas que generan guía

- **Estado:** `Vigente`
- **Decisión:** Extender `maxDuration` en `apps/web/vercel.json` para los endpoints que ejecutan `createShipment`.
- **Motivo:** Absorbe hasta 20 s de latencia de Aveonline sin corte serverless ([`integrations/vercel.md`](integrations/vercel.md)).

### ADR-053 — Timeouts y reintentos acotados en cotización logística

- **Estado:** `Vigente`
- **Decisión:** Configurar timeout de 15 s, máximo 2 intentos y circuit breaker `aveonlineQuoteCB` en `cotizarDoble`.
- **Motivo:** Tolera latencias reales (7–11 s) sin bloquear el checkout ante degradación externa.

### ADR-054 — Contrato endurecido con Aveonline y compuerta anti-facturación

- **Estado:** `Vigente`
- **Decisión:** Exigir `x-aveonline-secret` en el webhook, archivar PDFs de guías en bucket privado propio y aplicar doble guarda para no emitir guías reales en `generarGuia2` fuera de PRD.
- **Motivo:** Evita webhooks falsos, enlaces caducos y cobros de guías en pruebas ([`integrations/aveonline.md`](integrations/aveonline.md)).

### ADR-060 — Fallo de creación de guía con resolución asistida en `/admin`

- **Estado:** `Vigente`
- **Decisión:** Si `createShipment` falla tras cobro aprobado, mantener la orden `PAID`, expirar `shipmentClaimedAt` (10 min), guardar error sanitizado en `shipmentLastError` y alertar para reintento manual.
- **Motivo:** Nunca revierte un pago cobrado ni duplica guías ciegamente tras un timeout (`shipment-error.ts`).

### ADR-107 — Carrier propio «Envío Lucams» en Bogotá

- **Estado:** `Vigente`
- **Decisión:** Ofrecer entrega local propia en Bogotá gobernada desde CMS (`LUCAMS_SHIPPING_*`), firmada con el mismo HMAC y guía `INTERNO-<orderNumber>`.
- **Motivo:** Entrega rápida y tarifa controlada en Bogotá sin invocar Aveonline ([`integrations/aveonline.md`](integrations/aveonline.md)).

### ADR-108 — Localidad y barrio estructurados + estimador único de despacho

- **Estado:** `Vigente`
- **Decisión:** Capturar localidad y «Barrio» opcional en toda dirección urbana y centralizar plazos en `apps/web/lib/delivery-estimate.ts`.
- **Motivo:** Direcciones completas y promesas idénticas en PDP, checkout, correos y `/admin`.

### ADR-120 — Revalidación fail-closed de zonas de entrega locales

- **Estado:** `Vigente`
- **Decisión:** Tratar zonas vacías (`"{}"`) como fail-closed y revalidar en `finalizeCheckout` que la localidad siga habilitada para «Envío Lucams».
- **Motivo:** Cierra manipulación entre cotización y confirmación final.

### ADR-163 — Reglas de peso por transportadora (`SHIPPING_CARRIER_RULES`)

- **Estado:** `Vigente`
- **Decisión:** Filtrar ofertas antes del sellado HMAC comparando `computePackedPackage` contra topes configurables en `/admin/envios` (p. ej. Transprensa ≥ 11 kg).
- **Motivo:** Evita ofrecer carriers que luego rechazan emitir guía por peso ([`integrations/aveonline.md`](integrations/aveonline.md)).

### ADR-185 — Valor declarado por unidad física de inventario

- **Estado:** `Vigente`
- **Decisión:** Enviar a Aveonline `declaredValueCopPerInventoryUnit = unitPrice * qty_venta / inventoryUnits` (`design-units.ts`).
- **Motivo:** Impide multiplicar por `N` el seguro en sets multi-pieza (abecedarios ×27, separadores ×6).

### ADR-186 — Promesa logística no contractual y sangrado obligatorio (`noFold`)

- **Estado:** `Vigente`
- **Decisión:** Separar **preparación estimada** de **tránsito estimado** manteniendo el máximo legal (`{{entrega_max_legal_dias}}`), y exigir `scale >= cover` (`PHOTO_NOT_FULL_BLEED`) en productos `noFold`.
- **Motivo:** Cumple Ley 1480 y evita bordes blancos al guillotinar piezas sin doblez.

---

## 4. Catálogo, precios y homologación entre ambientes

### ADR-036 — Arquitectura de información y nomenclatura del catálogo

- **Estado:** `Vigente`
- **Decisión:** Estandarizar `Set`/`Pack`, forma en el título, atributos tipados por variante y categoría dinámica de temporada.
- **Motivo:** Consistencia en navegación, búsqueda y Google Merchant ([`domains/catalog-and-cms.md`](domains/catalog-and-cms.md)).

### ADR-037 — Plantillas de personalización gobernadas por tipo y semilla

- **Estado:** `Vigente`
- **Decisión:** Vincular `PersonalizationTemplate` a `PersonalizationKind` con seed idempotente (`seed-templates.mjs`) y archivado opt-in (`--prune`).
- **Motivo:** Geometrías reproducibles entre ambientes sin pisar edición admin.

### ADR-038 — Endpoints públicos `/api/catalog/*` estructurados y RAG-ready

- **Estado:** `Vigente`
- **Decisión:** Exponer lectura pública cacheada y con rate limit del catálogo activo en `/api/catalog/*` desde PostgreSQL, sin PII ni costos internos.
- **Motivo:** Consumo fiable por buscadores y asistentes sin alucinar precios ([`PLAN_CATALOG_V2.md`](PLAN_CATALOG_V2.md)).

### ADR-099 — PRD como fuente comercial del catálogo y variantes gemelas `-NOMAG` activas

- **Estado:** `Vigente`
- **Decisión:** La curaduría comercial manda desde `PRD`. Las variantes gemelas sin imán (**`-NOMAG`**) están **activas en producción** junto a las magnéticas; la homologación sincroniza catálogo y galería sin tocar jamás el stock.
- **Motivo:** Opera líneas con y sin imán en la misma ficha protegiendo inventario vivo ([`domains/catalog-and-cms.md`](domains/catalog-and-cms.md)).

### ADR-101 — Venta de fotoimanes, abecedarios y vocales por sets cerrados

- **Estado:** `Vigente`
- **Decisión:** Vender fotoimanes en múltiplos fijos (`photoSlots` 6/12/18/24) y unificar la denominación de sets en Abecedario y Vocales.
- **Motivo:** Aprovechamiento óptimo de pliegos en taller y compra clara en PDP.

### ADR-102 — Homologación certificable por claves naturales

- **Estado:** `Vigente`
- **Decisión:** Auditar paridad entre ambientes por claves naturales (`slug`, `sku`, `key`) en `scripts/diag-stg/homologacion.sh`.
- **Motivo:** Certifica `0` divergencias activas aunque difieran los CUID internos ([`OPERATIONS.md`](OPERATIONS.md)).

### ADR-121 — Reglas de aislamiento y excepciones deliberadas STG ↔ PRD

- **Estado:** `Vigente`
- **Decisión:** No igualar IDs primarios; aislar secretos, `AdminUser` QA, `uptime-monitor-prd` (en STG) y apagar en STG los 5 crons de correo a clientes (`CRON_JOBS_DISABLED`).
- **Motivo:** Cero colisiones FK y garantía de cero correos comerciales desde STG ([`OPERATIONS.md`](OPERATIONS.md)).

### ADR-123 — Galería de prediseñados filtrada por variante y deduplicada

- **Estado:** `Vigente`
- **Decisión:** Filtrar `DesignGalleryImage` por `variantFilter` y deduplicar copias en diseños mediante `galleryImageId`.
- **Motivo:** Muestra solo artes compatibles en proporción y ahorra Storage.

### ADR-124 — Descuentos por volumen (`WholesaleTier`) públicos en carrito

- **Estado:** `Vigente`
- **Decisión:** Aplicar tramos `WholesaleTier` automáticamente en carrito/checkout para todo cliente, prohibiendo tramos que suban el precio base.
- **Motivo:** Impulsa volumen sin barrera de registro mayorista ([`domains/catalog-and-cms.md`](domains/catalog-and-cms.md)).

### ADR-125 — Retiro de recargo por prediseñado (`Product.premadeSurcharge`)

- **Estado:** `Vigente`
- **Decisión:** Eliminar cobros extra por elegir artes prediseñados de la tienda.
- **Motivo:** Precio transparente y mayor conversión en el Estudio.

### ADR-126 — Sincronización aditiva STG → PRD con `dry-run` y stock excluido

- **Estado:** `Vigente`
- **Decisión:** Promover catálogo y galería con `sync-catalog-stg-to-prd.mjs` / `sync-gallery-stg-to-prd.mjs` en `--dry-run` por defecto, requiriendo `--apply` + `LUCAMS_ALLOW_DESTRUCTIVE_REMOTE=1` y excluyendo stock.
- **Motivo:** Prepara lanzamientos en STG sin riesgo sobre inventario o pedidos PRD ([`CONVENTIONS.md`](CONVENTIONS.md)).

### ADR-134 — Eliminación permanente desde papelera con guardas de integridad

- **Estado:** `Vigente`
- **Decisión:** Permitir borrado físico en `/admin/productos` solo si el producto está archivado y carece de órdenes, diseños, carritos y reseñas, limpiando Storage.
- **Motivo:** Depura pruebas sin romper FK `RESTRICT` ni historial contable.

### ADR-141 — Festivos colombianos vigentes en calendarios y marco en cuadrados

- **Estado:** `Vigente`
- **Decisión:** Incorporar el festivo del 9 de julio (Ley 2578), retirar sufijos «(adhesivo)» y persistir `borderColor` al alternar marco en cuadrados.
- **Motivo:** Exactitud legal del calendario impreso y fidelidad WYSIWYG.

---

## 5. Estudio de personalización 2D/3D y producción 300 DPI

### ADR-013 — El Estudio interactivo como núcleo diferencial

- **Estado:** `Vigente`
- **Decisión:** Integrar edición 2D en vivo, visor espacial 3D y sugerencias con IA antes del pago.
- **Motivo:** Reduce incertidumbre visual y produce originales a 300 DPI ([`domains/studio-and-production.md`](domains/studio-and-production.md)).

### ADR-035 — Motor Konva propio y arquitectura de 5 buckets en Supabase Storage

- **Estado:** `Vigente`
- **Decisión:** Operar el Estudio sobre `konva` / `react-konva` por `PersonalizationKind` y separar archivos en **5 buckets de Supabase Storage**: **`product-images`** y **`cms-media`** (`public = true`); **`customer-uploads`**, **`design-previews`** (privado desde migración `046`, servido por `/api/design-preview/*`) y **`production-assets`** (`public = false`, renders 300 DPI y guías PDF).
- **Motivo:** Cero licencias de terceros y aislamiento estricto entre medios públicos y activos privados de clientes/imprenta ([`integrations/supabase.md`](integrations/supabase.md)).

### ADR-056 — Enlaces compartibles `/d/[token]` con vistas limpias

- **Estado:** `Parcialmente superseded por ADR-191`
- **Decisión:** Compartir diseños finalizados mediante `/d/[token]` (token hasheado SHA-256 y rotado al regenerar); el requisito inicial de marca de agua quedó **`Superseded por ADR-191`**.
- **Motivo:** Muestra el arte limpio bloqueando borradores por token (`preview-access.ts`).

### ADR-057 — Consolidación del editor Konva in-house y permisos de Storage

- **Estado:** `Vigente`
- **Decisión:** Descartar SDKs pagos externos (Polotno) manteniendo `react-konva` propio y accesos mediados por servidor sobre los **5 buckets** (`product-images` y `cms-media` públicos; `customer-uploads`, `design-previews` y `production-assets` privados).
- **Motivo:** Control completo de sangrado, memoria móvil y privacidad fotográfica ([`integrations/supabase.md`](integrations/supabase.md)).

### ADR-058 — Asistente creativo de IA tras `AiProvider` (Gemini)

- **Estado:** `Vigente`
- **Decisión:** Encapsular sugerencias de texto en `features/ai/provider.ts` vía fetch REST `v1beta` server-side a Google Gemini con fallback de modelo y timeout de 12 s.
- **Motivo:** Cero SDK pesado, API key privada y proveedor intercambiable ([`integrations/google-and-ai.md`](integrations/google-and-ai.md)).

### ADR-063 — Flujo integral de taller: ZIP por pedido, armado y moderación

- **Estado:** `Vigente`
- **Decisión:** Generar en `/admin/pedidos/[id]` ZIP con piezas 300 DPI, `armado.png`, `LEEME.txt`, grillas de calendario, siluetas troqueladas y visor de moderación.
- **Motivo:** Elimina preprensa manual en producción ([`domains/studio-and-production.md`](domains/studio-and-production.md)).

### ADR-081 — Renderizado de archivos de imprenta 300 DPI en el servidor

- **Estado:** `Vigente`
- **Decisión:** Componer los PNG finales en servidor (`sharp` + `@napi-rs/canvas` con `.ttf` locales) a partir del JSON del lienzo.
- **Motivo:** Nitidez constante de 300 DPI sin depender de la RAM del teléfono del cliente.

### ADR-103 — Geometría adaptativa del lienzo por ancho disponible

- **Estado:** `Vigente`
- **Decisión:** Calcular columnas con `fitColsToFloor` (450 px para ≤6 slots, 300 px para ≥7 y 1 columna en `<640 px`).
- **Motivo:** Aprovecha escritorio sin causar scroll horizontal en móvil.

### ADR-104 — Tarjeta-unidad universal y paridad táctil

- **Estado:** `Vigente`
- **Decisión:** Unificar la tarjeta editable por unidad en todos los tipos del Estudio y asegurar operación táctil sin overflow en tienda y `/admin`.
- **Motivo:** UX coherente multi-dispositivo verificada por `ADR-154`.

### ADR-114 — Regla espejo en cara B vacía de separadores

- **Estado:** `Superseded por ADR-128 y ADR-190`
- **Decisión:** Descartado duplicar en espejo la cara A cuando la cara B queda vacía.
- **Motivo:** Sustituido hoy por el patrón diagonal de marca «Lucams» (`ADR-190`).

### ADR-115 — Estado visual único para CTAs ocupados (`studio-busy-cta.ts`)

- **Estado:** `Vigente`
- **Decisión:** Estandarizar spinner, bloqueo de clic y opacidad 70 % en botones ocupados del Estudio mediante `studio-busy-cta.ts`.
- **Motivo:** Feedback inmediato durante cargas y guardados.

### ADR-118 — Unificación futura del compositor de vista previa cliente

- **Estado:** `Propuesta no implementada`
- **Decisión:** Mantener como mejora opcional converger el preview cliente de filtros Konva complejos con el compositor servidor.
- **Motivo:** El flujo actual ya opera server-side (`ADR-081`) con respaldo `NEEDS_KONVA`.

### ADR-128 — Cara B vacía de separadores renderizada en blanco puro

- **Estado:** `Superseded por ADR-190`
- **Decisión:** El reverso blanco liso en productos `backOptional` sin cara B fue reemplazado por el patrón «Lucams».
- **Motivo:** Se preserva el ancla por referencias de trazabilidad en el motor de render.

### ADR-129 — Auto-save con debounce, `sendBeacon` y reconciliación local

- **Estado:** `Vigente`
- **Decisión:** Guardar cada 2 s de pausa, respaldar cierres con `sendBeacon` (`POST /api/designs/save-canvas`) y reconciliar `localStorage` por revisión.
- **Motivo:** Previene pérdida de progreso al cerrar el navegador móvil.

### ADR-133 — Reclamación segura de pedidos invitados tras verificar correo

- **Estado:** `Vigente`
- **Decisión:** Asociar órdenes invitadas al `Customer` solo tras verificar titularidad del correo (OTP/login verificado) y emitir links firmados de reseña al entregar.
- **Motivo:** Conecta posventa sin permitir apropiación de pedidos ajenos (`ADR-155`).

### ADR-136 — Cola asíncrona `RenderJob` para producción a 300 DPI

- **Estado:** `Vigente`
- **Decisión:** Desacoplar el render 300 DPI mediante `RenderJob`, ventana inicial de 8 s, cron por minuto `lucams-process-render-jobs`, `/api/designs/[id]/render-status` y `409` en ZIP mientras corre.
- **Motivo:** Paso instantáneo al carrito sin timeouts en diseños multi-página ([`domains/studio-and-production.md`](domains/studio-and-production.md)).

### ADR-139 — Rehidratación fiel por `assetId` al retomar diseños

- **Estado:** `Vigente`
- **Decisión:** Regenerar URLs firmadas frescas desde `assetId` al reabrir borradores o clones, restaurando `templateId` y estado de sets.
- **Motivo:** Evita fotos rotas cuando caducan URLs firmadas previas.

### ADR-140 — Escenas 3D con grosor real, `ErrorBoundary` y ajuste de separadores

- **Estado:** `Vigente`
- **Decisión:** Envolver visores 3D en `ErrorBoundary`, corregir z-fighting, usar grosor por variante y encuadrar separadores largos con `flatBookmarkFit`.
- **Motivo:** Visor 3D realista y resiliente ante fallos WebGL.

### ADR-142 — Presupuesto de 4 MB, piso de DPI y decodificación HEIC fail-closed

- **Estado:** `Vigente`
- **Decisión:** Comprimir subidas bajo 4 MB validando DPI y decodificando HEIC/HEIF en modo fail-closed (error explícito ante archivo corrupto).
- **Motivo:** Soporta fotos de iPhone sin guardar masters dañados.

### ADR-143 — Vista previa paginada en carrito y retención de carritos

- **Estado:** `Vigente`
- **Decisión:** Paginar todas las unidades en el modal de `/carrito` y purgar carritos vacíos (7 d), inactivos (60 d) y `AbandonedCart` (90 d).
- **Motivo:** Revisión completa pre-pago e higiene de tablas operativas.

### ADR-147 — Estados y miniaturas en `/mi-cuenta/disenos`

- **Estado:** `Vigente`
- **Decisión:** Persistir `draftPreviewUrl`, distinguir `Borrador` / `Listo` / `Ya pedido` y clonar diseños `READY` al reeditar.
- **Motivo:** Biblioteca clara sin mutar artes de órdenes ya creadas.

### ADR-148 — Marca de agua en mosaico sobre vistas previas de diseño

- **Estado:** `Superseded por ADR-191`
- **Decisión:** Retirado el estampado de marca de agua en vistas previas de diseños de clientes.
- **Motivo:** Ancla conservada por comentarios en `preview-access.ts` y `retention-service.ts`; rige `ADR-191`.

### ADR-150 — Diálogo compartido `DesignPreviewDialog` paginado por unidad

- **Estado:** `Vigente`
- **Decisión:** Centralizar en `components/design-preview-dialog.tsx` el visor con zoom y paginación usado en carrito, gracias, cuenta y seguimiento invitado.
- **Motivo:** Inspección posventa idéntica en todas las rutas ([`CONVENTIONS.md`](CONVENTIONS.md)).

### ADR-151 — Barra de estilo móvil en `Sheet` inferior («resumen + Listo»)

- **Estado:** `Vigente`
- **Decisión:** En `<640 px`, abrir opciones densas de estilo en un `Sheet` inferior con grilla completa, vista en vivo y botón fijo «Listo».
- **Motivo:** Elimina tiras horizontales truncadas en pantallas pequeñas.

### ADR-152 — Recuperación de borradores para clientes autenticados e invitados (`[STU-02]`)

- **Estado:** `Vigente`
- **Decisión:** Crear borradores `DRAFT` de forma perezosa y habilitar «Continuar donde quedaste» tanto para **clientes autenticados** como para **invitados con cookie HttpOnly `cart_session` (`[STU-02]`)** (`draftResumeEnabled` en `app/estudio/[slug]/page.tsx` + borradores locales 7 d en letras/nombres), validando propiedad estricta anti-IDOR en servidor y podando a máximo 3 borradores por producto.
- **Motivo:** Protege el diseño en curso de registrados e invitados sin reuso silencioso ni exposición cruzada ([`domains/studio-and-production.md`](domains/studio-and-production.md)).

### ADR-156 — Cola serial de auto-save y concurrencia optimista (`Design.clientRev`)

- **Estado:** `Vigente`
- **Decisión:** Encolar guardados en `serial-task-queue.ts` con `clientRev` creciente, rechazar `STALE_REVISION` y hacer flush antes de previsualizar o comprar.
- **Motivo:** Evita que peticiones lentas sobrescriban ediciones nuevas.

### ADR-157 — Sets de letras multi-unidad con estilo propio por set

- **Estado:** `Vigente`
- **Decisión:** Guardar estilo/colores/borde por unidad en `metadata.units[u]`, validar las `unitCount` unidades y paginar por set.
- **Motivo:** Permite combinar estilos distintos en una sola compra de varios sets.

### ADR-158 — Aplicación explícita de prediseñados y reemplazo por par

- **Estado:** `Vigente`
- **Decisión:** Confirmar destino cuando no hay slot libre (`replacePair` en separadores), con `HoverCard` en desktop y botón táctil «Ver» (`44 px`) en móvil.
- **Motivo:** Impide pisar fotos por error y habilita zoom táctil accesible.

### ADR-159 — Edición de texto con acción única «Listo» y borrado confirmado

- **Estado:** `Vigente`
- **Decisión:** Aplicar textos con un solo botón «Listo» (`Escape`/`×` cancelan) y exigir confirmación con deshacer en «Borrar el diseño».
- **Motivo:** Elimina confusión entre «Aplicar» y «Listo».

### ADR-164 — Checklist «Tu diseño», arranque lazy en prediseñados y paletas binarias

- **Estado:** `Vigente`
- **Decisión:** Guiar pasos pendientes en `studio-checklist.tsx`, iniciar `designId` lazy también desde prediseñados/drag-and-drop y fijar paleta binaria (`blanco`/`negro` + personalizado) en formatos fotográficos.
- **Motivo:** Guía clara en móvil y arranque rápido en el primer clic.

### ADR-166 — Optimización Konva móvil (pixelRatio, caché SVG y sombras)

- **Estado:** `Vigente`
- **Decisión:** Tope `Konva.pixelRatio <= 2`, caché bitmap de marcos SVG (`chrome-bitmap-cache.ts`) y `Layer.cache()` en sombras estáticas.
- **Motivo:** ~43 % menos CPU móvil manteniendo salida 300 DPI en servidor.

### ADR-167 — Selección explícita obligatoria en productos multi-plantilla

- **Estado:** `Vigente`
- **Decisión:** Si hay `>1` plantillas visibles sin `?template=`, arrancar `templateId = null` (`boot-template.ts`) y exigir elección explícita antes de finalizar.
- **Motivo:** Impide imprimir la primera plantilla por omisión involuntaria.

### ADR-168 — Visor 3D de sets de letras con paginador por set

- **Estado:** `Vigente`
- **Decisión:** Mostrar en 3D un set a la vez con controles «Anterior/Siguiente» (`Set N de M`, hasta `MAX_LETTER_SET_UNITS = 10`).
- **Motivo:** Conserva escala legible sin mezclar múltiples alfabetos.

### ADR-169 — Derivados `.canvas.webp` (≤800 px) y perfilado del Estudio

- **Estado:** `Vigente`
- **Decisión:** Crear `DesignAsset.canvasPath` (`<= 800 px`) para edición/previews conservando `storageUrl` íntegro para 300 DPI, auditado con `profile-studio-entry.mjs`.
- **Motivo:** Fluidez de lienzo en gama media sin degradar impresión ([`TESTING.md`](TESTING.md)).

### ADR-170 — Detalle 3D de calendarios multi-set en dos niveles

- **Estado:** `Vigente`
- **Decisión:** Navegar meses con wrap-around dentro del set activo y saltar entre calendarios mediante chips superiores en `CalendarCardFocus`.
- **Motivo:** Evita recorrer 24–36 meses sin contexto de unidad.

### ADR-172 — Galería de escenas 100 % en 3D interactivo (React Three Fiber)

- **Estado:** `Vigente`
- **Decisión:** Reemplazar montajes 2D por **7 escenas 3D reales** (`FridgeView3D`, `BookView3D`, `PolaroidTable3D`, `RoomBoardView3D`, `ShelfView3D`, `GiftView3D`, `CalendarCardFocus`) con pose física (`leaning-scene-layout.ts`).
- **Motivo:** Zoom sin pixelado y cobertura de variantes con y sin imán ([`domains/studio-and-production.md`](domains/studio-and-production.md)).

### ADR-173 — Grosor de marco configurable por producto (`borderWidthFactor`)

- **Estado:** `Vigente`
- **Decisión:** Exponer `personalizationSchema.borderWidth` como slider y aplicar `canvasData.borderWidthFactor` (`0.25–3`) en lienzo y render 300 DPI (`frame-palette.ts`).
- **Motivo:** Ajuste estético WYSIWYG administrable por producto sin migrar SQL.

### ADR-176 — Auto-llenado priorizando fotos aún no usadas

- **Estado:** `Vigente`
- **Decisión:** Ordenar `orderAssetsForAutoFill` priorizando fotos inéditas en el diseño y en el carrito (`listCartDesignAssetIdsInUse`) antes de repetir.
- **Motivo:** Evita duplicar las mismas fotos al armar varios packs seguidos.

### ADR-177 — Compuerta estricta `allowText` en capas editables

- **Estado:** `Vigente`
- **Decisión:** Si `allowText = false`, ocultar capas de texto, hints y pestaña «Texto» en el modal aunque la plantilla traiga capas heredadas.
- **Motivo:** Blinda formatos solo-foto (como Cuadrados) contra textos accidentales.

### ADR-178 — `CloseXButton` unificado, biblioteca «Mis fotos» usable y calendario colapsable

- **Estado:** `Vigente`
- **Decisión:** Unificar cierres en `close-x-button.tsx`, habilitar asignación/borrado seguro en «Mis fotos» (`deleteDesignAssetAction`), toggle A/B en prediseñados y meses colapsables por set.
- **Motivo:** Coherencia visual de marca y ergonomía móvil.

### ADR-179 — Umbrales recalibrados de calidad fotográfica (DPI y foco)

- **Estado:** `Vigente`
- **Decisión:** Alinear `photo-validation.ts` y `smart-crop.ts`: avisos en `<240` / `<200 DPI`, bloqueo en `<150 DPI` y umbrales Laplacianos `10` / `4`.
- **Motivo:** Tolera bokeh natural de retratos bloqueando fotos pixeladas.

### ADR-180 — Reverso 3D según imán y escenas para calendario `-NOMAG`

- **Estado:** `Vigente`
- **Decisión:** Renderizar dorso ferrita oscuro en imanes y papel claro en `-NOMAG`, activando escenas de repisa y regalo en calendarios sin imán.
- **Motivo:** Fidelidad material completa en todas las variantes.

### ADR-188 — Sets de letras renderizados por ficha individual a 300 DPI

- **Estado:** `Vigente`
- **Decisión:** Generar un PNG 300 DPI por cada ficha (`letter-tile-render.ts`) y agrupar `/admin` + ZIP por set (`productionPieceGroups`).
- **Motivo:** Piezas listas para corte individual y vista compacta en sets de 27/54 fichas.

### ADR-189 — PNG de producción rectangulares a sangre completa

- **Estado:** `Vigente`
- **Decisión:** Exportar piezas rectangulares con esquinas llenas a sangre (redondeo solo en troquel físico y preview web), dejando transparencia solo en siluetas especiales.
- **Motivo:** Elimina filos blancos por tolerancia mecánica del troquel.

### ADR-190 — Reverso con patrón «Lucams» en separadores `backOptional` sin cara B

- **Estado:** `Vigente`
- **Decisión:** Estampar mosaico diagonal «Lucams» (`#E9E6F0`, `DancingScript.ttf`) vía `brand-back-pattern.ts` en preview, `BookView3D` y PNG 300 DPI (`default-back-face.ts`) cuando la cara B queda vacía.
- **Motivo:** Acabado editorial 100 % WYSIWYG que sustituye el reverso blanco ([`BRANDING.md`](BRANDING.md)).

### ADR-191 — Retiro total de marca de agua en vistas previas de diseños de clientes

- **Estado:** `Vigente`
- **Decisión:** Servir limpias sin marca de agua todas las vistas previas de diseños de clientes, retirar `preview-wm.webp` y restringir borradores a su dueño o `/admin` (`preview-access.ts`).
- **Motivo:** Apreciación fiel del arte manteniendo privacidad con `design-previews` privado y tokens firmados.

---

## 6. CMS v2, soporte, UI transversal y marca

### ADR-033 — CMS propio en PostgreSQL sin proveedor headless externo

- **Estado:** `Vigente`
- **Decisión:** Gestionar contenidos y ajustes en PostgreSQL propio bajo `/admin/contenido` y `/api/cms/*`.
- **Motivo:** Cero SaaS extra, versionado transaccional e invalidación inmediata.

### ADR-082 — Modelo jerárquico versionado del CMS v2

- **Estado:** `Vigente`
- **Decisión:** Modelar `CmsPage` → `CmsSection` → `CmsField` (`BLOCK` / `SETTING`) → `CmsFieldVersion` desde `packages/db/scripts/cms-site-map.mjs`.
- **Motivo:** Historial con rollback y llaves estables ([`domains/catalog-and-cms.md`](domains/catalog-and-cms.md)).

### ADR-083 — Iconos y gradientes de categorías en `Category`

- **Estado:** `Vigente`
- **Decisión:** Persistir `icon` y `gradient` en el modelo `Category` (`/admin/categorias`) en vez de bloques CMS sueltos.
- **Motivo:** Cohesión directa con el ciclo de vida del catálogo.

### ADR-084 — Edición estructurada de listas con `CmsListItem`

- **Estado:** `Vigente`
- **Decisión:** Editar listas repetibles con filas `CmsListItem` validadas por `listSchema` y serializadas al publicar el `CmsField`.
- **Motivo:** Formularios seguros sin romper la lectura de snapshot único.

### ADR-090 — Retiro del modo `?templateId=` (`PREMADE`) en storefront

- **Estado:** `Vigente`
- **Decisión:** Retirar compra directa `PREMADE` en tienda, usando `Design.templateId` solo para trazabilidad y rehidratación en el Estudio.
- **Motivo:** Los artes listos viven unificados como prediseñados en el Estudio (`ADR-158`).

### ADR-092 — Sistema omnicanal de soporte PQR activo en web y correo

- **Estado:** `Vigente`
- **Decisión:** Operar atención PQR por hilo de correo (`support-ticket-closed`) y tres portales activos en producción: `/soporte`, `/soporte/[token]` y **`/mi-cuenta/soporte`**.
- **Motivo:** Seguimiento y SLAs trazables para invitados y clientes autenticados ([`domains/post-sale-and-support.md`](domains/post-sale-and-support.md)).

### ADR-097 — Bandeja única de atención en `/admin/soporte`

- **Estado:** `Vigente`
- **Decisión:** Consolidar contacto y PQR en `/admin/soporte` redirigiendo `/admin/mensajes` con HTTP `308`.
- **Motivo:** Unifica SLAs, asignación y control de concurrencia.

### ADR-116 — Modo oscuro controlado exclusivamente por clase `.dark`

- **Estado:** `Vigente`
- **Decisión:** Activar `@custom-variant dark` solo por clase `.dark` (`next-themes`), nunca por `prefers-color-scheme` del sistema.
- **Motivo:** Preserva la paleta crema/pastel de marca por defecto ([`BRANDING.md`](BRANDING.md)).

### ADR-122 — Tooltips accesibles de marca sobre Radix UI

- **Estado:** `Vigente`
- **Decisión:** Prohibir `title=` nativo y usar el componente accesible `Tooltip` de Radix.
- **Motivo:** Soporte de foco/teclado y consistencia visual.

### ADR-138 — Identidad verbal unificada «Lucams» / «Lucams Shop»

- **Estado:** `Vigente`
- **Decisión:** Usar exclusivamente **«Lucams»** o **«Lucams Shop»** (`SITE_NAME` en `lib/site.ts`), descartando definitivamente grafías históricas con apóstrofo o guion bajo en UI, correos y prosa.
- **Motivo:** Coherencia legal y editorial en todos los canales ([`BRANDING.md`](BRANDING.md)).

### ADR-184 — Intro de categoría colapsable en móvil y blur normalizado

- **Estado:** `Vigente`
- **Decisión:** Colapsar intros largas a 2 líneas en `<640 px` (texto íntegro en DOM para SEO) y normalizar al `blur` en `use-debounced-commit`.
- **Motivo:** Prioriza productos en móvil y evita valores sin formatear.

### ADR-187 — CMS v2 de 3 capas (`CmsPage` → `CmsSection` → `CmsField` + `CmsListItem`, 166 campos con paridad AST)

- **Estado:** `Vigente`
- **Decisión:** Organizar contenidos en **3 capas**: **(1)** ajustes maestros `global` + constantes legales (`consumer-law.ts` con `resolveCmsTokens()`); **(2)** contenido editorial, comercial, SEO y legal en `/admin/contenido` (**9 contenedores, 29 secciones y 166 campos: 105 `BLOCK` + 61 `SETTING`** + `CmsListItem` en `cms-site-map.mjs`); **(3)** micro-UI funcional en TS (`studio-texts.ts`, `auth-texts.ts`, `account-texts.ts`), leído en **1 consulta cacheada** (`cms-snapshot-v2`, tag `cms`) y verificado por AST en `cms-sitemap-parity.test.ts`.
- **Motivo:** Cero inflación de llaves técnicas en DB, Live Edit real y paridad `166/166` garantizada en CI ([`domains/catalog-and-cms.md`](domains/catalog-and-cms.md)).

### ADR-192 — Confirmaciones administrativas de marca (`useAdminConfirm`)

- **Estado:** `Vigente`
- **Decisión:** Prohibir `window.confirm`/`prompt` en `/admin` y usar `useAdminConfirm` (`ConfirmAction`, `ReauthForm`, `requireTyped`).
- **Motivo:** Diálogos accesibles no bloqueantes y testeables.

---

## 7. Checkout, cuenta, identidad y CRM 360°

### ADR-030 — Autenticación separada entre clientes (`/login`) y staff (`/admin/login`)

- **Estado:** `Vigente`
- **Decisión:** Aislar rutas, formularios y sesiones de tienda frente al backoffice administrativo.
- **Motivo:** Exige MFA `aal2` e inactividad de 30 min solo en `/admin/*` ([`SECURITY.md`](SECURITY.md)).

### ADR-031 — Flujo guest-first sin muro de registro

- **Estado:** `Vigente`
- **Decisión:** Permitir diseñar, cotizar, pagar y rastrear pedidos sin cuenta obligatoria.
- **Motivo:** Maximiza conversión móvil ofreciendo cuenta opcional con puntos (`ADR-175`).

### ADR-050 — Portal de autoservicio `/mi-cuenta` integral

- **Estado:** `Vigente`
- **Decisión:** Cubrir en `/mi-cuenta` pedidos, diseños, direcciones, favoritos, fidelización, reseñas, soporte PQR, seguridad y baja Ley 1581.
- **Motivo:** Autoservicio completo posventa y de privacidad.

### ADR-051 — Dirección estructurada colombiana única (`Address.structured`)

- **Estado:** `Vigente`
- **Decisión:** Guardar direcciones urbanas/rurales en JSONB estructurado compartido entre cuenta y checkout, derivando línea plana y etiqueta (`deriveAddressName`).
- **Motivo:** Evita errores de formato al generar guías en Aveonline.

### ADR-052 — Sincronización bidireccional de libreta de direcciones

- **Estado:** `Vigente`
- **Decisión:** Precargar direcciones del cliente en checkout y guardar nuevas deduplicadas con `buildAddressInput`.
- **Motivo:** Compra recurrente ágil sin filas repetidas.

### ADR-070 — Snapshot inmutable del diseño en `OrderItem`

- **Estado:** `Vigente`
- **Decisión:** Congelar `designAssetUrl` y `metadata.designSnapshot` en `OrderItem` al crear el pedido.
- **Motivo:** Protege la orden frente a cambios o purgas posteriores del `Design`.

### ADR-077 — Modo de tienda gobernado por `NEXT_PUBLIC_STORE_MODE`

- **Estado:** `Vigente`
- **Decisión:** Soportar modos `catalog` y `full` en el mismo código (`lib/store-mode.ts`); STG y PRD operan en `full`.
- **Motivo:** Conmutación limpia por variable de entorno ([`STATE.md`](STATE.md)).

### ADR-078 — Imposición server-side del modo de tienda (`stage-guard.ts`)

- **Estado:** `Vigente`
- **Decisión:** Ejecutar `guardTransactionalAction()` / `assertTransactionalAllowed()` en servidor cuando el modo es `catalog`.
- **Motivo:** Frontera de autorización real en backend, no solo visual.

### ADR-110 — Módulo unificado de Garantías y Reclamos (`/admin/garantias`)

- **Estado:** `Vigente`
- **Decisión:** Unificar garantías y reclamos en `/admin/garantias` (`/admin/reclamos` → `308`) con correo obligatorio al resolver.
- **Motivo:** Trazabilidad única bajo Ley 1480 ([`domains/post-sale-and-support.md`](domains/post-sale-and-support.md)).

### ADR-111 — Enlace firmado sin login para reseñas (`/resena/[token]`)

- **Estado:** `Vigente`
- **Decisión:** Enviar al entregar un token HMAC (`CSRF_SECRET`, 30 d, Turnstile) para calificar órdenes `DELIVERED` en estado `PENDING`.
- **Motivo:** Reseñas verificadas de invitados sin reseñas falsas.

### ADR-117 — «Volver a pedir» con clonación independiente de bytes

- **Estado:** `Vigente`
- **Decisión:** Clonar objetos de Storage al reordenar; si ya se purgaron (>90 d), guiar a subir nuevas fotos.
- **Motivo:** Desacopla la retención del pedido nuevo respecto al antiguo.

### ADR-119 — Enrutamiento «Ver mi pedido» y doble factor posventa invitado

- **Estado:** `Vigente`
- **Decisión:** Enviar autenticados a `/mi-cuenta/pedidos/[number]` e invitados a `/pedido/[token]` con doble factor posesión + conocimiento en acciones sensibles.
- **Motivo:** Seguimiento directo protegiendo PII e historial logístico.

### ADR-127 — Flujo nativo de regalo (`isGift`) y atribución segura

- **Estado:** `Parcialmente superseded por ADR-155 y ADR-193`
- **Decisión:** Mantener `Order.isGift` (destinatario, dedicatoria y correos sin precios) y Referidos v2; asociar `customerId` por email digitado quedó **`Superseded por ADR-155`**.
- **Motivo:** Evita fuga de diseños/puntos y aísla al destinatario fuera del CRM (`ADR-193`).

### ADR-144 — Sesión deslizante de 30 días en tienda y 30 min en `/admin`

- **Estado:** `Vigente`
- **Decisión:** Renovar `customer_last_activity` por 30 días en tienda y aislar el timeout de 30 min bajo alcance `/admin`.
- **Motivo:** Comodidad de compra sin debilitar el backoffice ([`SECURITY.md`](SECURITY.md)).

### ADR-146 — Normalización oficial colombiana (DANE, MinTIC, E.164 y NIT)

- **Estado:** `Vigente`
- **Decisión:** Validar ciudades/códigos postales DANE-MinTIC, teléfonos internacionales y dígito de verificación NIT (`colombia-validators`).
- **Motivo:** Menos rechazos logísticos y datos limpios en CRM.

### ADR-155 — Identidad estricta desde sesión y auto-sanado de `cart_session`

- **Estado:** `Vigente`
- **Decisión:** Derivar `Order.customerId` solo de `getCurrentUser`, revalidar variante desde canvas, rotar `cart_session` ante `CART_IDENTITY_MISMATCH` y adoptar borradores al autenticar.
- **Motivo:** Cierra IDOR/re-pricing y bloqueos por cookies desincronizadas.

### ADR-165 — Rótulos por unidad y sustantivos exactos en carrito

- **Estado:** `Vigente`
- **Decisión:** Etiquetar cada página en `DesignPreviewDialog` y pluralizar con el sustantivo real (`sets`, `calendarios`, `tiras`, `separadores`, `packs`).
- **Motivo:** Claridad en líneas multi-unidad con estilos distintos.

### ADR-171 — Recuperación del carrito activo tras re-login

- **Estado:** `Vigente`
- **Decisión:** Restaurar el carrito vivo con ítems del cliente (`recoverCustomerCartSessionId`) al iniciar sesión sin cookie `cart_session`.
- **Motivo:** Conserva el carrito entre sesiones sin dejar cookies abiertas al salir.

### ADR-181 — Deduplicación semántica de detalles en carrito y plantilla visible

- **Estado:** `Vigente`
- **Decisión:** Eliminar repeticiones en `dedupeCartLineDetail` preservando medidas `A×B` y mostrar `Plantilla: <nombre>`.
- **Motivo:** Distinción clara entre líneas del mismo producto.

### ADR-182 — Avance con `Enter` al siguiente campo en formularios móviles

- **Estado:** `Vigente`
- **Decisión:** Usar `enterkeyhint="next"` y `focusNextFieldOnEnter` (`lib/enter-next-field.ts`) en formularios secuenciales.
- **Motivo:** Fluidez en teclados táctiles sin tecla `Tab`.

### ADR-193 — Grafo de identidad `Contact` 360° y CRM operacional nativo

- **Estado:** `Vigente`
- **Decisión:** Separar `Customer` (cuenta autenticada) de `Contact` (invitado o registrado), enlazando 7 dominios por `contactId`, con `ContactIdentity` (unicidad parcial solo en `SUPABASE_USER`/`EMAIL`), fusión humana con MFA (`IdentityMergeCandidate`), aislamiento `isGift`, `/admin/hoy`, pipeline B2B `/empresas-y-eventos` → `Opportunity` y segmentos SQL con opt-in `NEWSLETTER`.
- **Motivo:** Visión 360° en PostgreSQL propio sin errores `P2002` por teléfonos compartidos ([`domains/crm-b2b-and-loyalty.md`](domains/crm-b2b-and-loyalty.md)).

### ADR-194 — Zona horaria `America/Bogota` obligatoria en fechas visibles

- **Estado:** `Vigente`
- **Decisión:** Formatear toda fecha/hora visible exclusivamente con `apps/web/lib/datetime.ts` (`America/Bogota`), verificado por `datetime-convention.test.ts`.
- **Motivo:** Elimina desfases de +5 h por reloj UTC serverless ([`CONVENTIONS.md`](CONVENTIONS.md)).

### ADR-195 — Compras del equipo interno (`Contact.isStaff` y `selfDealing`)

- **Estado:** `Vigente`
- **Decisión:** Marcar `Contact.isStaff = true` para correos de `AdminUser` (excluidos de analítica/segmentos) y registrar `selfDealing: true` en `AdminActionLog` en autogestiones financieras.
- **Motivo:** Permite compras reales de prueba sin sesgar métricas ni auditoría.

---

## 8. Fidelización, marketing y carritos abandonados

### ADR-006 — Atención por WhatsApp vía enlaces `wa.me`

- **Estado:** `Vigente`
- **Decisión:** Usar enlaces `wa.me` con contexto pre-llenado sin API paga de WhatsApp Business ni Twilio.
- **Motivo:** Costo $0 y atención directa ([`integrations/github-and-ops.md`](integrations/github-and-ops.md)).

### ADR-069 — Cupones con vigencia en hora Colombia y advisory lock

- **Estado:** `Vigente`
- **Decisión:** Evaluar fechas de cupón en `America/Bogota`, registrar `CouponUsage` idempotente y serializar `maxUsesPerCustomer` con `pg_advisory_xact_lock`.
- **Motivo:** Impide superar topes de uso en checkouts paralelos.

### ADR-098 — Favoritos (`/mi-cuenta/favoritos`) sin marketing no autorizado

- **Estado:** `Vigente`
- **Decisión:** Guardar deseos del cliente (incluidos en baja Ley 1581) sin disparar correos promocionales sin consentimiento específico.
- **Motivo:** Respeta el principio de finalidad de Hábeas Data ([`COMPLIANCE.md`](COMPLIANCE.md)).

### ADR-145 — «Puntos Lucams» y referidos en `/admin/fidelizacion`

- **Estado:** `Vigente`
- **Decisión:** Operar acumulación/redención atómica (cupón → puntos, reversión proporcional) y referidos `/r/[codigo]` configurables desde `/admin/fidelizacion`.
- **Motivo:** Retención auditable en `LoyaltyTxn` ([`domains/crm-b2b-and-loyalty.md`](domains/crm-b2b-and-loyalty.md)).

### ADR-153 — Recuperación de carritos configurable y snapshots de abandono

- **Estado:** `Vigente`
- **Decisión:** Gobernar `lucams-cart-recovery` desde `/admin/carritos/configuracion` y guardar snapshots (`itemsSnapshot`, `closedReason`) en `AbandonedCart`.
- **Motivo:** Control sin redespliegue y diagnóstico completo tras vaciarse el carrito vivo.

### ADR-175 — Incentivo de puntos a invitados y retrocrédito verificado

- **Estado:** `Vigente`
- **Decisión:** Mostrar puntos potenciales a invitados y acreditarlos sobre compras de los últimos 30 días solo tras verificar titularidad del correo.
- **Motivo:** Impulsa registro poscompra bloqueando reclamos con correos ajenos.

---

## 9. Seguridad, sesiones y gobierno de CI/CD

### ADR-016 — Rate limiting en PostgreSQL y caché con `unstable_cache`

- **Estado:** `Parcialmente superseded` (caché en DB reemplazado por `unstable_cache`)
- **Decisión:** Ejecutar rate limit atómico con `public.rate_limit_check` (`lib/rate-limit.ts`) y cachear lecturas con `unstable_cache` + tags (`cms`, `catalog`, `redirects`).
- **Motivo:** Protección distribuida sin Redis externo ([`SECURITY.md`](SECURITY.md)).

### ADR-017 — Procesos programados con `pg_cron` + `pg_net` + Supabase Vault y GitHub Actions

- **Estado:** `Superseded` (descartado `pgmq` en favor de crons HTTP autenticados y workflows puntuales)
- **Decisión:** Ejecutar los **18 crons operativos** desde Supabase `pg_cron` + `pg_net` → `/api/cron/*` con `x-cron-secret` en **Supabase Vault** (más limpiezas SQL internas), **6 workflows puntuales de GitHub Actions** (`ci`, `nightly-full`, `backup`, `dr-drill`, `post-deploy-smoke`, `domain-watch`) y `RenderJob` (`ADR-136`).
- **Motivo:** Sin workers residentes ni límites de crons de Vercel, secretos fuera de texto plano y dead-man switch ([`integrations/supabase.md`](integrations/supabase.md)).

### ADR-043 — CSP estricta con nonce criptográfico por petición

- **Estado:** `Vigente`
- **Decisión:** Emitir nonce único en `apps/web/proxy.ts` junto con `Content-Security-Policy`, HSTS y cabeceras duras (`lib/security-headers.ts`).
- **Motivo:** Defensa XSS real sin `'unsafe-inline'` en scripts ([`SECURITY.md`](SECURITY.md)).

### ADR-045 — Primitivas obligatorias de resiliencia externa

- **Estado:** `Vigente`
- **Decisión:** Envolver integraciones HTTP en `fetchWithTimeout`, `withRetry` (backoff + jitter) y `CircuitBreaker` por proveedor.
- **Motivo:** Aísla lentitud o caídas de terceros ([`integrations/README.md`](integrations/README.md)).

### ADR-046 — Prevención de open-redirect (`safeRedirectTarget`)

- **Estado:** `Vigente`
- **Decisión:** Validar parámetros `next`/`redirect` y redirecciones CMS en `lib/safe-redirect.ts` exigiendo ruta interna del mismo origen.
- **Motivo:** Impide redirecciones abiertas post-login.

### ADR-047 — Captura deduplicada de errores de navegador (`ErrorReport`)

- **Estado:** `Vigente`
- **Decisión:** Recibir errores de cliente en `POST /api/log-error`, limpiar PII (`scrubPii`) y deduplicar por hash SHA-1.
- **Motivo:** Visibilidad de fallos reales sin inundar PostgreSQL ([`OBSERVABILITY.md`](OBSERVABILITY.md)).

### ADR-048 — Evidencia verificable en código y no-reintento en guías

- **Estado:** `Vigente`
- **Decisión:** Cerrar hallazgos solo con prueba en código/test y prohibir reintentos automáticos en `createShipment`.
- **Motivo:** Cero cierres cosméticos ni guías duplicadas.

### ADR-085 — Endurecimiento criptográfico post-OWASP

- **Estado:** `Vigente`
- **Decisión:** Exigir MFA TOTP admin, tokens públicos SHA-256 en reposo, sesión de checkout AES-256-GCM, backups GPG y chequeo HIBP k-anonymity.
- **Motivo:** Protección integral de credenciales, tokens y copias ([`SECURITY.md`](SECURITY.md)).

### ADR-087 — Reautenticación MFA reciente (`aal2 <= 10 min`)

- **Estado:** `Vigente`
- **Decisión:** Exigir `requireRecentMfa` (validando `amr` del JWT) en reembolsos, gestión admin/MFA, conciliación COD, fusiones CRM y exportaciones.
- **Motivo:** Mitiga sesiones administrativas desatendidas.

### ADR-088 — RUM y analítica sujetos a consentimiento explícito

- **Estado:** `Vigente`
- **Decisión:** Bloquear Web Vitals RUM, GA4 y `lucams_utm` hasta contar con `analytics === true` (`lib/cookie-consent.ts`).
- **Motivo:** Cumplimiento estricto de Ley 1581 ([`COMPLIANCE.md`](COMPLIANCE.md)).

### ADR-105 — Protección `protect-ramas-criticas` y migraciones reversibles

- **Estado:** `Vigente`
- **Decisión:** Bloquear push directo a `develop` y `production` (`bypass_actors: []`) exigiendo los **5 checks de `ci.yml`**, smoke post-deploy y SQL _expand-then-contract_.
- **Motivo:** Cero cambios sin CI verde y `vercel rollback` seguro ([`OPERATIONS.md`](OPERATIONS.md)).

### ADR-162 — Blindaje anti-logout fantasma en `proxy.ts`

- **Estado:** `Vigente`
- **Decisión:** Usar `prefetch={false}` hacia `/admin/*`, ignorar prefetches en idle-timeout, excluir `/api/*` de sesión en `proxy.ts`, frenar borrados espurios de refresh y re-sellar `customer_last_activity` si el JWT es válido.
- **Motivo:** Elimina cierres de sesión accidentales por prefetches o carreras SSR ([`SECURITY.md`](SECURITY.md)).

### ADR-183 — Compuerta HTTP de MFA obligatorio en `proxy.ts` y login

- **Estado:** `Vigente`
- **Decisión:** Redirigir desde `adminLoginAction` y `proxy.ts` hacia `/admin/seguridad?enroll=required` o `/admin/login/mfa` cuando falta `aal2`.
- **Motivo:** Evita bucles RSC en sesiones admin sin MFA completado.

---

## 10. Datos, base de datos, backups y retención

### ADR-026 — Banderas de funcionalidad en código/entorno sin tabla `FeatureFlag`

- **Estado:** `Vigente`
- **Decisión:** Controlar banderas estructurales por variables de entorno y constantes en código (`NEXT_PUBLIC_STORE_MODE`, `BILLING_DOCUMENT_ENABLED`), sin tabla `FeatureFlag`, usando `CmsField` `SETTING` para ajustes operativos en caliente.
- **Motivo:** Cero consultas extra por request y validación estática ([`CONVENTIONS.md`](CONVENTIONS.md)).

### ADR-027 — Proyecto Supabase dedicado para Staging (`lucams-stg`)

- **Estado:** `Vigente`
- **Decisión:** Aislar tres bases: local en Podman, `lucams-stg` (`develop`) y `lucams-prod` (`production`).
- **Motivo:** Pruebas reales de RLS, webhooks y resets sin tocar producción ([`OPERATIONS.md`](OPERATIONS.md)).

### ADR-059 — Backups diarios cifrados de DB y Storage en Cloudflare R2

- **Estado:** `Vigente`
- **Decisión:** Ejecutar cada día `backup.yml` (`pg_dump` + espejo Storage cifrados con GPG hacia R2, `BACKUP_KEEP=30`).
- **Motivo:** Bóveda DR externa independiente de Supabase ([`integrations/cloudflare.md`](integrations/cloudflare.md)).

### ADR-086 — Cobertura de los 5 buckets en backup y simulacro DR mensual

- **Estado:** `Vigente`
- **Decisión:** Respaldar los 5 buckets de Storage en R2 y verificar restauración completa cada mes con `dr-drill.yml`.
- **Motivo:** Protege catálogo, CMS y artes 300 DPI pagados.

### ADR-089 — Acotamiento del pool Prisma en entorno serverless

- **Estado:** `Vigente`
- **Decisión:** Parametrizar `connection_limit` y `pool_timeout` sobre `DATABASE_URL` en el cliente `@lucams/db`.
- **Motivo:** Previene saturar Supavisor ante picos serverless (`ADR-131`).

### ADR-091 — Limpieza de tablas muertas y gobernanza de esquema

- **Estado:** `Vigente`
- **Decisión:** Retirar tablas sin uso y exigir espejo de RLS + `REVOKE` en `supabase/migrations/` (event trigger `049`) para los 71 modelos Prisma.
- **Motivo:** Paridad SQL/Prisma verificada por `make verify-db`.

### ADR-095 — Semillas no destructivas y guarda `env-guard.mjs` fail-closed

- **Estado:** `Vigente`
- **Decisión:** Imponer `--dry-run` por defecto, semillas que respeten precios/stock y `assertDestructiveAllowed` auditado por `make audit-script-guards`.
- **Motivo:** Bloquea escrituras accidentales sobre producción ([`CONVENTIONS.md`](CONVENTIONS.md)).

### ADR-096 — Latido de frescura de backups (`backup_stale`)

- **Estado:** `Vigente`
- **Decisión:** Reportar éxito en `/api/cron/backup-heartbeat` y alertar `backup_stale` si pasan `>36 h` sin respaldo válido.
- **Motivo:** Detecta fallos silenciosos del backup diario ([`OBSERVABILITY.md`](OBSERVABILITY.md)).

### ADR-130 — Purga de diseños `READY` abandonados (>90 días sin orden)

- **Estado:** `Vigente`
- **Decisión:** Purgar diseños `READY` sin actividad ni vínculo con pedidos o cotizaciones tras 90 días.
- **Motivo:** Libera PNGs pesados de carritos no comprados.

### ADR-131 — Pool Prisma (`limit=5`, `timeout=20s`) y retry de conexión

- **Estado:** `Vigente`
- **Decisión:** Fijar `connection_limit=5`, `pool_timeout=20` y `runWithDbRetry` (3 intentos solo en `P1001`/`P1017`/`P2024` pre-ejecución).
- **Motivo:** Absorbe concurrencia RSC de Next.js 16 sin duplicar mutaciones.

### ADR-149 — Barrido de huérfanos en Storage y métrica de cuota

- **Estado:** `Vigente`
- **Decisión:** Limpiar objetos huérfanos en `purge-anon-designs` y medir peso por bucket en `/admin/observability`.
- **Motivo:** Control continuo de cuota de Storage.

### ADR-161 — Purga de bitácoras `pg_cron`/`pg_net`, alertas de cuota y retención STG

- **Estado:** `Vigente`
- **Decisión:** Purgar `cron.job_run_details` (14 d) y `net._http_response` (24 h), alertar `capacity_storage_high` (>800 MB) / `capacity_db_high` (>400 MB) y limitar retención no-PRD a 14 días.
- **Motivo:** Evita llenar disco por logs internos o pruebas de staging.

---

## 11. Observabilidad, rendimiento y calidad

### ADR-008 — Observabilidad propia en PostgreSQL sin Sentry

- **Estado:** `Vigente`
- **Decisión:** Centralizar `ErrorLog`, `ErrorReport`, crons, 12 reglas `AlertState` y `uptime-monitor-prd` en `/admin/observability`.
- **Motivo:** Costo $0 y redacción de PII en origen ([`OBSERVABILITY.md`](OBSERVABILITY.md)).

### ADR-022 — Plataforma SaaS externa de monitoreo de errores

- **Estado:** `Pendiente de activación externa`
- **Decisión:** Diferir SaaS externo mientras la observabilidad propia (`ADR-008`) cubra SLOs sin costo fijo.
- **Motivo:** Se reevaluará solo ante escala que exija APM distribuido ([`ROADMAP.md`](ROADMAP.md)).

### ADR-062 — Certificación continua de preparación productiva

- **Estado:** `Vigente`
- **Decisión:** Exigir salud de endpoints, RLS, pagos, envíos, backups, legales y smoke post-deploy en cada release.
- **Motivo:** Estándar operativo vivo en [`OPERATIONS.md`](OPERATIONS.md) y [`QA_CHECKLIST.md`](QA_CHECKLIST.md).

### ADR-066 — Evaluación honesta de SLOs (`evaluateSlo`) y gate Lighthouse

- **Estado:** `Vigente`
- **Decisión:** Exigir muestra mínima en SLOs (`sin datos suficientes` cuando falta volumen) y correr Lighthouse desktop/móvil en CI.
- **Motivo:** Sin falsos verdes estadísticos ni regresiones Web Vitals.

### ADR-067 — Certificación E2E de cobro real en sandbox

- **Estado:** `Vigente`
- **Decisión:** Ejecutar `wompi-sandbox.spec.ts` en `nightly-full.yml` validando cobro tarjeta `4242` → webhook firmado → orden `PAID` + guía sandbox.
- **Motivo:** Prueba real de dinero con terceros ([`TESTING.md`](TESTING.md)).

### ADR-113 — Fuentes decorativas aisladas en `/estudio`, Turnstile lazy y caché catálogo

- **Estado:** `Vigente`
- **Decisión:** Cargar las 6 fuentes del Estudio solo en `/estudio/*` (`preload: false`), diferir Turnstile y cachear catálogo con tag `catalog`.
- **Motivo:** Ahorra ~2 MB en el storefront público.

### ADR-132 — Subsets `.subset.woff2` y prioridad LCP en primeras filas

- **Estado:** `Vigente`
- **Decisión:** Servir subsets ligeros de `Fredoka` e `Inter` y marcar `priority` en las primeras imágenes visibles de grillas y PDP.
- **Motivo:** Mejora directa de LCP móvil.

### ADR-135 — Telemetría RUM extendida (`LONGTASK`, `PAGEWEIGHT` y selector)

- **Estado:** `Vigente`
- **Decisión:** Capturar Web Vitals con atribución DOM, tareas largas y peso de página hacia `/admin/performance` bajo consentimiento.
- **Motivo:** Diagnóstico exacto de cuellos de botella reales ([`OBSERVABILITY.md`](OBSERVABILITY.md)).

### ADR-154 — Auditoría responsive en 6 viewports (`audit-responsive.spec.ts`)

- **Estado:** `Vigente`
- **Decisión:** Auditar overflow horizontal y blancos táctiles sobre 6 perfiles Playwright (`desktop-chrome`, `mobile-chrome`, `mobile-landscape`, `tablet`, `tablet-landscape`, `desktop-large`).
- **Motivo:** Cobertura sistemática multi-pantalla ([`TESTING.md`](TESTING.md)).

---

## 12. Cumplimiento legal y tributario colombiano

### ADR-020 — Marco legal colombiano versionado en repositorio

- **Estado:** `Vigente`
- **Decisión:** Mantener Ley 1480, Ley 2439/2024 y Ley 1581/2012 trazadas en [`COMPLIANCE.md`](COMPLIANCE.md) y reflejadas en `/legal/*`.
- **Motivo:** Reglas del software alineadas con plazos legales vigentes.

### ADR-025 — Integración futura de facturación electrónica DIAN

- **Estado:** `Pendiente de activación externa`
- **Decisión:** Conservar el modelo tributario listo tras `BILLING_DOCUMENT_ENABLED = false` (`ADR-160`) hasta habilitar proveedor DIAN.
- **Motivo:** Evita acoplar proveedor prematuro o prometer factura no activa ([`STATE.md`](STATE.md)).

### ADR-071 — Operación como persona natural con exposición mínima de PII

- **Estado:** `Vigente`
- **Decisión:** Operar inicialmente como persona natural comerciante publicando los canales legales (`hola@lucamsshop.com`, `security@lucamsshop.com`).
- **Motivo:** Cumple identificación comercial protegiendo datos sensibles personales.

### ADR-072 — Paquete legal canónico de 8 documentos (`Versión 3`)

- **Estado:** `Vigente`
- **Decisión:** Versionar los 8 textos en `packages/db/legal-content/legal.*.md` (retracto 5 días hábiles, reembolso ≤15 días calendario Ley 2439/2024, excepción de personalizados).
- **Motivo:** Respaldo jurídico íntegro en modo `full` ([`COMPLIANCE.md`](COMPLIANCE.md)).

### ADR-079 — Prueba auditable del consentimiento (Ley 1581)

- **Estado:** `Vigente`
- **Decisión:** Exigir casilla desmarcada y registrar versión de política, fecha, canal e IP (`getClientIp`) en todo formulario con datos personales.
- **Motivo:** Prueba demostrable ante la SIC.

### ADR-080 — Paridad automática entre `.md` legales y `FALLBACK` en código

- **Estado:** `Vigente`
- **Decisión:** Validar en `legal-content-sync.test.ts` igualdad exacta entre `packages/db/legal-content/*.md` y `app/legal/*/page.tsx`.
- **Motivo:** Ningún despliegue sirve textos legales desfasados ([`CONVENTIONS.md`](CONVENTIONS.md)).

### ADR-106 — Garantía por producto (`1..120` meses) congelada en `OrderItem`

- **Estado:** `Vigente`
- **Decisión:** Estampar `Product.warrantyMonths` en `OrderItem.warrantyMonths` al comprar para calcular elegibilidad de reclamos.
- **Motivo:** Respeta la garantía vigente al momento de la compra (Ley 1480 art. 8).

### ADR-160 — Ocultamiento de solicitud tributaria (`BILLING_DOCUMENT_ENABLED = false`)

- **Estado:** `Vigente`
- **Decisión:** Apagar en UI y servidor la solicitud de documento tributario mientras `BILLING_DOCUMENT_ENABLED` sea `false` (`billing-document.ts`).
- **Motivo:** Cumple Ley 1480 arts. 23 y 29 evitando expectativas de factura electrónica aún no activa.

---

## 13. Proceso de ingeniería, tipografías y accesibilidad

### ADR-012 — Documentación viva de 3 niveles y cero arqueología

- **Estado:** `Vigente`
- **Decisión:** Organizar `docs/` en 3 niveles ([`README.md`](README.md)), actualizar en el sitio y confinar artefactos efímeros a `tmp/` (`make clean-tmp`).
- **Motivo:** Ahorro de contexto y cero bitácoras obsoletas ([`../CLAUDE.md`](../CLAUDE.md)).

### ADR-018 — Verificación técnica contra código y fuentes oficiales

- **Estado:** `Vigente`
- **Decisión:** Contrastar límites de proveedores, tarifas y normas contra código real o documentación oficial vigente.
- **Motivo:** Elimina decisiones basadas en supuestos desactualizados.

### ADR-019 — Continuidad operativa en `docs/STATE.md` e historial Git

- **Estado:** `Vigente`
- **Decisión:** Mantener el estado ejecutivo actual y pendientes abiertos en [`STATE.md`](STATE.md) (`<= 8 KB`), dejando la cronología a `git log`.
- **Motivo:** Contexto inmediato al iniciar cualquier sesión.

### ADR-021 — Fuentes locales `.subset.woff2` (`next/font/local`) y `.ttf` para `@napi-rs/canvas`

- **Estado:** `Vigente`
- **Decisión:** Cargar `Fredoka` e `Inter` desde `apps/web/assets/fonts/*.subset.woff2` con `next/font/local` (`app/layout.tsx`) y conservar `apps/web/assets/fonts/*.ttf` para las 6 fuentes del Estudio (`app/estudio/fonts.ts`) y el render 300 DPI en `@napi-rs/canvas` (`GlobalFonts`).
- **Motivo:** Cero descargas de Google Fonts en runtime/build, óptimo LCP y paridad tipográfica con imprenta ([`BRANDING.md`](BRANDING.md)).

### ADR-044 — Accesibilidad WCAG 2.1 AA con tokens de tinta y gate `axe`

- **Estado:** `Vigente`
- **Decisión:** Usar variantes accesibles (`--brand-muted`, `--brand-pink-ink`, `--brand-coral-ink`) en texto interactivo y exigir `0` fallos `serious`/`critical` en `a11y-contrast.test.ts` y `axe.spec.ts`.
- **Motivo:** Contraste AA real conservando la estética pastel ([`BRANDING.md`](BRANDING.md)).

### ADR-073 — Renderizado dinámico obligatorio en `/admin/*`

- **Estado:** `Vigente`
- **Decisión:** Forzar renderizado dinámico sin prerender estático en todo el árbol `/admin/*`.
- **Motivo:** Depende siempre de sesión autenticada `aal2` y datos vivos.
