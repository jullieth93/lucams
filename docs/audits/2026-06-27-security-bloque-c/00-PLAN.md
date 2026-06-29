I have all six fronts. Let me consolidate into the Bloque C plan. The reports are thorough and evidence-based; my job is to synthesize, deduplicate (checkout rate-limit appears in Frentes 3 and 6; Turnstile appears in 3 and 6), calibrate severities, and produce the actionable plan.

# Plan Bloque C — Seguridad pre-launch (2026-06-27)

## Resumen para Lucy (llano)

La tienda está **bien protegida en lo grande**: el panel de admin exige login real (nadie entra sin cuenta), los pagos y webhooks están blindados, las contraseñas se validan contra filtraciones, y las cabeceras/CORS están bien puestos. **Pero hay 3 huecos serios que tengo que tapar antes de salir a vender:** (1) hay 16 tablas de la base de datos que quedaron "sin candado" cuando las creamos después — incluyendo datos personales de clientes (tickets de soporte, diseños, consentimientos); (2) un freno anti-robots del catálogo está roto por un error de una palabra en el código, así que hoy no frena nada; y (3) los roles de admin (gerente / despacho) son decorativos: hoy cualquier persona con acceso al panel puede hacer todo, incluso ver finanzas. **De ti necesito 3 decisiones:** si activamos la verificación en dos pasos (MFA) para tu cuenta admin desde el día 1, confirmar que las llaves de Cloudflare/Turnstile están cargadas en producción, y aplicar yo los candados a la base de datos viva (eso toca el servidor real, prefiero que lo autorices). El resto lo arranco solo ahora mismo.

---

## Tabla de control de seguridad

