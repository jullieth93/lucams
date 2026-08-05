# Plan de salida a producción — 2026-07-21

> **Documento hermano de la auditoría:** `docs/audits/2026-07-21-fullstack-prelaunch-audit.md`.
> **Decisión estratégica (2026-07-21):** la salida se hace en **2 etapas**. La Etapa 1 pone `lucamsshop.com` a vender YA vía catálogo + cotización por WhatsApp — sin pagos en línea, sin envíos integrados, sin IA — porque no requiere NIT ni pasarela. La Etapa 2 activa la tienda full (Wompi + Aveonline) cuando los trámites humanos estén listos.
> **Por qué así:** los bloqueantes de la tienda full son trámites (NIT/RUT, abogado) y provisionamiento de terceros (Wompi prod espera el NIT). Mientras tanto, el negocio ya vende por Instagram/WhatsApp hoy; la Etapa 1 le da una tienda real con catálogo, estudio de personalización y panel admin, en lugar de seguir con Linktree.

---

## Etapa 1 — Catálogo + WhatsApp en producción (objetivo: esta semana)

### Qué incluye

- Storefront completo: home, catálogo con filtros/búsqueda, PDP con variantes/reseñas/wishlist, ocasiones, recomendador, páginas legales, contacto, FAQ.
- **Estudio de personalización completo** (editor Konva + vistas 3D) — el diferenciador #1. Se oculta solo el panel de sugerencias IA (Gemini).
- Carrito funcional → **cotización de 1 paso** (nombre, WhatsApp, ciudad, notas) → registro `Quote` en DB → página de confirmación con botón **"Enviar por WhatsApp"** (wa.me con mensaje pre-armado: # de cotización, productos, total, datos).
- Panel admin: los ~25 módulos operativos + **módulo nuevo `/admin/cotizaciones`** (lista, detalle, cambio de estado, botón "Abrir WhatsApp", notas internas). Se ocultan Finanzas/Integraciones de pago-envío (Etapa 2).
- Email transaccional vía Resend (auth, contacto, confirmación de cotización) y Turnstile en formularios. **Sin** Wompi, **sin** Aveonline, **sin** Gemini.

### Implementación técnica (resumen — rama `catalogo-whatsapp`)

Modo por flag `NEXT_PUBLIC_STORE_MODE=catalog` (default `full`) sobre la base de `develop` — sin borrar código, merge-back limpio para la Etapa 2. Modelos nuevos `Quote`/`QuoteItem` (Prisma + RLS deny-by-default), feature `features/quotes/`, checkout convertido a formulario de cotización, admin de cotizaciones, tests Vitest + Playwright.

### Checklist de salida Etapa 1

- [ ] **P0-5: Upgrade Vercel Pro + Supabase Pro (FASE 11.b).** Vercel Hobby prohíbe uso comercial — obligatorio ANTES de abrir al público. (Lucy, ~1h)
- [ ] Rama `catalogo-whatsapp` creada desde `develop`, implementación completa, tests verdes (typecheck, lint, Vitest, build, E2E smoke en modo catálogo).
- [ ] Env var `NEXT_PUBLIC_STORE_MODE=catalog` en Vercel (Production).
- [ ] Merge a `production` → deploy → verificación en vivo:
  - [ ] Home, catálogo, PDP, carrito → cotización completa con wa.me real (enviar una cotización de prueba al WhatsApp del negocio).
  - [ ] Admin: login + MFA + módulo cotizaciones (cambiar estado, abrir WhatsApp).
  - [ ] `/api/health/all` → ok; Turnstile operando en formularios; contacto llega por email.
  - [ ] **Regresión:** ninguna mención a pago en línea, tarjetas, Wompi, costo de envío calculado, ni panel IA en la UI pública.
- [ ] QA_CHECKLIST corrida versión Etapa 1 (secciones aplicables: storefront, carrito/cotización, admin, legal, SEO, a11y, cross-browser).
- [ ] Anuncio: actualizar Linktree/Instagram con el link a la tienda. (Lucy)

### Riesgos aceptados Etapa 1

- ~~Backups R2 aún rotos~~ **CERRADO 2026-07-27** (verificado 2026-08-04: secrets GitHub configurados, workflow semanal verde, dumps subiéndose a R2 con retención). Pendiente solo el DR drill.
- Supabase compartida dev/prod (riesgo aceptado por Lucy 2026-07-21; los tests de integración ya usan prefijo RUN + cleanup).
- Emails de recuperación de carrito y back-in-stock siguen activos (usan Resend, ya verificado).

---

## Etapa 2 — Tienda full con pagos y envíos (cuando el NIT llegue)

### P0 humanos (bloqueantes — empezar YA en paralelo, no dependen de código)

| #   | Acción                                                                                                | Bloquea                       | Notas                                                |
| --- | ----------------------------------------------------------------------------------------------------- | ----------------------------- | ---------------------------------------------------- |
| H-1 | **NIT/RUT + Cámara de Comercio** (ADR-071, persona natural)                                           | Wompi prod, DIAN              | Es el cuello de botella real del lanzamiento full    |
| H-2 | Abogado revisa los 8 textos legales (ADR-020) + cierra `[pendiente verificación]` de cookies/términos | Compliance                    | Los drafts son base compliant, no reemplazan abogado |
| H-3 | Decisión de régimen DIAN + facturación electrónica con contador (Resolución 165/2023)                 | Venta legal con pago en línea | Multas hasta 1% de ingresos                          |
| H-4 | Verificar que el bucket R2 existe en Cloudflare (FASE 10 — handshake TLS)                             | Backups/DR                    | Hipótesis: R2 no aprovisionado en la cuenta          |

### P0 técnicos (secuencia una vez H-1 esté)

1. **FASE 10:** cerrar backups R2 (tras H-4) + DR drill de restauración.
2. **FASE 7:** cuenta Wompi propia → llaves prod en Vercel → `WOMPI_ENV=production` → webhook prod configurado → prueba con tarjeta de prueba prod → compra real de $1 (o el mínimo).
3. **FASE 8 + 12:** `AVEONLINE_ENV=production` → compra real de punta a punta (checklist de 7 pasos del runbook: pago aprobado, guía generada, emails, webhook, tracking, entrega, conciliación).
4. **Switch de modo:** quitar `NEXT_PUBLIC_STORE_MODE=catalog` de Vercel (volver a `full`), merge de `develop` (con el modo flag ya integrado) a `production` → deploy → verificación.
5. Cotizaciones abiertas de Etapa 1: quedan accesibles en el admin (el módulo convive con pedidos).

### P1 técnicos (antes o durante la semana de Etapa 2)

- Separar Supabase dev/prod (decisión explícita de Lucy; con pagos reales un test de integración no puede tocar la tienda viva).
- Refrescar `docs/QA_CHECKLIST.md` completo + corrida total (hoy está virgen y con contenido de mayo).
- Corrida k6 de load testing (`tests/load/storefront-browsing.js`) — nunca ejecutado.
- E2E de pago real en sandbox (spec Playwright nuevo o manual guiado).
- SLOs cuantitativos del bloque D (backend listo, faltan umbrales).

### Criterios de salida Etapa 2 (definition of done)

- Runbook go-live: las 13 fases cerradas (incluidas FASE 0 legal y FASE 12 compra real verificada).
- QA_CHECKLIST completo marcado + E2E 26/26 + suite Vitest verde + k6 ejecutado con resultados documentados.
- Una semana de operación de Etapa 1 sin incidentes P1.
- Conciliación COD y antifraude verificados con al menos una venta real por método.

---

## Fixes ya aplicados (sesión 2026-07-21, parte de la auditoría)

- SEC-01: SVG del QR de MFA encapsulado (mfa-enroll).
- SEC-02: fallback `?? "dev"` eliminado del HMAC de unsubscribe.
- SEC-03: redirects admin ahora exigen `https:` (o path interno).
- UX-01: Soporte y Garantías agregados al NAV admin.
- DOC-01/02/03: `CLAUDE.md` "Estado actual" corregido; mandatos de logística a Aveonline; `OPERATIONS.md` con `CRON_SECRET`/`EMAIL_REPLY_TO` y Gemini en vez de Anthropic.

## Semáforo de dependencias (qué espera a qué)

```
H-1 NIT ──────────────┬──> FASE 7 Wompi prod ──┐
H-3 DIAN/contador ────┤                       ├──> Etapa 2 (switch a full)
H-2 abogado ──────────┘                       │
H-4 bucket R2 ──> FASE 10 backups ──> DR drill│
                                              │
Etapa 1 (catálogo) ──NO espera nada de esto───┘ (solo P0-5 upgrades)
```
