# Auditoría de Seguridad OWASP Top 10 (2021) — Lucams Shop

**Fecha de auditoría:** 2026-08-24 · **Metodología:** skill `secure-code-review` (7 auditores especializados + 2 verificadores independientes con regla 0-suposiciones) · **Objetivo:** repo `jullieth93/lucams` @ `2044940` (`develop` = `production`) + infraestructura Supabase `lucams-prod` / `lucams-stg` auditada en vivo.

> **Estado: REMEDIADA — ver §11 "Cierre y remediación" (2026-08-29).** Los 49 hallazgos accionables quedaron resueltos en código/repo, como migración versionada, o como acción humana pendiente explícita (§11.5).

---

## 1. Resumen ejecutivo

**Postura general: SÓLIDA con una brecha crítica puntual.** Lucams Shop presenta un nivel de endurecimiento muy superior al habitual para un e-commerce de su tamaño: cadena de dinero (Wompi) con firma verificada timing-safe, anti-replay, idempotencia con carrera cerrada y contraste de monto contra la orden; RLS activo en el 100% de las 59 tablas de producción con deny-by-default; SQL 100% parametrizado (cero `$queryRawUnsafe` en código servido); CSP por nonce sin `unsafe-inline` en producción; pipeline de uploads anti-polyglot con magic bytes + re-encode; webhooks con verificación de firma completa; y un gate de CI con `pnpm audit` y gitleaks. El historial de 976 commits no contiene secretos reales (5 matches de gitleaks, todos fixtures de test verificados uno a uno).

La brecha crítica (RED) es de **autenticación**: el MFA TOTP del panel admin es opt-in aunque la política escrita (`docs/SECURITY.md:93`) lo declara obligatorio — un admin sin factor enrolado opera el panel solo con contraseña, y los roles no-SUPERADMIN ni siquiera pueden enrolarlo. El resto del riesgo se concentra en **higiene y defensa en profundidad**: dependencias con el gate de audit en rojo (nanoid, deepmerge-ts), PII persistida sin redacción en tablas de errores, tokens bearer en claro en DB, y drift prod↔stg↔código en la base de datos (grants, función `rls_auto_enable` no versionada).

**Conteo por severidad:**

| Severidad | Cantidad |
|---|---|
| 🔴 RED (Alto) | **1** |
| 🟡 YELLOW (Medio) | **49** |
| 🟢 GREEN (Bajo / informativo) | **9** |
| ✅ PASS (controles verificados consolidados) | **83** |

**Top 5 riesgos:**

1. **[RED] MFA no obligatorio para admins** (B-1) — contraseña robada = acceso total al panel; contradice la política documentada.
2. **[YELLOW] Webhook AveOnline acepta el secreto por query-string** (D-1) — la única credencial del webhook de envíos puede filtrarse vía logs de CDN/proxy; un DELIVERED forjado tiene impacto financiero (COD).
3. **[YELLOW] `ErrorLog`/`ErrorReport` persisten PII sin redacción ni retención** (F-6) — emails/teléfonos de errores de DB quedan en claro e indefinidamente (Ley 1581).
4. **[YELLOW] Gate de `pnpm audit` en rojo**: override de nanoid insuficiente (3.3.17 < 3.3.18) + deepmerge-ts 7.1.5 vulnerable + comentario que cita un GHSA inexistente (F-1/F-2/F-3) — riesgo de normalizar el audit fallido.
5. **[YELLOW] Cookie de checkout con PII completa en base64 firmada pero no cifrada** (F-9) — nombre, cédula, teléfono y dirección legibles en el cliente.

**Top 5 fortalezas:**

1. **Cadena de dinero endurecida de punta a punta**: firma Wompi + anti-replay + idempotencia P2002 + validación de monto vs. orden + totales/flete recalculados server-side con sello HMAC + cupones atómicos en transacción (Auditor D).
2. **RLS 100% en producción**: 59/59 tablas con RLS, 14 políticas coincidentes 1:1 con el código, deny-by-default en las 46 restantes, y event trigger que auto-habilita RLS en tablas nuevas (Auditor G + V2).
3. **Inyección SQL descartada por construcción**: todo el SQL crudo usa bind parameters de Prisma; whitelists de enums en todo parámetro categórico (Auditores C/E/G).
4. **XSS neutralizado**: únicos `dangerouslySetInnerHTML` son JSON-LD escapado con nonce; 9/9 sinks de ReactMarkdown con `rehype-sanitize`; CSP estricta por nonce (Auditor E).
5. **Webhooks con autenticación robusta**: Svix HMAC completo (Resend), esquema oficial SHA-256 con timing-safe (Wompi), triple vía timing-safe con fail-closed en prod (AveOnline), y tests de integración hostiles (Auditor D).

---

## 2. Alcance, metodología y cobertura verificada

### 2.1 Objetivos

| Objetivo | Detalle |
|---|---|
| **Código** | Repo GitHub `jullieth93/lucams` (público), rama `develop` @ commit `2044940` (= `production`, mismo SHA), auditado 2026-08-24. Monorepo pnpm: `apps/web` (Next.js 16 App Router, TypeScript, e-commerce en Vercel `lucams-shop.vercel.app`), `packages/db` (Prisma 6), `supabase/migrations` (23 SQL). 1.258 archivos rastreados, ~173.827 LOC TS/TSX. |
| **Infraestructura** | Supabase `lucams-prod` (ref `zxkucphbsfygakgxcnik`, us-east-2, PostgreSQL 17.6) y `lucams-stg` (ref `mjbdiqdkykhsixvqlrrp`), auditados EN VIVO vía MCP: advisors de seguridad + SQL contra catálogo (`pg_policies`, `role_table_grants`, `pg_proc`, `pg_extension`, `storage.buckets`, `cron.job`, `pg_event_trigger`). |

### 2.2 Herramientas

- **Estático:** lectura directa línea a línea (regla de evidencia `archivo:línea`), `git grep` sistemático (dangerouslySetInnerHTML, `$queryRaw*`, `eval(`, `fetch(`, `process.env`, "use server", grants, SECURITY DEFINER, etc.).
- **Dinámico acotado:** gitleaks 8.24.3 contra repo sintético con 6 formatos de secreto (validación de gaps de `.gitleaks.toml`); prueba Node WHATWG URL para el open redirect; `pnpm audit --prod` (texto + JSON); GitHub Advisory API + web_search para CVEs.
- **Histórico:** gitleaks 8.24.3 sobre **976 commits** → 5 matches, todos fixtures de test (verificados uno a uno).
- **En vivo:** `execute_sql` (MCP Supabase) contra prod y stg; `get_advisors(security)` en ambos proyectos.

### 2.3 Cobertura verificada

| Alcance | Cobertura |
|---|---|
| Rutas API | **35/35** leídas (9 catalog + 4 cms + 1 admin edit-mode + 1 coupons + 8 cron + 8 health + log-error + unsubscribe + vitals + 1 server action) |
| Migraciones Supabase | **23/23** completas |
| Migraciones Prisma | **50/50** (15 security-relevantes leídas completas; las 50 grepeadas por GRANT/SECURITY DEFINER/DISABLE RLS → negativo) |
| schema.prisma | 1.858/1.858 líneas |
| Webhooks | Todos (Wompi, Resend, AveOnline) + libs `wompi.ts`, `resend.ts`, `aveonline.ts` |
| Auth/security/rate-limit | `lib/auth.ts`, `admin-rbac*.ts`, `rate-limit*.ts`, `turnstile.ts`, `timing-safe.ts`, `checkout-session.ts`, `safe-redirect.ts`, `supabase/{browser,server,service}.ts`, etc. |
| CI/CD | 4 workflows + `dependabot.yml` + `.gitleaks.toml` (probado empíricamente) |
| Dependencias | `pnpm audit --prod` + GitHub Advisory API (12+ paquetes verificados individualmente) |
| Server Actions | 64 archivos `"use server"` verificados por guard |

### 2.4 Regla 0-suposiciones y verificación independiente

Todo hallazgo de los auditores A–G pasó por un **verificador independiente (V1 código / V2 base de datos en vivo) que intentó refutarlo**. Los veredictos de V1/V2 **mandan** sobre los auditores cuando difieren. Resultado de la verificación: 8 CONFIRMADO, 3 CONFIRMADO-con-matiz, 1 PARCIAL, 4 REFUTADO/ajustado (detalle en §8). Los hallazgos refutados se reportan como tales por transparencia.

### 2.5 Limitaciones honestas

- **`pgrst.db_schemas` NO verificable por SQL** — el GUC vive en el proceso PostgREST, no en la sesión MCP (`current_setting` devolvió NULL). Queda **pendiente una prueba HTTP** `GET https://zxkucphbsfygakgxcnik.supabase.co/rest/v1/` con anon key para confirmar los schemas expuestos. El riesgo de fuga de `auth.users` está descartado por privilegios (sin SELECT para anon/authenticated — verificado por SQL) aunque el schema estuviera expuesto.
- **Smoke tests / pentest dinámico fuera de alcance**: la auditoría de código fue en modo solo lectura; no se ejecutó la aplicación ni se lanzaron ataques reales contra `lucams-shop.vercel.app`.
- `pnpm audit` se corrió con pnpm 10.34.5 (no el 11.0.9 pineado) por incompatibilidad de Node del sandbox; el resultado es contra el mismo lockfile y es válido.
- ~15 paquetes de UI menores sin verificación individual por rate-limit de la API de GitHub (ninguno reportado vulnerable por `pnpm audit`); detalle en §7.
- No se verificó si la lambda del image optimizer de Next carga `sharp-safe` en el mismo proceso (residual del riesgo aceptado de sharp).
- El throttling interno de GoTrue (OTP/TOTP) es servicio externo no verificable; el comportamiento "layouts no re-ejecutan en soft-nav" es comportamiento documentado de App Router, no probado en runtime.

---

## 3. Resumen de riesgo

**RED Alto × 1 · YELLOW Medio × 49 · GREEN Bajo × 9 · PASS × 83**

| ID | Severidad | OWASP | Título | Ubicación principal |
|---|---|---|---|---|
| B-1 | 🔴 RED | A07 | MFA TOTP no obligatorio para admins (contradice `docs/SECURITY.md:93`) | `apps/web/lib/admin-rbac-guard.ts:38-44`; `app/admin/login/mfa/page.tsx:28-31` |
| A-1 | 🟡 YELLOW | A08 | Actions de GitHub fijadas por tag mutable, no por SHA | `.github/workflows/ci.yml:46,54,258,352` (+backup/dr-drill/nightly) |
| A-2 | 🟡 YELLOW | A02 | Gitleaks no detecta `sb_secret_*` suelto ni `DATABASE_URL` con password; allowlist exime `docs/**` | `.gitleaks.toml:14-19,39-63` |
| A-3 | 🟡 YELLOW | A02 | Backups de DB (con PII) suben a R2 sin cifrado a nivel aplicación | `apps/web/scripts/backup-db-to-r2.mjs:106-122` |
| A-4 | 🟡 YELLOW | A05 | `docs/SECURITY.md` describe controles que ya no coinciden con el código (6 puntos de drift) | `docs/SECURITY.md:203,210,261,271-279,371-391` |
| A-5 | 🟡 YELLOW | A05 | Respuestas early-return del proxy salen sin security headers ni CSP | `apps/web/proxy.ts:131,159,176,180-184,223,239` |
| A-6 | 🟡 YELLOW | A05 | `/status` pública expone mensajes de error internos y topología de proveedores | `apps/web/app/status/page.tsx:49,63` |
| B-2 | 🟡 YELLOW | A07 | Cookies de sesión `sb-*` sin flag `Secure` explícito y `httpOnly:false` | `apps/web/lib/supabase/server.ts:81-101`; `proxy.ts:188-207` |
| B-3 | 🟡 YELLOW | A07 | Enumeración de cuentas en el registro ("Este correo ya tiene una cuenta") | `apps/web/app/(auth)/registro/actions.ts:226-235` |
| B-4 | 🟡 YELLOW | A07 | Verificación/reenvío de OTP con rate-limit solo por IP (en claro) y sin bucket por email | `apps/web/app/(auth)/confirmar-codigo/actions.ts:69,141` |
| B-5 | 🟡 YELLOW | A07/A02 | Recovery codes admin: SHA-256 sin sal sobre ~49,5 bits + consumo no atómico (TOCTOU); consumir uno desactiva el TOTP (incluye F-8) | `apps/web/features/admin-mfa/recovery-codes.ts:15-30,58-69` |
| B-6 | 🟡 YELLOW | A01 | `/api/admin/cms/edit-mode`: acción admin sin aal2 y cookie sin flag `Secure` | `apps/web/app/api/admin/cms/edit-mode/route.ts:35-53` |
| B-7 | 🟡 YELLOW (bajo) | A01 | `/admin/disenos` y `/admin/fichas` sin guard propio (dependen solo del layout) | `app/admin/(panel)/disenos/page.tsx:16-19`; `fichas/page.tsx:17-20` |
| B-8 | 🟡 YELLOW (bajo) | A07 | Idle-timeout admin sin revocación server-side del refresh token; marca de actividad no firmada | `apps/web/proxy.ts:233-247`; `lib/admin-activity.ts:26-35` |
| C-1 | 🟡 YELLOW | A04 | `/api/vitals`: escritura no autenticada sin tope global | `apps/web/app/api/vitals/route.ts:50,59-70` |
| C-2 | 🟡 YELLOW | A05 | `isPublicSettingKey` es denylist: cualquier setting futuro sensible sale por `/api/cms/settings` | `apps/web/lib/cms.ts:103-105` |
| C-3 | 🟡 YELLOW | A05 | `/api/health` y `/api/health/all` exponen el commit SHA exacto y el entorno sin auth | `apps/web/app/api/health/route.ts:25-26` |
| C-4 | 🟡 YELLOW | A05 | `/api/health/crons` revela nombres de jobs, `lastRunAt` y cuáles están desactivados | `apps/web/app/api/health/crons/route.ts:38-50` |
| C-5 | 🟡 YELLOW | A05 | `/api/health/storage` filtra el mensaje de error interno de Supabase al cliente | `apps/web/app/api/health/storage/route.ts:49-51` |
| C-6 | 🟡 YELLOW | A04 | `/api/catalog/search` y `/api/cms/search` no acotan la longitud de `q` | `apps/web/app/api/catalog/search/route.ts:28`; `lib/catalog.ts:856` |
| C-7 | 🟡 YELLOW | A04 | `/api/catalog/products`: `offset` sin tope + cache-key por combinación de filtros | `apps/web/app/api/catalog/products/route.ts:53` |
| C-8 | 🟡 YELLOW | A04 | Claves de rate-limit solo-IP (evasión con rotación) + IP en claro en `rate_limit_buckets` | `apps/web/lib/client-ip.ts`; múltiples rutas |
| C-9 | 🟡 YELLOW | A05 | Cookie de edit-mode del CMS auto-sembrable (`"1"` plano) revela anotaciones `data-cms-key` | `apps/web/lib/cms-edit-mode.ts:19-24` |
| C-10 | 🟡 YELLOW | A03 | `priceMin`/`priceMax` sin guard de NaN ni rango (robustez, no inyección) | `apps/web/app/api/catalog/products/route.ts:48-49` |
| D-1 | 🟡 YELLOW | A08 | Webhook AveOnline: secreto aceptado por query-string (`?secret=`) — fuga en logs | `apps/web/app/api/webhooks/aveonline/route.ts:57-86` |
| D-2 | 🟡 YELLOW | A08 | Webhook Resend: upsert "last-write-wins" pisa `email.bounced`/`email.complained` | `apps/web/app/api/webhooks/resend/route.ts:127-143` |
| D-3 | 🟡 YELLOW | A04 | Retracto: autorización "opt-out" — verificación de propiedad se salta si `customerId` es null | `apps/web/features/retract/service.ts:86-134,147-220` |
| D-4 | 🟡 YELLOW | A08 | AveOnline: dedup roto para payloads sin `fecha` (fallback a `new Date()`) | `apps/web/features/shipping/aveonline.ts:1239-1245` |
| D-5 | 🟡 YELLOW | A05/A09 | `RESEND_WEBHOOK_SECRET` fuera del fail-fast + `bodyHead` con posible PII en logs de webhooks (incluye F-7) | `apps/web/lib/env.ts:40-65`; `webhooks/wompi/route.ts:73` |
| E-1 | 🟡 YELLOW | A01/A03 | Open redirect no autenticado en `POST /api/admin/cms/edit-mode` vía `next=/\evil.com` | `apps/web/app/api/admin/cms/edit-mode/route.ts:25-27,56-58` |
| E-2 | 🟡 YELLOW | A03 | Texto libre del usuario se envía a Google Gemini sin filtrado de PII | `apps/web/features/ai/actions.ts:35-38` |
| F-1 | 🟡 YELLOW | A06 | Override de `nanoid` insuficiente (3.3.17 < 3.3.18): el gate de audit falla hoy con un HIGH | `pnpm-workspace.yaml:19-25`; `pnpm-lock.yaml:4962` |
| F-2 | 🟡 YELLOW | A06 | El comentario del override cita un GHSA que no existe (`GHSA-m9w9-5wcm-r62h`) | `pnpm-workspace.yaml:21` |
| F-3 | 🟡 YELLOW | A06 | `deepmerge-ts@7.1.5` vulnerable (HIGH, CVE-2026-40345) vía Prisma | `pnpm-lock.yaml:3281` |
| F-4 | 🟡 YELLOW | A06 | `sharp@0.34.4` vulnerable a GHSA-f88m-g3jw-g9cj — riesgo aceptado con mitigación verificada (`sharp-safe`) | `apps/web/package.json`; `features/personalization/sharp-safe.ts:31-33` |
| F-5 | 🟡 YELLOW | A06 | Cadena dev `shadcn → @modelcontextprotocol/sdk` arrastra `hono`, `@hono/node-server`, `qs` con CVEs moderados | `pnpm-lock.yaml:12645-12653` |
| F-6 | 🟡 YELLOW | A09 | `ErrorLog`/`ErrorReport` persisten message+stack sin la redacción de PII del logger y sin retención | `apps/web/lib/error-capture.ts:26-35,138-147` |
| F-9 | 🟡 YELLOW | A02 | Cookie de checkout con PII completa en base64 — firmada pero NO cifrada | `apps/web/lib/checkout-session.ts:194-214` |
| F-10 | 🟡 YELLOW | A02 | Cupones de recompensa de referido con 16 bits de entropía aleatoria (`isPublic:false` no enforceado en canje) | `apps/web/features/referrals/service.ts:31-35` |
| F-11 | 🟡 YELLOW | A02 | Tokens bearer de acceso público almacenados en claro en DB (incluye G-3) | `features/orders/service.ts:457`; `quotes/service.ts:120`; `personalization/service.ts:1303`; `cart/recovery-service.ts:39` |
| G-1 | 🟡 YELLOW | A05 | Drift: `rls_auto_enable()` + event trigger `ensure_rls` existen en prod pero no están versionados ni existen en stg (ajustado por V2) | prod en vivo; ausente en `supabase/migrations` (grep 0 hits) |
| G-2 | 🟡 YELLOW | A05 | Grants en prod no coinciden con migración 022 (aplicada en stg, NO en prod); endurecimiento de `service_role` sin versionar | `supabase/migrations/00000000000022_revoke_anon_table_grants.sql:16-20` |
| G-4 | 🟡 YELLOW | A04 | Políticas RLS permisivas como backstop (`Cart/CartItem FOR ALL`, `review insert own` sin forzar `isApproved=false`) | `supabase/migrations/00000000000002_rls_policies.sql:107-135,170-177` |
| G-5 | 🟡 YELLOW | A02/A04 | `maxUsesPerCustomer` de cupones sin constraint DB (carrera read-then-write en `CouponUsage`) | `packages/db/prisma/schema.prisma:731-749` |
| G-6 | 🟡 YELLOW | A05 | `seed-test-customer.mjs` crea usuario con password fijo del repo sin guarda de ambiente | `packages/db/scripts/seed-test-customer.mjs:45` |
| G-7 | 🟡 YELLOW | A04 | Seed de reseñas FICTICIAS aprobadas directo a producción, bypaseando moderación | `packages/db/scripts/seed-reviews-curated.mjs:1-15` |
| G-8 | 🟡 YELLOW | A05 | Funciones con `search_path` mutable y EXECUTE por defecto a PUBLIC (coincide con WARN advisors) | migraciones `000…03:41-75`, `000…05:18-22,58-70`, `000…14:21-40` |
| G-9 | 🟡 YELLOW | A02 | PII sensible en claro sin cifrado a nivel columna (documento DIAN, teléfonos, direcciones, IPs) | `packages/db/prisma/schema.prisma` (varios modelos) |
| V2-6 | 🟡 YELLOW | A05/A07 | Leaked password protection (HIBP de Supabase Auth) desactivada en prod y stg | Advisor `auth_leaked_password_protection` (ambos proyectos) |
| V2-7 | 🟡 YELLOW (bajo) | A05 | `pg_net` instalado en schema `public` en stg (en prod está en `extensions`) | `pg_extension` stg; advisor `extension_in_public` |
| A-7 | 🟢 GREEN | A02 | Credenciales DEMO de Aveonline commiteadas en `.env.example` — controlado | `apps/web/.env.example:61-62` |
| B-9 | 🟢 GREEN | A01/A07 | `is_active_admin()` SECURITY DEFINER ejecutable por `anon` — impacto real nulo; endurecer por higiene | `supabase/migrations/00000000000005_search_and_storage.sql:58-70` |
| B-10 | 🟢 GREEN | A07 | Logins (cliente y admin) sin Turnstile; confían solo en rate-limit (recomendación) | `app/(auth)/login/login-form.tsx`; `app/admin/login/login-form.tsx` |
| E-3 | 🟢 GREEN | A03 | Tipo de campo CMS `HTML` existe pero NO tiene sink de renderizado crudo (riesgo latente) | `apps/web/features/cms/schemas.ts:15` |
| F-O1 | 🟢 GREEN | A02 | Código de referido público `LCS-<32 bits>` enumerable (impacto acotado) | `app/(auth)/login/actions.ts:144`; `registro/actions.ts:74` |
| F-O2 | 🟢 GREEN | A02 | Token de unsubscribe determinista sin expiración (documentado, aceptable) | `features/newsletter/unsubscribe.ts:31-43` |
| V2-5 | 🟢 GREEN | A05 | Grant TRUNCATE a `anon` existe en prod pero es inalcanzable vía API (0 RPC con truncate; PostgREST sin verbo) | `role_table_grants` prod; `pg_proc` prod |
| V2-8 | 🟢 GREEN | A05 | Bucket `customer-uploads` sin políticas = deny implícita real (402 objetos protegidos) — fragilidad, no exposición | `pg_policies`/`storage.buckets` prod |
| V2-9 | 🟢 GREEN | A05 | FORCE ROW LEVEL SECURITY ausente en las 59 tablas — impacto nulo en esta arquitectura | `pg_class` prod |

---

## 4. Hallazgos (ordenados por severidad descendente)

> Nota de verificación: cada hallazgo indica su veredicto de verificación independiente (V1 = código, V2 = DB en vivo). Los ajustes de V1/V2 están integrados y mandan sobre la redacción original del auditor.

### 🔴 [RED] B-1 · [A07] MFA TOTP no es obligatorio: un admin sin factor enrolado opera el panel solo con contraseña (y los roles no-SUPERADMIN ni siquiera pueden enrolarlo)

**Veredicto V1: CONFIRMADO — brecha real implementación vs. política (no es riesgo aceptado).**

**Ubicación:**
- `apps/web/app/admin/login/mfa/page.tsx:28-31`
- `apps/web/lib/admin-rbac-guard.ts:38-44`
- `apps/web/app/admin/(panel)/layout.tsx:33-37`
- `apps/web/app/admin/(panel)/seguridad/page.tsx:27`
- Política contradicha: `docs/SECURITY.md:93` ("Para admins (rol `SUPERADMIN`/`MANAGER`): **obligatorio** desde Fase 6") y `:848` ("MFA obligatorio admin")

**Descripción:** Todo el andamiaje MFA (aal2 en layout + acciones, recovery codes) es *opt-in*. El gate aal2 solo se dispara si el admin **ya tiene** un factor TOTP verificado (Supabase solo reporta `nextLevel === "aal2"` cuando existe factor); sin factor, `nextLevel` es `aal1` y la condición nunca se cumple. La página de reto MFA redirige al dashboard si no hay factor. Agravante: la única pantalla de enrolamiento exige `SUPERADMIN`, así que un MANAGER/FULFILLMENT/CMS_EDITOR **no tiene forma de activar MFA aunque quiera** (cae además en el deny-by-default de `canAccessAdminPath`).

**Evidencia:**
```tsx
// app/admin/login/mfa/page.tsx:29-31
const totp = (factorsData?.totp ?? []).find((f) => f.status === "verified");
// No tiene MFA → no hay nada que retar.
if (!totp) redirect("/admin/dashboard");
```
```ts
// lib/admin-rbac-guard.ts:40-43 — el candado SOLO se dispara si YA existe un factor
const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
if (aal && aal.nextLevel === "aal2" && aal.currentLevel === "aal1") {
  redirect("/admin/login/mfa");
}
```
```ts
// app/admin/(panel)/seguridad/page.tsx:27 — la ÚNICA pantalla de enrolamiento MFA es SUPERADMIN-only
const session = await requireRole(["SUPERADMIN"]);
```
Además `promoteToAdmin` (`features/admin-users/service.ts:203-239`) crea el `AdminUser` (`isActive: true`) sin verificar ni exigir factor MFA, y el e2e fija el comportamiento como esperado: "Admin (sin MFA → entra directo al dashboard)" (`tests/e2e/_setup/global.setup.ts:143`).

