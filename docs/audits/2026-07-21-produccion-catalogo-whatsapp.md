# Auditoría de producción — rama `catalogo-whatsapp` (modo catálogo, no transaccional)

> **Fecha:** 2026-07-21 · **Rama:** `catalogo-whatsapp` · **Método:** auditoría multiagente (7 dimensiones
> en paralelo, cada hallazgo refutado adversarialmente contra el código real y clasificado por
> aplicabilidad en modo catálogo) + corroboración manual de los blockers duros contra producción en vivo.
> **Cobertura:** 54 agentes, 46 hallazgos crudos → **31 confirmados**, 15 refutados/descartados.

## Veredicto: **NO SALIR AÚN — pero la ruta es corta y acotada (punch-list, no rework)**

La rama no debe certificarse como `production` todavía. Los bloqueadores son reales pero ninguno es
arquitectónico: son ~12 gates cerrables sin rediseño. Marco central verificado:

- **Producción HOY sirve modo catálogo** (verificado externo: `/carrito` → CTAs `wa.me`; `/checkout/pago`
  → 307 → `/checkout/datos`). El `wa.me` usa el número correcto (`573208873826`). ✅
- **Los 5 críticos transaccionales de Codex (C1, C2, C3, C5, C6) están DORMIDOS en catálogo** — verificado
  uno por uno. No bloquean esta salida; se difieren a modo `full`/`develop`. ✅
- Pero hay **blockers propios del catálogo** que sí obligan a esperar (legal, WYSIWYG, frontera, infra).

---

## A. Blockers `catalog-now` (arreglar antes de CUALQUIER tráfico real)

### A1 · [HIGH · legal duro] La cotización recolecta PII sin autorización habeas-data ni prueba (Ley 1581 art. 9)
`apps/web/features/quotes/actions.ts:36` · `apps/web/app/checkout/datos/quote-form.tsx:321`
El **único** flujo que recolecta datos personales en catálogo (nombre, WhatsApp, email, ciudad) **no tiene
casilla de autorización** (verificado: `grep consent|autoriz|habeas` en el form → **nada**) y
`createQuoteAction`/`service` **no registra ningún `Consent`** (verificado). La política declara que se
conserva prueba de la autorización; el flujo real no la captura. Brecha directa ante un reclamo SIC.
**Fix:** casilla required en `quote-form.tsx` enlazando `/legal/privacidad`; rechazar en `createQuoteAction`
si no viene marcada; llamar `recordCheckoutDataConsent({scope: HABEAS_DATA, email, ip, ua})` y persistir
`acceptedAt` + versión en la `Quote`. Replicar el patrón de `app/checkout/datos/actions.ts:46-101`.

### A2 · [HIGH · WYSIWYG / "nace productivo"] El catálogo no tiene fotografía real
`packages/db` (datos en vivo) · `apps/web/next.config.ts:20` (remotePatterns Unsplash)
Verificado contra la BD en vivo: **8 productos activos → 5 sin imagen, 3 con Unsplash hot-linkeado, 0 con
foto propia.** Un catálogo cuyo propósito es mostrar el producto sale con 5/8 en placeholder gris y 3/8 con
stock de banco que no es el producto físico. Viola el mandato WYSIWYG y "no es MVP". Además el OG/JSON-LD
cae al logo o expone stock ajeno.
**Fix:** Lucy sube foto real de los 8 por el admin (bucket `product-images`); quitar TODAS las URLs
`images.unsplash.com`; ningún producto con `images=[]`.

### A3 · [HIGH · seguridad/integridad] La frontera de modo es solo de render — las server actions transaccionales son POST alcanzables
`apps/web/app/checkout/pago/actions.ts` · `envio/actions.ts` · `datos/actions.ts` (guards de catálogo = **0**, verificado)
El gating de `isCatalogMode()` vive en las `page.tsx` (redirigen/ocultan UI), **no** en el proxy ni en las
server actions. Un invitado puede recorrer el checkout por POSTs crafteados (los action IDs viven en el
build), creando **Orders reales en la Supabase de producción** (misma BD, C4): `payCodAction` →
`processPaidOrder` commitea stock, intenta guía Aveonline y envía un email de confirmación desde el dominio
de marca a una dirección arbitraria. Sin llaves Wompi/Aveonline el daño se limita a órdenes basura + stock
bloqueado + email spoofeable; **si esas llaves quedaran en el Vercel de catálogo, escala a BLOCKER real**
(guía COD emitida, mensajero despachado). Es también el neutralizador de C1/C2/C3 ante un vuelco del flag.
**Fix:** `if (isCatalogMode()) redirect('/checkout/datos')` al inicio de `saveDatosAction`,
`selectShippingAction`, `payWompiAction`, `payCodAction`, y un chequeo dentro de
`finalizeCheckout`/`createOrderFromCart`. Confirmar en Vercel que las llaves Wompi/Aveonline **no** están.

