# QA Checklist pre-launch — Lucams_shop

> Última actualización: 2026-05-12 · Sub-bloque L · verificado contra el código 2026-09-03 (MFA admin obligatorio, checkout en modo full, /rastrear)
>
> Esta checklist se recorre **manualmente con Lucy + Claude** antes del go-live productivo. Es el último filtro: nada se lanza si quedan rojos. Marcar cada item con ✅ / ⚠️ / ❌ y fecha de verificación.

## Cómo usar este documento

1. **Antes del go-live**, abrir una nueva sección al final con la fecha de la corrida
2. Recorrer todos los flujos en orden, marcando estado por item
3. ⚠️ = aceptable pero a mejorar post-launch · ❌ = bloqueante, no se lanza
4. Cada bloqueante encontrado se documenta en `docs/audits/<fecha>-qa-<flujo>.md`

---

## A. Autenticación cliente

- [ ] Signup con email nuevo → recibe OTP de 6 dígitos en menos de 60s
- [ ] OTP correcto → loguea + redirige a /mi-cuenta
- [ ] OTP incorrecto → mensaje claro sin filtrar info
- [ ] Reintentos rate-limited después de 5 fallos
- [ ] Password "123456" rechazada por Pwned Passwords check
- [ ] Email autocomplete sugiere 8 dominios (gmail, hotmail, etc.)
- [ ] Login: caps lock alert aparece si CapsLock está ON
- [ ] Login con credenciales válidas → /mi-cuenta
- [ ] Login con credenciales inválidas → "Credenciales incorrectas" (sin filtrar si el email existe)
- [ ] Recuperar password → recibe OTP (NO link, decisión ADR-030)
- [ ] Restablecer password con confirm field → signOut global automático
- [ ] Logout cierra sesión en TODAS las pestañas (scope: 'global')

## B. Auth admin

- [ ] /admin/login rechaza credenciales no-admin con "Credenciales incorrectas" (anti-enumeration)
- [ ] Admin SIN factor TOTP: tras login → redirect forzado a /admin/seguridad?enroll=required (MFA obligatorio para TODO rol admin, auditoría 2026-08-24 · B-1)
- [ ] Enrolamiento TOTP en /admin/seguridad → muestra 10 códigos de respaldo de 16 caracteres (4 grupos de 4) UNA sola vez
- [ ] Login con MFA: password → reto TOTP en /admin/login/mfa → dashboard (sesión aal2)
- [ ] Código de respaldo válido → entra, marca el código como usado y desactiva el factor TOTP (acceso de emergencia: hay que re-enrolar)
- [ ] Admin logueado: chip "Panel admin" visible en SiteHeader
- [ ] Acceso directo a /admin/\* sin sesión → redirect /admin/login
- [ ] /admin/dashboard muestra las métricas de operación (clientes, pedidos en producción/pendientes, productos, reseñas pendientes, inventario, tickets, garantías)
- [ ] AdminActionLog registra cada acción admin con IP (visible en /admin/auditoria); los logins quedan en logs estructurados (`security.admin_login.*`)

## C. Catálogo público

- [ ] /productos lista los productos activos del canal retail (el canal mayorista queda oculto al público)
- [ ] Las categorías top-level visibles en chips
- [ ] Filtro categoría reduce la lista correctamente
- [ ] Filtro precio (slider) excluye productos fuera del rango
- [ ] Checkbox "Personalizable" muestra solo isPersonalizable=true
- [ ] Checkbox "Con descuento" muestra solo productos con compareAtPrice
- [ ] Checkbox "Destacados" muestra solo isFeatured=true
- [ ] Sort "Precio ↑" / "Precio ↓" ordena correctamente
- [ ] Search "fotoiman" matchea "fotoimanes" (pg_trgm fuzzy + unaccent)
- [ ] Search "calenadrio" (typo) matchea "calendario"
- [ ] Chips de filtros activos × remueve individualmente
- [ ] "Limpiar filtros" resetea al estado inicial
- [ ] Empty state aparece cuando no hay matches
- [ ] Skeleton loader aparece mientras carga en transition
- [ ] Layout sidebar (lg+) / Sheet drawer (móvil) funcionan

