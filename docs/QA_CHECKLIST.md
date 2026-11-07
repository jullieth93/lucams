# QA Checklist Pre-Release — Lucams Shop

> **Filtro manual integral extremo a extremo antes de promociones mayores a `production`.** El detalle arquitectónico de cada subsistema vive en [`DECISIONS.md`](DECISIONS.md), [`ARCHITECTURE.md`](ARCHITECTURE.md) y [`README.md`](README.md).
>
> Esta lista se recorre manualmente sobre `develop` (STG) o entorno local homologado antes de cortar release productivo. Marca cada ítem con ✅ / ⚠️ / ❌ y fecha de verificación.

## Cómo usar este documento

1. **Antes del corte a `production`**, recorre la checklist y registra la corrida temporalmente en `tmp/qa/<fecha>.md` (efímero, gitignored).
2. Recorre todos los flujos en orden, marcando el estado real observado por ítem.
3. ⚠️ = aceptable con observación no bloqueante · ❌ = bloqueante, no se promueve a `production`.
4. Cada hallazgo bloqueante se documenta en `tmp/qa/<fecha>-qa-<flujo>.md` (efímero, gitignored) y al cerrar la verificación se depura con `make clean-tmp`.

---

## A. Autenticación cliente (`ADR-030`, `ADR-162`)

- [ ] La sesión PERSISTE al recargar, navegar (`/` → `/productos` → PDP → `/mi-cuenta`) y volver tras >1 h de inactividad (`customer_last_activity`, ventana de 30 días; refresh token de un solo uso — `ADR-162`: la carrera de refresh ya no borra la sesión y la marca de actividad ausente se resella con JWT válido)
- [ ] Registro con correo nuevo → recibe código OTP de 6 dígitos en menos de 60 s (marca «Lucams Shop», sin enlaces mágicos)
- [ ] OTP correcto → inicia sesión, redirige a `/mi-cuenta` y fusiona carrito anónimo si existía
- [ ] OTP incorrecto → mensaje claro sin filtrar información interna
- [ ] Reintentos limitados por rate-limit después de 5 fallos
- [ ] Contraseña comprometida (`"123456"`) rechazada por validación k-anonymity HIBP (`lib/pwned-passwords.ts`)
- [ ] Email autocomplete sugiere los 8 dominios frecuentes (`gmail.com`, `hotmail.com`, etc.)
- [ ] Login: alerta de mayúsculas activadas aparece si `CapsLock` está encendido
- [ ] Login con credenciales válidas → redirige a `/mi-cuenta`
- [ ] Login con credenciales inválidas → «Credenciales incorrectas» (sin revelar si el correo existe)
- [ ] Recuperar contraseña → recibe código OTP de 6 dígitos (NO enlace mágico, `ADR-030`)
- [ ] Restablecer contraseña con confirmación → ejecuta `signOut` global automático de sesiones previas
- [ ] Botón «Cerrar sesión» cierra la sesión en TODAS las pestañas (`scope: 'global'`)

---

## B. Auth admin, MFA `aal2` y RBAC de 8 roles (`ADR-193`)

- [ ] `/admin/login` rechaza credenciales no administrativas con «Credenciales incorrectas» (anti-enumeración)
- [ ] Admin SIN factor TOTP activo: tras login → redirección forzada a `/admin/seguridad?enroll=required` (MFA obligatorio para TODO rol administrativo)
- [ ] Enrolamiento TOTP en `/admin/seguridad` → muestra 10 códigos de respaldo de 16 caracteres (4 grupos de 4) UNA sola vez
- [ ] Login con MFA activo: contraseña → reto TOTP en `/admin/login/mfa` → panel administrativo (sesión `aal2`) y tras >30 min de inactividad (`admin_last_activity`) exige reautenticación
- [ ] Código de respaldo válido → permite ingreso de emergencia, marca el código como usado y desactiva el factor TOTP forzando nuevo enrolamiento
- [ ] Admin autenticado: chip «Panel admin» visible en `SiteHeader`
- [ ] Acceso directo a `/admin/*` sin sesión → redirige a `/admin/login`
- [ ] `/admin/dashboard` y `/admin/hoy` muestran métricas y colas operativas reales (clientes, pedidos en producción/pendientes, productos, reseñas pendientes, inventario, tickets con SLA, retractos, garantías, oportunidades B2B)
- [ ] Verificación de la matriz RBAC de **8 roles** (`SUPERADMIN`, `OPERATIONS_MANAGER`, `CUSTOMER_SUPPORT`, `PRINT_WORKSHOP`, `FINANCE_ANALYST`, `MANAGER`, `FULFILLMENT`, `CMS_EDITOR`):
  - [ ] Rol `SUPERADMIN`: acceso total incluyendo `/admin/usuarios`, `/admin/auditoria`, `/admin/carritos/configuracion` e integraciones críticas
  - [ ] Rol `OPERATIONS_MANAGER` y `MANAGER`: gestión operativa de catálogo, pedidos, oportunidades B2B y métricas sin gestión de usuarios ni auditoría forense (`audit:read`)
  - [ ] Rol `CUSTOMER_SUPPORT`: acceso a `Contacto 360°`, fusión asistida `/admin/clientes/duplicados`, tickets PQR, retractos y garantías sin alterar precios ni usuarios admin
  - [ ] Rol `PRINT_WORKSHOP`: ve PII de contacto **enmascarada server-side** en pedidos, descarga ZIP 300 DPI de producción y modera diseños, pero **NO** tiene permiso para descargar ni imprimir la guía física de envío
  - [ ] Rol `FULFILLMENT`: ve PII enmascarada en pantalla, transiciona despacho y **SÍ** puede descargar/imprimir el rótulo PDF físico de entrega
  - [ ] Rol `CMS_EDITOR`: accede únicamente a `/admin/contenido` y `/admin/seguridad` (`403`/redirección en el resto)
  - [ ] Rol `FINANCE_ANALYST`: accede a conciliación COD, `/admin/finanzas`, métricas y exportaciones CSV financieras (`finance:export_csv`) sin poder mutar el catálogo
