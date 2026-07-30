# HANDOFF - CERTIFICACIÓN RAMA DEVELOP

**Segunda pasada de certificación transaccional multiagente**, ejecutada el **2026-07-29** sobre `develop` (Capa Cliente + Capa Admin), con cambios reales en disco, pruebas reales en terminal y verificación de residuos en BD. Nada de lo aquí escrito es suposición: cada afirmación tiene su evidencia (salida de tests, corridas E2E, queries de verificación). La primera pasada del mismo día quedó commiteada en `019f6fe` (ver git history); esta segunda pasada fue **adversarial**: tres agentes exploradores buscaron lo que la primera no vio, y se corrigió lo hallado.

**Punto de restauración registrado ANTES de tocar nada** (pedido explícito del usuario: "documentate en el punto estable commit que estás ahora por si acaso"): `develop` @ `019f6fe` (`docs: HANDOFF certificación transaccional multiagente develop 2026-07-29 + punto de restauración`), working tree limpio, `origin/develop` al día. Detalle y comando de rollback en `docs/audits/2026-07-29-restore-point.md` (sección "Re-certificación").

---

## 1. Objetivo

Re-auditar, cablear, limpiar y re-certificar la rama `develop` de forma REAL tras la primera pasada: (a) verificar que las evidencias del HANDOFF anterior seguían en pie (baseline completo), (b) segunda auditoría adversarial con 3 agentes (QA dead-code/cableado, ShadowAgent pentesting, UX/UI Admin "menos es más"), (c) aplicar los fixes aprobados por el Gatekeeper con tests nuevos, (d) re-certificar E2E con Playwright/Chromium contra Wompi y Aveonline sandbox reales, (e) dejar la BD sin residuos de prueba y (f) este documento.

Contexto: la primera pasada (commit `019f6fe`) ya había cerrado el flete forjado (HMAC), la carrera dedup P2002 en webhooks y el cableado del gestor Aveonline. Esta pasada encontró y cerró lo siguiente: exposición pública de la dirección de recogida, amplificación hacia la API de Wompi desde /checkout/gracias, un enlace roto del dashboard que perdía el filtro, una tarjeta del dashboard que medía el trabajo del cliente en vez del de Lucy, 7 archivos muertos, config de una IA inexistente y 28 órdenes de prueba históricas visibles en el admin.

---

## 2. Estado Final y Evidencias de Conclusión

### Veredicto del ecosistema (The Gatekeeper)

| Agente                   | Veredicto                                                                                                                                                                                                                                                                                              |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| QA Técnico & Mutación    | 24 ítems clasificados: 7 archivos muertos eliminados (verificados 0 imports), placeholder roto en checkout reparado, env var de seguridad documentada, spec e2e con ruta inexistente corregido, config Anthropic purgada. Venndelo y la suite /api/catalog quedan como decisión de negocio (§5a).      |
| ShadowAgent (pentesting) | Fixes de la 1ª pasada verificados EN PIE (sello HMAC de flete, dedup P2002, anti-replay Wompi, RBAC con MFA en las 33 actions). 3 hallazgos MEDIO cerrados esta sesión (PICKUP_* público, amplificación Wompi, origin spoofable); 5 BAJO: 1 corregido (comentario de dinero falso), 4 diferidos a §5b. |
| UX/UI Admin              | 17 hallazgos (H1-H17): 2 ALTA y 8 MEDIA corregidos en disco (dashboard, jerga, /admin 404, destructiva sin confirmación); relabels opcionales y fusiones quedan como decisión de negocio (§5a).                                                                                                        |
| E2E Playwright           | Flujo punta a punta re-certificado en limpio post-cambios con Chromium contra sandbox REALES (evidencias abajo), incluyendo test NUEVO que certifica el dashboard.                                                                                                                                     |
| Self-Healing             | 33 archivos modificados, 2 creados, 7 eliminados. Typecheck ✓ · ESLint 0 warnings ✓ · Prettier ✓.                                                                                                                                                                                                      |

### Evidencias de conclusión (datos reales de mi ejecución)

- **Baseline ANTES de cambios** (re-verificación del HANDOFF anterior): vitest suite completa **2631 passed / 2 skipped** (162 archivos, 19.7 min, 0 residuos en teardown) · E2E `wompi-sandbox` **1 passed (2.3m)** — orden **LCM-2026-0194** real en sandbox · `admin-transactional` **3 passed (41.6s)** · typecheck ✓ · lint ✓.
- **Gates POST-cambios**: `tsc --noEmit` ✓ (tras `next typegen`, ver §4.2) · `eslint --max-warnings 0` ✓ · `prettier --check` ✓ en todos los archivos tocados.
- **Vitest focal POST-cambios** (lib + features/checkout + features/orders + app/api): **58 archivos, 1144/1144 tests verdes**, 0 residuos. Incluye **7 tests NUEVOS** escritos esta sesión: 3 de privacidad del endpoint CMS (`lib/cms-settings-privacy.test.ts`) y 4 del origin anti-spoof (`lib/origin.test.ts`).
- **E2E re-certificación POST-cambios** (comando en §6, `E2E_RECERT_OK`):
  - `wompi-sandbox.spec.ts`: **1 passed (2.3m)** — checkout completo con cotización Aveonline sandbox en vivo, pago APPROVED verificado vía API oficial de Wompi sandbox, webhook firmado aceptado, saga → orden **LCM-2026-0195** PAID con guía Aveonline sandbox.
  - `admin-transactional.spec.ts`: **4 passed (51.2s)** — incluye el test NUEVO `/admin/dashboard renderiza con la tarjeta operativa 'Por producir / enviar'` (certifica los fixes H1+H13 en runtime), más pedidos/finanzas/moderación/diseños operativos con la orden real.
