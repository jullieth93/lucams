# Google Ecosystem & Inteligencia Artificial — Lucams Shop

> **Documento canónico vivo.** Especifica al detalle mínimo todas las integraciones de **Lucams Shop** con servicios de Google y capacidades de inteligencia artificial: **Google Gemini API (`v1beta` REST)** para el asistente creativo del Estudio y el copiloto interno ARM de soporte, **Google Analytics 4 (GA4)** y atribución first-party **UTM** bajo Ley 1581 (en contraste con el embudo propio sin cookies y el RUM de Web Vitals), **Google Merchant Center (`GET /feeds/google-merchant.xml`)**, **Google Search Console** y la infraestructura de **SEO técnico** (`sitemap.xml`, `robots.txt` y JSON-LD estructurado).

---

## 1. Visión arquitectónica y mapa de superficies

Lucams integra cuatro familias del ecosistema de Google sin acoplar SDKs pesados en el bundle ni comprometer el cumplimiento de la **Ley 1581 de 2012** (Habeas Data) ni de la **Ley 1480 de 2011** (Estatuto del Consumidor):

| Servicio                        | Superficie / protocolo                                                                                   | Archivos núcleo                                                                                                                                                                                            | Cuándo se activa                                                                                               | Impacto en CSP del navegador                                                                                                |
| ------------------------------- | -------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| **Google Gemini API**           | REST `POST /v1beta/models/{model}:generateContent` + `GET /v1beta/models` (0 SDK npm, 100 % server-side) | `apps/web/features/ai/{provider,gemini-provider,service,actions,schemas,support-copilot}.ts`                                                                                                               | En modo `full` (`GEMINI_API_KEY` requerida por `FULL_MODE_REQUIRED` en `apps/web/lib/env.ts`)                  | **Ninguno** (tráfico exclusivo servidor → Google)                                                                           |
| **Google Analytics 4 (GA4)**    | `gtag.js` (`afterInteractive`) con doble compuerta opt-in y sanitización de rutas/query                  | `apps/web/components/analytics-ga4.tsx`, `apps/web/lib/analytics.ts`, `apps/web/lib/security-headers.ts`                                                                                                   | Solo si `NEXT_PUBLIC_GA_MEASUREMENT_ID` coincide con `/^G-[A-Z0-9]+$/i` **y** `hasAnalyticsConsent() === true` | Condicional: solo agrega `googletagmanager.com` y `*.google-analytics.com` si `NEXT_PUBLIC_GA_MEASUREMENT_ID` está definida |
| **Google Merchant Center**      | Feed XML RSS 2.0 (`xmlns:g="http://base.google.com/ns/1.0"`) en `GET /feeds/google-merchant.xml`         | `apps/web/app/feeds/google-merchant.xml/route.ts`, `apps/web/lib/feeds/google-merchant.ts`                                                                                                                 | Solo en modo `full` (`!isCatalogMode()`); devuelve `404` en modo catálogo                                      | **Ninguno** (consumido por el crawler de Google Shopping)                                                                   |
| **Google Search Console & SEO** | Meta tag `google-site-verification` + TXT DNS, `/sitemap.xml`, `/robots.txt` y `<JsonLd>` con nonce CSP  | `apps/web/app/layout.tsx`, `apps/web/app/sitemap.ts`, `apps/web/app/robots.ts`, `apps/web/lib/seo/structured-data.ts`, `apps/web/components/json-ld.tsx`, `apps/web/app/producto/[slug]/product-jsonld.ts` | Permanente sobre `getCanonicalSiteUrl()`; meta tag condicional a `GOOGLE_SITE_VERIFICATION`                    | `<JsonLd>` inyecta el `x-nonce` de la respuesta                                                                             |

> **Fuentes de letra (`next/font/google`):** `apps/web/app/layout.tsx` importa las familias tipográficas en tiempo de compilación con `next/font/google`, autoalojando los `.woff2` en el dominio propio; la CSP conserva `https://fonts.googleapis.com` en `style-src` como respaldo seguro, sin enviar IPs de visitantes a `fonts.gstatic.com` en cada vista.

---

## 2. Variables de entorno

Definidas y validadas en `apps/web/lib/env.ts` y documentadas en `apps/web/.env.example`:

