# Tracking de Email Templates Lucams_shop

> Estado de cada template de email transaccional. Vive acá para que al
> sumar nuevos flows (admin, MFA, B2B, etc.) ningún template default de
> Supabase se quede sin personalizar.
>
> **Dos familias de templates:**
>
> 1. **Supabase Auth** (tablas "Authentication" y "Security" abajo) — HTML
>    pegado a mano en Supabase Dashboard → Authentication → Emails.
> 2. **Resend (código)** — funciones TS en
>    `apps/web/features/emails/templates/` enviadas vía `lib/resend.ts`
>    (ver "Templates transaccionales Resend" abajo).

## Convención visual (válida para todos)

- **Logo:** `https://lucamsshop.com/brand/lucams-logo.png` (URL
  absoluta — los clientes de email bloquean rutas relativas).
- **Fondo card:** `#FFFFFF` con border `#E6E2EC` y radius `20px`.
- **Fondo external:** `#FFF8F0` (brand-cream) para dar respiro.
- **Heading:** color `#3D2E5C` (brand-purple-dark), font-weight 700, 22-24px.
- **Body:** color `#1F1733` (foreground), 14-15px line-height 1.5.
- **Footer text:** color `#6B6383` (muted), 12px.
- **Acción primaria** (botón / código): `#7C6AAD` (brand-purple).
- **Acción urgente / advertencia:** `#E85B9F` (brand-pink) o
  `#E84B5B` (error).
- **Fonts:** system stack (Apple/Segoe/Roboto/Helvetica/Arial). Web
  fonts NO cargan en la mayoría de clientes de email.
- **Layout:** tablas anidadas (HTML email standard). NO usar Tailwind,
  CSS modules, ni `<style>` blocks — usar inline styles únicamente.

> Nota (2026-09-03): los templates de CÓDIGO (Resend) usan
> `features/emails/layout.ts`, que difiere en dos puntos de la convención
> de arriba (pensada para los templates pegados en Supabase): el header es
> el wordmark de texto "Lucams_shop" sobre gradiente morado (NO la imagen
> `lucams-logo.png`) y la card usa radius `16px` sin border. Colores,
> fuentes y fondo `#FFF8F0` sí aplican a ambas familias.

## Templates transaccionales Resend (código)

Inventario de `apps/web/features/emails/templates/` (verificado 2026-09-03).
Todos devuelven `{ subject, html, text }` con inline CSS vía
`features/emails/layout.ts` y se envían con `lib/resend.ts`
(idempotencyKey por orden/evento; los comerciales llevan flag `commercial`
→ supresión si el destinatario tiene `email.bounced`/`email.complained`).

**Nota F-11 (auditoría 2026-08-24, hash-at-rest del token público):** el
token de tracking ya no se persiste en claro, así que los correos post-pago
se envían con `publicTrackingToken: null` y el CTA cae al fallback
**`/rastrear`** (número de pedido + correo — sirve para invitados y clientes
con cuenta; `/mi-cuenta/pedidos` moría en el muro de autenticación para
invitados). Aplica a: order-confirmation, order-shipped, order-delivered,
order-payment-failed, review-request, design-rejected.