- [ ] Toda acción sensible en `/admin` utiliza el diálogo de confirmación de marca (`useAdminConfirm`), nunca `window.confirm` nativo
- [ ] `AdminActionLog` registra cada mutación administrativa con IP y payload sanitizado (visible en `/admin/auditoria` solo para `SUPERADMIN`); los inicios de sesión quedan en logs estructurados (`security.admin_login.*`)
- [ ] `/admin/soporte` lista tickets con filtros `OPEN` / `IN_PROGRESS` / `CLOSED`; al cerrar un ticket el cliente recibe el correo `support-ticket-closed`
- [ ] `/admin/mensajes` redirige (`308`) a `/admin/soporte` conservando el filtro `?status=`

---

## C. Catálogo público

- [ ] `/productos`, `/productos/[categoria]/[subcategoria]` y `/ocasion/[slug]` listan únicamente productos activos y responden `404` real ante slugs inexistentes o inactivos
- [ ] Las categorías principales son visibles en chips y en el mega-menú del encabezado
- [ ] Filtro por categoría y subcategoría reduce la grilla correctamente
- [ ] Filtro por ocasión (`?ocasion=`) cruza productos de distintas categorías
- [ ] Filtro de precio (slider COP) excluye productos fuera del rango
- [ ] Checkbox «Personalizable» muestra solo `isPersonalizable=true`
- [ ] Checkbox «Con descuento» muestra solo productos con `compareAtPrice`
- [ ] Checkbox «Destacados» muestra solo `isFeatured=true`
- [ ] Ordenamiento «Precio ↑» / «Precio ↓» ordena correctamente en centavos COP
- [ ] Buscador `"fotoiman"` encuentra `"fotoimanes"` (`pg_trgm` difuso + `unaccent`)
- [ ] Buscador `"calenadrio"` (error tipográfico) encuentra `"calendario"`
- [ ] Chips de filtros activos con `×` remueven cada filtro individualmente
- [ ] «Limpiar filtros» restablece el listado al estado inicial
- [ ] Estado vacío amigable con mascota Lucams aparece cuando no hay coincidencias
- [ ] Skeleton loader aparece durante transiciones de filtrado
- [ ] Layout con barra lateral (`lg+`) y `<Sheet>` deslizable (móvil) funcionan sin desbordes

---

## D. PDP (Página de producto)

- [ ] Galería: imagen principal + miniaturas clicables cambian de vista
- [ ] Clic sobre la imagen principal abre Lightbox en pantalla completa (con botón `CloseXButton` morado de alto contraste)
- [ ] Lightbox: flechas `←` `→` + `Esc` cierra + paginador de puntos
- [ ] Lightbox: navegación por teclado completa
- [ ] Lightbox: ZOOM completo — rueda anclada al cursor, pellizco táctil (2 dedos), doble clic/toque `100%↔200%` (un único toggle neto en táctil), botones `−`/`%`/`+`/reset y paneo con arrastre; el zoom se restablece al cambiar de imagen
- [ ] Selector de variantes actualiza precio y SKU en vivo, incluyendo variantes gemelas **«Sin imán» (`-NOMAG`, `ADR-099`)** y tabla de descuentos por volumen (`WholesaleTier`) cuando el producto los define
- [ ] CTA «Personalizar» visible únicamente si `isPersonalizable=true`
- [ ] «Personalizar» → navega (`<Link>`) a `/estudio/[slug]?variant=<variantId>` (con `&copies=N` si la PDP tiene selector de unidades) — NO abre `wa.me`
- [ ] La variante elegida en la PDP llega preseleccionada al Estudio y `?copies=N` fija las unidades a diseñar
- [ ] «Agregar al carrito» (en productos `NONE`) → contador del carrito sube + notificación toast superior derecha
- [ ] «Consultar por WhatsApp» → enlace `wa.me` contextual de soporte
- [ ] Breadcrumb funcional (`Tienda > Categoría > Producto`)
- [ ] JSON-LD `Product` válido en Google Rich Results Test
- [ ] Open Graph genera vista previa correcta en WhatsApp/Slack/X
- [ ] Sección «También te puede gustar» muestra 4 productos relacionados relevantes
- [ ] Skeleton durante la carga

---

## E. Carrito (anónimo y autenticado)

