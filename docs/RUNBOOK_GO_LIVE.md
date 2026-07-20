# Runbook de go-live — Lucams_shop

> **Qué es esto.** El paso a paso COMPLETO para pasar de "el código está listo" a "la tienda vende de
> verdad en `lucamsshop.com`". Escrito para seguirse sin saber programar: cada paso dice **dónde
> hacer clic**, **qué escribir** y **cómo saber que quedó bien**.
>
> **Fecha:** 2026-07-20 · **Dominio:** `lucamsshop.com` (registrado en mi.com.co, [ADR-076](DECISIONS.md))

---

## ⚠️ Reglas de oro (leer antes de empezar)

1. **No te saltes el orden.** Cada fase depende de la anterior. Si haces la 5 antes de la 2, no funciona.
2. **No avances si la verificación falla.** Cada paso termina en "✅ Cómo sabes que quedó bien". Si eso
   no pasa, no sigas: devuélvete o avísame.
3. **El DNS no es inmediato.** Un cambio de DNS puede tardar de minutos a algunas horas en verse en
   todo el mundo. Es normal. No lo "arregles" cambiándolo otra vez a los 5 minutos.
4. **Nunca pegues secretos en el chat ni en el repo.** Las llaves (Wompi, Resend, Supabase) van
   ÚNICAMENTE en el panel de Vercel. Si me pides ayuda, muéstrame el NOMBRE de la variable, no el valor.
5. **Los pasos marcados 🙋 los haces tú** (requieren tus cuentas/tarjeta/identidad). Los 🤖 los hago yo
   en el código.

---

## 🗺️ Mapa: qué hace cada cuenta

| Servicio       | Para qué sirve                              | ¿Ya existe?                        |
| -------------- | ------------------------------------------- | ---------------------------------- |
| **mi.com.co**  | Donde COMPRASTE el dominio (el registro)    | ✅ Sí — `lucamsshop.com`           |
| **Cloudflare** | DNS (la "guía telefónica") + Turnstile + R2 | Cuenta gratis (crear si no hay)    |
| **Vercel**     | Donde vive y se sirve el sitio              | ✅ Sí (plan Hobby → subir a Pro)   |
| **Supabase**   | Base de datos + login de clientes           | ✅ Sí (Free → subir a Pro)         |
| **Resend**     | Envía los correos (confirmación, envío…)    | ✅ Sí (dominio por verificar)      |
| **Wompi**      | Cobra con tarjeta/PSE/Nequi                 | ⚠️ Hoy es sandbox de OTRO comercio |
| **Aveonline**  | Genera las guías de envío                   | ⚠️ Sandbox                         |

**Analogía:** mi.com.co es _la escritura_ de tu casa. Cloudflare es _la dirección_ que le dices a la
gente. Vercel es _la casa_ donde vive la tienda.

---

## 📋 Orden de ejecución

```
FASE 0  Legal/fiscal (puede ir en paralelo, pero BLOQUEA vender)
   ↓
FASE 1  DNS: mi.com.co → Cloudflare
   ↓
FASE 2  Dominio en Vercel (+ registros en Cloudflare)
   ↓
FASE 3  Configuración del proyecto en Vercel (gratis)
   ↓
FASE 4  Variables de entorno de producción   ← sin esto el sitio NO ARRANCA
   ↓
FASE 5  Correo (Resend)          FASE 6  Supabase producción
   ↓                                 ↓
FASE 7  Wompi producción         FASE 8  Aveonline producción
   ↓
FASE 9  Crons (pg_cron)  →  FASE 10  Backups R2  →  FASE 11  Turnstile
   ↓
FASE 11.b  Pagar Vercel Pro + Supabase Pro  ← el ÚNICO paso que cuesta
   ↓
FASE 12  Verificación final (compra de prueba real)
```

---

## FASE 0 — Legal y fiscal 🙋

> **Esto no rompe el sitio, pero SÍ te impide vender legalmente.** Puede avanzar en paralelo a lo técnico.

- [ ] **Matrícula mercantil** en la Cámara de Comercio (persona natural comerciante — decidido en
      [ADR-071](DECISIONS.md); no necesitas S.A.S. para arrancar).
- [ ] **RUT + NIT** en la DIAN.
- [ ] **Contador**: define tu régimen de IVA y si estás obligada a **factura electrónica**
      (Res. DIAN 000165/2023 mod. 000202/2025).
