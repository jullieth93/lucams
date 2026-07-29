# Análisis competitivo — magneticas.cl vs Lucams_shop

> Reconocimiento real de magneticas.cl realizado el 2026-05-09: home, sitemap.xml, 6 categorías de catálogo, FAQ, política de devolución. Objetivo: identificar qué replicamos, qué mejoramos, qué descartamos y qué gaps explotamos.

## Tabla de contenido

1. [Resumen ejecutivo](#resumen-ejecutivo)
2. [Visión general de magneticas.cl](#visión-general-de-magneticascl)
3. [Lo que copiamos (paridad funcional)](#lo-que-copiamos-paridad-funcional)
4. [Lo que mejoramos (ventaja competitiva)](#lo-que-mejoramos-ventaja-competitiva)
5. [Lo que descartamos](#lo-que-descartamos)
6. [Adaptaciones culturales Chile → Colombia](#adaptaciones-culturales-chile--colombia)
7. [Riesgos legales en magneticas.cl que NO replicamos](#riesgos-legales-en-magneticascl-que-no-replicamos)
8. [Gaps de UX detectados (oportunidades para Lucams)](#gaps-de-ux-detectados-oportunidades-para-lucams)
9. [Conclusión](#conclusión)

---

## Resumen ejecutivo

magneticas.cl es un e-commerce chileno **maduro** (60+ productos activos, segmentación clara de categorías, copy emocional, testimonios reales) construido sobre **stack estándar tipo Shopify/Jumpseller**. Es **competencia directa funcional** pero con tres debilidades estructurales que Lucams_shop convierte en ventaja:

1. **Personalización es manual** — el cliente sube fotos por email/WhatsApp DESPUÉS de comprar; un humano arma el imán. Lucams hace esto **en vivo en el navegador** (Estudio canvas + 3D + IA).
2. **Riesgo legal en su catálogo** — venden imanes con marcas registradas (Snoopy, Disney, Harry Potter, Bad Bunny, Spotify, Coca-Cola) **sin licencia visible**. Una demanda de cualquiera de estos titulares los borra.
3. **Pagos limitados** — solo Webpay (Chile). Lucams ofrece **Wompi multi-método (tarjeta + PSE + Nequi + Bancolombia + Daviplata) + COD desde día 1**.

---

## Visión general de magneticas.cl

| Atributo              | Valor                                                                                                                                                               |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| URL                   | https://www.magneticas.cl                                                                                                                                           |
| Tagline / hero        | _"Tienda online de fotos y planners magnéticos personalizados. Ofrecemos productos creativos para organización, decoración y recuerdos únicos. Envío gratis stgo."_ |
| Stack inferido        | Shopify-like custom (URLs `/cl/productos/`, no `/collections/...`)                                                                                                  |
| Categorías top        | INICIO · CATÁLOGO COMPLETO · CURSOS ONLINE · FOTOS Y RECUERDOS · ORGANIZACIÓN Y JUEGOS · DECO Y REGALOS · PUBLICITARIOS                                             |
| Subcategorías         | 10 (Packs, Recuerdos, Publicitarios, Organización, Calendarios, Coleccionables, Juegos, Cuadros, Regalos, Snoopy)                                                   |
| Productos catalogados | ~60+ visibles (paginación de 2)                                                                                                                                     |
| Pago                  | Webpay (Transbank) + transferencia bancaria                                                                                                                         |
| Logística             | Personal manual en Santiago (entrega 14:00–21:00) + Starken/Bluexpress regiones                                                                                     |
| Envío gratis          | Compras > $35.000 CLP en Santiago                                                                                                                                   |
| Tiempos               | 2–4 días Santiago, 3–7 días regiones                                                                                                                                |
| Devoluciones          | 7 días, **excluye personalizados** (consistente con Ley del Consumidor CL)                                                                                          |
| Soporte               | Email + WhatsApp                                                                                                                                                    |
| Tono de marca         | Cálido, emotivo, familiar ("emprendimiento familiar", "magia de lo simple")                                                                                         |
| Paleta                | Blanco + pasteles (lila, verde, celeste, rosado) + acentos vibrantes                                                                                                |

### Productos top de su home

> Datos verificados contra magneticas.cl/ a 2026-05-09.

| Producto                  | Precio CLP | Observación                       |
| ------------------------- | ---------- | --------------------------------- |
| Recuerdos Cumpleaños x20  | $24.990    | Top de gama, evento personalizado |
| 20 Mini Polaroid          | $12.990    | Best-seller foto-imanes           |
| Planner Magnético MENSUAL | $7.990     | Producto reutilizable popular     |
| Big Box Día Mamá          | $14.990    | Producto temporal con descuento   |
| Calendario Mes a Mes 2026 | $9.990     | Producto temporal anual           |

---

## Lo que copiamos (paridad funcional)

> Patrones de magneticas.cl que **funcionan** y replicamos en Lucams sin reinventar.

### Estructura de producto

- **Packs por cantidad** (6/9/12/20 unidades) en lugar de venta unitaria. Reduce costo de logística y empaque, mejora ticket promedio.
- **Variantes por formato** (Polaroid grande, mini-Polaroid, cuadrado, circular, corazón). Flexibilidad para distintos usos sin complicar SKUs.
- **Tiers de precio implícitos:** $1.000 (mini coleccionables) → $7.990–9.990 (packs medios) → $19.990–24.990 (recuerdos eventos).

### Categorización por uso

- **Por ocasión:** cumpleaños, bautizo, graduación, matrimonio, primer año.
- **Por función:** fotos vs organización vs decoración vs B2B.
- **Por edad:** sección clara para peques (educativos).
- Lucams replica esta estructura en 8 categorías top (descartando coleccionables-licenciados y cursos).

### Copy emocional

- magneticas.cl: _"Celebra el cumpleaños de tu bebé con nuestros imanes personalizados"_ / _"magia de lo simple, lo funcional y lo bonito"_ / _"emprendimiento familiar"_.
- Lucams adopta un tono **igualmente cálido pero más kawaii colombiano**: _"Tus recuerdos, en imán"_ / _"¡Tu carrito está esperando! Agrega un imancito ✨"_.
- Detalle de tono y voz en [`BRANDING.md` § Tono de voz](BRANDING.md#tono-de-voz).

### Prácticas comerciales

- **Envío gratis a partir de un threshold** (mejora conversión y ticket promedio). Lucams: definir threshold COP en Fase 4 con el operador.
- **Productos temporales** (Día de la Madre, Calendario 2026) que generan urgencia. Lucams usa `Product.startDate/endDate` para esto en Fase 2/5.
- **Mystery Box** como producto de descubrimiento. Lucams replica en `caja-lucams-sorpresa` pero **sin marcas licenciadas** dentro (usa diseños propios + mascota mapache).

### Política de devolución

- magneticas.cl: 7 días, excluye personalizados, retiro en domicilio. Consistente con la ley chilena del consumidor.
- Lucams: **5 días hábiles** (Ley 1480 art. 47, no 7), excluye personalizados (mismo principio), reembolso en 15 días calendario. Detalle en [`COMPLIANCE.md` § Ley 1480](COMPLIANCE.md#ley-1480-de-2011--estatuto-del-consumidor).

### B2B publicitarios desde día 1

- magneticas.cl los tiene como categoría top desde el inicio.
- Lucams replica con `/mayorista` y categoría `Para tu Negocio` (ROADMAP Fase 6 + producto seed `imanes-publicitarios-*`).

---

## Lo que mejoramos (ventaja competitiva)

> Donde Lucams **supera** a magneticas.cl en valor, no solo lo iguala.

### 1. Estudio de Personalización en vivo (diferenciador #1)

|                              | magneticas.cl                            | Lucams_shop                                 |
| ---------------------------- | ---------------------------------------- | ------------------------------------------- |
| Paso 1: cliente compra       | Sí                                       | Sí                                          |
| Paso 2: cliente envía fotos  | **Por email o WhatsApp tras comprar** ⏳ | **En vivo en el editor antes de pagar** ⚡  |
| Paso 3: validación de diseño | Manual (humano arma el imán)             | Cliente ve preview 3D antes de pagar        |
| Paso 4: producción           | Tras aprobación manual                   | Tras pago (PNG ya generado server-side)     |
| Tiempo total                 | 2–4 días + ida-vuelta de email           | 0 minutos para diseñar; 2–4 días producción |
| Riesgo de error              | Alto (mala foto = retrabajo)             | Bajo (cliente vio el diseño exacto)         |

**Implementación:** `react-konva` + `react-three-fiber` + Claude API ([ARCHITECTURE.md § Diferenciador #1](ARCHITECTURE.md), [ROADMAP § Fase 3](ROADMAP.md)).

### 2. Pagos colombianos completos

|                              | magneticas.cl                        | Lucams_shop                       |
| ---------------------------- | ------------------------------------ | --------------------------------- |
| Tarjeta crédito/débito       | Webpay (CL)                          | Wompi (CO)                        |
| PSE / transferencia banco    | Transferencia manual con comprobante | **PSE Wompi nativo**              |
| Wallet móvil                 | No                                   | **Nequi + Daviplata** vía Wompi   |
| Bancolombia transferencia    | No (Chile)                           | **Sí, Wompi nativo**              |
| **Pago contraentrega (COD)** | **No**                               | **Sí, vía Aveonline desde día 1** |

> COD es **crítico** en e-commerce CO: eleva conversión 30–50% en regiones fuera de las grandes ciudades ([ADR-009](DECISIONS.md)).

### 3. Logística sin dependencia personal

|               | magneticas.cl                                                                     | Lucams_shop                                                           |
| ------------- | --------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| Despacho      | "Hacemos los despachos personalmente en Santiago todos los días, 14:00–21:00 hrs" | API Aveonline multi-carrier (Coordinadora, Servientrega, Envía, TCC…) |
| Tracking      | Limitado                                                                          | Webhook tracking + email automático                                   |
| Cobertura     | Santiago + Starken/Bluexpress regiones                                            | Cobertura nacional CO con un solo proveedor                           |
| Escalabilidad | Limitada por capacidad humana                                                     | Limitada solo por volumen de Coordinadora                             |

### 4. Sin riesgo legal por marcas

magneticas.cl tiene productos con Disney, Warner, Peanuts, Coca-Cola, Spotify, etc. **sin licencia visible**. Lucams **no replica esto** ([CATALOG_SEED.md § Productos descartados](CATALOG_SEED.md#productos-descartados-de-magneticascl-con-motivo)). Razones:

- **Riesgo de demanda** y multas que pueden cerrar el negocio.
- **Posicionamiento ético** ("imanes diseñados por nosotros, no copiados").
- **Relación con clientes B2B** seria — nadie quiere asociar su marca con un proveedor que viola IP de terceros.

### 5. Brand más memorable

|                       | magneticas.cl                          | Lucams_shop                                            |
| --------------------- | -------------------------------------- | ------------------------------------------------------ |
| Logo                  | Texto en mayúsculas                    | Insignia con mascota mapache + bubble multicolor       |
| Mascota               | No tiene                               | Mapache recurrente (loader, 404, empty states, emails) |
| Paleta                | Blanco + pasteles tibios               | Morado fuerte + turquesa + rosa + coral + amarillo     |
| Tono                  | Cálido convencional                    | Cálido + lúdico + kawaii                               |
| Diferenciación visual | Bajo (similar a otras tiendas Shopify) | Alto (visual icónico)                                  |

### 6. Stack y arquitectura

|                  | magneticas.cl          | Lucams_shop                                                                    |
| ---------------- | ---------------------- | ------------------------------------------------------------------------------ |
| Stack            | Shopify-like cerrado   | Next.js 15 + RSC + Tailwind v4 + shadcn/ui                                     |
| SEO              | Decente (meta básicos) | ISR + JSON-LD por producto + sitemap dinámico + OG dinámico                    |
| Performance      | No medido públicamente | Lighthouse ≥ 95 como criterio de aceptación                                    |
| PWA              | No                     | Sí (instalable, offline básico)                                                |
| Realtime         | No                     | Stock realtime (Supabase Realtime)                                             |
| Email automation | Básico                 | Lifecycle (welcome series, recompra, cumpleaños, carrito abandonado con cupón) |
| A11y             | No declarado           | WCAG 2.1 AA con tests automatizados                                            |
| i18n             | Solo español           | es-CO base, expandible a otros mercados                                        |

### 7. Compliance + observabilidad + DR

magneticas.cl no expone esto al usuario, pero un sitio productivo serio lo necesita:

- **Compliance Colombia operativo:** Ley 1581 con tabla `Consent`, Ley 1480 con `RetractRequest`, DIAN facturación electrónica con `InvoiceProvider` adapter ([COMPLIANCE.md](COMPLIANCE.md)).
- **Observabilidad:** SLOs cuantitativos, alertas accionables, postmortem blameless ([OBSERVABILITY.md](OBSERVABILITY.md)).
- **DR drills cuatrimestrales** programados.
- **Threat model STRIDE** + IRP runbooks ([SECURITY.md](SECURITY.md)).

---

## Lo que descartamos

> Cosas de magneticas.cl que **no replicamos** porque no agregan valor o tienen riesgo.

### Cursos online

- magneticas.cl tiene una sección "CURSOS ONLINE" en su menú top.
- **Lucams no entra ahí.** Diferente modelo de negocio (educación vs producto físico). Out of scope para Fases 0–7.
- Si en el futuro el operador quiere lanzar cursos, sería un proyecto/dominio aparte.

### Productos con marcas registradas no licenciadas

- Detalle exhaustivo en [CATALOG_SEED.md § Productos descartados](CATALOG_SEED.md#productos-descartados-de-magneticascl-con-motivo).
- 11 productos / categoría completa "Snoopy" / Mystery Box con licencias dudosas.

### Logística manual personal

- magneticas.cl: "despachos personalmente en Santiago, 14:00–21:00".
- Lucams: full API Aveonline desde día 1. **No depende de capacidad humana del operador.**

### Pago solo por transferencia bancaria con comprobante

- magneticas.cl acepta transferencia con verificación manual del comprobante.
- Lucams: **PSE vía Wompi** lo automatiza completamente.

### Específicos chilenos

- "Kit Magnético Dieciochero" (Fiestas Patrias chilenas, 18 de septiembre).
- Costos de envío en CLP, regiones de Chile, etc.
- → Reemplazados por equivalentes colombianos (Independencia 20 de julio, Velitas 7 de diciembre, departamentos CO).

---

## Adaptaciones culturales Chile → Colombia

| Aspecto                       | magneticas.cl (CL)                           | Lucams_shop (CO)                                                                                         |
| ----------------------------- | -------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| **Moneda**                    | CLP (sin separador decimal estándar: $9.990) | COP (sin decimales, en centavos internos: $42.000 mostrado)                                              |
| **Despacho gratis threshold** | $35.000 CLP en Santiago                      | TBD por el operador (sugerido: $80.000–100.000 COP en Bogotá/Medellín/Cali)                              |
| **Fiesta patria**             | 18 de septiembre (sombrero de huaso)         | 20 de julio (Día de la Independencia) + 7 de agosto (Boyacá)                                             |
| **Día de la Madre**           | Mayo (segundo domingo) — coincide            | Mayo (segundo domingo) — productos similares aplican                                                     |
| **Tradiciones únicas CO**     | —                                            | **Día de las Velitas** (7 dic) · **Novena de aguinaldos** (16–24 dic) · **Quinceañera** (latina general) |
| **Tono linguístico**          | Tutea con jerga chilena suave                | Tutea con colombianismos suaves ("súper bonito", "regalo de pana", "imancito"). Sin "vos", sin "huevón". |
| **Logística**                 | Starken/Bluexpress (CL)                      | Multi-carrier vía Aveonline (Coordinadora, Servientrega, Envía, TCC…)                                    |
| **Pasarela**                  | Webpay (Transbank, CL)                       | Wompi (Bancolombia, CO)                                                                                  |
| **Departamentos/Regiones**    | 16 regiones CL                               | 32 departamentos CO (lista en validación Zod del checkout)                                               |
| **Compliance**                | Ley del Consumidor (CL), SERNAC              | Ley 1581 (Habeas Data) + Ley 1480 (Consumidor) + DIAN (factura electrónica)                              |
| **Documento de identidad**    | RUT                                          | Cédula de Ciudadanía (CC) o NIT (B2B)                                                                    |
| **Teléfonos**                 | +56 9 XXXXXXXX (8 dígitos)                   | +57 3XX XXX XXXX (10 dígitos, móvil empieza con 3)                                                       |
| **Direcciones**               | Comuna + Región                              | Barrio + Ciudad + Departamento (más componentes; ya modelado en `Address`)                               |

---

## Riesgos legales en magneticas.cl que NO replicamos

> Documentar explícitamente estos riesgos detectados nos protege de tomar decisiones por inercia ("magneticas.cl lo hace, ¿por qué no?").

### 1. Uso de marcas registradas sin licencia visible (ALTO RIESGO)

magneticas.cl publica productos con:

- **Disney** (Hannah Montana, Crucero Disney, Mystery Box con personajes Disney)
- **Warner Bros.** (Harry Potter — Mini Magnets holográficos, Mystery Box)
- **Peanuts Worldwide LLC** (toda la "Colección Snoopy": imanes, marcapáginas, calendarios, planners, notas)
- **The Coca-Cola Company** (Imanes Personalizados Estilo Coca-Cola)
- **Spotify AB** (Pack Spotify Magnético)
- **Bad Bunny** (Imanes Edición Concierto)
- **Katy Perry** (Imanes Katy Perry)

**Ningún disclaimer de licencia** visible en sus PDPs (verificado a 2026-05-09).

#### Por qué Lucams no replica

- **Régimen Andino de Propiedad Industrial (Decisión 486 CAN)** prohíbe uso comercial de marca registrada de terceros sin autorización.
- **Demandas reales** han ocurrido en LATAM por menos que esto.
- **Reputación con B2B** (clientes empresariales) — nadie quiere comprar imanes publicitarios a un proveedor demandable.

#### Política Lucams

- **No** vendemos productos con marcas registradas de terceros sin licencia oficial.
- **Sí** podemos hacerlo en el futuro contratando licencias (Disney por ejemplo tiene programa para PYMES en LATAM, costoso pero existe).
- Mientras tanto: imanes diseñados por nosotros + colaboraciones con artistas independientes con sus propias IPs.
- Documentado en [`CATALOG_SEED.md`](CATALOG_SEED.md) y deuda en `STATE.md`.

### 2. Política de devolución poco clara sobre quién paga retorno

- magneticas.cl: _"Coordinaremos contigo el retiro del producto en tu domicilio"_ — no especifica quién paga el envío.
- Bajo Ley 1480 art. 47 colombiana: si la causa del retracto es del consumidor (cambio de opinión), el consumidor paga el retorno. Si la causa es producto defectuoso, el proveedor paga.
- **Política Lucams (a publicar):** clara desde el primer día — _"Si retornás por arrepentimiento (5 días hábiles), tú pagas el envío de retorno. Si el producto llegó defectuoso, nosotros lo pagamos."_ Documentado en [COMPLIANCE.md § Retracto](COMPLIANCE.md#derecho-de-retracto-art-47--verificado).

### 3. Sin mención visible de Habeas Data al recolectar datos

- magneticas.cl tiene `/politica-de-privacidad-y-proteccion-de-datos/` (presente en sitemap) pero **el banner de cookies o aviso de privacidad no aparece de forma proactiva** en el primer visit (verificado en home a 2026-05-09).
- En Chile la Ley 19.628 de Datos Personales es menos exigente que la Ley 1581 colombiana en cuanto a **aviso previo y autorización expresa**.
- **Lucams cumple proactivamente** con banner de consentimiento ([SECURITY.md § Cookie consent banner](SECURITY.md#cookie-consent-banner--implementación)) y registro en tabla `Consent`.

### 4. Facturación: no claro si emiten factura electrónica DIAN

- magneticas.cl es chileno, así que cumple SII (Servicio de Impuestos Internos chileno), no DIAN.
- **No aplica como crítica directa**, pero ilustra que si en Chile alguien hace un sitio similar para CO sin operativizar DIAN, queda en falta.
- **Lucams cumple desde día 1** con `InvoiceProvider` adapter (ADR-025) y emisión automática post-`Order.PAID`.

---

## Gaps de UX detectados (oportunidades para Lucams)

> Mientras navegaba magneticas.cl, observé patrones que **podemos hacer mejor**.

| #   | Gap detectado                                                                                       | Cómo Lucams lo resuelve                                                                                                   |
| --- | --------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| 1   | **Variedad de cantidad por pack** está rígida (6 ó 12 ó 20). Si el cliente quiere 8, no hay opción. | **Bundle Creator dinámico** (3/5/10/N imanes con descuento progresivo). Producto NUEVO Lucams.                            |
| 2   | **Personalización fuera de la compra** (email/WhatsApp después). Punto de fricción y abandono.      | **Estudio de Personalización en vivo antes de pagar.**                                                                    |
| 3   | **No hay preview 3D** de cómo se va a ver el imán en una nevera real.                               | **Vista 3D con react-three-fiber** rotable.                                                                               |
| 4   | **Recomendaciones de diseño manuales** (cliente decide solo).                                       | **Asistente IA Claude** sugiere plantillas según ocasión.                                                                 |
| 5   | **Información sobre ocasiones** atomizada por categoría sin guía cruzada.                           | **Blog con ideas de regalo** SEO-optimizado (`/blog/ideas-regalo-dia-madre-colombia`).                                    |
| 6   | **Sin programa de fidelidad visible** en su home.                                                   | **Puntos Lucams** con `/cuenta/puntos` desde Fase 5.                                                                      |
| 7   | **Sin programa de referidos.**                                                                      | **`referralCode` único + reward para ambos.**                                                                             |
| 8   | **Reseñas mostradas como testimonios curados** (no UGC con foto del cliente).                       | **Reseñas con foto del cliente** (UGC), aprobación admin.                                                                 |
| 9   | **No hay portal mayorista B2B explícito** (publicitarios están en catálogo retail).                 | **`/mayorista`** con login separado o `isWholesale` flag, listas de precios escalonados, generación de PDF de cotización. |
| 10  | **Carrito abandonado** sin estrategia visible.                                                      | **Email automation 1h y 24h** con cupón en el primer recordatorio (vía pgmq + pg_cron).                                   |
| 11  | **PWA / instalación móvil** ausente.                                                                | **PWA instalable** con manifest + service worker.                                                                         |
| 12  | **Stock no indicado en tiempo real** (cliente puede agregar al carrito un producto agotado).        | **Stock realtime** (Supabase Realtime) que actualiza el botón de "Agregar al carrito" en vivo.                            |
| 13  | **Búsqueda básica.**                                                                                | **Postgres full-text** sobre `Product.name + description` con `gin` index.                                                |
| 14  | **Productos relacionados** no parecen sofisticados.                                                 | **Recomendaciones simples** en Fase 2 + IA-driven en Fase 3+.                                                             |
| 15  | **Carga de fotos** sin guía de calidad mínima (resolución, formato).                                | Estudio Lucams **valida MIME + tamaño + advierte si la resolución es baja para 300 DPI** antes de aceptar.                |

---

## Conclusión

magneticas.cl es un competidor **respetable** con catálogo maduro, copy emocional sólido y modelo de negocio probado. Pero tiene **3 debilidades estructurales** y **15 gaps de UX** que Lucams_shop puede convertir en ventaja real, no solo en marketing.

**La tesis del proyecto se confirma:**

> "Tomamos el modelo de negocio de magneticas.cl (que funciona) y lo construimos sobre un stack moderno (Next.js + Supabase) con valor agregado real (Estudio en vivo + 3D + IA + COD + sin marcas pirateadas + compliance CO + observabilidad), adaptado culturalmente a Colombia."

**Lo que NO debemos hacer:**

- Copiar a ciegas (sus errores legales, sus dependencias manuales).
- Diferenciar solo en branding (es necesario pero no suficiente).
- Lanzar sin compliance (DIAN, Habeas Data, Retracto) — sería peor que ellos por estar en CO.

**Lo que SÍ haremos** está distribuido en el [`ROADMAP.md`](ROADMAP.md) con tareas concretas por fase y criterios de aceptación medibles.
