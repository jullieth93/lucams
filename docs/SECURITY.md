# Seguridad — Lucams Shop

> **Documento vivo (Nivel 1).** Especificación completa y verificada contra el código real de la arquitectura de seguridad de Lucams Shop: modelo de amenazas (OWASP Top 10 + STRIDE), sesiones endurecidas, autenticación de clientes e invitados, RBAC/MFA del panel administrativo, invariantes del grafo de identidad CRM, manejo de secretos y reglas para agentes IA, cabeceras HTTP/CSP/CORS/CSRF, aislamiento RLS y funciones endurecidas en Postgres, rate limiting, Cloudflare Turnstile, subida de imágenes y Storage, webhooks, clasificación de datos/PII, supply chain/CI y respuesta formal a incidentes (IRP).
>
> **Documentos relacionados:** [`ARCHITECTURE.md`](ARCHITECTURE.md) · [`COMPLIANCE.md`](COMPLIANCE.md) · [`OBSERVABILITY.md`](OBSERVABILITY.md) · [`OPERATIONS.md`](OPERATIONS.md) · [`CONVENTIONS.md`](CONVENTIONS.md) · [`domains/crm-b2b-and-loyalty.md`](domains/crm-b2b-and-loyalty.md) · [`integrations/supabase.md`](integrations/supabase.md) · [`integrations/cloudflare.md`](integrations/cloudflare.md) · [`integrations/wompi.md`](integrations/wompi.md) · [`integrations/aveonline.md`](integrations/aveonline.md)

---

## 1. Principios rectores

1. **Defensa en profundidad:** ninguna barrera actúa sola. El acceso administrativo combina redirección en borde (`apps/web/proxy.ts`), validación en layout, guardas por Server Action/Route Handler (`apps/web/lib/admin-rbac-guard.ts`), MFA TOTP obligatorio (`aal2`), re-autenticación reciente (`requireRecentMfa`) y RLS estricto en Postgres.
2. **Fail-closed en producción:** ante ausencia de secretos críticos (`validateEnv()` en `apps/web/lib/env.ts`), marcas de inactividad administrativa faltantes o inválidas, retos anti-bot fallidos en producción o valores fuera de rango, el sistema rechaza la operación. La única excepción deliberada y documentada es la consulta externa a Have I Been Pwned (`lib/pwned-passwords.ts`), que opera _fail-open_ con timeout corto (`3 000 ms`) para que una caída de un tercero externo no bloquee el registro de clientes.
3. **Menor privilegio:** 8 roles administrativos con 35 capacidades granulares, enmascaramiento server-side de PII antes de serializar React Server Components (RSC), buckets sensibles privados y revocación total de permisos de tabla para los roles `anon`, `authenticated` y `service_role` en el esquema `public`.
4. **Cero confianza en el cliente:** precios, descuentos, fletes, elegibilidad de cupones, Puntos Lucams, autorizaciones y firmas se calculan o verifican exclusivamente en el servidor con aritmética entera en centavos COP (`Int`).
5. **Privacidad por diseño:** ninguna foto ni dato personal viaja a Google Gemini, Google Analytics 4 no se carga sin consentimiento previo en la categoría **Analíticas**, las direcciones IP en rate limiting y telemetría de seguridad se almacenan truncadas en hash SHA-256 y los tokens de acceso público se guardan únicamente como digest SHA-256.

---

## 2. Modelo de amenazas, OWASP Top 10 y análisis formal STRIDE

### 2.1 Amenazas principales y controles mitigantes

| Amenaza                                                       | Superficie objetivo                                                                                 | Controles activos en código                                                                                                                                                                                                                                                                           |
| ------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Toma de cuenta (ATO) de clientes o staff**                  | `/login`, `/registro`, `/recuperar-password`, `/admin/login`                                        | Contraseñas verificadas contra HIBP k-anonymity, OTP de 6 dígitos, MFA TOTP `aal2` obligatorio en `/admin`, step-up MFA (`≤ 10 min`), rate limit dual IP + cuenta, Turnstile, expiración por inactividad y telemetría `SecurityEvent`                                                                 |
| **Inyección de scripts (XSS) y robo de contexto**             | Storefront, descripciones Markdown, previsualizaciones HTML de correos en `/admin`                  | CSP dinámica con nonce por request (sin `'unsafe-inline'` ni `'strict-dynamic'` en `script-src` de producción), `rehype-sanitize` en Markdown y `EMAIL_PREVIEW_SANDBOX_CSP` (`sandbox; default-src 'none'`) en vistas previas de plantillas                                                           |
| **Acceso directo a objetos ajenos (IDOR) y enumeración**      | `/mi-cuenta/*`, `/pedido/[token]`, `/cotizacion/[token]`, `/api/designs/*`, `/api/design-preview/*` | Verificación de propiedad (`customerId` o `cart_session`) en cada consulta, tokens opacos de 128 bits almacenados como SHA-256, doble factor posventa para invitados (token + correo timing-safe) y bucket `design-previews` privado detrás de proxy autenticado                                      |
| **Fraude financiero, manipulación de precios y abuso COD**    | `/checkout/*`, `/api/webhooks/wompi`, cupones, Puntos Lucams, contraentrega                         | Recálculo total server-side desde variantes reales, fletes sellados con HMAC-SHA256 (`CSRF_SECRET`), firma SHA-256 timing-safe + ventana de 25 h + idempotencia en Wompi, decremento atómico de stock post-pago (`InventoryLog`), `BlockedIdentity` y motor `assessCodRisk`                           |
| **Bombas de descompresión y payloads maliciosos en imágenes** | Subidas del Estudio, catálogo y CMS (`/api/designs/*`, Server Actions de medios)                    | Inspección de magic bytes (`sniffImageMime`), lectura previa de dimensiones `ispe` en HEIC/HEIF antes de decodificar, `sharp` `0.35.5` con formatos peligrosos bloqueados (`sharp.block`), tope de píxeles (`25 MP`–`50 MP`), ratio `≤ 20:1`, borrado de EXIF y streaming acotado `readBodyWithLimit` |
| **Amplificación de base de datos o denegación de servicio**   | `/api/vitals`, `/api/funnel`, `/api/log-error`, `/api/webhooks/*`, fallos masivos de login          | Límites de cuerpo por ruta (`4 KB`–`128 KB`), rate limiting transaccional en Postgres + topes globales de filas nuevas y coalescencia en memoria + upsert por minuto en `SecurityEvent` (`LUC-SEC-008`)                                                                                               |
| **Exfiltración masiva o escalamiento interno en `/admin`**    | Exportaciones CSV, pedidos, CRM, reembolsos y gestión de staff                                      | Matriz RBAC `8 × 35`, ocultamiento server-side de PII (`lib/pii-mask.ts`), búsqueda anti-oráculo cuando el rol no posee `orders:read_pii`, step-up MFA para exportar o reembolsar, auditoría `selfDealing` y registro inmutable en `AdminActionLog`                                                   |
| **Bypass de la capa web hacia Supabase PostgREST**            | API REST pública de Supabase con `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`                             | `ENABLE ROW LEVEL SECURITY` + `REVOKE ALL` a `anon`/`authenticated` y revocación DML a `service_role` en el 100 % de las tablas de `public`, blindado por event trigger `enforce_rls_on_new_table_trg` y suite `make test-rls`                                                                        |

### 2.2 Superficie expuesta

- **Storefront público y cuenta de cliente (`apps/web/app/`):** páginas RSC, formularios protegidos por Server Actions de Next.js 16, cuenta autenticada en `/mi-cuenta/*` y flujos públicos por token opaco (`/pedido/[token]`, `/cotizacion/[token]`, `/resena/[token]`, `/carrito/recuperar/[token]`).
- **API Routes (`apps/web/app/api/`):** webhooks externos (`/api/webhooks/{wompi,aveonline,resend}`), endpoints del Estudio (`/api/designs/*`, `/api/design-preview/[...path]`), catálogo/CMS públicos con rate limit (`/api/catalog/*`, `/api/cms/*`, `/api/coupons/public`), telemetría acotada (`/api/vitals`, `/api/funnel`, `/api/log-error`), baja de correo RFC 8058 (`/api/unsubscribe`), sondas `/api/health/*` y jobs internos `/api/cron/*` autenticados con `x-cron-secret`.
- **Panel administrativo (`/admin/*`):** aislado bajo layout dedicado, inaccesible sin registro activo en `AdminUser` (`deletedAt IS NULL`), sesión MFA TOTP en nivel `aal2` y marca de actividad vigente `admin_last_activity`.
- **Almacenamiento y datos:** Postgres en Supabase accedido únicamente desde el servidor mediante Prisma (`packages/db`) y 5 buckets en Supabase Storage (2 públicos de escaparate y 3 privados de operación/clientes).

### 2.3 Mapeo de controles OWASP Top 10 (2021)

| Categoría OWASP Top 10                             | Controles vigentes en Lucams Shop                                                                                                                                                                                                                              |
| -------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **A01 — Broken Access Control**                    | RBAC `8 × 35` (`canAccessAdminPath` por prefijo más largo + `requireCapability`/`verifyAdminRouteAccess`), `proxy.ts` sobrescribe `x-pathname`, RLS al 100 % + `REVOKE ALL`, tokens opacos SHA-256, `safeRedirectTarget` (`ADR-046`) y `LUC-SEC-001`           |
| **A02 — Cryptographic Failures**                   | HSTS Preload 2 años, `checkout_state` cifrada con `AES-256-GCM` (`ADR-085`), códigos MFA con `HMAC-SHA256(CSRF_SECRET)`, tokens hasheados SHA-256 en reposo, `crypto.timingSafeEqual` en toda comparación sensible y backups R2 cifrados con GPG `AES-256`     |
| **A03 — Injection**                                | Consultas parametrizadas con Prisma (y `$queryRaw` con tagged templates tipados), validación Zod allowlist sin `.passthrough()`, Markdown renderizado con `rehype-sanitize`, `EMAIL_PREVIEW_SANDBOX_CSP` y prohibición absoluta de `SVG` en subidas            |
| **A04 — Insecure Design**                          | Recálculo server-side en centavos COP, decremento atómico de stock post-pago (`InventoryLog`), separación `UNVERIFIED_OBSERVED` vs `VERIFIED` en CRM (`ADR-193`), auditoría de conflicto de interés `selfDealing` y step-up MFA (`≤ 10 min`) en reembolsos     |
| **A05 — Security Misconfiguration**                | `validateEnv()` fail-fast al arranque, `SECURITY_HEADERS` + CSP con nonce, CORS estricto con scope de cuenta Vercel (`ADR-062`), funciones SQL con `SET search_path` fijo (`027`) y event trigger DDL `enforce_rls_on_new_table_trg` (`049`)                   |
| **A06 — Vulnerable and Outdated Components**       | `pnpm-lock.yaml` congelado, `pnpm audit --prod --audit-level=high` bloqueante en CI, `sharp@0.35.5` con decodificadores bloqueados (`LUC-SEC-011`), Dependabot semanal y GitHub Actions pineadas por SHA completo                                              |
| **A07 — Identification & Authentication Failures** | HIBP k-anonymity (`pwned-passwords.ts`), OTP de 6 dígitos (inmune a prefetch de correo), MFA TOTP `aal2` obligatorio en los 8 roles admin, marcas HMAC de inactividad (30 min admin / 30 días cliente), `signOut` global al cambiar clave y doble factor guest |
| **A08 — Software & Data Integrity Failures**       | Ruleset `protect-ramas-criticas` (`bypass_actors: []`) sobre `develop` y `production`, verificación criptográfica de webhooks (Wompi SHA-256 25 h, Resend Svix HMAC ±5 min, Aveonline timing-safe) y sellos HMAC sobre ofertas de flete                        |
| **A09 — Security Logging & Monitoring Failures**   | Logger JSON con `scrubPii` y `X-Request-Id`, `AdminActionLog` inmutable (120+ puntos), `SecurityEvent` con coalescencia anti-DoS (`LUC-SEC-008`), reglas `security_admin_login_fails` y `security_webhook_invalid` y monitor cruzado `uptime-monitor-prd`      |
| **A10 — Server-Side Request Forgery (SSRF)**       | Cero endpoints que hagan `fetch` de URLs suministradas por usuarios; el Estudio solo recibe archivos binarios; las sondas compuestas (`/api/health/all`) usan `getTrustedSelfBaseUrl()` ignorando por completo la cabecera `Host` del cliente                  |

### 2.4 Modelo formal STRIDE por categoría y flujo crítico

#### Las 6 categorías STRIDE en Lucams Shop

| Letra | Categoría                  | Definición operativa                                                                | Mitigación transversal en Lucams Shop                                                                                               |
| :---: | -------------------------- | ----------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| **S** | **Spoofing**               | Suplantar la identidad de otro cliente, administrador o proveedor externo           | Supabase Auth + OTP 6 dígitos + MFA `aal2` obligatorio + firmas criptográficas en webhooks + `x-cron-secret` desde Vault            |
| **T** | **Tampering**              | Alterar precios, fletes, estados, archivos subidos o cookies en tránsito o cliente  | Recálculo en servidor, `AES-256-GCM` en `checkout_state`, HMAC en fletes/actividad, magic bytes + re-codificación `sharp` y RLS     |
| **R** | **Repudiation**            | Negar haber ejecutado una compra, autorización o mutación administrativa            | `Consent` append-only (IP, UA, versión), `AdminActionLog` con diff `before`/`after`, `WebhookEvent` y correlación `X-Request-Id`    |
| **I** | **Information Disclosure** | Acceder a PII, fotos privadas, llaves o topología interna sin autorización          | RLS + `REVOKE ALL`, enmascaramiento RSC (`lib/pii-mask.ts`), 3 buckets privados, `scrubPii` en logs/errores y salud pública mínima  |
| **D** | **Denial of Service**      | Agotar conexiones DB, memoria serverless, cuota de Storage o presupuesto de APIs IA | `readBodyWithLimit`, presupuestos de píxeles `sharp`, `rate_limit_buckets` + topes globales, Turnstile y coalescencia `LUC-SEC-008` |
| **E** | **Elevation of Privilege** | Escalar de visitante/cliente a admin o de rol operativo a `SUPERADMIN`              | Matriz RBAC `8 × 35`, triggers anti-escalada en DB (`028`), esquemas Zod cerrados, step-up MFA en `staff:manage` e invariantes CRM  |

#### Aplicación STRIDE a los 4 flujos críticos

**Flujo 1 — Registro, login y recuperación de cuenta:**

| Vector STRIDE          | Amenaza concreta                                   | Mitigación implementada                                                                                                     |
| ---------------------- | -------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| Spoofing               | Credential stuffing con credenciales filtradas     | Rate limit dual IP + email hasheados, bloqueo HIBP k-anonymity, Turnstile en registro/recuperación y MFA `aal2` en `/admin` |
| Tampering              | Adivinación de código OTP de confirmación/recupero | OTP de 6 dígitos con expiración corta, doble bucket IP + email (`otp_verify` / `pw_reset`) y entrega DKIM/SPF por Resend    |
| Repudiation            | Titular niega haber aceptado política de datos     | Fila append-only en `Consent` con `scope`, `accepted`, `version`, `ipAddress`, `userAgent` y `acceptedAt`                   |
| Information Disclosure | Enumeración de correos registrados                 | Mensajes uniformes en `/login`, `/registro` y `/recuperar-password` sin revelar existencia de cuenta                        |
| Denial of Service      | Creación masiva automatizada de cuentas            | Turnstile server-side (`signupAction`) + rate limit `signup` por IP + OTP obligatorio antes de activar sesión               |
| Elevation of Privilege | Inyección de campos `role` o `loyaltyPoints`       | Esquemas Zod cerrados sin campos privilegiados + trigger SQL `customer_block_sensitive_col_update_trg` (`028`)              |

**Flujo 2 — Checkout, pago Wompi y contraentrega (COD):**

| Vector STRIDE          | Amenaza concreta                                          | Mitigación implementada                                                                                                                           |
| ---------------------- | --------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| Spoofing               | Webhook falso simulando pago aprobado en Wompi            | Checksum `SHA-256` timing-safe con `WOMPI_EVENTS_SECRET`, coincidencia estricta `event.environment === WOMPI_ENV` y ventana anti-replay de 25 h   |
| Tampering              | Alterar `amount`, descuentos o tarifa de envío en cliente | Servidor recalcula totales desde variantes vivas, verifica sello HMAC de flete (`sealShippingOffersPayload`) y firma integridad Wompi en centavos |
| Repudiation            | Desconocimiento de pago electrónico o entrega             | Autenticación 3DS en dominio Wompi + `WebhookEvent` deduplicado + trazabilidad logística `ShipmentEvent`                                          |
| Information Disclosure | Exposición de PAN/CVV en servidor o logs                  | Hosted Checkout por redirección a Wompi (cero datos de tarjeta en Lucams Shop) + allowlist de metadatos en `WebhookEvent` (`LUC-SEC-009`)         |
| Denial of Service      | Acaparamiento de inventario con órdenes `PENDING_PAYMENT` | Sin bloqueo pre-pago de stock: decremento atómico solo al confirmar pago (`InventoryLog`) + auto-cancelación a las 24 h (`expire-pending-orders`) |
| Elevation of Privilege | Forzar `COD` en destino no cubierto o identidad bloqueada | Re-validación server-side de cobertura COD, `BlockedIdentity` (`PHONE`/`EMAIL`/`ADDRESS`) y evaluación de riesgo `assessCodRisk`                  |