| # | Control | Estado | Sev | Esfuerzo | Autónomo / Necesita-Lucy |
|---|---------|--------|-----|----------|--------------------------|
| **AUTH / RBAC / MFA** |
| A1 | Gate formal `/admin/*` (sin sesión → login) | ✅ | — | — | — |
| A2 | Verificación fila AdminUser activa (no solo sesión) | ✅ | — | — | — |
| A3 | Defense-in-depth en server actions admin | ✅ | — | — | — |
| A4 | Anti-enumeración en login admin | ✅ | — | — | — |
| A5 | **RBAC: rol enforced por ruta/acción** (MANAGER/FULFILLMENT) | 🟡 solo `usuarios` | **P0** | M | Autónomo |
| A6 | **MFA admin (TOTP)** — spec lo marca obligatorio | ❌ | **P0** (por spec) | L | **Necesita-Lucy** |
| A7 | Idle-timeout admin 30 min | ❌ | P1 | M | Autónomo |
| A8 | Logout admin global (`scope:"global"`) + log de logout | 🟡 | P1 | S | Autónomo |
| A9 | Flags de cookie HttpOnly/Secure/SameSite | 🟡 [pend. verif.] | P1 | S | Autónomo (verif. runtime) |
| A10 | Comentarios `proxy.ts` desactualizados ("gate pendiente") | 🟡 | P2 | S | Autónomo |
| **RLS** |
| R1 | RLS correcta en 20 tablas core (owner-only + deny-default) | ✅ | — | — | — |
| R2 | **16 tablas sin `ENABLE ROW LEVEL SECURITY`** (PII: Consent, SupportTicket, Design, DesignAsset…) | ❌ | **P0** | M | SQL Autónomo / aplicar Necesita-Lucy |
| R3 | **Tests RLS automatizados** (`pnpm test:rls`) | ❌ | **P0/P1** | L | Autónomo |
| R4 | Guard anti-reincidencia (`relrowsecurity` en toda tabla `public`) | ❌ | P1 | S | Autónomo |
| R5 | service_role aislado server-only sin fugas | ✅ | — | — | — |
| **CSRF / Headers / CORS / Rate-limit** |
| C1 | **Rate-limit no-op** en `/api/catalog/*` + `/api/coupons/public` (`if(!objeto)`) | ❌ bug | **P0** | S | Autónomo |
| C2 | `Access-Control-Allow-Origin: *` en 13 puntos (catálogo/cupones) | ❌ vs política | P1 | S | Autónomo |
| C3 | CSP con `'unsafe-inline'`+`'unsafe-eval'` (spec pide nonce) | 🟡 | P1 | M | Autónomo |
| C4 | `frame-ancestors 'none'` explícito en CSP | 🟡 | P2 | S | Autónomo |
| C5 | Security headers (HSTS, X-Frame, nosniff, Referrer, Permissions) | ✅ | — | — | — |
| C6 | CORS restrictivo en proxy (allowlist) | ✅ | — | — | — |
| C7 | CSRF (Server Actions nativas + SameSite); `lib/csrf.ts` diferible | ✅ (cubierto) | P2 (doc) | S | Autónomo |
| C8 | `/api/vitals` POST sin rate-limit | ❌ | P2 | S | Autónomo |
| **VALIDACIÓN DE ARCHIVOS** |
| F1 | **MIME real (magic bytes) con `file-type`** — hoy confía en `file.type` | ❌ ambas vías | P1 | M | Autónomo |
| F2 | Rate-limit en upload de fotos cliente (30/10min) | ❌ | P1 | S | Autónomo |
| F3 | `metadata.owner_id` persiste donde la RLS lo busca (cast `as never`) | 🟡 [pend. verif.] | P1 | M | **Necesita-Lucy** (test E2E real) |
| F4 | Límite tamaño server-side (triple capa) | ✅ | — | — | — |
| F5 | Strip EXIF fotos cliente (sharp re-encode) | ✅ | — | — | — |
| F6 | Strip EXIF + re-encode fotos producto (admin) | 🟡 | P2 | S | Autónomo |
| F7 | Bucket cliente privado + signed URLs + nombres UUID | ✅ | — | — | — |
| F8 | Zod estandarizado en 7 actions admin restantes | 🟡 | P2 | S | Autónomo |
| **TURNSTILE / ANTI-ABUSO** |
| T1 | Turnstile en contacto + newsletter | ✅ | — | — | — |
| T2 | **Turnstile en registro** | ❌ | P1 | M | Autónomo (+ verif. keys prod) |
| T3 | **Turnstile en recuperar-password** (email-bombing) | ❌ | P1 | S | Autónomo |
| T4 | **Turnstile + rate-limit en checkout** | ❌ | P1 | M | Autónomo |
| T5 | Turnstile en login / OTP (tras N fallos) | 🟡 | P2 | S | Autónomo |
| T6 | Honeypots en forms públicos | ❌ | P2 | S | Autónomo |
| T7 | Bajar rate-limits prod a estrictos (signup 3/h, reset 3/h) | 🟡 deuda | P1 (al lanzar) | S | Autónomo |
| T8 | Rate-limit en carrito (`addToCart`/`updateQty`) | ❌ | P2 | S | Autónomo |
| T9 | Enumeración en registro (mensaje "ya tiene cuenta") | 🟡 | P2 | S | **Necesita-Lucy** (decisión UX) |
| T10 | CTA "Dejar reseña" roto (`?review=1` sin handler) | ❌ funcional | P1 func. | M | **Necesita-Lucy** (implementar o esconder) |
| T11 | Reserva de stock con TTL (divergencia spec; decrement-on-PAID mitiga) | 🟡 | P2 (doc ADR) | S | Autónomo |
| **SECRETS / CI / DEPS** |
| S1 | Sin secretos hardcodeados, `.env*` gitignored, gitleaks CI | ✅ | — | — | — |
| S2 | Todos los `NEXT_PUBLIC_*` legítimamente públicos | ✅ | — | — | — |
| S3 | `pnpm audit --audit-level=high` en CI | ❌ | P1 | S | Autónomo |
| S4 | Dependabot/Renovate | ❌ | P1 | S | Autónomo (Dependabot) / Necesita-Lucy (Renovate app) |
| S5 | `permissions: contents: read` en CI | ❌ | P1 | S | Autónomo |
| S6 | E2E (Playwright) en CI | ❌ | P1 | M | Autónomo |
| S7 | License check (GPL/AGPL allowlist) | ❌ | P2 | S | Autónomo |
| S8 | Pre-commit hook gitleaks (husky) | ❌ | P2 | S | Autónomo |
| S9 | **Branch protection en `main`/`develop`** | 🟡 [pend. verif.] | **P0 si falta** | S | **Necesita-Lucy** |
| S10 | Política de rotación documentada | ✅ | — | — | — |

---

## Lo que arranco YA (autónomo, sin bloquear)

Ordenado por severidad. Agrupado en commits lógicos.

