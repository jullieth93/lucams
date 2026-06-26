Confirmed: **Turnstile is NOT cabled in signup, login, admin login, recuperar, restablecer, or confirmar.** Only newsletter + contacto. Yet SECURITY.md says "Anti-bot signup: Rate limit + Turnstile". That's a documented but missing control.

Now I have all the evidence I need. Let me produce the audit.

# Dimensión: AUTH + SECURITY + HEADERS + RATE-LIMIT

## Estado actual real

Hay un baseline serio en seguridad: rate-limit doble (IP + email hasheado) en signup/login/admin-login/reset/verify-recovery con keys helper centralizado, Pwned Passwords k-anonymity en signup y reset, anti-enumeration en signup (`identities=[]`) y admin login (mismo error que credenciales malas + `signOut`), OTP en lugar de magic-link en signup y recovery, global signOut tras cambiar password, gate `/admin/*` en `proxy.ts`, HMAC verificado en webhooks Wompi y Resend, secret compartido en webhook Aveonline, headers HSTS/COOP/CORP/Permissions-Policy/CSP con allowlist Wompi+Turnstile+Anthropic+Supabase, CORS estricto en `/api/*`, logger estructurado con redact por key name y X-Request-Id propagado. **PERO** quedan agujeros concretos: RBAC `MANAGER/FULFILLMENT` solo se enforce en `/admin/usuarios` (el resto del admin trata a todos los admins como iguales); Turnstile NUNCA se invoca en signup/login/recover/admin-login (solo newsletter+contacto, contradiciendo SECURITY.md); comparación HMAC Wompi con `!==` en lugar de `timingSafeEqual`; webhook Aveonline sin HMAC real (solo secret compartido por query/header, sin documentar en `.env.example`); CSP sin `frame-ancestors` ni `nonce` (con `'unsafe-inline'` + `'unsafe-eval'`); `x-forwarded-for` confiado sin verificación de proxy; sin MFA admin; sin inactivity timeout admin (SECURITY.md promete 30 min); confirmar-codigo OTP solo rate-limita por IP, no por email.

## Fortalezas

- Rate-limit Postgres atómico (`rate_limit_check`) y diseño doble bucket (IP + hash email SHA-256 trunc 16) en TODOS los flujos auth productivos (signup, login, admin-login, reset, verify-recovery, newsletter, contacto).
- Anti-enumeration correcto en signup (`identities.length === 0` detección de email ya registrado, deletion segura en rollback) y admin login (signOut + mismo mensaje genérico).
- HIBP Pwned Passwords (k-anonymity privacy-preserving) en signup + reset, fail-open con log, timeout 3s.
- OTP en signup y recovery (no magic link → inmune al prefetch Gmail bug).
- `signOut({ scope: 'global' })` tras reset password — invalida sesiones activas en otros devices.
- Webhook Wompi HMAC verificado contra `WOMPI_EVENTS_SECRET` con raw body bytes (no JSON re-stringify), idempotencia por `WebhookEvent.source_externalId`, 401 si firma inválida.
- Webhook Resend usa `createHmac` + `timingSafeEqual` correctamente (modelo a copiar).
- CSP con allowlist explícita Wompi checkout, Cloudflare Turnstile, Supabase, Anthropic, Coordinadora imgs; HSTS preload, COOP same-origin, CORP same-site, Permissions-Policy negando camera/mic/geolocation/payment/usb/sensores; `upgrade-insecure-requests` solo en prod (no rompe dev HTTP).
- Logger redacta por key name (password, token, secret, email, phone…) Y por sufijo regex (`*Secret`, `*Token`, `*Key`), profundidad limitada a 6 niveles, JSON line-per-event.
- Cookies HttpOnly + SameSite=Lax + Secure (en prod) en cart-session y checkout-session.
- `getCurrentAdmin()` usa `supabase.auth.getUser()` (verificado al Auth server) — NO confía en `getSession()`.
- Anti-lockout SUPERADMIN: no se puede degradar/desactivar al último activo (`features/admin-users/service.ts`).

## Debilidades