| Variable                        | Alcance                    | Requerida en PRD                         | Valor por defecto / formato         | Propósito                                                                                                                                                                                                |
| ------------------------------- | -------------------------- | ---------------------------------------- | ----------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GEMINI_API_KEY`                | Server-only                | Sí en modo `full` (`FULL_MODE_REQUIRED`) | API key de Google AI Studio         | Autentica `x-goog-api-key` contra `generativelanguage.googleapis.com`. Jamás se expone al navegador                                                                                                      |
| `GEMINI_MODEL_PRIMARY`          | Server-only                | Opcional                                 | `gemini-2.5-flash-lite`             | Modelo primario de baja latencia y bajo costo para sugerencias y borradores                                                                                                                              |
| `GEMINI_MODEL_FALLBACK`         | Server-only                | Opcional                                 | `gemini-2.5-flash`                  | Modelo de respaldo si el primario devuelve error HTTP (`429`/`5xx`), timeout o JSON inválido                                                                                                             |
| `NEXT_PUBLIC_GA_MEASUREMENT_ID` | Público (`NEXT_PUBLIC_*`)  | Opcional                                 | `G-XXXXXXXXXX` (`/^G-[A-Z0-9]+$/i`) | Habilita GA4 y ensancha las directivas `script-src`, `connect-src` e `img-src` de la CSP. Si falta o no cumple el regex, toda la capa GA4 queda en no-op                                                 |
| `GOOGLE_SITE_VERIFICATION`      | Server-only (RSC metadata) | Opcional                                 | Token alfanumérico de GSC           | Emite `<meta name="google-site-verification" content="..." />` desde `metadata.verification.google` en `apps/web/app/layout.tsx` (complementario al registro DNS `TXT` en [Cloudflare](./cloudflare.md)) |

---

## 3. Google Gemini API (`v1beta` REST nativo)

### 3.1 Arquitectura del cliente, modelos, timeouts y sonda de salud

Lucams consume la API REST `v1beta` de Gemini directamente con `fetchWithTimeout` (`apps/web/lib/fetch-with-timeout.ts`), **sin instalar `@google/generative-ai` ni `@google/genai`** (`ADR-058`). Todos los archivos bajo `apps/web/features/ai/` declaran `import "server-only"` (salvo `schemas.ts` y `actions.ts`, que actúa como frontera `"use server"`).

- **Endpoint base:** `https://generativelanguage.googleapis.com/v1beta/models`
- **Autenticación:** cabecera `x-goog-api-key: <GEMINI_API_KEY>` + `Content-Type: application/json`.
- **Cadena secuencial de modelos (`models()` / `geminiModels()`):** construye `[...new Set([primary, fallback])]` con `GEMINI_MODEL_PRIMARY` (`gemini-2.5-flash-lite`) y `GEMINI_MODEL_FALLBACK` (`gemini-2.5-flash`). Si ambos env vars tienen el mismo valor, el `Set` evita duplicar la llamada.
- **Estrategia de resiliencia (sin `CircuitBreaker` en memoria):** a diferencia de [Wompi](./wompi.md), [Aveonline](./aveonline.md) o [Resend](./resend-and-emails.md), Gemini **no instancia `lib/circuit-breaker.ts`**. Las invocaciones son acciones interactivas puntuales iniciadas por humanos (nunca en la ruta crítica de checkout ni webhooks), por lo que la latencia y los fallos se acotan con cuatro defensas deterministas:
  1. **Timeout estricto por modelo (`AbortSignal.timeout`):** `12 000 ms` por intento en el Estudio y `10 000 ms` por intento en el Copiloto de soporte.
  2. **Cero reintentos sobre el mismo modelo caído:** ante `429`, `5xx`, timeout o fallo de validación Zod sobre el JSON devuelto, registra `logger.warn` (`ai.gemini.model_fail` o `ai.support_copilot.model_fail`) y salta de inmediato al modelo de respaldo.
  3. **Salida estructurada doble:** envía `responseMimeType: "application/json"` + `responseSchema` (subconjunto OpenAPI soportado por Gemini) y vuelve a validar la cadena devuelta con **Zod** (`RawSuggestionSchema` / `CopilotResponseSchema`).
  4. **Degradación garantizada:** si los dos modelos fallan o falta `GEMINI_API_KEY`, el Estudio captura `AiUnavailableError` y muestra un aviso amable sin interrumpir la edición, mientras que el Copiloto de soporte entrega una plantilla contextual determinista (`source: "smart_template"`).
- **Sonda de salud segura (`probeGeminiHealth()` en `apps/web/features/ai/gemini-provider.ts`):** consumida por el panel `/admin/integraciones` (`apps/web/lib/integration-health.ts`):
  - Si `GEMINI_API_KEY` no está configurada → devuelve `{ status: "skipped", detail: "GEMINI_API_KEY no configurada.", latencyMs: 0 }` (nunca dispara falsas alarmas en entornos locales sin llave).
  - Si existe → ejecuta `GET https://generativelanguage.googleapis.com/v1beta/models` con `timeoutMs: 6000` y header `x-goog-api-key`.
  - **Cero consumo de cuota de generación:** valida que la llave autentica y cuenta cuántos modelos reporta la cuenta (`Key válida · N modelos disponibles`), registrando `health.gemini.http_fail` (`400`/`401`/`403`/`5xx`) o `health.gemini.fail` (red/timeout) si falla.

```mermaid
flowchart TD
  Call["Acción server-side (Estudio o Copiloto)"] --> KeyCheck{"¿Existe GEMINI_API_KEY?"}
  KeyCheck -- "No" --> FallbackOut["Estudio: AiUnavailableError / Copiloto: smart_template"]
  KeyCheck -- "Sí" --> M1["POST /v1beta/models/gemini-2.5-flash-lite:generateContent"]
  M1 --> Ok1{"¿HTTP 200 + JSON válido en Zod?"}
  Ok1 -- "Sí" --> Success["Retorna sugerencia tipada"]
  Ok1 -- "No (429 / 5xx / timeout / schema)" --> Warn1["logger.warn (model_fail)"]
  Warn1 --> M2["POST /v1beta/models/gemini-2.5-flash:generateContent"]
  M2 --> Ok2{"¿HTTP 200 + JSON válido en Zod?"}
  Ok2 -- "Sí" --> Success
  Ok2 -- "No" --> FallbackOut
```

---

### 3.2 Caso de uso 1 — Asistente creativo de diseño en el Estudio (`ADR-058`)

Permite al comprador escribir la ocasión de su regalo dentro de [el Estudio de personalización](../domains/studio-and-production.md) y recibir ideas concretas (frase corta opcional, color de la paleta de marca, idea de composición del pack y un consejo práctico).

#### Flujo completo de extremo a extremo

1. **UI cliente (`apps/web/app/estudio/[slug]/studio-ai-panel.tsx`):**
   - Solo se habilita cuando la tienda opera en modo `full` (`!isCatalogMode()`).
   - Modal accesible (`useDialogA11y`: foco inicial, focus trap, tecla `Escape`, retorno de foco) con campo `occasion` (`maxLength={200}`, botón deshabilitado si `occasion.trim().length < 3`) y aviso explícito de privacidad (`texts.ia.notaPrivacidad`) informando que el texto descriptivo se procesa con un proveedor externo de IA.
2. **Server Action (`suggestDesignAction` en `apps/web/features/ai/actions.ts`):**
   - **Compuerta server-side de modo tienda:** si `isCatalogMode()` es `true`, registra `ai.suggest.blocked_catalog_mode` y rechaza con mensaje amable (ocultar el botón en cliente nunca sustituye la autorización en el servidor).
   - **Validación de entrada (`DesignSuggestInputSchema` en `apps/web/features/ai/schemas.ts`):**
     - `occasion`: `z.string().trim().min(3).max(200)`
     - `productName`: `z.string().max(120)`
     - `slotCount`: `z.number().int().min(1).max(40)`
     - `allowText`: `z.boolean()`
   - **Filtro preventivo anti-PII (`sanitizeOccasion`):** antes de invocar al proveedor, inspecciona `occasion` contra `OCCASION_PII_PATTERNS`:
     - `/\b\d{6,12}\b/` (cédulas, NIT, cuentas o documentos)
     - `/[\w.+-]+@[\w-]+\.[\w.]+/` (correos electrónicos)
     - `/\b3\d{9}\b/` (celulares colombianos de 10 dígitos)
       Si cualquiera coincide, **reemplaza silenciosamente** `occasion` por `"ocasión especial"` (`NEUTRAL_OCCASION`). Nunca rechaza la petición del usuario y jamás permite que datos personales salgan hacia Google.
   - **Doble capa de rate-limit por ventana de 1 hora (`3600 s`):** tope de **`20` solicitudes/hora en producción** (`VERCEL_ENV === "production"`) y **`100`/hora en entornos no productivos**:
     - **Capa 1 (IP hasheada):** `rateLimit(ipKey("ai_suggest", ip), hourlyCap, 3600)`.
     - **Capa 2 (identidad contra rotación de IP):** si hay sesión autenticada usa `ownerKey("ai_suggest", customer.id)`; si es visitante anónimo con cookie `cart_session` usa `ownerKey("ai_suggest_sess", sessionId)`.