### Commit 1 — `fix(security): rate-limit roto en catálogo + checkout` (P0/P1)
- **C1 (P0):** corregir `const allowed = await rateLimit(...)` → `const { allowed } = await rateLimit(...)` en las **10 rutas** `/api/catalog/*` + `/api/coupons/public`. El bug hace que `!objeto` sea siempre `false` → el freno nunca dispara. Bug de una palabra replicado. Añadir test de regresión.
  - Archivos: `apps/web/app/api/catalog/*/route.ts`, `apps/web/app/api/coupons/public/route.ts`.
- **T4/C3-checkout (P1):** añadir `rateLimit(ipKey("checkout", ip), 10, 600)` en `payWompiAction`/`finalizeCheckout`.
  - Archivos: `apps/web/app/checkout/pago/actions.ts`, `apps/web/features/checkout/service.ts`.
- **C8 (P2):** rate-limit fail-open en `/api/vitals` (`apps/web/app/api/vitals/route.ts`).
- **T8 (P2):** rate-limit en `apps/web/app/carrito/actions.ts`.

### Commit 2 — `fix(security): RLS en tablas faltantes + tests RLS` (P0)
- **R2 (P0):** crear `supabase/migrations/00000000000007_rls_remaining_tables.sql` con `ENABLE ROW LEVEL SECURITY` en las 16 tablas + políticas (owner-only para Design/DesignAsset; SELECT-publicado para CmsBlock/SiteSetting/PersonalizationTemplate/OcasionTag/UrlRedirect con mutaciones deny-default; deny-default total para Consent/SupportTicket/EmailEvent/SiteEvent/WebVital/ErrorReport/RecommendationLog/CmsBlockVersion/CouponUsage).
  - *(La escritura del SQL es autónoma; la aplicación a la DB viva es Necesita-Lucy — ver abajo.)*
- **R3 (P0/P1):** harness `pnpm test:rls` con `@supabase/supabase-js` + matriz rol×tabla×operación (Customer A no lee datos de B; anon no lee deny-default; anon sí lee catálogo publicado; anon no escribe CmsBlock/SiteSetting).
- **R4 (P1):** test smoke que falle si alguna tabla de `public` tiene `relrowsecurity=false` (anti-reincidencia).

### Commit 3 — `feat(security): RBAC por rol en admin + sesión` (P0/P1)
- **A5 (P0):** crear `apps/web/lib/admin-rbac.ts` con `requireRole(session, [...roles])` + matriz ruta→roles derivada de `SECURITY.md:113-118`; aplicar en layout/page de cada área sensible (finanzas, pedidos, productos, clientes, cupones, inventario) + actions; filtrar `apps/web/lib/admin-nav.ts` por rol.
- **A7 (P1):** idle-timeout 30 min en `proxy.ts` (cookie `admin_last_activity`).
- **A8 (P1):** logout admin con `signOut({scope:"global"})` + log `security.admin_logout`.
- **A9 (P1):** verificar flags de cookie en runtime; override en `setAll` si hace falta.
- **A10 (P2):** limpiar comentarios desactualizados de `proxy.ts:18-22`; corregir referencia `app/middleware.ts`→`proxy.ts` en `SECURITY.md:121`.

### Commit 4 — `feat(security): validación MIME real + EXIF + rate-limit upload` (P1/P2)
- **F1 (P1):** `pnpm add file-type`; en `uploadProductImage` y `uploadCustomerPhoto` detectar MIME por magic bytes y usar `ft.mime` como `contentType`. Archivos: `apps/web/lib/storage.ts`.
- **F2 (P1):** `rateLimit(upload:${ownerId}, 30, 600)` al inicio de `uploadDesignAssetAction` (`apps/web/features/personalization/actions.ts`).
- **F6 (P2):** `sharp().rotate().toBuffer()` en fotos de producto (strip EXIF + re-encode anti-polyglot).
- **F8 (P2):** estandarizar Zod en las 7 actions admin sin esquema.

### Commit 5 — `feat(security): Turnstile en registro/reset/checkout + honeypots` (P1/P2)
- **T2/T3/T4 (P1):** widget Turnstile + `verifyTurnstileToken` en registro, recuperar-password y checkout (copiar patrón de `features/support/actions.ts:67-71`).
- **T7 (P1 al lanzar):** bajar constantes de rate-limit prod (signup 3/h, reset 3/h).
- **T6 (P2):** honeypots `<input name="website" hidden>` en forms públicos.
- **T5 (P2):** Turnstile en login/OTP tras N fallos.
- **T11 (P2):** ADR en `DECISIONS.md` documentando decrement-on-PAID vs `StockReservation`.

