I have all the evidence needed. Here is my audit report.

# Frente 6 — Anti-bot (Turnstile) + anti-abuso de flujos públicos

Auditoría contra `docs/SECURITY.md` (líneas 34, 41, 68-90, 840, 851, 1252-1295) + código real. Stack confirmado: Server Actions + Postgres rate-limit + Cloudflare Turnstile (`lib/turnstile.ts`).

## Resumen ejecutivo

| Control | Estado | Severidad |
|---|---|---|
| Turnstile en contacto | ✅ | — |
| Turnstile en newsletter | ✅ | — |
| Turnstile en registro | ❌ | P1 |
| Turnstile en recuperar-password | ❌ | P1 |
| Turnstile en login | 🟡 (rate-limit cubre, falta CAPTCHA) | P2 |
| Turnstile en OTP (confirmar/resend) | ❌ | P2 |
| Turnstile en checkout | ❌ | P1 |
| Honeypots en forms públicos | ❌ (spec lo exige, cero implementado) | P2 |
| Rate-limit flujos auth | ✅ | — |
| Rate-limit checkout | ❌ | P1 |
| Rate-limit catálogo/AI | 🟡 (recommend/search/products sí; cms/search no) | P2 |
| Anti-enumeración login/registro/reset | ✅ / 🟡 / ✅ | P2 |
| Anti-spam reseñas | N/A — flujo público no existe (CTA roto) | P1 (funcional) |
| Abuso de stock (creación masiva órdenes) | 🟡 (sin reserva con TTL, pero sin decremento hasta PAID) | P2 |

---

## 1. Turnstile: dónde está y dónde falta

**✅ Implementado y verificado correctamente:**
- `lib/turnstile.ts:28-73` — `verifyTurnstileToken` server-side bien hecho: fail-closed en prod si falta secret (`:36-38`), timeout 5s, logging. Patrón sólido.
- Contacto: `app/contacto/contact-form.tsx:137` (widget) + `features/support/actions.ts:67-71` (verify). ✅
- Newsletter: `components/newsletter-form.tsx:103` + `features/newsletter/actions.ts:50-54`. ✅
- Env vars declaradas: `NEXT_PUBLIC_TURNSTILE_SITE_KEY` + `TURNSTILE_SECRET_KEY` presentes en `.env.example` y `.env.local`.

**❌ FALTA Turnstile en los flujos de mayor abuso** (grep en `app/(auth)` y `app/checkout` = cero ocurrencias):

- **Registro** (`registro-form.tsx` + `registro/actions.ts`) — NO hay widget ni verify. `SECURITY.md:840` lo manda explícito ("Bot crea 1000 cuentas/min → Rate limit + Turnstile"). El registro hoy depende solo de rate-limit (10/h prod) + Pwned Passwords. **P1.**
- **Recuperar-password** (`recuperar-password/actions.ts`) — NO hay Turnstile. Vector clásico de email-bombing (cada request dispara un correo de Supabase). Solo rate-limit 10/h. **P1.**
- **Checkout** — `SECURITY.md:41` ("Pago fraudulento → Wompi 3DS + Turnstile"). NO hay Turnstile en ningún paso. **P1** (ver §4).
- **OTP** confirmar-codigo / resend (`confirmar-codigo/actions.ts:68,144`) — solo rate-limit IP. **P2** (el OTP en sí ya es anti-bot; resend tiene 3/15min).
- **Login** (`login/actions.ts`) — solo rate-limit. El widget de login es opcional si el rate-limit por IP+email es estricto; recomendable Turnstile tras N fallos. **P2.**

**Fix:** añadir `<TurnstileWidget />` a `registro-form.tsx`, `recuperar-form.tsx`, y `checkout/pago` form; en cada action leer `formData.get("cf-turnstile-response")` y llamar `verifyTurnstileToken(token, ip)` antes de la mutación — copiar el patrón exacto de `features/support/actions.ts:67-71`. Esfuerzo **M** (5 forms × widget+verify). **AUTÓNOMO** en código; **NECESITA-LUCY** solo para confirmar que las site/secret keys reales estén en Vercel env (ACCIÓN HUMANA: verificar `NEXT_PUBLIC_TURNSTILE_SITE_KEY` y `TURNSTILE_SECRET_KEY` en producción — si faltan, `verifyTurnstileToken` bloquea TODO en prod por fail-closed).

**🟡 Honeypots:** `SECURITY.md:1248-1253` exige `<input name="website" hidden>` en forms públicos como complemento cero-costo. Grep confirma **cero honeypots** en contacto/newsletter/registro. **P2, S, AUTÓNOMO.**

---

## 2. Flujos públicos que mutan: rate-limit + validación

**✅ Bien cubiertos** (rate-limit doble IP+email vía `lib/rate-limit.ts` sobre Postgres, Zod en todos):
- Registro: `registro/actions.ts:96-97` (10/h prod).
- Login: `login/actions.ts:62-63` (15/15min prod).
- Reset: `recuperar-password/actions.ts:55-60` (10/h prod).
- OTP verify/resend: `confirmar-codigo/actions.ts:68,144`.
- Contacto: `support/actions.ts:79-80` (5/día IP, 3/día email).
- Newsletter: `newsletter/actions.ts:58-60` (5/h).

**🟡 Carrito** (`carrito/actions.ts`): Zod validación ✅ pero **sin rate-limit alguno** en `addToCartAction`/`updateQtyAction`. Bajo riesgo (no manda emails ni crea órdenes, solo escribe `CartItem` por sessionId), pero permite inflar la tabla cart. **P2, S, AUTÓNOMO.**

