# HANDOFF — Lucams: Fase A y Fase B CERTIFICADAS (cierre 2026-07-28)

Documento de continuidad. Todo lo aquí escrito está verificado con evidencia (capturas, logs, órdenes reales, respuestas de API); nada es suposición. Reescrito minucioso al cierre de la Fase B.

---

## 1. Objetivo

Estabilizar y **certificar al 100%, técnica y funcionalmente, las dos ramas** del e-commerce Lucams (monorepo pnpm, Next.js 16, Prisma, Supabase, Vercel):

- **`catalogo-whatsapp`** — rama de PRODUCCIÓN en Vercel (lucamsshop.com). Modo catálogo: vitrina + cotización por WhatsApp, sin pagos ni envíos online.
- **`develop`** — lo anterior + **transaccionalidad completa**: Wompi (pagos, llaves sandbox) + Aveonline (envíos, cuenta sandbox). Debe quedar lista para ser la futura producción.
- Capa cliente y capa admin cableadas de punta a punta; el admin lo opera una persona **no técnica** (Lucy) → "menos es más": mínimo necesario, todo funcional.
- Metodología: auditoría profunda sin suposiciones, pruebas reales (vitest, Playwright/Chromium visual, k6, seguridad en vivo, órdenes sandbox reales), usuarios de prueba autorizados (crearlos y eliminarlos siempre).

---

## 2. Estado en que va y terminó todo

### FASE A — `catalogo-whatsapp`: ✅ CERTIFICADA (en producción)
Informe completo: `docs/audits/2026-07-28-certificacion-catalogo-whatsapp.md`. Resumen: sharp 0.34.4 estabilizado (el 0.35 rompía lambdas), baseline 2609/2609, e2e/a11y/admin verdes contra producción, seguridad en vivo OK (CSP/HSTS/rate-limits/RBAC), k6 0% errores, BD saneada con guardas (8 cotizaciones reales de "Cristian" intactas), red anti-basura activa.

### FASE B — `develop`: ✅ CERTIFICADA (2026-07-28, esta sesión)
Informe completo: `docs/audits/2026-07-28-certificacion-develop.md`. Estado verificado:

- **E2E transaccional verde 2/2 corridas** (`apps/web/tests/e2e/wompi-sandbox.spec.ts`, ~2.3 min): PDP → carrito → datos → **cotización Aveonline real (4 transportadoras)** → checkout hospedado **Wompi sandbox (4242)** → redirect gracias → **webhook firmado 200** → saga → orden **FULFILLING + guía Aveonline real + rótulo PDF**. Órdenes de evidencia: **LCM-2026-0176** (guía Servientrega 247215217) y **LCM-2026-0178** (guía Servientrega 2245604743) — soft-borradas por el propio test tras verificar.
- **Baseline**: vitest **2626/2626** (2 corridas limpias, sin concurrencia) · typecheck OK · eslint OK · build/preview OK.
- **Suites contra el preview de develop: 48/48 + 3/3** (preview `lucams-shop-ebz1os5ip`, commit `cd1043d`): smoke 8/8, a11y/axe **0 violaciones**, admin-login/mfa/audit-admin/admin100-shots verdes, preview-cert 5/5, y **admin transaccional 3/3** (`admin-transactional.spec.ts` nuevo: `/admin/pedidos` lista la orden PAID real, `/admin/finanzas` operativo con ingresos reales, `/admin/moderacion` + `/admin/disenos` cargan).
- **9 bugs reales de producción corregidos** (detalle §4 del informe; todos habrían explotado en prod):
  1. **COD cobraba el flete DOS veces** (contraentrega=1/idasumecosto=1 = fila 2 de la tabla oficial; el total ya incluía flete) → ahora `0/0` (fila 5: el mensajero cobra exactamente `order.total`).
  2. **Liquidación multi-producto errada** (cotización per-línea con qty solo en peso + guía bounding-box que sub-declaraba volumen → re-liquidación en contra) → modelo **"caja apilada"** compartido (`computePackedPackage`): peso Σ, espesor Σ(dim menor × qty), huella máxima. qty=2 **nunca duplica** el flete ni se sobredimensiona; cotizado == facturado.
  3. **`/checkout/gracias` reventaba tras el pago** (`cookies().delete()` en render RSC → el cliente que pagaba veía "Algo salió mal") → limpieza en Server Action (`<ClearCheckoutSession/>` + stage-guard).
  4. **Placeholder `dsnit` "000001" rechazado** por Aveonline (regla viva: numérico ≥5 dígitos y >10000) → toda guía sin CC del cliente fallaba → `"100001"`.
  5. **Ventana anti-replay 5 min mataba los reintentos documentados de Wompi** (reintenta a los 30min/3h/24h con el MISMO timestamp, que va en la firma) → ventana 25 h; idempotencia por dedup de eventKey.
  6. **DECLINED cancelaba la orden** y rompía el reintento de pago nativo de Wompi (~3 min, misma referencia) → DECLINED/ERROR = noop (orden sigue PENDING_PAYMENT); VOIDED (dinero capturado) sigue el path de refund.
  7. **Tracking Aveonline muerto** (`EN DESPACHO`/`EN REPARTO`/`ANULADA` no mapeaban) → mapeo de estados canónicos de la doc.
  8. `relacion_envios: "1"` declarado sin crearla jamás → `"0"`.
  9. `dscorreop` (requerido, error -13) podía ir vacío → validación temprana accionable.
  \+ Wompi: **prefill completo** `customer-data` (full-name, phone +57, legal-id+type) — el cliente ya no redigita dentro de Wompi.
