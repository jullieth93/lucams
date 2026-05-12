# Tracking de Email Templates Lucams_shop

> Estado de cada template de email transaccional. Vive acá para que al
> sumar nuevos flows (admin, MFA, B2B, etc.) ningún template default de
> Supabase se quede sin personalizar.

## Convención visual (válida para todos)

- **Logo:** `https://lucams-shop.vercel.app/brand/lucams-logo.png` (URL
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
  que todas las URLs `https://lucams-shop.vercel.app/brand/*` en los
  templates apunten al dominio nuevo.

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