3. **Generación y mapeo seguro de marca (`gemini-provider.ts` + `service.ts`):**
   - Parámetros de inferencia: `timeoutMs: 12000`, `temperature: 0.9`, `maxOutputTokens: 400`, `GEMINI_RESPONSE_SCHEMA` con `propertyOrdering: ["phrase", "colorName", "layout", "tip"]`.
   - `SYSTEM_INSTRUCTION` fuerza español de Colombia en **tuteo estricto**, tono cálido/kawaii y salida exclusivamente JSON.
   - El LLM no inventa códigos hexadecimales arbitrarios: elige un `colorName` del enum cerrado `BRAND_COLORS` y `getDesignSuggestion()` lo resuelve en servidor a la paleta oficial de Lucams:
     - `morado` → `#7C6AAD` («Morado»)
     - `turquesa` → `#5DD9D1` («Turquesa»)
     - `rosado` → `#E85B9F` («Rosado»)
     - `coral` → `#F58A6F` («Coral»)
     - `amarillo` → `#FFD93D` («Amarillo»)
   - Si `input.allowText` es `false`, `service.ts` fuerza `phrase = null` aunque el modelo haya devuelto texto.

---

### 3.3 Caso de uso 2 — Copiloto interno ARM de soporte (`ADR-193`)

Asiste a los agentes del panel en `/admin/soporte/[id]` (`suggestSupportReplyAction` en `apps/web/app/admin/(panel)/soporte/actions.ts` → `generateSupportReplySuggestion` en `apps/web/features/ai/support-copilot.ts`), acelerando respuestas empáticas y jurídicamente exactas en [posventa y soporte](../domains/post-sale-and-support.md) bajo tres invariantes inquebrantables:

1. **Humano en el bucle y solo lectura:** exige `requireAdminAction({ capability: "support:manage" })`, aplica rate-limit de **`25` sugerencias/hora por administrador** (`admin-support-copilot:${adminId}`) y audita cada uso en `AdminActionLog` (`action: "support.copilot_suggest"`, `entityType: "SupportTicket"`, `metadata: { source }`). **Jamás envía correos, jamás cambia el estado de un pedido ni ejecuta reembolsos**: solo devuelve `{ draftBody, reasoningSummary, source }` al área de edición del agente.
2. **Cero PII enviada a Google (`sanitizeSupportTextForAi`):** antes de armar el prompt, excluye todas las notas internas (`!m.isInternal`), toma como máximo los últimos 5 mensajes públicos del hilo y aplica 7 reglas deterministas de redacción sobre el mensaje inicial y el historial (truncando el resultado a `1800` caracteres):

| Orden | Categoría detectada            | Patrón / lógica                                                                                 | Token de reemplazo      |
| ----- | ------------------------------ | ----------------------------------------------------------------------------------------------- | ----------------------- |
| 1     | Enlaces y capability URLs      | `/https?:\/\/\S+/gi`                                                                            | `[URL_REDACTADA]`       |
| 2     | Correos electrónicos           | `/[\w.+-]+@[\w-]+\.[\w.-]+/g`                                                                   | `[EMAIL_REDACTADO]`     |
| 3     | Referencias operativas Lucams  | `/\b(?:LCM-\d{4}-\d{1,6}\|COT-[A-Z0-9]{6}\|OP-[A-Z0-9]{6})\b/gi`                                | `[REFERENCIA_PEDIDO]`   |
| 4     | Teléfonos móviles/fijos CO     | `/(?:\+?57[\s.-]?)?\b3\d{2}[\s.-]?\d{3}[\s.-]?\d{4}\b/g`                                        | `[TELEFONO_REDACTADO]`  |
| 5     | Direcciones físicas urbanas CO | `Calle`, `Cll`, `Carrera`, `Cra`, `Kr`, `Avenida`, `Av`, `Diagonal`, `Transversal` + numeración | `[DIRECCION_REDACTADA]` |
| 6     | Cédulas, NIT, cuentas o guías  | Secuencias formateadas con puntos/guiones o corridas de `6` a `16` dígitos                      | `[DOCUMENTO_REDACTADO]` |
| 7     | Nombre del titular del ticket  | Nombre completo y cada token alfabético `>= 3` letras (ordenados de mayor a menor longitud)     | `[CLIENTE]`             |

Además, el pedido vinculado se resume en un `OrderSafeSnapshot` sin dirección, teléfono, correo ni número de guía real (solo booleano `hasTrackingNumber`, estado humano, método de pago, bandera `hasCustomDesignItem`, resumen de ítems `[personalizado]` / `[estándar]` y `minWarrantyMonths`). Cuando Gemini responde (`timeoutMs: 10000`, `temperature: 0.35`, `maxOutputTokens: 550`, `GEMINI_COPILOT_SCHEMA`), el servidor restaura localmente `[REFERENCIA_PEDIDO]` → `orderSnapshot.number` e inyecta el saludo personalizado (`¡Hola <PrimerNombre>!`) y la despedida (`Un abrazo,\nEquipo Lucams`) sin que el nombre ni el código del pedido hayan salido jamás a terceros.