- [ ] Visitante anónimo agrega producto → se crea cookie firmada `cart_session`
- [ ] El carrito persiste tras recargar el navegador
- [ ] Botones `+/-` actualizan cantidad respetando `minimumQuantity` y `maximumQuantity`
- [ ] Eliminar ítem → la fila desaparece y el subtotal se recalcula
- [ ] Precios y subtotal formateados exactamente en COP (sin decimales flotantes)
- [ ] Botón «Ir a pagar» navega a `/checkout/datos` en modo `full` (en modo `catalog` el CTA es cotización por WhatsApp)
- [ ] Estado vacío con mascota Lucams cuando el carrito no tiene ítems
- [ ] Fusión carrito anónimo → carrito de cliente al iniciar sesión (suma cantidades por `variantId` y conserva diseños)
- [ ] Toast «Agregado al carrito ✨» con acción «Ver carrito»
- [ ] Ícono del carrito en el header muestra el badge con el conteo exacto
- [ ] Línea personalizada multi-unidad: la miniatura es CLICABLE y abre el lightbox paginado por unidad (flechas/puntos); badge «N unidades» visible solo con 2+ unidades; el botón «Ver» abre el mismo diálogo (`ADR-150`)
- [ ] Diseño de 1 unidad: la miniatura abre el lightbox SIN paginador innecesario

---

## E2. Checkout en 3 pasos, Wompi, COD y Logística (modo `full`)

- [ ] `/checkout/datos` → `/checkout/envio` → `/checkout/pago` avanzan y validan datos urbanos y rurales colombianos (departamento/municipio DANE, código postal MinTIC y modo regalo `isGift`)
- [ ] `/checkout/datos` NO muestra el checkbox «Quiero documento tributario» mientras `BILLING_DOCUMENT_ENABLED = false` (`ADR-160`); en `/admin/pedidos/[number]` el bloque «Documento de venta» solo aparece en órdenes históricas que lo contengan
- [ ] `/checkout/envio` ofrece tarifas selladas con HMAC: transportadoras Aveonline habilitadas según peso real vs volumétrico y **«Envío Lucams»** (`LUCAMS`) cuando el destino es Bogotá
- [ ] Código de cupón válido ingresado en **`/checkout/pago`** (`PERCENT`, `FIXED` o `FREE_SHIPPING`) → descuento aplicado al total (el campo vive en `/checkout/pago`, no en `/carrito`)
- [ ] Cupón inválido, vencido o que supera `maxUsesPerCustomer` en `/checkout/pago` → mensaje claro sin romper el checkout
- [ ] Pago Wompi aprobado → webhook `/api/webhooks/wompi` (o cron `reconcile-wompi`) confirma → pedido `LCM-YYYY-NNNN` pasa a `PAID`, encola `RenderJob` 300 DPI si incluye diseños y envía correo de confirmación
- [ ] Reintentar pago en Wompi tras un intento rechazado o abandonado → genera un nuevo `WompiPaymentAttempt` con referencia única en el ledger sin error «La referencia ya ha sido usada» (`ADR-137`)
- [ ] Pago contraentrega (`COD`) → respeta validaciones de riesgo/`BlockedIdentity` y confirma la orden con `valorrecaudo = total` para conciliación posterior en `/admin/finanzas`
- [ ] `/checkout/gracias?id=TX_ID` muestra confirmación con número `LCM-YYYY-NNNN` verificando el estado real en servidor contra Wompi/DB (nunca confiando ciegamente en query params)
- [ ] `/checkout/gracias`: cada ítem personalizado renderiza tarjeta legible (miniatura `96px` clicable con vista previa paginada, nombre, variante+desglose, `×N`, badges «Tu diseño» y «N unidades» — `ADR-150`)
- [ ] `/mi-cuenta/pedidos/[number]` y `/pedido/[token]`: miniatura clicable + badge «N unidades» + botón «Ver» funcional (`ADR-150`)
- [ ] `/rastrear` (invitado sin cuenta): número `LCM-YYYY-NNNN` + correo → redirige a `/pedido/[token]` con estado, línea de tiempo y guía
- [ ] `/rastrear` con datos que no coinciden → mensaje uniforme anti-enumeración (no filtra si existe el pedido o el correo)
- [ ] En `/admin/pedidos/[number]` funcionan descarga de ZIP 300 DPI de taller y emisión de guía Aveonline archivando el rótulo PDF en `production-assets`
- [ ] Carrito: una línea cuya variante o producto se desactivó se alerta al leer (revalidación de comprabilidad); «Editar» en una línea personalizada clona `READY → DRAFT` y reemplaza la línea en el sitio (`ADR-155`)

---

## E3. Estudio de personalización 2D/3D y Mis diseños (`ADR-151`/`152`/`190`/`191`)

