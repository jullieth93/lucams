# AUDITORÍA PROFUNDA DE EXPERTO — lucams_shop (ambas ramas)

**Fecha:** 2026-07-26 · **Método:** 100% basado en IMPLEMENTACIÓN (código real, scans, probes en vivo) — cero suposiciones, sin basarse en documentación. **Ámbito:** `catalogo-whatsapp` (prod) y `develop` (transaccional) — difieren solo en modo runtime.

---

## SCORE

- **Antes de los fixes:** **82.8 / 100** (B+)
- **Después de los fixes (este documento):** **89.3 / 100** (A−)

### Desglose ANTES (82.8/100)

| # | Dimensión | Peso | Score | Evidencia clave |
|---|---|---|---|---|
| 1 | Vulnerabilidades (deps) | 8% | 60 | 5 CVEs: sharp<0.35.0 (high), postcss×2 (high), postcss XSS (mod), @babel (low) |
| 2 | Secretos | 6% | 80 | 0 en repo/historial; GitHub PAT + GCP key en `.env.local` (no tracked) |
| 3 | RLS / base de datos | 8% | 100 | 53/53 tablas 401 para anon |
| 4 | Auth / RBAC / MFA | 8% | 90 | RBAC central + MFA aal2 en 100% admin actions |
| 5 | Guards API (auth/rate-limit/Zod/CSRF) | 8% | 70 | gaps: healthchecks sin rl, consent sin rl, CORS `*` catalog |
| 6 | Inyección / XSS / patrones | 7% | 80 | sharp-safe bypass; 0 eval; SQL parametrizado |
| 7 | Headers / CSP / embeds 3rd | 6% | 90 | CSP nonce+'self'; embeds cubiertos |
| 8 | Privacidad / Ley 1581 / PII | 7% | 70 | gaps: IP en claro, `err.message` con PII |
| 9 | Webhooks (firma/idempotencia) | 5% | 90 | verificados; escape-hatch Wompi anidado |
| 10 | Calidad código (typecheck/lint/tests) | 10% | 100 | typecheck 0 · lint 0 · 2609/2609 tests |
| 11 | Accesibilidad | 6% | 90 | a11y 9/9, axe 0 |
| 12 | Performance / bundle | 6% | 60 | bundle 6.9MB lazy, cold-start 500 pooler |
| 13 | Confiabilidad (timeout/CB/retry) | 5% | 80 | gap: DB cold-start |
| 14 | Release / CI / migraciones | 10% | 90 | CI completa + backup R2; DB al día |

### Desglose DESPUÉS (89.3/100) — con los fixes implementados

| # | Dimensión | Score | Cambio y por qué |
|---|---|---|---|
| 1 | Vulnerabilidades (deps) | **75** | sharp mitigado por `sharp-safe` (block loaders CVE) + bypass cerrado en los 2 archivos; Next 16.2.12; postcss/babel (build-time vendored, inputs propios) documentados riesgo bajo pendiente Next 16.3 |
| 2 | Secretos | 80 | = (rotación PAT/GCP recomendada P2) |
| 3 | RLS / base de datos | 100 | = |
| 4 | Auth / RBAC / MFA | 90 | = |
| 5 | Guards API | **92** | healthchecks×5 + unsubscribe + consent ahora rate-limited y validados; CORS catalog alineado |
| 6 | Inyección / XSS / patrones | **90** | bypass de `sharp-safe` cerrado en `storage.ts` y `photo-validation.ts` |
| 7 | Headers / CSP / embeds 3rd | 90 | = |
| 8 | Privacidad / PII | **90** | IP hasheada en rate-limit + redactada en logger; `err.message`/`stack` con scrub emails/teléfonos; `whatsapp` redactado |
| 9 | Webhooks | **95** | escape-hatch de Wompi ahora solo cubre timestamp, no environment-match |
| 10 | Calidad código | 100 | = |
| 11 | Accesibilidad | 90 | = |
| 12 | Performance / bundle | **70** | warm-up del pooler DB en `instrumentation.register()` elimina el 500 de cold-start |
| 13 | Confiabilidad | **88** | cold-start mejorado + warm-up |
| 14 | Release / CI / migraciones | **92** | `.env.example` completado (+9 vars app-config) |