3. **Guardarraíles legales colombianos (`apps/web/lib/consumer-law.ts`) y fallback `smart_template`:** tanto `COPILOT_SYSTEM_PROMPT` como la función determinista de respaldo `buildSmartTemplateFallback()` (usada cuando no existe `GEMINI_API_KEY` o fallan ambos modelos) aplican las reglas exactas de [cumplimiento legal](../COMPLIANCE.md):
   - **Derecho de retracto (Ley 1480 de 2011, art. 47):** `5` días hábiles desde la entrega **únicamente para productos estándar**. Si `order.hasCustomDesignItem` es `true`, explica con claridad la excepción legal de bienes confeccionados conforme a las especificaciones del consumidor (**art. 47 numeral 3**) y ofrece de inmediato la ruta de garantía de calidad.
   - **Garantía legal de calidad:** cobertura según `minWarrantyMonths` del pedido por defectos de impresión, corte, imán o daño en transporte, con respuesta de fondo en máximo `15` días hábiles (`WARRANTY_CLAIM_RESPONSE_BUSINESS_DAYS`).
   - **Plazo de reembolso (Ley 2439 de 2024):** máximo `15` días calendario una vez aprobado (`RETRACT_REFUND_MAX_CALENDAR_DAYS`).
   - **Habeas Data (Ley 1581 de 2012):** máximo `10` días hábiles para consultas (`HABEAS_DATA_CONSULTATION_BUSINESS_DAYS`) y `15` días hábiles para reclamos (`HABEAS_DATA_CLAIM_BUSINESS_DAYS`).

```mermaid
sequenceDiagram
  actor Admin as Agente (/admin/soporte/[id])
  participant SA as suggestSupportReplyAction
  participant Copilot as support-copilot.ts
  participant DB as PostgreSQL (Prisma)
  participant Gemini as Gemini REST v1beta

  Admin->>SA: Solicita borrador para ticketId
  SA->>SA: requireAdminAction(support:manage) + rateLimit(25/h)
  SA->>Copilot: generateSupportReplySuggestion(ticketId)
  Copilot->>DB: Lee ticket + últimos 5 msgs públicos + OrderSafeSnapshot
  Copilot->>Copilot: sanitizeSupportTextForAi() (redacta 7 clases de PII)
  alt GEMINI_API_KEY configurada
    Copilot->>Gemini: POST generateContent (prompt 0% PII, temp 0.35, timeout 10s)
    Gemini-->>Copilot: JSON { bodyWithoutGreeting, reasoningSummary }
    Copilot->>Copilot: Restaura [REFERENCIA_PEDIDO] + inyecta "¡Hola Nombre!" local
  else Sin llave o fallo en primario + fallback
    Copilot->>Copilot: buildSmartTemplateFallback(subject, orderSnapshot)
  end
  Copilot-->>SA: { draftBody, reasoningSummary, source }
  SA->>DB: recordAdminAction(support.copilot_suggest)
  SA-->>Admin: Borrador editable en pantalla (0 correos enviados)
```

---

## 4. Telemetría, GA4 y atribución UTM bajo Ley 1581

Lucams separa su observabilidad de producto y rendimiento en **cuatro canales independientes** con reglas de privacidad distintas, evitando perder visibilidad operativa del negocio cuando el visitante rechaza las cookies opcionales:

| Canal                                   | Destino                                      | ¿Requiere consentimiento «Analíticas»? | ¿Usa cookies / IDs de sesión?                           | Retención automática (`purgeExpiredEventLogs`)     | Propósito                                                                                                      |
| --------------------------------------- | -------------------------------------------- | -------------------------------------- | ------------------------------------------------------- | -------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| **Google Analytics 4 (GA4)**            | Google (`gtag.js`)                           | **Sí (doble compuerta estricta)**      | Sí (`_ga*` de Google)                                   | Gobernada en propiedad GA4                         | Embudos de adquisición publicitaria y audiencias externas                                                      |
| **Atribución UTM (`lucams_utm`)**       | Cookie first-party → `Order` y `Opportunity` | **Sí (`hasAnalyticsConsent()`)**       | Cookie `lucams_utm` (TTL 30 días, 0 PII)                | Vive en la orden/oportunidad comercial             | LTV, ingresos y margen real por canal/campaña en `/admin/metricas` y CRM                                       |
| **Embudo propio (`POST /api/funnel`)**  | Tabla `FunnelEventDaily` (PostgreSQL)        | **No (100 % anónimo y sin cookies)**   | **No** (no lee cookies ni guarda IP/UA/sessionId)       | **365 días** (`FUNNEL_EVENT_DAILY_RETENTION_DAYS`) | Diagnóstico real de conversión tienda + Estudio y errores de subida/exportación en `/admin/metricas`           |
| **RUM Web Vitals (`POST /api/vitals`)** | Tabla `WebVital` (PostgreSQL)                | **Sí (`hasAnalyticsConsent()`)**       | Correlaciona `cart_session` (UUID `HttpOnly`) si existe | **35 días** (`WEB_VITAL_RETENTION_DAYS`)           | Percentiles p50/p75/p95 (`LCP`, `INP`, `CLS`, `TTFB`, `FCP`, `LONGTASK`, `PAGEWEIGHT`) en `/admin/performance` |

---

### 4.1 Google Analytics 4 (`apps/web/components/analytics-ga4.tsx` y `apps/web/lib/analytics.ts`)

1. **Validación fail-closed y CSP condicional:**
   - `GA_MEASUREMENT_ID` valida `NEXT_PUBLIC_GA_MEASUREMENT_ID` contra `/^G-[A-Z0-9]+$/i`. Un valor vacío o mal pegado (como un bloque `<script>` completo) evalúa a `null`.
   - En `apps/web/lib/security-headers.ts` (`buildCsp`), si `NEXT_PUBLIC_GA_MEASUREMENT_ID` está vacía, **no se añade ningún dominio de Google Analytics ni Google Tag Manager** a la CSP. Cuando está presente, habilita `https://www.googletagmanager.com` en `script-src`, `https://*.google-analytics.com` en `connect-src` y ambos en `img-src`.
2. **Doble compuerta opt-in sin Consent Mode v2:**
   - Lucams **no envía pings sin permiso** de Google Consent Mode v2 (`denied` cookieless pings): antes de una aceptación explícita de la categoría «Analíticas» en el banner de cookies, `<AnalyticsGa4 />` devuelve `null` y el navegador no descarga `gtag.js`.
   - `<AnalyticsGa4 />` se suscribe mediante `useSyncExternalStore` al evento `cookie-consent-changed` (con snapshot SSR `false`). Si el visitante acepta a mitad de sesión, `initGa4Queue()` inicializa programáticamente `window.dataLayer` y `window.gtag` (sin `<script>` inline para no chocar con la CSP de nonces), configura `send_page_view: false` e inyecta `<Script strategy="afterInteractive" />`.
   - Cada llamada a `trackEvent()` y cada `page_view` en navegación SPA vuelve a verificar `isGa4Ready()` (`GA_MEASUREMENT_ID` + `window.gtag` + `hasAnalyticsConsent()`). Si el usuario revoca «Analíticas» durante la misma sesión, la emisión de eventos y vistas se detiene de inmediato (el script ya cargado en el DOM desaparece en la siguiente recarga completa).