| Template (archivo `.ts`)     | Trigger                                                                     | Notas                                                                                                                                                               |
| ---------------------------- | --------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **account-exists-notice**    | Registro con un email ya registrado (anti-enumeración, B-3)                 | Nuevo 2026-08-29 (commit `229b30b`). El form responde igual exista o no la cuenta; el dueño del correo recibe este aviso con links a /login y /recuperar-password.  |
| **order-confirmation**       | Order pasa a `PAID` (saga `sendOrderConfirmationOnce`)                      | Items + totales + dirección. COD lleva callout "pagas en efectivo". Reintenta en retries de la saga hasta marcar `confirmationSentAt`. Fallback `/rastrear` (F-11). |
| **order-shipped**            | Webhook Aveonline `IN_TRANSIT`/`DISPATCHED` → SHIPPED                       | Guía + carrier + link a la web de la transportadora y al PDF de la guía. CTA principal a `/rastrear` (F-11).                                                        |
| **order-delivered**          | Webhook Aveonline `DELIVERED`                                               | Pide reseña (CTA "Dejar una reseña"). Fallback `/rastrear` (F-11).                                                                                                  |
| **order-payment-failed**     | `CANCELLED` pre-pago (pago Wompi rechazado/fallido)                         | Invita a reintentar el pago. Fallback `/rastrear` (F-11).                                                                                                           |
| **order-cancelled**          | Cancelación manual admin, o `CANCELLED` post-pago (FULFILLING/SHIPPED)      | Con motivo opcional.                                                                                                                                                |
| **refund-issued**            | `REFUNDED` (VOIDED post-pago, retracto aprobado, etc.)                      | Monto + motivo del reembolso.                                                                                                                                       |
| **order-admin-notification** | Order `PAID`/COD confirmada → buzón interno (`ALERT_EMAIL`)                 | + notificación in-app (dedup por orden). replyTo = email del cliente.                                                                                               |
| **review-request**           | Cron `lucams-review-request` (~7 días post-entrega)                         | Comercial: lleva `unsubscribeUrl`. Links directos a la ficha de cada producto. Fallback `/rastrear` (F-11).                                                         |
| **cart-recovery**            | Cron `lucams-cart-recovery` (carritos ≥4h inactivos, un solo envío)         | Comercial (palanca de ingreso).                                                                                                                                     |
| **design-rejected**          | Moderación admin rechaza diseño personalizado (ADR-062 P0-2)                | Motivo + salida (ajustar o reembolso). Fallback `/rastrear` (F-11).                                                                                                 |
| **newsletter-welcome**       | Suscripción al newsletter                                                   | Comercial.                                                                                                                                                          |
| **back-in-stock**            | Cron `lucams-back-in-stock` (variant vuelve a tener stock)                  | Comercial.                                                                                                                                                          |
| **quote-admin-notification** | Cotización creada en modo catálogo (cliente no pulsó "Enviar por WhatsApp") | Detalle + link wa.me del cliente + link al detalle admin.                                                                                                           |
| **referral-reward**          | Primer pedido PAGADO con código de referido                                 | Cupón 10% (1 uso, 90 días) para referente y referido.                                                                                                               |
| **retract-received**         | Cliente radica solicitud de retracto                                        | Flujo retracto (`features/retract/emails.ts`).                                                                                                                      |
| **retract-approved**         | Admin aprueba el retracto                                                   |                                                                                                                                                                     |
| **retract-rejected**         | Admin rechaza el retracto                                                   |                                                                                                                                                                     |
| **retract-refunded**         | Reembolso del retracto emitido                                              |                                                                                                                                                                     |
| **warranty-received**        | Cliente radica solicitud de garantía                                        | Flujo garantía (`features/warranty/notify.ts`).                                                                                                                     |
| **warranty-resolved**        | Garantía resuelta                                                           |                                                                                                                                                                     |
| **support-ticket-received**  | Cliente crea ticket de soporte                                              | Confirmación al cliente.                                                                                                                                            |
| **support-ticket-internal**  | Ticket de soporte → buzón interno                                           | Notificación al negocio.                                                                                                                                            |

## Estado por template

### Authentication (acción del user)

| Template                 | Variable principal                        | Estado              | Notas                                                                                                                                                       |
| ------------------------ | ----------------------------------------- | ------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Confirm signup**       | `{{ .Token }}` (OTP)                      | ✅ Personalizado    | OTP de 6-10 dígitos. Lucy lo pegó 2026-05-11.                                                                                                               |
| **Reset password**       | `{{ .Token }}` (OTP)                      | ✅ Personalizado    | OTP. Migrado de link a OTP en commit `9ef96cd` para evitar Gmail prefetch.                                                                                  |
| **Invite user**          | `{{ .ConfirmationURL }}` o `{{ .Token }}` | ⚠️ Default Supabase | **Pendiente** — implementar al agregar flow de admin invita admin (próxima fase).                                                                           |
| **Magic link**           | `{{ .Token }}`                            | ⚠️ Default Supabase | **Pendiente / descartado** — nuestro flow es password-based, no usamos magic link como login. Si se llega a habilitar para login alternativo, personalizar. |
| **Change email address** | `{{ .ConfirmationURL }}` o `{{ .Token }}` | ⚠️ Default Supabase | **Pendiente** — implementar cuando se exponga "cambiar email" en /mi-cuenta. Posiblemente migrar a OTP.                                                     |
| **Reauthentication**     | `{{ .Token }}`                            | ⚠️ Default Supabase | **Pendiente** — para acciones sensibles (cambiar email, borrar cuenta). Implementar cuando se exponga right-to-deletion (Fase 4, Ley 1581).                 |

