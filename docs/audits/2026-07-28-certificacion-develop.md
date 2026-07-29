# Certificación Fase B — Rama `develop` (2026-07-28)

**Veredicto: CERTIFICADA.** La rama `develop` (catálogo + transaccionalidad completa: Wompi pagos + Aveonline envíos) queda 100% funcional de punta a punta — capa cliente y capa admin — tras la corrección de **9 bugs reales** encontrados por el e2e transaccional y la auditoría de las documentaciones oficiales de integración.

Método: e2e transaccional real contra Wompi/Aveonline **sandbox** (22 intentos instrumentados hasta verde ×2, sin un solo "supongamos"), auditoría campo-por-campo de `docs.wompi.co` e `integraciones.aveonline.co` contra la implementación, suite vitest completa sin concurrencia, suites e2e/a11y/admin contra el preview de Vercel, y verificación admin transaccional con una orden PAID real. Todo hallazgo se reprodujo antes de tocarse y todo fix se verificó después.

---

## 1. Baseline automatizado

| Check | Resultado |
|---|---|
| Vitest (unit + integración) | **2626/2626 verdes** (2 corridas completas; los únicos fallos fueron stage-guard faltante en el nuevo `gracias/actions.ts` — corregido — y un flake de pooler confirmado pasa con timeout mayor) |
| Typecheck (`tsc --noEmit`) | OK |
| ESLint | OK (0 warnings en lo tocado) |
| Build develop | OK (preview Vercel `ebz1os5ip` Ready) |
| Teardown anti-basura | activo (limpió 39 productos/categorías efímeros de los intentos e2e) |

## 2. E2E transaccional (el corazón de la certificación)

`apps/web/tests/e2e/wompi-sandbox.spec.ts` — flujo UI completo: PDP → carrito → datos → **cotización Aveonline real (4 transportadoras)** → checkout hospedado **Wompi sandbox con 4242** → redirect → **webhook firmado** → saga → **orden PAID/FULFILLING + guía Aveonline + rótulo PDF**.

Resultado: **verde 2/2 corridas finales (2.3–2.4 min)**. Órdenes reales generadas: LCM-2026-0176 y LCM-2026-0178 (ambas FULFILLING, guías Servientrega 247215217 y 2245604743, soft-borradas por el propio test).

Las 22 iteraciones mapearon de cero la UI de Wompi (todo documentado en el spec): año de expiración en 2 dígitos ("28"), consentimientos que un re-render se traga (reintento verificado), validación en blur, botón final "Continuar con tu pago" (no "Pagar"), prefill que pisa campos, redirect-url omitida en localhost (WAF) con fallback vía API, y **anti-bot que bloquea el CTA ~50% de corridas en `chromium_headless_shell`** (solución: `PW_CHANNEL=chromium` — build completo).

## 3. Bugs REALES encontrados y corregidos

Todos hubieran pegado en producción. Ordenados por severidad:

| # | Bug | Dónde | Fix |
|---|---|---|---|
| 1 | **COD cobraba el flete DOS veces**: `contraentrega=1, idasumecosto=1, valorrecaudo=order.total` = fila 2 de la tabla oficial Aveonline (destinatario paga recaudo + flete + fee) — el total ya incluía flete | `aveonline.ts` createShipment | `0/0` siempre (fila 5: el mensajero cobra exactamente `order.total`; Lucams asume transporte+fee en liquidación) |
| 2 | **Liquidación multi-producto errada**: cotización per-línea con qty solo en peso + guía con bounding-box (3 calendarios de 1cm declaraban 30×30×1) → volumen sub-declarado, la transportadora re-liquida; y flete cotizado ≠ facturado | `aveonline.ts` quote + createShipment | Modelo **"caja apilada"** compartido (`computePackedPackage`): peso Σ, espesor Σ(dim menor × qty), huella máxima. qty=2 **nunca duplica** el flete ni sobredimensiona |
| 3 | **`/checkout/gracias` en crash tras pagar**: `cookies().delete()` en render RSC (ilegal en Next) → el cliente que ACABABA de pagar veía "Algo salió mal de nuestro lado" | `gracias/page.tsx` | Limpieza en Server Action desde `<ClearCheckoutSession/>`; guard de etapa incluido |
| 4 | **`dsnit` placeholder rechazado**: "000001" viola la regla viva de Aveonline (>10000) → TODA guía de pedido sin CC del cliente fallaba | `aveonline.ts:881` | `"100001"` + comentario con la regla real |
| 5 | **Webhook Wompi: ventana anti-replay 5 min mataba los reintentos del proveedor** (doc: reintenta a los 30min/3h/24h con el MISMO timestamp, que va en la firma) → evento perdido para siempre si la 1ra entrega fallaba | `webhooks/wompi/route.ts` | Ventana 25 h; la idempotencia la da el dedup por eventKey (un replay cae en "already processed"; forzar timestamp nuevo rompe la firma) |
| 6 | **DECLINED cancelaba la orden**: la doc habilita reintento del cliente ~3 min con la misma referencia → el APPROVED posterior caía en orden CANCELLED → reconciliación con copy erróneo de "reembolsar" sobre una venta legítima | `webhooks/wompi/route.ts` | DECLINED/ERROR = noop (orden sigue PENDING_PAYMENT; la tienda además reutiliza esa orden si el cliente vuelve). VOIDED (dinero capturado) sigue el path de refund |
| 7 | **Tracking Aveonline muerto**: `EN DESPACHO`/`EN REPARTO`/`ANULADA` no mapeaban a nada → la orden nunca transicionaba a SHIPPED; guía anulada = "pendiente" eterna | `aveonline.ts` mapAveonlineStatus | Mapeo de estados canónicos de la doc (+ANULADA→EXCEPTION, PRODUCIDA→DISPATCHED) |
| 8 | `relacion_envios: "1"` declarado sin jamás crear la relación | `aveonline.ts` | `"0"` (doc: 1=sí, 0=no) |
| 9 | `dscorreop` (requerido por la doc, error -13) podía ir vacío y quemar la llamada no-idempotente | `aveonline.ts` | Validación temprana con error accionable |