- **Auditoría doc oficial Wompi + Aveonline** (solicitud mandatoria del usuario): re-lectura completa campo por campo, gaps corregidos, decisiones abiertas documentadas en `docs/INTEGRATIONS_AVEONLINE.md` §21.
- **Webhook Wompi sandbox natural configurado** (usuario en dashboard Wompi): URL de Eventos → `https://lucams-shop-git-develop-jullieth93s-projects.vercel.app/api/webhooks/wompi`. Verificado: alcanza la app y valida firma (401 a firma inválida).
- **Vercel SSO de previews**: se desactivó SOLO para certificar y **ya quedó re-activado por el usuario** (verificado: preview 302 → login; lucamsshop.com 200 público).

---

## 3. Archivos y Cambios

### Commits en `catalogo-whatsapp` (producción, todos pusheados)
`44291fd` sharp 0.34.4 + lazy render · `1229537` teardown carga .env.local · `de57e8a` updateTag("catalog") · `c2d0f4f` test fichas Ola 19 · `9c5d04e`+`3cf4b13` dependabot minor/patch + ignore majors · `15702af` paquete Fase A (30 archivos) · `805be97` informe Fase A.

### Commits en `develop` (todos pusheados; rama al día con origin)
| Commit | Contenido |
|---|---|
| `cfc9028` | Merge Fase A (3 conflictos resueltos mode-aware) |
| `da78cb2` | HANDOFF previo (Fase A certificada, Fase B ~70%) |
| `734c3fb` | `tests/e2e/wompi-sandbox.spec.ts` (nuevo) + fix dsnit (`features/shipping/aveonline.ts`) + fix gracias crash (`app/checkout/gracias/{page.tsx,actions.ts,clear-checkout-session.tsx}` nuevos) + `playwright.config.ts` (PW_CHANNEL) |
| `cd1043d` | **Auditoría integraciones** (13 archivos): COD fila 5 + `computePackedPackage` + `relacion_envios=0` + `dscorreop` + status mapping (`aveonline.ts`, `aveonline.test.ts`); replay 25h + DECLINED noop (`app/api/webhooks/wompi/route.ts` + integration test); prefill customer-data (`lib/wompi.ts`, `lib/wompi.test.ts`, `features/payments/{provider,wompi}.ts`, `features/checkout/service.ts`); stage-guard en `gracias/actions.ts`; docs (`INTEGRATIONS.md`, `INTEGRATIONS_AVEONLINE.md` §21) |
| `4718802` | `tests/e2e/admin-transactional.spec.ts` (nuevo) + `preview-cert.spec.ts` (slug `separadores-libros`→`separadores-magneticos`) + informe Fase B + HANDOFF cierre |

### Working tree
Limpio (`git status` vacío). Nada sin commitear.

### Credenciales/infra (verificado)
- Vercel: proyecto `lucams-shop`, rootDirectory `apps/web`, Node 22, **rama producción = `catalogo-whatsapp`** (intacta). SSO del proyecto ON para previews (`all_except_custom_domains`).
- WOMPI_* (4 llaves sandbox) + AVEONLINE_USUARIO/CLAVE + WOMPI_ENV=sandbox: en `apps/web/.env.local` y Vercel (Preview+Production). `NEXT_PUBLIC_STORE_MODE` solo en Production (previews corren modo full).
- BD: UN solo proyecto Supabase (dev=prod), saneada, red anti-basura activa.
- Wompi dashboard sandbox: URL de Eventos → alias git-develop (configurada por el usuario 2026-07-28).

