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
   - **Verificable** (registrada — guardamos `Consent(customerId?, email?, phone?, scope, accepted, version, acceptedAt, ipAddress, userAgent)` en DB; `phone` ancla consentimientos de titulares sin email, ej. cotización por WhatsApp).
4. **Atender peticiones, quejas y reclamos (PQR)** en máximo **15 días hábiles**.
5. **Reportar incidentes de seguridad** a la SIC (Superintendencia de Industria y Comercio) si comprometen datos personales (notificación dentro de 15 días hábiles del descubrimiento).
6. **Registro Nacional de Bases de Datos (RNBD)** ante la SIC: según el Decreto 090 de 2018 (modifica el art. 2.2.2.26.1.2 del Decreto 1074 de 2015), la obligación aplica a **sociedades comerciales y ESAL con activos ≥ 100.000 UVT** (2026: UVT $52.374 → ≈ $5.237.400.000). Una **persona natural no está en el ámbito obligatorio** (puede registrarse voluntariamente). _(Verificado 2026-09-04 contra el Decreto 090/2018: el criterio "procesa datos sensibles a gran escala" que figuraba aquí no existe en la norma — eliminado. Confirmar la decisión de no registrar con el abogado.)_

### Implementación técnica

#### Tabla `Consent`

Modelo real (`packages/db/prisma/schema.prisma`): append-only — revocar crea una fila nueva con `accepted=false` y `revokesId` apuntando al consentimiento revocado.

```prisma
enum ConsentScope {
  COOKIES_NECESSARY // siempre on
  COOKIES_FUNCTIONAL
  COOKIES_ANALYTICS
  COOKIES_MARKETING
  NEWSLETTER
  BACK_IN_STOCK // "avísame cuando vuelva" — notificación pedida por el titular
  MARKETING_PROFILING // perfilamiento (segmentación, recomendaciones)
  HABEAS_DATA // autorización general tratamiento de datos personales
}

model Consent {
  id         String       @id @default(cuid())
  customerId String?      // null para guests (newsletter, cookies, cotización)
  email      String?      // ancla para consentimientos sin cuenta
  phone      String?      // ancla alterna (cotización por WhatsApp, móvil a 10 dígitos)
  scope      ConsentScope
  accepted   Boolean
  version    String       // versión del aviso de privacidad aceptado (setting PRIVACY_POLICY_VERSION)
  ipAddress  String?
  userAgent  String?
  revokesId  String?      // si revoca uno previo, apunta a su id
  acceptedAt DateTime     @default(now())

  @@index([customerId, scope])
  @@index([email, scope])
  @@index([phone, scope])
  @@index([scope, acceptedAt])
}
```

#### Registro y ejercicio de derechos

No hay endpoints REST públicos de consentimiento: el registro lo hacen **Server Actions** en `apps/web/features/consent/` (banner de cookies, newsletter, cotización por WhatsApp, checkout, back-in-stock — cada una escribe sus scopes con IP/UA).

- **Consentimiento de cookies:** `persistCookieConsentAction` (una fila por scope, ver § Cookie consent).
- **Supresión de cuenta (art. 8 lit. e):** self-service en `/mi-cuenta/seguridad → Eliminar mi cuenta` (ver § Derecho de supresión abajo).
- **Exportación, rectificación formal y PQR:** canal manual `habeas-data@lucamsshop.com` (un endpoint self-service de exportación queda como mejora pendiente — no existe hoy).

#### Página `/legal/habeas-data`

- Publica la Política de Tratamiento (texto en `packages/db/legal-content/legal.habeas-data.md`) y los canales para PQR.
- Canal formal: email `habeas-data@lucamsshop.com` (además del formulario general de `/contacto`, que crea `SupportTicket`).
- SLA: respuesta inicial 5 días hábiles, resolución 15 días hábiles.

### Aviso de Privacidad — texto base

> Texto inicial sugerido. **Revisar con abogado antes del lanzamiento.**

> **Actualizado 2026-07-19 (ADR-072):** la figura jurídica es **persona natural** (Lucy Jullieth Hurtado Rodríguez, Bogotá D.C.), NO S.A.S. El texto legal publicado vive en `packages/db/legal-content/*.md` + los CmsBlock `legal.*`. La cédula y la dirección exacta NO se publican (se dan a solicitud — Opción 1). El texto base histórico de abajo queda solo como referencia de estructura.

