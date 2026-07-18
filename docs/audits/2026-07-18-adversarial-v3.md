# Auditoría: Verificación adversarial multi-agente v3 (pre-producción, rigor UX/UI web + móvil)

**Fecha**: 2026-07-18
**Responsable**: Lucy + Claude
**Tipo**: productive-readiness + security + ux/a11y + estudio-wysiwyg + contenido/seo + ops (barrido integral)
**Versión del sitio auditada**: `550b7ae` (rama `develop`)
**Versión tras remediación**: esta rama `develop` (ver commits en «Acciones tomadas»)

## Metodología

Verificación adversarial multi-agente sobre el **código real** (no sobre la doc), con
mandato explícito de rigor máximo en UX/UI **web y móvil**, y libertad para tomar los
roles necesarios (comercio, seguridad, estudio WYSIWYG, UX, accesibilidad, contenido/SEO,
operación). Pipeline:

1. **Finders** por dimensión (7 dimensiones) barren el código en paralelo.
2. **Paneles de verificación adversarial** por hallazgo: cada finding se somete a jueces
   independientes que intentan **refutarlo** (correctitud, seguridad, reproducibilidad).
   Solo sobrevive lo que resiste el intento de refutación.
3. **Crítico de completitud**: «¿qué falta? ¿qué modalidad no se corrió?».
4. **Síntesis** con score por dimensión + veredicto + top fixes + quick wins.

Verificación cruzada con evidencia ejecutable donde aplicó: renders headless
(`@napi-rs/canvas`), capturas Playwright a 390 px (móvil) y desktop, axe-core, y consultas
directas a la DB de dev.

- **Agentes**: ~253 · **Hallazgos crudos**: 183 · **Confirmados tras verificación**: 218
  (blocker 5 · high 16 · medium 116 · low 81).

## Veredicto de entrada

**Score global: 47/100 — NO LANZAR.** El sitio vende, pero con **3 blockers en el camino
del dinero**, el **diferenciador #1 (Estudio) roto en su mandato «pantalla = físico»**, y
**contradicciones legales** con peso real (Ley 1581 / Ley 1480).

### Scores por dimensión (entrada → tras remediación de blocker+high)

| Dimensión | Score | Diagnóstico de entrada |
| --- | --- | --- |
| Comercio (dinero + saga + concurrencia) | **38** | 3 blockers en el camino del dinero: doble cobro COD→Wompi, webhook DECLINED que cancela órdenes pagadas, orden atascada por P2002. |
| Seguridad (authz + validación + privacidad + tokens) | **62** | AuthZ/RLS sólidos. Lo grave: Ley 1581 — la supresión no anonimiza `Order.email`/`phone`. |
| Estudio (WYSIWYG producción) | **36** | Polaroid invendible (autosave revienta + marco opaco), filtro de calendario no llega al PNG, fallback exporta a resolución de pantalla. |
| UX web/móvil | **54** | 5/9 personalizables bloqueados como «Agotado», `/ocasion` sin header/footer, checkout congelado 7-11 s, FABs del Estudio encimados en móvil. |
| Accesibilidad | **58** | Sin bloqueos duros (axe: 1 contraste en 404). Estudio poco accesible (modales sin focus trap). |
| Contenido (copy + brand + SEO) | **53** | Contradicciones con peso legal (retracto, «cubrimos el costo»), reseñas demo como «historias reales». |
| Operación (emails + observabilidad + tests) | **48** | Patrón dominante: **fallar en silencio**. |

## Hallazgos y remediación

### Blockers (5/5 resueltos)

1. **[money] COD bloqueada reusada para Wompi sin normalizar `paymentMethod`** → guía sale
   contraentrega y el mensajero cobra el total OTRA VEZ. → **Tanda A** (`8aa29b8`).
2. **[money] Webhook DECLINED/VOIDED no verifica a qué transacción pertenece** → un decline
   de un intento viejo cancela/REFUNDED una orden realmente pagada. → **Tanda A** (`8aa29b8`).
