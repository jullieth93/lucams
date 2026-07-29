# HANDOFF - CERTIFICACIÓN RAMA DEVELOP

Certificación transaccional multiagente ejecutada el **2026-07-29** sobre `develop` (Capa Cliente + Capa Admin), con cambios reales en disco, pruebas reales en terminal y verificación de residuos en BD. Nada de lo aquí escrito es suposición: cada afirmación tiene su evidencia (salida de tests, corridas E2E, queries de verificación).

**Punto de restauración registrado ANTES de tocar nada** (pedido explícito del usuario): `develop` @ `bc1e41b7c05ec787ac2dfa2a0d58d62abb2cc369`, working tree limpio. Detalle y comando de rollback en `docs/audits/2026-07-29-restore-point.md`.

---

## 1. Objetivo

Auditar, cablear, limpiar y certificar la rama `develop` de forma REAL: (a) inventario de módulos y variables de entorno, (b) cableado transaccional Wompi (firmas + webhooks sandbox) y Aveonline (auth + cotización + guías sandbox) sin mocks, (c) simplificación "menos es más" del panel Admin para una administradora no técnica, (d) certificación E2E con Playwright/Chromium del flujo completo cliente + admin con limpieza de datos de prueba, y (e) este documento de entrega.

Contexto encontrado: el cableado base de Wompi/Aveonline YA existía y era sólido (certificaciones Fase A/B previas). El trabajo real de esta sesión fue **adversarial**: encontrar y cerrar lo que esas certificaciones no vieron.

---

## 2. Estado Final y Evidencias de Conclusión

### Veredicto del ecosistema (The Gatekeeper)

| Agente                   | Veredicto                                                                                                                                                                                                                                  |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| QA Técnico & Mutación    | 1 vulnerabilidad crítica, 1 carrera de concurrencia, 1 componente muerto, 1 var muerta, 2 comentarios obsoletos. Todo corregido y cubierto con tests nuevos.                                                                               |
| ShadowAgent (pentesting) | El vector de robo de flete (`fleteCop` forjado) está **cerrado y probado** (3 tests nuevos de seguridad + defensa en profundidad en `finalizeCheckout`). Llaves: 0 secretos en cliente; las 4 de Wompi y las de Aveonline son server-only. |
| UX/UI Admin              | Menú ya saneado por la decisión Lucy/Kimi 2026-07-28 (respetada). Esta sesión: 1 función huérfana cableada, 2 etiquetas crípticas re-etiquetadas, 2 fusiones de módulos duplicados quedan como decisión de negocio (§5a).                  |
| E2E Playwright           | Flujo punta a punta certificado en limpio con Chromium contra Wompi y Aveonline **sandbox reales** (evidencias abajo).                                                                                                                     |
| Self-Healing             | 17 archivos modificados, 1 eliminado, 2 creados. Typecheck ✓ · ESLint 0 warnings ✓ · Prettier ✓.                                                                                                                                           |

### Evidencias de conclusión (datos reales de mi ejecución)

- **Vitest focal** (5 archivos tocados, DB real compartida): corrida inicial 101/102 (1 fallo introducido por mí en un helper de test → corregido, ver §4.2) → re-corrida del archivo checkout **39/39 ✓**. Estado final: **102/102 verdes**, incluyendo 5 tests NUEVOS escritos esta sesión (3 anti-manipulación de flete, 2 de carrera dedup en webhooks).
- **Typecheck** (`tsc --noEmit`) ✓ · **ESLint** `--max-warnings 0` ✓ · **Prettier** ✓ en todos los archivos tocados.
- **E2E certificación** (comando en §6, log `/tmp/e2e-cert-20260729.log`, `EXIT:0`):
  - `wompi-sandbox.spec.ts`: **1 passed (2.7m)** — cliente de prueba `wompi-e2e-*@example.com` creado por el checkout; cotización Aveonline sandbox en vivo; pago en checkout hospedado de Wompi sandbox con tarjeta 4242 → transacción **APPROVED verificada vía API oficial**; webhook firmado con el `WOMPI_EVENTS_SECRET` real aceptado (200); saga → orden **LCM-2026-0193** en **FULFILLING** con **guía Aveonline sandbox real #2245604750** y total **$58.300 COP**.
  - `admin-transactional.spec.ts`: **3 passed (51.2s)** — admin de prueba SUPERADMIN efímero creado, login en el panel, orden LCM-2026-0193 visible en `/admin/pedidos`, `/admin/finanzas`, `/admin/moderacion` y `/admin/disenos` operativos.
  - **Limpieza verificada por query** al finalizar: orden soft-deleted ✓ · 0 `AdminUser` `e2e-admin-tx-*` residuales ✓ · 0 clientes de prueba residuales ✓ · 0 eventos webhook del run ✓ · puerto 4000 liberado ✓.