```
Lucy Jullieth Hurtado Rodríguez (persona natural), titular de la marca Lucams_shop,
con domicilio en Bogotá D.C., responsable del tratamiento de tus datos personales,
recolecta:
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

Contacto: habeas-data@lucamsshop.com
```

### Derecho de supresión — implementación self-service (2026-07-10)

Además del canal manual (`habeas-data@lucamsshop.com`, respuesta en 15 días hábiles), el cliente puede
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

### Retención de logs de eventos con PII (2026-08-29)

Mismo principio de temporalidad aplicado a los logs que el sistema acumula solo
(`features/observability/event-log-retention.ts`, vía el cron `/api/cron/purge-event-logs`):

| Tabla          | Contenido con PII                                                             | Retención | Criterio de purga                                            |
| -------------- | ----------------------------------------------------------------------------- | --------- | ------------------------------------------------------------ |
| `EmailEvent`   | `to` = email del cliente                                                      | 180 días  | `createdAt`                                                  |
| `WebhookEvent` | `payload` crudo (Wompi trae `customer_email`)                                 | 180 días  | `createdAt` y solo si `processedAt` (no romper idempotencia) |
| `ErrorLog`     | message+stack de errores server (PII ya redactada por `scrubPii` al capturar) | 90 días   | `createdAt`                                                  |
| `ErrorReport`  | reportes de error del cliente (`/api/log-error`)                              | 90 días   | `lastSeenAt` (un error que sigue ocurriendo NO se borra)     |

Las purgas son `deleteMany` con cutoff y quedan logueadas (`retention.purge_event_logs`).

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

La elegibilidad se calcula **al vuelo** (no hay flag persistido por item): un `OrderItem` es
personalizado —y por tanto exceptuado— si tiene `customDesign` (legacy) o `designId`
(`isItemPersonalized` en `apps/web/features/retract/service.ts`). El resto de condiciones:
orden `DELIVERED`, dentro de la ventana de 5 días hábiles (en calendario colombiano COT) y sin
solicitud previa. La identidad es obligatoria: toda operación del servicio exige `customerId`
(tipo estricto, auditoría D-3 — un guest nunca coincide, sin hueco IDOR).

#### Flujo de retracto

1. Cliente solicita retracto desde el detalle del pedido (`/mi-cuenta/pedidos/[number]`, control
   por item) o email a `retracto@lucamsshop.com`.
2. Validar elegibilidad:
   - ¿Está dentro de los 5 días hábiles desde la entrega?
   - ¿El item NO está personalizado (`isItemPersonalized = false`)?
3. Si elegible:
   - Crear `RetractRequest(orderItemId, reason?, status='PENDING', refundAmount=<línea del item>)`.
   - El admin aprueba en `/admin/retractos` → email al cliente con instrucciones de devolución.
4. Cliente devuelve el producto vía Coordinadora (a costo del proveedor — nosotros).
5. Recepción → `RetractRequest.status='RECEIVED'`.
6. Reembolso **manual** vía panel Wompi o transferencia bancaria si COD; se registra
   `refundMethod` (`"WOMPI_VOID" | "BANK_TRANSFER"`) + `refundedAt` y se avisa al cliente por email.
   - Plazo legal: 15 días calendario desde la solicitud.
   - No restaura stock automáticamente ni cambia el estado de la orden (la entrega ya ocurrió).
7. `RetractRequest.status='REFUNDED'`.

#### Schema Prisma

```prisma
enum RetractStatus {
  PENDING // solicitado, pendiente de aprobar
  APPROVED // aprobado, esperando que el cliente devuelva el producto
  RECEIVED // producto recibido de vuelta
  REFUNDED // reembolso emitido (dinero Wompi manual)
  REJECTED // rechazado (no elegible / fuera de ventana)
}

model RetractRequest {
  id            String        @id @default(cuid())
  orderItemId   String        @unique
  orderItem     OrderItem     @relation(fields: [orderItemId], references: [id], onDelete: Cascade)
  status        RetractStatus @default(PENDING)
  reason        String? // texto libre del cliente
  rejectionNote String? // motivo si REJECTED
  refundAmount  Int // línea del item al solicitar (COP centavos)
  refundMethod  String? // "WOMPI_VOID" | "BANK_TRANSFER" — al reembolsar
  requestedAt   DateTime      @default(now())
  approvedAt    DateTime?
  receivedAt    DateTime?
  refundedAt    DateTime?
  processedBy   String? // AdminUser.id que gestionó la solicitud
}
```

### Garantía legal (art. 7-15)