**Impacto:** Un `AdminUser` activo sin TOTP pasa todos los guards con `nextLevel === "aal1"` → **contraseña robada = acceso total al panel** (reembolsos, gestión de admins, finanzas). Contradice la política declarada "MFA activa para SUPERADMIN desde día 1" (seguridad/page.tsx:3) y `docs/SECURITY.md:93` — es convención operativa, no control técnico.

**Fix (enrolamiento forzado en el guard central + abrir enrolamiento a todos los roles):**
```ts
// lib/admin-rbac-guard.ts — tras validar sesión, antes del check aal2:
const { data: factors } = await supabase.auth.mfa.listFactors();
const hasVerifiedTotp = (factors?.all ?? []).some(
  (f) => f.factor_type === "totp" && f.status === "verified",
);
if (!hasVerifiedTotp) redirect("/admin/seguridad?enroll=required");
// ...luego el check aal2 existente
```
```ts
// app/admin/(panel)/seguridad/page.tsx:27
const session = await requireRole(ADMIN_ROLE_SETS.ALL_PLUS_CMS); // todos los roles admin
```
Y en `app/admin/(panel)/layout.tsx:45` añadir excepción: permitir `/admin/seguridad` a cualquier rol para que el redirect de enrolamiento no caiga en el deny-by-default de `canAccessAdminPath` (`lib/admin-rbac.ts:117`). Complemento: bloquear en `promoteToAdmin` hasta completar enrolamiento (flag `mfaEnrolledAt` en AdminUser) o enviar correo de onboarding con deadline.

---

### 🟡 [YELLOW] A-1 · [A08] Actions de GitHub fijadas por TAG mutable, no por SHA

**Ubicación:** `.github/workflows/ci.yml:46,54,258,352`, `backup.yml:59,62,67`, `dr-drill.yml:67,70,76`, `nightly-full.yml:41-51,130,194`

**Descripción:** Ningún `uses:` del repo usa SHA inmutable. Dependabot sí cubre el ecosistema `github-actions` (`.github/dependabot.yml:42-48`), pero actualiza de tag a tag.

**Evidencia:** Todos los `uses:` del repo (extraído con `grep -rhn "uses:"`):
```
actions/checkout@v7 · actions/setup-node@v7 · actions/upload-artifact@v4
gitleaks/gitleaks-action@v3 · pnpm/action-setup@v6 · supabase/setup-cli@v1
```

**Impacto:** Supply chain (A08): si el tag de una action es re-apuntado (compromiso del maintainer), el siguiente run de CI ejecuta código arbitrario con acceso a secrets (`R2_SECRET_ACCESS_KEY`, `BACKUP_DATABASE_URL` en backup.yml:99-105; `WOMPI_PRIVATE_KEY` sandbox en nightly-full.yml:115). Los workflows de backup/DR son los de mayor valor: tienen la connection string DIRECTA de la DB de producción.

**Fix:**
```yaml
# Ejemplo para cada action: resolver el SHA del tag actual y fijarlo con comentario
- uses: actions/checkout@08c6903cd8c0fde910a37f88322edcfb5dd907a8 # v5.0.0 (o el SHA real del tag en uso)
```
Complemento: `.github/dependabot.yml` ya actualiza actions; con SHA pinning Dependabot sigue funcionando (actualiza SHA + comentario).

---

### 🟡 [YELLOW] A-2 · [A02] Gitleaks no detecta `sb_secret_*` suelto ni `DATABASE_URL` con password (verificado empíricamente)

**Ubicación:** `.gitleaks.toml:14-19` (regla `supabase-secret-key-pattern`), `.gitleaks.toml:39-63` (allowlist)

**Descripción:** La regla custom exige el keyword `SUPABASE_SECRET_KEY` Y formato JWT `eyJ...`, pero las secret keys NUEVAS de Supabase son formato `sb_secret_...` — exactamente el formato de la key filtrada en el incidente real (`docs/incidents/2026-05-09-secret-key-leak.md:22`). Además la allowlist exime `docs/.*\.md$` COMPLETO (`.gitleaks.toml:43`): un secreto real pegado en cualquier doc pasa el escáner.

**Evidencia:** regla actual y prueba ejecutada con gitleaks 8.24.3 + la config del repo sobre un repo sintético:
```toml
regex = '''(?i)SUPABASE_SECRET_KEY\s*=\s*['"]?(eyJ[A-Za-z0-9_\-]{20,})['"]?'''
keywords = ["SUPABASE_SECRET_KEY"]
```

| Cadena de prueba | ¿Detectada? |
|---|---|
| `"sb_secret_9f8e...c1d"` (valor suelto en código) | ❌ NO |
| `DATABASE_URL=postgresql://postgres:Sup3rSecretP4ss@db.<ref>.supabase.co:5432/postgres` | ❌ NO | <!-- gitleaks:allow — string sintético de prueba, no un secreto real -->
| `SUPABASE_SECRET_KEY=sb_secret_...` (con nombre de var) | ✅ (solo por `generic-api-key` de la baseline) |
| `SUPABASE_SECRET_KEY=eyJ...`, `whsec_...`, `CRON_SECRET=...` | ✅ |

**Impacto:** El escáner in-repo (job `secrets-scan`, ci.yml:342-354) es la primera línea contra re-incidente del leak de 2026-05-09. Hoy no detectaría el mismo formato de key si vuelve a colarse sin el nombre de variable al lado. Mitigación parcial existente: GitHub Push Protection a nivel de cuenta (bloqueó un push real con `sb_secret_*` el 2026-05-09 — SECURITY.md:213). Es defensa en profundidad rota, no ausencia total.

**Fix:** agregar a `.gitleaks.toml`:
```toml
[[rules]]
id = "supabase-sb-secret"
description = "Supabase new-format secret key (sb_secret_*)"
regex = '''sb_secret_[A-Za-z0-9_\-]{20,}'''
keywords = ["sb_secret_"]

[[rules]]
id = "supabase-sb-publishable-hardcode"
description = "Publishable key hardcodeada fuera de .env* (debería venir de env)"
regex = '''sb_publishable_[A-Za-z0-9_\-]{20,}'''
keywords = ["sb_publishable_"]

[[rules]]
id = "postgres-uri-with-password"
description = "Connection string Postgres con password embebido"
regex = '''postgres(?:ql)?://[^:\s/]+:[^@\s]{6,}@'''
keywords = ["postgresql://", "postgres://"]
```
Y restringir la allowlist de docs a prefijos placeholder en vez de path completo (quitar `'''docs/.*\.md$'''` de `paths`, dejando solo los regexes de placeholder).

---

### 🟡 [YELLOW] A-3 · [A02] Backups de DB (con PII) suben a R2 comprimidos pero SIN cifrado a nivel aplicación

**Ubicación:** `apps/web/scripts/backup-db-to-r2.mjs:106-122`, `.github/workflows/backup.yml:97-106`

**Descripción:** El pipeline es `pg_dump → gzip → PutObject`. No hay gpg/KMS/envelope encryption en el script ni en el workflow. Lo positivo (verificado): retención 30 días (`BACKUP_KEEP: "30"`, backup.yml:106), credenciales solo por GitHub Secrets, el script no imprime secretos (valida forma, no valor — líneas 94-98), y el DR drill mensual verifica restaurabilidad.

**Evidencia:**
```js
const gzip = createGzip({ level: 9 });          // backup-db-to-r2.mjs:56
...
await client.send(
  new PutObjectCommand({ Bucket: bucket, Key: key, Body: body, ContentType: "application/gzip" }),
);                                              // backup-db-to-r2.mjs:115-122
```

**Impacto:** El dump contiene la DB completa de producción (órdenes con direcciones, teléfonos, emails — PII bajo Ley 1581). La confidencialidad depende 100% del ACL del bucket R2 y el SSE de Cloudflare. Un token R2 con scope amplio filtrado, o un bucket mal configurado como público, expone 30 días de PII en claro.

**Fix (cifrado simétrico antes de subir):**
```js
import { execFileSync } from "node:child_process";
// tras dumpAndGzip():
const body = execFileSync("gpg", ["--symmetric", "--cipher-algo", "AES256",
  "--batch", "--yes", "--passphrase-fd", "0", "-o", "-"], { input: pass + "\n", ... });
// mejor aún streaming: pg_dump | gzip | gpg -c → S3. Añadir secret BACKUP_GPG_PASSPHRASE
// y en dr-drill.mjs el paso inverso (gpg -d | gunzip | psql) para que el drill cubra el cifrado.
```

---

### 🟡 [YELLOW] A-4 · [A05] docs/SECURITY.md describe controles que ya NO coinciden con el código (doc-as-control roto)

**Ubicación:** `docs/SECURITY.md:261` vs `apps/web/lib/security-headers.ts:15`; `SECURITY.md:271-275` vs `security-headers.ts:45-47`; `SECURITY.md:279` vs `security-headers.ts:76`; `SECURITY.md:203` vs `apps/web/lib/env.ts:64`; `SECURITY.md:210`; `SECURITY.md:371-391`

**Descripción / Evidencia (verificada afirmación por afirmación):**
1. `SECURITY.md:261` dice `X-Frame-Options | DENY` → el código aplica `SAMEORIGIN` (`security-headers.ts:15`, decisión deliberada roadmap C1; el test `security-headers.test.ts:138` ya espera SAMEORIGIN). **Doc desactualizada.**
2. `SECURITY.md:271-275` afirma que la CSP de prod lleva `'strict-dynamic'` → el código lo RETIRÓ ("Ola 18 fix", `security-headers.ts:30-38`). El CSP real de prod es más débil que lo documentado en ese punto, aunque sigue sin unsafe-inline/unsafe-eval.
3. `SECURITY.md:279` incluye `https://api.anthropic.com` en `connect-src` → el código NO lo incluye (`security-headers.ts:76`: solo Supabase + Wompi; la IA es Gemini server-side).
4. `SECURITY.md:203` lista `ANTHROPIC_API_KEY` en el inventario → el código usa `GEMINI_API_KEY` (`env.ts:64`, `.env.example:147`).
5. `SECURITY.md:210` afirma: "**Pre-commit hook** con `gitleaks`…" → NO EXISTE: sin `.husky/`, sin `core.hooksPath`, sin `prepare` en package.json, `.git/hooks/` solo con samples.
6. `SECURITY.md:371-391` documenta `apps/web/lib/csrf.ts` → el archivo NO existe (`CSRF_SECRET` sí se usa con patrón HMAC equivalente en checkout-session.ts y newsletter/unsubscribe.ts, pero el doc cita un archivo inexistente).

**Impacto:** Un auditor/operador que confíe en SECURITY.md creerá que hay pre-commit scanning (no lo hay — el commit local es superficie sin control hasta el push) y que XFO es DENY. En una auditoría con regla "0 suposiciones", 1 de 6 afirmaciones muestreadas del doc resultó falsa y 3 desactualizadas.

**Fix:**
```diff
- | `X-Frame-Options` | `DENY` | ... |
+ | `X-Frame-Options` | `SAMEORIGIN` | Clickjacking externo bloqueado; permite preview iframe del admin (roadmap C1). `frame-ancestors 'self'` en CSP es el equivalente moderno |
```
Actualizar §CSP (quitar strict-dynamic, reflejar buildCsp real), reemplazar ANTHROPIC por GEMINI en el inventario, y o bien implementar el pre-commit hook:
```jsonc
// package.json
"scripts": { "prepare": "husky" }
// .husky/pre-commit
gitleaks git --staged --config .gitleaks.toml .
```
o bien corregir SECURITY.md:210 a "CI step (ci.yml secrets-scan) — NO hay hook local; el primer control es Push Protection + CI".

---

### 🟡 [YELLOW] A-5 · [A05] Respuestas early-return del proxy salen SIN security headers ni CSP

**Veredicto V1: CONFIRMADO (6 puntos de salida + matcher de assets).**