- Turnstile cableado SOLO en newsletter + contacto. Signup, login, admin-login, recuperar-password, restablecer-password, confirmar-codigo **NO** lo invocan, contradiciendo `docs/SECURITY.md:822` ("signup 5/h por IP + Turnstile") y el modelo de amenazas L31 ("Bot scraper: Rate limit + Turnstile").
- RBAC granular casi inexistente. `getCurrentAdmin()` solo valida `isActive=true`. Solo `app/admin/(panel)/usuarios/actions.ts` chequea `role === SUPERADMIN`. Productos, pedidos, finanzas, integraciones, contenido, redirects, cupones, reseñas, etc. NO discriminan MANAGER vs FULFILLMENT vs SUPERADMIN. Cualquier admin activo puede hacer todo, rompiendo la promesa de SECURITY.md L116-118.
- `verifyWebhookSignature` (Wompi) usa `expected !== parsed.signature.checksum` — comparación NO timing-safe (`apps/web/lib/wompi.ts:207`). Resend lo hace bien — inconsistencia.
- Webhook Aveonline sin HMAC: secret compartido en `?secret=` o header `x-aveonline-secret` con `providedQ !== expected` (también no-timing-safe). En dev cae a "permitir todo" (`apps/web/app/api/webhooks/aveonline/route.ts:31-37`).
- `AVEONLINE_WEBHOOK_SECRET` y `RESEND_WEBHOOK_SECRET` referenciados en código pero **NO documentados** en `apps/web/.env.example`.
- CSP sin `frame-ancestors` (`'none'`) — `X-Frame-Options: DENY` cubre, pero CSP es la fuente moderna y faltante en defensa-en-profundidad.
- CSP con `'unsafe-inline'` + `'unsafe-eval'` en script-src y `'unsafe-inline'` en style-src. SECURITY.md L285 ya marca esto como TODO (CSP con nonces).
- `x-forwarded-for` confiado tal-cual en 23+ callsites; no se valida que venga del proxy Vercel/Cloudflare ni se evita IP spoofing si el deploy cambia. Hay fallback `'unknown'` que termina compartiendo bucket entre todos los requests sin XFF — bucket envenenable.
- MFA admin: 0 implementación. SECURITY.md L94 dice "obligatorio Fase 6" pero no hay ni opt-in ni UI ni siquiera flag.
- Sin inactivity timeout admin (SECURITY.md L57 promete "30 min"). El gate solo valida que haya sesión, no que esté activa.
- En `confirmar-codigo/actions.ts:68` y `:144` el rate-limit es por IP plano (`verify-otp:${ip}` / `resend-otp:${ip}`) sin combinar email y sin usar `ipKey/emailKey` helpers — inconsistente con el resto, y un atacante con varias IPs puede brute-forcear el OTP de 6 dígitos de una víctima.
- Comentario en proxy.ts L19 dice "Auth gate `/admin/*` — pendiente" pero el gate sí existe en L207 (drift de comentario que confunde al próximo lector).
- `docs/SECURITY.md` drift: L94 anuncia MFA obligatoria, L57 dice "30 min inactividad", L116-118 promete RBAC granular — nada de eso está implementado.

## Findings detallados

### [P0] AUTH-01 — Turnstile ausente en flujos auth críticos pese a estar documentado y wired
- **Categoría**: gap
- **Evidencia**: `apps/web/components/turnstile-widget.tsx` existe; `apps/web/features/newsletter/actions.ts:50` y `apps/web/features/support/actions.ts:67` lo verifican. Pero `apps/web/app/(auth)/registro/registro-form.tsx` (sin `<TurnstileWidget/>`), `login/login-form.tsx`, `admin/login/login-form.tsx`, `recuperar-password/recuperar-form.tsx`, `restablecer-password/restablecer-form.tsx`, `confirmar-codigo/confirmar-form.tsx` no incluyen el widget. `docs/SECURITY.md:34, 822` declara Turnstile como mitigación principal de bots para signup.
- **Impacto**: rate-limit por IP es trivial de evadir con botnet (residential proxies <$10/día); sin captcha el atacante puede crear cuentas masivas, brute-forzar admin con buckets distribuidos, enumerar emails con reset. Pre-launch ya entra al riesgo crítico el día 1.
- **Recomendación**: agregar `<TurnstileWidget size="flexible"/>` y `verifyTurnstileToken(formData.get("cf-turnstile-response"), ip)` en signup, login, admin-login (size="invisible" si UX lo pide), recuperar, restablecer, resend-OTP. En dev sigue siendo no-op por el branch de `process.env.TURNSTILE_SECRET_KEY`.
- **Horas estimadas**: 4
- **Acción humana Lucy**: ACCIÓN HUMANA REQUERIDA — crear sitio Turnstile en Cloudflare (Free), copiar site key + secret key, setear `NEXT_PUBLIC_TURNSTILE_SITE_KEY` y `TURNSTILE_SECRET_KEY` en Vercel env (prod + preview) y `.env.local`.