- **Plazo mínimo de garantía:** 1 año en productos con vida útil normal.
- **Garantía cubre:** defectos de fabricación, no daño por uso indebido.
- **Reparación, sustitución o reembolso** a elección del consumidor si el bien presenta defecto en garantía.

#### Implementación

- Política de garantía publicada en `/legal/garantias`.
- Solicitud desde el detalle del pedido (`/mi-cuenta/pedidos/[number]`, control por item) y gestión admin en `/admin/garantias`.
- Tabla `WarrantyClaim` similar a `RetractRequest`.

### Reseñas y moderación (publicidad no engañosa)

Publicar reseñas ficticias sería publicidad engañosa (riesgo SIC). Postura verificada:

- **Toda reseña entra con `isApproved=false`** y solo se publica tras moderación en `/admin/resenas` — la policy RLS `review insert own` lo **fuerza a nivel DB** (migración 028: `isApproved=false`/`featured=false` en el INSERT, no solo en la app).
- **Producción tiene 0 reseñas** (verificado en vivo 2026-08-29): las ficticias del seed inicial se retiraron y la decisión fue no republicarlas.
- Los scripts de seed de reseñas (`packages/db/scripts/seed-reviews-*.mjs`) quedaron **bloqueados contra prod** (y remotos desconocidos) por `env-guard` — solo corren contra el stack local/stg.

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

- Implementación (pendiente — se construye con la tienda full): webhook de Wompi nos avisa de chargebacks → alerta al operador → tabla `Chargeback` para tracking. Hoy no existe esa tabla ni el flujo; mientras tanto el canal es el email del banco/Wompi al operador.

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

Persona natural NO responsable de IVA en Colombia **NO está obligada** a emitir factura electrónica si sus ingresos brutos anuales del año anterior están por debajo de **3.500 UVT** (UVT 2026 = **$52.374**, Resolución DIAN 000238 del 15-12-2025 → umbral 2026 = **$183.309.000**; verificado 2026-09-04 — re-verificar el UVT cada diciembre).

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

| Documento                                                   | URL                                                         | Origen                                           | Verificación                   |
| ----------------------------------------------------------- | ----------------------------------------------------------- | ------------------------------------------------ | ------------------------------ |
| **Política de Privacidad** (Habeas Data)                    | `/legal/privacidad`                                         | Plantilla CO + revisión legal                    | Versión y fecha visibles       |
| **Términos y Condiciones**                                  | `/legal/terminos`                                           | Idem                                             | Idem                           |
| **Política de Cookies**                                     | `/legal/cookies`                                            | Idem                                             | Idem                           |
| **Política de Devoluciones y Retracto**                     | `/legal/devoluciones`                                       | Idem                                             | Idem                           |
| **Política de Garantía**                                    | `/legal/garantias`                                          | Idem                                             | Idem                           |
| **Política de Tratamiento de Datos Personales**             | `/legal/privacidad` (cubierta ahí mismo; no hay URL aparte) | Plantilla SIC + revisión legal                   | Idem                           |
| **Aviso de Privacidad**                                     | Modal al primer contacto + footer link                      | Idem                                             | Idem                           |
| **Habeas Data — PQR**                                       | `/legal/habeas-data`                                        | Texto legal + email `habeas-data@lucamsshop.com` | —                              |
| **Lista de subprocesadores**                                | `/legal/subprocesadores`                                    | Generada de `docs/COMPLIANCE.md`                 | Actualización al cambiar stack |
| **Política de seguridad / divulgación de vulnerabilidades** | `/legal/security`                                           | Texto interno                                    | —                              |

> Cada documento tiene **versionado**: header `Versión X.Y — vigente desde YYYY-MM-DD`. Cambios mayores requieren re-aceptación del usuario activo.

---

## Cookie consent (alineación GDPR voluntaria)

Aunque la Ley 1581 colombiana no exige banner de cookies tan estricto como GDPR, **alineamos al estándar más alto** para futura expansión a UE/Latam y para confianza del usuario.

### Categorías

| Categoría                                                            | Default      | Bloqueable por usuario                 |
| -------------------------------------------------------------------- | ------------ | -------------------------------------- |
| **Estrictamente necesarias**                                         | ON           | ❌ No (sin estas el sitio no funciona) |
| **Funcionales** (idioma, dark mode, último carrito visto)            | OFF (opt-in) | ✅ Sí                                  |
| **Analíticas** (Vercel Analytics si se activa, conteos agregados)    | OFF (opt-in) | ✅ Sí                                  |
| **Marketing** (remarketing, pixels de Facebook/Google si se activan) | OFF (opt-in) | ✅ Sí                                  |

