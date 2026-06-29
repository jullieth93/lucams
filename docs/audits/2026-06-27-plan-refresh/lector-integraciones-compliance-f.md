I have everything needed. The "Bloque F" naming is the orchestrator's working terminology, not in the docs themselves — coupons/refund/race map to Fase 5 (cupones) + the refund/nota-crédito flows in COMPLIANCE/INTEGRATIONS. Compiling the output.

# Lector 4 — Integraciones + Compliance + F + acciones humanas

> Fuentes leídas completas: `docs/INTEGRATIONS.md`, `docs/COMPLIANCE.md`; secciones relevantes de `docs/OPERATIONS.md` (env vars, rotación, costos, runbook). Estado real cruzado contra `docs/STATE.md` (bitácora 2026-06-27) y `docs/ROADMAP.md`, porque **INTEGRATIONS.md y OPERATIONS.md están desactualizados**: ambos siguen diciendo "Venndelo" cuando la integración real es **Aveonline** (confirmado en STATE.md:707 — "subprocesadores Aveonline, no Venndelo"). Marco esa discrepancia como deuda documental abajo.

---

## 1. Estado de cada integración

| Integración | Estado | Modo | Evidencia / detalle |
|---|---|---|---|
| **Wompi** (pago) | 🔄 Wired en **sandbox** | `WOMPI_ENV=sandbox` | Web Checkout + saga POST-PAID **certificado** (Bloque A, STATE.md 680-703). Firma de integridad SHA256, verificación de webhook `transaction.updated`, env-match del webhook desde `WOMPI_ENV`, anti-replay, idempotencia vía `WebhookEvent`, claim atómico de guía. **Falta para prod:** llaves `pub_prod`/`prv_prod`, cuenta comercio aprobada, webhook apuntando a dominio real, `WOMPI_ENV=production`. Mapeo estados APPROVED→PAID, DECLINED→CANCELLED, VOIDED→REFUNDED (con revert de stock + retry TOCTOU, ya implementado). COD no pasa por Wompi (Order directo PAID). |
| **Aveonline** (logística) | 🔄 Wired (integración hecha en Bloque A) | sandbox `[pendiente verificación]` | STATE.md confirma "checkout Wompi + Aveonline + saga POST-PAID certificado" y "webhooks Wompi+Aveonline, anti-replay, env-match, claim de guía" (STATE.md 711). **OJO:** `INTEGRATIONS.md` §2 y `OPERATIONS.md` env vars todavía documentan **Venndelo** (`VENNDELO_API_URL`, `VENNDELO_API_KEY`, `VENNDELO_WEBHOOK_SECRET`, webhook HMAC, estados created/picked_up/delivered). El detalle real de Aveonline (URL API, credenciales, secreto de webhook HMAC, mapeo de estados) **no está en los docs leídos** → `[pendiente verificación]`. Para prod faltan: cuenta producción, dirección de origen, API key prod, webhook configurado, envío real de prueba. |
| **Resend** (email) | 🔄 Wired en Free, **dominio NO verificado** | dominio default `resend.dev` | API key con scope "Sending access" (least privilege), validada (STATE.md 856). `EMAIL_FROM=Lucams_shop <onboarding@resend.dev>`. Templates transaccionales operativos (voseo→tuteo aplicado). Unsubscribe Ley 1581 implementado (token SHA-256 timing-safe + Consent revocación + Resend unsubscribed). **P0-004 ABIERTO:** dominio propio `mail.lucamsshop.co` sin verificar — requiere DNS SPF/DKIM/DMARC + MX (ACCIÓN HUMANA, ver §4). Sin webhooks de Resend por ahora. Límites Free: 3.000/mes, 100/día (`[pendiente verificación]` contra resend.com/pricing — marcado en INTEGRATIONS.md:315, aunque OPERATIONS.md:843 dice verificado 2026-05-09). |
| **Supabase** (DB/Auth/Storage/Realtime) | ✅ Wired (Free) | proyecto Free | Nuevas keys `sb_publishable_*` / `sb_secret_*`. 3 clientes (browser/server/service). RLS deny-by-default en tablas sensibles. Buckets `products`/`customer-uploads`/`production-assets` previstos. Riesgo operativo: **pausa tras 1 semana sin actividad** (Free). |
| **WhatsApp** (`wa.me`) | ✅ Wired (sin API) | — | Botón flotante `<WhatsAppFAB />`, mensajes pre-armados, `NEXT_PUBLIC_WA_NUMBER=573208873826` (temporal). Sin Twilio (mandato). Para prod: número WhatsApp Business definitivo. |
| **Claude API** (estudio/bot) | ⏳ Pendiente | — | Endpoint `/api/ai/design-suggest` y chatbot RAG vía CMS API **diseñados, no implementados**. CMS API (`/api/cms/*`) sí existe (ADR-033) y está preparado para RAG, pero el consumo por Claude es "futuro Fase 5+". `ANTHROPIC_API_KEY` no listada como configurada. Modelo previsto `claude-sonnet-4-6` (sugerencias) — verificar id vigente antes de usar. |
| **DIAN** (facturación electrónica) | ⏳ Pendiente (decisión + trámite) | — | Sin proveedor elegido. ADR-025 pendiente (Alegra/Siigo/Facture). Adaptador `InvoiceProvider` diseñado, no implementado. **Decisión clave (COMPLIANCE.md addendum 2026-05-15):** como persona natural NO responsable de IVA por debajo de 3.500 UVT, Lucy **NO está obligada** a factura electrónica al inicio — puede emitir documento equivalente POS o cuenta de cobro. Control proactivo en admin (6 settings `FACTURACION`, card "Estado tributario DIAN", job mensual de alerta al 60% del umbral) a implementar en Área 8 + Fase 4. |
| **Cloudflare** (DNS/Turnstile/R2) | ⏳ Pendiente | — | Turnstile previsto en Fase 1 (signup) → ahora cae en Bloque C Seguridad; DNS + R2 en Fase 7 al lanzar. `TURNSTILE_*` y `R2_*` ya están en `.env.example`. |

