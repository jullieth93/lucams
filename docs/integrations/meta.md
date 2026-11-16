# Meta Catalog, Instagram y Facebook — Especificación funcional y técnica

> **Estado: diseño preimplementación (`ADR-207` + `ADR-208`). No existe integración operativa ni activos de Meta validados.** El objetivo es una integración completa y progresiva para catálogo, presencia comercial, medición y marketing; no una demo ni un feed sin operación. Fuentes oficiales comprobadas el **15 de noviembre de 2026** y revisión cruzada completada el **16 de noviembre de 2026**. Toda capacidad sujeta a elegibilidad, permisos o país debe validarse en los activos reales de Lucams antes de implementarse.

## 1. Objetivo y alcance completo

Meta será un canal de **descubrimiento, contenido y adquisición**, no un marketplace ni un checkout. El comprador descubre el producto en Instagram/Facebook y completa la compra en `lucamsshop.com`, ya sea por **compra directa en 1 clic** (productos prediseñados terminados `PHYSICAL_STOCK`) o pasando por el **Estudio** (productos personalizables `MADE_TO_ORDER`), cobrando siempre con Wompi/COD y la logística actual.

```text
Catálogo Lucams → Meta Catalog → Instagram / Facebook / anuncios
                                      ↓
                              lucamsshop.com
                                      ↓
       PHYSICAL_STOCK (compra 1 clic) o MADE_TO_ORDER (Estudio) → carrito → pago → pedido
```

### Alcance objetivo

- Estructura empresarial y vinculación de activos de Meta.
- Catálogo de productos y variantes, precio, stock, imágenes y enlaces.
- Feed programado y/o actualizaciones por API, con errores y reconciliación.
- Evaluación de Shop, etiquetado de productos y contenido orgánico elegible.
- Enlaces UTM y medición del embudo en Lucams.
- Meta Pixel con eventos de ecommerce bajo consentimiento.
- Conversions API (CAPI) con outbox, reintentos y deduplicación.
- Campañas, presupuestos y métricas mediante Marketing API cuando se habilite esa fase.
- Módulo administrativo propio con salud, permisos, incidencias y fecha de corte.

### No implica

- Pedidos, pagos o logística dentro de Meta.
- Personalización dentro de Instagram/Facebook.
- Mensajería WhatsApp ni cambio de `ADR-006`.
- Publicidad automática sin aprobación humana.
- Creación de contenido orgánico o etiquetado mediante una API que Meta no exponga.
- Compra de herramientas de terceros para replicar una integración propia.

La entrega será por fases productivas y completas; no se mostrarán botones ni métricas simuladas.

## 2. Estado actual verificado en Lucams

- Existen enlaces configurados para Instagram (`@lucams_shop`), Facebook (`lucamsshop`) y TikTok en el mapa CMS. Su presencia en el código no prueba configuración profesional ni elegibilidad.
- `https://lucamsshop.com/feeds/google-merchant.xml` responde públicamente `200 application/xml`.
- El feed emite una entrada por variante con SKU, título, descripción, enlace, imagen, stock, precio, marca, condición y grupo de producto (`apps/web/lib/feeds/google-merchant.ts`).
- La tienda ya tiene términos, privacidad, devoluciones, contacto, checkout y operación de pedidos.
- GA4 y UTM existen bajo consentimiento; `fbclid` está permitido en la sanitización de URL.
- No se encontró una implementación activa de Meta Pixel en `apps/web`; no se da por configurada.
- No existe CAPI, Marketing API ni módulo Meta.
- `/admin/integraciones` ya tiene una base modular (`ADR-206`), pero registrar Meta no activa ninguna funcionalidad.

## 3. Costos y condición económica

| Componente                                          | Evaluación                                                                                       |
| --------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| Cuenta profesional, página y estructura empresarial | Sin suscripción adicional identificada                                                           |
| Commerce Manager y catálogo                         | Sin tarifa obligatoria identificada; confirmar en la cuenta                                      |
| Contenido orgánico y etiquetado elegible            | Sin presupuesto publicitario obligatorio                                                         |
| Feed propio                                         | Usa la infraestructura actual; costo técnico solo si requiere adaptador                          |
| Pixel/CAPI                                          | Sin licencia aparte, pero con implementación, privacidad y mantenimiento                         |
| Meta Ads                                            | Gasto variable definido por campaña, subasta y presupuesto; no existe tarifa universal por venta |
| Checkout                                            | Sin cambio de Wompi ni costos de pago adicionales por Meta                                       |

