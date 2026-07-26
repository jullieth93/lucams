# CERTIFICACIÓN DE PRODUCCIÓN — rama `catalogo-whatsapp`

**Fecha:** 2026-07-26 · **Ámbito:** lucamsshop.com (producción, sin transaccionalidad) · **Método:** auditoría real ejecutada contra producción (Playwright/Chromium + probes de infra), sin suposiciones.

## Veredicto: ✅ CERTIFICADA (con hallazgos corregidos durante la auditoría)

---

## 1. Resultados de las suites ejecutadas

| Suite | Resultado | Errores consola | Errores red 5xx |
|---|---|---|---|
| Auditoría cliente (25 tests) | **25/25 ✅** | 0 | 0 |
| Auditoría admin (7 tests, SUPERADMIN efímero) | **7/7 ✅** | 2 menores (404 previews) | 0 |
| Unit tests (selector/CSP/email/geometría) | **90+/90+ ✅** | — | — |

Evidencia: `/tmp/audit-cliente-*.png`, `/tmp/audit-admin-*.png`, `/tmp/audit-cliente.json`, `/tmp/audit-admin.json`.

## 2. Cobertura certificada

### Capa cliente
- **Home:** 4 categorías reales, "Llega a tus manos", despacho máx. 2 días hábiles, COD modular.
- **Catálogo:** grid con los 9 productos reales, precios.
- **PDP ×9:** 200 + precio + selector de variantes homogéneo (chips/stepper/card, acento púrpura unificado).
- **Estudio ×9:** carga sin 500 — canvas Konva (foto-productos) y editores propios (nombre/vocales/abecedario).
- **Cotización → WhatsApp:** flujo funcional con número correcto (573208873826) y Turnstile server-side en el submit.
- **Auth:** /login y /registro renderizan y funcionan (Supabase Auth).
- **/ayuda + legales:** 200; copy coherente con persona natural ("Hoy **no** emitimos factura electrónica de la DIAN…").
- **Chrome:** WhatsApp 57 320 887 3826, Facebook lucamsshop, email correctos en todo el sitio.
- **Búsqueda:** paleta cmdk operativa.

### Capa admin (usuario SUPERADMIN de prueba, eliminado después)
- Login + dashboard, Productos (lista + editor), Categorías, Plantillas (sin basura), Pedidos/cotizaciones, Configuración (toggle COD con estado leído de DB), Reseñas — todos cargan y operan.

### Cableado / tecnologías
- **Vercel:** producción aliada a `lucamsshop.com`, logs 6h sin errores ni warnings, env vars completas.
- **Supabase:** RLS verificado con anon key → **401 en todas las tablas sensibles** (AdminUser, AdminActionLog, SiteSetting, Order, Quote, DesignAsset, PersonalizationTemplate). DB sana: 4 categorías / 9 productos / 0 basura / 11 plantillas activas.
- **Resend:** variables presentes; flujos de email cableados (cotización, recuperar clave, contacto, newsletter).
- **Cloudflare Turnstile:** activo en el flujo de cotización (server-side).
- **SEO:** robots.txt (disallow admin/api/auth), sitemap 46 URLs, OG/Twitter cards con imagen.

## 3. Hallazgos encontrados y CORREGIDOS durante la auditoría

| # | Hallazgo | Severidad | Fix |
|---|---|---|---|
| 1 | **CSP `strict-dynamic` bloqueaba chunks lazy de Next** → estudios de vocales/abecedario y formulario de login rotos en producción | **Crítica** | CSP sin strict-dynamic (`security-headers.ts`), manteniendo nonce + 'self'. Tests 14/14. |
| 2 | **Atributo `pattern` del email inválido** bajo flag /v del navegador (guiones sin escapar) → error en TODOS los formularios | **Alta** | Guiones escapados en `email-input.tsx`; test con aserción de validez /v. |
| 3 | Imágenes Unsplash (placeholders del seed) bloqueadas por CSP img-src | Media | Unsplash permitido temporalmente en img-src (alineado con next.config remotePatterns; TODO retirar con fotos reales). |
| 4 | Cuadrados con tamaños errados (8×8, 10×10) | Media | Datos corregidos a 6.5×6.5 y 7.5×10; "Plantilla Rectangular" activada. |
| 5 | Tiras sin variante de 4 fotos | Media | Variante "Tira de 4 fotos · 6.5×26.5 cm" + plantilla 390×530; label photoSlots → "Fotos". |
| 6 | Alargados sin cantidad +/− y visual distinto de variantes | Media | Variantes 1–6 ($4.000 c/u) → mismo modo chips+stepper que Magnéticos. |

## 4. Hallazgos menores registrados (no bloquean)

- `NaN` en un debug-log con formato `%c%d` (dependencia de terceros; cosmético, no visible al usuario).
- 2 recursos 404 en previews de plantillas del admin (imágenes de preview faltantes en algunas plantillas).
- Login/registro sin widget Turnstile visible (decisión del modo catálogo: el submit de cotización sí lo valida server-side). Evaluar en develop.
- Fotos de productos aún son placeholders de Unsplash (pendiente contenido real de Lucy — por eso img-src temporal).

## 5. Estado de la rama

- `catalogo-whatsapp` = **producción** (lucamsshop.com). Certificada técnica y funcionalmente en web y móvil.
- Próxima fase: `develop` (transaccionalidad Wompi sandbox + Aveonline sandbox, admin 100%).