### Commit 6 — `ci(security): pnpm audit + dependabot + permisos + E2E` (P1/P2)
- **C2 (P1):** quitar `Access-Control-Allow-Origin: *` de las 13 ocurrencias; dejar que el proxy gobierne CORS.
- **C4 (P2):** añadir `frame-ancestors 'none'` a la CSP en `proxy.ts:85`.
- **C7 (P2):** nota en `SECURITY.md` aclarando que CSRF se cubre por Server Actions + SameSite; `lib/csrf.ts` diferido.
- **S3 (P1):** job `dep-audit` con `pnpm audit --audit-level=high` en `ci.yml`.
- **S4 (P1):** `.github/dependabot.yml` (npm semanal + github-actions).
- **S5 (P1):** `permissions: contents: read` al top de `ci.yml`.
- **S6 (P1):** cablear E2E Playwright en CI contra preview Vercel.
- **S7 (P2):** license check (GPL/AGPL).
- **S8 (P2):** husky pre-commit `gitleaks protect --staged`.

### Commit 7 — `refactor(security): CSP por nonce` (P1, separado por riesgo de romper render)
- **C3 (P1):** migrar CSP a nonce; quitar al menos `'unsafe-eval'`; verificar en navegador que el storefront no se rompa. Separado porque requiere validación visual.

---

## Lo que necesita decisión / acción de Lucy

**ACCIÓN HUMANA REQUERIDA — 4 puntos. Sin estos, el launch no se certifica:**

1. **MFA admin / verificación en dos pasos (A6 — P0 por spec).**
   `SECURITY.md:94` la marca *obligatoria desde Fase 6*, pero **no existe nada de código** hoy. Necesito que decidas:
   - ¿La activamos para tu cuenta desde el día 1? (lo recomiendo: el admin ve finanzas y datos de clientes).
   - ¿Obligatoria para **todos** los roles admin o solo SUPERADMIN al inicio?
   - El **enrolamiento es acción humana tuya** (escanear un QR con Google Authenticator / Authy y guardar códigos de recuperación). Yo construyo la pantalla `/admin/seguridad`; tú la usas.
   - Si decides **diferir MFA**, debo registrar un ADR que sobrescriba `SECURITY.md:94` (mandato del proyecto: señalar el conflicto antes de actuar). Dime cuál de las dos.

2. **Aplicar los candados (RLS) a la base de datos viva (R2 — P0).**
   Yo escribo el SQL (autónomo), pero **aplicarlo toca el servidor real de Supabase**. Prefiero que lo autorices y lo corramos juntos (`prisma db execute` / `supabase db push`) + verificación en Supabase Studio. Esto ya estaba pendiente desde el 2026-05-28 (hallazgo P0-017).

3. **Llaves de Turnstile en producción (T2 — bloqueante operativo).**
   Confirmar que `NEXT_PUBLIC_TURNSTILE_SITE_KEY` y `TURNSTILE_SECRET_KEY` están cargadas en **Vercel producción**. **Importante:** si falta el secret en prod, el sistema bloquea **todo** contacto/newsletter por diseño (fail-closed). No puedo leer los valores (mandato), solo verifico que existan. `[pendiente verificación]`.

4. **Branch protection en GitHub (S9 — P0 efectivo si falta).**
   No pude verificarlo (`gh` no autenticado). Confirmá en GitHub → Settings → Branches que `main` y `develop` exigen: PR obligatorio, ≥1 review, status checks (`quality`/`unit-tests`/`secrets-scan`/`format-check`) requeridos, y bloqueo de force-push. **Si no está activo, todos los gates de CI son evadibles con un push directo** → es P0 real. `[pendiente verificación]`.

**Decisiones de UX (no bloqueantes de seguridad core, pero las necesito para cerrar):**

5. **Enumeración en registro (T9 — P2).** Hoy el registro dice *"Este correo ya tiene una cuenta"* — útil para el usuario, pero revela qué emails están registrados. ¿Lo dejamos así (lo documento en `DECISIONS.md`) o lo cambiamos a un mensaje genérico? El rate-limit por IP acota el abuso.