## D. PDP (Página de producto)

- [ ] Galería: hero image + 5 thumbnails clicables cambian
- [ ] Click sobre hero abre Lightbox fullscreen
- [ ] Lightbox: ← → arrows + Esc cierra + dots paginator
- [ ] Lightbox: navegación con keyboard funciona
- [ ] "Personalizar" CTA solo visible si isPersonalizable=true
- [ ] "Personalizar" → abre wa.me con mensaje pre-armado contextual
- [ ] "Añadir al carrito" → cart counter sube + toast top-right
- [ ] "Consultar por WhatsApp" → wa.me support
- [ ] Breadcrumb funcional (Tienda > Categoría > Nombre)
- [ ] JSON-LD Product válido en Google Rich Results Test
- [ ] Open Graph genera preview en WhatsApp/Slack/X
- [ ] Productos relacionados aparecen (4 misma categoría o featured)
- [ ] Skeleton durante load

## E. Carrito anon

- [ ] Visitante anónimo agrega producto → cart_session cookie creada
- [ ] Carrito persiste tras refresh
- [ ] +/- buttons actualizan qty
- [ ] Remove product → fila desaparece + total recalcula
- [ ] Subtotal correctamente formateado COP
- [ ] Botón "Ir a pagar" lleva a /checkout/datos (modo full; en modo catálogo el CTA es "Cotizar por WhatsApp")
- [ ] Empty state cuando cart está vacío
- [ ] Merge anon → customer cart al login (sum qty por variantId)
- [ ] Toast "Agregado al carrito ✨" con CTA "Ver carrito"
- [ ] Cart icon header con badge muestra count correcto

## E2. Checkout + pedido (modo full)

- [ ] /checkout/datos → /checkout/envio → /checkout/pago completan con datos válidos
- [ ] Pago Wompi sandbox aprobado → webhook confirma → orden PAID + email de confirmación
- [ ] Pago COD (contraentrega) → orden queda PENDING_PAYMENT con ledger COD para conciliar al entregar
- [ ] /checkout/gracias?id=TX_ID muestra confirmación con número de pedido (el estado se verifica contra Wompi, no contra el query param)
- [ ] /rastrear (invitado, sin cuenta): número de pedido + correo → vista pública /pedido/<token> con estado, timeline y guía
- [ ] /rastrear con datos que no cruzan → error genérico anti-enumeración (no revela si el pedido o el correo existen)

## F. Newsletter

- [ ] Form footer acepta email válido
- [ ] Checkbox consent OBLIGATORIO (Ley 1581)
- [ ] Submit → toast success "¡Suscrito! ✨"
- [ ] Email "Welcome" llega a inbox en < 60s
- [ ] Resuscripción del mismo email → "Ya estabas suscrito"
- [ ] Email inválido rechazado en Zod
- [ ] Rate-limit: 5/h por IP, 2/h por email
- [ ] Turnstile widget visible (cuando keys configuradas)
- [ ] Consent table tiene 1 fila con scope=NEWSLETTER + version

## G. Contacto

- [ ] Form acepta name + email + subject (6 opciones) + message ≥10 chars
- [ ] Submit válido → SupportTicket en DB + 2 emails (received al cliente + internal a hola@)
- [ ] Toast success con Ticket ID corto
- [ ] Rate-limit: 5/día IP + 3/día email
- [ ] Email "received" llega al cliente con su mensaje
- [ ] Email "internal" llega a hola@lucamsshop.com con Reply-To al cliente
- [ ] Turnstile widget cargado
- [ ] WhatsApp CTA prominente como alternativa
- [ ] Email + horario visible en columna izquierda

## H. Cookies banner Ley 1581