- [ ] **Abogado**: revisión de los textos legales del sitio (los drafts son base compliant, **no**
      reemplazan revisión profesional — [ADR-020](DECISIONS.md)).
- [ ] Cuando tengas **NIT**, avísame: 🤖 lo pongo en las páginas legales (hoy dicen persona natural sin NIT).

✅ **Cómo sabes que quedó bien:** tienes el NIT en la mano y el contador te dijo por escrito si facturas
electrónicamente o no.

---

## FASE 1 — DNS: apuntar mi.com.co a Cloudflare 🙋

**Por qué Cloudflare y no dejar el DNS en mi.com.co:** vas a necesitar meter ~8 registros distintos
(sitio + correo). El panel de Cloudflare es gratis, claro y no se equivoca con los registros largos
(las llaves DKIM del correo son larguísimas). Además ya usas Cloudflare para **Turnstile** (el
anti-robots del checkout) y **R2** (los backups). Es la decisión de [ADR-011](DECISIONS.md).

### ¿Y por qué no dejar que **Vercel** maneje el DNS? (Vercel lo ofrece y lo recomienda)

Vercel ofrece sus propios nameservers (`ns1/ns2.vercel-dns.com`) y **para un dominio que solo apunta a
un sitio, sería más simple** (auto-configura los registros, sin el paso manual del CNAME). Pero este
dominio tiene que hacer **tres** trabajos, no uno:

| Trabajo del dominio                                                      | Vercel DNS     | Cloudflare DNS |
| ------------------------------------------------------------------------ | -------------- | -------------- |
| Apuntar el sitio a Vercel                                                | ✅ (más fácil) | ✅             |
| **Enviar** correos (Resend: MX/SPF/DKIM/DMARC)                           | ✅             | ✅             |
| **RECIBIR** correos en `hola@`, `habeas-data@`, `retracto@`, `security@` | ❌             | ✅ **gratis**  |