### [P0] AUTH-02 — RBAC granular no enforced fuera de /admin/usuarios
- **Categoría**: bug
- **Evidencia**: solo 2 archivos chequean `role`: `apps/web/app/admin/(panel)/usuarios/actions.ts:20,38` y la page del mismo módulo. `lib/auth.ts:67-75` (getCurrentAdmin) no filtra por rol. `apps/web/app/admin/(panel)/{productos,pedidos,finanzas,integraciones,cupones,resenas,redirects,categorias,ocasiones,contenido,clientes,email-templates,auditoria}` no discriminan. `docs/SECURITY.md:114-118` promete que MANAGER no toca finanzas/integraciones y que FULFILLMENT solo tiene pedidos.
- **Impacto**: un admin FULFILLMENT (objetivamente con menos permisos en el modelo de amenazas) puede borrar productos, cambiar precios, ver/exportar todos los clientes, modificar integraciones (Wompi keys, webhook secrets en UI), eliminar reseñas. Promesa de mínimo privilegio rota → factor insider amplificado.
- **Recomendación**: definir matriz `ROLE_PERMISSIONS: Record<AdminRole, Set<Permission>>`, helper `requireRole(['SUPERADMIN','MANAGER'])` y `requirePermission('orders:write')`, llamarlo en cada server action admin y en cada `page.tsx` de un módulo restringido. Como mínimo P0: bloquear finanzas + integraciones + email-templates + usuarios a no-SUPERADMIN; bloquear edición productos/cupones a FULFILLMENT.
- **Horas estimadas**: 10
- **Acción humana Lucy**: ninguna (decisión técnica) salvo confirmar la matriz exacta de permisos.

### [P0] AUTH-03 — Webhook Wompi: comparación HMAC no timing-safe
- **Categoría**: risk
- **Evidencia**: `apps/web/lib/wompi.ts:207` → `if (expected !== parsed.signature.checksum)`.
- **Impacto**: timing oracle teórico que permite a un atacante remoto deducir el checksum byte-a-byte midiendo latencia de respuesta a webhooks falsificados (Wompi entrega webhooks por internet desde IPs públicas; los handlers responden 401 vs 200 con tiempos distintos según prefix matcheado). El handler de Resend ya usa `timingSafeEqual` correctamente — inconsistencia interna.
- **Recomendación**: `import { timingSafeEqual } from "node:crypto"; const a = Buffer.from(expected, "hex"); const b = Buffer.from(parsed.signature.checksum, "hex"); if (a.length !== b.length || !timingSafeEqual(a, b)) return invalid;`.
- **Horas estimadas**: 0.5
- **Acción humana Lucy**: ninguna.

### [P1] AUTH-04 — Webhook Aveonline sin HMAC verdadero
- **Categoría**: risk
- **Evidencia**: `apps/web/app/api/webhooks/aveonline/route.ts:30-50`. Solo compara `secret` por query/header con `!==`. En NODE_ENV !== production deja pasar sin secret. Aveonline no publica HMAC.
- **Impacto**: cualquiera con la URL + secret (que viaja en query string y aparece en logs/proxies/CDN) puede inyectar tracking updates falsos → orden marcada DELIVERED sin haber salido, o reescritura de timeline. Idempotencia mitiga replays exactos pero no eventos nuevos forjados.
- **Recomendación**: (a) usar `timingSafeEqual` para la comparación del secret; (b) preferir header sobre query (los query params se loguean en Vercel access log); (c) si Aveonline no firma payload, registrar `WebhookEvent` con `payload.rawBodyHash` para detectar replays semánticos; (d) considerar IP-allowlist Aveonline si publican rangos; (e) en dev, leer secret de `.env.local` para no degradar al "permit-all".
- **Horas estimadas**: 2
- **Acción humana Lucy**: ACCIÓN HUMANA REQUERIDA — documentar `AVEONLINE_WEBHOOK_SECRET` y `RESEND_WEBHOOK_SECRET` en `.env.example`, agregarlos a Vercel env, recordar al integrador Aveonline.