**Flujo 3 — Estudio de personalización y activos privados:**

| Vector STRIDE          | Amenaza concreta                                               | Mitigación implementada                                                                                                                          |
| ---------------------- | -------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| Spoofing               | Subir o borrar fotos en un `Design` ajeno                      | Verificación estricta de propiedad (`customerId` o `cart_session`) en cada Server Action + `metadata.owner_id` en Storage                        |
| Tampering              | Subir HTML/SVG renombrado como `.jpg` o bomba HEIC             | `sniffImageMime` por magic bytes (prohibido `SVG`), pre-lectura de caja `ispe` en HEIC/HEIF y re-codificación completa con `sharp-safe.ts`       |
| Repudiation            | Reclamo posterior por baja resolución o derechos de imagen     | Sellos `Order.contentRightsAcceptedAt` al comprar y `Design.qualityAcknowledgedAt` al aceptar imprimir con advertencia de resolución             |
| Information Disclosure | Enumeración o lectura directa de fotos/previews de terceros    | Buckets `customer-uploads`, `design-previews` y `production-assets` privados; UUID en rutas; proxy `/api/design-preview/*` (`LUC-SEC-001`)       |
| Denial of Service      | Ráfaga de archivos pesados o imágenes de 200 megapíxeles       | Tope `10 MB`, rate limit doble por dueño + IP (`upload_photo`), presupuestos `25 MP` / `50 MP` y `RASTER_MAX_ASPECT_RATIO = 20`                  |
| Elevation of Privilege | Cliente intenta descargar artes 300 DPI de `production-assets` | Bucket privado sin políticas públicas; las URLs firmadas o paquetes ZIP solo se emiten tras `verifyAdminRouteAccess` (`designs:read_production`) |

**Flujo 4 — Tareas programadas (`pg_cron` / GitHub Actions → `/api/cron/*`):**

| Vector STRIDE          | Amenaza concreta                                              | Mitigación implementada                                                                                                                                 |
| ---------------------- | ------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Spoofing               | Invocación externa no autorizada de `/api/cron/*`             | Cabecera `x-cron-secret` verificada con `cronSecretOk` (`lib/cron-auth.ts`, `timingSafeEqual` fail-closed) en todos los endpoints cron                  |
| Tampering              | Filtración del secreto de cron en URLs o logs de acceso       | Prohibido pasar secretos por query string; `pg_cron` lee `cron_secret` en tiempo de ejecución desde `vault.decrypted_secrets`                           |
| Repudiation            | Silencio ante un job que dejó de correr o falló               | `recordCronHeartbeat` + dead-man switch `2×` intervalo (`/api/health/crons`) + alerta `notifyCronFailure` en `/admin/notificaciones`                    |
| Information Disclosure | Sondeo público de versión desplegada o estado interno de jobs | Respuesta pública mínima (`status` + `timestamp`); `version`, `environment` y detalle de jobs exigen `x-cron-secret` válido                             |
| Denial of Service      | Purga automática elimina eventos pendientes o errores activos | Guardas conservadoras: `WebhookEvent` solo con `processedAt IS NOT NULL`, `ErrorReport` por `lastSeenAt` y `Notification` solo con `readAt IS NOT NULL` |
| Elevation of Privilege | Función SQL de purga invocada desde PostgREST                 | `SET search_path` fijo y `REVOKE EXECUTE` a `PUBLIC`, `anon` y `authenticated` en funciones administrativas                                             |

---

## 3. Gestión endurecida de sesiones, cookies (`ADR-162`) y TTLs

La orquestación de sesiones vive en [`apps/web/proxy.ts`](../apps/web/proxy.ts) junto con [`apps/web/lib/activity-mark.ts`](../apps/web/lib/activity-mark.ts), [`apps/web/lib/customer-activity.ts`](../apps/web/lib/customer-activity.ts) y [`apps/web/lib/admin-activity.ts`](../apps/web/lib/admin-activity.ts).

### 3.1 Inventario técnico de cookies de sesión y estado

| Cookie                    | `HttpOnly`                                                                            | `Secure`                           | `SameSite` | `Path`   | Duración (`Max-Age`)                                                    | Formato / Protección                                                                               | Propósito                                                                       |
| ------------------------- | ------------------------------------------------------------------------------------- | ---------------------------------- | ---------- | -------- | ----------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| `sb-<ref>-auth-token[.N]` | `false` (requerido por `@supabase/ssr` para MFA en navegador; mitigado con CSP nonce) | `true` en `production` y `preview` | `Lax`      | `/`      | ~400 días contenedor (access token 1 h, refresh token 30 d rotativo)    | JWT + refresh token de Supabase Auth                                                               | Sesión autenticada de clientes y administradores                                |
| `customer_last_activity`  | `true`                                                                                | `true` en `production` y `preview` | `Lax`      | `/`      | Cookie 60 días; **inactividad máx. 30 días** (`CUSTOMER_IDLE_LIMIT_MS`) | `<ts_ms>.<hmac-sha256>` firmado con `CSRF_SECRET`                                                  | Ventana deslizante de actividad de cliente                                      |
| `admin_last_activity`     | `true`                                                                                | `true` en `production` y `preview` | `Lax`      | `/admin` | Cookie 30 días; **inactividad máx. 30 min** (`ADMIN_IDLE_LIMIT_MS`)     | `<ts_ms>.<hmac-sha256>` firmado con `CSRF_SECRET`                                                  | Ventana deslizante fail-closed del panel `/admin`                               |
| `cart_session`            | `true`                                                                                | `true` en `production`             | `Lax`      | `/`      | 30 días                                                                 | `UUID v4` de 122 bits opaco validado por regex (`lib/cart-session.ts`)                             | Propiedad de carrito y borradores anónimos del Estudio                          |
| `checkout_state`          | `true`                                                                                | `true` en `production`             | `Lax`      | `/`      | 60 minutos                                                              | Cifrado autenticado **AES-256-GCM** con IV aleatorio y clave derivada de `CSRF_SECRET` (`ADR-085`) | Avance temporal entre pasos del checkout sin exponer PII al JS                  |
| `lucams_cms_edit`         | `true`                                                                                | `true` en `production`             | `Lax`      | `/`      | 8 horas                                                                 | Flag habilitado solo tras verificar `cms:write` en servidor                                        | Modo Live Edit del CMS sobre el storefront                                      |
| `cookie_consent_v1`       | `false`                                                                               | `true` en HTTPS                    | `Lax`      | `/`      | 1 año                                                                   | JSON codificado sin PII con `v: 1` y `policyVersion` (`lib/cookie-consent.ts`)                     | Preferencias del banner de cookies y disparo de re-consentimiento               |
| `lucams_utm`              | `false`                                                                               | `true` en HTTPS                    | `Lax`      | `/`      | 30 días                                                                 | JSON `{ source, medium, campaign }` sanitizado (`lib/utm-attribution.ts`)                          | Atribución opcional de campaña; **solo existe si el usuario acepta Analíticas** |

> **Trade-off documentado sobre `httpOnly: false` en `sb-*`:** el cliente de navegador (`apps/web/lib/supabase/browser.ts`) necesita leer la sesión desde `document.cookie` durante el reto interactivo MFA TOTP con `@supabase/ssr`. La exposición ante XSS se neutraliza mediante la CSP estricta por nonce (sin `'unsafe-inline'` ni `'unsafe-eval'` en `script-src`), mientras que todas las cookies sensibles propias (`cart_session`, `checkout_state`, `customer_last_activity`, `admin_last_activity`, `lucams_cms_edit`) son `HttpOnly`.

### 3.2 Control de inactividad diferenciado (`customer` vs `admin`)

Las marcas de actividad utilizan `sealActivityMark(nowMs)` y `verifyActivityMark(raw, nowMs, maxIdleMs)` (`lib/activity-mark.ts`), comparando el HMAC-SHA256 mediante `crypto.timingSafeEqual` y rechazando marcas con desvío hacia el futuro mayor a 60 segundos (`FUTURE_SKEW_TOLERANCE_MS`).

1. **Clientes (`customer_last_activity` — límite 30 días):**
   - Se sella al iniciar sesión (`/login`), confirmar OTP (`/confirmar-codigo`) o restablecer contraseña.
   - En cada navegación real fuera de `/admin`, si la marca está `expired` (> 30 días sin actividad) o `invalid` (HMAC manipulado), `proxy.ts` ejecuta `supabase.auth.signOut({ scope: "global" })`, borra todas las cookies `sb-*` y `customer_last_activity`, y redirige a `/login?error=sesion-expirada&next=<ruta>` cuando la ruta pertenece a `CUSTOMER_SESSION_REQUIRED_PREFIXES` (`/mi-cuenta`), o a `/` en páginas públicas.
   - Si la cookie está ausente pero el servidor acaba de validar un JWT legítimo (`getUser()`), `proxy.ts` **re-sella la marca y continúa** sin expulsar al cliente (evita cierres espurios por evicción de cookie en el navegador, conservando el bloqueo total cuando la marca fue expirada o forjada).
2. **Administradores (`admin_last_activity` — límite 30 minutos, fail-closed):**
   - Se sella únicamente al completar el login administrativo o el reto MFA TOTP.
   - En toda navegación a rutas protegidas de `/admin/*` (excepto `/admin/login*` y el flujo inicial de enrolamiento `/admin/seguridad`), la marca debe ser `ok`. Si falta (`missing`), expiró (`> 30 min`) o su firma es inválida (`invalid`), el proxy revoca la sesión globalmente (`signOut({ scope: "global" })`), limpia `sb-*` y `admin_last_activity` (`path: "/admin"`) y redirige a `/admin/login?expired=1`.

### 3.3 Defensas contra condiciones de carrera y cierres de sesión fantasma (`ADR-162`)

En Next.js 16 con App Router concurren múltiples solicitudes por vista (documento HTML, payloads Flight RSC, prefetches de `<Link>` y llamadas `/api/*`). Supabase Auth emplea _refresh tokens_ de un solo uso (con ventana `refresh token reuse interval` de 10 s en el proyecto Supabase); si dos requests intentan refrescar simultáneamente el mismo token vencido, la perdedora puede recibir `SIGNED_OUT` y borrar las cookies recién emitidas por la ganadora. `apps/web/proxy.ts` neutraliza este vector mediante tres invariantes:

1. **Exclusión de `/api/*` en el proxy:** `proxy.ts` no instancia el cliente Supabase de sesión en rutas `/api/*`; cada Route Handler crea su propio cliente con `lib/supabase/server.ts` cuando lo requiere, evitando carreras paralelas con la navegación principal.
2. **Filtro anti-borrado en `setAll`:** cuando `@supabase/ssr` intenta escribir cookies con valor vacío que coinciden con `/^sb-[^-]+-auth-token(\.\d+)?$/` producto de una carrera perdida, `proxy.ts` descarta esa eliminación implícita; los cierres legítimos invocan limpieza explícita desde su Server Action o redirección por inactividad.
3. **Inmunidad de prefetches RSC en origen y borde:** `isPrefetchRequest` detecta `next-router-prefetch`, `purpose: prefetch` y `sec-purpose: prefetch` para que un prefetch jamás renueve ni revoque marcas de actividad. Además, como Next.js 16 consume internamente cabeceras Flight antes de `proxy.ts`, todos los enlaces del storefront hacia `/admin` (`site-header.tsx`, `shop-mega-menu.tsx`) declaran obligatoriamente `prefetch={false}`, evitando que un administrador logueado en la tienda dispare un `signOut` global por un prefetch en segundo plano hacia una marca `admin_last_activity` antigua.

### 3.4 Modelo de amenazas de `cart_session` y cierre de sesión (`LUC-SEC-013`)

`cart_session` (UUID v4 de 122 bits sin firma adicional, ya que firmarla no impide el robo de cookie) otorga hoy acceso tanto al carrito anónimo como a borradores del Estudio y sus vistas previas vía `/api/design-preview/*` (`LUC-SEC-001`):

- **Cierre de sesión limpio:** al cerrar sesión en tienda o admin se revoca el token en Supabase (`signOut({ scope: "global" })`) y se eliminan `sb-*`, la marca de actividad respectiva y `cart_session`, impidiendo que un segundo usuario en un dispositivo compartido herede el carrito o los borradores del Estudio.
- **Auto-curación ante colisión de identidad:** si `getOrCreateCart` detecta `CART_IDENTITY_MISMATCH` (una cookie `cart_session` apunta a un carrito ya reclamado por otro `customerId`), rota de inmediato el UUID de `cart_session` y registra `cart.identity_mismatch.healed`.
- **Riesgo residual aceptado (`lib/cart-session.ts`):** el paso final del checkout no rota `cart_session` porque la página `/checkout/gracias` y la recuperación de carrito (`ADR-171`) dependen de ella; el alcance temporal queda acotado por `HttpOnly` + `Secure`, ausencia total en URLs/logs y las purgas automáticas de borradores (`7 d` anónimos / `30 d` logueados) y fotos post-entrega (`90 d`).

### 3.5 TTLs y caducidad explícita de recursos temporales

Ningún recurso temporal vive indefinidamente:

| Recurso                                           | TTL / Ventana                    | Mecanismo de expiración o rotación                                                                  |
| ------------------------------------------------- | -------------------------------- | --------------------------------------------------------------------------------------------------- |
| Access token JWT de Supabase Auth                 | **1 hora**                       | Rotación automática mediante refresh token                                                          |
| Refresh token de Supabase Auth                    | **30 días** (1 solo uso)         | Rotación en cada refresco con intervalo de gracia de reuso (`10 s`)                                 |
| Sesión inactiva de administrador                  | **30 minutos**                   | Marca HMAC `admin_last_activity` fail-closed + `signOut({ scope: "global" })` en `proxy.ts`         |
| Sesión inactiva de cliente                        | **30 días**                      | Marca HMAC `customer_last_activity` deslizante + `signOut` global al vencer                         |
| Ventana de step-up MFA (`requireRecentMfa`)       | **10 minutos**                   | Verificación del timestamp `totp` en el claim `amr` del JWT (`lib/admin-reauth.ts`)                 |
| Código OTP de registro o recuperación             | **Corta (Supabase Auth)**        | Código numérico de 6 dígitos de un solo uso (sin enlace consumible por prefetch)                    |
| Cookie `checkout_state`                           | **60 minutos**                   | Timestamp interno sellado bajo `AES-256-GCM` (`lib/checkout-session.ts`)                            |
| Ofertas cotizadas de flete en checkout            | **Expiración corta por sesión**  | Payload sellado con `HMAC-SHA256` (`sealShippingOffersPayload`)                                     |
| Caché «última cotización buena» de Aveonline      | **10 minutos**                   | Caché en memoria por instancia (`features/shipping/aveonline.ts`)                                   |
| Orden Wompi en `PENDING_PAYMENT`                  | **24 horas**                     | Auto-cancelación horaria por `lucams-expire-pending-orders` (verifica estado real en Wompi antes)   |
| Ventana anti-replay webhook Wompi / Resend        | **25 horas** / **±5 minutos**    | Validación sobre timestamp firmado + deduplicación permanente en `WebhookEvent`                     |
| URL firmada en `customer-uploads`                 | **1 hora** (auto-refresh ≥ 40 m) | Supabase Storage signed URL + `refreshDesignAssetUrlsAction` antes de exportar a taller             |
| URL firmada en `production-assets` (artes/guías)  | **1 hora**                       | Generada bajo demanda solo para roles con `designs:read_production` u `orders:shipping`             |
| Contadores `rate_limit_buckets`                   | **7 días**                       | Purga diaria SQL `purge_rate_limit_buckets()` (`29 5 * * *` UTC, `LUC-SEC-010`)                     |
| `WebVital` / `ErrorLog` & `ErrorReport` / Eventos | **35 d** / **90 d** / **180 d**  | Job diario `lucams-purge-event-logs` (`03:00 UTC`; ver [`OBSERVABILITY.md`](OBSERVABILITY.md))      |
| Respaldos cifrados de DB + Storage en R2          | **~30 días**                     | Pipeline diario `backup.yml` (`pg_dump → gzip → gpg AES-256`) + regla de ciclo de vida en bucket R2 |

