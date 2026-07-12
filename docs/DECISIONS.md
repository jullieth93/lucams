# Log de decisiones — Lucams_shop

Registro cronológico de decisiones de producto y arquitectura, con el "por qué" detrás de cada una. Inspirado en el formato ADR (Architecture Decision Record) pero más liviano.

> **Cómo agregar una decisión:** una entrada nueva al final, con fecha (YYYY-MM-DD), título, contexto, decisión y consecuencia. No editar entradas viejas (excepto para marcarlas como `SUPERSEDED` por una posterior).

---

## ADR-001 — Stack Next.js 15 + TypeScript + Tailwind + shadcn/ui

**Fecha:** 2026-05-09
**Estado:** ✅ Aceptada

**Contexto:** El usuario quiere clonar funcionalmente magneticas.cl (un Shopify estándar) pero con valor agregado fuerte. Necesitamos un framework moderno con SSR/ISR, buen SEO, y que el desarrollador pueda iterar rápido en UI.

**Decisión:** Next.js 15 (App Router) + TypeScript + Tailwind 4 + shadcn/ui.

**Por qué:**

- Next.js es estándar de la industria para e-commerce SSR.
- App Router permite Server Components → bundle JS pequeño.
- shadcn/ui da componentes accesibles y con muy buen diseño base, customizables.
- Tailwind permite implementar la paleta como design tokens fácilmente.

**Consecuencia:** El equipo asume Next.js como dependencia mayor. Si Next.js 16 trae cambios incompatibles, se reservan días de migración.

---

## ADR-002 — Hosting: Vercel sobre Render

**Fecha:** 2026-05-09
**Estado:** ✅ Aceptada

**Contexto:** Decisión entre Vercel y Render como plataforma de despliegue.

**Decisión:** Vercel.

**Por qué:**

- Vercel construye Next.js → soporte de primera mano.
- ISR automático (esencial para revalidar productos al cambiar precio/stock).
- Edge Functions de baja latencia (importante para webhooks de Wompi/Venndelo).
- Image Optimization integrada.
- Mejor DX (preview deployments por PR).
- Render es excelente para Rails/Django o servicios de larga duración, no para SSR Next.js.

**Consecuencia:** Aceptamos los precios de Vercel ($20/mes Pro). En el futuro, si los costos escalan mucho, podríamos evaluar Cloudflare Pages o auto-hosting con Coolify.

---

## ADR-003 — DB: Supabase

**Fecha:** 2026-05-09
**Estado:** ✅ Aceptada

**Contexto:** Mandato del usuario: usar Supabase y su ecosistema.

**Decisión:** Supabase Postgres + Auth + Storage + Realtime, accedido vía Prisma.

**Por qué:**

- Mandato no negociable.
- Supabase combina DB + Auth + Storage + Realtime + Edge Functions en un solo plan.
- RLS de Postgres permite seguridad declarativa por fila.
- Free tier suficiente para todo el desarrollo.
- Pro tier ($25/mes) trae backups automáticos PITR.

**Consecuencia:** Acoplamiento fuerte a Supabase. Si quisiéramos migrar a otro Postgres, perderíamos Auth/Storage integrados pero el resto (DB) sería portable vía Prisma.

---

## ADR-004 — Pasarela: Wompi sobre Mercado Pago

**Fecha:** 2026-05-09
**Estado:** ✅ Aceptada

**Contexto:** Decidir pasarela de pago para Colombia. Comparados Wompi y Mercado Pago.

**Decisión:** Wompi como pasarela principal. Mercado Pago queda disponible vía adaptador `PaymentProvider`.

**Por qué:**

- Comisión menor: ~2.65% vs ~3.49% en tarjetas. Diferencia significativa en e-commerce sostenido.
- Métodos colombianos más fuertes: Nequi, Bancolombia transferencia directa, Daviplata. MP no los maneja igual de bien.
- Liquidación T+1 (gratis) en Wompi vs T+14 en MP.
- Confianza local: Wompi es de Bancolombia, marca reconocida en CO.

**Trade-off aceptado:**

- Onboarding de Wompi tarda 1-3 semanas (KYC); MP era más rápido.
- Wompi no tiene SDK Node.js oficial; integramos contra REST directamente.
- Sin componentes UI prefabricados estilo "Bricks" — nosotros construimos el checkout.

**Mitigación:** Adaptador `PaymentProvider` permite agregar Mercado Pago u otros sin reescribir el checkout. Documentado en `ARCHITECTURE.md`.

**Consecuencia:** Si Wompi falla en aprobar el comercio o se demora más de lo esperado, podemos lanzar con Mercado Pago provisionalmente sin reescribir.

### Addendum 2026-05-13 — Hosted Checkout + integrity signing

Tras investigar la doc oficial Wompi previo a implementar sub-bloque N, se concretan estas sub-decisiones:

- **Modo de checkout: Hosted Checkout (Web Checkout)** vs Widget JS embebido. Razones:
  - PCI-DSS scope reducido: el cliente nunca ingresa tarjeta en nuestro dominio, sólo redirección a `checkout.wompi.co`.
  - Soporte automático de Nequi/PSE/Bancolombia/Daviplata/tarjeta sin que tengamos que cablear UI por método.
  - Wompi mantiene la UI de pago — no hay que actualizar nuestro código si agregan métodos nuevos.
- **Trade-off:** salimos del dominio durante el pago (UX menos cohesiva). Mitigado con redirect post-pago a `/checkout/confirmacion?id={transactionId}` + brand consistente en página de confirmación.
- **Integrity signing SHA256 obligatorio** (`WOMPI_INTEGRITY_SECRET` separado de `WOMPI_EVENTS_SECRET`): cada link de checkout incluye una firma para evitar tampering del monto o referencia. Sin firma → checkout rechazado por Wompi.
- **Webhook events (`WOMPI_EVENTS_SECRET`):** verificación HMAC-SHA256 separada, distinto de integrity. La doc lo marca explícito — no reusar la misma clave.
- **Idempotencia:** `WebhookEvent` table con unique `[source='wompi', externalId]` (ya existe en schema). Cada `transaction.updated` se persiste idempotente.
- **Status de Order:** Wompi devuelve `APPROVED/DECLINED/VOIDED/ERROR`. Mapping a nuestro state machine: APPROVED→PAID, DECLINED→FAILED, VOIDED→CANCELLED. ERROR queda PENDING_PAYMENT con flag manual-review.
- **No verificar status solo por query param post-redirect** — siempre cruzar con `GET /transactions/{id}`. El query param es informativo, no autoritativo (alguien podría forjarlo).

Verificado contra `developers.wompi.co` (doc oficial, 2026-05-13).

---

## ADR-005 — Logística: Venndelo (Coordinadora + COD)

**Fecha:** 2026-05-09
**Estado:** ✅ Aceptada

**Contexto:** Necesitamos logística que cubra Colombia con cotización dinámica y soporte contraentrega (COD), método de pago dominante en e-commerce CO.

**Decisión:** Venndelo (partner Coordinadora).

**Por qué:**

- Cobertura: 1.100+ destinos con COD.
- 0% comisión sobre la venta (solo costo de envío).
- API pública (`api.venndelo.com`) — no es propietario sin documentación.
- Pago inmediato al usuario tras la entrega COD.
- No requiere mensualidad ni costos fijos.

**Consecuencia:** Acoplamiento a Coordinadora vía Venndelo. Si Venndelo cierra o cambia condiciones, hay alternativas (Servientrega, Interrapidísimo, Envía) que requerirían re-integración.

### Addendum 2026-05-13 — V1 con asterisks: adapter + mock + polling 30min

Tras 12 preguntas a soporte Venndelo + pruebas reales con `POST /orders/quotation` (sandbox no existe, pruebas en producción con wallet de prueba), se concretan estas sub-decisiones para el sub-bloque O:

**Gaps confirmados con soporte Venndelo (2026-05-13):**

1. **Sin sandbox** — sólo ambiente producción. Pruebas reales consumen wallet (~$10.900 COP por cotización Bogotá-Medellín, $0 sólo si abortamos antes de `request-pickup`).
2. **Sin webhooks** — para clientes API NO existen. El cliente debe hacer polling de `GET /shipments/{id}` cada N tiempo para detectar transitions de status. Lo confirmaron por escrito.
3. **Catálogo de ciudades inconsistente** — Bogotá D.C. listada como `subdivision_code: 25` (Cundinamarca) aunque DANE dice 11. Verificado por POST /orders/quotation con 11 vs 25 → mismo etag/precio, el API resuelve por `city_code` solo.
4. **OpenAPI doc no documenta autenticación de webhooks** — moot ya que no hay webhooks para clients.

**Decisión arquitectónica V1 con asterisks (3 condiciones obligatorias):**

1. **Adapter `ShippingProvider` desde día 1** (interfaz Venndelo + mock + futuros). Si Venndelo discontinúa o sale un competidor con webhooks, sub-bloque de migración aislado en `features/shipping/providers/`. No volvemos a reescribir el checkout.
2. **Mock client `MockShippingProvider`** en dev/CI con quotes deterministas + simulación de transitions automáticas. Sin esto los E2E tests gastarían wallet real cada PR.
3. **Polling cada 30 min** (`pg_cron` job `sync-shipments.mjs`): por cada Order en status SHIPPED no entregada, llama `GET /shipments/{id}` y actualiza local. 30 min es trade-off: lo suficientemente fresco para UX ("tracking update cada 30 min" disclaimer visible al cliente) sin matar la API rate-limit.
4. **UX disclaimer obligatorio:** "Actualizaciones de tracking cada 30 minutos. Para ver el estado en vivo, usa el link de Coordinadora." Esto setea expectativas honestas vs e-commerces con webhook real-time.

**Configuración pickup verificada (2026-05-13):**

- `VENNDELO_PICKUP_CITY_CODE=11001000` (DANE oficial Bogotá D.C.)
- `VENNDELO_PICKUP_SUBDIVISION_CODE=11` (DANE departamental — Venndelo acepta tanto 11 como 25 sin error, usamos 11 por consistencia legal/DIAN)
- `VENNDELO_PICKUP_COUNTRY_CODE=CO`
- `VENNDELO_PICKUP_CONTACT_PHONE=...` (10 dígitos sin `+`, formato Colombia)

**Cuándo reabrir esta decisión:** si Venndelo lanza webhooks para clients, si volumen justifica polling más agresivo (cada 5 min), o si aparece un competidor (Treggo, ShipBob LatAm, alguna nueva integración Coordinadora directa) con mejor relación.

---

## ADR-006 — WhatsApp: solo `wa.me`, sin API

**Fecha:** 2026-05-09
**Estado:** ✅ Aceptada (decisión del usuario)

**Contexto:** Inicialmente se planteaba Twilio WhatsApp Business API para automatizar confirmaciones, recuperación de carrito y chatbot. El usuario decide no automatizar por ahora.

**Decisión:** Solo botón flotante con link `wa.me` y mensaje pre-armado contextual. Sin Twilio.

**Por qué (usuario):**

- Reducir costos iniciales.
- Manejo manual del WhatsApp es viable al volumen actual.
- Twilio se puede agregar después sin reescribir nada relevante.

**Consecuencia:**

- Variable `NEXT_PUBLIC_WA_NUMBER` centraliza el número.
- `lib/whatsapp.ts` genera links contextuales (PDP, carrito, orden).
- Cuando se quiera automatizar, se reemplaza la implementación de `whatsapp.ts` por una que llame a Twilio.

---

## ADR-007 — Free durante dev → Pro al lanzar

**Fecha:** 2026-05-09
**Estado:** ✅ Aceptada (decisión del usuario)

**Contexto:** Inicialmente se proponía Vercel Pro + Supabase Pro + Resend Pro desde el día 1 (~$65 USD/mes). El usuario decide diferir el upgrade hasta el momento del lanzamiento.

**Decisión:** Tiers Free durante todo el desarrollo. Migración a Pro únicamente al pasar a producción.

**Por qué (usuario):**

- Sin gastos fijos durante construcción.
- El upgrade es trivial (un click en cada panel).
- Las limitaciones de Free no son bloqueantes en dev.

**Consecuencia / aceptado:**

- **Vercel Hobby:** sin Web Analytics, function timeout 60s, ToS no permite uso comercial. Migrar a Pro al recibir el primer pago real.
- **Supabase Free:** se pausa tras 1 semana de inactividad. Migrar a Pro antes de lanzar.
- **Resend Free:** 3k emails/mes, solo subdominio `resend.dev`. Migrar a Pro y verificar `mail.lucamsshop.co` al lanzar.
- Costo dev: $0/mes. Costo prod: ~$68/mes.

---

## ADR-008 — Sin monitoreo de errores en el plan

**Fecha:** 2026-05-09
**Estado:** ✅ Aceptada (decisión del usuario)

**Contexto:** Se proponía Sentry Team ($26/mes) para monitoreo de errores en producción. El usuario lo descarta del plan actual.

**Decisión:** Monitoreo de errores fuera del alcance. Durante dev se usa `console.error` + Vercel Logs. Antes del lanzamiento se evalúa una alternativa gratuita y se documenta.

**Por qué (usuario):**

- Reducir costo recurrente.
- Ojalá free.

**Alternativas a evaluar en Fase 7:**

- Sentry Free (5.000 eventos/mes, 1 usuario).
- BetterStack (logging + uptime, free tier).
- Highlight.io (session replay + errores, free tier).
- Solo Vercel Logs + alerta vía Resend cuando error rate > X.

**Consecuencia:** Durante dev, debugging depende de Vercel Logs. Aceptable. Si hay un incidente productivo antes de instalar monitoreo, depende del usuario reportarlo.

---

## ADR-009 — Contraentrega activa desde el día 1

**Fecha:** 2026-05-09
**Estado:** ✅ Aceptada (decisión del usuario)

**Contexto:** Decidir si lanzar con Wompi solamente o también con COD (contraentrega vía Venndelo) desde el inicio.

**Decisión:** Ambos disponibles desde el lanzamiento.

**Por qué:**

- En Colombia el COD eleva la tasa de conversión inicial significativamente, especialmente fuera de las grandes ciudades.
- Venndelo cobra COD por nosotros y deposita inmediatamente.
- Si Wompi se demora en aprobar el comercio, COD nos permite vender mientras tanto.

**Consecuencia:** Mayor complejidad en el checkout (selector de método de pago). Worth it.

---

## ADR-010 — Catálogo seed: 30+ productos espejo de magneticas.cl

**Fecha:** 2026-05-09
**Estado:** ✅ Aceptada (decisión del usuario)

**Contexto:** Decidir cómo poblar el catálogo inicial. Opciones: esperar productos reales del usuario, o usar placeholders.

**Decisión:** Replicar 30+ productos de magneticas.cl como seed con fotos placeholder. El usuario reemplaza fotos y precios cuando los tenga.

**Por qué:**

- Site listo para vender desde el lanzamiento sin esperar fotos profesionales.
- Estructura de categorías y productos validada.
- Cambiar fotos/precios después es trivial desde el admin.

**Consecuencia:** Durante dev y soft launch los productos lucen genéricos. **Antes del lanzamiento real es obligatorio reemplazar todas las fotos y revisar precios** para evitar problemas legales o de imagen.

---

## ADR-011 — Dominio `lucamsshop.co` en mi.com.co

**Fecha:** 2026-05-09
**Estado:** ✅ Aceptada (decisión del usuario)

**Contexto:** Inicialmente se sugirió Cloudflare Registrar para registrar el dominio. El usuario propone mi.com.co (registrador colombiano).

**Decisión:** Comprar `lucamsshop.co` en mi.com.co cuando se lance a producción (Fase 7).

**Por qué:**

- mi.com.co es el registrador colombiano estándar para `.co` y `.com.co`.
- Cloudflare Registrar no maneja bien los TLD colombianos.
- Costo aproximado: ~$50.000 COP/año.

**Consecuencia:** DNS se configurará en Cloudflare (Free) apuntando los nameservers; el registro queda en mi.com.co.

---

## ADR-012 — Documentación dentro del repo, no en `~/.claude/plans/`

**Fecha:** 2026-05-09
**Estado:** ✅ Aceptada (decisión del usuario)

**Contexto:** Plan mode de Claude Code obliga a editar el plan en `/home/ansible/.claude/plans/...`. El usuario quiere que toda la documentación viva dentro del proyecto.

**Decisión:** Al salir de plan mode, copiar todo el contexto a `lucams_shop/docs/` y borrar el archivo global. Documentación dentro del repo es la única fuente de verdad.

**Por qué:**

- El repo es la fuente de verdad versionada.
- Cualquier dev que clone el repo tiene contexto completo.
- Claude Code en futuras sesiones lee `CLAUDE.md` automáticamente.
- El archivo en `~/.claude/plans/` no se versiona ni se comparte.

**Consecuencia:** Toda actualización futura de documentación pasa por el repo (commits + PRs).

---

## ADR-013 — Estudio de Personalización como diferenciador #1

**Fecha:** 2026-05-09
**Estado:** ✅ Aceptada

**Contexto:** Magneticas.cl tiene productos personalizables pero el flujo es: el cliente "encarga" personalización vía WhatsApp y un humano arma el imán. Es un cuello de botella y limita la experiencia online.

**Decisión:** Construir un Estudio de Personalización en vivo (canvas + 3D + IA) como feature insignia.

**Por qué:**

- Es el verdadero "plus" comercial: el cliente diseña en tiempo real, ve cómo queda, paga, y el imán se imprime tal cual.
- Reduce trabajo manual del usuario.
- Permite cobrar más (es un servicio premium real, no solo un imán).
- Habilita features posteriores: AI suggestions, plantillas comunitarias, marketplace.

**Consecuencia:** Fase 3 es la más compleja del proyecto (`react-konva` + `three.js` + Claude API). Vale la inversión.

---

## ADR-014 — Política de stock: reserva al `PENDING_PAYMENT` + descuento al `PAID`

**Fecha:** 2026-05-09
**Estado:** ✅ Aceptada

**Contexto:** Detectado en auditoría de coherencia (H6): contradicción entre ROADMAP ("stock se descuenta al PAID") y OPERATIONS ("reservar stock al PENDING_PAYMENT con TTL 15 min"). Necesitamos un único modelo de inventario que prevenga sobreventa sin sacrificar conversion al checkout.

**Decisión:** dos transiciones atómicas con `SELECT ... FOR UPDATE`:

1. Al pasar `Cart → Order(PENDING_PAYMENT)`: **reserva** de stock con TTL 15 minutos. `InventoryLog` con `reason="ORDER_PENDING_RESERVE"`. Tabla auxiliar `StockReservation(orderId, variantId, qty, expiresAt)` permite cleanup.
2. Al pasar `Order(PENDING_PAYMENT) → Order(PAID)`: **descuento real** de stock. `InventoryLog` con `reason="ORDER_PAID"`. Si la reserva expiró antes del PAID, se reintenta con `SELECT FOR UPDATE` y se aborta si no hay stock disponible (cliente notificado).
3. Cleanup de reservas expiradas vía `pg_cron` cada minuto.

**Por qué:**

- Previene sobreventa sin lockear inventario indefinidamente.
- Es el patrón estándar de e-commerce (Shopify, BigCommerce).
- 15 min es suficiente para completar Wompi web checkout sin bloquear stock para el siguiente cliente.

**Consecuencia:** schema gana tabla `StockReservation`. Lógica de checkout vive en transacciones explícitas (no fire-and-forget). Tests E2E deben cubrir el caso "reserva expira mientras el cliente paga".

---

## ADR-015 — Tailwind v4 + React 19 (alineado con default oficial de shadcn/ui)

**Fecha:** 2026-05-09
**Estado:** ✅ Aceptada

