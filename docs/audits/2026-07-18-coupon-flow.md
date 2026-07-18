# Auditoría: Flujo de cupones — fluidez (UX) + efectividad (correctitud del dinero)

**Fecha**: 2026-07-18
**Responsable**: Lucy + Claude
**Tipo**: qa-cupones (adversarial multi-agente, código real)
**Versión auditada**: rama `develop` (post `f45efad`)
**Mandato de Lucy**: «El proceso y flujo de cupones debe ser fluido y efectivo, asegúrate de eso.»

## Metodología

Auditoría adversarial multi-agente sobre el **código real** del flujo completo de cupones:
6 facetas en paralelo (UX aplicar/quitar · consistencia display/estado · invalidación &
re-confirmación · correctitud del cálculo · persistencia & ciclo de vida · bordes/abuso/
concurrencia) → **panel de verificación adversarial por hallazgo** (jueces que intentan
refutar o probar que ya está resuelto) → síntesis priorizada.

- **Agentes**: 25 · **Hallazgos verificados**: 18 · **Confirmados**: 17 · **Tokens**: ~1.23M.

## Veredicto

**El motor monetario es CORRECTO**: nunca cobra de más ni de menos en pantalla, jamás produce
totales negativos, y el invariante `usedCount == count(CouponUsage)` se mantiene bajo concurrencia
(incremento gateado atómico `usedCount < maxUses`). Las debilidades reales estaban en **fluidez**
(el camino del cupón-inválido era un callejón sin salida + banner alarmante) y **efectividad**
(un bug de zona horaria mataba las promos con fecha; el tope por-cliente era evadible por invitados).

Se remediaron los **9 fixes priorizados**, cada uno certificado (tsc + eslint `--max-warnings 0` +
prettier + build + tests unit/integración).

## Hallazgos y remediación

| # | Sev | Tipo | Hallazgo | Fix |
| --- | --- | --- | --- | --- |
| 1 | HIGH | correctitud | Cupones con fecha expiraban **~29 h antes** en hora Colombia (`validTo` a medianoche UTC = 7pm COT del día anterior) → la promo no funcionaba el último día | Nuevo módulo `features/coupons/dates.ts` (`cotStartOfDay`/`cotEndOfDay`, COT −05:00 fijo); `parsePayload` ancla la vigencia al día COT completo antes de `z.coerce.date()`; display admin en `America/Bogota`; defaults del form en COT. **Sin backfill**: no hay cupones reales (pre-lanzamiento). +tests |
| 2 | HIGH | fluidez | Cupón que dejaba de valer = **callejón sin salida**: caía a un input vacío con error rojo huérfano que no nombraba el cupón ni permitía quitarlo | `CouponField` con **tercer estado ámbar** que nombra el cupón + la razón + botón «quitar»; recuperación automática si el carrito vuelve a calificar |
| 3 | MED | fluidez | Al pagar con cupón inválido: banner rojo **«No pudimos procesar el pago»** (el cliente creía que falló la tarjeta) + round-trip redundante | Aviso **ámbar suave** con param propio `?couponNotice=` y título neutro; caso A (inválido al render) quita el cupón antes de finalizar → **sin rebote**; caso B (carrera) rebota con aviso suave, nunca cobro silencioso |
| 4 | HIGH | efectividad | `maxUsesPerCustomer` **100% evadible** en checkout de invitado (`customerId` null) → cupón «1 por persona» farmeable | Columna `CouponUsage.email` (normalizada); `priceCouponForCart` cuenta usos por **(customerId OR email)**; cierra también la evasión logueado→invitado. Best-effort (evadible con correos distintos) |
| 5 | MED | efectividad | `maxUses` global excedido bajo concurrencia (descuento sí otorgado) era **invisible** para el admin | La saga marca `needsReconciliation` **en la misma tx** que la transición a PAID (atómico), con motivo claro; no re-cobra (el dinero ya se capturó) |
| 6 | MED | a11y | El error del cupón no se anunciaba a lectores de pantalla | `role="alert"` + `aria-invalid` + `aria-describedby` en el input/error |
| 7 | LOW | correctitud | El tope PERCENT 1-100 se validaba solo al **crear**, no al **editar** | `validateCouponBusinessRules()` como fuente única llamada por create y update; `updateCouponAction` ahora distingue `CouponValidationError` |
| 8 | LOW | efectividad | `requiresMinQuantity` se medía sobre **todo el carrito** aunque el cupón filtrara por categoría/producto | Se mide sobre las unidades **elegibles**; `minOrder` se mantiene sobre el carrito completo (semántica documentada). +tests |
| 9 | LOW | fluidez | Pulido del `CouponField`: botón quitar sin spinner, foco perdido, submit vacío, placeholder en mayúsculas | `RemoveButton` con `useFormStatus`; foco al input solo en transición real (no en mount); `required`; `placeholder:normal-case` |

## No-issues (revisado y correcto)

- El cálculo (`priceCouponPure`): PERCENT (`Math.floor`), FIXED (capado a subtotal elegible),
  FREE_SHIPPING; descuento nunca excede el subtotal elegible ni va negativo; `ZERO_DISCOUNT` cuando
  no genera descuento.
- El invariante `usedCount == count(CouponUsage)` bajo pagos concurrentes (incremento gateado).
- La re-validación atómica en la tx de creación de la orden (`CouponInvalidatedError`, #8 de la
  auditoría v3) impide cobrar en silencio un total sin el descuento visto.
- Revert simétrico del cupón al cancelar/reembolsar (borra `CouponUsage` + decrementa `usedCount`).

## Acciones tomadas

- [x] 9 fixes implementados + tests (unit: `dates.test.ts` +4, `redemption.test.ts` +6).
- [x] Migración `20260718120000_coupon_usage_email` aplicada + `prisma generate`.
- [x] Certificado: tsc + lint + prettier + build + tests unit/integración.

## Decisión

**Flujo de cupones fluido y efectivo** — mandato de Lucy cumplido. El motor ya era correcto en lo
monetario; se cerraron los huecos de fluidez (cupón-inválido) y efectividad (timezone, tope
invitado). Residual documentado: `maxUsesPerCustomer` sigue siendo best-effort (evadible con correos
distintos) — aceptable para el lanzamiento.