---

## 2. Compliance — operativizado vs pendiente

**Operativizado (Bloque B, certificado 2026-06-27):**
- **Ley 1581 (Habeas Data):** unsubscribe `/unsubscribe?email=&token=` con token SHA-256 timing-safe, registra `Consent` de revocación + marca Resend unsubscribed. Tabla `Consent` y endpoints de export/borrado diseñados.
- **Ley 1480 retracto:** textos legales reales publicados (privacidad, términos, devoluciones, subprocesadores con Aveonline). **Retracto verificado contra Ley 2439/2024** (mandato #9): retracto sigue **5 días hábiles**; el cambio es que el **reembolso e-commerce baja a 15 días calendario** (antes 30 días hábiles). Exclusión por personalización documentada (imanes del Estudio NO tienen retracto; catálogo estándar SÍ). Memoria `reference_retracto_ley_2439_2024` creada.
- **Subprocesadores:** lista publicada `/legal/subprocesadores` (Aveonline, no Venndelo).
- **IVA:** lógica `calculateTax` (19% tarifa general) diseñada; imanes gravados a tarifa general.

**Pendiente:**
- **Flujo de retracto E2E** (RetractRequest, reembolso vía Wompi void / transferencia COD): **Fase 4** (criterio de aceptación en ROADMAP:323). Schema `RetractRequest` + enum `RetractStatus` diseñados, no implementados.
- **Flujo de garantía** (`WarrantyClaim`): **Fase 6**.
- **Reversión de pago art. 51** (chargebacks, 21 días para responder, tabla `Chargeback`): diseñado, no implementado.
- **Facturación electrónica DIAN:** ADR-025 + trámites (RUES, Cámara de Comercio, RUT responsabilidad 42, resolución de numeración) → todos **antes de Fase 7**, todos ACCIÓN HUMANA.
- **Revisión legal de los 9 documentos** del sitio (ADR-020): antes de Fase 7.
- **Banner de cookie consent** funcional (4 categorías GDPR-aligned): antes de Fase 7.
- **Emails compliance operativos:** `habeas-data@`, `retracto@` (SLA PQR 15 días hábiles): lanzamiento.
- **RNBD** (Registro Nacional de Bases de Datos) ante SIC: confirmar con abogado.

---

## 3. Bloque F (Refund / Cupones / race) — qué falta

> "Bloque F" es terminología del orquestador; **no aparece como tal en los docs**. Su contenido mapea a **Fase 5 (cupones)** + flujos de **reembolso/nota crédito** dispersos en COMPLIANCE.md e INTEGRATIONS.md. Todo ⏳ pendiente.

- **Cupones:** El modelo `Coupon` + enum `CouponType` **existen en el schema** (STATE.md:395) y hay UI admin parcial — STATE.md menciona "cupones con form colapsable + Cancelar; widget cupones honesto + badge 🏪 General" (pulido UX admin del 2026-06-27). **Falta el núcleo funcional:** `CRUD de cupones (admin) + aplicación en checkout` está sin marcar en ROADMAP Fase 5 (`[ ]` línea 333). Es decir: existe gestión visual incipiente pero **la redención real en checkout y el descuento sobre el total NO están implementados** (criterio de aceptación pendiente: "cupón de 10% reduce el total correctamente", ROADMAP:366). Deuda de cupones: validación de race condition en redención concurrente / límite de usos no documentada como resuelta → `[pendiente verificación]`.
- **Refund / reembolso:** parcialmente cubierto en Bloque A — `VOIDED→REFUNDED con revert de stock + retry TOCTOU` ya implementado y certificado (STATE.md:701). **Falta:** el flujo de reembolso iniciado por retracto/garantía (Wompi void programático o transferencia bancaria para COD) y su orquestación → Fase 4/6.
- **Nota crédito (DIAN):** `InvoiceProvider.emitCreditNote()` + schema `CreditNote` diseñados; bloqueados por elección de proveedor DIAN (ADR-025). ROADMAP:460 lo lista sin marcar.
- **Race conditions:** las del checkout/stock/guía ya se certificaron en Bloque A (índice InventoryLog corregido, claim atómico `Order.shipmentClaimedAt`, unique parcial `Order.cartId`). Las race de **cupones** quedan fuera de esa certificación.

---

## 4. ACCIONES HUMANAS pendientes (explícitas)

**ACCIÓN HUMANA REQUERIDA — bloqueante inmediato (P0-004):**
- Verificar el dominio `mail.lucamsshop.co` en **Resend**: crear en Cloudflare DNS los 4 records que Resend genere —
  - `TXT mail` → SPF (`v=spf1 include:amazonses.com ~all`)
  - `TXT resend._domainkey.mail` → DKIM
  - `TXT _dmarc.mail` → DMARC (política inicial `quarantine`, subir a `reject` a los 30 días)
  - `MX mail` → `feedback-smtp...amazonses.com` (priority 10)
  - Luego activar Resend **Pro** y cambiar `EMAIL_FROM` a `hola@mail.lucamsshop.co`.

**ACCIÓN HUMANA REQUERIDA — pre-launch / Fase 7 (cuentas, trámites, pagos):**
- **Wompi:** aprobar cuenta de comercio en `comercios.wompi.co`; cargar llaves de producción en Vercel; configurar webhook a `https://lucamsshop.co/api/wompi/webhook`; hacer compra real de valor mínimo; setear `WOMPI_ENV=production`. (Nota: migrar a **Vercel Pro antes de la 1ª transacción Wompi real** — obligación contractual, OPERATIONS.md:816.)
- **Aveonline:** activar cuenta de producción; configurar dirección de origen de recolección; cargar API key prod; configurar webhook; envío real de prueba. (Credenciales/secreto HMAC de Aveonline aún no documentados.)
- **DIAN / negocio:** decidir con su contador cuándo activar facturación electrónica y a qué proveedor (ADR-025); constituir negocio (RUES + Cámara de Comercio); obtener RUT responsabilidad 42; solicitar resolución de numeración a DIAN; firmar contrato con proveedor de facturación.
- **Legal:** revisión por abogado colombiano de los 9 documentos del sitio (ADR-020); confirmar si aplica RNBD ante la SIC; definir NIT en aviso de privacidad (hoy "pendiente").
- **Emails de cumplimiento:** dejar operativos `habeas-data@lucamsshop.co` y `retracto@lucamsshop.co` con SLA de PQR.
- **WhatsApp:** definir número WhatsApp Business definitivo (reemplazar el temporal +57 320 887 3826), foto/estado, plantilla de respuestas frecuentes.
- **Claude API:** crear `ANTHROPIC_API_KEY` con presupuesto mensual + alertas de costo (cuando se implemente el estudio/bot).
- **Cloudflare:** configurar DNS del dominio + Turnstile (keys ya en `.env.example`) + R2 para backups.
- **Vercel env vars:** sincronizar manualmente `.env.local` → Vercel UI (Production/Preview/Development), marcando `*_KEY`/`*_SECRET`/`DATABASE_*` como Encrypted. **Bloqueante** antes de código que toque Supabase/Prisma en Vercel (OPERATIONS.md:142).

**ACCIÓN HUMANA — rotación de secrets (política, OPERATIONS.md:323-331):**
- Rotación **anual** (o ad-hoc si compromiso sospechoso) de: Wompi production keys, Supabase secret key (`sb_secret_*` rotables sin downtime), Resend API key, Aveonline/Venndelo API key.

---

## Deuda documental detectada (mandato #9)
- **INTEGRATIONS.md §2 y OPERATIONS.md (env vars, runbook, costos, healthchecks) referencian "Venndelo" cuando la logística real implementada es "Aveonline"** (confirmado STATE.md). Falta reescribir esa sección con la API real de Aveonline (URL, credenciales, webhook HMAC, mapeo de estados) → `[pendiente verificación]` hasta documentarlo.
- Límites Free de Resend: INTEGRATIONS.md:315 los marca `[pendiente verificación]`; OPERATIONS.md:843 los da por verificados (2026-05-09). Inconsistencia menor a reconciliar.
- `pgmq` disponibilidad en Free de Supabase: marcado `[pendiente verificación práctica]` (INTEGRATIONS.md:696).