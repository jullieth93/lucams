taxes param exists in buildCheckoutUrl signature but `provider.createCheckout` never passes it. So Wompi gets no tax breakdown — fine for "IVA incluido" approach, but DIAN reporting later will need that breakdown.

I have enough to write the audit.

# Dimensión: CHECKOUT + WOMPI + AVEONLINE + SAGA

## Estado actual real

El flow de 3 pasos (datos → envío → pago) está cableado contra Wompi Web Checkout hosted y Aveonline cotizarDoble/generarGuia2, con saga POST‑PAID que crea guía + transiciona FULFILLING y webhook Aveonline que dispara SHIPPED/DELIVERED + emails. Webhook Wompi verifica HMAC, idempotencia por `(source, externalId)`, valida amount mismatch y maneja APPROVED/DECLINED/PENDING. Webhook Aveonline acepta `?secret=` o header (no HMAC documentado por Aveonline). La máquina de estados está definida (`ORDER_TRANSITIONS`) y validada en `transitionOrder`. Las piezas grandes que faltan o cojean: redención de cupón en checkout, decremento de stock al crear Order, vaciado del Cart tras PAID, refund/cancel desde admin, healthcheck Wompi/Aveonline, y la página de Integraciones aún pide envs Venndelo para “Aveonline”.

## Fortalezas

- Stepper limpio, server actions con Zod validation y errores tipados (`CheckoutError`, `OrderTransitionError`), redirects bien gobernados.
- Webhook Wompi: lee `raw body` previo a parse para HMAC byte‑exacto, idempotency con `eventKey = txId+status+timestamp`, devuelve 200 para no disparar reintentos cuando la saga falla (correcto según docs Wompi), valida amount mismatch antes de transicionar.
- `WompiPaymentProvider` desacoplado via `PaymentProvider` interface — Mercado Pago se enchufa cambiando una env var.
- Aveonline: cache 24h de carriers + agentes + token con refresh con 5 min buffer, `cotizarDoble` filtra `numbererror='-0-'` y loggea fallos por carrier, `formatAveonlineCity` con mapping especial Bogotá→Cundinamarca verificado vs `listadociudades.json`.
- Saga idempotente: si Order tiene `trackingNumber` ya, no re‑llama Aveonline. Tracking estados monotónicos (DELIVERED no retrocede a SHIPPED). Emails atrapan errores sin romper transición.
- Pickup data en SiteSettings (admin editable) en vez de env vars hardcodeadas — encaje correcto con perfil no‑técnico.
- Admin > Integraciones > Aveonline con UI funcional para registrar/listar/eliminar webhooks (createWebhook.php cableado, aunque pendiente de probarse con cuenta real).

## Debilidades

- Cero unit tests sobre `verifyWebhookSignature`, `transitionOrder`, `processPaidOrder`, `formatAveonlineCity`. Una sola línea de tests en todo el repo.
- Defaults silenciosos peligrosos: si `AVEONLINE_GENERATE_REAL` no está seteado, default es 0 — y con cuenta real eso ya causó cartera pendiente (problema confirmado).
- Comentarios mentirosos sobre features no implementadas (stock decrement, cupones).

## Findings detallados

### [P0] CW-01 — Cart NO se vacía tras Order PAID (riesgo de doble compra + doble cobro)

- **Categoría**: bug
- **Evidencia**: `apps/web/features/orders/service.ts:7-9` afirma "El Cart NO se elimina al crear Order. Se vacía solo cuando la Order transiciona a PAID (webhook Wompi)". No existe ningún call site que vacíe el cart. `grep -rn "clearCart\|emptyCart" features/` no encuentra implementación. `processPaidOrder` (saga.ts) nunca toca cart.
- **Impacto**: Cliente paga, vuelve al sitio, ve su carrito intacto, paga otra vez → doble Order PAID. Si webhook Wompi llega antes que el redirect a /gracias, problema seguro. Confirmado por código: el cookie `cart-session` no se rota tras PAID.
- **Recomendación**: en `processPaidOrder` tras `transitionOrder PAID`, marcar `Cart.deletedAt = now()` o vaciar items. En paralelo, `finishCheckoutSession` ya limpia la cookie del checkout en `/gracias` pero NO la cookie del cart.
- **Horas estimadas**: 2
- **Acción humana Lucy**: ninguna

### [P0] CW-02 — Decremento de stock NO implementado (oversell silencioso)