### Implementación

- Banner en primer visit (con detección por cookie `cookie_consent_v1`) — componente `apps/web/components/cookies-banner.tsx`, helpers en `apps/web/lib/cookie-consent.ts`.
- Tres opciones: "Solo necesarias", "Personalizar", "Aceptar todas".
- Persistir consentimiento en `Consent` (una fila por scope: `COOKIES_NECESSARY` / `COOKIES_FUNCTIONAL` / `COOKIES_ANALYTICS` / `COOKIES_MARKETING`, con `accepted: true|false`).
- Versión del banner en la cookie (`v: 1`) → cambio de versión = re-consent.
- Página `/legal/cookies` con detalle y revocación granular (reabre el modal de preferencias).

### Cookies que usamos (catálogo a mantener actualizado)

| Cookie                        | Propósito                                       | Tipo      | TTL                                                                                           | Notas                                                                                                              |
| ----------------------------- | ----------------------------------------------- | --------- | --------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| `sb-<project-ref>-auth-token` | Supabase Auth (sesión, puede venir fragmentada) | Necesaria | 400 días (default de `@supabase/ssr`; los tokens internos rotan: access 1 h, refresh 30 días) | `SameSite=Lax`, `Secure` en prod/preview; `httpOnly: false` (el browser client la lee — ver SECURITY.md § Cookies) |
| `cart_session`                | Carrito anónimo                                 | Necesaria | 30 días                                                                                       | HttpOnly                                                                                                           |
| `checkout_state`              | Estado del checkout multi-step                  | Necesaria | 60 min                                                                                        | HttpOnly, **cifrada AES-256-GCM** (lleva PII — F-9)                                                                |
| `cookie_consent_v1`           | Estado del consentimiento de cookies            | Necesaria | 1 año                                                                                         | Client-readable a propósito (futuros scripts la consultan)                                                         |
| `admin_last_activity`         | Marca de actividad admin (idle-timeout)         | Necesaria | 30 días                                                                                       | HttpOnly, firmada HMAC, `path=/admin` (solo admins)                                                                |
| `lucams_cms_edit`             | Modo edición CMS en vivo                        | Necesaria | 8 h                                                                                           | HttpOnly, `Secure` en prod/preview (solo admins con rol CONTENT)                                                   |

No usamos cookies de idioma/tema ni un request-id en cookie (el `X-Request-Id` va en headers). No hay cookies de terceros de analytics/marketing activas hoy.

---

## Subprocessor list y transferencias internacionales

> Bajo Ley 1581 (art. 26 Decreto 1377), debemos informar al titular si transferimos sus datos a terceros, especialmente fuera de Colombia.

### Subprocesadores activos

| Servicio                                        | Propósito                          | País                               | Datos transferidos                                                                                                                                                                                                                                                                                        | Base legal                              |
| ----------------------------------------------- | ---------------------------------- | ---------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------- |
| **Supabase**                                    | DB, Auth, Storage                  | EE.UU. (AWS us-east-1 o sa-east-1) | Todos los datos del cliente (RLS aplicado)                                                                                                                                                                                                                                                                | Consentimiento + ejecución del contrato |
| **Vercel**                                      | Hosting de la app                  | EE.UU. (edge global)               | Datos en tránsito durante la sesión + logs                                                                                                                                                                                                                                                                | Idem                                    |
| **Wompi**                                       | Procesamiento de pagos             | Colombia                           | Datos de la transacción + datos del cliente para anti-fraude                                                                                                                                                                                                                                              | Necesidad contractual                   |
| **Aveonline** (agregador) + Coordinadora/otras  | Logística                          | Colombia                           | Nombre, dirección, teléfono                                                                                                                                                                                                                                                                               | Necesidad contractual                   |
| **Resend**                                      | Email transaccional                | EE.UU.                             | Email + contenido del mensaje                                                                                                                                                                                                                                                                             | Necesidad contractual                   |
| **Google (Gemini API)**                         | Asistente IA del estudio           | EE.UU.                             | Solo el texto de la "ocasión" que escribe el cliente — pasa por un **filtro de PII** server-side (`sanitizeOccasion`, desde 2026-08-29: documentos, emails y celulares CO se reemplazan por texto neutro antes de llamar a Google) y la UI del Estudio muestra la nota "Evita escribir datos personales…" | Consentimiento explícito                |
| **Cloudflare**                                  | DNS + CDN + Turnstile + R2 backups | Global                             | Datos en tránsito + IP + backups encriptados                                                                                                                                                                                                                                                              | Idem                                    |
| **Mi.com.co**                                   | Registrador de dominio             | Colombia                           | Datos del registrante (operador, no cliente)                                                                                                                                                                                                                                                              | Necesidad contractual                   |
| **GitHub**                                      | Repositorio de código              | EE.UU.                             | No procesa datos de clientes                                                                                                                                                                                                                                                                              | —                                       |
| **Proveedor DIAN** (Alegra/Siigo/Facture — TBD) | Facturación electrónica            | Colombia                           | Datos de la factura (NIT/CC, nombre, items)                                                                                                                                                                                                                                                               | Obligación legal                        |