### [P1] AUTH-05 — `x-forwarded-for` confiado sin verificación de procedencia
- **Categoría**: risk
- **Evidencia**: 23+ callsites con `hdrs.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown"` (login, signup, recover, restablecer, admin-login, confirmar, newsletter, support). En Vercel Edge el primer hop es Vercel mismo, pero si la app corre en cualquier otro entorno (VM dev, preview alterno) el header lo setea el cliente directo.
- **Impacto**: (1) un cliente puede mandar XFF custom → bypass de rate-limit por IP rotando este header; (2) si no llega XFF (curl, healthcheck), TODO el tráfico va al bucket `"unknown"` y se rate-limita entre sí — DoS auto-infligido; (3) IP spoofing puede saturar logs con valores arbitrarios.
- **Recomendación**: helper `getClientIp(headers)` que (a) en Vercel use solo el último elemento de XFF (`Vercel` siempre añade el suyo al final) o `x-real-ip`, (b) en local use `request.ip` cuando esté disponible, (c) si falta, derive desde `x-vercel-forwarded-for` (Vercel-specific, no spoofable por cliente), (d) hash + truncate antes de loggear (PII).
- **Horas estimadas**: 2
- **Acción humana Lucy**: ninguna.

### [P1] AUTH-06 — confirmar-codigo rate-limit solo por IP, vulnerable a brute-force OTP distribuido
- **Categoría**: gap
- **Evidencia**: `apps/web/app/(auth)/confirmar-codigo/actions.ts:68` → `rateLimit(`verify-otp:${ip}`, isProd ? 10 : 30, 15 * 60)` sin `emailKey` y sin `ipKey` helper.
- **Impacto**: OTP de 6 dígitos = 1M combinaciones. 10 intentos / 15 min por IP × 100 IPs de botnet = 1000 intentos / 15 min ≈ 96 000 / día → expected hit en ~10 días para una víctima específica. Con bucket por email + ip-bucket simultáneo, el techo es 10/15 min global por email → infactible (~7 años).
- **Recomendación**: añadir `rateLimit(emailKey("verify-otp", email), isProd ? 5 : 15, 15*60)` y respetar el más estricto. Mismo patrón a `resend-otp`.
- **Horas estimadas**: 0.5
- **Acción humana Lucy**: ninguna.

### [P1] AUTH-07 — MFA admin no implementado pese a estar prometido
- **Categoría**: gap / docs-drift
- **Evidencia**: 0 hits para `enrollFactor`, `enrollMfa`, `TOTP`, `verifyFactor` en `apps/web/`. `docs/SECURITY.md:94` declara MFA obligatoria para SUPERADMIN/MANAGER desde Fase 6.
- **Impacto**: admin login es 1FA email+password. Compromiso de email Lucy → control total sin segundo factor. Es uno de los vectores STRIDE-Spoofing más críticos para un e-commerce con plata real.
- **Recomendación**: Fase pre-launch: implementar TOTP enrollment en `/admin/seguridad`, almacenar `mfaEnrolledAt` en `AdminUser`, exigir en admin-login si `mfaEnrolledAt != null`. Supabase Auth soporta MFA factors nativos. Pre-launch hard-block: forzar MFA al menos para SUPERADMIN.
- **Horas estimadas**: 8
- **Acción humana Lucy**: ACCIÓN HUMANA REQUERIDA — habilitar MFA factors en Supabase dashboard Auth → Providers, y enrollar TOTP la primera vez.

