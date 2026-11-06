# Cumplimiento Normativo y Paquete Legal — Lucams Shop

> **Documento vivo (Nivel 1).** Especificación verificada contra el código real del cumplimiento jurídico, regulatorio y técnico de Lucams Shop en Colombia: Estatuto del Consumidor (Ley 1480 de 2011 y Ley 2439 de 2024), reversión del pago (Ley 1480 art. 51 y Decreto 587 de 2016 / Decreto 1074 de 2015), Protección de Datos Personales y Hábeas Data (Ley 1581 de 2012, Decreto 1377 de 2013 y Decreto 090 de 2018), reglas específicas de privacidad y retención del Estudio de Personalización, gobierno de cookies, arquitectura de tres capas del **Paquete Legal Versión 3 (`2026-11-05`)**, régimen tributario vigente (`BILLING_DOCUMENT_ENABLED = false`) y postura operativa de propiedad intelectual (`PLAN_CATALOG_V2 [1.7]`).
>
> **Nota de alcance:** este documento describe la implementación técnica y operativa vigente de las normas colombianas en el código y en el panel administrativo; complementa (sin sustituir) el criterio contable y jurídico profesional de la titular.
>
> **Documentos relacionados:** [`SECURITY.md`](SECURITY.md) · [`OBSERVABILITY.md`](OBSERVABILITY.md) · [`PLAN_CATALOG_V2.md`](PLAN_CATALOG_V2.md) · [`domains/post-sale-and-support.md`](domains/post-sale-and-support.md) · [`domains/checkout-payments-shipping.md`](domains/checkout-payments-shipping.md) · [`domains/studio-and-production.md`](domains/studio-and-production.md) · [`domains/crm-b2b-and-loyalty.md`](domains/crm-b2b-and-loyalty.md) · [`integrations/aveonline.md`](integrations/aveonline.md)

---

## 1. Resumen ejecutivo de obligaciones regulatorias e identificación del responsable

### 1.1 Mapa ejecutivo de obligaciones en Colombia

| Marco normativo                                                      | Ámbito de aplicación en Lucams Shop                                                           | Estado técnico y operativo actual                                                                                                                         |
| -------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Ley 1581 de 2012 y Decreto 1377 de 2013** (Hábeas Data)            | Recolección de correos, teléfonos, direcciones, documentos y fotografías subidas al Estudio   | **Activo:** tabla `Consent` append-only (8 scopes), aviso v3, supresión self-service, cascada CRM `scrubContactOnErasureTx` y purgas automáticas diarias  |
| **Decreto 090 de 2018** (Registro Nacional de Bases de Datos — RNBD) | Obligatorio solo para sociedades comerciales y ESAL con activos totales `≥ 100 000 UVT`       | **Exento de registro obligatorio hoy:** operación como persona natural comerciante bajo el umbral legal (registro voluntario opcional)                    |
| **Ley 1480 de 2011 y Ley 2439 de 2024** (Estatuto del Consumidor)    | Ventas a distancia B2C en `lucamsshop.com` y pedidos cerrados por WhatsApp desde cotizaciones | **Activo:** precios enteros en centavos COP, retracto 5 días hábiles + reembolso ≤ 15 días calendario, garantías `1..120` meses y SLAs en días hábiles    |
| **Ley 1480 art. 51 y Decreto 587 de 2016** (Reversión del pago)      | Pagos con instrumentos electrónicos (tarjetas, PSE, billeteras) procesados a través de Wompi  | **Activo:** procedimiento de 5 causales publicado en `/legal/devoluciones` y `/legal/terminos` (5 días hábiles solicitud + 15 días hábiles participantes) |
| **Estatuto Tributario art. 437 par. 3 y Res. DIAN 165 de 2023**      | Régimen de IVA y obligación de facturar electrónicamente según tope anual de `3 500 UVT`      | **No responsable de IVA hoy:** soporte de operación `LCM-YYYY-NNNN`, `Order.tax = 0` y `BILLING_DOCUMENT_ENABLED = false` con columnas DIAN preparadas    |
| **Estatuto Tributario (Retefuente, ReteIVA, ReteICA en ventas B2B)** | Ventas corporativas cuando el comprador es persona jurídica o agente de retención             | No aplica en B2C; en B2B las practica el comprador agente retenedor sobre el pago entregando certificado de retención                                     |
| **Código de Comercio (RUES / Matrícula Mercantil y RUT)**            | Ejercicio profesional del comercio en Colombia                                                | Trámite mercantil y tributario gestionado administrativamente por la titular                                                                              |
| **Estándar opt-in de cookies y RFC 9116 (`security.txt`)**           | Analítica opcional (GA4 y Web Vitals RUM) y divulgación coordinada de vulnerabilidades        | **Activo:** banner `cookie_consent_v1` con re-consentimiento por versión, embudo sin cookies (`FunnelEventDaily`) y `/.well-known/security.txt`           |

### 1.2 Identificación del responsable y canales oficiales

- **Marca y figura jurídica:** **Lucams Shop**, establecimiento de comercio electrónico operado desde Bogotá D.C., Colombia, por persona natural comerciante titular de la marca Lucams Shop (`ADR-072`, `ADR-138`).
- **Canales oficiales centralizados en ajustes CMS (`apps/web/lib/cms-tokens.ts`):**
  - Atención al consumidor, soporte y PQR: `{{email_contacto}}` (`CONTACT_EMAIL`, por defecto `hola@lucamsshop.com`), centro `/soporte` (`/contacto`) y canal oficial de WhatsApp.
  - Protección de datos personales (consultas y reclamos Hábeas Data / ARCO): `{{email_habeas_data}}` (`HABEAS_DATA_EMAIL`, por defecto `habeas-data@lucamsshop.com`) y autoservicio en `/mi-cuenta/seguridad` → `/mi-cuenta/eliminar`.
  - Derecho de retracto, devoluciones y reversión del pago: `{{email_retracto}}` (`RETRACTO_EMAIL`, por defecto `retracto@lucamsshop.com`), `/mi-cuenta/pedidos/[number]` y `/pedido/[token]`.
  - Seguridad de la información y reporte coordinado de vulnerabilidades: **`security@lucamsshop.com`** (`{{email_security}}` / `SECURITY_EMAIL`, publicado en `/legal/security` y `/.well-known/security.txt`).
- **Autoridades de inspección y vigilancia:** Superintendencia de Industria y Comercio (**SIC**, protección al consumidor y datos personales) y Dirección de Impuestos y Aduanas Nacionales (**DIAN**, obligaciones tributarias).

### 1.3 Identificación permanente en e-commerce (art. 50 lit. a Ley 1480): entrega a requerimiento vs publicación sin exponer vivienda privada

El **art. 50 literal a de la Ley 1480 de 2011** ordena a los proveedores que ofrezcan productos por medios electrónicos informar en todo momento de forma cierta, fidedigna, suficiente, clara y actualizada su nombre o razón social, NIT, dirección de notificación judicial, teléfono y correo electrónico:

1. **Postura vigente en el Paquete Legal Versión 3:** los documentos publicados identifican a **Lucams Shop (persona natural), Bogotá D.C., Colombia**, informan teléfono/WhatsApp y los cuatro buzones institucionales, e indican que los datos formales completos de identificación mercantil y tributaria se suministran de inmediato a requerimiento para cualquier actuación legal o ante autoridad, evitando exponer la vivienda familiar o el número de cédula puro a suplantación. El test `legal-content-sync.test.ts` bloquea en CI que se publiquen números `NIT` o matrículas no verificados.
2. **Ruta de endurecimiento pleno 100 % vía CMS (sin tocar código):** dado que el art. 50 configura un deber de publicación permanente y no solo de entrega bajo solicitud, el cumplimiento literal se logra **sin exponer la residencia privada de la titular** (que solo vive en los ajustes internos privados `PICKUP_*` de Aveonline):
   - **Nombre comercial + nombre de la comerciante** inscrita en el registro mercantil.
   - **NIT con dígito de verificación** asignado en el RUT.
   - **Dirección de notificación judicial designada** (oficina virtual, casillero comercial o dirección mercantil registrada ante Cámara de Comercio, distinta del domicilio privado).
   - **Teléfono y correos electrónicos institucionales** ya publicados.

### 1.4 Estructura base del Aviso de Privacidad (Decreto 1377 de 2013, arts. 14 y 15)

Todo punto de captura inicial (registro, checkout, cotización, B2B `/empresas-y-eventos`, soporte y boletín) remite al Aviso de Privacidad (`/legal/privacidad`) y a la Política de Tratamiento (`/legal/habeas-data`), cuya estructura obligatoria cubre:

```text
Responsable: Lucams Shop (persona natural comerciante), Bogotá D.C., Colombia.
Canales de Hábeas Data: {{email_habeas_data}} y /mi-cuenta/seguridad.

Datos tratados:
- Identificación y contacto: nombre, correo electrónico, teléfono móvil y documento cuando aplique.
- Logística: dirección física de entrega y datos del destinatario cuando marcas un pedido como regalo.
- Transaccionales: referencia del pedido e identificadores de estado (Wompi procesa los medios de pago).
- Personalización: fotografías, textos y composiciones cargadas en el Estudio de Personalización.

Finalidades principales:
1. Fabricar las piezas personalizadas, procesar el pago, despachar el pedido y prestar soporte, retracto y garantía.
2. Enviar notificaciones estrictamente transaccionales sobre el estado de tu compra o cotización.
3. Enviar comunicaciones comerciales, novedades o recordatorios únicamente cuando otorgas autorización previa y expresa (opcional y revocable en cualquier momento).
4. Medir seguridad, estabilidad técnica y métricas agregadas del servicio.

Derechos del titular (art. 8 Ley 1581 de 2012):
Conocer, actualizar y rectificar tus datos; solicitar prueba de la autorización; ser informado del uso dado; presentar quejas ante la SIC; revocar la autorización y solicitar la supresión de tus datos; y acceder de forma gratuita a tus datos personales.
```

---

## 2. Fuente única de plazos estatutarios (`consumer-law.ts`) y motor `{{tokens}}` (`cms-tokens.ts`)

### 2.1 Constantes legales centralizadas (`apps/web/lib/consumer-law.ts`)

Para impedir contradicciones entre la lógica de negocio, los relojes SLA del panel, las fichas de producto, los correos transaccionales, las preguntas frecuentes y los 8 documentos legales (`ADR-187`), todos los términos de ley residen en un único módulo isomórfico ([`apps/web/lib/consumer-law.ts`](../apps/web/lib/consumer-law.ts)):