3. **Sanitización anti-fuga de URLs y tokens (`sanitizeAnalyticsUrl`):**
   - **Exclusión total del backoffice:** cualquier ruta `/admin` o `/admin/*` devuelve `null` y jamás se reporta a GA4.
   - **Enmascaramiento de los 6 patrones de capability tokens:** antes de armar `page_path` y `page_location`, reemplaza segmentos secretos por placeholders fijos:
     - `/pedido/<token>` → `/pedido/[token]`
     - `/carrito/recuperar/<token>` → `/carrito/recuperar/[token]`
     - `/resena/<token>` → `/resena/[token]`
     - `/d/<token>` → `/d/[token]`
     - `/cotizacion/<token>` → `/cotizacion/[token]`
     - `/soporte/<token>` → `/soporte/[token]`
   - **Allowlist estricta de query params (`SAFE_ANALYTICS_QUERY_KEYS`, máx. 120 chars/valor):** solo conserva `categoria`, `subcategoria`, `ocasion`, `orden`, `pagina`, `variant`, `utm_source`, `utm_medium`, `utm_campaign`, `utm_term`, `utm_content`, `gclid` y `fbclid`. Descarta automáticamente `email`, `phone`, `token`, `code`, `id` de Wompi, `st`/`ot`/`qt`, `designId`, `q` de búsqueda libre y `error`.
4. **Conversión monetaria e inventario completo de eventos (`AnalyticsEvents`):**
   - La base de datos almacena precios en **centavos COP (`Int`)**; GA4 exige unidades enteras de moneda (pesos). Toda conversión pasa por `centsToCOP(centavos)` y `toGa4Item()` (`currency: "COP"`).
   - **9 eventos ecommerce estándar de GA4:**
     1. `view_item` — visualización de PDP con SKU, variante, categoría y precio en COP.
     2. `select_item` — clic sobre tarjeta de producto en listados/carruseles.
     3. `view_item_list` — impresión de grilla de categoría, subcategoría, ocasión o recomendador.
     4. `add_to_cart` — adición directa o desde el Estudio (usando `stashPersonalizedAddToCart` / `consumePersonalizedAddToCart` en `sessionStorage` bajo la clave `ga4:pending_personalized_add` al redirigir a `/carrito?personalized=1`).
     5. `view_cart` — apertura del carrito con valor total e ítems.
     6. `begin_checkout` — inicio del paso 1 de checkout (incluye `coupon` si aplica).
     7. `add_shipping_info` — confirmación de transportadora (`shipping_tier`).
     8. `add_payment_info` — envío del método de pago (`payment_type`: Wompi o contraentrega).
     9. `purchase` — compra confirmada con `transaction_id` (`LCM-YYYY-NNNN`), `shipping`, `tax` y deduplicación persistente vía `claimAnalyticsOnceKey` en `localStorage`/`sessionStorage`.
   - **7 eventos personalizados del Estudio (`StudioAnalyticsParams` — cero PII, cero `designId`):** todos reciben `{ product_slug, editor_kind: "photo" | "name" | "letterset", device_category?, error_code? }`:
     1. `studio_open` — apertura del editor de personalización.
     2. `studio_template_select` — selección de plantilla o estilo base.
     3. `studio_asset_upload_succeeded` — subida y validación exitosa de fotografía.
     4. `studio_asset_upload_failed` — fallo de subida con `error_code` tipado.
     5. `studio_preview_open` — apertura de la modal «Ver diseño».
     6. `studio_finalize_succeeded` — aprobación del diseño y generación de assets para taller.
     7. `studio_finalize_failed` — fallo al finalizar diseño con `error_code`.

---

### 4.2 Atribución first-party `lucams_utm` (`apps/web/lib/utm-attribution.ts`)

Complementa a GA4 estampando el canal de adquisición directamente en la base de datos transaccional para medir LTV e ingresos reales en [CRM, B2B y fidelización](../domains/crm-b2b-and-loyalty.md):

- **Captura en cliente (`apps/web/components/utm-tracker.tsx`):**
  - Ignora rutas `/admin*`.
  - Si `hasAnalyticsConsent()` es `false` (o si el visitante revoca el consentimiento en `cookie-consent-changed`), **borra inmediatamente** la cookie con `lucams_utm=; Max-Age=0; Path=/; SameSite=Lax`.
  - Cuando hay consentimiento y la URL trae al menos un parámetro `utm_source`, `utm_medium` o `utm_campaign` válido (`extractUtmFromSearchParams`), escribe `lucams_utm` con `Max-Age=2592000` (**30 días**), `Path=/; SameSite=Lax` y flag `; Secure` en HTTPS. Si la navegación interna posterior no trae `utm_*`, conserva intacta la atribución original (first-touch dentro de la ventana).
- **Sanitización doble (cliente + servidor) cero PII:**
  - `sanitizeUtmValue` rechaza cualquier cadena con `@` o con 7 o más dígitos consecutivos (`/\d{7,}/`, teléfonos/cédulas), limpia caracteres fuera de `[a-zA-Z0-9._\-+/ ]` y trunca a `80` chars (`120` para `utm_campaign`).
  - `sanitizeLandingPath` elimina query/hash, exige prefijo `/`, rechaza `@` y enmascara `/pedido/[token]`, `/cotizacion/[token]` y `/carrito/recuperar/[token]` (`160` chars máx.).
  - `parseUtmCookie` en servidor rechaza cookies `> 1024` bytes y re-ejecuta `sanitizeUtmValue` + `sanitizeLandingPath` antes de tocar Prisma.