- **Limpieza de BD verificada por query** (resultados literales): 28 órdenes residuo e2e históricas (`LCM-2026-0147`…`0175`, PENDING_PAYMENT, 2026-07-28, emails `wompi-e2e-*`) **soft-deleted** + 1 carrito anónimo vacío expirado purgado → estado final: `ordersExample:0, ordersRemaining:0, customersAny:0, cartsE2E:0, adminsE2E:0, webhooksLast2h:0, productsE2E:0`.
- **Conteo de módulos**: Capa Cliente — flujo de ingresos (PDP → carrito → datos → envío → pago → webhook → guía → gracias) certificado E2E; el checkout ya no pide URLs inexistentes (`/placeholder.png` eliminado). Capa Admin — 34 rutas del sidebar + `/admin` raíz (antes 404, ahora redirige al dashboard); 0 páginas huérfanas; 0 placeholders fuera de lo deliberado; 1 destructiva (borrar webhook) ahora con confirmación.
- **Cobertura de lo tocado**: toda lógica nueva va con test (7 unitarios + 1 e2e); la purga eliminó 1 spec muerto (62 líneas) cuyo único sujeto era el componente borrado.

### Propuestas de commits (NO ejecutados — git mutations requieren tu confirmación)

Sugerencia: 1 solo commit, o 4 atómicos en este orden:

1. `fix(security): /api/cms/settings oculta PICKUP_*/BUSINESS_NIT; rate-limit anti-amplificación en /checkout/gracias; origin de emails canónico en producción (+7 tests)`.
2. `fix(admin): dashboard mide "Por producir / enviar" y enlaza con ?status=; /admin redirige al dashboard; jerga traducida; destructiva con confirmación; ruido purgado (H1-H17)`.
3. `chore(qa): purgar 7 archivos muertos, placeholder inline en checkout, WOMPI_DISABLE_TIMESTAMP_CHECK documentada, config Anthropic eliminada`.
4. `test(e2e): aserción del dashboard en admin-transactional; ruta /api/catalog/products corregida en ola18b-verify`.

---

## 3. Archivos y Cambios

### Creados (2)

- `apps/web/app/admin/page.tsx` — redirect `/admin` → `/admin/dashboard` (antes 404; H14).
- `apps/web/lib/cms-settings-privacy.test.ts` — 3 tests del filtro de privacidad del endpoint CMS.

(`HANDOFF.md` se sobrescribe pero ya existía en git — cuenta como modificado.)

### Eliminados (7) — código muerto verificado con 0 imports

- `apps/web/components/ui/badge.tsx`, `select.tsx`, `skeleton.tsx`, `tooltip.tsx` — primitivas UI sin un solo uso.
- `apps/web/app/estudio/[slug]/studio-frame-picker.tsx` + su test — solo lo importaba su propio test.
- `apps/web/app/estudio/[slug]/studio-polaroid-border-toggle.tsx` — 0 referencias en el repo.

### Modificados (33)

(incluye `HANDOFF.md` — este documento, que sobrescribe al de la 1ª pasada, preservado en git history en `019f6fe`)

**Seguridad (ShadowAgent + Self-Healing):**

