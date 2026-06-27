All claims confirmed. There are three independent callers of `processPaidOrder` (webhook, /gracias fallback, admin retry), the webhook dedup key includes the timestamp (so a Wompi retry with a fresh timestamp passes), and the PAID-with-null-tracking branch (saga.ts:249, falling through to createShipment at 335) never enters the stock `$transaction`, so the `StockAlreadyAppliedError` backstop never fires on that path. The read-then-act guard at saga.ts:140 plus the tracking write at saga.ts:382 (after the Aveonline call) leave a genuine TOCTOU window for a double guide.

All the other findings hold up against the real code. My verdict follows.

# Verificación fixes post-launch Bloque A — 2026-06-27

## Veredicto global

⚠️ **CORRECTOS CON OBSERVACIONES MENORES — con UNA excepción que sube a P1.** Los 5 fixes hacen lo que prometen en el camino feliz y en la concurrencia *desde PENDING_PAYMENT* (ahí el backstop físico del ledger `StockAlreadyAppliedError` los cubre). Pero el FIX #11 deja un hueco real: en el path de una orden **ya PAID con `trackingNumber=null`** (createShipment lento/falló en un pase previo), dos invocaciones concurrentes de `processPaidOrder` saltan el bloque PENDING_PAYMENT (saga.ts:249) y por tanto **nunca entran a la `$transaction` de stock donde vive el único punto de serialización real** — ambas llegan a `createShipment` (saga.ts:335) y generan dos guías Aveonline. El guard `if (order.trackingNumber)` (saga.ts:140) es read-then-act y el tracking se persiste recién en saga.ts:382, *después* de llamar a Aveonline. Verifiqué los tres disparadores concurrentes posibles (webhook con timestamp fresco que pasa el dedup `eventKey` de route.ts:115, fallback /gracias, admin-reintentar) y la ausencia de FOR UPDATE / advisory lock. El hueco es exactamente el daño que #11 dice prevenir. El resto son P2/P3 honestos.

## Estado por fix

| Fix | Veredicto | Confianza | Una línea |
|-----|-----------|-----------|-----------|
| #11 — persistir trackingNumber tras createShipment | ⚠️ Correcto con hueco P1 | high | Cubre el reintento secuencial limpio, pero NO el concurrente sobre orden ya-PAID-sin-tracking → doble guía Aveonline (saga.ts:249→335). |
| #2/#9/#16 — clearCart en tx + email idempotente | ⚠️ Correcto con obs. | high | Atomicidad PAID+clearCart perfecta; pero `confirmationSentAt` se marca aunque el email falle (P2 pérdida silenciosa). |
| #10 — target legal en processFailedPaymentOrder | ✅ Núcleo correcto | high | Todos los targets son transiciones legales y revierten stock; carrera APPROVED+VOIDED (P2) + copy REFUNDED (P3) heredados. |
| #14 — validación de monto en /gracias | ✅ Correcto | high | Simétrico con el webhook (route.ts:169); muestra página honesta sin procesar ante mismatch. |
| #15 — retry colisión Order.number | ✅ Correcto | high | Detección por nombre de índice disjunta, tx fresca por intento, count avanza; sin tests (P3). |

## Issues nuevos a corregir

| Sev | Issue | Ubicación |
|-----|-------|-----------|
| **P1** | Doble guía Aveonline en reintento **concurrente** sobre orden ya PAID con tracking=null: ambos saltan la `$transaction` de stock → el backstop `StockAlreadyAppliedError` nunca corre → 2 guías + doble costo. FIX #11 no cubre este path (el read-then-act de saga.ts:140 + write tardío de saga.ts:382 no serializan). | apps/web/features/orders/saga.ts:249 |
| **P2** | Guía huérfana + posible segunda guía cuando el update de `trackingNumber` falla (saga.ts:391): la guía ya existe en Aveonline pero no se persistió; cualquier reintento (incluso secuencial) re-llama createShipment. El comentario saga.ts:379-380 es falso para este caso. | apps/web/features/orders/saga.ts:391 |
| **P2** | `confirmationSentAt` se marca aunque `sendEmail` devuelva `{sent:false}` (circuito abierto, sin API key, 4xx, retries agotados): el cliente nunca recibe la confirmación y la saga jamás la reintenta. Única traza: `logger.error` invisible (mandato #7 sin Sentry). | apps/web/features/orders/emails.ts:117-126 |
| **P2** | Carrera APPROVED+VOIDED casi-simultánea pierde el VOIDED por TOCTOU: target precalculado (saga.ts:567) queda ilegal contra el status fresco (PAID) re-leído en transitionOrder (service.ts:347) → `OrderTransitionError` tragado en saga.ts:585 → orden "pagada fantasma" sin refund. | apps/web/features/orders/saga.ts:545 |
| P3 | Comentario "Fire-and-forget" falso: el `update` de `confirmationSentAt` sin try/catch (emails.ts:123) bajo `await` desnudo (saga.ts:267) puede abortar la creación de guía ante un blip de DB. Recuperable en reintento. | apps/web/features/orders/saga.ts:267 |
| P3 | Email "pago rechazado" enviado también en el caso REFUNDED real → copy contradictorio (cliente que sí pagó recibe "tu pago no se completó"). Solo UX. | apps/web/features/orders/saga.ts:584 |
| P3 | `MAX_NUMBER_RETRIES=5` agotable bajo >5 checkouts concurrentes en el mismo boundary de `count()` (la concurrencia ladderea las colisiones, no la aleatoriedad). Probabilidad ínfima para tienda de Instagram. | apps/web/features/orders/service.ts:110 |
| P3 | Sin cobertura de test para el retry #15 ni para el shape de `meta.target` (driver-dependiente, admitido en stock.ts:44): un cambio futuro a PrismaPg podría romper `isOrderNumberCollision` silenciosamente. | apps/web/features/orders/service.ts:134 |

## Recomendación

**No commitear como "los 5 fixes cerrados" sin antes resolver el P1.** Es el único hallazgo que reabre el daño exacto que el fix pretendía cerrar (doble guía + doble costo logístico real), y el path es alcanzable con disparadores que ya existen en el código (webhook retry con timestamp distinto + fallback /gracias o admin-reintentar). El fix correcto es un claim atómico antes de `createShipment`: `updateMany WHERE id=order.id AND trackingNumber=null AND shipmentClaimedAt=null SET shipmentClaimedAt=now()` y abortar si `count!=1`, o un `pg_advisory_xact_lock(hashtext(order.id))` alrededor de los pasos 7-8. El mismo claim resuelve de paso el P2 de la guía huérfana (saga.ts:391).

Los dos P2 restantes (email perdido silencioso en emails.ts:117-126; carrera APPROVED+VOIDED en saga.ts:545) son corrupciones genuinas pero de menor radio: el de email es solo email, el de VOIDED requiere simultaneidad casi exacta de dos webhooks Wompi de distinto status. **Razonable** dejarlos para el arranque de Bloque B *si* se documentan como deuda conocida en `docs/STATE.md` y se prioriza el P1. Los P3 son pulido (templates, tests, subir el retry a ~10 o usar `CREATE SEQUENCE`).

Veredicto operativo: **corregir el P1 antes del commit; los demás pueden ir como deuda priorizada a Bloque B.**