- **Conteo de módulos**: Capa Cliente — flujo de ingresos (PDP → carrito → datos → envío → pago → gracias → webhook → guía) certificado E2E; 31 specs e2e y ~2.6k tests vitest existentes intactos. Capa Admin — 34 rutas del sidebar, todas reales (0 placeholder visibles; los 2 módulos futuros siguen ocultos por diseño); 1 página huérfana (gestor de webhooks Aveonline) ahora cableada al menú de Integraciones.
- **Resistencia/estrés básico del flujo**: la suite de integración ejerce el checkout bajo carreras (dedup concurrente P2002, doble finalize idempotente, reconciliación de orden divergente, stock en carrera) — 102/102 con `retry: 2` contra el pooler real.

### Propuestas de commits (NO ejecutados — git mutations requieren tu confirmación)

Sugerencia: 1 solo commit, o 4 atómicos en este orden:

1. `fix(checkout): sellar cotizaciones de envío con HMAC — cierra manipulación de flete (fleteCop forjado)` (checkout-session, service, envio/*, pago/actions, test integración).
2. `fix(webhooks): carrera dedup P2002 → 200 "concurrent duplicate" en wompi y aveonline (+2 tests)`.
3. `test(e2e): wompi-sandbox auto-limpia TODOS sus residuos (cliente, webhookEvent; fixtures soft-delete)`.
4. `chore(admin): cablear gestor webhooks Aveonline en Integraciones, relabel jerga del menú, purgar dead code`.

---

## 3. Archivos y Cambios

### Modificados (17)

**Fix crítico anti-manipulación de flete (ShadowAgent + Self-Healing):**

- `apps/web/lib/checkout-session.ts` — nuevo `ShippingOffersPayload` (offers + cartHash + destKey + quotedAt) en `CheckoutState`; `sealShippingOffersPayload()` / `openShippingOffersPayload()` con el mismo HMAC de la cookie y TTL de 60 min.
- `apps/web/features/checkout/service.ts` — código de error nuevo `SHIPPING_SELECTION_INVALID`; helpers `fingerprintCartItems()`, `destinationKeyOf()`, `matchShippingOffer()`, `sealShippingOffers()`; `saveShippingSelectionStep(selection, offersToken)` ahora exige match EXACTO contra el set sellado y el destino de la cookie (guarda la copia del SERVIDOR); `finalizeCheckout` re-valida selección vs cotizaciones selladas + huella de carrito + destino FRESCOS antes de crear la Order; comentario obsoleto de "500g default" corregido (el código usa dims reales y falla duro si faltan).
- `apps/web/app/checkout/envio/page.tsx` — sella el set de cotizaciones tras cotizar y lo pasa como `offersToken` (la RSC no puede escribir cookies: el sello viaja por el HTML).
- `apps/web/app/checkout/envio/envio-step.tsx` — prop `offersToken` (pass-through).
- `apps/web/app/checkout/envio/quote-list.tsx` — hidden input `offersToken` en el form.
- `apps/web/app/checkout/envio/actions.ts` — lee `offersToken`, lo pasa al service; captura `SHIPPING_SELECTION_INVALID` → redirect a `/checkout/envio?error=…` (mensaje customer-safe).
- `apps/web/app/checkout/pago/actions.ts` — `payWompiAction` y `payCodAction`: rama dedicada para `SHIPPING_SELECTION_INVALID` → redirect a `/checkout/envio?error=…` (re-cotizar, no cobrar de menos).
- `apps/web/features/checkout/service.integration.test.ts` — 3 call sites actualizados al nuevo contrato + 3 tests NUEVOS de seguridad (fleteCop alterado, token forjado/otro destino, carrito cambiado tras seleccionar).

**Fix carrera dedup webhooks (ShadowAgent):**

- `apps/web/app/api/webhooks/wompi/route.ts` — `create` de WebhookEvent envuelto: P2002 → 200 "concurrent duplicate, already processing" (antes: 500 crudo + reintentos ciegos + riesgo de doble saga); comentarios "HMAC" corregidos (Wompi usa SHA-256 de concatenación, no HMAC).
- `apps/web/app/api/webhooks/aveonline/route.ts` — mismo patrón P2002.
- `apps/web/app/api/webhooks/wompi/route.integration.test.ts` — test NUEVO de la carrera (findUnique miss + P2002 real contra el unique de la DB).
- `apps/web/app/api/webhooks/aveonline/route.integration.test.ts` — test NUEVO de la carrera (externalId calculado con el provider real) + import del provider.

**Limpieza (QA):**

- `apps/web/lib/wompi.ts` — comentario del esquema de firma corregido (SHA-256, no HMAC).
- `apps/web/.env.example` — eliminada `NEXT_PUBLIC_WOMPI_PUBLIC_KEY` (declarada, jamás referenciada en código; el checkout es redirect al hosted checkout, no widget).

**Admin "menos es más" (UX/UI):**

- `apps/web/app/admin/(panel)/integraciones/page.tsx` — tarjeta Aveonline ahora enlaza (`docs`) al gestor de webhooks `/admin/integraciones/aveonline`, que existía y funcionaba pero era **inalcanzable** desde la UI (0 inbound links).
- `apps/web/lib/admin-nav.ts` — relabel de jerga para usuaria no técnica: "Performance" → "Rendimiento web"; "Redirects 301" → "Redirecciones (SEO)". Sin tocar hrefs ni estructura (tests de nav intactos y verdes).

**E2E (Playwright Agent):**

- `apps/web/tests/e2e/wompi-sandbox.spec.ts` — `afterAll` ahora limpia TODOS los residuos del run: soft-delete del cliente de prueba (el teardown global de vitest NO lo alcanzaba: 13 dígitos del RUN < 15 del regex run-id), borrado del WebhookEvent sintético (`wompiTxId` hoisted a módulo), y producto/categoría **soft-delete** en vez de hard delete (ver §4.4); comentario "HMAC" corregido.

### Eliminados (1)

- `apps/web/components/reveal-on-scroll.tsx` — componente `Reveal` con **0 imports** en todo el repo (código muerto confirmado por grep).

### Creados (2)

- `docs/audits/2026-07-29-restore-point.md` — punto de restauración pre-sesión (`bc1e41b`) con comando de rollback.
- `HANDOFF.md` — este documento (sobrescribe el anterior, que queda en git history).

---

## 4. Intentos Fallidos (y qué lógica exacta los resolvió)

1. **E2E intento 1: fallo en 3 ms** — `browserType.launch: Executable doesn't exist at …/chromium-1234/chrome-linux64/chrome`. Causa: el bump de dependabot #20 (mergeado hoy) subió `@playwright/test` a 1.62, que exige la revisión de navegador **1234**; el servidor tenía la 1223 de corridas previas. Resolución: `npx playwright install chromium` (descargó chromium-1234 + headless-shell-1234) y re-correr. Regla: tras cada bump de Playwright hay que reinstalar navegadores en el servidor.
2. **Mi propio cambio rompió 1 test** — `MISSING_ADDRESS cuando falta la dirección` (rojo ×3 con retries): mi `seedFullState` actualizado sellaba cotizaciones que exigen dirección, pero ese test la omite a propósito. Lógica que lo resolvió: en producción ese estado es **inalcanzable** (la página de envío exige dirección para cotizar) y el guard `MISSING_ADDRESS` de `finalizeCheckout` dispara ANTES que el de envío → el helper ahora omite también el paso de envío cuando se omite la dirección. Re-corrida: 39/39.
3. **Edición deslizada en `envio/page.tsx`** — una sustitución sin newline pegó `} catch (err) {` con la línea de comentario siguiente. Detectada re-leyendo la región (no por tests) y reparada en el mismo pase; typecheck/lint/prettier lo confirmaron después.
4. **El hard delete de fixtures del e2e NUNCA funcionó** — 41 productos/categorías `wompi-e2e-*` acumulados en la BD de corridas viejas: `prisma.product.deleteMany` revienta por FK (variantes y OrderItems referencian el producto) y el `.catch(() => {})` tragaba el error en silencio. Los 41 estaban ya soft-deleted (0 activos — el teardown global de vitest los tapaba después); los verifiqué y el spec ahora soft-borra directo, sin depender de nadie. Evidencia del conteo en §2 y query de verificación ejecutada.
5. **`playwright test --list` falló** en `admin-transactional.spec.ts` (`createClient` de Supabase a nivel módulo sin env): no es un bug — ese spec espera el entorno sourceado (el comando documentado lo hace); `wompi-sandbox` sí importa `setup-env`. Anotado para no volver a diagnosticarlo.
6. **Emails de confirmación "fallan" en dev** — el log E2E muestra `email.send.fail` + `not_marked_will_retry` para la orden LCM-2026-0193: es el comportamiento esperado en local (Resend sin entrega verificada en dev); el saga lo registra para reintento y NO bloquea PAID ni la guía. No es un defecto del flujo.

---

## 5. Próximos Pasos

### a) Decisiones que dependen de ti (Negocio)

1. **Menú admin — fusiones pendientes**: `Mensajes` y `Soporte` son dos UIs sobre el MISMO modelo (SupportTicket: bandeja inbox vs tarjetas operativas); `Garantías` y `Reclamos` igual (WarrantyClaim). La decisión 2026-07-28 mantuvo los flujos legales separados, pero el MENÚ sigue mostrando ambos pares. ¿Fusiono cada par en una sola pantalla (menos es más) o quedan así?
2. **Reembolsos**: hoy marcar REFUNDED en el admin **no devuelve el dinero** — se emite manual en el dashboard de Wompi (la UI ya lo advierte). ¿Cableo la API de void/refund de Wompi o se queda manual documentado?
3. **Go-live PRD** (rama `production`, llaves reales Wompi/Aveonline): el checklist del HANDOFF anterior sigue vigente e intacto (merge develop→production, llaves PRD en Vercel, URL de eventos Wompi, verificación `bloquegenerarguia` con la cuenta real, IVA con el contador).
4. **Rol FULFILLMENT puede regenerar guías** Aveonline desde el pedido. ¿Es el alcance deseado o lo restringimos a MANAGER+?
5. **Supabase staging/test separado** (pendiente de Fase A): habilita endurecer cobertura y correr los tests Supabase-real en CI.

### b) Trabajo técnico pendiente

1. **Persistir `quoteId` (codTransportadora) en la Order** — hoy la saga re-resuelve la transportadora por nombre al generar la guía (funciona, pero es frágil si dos carriers comparten nombre).
2. **`/checkout/gracias?id=<txId>`** — endpoint público que revela datos de la orden con solo el id de transacción (adivinable solo por quien lo posee, pero viaja en URLs). Opciones: token firmado de un solo uso o rate-limit más estricto.
3. **Poda menor**: `verifyWebhook`/`getPaymentDetails` del `PaymentProvider` (solo los ejerce su test; la abstracción espera a MercadoPago) y allowances CSP del widget Wompi que no se usa (`script-src`/`frame-src checkout.wompi.co`).
4. **`dsnit: "100001"` placeholder** cuando el cliente no registra CC: nada bloquea el despacho con NIT genérico — valorar un gate en el admin antes de marcar SHIPPED.
5. **Gaps E2E registrados** (no bloqueantes): compra COD punta a punta, tarjeta DECLINED en UI, checkout con producto personalizado del Estudio, login de cliente, cupón en UI.
6. **Backlog previo vigente** (del HANDOFF anterior): recogidas por API (`generarRecogida2`), rótulo V3, entrega en oficina, polling en PendingPage, `expiration-time` en checkout, persistir `payment_method_type`/`status_message` en Order, migrar webhook Aveonline al token oficial, sharp 0.35.x solo con deploy de verificación.

---

## 6. Información Relevante

### Gotchas detectados esta sesión

- **Tras bump de `@playwright/test`, reinstalar navegadores** en el servidor (`npx playwright install chromium`) — la revisión de Chromium exigida cambia (1223 → 1234 hoy).
- **Las RSC no pueden escribir cookies** (Next 16): por eso el sello HMAC de cotizaciones viaja como hidden input `offersToken` en el form y lo valida la Server Action; la cookie solo se escribe en actions.
- **Despliegue de este cambio**: un checkout EN CURSO con la cookie vieja (sin `shippingOffers`) rebota UNA vez a re-cotizar el envío con mensaje claro ("La cotización de envío cambió…"); no pierde el carrito ni los datos.
- **`.catch(() => {})` en limpiezas de tests es una trampa silenciosa**: el hard delete de fixtures llevaba meses fallando por FK sin que nadie lo viera (41 residuos). Si una limpieza importa, que falle en voz alta o soft-borre.
- El teardown global de vitest purga por regex run-id de **15+ dígitos**; los RUN con `Date.now()` (13) no calzan — cada spec e2e debe limpiar su propio cliente/orden.
- `admin-transactional.spec.ts` no importa `setup-env`: necesita el entorno sourceado en la shell (el comando de abajo lo hace).
- Los `[wompi requestfailed] analytics.google.com` del log E2E son el tracking de la página hospedada de Wompi bloqueado por el navegador de test — ruido irrelevante, no del flujo.

### Comandos clave

- **E2E certificación transaccional (el usado hoy, verde)**:
  `cd apps/web && set -a && source .env.local && set +a && TURNSTILE_SECRET_KEY= NEXT_PUBLIC_TURNSTILE_SITE_KEY= PW_CHANNEL=chromium npx playwright test wompi-sandbox --workers=1 --retries=0 && TURNSTILE_SECRET_KEY= NEXT_PUBLIC_TURNSTILE_SITE_KEY= PW_CHANNEL=chromium npx playwright test admin-transactional --workers=1 --retries=0`
  (orden importa: `admin-transactional` restaura la orden PAID que crea `wompi-sandbox`)
- **Vitest de lo tocado**: `cd apps/web && npx vitest run features/checkout/service.integration.test.ts app/api/webhooks lib/admin-nav.test.ts lib/wompi.test.ts`
- **Verificación de residuos e2e (solo lectura)**: `cd packages/db && node --env-file=../../apps/web/.env.local -e '<query Prisma>'`
- **Gates de código**: `pnpm --filter web typecheck` · `pnpm --filter web lint` · `npx prettier --check <archivos>`
- **Rollback al punto estable**: `git checkout develop && git reset --hard bc1e41b7c05ec787ac2dfa2a0d58d62abb2cc369` (⚠️ descarta cambios sin commitear — ver `docs/audits/2026-07-29-restore-point.md`)

### Documentación importante

- `docs/audits/2026-07-29-restore-point.md` — punto de restauración de esta sesión.
- HANDOFF anterior (git history, commit `bc1e41b`) — go-live develop-sandbox en producción Vercel, rollback a catálogo, decisión sharp, convenciones de CI. Sigue vigente como contexto operativo.
- `docs/INTEGRATIONS.md` (estados Wompi) y `docs/INTEGRATIONS_AVEONLINE.md` §21 (semántica `bloquegenerarguia` — pendiente verificación con cuenta real antes de `AVEONLINE_GENERATE_REAL=true`).
- Recordatorio operativo vigente: **todo push a `develop` dispara deploy de PRODUCCIÓN en Vercel** (modo full, llaves sandbox) — por eso los commits propuestos en §2 esperan tu confirmación.