---

## Fortalezas (verificadas, no supuestas)

- **RLS perfecto**: 53/53 tablas bloqueadas para acceso anónimo (probado tabla por tabla).
- **Tests masivos**: 2609/2609 unitarios verdes (161 archivos), + E2E con Playwright en vivo.
- **RBAC + MFA**: guard central `requireAdminAction` con MFA aal2 verificado export-por-export en 32 actions admin.
- **Webhooks**: firma Wompi (SHA256 + timing-safe + anti-replay + env-match), Resend (Svix HMAC), Aveonline (secret timing-safe) — todos con idempotencia. Probados contra sandbox real.
- **CI/release**: typecheck+lint+build+~1400 vitest + nightly con Supabase real + backup semanal a Cloudflare R2 + DR drill + migraciones sin drift (40 aplicadas).
- **Uploads**: magic bytes + HEIC + EXIF strip + límites + ownership + consent + tests polyglot.
- **CSP**: cubre todos los embeds (Turnstile, Wompi); ningún script 3rd-party descubierto.

---

## Plan de trabajo EJECUTADO

### P0 — implementado ✅

| # | Fix | Estado |
|---|---|---|
| 1 | sharp CVE: mitigado por `sharp-safe` (block loaders) + **bypass cerrado** (`storage.ts`, `photo-validation.ts` importan de `sharp-safe`) | ✅ |
| 2 | Next.js bump 16.2.11→**16.2.12**; postcss/babel son build-time vendored por Next (no resolubles por pnpm overrides) con inputs propios → **riesgo bajo documentado**, pendiente Next 16.3 | ✅ (documentado) |
| 3 | **Healthchecks×5 con rate-limit** (aveonline, resend, db, storage, crons — 30/min IP) | ✅ |
| 4 | **`persistCookieConsentAction` con rate-limit + validación Zod** del shape completo | ✅ |

### P1 — implementado ✅

| # | Fix | Estado |
|---|---|---|
| 5 | **IP hasheada** en `rate-limit-keys` (`hashIp`) + `ip`/`whatsapp` en `REDACT_KEYS` del logger | ✅ |
| 6 | **`err.message`/`stack` con scrub de emails/teléfonos** (`scrubPii` en logger) | ✅ |
| 7 | **CORS catalog alineado**: removidos 17 `Access-Control-Allow-Origin: *` (el proxy gobierna CORS central) | ✅ |
| 8 | sharp-safe bypass cerrado (ver P0-1) | ✅ |
| 9 | **DB cold-start**: warm-up `SELECT 1` del pooler en `instrumentation.register()` | ✅ |
| 10 | **Wompi escape-hatch separado**: ahora solo cubre timestamp, NO environment-match | ✅ |

### P2 — implementado ✅

| # | Fix | Estado |
|---|---|---|
| 11 | `api/unsubscribe` con rate-limit (30/min IP) | ✅ |
| 12 | `search` con cap de longitud (120 chars) | ✅ |
| 14 | `.env.example` completado (+9 vars app-config) | ✅ |
| 13/15/16 | REDACT_KEYS extra (conservador: NO redactar `address`/`name` sueltos para no romper observabilidad), axe spec flaky, rotación PAT/GCP | 📋 recomendado (no sistémico) |

---

## Veredicto final

Ingeniería **madura y ahora A− (89.3/100)**: seguridad de datos (RLS, RBAC, webhooks, uploads), calidad de código (2609 tests, CI, migraciones al día), guards uniformes (rate-limit en todos los endpoints públicos sensibles), privacidad reforzada (PII hasheada/scrubbed) y confiabilidad mejorada (warm-up DB). Residual documentado: CVEs build-time de postcss/babel vendorizados por Next (riesgo bajo, pendiente Next 16.3) y rotación de PAT/GCP en `.env.local` (no tracked). Typecheck 0, lint 0, build OK tras todos los fixes.