- [ ] Subida de fotografías genera derivado ligero `.canvas.webp` (≤800 px) fluido en lienzo móvil y escritorio; imágenes corruptas o fuera de límites muestran aviso claro
- [ ] Si el producto tiene >1 plantilla activa, el Estudio solicita selección explícita antes de inicializar el lienzo
- [ ] Móvil (`<sm`): la barra de estilo NO hace scroll horizontal — muestra botón resumen (muestra de color + nombre + estado de borde) que abre el `<Sheet>` inferior
- [ ] `<Sheet>` de estilo: grilla de colores con wrap, selector Con/Sin borde, color personalizado, indicador «Elegido: {color}» en vivo y botón fijo «Listo» que cierra aplicando al instante
- [ ] Escritorio/tablet (`≥sm`): barra vertical intacta + indicador «· Elegido: {color}»
- [ ] Selector de fotos subidas: pie fijo con «Listo» que cierra sin asignación accidental
- [ ] Botón «Diseños prediseñados» (`DesignGalleryImage`) destacado en púrpura de marca (`bg-brand-purple` + texto blanco)
- [ ] Las **7 escenas 3D** en React Three Fiber cargan bajo demanda mostrando el arte aplicado; en separadores magnéticos de 2 caras la cara posterior sin diseño exhibe el patrón diagonal «Lucams» (`#E9E6F0`, `-24°`) idéntico al impreso a 300 DPI (`ADR-190`)
- [ ] Retomador de borradores (`[STU-02]`, `ADR-152`): entrar a `/estudio/[slug]` limpio (sin `?designId=`/`?template=`/`?copies=`) existiendo un `DRAFT` con progreso real del mismo producto+variante abre el diálogo «Continuar donde quedaste» **tanto para invitados con cookie `cart_session` (vigencia 7 días) como para cuentas autenticadas (vigencia 30 días)**; confirmar navega a `?designId=<id>&resume=1` hidratando el lienzo, y descartar inicia lienzo limpio
- [ ] El retomador NO ofrece borradores vacíos, vencidos ni cuyas unidades contradigan el `?copies=N` elegido en la PDP
- [ ] Pestaña Texto: UN único botón «Listo» que aplica y cierra; `×` o `Escape` cancelan sin guardar (`ADR-159`)
- [ ] «Borrar el diseño» solicita confirmación y permite deshacer (`clearAllSlots`)
- [ ] Clic en arte prediseñado de galería: consulta cara destino si es ambigua y, si no hay lienzo libre, abre modal «¿Cuál lienzo quieres reemplazar?» con miniaturas; vista previa emergente al pasar el cursor en escritorio (`ADR-158`)
- [ ] Juegos de fichas/nombres multi-set (`LetterSetEditor` / `NameEditor`): estilo/color/borde independiente por set, paleta fija, validación de las `N` láminas antes de finalizar y paginador por set en «Ver diseño» y en carrito (`ADR-157`)
- [ ] «Ver diseño» en el Estudio: zoom con rueda/pellizco/doble clic, restablecimiento al cambiar de página y bloqueo de swipe de paginación mientras el zoom está activo
- [ ] Vistas previas en carrito, `/mi-cuenta/disenos` y órdenes se sirven **limpias sin marca de agua** (`ADR-191`) desde el bucket privado `design-previews` mediante `/api/design-preview/*`
- [ ] Asistente creativo IA (Gemini) sugiere textos/ideas en español de Colombia respetando rate limit
- [ ] «Editar» desde carrito y «Volver a pedir» clonan un `DRAFT` NUEVO y la poda automática conserva los últimos 3 borradores con progreso por producto
- [ ] `/mi-cuenta/disenos`: sección «Borradores» colapsable (abierta si ≤3), borrado individual, «Vaciar borradores» y archivado con diálogo de confirmación real
- [ ] Borrar un borrador clonado NO rompe las imágenes del diseño original (preservación de referencias compartidas en `purgeDesignBatch`)

---

## E4. Posventa invitado, Retractos, Garantías, Soporte PQR y Reseñas (`ADR-193`)

- [ ] `/pedido/[token]` muestra el historial cronológico granular de transporte (`ShipmentEvent`) alimentado por el webhook de Aveonline y el job `tracking-sync` (cada 15 min)
- [ ] En `/pedido/[token]` un comprador invitado visualiza `GuestOrderSupportCard` y solo desbloquea solicitudes de retracto, garantía o soporte verificando **doble factor (2FA)** (posesión del token + conocimiento verificable del pedido, protegido con rate limit)
- [ ] Retracto (Ley 1480 art. 47 y Ley 2439): habilitado dentro de 5 días hábiles desde la entrega para productos no personalizados, calcula devolución en centavos COP y aplica **reversión proporcional de Puntos Lucams** otorgados por la orden
- [ ] Garantía legal: verifica cobertura contra el plazo sellado al comprar en `OrderItem.warrantyMonths` (`1..120` meses), permite subir evidencia fotográfica y aparece en `/admin/garantias` y `/admin/hoy`
- [ ] Centro de soporte PQR (`/soporte`, `/soporte/[token]` y `/mi-cuenta/soporte`): crea radicados protegidos con Turnstile, calcula vencimiento en **días hábiles colombianos** (reloj SLA visible en `/admin/hoy` y `/admin/soporte`), aplica bloqueo optimista entre agentes y ofrece sugerencias del **copiloto IA 0-PII** (redacta correos, teléfonos, direcciones y documentos antes de invocar Gemini)
- [ ] Reseñas de producto: solo pedidos en estado `DELIVERED` habilitan el envío de reseña verificada, que queda sujeta a moderación en `/admin/resenas`

---

## F. Newsletter

