# HANDOFF — Estabilización y certificación Lucams (2026-07-28, cierre Fase B)

Documento de continuidad de sesión. Todo lo aquí escrito está verificado; nada es suposición.

---

## 1. Objetivo

Estabilizar y **certificar al 100%, técnica y funcionalmente, las dos ramas** del e-commerce Lucams (monorepo pnpm, Next.js 16, Prisma, Supabase, Vercel):

- **`catalogo-whatsapp`** (rama de PRODUCCIÓN en Vercel, lucamsshop.com): modo catálogo, cotización por WhatsApp. → **FASE A: ✅ CERTIFICADA** (informe `docs/audits/2026-07-28-certificacion-catalogo-whatsapp.md`).
- **`develop`**: lo anterior + **transaccionalidad** — Wompi (pagos) y Aveonline (envíos), ambos sandbox. → **FASE B: ✅ CERTIFICADA** (informe `docs/audits/2026-07-28-certificacion-develop.md`).
- Metodología: auditoría sin suposiciones, pruebas reales (vitest, Playwright/Chromium, k6, seguridad en vivo), usuarios de prueba autorizados (crearlos y eliminarlos).

---

## 2. Estado final de Fase B (develop)

- **E2E transaccional verde 2/2** (`tests/e2e/wompi-sandbox.spec.ts`, 2.3 min): PDP→carrito→datos→cotización Aveonline real→Wompi sandbox 4242→webhook firmado→saga→orden **FULFILLING + guía real** (LCM-2026-0176/0178, Servientrega 247215217/2245604743).
- **Vitest 2626/2626** · typecheck OK · eslint OK · build OK.
- **Suites contra preview develop: 48/48 + 3/3** (smoke, a11y/axe 0 violaciones, admin completo, preview-cert 5/5, admin-transactional 3/3 con orden PAID real visible en /admin/pedidos y /admin/finanzas operativo).
- **9 bugs reales corregidos** (detalle en el informe §3): COD doble flete, liquidación multi-producto (modelo "caja apilada"), gracias crash (cookies RSC), dsnit placeholder, replay window 5min→25h, DECLINED ya no cancela, tracking Aveonline muerto, relacion_envios fantasma, dscorreop vacío.
- **Auditoría doc oficial Wompi + Aveonline** completa (mandatoria): gaps corregidos; decisiones abiertas documentadas en `docs/INTEGRATIONS_AVEONLINE.md` §21 (bloquegenerarguia, IVA, recogidas, cotizarDoble).
- **Webhook Wompi sandbox natural configurado** (usuario): URL de Eventos → `https://lucams-shop-git-develop-jullieth93s-projects.vercel.app/api/webhooks/wompi` (verificado: alcanza la app, 401 a firma inválida).

### Commits (todos pusheados)
`cfc9028` merge Fase A · `da78cb2` handoff previo · `734c3fb` spec e2e + fixes dsnit/gracias/PW_CHANNEL · `cd1043d` auditoría integraciones (COD, empaque, replay, DECLINED, prefill) · último: specs preview-cert (slug) + admin-transactional + informe Fase B.

---

## 3. PENDIENTES INMEDIATOS (en orden)

1. **Usuario: re-activar Vercel Authentication (SSO) para previews** — Settings del proyecto → Deployment Protection → Vercel Authentication ON. Se apagó SOLO para certificar (el SSO bloqueaba suites y el webhook de Wompi: `all_except_custom_domains`). Producción (dominio propio) no se ve afectada nunca por este toggle.
2. **Go-live master** (cuando se decida): `WOMPI_ENV=prod` + 4 llaves Wompi PRODUCCIÓN en Vercel (scope Production) + URL de Eventos prod → `https://lucamsshop.com/api/webhooks/wompi` + `AVEONLINE_*` reales (ya están, verificar) + `AVEONLINE_GENERATE_REAL=true` SOLO tras el paso 3.
3. **Verificación `bloquegenerarguia` con cuenta real** (la doc dice 1=generar/0=no; nuestro gate usa semántica inversa histórica): generar una guía con cada valor y revisar cartera en el panel Aveonline. Registrar resultado en `docs/INTEGRATIONS_AVEONLINE.md` §21.4.
4. **Decisión contable IVA** → si Lucy es responsable de IVA, cablear `tax-in-cents:vat` en `finalizeCheckout` (el campo ya existe en `buildCheckoutUrl`).
5. Merge `develop` → `master` tras los pasos 2-4. Después: Supabase test/staging separado (decisión aplazada).