- **Entidades donde se estampa:**
  - **`Order`** (`apps/web/features/checkout/service.ts` → `createOrderFromCart` en `apps/web/features/orders/service.ts`): persiste `utmSource`, `utmMedium`, `utmCampaign` y `landingPath`.
  - **`Opportunity`** (`submitB2bInquiryAction` en `apps/web/features/opportunities/actions.ts`): combina valores explícitos del formulario `/empresas-y-eventos` con fallback a `parseUtmCookie` y persiste `utmSource`, `utmMedium`, `utmCampaign` y `landingPath`.
  - _Nota sobre `Quote`:_ el modelo `Quote` no almacena columnas `utm*` propias; la atribución comercial vive en la `Opportunity` B2B de origen o en la `Order` resultante al convertir.

---

### 4.3 Contraste con el embudo propio sin cookies (`POST /api/funnel`) y Web Vitals (`POST /api/vitals`)

1. **Embudo anónimo tienda + Estudio (`POST /api/funnel` → `FunnelEventDaily`):**
   - Implementado en `apps/web/app/api/funnel/route.ts`, `apps/web/features/analytics/funnel-schema.ts` y `apps/web/features/analytics/funnel-service.ts`.
   - **Sin cookies ni consentimiento opcional:** no lee ninguna cookie (`cart_session`, Auth ni `lucams_utm`), no guarda IP ni `user-agent` (el header `user-agent` solo se evalúa en memoria como fallback de `mobile | tablet | desktop | unknown` y se descarta al instante) y solo acepta enums cerrados en Zod (`13` eventos en `FUNNEL_EVENT_NAMES`, `5` superficies en `FUNNEL_EDITOR_KINDS`, `9` códigos de error en `FUNNEL_ERROR_CODES` y `productSlug` kebab-case o `_all`).
   - **Protección contra abuso:** límite de cuerpo de `4 KB`, rate-limit de `180 req/min` por IP hasheada (`ipKey("funnel", ip)`) y backstop global de `6000 req / 5 min`.
   - **Agregación diaria y retención:** hace `INSERT ... ON CONFLICT DO UPDATE` sobre `FunnelEventDaily` agrupado por día calendario en `America/Bogota` (`bogotaDayUtcDate`). Se conserva **365 días** (`FUNNEL_EVENT_DAILY_RETENTION_DAYS` en `apps/web/features/observability/event-log-retention.ts`) para alimentar las 11 etapas del embudo y las tarjetas de salud del Estudio en `/admin/metricas`.
2. **RUM Core Web Vitals (`POST /api/vitals` → `WebVital`):**
   - `<WebVitalsReporter />` (`apps/web/components/web-vitals.tsx`) usa el build con atribución `next/dist/compiled/web-vitals-attribution` (`onCLS`, `onFCP`, `onINP`, `onLCP`, `onTTFB`, excluyendo el deprecado `onFID`) más dos acumuladores propios por vista (`LONGTASK` y `PAGEWEIGHT`), normalizando rutas dinámicas (`/producto/[slug]`, `/estudio/[slug]`, `/admin/productos/[id]`, `/admin/categorias/[id]`).
   - **Gate opt-in estricto:** verifica `hasAnalyticsConsent()` antes de cada `navigator.sendBeacon`.
   - **Protección en servidor (`apps/web/app/api/vitals/route.ts`):** techo de `16 KB`, rate-limit `120 req/min` por IP hasheada + backstop global `3000 / 5 min`, techos fail-closed por métrica (`MAX_VALUE_BY_METRIC`, ej. `INP <= 10 000 ms`, `LCP <= 60 000 ms`) y retención de **35 días** (`WEB_VITAL_RETENTION_DAYS`). Para detalles de SLOs y paneles RUM consulta [Observabilidad](../OBSERVABILITY.md).

---

## 5. Google Merchant Center (`GET /feeds/google-merchant.xml`)

El endpoint `apps/web/app/feeds/google-merchant.xml/route.ts` y el builder puro `apps/web/lib/feeds/google-merchant.ts` exponen el catálogo comprable en formato **RSS 2.0 con namespace `xmlns:g="http://base.google.com/ns/1.0"`** para listados gratuitos y campañas de Shopping.

### Reglas de negocio, elegibilidad y formato XML

- **Compuerta de modo tienda:** en modo catálogo (`isCatalogMode() === true`) responde **`404 Not found`**. Sin checkout en línea activo no se anuncian ofertas comprables en Google Shopping.
- **Filtro de elegibilidad idéntico al storefront (`STOREFRONT_PRODUCT_WHERE`):** solo incluye productos activos (`isActive: true`, `deletedAt: null`) pertenecientes a una categoría activa y no eliminada, y dentro de cada producto solo variantes activas (`isActive: true`, `deletedAt: null`). Productos sin variantes activas no generan nodos `<item>`.
- **Granularidad 1 `<item>` por variante activa:**
  - `<g:id>`: `variant.sku` (único globalmente en Prisma).
  - `<g:item_group_id>`: `product.slug` (agrupa las opciones del mismo producto en Merchant Center).
  - `<title>`: si el nombre de la variante pertenece a `TRIVIAL_VARIANT_NAMES` (`default`, `única`, `unica`, `estándar`, `estandar`), usa `product.name`; en caso contrario emite `${product.name} — ${variant.name}`.
  - `<g:description>`: `plainDescription(product.description)` elimina etiquetas HTML, colapsa espacios y trunca a `5000` caracteres, escapando los 5 caracteres XML (`&`, `<`, `>`, `"`, `'`).
  - `<link>`: deep-link absoluto `${siteUrl}/producto/${product.slug}?variant=${encodeURIComponent(variant.id)}` (preselecciona la variante exacta en la PDP para que precio y stock coincidan con lo rastreado por Google).
  - `<g:image_link>`: primera imagen de `variant.images` o fallback a `product.images[0]`, resuelta siempre como URL absoluta. Si no existe ninguna imagen, omite la etiqueta sin inventar URLs.
  - `<g:availability>`: `"in stock"` cuando `variant.stock > 0`, `"out of stock"` cuando `variant.stock <= 0`.
  - `<g:price>`: convierte de centavos COP (`Int`) a pesos enteros con sufijo ISO: `((variant.price ?? product.basePrice) / 100).toFixed(0) + " COP"` (ej. `45000 COP`).
  - `<g:brand>`: `Lucams Shop` · `<g:condition>`: `new`.
  - `<g:identifier_exists>`: **`no`**. Al tratarse de productos personalizados y artesanales propios sin códigos GTIN/EAN ni MPN de fabricante externo, se declara honestamente `no` conforme a la especificación oficial de Google Merchant Center.
  - **Sin `<g:shipping>` ni devoluciones hardcoded en XML:** las tarifas reales dependen de Aveonline y de «Envío Lucams» en Bogotá (ver [Checkout, pagos y envíos](../domains/checkout-payments-shipping.md)), por lo que envío y devoluciones se configuran a nivel cuenta en la consola de Merchant Center.