No se debe confundir «gratis» con «sin costo total»: configuración, contenido, desarrollo y medición consumen trabajo. Toda campaña necesita un límite de gasto y una evaluación de margen.

## 4. Requisitos externos y elegibilidad

### Activos necesarios

- Cuenta profesional de Instagram.
- Página oficial de Facebook.
- Estructura de Meta Business que contenga ambos activos.
- Commerce Manager con catálogo.
- Cuenta publicitaria si se utiliza Marketing API.
- Dominio `lucamsshop.com` verificado cuando sea requerido.
- Permisos de administrador suficientes y acceso para el sistema que opere la integración.
- País, productos y cuenta elegibles para las funciones deseadas.

### Productos y políticas

Los productos actuales son bienes físicos compatibles en principio. No pertenecen a categorías restringidas identificadas en la revisión. Deben mantenerse estas condiciones:

- Imágenes y prediseñados propios o autorizados.
- Ninguna foto de cliente en publicidad sin permiso específico.
- Ninguna marca, personaje o ilustración de terceros sin derechos.
- Precio, stock, imagen y destino coherentes con la tienda.
- Términos, privacidad, devoluciones y contacto accesibles.
- Sin contenido ilegal, ofensivo, engañoso o no permitido.

La revisión de productos no sustituye el estado de cuenta. Restricciones, documentación pendiente, rechazos previos y permisos solo se verifican en los paneles de Meta.