- **Categoría**: bug
- **Evidencia**: `apps/web/features/orders/service.ts:6` comenta "decremento de stock". `grep -n "stock" features/orders/service.ts` no encuentra ningún `update productVariant.stock`. Schema tiene `ProductVariant.stock Int @default(0)` (schema.prisma:372) + tabla `StockReservation` (schema.prisma:721) NUNCA usada en código (`grep -rn "stockReservation" features/` → nada).
- **Impacto**: dos clientes pueden comprar la misma unidad del último magnet. No hay reservation en PENDING_PAYMENT, no hay decremento en PAID. Critical para magnets edición limitada o seasonal.
- **Recomendación**: En `createOrderFromCart` (dentro de `prisma.$transaction`) hacer `update ProductVariant set stock = stock - qty where stock >= qty`. Si afecta 0 filas → throw `OUT_OF_STOCK`. Si no se quiere reservation real, al menos decrementar en PAID dentro de la saga.
- **Horas estimadas**: 6 (incluye revert en CANCELLED + tests)
- **Acción humana Lucy**: ninguna

### [P0] CW-03 — Aveonline: defecto `bloquegenerarguia` produce facturación con cuenta real

- **Categoría**: risk
- **Evidencia**: `apps/web/features/shipping/aveonline.ts:607` → `bloquegenerarguia: process.env.AVEONLINE_GENERATE_REAL === "true" ? "1" : "0"`. Confirmado por usuario: "bloquegenerarguia=0 con cuenta real genera cartera pendiente".
- **Impacto**: cualquier deploy/test sin env explícito puede generar guías facturables en producción. Las dos guías probe (86732744650, 535738810) están vivas en sistema Aveonline y deben anularse manualmente. En producción esto es deuda en cartera real con Aveonline.
- **Recomendación**: a) anular las 2 guías probe en dashboard Aveonline; b) cambiar el default a "1" (= bloquear) y exigir `AVEONLINE_GENERATE_REAL=true` para emitir; c) además, gatear por `AVEONLINE_ENV=production` AND flag explícito (doble candado); d) log warning con orderId cuando se envía con bloque=0.
- **Horas estimadas**: 1.5
- **Acción humana Lucy**: anular en dashboard Aveonline las guías 86732744650 y 535738810, confirmar a soporte que no se facturen.

### [P0] CW-04 — Webhook Wompi sandbox URL no registrada → flujo PAID no se cierra automáticamente

- **Categoría**: gap
- **Evidencia**: contexto inicial + workaround `simulate-wompi-webhook.mjs`. Webhook handler está completo y verificando firma, pero Wompi dashboard sandbox no apunta a URL pública. Esto deja la saga colgada — el `/checkout/gracias` muestra APPROVED via `getTransaction`, pero `processPaidOrder` nunca se ejecuta hasta que alguien simule el webhook manualmente.
- **Impacto**: bloqueante para validar saga end‑to‑end en sandbox sin intervención manual; en producción se asume Wompi sí permite registrar URL.
- **Recomendación**: opcional para desbloquear sandbox: en `/checkout/gracias` cuando `tx.status === "APPROVED"` y order está aún `PENDING_PAYMENT`, ejecutar `processPaidOrder` como fallback idempotente (la saga ya es idempotente por `trackingNumber`). Esto cubre also producción si webhook llega tarde. Documentar como "best-effort sync fallback".
- **Horas estimadas**: 2
- **Acción humana Lucy**: en dashboard productivo Wompi registrar URL `https://lucamsshop.co/api/webhooks/wompi`.

### [P1] CW-05 — Cupones: CRUD admin sin redención en checkout

- **Categoría**: stub
- **Evidencia**: `apps/web/features/orders/service.ts:137` → `const discount = 0; // TODO: aplicar cupón en F2.1 si input.couponCode`. `CreateOrderInputSchema.couponCode` existe (orders/schemas.ts:66) pero `OrderSummary`, `datos-form`, `envio-step`, `pago-page` NO tienen input de cupón. No hay `validateCoupon` / `applyCoupon` / `recordCouponUsage` en código (grep vacío).
- **Impacto**: feature publicitada en admin que el cliente no puede usar. Riesgo de PR comercial cuando lance.
- **Recomendación**: a) campo "Tenés un cupón?" en `/checkout/pago` o `/carrito`; b) `validateCoupon(code, cartTotal, customerId)` que valide vigencia + minOrder + maxUses + maxUsesPerCustomer + categorías/productos; c) recalcular total + persistir `CouponUsage` en `createOrderFromCart` dentro del mismo `$transaction`; d) FREE_SHIPPING setear `shippingCost = 0`.
- **Horas estimadas**: 12
- **Acción humana Lucy**: ninguna