- **Estrategia de caché y manejo de fallos de DB:**
  - El route handler declara `export const dynamic = "force-dynamic"` para consultar stock real en origen sin que el Data Cache de Next retenga respuestas fallidas, y responde `200` con `Content-Type: application/xml; charset=utf-8` y `Cache-Control: public, s-maxage=3600, stale-while-revalidate=3600` (1 hora en el Edge CDN de [Vercel](./vercel.md)).
  - Si PostgreSQL no responde, devuelve **`503 Service unavailable`** en `text/plain` con `Cache-Control: no-store` para que el CDN jamás cachee el error y el _scheduled fetch_ de Google reintente limpiamente.

---

## 6. Google Search Console y SEO técnico

### 6.1 Verificación de propiedad (`GOOGLE_SITE_VERIFICATION` + DNS)

Lucams soporta simultáneamente los dos mecanismos oficiales de verificación en Google Search Console:

1. **Propiedad de Dominio (recomendada en producción):** registro `TXT` en el apex de `lucamsshop.com` gestionado en [Cloudflare](./cloudflare.md) (`google-site-verification=...`), que cubre subdominios y protocolos.
2. **Prefijo de URL (meta tag HTML):** en `apps/web/app/layout.tsx`, si `process.env.GOOGLE_SITE_VERIFICATION` está definida, Next.js inyecta `<meta name="google-site-verification" content="..." />` dentro del `<head>` raíz.

### 6.2 `robots.txt` (`apps/web/app/robots.ts`)

Generado dinámicamente (`force-dynamic`) sobre `getCanonicalSiteUrl()`:

- **`Allow: /`** para `User-agent: *` — incluye explícitamente `/_next/` (indispensable para que Googlebot ejecute chunks JS/CSS y `Googlebot-Image` rastree las imágenes optimizadas por `/_next/image`), `/feeds/google-merchant.xml` y `/productos?categoria=*`.
- **`Disallow`:** `/admin/`, `/api/`, `/auth/`, `/mi-cuenta/` y `/maintenance`. El contenido duplicado por filtros secundarios u ordenamientos se controla con etiquetas `<link rel="canonical">` en `generateMetadata` de [catálogo y CMS](../domains/catalog-and-cms.md).
- Declara `Sitemap: https://lucamsshop.com/sitemap.xml` y `Host: https://lucamsshop.com`.

### 6.3 `sitemap.xml` dinámico (`apps/web/app/sitemap.ts`)

Ejecuta en paralelo (`Promise.all` con fallback seguro a rutas estáticas si la DB no está accesible durante un build aislado) e incluye 5 familias de URLs sobre `getCanonicalSiteUrl()`:

1. **15 rutas estáticas (`STATIC_PATHS`, sin `lastModified` artificial):** `/`, `/productos`, `/ocasion`, `/recomendador`, `/rastrear`, `/ayuda`, `/contacto` y las 8 páginas legales (`/legal/{privacidad,terminos,cookies,devoluciones,garantias,habeas-data,subprocesadores,security}`). Omiten `lastModified` a propósito para no emitir un timestamp falso en cada request dinámico.
2. **Categorías raíz activas (`parentId: null`):** `${baseUrl}/productos?categoria=${slug}` con `lastModified: updatedAt`.
3. **Subcategorías activas con padre activo:** ruta jerárquica `${baseUrl}/productos/${parent.slug}/${slug}` con `lastModified: updatedAt`.
4. **Landings de ocasión activas (`OcasionTag`):** `${baseUrl}/ocasion/${slug}` con `lastModified: updatedAt`.
5. **Productos activos con categoría activa:** `${baseUrl}/producto/${slug}` con `lastModified: updatedAt`.

### 6.4 Datos estructurados JSON-LD y blindaje anti-XSS

Todos los bloques `schema.org` se renderizan en servidor con el nonce CSP (`x-nonce` leído de `headers()`, `suppressHydrationWarning`) y escapan `<` (`\u003c`), `>` (`\u003e`) y `&` (`\u0026`) vía `escapeJsonLd()` (`apps/web/lib/seo/structured-data.ts`) para impedir inyecciones XSS mediante cierre prematuro de `</script>`:

| Superficie                                                                           | Schemas emitidos                                 | Archivos                                                      | Reglas clave                                                                                                                                                                                                                                                                                            |
| ------------------------------------------------------------------------------------ | ------------------------------------------------ | ------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Home (`/`)**                                                                       | `Organization` + `WebSite`                       | `apps/web/app/page.tsx`                                       | Incluye logo absoluto `/brand/lucams-logo.png` y `sameAs` filtrado con las redes sociales activas del CMS (`SOCIAL_*_URL`)                                                                                                                                                                              |
| **Listados (`/productos`, `/productos/[cat]/[sub]`, `/ocasion`, `/ocasion/[slug]`)** | `CollectionPage` (`ItemList`) + `BreadcrumbList` | `apps/web/lib/seo/structured-data.ts` + `<JsonLd>`            | Usa `itemUrlPrefix: "/ocasion/"` en el índice `/ocasion` y `"/producto/"` en colecciones de productos                                                                                                                                                                                                   |
| **Ficha de producto (`/producto/[slug]`)**                                           | `Product` + `BreadcrumbList`                     | `apps/web/app/producto/[slug]/product-jsonld.ts` + `<JsonLd>` | Convierte centavos → pesos (`toFixed(0)`), emite `Offer` (precio único) o `AggregateOffer` (`lowPrice`/`highPrice` cuando hay múltiples variantes), incluye `AggregateRating` **solo** cuando existen reseñas reales aprobadas y **omite `offers` por completo en modo catálogo** (`catalogMode: true`) |

---

## 7. Checklist paso a paso de configuración en consolas de Google

### 7.1 Google AI Studio (Gemini API)