- [ ] Formulario del pie de página acepta correo válido
- [ ] Casilla de autorización de datos personales OBLIGATORIA (Ley 1581)
- [ ] Envío exitoso → toast «¡Suscrito! ✨»
- [ ] Correo de bienvenida llega a bandeja de entrada en menos de 60 s
- [ ] Resuscripción del mismo correo → respuesta idempotente («Ya estabas suscrito»)
- [ ] Correo con formato inválido rechazado por validación Zod
- [ ] Rate-limit activo: `5/h` por IP y `2/h` por correo
- [ ] Widget Cloudflare Turnstile activo
- [ ] Tabla `Consent` registra fila con `scope=NEWSLETTER` y versión legal vigente

---

## G. Contacto

- [ ] Formulario en `/contacto` valida nombre + correo + asunto (6 opciones) + mensaje `≥ 10` caracteres
- [ ] Envío válido → crea `SupportTicket` en DB + dispara 2 correos (acuse al cliente + aviso interno a `hola@lucamsshop.com` con `Reply-To` al cliente)
- [ ] Toast de confirmación con identificador corto del ticket
- [ ] Rate-limit activo: `5/día` por IP y `3/día` por correo
- [ ] Correo de acuse recibido por el cliente con copia de su consulta
- [ ] Correo interno recibido en `hola@lucamsshop.com`
- [ ] Widget Cloudflare Turnstile cargado y validado server-side
- [ ] CTA de WhatsApp (`wa.me`) visible como canal alternativo
- [ ] Correo de contacto y horario de atención en `America/Bogota` visibles en la página

---

## G2. CRM 360°, B2B / Eventos, Cotizaciones y Fidelización (`ADR-193`)

- [ ] `/empresas-y-eventos` (protegido con Turnstile y rate limit) registra o vincula el `Contact`, abre la `Opportunity` en `/admin/oportunidades` y genera alerta en `/admin/hoy`
- [ ] Cotización creada desde `/admin/cotizaciones` se abre públicamente en `/cotizacion/[token]`, soporta especificaciones/hoja de taller y permite aceptación/conversión a pedido `LCM-YYYY-NNNN` sin pérdida de precisión en centavos COP
- [ ] `/admin/clientes` presenta la vista **`Contacto 360°`** unificando compras como invitado y con cuenta, tickets, oportunidades, consentimientos Ley 1581, notas y banderas `isStaff` / auditoría `selfDealing`
- [ ] `/admin/clientes/duplicados` lista posibles contactos duplicados para **fusión asistida manual** con registro de auditoría (cero auto-merge silencioso)
- [ ] `/admin/marketing/segmentos` y exportaciones de marketing filtran de forma estricta únicamente contactos con consentimiento `MARKETING` vigente (Ley 1581)
- [ ] Programa **Puntos Lucams** (`/mi-cuenta` y `/admin/fidelizacion`): acredita puntos al entregarse/confirmarse compras elegibles, ejecuta retrocrédito cuando un comprador invitado crea y verifica su cuenta y redime saldo sin permitir saldos negativos
- [ ] Enlaces de referidos `/r/[codigo]` aplican beneficio de bienvenida y recompensa al referente bloqueando auto-referidos (`selfDealing`)

---

## H. Banner de Cookies y Consentimiento Ley 1581

- [ ] Visitante nuevo en ventana privada: aparece el banner inferior de cookies
- [ ] Muestra 3 acciones claras: «Solo necesarias» / «Personalizar» / «Aceptar todas»
- [ ] **Bloqueo previo estricto:** antes de aceptar «Analíticas» (o al elegir «Solo necesarias»), **NO se inyecta `gtag.js` (GA4) ni se escribe la cookie `lucams_utm`**
- [ ] «Solo necesarias» → persiste cookie de preferencias + registra filas en `Consent` (`functional`, `analytics` y `marketing` en `false`)
- [ ] «Aceptar todas» → persiste cookie + registra las 4 categorías en `true` y habilita medición analítica
- [ ] «Personalizar» → abre modal con los 4 interruptores por categoría
- [ ] Interruptor «Necesarias» bloqueado activo (no desactivable)
- [ ] Al recargar la página → el banner NO vuelve a mostrarse
- [ ] Actualizar `PRIVACY_POLICY_VERSION` (vigente: `"v3 · 2026-11-05"`) → el banner vuelve a solicitar consentimiento a visitantes con versión anterior
- [ ] Cookie heredada sin `policyVersion` → se actualiza en silencio a la versión actual y dispara re-consentimiento en el siguiente cambio de versión
- [ ] `/legal/cookies` muestra la tabla real de cookies activas y el botón «Abrir preferencias» reabre el modal

---

## I. Páginas legales y Derechos ARCO / Supresión (`Versión 3`)

