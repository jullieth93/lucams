CSRF_SECRET is used to sign the checkout session cookie and unsubscribe tokens (an HMAC signing secret), not as a synchronizer token. No `lib/csrf.ts` synchronizer token exists, no OPTIONS handlers. Webhooks have HMAC. I have everything needed for a complete, evidence-based report.

# Frente 3 — CSRF / security headers / CORS / rate-limit

Auditoría contra `docs/SECURITY.md` (§ Headers, § CORS, § CSRF, § Rate limiting) y código real. Evidencia con `file:line`. Verificado 2026-06-29.

## Resumen ejecutivo

Arquitectura sólida en headers y CORS del proxy. **Un bug P0 real**: el rate-limit de TODOS los endpoints `/api/catalog/*` y `/api/coupons/public` está roto (no-op), por mal manejo del valor de retorno. Además dos contradicciones de CORS (`Access-Control-Allow-Origin: *` en esas mismas rutas) y CSP con `unsafe-inline`+`unsafe-eval`. CSRF está cubierto de facto por Server Actions + SameSite, pero falta Turnstile en registro/checkout (los flujos de mayor abuso/costo).

---

## 1. CSRF

| Control | Estado | Evidencia |
|---|---|---|
| Server Actions con protección de origen nativa Next | ✅ | Todas las mutaciones de estado son Server Actions (`grep "use server"`: 30 archivos incl. checkout, carrito, admin). Next 16 valida `Origin` contra `Host` automáticamente en Actions. |
| API routes que mutan estado con verificación de origen | 🟡 | Únicos POST en `/api/*`: `vitals` (no muta estado sensible), `webhooks/*` (HMAC). El proxy bloquea cross-origin con `Origin` presente (`proxy.ts:166-171`). |
| `SameSite=Lax` en cookie de sesión | ✅ | Supabase SSR default + cookie checkout firmada (`lib/checkout-session.ts:107`). |
| `lib/csrf.ts` (synchronizer token) | ❌ | No existe. `CSRF_SECRET` se reutiliza solo como secreto HMAC para firmar cookie checkout (`lib/checkout-session.ts:107`) y tokens unsubscribe (`features/newsletter/unsubscribe.ts:28`), NO como anti-CSRF token. |

**Análisis:** El `lib/csrf.ts` que `docs/SECURITY.md:360` describe (synchronizer token para cambio de email / borrado de cuenta / transferencia admin) **no es necesario hoy**: esos flujos no existen aún como API routes cookie-based, y las Server Actions de Next 16 ya validan origen. La spec lo lista como aspiracional. **Veredicto: no es un gap real para launch.** Documentar que el control queda cubierto por Server Actions + SameSite, y reservar `lib/csrf.ts` para cuando se agreguen flujos destructivos de cuenta vía route handler.

- **Fix:** Ninguno bloqueante. Agregar ADR/nota en `SECURITY.md` aclarando que CSRF se cubre vía Server Actions nativas + SameSite; `lib/csrf.ts` se difiere hasta que exista un route handler mutante cookie-based. **Esf: S · AUTÓNOMO · P2.**

---

## 2. Headers de seguridad

| Header | Estado | Evidencia |
|---|---|---|
| `Strict-Transport-Security` | ✅ | `proxy.ts:60` — `max-age=63072000; includeSubDomains; preload` (coincide spec). |
| `X-Frame-Options: DENY` | ✅ | `proxy.ts:61`. |
| `X-Content-Type-Options: nosniff` | ✅ | `proxy.ts:62`. |
| `Referrer-Policy` | ✅ | `proxy.ts:63` — `strict-origin-when-cross-origin`. |
| `Permissions-Policy` | ✅ (más estricto que spec) | `proxy.ts:66-67` — niega camera/mic/geo/payment/usb/sensores. |
| `Cross-Origin-Opener-Policy` / `Cross-Origin-Resource-Policy` | ✅ (extra, no en spec) | `proxy.ts:74-75`. |
| CSP presente | ✅ | `proxy.ts:85-97`, aplicado en `proxy.ts:217`. Incluye `default-src 'self'`, `frame-ancestors` implícito vía `X-Frame-Options` + falta `frame-ancestors` explícito. |
| CSP sin `unsafe-inline`/`unsafe-eval` (nonce) | 🟡 | `proxy.ts:87` — `script-src` tiene `'unsafe-inline' 'unsafe-eval'`. La spec (`SECURITY.md:285`) pide migrar a nonce. `'unsafe-eval'` ni siquiera está en la CSP documentada (es más débil que la spec). |
| `frame-ancestors 'none'` explícito en CSP | 🟡 | No está. Cubierto funcionalmente por `X-Frame-Options: DENY`, pero CSP `frame-ancestors` es el control moderno y navegadores nuevos lo priorizan. |