- `apps/web/lib/cms.ts` — nuevo `isPublicSettingKey()`: las claves `PICKUP_*` (dirección/teléfono/contacto de recogida — posible casa del negocio) y `BUSINESS_NIT` no son públicas.
- `apps/web/app/api/cms/settings/route.ts` — ambas ramas (all + by-category) filtran con `isPublicSettingKey`; header actualizado. **Cierra la exposición pública de la dirección de recogida** (hallazgo MEDIO #1).
- `apps/web/app/checkout/gracias/page.tsx` — rate-limit `gracias:ip:<ip>` (20 vistas/5 min) ANTES de llamar `getTransaction` (API Wompi con private key); al excederse se muestra la nueva `VerifyingPage` honesta sin llamar a Wompi (el webhook procesa la orden igual). **Cierra la amplificación hacia Wompi** (hallazgo MEDIO #3).
- `apps/web/lib/origin.ts` — `getRequestOrigin()` en producción (`VERCEL_ENV=production`) usa SOLO `NEXT_PUBLIC_SITE_URL`, nunca `x-forwarded-host` (spoofable → links de email a host atacante). Preview/dev sin cambios.
- `apps/web/lib/origin.test.ts` — mock de `next/headers` + 4 tests nuevos del comportamiento prod/preview/dev.
- `apps/web/features/cart/service.ts` — comentario corregido: el precio que se cobra es el snapshot que el cliente VIO (la Order NO re-lee `variant.price`; el comentario anterior prometía una invariante de dinero falsa — hallazgo BAJO #4 resuelto documentando la conducta real, que además es la correcta para el Estatuto del Consumidor).
- `apps/web/features/orders/service.ts` — select de variant sin `price`/`productId` (seleccionados y jamás usados); comentario explicando por qué el precio NO se re-lee.

**Limpieza (QA):**

- `apps/web/app/checkout/_components/order-summary.tsx` — fallback `"/placeholder.png"` (404 real, el asset no existe) reemplazado por placeholder inline con icono `Sparkles`, mismo idioma visual que gracias.
- `apps/web/.env.example` — `WOMPI_DISABLE_TIMESTAMP_CHECK=false` documentada (escape hatch anti-replay, NUNCA en producción); sección Anthropic eliminada (no existe provider Anthropic en el código).
- `apps/web/app/admin/(panel)/integraciones/page.tsx` — tarjeta "Anthropic Claude" y grupo `ai` eliminados (mostraban el estado de una integración inexistente).
- `apps/web/lib/security-headers.ts` — comentario CSP actualizado a estado final (sin lógica tocada).
- `apps/web/lib/admin-nav.ts` — relabel "Mayorista B2B" → "Precios al por mayor"; descripción muerta de Integraciones sin "Anthropic"; descripción obsoleta de Finanzas eliminada (nunca se renderizaba).
- `apps/web/lib/admin-nav.test.ts` — 2 nombres de `it()` y comentarios actualizados (aserciones de hrefs intactas).
- `apps/web/tests/e2e/ola18b-verify.spec.ts` — fetch a ruta inexistente `/api/catalog/producto/...` → `/api/catalog/products/tiras-magneticas-fotos` (el check era inerte por el `.catch(() => null)`).
- `apps/web/app/estudio/[slug]/README.md` — línea del árbol que listaba el componente eliminado.

**Admin "menos es más" (UX/UI):**

- `apps/web/app/admin/(panel)/dashboard/page.tsx` — **H13 (bug)**: el enlace usaba `?estado=` pero pedidos lee `status=` (filtro descartado en silencio). **H1**: la OpsCard ya no cuenta `PENDING_PAYMENT` (trabajo del cliente) sino `PAID + FULFILLING` con etiqueta "Por producir / enviar" y alerta `urgent` si hay; el chip de alertas del hero mide lo mismo; pendiente de pago queda como dato secundario.
- `apps/web/app/admin/(panel)/pedidos/[number]/page.tsx` — H2: "Customer ID"→"Cliente", "Guest checkout"→"Compra sin cuenta", "Wompi TX"→"Transacción Wompi", "Carrier"→"Transportadora", "Tracking"→"N° de guía" (+2 anglicismos adyacentes en la misma tarjeta).
- `apps/web/app/admin/(panel)/pedidos/page.tsx` — H3: eliminada la línea críptica `wompi · <id largo>` bajo el número de orden.
- `apps/web/app/admin/(panel)/observability/page.tsx` — H4: tile "A reconciliar" deduplicado; título unificado a "Salud técnica" (igual que el menú); SLOs/crons/webhooks/errores/Web Vitals colapsados bajo `<details>` "Detalle técnico (para soporte)"; tiles operativos visibles arriba.
- `apps/web/app/admin/(panel)/finanzas/page.tsx` — H6: eliminado el ítem obsoleto "Configurar la pasarela Wompi" (Wompi ya está certificado en vivo); comentario de cabecera reescrito (decía que el módulo no tenía datos reales — sí los tiene).
- `apps/web/app/admin/(panel)/integraciones/aveonline/page.tsx` — H7: borrado de webhook ahora pasa por `ConfirmAction` (antes submit directo sin confirmación); aviso "Esta pantalla es para soporte técnico".
- `apps/web/app/admin/(panel)/soporte/page.tsx`, `garantias/page.tsx`, `retractos/page.tsx`, `moderacion/page.tsx` — H8: estados vacíos unificados a `AdminEmpty` con frase guía (fuera los textos planos con 🦝).
- `apps/web/app/admin/(panel)/mensajes/page.tsx` — H9: IP y userAgent fuera de la bandeja (la query que solo servía a esa UI también se fue; el modelo sigue guardándolos).
- `apps/web/app/admin/(panel)/metricas/page.tsx` — H10: encabezado "SKU"→"Código".
- `apps/web/app/admin/(panel)/auditoria/page.tsx` — H11: placeholders con ejemplos reales de negocio (`ej. product.update`, `ej. Order`); label "Acción (prefijo)".
- `apps/web/components/admin-shell.tsx` — H15: pastilla "Free" eliminada (residuo de plantilla SaaS); H16: indicador "Live" estático eliminado (no estaba cableado a ningún health check).
- `apps/web/app/admin/(panel)/mayorista/page.tsx` — título/breadcrumb/comentario alineados al nuevo label "Precios al por mayor".

**Docs de sesión:**

- `docs/audits/2026-07-29-restore-point.md` — sección "Re-certificación" con el punto estable `019f6fe` y comando de rollback.

**E2E (Playwright Agent):**

- `apps/web/tests/e2e/admin-transactional.spec.ts` — test NUEVO primero del describe: el dashboard renderiza la tarjeta "Por producir / enviar" sin error boundary (certifica H1+H13 en runtime).

---

## 4. Intentos Fallidos (y qué lógica exacta los resolvió)

1. **Typecheck falló por carrera con el dev server** — `.next/dev/types/validator.ts(566,1): error TS1161: Unterminated regular expression literal` (y 2 más). Causa: lancé `tsc --noEmit` mientras el `next dev` de Playwright **re-escribía** los tipos generados en `.next/dev/types/`. Resolución: re-correr typecheck cuando el E2E terminó → limpio. Regla: **nunca correr tsc en paralelo con `next dev`** (ambos tocan `.next/`). Secuela: la carrera dejó una línea CORRUPTA persistente en `validator.ts` (un comentario truncado, `/../../app/api/cron/...` en vez de `// Validate ...`) que sobrevivía incluso a `next typegen` (no regenera si cree estar al día) → purga total con `rm -rf .next/dev/types && npx next typegen` → `tsc` exit 0.
2. **Typecheck falló tras crear la ruta /admin** — `validator.ts(430,52): error TS2344: Type '"/admin"' does not satisfy the constraint 'AppRoutes'`. Causa: los tipos de rutas generados estaban STALE (anteriores a `app/admin/page.tsx`). Resolución: `npx next typegen` → `TSC_OK`. Regla: **tras agregar/quitar rutas del App Router, correr `next typegen` antes de `tsc`**.
3. **Mi primera query de verificación de BD falló** — `MODULE_NOT_FOUND './node_modules/.prisma/client'`: adiviné la ruta del require en vez de resolver `@prisma/client` desde `packages/db`. Corregido el require, la query corrió.
4. **El email de confirmación "falla" en el log E2E** — `email.send.fail` 422 "use our testing email address instead of domains like example.com": Resend rechaza el dominio de prueba en dev. Comportamiento esperado y no bloqueante (el saga lo marca para reintento; PAID y la guía no se afectan). No es un defecto del flujo.
5. **La verificación de residuos encontró lo que la 1ª pasada no vio** — 28 órdenes `wompi-e2e-*` ACTIVAS de corridas de 2026-07-28 (anteriores al auto-cleanup) listadas en `/admin/pedidos` de Lucy. La 1ª pasada verificó solo los residuos de SU corrida. Resolución: soft-delete con filtro exacto (`email contains wompi-e2e- AND status PENDING_PAYMENT AND deletedAt null`) → 28 filas, re-verificado en 0. El carrito `e2e` adicional resultó ser un match hex coincidental de un carrito anónimo vacío y expirado (2026-06-30, 0 items) — soft-deleted igual, sin efecto.
6. **Desviaciones reportadas por los sub-agentes (resueltas en el acto)**: el README del estudio listaba el componente borrado (línea eliminada); `WOMPI_DISABLE_TIMESTAMP_CHECK` ya estaba en `docs/SECURITY.md` (solo faltaba en `.env.example`, no se duplicó); el grupo `ai` de integraciones quedó vacío al quitar Anthropic (se eliminó completo); el test RBAC usa `?estado=PAID` como input incidental (no es enlace roto — no se tocó).
7. **Vitest completo + E2E en paralelo: sin interferencia** — corrí la suite completa (2631 tests) mientras el E2E creaba/borraba sus fixtures en la misma BD; el aislamiento por run-id funcionó y ambos terminaron verdes. Confirmado como práctica segura (con la salvedad del punto 1 para tsc).
8. **Hallazgo propio de esta pasada — tormenta de colisiones P2002 en `generateOrderNumber`** — el vitest focal post-purga falló 1/1162 y luego 3/1162 ("revert de cupón consumido"): primer intento timeout 30s por latencia del pooler (medida: `SELECT 1` a 550 ms-1.4 s; suite a 9-14 s/test vs 1-2 s en la mañana) y los retries morían con `Unique constraint failed (number)`. Causa raíz REAL encontrada: `generateOrderNumber` usaba `count()+1`; los **hard deletes** de los teardowns (16 pedidos) descuadran el count del máximo → `count+1` aterriza sobre números ocupados por órdenes soft-deleted → P2002 en los 10 reintentos (356 warnings `number_collision_retry` en UN archivo; la tormenta empeoraba la latencia). Fix aplicado en `features/orders/service.ts`: `max(number)+1` bajo el mismo advisory lock (inmune a huecos y a hard deletes, formato `LCM-YYYY-NNNN` intacto — lo exige `service.integration.test.ts:380`). Verificación: el archivo completo **55/55 verdes con 0 colisiones** (antes in-corrible) y el focal final vuelve a estar verde (§2). En producción (sin hard deletes) el comportamiento es idéntico; el fix cierra además la fragilidad latente ante purgas operativas.
9. **Residuos de los tests con timeout** — el intento fallido dejó 1 orden huérfana activa (`LCM-2026-0214`, email de fixture `chk…@lucams.test`): soft-deleted y re-verificado (0 residuos). La corrida matada del re-run no dejó residuos activos (teardown: 0 pedidos).

---

## 5. Próximos Pasos

### a) Decisiones que dependen de ti (Negocio)

1. ~~**Venndelo (Plan B de envíos)**~~ → **EJECUTADA el 2026-07-29 (post-deploy, decisión tuya)**: eliminado por completo del código, del schema/BD (migración `20260729150000_drop_venndelo_plan_b`), de los env, de los seeds y de la documentación operativa. Detalle y evidencias en el "Addendum — eliminación total de Venndelo" (al final de este documento).
2. **Suite `/api/catalog/*` (9 endpoints) + `/api/coupons/public`**: hoy solo los consumiría el bot de WhatsApp (Fase 5+, descopeado). ¿Se mantienen como API pública documentada o salen hasta entonces?
3. **Fusiones del menú (arrastrada, ahora con detalle)**: `Mensajes` (bandeja inbox, triage rápido) vs `Soporte` (tarjetas con respuesta por email — el dashboard apunta acá); `Garantías` (flujo legal Ley 1480; su filtro default "Nuevos" OCULTA los que están en diagnóstico) vs `Reclamos` (bandeja donde "Pendientes" = todo lo no cerrado). Ojo: hoy ambas pantallas pueden mostrar números distintos para lo mismo. ¿Fusiono cada par en una sola entrada?
4. **Re-etiquetas opcionales del menú** (propuestas UX, no apliqué sin tu visto porque el menú ya pasó dos decisiones): "Dashboard"→"Inicio", "Auditoría"→"Registro de cambios", "Conciliación contra entrega"→"Cobros del mensajero", "Integraciones"→"Servicios conectados". Dime cuáles sí.
5. **Secreto del webhook Aveonline registrado en la URL** (`?secret=`, queda en la BD del tercero y en logs): la ruta ya acepta el header `x-aveonline-secret`. Acción humana: reconfigurar en el dashboard de Aveonline para que envíe el header y re-registrar el webhook desde `/admin/integraciones/aveonline`.
6. **Precio cobrado = precio visto en el carrito**: quedó documentado como conducta deliberada (cobrar de más lo ya exhibido sería peor para el cliente y el Estatuto del Consumidor). Si prefieres que el checkout re-lea precios de BD, es un cambio de conducta — lo discutimos antes de tocarlo.
7. **"Rendimiento web" vs "Salud técnica" se solapan** (mismos errores y Web Vitals en ambas). ¿Dejamos una sola puerta técnica?
8. **Finanzas: tarjetas "Próximamente" y KPI DIAN en 0** — se mantuvieron por decisión previa, pero UX los marca como ruido permanente. ¿Los colapso en un acordeón?
9. **Vigentes de la 1ª pasada**: reembolsos manual-en-Wompi vs cablear API de void/refund; rol FULFILLMENT puede regenerar guías (¿restringir a MANAGER+?); Supabase staging/test separado; checklist go-live PRD intacto.

### b) Trabajo técnico pendiente

1. **Dedup Aveonline sin timestamp**: cuando el payload no trae fecha, `parseAveonlineDate` devuelve `new Date()` y cada re-entrega es "evento nuevo" (inofensivo para datos por las transiciones monotónicas, pero se pierde idempotencia). Diseño: que el provider exponga `timestampIsSynthetic` y el externalId caiga a `hash(rawBody)` en ese caso.
2. **Firmar la cookie `admin_last_activity`** (idle-timeout admin): hoy es un timestamp plano; con cookies `sb-*` robadas se podría mantener viva una sesión secuestrada. Diseño: HMAC con clave derivada (NO reusar `CSRF_SECRET` directo — ver punto 3), verificación timing-safe en el proxy (Web Crypto, edge-safe), aceptar el formato legado una sola vez para no tumbar sesiones activas.
3. **Separación de claves**: `CSRF_SECRET` firma hoy 3 cosas (cookie de checkout, sello de cotizaciones, token de unsubscribe). Derivar sub-claves por propósito (HKDF o sufijo de dominio) con plan de rotación para no invalidar tokens en vuelo.
4. **`/checkout/gracias?id=<txId>`** — ya rate-limited (esta sesión); queda el pendiente original: el txId en URL revela los datos de la orden a quien lo posea. Opciones: token firmado de un solo uso o migrar a la vista `/pedido/<publicAccessToken>`.
5. **Vigentes de la 1ª pasada**: persistir `quoteId` (codTransportadora) en la Order; gate admin para `dsnit:"100001"` placeholder antes de SHIPPED; gaps E2E (COD punta a punta, tarjeta DECLINED en UI, checkout con diseño del Estudio, login de cliente, cupón en UI); backlog (recogidas por API, rótulo V3, entrega en oficina, polling en PendingPage, `expiration-time`, persistir `payment_method_type`/`status_message`, migrar webhook Aveonline al token oficial, sharp 0.35.x solo con deploy de verificación).
6. **Verificación periódica de residuos de prueba en BD** (la query de §6) — las corridas anteriores al auto-cleanup dejaron 28 órdenes visibles en el admin; conviene correrla tras sesiones de debugging e2e.

---

## 6. Información Relevante

### Gotchas detectados esta sesión

- **Tras agregar/quitar rutas del App Router, `npx next typegen` antes de `tsc --noEmit`** — si no, `.next/dev/types/validator.ts` falla con TS2344 sobre rutas fantasmas o faltantes. Y si los errores en `validator.ts` **persisten** tras typegen (sintaxis rota, líneas truncadas), el generado quedó corrupto por escrituras concurrentes: `rm -rf .next/dev/types && npx next typegen` lo regenera limpio (ocurrió hoy; `.next` es caché gitignored, borrarlo es seguro).
- **Nunca correr `tsc` en paralelo con `next dev`** (el dev server re-escribe `.next/dev/types/` mientras tsc lee → errores de sintaxis espurios en archivos generados).
- **El endpoint público `/api/cms/settings` devolvía TODO SiteSetting** — el comentario de la propia ruta advertía el patrón ("si se agregan settings sensibles, filtrar acá") pero ya había datos sensibles dentro. Lección: el filtro debe ser por defecto, no "cuando haga falta".
- **El dashboard medía el trabajo del cliente** (`PENDING_PAYMENT`) y no el de Lucy (`PAID`+`FULFILLING`): las métricas de una home operativa deben responder "¿qué tengo que hacer HOY?".
- **`git diff --name-only` incluye archivos eliminados** — al pasarlo a `prettier --check` hay que filtrarlos o reporta "No files matching the pattern" (ruido, no fallo real).
- **Un query de residuos con `contains: "e2e"` puede dar falsos positivos hex** (un UUID contiene "4e2e"): verificar antes de borrar; el soft-delete lo hace reversible.
- Los `[wompi requestfailed] analytics.google.com` del log E2E son el tracking de la página hospedada de Wompi bloqueado por el navegador de test — ruido irrelevante (vigente de la 1ª pasada).

### Comandos clave

- **E2E certificación transaccional (el usado hoy, verde)**:
  `cd apps/web && set -a && source .env.local && set +a && TURNSTILE_SECRET_KEY= NEXT_PUBLIC_TURNSTILE_SITE_KEY= PW_CHANNEL=chromium npx playwright test wompi-sandbox --workers=1 --retries=0 && TURNSTILE_SECRET_KEY= NEXT_PUBLIC_TURNSTILE_SITE_KEY= PW_CHANNEL=chromium npx playwright test admin-transactional --workers=1 --retries=0`
  (orden importa: `admin-transactional` restaura la orden PAID que crea `wompi-sandbox`; también corre solo si ya existe una orden e2e reciente)
- **Vitest focal de lo tocado**: `cd apps/web && npx vitest run lib features/checkout features/orders app/api`
- **Suite completa**: `cd apps/web && npx vitest run` (~20 min contra el pooler real)
- **Gates de código**: `cd apps/web && npx next typegen && pnpm typecheck && pnpm lint` · `npx prettier --check <archivos>`
- **Verificación de residuos e2e (solo lectura)**: `cd packages/db && node --env-file=../../apps/web/.env.local -e '<query Prisma: orders/customers/products con wompi-e2e- o @example.com y deletedAt:null; webhookEvent últimas 2h>'`
- **Rollback al punto estable**: `git checkout develop && git reset --hard 019f6fe` (⚠️ descarta cambios sin commitear — ver `docs/audits/2026-07-29-restore-point.md`)

---

## Addendum — eliminación total de Venndelo (post-deploy, 2026-07-29)

Decisión de negocio comunicada por Lucy en este chat: "Venndelo hoy por hoy NO existe ni debería existir en el Desarrollo; Aveonline tiene ese rol — eliminar absolutamente todo". Resuelve el §5a.1. Ejecutado en la misma sesión, tras el deploy de la re-certificación:

- **Código**: eliminado `apps/web/features/shipping/venndelo.ts` (stub que solo lanzaba `NOT_IMPLEMENTED`); `features/shipping/provider.ts` simplificado a Aveonline único (sin rama dinámica ni union `"aveonline" | "venndelo"`); `SHIPPING_PROVIDER` retirada de `.env.example` (ya nadie la lee); comentarios que citaban Venndelo reescritos (`security-headers.ts`, `supabase/service.ts`, `subprocesadores/page.tsx`); seed `packages/db/scripts/seed-cms.mjs` ya no siembra "Venndelo / Coordinadora" en subprocesadores (fila reemplazada por Aveonline).
- **Schema + BD**: migración `20260729150000_drop_venndelo_plan_b` (escrita a mano y aplicada con `migrate deploy` — `migrate dev` no puede levantar shadow DB por un `pg_trgm` de una migración vieja, P3006): enum `WebhookSource` sin `VENNDELO` + `Order.venndeloShipmentId` eliminada. Verificado ANTES: 0 filas usaban el valor/columna. Verificado DESPUÉS por query: `enumValues: [WOMPI, RESEND, AVEONLINE]`, columna ausente, migración registrada.
- **Env**: bloque `VENNDELO_*` eliminado de `apps/web/.env.example` y de AMBOS `.env.local` (root y apps/web) — incluía una API key en claro y la dirección/teléfono personales de recogida (datos que ya viven solo en SiteSettings, donde los lee la saga). **Acción humana recomendada**: revocar/rotar la API key de Venndelo (`3717e9b3-…`, estuvo en texto plano en `.env.local`) y cerrar la cuenta si ya no se usa.
- **Docs**: purga de menciones en la documentación operativa (README, CLAUDE.md, PLAN, ARCHITECTURE, INTEGRATIONS, OPERATIONS, SECURITY, OBSERVABILITY, CONVENTIONS, TESTING, ROADMAP, COMPETITIVE_ANALYSIS, PLAN_CATALOG_V2, RUNBOOK_GO_LIVE, INTEGRATIONS_AVEONLINE). Historia fechada intacta: `docs/audits/**`, `docs/STATE.md` y los ADRs de `DECISIONS.md` (ADR-005 marcado SUPERSEDED por ADR-039; no se falsifica historia).
- **Verificación**: grep final de código sin menciones operativas (quedan solo 2 comentarios históricos deliberados); typecheck ✓ · lint ✓ · vitest — durante la verificación apareció y se corrigió un defecto NO relacionado (tormenta de colisiones P2002 en `generateOrderNumber`; root cause y fix en §4.8).
- **Commits propuestos** (NO ejecutados aún):
  1. `fix(orders): numeración de orden max(number)+1 bajo advisory lock — elimina tormenta de colisiones P2002 tras hard deletes` (solo `features/orders/service.ts`).
  2. `chore(shipping)!: eliminar Venndelo por completo — provider único Aveonline, enum/columna fuera, docs purgados (decisión Lucy 2026-07-29)` (breaking: requiere `prisma migrate deploy` en cada entorno — la migración `20260729150000_drop_venndelo_plan_b` ya está aplicada en la BD de develop y viaja en el repo para producción).

### Post-script 5 — Todo el texto visible editable + Admin de contenido reformulado (2026-07-29, noche)

Lucy: "¿no sería bueno que todo esto se administre desde el Admin?" + "el Admin debería reformularse". Verificado texto por texto contra BD/código (no suposición): el 95% ya era editable; se completó el 5% restante y se reformuló la presentación.

- **Seed completion (26 bloques)**: todo `blockKey` que solo tenía fallback en código quedó sembrado con su texto actual: hero completo (título, acento, chips — chip-eta en forma token), featured.empty, pdp.related, columnas del footer, contacto, ayuda (encabezados/CTA), mi-cuenta, status, maintenance. Total: **83 textos editables** desde `/admin/contenido/bloques`. LEGAL queda fuera a propósito (cumplimiento, no edición casual — decisión documentada).
- **Limpieza de basura de tests**: 30 bloques `itestcms*` (residuo de tests de integración CMS) visibles en el admin de Lucy → soft-deleted (0 restantes). Misma clase de residuo histórico que las 28 órdenes e2e: los teardowns no alcanzan todo.
- **Reformulación del módulo** (`blocks-browser.tsx`, client): (a) **buscador** ("escribe lo que ves en tu sitio"); (b) agrupación por **LUGAR del sitio** derivada del prefijo de key ("Inicio · Portada", "Preguntas frecuentes", "Checkout", "Pie de página"…) en vez de categoría técnica; (c) título "Base de conocimiento" → **"Textos del sitio"** y grupo del menú "IA y Conocimiento" → **"Contenido"** (label "Textos del sitio"; la key queda pequeña solo para soporte). Nav + test actualizados.
- **Data-quality**: descripciones de los 29 bloques nuevos corregidas (el default "FAQ visible en /ayuda" había quedado pegado por el seed).
- **Evidencias**: screenshots del admin reformulado (lista + búsqueda "entrega" → 2 resultados) · admin-nav 11/11 ✓ · typecheck/lint/prettier ✓ · render del sitio intacto (los textos sembrados son idénticos a los fallbacks).
- **Gotcha recurrente (ya documentado)**: `tsc` falló otra vez por `.next/dev/types` corrupto con el dev server vivo → `rm -rf .next/dev/types && npx next typegen`. Y pkill con el patrón del propio servidor en la misma línea de comando se auto-mata (separar en dos llamadas).

### Post-script 4 — Fuente única para promesas: settings atómicos + tokens CMS (2026-07-29, noche)

Duda de Lucy: "en Admin dice Tiempo de fabricación pero el Front dice Entrega en máx. 3 días (2 fabricación + 1 entrega)… esto es un ejemplo de muchos, por eso pongo en duda el CMS". Tenía razón y era un defecto de modelado, no de uso:

- **Causa raíz**: la promesa vivía literal en 5+ lugares (bloques, fallbacks, settings) sin fuente única. Peor: `MANUFACTURING_DAYS_RANGE` y `DELIVERY_COVERAGE_COUNT` **no tenía ningún lector en el código** (verificado por grep) — editarlas no movía nada.
- **Fix estructural**:
  - Settings atómicos canónicos en COMMERCE: `PRODUCTION_DAYS_DEFAULT="2"` y `DELIVERY_DAYS_ESTIMATE="1"` (etiquetas inequívocas en español + descripción de qué alimentan). `MANUFACTURING_DAYS_RANGE` **eliminada** (0 refs, valor ambiguo).
  - Nuevo `lib/cms-tokens.ts` → `resolveCmsTokens()`: tokens `{{fab}}`, `{{entrega}}`, `{{total}}` (calculado), `{{cobertura}}`, `{{ciudad}}` (con ctx). Aplicado en `<CmsText>` y `<CmsMarkdown>` sobre body Y fallback; `getPageSeo` se movió a ese módulo (evita ciclo cms ↔ cms-tokens).
  - Migración a tokens: 5 bloques en BD (`faq.02`, `faq.04`, `home.howitworks.step3.description`, `home.hero.description`, `seo.page.home`) + 6 fallbacks de código (`hero.tsx` ×2, `how-it-works.tsx`, `app/page.tsx`, `ayuda/page.tsx` ×2).
- **Prueba empírica (la duda misma)**: settings a 4+2 en BD → `/ayuda` y el chip del home pasaron a "máximo **6** días hábiles (4 de fabricación + 2 de entrega)" sin tocar código ni contenido → revertidas a 2+1 → todo volvió a 3. Un solo cambio propaga a TODOS los textos.
- **Evidencias**: 6 tests nuevos del resolver (6/6) · typecheck/lint/prettier ✓ · vitest focal (ver §2 conteo) · renders verificados localmente antes/después.
- **Archivos**: creado `apps/web/lib/cms-tokens.ts` + `lib/cms-tokens.test.ts`; modificados `components/cms/cms-text.tsx`, `components/cms/cms-markdown.tsx`, `lib/cms.ts`, `components/home/hero.tsx`, `components/home/how-it-works.tsx`, `app/page.tsx`, `app/ayuda/page.tsx`, `app/contacto/page.tsx` (import) + contenido de 5 bloques y 3 settings en BD.
- **Regla de oro documentada para el futuro**: un dato que aparezca en 2+ textos del sitio vive UNA vez en SiteSettings y se referencia con token — nunca literal duplicado. Tokens disponibles: `{{fab}}`, `{{entrega}}`, `{{total}}`, `{{cobertura}}`, `{{ciudad}}` (checkout).
- **Fix de cobertura detectado en la verificación de prod** (`51fe89b`): `CodAwareCmsText` (paso 3 del home) leía `getCmsBlock` DIRECTO y mostraba `{{total}}` crudo en producción. Se resolvió el token en TODOS los consumidores directos: `CodAwareCmsText`, `newsletter-welcome` y la API pública (`/api/cms/blocks` + `[key]`, que ahora entregan el texto final al consumidor externo). Verificado en vivo: 0 tokens crudos en home y /ayuda; API sirve texto resuelto.

### Post-script 3 — Ruta A: extensión del CMS in-house al 100% del gap (2026-07-29)

Decisión de Lucy: descartado Strapi/Sanity (ya existe un headless CMS in-house certificado: 72 bloques + 41 settings + API pública + admin no-técnico). Se extendió su cobertura al gap restante. **Punto de restauración**: `19f0e0f` + factores de rollback en `docs/audits/2026-07-29-restore-point.md` (sin migración de schema; filas aditivas inertes en rollback gracias a los fallbacks).

**Hallazgo clave de la fase**: el cableado YA existía en casi todo — el "plano" era ausencia de contenido semilla, no falta de arquitectura.

- **Fase 1 — FAQ (/ayuda)**: la página ya iteraba `getCmsBlocksByCategory("FAQ")` (categoría vacía). Sembrados 10 bloques `faq.NN-slug` (prefijo numérico = orden editorial, title=pregunta, body=respuesta). Verificación empírica con marcador en BD: la página sirve el título editado del CMS (no el fallback). API pública `/api/cms/blocks?category=FAQ` expone los 10.
- **Fase 2 — microcopy checkout**: 3 bloques (`checkout.envio.heading`, `checkout.envio.subtext` con token `{{ciudad}}` — nuevo helper puro `splitCityTemplate` en `lib/format.ts`, `checkout.pago.heading`); refactor de `checkout/envio/page.tsx` (server, ambas ramas) + `envio-step.tsx` (props nuevas) + `pago/page.tsx` (CmsText). E2E transaccional completo verde con los textos CMS en el flujo.
- **Fase 3 — SEO por página**: helper `getPageSeo()` en `lib/cms.ts` (title=meta title, body=meta description); `generateMetadata` dinámico en home, /ayuda y /contacto leyendo `seo.page.*` con fallback que conserva el gate de modo. 3 bloques sembrados; `<title>` verificado en las 3 páginas.
- **Fase 4 — patrón emails**: diseño acotado por riesgo — **subject + preview editables** (bloques `email.<plantilla>.subject|preview`, categoría EMAIL), **body en código** (variables + layout inline + cumplimiento: HTML libre rompería clientes de correo). Migrada `newsletter-welcome` como prueba del patrón + 2 tests (override gana / fallback intacto). Backlog mecánico: las otras 12 plantillas.

**Evidencias**: seed idempotente `packages/db/scripts/seed-cms-ruta-a.mjs` (18 bloques: 10 FAQ + 3 checkout + 3 SEO + 2 email — crea solo los que faltan, jamás pisa ediciones de Lucy) · vitest focal **1147/1147** (52 archivos) · tests nuevos: 2 del patrón email · typecheck/lint/prettier ✓ · E2E `wompi-sandbox` 1/1 (2.4m) · residuos BD 0 · verificación de render local con marcador CMS y metas SEO.

**Archivos**: creado `packages/db/scripts/seed-cms-ruta-a.mjs`; modificados `lib/cms.ts` (getPageSeo), `lib/format.ts` (splitCityTemplate), `app/page.tsx`, `app/ayuda/page.tsx`, `app/contacto/page.tsx`, `app/checkout/envio/page.tsx`, `app/checkout/envio/envio-step.tsx`, `app/checkout/pago/page.tsx`, `features/emails/templates/newsletter-welcome.ts`, `features/emails/templates/templates.test.ts`, `docs/audits/2026-07-29-restore-point.md`.

**Pendiente documentado**: aplicar el patrón subject/preview a las otras 12 plantillas de email; microcopy de componentes CLIENT del checkout (datos-form) y del Estudio (requiere props threading — evaluar valor vs. riesgo en otra iteración).

### Post-script operativo — credenciales demo Aveonline restauradas en Vercel (2026-07-29)

El smoke post-deploy destapó un gap **pre-existente** (no causado por los cambios del día): `/api/health/aveonline` en producción respondía `ok:false — AVEONLINE_DEMO_USUARIO/CLAVE no configurados`, cuando el 2026-07-20 respondía `ok:true` con la cuenta demo 15289 (RUNBOOK FASE 8). En Vercel solo existían las 4 vars `AVEONLINE_{ENV,USUARIO,CLAVE,WEBHOOK_SECRET}` (creadas hace 9 días); el trío `AVEONLINE_DEMO_*` había desaparecido en algún momento (quién/cuándo no es auditable desde el repo) → **la cotización de envíos del sitio en vivo estaba caída**. Con autorización de Lucy se agregaron las 3 vars demo (públicas, de `.env.example`) al scope **Production** vía `vercel env` y se redeployó (`lucams-shop-lbthk24tb`): el health volvió a `{"status":"ok","authenticated":true,"idempresa":15289,"isDemoAccount":true}` — el estado sano documentado. Pendientes menores: (a) scope **Preview** no quedó (el CLI exige prompt interactivo de gitBranch para target=preview; agregarlo a mano si se usa el checkout en previews); (b) auditar quién borró las vars originales para que no se repita (las borradas no dejan rastro en `vercel env ls`).

### Post-script 2 — feedback visual/contenido de Lucy (2026-07-29, tarde)

Ronda de observaciones de Lucy poniéndose del lado del usuario, con análisis de causa raíz y fix verificado con screenshots reales (Chromium, desktop 1280 + mobile 390):

1. **"¿Por qué se duplicó el logo?"** — Causa raíz real: `LucamsLogo` ponía `display:inline-block` en **inline style**, que le gana a cualquier clase Tailwind → el `md:hidden` / `hidden md:block` del hero no aplicaba y AMBOS logos (140px + 280px) se renderizaban siempre. Fix: el display pasó a clase (`cn("relative inline-block", className)` en `components/lucams-logo.tsx`). Verificado: 1 logo por breakpoint.
2. **Buscador con mascota → lupita** — El trigger de `GlobalSearch` mostraba la mascota de marca; ahora lleva el icono `Search` de lucide (la mascota se queda solo dentro del diálogo). Test `global-search.test.tsx` actualizado al nuevo contrato (11/11 verdes).
3. **Texto falso "El pago y el envío se acuerdan por WhatsApp"** en el paso 3 del home — era doble fuente del modo catálogo: el **bloque CMS publicado** (`home.howitworks.step3.description`, corregido directo en BD) y el **fallback de código** (`components/home/how-it-works.tsx`, corregido). Texto verdadero en modo full: "…Pagas en línea de forma segura — contraentrega disponible." (la coletilla COD sigue recortándose si `COD_ENABLED` se apaga). Las páginas `/ayuda` y PDP ya estaban bien gateadas por modo (`isCatalogMode`).
4. **Promesa de entrega con desglose** — El chip del hero ahora informa "Entrega en máx. 3 días hábiles (2 de fabricación + 1 de entrega)" (fallback + editable como bloque `home.hero.chip-eta`). PDP (`productionDays` por producto) y `/ayuda` ya lo desglosaban.
5. **Gotcha de caché de contenido**: editar contenido CMS directo en BD NO se refleja ni borrando `.next/cache` — hizo falta `rm -rf apps/web/.next` completo en dev (la vía correcta en producción es el botón "Actualizar caché de contenido" del admin, que invalida el tag `cms`).

**Modularidad para admin no técnico (estrategia acordada)**: NO se construyó un módulo nuevo — la infraestructura ya existía y es la que Lucy ya conoce: **Bloques** (`/admin/contenido/bloques`, todo el copy del home, con "Crear bloque nuevo"), **Configuración** (`/admin/contenido/configuracion`: `COD_ENABLED`, `MANUFACTURING_DAYS_RANGE` — que ya contiene exactamente "3 días hábiles (2 de fabricación + 1 de entrega)", `DELIVERY_COVERAGE_COUNT`, horarios, contacto) y **por producto** (`productionDays` en el form de producto, que alimenta la promesa del PDP). Regla aplicada: cada promesa tiene UNA fuente editable por Lucy y el código solo trae fallbacks verdaderos. Quedan hardcodeados a propósito: textos legales (aprobados para cumplimiento, no edición casual) y `/ayuda` (gateado por modo tienda).

Archivos tocados: `components/lucams-logo.tsx`, `components/global-search.tsx`, `components/global-search.test.tsx`, `components/home/hero.tsx`, `components/home/how-it-works.tsx` + contenido del bloque en BD. Gates: typecheck ✓ · lint ✓ · prettier ✓ · tests del componente ✓. Verificación visual con screenshots antes/después.

**Caché CMS en producción (lección operativa real)**: tras el deploy, la home seguía mostrando el texto viejo del paso 3 aunque `/api/cms/blocks` ya devolvía el nuevo — **Vercel persiste el data cache de `unstable_cache` entre deploys** (el TTL de 3600 s no bastó). Se invalidó el tag `cms` con la vía diseñada: el botón "Actualizar caché de contenido" de `/admin/contenido/bloques`, clicado vía patrón admin-efímero E2E (SUPERADMIN temporal creado por API, login Playwright en producción, clic, borrado; 0 residuos verificados). Regla: **toda edición de contenido CMS directa en BD exige invalidar el tag `cms` con ese botón** — un redeploy NO lo hace.

### Documentación importante

- `docs/audits/2026-07-29-restore-point.md` — puntos de restauración de AMBAS pasadas (`bc1e41b` y `019f6fe`).
- HANDOFF de la 1ª pasada (git history, commit `019f6fe`) — fix flete HMAC, carrera dedup P2002, cableado gestor Aveonline. Sigue vigente como contexto operativo.
- `docs/INTEGRATIONS.md` (estados Wompi) y `docs/INTEGRATIONS_AVEONLINE.md` §21 (semántica `bloquegenerarguia` — pendiente verificación con cuenta real antes de `AVEONLINE_GENERATE_REAL=true`).
- Recordatorio operativo vigente: **todo push a `develop` dispara deploy de PRODUCCIÓN en Vercel** (modo full, llaves sandbox) — por eso los commits propuestos en §2 esperan tu confirmación.