---

## 4. Intentos Fallidos (y qué los resolvió)

### 4.1 E2E transaccional — 22 intentos (UI de Wompi mapeada de cero)
1. Banner de cookies tapaba el CTA (z-9000) → aceptarlo ("Solo necesarias") al inicio de todo spec.
2. Nombre con números rechazado por el form de datos → "Valentina Wompi" (solo letras).
3. "Tipo de dirección" (Urbana/Rural) requerido; `cruceNumber` exige formato `NN-NN`.
4. Precio $199 COP < mínimo Wompi ($35.000) → producto fixture a $40.000.
5. Opción de método es "Tarjeta débito o crédito" con texto partido en spans → clic en ancestro clicable.
6. `input[name=number]` es el CELULAR, no la tarjeta (la 4242 acabó en el celular en un intento).
7. La pantalla de tarjeta viene DESPUÉS de "Continuar con tu pago" (datos comprador primero).
8. **Año de expiración**: `select:has(option:text-is("2028"))` quemó 600s — las opciones son 2 dígitos ("28") → anclar el select por placeholder "Año" y leer sus options reales.
9. **Consentimientos** (2 checkboxes): `check()` "did not change state" — un re-render mientras carga el token de aceptación se traga el clic → reintento verificado con `toPass`.
10. **Prefill de Wompi pisa campos**: email/celular llegan por fetch de sesión DESPUÉS del primer render y ese re-render borra el nombre → llenar verificando que el valor quede + esperar botón habilitado.
11. **Validación en blur**: con el foco dentro del campo el botón nunca habilita → `blur()` explícito.
12. **Botón final ≠ "Pagar"**: dice "Continuar con tu pago" (regex actualizado).
13. **Anti-bot Wompi**: el CTA queda bloqueado ~50% de corridas en `chromium_headless_shell` (sin requests fallidos — detección de automatización) → `PW_CHANNEL=chromium` (build completo) en playwright.config.ts.
14. **Redirect localhost omitido** (WAF Wompi 403) → el e2e reconstruye `/checkout/gracias?id=<txId>&env=test` consultando la tx por API Wompi.
15. **Aserción de test demasiado estricta**: esperaba status `PAID` pero con guía creada la orden avanza a `FULFILLING` → aceptar PAID|FULFILLING|SHIPPED|DELIVERED.

### 4.2 Bugs reales que el e2e destapó (corregidos, ver §2)
- Intento 18 llegó a la saga y expuso: **dsnit rechazado** (guía fallaba) y **gracias en crash** (cliente veía "Algo salió mal" tras pagar — digest del error = cookies RSC).
- Auditoría doc expuso: **COD doble flete**, **liquidación multi-producto**, **replay window**, **DECLINED+cancel**, **tracking muerto**, **relacion_envios**, **dscorreop**.

### 4.3 Otros fallos del camino
- **Baseline vitest 37 fallos** (corrida vieja): interferencia suite↔e2e compartiendo BD + pooler inestable → regla de hierro: **NUNCA vitest y playwright en paralelo**.
- **`clone-design-for-edit` timeout 5s**: flake de pooler (pasa con 30s) — no es fallo real.
- **`stage-boundary.test.ts` 2 fallos**: el nuevo `gracias/actions.ts` no tenía `guardTransactionalAction` (convención del repo) → guard agregado.
- **`.next/dev/types` corrupto** (dev servers matados a mitad de escritura) → `rm -rf .next/dev/types` antes de typecheck.
- **SSO de Vercel bloqueaba previews ENTEROS** (páginas Y API → suites fallaban con "Login – Vercel" y el webhook real de Wompi recibía 401 "Protected deployment"). Diagnóstico vía API: `ssoProtection: all_except_custom_domains` a nivel PROYECTO (el toggle de equipo NO es el del proyecto; producción con dominio propio nunca se afecta). Resuelto por el usuario (OFF para certificar, ON de nuevo al cerrar).
- `preview-cert` fallaba: slug `separadores-libros` ya no existe tras la depuración del catálogo → `separadores-magneticos`.

---

## 5. Próximos Pasos (en orden)

