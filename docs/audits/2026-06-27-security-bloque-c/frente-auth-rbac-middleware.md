I have confirmed everything. MFA is entirely absent. Let me write the Frente 1 report.

# Frente 1 — Auth / RBAC / MFA

Auditoría contra `docs/SECURITY.md` §§ Autenticación / Autorización (RBAC+RLS) / MFA / STRIDE, verificada contra el código real.

## Resumen ejecutivo

El gate de `/admin/*` **sí existe** y es formal (en `proxy.ts`, no checks dispersos), con doble verificación en el layout `(panel)` y triple en cada server action — la defensa en profundidad de autenticación es sólida. **Pero hay dos brechas graves:**

1. **RBAC no se enforce salvo en `/admin/usuarios`.** Los roles `MANAGER` y `FULFILLMENT` existen en el enum y se muestran como etiquetas, pero **funcionalmente cualquier admin activo puede todo** (finanzas, pedidos, productos, clientes, cupones). El modelo de roles de `SECURITY.md` §113-118 es decorativo. → **P0** (mandato #12: "rol permitido para la ruta").
2. **MFA admin no existe en absoluto** — cero código TOTP/enroll/aal2. `SECURITY.md` §94 lo marca "**obligatorio** desde Fase 6". → **P0** según la spec, pero **NECESITA-LUCY** (enrolamiento es acción humana + decisión de UX).

## Tabla de controles

| # | Control (SECURITY.md) | Estado | Evidencia (file:line) | Fix | Esf | Autónomo? / Sev |
|---|---|---|---|---|---|---|
| 1.1 | Gate formal `/admin/*` sin sesión | ✅ | `apps/web/proxy.ts:207-211` — bloquea path admin (excepto `/admin/login`) si `!user`, redirige a login. Matcher cubre admin (`proxy.ts:228-232`). | — | — | OK |
| 1.2 | Verificación de fila `AdminUser` activa (no solo sesión Supabase) | ✅ | Layout: `app/admin/(panel)/layout.tsx:18-19` (`getCurrentAdmin()` → redirect si null). Helper: `lib/auth.ts:63-76` valida `isActive:true, deletedAt:null`. Defensa-en-profundidad correcta: proxy solo verifica sesión (no corre Prisma), layout+actions verifican AdminUser. | — | — | OK |
| 1.3 | Anti-enumeration en login | ✅ | `app/admin/login/actions.ts:108-119` — si auth OK pero no es admin: `signOut()` + mismo error genérico "Credenciales incorrectas". | — | — | OK |
| 1.4 | No hay rutas admin sin proteger | ✅ | Todas las páginas viven bajo `app/admin/(panel)/` → cubiertas por proxy + layout. No existe `/api/admin/*` que mute (survey de `app/api`: solo health/catalog/cms/webhooks/coupons públicos). | — | — | OK |
| 1.5 | Defense-in-depth en server actions (cada action verifica admin) | ✅ | 11/12 `actions.ts` llaman `getCurrentAdmin()`; el único sin él es `login/actions.ts` (correcto, es pre-auth). Ej. `productos/actions.ts:100-102`, `contenido/actions.ts:48-49`. | — | — | OK |
| 1.6 | **RBAC: rol enforced por ruta/acción** | 🟡 | Solo `usuarios` lo enforce: `usuarios/actions.ts:18-25,38-40` (`ensureSuperadmin`) y `usuarios/page.tsx:72`. **Ningún otro área gatea por rol** (grep sobre `app/admin` excl. usuarios = vacío). `finanzas`, `pedidos`, `productos`, `clientes`, `cupones`, `inventario` → cualquier rol activo opera. Contradice `SECURITY.md:117-118` (MANAGER sin finanzas; FULFILLMENT solo pedidos). | Crear `lib/admin-rbac.ts` con `requireRole(session, [...roles])` + matriz ruta→roles; aplicar en layout/page de cada área + en cada action sensible (finanzas, promo de roles ya ok). Filtrar también `admin-nav.ts` por rol (hoy sin filtrado, `lib/admin-nav.ts`). | M | **Autónomo** (matriz derivable de SECURITY.md §113-118) / **P0** |
| 1.7 | Mass-assignment de `role` bloqueado en payloads cliente | ✅ | `role` solo se setea desde `usuarios/actions.ts` (gated SUPERADMIN) vía `features/admin-users/service.ts`. No hay `role` en schemas Zod de cliente. Cumple `SECURITY.md:841`. | — | — | OK |
| 1.8 | Protección anti-auto-lockout / último SUPERADMIN | ✅ | `features/admin-users/service.ts:134,173` — impide degradar/desactivar al último SUPERADMIN activo. | — | — | OK |
| 1.9 | **MFA admin (TOTP) obligatorio** | ❌ | Cero código: grep `totp|mfa|enroll|aal2|listFactors|authenticator` = sin resultados en `app/lib/features`. Login no verifica `aal2` (`login/actions.ts` sin chequeo de factor). Contradice `SECURITY.md:94` ("obligatorio desde Fase 6") y STRIDE §823,836. | Supabase Auth TOTP: (a) UI enroll en `/admin/seguridad` (`mfa.enroll` → QR → `mfa.challengeAndVerify`); (b) tras login, si admin tiene factor verificado exigir `getAuthenticatorAssuranceLevel()===aal2` antes de servir panel (gate en layout `(panel)` + proxy si posible); (c) recovery codes (Supabase no los da nativo → tabla `AdminRecoveryCode` con hashes, o documentar reset vía SUPERADMIN). | L | **NECESITA-LUCY** (enrolar su TOTP es acción humana; decidir si bloqueante para todos los roles desde día 1) / **P0** (por spec) |
| 1.10 | Sesión: signOut server-side global | 🟡 | `signOut()` existe: logout cliente `app/auth/logout/actions.ts:23` (sin scope → solo sesión actual). Global solo en cambio de password `restablecer-password/actions.ts:156` (`scope:"global"`). **No hay logout admin dedicado** ni "cerrar sesión en todos los dispositivos" para admin. | Añadir logout admin que use `signOut({scope:"global"})` para sesiones privilegiadas; loggear `security.admin_login`/logout (login ya loggea, logout no — `SECURITY.md:651`). | S | **Autónomo** / **P1** |
| 1.11 | Inactividad admin 30 min idle | ❌ | `SECURITY.md:59,552` exige expiración tras 30 min idle ("Middleware revalida"). No hay enforcement: grep `idle/inactiv/1800/lastActivity` = sin matches reales. Solo aplica el TTL de access token Supabase (1 h) + refresh 30 días — mucho más laxo que lo prometido. | En `proxy.ts` para paths admin: leer cookie `admin_last_activity`, si `now - last > 30min` → `signOut` + redirect login; refrescar timestamp en cada request admin. (Alternativa: configurar "time-box" de sesión en panel Supabase, pero no cubre idle.) | M | **Autónomo** / **P1** |
| 1.12 | Cookies HttpOnly + Secure + SameSite=Lax | 🟡 [pendiente verificación] | No se setean explícitamente: `lib/supabase/server.ts:38-49` y `proxy.ts:183-191` pasan `options` tal cual los emite `@supabase/ssr`. Los defaults de `@supabase/ssr` son HttpOnly + SameSite=Lax + Secure (en HTTPS), pero **no está afirmado/forzado en código** ni testeado. | Verificar en runtime (DevTools → Application → Cookies en deploy) que `sb-*-auth-token` sale `HttpOnly; Secure; SameSite=Lax`. Si se quiere garantía, override `options` en el `setAll`. | S | **Autónomo** (verificación) / **P1** |
| 1.13 | Logging de eventos auth admin | 🟡 | Login loggea bien: `login/actions.ts:72,90,112,121` (`security.admin_login.*`). **Falta logout** (`SECURITY.md:651` "Login/logout del admin") y eventos de enroll/disable MFA (no existen). | Loggear `security.admin_logout` en el logout admin; eventos MFA cuando se implemente 1.9. | S | **Autónomo** / **P2** |

## Notas y matices

- **El comentario del proxy está desactualizado/contradictorio**: `proxy.ts:18-22` dice "Auth gate `/admin/*` — pendiente cuando exista la sección admin" y "CSRF — pendiente", pero **el gate sí está implementado** más abajo (`:200-211`). Limpiar el header doc para no inducir a error (P2, autónomo). Igual `SECURITY.md:121` apunta a `app/middleware.ts` cuando el archivo real es `proxy.ts` (Next 16 rename, ADR-024) — actualizar la referencia.
- **`getCurrentAdmin` no expone el rol con AAL**: `lib/auth.ts:63-76` devuelve `admin.role` pero sin nivel de garantía MFA. Cuando se implemente 1.9, el gate de aal2 conviene centralizarlo aquí o en el nuevo `requireRole`.
- **RLS de `AdminUser`/`AdminActionLog`** (relacionado con RBAC) es Frente RLS, no lo evalúo aquí salvo para notar que el patrón de `SECURITY.md:144-147` (subquery a `AdminUser` activo) es la base sobre la que debe apoyarse el enforcement de rol a nivel DB — el rol fino (MANAGER vs FULFILLMENT) **no** está en esas policies de ejemplo, así que el gating de rol es hoy puramente aplicativo.

## Veredicto del frente

- **Autenticación de `/admin/*`: ✅ certificable** (gate formal + defense-in-depth + anti-enumeration).
- **Bloqueantes de launch (P0):** (1.6) enforcement de RBAC por rol — autónomo, M; (1.9) MFA admin — necesita-Lucy, L. Si el negocio acepta diferir MFA, debe documentarse como ADR que sobrescribe `SECURITY.md:94` (mandato: señalar conflicto antes de actuar).
- **P1 a cerrar antes de launch:** idle-timeout 30 min (1.11), logout admin global (1.10), verificación de flags de cookie (1.12).

Archivos clave: `apps/web/proxy.ts`, `apps/web/lib/auth.ts`, `apps/web/app/admin/(panel)/layout.tsx`, `apps/web/app/admin/login/actions.ts`, `apps/web/app/admin/(panel)/usuarios/actions.ts`, `apps/web/features/admin-users/service.ts`, `apps/web/lib/admin-nav.ts`, `apps/web/lib/supabase/server.ts`, `apps/web/app/auth/logout/actions.ts`.