### [P1] AUTH-08 — Inactivity timeout admin no implementado
- **Categoría**: gap / docs-drift
- **Evidencia**: `docs/SECURITY.md:57` "sesión de admin expira tras 30 min sin actividad". Búsqueda de `inactivity`, `lastActivityAt`, `sessionTimeout` → 0 hits. Solo el TTL de Supabase (1h access, 30d refresh con rotación) está activo.
- **Impacto**: equipo del admin (cuando crezca a MANAGER/FULFILLMENT) deja sesión abierta en café/coworking → hijacking por shoulder/cookie steal de 24h+.
- **Recomendación**: en `lib/auth.getCurrentAdmin()` verificar `Date.now() - admin.lastActivityAt > 30*60_000 → signOut`; actualizar `lastActivityAt` en cada server action admin (campo en `AdminUser` + columna `last_activity_at`).
- **Horas estimadas**: 3
- **Acción humana Lucy**: ninguna.

### [P1] AUTH-09 — CSP sin `frame-ancestors` ni nonces, con `unsafe-inline` y `unsafe-eval`
- **Categoría**: improvement
- **Evidencia**: `apps/web/proxy.ts:85-97`. CSP no incluye `frame-ancestors 'none'`. `script-src` tiene `'unsafe-inline' 'unsafe-eval'`. `style-src` tiene `'unsafe-inline'`.
- **Impacto**: XSS reflectivo/persistente NO está mitigado por CSP de scripts. `unsafe-eval` necesario solo si algún tooling lo requiere (Next 16 con turbopack en dev sí). En prod debería removerse. `frame-ancestors` falta — `X-Frame-Options: DENY` cubre, pero MDN recomienda CSP como source-of-truth moderna.
- **Recomendación**: (a) añadir `frame-ancestors 'none'`; (b) usar Next.js nonces (next.config + custom rendering) para inline scripts/styles legítimos; (c) gate `'unsafe-eval'` solo en dev (`...(IS_PROD_DEPLOY ? [] : ["'unsafe-eval'"])`); ver si el editor canvas konva / Three.js lo necesita en prod (probable que sí — documentar). Reportar violaciones con `report-uri` a un endpoint propio para iterar.
- **Horas estimadas**: 5
- **Acción humana Lucy**: ninguna (verificar tras cambio).

### [P2] AUTH-10 — `.env.example` omite `AVEONLINE_WEBHOOK_SECRET` y `RESEND_WEBHOOK_SECRET`
- **Categoría**: docs-drift
- **Evidencia**: `apps/web/app/api/webhooks/aveonline/route.ts:30` y `webhooks/resend/route.ts:45` leen estas vars; `apps/web/.env.example` no las lista.
- **Impacto**: deploy nuevo (otra Lucy, otro contributor, otro ambiente) → webhooks fallan silenciosamente (Aveonline tira 503 en prod, Resend 401). Onboarding roto.
- **Recomendación**: añadir bloque dedicado a webhook secrets en `.env.example` con instructivo de dónde generarlos (Aveonline support, Resend dashboard).
- **Horas estimadas**: 0.25
- **Acción humana Lucy**: ACCIÓN HUMANA REQUERIDA — generar/recuperar los valores reales y setearlos en Vercel.