**Gaps:**
- **CSP débil (`'unsafe-inline' 'unsafe-eval'` en `script-src`).** `'unsafe-eval'` abre XSS si hay sink eval-like; la spec no lo autoriza. Es difícil de eliminar con Next 16 + Turbopack inline scripts sin nonce.
  - **Fix:** Implementar CSP por nonce (generar nonce en `proxy.ts`, propagarlo vía `next/headers` y a `<Script nonce>`); como mínimo intentar quitar `'unsafe-eval'` y verificar que el editor canvas/Konva (Fase 3, aún no implementado) no lo requiera. **Esf: M · AUTÓNOMO (verificar runtime en browser) · P1.**
- **Falta `frame-ancestors 'none'` en CSP.**
  - **Fix:** Añadir `"frame-ancestors 'none'"` al array CSP en `proxy.ts:85`. **Esf: S · AUTÓNOMO · P2.**

---

## 3. CORS

| Control | Estado | Evidencia |
|---|---|---|
| CORS restrictivo en `/api/*` (allowlist) | ✅ | `proxy.ts:99-108` allowlist (dominios prod + regex Vercel preview + localhost dev); bloqueo 403 si `Origin` presente y no permitido (`proxy.ts:166-171`); `ACAO`+`ACAC`+`Vary` solo si permitido (`proxy.ts:219-223`). Coincide con `SECURITY.md:315-341`. |
| Webhooks sin CORS | ✅ | No setean ACAO; validan HMAC (`webhooks/resend/route.ts:44`, wompi/aveonline runtime nodejs). |
| Ningún endpoint con `Access-Control-Allow-Origin: *` | ❌ | **13 hits** de `"Access-Control-Allow-Origin": "*"` en `/api/catalog/*` y `/api/coupons/public` (ej. `catalog/products/route.ts:67`, `catalog/search/route.ts:33,44`, `coupons/public/route.ts:40`, etc.). |

**Análisis del wildcard:** Son endpoints GET públicos de solo-lectura (catálogo/cupones públicos). Riesgo de exfiltración bajo porque (a) no devuelven datos privados, (b) el wildcard `*` + `Access-Control-Allow-Credentials` NO se combinan (el navegador rechaza `*` con credentials). **Pero contradice directamente el mandato de `SECURITY.md:312`** ("por defecto bloquear cualquier origen distinto al sitio") y el diseño del proxy: cualquier sitio externo puede leer el catálogo vía fetch CORS. Es un debilitamiento deliberado no documentado en ADR.

- **Fix:** Quitar el `"Access-Control-Allow-Origin": "*"` de las 13 ocurrencias y dejar que el proxy gobierne CORS (ya lo hace para same-origin sin header). Si se quiere catálogo embebible por terceros, documentarlo como ADR explícito con allowlist, no `*`. **Esf: S · AUTÓNOMO · P1.** (P1, no P0: el dato es público y no hay credentials, pero viola la política canónica y debe resolverse pre-launch.)

---

## 4. Rate limit

| Endpoint / flujo | Estado | Evidencia |
|---|---|---|
| Login (público) IP+email | ✅ | `app/(auth)/login/actions.ts:62-64` usa `rlIp.allowed` correctamente. |
| **Login admin** IP+email | ✅ | `app/admin/login/actions.ts:65-71` (5/15min prod). |
| Signup IP+email | ✅ | `registro/actions.ts:96-98`. |
| OTP verify + resend | ✅ | `confirmar-codigo/actions.ts:68-69, 144-145`. |
| Reset/recuperar password | ✅ | `recuperar-password/actions.ts`, `restablecer-password/actions.ts`. |
| Newsletter / contacto | ✅ | `features/newsletter/actions.ts:58-64`, `features/support/actions.ts:79-82`. |
| CMS API `/api/cms/*` | ✅ | `api/cms/_helpers.ts:25-27` usa `result.allowed` correctamente. |
| **Catálogo `/api/catalog/*` (9 rutas) + `/api/coupons/public`** | ❌ **BUG** | `if (!allowed)` sobre el **objeto** retornado por `rateLimit` (que es `{allowed,count,resetAt}`, ver `lib/rate-limit.ts:35-64`). `!objeto` es siempre `false` → **el rate-limit nunca dispara**. Ej. `catalog/products/route.ts:26-27`, `catalog/search/route.ts:18-19`, `coupons/public/route.ts:25-26`, y las 7 restantes. Comparar con el patrón correcto `.allowed` en auth/cms. |
| **Checkout** (`finalizeCheckout` → crea Order + Wompi tx) | ❌ falta | `app/checkout/pago/actions.ts:12-19` `payWompiAction` NO llama `rateLimit`. La spec pide `POST /api/checkout/create` 10/10min IP (`SECURITY.md:394`, STRIDE `SECURITY.md:851`). Aquí es Server Action, no route, pero el control de anti-fraude/anti-DoS (crear N órdenes PENDING) no está. |
| `/api/vitals` (POST público sin auth) | ❌ falta | `vitals/route.ts:44` sin rate-limit; el propio comment (`vitals/route.ts:11`) dice "Rate-limit en sub-bloque F" → pendiente. Spammeable (escribe fila `WebVital` por request). |
| `/api/upload/sign` | N/A | No existe ruta; upload va por `features/personalization/actions.ts` con `getCurrentCustomer` (auth gate). Rate-limit por usuario (spec `SECURITY.md:398`, 30/10min) **no implementado** — 🟡 menor (requiere sesión). |
| AI `/api/ai/design-suggest` | N/A | No existe aún (Fase 3). Sin gap actual. |