```ts
export const RETRACT_WINDOW_BUSINESS_DAYS = 5; // Ley 1480 art. 47 (5 días hábiles desde entrega)
export const RETRACT_REFUND_MAX_CALENDAR_DAYS = 15; // Ley 2439 de 2024 art. 3 (máx. 15 días calendario)
export const MAX_LEGAL_DELIVERY_CALENDAR_DAYS = 30; // Ley 1480 art. 50 lit. h (máx. 30 días calendario)
export const WARRANTY_CLAIM_RESPONSE_BUSINESS_DAYS = 15; // Ley 1480 art. 58 / Decreto 1074 de 2015 (15 días hábiles)
export const DEFAULT_CATALOG_WARRANTY_MONTHS = 1; // Ley 1480 art. 8 (base catálogo; cada producto sella el suyo)
export const HABEAS_DATA_CONSULTATION_BUSINESS_DAYS = 10; // Ley 1581 art. 14 (10 días hábiles consultas)
export const HABEAS_DATA_CLAIM_BUSINESS_DAYS = 15; // Ley 1581 art. 15 (15 días hábiles reclamos/supresión)

export function formatWarrantyTerm(months: number): string {
  return `${months} ${months === 1 ? "mes" : "meses"}`;
}
```

Cualquier consumidor interno de plazos importa exclusivamente desde `lib/consumer-law.ts`: `features/retract/service.ts`, `features/warranty/`, `lib/colombian-sla.ts`, los diccionarios de textos de checkout y cuenta, las plantillas de correo y el motor de interpolación CMS.

### 2.2 Los 11 tokens legales/institucionales (+ 6 operativos) en `resolveCmsTokens` (`apps/web/lib/cms-tokens.ts`)

`<CmsText>`, `<CmsMarkdown>` y `getPageSeo()` ejecutan `resolveCmsTokens(text, ctx)` tanto sobre el cuerpo persistido en `CmsField` como sobre los `FALLBACK` estáticos compilados en el código (`apps/web/lib/cms-tokens.test.ts`). Los documentos de `packages/db/legal-content/*.md` se apoyan en **11 tokens legales y de contacto** más **6 tokens de promesa operativa y contexto** (**17 tokens canónicos en total**):

| Grupo                          | Token                         | Fuente exacta en código o `SiteSetting`                       | Valor por defecto            |
| ------------------------------ | ----------------------------- | ------------------------------------------------------------- | ---------------------------- |
| **1. Canales legales (4)**     | `{{email_contacto}}`          | `SiteSetting` `CONTACT_EMAIL`                                 | `hola@lucamsshop.com`        |
| **1. Canales legales (4)**     | `{{email_habeas_data}}`       | `SiteSetting` `HABEAS_DATA_EMAIL`                             | `habeas-data@lucamsshop.com` |
| **1. Canales legales (4)**     | `{{email_retracto}}`          | `SiteSetting` `RETRACTO_EMAIL`                                | `retracto@lucamsshop.com`    |
| **1. Canales legales (4)**     | `{{email_security}}`          | `SiteSetting` `SECURITY_EMAIL` (`/.well-known/security.txt`)  | `security@lucamsshop.com`    |
| **2. Plazos estatutarios (7)** | `{{garantia_base}}`           | `formatWarrantyTerm(DEFAULT_CATALOG_WARRANTY_MONTHS)`         | `1 mes`                      |
| **2. Plazos estatutarios (7)** | `{{garantia_respuesta_dias}}` | `String(WARRANTY_CLAIM_RESPONSE_BUSINESS_DAYS)`               | `15`                         |
| **2. Plazos estatutarios (7)** | `{{retracto_dias}}`           | `String(RETRACT_WINDOW_BUSINESS_DAYS)`                        | `5`                          |
| **2. Plazos estatutarios (7)** | `{{retracto_reembolso_dias}}` | `String(RETRACT_REFUND_MAX_CALENDAR_DAYS)`                    | `15`                         |
| **2. Plazos estatutarios (7)** | `{{entrega_max_legal_dias}}`  | `String(MAX_LEGAL_DELIVERY_CALENDAR_DAYS)`                    | `30`                         |
| **2. Plazos estatutarios (7)** | `{{habeas_consulta_dias}}`    | `String(HABEAS_DATA_CONSULTATION_BUSINESS_DAYS)`              | `10`                         |
| **2. Plazos estatutarios (7)** | `{{habeas_reclamo_dias}}`     | `String(HABEAS_DATA_CLAIM_BUSINESS_DAYS)`                     | `15`                         |
| **3. Promesa operativa (6)**   | `{{fab}}`                     | `SiteSetting` `PRODUCTION_DAYS_DEFAULT` (preparación taller)  | `2`                          |
| **3. Promesa operativa (6)**   | `{{entrega}}`                 | `SiteSetting` `DELIVERY_DAYS_ESTIMATE` (rango transportadora) | `2 a 5`                      |
| **3. Promesa operativa (6)**   | `{{total}}`                   | Suma entera calculada `fab + min(entrega)`                    | `4`                          |
| **3. Promesa operativa (6)**   | `{{cobertura}}`               | `SiteSetting` `DELIVERY_COVERAGE_COUNT`                       | `1.100+`                     |
| **3. Promesa operativa (6)**   | `{{cutoff_lucams}}`           | `SiteSetting` `LUCAMS_SHIPPING_CUTOFF_HOUR` (2 dígitos)       | `12`                         |
| **3. Promesa operativa (6)**   | `{{ciudad}}`                  | `ctx.city` opcional en páginas dinámicas                      | Contextual                   |

---

## 3. Estatuto del Consumidor (Ley 1480 de 2011 y Ley 2439 de 2024)

### 3.1 Deberes precontractuales, precios enteros COP y distinción estricta entre estimado operativo y plazo máximo legal de entrega

1. **Ocho elementos obligatorios visibles antes de pagar (arts. 23 y 50):**
   - Identificación y canales de contacto de Lucams Shop.
   - Características esenciales del producto: dimensiones en cm, materiales, acabado, peso y advertencia de seguridad por imanes/piezas pequeñas fuera del alcance de menores de 3 años.
   - Precio total en pesos colombianos sin cargos ocultos (art. 26).
   - Medios de pago habilitados (Wompi — tarjetas, PSE, Nequi/billeteras — y pago contraentrega donde aplique cobertura y validación antifraude).
   - Desglose separado de tiempo de preparación y tiempo/costo de envío.
   - Existencia del derecho de retracto de 5 días hábiles o aviso expreso de excepción por producto claramente personalizado (art. 47 num. 3).
   - Término individual de garantía legal anunciado (`Product.warrantyMonths`) y condiciones para hacerla efectiva.
   - Acceso directo y casilla desmarcada de aceptación de Términos y Condiciones (`/legal/terminos`) y Política de Datos (`/legal/habeas-data`).
2. **Precios en centavos COP (`Int`):** el código prohíbe floats monetarios; el resumen pre-pago desglosa `Order.subtotal`, descuento por cupón (`Order.discount`), redención de Puntos Lucams (`Order.loyaltyDiscount`), flete (`Order.shipping`) y total definitivo (`Order.total`).
3. **Distinción legal estricta entre estimado operativo de preparación + transporte vs plazo máximo legal de 30 días calendario (`MAX_LEGAL_DELIVERY_CALENDAR_DAYS = 30`):**
   - En fichas de producto, carrito, checkout, correos de confirmación/despacho, vista de seguimiento `/pedido/[token]`, PDF de guía y panel `/admin` se muestran **siempre por separado**:
     1. **Preparación estimada en taller antes del despacho** (`{{fab}}` días hábiles por defecto o `Product.productionDays` específico de la referencia).
     2. **Tránsito estimado de la transportadora después del despacho** (`{{entrega}}` días hábiles informados por Aveonline o por la modalidad seleccionada).
   - Expresiones orientativas («estimado», «alrededor de X días») jamás se presentan como fecha calendario garantizada en envíos nacionales porque el tránsito depende de terceros transportadores; asimismo, la modalidad local **Envío Lucams** en Bogotá está expresamente sujeta a cobertura de localidad y hora de corte (`{{cutoff_lucams}}:00`).
   - Conforme al **art. 50 literal h de la Ley 1480 de 2011** (y Ley 2439 de 2024), el plazo máximo legal supletorio para materializar la entrega es de **treinta (`30`) días calendario** (`{{entrega_max_legal_dias}}`) contados desde la confirmación del pedido. Si por falta de disponibilidad o causa atribuible a Lucams Shop se incumple ese tope legal, el consumidor puede resolver unilateralmente el contrato y obtener la devolución íntegra de todas las sumas pagadas sin deducción alguna en un plazo no mayor a **15 días calendario**.
   - El script `packages/db/scripts/sync-and-prune-cms-v2.mjs` mantiene sincronizados defaults de código, mapa CMS y bloques publicados creando versiones reversibles sin pisar ediciones manuales deliberadas.

### 3.2 Derecho de retracto, excepción de personalizados y prorrateo exacto `BigInt` (art. 47 y Ley 2439 de 2024)

Implementado en [`apps/web/features/retract/service.ts`](../apps/web/features/retract/service.ts) tanto para compras web como para ventas a distancia cerradas por WhatsApp a partir de una cotización:

| Categoría de ítem en la orden                                                                              |     ¿Aplica retracto?     | Regla en código y sustento normativo                                                                             |
| ---------------------------------------------------------------------------------------------------------- | :-----------------------: | ---------------------------------------------------------------------------------------------------------------- |
| Producto de catálogo estándar (`PersonalizationKind.NONE` o plantilla `PREMADE` sin edición del comprador) | **Sí (`5 días hábiles`)** | Ley 1480 art. 47 inc. 1; `isItemPersonalized(item) === false`                                                    |
| Pieza creada en el Estudio (cualquiera de las 8 modalidades con foto, logo o texto propio del cliente)     |          **No**           | Exceptuada por **art. 47 numeral 3** («claramente personalizados»); `customDesign != null \|\| designId != null` |
| Paquete o combo integrado exclusivamente por productos estándar                                            | **Sí (`5 días hábiles`)** | Ninguna línea personalizada                                                                                      |
| Paquete o combo que incluye al menos un ítem personalizado                                                 |          **No**           | Informado antes del pago en ficha, checkout y `/legal/devoluciones`                                              |

#### Cómputo de ventana en hora colombiana y prorrateo financiero sin floats

