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
13. [Webhooks (Wompi, Venndelo)](#webhooks-wompi-venndelo)
14. [Audit logs](#audit-logs)
15. [Logging](#logging)
16. [PII y Habeas Data (Ley 1581)](#pii-y-habeas-data-ley-1581)
17. [Dependency scanning y supply chain](#dependency-scanning-y-supply-chain)
18. [CI/CD security](#cicd-security)
19. [Observabilidad de seguridad](#observabilidad-de-seguridad)
20. [Política de divulgación de vulnerabilidades](#política-de-divulgación-de-vulnerabilidades)

---

## Modelo de amenazas resumido

| Actor                 | Vector                                     | Mitigación principal                                                                                                               |
| --------------------- | ------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------- |
| Bot scraper           | Scraping de catálogo, abuso de `/api/ai/*` | Rate limit + Turnstile + cache                                                                                                     |
| Atacante con cuenta   | Acceso a datos de otros usuarios           | RLS + tests automatizados                                                                                                          |
| Atacante sin cuenta   | SQL injection, XSS, CSRF                   | Prisma + React + SameSite cookies + CSP                                                                                            |
| Insider (empleado)    | Abuso del admin                            | RBAC + audit log + 2FA                                                                                                             |
| Suplantador           | Webhook falso de Wompi/Venndelo            | HMAC verification + idempotencia                                                                                                   |
| Compromiso de secreto | Secret key (`sb_secret_*`) expuesta        | Rotación inmediata (Supabase permite múltiples secret keys, revocar la comprometida sin downtime) + nunca al cliente + .gitignored |
| Subida maliciosa      | Archivo con malware en storage             | Allowlist MIME + tamaño máximo + nombre aleatorio + render server                                                                  |
| Pago fraudulento      | Stolen card en checkout                    | Wompi 3DS + Turnstile + límites Wompi                                                                                              |

---

## Autenticación (Supabase Auth)

### Stack

- **Proveedor:** Supabase Auth (mandato #3).
- **Métodos en lanzamiento:** email + password con confirmación. Magic link como opción.
- **Después del lanzamiento (Fase 7+):** evaluar Google OAuth como tercer método.

### Cookies y sesiones

- **Cookies HttpOnly + Secure + `SameSite=Lax`** para los tokens de sesión.
- **TTL de access token:** 1 hora (default Supabase, no extender).
- **TTL de refresh token:** 30 días con rotación en cada uso.
- **Logout server-side** invalida la sesión en Supabase, no solo borra la cookie.
- **Inactividad:** sesión de admin expira tras 30 min sin actividad (revalidación forzada al volver).

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
  - El email se hashea con SHA-256 truncado a 16 chars antes de usar como key — no aparece en claro en `rate_limit_buckets`.
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

- **Para admins (rol `SUPERADMIN`/`MANAGER`): obligatorio** desde Fase 6. Supabase Auth soporta TOTP.
- **Para clientes: opcional**, ofrecida en `/cuenta/seguridad`.

### Verificación de email

- Registro requiere confirmación por email antes del primer login.
- Link de confirmación con TTL de 24h.

### Pendiente de verificación (mandato #9)

- [ ] Configuración exacta de TTL de access/refresh tokens en panel Supabase Free → `supabase.com/docs/guides/auth/sessions`.
- [ ] Política de contraseñas configurable en plan Free → `supabase.com/docs/guides/auth/password-security`.

---

## Autorización (RBAC + RLS)

### RBAC — modelo de roles

| Rol                           | Aplica a             | Permisos                                              |
| ----------------------------- | -------------------- | ----------------------------------------------------- |
| `customer` (default Supabase) | Clientes finales     | Leer/escribir sus propias órdenes, dirección, reseñas |
| `SUPERADMIN`                  | Operador del negocio | Todo el `/admin/*`                                    |
| `MANAGER`                     | Empleado de tienda   | Productos, inventario, órdenes, reseñas               |
| `FULFILLMENT`                 | Operador logístico   | Órdenes (cambio de estado, descarga PNG producción)   |

- Tabla `AdminUser` con `role` y `isActive`.
- Middleware en `app/middleware.ts` valida que `auth.uid()` esté en `AdminUser` con `isActive=true` y rol permitido para la ruta.
- **Defense in depth:** además del middleware, cada Server Action/API route verifica el rol explícitamente (no confiar solo en el middleware).

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

### Tests de RLS (criterio de aceptación de Fase 1)

```ts
// __tests__/rls.test.ts
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
   - **Wompi public key:** Wompi valida que las transacciones se generen desde dominios autorizados en su panel. Configurar `lucamsshop.co` y `*.vercel.app` en Wompi.
   - **Turnstile site key:** Cloudflare valida site key contra dominio. Configurar dominios permitidos en panel.
   - **Anthropic API key:** **NUNCA es pública.** Solo server-side. Llamar a `/api/ai/*` desde el cliente, nunca el cliente al endpoint de Anthropic directo.
3. **Las llaves privadas viven en `.env.local` (dev) y en Vercel env vars (prod).** Nunca commiteadas.
4. **Rotación documentada en `OPERATIONS.md`** (anual o tras compromiso sospechoso).
5. **Nunca loggear secretos.** Filtros en logger redactan claves que coincidan con patrones (`*KEY*`, `*SECRET*`, `*TOKEN*`).

### Inventario de claves

| Variable                                                    | Tipo                      | Visible en cliente | Doc oficial protección                                                                                                  |
| ----------------------------------------------------------- | ------------------------- | ------------------ | ----------------------------------------------------------------------------------------------------------------------- |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (`sb_publishable_*`) | Pública (RLS-protected)   | Sí                 | Mapea al rol Postgres `anon` · permisos limitados por RLS · whitelist de dominio en Supabase si se activa               |
| `NEXT_PUBLIC_SUPABASE_URL`                                  | Pública                   | Sí                 | —                                                                                                                       |
| `SUPABASE_SECRET_KEY` (`sb_secret_*`)                       | **PRIVADA — bypassa RLS** | **NO**             | Mapea al rol Postgres `service_role`. Solo server, gitignored. Múltiples secret keys soportadas (rotación sin downtime) |
| `NEXT_PUBLIC_WOMPI_PUBLIC_KEY`                              | Pública                   | Sí                 | Whitelist de dominio en panel Wompi                                                                                     |
| `WOMPI_PRIVATE_KEY`                                         | Privada                   | **NO**             | —                                                                                                                       |
| `WOMPI_INTEGRITY_SECRET`                                    | Privada                   | **NO**             | —                                                                                                                       |
| `WOMPI_EVENTS_SECRET`                                       | Privada (HMAC webhooks)   | **NO**             | —                                                                                                                       |
| `VENNDELO_API_KEY`                                          | Privada                   | **NO**             | —                                                                                                                       |
| `VENNDELO_WEBHOOK_SECRET`                                   | Privada (HMAC webhooks)   | **NO**             | —                                                                                                                       |
| `RESEND_API_KEY`                                            | Privada                   | **NO**             | —                                                                                                                       |
| `ANTHROPIC_API_KEY`                                         | Privada                   | **NO**             | Solo en `/api/ai/*` server                                                                                              |
| `NEXT_PUBLIC_TURNSTILE_SITE_KEY`                            | Pública                   | Sí                 | Whitelist de dominio en Cloudflare                                                                                      |
| `TURNSTILE_SECRET_KEY`                                      | Privada                   | **NO**             | Server-only para validación de token                                                                                    |
| `R2_*`                                                      | Privada                   | **NO**             | —                                                                                                                       |

### Detección automática de secretos

- **Pre-commit hook** con `gitleaks` o equivalente que escanea diff antes de permitir commit.
- **CI step** que escanea el repo completo en cada PR.
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

> Configurados en `apps/web/next.config.mjs` o middleware. Verificar después con `curl -I https://lucamsshop.co | grep -i 'security\|content-security\|frame'`.

### Set base (Fase 1)

| Header                      | Valor                                          | Por qué                                                  |
| --------------------------- | ---------------------------------------------- | -------------------------------------------------------- |
| `Strict-Transport-Security` | `max-age=63072000; includeSubDomains; preload` | Fuerza HTTPS por 2 años en navegadores que lo cachean    |
| `X-Frame-Options`           | `DENY`                                         | Previene clickjacking (no se embebe el sitio en iframes) |
| `X-Content-Type-Options`    | `nosniff`                                      | Previene MIME sniffing por el navegador                  |
| `Referrer-Policy`           | `strict-origin-when-cross-origin`              | Limita info referrer enviada a otros dominios            |
| `Permissions-Policy`        | `camera=(), microphone=(), geolocation=()`     | Niega APIs sensibles que no usamos                       |
| `X-DNS-Prefetch-Control`    | `on`                                           | Optimización menor para preconectar a CDN                |

### Content-Security-Policy (CSP) — implementada con nonce (C3, ADR-043)

Se construye **por request** en `apps/web/proxy.ts` (`buildCsp(nonce)`). **Dos modos:**

**Producción / preview** (`VERCEL_ENV` = production|preview) — `script-src` con **nonce + `strict-dynamic`** (sin `'unsafe-inline'` ni `'unsafe-eval'`):

```
default-src 'self';
script-src 'self' 'nonce-<aleatorio-por-request>' 'strict-dynamic' https://challenges.cloudflare.com https://checkout.wompi.co;
style-src 'self' 'unsafe-inline' https://fonts.googleapis.com;
img-src 'self' data: blob: https://*.supabase.co https://*.coordinadora.com;
font-src 'self' https://fonts.gstatic.com;
connect-src 'self' https://*.supabase.co https://api.venndelo.com https://api.anthropic.com https://api.wompi.co;
frame-src 'self' https://challenges.cloudflare.com https://checkout.wompi.co;
form-action 'self' https://checkout.wompi.co;
base-uri 'self';
object-src 'none';
upgrade-insecure-requests;
```

**Desarrollo** — `script-src 'self' 'unsafe-inline' 'unsafe-eval' …` (sin nonce). El dev server de Next inyecta scripts de HMR/overlay que con nonce se romperían; **el nonce se valida en un deploy prod-like**, no en dev.

**Cómo funciona el nonce** (guía oficial Next 16, `node_modules/next/dist/docs/01-app/02-guides/content-security-policy.md`):

- El proxy genera un nonce nuevo por request, lo pone en el **request header** `x-nonce` + `Content-Security-Policy`, y en el **response header**. Next lo extrae del CSP y lo aplica automáticamente a TODOS sus `<script>` (framework, bundles, inline) durante el SSR. Integrado con el flujo `getAll/setAll` de Supabase (`nextWithNonce()` clona los headers actuales → preserva cookies refrescadas).
- **`style-src` mantiene `'unsafe-inline'` a propósito:** los atributos `style=""` inline NO aceptan nonce (solo elementos `<style>`/`<script>`) → removerlo rompería toda la UI. El riesgo XSS por CSS es mucho menor que por script.
- **`'unsafe-eval'` solo en dev** (HMR + reconstrucción de stacks de React); en prod no se usa.

> ⚠️ **Regla de mantenimiento:** el nonce exige **render dinámico en toda página** — una página estática se prerenderea sin nonce y sus scripts quedan **bloqueados** en prod. La app ya es ~97% dinámica; las pocas estáticas llevan `export const dynamic = "force-dynamic"` (registro, recomendador, maintenance, recuperar-password, not-found). **Toda página nueva debe ser dinámica.** `/manifest.webmanifest` se deja estática (no tiene scripts).

**Verificación (prod-like).** Con `VERCEL_ENV=preview next start`, en cada request el nonce del header `Content-Security-Policy` debe coincidir con el de cada `<script nonce="…">` del HTML (0 scripts sin nonce). Verificado 2026-06-29 en home, registro, recomendador, maintenance, producto, admin/login, carrito, contacto, login. **GUI pendiente (Lucy):** recorrer storefront + estudio/canvas + checkout + Turnstile + admin en un deploy preview con la consola abierta buscando `Refused to execute … violates Content Security Policy`.

### Verificación

```bash
curl -I https://lucamsshop.co
# Esperado: ver todos los headers anteriores
```

Tests E2E (Playwright):

```ts
test("security headers present", async ({ request }) => {
  const response = await request.get("/");
  expect(response.headers()["strict-transport-security"]).toContain("max-age=63072000");
  expect(response.headers()["x-frame-options"]).toBe("DENY");
  expect(response.headers()["content-security-policy"]).toContain("default-src 'self'");
});
```

---

## CORS

### Política

- **Storefront público (`app/(storefront)/*`):** servido siempre desde el mismo origen → no requiere CORS.
- **API routes (`app/api/*`):** por defecto **bloquear cualquier origen distinto al sitio**. Solo abrir `Access-Control-Allow-Origin` para casos específicos justificados.
- **Webhooks (`/api/wompi/webhook`, `/api/venndelo/webhook`):** no usan CORS porque los llaman servidores, no navegadores. Validar firma + IP whitelist si la integración lo permite.

### Implementación

```ts
// apps/web/middleware.ts (fragmento)
const ALLOWED_ORIGINS = [
  "https://lucamsshop.co",
  /^https:\/\/.*\.vercel\.app$/, // Previews
  ...(process.env.NODE_ENV === "development" ? ["http://localhost:3000"] : []),
];

export function middleware(req: NextRequest) {
  const origin = req.headers.get("origin");
  const isApi = req.nextUrl.pathname.startsWith("/api/");
  if (!isApi || !origin) return NextResponse.next();

  const allowed = ALLOWED_ORIGINS.some((o) =>
    typeof o === "string" ? o === origin : o.test(origin),
  );
  if (!allowed) return new NextResponse("Forbidden", { status: 403 });

  const res = NextResponse.next();
  res.headers.set("Access-Control-Allow-Origin", origin);
  res.headers.set("Access-Control-Allow-Credentials", "true");
  res.headers.set("Vary", "Origin");
  return res;
}
```

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

```ts
// apps/web/lib/csrf.ts
import { createHash, randomBytes } from "crypto";

export function generateCsrfToken(sessionId: string): string {
  const salt = randomBytes(16).toString("hex");
  const hash = createHash("sha256")
    .update(`${sessionId}:${salt}:${process.env.CSRF_SECRET}`)
    .digest("hex");
  return `${salt}.${hash}`;
}

export function verifyCsrfToken(sessionId: string, token: string): boolean {
  const [salt, expected] = token.split(".");
  if (!salt || !expected) return false;
  const actual = createHash("sha256")
    .update(`${sessionId}:${salt}:${process.env.CSRF_SECRET}`)
    .digest("hex");
  return actual === expected;
}
```

---

## Rate limiting

### Modelo (ADR-016)

Rate limit en Postgres + `pg_cron` durante dev y arranque productivo. Migrar a Redis externo solo si métricas justifican (p95 > 50 ms o volumen real lo exige).

### Buckets y límites

| Endpoint                       | Clave                   | Límite        | Ventana | Razón                     |
| ------------------------------ | ----------------------- | ------------- | ------- | ------------------------- |
| `POST /api/ai/design-suggest`  | IP + cuenta autenticada | 20 / 5 min    | 5 min   | Costo Claude API          |
| `POST /api/checkout/create`    | IP                      | 10 / 10 min   | 10 min  | Anti-fraude               |
| `POST /auth/signup` (Supabase) | IP                      | 5 / 1 h       | 1 h     | Anti-bot                  |
| `POST /auth/login`             | IP + email              | 5 / 15 min    | 15 min  | Anti-brute force          |
| `POST /api/shipping/quote`     | IP                      | 60 / 1 min    | 1 min   | Genera tráfico a Venndelo |
| `POST /api/upload/sign`        | userId                  | 30 / 10 min   | 10 min  | Anti-DoS de storage       |
| Webhooks Wompi/Venndelo        | externalId              | 1 / siempre   | —       | Idempotencia (`@@unique`) |
| Storefront público (lectura)   | IP                      | 1.000 / 1 min | 1 min   | Anti-scraper agresivo     |

### Implementación

```ts
// lib/rate-limit.ts
import { supabaseAdmin } from "./supabase/service";

export async function rateLimit(
  key: string,
  limit: number,
  windowSec: number,
): Promise<{ allowed: boolean; remaining: number; resetAt: Date }> {
  const { data, error } = await supabaseAdmin.rpc("rate_limit_increment", {
    p_key: key,
    p_limit: limit,
    p_window_sec: windowSec,
  });
  if (error) throw error;
  return data;
}
```

```sql
-- supabase/migrations/00000000000002_rate_limit_function.sql
CREATE OR REPLACE FUNCTION public.rate_limit_increment(
  p_key TEXT,
  p_limit INT,
  p_window_sec INT
) RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE
  v_now TIMESTAMPTZ := NOW();
  v_count INT;
  v_window_start TIMESTAMPTZ;
BEGIN
  INSERT INTO public.rate_limit_buckets (key, count, window_start)
  VALUES (p_key, 1, v_now)
  ON CONFLICT (key) DO UPDATE SET
    count = CASE
      WHEN public.rate_limit_buckets.window_start < v_now - (p_window_sec || ' seconds')::INTERVAL
      THEN 1
      ELSE public.rate_limit_buckets.count + 1
    END,
    window_start = CASE
      WHEN public.rate_limit_buckets.window_start < v_now - (p_window_sec || ' seconds')::INTERVAL
      THEN v_now
      ELSE public.rate_limit_buckets.window_start
    END
  RETURNING count, window_start INTO v_count, v_window_start;

  RETURN jsonb_build_object(
    'allowed', v_count <= p_limit,
    'remaining', GREATEST(p_limit - v_count, 0),
    'resetAt', v_window_start + (p_window_sec || ' seconds')::INTERVAL
  );
END;
$$;
```

### Headers de respuesta

```
HTTP/1.1 429 Too Many Requests
X-RateLimit-Limit: 20
X-RateLimit-Remaining: 0
X-RateLimit-Reset: 1746792000
Retry-After: 120
```

---

## Validación de input

### Reglas

- **Toda entrada externa se valida con Zod** antes de tocar lógica de negocio.
- **Esquemas reutilizables** en `lib/validation/`, importables por client y server.
- **Mensajes de error en español** y sin filtrar detalles internos.
- **Whitelist, no blacklist:** definir qué se acepta, no qué se bloquea.

### Patrón

```ts
// lib/validation/checkout.ts
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
// app/api/checkout/create/route.ts
export async function POST(req: Request) {
  const parsed = CheckoutPayloadSchema.safeParse(await req.json());
  if (!parsed.success) {
    return Response.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  // Continuar solo con datos validados
}
```

### Sanitización

- **HTML user-generated** (reseñas, blog comments si los hay): sanitizar con `isomorphic-dompurify` antes de almacenar O renderizar como texto plano.
- **Markdown user-generated:** parsear con `remark` y allowlist de elementos.
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

| Recurso                               | TTL               | Mecanismo                               |
| ------------------------------------- | ----------------- | --------------------------------------- |
| Access token Supabase                 | 1 h               | Auto-rotation con refresh token         |
| Refresh token Supabase                | 30 días           | Rotation en cada uso                    |
| Session cookie del admin              | 30 min idle       | Middleware revalida                     |
| Reset password link                   | 1 h               | Token firmado con secret + expiración   |
| Email confirmation link               | 24 h              | Idem                                    |
| Reserva de stock (`StockReservation`) | 15 min            | `pg_cron` cleanup cada minuto (ADR-014) |
| Cache de respuestas IA                | 24 h              | `cache_entries.expires_at` + `pg_cron`  |
| Cache de cotizaciones Venndelo        | 5 min             | Idem                                    |
| Rate limit windows                    | 1 h               | `pg_cron` cleanup                       |
| URL firmada `customer-uploads`        | 1 h               | Supabase Storage signed URL             |
| URL firmada `production-assets`       | 15 min            | Idem (acceso solo admin)                |
| Webhook events archivados             | 90 días           | Cleanup manual o `pg_cron`              |
| Audit logs admin                      | 2 años            | Política legal                          |
| Backups en R2                         | 1 año (semanales) | Lifecycle rule en bucket                |

---

## File upload y Storage

### Buckets

Definidos en [`ARCHITECTURE.md` § Storage](./ARCHITECTURE.md#storage-supabase).

### Flujo de upload del estudio de personalización

1. Cliente solicita signed URL: `POST /api/upload/sign` con `{ fileName, mimeType, sizeBytes }`.
2. Server valida:
   - MIME type en allowlist: `image/jpeg`, `image/png`, `image/webp`, `image/heic`.
   - Tamaño ≤ 10 MB.
   - Rate limit por usuario (30 uploads / 10 min).
3. Server genera nombre aleatorio (`pgcrypto.gen_random_uuid()`) y devuelve URL firmada con TTL 1h.
4. Cliente sube directo a Supabase Storage.
5. Después del upload, server valida MIME real con `file-type` package (no confiar en extensión ni Content-Type del cliente).
6. Si falla validación post-upload: borrar el archivo y rechazar.

### Antivirus / detección de contenido

- **Fase 1:** validación MIME + tamaño + extensión.
- **Fase 7+ (al lanzar):** evaluar VirusTotal API o ClamAV en una Edge Function pre-procesamiento si el volumen lo justifica. Por ahora: confiar en allowlist + Supabase Storage no ejecuta archivos.

### EXIF stripping

- Imágenes que el cliente sube pueden tener metadata GPS y otra info sensible.
- **Stripping automático** server-side antes de mover a `production-assets`. Usar `sharp` con `.withMetadata({ exif: undefined })`.

---

## Webhooks (Wompi, Aveonline)

> Estado implementado (Bloque A, certificado 2026-06-27). Secrets de webhook:
> `WOMPI_EVENTS_SECRET` (HMAC eventos Wompi) y `AVEONLINE_WEBHOOK_SECRET` (firma de
> los `tracking.updated` de Aveonline). Ambos son privados, solo en `.env*`
> gitignored, nunca en cliente.

### Verificación de firma

- **Wompi:** `verifyWebhookSignature` (`apps/web/lib/wompi.ts`) verifica
  `signature.checksum` con HMAC-SHA256 del concatenado de propiedades + timestamp +
  `WOMPI_EVENTS_SECRET`, comparado **timing-safe** (`crypto.timingSafeEqual`) tras
  validar que checksum/properties/timestamp existan (detalle en
  [`INTEGRATIONS.md` § Wompi](./INTEGRATIONS.md#1-wompi-pasarela-de-pago--proveedor-principal)).
- **Aveonline:** el webhook `/api/webhooks/aveonline` valida `AVEONLINE_WEBHOOK_SECRET`.
- **Rechazo HTTP 401** si la firma no coincide. **No revelar la razón** al cliente.

### Idempotencia

- Tabla `WebhookEvent(@@unique([source, externalId]))`. El `externalId` de Wompi es
  `${transaction.id}-${status}-${timestamp}` → un retry real de Wompi (mismo
  timestamp firmado) produce el mismo key y se deduplica.
- Si ya estaba `processedAt`, devolver 200 sin re-procesar.
- La saga POST-PAID tiene además idempotencia física en el ledger (índice parcial
  unique `InventoryLog(orderId, reason, variantId)`) + claim atómico de creación de
  guía (`Order.shipmentClaimedAt`) — ver `docs/audits/2026-06-26-certify-bloque-a/`.

### Replay protection (implementado, P1-011)

- **Ventana ±5 min** sobre `event.timestamp` (acepta drift de reloj razonable).
  Fuera de ventana → 401. `WOMPI_DISABLE_TIMESTAMP_CHECK=true` solo para tests locales.
- **Environment match**: el webhook exige que `event.environment` coincida con
  `WOMPI_ENV` (no `NODE_ENV` — evita falsos 401 en Vercel preview). Un webhook
  "prod" no se procesa en sandbox y viceversa.

### Whitelist de IPs (cuando la integración lo permite)

- Wompi y Aveonline publican rangos de IPs salientes. Validar a nivel middleware o
  Cloudflare WAF (pendiente — la firma HMAC es la defensa primaria actual).

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
- Generación de export de datos.

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
  "route": "/api/checkout/create",
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

Implementar en logger global con función `redact(payload, fields)`.

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
| IP                      | Logs / rate limit   | Seguridad, prevención de fraude                      | 90 días                                        |

### Derechos del titular (Ley 1581)

Página `/cuenta/privacidad` permite al cliente:

- Ver sus datos almacenados.
- Solicitar corrección.
- Solicitar exportación (`GET /api/me/export` genera ZIP con JSON + imágenes).
- Solicitar eliminación de cuenta (`DELETE /api/me/account`).

**Eliminación de cuenta:**

- Soft-delete inmediato (`Customer.deletedAt`).
- Pasados 30 días: hard-delete de PII directa (email, phone, name → `[deleted-user]`), preservar datos transaccionales anonimizados (`Order` queda pero sin nombre/email del cliente).
- Logs y backups: PII se purga en próximos ciclos de cleanup.

### Política y términos

- **Política de privacidad** publicada en `/legal/privacidad` antes del lanzamiento (ADR-020 abierto: ¿plantilla nuestra o abogado?).
- **Términos y condiciones** publicados en `/legal/terminos`.
- **Política de cookies** publicada en `/legal/cookies`. Banner de consentimiento al primer visit (mínimo, no anti-UX).
- **Habeas Data:** formulario en `/legal/habeas-data` para solicitudes formales.

---

## Dependency scanning y supply chain

### Reglas

1. **`pnpm-lock.yaml`** versionado, integridad sub-resource verificada.
2. **`pnpm audit`** corre en CI en cada PR.
3. **Renovate o Dependabot** automatiza PRs de actualización.
4. **`pnpm dlx` para tooling de un solo uso** (no agregar a deps si solo es script).
5. **Allowlist de licencias** verificada con `license-checker` — bloquear GPL/AGPL en código propietario.
6. **No usar paquetes con < 30 días en npm** (evita typosquatting reciente).

### Auditoría manual antes de cada release

- Revisar `pnpm outdated` — actualizar minor/patch agresivo, major con due diligence.
- Verificar Renovate dashboards.
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
4. `pnpm test` (Vitest)
5. `pnpm test:e2e` (Playwright en environment de preview)
6. `pnpm audit --audit-level=high` (falla si vulnerabilidad alta)
7. Secret scanning (gitleaks)
8. License check (license-checker)
9. Lighthouse CI sobre preview (después de merge a una rama de feature)

---

## Observabilidad de seguridad

> Mandato #7: sin Sentry hasta Fase 7. Mientras tanto:

- **Vercel Logs** con grep manual.
- **Supabase Auth dashboard** muestra intentos fallidos de login, sign-ups, etc.
- **Tabla `AdminActionLog`** auditable desde `/admin/audit`.
- **Healthchecks** públicos en `/api/health/*`.
- **Alertas básicas** vía Resend cuando:
  - 5+ errores 500 en 5 min en una ruta.
  - Webhook handler falla > 3 veces consecutivas.
  - Rate limit hits > 100/min sostenido (posible ataque).
  - Reserva de stock falla por concurrencia inesperada.

Decisión definitiva de observabilidad de errores: ADR-022 abierto en Fase 7.

---

## Threat model formal (STRIDE)

> Verificado contra [Microsoft Learn — Threat Modeling Tool: Threats](https://learn.microsoft.com/en-us/azure/security/develop/threat-modeling-tool-threats) a 2026-05-09. STRIDE es el framework de Microsoft SDL para clasificar amenazas. Se aplica a cada flujo crítico del sistema.

### Las 6 categorías STRIDE

| Letra | Categoría              | Definición (cita textual del doc oficial)                                                       | Mitigación principal en Lucams_shop                                                                  |
| ----- | ---------------------- | ----------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| **S** | Spoofing               | _"illegally accessing and then using another user's authentication information"_                | Supabase Auth + MFA admin + cookies HttpOnly+Secure+SameSite=Lax                                     |
| **T** | Tampering              | _"malicious modification of data... unauthorized changes... alteration of data as it flows"_    | RLS + HTTPS + HMAC en webhooks + integridad Wompi (`WOMPI_INTEGRITY_SECRET`)                         |
| **R** | Repudiation            | _"users who deny performing an action without other parties having any way to prove otherwise"_ | `AdminActionLog` + logs estructurados con `requestId` + `WebhookEvent` con timestamp                 |
| **I** | Information Disclosure | _"exposure of information to individuals who are not supposed to have access to it"_            | RLS + service_role solo server-side + redact PII en logs + URL firmada con TTL                       |
| **D** | Denial of Service      | _"deny service to valid users... making a Web server temporarily unavailable"_                  | Rate limit + Turnstile + Cloudflare DDoS protection + circuit breakers                               |
| **E** | Elevation of Privilege | _"unprivileged user gains privileged access"_                                                   | RBAC (`AdminUser.role`) + middleware `/admin/*` + tests RLS automáticos + mass assignment prevention |

### Aplicación por flujo crítico

#### Flujo 1: Registro y login

| Vector STRIDE          | Amenaza concreta                                  | Mitigación                                                                     |
| ---------------------- | ------------------------------------------------- | ------------------------------------------------------------------------------ |
| Spoofing               | Atacante usa email/password robado                | Bloqueo tras 5 fallos en 15 min · MFA opcional cliente · MFA obligatorio admin |
| Tampering              | Reset password link interceptado                  | TTL 1h · token firmado · email envío via Resend con DKIM                       |
| Repudiation            | Usuario niega haber registrado la cuenta          | `Consent` con `acceptedAt`, `ip`, `userAgent` versionado                       |
| Information Disclosure | Mensaje "email no registrado" permite enumeración | Mensaje genérico "credenciales inválidas" en login fail                        |
| Denial of Service      | Bot crea 1000 cuentas/min                         | Rate limit `auth.signup` 5/h por IP + Turnstile                                |
| Elevation of Privilege | Usuario edita rol vía mass assignment             | Schemas Zod sin `role` en payloads de cliente; `role` solo desde panel admin   |

#### Flujo 2: Checkout + pago Wompi

| Vector STRIDE          | Amenaza                                                | Mitigación                                                                                |
| ---------------------- | ------------------------------------------------------ | ----------------------------------------------------------------------------------------- |
| Spoofing               | Webhook falso simulando Wompi                          | HMAC verification con `WOMPI_EVENTS_SECRET` + IP whitelist                                |
| Tampering              | Modificar `amount` entre cliente y servidor            | Servidor recalcula totales desde DB · firma de integridad Wompi                           |
| Repudiation            | Cliente niega haber autorizado                         | Wompi 3DS (challenge ante banco emisor) + `WebhookEvent` con payload completo             |
| Information Disclosure | PCI: tarjeta queda en logs                             | Wompi maneja tarjetas, nunca tocan nuestro server · logger con redact                     |
| Denial of Service      | Bot llena `Order` con `PENDING_PAYMENT` que nunca paga | Rate limit `/api/checkout/create` 10/10min · TTL 15min en `StockReservation` libera stock |
| Elevation of Privilege | Cambiar `paymentMethod=COD` para no pagar              | Validación server-side; COD requiere validación adicional + dirección verificada          |

#### Flujo 3: Estudio de Personalización (upload)

| Vector STRIDE          | Amenaza                                               | Mitigación                                                                     |
| ---------------------- | ----------------------------------------------------- | ------------------------------------------------------------------------------ |
| Spoofing               | URL firmada de otro usuario                           | `auth.uid()` validado en `/api/upload/sign`; URL contiene userId hash          |
| Tampering              | Subir archivo distinto al validado                    | Validación MIME + tamaño en server post-upload (no confiar en cliente)         |
| Repudiation            | "Yo no sube esa imagen"                               | `customer-uploads` bucket con metadata `uploadedBy=userId`                     |
| Information Disclosure | Acceso a fotos de otros clientes                      | Bucket privado · URL firmada TTL 1h · enumeración prevenida (UUID en filename) |
| Denial of Service      | 1000 uploads de 10MB c/u en 1 min                     | Rate limit 30/10min por usuario + tamaño máximo 10MB                           |
| Elevation of Privilege | Cliente lee `production-assets` (privado, solo admin) | RLS bucket-level; URL firmada solo se genera en endpoints admin con role check |

#### Flujo 4: Background jobs (pgmq)

| Vector STRIDE          | Amenaza                                         | Mitigación                                                                                    |
| ---------------------- | ----------------------------------------------- | --------------------------------------------------------------------------------------------- |
| Spoofing               | Cliente envía mensaje a `pgmq` directo          | Acceso a `pgmq.*` solo con `service_role`; RLS bloquea anon                                   |
| Tampering              | Mensaje en cola modificado                      | `pgmq` corre dentro de Postgres; modificar requiere acceso DB                                 |
| Repudiation            | Job ejecutado pero "nadie sabe quién lo encoló" | Mensajes incluyen `requestId` y `enqueuedBy` para auditoría                                   |
| Information Disclosure | Mensajes de email queue contienen PII           | Mensajes en cola con `customerId` (no email completo); consumer hace fetch al procesar        |
| Denial of Service      | Cola crece indefinidamente                      | Cleanup vía `pg_cron`; alerta si lag > 30 min                                                 |
| Elevation of Privilege | Consumer ejecutado con permisos elevados        | Edge Functions con `service_role` solo para operaciones explícitas; resto vía cliente con RLS |

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
- Reporte externo: `seguridad@lucamsshop.co` o `/legal/security`.
- Dashboard `/admin/observability` con anomalías.

#### 3. Contención

| Tipo de incidente                                        | Acción inmediata                                                               |
| -------------------------------------------------------- | ------------------------------------------------------------------------------ |
| Credencial comprometida (API key)                        | Rotar inmediatamente en panel del vendor + redeploy                            |
| Cuenta admin comprometida                                | Suspender desde panel Supabase Auth + invalidar sesiones                       |
| Webhook flooding (signature válida pero tráfico anómalo) | Cloudflare WAF rule temporal + alertar a Wompi/Venndelo                        |
| Sitio bajo DDoS                                          | Cloudflare "Under Attack" mode + IP whitelist solo admin                       |
| Dato sensible expuesto en logs                           | Borrar de Vercel Logs (si retención lo permite) + rotar credenciales si aplica |
| Database corrupted                                       | Modo mantenimiento (`MAINTENANCE_MODE=true`) + restore desde PITR              |
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
- Logs en producción (mitigado por `pino` redact).
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

1. Verificar /admin/observability/webhooks: ratio fail/success.
2. Si fails > 50%, verificar:
   - ¿Cambió `WOMPI_EVENTS_SECRET` recientemente? Verificar contra panel Wompi.
   - ¿Wompi cambió formato de signature? Revisar docs.wompi.co/changelog.
3. Si tráfico válido pero excesivo: Cloudflare WAF rate limit temporal en /api/wompi/webhook.
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

| Nivel                             | Definición                                      | Ejemplos en Lucams_shop                                                                                       | Almacenamiento permitido                                           | Logging                                               |
| --------------------------------- | ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ | ----------------------------------------------------- |
| **Público**                       | Información destinada a ser visible en internet | Catálogo de productos, blog, paleta de colores                                                                | Cualquier capa                                                     | OK loggear                                            |
| **Interno**                       | No sensible pero solo para el equipo            | Métricas agregadas, schema de DB, métricas pgmq                                                               | Server-side, accesible a admins                                    | OK loggear                                            |
| **Confidencial — PII directa**    | Identifica a una persona                        | Email, teléfono, nombre, dirección, foto del estudio                                                          | Postgres con RLS, Storage privado, encriptado en tránsito y reposo | **Redactado** en logs (`pino` redact)                 |
| **Restringida — PII sensible**    | Datos especialmente protegidos por Ley 1581     | Solo si recolectamos: salud, biometría, ideología, etc. (no aplica hoy)                                       | Encriptación a nivel campo + acceso auditado                       | **Nunca** en logs                                     |
| **Crítica — Secretos de sistema** | Llaves, tokens, credenciales                    | `SUPABASE_SECRET_KEY` (`sb_secret_*`), `WOMPI_PRIVATE_KEY`, `ANTHROPIC_API_KEY`, `CSRF_SECRET`                | Solo en `.env*` (gitignored) y Vercel env vars                     | **Nunca** en logs (redactado por patrón)              |
| **Regulada — Financiera**         | Datos de pagos                                  | Wompi `transactionId`, `amount`, `currency` (ya en nuestra DB); **NUNCA** PAN, CVV, expiración (Wompi maneja) | Postgres con RLS y audit log                                       | Sin PAN ni CVV. `last4` permitido si Wompi lo provee. |

### Encriptación

- **En tránsito:** TLS 1.2+ obligatorio (Vercel default). HSTS forzando HTTPS.
- **En reposo (DB):** Supabase encripta a nivel disk. Para campos extra-sensibles: encriptación a nivel columna con `pgcrypto` cuando se justifique.
- **En reposo (Storage):** Supabase Storage encripta server-side. Cloudflare R2 también.
- **En reposo (backups):** R2 con encriptación at-rest.

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

### Componente

```tsx
// components/storefront/cookie-consent.tsx
"use client";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { recordConsent } from "@/features/consent/server-actions";

const VERSION = "v1.0-2026-05-09";

type Categories = {
  necessary: true; // No editable
  functional: boolean;
  analytics: boolean;
  marketing: boolean;
};

export function CookieConsent() {
  const [shown, setShown] = useState(false);
  const [categories, setCategories] = useState<Categories>({
    necessary: true,
    functional: true,
    analytics: false,
    marketing: false,
  });

  useEffect(() => {
    const stored = localStorage.getItem("__lc_consent");
    if (!stored || JSON.parse(stored).version !== VERSION) setShown(true);
  }, []);

  async function save(cats: Categories) {
    const payload = { ...cats, version: VERSION, acceptedAt: new Date().toISOString() };
    localStorage.setItem("__lc_consent", JSON.stringify(payload));
    document.cookie = `__lc_consent=${VERSION}; max-age=31536000; path=/; samesite=lax; secure`;
    await recordConsent(payload); // Server-side: tabla Consent
    setShown(false);
  }

  if (!shown) return null;

  return (
    <div
      role="dialog"
      aria-labelledby="cc-title"
      aria-describedby="cc-desc"
      className="bg-brand-cream border-brand-purple-dark fixed right-4 bottom-4 left-4 z-50 rounded-lg border-2 p-4 shadow-lg md:left-auto md:max-w-md"
    >
      <h2 id="cc-title" className="font-display text-brand-purple-dark text-lg">
        ¡Hola! Usamos cookies 🍪
      </h2>
      <p id="cc-desc" className="mt-2 text-sm">
        Las necesarias hacen funcionar el sitio. Las demás son opcionales y nos ayudan a mejorarlo.
        Puedes cambiar tu elección en cualquier momento desde{" "}
        <a href="/legal/cookies" className="underline">
          configuración de cookies
        </a>
        .
      </p>
      {/* Switches por categoría */}
      <div className="mt-3 space-y-2">
        <label>
          <input type="checkbox" checked disabled /> Necesarias (siempre)
        </label>
        <label>
          <input
            type="checkbox"
            checked={categories.functional}
            onChange={(e) => setCategories({ ...categories, functional: e.target.checked })}
          />{" "}
          Funcionales
        </label>
        <label>
          <input
            type="checkbox"
            checked={categories.analytics}
            onChange={(e) => setCategories({ ...categories, analytics: e.target.checked })}
          />{" "}
          Analíticas
        </label>
        <label>
          <input
            type="checkbox"
            checked={categories.marketing}
            onChange={(e) => setCategories({ ...categories, marketing: e.target.checked })}
          />{" "}
          Marketing
        </label>
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        <Button
          onClick={() =>
            save({ necessary: true, functional: false, analytics: false, marketing: false })
          }
        >
          Solo necesarias
        </Button>
        <Button variant="outline" onClick={() => save(categories)}>
          Guardar elección
        </Button>
        <Button
          onClick={() =>
            save({ necessary: true, functional: true, analytics: true, marketing: true })
          }
        >
          Aceptar todas
        </Button>
      </div>
    </div>
  );
}
```

### Reglas

- **No bloquea el contenido** del sitio (no es modal centrado oscuro). Es banner inferior, dismissible.
- **No dark patterns:** "Solo necesarias" es tan visible como "Aceptar todas".
- **Persistencia:** localStorage + cookie + tabla `Consent` server-side.
- **Re-consent:** si cambia `VERSION`, vuelve a mostrarse.
- **Server enforcement:** scripts de analytics/marketing no se cargan si la categoría está OFF (ver siguiente).

### Carga condicional de scripts

```tsx
// app/(storefront)/layout.tsx (fragmento)
import { headers } from "next/headers";
import Script from "next/script";

export default async function Layout({ children }) {
  const consentCookie = (await headers()).get("cookie")?.match(/__lc_consent=([^;]+)/)?.[1];
  const consent = consentCookie ? JSON.parse(decodeURIComponent(consentCookie)) : null;

  return (
    <>
      {children}
      {consent?.analytics && <Script src="/analytics.js" strategy="lazyOnload" />}
      {consent?.marketing && <Script src="https://example.com/pixel.js" strategy="lazyOnload" />}
    </>
  );
}
```

---

## Otros vectores cubiertos

> Sección "catch-all" para vectores que no merecen sección propia pero que el código debe contemplar.

### SSRF (Server-Side Request Forgery)

- **Riesgo:** un endpoint server-side que acepta URL del usuario y hace `fetch()` puede ser usado para escanear la red interna o llamar a la metadata API de la VM.
- **Mitigación:**
  - **No tenemos endpoints que acepten URL del usuario** en el plan actual. Si llegan a aparecer (ej. importar imagen desde URL): allowlist de dominios o bloquear rangos `127.0.0.0/8`, `10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16`, `169.254.0.0/16`.
  - El Estudio de Personalización solo acepta uploads directos a Supabase Storage, no URLs.

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

### Idempotency keys para mutaciones de cliente

- **Riesgo:** doble click en "Pagar" crea dos órdenes.
- **Mitigación:**
  - Cliente envía header `Idempotency-Key: <uuid>` en mutaciones críticas (`POST /api/checkout/create`).
  - Server guarda `(idempotencyKey, response)` en cache por 24 h. Si llega repetido, devuelve la respuesta cacheada.
  - Tabla `IdempotencyKeys(key, requestHash, response, expiresAt)` con limpieza vía `pg_cron`.

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

- Variable `MAINTENANCE_MODE=true` en Vercel env vars.
- Middleware que devuelve `503` con HTML estático cuando está activa, excepto para IPs allowlisted (admin) y `/api/health`.
- Se activa antes de migraciones destructivas o despliegues riesgosos.

### Defensas contra enumeración

- **Nombres de archivo** en Storage: aleatorios (UUID), no secuenciales.
- **IDs de orden públicos** (en `/orden/[id]`): cuid, no secuenciales numéricos. La URL no revela el volumen del negocio.
- **Mensajes de error** consistentes para "email no registrado" vs "password incorrecto" → no permiten enumeración de cuentas.

### Tiempo constante en comparaciones sensibles

- Comparar HMAC, tokens, hashes con `crypto.timingSafeEqual()` no con `===`. Previene timing attacks.

### Backup verification

- **Cada trimestre:** restaurar el último backup en un environment de prueba y verificar integridad.
- **Documentar el procedimiento** en `OPERATIONS.md` cuando se ejecute la primera prueba.
- **Alarma:** si el backup más reciente tiene más de 8 días, alertar.

### Disaster recovery (DR)

- **RPO (Recovery Point Objective):** ≤ 24 h (perder máximo 24 h de datos).
- **RTO (Recovery Time Objective):** ≤ 4 h (recuperar el sitio en máximo 4 h).
- **Plan:** documentado en `OPERATIONS.md` con pasos: restaurar Supabase desde PITR, redeploy en Vercel, repoblar Storage desde R2.

---

## Política de divulgación de vulnerabilidades

- Página pública `/legal/security` con email `seguridad@lucamsshop.co` (configurar en Resend al lanzar).
- **SLA inicial:** acuse de recibo en 72 h, fix de severidad alta en 7 días.
- **No bug bounty monetario** mientras el proyecto sea pequeño; sí reconocimiento público en `/legal/security/hall-of-fame`.

---

## Verificación end-to-end (criterio de Fase 7)

```bash
# Headers de seguridad presentes
curl -I https://lucamsshop.co | grep -i 'strict-transport\|x-frame\|content-security'

# RLS verificada con cliente impostor
pnpm test:rls

# Rate limit funciona
for i in {1..30}; do curl -X POST https://lucamsshop.co/api/ai/design-suggest; done
# El intento ~21 debe devolver 429

# Webhook con firma inválida es rechazado
curl -X POST https://lucamsshop.co/api/wompi/webhook -d '{"fake":"payload"}' \
  -H "Content-Type: application/json"
# Esperado: 401

# Secret scanning del repo
gitleaks detect --source . --verbose

# Audit de dependencias
pnpm audit --audit-level=high
```
