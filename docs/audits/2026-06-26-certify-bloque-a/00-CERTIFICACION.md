Confirmed: `getEnv()` reads `WOMPI_ENV`, while the webhook env-match (route.ts:93) reads `NODE_ENV` — two sources of truth (finding #3 confirmed). I have everything needed. Issuing the verdict.

# Certificación Bloque A — Saga + Pagos · 2026-06-26

## Veredicto

🔴 **NO APTO PARA PRODUCCIÓN — bloqueante P0 abierto y reproducido empíricamente.**

El checkout **no puede vender una orden de 2 o más ítems**. El índice `InventoryLog_orderId_reason_unique` está sobre `(orderId, reason)` sin `variantId`, mientras `decrementStockForOrder` crea un `InventoryLog` por ítem con el mismo `orderId`+`ORDER_PAID` (stock.ts:141-149). Lo reproduje contra la DB real: el segundo INSERT lanza `duplicate key value violates unique constraint`. Como Wompi ya cobró cuando llega el webhook APPROVED, el resultado es **pago cobrado + orden atascada en PENDING_PAYMENT + stock no decrementado + sin guía + sin email + sin posibilidad de cancelar/reembolsar** — y como un carrito multi-ítem es el caso normal (CartItem no tiene unique en `(cartId,variantId)`, schema.prisma:425-456), rompe la mayoría de las ventas desde el día 1. Las defensas individuales (HMAC timing-safe, anti-replay, UPDATE atómico de stock, idempotencia por cartId) están bien construidas, pero ninguna salva este defecto estructural del ledger.

## Resumen de cobertura

- **Dimensiones auditadas:** idempotencia, race conditions, seguridad de pagos, ledger de stock, saga/state-machine, money-flow E2E.
- **Hallazgos:** 33 evaluados → **16 confirmados** (1 P0, 4 P1, 9 P2, 2 P3) · **17 refutados** como falsos positivos.
- **Verificación adversarial propia:** el P0 lo reproduje empíricamente contra la DB (`psql` sobre `DIRECT_URL`), no solo por lectura. Confirmé también: cero handlers de P2002 en `orders/stock/saga/checkout/webhook` (grep), cero `isolationLevel` en el repo, env-match sobre `NODE_ENV` vs `WOMPI_ENV` (route.ts:93 vs wompi.ts:32), e índice live = `(orderId, reason)` sin `variantId`.

## 🔴 Bloqueantes P0 (arreglar ANTES de cualquier cliente real)

| ID | Archivo:línea | Qué rompe | Escenario | Fix |
|----|---------------|-----------|-----------|-----|
| **P0-A** (hallazgos #4+#5) | `stock.ts:141-149` y `:221-229` vs `migration.sql:10-12` | Toda orden con 2+ ítems falla al decrementar/revertir stock: el 2º `inventoryLog.create` con mismo `(orderId, ORDER_PAID)` viola el índice unique → P2002 sin catch → rollback de la `$transaction` → Order queda PENDING_PAYMENT pese a Wompi APPROVED. Idéntico en revert (CANCELLED/REFUNDED multi-ítem imposibles). | Cliente compra 2 productos (o 1 personalizado con 2 diseños). Webhook APPROVED → item[0] OK, item[1] → P2002 → rollback. Wompi reintenta 3× idéntico. **Cobro real sin fulfillment, sin stock, sin guía, sin reembolso posible.** Reproducido en DB: `duplicate key value violates unique constraint "InventoryLog_orderId_reason_unique"`. | Cambiar el índice parcial a `UNIQUE (orderId, reason, variantId)` (mantener el `WHERE reason IN (...)`), reflejarlo como migración versionada, **y** capturar P2002 (`Prisma.PrismaClientKnownRequestError` code `P2002`) en `decrementStockForOrder`/`revertStockForOrder` como no-op idempotente. |

> Nota de severidad: los reportes #1, #7, #13 trataron este mismo índice como P2 "defensivo" creyendo que solo afectaba el caso concurrente webhook+fallback. Eso subestima el defecto: el problema **no necesita concurrencia** — basta una orden multi-ítem en flujo normal. El hallazgo #5 acertó al re-elevarlo a P0.

## 🟠 P1 — arreglar pronto (bug serio condicional)

| ID | Archivo:línea | Qué | Por qué duele |
|----|---------------|-----|---------------|
| **#6** | `saga.ts:155-174` | Pago cobrado sin stock (carrera sobre última unidad) queda en PENDING_PAYMENT sin flag, sin cola, sin alerta. Solo un `logger.error` que —por mandato #7 sin Sentry— nadie ve. | Comprador A y B sobre stock=1; B paga, `InsufficientStockError` → rollback → PENDING_PAYMENT mudo. Wompi recibe 200, no reintenta. Pérdida de plata + riesgo Ley 1480. Fix: persistir `status NEEDS_RECONCILIATION` + email/pgmq a Lucy fuera de la tx revertida. |
| **#8** | `gracias/page.tsx:84-134` | `/checkout/gracias` renderiza `ApprovedPage` SIEMPRE que `tx.status==='APPROVED'`, ignorando `result.status`. Si la saga retorna `shipment_failed` o lanza, el cliente igual ve "¡Pedido confirmado! ya empezamos a preparar tu pedido". | Cliente cree que su compra está confirmada cuando la Order quedó PENDING_PAYMENT sin stock. Oculta el reembolso pendiente. Fix: ramificar por `result.status`/`order.status` → `PendingPage` salvo PAID/FULFILLING real. |
| **#7** | `schema.prisma:392-403` vs `migration.sql` | El índice unique parcial (única barrera real contra doble-decremento concurrente bajo el TOCTOU del `findFirst`) existe SOLO en SQL, no en el modelo Prisma. P2002 no modelado en el client. | Drift: deuda real de schema-sync (aunque `migrate dev` no auto-dropea índices raw que no modela — ver refutaciones). El riesgo vivo es la mala semántica del P2002. Se resuelve junto con P0-A. |
| **#12** | `service.ts:127-152` + `schema.prisma:523` | Idempotencia por cartId es read-then-write en READ COMMITTED sin unique constraint sobre `Order.cartId`. Dos `finalizeCheckout` concurrentes pueden crear 2 Orders (números distintos) si T1 commitea entre el `findFirst` y el `count()` de T2. | Doble-click / reenvío de POST / dos pestañas → órdenes fantasma PENDING_PAYMENT; escenario catastrófico (doble cobro) condicional a pagar ambas URLs. Fix: `UNIQUE INDEX parcial Order(cartId) WHERE status='PENDING_PAYMENT' AND deletedAt IS NULL` + capturar P2002, o `pg_advisory_xact_lock(hash(cartId))`. |

## 🟡 P2 — defensa faltante (mejora, no bloquea)

- **#1/#13** `saga.ts:175-186` — P2002 por carrera benigna cae en `else { throw err }` → se loggea como `saga_unexpected_error` en vez de `idempotent_skip`. Ensucia la auditabilidad de idempotencia real vs benigna. (Se cierra con el fix de P0-A.)
- **#2** `saga.ts:144-154` — `clearCartAfterPaid` + `sendOrderConfirmation` corren FUERA de la `$transaction` y dentro del bloque `if status===PENDING_PAYMENT`. Crash entre commit y línea 154 → Order PAID con cart fantasma + sin email, **irrecuperable en reintento** (el guard PENDING_PAYMENT ya es falso). Fix: keyear por flag `confirmationSent` o ejecutarlos también con status PAID + tracking null.
- **#3** `route.ts:93-94` — env-match deriva de `NODE_ENV` mientras todo el módulo Wompi usa `WOMPI_ENV` (wompi.ts:32). En Vercel preview (`NODE_ENV=production` + `WOMPI_ENV=sandbox`) todos los webhooks sandbox legítimos → 401. Confirmado: `OPERATIONS.md:159` documenta que Vercel fuerza `NODE_ENV=production`. Fix: `expectedEnv = getEnv()==="production" ? "prod" : "test"`.
- **#9** `saga.ts:144-187` — `clearCartAfterPaid` (`prisma.cart.updateMany` desnudo) puede lanzar por blip de DB post-commit → cae en `else { throw err }` → aborta `createShipment`. Order PAID sin guía. (Corrección al hallazgo: `sendOrderConfirmation` NO propaga; está envuelto en try/catch en `emails.ts`.) Fix: envolver `clearCartAfterPaid` en su propio try/catch o moverlo tras `createShipment`.
- **#10** `saga.ts:430-455` + `schemas.ts:91-93` — VOIDED/refund de Wompi sobre Order ya PAID intenta PAID→CANCELLED (ilegal) → `OrderTransitionError` tragado → stock NO se revierte. Inventario sobre-comprometido hasta reconciliación manual. Fix: si Order PAID/FULFILLING/SHIPPED, transicionar a REFUNDED.
- **#11** `saga.ts:305-339` — `createShipment` OK pero transición a FULFILLING falla → guía Aveonline creada sin `trackingNumber` en DB. Reintento (`retryShipmentAction`) re-llama Aveonline → **doble guía / doble costo logístico**. Fix: persistir `trackingNumber` en update propio inmediatamente tras `createShipment` OK.
- **#15** `service.ts:50-58` — `generateOrderNumber` usa `count()+1` sin retry sobre P2002. Dos checkouts concurrentes de carts distintos chocan en `Order.number` → uno falla con error genérico → venta perdida. Fix: secuencia Postgres por año o retry con backoff.

## P3 (anotados, no bloquean)

- **#14** `gracias/page.tsx:99` — el fallback NO revalida `amount_in_cents` vs `order.total` (el webhook sí, route.ts:169). Inexplotable hoy (monto atado por firma de integridad + `order.total` inmutable), pero asimetría defensiva a simetrizar antes de habilitar edición de total.
- **#16** `saga.ts:144-152` — `clearCartAfterPaid` fuera de la tx PAID: si falla, el cart queda activo y un segundo checkout del mismo cart (la idempotencia filtra por `status='PENDING_PAYMENT'`, no cubre PAID) → doble cobro. Ventana estrecha. Fix: mover `clearCart` dentro de la tx + ampliar el guard de idempotencia a Order PAID por cartId.

## Riesgo de "no hay tests"

**Alto, y directamente responsable de que P0-A llegara a estar shipped.** Un único test de integración "orden de 2 ítems se paga y decrementa stock" lo habría atrapado en segundos — exactamente el caso que el índice rompe. Sin tests, este código que toca plata real depende de inspección manual, y el propio Bloque A fue diseñado adversarialmente pero NUNCA ejercitado. Para código de pagos, eso es deuda inaceptable pre-launch.

**Tests mínimos antes de producción (priorizados):**

1. **(P0)** Integración: orden de 2+ ítems → APPROVED → `processPaidOrder` decrementa cada variante una vez, crea N InventoryLog, Order=PAID. *(Hoy falla — es el regression test del P0-A.)*
2. **(P0)** Integración: cancelar/reembolsar orden multi-ítem PAID → revierte stock de todos los ítems.
3. **(P1)** Idempotencia: `processPaidOrder` invocado 2× (webhook + fallback) sobre la misma orden → un solo decremento, una sola guía.
4. **(P1)** Carrera de stock: 2 pagos sobre stock=1 → uno PAID, el otro a estado reconciliable visible (no PENDING_PAYMENT mudo).
5. **(P1)** Doble `finalizeCheckout` del mismo cart → exactamente 1 Order.
6. **(P2)** Webhook: HMAC inválido → 401; timestamp fuera de ±5min → 401; `amount_in_cents != total` → manual review, sin procesar.
7. **(P2)** `gracias` con saga `shipment_failed` → NO renderiza ApprovedPage.
8. **(P2)** VOIDED tras APPROVED → stock revertido o ruta de reconciliación.

## Lo que SÍ está bien hecho

Calibración honesta — **17 hallazgos fueron correctamente refutados** porque el código resistió ataques reales:

- **HMAC timing-safe (#refutado)** — `verifyWebhookSignature` usa `crypto.timingSafeEqual` sobre buffers de igual length con guarda previa; forjar checksum requiere `WOMPI_EVENTS_SECRET`. La firma corre **antes** de cualquier `skipTsCheck`, así que el footgun del flag (#refutado) no permite inyectar webhooks sandbox contra prod: el secret de prod los rechaza upstream con 401.
- **UPDATE atómico de stock** — `updateMany WHERE stock>=qty` (stock.ts:132-135) con row-lock implícito previene correctamente el oversell negativo bajo concurrencia, sin necesidad de Serializable. Dos pagos sobre la última unidad: uno gana, el otro `InsufficientStockError` → rollback limpio.
- **Idempotencia multicapa para single-item** — `trackingNumber` guard (saga.ts:95) + status guard (saga.ts:114) + InventoryLog lookup + índice unique frenan el doble-decremento, doble-email (Resend idempotency-key) y doble-guía en el caso de un solo ítem. El email duplicado alegado (#refutado) está cubierto por `Idempotency-Key` de Resend.
- **Regla de oro del revert** — revierte solo si existe `ORDER_PAID` previo (stock.ts:184-196); PENDING_PAYMENT→CANCELLED es no-op correcto, no crea `+N` fantasma. Estados terminales (`CANCELLED:[]`, `REFUNDED:[]`) hacen imposible el doble-revert.
- **El decremento + InventoryLog en la MISMA `$transaction`** — garantiza rollback atómico cuando algo falla; ninguna ruta crea un `ORDER_PAID` log sin decrementar stock.
- **Validación de monto en el webhook** (route.ts:169) + anti-replay ±5min + dedup `WebhookEvent` para retries idénticos de Wompi (el timestamp está firmado, así que un retry real produce eventKey idéntico).

El diseño es sólido en su mayoría; el P0 es un defecto puntual de modelado del índice, no una arquitectura podrida. Eso es alentador: el fix es acotado.

## Plan de remediación

**PRE-LAUNCH (bloqueante — sin esto NO se habilita Wompi a clientes reales):**

1. **P0-A — índice + P2002** (`stock.ts`, migración, `schema.prisma`): redefinir `UNIQUE (orderId, reason, variantId)` + capturar P2002 como no-op + test #1 y #2 verdes. **~3-4 h.**
2. **#8 — gracias no miente** (ramificar por `result.status`). **~1.5 h.**
3. **#6 — pago-sin-stock visible** (estado/flag de reconciliación + alerta a Lucy). **~3 h.**
4. **#12 — unique parcial en `Order(cartId)` + P2002 catch.** **~2 h.**
5. **#3 — env-match desde `WOMPI_ENV`.** **~0.5 h.**
6. **Tests mínimos #1-#5.** **~5-6 h.**

*Subtotal pre-launch: ~15-17 h.*

**POST-LAUNCH (semana 1, monitoreado):**

7. #2 + #9 + #16 — cart-clear/email idempotentes y dentro de la tx. **~3 h.**
8. #10 — VOIDED-sobre-PAID → REFUNDED con revert. **~2 h.**
9. #11 — persistir tracking antes de FULFILLING (anti doble-guía). **~1.5 h.**
10. #15 — secuencia Postgres para `Order.number`. **~2 h.**
11. #14 — simetrizar validación de monto en el fallback. **~0.5 h.**
12. Tests #6-#8. **~3 h.**

*Subtotal post-launch: ~12 h.*

**No certifico Bloque A hasta que P0-A esté corregido con su regression test verde.** Una vez cerrados los 5 ítems pre-launch + sus tests, el bloque pasa a **⚠️ APTO CON RESERVAS** y los P2/P3 se drenan en la primera semana.