1. Ingresa a [Google AI Studio](https://aistudio.google.com/) con la cuenta corporativa de Lucams y crea un proyecto dedicado para producción y otro separado para staging/desarrollo.
2. En **Get API key → Create API key**, genera la llave y cópiala únicamente en Vercel (`GEMINI_API_KEY` en Production y Preview; ver [Vercel](./vercel.md)).
3. Verifica que la facturación Pay-as-you-go (Tier 1) esté vinculada en Google Cloud Console si el tráfico supera las cuotas gratuitas de `gemini-2.5-flash-lite` y `gemini-2.5-flash`.
4. Tras desplegar, abre `/admin/integraciones` y comprueba que la tarjeta **Gemini** muestre `ok` (`Key válida · N modelos disponibles`).

### 7.2 Google Analytics 4 (GA4)

1. En [Google Analytics](https://analytics.google.com/) → **Admin → Crear propiedad**, configura zona horaria **Colombia (`GMT-05:00`)** y moneda **Peso colombiano (`COP`)**.
2. Crea un **Flujo de datos Web** apuntando a `https://lucamsshop.com` y copia el **ID de medición** (`G-XXXXXXXXXX`).
3. En **Ajustes de flujo → Medición mejorada**, **desactiva «Vistas de página» automáticas por cambios en el historial del navegador**, ya que `<AnalyticsGa4 />` emite `page_view` manuales sanitizados (`send_page_view: false`) en cada navegación SPA.
4. En **Admin → Definiciones personalizadas → Dimensiones personalizadas**, registra `product_slug`, `editor_kind`, `device_category` y `error_code` (alcance _Evento_) para explotar los 7 eventos del Estudio.
5. En **Admin → Recogida y modificación de datos → Retención de datos**, selecciona `14 meses` y mantén desactivado Google Signals si no se ha actualizado el aviso de privacidad.
6. Configura `NEXT_PUBLIC_GA_MEASUREMENT_ID=G-XXXXXXXXXX` en Vercel Production y redespliega. Verifica en el navegador que **antes** de aceptar «Analíticas» en el banner no exista ninguna petición a `googletagmanager.com` en la pestaña Network.

### 7.3 Google Merchant Center Next

1. Ingresa a [Google Merchant Center](https://merchants.google.com/), registra el comercio **Lucams Shop** con país **Colombia**, zona horaria `America/Bogota` y reclama el sitio `https://lucamsshop.com` (automático si usas la misma cuenta verificada en Search Console).
2. En **Configuración → Envío y devoluciones**, configura a nivel cuenta la política de cobertura nacional (Aveonline) y Bogotá («Envío Lucams»), así como la política de devoluciones y garantías alineada con `/legal/devoluciones` y `/legal/garantias` (recuerda que el XML no envía `<g:shipping>`).
3. En **Productos → Fuentes de datos → Añadir fuente de productos**, elige **Añadir productos desde un archivo**, ingresa la URL `https://lucamsshop.com/feeds/google-merchant.xml` y programa la **obtención diaria** (ej. `05:00 COT`).
4. Ejecuta **Obtener ahora** y verifica que todos los SKUs activos se importen sin errores críticos de precio (`COP`) ni de identificadores (`identifier_exists = no`).

### 7.4 Google Search Console

1. En [Google Search Console](https://search.google.com/search-console), añade la propiedad de tipo **Dominio** `lucamsshop.com` y copia el registro `TXT` (`google-site-verification=...`) en la zona DNS de [Cloudflare](./cloudflare.md) (opcionalmente configura también `GOOGLE_SITE_VERIFICATION` en Vercel para prefijo HTTPS).
2. En **Indexación → Sitemaps**, envía `https://lucamsshop.com/sitemap.xml` y confirma estado **Correcto**.
3. Revisa periódicamente los informes **Productos (Fragmentos de comerciante)**, **Rutas de exploración (Breadcrumbs)** y **Métricas web principales** para contrastarlos con `/admin/performance`.

---

## 8. Referencias oficiales verificadas y documentos relacionados

### Fuentes externas oficiales

- **Google Gemini API — `generateContent` REST & Structured Outputs (`v1beta`):** `https://ai.google.dev/api/generate-content` y `https://ai.google.dev/gemini-api/docs/structured-output` (verificado `2026-07-13` / `2026-11-05`).
- **Google Gemini API — Modelos y precios (`gemini-2.5-flash-lite` / `gemini-2.5-flash`):** `https://ai.google.dev/pricing` (verificado `2026-11-05`).
- **Google Analytics 4 — Eventos recomendados de comercio electrónico (`gtag.js`):** `https://developers.google.com/analytics/devguides/collection/ga4/ecommerce` (verificado `2026-10-28`).
- **Google Merchant Center — Especificación de datos de productos RSS 2.0 (`xmlns:g`) y `identifier_exists`:** `https://support.google.com/merchants/answer/7052112` y `https://support.google.com/merchants/answer/6324478` (verificado `2026-10-28`).
- **Google Search Central — Sitemaps, JavaScript SEO (`/robots.txt` + `/_next/`) y datos estructurados `Product`:** `https://developers.google.com/search/docs/crawling-indexing/sitemaps/build-sitemap`, `https://developers.google.com/search/docs/crawling-indexing/javascript/javascript-seo-basics` y `https://developers.google.com/search/docs/appearance/structured-data/product` (verificado `2026-10-28`).
- **Next.js 16 — Metadata Files (`sitemap.ts` y `robots.ts`):** `https://nextjs.org/docs/app/api-reference/file-conventions/metadata/sitemap` y `https://nextjs.org/docs/app/api-reference/file-conventions/metadata/robots` (verificado `2026-10-28`).

### Documentación interna relacionada

- Mapa de integraciones: [`./README.md`](./README.md) · Despliegue y Edge CDN: [`./vercel.md`](./vercel.md) · DNS y verificación de dominio: [`./cloudflare.md`](./cloudflare.md)
- Dominios funcionales: [Estudio y producción](../domains/studio-and-production.md) · [Catálogo y CMS](../domains/catalog-and-cms.md) · [CRM, B2B y fidelización](../domains/crm-b2b-and-loyalty.md) · [Posventa y soporte](../domains/post-sale-and-support.md)
- Gobierno transversal: [Seguridad y CSP](../SECURITY.md) · [Cumplimiento Ley 1581 / Ley 1480](../COMPLIANCE.md) · [Observabilidad y RUM](../OBSERVABILITY.md) · [Operaciones](../OPERATIONS.md) · [Decisiones de arquitectura](../DECISIONS.md)