---

## 4. Autenticación de clientes y posventa invitado de doble factor

### 4.1 Clientes registrados (`/registro`, `/login`, `/confirmar-codigo`, `/recuperar-password`)

1. **Política completa de contraseñas (`apps/web/lib/password-strength.ts` y `apps/web/lib/pwned-passwords.ts`):**
   - **Longitud mínima de 8 caracteres** validada con Zod en Server Actions y reforzada en Supabase Auth, sin reglas arbitrarias de símbolos obligatorios (alineado con NIST SP 800-63B).
   - **Medidor informativo de 5 niveles** (`muy débil`, `débil`, `razonable`, `fuerte`, `muy fuerte`) en `lib/password-strength.ts`: pondera longitud y variedad de clases de caracteres, y penaliza secuencias triviales (`123`, `qwerty`) y términos locales (`lucams`, `password`). Orienta en vivo sin bloquear por composición.
   - **Confirmación explícita:** doble campo con `.refine()` en Zod en registro, cambio y restablecimiento.
   - **Bloqueo de contraseñas filtradas vía Have I Been Pwned (k-anonymity):** se calcula el hash `SHA-1` en mayúsculas, se envía únicamente el prefijo de **5 caracteres** a `GET https://api.pwnedpasswords.com/range/<prefix>` con cabecera `Add-Padding: true` y timeout de **3 000 ms**, y se compara localmente el sufijo de 35 caracteres. La contraseña jamás sale del servidor. Si `count > 0`, se rechaza con mensaje claro en español (`security.pwned.signup_block` / `security.pwned.reset_block`); si la API externa falla o vence el timeout, registra `security.pwned.api_fail` / `security.pwned.fetch_error` y opera _fail-open_.
   - **Decisión deliberada sobre historial de claves:** no se mantiene una tabla paralela `PasswordHistory` con hashes antiguos; el costo operativo y superficie adicional no se justifican frente a la cobertura real de Pwned Passwords sobre credenciales comprometidas.
2. **Confirmación y recuperación por código OTP de 6 dígitos:**
   - El alta de cuenta y la recuperación de clave envían un código numérico de **6 dígitos** (plantillas gestionadas con `scripts/supabase-auth-email-config.mjs`), inmune a los escáneres/prefetches de clientes de correo como Gmail u Outlook que consumen enlaces mágicos de un solo uso antes de que el usuario haga clic.
   - Tras cambiar o restablecer la contraseña, el servidor ejecuta `signOut({ scope: "global" })` (`security.password.reset_success` / `security.change_password.success`) invalidando de inmediato cualquier sesión activa en otros dispositivos.
3. **Mitigación anti-enumeración y telemetría:** `/login` y `/recuperar-password` devuelven mensajes uniformes sin revelar si un correo existe, aplicando límites dobles por IP y correo hasheados (`lib/rate-limit-keys.ts`) y registrando eventos `security.login.success`, `security.login.fail` y `auth.*.rate_limited`.

### 4.2 Autenticación posventa de doble factor para invitados (`/pedido/[token]`)

Los compradores sin cuenta consultan su orden mediante un enlace con un token opaco de **32 caracteres hexadecimales** (128 bits generados con `crypto.randomBytes(16)`):

- **Almacenamiento y rotación (`ADR-119`):** `Order.publicAccessTokenHash` persiste exclusivamente el digest `SHA-256` (`hashBearerToken` en `lib/token-hash.ts`), verificado con `verifyTokenHashTimingSafe`. Cada reenvío del correo del pedido rota el token, invalidando automáticamente enlaces anteriores que hubieran sido reenviados.
- **Lectura acotada vs mutación con segundo factor (`apps/web/app/pedido/[token]/actions.ts`):** mientras la vista de seguimiento protege datos sensibles, toda acción posventa mutante —solicitar retracto (`requestGuestRetractAction`), radicar garantía (`requestGuestWarrantyAction`) o abrir un ticket PQR del pedido (`submitGuestOrderSupportAction`)— exige **dos factores simultáneos**:
  1. **Factor de posesión:** el token opaco válido en la ruta (`/^[a-f0-9]{32}$/`), verificado en tiempo constante contra `Order.publicAccessTokenHash`.
  2. **Factor de conocimiento:** el correo electrónico exacto de la compra, validado en tiempo constante con `verifyEmailMatchesTimingSafe(email, order.email)` (`trim().toLowerCase()` + digest SHA-256 + `crypto.timingSafeEqual`).
- Cada acción aplica **rate limiting dual** por IP (`ipKey`) y por prefijo del hash del token (`tokenHash.slice(0, 16)`), frenando adivinación de correo incluso si el enlace fue compartido.

---

## 5. Seguridad del panel `/admin`

### 5.1 Matriz RBAC: 8 roles (`AdminRole`) × 35 capacidades (`AdminCapability`)

La fuente única de verdad vive en [`apps/web/lib/admin-rbac.ts`](../apps/web/lib/admin-rbac.ts). Todo miembro del equipo existe en `AdminUser` (`isActive = true` y `deletedAt IS NULL`). El aprovisionamiento (`provisionStaffAdmin` en `apps/web/features/admin-users/service.ts`) crea o reutiliza el usuario en `auth.users` sin insertar filas ficticias en `Customer` ni contaminar el grafo comercial `Contact`.

| Rol (`AdminRole`)    | Capacidades | Propósito operativo y alcance sobre PII                                                                                                             |
| -------------------- | :---------: | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| `SUPERADMIN`         | **34 / 35** | Propietaria / dirección general: control total del negocio, staff (`staff:manage`), reembolsos finales en efectivo, finanzas, seguridad y auditoría |
| `OPERATIONS_MANAGER` | **25 / 35** | Jefatura operativa diaria (catálogo, pedidos con PII, moderación, posventa, `Contacto 360`, fusión CRM, B2B y lealtad; sin reembolsos ni staff)     |
| `MANAGER`            | **25 / 35** | Alias de compatibilidad en Prisma con capacidades idénticas a `OPERATIONS_MANAGER`                                                                  |
| `CUSTOMER_SUPPORT`   | **13 / 35** | Atención PQR, retractos, garantías (sin desembolso de efectivo), reseñas, moderación, cotizaciones y consulta `Contacto 360` con PII                |
| `FINANCE_ANALYST`    | **9 / 35**  | Contabilidad, exportación CSV financiera, costos, conciliación COD, bloqueos anti-abuso, métricas y lectura de pedidos con PII enmascarada          |
| `PRINT_WORKSHOP`     | **7 / 35**  | Taller de impresión: diseños 300 DPI, reintento `RenderJob`, paquetes ZIP e inventario, con PII enmascarada y sin acceso a guías logísticas         |
| `FULFILLMENT`        | **6 / 35**  | Alistamiento y despacho: transiciones logísticas, impresión auditada de guías (`orders:shipping`) e inventario, con PII enmascarada en listados     |
| `CMS_EDITOR`         | **2 / 35**  | Edición editorial CMS v2 (`cms:write` en páginas, bloques, mediateca, redirects) + seguridad de su propia cuenta (`account:self_security`)          |

#### Tabla exacta de las 35 capacidades por rol

Leyenda: `SA` = `SUPERADMIN`, `OM` = `OPERATIONS_MANAGER` / `MANAGER`, `CS` = `CUSTOMER_SUPPORT`, `FA` = `FINANCE_ANALYST`, `PW` = `PRINT_WORKSHOP`, `FU` = `FULFILLMENT`, `CE` = `CMS_EDITOR`.

| #   | Capacidad (`AdminCapability`) | SA  | OM  | CS  | FA  | PW  | FU  | CE  |
| --- | ----------------------------- | :-: | :-: | :-: | :-: | :-: | :-: | :-: |
| 1   | `dashboard:read`              |  ✓  |  ✓  |  ✓  |  ✓  |  ✓  |  ✓  |  —  |
| 2   | `orders:read`                 |  ✓  |  ✓  |  ✓  |  ✓  |  ✓  |  ✓  |  —  |
| 3   | `orders:read_pii`             |  ✓  |  ✓  |  ✓  |  —  |  —  |  —  |  —  |
| 4   | `orders:update_status`        |  ✓  |  ✓  |  —  |  —  |  ✓  |  ✓  |  —  |
| 5   | `orders:shipping`             |  ✓  |  ✓  |  —  |  —  |  —  |  ✓  |  —  |
| 6   | `orders:reconcile`            |  ✓  |  ✓  |  —  |  —  |  —  |  —  |  —  |
| 7   | `orders:refund`               |  ✓  |  —  |  —  |  —  |  —  |  —  |  —  |
| 8   | `orders:delete`               |  ✓  |  —  |  —  |  —  |  —  |  —  |  —  |
| 9   | `designs:read_production`     |  ✓  |  ✓  |  —  |  —  |  ✓  |  —  |  —  |
| 10  | `designs:rerender`            |  ✓  |  ✓  |  —  |  —  |  ✓  |  —  |  —  |
| 11  | `moderation:manage`           |  ✓  |  ✓  |  ✓  |  —  |  —  |  —  |  —  |
| 12  | `products:write`              |  ✓  |  ✓  |  —  |  —  |  —  |  —  |  —  |
| 13  | `products:delete`             |  ✓  |  —  |  —  |  —  |  —  |  —  |  —  |
| 14  | `inventory:write`             |  ✓  |  ✓  |  —  |  —  |  ✓  |  ✓  |  —  |
| 15  | `costs:manage`                |  ✓  |  —  |  —  |  ✓  |  —  |  —  |  —  |
| 16  | `quotes:manage`               |  ✓  |  ✓  |  ✓  |  —  |  —  |  —  |  —  |
| 17  | `customers:read`              |  ✓  |  ✓  |  ✓  |  —  |  —  |  —  |  —  |
| 18  | `contacts:read`               |  ✓  |  ✓  |  ✓  |  —  |  —  |  —  |  —  |
| 19  | `contacts:read_pii`           |  ✓  |  ✓  |  ✓  |  —  |  —  |  —  |  —  |
| 20  | `contacts:write`              |  ✓  |  ✓  |  ✓  |  —  |  —  |  —  |  —  |
| 21  | `contacts:merge`              |  ✓  |  ✓  |  —  |  —  |  —  |  —  |  —  |
| 22  | `opportunities:manage`        |  ✓  |  ✓  |  —  |  —  |  —  |  —  |  —  |
| 23  | `support:manage`              |  ✓  |  ✓  |  ✓  |  —  |  —  |  —  |  —  |
| 24  | `posventa:manage`             |  ✓  |  ✓  |  ✓  |  —  |  —  |  —  |  —  |
| 25  | `posventa:refund`             |  ✓  |  —  |  —  |  —  |  —  |  —  |  —  |
| 26  | `marketing:manage`            |  ✓  |  ✓  |  —  |  —  |  —  |  —  |  —  |
| 27  | `marketing:export_pii`        |  ✓  |  —  |  —  |  —  |  —  |  —  |  —  |
| 28  | `cms:write`                   |  ✓  |  ✓  |  —  |  —  |  —  |  —  |  ✓  |
| 29  | `finance:read`                |  ✓  |  —  |  —  |  ✓  |  —  |  —  |  —  |
| 30  | `finance:manage`              |  ✓  |  —  |  —  |  ✓  |  —  |  —  |  —  |
| 31  | `metrics:read`                |  ✓  |  ✓  |  —  |  ✓  |  —  |  —  |  —  |
| 32  | `system:read`                 |  ✓  |  —  |  —  |  —  |  —  |  —  |  —  |
| 33  | `staff:manage`                |  ✓  |  —  |  —  |  —  |  —  |  —  |  —  |
| 34  | `account:self_security`       |  ✓  |  ✓  |  ✓  |  ✓  |  ✓  |  ✓  |  ✓  |
| 35  | `lifecycle:manage`            |  ✓  |  ✓  |  —  |  —  |  —  |  —  |  —  |

### 5.2 Guardia de rutas por prefijo más largo (`canAccessAdminPath`) y Route Handlers

- **`proxy.ts` como gate ligero sin Prisma:** `apps/web/proxy.ts` valida sesión Supabase, nivel MFA e inactividad, y sobrescribe en servidor la cabecera interna `x-pathname` con `request.nextUrl.pathname`, impidiendo que un cliente falsifique la ruta evaluada por el layout administrativo (`app/admin/(panel)/layout.tsx`).
- **Evaluación por prefijo más largo (_longest-prefix match_):** `ADMIN_ROUTE_ACCESS` (`lib/admin-rbac.ts`) declara las rutas permitidas y `canAccessAdminPath(role, pathname)` aplica siempre la regla más específica (p. ej. `/admin/carritos/configuracion` exige rol gerencial aunque `/admin/carritos` sea accesible también a soporte). Cualquier ruta nueva bajo `/admin/*` no listada queda restringida por defecto a `SUPERADMIN`.
- **Guardas imperativas (`apps/web/lib/admin-rbac-guard.ts`):**
  - Páginas: `getCurrentAdmin()`, `requireRole()` y `requireCapability(cap)`.
  - Server Actions mutantes: `requireAdminAction({ roles, capability })`.
  - Route Handlers sensibles: `verifyAdminRouteAccess({ roles, capability, req, checkIdle })` en `/admin/pedidos/[number]/produccion`, `/admin/carritos/[id]/preview`, `/admin/email-templates/[id]/preview`, `/admin/marketing/suscriptores/export`, `/admin/marketing/segmentos/export`, `/admin/finanzas/export` (los 6 con `checkIdle: true`) y `/api/design-preview/*` (donde `checkIdle` se omite porque `admin_last_activity` tiene `path=/admin` y el navegador no la adjunta en `/api/*`, quedando cubierto el timeout en cada navegación por `/admin/*`).

### 5.3 MFA TOTP obligatorio (`aal2`), códigos de recuperación y step-up (`requireRecentMfa`)

1. **Obligatoriedad `aal2` en los 8 roles:** ningún rol administrativo puede operar el panel en `aal1` (para clientes finales MFA aún no está habilitado). Si el administrador no posee factor TOTP verificado, `proxy.ts`, el layout y `admin-rbac-guard.ts` redirigen forzosamente a `/admin/seguridad?enroll=required`; si ya tiene factor pero su sesión está en `aal1`, redirigen a `/admin/login/mfa`.
2. **Códigos de recuperación (`AdminRecoveryCode`, `apps/web/features/admin-mfa/recovery-codes.ts`):**
   - Al enrolar TOTP se generan **10 códigos de un solo uso** de 16 caracteres (`XXXX-XXXX-XXXX-XXXX`, alfabeto sin caracteres ambiguos, ~79 bits de entropía) mostrados una sola vez.
   - En base de datos se guarda `codeHash = HMAC-SHA256(CSRF_SECRET, normalizedCode)` como pepper criptográfico (con fallback transitorio de solo lectura para hashes SHA-256 previos hasta su rotación).
   - El consumo en `/admin/login/mfa/recovery` está limitado a **5 intentos cada 15 min** por IP y por administrador, reclama el código de forma atómica con `updateMany({ where: { id, usedAt: null } })`, desenrola los factores TOTP previos vía `supabaseService.auth.admin` y obliga a registrar un nuevo autenticador en `/admin/seguridad?reconfig=1`.
3. **Step-up MFA para acciones destructivas o sensibles (`apps/web/lib/admin-reauth.ts`):**
   - `requireRecentMfa()` inspecciona el timestamp del método `totp` dentro del claim `amr` del JWT y exige verificación en los últimos **10 minutos** (`MFA_REAUTH_WINDOW_MINUTES = 10`, fail-closed). Si venció, lanza `MfaReauthRequiredError` y la UI abre `MfaReauthModal` (`verifyAdminMfaReauthAction`, rate limit `5 / 15 min` IP + admin y auditoría `mfa.reauth.success/failure`) reintentando la acción sin perder el formulario.
   - **Acciones protegidas con step-up MFA:** reembolso de pedido (`refundOrderAction`), reembolso de retracto (`refundRetractAction`), aprobación o resolución de garantía con devolución de dinero (`approveWarrantyAction` / `resolveWarrantyAction` con `resolution === "REFUND"`), exportaciones CSV (`/admin/marketing/suscriptores/export`, `/admin/marketing/segmentos/export`, `/admin/finanzas/export`), gestión de staff (`provisionStaffAdmin`, promoción/cambio de rol y desactivación de `AdminUser`), fusión de duplicados CRM (`contacts:merge`), operaciones sensibles de COD (`markCodRemittedAction`, `flagCodDiscrepancyAction`, `setCodEnabledAction`) y autogestión de MFA (`disableMfaAction`, `changeMfaDeviceAction`, `generateRecoveryCodesAction`). El enrolamiento inicial no pide step-up porque acaba de ejecutar `challengeAndVerify`.