6. **CTA de reseñas roto (T10 — P1 funcional).** El botón "Dejar reseña" en pedidos enlaza a una página que no abre ningún formulario (no existe el flujo de envío de reseñas). ¿Implementamos reseñas para el launch (Turnstile + verificación de compra + sanitización) o **escondemos el botón** por ahora? Necesito tu llamada de alcance.

7. **`metadata.owner_id` en Storage (F3 — P1, [pendiente verificación]).** La RLS de fotos de cliente depende de un campo que el código guarda con un cast incierto (`as never`). Hay que hacer **un upload real** y verificar en qué columna queda (`metadata` vs `user_metadata`). Hoy no se nota porque todo va por signed URL del server, pero es frágil. Requiere prueba contra Supabase real.

8. **Renovate vs Dependabot (S4).** Dependabot lo activo yo solo. Renovate (mejor agrupación) requiere que **autorices su GitHub App**. Por defecto voy con Dependabot salvo que prefieras Renovate.

---

## Secuencia recomendada de Bloque C

**Fase C0 — P0 bloqueantes de launch (en paralelo donde se pueda):**
1. **C1** rate-limit catálogo roto — *trivial, máxima prioridad* (autónomo, Commit 1).
2. **R2** RLS 16 tablas — SQL autónomo ahora; aplicación con Lucy (Commit 2 + acción #2).
3. **A5** RBAC por rol admin (autónomo, Commit 3).
4. **A6** MFA admin — depende de decisión #1 (Lucy). Si se difiere → ADR.
5. **S9** branch protection — verificación de Lucy (#4). Si falta, activarla *antes* de confiar en cualquier gate.

**Fase C1 — P1 antes de launch:**
6. **R3/R4** tests RLS + guard anti-reincidencia (autónomo).
7. **T2/T3/T4** Turnstile registro/reset/checkout + **T7** rate-limits estrictos (autónomo + verif. keys #3).
8. **F1/F2** MIME real + rate-limit upload (autónomo).
9. **F3** verificación `owner_id` Storage (con Lucy, #7).
10. **C2** quitar CORS `*`; **C3** CSP nonce (Commit 7, con validación visual).
11. **A7/A8/A9** idle-timeout + logout global + flags cookie (autónomo).
12. **S3/S4/S5/S6** hardening CI (autónomo).
13. **T10** decisión reseñas (Lucy, #6).

**Fase C2 — P2, aceptable cerrar justo antes o poco después de launch:**
14. **C4** frame-ancestors, **C8** vitals RL, **T6** honeypots, **T8** carrito RL, **T5** login/OTP Turnstile.
15. **F6** EXIF producto, **F8** Zod admin, **S7** license, **S8** husky.
16. **A10/C7/T11** limpieza de docs + ADRs (proxy comments, csrf doc, stock decrement).
17. **T9** decisión enumeración registro (Lucy, #5).

**Notas de calibración honesta:**
- El único **P0 con impacto de explotación inmediato y fix trivial** es **C1** (rate-limit roto) — arranco por ahí.
- **R2** es P0 por mandato #12 y por PII expuesta, pero el impacto real (lectura vs lectura+escritura) depende de los grants de la DB viva → `[pendiente verificación]` con psql/Studio. Aun así se cierra sí o sí.
- **A6 (MFA)** es "P0 por spec" pero su criticidad real depende del modelo de amenaza que aceptes; si se difiere conscientemente con ADR, no bloquea técnicamente el resto.
- **S9 (branch protection)** es el comodín: si ya está activa, baja a no-issue; si no, es el P0 más barato de cerrar y el de mayor apalancamiento (protege todos los demás gates).

Archivos núcleo del bloque: `apps/web/proxy.ts`, `apps/web/lib/rate-limit.ts`, `apps/web/lib/storage.ts`, `apps/web/lib/auth.ts`, `apps/web/lib/admin-nav.ts`, `supabase/migrations/00000000000002_rls_policies.sql` (+ nuevo `…0007`), `packages/db/prisma/schema.prisma`, `apps/web/app/api/catalog/*/route.ts`, `apps/web/app/checkout/pago/actions.ts`, `apps/web/features/personalization/actions.ts`, `.github/workflows/ci.yml`, `docs/SECURITY.md`, `docs/DECISIONS.md`.