3. **[concurrency] Orden con 2 items del mismo variant nunca pasa a PAID** (P2002 del ledger
   de stock) → dinero cobrado, orden atascada. → **Tanda A** (`8aa29b8`, `aggregateByVariant`).
4. **[estudio] Polaroid: marco SVG opaco** (rect blanco + checkerboard) tapa la foto en
   editor, preview y PNG de producción. → **Tanda B** (`618c293`).
5. **[estudio] Auto-save del Polaroid falla siempre**: `ASSET_SRC_RE` no acepta `_` en
   `ig_post.svg`; el editor muestra el JSON crudo de Zod. → **Tanda B** (`618c293`).

### Highs (16/16 resueltos)

- **[money] Reuso de orden PENDING con total desactualizado** → se reconcilia en sitio
  (total/email/método/carrier/cupón/items). → `8aa29b8`.
- **[saga] APPROVED sobre orden CANCELLED/COD se descarta sin registrar** → se marca
  `needsReconciliation`. → `8aa29b8`.
- **[concurrency] Idempotencia por `cartId` devolvía la orden vieja** cuando el carrito/cupón
  cambió. → `8aa29b8`.
- **[estudio] Filtro de foto del calendario no llegaba al preview 3D ni al PNG**. → `618c293`.
- **[estudio] Fallback exportaba a resolución de PANTALLA** (~180-250 DPI en móvil) → se fija
  `pixelRatio` a 300 DPI reales. → `618c293`.
- **[estudio] Indicadores de edición horneados en preview y PNG del fallback**. → `618c293`.
- **[emails] Retracto sin acuse al cliente ni alerta interna** (reloj legal de 15 días en
  silencio). → **Tanda C** (`e86be2c`, `sendRetractRequested`).
- **[privacy] Supresión de cuenta (Ley 1581) no anonimizaba `Order.email`/`phone`**. →
  `e86be2c`.
- **[ux/seo] Reseñas seed con `[DEMO]` mostradas como «Historias reales»** + reseñas
  fabricadas sin marcador alimentando el `aggregateRating` del JSON-LD. → **Tanda D**
  (`87e46a7`, filtro `customerId != null` en las 3 queries públicas).
- **[ux] `/ocasion/[slug]` y `/productos/[cat]/[subcat]` sin SiteHeader/SiteFooter**. →
  **Tanda D** (`ba70918`).
- **[ux] Personalizables hechos a pedido bloqueados por `stock=0`** (5/9 productos «agotados»).
  → **Tanda D** (`4b3ab4b`, stock made-to-order + normalización seed).
- **[ux] Estado obsoleto del buy-box al cambiar de opción** (CTA Estudio, `variantId` del
  carrito, precio) → `SelectedVariantProvider` (Context, única fuente de verdad). → **Tanda D**
  (`4a986b5`).
- **[ux] Transición datos→envío bloquea 7-11 s sin feedback** → `checkout/envio/loading.tsx`.
  → **Tanda D** (`ba70918`).
- **[ux] Móvil: 4 CTAs flotantes del Estudio encimados**. → **Tanda D** (`ba70918`).
- **[ux] Calendario: banner en fila junto al grid → overflow horizontal**. → **Tanda D**
  (`ba70918`).

### Quick wins (14/14 resueltos)