### [P2] AUTH-11 — `docs/SECURITY.md` desincronizado en 4 puntos (rate-limits, MFA, inactividad, CSP)
- **Categoría**: docs-drift
- **Evidencia**: SECURITY.md L57 (30 min inactividad → no existe), L94 (MFA obligatoria → no existe), L114-118 (RBAC granular → solo en usuarios), L285 (CSP con nonces → no hay), L395-396 (login 5/15min → en código es 15/15min isProd, 50/15min dev). El comentario inline en `proxy.ts:19` también afirma falsamente que el gate /admin/* "está pendiente".
- **Impacto**: SECURITY.md es la fuente única citada por mandato #9 — al estar incorrecta, decisiones futuras se apoyan en promesas no cumplidas. Auditorías externas detectarían el drift rápido.
- **Recomendación**: añadir tabla "Estado real vs documentado" al final de SECURITY.md; corregir L57, L94, L116, L395; aclarar comentario L19 de `proxy.ts`.
- **Horas estimadas**: 1.5
- **Acción humana Lucy**: ninguna.

### [P2] AUTH-12 — Bucket "unknown" cuando XFF falta, DoS auto-infligido
- **Categoría**: bug
- **Evidencia**: todos los callsites: `?? "unknown"`. Si Vercel cambia upstream o un healthcheck llega sin XFF → todos comparten clave `signup:ip:unknown`.
- **Impacto**: 10 healthchecks/min sin XFF agotan el bucket de signup durante 1 hora real, bloqueando registros legítimos cuyo XFF también falte. Self-DoS.
- **Recomendación**: si XFF falta, devolver `allowed: true` (fail-open) pero loguear `event: "ip.missing_xff"`; o derivar IP de `request.ip` cuando esté disponible.
- **Horas estimadas**: 0.5
- **Acción humana Lucy**: ninguna.

### [P3] AUTH-13 — Logger redact key `email` puede ocultar campos legítimos
- **Categoría**: improvement
- **Evidencia**: `lib/logger.ts:62` redacta el key `email` en cualquier nivel. Eso incluye `event: 'admin.user.promoted', targetEmail: '...'` → bien, pero también dificulta debugging cuando uno necesita ver el email completo en logs internos.
- **Impacto**: Pequeño — pero a veces se enmascaran emails de admin que sí son auditoría legítima (`targetEmail` queda `[REDACTED]` por sufijo *email regex).
- **Recomendación**: diferenciar PII de cliente (REDACT) vs identificador interno de admin (mantener hash truncado). Considerar `email` → `[REDACTED:hashedDomain.tld]` para conservar utilidad de diagnóstico.
- **Horas estimadas**: 1
- **Acción humana Lucy**: ninguna.

### [P3] AUTH-14 — Password strength meter no bloquea, depende solo de Pwned como gate fuerte
- **Categoría**: improvement
- **Evidencia**: `lib/password-strength.ts` solo informa (`score: 0..4`). Schema Zod bloquea solo `min(8)`.
- **Impacto**: usuaria puede registrar `12345678` que no esté en HIBP. Bloqueo HIBP cubre los más comunes pero deja huecos.
- **Recomendación**: rechazar `score <= 1` server-side en signup/restablecer (no en login). Mantener UX informativa.
- **Horas estimadas**: 0.5
- **Acción humana Lucy**: ninguna.

### [P3] AUTH-15 — Newsletter "CSRF token" es predecible si CSRF_SECRET no se setea
- **Categoría**: tech-debt
- **Evidencia**: `features/newsletter/actions.ts:93` → `update(\`${email}:${process.env.CSRF_SECRET ?? "dev"}\`)`. Si la var falta, todos los tokens son derivados de la palabra `"dev"`.
- **Impacto**: en producción si la var no se setea, no es real protección. Solo log/diagnóstico, no bloquea.
- **Recomendación**: fail-closed cuando `process.env.CSRF_SECRET` falta en `VERCEL_ENV=production` (throw en boot).
- **Horas estimadas**: 0.5
- **Acción humana Lucy**: ACCIÓN HUMANA REQUERIDA — confirmar que `CSRF_SECRET` está en Vercel env prod con un valor real (`openssl rand -hex 32`).

## Resumen final

Auth/security tiene un **baseline sorprendentemente sólido** para pre-launch: rate-limit doble IP+email hasheado, anti-enumeration en signup y admin-login, OTP en signup y recovery, HIBP, global signOut, headers HSTS/COOP/CORP/Permissions-Policy, HMAC Wompi/Resend, gate `/admin/*`. Los gaps P0 son **3 y concretos**: Turnstile no cabled en flujos auth pese a estar prometido en SECURITY.md, RBAC `MANAGER/FULFILLMENT` no enforced fuera de `/admin/usuarios`, y comparación HMAC Wompi no timing-safe. Los P1 (Aveonline sin HMAC real, XFF spoofable, OTP brute-force sin bucket de email, MFA admin inexistente, inactividad sin enforce, CSP con `unsafe-inline/eval` y sin `frame-ancestors`) son críticos pre-launch pero no bloqueantes ya hoy. `docs/SECURITY.md` necesita pasada de sincronización porque promete MFA, inactividad 30 min, CSP con nonces y RBAC granular — ninguno implementado. Total estimado pre-launch para llegar a "promesa cumplida": **~37 horas + 4 acciones humanas Lucy** (Turnstile keys, MFA Supabase, AVEONLINE/RESEND webhook secrets en .env.example y Vercel, confirmar CSRF_SECRET prod).