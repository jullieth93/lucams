# Seguridad — Lucams_shop

> **Fuente única de seguridad.** Todo `.md` que toca un tema de seguridad referencia este documento (no duplica). Mandatos derivados de `CLAUDE.md` #12 ("seguridad por defecto") y #9 ("argumentación obligatoria").

## Tabla de contenido

1. [Modelo de amenazas resumido](#modelo-de-amenazas-resumido)
2. [Autenticación (Supabase Auth)](#autenticación-supabase-auth)
3. [Autorización (RBAC + RLS)](#autorización-rbac--rls)
4. [Manejo de secretos y API keys](#manejo-de-secretos-y-api-keys)
5. [Headers HTTP de seguridad](#headers-http-de-seguridad)
6. [CORS](#cors)
7. [CSRF](#csrf)
8. [Rate limiting](#rate-limiting)
9. [Validación de input](#validación-de-input)
10. [Output encoding / XSS](#output-encoding--xss)
11. [TTLs y caducidad de recursos](#ttls-y-caducidad-de-recursos)
12. [File upload y Storage](#file-upload-y-storage)
13. [Webhooks (Wompi, Aveonline, Resend)](#webhooks-wompi-aveonline-resend)
14. [Audit logs](#audit-logs)
15. [Logging](#logging)
16. [PII y Habeas Data (Ley 1581)](#pii-y-habeas-data-ley-1581)
17. [Dependency scanning y supply chain](#dependency-scanning-y-supply-chain)
18. [CI/CD security](#cicd-security)
19. [Observabilidad de seguridad](#observabilidad-de-seguridad)
20. [Política de divulgación de vulnerabilidades](#política-de-divulgación-de-vulnerabilidades)

---

## Modelo de amenazas resumido

| Actor                 | Vector                                       | Mitigación principal                                                                                                               |
| --------------------- | -------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| Bot scraper           | Scraping de catálogo, abuso del asistente IA | Rate limit + cache + Turnstile en formularios                                                                                      |
| Atacante con cuenta   | Acceso a datos de otros usuarios             | RLS + tests automatizados                                                                                                          |
| Atacante sin cuenta   | SQL injection, XSS, CSRF                     | Prisma + React + SameSite cookies + CSP                                                                                            |
| Insider (empleado)    | Abuso del admin                              | RBAC + audit log + 2FA                                                                                                             |
| Suplantador           | Webhook falso de Wompi/Aveonline             | Verificación de firma/credencial + idempotencia                                                                                    |
| Compromiso de secreto | Secret key (`sb_secret_*`) expuesta          | Rotación inmediata (Supabase permite múltiples secret keys, revocar la comprometida sin downtime) + nunca al cliente + .gitignored |
| Subida maliciosa      | Archivo con malware en storage               | Allowlist MIME + tamaño máximo + nombre aleatorio + render server                                                                  |
| Pago fraudulento      | Stolen card en checkout                      | Wompi 3DS + Turnstile + límites Wompi                                                                                              |

---

## Autenticación (Supabase Auth)

### Stack

- **Proveedor:** Supabase Auth (mandato #3).
- **Métodos en lanzamiento:** email + password con confirmación por **OTP de 6 dígitos** (reemplaza el magic-link de Supabase Auth — inmune al prefetch de Gmail que consume tokens de links).
- **Después del lanzamiento (Fase 7+):** evaluar Google OAuth como tercer método.

### Cookies y sesiones

- **Cookies `sb-*` de sesión (Supabase SSR): `SameSite=Lax` + `Secure` en prod/preview** (`cookieOptions.secure` en `lib/supabase/server.ts` y `proxy.ts`, auditoría 2026-08-24 B-2 — sin él, la cookie viajaría por HTTP plano en el primer contacto pre-HSTS).
- **Trade-off documentado — `httpOnly: false` en las `sb-*`:** el browser client lee la sesión desde `document.cookie` (reto MFA, `lib/supabase/browser.ts`), así que no pueden ser HttpOnly con `@supabase/ssr`. La exposición a XSS la mitiga la CSP por nonce, no httpOnly. Las cookies propias sensibles SÍ son HttpOnly (`cart_session`, `checkout_state`, `admin_last_activity`, `lucams_cms_edit`).
- **TTL de access token:** 1 hora (default Supabase, no extender).
- **TTL de refresh token:** 30 días con rotación en cada uso.
- **Logout server-side** invalida la sesión en Supabase, no solo borra la cookie.
- **Inactividad:** sesión de admin expira tras 30 min sin actividad (`lib/admin-activity.ts`). Al expirar el proxy **revoca la sesión server-side** (`signOut({ scope: "global" })`, no solo borra cookies — B-8) y redirige a `/admin/login?expired=1`. La marca de actividad (`admin_last_activity`) va **firmada HMAC-SHA256 con `CSRF_SECRET`** (`<ts>.<hmac>`): la sella la acción de login y la renueva el proxy en cada request admin (ventana deslizante); marca ausente o con firma inválida ⇒ se trata como expirada (cierra el hueco de borrar/forjar la cookie).

### Política de contraseñas

**Implementado actualmente (commit `68da751` y siguientes, 2026-05-11):**

- **Mínimo 8 caracteres** (Zod en server actions). Supabase config también lo refuerza server-side.
- **Strength meter informativo** custom (5 niveles: muy débil / débil / razonable / fuerte / muy fuerte). Cálculo en `lib/password-strength.ts` — pondera longitud + clases de caracteres + penaliza secuencias comunes (`123`, `qwerty`) y términos locales (`lucams`, `password`). NO bloquea, solo informa.
- **Pwned Passwords (HaveIBeenPwned)** vía `lib/pwned-passwords.ts`. Usa k-anonymity (SHA-1 prefijo de 5 chars → API gratis sin envío de password). Bloquea registro/cambio de password si está en breaches conocidos. Fail-open si HIBP cae.
- **Rate-limit doble por IP + por email** (`lib/rate-limit-keys.ts`):
  - Signup: 10 IP/h + 10 email/h (prod).
  - Login: 15 IP/15min + 15 email/15min.
  - Reset-password: 10 IP/h + 10 email/h.
  - Verify-recovery (OTP entry): 10 IP/15min + 10 email/15min.
  - Durante pre-launch (commit `8b640ee` ajuste, 2026-05-11): bucket de email == bucket de IP. La defensa-en-profundidad existe solo cuando atacante distribuye sobre varias IPs (caso real de credential stuffing). Para single-source (1 IP, 1 email), el bucket más estricto pega — pero al ser iguales, prácticamente lo limita IP. **Al lanzar productivo con tráfico real**, bajar email a más estricto que IP (signup 3/h, reset 3/h) para detener botnets.
  - El email se hashea con SHA-256 truncado a 16 chars antes de usar como key — no aparece en claro en `rate_limit_buckets`. **La IP se hashea igual** (`hashIp()`, auditoría 2026-08-24 C-8: la IP es dato personal — Ley 1581): **todas** las rutas públicas y acciones usan `ipKey()`/`emailKey()` de `lib/rate-limit-keys.ts`, así que ninguna key de rate-limit lleva IP ni email en claro.
- **Recuperación con OTP de 6-10 dígitos** (no link). Inmune a Gmail prefetch que consume tokens de links.
- **Confirmar contraseña** obligatorio en signup y reset (campos duplicados con `.refine()` Zod + validación inline en client).
- **signOut global tras cambiar password** (`scope: 'global'`). Invalida TODAS las sesiones del user en otros devices/browsers — si alguien tenía sesión activa con la contraseña vieja, queda fuera al cambio.
- **Account enumeration mitigation:** mensajes genéricos ("Si esa cuenta existe, te enviamos email...") en flows donde aplica.

**Decisión deliberada — NO implementado:**

- **No-reuso de últimas N contraseñas.** Costo operacional alto (tabla `PasswordHistory` paralela + bcrypt.compare por entrada). Beneficio marginal vs Pwned Passwords (que ya cubre el principal vector). Re-evaluar si compliance lo exige (banking, no es nuestro caso).

**Eventos de seguridad loggeados (event prefix `security.*`):**

- `security.login.success` / `security.login.fail`
- `security.pwned.signup_block` / `security.pwned.reset_block`
- `security.password.reset_success` (con flag `globalSignOut`)
- `security.pwned.api_fail` / `security.pwned.fetch_error` (HIBP caído)
- Rate-limit hits ya van como `auth.*.rate_limited` (con `ipCount` + `emailCount`).

### MFA

- **Para TODOS los roles admin (`SUPERADMIN`/`MANAGER`/`FULFILLMENT`/`CMS_EDITOR`): obligatorio y ENFORCEADO por código** (auditoría 2026-08-24, hallazgo B-1 — antes era opt-in y contradecía esta política). El guard central (`lib/admin-rbac-guard.ts`) y el layout del panel redirigen a `/admin/seguridad?enroll=required` a cualquier admin sin factor TOTP verificado; el enrolamiento está abierto a todos los roles admin; las acciones admin siguen exigiendo aal2. Supabase Auth soporta TOTP.
- **Para clientes: no implementada aún.** Supabase Auth soporta TOTP; el flujo existe solo para admin (`/admin/seguridad`, `/admin/login/mfa`). Ofrecerla a clientes queda como mejora futura.
- **Recovery codes admin** (B-5, 2026-08-29): 16 chars (~79 bits), HMAC-SHA256 con `CSRF_SECRET` como pepper (nunca SHA-256 plano), consumo atómico (`updateMany` condicional — un solo uso real). Fallback de lectura para códigos legacy SHA-256 hasta su rotación (TODO en `features/admin-mfa/recovery-codes.ts`).

### Verificación de email

- Registro requiere confirmación por email antes del primer login: **OTP de 6 dígitos** enviado al correo (configurado en el email template de Supabase), que el usuario tipea en `/confirmar-codigo`. No hay link de confirmación (ver § Stack arriba).

### Pendiente de verificación (mandato #9)

- [ ] Configuración exacta de TTL de access/refresh tokens en panel Supabase Free → `supabase.com/docs/guides/auth/sessions`.
- [ ] Política de contraseñas configurable en plan Free → `supabase.com/docs/guides/auth/password-security`.

---

## Autorización (RBAC + RLS)

### RBAC — modelo de roles

| Rol                           | Aplica a             | Permisos                                                      |
| ----------------------------- | -------------------- | ------------------------------------------------------------- |
| `customer` (default Supabase) | Clientes finales     | Leer/escribir sus propias órdenes, dirección, reseñas         |
| `SUPERADMIN`                  | Operador del negocio | Todo el `/admin/*`                                            |
| `MANAGER`                     | Empleado de tienda   | Productos, inventario, órdenes, reseñas                       |
| `FULFILLMENT`                 | Operador logístico   | Órdenes (cambio de estado, descarga PNG producción)           |
| `CMS_EDITOR`                  | Editor de contenido  | CMS (páginas, bloques, redirects); home en `/admin/contenido` |

- Tabla `AdminUser` con `role` y `isActive`.
- El proxy (`apps/web/proxy.ts` — Next.js 16 renombró `middleware.ts` → `proxy.ts`) solo hace de gate anónimo: redirige a `/admin/login` toda request `/admin/*` sin sesión Supabase. **No corre Prisma ahí.**
- La verificación real de `AdminUser` activo + rol la hace el servidor en cada página/acción: `getCurrentAdmin()` (`lib/auth.ts`) en las pages y `requireAdminAction({ roles })` (`lib/admin-rbac-guard.ts`) al inicio de toda Server Action admin mutante — incluye el gate de MFA (enrolamiento obligatorio + aal2, ver § MFA).
- **Defense in depth:** cada Server Action/API route verifica el rol explícitamente (no confiar solo en el gate del proxy).

### Row-Level Security (Supabase / Postgres RLS)

> **Mandato #12:** toda tabla accesible desde el cliente público (vía publishable key, que mapea al rol Postgres `anon`) debe tener RLS habilitada. Sin excepciones.

Políticas detalladas en [`ARCHITECTURE.md` § Row-Level Security](./ARCHITECTURE.md#row-level-security-supabase). Patrones:

```sql
-- Ejemplo: Customer solo lee su propio registro
CREATE POLICY "customer_read_own" ON public."Customer"
  FOR SELECT USING (auth.uid()::text = "supabaseUserId");

CREATE POLICY "customer_update_own" ON public."Customer"
  FOR UPDATE USING (auth.uid()::text = "supabaseUserId");

-- Ejemplo: Order solo accesible por el cliente dueño O por admin
CREATE POLICY "order_read_own_or_admin" ON public."Order"
  FOR SELECT USING (
    "customerId" IN (
      SELECT id FROM public."Customer" WHERE "supabaseUserId" = auth.uid()::text
    )
    OR EXISTS (
      SELECT 1 FROM public."AdminUser"
      WHERE "supabaseUserId" = auth.uid()::text AND "isActive" = TRUE
    )
  );
```

**Postura verificada en vivo (auditoría 2026-08-24, re-verificada tras la remediación del 2026-08-29):**

- **59/59 tablas de `public` con RLS habilitado** en prod y stg. 14 políticas activas sobre 13 tablas; el resto es deny-by-default (RLS sin políticas). Un event trigger (`enforce_rls_on_new_table_trg`, migración 014) auto-habilita RLS en tablas nuevas, y las migraciones llevan verificación inline (`RAISE EXCEPTION` si queda alguna sin RLS).
- **0 grants de tabla para `anon`/`authenticated`** en prod (migración 026: revoca incluso REFERENCES/TRIGGER/TRUNCATE residuales + default privileges). La publishable key no puede leer ni una tabla pública — verificado en vivo: `/rest/v1/` y un `SELECT` directo devuelven 401/42501.
- **`service_role` sin DML** sobre tablas de `public` (migración 026): solo REFERENCES/TRIGGER/TRUNCATE. La app opera con Prisma como rol `postgres`, no vía PostgREST con service_role.
- Funciones de `public` endurecidas (migración 027): `search_path` fijado, `is_active_admin` sin EXECUTE para anon/PUBLIC, `rate_limit_check` solo owner.
- Backstops anti-escalada (migración 028): `review insert own` fuerza `isApproved=false`/`featured=false`; triggers bloquean que `authenticated` modifique columnas sensibles de `Customer` (loyalty/referral) y `CartItem` (`unitPrice`).
- Migraciones 025-029 aplicadas y verificadas en stg y prod el 2026-08-29 (detalle: [`audits/auditoria_seguridad_lucams.md` §11](./audits/auditoria_seguridad_lucams.md)).

### Tests de RLS (criterio de aceptación de Fase 1)

Implementados como tests de integración vitest contra el stack local (`make test-rls`):

- `apps/web/features/security/rls-coverage.integration.test.ts` — **gate por-PR en CI:** aserta que TODA tabla de `public` tiene RLS habilitado.
- `apps/web/features/security/rls-matrix.integration.test.ts` — comportamiento de las policies (nightly; se salta limpio sin Supabase real). Patrón:

```ts
// features/security/rls-matrix.integration.test.ts (esquema ilustrativo)
import { createClient } from '@supabase/supabase-js';

describe('RLS', () => {
  it('customer A cannot see customer B orders', async () => {
    const sbA = createClient(URL, PUBLISHABLE_KEY, { auth: { ... session A ... } });
    const { data, error } = await sbA.from('Order').select('*').eq('customerId', 'CUSTOMER_B');
    expect(data).toEqual([]);
    expect(error).toBeNull(); // RLS no devuelve error, devuelve vacío
  });

  it('non-admin cannot read AdminActionLog', async () => {
    const sbCustomer = createClient(URL, PUBLISHABLE_KEY, { auth: { ... customer session ... } });
    const { data } = await sbCustomer.from('AdminActionLog').select('*');
    expect(data).toEqual([]);
  });
});
```

---

## Manejo de secretos y API keys

### Reglas de oro

1. **Las API keys nunca viven en el front-end.** Las únicas vars expuestas al navegador son las que empiezan con `NEXT_PUBLIC_*` y deben ser **diseñadas para ser públicas** (publishable key de Supabase, public key de Wompi, site key de Turnstile).
2. **Las llaves "públicas" se protegen con reglas de dominio:**
   - **Supabase publishable key (`sb_publishable_*`):** mapea al rol Postgres `anon`; sus permisos están limitados por RLS. Aunque sea visible, sin RLS rota no puede leer datos privados. Reemplaza la legacy `anon` JWT key (deprecada para proyectos creados después del 2025-11-01).
   - **Wompi public key:** Wompi valida que las transacciones se generen desde dominios autorizados en su panel. Configurar `lucamsshop.com` y `*.vercel.app` en Wompi.
   - **Turnstile site key:** Cloudflare valida site key contra dominio. Configurar dominios permitidos en panel.
   - **Gemini API key:** **NUNCA es pública.** Solo server-side (`features/ai`, ADR-058): el cliente invoca la Server Action del asistente, nunca el endpoint de Google directo.
3. **Las llaves privadas viven en `.env.local` (dev) y en Vercel env vars (prod).** Nunca commiteadas.
4. **Rotación documentada en `OPERATIONS.md`** (anual o tras compromiso sospechoso).
5. **Nunca loggear secretos.** Filtros en logger redactan claves que coincidan con patrones (`*KEY*`, `*SECRET*`, `*TOKEN*`).

### Inventario de claves

| Variable                                                    | Tipo                      | Visible en cliente | Doc oficial protección                                                                                                                                                           |
| ----------------------------------------------------------- | ------------------------- | ------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (`sb_publishable_*`) | Pública (RLS-protected)   | Sí                 | Mapea al rol Postgres `anon` · permisos limitados por RLS · whitelist de dominio en Supabase si se activa                                                                        |
| `NEXT_PUBLIC_SUPABASE_URL`                                  | Pública                   | Sí                 | —                                                                                                                                                                                |
| `SUPABASE_SECRET_KEY` (`sb_secret_*`)                       | **PRIVADA — bypassa RLS** | **NO**             | Mapea al rol Postgres `service_role`. Solo server, gitignored. Múltiples secret keys soportadas (rotación sin downtime)                                                          |
| `NEXT_PUBLIC_WOMPI_PUBLIC_KEY`                              | Pública                   | Sí                 | Whitelist de dominio en panel Wompi                                                                                                                                              |
| `WOMPI_PRIVATE_KEY`                                         | Privada                   | **NO**             | —                                                                                                                                                                                |
| `WOMPI_INTEGRITY_SECRET`                                    | Privada                   | **NO**             | —                                                                                                                                                                                |
| `WOMPI_EVENTS_SECRET`                                       | Privada (firma webhooks)  | **NO**             | Esquema SHA-256 de eventos Wompi (ver § Webhooks)                                                                                                                                |
| `AVEONLINE_USUARIO` / `AVEONLINE_CLAVE`                     | Privada                   | **NO**             | —                                                                                                                                                                                |
| `AVEONLINE_WEBHOOK_SECRET`                                  | Privada (webhooks)        | **NO**             | Credencial compartida (Aveonline no documenta HMAC): header `x-aveonline-secret` o `payload.token`; la vía `?secret=` está OFF por defecto (`AVEONLINE_ALLOW_QUERY_SECRET`, D-1) |
| `RESEND_API_KEY`                                            | Privada                   | **NO**             | —                                                                                                                                                                                |
| `RESEND_WEBHOOK_SECRET`                                     | Privada (firma webhooks)  | **NO**             | HMAC-SHA256 esquema Svix; var CORE en prod (fail-fast al arranque si falta — D-5)                                                                                                |
| `GEMINI_API_KEY`                                            | Privada                   | **NO**             | Server-only (`features/ai`, ADR-058): la llamada sale servidor→Google, no toca el navegador                                                                                      |
| `NEXT_PUBLIC_TURNSTILE_SITE_KEY`                            | Pública                   | Sí                 | Whitelist de dominio en Cloudflare                                                                                                                                               |
| `TURNSTILE_SECRET_KEY`                                      | Privada                   | **NO**             | Server-only para validación de token                                                                                                                                             |
| `R2_*`                                                      | Privada                   | **NO**             | —                                                                                                                                                                                |

### Detección automática de secretos

- **Reglas gitleaks propias** en [`.gitleaks.toml`](../.gitleaks.toml) (extendiendo la baseline oficial): patrones para `sb_secret_*`, `sb_publishable_*` hardcodeada, URI Postgres con password embebido, `SUPABASE_SECRET_KEY=eyJ…`, Wompi `prv_*`, Anthropic `sk-ant-*` y Resend `re_*`. Sin allowlist de `docs/**` (eliminada en la auditoría 2026-08-24, A-2 — la detección de los 3 formatos nuevos se verificó empíricamente con gitleaks 8.24.3).
- **Pre-commit hook** versionado en [`scripts/git-hooks/pre-commit`](../scripts/git-hooks/pre-commit): corre `gitleaks git --staged` sobre los cambios a commitear. Se activa por desarrollador con `git config core.hooksPath scripts/git-hooks` (no hay auto-instalación); si `gitleaks` no está instalado, el hook avisa y deja pasar el commit — las capas que SÍ se enforzan siempre son Push Protection + el CI `secrets-scan`.
- **CI step** (`secrets-scan` en `.github/workflows/ci.yml`) que escanea el repo completo en cada PR.
- **GitHub Secret Scanning** habilitado a nivel de repo (gratis para repos públicos; revisar privados).
- **GitHub Push Protection** activo a nivel de cuenta (rechaza push si detecta credenciales reales). Validado el 2026-05-09 cuando bloqueó un push con `sb_secret_*` real — ver [`docs/incidents/2026-05-09-secret-key-leak.md`](incidents/2026-05-09-secret-key-leak.md).

### Manipulación segura de archivos de credenciales por agentes IA

> Mandato derivado del incidente del 2026-05-09 (leak de `SUPABASE_SECRET_KEY`). Toda sesión futura de Claude Code u otro agente IA con acceso a filesystem **debe** seguir estas reglas, complementarias a las anteriores.

**El problema:** las herramientas estándar de los agentes IA (`Read`, `Edit`, `Write`) cargan el contenido del archivo en el contexto del modelo y por lo tanto al transcript persistente de la conversación. Para archivos públicos esto es deseable; para archivos de credenciales es un leak silencioso.

**Archivos restringidos** (nunca usar `Read`/`Edit`/`Write` sobre estos):

- `.env`, `.env.local`, `.env.development`, `.env.production`, cualquier `.env.*`
- `~/.git-credentials`
- `~/.aws/credentials`, `~/.config/gcloud/...`, otros credential stores
- `.npmrc` con tokens
- Cualquier archivo cuyo nombre o ubicación sugiera contenido sensible (auth tokens, API keys, passwords, JWTs, connection strings con password embebido)

**Operaciones permitidas y cómo hacerlas:**

| Operación                              | Método correcto                                                                          | Por qué es seguro                                              |
| -------------------------------------- | ---------------------------------------------------------------------------------------- | -------------------------------------------------------------- |
| **Modificar valores**                  | `sed -i 's/OLD/NEW/' .env.local` via Bash                                                | `sed -i` modifica in-place sin imprimir contenido en la salida |
| **Renombrar variables**                | `sed -i 's/^OLD_NAME=/NEW_NAME=/' .env.local`                                            | Idem                                                           |
| **Inspeccionar nombres de variables**  | `grep -E '^[A-Z_]+=' .env.local \| cut -d= -f1`                                          | Solo nombres antes del `=`, valores nunca                      |
| **Verificar que una var está cargada** | `set -a; source .env.local; set +a; [ -n "$VAR" ] && echo loaded` en una sola línea Bash | Vars viven en el subshell, no en el contexto del modelo        |
| **Verificar tipo/longitud sin valor**  | `${#VAR}` (longitud), `${VAR:0:N}...` (prefijo público como `sb_publishable_`)           | El prefijo de 10-15 chars de un secret no compromete nada      |
| **Probar conexión**                    | `set -a; source .env.local; set +a; curl -H "apikey: $VAR" URL` en una sola línea        | Las vars se inyectan al curl pero no aparecen en la salida     |

**Operaciones prohibidas:**

- `cat .env.local`
- `Read .env.local` con la herramienta del agente
- `Edit` o `Write` sobre `.env.local` (Edit requiere Read previo, Write reemplaza pero pasa por contexto)
- Hacer `echo $SECRET_VAR` que imprima el valor
- Loggear cualquier var que matchee `*KEY*`, `*SECRET*`, `*TOKEN*`, `*PASSWORD*`

**Si el agente IA ya leyó el archivo (incidente):** ejecutar [Runbook IRP-001](#runbook-irp-001-llave-supabase_secret_key-sb_secret_-expuesta) inmediatamente — rotar la credencial, no aceptar el riesgo "porque la DB está vacía". El transcript persiste; el riesgo escala cuando llegue data real.

---

## Headers HTTP de seguridad

> Configurados en `apps/web/proxy.ts` (el middleware de Next.js 16), que aplica `SECURITY_HEADERS` + la CSP de `apps/web/lib/security-headers.ts` a TODA respuesta — incluidos los early returns (redirects 3xx y 403 de CORS llevan los headers vía `withSecurityHeaders`; la CSP solo en respuestas con body renderizable). Verificar después con `curl -I https://lucamsshop.com | grep -i 'security\|content-security\|frame'`.

### Set base (Fase 1)

| Header                         | Valor                                                                                                           | Por qué                                                                                                                                                |
| ------------------------------ | --------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `Strict-Transport-Security`    | `max-age=63072000; includeSubDomains; preload`                                                                  | Fuerza HTTPS por 2 años en navegadores que lo cachean                                                                                                  |
| `X-Frame-Options`              | `SAMEORIGIN`                                                                                                    | Clickjacking externo bloqueado; permite la vista previa en iframe del admin (roadmap C1). `frame-ancestors 'self'` en la CSP es el equivalente moderno |
| `X-Content-Type-Options`       | `nosniff`                                                                                                       | Previene MIME sniffing por el navegador                                                                                                                |
| `Referrer-Policy`              | `strict-origin-when-cross-origin`                                                                               | Limita info referrer enviada a otros dominios                                                                                                          |
| `Permissions-Policy`           | `camera=(), microphone=(), geolocation=(), payment=(), usb=(), magnetometer=(), accelerometer=(), gyroscope=()` | Niega APIs sensibles que no usamos                                                                                                                     |
| `X-DNS-Prefetch-Control`       | `on`                                                                                                            | Optimización menor para preconectar a CDN                                                                                                              |
| `Cross-Origin-Opener-Policy`   | `same-origin`                                                                                                   | Aísla el browsing context (defensa contra XS-Leaks / Spectre)                                                                                          |
| `Cross-Origin-Resource-Policy` | `same-site`                                                                                                     | Impide que otros orígenes carguen nuestros recursos como sub-recursos                                                                                  |

### Content-Security-Policy (CSP) — implementada con nonce (C3, ADR-043)

Se construye **por request** con `buildCsp(nonce, isProd)` en `apps/web/lib/security-headers.ts` (la invoca `apps/web/proxy.ts`). **Dos modos:**

**Producción / preview** (`VERCEL_ENV` = production|preview) — `script-src` con **nonce + `'self'`** (sin `'unsafe-inline'` ni `'unsafe-eval'`). **Ya NO lleva `'strict-dynamic'`** (Ola 18 fix, 2026-07-26): con strict-dynamic la allowlist de hosts quedaba inerte (comportamiento CSP3) y los chunks lazy de Next — que cargan sin trust de nonce — eran bloqueados, rompiendo la hidratación de varias páginas en prod. Con `'self'` + nonce los chunks cargan y los scripts inline siguen exigiendo nonce:

```
default-src 'self';
script-src 'self' 'nonce-<aleatorio-por-request>' https://challenges.cloudflare.com https://checkout.wompi.co;
style-src 'self' 'unsafe-inline' https://fonts.googleapis.com;
img-src 'self' data: blob: https://*.supabase.co https://*.coordinadora.com https://images.unsplash.com <origin de NEXT_PUBLIC_SUPABASE_URL>;
font-src 'self' https://fonts.gstatic.com;
connect-src 'self' https://*.supabase.co https://api.wompi.co <origin de NEXT_PUBLIC_SUPABASE_URL>;
frame-src 'self' https://challenges.cloudflare.com https://checkout.wompi.co;
frame-ancestors 'self';
form-action 'self' https://checkout.wompi.co;
base-uri 'self';
object-src 'none';
upgrade-insecure-requests;
```

Notas sobre el bloque de producción:

- En previews (`VERCEL_ENV=preview`) se añade `https://vercel.live` a `script-src` y `frame-src` (toolbar de Vercel Live).
- `connect-src` solo lista hosts que el **navegador** contacta: la IA (Gemini) y el envío (Aveonline) se llaman **server-side** → no aparecen.
- El `<origin de NEXT_PUBLIC_SUPABASE_URL>` se deriva del env (cubre el stack local `http://localhost:54321`); duplicar el wildcard en prod es inocuo.
- `images.unsplash.com` en `img-src` es TEMPORAL (fotos placeholder del seed) — retirar cuando estén las fotos reales.

**Desarrollo** — `script-src 'self' 'unsafe-inline' 'unsafe-eval' …` (sin nonce). El dev server de Next inyecta scripts de HMR/overlay que con nonce se romperían; **el nonce se valida en un deploy prod-like**, no en dev.

**Cómo funciona el nonce** (guía oficial Next 16, `node_modules/next/dist/docs/01-app/02-guides/content-security-policy.md`):

- El proxy genera un nonce nuevo por request, lo pone en el **request header** `x-nonce` + `Content-Security-Policy`, y en el **response header**. Next lo extrae del CSP y lo aplica automáticamente a TODOS sus `<script>` (framework, bundles, inline) durante el SSR. Integrado con el flujo `getAll/setAll` de Supabase (`nextWithNonce()` clona los headers actuales → preserva cookies refrescadas).
- **`style-src` mantiene `'unsafe-inline'` a propósito:** los atributos `style=""` inline NO aceptan nonce (solo elementos `<style>`/`<script>`) → removerlo rompería toda la UI. El riesgo XSS por CSS es mucho menor que por script.
- **`'unsafe-eval'` solo en dev** (HMR + reconstrucción de stacks de React); en prod no se usa.

> ⚠️ **Regla de mantenimiento:** el nonce exige **render dinámico en toda página** — una página estática se prerenderea sin nonce y sus scripts quedan **bloqueados** en prod. La app ya es ~97% dinámica; las pocas estáticas llevan `export const dynamic = "force-dynamic"` (registro, recomendador, maintenance, recuperar-password, not-found). **Toda página nueva debe ser dinámica.** `/manifest.webmanifest` se deja estática (no tiene scripts).

**Verificación (prod-like).** Con `VERCEL_ENV=preview next start`, en cada request el nonce del header `Content-Security-Policy` debe coincidir con el de cada `<script nonce="…">` del HTML (0 scripts sin nonce). Verificado 2026-06-29 en home, registro, recomendador, maintenance, producto, admin/login, carrito, contacto, login. **GUI pendiente (Lucy):** recorrer storefront + estudio/canvas + checkout + Turnstile + admin en un deploy preview con la consola abierta buscando `Refused to execute … violates Content Security Policy`.

### Verificación

```bash
curl -I https://lucamsshop.com
# Esperado: ver todos los headers anteriores
```

Tests E2E (Playwright):

```ts
test("security headers present", async ({ request }) => {
  const response = await request.get("/");
  expect(response.headers()["strict-transport-security"]).toContain("max-age=63072000");
  expect(response.headers()["x-frame-options"]).toBe("SAMEORIGIN");
  expect(response.headers()["content-security-policy"]).toContain("default-src 'self'");
});
```

---

## CORS

### Política

- **Storefront público (`app/(storefront)/*`):** servido siempre desde el mismo origen → no requiere CORS.
- **API routes (`app/api/*`):** por defecto **bloquear cualquier origen distinto al sitio**. Solo abrir `Access-Control-Allow-Origin` para casos específicos justificados.
- **Webhooks (`/api/webhooks/wompi`, `/api/webhooks/aveonline`, `/api/webhooks/resend`):** no usan CORS porque los llaman servidores, no navegadores. Validar firma + IP whitelist si la integración lo permite.

### Implementación

En `apps/web/proxy.ts`, con la allowlist de `getAllowedOrigins()` en `apps/web/lib/security-headers.ts`:

```ts
// apps/web/lib/security-headers.ts (fragmento — versión simplificada)
const ALLOWED_ORIGINS = [
  "https://lucamsshop.com",
  "https://www.lucamsshop.com",
  // Previews de ESTE equipo solamente: el sufijo del scope es obligatorio —
  // un `*.vercel.app` genérico permitiría que cualquiera registrara un proyecto
  // con nombre similar y recibiera ACAO (ADR-062).
  /^https:\/\/lucams-shop(-[a-z0-9][a-z0-9-]*-jullieth93s-projects)?\.vercel\.app$/,
  // Dev: cualquier puerto de localhost (el dev server corre en :4000). Nunca en prod.
  ...(isDev ? [/^http:\/\/localhost:\d{1,5}$/] : []),
];
```

El proxy rechaza con 403 (con security headers + CSP) toda request `/api/*` con `Origin` fuera de la allowlist; a los orígenes permitidos les devuelve `Access-Control-Allow-Origin` + `Access-Control-Allow-Credentials: true` + `Vary: Origin`.

---

## CSRF

### Cuándo aplica

- **Server Actions de Next.js** son inmunes a CSRF clásico porque Next inyecta tokens automáticamente y valida el origen.
- **API routes** con cookie-based auth requieren protección manual.

### Estrategia

1. **`SameSite=Lax`** en cookie de sesión → protección base contra CSRF cross-site.
2. **Verificación de header `Origin`/`Referer`** en mutaciones de API (POST/PUT/DELETE).
3. **Anti-CSRF token** (synchronizer token) para flujos críticos: cambio de email, eliminación de cuenta, transferencia de admin.
4. **Tokens de un solo uso** para acciones idempotentes: confirmación de eliminación.

No hay un `lib/csrf.ts` único: el patrón real es **sellado/firma con clave derivada de `CSRF_SECRET`** (variable CORE obligatoria, validada al arranque por `apps/web/lib/env.ts`; generar con `openssl rand -hex 32`), aplicado donde hace falta:

- **Cookie de estado del checkout** (`apps/web/lib/checkout-session.ts`): el state lleva PII completa (contacto, documento, dirección), así que desde 2026-08-29 (auditoría F-9, ADR-085) viaja **cifrada con AES-256-GCM** — IV aleatorio por escritura, clave derivada de `CSRF_SECRET`; el auth tag de GCM reemplaza el HMAC externo viejo para integridad. Si el unseal falla (manipulada, formato legacy HMAC, secret equivocado) o expiró (TTL 60 min), la cookie se ignora y el cliente vuelve al step 1. El **token de ofertas de envío** (`sealShippingOffersPayload` / `openShippingOffersPayload`) sigue con HMAC-SHA256 (integrity only: ese payload no tiene PII) y verificación timing-safe.
- **Marca de actividad admin** (`apps/web/lib/admin-activity.ts`): `<ts>.<HMAC-SHA256(ts)>` — ver § Cookies y sesiones.
- **Token de baja del newsletter** (`apps/web/features/newsletter/unsubscribe.ts`): `SHA-256(email:CSRF_SECRET)` truncado a 32 hex. El link de baja lleva `base64url(email).token` (el email no viaja en claro por query strings/logs) y la verificación es stateless.

---

## Rate limiting

### Modelo (ADR-016)

Rate limit en Postgres + `pg_cron` durante dev y arranque productivo. Migrar a Redis externo solo si métricas justifican (p95 > 50 ms o volumen real lo exige).

### Buckets y límites

Límites **de producción** implementados hoy (en dev son más laxos). Las keys se construyen con `lib/rate-limit-keys.ts` — **IP y email/teléfono viajan hasheados** (SHA-256 truncado a 16 chars), nunca en claro en `rate_limit_buckets` ni en logs (auditoría 2026-08-24, C-8).

| Flujo                                                               | Clave (scope)                               | Límite prod                       | Razón                                                        |
| ------------------------------------------------------------------- | ------------------------------------------- | --------------------------------- | ------------------------------------------------------------ |
| Signup (`/registro`)                                                | `signup` IP + email                         | 10 / 1 h c/u                      | Anti-bot                                                     |
| Login cliente (`/login`)                                            | `login` IP + email                          | 15 / 15 min c/u                   | Anti-brute force                                             |
| Login admin (`/admin/login`)                                        | `admin-login` IP + email                    | 5 / 15 min c/u                    | Anti-brute force (panel)                                     |
| Reset password (`/recuperar-password`)                              | `reset-password` IP + email                 | 10 / 1 h c/u                      | Anti-enumeración/abuso                                       |
| Verificación OTP (`/confirmar-codigo`, `/restablecer-password`)     | `verify-otp` / `verify-recovery` IP + email | 10 / 15 min c/u                   | Anti-adivinanza de OTP (B-4: doble bucket)                   |
| Reenvío OTP                                                         | `resend-otp` IP + email                     | 3 / 15 min c/u                    | Anti-spam de correos                                         |
| Asistente IA del Estudio                                            | `ai_suggest` IP + identidad                 | 20 / 1 h c/u                      | Costo de la API de Gemini                                    |
| Cotización por WhatsApp                                             | `quote` IP + teléfono                       | 5 y 3 / 24 h                      | Anti-spam                                                    |
| Contacto / soporte                                                  | `contact` IP + email                        | 5 y 3 / 24 h                      | Anti-spam                                                    |
| Newsletter                                                          | `newsletter` IP + email                     | 5 / 1 h c/u                       | Anti-spam                                                    |
| Reseñas                                                             | `review` IP                                 | 5 / 1 h                           | Anti-spam de reseñas                                         |
| Back-in-stock                                                       | `back_in_stock` IP                          | 20 / 1 h                          | Anti-abuso                                                   |
| Consentimiento de cookies                                           | `consent_cookies` IP                        | 30 / 1 min                        | Anti-ruido en `Consent`                                      |
| Búsqueda (server action)                                            | `search_action` IP                          | 60 / 1 min                        | Anti-scraper                                                 |
| Uploads del Estudio                                                 | `upload_design_asset` dueño                 | 30 / 10 min                       | Anti-DoS de storage                                          |
| Cambio de password / eliminación de cuenta                          | `change-password` / `delete-account` dueño  | 5 / 15 min                        | Fuerza bruta sobre acciones sensibles                        |
| APIs públicas de catálogo (`/api/catalog/*`, `/api/coupons/public`) | `catalog_*` / `coupons_public` IP           | 30–60 / 1 min                     | Anti-scraper                                                 |
| Healthchecks (`/api/health/*`)                                      | `health_*` IP                               | 30 / 1 min                        | Anti-sondeo                                                  |
| RUM vitals (`/api/vitals`)                                          | `vitals` IP + backstop global               | 120 / 1 min + 3000 / 5 min global | Anti-DoS de escrituras (C-1)                                 |
| Log de errores de cliente (`/api/log-error`)                        | `log-error` IP                              | 30 / 5 min                        | Anti-DoS de escrituras                                       |
| Webhooks Wompi/Aveonline/Resend                                     | `externalId`                                | 1 / siempre                       | Idempotencia (`WebhookEvent @@unique([source, externalId])`) |

### Implementación

`apps/web/lib/rate-limit.ts` llama vía Prisma a la función SQL `rate_limit_check(key, limit, window_seconds)` (`supabase/migrations/00000000000003_rate_limit.sql`), que hace increment + check **atómico** sobre `rate_limit_buckets` (sin race condition). Endurecida en la migración 027: `search_path` fijado y EXECUTE solo para el owner (la app la invoca como rol `postgres`).

```ts
// lib/rate-limit.ts (forma real — simplificada)
export async function rateLimit(
  key: string,
  limit: number,
  windowSeconds: number,
): Promise<RateLimitResult> {
  const rows = await prisma.$queryRaw<
    Array<{ allowed: boolean; count: number; reset_at: Date }>
  >`SELECT * FROM rate_limit_check(${key}::text, ${limit}::int, ${windowSeconds}::int)`;

  const row = rows[0];
  if (!row) {
    // Fail-open detectable (C-8): la función SIEMPRE devuelve fila; si no,
    // se loguea `rate_limit.empty_row` y se deja pasar la request.
    logger.warn({ event: "rate_limit.empty_row", key });
    return { allowed: true, count: 0, resetAt: /* … */ };
  }
  return { allowed: row.allowed, count: row.count, resetAt: row.reset_at };
}
```

### Headers de respuesta

Las rutas que responden 429 incluyen `Retry-After` (verificado en `/api/health/*`). Los headers `X-RateLimit-*` NO están implementados — agregarlos es mejora futura.

```
HTTP/1.1 429 Too Many Requests
Retry-After: 60
```

---

## Validación de input

### Reglas

- **Toda entrada externa se valida con Zod** antes de tocar lógica de negocio.
- **Esquemas por feature** en `apps/web/features/*/schemas.ts` (y junto a las actions/routes que los usan), compartidos entre client y server.
- **Mensajes de error en español** y sin filtrar detalles internos.
- **Whitelist, no blacklist:** definir qué se acepta, no qué se bloquea.

### Patrón

```ts
// features/checkout/schemas.ts (fragmento ilustrativo del patrón)
import { z } from "zod";

export const ShippingAddressSchema = z.object({
  name: z
    .string()
    .min(2)
    .max(80)
    .regex(/^[\p{L}\s'.-]+$/u, "Solo letras y espacios"),
  line1: z.string().min(5).max(120),
  line2: z.string().max(120).optional(),
  city: z.string().min(2).max(80),
  department: z.enum(["Amazonas", "Antioquia", "Arauca" /* ... 32 deptos CO ... */]),
  zip: z
    .string()
    .regex(/^\d{6}$/)
    .optional(),
  phone: z.string().regex(/^(\+57)?3\d{9}$/, "Celular CO inválido"),
});

export const CheckoutPayloadSchema = z.object({
  email: z.string().email().toLowerCase().trim(),
  cartId: z.string().cuid(),
  shippingAddress: ShippingAddressSchema,
  paymentMethod: z.enum(["WOMPI", "COD"]),
  couponCode: z.string().max(40).optional(),
});

export type CheckoutPayload = z.infer<typeof CheckoutPayloadSchema>;
```

```ts
// Patrón en una API route pública (ej. app/api/catalog/products/route.ts)
export async function GET(req: Request) {
  const parsed = QuerySchema.safeParse(Object.fromEntries(req.nextUrl.searchParams));
  if (!parsed.success) {
    return Response.json({ error: "invalid query" }, { status: 400 });
  }
  // Continuar solo con datos validados
}
```

### Sanitización

- **HTML/Markdown user-generated** (textos legales con formato, razón de retracto, etc.): se renderiza con `ReactMarkdown` + `remark-gfm` + **`rehype-sanitize`** (allowlist de elementos) — nunca HTML crudo.
- **No usar `dangerouslySetInnerHTML`** salvo con contenido sanitizado o de fuente confiable (admin).

---

## Output encoding / XSS

- **React escapa por defecto** todos los strings interpolados → XSS clásico no aplica.
- **`dangerouslySetInnerHTML`** prohibido excepto:
  - Blog posts (admin escribe MDX, server-side rendered, no input de usuario).
  - SEO `<head>` JSON-LD (server-generated).
- **URLs construidas con input de usuario** validar protocolo (`https:` o relativo, nunca `javascript:`).
- **CSP estricto** (sección anterior) es defensa en profundidad.

---

## TTLs y caducidad de recursos

> Mandato: **todo recurso temporal tiene TTL explícito.** Nada infinito.

| Recurso                                   | TTL                          | Mecanismo                                                                 |
| ----------------------------------------- | ---------------------------- | ------------------------------------------------------------------------- |
| Access token Supabase                     | 1 h                          | Auto-rotation con refresh token                                           |
| Refresh token Supabase                    | 30 días                      | Rotation en cada uso                                                      |
| Session cookie del admin                  | 30 min idle                  | Marca HMAC + revocación server-side en `proxy.ts` (ver § Cookies)         |
| Reset password (OTP)                      | Corta (config Supabase Auth) | OTP de 6-10 dígitos, no link                                              |
| Email confirmation (OTP)                  | Corta (config Supabase Auth) | OTP de 6 dígitos, no link                                                 |
| Reserva de stock (`StockReservation`)     | 15 min                       | `pg_cron` cleanup cada minuto (ADR-014)                                   |
| Cache "última cotización buena" Aveonline | 10 min                       | Cache in-memory por proceso (`features/shipping/aveonline.ts`)            |
| Rate limit buckets                        | 1 día (housekeeping)         | `pg_cron` cleanup cada 15 min                                             |
| URL firmada `customer-uploads`            | 1 h                          | Supabase Storage signed URL                                               |
| URL firmada `production-assets`           | 1 h (default, configurable)  | Idem (acceso solo admin)                                                  |
| `EmailEvent` / `WebhookEvent`             | 180 días                     | Cron `purge-event-logs` (`features/observability/event-log-retention.ts`) |
| `ErrorLog` / `ErrorReport`                | 90 días                      | Idem (ErrorReport por `lastSeenAt`: lo que sigue ocurriendo no se purga)  |
| Audit logs admin                          | 2 años                       | Política legal                                                            |
| Backups en R2                             | ~30 días (diarios)           | Pipeline `pg_dump → gzip → gpg AES256` diario + lifecycle rule en bucket  |

---

## File upload y Storage

### Buckets

Definidos en [`ARCHITECTURE.md` § Storage](./ARCHITECTURE.md#storage-supabase).

### Flujo de upload del estudio de personalización

Implementado como **Server Action** `uploadDesignAssetAction` (`apps/web/features/personalization/actions.ts`) + `uploadCustomerPhoto` (`apps/web/lib/storage.ts`) — el archivo viaja al servidor (no hay endpoint `POST /api/upload/sign` ni upload directo del cliente a Storage):

1. Cliente sube la foto por la Server Action (FormData).
2. Server valida ownership del Design (customerId o sessionId anónima) y rate limit por dueño (`upload_design_asset`, 30 / 10 min).
3. Server valida:
   - Tamaño ≤ 10 MB.
   - **MIME REAL por magic bytes** (`sniffImageMime`, no el Content-Type del cliente — rechaza polyglots `.html`/`.svg` renombrados). Allowlist: `image/jpeg`, `image/png`, `image/webp`, `image/heic`/`image/heif` (los HEIC de iPhone se convierten a JPEG con `heic-decode`).
4. Strip EXIF + auto-orient con `sharp` (vía `sharp-safe`, que bloquea los loaders con CVE antes de procesar — auditoría F-4).
5. Upload al bucket **privado** `customer-uploads` con nombre aleatorio (UUID) + `metadata.owner_id`.
6. Se genera signed URL (TTL 1h) solo para uso del editor; la enumeración se previene con nombres UUID.

### Antivirus / detección de contenido

- **Hoy:** validación de magic bytes + tamaño + allowlist + re-encode con sharp (un payload embebido no sobrevive el re-encode).
- **Fase 7+ (al lanzar):** evaluar VirusTotal API o ClamAV en una Edge Function pre-procesamiento si el volumen lo justifica. Por ahora: confiar en allowlist + Supabase Storage no ejecuta archivos.

### EXIF stripping

- Imágenes que el cliente sube pueden tener metadata GPS y otra info sensible.
- **Stripping automático** al momento del upload a `customer-uploads`: `sharp(buffer).rotate().toBuffer()` auto-orienta según EXIF y descarta el resto de metadata (sin `withMetadata`, no se copia nada). La foto que queda en Storage ya va sin EXIF.

---

## Webhooks (Wompi, Aveonline, Resend)

> Estado implementado (Bloque A, certificado 2026-06-27). Secrets de webhook:
> `WOMPI_EVENTS_SECRET` (firma de eventos Wompi), `AVEONLINE_WEBHOOK_SECRET`
> (credencial de los `tracking.updated` de Aveonline) y `RESEND_WEBHOOK_SECRET`
> (firma Svix de los eventos de entregabilidad de email; CORE en prod — la app no
> arranca sin ella, D-5). Todos son privados, solo en `.env*`
> gitignored, nunca en cliente.

### Verificación de firma

- **Wompi:** `verifyWebhookSignature` (`apps/web/lib/wompi.ts`) verifica
  `signature.checksum` con el esquema documentado de Wompi — **SHA-256** del
  concatenado de propiedades + timestamp + `WOMPI_EVENTS_SECRET` — comparado
  **timing-safe** (`crypto.timingSafeEqual`) tras validar que
  checksum/properties/timestamp existan (detalle en
  [`INTEGRATIONS.md` § Wompi](./INTEGRATIONS.md#1-wompi-pasarela-de-pago--proveedor-principal)).
- **Aveonline:** Aveonline no documenta HMAC — el webhook `/api/webhooks/aveonline`
  valida una **credencial compartida** (comparación timing-safe) por 3 vías:
  header `x-aveonline-secret`, `payload.token` (el Token del panel "Mis
  integraciones", re-enviado en cada notificación) o — solo durante la transición,
  con `AVEONLINE_ALLOW_QUERY_SECRET=true` (default OFF, auditoría D-1) —
  `?secret=`. Además: el `trackingNumber` debe existir en DB y los estados son
  monotónicos (no retroceden). La dedup usa `hasCarrierTimestamp` (D-4): eventos
  sin fecha del carrier deduplican con externalId `…-no-ts` determinista.
- **Resend:** firma **HMAC-SHA256 esquema Svix** (contenido firmado =
  `${svix-id}.${svix-timestamp}.${rawBody}`; la clave son los bytes base64 tras el
  prefijo `whsec_`), con tolerancia de reloj de 5 min anti-replay. Sin secret en
  env: rechaza en prod (fail-closed), permite en dev para testing local. Un
  bounce/complaint nunca se degrada por un evento viejo (upsert en transacción,
  D-2).
- **Rechazo HTTP 401** si la firma no coincide. **No revelar la razón** al cliente.
  Los logs persisten `bodyHash` (sha256 truncado), no el body crudo (D-5).

### Idempotencia

- Tabla `WebhookEvent(@@unique([source, externalId]))`. El `externalId` de Wompi es
  `${transaction.id}-${status}-${timestamp}` → un retry real de Wompi (mismo
  timestamp firmado) produce el mismo key y se deduplica.
- Si ya estaba `processedAt`, devolver 200 sin re-procesar.
- La saga POST-PAID tiene además idempotencia física en el ledger (índice parcial
  unique `InventoryLog(orderId, reason, variantId)`) + claim atómico de creación de
  guía (`Order.shipmentClaimedAt`) — certificado en el Bloque A (2026-06-26).

### Replay protection (implementado, P1-011)

- **Ventana de 25 h** sobre `event.timestamp` (no ±5 min: Wompi reintenta el evento
  con el MISMO timestamp firmado a los 30 min / 3 h / 24 h — una ventana de 5 min
  mataba los reintentos legítimos con 401 y el evento se perdía; corregido
  2026-07-28). Fuera de ventana → 401. La protección real contra replay la da la
  idempotencia por eventKey: un replay cae en "already processed" y forjar un
  timestamp nuevo rompe la firma. `WOMPI_DISABLE_TIMESTAMP_CHECK=true` solo para
  tests locales (cubre SOLO la ventana; el environment-match siempre aplica).
- **Environment match**: el webhook exige que `event.environment` coincida con
  `WOMPI_ENV` (no `NODE_ENV` — evita falsos 401 en Vercel preview). Un webhook
  "prod" no se procesa en sandbox y viceversa.

### Whitelist de IPs (cuando la integración lo permite)

- Wompi y Aveonline publican rangos de IPs salientes. Validar a nivel middleware o
  Cloudflare WAF (pendiente — la firma/credencial es la defensa primaria actual).

---

## Audit logs

### Qué se registra

Toda acción mutante de admin escribe en `AdminActionLog` (tabla en `ARCHITECTURE.md`). Acciones registradas:

- Cambio de estado de orden (`OrderStatus`).
- Ajuste manual de inventario (`InventoryLog` ya lo hace; `AdminActionLog` adiciona contexto humano).
- Aprobación/rechazo de reseña.
- Reembolso manual.
- Cambio de precio o publicación/despublicación de producto.
- Creación, edición o desactivación de cupón.
- Login/logout del admin.
- Promoción/democión de roles en `AdminUser`.

Helper: `recordAdminAction()` (`apps/web/lib/admin-audit.ts`), usado en las actions admin (35+ callsites).

### Qué NO se registra

- Lecturas (queries que no muta).
- Acciones de cliente final sobre sus propios datos (eso queda en `Order`, `Cart`, etc.).

### Retención

- 2 años (alineado con Ley 1581 de Habeas Data — soporte en caso de queja del consumidor).
- Después de 2 años: archivar a R2 (parquet) y purgar de la DB.

---

## Logging

### Estructura

JSON estructurado con campos mínimos:

```json
{
  "timestamp": "2026-05-09T14:30:00.123Z",
  "level": "info",
  "requestId": "cuid_xxx",
  "route": "/api/webhooks/wompi",
  "method": "POST",
  "statusCode": 200,
  "latencyMs": 234,
  "userId": "cuid_xxx_or_null",
  "msg": "checkout created"
}
```

### Niveles

| Nivel   | Cuándo                                                 |
| ------- | ------------------------------------------------------ |
| `debug` | Solo dev. Datos verbosos para depuración.              |
| `info`  | Eventos normales (request, response, queue processed). |
| `warn`  | Algo inusual pero no roto (rate limit hit, retry).     |
| `error` | Algo falló y necesita atención.                        |
| `fatal` | El proceso no puede continuar.                         |

### PII redactada

**Nunca loggear:**

- Email completo → loggear hash o `cu***@gmail.com`.
- Teléfono completo → últimos 4 dígitos.
- Dirección → ciudad/depto solamente.
- Tarjetas (no las tenemos, todo vía Wompi) — verificar logs no las contengan accidentalmente.
- Tokens / passwords / claves.

Implementado en el logger global (`apps/web/lib/logger.ts` — implementación propia sobre `console`, API compatible con pino): `redact()` enmascara claves que coincidan con patrones sensibles (`*KEY*`, `*SECRET*`, `*TOKEN*`, passwords) y `scrubPii()` limpia emails/teléfonos/documentos embebidos en mensajes y stacks. La misma `scrubPii` se aplica al capturar `ErrorLog`/`ErrorReport` (`lib/error-capture.ts`, F-6 — el fingerprint se calcula post-scrub).

### Acceso

- **Dev:** stdout local + archivos en `logs/` (gitignored).
- **Prod:** Vercel Logs (mandato #7 — sin Sentry hasta Fase 7).
- **Retención Vercel Logs:** 1 día en Hobby, 7 días en Pro. Suficiente para debugging inmediato. Para retención larga, evaluar BetterStack (Free) en Fase 7.

---

## PII y Habeas Data (Ley 1581)

### Datos personales recolectados

| Campo                   | Origen              | Propósito                                            | Retención                                      |
| ----------------------- | ------------------- | ---------------------------------------------------- | ---------------------------------------------- |
| Email                   | Registro / checkout | Auth, comunicación transaccional, marketing (opt-in) | Mientras la cuenta exista + 1 año              |
| Teléfono                | Checkout            | Logística (contacto del repartidor)                  | Mientras la orden esté activa + 5 años (legal) |
| Dirección               | Checkout            | Logística                                            | Idem                                           |
| Nombre                  | Checkout / registro | Personalización + emails                             | Idem                                           |
| Fotos subidas (estudio) | Personalización     | Producción del imán                                  | Mientras la orden esté activa + 90 días        |
| IP                      | Logs / rate limit   | Seguridad, prevención de fraude                      | Hasheada en rate-limit; logs Vercel 1-7 días   |

### Derechos del titular (Ley 1581)

El cliente gestiona sus datos desde `/mi-cuenta`:

- Ver sus datos almacenados (perfil, direcciones, pedidos, reseñas).
- Solicitar corrección (edición self-service en `/mi-cuenta/perfil` y `/mi-cuenta/direcciones`).
- Solicitar eliminación de cuenta en `/mi-cuenta/seguridad → Eliminar mi cuenta` (`features/account/delete-service.ts` — alcance exhaustivo, ver `COMPLIANCE.md` § Derecho de supresión).
- Exportación y PQR formales: canal manual `habeas-data@lucamsshop.com` (endpoint self-service de exportación = mejora pendiente).

**Eliminación de cuenta:**

- **Anonimización + soft-delete inmediatos** (`Customer.deletedAt` + scrub de PII: nombre/teléfono/documento → null, email → placeholder único), NO borrado físico — concilia la supresión con la retención fiscal DIAN.
- Se borran físicamente las fotos del Estudio (la PII más sensible) y se anonimizan direcciones, reseñas, tickets y snapshots de envío en órdenes finalizadas; pedidos y consentimientos se conservan anonimizados (obligación legal).
- El usuario de Supabase Auth se elimina con `admin.deleteUser` (fallback: baneo).
- Logs: PII redactada por `scrubPii` al capturar + purga por retención (`ErrorLog`/`ErrorReport` 90 días, `EmailEvent`/`WebhookEvent` 180 días); backups: la PII purgada desaparece al rotar la retención (~30 días).

### Política y términos

- **Política de privacidad** publicada en `/legal/privacidad` antes del lanzamiento (ADR-020 abierto: ¿plantilla nuestra o abogado?).
- **Términos y condiciones** publicados en `/legal/terminos`.
- **Política de cookies** publicada en `/legal/cookies`. Banner de consentimiento al primer visit (mínimo, no anti-UX).
- **Habeas Data:** formulario en `/legal/habeas-data` para solicitudes formales.

---

## Dependency scanning y supply chain

### Reglas

1. **`pnpm-lock.yaml`** versionado, integridad sub-resource verificada.
2. **`pnpm audit --prod --audit-level=high`** corre en CI en cada PR (job `dep-audit`; el gate es sobre deps de producción — los advisories dev-only se triagean con overrides dirigidos en `pnpm-workspace.yaml`, auditoría F-5).
3. **Dependabot** automatiza PRs de actualización (`.github/dependabot.yml`, semanal, agrupado; majors bloqueados — se evalúan a mano). **Las GitHub Actions están pineadas por SHA** en los 4 workflows (auditoría A-1).
4. **`pnpm dlx` para tooling de un solo uso** (no agregar a deps si solo es script).
5. **Allowlist de licencias** (bloquear GPL/AGPL en código propietario) — **pendiente de automatizar** en CI (no hay `license-checker` hoy).
6. **No usar paquetes con < 30 días en npm** (evita typosquatting reciente).

### Auditoría manual antes de cada release

- Revisar `pnpm outdated` — actualizar minor/patch agresivo, major con due diligence.
- Verificar el dashboard de Dependabot.
- Verificar GitHub Security Advisories del repo.

---

## CI/CD security

### En GitHub Actions

- **Secrets** declarados en repo Settings → Secrets, **nunca hardcodeados**.
- **Permisos mínimos** del `GITHUB_TOKEN` (read-only por defecto, escalar solo donde se necesite).
- **`pull_request_target`** evitado salvo necesidad — el patrón seguro es `pull_request` + `permissions: contents: read`.
- **Branch protection** en `main`: PRs requeridos, review obligatorio, status checks must pass, no force push.
- **Signed commits** requeridos para `main` (vía GitHub web UI o gpg).

### Steps mínimos del CI

1. `pnpm install --frozen-lockfile`
2. `pnpm typecheck`
3. `pnpm lint`
4. `pnpm test` (Vitest, unit + integración con Postgres)
5. `pnpm test:e2e` (Playwright) + a11y (axe)
6. `pnpm audit --prod --audit-level=high` (falla si vulnerabilidad alta en deps de producción)
7. Secret scanning (gitleaks, job `secrets-scan`)
8. Prettier format check
9. Lighthouse CI (autorun contra build de producción)

---

## Observabilidad de seguridad

> Mandato #7: sin Sentry hasta Fase 7. Mientras tanto:

- **Vercel Logs** con grep manual.
- **Supabase Auth dashboard** muestra intentos fallidos de login, sign-ups, etc.
- **Tabla `AdminActionLog`** auditable desde `/admin/auditoria`.
- **`ErrorLog`/`ErrorReport`** (captura server + reportes de cliente vía `/api/log-error`) visibles en `/admin/observability`, con PII ya redactada por `scrubPii` al capturar (F-6).
- **Healthchecks** en `/api/health/*`: la respuesta pública es mínima (`status` + `timestamp`); el detalle (versión, crons, topología) exige el header `x-cron-secret` (C-3/C-4).
- **Centro de notificaciones del admin** (`/admin/notificaciones`, `features/notifications/service.ts`): los fallos de cron (`notifyCronFailure`), alertas de stock, cotizaciones y eventos de orden generan notificaciones in-app con severidad y dedup anti-ruido. Los éxitos NO se registran.

Decisión definitiva de observabilidad de errores: ADR-022 abierto en Fase 7. Alertas externas (email/push con umbrales) = mejora pendiente.

---

## Threat model formal (STRIDE)

> Verificado contra [Microsoft Learn — Threat Modeling Tool: Threats](https://learn.microsoft.com/en-us/azure/security/develop/threat-modeling-tool-threats) a 2026-05-09. STRIDE es el framework de Microsoft SDL para clasificar amenazas. Se aplica a cada flujo crítico del sistema.

### Las 6 categorías STRIDE

| Letra | Categoría              | Definición (cita textual del doc oficial)                                                       | Mitigación principal en Lucams_shop                                                                  |
| ----- | ---------------------- | ----------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| **S** | Spoofing               | _"illegally accessing and then using another user's authentication information"_                | Supabase Auth + MFA admin + cookies SameSite=Lax + Secure (prod/preview)                             |
| **T** | Tampering              | _"malicious modification of data... unauthorized changes... alteration of data as it flows"_    | RLS + HTTPS + firma/credencial en webhooks + integridad Wompi (`WOMPI_INTEGRITY_SECRET`)             |
| **R** | Repudiation            | _"users who deny performing an action without other parties having any way to prove otherwise"_ | `AdminActionLog` + logs estructurados con `requestId` + `WebhookEvent` con timestamp                 |
| **I** | Information Disclosure | _"exposure of information to individuals who are not supposed to have access to it"_            | RLS + service_role solo server-side + redact PII en logs + URL firmada con TTL                       |
| **D** | Denial of Service      | _"deny service to valid users... making a Web server temporarily unavailable"_                  | Rate limit + Turnstile + Cloudflare DDoS protection + circuit breakers                               |
| **E** | Elevation of Privilege | _"unprivileged user gains privileged access"_                                                   | RBAC (`AdminUser.role`) + middleware `/admin/*` + tests RLS automáticos + mass assignment prevention |

### Aplicación por flujo crítico

#### Flujo 1: Registro y login

| Vector STRIDE          | Amenaza concreta                                  | Mitigación                                                                                                               |
| ---------------------- | ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| Spoofing               | Atacante usa email/password robado                | Rate-limit doble IP+email (15/15 min) · HIBP bloquea passwords filtradas · MFA obligatorio admin (enforceado por código) |
| Tampering              | OTP de recuperación adivinado                     | OTP de 6-10 dígitos · doble bucket IP+email (10/15 min) · email vía Resend con DKIM                                      |
| Repudiation            | Usuario niega haber registrado la cuenta          | `Consent` con `acceptedAt`, `ipAddress`, `userAgent` versionado                                                          |
| Information Disclosure | Mensaje "email no registrado" permite enumeración | Mensaje genérico "credenciales inválidas" en login fail                                                                  |
| Denial of Service      | Bot crea 1000 cuentas/min                         | Rate limit `signup` 10/h por IP + 10/h por email                                                                         |
| Elevation of Privilege | Usuario edita rol vía mass assignment             | Schemas Zod sin `role` en payloads de cliente; `role` solo desde panel admin                                             |

#### Flujo 2: Checkout + pago Wompi

| Vector STRIDE          | Amenaza                                                | Mitigación                                                                                                   |
| ---------------------- | ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------ |
| Spoofing               | Webhook falso simulando Wompi                          | Firma SHA-256 (esquema de eventos Wompi) con `WOMPI_EVENTS_SECRET` · environment match · ventana anti-replay |
| Tampering              | Modificar `amount` entre cliente y servidor            | Servidor recalcula totales desde DB · firma de integridad Wompi                                              |
| Repudiation            | Cliente niega haber autorizado                         | Wompi 3DS (challenge ante banco emisor) + `WebhookEvent` con payload completo                                |
| Information Disclosure | PCI: tarjeta queda en logs                             | Wompi maneja tarjetas, nunca tocan nuestro server · logger con redact                                        |
| Denial of Service      | Bot llena `Order` con `PENDING_PAYMENT` que nunca paga | Turnstile en checkout · TTL 15min en `StockReservation` libera stock                                         |
| Elevation of Privilege | Cambiar `paymentMethod=COD` para no pagar              | Validación server-side; COD requiere validación adicional + dirección verificada                             |

#### Flujo 3: Estudio de Personalización (upload)

| Vector STRIDE          | Amenaza                                               | Mitigación                                                                                  |
| ---------------------- | ----------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| Spoofing               | URL firmada de otro usuario                           | Ownership del Design validado en la Server Action de upload; objeto con `metadata.owner_id` |
| Tampering              | Subir archivo distinto al validado                    | MIME real por magic bytes + tamaño en server (no confiar en el cliente) · re-encode sharp   |
| Repudiation            | "Yo no subí esa imagen"                               | `customer-uploads` bucket con metadata `owner_id`                                           |
| Information Disclosure | Acceso a fotos de otros clientes                      | Bucket privado · URL firmada TTL 1h · enumeración prevenida (UUID en filename)              |
| Denial of Service      | 1000 uploads de 10MB c/u en 1 min                     | Rate limit 30/10min por dueño + tamaño máximo 10MB                                          |
| Elevation of Privilege | Cliente lee `production-assets` (privado, solo admin) | RLS bucket-level; URL firmada solo se genera en endpoints admin con role check              |

#### Flujo 4: Background jobs (pg_cron → endpoints HTTP)

Los jobs vivos son `pg_cron` en Supabase llamando endpoints `/api/cron/*` por HTTP (secretos en Supabase Vault, migraciones 015/016/021/023) + jobs SQL puros de limpieza (migración 012). No hay cola pgmq ni Edge Functions consumer en producción.

| Vector STRIDE          | Amenaza                                  | Mitigación                                                                                       |
| ---------------------- | ---------------------------------------- | ------------------------------------------------------------------------------------------------ |
| Spoofing               | Atacante invoca `/api/cron/*` directo    | Header `x-cron-secret` verificado con comparación timing-safe en los 8 endpoints cron            |
| Tampering              | Secreto del cron en la URL (access logs) | El secreto viaja por header, nunca por query-string; leído desde Vault en runtime                |
| Repudiation            | Job corrió pero "nadie sabe qué pasó"    | `recordCronHeartbeat` por job + log estructurado; fallos → notificación in-app admin             |
| Information Disclosure | Detalle de crons/health expone topología | Respuesta pública mínima (`status`+`timestamp`); detalle solo tras `x-cron-secret` (C-3/C-4)     |
| Denial of Service      | Job de purga borra de más                | Purgas con criterios conservadores (webhook solo si `processedAt`, ErrorReport por `lastSeenAt`) |
| Elevation of Privilege | Cron escala permisos                     | Los endpoints usan Prisma/`service` solo para la operación explícita del job                     |

### Pendiente

- Threat model formal de cada flujo nuevo cuando se agregue (Fase 4: pago, Fase 6: B2B mayorista).
- Revisión externa pre-lanzamiento (pen test).

---

## Plan de respuesta a incidentes (IRP)

> Mandato: cuando algo de seguridad se quiebra, hay un proceso documentado. No se improvisa.

### Definiciones

| Severidad        | Definición                                                                             | Tiempo de respuesta  |
| ---------------- | -------------------------------------------------------------------------------------- | -------------------- |
| **P0 — Crítica** | Brecha activa (datos siendo exfiltrados, dinero siendo robado, sitio caído por ataque) | Inmediata (< 15 min) |
| **P1 — Alta**    | Vulnerabilidad explotable confirmada o comportamiento anómalo grave                    | < 2 h                |
| **P2 — Media**   | Vulnerabilidad teórica con explotación compleja, o anomalía sin impacto inmediato      | < 24 h               |
| **P3 — Baja**    | Hallazgo informativo (configuración subóptima, dependencia con CVE bajo)               | < 7 días             |

### Las 6 fases (NIST SP 800-61)

#### 1. Preparación (continua)

- Backups verificados (mensual).
- IRP documentado y leído por el operador.
- Contactos de soporte de cada vendor a la mano (ver `OPERATIONS.md` § Contacto y escalamiento).
- Lista de números/emails de SIC, DIAN, banco de Wompi.

#### 2. Detección (cómo me entero)

- Alertas automatizadas (`OBSERVABILITY.md` § Alertas).
- Reporte externo: `seguridad@lucamsshop.com` o `/legal/security`.
- Dashboard `/admin/observability` con anomalías.

#### 3. Contención

| Tipo de incidente                                        | Acción inmediata                                                               |
| -------------------------------------------------------- | ------------------------------------------------------------------------------ |
| Credencial comprometida (API key)                        | Rotar inmediatamente en panel del vendor + redeploy                            |
| Cuenta admin comprometida                                | Suspender desde panel Supabase Auth + invalidar sesiones                       |
| Webhook flooding (signature válida pero tráfico anómalo) | Cloudflare WAF rule temporal + alertar a Wompi/Aveonline                       |
| Sitio bajo DDoS                                          | Cloudflare "Under Attack" mode + IP whitelist solo admin                       |
| Dato sensible expuesto en logs                           | Borrar de Vercel Logs (si retención lo permite) + rotar credenciales si aplica |
| Database corrupted                                       | Modo mantenimiento (`NEXT_PUBLIC_MAINTENANCE_MODE=1`) + restore desde PITR     |
| Phishing usando nuestro dominio                          | Reportar a phishtank.com + advertencia en homepage + email a clientes          |

#### 4. Erradicación

- Identificar root cause.
- Parchar la vulnerabilidad (código, config, política).
- Verificar que no hay otras instancias del mismo vector.

#### 5. Recuperación

- Restablecer servicio.
- Validar integridad de datos (especialmente órdenes y pagos).
- Re-habilitar accesos suspendidos.
- Comunicación a usuarios afectados (si aplica).

#### 6. Lecciones aprendidas

- Postmortem en `docs/incidents/YYYY-MM-DD-<slug>.md` ([plantilla en `OBSERVABILITY.md` § Process de postmortem](./OBSERVABILITY.md#process-de-postmortem)).
- Acciones concretas con responsable y fecha.
- Si fue brecha de datos personales: **reporte a SIC dentro de 15 días hábiles** (Ley 1581).

### Runbook por escenario

#### Runbook IRP-001: Llave `SUPABASE_SECRET_KEY` (`sb_secret_*`) expuesta

**Vectores conocidos de exposición:**

- Commit accidental al repo (mitigado por gitleaks pre-commit + GitHub Push Protection).
- Logs en producción (mitigado por el redact del logger propio, `lib/logger.ts`).
- Compartida en chat/email/Slack/issue.
- **Lectura inadvertida por agente IA** (Claude Code u otro): el agente usa `Read`/`Edit`/`Write` sobre `.env.local` y la key entra al transcript persistente. Vector confirmado en [docs/incidents/2026-05-09-secret-key-leak.md](../incidents/2026-05-09-secret-key-leak.md). Prevención: ver [§ Manipulación segura de archivos de credenciales por agentes IA](#manipulación-segura-de-archivos-de-credenciales-por-agentes-ia).
- Push intentado a GitHub donde Push Protection capturó el valor (incluso si rechazó el push, el sistema lo loggea).

```
Severidad: P0
ETA contención: 15 min

1. Ir a panel Supabase → Project Settings → API keys → Secret keys.
2. Click "Create new secret key" para generar reemplazo (las nuevas secret keys
   permiten múltiples activas simultáneamente — no hay downtime).
3. Copiar el nuevo valor.
4. Vercel → Project → Settings → Environment Variables → editar SUPABASE_SECRET_KEY.
5. Trigger redeploy desde Vercel (o `vercel deploy --prod`).
6. Verificar /api/health responde 200 con la nueva key.
7. Auditar últimos 7 días de Supabase Auth logs y queries con la key vieja por accesos sospechosos.
8. **Revocar** la secret key comprometida en panel Supabase (no solo crear la nueva — la vieja sigue activa hasta revocarla explícitamente).
9. Si hubo tráfico anómalo: revisar tablas críticas (Order, Customer) por modificaciones.
10. Postmortem en 24h.
```

#### Runbook IRP-002: Webhook de Wompi con tráfico anómalo (replay attack o forge)

```
Severidad: P1
ETA contención: 2 h

1. Verificar /admin/observability: ratio fail/success de webhooks.
2. Si fails > 50%, verificar:
   - ¿Cambió `WOMPI_EVENTS_SECRET` recientemente? Verificar contra panel Wompi.
   - ¿Wompi cambió formato de signature? Revisar docs.wompi.co/changelog.
3. Si tráfico válido pero excesivo: Cloudflare WAF rate limit temporal en /api/webhooks/wompi.
4. Notificar a Wompi vía soporte si se sospecha que es lado de ellos.
5. Postmortem si afectó órdenes reales.
```

#### Runbook IRP-003: Brecha de datos personales (PII exfiltrada)

```
Severidad: P0
ETA contención: 15 min · ETA reporte SIC: 15 días hábiles

1. Identificar alcance:
   - Qué datos fueron expuestos (emails? teléfonos? direcciones? fotos?)
   - Cuántos titulares afectados.
   - Cómo (RLS bypass? secret key expuesta? SQL injection?)
2. Cerrar el vector inmediatamente (rotar credenciales, parchar, revocar accesos).
3. Notificar al equipo legal (abogado) o al usuario operador.
4. Preparar comunicación a titulares afectados (email transparente, sin tecnicismos).
5. Documentar todo en docs/incidents/YYYY-MM-DD-pii-breach.md.
6. Reportar a SIC dentro de 15 días hábiles vía formulario oficial.
7. Postmortem público (sin nombrar titulares) en /legal/incidents.
```

#### Runbook IRP-004: Stock oversold detectado

```
Severidad: P1
ETA contención: 2 h

1. Identificar las órdenes afectadas (query InventoryLog buscando stock < 0 históricamente).
2. Para cada orden afectada:
   - Contactar al cliente vía email.
   - Ofrecer: reembolso completo OR reservar para próxima reposición + cupón de compensación.
3. Marcar orden como CANCELLED con razón "oversold_compensated" en AdminActionLog.
4. Identificar root cause:
   - ¿Falló el SELECT FOR UPDATE? ¿Hubo race condition?
   - ¿Falló el cleanup de StockReservation expiradas?
5. Patch + test de regresión que reproduzca la condición.
6. Postmortem en 24h.
```

---

## Clasificación de datos

> Toda data en el sistema se clasifica para saber cómo protegerla. Mandato: cuando se introduce un campo nuevo, clasificar antes de implementar.

### Niveles

| Nivel                             | Definición                                      | Ejemplos en Lucams_shop                                                                                       | Almacenamiento permitido                                           | Logging                                                |
| --------------------------------- | ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ | ------------------------------------------------------ |
| **Público**                       | Información destinada a ser visible en internet | Catálogo de productos, blog, paleta de colores                                                                | Cualquier capa                                                     | OK loggear                                             |
| **Interno**                       | No sensible pero solo para el equipo            | Métricas agregadas, schema de DB, métricas de crons                                                           | Server-side, accesible a admins                                    | OK loggear                                             |
| **Confidencial — PII directa**    | Identifica a una persona                        | Email, teléfono, nombre, dirección, foto del estudio                                                          | Postgres con RLS, Storage privado, encriptado en tránsito y reposo | **Redactado** en logs (`redact`/`scrubPii` del logger) |
| **Restringida — PII sensible**    | Datos especialmente protegidos por Ley 1581     | Solo si recolectamos: salud, biometría, ideología, etc. (no aplica hoy)                                       | Encriptación a nivel campo + acceso auditado                       | **Nunca** en logs                                      |
| **Crítica — Secretos de sistema** | Llaves, tokens, credenciales                    | `SUPABASE_SECRET_KEY` (`sb_secret_*`), `WOMPI_PRIVATE_KEY`, `GEMINI_API_KEY`, `CSRF_SECRET`                   | Solo en `.env*` (gitignored) y Vercel env vars                     | **Nunca** en logs (redactado por patrón)               |
| **Regulada — Financiera**         | Datos de pagos                                  | Wompi `transactionId`, `amount`, `currency` (ya en nuestra DB); **NUNCA** PAN, CVV, expiración (Wompi maneja) | Postgres con RLS y audit log                                       | Sin PAN ni CVV. `last4` permitido si Wompi lo provee.  |

### Encriptación

- **En tránsito:** TLS 1.2+ obligatorio (Vercel default). HSTS forzando HTTPS.
- **En reposo (DB):** Supabase encripta a nivel disk. Para campos extra-sensibles: encriptación a nivel columna con `pgcrypto` cuando se justifique.
- **En reposo (Storage):** Supabase Storage encripta server-side. Cloudflare R2 también.
- **En reposo (backups):** el dump viaja cifrado **gpg simétrico AES256** (pipeline `pg_dump → gzip → gpg` en `apps/web/scripts/backup-db-to-r2.mjs`, passphrase por fd desde `BACKUP_GPG_PASSPHRASE`, A-3 — 2026-08-29) y el bucket R2 añade encriptación at-rest. El DR drill mensual (`dr-drill.mjs`) descifra y restaura, así que el cifrado queda cubierto por la prueba.

### Tabla maestra (mantener actualizada al agregar campos)

| Tabla.Campo                             | Clasificación                               | Notas                               |
| --------------------------------------- | ------------------------------------------- | ----------------------------------- |
| `Customer.email`                        | PII directa                                 | Hash SHA-256 cuando se loggea       |
| `Customer.phone`                        | PII directa                                 | Solo últimos 4 dígitos en logs      |
| `Customer.firstName/lastName`           | PII directa                                 | Iniciales solamente en logs         |
| `Address.line1/line2/city`              | PII directa                                 | Solo ciudad/depto en logs agregados |
| `Order.email/phone/shippingAddress`     | PII directa (snapshot)                      | Idem                                |
| `Order.wompiTransactionId`              | Regulada                                    | Loggeable para soporte              |
| `Order.total/subtotal/etc.`             | Interno                                     | Loggeable                           |
| `Review.images[]`                       | PII directa (URL apunta a foto del cliente) | Bucket privado + URL firmada        |
| `OrderItem.customDesign`                | PII directa (puede contener foto)           | Idem                                |
| `Customer.supabaseUserId`               | Interno                                     | OK loggear                          |
| `Customer.referralCode`                 | Interno                                     | OK loggear                          |
| `AdminActionLog.metadata`               | Interno (puede contener IDs de PII)         | Loggeable; depende de scope         |
| `WebhookEvent.payload`                  | Regulada (datos Wompi)                      | Acceso solo `service_role`          |
| `*Secret*`, `*Key*`, `*Token*` env vars | Crítica                                     | **NUNCA** logging                   |

---

## Cookie consent banner — implementación

> Categorización detallada en [`COMPLIANCE.md` § Cookie consent](./COMPLIANCE.md#cookie-consent-alineación-gdpr-voluntaria). Aquí el patrón de implementación.

### Componentes reales

- **`apps/web/components/cookies-banner.tsx`** — banner bottom-fixed que aparece en la primera visita (sin cookie persistida) con tres acciones: "Solo necesarias" / "Personalizar" (modal con 4 switches granulares) / "Aceptar todas". `<CookiesReopener>` permite reabrir el modal desde el footer legal y `/legal/cookies`. No se muestra dentro de `/admin`.
- **`apps/web/lib/cookie-consent.ts`** — helpers puros: cookie `cookie_consent_v1` (JSON encoded, 1 año, `SameSite=Lax`, `Secure` si HTTPS; client-readable a propósito para que futuros scripts de analytics la consulten), versión `v: 1` (cambio de versión ⇒ re-consent), y el evento custom `cookie-consent-changed` para que listeners reaccionen sin re-leer la cookie.
- **`apps/web/features/consent/`** — tras elegir, la Server Action `persistCookieConsentAction` registra **una fila por scope** en la tabla `Consent` (`COOKIES_NECESSARY` / `COOKIES_FUNCTIONAL` / `COOKIES_ANALYTICS` / `COOKIES_MARKETING`, con `accepted: true|false`, IP, user-agent y la versión del aviso de privacidad vigente vía el setting `PRIVACY_POLICY_VERSION`) — audit trail Ley 1581. Rate limit `consent_cookies` (30/min por IP) anti-ruido.

### Reglas

- **No bloquea el contenido** del sitio (no es modal centrado oscuro). Es banner inferior, dismissible.
- **No dark patterns:** "Solo necesarias" es tan visible como "Aceptar todas".
- **Persistencia:** cookie `cookie_consent_v1` + tabla `Consent` server-side (append-only: revocar crea fila nueva con `accepted=false` y `revokesId` apuntando a la anterior).
- **Re-consent:** si cambia la versión del banner (o el aviso de privacidad), vuelve a mostrarse.

### Carga condicional de scripts

Hoy **no hay scripts de analytics/marketing de terceros activos** (Vercel Analytics y pixels están apagados). Cuando se activen, la regla es: solo se cargan si la categoría correspondiente está ON en la cookie (leíble client-side precisamente para eso) o suscritos al evento `cookie-consent-changed`.

---

## Otros vectores cubiertos

> Sección "catch-all" para vectores que no merecen sección propia pero que el código debe contemplar.

### SSRF (Server-Side Request Forgery)

- **Riesgo:** un endpoint server-side que acepta URL del usuario y hace `fetch()` puede ser usado para escanear la red interna o llamar a la metadata API de la VM.
- **Mitigación:**
  - **No tenemos endpoints que acepten URL del usuario** en el plan actual. Si llegan a aparecer (ej. importar imagen desde URL): allowlist de dominios o bloquear rangos `127.0.0.0/8`, `10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16`, `169.254.0.0/16`.
  - El Estudio de Personalización solo acepta uploads de archivo (vía Server Action al servidor, que re-encodea con sharp), no URLs.

### Open redirects — IMPLEMENTADO (ADR-046)

- **Riesgo:** un parámetro `?next=...` o un destino de redirect admin sin validar puede llevar al usuario a
  un dominio malicioso (phishing con el dominio propio en la barra). Vectores clave: `//evil.com`
  (protocol-relative) y `/\evil.com` (backslash normalizado por el navegador) — **parecen internos** (empiezan
  con `/`) pero `new URL` los resuelve a host externo.
- **Implementación:** `apps/web/lib/safe-redirect.ts` con dos políticas (13 tests unitarios):
  - **`safeRedirectTarget(input, fallback="/")` — SOLO interno.** Para `?next=` de auth y similares. Exige un
    único `/` inicial (no `//`), sin `\`, sin control chars, y que resuelva al MISMO origen (`new URL`
    autoritativo). Cableado en el **login** (honra `?next=` sanitizado).
  - **`isAllowedRedirectDestination(input)` — interno O externo http(s):// EXPLÍCITO.** Para el **CMS de
    redirects admin** (`features/redirects/service.ts`), que por diseño permite apuntar a partners externos.
    Rechaza los disfrazados. Cableado en `createRedirect`/`updateRedirect` vía `assertAllowedToPath`.
- **Regla:** **nunca** redirect al valor crudo de un parámetro/formulario. Todo destino de redirect pasa por
  uno de estos dos validadores server-side (aunque el origen sea un hidden field manipulable).

```ts
// lib/safe-redirect.ts (resumen — ver fuente para el detalle)
export function safeRedirectTarget(input: string | null | undefined, fallback = "/"): string {
  return isSafeInternalPath(input) ? input.trim() : fallback; // solo paths internos seguros
}
// CMS admin: acepta http(s):// explícito O path interno; rechaza //evil.com y /\evil.com.
export function isAllowedRedirectDestination(input: unknown): input is string {
  /* ... */
}
```

### Honeypots en formularios públicos

- Campo `<input type="text" name="website" hidden tabindex="-1" autocomplete="off">` invisible para humanos.
- Si llega lleno → es bot → rechazar 200 silencioso (sin revelar el filtro).
- Complementa Turnstile: cero costo, atrapa bots tontos antes de llegar al CAPTCHA.

### Idempotencia en mutaciones de cliente

- **Riesgo:** doble click en "Pagar" crea dos órdenes.
- **Mitigación real (implementada):**
  - **Checkout:** idempotencia por `cartId` — un intento de pago Wompi abandonado reutiliza la orden `PENDING_PAYMENT` existente en vez de crear otra (`features/checkout/service.ts`).
  - **Webhooks:** dedup por `WebhookEvent @@unique([source, externalId])` (ver § Webhooks).
  - **Saga POST-PAID:** idempotencia física en el ledger (índice parcial unique `InventoryLog(orderId, reason, variantId)`) + claim atómico `Order.shipmentClaimedAt`.
- El patrón genérico header `Idempotency-Key` + tabla de respuestas cacheadas NO está implementado — agregarlo si aparece una mutación cliente sin clave natural de dedup.

### Pagination y límites de queries

- **Riesgo:** un cliente pide `?limit=1000000` y tumba el servidor.
- **Mitigación:**
  - Toda paginación tiene `limit` máximo enforced server-side: catálogo público ≤ 60 items/página, admin ≤ 200.
  - **Cursor-based pagination** preferida sobre offset (más eficiente, no se rompe con inserts concurrentes).
  - Endpoints `/api/*` que devuelven listas validan `take` y `skip` con Zod.

### Mass assignment

- **Riesgo:** cliente envía `{ "isAdmin": true }` en el body y el server hace `prisma.update({ data: req.body })`.
- **Mitigación:**
  - **Nunca pasar `req.body` directo a Prisma.** Siempre seleccionar explícitamente los campos permitidos tras validación con Zod.
  - Schemas Zod por endpoint con allowlist de campos (no usar `.passthrough()`).

### Modo mantenimiento

- Variable `NEXT_PUBLIC_MAINTENANCE_MODE=1` en Vercel env vars. Al ser `NEXT_PUBLIC_*` se inliniza en build: **no basta cambiarla, hay que redesplegar**.
- El proxy **redirige todo el tráfico público a `/maintenance`** cuando está activa. Excepciones: `/maintenance`, `/admin/*` (los admins siguen trabajando), `/api/health/*` (healthchecks externos) y assets `/_next`. No hay allowlist de IPs ni 503 — es redirect.
- Se activa antes de migraciones destructivas o despliegues riesgosos.

### Defensas contra enumeración

- **Nombres de archivo** en Storage: aleatorios (UUID), no secuenciales.
- **Números de orden** no secuenciales-reveladores en URLs de cliente (`/mi-cuenta/pedidos/[number]` tras auth; tracking de invitado en `/rastrear` con token hasheado en reposo — F-11). La URL no revela el volumen del negocio.
- **Mensajes de error** consistentes para "email no registrado" vs "password incorrecto" → no permiten enumeración de cuentas.

### Tiempo constante en comparaciones sensibles

- Comparar HMAC, tokens, hashes con `crypto.timingSafeEqual()` no con `===`. Previene timing attacks.

### Backup verification

- **Mensual y automático:** el workflow `dr-drill.yml` (GitHub Actions, día 2 de cada mes) descarga el backup cifrado más nuevo de R2, lo **descifra con gpg** y lo restaura en un Postgres limpio del runner, verificando conteos de tablas clave (ADR-059).
- Procedimiento manual documentado en `OPERATIONS.md`.
- **Alarma:** el backup corre **diario** (`backup.yml`); si el más reciente tiene más de 2 días, alertar (RPO ≤ 24 h).

### Disaster recovery (DR)

- **RPO (Recovery Point Objective):** ≤ 24 h (perder máximo 24 h de datos).
- **RTO (Recovery Time Objective):** ≤ 4 h (recuperar el sitio en máximo 4 h).
- **Plan:** documentado en `OPERATIONS.md` con pasos: restaurar Supabase desde PITR, redeploy en Vercel, repoblar Storage desde R2.

---

## Política de divulgación de vulnerabilidades

- Página pública `/legal/security` con email `seguridad@lucamsshop.com` (configurar en Resend al lanzar).
- **SLA inicial:** acuse de recibo en 72 h, fix de severidad alta en 7 días.
- **No bug bounty monetario** mientras el proyecto sea pequeño; sí reconocimiento público en `/legal/security/hall-of-fame`.

---

## Verificación end-to-end (criterio de Fase 7)

```bash
# Headers de seguridad presentes
curl -I https://lucamsshop.com | grep -i 'strict-transport\|x-frame\|content-security'

# RLS verificada contra el stack local
make test-rls

# Rate limit funciona (ruta pública de catálogo: 30/min por IP)
for i in {1..35}; do curl -s -o /dev/null -w '%{http_code}\n' https://lucamsshop.com/api/catalog/products; done
# Los intentos tras el 30 deben devolver 429

# Webhook con firma inválida es rechazado
curl -X POST https://lucamsshop.com/api/webhooks/wompi -d '{"fake":"payload"}' \
  -H "Content-Type: application/json"
# Esperado: 401

# Secret scanning del repo
gitleaks git --config .gitleaks.toml .

# Audit de dependencias (gate CI: solo producción, high+)
pnpm audit --prod --audit-level=high
```