- [ ] Las 8 páginas bajo `/legal/*` responden `200` sin errores y muestran **Versión 3 (`2026-11-05`)** interpolando todos los `{{tokens}}` dinámicos sin llaves residuales
- [ ] `/legal/privacidad` cita explícitamente la Ley 1581 de 2012 y finalidades reales del tratamiento
- [ ] `/legal/terminos` detalla Ley 1480, derecho de retracto, reversión de pago y garantías
- [ ] `/legal/cookies` documenta la tabla exacta de cookies first-party y de terceros condicionales
- [ ] `/legal/devoluciones` informa plazos legales de retracto (5 días hábiles) y excepciones de bienes confeccionados a medida (art. 47 num. 3) junto con Ley 2439
- [ ] `/legal/garantias` explica el término informado por producto (art. 8), el mínimo base de 1 mes y el término supletorio de 1 año si no se indicara plazo
- [ ] `/legal/habeas-data` detalla los derechos de los titulares y canales gratuitos para ejercerlos
- [ ] `/legal/subprocesadores` lista los subencargados reales conectados con enlaces vigentes a sus políticas/DPA
- [ ] `/legal/security` y `/.well-known/security.txt` publican el buzón oficial `security@lucamsshop.com` y el alcance de divulgación responsable
- [ ] En `/mi-cuenta/seguridad` → `/mi-cuenta/eliminar` funciona de extremo a extremo la solicitud de supresión/anonimización de cuenta y grafo `Contact` (conservando únicamente los soportes contables exigidos por ley)
- [ ] **Revisión jurídica colombiana vigente verificada antes de cambios mayores de alcance** ⚠️

---

## J. CMS v2 + Editor Visual en el Sitio y Plantillas de Email

- [ ] En `/admin/contenido`, el botón **«Editar en el sitio»** establece la cookie `lucams_cms_edit` y abre el storefront en modo edición
- [ ] **Barra superior fija** («Modo edición: haz clic en un texto…» + botón «Salir») visible durante toda la sesión; sin botones flotantes superpuestos abajo
- [ ] Pasar el cursor sobre texto editable muestra contorno punteado; hacer clic sobre cualquier `[data-cms-key]` abre su editor en `/admin/contenido/campos/por-key/[key]` (los CTAs se editan en vez de navegar)
- [ ] «Publicar» invalida caché (`updateTag`) y refleja el cambio de inmediato en el storefront
- [ ] «Salir» (`POST /api/admin/cms/edit-mode`) regresa a la misma ruta pública sin modo edición
- [ ] Visitante anónimo NO descarga JavaScript adicional del editor visual
- [ ] `/admin/contenido` opera como consola completa de las 3 capas (`9` contenedores, `29` secciones, `168` campos)
- [ ] Versionado inmutable: cada guardado crea registro en `CmsFieldVersion`
- [ ] Revertir a una versión previa funciona desde `/admin/contenido/campos/[id]`
- [ ] Edición de ajustes globales funciona en `/admin/contenido/configuracion`
- [ ] `/admin/email-templates` previsualiza las 31 plantillas transaccionales/operativas en `<iframe sandbox="">` con CSP aislada y permite prueba de envío

---

## K. Admin CRUD y Recuperación de Carritos

- [ ] `/admin/productos`: listado paginado + búsqueda funcional
- [ ] Crear producto: formulario Zod válido + redirección + registro en `AdminActionLog`
- [ ] Editar producto: formulario precargado + guardado auditado en `AdminActionLog`
- [ ] Archivar producto: soft-delete inmediato, deja de aparecer en `/productos`, sitemap y feeds públicos
- [ ] `/admin/categorias`: CRUD jerárquico padre/subcategoría y reordenamiento funcionales
- [ ] `/admin/ocasiones`, `/admin/plantillas`, `/admin/disenos` y `/admin/fichas`: CRUD y activación/desactivación reflejan cambios tras invalidar caché
- [ ] `/admin/costos` y `/admin/materiales`: recetas de materiales calculan costo unitario y margen neto en centavos COP
- [ ] `/admin/auditoria`: tabla de eventos con filtros por actor, entidad y fechas funcionando
- [ ] Paginación de 30 registros por página funcional en listados administrativos
- [ ] Filtro por prefijo de acción (`"cms.block"`, `"order."`, `"cart_recovery."`) encuentra todas sus variantes
- [ ] `/admin/carritos`: bandeja con filtros de estado/correo y tarjetas de métricas (tasa de recuperación, valor recuperado, pendientes)
- [ ] `/admin/carritos/[id]`: vista previa real del correo en iframe (con token demostrativo; el token real solo se emite al despachar el correo)
- [ ] Envío manual individual y masivo respetan el interruptor maestro y la ventana anti-duplicación, dejando traza `cart_recovery.reminder.send` / `.bulk_send` en `AdminActionLog`
- [ ] `/admin/carritos/configuracion` (solo `SUPERADMIN`): interruptor global, modo `automatic`/`manual`, `idleHours`, `maxReminders` e `intervalHours` aplican en la siguiente ejecución del cron sin redespliegue; en modo `manual` el cron responde `ok` con `skippedReason` sin enviar correos

### Lifecycle Journeys

