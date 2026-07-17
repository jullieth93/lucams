# Compliance — Lucams_shop (Colombia)

> Marco regulatorio que aplica a un e-commerce colombiano. **Nada de esto es opcional para vender legalmente.** Detalle por norma + tareas concretas en el código y en el flujo operativo.

> **Disclaimer:** este documento refleja interpretación operativa de las normas a 2026-05-09. **No reemplaza asesoría legal profesional.** Antes del lanzamiento se recomienda revisión por abogado colombiano (ADR-020).

## Tabla de contenido

1. [Resumen ejecutivo de obligaciones](#resumen-ejecutivo-de-obligaciones)
2. [Ley 1581 de 2012 — Protección de Datos Personales (Habeas Data)](#ley-1581-de-2012--protección-de-datos-personales-habeas-data)
3. [Ley 1480 de 2011 — Estatuto del Consumidor](#ley-1480-de-2011--estatuto-del-consumidor)
4. [Facturación electrónica DIAN (Resolución 165 de 2023)](#facturación-electrónica-dian-resolución-165-de-2023)
5. [IVA y retenciones](#iva-y-retenciones)
6. [Documentos legales requeridos en el sitio](#documentos-legales-requeridos-en-el-sitio)
7. [Cookie consent (alineación GDPR voluntaria)](#cookie-consent-alineación-gdpr-voluntaria)
8. [Subprocessor list y transferencias internacionales](#subprocessor-list-y-transferencias-internacionales)
9. [Calendario de cumplimiento](#calendario-de-cumplimiento)

---

## Resumen ejecutivo de obligaciones

| Norma                                     | Aplica si...                                                              | Bloqueante para lanzar              |
| ----------------------------------------- | ------------------------------------------------------------------------- | ----------------------------------- |
| **Ley 1581 / Decreto 1377** (Habeas Data) | Recolectamos datos personales (sí: emails, teléfonos, direcciones, fotos) | ✅ Sí                               |
| **Ley 1480** (Estatuto del Consumidor)    | Vendemos B2C (sí)                                                         | ✅ Sí                               |
| **Facturación electrónica DIAN**          | Somos responsables de IVA (sí, al inscribir el negocio)                   | ✅ Sí (multas hasta 1% de ingresos) |
| **IVA 19% standard**                      | Productos no exentos (los imanes están gravados a tarifa general)         | ✅ Sí                               |
| **Retención en la fuente**                | Comprador es agente retenedor (B2B mayorista)                             | Solo para Fase 6 (B2B)              |
| **Registro Único de Comerciantes (RUES)** | Operamos comercialmente                                                   | ✅ Sí (no es código, es trámite)    |
| **Cámara de Comercio**                    | Registro mercantil del negocio                                            | ✅ Sí (trámite)                     |

---

## Ley 1581 de 2012 — Protección de Datos Personales (Habeas Data)

> Cubierto en parte en [`SECURITY.md` § PII y Habeas Data](./SECURITY.md#pii-y-habeas-data-ley-1581). Este documento agrega el cumplimiento operativo.

### Obligaciones del Responsable del Tratamiento (nosotros)

1. **Política de Tratamiento de Datos Personales** publicada y vinculante.
2. **Aviso de Privacidad** mostrado en el primer contacto (registro, formulario de contacto, checkout).
3. **Autorización expresa** del titular antes de recolectar datos. La autorización debe ser:
   - **Previa** (antes del tratamiento).
   - **Expresa** (no inferida).
   - **Informada** (que se le diga al titular qué se hará con sus datos).
   - **Verificable** (registrada — guardamos `Consent(customerId, scope, version, acceptedAt, ip)` en DB).
4. **Atender peticiones, quejas y reclamos (PQR)** en máximo **15 días hábiles**.
5. **Reportar incidentes de seguridad** a la SIC (Superintendencia de Industria y Comercio) si comprometen datos personales (notificación dentro de 15 días hábiles del descubrimiento).
6. **Registro Nacional de Bases de Datos (RNBD)** ante la SIC: obligatorio si:
   - Es persona jurídica con activos > 100.000 UVT, **o**
   - Procesa datos sensibles a gran escala.
   - Para nosotros (al inicio): probablemente **no obligatorio**, pero confirmar con abogado.

### Implementación técnica

#### Tabla `Consent`

```prisma
model Consent {
  id          String   @id @default(cuid())
  customerId  String?
  email       String?  // Para consentimientos pre-registro (newsletter, cookies)
  scope       String   // "data-processing", "marketing", "cookies-marketing", etc.
  version     String   // Versión del documento aceptado: "v1.2-2026-05-09"
  acceptedAt  DateTime @default(now())
  ip          String?
  userAgent   String?
  revoked     Boolean  @default(false)
  revokedAt   DateTime?

  @@index([customerId])
  @@index([email])
}
```

#### Endpoints

- `POST /api/consent` — registrar nuevo consentimiento.
- `DELETE /api/consent/:id` — revocar.
- `GET /api/me/consents` — listar los míos.
- `GET /api/me/data-export` — exportación completa (Habeas Data art. 8 lit. b).
- `DELETE /api/me/account` — eliminación con soft delete + hard delete a 30 días.

#### Página `/legal/habeas-data`

- Formulario para PQR formales.
- Email destino: `habeas-data@lucamsshop.co`.
- SLA: respuesta inicial 5 días hábiles, resolución 15 días hábiles.

### Aviso de Privacidad — texto base

> Texto inicial sugerido. **Revisar con abogado antes del lanzamiento.**

```
Lucams_shop S.A.S. (NIT: pendiente), responsable del tratamiento de tus datos
personales, recolecta:
- Identificación: nombre, email, teléfono.
- Contacto: dirección de envío.
- Pago: información mínima de la transacción (Wompi maneja los datos sensibles).
- Comportamiento: historial de pedidos, productos vistos, reseñas.
- Imágenes: fotos que subes al estudio de personalización.

Finalidades:
- Procesar tu pedido y enviarlo.
- Comunicaciones transaccionales.
- Marketing si das consentimiento explícito (opcional).
- Mejorar el servicio (analítica agregada y anonimizada).

Tus derechos:
- Conocer, actualizar y rectificar tus datos.
- Solicitar prueba de la autorización otorgada.
- Ser informado del uso que se da a tus datos.
- Presentar quejas ante la SIC por infracciones a la Ley 1581.
- Revocar la autorización y/o solicitar la supresión de tus datos.
- Acceder gratuitamente a tus datos.

Contacto: habeas-data@lucamsshop.co
```

### Derecho de supresión — implementación self-service (2026-07-10)

Además del canal manual (`habeas-data@lucamsshop.co`, respuesta en 15 días hábiles), el cliente puede
ejercer el **derecho de supresión (art. 8 lit. e)** por sí mismo en `/mi-cuenta/seguridad → Eliminar mi
cuenta` (`features/account/delete-service.ts`). El enfoque es **anonimizar + soft-delete**, NO borrado
físico, para conciliar la supresión con la **retención fiscal de la DIAN**:

| Dato                                              | Acción al eliminar                                                                                             | Motivo                                                                            |
| ------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| Customer (nombre, teléfono, documento, email)     | Scrub: nombre/tel/documento→null, email→placeholder único, `supabaseUserId`→placeholder, `deletedAt`           | Supresión de PII                                                                  |
| Auth user (Supabase)                              | `admin.deleteUser`; si falla → **baneo** (`ban_duration`) como fallback                                        | Cortar acceso garantizado (no basta el best-effort)                               |
| Direcciones                                       | Scrub de columnas PII (nombre/dirección/teléfono) + soft-delete                                                | Contienen PII                                                                     |
| Reseñas                                           | `customerId`→null + `authorName`→"Cliente Lucams"                                                              | Conservar contenido público sin PII                                               |
| **Fotos del Estudio** (DesignAsset, Design)       | **Borran archivos** de Storage (customer-uploads / design-previews / production-assets) + filas/URLs limpiadas | La PII más sensible (rostros); ninguna retención lo justifica                     |
| Tickets de soporte (SupportTicket)                | Desvincular + scrub (email/name/ip/userAgent/message)                                                          | Texto libre con PII                                                               |
| Snapshot de envío en órdenes                      | Scrub PII (nombre/tel/dirección) en órdenes YA finalizadas                                                     | Las en curso conservan la dirección por finalidad legítima (completar la entrega) |
| Logs (RecommendationLog, LoyaltyTxn, CouponUsage) | `customerId`→null                                                                                              | Cortar el vínculo de perfilado con el titular                                     |
| **Pedidos / facturas**                            | **SE CONSERVAN** (anonimizados)                                                                                | **Retención fiscal DIAN** (facturación electrónica) prima sobre supresión         |
| **Consentimientos**                               | **SE CONSERVAN**                                                                                               | Prueba de cumplimiento Ley 1581                                                   |

**Confirmación fuerte:** escribir "ELIMINAR" + re-autenticación con contraseña + rate-limit
(`ownerKey('delete-account')`, 5/15min). El alcance de supresión es **exhaustivo** (verificado por revisión
adversarial 2026-07-10, hallazgos #1–#6): antes solo tocaba Customer/Address/Review y dejaba PII sensible
(fotos, tickets, snapshots) atrás. La política de conservación fiscal vs. supresión queda explícita.

### Retención por temporalidad — purga de fotos anónimas (art. 4 lit. f) (2026-07-17)

El derecho de supresión (arriba) es **a pedido del titular** y filtra por `customerId` → NO alcanza a
quien **nunca creó cuenta**. El Estudio permite personalizar de forma **anónima** (sin login): esas fotos
crudas (a veces rostros) quedan en `customer-uploads` ligadas a un diseño DRAFT con `customerId=null`. Sin
una política de temporalidad se acumularían **indefinidamente** sin finalidad vigente — contrario al
principio de **temporalidad/minimización (Ley 1581, art. 4 lit. f)**: los datos se conservan solo el tiempo
necesario para la finalidad (armar el diseño y comprarlo), no para siempre.

**Política:** un diseño **DRAFT anónimo abandonado** (sin actividad ≥ **30 días** y sin carrito ni pedido
vivo) se **purga automáticamente**: se borran sus fotos de `customer-uploads` + los previews/artefactos +
las filas `DesignAsset`/`Design`. Igual para los `DesignAsset` anónimos **huérfanos** (subidos y nunca
usados). Implementación: `features/personalization/retention-service.ts` (`purgeAbandonedAnonymousDesigns`)
vía el cron `/api/cron/purge-anon-designs` (agendado por `pg_cron`, ver [OPERATIONS.md](OPERATIONS.md)).

**Qué NO toca:** diseños de clientes **logueados** (los rige el ciclo de vida de la cuenta / supresión a
pedido), ni `READY`/`USED_IN_ORDER`/`ARCHIVED`, ni nada referenciado por un carrito o pedido (esos tienen
finalidad vigente). El borrado de bytes es **best-effort con reintento**: si la remoción del bucket falla,
las filas NO se borran → el siguiente ciclo reintenta (nunca deja bytes sin registro en DB).

---

## Ley 1480 de 2011 — Estatuto del Consumidor

> Verificado contra [Ley 1480 — Función Pública](https://www.funcionpublica.gov.co/eva/gestornormativo/norma.php?i=44306) y [Estatuto del Consumidor art. 47 — leyes.co](https://leyes.co/el_estatuto_del_consumidor/47.htm) a 2026-05-09.

### Obligaciones de información (art. 23 y siguientes)

Antes de la compra, el sitio debe mostrar:

1. **Identidad del proveedor** (razón social, NIT, dirección física, contacto).
2. **Características del producto** (medidas, materiales, peso, advertencias).
3. **Precio total** incluyendo IVA y costo de envío.
4. **Métodos de pago disponibles.**
5. **Tiempo de entrega.**
6. **Derecho de retracto** (si aplica) y procedimiento para ejercerlo.
7. **Política de garantía** y condiciones de devolución.
8. **Términos y condiciones** del contrato.

### Derecho de retracto (art. 47) — verificado

> **5 días hábiles** desde la entrega del bien para retractarse sin justificación (Ley 1480 art. 47, sin cambios). El reembolso para comercio electrónico debe hacerse en máximo **15 días calendario** contados desde que el consumidor ejerce el retracto — plazo introducido por la **Ley 2439 de 2024** (art. 3, modifica el art. 47), que lo bajó de los 30 días hábiles anteriores. Verificado el 2026-06-27 contra [Holland & Knight — Ley 2439 de 2024](https://www.hklaw.com/en/insights/publications/2025/01/ley-2439-de-2024-modificaciones-al-estatuto-del-consumidor-en-colombia) + Gestor Normativo Función Pública.

#### Excepciones legales (las relevantes para nosotros)

> Cita textual del art. 47: _"contratos de suministro de bienes confeccionados conforme a las especificaciones del consumidor o claramente personalizados"_ están **exceptuados** del derecho de retracto.

**Implicación crítica para Lucams_shop:**

| Producto                                                                    | Aplica retracto                                           |
| --------------------------------------------------------------------------- | --------------------------------------------------------- |
| Imanes del catálogo estándar (no personalizados)                            | ✅ Sí — 5 días hábiles                                    |
| Imanes del Estudio de Personalización (con foto del cliente o texto custom) | ❌ **No** — exceptuado por personalización                |
| Bundles del catálogo estándar                                               | ✅ Sí                                                     |
| Bundles que incluyen al menos un imán personalizado                         | ❌ No (preferimos cubrir todo el bundle por consistencia) |

> **Decisión operativa:** la exclusión por personalización aplica solo si el producto fue **claramente personalizado** (tiene foto/texto custom del cliente). Productos del catálogo "estándar" (imanes pre-diseñados sin personalización del cliente) **sí tienen retracto**. Esto debe quedar claro en la página de cada producto.

#### Implementación técnica

```prisma
model Product {
  // ...
  isPersonalizable      Boolean  @default(false)
  retractApplies        Boolean  @default(true)   // Default: aplica. Cambiar a false al confirmar personalización.
  // ...
}

model OrderItem {
  // ...
  customDesign          Json?
  retractEligible       Boolean  // Calculado al checkout: true si product.retractApplies && customDesign IS NULL
}
```

#### Flujo de retracto

1. Cliente solicita retracto vía `/cuenta/orden/:id/retractar` o email a `retracto@lucamsshop.co`.
2. Validar elegibilidad:
   - ¿Está dentro de los 5 días hábiles desde la entrega?
   - ¿El item tiene `retractEligible = true`?
3. Si elegible:
   - Crear `RetractRequest(orderItemId, requestedAt, reason?, status='PENDING')`.
   - Enviar email al cliente con instrucciones de devolución (5 días hábiles desde la confirmación).
4. Cliente devuelve el producto vía Coordinadora (a costo del proveedor — nosotros).
5. Recepción → `RetractRequest.status='RECEIVED'`.
6. Reembolso vía Wompi (`POST /v1/transactions/:id/void` o equivalente) o transferencia bancaria si COD.
   - Plazo legal: 15 días calendario desde la solicitud.
7. `RetractRequest.status='REFUNDED'`, `OrderItem.status='RETURNED'`.

#### Schema Prisma

```prisma
enum RetractStatus {
  PENDING
  APPROVED
  RECEIVED
  REFUNDED
  REJECTED
}

model RetractRequest {
  id            String        @id @default(cuid())
  orderItemId   String        @unique
  orderItem     OrderItem     @relation(fields: [orderItemId], references: [id])
  requestedAt   DateTime      @default(now())
  receivedAt    DateTime?
  refundedAt    DateTime?
  status        RetractStatus @default(PENDING)
  reason        String?       // Texto libre del cliente
  rejectionNote String?       // Si REJECTED por motivo legal
  refundAmount  Int           // En centavos COP
  refundMethod  String        // "WOMPI_VOID" | "BANK_TRANSFER"
}
```

### Garantía legal (art. 7-15)

- **Plazo mínimo de garantía:** 1 año en productos con vida útil normal.
- **Garantía cubre:** defectos de fabricación, no daño por uso indebido.
- **Reparación, sustitución o reembolso** a elección del consumidor si el bien presenta defecto en garantía.

#### Implementación

- Política de garantía publicada en `/legal/garantias`.
- Endpoint `/cuenta/orden/:id/garantia` para solicitar.
- Tabla `WarrantyClaim` similar a `RetractRequest`.

### Términos y Condiciones — secciones obligatorias

1. Identificación del proveedor.
2. Definiciones (consumidor, productor, expendedor, etc.).
3. Procedimiento de compra paso a paso.
4. Métodos de pago.
5. Tiempo y costo de envío.
6. Derecho de retracto (con texto del art. 47 y excepciones aplicables).
7. Política de garantías.
8. Política de reversión de pago (art. 51).
9. Procedimiento de PQR.
10. Jurisdicción aplicable y mecanismos de solución de controversias.

> Plantilla base se redacta antes de Fase 7. Revisión legal recomendada (ADR-020).

### Reversión del pago (art. 51)

> Si el consumidor reporta a su banco que la compra fue fraudulenta o el producto no llegó, el banco puede revertir el pago. **Tenemos 21 días calendario para responder y demostrar lo contrario.**

- Implementación: webhook de Wompi nos avisa de chargebacks → email automático al operador → tabla `Chargeback` para tracking.

---

## Facturación electrónica DIAN (Resolución 165 de 2023)

> Verificado contra [DIAN — Obligados a Facturar](https://www.dian.gov.co/impuestos/sociedades/Paginas/obligadosfacturar.aspx) y [Resolución 000202 de 2025](https://www.dian.gov.co/normatividad/Normatividad/Resoluci%C3%B3n%20000202%20de%2031-03-2025.pdf) a 2026-05-09.

### Obligación

Toda persona natural o jurídica responsable de IVA en Colombia debe facturar electrónicamente. Sanciones:

- Cierre del establecimiento por **3 días**, **o**
- Multa equivalente al **1% de los ingresos operacionales del año anterior**, hasta tope de **950 UVT**.

### Modalidades de cumplimiento

| Modalidad                                 | Cuándo                                                                      |
| ----------------------------------------- | --------------------------------------------------------------------------- |
| **Software gratuito DIAN**                | Hasta 2.000 facturas/año y bajo cierto umbral de ingresos                   |
| **Proveedor tecnológico autorizado** (PT) | Más de 80 proveedores habilitados; integran con nuestra app vía API         |
| **Software propio habilitado**            | Solo si el negocio justifica el desarrollo + habilitación (no nuestro caso) |

### Decisión operativa para Lucams_shop

**Usar un proveedor tecnológico autorizado** (no software propio, no gratuito DIAN — el gratuito no se integra bien con un e-commerce). Candidatos a evaluar antes de Fase 7:

| Proveedor       | Notas                                                                        | Verificar             |
| --------------- | ---------------------------------------------------------------------------- | --------------------- |
| **Alegra**      | API + dashboard. Plan más bajo ~$25-50 USD/mes. Integración Node disponible. | `alegra.com/colombia` |
| **Siigo**       | Líder local. API. Costo similar.                                             | `siigo.com`           |
| **Facture**     | API-first. Más técnico.                                                      | `facture.co`          |
| **DIAN gratis** | Solo para volumen bajo, sin API real. Descartado.                            | —                     |

> **ADR pendiente (cuando se elija):** ADR-025 — proveedor de facturación electrónica.

### Flujo de emisión

```
Order → PAID → enqueue("invoice_emit", { orderId })
            → Edge Function consumer:
              1. Construye payload del proveedor (cliente, items, IVA).
              2. POST al proveedor (con retry + circuit breaker).
              3. Recibe CUFE (Código Único de Factura Electrónica) y URL del PDF.
              4. Guarda Invoice(orderId, cufe, pdfUrl, xmlUrl, status='ISSUED').
              5. Email al cliente con factura adjunta.
```

### Schema

```prisma
model Invoice {
  id              String   @id @default(cuid())
  orderId         String   @unique
  order           Order    @relation(fields: [orderId], references: [id])
  number          String   @unique  // Numeración aprobada por DIAN
  cufe            String   @unique  // Código Único de Factura Electrónica
  pdfUrl          String
  xmlUrl          String?
  totalAmount     Int      // centavos COP
  iva             Int
  status          String   // 'ISSUED' | 'CANCELLED' | 'REJECTED_BY_DIAN'
  providerName    String   // 'alegra' | 'siigo' | etc.
  providerEmittedAt DateTime
  createdAt       DateTime @default(now())
}
```

### Numeración

- DIAN exige **resolución de numeración** vigente. Solicitarla con anticipación.
- El proveedor tecnológico maneja la numeración consecutiva y el envío a DIAN.

### Notas de crédito

- Reembolsos parciales o totales requieren **nota de crédito electrónica** (también vía proveedor).
- Schema `CreditNote(invoiceId, amount, reason, cufe, ...)` análogo a `Invoice`.

### Verificaciones pendientes (mandato #9)

Antes de elegir proveedor:

- [ ] Confirmar costo mensual del plan más básico de cada candidato.
- [ ] Verificar disponibilidad de API REST y SDK Node.
- [ ] Confirmar soporte de notas de crédito vía API.
- [ ] Confirmar que el proveedor maneja el envío a DIAN (no nosotros).

### Addendum 2026-05-15 — Umbral persona natural NO responsable de IVA + control proactivo en admin

> Decisión Lucy en `docs/PLAN_CATALOG_V2.md` 1.8 (2026-05-15).

Persona natural NO responsable de IVA en Colombia **NO está obligada** a emitir factura electrónica si sus ingresos brutos anuales del año anterior están por debajo de **3.500 UVT** ([pendiente verificación monto UVT 2026]).

Por debajo del umbral, puede emitir:

- **Documento equivalente POS** (sistema autorizado).
- **Cuenta de cobro** (válida tributariamente, no es factura).

Una vez cruzado el umbral (o si Lucy decide ser facturador electrónico voluntariamente para acceso B2B corporativo): registro como facturador electrónico ante DIAN, contratar proveedor tecnológico (Alegra / Siigo / Facture), implementar CUFE, XML, validación previa.

**Impacto en copy público**: el banner B2B en `/productos/publicitarios` y la página `/mayorista` NO deben prometer "factura electrónica DIAN obligatoria" hasta que Lucams esté efectivamente en régimen. Texto correcto: "documentación tributaria (cuenta de cobro o factura electrónica según corresponda)".

**Control proactivo en admin** (a implementar en Área 8 + Fase 4 Orders):

- 6 settings nuevos en categoría `FACTURACION` de `SiteSetting`:
  - `DIAN_FACTURADOR_ELECTRONICO` (boolean)
  - `DIAN_REGIMEN` (text)
  - `DIAN_UMBRAL_UVT_ANUAL` (number, default 3500)
  - `DIAN_VALOR_UVT_COP` (number)
  - `DIAN_INGRESOS_ANUALES_REGISTRADOS` (number)
  - `DIAN_PROVEEDOR_FACTURACION` (text)
- Card "Estado tributario DIAN" en `/admin/dashboard` con 4 niveles (verde < 60% / amarillo 60-80% / naranja 80-100% / rojo > 100%).
- Job `pg_cron` mensual día 1 a las 8am COT manda email a `r.julliethhr@gmail.com` cuando ingresos ≥ 60% del umbral.
- Cuando exista `Order` con flujo PAID en Fase 4, `DIAN_INGRESOS_ANUALES_REGISTRADOS` se auto-calcula sumando `Order.total` del año fiscal. Mientras tanto: actualización manual mensual desde admin.

**Acción humana pendiente**: Lucy define con su contador cuándo activar facturación electrónica + a qué proveedor migrar (ADR-025 pendiente).

---

## IVA y retenciones

### IVA

- **Tarifa general 19%** sobre los productos. Verificable en panel DIAN o con contador.
- **Productos exentos / excluidos:** revisar art. 424 y 477 del Estatuto Tributario. Los imanes magnéticos están **gravados a tarifa general** (no exentos).
- **Cálculo en checkout:** `iva = round(subtotal * 0.19)`. Mostrar desglose en el resumen.

### Retenciones (Régimen Común)

Si Lucams_shop opera como Régimen Común y vende a clientes B2B (Fase 6 mayorista), aplican:

- **Retención en la fuente** (1.5% sobre la venta antes de IVA, si el cliente es agente retenedor).
- **Retención de IVA (RetIVA)** (15% del IVA, si aplica).
- **Retención de ICA** (varía por municipio, ~0.4% – 1%).

Estos los calcula y aplica el **comprador** (cliente B2B), no nosotros — nosotros emitimos la factura completa y el cliente nos paga el neto descontado las retenciones, y nos da los certificados de retención.

> En B2C (consumidor final no agente retenedor), **no aplican retenciones**. El cliente paga el total con IVA.

### Implementación

```ts
// lib/tax.ts
export function calculateTax(subtotalCents: number): { iva: number; total: number } {
  const iva = Math.round(subtotalCents * 0.19);
  return { iva, total: subtotalCents + iva };
}
```

> Para B2B la lógica se complica (retenciones aplicadas al pago, no al precio); se diseña en detalle en Fase 6.

---

## Documentos legales requeridos en el sitio

| Documento                                                   | URL                                    | Origen                                   | Verificación                   |
| ----------------------------------------------------------- | -------------------------------------- | ---------------------------------------- | ------------------------------ |
| **Política de Privacidad** (Habeas Data)                    | `/legal/privacidad`                    | Plantilla CO + revisión legal            | Versión y fecha visibles       |
| **Términos y Condiciones**                                  | `/legal/terminos`                      | Idem                                     | Idem                           |
| **Política de Cookies**                                     | `/legal/cookies`                       | Idem                                     | Idem                           |
| **Política de Devoluciones y Retracto**                     | `/legal/devoluciones`                  | Idem                                     | Idem                           |
| **Política de Garantía**                                    | `/legal/garantias`                     | Idem                                     | Idem                           |
| **Política de Tratamiento de Datos Personales**             | `/legal/tratamiento-datos`             | Plantilla SIC + revisión legal           | Idem                           |
| **Aviso de Privacidad**                                     | Modal al primer contacto + footer link | Idem                                     | Idem                           |
| **Habeas Data — formulario PQR**                            | `/legal/habeas-data`                   | Form + email `habeas-data@lucamsshop.co` | —                              |
| **Lista de subprocesadores**                                | `/legal/subprocesadores`               | Generada de `docs/COMPLIANCE.md`         | Actualización al cambiar stack |
| **Política de seguridad / divulgación de vulnerabilidades** | `/legal/security`                      | Texto interno                            | —                              |

> Cada documento tiene **versionado**: header `Versión X.Y — vigente desde YYYY-MM-DD`. Cambios mayores requieren re-aceptación del usuario activo.

---

## Cookie consent (alineación GDPR voluntaria)

Aunque la Ley 1581 colombiana no exige banner de cookies tan estricto como GDPR, **alineamos al estándar más alto** para futura expansión a UE/Latam y para confianza del usuario.

### Categorías

| Categoría                                                            | Default      | Bloqueable por usuario                 |
| -------------------------------------------------------------------- | ------------ | -------------------------------------- |
| **Estrictamente necesarias**                                         | ON           | ❌ No (sin estas el sitio no funciona) |
| **Funcionales** (idioma, dark mode, último carrito visto)            | ON           | ✅ Sí                                  |
| **Analíticas** (Vercel Analytics si se activa, conteos agregados)    | OFF (opt-in) | ✅ Sí                                  |
| **Marketing** (remarketing, pixels de Facebook/Google si se activan) | OFF (opt-in) | ✅ Sí                                  |

### Implementación

- Banner en primer visit (con detección por cookie `__lc_consent`).
- Tres opciones: "Solo necesarias", "Personalizar", "Aceptar todas".
- Persistir consentimiento en `Consent` (con `scope='cookies-marketing'` etc.).
- Versión del banner en cookie → cambio de versión = re-consent.
- Página `/legal/cookies` con detalle y revocación granular.

### Cookies que usamos (catálogo a mantener actualizado)

| Cookie             | Propósito                            | Tipo      | TTL     |
| ------------------ | ------------------------------------ | --------- | ------- |
| `sb-access-token`  | Supabase Auth                        | Necesaria | 1 h     |
| `sb-refresh-token` | Supabase Auth                        | Necesaria | 30 días |
| `__rid`            | Request ID correlation               | Necesaria | sesión  |
| `__lc_consent`     | Estado del consentimiento de cookies | Necesaria | 1 año   |
| `__lc_session`     | Cart sessionId (anónimo)             | Necesaria | 90 días |
| `__lc_locale`      | Idioma elegido                       | Funcional | 1 año   |
| `__lc_theme`       | Modo oscuro/claro                    | Funcional | 1 año   |

---

## Subprocessor list y transferencias internacionales

> Bajo Ley 1581 (art. 26 Decreto 1377), debemos informar al titular si transferimos sus datos a terceros, especialmente fuera de Colombia.

### Subprocesadores activos

| Servicio                                        | Propósito                          | País                               | Datos transferidos                                           | Base legal                              |
| ----------------------------------------------- | ---------------------------------- | ---------------------------------- | ------------------------------------------------------------ | --------------------------------------- |
| **Supabase**                                    | DB, Auth, Storage                  | EE.UU. (AWS us-east-1 o sa-east-1) | Todos los datos del cliente (RLS aplicado)                   | Consentimiento + ejecución del contrato |
| **Vercel**                                      | Hosting de la app                  | EE.UU. (edge global)               | Datos en tránsito durante la sesión + logs                   | Idem                                    |
| **Wompi**                                       | Procesamiento de pagos             | Colombia                           | Datos de la transacción + datos del cliente para anti-fraude | Necesidad contractual                   |
| **Venndelo / Coordinadora**                     | Logística                          | Colombia                           | Nombre, dirección, teléfono                                  | Necesidad contractual                   |
| **Resend**                                      | Email transaccional                | EE.UU.                             | Email + contenido del mensaje                                | Necesidad contractual                   |
| **Anthropic**                                   | Asistente IA del estudio           | EE.UU.                             | Prompt del estudio (sin PII directa)                         | Consentimiento explícito                |
| **Cloudflare**                                  | DNS + CDN + Turnstile + R2 backups | Global                             | Datos en tránsito + IP + backups encriptados                 | Idem                                    |
| **Mi.com.co**                                   | Registrador de dominio             | Colombia                           | Datos del registrante (operador, no cliente)                 | Necesidad contractual                   |
| **GitHub**                                      | Repositorio de código              | EE.UU.                             | No procesa datos de clientes                                 | —                                       |
| **Proveedor DIAN** (Alegra/Siigo/Facture — TBD) | Facturación electrónica            | Colombia                           | Datos de la factura (NIT/CC, nombre, items)                  | Obligación legal                        |

### Política

- Lista publicada en `/legal/subprocesadores`.
- **Notificación de cambio:** 30 días antes de agregar/cambiar un subprocesador, email a clientes activos.
- Al firmar Pro con cualquiera, **revisar DPA (Data Processing Agreement)** ofrecido por el vendor — la mayoría lo ofrecen estándar.

### Transferencias internacionales

> Ley 1581 art. 26: requieren autorización del titular **o** que el país receptor tenga nivel adecuado de protección **o** se firmen contratos modelo.

- EE.UU.: no tiene nivel adecuado declarado por la SIC.
- **Estrategia:** consentimiento explícito en el aviso de privacidad + DPA con cada proveedor + documentación de medidas técnicas (encriptación en tránsito y reposo).

---

## Calendario de cumplimiento

| Hito                                                        | Cuándo                     | Bloqueante      |
| ----------------------------------------------------------- | -------------------------- | --------------- |
| Constituir el negocio (RUES + Cámara de Comercio)           | Antes de Fase 7            | ✅ Sí           |
| Obtener RUT con responsabilidad 42 (facturador electrónico) | Antes de Fase 7            | ✅ Sí           |
| Solicitar resolución de numeración a DIAN                   | Antes de Fase 7            | ✅ Sí           |
| Firmar contrato con proveedor de facturación electrónica    | Antes de Fase 7            | ✅ Sí           |
| Revisión legal de los 9 documentos del sitio                | Antes de Fase 7            | ✅ Sí (ADR-020) |
| Política de privacidad y T&C publicados                     | Antes de Fase 7            | ✅ Sí           |
| Banner de consentimiento de cookies funcional               | Antes de Fase 7            | ✅ Sí           |
| Habilitación de proveedor DIAN (si software propio)         | N/A (usamos PT autorizado) | —               |
| Registro Nacional de Bases de Datos (RNBD) si aplica        | Confirmar con abogado      | Posible         |
| Email `habeas-data@lucamsshop.co` operativo + SLA de PQR    | Lanzamiento                | ✅ Sí           |
| Email `retracto@lucamsshop.co` operativo                    | Lanzamiento                | ✅ Sí           |
| Tabla `Consent` registrando cada autorización               | Fase 1                     | ✅ Sí           |
| Endpoint `/api/me/data-export`                              | Fase 1                     | ✅ Sí           |
| Endpoint `DELETE /api/me/account` con flujo 30 días         | Fase 1                     | ✅ Sí           |
| Cron `pg_cron` de hard delete tras 30 días                  | Fase 1                     | ✅ Sí           |
| Flujo de retracto end-to-end                                | Fase 4                     | ✅ Sí           |
| Flujo de garantía                                           | Fase 6                     | ✅ Sí           |
| Reporte de incidente a SIC ante brecha (procedimiento)      | Documentar en Fase 7       | ✅ Sí           |
