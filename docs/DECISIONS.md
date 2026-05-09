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

**Contexto:** Auditoría detectó (H4) que `ARCHITECTURE.md` declaraba "Tailwind 4.x" pero los snippets eran sintaxis v3. Se evaluó si bajar a v3 o consolidar en v4. Verificación contra [ui.shadcn.com/docs/tailwind-v4](https://ui.shadcn.com/docs/tailwind-v4) (consultada 2026-05-09) confirmó: *"It's here! Tailwind v4 and React 19. Ready for you to try out. You can start using it today."* Proyectos nuevos arrancan v4 por defecto en shadcn/ui.

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

**Contexto:** Auditoría detectó (H14) que PLAN/INTEGRATIONS mencionaban "Vercel KV o Upstash Free" para rate limit y cache. Verificación contra [vercel.com/docs/redis](https://vercel.com/docs/redis) (consultada 2026-05-09) confirmó que **Vercel KV está deprecado desde diciembre 2024**: *"Vercel KV is no longer available... we automatically moved it to Upstash Redis in December 2024."* Verificación contra [upstash.com/pricing](https://upstash.com/pricing): Upstash Free es 500.000 cmd/mes + 256 MB.

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

**Contexto:** Auditoría detectó (H21) que ROADMAP mencionaba "Cron Vercel" y OPERATIONS hablaba de "cron de reconciliación" sin un sistema concreto. Pregunta del usuario sobre si Supabase Queues podría servir. Verificación contra [supabase.com/docs/guides/queues](https://supabase.com/docs/guides/queues) (consultada 2026-05-09) confirmó que **Supabase Queues** (basado en `pgmq`) es *"Postgres-native durable Message Queue system with guaranteed delivery"* con exactly-once delivery y archivado.

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

**Contexto:** En la auditoría inicial detecté dos errores por suposición: H4 (recomendé bajar Tailwind a v3 sin verificar el estado de shadcn/ui v4) y H5 (marqué la tarjeta `4242 4242 4242 4242` como "de Stripe" sin verificar Wompi docs). El usuario solicitó explícitamente: *"todo debe estar argumentado y no es suposiciones, es decir, todo debe estar basada siempre en la documentacion de la tecnologias correspondientes, y nunca suposiciones"*.

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

**Contexto:** El usuario pidió: *"Toda actualizacion que se vaya realizando deberia trazarse para que CLAUDE siempre sepa en que va"*. Detectado como H17 en la auditoría: ROADMAP, DECISIONS y OPERATIONS-changelog son tres logs paralelos sin convergencia narrativa; no hay un único archivo que responda *"¿qué hizo Claude/yo en la última sesión y dónde estamos parados?"*.

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

> Próximas decisiones a documentar cuando se tomen:
> - ADR-022: alternativa de monitoreo de errores elegida (en Fase 7).
> - ADR-023: criterio de migración Postgres rate-limit → Redis externo.
> - ADR-024: distributed tracing / OpenTelemetry strategy (post-lanzamiento si volumen lo justifica).
> - ADR-025: proveedor de facturación electrónica DIAN (Alegra / Siigo / Facture / otro), antes de Fase 7.
> - ADR-027: necesidad de staging environment (re-evaluar post-lanzamiento).
> - ADR-028: criterio de migración Postgres `FeatureFlag` → GrowthBook u otro (cuando ocurra).