- [ ] `/admin/lifecycle` muestra las cinco rutas en `DRAFT` y exige `lifecycle:manage` + MFA para activar, probar, reintentar y cambiar el control general
- [ ] Interruptor general y límite diario global se guardan con auditoría e invalidación `cms`; apagar el motor detiene inscripciones y ejecuciones sin borrar historial
- [ ] Crear/editar/reordenar pasos conserva posiciones consecutivas, versionado y mensajes históricos; audiencia y exclusiones coinciden con la ejecución
- [ ] Cada paso abre una previsualización sandbox con su CTA; la prueba en STG responde `DRY_RUN` y no crea correo ni tarea real
- [ ] Consentimiento por versión, baja, rebote y queja suprimen inmediatamente; carrito y reposición salen delegados a sus flujos existentes sin duplicados; la ventana de carrito se recalcula en cada ciclo
- [ ] Reactivación y B2B respetan tanto la inactividad mínima como la antigüedad máxima de entrada; ninguna oportunidad histórica fuera de ventana genera tareas
- [ ] Dos workers no duplican inscripciones/mensajes ni superan el límite global; reintentos conservan HTML, nombre, clasificación comercial, ruta, token e idempotency key
- [ ] Segunda compra exige una sola compra histórica; una orden posterior cierra el ciclo; B2B crea una tarea idempotente aun sin correo
- [ ] Activación, recompra, reactivación y alta intención dirigen `/productos` o `/recomendador` a la PDP del producto contextual para aprovechar sus relacionados
- [ ] Métricas separan aceptación, entrega, rebote, queja, clic, conversión e ingreso; una orden solo se atribuye al último clic anterior dentro de 30 días

---

## L. SEO técnico y Feeds

- [x] `/sitemap.xml` válido y registrado en Google Search Console
- [x] `/robots.txt` bloquea `/admin`, `/api` y `/mi-cuenta` sin bloquear `/_next/image` para `Googlebot-Image`
- [ ] `/manifest.webmanifest` responde `200` con JSON válido
- [ ] `/feeds/google-merchant.xml` responde `200` con XML RSS 2.0 válido, URLs canónicas y precios exactos en COP
- [ ] JSON-LD `Product` de las PDP valida sin errores en `https://search.google.com/test/rich-results`
- [ ] Imágenes Open Graph dinámicas en portada y PDP generan tarjeta `1200×630` correcta
- [ ] Etiquetas Twitter Cards usan `summary_large_image`
- [x] Etiqueta `canonical` presente y coherente en todas las rutas indexables

---

## M. Accesibilidad WCAG 2.1 AA

- [ ] `axe-core`: cero violaciones críticas en portada, `/productos`, PDP y `/carrito`
- [ ] Navegación con teclado: `Tab` recorre los elementos interactivos en orden lógico
- [ ] Tecla `Esc` cierra diálogos y capas superpuestas (lightbox PDP, editor CMS, modal de cookies, sheets)
- [ ] `Enter` y `Espacio` activan botones con foco
- [ ] Indicador de foco visible en todos los controles (nunca `outline: none` sin anillo sustituto)
- [ ] `aria-label` descriptivo en todos los botones de solo ícono (papelera, cerrar `CloseXButton`, zoom, etc.)
- [ ] Texto alternativo (`alt`) presente en todas las imágenes informativas (productos, mascota Lucams, logotipos)
- [ ] Relaciones de contraste WCAG AA (`≥ 4.5:1`) cumplidas en todos los pares texto/fondo de marca (`ADR-044`)
- [ ] Enlace de salto «Saltar al contenido» lleva el foco directo a `<main id="contenido">` al presionar `Tab`
- [ ] Prueba rápida con lector de pantalla (NVDA / VoiceOver) en `/productos` y PDP

---

## N. Rendimiento Lighthouse y Core Web Vitals

- [ ] Lighthouse Escritorio `≥ 95` en `/`
- [ ] Lighthouse Escritorio `≥ 95` en `/productos`
- [ ] Lighthouse Escritorio `≥ 95` en `/producto/[slug]`
- [ ] Lighthouse Escritorio `≥ 95` en `/carrito`
- [ ] Lighthouse Móvil `≥ 90` en las mismas rutas públicas
- [ ] `LCP < 2.5 s`
- [ ] `CLS < 0.1`
- [ ] `INP < 200 ms`
- [ ] Bundle JS inicial `< 150 KB` comprimido (gzip) en la portada y fuentes globales servidas desde `.subset.woff2` locales

---

## O. Compatibilidad Cross-browser y Responsive

- [ ] Chrome `130+` escritorio: flujo completo de compra y Estudio
- [ ] Firefox `130+` escritorio: flujo completo de compra y Estudio
- [ ] Safari `18+` escritorio: flujo completo de compra y Estudio
- [ ] Edge `130+` escritorio: flujo completo de compra y Estudio
- [ ] Chrome Android: flujo completo + `<Sheet>` móvil + Turnstile + pellizco de zoom
- [ ] Safari iOS `18+`: flujo completo + `<Sheet>` móvil + Turnstile + pellizco de zoom
- [ ] Áreas táctiles principales `≥ 44×44 px` en dispositivos táctiles (`pointer-coarse:`)
- [ ] Cero scroll horizontal accidental en anchos `375`, `414`, `768` y `1024 px`
- [x] Auditoría responsive automatizada en los **6 perfiles** (`390×844`, `844×390`, `768×1024`, `1024×768`, `1280×800`, `1920×1080`) con `0` desbordes críticos: `pnpm --filter web test:audit-responsive` (`ADR-154`)
- [ ] Campos `<input>` móviles mantienen `font-size ≥ 16px` para evitar auto-zoom forzado en iOS