**Contexto:** Auditoría detectó (H4) que `ARCHITECTURE.md` declaraba "Tailwind 4.x" pero los snippets eran sintaxis v3. Se evaluó si bajar a v3 o consolidar en v4. Verificación contra [ui.shadcn.com/docs/tailwind-v4](https://ui.shadcn.com/docs/tailwind-v4) (consultada 2026-05-09) confirmó: _"It's here! Tailwind v4 and React 19. Ready for you to try out. You can start using it today."_ Proyectos nuevos arrancan v4 por defecto en shadcn/ui.

**Decisión:** Tailwind v4 + React 19 desde el día 1.

**Por qué:**

- Es el default oficial de shadcn/ui en mayo 2026.
- "No es MVP, productivo desde día 1" → arrancar en lo más nuevo soportado.
- v3 sigue funcionando (no breaking) pero recibirá menos atención con el tiempo.

**Caveats aceptados (verificados en doc oficial):**

- `tailwindcss-animate` se reemplaza por `tw-animate-css`.
- Componente `toast` se reemplaza por `sonner`.
- Style por defecto pasa de `default` a `new-york`.
- Sintaxis de configuración: CSS-first con directiva `@theme` en `globals.css`. El archivo `tailwind.config.ts` queda opcional/legacy.

**Consecuencia:** snippets de `ARCHITECTURE.md` y `BRANDING.md` reescritos a sintaxis v4. Si shadcn/ui retrocede v4, agregamos ADR de marcha atrás.

---

## ADR-016 — Rate limit y cache en Postgres + `pg_cron`, sin proveedor externo

**Fecha:** 2026-05-09
**Estado:** ✅ Aceptada

**Contexto:** Auditoría detectó (H14) que PLAN/INTEGRATIONS mencionaban "Vercel KV o Upstash Free" para rate limit y cache. Verificación contra [vercel.com/docs/redis](https://vercel.com/docs/redis) (consultada 2026-05-09) confirmó que **Vercel KV está deprecado desde diciembre 2024**: _"Vercel KV is no longer available... we automatically moved it to Upstash Redis in December 2024."_ Verificación contra [upstash.com/pricing](https://upstash.com/pricing): Upstash Free es 500.000 cmd/mes + 256 MB.

**Decisión:** rate limit y cache implementados sobre Postgres dentro de Supabase. Sin Redis externo durante dev y arranque productivo.

**Por qué:**

- Coherente con mandato #2 ("Free durante desarrollo, Pro al lanzar") y mandato #1 (no agregar dependencias innecesarias).
- Postgres ya está disponible (ya pagamos Supabase Pro al lanzar). Sumar Upstash es +1 vendor sin necesidad probada.
- Para una tienda que arranca, latencia ~30 ms en chequeo de rate-limit (Postgres vs <1 ms en Redis) es ruido frente a los 3-5 s de respuesta de Claude API.
- Migrar a Redis externo después es trivial: aislado en `lib/rate-limit.ts` y `lib/cache.ts`.

**Implementación:**

- Tabla `rate_limit_buckets(key TEXT PRIMARY KEY, count INT, window_start TIMESTAMPTZ)` con UPSERT atómico.
- Tabla `cache_entries(key TEXT PRIMARY KEY, value JSONB, expires_at TIMESTAMPTZ)`.
- Limpieza vía `pg_cron` cada minuto: `DELETE FROM cache_entries WHERE expires_at < NOW()` y reset de `rate_limit_buckets` por ventana.

**Criterio para migrar a Redis externo (medible, no preventivo):**

- p95 de chequeo de rate-limit > 50 ms en producción durante 7 días sostenidos, **o**
- volumen de chequeos > 100/segundo sostenido, **o**
- contención visible en `pg_stat_activity` por la tabla `rate_limit_buckets`.

**Consecuencia:** ningún ADR ni doc menciona "Vercel KV" o "Upstash" como dependencia activa. Cuando se cumpla algún criterio de migración, ADR nuevo documenta el switch.

---

## ADR-017 — Background jobs en Supabase Queues (`pgmq`) + `pg_cron`, no Vercel Cron

**Fecha:** 2026-05-09
**Estado:** ✅ Aceptada

**Contexto:** Auditoría detectó (H21) que ROADMAP mencionaba "Cron Vercel" y OPERATIONS hablaba de "cron de reconciliación" sin un sistema concreto. Pregunta del usuario sobre si Supabase Queues podría servir. Verificación contra [supabase.com/docs/guides/queues](https://supabase.com/docs/guides/queues) (consultada 2026-05-09) confirmó que **Supabase Queues** (basado en `pgmq`) es _"Postgres-native durable Message Queue system with guaranteed delivery"_ con exactly-once delivery y archivado.

**Decisión:** background jobs (recuperación de carrito, reconciliación de órdenes, cleanup) viven en `pgmq` + `pg_cron`. **No se usa Vercel Cron.**

**Por qué:**

- Coherente con la línea "todo en Supabase" (mandato #3).
- Retries durables out-of-the-box (Vercel Cron es fire-and-forget).
- Dashboard nativo en Supabase para observar la cola.
- Suma 0 vendors nuevos.

**Patrón de uso:**

1. **Productor:** `pg_cron` evalúa una condición (carritos abandonados >1h sin recordatorio) y hace `pgmq.send(queue, payload)`.
2. **Consumidor:** Edge Function de Supabase (o ruta server-side de Next.js cuando aplique) hace `pgmq.read(queue, vt, count)` con visibility timeout, procesa, y borra con `pgmq.delete()` o archiva con `pgmq.archive()`.
3. **Idempotencia:** los consumers son idempotentes (chequean `lastReminderSentAt` u otros marcadores antes de actuar). `WebhookEvent.@@unique` para webhooks externos.

**Colas previstas:**

- `cart_recovery_1h`, `cart_recovery_24h`
- `order_reconciliation` (órdenes en `PENDING_PAYMENT` con >1h)
- `shipment_creation_retry` (Venndelo falló al crear envío)
- `email_send` (Resend; permite retries durables si Resend está caído)

**Consecuencia:** schema gana extensiones `pgmq` y `pg_cron`. ARCHITECTURE.md documenta workers. Vercel Cron no aparece en stack.

---

## ADR-018 — Mandato "argumentación obligatoria, sin suposiciones"

**Fecha:** 2026-05-09
**Estado:** ✅ Aceptada (mandato del usuario)

**Contexto:** En la auditoría inicial detecté dos errores por suposición: H4 (recomendé bajar Tailwind a v3 sin verificar el estado de shadcn/ui v4) y H5 (marqué la tarjeta `4242 4242 4242 4242` como "de Stripe" sin verificar Wompi docs). El usuario solicitó explícitamente: _"todo debe estar argumentado y no es suposiciones, es decir, todo debe estar basada siempre en la documentacion de la tecnologias correspondientes, y nunca suposiciones"_.

**Decisión:** convertir en mandato no negociable (#9 en `CLAUDE.md`).

**Por qué:**

- El sistema necesita ser correcto, no convincente.
- Cifras y comportamientos cambian (Vercel KV deprecado en dic-2024 mientras yo lo seguía recomendando).
- Decisiones tomadas sobre suposiciones erradas se compounden — costoso revertir en Fase 4 lo que se asumió en Fase 0a.

**Operativización:**

- Toda afirmación técnica nueva: cita inline `(verificado: <URL> a YYYY-MM-DD)`.
- Si la doc oficial no se puede consultar: marcar `[pendiente verificación]` y no asumir.
- Cifras existentes en docs sin cita son **deuda** que se verifica antes de usarlas para decisiones (ver "Cola de verificación pendiente" en `STATE.md`).
- Cuando una doc oficial cambia y nuestra afirmación queda desactualizada: se trata como bug → fix → ADR si la decisión cambia.

**Consecuencia:** mayor disciplina en todas las afirmaciones. Más uso de WebFetch/WebSearch antes de aseverar. Fricción menor a cambio de correctitud sustancialmente mayor.

---

## ADR-019 — Traceability inter-sesión vía `docs/STATE.md` y `docs/audits/`

**Fecha:** 2026-05-09
**Estado:** ✅ Aceptada (mandato del usuario)

**Contexto:** El usuario pidió: _"Toda actualizacion que se vaya realizando deberia trazarse para que CLAUDE siempre sepa en que va"_. Detectado como H17 en la auditoría: ROADMAP, DECISIONS y OPERATIONS-changelog son tres logs paralelos sin convergencia narrativa; no hay un único archivo que responda _"¿qué hizo Claude/yo en la última sesión y dónde estamos parados?"_.

**Decisión:** crear y mantener `docs/STATE.md` como índice narrativo del proyecto, complementado por `docs/audits/YYYY-MM-DD-<slug>.md` para auditorías históricas.

**Estructura de `docs/STATE.md`:**

- **Resumen actual** — un párrafo, siempre arriba.
- **Última sesión** — qué se hizo en la iteración más reciente.
- **Próximo paso** — qué viene cuando se reanude.
- **Cola de verificación pendiente** — afirmaciones por verificar (mandato #9).
- **Bitácora** — append-only, más reciente arriba.

**Protocolo:**

- `CLAUDE.md` "Lectura mínima al iniciar sesión" incluye `docs/STATE.md` (junto a `ROADMAP.md`).
- Al cerrar cualquier sesión con cambios, Claude actualiza el resumen + última sesión + bitácora.
- ROADMAP/DECISIONS/OPERATIONS-changelog **siguen siendo fuente de verdad** para sus dominios; `STATE.md` apunta a ellos pero no los duplica.

**Patrón de auditorías:**

- Cada auditoría histórica vive en `docs/audits/YYYY-MM-DD-<slug>.md`.
- Si una auditoría arranca dentro del flujo "plan mode" de Claude Code (en `~/.claude/plans/...`), se mueve al repo en cuanto termina (consistente con ADR-012).

**Consecuencia:** un nuevo dev (o sesión nueva de Claude) puede leer `STATE.md` en 30 segundos y saber qué pasa. Reduce drift entre sesiones.

---

## ADR-020 — Estrategia legal: plantillas Lucams + revisión de abogado CO

**Fecha:** 2026-05-09
**Estado:** ✅ Aceptada (decisión del usuario)

**Contexto:** Lucams_shop debe publicar 9 documentos legales antes del lanzamiento (Política de privacidad, T&C, Cookies, Devoluciones, Garantías, Subprocesadores, Tratamiento de datos, Habeas Data PQR, Seguridad). Normas investigadas y operativizadas en [`COMPLIANCE.md`](./COMPLIANCE.md). Pregunta abierta: ¿abogado redacta desde cero, plantillas nuestras sin revisión, o híbrido?

**Decisión:** Lucams redacta plantillas con base en lo investigado (Ley 1581, Ley 1480 art. 47, DIAN Resolución 165, etc.). Un **abogado colombiano especialista en consumo y comercio digital** las revisa antes de Fase 7.

**Por qué:**

- Las normas ya están citadas con fuente oficial — el abogado refina, no parte de cero.
- Costo realista para PYME: ~$300–600 USD por revisión (vs $1.500–2.500 USD por redacción completa).
- Tiempo: 2–4 semanas (vs 6–10 semanas).
- Estilo PYMES estándar; un abogado responsable lee todo antes de firmar, así que la calidad final es comparable a la opción cara.

**Consecuencia:**

- Plantillas redactadas en Fase 7 (no antes — necesitamos schema final, lista de subprocesadores estable, política de retracto cerrada).
- Tarea bloqueante para lanzamiento: el operador contrata abogado CO especialista (entregable del usuario, no de Claude).
- Si el abogado encuentra problemas estructurales (ej. exclusión de retracto por personalización mal aplicada), volvemos a `COMPLIANCE.md` antes de re-redactar.

---

## ADR-021 — Tipografías: Fredoka (display) + Inter (body)

**Fecha:** 2026-05-09
**Estado:** ✅ Aceptada (decisión del usuario)

**Contexto:** El branding necesita un par tipográfico fijado para arrancar Fase 1 (sin esto, los tokens `--font-display` y `--font-body` del `@theme` Tailwind v4 quedan undefined). `BRANDING.md` proponía Fredoka/Baloo 2 + Inter/Nunito sin cerrar.

**Decisión:** **Fredoka** como display, **Inter** como body.

**Por qué:**

- Fredoka es display redondeada bubble que encaja con el logo "LUCAMS" multicolor.
- Inter es la sans serif estándar de la industria para e-commerce: legible en cuerpos largos, soporta `tabular-nums` para precios alineados, optimizada para múltiples weights.
- Ambas son Google Fonts (libres, optimizables con `next/font`).
- Si la guía Canva del usuario aparece con otras, se reemplaza vía un solo cambio en `globals.css` `@theme`.

**Consecuencia:**

- `apps/web/app/globals.css` define `--font-display: "Fredoka"` y `--font-body: "Inter"` desde Fase 1.
- Carga vía `next/font/google` con `display: swap`.
- Preconnect a `fonts.googleapis.com` y `fonts.gstatic.com` en `<head>`.

---

## ADR-026 — Feature flags: tabla `FeatureFlag` en Postgres (sin vendor externo)

**Fecha:** 2026-05-09
**Estado:** ✅ Aceptada (decisión del usuario)

**Contexto:** Lucams_shop necesita feature flags desde Fase 1 (canary releases, kill switches, A/B testing futuro, promociones temporales sin redeploy). [`OPERATIONS.md`](./OPERATIONS.md) listaba opciones: tabla Postgres, GrowthBook cloud Free, Vercel Edge Config, LaunchDarkly.

**Decisión:** tabla `FeatureFlag` en Postgres + helper `lib/feature-flags.ts` con cache 60s en memoria del servidor.

**Por qué:**

- Coherente con ADR-016 (rate-limit y cache en Postgres, no Redis externo).
- Mismo principio "no agregar vendors hasta que métricas reales lo justifiquen".
- Cache de 60s elimina la latencia de Postgres (lectura desde cache: <1 ms; miss: ~30 ms).
- UI: página `/admin/feature-flags` con toggle + slider de rollout, construida con shadcn/ui en ~1 día.

**Implementación inicial:**

```prisma
model FeatureFlag {
  key              String   @id
  description      String
  enabled          Boolean  @default(false)
  rolloutPercent   Int      @default(0)    // 0-100
  targetUserIds    String[]                 // override por userId específico
  createdAt        DateTime @default(now())
  updatedAt        DateTime @updatedAt
}
```

```ts
// lib/feature-flags.ts (esqueleto)
const cache = new Map<string, { value: FeatureFlag; expiresAt: number }>();

export async function isFeatureEnabled(key: string, userId?: string): Promise<boolean> {
  const cached = cache.get(key);
  const now = Date.now();
  if (cached && cached.expiresAt > now) return evaluate(cached.value, userId);

  const flag = await prisma.featureFlag.findUnique({ where: { key } });
  if (!flag) return false;
  cache.set(key, { value: flag, expiresAt: now + 60_000 });
  return evaluate(flag, userId);
}

function evaluate(flag: FeatureFlag, userId?: string): boolean {
  if (!flag.enabled) return false;
  if (userId && flag.targetUserIds.includes(userId)) return true;
  if (flag.rolloutPercent === 100) return true;
  if (flag.rolloutPercent === 0) return false;
  // Hash determinista del userId para que el mismo usuario siempre vea lo mismo
  const bucket = userId ? deterministicBucket(userId) : Math.random();
  return bucket * 100 < flag.rolloutPercent;
}
```

**Criterios para migrar a GrowthBook u otro (medibles, no preventivos):**

- Volumen de A/B tests > 5 simultáneos sostenidos durante 30 días, **o**
- Necesidad de targeting complejo (por ciudad, día de la semana, segmento de cliente), **o**
- Equipo crece > 3 personas que necesitan UI sin acceso al admin del sitio.

Cuando se cumpla cualquiera: **ADR-028** documenta el switch (aislado en `lib/feature-flags.ts`).

---

## ADR-024 — Next.js 16 (no 15) + adaptación a sus breaking changes

**Fecha:** 2026-05-09
**Estado:** ✅ Aceptada (descubierto durante scaffolding Fase 1)

**Contexto:** Las decisiones previas (ADR-001, ADR-015) asumían "Next.js 15". Al ejecutar `pnpm create next-app@latest` en Fase 1, llegó **Next.js 16.2.6** (versión actual a 2026-05-09) — una versión major nueva con breaking changes documentados en `apps/web/node_modules/next/dist/docs/01-app/02-guides/upgrading/version-16.md`.

El propio Next.js 16 advierte vía `apps/web/AGENTS.md`: _"This is NOT the Next.js you know. This version has breaking changes — APIs, conventions, and file structure may all differ from your training data."_

**Decisión:** adoptar Next.js 16 (no degradar a 15) y adaptar nuestra arquitectura a sus convenciones.

**Por qué:**

- Next.js 16 es la versión actual estable. Bajar a 15 sería deuda inmediata.
- Turbopack default = builds más rápidos sin flags.
- React 19.2 viene incluido — alineado con ADR-015 (React 19 + Tailwind v4 + shadcn/ui).
- La doc local del paquete está disponible para verificar APIs específicas (cumple mandato #9).

**Breaking changes que afectan nuestros patrones documentados:**

| Cambio                                                             | Impacto en Lucams_shop                                                        | Acción                                                                                                                                                                                  |
| ------------------------------------------------------------------ | ----------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Async Request APIs obligatorio**                                 | `cookies()`, `headers()`, `params`, `searchParams` siempre `await`            | Documentado en `CONVENTIONS.md`. `lib/supabase/server.ts` debe usar `await cookies()`.                                                                                                  |
| **`middleware.ts` → `proxy.ts`**                                   | El archivo se renombró; edge runtime ya no soportado en `proxy` (solo nodejs) | Para nuestro middleware de auth/CORS/headers usaremos `proxy.ts`. Edge runtime no lo necesitamos en escala inicial. Si en el futuro lo requerimos, mantenemos `middleware.ts` separado. |
| **`themeColor` movido de `metadata` a `viewport` export**          | Layout root debe exportar `viewport` separado                                 | Aplicado en `apps/web/app/layout.tsx`. Patrón documentado en CONVENTIONS.                                                                                                               |
| **`revalidateTag` requiere segundo argumento** (cacheLife profile) | Cuando agreguemos cache de productos, usar `revalidateTag('products', 'max')` | Documentar al implementar.                                                                                                                                                              |
| **`updateTag` nuevo** (read-your-writes en Server Actions)         | Útil para checkout/admin actions                                              | Adoptar en Fase 4 cuando hagamos Server Actions de mutación.                                                                                                                            |
| **`images.domains` deprecated** → usar `images.remotePatterns`     | Para imágenes de Supabase Storage                                             | Configurar en `next.config.ts` cuando agreguemos imágenes de productos.                                                                                                                 |
| **`next lint` removed** → usar ESLint CLI directo                  | `package.json` ya tiene `"lint": "eslint"` (no `next lint`)                   | Hecho.                                                                                                                                                                                  |
| **`serverRuntimeConfig`/`publicRuntimeConfig` removidos**          | Usar `process.env` + `NEXT_PUBLIC_*` directo                                  | Ya era nuestro plan.                                                                                                                                                                    |
| **AMP support removed**                                            | Sin impacto (no usábamos)                                                     | Ninguna.                                                                                                                                                                                |
| **shadcn/ui style: `radix-nova` (no "new-york")**                  | El nombre del preset evolucionó. Funcionalidad equivalente.                   | Actualizado ADR-021.                                                                                                                                                                    |

**Style shadcn/ui actualizado:** ADR-015 mencionaba "style new-york". El comando `pnpm dlx shadcn@latest init --defaults` instaló el preset **`radix-nova`** (la evolución del antiguo new-york + base components con Radix primitives). El `components.json` del repo refleja este valor real. Funcionalmente idéntico para nuestros propósitos.

**Consecuencia:**

- ARCHITECTURE.md, CLAUDE.md mandato #3, CONVENTIONS.md actualizados con "Next.js 16" + las convenciones específicas (async APIs, proxy.ts, viewport export).
- `apps/web/AGENTS.md` (autogenerado) queda como recordatorio para futuras sesiones de Claude Code.
- Cualquier patrón que tomemos de tutoriales/blogs de "Next.js 15" debe revisarse contra la doc local de Next.js 16 antes de copiarlo.

---

## ADR-029 — `vercel.json` en monorepo: ubicación dentro del Root Directory de Vercel, NO en repo root

**Fecha:** 2026-05-10
**Estado:** Aceptado.

**Contexto:**
Durante el cierre del scaffolding de Fase 1, los deploys de Vercel devolvían HTTP 404 en `/` y `/api/health` aunque la build local funcionaba en HTTP 200. La UI de Vercel tenía `Root Directory = apps/web` correctamente y "Include files outside the root directory" habilitado. El `vercel.json` estaba en `/vercel.json` (repo root) con `framework: "nextjs"`, `outputDirectory: ".next"` e `ignoreCommand` — pero ninguna de esas directivas se aplicaba.

**Investigación contra doc oficial Vercel:**

- [Static Configuration with vercel.json](https://vercel.com/docs/project-configuration/vercel-json) (actualizada 2026-03-11) afirma: _"This file should be created in your project's root directory"_.
- En el contexto de Vercel, **"project's root directory"** se refiere al **Root Directory configurado en Settings → Build and Deployment**, NO al repo root de GitHub. La frase es ambigua y se presta a confusión, pero Vercel lo confirma operacionalmente: si el archivo está fuera del Root Directory, lo ignora por completo.
- El toggle "Include files outside the root directory" sí permite acceder a archivos del padre durante el build (ej. `pnpm-workspace.yaml`, `packages/*`), pero **no** se usa para descubrir `vercel.json`. La discovery de `vercel.json` es estricta: solo dentro del Root Directory.

**Decisión:**

1. `vercel.json` debe vivir en `apps/web/vercel.json` (mismo path que el Root Directory configurado en Vercel).
2. **Nunca** colocar `vercel.json` en el repo root cuando hay Root Directory configurado.
3. Mantener el contenido **mínimo**: solo `{"$schema": ..., "framework": "nextjs"}` como redundancia explícita. Cuando `framework=nextjs` está aplicado, Vercel auto-detecta el resto (`buildCommand`, `outputDirectory`, `installCommand`) sin necesidad de declararlos.
4. Si se necesita `ignoreCommand` futuro, los paths deben ser relativos al Root Directory (`apps/web/`), no al repo root. Como alternativa, usar el toggle UI **"Skip deployments unaffected"** que Vercel ofrece nativamente para monorepos pnpm — hace el mismo trabajo sin scripting.

**Consecuencias:**

- El fix se aplicó en commit `62a83ae` (2026-05-10). Build de producción quedó exitoso en 25s; `https://lucams-shop.vercel.app/` y `/api/health` ambos en HTTP 200.
- Cualquier mención futura de "`vercel.json` en root" en documentación interna debe interpretarse como "en el Root Directory de Vercel", no en el repo root.
- Si agregamos otra app al monorepo (ej. `apps/admin`), cada app sería un proyecto Vercel separado con su propio Root Directory y su propio `apps/<app>/vercel.json`.
- **Patrón general:** cuando una herramienta cloud habla de "root directory" en monorepos, asumir que se refiere a la subcarpeta configurada como punto de entrada, no al repo root. Verificar contra doc antes de colocar archivos de config.

---

## ADR-030 — Auth: URLs separadas para cliente (`/login`) vs admin (`/admin/login`)

**Fecha:** 2026-05-10
**Estado:** Aceptado.

**Contexto:**
Al implementar el flujo de autenticación basado en magneticas.cl como referencia funcional, surgió la pregunta: ¿una sola página de login con role-check post-autenticación (estilo magneticas.cl), o URLs completamente separadas para cliente y admin? Tenemos dos tablas distintas en el schema (`Customer` y `AdminUser`) cada una linkeada al mismo `auth.users` de Supabase vía `supabaseUserId`.

**Decisión:**
URLs **completamente separadas**:

- **Cliente final:** `/login`, `/registro`, `/recuperar-password`. Registro abierto a cualquiera. Tras autenticación se verifica existencia de fila en `Customer`.
- **Admin/staff:** `/admin/login` (pendiente). **Sin endpoint de registro público** — los admins se crean server-side (Supabase Dashboard o flujo de invitación interno). Tras autenticación se verifica existencia de fila en `AdminUser` con `isActive=true`.
- `proxy.ts` ya tiene preparado el gating para `/admin/*` — se activará cuando exista la sección admin real.

**Razones:**

1. **Superficie de ataque:** la URL `/admin/login` no es visible desde el sitio público. Atacantes externos no saben que existe (security through obscurity es defensa en profundidad, no la única).
2. **UX clara:** el equipo de fulfillment no se confunde con la página de clientes. Cada audiencia tiene su flujo.
3. **Branding distinto:** la página admin puede ser más sobria (utilitaria, eficiente) mientras que la de cliente es kawaii (Fredoka, paleta brand). No tienen por qué compartir layout.
4. **Authorization granular:** RBAC por roles (`SUPERADMIN`/`MANAGER`/`FULFILLMENT`) se aplica solo en el contexto admin sin contaminar el flujo cliente.
5. **No-registro admin** es más seguro: cero riesgo de que alguien externo se cree cuenta "admin" por error. El primer admin se siembra con un INSERT directo o un script controlado.

**Alternativa descartada (login único + role-check):**

- Ventaja: una sola página, menos código.
- Desventaja: revela que existe interfaz admin a cualquier visitante. Requiere lógica condicional de redirect post-auth. Mezcla branding. Endpoint de registro tendría que rechazar admins (qué pasa si un admin existing se "registra"?). Demasiado complejidad para un beneficio pequeño.

**Consecuencias:**

- Hay duplicación de código entre `/login` cliente y `/admin/login` (forms, server actions). Aceptable: las diferencias (qué tabla se consulta, qué destino post-login) justifican la separación. Se puede extraer un componente compartido `<AuthCard>` si se vuelve pesado.
- El header dinámico debe saber distinguir si el usuario actual es cliente (mostrar "Mi cuenta") o admin (mostrar "Panel admin" + link a `/admin/dashboard`).
- `lib/auth.ts` expone helpers separados: `getCurrentCustomer()` y `getCurrentAdmin()`.

**Referencias:**

- docs/SECURITY.md § Auth + RBAC.
- docs/ARCHITECTURE.md § Identidad (tablas Customer + AdminUser).
- `proxy.ts` (auth gate `/admin/*` documentado como pendiente).

---

## ADR-031 — Guest-first browsing + welcome coupon strategy (NO wall de registro)

**Fecha:** 2026-05-10
**Estado:** Aceptado — diseño. Implementación viene en Fase 2 (catálogo + carrito + checkout).

**Contexto:**
Lucy planteó como punto de vista estratégico: _"hay gente que no le gusta registrarse, pueden abandonar página, pensar en que el usuario pueda comprar sin un registro y cuando desee registrarse puede obtener cupones o regalos"_. Industry data: **el muro de registro mata 30-40% de la conversión** en e-commerce. Magneticas.cl probablemente tiene guest checkout (no auditado a fondo). Nuestro objetivo es **superar a magneticas** no solo en tecnología sino también en conversión.

**Decisión:**
Adoptar **guest-first browsing** + **welcome coupon como incentivo opt-in** para registro.

**Componentes del flujo (a implementar en Fase 2):**

1. **Browsing libre sin login.** Toda página de catálogo (`/`, `/productos`, `/producto/[slug]`, `/categoria/[slug]`) es accesible sin sesión. RLS ya tiene policies de lectura pública para `Product`, `ProductVariant`, `Category`, `Review` aprobada y `BlogPost` publicado.

2. **Carrito anónimo.** El modelo `Cart` ya tiene `customerId String?` nullable + `sessionId String @unique`. Estrategia:
   - Cliente anónimo recibe un `sessionId` via cookie HttpOnly (`__lcs_session`).
   - Las operaciones del carrito (add/remove/update) pasan por server actions que usan `supabaseService` (bypass RLS) porque RLS no puede validar sessionId del cliente.
   - Al login/signup, el carrito anónimo se asocia (merge) con el `Customer` recién autenticado: `UPDATE Cart SET customerId = ... WHERE sessionId = ...`.

3. **Guest checkout.** En `/checkout` ofrecer dos opciones lado a lado:
   - **"Continuar como invitada"** — pide email + dirección + teléfono. Crea `Order` con `customerId NULL`. Tracking funciona por order number + email.
   - **"Crear cuenta y obtener 10% off"** — registro inline con cupón aplicado automáticamente.

   Por defecto seleccionada la opción guest (no forzar registro).

4. **Welcome coupon.** Crear código de cupón al registrarse:
   - Modelo `Coupon` ya existe con tipo `PERCENT` / `FIXED` / `FREE_SHIPPING`.
   - Al crear `Customer`, generar Coupon dedicado: code `WELCOME-{first8chars_of_referralCode}`, type `PERCENT`, value 10, validTo +30 días, maxUses 1, isActive true.
   - Email de bienvenida lo menciona prominente.
   - Banner en home post-login: "Te damos la bienvenida con 10% en tu primera compra — usa el código WELCOME-XXXX."
   - Auto-aplicar en checkout si está en la sesión del cliente (UX premium).

5. **Triggers de registro inteligentes.** NO mostrar modal de registro al abrir el site. Mostrar prompts **contextuales** donde el valor del registro es máximo:
   - Después de agregar al carrito por primera vez → tooltip suave "Crea tu cuenta y guarda tu carrito".
   - En checkout → CTA destacado "10% off si te registras antes de pagar".
   - Después de comprar como guest → "¿Quieres guardar tu orden? Crea tu cuenta con este email" (auto-llena el email del checkout).
   - Después de N segundos en la home si nunca se ha visto el banner → discreto banner "Crea cuenta y obtén 10% en tu primera compra".

6. **Tracking de funnel.** Usar `pino` logger con eventos estructurados:
   - `funnel.product_view` (productId, sessionId, customerId?)
   - `funnel.cart_add` (variantId, sessionId, customerId?)
   - `funnel.checkout_start` (sessionId, customerId?, guest: boolean)
   - `funnel.signup_from_checkout` (cuponApplied: boolean)
   - `funnel.order_placed` (orderId, guest: boolean, couponId?)

   Permite medir conversión sin tracking externo. Si volumen lo justifica → PostHog/Plausible self-hosted en Fase 7.

**Razones:**

1. **Conversión máxima.** Eliminar el wall de registro es el cambio de mayor impacto en conversión para tiendas pequeñas-medianas (>30% según múltiples industry reports, ej. Baymard Institute).
2. **Cupón como incentivo positivo** en lugar de barrera: el usuario elige registrarse a cambio de beneficio claro y cuantificado, no porque lo obliguen.
3. **Aprovecha el schema existente.** Cart.customerId nullable, Coupon model, AbandonedCart, sessionId — todo está. Falta solo el flujo.
4. **Compatible con compliance.** Guest checkout no exime de Ley 1581 (datos de envío son PII) — el banner de consentimiento aplica igual. Pero NO requiere consentimiento de "tratamiento extendido" (marketing emails, perfilamiento) hasta que la persona se registre voluntariamente.
5. **Diferenciador vs magneticas.** Aunque ellos podrían tener guest checkout, el welcome coupon explícito + triggers contextuales + auto-apply son ventajas concretas de UX. Lucy lo pidió como visual + estratégico superior.

**Trade-offs aceptados:**

- **Datos del guest customer no acumulan loyalty points ni referral history.** Es feature, no bug — la propuesta de valor del registro queda clara.
- **Más complejidad en `Order`:** queries futuras del admin deben manejar `Customer? | null` en columnas. Aceptable — el schema ya lo permite.
- **Sessionid en cookie HttpOnly:** dependemos de que la cookie sobreviva entre visitas para no perder el carrito. Si el user borra cookies → carrito perdido. Aceptable.

**Pendiente diseñar (no en este ADR):**

- Reglas anti-abuso del welcome coupon (un solo uso por email + IP + device fingerprint suave).
- Email template del welcome con cupón.
- Componente UI del cart merging (animación al hacer login con carrito anónimo activo).
- A/B test futuro: ¿el wall blando convierte más que el guest checkout? (Hipótesis: no, pero medir).

**Referencias:**

- docs/COMPETITIVE_ANALYSIS.md § Gaps de UX (gap #10 carrito abandonado).
- docs/ARCHITECTURE.md § Cart (sessionId schema).
- ADR-030 (auth flow customer — este ADR construye encima).

---

## ADR-033 — CMS interno (2 tablas) + endpoints públicos RAG-ready

**Fecha:** 2026-05-12

**Contexto.** Lucy es no-técnica y necesita editar contenido del sitio sin pedir a Claude/dev por cada cambio: email de contacto, horarios, slogans, mensajes pre-armados de WhatsApp, plazos legales, aviso de privacidad, FAQ, copy de la home. Además se planea un chatbot Claude (Fase 5+) que necesita acceso programático a este contenido para responder preguntas con base en información actualizada (RAG).

**Opciones consideradas.**

1. **CMS externo (Sanity, Contentful, Strapi).** Headless, maduro, UI lista. Pero: vendor lock-in, costo recurrente al pasar a Pro (~$99/mes Sanity, ~$300/mes Contentful), dependencia de uptime ajena, complejidad de sincronización entre DB Supabase y CMS externo, dificultad para integrar audit trail con AdminActionLog ya existente.
2. **Markdown files en repo (Velite, ContentLayer).** Cero costo, pero requiere PR por cada edición. Lucy no puede editar.
3. **CMS in-house en Postgres** (decisión). Reusa Supabase + Prisma + admin existente. Versionado per save. Cero costo extra. Audit trail nativo via AdminActionLog. RAG endpoint sale gratis (mismo Postgres).

**Decisión.** Construir CMS interno con 2 modelos:

- **CmsBlock** + **CmsBlockVersion** (append-only versioning como Notion/Sanity) para prosa larga editorial (legal, home headings, footer copy, FAQ, email templates). Cada save crea una nueva versión; admin elige cuál publicar via `publishedVersionId`. Soft-delete con `deletedAt`. 10 categorías (`BlockCategory` enum): LEGAL, HOME, FOOTER, EMPTY_STATE, COOKIES, FAQ, SUPPORT, MAINTENANCE, EMAIL, MARKETING.
- **SiteSetting** key/value atómico (sin versionado) para configurables: emails, números, URLs, horarios, mensajes pre-armados de WA, plazos legales. 9 categorías (`SettingCategory` enum): CONTACT, BUSINESS, LEGAL, COMMERCE, SOCIAL, EXTERNAL, WHATSAPP, COPYRIGHT, SEO.

**Editor admin** estilo Webflow Designer: textarea markdown + preview live + cheatsheet amarillo siempre visible. Sin TipTap/Lexical (over-engineering para Lucams). Tabs Bloques / Configuración en `/admin/contenido`.

**Cache.** `unstable_cache` con tag global `cms`. Cuando admin publica, `updateTag("cms")` invalida cache (Next 16 cambió `revalidateTag` para requerir cacheLife profile — `updateTag` es la API correcta para invalidación inmediata).

**Build resilience.** Todos los helpers de `lib/cms.ts` envueltos en `try/catch` que devuelven null/[] silentemente si la DB es unreachable. Permite `next build` con DATABASE_URL placeholder (Vercel CI) y degradación graceful en runtime. Componentes consumidores siempre tienen fallback markdown hardcoded.

**Endpoints públicos RAG-ready.** 4 endpoints sin auth con rate-limit 30/min IP y cache HTTP agresivo:

- `GET /api/cms/blocks?category=...` — lista bloques publicados
- `GET /api/cms/blocks/[key]` — bloque individual
- `GET /api/cms/settings?category=...` — settings
- `GET /api/cms/search?q=...` — full-text con `pg_trgm` + `unaccent` (tolerante a typos y acentos), top 20 por similarity

El chatbot futuro consumirá `/api/cms/search?q=<pregunta>` para hacer RAG: embebe el body de los matches en el prompt para Claude API, y devuelve respuesta con citas a `version` del bloque (auditoría: "respondí con la versión 3 del aviso de privacidad").

**Consecuencias positivas.**

- Lucy editora autónoma desde día 1 — sin tocar código.
- Versionado completo + rollback a cualquier versión previa.
- Audit trail nativo (cada publish va a AdminActionLog).
- RAG foundation lista para chatbot Fase 5+ sin migración.
- Cero costo recurrente.
- Cache invalidation inmediata vía tag.

**Consecuencias negativas.**

- Markdown plain learning curve para Lucy (mitigado con cheatsheet siempre visible).
- Sin WYSIWYG (descartado intencionalmente — Webflow-like in-place editor se hace en Sub-bloque K como capa cliente sobre esta fundación).
- `CmsBlockVersion` crece sin límite (mitigación pendiente: pg_cron purge versiones > 1 año, keep last 50 + last 5 publicadas, evaluar en H).

**Referencias.** Plan `~/.claude/plans/lee-complemtante-el-proyecto-wiggly-mist.md` Sub-bloque J + K. Commits `a0c4e34` (schema), `b1f82e3` (admin UI), `5c6de84` (seed + migración part 1), `9c258ed` (legal pages part 2). Lectura recomendada antes de tocar: `apps/web/lib/cms.ts`, `apps/web/features/cms/service.ts`, `docs/INTEGRATIONS.md § CMS API`.

---

> Próximas decisiones a documentar cuando se tomen:
>
> - ADR-022: alternativa de monitoreo de errores elegida (en Fase 7).
> - ADR-023: criterio de migración Postgres rate-limit → Redis externo.
> - ADR-025: proveedor de facturación electrónica DIAN (Alegra / Siigo / Facture / otro), antes de Fase 7.
> - ADR-027: necesidad de staging environment (re-evaluar post-lanzamiento; Vercel previews pueden cubrir el rol).
> - ADR-028: criterio de migración Postgres `FeatureFlag` → GrowthBook u otro (cuando ocurra).
> - ADR-032: distributed tracing / OpenTelemetry strategy (post-lanzamiento si volumen lo justifica).
> - ADR-036: pgvector + Claude API embeddings (cuando se construya chatbot RAG, Fase 5+).

---

## ADR-034 — Visual In-Place Editor + Admin form-based coexistence

**Fecha:** 2026-05-12

**Contexto.** Tras J.1 (admin form-based en `/admin/contenido`) y K (Visual In-Place Editor sobre el sitio público), surge la pregunta: ¿qué rol juega cada uno y cómo se complementan sin duplicarse? Lucy quiere claridad operativa: dónde edita qué.

**Decisión.** Los dos flujos coexisten con roles complementarios:

1. **Visual In-Place Editor** = flujo del 90% del tiempo
   - Lucy navega `lucamsshop.co` (o preview Vercel), ve algo a cambiar, hover sobre el texto, click, edita en popover, publica. Sin abrir admin, sin navegar.
   - Cada `<CmsText>`/`<CmsSetting>`/`<CmsMarkdown>` lleva `data-cms-key` invisible; en modo edición el CSS inyectado les dibuja un lapicito ✏️ persistente + outline punteado. Hover → outline más fuerte. Click → modal.
   - Bloques aún no creados se auto-crean al primer publicar (categoría derivada del prefijo del key — `home.*` → HOME, `legal.*` → LEGAL, etc.).
   - Solo se monta para `getCurrentAdmin()` truthy. Cero JS extra para visitantes anónimos.

2. **`/admin/contenido` (form-based)** = back office para el 10% restante
   - **Revertir** un cambio a versión anterior (version history visible)
   - **Auditar** quién cambió qué cuándo (AdminActionLog con acciones `cms.block.*` y `cms.setting.*`)
   - **Archivar** bloques obsoletos (soft-delete)
   - **Gestionar settings sin wrapper visible** (ej. defaults SEO en `<head>`, claves técnicas que no aparecen como texto editorial)
   - **Búsqueda + filtrado masivo** por categoría o key
   - Crear bloques con key específica manualmente (raro — el auto-create del visual editor cubre casi todos los casos)

**Qué NO está en CMS** (intencional):

- Productos individuales (`Product` table) → `/admin/productos`
- Categorías (`Category` table) → `/admin/categorias`
- Microcopy técnico (botones "Añadir al carrito", labels de form, errores de validación) — multiplica versiones sin valor editorial
- Header de navegación del sitio ("Tienda", "Buscar", "Ingresar") — microcopy técnico

**Endpoint API admin** `/api/admin/cms/by-key/[key]` devuelve siempre un estado editable (incluso si la key no existe en DB — `isNew: true` + preset vacío para que el modal abra y al publicar se auto-cree). Esto resuelve el bug "Bloque no encontrado" cuando un wrapper recién agregado aún no tiene fila en `CmsBlock`.

**Onboarding.** Al activar modo edición por primera vez, `<EditModeWelcome>` muestra tip kawaii explicando el lapicito + dónde se gestiona lo no editable. Persiste en `localStorage.lucams_edit_mode_onboarding_seen`.

**Dashboard `/admin/dashboard`** prioriza visualmente al visual editor: la card "Contenido del sitio (avanzado)" indica explícitamente que el flujo del día a día es el botón ✏️ desde el sitio público, y que el admin form-based es para historial / revert / gestión avanzada.

**Consecuencias positivas:**

- Lucy edita 95% del contenido sin abrir admin
- El admin form-based sigue cubriendo todos los casos edge (revert, archive, audit)
- Ambos comparten 100% del backend (mismo schema, mismas server actions, mismo cache invalidation)
- Auto-create elimina fricción de "registrar key antes de usar"

**Consecuencias negativas:**

- Dos lugares donde Lucy puede editar lo mismo → necesita claridad sobre cuándo usar cuál (mitigado con dashboard card + welcome tooltip)
- Lapicito visible en 30+ elementos puede generar ruido visual en modo edición — mitigado con opacidad 0.55 default + escala on hover

**Referencias.** Commits `020eedf` (K inicial), `d69d323` (wrappers + click block), K.fix actual (lapicito persistente + welcome tip + ADR). Plan en `~/.claude/plans/lee-complemtante-el-proyecto-wiggly-mist.md` sub-bloque K.

---

## ADR-035 — Estudio de Personalización: react-konva + 9 kinds + 3 buckets Storage

**Fecha:** 2026-05-13
**Estado:** ✅ Aceptada
**Sub-bloque:** M

**Contexto.** ADR-013 ya estableció el Estudio de Personalización como **diferenciador #1** vs magneticas.cl (concepto). Falta concretar la arquitectura técnica: ¿qué librería de canvas?, ¿cómo modelamos los tipos de experiencia (foto-pack vs calendario vs evento)?, ¿dónde guardamos las fotos del cliente vs los renders 300 DPI?, ¿cuándo el cliente puede editar y cuándo el diseño queda inmutable?

Audit del catálogo (M.1.c) reveló 9 categorías × experiencias distintas: 6 fotoimanes libres ≠ calendario mes-a-mes (12 fotos slots fijos) ≠ recordatorio bautizo (foto opcional + texto evento) ≠ imán publicitario (logo + datos contacto). Modelar todo como "Json libre" en `Product.personalizationSchema` (estado pre-M) genera deuda — cada consumidor reinventa el shape.

**Decisión.**

1. **Tipos fuertes con enum `PersonalizationKind`** (9 valores en Prisma):
   - `PHOTO_PACK` — N fotos libres, posiciones flexibles en canvas
   - `PHOTO_GRID` — N fotos en grid fijo (3×3, 1×3, etc.)
   - `CALENDAR_PHOTO_MONTH` — 12 fotos (una por mes) + año
   - `CALENDAR_PHOTO_HERO` — 1 foto hero + planner
   - `EVENT_FAVOR` — texto evento (nombre, fecha, lugar) + foto opcional
   - `BUSINESS_LOGO` — logo + datos contacto (B2B)
   - `CUSTOM_DECOR` — composición libre foto + frase
   - `TEXT_ONLY` — solo texto (frases motivacionales)
   - `NONE` — NO personalizable (coleccionables, planners genéricos)
   - Cada `Product` declara un kind, y `Product.personalizationSchema: Json?` agrega config específica del kind (`photoSlots`, `aspectRatio`, `eventFields[]`, `minQuantity`, etc.).
   - El estudio M.3 routea a un sub-editor distinto según kind del producto al cargar `/estudio/[slug]`.

2. **Librería de canvas: `react-konva` 18.x.** Razones:
   - API React-friendly (Stage/Layer/Group/Image/Text/Rect/Shape) sin manipular `<canvas>` imperativo
   - ~50KB gzipped — aceptable para el bundle del estudio (lazy loaded)
   - Touch handlers nativos (pan/pinch/rotate) para mobile UX
   - `stage.toDataURL({ pixelRatio: 6 })` para snapshot 300 DPI directo del cliente — evita round-trip a render server-side V1
   - Maduro (>10 años), comunidad amplia, sin lock-in (`canvasData` es JSON portable)
   - Rechazadas: Fabric.js (no React-first), tldraw (overkill), three.js (3D, no 2D)

3. **Modelo `Design` (3 tablas nuevas)**:
   - `Design` — el diseño en sí (status: DRAFT/READY/USED_IN_ORDER/ARCHIVED). `canvasData: Json` serialización Konva. `previewUrl` + `productionUrl` separados (público vs privado).
   - `DesignAsset` — fotos subidas por el cliente (con metadata: width/height/sizeBytes/exifStripped/malwareScanned)
   - `PersonalizationTemplate` — plantillas base (Polaroid clásico, Marco corazón, etc.) que el cliente clona como punto de partida.
   - FKs nuevos: `CartItem.designId?` + `OrderItem.designId?` (nullable porque NONE products no tienen design)

4. **3 buckets Supabase Storage** (privacy + costo separados):
   - `customer-uploads` — privado, 10MB max, RLS owner-only via `metadata->>'owner_id' = auth.uid()`. Fotos crudas del cliente, antes de strip EXIF.
   - `design-previews` — público, 3MB max, admin write. Thumbnails 1080×1080 PNG para mostrar en cart/order/PDP. Hot-link friendly para `next/image`.
   - `production-assets` — privado, 30MB max, admin-only via `is_active_admin()`. PNG 300 DPI listo para impresión, solo Lucy/operaciones descarga.

5. **State machine `DesignStatus`**:
   - `DRAFT` → editable, autosave 2s debounce
   - `READY` → snapshot generado (preview + production), inmutable
   - `USED_IN_ORDER` → vinculado a OrderItem, congelado para siempre. `canvasData` snapshot duplicado a `OrderItem.customDesign` Json por si el Design se borra después
   - `ARCHIVED` → soft-delete (Lucy en admin puede revivir)

6. **Plantillas iniciales seedeadas** (`seed-templates.mjs`): 30 templates distribuidas por kind. `canvasData` JSON con tokens brand inline (`#7C6AAD`, etc.) + fontFamily Fredoka/Baloo 2/Inter. previewUrl Unsplash placeholder; renders reales se generan en M.7 (test E2E).

**Por qué este shape (no alternativas)**:

- **vs "todo Json libre"** — types fuertes evitan bugs runtime cuando el editor cambia. TypeScript autocompleta los kinds. Migrations explícitas en lugar de "campo del Json desapareció silencioso".
- **vs "1 bucket único"** — separación por privacidad es ley (Ley 1581 — fotos del cliente son dato personal, RLS owner-only no negociable) + costo (Supabase Free tier 1GB compartido — production 300 DPI son grandes, no queremos pagar Pro solo por servirlos hot-link como si fueran preview).
- **vs "render server-side desde día 1"** — `stage.toDataURL` cliente-side evita complejidad inicial. Si móviles low-end no aguantan pixelRatio 6, plan B documentado en M.3: Supabase Edge Function con node-canvas. Postergamos hasta tener métricas reales.
- **vs "Estudio post-checkout (Fase 3 plan original)"** — Lucy insiste "la personalización ES el producto" → invertimos jerarquía. PDP de producto personalizable tiene CTA primaria "Personalizar tu imán →" (M.2). Checkout viene después del design READY.

**Trade-offs aceptados**:

- 9 kinds = 9 sub-editores especializados en M.3 (más código que un editor único). Mitigado: cada kind hereda layout base + sólo customiza panel lateral (templates + campos evento) + decoraciones canvas.
- Canvas data como Json bloquea búsqueda SQL profunda ("dame todos los Design que usan Fredoka") — aceptable, ese caso no existe en el negocio.
- react-konva no es SSR-friendly (`window` dependency). Editor `/estudio/[slug]/studio-editor.tsx` queda como `"use client"` con dynamic import + Suspense fallback.

**Consecuencias positivas**:

- Cliente ve EXACTAMENTE lo que recibe (canvas WYSIWYG + overlay realismo M.8) → menos devoluciones por "no se parecía a lo que diseñé"
- Diferenciador #1 vs magneticas.cl que aún usa WhatsApp para personalizar (fricción + asincronía)
- Schema-ready para Fase 5+ IA Assist (Claude API sugiere template + asignación de fotos a slots)

**Consecuencias negativas**:

- Stack más complejo (react-konva + sharp server + 3 buckets Storage + 9 kinds). Curva de aprendizaje para futuros contribuidores.
- Auto-save 2s + snapshots PNG aumentan tráfico Supabase Storage. Mitigado: monitoring del bucket size, alerta si crece >5GB/mes (free tier 1GB, Pro 100GB).

**Verificación M.1 (cerrado 2026-05-13):**

- Schema Prisma aplicado: `Design` + `DesignAsset` + `PersonalizationTemplate` + enums (commit `f9380e0`)
- 3 buckets Storage + RLS aplicados via `supabase/migrations/00000000000006_storage_personalization.sql` (commit `592b766`)
- Catálogo realineado 9 cats / 49 productos con `personalizationKind` (commit `bfe0c14`)
- 30 plantillas seedeadas (commit `80e320f`)

**Cuándo reabrir esta decisión:** si react-konva queda obsoleto, si el bundle del estudio supera 200KB gzipped, si Lucy reporta UX issues que requieran cambio de paradigma (ej. preferencia por WYSIWYG sin canvas, sólo "asistente que dispara emails"), o si pgvector + RAG (ADR-036 futuro) requiere reformatear `canvasData` para hacerlo searchable.

**Referencias.** Sub-bloque M en plan `~/.claude/plans/lee-complemtante-el-proyecto-wiggly-mist.md`. Commits `f9380e0`/`592b766`/`bfe0c14`/`80e320f`. Lectura recomendada antes de tocar: `packages/db/prisma/schema.prisma` (modelos Design/DesignAsset/PersonalizationTemplate), `supabase/migrations/00000000000006_storage_personalization.sql`, `packages/db/scripts/seed-templates.mjs`.

## ADR-036 — Information Architecture del catálogo: naming, variants y categoría "De Temporada"

**Estado.** Aceptada y aplicada — 2026-05-14.

**Contexto.** Tras consolidar las primeras 3 familias de productos en variants (M.3.b.CAT.1-4, commit `944332f`), Lucy reportó que el catálogo seguía mal organizado: nombres como "Set 6 Foto-imanes Polaroid Grande" mienten cuando el producto base tiene variants 6/9/12/20; mezclamos "Set / Pack / Box / Caja" sin reglas; y faltaba una categoría para productos estacionales (Día Madre, Día Padre, Navidad). Pidió "lo pienses bien y lo propongas como lo recomiendan los especialistas".

Auditoría detectó 4 sistemas léxicos competidores en 49 productos (9 con "Set", 7 con "Pack", 4 con "Box/Big Box/Mini Box", 6 con "Recuerdos de X") + 11 productos con cantidad/tamaño incrustado en el nombre + 5 productos archivados por consolidate (Polaroid x3, Box Día Madre x1, Rutina x1) que ya eran variants pero el seed seguía declarando.

**Decisión.** Refactor integral de Information Architecture, aplicado al `seed-products.mjs` y a `Category.name`:

1. **5 reglas de naming (estándar Casetify / Shutterfly / Vistaprint adaptado a Lucams):**
   - **R1.** Un solo prefijo para "producto multi-imán": `Set`. `Pack` se reserva exclusivamente para B2B ("Pack Empresarial Mixto"). `Box`/`Caja` para regalo-en-caja. `Cuadro`/`Planner`/`Calendario`/`Imán` para producto único de su tipo.
   - **R2.** Shape SÍ va en el nombre (Polaroid, Cuadrados, Circulares, Corazón) — es identitario del producto, no variant.
   - **R3.** Cantidad y tamaño NUNCA van en el nombre del producto base si son variants. Cantidad en "x20" o número en "Set 12" → variant.
   - **R4.** Patrón consistente por categoría: `Fotoimanes [Shape]`, `Recuerdos de [Evento]`, `Calendario [Tema]`, `Imán Publicitario [Forma]` (singular), `Planner [Período]`, `Box [Ocasión]`, `Cuadro [Contenido]`, coleccionables sin prefijo.
   - **R5.** Filtros laterales en `/productos` (shape / cantidad / tamaño / precio) toman la carga de discoverability.

2. **10 categorías** (era 9). Nueva: `de-temporada` para ediciones estacionales (Día Madre, Día Padre, Navidad, San Valentín). Coexiste con `regalos-personalizados` (Pareja, Recién Nacido, Sorpresa — año-redondo). Display renames: `foto-imanes` → "Fotoimanes" (sin "Packs de Fotos Magnéticas"), `organizate` → "Organización", `regalos-personalizados` → "Cajas Regalo", `juegos-aprendizaje` → "Juegos y Aprendizaje" (sin "Magnéticos" redundante).

3. **Box Día de la Madre movido a `de-temporada`** (mantiene SKU `REG-BB-MAMA` para idempotencia; solo cambia `categoryId`). Productos sembrados nuevos en la categoría: `SEA-BB-PAPA` (Box Día del Padre, 2 variants Big/Mini paralelo a Día Madre) y `SEA-NAV-8` (Edición Navidad Kawaii, coleccionable temporal sin variants).

4. **Variants declarados inline en `productsData[]`**. Antes el seed creaba "Default" por producto y `consolidate-product-families.mjs` postprocesaba. Ahora cada producto con opciones reales declara su `variants[]` con SKU/name/price/attributes. El loop del seed:
   - Si `variants` declarado → upserta cada uno por SKU y archiva el "Default" sobreviente + cualquier variant huérfano.
   - Si NO declarado → mantiene legacy "Default" (CartItem/OrderItem requieren variantId).
   - SKUs siguen patrón `<base-sku>-V<n>` (ej. `FI-POL-12-V1`) → compatible con los variants ya creados por consolidate-script en commit `944332f`. Upsert preserva IDs → los redirects 301 en `apps/web/lib/product-redirects.ts` siguen válidos.

5. **Nuevos variants creados (~62 totales, distribución):**
   - Fotoimanes: Polaroid 4 (heredado) + Cuadrados 3 + Circulares 3 + Corazón 3 + Glass 2 = 15
   - Recuerdos: Cumple 3 + Bautizo 2 + Graduación 3 + Matrimonio 3 + Mi Primer Año 2 + Quinceañera 2 = 15
   - Publicitarios: Rectangular 3 (tamaño) + Circular 3 (diámetro) + Mixto 3 (volumen) = 9
   - Cuadros: con Foto 3 + con Frase 3 + Marcos 3 = 9
   - Organización: Notas 3 + Separadores 3 = 6
   - De Temporada: Box Mamá 2 (heredado) + Box Papá 2 = 4
   - Calendarios: Mini 2 = 2
   - Juegos: Rutina 2 (heredado) = 2
   - Resto sin variants (productos únicos)

**Por qué este shape (no alternativas):**

- **vs sub-categorías por shape (foto-imanes/polaroid)** — agrega un nivel extra de navegación que infla el menú. Mejor mantener categoría plana + filtros laterales por shape. Es lo que hacen Society6, Casetify, Etsy.
- **vs script de rename ad-hoc + sin tocar seed** — generaba drift: si Lucy corría `make seed-products` después, sobreescribía los renames con los nombres viejos. Reescribir el seed garantiza que el estado terminal sea idempotente.
- **vs mantener "Pack" en coleccionables** — "Pack Animalitos Kawaii" tiene info redundante (la categoría ya dice "Coleccionables"). "Animalitos Kawaii" se lee más limpio. Lucy puede reintroducir "Pack" en admin si lo prefiere comercialmente.
- **vs crear categoría `seasonal-edition`** — `de-temporada` es 100% legible es-CO y mantiene la convención de slugs cortos del resto.

**Trade-offs aceptados:**

- ~30 productos cambian de `name` display. **SEO**: slugs intactos → cero impacto Google. **Reviews + Cart items + Orders existentes** apuntan a `productId` → cero ruptura.
- Algunos precios de variants son estimados (no son cotizaciones reales de Lucy). Marcados como TODO en el seed; Lucy ajustará en admin cuando defina pricing oficial.
- `consolidate-product-families.mjs` queda redundante (su efecto está integrado al seed). Lo dejamos como script histórico — corre idempotente y no rompe nada.

**Consecuencias positivas:**

- Cliente lee un sistema léxico coherente — "Pack" y "Set" dejan de ser intercambiables visualmente.
- Variants tienen sentido — el nombre base no miente sobre cantidad o tamaño.
- Discoverability sube: cuando entres a `/productos`, el chip "X opciones" en la card (M.3.b.CAT.6) le dice al cliente que adentro puede elegir cantidad/tamaño.
- Categoría "De Temporada" da pivote claro para campañas (Día Madre mayo, Día Padre junio, Navidad nov-ene, San Valentín feb).

**Consecuencias negativas:**

- 62 variants ahora visibles en admin variant CRUD (M.3.b.CAT.7 pendiente) — más rows que mantener cuando llegue.
- "Big Box" y "Mini Box" dejan de ser productos separados — clientes que buscaban "Big Box" en Google llegan al base y eligen variant en el selector. Inicial fricción de un click.

**Verificación M.3.b.CAT.10 (cerrado 2026-05-14):**

- 10 categorías en DB + 46 productos base + ~62 variants inline (commits de esta sesión).
- `make seed-products` idempotente: re-corre sin duplicar variants y sin reactivar productos archivados.
- Storefront muestra chips "X opciones" en cards (M.3.b.CAT.6 commit `0775b30`).
- PDP de Fotoimanes Polaroid / Cuadrados / Circulares / Corazón etc. muestra selector funcional (M.3.b.CAT.3 commit `944332f`).

**Cuándo reabrir esta decisión:**

- Si Lucy contrata un copywriter profesional y propone otro sistema léxico (probable post-launch).
- Si análisis de búsqueda interna (`/api/search` + pg_trgm) muestra que clientes buscan "Pack 12" / "Big Box" como query frecuente — ahí el SEO de los slugs viejos via redirects deja de cubrir y haría falta agregar alias.
- Si entran categorías nuevas que no encajan en las 10 actuales (corporativo regalado, escolar, eventos pre-armados).

**Referencias.** Plan `~/.claude/plans/lee-complemtante-el-proyecto-wiggly-mist.md` sub-bloque M.3.b.CAT. Commits `944332f` (CAT.1-4) + `0775b30` (CAT.6+8) + commit de esta sesión (CAT.10). Lectura recomendada antes de tocar: `packages/db/scripts/seed-products.mjs` (nuevo header con reglas R1-R5), `apps/web/lib/product-redirects.ts` (slugs legacy → base + variant pre-seleccionado), `apps/web/features/products/variant-schemas.ts` (Zod attributes).

## ADR-037 — Estrategia de plantilla por tipo de producto + reset del catálogo de plantillas

**Estado.** Aceptada y aplicada — 2026-05-14.

**Contexto.** Tras el refactor de Information Architecture (ADR-036), Lucy revisó las 11 plantillas SVG visibles en el Estudio y reportó que solo `ig_post.svg` cumplía el estándar visual "tienda que envidiar". Las otras 10 eran placeholder/draft de calidad mixta. Co-creación 2026-05-14: decisión de **borrar todas las mediocres + dejar solo `ig_post.svg` activa + crear fallback "Personalización Libre (temporal)" por kind** mientras Lucy regenera plantillas una a una vía el Claude Project "Lucams SVG Designer".

Decisión paralela: definir formalmente **qué es editable en cada tipo de producto** para que las plantillas nuevas no se diseñen ad-hoc.

**Decisión.** Cinco bloques:

1. **Reset del catálogo de plantillas.** Soft-deleteadas las 11 plantillas pre-existentes (incluyendo Polaroid Romántica, Baby Shower, Cuadrado Minimal Art, Calendario Floral 2026, etc. — todas las que NO usaban `ig_post.svg`). Borrados los 14 archivos SVG correspondientes de `apps/web/public/templates/`, dejando solo `ig_post.svg` + nuevo placeholder `personalizacion-libre.svg`. Reseed con 9 plantillas activas.

2. **`ig_post.svg` → plantilla "Polaroid Instagram" asignada a Fotoimanes Polaroid (SKU FI-POL-12).** Aspect 400×580 (~7:10) encaja con los variants Polaroid 7×9 cm, 6×8 cm. `productId` no nullable en el seed → solo aparece dentro del editor de Fotoimanes Polaroid, no como global.

3. **8 plantillas globales "Personalización Libre (temporal)"** (una por kind personalizable). Canvas blanco + image-placeholder + opcional texto editable. `productId: null` → aparecen para cualquier producto del kind. Garantiza que todo producto personalizable tenga al menos una plantilla funcional aunque no esté regenerada todavía. Order 99 → quedan al final del sidebar (cliente prefiere plantillas premium primero).

4. **Matriz "Estrategia de plantilla por tipo de producto"** (rige las plantillas nuevas a generar):

   | Tipo de producto                                                                                                       | Foto editable     | Texto editable                                                                 | Decoración                                 | Notas                                                                                                                                                                                                   |
   | ---------------------------------------------------------------------------------------------------------------------- | ----------------- | ------------------------------------------------------------------------------ | ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
   | **Fotoimanes (Polaroid / Cuadrados / Circulares / Corazón / Glass)**                                                   | ✅ Sí             | Opcional (algunas plantillas decoradas estilo `ig_post.svg`, otras minimalist) | Marco del shape (identitario del producto) | El shape vive en producto, no en plantilla                                                                                                                                                              |
   | **Recuerdos de [Evento]** (Cumple, Bautizo, Matrimonio, Quinceañera, Graduación, Mi Primer Año)                        | ✅ Sí             | ✅ Sí (nombre del festejado + fecha + motivo)                                  | Decoración temática del evento             | Plantilla por evento                                                                                                                                                                                    |
   | **Calendarios** (Foto-Mes, Foto + Planner, Floral, Mini)                                                               | ✅ Sí (foto hero) | ❌ No (mes/año/días/festivos son fijos del SVG)                                | Cielo/colinas/decoración kawaii            | Estáticos: cuando llegue noviembre, Lucy genera 12 SVG nuevos del año siguiente. NO templating dinámico `{MONTH}` — los festivos colombianos cambian (días móviles + decretos), no se pueden hardcodear |
   | **Cajas Regalo + De Temporada** (Pareja, Recién Nacido, Sorpresa, Día Madre, Día Padre, Navidad)                       | ✅ Sí             | ✅ Sí (frase corta personalizada)                                              | Decoración temática                        | Plantilla por ocasión                                                                                                                                                                                   |
   | **Cuadros con Foto**                                                                                                   | ✅ Sí             | ❌                                                                             | Marco simple                               | Foco en la foto                                                                                                                                                                                         |
   | **Cuadros con Frase**                                                                                                  | ❌                | ✅ Sí                                                                          | Tipografía grande + paleta brand           | Sin foto                                                                                                                                                                                                |
   | **Publicitarios**                                                                                                      | Logo (image)      | ✅ Sí (nombre + teléfono + email + redes)                                      | Limpia B2B                                 | No foto personal del cliente                                                                                                                                                                            |
   | **NONE** (Coleccionables, Juegos, Caja Sorpresa, Edición Navidad, Calendario Floral, Marcos, Notas, Planners sin foto) | ❌ Sin Estudio    | ❌                                                                             | —                                          | Botón único "Añadir al carrito" en PDP                                                                                                                                                                  |

5. **Pendientes documentados (sesiones siguientes):**
   - **Admin UI plantillas** `/admin/plantillas` con CRUD para que Lucy (no técnica) gestione plantillas autónomamente — upload SVG, orden, asignar producto, activar/archivar. Hoy depende del seed (código).
   - **Mockup contextual en PDP** estilo foto Lucy compartida (mano + nevera + imán). Dos planes: (A) Lucy genera con IA + sube como `Product.images[0]` desde admin (manual, $0 código); (B) M.3.b.B.5 ya planeado: pipeline sharp + 4 escenas curadas + perspective warp + composite del diseño del cliente post-Estudio. No excluyentes.
   - **Reseñas con plantilla**: cuando hay reseñas con foto, taggear qué plantilla generó esa reseña para mostrar en sidebar ("83% de clientes que usaron Polaroid Instagram calificaron 5★"). Schema-ready, UX futura.
   - **Filtros catálogo — shape contextual**: cuando categoría=foto-imanes, agregar checkboxes shape (Polaroid / Cuadrado / Circular / Corazón / Glass). Requiere campo `shape` standarizado en Product o parsing de slug. Postergado a próxima sesión.

**Por qué este shape (no alternativas):**

- **vs mantener las 10 plantillas mediocres y mejorarlas in-place** — Lucy explicó que el bar visual es "tienda que envidiar", regenerar de cero usando el Claude Project es más rápido y consistente que retocar pieza a pieza. Las plantillas son drop-in (archivos SVG en `public/templates/`).
- **vs bloquear el Estudio cuando no hay plantilla premium** — frustración del cliente que entra a "Personalizar" y encuentra wall. La plantilla "Personalización Libre" da fallback funcional con canvas blanco.
- **vs templating dinámico de mes/año en calendarios** — los festivos colombianos cambian año a año (Día del Trabajo móvil, lunes festivos por ley Emiliani, decretos presidenciales). Hardcodear es honesto. Lucy genera 12 SVG cada noviembre para el año siguiente.
- **vs admin UI plantillas en esta misma sesión** — scope grande (~6h con CRUD + upload + reorder). Lucy puede iterar plantillas vía seed mientras tanto; admin UI es próximo sub-bloque.

**Trade-offs aceptados:**

- 8 plantillas "Personalización Libre" con preview idéntico (placeholder SVG genérico) son visualmente iguales en el sidebar — diferenciadas solo por kind. Aceptable porque son transitorias.
- "Polaroid Instagram" en este momento es la única plantilla premium activa — la PDP de Fotoimanes Polaroid muestra solo 1 plantilla + la fallback. La PDP de los otros 4 Fotoimanes (Cuadrados/Circulares/Corazón/Glass) muestra solo la fallback hasta que Lucy regenere premiums.

**Consecuencias positivas:**

- Cero plantillas mediocres rompen la promesa "tienda que envidiar".
- Estudio sigue funcional en cada producto personalizable (no hay deadlock por falta de plantilla).
- Lucy puede priorizar qué plantillas regenerar primero según volumen de venta esperado.

**Consecuencias negativas:**

- 42 plantillas archivadas en DB (de migraciones previas + las 11 reset acá). Más rows. Aceptable porque `deletedAt` filter las excluye en queries normales.
- Fallback "Personalización Libre" no es "tienda que envidiar" — funcional sí, premium no. Por eso se llama "(temporal)".

**Verificación M.3.b.CAT.11 (cerrado 2026-05-14):**

- `make seed-templates` ejecuta idempotente: 9 plantillas activas, 42 archivadas.
- `/producto/abecedario-magnetico` (NONE) muestra "Añadir al carrito" y NO "Personalizar tu imán". ✅
- `/estudio/abecedario-magnetico` (NONE) → 404. ✅
- `/producto/set-12-fotoimanes-polaroid` muestra "Personalizar tu imán →" + Estudio activa con 2 plantillas (Polaroid Instagram premium + Personalización Libre fallback).
- Filtros `/productos`: slider con thumb visible (border-2 brand-purple + bg-white + shadow-md) + botones "Aplicar / Reiniciar" debajo + bug stale state corregido (pasar valor nuevo explícito en cada call de `apply`).

**Cuándo reabrir esta decisión:**

- Cuando Lucy contrate diseñador kawaii freelance o regenere las plantillas premium con el Project — actualizar matriz si surge un tipo nuevo (ej. plantillas para Día de Madre con foto del bebé incluida).
- Si volumen del negocio requiere admin UI plantillas (es decir, cuando Lucy ya no quiera depender del seed para iterar).

**Referencias.** Plan `~/.claude/plans/lee-complemtante-el-proyecto-wiggly-mist.md` sub-bloque M.3.b. Co-creación 2026-05-14. Lectura recomendada antes de tocar: `packages/db/scripts/seed-templates.mjs` (header con estrategia M.3.b.CAT.11), `apps/web/public/templates/` (solo `ig_post.svg` + `personalizacion-libre.svg`), `apps/web/components/products-filters.tsx` (fix stale state + Aplicar/Reiniciar), `apps/web/components/ui/slider.tsx` (token brand visible).

---

## ADR-038 — API Catálogo RAG-ready (PLAN_CATALOG_V2 decisión 2.10)

**Fecha.** 2026-05-15
**Status.** Aceptado
**Sub-bloque.** PLAN_CATALOG_V2 Área 2

**Contexto.** El plan consensuado (`docs/PLAN_CATALOG_V2.md`) cierra como principio rector transversal (decisión 2.11) que el catálogo debe ser AI-ready: DB = fuente de verdad, LLM = consumidor que consulta API estructurada, nunca inventa. Las decisiones 2.10 + 5.10 + 6.7 + 7.7 + 4.9 definen los endpoints públicos del catálogo que tanto la UI del sitio como el bot WhatsApp futuro Fase 5+ consumen.

**Decisión.** Implementar 8 endpoints públicos bajo `/api/catalog/*` + 1 bajo `/api/coupons/*`, todos con cache HTTP + rate-limit. Sin auth (catálogo público). Excluyen datos sensibles (cost, margin, datos admin).

**Endpoints:**

| Endpoint                           | Devuelve                                                                                                                     | Decisión origen   |
| ---------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- | ----------------- |
| `GET /api/catalog/categories`      | Árbol jerárquico cat → sub-cats con `richDescription`, `useCase`, count productos.                                           | 2.10              |
| `GET /api/catalog/products`        | Lista paginada filtrable (`categoria`, `subcategoria`, `ocasion`, `priceMin/Max`, `isPersonalizable`).                       | 2.10              |
| `GET /api/catalog/products/[slug]` | Detalle: `richDescription`, `whyChooseThis`, `idealFor`, variants con `description`, `physicalSpecs`, plantillas, ocasiones. | 2.10 + 4.9 + 5.10 |
| `GET /api/catalog/ocasiones`       | 15 ocasiones con descripción + productos asociados con `rationale` + `suggestedQuantityRange`.                               | 2.10              |
| `GET /api/catalog/search?q=`       | Búsqueda fuzzy pg_trgm sobre name + richDescription + idealFor + tags.                                                       | 2.10 + 7.8        |
| `GET /api/catalog/recommend`       | Productos scoreados por filtros (ocasion, destinatario, precio, kind). Misma lógica que wizard UI.                           | 6.7               |
| `GET /api/catalog/filters`         | Filtros disponibles + facet count por contexto categoría/sub-cat.                                                            | 7.7               |
| `GET /api/catalog/templates`       | PersonalizationTemplate por producto/kind con `mode` EDITABLE/PREMADE.                                                       | 5.10              |
| `GET /api/coupons/public`          | Cupones `isPublic && isActive && ahora BETWEEN validFrom AND validTo`. Bot informa códigos vigentes, NUNCA inventa.          | 3.9               |

**Convenciones técnicas:**

- **Cache HTTP**: `Cache-Control: public, max-age=3600` (catálogo cambia raramente). Recomendaciones max-age=600 (más fresco).
- **Rate-limit**: 30 req/min por IP (mismo patrón CMS API ADR-033). 60/min para `/api/catalog/recommend` por wizard activo.
- **Response shape estable**: campos opcionales nunca eliminados (solo se suman). Versionado vía path si rompemos.
- **Errores RFC 7807**: `lib/errors.ts` ya existente.
- **CORS**: `Access-Control-Allow-Origin: *` (público).
- **Sin auth**: catálogo público. Excepciones admin viven bajo `/api/admin/*` con cookie auth.
- **Exclusiones obligatorias del payload**: `cost`, `margin`, `isFeatured` interno crudo, `createdBy/updatedBy/deletedBy`, datos de admin.

**Por qué este shape (no alternativas):**

- **vs GraphQL** — REST es más simple para bot WhatsApp + frontend Next.js. GraphQL agrega complejidad sin beneficio para nuestro volumen de queries.
- **vs no exponer API y dejar bot leer DB directo** — viola principio AI-ready (no auth = no source of truth controlada). API normalizada permite versionado, cache, rate-limit, auditoría.
- **vs replicar lógica en bot + UI por separado** — viola DRY. Endpoint compartido garantiza consistencia: si Lucy cambia un campo en admin, bot y UI lo ven con misma latencia (cache TTL).

**Trade-offs aceptados:**

- 9 endpoints nuevos = más código y tests. Aceptable porque pattern ya consolidado en CMS API (ADR-033) — reusamos infraestructura `lib/cms.ts` + `unstable_cache` + headers HTTP.
- Cache 1h significa que cambios admin tardan máx 1h en propagarse al bot. Si Lucy edita un producto urgente puede invalidar manualmente via tag (`updateTag("catalog")`).

**Consecuencias positivas:**

- Bot WhatsApp Fase 5+ consume directo, sin lógica duplicada.
- Mobile app futura puede usar la misma API.
- SEO mejorado (sitemap puede generarse desde API).
- Análisis externos (Lucy con su contador, Power BI, etc.) consumen desde API.

**Consecuencias negativas:**

- Si necesitamos cambiar shape de respuesta, hay que mantener compatibilidad o versionar `/api/v2/...`.
- Cache HTTP requiere invalidación cuidadosa (tag-based).

**Pendientes documentados (próximos sub-bloques):**

- Embeddings pgvector + ADR-036 para búsqueda semántica (Fase 5+ junto con bot).
- Endpoint `/api/admin/insights/*` para "bot admin" futuro (decisión 8.8, Fase 5+).
- Webhook outbound al bot WhatsApp cuando hay cambios críticos (price drop, stock low) — Fase 5+.

**Cuándo reabrir esta decisión.** Si el bot Fase 5+ requiere queries que el shape actual no soporta (ej. filtros geográficos por departamento Colombia, análisis temporal de tendencias), o si volumen de tráfico justifica migrar a edge runtime con cache CDN.

**Referencias.** `docs/PLAN_CATALOG_V2.md` decisiones 2.10 + 2.11 + 4.9 + 5.10 + 6.7 + 7.7 + 3.9. Patrón base: ADR-033 (CMS API). `apps/web/app/api/catalog/*` (endpoints implementados). `apps/web/lib/catalog.ts` (helpers + cache + rate-limit).

---

## ADR-039 — Logística Aveonline + interface `ShippingProvider` (PLAN_CATALOG_V2 decisión 4.10)

**Fecha.** 2026-05-15
**Status.** Aceptado
**Sub-bloque.** PLAN_CATALOG_V2 Área 4

**Contexto.** El plan original mencionaba Venndelo como proveedor de logística (1 carrier: Coordinadora). Investigación profunda 2026-05-15 (mandato Lucy "explora 100% sin suposición") reveló **Aveonline** como agregador multi-carrier colombiano que integra Servientrega, Envia, TCC, Coordinadora, Domina, Interrapidísimo, Saferbo. Decisión 4.10 cierra con Aveonline primario + interface `ShippingProvider` que permite swap futuro a Venndelo o nuevo proveedor.

**Decisión.** Implementar `features/shipping/` con interface `ShippingProvider` + 2 implementaciones (Aveonline activa, Venndelo dormida Plan B documentado en `docs/INTEGRATIONS.md`).

**Interface `ShippingProvider`:**

```ts
export interface ShippingProvider {
  // Cotiza envío. Retorna lista de carriers + precio + días entrega.
  // En Aveonline cliente elige; en Venndelo retorna solo Coordinadora.
  quote(params: {
    origin: { city: string; department: string };
    destination: { city: string; department: string };
    items: Array<{ weightGrams: number; declaredValue: number; qty: number }>;
    contraentrega: boolean;
  }): Promise<ShippingQuote[]>;

  // Crea guía con el carrier elegido. Retorna número guía + URL etiqueta PDF + tracking URL.
  createShipment(params: {
    carrier: string;
    quoteId: string;
    pickup: PickupAddress;
    delivery: DeliveryAddress;
    contraentrega: boolean;
    valorRecaudo?: number;
    orderId: string;
  }): Promise<ShippingResult>;

  // Consulta estado actual + histórico. Para sync periódico o consulta UI.
  getTracking(trackingNumber: string): Promise<TrackingStatus>;

  // Solicita recogida en pickup address (Aveonline: limitado a 11am del día).
  requestPickup(params: { trackingNumbers: string[]; comments?: string }): Promise<PickupResult>;

  // Procesa webhook entrante (verificación firma + parse + retorno status normalizado).
  handleWebhook(rawBody: string, headers: Record<string, string>): Promise<WebhookEvent>;
}
```

**Implementación Aveonline:**

- Auth: JWT 1h vigencia. `lib/aveonline-auth.ts` cachea token + auto-refresh con buffer 5min antes de expirar.
- Endpoints encapsulados: el API legacy usa POST + `tipo` discriminator; `lib/aveonline.ts` ofrece interface limpia que internamente arma los requests.
- Webhook sin HMAC documentado → mitigación con IP whitelist Aveonline + validación de existencia del `guia` en DB + estado monotónico (no retrocede). Pedir a soporte que agregue HMAC.
- Recogida 11am: UI admin muestra advertencia "Confirma antes de 11am para que salga hoy".

**Implementación Venndelo (dormida):**

- Archivo `features/shipping/venndelo.ts` queda no exportado por default. Si Aveonline falla, swap: cambiar import en `features/shipping/provider.ts` y deploy.
- Schema `lib/venndelo.ts` ya documentado en `docs/INTEGRATIONS.md`.

**Variables de entorno:**

```bash
SHIPPING_PROVIDER=aveonline  # aveonline | venndelo

# Aveonline
AVEONLINE_USUARIO=
AVEONLINE_CLAVE=
AVEONLINE_PICKUP_CITY=Bogotá
AVEONLINE_PICKUP_DEPARTMENT=Cundinamarca
AVEONLINE_PICKUP_ADDRESS=
AVEONLINE_PICKUP_PHONE=

# Venndelo (Plan B)
VENNDELO_API_URL=
VENNDELO_API_KEY=
VENNDELO_WEBHOOK_SECRET=
```

**Esquema DB (campos sumados en Order):**

- `shippingCarrier: String?` — carrier elegido (servientrega, tcc, coordinadora, etc.).
- `trackingNumber: String?` — número guía.
- `trackingUrl: String?` — URL portal carrier para que cliente vea status.
- `labelUrl: String?` — URL impresión etiqueta PDF (rutaimpresion en Aveonline).

**Por qué este shape (no alternativas):**

- **vs Aveonline directo sin interface** — bloquea swap si rinde mal. Pattern `PaymentProvider` (Wompi swap-able a Mercado Pago) ya validado en proyecto; replicarlo.
- **vs Venndelo primario** — Venndelo es single-carrier (Coordinadora). En e-commerce colombiano sensible al precio del envío, cliente que elige entre 3-5 carriers convierte mejor.
- **vs integrar 3 carriers directos** — complejidad operativa innecesaria. Agregador resuelve negociación + tarifas.
- **vs no operar logística (cliente coordina retiro)** — viola mandato productivo "no es MVP".

**Trade-offs aceptados:**

- Aveonline API legacy PHP con `tipo` discriminator. Encapsulado en `lib/aveonline.ts` con interface limpia.
- Token 1h requiere refresh. Manejable con cache + buffer.
- Webhook sin HMAC inicial. Mitigado con IP whitelist + validación entidad.
- Recogida 11am operacional. UI admin avisa.

**Consecuencias positivas:**

- Cliente colombiano elige flete más conveniente → conversión sube.
- Resiliencia: si carrier X falla, los otros 6 siguen operando.
- Cobertura 90% Colombia con COD activo.
- Lucy cura desde admin qué carriers habilitar.

**Consecuencias negativas:**

- Mayor superficie de integración (7 carriers vs 1).
- Dependencia operativa con Aveonline como SaaS.

**Pendientes documentados (futuro):**

- Confirmar costo plan mensual Aveonline (acción humana Lucy).
- Validar HMAC webhook con soporte Aveonline.
- Política logística inversa (devoluciones) — falta documentación.
- SLA latencia API publicado por Aveonline.

**Cuándo reabrir esta decisión.** Si Aveonline falla en producción (costos suben, soporte malo, downtime), swap a Venndelo en ~8-12h ingeniería implementando `features/shipping/venndelo.ts`.

**Referencias.** `docs/PLAN_CATALOG_V2.md` decisión 4.10. Aveonline docs: https://integraciones.aveonline.co/docs/. `docs/INTEGRATIONS.md` § Venndelo (Plan B). `features/shipping/*` (implementación). `lib/aveonline.ts` (cliente API encapsulado). `lib/aveonline-auth.ts` (token cache + refresh).

---

## ADR-040 — Pulido UX admin "amigable" (feedback de Lucy 2026-06-27)

**Fecha:** 2026-06-27
**Estado:** ✅ Aceptada e implementada (los 6 bloques cerrados, commits abajo)

**Contexto:** Lucy (editora no-técnica) dio ~18 comentarios sobre el panel admin con la premisa "el admin es importante PERO debe ser simple y amigable para mí". Auditoría multi-agente (6 clusters verificados contra el código) en `docs/audits/2026-06-27-admin-ux-feedback/`: 3 bugs, ~11 mejoras, 5 decisiones de producto.

**Decisiones de Lucy (las que cambian comportamiento de la tienda):**

- **D1 — Fotos por opción:** SÍ, para todo el catálogo. Cada `ProductVariant` tiene `images String[]`; el PDP cambia la galería al elegir opción. Herencia: opción usa sus fotos, si no, las del producto (espeja `variant.price ?? basePrice`). Implementada (commit `8b46680`): migración `20260627090000_product_variant_images` aplicada a mano (`db execute` + `migrate resolve`, porque migrate dev falla por el shadow DB sin pg_trgm y db push quería dropear `rate_limit_buckets` por drift preexistente) + uploader admin por opción + galería reactiva en storefront.
- **D2 — Sub-categorías:** SÍ, 1 nivel (coherente con rutas `/productos/[categoria]/[subcategoria]`). `parentId` ya existía en el modelo. Implementada (commit `892343b`).
- **D3 — Reordenar categorías con flechas ↑/↓:** se eliminó el campo manual "número de orden" (confundía + causaba el bug de orden duplicado). Orden auto-asignado; reorden por flechas. Implementada (`892343b`).
- **D4 — Precio base del producto auto-derivado:** con el precio viviendo en cada opción, `Product.basePrice` se calcula solo (= mínimo de las opciones) y se esconde de la UI. Implementada (`dd638fd`).
- **D6 — Ordenar tablas por clic en columna:** reemplaza el dropdown "Ordenar por" en desktop; el dropdown queda solo en mobile (headers difíciles de tocar). Implementada (`0a105ba`).

**Bugs cerrados (commit `b9aa66a`):** precio de opción se guardaba en centavos crudos (riesgo de vender 100× más barato); orden de categorías sin desempate (menú del cliente indeterminado); sidebar no sticky.

**Por qué importa admin + front cliente juntos:** varios puntos (fotos por opción, orden de categorías, descripciones/SEO, sub-categorías) tienen contraparte en el storefront y se diseñan juntos para no rehacer. Hallazgo clave: la "descripción larga" que se le pedía a Lucy NUNCA se mostraba al cliente (solo `description` corta) → se escondió.

**Consecuencia:** el admin muestra menos campos (lo técnico colapsado/escondido), el precio es coherente en pesos, las categorías se gestionan visualmente, cada opción puede tener sus fotos. Queda deuda menor: revisar si `compareAtPrice` (promo) debería pasar a nivel opción. **Aviso de infra:** la DB tiene drift preexistente (`rate_limit_buckets` existe en DB pero no en el schema Prisma) → NO usar `prisma db push` (lo dropearía); las migraciones nuevas se aplican a mano con `db execute` + `migrate resolve` mientras el shadow DB de `migrate dev` falle por `pg_trgm`.

**Referencias.** `docs/audits/2026-06-27-admin-ux-feedback/00-PLAN.md` (plan + tabla maestra de los 18 puntos). Commits `b9aa66a`, `d06047e`, `892343b`, `dd638fd`, `0a105ba`, `8b46680`.

---

## ADR-041 — Barrido UX/UI integral del admin (2da tanda feedback Lucy 2026-06-27)

**Fecha:** 2026-06-27
**Estado:** ✅ Aceptada (alto impacto implementado; backlog de pulido menor documentado)

**Contexto:** 2da tanda de feedback de Lucy (productos, opciones, comentarios generales) con el mandato "recorre TODO el ecosistema UX/UI, no des por hecho, ajusta y certifica". Auditoría multi-agente de 6 frentes en `docs/audits/2026-06-27-ux-sweep/`.

**Decisiones de Lucy:**

- **Precio tachado (promo) por OPCIÓN, no por producto.** Antes `Product.compareAtPrice` se comparaba contra el precio de la opción → descuento podía salir negativo en la tienda. Se movió a `ProductVariant.compareAtPrice` (migración 20260627150000, manual + backfill que solo copia promos válidas). El PDP usa el tachado de la opción elegida; las cards leen `product.compareAtPrice` **denormalizado** = promo de la opción más barata (mantenido por `syncProductBasePrice`). Implementado (commit `e2ba896`).
- **Atributos de opción: quitar forma/acabado/proporción del form** (Lucy nunca los usa). Se preservan ocultos para no perder datos. Quedan 4 campos en lenguaje llano. Nombre de opción = libre con sugerencia en vivo. Implementado (`7b10158`).
- **Cursor "manito" global** (1 regla CSS) + **spinner de "procesando"** en botones (foundation `Button.loading` + `<PendingSubmitButton>`, propagado a lo de más tráfico/riesgo). Commits `a1b87bc`, `b4c8063`.
- **Módulos técnicos (Auditoría/Redirects/Integraciones): dejarlos pero simplificar lo técnico** (no ocultarlos). Pendiente de implementar.

**Bugs/inconsistencias cerrados:** form de edición de opción encajado en la tabla (se sacó fuera); voseo en ~38 strings (es-CO tuteo); jerga de dev visible (`make seed-…`); cupones mostraban enum crudo; roles con diccionarios distintos (uno con valores de enum inexistentes) → `lib/admin-roles` único; productos ordenable solo por 2 columnas + paginación sin saltos.

**Consecuencia:** el admin es más claro y consistente, el precio/promo es coherente por opción, y se evitó un bug de descuento negativo en la tienda. **Backlog (no bloqueante):** propagar el spinner a los ~50 botones restantes (forms server-component); simplificar lo técnico de Auditoría/Redirects/Integraciones; pulidos menores (dashboard/inventario/ocasiones copy).

**Referencias.** `docs/audits/2026-06-27-ux-sweep/00-PLAN.md`. Commits `a1b87bc`, `48bfcb5`, `7b10158`, `e2ba896`, `b4c8063`, `6244436`.

---

## ADR-042 — Bloque C Seguridad: arranque + decisiones de Lucy (2026-06-27)

**Fecha:** 2026-06-27
**Estado:** 🔄 En curso (P0 críticos cerrados; MFA/Reseñas/RBAC/tests pendientes)

**Contexto:** Auditoría de seguridad pre-launch (`docs/audits/2026-06-27-security-bloque-c/`). La autenticación de `/admin/*` ya era sólida; los huecos eran RLS incompleta, rate-limit roto, RBAC decorativo, MFA ausente.

**Cerrado y verificado (P0):**
- **Rate-limit del catálogo roto** (`const allowed = await rateLimit()` sobre un objeto → `!allowed` siempre false → nunca frenaba). Fix en 10 rutas. Verificado: 29×200 → 6×429. Commit `96ea33d`.
- **RLS deny-by-default** en las 17 tablas públicas sin candado (PII de clientes expuesta vía PostgREST). Migración `00000000000007`, aplicada al dev DB (autorizado por Lucy). La app no se rompe (lee vía Prisma/service_role). Commit `bcdc6c2`.
- **CI hardening:** `pnpm audit --prod` bloqueante + dependabot + permisos mínimos; `shadcn` (CLI) movido a devDeps (eliminó un high de producción). Commit `0d35c00`.

**Decisiones de Lucy:**
- **MFA admin (TOTP): SÍ, para su cuenta SUPERADMIN desde el día 1.** Yo construyo la pantalla de enrolamiento (QR + verificar + códigos de recuperación); ella escanea con su app. _Pendiente de implementar._
- **RLS: autorizó escribir Y aplicar** a la DB de desarrollo. Hecho.
- **Reseñas: implementar el flujo para el launch** (form + Turnstile + verificación de compra + moderación, que ya existe en admin). _Pendiente._
- **Registro: dejar el mensaje claro** ("este correo ya tiene cuenta") — mejor UX; el abuso se acota con rate-limit por IP. _Decisión registrada aquí; T9 no se cambia._

**Implementado después (commits del mismo día):**
- **MFA admin (A6)** `7583d58` — enroll/QR + reto al entrar + candado en layout + break-glass `make admin-mfa-reset`.
- **Reseñas (T10)** `02a2988` — flujo cliente con verificación de compra + Turnstile + moderación.
- **Turnstile registro/reset (T2/T3) + MIME real por magic bytes (F1)** `8777e28`.
- **Guard anti-reincidencia RLS (R4)** `fb2af0e` — test que falla si una tabla pública queda sin candado.

**Pendiente del bloque (backend, no testeable por Lucy / menor / riesgo):** RBAC por rol (A5 — solo aplica al agregar empleados; Lucy es SUPERADMIN = ve todo), Turnstile + rate-limit en checkout (T4), idle-timeout 30min (A7, toca proxy), logout global admin (A8), CSP por nonce (C3, requiere validación visual), rate-limit en upload (F2), matriz completa de tests RLS (R3). **CORS `*` en /api/catalog/* se deja A PROPÓSITO:** son APIs públicas read-only sin credenciales (consumo público intencional, ej. bot futuro) → `*` no es vulnerabilidad ahí.

**ACCIÓN HUMANA REQUERIDA (verificaciones de Lucy):**
- **Turnstile en producción:** confirmar que `NEXT_PUBLIC_TURNSTILE_SITE_KEY` y `TURNSTILE_SECRET_KEY` están en Vercel prod (si falta el secret, contacto/newsletter se bloquean por diseño fail-closed).
- **Branch protection en GitHub** (`main`/`develop`): PR obligatorio + reviews + status checks requeridos + no force-push. Si falta, todos los gates de CI son evadibles (P0 efectivo).

**Referencias.** `docs/audits/2026-06-27-security-bloque-c/00-PLAN.md`. Commits `96ea33d`, `bcdc6c2`, `0d35c00`.

## ADR-043 — Bloque C Seguridad: cierre completo (7/7) (2026-06-29)

**Contexto.** ADR-042 dejó 6 items de hardening pendientes ("backend, no testeable / menor / riesgo"). Lucy pidió cerrar el bloque. Todos implementados, certificados y commiteados.

**Implementado:**
- **A5 · RBAC por rol** `08f9cd4` — matriz ruta→roles (`lib/admin-rbac.ts` puro + `lib/admin-rbac-guard.ts` server). Menú lateral filtrado por rol + `requireRole(["SUPERADMIN"])` en finanzas/seguridad/auditoría/cupones (bloquea acceso directo por URL). Hoy solo existe SUPERADMIN → no afecta a Lucy; prepara empleados.
- **A8 · Logout global** + **A7 · Idle-timeout 30min** + **A9 · Cookie flags** `4e2fc3e` — `adminLogoutAction` con `signOut({scope:"global"})`; el proxy marca actividad (cookie `admin_last_activity` httpOnly+sameSite+secure-prod) y a los 30min sin actividad limpia las cookies `sb-*` y manda a `/admin/login?expired=1` (ventana deslizante).
- **T4 · Rate-limit checkout** + **F2 · Rate-limit upload estudio** `d35b899` — `payWompiAction` (IP, prod 20/10min) y `uploadDesignAssetAction` (por dueño, prod 30/10min). Turnstile en checkout se omite a propósito (fricción al pago). Nuevo helper `ownerKey()`.
- **C3 · CSP por nonce** `036b261` — script-src reemplaza `'unsafe-inline' 'unsafe-eval'` por `'nonce-X' 'strict-dynamic'` en prod/preview (guía oficial Next 16). El proxy genera nonce/request e integra con el flujo getAll/setAll de Supabase. **Dev mantiene el CSP permisivo** (el dev server inyecta scripts HMR que con nonce se romperían; el nonce se valida en deploy prod-like). style-src mantiene `'unsafe-inline'` (los atributos `style=""` no aceptan nonce).

**Decisión derivada (importante para mantenimiento).** El nonce CSP **exige render dinámico en toda página** (una estática se prerenderea sin nonce → sus scripts quedan bloqueados). La app ya era 97% dinámica; se forzó `export const dynamic = "force-dynamic"` en las estáticas restantes (registro, recomendador, maintenance, recuperar-password, not-found). **Regla a futuro:** toda página nueva debe ser dinámica, o sus scripts se bloquearán en prod. `/manifest.webmanifest` se deja estática (no tiene scripts).

**Verificación.** Prod-like (`VERCEL_ENV=preview`): en home, registro, recomendador, maintenance, producto, admin/login, carrito, contacto, login → 0 scripts sin nonce (el nonce del header == el de cada `<script>`). typecheck + build + 56 tests verdes. Dev intacto (CSP permisivo, smoke 200).

**ACCIÓN HUMANA REQUERIDA (Lucy).** Validar C3 en un **deploy preview de Vercel** (no en dev, que usa el CSP permisivo): recorrer storefront + estudio/canvas + checkout + Turnstile (registro) + todo el admin, con la consola del navegador abierta buscando errores `Refused to execute ... violates Content Security Policy`.

**Referencias.** Commits `08f9cd4`, `4e2fc3e`, `d35b899`, `036b261`. [[ADR-042]].

## ADR-044 — Accesibilidad WCAG 2.1 AA: tonos de texto sin tocar la paleta (2026-07-03)

**Contexto.** Se integró `@axe-core/playwright` (auditoría automatizada WCAG 2.1 A/AA sobre 9 páginas clave) y encontró 3 tipos de violación reales: `select-name` (crítico), `link-in-text-block` (serio) y `color-contrast` sistémico (serio, en las 9 páginas). El contraste es la tensión clásica: la paleta kawaii pastel (purple `#7c6aad`, pink `#e85b9f`, coral `#f58a6f`) sobre crema/blanco no alcanza el 4.5:1 de AA en **texto pequeño/secundario** (ratios 2.5–4.4). Lucy aprobó abordarlo priorizando calidad, con el mandato de **no modificar la paleta** sin decisión documentada.

**Decisión.** Cumplir AA **conservando intactos los 7 colores de la paleta**. Los colores kawaii se mantienen para fondos, decoración, íconos, mascota, títulos grandes y botones; para el **texto** donde el pastel no da contraste, se introdujeron **tonos derivados AA** como tokens nuevos (no reemplazan la paleta):
- `--brand-muted: #6b6280` (`text-brand-muted`) — texto secundario, ~5.5:1 sobre blanco/crema. Reemplazó a `text-brand-purple-dark/{40–65}` y `text-brand-purple/{40–70}` (299 usos en ~90 archivos).
- `--brand-pink-ink: #c42b76` (`text/bg-brand-pink-ink`) — texto/enlace/badge rosa pequeño (blanco sobre él ≥4.5:1). Reemplazó `text-brand-pink` en enlaces (auth) y `bg-brand-pink` en badges de descuento.
- `--brand-coral-ink: #b0492e` — hover de enlaces coral.
- Texto `text-brand-purple` sólido pequeño (pills, enlaces) → `text-brand-purple-dark` (ya en paleta). Botón WhatsApp `bg-emerald-600`→`emerald-700` (verde neutro, no marca).

**Regla a futuro.** Texto pequeño/secundario/interactivo usa `text-brand-muted` / `*-ink` / `text-brand-purple-dark`, **no** los pasteles a baja opacidad. Los colores vibrantes se reservan para fondos/decoración/títulos grandes (AA "large text" = 3:1, que sí cumplen). La gate `axe.spec.ts` es **estricta**: 0 violaciones serious/critical (contraste incluido) en cada PR.

**Verificación.** axe 9/9 con 0 violaciones (antes: contraste en las 9). Suite E2E completa verde (33 pass + 2 flaky tolerados). typecheck limpio. Ningún test unitario asertaba las clases cambiadas (37 de componentes verdes). Paleta (`--brand-*` de los 7 colores) sin cambios.

**ACCIÓN HUMANA REQUERIDA (Lucy).** Revisar **visualmente** en el navegador que el look kawaii se conserva: el texto secundario quedó un poco más oscuro (más legible) y los badges/enlaces rosa pequeños usan un rosa más profundo. Mirar home, catálogo, PDP, carrito, contacto, registro/login y el Estudio. Si algún tono se ve "pesado", se ajusta el token (un solo lugar en `globals.css`). [[ADR-040]].

## ADR-045 — Capa de resiliencia (timeout/retry/circuit-breaker) cableada en proveedores externos (2026-07-09)

**Contexto.** La auditoría de productive-readiness dejó abierto el hallazgo `fetchWithTimeout` + `withRetry` + `CircuitBreaker` (ROADMAP:195). El riesgo concreto era Aveonline: **7 de sus 8 llamadas `fetch` NO tenían timeout** (auth, cotización, listados de agentes/transportadoras, tracking, webhooks CRUD). Solo `createShipment` tenía `AbortSignal.timeout(20_000)`. Una llamada colgada de Aveonline en el checkout síncrono cuelga al cliente; en la saga post-pago, deja la orden atascada. Wompi ya tenía timeouts pero sin retry ni breaker.

**Decisión.** Se implementaron los 3 helpers en `apps/web/lib/` (spec CONVENTIONS §Resiliencia) y se cablearon:

1. **`fetch-with-timeout.ts`** — `fetchWithTimeout(url, init & {timeoutMs=5000})` vía `AbortController` + `AbortSignal.any` (combina señal del caller); normaliza el abort por timeout a `FetchTimeoutError` (name `"TimeoutError"`).
2. **`retry.ts`** — `withRetry` (attempts=3, backoff exponencial + jitter, `sleep` inyectable) que solo reintenta `isRetryable`: timeouts/aborts, error de red (`TypeError`), 5xx, 408, 429. **NUNCA 4xx** (excepto 408/429).
3. **`circuit-breaker.ts`** — `CircuitBreaker` per-instancia (mandato #11: sin Redis inicial), `threshold:5 / resetMs:30_000`, estados closed/open/half-open, `now` inyectable.

**Orden retry↔breaker: retry POR FUERA** (`withRetry(() => cb.exec(fetch))`). Así el breaker cuenta cada intento y, una vez abierto, `CircuitOpenError` (no reintentable) corta el loop de inmediato en vez de reintentar contra un proveedor caído.

**Idempotencia = criterio para permitir retry:**
- **Aveonline** (`aveonlineFetch` helper + `aveonlineCB` compartido): auth/quote/carriers/agents/tracking/list-webhooks → `retry:true` (idempotentes). **`createShipment` (generar guía) → timeout(15s)+CB pero SIN retry** — reintentar tras timeout podría crear una **guía duplicada** (doble etiqueta/cobro). create/delete-webhook → sin retry.
- **Wompi** (`wompiCB`): `getTransaction` (GET estado de pago, idempotente) → retry+CB. Se **bajó su timeout de 10s → 5s** alineándolo a la tabla CONVENTIONS: con 3 reintentos + backoff, 5s+retry es más robusto que un único 10s sin retry. Se adjunta `.status` al error 5xx para que `isRetryable` lo reintente.

**Timeouts aplicados** (tabla CONVENTIONS): quote 5s, create-shipment **20s** (excepción a la tabla — endpoint
más lento y no-reintentable; corregido de 15s→20s en ADR-048), auth/tracking/listados 5s, webhooks admin 8s,
Wompi GET 5s.

**Verificación.** 14 tests unitarios nuevos (retry/circuit-breaker/fetch-with-timeout) + 90/90 unit (wompi/payments incluidos) + **65/65 integration contra el path REAL de Aveonline demo** (saga + checkout) → el cableado no rompe el happy path. typecheck limpio, prettier aplicado.

**Pendiente.** Cablear el cliente Anthropic (Studio IA, Fase 3) con `fetchWithTimeout` 30s + retry cuando se implemente. El estado del breaker es per-instancia (serverless) — si las métricas exigen coordinación global, migrar a Postgres/Redis (mandato #11). [[ADR-039]].

## ADR-046 — Cierre de open-redirect en el CMS de redirects + `safeRedirectTarget` (2026-07-09)

**Contexto.** El hallazgo `safeRedirectTarget` seguía abierto (ROADMAP:196) y los tests de
`features/redirects/service.integration.test.ts` **documentaban dos bugs reales** de open-redirect
(marcados `BUG:`): el CMS de redirects admin (`UrlRedirect`, 301/302 servidos por `proxy.ts`) aceptaba
destinos que **parecen internos** (empiezan con `/`) pero el navegador resuelve a un host **externo**:
- `//evil.com` (protocol-relative) → `https://evil.com`
- `/\evil.com` (backslash, el navegador normaliza `\` → `/`) → `//evil.com` → `https://evil.com`

`normalizePath` solo dejaba pasar `http(s)://` explícito y a todo lo demás le anteponía `/` — sin
detectar los vectores disfrazados. Un redirect así habilita phishing con el dominio propio en la barra.

**Decisión.** Nuevo helper `apps/web/lib/safe-redirect.ts` con dos políticas:
- `isSafeInternalPath` / `safeRedirectTarget(input, fallback="/")` — **SOLO interno**: exige un único `/`
  inicial (no `//`), sin `\`, sin caracteres de control, y que resuelva al **mismo origen** contra una base
  arbitraria (`new URL` autoritativo, no heurística). Para consumir `?next=` de auth sin confiar en el valor.
- `isAllowedRedirectDestination` — política del **CMS admin**: acepta interno seguro **O** externo
  `http(s)://` **explícito** (por diseño: redirigir a partners), y rechaza los disfrazados.

**Cableado:**
1. `features/redirects/service.ts` — `assertAllowedToPath(toPath)` en `createRedirect` **y** `updateRedirect`
   → lanza `RedirectValidationError` (mensaje en español llano para Lucy). Externos http(s) siguen permitidos;
   `//evil.com` y `/\evil.com` ahora se rechazan antes de persistir.
2. **Login honra `?next=` seguro** (antes redirigía a `/` hardcodeado, ignorando el `next` que ya ponía
   `/mi-cuenta`): la page lee `sp.next`, el form lo pasa como hidden field, y el action redirige a
   `safeRedirectTarget(next)`. Aunque el hidden field sea manipulable, la sanitización server-side garantiza
   solo paths internos → arregla la UX (volver a donde venías) sin abrir un open-redirect.

**Nota de scheme.** Se conservó el diseño previo (ADR sin número en el schema): el CMS permite `http://` y
`https://` sin restricción de scheme para externos explícitos. No se restringió a https-only para no romper
el caso de uso admin; los esquemas peligrosos (`javascript:`, `data:`) no matchean `http(s)://` y caen a
path interno inofensivo.

**Verificación.** 13 tests unitarios nuevos (`safe-redirect.test.ts`, todos los vectores) + los 2 tests
`BUG:` del integration reescritos a **BLOQUEA** (verifican rechazo + no-persistencia) → 75/75 verde contra
DB real. typecheck + eslint limpios. [[ADR-045]].

## ADR-047 — Cierre del loop de errores del cliente → ErrorReport (Bloque D) (2026-07-09)

**Contexto.** La observabilidad de Bloque D capturaba errores del **servidor** (`instrumentation.onRequestError`
→ `ErrorLog`) pero los error boundaries del **cliente** (`app/error.tsx`, `app/global-error.tsx`) solo hacían
`console.error` — los errores puramente client-side (render/hidratación/interacción en el navegador) se perdían,
sin registro en backend. El modelo `ErrorReport` (dedup por fingerprint, `count`, `status` OPEN/RESOLVED/IGNORED,
"alternativa propia a Sentry") ya existía en el schema **pero sin writer ni endpoint** — pieza diseñada, no
construida. El propio comentario de `error.tsx` lo marcaba como pendiente ("se conectará a /api/log-error").

**Decisión.** Cerrar el loop reusando el modelo existente, sin deps nuevas ni Sentry (mandato #7):
1. **`lib/error-capture.captureClientError`** — upsert en `ErrorReport` por **fingerprint = SHA-1(message +
   primeras 3 líneas del stack)**, calculado server-side (no se confía en el cliente). Mismo error recurrente →
   `count++` + `lastSeenAt`, no filas nuevas. Best-effort (nunca lanza); race-safe ante P2002 (create concurrente
   → reintenta como update).
2. **`/api/log-error` (route handler)** — sink público endurecido: Zod + límites de tamaño (anti-bloat) +
   **rate-limit por IP** (30/5min, reusa el rate-limit de Postgres) + nunca 5xx (200 `{ok:false}` para no gatillar
   retry-spam). `dynamic="force-dynamic"` + `runtime="nodejs"` (patrón de `/api/vitals`, evita el fallo de pino en
   build estático).
3. **`error.tsx` + `global-error.tsx`** — `fetch("/api/log-error", {keepalive:true}).catch(()=>{})` con message,
   stack, digest, url y `source`. Sin PII en la UI (solo el `digest` de referencia, como antes).
4. **Panel `/admin/observability`** — nuevo tile "Errores cliente" (openCount, rojo si >0) + sección con los
   reportes abiertos (message, url, ×count, últ. visto). Sin esto el sink sería write-only (invisible para Lucy).

**Verificación.** 5 tests de integración nuevos (`error-capture.integration.test.ts`: dedup incrementa count,
stacks distintos → fingerprints distintos, persiste url/UA/digest, no lanza con message vacío) + observability
integration sigue verde con el nuevo `clientErrors`. typecheck + eslint limpios.

**Triage admin (hecho en la misma sesión).** El panel es accionable: cada reporte OPEN tiene botones
**Resolver** / **Ignorar** (server actions con gate SUPERADMIN + audit log `error_report.status_change` +
`revalidatePath`); `setErrorReportStatus` sella `resolvedAt`/`resolvedBy` y al reabrir (OPEN) los limpia.
4 tests de integración cubren resolver→sale-de-abiertos y reabrir→limpia-sellos. Sin esto la lista sería
read-only, inútil para Lucy (admin no-técnica).

**Pendiente (mejora futura).** ~~Reabrir automáticamente un reporte RESUELTO si el mismo fingerprint recurre~~
→ HECHO en ADR-048. [[ADR-045]].

## ADR-048 — Arreglos de la revisión adversarial multi-agente de la sesión (2026-07-09)

**Contexto.** Tras cerrar los frentes de la sesión (ADR-045/046/047 + RLS), se corrió un **workflow de revisión
adversarial multi-agente** sobre todo el código nuevo (36 archivos, +1622/-132): 8 dimensiones de alto riesgo
en paralelo, cada hallazgo verificado por un panel de 3 escépticos con lentes distintas (correctness / security /
reproducibilidad), sobreviviendo solo lo confirmado por ≥2/3. Resultado: 14 hallazgos, **8 confirmados**
(0 críticos), 6 correctamente refutados (body-size lo capa la plataforma, CB compartido quote/createShipment es
deseable, PII-en-url refutado 2/1, getState lazy es correcto, etc.). La suite completa (1614 tests) seguía verde;
estos son defectos que los tests no cubrían. Se arreglaron los 8:

1. **[MED] `aveonline.ts` — timeout de createShipment restaurado 15s→20s.** ADR-045 lo bajó a 15s siguiendo la
   tabla genérica de CONVENTIONS, pero `generarGuia2` es el endpoint más lento (guía+PDF+sticker) y la ÚNICA
   llamada no-reintentable/no-idempotente; estrechar su margen sube la probabilidad de abortar una guía que
   Aveonline SÍ completó server-side → queda huérfana (la DB no guardó trackingNumber) y un retry de la saga
   generaría una 2ª guía (doble flete/recaudo). Se restaura el 20s previo probado (mandato #9: no bajar un número
   sin evidencia del p99). Idempotencia real (query-by-dsreferencia antes de crear) queda como mejora.
2. **[MED] `error-capture.ts` — reabrir reportes RESUELTOS que recurren.** Un error marcado RESOLVED que vuelve
   a ocurrir solo incrementaba `count` → la regresión quedaba invisible en el panel (status seguía RESOLVED).
   Ahora `captureClientError` hace un `updateMany({fingerprint, status:'RESOLVED'} → OPEN + limpia resolved*)`;
   `IGNORED` se respeta (silencio intencional). updateMany atómico sobre el filtro → race-safe.
3. **[LOW] `circuit-breaker.ts` — prueba única en half-open.** El half-open no limitaba a una llamada: N requests
   concurrentes (Vercel sirve concurrencia en un worker) atravesaban el circuito hacia el proveedor caído. Se
   agregó un flag `probing` (+ local `isProbe` para que solo la prueba lo limpie en el finally): concurrentes en
   half-open reciben `CircuitOpenError` (fail-fast).
4. **[LOW] `error-capture.ts` — fingerprint incluye `digest`.** En build de producción los errores de Server
   Component llegan a los boundaries con un `message` genérico idéntico; sin el digest, bugs distintos colapsaban
   en una fila. Ahora el fingerprint es SHA-1(message + stack[:3] + digest).
5. **[LOW] `error-capture.ts` — normalización de tokens volátiles.** URLs (chunks con hash por build),
   posiciones `:línea:columna` y hex largos se normalizan antes de hashear → recurrencias del mismo error lógico
   (ChunkLoadError entre deploys) deduplican en una fila en vez de acumular casi-duplicados.
6. **[LOW] `/api/log-error` — tope global anti-bloat.** Además del rate-limit por IP (30/5min), un bucket global
   (600/5min) acota el peor caso de creación de filas ante un atacante que rota IPs + varía el message (cada
   fingerprint único = fila). Los errores legítimos deduplican, así que 600/5min es holgado.
7. **[LOW] `/internal/plantilla-preview/[slug]` — gate de producción.** La ruta interna era PÚBLICA sin auth y
   renderizaba cualquier plantilla por slug, incluidas ocultas/soft-deleted → enumeración/disclosure. Ahora
   `if (VERCEL_ENV === 'production') notFound()`: cerrada en vivo (los previews se sirven desde Storage, nunca
   desde esta ruta), sin romper el generador Playwright que corre en dev/preview.

**Verificación.** Tests nuevos: CB prueba-única concurrente + 5 de error-capture (reopen, ignored-se-respeta,
digest-separa, normalización-colapsa). Suite completa re-corrida verde. typecheck + eslint + prettier limpios.

**Descartados (no se tocaron, refutación correcta).** Wompi getTransaction 3×5s≈15.7s peor caso vs límite
serverless (1 conf/2 uncertain, no alcanzó el umbral; el happy-path es 1 llamada <5s, solo Wompi degradado
reintenta; revisar si migran a Vercel Pro); redacción de PII en url/stack (refutado 2/1, inherente al error
reporting); CB compartido quote/createShipment (refutado 3/0, refleja "¿Aveonline arriba?" globalmente). [[ADR-047]].

**Ronda 2 — verificación adversarial de los propios arreglos (mismo día).** Se corrió un 2º workflow que
ataca cada arreglo de arriba (6 dimensiones × panel de 2 escépticos): 10 hallazgos, **6 confirmados**. Refinados:
- **[MED] `/api/log-error` — el backstop global cambiaba bloat por SUPRESIÓN DE OBSERVABILIDAD.** El bucket
  contaba por REQUEST sobre una key constante → un bug ruidoso legítimo (que deduplica) agotaba los 600 tokens y
  ocultaba los demás errores; y congelaba count/lastSeenAt del bug visible. **Rediseño:** el tope se movió a
  `captureClientError` y aplica SOLO a la creación de filas NUEVAS (fingerprints no vistos, `error-report:new`
  300/5min); los incrementos de dedup jamás se frenan. `captureClientError` pasó de `upsert` a `findUnique`-first:
  incremento siempre + reopen solo si status===RESOLVED (esto además elimina el updateMany incondicional que corría
  en cada captura). Del route se quitó el bucket global; queda el por-IP.
- **[MED] preview gate — dejaba abiertos los PREVIEW deployments** (VERCEL_ENV='preview'), donde la misma
  enumeración corre contra la BD de producción real. Endurecido a `if (process.env.VERCEL_ENV) notFound()` (cierra
  production Y preview; dev local sigue abierto para el generador).
- **[LOW] fingerprint — `/https?:\/\/\S+/g` greedy colapsaba la URL ENTERA** (path incluido) → dos errores en
  endpoints distintos hacían falso-merge. Se quitó ese replace; ahora se normaliza solo lo volátil (query strings,
  `:línea:col`, hex largos), preservando el path que identifica el origen.
- **[LOW] circuit breaker — una `fn` que se cuelga en la prueba de half-open wedgearía el breaker** (probing=true
  para siempre). Latente (los callers actuales ya envuelven en `fetchWithTimeout`); se documentó la precondición
  dura en el JSDoc de `exec()`.
Descartados en ronda 2 (refutados): digest re-introduce volatilidad (0/1), hex matchea decimales (1/1), 300/600 es
número mágico (0/2), saga inline en webhook Wompi vs 20s (0/2). Suite completa re-corrida verde tras el rediseño.

## ADR-049 — `maxDuration` explícito en las funciones que corren createShipment (2026-07-10)

**Contexto.** El descartado #5 de ronda 1 (retry budget vs límite de función serverless) no alcanzó el umbral de
confirmación por INCERTIDUMBRE del entorno de despliegue. Resolverla es el trabajo. Los presupuestos internos que
se cablearon esta sesión: getAuthToken/quote/tracking reintentan 3×5s ≈ 15.7s peor caso; createShipment tiene
timeout 20s y es **no-idempotente/no-reintentable**. Ninguna función declaraba `maxDuration` → dependían del default.

**Verificación oficial (Vercel docs `/docs/functions/configuring-functions/duration`, actualizado 2026-07-01,
consultado 2026-07-10).** Con **fluid compute (habilitado por defecto)** el límite de duración es **300s (default y
máx) en Hobby**, y **300s default / 800s máx (1800s extendido) en Pro**. Es decir: los presupuestos (15.7s, 20s)
caben HOLGADOS bajo el default de 300s → el riesgo de "función matada a mitad de createShipment → guía huérfana"
queda **refutado SI fluid compute está activo**. PERO no se puede verificar desde código si fluid está activo en el
proyecto (es un ajuste de dashboard); si NO lo estuviera, Hobby volvería al límite legacy de 10s → createShipment
(20s) sería matado a mitad → guía huérfana → doble guía en el retry de la saga.

**Decisión.** Declarar `maxDuration` EXPLÍCITO (route segment config de App Router) en las funciones que corren
createShipment, dimensionado para contener el presupuesto interno con margen. Correcto y honrado en Pro (plan de
lanzamiento); documenta la intención; y protege el caso "fluid off". **Se descubrió en la investigación que son
TRES funciones las que corren createShipment**, no dos: `/api/webhooks/wompi` (route), `/checkout/gracias` (page —
corre el FALLBACK processPaidOrder cuando el webhook se demora, P0-012) y `/admin/(panel)/pedidos/[number]` (page —
hostea la retry action; las server actions heredan el maxDuration del segmento). Las tres → **`maxDuration = 60`**.
`/checkout/envio` corre quoteShipping (LECTURA idempotente, kill inofensivo) → **`maxDuration = 30`** para acotar
latencia/costo bajo degradación.

**Nota (no se tocaron los retry counts).** 3 intentos es estándar y el peor caso (~16s) cabe en 60s con margen para
auth-cold + createShipment(20s) + escrituras de saga. Reducir intentos en las PAGES síncronas (envio/gracias) para
mejorar la UX bajo degradación (hoy el usuario podría esperar ~16s) es una mejora futura opcional, no correctitud.

**ACCIÓN HUMANA REQUERIDA (Lucy, al lanzar).** (1) Confirmar en Vercel → Project → Settings → Functions que **Fluid
Compute está habilitado** (default en proyectos nuevos) — así el default de 300s aplica y los `maxDuration=60/30`
son honrados sin sorpresas. (2) Verificar que el plan al lanzar (Pro) permite `maxDuration ≥ 60` (Pro: hasta 800s).
En Hobby sin fluid, un `maxDuration > 10` no se respeta → NO lanzar en esa combinación con pagos activos. [[ADR-045]] [[ADR-048]].

## ADR-050 — Área de cuenta del cliente funcional (/mi-cuenta) (2026-07-10)

**Contexto.** Lucy validó `/mi-cuenta` y la calificó "básica, poco funcional e incompleta": era un perfil de
solo-lectura + una lista estática "Pronto aquí". El mapeo (workflow 6 subsistemas) reveló que **"Mis pedidos" YA
existía y funcionaba** (`/mi-cuenta/pedidos` + detalle con tracking/retracto) pero **la landing no lo conectaba**;
y que `Address`/`Review` tenían modelo pero sin UI, y no había cambio de contraseña ni eliminación de cuenta.

**Decisión.** Construir el área completa reusando lo existente:
- **Shell** (`app/mi-cuenta/layout.tsx` + `account-nav.tsx`): guard único (`getCurrentCustomer`, ahora memoizado
  con `cache()` por-request), header+logout, tabs storefront. Overview (`page.tsx`) redISeñado como hub con
  accesos a cada sección + perfil + puntos/referido. Se eliminó el "Pronto aquí".
- **Perfil** editable (nombre/teléfono). **Direcciones** CRUD sobre el modelo `Address` plano, con invariante
  transaccional "una sola default por cliente" (6 tests). **Reseñas**: `listReviewsByCustomer` con estado
  Publicada/En revisión + borrar la propia. **Seguridad**: cambiar contraseña in-session con **re-autenticación**
  (verifica la actual con signInWithPassword antes de updateUser) + HIBP + rate-limit + revocar otras sesiones.
- **Eliminar cuenta (Ley 1581)**: enfoque **anonimizar + soft-delete** (NO borrado físico) para conciliar
  supresión con **retención fiscal DIAN** — se conservan órdenes/facturas y consentimientos; se scrubbea PII del
  Customer (email→placeholder, nombre/tel/documento→null, `supabaseUserId`→placeholder porque es NOT NULL @unique),
  soft-delete de direcciones, reseñas desvinculadas + nombre anonimizado, y `admin.deleteUser` del auth. Confirmación
  fuerte (escribir "ELIMINAR" + re-auth) + rate-limit. Política documentada en COMPLIANCE.md (antes no fijada).

**Aislamiento.** No hay RLS en DB para Customer/Address/Review (Prisma usa rol privilegiado); TODA query nueva
filtra por `session.customer.id` a nivel aplicación. Es el patrón establecido (ya lo usaba /mi-cuenta/pedidos).

**Housekeeping incluido.** Labels/badges de OrderStatus extraídos a `features/orders/order-status-display.ts`
(estaban triplicados). Corregido **voseo** en pedidos/[number] ("escribinos/respondé"→tuteo). Reconciliado el
correo habeas-data (la page legal decía `hola@`, el resto `habeas-data@`) → `habeas-data@lucamsshop.co`. Login
redirect estandarizado a `?next=`.

**Verificación.** `next build` OK (8 rutas /mi-cuenta) + typecheck + eslint + 6 tests de direcciones + 57 de
auth/checkout (cache() no rompe nada). **Pendiente: [VALIDACIÓN VISUAL Lucy]** — es su feature, revisar look+flujo.
Mejora futura: integrar direcciones guardadas en el checkout (hoy checkout y Address están desconectados). [[ADR-046]].

### ADR-050 addendum — Revisión adversarial del área de cuenta (2026-07-10)

Se sometió el área de cuenta a revisión adversarial multi-agente (6 dimensiones × panel de escépticos):
**15 hallazgos confirmados, 0 falsos positivos**, todos arreglados. El clúster crítico fue **eliminar cuenta**:
la implementación inicial solo tocaba Customer/Address/Review y dejaba PII sensible sin borrar:
- **#1 [HIGH]** fotos subidas al Estudio (DesignAsset en customer-uploads = rostros) nunca se borraban.
- **#2 [HIGH]** tickets de soporte (email/name/message/ip) sin anonimizar.
- **#3 [HIGH]** soft-delete de Address dejaba las columnas PII intactas.
- **#5 [MED]** snapshot `Order.shippingAddress` conservaba nombre/tel/dirección inline.
- **#6 [LOW]** logs (RecommendationLog/LoyaltyTxn/CouponUsage) mantenían el vínculo.
- **#4 [MED]** si `admin.deleteUser` fallaba, el user seguía pudiendo loguear (solo un log).
`delete-service.ts` se reescribió para supresión exhaustiva (3 buckets de Storage + scrub de todas las tablas
PII + fallback de baneo). Otros: **#7** mensaje de change-password honesto si signOut falla; **#9/#13** promover
otra dirección a default al borrar la default; **#10** índice parcial-único DB `address_one_default_per_customer`
(migración 009) + manejo P2002; **#11** robots noindex en overview; **#12** count real de pedidos; **#14** feedback
de errores en acciones de dirección; **#15** voseo en email order-delivered. Verificado: 7 tests de direcciones
(incl. promover-default) + typecheck + eslint + build.

## ADR-051 — Unificar el modelo de direcciones cuenta ↔ checkout (2026-07-10)

**Contexto.** Al conectar las direcciones guardadas al checkout, Lucy detectó que una dirección guardada NO se
reusaba 100%: la cuenta guardaba un formato PLANO (calle en texto libre "Calle 3 sur # 70-84") mientras el checkout
usa el formato ESTRUCTURADO colombiano (deptCode/cityCode DANE + urbano/rural + vía/cruce/complemento). La calle
libre no se puede reconstruir en los campos vía/cruce → reuso parcial (solo depto/ciudad vía mapeo nombre→código).

**Decisión.** Alinear ambos al MISMO formato estructurado, guardándolo tal cual:
- **`Address.structured` (JSONB, migración 20260710120000):** la dirección en la forma del checkout (AddressInput).
  Los campos planos (`line1`, `city`, `department`) quedan como DISPLAY derivado (para la lista, sin re-componer).
- **`<StructuredAddressFields>` (`components/address/`):** componente CONTROLADO compartido con los mismos campos
  DANE + urbano/rural + vía/cruce del checkout. El form de `/mi-cuenta/direcciones` lo usa (reemplaza el texto libre).
- **`parseStructuredAddress` + `composeAddressLine` (`features/checkout/parse-address.ts`):** FUENTE ÚNICA de
  parseo+validación (misma `AddressSchema` + cross-check DANE). El action del checkout se refactorizó para usarlo
  (extracción fiel — 36 tests de checkout verdes lo garantizan). El action de la cuenta lo usa también.
- **Reuso 100%:** el checkout `applySavedAddress` rellena TODOS los campos desde `structured`. Legacy (structured
  null, direcciones del form viejo) → fallback depto/ciudad vía nombre→código; al re-guardar pasan a 100%.

**Por qué NO se refactorizó el formulario inline del checkout** (solo el action): es revenue-crítico y validado; se
comparte el shape de datos y el parseo, no el componente de UI. Puede adoptar `<StructuredAddressFields>` después
sin cambiar datos (deuda técnica menor, aislada). **Verificación:** next build OK, 44 tests (direcciones+checkout),
typecheck+eslint. **Pendiente-mejora:** hidratar el edit de direcciones legacy con depto/ciudad; "guardar dirección"
durante el checkout. [[ADR-050]].

## ADR-052 — Cerrar el bucle de reuso de direcciones: guardar-al-pagar + mapeo centralizado (2026-07-11)

**Contexto.** El ADR-051 dejó dos pendientes-mejora: (1) editar una dirección legacy (sin `structured`) abría el
form en blanco y bloqueaba el guardado (los campos vía/cruce requeridos quedaban vacíos); (2) el reuso era
unidireccional — una dirección guardada se reusaba 100% al pagar, pero el checkout no podía GUARDAR una dirección
nueva en la cuenta. Además, el mapeo `structured → AddressInput` (line1 canónico + line2=null + JSON) estaba
duplicado en el action de la cuenta.

**Decisión.**
- **`buildAddressInput(structured, {name, phone, isDefault})` (`features/addresses/service.ts`):** FUENTE ÚNICA del
  mapeo dirección-estructurada → registro del libro. `line1 = composeAddressLine` canónico (idéntico al del
  courier), `line2 = null` (no duplicar detail/finca), `structured` intacto (reuso 100%). La usan el action de la
  cuenta y el guardado-al-pagar. Elimina la 3ª copia del mapeo.
- **`saveCheckoutAddressToAccount(customerId, structured, {name, phone})`:** guardado opt-in desde el checkout,
  **idempotente** por `(line1 + city + department)` — no duplica si ya existe una viva idéntica (cubre re-pagar o
  marcar "guardar" tras elegir una guardada). No hijackea la default (solo default si es la 1ª del cliente).
- **UI checkout (`datos-form.tsx`):** checkbox "💾 Guardar esta dirección en mi cuenta" — renderizado SOLO si hay
  cliente logueado (`canSaveAddress` desde `ctx.customerId`) + input de etiqueta opcional. El action re-verifica
  `getCurrentCustomer` (defensa en profundidad: no confía en el form). El guardado es **no-fatal**: si falla, se
  loguea y el pago continúa.
- **Edit legacy (`address-manager.tsx`):** al editar una dirección sin `structured`, se pre-siembran depto/ciudad/CP
  desde los nombres planos (DANE por nombre) + aviso visual con la dirección anterior como referencia para
  recapturar la vía. Ya no abre en blanco ni bloquea.

**Verificación.** `next build` OK · `tsc` limpio · 38 unit (incl. `buildAddressInput`) + 45 integración
(direcciones+checkout, incl. idempotencia de guardado) verdes. Cierra 8 hallazgos de la revisión adversarial del
ADR-051 (commit 9aa6f96). [[ADR-051]].

## ADR-053 — Cotización de envío: timeout realista + hardening de la ruta (2026-07-11)

**Contexto.** La dueña reportó "no pudo cotizar envío en el step 2". Diagnóstico **medido**
contra la cuenta Aveonline real (idempresa 43581): el endpoint `cotizarDoble`
(`generarGuiaTransporteNacional.php` con `tipo=cotizarDoble`, que cotiza las ~10 transportadoras
server-side) tarda **7.0–11.3 s** (mediana 9.8 s; auth solo 0.33 s). El timeout estaba en **5000 ms**
(uniformado por ADR-045), así que **todo intento expiraba** → cotización siempre fallida. El log lo
confirmó: `Timeout tras 5000ms ... generarGuiaTransporteNacional.php`.

**Decisión (fix del bug).**
- **Timeout de `cotizarDoble` 5 s → 15 s** (~33% headroom sobre el máximo medido 11.3 s).
- **Retry acotado a 2 intentos** (default era 3): cada intento cuesta ~10 s; 3×15 s excedería el techo.
- **`maxDuration` del step 2: 30 → 45 s** — SUPERA el valor de [[ADR-049]] (que asumió 5 s×3 = 15 s;
  con la latencia real, 30 s era insuficiente). El peor caso auth(2×5 s) + quote(2×15 s) + DB ≈ 42 s < 45.
- Tabla de timeouts de CONVENTIONS actualizada.

**Hardening adicional (revisión adversarial multi-agente, 9 hallazgos confirmados de 15).**
- **P1 — dims faltantes:** un producto sin peso/dimensiones rompía la cotización de TODO el carrito y
  además **filtraba el mensaje interno** ("Configúralos en /admin/productos") al cliente. Ahora:
  (a) el banner del cliente es **genérico** (la causa real se loguea server-side), y (b) publicar
  (`toggleProductActive` / `bulkUpdateProductsActive` con `isActive=true`) exige dims resolubles vía
  `assertProductsQuotable` — bloquea con mensaje claro nombrando los productos faltantes. Desactivar
  nunca se bloquea.
- **P2 — retry de auth sin cap:** `getAuthToken` usaba el default 3 intentos que se sumaba ANTES del
  quote y podía exceder los 45 s → 504 crudo en vez del fallback ámbar. Acotado a 2.
- **P2 — breaker compartido:** un "quote-storm" (endpoint pesado/flaky) abría el breaker de TODO
  Aveonline y bloqueaba `createShipment` de órdenes YA PAGADAS + tracking por 30 s. La cotización
  ahora usa un **breaker separado** (`aveonline-quote`).
- **P2 — error de selección invisible:** `selectShippingAction` redirige con `?error` pero la página no
  lo leía → loop sin salida. Ahora se renderiza; además `quote()` **clampa `deliveryDays` a ≤30**,
  descarta filas con `codTransportadora` vacío y coacciona `total` no-numérico (todos rompían
  `ShippingSelectionSchema` en silencio al seleccionar).
- **P2 — error top-level tragado:** `quote()` no chequeaba `data.status`; una respuesta de error sin
  `cotizaciones` devolvía [] y el cliente veía "no hay cobertura" sin causa logueada. Ahora chequea
  status + loguea `message` + lanza error distinto.
- **P3 —** fetches de Resend (newsletter subscribe/unsubscribe) sin timeout → envueltos en
  `fetchWithTimeout` (10 s); `loadCheckoutContext` corría 2× por render del step 2 → se pasa el `ctx`
  ya cargado a `quoteShipping`; PICKUP_CITY/PICKUP_DEPARTMENT en blanco mandaba origen `()` → ahora
  lanza misconfiguración clara.

**Verificación.** `tsc` limpio · `next build` OK · tests de integración (direcciones/checkout/productos,
incl. gate de publicación por dims) verdes. Refuta las alternativas "1 intento de 20 s" y "mover a
client-side" (el panel escéptico las descartó 2/3). [[ADR-045]] [[ADR-048]] [[ADR-049]].

**Addendum (2026-07-11) — `unidades` ignorado al cotizar → subcobro de flete.** Ante la pregunta de la
dueña ("¿el cálculo usa peso/dimensiones/factores que pide la API?"), se verificó **empíricamente**
contra la cuenta real: peso ✓ (kg), dimensiones ✓ (volumétrico), valorDeclarado ✓ (mínimo $10.000).
PERO **`cotizarDoble` ignora el campo `unidades`**: `peso 0.3kg u1` y `peso 0.3kg u5` devuelven el
MISMO flete ($16.501, kilos=1). Como mapeábamos `peso=unitario` + `unidades=qty`, un pedido de 5
imanes se cotizaba como 1 → **flete subcobrado** (lo perdía la dueña). Fix: `buildCotizarProductos`
pliega la cantidad en el **peso total** (`peso = peso_unit × qty`, `unidades:1`, `valorDeclarado =
valor_unit × qty`) — modelo "peso total" elegido por Lucy (imanes densos que se apilan; el peso es el
costo real). Verificado: 5 imanes de 300g ahora cotizan $20.049 (kilos=2) vs $16.501. Unit test de
regresión en `aveonline.test.ts`. Los 6 transportadores con `err=999` fallan igual con cualquier
payload (problema de su lado en esta cuenta, no de nuestros datos).

**Addendum 2 (2026-07-11) — la GUÍA declaraba N bultos en vez de 1 caja.** Se verificó `generarGuia2`
generando guías de PRUEBA bloqueadas (no-facturables) en la cuenta demo y extrayendo el peso del
rótulo (PDF). Hallazgo: a diferencia de la cotización, la guía **SÍ usa `unidades`, pero como número
de BULTOS físicos** — con `unidades:5` el rótulo imprime "1 / 5" (bulto 1 de 5). Como `createShipment`
mandaba `unidades = Σqty` + `peso` por-unidad, un pedido de 5 imanes declaraba **5 bultos** al
transportador (cuando en realidad es 1 caja) → riesgo de lío/rechazo en la recogida. Fix: la guía
declara **1 paquete** con peso y valor TOTALES (`unidades:1`, `peso = Σ(peso_unit × qty)`, dims =
bounding box máximo por eje), consistente con el modelo "peso total" de la cotización. Verificado: la
guía con el payload nuevo imprime "1 / 1". Los tests de la saga mockean el provider (no rompen); la
verificación del payload real es contra la API demo.

**Addendum 3 (2026-07-11) — `valorDeclarado` en CENTAVOS → err=999 en TODAS (bug que reabrió el step 2).**
La dueña volvió a ver "error al cotizar". Diagnóstico en vivo: Aveonline espera PESOS en `valorDeclarado`
/ `dsvalor_pedido` / `valorrecaudo`, pero mandábamos CENTAVOS (mandato del proyecto: montos internos en
centavos). Un fotoimán de $45.000 (4.500.000 centavos) se declaraba como $4.500.000 (100× de más). Latente
desde siempre (Aveonline lo toleraba para 1 unidad, aunque perdía algún carrier), pero el fix del Addendum 1
(valorDeclarado × qty) lo empujó sobre el límite: 5 imanes → 22.500.000 → **numbererror=999 en las 11
transportadoras** (verificado: 45.000→ok=4/10, 4.500.000→ok=4/9, 22.500.000→**ok=0/11**). Fix: `centsToPesos`
(÷100) aplicado a `valorDeclarado` (cotización + guía), `dsvalor_pedido` y `valorrecaudo` (COD, hoy inactivo
pero quedaría 100× al recaudar). Verificado en vivo con el producto real: 5 Fotoimanes ($45.000 c/u) →
Bogotá→Bogotá ok=4/9, Bogotá→Medellín ok=4/9. Unit tests actualizados a pesos. **Nota:** hay 2 productos
"E2E Simple" activos SIN dims (residuo de tests E2E) — si entran a un carrito rompen la cotización; conviene
despublicarlos/borrarlos.

## ADR-054 — Auditoría integral de la integración Aveonline vs doc oficial (2026-07-11)

**Contexto.** La dueña pidió validar que TODO el flujo Aveonline quedara 100% acorde a la documentación
oficial vigente. Se auditaron las 7 áreas (auth, cotización, guía, agentes, transportadoras, tracking,
webhooks) con un workflow multi-agente: cada agente trajo la doc oficial real (WebFetch), la comparó campo
por campo con el código, y un panel escéptico verificó cada discrepancia. Además se capturó la **respuesta
real** de cada endpoint contra la cuenta en vivo como ground-truth. Resultado: 17 hallazgos crudos → **12
confirmados** (5 refutados, incl. el "gap de COD" que es feature diferida, no bug).

**Fixes aplicados (11 de 12; todos en `features/shipping/aveonline.ts`).**
- **[P1] Webhook `guia` numérico:** la doc manda `guia` como NÚMERO (892349021); lo pasábamos sin coercer
  a `Order.trackingNumber` (columna String) → `PrismaClientValidationError` tragado en el route → la orden
  **NUNCA** pasaba a SHIPPED/DELIVERED ni salían los correos. Fix: `String(body.guia)` + tipo `string|number`
  + test de regresión con guia numérico. (El más grave — rompía el 100% de los webhooks reales en silencio.)
- **[P1] Transportadoras — cache poisoning 24h:** ante una respuesta de error (HTTP 200 + `status:"error"`,
  sin `transportadoras`) cacheábamos `[]` por 24h → bloqueaba la generación de guía de pedidos YA PAGADOS
  por un día. Fix: chequear `status`, lanzar en error, y NO cachear listas vacías.
- **[P2] Guía `valorMinimo` 1→0:** con `1` la guía declaraba $10.000 fijos (sub-aseguraba TODO envío);
  con `0` usa la suma de valores declarados reales (coherente con la cotización y con ADR-053). Verificado
  en vivo que la guía genera OK con `0`.
- **[P2] Tracking:** leíamos `historicos[].fecha` (no existe; el real es `fechamostrar`) → todas las fechas
  del histórico caían a "ahora". Y no validábamos `status` → una guía inexistente/token vencido se reportaba
  como `PENDING` falso. Fix ambos. (getTracking hoy sin callers, pero se dejó correcto.)
- **[P2] Agentes `principal`:** comparábamos contra "SI"; la doc dice "S". La cuenta real devuelve "SI"
  (verificado en vivo) así que NO estaba roto, pero se hizo robusto (acepta S/SI/1) + chequeo de `status`
  (distingue "credenciales incorrectas" de "sin agentes").
- **[P3] Auth:** mensaje específico "credenciales inválidas" cuando `status:"ok"` pero `cuentas:[]`.
- **[P3] Cotización `productos`:** la doc tipa alto/ancho/largo/peso/valorDeclarado como String (números
  funcionaban por coerción PHP) → se stringifican, consistente con `createShipment`.
- **[P3] `plugin`:** la doc pide "apiave"; mandábamos "lucamsshop". Verificado en vivo que "apiave" cotiza
  igual → se usa el valor documentado (cotización + guía).
- **[P3] Webhook timestamp:** Aveonline manda fecha sin TZ en hora de Colombia; `new Date()` la leía en UTC
  (~5h de desfase). Fix: `parseAveonlineDate` normaliza a ISO con offset -05:00.

**Pendiente (1).** `listWebhook.php` / `deleteWebhook.php` NO están en la doc oficial (solo `createWebhook`);
las keys del response son suposiciones. Se dejan los fallbacks defensivos; **confirmar con una respuesta real**
de esos endpoints antes de tocar (admin-only, no afecta el flujo de venta).

**Verificación.** `tsc` limpio · `next build` OK · unit 8/8 (incl. webhook numérico) · live smoke 2/2 (código
real contra API) · saga 30/30. Ground-truth capturado: id-space carrier consistente cotización↔lista;
`valoracion` confirma valor en pesos con seguro 1%. [[ADR-053]] [[ADR-039]].

## ADR-055 — Pago contra entrega (COD) + revisión adversarial (2026-07-11)

**Contexto.** COD era requisito de lanzamiento (mandato #5 / datos clave) pero estaba stubbeado
("F2.1 Wompi only"). Se implementó de punta a punta y pasó una **revisión adversarial multi-agente**
(dinero real): 12 hallazgos crudos → **11 confirmados**, todos los P0/P1 y P2 arreglados.

**Diseño.** COD reusa el saga battle-tested (`processPaidOrder`): la orden va PENDING_PAYMENT → PAID →
FULFILLING con guía Aveonline `contraentrega=1` + `valorRecaudo=total` (el courier cobra el efectivo al
entregar y remite). El cliente aterriza en `/pedido/<token>?nueva=1`. Se reusa toda la infra probada
(idempotencia, carrera de stock, cupones, reconciliación).

**Fixes de la revisión (commit siguiente a 766414e):**
- **[P0]** COD sobre carrito con orden Wompi PENDING_PAYMENT abandonada reusaba esa orden (idempotencia
  por cartId) con `paymentMethod='WOMPI'` → guía PREPAGADA sin recaudo → despacho gratis. Fix: forzar
  `paymentMethod='COD'` (updateMany gateado a PENDING_PAYMENT) antes de `processPaidOrder`.
- **[P1]** `finalizeCheckout` COD ignoraba `saga.status` → mostraba "¡Pedido confirmado!" aunque la
  confirmación fallara. Fix: si la orden no llegó a PAID (carrera de stock) → CANCELAR + `STOCK_UNAVAILABLE`
  → carrito; si quedó PAID sin guía → `needsReconciliation` + mensaje suave.
- **[P1]** Una entrega RETURNED/EXCEPTION dejaba la orden atascada e invisible (ingresos/stock inflados).
  Fix: `processTrackingUpdate` marca `needsReconciliation` en RETURNED/EXCEPTION → aparece en el resumen
  diario + /admin/pedidos.
- **[P2]** El resumen diario contaba COD como ingreso antes de cobrar. Fix: `revenueLast24hCop` = Wompi
  capturado + COD ENTREGADO; nuevo `codToCollectCop` = COD confirmado por cobrar (mostrado aparte).
- **[P2]** Rate-limit COD: bucket separado y más estricto (6/10min prod) — cada COD crea orden + guía real.
- **[P2]** Botón admin "Cancelar" se rompía en PAID (transición ilegal). Fix: `PAID → CANCELLED` legal;
  UI gateada por método (COD PAID → Cancelar; Wompi PAID → Reembolsar).

**Diferidos (documentados, no bloqueantes):**
- **[P2] Cotización vs guía contraentrega:** el envío se cotiza con `contraentrega=false` pero la guía
  se genera con `=true`. Por decisión de Lucy ("sin recargo al cliente"), el cliente paga el mismo flete
  y la tienda absorbe cualquier comisión COD de Aveonline. Verificar el recargo real de Aveonline y, si es
  material, mover la elección de método antes del step de envío o re-cotizar. Aceptado como tradeoff.
- **[P2] Confirmación COD síncrona:** `finalizeCheckout` corre el saga completo (~20s de guía) en el
  request (maxDuration=60). Bajo Aveonline muy lento podría acercarse al techo. Mismo patrón que el
  fallback de /checkout/gracias (Wompi). Mejora futura: mover a job durable `pgmq` (mandato #11).

**Verificación.** `tsc` + `next build` OK · unit daily-summary 7/7 · order-transitions 8/8 · checkout
integración 36/36 (incl. COD contraentrega + valorRecaudo) · saga 30/30 · email 84/84. [[ADR-053]] [[ADR-039]].

## ADR-056 — Compartir diseño (Fase 3) + revisión adversarial (2026-07-11)

**Contexto.** El modelo `Design` ya tenía `shareToken String? @unique` sin cablear. Fase 3 del ROADMAP
lista "compartir" como brecha. Se implementó de punta a punta: "Mis diseños" (`/mi-cuenta/disenos`) con
grilla + preview + acciones Compartir / WhatsApp / Ver / Archivar, y una **vista pública** `/d/<token>`
(preview + producto + CTA "Crear el mío", `noindex`, OG image para miniatura en WhatsApp). Aislamiento por
`customerId`; token de 16 bytes hex (imposible de adivinar → sin IDOR). Aditivo, no toca el Estudio.

**Revisión adversarial multi-agente** (4 dimensiones × 3 escépticos, ≥2/3 confirman): 7 hallazgos crudos
→ **6 confirmados** → todos atendidos:
- **[med]** `handleCopy` mostraba "Link copiado ✨" aunque `clipboard.writeText` rechazara (documento sin
  foco / Safari / permiso negado) → toast que miente. Fix: `try/catch`; si falla, muestra el link para
  copiar a mano en vez de afirmar éxito.
- **[med/low]** "Archivar" no revocaba el link real. Fix: `archiveCustomerDesign` anula `shareToken`
  (además del filtro `ARCHIVED` de `getSharedDesign`) → el `/d/<token>` compartido deja de resolver.
- **[low]** `window.open` de WhatsApp corría **tras** el `await` del token → iOS Safari bloqueaba el popup
  en el primer compartir. Fix: abrir la ventana **sincrónicamente** en el gesto (`about:blank`, `opener=null`)
  y navegarla al resolver el token.
- **[low]** Carrera en `ensureDesignShareToken` (read-then-write no atómico): dos pestañas generaban tokens
  distintos y una quedaba muerta (link 404). Fix: `updateMany where shareToken:null` (atómico) + re-lectura
  del valor efectivo si se pierde la carrera → idempotencia real.
- **[low]** `getSharedDesign` corría 2×/request (`generateMetadata` + página) sin memoizar. Fix: envolver en
  `cache()` de React en la página (Prisma no se auto-memoiza como `fetch` en Next 16).

**Decisión diferida — imagen pública desacoplada del pedido.** El bucket `design-previews` es **público** y
`Design.previewUrl` es una URL estable. Las 3 vistas de pedido (cliente, confirmación y **producción en
admin**) leen `design.previewUrl` **en vivo**, así que **archivar NO borra la imagen del bucket** (rompería
esas vistas para diseños `USED_IN_ORDER`). Consecuencia: tras archivar, la imagen sigue accesible en su URL
directa para quien ya la tenga (destinatarios del link, caché OG de Meta). Retirar la imagen de verdad exige
**desacoplar el pedido de la imagen del diseño** — snapshotear el preview dentro del `OrderItem` al confirmar
(como ya se hace con `customDesign` = `canvasData`), y solo entonces borrar/rotar el preview del diseño al
archivar; o mover el preview a un bucket privado con signed URLs (afecta también las vistas de pedido).
Es una tarea arquitectónica con su propio alcance, **pendiente de decisión de Lucy** — no un parche dentro
de este feature. Relevante para Ley 1581 (fotos personales). [[ADR-055]].

**Verificación.** `tsc` + `next build` OK (rutas `/d/[token]` y `/mi-cuenta/disenos` registradas) ·
integración compartir 13/13 (IDOR, idempotencia, revocación real, tokens malformados) · suite completa
1666 passed.

## ADR-057 — Estrategia del Estudio: aumentar Konva (no refactorizar) + editor por tipo (2026-07-12)

**Contexto.** Lucy pidió "pensar muy bien" el Estudio (core del negocio) antes de masificar: no solo
visualmente perfecto y fácil de manejar, sino **funcional** (coherente con cada producto — su ejemplo: el
"Abecedario Magnético" muestra una cajita de foto cuando debería ser "escribe un nombre → recibe las
fichas"), y evaluar **desde cero la tecnología**, dispuesta a refactorizar el core si la evidencia lo pedía.

**Investigación.** 3 workflows en paralelo con verificación adversarial (139 agentes), cruzados contra el
código real: (1) estándares de calidad de impresión + UX (105 agentes, fuentes citadas), (2) taxonomía de
personalización por tipo de producto, (3) evaluación de tecnología mantener/aumentar/refactorizar. Detalle
completo en [ESTUDIO_STRATEGY.md](ESTUDIO_STRATEGY.md). Versión visual para Lucy: artifact en claude.ai.

**Decisión.**
1. **AUMENTAR y CONSTRUIR lo nuestro — cero licencias.** El motor Konva/react-konva (MIT/$0, self-host) es la
   fundación correcta — verificado que Polotno (editor comercial tipo-Canva US$899/mo) se construye sobre el
   mismo Konva, mismo autor. Descartadas todas las alternativas de pago (mandato #2) y las open-source de otro
   motor. **Directiva explícita de Lucy (2026-07-12): NO atarnos a pagar una licencia (inviable por costo) —
   construir nuestra propia tecnología sobre Konva hasta tener algo igual o mejor que Polotno.** Polotno queda
   solo como *referencia* de lo que "listo" significa (es replicable a $0 por ser el mismo motor); nunca como
   dependencia ni opción de compra futura. Ver "Meta paridad-o-mejor que Polotno" en ESTUDIO_STRATEGY.md.
2. **Gap #1 (arquitectura):** el archivo de impresión hoy se genera en el celular del cliente
   (`finalizeDesign` solo valida cantidad + sube los PNG del navegador). Riesgo real de degradación/fallo
   silencioso → devolución. Fix de máximo impacto/menor costo ($0, no toca el motor): **render de producción
   en el servidor**. Es la Fase 0 junto con el enrutador.
3. **Gap #2 (funcional):** el Estudio no ramifica por `PersonalizationKind` → aplana ~24 de ~30 productos
   personalizables a "foto+texto"; 3 tipos rotos (TEXT_ONLY, EVENT_FAVOR, BUSINESS_LOGO). Fix: **enrutador
   por tipo + forma de config + variante** hacia 5 superficies (nombre, frase, evento, logo, foto).
4. **Calidad visual:** ya cumplimos/superamos el estándar (300 DPI, validación pre-pago, sangrado). CMYK/PDF
   queda como post-paso server $0 **condicional** a que una imprenta local lo exija (el canal POD global pide
   sRGB, no CMYK). 3D (model-viewer) = bolt-on opcional de baja prioridad.

**Consecuencia.** Plan por fases $0 y sin lock-in (0 fundación → 1 sub-editores+plantillas → 2 CMYK
condicional → 3 3D opcional). La Fase 0 incluye una migración de datos (el discriminador de variante hoy se
descarta en `variant-schemas.ts`), un camino de carrito por variante, y extraer el núcleo del editor para
guardar/finalizar cosas que no son foto. Decisiones de producto pendientes de Lucy (acentos en nombres, año
de calendario, prioridad por ventas reales de IG, limpieza de catálogo) y acción humana: 53 ilustraciones de
letras. **SUPERSEDES** la nota de `DECISIONS.md` que trataba el abecedario como NONE/404 (desactualizada).
[[ADR-056]] [[ADR-013]] [[ADR-035]] [[ADR-037]].