**Ubicación:** `apps/web/proxy.ts:131` (redirects /producto/*), `proxy.ts:159` (redirects dinámicos UrlRedirect), `proxy.ts:176` (redirect /maintenance), `proxy.ts:180-184` (403 CORS), `proxy.ts:223,239` (redirects /admin login/expired)

**Descripción:** Los headers solo se setean sobre `response` al final del flujo. Todos los `return NextResponse.redirect(...)` / `new NextResponse("Forbidden", {status: 403})` anteriores salen sin HSTS, XFO, nosniff ni CSP. Además el matcher (`proxy.ts:266-272`) excluye `_next/static`, `_next/image` e imágenes/fuentes estáticas → esos assets tampoco llevan nosniff.

**Evidencia:**
```ts
// proxy.ts:249-253
response.headers.set("X-Request-Id", requestId);
for (const [k, v] of Object.entries(SECURITY_HEADERS)) response.headers.set(k, v);
response.headers.set("Content-Security-Policy", cspValue);
```

**Impacto:** Bajo. Un 403 sin `X-Content-Type-Options: nosniff` es superficie de MIME-sniffing solo en navegadores legacy; los redirects sin HSTS importan poco porque el navegador ya cacheó HSTS de otras respuestas. Pero rompe la afirmación "headers en TODAS las rutas" y deja el 403 de CORS sin hardening.

**Fix:**
```ts
// helper en proxy.ts
function withSecurityHeaders(res: NextResponse, requestId: string): NextResponse {
  res.headers.set("X-Request-Id", requestId);
  for (const [k, v] of Object.entries(SECURITY_HEADERS)) res.headers.set(k, v);
  return res;
}
// y envolver cada early return: return withSecurityHeaders(NextResponse.redirect(...), requestId);
// el 403: return withSecurityHeaders(new NextResponse("Forbidden", { status: 403 }), requestId);
// (CSP no aplica a redirects 3xx sin body; sí al 403)
```

---

### 🟡 [YELLOW] A-6 · [A05] /status (pública) expone mensajes de error internos y topología de proveedores

**Ubicación:** `apps/web/app/status/page.tsx:49,63`

**Descripción:** La página es pública (no está en el gate /admin; la lista de servicios nombra Vercel, Postgres, Supabase Storage y Resend explícitamente — `status/page.tsx:70-81`) y devuelve detalles de error internos.

**Evidencia:**
```ts
return { name: label, description, status: "down", detail: `HTTP ${r.status}` };   // :49
...
detail: err instanceof Error ? err.message.slice(0, 60) : "desconocido",            // :63
```

**Impacto:** Bajo-moderado. `err.message` de un `fetch` server-side puede incluir hostnames internos o causas ("getaddrinfo ENOTFOUND …", "certificate…") que facilitan reconocimiento a un atacante, y la página anuncia qué proveedores atacar. Es deliberado (página de estado pública), pero el detalle debería ser genérico.

**Fix:**
```ts
} catch {
  return { name: label, description, status: "down", detail: "sin respuesta" };
}
```
(el error real ya se captura server-side vía instrumentation.ts `onRequestError` / ErrorLog para los admins).

---

### 🟡 [YELLOW] B-2 · [A07] Cookies de sesión Supabase (`sb-*`) sin flag `Secure` explícito y legibles por JS (`httpOnly: false` por diseño de `@supabase/ssr`)

**Ubicación:** `apps/web/lib/supabase/server.ts:81-101`, `apps/web/proxy.ts:188-207` (ninguno pasa `cookieOptions`; verificado con `grep -rn "cookieOptions"` → 0 coincidencias).

**Descripción:** Los defaults reales del paquete fijado (`@supabase/ssr@^0.12.4`, fuente verificada en unpkg) no incluyen `secure` y fuerzan `httpOnly: false`.

**Evidencia:**
```js
exports.DEFAULT_COOKIE_OPTIONS = {
    path: "/",
    sameSite: "lax",
    httpOnly: false,
    maxAge: 400 * 24 * 60 * 60,   // 400 días
};
```

**Impacto:** (1) El access/refresh token vive en cookies **legibles por JavaScript** — requisito del `createBrowserClient` (`lib/supabase/browser.ts:117-122`), pero implica que cualquier XSS exfiltra la sesión completa (mitigado, no eliminado, por la CSP por nonce de `proxy.ts:106-117`). (2) Sin `Secure` explícito, la cookie se transmitiría en una request HTTP plana si el navegador aún no tiene HSTS registrado (HSTS con preload sí está, `lib/security-headers.ts:9`, lo que reduce la ventana al primer contacto). (3) `maxAge` de 400 días en el navegador aunque el access token expire antes.

**Fix:**
```ts
// lib/supabase/server.ts:81 y proxy.ts:188 — pasar cookieOptions:
createServerClient(url, key, {
  cookieOptions: {
    secure: process.env.VERCEL_ENV === "production" || process.env.VERCEL_ENV === "preview",
    sameSite: "lax",
    // httpOnly no puede activarse: el browser client lee la sesión de document.cookie.
  },
  cookies: { /* ... */ },
});
```
Documentar en `docs/SECURITY.md` el trade-off `httpOnly:false` + dependencia de la CSP, y evaluar almacenar la sesión solo server-side (quitar `createBrowserClient` del reto MFA, `app/admin/login/mfa/mfa-challenge.tsx:81`) para poder subir a `httpOnly:true` en el futuro.

---

### 🟡 [YELLOW] B-3 · [A07] Enumeración de cuentas en el registro: mensaje explícito "Este correo ya tiene una cuenta"

**Ubicación:** `apps/web/app/(auth)/registro/actions.ts:226-235`

**Evidencia:**
```ts
const isExistingUser = (authData.user.identities ?? []).length === 0;
if (isExistingUser) {
  logger.info({ event: "auth.signup.already_exists", ip, userId: authData.user.id });
  return {
    error: "Este correo ya tiene una cuenta. Inicia sesión o usa 'Olvidé mi contraseña'.",
  };
}
```

**Impacto:** Oráculo de existencia de cuentas para cualquier email (rate-limited a 10/hora por IP y por email en prod, `registro/actions.ts:137-138`, así que enumeración masiva es lenta pero la confirmación puntual es directa). Inconsistente con la política anti-enumeración aplicada en login (`app/(auth)/login/actions.ts:93`), admin login (`app/admin/login/actions.ts:121-122`) y reset (`recuperar-password/actions.ts:100-105`). Es una decisión de UX consciente, pero debe documentarse como riesgo aceptado o cambiarse.

**Fix (patrón estándar: misma respuesta + correo al dueño):**
```ts
if (isExistingUser) {
  logger.info({ event: "auth.signup.already_exists", ip, userId: authData.user.id });
  // No revelar: responder igual que un signup exitoso y notificar por email.
  await sendEmail(accountExistsNoticeEmail({ to: parsed.data.email })).catch(() => {});
  return { success: "Si el correo está disponible, te enviamos un código de confirmación." };
}
```

---

### 🟡 [YELLOW] B-4 · [A07] Verificación y reenvío de OTP con rate-limit solo por IP (en claro, sin hash) y sin bucket por email

**Ubicación:** `apps/web/app/(auth)/confirmar-codigo/actions.ts:69` y `:141`

**Evidencia:**
```ts
const rl = await rateLimit(`verify-otp:${ip}`, isProd ? 10 : 30, 15 * 60);   // :69
// ...
const rl = await rateLimit(`resend-otp:${ip}`, isProd ? 3 : 10, 15 * 60);    // :141
```

**Impacto:** (1) El OTP de signup/recovery es de 6 dígitos (regex `^\d{6,10}$`, `:41`). Con 10 intentos/15 min **por IP** y ningún bucket por email, una botnet que rota IPs multiplica los intentos contra el código de una víctima concreta (el bucket por email existe en login/registro/reset pero se omitió aquí). Supabase aplica su propio throttling en GoTrue, pero la capa de app quedó incompleta respecto a su propio patrón. (2) La IP se persiste **en claro** en `rate_limit_buckets`, contradiciendo la convención del repo ("la IP ES dato personal… no debe quedar en claro", `lib/rate-limit-keys.ts:62-67`). Mismo defecto en `features/back-in-stock/actions.ts:32`, `features/consent/actions.ts:50` y `app/actions/search.ts:19`.

**Fix:**
```ts
import { emailKey, ipKey } from "@/lib/rate-limit-keys";
const rlIp = await rateLimit(ipKey("verify-otp", ip), isProd ? 10 : 30, 15 * 60);
const rlEmail = await rateLimit(emailKey("verify-otp", parsed.data.email), isProd ? 5 : 30, 15 * 60);
if (!rlIp.allowed || !rlEmail.allowed) { /* ... */ }
```

---

### 🟡 [YELLOW] B-5 · [A07/A02] Recovery codes admin: SHA-256 sin sal sobre ~49,5 bits de entropía + consumo no atómico (TOCTOU)

**Veredicto V1: CONFIRMADO (49,5 bits verificados; TOCTOU; agravante: consumir un código desactiva el TOTP → equivale a un bypass completo del 2º factor). Consolida el hallazgo F-8 del Auditor F.**

**Ubicación:** `apps/web/features/admin-mfa/recovery-codes.ts:15-30` (generación) y `:58-69` (consumo); almacenamiento `packages/db/prisma/schema.prisma:217-230` (`AdminRecoveryCode.codeHash`)

**Evidencia:**
```ts
const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"; // 31 símbolos
const CODE_LEN = 10;                                  // 31^10 ≈ 2^49.5
function hashCode(code: string): string {
  return createHash("sha256").update(normalize(code)).digest("hex");  // sin sal ni pepper
}
// consumo: findFirst (usedAt: null) → update separado, no atómico
const match = await prisma.adminRecoveryCode.findFirst({ where: { adminUserId, codeHash: hash, usedAt: null }, ... });
if (!match) return false;
await prisma.adminRecoveryCode.update({ where: { id: match.id }, data: { usedAt: new Date() } });
```
Mitigación online verificada: rate-limit doble bucket (IP + adminId) de 5 intentos/15 min en prod (`app/admin/login/mfa/actions.ts:49-58`); el código es de un solo uso lógico y consumirlo desenrolla el TOTP vía service role (`actions.ts:74-90`).

**Impacto:** Si la tabla `AdminRecoveryCode` se exfiltra (backups, SQLi futura, lectura indebida), 2^49.5 ≈ 8×10^14 hashes SHA-256 por código es brute-forceable offline por un atacante con GPU cluster (~12-23 h/código a 10-20 GH/s/GPU), obteniendo un código que **baja el MFA de la cuenta admin**. Además, findFirst+update permite doble consumo concurrente del mismo código (baja explotabilidad: requiere conocer el código, pero el control "un solo uso" no es estricto).

**Fix:**
```ts
// 1) Subir entropía y usar hash con coste o al menos pepper de servidor:
const CODE_LEN = 16; // 31^16 ≈ 2^79
const PEPPER = process.env.RECOVERY_CODE_PEPPER!; // openssl rand -hex 32
function hashCode(code: string): string {
  return createHash("sha256").update(PEPPER + normalize(code)).digest("hex");
}
// (mínimo alternativo: createHmac("sha256", process.env.CSRF_SECRET) — mata el crackeo offline sin DB+env)
// 2) Consumo atómico (single-use real):
const { count } = await prisma.adminRecoveryCode.updateMany({
  where: { adminUserId, codeHash: hash, usedAt: null },
  data: { usedAt: new Date() },
});
return count === 1;
```

---

### 🟡 [YELLOW] B-6 · [A01] `/api/admin/cms/edit-mode`: acción admin sin exigencia aal2 y cookie `CMS_EDIT_COOKIE` sin flag `Secure`

**Veredicto V1: CONFIRMADO.**

**Ubicación:** `apps/web/app/api/admin/cms/edit-mode/route.ts:35-53`

**Descripción:** Usa `getCurrentAdmin()` (que no verifica nivel AAL) en vez de `requireAdminAction()` (que sí exige aal2 por defecto, `admin-rbac-guard.ts:38-44`). Además, esta ruta vive bajo `/api/`, por lo que el gate del proxy para `/admin` (`proxy.ts:220`) **no aplica** — la única barrera es este handler.

**Evidencia:**
```ts
if (op === "enable") {
  const session = await getCurrentAdmin();           // sesión + rol, pero NO aal2
  const contentRoles: readonly string[] = ADMIN_ROLE_SETS.CONTENT;
  if (!session || !contentRoles.includes(session.admin.role)) { /* 303 */ }
  // ...
  res.cookies.set(CMS_EDIT_COOKIE, "1", {
    httpOnly: true, sameSite: "lax", path: "/", maxAge: 60 * 60 * 8,   // ← falta secure
  });
```

**Impacto:** Un admin con sesión aal1 (contraseña robada, reto MFA pendiente) puede activar el modo edición del CMS — acción que el resto del panel bloquea tras el candado aal2. Impacto directo limitado (el modo edición es sobre contenido ya visible), pero rompe la invariante "ninguna acción admin sin 2º factor". La cookie sin `Secure` es transmisible por HTTP plano en la primera visita pre-HSTS.

**Fix:**
```ts
import { requireAdminAction } from "@/lib/admin-rbac-guard";
if (op === "enable") {
  await requireAdminAction({ roles: ADMIN_ROLE_SETS.CONTENT }); // sesión + aal2 + rol
  // ...
  res.cookies.set(CMS_EDIT_COOKIE, "1", {
    httpOnly: true, sameSite: "lax", path: "/", maxAge: 60 * 60 * 8,
    secure: process.env.VERCEL_ENV === "production" || process.env.VERCEL_ENV === "preview",
  });
}
```

---

### 🟡 [YELLOW-bajo] B-7 · [A01] Páginas `/admin/disenos` y `/admin/fichas` sin guard propio (dependen solo del layout, que Next no re-ejecuta en navegaciones soft)

**Ubicación:** `apps/web/app/admin/(panel)/disenos/page.tsx:16-19`, `apps/web/app/admin/(panel)/fichas/page.tsx:17-20` (ambas fetchean datos sin llamar a `getCurrentAdmin`/`requireRole`; verificado con `comm` contra la lista de páginas que sí lo hacen).

**Evidencia:**
```tsx
// disenos/page.tsx:16-18 — entra directo a los datos
export default async function DisenosAdminPage() {
  const [items, tagOptions] = await Promise.all([listGalleryAdmin(), listGalleryTagOptions()]);
```

**Impacto:** En App Router el layout NO se re-renderiza en navegaciones client-side dentro del grupo `(panel)`; el guard RBAC del layout (`layout.tsx:44-47`) solo corre en el primer render duro. Un admin desactivado/degradado a mitad de sesión conservaría acceso de lectura a estas dos páginas mientras navegue por soft-nav (las mutaciones sí están cubiertas: `disenos/actions.ts:22`, `fichas/actions.ts:25` usan `requireAdminAction`). Datos expuestos: catálogo de diseños/fichas (bajo valor). Las demás 9 páginas sin guard directo son redirects puros sin datos (verificados).

**Fix:** añadir al inicio de ambas páginas:
```ts
await requireRole(ADMIN_ROLE_SETS.MANAGER_UP); // mismo set que sus actions
```

---

### 🟡 [YELLOW-bajo] B-8 · [A07] Idle-timeout admin: borrado de cookies del lado cliente, sin revocación server-side del refresh token; marca de actividad no firmada

**Ubicación:** `apps/web/proxy.ts:233-247`, `apps/web/lib/admin-activity.ts:26-35`

**Evidencia:**
```ts
// proxy.ts:239-244 — al detectar inactividad solo borra cookies en la response
for (const c of request.cookies.getAll()) {
  if (c.name.startsWith("sb-")) expired.cookies.delete(c.name);
}
expired.cookies.delete(ADMIN_ACTIVITY_COOKIE);
```
La cookie `admin_last_activity` es `httpOnly` pero **no firmada** (`admin-activity.ts:26-35`) — su valor lo envía el cliente en cada request.

**Impacto:** (1) Quien haya copiado las cookies `sb-*` antes del timeout conserva un refresh token válido server-side: el control cierra la sesión del navegador abandonado pero no revoca nada en GoTrue. (2) Un atacante con las cookies robadas puede fabricar `admin_last_activity=<now>` y evadir el idle-timeout indefinidamente. El control cumple su propósito real (sesión abandonada en equipo compartido) y está bien razonado contra el bypass "cookie ausente" (comentario `proxy.ts:226-232`), pero no es una barrera contra robo de sesión.

**Fix:**
```ts
// proxy.ts — al expirar, además de borrar cookies, revocar en el Auth server:
await supabase.auth.signOut({ scope: "global" }).catch(() => {});
// y firmar la marca (HMAC con CSRF_SECRET, mismo patrón que lib/checkout-session.ts):
const sealed = `${now}.${hmac(String(now))}`;
```

---

### 🟡 [YELLOW] C-1 · [A04] `/api/vitals`: escritura no autenticada sin tope global — la tabla WebVital crece sin límite ante un ataque distribuido

**Ubicación:** `apps/web/app/api/vitals/route.ts:50` (rate-limit) y `:59-70` (insert).

**Evidencia:**
```ts
// vitals/route.ts:50
const { allowed } = await rateLimit(`vitals:${getClientIp(request.headers)}`, 120, 60);
// vitals/route.ts:59
await prisma.webVital.create({ data: { ... } });
```
El único control es 120 req/min **por IP**. No existe cap global (contraste con `lib/error-capture.ts:97-98` que sí tiene `NEW_ROW_LIMIT = 300` filas nuevas/5min para ErrorReport). Un botnet con N IPs inserta N×120 filas/min de forma indefinida. Además `sessionId` es un string arbitrario de hasta 100 chars provisto por el cliente (`:43`), así que ni siquiera hay deduplicación posible.

**Impacto:** DoS de almacenamiento / coste de DB (la tabla WebVital crece sin freno con datos basura; además contamina las métricas p50/p75/p95 de `/admin/performance`, permitiendo manipular la telemetría que usa el negocio). Probabilidad media, impacto medio.

**Fix (listo):**
```ts
// Tras el rate-limit por IP, añadir backstop global como en error-capture.ts:
const rlGlobal = await rateLimit("vitals:new-row:global", 3000, 5 * 60);
if (!rlGlobal.allowed) return NextResponse.json({ ok: false });
// Y considerar sampling server-side (guardar solo 1 de cada K vitals por route).
```

---

### 🟡 [YELLOW] C-2 · [A05] `isPublicSettingKey` es una DENYLIST: cualquier setting futuro sensible sale por `/api/cms/settings` por defecto

**Ubicación:** `apps/web/lib/cms.ts:103-105`; consumo en `apps/web/app/api/cms/settings/route.ts:65,73`.

**Evidencia:**
```ts
// lib/cms.ts:103
export function isPublicSettingKey(key: string): boolean {
  return !key.startsWith("PICKUP_") && key !== "BUSINESS_NIT";
}
```
El filtro es "todo es público EXCEPTO `PICKUP_*` y `BUSINESS_NIT`". El propio comentario de la ruta (`settings/route.ts:15-16`) lo admite: *"si en el futuro se agregan settings con info sensible (claves API, secretos), extender isPublicSettingKey"*. Es decir: el default es exponer.

**Impacto:** Divulgación de configuración sensible (A05/A01) latente: hoy es seguro (`PICKUP_*` y `BUSINESS_NIT` nunca salen por la API pública — verificado en ambas ramas, `settings/route.ts:65,73`), pero el patrón garantiza que el próximo setting sensible se filtre. Es un fallo de diseño "fail-open".

**Fix (listo):** invertir a allowlist explícita:
```ts
const PUBLIC_SETTING_KEYS = new Set([
  "CONTACT_EMAIL", "CONTACT_WHATSAPP", "BUSINESS_NAME", "SOCIAL_INSTAGRAM",
  /* ...enumerar las claves públicas reales... */
]);
export function isPublicSettingKey(key: string): boolean {
  return PUBLIC_SETTING_KEYS.has(key);
}
```

---

### 🟡 [YELLOW] C-3 · [A05] `/api/health` y `/api/health/all` exponen el commit SHA exacto del deploy y el entorno, sin auth

**Ubicación:** `apps/web/app/api/health/route.ts:25-26`; `apps/web/app/api/health/all/route.ts:123-124`.

**Evidencia:**
```ts
// health/route.ts:25
version: process.env.VERCEL_GIT_COMMIT_SHA ?? process.env.NEXT_PUBLIC_GIT_SHA ?? "dev",
environment: process.env.VERCEL_ENV ?? process.env.NODE_ENV ?? "unknown",
```
`/api/health` además **no tiene rate-limit** (es el único endpoint de salud sin él — los demás sí: `health/all:94`, `health/db:37`, etc.), aunque su coste es trivial.

**Impacto:** Reconocimiento (fingerprinting de versión): cualquier anónimo obtiene el SHA exacto del código en producción y puede mapear el deploy a vulnerabilidades conocidas del árbol exacto. Bajo-medio; práctica común pero evitable.

**Fix (listo):**
```ts
// Devolver solo los primeros 7 chars o un flag booleano de "despliegue reciente":
version: (process.env.VERCEL_GIT_COMMIT_SHA ?? "dev").slice(0, 7),
// O mover version/environment a /api/health/all protegido por el cron-secret
// o por un header de monitor (monitores soportan auth headers).
```

---

### 🟡 [YELLOW] C-4 · [A05] `/api/health/crons` revela nombres de jobs, timestamps de última ejecución y cuáles están desactivados por ambiente

**Ubicación:** `apps/web/app/api/health/crons/route.ts:38-50`.

**Evidencia:**
```ts
// crons/route.ts:40-47
overdue: overdue.map((c) => ({ job: c.job, lastRunAt: c.lastRunAt })),
disabled: health.filter((c) => c.disabled).map((c) => c.job),
jobs: health.map((c) => ({ job: c.job, overdue: c.overdue, disabled: c.disabled, lastRunAt: c.lastRunAt })),
```
Público (con rate-limit 30/min, `:26`). Revela la topología operativa completa: nombres de los 8 crons, cadencia inferible por `lastRunAt`, y qué jobs están apagados (`CRON_JOBS_DISABLED`).

**Impacto:** Reconocimiento operativo. Bajo. Un atacante aprende, p.ej., que los emails transaccionales están desactivados en un ambiente, o que `purge-event-logs` no corre hace X días (ventana donde los logs se acumulan). El comentario (`:13`) lo justifica como necesario para el monitor externo; el trade-off es consciente pero puede reducirse.

**Fix (listo):** respuesta pública mínima y detalle solo con secreto:
```ts
const authed = secretOk(req.headers.get("x-cron-secret"));
if (!authed) {
  return Response.json(
    { status: overdue.length === 0 ? "ok" : "degraded", timestamp: new Date().toISOString() },
    { status: overdue.length === 0 ? 200 : 503 },
  );
}
// con secreto: incluir jobs/overdue/disabled completos (UptimeRobot/BetterStack
// aceptan headers custom en planes básicos).
```

---

### 🟡 [YELLOW] C-5 · [A05] `/api/health/storage` filtra el mensaje de error interno de Supabase al cliente

**Ubicación:** `apps/web/app/api/health/storage/route.ts:49-51`.

**Evidencia:**
```ts
return problemResponse(
  new InternalError(`Supabase Storage no responde: ${error.message.slice(0, 80)}`),
);
```
`InternalError` serializa `detail` al cliente (`lib/errors.ts:58-67`). El mensaje de error del SDK de Supabase puede incluir nombres de buckets, IDs de proyecto o detalles de red internos. Los demás healthchecks usan detalle estático precisamente por esto (`health/wompi/route.ts:83-84`: *"Detalle estático a propósito"*). Inconsistente.

**Impacto:** Divulgación leve de internals en caso de fallo. Bajo.

**Fix (listo):**
```ts
logger.warn({ event: "health.storage.error", message: error.message }); // ya existe
return problemResponse(new InternalError("Supabase Storage no responde. Revisar logs."));
```

---

### 🟡 [YELLOW] C-6 · [A04] `/api/catalog/search` y `/api/cms/search` no acotan la longitud de `q` — coste de query trigram con strings de hasta ~8 KB

**Ubicación:** `apps/web/app/api/catalog/search/route.ts:28` (sin `slice`); `apps/web/lib/catalog.ts:856` (`const q = query.trim().toLowerCase();` sin truncar). Ídem `apps/web/app/api/cms/search/route.ts:28` → `apps/web/lib/cms.ts:466-467`.

**Evidencia:**
```ts
// catalog/search/route.ts:28 — solo valida mínimo 2 chars, no máximo
const q = url.searchParams.get("q") ?? "";
// lib/catalog.ts:856
const q = query.trim().toLowerCase();   // ← sin .slice(0, N)
```
Contrastar con la defensa en capas que SÍ tiene el server action: `app/actions/search.ts:24` (`query.slice(0, 120)`) y `features/products/public-service.ts:384` (`rawQuery.trim().slice(0, 80)`). El límite práctico es el tamaño máximo de URL del edge (~8 KB), pero una query pg_trgm `similarity()` sobre un string de 8 KB contra `richDescription` (300-800 palabras) por fila es cara. Hay rate-limit (60/min y 30/min), así que el abuso requiere rotar IPs.

**Impacto:** Amplificación de coste de DB limitada por rate-limit. Bajo-medio.

**Fix (listo):**
```ts
// catalog/search/route.ts y cms/search/route.ts:
const q = (url.searchParams.get("q") ?? "").trim().slice(0, 120);
// (y/o dentro de searchCatalog/searchCmsBlocks, igual que public-service.ts:384)
```

---

### 🟡 [YELLOW] C-7 · [A04] `/api/catalog/products`: `offset` sin tope superior + cache-key por combinación de filtros = paginación profunda y cache-busting forzado

**Ubicación:** `apps/web/app/api/catalog/products/route.ts:53`; consumo en `apps/web/lib/catalog.ts:380` (`skip: filters.offset ?? 0`).

**Evidencia:**
```ts
// products/route.ts:53 — offset solo acotado por abajo
offset: Math.max(0, parseInt(sp.get("offset") ?? "0", 10) || 0),
```
`limit` sí está acotado (`:52`, max 100), pero `offset` no. Además `listCatalogProducts` es `unstable_cache` con **los filtros como cache key** (`lib/catalog.ts:334,403-404`): un atacante varía `offset`/`priceMin` arbitrariamente y cada combinación es una entrada de cache nueva que pega a la DB (Prisma `skip` con offset grande = scan costoso). Rate-limit 30/min/IP lo acota, pero con IPs rotadas es bypass trivial.

**Impacto:** Presión de DB y crecimiento de caché con claves basura. Bajo-medio.

**Fix (listo):**
```ts
offset: Math.min(10_000, Math.max(0, parseInt(sp.get("offset") ?? "0", 10) || 0)),
// Mejor: paginación por cursor (keyset) — el skip-offset profundo no escala.
```

---

### 🟡 [YELLOW] C-8 · [A04] Claves de rate-limit basadas solo en IP: evasión trivial con rotación de IPs y deriva de política (IP en claro en `rate_limit_buckets`)

**Veredicto V1 sobre el sub-punto "fail-open": CONFIRMADO solo para el camino 0-filas (casi inalcanzable — la función SQL siempre devuelve fila); el camino "error" está REFUTADO (la excepción propaga → 500, fail-closed de facto). Ese sub-punto baja a informativo (ver §8). El cuerpo del hallazgo (keys solo-IP + IP en claro) se mantiene YELLOW.**

**Ubicación:** `apps/web/lib/client-ip.ts`; usos: `apps/web/app/api/catalog/products/route.ts:27`, `catalog/search/route.ts:19`, `cms/_helpers.ts:27`, `api/unsubscribe/route.ts:23`, `api/vitals/route.ts:50`, etc.

**Evidencia:**
```ts
// lib/client-ip.ts
const vercel = headers.get("x-vercel-forwarded-for"); // NO spoofeable detrás de Vercel ✔
...
const xff = headers.get("x-forwarded-for");           // fallback spoofeable fuera de Vercel
```
La elección de IP es correcta en Vercel (`x-vercel-forwarded-for` lo sella el edge). Dos debilidades residuales:
1. **Todas las claves públicas son solo-IP** (sin capa por sesión/email/fingerprint). Un atacante con botnet o proxies residenciales multiplica el límite por N IPs. El propio `lib/rate-limit-keys.ts:17-20` documenta el patrón de doble capa (IP + identidad) para login/signup, pero no se aplica a search/recommend/vitals/log-error (no hay identidad disponible — es el coste de ser público; se acepta pero debe registrarse).
2. **Inconsistencia de privacidad:** `log-error` hashea la IP en la key (`api/log-error/route.ts:45` usa `ipKey()` → `hashIp`), pero las rutas catalog/cms/health/coupons/unsubscribe/vitals interpolan la IP **en claro** en la key, contradiciendo la política de `lib/rate-limit-keys.ts:28-33` ("la IP ES dato personal y no debe quedar en claro en la tabla rate_limit_buckets").
3. *(Ajustado a informativo por V1)* `lib/rate-limit.ts:49-56`: si `rate_limit_check` devuelve 0 filas → fail-open (`allowed: true`) **sin log**; la función SQL siempre devuelve fila, así que es casi inalcanzable; si la query lanza error, propaga → 500 (fail-closed). Conviene loguear el fail-open para detectarlo.

**Impacto:** Rate-limit evadible a escala (media); PII en claro en tabla interna (baja, Ley 1581).

**Fix (listo):**
```ts
// Unificar TODAS las keys públicas por el helper hasheado:
import { ipKey } from "@/lib/rate-limit-keys";
await rateLimit(ipKey("catalog_products", ip), 30, 60);
// Y en lib/rate-limit.ts:52 loguear el fail-open:
logger.warn({ event: "rate_limit.empty_row", key });
```

---

### 🟡 [YELLOW] C-9 · [A05] Cookie de edit-mode del CMS es auto-sembrable (`"1"` plano) — revela anotaciones `data-cms-key` sin ser admin

**Ubicación:** `apps/web/app/api/admin/cms/edit-mode/route.ts:47`; `apps/web/lib/cms-edit-mode.ts:19-24`.

**Evidencia:**
```ts
// lib/cms-edit-mode.ts:24
return store.get(CMS_EDIT_COOKIE)?.value === "1";
```
La ruta SÍ verifica admin server-side para *sembrar* la cookie (`edit-mode/route.ts:35-39`: `getCurrentAdmin()` + `ADMIN_ROLE_SETS.CONTENT` + auditoría — correcto). Pero el *valor* es el literal `"1"`: cualquier visitante puede hacer `document.cookie = "lucams_cms_edit=1"` (o curl) y el layout montará el overlay con atributos `data-cms-key` en el HTML (`lib/cms-edit-mode.ts:5-7`). El comentario de diseño (`:9-13`) lo declara deliberado: las keys son estructurales y el contenido es público, y las mutaciones re-verifican admin.

**Impacto:** Muy bajo hoy (expone nombres de keys de CMS sobre contenido ya público). Riesgo de confusión futura ("la cookie protege X"): el control real depende de que TODA mutación CMS futura mantenga su propio guard server-side; la cookie no aporta nada como señal (ni siquiera un HMAC).

**Fix (listo):**
```ts
// Sembrar valor firmado: HMAC(sessionId + "cms-edit", CSRF_SECRET) en vez de "1",
// y en isCmsEditMode() verificar sesión admin real (getCurrentAdmin) además de la cookie:
export async function isCmsEditMode(): Promise<boolean> {
  const store = await cookies();
  if (store.get(CMS_EDIT_COOKIE)?.value !== "1") return false;
  const session = await getCurrentAdmin();
  return !!session && ADMIN_ROLE_SETS.CONTENT.includes(session.admin.role);
}
```

---

### 🟡 [YELLOW] C-10 · [A03] `/api/catalog/products`: `priceMin`/`priceMax` sin guard de NaN ni rango — comportamiento silencioso confuso (robustez, no inyección)

**Ubicación:** `apps/web/app/api/catalog/products/route.ts:48-49`.

**Evidencia:**
```ts
priceMin: sp.get("priceMin") ? parseInt(sp.get("priceMin") as string, 10) : undefined,
```
`parseInt("abc")` → `NaN`, que llega a `lib/catalog.ts:392` (`s.minPrice >= NaN` → siempre false → lista vacía 200 OK). No hay inyección (el filtro es en memoria y Prisma parametriza lo demás), pero un cliente recibe un vacío sin explicación y el `filters` devuelto en la respuesta (`:62`) ecoa `NaN` (serializa como `null`). Higiene de validación: todas las demás rutas usan whitelist de enums o clamps; aquí falta el `|| undefined`.

**Impacto:** Muy bajo (robustez/UX). Se reporta por completitud de A03.

**Fix (listo):**
```ts
const toInt = (v: string | null) => {
  if (!v) return undefined;
  const n = Number.parseInt(v, 10);
  return Number.isFinite(n) && n >= 0 ? n : undefined;
};
priceMin: toInt(sp.get("priceMin")),
priceMax: toInt(sp.get("priceMax")),
```

---

### 🟡 [YELLOW] D-1 · [A08] Webhook AveOnline: secreto aceptado por query-string (`?secret=`) — fuga en logs de infraestructura

**Veredicto V1: CONFIRMADO ("ACCIÓN HUMANA" existe en el código; sin flag ni fecha de corte).**

**Ubicación:** `apps/web/app/api/webhooks/aveonline/route.ts:57-86`

**Evidencia:**
```ts
// route.ts:58-71
const providedQ = url.searchParams.get("secret");
const providedH = req.headers.get("x-aveonline-secret");
const providedT = (() => { ... payload.token ... })();
const okH = providedH != null && secureEquals(providedH, expected);
const okQ = providedQ != null && secureEquals(providedQ, expected);
const okT = providedT != null && secureEquals(providedT, expected);
// route.ts:81-86
if (okQ && !okH && !okT) {
  logger.warn({ event: "webhook.aveonline.secret_via_query_string" });
}
```
La comparación es timing-safe (`secureEquals`, `lib/timing-safe.ts:10-14`), hay fail-closed si no hay secreto configurado en prod (:49-55), y el código ya reconoce el problema (warning + "ACCIÓN HUMANA: reconfigurar el webhook en Aveonline"), pero el canal `?secret=` **sigue aceptado en producción** sin flag ni fecha de corte.

**Impacto:** El secreto por query-string queda en access logs de Vercel/proxies, historiales de monitoreo y potencialmente en headers `Referer`. Un actor con acceso a esos logs obtiene la única credencial que protege el webhook de tracking (AveOnline no documenta HMAC — `aveonline.ts:1193-1196`), y con ella puede forjar eventos `ENTREGADA`/`DEVUELTA`: sella `deliveredAt` → ancla la ventana de retracto, marca efectivo COD como "cobrado" en el ledger de conciliación (`cod-reconciliation.ts:43-47`), y dispara emails transaccionales al cliente. Post-autenticación, los estados monotónicos limitan el daño (no hay retroceso DELIVERED→SHIPPED, `saga.ts:696-721`), pero un DELIVERED forjado tiene consecuencias financieras reales.

**Fix (código listo):**
```ts
// route.ts — endurecer: query-string solo en transición con fecha de corte
const ALLOW_QUERY_SECRET = process.env.AVEONLINE_ALLOW_QUERY_SECRET === "true"; // default false
const okQ = ALLOW_QUERY_SECRET && providedQ != null && secureEquals(providedQ, expected);
```
y agregar `AVEONLINE_ALLOW_QUERY_SECRET` a una allow-list documentada; en cuanto AveOnline quede configurado con header/token, eliminar la vía query por completo. Mientras tanto, rotar `AVEONLINE_WEBHOOK_SECRET` si alguna vez se usó por URL en prod.

---

### 🟡 [YELLOW] D-2 · [A08] Webhook Resend: upsert "last-write-wins" sin comparar `occurredAt` — un evento viejo/reordenado pisa `email.bounced`/`email.complained`

**Ubicación:** `apps/web/app/api/webhooks/resend/route.ts:127-143`

**Evidencia:**
```ts
await prisma.emailEvent.upsert({
  where: { resendId: event.data.email_id },
  update: {
    type: event.type,                      // ← sobrescribe sin comparar occurredAt
    occurredAt: new Date(event.created_at),
    metadata,
  },
  create: { ... },
});
```
La firma Svix está bien implementada (HMAC-SHA256 con clave base64 tras `whsec_`, contenido `id.timestamp.body`, rotación multi-firma `v1,`, tolerancia 5 min, `timingSafeEqual` con length-check — `route.ts:55-94`; fail-closed en prod `:62-66`). El problema es de **integridad de datos post-autenticación**: la deduplicación es por `email_id` (no por `svix-id` + tipo), así que el segundo evento del MISMO email **sobrescribe** el tipo del primero. Si `email.bounced` llega y después Resend entrega (retrasado/reintentado) un `email.delivered` del mismo envío, la fila queda como `delivered` y la supresión anti-rebote deja de aplicar:
```ts
// lib/resend.ts:146-150 — la supresión depende de que el type siga siendo bounced/complained
const suppressed = await prisma.emailEvent.findFirst({
  where: { to: { in: recipients }, type: { in: ["email.bounced", "email.complained"] } },
  ...
});
```

**Impacto:** Reputación del dominio de envío (seguir escribiendo a direcciones que rebotaron o marcaron spam) y pérdida silenciosa del registro de quejas (Ley 1581 / deliverability). No es explotable sin el secreto; el riesgo real es el reorden natural de eventos.

**Fix (código listo):**
```ts
// No pisar un estado terminal de supresión con un evento no-terminal:
const SUPPRESSING = ["email.bounced", "email.complained"];
await prisma.$transaction(async (tx) => {
  const existing = await tx.emailEvent.findUnique({ where: { resendId: event.data.email_id } });
  const occurredAt = new Date(event.created_at);
  if (existing && SUPPRESSING.includes(existing.type) && !SUPPRESSING.includes(event.type)) {
    return; // el rebote/queja manda: no degradar el registro
  }
  if (existing && existing.occurredAt > occurredAt) return; // evento viejo: ignorar
  await tx.emailEvent.upsert({ where: { resendId: event.data.email_id },
    update: { type: event.type, occurredAt, metadata }, create: { /* … */ } });
});
```
Alternativa más fiel: dedup por `svix-id` en tabla aparte y una fila por (email_id, type).

---

### 🟡 [YELLOW] D-3 · [A04] Retracto: autorización "opt-out" — `customerId` opcional y la verificación de propiedad se salta si es `null`

**Ubicación:** `apps/web/features/retract/service.ts:86-134` y `:147-220`

**Evidencia:**
```ts
// service.ts:111-113 (getRetractableItems)
// Propiedad estricta: si hay cliente logueado, el pedido DEBE ser suyo. ...
if (opts.customerId != null && order.customerId !== opts.customerId) return [];

// service.ts:176-180 (createRetractRequest)
if (opts.customerId != null && item.order.customerId !== opts.customerId) {
  throw new RetractError("FORBIDDEN");
}
```
Ambas funciones aceptan `opts: { customerId?: string | null }` y **solo** validan propiedad cuando `customerId != null`. Hoy el único caller la pasa desde la sesión (`app/mi-cuenta/pedidos/[number]/actions.ts:36-37, 86-88`), así que **no hay IDOR explotable ahora mismo**. Pero el contrato es frágil: cualquier caller futuro (p.ej. un flujo guest con `publicAccessToken`) que omita el parámetro obtiene creación de solicitudes de retracto sobre **cualquier** `OrderItem`. Comparar con `createWarrantyClaim`, donde `customerId` es **requerido** en el tipo (`features/warranty/service.ts:104-120`) — el estándar correcto ya existe en el repo.

**Impacto:** Latente. Si se materializa: solicitudes de retracto sobre pedidos ajenos (notificaciones, exposición parcial de datos del pedido en emails del flujo, y trabajo de reconciliación admin).

**Fix (código listo):**
```ts
// Hacer la identidad obligatoria y explícita:
export async function createRetractRequest(
  orderItemId: string,
  opts: { customerId: string; reason?: string; now?: Date }, // ← sin "?", sin null
): Promise<{ id: string; refundAmount: number }> {
  // ...
  if (item.order.customerId !== opts.customerId) throw new RetractError("FORBIDDEN");
```
Si en el futuro se necesita retracto de invitado, agregar una variante `createRetractRequestByToken(orderItemId, publicAccessToken)` que resuelva la propiedad vía token — nunca omitiendo la verificación.

---

### 🟡 [YELLOW] D-4 · [A08] AveOnline: dedup roto para payloads sin `fecha`/`timestamp` (fallback a `new Date()` no determinista)

**Ubicación:** `apps/web/features/shipping/aveonline.ts:1239-1245` + `apps/web/app/api/webhooks/aveonline/route.ts:109`

**Evidencia:**
```ts
// aveonline.ts:1239-1244
function parseAveonlineDate(raw: string | undefined): Date {
  if (!raw) return new Date();               // ← timestamp "de ahora" si el payload no trae fecha
  const m = /^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2}:\d{2})$/.exec(raw.trim());
  if (m) return new Date(`${m[1]}T${m[2]}-05:00`);
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? new Date() : d;
}
```
```ts
// route.ts:109 — el externalId de dedup incluye ese timestamp:
const externalId = `${event.trackingNumber}-${event.status}-${event.timestamp.getTime()}`;
```
Si AveOnline entrega el shape sin `estado[].fecha`/`timestamp`, cada entrega genera un `externalId` distinto → el dedup por `WebhookEvent(source, externalId)` no dedup nada. El daño está **contenido** por defensas aguas abajo: transiciones monotónicas/validadas (`orders/service.ts:517-622`), emails con `idempotencyKey` (`orders/emails.ts:152+`), y la saga no reenvía email si el estado ya es terminal (`saga.ts:696-721`). El test de idempotencia (`route.integration.test.ts:195`) solo cubre payloads CON fecha.

**Impacto:** Bajo (sin doble email ni regresión de estado verificados), pero ante un payload RETURNED/EXCEPTION repetido sin fecha se re-marca `needsReconciliation` en cada entrega, y si AveOnline cambia el comportamiento de reintentos el ruido operativo crece.

**Fix (código listo):**
```ts
// route.ts:109 — si el payload no trae timestamp, dedup por (tracking, status) sin timestamp:
const tsKey = event.hasCarrierTimestamp ? String(event.timestamp.getTime()) : "no-ts";
const externalId = `${event.trackingNumber}-${event.status}-${tsKey}`;
```
(propagando `hasCarrierTimestamp` desde `handleWebhook`: `tsRaw != null` en `aveonline.ts:1224`).

---

### 🟡 [YELLOW] D-5 · [A05/A09] `RESEND_WEBHOOK_SECRET` fuera del fail-fast de arranque + logging de `bodyHead` con posible PII en webhooks

**Consolida el hallazgo F-7 del Auditor F (bodyHead).**

**Ubicación A:** `apps/web/lib/env.ts:40-65` (listas `PROD_REQUIRED`/`FULL_MODE_REQUIRED`) vs `apps/web/app/api/webhooks/resend/route.ts:62-68`.
**Ubicación B:** `apps/web/app/api/webhooks/wompi/route.ts:70-75` (alcanzable **sin autenticación**), `apps/web/app/api/webhooks/aveonline/route.ts:95-99` (`parse_fail`, solo tras validar secreto) y `:133` (`rawBodyHead` persistido).

**Evidencia:**
```ts
// env.ts:54-65 — FULL_MODE_REQUIRED incluye AVEONLINE_WEBHOOK_SECRET pero NO RESEND_WEBHOOK_SECRET:
const FULL_MODE_REQUIRED = [
  "WOMPI_PUBLIC_KEY", "WOMPI_PRIVATE_KEY", "WOMPI_EVENTS_SECRET", "WOMPI_INTEGRITY_SECRET",
  "AVEONLINE_USUARIO", "AVEONLINE_CLAVE", "AVEONLINE_WEBHOOK_SECRET", "GEMINI_API_KEY",
] as const;
```
```ts
// resend/route.ts:62-66 — sin secret, en prod rechaza todo (fail-closed ✓) pero en silencio operativo:
if (!secret) {
  if (process.env.NODE_ENV === "production") {
    logger.error({ event: "webhook.resend.no_secret_in_prod" });
    return false;
  }
```
```ts
// wompi/route.ts:70-74 — firma inválida loguea los primeros 200 chars del payload:
logger.warn({
  event: "webhook.wompi.invalid_signature",
  reason: verification.reason,
  bodyHead: rawBody.slice(0, 200),   // ← un evento LEGÍTIMO con secret desactualizado expone email/datos del cliente
});
// aveonline/route.ts:133 — persiste 1000 chars crudos en WebhookEvent.payload:
rawBodyHead: rawBody.slice(0, 1000),
```
Verificado por el Auditor F: `logger.ts:101-121` — `redact()` solo procesa claves de objetos y `Error.message/stack`; un string arbitrario en una key no sensible (`bodyHead` no está en `REDACT_KEYS` `:47-77` ni matchea el sufijo `:84`) pasa **intacto**. `scrubPii` no se aplica a strings sueltos.

**Impacto:** A) Operativo/compliance: si el secreto de Resend falta en prod, los eventos de rebote/queja nunca llegan y la supresión de `lib/resend.ts:146-155` deja de alimentarse — degradación silenciosa de deliverability (fail-closed, sin riesgo de seguridad directo). B) Los recortes de payload crudo en logs/DB pueden contener PII (email del pagador en `data.transaction.customer_email`, direcciones en tracking) ante rotaciones de secret o payloads malformados; además un atacante puede sembrar contenido arbitrario (inyección de logs) vía POST con firma inválida.

**Fix (código listo):**
```ts
// env.ts — agregar a PROD_REQUIRED (los eventos de email aplican también en modo catálogo):
"RESEND_WEBHOOK_SECRET",
```
```ts
// wompi/route.ts:73 — no loguear body crudo; la razón + headers bastan.
// Alternativa (Auditor F): hash truncado, mismo valor diagnóstico, cero PII:
logger.warn({ event: "webhook.wompi.invalid_signature", reason: verification.reason,
  bodyHash: createHash("sha256").update(rawBody).digest("hex").slice(0, 16) });
```

---

### 🟡 [YELLOW] E-1 · [A01/A03] Open redirect no autenticado en `POST /api/admin/cms/edit-mode` vía parámetro `next` con backslash

**Veredicto V1: CONFIRMADO con prueba dinámica (CWE-601).**

**Ubicación:** `apps/web/app/api/admin/cms/edit-mode/route.ts:25-27, 32, 56-58`

**Evidencia:**
```ts
// route.ts:25-27 — validador local, MÁS DÉBIL que lib/safe-redirect.ts
function safeNext(raw: string): string {
  return raw.startsWith("/") && !raw.startsWith("//") ? raw : "/";
}
// route.ts:32
const next = safeNext(String(form.get("next") ?? "/"));
// route.ts:56-58 — rama op=disable SIN guard de auth (por diseño "inofensivo")
const res = NextResponse.redirect(new URL(next, request.url), 303);
```
`safeNext` filtra `//evil.com` pero NO filtra `\` ni caracteres de control (a diferencia de `isSafeInternalPath` en `apps/web/lib/safe-redirect.ts:38-53`, que sí lo hace). Prueba dinámica con Node (WHATWG URL), ejecutada por el Auditor E y re-ejecutada por V1:
```
new URL("/\\evil.com", "https://lucamsshop.com") → https://evil.com/
safeNext("/\\evil.com") = "/\\evil.com"            ← pasa el filtro local
"//evil.com" → https://evil.com/                   (bloqueado por safeNext)
```
Por tanto `next=/\evil.com` produce un 303 con `Location: https://evil.com/`.

**Impacto:** El endpoint `op=disable` no exige sesión (route.ts:16 lo declara "sin guard"; confirmado por V1 en :56-58). Una página atacante con un form auto-submit `POST https://lucamsshop.com/api/admin/cms/edit-mode` (`op=disable&next=/\evil.com`) redirige al navegador de la víctima desde el dominio legítimo a un sitio de phishing. Open redirect clásico (OWASP A01, CWE-601). Severidad media: requiere interacción (visitar página atacante), no hay variante GET.

**Fix (código listo):**
```ts
// route.ts — reemplazar safeNext por el validador robusto ya existente
import { isSafeInternalPath } from "@/lib/safe-redirect";

function safeNext(raw: string): string {
  return isSafeInternalPath(raw) ? raw.trim() : "/";
}
```
(`isSafeInternalPath` ya rechaza `\`, `//`, control chars y hace el chequeo autoritativo de origen — `apps/web/lib/safe-redirect.ts:38-53`.)

---

### 🟡 [YELLOW] E-2 · [A03] Texto libre del usuario se envía a Google Gemini sin filtrado de PII

**Ubicación:** `apps/web/features/ai/actions.ts:35-38` → `apps/web/features/ai/gemini-provider.ts:40-51, 58-72`

**Descripción/Evidencia:** `occasion` es texto libre del cliente (`z.string().trim().min(3).max(200)` — `apps/web/features/ai/schemas.ts:23`) y se interpola directo en el prompt que sale a `https://generativelanguage.googleapis.com` (gemini-provider.ts:42, 58). El resto del input (`productName`, `slotCount`, `allowText`) es dato de catálogo, no PII.

**Impacto:** Bajo. Si un cliente escribe datos personales en "ocasión" (nombres, fechas, cédulas), viajan a un tercero (Google) sin aviso específico. No hay bypass de auth/rate-limit: la acción tiene doble capa de rate-limit (IP 20/h prod + identidad — actions.ts:50-66) y validación Zod; la API key es server-only (gemini-provider.ts:89). Es una observación de privacidad (Ley 1581 / subprocesadores), no una vulnerabilidad explotable.

**Fix (sugerido):** añadir una nota en la UI del asistente ("no escribas datos personales") y/o un filtro trivial de patrones (emails, teléfonos, números de documento) antes de `buildUserPrompt`:
```ts
const PII_PATTERNS = [/\b\d{6,12}\b/, /[\w.+-]+@[\w-]+\.[\w.]+/, /\b3\d{9}\b/];
if (PII_PATTERNS.some((p) => p.test(input.occasion))) {
  input = { ...input, occasion: "ocasión especial" }; // o rechazar con mensaje
}
```

---

### 🟡 [YELLOW] F-1 · [A06] Override de `nanoid` insuficiente: el gate de audit falla HOY con un HIGH

**Veredicto V1: CONFIRMADO.**

**Ubicación:** `pnpm-workspace.yaml:19-25` (override `nanoid: 3.3.17`); `pnpm-lock.yaml:4962` (`nanoid@3.3.17`), ruta `apps/web > next > postcss > nanoid`.

**Evidencia:**
- Salida de `pnpm audit --prod`:
  ```
  high │ nanoid: custom generators can loop indefinitely when size is zero
  Vulnerable versions │ <3.3.18
  Patched versions    │ >=3.3.18
  Paths               │ apps__web>next>postcss>nanoid
  More info           │ https://github.com/advisories/GHSA-2v37-7h3g-55p8
  4 vulnerabilities found / Severity: 4 high (1 ignored)
  ```
- GitHub Advisory API: `GHSA-2v37-7h3g-55p8 | high | CVE-2026-67213 | >= 4.0.0, < 5.1.6; < 3.3.18` → **3.3.17 sigue vulnerable** (corroborado por V1 vía cve.circl.lu — `github_reviewed: true` — GitLab advisories y Tenable; el piso parcheado es **3.3.18**).
- El comentario del override (`pnpm-workspace.yaml:20-22`) afirma que 3.3.17 cierra `GHSA-2v37-7h3g-55p8` ("gate de audit 2026-08-07"). Es falso.

**Impacto:** DoS (bucle infinito si `customAlphabet/customRandom` reciben size=0). Explotabilidad real **baja**: la única vía es `postcss` en build-time, que llama a nanoid con tamaño constante (input propio, no del atacante). El daño principal es de **proceso**: el gate `pnpm audit` que el repo usa como control está en rojo y el comentario documenta una remediación que no remedia → riesgo de falsa confianza y de normalizar el audit fallido.

**Fix:**
```yaml
# pnpm-workspace.yaml
overrides:
  nanoid: 3.3.18   # era 3.3.17 — GHSA-2v37-7h3g-55p8 exige >=3.3.18
```
`pnpm install --lockfile-only` y re-correr `pnpm audit --prod` (debe quedar solo el ignore documentado de sharp).

---

### 🟡 [YELLOW] F-2 · [A06] El comentario del override cita un GHSA que no existe

**Veredicto V1: CONFIRMADO.**

**Ubicación:** `pnpm-workspace.yaml:21` — "GHSA-2v37-7h3g-55p8 / GHSA-m9w9-5wcm-r62h (nanoid)".

**Evidencia:** `GHSA-m9w9-5wcm-r62h` devuelve 0 resultados en web_search, `github.com/advisories/GHSA-m9w9-5wcm-r62h` → "resource not found", OSV → "No results"; y **no aparece** en la lista de advisories de nanoid de `api.github.com/advisories?affects=nanoid` (solo existen GHSA-28wg-ghj8-5hjv, GHSA-2v37-7h3g-55p8, GHSA-mwcw-c2x4-8c55, GHSA-qrpm-p2h7-hrv2). Estado: **no verificado / probablemente inexistente**.

**Impacto:** Documentación de seguridad incorrecta; dificulta el triage futuro.

**Fix:** corregir el comentario al subir el override a 3.3.18 (citando solo GHSA-2v37-7h3g-55p8 / CVE-2026-67213, y opcionalmente GHSA-28wg-ghj8-5hjv que se cerró con 3.3.16).

---

### 🟡 [YELLOW] F-3 · [A06] `deepmerge-ts@7.1.5` vulnerable (HIGH) vía Prisma

**Ubicación:** `pnpm-lock.yaml:3281` (`deepmerge-ts@7.1.5`), ruta `packages/db > @prisma/client > prisma > @prisma/config > deepmerge-ts` (salida `pnpm audit --prod`).

**Evidencia:** `pnpm audit --prod` → `high │ DeepmergeTS has stack exhaustion when merging recursive object graphs │ vulnerable <8.0.0 │ patched >=8.0.0 │ GHSA-ggr8-5vv4-36mx`. Confirmado por GitHub Advisory API y GitLab advisories: CVE-2026-40345, CVSSv4 8.2.

**Impacto:** DoS por agotamiento de pila al hacer deep-merge de grafos recursivos. Requiere que el código pase objetos con ciclos a `deepmerge*`. La ruta es `@prisma/config` (parseo de `prisma.config.ts` local, build/CLI-time), **no input de red** → riesgo real bajo, pero rompe el gate de audit.

**Fix:** override `deepmerge-ts: ^8.0.0` en `pnpm-workspace.yaml` (verificar que `@prisma/config` acepte el major; si rompe, pin a `prisma`/`@prisma/client` ≥ la versión que ya traiga deepmerge-ts 8 y regenerar lockfile).

---

### 🟡 [YELLOW] F-4 · [A06] `sharp@0.34.4` vulnerable a GHSA-f88m-g3jw-g9cj — riesgo aceptado con mitigación VERIFICADA en código

**Ubicación:** `apps/web/package.json` (`"sharp": "0.34.4"`); `pnpm-lock.yaml:5712`; ignore documentado en `pnpm-workspace.yaml` (`auditConfig.ignoreGhsas: [GHSA-f88m-g3jw-g9cj]`, con justificación) y `.github/dependabot.yml:22-27`.

**Evidencia:**
- Advisory: libvips CVE-2026-33327/33328/35590/35591 (2 HIGH CVSSv4 7.0), afecta `sharp < 0.35.0`, workaround oficial `sharp.block({ operation: ["VipsForeignLoadNsgif","VipsForeignLoadTiff","VipsForeignLoadVips"] })`.
- Mitigación presente y es la única puerta: `apps/web/features/personalization/sharp-safe.ts:31-33` (`BLOCKED_LOADERS` idénticos al workaround + `sharp.block(...)`); consumidores verificados: `apps/web/lib/storage.ts:268-270`, `apps/web/lib/photo-validation.ts:186-188`, `apps/web/lib/cms-media.ts:88`, `apps/web/features/personalization/production-render.ts:20`, `bookmark-strips.ts:21`; test de contrato `sharp-safe.test.ts:29-31`.
- Superficie adicional acotada: uploads solo aceptan jpg/png/webp/avif con magic bytes (`apps/web/lib/storage.ts:123-137`); `next.config.ts:22-67` restringe `images.remotePatterns` a buckets propios de Supabase + localhost.

**Impacto:** Procesar GIF/TIFF/VIPS maliciosos con libvips vulnerable. Con el bloqueo de loaders y la allowlist de MIME, el vector queda cerrado **mientras** nadie importe `sharp` directo (hoy nadie lo hace) y las lambdas que corren el optimizer de `next/image` compartan proceso con un módulo que cargó `sharp-safe` (esto último no es verificable estáticamente — `sharp.block` es global por proceso). El pin en 0.34.4 también bloquea futuros parches de sharp.

**Fix:** mantener como riesgo aceptado, pero: (1) re-test periódico de `sharp@0.35.x` en lambda real de Vercel (causa del pin documentada: ERR_DLOPEN_FAILED); (2) añadir regla ESLint `no-restricted-imports` para `sharp` → forzar `@/features/personalization/sharp-safe`; (3) verificar en staging que una request a `/_next/image` sobre un GIF en bucket rechazado no pasa por un loader bloqueado.

---

### 🟡 [YELLOW] F-5 · [A06] Cadena dev `shadcn → @modelcontextprotocol/sdk` arrastra `hono@4.12.18`, `@hono/node-server@1.19.14`, `qs@6.15.1` con CVEs moderados

**Ubicación:** `pnpm-lock.yaml:12645-12653` (`shadcn@4.16.0` → `@modelcontextprotocol/sdk: 1.29.0`), `pnpm-lock.yaml:4004` (hono), `pnpm-lock.yaml:5410` (qs), lockfile `@hono/node-server@1.19.14`.

**Evidencia** (GitHub Advisory API / web_search):
- `@hono/node-server`: `GHSA-frvp-7c67-39w9 | medium | >= 2.0.0, < 2.0.5; < 1.19.15` → **1.19.14 afectado** (path traversal Windows en serve-static).
- `hono`: `<4.12.21` → CVE-2026-47673 (JWT acepta cualquier scheme), CVE-2026-47674 (ip-restriction IPv6), CVE-2026-47675 (cookie sameSite injection), CVE-2026-47676 (mount prefix con percent-encoding). 4.12.18 afectado.
- `qs`: `GHSA-q8mj-m7cp-5q26 / CVE-2026-8723 | moderate | >=6.11.1 <=6.15.1` → 6.15.1 afectado (DoS en stringify).
- `@modelcontextprotocol/sdk@1.29.0` en sí: NO afectado (sus advisories llegan hasta `<= 1.25.3`).

**Impacto:** **Solo dev/CI** (shadcn CLI es devDependency de `apps/web`; nada de esto se despliega al runtime de Vercel). Riesgo residual: ejecución local/CI.

**Fix:** `pnpm up -r @modelcontextprotocol/sdk` no basta (depende de shadcn); evaluar override `hono: ^4.12.21`, `qs: ^6.15.2`, `@hono/node-server: ^1.19.15` o actualizar `shadcn` cuando publique bump. Prioridad baja.

---

### 🟡 [YELLOW] F-6 · [A09] `ErrorLog`/`ErrorReport` persisten message+stack SIN la redacción de PII del logger, y sin retención

**Ubicación:** `apps/web/lib/error-capture.ts:26-35` (`captureServerError` → `prisma.errorLog.create` con `message`/`stack` crudos) y `:138-147` (`captureClientError` → `errorReport.create` con `message`, `stack`, `url`, `userAgent` crudos); alimentadores: `apps/web/instrumentation.ts:41-63` (`onRequestError`), `apps/web/app/api/log-error/route.ts:56-62`. Schema: `packages/db/prisma/schema.prisma` (`model ErrorReport` ~l.1105+).

**Evidencia:**
- La redacción de PII vive SOLO en el logger de stdout: `apps/web/lib/logger.ts:97-99` (`scrubPii` con `EMAIL_RE`/`PHONE_RE`) se aplica dentro de `redact()` (`:101-121`). `error-capture.ts` importa `logger` pero **no** `scrubPii` — el copy a DB se hace con `(e.message || "unknown").slice(0, 2000)` y `e.stack.slice(0, 4000)` tal cual.
- El propio comentario del logger reconoce el caso: `logger.ts:91-96` — "un unique-violation de Postgres trae la PII embebida (`Key (email)=(cliente@x.com) already exists`)". Ese mismo error llega vía `onRequestError` → `captureServerError` → **ErrorLog.message en claro**.
- Retención: `apps/web/features/observability/event-log-retention.ts:29-36` purga SOLO `EmailEvent` y `WebhookEvent` (180 días). No existe `deleteMany` sobre `errorLog`/`errorReport` en ningún archivo (`git grep` sin resultados) → acumulación indefinida.
- Nota: el payload de `/api/log-error` es además **controlado por el cliente** (ruta pública): cualquier string queda almacenado (message ≤2000, stack ≤8000 según Zod `route.ts:27-34`).

**Impacto:** PII (emails/teléfonos embebidos en errores de DB/validación) persiste en claro e indefinidamente en tablas accesibles desde `/admin/observability` (`apps/web/features/observability/service.ts:51-58,83-88` las lee). Incumplimiento de minimización/retención (Ley 1581) y brecha entre lo que el equipo cree redactado y lo que realmente persiste.

**Fix:**
```ts
// lib/error-capture.ts — exportar y aplicar el mismo scrub del logger
import { scrubPii } from "@/lib/logger"; // exportarla
message: scrubPii((e.message || "unknown").slice(0, 2000)),
stack: e.stack ? scrubPii(e.stack.slice(0, 4000)) : null,
```
Y extender `purgeExpiredEventLogs` con `errorLog`/`errorReport` (p.ej. 90 días) + añadir el paso al cron `apps/web/app/api/cron/purge-event-logs/route.ts`.

---

### 🟡 [YELLOW] F-9 · [A02] Cookie de checkout lleva PII completa en base64 — firmada pero NO cifrada

**Veredicto V1: CONFIRMADO.**

**Ubicación:** `apps/web/lib/checkout-session.ts:194-214` (`setCheckoutState`: `base64url(JSON.stringify(state)) + "." + HMAC`); el estado incluye `contact` (`fullName, email, phone, documentType, documentNumber`, `:28-34` / V1: `:107-118`), `address` completa (`:36-78`) y `billing.documentNumber` (`:80-85`).

**Evidencia:** HMAC-SHA256 con `CSRF_SECRET` + `timingSafeEqual` (`:137-149`) — integridad OK; cookie `httpOnly, sameSite:lax, secure(prod), TTL 60 min` (`:206-215`) — transporte OK. Pero base64 ≠ cifrado: cualquiera con acceso al navegador/disco/devtools del cliente lee nombre, cédula, teléfono y dirección completos. El propio header del archivo (:11-13) solo reivindica anti-manipulación, no confidencialidad.

**Impacto:** Exposición de PII en reposo en el cliente (dispositivo compartido, robo de perfil de navegador, extensiones). No hay fuga por red (HttpOnly+Secure), por eso YELLOW y no RED.

**Fix:** cifrar el payload con AES-256-GCM (clave derivada de `CSRF_SECRET`, `crypto.subtle` o `node:crypto`) además de firmarlo, o mover el estado a DB keyed por el `cart_session` (ya existe, 122 bits) y dejar en la cookie solo el id.

---

### 🟡 [YELLOW] F-10 · [A02] Cupones de recompensa de referido con 16 bits de entropía aleatoria

**Veredicto V1: CONFIRMADO (+ hallazgo adicional verificado: `isPublic:false` no se enforcea en el canje).**

**Ubicación:** `apps/web/features/referrals/service.ts:31-35` — `couponCode(prefix, seed)` = `REF-<últimos 4 alfanum del email>-<randomBytes(2).hex>`; creados como cupones PERCENT 10, 1 uso, `isPublic:false` (`:139-155`).

**Evidencia:**
```ts
function couponCode(prefix: string, seed: string): string {
  return `${prefix}-${seed.replace(/[^A-Z0-9]/gi, "").slice(-4).toUpperCase()}-${randomBytes(2)
    .toString("hex").toUpperCase()}`;
}
```
La parte impredecible son **4 hex = 16 bits** (65 536 valores). El segmento medio (4 chars) deriva del **email del destinatario** (`:140-141`) → predecible para quien conoce el email. Mitigación parcial: aplicación de cupones rate-limited 15/10 min por IP (`app/checkout/pago/actions.ts:267` — agotar el espacio desde una IP: ~30 días; con botnet es factible) y validación atómica en tx (`redemption.ts:180-183`); cupón `maxUses: 1`, `maxUsesPerCustomer: 1`, vigencia 90 días (`:143-152`). Hallazgo adicional de V1: **`isPublic: false` no se enforcea en el canje** — `features/coupons/redemption.ts` (`:108-117`) nunca consulta `isPublic`; cualquiera que adivine el código lo canjea.

**Impacto:** Robo de descuentos del 10% (fraude económico, no de datos).

**Fix:** `randomBytes(6).toString("base64url").toUpperCase()` (≥36 bits) o más; idealmente sin seed derivado del email (no aporta entropía y filtra 4 chars del email en el propio código, que viaja por email en claro).

---

### 🟡 [YELLOW] F-11 · [A02] Tokens bearer de acceso público almacenados en claro en DB

**Consolida el hallazgo G-3 del Auditor G.**

**Ubicación:** `apps/web/features/orders/service.ts:457` (`Order.publicAccessToken` = `randomBytes(16).hex`, 128 bits); `apps/web/features/quotes/service.ts:120` (ídem Quote); `apps/web/features/personalization/service.ts:1303` (`Design.shareToken`, 128 bits); `apps/web/features/cart/recovery-service.ts:39` (`AbandonedCart.recoverToken` = `randomBytes(24).base64url`, 192 bits); schema `packages/db/prisma/schema.prisma:573-576, 863-864, 1430, 1765` (columnas TEXT planas `@unique`).

**Evidencia:** Los 4 se almacenan como TEXT plano y se consultan por igualdad (patrón bearer). Generación CSPRNG y entropía correctas (PASS en eso). Sin columna `*Hash` ni uso de `crypt()` en ninguna migración (grep `pgcrypto|crypt(` → solo `CREATE EXTENSION pgcrypto` en CI stubs). Contraste: `AdminRecoveryCode` SÍ guarda solo hash sha256 (schema.prisma:217-230) — el patrón correcto ya existe en el repo pero no se aplicó a los tokens de cliente.

**Impacto:** Un leak de DB (backup filtrado, log de query con valores, error de privilegios futuro) expone links `/pedido/<token>`, `/cotizacion/<token>`, `/d/<token>` y de recuperación de carrito (con email asociado) utilizables de inmediato — PII de la orden: dirección, teléfono, email. Entropía alta (128-192 bits) mitiga guessing, no mitiga exposición en reposo. Defensa en profundidad; bajo-medio (requiere leak previo de DB).

**Fix (SQL/código):** migrar a hash-en-reposo:
```sql
ALTER TABLE "Order" ADD COLUMN "publicAccessTokenHash" TEXT;
-- backfill: UPDATE "Order" SET "publicAccessTokenHash" = encode(digest("publicAccessToken",'sha256'),'hex');
CREATE UNIQUE INDEX "Order_publicAccessTokenHash_key" ON "Order"("publicAccessTokenHash");
-- app: lookup por sha256(token); luego DROP COLUMN "publicAccessToken"
```
(pgcrypto ya está disponible en CI; habilitar en prod si falta). Ídem `recoverToken`, `shareToken`, `Quote.publicAccessToken`.

---

### 🟡 [YELLOW] G-1 · [A05] Drift: `rls_auto_enable()` + event trigger `ensure_rls` existen en prod pero NO están versionados en el repo ni existen en stg

**Veredicto V2: el planteamiento original del Auditor G ("función huérfana", RED) está REFUTADO — el event trigger `ensure_rls` está activo en prod y la usa. Hallazgo final = DRIFT + higiene de privilegios. Severidad ajustada: YELLOW (media-baja).**

**Ubicación (evidencia de ausencia en código):** `grep -rn "rls_auto_enable"` sobre todo el repo → 0 coincidencias. La migración `supabase/migrations/00000000000014_rls_event_trigger_enforce.sql:21-47` crea `public.enforce_rls_on_new_table()` + event trigger `enforce_rls_on_new_table_trg`; no existe ninguna otra función de event trigger en código.

**Evidencia live (V2, SQL ejecutado en prod):**
- `pg_get_functiondef('public.rls_auto_enable()')`: la función existe, `SECURITY DEFINER`, `SET search_path TO 'pg_catalog'`, itera `pg_event_trigger_ddl_commands()` y hace `ALTER TABLE ... ENABLE ROW LEVEL SECURITY` en schema public.
- `SELECT evtname, evtfoid::regprocedure::text FROM pg_event_trigger;` → existe **`ensure_rls`** (`evtenabled='O'` activo; tags `CREATE TABLE`, `CREATE TABLE AS`, `SELECT INTO`) → función `rls_auto_enable()`. Además existe `enforce_rls_on_new_table_trg` → `enforce_rls_on_new_table()` (también activo). En prod hay **dos mecanismos redundantes** que auto-habilitan RLS.
- `has_function_privilege`: `rls_auto_enable` y `is_active_admin` son las dos únicas SECURITY DEFINER, y ambas son **ejecutables por `anon` y `authenticated`** (corroborado por advisors prod, lints 0028/0029).
- En **stg NO existe** ni la función ni el trigger (solo `enforce_rls_on_new_table_trg`).

**Impacto:** (a) una función SECURITY DEFINER y su event trigger viven en producción **fuera de control de versiones**: no se re-crean en un DR/reset (o se re-crean distinto), y stg diverge de prod; (b) es ejecutable por `anon`/`authenticated` vía `/rest/v1/rpc/...` — nota de explotabilidad de V2: devuelve pseudo-tipo `event_trigger` y llama a `pg_event_trigger_ddl_commands()`, que **falla fuera de un event trigger** → invocarla vía RPC produce error, no daño; (c) redundancia de dos event triggers RLS (mantenimiento). Viola la premisa "DB como código"; probable origen: predecesora manual de `enforce_rls_on_new_table` que nunca se dropeó.

**Fix (SQL listo):**
```sql
-- 1. Ya inspeccionado por V2 (pg_get_functiondef): es la predecesora redundante de enforce_rls_on_new_table.
-- 2. Versionar el drop en una migración para que aplique a prod y quede en el repo:
DROP EVENT TRIGGER IF EXISTS ensure_rls;
DROP FUNCTION IF EXISTS public.rls_auto_enable();
```
(nombre del trigger confirmado por V2: `ensure_rls`). Crear la migración p.ej. `00000000000025_drop_orphan_rls_auto_enable.sql` con esos DROPs para que el fix quede versionado y aplique a stg/prod/DR. Complemento de higiene: `REVOKE EXECUTE ON FUNCTION public.is_active_admin() FROM PUBLIC, anon;` (ver B-9/G-8).

---

### 🟡 [YELLOW] G-2 · [A05] Grants en prod no coinciden con la migración 022 (aplicada en stg, NO en prod); endurecimiento de `service_role` hecho a mano y no versionado

**Veredicto V1: CONFIRMADO desde código (service_role sin endurecer en migraciones). Veredicto V2 (live): CONFIRMADO con drift prod/stg. El sub-punto "TRUNCATE explotable vía API" está REFUTADO por V2 (ver §8 y hallazgo V2-5).**

**Ubicación:** `supabase/migrations/00000000000022_revoke_anon_table_grants.sql:16-20`:
```sql
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon, authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE ALL ON TABLES FROM anon, authenticated;
```

**Evidencia live (V2, `information_schema.role_table_grants` en ambos proyectos):**
- **prod**: anon → REFERENCES 59, TRIGGER 59, TRUNCATE 59; authenticated → REFERENCES 59, TRIGGER 59, TRUNCATE 59. (Sin SELECT/INSERT/UPDATE/DELETE residuales.) La migración 022 **no se aplicó en prod** (o prod se re-creó después); en **stg: 0 filas** (postura código aplicada).
- V1 confirma que `REVOKE ALL` **sí cubre** REFERENCES/TRIGGER/TRUNCATE → la migración los intenta revocar; que persistan en prod implica grants de otro grantor que el rol ejecutor no pudo revocar, o re-creación posterior.
- Además, en prod `service_role` tiene solo REFERENCES/TRIGGER/TRUNCATE (sin DML) pero **ninguna migración revoca DML a service_role** (la 022 declara explícitamente `:13-14` "no toca `service_role`"; `git grep "service_role" -- supabase/migrations` → solo comentarios) → ese endurecimiento se hizo a mano y NO está versionado; en stg service_role sí tiene todos los DML.
- Limitación observada por V1: `ALTER DEFAULT PRIVILEGES FOR ROLE postgres` solo cubre tablas futuras creadas **por el rol postgres**; objetos creados por otro rol (p.ej. `supabase_admin`) no heredan la postura.

**Impacto:** (1) Drift prod↔código: un `db reset` o DR reconstruido desde el repo deja a service_role con DML completo por API (hoy prod no lo tiene); (2) los REFERENCES/TRIGGER/TRUNCATE residuales son benignos para DML y **no alcanzables vía API** (V2: 0 funciones con `truncate` en `public`; PostgREST no tiene verbo TRUNCATE/REFERENCES/TRIGGER — solo se materializan con conexión PostgreSQL directa, que anon/authenticated no tienen), pero demuestran que la migración 022 no es efectiva contra los defaults de Supabase en prod — falsa sensación de postura uniforme.

**Fix (SQL listo):**
```sql
-- Versionar el endurecimiento real de prod (nueva migración):
REVOKE REFERENCES, TRIGGER, TRUNCATE ON ALL TABLES IN SCHEMA public
  FROM anon, authenticated;              -- por si el grantor era otro rol
REVOKE SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public
  FROM service_role;                     -- service_role opera por bypass RLS
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE SELECT, INSERT, UPDATE, DELETE ON TABLES FROM service_role;
```
Verificar con `SELECT grantee, privilege_type FROM information_schema.role_table_grants WHERE table_schema='public'` tras aplicar.

---

### 🟡 [YELLOW] G-4 · [A04] Políticas RLS permisivas como backstop: `Cart/CartItem FOR ALL` sin restricción de columnas y `review insert own` no fuerza `isApproved=false` — hoy salvadas solo por la ausencia de grants

**Ubicación:** `supabase/migrations/00000000000002_rls_policies.sql`:
- `cart owner all` FOR ALL (líneas 107-119) y `cart item via cart` FOR ALL (líneas 121-135) — permiten a un cliente authenticated escribir `CartItem.unitPrice`, `qty`, etc. sin CHECK de columnas.
- `review insert own` WITH CHECK solo verifica pertenencia (líneas 170-177): no impide insertar `isApproved=true, featured=true` (auto-aprobación y auto-destaque de reseñas).
- `customer updates own row` (líneas 84-88): permite modificar `loyaltyPoints`, `referralCode`, `referredById` de la propia fila (WITH CHECK solo ata `supabaseUserId`).

**Evidencia de por qué no explota hoy:** prod y stg tienen anon/authenticated SIN privilegios DML (verificado live por el orquestador y V2; refuerzo en migración 022), así que PostgREST responde 42501 antes de evaluar RLS. Las políticas son backstop dormido.

**Impacto:** Si los grants DML reaparecen (proyecto nuevo donde 022 no muerde — ya demostrado en prod con REFERENCES/TRIGGER/TRUNCATE residuales — o un GRANT manual erróneo), un usuario registrado podría: fijar precios en su carrito, auto-aprobar reseñas, auto-asignarse puntos de fidelidad. Defensa en profundidad incompleta.

**Fix (SQL listo):**
```sql
DROP POLICY IF EXISTS "review insert own" ON "Review";
CREATE POLICY "review insert own" ON "Review"
  FOR INSERT TO authenticated
  WITH CHECK (
    "isApproved" = false AND "featured" = false
    AND EXISTS (SELECT 1 FROM "Customer" c
      WHERE c.id = "Review"."customerId"
        AND c."supabaseUserId" = (auth.uid())::text)
  );
-- Customer: mover loyaltyPoints/referralCode a tabla aparte o usar
-- trigger que rechace cambios en columnas sensibles para rol authenticated.
-- Cart/CartItem: restringir a SELECT/INSERT/DELETE de items propios y
-- columnas permitidas (unitPrice debe venir del server).
```

---

### 🟡 [YELLOW] G-5 · [A02/A04] `maxUsesPerCustomer` de cupones sin constraint DB: enforcement count-based read-then-write (carrera) en `CouponUsage`

**Ubicación:** `schema.prisma:731-749` — `CouponUsage` tiene `orderId @unique` e índices no únicos `@@index([couponId, email])`, `@@index([customerId, couponId])`. El comentario (líneas 737-739) admite "Se cuenta por (customerId OR email). Best-effort". Migración `20260718120000_coupon_usage_email/migration.sql` agrega el email sin unique.

**Evidencia:** A diferencia de `Review` (que recibió índice parcial único anti-carrera en `20260719120000_review_unique_per_customer/migration.sql`) y `Order_cartId_pending_unique` (`20260626225153_.../migration.sql`), `CouponUsage` no tiene garantía física para cupones de 1 uso por persona.

**Impacto:** Dos checkouts concurrentes con el mismo cupón `maxUsesPerCustomer=1` y mismo email/cliente pasan ambos el conteo → doble uso. Abuso de descuentos (fraude de bajo monto, repetible).

**Fix (SQL listo):**
```sql
-- Para cupones de 1 uso por email (los de bienvenida, caso real del comentario):
CREATE UNIQUE INDEX "CouponUsage_coupon_email_unique"
  ON "CouponUsage"("couponId", lower("email"))
  WHERE "email" IS NOT NULL;
-- O vía trigger CHECK contra Coupon.maxUsesPerCustomer cuando >1 (genérico).
-- El service debe capturar 23505 → "cupón ya usado".
```

---

### 🟡 [YELLOW] G-6 · [A05] Credencial por defecto en el repo: `seed-test-customer.mjs` crea usuario con password fijo sin guarda de ambiente

**Veredicto V1: CONFIRMADO (sin enforcement; solo crea Customer, no AdminUser — mitigante real).**

**Ubicación:** `packages/db/scripts/seed-test-customer.mjs:45` — `const password = process.env.PASSWORD ?? "TestCliente2026!";`; email default `test+cliente@example.com` (línea 44); crea el auth.user con `email_confirm: true` (línea 67-71, **bypass de confirmación de email**) vía SUPABASE_SECRET_KEY del entorno cargado.

**Evidencia:** No hay chequeo de que `NEXT_PUBLIC_SUPABASE_URL`/`DATABASE_URL` no sean prod (solo valida `password.length >= 8`, `:50`). El Makefile lo expone como `make seed-test-customer` contra el `.env.local` activo. La contraseña por defecto está en el repo (líneas 15, 45) y se imprime en stdout (:62, :117). Advertencia solo en comentario ("No usar este flujo para users productivos"), sin enforcement.

**Impacto:** Si alguien corre el target apuntando a prod (mismo patrón de ejecución que los seeds de catálogo que sí van a prod/stg por Makefile), queda un usuario con password público del repo. Mitiga: es solo Customer (no admin) y el email es `example.com` (no recibe correo). Contraste positivo: `seed-admin.mjs` NO crea credenciales (reusa auth.user existente) y `seed-clean.mjs` exige `FORCE=1`.

**Fix:**
```js
const password = process.env.PASSWORD;
if (!password) { console.error("PASSWORD requerido (sin default)."); process.exit(1); }
if ((process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").includes("lucams-prod")) {
  console.error("Prohibido sembrar usuarios de test en prod."); process.exit(1);
}
```

---

### 🟡 [YELLOW] G-7 · [A04/Integridad] Seed de reseñas FICTICIAS aprobadas directo a producción, bypaseando moderación

**Ubicación:** `packages/db/scripts/seed-reviews-curated.mjs:1-15` — "Seed de reseñas curadas **para producción** … testimonios son ficticios pero con nombres/ciudades colombianas reales … todas nacen `isApproved:true` y `featured`". También `seed-reviews-circle.mjs` (reseñas redactadas por el equipo atribuidas a personas del círculo de la dueña; nacen isApproved:false).

**Impacto:** Reseñas inventadas con identidades plausibles publicadas como si fueran de clientes reales: engaño al consumidor (SIC/estatuto del consumidor colombiano) y corrupción del sistema de moderación (el gate isApproved se salta por escritura directa DB). No es vulnerabilidad técnica remota, pero contamina la evidencia de reseñas verificadas y habilita suplantación de identidad de terceros reales (nombres/ciudades).

**Fix:** no publicar reseñas no verificadas; si se conservan, marcar `customerId` de clientes con compra verificada y dejar que el flujo de moderación (isApproved=false → aprobación manual) opere; considerar eliminar las seedeadas: `DELETE FROM "Review" WHERE createdBy = 'seed-reviews-curated.mjs';`

---

### 🟡 [YELLOW] G-8 · [A05] Funciones con `search_path` mutable y EXECUTE por defecto a PUBLIC (coincide con WARN advisors live)

**Veredicto V2: CONFIRMADO con matiz — solo 2 de las 5 funciones son SECURITY DEFINER (`is_active_admin`, `rls_auto_enable`), y esas 2 son ejecutables por anon. Las otras 3 son SECURITY INVOKER (ejecución por anon es estándar en Supabase). Severidad ajustada: media-baja.**

**Ubicación:**
- `rate_limit_check` — `supabase/migrations/00000000000003_rate_limit.sql:41-75`: plpgsql sin `SET search_path`, sin REVOKE EXECUTE.
- `immutable_unaccent` — `00000000000005_search_and_storage.sql:18-22`: SQL IMMUTABLE sin search_path fijado.
- `enforce_rls_on_new_table` — `00000000000014_rls_event_trigger_enforce.sql:21-40`: event-trigger sin `SET search_path` (usa `EXECUTE format('ALTER TABLE %s …', obj.object_identity)` — %s sobre identidad ya citada por PG, aceptable, pero el patrón correcto es `%I`).
- `is_active_admin` — `000…05:58-70`: SECURITY DEFINER con `SET search_path = public` ✔ bien, pero sin `REVOKE EXECUTE FROM PUBLIC` → ejecutable por anon (WARN live, lint 0028/0029).

**Evidencia live (V2, prod):** `has_function_privilege` confirma EXECUTE para `anon` y `authenticated` en las 5 funciones; advisors prod marcan `is_active_admin()` y `rls_auto_enable()` ejecutables vía `/rest/v1/rpc/...` y el lint 0011 (search_path mutable) para las invoker.

**Impacto:** Bajo en la postura actual (sin grants DML, RLS deny): un anon que invoque `rate_limit_check` vía RPC recibe 42501 en el INSERT interno (SECURITY INVOKER + tabla sin privilegios); `rls_auto_enable` falla fuera de event trigger (pseudo-tipo). Pero el search_path mutable en funciones es el vector clásico de secuestro de esquema y los advisors lo seguirán marcando; y `enforce_rls_on_new_table` corre en DDL-time con el rol que crea la tabla — un search_path inyectado en una sesión de migración podría desviar objetos no calificados.

**Fix (SQL listo):**
```sql
ALTER FUNCTION public.rate_limit_check(text,int,int) SET search_path = public, pg_catalog;
ALTER FUNCTION public.immutable_unaccent(text) SET search_path = public, pg_catalog;
ALTER FUNCTION public.enforce_rls_on_new_table() SET search_path = public, pg_catalog;
ALTER FUNCTION public.is_active_admin() SET search_path = public, pg_catalog;
REVOKE EXECUTE ON FUNCTION public.is_active_admin() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.rate_limit_check(text,int,int) FROM PUBLIC, anon, authenticated;
-- y en el cuerpo del event trigger usar: format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', ...)
```

---

### 🟡 [YELLOW] G-9 · [A02] PII sensible en claro sin cifrado a nivel columna (documento de identidad DIAN, teléfonos, direcciones, IPs)

**Ubicación:** `schema.prisma`: `Customer.documentNumber/documentType` (130-131), `Customer.phone` (124), `Address.line1/phone/structured` (171-185), `Order.billingDocumentNumber/billingName` (567-569), `Order.shippingAddress` Json (493), `Quote.customerWhatsapp/customerName` (1749-1752), `Consent.ipAddress/userAgent` (991-992), `SupportTicket.ip/message` (1157-1163), `AdminActionLog.ip` (960), `ErrorLog.stack` (1036).

**Evidencia positiva (mitiga):** todas estas tablas están en RLS deny-by-default (migraciones 007/010/014/017) y sin grants para anon/authenticated → no accesibles vía API pública. Retención: cron `lucams-purge-event-logs` purga EmailEvent/WebhookEvent >180d (migración 016). Consent y Quote sellan habeas data con versión (`dataConsentAt/Version`, líneas 1771-1772).

**Impacto:** Cifrado en reposo queda delegado al disco de Supabase; una fuga de backup o de rol con lectura expone documentos de identidad (dato sensible Ley 1581) en claro. Aceptable para el riesgo actual, pero `documentNumber`/`billingDocumentNumber` son candidatos a cifrado de columna o tokenización cuando DIAN entre en operación (Fase 7).

**Fix:** evaluar `pgcrypto`/column-level encryption o vault para `documentNumber` antes de habilitar facturación electrónica masiva; documentar la decisión en un ADR. No bloqueante hoy.

---

### 🟡 [YELLOW] V2-6 · [A05/A07] Leaked password protection (Supabase Auth) desactivada en prod y stg

**Veredicto V2: CONFIRMADO (advisor, ambos proyectos).**

**Ubicación/Evidencia:** `get_advisors(security)`:
- **prod**: lint `auth_leaked_password_protection` (WARN): "Leaked password protection is currently disabled."
- **stg**: mismo lint WARN.

No es verificable con SQL (es configuración de GoTrue, fuera del catálogo); el advisor es la fuente autoritativa de Supabase.

**Descripción/Impacto:** El check de contraseñas filtradas contra HaveIBeenPwned a nivel de Supabase Auth está apagado. La aplicación tiene su propio control HIBP k-anonymity correcto (`lib/pwned-passwords.ts:160-197`) en registro/cambio de password, así que la mitigación de aplicación existe; el advisor cubre además cualquier vía de Auth que no pase por las actions propias (p.ej. flujos directos de GoTrue). Severidad baja-media según política de la org.

**Fix:** activar en ambos proyectos según [documentación oficial](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection) (Dashboard → Authentication → Password Security).

---

### 🟡 [YELLOW-bajo] V2-7 · [A05] `pg_net` instalado en schema `public` en stg (divergencia con prod)

**Veredicto V2: CONFIRMADO — divergencia real.**

**Evidencia (query ejecutada en ambos):**
```sql
SELECT e.extname, n.nspname FROM pg_extension e
JOIN pg_namespace n ON n.oid=e.extnamespace
WHERE e.extname IN ('pg_net','pg_trgm','unaccent');
```

| extensión | prod | stg |
|---|---|---|
| pg_net | `extensions` ✅ | **`public` ⚠️** |
| pg_trgm | `public` | `public` |
| unaccent | `public` | `public` |

Advisors stg incluyen `extension_in_public` para `pg_net` (además de pg_trgm y unaccent); advisors prod solo pg_trgm y unaccent. Ninguna migración crea `pg_net` (las 015/016/021/023 solo la verifican) → instalación manual divergente, no versionada.

**Impacto:** Bajo. `pg_net` en public queda expuesto al search_path de la API y a funciones invoker con search_path mutable (ver G-8). Aunque el schema afectado es stg, el riesgo de que alguien replique stg→prod lo hace accionable.

**Fix:** mover a `extensions` en stg (`ALTER EXTENSION pg_net SET SCHEMA extensions;` con precaución de dependencias) y versionar la decisión; a largo plazo, `CREATE EXTENSION … SCHEMA extensions` también para pg_trgm/unaccent (WARN aceptado hoy, consistente entre ambientes).

---

### 🟢 [GREEN] A-7 · [A02] Credenciales DEMO de Aveonline commiteadas en `.env.example` — controlado

**Ubicación:** `apps/web/.env.example:61-62`

**Evidencia:** `AVEONLINE_USUARIO=demointegracion` / `AVEONLINE_CLAVE=demointegra2021`. Son la cuenta demo pública documentada por Aveonline (comentario líneas 57-60), y existe guard anti-misconfig verificado en código: `features/shipping/aveonline.ts:675` lanza error si `AVEONLINE_ENV=production` con credenciales demo. **No es un secreto filtrado.** Se reporta solo para que conste que fue revisado (es el tipo de hallazgo que un escáner marcaría).

---

### 🟢 [GREEN] B-9 · [A01/A07] `is_active_admin()` SECURITY DEFINER ejecutable por `anon` — impacto real nulo, endurecer de todas formas

**Ajuste V2: impacto real nulo confirmado — GREEN con fix SQL de higiene.**

**Ubicación:** `supabase/migrations/00000000000005_search_and_storage.sql:58-70`

**Evidencia:**
```sql
CREATE OR REPLACE FUNCTION is_active_admin()
RETURNS boolean LANGUAGE sql SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM "AdminUser"
    WHERE "supabaseUserId" = auth.uid()::text
      AND "isActive" = true AND "deletedAt" IS NULL
  );
$$;
```

**Evaluación de impacto (0 suposiciones):** la función solo puede responder sobre el `auth.uid()` de quien la invoca; para `anon` es NULL → siempre `false`. No hay oráculo sobre terceros ni lectura cruzada. `SET search_path = public` cierra el hijacking clásico de SECURITY DEFINER. Riesgo residual: si en una migración futura alguien añade a `public` una vista/tabla con el mismo nombre referenciado sin calificar, o modifica la función, el grant a `anon` amplía la superficie. Las policies de storage que la usan la ejecutan como `authenticated`, no como `anon`.

**Fix SQL:**
```sql
REVOKE EXECUTE ON FUNCTION public.is_active_admin() FROM anon;
REVOKE EXECUTE ON FUNCTION public.is_active_admin() FROM public;
GRANT EXECUTE ON FUNCTION public.is_active_admin() TO authenticated;
-- y endurecer el search_path a cadena vacía con nombres calificados:
CREATE OR REPLACE FUNCTION public.is_active_admin()
RETURNS boolean LANGUAGE sql SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public."AdminUser"
    WHERE "supabaseUserId" = (SELECT auth.uid())::text
      AND "isActive" = true AND "deletedAt" IS NULL
  );
$$;
```

---

### 🟢 [GREEN] B-10 · [A07] Logins (cliente y admin) sin Turnstile; confían solo en rate-limit

**Ubicación:** `apps/web/app/(auth)/login/login-form.tsx` y `apps/web/app/admin/login/login-form.tsx` (grep `turnstile` → 0 coincidencias en ambos); rate-limits en `app/(auth)/login/actions.ts:65-66` (15/15 min prod, doble bucket) y `app/admin/login/actions.ts:69-74` (5/15 min prod, doble bucket).

**Evaluación:** Turnstile sí protege registro, recuperar-password, checkout, newsletter, quotes, reviews y support (8 call sites de `verifyTurnstileToken`) con fail-closed en prod (`lib/turnstile.ts:34-40`). Los límites de login son razonables (admin 5/15 min por IP+email es estricto), así que el riesgo es bajo. **Recomendación de defensa en profundidad:** exigir Turnstile tras el 3er fallo consecutivo por bucket (requiere leer `rlIp.count`/`rlEmail.count`, ya disponible en `RateLimitResult`).

---

### 🟢 [GREEN] E-3 · [A03] Tipo de campo CMS `HTML` existe pero NO tiene sink de renderizado crudo

**Ubicación:** `apps/web/features/cms/schemas.ts:15`, `apps/web/app/admin/(panel)/contenido/paginas/[slug]/create-field-form.tsx:34`

**Evaluación:** Un admin puede crear campos `type: "HTML"`. Se verificó que NINGÚN componente del storefront lo renderiza como HTML crudo: los únicos `dangerouslySetInnerHTML` del repo son JSON-LD escapado. Si un campo HTML se muestra vía `<CmsMarkdown>` (`components/cms/cms-markdown.tsx:38`), react-markdown sin `rehype-raw` trata el HTML inline como texto y `rehype-sanitize` limpia el resto. **Riesgo latente:** si en el futuro se añade un renderer `format === "HTML"` con `dangerouslySetInnerHTML`, se convierte en XSS almacenado por un admin/CMS_EDITOR. **Recomendación:** dejar constancia en `features/cms/schemas.ts` de que el tipo HTML no debe renderizarse sin sanitización server-side (DOMPurify/sanitize-html en server).

---

### 🟢 [GREEN] F-O1 · [A02] Código de referido público `LCS-<randomBytes(4).hex>` (32 bits) — informativo

**Ubicación:** `apps/web/app/(auth)/login/actions.ts:144`, `apps/web/app/(auth)/registro/actions.ts:74`.

**Evaluación:** Es un código público compartible (no un secreto de sesión); la enumeración permite encontrar códigos válidos para auto-referirse — impacto acotado por el requisito de primer pedido pagado (`referrals/service.ts:112-124`). Sin acción requerida.

---

### 🟢 [GREEN] F-O2 · [A02] Token de unsubscribe determinista y sin expiración — informativo

**Ubicación:** `apps/web/features/newsletter/unsubscribe.ts:31-43` — SHA-256(email:CSRF_SECRET) truncado a 128 bits, verificación timing-safe (`:89-97`), email ofuscado en base64url (`:50-54`), rate-limit 30/min (`apps/web/app/api/unsubscribe/route.ts:21-26`).

**Evaluación:** El token vive para siempre: quien alguna vez tuvo el link puede re-dar de baja (impacto casi nulo; aceptable, documentado `:22-29`). Sin acción requerida.

---

### 🟢 [GREEN] V2-5 · [A05] Grant TRUNCATE a `anon` en prod — inalcanzable vía API (informativo)

**Veredicto V2: REFUTADO como vector explotable; se mantiene como higiene de grants.**

**Evidencia ejecutada (prod):**
```sql
SELECT p.proname FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
WHERE n.nspname='public' AND p.prosrc ILIKE '%truncate%';
-- Resultado: 0 funciones en public contienen truncate → no existe RPC que ejecute TRUNCATE.
```
PostgREST solo traduce verbos HTTP a `SELECT/INSERT/UPDATE/DELETE` y llamadas RPC; no existe verbo ni endpoint para `TRUNCATE`, `REFERENCES` ni `TRIGGER`. Esos privilegios solo se materializan con una conexión PostgreSQL directa, y los roles `anon`/`authenticated` no tienen acceso directo (solo vía PostgREST con JWT). **Acción:** revocar en prod aplicando la migración 022 ya existente en el repo (ver G-2).

---

### 🟢 [GREEN] V2-8 · [A05] Bucket `customer-uploads` sin políticas = denegación implícita real (402 objetos protegidos) — fragilidad baja, no exposición

**Veredicto V2: exposición REFUTADA; se mantiene como fragilidad de diseño (baja).**

**Evidencia ejecutada (prod):**
```sql
SELECT count(*) FROM pg_policies WHERE schemaname='storage' AND tablename='objects' AND qual ILIKE '%customer-uploads%';       -- 0
SELECT count(*) FROM pg_policies WHERE schemaname='storage' AND tablename='objects' AND with_check ILIKE '%customer-uploads%'; -- 0
SELECT bucket_id, count(*) FROM storage.objects GROUP BY 1;
-- customer-uploads: 402 | design-previews: 53 | product-images: 79 | production-assets: 132
SELECT id, public FROM storage.buckets;  -- customer-uploads: public=false (privado)
```
Inventario completo de políticas sobre `storage.objects` (prod): solo 10 políticas, todas `authenticated` y de administración para `cms-media`, `design-previews`, `product-images` y `production_assets`. **Ninguna política SELECT existe en absoluto**, y ninguna menciona `customer-uploads` — coherente con la migración `00000000000013_drop_customer_uploads_authenticated_policies.sql` (que eliminó deliberadamente las políticas de ese bucket).

**Consecuencia real:** RLS sin política aplicable = **deny-by-default** → anon y authenticated no pueden leer/escribir nada en `customer-uploads` vía API Storage; solo `service_role` (bypass RLS) accede. El bucket además es privado (sin URL pública). **Fragilidad:** hoy es seguro por ausencia de política, pero cualquier política futura mal redactada (p.ej. una genérica `USING (true)`) expondría 402 archivos de clientes de golpe. **Recomendación:** política explícita de denegación documentada o tests de regresión RLS. (Privacidad: en la verificación solo se extrajeron conteos, ningún nombre de objeto.)

---

### 🟢 [GREEN] V2-9 · [A05] FORCE ROW LEVEL SECURITY ausente — impacto nulo en esta arquitectura (informativo)

**Veredicto V2: CONFIRMADO literalmente (0 tablas con FORCE) — y aquí no es un problema.**

**Evidencia (prod):**
```sql
SELECT relname FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
WHERE n.nspname='public' AND c.relkind='r' AND c.relforcerowsecurity=true;
-- Resultado: 0 tablas.
```
**Por qué (casi) no importa aquí:** FORCE RLS solo afecta al **dueño** de la tabla (rol `postgres`), que sin FORCE bypasea su propia RLS. El acceso de la app se hace vía `anon`/`authenticated` (sujetos a RLS con normalidad) y `service_role` (tiene atributo `BYPASSRLS`, que ignora RLS **incluso con FORCE**). Añadirlo solo protegería contra un uso accidental del rol `postgres` como rol de aplicación, que no ocurre. Mejora opcional sin urgencia.

---

## 5. Resultado por categoría OWASP A01–A10

### A01 — Broken Access Control · 🟡 HALLAZGOS (B-6, B-7, B-9[GREEN], C-9, E-1)

**PASS — controles verificados:**
- Gate perimetral `/admin/*` (salvo `/admin/login`) exige sesión en CADA request (incl. RSC): `apps/web/proxy.ts:220-224`, matcher `:269-273`. *(#P1)*
- Layout panel: sesión admin activa + MFA aal2 + matriz RBAC con `x-pathname` autoritativo (lo setea el proxy, sobrescribe el del cliente): `app/admin/(panel)/layout.tsx:28-47`; `proxy.ts:112-115`. *(#P2)*
- Guard central de acciones `requireAdminAction` (sesión + aal2 + rol, redirect ANTES de cualquier try/catch; sin opt-outs — `grep aal2: false` → 0): `lib/admin-rbac-guard.ts:32-52`. *(#P3)*
- RBAC deny-by-default: ruta no listada → solo SUPERADMIN; prefijo más largo gana: `lib/admin-rbac.ts:104-118`. *(#P4)*
- TODAS las Server Actions admin mutantes pasan por `requireAdminAction`/`requireRole` (verificado por exclusión sobre 64 archivos "use server"). *(#P5)*
- `getCurrentUser()` valida contra Auth server (no `getSession()`); `getCurrentAdmin()` exige `isActive:true` + `deletedAt:null` por request → desactivar un admin corta acceso inmediato: `lib/auth.ts:37-42,71-84`. *(#P6)*
- Anti-IDOR en enlaces públicos: `/pedido/[token]` y `/cotizacion/[token]` con tokens 128 bits, noindex, `select` explícito sin datos sensibles; `/rastrear` exige número+correo con mensaje anti-enumeración. *(#P7)*
- `/internal/*` dev-only por `VERCEL_ENV` (notFound en todo deploy Vercel). *(#P8)*

### A02 — Cryptographic Failures · 🟡 HALLAZGOS (A-2, A-3, B-5, F-9, F-10, F-11, G-9; GREEN: A-7, F-O1, F-O2)

**PASS — controles verificados:**
- Fail-fast de env en arranque (zod CORE + PROD_REQUIRED + FULL_MODE_REQUIRED con throw en prod; `WOMPI_DISABLE_TIMESTAMP_CHECK=true` aborta en prod): `lib/env.ts:67-128` cableado a `instrumentation.ts:20-38`. *(#P9)*
- Ninguna `NEXT_PUBLIC_*` expone secretos (9 vars verificadas con `git grep`); `.env.example` documentado y completo vs. código. *(#P10)*
- Historial git limpio: 976 commits escaneados con gitleaks 8.24.3 → 5 matches, todos fixtures de test (verificados uno a uno). *(#P11)*
- Redacción de secretos/PII en logs stdout: key-suffix matching + scrub de email/teléfono: `lib/logger.ts:47-99`. *(#P12)*
- Tokens CSPRNG con entropía suficiente: cart session UUID v4 (122 bits), Order/Quote token 128 bits, shareToken 128 bits, recoverToken 192 bits. *(#P13)*
- HIBP k-anonymity correcto (prefijo 5 chars, Add-Padding, timeout 3s, fail-open logueado): `lib/pwned-passwords.ts:160-197`. *(#P14)*
- Cookie de checkout firmada HMAC-SHA256 + timingSafeEqual + TTL 60 min + flags correctos; shipping offers selladas HMAC re-validadas en finalize. *(#P15)*
- Token unsubscribe SHA-256(email:secret) 128 bits, timing-safe, sin fallback débil. *(#P16)*
- `Math.random` solo en contexto no-seguridad (texturas, shuffle UI, jitter de retry) — verificado por inspección completa del grep. *(#P17)*
- `AdminRecoveryCode` guarda solo hash (la entropía/sal es el hallazgo B-5; el patrón hash-en-reposo existe). *(#P18)*
- `.gitignore` cubre envs (verificado con `git check-ignore`); `db-local-env.sh` hace `chmod 600`. *(#P19)*

### A03 — Injection · 🟡 HALLAZGOS MENORES (C-10, E-2; GREEN: E-3)

**PASS — controles verificados:**
- **SQL: 100% parametrizado.** Todo el SQL crudo usa template tags de Prisma (`${q}` compila a bind param); `$queryRawUnsafe`/`$executeRawUnsafe` SOLO en tests E2E y seeds, nunca en código servido: `catalog.ts:859-875`, `cms.ts:479-504`, `public-service.ts:415-466`, `rate-limit.ts:44-46`. *(#P20)*
- Whitelists de enums en todos los parámetros categóricos (sort, mode, category, personalizable); sin `ORDER BY` dinámico con input. *(#P21)*
- `dangerouslySetInnerHTML`: solo JSON-LD escapado (`\u003c/\u003e/\u0026`) con nonce CSP (3 usos reales, todos seguros). *(#P22)*
- Sin `eval(`/`new Function`/`innerHTML`/`outerHTML`/`document.write` en código de app. *(#P23)*
- Markdown CMS: 9/9 archivos con `ReactMarkdown` usan `rehypeSanitize` (grep 1:1); sin `rehype-raw` en el repo. *(#P24)*
- Emails HTML: `escapeHtml` central (`& < > " '`) aplicado a todos los campos de usuario en 20+ templates revisados. *(#P25)*
- Reviews/Q&A renderizadas con escape automático de React; input Zod + cola de moderación. *(#P26)*
- Sanitización de wildcards LIKE (`q.replace(/[%_'"\\]/g, " ")`) + truncado en búsquedas storefront. *(#P27)*
- Wa.me links: número sanitizado a dígitos, mensaje con `encodeURIComponent`; nombres neutralizados contra markup de WhatsApp. *(#P28)*

### A04 — Insecure Design · 🟡 HALLAZGOS (C-1, C-6, C-7, C-8, D-3, G-4, G-5, G-7)

**PASS — controles verificados:**
- Rate-limit atómico vía función Postgres `rate_limit_check` (`INSERT … ON CONFLICT … DO UPDATE`, sin TOCTOU); keys con PII hasheada en los flujos sensibles. *(#P29)*
- Diseño anti-fraude de dinero: totales recalculados server-side, guard de overflow INT4, flete sellado HMAC revalidado en la frontera del dinero, cupones re-validados atómicamente dentro de la tx de la orden. *(#P30)*
- Idempotencia y anti-abuso garantizados a nivel DB (patrón ejemplar): índices parciales únicos `Order_cartId_pending_unique`, `InventoryLog_orderId_reason_variant_unique`, `Review_productId_customerId_active_unique`, `CouponUsage.orderId @unique`, `WebhookEvent @@unique([source,externalId])`, etc. *(#P31)*
- Stock: decremento atómico `UPDATE … WHERE stock >= qty` dentro de la tx de PAID, idempotente por InventoryLog. *(#P32)*
- COD anti-abuso por identidad (block-list, no-show, velocity 3/24h, 3 en vuelo, tope $300.000 COP sin entrega previa) con Turnstile + rate-limit. *(#P33)*
- Anti doble-cobro/doble-guía/doble-reembolso con transiciones TOCTOU-gateadas y claims atómicos. *(#P34)*
- `log-error` endurecido en 3 capas (Zod + rate-limit IP hasheada + backstop global anti-bloat) — modelo a replicar en `vitals`. *(#P35)*
- Stage guard (catálogo vs full) en doble capa: redirect en actions + throw en servicios. *(#P36)*

### A05 — Security Misconfiguration · 🟡 HALLAZGOS (A-4, A-5, A-6, B-6, C-2, C-3, C-4, C-5, C-9, D-5, G-1, G-2, G-6, G-8, V2-6, V2-7; GREEN: V2-5, V2-8, V2-9)

**PASS — controles verificados:**
- CSP fuerte en prod: nonce por request, `script-src 'self' 'nonce-…'` SIN unsafe-inline/unsafe-eval, `object-src 'none'`, `base-uri 'self'`, `frame-ancestors 'self'`: `security-headers.ts:45-47,89`. *(#P37)*
- Headers base: HSTS 2 años+preload, XFO SAMEORIGIN, nosniff, Referrer-Policy, Permissions-Policy deny, COOP/CORP. *(#P38)*
- CORS estricto: allowlist exacta + regex de previews Vercel con scope de equipo obligatorio; 403 a orígenes no listados; `Vary: Origin`. *(#P39)*
- Crons 8/8: `x-cron-secret` con `timingSafeEqual` + guard de longitud, solo header (nunca query param), fail-closed sin secret, 401 genérico, errores sin stack. *(#P40)*
- CI least-privilege (`permissions: contents: read` en los 4 workflows); sin `pull_request_target`; sin inyección de `github.event.*` en run scripts. *(#P41)*
- Sin stack traces al cliente (`error.tsx`/`global-error.tsx`; RFC 7807 con detalles estáticos). *(#P42)*
- `supabase/service.ts` (bypass RLS) con `import "server-only"`, lazy-init, `persistSession:false`; grep confirma uso solo en módulos server. *(#P43)*
- Dependabot semanal npm + github-actions, majors ignorados, security updates no bloqueados. *(#P44)*

### A06 — Vulnerable & Outdated Components · 🟡 HALLAZGOS (F-1, F-2, F-3, F-4, F-5)

**PASS — controles verificados:**
- **Next 16.2.12 / React 19.2.8**: por encima de TODOS los rangos afectados publicados (GitHub Advisory API, verificado en sesión) — incluye React2Shell (CVE-2025-55182/66478) y la tanda de middleware-bypass/DoS de 2026. *(#P45)*
- Build scripts bloqueados por defecto con whitelist explícita (`allowBuilds` justificada); único postinstall propio: `prisma generate`. *(#P46)*
- Overrides con motivo de seguridad documentados (postcss 8.5.26, @babel/core 7.29.6); `packageManager` pin + `engines`. *(#P47)*
- `.npmrc` sin `ignore-scripts` que desactive la protección. *(#P48)*

### A07 — Identification & Authentication Failures · 🔴 RED (B-1) + 🟡 (B-2, B-3, B-4, B-5, B-8; GREEN: B-10)

**PASS — controles verificados:**
- Login admin: anti-enumeration (mismo error), signOut inmediato, rate-limit doble 5/15 min prod, logging forense. *(#P49)*
- Login cliente: anti-enumeration ("Credenciales incorrectas"), rate-limit doble bucket. *(#P50)*
- Logout admin con `scope:"global"` (invalida todas las sesiones/dispositivos server-side). *(#P51)*
- Idle-timeout admin 30 min, ventana deslizante, marca sellada en login (cierra bypass "cookie ausente"), cookie httpOnly+sameSite+secure(prod). *(#P52)*
- MFA: verificación TOTP delegada a Supabase `challengeAndVerify`; recovery codes con rate-limit doble, un solo uso lógico, desenrolan TOTP al usarse. *(#P53)*
- Reset de password por OTP (no link — evita prefetch de Gmail), verifyOtp+updateUser atómico, signOut posterior, HIBP. *(#P54)*
- Cambio de password logueado: re-autenticación + HIBP + `signOut({scope:"others"})`. *(#P55)*
- Borrado de cuenta: palabra de confirmación + re-auth + anonimización completa + revoke/ban del auth user. *(#P56)*
- Política de contraseñas conforme NIST 800-63B (min 8 / max 72 + HIBP, sin complejidad forzada). *(#P57)*
- Turnstile fail-closed en prod si falta secret; protege 8 flujos públicos. *(#P58)*
- `getClientIp` prefiere `x-vercel-forwarded-for` (no spoofeable en Vercel). *(#P59)*
- Anti open-redirect `safeRedirectTarget` robusto aplicado en login `?next=` (única excepción: hallazgo E-1). *(#P60)*
- Fixtures E2E con passwords hardcodeadas: solo usuarios efímeros, `E2E_AUTH=1` prohibido en prd (throw explícito), teardown los borra. *(#P61)*
- Audit trail admin con IP anti-spoof + actor/entidad/metadata; fallo de persistencia no rompe la acción. *(#P62)*
- Anti-lockout + anti-self-deactivate en gestión de admins. *(#P63)*

### A08 — Software & Data Integrity Failures · 🟡 HALLAZGOS (A-1, D-1, D-2, D-4)

**PASS — controles verificados:**
- Webhook Wompi: firma SHA-256 del esquema oficial + `timingSafeEqual`, raw body byte-exacto, anti-replay 25h justificada, environment-match siempre activo, idempotencia con carrera P2002 cerrada, **monto contrastado con `order.total` antes de marcar pagada**. *(#P64)*
- Webhook Resend: Svix completo (HMAC-SHA256, rotación multi-firma, tolerancia 5 min, timing-safe), fail-closed en prod. *(#P65)*
- Webhook AveOnline: triple vía timing-safe, fail-closed en prod, trackingNumber debe existir en DB, estados monotónicos. *(#P66)*
- Tests de portería con firma real en los 3 webhooks (firma inválida 401, idempotencia, carreras). *(#P67)*
- Migraciones DB con verificación inline que FALLA si algo queda destapado (`RAISE EXCEPTION 'Quedan % tablas públicas sin RLS'`). *(#P68)*
- Cero secretos literales en migraciones/CI/scripts de DB; jobs pg_cron leen `vault.decrypted_secrets` y mandan el secreto por header, no por URL. *(#P69)*
- Drops destructivos con respaldo/verificación documentados; seeds destructivos con guardas (`FORCE=1`, dry-run, abort >$10.000 COP). *(#P70)*
- DR real: backup diario + drill mensual de restore con verificación de conteos; retención 30 días. *(#P71)*
- Incidente 2026-05-09: acciones correctivas existen en el repo (sección SECURITY.md:215-248, IRP-001, key rotada). *(#P72)*

### A09 — Security Logging & Monitoring Failures · 🟡 HALLAZGOS (F-6, D-5/F-7)

**PASS — controles verificados:**
- Logger estructurado con redacción amplia (keys exactas + sufijos secret|token|key|password|cookie|authorization|email|phone; `to`, `ip`, `whatsapp`, `documentNumber`; scrub de PII en Error.message/stack). *(#P73)*
- Rate-limit keys con hash (email/IP/teléfono como SHA-256 truncado) en los flujos sensibles. *(#P74)*
- Emails no loggean cuerpos (grep 0 coincidencias); `sendEmail` solo loggea evento/`to`(redactado)/subject/status. *(#P75)*
- Retención de eventos con PII: EmailEvent y WebhookEvent purgados a 180 días vía cron. *(#P76)*
- Audit trail admin completo (ver #P62). *(incluido arriba)*
- Instrumentación `onRequestError` persiste stack solo en ErrorLog interno, nunca al cliente. *(#P77)*

### A10 — Server-Side Request Forgery · ✅ PASS (0 hallazgos)

**Controles verificados:**
- El único `fetch(url)` con URL dinámica tiene allowlist explícita de Supabase Storage: `features/personalization/actions.ts:601-612`. *(#P78)*
- `getRequestOrigin()`/`getTrustedSelfBaseUrl()` derivan SOLO de env, nunca del header `Host`: `lib/origin.ts:27-28,52-59`. *(#P79)*
- `health/all` self-fetch: baseUrl de env + `redirect: "manual"` + timeout por probe. *(#P80)*
- URLs externas hardcodeadas (Gemini, AveOnline, Resend, Turnstile, HIBP, Wompi con `encodeURIComponent`). *(#P81)*
- Todos los fetch usan `fetchWithTimeout` (timeout obligatorio). *(#P82)*
- Webhooks admin de AveOnline: la URL viaja como DATO hacia endpoint fijo; el servidor nunca la fetchea; exige `https://` + rol SUPER. *(#P83)*

---

## 6. Auditoría de infraestructura Supabase (prod + stg)

Auditada EN VIVO vía MCP contra `lucams-prod` (`zxkucphbsfygakgxcnik`, us-east-2, PostgreSQL 17.6) y `lucams-stg` (`mjbdiqdkykhsixvqlrrp`): advisors de seguridad + SQL contra catálogo.

### 6.1 Matriz RLS — 59 tablas, 14 políticas, deny-by-default

**Estado verificado: 59/59 tablas con RLS habilitado en prod.** 14 políticas activas sobre 13 tablas; las 46 tablas restantes son deny-by-default (RLS sin políticas). Verificación inline en migraciones (`RAISE EXCEPTION` si quedan tablas sin RLS: `000…07:28-39`, `000…10:28-39`, `000…14:62-73`) y event trigger `enforce_rls_on_new_table_trg` que auto-habilita RLS en tablas nuevas.

| Tabla / Política | En código | En prod (live) | Drift |
|---|---|---|---|
| Category `public read active categories` | 000…02:50-53 | ✔ | No |
| Product `public read active products` | 000…02:55-58 | ✔ | No |
| ProductVariant `public read product variants` | 000…02:60-63 **reemplazada por** 000…11:6-18 | ✔ **versión endurecida 00011 confirmada por V2 con `pg_get_expr`** | No (refutado por V2) |
| Review `public read approved reviews` | 000…02:65-68 | ✔ | No |
| Review `review insert own` | 000…02:170-177 | ✔ (ver G-4: no fuerza `isApproved=false`) | No |
| BlogPost `public read published blog posts` | 000…02:70-73 | ✔ | No |
| Customer `customer reads own row` / `customer updates own row` | 000…02:79-88 | ✔ | No |
| Address `address owner all` | 000…02:91-103 | ✔ | No |
| Cart `cart owner all` / CartItem `cart item via cart` | 000…02:107-135 | ✔ (ver G-4: FOR ALL permisivas) | No |
| Order `order read own` / OrderItem `order item read via order` | 000…02:139-156 | ✔ | No |
| LoyaltyTxn `loyalty txn read own` | 000…02:159-166 | ✔ | No |
| **Total** | **14** | **14** | **0 drift en tablas** |
| 46 tablas deny-by-default | 000…02, 000…07, 000…10, 000…17, 000…18, 000…19, 000…24 | ✔ | No |
| FORCE ROW LEVEL SECURITY | Ausente en código | Ausente en prod (0 tablas — V2) | No (informativo, ver V2-9) |

### 6.2 Grants (ver hallazgo G-2)

| Postura | En código | En prod | En stg | Drift |
|---|---|---|---|---|
| anon/authenticated sin DML en `public` | 000…22:16-20 (REVOKE ALL + default privileges) | Parcial: conservan REFERENCES/TRIGGER/TRUNCATE ×59 tablas (migración 022 **no aplicada en prod**) | ✔ NADA (0 filas) | **SÍ en prod** (residual; inalcanzable vía API — V2) |
| service_role | Código NO revoca nada (022:13-14 lo dice explícito) | Solo REFERENCES/TRIGGER/TRUNCATE (endurecido a mano) | Todos los DML | **SÍ** — endurecimiento prod no versionado |

### 6.3 Funciones en `public` (verificadas con `has_function_privilege` — V2)

| Función | SECURITY DEFINER | anon/authenticated EXECUTE | search_path | Estado |
|---|---|---|---|---|
| `is_active_admin()` | ✅ | ✅ / ✅ (WARN lint 0028/0029) | `public` (fijado ✔) | Impacto nulo para anon (ver B-9); endurecer grants |
| `rls_auto_enable()` | ✅ | ✅ / ✅ (WARN) | `pg_catalog` | **No versionada; solo existe en prod** (ver G-1) |
| `rate_limit_check(text,int,int)` | ❌ (invoker) | ✅ / ✅ | sin fijar (WARN lint 0011) | Atómica y correcta; 42501 si la invoca anon |
| `immutable_unaccent(text)` | ❌ | ✅ / ✅ | sin fijar (WARN) | IMMUTABLE, bajo riesgo |
| `enforce_rls_on_new_table()` | ❌ | ✅ / ✅ | sin fijar (WARN) | Event trigger activo en ambos |
| `handle_auth_user_delete()` | — | — | — | DROP en 000…04:40-41; no existe en live ✔ |

### 6.4 Advisors de seguridad (Supabase, `get_advisors`)

| Advisor | Proyecto | Estado | Remediación |
|---|---|---|---|
| `auth_leaked_password_protection` (WARN) | prod + stg | **Desactivada en ambos** (hallazgo V2-6) | [Docs oficiales](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection) |
| Function `is_active_admin` ejecutable por anon/authenticated (lints 0028/0029) | prod | Confirmado por SQL | `REVOKE EXECUTE … FROM PUBLIC, anon` (fix en B-9/G-8) |
| Function `rls_auto_enable` ejecutable por anon/authenticated | prod | Confirmado por SQL | Drop versionado (fix en G-1) |
| `function_search_path_mutable` (lint 0011) | prod | `rate_limit_check`, `immutable_unaccent`, `enforce_rls_on_new_table` | `ALTER FUNCTION … SET search_path` (fix en G-8) |
| `extension_in_public` | prod: pg_trgm, unaccent · stg: + **pg_net** | Confirmado por SQL (`pg_extension`) | `CREATE EXTENSION … SCHEMA extensions` / mover pg_net en stg (fix en V2-7) |

### 6.5 Storage buckets (verificado con SQL en prod)

| Bucket | public | Objetos | Políticas | Estado |
|---|---|---|---|---|
| `product-images` | — | 79 | 3 admin-only (000…05:76-93) | ✔ sin drift |
| `design-previews` | — | 53 | 3 admin-only (000…06:88-105) | ✔ sin drift |
| `production-assets` | — | 132 | 1 FOR ALL admin (000…06:127-132) | ✔ sin drift |
| `cms-media` | — | — | 3 admin-only (000…20:29-46) | ✔ sin drift |
| `customer-uploads` | **false (privado)** | **402** | **0** (eliminadas deliberadamente en 000…13:19-21) | ✔ sin drift; deny implícita (ver V2-8) |

Inventario total sobre `storage.objects` (prod): 10 políticas, todas `authenticated` de administración; **ninguna política SELECT existe**. Pipeline de uploads en la app: magic bytes reales, allowlists sin SVG/HTML, re-encode con sharp endurecido + strip EXIF, claves sin path traversal, URLs firmadas TTL 1h en buckets privados (Auditor E, PASS #5).

### 6.6 pg_cron y Vault

| Ítem | En código | En prod (live) | Drift |
|---|---|---|---|
| Jobs SQL puros (`rate_limit_cleanup`, `stock_reservation_cleanup`) | 000…12:22-36 | 2 de los 10 jobs ✔ | No |
| 8 jobs HTTP con secretos desde Vault | 015/016/021/023 (re-agendados con bypass opcional en 023:34-63) | ✔ 8 jobs `net.http_get` con vault (`cron_base_url`, `cron_secret`, `cron_vercel_bypass`) | No |
| Secretos literales en SQL | **Ninguno** — solo `vault.create_secret('<placeholder>')` en COMENTARIOS y lecturas `vault.decrypted_secrets` en runtime | — | No. **PASS** (grep sk_live/eyJ/secret= → 0) |

Los 8 endpoints cron HTTP verifican `x-cron-secret` con comparación timing-safe (ver §5 A05 #P40).

### 6.7 Drift prod ↔ stg ↔ código (consolidado)

| Objeto | Código | prod | stg | Hallazgo |
|---|---|---|---|---|
| `rls_auto_enable()` + trigger `ensure_rls` | ❌ no versionado | ✅ existe (activo, redundante) | ❌ no existe | **G-1 (YELLOW)** |
| Grants anon/authenticated (REFERENCES/TRIGGER/TRUNCATE) | 022 los revoca | Residuales ×59 | Limpio (0) | **G-2 (YELLOW)** |
| service_role sin DML | No versionado | Endurecido a mano | Con DML completo | **G-2 (YELLOW)** |
| `pg_net` schema | No versionada | `extensions` ✔ | `public` ⚠️ | **V2-7 (YELLOW-bajo)** |
| Policy ProductVariant | 00011 endurecida | = 00011 ✔ (V2 con `pg_get_expr`) | — | Refutado (§8) |
| Leaked password protection | — | OFF | OFF | **V2-6 (YELLOW)** |
| 14 políticas RLS tablas + 10 storage | versionadas | 1:1 | — | ✔ sin drift |
| pg_trgm / unaccent en `public` | `CREATE EXTENSION` sin schema | `public` | `public` | Consistente (WARN aceptado) |
| Event trigger `enforce_rls_on_new_table_trg` | 000…14 | Activo | Activo | ✔ sin drift |
| pg_cron 10 jobs + Vault | 015/016/021/023 | ✔ | — | ✔ sin drift |

---

## 7. Cadena de suministro y dependencias

Fuentes: `pnpm audit --prod` (ejecutado en sesión; "4 vulnerabilities found / Severity: 4 high (1 ignored)"), GitHub Advisory API y web_search. Verificación individual por paquete:

| Paquete | Versión (lockfile) | CVE/GHSA verificado | Acción |
|---|---|---|---|
| **nanoid** | 3.3.17 (override) | 🔴 **GHSA-2v37-7h3g-55p8 / CVE-2026-67213** — vulnerable `<3.3.18` (DoS bucle infinito size=0); vía postcss build-time, explotabilidad real baja | **Subir override a 3.3.18** (hallazgo F-1) y corregir comentario (F-2: `GHSA-m9w9-5wcm-r62h` no existe) |
| **deepmerge-ts** | 7.1.5 (transitiva prod vía prisma) | 🔴 **GHSA-ggr8-5vv4-36mx / CVE-2026-40345** (CVSSv4 8.2) — stack exhaustion; vulnerable `<8.0.0`; ruta CLI-time, no input de red | Override `^8.0.0` o subir prisma (hallazgo F-3) |
| **sharp** | 0.34.4 | 🔴 **GHSA-f88m-g3jw-g9cj** (libvips CVE-2026-33327/33328/35590/35591; `<0.35.0`) — **ignorado en audit con mitigación verificada** (`sharp-safe.ts:31-33` bloquea los loaders del workaround oficial; única puerta de import) | Riesgo aceptado; re-test 0.35.x en lambda real + regla ESLint `no-restricted-imports` (hallazgo F-4) |
| **hono** | 4.12.18 (dev, vía shadcn→MCP sdk) | 🔴 CVE-2026-47673/47674/47675/47676 (`<4.12.21`) — moderados | Override `^4.12.21` (hallazgo F-5, solo dev/CI) |
| **@hono/node-server** | 1.19.14 (dev) | 🔴 GHSA-frvp-7c67-39w9 (`<1.19.15`, path traversal Windows) | Override `^1.19.15` (F-5) |
| **qs** | 6.15.1 (dev) | 🔴 GHSA-q8mj-m7cp-5q26 / CVE-2026-8723 (`<=6.15.1`, DoS stringify) | Override `^6.15.2` (F-5) |
| next | 16.2.12 | ✅ Sin advisories aplicables (todos los rangos 16.x terminan ≤16.2.11); incluye parche React2Shell (CVE-2025-66478) | Ninguna |
| react / react-dom | 19.2.8 | ✅ OK — versión fija de CVE-2026-44907 y ≥ fixes de CVE-2025-55182/55184/67779/55183 | Ninguna |
| react-server-dom-turbopack | (vendored en next) | ⚠️ No verificable por separado; cubierto por advisories de `next` | Ninguna |
| @prisma/client / prisma | 6.19.3 | ✅ 0 advisories (⚠️ arrastra deepmerge-ts vulnerable, ver arriba) | Ninguna directa |
| @supabase/supabase-js / @supabase/ssr | 2.111.0 / 0.12.4 | ✅ 0 advisories | Ninguna |
| zod | 4.4.3 (+3.25.76 transitiva dev) | ✅ OK (único advisory `<=3.22.2`) | Ninguna |
| jose | 6.2.3 (transitiva dev) | ✅ OK (advisories solo `≤4.15.4`) | Ninguna |
| jszip | 3.10.1 | ✅ OK (advisories `<3.8.0`) | Ninguna |
| postcss | 8.5.26 (override) | ✅ OK (último advisory `<=8.5.22`) | Ninguna |
| react-markdown / rehype-sanitize | 10.1.0 / 6.0.0 | ✅ 0 advisories | Ninguna |
| remark-gfm | 4.0.1 | ⚠️ No verificado individualmente (rate-limit API); no reportado por `pnpm audit` | Ninguna |
| @modelcontextprotocol/sdk | 1.29.0 (dev) | ✅ OK (advisories `≤1.25.3`) | Ninguna directa |
| express | 5.2.1 (transitiva dev) | ✅ OK (ningún advisory afecta 5.2.1) | Ninguna |
| uuid | 8.3.2 (transitiva dev) | Deprecado, sin CVE — informativo | Opcional: actualizar |
| @playwright/test / @aws-sdk/client-s3 / vitest / eslint / typescript / tailwindcss | 1.62.0 / 3.1097.0 / 4.1.10 / 9.39.4 / 5.9.3 / 4.3.0 | ⚠️ No verificados por API (rate-limit); `pnpm audit` no los reporta vulnerables | Ninguna |
| ~15 paquetes UI (three, framer-motion, radix, cmdk, sonner, zustand, etc.) | según lockfile | ⚠️ No verificados individualmente; sin evidencia de CVE y sin confirmación negativa; `pnpm audit --prod` no reporta ninguno | Ninguna |

**No existen en el repo** (preguntados por el alcance): `resend` (SDK), `otplib`/`qrcode`, `dompurify`/`sanitize-html`, `jsonwebtoken` (solo `jose` transitiva dev), librería de Turnstile — todo integración por fetch directo.

**Proceso supply chain (PASS):** build scripts bloqueados por defecto con whitelist justificada (`pnpm-workspace.yaml:5-16`); 0 `requiresBuild` adicionales en el lockfile; Dependabot semanal npm + github-actions con security updates no bloqueados; `packageManager: pnpm@11.0.9` pin; `.npmrc` sin `ignore-scripts`. **Gap:** actions de GH por tag mutable (hallazgo A-1).

---

## 8. Hallazgos refutados en verificación (transparencia 0-suposiciones)

Los verificadores independientes (V1 código, V2 DB en vivo) intentaron refutar cada hallazgo. Esto es lo que se **descartó o ajustó**, y por qué:

| # | Planteamiento original | Veredicto | Por qué |
|---|---|---|---|
| 1 | **"`rls_auto_enable()` es una función huérfana"** (G, RED) | **REFUTADO por V2** | El event trigger **`ensure_rls` está activo** en prod (`evtenabled='O'`) y la referencia; además su cuerpo fue inspeccionado (`pg_get_functiondef`) y es benigno (auto-habilita RLS). Lo que subsiste es el **drift** (no versionada, inexistente en stg) + EXECUTE por anon → reclasificado YELLOW (hallazgo G-1). |
| 2 | **"Drift de la policy ProductVariant"** (posible versión antigua en prod) | **REFUTADO por V2** | `pg_get_expr(polqual…)` en prod coincide **exactamente** con la versión endurecida de la migración 00011 (`isActive` + EXISTS sobre Product activo). Cerrado, no se reporta. |
| 3 | **"TRUNCATE grant a anon explotable vía API"** | **REFUTADO por V2** | 0 funciones en `public` contienen `truncate`; PostgREST no tiene verbo TRUNCATE/REFERENCES/TRIGGER; solo materializable con conexión PostgreSQL directa (que anon/authenticated no tienen). Informativo (hallazgo V2-5). |
| 4 | **"Bucket `customer-uploads` sin políticas = exposición"** | **REFUTADO como exposición por V2** | RLS sin política aplicable = **deny-by-default**; el bucket es privado y tiene 402 objetos protegidos por esa negación implícita. Se mantiene solo como fragilidad de diseño baja (V2-8). |
| 5 | **"Rate-limit fail-open ante error de DB"** (C) | **REFUTADO por V1 (camino error)** | Si la query lanza, la excepción propaga y la request falla (500) → fail-closed de facto; ningún caller envuelve `rateLimit` en try/catch permisivo. Solo subsiste el camino 0-filas, casi inalcanzable (la función SQL siempre devuelve fila) → informativo dentro de C-8. |
| 6 | **"MFA opt-in es diseño deliberado / riesgo aceptado"** | **REFUTADO por V1** | `docs/SECURITY.md:93` declara MFA **obligatorio** para SUPERADMIN/MANAGER y `:848` "MFA obligatorio admin" — el control técnico contradice la política escrita → se mantiene RED. |
| 7 | **Riesgo de fuga de `auth.users` vía API** | **Descartado por V2 (privilegios)** | `has_table_privilege('anon','auth.users','SELECT')` = FALSE y = FALSE para authenticated → inaccesible aunque PostgREST expusiera el schema. La lista exacta de schemas de la API (`pgrst.db_schemas`) queda pendiente de prueba HTTP (§2.5). |
| 8 | **FORCE RLS ausente como riesgo** | **Confirmado literal / impacto REFUTADO por V2** | 0 tablas con FORCE, pero el rol owner (`postgres`) no se usa como rol de aplicación y `service_role` tiene BYPASSRLS incluso con FORCE → informativo (V2-9). |
| 9 | **Ruta `/api/health/resend/sender` del brief** | **No existe** | Solo hay `sender.test.ts` en ese directorio; la ruta no está desplegada. Cobertura ajustada a 35 rutas reales. |
| 10 | **5 matches de gitleaks en el histórico (976 commits)** | **Todos falsos positivos** | Verificados uno a uno: fixtures de test. Ningún secreto real en el historial. |
| 11 | **`GHSA-m9w9-5wcm-r62h` citado en el comentario del override nanoid** | **Inexistente** | 0 resultados en web_search / GitHub Advisories / OSV. El hallazgo F-2 documenta el error de documentación. |
| 12 | **Severidad CVSS de los grants residuales** | **Bajada por V1/V2** | `REVOKE ALL` de la migración 022 SÍ intenta cubrir REFERENCES/TRIGGER/TRUNCATE (V1); los residuales son inalcanzables vía API (V2) → higiene/drift, no vector. |

---

## 9. Prioridad de remediación (ordenada, con esfuerzo estimado S/M/L)

| # | Acción | Hallazgo(s) | Justificación | Esfuerzo |
|---|---|---|---|---|
| 1 | **Enrolamiento MFA forzado en `admin-rbac-guard` + abrir enrolamiento a todos los roles + excepción en layout** | B-1 (RED) | Única brecha crítica: contraseña robada = panel completo; contradice la política escrita | **M** |
| 2 | **Deshabilitar `?secret=` del webhook AveOnline** (flag + fecha de corte + rotar secreto si se usó por URL) | D-1 | Única credencial del webhook de envíos con impacto financiero (COD forjado) | **S** |
| 3 | **Cerrar open redirect de edit-mode** (usar `isSafeInternalPath`) + aal2 + `Secure` en la cookie | E-1, B-6, C-9 | Explotable sin auth hoy; phishing desde dominio legítimo | **S** |
| 4 | **Subir nanoid a 3.3.18 + override deepmerge-ts@8 + corregir comentario GHSA** | F-1, F-2, F-3 | El gate de audit está en rojo hoy; restaurar la señal del control | **S** |
| 5 | **Aplicar migración 022 en prod + versionar endurecimiento de service_role + drop de `rls_auto_enable`** | G-2, G-1, V2-5 | Cierra el drift prod↔código; DR/reset hoy reconstruiría una postura distinta | **S** |
| 6 | **Recovery codes: pepper/HMAC + CODE_LEN 16 + consumo atómico `updateMany`** | B-5 | Cada código = bypass del 2FA ante leak de DB | **S** |
| 7 | **Scrub de PII en ErrorLog/ErrorReport + retención 90 días + quitar `bodyHead` crudo de webhooks** | F-6, D-5/F-7 | PII en claro e indefinida (Ley 1581); fix listo | **S** |
| 8 | **Cifrar (AES-256-GCM) o mover a DB el estado de la cookie de checkout** | F-9 | Cédula/teléfono/dirección legibles en el cliente | **M** |
| 9 | **Cifrar backups R2 a nivel aplicación (gpg streaming) + cubrir descifrado en el DR drill** | A-3 | 30 días de PII completa dependen solo del ACL del bucket | **M** |
| 10 | **Activar leaked password protection en Supabase Auth (prod y stg)** | V2-6 | Un click de configuración; complementa el HIBP propio | **S** |
| 11 | **Endurecer funciones DB: `SET search_path` + REVOKE EXECUTE (is_active_admin, rate_limit_check)** | G-8, B-9 | Cierra los WARN advisors y el hijacking clásico | **S** |
| 12 | **Cupones de referido ≥36 bits + enforcear `isPublic` en canje + unique `(couponId, lower(email))`** | F-10, G-5 | Fraude de descuentos enumerable | **S** |
| 13 | **Ampliar reglas gitleaks (`sb_secret_`, URI postgres) + recortar allowlist de docs + pre-commit hook o corregir SECURITY.md** | A-2, A-4 | Primera línea contra re-incidente del leak 2026-05-09 | **S** |
| 14 | **Hash-en-reposo de tokens bearer (Order/Quote/Design/AbandonedCart)** | F-11/G-3 | Defensa en profundidad ante leak de DB | **M** |
| 15 | **Pin de actions de GitHub por SHA** | A-1 | Supply chain de CI con secrets de prod | **M** |
| 16 | **Hacer obligatorio `customerId` en retracto (contrato estricto)** | D-3 | IDOR latente a un olvido de distancia | **S** |
| 17 | **Hardening de rutas públicas**: cap global en `/api/vitals`, truncate `q`, clamp `offset`, NaN-guard, keys hasheadas, allowlist de settings | C-1, C-6, C-7, C-8, C-10, C-2 | Anti-DoS de coste + privacidad de keys | **S-M** |
| 18 | **Endurecer health/status**: truncar SHA, detalle estático en storage, respuesta mínima en crons, detalle genérico en /status | C-3, C-4, C-5, A-6 | Anti-reconocimiento | **S** |
| 19 | **Webhooks Resend/AveOnline: no pisar bounced/complained + dedup determinista sin fecha** | D-2, D-4 | Integridad de deliverability y reconciliación | **S** |
| 20 | **Cookies de sesión: `Secure` explícito + documentar trade-off httpOnly** | B-2 | Endurecimiento de sesión | **S** |
| 21 | **Anti-enumeración en registro + doble bucket OTP + IP hasheada** | B-3, B-4 | Consistencia con el patrón propio del repo | **S** |
| 22 | **Idle-timeout: revocación server-side + marca firmada** | B-8 | Cierra evasión con cookies robadas | **S** |
| 23 | **Guards propios en `/admin/disenos` y `/admin/fichas`** | B-7 | Lectura post-desactivación vía soft-nav | **S** |
| 24 | **Reseñas ficticias: retirar de prod o reencausar por moderación** | G-7 | Riesgo legal/consumidor (SIC) | **S** |
| 25 | **Seed test-customer: PASSWORD obligatorio + guard anti-prod** | G-6 | Credencial pública del repo | **S** |
| 26 | **Mover `pg_net` a `extensions` en stg + versionar** | V2-7 | Convergencia stg↔prod | **S** |
| 27 | **Políticas RLS backstop: endurecer `review insert own`, Customer, Cart/CartItem** | G-4 | Defensa en profundidad si los grants reaparecen | **M** |
| 28 | **Filtro de PII hacia Gemini + nota en UI** | E-2 | Privacidad / subprocesadores | **S** |
| 29 | **Riesgo aceptado sharp: re-test 0.35.x periódico + regla ESLint** | F-4 | Mantener la mitigación vigente | **S** |
| 30 | **Cadena dev shadcn/hono/qs + política explícita de denegación de customer-uploads + early-returns del proxy con headers** | F-5, V2-8, A-5 | Higiene de menor prioridad | **S-M** |
| 31 | **Cifrado de columna para `documentNumber` antes de DIAN masivo (ADR)** | G-9 | Preventivo, no bloqueante | **L** |

**Prueba pendiente (no código):** `GET https://zxkucphbsfygakgxcnik.supabase.co/rest/v1/` con anon key para confirmar `pgrst.db_schemas` (§2.5).

---

## 10. Anexos

### Anexo A — Cobertura por auditor

| Auditor | Alcance | Cobertura declarada |
|---|---|---|
| **A — Secretos, Config y CI/CD** | env, security headers, proxy, workflows, gitleaks, dependabot, backups/DR, SECURITY.md, incidente 2026-05-09 | Leídos completos ~40 archivos (env.ts, .env.example, next.config.ts, instrumentation.ts, security-headers.ts + test, origin.ts, stage-guard.ts, logger.ts, proxy.ts, páginas internal/status/error, 4 workflows, dependabot.yml, .gitleaks.toml **probado empíricamente con gitleaks 8.24.3**, .gitignore, scripts de DB, backup-db-to-r2.mjs, dr-drill.mjs, docs/SECURITY.md secciones secretos/headers/CORS/CSRF/IRP, post-mortem del incidente). Verificación dinámica: gitleaks contra repo sintético con 6 formatos de secreto. |
| **B — Auth, Sesiones y RBAC** | proxy gate, admin layout/guards, login/registro/OTP/reset, MFA, recovery codes, cookies, rate-limit, migración 005 | Leídos completos: todos los libs de auth/security (18 archivos), `lib/supabase/{browser,server,service}.ts`, recovery-codes, admin-users, flujos `(auth)` y admin completos, e2e setup. Greps exhaustivos: 64 archivos "use server", todas las páginas admin vs guards, `supabase/service`, `verifyTurnstileToken`, `aal2: false`, `x-pathname`. Defaults de `@supabase/ssr@0.12.4` verificados en unpkg. |
| **C — Rutas API, Crons, Health** | 35/35 rutas existentes | Matriz completa ruta por ruta (método, protección, rate-limit, validación, veredicto) en §fuente. El brief listaba ~40; el delta son archivos que no existen (`/api/health/resend/sender` no existe). |
| **D — Webhooks, Pagos, Checkout, Órdenes** | Wompi/Resend/AveOnline + saga, stock, cupones, COD, retracto, garantía, quotes, tokens públicos | ~24 archivos leídos completos (incl. tests de integración de webhooks); tabla archivo↔resultado en la fuente. Resumen del auditor: 0 RED, 5 YELLOW, ~30 PASS. |
| **E — XSS, Inyección, SSRF, Redirects, Contenido** | sinks HTML, SQL crudo, fetch, uploads, redirects, emails, markdown, IA | 12 bloques PASS verificados + 2 YELLOW + 1 GREEN; greps exhaustivos documentados (dangerouslySetInnerHTML, $queryRaw*, eval, fetch, image/svg, rehype, safe-redirect, escapeHtml en 20 templates). Verificación dinámica del open redirect con Node. |
| **F — Dependencias, Logging/PII, Tokens, Hashing** | lockfile, audit, logger, error-capture, tokens, recovery codes, referrals | `pnpm audit --prod` (texto+JSON), GitHub Advisory API para 12+ paquetes, web_search de CVEs, greps de PRNG/hashing/logging. Inventario completo en §7. |
| **G — DB como código** | schema.prisma (1.858 líneas), 23/23 migraciones Supabase, 50/50 migraciones Prisma, scripts de seed | 15 migraciones security-relevantes leídas completas; las 50 grepeadas por GRANT/SECURITY DEFINER/DISABLE RLS/datos → negativo. Barrido de secretos sobre 70+ scripts de DB → 1 hallazgo. Matriz código↔DB completa. |
| **V1 — Verificación de código** | 12 hallazgos clave de A–G | Re-lectura de cada archivo citado + ejecución dinámica (open redirect) + contraste GHSA + política documentada. Resultado: 8 CONFIRMADO, 3 CONFIRMADO-con-matiz/PARCIAL, 1 PARCIAL, 0 REFUTADO en lo sustantivo (camino "error" de rate-limit refutado como sub-punto). |
| **V2 — Verificación DB en vivo** | 10 puntos contra prod y stg | SQL ejecutado vía MCP (queries en Anexo B). Resultado: 5 CONFIRMADO, 3 REFUTADO, 1 PARCIAL, 1 confirmado-con-impacto-nulo. |

### Anexo B — Consultas SQL de verificación ejecutadas (V2, en vivo)

```sql
-- B.1 Funciones SECURITY DEFINER ejecutables por anon/authenticated (prod)
SELECT p.proname,
       has_function_privilege('anon', p.oid, 'EXECUTE') AS anon_x,
       has_function_privilege('authenticated', p.oid, 'EXECUTE') AS auth_x,
       p.prosecdef
FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
WHERE n.nspname='public'
  AND p.proname IN ('is_active_admin','rls_auto_enable','rate_limit_check',
                    'enforce_rls_on_new_table','immutable_unaccent')
ORDER BY 1;
-- → is_active_admin y rls_auto_enable: DEFINER + ejecutables por anon; las otras 3 invoker.

-- B.2 Event triggers (prod y stg)
SELECT evtname, evtfoid::regprocedure::text AS func FROM pg_event_trigger;
-- prod: ensure_rls → rls_auto_enable() (activo) + enforce_rls_on_new_table_trg (activo)
-- stg:  solo enforce_rls_on_new_table_trg
SELECT pg_get_functiondef('public.rls_auto_enable()'::regprocedure);
-- SECURITY DEFINER, search_path=pg_catalog, ALTER TABLE … ENABLE ROW LEVEL SECURITY en public.

-- B.3 Policy ProductVariant (prod) — refutación de drift
SELECT polname, polpermissive, polroles::text,
       pg_get_expr(polqual, polrelid) AS qual, pg_get_expr(polwithcheck, polrelid) AS with_check
FROM pg_policy WHERE polrelid='"ProductVariant"'::regclass;
-- → qual coincide exactamente con la migración 00011 (isActive + EXISTS Product activo).

-- B.4 Grants residuales (prod y stg)
SELECT grantee, privilege_type, count(*)
FROM information_schema.role_table_grants
WHERE table_schema='public' AND grantee IN ('anon','authenticated')
GROUP BY 1,2 ORDER BY 1,2;
-- prod: REFERENCES/TRIGGER/TRUNCATE ×59 por rol; stg: 0 filas.

-- B.5 ¿RPC con TRUNCATE? (prod)
SELECT p.proname FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
WHERE n.nspname='public' AND p.prosrc ILIKE '%truncate%';
-- → 0 funciones.

-- B.6 Extensiones y schema (prod y stg)
SELECT e.extname, n.nspname FROM pg_extension e
JOIN pg_namespace n ON n.oid=e.extnamespace
WHERE e.extname IN ('pg_net','pg_trgm','unaccent');
-- prod: pg_net→extensions, pg_trgm/unaccent→public; stg: pg_net→public.

-- B.7 Bucket customer-uploads (prod)
SELECT count(*) FROM pg_policies WHERE schemaname='storage' AND tablename='objects' AND qual ILIKE '%customer-uploads%';       -- 0
SELECT count(*) FROM pg_policies WHERE schemaname='storage' AND tablename='objects' AND with_check ILIKE '%customer-uploads%'; -- 0
SELECT bucket_id, count(*) FROM storage.objects GROUP BY 1;
-- customer-uploads: 402 | design-previews: 53 | product-images: 79 | production-assets: 132
SELECT id, public FROM storage.buckets;  -- customer-uploads: public=false
SELECT policyname, cmd, roles FROM pg_policies WHERE schemaname='storage' AND tablename='objects';
-- → 10 políticas, todas authenticated de administración; ninguna SELECT.

-- B.8 FORCE RLS (prod)
SELECT relname FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
WHERE n.nspname='public' AND c.relkind='r' AND c.relforcerowsecurity=true;
-- → 0 tablas.

-- B.9 auth.users / schemas API (prod, rol postgres vía MCP)
SELECT count(*) FROM auth.users;                                             -- 3 (postgres la ve)
SELECT has_schema_privilege('anon','auth','USAGE'),                          -- true
       has_schema_privilege('authenticated','auth','USAGE'),                 -- true
       has_table_privilege('anon','auth.users','SELECT'),                    -- FALSE
       has_table_privilege('authenticated','auth.users','SELECT');           -- FALSE
SELECT current_setting('pgrst.db_schemas', true);                            -- NULL (no visible por SQL)
```
Además: `get_advisors(security)` en prod y stg (fuentes de V2-6, y corroboración de lints 0011/0028/0029 y `extension_in_public`).

### Anexo C — Nota del incidente 2026-05-09 y estado de sus acciones correctivas

**Incidente:** filtración de una secret key de Supabase (`SUPABASE_SECRET_KEY=sb_secret_REDACTED`) — documentado en `docs/incidents/2026-05-09-secret-key-leak.md:22`. GitHub Push Protection a nivel de cuenta bloqueó un push real con `sb_secret_*` ese día (SECURITY.md:213). La key fue rotada (post-mortem :51).

**Estado de acciones correctivas (verificado en esta auditoría):**

| Acción | Estado verificado |
|---|---|
| Key rotada | ✅ Hecho (post-mortem :51) |
| Sección "Manipulación segura de archivos de credenciales por agentes IA" (sed-only, lista de restringidos, prohibiciones) | ✅ Existe: `docs/SECURITY.md:215-248` |
| IRP-001 con "Vectores conocidos" citando el incidente | ✅ Existe: `SECURITY.md:963` |
| Escáner gitleaks en CI (job `secrets-scan`) | ✅ Existe (ci.yml:342-354), **pero con gaps de formato** — no detecta `sb_secret_*` suelto ni `DATABASE_URL` con password (hallazgo A-2, probado empíricamente) |
| Pre-commit hook con gitleaks | ❌ **Sigue pendiente** — `SECURITY.md:210` lo declara pero no existe (sin `.husky/`, sin `prepare`, `.git/hooks/` solo samples). El pendiente declarado en el post-mortem es coherente con este hallazgo (A-4, punto 5) |
| Allowlist de gitleaks que exime `docs/**` | ⚠️ Sigue abierta — un secreto pegado en cualquier doc pasa el escáner (A-2) |

**Conclusión del anexo:** las acciones correctivas documentadas existen y son reales, pero el control in-repo que prevendría el re-incidente (escáner con los formatos correctos + hook local) está incompleto — es la prioridad #13 de remediación.

---

## 11. Cierre y remediación (2026-08-29)

**Cierre ejecutado sobre `develop`** (base `dbce641`), hallazgo por hallazgo, con la regla de la propia auditoría: cada fix fue **re-validado contra el código vigente antes de tocarse** (los 49 hallazgos seguían vigentes salvo F-1/F-3, ya resueltos en `5a44174` el 2026-08-28). Leyenda: ✅ resuelto en código/repo · 🧾 migración versionada creada (pendiente de aplicar a stg/prod) · 👤 requiere acción humana · 📌 riesgo aceptado/documentado.

**Verificación de la remediación:** `tsc --noEmit` ✓ · `eslint --max-warnings 0` ✓ · prettier ✓ · **suite vitest completa contra stack local: 2957 passed / 0 failed** ✓ · `pnpm audit --prod` (gate CI) exit 0 ✓ · `gitleaks git` (983 commits, config endurecida) 0 leaks ✓ · e2e `admin-login` + `admin-mfa` (Playwright, stack local): 5/5 (1 flaky que pasó en reintento) ✓ · migraciones Supabase 025-029 validadas en cluster PostgreSQL scratch (idempotentes, 2 corridas) ✓ · migraciones Prisma aplicadas al stack local con `migrate deploy` + `migrate diff` sin drift ✓.

### 11.1 RED

| ID | Estado | Resolución |
|---|---|---|
| **B-1** MFA no obligatorio | ✅ | Enrolamiento forzado: `admin-rbac-guard.ts` + layout del panel redirigen a `/admin/seguridad?enroll=required` sin factor verificado; enrolamiento abierto a los 4 roles (`ADMIN_ROLE_SETS.ALL_PLUS_CMS` nuevo) con excepción en la matriz RBAC; acciones admin siguen aal2 (el enrolamiento es client-side, sin hueco chicken-and-egg); e2e actualizados + test nuevo del gate. Código y política (`SECURITY.md:93`) ya coinciden. |

### 11.2 YELLOW (49)

| ID | Estado | Resolución |
|---|---|---|
| A-1 Actions por tag | ✅ | 33 `uses:` pineados por SHA en los 4 workflows (tag como comentario; Dependabot sigue funcionando). Nota: `supabase/setup-cli@v1` es branch, no tag — el SHA lo congela igual. |
| A-2 Gaps gitleaks | ✅ | 3 reglas nuevas (`sb_secret_`, `sb_publishable_`, URI postgres con password) + allowlist `docs/**` eliminada. Verificado empíricamente con gitleaks 8.24.3: detecta los 3 formatos sintéticos; repo completo limpio (983 commits). |
| A-3 Backups sin cifrado | ✅ + 👤 | Pipeline `pg_dump → gzip → gpg AES256` (streaming, passphrase por fd) en `backup-db-to-r2.mjs`; `dr-drill.mjs` descifra (el drill cubre el cifrado); workflows pasan `BACKUP_GPG_PASSPHRASE`. **Manual:** crear el secret en GitHub ANTES del próximo backup diario (fail-closed intencional). |
| A-4 Drift SECURITY.md | ✅ | 6 puntos corregidos (XFO SAMEORIGIN, CSP real sin strict-dynamic, GEMINI en inventario, sin Anthropic en connect-src, CSRF describe el patrón HMAC real, pre-commit) + hook versionado `scripts/git-hooks/pre-commit` (skip elegante sin gitleaks). **Manual:** `git config core.hooksPath scripts/git-hooks` por máquina dev. |
| A-5 Early-returns sin headers | ✅ | Helper `withSecurityHeaders` en los 6 early returns de `proxy.ts` (CSP en el 403; no en 3xx). Matcher de assets sin cambios (costo/beneficio documentado). |
| A-6 /status con errores internos | ✅ | Detalle genérico "sin respuesta"; el error real sigue server-side. |
| B-2 Cookies sb-* sin Secure | ✅ | `cookieOptions.secure` en prod/preview (server client + proxy); trade-off `httpOnly:false` documentado en código y SECURITY.md. |
| B-3 Enumeración en registro | ✅ | Respuesta genérica + email al dueño (`account-exists-notice` nuevo); consistente con login/reset. |
| B-4 OTP rate-limit solo-IP | ✅ | Doble bucket (IP+email, ambos hasheados) en verify y resend. |
| B-5 Recovery codes débiles | ✅ | 16 chars (~79 bits) + HMAC-SHA256 con `CSRF_SECRET` (pepper sin env nueva) + consumo atómico `updateMany` + fallback legacy con TODO de retiro. |
| B-6 edit-mode sin aal2 | ✅ | `requireAdminAction({ roles: CONTENT })` + cookie con `Secure`. |
| B-7 disenos/fichas sin guard | ✅ | `requireRole(MANAGER_UP)` al inicio de ambas páginas. |
| B-8 Idle-timeout evasible | ✅ | Revocación server-side (`signOut scope:global`) al expirar + marca de actividad firmada HMAC (emisión en login y renovación en proxy; marca forjada/ausente ⇒ expira). |
| C-1 vitals sin tope global | ✅ | Backstop global 3000/5min (patrón de error-capture). |
| C-2 settings denylist | ✅ | `PUBLIC_SETTING_KEYS` explícita (30 claves reales); fail-closed para claves futuras. `ALERT_EMAIL`/`PRIVACY_POLICY_VERSION` dejan de ser públicas (sin consumidor público). |
| C-3 SHA exacto en health | ✅ | `version`/`environment` fuera de la respuesta pública (repo público: hasta 7 chars identifican el commit); detalle tras `x-cron-secret` en `/health/all`; rate-limit añadido a `/api/health`. |
| C-4 crons expone topología | ✅ | Pública mínima (`status`+`timestamp`, 503 si degradado); detalle con `x-cron-secret`. **Manual:** monitores externos deben enviar el header si consumían el detalle. |
| C-5 storage filtra error | ✅ | Detalle estático; warn server-side conservado. |
| C-6 `q` sin tope | ✅ | `slice(0,120)` en ambas rutas + dentro de `searchCatalog`/`searchCmsBlocks`. |
| C-7 offset sin tope | ✅ | Clamp ≤ 10.000. |
| C-8 keys solo-IP / IP en claro | ✅ | **Todas** las rutas públicas por `ipKey()` (hasheada) — incl. 8 rutas adicionales encontradas en la remediación (categories, products/[slug], ocasiones ×2, recommend, filters, templates, coupons/public) + back-in-stock/consent/search + log `rate_limit.empty_row`. |
| C-9 cookie edit-mode sembrable | ✅ | `isCmsEditMode()` re-verifica sesión admin real (rol CONTENT) vía `getCurrentAdmin()` con `cache()`; cookie ausente ⇒ cero lookups. |
| C-10 priceMin/Max NaN | ✅ | Guard `toInt` (finito, ≥0). |
| D-1 secreto por query-string | ✅ + 👤 | `okQ` exige `AVEONLINE_ALLOW_QUERY_SECRET=true` (default OFF); warn conservado; `.env.example` + `INTEGRATIONS_AVEONLINE.md §6.2` actualizados; e2e `homolog-webhooks` ahora exige 401 por query. **Manual:** verificar que la URL registrada en el panel AveOnline no lleve `?secret=` (si lo lleva: quitarlo o setear el flag como puente) y rotar `AVEONLINE_WEBHOOK_SECRET` si alguna vez viajó por URL. |
| D-2 Resend last-write-wins | ✅ | Upsert en transacción: bounced/complained no se degrada + eventos viejos ignorados; 7 tests nuevos. |
| D-3 Retracto customerId opcional | ✅ | `customerId` requerido (tipo estricto, estándar de warranty); chequeo incondicional; test IDOR de regresión. |
| D-4 Dedup sin fecha | ✅ | `hasCarrierTimestamp` propagado; externalId `…-no-ts` dedup determinista; test de integración sin fecha. |
| D-5 RESEND secret + bodyHead | ✅ + 👤 | `RESEND_WEBHOOK_SECRET` en `PROD_REQUIRED` (fail-fast; catálogo también envía email); logs wompi/aveonline con `bodyHash` (sha256 truncado) en vez de body crudo; `rawBodyHead` persistido confirmado bajo purga de 180 días. **Manual:** confirmar la var en Vercel Production antes del deploy (sin ella la app no arranca — intencional). |
| E-1 Open redirect | ✅ | `safeNext` local reemplazado por `isSafeInternalPath` (rechaza `\`, `//`, controles) en ambas ramas. |
| E-2 PII a Gemini | ✅ | `sanitizeOccasion()` (documentos, emails, celulares CO → texto neutro) + nota en la UI del Estudio. |
| F-1 nanoid | ✅ (preexistente) | Resuelto en `5a44174` (override 3.3.18, 2026-08-28); audit gate en verde. |
| F-2 GHSA inexistente | ✅ | Comentario corregido (solo GHSA-2v37-7h3g-55p8 / CVE-2026-67213). |
| F-3 deepmerge-ts | ✅ (preexistente) | Resuelto en `5a44174` (override 8.0.2). |
| F-4 sharp | ✅ | Riesgo aceptado se mantiene (mitigación sharp-safe verificada) + regla ESLint `no-restricted-imports` para `sharp` (exentos tests/e2e, que nunca corren en lambdas) para que la única puerta siga siendo `sharp-safe`. |
| F-5 Cadena dev hono/qs | ✅ | Overrides `hono@^4.12.21`, `@hono/node-server@^1.19.15`, `qs@^6.15.2`; `pnpm audit` full ya no los reporta. **Extra detectado:** ~35 advisories dev-only adicionales (vite/undici/jsdom/playwright…) — no rompen el gate `--prod` ni llegan al runtime; triage pendiente aparte. |
| F-6 PII en ErrorLog/Report | ✅ | `scrubPii` exportada del logger y aplicada a message+stack en ambos captures (fingerprint post-scrub); purga a 90 días en `purge-event-logs`. Backlog histórico envejece con la purga (purga manual puntual = opción humana). Nota: flake bajo paralelismo extremo en `error-capture.integration.test.ts` (verde standalone y en re-run); aislamiento de tests mejorable. |
| F-9 Cookie checkout PII | ✅ | AES-256-GCM (clave derivada de `CSRF_SECRET`, IV por escritura; GCM reemplaza el HMAC externo); legacy (TTL 60 min) degrada a "sin sesión"; test anti-PII en la cookie. Ver ADR-085. |
| F-10 Cupones referido 16 bits | ✅ | `REF-` + `randomBytes(6)` base64url (~42 bits), sin segmento derivado del email. `isPublic:false` NO es enforceable en canje (el schema no tiene binding de destinatario) — queda como listing-only verificado (nunca salen en `/api/coupons/public`); el control real es entropía + rate-limit + `maxUses:1` + trigger G-5. |
| F-11 Tokens bearer en claro | ✅ + 👤 | Hash-en-reposo SHA-256 para los 4 tokens (helper `lib/token-hash.ts`); migración con backfill pgcrypto + `DROP COLUMN`; lecturas por hash; rotación en re-usos. Cambios de comportamiento: correos post-pago sin link one-click → fallback `/rastrear` (corregido en plantillas); `/rastrear` rota el token al usarse; links de diseño compartido rotan al pedirlos. **Manual:** aplicar la migración EN EL MISMO deploy del código. Ver ADR-085. |
| G-1 `rls_auto_enable` huérfana | ✅ | `supabase/migrations/00000000000025_drop_orphan_rls_auto_enable.sql` (DROP IF EXISTS trigger+función). **Aplicada y verificada en stg y prod (2026-08-29)**: `ensure_rls`/`rls_auto_enable` ya no existen en prod. |
| G-2 Grants prod↔código | ✅ | `…00026_harden_table_grants.sql`: revoca REFERENCES/TRIGGER/TRUNCATE a anon/authenticated + DML a service_role + default privileges. **Aplicada y verificada en stg y prod**: anon/authenticated con 0 grants en prod, service_role solo REFERENCES/TRIGGER/TRUNCATE (postura endurecida ahora versionada); sin WARNING de grantor ajeno. |
| G-4 Políticas backstop | ✅ | `…00028_harden_rls_backstop_policies.sql`: `review insert own` fuerza `isApproved=false`/`featured=false`; triggers anti-escalada de columnas sensibles en Customer (loyalty/referral) y CartItem (unitPrice) para rol `authenticated`; policies Cart/CartItem separadas por verbo. **Aplicada y verificada en stg y prod** (expresiones de política y triggers confirmados en vivo). |
| G-5 Carrera maxUsesPerCustomer | ✅ | Trigger `BEFORE INSERT` con `pg_advisory_xact_lock` (el índice único parcial no aplicaba: `maxUsesPerCustomer > 1` es creable por admin) + P2002 → "cupón ya usado"; en la saga PAID la orden cobrada queda `needsReconciliation`. Test de carrera real: 2 inserts concurrentes → 1 gana. |
| G-6 Password default en seed | ✅ | `PASSWORD` obligatorio (sin default en repo ni stdout) + guarda anti-prod (`env-guard` + ref de PRD en SUPABASE_URL). |
| G-7 Reseñas ficticias en prod | ✅ | **Verificado en vivo (2026-08-29): prod tiene 0 reseñas** — la depuración `0229a07` ya las había retirado. Decisión del usuario: no republicar ficticias. Los 2 scripts (`seed-reviews-curated.mjs`, `seed-reviews-circle.mjs`) quedaron bloqueados contra PRD y remotos desconocidos vía `env-guard` (probado). |
| G-8 search_path/EXECUTE | ✅ | `…00027_harden_public_functions.sql`: `SET search_path` en las 4 funciones, `is_active_admin` recreada (search_path `''`, nombres calificados), REVOKE EXECUTE a anon/PUBLIC, `enforce_rls_on_new_table` con `format('%I.%I')` (corregido un bug del SQL literal del informe: `%I` sobre `object_identity` ya calificado rompería todo `CREATE TABLE` futuro con mayúsculas — reproducido y corregido en validación). **Aplicada y verificada en stg y prod**: `is_active_admin` anon=f/auth=t, `rate_limit_check` solo owner (la app la llama como postgres — sanity check en vivo OK). |
| G-9 PII sin cifrado columna | 📌 | Riesgo aceptado documentado (ADR-085): candidato a cifrado de columna/vault antes de DIAN masivo (Fase 7), no bloqueante hoy. |
| V2-6 Leaked password protection | 👤 | Config de GoTrue (no alcanzable desde el repo): activar en Dashboard → Authentication → Password Security en prod y stg. El HIBP propio de la app ya cubre los flujos propios. |
| V2-7 pg_net en public (stg) | ✅ | `…00029_move_pg_net_to_extensions.sql`. **Aplicada**: stg convergió a `extensions` (2026-08-29 — pg_net no soporta `SET SCHEMA`: se movió con DROP+CREATE transaccional, funciones `net.*` recreadas y verificadas); en prod es no-op (ya estaba en `extensions`). |

### 11.3 GREEN (9)

| ID | Estado |
|---|---|
| A-7 credenciales demo | 📌 Cerrado (controlado, guard anti-misconfig verificado). |
| B-9 `is_active_admin` ejecutable por anon | 🧾 Endurecida en la migración 027 (REVOKE + search_path `''`). |
| B-10 Login sin Turnstile | 📌 No implementado (riesgo bajo; rate-limits dobles estrictos). Queda como mejora futura: Turnstile tras 3er fallo por bucket. |
| E-3 Campo CMS HTML latente | ✅ Constancia escrita en `features/cms/schemas.ts` (no renderizar HTML sin sanitización server-side). |
| F-O1 / F-O2 | 📌 Sin acción (informativos, impacto acotado). |
| V2-5 TRUNCATE inalcanzable | 🧾 Los grants residuales se revocan con la migración 026. |
| V2-8 customer-uploads deny implícita | 📌 Fragilidad documentada; la migración 028 mantiene el patrón de políticas explícitas. Recomendación viva: test de regresión RLS antes de cualquier política futura sobre ese bucket. |
| V2-9 FORCE RLS ausente | 📌 Informativo (impacto nulo en esta arquitectura). |

### 11.4 Hallazgos ADICIONALES encontrados durante la remediación (y su estado)

1. **8 rutas públicas más con IP en claro** en la key de rate-limit (catalog categories/filters/recommend/templates/ocasiones×2/product detail, coupons/public) → corregidas con `ipKey()` (misma pasada que C-8).
2. **Regresión introducida por F-11 detectada y corregida en la misma remediación:** las plantillas de email post-pago caían a `/mi-cuenta/pedidos` (muro de auth) para invitados al dejar de leer el token en claro → fallback cambiado a `/rastrear` (sirve para invitados y registrados) en confirmation/shipped/delivered/design-rejected/review-request + tests.
3. **Marca de actividad admin sellada sin firmar en el login** (cruce B-8): `app/admin/login/actions.ts` ahora emite la marca con `sealAdminActivityMark` — sin esto, todo login admin rebotaba a `?expired=1` (detectado por e2e).
4. **e2e `homolog-webhooks.spec.ts` desactualizado** por D-1 (esperaba 200 por query) → ahora exige 401.
5. **~35 advisories dev-only adicionales** en `pnpm audit` full (undici, vite, brace-expansion, js-yaml, etc. vía vitest/jsdom/playwright/shadcn) → no rompen el gate `--prod` ni llegan al runtime; **triage pendiente** como mejora de higiene.
6. **Bug en el SQL literal del informe (G-8):** `format('%I', object_identity)` habría roto los `CREATE TABLE` futuros (doble calificado); la migración 027 usa `%I.%I` con schema/relname resueltos por `pg_class` (reproducido en validación).
7. **`supabase/setup-cli@v1` es un branch**, no un tag (A-1) — el pin por SHA lo congela, pero Dependabot podría no bump-earlo; vigilar.
8. **Drift doc secundario corregido:** `OBSERVABILITY.md` (shape público de /api/health + monitores con `x-cron-secret`), `OPERATIONS.md` (nota crons), `INTEGRATIONS_AVEONLINE.md §6.2` (vía query deshabilitada), `SECURITY.md` (MFA enforceado, recovery codes, trade-off httpOnly).
9. **Este propio informe** contenía el string sintético de prueba de A-2 → anotado con `gitleaks:allow` inline para que el `secrets-scan` de CI no lo marque al commitearse (verificado con gitleaks 8.24.3).

### 11.5 Acciones manuales pendientes (fuera del repo)

1. **GitHub:** crear secret `BACKUP_GPG_PASSPHRASE` antes del próximo backup diario (07:13 UTC) — fail-closed intencional (A-3).
2. **Vercel Production:** confirmar `RESEND_WEBHOOK_SECRET` antes de deployar (ahora fail-fast, D-5); `AVEONLINE_ALLOW_QUERY_SECRET` NO hace falta si el panel no usa `?secret=` (verificar en `guias.aveonline.co/panel/mis-integraciones`, D-1); rotar `AVEONLINE_WEBHOOK_SECRET` si alguna vez viajó por URL.
3. **Supabase prod+stg:** ✅ migraciones `supabase/migrations/00000000000025`-`00000000000029` **ya aplicadas y verificadas en vivo en ambos ambientes (2026-08-29)**. Pendiente: las migraciones Prisma `20260829150200_bearer_tokens_hash_at_rest` + `20260829150300_coupon_usage_per_customer_trigger` se aplican con `db:migrate:deploy` **en el mismo deploy del código** (hay `DROP COLUMN` — código viejo contra DB migrada revienta).
4. **Supabase Dashboard (prod y stg):** activar Leaked Password Protection (V2-6).
5. **Monitores de uptime:** enviar `x-cron-secret: $CRON_SECRET` si consumen detalle de `/api/health/crons` o `/api/health/all` (C-3/C-4).
6. **Máquinas dev:** `git config core.hooksPath scripts/git-hooks` para activar el pre-commit de gitleaks (A-4).
7. **Admins existentes:** regenerar recovery codes (los legacy SHA-256 dejan de funcionar cuando se retire el fallback — TODO en `recovery-codes.ts`) (B-5).
8. ~~**G-7:** decidir el destino de las reseñas ficticias en prod.~~ **Resuelto (2026-08-29):** prod verificado sin reseñas; scripts bloqueados contra PRD.
9. **Prueba pendiente de §2.5:** sigue pendiente — la publishable key del backup local está rotada (401) y la actual no está embebida en los chunks estáticos del sitio; requiere la key actual de Vercel: `curl https://zxkucphbsfygakgxcnik.supabase.co/rest/v1/ -H "apikey: $NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"`.

---

*Informe generado con metodología `secure-code-review` (OWASP Top 10 2021). Toda afirmación está respaldada por evidencia `archivo:línea`, salida de herramienta o SQL en vivo citados en el cuerpo del informe. Regla 0-suposiciones aplicada: 12 planteamientos refutados/ajustados en verificación se reportan transparentemente en §8. Remediación y cierre: §11 (2026-08-29).*