### 5.4 Enmascaramiento server-side de PII, confirmaciones `ADR-192` y auditoría `AdminActionLog` (`selfDealing`)

- **Enmascaramiento antes de serializar RSC (`apps/web/lib/pii-mask.ts`):** los roles sin `orders:read_pii` (`FINANCE_ANALYST`, `PRINT_WORKSHOP`, `FULFILLMENT`) reciben datos ya redactados en servidor mediante `maskOrderForActor` (`maskEmail`, `maskPhone`, `maskDocumentNumber`, `maskTaxDocument`, `maskPersonName`, `maskShippingAddressSnapshot`: conserva solo ciudad/departamento y `giftMessage` para imprimir la tarjeta de regalo). Para `PRINT_WORKSHOP` se anulan además `labelPath`, `labelUrl` y `trackingUrl` (solo `FULFILLMENT` y gerencia acceden a `/admin/pedidos/[number]/guia`, auditado como `order.print_shipping_guide`). En CRM y moderación operan `maskContactSummaryForActor` y `listPendingModerationForActor`, y `listOrders` desactiva búsquedas por correo/teléfono/documento (`allowPiiSearch: false`) impidiendo oráculos carácter por carácter.
- **Confirmaciones destructivas (`useAdminConfirm`, `ADR-192`):** toda acción irreversible utiliza [`apps/web/components/admin/use-admin-confirm.tsx`](../apps/web/components/admin/use-admin-confirm.tsx) con soporte de escritura explícita (`requireTyped`, p. ej. `"ELIMINAR"`). Prohibido `window.confirm` o `window.prompt`.
- **Qué registra y qué NO registra `AdminActionLog` (`apps/web/lib/admin-audit.ts`):**
  - Registra las **120+ mutaciones administrativas** (cambios de estado de orden, ajustes de inventario, moderación de diseños/reseñas, reembolsos, precios/catálogo, cupones, CMS, promoción/baja de `AdminUser`, bloqueos COD, fusiones CRM) y las **lecturas/descargas sensibles** (exportaciones CSV, descargas ZIP de producción e impresión de guías), persistiendo `adminId`, `action`, `entityType`, `entityId`, diff `before`/`after` e IP/User-Agent.
  - No registra consultas rutinarias de listado sin exportación ni acciones del cliente final sobre su propia cuenta (trazadas en `Order`, `Consent`, etc.).
  - **Segregación de funciones y detección `selfDealing`:** cuando el correo del administrador que ejecuta una de las **12 acciones sensibles** (`SELF_DEALING_SENSITIVE_ACTIONS`: `retract.*`, `warranty.*`, `cod.*`, `contact.merge*`) coincide con el correo de la orden o contacto objetivo, `recordAdminAction` inyecta automáticamente `metadata.selfDealing = true` y emite `logger.warn({ event: "admin.audit.self_dealing" })` para revisión en `/admin/auditoria`.

### 5.5 Progreso y retroalimentación del Centro de Ayuda (`ADR-197`)

- `/admin/ayuda` está permitido para los 8 roles, pero cada guía, relación, búsqueda y procedimiento se filtra nuevamente con `canAccessAdminPath`; ocultar contenido en el cliente no se considera una frontera de seguridad.
- `saveHelpProgressAction` y `submitHelpFeedbackAction` usan `requireAdminAction` con MFA `aal2` y Zod. El servidor resuelve la guía autorizada, su versión y el número real de pasos; ignora cualquier intento de guardar contenido de un rol superior o pasos arbitrarios.
- `AdminHelpProgress` y `AdminHelpFeedback` aíslan filas por `adminUserId` con unicidad `(adminUserId, guideId)` y cascada al retirar la cuenta. El comentario se limita a 1000 caracteres y la UI prohíbe expresamente incluir datos de clientes o secretos.
- Las tablas tienen RLS y revocación completa para `anon`, `authenticated` y DML de `service_role`; el acceso legítimo ocurre solo por Prisma en servidor. Están incluidas en la matriz RLS y en la migración `00000000000056`.
- Los recorridos nunca invocan Server Actions de negocio: su única mutación es el progreso de aprendizaje del propio administrador.

### 5.6 Lifecycle Journeys (`ADR-198`)

- `/admin/lifecycle` exige `lifecycle:manage`, limitado a `SUPERADMIN`, `OPERATIONS_MANAGER` y `MANAGER`, además de MFA `aal2`. Activar un recorrido, probar, reintentar y cambiar el interruptor/límite general usa `requireRecentMfa` y el modal TOTP; todas las mutaciones quedan en `AdminActionLog`. `/admin/lifecycle/[id]/preview` repite la misma capacidad y control de inactividad, y sirve HTML aislado con `EMAIL_PREVIEW_SANDBOX_CSP`.
- Las cuatro tablas Lifecycle tienen RLS y revocación completa para `anon`, `authenticated` y DML de `service_role` en la migración `057`; el acceso ocurre exclusivamente por Prisma en servidor. El cron usa `x-cron-secret` y no acepta comandos ni destinatarios desde HTTP.
- El consentimiento `NEWSLETTER` se verifica por versión vigente y revocación posterior en PostgreSQL y antes de cada paso comercial. La baja cierra de inmediato recorridos que exigen opt-in; rebote/queja suprime todas las inscripciones activas del destinatario y cancela pendientes. La consulta previa de supresión no degrada a envío si falla la DB. Contactos eliminados, anonimizados o `isStaff` no reciben mensajes y solo una pausa manual puede reanudarse.
- El CTA solo admite `isSafeInternalPath`. El enlace `/j/[token]` usa HMAC-SHA256 de 192 bits por mensaje; en base de datos solo se conserva su hash SHA-256, nunca el token utilizable ni correos en la URL. El mismo token, contenido, destinatario, clasificación comercial y ruta contextual se conservan al reintentar, de modo que editar el contacto o paso no altera el contenido asociado a la clave idempotente.
- La deduplicación de inscripciones/mensajes y la reserva transaccional del límite diario global viven en PostgreSQL. Las conversiones requieren clic anterior y orden posterior pagada dentro de 30 días; `convertedOrderId` único impide contar una orden más de una vez. STG queda forzado a `DRY_RUN`, sin llamadas a Resend ni creación de tareas operativas.

---

## 6. Invariantes de seguridad del grafo de identidad y CRM nativo (`ADR-193`)

La resolución de identidad sobre `Contact`, `ContactIdentity`, `IdentityMergeCandidate`, `Organization`, `ContactActivity`, `Task` y `Opportunity` reside en [`apps/web/features/identity/resolution-service.ts`](../apps/web/features/identity/resolution-service.ts) bajo seis invariantes verificados por pruebas de integración:

1. **Matriz de 4 niveles y bloqueo transaccional determinista (`UNVERIFIED_OBSERVED` vs `VERIFIED`):**
   - **Nivel 1 (determinista automático):** solo opera sobre identidades `SUPABASE_USER` y `EMAIL` con estado `VERIFIED`. Antes de crear o vincular identidades toma `pg_advisory_xact_lock` bajo el namespace `"lucams_contact_identity_v1"` ordenando las claves lexicográficamente, evitando colisiones `P2002` que abortarían la transacción Postgres (`25P02`), y aplica enriquecimiento conservador (nunca sobrescribe nombre/teléfono verificados con entradas anónimas).
   - **Nivel 2 (observación contextual `UNVERIFIED_OBSERVED`):** un correo o teléfono digitado libremente en checkout invitado, `/contacto`, cotizaciones o boletín asocia `contactId` **exclusivamente para lectura interna en `Contacto 360`**. Jamás asigna `Order.customerId` sin prueba criptográfica de posesión, jamás permite consultar ni redimir Puntos Lucams y jamás expone historial previo al navegador anónimo.
   - **Nivel 3 (señales probables sin auto-fusión):** coincidencias por teléfono comprador (`SAME_BUYER_PHONE_E164`), documento fiscal (`SAME_BILLING_DOCUMENT`), correo alterno en sesión autenticada (`AUTH_BUYER_ALT_ORDER_EMAIL`) o discrepancias históricas (`HISTORICAL_ID01_EMAIL_MISMATCH`) jamás fusionan contactos automáticamente; encolan un `IdentityMergeCandidate`. Está **prohibido** el auto-merge por teléfono, nombre, dirección física o similitud difusa (`pg_trgm`), y un par marcado `REJECTED` se respeta permanentemente como _do-not-suggest_.
   - **Nivel 4 (fusión humana reversible):** requiere capacidad `contacts:merge`, step-up `requireRecentMfa` (`≤ 10 min`), snapshot previo íntegro en `mergeSnapshotJson` y traza en `AdminActionLog`.
2. **Inmunidad ante secuestro de pedido en checkout autenticado (`[ID-01]`):** en `resolveOrderContactTx`, si existe sesión autenticada (`Customer A`), `Order.customerId` y `Order.contactId` apuntan siempre al contacto de `Customer A` incluso si `Order.email` contiene el correo de un tercero `B`. El correo `B` nunca se anexa como `ContactIdentity` de `A`; como máximo abre un `IdentityMergeCandidate` (`AUTH_BUYER_ALT_ORDER_EMAIL`).
3. **Aislamiento por construcción del destinatario de regalo (`Order.isGift = true`):** la firma de `resolveOrderContactTx` omite físicamente `recipientName`, `recipientPhone` y `shippingAddress`. Es imposible por construcción crear filas `Contact`, `ContactIdentity` o `IdentityMergeCandidate` con datos personales del homenajeado.
4. **Aislamiento de staff (`AdminUser` / `isStaff`) frente a formularios públicos:** `getStorefrontCustomerForForm` y `canBindSessionCustomerTx` nunca vinculan la sesión en `/empresas-y-eventos`, `/contacto`, cotizaciones o carritos abandonados si el usuario pertenece a un `AdminUser` activo o si el correo digitado difiere del correo autenticado. Además, `markStaffContactIfAdminTx` marca `Contact.isStaff = true` cuando el correo coincide con un `AdminUser`, excluyendo cuentas internas de segmentos comerciales, matriz RFM y métricas LTV (solo `SUPERADMIN` puede limpiar manualmente esa bandera).
5. **Defensa explícita en migraciones SQL:** toda tabla de identidad/CRM incluye en su migración espejo explícita (`050`–`054`) `ENABLE ROW LEVEL SECURITY`, `REVOKE ALL` a `anon, authenticated`, `REVOKE SELECT, INSERT, UPDATE, DELETE` a `service_role` y bloque `DO $$ ... RAISE EXCEPTION $$` de verificación inline, sin depender únicamente del event trigger DDL.
6. **Cascada transaccional de supresión Ley 1581 (`scrubContactOnErasureTx`):** al suprimir una cuenta o atender una solicitud de Hábeas Data, desvincula `contactId -> null` en entidades históricas, elimina físicamente todas las filas `ContactIdentity` y los `IdentityMergeCandidate` en `PENDING`, reemplaza correos requeridos por placeholders `@deleted.lucamsshop.com` y anonimiza `Contact` sellando `anonymizedAt`, `deletedAt` y `deletedBy`.

---

## 7. Manejo de secretos, inventario de claves y reglas para agentes IA

### 7.1 Reglas de oro y validación al arranque (`apps/web/lib/env.ts`)