- [ ] Visitante en incógnito: banner aparece bottom
- [ ] 3 botones: "Solo necesarias" / "Personalizar" / "Aceptar todas"
- [ ] "Solo necesarias" → cookie persiste + 4 filas Consent (functional/analytics/marketing all false)
- [ ] "Aceptar todas" → cookie persiste + 4 filas Consent all true
- [ ] "Personalizar" → modal con 4 switches
- [ ] Switch "Necesarias" locked-on (no se puede desactivar)
- [ ] Refresh → banner NO vuelve a aparecer
- [ ] /legal/cookies muestra tabla cookies + link "Abrir preferencias"
- [ ] "Abrir preferencias" reabre el modal

## I. Páginas legales

- [ ] 8 páginas /legal/\* cargan sin 500
- [ ] /legal/privacidad menciona Ley 1581 explícitamente
- [ ] /legal/terminos menciona Ley 1480 + retracto + garantía
- [ ] /legal/cookies tabla con cookies reales del sitio
- [ ] /legal/devoluciones plazos correctos (5 días hábiles)
- [ ] /legal/garantias menciona 1 año Ley 1480 art. 11
- [ ] /legal/habeas-data 6 derechos + proceso para ejercerlos
- [ ] /legal/subprocesadores tabla actual + DPA links válidos
- [ ] /legal/security email security@ + scope
- [ ] **Cada página fue revisada por abogado colombiano antes del launch** ⚠️

## J. CMS + Visual In-Place Editor

- [ ] Admin logueada ve botón "✏️ Editar este sitio" bottom-right
- [ ] Toggle activa modo edición → lapicito + outline en cada texto editable
- [ ] Hover sobre texto → outline más fuerte + badge con key
- [ ] Click → modal con textarea + preview live
- [ ] "Publicar" → cambio visible inmediatamente (updateTag invalidación)
- [ ] Click sobre key que NO existe → modal abre con texto actual prepopulated + badge "🆕 Nuevo"
- [ ] Welcome onboarding aparece primera vez que se activa
- [ ] Visitante anónimo: NO carga JS extra del visual editor
- [ ] /admin/contenido sigue funcionando como back office
- [ ] Versionado: cada save crea CmsBlockVersion
- [ ] Revertir a versión X funciona desde /admin/contenido/bloques/[id]
- [ ] Settings inline edit en /admin/contenido/configuracion

## K. Admin CRUD

- [ ] /admin/productos listado paginado + búsqueda
- [ ] Crear producto: form Zod válido + redirect listado + AdminActionLog
- [ ] Edit producto: form prellena + save crea AdminActionLog
- [ ] Archivar producto: soft-delete, no se ve en /productos público
- [ ] /admin/categorias mismo CRUD
- [ ] /admin/auditoria muestra eventos con filtros funcionando
- [ ] Paginación 30/page funcional
- [ ] Filtro action prefix "cms.block" matchea variantes

## L. SEO técnico

- [ ] /sitemap.xml válido en Google Search Console
- [ ] /robots.txt con Disallow /admin /api /mi-cuenta /\_next
- [ ] /manifest.webmanifest se descarga 200
- [ ] PDP JSON-LD Product válido en https://search.google.com/test/rich-results
- [ ] Open Graph en home + PDP genera preview correcto
- [ ] Twitter Cards summary_large_image
- [ ] canonical alternate en PDPs

## M. Accesibilidad WCAG 2.1 AA

- [ ] axe-core: cero violaciones críticas en home / /productos / PDP / cart
- [ ] Keyboard navigation: Tab recorre logical order
- [ ] Esc cierra modales (lightbox PDP, inline editor, cookies modal)
- [ ] Enter activa botones focused
- [ ] Focus visible (sin outline:none sin reemplazo)
- [ ] aria-labels en botones icon-only (trash, expand, etc.)
- [ ] alt text en todas las imágenes (productos, mascote, logos)
- [ ] Contrast ratios AA en pares texto/fondo brand
- [ ] Skip-to-content link "Saltar al contenido" → salta al `<main id="contenido">` (implementado — verificar con Tab)
- [ ] Screen reader smoke test (NVDA/VoiceOver) en /productos + PDP

## N. Performance Lighthouse