1. ✅ ~~Re-activar SSO previews~~ — **HECHO por el usuario 2026-07-28** (verificado: preview 302, prod 200).
2. **Go-live master** (cuando el negocio decida):
   a. Vercel (scope Production): `WOMPI_ENV=prod` + 4 llaves Wompi PRODUCCIÓN.
   b. Dashboard Wompi PROD: URL de Eventos → `https://lucamsshop.com/api/webhooks/wompi` (dominio propio = exento de SSO).
   c. Verificar `AVEONLINE_*` producción + credenciales reales activas.
   d. **Verificación `bloquegenerarguia` con la cuenta REAL** ANTES de `AVEONLINE_GENERATE_REAL=true`: la doc dice "1=generar, 0=no"; nuestro gate usa semántica inversa histórica. Generar una guía con cada valor y revisar cartera en el panel Aveonline. Registrar en `docs/INTEGRATIONS_AVEONLINE.md` §21.4.
   e. **Decisión contable IVA**: si Lucy es responsable de IVA, cablear `tax-in-cents:vat` en `finalizeCheckout` (el campo ya existe en `buildCheckoutUrl`; no suma al total — la doc lo dice).
   f. Merge `develop` → `master`.
3. **Después**: Supabase test/staging separado (decisión aplazada desde Fase A).
4. **Backlog no bloqueante** (documentado en el informe Fase B §4): recogidas por API (`generarRecogida2`), reimpresión de rótulo (API V3), entrega en oficina (`IdTipoEntrega=2`), polling en PendingPage, `expiration-time` en checkout (si se adopta, va en la firma en el MISMO PR), persistir `payment_method_type`/`status_message` en Order, migrar webhook Aveonline al token oficial, fechas `fechacreacion`/`fechanovedad` (formato AM/PM), spec formal de `cotizarDoble` a Aveonline, guard de monto máximo Wompi vs contrato real (agregador vs gateway).

---

## 6. Información relevante

### Gotchas operativos (acumulados Fase A+B)
- `pkill -f "next start"` se auto-mata → usar `fuser -k 4000/tcp`.
- NUNCA vitest y playwright e2e en paralelo (comparten BD).
- El banner de cookies aparece en CADA navegador de test → aceptarlo siempre al inicio.
- Productos creados vía Prisma son invisibles en deploys con Data Cache caliente (300s/1h); en dev server sí se ven.
- Rate limits reales: cotizaciones 5/IP/día + 3/teléfono/día; API catálogo ~17 req ráfaga.
- La guía Aveonline imprime `productos[].unidades` como N bultos (unidades:5 → "1 / 5"): SIEMPRE 1 bulto agregado (modelo caja apilada).
- Vercel SSO del proyecto se consulta/cambia por API: `GET/PATCH /v9/projects/lucams-shop` (campo `ssoProtection`) con el token del CLI.

### Comandos de utilidad
- **E2E transaccional**: `cd apps/web && set -a && source .env.local && set +a && TURNSTILE_SECRET_KEY= NEXT_PUBLIC_TURNSTILE_SITE_KEY= PW_CHANNEL=chromium npx playwright test wompi-sandbox --workers=1 --retries=0`
- **Suites contra preview**: mismo entorno + `PLAYWRIGHT_BASE_URL=<url-preview> npx playwright test smoke a11y axe admin-login admin-mfa audit-admin admin100-shots preview-cert admin-transactional --workers=1`
- **Vitest**: `pnpm --filter web test` (NUNCA en paralelo con e2e)
- **Tests puntuales**: `cd apps/web && npx vitest run <patrón>`
- **Queries BD (solo lectura)**: `cd packages/db && node --env-file=../../apps/web/.env.local -e '<js con require("@prisma/client")>'`
- **Deploys/logs**: `vercel ls lucams-shop`, `vercel logs <deployment-url>`, `vercel inspect <url> --logs`
- **k6**: `./tmp/k6-v0.55.0-linux-amd64/k6 run -e BASE_URL=http://localhost:4000 tests/load/storefront-browsing.js` (con `next start -p 4000` activo)

### Documentos clave
- `docs/audits/2026-07-28-certificacion-catalogo-whatsapp.md` — informe Fase A.
- `docs/audits/2026-07-28-certificacion-develop.md` — informe Fase B (veredicto, bugs, gaps, go-live).
- `docs/INTEGRATIONS_AVEONLINE.md` §21 — auditoría doc-oficial Aveonline (cambios + contradicciones abiertas).
- `docs/INTEGRATIONS.md` — tabla de estados Wompi actualizada (DECLINED/ERROR → PENDING_PAYMENT).
