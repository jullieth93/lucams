Tengo suficiente para producir el reporte. Resumen rápido del scan:

- Resend: cliente bien implementado (retry, circuit breaker, idempotency)
- Templates HTML inline (no react-email, decisión J documentada)
- Emails order-* y newsletter-welcome y support-* implementados y cableados
- `EMAIL_FROM` default es `onboarding@resend.dev` (sandbox) → dominio NO verificado
- Banner cookies con 4 switches + DB audit OK
- 8 legal pages con CmsMarkdown OK, pero fallbacks de privacidad/terminos son stub ("documento en revisión legal — versión final próximamente")
- Voseo extensivo en code paths user-facing: order-delivered.ts, contact-form, ayuda, mi-cuenta, checkout/gracias, etc.
- Newsletter welcome email → link `/unsubscribe?token=...` pero la ruta NO existe = Ley 1581 violación (no se puede revocar consentimiento)
- Site-header no tiene mobile nav real, solo el mega-menú dropdown tiene Sheet
- No hay loading.tsx en home (ya es force-dynamic OK), pero check faltan otras rutas
- Site-footer asume DB available (lista categorías SSR — riesgo si DB down)
- `app/(maintenance)` redirect no probado
- Verificación de firma Resend webhook OK
- Empty states sin folder dedicado pero patrón mascote+CMS está aplicado consistentemente
- `prefers-reduced-motion` respetado en brand-mark, hero, reveal-on-scroll
- Voseo en CmsBlock fallback en seed-cms.mjs probablemente también
- No hay verificación dominio mail.lucamsshop.co (todo en sandbox `resend.dev` con límite 3K/mo y `onboarding@resend.dev`)

# Dimensión: EMAILS + LEGAL + COMPLIANCE + FRONTEND UX + MOBILE

## Estado actual real

El cliente Resend (`apps/web/lib/resend.ts:1-173`) está bien implementado (retry exponencial, circuit breaker in-memory, idempotency-key support, dev-stub sin API key). Hay 7 templates HTML inline en `features/emails/templates/*.ts` (no react-email, por decisión J documentada) y están cableados a la saga de orders, newsletter, y support tickets (`features/orders/emails.ts`, `features/newsletter/actions.ts`, `features/support/actions.ts`). El default `EMAIL_FROM` es `Lucams_shop <onboarding@resend.dev>` (sandbox, sin dominio verificado), lo que confirma el bug reportado: cliente NO recibe emails en producción. Las 8 páginas legales existen y usan `CmsMarkdown` con fallback hardcoded; el seed `packages/db/scripts/seed-cms.mjs` y `update-legal-ley-2439.mjs` ya inyectan copy real en DB. Banner de cookies con 4 switches granulares y audit `Consent` en DB está completo (`components/cookies-banner.tsx:52-213`, `features/consent/service.ts`). Webhook Resend con verificación HMAC implementado (`app/api/webhooks/resend/route.ts:44-66`). Hay voseo persistente en code paths user-facing que viola el mandato es-CO tuteo.

## Fortalezas