Referencia: [Políticas comerciales de Meta](https://www.facebook.com/policies_center/commerce).

## 5. Cobertura documental y límites de implementación

| Capacidad         | Enfoque documentado                                              | Restricción que debe respetarse                                                                   | Fuente oficial                                                                                                                  |
| ----------------- | ---------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| Catálogo          | Contenedor de productos administrado por Commerce/Graph API      | Requiere activos, permisos y datos válidos                                                        | [Catalog](https://developers.facebook.com/documentation/ads-commerce/catalog)                                                   |
| Feed              | Carga de productos desde archivo/URL y administración del origen | El feed actual debe probarse; no se asume compatibilidad Google→Meta                              | [Feed API](https://developers.facebook.com/documentation/ads-commerce/commerce-platform/catalog/feed-api)                       |
| Batch API         | Cambios programáticos/asíncronos de ítems                        | Se usa cuando el volumen/frecuencia lo justifica; no reemplaza la revisión de errores             | [Catalog Batch API](https://developers.facebook.com/documentation/ads-commerce/commerce-platform/catalog/batch-api)             |
| Shop y etiquetado | Configuración de comercio, catálogo y contenido elegible         | Dependencia de país, cuenta y superficies; no se presume API pública para etiquetar orgánicamente | [Políticas comerciales](https://www.facebook.com/policies_center/commerce)                                                      |
| Pixel             | Eventos de navegador y ecommerce                                 | Consentimiento, CSP, sanitización y pruebas en Events Manager                                     | [Meta Pixel](https://developers.facebook.com/documentation/meta-pixel/get-started)                                              |
| CAPI              | Eventos servidor con parámetros, pruebas y monitoreo             | Credenciales, privacidad, reintentos y validación de payload                                      | [Conversions API](https://developers.facebook.com/documentation/ads-commerce/conversions-api)                                   |
| Pixel + CAPI      | Eventos complementarios con IDs compatibles                      | Sin deduplicación se duplican compras y se corrompe ROAS                                          | [Deduplicación](https://developers.facebook.com/documentation/ads-commerce/conversions-api/deduplicate-pixel-and-server-events) |
| Campañas          | Marketing API para objetos y administración publicitaria         | Nivel de acceso, permisos, revisión y gasto real                                                  | [Marketing API](https://developers.facebook.com/documentation/ads-commerce/marketing-api)                                       |
| Métricas          | Insights con campos, períodos y desgloses                        | Atribución Meta no equivale a caja o pedido interno                                               | [Insights API](https://developers.facebook.com/documentation/ads-commerce/marketing-api/insights)                               |
| Permisos          | Scopes y acceso a activos                                        | No todos los permisos o niveles están disponibles por defecto                                     | [Permissions](https://developers.facebook.com/documentation/development/permissions)                                            |
| App Review        | Revisión cuando el nivel de acceso lo exige                      | Uso propio puede tener otra ruta, pero debe probarse; no se promete ausencia de revisión          | [App Review](https://developers.facebook.com/documentation/resp-plat-initiatives/individual-processes/app-review)               |

### 5.1 Aplicación, conexión y permisos

La aplicación de Meta se registra para acceder a los activos empresariales de Lucams; no es una app pública para compradores. El flujo definitivo depende del recurso:

1. El titular crea/selecciona la app desde su cuenta de desarrollador.
2. Registra el dominio, redirect HTTPS, permisos y activos esperados.
3. Un administrador inicia la conexión en Lucams.
4. Meta solicita autorización y devuelve el grant al backend.
5. Lucams valida negocio, página, Instagram, catálogo, Pixel/dataset y cuenta publicitaria antes de activar.
6. Tokens y credenciales se almacenan cifrados, con renovación y revocación probadas.

| Alcance                      | Permiso/credencial a validar en la cuenta y versión de Graph API                                            |
| ---------------------------- | ----------------------------------------------------------------------------------------------------------- |
| Catálogo                     | `catalog_management` y acceso al catálogo/negocio correctos                                                 |
| Activos empresariales        | `business_management` solo si es necesario para la operación elegida                                        |
| Página e Instagram           | `pages_show_list`, `pages_read_engagement`, `instagram_basic` según el recurso                              |
| Lectura de campañas/métricas | `ads_read`                                                                                                  |
| Administración publicitaria  | `ads_management`, con presupuesto y revisión humana                                                         |
| CAPI                         | Token/permiso específico de Conversions API y del dataset/Pixel, no confundirlo con un scope OAuth genérico |

Los nombres exactos de scopes, nivel de acceso, App Review y verificación empresarial se validan en la fase 0; no se solicita `ads_management` ni permisos amplios si solo se necesita catálogo o lectura. La existencia de activos propios no se interpreta como exención automática de revisión.

### Decisiones derivadas

1. El primer mecanismo de catálogo debe ser un **feed probado**, no Batch API por defecto.
2. Las funciones orgánicas se configuran en Meta cuando no exista API documentada; el módulo puede guiar y enlazar, pero no fingir automatización.
3. CAPI nunca se activa sin Pixel/dedup y sin prueba de compra única.
4. Marketing API no se habilita solo para leer métricas: se decide entre lectura y escritura, con permisos mínimos.
5. La versión de Graph API se configura y revisa; no se fija una versión obsoleta en documentación.

## 6. Modelo funcional por superficie

### 6.1 Catálogo e identidad compartida

Cada producto/variante elegible debe tener:

- `external_product_id` estable relacionado con `ProductVariant.sku`.
- Nombre y descripción adecuados.
- Enlace profundo a la variante correcta.
- Imagen autorizada.
- Precio en COP.
- Disponibilidad.
- Marca, condición y grupo.

**Invariante obligatorio:** el mismo SKU se usa como `id` del feed, `content_id` de Pixel y `content_ids` de CAPI. No se alternan slug, CUID o IDs distintos por canal. Esta equivalencia es la que permite que una vista, un anuncio y una compra se relacionen con el mismo producto.

El feed actual ya contiene la base. Deben validarse namespace, formato, campos requeridos, reglas de actualización y diagnósticos de Meta antes de decidir si se reutiliza `/feeds/google-merchant.xml` o se crea `/feeds/meta.xml`.

Los importes internos permanecen en centavos `Int`; el feed y los eventos usan unidades COP, convertidas una sola vez en el borde. No se redondea dos veces.

**Paridad obligatoria de precios con la tienda (`ADR-207`):** a diferencia de Mercado Libre —donde `ChannelOffer` permite inflar el precio por fórmula o fijarlo manualmente para cubrir comisiones del marketplace (`ADR-205`)—, Meta Catalog dirige al comprador a pagar en `lucamsshop.com`. Por política comercial de Meta (y Google Merchant), el precio emitido en el feed debe coincidir de forma exacta con el precio exhibido en la ficha de destino (`ProductVariant.price ?? Product.basePrice`) y exige `publishedOnStorefront = true`; cualquier divergencia provoca rechazo de ítems o suspensión publicitaria.

**Separación de las tres naturalezas (`ADR-208`) y disponibilidad honesta:**

1. **Artes digitales de biblioteca (`DesignGalleryImage`, `/admin/disenos`):** son activos internos para mezclar con fotografías del cliente dentro del Estudio; no poseen SKU ni precio propio y jamás se emiten en el feed de Meta.
2. **Productos personalizables bajo pedido (`fulfillmentMode = MADE_TO_ORDER`):** Meta exhibe ejemplos curados del producto base y aterriza en `lucamsshop.com` para personalizar en el Estudio. Su disponibilidad se deriva de `isActive` y capacidad operativa de taller sin publicar un conteo ficticio de unidades terminadas (`100.000` retirado por `ADR-208`).
3. **Productos prediseñados terminados (`fulfillmentMode = PHYSICAL_STOCK`):** aterrizan en la ficha de compra directa en 1 clic sin Estudio y consumen el **mismo inventario físico único y multilateral** que comparten `lucamsshop.com`, Mercado Libre (`ADR-205`) y Google Merchant (`in stock` únicamente cuando `ProductVariant.stock > safetyStock`).

### 6.2 Instagram y Facebook orgánico

El objetivo es reducir la distancia entre contenido y producto:

- Presentación del catálogo en la presencia comercial elegible.
- Etiquetas en publicaciones, reels o historias si la cuenta las tiene habilitadas.
- Enlaces a la variante correcta.
- Contenido de temporada y campañas con UTM.

Si el etiquetado solo puede hacerse desde Instagram/Facebook, se documenta como acción humana. El módulo Lucams no lo presentará como una operación disponible por API. La revisión del Shop y del checkout se hace siempre apuntando a `lucamsshop.com`; no se espera que Meta administre pedidos, devoluciones o soporte posterior.

### 6.3 Publicidad

Meta puede usar el catálogo para campañas de productos, carruseles, colecciones, remarketing y otros formatos disponibles. La fase publicitaria debe incluir:

- Selección de productos y audiencia.
- Objetivo y destino.
- Presupuesto y límite de gasto.
- Creatividades autorizadas.
- Revisión humana antes de activar.
- Métricas de gasto, impresiones, clics, conversiones y retorno.
- Pausa segura y auditoría.

No se crearán campañas automáticas basadas únicamente en cambios de stock o contenido. Ningún gasto se activa durante las fases de catálogo, contenido orgánico o medición.

### 6.4 Pixel

Eventos mínimos de ecommerce:

- `PageView` según corresponda.
- `ViewContent` con `content_id = variante.sku` y valor.
- `AddToCart`.
- `InitiateCheckout`.
- `Purchase` una sola vez al confirmar la orden elegible, con `eventID` estable vinculado a esa orden.

La activación debe respetar la categoría `COOKIES_MARKETING`, la CSP con nonce y la sanitización de rutas. No se envían tokens, diseños, fotos, correos, teléfonos ni direcciones en parámetros de eventos.

`Purchase` se origina desde el estado elegible de la orden, no de una recarga de `/checkout/gracias`. El navegador puede perder la señal y CAPI debe completarla, pero ambos usan el mismo identificador de evento.

### 6.5 CAPI

CAPI complementa al Pixel para señales que el navegador pierde. Requiere:

- Evento servidor validado.
- Outbox persistente y reintentos.
- `event_id` único y consistente con `eventID` del navegador.
- Mismo nombre de evento y dataset/Pixel.
- `orderId` obligatorio para `Purchase`, además del ID de deduplicación, fecha de ocurrencia, estado de consentimiento y hash de payload.
- Compra generada desde la verdad de la orden, no desde una página de gracias recargada.
- Prueba en Events Manager y reconciliación con pedidos.
- Datos de cliente solo si existe base legal y valor demostrado; hashing no sustituye la necesidad de minimización.

**Consentimiento histórico:** el worker debe evaluar el último registro válido de `Consent` con `scope = COOKIES_MARKETING` asociado al comprador al momento de emitir el evento. Si la compra no tiene consentimiento válido, CAPI no se envía. Si se revoca después, no se emiten eventos nuevos; la revocación no se interpreta como autorización para fabricar consentimiento histórico. La evidencia almacenada en `Consent` es la autoridad server-side; una cookie del navegador o una petición webhook puede no existir.

CAPI no es un requisito para lanzar el catálogo o el contenido orgánico.

### 6.6 Métricas y atribución

Se distinguen:

- **Lucams:** pedidos, ingresos, margen, UTM y embudo propio.
- **Meta:** impresiones, clics, gasto, conversiones atribuidas y retorno reportado.
- **GA4:** medición web bajo consentimiento.

`fbclid` se conserva como identificador de clic cuando llega en el enlace, pero la atribución de campaña usa UTM explícitos. No se sustituyen `utm_source`, `utm_medium` o `utm_campaign` por el clic de Meta.

Las compras de Meta no se comparan con pedidos sin definir ventana, zona horaria, moneda, reembolsos y duplicados. El ROAS de Meta no se presenta como utilidad.

## 7. Módulo administrativo propuesto

Una entrada: **Marketing → Meta**. Ruta propuesta: `/admin/marketing/meta`.

| Vista              | Contenido                                                                                                |
| ------------------ | -------------------------------------------------------------------------------------------------------- |
| **Resumen**        | Estado de activos, feed, catálogo, eventos, campañas, gasto, conversiones y alertas                      |
| **Catálogo**       | Ítems, variantes, precio, stock, enlaces, errores, última importación y reconciliación                   |
| **Contenido**      | Activos Instagram/Facebook, elegibilidad, guía de etiquetado, enlaces UTM y acciones externas necesarias |
| **Eventos**        | Pixel, CAPI, consentimiento, deduplicación, pruebas, fallos y reintentos                                 |
| **Campañas**       | Objetos, presupuesto, estado, creatividades, gasto, conversiones y métricas                              |
| **Sincronización** | App, permisos, tokens, activos, versiones, logs, auditoría y configuración                               |

`/admin/integraciones` conserva la tarjeta técnica y el enlace al módulo. No se agrega Meta al registro hasta que exista una capacidad real que mostrar.

### 7.1 RBAC, rutas y estados de acceso

La ruta y sus subrutas deben registrarse en `ROUTE_ROLES`, con pruebas de navegación y autorización. Las vistas se ocultan por rol y la misma restricción se aplica en servidor.

| Función                                    | Lectura                                       | Escritura/acción                                                               |
| ------------------------------------------ | --------------------------------------------- | ------------------------------------------------------------------------------ |
| Conexión, activos, permisos y credenciales | `SUPERADMIN`                                  | `SUPERADMIN` + MFA reciente                                                    |
| Catálogo y stock                           | `SUPERADMIN`, `OPERATIONS_MANAGER`, `MANAGER` | `SUPERADMIN`, `OPERATIONS_MANAGER`, `MANAGER`                                  |
| Contenido orgánico y enlaces               | `SUPERADMIN`, `OPERATIONS_MANAGER`, `MANAGER` | Mismos roles para guías/UTM; etiquetado manual externo                         |
| Pixel, CAPI y deduplicación                | `SUPERADMIN`                                  | `SUPERADMIN`; eventos solo con consentimiento válido                           |
| Campañas e Insights                        | `SUPERADMIN`, `FINANCE_ANALYST`               | `SUPERADMIN`, `OPERATIONS_MANAGER`, `MANAGER` con aprobación y límite de gasto |
| Sincronización, logs y errores             | `SUPERADMIN`                                  | `SUPERADMIN`                                                                   |
| Auditoría                                  | Roles con `audit:read`                        | N/A                                                                            |

`CUSTOMER_SUPPORT`, `PRINT_WORKSHOP`, `FULFILLMENT` y `CMS_EDITOR` no reciben acceso por defecto a Meta: sus capacidades no implican operar marketing externo. Cualquier excepción requiere capacidad explícita y prueba de acceso.

Toda entidad nueva debe tener **RLS deny-by-default** y ninguna lectura pública. Las lecturas del admin se validan en servidor; workers usan rol de servicio. Prisma/Supabase se migran de forma dual con pruebas RLS.

## 8. Arquitectura técnica propuesta

### 8.1 Componentes

- `MetaProvider` server-side para Graph API, autenticación, versión, errores y límites.
- Registro de activos: negocio, página, Instagram, catálogo, Pixel/dataset y cuenta publicitaria.
- Servicio de feed/API de catálogo y diagnóstico de importaciones.
- Pixel loader con consentimiento y CSP.
- Outbox CAPI con deduplicación, reintentos y métricas.
- Adaptador Marketing API para lectura/escritura según fase.
- Módulo admin, RBAC, MFA, auditoría y alertas.
- Reconciliación de feed, eventos, campañas y métricas.

No se agrega infraestructura nueva: Next.js, Postgres, `pg_cron`/`pg_net`, Storage y observabilidad actual.

### 8.2 Modelo lógico de datos

| Entidad lógica         | Responsabilidad                                                                                                 |
| ---------------------- | --------------------------------------------------------------------------------------------------------------- |
| `MetaAssetConnection`  | Negocio, activos, IDs, permisos, estado y última validación                                                     |
| `MetaCredential`       | Tokens cifrados, expiración, scopes y rotación; nunca en logs                                                   |
| `MetaCatalogItem`      | `productVariantId`, SKU, ID externo, contenido, precio, stock y hash sincronizado                               |
| `MetaFeedRun`          | Origen, inicio/fin, ítems aceptados/rechazados, errores y enlace de diagnóstico                                 |
| `MetaEventOutbox`      | Evento, ID de dedup, `orderId` obligatorio para `Purchase`, consentimiento, fecha, estado, intentos y respuesta |
| `MetaCampaignSnapshot` | Cuenta publicitaria, campaña, estado, presupuesto y métricas por ventana/fuente                                 |

Las acciones sensibles se registran en el `AdminActionLog` existente; no se crea una segunda bitácora de administración.

El modelo final debe revisar si conviene nombres específicos Meta o una base de marketing reutilizable; no se generaliza antes de necesitarlo.

### 8.3 Seguridad y privacidad

- Credenciales cifradas y separadas por ambiente.
- OAuth/permisos con activos esperados y validación de propiedad.
- RBAC/MFA para conectar, activar campañas o cambiar presupuestos.
- Cero PII en logs y payloads por defecto.
- No enviar imágenes o contenido privado del Estudio.
- Consentimiento de marketing antes de Pixel; revocación detiene eventos.
- CAPI solo tras revisión de privacidad y deduplicación.
- Límites de gasto y confirmación explícita para cualquier acción con costo.
- Actualización de subprocesadores si cambia el tratamiento de datos.

### 8.4 Resiliencia

- Feed público estable, XML válido y errores `no-store`.
- IDs externos únicos y hashes para no reescribir ítems sin cambios.
- Reintentos solo en errores transitorios; ninguna campaña se crea dos veces tras timeout.
- Outbox CAPI con lease y dedup durable.
- Reconciliación de gasto y conversiones por ventana.
- Alertas para feed vencido, permisos revocados, eventos duplicados, compras divergentes y gasto inesperado.

## 9. Pruebas y evidencia requerida

### Cuenta y activos

- Capturas o registro interno de elegibilidad sin secretos.
- Página, Instagram, catálogo, dominio y permisos vinculados.
- Revisión de políticas y productos.
- Confirmación de funciones disponibles en Colombia para la cuenta.

### Catálogo

- Feed aceptado sin errores críticos.
- Producto/variante abre la página correcta.
- Precio, imagen y stock coinciden.
- Cambios posteriores se propagan y los errores quedan visibles.

### Orgánico

- Shop/etiquetado disponible o marcado explícitamente como no elegible.
- Enlaces y UTM llegan correctamente a la tienda.
- Ningún contenido incumple derechos o privacidad.

### Pixel/CAPI

- Consentimiento denegado: cero eventos.
- Consentimiento concedido/revocado: comportamiento correcto.
- Eventos de prueba visibles y sin PII.
- Compra única con Pixel+CAPI y mismo ID.
- Reintentos sin duplicados.

### Marketing

- Lectura de métricas con permisos mínimos.
- Ninguna activación accidental con gasto.
- Cambios auditados y conciliación de gasto.
- Prueba de pausa y recuperación de acceso.

## 10. Entrega progresiva por sesiones

Cada fase puede ocupar varias sesiones. Nada incompleto se activa ni se presenta en el menú como disponible.

| Fase                         | Entrega completa                                                                                                   | Criterio de salida                                                      |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------- |
| **0. Validación externa**    | Activos, cuenta profesional, página, Business, dominio, Commerce, permisos, políticas, costos y funciones Colombia | Matriz real de elegibilidad y acceso aprobada; sin supuestos críticos   |
| **1. Catálogo (`ADR-208`)**  | Requiere el núcleo `MADE_TO_ORDER` / `PHYSICAL_STOCK` activo; feed probado, paridad de precios y módulo Catálogo   | Productos aceptados con stock multilateral real y errores visibles      |
| **2. Orgánico y atribución** | Shop/etiquetado elegible, guía de contenido, UTM y medición del embudo                                             | Recorrido contenido→producto→compra medido sin duplicar pedidos         |
| **3. Pixel**                 | Loader, consentimiento, eventos ecommerce y diagnóstico                                                            | Eventos correctos en cuenta real/test y cero emisión sin consentimiento |
| **4. CAPI**                  | Outbox, eventos servidor, dedup, privacidad y reconciliación                                                       | Compra Pixel+CAPI contada una vez y reintentos seguros                  |
| **5. Campañas y métricas**   | Marketing API, permisos, presupuestos, insights, alertas y auditoría                                               | Campaña controlada con gasto limitado y métricas contrastadas           |
| **6. Endurecimiento**        | Reconciliación global, runbook, seguridad y activación gradual                                                     | Operación sin exportaciones manuales ni errores críticos abiertos       |

### Contrato por sesión

1. Leer `docs/STATE.md`, este documento y el ADR de Meta.
2. Revisar los enlaces oficiales y la versión de API vigente antes de codificar.
3. No crear stubs, botones sin acción ni métricas ficticias.
4. Aplicar RBAC, auditoría, privacidad y pruebas desde la fase correspondiente.
5. Ejecutar `make check && pnpm test`, más `pnpm build` si toca rutas.
6. Actualizar el documento y `STATE.md` con lo realmente operativo y el próximo bloqueo.
7. No versionar credenciales, capturas con PII ni tokens.

## 11. Validaciones externas antes de codificar

1. Estado profesional de Instagram y vinculación con Facebook.
2. Activos dentro de la misma estructura empresarial.
3. Acceso a Commerce Manager y permisos de administrador.
4. Dominio verificado y tienda elegible.
5. Shop y etiquetado disponibles para la cuenta en Colombia.
6. Feed actual aceptado por Meta o campos faltantes identificados.
7. Necesidad real de Pixel/CAPI y base legal de los datos usados.
8. Nivel de acceso y App Review requerido para cada permiso.
9. Existencia de cuenta publicitaria y límite de gasto si se llega a esa fase.
10. Costos de producción de contenido y margen mínimo para campañas.

## 12. Definición global de terminado

La integración estará completa cuando:

- El catálogo elegible esté sincronizado y sus errores sean visibles.
- Las funciones orgánicas disponibles estén configuradas y las manuales documentadas.
- Los enlaces y campañas puedan atribuirse sin duplicar pedidos.
- Pixel/CAPI respeten consentimiento, privacidad y deduplicación.
- Las acciones publicitarias tengan límites, aprobación y auditoría.
- Las métricas distingan Meta, GA4, pedidos, caja y margen.
- Las excepciones no soportadas por API sean explícitas.
- La operación no dependa de actualizar productos manualmente en dos sistemas.
- Las pruebas reales y el piloto controlado no tengan errores críticos abiertos.