### Security (notificaciones, NO requieren acción)

| Template                  | Variable principal | Estado              | Notas                                                                                                                    |
| ------------------------- | ------------------ | ------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| **Password changed**      | —                  | ✅ Personalizado    | Lucy lo pegó 2026-05-11. Avisa al user que su password cambió. Si no fue él, contacta soporte.                           |
| **Email address changed** | —                  | ⚠️ Default Supabase | **Pendiente** — implementar junto con "Change email address" del bloque anterior.                                        |
| **Phone number changed**  | —                  | ⚠️ Default Supabase | **Pendiente / descartado** — actualmente no usamos teléfono como factor de auth. Si se agrega 2FA por SMS, personalizar. |
| **Identity linked**       | —                  | ⚠️ Default Supabase | **Pendiente / descartado** — implementar cuando se habilite social login (Google/Facebook), si llega ese momento.        |
| **Identity unlinked**     | —                  | ⚠️ Default Supabase | Idem anterior.                                                                                                           |
| **MFA method added**      | —                  | ⚠️ Default Supabase | **Pendiente** — implementar al agregar 2FA opcional (futuro, post-Phase 2).                                              |
| **MFA method removed**    | —                  | ⚠️ Default Supabase | Idem anterior.                                                                                                           |

## Cuándo revisar este doc

- Antes de implementar un flow nuevo de auth/MFA/admin que dispare un
  email, revisar si el template correspondiente está en estado
  ⚠️ Default — si sí, personalizar antes de pushear el feature.
- Al cambiar variables del template (ej. migrar de link a OTP), dejar
  registro en la columna "Estado" con commit SHA + fecha.
- Al agregar dominio custom o cambiar el dominio de imágenes, revisar
  que todas las URLs `https://lucamsshop.com/brand/*` en los
  templates apunten al dominio nuevo.

> 🙋 **ACCIÓN HUMANA PENDIENTE (2026-07-20).** Los 3 templates ya personalizados
> (**Confirm signup**, **Reset password**, **Password changed**) se pegaron a mano en Supabase
> cuando el sitio vivía en `lucams-shop.vercel.app`, así que **siguen cargando el logo desde el
> dominio viejo**. No están rotos (el alias resuelve y el logo devuelve 200 en ambos dominios),
> pero dependen de un alias de Vercel que puede cambiar. Editar los 3 en
> **Supabase → Authentication → Emails** y reemplazar `lucams-shop.vercel.app` por
> `lucamsshop.com`.

## Cómo customizar un template (paso a paso)

1. **Supabase Dashboard → Authentication → Emails → Templates**
2. Click el template correspondiente (ej. "Reset password").
3. Asegurar que está en **modo Source** (no Visual / WYSIWYG).
4. Pegar el HTML del template (ver bloques de referencia abajo o
   pedir uno nuevo si no existe el de tu flow).
5. **Save changes** (botón al fondo de la página).
6. Recargar la página del Dashboard para verificar que persiste.
7. Probar el flow end-to-end: signup / reset / etc, recibir el email,
   confirmar que se ve correcto en Gmail (renderer más restrictivo).
8. Actualizar este doc: estado del template + fecha + commit que tocó
   el template HTML correspondiente.

## Referencias

- [Supabase Auth — Email Templates](https://supabase.com/docs/guides/auth/auth-email-templates)
- [Variables disponibles](https://supabase.com/docs/guides/auth/auth-email-templates#email-template-variables):
  `{{ .Token }}`, `{{ .TokenHash }}`, `{{ .ConfirmationURL }}`,
  `{{ .SiteURL }}`, `{{ .Email }}`, `{{ .Data }}`, `{{ .RedirectTo }}`.
- HTML de los templates personalizados: vive en los mensajes de commit
  correspondientes (ej. `61be6d6` para signup, `9ef96cd` para reset).
  Se podría extraer a `apps/web/email-templates/*.html` si crece la
  cantidad — por ahora viven en Supabase Dashboard como single source.