### A4 · [HIGH · infra] La CI no corre en la rama que sale a clientes
`.github/workflows/ci.yml:4-7` — triggers `branches: [develop, main]` (verificado). `main` no existe;
`production` y `catalogo-whatsapp` no están. El typecheck/lint/~1400 vitest/E2E/Lighthouse/gitleaks **no
gatean `production`**: un merge despliega con solo `next build` de Vercel.
**Fix:** agregar `production` a `on.push`/`on.pull_request`; branch protection en GitHub con los checks como
required; quitar/renombrar `main`.

### A5 · [HIGH · infra/datos] dev == producción: un solo proyecto Supabase Free (C4)
`docs/STATE.md` — `zxkucphbsfygakgxcnik` es dev Y prod. Verificado: los tests de integración corrieron HOY
contra esa BD; migraciones/seeds locales mutan la tienda en vivo. Un error de dev es un incidente de prod.
**Fix (aceptable para launch como riesgo documentado):** backup off-site durable ANTES de tráfico + guard
que aborte seeds/tests si el `DATABASE_URL` es el de prod + ADR del riesgo aceptado. Separación real de
proyectos: agendada antes de crecer tráfico (cambio de infra mayor → diferible con mitigación).

---

## B. Should-fix `catalog-now` (medium)

- **B1 · SEO/copy engañoso** — `layout.tsx` meta + `manifest.ts` prometen "pago en línea seguro"
  inexistente; `producto/[slug]/page.tsx:194-216` emite **JSON-LD `Offer`/`availability=InStock`** siempre
  (no gateado por modo) → Google lee los productos como comprables. Exposición Ley 1480. Derivar del modo.
- **B2 · Legal transaccional** — `legal/terminos`, `legal/devoluciones`, `legal/cookies` prometen
  Wompi/PSE/contraentrega/retracto que no existen en catálogo. Alinear con "solo cotización".
- **B3 · Admin sin MFA forzado** — TOTP no exige enrolamiento; el panel expone toda la PII de cotizaciones
  + auto-promoción SUPERADMIN. Forzar enrolamiento + rate-limit en el path de recovery-code.
- **B4 · Backups fail-open** — `.github/workflows/backup.yml`: gate verde sin secrets, sin verificación de
  restore, endpoint R2 aún sin aprovisionar. Hacer FALLAR (rojo) si faltan secrets en prod + restore drill.
- **B5 · Modo mantenimiento** — el runbook nombra una var distinta de la que lee el código
  (`NEXT_PUBLIC_MAINTENANCE_MODE`, inlined → requiere redeploy). Corregir el runbook.
- **B6 · Ramas divergentes** — `develop` está ~7 olas detrás de `production`; flujo de release sin
  reconciliar. Verificar el Production Branch en Vercel.
- **B7 · service_role compartido** — la key con bypass de RLS es la misma en dev y prod (C4). Ver A5.

## C. Gaps (lo que ninguna dimensión cubría)

- **C-gap1** · JSON-LD `Offer`/`InStock`/`seller` sin gatear por modo (ver B1) — datos estructurados
  "comprables" para una tienda que solo cotiza.
- **C-gap2 · retención PII** — las fotos de invitados que pasan por una `Quote` se retienen indefinidamente:
  el purge de 30 días (`retention-service.ts:93-98`) solo toca DRAFT sin `cartItems`, y no chequea
  `quoteItems`; `clearCartAfterPaid` deja vivos los `CartItem`. (Data-minimization, Ley 1581 art. 5.)
  *Nota: por esto mismo NO ocurre la pérdida de artwork tipo C5 en catálogo — el diseño sobrevive.*
- **C-gap3 · ingesta de fotos anónimas en el Estudio** sin rate-limit/límite de tamaño/control de contenido
  (invitados suben imágenes arbitrarias a Storage) — vector de abuso/costo y responsabilidad por contenido.