1. **Cero llaves privadas en el navegador:** solo las variables con prefijo `NEXT_PUBLIC_*` llegan al bundle cliente y todas están diseñadas para exposición pública controlada. **Está prohibido declarar cualquier variable `NEXT_PUBLIC_WOMPI_*`**: el checkout usa Hosted Checkout por redirección y las 4 llaves de Wompi (incluida `WOMPI_PUBLIC_KEY`) viven exclusivamente en el servidor. `GEMINI_API_KEY` también es estrictamente server-only (`features/ai/`).
2. **Restricción por dominio en claves públicas:** `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (`sb_publishable_*`) mapea al rol `anon` sin permisos de tabla; `NEXT_PUBLIC_TURNSTILE_SITE_KEY` valida dominios autorizados en Cloudflare; `WOMPI_PUBLIC_KEY` opera desde servidor con dominios autorizados en Wompi (`lucamsshop.com` y `*.vercel.app`).
3. **Arranque fail-fast:** `validateEnv()` verifica las variables críticas en producción (`CSRF_SECRET`, `RESEND_WEBHOOK_SECRET`, claves Supabase, etc.) e impide iniciar la app con configuración incompleta (`env.prod_vars_missing`).

### 7.2 Inventario maestro de claves y secretos

| Variable                                                    | Clasificación                    | Visible en cliente | Protección y notas operativas                                                                                                    |
| ----------------------------------------------------------- | -------------------------------- | :----------------: | -------------------------------------------------------------------------------------------------------------------------------- |
| `NEXT_PUBLIC_SUPABASE_URL`                                  | Pública                          |         Sí         | Endpoint del proyecto Supabase                                                                                                   |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (`sb_publishable_*`) | Pública protegida por RLS        |         Sí         | Mapea al rol Postgres `anon` (`0` grants en `public`); reemplaza a la antigua `anon` JWT key                                     |
| `SUPABASE_SECRET_KEY` (`sb_secret_*`)                       | **Crítica — bypassa RLS**        |       **NO**       | Mapea a `service_role` (solo Auth Admin y Storage en `lib/supabase/service.ts`). Soporta múltiples llaves activas para `IRP-001` |
| `DATABASE_URL` / `DIRECT_URL`                               | **Crítica — conexión Prisma**    |       **NO**       | Pooler transaccional (`6543`) y conexión directa de migraciones (`5432`), exclusivas de servidor y CI                            |
| `CSRF_SECRET`                                               | **Crítica — raíz criptográfica** |       **NO**       | Deriva claves de `checkout_state` (`AES-256-GCM`), marcas de actividad, fletes HMAC, códigos recovery MFA y baja RFC 8058        |
| `CRON_SECRET`                                               | **Crítica — jobs internos**      |       **NO**       | Verificada en `x-cron-secret` con `timingSafeEqual`; espejo en `vault.decrypted_secrets` (`cron_secret`)                         |
| `WOMPI_PUBLIC_KEY` / `WOMPI_PRIVATE_KEY`                    | Privadas server-only             |       **NO**       | `WOMPI_PUBLIC_KEY` arma redirección Hosted Checkout en servidor; `WOMPI_PRIVATE_KEY` consulta transacciones en API Wompi         |
| `WOMPI_INTEGRITY_SECRET` / `WOMPI_EVENTS_SECRET`            | **Críticas — integridad/firma**  |       **NO**       | Firma SHA-256 del monto/referencia al iniciar pago y verificación SHA-256 de webhooks entrantes                                  |
| `AVEONLINE_USUARIO` / `AVEONLINE_CLAVE`                     | Privadas                         |       **NO**       | Autenticación API logística server-side                                                                                          |
| `AVEONLINE_WEBHOOK_SECRET`                                  | **Crítica — webhook logístico**  |       **NO**       | Verificada en `x-aveonline-secret` o `payload.token` (`?secret=` deshabilitado por defecto)                                      |
| `RESEND_API_KEY` / `RESEND_WEBHOOK_SECRET`                  | **Críticas — correo y Svix**     |       **NO**       | Envío transaccional y verificación HMAC-SHA256 Svix (obligatoria en producción)                                                  |
| `GEMINI_API_KEY`                                            | Privada server-only              |       **NO**       | Invocada únicamente desde servidor tras sanitización cero-PII                                                                    |
| `NEXT_PUBLIC_TURNSTILE_SITE_KEY` / `TURNSTILE_SECRET_KEY`   | Pública / Privada                |    Sí / **NO**     | Widget cliente restringido por hostname en Cloudflare y validación `siteverify` server-side                                      |
| `R2_*` y `BACKUP_GPG_PASSPHRASE`                            | **Críticas — respaldos DR**      |       **NO**       | Secretos de GitHub Actions para cifrar con GPG `AES-256` y almacenar dumps diarios en Cloudflare R2                              |

### 7.3 Detección automática de secretos en 3 capas

1. **Capa 1 — Pre-commit local ([`scripts/git-hooks/pre-commit`](../scripts/git-hooks/pre-commit) + [`.gitleaks.toml`](../.gitleaks.toml)):** ejecuta `gitleaks git --staged` con reglas personalizadas para `sb_secret_*`, `sb_publishable_*` hardcodeada, URIs Postgres con contraseña, JWTs legacy de Supabase, Wompi `prv_*`, Anthropic `sk-ant-*` y Resend `re_*`, **sin excluir `docs/**`**. Se activa con `git config core.hooksPath scripts/git-hooks`.
2. **Capa 2 — GitHub Secret Scanning + Push Protection:** activo a nivel de cuenta y repositorio; bloquea en el servidor remoto cualquier `git push` que contenga secretos reconocibles antes de que entren al historial.
3. **Capa 3 — Gate obligatorio en CI (`secrets-scan` en `.github/workflows/ci.yml`):** ejecuta Gitleaks sobre el repositorio y forma parte de los 5 checks requeridos por el ruleset `protect-ramas-criticas`.

### 7.4 Reglas de manipulación segura de archivos de credenciales (`.env.*`) por agentes IA

> **Mandato operativo innegociable:** las herramientas de lectura/edición de los agentes IA (`Read`, `read_file`, `Edit`, `Write`, `cat`) vuelcan el contenido leído al contexto del modelo y al _transcript_ persistente de la sesión. Leer un archivo de credenciales con esas herramientas constituye una exposición real de secretos.

- **Archivos estrictamente restringidos (prohibido abrir o escribir con herramientas del agente):**
  - `.env`, `.env.local`, `.env.stg`, `.env.development`, `.env.production` y cualquier `.env.*`.
  - `~/.git-credentials`, `~/.aws/credentials`, `~/.config/gcloud/*`, `.npmrc` con tokens y cualquier archivo con llaves, JWTs o cadenas de conexión con contraseña embebida.

| Operación requerida                        | Método seguro permitido (vía subshell Bash sin eco de valores)                          | Por qué es seguro                                                           |
| ------------------------------------------ | --------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| **Listar solo nombres de variables**       | `grep -E '^[A-Z0-9_]+=' .env.local \| cut -d= -f1`                                      | Imprime únicamente el identificador previo al `=`, jamás el secreto         |
| **Comprobar si una variable está cargada** | `set -a; source .env.local; set +a; [ -n "${VAR:-}" ] && echo "loaded"`                 | El valor vive solo en el subshell efímero y la salida es booleana           |
| **Verificar longitud o prefijo público**   | `set -a; source .env.local; set +a; echo "len=${#VAR}"`                                 | No revela el material criptográfico al transcript                           |
| **Renombrar o actualizar in-place**        | `sed -i 's/^OLD_NAME=/NEW_NAME=/' .env.local`                                           | Modifica el archivo en disco sin imprimir su contenido en stdout            |
| **Probar conectividad autenticada**        | `set -a; source .env.local; set +a; curl -sS -o /dev/null -w '%{http_code}' -H ... URL` | Inyecta la credencial en el proceso hijo sin imprimir cabeceras ni secretos |

- **Operaciones terminantemente prohibidas:** `cat .env*`, `read_file` / `Read` / `Edit` / `Write` sobre `.env*`, `printenv`, `env`, `set` sin redirección o `echo "$SECRET_VAR"`.
- **Protocolo si un agente IA llega a leer un secreto por accidente:** tratarlo como compromiso confirmado y ejecutar de inmediato el **[Runbook IRP-001](#134-plan-de-respuesta-a-incidentes--irp-nist-sp-800-61-y-runbooks)** (rotar y revocar la credencial el mismo día, incluso en entornos con pocos datos).

---

## 8. Cabeceras HTTP, CSP con nonce, CORS, CSRF y defensas web

Definidas en [`apps/web/lib/security-headers.ts`](../apps/web/lib/security-headers.ts) y aplicadas en [`apps/web/proxy.ts`](../apps/web/proxy.ts) sobre **todas** las respuestas (incluidas redirecciones `3xx` y rechazos `403` mediante `withSecurityHeaders`).

### 8.1 Cabeceras estáticas globales (`SECURITY_HEADERS`)

| Cabecera                         | Valor en producción                                                                                             | Propósito                                                                    |
| -------------------------------- | --------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| `Strict-Transport-Security`      | `max-age=63072000; includeSubDomains; preload`                                                                  | Fuerza HTTPS durante 2 años con elegibilidad HSTS Preload                    |
| `X-Frame-Options`                | `SAMEORIGIN`                                                                                                    | Defensa clásica contra clickjacking (reforzada por `frame-ancestors 'self'`) |
| `X-Content-Type-Options`         | `nosniff`                                                                                                       | Impide MIME sniffing en respuestas y descargas                               |
| `Referrer-Policy`                | `strict-origin-when-cross-origin`                                                                               | Evita filtrar rutas o tokens internos en cabeceras `Referer` hacia terceros  |
| `Permissions-Policy`             | `camera=(), microphone=(), geolocation=(), payment=(), usb=(), magnetometer=(), accelerometer=(), gyroscope=()` | Deshabilita APIs sensibles del navegador no utilizadas                       |
| `Cross-Origin-Opener-Policy`     | `same-origin`                                                                                                   | Aísla `window.opener` frente a ventanas externas (anti XS-Leaks)             |
| `Cross-Origin-Resource-Policy`   | `same-site`                                                                                                     | Bloquea lectura cross-origin de recursos propios                             |
| `X-DNS-Prefetch-Control`         | `on`                                                                                                            | Permite resolución DNS anticipada controlada                                 |
| `X-Request-Id`                   | `UUID` (reutiliza `x-request-id` entrante saneado o genera uno nuevo)                                           | Correlación extremo a extremo con logs JSON y `ErrorLog`                     |
| `Cache-Control` (rutas privadas) | `private, no-store` en `GET /mi-cuenta*`, `/checkout*` y `/admin*`                                              | Impide caché compartida o de navegador en vistas con sesión o PII            |

### 8.2 Content Security Policy (CSP) dinámica con nonce (`ADR-043`)

En cada request de página, `proxy.ts` genera un nonce de 16 bytes (`Buffer.from(crypto.randomUUID()).toString("base64")`), lo propaga en la cabecera de request `x-nonce` (mediante `nextWithNonce()` preservando las cookies refrescadas por Supabase) y emite `Content-Security-Policy` con `buildCsp(nonce, isProd)`:

```text
default-src 'self';
script-src 'self' 'nonce-<base64-por-request>' https://challenges.cloudflare.com https://checkout.wompi.co;
worker-src 'self';
style-src 'self' 'unsafe-inline' https://fonts.googleapis.com;
img-src 'self' data: blob: https://*.supabase.co https://*.coordinadora.com https://images.unsplash.com <supabaseOrigin>;
font-src 'self' https://fonts.gstatic.com;
connect-src 'self' https://*.supabase.co https://api.wompi.co <supabaseOrigin>;
frame-src 'self' https://challenges.cloudflare.com https://checkout.wompi.co;
frame-ancestors 'self';
form-action 'self' https://checkout.wompi.co;
base-uri 'self';
object-src 'none';
upgrade-insecure-requests;
```

| Directiva                   | Valor en `production` / `preview`                                                                                                                                                                                                                                           | Notas verificadas en código                                                                                                                                                                                    |
| --------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `default-src`               | `'self'`                                                                                                                                                                                                                                                                    | Cierre por defecto para tipos no declarados                                                                                                                                                                    |
| `script-src`                | `'self' 'nonce-<base64>' https://challenges.cloudflare.com https://checkout.wompi.co` (+ `https://www.googletagmanager.com` solo si `NEXT_PUBLIC_GA_MEASUREMENT_ID` está definido; + `https://vercel.live` solo en `VERCEL_ENV=preview`)                                    | Sin `'unsafe-inline'`, sin `'unsafe-eval'` y **sin `'strict-dynamic'`** (para preservar la allowlist por host de Turnstile/Wompi/GA4). En `development` usa `'unsafe-inline' 'unsafe-eval'` sin nonce para HMR |
| `worker-src`                | `'self'`                                                                                                                                                                                                                                                                    | Web Workers propios del cliente (sin `blob:` abierto)                                                                                                                                                          |
| `style-src`                 | `'self' 'unsafe-inline' https://fonts.googleapis.com`                                                                                                                                                                                                                       | Requerido por atributos `style=""` inline de UI/Konva (que no aceptan nonce) y Google Fonts                                                                                                                    |
| `img-src`                   | `'self' data: blob: https://*.supabase.co https://*.coordinadora.com https://images.unsplash.com <supabaseOrigin>` (+ `https://www.google-analytics.com https://www.googletagmanager.com` si GA4 está configurado; + `https://vercel.live https://vercel.com` en `preview`) | Cubre Supabase Storage (incluido `127.0.0.1:54321` en local), `blob:`/`data:` de Konva y Three.js                                                                                                              |
| `font-src`                  | `'self' https://fonts.gstatic.com`                                                                                                                                                                                                                                          | Fuentes locales `.subset.woff2` y respaldo Google Fonts                                                                                                                                                        |
| `connect-src`               | `'self' https://*.supabase.co https://api.wompi.co <supabaseOrigin>` (+ `https://www.google-analytics.com https://analytics.google.com https://*.google-analytics.com` si GA4 está configurado; + `https://vercel.live wss://ws-us3.pusher.com` en `preview`)               | Auth/Storage cuando aplica, Wompi y beacon GA4 (Gemini y Aveonline son server-side y no aparecen)                                                                                                              |
| `frame-src`                 | `'self' https://challenges.cloudflare.com https://checkout.wompi.co` (+ `https://vercel.live` en `preview`)                                                                                                                                                                 | Widget Cloudflare Turnstile y modal Wompi                                                                                                                                                                      |
| `frame-ancestors`           | `'self'`                                                                                                                                                                                                                                                                    | Impide embeber la tienda en sitios externos                                                                                                                                                                    |
| `form-action`               | `'self' https://checkout.wompi.co`                                                                                                                                                                                                                                          | Restringe POST de formularios al propio sitio y a Hosted Checkout de Wompi                                                                                                                                     |
| `base-uri` / `object-src`   | `base-uri 'self'`; `object-src 'none'`                                                                                                                                                                                                                                      | Bloquea inyección de `<base>` y plugins heredados                                                                                                                                                              |
| `upgrade-insecure-requests` | Activa en `production` y `preview`                                                                                                                                                                                                                                          | Fuerza actualización a HTTPS de subrecursos                                                                                                                                                                    |

- **Por qué no se incluye `'strict-dynamic'`:** en CSP3 `'strict-dynamic'` invalida la allowlist por host (`'self'`, Cloudflare Turnstile, Wompi, GA4) y bloqueaba chunks lazy de Next.js cargados sin propagación directa de nonce. Con `'self' 'nonce-...'` sin `'unsafe-inline'` ni `'unsafe-eval'`, los bundles propios y hosts explícitos cargan mientras cualquier script inline inyectado sin nonce es bloqueado.
- **Variaciones controladas por entorno:** si `NEXT_PUBLIC_GA_MEASUREMENT_ID` está definido se habilitan los hosts de Google Tag Manager / Google Analytics en `script-src`, `img-src` y `connect-src` (la carga real del script sigue bloqueada hasta que el usuario acepte `COOKIES_ANALYTICS`); en `VERCEL_ENV=preview` se agrega `https://vercel.live` (`+ wss://ws-us3.pusher.com`); en `development` se usa `'unsafe-inline' 'unsafe-eval'` sin nonce para HMR de Next.js.
- **Regla de mantenimiento sobre renderizado dinámico:** el nonce por request exige SSR dinámico. Toda página nueva con scripts debe renderizarse dinámicamente (`export const dynamic = "force-dynamic"` cuando no lea cookies/headers por sí sola; `/manifest.webmanifest` es la única excepción por no contener scripts).
- **Verificación automatizada en Playwright:**

```ts
test("security headers present", async ({ request }) => {
  const response = await request.get("/");
  expect(response.headers()["strict-transport-security"]).toContain("max-age=63072000");
  expect(response.headers()["x-frame-options"]).toBe("SAMEORIGIN");
  expect(response.headers()["content-security-policy"]).toContain("default-src 'self'");
});
```

### 8.3 Sandbox CSP aislado para previsualización de correos (`EMAIL_PREVIEW_SANDBOX_CSP`)

Las rutas `/admin/carritos/[id]/preview` y `/admin/email-templates/[id]/preview` renderizan HTML de plantillas editables dentro de `<iframe sandbox="">`. Tanto `proxy.ts` (`isSandboxedPreviewPath`) como ambos Route Handlers sirven exclusivamente `EMAIL_PREVIEW_SANDBOX_CSP`:

```text
sandbox; default-src 'none'; img-src 'self' data: https: http:; style-src 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' data: https://fonts.gstatic.com; frame-ancestors 'self'; base-uri 'none'; form-action 'none'
```

Al omitir `allow-scripts` y `allow-same-origin`, el documento queda confinado en un origen opaco incapaz de ejecutar JavaScript, leer cookies del panel o enviar formularios.

### 8.4 CORS estricto en `/api/*` (`ADR-062`)

`proxy.ts` evalúa `isAllowedOrigin(origin)` (`apps/web/lib/security-headers.ts`) en toda solicitud a `/api/*` con cabecera `Origin`:

```ts
const ALLOWED_ORIGINS = [
  "https://lucamsshop.com",
  "https://www.lucamsshop.com",
  // El sufijo `-jullieth93s-projects` impide que terceros registren `lucams-shop-foo.vercel.app`
  /^https:\/\/lucams-shop(-[a-z0-9][a-z0-9-]*-jullieth93s-projects)?\.vercel\.app$/,
  ...(isDev ? [/^http:\/\/localhost:\d{1,5}$/] : []),
];
```

Si `Origin` no coincide, `proxy.ts` responde de inmediato `403 Forbidden` (en `OPTIONS` y en llamadas directas) con `Vary: Origin`. A los orígenes permitidos les devuelve `Access-Control-Allow-Origin`, `Access-Control-Allow-Credentials: true` y `Vary: Origin`. Los webhooks server-to-server sin cabecera `Origin` pasan a sus verificadores de firma.

### 8.5 Protección CSRF y sellos derivados de `CSRF_SECRET`

- **Server Actions de Next.js 16:** protegidas nativamente por comparación de `Origin`/`Host` e identificadores de acción ligados al build.
- **Cookies `SameSite=Lax` + filtro `Origin` en `/api/*`:** bloquean peticiones cross-site con credenciales.
- **Sellos criptográficos con `CSRF_SECRET`:**
  1. `checkout_state` (`apps/web/lib/checkout-session.ts`, `ADR-085`): cifrada con **`AES-256-GCM`** (IV aleatorio por escritura + tag de autenticación GCM, TTL 60 min) porque transporta PII de checkout.
  2. Ofertas de envío (`sealShippingOffersPayload` / `openShippingOffersPayload`): firmadas con `HMAC-SHA256` verificada en tiempo constante.
  3. Marcas de actividad (`customer_last_activity` y `admin_last_activity`): `<ts_ms>.<HMAC-SHA256>`.
  4. Baja de boletín RFC 8058 (`lib/unsubscribe-token.ts` / `features/newsletter/unsubscribe.ts`): token stateless `SHA-256` verificado en tiempo constante sin exponer el correo en texto plano en query strings.

### 8.6 Validación de entrada (Zod), XSS, Open Redirects (`ADR-046`) y defensas de aplicación

1. **Validación allowlist con Zod (prevención de Mass Assignment):** ninguna ruta ni Server Action pasa `req.body` o `FormData` crudo a Prisma; todo input se valida con esquemas Zod cerrados (sin `.passthrough()`) en `apps/web/features/*/schemas.ts`:

```ts
// Esquema allowlist por dominio (ej. checkout: nunca se pasa req.body crudo a Prisma)
export const CheckoutPayloadSchema = z.object({
  email: z.string().email().toLowerCase().trim(),
  cartId: z.string().cuid(),
  shippingAddress: ShippingAddressSchema,
  paymentMethod: z.enum(["WOMPI", "COD"]),
  couponCode: z.string().max(40).optional(),
});

// Patrón estándar de validación server-side antes de tocar lógica de negocio
const parsed = QuerySchema.safeParse(Object.fromEntries(req.nextUrl.searchParams));
if (!parsed.success) {
  return Response.json({ error: "Parámetros inválidos" }, { status: 400 });
}
```

2. **Codificación de salida y sanitización XSS:** React escapa interpolaciones por defecto; el contenido Markdown (textos legales, notas, descripciones) se renderiza con `ReactMarkdown` + `remark-gfm` + **`rehype-sanitize`**. `dangerouslySetInnerHTML` está prohibido sobre entradas de usuarios (restringido a JSON-LD generado en servidor).
3. **Prevención de Open Redirects (`apps/web/lib/safe-redirect.ts`, `ADR-046`):** bloquea rutas relativas a protocolo (`//evil.com`), barras invertidas (`/\evil.com`) y caracteres de control mediante dos validadores server-side:

```ts
// Destinos post-login (`?next=`): exige ruta estrictamente interna del mismo origen
export function safeRedirectTarget(input: string | null | undefined, fallback = "/"): string {
  return isSafeInternalPath(input) ? input.trim() : fallback;
}

// Destinos del gestor admin de redirecciones (`UrlRedirect`): acepta ruta interna segura o `http(s)://` explícito
export function isAllowedRedirectDestination(input: unknown): input is string {
  /* ... */
}
```

4. **Anti-SSRF, honeypots, paginación acotada, idempotencia y modo mantenimiento:**
   - **Anti-SSRF:** ningún endpoint hace `fetch` de URLs ingresadas por clientes; las llamadas internas de salud usan `getTrustedSelfBaseUrl()`.
   - **Honeypots:** campos ocultos (`tabindex="-1"`, `autocomplete="off"`) en formularios públicos descartan bots simples antes de consumir cuota.
   - **Topes de paginación:** catálogo público acotado a `≤ 60` ítems por página y listados administrativos a `≤ 200`, validando `take`/`skip` con Zod.
   - **Idempotencia de mutaciones:** checkout deduplica órdenes `PENDING_PAYMENT` por carrito activo; webhooks deduplican en `WebhookEvent(@@unique([source, externalId]))`; la saga post-pago es físicamente idempotente mediante el índice parcial único `InventoryLog(orderId, reason, variantId)` y el claim atómico `Order.shipmentClaimedAt`.
   - **Modo mantenimiento (`NEXT_PUBLIC_MAINTENANCE_MODE=1`):** al activarse y redesplegar en Vercel, `proxy.ts` redirige el tráfico público a `/maintenance` manteniendo operativos `/admin/*`, `/api/health/*` y `/_next/*`.

---

## 9. Postura RLS, privilegios y funciones SQL endurecidas en Supabase Postgres

Toda lectura y escritura de negocio ocurre en el servidor Next.js vía Prisma (`packages/db`, rol dueño `postgres`). La API pública PostgREST de Supabase está neutralizada por diseño en `public`:

1. **Cobertura del 100 % con RLS:** las **75 tablas** de `public` (**73 modelos** de `packages/db/prisma/schema.prisma` + `_prisma_migrations` + `rate_limit_buckets`) tienen `ROW LEVEL SECURITY` habilitado.
2. **Revocación total de privilegios (`00000000000022`, `00000000000026`, `00000000000038`, `00000000000049`):**
   - `anon` y `authenticated` tienen **0 privilegios** (`SELECT`, `INSERT`, `UPDATE`, `DELETE`, `TRUNCATE`, `REFERENCES`, `TRIGGER`) y `ALTER DEFAULT PRIVILEGES` revocados sobre todas las tablas de `public` (una consulta directa a `/rest/v1/` con la publishable key recibe `401`/`42501`).
   - `service_role` tiene revocados `SELECT, INSERT, UPDATE, DELETE` sobre las tablas de `public`, acotando el impacto de `SUPABASE_SECRET_KEY` exclusivamente a Auth Admin y Storage APIs.

### 9.1 Blindaje DDL automático sobre tablas nuevas (`00000000000049_enforce_revoke_on_new_tables.sql`)

```sql
CREATE OR REPLACE FUNCTION public.enforce_rls_on_new_table()
RETURNS event_trigger
LANGUAGE plpgsql
SET search_path = public, pg_catalog
AS $$
DECLARE
  obj record;
BEGIN
  FOR obj IN SELECT * FROM pg_event_trigger_ddl_commands()
  LOOP
    IF obj.object_type = 'table'
       AND obj.schema_name = 'public'
       AND split_part(obj.object_identity, '.', 2) NOT LIKE '\_prisma%'
    THEN
      EXECUTE format('ALTER TABLE %s ENABLE ROW LEVEL SECURITY', obj.object_identity);
      EXECUTE format('REVOKE ALL ON TABLE %s FROM anon, authenticated', obj.object_identity);
      EXECUTE format(
        'REVOKE SELECT, INSERT, UPDATE, DELETE ON TABLE %s FROM service_role',
        obj.object_identity
      );
    END IF;
  END LOOP;
END;
$$;

CREATE EVENT TRIGGER enforce_rls_on_new_table_trg
  ON ddl_command_end
  WHEN TAG IN ('CREATE TABLE', 'CREATE TABLE AS')
  EXECUTE FUNCTION public.enforce_rls_on_new_table();
```

### 9.2 Funciones `SECURITY DEFINER`, políticas backstop y triggers anti-escalada (`027` y `028`)

Aunque `anon` y `authenticated` carecen de grants DML en `public`, las políticas y funciones se mantienen endurecidas como segunda línea de defensa si algún permiso llegara a otorgarse en el futuro:

```sql
-- 1) Función helper para políticas de Storage y backstop admin (migración 027):
--    search_path vacío + referencias totalmente calificadas + sin EXECUTE para anon/PUBLIC.
CREATE OR REPLACE FUNCTION public.is_active_admin()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $fn$
  SELECT EXISTS (
    SELECT 1 FROM public."AdminUser"
    WHERE "supabaseUserId" = (SELECT auth.uid())::text
      AND "isActive" = true
      AND "deletedAt" IS NULL
  );
$fn$;
REVOKE EXECUTE ON FUNCTION public.is_active_admin() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_active_admin() TO authenticated;

-- 2) Políticas backstop de propiedad e inserción sin auto-aprobación (migraciones 002 y 028):
CREATE POLICY "customer_read_own" ON public."Customer"
  FOR SELECT USING (auth.uid()::text = "supabaseUserId");

CREATE POLICY "order_read_own_or_admin" ON public."Order"
  FOR SELECT USING (
    "customerId" IN (SELECT id FROM public."Customer" WHERE "supabaseUserId" = auth.uid()::text)
    OR public.is_active_admin()
  );

CREATE POLICY "review insert own" ON public."Review"
  FOR INSERT TO authenticated
  WITH CHECK (
    "isApproved" = false
    AND "featured" = false
    AND EXISTS (
      SELECT 1 FROM public."Customer" c
      WHERE c.id = "Review"."customerId"
        AND c."supabaseUserId" = (auth.uid())::text
    )
  );

-- 3) Guardas de columna contra auto-asignación de puntos o alteración de unitPrice (migración 028):
CREATE OR REPLACE FUNCTION public.customer_block_sensitive_col_update()
RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  IF auth.role() = 'authenticated'
     AND (NEW."loyaltyPoints" IS DISTINCT FROM OLD."loyaltyPoints"
       OR NEW."referralCode" IS DISTINCT FROM OLD."referralCode"
       OR NEW."referredById" IS DISTINCT FROM OLD."referredById") THEN
    RAISE EXCEPTION 'Customer: columnas sensibles reservadas al servidor' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.cartitem_block_unitprice_update()
RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  IF auth.role() = 'authenticated' AND NEW."unitPrice" IS DISTINCT FROM OLD."unitPrice" THEN
    RAISE EXCEPTION 'CartItem: unitPrice solo lo modifica el servidor' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;
```

### 9.3 Verificación continua (`verify-security-posture.mjs` y `make test-rls`)

Toda migración Prisma se acompaña de su migración espejo explícita en `supabase/migrations/` (`050`–`054`), auditada en solo lectura por `packages/db/scripts/verify-security-posture.mjs` (`make verify-db`) y probada en CI contra Supabase real con `make test-rls` (`rls-coverage.integration.test.ts` + `rls-matrix.integration.test.ts`):

```ts
// apps/web/features/security/rls-matrix.integration.test.ts (patrón verificado en CI)
it("customer A cannot see customer B orders", async () => {
  const sbA = createClient(URL, PUBLISHABLE_KEY, { auth: {/* sesión cliente A */} });
  const { data } = await sbA.from("Order").select("*").eq("customerId", "CUSTOMER_B");
  expect(data ?? []).toEqual([]);
});
```

---

## 10. Rate limiting en Postgres (`ADR-016`) y Cloudflare Turnstile

### 10.1 Motor transaccional `rate_limit_check` (`003` + `027`) y cliente TypeScript

En lugar de contadores efímeros en memoria que se pierden entre instancias serverless, `apps/web/lib/rate-limit.ts` ejecuta un incremento y chequeo atómico en Postgres sobre `rate_limit_buckets`:

```sql
-- supabase/migrations/00000000000003_rate_limit.sql (+ endurecimiento 00000000000027)
CREATE OR REPLACE FUNCTION public.rate_limit_check(
  p_key TEXT, p_limit INT, p_window_seconds INT
) RETURNS TABLE (allowed BOOLEAN, count INT, reset_at TIMESTAMPTZ)
LANGUAGE plpgsql
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_count INT;
  v_window_start TIMESTAMPTZ;
BEGIN
  INSERT INTO rate_limit_buckets (key, count, window_start)
  VALUES (p_key, 1, NOW())
  ON CONFLICT (key) DO UPDATE SET
    count = CASE
      WHEN rate_limit_buckets.window_start + (p_window_seconds * INTERVAL '1 second') < NOW() THEN 1
      ELSE rate_limit_buckets.count + 1
    END,
    window_start = CASE
      WHEN rate_limit_buckets.window_start + (p_window_seconds * INTERVAL '1 second') < NOW() THEN NOW()
      ELSE rate_limit_buckets.window_start
    END
  RETURNING rate_limit_buckets.count, rate_limit_buckets.window_start INTO v_count, v_window_start;

  RETURN QUERY SELECT
    (v_count <= p_limit)::BOOLEAN,
    v_count,
    (v_window_start + (p_window_seconds * INTERVAL '1 second'))::TIMESTAMPTZ;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.rate_limit_check(text, int, int) FROM PUBLIC, anon, authenticated;