- `lib/resend.ts` es robusto: retry 3x con backoff exponencial (1s/2s/4s), circuit breaker que se abre a >50% fail rate, dedupe vía `Idempotency-Key`, timeout 15s, dev-stub limpio.
- Saga de orders cablea los 4 emails (`sendOrderConfirmation/Shipped/PaymentFailed/Delivered`) en transiciones PAID, SHIPPED, DELIVERED, CANCELLED — con try/catch interno que NO rompe la saga si email falla.
- Webhook Resend implementa verificación svix-signature timing-safe + persistencia idempotente vía `upsert` por `resendId` en `EmailEvent`.
- 8 páginas legales montadas con `CmsMarkdown` editable desde admin, todas linkeadas en footer (`components/site-footer.tsx:26-35`).
- Banner Ley 1581 con 4 scopes (necessary/functional/analytics/marketing), audit trail en `Consent` con IP/UA/version del aviso, `CookiesReopenLink` reusable.
- `respeta prefers-reduced-motion` con `motion-safe:` Tailwind + `matchMedia` check en `Reveal` (`components/reveal-on-scroll.tsx:36`, `app/globals.css:266`).
- Templates incluyen siempre `text` fallback + `preview` text + footer con CTA WhatsApp y unsubscribe condicional (deliverability + Ley 1581).
- Templates de orders usan `idempotencyKey` único por evento (`${orderNumber}-confirmation`, etc.) — Resend dedupe si saga corre dos veces.
- `/status` ya consume `/api/health/db|storage|resend` con dots verde/rojo/pendiente, decente para PSP/clientes que dudan.
- Mega-menú tiene desktop `NavigationMenu` + mobile `Sheet` drawer con acordeón (`components/shop-mega-menu.tsx:64-105`).

## Debilidades

