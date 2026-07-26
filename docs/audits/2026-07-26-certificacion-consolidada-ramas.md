# CERTIFICACIÓN CONSOLIDADA — `catalogo-whatsapp` (producción) y `develop` (transaccional)

**Fecha:** 2026-07-26 · **Método:** auditoría real ejecutada (Playwright/Chromium, suites unitarias, probes de infra, integraciones en vivo sandbox), sin suposiciones.

---

## Estado de ramas y despliegue

| Rama | Rol | Estado |
|---|---|---|
| `catalogo-whatsapp` | **Producción** (lucamsshop.com) | ✅ Certificada · Vercel Production Branch = esta rama (auto-deploy al push) |
| `develop` | Transaccional (preview) | ✅ Certificada en modo full · queda como preview hasta aprobación final |
| `production`/`master` | Cierre final | Se promueve cuando develop esté aprobada |

---

## 1. `catalogo-whatsapp` — CERTIFICADA (sin transaccionalidad)

### Suites
- Auditoría cliente: **25/25** (0 errores consola, 0 errores 5xx)
- Auditoría admin: **7/7** (SUPERADMIN efímero, eliminado después)
- Inventario admin: **35/35 rutas REALES** (0 placeholders)

### Hallazgos corregidos durante la auditoría
| # | Hallazgo | Fix |
|---|---|---|
| 1 | **CSP `strict-dynamic` bloqueaba chunks lazy de Next** (estudios sets, login rotos) — **crítico** | CSP sin strict-dynamic (nonce + 'self') |
| 2 | **`pattern` de email inválido** bajo flag /v del navegador (todos los formularios) | Guiones escapados en `email-input.tsx` |
| 3 | Cuadrados con tamaños errados (8×8, 10×10) | Datos a 6.5×6.5 y 7.5×10 + Plantilla Rectangular |
| 4 | Tiras sin variante 4 fotos | Variante + plantilla 390×530; label photoSlots→"Fotos" |
| 5 | Alargados sin cantidad +/− ni visual homogéneo | Variantes 1–6 → modo chips+stepper = Magnéticos |
| 6 | Unsplash (placeholders seed) bloqueado por CSP img-src | Permitido temporal (TODO retirar con fotos reales) |
| 7 | Selector de variantes visual inconsistente | Acento púrpura unificado en los 3 modos |

### Cableado verificado
- **Vercel:** prod aliada, logs limpios, env completas.
- **Supabase:** RLS → **401 en todas las tablas sensibles** con anon key. DB sana (4 cat / 9 prod / 0 basura).
- **Resend:** flujos de email cableados. **Turnstile:** en submit de cotización.
- **SEO:** robots (disallow admin/api/auth), sitemap 46 URLs, OG con imagen.

## 2. `develop` — CERTIFICADA (transaccional sandbox)

### Suites transaccionales
| Área | Resultado |
|---|---|
| payments + checkout | **91/91** (idempotencia, orders, Wompi) |
| shipping (unit) | **13/13** |
| compra E2E | **2/2** (carrito + checkout datos en modo full) |
| **Aveonline EN VIVO** | **2/2** — cotizaciones reales Bogotá→Medellín (8.2s) y Bogotá→Bogotá (10.6s), 7 transportadoras |
| **Wompi sandbox** | **3/3** — URL checkout aceptada (200), webhook firmado procesado (200), firma inválida rechazada (401) |
| Auditoría cliente (full) | **25/25** |
| Auditoría admin (full) | **7/7** |

### Configuración clave (ya aplicada)
- `WOMPI_ENV=sandbox` ✓ (llaves sandbox; webhook valida firma + ambiente test/prod).
- `AVEONLINE_ENV=test` + `AVEONLINE_DEMO_USUARIO/CLAVE/IDEMPRESA` (cuenta demo pública idempresa 15289). **Aveonline NO tiene sandbox dedicado**: la demo opera contra producción sin facturar (`bloquegenerarguia=0`).
- `NEXT_PUBLIC_STORE_MODE=full` en develop (build-env por deployment; branch-scoped env disponible ahora que Production Branch = catalogo-whatsapp).

## 3. Panel admin — 100% FUNCIONAL (ambas ramas)

**35/35 módulos reales** (de 27 reales + 8 construidos). Los 8 habilitados:
- **Reclamos de garantía** (WarrantyClaim: resolver/rechazar con remedio Ley 1480).
- **Mensajes de clientes** (SupportTicket: bandeja abierto/en-proceso/cerrado).
- **Precios mayoristas B2B** (WholesaleTier nuevo: niveles por producto/catálogo).
- **Materiales e insumos** (Material nuevo: stock + alerta bajo stock).
- **Costos y márgenes** (Product.cost vs precio: margen $ y %, edición inline).
- **Canal: Tienda online** (estado, modo catálogo/full, salud integraciones).
- **Métricas de ventas** (pedidos, cotizaciones, ingresos del mes, top productos).
- **Rendimiento técnico** (ErrorLog + WebVital con umbrales web.dev).

Excluidos a futuro (evolución): **Mercado Libre** y **Bot WhatsApp IA** (siguen con badge).
Badges "Próximo/Fase" limpiados en los 8 módulos ya reales. UX verificada con capturas (formularios intuitivos, dinero en pesos, estados con color).

### Nuevos modelos migrados
`WholesaleTier` y `Material` (migración `20260726085530_admin_100_mayorista_materiales`, aplicada a la DB compartida).

## 4. Hallazgos menores registrados (no bloquean)

- **500 transitorio en cold start** del pooler de Supabase (aws-1-us-east-2:6543) tras reinicios: la primera request puede fallar y la siguiente ya responde. Candidato: retry/warm-up en la capa de datos.
- **403 en recursos de imágenes placeholder** (Unsplash/previews firmadas): no bloquean render; se resuelve al montar fotos reales.
- `NaN` en un debug-log `%c%d` de una dependencia (cosmético).
- Login/registro sin widget Turnstile visible (el submit de cotización sí lo valida server-side; evaluar en full).

## 5. Configuración Vercel (organizada)

- **Production Branch = `catalogo-whatsapp`** (corregido; estaba en `develop` y en un punto el link git quedó desconectado — reconectado con `vercel git connect`).
- develop → previews; catalogo-whatsapp → producción automática.

## 6. Próximos pasos sugeridos

1. Montar fotos reales de productos (reemplaza Unsplash → retirar img-src temporal).
2. Montar llaves Wompi/Aveonline de **producción real** cuando se decida el go-live transaccional (hoy sandbox/demo verificadas).
3. Endurecer el cold-start del pooler de Supabase (retry/warm-up).
4. Cuando develop esté aprobada: promover `production`/`master` y apuntar Production Branch ahí.