### [P1] CW-06 — Página /admin/integraciones pide envs Venndelo para Aveonline (regresión legacy)

- **Categoría**: bug
- **Evidencia**: `apps/web/app/admin/(panel)/integraciones/page.tsx:207-225` la entrada "Aveonline — Envíos Colombia" tiene `envVarsRequired: ["VENNDELO_API_KEY", "VENNDELO_API_URL", "VENNDELO_PICKUP_*"]`. Vars que NO existen en código Aveonline (`grep VENNDELO_ aveonline.ts` → 0 matches; el provider real usa `AVEONLINE_USUARIO`, `AVEONLINE_CLAVE`, `AVEONLINE_ENV`, `AVEONLINE_GENERATE_REAL`, `AVEONLINE_WEBHOOK_SECRET`).
- **Impacto**: Lucy ve "Aveonline · sin configurar" aunque esté funcionando OK. Pierde la señal real del estado. Mancha el dashboard de salud.
- **Recomendación**: reemplazar el bloque por `["AVEONLINE_USUARIO", "AVEONLINE_CLAVE", "AVEONLINE_ENV", "AVEONLINE_GENERATE_REAL", "AVEONLINE_WEBHOOK_SECRET"]` + cambiar `venndeloConfigured` a `aveonlineConfigured`. Agregar healthcheck real `/api/health/aveonline` que llame `getAuthToken()`.
- **Horas estimadas**: 1.5
- **Acción humana Lucy**: ninguna

### [P1] CW-07 — Race condition en `generateOrderNumber` por count() + create

- **Categoría**: bug
- **Evidencia**: `apps/web/features/orders/service.ts:49-57`. `generateOrderNumber` hace `tx.order.count` luego `tx.order.create` con `number = LCM-YYYY-${count+1}`. La transacción usa default isolation (read-committed). Dos transacciones concurrentes ven el mismo count → colisión P2002.
- **Impacto**: bajo riesgo en volumen actual, pero al lanzar con tráfico concurrente, el checkout falla con error opaco "db". Order.number unique se va a chocar.
- **Recomendación**: dos opciones — (a) usar Postgres sequence dedicado (`CREATE SEQUENCE order_number_seq_2026`) + `nextval()`; o (b) try/catch P2002 con retry x3 jitter. Opción (a) es más limpia.
- **Horas estimadas**: 3
- **Acción humana Lucy**: ninguna

### [P1] CW-08 — Idempotency cart→order frágil (heurística 30 min sin cartId guardado)

- **Categoría**: risk
- **Evidencia**: `apps/web/features/orders/service.ts:124-151`. `findFirst` busca Order PENDING_PAYMENT del mismo customerId en últimos 30 min. Pero `Order` no guarda `cartId` (comentario: "No nos basamos en cartId porque Order no lo guarda — esto es best-effort"). Para guest checkout (`customerId=null`), match falla → potencial Order duplicada.
- **Impacto**: cliente refresca página `/checkout/pago` y dispara `payWompiAction` 2x → 2 Orders idénticas. Especialmente guest. Aún con idempotency heuristic, ambos casos ya tienen Wompi reference distintas → 2 cobros si el cliente paga ambos links.
- **Recomendación**: agregar `Order.cartId String?` (con FK opcional) + buscar `cartId + status=PENDING_PAYMENT` antes de crear. Migration + backfill noop.
- **Horas estimadas**: 3
- **Acción humana Lucy**: ninguna

### [P1] CW-09 — Refund/Cancel flow desde admin no existe

- **Categoría**: gap
- **Evidencia**: `ORDER_TRANSITIONS` permite `PAID → REFUNDED`, `FULFILLING → CANCELLED`, etc. (schemas.ts:89-98), pero `grep -rn "transitionOrder.*REFUNDED\|refund" features/ app/` retorna solo comentarios — ninguna server action en `/admin/pedidos/*` que invoque. No hay llamada `/v1/transactions/{id}/void` ni `/v1/transactions/{id}/refunds` en `lib/wompi.ts`.
- **Impacto**: si un cliente pide retracto Ley 1480 (5 días hábiles, OBLIGATORIO en Colombia), Lucy no tiene botón. Tiene que ir a Wompi dashboard, refund manual, y luego no hay nada en DB que reflejé el estado. Compliance issue.
- **Recomendación**: a) agregar `voidTransaction(id)` y `createRefund(id, amount)` en `lib/wompi.ts`; b) acción admin en `/admin/pedidos/[id]/refund` que llame Wompi + transicione `REFUNDED`; c) email order-refunded; d) si shipped, cancelar guía Aveonline antes (endpoint `cancelarGuia`).
- **Horas estimadas**: 16
- **Acción humana Lucy**: ninguna por ahora; al lanzar definir política exacta de retracto.