**Gaps priorizados:**

- **[P0] Rate-limit roto en catálogo + cupones (no-op por bug de tipo).** 10 rutas públicas sin protección efectiva contra scraping/DoS. Defensa anti-scraper que `SECURITY.md:400` exige está anulada.
  - **Fix:** Cambiar `const allowed = await rateLimit(...)` → `const { allowed } = await rateLimit(...)` (o `if (!result.allowed)`) en las 10 rutas. Agregar test que un objeto truthy no rompa el guard. **Esf: S · AUTÓNOMO · P0.**
- **[P1] Checkout sin rate-limit.** Permite a un bot crear órdenes `PENDING_PAYMENT` / iniciar transacciones Wompi en loop (anti-fraude del threat model `SECURITY.md:851`).
  - **Fix:** En `payWompiAction` (o en `finalizeCheckout`/`savePaymentMethodStep`) agregar `rateLimit(ipKey("checkout", ip), 10, 600)` antes de crear la orden. **Esf: S · AUTÓNOMO · P1.**
- **[P2] `/api/vitals` sin rate-limit.** DoS de escritura barata.
  - **Fix:** `rateLimit("vitals:"+ip, ~60, 60)` al inicio del POST, fail-open. **Esf: S · AUTÓNOMO · P2.**
- **[P2] Upload de personalización sin rate-limit por usuario** (`SECURITY.md:398/862`). **Esf: S · AUTÓNOMO · P2.**

---

## Turnstile (mencionado en el contexto del bloque)

| Flujo | Estado | Evidencia |
|---|---|---|
| Contacto / newsletter | ✅ | `features/support/actions.ts`, `features/newsletter/actions.ts`, `contacto/contact-form.tsx`. |
| **Registro** | ❌ falta | Sin `verifyTurnstile` en `app/(auth)/registro/`. Spec STRIDE `SECURITY.md:840` pide Turnstile en `auth.signup`. |
| **Login / login admin** | ❌ falta | Sin Turnstile. Mitigado parcialmente por rate-limit IP+email. |
| **Checkout** | ❌ falta | Sin Turnstile en `app/checkout/*`. |

- **Fix:** Añadir widget Turnstile + `verifyTurnstile` server-side en registro (P1) y checkout (P1); login (P2, ya tiene rate-limit). Requiere insertar el widget en los forms y validar el token en la action. **Esf: M · parte AUTÓNOMO (integración) / decisión de UX de dónde mostrarlo → semi NECESITA-LUCY · P1.**

---

## Tabla de acción consolidada

| # | Hallazgo | Sev | Esf | Autonomía |
|---|---|---|---|---|
| 1 | Rate-limit no-op en `/api/catalog/*` + `/api/coupons/public` (`if(!objeto)`) | **P0** | S | AUTÓNOMO |
| 2 | `Access-Control-Allow-Origin: *` en 13 puntos (catálogo/cupones) vs política | P1 | S | AUTÓNOMO |
| 3 | Checkout Server Action sin rate-limit (anti-fraude órdenes) | P1 | S | AUTÓNOMO |
| 4 | CSP con `'unsafe-inline'`+`'unsafe-eval'` (spec pide nonce; `unsafe-eval` no autorizado) | P1 | M | AUTÓNOMO (verificar en browser) |
| 5 | Turnstile faltante en registro/checkout | P1 | M | semi NECESITA-LUCY (UX) |
| 6 | `/api/vitals` POST público sin rate-limit | P2 | S | AUTÓNOMO |
| 7 | Falta `frame-ancestors 'none'` explícito en CSP | P2 | S | AUTÓNOMO |
| 8 | Upload personalización sin rate-limit por usuario | P2 | S | AUTÓNOMO |
| 9 | `lib/csrf.ts` ausente — NO bloqueante (cubierto por Server Actions+SameSite); documentar | P2 | S | AUTÓNOMO |

**Bloqueante de launch (P0):** solo #1 (rate-limit roto en catálogo). Bug de una palabra (`const { allowed }`) replicado en 10 archivos — fix trivial pero con impacto de seguridad real (defensa anti-scraper/DoS anulada).

Archivos clave: `/home/ansible/workspaces/lucams_shop/apps/web/proxy.ts`, `/home/ansible/workspaces/lucams_shop/apps/web/lib/rate-limit.ts`, `/home/ansible/workspaces/lucams_shop/apps/web/app/api/catalog/*/route.ts`, `/home/ansible/workspaces/lucams_shop/apps/web/app/api/coupons/public/route.ts`, `/home/ansible/workspaces/lucams_shop/apps/web/app/checkout/pago/actions.ts`, `/home/ansible/workspaces/lucams_shop/apps/web/app/api/vitals/route.ts`.