```

```ts
// apps/web/lib/rate-limit.ts
export async function rateLimit(
  key: string,
  limit: number,
  windowSeconds: number,
): Promise<RateLimitResult> {
  const rows = await prisma.$queryRaw<Array<{ allowed: boolean; count: number; reset_at: Date }>>`
    SELECT * FROM rate_limit_check(${key}::text, ${limit}::int, ${windowSeconds}::int)
  `;
  const row = rows[0];
  if (!row) {
    logger.warn({ event: "rate_limit.empty_row", key });
    return { allowed: true, count: 0, resetAt: new Date(Date.now() + windowSeconds * 1000) };
  }
  return { allowed: row.allowed, count: row.count, resetAt: row.reset_at };
}
```

- **Privacidad de claves (`apps/web/lib/rate-limit-keys.ts`):** nunca se persisten IPs, correos ni teléfonos en claro en `rate_limit_buckets`. `ipKey`, `emailKey`, `phoneKey` y `ownerKey` normalizan el identificador y truncan su hash `SHA-256` a **16 caracteres hexadecimales** (p. ej. `login:ip:9f86d081884c7d65`). `lib/client-ip.ts` prioriza `x-vercel-forwarded-for`, `cf-connecting-ip` y el primer salto de `x-forwarded-for`.
- **Cabecera `Retry-After` y purga diaria (`LUC-SEC-010`):** las rutas HTTP limitadas responden `429 Too Many Requests` con `Retry-After: <segundos>`. El job `lucams-purge-rate-limits` (`29 5 * * *` UTC, migración `047`) ejecuta `purge_rate_limit_buckets()` eliminando ventanas `> 7 días` y sellando latido en `AlertState['cron:purge-rate-limits']`.

### 10.2 Tabla maestra de límites por acción y endpoint

| Superficie / Acción                                                                        | Clave(s) en `rate_limit_buckets`                                                                                                                                             | Límite / Ventana                                      |
| ------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------- |
| Login de cliente (`/login`)                                                                | `ipKey("login", ip)` + `emailKey("login", email)`                                                                                                                            | `5 / 15 min` (ambos)                                  |
| Registro de cliente (`/registro`)                                                          | `ipKey("signup", ip)` (+ email donde aplica)                                                                                                                                 | `5 / 60 min`                                          |
| Confirmación / reenvío de código OTP (`/confirmar-codigo`)                                 | `ipKey("otp_verify", ip)` + `emailKey("otp_verify", email)` / `otp_resend`                                                                                                   | `8 / 15 min` (verificar) · `3 / 15 min` (reenviar)    |
| Solicitud de recuperación de clave (`/recuperar-password`)                                 | `ipKey("pw_reset", ip)` + `emailKey("pw_reset", email)`                                                                                                                      | `3 / 15 min` (ambos)                                  |
| Cambio de clave / restablecimiento / eliminación de cuenta                                 | `pw_change:<userId>` / `ipKey("pw_update", ip)` / `ownerKey("delete-account")`                                                                                               | `5 / 15 min`                                          |
| Login administrativo (`/admin/login`)                                                      | `ipKey("admin-login", ip)` + `emailKey("admin-login", email)`                                                                                                                | `5 / 15 min` (ambos)                                  |
| Verificación MFA TOTP / step-up reauth / recovery code                                     | `ipKey("admin-mfa*" \| "admin-reauth*", ip)` + `<scope>:user:<adminId>`                                                                                                      | `5 / 15 min` (ambos)                                  |
| Copiloto IA de soporte (`/admin/soporte/[id]`)                                             | `ai-support-copilot:admin:<adminId>` + `ai-support-copilot:global`                                                                                                           | `15 / 1 h` por admin · `80 / 1 h` global              |
| Asistente IA de ocasión en Estudio (`suggestDesignIdeasAction`)                            | `ipKey("ai_suggest", ip)` + `ai_suggest:global`                                                                                                                              | `10 / 10 min` por IP · `200 / 1 h` global             |
| Checkout: pago Wompi / COD (`/checkout/pago`)                                              | `ipKey("pay_wompi" \| "pay_cod", ip)`                                                                                                                                        | `10 / 10 min`                                         |
| Checkout: validar cupón / redimir puntos / gracias                                         | `ipKey("coupon_apply", ip)` · `loyalty_redeem:<userId>` · `ipKey("gracias", ip)`                                                                                             | `10 / 10 min` · `15 / 10 min` · `30 / 1 min`          |
| Posventa invitado (`/pedido/[token]`: retracto, garantía, PQR)                             | `ipKey("guest_retract" \| "guest_warranty" \| "guest_order_support", ip)` + `<scope>:tok:<hash16>`                                                                           | `5 / 15 min` (retracto/garantía) · `5 / 60 min` (PQR) |
| Rastreo público (`/rastrear`) y recuperación carrito (`/carrito/recuperar/[token]`)        | `ipKey("track_lookup", ip)` · `ipKey("cart_recover", ip)`                                                                                                                    | `10 / 5 min` · `15 / 5 min`                           |
| Estudio: borrador / auto-save / beacon / finalizar / render-status                         | `studio_draft` (`20/10m`), `save-canvas` (`90/1m`), `beacon` (`60/1m`), `finalize` (`15/10m`), `render-status` (`120/1m`)                                                    | Por propietario (`ownerKey`) + IP                     |
| Estudio: subida / borrado / refresco de fotos                                              | `upload_photo` (`40/10m` IP · `30/10m` dueño), `delete_photo` (`60/10m`), `refresh_urls` (`60/10m`)                                                                          | Doble capa propietario (`ownerKey`) + IP              |
| Proxy de previews (`/api/design-preview/[...path]`)                                        | `ipKey("design_preview", ip)`                                                                                                                                                | `180 / 1 min`                                         |
| Formularios comerciales y soporte: cotización, B2B, ticket PQR, respuesta cliente          | `quote_create` (`5/15m`), `b2b_inquiry` (`5/15m` IP + email), `support_ticket` (`5/60m` IP + email), `support_reply` (`10/15m`)                                              | Por IP (+ email/teléfono donde aplica)                |
| Reseñas (`/producto/[slug]` y `/resena/[token]`), boletín y aviso de stock                 | `review_create` (`5/60m`), `review_token` (`5/60m`), `newsletter` (`5/60m`), `stock_alert` (`8/60m`)                                                                         | Por IP / usuario / email                              |
| Consentimiento de cookies y baja de correo (`/api/unsubscribe`)                            | `ipKey("cookie_consent", ip)` · `ipKey("unsubscribe", ip)`                                                                                                                   | `20 / 5 min` · `20 / 5 min`                           |
| APIs públicas de lectura (`/api/catalog/*`, `/api/cms/*`, `/api/coupons/public`, búsqueda) | `ipKey("api_catalog" \| "api_cms" \| "coupons_public" \| "search", ip)`                                                                                                      | `30–120 / 1 min` según ruta                           |
| Sondas `/api/health` y `/api/health/*`                                                     | `ipKey("health*", ip)`                                                                                                                                                       | `30 / 1 min`                                          |
| Telemetría pública (`/api/vitals`, `/api/funnel`, `/api/log-error`)                        | `ipKey("vitals", ip)` (`120/1m`) + global `3000/5m`; `ipKey("funnel", ip)` (`180/1m`) + global `6000/5m`; `ipKey("log_error", ip)` (`20/1m`) + `error-report:new` (`300/5m`) | Doble capa por IP + tope global                       |

### 10.3 Los 10 puntos de validación Cloudflare Turnstile

La verificación server-side reside en [`apps/web/lib/turnstile.ts`](../apps/web/lib/turnstile.ts) (`verifyTurnstileToken` contra `https://challenges.cloudflare.com/turnstile/v0/siteverify`, timeout **5 000 ms**). En producción (`NODE_ENV === "production"`), si falta `TURNSTILE_SECRET_KEY` o Cloudflare falla, opera _fail-closed_ (`false`). En desarrollo/CI admite las llaves deterministas de prueba de Cloudflare (`1x00000000000000000000AA`).

| #   | Flujo de negocio                               | Ruta pública             | Server Action / Módulo                                                             |
| --- | ---------------------------------------------- | ------------------------ | ---------------------------------------------------------------------------------- |
| 1   | Registro de cuenta nueva                       | `/registro`              | `signupAction` (`apps/web/app/(auth)/registro/actions.ts`)                         |
| 2   | Recuperación de contraseña                     | `/recuperar-password`    | `requestPasswordResetAction` (`apps/web/app/(auth)/recuperar-password/actions.ts`) |
| 3   | Confirmación de pago en línea (Wompi)          | `/checkout/pago`         | `payWompiAction` (`apps/web/app/checkout/pago/actions.ts`)                         |
| 4   | Confirmación de pedido contraentrega (COD)     | `/checkout/pago`         | `payCodAction` (`apps/web/app/checkout/pago/actions.ts`)                           |
| 5   | Suscripción al boletín en pie de página        | Global (footer)          | `subscribeNewsletterAction` (`apps/web/features/newsletter/actions.ts`)            |
| 6   | Solicitud comercial corporativa / eventos      | `/empresas-y-eventos`    | `submitB2bInquiryAction` (`apps/web/features/opportunities/actions.ts`)            |
| 7   | Creación de cotización por WhatsApp / catálogo | `/carrito` y Estudio     | `createQuoteAction` (`apps/web/features/quotes/actions.ts`)                        |
| 8   | Publicación de reseña por cliente autenticado  | `/producto/[slug]`       | `createReviewAction` (`apps/web/features/reviews/actions.ts`)                      |
| 9   | Publicación de reseña por enlace posventa      | `/resena/[token]`        | `createReviewByTokenAction` (`apps/web/features/reviews/token-actions.ts`)         |
| 10  | Radicación de consulta / PQR de soporte        | `/contacto` y `/soporte` | `submitSupportTicketAction` (`apps/web/features/support/actions.ts`)               |

---

## 11. Subida de archivos, procesamiento de imágenes, Storage y Webhooks

### 11.1 Pipeline seguro de imágenes (`LUC-SEC-004`, `LUC-SEC-005`, `LUC-SEC-011`)

No existe subida directa desde el navegador a Supabase Storage (`POST /api/upload/sign` no existe); todo archivo atraviesa validación y re-codificación en memoria en el servidor (`uploadDesignAssetAction` → `uploadCustomerPhoto`):

1. **Propiedad y tamaño:** valida propiedad del `Design` (`customerId` o `cart_session`), rate limit doble (IP + dueño) y tamaño máximo (`≤ 10 MB` en fotos de cliente).
2. **Magic bytes reales (`apps/web/lib/image-sniff.ts`):** `sniffImageMime(buffer)` ignora `File.type` y verifica firmas binarias (`JPEG`, `PNG`, `WebP`, `AVIF` y cajas ISO-BMFF `ftyp` para `HEIC`/`HEIF`). El formato `SVG` está prohibido en todas las subidas, neutralizando polyglots `.html`/`.svg` y vectores XSS/XXE.
3. **Endurecimiento de `sharp@0.35.5` (`apps/web/features/personalization/sharp-safe.ts`):** bloquea al iniciar los cargadores `VipsForeignLoadNsgif`, `VipsForeignLoadTiff` y `VipsForeignLoadVips` (`sharp.block`), y procesa con `sequentialRead: true` y `failOn: "error"`. Cualquier payload oculto en el contenedor muere al re-codificar los píxeles.
4. **Presupuestos anti-decompression-bomb (`apps/web/features/personalization/normalize-raster.ts`):**
   - Antes de decodificar `HEIC`/`HEIF`, `readHeicMaxPixels` inspecciona directamente las cajas `ispe` del contenedor y aborta sin llamar a `libheif` si excede el presupuesto.
   - `RASTER_PIXEL_BUDGET` fija **`50 000 000` píxeles (50 MP)** para fotos de cliente y renders de producción, y **`25 000 000` píxeles (25 MP)** para previews, más `RASTER_MAX_ASPECT_RATIO = 20`.
5. **Borrado automático de EXIF/GPS:** `sharp(buffer).rotate()` aplica la orientación física y descarta todos los metadatos EXIF/IPTC/XMP (sin `withMetadata`), eliminando coordenadas GPS y serie del dispositivo antes de escribir en Storage con nombre UUID aleatorio y `metadata.owner_id`.

### 11.2 Los 5 buckets de Supabase Storage y autorización `/api/design-preview/*` (`LUC-SEC-001`)

| Bucket ID           | Visibilidad                                   | Tope de tamaño                                                                    | MIME permitidos                                                     | Controles de acceso y derivados                                                                                                                                                                                              |
| ------------------- | --------------------------------------------- | --------------------------------------------------------------------------------- | ------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `product-images`    | **Público** (`public = true`)                 | `5 MB` en bucket (masters admin hasta `15 MB` normalizados a WebP antes de subir) | `image/jpeg`, `image/png`, `image/webp`, `image/avif`               | Escritura exclusiva `products:write`. Genera variantes WebP `≤ 2000 px` (catálogo), `≤ 4000 px` (galería) y `≤ 800 px` con marca de agua diagonal                                                                            |
| `cms-media`         | **Público** (`public = true`)                 | `5 MB`                                                                            | `image/jpeg`, `image/png`, `image/webp`, `image/avif`               | Escritura exclusiva `cms:write` (`lib/cms-media.ts`), WebP `≤ 2000 px` q82, `alt` obligatorio (`1..300` chars) y bloqueo de borrado si está en uso en `CmsField` o `CmsFieldVersion`                                         |
| `customer-uploads`  | **Privado** (`public = false`)                | `10 MB`                                                                           | `image/jpeg`, `image/png`, `image/webp`, `image/heic`, `image/heif` | `<ownerId>/<designId\|pending>/<uuid>.<ext>` + derivado `<uuid>.canvas.webp` (`≤ 800 px`). Lectura solo con **URL firmada de 1 h** tras verificar propiedad                                                                  |
| `design-previews`   | **Privado** (`public = false`, `LUC-SEC-001`) | `3 MB`                                                                            | `image/png`, `image/webp`, `image/jpeg`                             | **Inaccesible por URL directa** (migración `046`). Servido solo por `GET /api/design-preview/[...path]` con `Cache-Control: private, max-age=300`; URLs legacy se reescriben con `previewRefToAuthorizedUrl`                 |
| `production-assets` | **Privado** (`public = false`)                | `30 MB`                                                                           | `image/png`, `image/tiff`, `application/pdf`                        | Artes finales **300 DPI** (`designs:read_production`) y etiquetas archivadas `shipping-labels/<orderId>.pdf` (`features/shipping/label-archive.ts`, magic bytes `%PDF-` y tope `15 MB`, servidas solo con `orders:shipping`) |

**Matriz de `authorizeDesignPreviewRead` (`features/personalization/preview-access.ts`, `ADR-191`):**

1. **Dueño del diseño** (`customerId` o `cart_session` coincidente) o **staff operativo con MFA `aal2`** (`ADMIN_ROLE_SETS.ALL`, excluye `CMS_EDITOR` y sesiones `aal1`): acceso a todas las variantes, incluidos snapshots `.draft.` (`thumb.webp`).
2. **Portador de token de capacidad (`?st=`, `?qt=`, `?ot=`):** validando en DB que la orden (`?ot=`), cotización (`?qt=`) o enlace compartido (`?st=`) contenga efectivamente ese `designId`, entrega únicamente variantes limpias de exhibición, **nunca** borradores `.draft.`.
3. **Cualquier otro caso:** responde `404` uniforme sin oráculo de existencia.

### 11.3 Límites de cuerpo (`LUC-SEC-006`/`007`) y webhooks criptográficos

- **`serverActions.bodySizeLimit` (`next.config.ts`) y `readBodyWithLimit` (`lib/read-body-with-limit.ts`):** abortan la lectura por streaming apenas la suma de chunks supera el presupuesto de la ruta (`413 Payload Too Large`), sin cargar megabytes en RAM.
- **Rechazo opaco en webhooks:** cualquier fallo de firma devuelve `401` sin detallar la causa al emisor, persistiendo en logs solo un `bodyHash` truncado en lugar del payload crudo.

| Proveedor y ruta                               | Tope body | Verificación de autenticidad y anti-replay                                                                                                                                                                                                                                                             | Idempotencia y endurecimiento de payload                                                                                                                                                                                   |
| ---------------------------------------------- | --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Wompi** (`POST /api/webhooks/wompi`)         | `64 KB`   | Checksum `SHA-256` (`properties` + `timestamp` + `WOMPI_EVENTS_SECRET`) con `timingSafeEqual`; ventana de **25 horas** sobre `event.timestamp` (cubre los reintentos oficiales de Wompi a +30 m, +3 h y +24 h con el mismo timestamp firmado); coincidencia estricta `event.environment === WOMPI_ENV` | `WebhookEvent` (`externalId = ${tx.id}-${status}-${timestamp}`), saga monotónica, recálculo en centavos y **allowlist estricta de metadatos** (`LUC-SEC-009`). Detalle en [`integrations/wompi.md`](integrations/wompi.md) |
| **Resend** (`POST /api/webhooks/resend`)       | `128 KB`  | Firma **Svix HMAC-SHA256** sobre `${svix-id}.${svix-timestamp}.${rawBody}` (clave base64 tras `whsec_`, `RESEND_WEBHOOK_SECRET` obligatorio en prod) con ventana anti-replay de **±5 minutos**                                                                                                         | Deduplicación en `WebhookEvent`, upsert monotónico en transacción (un bounce/complaint nunca se degrada por un evento viejo), baja automática y allowlist (`LUC-SEC-009`)                                                  |
| **Aveonline** (`POST /api/webhooks/aveonline`) | `32 KB`   | Secreto `AVEONLINE_WEBHOOK_SECRET` comparado con `timingSafeEqual` en `x-aveonline-secret` o `payload.token` (`?secret=` **deshabilitado** por defecto salvo `AVEONLINE_ALLOW_QUERY_SECRET=true`)                                                                                                      | Exige `trackingNumber` existente en `Order`, estados monotónicos (`ShipmentEvent`), dedup determinista `hasCarrierTimestamp` (`…-no-ts` si falta fecha del carrier) y allowlist cerrada (`LUC-SEC-003`)                    |

---

## 12. Clasificación de datos, PII, IA cero-PII, supply chain y CI/CD

### 12.1 Niveles de clasificación de datos y cifrado

| Nivel                             | Definición                                       | Ejemplos en Lucams Shop                                                                    | Almacenamiento permitido                                             | Regla en logs                                              |
| --------------------------------- | ------------------------------------------------ | ------------------------------------------------------------------------------------------ | -------------------------------------------------------------------- | ---------------------------------------------------------- |
| **Público**                       | Información destinada a internet                 | Catálogo publicado, páginas CMS, precios, reseñas aprobadas                                | Cualquier capa                                                       | Permitido                                                  |
| **Interno**                       | Operativo sin PII directa                        | `Order.total`, `Customer.supabaseUserId`, contadores `FunnelEventDaily`, métricas de crons | Postgres / paneles `/admin/*`                                        | Permitido                                                  |
| **Confidencial — PII directa**    | Identifica o contacta a una persona natural      | Correo, teléfono, nombre, documento, dirección, IP cruda                                   | Postgres con RLS + `REVOKE ALL`, cookie `AES-256-GCM`                | **Redactado** (`REDACT_KEYS` + `scrubPii` en `logger.ts`)  |
| **Restringida — Datos sensibles** | Imágenes con posibles rostros/menores (Ley 1581) | Fotos del Estudio (`customer-uploads`) y previews/renders personales                       | Buckets privados + URL firmada corta / proxy autenticado + purga TTL | **Nunca** en logs                                          |
| **Regulada — Financiera**         | Trazabilidad de transacciones de pago            | `wompiTransactionId`, montos, estado; **jamás** PAN, CVV ni fecha de expiración            | Postgres con RLS y `AdminActionLog`                                  | `transactionId` permitido; PAN/CVV inexistentes en sistema |
| **Crítica — Secretos de sistema** | Llaves, tokens, contraseñas y semillas HMAC      | `SUPABASE_SECRET_KEY`, `CSRF_SECRET`, `WOMPI_*`, `CRON_SECRET`, `BACKUP_GPG_PASSPHRASE`    | `.env*` gitignored, Vercel Env Vars, GitHub Secrets y Supabase Vault | **Nunca** en logs                                          |

- **Cifrado y recuperación ante desastres (DR):** TLS 1.2+ con HSTS en tránsito; cifrado en reposo en Supabase Postgres y Storage; respaldos diarios (`backup.yml`) cifrados simétricamente con **GPG `AES-256`** antes de subir a Cloudflare R2 y verificados cada mes mediante restauración real en un Postgres limpio por `.github/workflows/dr-drill.yml` (`ADR-059`). Objetivos operativos: **RPO ≤ 24 h** y **RTO ≤ 4 h**, con rollback instantáneo de aplicación probado gracias a migraciones **expand-then-contract** (`CONVENTIONS.md`).

### 12.2 Mapa de PII por modelo Prisma

| Modelo Prisma                                                            | Campos sensibles / PII                                                                                                                  | Controles activos y ciclo de vida                                                                                                |
| ------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| `Customer` y `Address`                                                   | `email`, `name`, `phone`, `birthMonth`, `birthDay`, `recipientName`, `line1`, `line2`, `neighborhood`, `deliveryNotes`                  | RLS cerrado; autogestión en `/mi-cuenta`; borrado/anonimización en `deleteCustomerAccount`                                       |
| `Order`                                                                  | `email`, `phone`, `shippingAddress`, `recipientName`, `recipientPhone`, `giftMessage`, `billing*`, `publicAccessTokenHash`              | Enmascarado RSC (`maskOrderForActor`) sin `orders:read_pii`; anonimizado al suprimir cuenta conservando el soporte contable      |
| `Contact`, `ContactIdentity` y `MergeCandidate`                          | `primaryEmail`, `primaryPhoneE164`, `displayName`, `documentNumber`, `normalizedValue`, `rawValue`, `evidenceJson`, `mergeSnapshotJson` | `contacts:read_pii`, aislamiento `isStaff`/`isGift` y purga/anonimización en `scrubContactOnErasureTx`                           |
| `Organization` y `Opportunity`                                           | `name`, `taxIdNumber`, `contactName`, `contactEmail`, `contactPhone`                                                                    | Acceso exclusivo `SUPERADMIN` y `OPERATIONS_MANAGER` (`opportunities:manage`)                                                    |
| `Quote`, `SupportTicket` y `SupportTicketMessage`                        | `customerName`, `customerEmail`, `customerWhatsapp`, `name`, `email`, `body`, hashes de tokens                                          | Tokens opacos; en supresión de cuenta se redactan mensajes y metadatos de contacto                                               |
| `Design` y `DesignAsset`                                                 | Fotos crudas en `customer-uploads`, previews en `design-previews`, renders 300 DPI en `production-assets`, `canvasData`                 | Buckets privados, moderación previa a `SHIPPED` y purgas `7 d` / `30 d` / `90 d`                                                 |
| `AbandonedCart`, `NewsletterSubscriber`, `StockAlertSubscription`        | `email`, `phone`, `recoveryToken`                                                                                                       | Purga a `90 d` (`AbandonedCart`), baja RFC 8058 en un clic y eliminación en supresión de cuenta                                  |
| `Consent`                                                                | `email`, `phone`, `ipAddress`, `userAgent`, `scope`, `accepted`, `version`                                                              | Append-only Ley 1581; en supresión se inserta revocación y se anonimizan `email`/`phone`/`ipAddress`/`userAgent` en el historial |
| `BlockedIdentity`                                                        | `type` (`PHONE`, `EMAIL`, `ADDRESS`), `value` normalizado, `reason`                                                                     | Interés legítimo antifraude contraentrega (`/admin/finanzas/bloqueos`, `finance:manage`)                                         |
| `WebhookEvent`, `EmailEvent`, `SecurityEvent`, `ErrorLog`, `ErrorReport` | `to`, metadatos allowlist (`LUC-SEC-009`), `ipHash`, mensajes pasados por `scrubPii`                                                    | Purga automática en `purge-event-logs` (`180 d` eventos / `90 d` errores)                                                        |
| `AdminUser` y `AdminActionLog`                                           | `email`, `name`, `ip`, `userAgent`, `before`/`after`                                                                                    | Acceso exclusivo `SUPERADMIN`; correos de titulares suprimidos se redactan puntualmente en `AdminActionLog`                      |

### 12.3 Redacción cero-PII en IA (Gemini), logs (`logger.ts`) y analítica (GA4)

1. **Google Gemini con cero PII y cero fotos (`generativelanguage.googleapis.com/v1beta`):**
   - _Asistente de ideas del Estudio (`features/personalization/ai-suggest.ts`):_ `sanitizeOccasion` recorta a 120 caracteres y reemplaza correos, teléfonos y documentos antes de consultar ideas textuales; jamás envía imágenes.
   - _Copiloto interno de soporte (`features/ai/support-copilot.ts`):_ `sanitizeSupportTextForAi` sustituye determinísticamente URLs (`[enlace]`), correos (`[correo]`), referencias `LCM-*`/`COT-*`/`OP-*` (`[referencia]`), teléfonos colombianos (`[teléfono]`), direcciones (`[dirección]`), secuencias numéricas de 6–16 dígitos (`[documento]`) y nombres del cliente (`[cliente]`). El saludo y referencia se rehidratan localmente en servidor tras una segunda pasada del sanitizador.
2. **Logger estructurado (`apps/web/lib/logger.ts`):** enmascara por nombre de clave (`/(secret|token|key|password|cookie|authorization|email|phone)$/i`, además de `to`, `ip`, `ipaddress`, `whatsapp`, `documentnumber`) y limpia strings/stacks con `scrubPii` (`[EMAIL]`, `[PHONE]`) antes de escribir en consola o en `ErrorLog`/`ErrorReport` (detalle de eventos en [`OBSERVABILITY.md`](OBSERVABILITY.md)).
3. **Google Analytics 4 y banner de cookies (`lib/analytics.ts`, `lib/cookie-consent.ts`):** `AnalyticsLoader` bloquea `gtag.js` mientras `hasAnalyticsConsent()` sea `false`. Al revocar **Analíticas**, activa `window["ga-disable-<ID>"] = true` y borra `_ga`, `_ga_*` y `lucams_utm`. Con consentimiento activo, `sanitizeAnalyticsUrl` excluye `/admin*`, reemplaza tokens de `/pedido/*`, `/cotizacion/*`, `/resena/*`, `/carrito/recuperar/*`, `/d/*` y `/soporte/*` por `[redacted]` y filtra query params por allowlist.

### 12.4 Seguridad de supply chain y CI/CD (`protect-ramas-criticas`)

- **Supply chain:** `pnpm-lock.yaml` con `--frozen-lockfile`, `pnpm audit --prod --audit-level=high` ejecutado en cada PR dentro del job `quality` (incluso en el fast-path documental; advisories solo de desarrollo se acotan con overrides revisados en `pnpm-workspace.yaml`), Dependabot semanal agrupado (`.github/dependabot.yml`, majors bloqueados para revisión manual), GitHub Actions pineadas por SHA completo en todos los workflows y prohibición de instalar paquetes recién publicados sin diligencia previa.
- **Protección de ramas y CI (`.github/workflows/ci.yml`):**
  - `GITHUB_TOKEN` con permisos mínimos (`contents: read` por defecto) y sin uso inseguro de `pull_request_target`.
  - **Ruleset `protect-ramas-criticas` (`id: 26248226`)** activo sobre `develop` (STG) y `production` (PRD): exige Pull Request con rama al día (`strict: true`), `bypass_actors: []` (ni administradores pueden saltarse los gates), bloqueo de force-push/borrado y **5 checks obligatorios**: (1) `Typecheck + Lint + Build` (incluye Prettier y `pnpm audit --prod`), (2) `Vitest tests (unit + integración con Postgres)`, (3) `RLS behavior (rls-matrix contra Supabase local)`, (4) `E2E + a11y + Lighthouse — Playwright` y (5) `Gitleaks secret scan`.

---

## 13. Telemetría `SecurityEvent`, catálogo `LUC-SEC-*`, `BlockedIdentity` e IRP

### 13.1 Eventos de seguridad persistentes (`SecurityEvent`, `LUC-SEC-008`)

`recordSecurityEvent` ([`apps/web/lib/security-events.ts`](../apps/web/lib/security-events.ts)) persiste señales forenses duraderas con `ipHash` truncado (nunca IP en claro):

| Evento (`SECURITY_EVENT`)   | Cuándo se emite                                                                           | Regla de alerta asociada (`alerts.ts`)                                              |
| --------------------------- | ----------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| `auth.login.fail`           | Credenciales inválidas en `/login` de clientes                                            | Telemetría forense (frenado en tiempo real por rate limit `5 / 15 min` IP + email)  |
| `auth.admin_login.fail`     | Credenciales inválidas o usuario sin rol activo en `/admin/login`                         | `security_admin_login_fails` (**alta**): dispara si `SUM(count) >= 5` en 15 minutos |
| `webhook.invalid_signature` | Firma, checksum, timestamp o secreto inválido en `/api/webhooks/{wompi,aveonline,resend}` | `security_webhook_invalid` (**media**): dispara si `SUM(count) >= 3` en 5 minutos   |

Para impedir amplificación de escrituras bajo ataque (`LUC-SEC-008`), `recordSecurityEvent` agrupa por minuto (`<event>:<ipHash>:<source>:<bucketMinuto>`): las primeras **5** ocurrencias hacen upsert directo y las siguientes se coalescen en memoria (`FLUSH_EVERY = 10`, techo `MAX_TRACKED_KEYS = 10 000`).

### 13.2 Catálogo de controles `LUC-SEC-*` trazables en código

| Código                        | Control implementado y verificado por pruebas                                                                                                                    |
| ----------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `LUC-SEC-001`                 | Privatización del bucket `design-previews` (migración `046`) y lectura exclusiva vía `/api/design-preview/[...path]` con `authorizeDesignPreviewRead`            |
| `LUC-SEC-003`                 | Protección estricta de ramas (`develop`, `production` con ruleset `protect-ramas-criticas`) y allowlist cerrada en el webhook de Aveonline                       |
| `LUC-SEC-004` / `LUC-SEC-005` | Normalización raster (`normalizeRasterImage`), presupuestos de `25 MP` / `50 MP`, ratio `≤ 20:1` y pre-chequeo de cajas `ispe` en HEIC/HEIF antes de decodificar |
| `LUC-SEC-006`                 | Tope ajustado de `serverActions.bodySizeLimit` en `next.config.ts` acompañado de subidas fragmentadas en el Estudio                                              |
| `LUC-SEC-007`                 | Lector en streaming `readBodyWithLimit` aplicado por ruta en webhooks, ingesta RUM/embudo y endpoints JSON                                                       |
| `LUC-SEC-008`                 | Coalescencia en memoria y agregación por minuto (`dedupKey` + `count`) en `SecurityEvent` contra amplificación de DB                                             |
| `LUC-SEC-009`                 | Allowlists cerradas de metadatos persistidos en `WebhookEvent` para Wompi y Resend (minimización de PII)                                                         |
| `LUC-SEC-010`                 | Función SQL `purge_rate_limit_buckets()` y job diario `lucams-purge-rate-limits` (> 7 días) con latido en `AlertState`                                           |
| `LUC-SEC-011`                 | Actualización de `sharp` `0.35.5` y bloqueo preventivo de cargadores `VipsForeignLoadNsgif`, `VipsForeignLoadTiff` y `VipsForeignLoadVips`                       |
| `LUC-SEC-013`                 | Modelo de amenazas de `cart_session`: rotación ante `CART_IDENTITY_MISMATCH` y borrado explícito en logout                                                       |

### 13.3 Bloqueo anti-abuso (`BlockedIdentity`) y divulgación responsable (`RFC 9116`)

- **Riesgo contraentrega (`BlockedIdentity` + `assessCodRisk`):** [`apps/web/features/anti-abuse/blocklist-service.ts`](../apps/web/features/anti-abuse/blocklist-service.ts) y `/admin/finanzas/bloqueos` bloquean identidades reincidentes por `PHONE` (`+573XXXXXXXXX`), `EMAIL` o `ADDRESS` (`Order.shippingAddressKey`), combinados con historial de `noShowAt` y velocidad de órdenes pendientes antes de habilitar COD.
- **Divulgación coordinada de vulnerabilidades:** canal oficial único **`security@lucamsshop.com`**, publicado en `/legal/security` y en [`apps/web/public/.well-known/security.txt`](../apps/web/public/.well-known/security.txt) (`Contact: mailto:security@lucamsshop.com`, `Preferred-Languages: es, en`, `Canonical: https://lucamsshop.com/.well-known/security.txt`, `Policy: https://lucamsshop.com/legal/security`). Compromiso público vigente (Versión 3): acuse de recibo en **≤ 3 días hábiles**, confidencialidad del investigador, puerto seguro para reportes de buena fe y reconocimiento público opcional al cerrar el hallazgo.

### 13.4 Plan de Respuesta a Incidentes — IRP (NIST SP 800-61) y Runbooks

| Severidad        | Definición                                                                                                             | SLA de respuesta     |
| ---------------- | ---------------------------------------------------------------------------------------------------------------------- | -------------------- |
| **P0 — Crítica** | Brecha activa de PII/fotos privadas, secreto crítico expuesto, cobros/reembolsos fraudulentos o caída total por ataque | Inmediata (`< 15 m`) |
| **P1 — Alta**    | Vulnerabilidad explotable confirmada, campaña sostenida contra `/admin/login` o webhooks, o colisión grave pago/stock  | `< 2 horas`          |
| **P2 — Media**   | Anomalía acotada, degradación parcial de integración o vulnerabilidad con precondiciones complejas                     | `< 24 horas`         |
| **P3 — Baja**    | Endurecimiento preventivo o CVE bajo en dependencia sin vector alcanzable                                              | `< 7 días`           |

**Las 6 fases operativas (NIST SP 800-61):**

1. **Preparación:** simulacro mensual automatizado `dr-drill.yml`, contactos de escalamiento en [`OPERATIONS.md`](OPERATIONS.md) y verificaciones continuas de RLS/secretos.
2. **Detección:** alertas críticas por Resend (`ALERT_EMAIL`), `/admin/notificaciones`, `/admin/observability`, monitor externo `uptime-monitor-prd` (STG → PRD) y buzón `security@lucamsshop.com`.
3. **Contención inmediata según vector:**
   - _Credencial o secreto expuesto:_ rotar en el proveedor, Vercel (`production`/`preview`) y Supabase Vault + redesplegar + revocar la llave anterior.
   - _Cuenta administrativa sospechosa:_ desactivar `AdminUser` en `/admin/usuarios`, revocar sesiones globales en Supabase Auth y auditar `AdminActionLog` por `adminId`.
   - _DDoS o abuso volumétrico de webhook/origen:_ activar modo _Under Attack_ o regla WAF por IP/ASN en Cloudflare / Vercel Firewall.
   - _Corrupción de datos o regresión grave:_ activar `NEXT_PUBLIC_MAINTENANCE_MODE=1` o ejecutar `vercel rollback` inmediato; restaurar desde PITR o R2 si aplica.
4. **Erradicación:** preservar evidencia forense (`SecurityEvent`, `AdminActionLog`, `WebhookEvent`, `ErrorLog` por `X-Request-Id`), corregir la causa raíz y añadir test de regresión (`pnpm test` / `make test-rls`).
5. **Recuperación:** restablecer operación normal, conciliar órdenes/pagos y rehabilitar accesos verificados.
6. **Lecciones aprendidas y deber legal SIC:** redactar postmortem _blameless_ temporal en `tmp/incidentes/YYYY-MM-DD-<slug>.md` (ver plantilla en [`OBSERVABILITY.md`](OBSERVABILITY.md)), consolidar controles permanentes en este documento vivo y ejecutar `make clean-tmp`. Si hubo afectación a datos personales, **notificar a la SIC dentro de los 15 días hábiles siguientes a la detección** (Ley 1581 de 2012, arts. 17 lit. k y 18 lit. g) e informar a los titulares afectados.

#### Runbook `IRP-001` — Exposición de `SUPABASE_SECRET_KEY` (`sb_secret_*`) u otro secreto crítico (`P0`, ETA 15 min)

1. En el panel de Supabase (`Project Settings → API keys → Secret keys`), crear una **nueva secret key** (Supabase admite múltiples llaves activas en paralelo sin tiempo fuera de servicio).
2. Actualizar `SUPABASE_SECRET_KEY` en Vercel (`Settings → Environment Variables`, entornos `production` y `preview`) y en archivos locales mediante subshell seguro sin eco.
3. Disparar redespliegue a producción y verificar que `GET /api/health/all` responda `200`.
4. **Revocar explícitamente** la llave comprometida en el panel de Supabase (crear la nueva no desactiva la anterior).
5. Auditar los últimos 7 días de logs de Supabase Auth, Storage y tablas críticas (`Order`, `Customer`, `AdminUser`) en busca de accesos anómalos; documentar postmortem en 24 h.

#### Runbook `IRP-002` — Tráfico anómalo o fallos masivos de firma en webhook Wompi (`P1`, ETA 2 h)

1. Revisar en `/admin/observability` la tarjeta de webhooks recientes y en `SecurityEvent` los registros `webhook.invalid_signature` agrupados por `ipHash` y `metadata.source = "wompi"`.
2. Si fallan envíos legítimos, verificar coincidencia de `WOMPI_EVENTS_SECRET` y `WOMPI_ENV` frente al panel de Wompi y revisar avisos oficiales del proveedor.
3. Si se trata de inundación hostil desde IPs concretas, aplicar regla temporal de rate limit/bloqueo en Cloudflare WAF sobre `/api/webhooks/wompi` y conciliar órdenes pendientes contra el panel Wompi.

#### Runbook `IRP-003` — Incidente con exposición de datos personales / PII (`P0`, ETA contención 15 min · SIC ≤ 15 días hábiles)

1. Contener y cerrar de inmediato el vector técnico (revocar llave, corregir ruta/política y desplegar fix de urgencia) preservando evidencia forense (`X-Request-Id`, `SecurityEvent`, `AdminActionLog`).
2. Determinar alcance exacto: categorías de datos afectadas (contacto, direcciones, fotos del Estudio), ventana temporal y número de titulares impactados.
3. Notificar a los titulares afectados en lenguaje claro indicando medidas adoptadas y canales de atención (`habeas-data@lucamsshop.com`), y presentar el reporte oficial ante la **SIC dentro de los 15 días hábiles** siguientes a la detección conforme a [`COMPLIANCE.md`](COMPLIANCE.md).

#### Runbook `IRP-004` — Colisión pago/stock post-captura (`saga_paid` / `needsReconciliation`, `P1`, ETA 2 h)

1. Abrir `/admin/pedidos` filtrando **«Necesitan atención»** (`needsReconciliation = true`) y cruzar el ledger `InventoryLog` junto con la notificación `stock_sale_lost:<variantId>`.
2. Contactar de inmediato al comprador ofreciendo reposición prioritaria o reembolso íntegro con cupón de compensación, registrando la resolución y nota en `/admin/pedidos/[number]` (`AdminActionLog`).
3. Verificar integridad del `SELECT ... FOR UPDATE` / decremento condicional e incorporar prueba de concurrencia si existió regresión.

---

## 14. Verificación extremo a extremo

Comandos de comprobación rápida de la postura de seguridad:

```bash
# 1. Postura estática de migraciones SQL, RLS, REVOKE y buckets de Storage
make verify-db

# 2. Suite de integración RLS contra Postgres real (cobertura 100 % + aislamiento entre clientes)
make test-rls

# 3. Escaneo completo de secretos y auditoría de dependencias de producción
gitleaks git --config .gitleaks.toml .
pnpm audit --prod --audit-level=high

# 4. Verificación en vivo de cabeceras HTTP/CSP y rechazo 401 de webhooks sin firma válida
curl -sSI https://lucamsshop.com | grep -iE 'strict-transport|x-frame|content-security|x-content-type'
curl -sS -o /dev/null -w '%{http_code}\n' -X POST https://lucamsshop.com/api/webhooks/wompi \
  -H 'Content-Type: application/json' -d '{"fake":"payload"}'
```