```ts
// apps/web/features/retract/service.ts (extracto real)
const COT_OFFSET_MS = 5 * 60 * 60 * 1000; // America/Bogota (UTC-5 fijo)

export function retractWindowEnd(deliveredAt: Date): Date {
  const endCot = new Date(
    addBusinessDays(deliveredAt, RETRACT_WINDOW_BUSINESS_DAYS).getTime() - COT_OFFSET_MS,
  );
  endCot.setUTCHours(23, 59, 59, 999); // cierre a las 23:59:59.999 COT del 5.º día hábil
  return new Date(endCot.getTime() + COT_OFFSET_MS);
}

/** División entera half-up con BigInt (cero floats y cero overflow en multiplicación). */
function roundMulDiv(a: number, b: number, denom: number): number {
  if (a <= 0 || b <= 0 || denom <= 0) return 0;
  const num = BigInt(a) * BigInt(b);
  const d = BigInt(denom);
  return Number((num + d / BigInt(2)) / d);
}
```

```ts
// apps/web/features/retract/service.ts — prorrateo exacto sin floats (invariante [FIN-01])
export function computeRetractRefundBreakdown(
  input: RetractRefundBreakdownInput,
): RetractRefundBreakdown {
  const lineTotal = Math.max(0, Math.trunc(input.lineTotal));
  const subtotal = Math.max(0, Math.trunc(input.orderSubtotal));
  const subtotalCouponDiscount =
    input.couponType === "FREE_SHIPPING" ? 0 : Math.max(0, Math.trunc(input.couponDiscount));
  const loyaltyDiscount = Math.max(0, Math.trunc(input.loyaltyDiscount));
  const totalMerchandiseDiscount = Math.min(subtotal, subtotalCouponDiscount + loyaltyDiscount);

  const discountShareCents =
    totalMerchandiseDiscount > 0 && subtotal > 0
      ? Math.min(lineTotal, roundMulDiv(totalMerchandiseDiscount, lineTotal, subtotal))
      : 0;
  const rawCashRefund = Math.max(0, lineTotal - discountShareCents);
  const maxOrderCashMerchandise = Math.max(0, subtotal - totalMerchandiseDiscount);
  const alreadyRefunded = Math.max(0, Math.trunc(input.alreadyRefundedCents ?? 0));
  const remainingOrderCash = Math.max(0, maxOrderCashMerchandise - alreadyRefunded);
  const cashRefundCents = Math.min(rawCashRefund, remainingOrderCash);

  const pointsRedeemed = Math.max(0, Math.trunc(input.loyaltyPointsRedeemed));
  const pointsToRestore =
    pointsRedeemed > 0 && subtotal > 0
      ? Math.min(pointsRedeemed, roundMulDiv(pointsRedeemed, lineTotal, subtotal))
      : 0;

  return { cashRefundCents, discountShareCents, pointsToRestore };
}
```

```prisma
// packages/db/prisma/schema.prisma — modelo real de derecho de retracto
enum RetractStatus {
  PENDING   // solicitado por comprador/invitado, pendiente de revisión
  APPROVED  // aprobado, esperando devolución física del bien
  RECEIVED  // producto recibido sin uso y en empaque original
  REFUNDED  // reembolso ejecutado en <= 15 días calendario
  REJECTED  // rechazado con motivo obligatorio (rejectionNote)
}

model RetractRequest {
  id                String        @id @default(cuid())
  orderItemId       String        @unique
  contactId         String?
  status            RetractStatus @default(PENDING)
  reason            String?
  rejectionNote     String?
  refundAmount      Int           // centavos COP (reforzado con CHECK SQL >= 0)
  refundMethod      String?       // "WOMPI_VOID" | "BANK_TRANSFER"
  requestedAt       DateTime      @default(now())
  approvedAt        DateTime?
  receivedAt        DateTime?
  refundedAt        DateTime?
  processedBy       String?       // AdminUser.id
  assignedToAdminId String?
  slaDueAt          DateTime?     // +15 días calendario hasta 23:59:59.999 COT
}
```

- **Invariante financiero `[FIN-01]` y Puntos Lucams (`computeRetractRefundBreakdown`):**
  1. Prorratea tanto el descuento de cupón sobre mercancía (un cupón `FREE_SHIPPING` afecta flete, nunca ítems) como `Order.loyaltyDiscount` sobre `orderSubtotal`.
  2. Acota `cashRefundCents` contra `remainingOrderCash` (`subtotal - totalMerchandiseDiscount - alreadyRefundedCents`), garantizando matemáticamente que múltiples retractos parciales en una misma orden jamás devuelvan un centavo más del efectivo realmente cobrado.
  3. Calcula `pointsToRestore` proporcionales a la línea y, al marcar el retracto como `REFUNDED`, invoca de forma idempotente `restoreRedeemedPointsForRetract` (`features/loyalty/service.ts`) para reintegrar al saldo del comprador los Puntos Lucams consumidos en ese ítem.
  4. La base de datos refuerza `CHECK ("refundAmount" >= 0)` en `RetractRequest` (`00000000000051_domain_invariants_hardening.sql`).

#### Flujo operativo extremo a extremo del retracto (7 pasos)