### Política

- Lista publicada en `/legal/subprocesadores`.
- **Estado por etapa:** producción opera en **modo tienda completa** (`NEXT_PUBLIC_STORE_MODE=full`) por decisión de Lucy desde 2026-09-03 — Wompi, Aveonline y Gemini están **activos** en producción, y la lista de subprocesadores aplica plenamente. (Antes, en Etapa 1 "catalog", figuraban como "cuando lo activemos" en la página pública — si se vuelve a catalog, actualizar esa página.)
- **Notificación de cambio:** 30 días antes de agregar/cambiar un subprocesador, email a clientes activos.
- Al firmar Pro con cualquiera, **revisar DPA (Data Processing Agreement)** ofrecido por el vendor — la mayoría lo ofrecen estándar.

### Transferencias internacionales

> Ley 1581 art. 26: requieren autorización del titular **o** que el país receptor tenga nivel adecuado de protección **o** se firmen contratos modelo.

- EE.UU.: no tiene nivel adecuado declarado por la SIC.
- **Estrategia:** consentimiento explícito en el aviso de privacidad + DPA con cada proveedor + documentación de medidas técnicas (encriptación en tránsito y reposo).

---

## Calendario de cumplimiento

| Hito                                                             | Cuándo                                                               | Bloqueante      |
| ---------------------------------------------------------------- | -------------------------------------------------------------------- | --------------- |
| Constituir el negocio (RUES + Cámara de Comercio)                | Antes de Fase 7                                                      | ✅ Sí           |
| Obtener RUT con responsabilidad 42 (facturador electrónico)      | Antes de Fase 7                                                      | ✅ Sí           |
| Solicitar resolución de numeración a DIAN                        | Antes de Fase 7                                                      | ✅ Sí           |
| Firmar contrato con proveedor de facturación electrónica         | Antes de Fase 7                                                      | ✅ Sí           |
| Revisión legal de los 9 documentos del sitio                     | Antes de Fase 7                                                      | ✅ Sí (ADR-020) |
| Política de privacidad y T&C publicados                          | Antes de Fase 7                                                      | ✅ Sí           |
| Banner de consentimiento de cookies funcional                    | Antes de Fase 7                                                      | ✅ Sí           |
| Habilitación de proveedor DIAN (si software propio)              | N/A (usamos PT autorizado)                                           | —               |
| Registro Nacional de Bases de Datos (RNBD) si aplica             | Confirmar con abogado                                                | Posible         |
| Email `habeas-data@lucamsshop.com` operativo + SLA de PQR        | Lanzamiento                                                          | ✅ Sí           |
| Email `retracto@lucamsshop.com` operativo                        | Lanzamiento                                                          | ✅ Sí           |
| Tabla `Consent` registrando cada autorización                    | ✅ Implementado                                                      | ✅ Sí           |
| Exportación de datos self-service                                | Pendiente (hoy: canal manual `habeas-data@`)                         | ✅ Sí           |
| Eliminación de cuenta self-service (anonimización + soft-delete) | ✅ Implementado en `/mi-cuenta/seguridad → Eliminar mi cuenta`       | ✅ Sí           |
| Purga por retención de logs con PII (`purge-event-logs`)         | ✅ Implementado (90/180 días)                                        | ✅ Sí           |
| Flujo de retracto end-to-end                                     | ✅ Implementado (`/mi-cuenta/pedidos/[number]` + `/admin/retractos`) | ✅ Sí           |
| Flujo de garantía                                                | ✅ Implementado (`/mi-cuenta/pedidos/[number]` + `/admin/garantias`) | ✅ Sí           |
| Reporte de incidente a SIC ante brecha (procedimiento)           | Documentar en Fase 7                                                 | ✅ Sí           |