- **EMAIL_FROM en sandbox `onboarding@resend.dev`** sin dominio `mail.lucamsshop.co` verificado → Resend solo permite enviar al owner de la cuenta o domain verified; clientes externos NO reciben emails (confirmado en INTEGRATIONS.md:313).
- Ruta `/unsubscribe?token=...` linkeada en `newsletter-welcome.ts:18` y en footer de emails con unsubscribeUrl NO existe — link roto. **Ley 1581 violación**: el titular no puede revocar consentimiento por el medio prometido.
- Voseo extensivo en code paths user-facing (debería ser tuteo según memory): `ayuda/page.tsx:47,71` ("desde que confirmás", "nos pasás"), `order-delivered.ts:23,24,33` ("nos contás", "a vos", "Respondé"), `contacto/page.tsx:73` ("Hablanos"), `contact-form.tsx:128` ("Contanos"), `mi-cuenta/pedidos/[number]/page.tsx:163` ("tenés", "escribinos", "respondé"), `checkout/gracias/page.tsx:225` ("Podés", "querés").
- Fallback hardcoded de `legal/privacidad/page.tsx:10-14` y `legal/terminos/page.tsx:9-11` dice **"Documento en revisión legal — versión final próximamente"**: si el seed CMS no se corrió en prod, los visitantes ven texto stub legalmente insuficiente.
- `site-header.tsx` carece de mobile nav coherente: muestra `ShopMegaMenu` (Sheet propio) pero `Catálogo`, "¿Te ayudamos?", "Hola, Nombre", "Salir", "Ingresar", "Crear cuenta" están con `hidden sm:inline` → en móvil la sesión usuaria queda invisible/inaccesible (solo carrito + mega-menú).
- `EmailEvent.process_failed` route resend devuelve 200 con `{ ok: false }` (`route.ts:127-134`) para evitar reintentos infinitos — semánticamente correcto, pero pierde la oportunidad de retry transient (network glitch al hacer upsert).
- No hay seed verificable de `RESEND_WEBHOOK_SECRET` en docs operativos — código requiere secret en prod o rechaza (`route.ts:44-52`); si Lucy no la configura en Vercel, el webhook se cae 401.
- `features/newsletter/service.ts:48-57` hace soft-fail si `RESEND_API_KEY` no está y devuelve `ok: true` al usuario aunque solo persistió Consent (no subscriber en Resend ni email de bienvenida). Cliente cree que está suscrito.
- Skeletons solo presentes en `productos/loading.tsx` y `producto/[slug]/loading.tsx`. Home, ayuda, contacto, mi-cuenta, legal/* NO tienen loading.tsx → tablazo blanco en SSR slow.
- `legal/layout.tsx` usa `prose-headings:font-display` pero `CmsMarkdown` renderea inside `<div className="cms-markdown">` (no `<article>`) → CSS `prose` no aplica a markdown sanitizado.
- `legal/cookies/page.tsx` y FAQs detallan 5 días hábiles de retracto pero **Ley 2439 de 2024** cambió a 15 días calendario (el script `update-legal-ley-2439.mjs` existe pero solo actualiza CMS DB — el fallback hardcoded en `devoluciones/page.tsx:11` aún dice "5 días hábiles").
- No existe carpeta `components/empty-states/` ni `components/skeletons/` — los empty states están inline en cada página, sin reuso ni testing.
- `app/maintenance/page.tsx` documenta que el proxy gate "vive en proxy.ts (sub-bloque F lo cablea para redirect)" pero el comentario es un TODO — no verificado si el modo mantenimiento realmente bloquea routes.
- `subprocesadores/page.tsx` lista "Venndelo / Coordinadora" pero el README/STATE actual dice que se migró a Aveonline (drift).
- Header tiene `getCurrentAdmin()` para mostrar chip "Panel admin" en cada page load del storefront — query potencialmente caro en hot path SSR sin cache.

## Findings detallados

### [P0] EMAIL-001 — `EMAIL_FROM` en sandbox `onboarding@resend.dev` rompe entrega a clientes
- **Categoría**: bug
- **Evidencia**: `apps/web/lib/resend.ts:112` (`const fromDefault = process.env.EMAIL_FROM ?? "Lucams_shop <onboarding@resend.dev>"`), `docs/INTEGRATIONS.md:313` documenta que Resend sandbox solo envía a owner de la cuenta.
- **Impacto**: ningún cliente recibe email transaccional (confirmación pago, despacho, entrega, payment-failed) — todos los flujos post-checkout fallan silenciosamente. La saga sigue funcionando pero el cliente queda a ciegas.
- **Recomendación**: verificar `mail.lucamsshop.co` en Resend (SPF + DKIM + DMARC según `INTEGRATIONS.md:323`), setear `EMAIL_FROM=Lucams_shop <hola@mail.lucamsshop.co>` en Vercel prod env, validar con mail-tester.com ≥ 9/10. Mientras tanto NO lanzar.
- **Horas estimadas**: 2
- **Acción humana Lucy**: **ACCIÓN HUMANA REQUERIDA:** comprar/configurar subdominio `mail.lucamsshop.co`, agregar registros DNS (SPF/DKIM/DMARC), verificar dominio en dashboard Resend, setear `EMAIL_FROM` en Vercel env prod.

### [P0] EMAIL-002 — Ruta `/unsubscribe` no existe pero el welcome email la enlaza (viola Ley 1581)
- **Categoría**: bug
- **Evidencia**: `apps/web/features/emails/templates/newsletter-welcome.ts:18` construye `${siteUrl}/unsubscribe?token=...`; `find apps/web/app/unsubscribe` no devuelve nada.
- **Impacto**: el titular del dato no puede revocar el consentimiento por el canal prometido en el email. Ley 1581 art. 8 lit. d obliga a permitir revocar autorización. SIC puede multar. Además dañan la reputación de envío (filtros spam castigan emails con unsubscribe roto).
- **Recomendación**: crear `app/unsubscribe/page.tsx` que consume token (sha256 del email + secret), valida HMAC, llama `DELETE /contacts` en Resend + crea fila `Consent { scope:NEWSLETTER, accepted:false, revokedAt }`. Render confirmación + opción re-suscribir.
- **Horas estimadas**: 3
- **Acción humana Lucy**: ninguna

### [P0] LEGAL-001 — Fallbacks hardcoded de privacidad/términos son stubs legalmente insuficientes
- **Categoría**: risk
- **Evidencia**: `apps/web/app/legal/privacidad/page.tsx:10-14` ("Este es el aviso de privacidad versión 1. Estamos puliendo el documento final con asesoría legal."); `legal/terminos/page.tsx:9-11` ("Documento en revisión legal — versión final próximamente.").
- **Impacto**: si en prod la DB no tiene `legal.privacidad`/`legal.terminos` seedeados (o se rompió el seed), el sitio publica texto que no cumple Ley 1581/1480 — un click de cliente y screenshot basta para queja SIC.
- **Recomendación**: 1) confirmar que `seed-cms.mjs` + `update-legal-ley-2439.mjs` se corrieron contra prod DB tras último deploy; 2) reemplazar los `FALLBACK` por el texto largo real (mismo que el seed mete en CmsBlock) para que el fallback sea legalmente válido aunque DB falle.
- **Horas estimadas**: 2
- **Acción humana Lucy**: validar con abogado (mandato CLAUDE.md §1 productive) antes de cierre prod.

### [P0] LEGAL-002 — Plazo de retracto del fallback no actualizado a Ley 2439/2024 (15 días calendario)
- **Categoría**: docs-drift
- **Evidencia**: `apps/web/app/legal/devoluciones/page.tsx:11` dice "5 días hábiles"; `apps/web/app/ayuda/page.tsx:65` dice "5 días hábiles desde la entrega"; el script `packages/db/scripts/update-legal-ley-2439.mjs:23-24` documenta el cambio "30 días hábiles → 15 días calendario" pero solo actualiza CmsBlock. Si DB falla, el fallback sigue obsoleto.
- **Impacto**: cliente que retracta entre el día 6-15 calendario puede argumentar Ley 2439 y exigir reembolso; sitio mostraría término inválido y la SIC sanciona por información engañosa al consumidor.
- **Recomendación**: actualizar fallbacks hardcoded en los 8 páginas legales para reflejar Ley 2439/2024; agregar test de coherencia (CmsBlock body coincide con fallback).
- **Horas estimadas**: 1
- **Acción humana Lucy**: ninguna

### [P1] UX-001 — Voseo persistente en code paths user-facing viola mandato es-CO tuteo
- **Categoría**: bug
- **Evidencia**: `app/contacto/contact-form.tsx:128` ("Contanos"), `app/contacto/page.tsx:73` ("Hablanos"), `app/ayuda/page.tsx:47` ("confirmás"), `:71` ("pasás"), `features/emails/templates/order-delivered.ts:23,24,33` ("nos contás", "a vos", "Respondé"), `app/mi-cuenta/pedidos/[number]/page.tsx:163` ("tenés", "escribinos", "respondé"), `app/checkout/gracias/page.tsx:225` ("Podés", "querés"), `app/admin/(panel)/finanzas/page.tsx:92` ("avisame"), `app/admin/(panel)/integraciones/page.tsx:325` ("tenés"), `app/checkout/datos/datos-form.tsx:341` ("querés"), `app/checkout/datos/actions.ts:108` ("querés", "completá").
- **Impacto**: rompe consistencia de marca (memory `feedback_es_co_tuteo_no_voseo`); cliente colombiano percibe el tono como argentino/uruguayo, no familiar. Templates de email son particularmente visibles porque van a cada cliente que paga.
- **Recomendación**: barrido global con regex `\b(contás|contanos|hablanos|tenés|querés|podés|hacés|elegís|personalizás|confirmás|pasás|completá|avisame|respondé|escribinos|estás|vos)\b` y reemplazo manual contextual. Agregar lint rule `no-voseo` (regex en eslint-plugin-spanish) para CI.
- **Horas estimadas**: 4
- **Acción humana Lucy**: ninguna

### [P1] UX-002 — Site-header sin mobile nav real (sesión usuaria invisible en móvil)
- **Categoría**: gap
- **Evidencia**: `apps/web/components/site-header.tsx:43-114` — `Catálogo`, "¿Te ayudamos?", "Hola, nombre", "Salir", "Ingresar", "Crear cuenta", "Panel admin" todos con `hidden sm:inline`. En móvil solo queda BrandMark + ShopMegaMenu + Search + Carrito.
- **Impacto**: cliente en móvil (mayoría del tráfico Colombia) no puede logout, ver "Hola Nombre", ir a "Mi cuenta", ni siquiera ver "Ingresar/Crear cuenta". 100% el carrito sigue funcionando pero el resto es invisible. Bloquea conversión repetida y login flow.
- **Recomendación**: agregar hamburger `Menu` icon visible `sm:hidden` que abre `Sheet` lateral con: links principales (Catálogo, Recomendador, Mi cuenta/Pedidos, Ayuda, Contacto, Logout/Login). Reutilizar el patrón ya implementado en `ShopMegaMenu` mobile.
- **Horas estimadas**: 3
- **Acción humana Lucy**: ninguna

### [P1] EMAIL-003 — Newsletter soft-fail oculta error al usuario y promete inscripción que no ocurrió
- **Categoría**: bug
- **Evidencia**: `apps/web/features/newsletter/service.ts:48-57` — si `RESEND_API_KEY` no está, persiste Consent y devuelve `ok: true, alreadySubscribed: false` al usuario; el form muestra "¡Listo!" — pero el contacto NO se creó en Resend ni se mandó welcome.
- **Impacto**: usuario cree estar suscrito; cuando Lucy configure Resend más tarde, el `Consent` previo no se sincroniza automáticamente (el comentario del archivo dice "se pueden re-sincronizar desde el Consent table" pero no hay script para hacerlo).
- **Recomendación**: en prod, si `RESEND_API_KEY` falta → loguear error crítico, devolver `ok: false, message: "Servicio temporal no disponible, reintenta en unos minutos"`. Cron de reconciliación que re-sincroniza Consents huérfanos a Resend cuando vuelve a configurarse.
- **Horas estimadas**: 2
- **Acción humana Lucy**: ninguna

### [P1] LEGAL-003 — Subprocesadores lista "Venndelo/Coordinadora" pero el sistema migró a Aveonline
- **Categoría**: docs-drift
- **Evidencia**: `apps/web/app/legal/subprocesadores/page.tsx:17` "Venndelo / Coordinadora". El contexto inicial dice "Aveonline real: 4 carriers cotizan, generarGuia2..."
- **Impacto**: la lista de subprocesadores debe ser exacta para Ley 1581 (notificación 30 días previo a sumar/cambiar uno). Si Aveonline no aparece, el cliente no sabe que sus datos van a una empresa adicional → posible reclamo SIC.
- **Recomendación**: actualizar tanto el fallback en `apps/web/app/legal/subprocesadores/page.tsx` como el CmsBlock seed para listar Aveonline (no Venndelo). Mantener Coordinadora si Aveonline subcontrata a Coordinadora como carrier.
- **Horas estimadas**: 0.5
- **Acción humana Lucy**: confirmar el DPA con Aveonline antes de lanzar.

### [P1] EMAIL-004 — Resend webhook secret no documentado como required en runbook prod
- **Categoría**: risk
- **Evidencia**: `apps/web/app/api/webhooks/resend/route.ts:46-52` rechaza con 401 en prod sin `RESEND_WEBHOOK_SECRET`. `grep RESEND_WEBHOOK_SECRET docs/OPERATIONS.md` → no aparece en el setup checklist.
- **Impacto**: si Lucy hace deploy a prod sin la secret, el webhook de Resend rebota 401 → no se persiste `EmailEvent` → admin no ve bounces/spam complaints → reputación de envío baja gradualmente sin detección.
- **Recomendación**: agregar `RESEND_WEBHOOK_SECRET` a `OPERATIONS.md` env table como required prod; agregar check al script de pre-deploy.
- **Horas estimadas**: 0.5
- **Acción humana Lucy**: setear en Vercel env tras configurar webhook en dashboard Resend.

### [P2] UX-003 — Falta loading.tsx en rutas críticas (home, ayuda, contacto, mi-cuenta, legal)
- **Categoría**: improvement
- **Evidencia**: `find apps/web/app -name loading.tsx` solo devuelve 2 resultados (productos, producto/[slug]). Home tiene `force-dynamic`, SSR DB → tablazo blanco mientras espera.
- **Impacto**: percepción de lentitud en cold-start (Vercel serverless cold + DB Supabase wake-up puede pasar 1-3s). LCP afectado.
- **Recomendación**: agregar `loading.tsx` con skeleton brand-purple-cream en home, ayuda, contacto, mi-cuenta, legal/* layout. Crear `components/skeletons/{home,legal,account}.tsx` reusables.
- **Horas estimadas**: 3
- **Acción humana Lucy**: ninguna

### [P2] UX-004 — `legal/layout.tsx` aplica clase `.prose` pero `CmsMarkdown` no genera elementos `<article>`
- **Categoría**: bug
- **Evidencia**: `apps/web/app/legal/layout.tsx:17-19` envuelve children en `<article className="prose prose-headings:font-display ..."`. `apps/web/components/cms/cms-markdown.tsx:30` renderea `<div className="cms-markdown">`. Tailwind plugin `@tailwindcss/typography` styliza `.prose >` directos — los `<h1>/<p>` quedan dentro de un `<div>` extra.
- **Impacto**: estilo `prose` se aplica al wrapper pero los headings markdown no reciben `font-display`, los links no reciben `text-brand-purple` — el styling brand no aplica a la página legal.
- **Recomendación**: remover el `<div className="cms-markdown">` o cambiar layout a `prose-not-applied` + estilos custom, o usar `prose` directo en CmsMarkdown. Verificar visual en `/legal/habeas-data`.
- **Horas estimadas**: 1
- **Acción humana Lucy**: validar visualmente.

### [P2] UX-005 — Site-header consulta `getCurrentAdmin()` en cada SSR del storefront
- **Categoría**: tech-debt
- **Evidencia**: `apps/web/components/site-header.tsx:28-33` — `getCurrentAdmin()` se llama en cada page load del storefront para mostrar chip "Panel admin". Es un query Prisma sobre `AdminUser` que no se cachea.
- **Impacto**: ~5-15ms por request, no crítico pero acumula latencia + load DB innecesario para usuarios anónimos (99% del tráfico).
- **Recomendación**: pasar el admin chip a un client component condicional `<AdminChip />` que consume `/api/me/admin` con SWR/cache, o usar `React.cache()` para evitar duplicar la query si ya la hizo otro componente.
- **Horas estimadas**: 1
- **Acción humana Lucy**: ninguna

### [P2] EMAIL-005 — Templates de email duplican `escapeHtml` en cada archivo
- **Categoría**: tech-debt
- **Evidencia**: `escapeHtml` se exporta de `layout.ts:78` pero cada template (order-confirmation.ts:99, order-shipped.ts:68, order-delivered.ts:57, order-payment-failed.ts) tiene su propia copia local. DRY violation.
- **Impacto**: cambiar la lógica de escape (ej. agregar `'`) requiere edits en 5+ lugares; alta probabilidad de bug por desincronización.
- **Recomendación**: importar `escapeHtml` desde `../layout` en cada template, borrar las locales.
- **Horas estimadas**: 0.5
- **Acción humana Lucy**: ninguna

### [P2] LEGAL-004 — `subprocesadores` no menciona Cloudflare Turnstile en lista visible pero ya está activo
- **Categoría**: docs-drift
- **Evidencia**: `apps/web/app/legal/subprocesadores/page.tsx:18` sí lista Cloudflare, pero el seed CMS y los textos del banner cookies no mencionan que Turnstile recolecta IP del usuario para anti-bot — está activo en `contact-form.tsx:137`.
- **Impacto**: Ley 1581 obliga a informar el propósito del tratamiento por cada subprocesador antes de recolección.
- **Recomendación**: confirmar que el seed efectivamente publica la fila Cloudflare; agregar al banner de cookies categoría "Necesarias" texto "Cloudflare Turnstile (anti-bot)".
- **Horas estimadas**: 0.5
- **Acción humana Lucy**: revisar con abogado el DPA Cloudflare.

### [P2] UX-006 — `.well-known/security.txt` mencionado pero no existe
- **Categoría**: gap
- **Evidencia**: `apps/web/app/legal/security/page.tsx:33` linkea `/.well-known/security.txt`. `find apps/web/public -name "security.txt"` → vacío.
- **Impacto**: link 404 desde la página de seguridad; investigadores que sigan RFC 9116 no encuentran contacto formal. Imagen de seriedad de seguridad afectada.
- **Recomendación**: crear `apps/web/public/.well-known/security.txt` con `Contact: mailto:security@lucamsshop.co`, `Expires: 2027-01-01T00:00:00.000Z`, `Preferred-Languages: es, en`.
- **Horas estimadas**: 0.25
- **Acción humana Lucy**: ninguna

### [P3] UX-007 — Empty states sin folder dedicado, sin reuso
- **Categoría**: improvement
- **Evidencia**: empty states están inline en cada page (mi-cuenta/pedidos:94-116, app/page.tsx:158-170, etc.). No hay `components/empty-states/`.
- **Impacto**: alto trabajo cambiar copy/diseño consistente; cada page repite mascote+CTA+CmsText.
- **Recomendación**: crear `components/empty-states/{EmptyOrders, EmptyCatalog, EmptyReviews, EmptyCart}.tsx` reusables que toman `cmsBlockKey` + `cta`.
- **Horas estimadas**: 2
- **Acción humana Lucy**: ninguna

### [P3] UX-008 — `/maintenance` redirect no verificado (proxy.ts comentario TODO)
- **Categoría**: stub
- **Evidencia**: `apps/web/app/maintenance/page.tsx:5-7` comentario "El gate vive en proxy.ts (sub-bloque F lo cablea)". No se sabe si efectivamente está cableado.
- **Impacto**: si `NEXT_PUBLIC_MAINTENANCE_MODE=1` no redirige, no hay manera de "apagar" el sitio para un mantenimiento legítimo sin desplegar.
- **Recomendación**: revisar `proxy.ts` (Next 16 usa `proxy.ts` no `middleware.ts`) y confirmar el gate. Si no existe, implementar.
- **Horas estimadas**: 1.5
- **Acción humana Lucy**: ninguna

### [P3] EMAIL-006 — Webhook Resend devuelve 200 con `ok:false` incluso si falla la upsert, sin retry
- **Categoría**: improvement
- **Evidencia**: `apps/web/app/api/webhooks/resend/route.ts:127-134` — captura error y devuelve `Response.json({ ok: false }, { status: 200 })`. Resend no reintenta.
- **Impacto**: si DB tuvo glitch transient, perdemos el evento (bounce/complaint) y la reputación no se mide.
- **Recomendación**: solo devolver 200 para errores no-retryable (validación). Para errores DB devolver 500 — Resend reintenta hasta 3 veces con backoff.
- **Horas estimadas**: 0.5
- **Acción humana Lucy**: ninguna

## Resumen final

La capa de emails y consent management está sólidamente construida pero **bloqueada por dos issues P0 que impiden lanzamiento productivo**: `EMAIL_FROM` sigue en sandbox `onboarding@resend.dev` (clientes no reciben nada) y la ruta `/unsubscribe` enlazada en el welcome email no existe (viola Ley 1581 directamente). Los 8 documentos legales tienen estructura correcta con CMS editable, pero los fallbacks hardcoded de privacidad/términos son stubs legalmente insuficientes y el plazo de retracto del fallback no refleja la Ley 2439/2024. El frontend UX tiene voseo extensivo (incluso en templates de email que van a cada cliente que paga) y el site-header carece de mobile nav real para usuarias logueadas — gap mayor para conversión móvil colombiana. Resolver los 4 P0 + UX-001/002 antes de lanzar, dejar el resto como deuda controlada post-launch.