# QA Checklist pre-launch — Lucams_shop

> Última actualización: 2026-10-20 · jornada de maduración integral fases 1-6 (ADR-155…160 + reescrituras de ADR-137/140/152: ledger Wompi por intento, identidad de sesión en checkout/carrito, concurrencia `clientRev`, lettersets multi-set, prediseñados con destino explícito, «Listo» único, retomador de borradores endurecido, checkbox tributario oculto tras flag) · antes: 2026-10-13 · jornada de maduración UX (ADR-150…154: preview paginado unificado en gracias/carrito/pedidos, bottom-sheet de estilo móvil + «Listo», ciclo de vida de borradores, módulo admin `/admin/carritos`, auditoría responsive 6 perfiles) · antes: 2026-09-12 · Sub-bloque L · verificado contra el código 2026-09-12 (remediación 360°: CTA Personalizar → Estudio, cupón en /checkout/pago, /admin/mensajes → /admin/soporte, re-consent de cookies, editor CMS por barra superior + `CmsFieldVersion`; antes: 2026-09-03 MFA admin obligatorio, checkout en modo full, /rastrear)
>
> Esta checklist se recorre **manualmente con Lucy + Claude** antes del go-live productivo. Es el último filtro: nada se lanza si quedan rojos. Marcar cada item con ✅ / ⚠️ / ❌ y fecha de verificación.

## Cómo usar este documento

1. **Antes del go-live**, recorrer el checklist y registrar la corrida en `tmp/qa/<fecha>.md` (efímero, gitignored)
2. Recorrer todos los flujos en orden, marcando estado por item
3. ⚠️ = aceptable pero a mejorar post-launch · ❌ = bloqueante, no se lanza
4. Cada bloqueante encontrado se documenta en `tmp/qa/<fecha>-qa-<flujo>.md` (efímero, gitignored)

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
- [ ] /admin/soporte lista los tickets con filtros OPEN/IN_PROGRESS/CLOSED; al cerrar un ticket el cliente recibe el email `support-ticket-closed`
- [ ] /admin/mensajes redirige (308) a /admin/soporte conservando el filtro `?status=`

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
- [ ] "Personalizar" → navega (Link) a `/estudio/[slug]?variant=<variantId>` (con `&copies=N` si la PDP tiene stepper de unidades) — NO abre wa.me
- [ ] La variante elegida en la PDP llega preseleccionada al Estudio y `?copies=N` fija las unidades a diseñar
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
- [ ] Línea personalizada multi-unidad: la miniatura es CLICABLE y abre el lightbox paginado por unidad (flechas/dots); badge «N unidades» visible solo con 2+ unidades; el botón «Ver» sigue abriendo el mismo diálogo (ADR-150)
- [ ] Diseño de 1 unidad: la miniatura abre el lightbox SIN pager (no hay páginas por unidad)

## E2. Checkout + pedido (modo full)

- [ ] /checkout/datos → /checkout/envio → /checkout/pago completan con datos válidos
- [ ] Cupón válido escrito en el campo de **`/checkout/pago`** → descuento aplicado al total (el campo NO está en el carrito)
- [ ] Cupón inválido/vencido en /checkout/pago → mensaje claro sin romper el checkout
- [ ] Pago Wompi sandbox aprobado → webhook confirma → orden PAID + email de confirmación
- [ ] Pago COD (contraentrega) → la saga confirma inline: orden queda PAID con guía COD `valorrecaudo = total` para conciliar el recaudo al entregar
- [ ] /checkout/gracias?id=TX_ID muestra confirmación con número de pedido (el estado se verifica contra Wompi, no contra el query param)
- [ ] /checkout/gracias: cada ítem personalizado es una tarjeta legible (miniatura 96px clicable que abre el preview paginado, nombre, variante+desglose, ×N, badges «Tu diseño» y «N unidades») — ya no una tira de miniaturas estáticas (ADR-150)
- [ ] /mi-cuenta/pedidos/[number] y /pedido/<token>: miniatura clicable + badge «N unidades» + botón «Ver» intacto (ADR-150)
- [ ] /rastrear (invitado, sin cuenta): número de pedido + correo → vista pública /pedido/<token> con estado, timeline y guía
- [ ] /rastrear con datos que no cruzan → error genérico anti-enumeración (no revela si el pedido o el correo existen)
- [ ] /checkout/datos NO muestra el checkbox «Quiero documento tributario» (flag `BILLING_DOCUMENT_ENABLED=false`, ADR-160); el detalle admin del pedido muestra el bloque «Documento de venta» solo en órdenes históricas con datos
- [ ] Reintentar el pago Wompi tras un intento fallido → referencia UUID nueva por intento registrada en el ledger (`WompiPaymentAttempt`), sin error «La referencia ya ha sido usada» (ADR-137)
- [ ] Carrito: una línea cuya variante/producto se desactivó se marca al leer (revalidación de comprabilidad); «Editar» una línea personalizada clona READY→DRAFT y reemplaza la línea en sitio (ADR-155)

## E3. Estudio de personalización y Mis diseños (ADR-151/152)