### [P1] CW-10 — Webhook Wompi acepta evento sin validar `environment` ni edad del timestamp

- **Categoría**: risk
- **Evidencia**: `apps/web/app/api/webhooks/wompi/route.ts` + `lib/wompi.ts:227` — `WompiWebhookEvent.environment` se tipa pero no se valida que coincida con el env configurado. `parsed.timestamp` se incorpora al checksum pero no se rechazan timestamps de >5 min (anti-replay).
- **Impacto**: si Wompi sandbox envía a producción accidentalmente, o un atacante replea un body antiguo capturado de logs, pasa la verificación (la firma es válida) y se procesa. Bajo, porque la idempotency dedup por eventKey limita re-procesamiento, pero el ataque "cambiar Order entre PENDING/CANCELLED por replay" es teórico.
- **Recomendación**: a) rechazar si `event.environment !== expectedEnv`; b) rechazar si `now - event.timestamp*1000 > 300_000` (5 min).
- **Horas estimadas**: 1
- **Acción humana Lucy**: ninguna

### [P2] CW-11 — DIAN factura electrónica solo schema-ready, sin envío

- **Categoría**: stub
- **Evidencia**: `Order.dianStatus`, `dianCufe` en schema + `BillingSchema` recolecta datos. Pero no hay integración con proveedor DIAN (Alegra/Siigo/etc.) ni job que mueva `dianStatus PENDING → SENT`. `service.ts:138` comenta "DIAN reporting en F2.4".
- **Impacto**: aceptable hoy (F2.4 documentada), pero si Lucy lanza sin esto y emite factura, hay incumplimiento DIAN.
- **Recomendación**: documentar en `/checkout/pago` que la factura se emite "dentro de las 48h" mientras no esté la integración. O bloquear el checkbox de factura hasta que esté listo.
- **Horas estimadas**: 0.5 (mensaje UX) / 20+ (integración real)
- **Acción humana Lucy**: decidir si lanzar con factura postpuesta vs sin opción de factura.

### [P2] CW-12 — `taxes` param en buildCheckoutUrl no se usa → DIAN sin breakdown IVA

- **Categoría**: tech-debt
- **Evidencia**: `lib/wompi.ts:88` acepta `taxes`. `features/payments/wompi.ts:49-57` `createCheckout` NO los pasa. Doc Wompi recomienda incluir IVA breakdown para facturación DIAN downstream.
- **Impacto**: cuando se conecte DIAN, Wompi no devolverá taxes en transactions; tendremos que recalcular off‑band. Pequeño.
- **Recomendación**: calcular IVA 19% reverso del precio (precio = base × 1.19) y pasarlo en `taxes: [{type:"VAT", amountInCents: round(total - total/1.19)}]`.
- **Horas estimadas**: 2
- **Acción humana Lucy**: ninguna

### [P2] CW-13 — Saga sin Outbox/Cola: webhook retry de Wompi puede dejar Order PAID sin guía