---

## P. Pruebas de carga (k6)

- [ ] `k6`: 50 usuarios concurrentes navegando catálogo y fichas de producto
- [ ] `p95 < 500 ms` en `/productos`
- [ ] `p95 < 300 ms` en `/api/cms/blocks`
- [ ] `p95 < 200 ms` en `/api/health/db`
- [ ] Cero respuestas `5xx` bajo `50 RPS` sostenidos durante 5 minutos
- [ ] Ejecución limpia con `make test-load` (`tests/load/storefront-browsing.js`)

---

## Q. Seguridad pre-release

- [ ] `pnpm audit --prod` sin vulnerabilidades `high` ni `critical` sin mitigar
- [ ] `gitleaks detect --redact --no-banner` → cero secretos expuestos en el árbol e historial
- [ ] `make verify-db` → `0` deriva Prisma↔SQL y `5/5` invariantes RLS/grants en verde (100 % de tablas con RLS activo)
- [ ] Calificación `A+` en `securityheaders.com` sobre `lucamsshop.com`
- [ ] Calificación `A+` en SSL Labs sobre `lucamsshop.com` (HSTS + TLS moderno)
- [ ] Cabecera CSP estricta con `nonce` dinámico por petición en `proxy.ts`
- [ ] Prueba manual de inyección SQL en buscador y filtros de catálogo → parametrizado sin fallos
- [ ] Prueba manual de XSS reflejado en `searchParams` → escapado seguro
- [ ] Prueba manual CSRF en mutaciones → bloqueado por validación de `Origin` y cookies `SameSite=Lax`
- [ ] Intentar acceder a `/admin/*` y `/api/admin/*` sin sesión o con sesión de cliente normal → `403` / redirección a login

---

## R. Entregabilidad de correo (SPF / DKIM / DMARC / Resend)

- [ ] Registro `DKIM` de `mail.lucamsshop.com` verificado en DNS / MXToolbox
- [ ] Registro `SPF` válido (`v=spf1 include:resend.com ~all` o equivalente autorizado)
- [ ] Registro `DMARC` activo (`v=DMARC1; p=quarantine; ...`)
- [ ] Puntaje en `mail-tester.com` `≥ 9/10` enviando desde `EMAIL_FROM` productivo
- [ ] Correo de bienvenida llega a la bandeja principal en Gmail (no cae en Spam)
- [ ] Correo de bienvenida llega a la bandeja principal en Outlook Web (no cae en Spam)
- [ ] Correo renderiza correctamente tipografía y colores en Apple Mail / móvil
- [ ] Webhook Svix `/api/webhooks/resend` registra `email.delivered` en `EmailEvent`
- [ ] Rebote forzado a buzón inexistente registra `EmailEvent` con `type=email.bounced` y suprime envíos futuros de marketing

---

## S. Backups cifrados y Recuperación ante Desastres (DR)

- [ ] Workflow diario `.github/workflows/backup.yml` en verde: genera y sube backups cifrados con GPG (`.sql.gz.gpg` de PostgreSQL + `.tar.gz.gpg` de los 5 buckets de Storage) al bucket **Cloudflare R2** (`lucams-backups`)
- [ ] Workflow mensual `.github/workflows/dr-drill.yml` en verde: descarga el último respaldo real desde R2, descifra, restaura en PostgreSQL aislado y verifica integridad de tablas y conteos
- [ ] Simulacro manual de restauración documentado temporalmente en `tmp/dr-drill-<fecha>.md` (limpiar luego con `make clean-tmp`)
- [ ] Tiempo total de recuperación (RTO) medido `< 30 min`
- [ ] PITR continuo nativo de 7 días en Supabase Pro verificado cuando `lucams-prod` opere en plan Pro

---

## T. Cumplimiento normativo Colombia final

- [ ] Aviso de privacidad y Política de tratamiento de datos (Ley 1581, Versión 3) verificados
- [ ] Términos y condiciones, Retracto (Ley 1480 art. 47 y Ley 2439) y Garantías verificados
- [ ] Política de cookies contrastada contra las cookies reales observadas en DevTools (Application → Cookies)
- [ ] Inventario de subprocesadores sincronizado con los proveedores realmente activos en producción
- [ ] Preparación tributaria DIAN: mientras no aplique facturación electrónica obligatoria, ningún texto promete factura electrónica DIAN y `BILLING_DOCUMENT_ENABLED` permanece en `false`
- [ ] Flujo de derechos Hábeas Data (consulta, rectificación, revocatoria de marketing y supresión de cuenta) probado de punta a punta
- [ ] Flujo de atención PQR con relojes SLA hábiles colombianos e información de canales SIC documentado y operativo

---

## Registro de corrida (plantilla)

> Las corridas manuales se anotan de forma efímera en `tmp/qa/<fecha>.md` (gitignored; depurar al cierre con `make clean-tmp`). Plantilla sugerida:
>
> - Responsable y fecha (`America/Bogota`):
> - Commit / PR evaluado (`develop → production`):
> - Ítems en verde: `X / Y`
> - Observaciones no bloqueantes (⚠️):
> - Bloqueantes detectados (❌):
> - **Decisión de salida**: `GO` / `NO-GO`
