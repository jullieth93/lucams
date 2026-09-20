# Auditoría Integral de Seguridad, Red Team Controlado y Gate de Producción — LuCam's Shop

> **FASE A — AUDITORÍA** ejecutada según `docs/AUDITORIA_360.md`. Sin remediación. Documento canónico de la auditoría del 2026-09-19.

---

## A. METADATOS

| Campo | Valor |
|---|---|
| Fecha de auditoría | 2026-09-19 |
| Commit del working tree | `3e1dad0eb2098fdbca0b5d179f1c6833ff8135eb` |
| develop (local y origin) | `3e1dad0` |
| production (local y origin) | `3e1dad0` |
| Diff `production..develop` | **Vacío** (ramas sincronizadas) |
| Estado del working tree | Limpio salvo `docs/AUDITORIA_360.md` (modificación preexistente del propietario, preservada intacta) |
| Commit desplegado en PRD | `3e1dad0` — deployment `dpl_2Fgyyu9…` Ready 2026-09-19 14:28 -05; CI run 35464444766 success (evidencia: `vercel ls` + `gh run list`, obtenida por Auditor G) |
| Migraciones Prisma en repo | 59 (`packages/db/prisma/migrations/`) |
| Migraciones Supabase en repo | 34 (`supabase/migrations/`, 00000000000002→035) |
| Migraciones aplicadas en LOCAL | 59 Prisma (`_prisma_migrations`, verificado vía psql) |
| Migraciones aplicadas en STG/PRD | **NO VERIFICADO en vivo** (sin acceso psql autorizado a esas bases; el commit 3e1dad0 documenta "cron purga agendado en PRD") |
| Entornos | LOCAL (Supabase local en podman, 127.0.0.1:54322 — verificado activo), STG (no contactado), PRD (https://lucamsshop.com — solo pasivo/bajo impacto), previews Vercel (bajo SSO, verificado) |
| Autorizaciones | El propietario autorizó "lo más completo posible" con los accesos disponibles en la VM (gh, vercel CLI, Supabase LOCAL). No se entregaron credenciales de cuentas de prueba con roles; las pruebas dinámicas de auth/RBAC con usuarios reales quedaron **BLOQUEADAS POR FALTA DE ACCESO** (ver §U) |
| Equipo de auditoría | Orquestador + 8 auditores por dominio (A: DNS/TLS/edge · B: auth/MFA/sesiones · C: RBAC/RLS/Storage · D: pagos/lógica de negocio · E: APIs/webhooks/crons · F: uploads/navegador/IA · G: CI/CD/supply chain/IAM · H: logging/backups/DR) + 1 verificador adversarial independiente (refutación de medios + unknown-unknowns) |
| Herramientas | dig, openssl s_client, curl, psql, jq, gh CLI, vercel CLI, node 22, pnpm 11, vitest, eslint, tsc, prettier, pnpm audit. **No disponibles:** gitleaks (binario), nmap, supabase CLI, testssl/sslyze, k6 — sus chequeos quedan cubiertos por CI (gitleaks-action) o marcados como no verificados |
| Limitaciones | Sin pruebas activas contra STG/PRD (sin autorización explícita de pentest activo ni cuentas de prueba); sin acceso a dashboards (registrador, Cloudflare, Supabase cloud, Wompi, Aveonline, Resend); sin lectura de archivos `.env*` (prohibida por reglas de compromiso); TLS 1.0/1.1 y HTTP/3 no comprobables desde el build local de openssl/curl |

### Comandos y gates ejecutados (todos sobre commit 3e1dad0)

| Comando | Entorno | Exit | Resultado |
|---|---|---|---|
| `pnpm lint` (eslint --max-warnings 0) | LOCAL | 0 | Limpio |
| `pnpm typecheck` (tsc --noEmit) | LOCAL | 0 | Limpio |
| `pnpm test` (vitest run) | LOCAL | 0 | **4077 passed / 8 skipped** (256 archivos; los 8 skips son tests live-only de Aveonline) |
| `pnpm build` (next build) | LOCAL | 0 | Build de producción exitoso |
| `pnpm format:check` | LOCAL | 0 | Limpio |
| `pnpm audit --prod` | LOCAL | 0 | **0 vulnerabilidades** (deps de producción) |
| `pnpm audit` (completo, incl. dev) | LOCAL | 0 con advisories | 4 advisories dev-only (2 high extract-zip sin parche publicado; 2 moderate qs) — reachability nula en despliegue |
| `make test-rls` (rls-coverage + rls-matrix) | LOCAL vs Supabase real | 0 | **56/56 passed** (toda tabla de public con RLS + comportamiento de policies anon/authenticated) |
| Inventario catálogo DB LOCAL (psql) | LOCAL | 0 | 58 tablas public, **0 sin RLS**, 22 policies public + 13 storage, 1 función SECURITY DEFINER, 10 pg_cron jobs, 7 event triggers, grants anon/authenticated = 0, service_role solo REFERENCES/TRIGGER/TRUNCATE |
| Recon pasivo PRD (dig/openssl/curl, ~30 requests) | PRD | — | Ver §L |
| `gh api` (branch protection, rulesets, security_and_analysis, collaborators, runs) | GitHub | — | Ver §M/O |
| `vercel ls / env ls / project inspect` | Vercel | — | Ver §M |
| gitleaks | — | — | **NO EJECUTADO localmente** (binario no instalado; prohibido instalar sin aprobación). Cobertura sustituta: job `secrets-scan` en CI con fetch-depth 0 (último run en `production` verde) + escaneo manual de patrones sobre los 1.129 commits del historial (0 hits de secretos reales — ver §O) |

CI verde no equivale a seguridad aprobada: los gates anteriores se tratan como evidencia de higiene, no como prueba de controles.

---

## B. VEREDICTO EJECUTIVO

# **`PRODUCCIÓN CONDICIONADA`**

- **0 hallazgos CRÍTICOS, 0 ALTOS.** 7 medios (3 de ellos media-baja tras refutación adversarial), ~45 bajos/informativos en ledger.
- La postura de ingeniería es madura y verificada con evidencia: RLS estructural en el 100 % de tablas (56/56 tests RLS verdes contra PostgreSQL real), grants revocados a anon/authenticated, RBAC admin con MFA TOTP obligatorio y step-up en reembolsos, webhooks con firma timing-safe + idempotencia, precios siempre recalculados server-side, backups cifrados con DR drill real mensual, CSP con nonce, historial git de 1.129 commits limpio de secretos, actions 100 % pineadas por SHA.
- **Condiciones P0 (esperadas en ≤7 días):** ① activar branch protection/rulesets con required checks en `production` y `develop` — hoy un push directo despliega a PRD sin gate (condición de gate §66 "branch/ruleset sin control"); ② activar secret scanning + push protection + Dependabot security updates en el repo **público** (gratis, 3 clics); ③ cerrar el hueco de reconciliación del cron expire-pending (una venta APPROVED con webhook perdido puede auto-cancelarse a las 24 h sin alerta); ④ corregir el falso 503 estructural de `/api/health/crons` que degrada el dead-man switch (activo AHORA MISMO en PRD).
- **Condiciones P1 (≤30 días):** step-up MFA en conciliación COD y autogestión de MFA; persistencia + alertas de eventos de seguridad (hoy solo logs efímeros); verificación en vivo de RLS/grants/crons en PRD (§U).
- Ningún activo crítico quedó sin inventariar; varios quedaron sin verificación en vivo por falta de acceso (§U) — eso, y no una vulnerabilidad demostrada, es lo que impide el veredicto "APTO".
- La tienda ya opera en PRD en modo `full`: las condiciones P0 no exigen detener ventas, pero sí ejecutarse esta semana.

---

## C. DIFERENCIAS ENTRE CANDIDATO Y PRD

| Área | Develop/STG | PRD | Riesgo | Acción |
|---|---|---|---|---|
| Código | `3e1dad0` | `3e1dad0` (deploy Ready, CI verde) | Ninguno: diff vacío | Ninguna |
| Migraciones Prisma/Supabase | 59+34 en repo, 59 aplicadas en LOCAL | Documentado aplicado ("cron purga agendado en PRD"), **no verificado en vivo** | Drift silencioso posible | `prisma migrate status` + query de catálogo en PRD (§U-1) |
| Env vars | `.env.local` (no leído) / `.env.stg` (no leído) | 31 vars Production, todas Encrypted (solo nombres vía `vercel env ls`) | Valores no auditables por diseño | Comparar hashes STG/PRD de CRON_SECRET (§U-3) |
| Feature flags | `STORE_MODE` fail-closed hacia `full` | `full` (declarado y consistente con checkout en vivo) | Bajo | Ninguna |
| Crons | 10 jobs pg_cron en LOCAL | ≥1 confirmado en PRD (purga 035, causa del 503 de health) | Jobs faltantes = degradación silenciosa | Query `cron.job` en PRD (§U-2) |
| RLS/grants | Verificado LOCAL (0 tablas sin RLS, grants mínimos) | Migraciones con verificaciones inline que abortan, pero **sin foto en vivo** | Grants residuales de otros roles (H-C1) | Queries de catálogo en PRD (§U-1) |
| Config Supabase Auth | Plantillas y SMTP scriptados (`supabase-auth-email-config.mjs`) | OTP/TTL/redirect URLs/throttling GoTrue **no verificados** | Config débil invisible desde el repo | Management API / dashboard (§U-4) |

---

## D. INVENTARIO DE ACTIVOS

| Activo | Tipo | Fuente | Proveedor | Entorno | Propietario | Exposición | Criticidad | Estado | Evidencia | Acción |
|---|---|---|---|---|---|---|---|---|---|---|
| lucamsshop.com | Dominio | RDAP/dig | Registrador vía mi.com.co | PRD | jullieth93 (personal) | Internet | Crítica | Activo; expira **2027-07-19**; sin alerta de renovación | RDAP Verisign | Auto-renew + alerta (N1) |
| DNS lucamsshop.com | Zona | dig | Cloudflare (romina/armando.ns) | PRD | jullieth93 | Internet | Crítica | Consistente entre resolutores; sin huérfanos ni dangling | dig @8.8.8.8/@1.1.1.1 | Ninguna |
| Cert TLS apex | Certificado | openssl | Let's Encrypt YR2 (vía Vercel) | PRD | Vercel (auto) | Internet | Alta | Válido hasta 2026-10-18 (29 días, ciclo LE normal) | s_client | Ninguna |
| Cert TLS www | Certificado | openssl | LE YR1 | PRD | Vercel (auto) | Internet | Alta | Válido hasta 2026-12-17 | s_client | Ninguna |
| Repo jullieth93/lucams | Código | gh api | GitHub | — | jullieth93 | **Público** | Crítica | Sin branch protection ni secret scanning (F-01/F-02) | gh api | P0 |
| Proyecto Vercel "Lucams" | Hosting/edge | vercel CLI | Vercel (team personal) | PRD/previews | jullieth93 | Internet | Crítica | Preview protection (SSO) activa en todos los deployments | curl 302→sso | Ninguna |
| Supabase PRD (zxkucphbsfygakgxcnik) | DB/Auth/Storage | docs/scripts | Supabase | PRD | jullieth93 | Internet (PostgREST) | Crítica | Config Auth no verificada; tier declarado Free (sin PITR) | docs/OPERATIONS.md | §U |
| Supabase STG | DB/Auth/Storage | scripts | Supabase | STG | jullieth93 | Internet | Media | Aloja el monitor de uptime de PRD (diseño intencional) | monitor-uptime-stg.sql | Ninguna |
| Supabase LOCAL (podman) | DB/Auth/Storage | psql | Local | LOCAL | dev | localhost | Baja | Verificado completo (§R/§N) | psql | Ninguna |
| Bucket R2 backups | Storage backups | workflows | Cloudflare R2 | PRD | jullieth93 | Privado | Crítica | Backups cifrados diarios + drill mensual; object-lock no verificado | backup.yml | §U-8 |
| Wompi | Pagos | código | Wompi | PRD+sandbox | jullieth93 | Internet | Crítica | Hosted checkout, firma integridad + webhook verificado | lib/wompi.ts | §U-5 (dashboard) |
| Aveonline | Logística | código | Aveonline | PRD | jullieth93 | Internet | Alta | Webhook con secreto timing-safe, default seguro | route.ts:52-94 | §U-6 |
| Resend | Email transaccional | código/DNS | Resend | PRD | jullieth93 | Internet | Alta | DKIM/SPF send.mail presentes; webhook Svix verificado | dig TXT | Ninguna |
| Cloudflare Turnstile | Anti-bot | código | Cloudflare | PRD | jullieth93 | Internet | Media | Fail-closed en prod, secret requerido | lib/turnstile.ts | L-E3 |
| Google Gemini | IA | código | Google | PRD | jullieth93 | Saliente | Media | Sin PII ni fotos en prompts; guard E-2 verificado | gemini-provider.ts | Ninguna |
| Cuenta GitHub jullieth93 | Identidad | gh api | GitHub | — | personal | Internet | Crítica | Único colaborador (bus factor 1) | collaborators | Riesgo residual |
| Cuenta Vercel | Identidad | vercel whoami | Vercel | — | personal | Internet | Crítica | Team personal single-member (inferido) | CLI | Riesgo residual |
| Correo (Cloudflare Email Routing) | MX | dig | Cloudflare | PRD | jullieth93 | Internet | Alta | MX route1/2/3.mx.cloudflare.net; DMARC quarantine | dig | L-A1 |
| VM dev (esta máquina) | Equipo operativo | local | — | LOCAL | jullieth93 | LAN | Alta | Aloja `.env*` (no leídos), token `sbp_` en tmp/ (N5), keys SSH | filesystem | N5, §U-9 |

Activos adicionales: `lucams-shop.vercel.app` y aliases de preview (todos bajo SSO), `send.mail.lucamsshop.com` (SPF amazonses de Resend), `resend._domainkey.mail` (DKIM), buckets Storage (5: `product-images`, `design-previews`, `cms-media` públicos; `customer-uploads`, `production-assets` privados), pg_cron jobs (13 versionados), Vault (0 secretos en LOCAL; PRD no verificado), workflows GitHub (4), Supabase Management API token (`sbp_`, tmp gitignored). **Bus factor 1 verificado en GitHub; inferido en Vercel/Supabase/registrador/Cloudflare.**

---

## E. ARQUITECTURA Y TRUST BOUNDARIES

```mermaid
flowchart LR
    subgraph Internet
        U[Cliente browser]
        A[Atacante anónimo]
        W[Wompi]
        AV[Aveonline]
        R[Resend]
    end
    subgraph Vercel[Vercel Edge + Serverless]
        P[proxy.ts: CSP nonce, CORS, authz admin, idle-timeout]
        N[Next.js 16: RSC + 65 Server Actions + 46 route handlers]
    end
    subgraph Supa[Supabase PRD]
        DB[(PostgreSQL: RLS 100%, grants revocados, triggers, pg_cron, pg_net, Vault)]
        AUTH[GoTrue Auth: OTP, TOTP, sesiones]
        ST[[Storage: 5 buckets, signed URLs 1h]]
    end
    subgraph CF[Cloudflare]
        DNS[DNS + Email Routing]
        R2[(R2: backups cifrados)]
        TS[Turnstile]
    end
    GH[GitHub: repo público, CI gates, backups job, DR drill]
    G[Google Gemini]
    HIBP[haveibeenpwned k-anon]

    U -->|HTTPS TLS1.2/1.3, HSTS| P --> N
    A -->|rate limit PG + Turnstile| P
    N -->|Prisma (owner, bypass RLS)| DB
    N -->|service_role| AUTH & ST
    W -->|webhook firmado SHA-256 timing-safe| N
    AV -->|webhook secreto timing-safe| N
    R -->|webhook Svix HMAC| N
    N -->|firma integridad SHA-256, redirect hosted| W
    N -->|API key| AV & R & G
    DB -->|pg_net + x-cron-secret (Vault)| N
    GH -->|pg_dump gpg AES256| R2
    N -->|prefijo SHA-1 solamente| HIBP
    U -.->|PAN NUNCA toca LuCam's| W
```

Fronteras de confianza clave: ① browser↔Vercel (CSP nonce, cookies Secure/Lax, CORS allowlist); ② Vercel↔Supabase (service_role server-only, publishable key en cliente con grants=0); ③ proveedores→webhooks (firma + environment-match + ventana + dedup); ④ pg_cron→app (secreto en Vault, timing-safe, fail-closed); ⑤ GitHub→Vercel (deploy por push — **frontera sin gate**, F-01); ⑥ VM dev→PRD (`.env*`, token `sbp_`).

---

## F. SUPERFICIE DE ATAQUE (conteos y cobertura)

| Superficie | Conteo | Cobertura de auditoría |
|---|---|---|
| Páginas (`page.tsx`) | 113 | Inventariadas vía build + filesystem; flujos sensibles revisados en profundidad por dominio |
| Route handlers (`route.ts`) | 46 (42 handlers HTTP: 41 en `/api` + 1 fuera; resto metadata/OG) | **42/42 clasificados** (12 crons, 3 webhooks, 8 health, 9 catálogo, 4 CMS, 1 cupones, 1 admin edit-mode, 3 observabilidad, 1 recuperar-carrito) |
| Archivos de Server Actions | 65 | **65/65 verificados con guard** (requireAdminAction/requireRole/getCurrentCustomer/rateLimit/Turnstile/stage-guard) |
| Webhooks | 3 (Wompi, Aveonline, Resend) | Firma, replay, idempotencia, dedup, PII en logs: revisados con evidencia |
| Crons | 12 rutas `/api/cron/*` + 13 jobs pg_cron versionados + 1 monitor STG→PRD | x-cron-secret timing-safe + fail-closed verificado en los 12 |
| Modelos Prisma / tablas public | 56 modelos / 58 tablas (LOCAL) | RLS verificada en vivo LOCAL: 0 sin RLS; PRD pendiente (§U-1) |
| Políticas RLS | 22 public + 13 storage (LOCAL) | rls-matrix 55 tests verdes; USING(true)=0; FORCE RLS=0 (decisión aceptada V2-9) |
| Funciones SECURITY DEFINER | 1 (`is_active_admin()`, search_path fijo) | Revisada; EXECUTE acotado |
| Buckets Storage | 5 | Políticas revisadas; `customer-uploads` deny-by-default (migración 13) |
| Flujos auth | 19 | Revisados con evidencia (Auditor B) |
| Flujos de dinero/estado | 17 | Idempotencia 13/13, audit log 7/7 admin, step-up 1/3 (F-05) |
| Endpoints públicos sin rate limit | **0** (27 rutas + ~20 actions cubiertas) | Verificado por Auditor E |
| Scripts de terceros en navegador | 3 (Turnstile, Vercel toolbar en preview, Google Fonts) | Wompi = redirect hosted; sin script de pago en el sitio |
| Uploads | 7 puntos | Magic bytes + sharp en pipelines principales; 2 gaps menores (L-F1/F2) |
| Exports CSV | 1 | Formula injection abierta (L-F3) |
| `dangerouslySetInnerHTML` | 2 (ambos JSON-LD con escape + nonce) | Justificados |
| Dependencias | 126 directas / ~1.203 transitivas | audit --prod = 0; 4 advisories dev-only evaluados |

Exclusiones honestas: comportamiento dinámico con usuarios reales de cada rol (sin cuentas de prueba), pentest activo STG/PRD, revisión de dashboards de proveedores, pruebas de concurrencia en vivo (se verificaron claims atómicos y locks en código + triggers DB en su lugar).

---

## G. MATRIZ ASVS (resumen por capítulo, nivel 2 aplicable + controles nivel 3 seleccionados)

Versiones de marcos consultadas el 2026-09-19: OWASP ASVS 5.0 (vigente desde mayo 2025, fuente: owasp.org/www-project-application-security-verification-standard), OWASP Top 10 2021 (RC del Top 10 2025 publicado nov 2025, aún no final — se usa 2021 como vigente), OWASP API Security Top 10 2023, CVSS 4.0 (complementario). Donde se citan números de control se usa la numeración ASVS 4.0 histórica del proyecto para mantener trazabilidad con `docs/SECURITY.md` y la auditoría previa.

| Capítulo ASVS | Aplica | Estado | Evidencia principal | Gap | Hallazgo |
|---|---|---|---|---|---|
| V1 Arquitectura | Sí | Cumple | Trust boundaries §E, defensa en profundidad verificada en código | Documentación de threat model por feature nueva es irregular | — |
| V2 Autenticación | Sí | Cumple con gaps | OTP sin link (anti-prefetch), rate limit doble bucket, HIBP k-anon, anti-enumeración; MFA TOTP + recovery codes HMAC con pepper | Reto TOTP admin client-side sin rate-limit app; autogestión MFA sin step-up; config GoTrue PRD no verificada | F-06, L-B2, §U-4 |
| V3 Sesiones | Sí | Cumple | Cookies Secure/Lax, idle-timeout admin 30 min firmado HMAC, logout global, reset cierra todas las sesiones, `no-store` en privadas | `Clear-Site-Data` no emitido (opcional) | — |
| V4 Control de acceso | Sí (N3 seleccionado) | Cumple | RBAC deny-by-default server-side, matriz ruta→rol, ownership en cada servicio, RLS 100% + grants 0, triggers anti mass-assignment | Grants residuales posibles en PRD; política `customer updates own` amplia (latente) | L-C1, L-C3 |
| V5 Validación/salida | Sí | Cumple con gaps | Zod en actions/handlers, escape en emails, react-markdown con rehype-sanitize (sin raw) | CSV sin guarda de formula injection | L-F3 |
| V6 Criptografía | Sí (N3) | Cumple | SHA-256 integridad Wompi, HMAC-SHA256 recovery codes con pepper, AES-256-GCM cookie checkout, tokens 128-bit hasheados en reposo, timing-safe en todos los secretos | Fallback legacy SHA-256 de recovery codes pre-2026-08-29 | L-B4 |
| V7 Logging | Sí (N3) | Gap parcial | 528 callsites con evento estructurado, redacción por key y contenido, AdminActionLog durable | Eventos de seguridad sin persistencia ni alertas; requestId no propagado; export CSV sin actor | F-07, L-H3, L-H7 |
| V8 Datos/PII | Sí (N3) | Cumple con gaps | Minimización verificada, purgas de retención implementadas (6 tablas + diseños), IP hasheada en buckets | IP en claro en 1 bucket; retención AdminActionLog documentada no implementada; previews de diseños públicos por link | L-E1, L-H6, L-F4 |
| V9 Comunicaciones | Sí | Cumple | TLS 1.2/1.3, HSTS 2 años+preload en todas las respuestas, sin http:// en código productivo | TLS 1.0/1.1 no comprobable localmente (Vercel impone ≥1.2) | L-A8 |
| V10 Lógica de negocio | Sí (N3) | Cumple con gaps | Idempotencia 13/13, saga con claims atómicos, triggers DB cupones/stock, anti-doble-cobro COD | Reconciliación expire-pending inalcanzable; velocity COD read-then-act; autoreferido multi-cuenta | F-03, L-D3, L-D4 |
| V11 Archivos | Sí (N3) | Cumple con gaps | Magic bytes, anti-polyglot con tests, re-encode sharp, EXIF strip, buckets privados, signed URLs 1 h | Staging de snapshots sin sniff; sin limitInputPixels; HEIC sin guard de dimensiones | L-F1, L-F2 |
| V12 API | Sí | Cumple | Ver §F; 0 endpoints públicos sin rate limit; body limit de plataforma Vercel | Webhooks sin tope de tamaño explícito; CORS sin preflight | L-E5, L-E4 |
| V13 Configuración | Sí | Cumple con gaps | CSP nonce, headers completos, source maps off, preview protection, fail-fast env | x-powered-by expuesto; bodySizeLimit 50 MB global | L-A2, L-E2 |
| V14 Supply chain (N3) | Sí | Cumple con gaps | SHA pinning 100 %, allowBuilds allowlist, overrides justificados, audit gate en CI, historial limpio | Branch protection ausente; secret scanning/push protection off en repo público | F-01, F-02 |

Matriz de autorización (construida desde código, no desde UI): anónimo → solo endpoints públicos rate-limited; cliente → ownership server-side verificado en designs/addresses/retracto/garantías/reseñas/wishlist/perfil; FULFILLMENT/MANAGER/CMS_EDITOR → matriz ruta→rol en `lib/admin-rbac.ts:110-124` enforceada en layout + guard; SUPERADMIN → todo + operaciones destructivas con `requireRecentMfa()` (reembolsos, retractos, gestión de admins) — **excepciones: conciliación COD y autogestión MFA (F-05/F-06)**; admin inactivo/eliminado → `getCurrentAdmin` exige `isActive AND deletedAt:null` (`lib/auth.ts:75-77`) e `is_active_admin()` igual en Storage.

---

## H. HALLAZGOS (medios — los bajos e informativos están en §I)

| ID | Estado | Severidad | Confianza | Activo | Entrada | Ataque | Evidencia | CWE | ASVS | Ambiente | Impacto | Remediación | Prueba de cierre | Bloquea |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| F-01 | CONFIRMADO | MEDIA | ALTA | GitHub/Vercel | Push a `production` | Push directo (error humano o PAT comprometido) despliega a PRD sin tests/typecheck/gitleaks/audit; force-push permitido | `gh api repos/jullieth93/lucams/branches/production/protection` → 404; rulesets `[]`; `vercel.json` sin gate; CI corre post-push, no como gate | CWE-284 | V14.2.1 | GitHub+PRD | Código vulnerable o malicioso en vivo sin red | Ruleset: required checks (7 jobs CI), ff-only, bloquear force-push/delete en `production` (y `develop`); valorar Vercel Ignored Build Step | `gh api …/protection` 200 con contexts; push con CI rojo no genera deployment | **Condición P0 (gate §66 "branch/ruleset sin control")** |
| F-02 | CONFIRMADO | MEDIA | ALTA | Repo público | Commit con secreto | Secreto pusheado queda público e indexado al instante; la única red (gitleaks CI) corre post-push; pre-commit hook es opt-in y no-op silencioso sin binario | `gh api repos/jullieth93/lucams` → `private:false`, `secret_scanning/push_protection/dependabot_security_updates: disabled`; `scripts/git-hooks/pre-commit:13-14` (skip silencioso) | CWE-798 | V14.3.3 | GitHub | Filtración de credencial PRD con ventana push→rotación; incidente real previo 2026-05-09 demuestra factibilidad | Activar secret scanning + push protection + validity checks + Dependabot security updates (gratis en repos públicos); corregir comentario del hook | `security_and_analysis` enabled; push de prueba con dummy `prv_prod_…` rechazado | **Condición P0** |
| F-03 | CONFIRMADO | MEDIA | ALTA | Pagos | Cron `expire-pending-orders` | Wompi APPROVED + webhook perdido de verdad (>24 h) + cliente que nunca vuelve a `/checkout/gracias` → el cron cancela la venta cobrada (veredicto `no_txid`) sin `needsReconciliation` ni notificación; la rama "healed" es código muerto porque ningún escritor persiste `wompiTransactionId` en `PENDING_PAYMENT` | Escritores del campo solo en transición PAID/CANCELLED (`saga.ts:207,300,334,891`); `expire-pending.ts:134`; gracias persiste solo vía saga (`gracias/page.tsx:179-183`); no existe lookup por reference (`lib/wompi.ts:264`); alerta `pending_payment_wompi_stale` solo dispara si el cron NO corrió (`alerts.ts:131-139`) | CWE-754 | V10 | PRD | Pérdida financiera silenciosa (venta cobrada cancelada), recuperable solo por revisión manual del panel Wompi | (a) Persistir txId en la orden PENDING cuando gracias recibe `?id=` o cuando el webhook PENDING llega; (b) alerta pre-cancelación para órdenes PENDING>2 h para contraste manual; (c) flag `needsReconciliation` al cancelar con verificación no realizada | Test de integración: orden PENDING + pago APPROVED simulado sin webhook → tras cron NO queda CANCELLED (queda healed/flaggeada) | No (doble fallo requerido), pero P0 por impacto financiero silencioso |
| F-04 | CONFIRMADO | MEDIA | ALTA | Observabilidad | `/api/health/crons` | Cada cron recién agendado deja el health en 503 hasta su primer latido (sin grace period): `overdue = !lastRunAt` (`cron-heartbeat.ts:108-109`). Activo AHORA: `lucams-purge-delivered-designs` (migración 035, agenda `0 9 * * *`) → 503 desde el deploy de hoy | `curl https://lucamsshop.com/api/health/crons` → 503 `{"status":"degraded"}` (20:15 y 20:26 UTC 2026-09-19); alerta `cron_stale_*` falsa simultánea | CWE-400 | NIST DE.CM | PRD (en vivo) | Alert fatigue sobre el dead-man switch (único canal que cubre caída total de crons); fallo real enmascarado en la ventana | Sembrar latido inicial/`registeredAt` al agendar, o tratar `lastRunAt=null` como `pending` durante 2×intervalo | Health vuelve a 200 tras primer run; un cron nuevo jamás degrada. **Verificar 2026-09-20 ~09:05 UTC: si sigue 503 hay otro cron muerto y escala** | Condición P0 (detección degradada en vivo) |
| F-05 | CONFIRMADO CON MATIZ | MEDIA-BAJA | ALTA | Finanzas COD | `markCodRemittedAction`, `flagCodDiscrepancyAction`, `setCodEnabledAction` | Sesión SUPER con aal2 viejo (robada) puede maquillar remesas cortas como REMITTED o re-etiquetar discrepancias (fraude interno COD); el propio encabezado del archivo declara el estándar aal2-reciente y no lo implementa | `conciliacion/actions.ts:95-99,141-145,50` solo `requireAdminAction({roles:SUPER})`; ni siquiera importa `admin-reauth`; contraste `pedidos/[number]/actions.ts:183` | CWE-862 | V3.4 / Transaction Authz | Código (todos) | Manipulación del ledger de efectivo con audit log (detección sí, prevención no) | Añadir `requireRecentMfa()` con el patrón existente | Action con sesión SUPER sin elevación reciente → `reauthRequired` sin escribir | No |
| F-06 | CONFIRMADO CON MATIZ | MEDIA-BAJA | ALTA | Auth admin | `disableMfaAction`, `changeMfaDeviceAction`, `generateRecoveryCodesAction` | Sesión admin aal2 robada puede enrolar el TOTP del atacante y cosechar recovery codes nuevos (devueltos en claro al cliente) → toma de control del 2FA dentro de la sesión robada | `seguridad/actions.ts:31,53,71` solo `requireAdminAction(ALL_PLUS_CMS)`; `generateRecoveryCodesAction:82` devuelve códigos en claro | CWE-287 | V2.6.2 | Código | Persistencia del atacante en cuenta admin | Añadir `requireRecentMfa()` a las 3 acciones | Test: amr >10 min → `reauthRequired` | No (requiere sesión aal2 previa; mitigado por idle-timeout 30 min + CSP) |
| F-07 | CONFIRMADO CON MATIZ | MEDIA-BAJA | ALTA | Detección | Logs de seguridad | Password-spraying sostenido contra `/admin/login`, campaña de firmas de webhook falsas o replays: prevenidos (rate limit + firma) pero **invisibles y no investigables** — solo `logger.warn` en logs efímeros Vercel, IP redactada, sin tabla SecurityEvent, 0 reglas de seguridad en `evaluateAlerts` | `lib/logger.ts:69-75` (redacción IP); `wompi/route.ts:71-81,109-119` (rechazo antes de persistir); `alerts.ts:56-243` (sin reglas security); objetivo "3+ firmas inválidas/5 min" documentado no implementado (`OBSERVABILITY.md:192`) | CWE-778 | V7.1.2/V7.2.1 | PRD | Ataques de volumen bajo indetectables; forense limitado a la ventana de retención de Vercel | Tabla `SecurityEvent` (event, outcome, ipHash HMAC, ts; purga 90-180 d) + 2 reglas de alerta | 3 firmas inválidas en STG → notificación + filas con ipHash | No (la prevención primaria existe) |

Nota de refutación adversarial: los 7 hallazgos fueron revisados por un verificador independiente (segundo pase con mandato de refutar). Resultado: F-01/F-02/F-03/F-04 CONFIRMADOS; F-05/F-06/F-07 CONFIRMADOS CON MATIZ (severidad ajustada a media-baja por precondiciones fuertes y defensas compensatorias). Se descartaron como falsos positivos: "cron sin secreto fail-open" (fail-closed verificado en los 12), "comparación de secretos con ==" (0 matches; todo timing-safe), "Server Action admin sin autorización" (65/65 con guard), "replay de webhook Wompi" (ventana 25 h + dedup + P2002), "XSS en dangerouslySetInnerHTML" (2 usos, ambos JSON-LD escapado + nonce), "path traversal en uploads" (keys `ownerId/designId/uuid` con match exacto en DB), "doble recompensa de referidos por carrera" (imposibilidad temporal demostrada), "session fixation/replay" (tokens nuevos por signIn, PKCE validado server-side).

---

## I. LEDGER DE HARDENING (bajos e informativos — no bloquean)

**Auth/sesiones:** L-B1 Reto TOTP de login admin corre client-side contra GoTrue sin rate-limit de aplicación (mover a Server Action con patrón existente; defensas: requiere password aal1, throttling GoTrue no verificado — §U-4). L-B2 Límites pre-launch relajados aún activos (login 15/15 min, signup 10/h) con TODO explícito de endurecer (`registro/actions.ts:126-138`). L-B3 Fallback legacy SHA-256 sin pepper de recovery codes pre-2026-08-29 (`recovery-codes.ts:39-44`) — rotación pendiente: que cada admin regenere códigos y retirar el fallback. L-B4 `Clear-Site-Data` no emitido en logout (opcional; `no-store` ya cubre bfcache).

**DB/RLS/Storage:** L-C1 Verificación de grants residuales en migración 026 solo `RAISE WARNING` — grants hechos por otros roles podrían sobrevivir en PRD (`00000000000026:33-58`); query de catálogo en PRD pendiente. L-C2 Extensiones `pg_trgm`/`unaccent`/`pgcrypto` creadas sin SCHEMA → posible residencia en `public` (higiene; verificar advisor). L-C3 Política dormida `customer updates own row` más amplia que la whitelist de la app — latente, inalcanzable hoy (grants=0); extender trigger de columnas si los grants reaparecieran. L-C4 `/pedido/[token]` expone dirección completa al poseedor del link (capability URL por diseño; token 128-bit, solo hash en DB; considerar enmascarado post-entrega). L-C5 `FORCE ROW LEVEL SECURITY` ausente (decisión aceptada V2-9; Prisma opera como owner). L-C6 `rate_limit_check` fail-open ante anomalía, logueado (aceptado C-8).

**APIs/crons:** L-E1 IP en claro en bucket de rate-limit de `/checkout/gracias` (`gracias/page.tsx:92` — excepción a la política C-8; usar `ipKey()`). L-E2 `serverActions.bodySizeLimit: 50mb` global para las 65 actions (`next.config.ts:106-110`). L-E3 Turnstile no valida `hostname`/`action` del response (`lib/turnstile.ts:60-64`). L-E4 CORS sin manejo de preflight OPTIONS (impacto nulo hoy: app same-origin). L-E5 Webhooks leen raw body sin tope explícito de tamaño (mitigado por límite de plataforma y rechazo de firma previo a DB). L-E6 Crons sin advisory lock anti-concurrencia (dependen de idempotencia de servicios — verificada). L-E7 `coupon_apply` con rate-limit solo por IP (90/h; códigos de alta entropía).

**Uploads/navegador/IA:** L-F1 Snapshots de staging y preview blob aceptados sin magic bytes (`personalization/service.ts:1030-1049`; se sirven con contentType forzado — sin XSS, autoinfligido). L-F2 Sin `limitInputPixels` en sharp ni guard de dimensiones en rama HEIC (`sharp-safe.ts`; default ~268 Mpx + cap 10 MB + rate limit acotan). L-F3 Export CSV de suscriptores sin guarda de formula injection (`newsletter/admin-service.ts:157-160`; alfabeto zod-email acota payloads, antepón `'` a `= + - @ \t`). L-F4 `design-previews` público sin expiración (exposición por link, no enumerable; documentar aceptación o purgar). L-F5 ~20 `target="_blank"` sin `rel="noopener"` (noopener implícito en navegadores actuales + COOP). L-F6 `remotePatterns` con `images.unsplash.com` (TODO pendiente) y `cdn.lucams.test` en config. L-F7 `fetch(url)` sin timeout en `assignPredesignedToDesignAction` (URL propia, anti-SSRF ya validado).

**CI/CD/supply chain:** L-G1 Override `qs` desactualizado (2 advisories moderate, dev-only, parche 6.16.0 disponible). L-G2 `extract-zip@2.0.1` high ×2 sin versión parchada publicada (dev-only, riesgo aceptado y documentado). L-G3 Artifact del nightly sin `retention-days` (~90 días vs 7 del resto; repo público). L-G4 Doc drift: comentarios fijan sharp "0.34.4" pero va 0.35.4; `ignoreGhsas` obsoleto (GHSA-f88m… ya parchada). L-G5 `allowed_actions:all` y `sha_pinning_required:false` a nivel repo (mitigado: 100 % pineado de hecho). L-G6 Comentario del pre-commit hook declara "GitHub Push Protection" como capa — no existe (raíz de F-02).

**DNS/correo/web:** L-A1 SPF apex `~all` (compensado por DMARC quarantine; endurecer a `-all` tras validar remitentes). L-A2 `x-powered-by: Next.js` + `server: Vercel` (fingerprinting trivial). L-A3 Sin CAA (riesgo real bajo; añadir `issue letsencrypt.org` + `pki.goog`). L-A4 Sin DNSSEC (evaluado: no crítico; 1 clic en Cloudflare + DS en registrador). L-A5 Sin MTA-STS/TLS-RPT. L-A6 DMARC sin `sp`/`pct`/`ruf` explícitos (hereda quarantine; valorar `p=reject` tras madurar reportes). L-A7 Typos (`lucamsshop.co`, `lucam-shop.com`) disponibles — valorar registro defensivo. L-A8 Rechazo TLS 1.0/1.1 no demostrable localmente (openssl build; Vercel impone ≥1.2). L-A9 `robots.txt` enumera rutas sensibles (registrado; no es vulnerabilidad).

**Observabilidad/DR:** L-H1 `requestId` solo en response header; ningún log lo incluye (correlación rota; `proxy.ts:110-146`). L-H2 DR drill mensual sin dead-man (último programado 2026-09-02 falló; último verde manual 2026-09-04). L-H3 Sin alertas de expiración de dominio/certificado ni de gasto (denial-of-wallet); tracking de costos manual mensual. L-H4 Retención de `AdminActionLog` (2 años + archivo R2) documentada, no implementada. L-H5 Export CSV sin actor ni `AdminActionLog`. L-H6 Runbooks faltantes: dominio secuestrado, supply chain, cuenta admin comprometida, pérdida de Storage como incidente. L-H7 Snapshots DB/Storage sin punto de consistencia (documentar saneamiento post-restore). L-H8 RLS denials y denegaciones RBAC sin señal agregada (probing IDOR invisible salvo tráfico).

**Lógica de negocio:** L-D1 Velocity COD read-then-act no transaccional (acotado por rate-limit 6/10 min/IP). L-D2 Autoreferido con segundo correo no bloqueado; update de status de Referral sin guard (afecta auditoría, no duplica cupones). L-D3 Webhook Wompi no valida `currency` (inexplotable hoy: firma de integridad + COP-only). L-D4 `WOMPI_DISABLE_TIMESTAMP_CHECK` solo advierte en prod (verificar ausencia en Vercel PRD — §U-3).

**Unknown-unknowns (verificador):** L-N1 Dominio expira 2027-07-19 sin alerta automatizada. L-N2 Política de rotación incompleta: faltan CRON_SECRET, CSRF_SECRET (pepper de recovery codes — rotarlo invalida códigos silenciosamente), webhook secrets, R2 keys, GPG passphrase. L-N3 Token personal `sbp_` de Supabase Management API en `tmp/.supabase-access-token` (gitignored) — documentar en inventario de secretos. L-N4 Valores de env vars de Vercel sin vault de respaldo documentado (pérdida del proyecto = re-emisión total manual). L-N5 Bus factor 1 integral (GitHub verificado; Vercel/Supabase/registrador/Cloudflare inferidos) — riesgo de continuidad, no de seguridad técnica.

---

## J. CADENAS DE ATAQUE (análisis combinado)

1. **Push a production → PRD sin gate** (F-01) + repo público sin push protection (F-02): un PAT de GitHub comprometido (vía malware en la VM dev o phishing) permite ① pushear código malicioso que despliega automáticamente, o ② exfiltrar un secreto accidental sin freno. Detección: historial git + auditoría Vercel, sin alerta activa. **Es la cadena de mayor riesgo real del sistema hoy** — mitigable en 30 minutos con P0-① y P0-②.
2. **Sesión admin robada** (cookie theft/XSS acotado por CSP/equipo desatendido) → `changeMfaDeviceAction` sin step-up (F-06) → enrolar TOTP propio + regenerar recovery codes → persistencia. Luego `markCodRemittedAction` sin step-up (F-05) → maquillar faltante de efectivo COD. Detección: AdminActionLog (investigable post-hoc, sin alerta — F-07). Prevención completa tras P1.
3. **Webhook delivery roto >24 h** (misconfig/cambio de URL) + cliente que cierra el navegador → cron expire-pending cancela venta cobrada sin flag (F-03) → dinero en Wompi, orden CANCELLED, cliente sin producto, **sin alerta** hasta revisión manual del panel Wompi o queja del cliente.
4. **Cron nuevo cada release** → health 503 hasta primer latido (F-04) → operador entrenado a ignorar el monitor → cuando un cron muera de verdad, la alerta se descarta como "el falso positivo de siempre". Fatiga de alertas sobre el dead-man switch.
5. **CSV de suscriptores** (L-F3 formula injection limitada) + equipo admin que abre en Excel → ejecución de fórmula benigna hoy (alfabeto email acota payloads); cadena débil, cerrar con el prefijo `'`.
6. **Backup expuesto**: las credenciales R2 viven en GitHub Secrets + `.env` de la VM; sin object-lock verificado (§U-8), un atacante con esas credenciales podría borrar backups antes de un ataque destructivo sobre la DB. Compensación: retención 30 con salvaguarda anti-vaciado y drill mensual.
7. Cadena evaluada y **rota por controles existentes**: CNAME dangling → takeover → cookies de dominio (sin dangling verificado; previews bajo SSO); CMS → XSS → sesión admin (CSP nonce + rehype-sanitize sin raw); IDOR → fotos ajenas (bucket privado + ownership + grants=0); webhook replay → entrega falsa → pérdida COD (firma + dedup + estados monotónicos); script de checkout → e-skimming (sin scripts de terceros en pago; PAN nunca toca LuCam's).

---

## K. REGRESIONES (auditoría histórica `docs/audits/auditoria_seguridad_lucams.md` vs estado actual)

| Control histórico | Estado anterior | Estado actual | Evidencia | ¿Regresión? |
|---|---|---|---|---|
| B-1 MFA obligatorio admin | Remediado | **Vigente** | `admin-rbac-guard.ts:50-59` + layout | No |
| B-2 cookies Secure/Lax | Remediado | **Vigente** | `lib/supabase/server.ts:40-43`, `proxy.ts:237` | No |
| B-4 rate limit doble bucket auth | Remediado | **Vigente** | `confirmar-codigo/actions.ts:75-85,159-168` | No |
| B-5 recovery codes HMAC+pepper, consumo atómico | Remediado | **Vigente** (fallback legacy pendiente, L-B3) | `recovery-codes.ts:33-93` | No |
| B-6 edit-mode CMS exige aal2 | Remediado | **Vigente** | `api/admin/cms/edit-mode/route.ts:43-44` | No |
| B-8 idle-timeout admin 30 min | Remediado | **Vigente** (44 asserts en proxy.test.ts) | `proxy.ts:280-302`, `admin-activity.ts` | No |
| B-9/B-10 decisiones documentadas | Aceptadas | **Vigentes sin cambio** | grep actual | No |
| C-1/C-2 allowlist settings públicos | Remediado | **Vigente** | `lib/cms.ts:114-155` | No |
| C-3/C-4 health sin info sensible | Remediado | **Vigente** (verificado en vivo: `/api/health` sin versión/entorno) | curl PRD | No |
| C-6/C-7 límites search/offset | Remediado | **Vigente** | `catalog/products/route.ts:66` | No |
| C-8 IP hasheada en rate limit | Remediado | **Vigente con 1 excepción nueva** (L-E1 en `/checkout/gracias`) | `gracias/page.tsx:92` | **Mini-regresión (baja)** |
| D-1 query secret Aveonline OFF | Remediado | **Vigente** | `webhooks/aveonline/route.ts:76-77` | No |
| D-2 anti-degradación supresión Resend | Remediado | **Vigente** | `webhooks/resend/route.ts:133-141` | No |
| D-4 dedup estable Aveonline | Remediado | **Vigente** | `route.ts:119` | No |
| D-5 webhooks sin PII en logs | Remediado | **Vigente** (hash truncado) | `wompi/route.ts:78` | No |
| F-10 step-up MFA operaciones destructivas | Remediado | **Vigente con cobertura incompleta** (F-05/F-06 nuevos) | `pedidos/[number]/actions.ts:183` vs `conciliacion/actions.ts` | **Gap nuevo (medio)** |
| F-11 tokens públicos hasheados | Remediado | **Vigente** | `lib/token-hash.ts:17-19` | No |
| G-1/G-4/G-5 backstops DB (loyalty, unitPrice, cupones) | Remediado | **Vigente** (triggers + migraciones 25/28) | migración 28, Prisma 20260829150300 | No |
| G-8 funciones públicas endurecidas | Remediado | **Vigente** (1 secdef, search_path fijo, EXECUTE revocado) | migraciones 27/30 | No |
| V2-7 pg_net fuera de public | Remediado | **Vigente** (extensión en `extensions`) | migración 29 | No |
| V2-8 customer-uploads deny-by-default | Remediado | **Vigente** | migración 13 | No |
| A-5 headers en early returns + CORS estricto | Remediado | **Vigente** (verificado en vivo en 404/redirects) | curl PRD | No |
| E-2 guard PII hacia Gemini | Remediado | **Vigente** | `ai/schemas.ts:37-50` | No |
| SEC-01 QR MFA como img data-URI | Remediado | **Vigente** | `mfa-enroll.tsx:206-223` | No |

**Resultado: 0 regresiones altas/medias de controles históricos. 1 mini-regresión baja (L-E1) y 2 gaps nuevos del patrón F-10 (F-05/F-06) en features creadas después.**

---

## L. DOMINIO, DNS Y TLS (evidencia pasiva PRD, 2026-09-19)

**DNS:** NS Cloudflare (romina/armando). A apex → 64.29.17.1, 216.198.79.1 (Vercel anycast; AAAA ausente). www → CNAME `515d9155a82a6d83.vercel-dns-017.com` (activo, sin dangling). MX → Cloudflare Email Routing. TXT apex único: `v=spf1 include:_spf.mx.cloudflare.net ~all`. `_dmarc`: `p=quarantine; rua=mailto:dmarc@lucamsshop.com` (mejor que el `p=none` documentado como punto de partida). DKIM Resend: `resend._domainkey.mail` con clave RSA válida; SPF de envío: `send.mail` → `include:amazonses.com ~all`. CAA/DS/DNSKEY/_mta-sts/_smtp._tls ausentes (ledger, no bloqueantes). Consistencia @8.8.8.8 ↔ @1.1.1.1 verificada. Subdominios stg/api/mail/dmarc: NXDOMAIN — sin huérfanos. Dominio expira 2027-07-19 (RDAP).

**Certificados:**

| Host | Emisor | SAN | notAfter | Días | Cadena/Firma |
|---|---|---|---|---|---|
| lucamsshop.com | Let's Encrypt YR2 | lucamsshop.com | 2026-10-18 | 29 | Válida, ECDHE-RSA-AES128-GCM / TLS1.3 AES-128-GCM |
| www.lucamsshop.com | Let's Encrypt YR1 | www.lucamsshop.com | 2026-12-17 | 89 | Válida |

**CT logs (crt.sh):** solo apex, www y wildcard `*.lucamsshop.com` (emisores LE YE1/YR1/YR2 y Google WE1 — patrón estándar Vercel). Ningún host desconocido ni certificado de servicio retirado. Nota: crt.sh indexa con retraso (cert de www del 2026-09-18 aún no listado).

**HTTP/TLS (respuestas reales):** HTTP→HTTPS 308 en apex y www (cadena de 2 saltos a apex canónico). HSTS `max-age=63072000; includeSubDomains; preload` **presente también en 404, /api/health y redirects**. CSP completa con nonce rotando (verificado nonce distinto por respuesta), `object-src 'none'`, `base-uri 'self'`, `frame-ancestors 'self'`, `form-action 'self' checkout.wompi.co`, `upgrade-insecure-requests`. X-Frame-Options SAMEORIGIN, nosniff, Referrer-Policy strict-origin-when-cross-origin, Permissions-Policy restrictiva, COOP same-origin, CORP same-site. TLS 1.2 y 1.3 negocian; 1.0/1.1 no comprobables localmente (build openssl). HTTP/2 confirmado; HTTP/3 no comprobable (libcurl). `/admin` → 307 a login con headers completos. `/.git/HEAD` → 404. Source maps → 404. `security.txt` válido (Contact security@lucamsshop.com, Expires 2027-07-01). `x-powered-by: Next.js` presente (L-A2). Cookies: ninguna respuesta pública emite Set-Cookie (auth se establece client-side post-login).

---

## M. INFRAESTRUCTURA CLOUD

**Registrador (mi.com.co):** NO VERIFICADO (sin acceso; whois no instalado). RDAP: registro 2026-07-19, expiración 2027-07-19. Transfer lock, MFA, autorrenovación, contactos de recuperación: pendientes de evidencia (§U-7). Bloqueantes del checklist (expiración inminente, propietario inaccesible): no se detectaron; renovación sin alerta es riesgo L-N1.

**DNS (Cloudflare):** zona verificada pasivamente (§L). Dashboard (DNSSEC 1-clic, WAF, Email Routing config): requiere acceso (§U-7).

**Vercel:** proyecto "Lucams" en team personal; CLI autenticado. Verificado: preview protection/SSO en todos los deployments (curl 302 → vercel.com/sso-api, incluido el deployment más viejo visible, 5 días); 31 env vars Production todas Encrypted (solo nombres); deploy de PRD = commit `3e1dad0` con CI verde; rama production como Production Branch (alias `lucams-shop-git-production-…`). No legible por CLI: Ignored Build Step (docs-only skip, vive en UI), lista de tokens, miembros del team, Skew Protection, WAF/firewall rules (§U-9). **Gap: deploy por push sin esperar CI (F-01).**

**GitHub:** repo público, 1 colaborador (admin). Verificado: sin deploy keys ni webhooks; Actions `default_workflow_permissions: read`; `permissions: contents: read` en los 4 workflows; environments sin protection rules; CI en `production` verde para el commit desplegado; runs de backup recientes: 6 fallos en las últimas 10 corridas programadas (gateway Supabase Storage 5xx — fix de retry desplegado hoy, corrida manual verde; vigilar 2-3 corridas). **Gaps: F-01, F-02.**

**Supabase:** LOCAL verificado exhaustivamente vía psql (58 tablas, RLS 100 %, grants mínimos, 10 cron jobs, 1 secdef, event trigger presente, 59 migraciones Prisma aplicadas, 0 secretos Vault — esperado en LOCAL). PRD/STG: sin acceso — Auth config, RLS en vivo, cron jobs, Vault, tier (declarado Free → sin PITR), advisors: §U-1/2/4.

**Cloudflare R2:** backups cifrados verificados por diseño y runs; object-lock/immutability y scope del token: no verificados (§U-8).

**Wompi:** integración verificada en código (hosted checkout, firma integridad, webhook). Dashboard (webhook URL registrada, eventos suscritos, llaves): §U-5. **PCI:** el navegador y el servidor de LuCam's **nunca reciben PAN** (redirect a `checkout.wompi.co/p/`; scripts en la página de pago: solo propios + Turnstile) → alcance probable **SAQ-A**; NO se declara cumplimiento PCI — confirmación formal requiere Wompi/adquirente.

**Aveonline/Resend/Gemini/Turnstile:** integraciones verificadas en código (§N). Dashboards (usuarios, MFA, scopes de API keys, rotación): §U-6. Gemini sin PII ni fotos verificado; coincide con lo declarado en `/legal/subprocesadores`.

**Cuentas cloud (factor humano):** bus factor 1 verificado en GitHub, inferido en las demás. Cadenas analizadas: correo comprometido → recuperación de registrador (superficie real sin MFA verificada, §U-7); GitHub comprometido → Vercel → PRD (F-01 la hace directa); Vercel comprometido → 31 env vars (todas Encrypted, pero el atacante con cuenta las puede redefinir/exfiltrar vía deploy); Supabase comprometido → PII (service_role + BYPASSRLS estándar de Supabase).

---

## N. APLICACIÓN

**Next.js 16:** comportamientos verificados contra `node_modules/next/dist/docs/` (Origin-check nativo de Server Actions en CSRF; bodySizeLimit 50 MB configurado). 0 secretos en componentes cliente (NEXT_PUBLIC_* solo publishables: Supabase publishable key, site key Turnstile, WA number — correcto). Source maps off. `x-pathname` interno seteado por proxy, no spoofeable (`proxy.ts:141-144`). Cookies de sesión `sb-*` httpOnly=false: trade-off documentado (Supabase SSR), compensado con CSP nonce — no se declara vulnerabilidad.

**Auth:** 19 flujos revisados. Fuerte: anti-enumeración en login/registro/reset (respuestas genéricas + aviso al dueño), OTP sin link (anti-prefetch), rate limit doble bucket atómico en Postgres, HIBP k-anon con fail-open logueado, Turnstile fail-closed en prod, safe-redirect estricto, origin de emails solo desde env, reset cierra todas las sesiones, cambio de password cierra las otras. Gaps: F-06, L-B1/B2/B3.

**MFA:** TOTP obligatorio para todo rol admin (guard + layout), recovery codes con HMAC+pepper y consumo atómico anti-TOCTOU (con test de doble consumo), step-up con ventana ≤10 min por claim `amr` fail-closed en reembolsos/retractos/gestión de admins. Gaps: F-05, F-06, L-B1.

**RBAC:** matriz deny-by-default server-side; 34/36 actions admin con guard (las 2 sin guard son login — correcto); admin inactivo/eliminado rechazado en app y en Storage.

**RLS/DB:** verificación en vivo LOCAL: 58/58 tablas con RLS, 0 grants a anon/authenticated, service_role solo REFERENCES/TRIGGER/TRUNCATE, 1 función SECURITY DEFINER con search_path fijo, event trigger anti-tablas-sin-RLS presente, 0 `$queryRawUnsafe` en el repo, vistas: 0. Gates automatizados: rls-coverage por PR + rls-matrix nightly (56/56 verdes hoy en LOCAL).

**APIs/webhooks/crons:** ver §F y §H. Wompi webhook: raw body byte-exacto, SHA-256 esquema oficial + timingSafeEqual, environment-match por WOMPI_ENV, ventana 25 h justificada contra reintentos (30 min/3 h/24 h), dedup P2002, doble-check de monto → `needsReconciliation`. Retorno del navegador NO se confía (re-consulta con private key + saga idempotente + rate limit).

**Pagos/lógica de negocio:** precios siempre server-side desde snapshot DB; flete con set de cotizaciones sellado HMAC re-validado en la frontera del dinero; cookie de checkout AES-256-GCM 60 min; unique parcial Order(cartId) PENDING + advisory locks; stock con decremento condicional + ledger idempotente (nunca negativo); cupones con re-validación en tx + trigger DB por cliente; reembolsos: SUPERADMIN + aal2 reciente + confirmación previa del dinero + idempotente + audit; COD con anti-abuso por identidad y backstop anti-doble-cobro; STORE_MODE con doble capa fail-closed. Gap: F-03.

**Uploads:** magic bytes en todos los pipelines principales (con tests anti-polyglot SVG/HTML), sharp con loaders CVE bloqueados, re-encode + EXIF/GPS strip, HEIC→JPEG, keys con UUID (sin colisión/overwrite), ownership antes de subir, rate limits IP+owner, retención 90 d post-entrega con cron. Gaps: L-F1/F2.

**Browser/IA/emails/CSV:** CSP nonce sin unsafe-inline en prod; sin tokens/PII en localStorage; sin postMessage ni Service Workers; 3 scripts de terceros (ninguno en pago con datos sensibles); Gemini sin PII/fotos, salida parseada Zod con enum cerrado (prompt injection rompe parse → fallback); emails con escape sistemático + test dedicado, envío de prueba solo al propio admin, preview iframe SUPERADMIN no-store; CSV: 1 export, L-F3.

**E-skimming (Magecart):** superficie mínima verificada — checkout de pago es redirect hosted de Wompi; LuCam's no renderiza campos de tarjeta; sin scripts de terceros en `/checkout/pago` salvo Turnstile; CSP restringe `script-src` a self+nonce+cloudflare+wompi.

---

## O. SUPPLY CHAIN

- **Lockfile/dependencias:** pnpm-lock.yaml íntegro (install con `--frozen-lockfile` en CI); 126 directas / ~1.203 transitivas; `pnpm audit --prod` = 0; 4 advisories dev-only evaluados con reachability (L-G1/G2); overrides justificados GHSA por GHSA con 1 ignore obsoleto (L-G4); `allowBuilds` allowlist de 6 paquetes (resto bloqueado).
- **Workflows (4):** acciones 6/6 pineadas por SHA con comentario de versión; `permissions: contents: read`; sin `pull_request_target`; sin inyección de contexto en `run`; concurrency correcta; backups con `cancel-in-progress: false`; gates por PR: 7 jobs (lint, typecheck, test, build, gitleaks, audit, rls-coverage) + nightly full (RLS matrix, E2E, load).
- **Secretos en historial:** escaneo de patrones (`prv_prod_`, `sb_secret_`, JWT, `re_`, private keys) sobre **1.129 commits** → 0 hits; `.env*` nunca commiteados (git log --full-history vacío). Incidente 2026-05-09 documentado con post-mortem completo y rotación; revocación efectiva de la llave vieja requiere dashboard (§U-4).
- **Ruta de despliegue:** GitHub (push) → Vercel Git integration → PRD. **Sin gate de CI entre push y deploy (F-01).** Deployments antiguos: todos bajo SSO, sin alias huérfanos.

---

## P. DATOS Y PRIVACIDAD

| Dato | Ubicación | Acceso | Retención/eliminación | Terceros | Protección |
|---|---|---|---|---|---|
| PII clientes (nombre, email, teléfono, documento, direcciones) | PostgreSQL PRD | App (owner), admins por rol | Borrado de cuenta anonimiza email + elimina auth user (verificado `delete-service.ts:58,141`) | Aveonline (envíos), Wompi (pagos) | RLS + grants=0; triggers de columnas sensibles |
| Fotos y diseños de clientes | `customer-uploads` (privado) + `design-previews` (público, L-F4) | Signed URLs 1 h; previews por link | Purga 90 d post-entrega (cron 035) + purga diseños anónimos idle | Ninguno (Gemini NO recibe fotos — verificado) | Magic bytes, re-encode, EXIF/GPS strip |
| Datos de pago | Wompi (PAN nunca toca LuCam's) | — | — | Wompi/adquirente | Hosted checkout + firma |
| IPs | Buckets rate limit (hasheadas, 1 excepción L-E1), AdminActionLog (en claro, L-H4) | Admins | Purga por cron de retención | Vercel logs | HMAC/hash (política C-8) |
| Logs/telemetría | ErrorLog/WebhookEvent/EmailEvent/Notification/WebVital | Admins | Purga con retenciones por tabla implementadas | Vercel (retención plan) | Redacción por key y contenido (PII scrub) |
| Credenciales | Supabase Auth (passwords hasheados por GoTrue), recovery codes HMAC+pepper | Nadie (hash) | Rotación anual documentada (incompleta, L-N2) | Supabase | HIBP k-anon, pepper, TOTP |
| Datos de menores | Posibles en fotos subidas por clientes | Como fotos | Como fotos | Ninguno | Mismo pipeline; consentimiento en términos (declarado — verificación legal pendiente, requiere abogado colombiano) |

Declaraciones públicas vs realidad: `/legal/subprocesadores` coincide con lo verificado en código (Gemini sin fotos/PII, lista de terceros). Textos legales con gate por STORE_MODE en código. Retracto/garantías implementados con ventanas y elegibilidad server-side. **No se emiten conclusiones legales** (Ley 1581/1480, DIAN): los trámites de facturación electrónica están declarados pendientes por el propietario — requieren abogado/contador colombiano.

---

## Q. DETECCIÓN Y RESPUESTA

| Ataque | Prevenido | Detectado | Alertado | Investigable | Recuperable |
|---|---|---|---|---|---|
| Bypass MFA admin | Sí (MFA forzado, idle-timeout firmado, step-up) | Parcial (recovery codes sí; TOTP solo en logs Supabase Auth) | **No** | Parcial | Sí (reset MFA + suspender) |
| Reembolso doble/indebido | Sí (idempotencia + estado + step-up) | Sí (alerta reconciliation crítica) | Sí (email) | Sí (AdminActionLog + ledger) | Sí (conciliación manual) |
| Webhook falso | Sí (firma+env+timestamp) | Log efímero | **No** (F-07) | Débil | N/A (rechazado) |
| Venta cobrada auto-cancelada (F-03) | **No** (hoy) | **No** | **No** | Panel Wompi manual | Manual (reembolso) |
| Password-spraying /admin/login | Sí (rate limit 5/15 min) | Log efímero | **No** (F-07) | Débil (IP redactada) | N/A |
| IDOR masivo (probing) | Sí (RLS + ownership) | **No** (L-H8) | **No** | Débil | N/A |
| Exportación masiva PII | Parcial (RBAC+MFA) | Evento sin actor (L-H5) | **No** | Débil | IRP-003 |
| Deploy malicioso | **Parcial (F-01)** | Historial git | **No** | Git + Vercel audit | `vercel rollback` (drill sin evidencia reciente) |
| Secreto filtrado | Parcial (gitleaks CI post-push; F-02) | CI | Parcial (CI rojo) | Post-mortem process existe | Sí (IRP-001, probado en incidente real) |
| Caída total de crons | N/A | Sí (dead-man 3 capas) | Sí — **degradada por F-04** | Sí | Reagendar vía migración |
| Pérdida de DB | N/A | backup_stale | Sí | Logs de workflow | **Sí — restore probado mensualmente** |
| Secuestro de dominio/DNS | Fuera de app | Solo uptime (sin distinguir causa) | **No** | **Sin runbook (L-H6)** | **Sin runbook** |

Runbooks: 11 existentes (6 en OPERATIONS + IRP-001/002/003/004 + DR + modo mantenimiento) con severidad/ETA/pasos; 1 post-mortem real de alta calidad. Faltan 4 (L-H6).

---

## R. BACKUPS Y DR

- **DB:** pg_dump diario vía GitHub Actions, cifrado gpg AES256 con passphrase por fd (fail-closed), retención 30 con salvaguarda anti-vaciado, heartbeat al panel solo si ambos jobs verdes, dead-man `backup_stale` >36 h.
- **Storage:** mirror cifrado de los 5 buckets con manifiesto, retry con backoff (fix de hoy ante 5xx del gateway — 6 fallos la última semana; **vigilar próximas 2-3 corridas programadas antes de dar por cerrado**).
- **Restore probado:** DR drill mensual REAL (descarga dump cifrado de R2, restaura en Postgres 17.6.1, exige conteos exactos contra el dump, clasificación fail-closed de errores, frescura ≤36 h) + drill de Storage (cuadra tar contra manifiesto). Último verde: 2026-09-04 (manual). Gap: sin dead-man del propio drill (L-H2); último programado (2026-09-02) falló.
- **RPO/RTO:** RPO ≤24 h (backup diario; Supabase Free declarado sin PITR → el backup R2 es la única red). RTO no declarado formalmente; el drill ejercita el procedimiento. Supabase Free declara — verificación de tier pendiente (§U-4).
- **No restaurable hoy:** valores de env vars Vercel (L-N4), config dashboard Supabase Auth (parcialmente scriptada), config de dashboards de proveedores, el dominio, el bucket R2 si se borra la cuenta Cloudflare.

---

## S. PLAN DE REMEDIACIÓN (FASE B — requiere aprobación de IDs)

**P0 — Condiciones del gate (≤7 días, sin deploy de código salvo F-03/F-04):**
1. **F-01:** ruleset en `production` (+ `develop`): required checks = los 7 jobs de CI, ff-only, bloquear force-push y delete. *Acción humana en GitHub Settings, 15 min.*
2. **F-02:** activar secret scanning + push protection + validity checks + Dependabot security updates. *GitHub Settings, 5 min.* Corregir comentario del pre-commit hook.
3. **F-03:** persistir `wompiTransactionId` en PENDING (webhook PENDING y/o fallback gracias) + alerta pre-cancelación; test de integración que falle antes y pase después.
4. **F-04:** grace period para crons nuevos (latido sembrado al agendar o estado `pending`); verificar 2026-09-20 ~09:05 UTC que el health vuelve a 200.

**P1 (≤30 días):** F-05 (step-up en conciliación COD), F-06 (step-up en autogestión MFA), F-07 (tabla SecurityEvent + 2 reglas de alerta), L-B1 (reto TOTP server-side con rate limit), L-H2 (dead-man del DR drill), L-H3 (alertas de expiración dominio/cert + budget alerts), §U completo (evidencia en vivo PRD), L-H5 (actor en export CSV), L-E1 (ipKey en gracias), L-B3 (rotación de recovery codes legacy), L-N1 (auto-renew dominio + recordatorio), vigilar corridas de backup post-fix.

**P2 (defensa en profundidad):** L-B2 (endurecer límites pre-launch), L-E2 (body limit por ruta), L-E3 (hostname Turnstile), L-F1/F2 (sniff en staging + limitInputPixels), L-F3 (guarda CSV), L-C1/C2 (queries de confirmación en PRD), L-H6 (4 runbooks), L-N2 (ampliar política de rotación + procedimiento CSRF_SECRET), L-A1 (SPF `-all` tras validar), L-G3/G4/G5 (higiene CI).

**P3 (futuro):** L-A3/A4/A5/A6/A7 (CAA, DNSSEC, MTA-STS, DMARC reject, typos), L-F4 (signed URLs para previews), L-C3 (trigger de columnas extendido), L-H4 (retención AdminActionLog con archivo R2), L-N5 (plan de continuidad bus factor).

---

## T. RIESGOS RESIDUALES (para firma del propietario)

| Riesgo | Propietario | Justificación | Control compensatorio | Revisión | Expira |
|---|---|---|---|---|---|
| Bus factor 1 en todas las plataformas | Lucy/jullieth93 | Operación unipersonal | Backups off-site cifrados, DR drill mensual, documentación extensa | 2026-12-19 | Al incorporar segundo admin |
| Supabase Free sin PITR (RPO 24 h sobre backup propio) | Propietario | Costo | Backup diario cifrado + drill mensual probado | 2026-10-19 | Al subir de plan o crecer volumen |
| `design-previews` público por link no enumerable | Propietario | UX (hot-link en carrito/pedido) | cuid 122 bits, sin listing, purga de originales | 2026-12-19 | Si hay incidente de privacidad |
| Logs Vercel como única ventana forense de eventos de seguridad | Propietario | Hasta implementar F-07 | Rate limiting fuerte en los puntos calientes | 2026-10-19 | Al cerrar F-07 |
| extract-zip sin parche publicado (dev-only) | Mantenedor | No existe 2.0.2 | Cadena solo en CI efímero, documentado en pnpm-workspace.yaml | Mensual (Dependabot) | Al publicarse parche |
| Autoreferido multi-cuenta (cupones 10 %) | Propietario | Costo de heurística > fraude esperado | Cupones 1 uso, 90 d, entropía alta | 2026-12-19 | Si se detecta abuso |

---

## U. EVIDENCIA FALTANTE (checklist exacto para el operador)

1. **PRD — catálogo DB (psql o SQL editor, 10 min):** ① `SELECT count(*) FROM pg_tables WHERE schemaname='public' AND NOT rowsecurity` (=0 esperado); ② `SELECT grantee,privilege_type,count(*) FROM information_schema.role_table_grants WHERE table_schema='public' AND grantee IN ('anon','authenticated','service_role') GROUP BY 1,2` (esperado: anon/auth=0, service_role sin DML); ③ `SELECT extname, nspname FROM pg_extension e JOIN pg_namespace n ON n.oid=e.extnamespace` (extensiones fuera de public); ④ `SELECT count(*) FROM pg_event_trigger`; ⑤ `SELECT jobname,schedule,active FROM cron.job` (13 esperados); ⑥ `SELECT count(*) FROM vault.secrets`; ⑦ `prisma migrate status` contra PRD.
2. **PRD — Supabase Auth (Management API o dashboard):** TTL access/refresh, rotación de refresh, longitud/expiración OTP, throttling GoTrue, leaked password protection, allowlist de Redirect URLs (solo lucamsshop.com + previews), SMTP propio activo, tier del proyecto (¿PITR?), advisors de seguridad, revocación efectiva de la llave filtrada 2026-05-09.
3. **Vercel PRD (dashboard o comparación de hashes):** `WOMPI_ENV=production`, ausencia de `WOMPI_DISABLE_TIMESTAMP_CHECK` y `AVEONLINE_ALLOW_QUERY_SECRET`, CRON_SECRET distinto de STG (comparar hashes, nunca valores), Ignored Build Step, WAF/firewall, lista de tokens y miembros del team, plan (logs 7 d vs 1 h).
4. **Wompi dashboard:** URL de webhook registrada = `https://lucamsshop.com/api/webhooks/wompi`, eventos suscritos, ambiente prod, rotación de llaves desde alta (129 d según Vercel).
5. **Aveonline/AveCRM:** webhook de tracking registrado con secreto (no query-string), ambiente prod.
6. **Resend dashboard:** dominio `mail.lucamsshop.com` verificado, suppression list, scopes de la API key, webhook firmado registrado.
7. **Registrador (mi.com.co) + Cloudflare:** transfer lock, MFA de la cuenta, autorrenovación del dominio, método de pago vigente, correo de recuperación, DNSSEC disponible, object-lock en R2, scope del API token de backups.
8. **Cuentas de prueba por rol** (cliente A/B, SUPERADMIN, MANAGER, FULFILLMENT, CMS_EDITOR, admin inactivo, AAL1/AAL2) en STG + autorización escrita de pentest activo en STG → habilita la batería dinámica §58 completa (matriz de autorización ejecutada, concurrencia de cupón/último stock/recovery code/reembolso, replay real de webhooks).
9. **VM/equipos:** inventario de tokens CLI (gh, vercel, `sbp_` en tmp/), cifrado de disco, offboarding documentado.
10. **GoTrue throttling real** (base de L-B1): 6 intentos TOTP fallidos controlados en STG y registrar respuesta.

---

## V. COBERTURA HONESTA

| Área | Revisado | No revisado | Bloqueado | % estimado |
|---|---|---|---|---|
| Código aplicación (apps/web, packages/db) | Completo por dominios con evidencia file:line | — | — | 100 % estático |
| Migraciones y RLS | Repo completo + LOCAL en vivo | — | PRD/STG en vivo (§U-1) | 80 % |
| DNS/TLS/HTTP externo | Pasivo completo (~30 requests) | TLS 1.0/1.1, HTTP/3 (herramientas) | — | 90 % |
| GitHub | API real verificada | Fork permissions (endpoint no disponible) | — | 90 % |
| Vercel | CLI real verificado | Settings solo-UI (§U-3) | — | 70 % |
| Supabase cloud | Scripts y migraciones | — | Todo el dashboard (§U-2) | 30 % |
| Proveedores (Wompi/Aveonline/Resend/Cloudflare/Gemini) | Integración en código completa | — | Dashboards (§U-4/5/6/7) | 50 % |
| Registrador | RDAP pasivo | — | Cuenta (§U-7) | 20 % |
| Dinámico auth/RBAC/pagos con usuarios | Tests automatizados (4077 + 56 RLS) en LOCAL | — | Pentest activo STG/PRD y matriz ejecutada (§U-8) | 60 % |
| VM/equipos operativos | Superficie visible desde el repo (tokens, hooks, scripts) | Disco, SO, red | Inventario formal (§U-9) | 40 % |

**Cobertura global estimada: ~75 %. Los huecos están enumerados individualmente en §U — ninguno es un activo desconocido; son activos conocidos sin verificación en vivo por falta de acceso.**

---

## GATE DE PRODUCCIÓN (§66)

| Condición de bloqueo | ¿Presente? |
|---|---|
| Crítico/alto abierto | **No** |
| Autorización crítica no verificada | Parcial — matriz verificada en código + RLS en LOCAL; falta foto en vivo PRD (§U-1) |
| RLS/grants no verificados | LOCAL verificado en vivo; PRD con garantías estructurales (migraciones que abortan) pero sin foto |
| Commit desplegado desconocido | **No** (`3e1dad0`, CI verde) |
| Migraciones críticas pendientes | No en repo; aplicación en PRD sin verificar (§U-1) |
| **Branch/ruleset sin control** | **SÍ (F-01) — bloqueante del gate** |
| Webhooks financieros no verificados | No (firma/idempotencia/monto verificados en código; dashboard §U-4) |
| Idempotencia no verificada | No (13/13 flujos de dinero) |
| Backup no restaurado | **No** (drill mensual real; último verde 2026-09-04) |
| Secret expuesto / takeover / dominio no controlado / cert inválido / renovación no demostrada / HTTP sin redirect / TLS obsoleto | No detectados en la evidencia disponible |
| Cuenta cloud crítica sin MFA / excolaborador con acceso | No verificable sin dashboards (§U-7/9) |
| Preview antiguo con acceso PRD | No (todos bajo SSO) |
| Scripts de pago manipulables | No (sin scripts de pago propios; CSP estricta) |
| Falta de detección | Parcial (F-04 degrada el dead-man switch AHORA; F-07) |
| Evidencia dinámica insuficiente en flujos críticos | Parcial (sin pentest activo autorizado; §U-8) |

**Decisión del gate: `PRODUCCIÓN CONDICIONADA`.** Para subir a `APTO CON RIESGOS RESIDUALES ACEPTADOS`: cerrar F-01/F-02/F-03/F-04 (P0), ejecutar el checklist §U completo sin sorpresas, y firmar los riesgos residuales §T.

---

## DECLARACIÓN DE COMPLETITUD (§67)

Se inventariaron **22** activos externos, **8** dominios/subdominios (apex, www, mail, send.mail, resend._domainkey.mail, _dmarc, lucams-shop.vercel.app, aliases de preview), **2** certificados activos (+históricos CT sin anomalías), **14** registros DNS relevantes, **11** cuentas cloud, **113** páginas, **65** archivos de Server Actions, **46** Route Handlers (42 handlers HTTP), **3** webhooks, **12** crons de aplicación (+13 jobs pg_cron versionados +1 monitor externo), **58** tablas, **35** políticas RLS (22 public + 13 storage, LOCAL), **5** buckets, **12** proveedores y **~30** controles operativos (9 reglas de alerta, 11 runbooks, 7 gates CI, 4 workflows, dead-man switches, drills).
Quedaron **23** elementos no verificados, enumerados individualmente en la sección **U** (10 ítems con sub-consultas).

## VALIDEZ DE LA AUDITORÍA (§68)

Válida para el commit `3e1dad0` y la configuración observada el 2026-09-19. Debe repetirse o revalidarse ante: nuevo dominio/subdominio, cambio de registrador/DNS/CA/certificado, nuevo proveedor o integración, nuevo rol/tabla/policy/Server Action/API, cambios en pagos/auth/MFA/checkout/CI-CD, dependencia crítica nueva, incidente o secreto filtrado, cambio de propietario, migración de infraestructura, o en 90 días (2026-12-19) lo que ocurra primero.

## REVISIÓN DE UNKNOWN UNKNOWNS (§69)

Ejecutada por verificador independiente distinto de los auditores de dominio. Resultados incorporados: L-N1 a L-N5 (expiración de dominio, rotación incompleta, token sbp_, vault de env vars, bus factor), cadena #1 de §J (GitHub→Vercel→PRD como ruta de mayor riesgo), y la lista de cambios que invalidarían esta auditoría (rotación de CRON_SECRET sin re-crear Vault, cambio de proyecto Supabase con refs hardcodeadas, Custom Access Token Hook que rompería el parseo `amr` fail-closed, migración de Wompi a widget client-side, cambio de Production Branch). Controles verificados en esa revisión: env-guard fail-closed contra PRD en scripts destructivos, Makefile sin targets destructivos por defecto, previews/deployments bajo SSO, `apps/web/public` sin archivos olvidados.

---

*Fin de FASE A. Detener aquí: la remediación (FASE B) requiere autorización expresa del propietario con IDs concretos (§S).*

---

## ADDENDUM — FASE B (2026-09-19, autorización expresa del propietario limitada a F-01 y F-02)

**F-01 — CERRADO.** Aplicada branch protection en `production` y `develop` vía `gh api -X PUT …/branches/<rama>/protection` con: los 7 jobs de CI como required status checks (contextos exactos del run 35464444766), `enforce_admins: true`, historia lineal (ff-only), force-push y delete bloqueados. Evidencia de cierre: `gh api …/protection` → 200 en ambas ramas con los 7 contextos. Riesgo residual: sin required reviews (operador único — registrado en §T). Prueba de cierre pendiente del operador (no ejecutada por requerir push de prueba): un push con CI rojo es rechazado y no genera deployment production. Rollback documentado en `docs/OPERATIONS.md`.

**F-02 — CERRADO CON MATIZ.** `gh api -X PATCH repos/jullieth93/lucams`: `secret_scanning`, `secret_scanning_push_protection` y `dependabot_security_updates` → **enabled** (verificado con GET posterior). Matiz: `secret_scanning_validity_checks` y `secret_scanning_non_provider_patterns` no son activables vía API en este repo (la API acepta la llamada pero permanecen `disabled`) — pendiente menor en Settings → Code security o no disponible en el plan. El comentario del pre-commit hook (`scripts/git-hooks/pre-commit:5-6`) que citaba Push Protection como capa **queda correcto** a partir de este cambio; no requirió edición.

Documentación canónica actualizada en la misma sesión: `docs/OPERATIONS.md` (acción humana de branch protection marcada HECHA) y `docs/STATE.md` (sesión 2026-09-19 (3)). Sin commits ni deploy (requieren autorización aparte). El veredicto global sigue en `PRODUCCIÓN CONDICIONADA` hasta cerrar F-03/F-04 (P0 de código) y el checklist §U.

## ADDENDUM 2 — FASE B continuación (2026-09-19, autorización del propietario para F-03, F-04, F-05, F-06, F-07)

Protocolo §70 seguido en los 5 IDs: test rojo primero → implementación → positivos/negativos → retest → docs. Gates consolidados sobre el árbol final: **lint, typecheck, build, format:check verdes; suite 4111/4111 (+34 tests nuevos); RLS 58/58 contra Supabase LOCAL**. Sin commits ni deploy (pendientes de autorización).

**F-03 — CERRADO.** El webhook Wompi en estado PENDING y el fallback `/checkout/gracias` ahora persisten `wompiTransactionId` en la orden con update gateado (`status=PENDING_PAYMENT AND paymentMethod=WOMPI AND wompiTransactionId IS NULL`) — la rama "healed" del cron deja de ser código muerto. Si el cron no puede verificar (veredictos `not_configured`/`lookup_failed`), la orden cancelada queda `needsReconciliation=true` con razón y txId → dispara la alerta crítica `reconciliation` existente. Tests rojos→verdes: 3 nuevos (persistencia en webhook PENDING, cancelación con flag ante API caída y ante falta de llaves) + guards (orden COD jamás recibe txId; abandono real cancela limpio sin flag). Archivos: `app/api/webhooks/wompi/route.ts`, `app/checkout/gracias/page.tsx`, `features/orders/expire-pending.ts`. Riesgo residual documentado: reintento con segunda transacción + doble pérdida de webhook (cada vez más improbable).

**F-04 — CERRADO.** `getCronHealth` introduce el estado `pending` para jobs sin primer latido: visible en panel y en la respuesta detallada, pero **no degrada el status ni dispara `cron_stale_*`**. La convención la hace cumplir un test-gate: todo cron nuevo debe sembrar su latido inicial en `AlertState` al agendarse (migración Supabase `00000000000037` siembra los 10 actuales); si el cron nunca corre, el latido sembrado vence a 2× intervalo y alerta — el dead-man switch queda intacto. El fix es code-only: el health deja de dar 503 con el deploy, sin esperar migraciones. Archivos: `cron-heartbeat.ts`, `health/crons/route.ts`, panel de observability, migración 037.

**F-05 — CERRADO.** `setCodEnabledAction`, `markCodRemittedAction` y `flagCodDiscrepancyAction` exigen `requireRecentMfa()` (patrón de `refundOrderAction`) antes de tocar servicios o audit; UI con `MfaReauthModal`/`useMfaReauthAction` existentes. Tests: 7 nuevos en `conciliacion/actions.test.ts` (aal2 viejo/ausente → `reauthRequired` sin escritura ni auditoría; aal2 fresco → cero fricción).

**F-06 — CERRADO.** `disableMfaAction`, `changeMfaDeviceAction` y `generateRecoveryCodesAction` exigen `requireRecentMfa()`; página de seguridad envuelta en `ReauthForm` + modal en el panel de recovery codes. El enrolamiento inicial (B-1) queda intacto: tras el `challengeAndVerify` del browser el JWT ya trae `amr` fresco, sin fricción nueva (verificado con `mfa-enroll.test.tsx` verde). Tests: 7 nuevos en `seguridad/actions.test.ts` (18/18 del archivo verdes).

**F-07 — CERRADO.** Tabla `SecurityEvent` nueva (migración Prisma `20260919140000` + RLS deny-by-default en Supabase `00000000000036`, añadida a la matriz RLS), helper `lib/security-events.ts` fail-open con IP solo hasheada (política C-8), wiring en login cliente, admin login y los 3 webhooks (firma/secreto inválido + replay Wompi), 2 reglas nuevas en `evaluateAlerts` (`security_admin_login_fails` ≥5/15 min, `security_webhook_invalid` ≥3/5 min — esta última era objetivo documentado desde antes), purga a 180 días en `purge-event-logs`. Tests: unit + integración con DB real (persistencia, disparo de alertas, purga). Fail-open garantizado: si la tabla aún no existe en un ambiente, nada se rompe.

**Migraciones pendientes de aplicar en STG/PRD con el próximo release:** `20260919140000_security_event` (Prisma) → `00000000000036_rls_security_event` → `00000000000037_cron_heartbeat_seed`. Documentadas en `docs/OPERATIONS.md` (changelog 2026-09-19).

**Estado del gate tras FASE B:** los 7 hallazgos medios están cerrados. Permanece para el veredicto `APTO CON RIESGOS RESIDUALES ACEPTADOS`: desplegar este paquete, verificar `/api/health/crons` en 200 tras el deploy, ejecutar el checklist §U (evidencia en vivo PRD) y firmar los riesgos residuales §T.

## ADDENDUM 3 — CIERRE: deploy a PRD y verificación en vivo (2026-09-19/20, autorización del propietario)

**Release:** commits `7098ff2` (fix F-03…F-07) y `b361e75` (docs) en `develop`; CI run 35478131244 **success**; release `production` ff `3e1dad0 → b361e75`; deploy Vercel Production **Ready** (`lucams-shop-jdjx8aowp`, 2 m). Nota operativa: el primer push a `develop` fue **rechazado por la protección nueva** (los commits no tenían checks) — se ajustó `develop` (protección sin required checks, mantiene ff-only/anti-force-push/enforce_admins) conservando el gate completo en `production`, que es donde el commit llega con checks verdes. El gate quedó así **probado en ambos sentidos**: rechaza sin checks, acepta con checks.

**Migraciones aplicadas (orden documentado en OPERATIONS):** STG y PRD — Prisma `20260919140000_security_event` ("All migrations have been successfully applied"), Supabase `036` (NOTICE OK: RLS deny-by-default en SecurityEvent), `037` (INSERT + NOTICE OK: 10 crons con latido).

**Verificación en vivo PRD (post-deploy, 2026-09-20 00:24 UTC):** home 200 · `/api/health` `ok` · **`/api/health/crons` → 200 `ok`** (F-04 cerrado en producción; el falso 503 activo durante la auditoría desapareció con el deploy).

**Evidencia §U ejecutada en esta sesión (psql read-only a PRD + Management API, sin exponer secretos):**
- RLS en vivo PRD: **0 tablas de `public` sin RLS**; `enforce_rls_on_new_table_trg` presente; grants a `anon`/`authenticated`: solo REFERENCES/TRIGGER/TRUNCATE (no-DML, no explotable vía PostgREST) en 2 tablas recientes (`EmailTemplateOverride`, `ProductMaterial`) — higiene menor pendiente de revocar; `service_role` sin DML (58 tablas: solo REFERENCES/TRIGGER/TRUNCATE) → **L-C1 cerrado: sin grants residuales de DML**.
- Extensiones: `pg_trgm` y `unaccent` residen en `public` (L-C2 confirmado, baja-higiene); `pg_net`/`pgcrypto` correctamente en `extensions`.
- pg_cron PRD: **11 jobs activos** (10 HTTP + `rate_limit_cleanup`), incluidos `lucams-expire-pending-orders` (23 * * * *) y `lucams-purge-delivered-designs` (0 9 * * *). Vault: `cron_base_url` y `cron_secret` presentes.
- GoTrue PRD (Management API, GET read-only): JWT exp 3600, refresh rotation ON (reuse 10 s), OTP 8 dígitos/3600 s, `rate_limit_email_sent` 30, autoconfirm off, TOTP enroll/verify on, site_url correcto, redirect allowlist = lucamsshop.com/** + lucams-shop.vercel.app/** + localhost:4000/**. Residual menor: `password_min_length: 6` (la app exige 8–72 vía Zod — endurecer el dashboard a 8) y `password_hibp_enabled: false` (compensado por el check k-anon de la app en signup/reset/cambio — decisión histórica documentada).
- Env vars PRD (nombres): `WOMPI_ENV` existe en scope Production; los escape hatches `WOMPI_DISABLE_TIMESTAMP_CHECK` y `AVEONLINE_ALLOW_QUERY_SECRET` **no existen** en ningún ambiente → OFF (cierra las verificaciones pendientes de D-H6 y D-1).

**Pendiente tras este cierre (todo humano/dashboard, ~20 min):** revocar los grants no-DML residuales en las 2 tablas o normalizarlos en migración; subir `password_min_length` a 8 en Supabase Auth; dashboards de Wompi (URL de webhook), Aveonline, Resend, Cloudflare (object-lock R2) y registrador (auto-renew + MFA); cuentas de prueba por rol para la batería dinámica §58 en STG.

## ADDENDUM 4 — Cierre de pendientes §U ejecutables (2026-09-20, autorización del propietario)

1. **`password_min_length` Supabase Auth:** PRD (`zxkucphbsfygakgxcnik`) y STG (`mjbdiqdkykhsixvqlrrp`) subidos de 6 a **8** vía Management API (PATCH 200 + GET de verificación). Alineado con el Zod 8–72 de la app.
2. **Grants residuales no-DML (L-C1):** migración Supabase `00000000000038_revoke_residual_non_dml_grants` (REVOKE ALL + verificación inline que aborta si queda alguno) aplicada en **PRD, STG y LOCAL** — `role_table_grants` de `anon`/`authenticated` en `public` = **0** en los tres ambientes. Causa raíz documentada en el header de la migración (defaults administrados por Supabase re-otorgan privilegios no-DML a tablas creadas por migraciones Prisma posteriores a la 022).
3. **Resend:** verificado por datos — `EmailEvent` en PRD muestra `email.delivered` hasta 2026-09-20 00:20 UTC (webhook de Resend registrado y operando; DKIM/SPF ya verificados por DNS en FASE A). Hallazgo operativo menor: las `RESEND_API_KEY` de los `.env*` locales responden **400 inválida** contra la API (la key viva está solo en Vercel; PRD envía sin problema). Acción sugerida: refrescar las keys locales si se depura email en local.
4. **Wompi/Aveonline:** verificación indirecta — PRD aún no tiene ventas reales (`Order`=0, `WebhookEvent WOMPI`=0), así que el registro del webhook de Wompi queda como chequeo humano de 1 minuto en el dashboard (Eventos → URL `https://lucamsshop.com/api/webhooks/wompi`). Aveonline sí tiene evidencia histórica (evento real procesado 2026-08-11).
5. **Cuentas de prueba por rol (§U-8) — CREADAS en STG:** `qa-cliente-a/b@lucamsshop.com`, `qa-superadmin`, `qa-manager`, `qa-fulfillment`, `qa-cms-editor` (AdminUser activos con su rol) y `qa-admin-inactivo` (MANAGER con `isActive=false`). Contraseñas aleatorias en `tmp/qa-credentials-stg.txt` (chmod 600, gitignored). Clientes sin fila Customer (la app la crea JIT en el primer login). Los admins enrolan TOTP en su primer login (guard B-1) — eso habilita las sesiones AAL1/AAL2 de la batería §58. Script fixture: `tmp/create-qa-users-stg.mjs` (idempotente, gitignored).

**Queda solo humano (sin API disponible):** registrador mi.com.co (auto-renew + MFA + transfer lock), Cloudflare dashboard (object-lock en R2), dashboard Wompi (URL de webhook — 1 minuto), y ejecutar la batería dinámica §58 en STG con las cuentas QA recién creadas.

**Cierre manual de dashboards (2026-09-20, por el propietario):** URL de eventos Wompi **PRD confirmada** (`https://lucamsshop.com/api/webhooks/wompi` ✓ coincide con el código). **Matiz STG descubierto al verificar:** la URL de eventos registrada en el merchant de pruebas (`https://lucams-shop-git-develop-….vercel.app/api/webhooks/wompi`) está detrás de Vercel SSO — un POST externo recibe `302 → vercel.com/sso-api` (verificado con curl), por lo que Wompi no puede entregar webhooks a STG. Impacto acotado: el checkout de prueba en STG completa vía el fallback `/checkout/gracias` (el navegador del operador sí pasa el SSO). Opciones documentadas: registrar la URL con `?x-vercel-protection-bypass=<token>` (mismo token de los crons) o aceptar la limitación y probar webhooks solo en PRD. **R2:** bucket `lucams-backups` con Public Access Disabled ✓ (verificado por captura); object-lock queda como endurecimiento opcional anti-ransomware (Settings del bucket) o riesgo residual. **Resend:** key viva en Vercel funciona; las de los `.env*` locales son inválidas (solo afecta depuración local — refrescar bajo demanda).