- **Categoría**: risk
- **Evidencia**: `route.ts:168-177` cuando `processPaidOrder` lanza, hace catch + log + `processedAt = now` + return 200. El webhook se marca como procesado aunque el shipment haya fallado. No hay reintento automático.
- **Impacto**: Order queda PAID pero sin guía; Lucy lo ve en `/admin/pedidos`. Sin alerta proactiva. La saga es idempotente pero alguien tiene que dispararla de nuevo.
- **Recomendación**: agregar job pgmq + pg_cron (mandato #11 CLAUDE.md) que escanee `Order.status=PAID AND trackingNumber IS NULL AND updatedAt < now - 5 min` y re‑ejecute `processPaidOrder`. Tope reintentos = 3, después → admin notification.
- **Horas estimadas**: 8
- **Acción humana Lucy**: ninguna

### [P2] CW-14 — `processFailedPaymentOrder` desde PENDING_PAYMENT solo cancela: no libera reserva ni notifica con razón clara al cliente

- **Categoría**: improvement
- **Evidencia**: `saga.ts:378-403`. Si Wompi DECLINED, se hace `transitionOrder CANCELLED` + email "pago rechazado". No revierte stock (no hay decremento todavía — ver CW-02) ni invita explícitamente a reintentar con otro método.
- **Impacto**: cliente frustrado, no sabe qué método probar.
- **Recomendación**: el email `orderPaymentFailedEmail` debe sugerir métodos alternativos (PSE, Bancolombia transfer, Nequi) + link directo `/carrito` con su cart intacto. Validar que ese cart no se haya vaciado por CW-01 si se resuelve.
- **Horas estimadas**: 2
- **Acción humana Lucy**: ninguna

### [P2] CW-15 — `quoteShipping` sin cache: cada step 2 dispara llamada Aveonline (latencia + cuota)

- **Categoría**: improvement
- **Evidencia**: `features/checkout/service.ts:103-203`. Cada navegación a `/checkout/envio` re‑cotiza. Cache 24h existe para auth/agents/carriers pero no para quotes por (destino + cart hash).
- **Impacto**: latencia 1-3s por hop + consume cuota Aveonline si demoras 10 min. Aveonline puede rate-limitar.
- **Recomendación**: cache en Postgres (`ShippingQuoteCache` table) por `hash(cartItems + destinationCity)` TTL 30 min.
- **Horas estimadas**: 4
- **Acción humana Lucy**: ninguna

### [P2] CW-16 — Cero tests sobre módulos críticos de checkout/payments/saga

- **Categoría**: tech-debt
- **Evidencia**: contexto inicial "1 test file (essentially empty harness)". `verifyWebhookSignature`, `canTransition`, `formatAveonlineCity`, `generateIntegritySignature` — todos sin cobertura.
- **Impacto**: regresiones invisibles. Cambiar `formatAveonlineCity` rompió cotizaciones la última vez.
- **Recomendación**: vitest + fixtures con un body real de webhook Wompi (sin secret real). Cubrir al menos: HMAC ok/ko, state transitions legales/ilegales, city formatting incluido Bogotá, amount mismatch path.
- **Horas estimadas**: 12
- **Acción humana Lucy**: ninguna

### [P3] CW-17 — Variable `SANDBOX_CHECKOUT` con nombre engañoso (URL es la misma en prod)

- **Categoría**: docs-drift
- **Evidencia**: `lib/wompi.ts:27` `const SANDBOX_CHECKOUT = "https://checkout.wompi.co/p/";` usada para sandbox y prod (Wompi diferencia por public-key, no por host de checkout).
- **Impacto**: confunde al lector; alguien podría intentar agregar `PRODUCTION_CHECKOUT` distinto y romper.
- **Recomendación**: rename a `CHECKOUT_URL` con comentario "mismo host para test/prod; diferenciación via pub_test_/pub_prod_".
- **Horas estimadas**: 0.25
- **Acción humana Lucy**: ninguna

### [P3] CW-18 — `apps/web/app/checkout/_components/stepper` referencia a `/contacto` que puede no existir

- **Categoría**: gap
- **Evidencia**: `envio/page.tsx:124-128`, `gracias/page.tsx:229-233` linkean a `/contacto`. No verifiqué existencia.
- **Impacto**: si la ruta no existe, 404 desde checkout — mala UX en momento crítico.
- **Recomendación**: verificar `app/contacto/page.tsx` y, si falta, sustituir por `wa.me` directo con mensaje contextual incluyendo número de pedido.
- **Horas estimadas**: 0.5
- **Acción humana Lucy**: ninguna

### [P3] CW-19 — Webhook Aveonline en `NODE_ENV !== production` permite sin secret

- **Categoría**: risk
- **Evidencia**: `route.ts:35-37`. En dev sin `AVEONLINE_WEBHOOK_SECRET`, retorna 503 solo en producción; en dev acepta cualquier body sin validar firma.
- **Impacto**: superficie de ataque local; un dev puede creer que `?secret=` funciona pero realmente no lo está validando.
- **Recomendación**: requerir secret SIEMPRE; documentar que `dev` debe setear `AVEONLINE_WEBHOOK_SECRET=dev-test-secret` en `.env.local`.
- **Horas estimadas**: 0.25
- **Acción humana Lucy**: ninguna

## Resumen final

El esqueleto del checkout + saga es sólido y los webhooks tienen las primitivas de seguridad correctas (HMAC, idempotencia, validación de monto). Lo que bloquea lanzamiento productivo no son bugs gigantes en el flow happy-path: son piezas faltantes que se asumen funcionando — cart no se vacía tras PAID (CW-01), stock nunca se decrementa (CW-02), default Aveonline factura cartera real (CW-03), y no hay refund/cancel (CW-09). Los P1 (cupones sin redención, race en order number, integraciones page rota, anti-replay webhook) son alto impacto pre-launch y suman ~35h. Recomiendo no abrir tráfico real hasta CW-01/02/03 estén cerrados y haya tests sobre la saga.