- [ ] Desktop ≥ 95 en /
- [ ] Desktop ≥ 95 en /productos
- [ ] Desktop ≥ 95 en /producto/[slug]
- [ ] Desktop ≥ 95 en /carrito
- [ ] Móvil ≥ 90 en mismos endpoints
- [ ] LCP < 2.5s
- [ ] CLS < 0.1
- [ ] INP < 200ms
- [ ] Bundle JS inicial < 150KB gzipped en home

## O. Cross-browser

- [ ] Chrome 130+ desktop: golden path completo
- [ ] Firefox 130+ desktop: idem
- [ ] Safari 18 desktop: idem
- [ ] Edge 130+ desktop: idem
- [ ] Chrome Android: golden path + Sheet drawer móvil + Turnstile
- [ ] Safari iOS 18: idem
- [ ] Touch targets ≥ 44×44px en mobile
- [ ] Sin horizontal scroll en breakpoints 375/414/768/1024
- [ ] Inputs no trigger zoom iOS (font-size ≥ 16px)

## P. Load testing

- [ ] k6: 50 usuarios concurrentes navegando catálogo
- [ ] p95 < 500ms en /productos
- [ ] p95 < 300ms en /api/cms/blocks
- [ ] p95 < 200ms en /api/health/db
- [ ] Sin 5xx bajo 50 RPS sostenido por 5 min
- [ ] Script en `tests/load/storefront-browsing.js`

## Q. Security

- [ ] `npm audit --production` cero high/critical
- [ ] gitleaks --redact --no-banner detect → cero secrets en historial
- [ ] securityheaders.com en lucamsshop.com → A+
- [ ] SSL Labs en lucamsshop.com → A+ (HSTS preload + TLS 1.3 only)
- [ ] CSP estricta sin 'unsafe-inline' donde sea posible
- [ ] Pentest manual: SQLi en search bar
- [ ] Pentest manual: XSS reflected en query params
- [ ] Pentest manual: CSRF en mutaciones (Server Actions inmunes por SameSite=Lax)
- [ ] Probar admin con cookie de cliente no-admin → 403/redirect
- [ ] /api/admin/\* sin auth → 403

## R. Email deliverability

- [ ] DKIM record en DNS verificado MXToolbox
- [ ] SPF record `v=spf1 include:resend.com ~all`
- [ ] DMARC record `v=DMARC1; p=quarantine`
- [ ] mail-tester.com score ≥ 9/10 desde EMAIL_FROM productivo
- [ ] Welcome email llega a Gmail inbox (no spam)
- [ ] Welcome email llega a Outlook web inbox (no spam)
- [ ] Welcome email renderea correctamente en Apple Mail
- [ ] Resend webhook recibe email.delivered (verificar EmailEvent table)
- [ ] Forzar bounce (email inválido) → EmailEvent type=email.bounced

## S. Backup + DR

- [ ] Supabase Pro PITR activo (point-in-time recovery)
- [ ] DR drill: restaurar snapshot a proyecto de prueba
- [ ] Documentar tiempo recovery en docs/audits/<fecha>-dr-drill.md
- [ ] Target < 30 min

## T. Compliance Colombia final

- [ ] Aviso de privacidad revisado por abogado colombiano
- [ ] Términos y condiciones revisados por abogado
- [ ] Política de cookies con tabla real cookies usadas (verificar DevTools)
- [ ] Subprocesadores actualizado con conectados realmente
- [ ] DIAN-readiness validado con proveedor de facturación electrónica
- [ ] Formulario hábeas data testeado end-to-end
- [ ] SIC reclamo workflow documentado

---

## Corridas históricas

### Corrida YYYY-MM-DD — pre-launch v1

> Plantilla para llenar la primera corrida real:
>
> - Responsable: Lucy + Claude
> - Items verdes: X/Y
> - Items amarillos: lista
> - Bloqueantes encontrados (`docs/audits/<fecha>-...`):
>   - ...
> - **Decisión**: GO / NO-GO

_Sin corridas todavía. La primera ocurre antes del go-live productivo._