| # | Quick win | Estado |
| --- | --- | --- |
| 1 | Reseñas demo fuera del rating/UI | ✅ código (`87e46a7`) + DB verificada (0 reseñas demo) |
| 2 | Header/footer en `/ocasion` y `/productos/[cat]/[subcat]` | ✅ `ba70918` |
| 3 | `checkout/envio/loading.tsx` | ✅ `ba70918` |
| 4 | `/signup` → `/registro` (2 hrefs) | ✅ Tanda E |
| 5 | Quitar `decodeURIComponent` doble | ✅ Tanda E |
| 6 | Barrido de voseo (8 en UI) + plantillas DB | ✅ Tanda E (UI) + DB verificada (0/54 plantillas) |
| 7 | Home: quitar «(pronto)» del Estudio | ✅ `87e46a7` |
| 8 | `CheckoutError('COUPON_INVALIDATED')` en vez de descartar en silencio | ✅ Tanda E |
| 9 | Clamp `Math.max(1,…)` / `Math.max(0,…)` en `limit`/`offset` de catálogo | ✅ Tanda E |
| 10 | Fila «Descuento −$X» en email + 2 vistas de pedido | ✅ Tanda E (+ test) |
| 11 | `escapeHtml` en email interno de garantía | ✅ Tanda B/C |
| 12 | `assembly-sheet.ts` → `assets/fonts` (no `public/fonts`) | ✅ Tanda E |
| 13 | Alinear copy de retracto con `/legal/devoluciones` | ✅ Tanda E |
| 14 | `after()` en emails fire-and-forget (soporte + newsletter) | ✅ Tanda E |

**Notas de verificación:**

- **#8** — el descarte silencioso cobraba al cliente un total sin el descuento que vio. Ahora
  la tx aborta con `CouponInvalidatedError`; el checkout limpia el cupón del estado y devuelve
  `COUPON_INVALIDATED` para que el cliente **re-confirme viendo el total real**. La decisión de
  **quién paga la devolución** (retracto) queda **diferida a Lucy** — el copy se hizo neutral y
  remite a `/legal/devoluciones`.
- **#6 (DB) y #1 (DB)** estaban desactualizados respecto a migraciones previas
  (`fix-fotoimanes-aspects.mjs`) y a que la DB de dev tiene 0 reseñas: **0/54 plantillas** con
  voseo, **0 reseñas** demo/fabricadas. El fix de código (#1) es la garantía defensiva a futuro.

## Backlog restante (no bloqueante para lanzar)

- **116 medium + 81 low** documentados en `audit-v3-final.json`. Áreas con mayor densidad:
  `emails`, `ux-pdp`, `ux-carrito-checkout`, `ux-recomendador`, `seo-social-descubrimiento`,
  `tests-ci-gaps`, `data-privacy-logs`. Patrón operativo dominante a atacar en la siguiente
  ronda: **«fallar en silencio»** (webhooks que marcan `processedAt` aunque la saga reviente,
  crons sin captura de error).
- Seguimiento recomendado: test de integración dedicado que asegure el **aborto
  `COUPON_INVALIDATED`** (hoy la ruta de rechazo está cubierta por unit tests de `redemption`).

## Acciones tomadas

- [x] **Tanda A — Dinero** `8aa29b8` (3 blockers + 3 high del camino del dinero)
- [x] **Tanda B — Estudio WYSIWYG** `618c293` (Polaroid + fidelidad del PNG de imprenta)
- [x] **Tanda C — Legal/privacidad** `e86be2c` (acuse+alerta de retracto + supresión Ley 1581)
- [x] **Tanda D — UX alto** `ba70918` + `4b3ab4b` + `87e46a7` + `4a986b5`
- [x] **Tanda E — Quick wins** (este commit): #4, #5, #6, #8, #9, #10, #12, #13, #14
- [ ] Backlog 116 medium + 81 low → próxima(s) ronda(s) pre-launch

Certificación por tanda: `tsc --noEmit` + `eslint --max-warnings 0` + `prettier --check` +
tests (unit + integración relevante) + `next build`, con push a `origin/develop`.

## Decisión

**Re-auditar tras remediación.** Los **5 blockers y 16 highs** que sostenían el veredicto
NO-LANZAR quedaron cerrados y certificados; los 14 quick wins también. El sitio pasa de
«no lanzar» a **«apto para QA de lanzamiento pendiente de barrer el backlog medium/low»**.
La decisión GO/NO-GO final la toma Lucy tras esa ronda.