- **C-gap4 · cookies** — banner y lib existen; falta verificar que ningún script cargue pre-consentimiento.
- **C-gap5 · sin analítica de embudo** — no se mide la conversión de cotización (única KPI del catálogo).
- **C-gap6 · residuo de tests en la BD prod** — categorías `itest*`/`cat*`, un producto fantasma y 2
  `PersonalizationTemplate` huérfanas ACTIVE (`cdn.lucams.test`). Purgar antes de certificar.

---

## D. Confirmado DORMIDO en catálogo → diferir a modo `full`/`develop`

| Hallazgo Codex | Por qué no aplica en catálogo | Al activar `full` |
| --- | --- | --- |
| **C1** precio de carrito manipulable | sin cobro; orden queda PENDING | recalcular `unitPrice` server-side en `createOrderFromCart` |
| **C2** flete del form (`fleteCop`) | sin cobro | re-cotizar envío server-side / quoteId firmado con TTL |
| **C3** race COD tras pago online | no hay pago en línea | revisar atomicidad guard `PENDING_PAYMENT` vs webhook Wompi |
| **C5** borrado de cuenta borra artwork | no hay pedidos pagados; **verificado que el análogo por Quote NO pierde datos** (el CartItem protege el diseño) | copiar artefactos a storage propio del pedido antes de pagar |
| **C6** REFUNDED antes de mover plata | admin-only + requiere orden pagada | estado `REFUND_PENDING` + refund idempotente |

Otros diferibles (low): cota de longitud del mensaje `wa.me`; idempotencia del submit de cotización;
a11y del Estudio (contraste turquoise/pink WCAG 1.4.3, aria-label del FAB WCAG 2.5.3, `frameloop` demand);
rate-limit del recovery-code MFA; invertir el default fail-open del flag a `catalog`.

---

## E. Los 12 gates de go-live (en orden)

1. **Fijar la frontera de modo en el deploy** — verificar `NEXT_PUBLIC_STORE_MODE=catalog` en Vercel prod;
   assertion dura en `env.ts` (en `VERCEL_ENV=production` exigir el valor exacto, no default silencioso);
   documentar la var en `.env.example`; confirmar que Wompi/Aveonline **no** están en el Vercel de catálogo.
2. **Guard server-side de etapa** en las 4 server actions transaccionales + `finalizeCheckout` (A3).
3. **Consentimiento habeas-data en la Quote** (A1) — gate legal DURO.
4. **Alinear copia al consumidor** con la realidad catálogo (B1, B2) — meta/manifest/JSON-LD/legales.
5. **Fotografía real de los 8 productos** + quitar Unsplash (A2).
6. **Verificar la línea WhatsApp** — número correcto (✅ ya), cuenta WhatsApp Business monitoreada, prefill
   probado end-to-end incl. mensaje largo de carrito.
7. **Endurecer admin** — TOTP enrolado para Lucy (forzar) + rate-limit recovery-code (B3).
8. **Confirmar Turnstile en prod** — que el widget renderiza y un submit legítimo pasa (no auto-DoS del form).
9. **Durabilidad de datos** (agravado por C4) — Supabase Pro/PITR **o** R2 con gate que falle en rojo +
   restore drill #2 + chequeo post-dump (`gunzip -t`) + snapshot manual pre-launch.
10. **Observabilidad de arranque** — actualizar el secreto Vault `cron_base_url` a `https://lucamsshop.com`;
    monitor externo (UptimeRobot/BetterStack) sobre `/api/health/all` + `/api/health/crons`; `ALERT_EMAIL`
    vigilado.
11. **Pipeline de release de la rama productiva** — CI en `production` + branch protection (A4); reconciliar
    ramas; corregir la var de mantenimiento en el runbook (B5, B6).
12. **Limpiar residuo de tests en la BD prod** (C-gap6) + dejar de correr tests/seeds contra prod.

---

## F. Prerrequisitos humanos/legales (el código no los puede forzar)

- TOTP admin realmente enrolado antes de exponer el panel.
- Dominio remitente Resend con SPF/DKIM verificado (✅ hecho en FASE 5 del go-live).
- Publicar la copia legal corregida al estado catálogo.
- Que la captura de consentimiento de la Quote realmente shippee (gate legal duro, no diferible).