**Nota deuda ya documentada:** `SECURITY.md:73` + comentarios en los actions reconocen que en pre-launch los buckets IP==email (no hay defense-in-depth real contra single-source). El TODO de bajar a 3/h signup, 3/h reset al lanzar productivo sigue **pendiente** — relevante para launch. **P1 al lanzar, S, AUTÓNOMO** (cambiar constantes; el código ya discrimina por `VERCEL_ENV==="production"`).

---

## 3. Enumeración de usuarios

- **Login** ✅: `login/actions.ts:90` devuelve "Credenciales incorrectas" genérico, sin distinguir email-no-existe de password-mal. Correcto (`SECURITY.md:839`).
- **Reset** ✅: `recuperar-password/actions.ts:80-92` redirige igual exista o no el email (anti-leak correcto).
- **Registro** 🟡: `registro/actions.ts:166-174` devuelve **"Este correo ya tiene una cuenta. Inicia sesión o usa 'Olvidé mi contraseña'"** cuando el email ya existe (detecta `identities=[]`). Esto **es enumeración**: un atacante confirma qué emails están registrados. Es un trade-off UX deliberado (mensaje accionable) y muy común, pero técnicamente leak. `SECURITY.md:1288` pide mensajes consistentes. **P2** — **NECESITA-LUCY** (decisión UX: o mensaje genérico "te enviamos un email" siempre, o aceptar el leak documentándolo en `DECISIONS.md`). El rate-limit por IP (10/h) acota el scraping masivo.

---

## 4. Abuso de checkout / carrito (creación masiva de órdenes / reserva de stock)

- **Checkout sin rate-limit ni Turnstile**: `checkout/pago/actions.ts` (`payWompiAction`) y `checkout/datos/actions.ts` (`saveDatosAction`) — grep confirma cero `rateLimit`/`turnstile` en `features/checkout` y `app/checkout`. `SECURITY.md:851` manda explícitamente "Rate limit `/api/checkout/create` 10/10min". **No implementado. P1, M, AUTÓNOMO** (añadir `rateLimit(ipKey("checkout", ip), ...)` en `finalizeCheckout`/`payWompiAction`).
- **Reserva de stock con TTL**: `SECURITY.md:851` describe "TTL 15min en `StockReservation` libera stock". **No existe modelo `StockReservation`** — el stock NO se decrementa en `PENDING_PAYMENT`, solo en la transición a `PAID` vía webhook (`orders/saga.ts:153-159`). Esto en realidad **mitiga** el riesgo de reserva-masiva (un bot creando órdenes PENDING_PAYMENT no bloquea stock real), pero diverge de la spec. El riesgo residual es inflar la tabla `Order` con basura PENDING_PAYMENT sin pagar. **P2** — combinado con el rate-limit de checkout (arriba) queda cubierto. La divergencia spec-vs-código debería anotarse en `DECISIONS.md` (no hace falta `StockReservation` dado el modelo decrement-on-PAID).

---

## 5. Anti-spam reseñas

- **No existe flujo público de creación de reseñas.** `features/reviews/` solo tiene `public-service.ts` (lee `isApproved=true`) y `admin-service.ts` (moderación). No hay action de submit cliente.
- **BUG funcional, no de seguridad:** el CTA "Dejar reseña" en `app/mi-cuenta/pedidos/[number]/page.tsx:271` enlaza a `/producto/[slug]?review=1`, pero `app/producto/` **no maneja `?review=1`** (grep cero ocurrencias) — el botón no abre ningún formulario. **P1 funcional** (CTA muerto pre-launch). Cuando se implemente el submit: requerirá Turnstile + rate-limit + verificación de compra (solo reseñar productos comprados) + sanitización DOMPurify (`SECURITY.md:527`). **NECESITA-LUCY** (decisión: implementar reseñas para launch o esconder el CTA).

---

## Prioridad para launch (Bloque C)

1. **P1 — Turnstile + rate-limit en checkout** (`checkout/pago/actions.ts`, `features/checkout/service.ts`). Autónomo, M.
2. **P1 — Turnstile en registro y recuperar-password.** Autónomo, M. (+ ACCIÓN HUMANA: keys reales en Vercel.)
3. **P1 — Bajar rate-limits prod a estrictos** (signup 3/h, reset 3/h) antes de launch — deuda ya documentada. Autónomo, S.
4. **P1 funcional — CTA de reseña roto** (`mi-cuenta/pedidos/[number]/page.tsx:271`): implementar flujo o esconder. Necesita-Lucy.
5. **P2 — Honeypots** en forms públicos, rate-limit en carrito, Turnstile en login/OTP tras N fallos, decisión sobre enumeración en registro.

**[pendiente verificación]:** no pude confirmar si las keys de Turnstile están seteadas en el entorno **Vercel production** (solo verifiqué nombres en `.env*` local, sin leer valores por mandato). Si en prod falta `TURNSTILE_SECRET_KEY`, `lib/turnstile.ts:36-38` bloquea contacto/newsletter por fail-closed — verificar antes de launch.

Archivos clave: `/home/ansible/workspaces/lucams_shop/apps/web/lib/turnstile.ts`, `/home/ansible/workspaces/lucams_shop/apps/web/app/(auth)/registro/actions.ts`, `/home/ansible/workspaces/lucams_shop/apps/web/app/(auth)/recuperar-password/actions.ts`, `/home/ansible/workspaces/lucams_shop/apps/web/app/checkout/pago/actions.ts`, `/home/ansible/workspaces/lucams_shop/apps/web/app/carrito/actions.ts`, `/home/ansible/workspaces/lucams_shop/apps/web/app/mi-cuenta/pedidos/[number]/page.tsx`.