- [ ] Móvil (<sm): la toolbar de estilo NO scrollea horizontal — hay botón resumen (swatch + nombre del color + estado del borde) que abre el Sheet bottom
- [ ] Sheet de estilo: grilla de colores con wrap, toggle Con/Sin borde, «Personalizado», «Elegido: {color}» en vivo y «Listo» sticky que SOLO cierra (la selección ya aplicó)
- [ ] Desktop/tablet (≥sm): toolbar vertical intacta + indicador «· Elegido: {color}»
- [ ] Asset picker de fotos: footer sticky con «Listo» que cierra sin asignar
- [ ] Toggle «Diseños prediseñados» de la sidebar destacado en lila de marca (bg-brand-purple + texto blanco)
- [ ] Entrar a /estudio/<slug> pelado (sin ?designId=/?template=/?copies=) con un DRAFT con progreso real del mismo producto+variante → interstitial «Continuar donde quedaste»; confirmar navega a ?designId=<id>&resume=1 y el canvas se hidrata; descartar bootea fresco y limpia el marcador (ya NO hay reuso silencioso al entrar — ADR-152)
- [ ] El retomador NO ofrece borradores vacíos, vencidos (7 d invitado / 30 d cuenta) ni cuyas unidades contradicen el ?copies=N de la PDP (mismatch → boot fresco conservando el marcador)
- [ ] Tab Texto: UN solo «Listo» que aplica y cierra (ya no hay «Aplicar»); ×/Escape cancela sin guardar (ADR-159)
- [ ] «Borrar el diseño» pide confirmación y es undoable (clearAllSlots)
- [ ] Click en prediseñado: pregunta destino (cara si ambigua); si no hay lienzo libre → modal «¿Cuál lienzo quieres reemplazar?» con miniaturas; preview emergente en hover (desktop) (ADR-158)
- [ ] Letterset multi-set (Abecedario/Vocales): estilo/color/borde por set, paleta sticky, finalize exige las N láminas, pager por set en «Ver diseño» del estudio y «Ver» del carrito (ADR-157)
- [ ] «Ver diseño» del estudio: zoom con rueda/pinch/doble-click, reset al cambiar de página, swipe no pagina con zoom activo
- [ ] «Editar» desde el carrito / «Volver a pedir» crean DRAFT NUEVO (no reusan) y la poda conserva solo los últimos 3 DRAFT con progreso por producto (los vacíos >1 h también se barren)
- [ ] Mis diseños: sección «Borradores» colapsable (abierta si ≤3), borrado individual, «Vaciar borradores» y archivado — todos con Dialog de confirmación real (solo logueado)
- [ ] Borrar un borrador clonado NO rompe las fotos del diseño original (bytes compartidos preservados — fix purgeDesignBatch)

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
- [ ] Cambiar `PRIVACY_POLICY_VERSION` en /admin/contenido (configuración) → el banner SE re-muestra al visitante que ya había decidido (re-consent: la cookie guarda la `policyVersion` aceptada; distinta versión vigente = consentimiento nuevo)
- [ ] Cookie legacy sin `policyVersion` → NO se re-muestra; se reescribe en silencio con la versión vigente (un cambio FUTURO sí disparará re-consent para ese visitante)
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

- [ ] Entrada: en `/admin/contenido` el botón **"Editar en el sitio"** siembra la cookie `lucams_cms_edit` y lleva al storefront en modo edición
- [ ] **Barra superior fija** («Modo edición: haz clic en un texto…» + botón Salir) visible mientras dura el modo; NO hay botón flotante bottom-right
- [ ] Hover sobre texto editable → outline punteado; click sobre cualquier `[data-cms-key]` abre su editor en `/admin/contenido/campos/por-key/[key]` (los CTAs se EDITAN, no se navegan)
- [ ] "Publicar" → cambio visible inmediatamente (updateTag invalidación)
- [ ] Salir (form POST a /api/admin/cms/edit-mode) → vuelve a la misma página sin el modo edición
- [ ] Visitante anónimo: NO carga JS extra del visual editor
- [ ] /admin/contenido sigue funcionando como back office
- [ ] Versionado: cada save crea `CmsFieldVersion` (historial append-only)
- [ ] Revertir a versión X funciona desde el editor del campo (`/admin/contenido/campos/[id]`)
- [ ] Settings inline edit en /admin/contenido/configuracion

## K. Admin CRUD

- [ ] /admin/productos listado paginado + búsqueda
- [ ] Crear producto: form Zod válido + redirect listado + AdminActionLog
- [ ] Edit producto: form prellena + save crea AdminActionLog
- [ ] Archivar producto: soft-delete, no se ve en /productos público
- [ ] /admin/categorias mismo CRUD
- [ ] /admin/auditoria muestra eventos con filtros funcionando
- [ ] /admin/carritos: bandeja con filtros estado/email y métricas (tasa de recuperación, valor recuperado, pendientes)
- [ ] /admin/carritos/[id]: preview real del email en iframe (el CTA del preview lleva token ficticio; el real solo se genera al enviar)
- [ ] Envío manual individual y bulk respetan el kill-switch y el intervalo anti-duplicación; quedan en AdminActionLog (`cart_recovery.reminder.send` / `.bulk_send`)
- [ ] /admin/carritos/configuracion (solo SUPERADMIN): kill-switch, modo automatic/manual, idleHours, maxReminders, intervalHours; guardar aplica en la próxima corrida del cron (sin redeploy); modo manual → el cron responde ok con skippedReason y no envía nada
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
- [ ] Auditoría responsive automatizada en 6 perfiles (390×844, 844×390, 768×1024, 1024×768, 1280×800, 1920×1080) sin hallazgos critical: `pnpm --filter web test:audit-responsive` (ADR-154)
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
- [ ] Documentar tiempo recovery en tmp/dr-drill-<fecha>.md (efímero)
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

## Registro de corrida (plantilla)

> Las corridas se documentan en `tmp/qa/<fecha>.md` (efímeras). Plantilla:
>
> - Responsable: Lucy + Claude
> - Items verdes: X/Y
> - Items amarillos: lista
> - Bloqueantes encontrados:
>   - ...
> - **Decisión**: GO / NO-GO