### Mejoras no bloqueantes (backlog documentado)
Recogidas por API (`generarRecogida2`), reimpresión de rótulo (API V3), entrega en oficina (`IdTipoEntrega=2`), polling en PendingPage, `expiration-time` en checkout (meterlo en la firma en el mismo PR), persistir `payment_method_type`/`status_message`, migrar webhook Aveonline al token oficial, fechas `fechacreacion`/`fechanovedad` AM/PM, spec formal de `cotizarDoble` a Aveonline, guard de monto máximo Wompi vs contrato (agregador/gateway).

---

## 4. Gotchas aprendidos en Fase B (nuevos — los de Fase A están en el informe A)

- `pkill -f "next start"` se auto-mata; usar `fuser -k 4000/tcp`.
- **NUNCA correr vitest y playwright e2e en paralelo** (comparten BD; los 37 fallos de una baseline fueron eso).
- `.next/dev/types` se corrompe al matar dev servers a mitad de escritura → `rm -rf .next/dev/types` (o todo `.next`) antes de typecheck.
- Wompi checkout hospedado: año de tarjeta en 2 dígitos ("28"); validación de campos en BLUR; los 2 consentimientos pueden ser tragados por un re-render (reintentar verificando); el botón final dice "Continuar con tu pago"; **anti-bot bloquea el CTA ~50% en chromium_headless_shell → `PW_CHANNEL=chromium`** (config en playwright.config.ts).
- El banner de cookies aparece en CADA navegador de test → aceptarlo siempre al inicio.
- Productos vía Prisma invisibles en deploys con Data Cache caliente; en dev server sí se ven.
- El redirect-url a localhost lo OMITE la app (WAF Wompi 403) — el e2e lo reconstruye vía API Wompi (`/checkout/gracias?id=<txId>&env=test`).
- Wompi pre-llena email/celular por fetch de sesión DESPUÉS del primer render → ese re-render pisa campos llenados antes (llenar con verificación).
- Vercel SSO del proyecto (`all_except_custom_domains`) bloquea previews ENTEROS (páginas + API) y su toggle de equipo NO es el del proyecto. Se consulta/paga por API: `GET/PATCH /v9/projects/lucams-shop` (`ssoProtection`).
- La guía Aveonline imprime `productos[].unidades` como N bultos (unidades:5 → "1 / 5"): SIEMPRE 1 bulto agregado con el modelo caja apilada.

### Comandos de utilidad
- E2E transaccional: `cd apps/web && set -a && source .env.local && set +a && TURNSTILE_SECRET_KEY= NEXT_PUBLIC_TURNSTILE_SITE_KEY= PW_CHANNEL=chromium npx playwright test wompi-sandbox --workers=1 --retries=0`
- Suites contra preview: igual pero `PLAYWRIGHT_BASE_URL=<url-preview> npx playwright test smoke a11y axe admin-login admin-mfa audit-admin admin100-shots preview-cert admin-transactional`
- Vitest: `pnpm --filter web test` (NUNCA en paralelo con e2e)
- Queries BD (solo lectura): `cd packages/db && node --env-file=../../apps/web/.env.local -e '<js>'`
- Deploys/logs: `vercel ls lucams-shop`, `vercel logs <url>`, `vercel inspect <url> --logs`