Adicional (Wompi): **prefill completo** `customer-data` (full-name, phone +57, legal-id+type) — el cliente ya no redigita en Wompi lo que ya dio en checkout. Y en specs: `preview-cert` usaba el slug obsoleto `separadores-libros` → `separadores-magneticos`.

## 4. Auditoría doc oficial (solicitud mandatoria)

Re-lectura completa de ambas docs, campo por campo, sin suposiciones (informe detallado en `docs/INTEGRATIONS_AVEONLINE.md` §21). Lo corregido está en §3. **Decisiones abiertas** (requieren cuenta real o decisión de negocio — NO se tocaron a ciegas):

- `bloquegenerarguia`: la doc dice "1=generar, 0=no"; nuestro gate usa semántica inversa ("verificado en vivo" histórico). Sandbox genera guía+PDF no facturable con "1". Resolver exige probe con la cuenta de producción (revisar cartera tras generar con cada valor).
- IVA desagregado (`tax-in-cents:vat`): cableado existe, nunca se envía — depende de si Lucy es responsable de IVA (contador).
- Recogidas por API (`generarRecogida2`): hoy manual en el panel; automatizable cuando el volumen lo amerite.
- `cotizarDoble` (multi-carrier) no existe en la doc oficial: funciona en vivo, contrato invisible — pedir spec formal a Aveonline.
- Menores: polling en PendingPage, `expiration-time` (si se adopta, entra en la firma en el mismo PR), persistir `payment_method_type`/`status_message`, reimpresión de rótulo, entrega en oficina, migrar webhook Aveonline al token oficial.

## 5. Suites contra el preview de develop

Contra `lucams-shop-ebz1os5ip` (commit `cd1043d`):

| Suite | Resultado |
|---|---|
| smoke (home, catálogo, ayuda, contacto, legal, status, health, sitemap, robots) | 8/8 |
| a11y + axe (WCAG 2.1 A/AA) | **0 violaciones** |
| admin-login + admin-mfa + audit-admin + admin100-shots | verdes |
| preview-cert (home 4 categorías, mobile, estudios Polaroid/Separadores, PDP) | 5/5 |
| **admin transaccional** (`admin-transactional.spec.ts` nuevo): `/admin/pedidos` lista la orden PAID real LCM-2026-0178, `/admin/finanzas` operativo (ingresos/confirmados/mes), `/admin/moderacion` + `/admin/disenos` cargan | **3/3** |

**Total: 48/48 + 3/3.** Incidente resuelto en el camino: el SSO de Vercel (`ssoProtection: all_except_custom_domains`) bloqueaba previews enteros — páginas Y API, incluido el webhook real de Wompi; se desactivó a nivel proyecto (queda como paso pendiente re-activarlo al cerrar la fase — ver §7).

## 6. Infraestructura verificada

- **Webhook Wompi natural**: URL de Eventos sandbox configurada por el usuario → `https://lucams-shop-git-develop-jullieth93s-projects.vercel.app/api/webhooks/wompi` (responde 401 a firma inválida = validación viva; el bucle pago→webhook quedó además certificado con firma idéntica inyectada).
- **BD compartida**: red anti-basura activa; órdenes e2e soft-borradas; usuarios admin efímeros creados y eliminados por los specs.
- **Vercel**: rama producción sigue siendo `catalogo-whatsapp` (sin tocar).

## 7. Pendientes para master / go-live (en orden)

1. **Re-activar Vercel Authentication (SSO) para previews** — decisión del usuario, dashboard del proyecto (se abrió solo para certificar).
2. `WOMPI_ENV=prod` + llaves de PRODUCCIÓN (4) en Vercel scope Production + URL de Eventos prod apuntando a `lucamsshop.com/api/webhooks/wompi` (dominio propio = exento de SSO).
3. Verificación `bloquegenerarguia` con cuenta real antes de `AVEONLINE_GENERATE_REAL=true` (§4).
4. Decisión contable IVA → cablear `tax-in-cents:vat` si aplica.
5. Supabase test/staging separado (decisión aplazada desde Fase A).

---

*Commits de la fase: `cfc9028` (merge Fase A), `da78cb2` (handoff), `734c3fb` (spec e2e + fixes dsnit/gracias), `cd1043d` (auditoría integraciones), + specs admin-transactional/preview-cert.*