**El factor decisivo es recibir correo.** `habeas-data@lucamsshop.com` es una **obligación legal**
(Ley 1581) y tiene que llegar a algún lado. **Cloudflare Email Routing lo reenvía gratis** a un Gmail —
pero su documentación es explícita: _"You must be using Cloudflare DNS to use Email Service"_
([doc](https://developers.cloudflare.com/email-routing/get-started/enable-email-routing/)).

Con DNS en Vercel habría que pagar buzones (Google Workspace ≈ USD 6–7/usuario/mes ≈ $25.000–30.000
COP/mes) solo para poder recibir esos 4 correos.

**Otro punto:** con el DNS en Cloudflare, el dominio no queda atado al hosting. Si algún día se cambia
Vercel por otra cosa, se toca **un registro**, no se migra el DNS entero.

**Lo único que "cuesta" Cloudflare:** crear el CNAME de Vercel a mano, una sola vez (2 minutos).

### 1.a — ANTES de tocar Cloudflare: revisar mi.com.co 🙋

> No es opcional: dos de estos puntos pueden **tumbar la tienda** meses después si se saltan.

1. **📸 Menú `DNS`: verifica que esté vacío.** Si dice **"No hay registros DNS configurados"** (caso
   de `lucamsshop.com`, verificado 2026-07-20), **no hagas nada ahí** — NO uses el formulario "Agregar
   registro". Los registros se crearán en Cloudflare. Si en cambio SÍ hubiera registros (sobre todo
   **MX** de correo), toma captura antes de migrar: al cambiar los nameservers dejan de usarse.

2. **🔒 Menú `Seguridad` → sección PROTECCIONES: enciende DOS interruptores** (quedan azules):

   | Interruptor              | Acción                    | Por qué                                                                                                                                    |
   | ------------------------ | ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
   | **Auto-renovación**      | Ya viene **encendido** ✅ | No lo toques. Si se apaga, el dominio vence y la tienda muere.                                                                             |
   | **WHOIS Privacy**        | **ENCIÉNDELO**            | Oculta tu **nombre, dirección y teléfono** del WHOIS público. Coherente con [ADR-071](DECISIONS.md) (en los legales publicamos lo mínimo). |
   | **Protección anti-robo** | **ENCIÉNDELO**            | Es el candado: "bloquea transferencias no autorizadas". Es lo que hace que arriba diga 🔓 **"Sin protección"**.                            |

   **El candado NO estorba el cambio de nameservers** — bloquea _transferencias_ a otro registrador,
   no la configuración. La guía oficial de mi.com.co para cambiar DNS no pide desbloquear nada
   ([guía](https://soporte.mi.com.co/cambiar-los-servidores-dns/)).

   > **"Código de autorización: No disponible"** en esa misma pantalla es normal y **no hay que
   > hacer nada**: es el código EPP, que solo sirve para MUDAR el dominio a otro registrador. No lo
   > vas a usar.
   >
   > Si al encender alguno te manda a **pagar**, detente y consúltalo antes.

3. **📧 Menú `Contactos` → BUSCA EL CORREO DE VERIFICACIÓN DE ICANN EN TU BANDEJA.**
   Los 4 contactos (Registrant / Admin / Tech / Billing) deben tener un correo tuyo, real y accesible.
   Al registrar un dominio, ICANN obliga a **verificar el correo del titular**: el registrador manda un
   correo con un enlace. **Si no se hace clic en ese enlace, el dominio se SUSPENDE** (típicamente a
   los ~15 días) y la tienda se cae sin aviso.
   - Revisa la bandeja **y la carpeta de spam** del correo del titular, busca el mensaje de mi.com.co
     o del registro, y haz clic en el enlace de verificación.
   - `lucamsshop.com` se registró el **19/07/2026**, así que ese correo debe ser reciente.

   > ✅ **Correcto y a propósito:** el correo del titular es un **Gmail personal**, NO
   > `hola@lucamsshop.com`. Debe seguir así. Si pusieras un correo del propio dominio y el dominio se
   > cae o vence, perderías el acceso al correo que necesitas justamente para recuperarlo (dependencia
   > circular). El contacto del dominio siempre va en un correo **independiente**.

   > 🛡️ Con **WHOIS Privacy** activo, esos datos personales (dirección, teléfono) **ya no salen** en el
   > WHOIS público: el registro muestra los del registrador. Los datos reales siguen guardados en el
   > panel, que es lo correcto.

4. **💳 Medio de pago vigente.** La auto-renovación ya está activa, pero vence **19/07/2027**: si ese
   día la tarjeta falla, la tienda se cae.

5. **↪️ Redirección** — si tienes activa alguna redirección o página de "parqueo" en mi.com.co,
   déjala anotada. Al pasar el DNS a Cloudflare deja de aplicar, y su registro `A`/`CNAME` es
   justamente el que hay que borrar (ver la advertencia del import más abajo).

✅ **Listo para seguir cuando:** tienes la captura del DNS actual, el candado activado, el correo de
contacto verificado y la auto-renovación con medio de pago vigente.

---

### 1.b — Crear el sitio en Cloudflare

1. Entra a [cloudflare.com](https://cloudflare.com) → **Sign up** (gratis) o inicia sesión.
2. **Add a site** → escribe `lucamsshop.com` → selecciona el plan **Free** → **Continue**.

### 1.c — Pantalla "Connect your domain" (qué seleccionar y por qué)

Cloudflare muestra una pantalla con políticas de bots de IA. Esto es lo que aplica a una **tienda
sin anuncios** como la tuya. Las tres categorías significan cosas distintas
([Cloudflare — Manage AI crawlers](https://developers.cloudflare.com/ai-crawl-control/features/manage-ai-crawlers/)):

| Opción                           | Qué elegir                          | Por qué                                                                                                                                                                                                                                                                                                    |
| -------------------------------- | ----------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Search**                       | **Allow** (deja el recomendado)     | Son los buscadores (Google). Bloquearlos = desaparecer de Google. **No negociable para una tienda.**                                                                                                                                                                                                       |
| **Agent**                        | **Allow** (deja el recomendado)     | Bots que actúan **en tiempo real por una persona** (alguien le pide a ChatGPT "dónde compro imanes personalizados en Colombia" y el bot entra a tu sitio). Son clientes potenciales.                                                                                                                       |
| **Training**                     | **Block** (cambia el recomendado)   | ⚠️ El recomendado es _"Block on pages with ads"_ — **está pensado para medios que monetizan con anuncios. Tu sitio NO tiene anuncios, así que esa opción no bloquea nada.** Bloquear entrenamiento protege tus fotos y diseños y **no cuesta nada de SEO** (Search es categoría aparte y sigue permitida). |
| **Block training in robots.txt** | **Déjalo encendido**                | Es una señal adicional (educada) para los bots. **Verificado: Cloudflare NO reemplaza tu `robots.txt`, lo antepone al tuyo** — tu `Sitemap:` y tus reglas siguen intactas ([doc](https://developers.cloudflare.com/bots/additional-configurations/managed-robots-txt/)).                                   |
| **Import DNS records**           | **Automatic** (deja el recomendado) | Copia los registros que ya existan en mi.com.co para no perder nada. **Ver la advertencia de abajo.**                                                                                                                                                                                                      |

> 🚨 **Advertencia crítica sobre el import de DNS.** Cuando termine el escaneo, **revisa la lista de
> registros importados y BORRA cualquier `A` o `CNAME` de `@` (el dominio raíz) o de `www` que apunte a
> mi.com.co** (suelen ser páginas de "parqueo" del registrador). Si los dejas, **chocan con el registro
> de Vercel que vas a crear en la FASE 2** y el sitio no abre o abre la página del registrador.
> Los registros de correo (**MX**, **TXT**) sí se conservan.

**Ninguna de estas opciones es permanente:** todas se cambian después en el panel de Cloudflare.

### 1.d — Cambiar los nameservers en mi.com.co

1. Cloudflare te mostrará **dos nameservers**, del estilo `xxxx.ns.cloudflare.com` y
   `yyyy.ns.cloudflare.com`. **Cópialos.**
2. Entra a **mi.com.co** → tu dominio `lucamsshop.com` → menú lateral **Nameservers**.
3. **Reemplaza** los dos que estén ahí por los DOS de Cloudflare → **Guardar cambios**.
4. Vuelve a Cloudflare → **Done, check nameservers**.

> ⏱️ **mi.com.co indica 12 a 24 horas de propagación** y sugiere verificar en
> [dnslookup.es](https://dnslookup.es/)
> ([guía oficial](https://soporte.mi.com.co/cambiar-los-servidores-dns/)). Mientras propaga, puede
> seguir apareciendo la página vieja o de parqueo: **es normal, no lo toques**.

**Dos avisos de la pantalla "Update your nameservers" de Cloudflare:**

- ⚠️ **DNSSEC debe estar APAGADO.** Si el registrador tiene DNSSEC activo y cambias los nameservers,
  el dominio **deja de resolver por completo** (el sitio queda inalcanzable, no es un simple retraso).
  En el panel de mi.com.co de `lucamsshop.com` la sección **Seguridad** solo ofrece Auto-renovación,
  WHOIS Privacy y Protección anti-robo — **no hay DNSSEC**, así que está apagado y no hay nada que
  hacer. Si algún día aparece, apágalo ANTES de tocar nameservers.
- ⛔ **IGNORA "Only allow Cloudflare IP addresses at your origin".** Esa recomendación es para quien
  sirve el sitio desde su propio servidor detrás del proxy de Cloudflare. **Aquí el origen es Vercel y
  usamos Cloudflare solo-DNS (nube gris)**, así que el tráfico NO llega desde IPs de Cloudflare:
  aplicar ese bloqueo **tumbaría el sitio**.

> 💡 Si no encuentras dónde cambiarlos, escríbele a soporte de mi.com.co: _"Necesito apuntar los
> nameservers de lucamsshop.com a Cloudflare"_ y les pasas los dos.

✅ **Cómo sabes que quedó bien:** Cloudflare te manda un correo _"lucamsshop.com is now active"_ y en su
panel el dominio aparece **Active** (no "Pending"). Puede tardar de minutos a 24h.

---

## FASE 2 — Conectar el dominio a Vercel 🙋

1. Vercel → tu proyecto **lucams-shop** → **Settings** → **Domains** → **Add Domain**.
2. Escribe `lucamsshop.com` → **Add**. Vercel te va a ofrecer agregar también `www.lucamsshop.com`:
   **acéptalo** (Vercel recomienda usar www y redirigir).
3. Vercel te mostrará **los registros exactos que debes crear**, en la pestaña **DNS Records**.
   En `lucamsshop.com` (2026-07-20) Vercel entregó un **CNAME en la raíz (`@`)**, no un registro A:

   | Type      | Name | Value                           | Proxy              |
   | --------- | ---- | ------------------------------- | ------------------ |
   | **CNAME** | `@`  | `<id-único>.vercel-dns-017.com` | **Disabled** ← ojo |
   - Vercel avisa: _"We're expanding our IP range… the legacy records `cname.vercel-dns.com` y
     `76.76.21.21` will continue to work"_ → **no uses los viejos**, usa el que te muestre tu panel.
   - Un CNAME en la raíz normalmente no es válido en DNS, pero **Cloudflare lo permite** porque aplana
     el CNAME de la raíz automáticamente (CNAME flattening). Por eso funciona.
   - **El propio Vercel marca `Proxy: Disabled`** — es exactamente la nube **gris** de Cloudflare.
   - ⛔ **Ignora la pestaña "Vercel DNS"** (la que ofrece `ns1/ns2.vercel-dns.com`): eso es para quien
     quiere que Vercel maneje el DNS. Nosotros usamos Cloudflare.

   > 🔴 Mientras el registro no exista, Vercel muestra **"Invalid Configuration"** en rojo. **Es normal
   > y esperado**, no es un fallo: desaparece al crear el registro y darle **Refresh**.

   > ⚠️ **Copia los valores TAL CUAL te los muestre tu panel de Vercel.** No los saques de un tutorial de
   > internet: hoy Vercel asigna un **CNAME único por proyecto** (del estilo
   > `d1d4fc829fe7bc7c.vercel-dns-017.com`), así que un valor copiado de otro lado **no sirve**.
   > (Fuente: [Vercel — Adding & Configuring a Custom Domain](https://vercel.com/docs/domains/working-with-domains/add-a-domain))

4. Ve a **Cloudflare** → `lucamsshop.com` → **DNS** → **Add record**, y crea los que te dio Vercel:
   - Tipo **A**, Name `@`, Content = la IP que te dio Vercel.
   - Tipo **CNAME**, Name `www`, Target = el CNAME único que te dio Vercel.

5. 🚨 **EL PASO QUE MÁS SE EQUIVOCA:** en cada uno de esos registros, la nubecita **debe quedar GRIS**
   ("DNS only"), **NO naranja** ("Proxied").

   **Por qué:** Vercel **no recomienda** poner Cloudflare como proxy delante — le quita visibilidad del
   tráfico (se rompe su Firewall y su detección de bots, que es justo lo que protege tu checkout),
   agrega latencia y genera problemas de caché y de certificado SSL. Cloudflare **solo como DNS**
   (nube gris) sí es correcto.
   (Fuente: [Vercel KB — Should I use Cloudflare in front of Vercel?](https://vercel.com/kb/guide/cloudflare-with-vercel))

✅ **Cómo sabes que quedó bien:** en Vercel → Settings → Domains, `lucamsshop.com` aparece con
**Valid Configuration** (✓ verde) y ya no dice "Invalid Configuration". Al entrar a
`https://lucamsshop.com` carga la tienda con candado 🔒 (Vercel emite el certificado solo).

---

## FASE 3 — Configuración del proyecto en Vercel (gratis) 🙋

> 💰 **Los pagos NO van aquí.** El upgrade a Vercel Pro y Supabase Pro se movió al FINAL (FASE 11.b),
> justo antes de abrir la tienda. Todo lo demás se configura **sin pagar nada**, y no tiene sentido
> quemar meses de suscripción mientras aún estás armando. Mientras no cobres dinero real, Hobby
> alcanza para trabajar (su límite de 60s de función es justo el que necesita el render 300 DPI).

1. Settings → **General** → confirma:
   - **Root Directory** = `apps/web` ← **crítico**: sin esto el deploy falla con _"No Next.js version detected"_.
   - **Node.js Version** = `22.x`.
2. Settings → **Functions**: confirma que **Fluid Compute** esté activo (el render de las fotos en alta
   resolución necesita hasta 60s de ejecución).

✅ **Cómo sabes que quedó bien:** el último deploy en Vercel dice **Ready**.

---

## FASE 4 — Variables de entorno de producción 🙋 (la más importante)

> 🚨 **Si falta una sola de estas, el sitio NO ARRANCA en producción.** Está hecho a propósito: es
> preferible que no abra a que abra sin poder cobrar o sin enviar correos (`apps/web/lib/env.ts`).

Vercel → Settings → **Environment Variables** → cada una con ambiente **Production**.

### Grupo A — Base (sin esto no arranca en NINGÚN ambiente)

| Variable                               | De dónde sale                                             |
| -------------------------------------- | --------------------------------------------------------- |
| `DATABASE_URL`                         | Supabase → Settings → Database (usa el **pooler**, :6543) |
| `DIRECT_URL`                           | Supabase → Settings → Database (conexión directa, :5432)  |
| `NEXT_PUBLIC_SUPABASE_URL`             | Supabase → Settings → API                                 |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Supabase → Settings → API                                 |
| `SUPABASE_SECRET_KEY`                  | Supabase → Settings → API (**secreta**, nunca al cliente) |
| `CSRF_SECRET`                          | Genera un texto largo y aleatorio                         |

### Grupo B — Obligatorias en producción real

| Variable                         | Valor / de dónde sale                    |
| -------------------------------- | ---------------------------------------- |
| `NEXT_PUBLIC_SITE_URL`           | `https://lucamsshop.com`                 |
| `WOMPI_PUBLIC_KEY`               | Wompi producción (FASE 7)                |
| `WOMPI_PRIVATE_KEY`              | Wompi producción                         |
| `WOMPI_EVENTS_SECRET`            | Wompi producción                         |
| `WOMPI_INTEGRITY_SECRET`         | Wompi producción                         |
| `AVEONLINE_USUARIO`              | Aveonline producción (FASE 8)            |
| `AVEONLINE_CLAVE`                | Aveonline producción                     |
| `AVEONLINE_WEBHOOK_SECRET`       | Lo inventas tú (texto largo aleatorio)   |
| `RESEND_API_KEY`                 | Resend (FASE 5)                          |
| `EMAIL_FROM`                     | `Lucams_shop <hola@mail.lucamsshop.com>` |
| `TURNSTILE_SECRET_KEY`           | Cloudflare Turnstile (FASE 11)           |
| `NEXT_PUBLIC_TURNSTILE_SITE_KEY` | Cloudflare Turnstile (FASE 11)           |
| `CRON_SECRET`                    | Lo inventas tú (texto largo aleatorio)   |
| `NEXT_PUBLIC_WA_NUMBER`          | `573208873826`                           |

### Grupo C — Opcionales

`GEMINI_API_KEY` (asistente de diseño; si falta, esa función se apaga sola), `R2_*` (backups, FASE 10),
`LOG_LEVEL=info`.

> 🚫 **NO pongas** `WOMPI_DISABLE_TIMESTAMP_CHECK` en producción. Es solo para depurar en local y apaga
> una defensa del webhook de pagos. Si queda en `true`, el sitio se niega a arrancar (a propósito).

✅ **Cómo sabes que quedó bien:** haces **Redeploy** y el deploy queda **Ready**. Si falta alguna, el log
del deploy dice exactamente cuál: _"Faltan variables de PRODUCCIÓN: …"_.

---

## FASE 5 — Correo con tu dominio (Resend) 🙋

**Por qué un subdominio (`mail.lucamsshop.com`) y no el dominio pelado:** Resend lo recomienda para
aislar la reputación de envío — si algo sale mal con los correos, no se quema el dominio principal.
(Fuente: [Resend — Domains](https://resend.com/docs/dashboard/domains/introduction))

1. Resend → **Domains** → **Add Domain** → escribe `mail.lucamsshop.com`.
2. Resend te mostrará varios registros: **MX** (para rebotes), **TXT de SPF**, **TXT de DKIM** y
   guía de **DMARC**. **Cópialos tal cual** (el DKIM es larguísimo: cópialo completo, sin espacios).
3. Cloudflare → DNS → **Add record** → crea cada uno. (Estos son de correo: la nubecita gris/naranja
   no aplica a MX/TXT.)
4. Vuelve a Resend → **Verify**.
5. Cuando quede verificado, pon en Vercel `EMAIL_FROM=Lucams_shop <hola@mail.lucamsshop.com>`.

### Buzones que debes poder RECIBIR

Tus textos legales publican estas direcciones — deben existir y que alguien las lea:

- [ ] `hola@lucamsshop.com` — contacto general
- [ ] `habeas-data@lucamsshop.com` — derechos de datos personales (Ley 1581) ← **obligatorio por ley**
- [ ] `retracto@lucamsshop.com` — derecho de retracto (Ley 1480)
- [ ] `security@lucamsshop.com` — reporte de vulnerabilidades

> 💡 Enviar (Resend) y recibir son cosas distintas. Para RECIBIR necesitas un buzón: lo más simple es
> Google Workspace o Zoho Mail, o **reenvío gratuito** con Cloudflare Email Routing hacia tu Gmail.

✅ **Cómo sabes que quedó bien:** Resend muestra el dominio **Verified**, y una compra de prueba (FASE 12)
te llega **a la bandeja de entrada, no a spam**.

---

## FASE 6 — Supabase producción 🙋

1. Supabase → tu proyecto → **Authentication** → **URL Configuration**:
   - **Site URL** = `https://lucamsshop.com`
   - **Redirect URLs**: agrega `https://lucamsshop.com/**`
     > **Si no haces esto**, los correos de confirmación y de "recuperar contraseña" mandarán a tus
     > clientes al dominio viejo/localhost y no van a poder entrar.
     > (Fuente: [Supabase — Redirect URLs](https://supabase.com/docs/guides/auth/redirect-urls))
2. **Sube a Plan Pro** (Settings → Billing): el Free **pausa el proyecto por inactividad** (tu tienda se
   caería sola) y no tiene _Point-in-Time Recovery_.

✅ **Cómo sabes que quedó bien:** creas una cuenta de cliente de prueba en el sitio y el correo de
confirmación te lleva a `https://lucamsshop.com`, no a localhost.

---

## FASE 7 — Wompi producción (cobrar de verdad) 🙋

> ⚠️ **Hoy el sitio usa un sandbox que NO es tuyo** (aparece el comercio "KAIU"). Con eso **no puedes
> recibir plata**.

1. Crea/activa **tu propia cuenta** de comercio en Wompi y completa la validación (te pedirán RUT/NIT →
   por eso la FASE 0 importa).
2. Wompi → **Desarrolladores** → copia las llaves de **producción**: pública, privada, _integrity_ y
   _events_.
3. Ponlas en Vercel (FASE 4, grupo B) y **Redeploy**.
4. Wompi → configura la **URL de eventos (webhook)**:
   `https://lucamsshop.com/api/webhooks/wompi`

✅ **Cómo sabes que quedó bien:** haces una **compra real de bajo monto** (ej. $5.000) con tu propia
tarjeta; el pedido aparece en `/admin/pedidos` como **PAGADO** y te llega el correo de confirmación.
Luego te reembolsas.

---

## FASE 8 — Aveonline producción (envíos reales) 🙋

1. Activa tu cuenta de producción en Aveonline y pide usuario/clave de producción.
2. Ponlos en Vercel: `AVEONLINE_USUARIO`, `AVEONLINE_CLAVE`, `AVEONLINE_ENV=production`.
3. Inventa un texto largo aleatorio para `AVEONLINE_WEBHOOK_SECRET` y **el mismo** configúralo en
   Aveonline junto con la URL del webhook: `https://lucamsshop.com/api/webhooks/aveonline`

✅ **Cómo sabes que quedó bien:** el pedido de prueba de la FASE 7 genera **guía real** y aparece el
número de rastreo en el detalle del pedido.

---

## FASE 9 — Crons (que la operación no arranque ciega) 🙋

Sin esto **no corren** las alertas ni el resumen diario de las 8am, ni los recordatorios de carrito
abandonado. Trabajas a ciegas.

1. Define `CRON_SECRET` en Vercel (FASE 4) — un texto largo aleatorio.
2. En **Supabase → SQL Editor**, agenda los jobs de `pg_cron` que llaman a estas rutas mandando el
   header `x-cron-secret`:
   - `/api/cron/alerts` — alertas de fallas
   - `/api/cron/daily-summary` — resumen diario 8am
   - `/api/cron/review-request`, `/api/cron/cart-recovery`, `/api/cron/back-in-stock`, limpieza
     > El SQL exacto y el manejo del secreto vía **Vault** están en
     > [`OPERATIONS.md § Jobs HTTP pg_cron`](OPERATIONS.md). 🤖 Si quieres, te lo dejo listo para pegar.

✅ **Cómo sabes que quedó bien:** al día siguiente te llega el **correo de resumen diario** a las 8am.

---

## FASE 10 — Backups fuera de Supabase (R2) 🙋

El código de backup ya existe y está probado, pero **nunca se ha corrido de verdad** (las llaves son
placeholders).

1. Cloudflare → **R2** → crea el bucket `lucams-backups`.
2. Crea un **API Token** de R2 y guarda: `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`,
   `R2_BUCKET`.
3. Ponlos como **GitHub Secrets** (el backup corre por GitHub Actions) y dispara el workflow **una vez a
   mano** para comprobar que el archivo llega al bucket.
4. Haz el **simulacro de restauración** (DR drill) al menos una vez antes de manejar plata real.

✅ **Cómo sabes que quedó bien:** ves el archivo de backup dentro del bucket R2, con fecha de hoy.

---

## FASE 11 — Turnstile para el dominio nuevo 🙋

1. Cloudflare → **Turnstile** → tu widget → agrega `lucamsshop.com` a los **dominios permitidos**
   (si el widget se creó para otro dominio, el checkout puede rechazar clientes legítimos).
2. Copia **Site Key** y **Secret Key** → Vercel (`NEXT_PUBLIC_TURNSTILE_SITE_KEY`, `TURNSTILE_SECRET_KEY`).

✅ **Cómo sabes que quedó bien:** completas un checkout en `lucamsshop.com` sin que te bloquee.

---

## FASE 11.b — Pagos de infraestructura (justo antes de abrir) 🙋

> Se dejan para el final **a propósito**: configurar todo lo anterior es gratis. Estos dos se pagan
> cuando la tienda va a recibir dinero real — ni antes.

1. **Vercel Pro.** Settings → Billing → **Upgrade to Pro**.
   > **No es opcional para vender:** los Términos de Servicio de Vercel **prohíben el uso comercial en
   > el plan Hobby** (verificado en `OPERATIONS.md § Verificación de tiers Free`). Mientras solo
   > configuras y pruebas con sandbox, Hobby está bien; el día que cobres de verdad, ya debes estar en Pro.
2. **Supabase Pro.** Settings → Billing.
   > El plan Free **pausa el proyecto por inactividad** — la tienda se caería sola — y no tiene
   > _Point-in-Time Recovery_ (recuperar la base a un momento exacto). Con dinero y pedidos reales de
   > por medio, eso no es aceptable.

✅ **Cómo sabes que quedó bien:** ambas cuentas muestran plan de pago activo y el sitio sigue **Ready**.

---

## FASE 12 — Verificación final: una compra real de punta a punta 🙋

Haz **una compra de verdad, de bajo monto**, como si fueras cliente:

- [ ] Entras a `https://lucamsshop.com` (con candado 🔒).
- [ ] Personalizas un producto en el Estudio y **subes una foto** (marcando la casilla de derechos).
- [ ] Agregas al carrito y pagas con **tarjeta real**.
- [ ] Llega el **correo de confirmación** (a bandeja, no spam).
- [ ] El pedido sale en `/admin/pedidos` como **PAGADO**, con **guía de Aveonline**.
- [ ] Apruebas el diseño en `/admin/moderacion` y marcas **ENVIADO** → llega el correo de envío.
- [ ] Te **reembolsas** desde el admin.

✅ Si los 7 pasan: **la tienda está viva.** 🎉

---

## 🤖 Qué hago yo cuando me avises

| Cuando tengas…                           | Yo hago                                                        |
| ---------------------------------------- | -------------------------------------------------------------- |
| **NIT + figura legal confirmada**        | Actualizo las páginas legales con el NIT real                  |
| **Decisión del contador sobre IVA/DIAN** | Ajusto el copy de facturación e IVA del checkout               |
| El SQL de los crons                      | Te lo dejo listo para pegar en Supabase                        |
| Un error en cualquier fase               | Lo diagnostico (mándame el mensaje textual + en qué paso ibas) |

---

## 🆘 Errores comunes

| Síntoma                                             | Causa casi siempre                                                       |
| --------------------------------------------------- | ------------------------------------------------------------------------ |
| Vercel dice _"Invalid Configuration"_               | La nubecita quedó **naranja** en Cloudflare. Ponla **gris** (DNS only).  |
| El deploy falla: _"No Next.js version detected"_    | Falta **Root Directory = `apps/web`** (FASE 3).                          |
| El deploy falla: _"Faltan variables de PRODUCCIÓN"_ | Te faltó una del Grupo B (FASE 4). El log dice cuál.                     |
| Los correos caen en **spam**                        | Falta verificar `mail.lucamsshop.com` en Resend, o falta DMARC (FASE 5). |
| El correo de "confirma tu cuenta" va a localhost    | Falta la **Site URL** de Supabase (FASE 6).                              |
| El dominio no resuelve todavía                      | Es propagación de DNS. Espera; puede tardar horas.                       |
| Pagas y el pedido queda PENDIENTE                   | La **URL del webhook** de Wompi está mal (FASE 7).                       |

---

## Referencias oficiales usadas

- [Vercel — Adding & Configuring a Custom Domain](https://vercel.com/docs/domains/working-with-domains/add-a-domain)
- [Vercel KB — Should I use Cloudflare in front of Vercel?](https://vercel.com/kb/guide/cloudflare-with-vercel)
- [Resend — Domains](https://resend.com/docs/dashboard/domains/introduction)
- [Supabase — Redirect URLs](https://supabase.com/docs/guides/auth/redirect-urls)