1. **Solicitud dentro de los 5 días hábiles:** el comprador registrado solicita el retracto por línea en `/mi-cuenta/pedidos/[number]`; el comprador invitado lo hace desde `/pedido/[token]` superando el reto 2FA posventa (código OTP de 6 dígitos enviado al correo de la orden, ver [`SECURITY.md` § 4.2](SECURITY.md#42-autenticación-posventa-de-doble-factor-para-invitados-pedidotoken)); o bien escribe a `{{email_retracto}}` / `/soporte` (donde staff autorizado cuenta con `createRetractRequestAsAdmin` en `/admin/soporte/[id]`, que también cubre bordes con días festivos).
2. **Validación automática de elegibilidad:** orden en estado `DELIVERED`, dentro de `retractWindowEnd(deliveredAt)`, ítem no personalizado (`!isItemPersonalized`) y sin `RetractRequest` previo sobre ese `orderItemId` (`@unique`).
3. **Creación y sellado de SLA legal (`PENDING`):** se inserta `RetractRequest` con `refundAmount = cashRefundCents`, `contactId` resuelto y **`slaDueAt` sellado a +15 días calendario** (`computeRetractSlaDueAt`, hasta las `23:59:59.999` COT conforme a la **Ley 2439 de 2024, art. 3**).
4. **Aprobación e instrucciones (`APPROVED`):** desde `/admin/retractos` el equipo aprueba la solicitud y dispara `sendRetractApproved` con las instrucciones de empaque y dirección de recepción (si no cumple requisitos legales, solo puede pasar a `REJECTED` con `rejectionNote` motivada).
5. **Devolución física del bien a cargo del comprador (art. 47 Ley 1480):** el consumidor devuelve el producto sin señales de uso, completo y en su empaque original; conforme al inciso 4 del art. 47 de la Ley 1480 y a `/legal/devoluciones`, **los costos de transporte de la devolución por retracto corren por cuenta del comprador** (cuando la devolución obedece a defecto o error en el despacho, se tramita como **garantía** con transporte 100 % asumido por Lucams Shop).
6. **Inspección de recibo (`RECEIVED`):** al llegar la pieza en condiciones aptas se registra `receivedAt` (no re-incrementa stock automáticamente hasta revisión manual de inventario).
7. **Reembolso con step-up MFA (`REFUNDED` en ≤ 15 días calendario):** staff con `posventa:refund` + verificación reciente `requireRecentMfa` ejecuta la devolución en Wompi al mismo medio de pago (`WOMPI_VOID`) o transferencia bancaria (`BANK_TRANSFER` para pedidos COD/WhatsApp), sella `refundedAt`, dispara `restoreRedeemedPointsForRetract`, notifica por correo (`sendRetractRefunded`) y deja rastro en `AdminActionLog`.

### 3.3 Flujo operativo paso a paso de reversión del pago (Ley 1480 art. 51 y Decreto 587 de 2016)

Regulada en el **art. 51 de la Ley 1480 de 2011** y reglamentada en el **Decreto 587 de 2016** (compilado en el **Decreto 1074 de 2015, arts. 2.2.2.51.1 a 2.2.2.51.13**), publicada íntegramente en `/legal/devoluciones` y `/legal/terminos`:

1. **Condición de procedencia y las 5 causales legales taxativas:** aplica únicamente cuando la compra se pagó mediante un **instrumento de pago electrónico** (tarjeta de crédito, tarjeta débito, PSE u otro medio electrónico procesado por **Wompi**; no aplica a pagos en efectivo contraentrega) y se configura alguna de las cinco causales legales:
   - **Causal 1 — Fraude:** el consumidor fue objeto de fraude.
   - **Causal 2 — Operación no solicitada:** el cargo corresponde a una operación que el titular no solicitó.
   - **Causal 3 — Producto no recibido:** el producto adquirido no fue entregado en el plazo legal o pactado.
   - **Causal 4 — Producto no correspondiente:** el bien entregado no corresponde a lo solicitado o no cumple con las características inherentes o las atribuidas por la información suministrada.
   - **Causal 5 — Producto defectuoso:** el bien entregado se encuentra defectuoso.
2. **Paso 1 — Queja ante Lucams Shop y notificación al emisor en ≤ 5 días hábiles:** dentro de los **cinco (5) días hábiles** siguientes a la fecha en que el consumidor tuvo noticia de la operación fraudulenta o no solicitada, o en que debió haber recibido el producto o lo recibió defectuoso o sin corresponder a lo pedido (arts. 2.2.2.51.4 y 2.2.2.51.6), debe:
   - Presentar queja escrita ante Lucams Shop por `{{email_retracto}}`, `/soporte` o WhatsApp indicando número de pedido (`LCM-YYYY-NNNN`), monto, causal invocada, sustento y datos de la transacción; y, si ya recibió el bien (causales 4 o 5), ponerlo a disposición para su recogida en las mismas condiciones en que lo recibió.
   - Notificar dentro del **mismo plazo de 5 días hábiles** al **emisor del instrumento de pago electrónico** (banco o entidad financiera) adjuntando la constancia de la queja presentada ante el comercio.
3. **Paso 2 — Trámite interno y articulación con Wompi:** soporte radica o vincula el ticket urgente en `/admin/soporte`, audita `Order`, `WompiPaymentTransaction` y `ShipmentEvent`, emite acuse al consumidor recordándole el deber de notificar a su banco emisor, coordina la reversión voluntaria o aporta las pruebas de entrega/autorización ante **Wompi** cuando el banco abre controversia o contracargo, y audita la gestión en `AdminActionLog`.
4. **Paso 3 — Plazo de 15 días hábiles para hacerla efectiva:** presentada la solicitud completa ante el emisor, los participantes del proceso de pago (emisor, red y pasarela Wompi) cuentan con un término máximo de **quince (15) días hábiles** para hacer efectiva la reversión (art. 2.2.2.51.8). Si una autoridad administrativa o judicial demuestra mala fe del consumidor, la SIC puede imponerle sanción hasta por 50 SMMLV (art. 51 inc. final).

### 3.4 Garantías legales modulares selladas por ítem (`1..120` meses, arts. 7 a 11, 16 y 59.16)

Cada ficha define su término en `Product.warrantyMonths` (validado entre **`1` y `120` meses**; base de catálogo `DEFAULT_CATALOG_WARRANTY_MONTHS = 1`) y, al crearse la orden, ese valor se copia de forma inmutable en **`OrderItem.warrantyMonths`** (`ADR-106`, migración `00000000000050_warranty_months_snapshot.sql`). Cualquier cambio posterior en el catálogo solo rige compras futuras y jamás recorta la garantía prometida a pedidos históricos. Las piezas personalizadas en el Estudio gozan exactamente de la misma garantía de calidad, impresión, adherencia magnética y transporte.

| Norma (Ley 1480 de 2011)    | Regla estatutaria en Colombia                                                                                                           | Implementación técnica y documental en Lucams Shop                                                                              |
| --------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| **Art. 8** (término)        | Rige el término fijado por ley/SIC; a falta de este, **el anunciado por el productor/proveedor**; si no se indica, rige 1 año           | Anunciado en `/producto/[slug]`, checkout, correo de confirmación, `/legal/garantias` y sellado en `OrderItem.warrantyMonths`   |
| **Art. 9** (suspensión)     | El plazo se suspende mientras el consumidor está privado del bien por garantía; ante **cambio total**, la garantía corre desde cero     | Regla publicada en `/legal/garantias` y trazada en `WarrantyClaim` (`/admin/garantias`)                                         |
| **Art. 10** (solidaridad)   | Productor y proveedor responden solidariamente; al consumidor le basta demostrar el defecto (salvo causales del art. 16)                | Radicación directa con evidencia fotográfica en `/mi-cuenta/pedidos/[number]` y `/pedido/[token]` (con 2FA para invitados)      |
| **Art. 11** (remedios)      | 1.º Reparación gratuita + **transporte 100 % gratuito**; si no admite reparación o se repite la falla, el cliente elige cambio o dinero | Remedios `REPAIR`, `REPLACE` (reimpresión directa desde `productionUrls` retenidos 90 d) o `REFUND` (con `requireRecentMfa`)    |
| **Art. 16** (exoneraciones) | Fuerza mayor, hecho de tercero, uso indebido o desatender instrucciones de cuidado; **la carga de probarlo es de Lucams Shop**          | Instrucciones de cuidado publicadas en `/legal/garantias` + sello `Design.qualityAcknowledgedAt` en fotos con alerta de nitidez |
| **Art. 59 num. 16** (SIC)   | La SIC puede fijar términos especiales obligatorios por categoría (hoy no existe reglamento especial para imanes/papelería decorativa)  | Monitoreo normativo; si se expide reglamento especial, se actualiza en catálogo y CMS                                           |

- **Ciclo de `WarrantyClaim` en `/admin/garantias` y soporte a fallas repetidas (art. 11 num. 2):** nace en `PENDING` con `slaDueAt` calculado a **15 días hábiles colombianos** (`WARRANTY_CLAIM_RESPONSE_BUSINESS_DAYS = 15`), avanza a `IN_REVIEW` → `APPROVED` → `RESOLVED` (registrando `resolutionType`: `"REPAIR"`, `"REPLACE"` o `"REFUND"` y enviando `warranty.email.resolved`) o `REJECTED` (con nota técnica obligatoria probando la causal del art. 16). A diferencia de `RetractRequest`, `WarrantyClaim.orderItemId` **no tiene restricción `@unique`** porque un bien reparado o sustituido puede presentar una segunda falla (habilitando el derecho del consumidor en el art. 11 num. 2); el servicio solo impide abrir un reclamo simultáneo cuando ya existe uno activo (`PENDING`/`IN_REVIEW`/`APPROVED`) sobre esa línea. Mientras exista un `WarrantyClaim` abierto, `purge-delivered-designs` **conserva intactos** los renders 300 DPI para poder reimprimir sin pedirle archivos de nuevo al cliente:

```prisma
enum WarrantyStatus {
  PENDING   // radicado por cliente o invitado (con 2FA posventa)
  IN_REVIEW // en diagnóstico técnico
  APPROVED  // procede la garantía, pendiente de ejecutar remedio
  RESOLVED  // resuelto ("REPAIR" | "REPLACE" | "REFUND")
  REJECTED  // improcedente con causal probada del art. 16 Ley 1480
}

model WarrantyClaim {
  id                String         @id @default(cuid())
  orderItemId       String         // sin @unique: permite historial si se repite falla (art. 11.2)
  customerId        String?
  contactId         String?
  status            WarrantyStatus @default(PENDING)
  description       String
  evidenceUrls      String[]       @default([])
  resolutionType    String?        // "REPAIR" | "REPLACE" | "REFUND"
  resolutionNote    String?
  requestedAt       DateTime       @default(now())
  resolvedAt        DateTime?
  processedBy       String?        // AdminUser.id
  assignedToAdminId String?
  slaDueAt          DateTime?      // +15 días hábiles colombianos (Ley Emiliani + Pascua)
}
```

### 3.5 Reseñas verificadas y moderación contra publicidad engañosa (Ley 1480 art. 23)

Publicar reseñas simuladas o presentar opiniones libres como compras reales vulnera el deber de información veraz (art. 23 Ley 1480). El sistema impone cuatro controles técnicos (`apps/web/features/reviews/`):

1. **Exclusividad de pedidos `DELIVERED` (`REVIEWABLE_ORDER_STATUSES = ["DELIVERED"]`):** tanto `createReviewAction` (cuenta autenticada) como `createReviewByTokenAction` (`/resena/[token]`, enviado por `review-request` solo tras confirmarse la entrega) verifican en BD una `Order` entregada con ese producto.
2. **Moderación humana previa en app y en base de datos:** toda reseña se inserta con `isApproved = false` y `featured = false`. Además del servicio TypeScript, la política RLS `"review insert own"` (`00000000000028_harden_rls_backstop_policies.sql`) bloquea cualquier `INSERT` directo con `isApproved = true`; solo tras revisión en `/admin/resenas` se publica en tienda.
3. **Cero testimonios sin compra asociada (`customerId = null` apagado por política):** aunque el esquema permite `customerId` anulable para conservar reseñas anonimizadas tras supresión de cuenta (`authorName = "Cliente verificado"`), está prohibido crear testimonios manuales sin compra verificada y producción tiene **0 reseñas sintéticas**.
4. **Bloqueo de scripts de seed (`env-guard`):** cualquier script de semilla de reseñas para desarrollo/STG aborta automáticamente si detecta credenciales de producción o un host remoto no autorizado.

### 3.6 Motor de días hábiles colombianos (`colombian-sla.ts`), las 10 cláusulas de T&C y protocolo ante la SIC

El módulo determinista [`apps/web/lib/colombian-sla.ts`](../apps/web/lib/colombian-sla.ts) calcula los vencimientos legales en huso `America/Bogota` (`UTC-5`, cierre `23:59:59.999` COT) descontando sábados, domingos y los **18 festivos oficiales de Colombia (Ley 51 de 1983 — Ley Emiliani)**:

- **6 festivos de fecha fija:** 1 de enero, 1 de mayo, 20 de julio, 7 de agosto, 8 de diciembre y 25 de diciembre.
- **7 festivos trasladados al lunes siguiente (Ley Emiliani):** Epifanía (6 ene), San José (19 mar), San Pedro y San Pablo (29 jun), Asunción (15 ago), Día de la Raza (12 oct), Todos los Santos (1 nov) e Independencia de Cartagena (11 nov).
- **5 festivos móviles respecto al domingo de Pascua** (calculado con el algoritmo gregoriano exacto de Meeus/Jones/Butcher): Jueves Santo (`-3` días), Viernes Santo (`-2`), Ascensión del Señor (`+43`), Corpus Christi (`+64`) y Sagrado Corazón de Jesús (`+71`).

Cada `SupportTicket`, `WarrantyClaim` y `RetractRequest` expone su estado de semáforo SLA (`MET`, `ON_TIME`, `DUE_SOON` cuando restan ≤ 2 días hábiles o ≤ 3 calendario, `OVERDUE` y `UNSET`) en `/admin/soporte`, `/admin/garantias`, `/admin/retractos` y en la bandeja operativa diaria **`/admin/hoy`**.

| Tipo de actuación                                          | Término máximo legal                                    | Constante en `consumer-law.ts`                | Norma colombiana                         |
| ---------------------------------------------------------- | ------------------------------------------------------- | --------------------------------------------- | ---------------------------------------- |
| Consulta de Hábeas Data (acceso / prueba de autorización)  | **10 días hábiles** (prorrogables +5 hábiles con aviso) | `HABEAS_DATA_CONSULTATION_BUSINESS_DAYS = 10` | Ley 1581 de 2012, art. 14                |
| Reclamo de Hábeas Data (corrección, supresión, revocación) | **15 días hábiles** (prorrogables +8 hábiles con aviso) | `HABEAS_DATA_CLAIM_BUSINESS_DAYS = 15`        | Ley 1581 de 2012, art. 15                |
| PQR de consumo y reclamación directa de garantía           | **15 días hábiles**                                     | `WARRANTY_CLAIM_RESPONSE_BUSINESS_DAYS = 15`  | Ley 1480 de 2011, art. 58                |
| Devolución del dinero por derecho de retracto              | **15 días calendario** desde que se ejerce              | `RETRACT_REFUND_MAX_CALENDAR_DAYS = 15`       | Ley 1480 art. 47 (mod. Ley 2439 de 2024) |

**Secciones obligatorias en `/legal/terminos` y protocolo de respuesta ante la SIC:**

1. `/legal/terminos` mantiene cubiertas las **10 secciones contractuales exigidas**: (1) identificación del proveedor, (2) definiciones legales, (3) procedimiento de compra paso a paso y corrección de errores antes de pagar, (4) medios de pago y condición tributaria, (5) tiempos separados de preparación/transporte y tope de 30 días calendario, (6) derecho de retracto y excepción del art. 47 num. 3, (7) garantía legal modular, (8) reversión del pago art. 51, (9) canales y plazos de PQR, y (10) ley colombiana aplicable, **SIC Facilita** y jurisdicción.
2. Ante cualquier **reclamación directa previa** (requisito de procedibilidad del art. 58 num. 5 Ley 1480), mediación en **SIC Facilita** o requerimiento administrativo/jurisdiccional de la **SIC**, se abre o escala el expediente en `/admin/soporte` con prioridad urgente y se recopila desde el panel el dossier probatorio íntegro: constancia de la orden (`LCM-YYYY-NNNN`), registros inmutables de `Consent` (versión, fecha/hora, IP, user-agent), eventos logísticos `ShipmentEvent` y guía PDF archivada en `shipping-labels`, sellos `Order.contentRightsAcceptedAt` y `Design.qualityAcknowledgedAt`, hilo completo de `SupportTicketMessage` y auditoría en `AdminActionLog`, contestando de fondo dentro de los **15 días hábiles** (o el plazo perentorio señalado por la Superintendencia).

---

## 4. Protección de Datos Personales (Ley 1581 de 2012) y Privacidad del Estudio

### 4.1 Deberes del responsable, exención RNBD (Decreto 090 de 2018) y datos de menores

- **Autorización previa, expresa, informada y verificable (art. 9 Ley 1581):** todas las acciones que capturan datos personales (`features/consent/`, registro, checkout, cotización por WhatsApp, soporte, solicitud B2B `/empresas-y-eventos`, boletín y avisos de stock) exigen acción afirmativa con casillas desmarcadas por defecto.
- **Exención del Registro Nacional de Bases de Datos (RNBD — Decreto 090 de 2018):** el Decreto 090 de 2018 (que modificó el art. 2.2.2.26.1.2 del Decreto 1074 de 2015) restringió la obligación de inscribir bases de datos en el RNBD exclusivamente a **sociedades comerciales y entidades sin ánimo de lucro con activos totales superiores a `100 000 UVT`** (en 2026: `≈ $5.237.400.000` COP). Como **persona natural comerciante**, Lucams Shop no está obligada a registrarse en el RNBD (el registro voluntario es opcional), sin que ello atenúe ninguno de los demás deberes de la Ley 1581, incluido el **reporte de incidentes de seguridad de datos personales ante la SIC dentro de los 15 días hábiles** siguientes a su detección (`IRP-003` en [`SECURITY.md` § 13.4](SECURITY.md#134-plan-de-respuesta-a-incidentes--irp-nist-sp-800-61-y-runbooks)).
- **Menores de edad (art. 7 Ley 1581):** la tienda está dirigida a mayores de 18 años. Cuando un comprador sube fotografías familiares al Estudio declara contar con autorización legítima de los representantes legales (`Order.contentRightsAcceptedAt`), y cualquier solicitud de retiro formulada por padres o representantes en `{{email_habeas_data}}` se ejecuta con prioridad inmediata.

### 4.2 Modelo `Consent` append-only, los 8 `ConsentScope` y compuerta dura de marketing

En `packages/db/prisma/schema.prisma`, `Consent` es estrictamente append-only: revocar un permiso jamás hace `UPDATE` ni `DELETE` de la prueba previa, sino que inserta una fila nueva con `accepted = false` y `revokesId` apuntando al registro anterior, sellando la versión vigente en `PRIVACY_POLICY_VERSION` (**`"v3 · 2026-11-05"`**):

```prisma
enum ConsentScope {
  COOKIES_NECESSARY   // técnicas indispensables (siempre true)
  COOKIES_FUNCTIONAL  // preferencias opcionales
  COOKIES_ANALYTICS   // Google Analytics 4 + WebVital RUM + lucams_utm
  COOKIES_MARKETING   // pauta externa (sin píxeles activos hoy)
  NEWSLETTER          // comunicaciones comerciales voluntarias
  BACK_IN_STOCK       // aviso puntual de reposición pedido por el titular
  MARKETING_PROFILING // segmentación comercial opcional
  HABEAS_DATA         // autorización general de tratamiento de datos personales
}

model Consent {
  id         String       @id @default(cuid())
  customerId String?
  contactId  String?      // ancla canónica CRM (ADR-193)
  email      String?      // ancla para invitados sin cuenta
  phone      String?      // ancla móvil CO (10 dígitos) para cotizaciones por WhatsApp sin email
  scope      ConsentScope
  accepted   Boolean
  version    String       // ej. "v3 · 2026-11-05"
  ipAddress  String?
  userAgent  String?
  revokesId  String?
  acceptedAt DateTime     @default(now())

  @@index([customerId, scope])
  @@index([contactId])
  @@index([email, scope])
  @@index([phone, scope])
  @@index([scope, acceptedAt])
}
```

- **Compuerta SQL dura en audiencias comerciales (`apps/web/features/crm/segments-service.ts`):** ninguna vista ni exportación CSV en `/admin/marketing/segmentos` (`vip`, `gift_buyers`, `winback_90d`, `annual_occasion`, `high_intent_no_order`) incluye un contacto a menos que su último `Consent(scope = 'NEWSLETTER')` por `contactId` o `email` tenga `accepted = true`, excluyendo además cuentas de staff (`AdminUser` / `Contact.isStaff = true`), certificado por `segments-service.integration.test.ts`.
- **Lifecycle Journeys (`ADR-198`):** los pasos marcados como comerciales comprueban en cada ejecución una aceptación `NEWSLETTER` que no haya sido revocada, incluyen baja `List-Unsubscribe` RFC 8058 y aplican también la supresión de Resend por rebote o queja. La revocación cierra inscripciones que exigen opt-in y suprime el paso comercial sin convertirlo en transaccional. Los mensajes estrictamente de servicio posventa o seguimiento de una solicitud B2B se configuran por separado. Contactos eliminados, anonimizados o internos no reciben nuevos mensajes; las semillas quedan en borrador y solo un administrador autorizado con MFA reciente puede activarlas.

### 4.3 Reglas detalladas de privacidad y temporalidad del Estudio de Personalización

El Estudio permite personalizar productos incluso sin haber creado cuenta previa, y las imágenes cargadas suelen contener rostros familiares. Para cumplir estrictamente con los principios de finalidad, acceso restringido y temporalidad (**Ley 1581 art. 4 lits. b, d y f**), rigen seis mecanismos específicos:

#### 1. Declaración de derechos (`Order.contentRightsAcceptedAt`) y aceptación de calidad (`Design.qualityAcknowledgedAt`)

- Al confirmar el pedido, el checkout exige declarar titularidad o autorización sobre las fotos y textos cargados, persistiendo el sello **`Order.contentRightsAcceptedAt`**.
- Cuando una fotografía subida dispara alertas de baja resolución o recorte en el Estudio, la interfaz bloquea el cierre del diseño hasta que el cliente marque expresamente la casilla **«imprimir con avisos de calidad»**, guardando la marca temporal en **`Design.qualityAcknowledgedAt`**. Este sello es visible en moderación (`/admin/disenos`) y en el detalle del pedido en `/admin/pedidos/[id]`, constituyendo prueba objetiva de limitación informada y aceptada ante reclamos por nitidez bajo el **art. 16 de la Ley 1480**.

#### 2. Derivados bajo el bucket privado `design-previews` (`ADR-147` / `ADR-191` / `LUC-SEC-001`)

- Ningún derivado de diseño vive en un bucket público: todos residen bajo el prefijo `<designId>/...` en el bucket privado `design-previews` y solo se entregan tras validar autorización por petición en `GET /api/design-preview/<designId>/<archivo>`.
- **Snapshot de borrador (`Design.draftPreviewUrl`, `ADR-147`):** miniatura WebP liviana (`≤ 120 KB`, `400 px`) que el auto-save sobrescribe con _upsert_ siempre sobre la misma ruta `<designId>/thumb.webp` (cero acumulación de versiones) y que solo pueden leer el dueño o staff autorizado con MFA `aal2`.
- **Previews limpios de exhibición (`ADR-191`):** `<designId>/preview.<ext>` y `<designId>/pages/NN.webp` son accesibles al dueño, staff `aal2` o portador del token de capacidad específico (`?st=`, `?qt=`, `?ot=` verificado por join contra ese diseño), y se eliminan automáticamente junto con el diseño sin crear una categoría separada de retención.

#### 3. Reglas de «Volver a pedir» (_reorder_) y protección de fotos de terceros en enlaces compartidos (`ADR-117` / `ADR-119`)

- En pedidos de invitados (`/pedido/[token]`), el botón **«Volver a pedir»** permite reutilizar un diseño previo en una compra nueva únicamente mientras sus archivos originales sigan dentro de la ventana de retención (`< 90 días` desde la entrega):
  - **Análisis de privacidad:** quien posee el enlace válido ya contaba con acceso de visualización sobre el pedido original, de modo que permitir reordenar no expone las imágenes a sujetos nuevos. Además, el token posventa **se rota automáticamente en cada nuevo envío de correo** (`ADR-119`), dejando sin efecto enlaces viejos reenviados a terceros.
  - **Corte automático tras la purga:** una vez cumplidos los 90 días post-entrega (`Design.purgedAt != null`), el ítem **deja de ser re-ordenable** y el flujo redirige al Estudio pidiendo subir fotos nuevas (acto que renueva la posesión y el consentimiento).
  - **Aislamiento físico por pedido:** cuando se ejecuta un _reorder_ vigente, el servidor **copia los bytes a rutas nuevas propias** para el nuevo diseño, de modo que cada pedido corre su propio reloj independiente de 90 días sin que la purga del pedido original afecte al nuevo ni viceversa.

#### 4. Orden de purga de carritos y borradores pre-compra (`/api/cron/purge-anon-designs`, `08:00 UTC`)

Ejecutado a diario por [`apps/web/features/cart/cart-retention.ts`](../apps/web/features/cart/cart-retention.ts) y [`apps/web/features/personalization/retention-service.ts`](../apps/web/features/personalization/retention-service.ts):

1. **Carritos primero (para destrabar diseños en la misma corrida):** como las purgas de diseños respetan todo diseño referenciado por un `Cart` vivo, el job elimina primero con _hard-delete_ los carritos vacíos sin actividad **`≥ 7 días`** (`PURGE_EMPTY_CART_AFTER_DAYS = 7`), los carritos vivos inactivos **`≥ 60 días`** sin `AbandonedCart` vigente (`PURGE_STALE_CART_AFTER_DAYS = 60`), y las filas `AbandonedCart` **`≥ 90 días`** (`PURGE_ABANDONED_CART_AFTER_DAYS = 90`).
2. **Borradores `DRAFT` y activos huérfanos anónimos (`customerId = null`):** se purgan tras **`7 días`** sin actividad (`PURGE_ANON_DESIGN_AFTER_DAYS = 7`, más estricto que el techo máximo de 30 días informado en `/legal/habeas-data`), borrando fotos crudas en `customer-uploads`, previews y filas `DesignAsset`/`Design`.
3. **Borradores `DRAFT` inactivos de clientes registrados (`customerId != null`):** se purgan tras **`30 días`** sin actividad (`PURGE_IDLE_DESIGN_AFTER_DAYS = 30`, más protector que el techo público de 90 días) siempre que no estén en carrito, pedido ni cotización viva ni en estado `ARCHIVED`.
4. **Diseños `READY` (y `ARCHIVED` desde `READY`) nunca comprados (`ADR-130`):** se purgan tras **`90 días`** sin actividad (`PURGE_IDLE_READY_AFTER_DAYS = 90`), liberando tanto las fotos crudas como los renders 300 DPI (`~2,6 MB` por unidad en `production-assets`) que nunca llegaron a orden ni cotización.
5. **Diseños ligados a cotizaciones:** se depuran a los **`90 días`** de cerrada/descartada la cotización (`PURGE_AFTER_QUOTE_CLOSED_DAYS = 90`, limpiando `QuoteItem.previewUrl`) o al cumplirse el tope de **`365 días`** en cotizaciones abiertas sin movimiento (`PURGE_STALE_QUOTE_AFTER_DAYS = 365`).
6. **Garantía anti-huérfanos en fallos de red:** en todas las pasadas, si la API de Supabase Storage falla al borrar algún objeto, la fila en Postgres **no se elimina** para que la corrida del día siguiente reintente sin dejar jamás archivos ocultos sin puntero en BD.

#### 5. Purga post-entrega de pedidos `DELIVERED` (`/api/cron/purge-delivered-designs`, `09:00 UTC`)

Implementada en [`apps/web/features/personalization/retention-delivered.ts`](../apps/web/features/personalization/retention-delivered.ts):

- Cumplidos **`90 días`** desde `Order.deliveredAt` (`PURGE_DELIVERED_DESIGN_AFTER_DAYS = 90`), elimina físicamente las fotos crudas de `customer-uploads`, todos los archivos 300 DPI de `production-assets` (`productionUrls[]`, `productionUrl` legacy y staging `_client/`), y las filas `DesignAsset`, sellando `Design.purgedAt` únicamente cuando el 100 % de los bytes fueron removidos.
- **Qué conserva:** el preview limpio de exhibición (`previewUrl`), `canvasData` y el snapshot comercial del `OrderItem` para soporte histórico y contable.
- **Exclusiones estrictas de posventa:** jamás purga un diseño si participa en otra orden aún en curso o entregada hace menos de 90 días, ni si tiene un **`RetractRequest` abierto** (`PENDING`, `APPROVED`, `RECEIVED`) o un **`WarrantyClaim` abierto** (`PENDING`, `IN_REVIEW`, `APPROVED`, necesario para reimprimir un cambio en garantía).

#### 6. Tope no productivo (`14 días`) y barrido recurrente de huérfanos en Storage (`sweepOrphanStorageObjects`)

- En cualquier entorno distinto de `production`, `capRetentionDaysNonProd` recorta automáticamente las ventanas de retención a un máximo de **`14 días`** (`RETENTION_NONPROD_MAX_DAYS = 14`), evitando acumular datos de prueba en STG.
- Al cierre de `purge-anon-designs`, `sweepOrphanStorageObjects` escanea hasta **`500 objetos por corrida`** en `production-assets`, `design-previews` y `customer-uploads` (otorgando **7 días de gracia** al prefijo temporal `pending/`), verifica dos veces contra la tabla `Design` que el diseño no exista y borra cualquier objeto huérfano residual.

### 4.4 Ejercicio de derechos ARCO y cascada exhaustiva de supresión (`deleteCustomerAccount`)

El titular puede ejercer sus derechos escribiendo a `{{email_habeas_data}}` (exportación, actualización formal o reclamo) o ejecutando por sí mismo la supresión inmediata en **`/mi-cuenta/seguridad` → `/mi-cuenta/eliminar`** ([`apps/web/features/account/delete-service.ts`](../apps/web/features/account/delete-service.ts)). El flujo exige escribir `"ELIMINAR"`, re-autenticar la contraseña actual y superar el rate limit `5 / 15 min`, bloqueando temporalmente la baja solo mientras existan pedidos activos en tránsito o taller (`PENDING_PAYMENT`, `PAID`, `FULFILLING`, `SHIPPED`, conforme al art. 9 del Decreto 1377 de 2013):

| Dato o tabla en el sistema                                                                   | Acción exacta ejecutada en `deleteCustomerAccount`                                                                                                                 | Fundamento legal                                                           |
| -------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------- |
| **Fotos y renders en Storage** (`customer-uploads`, `design-previews`, `production-assets`)  | Borrado físico _fail-closed_ previo a la transacción SQL de fotos crudas, borradores y renders 300 DPI (incluidos diseños adoptados de sesión invitada)            | Eliminación física de imágenes personales (PII sensible)                   |
| **`Customer`**                                                                               | Scrub de nombre, teléfono y documento a `null`, correo y `supabaseUserId` a placeholders únicos irreversibles y sello `deletedAt`                                  | Supresión de identidad directa                                             |
| **Usuario en Supabase Auth**                                                                 | `auth.admin.deleteUser`; si la llamada remota fallara, aplica **baneo inmediato** (`ban_duration`) como fallback garantizado                                       | Corte inmediato e irrevocable de autenticación                             |
| **Grafo CRM (`Contact`, `ContactIdentity`, `IdentityMergeCandidate`)**                       | `scrubContactOnErasureTx` (`ADR-193`): desvincula `contactId -> null` en 8 tablas, elimina todas las `ContactIdentity` y fusiones `PENDING`, y anonimiza `Contact` | Eliminación de perfilamiento e índices de búsqueda                         |
| **`Address`, `Favorite`/`WishlistItem`, `StockAlertSubscription`, `Cart` / `AbandonedCart`** | Scrub de direcciones y eliminación física de favoritos, suscripciones de stock y carritos                                                                          | Sin deber legal de retención posterior                                     |
| **`Order` (pedidos históricos ya entregados, cancelados o reembolsados)**                    | **Se conserva el registro contable** desvinculado (`customerId = null`, `contactId = null`) y con correo, teléfono, documento y dirección de entrega anonimizados  | Deber mercantil y fiscal (Código de Comercio art. 60 / ET art. 632)        |
| **`Quote`, `SupportTicket`, `SupportTicketMessage` y `WarrantyClaim`**                       | Desvinculación, anonimización de cabeceras y reemplazo del cuerpo de mensajes por `[Mensaje eliminado por solicitud de supresión de cuenta]`                       | Limpieza de texto conversacional libre                                     |
| **`Review`, `LoyaltyTxn`, `CouponUsage`, `Coupon` y `Referral`**                             | `customerId -> null`, `authorName = "Cliente verificado"`, desactivación de cupones personales y limpieza de correos en usos y referidos                           | Conservación estadística sin identificación personal                       |
| **`Consent`, `NewsletterSubscriber`, Resend Contacts y `AdminActionLog`**                    | Inserta revocación `accepted = false`, marca baja en Resend, limpia `email`/`phone`/`ipAddress`/`userAgent` en `Consent` y redacta el correo en `AdminActionLog`   | Cese comercial inmediato conservando trazabilidad auditable sin PII activa |

### 4.5 Tabla maestra de retención y subprocesadores internacionales (art. 26 Ley 1581)

| Categoría / Almacén                                                                    | Retención en PRD      | Mecanismo automático de purga                                                  |
| -------------------------------------------------------------------------------------- | --------------------- | ------------------------------------------------------------------------------ |
| Carritos vacíos / carritos vivos inactivos / `AbandonedCart`                           | **7 d / 60 d / 90 d** | `lucams-purge-anon-designs` (`cart-retention.ts`)                              |
| Diseños `DRAFT` anónimos / `DRAFT` registrados / `READY` nunca comprados               | **7 d / 30 d / 90 d** | `lucams-purge-anon-designs` (`retention-service.ts`, cap `14 d` en no-PRD)     |
| Fotos y renders 300 DPI en cotizaciones cerradas / abiertas sin movimiento             | **90 d / 365 d**      | `lucams-purge-anon-designs`                                                    |
| Fotos crudas y renders 300 DPI de pedidos `DELIVERED`                                  | **90 días**           | `lucams-purge-delivered-designs` (excluye retractos y garantías abiertos)      |
| `rate_limit_buckets` / `WebVital` / `ErrorLog`, `ErrorReport`, `Notification` (leídas) | **7 d / 35 d / 90 d** | `lucams-purge-rate-limits` y `lucams-purge-event-logs`                         |
| `EmailEvent`, `WebhookEvent` (`processedAt != null`) y `SecurityEvent`                 | **180 días**          | `lucams-purge-event-logs` (`event-log-retention.ts`)                           |
| `FunnelEventDaily` (contadores diarios agregados sin cookies ni PII)                   | **365 días**          | `lucams-purge-event-logs`                                                      |
| Respaldos externos cifrados GPG `AES-256` en Cloudflare R2                             | **~30 días**          | Rotación automática del ciclo diario de respaldos (`backup.yml`)               |
| Soporte contable anonimizado de `Order` y auditoría `AdminActionLog`                   | Plazo legal mercantil | Conservación legal (Código de Comercio art. 60 / Estatuto Tributario art. 632) |

**Subprocesadores activos y transmisión internacional (`/legal/subprocesadores`):** la tienda opera en modo completo (`NEXT_PUBLIC_STORE_MODE=full`). Como Estados Unidos no cuenta con declaratoria general de país adecuado por la SIC, la transmisión internacional se ampara en la autorización expresa otorgada al aceptar la política de privacidad (art. 26 Ley 1581), acuerdos de encargado (DPA) y cifrado TLS/reposo, notificando con **30 días de antelación** a los clientes activos antes de incorporar un nuevo encargado:

| Encargado / Servicio                                                                        | País / Región         | Datos tratados y propósito                                              | Salvaguarda técnica y base legal                                                       |
| ------------------------------------------------------------------------------------------- | --------------------- | ----------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| **Supabase**                                                                                | EE. UU.               | Base de datos Postgres, Auth y Storage de archivos                      | RLS en 73/73 tablas, `REVOKE ALL`, 3 buckets privados · Contrato + autorización        |
| **Vercel**                                                                                  | EE. UU. / Global      | Ejecución serverless (`iad1`), CDN y registros de borde                 | TLS/HSTS, CSP por nonce, `scrubPii` en stdout · Contrato + autorización                |
| **Wompi**                                                                                   | Colombia              | Procesamiento de pagos electrónicos y antifraude                        | PCI-DSS en dominio Wompi; PAN y CVV nunca tocan Lucams Shop · Necesidad contractual    |
| **Aveonline** (+ Envía, Coordinadora, Servientrega, Interrapidísimo, TCC, Deprisa, Saferbo) | Colombia              | Cotización, generación de guías, rastreo y recaudo contraentrega        | Solo nombre, dirección y teléfono de entrega · Necesidad contractual                   |
| **Resend**                                                                                  | EE. UU.               | Envío de correos transaccionales y contactos opt-in                     | DKIM/SPF/DMARC y supresión inmediata ante rebotes/quejas · Contrato / opt-in           |
| **Cloudflare** y **Cloudflare R2**                                                          | Global / EE. UU.      | DNS, Email Routing, Turnstile anti-bot y respaldos DR                   | Dumps cifrados con GPG **AES-256** antes de salir del runner · Seguridad / continuidad |
| **Google (Gemini API)**                                                                     | EE. UU.               | Sugerencias de texto en el Estudio y copiloto interno de soporte        | **Cero PII y cero fotos** (`sanitizeOccasion` + `sanitizeSupportTextForAi`)            |
| **Google LLC (Google Analytics 4)**                                                         | EE. UU.               | Analítica de conversión opcional                                        | **Apagado por defecto;** exige opt-in `COOKIES_ANALYTICS` + `sanitizeAnalyticsUrl`     |
| **Meta / WhatsApp**, **Mi.com.co** y **GitHub**                                             | Global / CO / EE. UU. | Canal iniciado por el usuario (`wa.me`), registro `.com`/`.co` y código | Mi.com.co y GitHub no tratan bases de datos de compradores                             |

---

## 5. Gobierno de cookies (estándar opt-in) y analítica sin cookies

Implementado en [`apps/web/components/cookies-banner.tsx`](../apps/web/components/cookies-banner.tsx), [`apps/web/lib/cookie-consent.ts`](../apps/web/lib/cookie-consent.ts), [`apps/web/lib/analytics.ts`](../apps/web/lib/analytics.ts) y [`apps/web/lib/utm-attribution.ts`](../apps/web/lib/utm-attribution.ts), alineado de forma voluntaria al estándar europeo de opt-in granular:

### 5.1 Las 4 categorías del banner y reglas de re-consentimiento

| Categoría (`ConsentScope`)                         | Estado inicial | ¿Bloqueable? | Qué gobierna en tiempo real                                                                                |
| -------------------------------------------------- | :------------: | :----------: | ---------------------------------------------------------------------------------------------------------- |
| **Estrictamente necesarias** (`COOKIES_NECESSARY`) |     **ON**     |      No      | Sesión Auth, timeouts de inactividad, carrito anónimo, estado cifrado de checkout y preferencia del banner |
| **Funcionales** (`COOKIES_FUNCTIONAL`)             |    **OFF**     |      Sí      | Preferencias opcionales de interfaz no esenciales                                                          |
| **Analíticas** (`COOKIES_ANALYTICS`)               |    **OFF**     |      Sí      | Carga de Google Analytics 4 (`gtag.js`), envío de beacons RUM a `/api/vitals` y atribución `lucams_utm`    |
| **Marketing** (`COOKIES_MARKETING`)                |    **OFF**     |      Sí      | Píxeles publicitarios externos (hoy no hay píxeles de terceros instalados)                                 |

- **Sin patrones oscuros y reabrible siempre:** el banner inferior ofrece con idéntica jerarquía visual _Solo necesarias_, _Personalizar_ y _Aceptar todas_, no aparece en `/admin/*`, y puede reabrirse en cualquier momento desde `<CookiesReopener>` en el footer y en `/legal/cookies`. Cada elección invoca `persistCookieConsentAction` (`30 / 1 min` por IP) registrando una fila por categoría en `Consent`.
- **Re-consentimiento automático por versión (`policyVersion`):** `cookie_consent_v1` guarda la versión estructural (`v: 1`) y `policyVersion` (alimentada desde el ajuste CMS `PRIVACY_POLICY_VERSION`). Cuando cambia la versión publicada del aviso de privacidad, el banner vuelve a mostrarse automáticamente a visitantes recurrentes; si el usuario revoca `COOKIES_ANALYTICS`, `clearAnalyticsCookies()` y `clearStoredUtm()` borran de inmediato `_ga`, `_ga_*` y `lucams_utm`.
- **Embudo propio sin cookies (`FunnelEventDaily`):** `POST /api/funnel` (`credentials: "omit"`) registra únicamente contadores enteros diarios agregados sin leer ni escribir cookies ni PII, permitiendo medir salud operativa sin rastrear personas.

### 5.2 Catálogo completo de cookies utilizadas por el sitio

| Cookie                        | Categoría | TTL / Expiración        | Atributos de seguridad y finalidad                                                                              |
| ----------------------------- | --------- | ----------------------- | --------------------------------------------------------------------------------------------------------------- |
| `sb-<project-ref>-auth-token` | Necesaria | Contenedor `400 d`      | Sesión `@supabase/ssr` (`SameSite=Lax`, `Secure` en HTTPS; tokens internos rotan: access `1 h`, refresh `30 d`) |
| `customer_last_activity`      | Necesaria | `30 días` (idle `7 d`)  | `HttpOnly`, firmada HMAC-SHA256 con `CSRF_SECRET` ligada a `user.id` (`ADR-162`)                                |
| `admin_last_activity`         | Necesaria | `30 días` (idle `30 m`) | `HttpOnly`, `Path=/admin`, firmada HMAC-SHA256 ligada a `user.id` (`ADR-162`)                                   |
| `cart_session`                | Necesaria | `30 días`               | `HttpOnly`, `SameSite=Lax`; UUID opaco del carrito/borrador anónimo rotado al cerrar sesión (`LUC-SEC-013`)     |
| `checkout_state`              | Necesaria | `60 minutos`            | `HttpOnly`, **cifrada `AES-256-GCM`** en servidor con `CSRF_SECRET`                                             |
| `lucams_cms_edit`             | Necesaria | `8 horas`               | `HttpOnly`, exclusiva para edición visual in-context del personal autorizado                                    |
| `cookie_consent_v1`           | Necesaria | `1 año`                 | Legible en cliente por diseño para que el cargador de analítica consulte el consentimiento sin golpear servidor |
| `lucams_utm` / `_ga`, `_ga_*` | Analítica | `30 días` / GA4         | **Solo se crean tras opt-in expreso en `COOKIES_ANALYTICS`**; eliminadas activamente al revocar                 |

---

## 6. Arquitectura del Paquete Legal Versión 3 (`2026-11-05`) y guardián `legal-content-sync.test.ts`

### 6.1 Las 3 capas sincronizadas de los 8 documentos legales

Todos los textos legales comparten versión unificada (**`Versión 3 · vigente desde 2026-11-05`**) a través de tres capas idénticas más dos ajustes maestros (`legal.last-updated = "Última actualización: 2026-11-05 · Versión 3"` y `PRIVACY_POLICY_VERSION = "v3 · 2026-11-05"`):

| #   | Ruta pública             | Capa 1: Markdown canónico (`packages/db/legal-content/`) | Capa 2: `FALLBACK` en `apps/web/app/legal/` | Capa 3: `CmsField` (`LEGAL`) | Materia regulada                                                                       |
| --- | ------------------------ | -------------------------------------------------------- | ------------------------------------------- | ---------------------------- | -------------------------------------------------------------------------------------- |
| 1   | `/legal/privacidad`      | `legal.privacidad.md`                                    | `privacidad/page.tsx`                       | `legal.privacidad.body`      | Aviso de Privacidad (Decreto 1377 de 2013, arts. 14 y 15)                              |
| 2   | `/legal/terminos`        | `legal.terminos.md`                                      | `terminos/page.tsx`                         | `legal.terminos.body`        | Términos y Condiciones (las 10 cláusulas obligatorias, Ley 1480 y Ley 2439)            |
| 3   | `/legal/cookies`         | `legal.cookies.md`                                       | `cookies/page.tsx`                          | `legal.cookies.body`         | Política, categorías e inventario técnico de cookies                                   |
| 4   | `/legal/devoluciones`    | `legal.devoluciones.md`                                  | `devoluciones/page.tsx`                     | `legal.devoluciones.body`    | Derecho de retracto, excepción personalizados, flete de retorno y reversión art. 51    |
| 5   | `/legal/garantias`       | `legal.garantias.md`                                     | `garantias/page.tsx`                        | `legal.garantias.body`       | Garantía legal modular, suspensión, instrucciones de cuidado y causales art. 16        |
| 6   | `/legal/habeas-data`     | `legal.habeas-data.md`                                   | `habeas-data/page.tsx`                      | `legal.habeas-data.body`     | Política integral de Tratamiento de Datos Personales, ARCO y tabla de retención        |
| 7   | `/legal/subprocesadores` | `legal.subprocesadores.md`                               | `subprocesadores/page.tsx`                  | `legal.subprocesadores.body` | Encargados del tratamiento, transportadoras aliadas y transmisión internacional        |
| 8   | `/legal/security`        | `legal.security.md`                                      | `security/page.tsx`                         | `legal.security.body`        | Divulgación coordinada de vulnerabilidades (`security@lucamsshop.com`, acuse ≤ 3 días) |

### 6.2 Las 7 invariantes de CI en `legal-content-sync.test.ts` y checklist para publicar una nueva versión

El test automatizado [`apps/web/app/legal/legal-content-sync.test.ts`](../apps/web/app/legal/legal-content-sync.test.ts) bloquea cualquier PR si se incumple cualquiera de estas siete reglas:

1. **Paridad byte a byte `legal.<slug>.md === FALLBACK`:** el bloque `const FALLBACK = \`...\``de cada`page.tsx` (des-escapando `` \` `` y `\${`) debe coincidir exactamente con el archivo canónico ya formateado con Prettier.
2. **Cero correos `@lucamsshop.com` literales:** todo buzón dentro de los textos legales debe escribirse con `{{email_contacto}}`, `{{email_habeas_data}}`, `{{email_retracto}}` o `{{email_security}}`.
3. **Cero plazos legales hardcodeados:** prohibido escribir literales como `"15 días calendario"`, `"30 días calendario"`, `"10 días hábiles"`, `"15 días hábiles"` o `"5 días hábiles"`; deben provenir siempre de los `{{tokens}}` de `consumer-law.ts`.
4. **Cero redacción obsoleta de Etapa 1 («modo catálogo»):** rechaza expresiones como `"todavía no cobramos"`, `"cuando activemos"`, `"Etapa 1"` o `[PENDIENTE]`.
5. **Cero `NIT` o `matrícula mercantil` no operados:** impide publicar identificadores tributarios ficticios o sin soporte documental.
6. **Pie de versión unificado y sincronizado en las 3 fuentes:** los 8 archivos deben cerrar con `_Versión 3 · vigente desde 2026-11-05_`, alineado con `legal.last-updated` / `PRIVACY_POLICY_VERSION` en `cms-site-map.mjs` y con `DEFAULT_PRIVACY_POLICY_VERSION` en `lib/cookie-consent.ts`.
7. **Cero voseo (`es-CO` tuteo estricto):** escanea los 8 documentos legales y bloquea cualquier conjugación o imperativo de voseo frente al tuteo estándar colombiano (`tú`).

**Protocolo de 6 pasos para publicar una futura `Versión 4`:**

1. Editar primero los archivos maestros en `packages/db/legal-content/legal.*.md` manteniendo los `{{tokens}}` y el nuevo pie `_Versión 4 · vigente desde YYYY-MM-DD_`.
2. Ejecutar **`pnpm format` antes de copiar** (Prettier refluye líneas Markdown; si copias antes de formatear, `legal-content-sync.test.ts` detectará diferencia).
3. Sincronizar los `FALLBACK` en `apps/web/app/legal/*/page.tsx`, actualizar `legal.last-updated` y `PRIVACY_POLICY_VERSION` en `packages/db/scripts/cms-site-map.mjs` y `DEFAULT_PRIVACY_POLICY_VERSION` en `apps/web/lib/cookie-consent.ts` (si cambió el tratamiento de datos, esto disparará re-consentimiento del banner).
4. Actualizar la versión esperada en `apps/web/app/legal/legal-content-sync.test.ts`.
5. Ejecutar `make check && pnpm test` hasta obtener verde completo.
6. Sincronizar los bloques en STG y PRD mediante `packages/db/scripts/sync-and-prune-cms-v2.mjs` (o desde `/admin/contenido`) preservando el historial reversible de versiones CMS.

---

## 7. Régimen comercial, tributario (`BILLING_DOCUMENT_ENABLED = false`) y Propiedad Intelectual

### 7.1 Operación vigente: persona natural no responsable de IVA y soporte `LCM-YYYY-NNNN`

- **Marco tributario vigente (Estatuto Tributario art. 437 parágrafo 3; Decreto 1625 de 2016 art. 1.6.1.4.3 num. 3):** una persona natural no responsable de IVA no está obligada a expedir factura electrónica de venta mientras sus ingresos brutos anuales provenientes de la actividad económica sean inferiores a **`3 500 UVT`** (con UVT 2026 = `$52.374` según Res. DIAN 000238 de 2025, equivalente a **`$183.309.000` COP**; revalidar cada diciembre el valor oficial de la UVT con contador).
- **Alerta Régimen Simple de Tributación (RST, Ley 1943 de 2019):** si la titular se inscribe en el Régimen Simple, la obligación de expedir factura electrónica aplica **independientemente del nivel de ingresos**. Antes de apoyarse en la exención del tope de `3 500 UVT`, verificar con el contador el régimen tributario efectivamente inscrito en el RUT.
- **Vigilancia automática del tope (`ADR-196`):** el cron diario `lucams-fiscal-watch` (`features/fiscal-watch/`) mide los ingresos brutos del año civil colombiano contra el tope de `3 500 UVT` y las ventas pagadas con tarjeta contra la condición del art. 437 par. 3 (solo Wompi `CARD`; PSE es débito a cuenta y Nequi es billetera — quedan como línea informativa de pagos electrónicos para validar con el contador), con **base bruta conservadora** (incluye órdenes `REFUNDED`: el ingreso bruto se devengó aunque se reembolse), proyección de cierre por ritmo de 30 días y alertas 70 %/90 %/100 % en `/admin/hoy`, `/admin/metricas`, `/admin/notificaciones` y correo al owner en 90 %/100 %. La UVT anual es constante versionada (`FISCAL_UVT_COP_BY_YEAR`) con test-guardia que exige su actualización cada diciembre.
- **Estado exacto en código y textos públicos:**
  - Todos los precios y totales (`ProductVariant.price`, `Order.subtotal`, `Order.discount`, `Order.loyaltyDiscount`, `Order.shipping`, `Order.tax`, `Order.total`) son enteros en **centavos COP (`Int`)**, con **`Order.tax = 0`**.
  - **No existe modelo `Invoice` activo en Prisma ni cobro discriminado de IVA 19 %.** Cada compra genera constancia/soporte de operación (`LCM-YYYY-NNNN`), `/legal/terminos` declara expresamente la condición de persona natural no responsable de IVA, la opción de facturación electrónica de Aveonline permanece apagada tras doble compuerta (`AVEONLINE_FACTURACION_ELECTRONICA`), y las superficies corporativas (`/empresas-y-eventos`) ofrecen verazmente _«documentación tributaria (cuenta de cobro o factura electrónica según corresponda)»_.

### 7.2 Interruptor `BILLING_DOCUMENT_ENABLED = false`, preparación DIAN (Res. 165 de 2023) y retenciones B2B

1. **Interruptor maestro (`apps/web/features/checkout/billing-document.ts`, `ADR-160`):**
   - `BILLING_DOCUMENT_ENABLED = false` oculta la sección «Quiero documento tributario» en `/checkout/datos` y hace que `saveDatosAction` ignore cualquier `wantsInvoice` manipulado manualmente, evitando prometer un documento tributario no operado (arts. 23 y 29 Ley 1480) y cumpliendo minimización de datos.
   - `BillingDocumentInputSchema` (`CC` 6–10 dígitos, `CE`, `NIT` 9–10 dígitos, `TI`, `PP`) y las columnas en Prisma (`DocumentType`, `TaxResponsibility`, `DianStatus`: `NOT_REQUIRED | PENDING | SENT | ACCEPTED | REJECTED`, `Order.billingDocumentType`, `billingDocumentNumber`, `billingName`, `dianCufe`, `dianXmlUrl` y `Organization.taxIdType`/`taxIdNumber`) ya están desplegadas y probadas. Cuando `Order.isGift = true`, `recipientName` y `recipientPhone` se usan exclusivamente para la entrega logística, manteniendo `billing*` aislado sobre el comprador titular.
2. **Ruta de activación de facturación electrónica DIAN (Resolución 165 de 2023):** cuando el negocio supere el tope de `3 500 UVT` o decida inscribirse voluntariamente como facturador electrónico para ventas corporativas (evitando las sanciones del art. 652-1 ET: cierre por 3 días o multa del 1 % de ingresos hasta 950 UVT):

| Modalidad DIAN                       | Evaluación para Lucams Shop                                                                                                | Decisión arquitectónica                |
| ------------------------------------ | -------------------------------------------------------------------------------------------------------------------------- | -------------------------------------- |
| **Proveedor Tecnológico autorizado** | **Alegra**, **Siigo** o **Facture**: exponen API REST para emisión automática tras `Order -> PAID`, CUFE, XML y numeración | **Modalidad elegida cuando se active** |
| **Facturador gratuito DIAN**         | Operación manual sin API transaccional adecuada para e-commerce                                                            | Descartado                             |
| **Software propio habilitado**       | Costo desproporcionado de habilitación, firma digital XAdES-EPES y mantenimiento normativo                                 | Descartado                             |

- **Requisitos al encender `BILLING_DOCUMENT_ENABLED = true`:** RUT actualizado con responsabilidad `52` (facturador electrónico), resolución de numeración DIAN vigente cargada en el Proveedor Tecnológico, emisión asíncrona de factura (`CUFE` + `dianXmlUrl`), emisión obligatoria de **Nota Crédito Electrónica** ante reembolsos totales o parciales (retractos/garantías), e inclusión del proveedor elegido en `/legal/subprocesadores` con preaviso si aplica.

3. **IVA futuro y retenciones en ventas corporativas B2B (`Organization`):**
   - En ventas B2C a consumidor final **jamás aplican retenciones**.
   - Si en régimen responsable de IVA (tarifa general **19 %** sobre imanes y productos gravados) o bajo cuenta de cobro se vende a una empresa **agente de retención** (canal corporativo B2B), las retenciones aplicables (**Retención en la fuente** por compras, **ReteIVA** del 15 % del IVA cuando proceda y **ReteICA** según municipio, ej. Bogotá) **las calcula y descuenta el comprador corporativo al momento del pago**, nunca como descuento en el precio de lista: Lucams Shop emite el documento por el valor bruto total y recibe del cliente corporativo el pago neto más el **certificado de retención** para soporte contable y conciliación en `/admin/cotizaciones` / `/admin/organizaciones`.

### 7.3 Postura operativa sobre Propiedad Intelectual (`PLAN_CATALOG_V2 [1.7]`)

1. **Contenido cargado por compradores en el Estudio:** `/legal/terminos` exige que el usuario sea titular o cuente con licencia suficiente sobre las imágenes, logotipos y textos encargados (`Order.contentRightsAcceptedAt`). En `/admin/disenos` (`ModerationStatus`), el equipo revisa las órdenes antes de imprimir y rechaza material ilícito o infractor evidente, gestionando el cambio de arte o reembolso inmediato.
2. **Temáticas inspiradas del catálogo prediseñado (`PLAN_CATALOG_V2.md` § 1.7):** las colecciones propias inspiradas en estética pop, música, cine o anime se diseñan como ilustraciones y composiciones originales inspiradas, evitando utilizar logotipos oficiales registrados o marcas de terceros como signo distintivo en los nombres de producto. Como salvaguarda comercial y jurídica, ante cualquier reclamación formal de titularidad o comunicación _cease & desist_ recibida en `{{email_contacto}}` o `{{email_habeas_data}}`, rige el **protocolo inmediato de retiro sin litigio**:
   1. **Baja inmediata en 1 clic:** archivar o despublicar de inmediato el producto o variante desde `/admin/productos`, lo que purga al instante las etiquetas de caché de Next.js y lo retira automáticamente del catálogo público, de `sitemap.xml` y del feed `/api/catalog/merchant-feed.xml`.
   2. **Redirección limpia:** registrar en `/admin/contenido/redirecciones` un `UrlRedirect` permanente hacia la categoría general para evitar páginas `404`.
   3. **Cierre ordenado y trazabilidad:** completar o reembolsar los pedidos previos según el alcance del requerimiento, responder por escrito al solicitante dejando constancia del retiro inmediato de buena fe y conservar la evidencia en `AdminActionLog`.
