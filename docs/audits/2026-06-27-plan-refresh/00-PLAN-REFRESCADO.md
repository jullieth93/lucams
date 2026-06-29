The five faithful readings are already provided. I'll synthesize them into the refreshed plan without re-reading (the readers extracted faithfully and flagged contradictions). My job is to consolidate into Lucy-facing Spanish markdown.

# Plan de trabajo completo — Lucams_shop (refrescado 2026-06-27)

## 1. Dónde estamos hoy (en una mirada)

La tienda ya tiene su **núcleo de venta funcionando y certificado**: el flujo completo de compra (catálogo → carrito → checkout con Wompi en sandbox → saga de pago → logística Aveonline → emails de confirmación) pasó una certificación adversarial dura y quedó con **48 pruebas en verde**. El **compliance colombiano básico** (Ley 1581 habeas data, Ley 1480 retracto verificado contra la Ley 2439/2024, textos legales reales) está hecho, y el **panel de admin** quedó restructurado ("Opción C") y pulido. **Hoy (2026-06-27)** se cerró un pulido de experiencia del admin para que vos lo uses sin fricción: 8 commits que cubren 3 bugs, sprint "amigable", sub-categorías, flechas para reordenar, precio base automático, ordenar por clic y fotos por opción.

Lo que **todavía falta para abrir** son cuatro bloques de robustez que no se ven pero que un sitio "100% productivo" necesita: **Seguridad (C)**, **Observabilidad (D)**, **Testing (E)** y **Reembolsos/Cupones funcionales (F)** — más una acción humana inmediata: **verificar el dominio de correo en Resend (DNS)**. El diferenciador #1, el **Estudio de Personalización**, está construido en su núcleo pero le faltan las plantillas de diseño (solo 2 de 30) y las vistas extra (3D, compartir).

> **Aviso de honestidad documental:** los docs `ROADMAP.md` y `PLAN.md` están **desactualizados** — todavía describen el proyecto como si estuviera "cerrando Fase 2", cuando el código (git) demuestra que checkout, pagos y admin ya están hechos. La fuente fiel del estado real es `STATE.md` + el historial git, no el ROADMAP. Además `PLAN.md` aún dice "Next.js 15" donde el mandato vigente es **Next.js 16**, e `INTEGRATIONS.md`/`OPERATIONS.md` todavía dicen **"Venndelo"** donde la logística real implementada es **Aveonline**. Esos docs necesitan refresh.

---

## 2. El mapa completo por bloques

> Nota de nomenclatura: el plan original (ROADMAP) está numerado por **Fases 0a–7**. El trabajo reciente usa una nomenclatura por **Bloques A–F** que vive en `STATE.md` y las auditorías, pero **solo A, B y C están nombrados formalmente** en los docs. "Bloque D = Observabilidad / E = Testing / F = Refund+Cupones" es terminología de trabajo del orquestador: su contenido existe (mapea a `OBSERVABILITY.md`, `TESTING.md` y Fase 5), pero la etiqueta exacta por letra está `[pendiente verificación]`.

### Base ya construida (Fases 0a–2)

| Bloque / Fase | Estado | Qué incluye | Qué falta |
|---|---|---|---|
| **0a — Documentación** | ✅ hecho | Toda la doc base + auditoría de coherencia | — |
| **0b — Cuentas externas** | ✅ hecho | GitHub, Supabase, Vercel, Resend (tier Free) | Dominio Resend sin verificar (ver §4) |
| **1 — Base técnica** | ✅ hecho | Monorepo, 20 modelos Prisma, RLS, auth cliente + admin, headers de seguridad, rate-limit, logger | CI/CD incompleto, tests RLS sin escribir, MFA admin sin hacer (cae en Bloque C/E) |
| **2 — Catálogo y carrito** | ✅ hecho | Admin CRUD productos/categorías, storefront público, carrito anónimo con merge al login (en Postgres), imágenes, variantes | Reseñas/estrellas en tarjeta y búsqueda avanzada `[pendiente verificación]` |

### Trabajo reciente (no reflejado en ROADMAP, sí en git)

| Bloque | Estado | Qué incluye | Qué falta |
|---|---|---|---|
| **A — Checkout + Pagos + Saga** | ✅ **CERTIFICADO** | Wompi sandbox, saga post-pago (stock→envío→email con compensaciones), webhooks Wompi+Aveonline (HMAC, anti-replay, idempotencia, env-match), logística Aveonline, COD, reconciliación visible en admin. **48 tests verdes.** | Solo llaves/cuenta de **producción** (acción humana, §4) |
| **B — Compliance + Emails** | ✅ hecho | `/unsubscribe` (Ley 1581), textos legales reales, retracto verificado (Ley 2439/2024 → reembolso 15 días calendario), voseo→tuteo en emails. **55 tests.** | Flujo de retracto E2E (Fase 4), garantías (Fase 6), banner cookies funcional, emails `habeas-data@`/`retracto@` |
| **Opción C — Restructura admin catálogo** | ✅ hecho | `/admin/inventario`, sub-nav del producto (Editar/Versiones/Reseñas), bulk actions, sidebar reagrupado | — |
| **Pulido UX admin (hoy 2026-06-27)** | ✅ hecho | 3 bugs + sprint amigable + sub-categorías + flechas reorden + precio base auto + ordenar por clic + fotos por opción (D1). 6/6 bloques + ADR-040 | **Prueba GUI en navegador pendiente por vos** (no verificada visualmente aún) |

### Pendiente pre-launch

| Bloque | Estado | Qué incluye | Qué falta (lo más relevante) |
|---|---|---|---|
| **C — Seguridad** (esfuerzo Grande) | ⏳ pendiente | RBAC formal, middleware `/admin/*`, MFA admin, tests RLS, CSRF, Turnstile en registro/checkout, validación de archivos (MIME real, EXIF) | Middleware formal `/admin/*`; **MFA admin (TOTP)** no existe; **tests RLS** no existen; `lib/csrf.ts` no existe; `pnpm audit`/license-check/branch-protection en CI; verificar EXIF stripping y CSP nonce `[pendiente verificación]`. *Ya hecho: headers, CORS, Turnstile en contacto/newsletter, webhooks certificados, gitleaks* |
| **D — Observabilidad** (esfuerzo Medio) | ⏳ pendiente | Dashboard `/admin/observability`, motor de alertas por Resend (~13 reglas + dedup + resumen diario), SLOs/error budgets, `/api/metrics` | Dashboard **no existe**; motor de alertas **no existe**; `/api/metrics` **no existe**. *Ya hecho: healthchecks múltiples, logger estructurado con requestId.* Sin Sentry (mandato #7) — alternativa = Vercel Logs + Resend |
| **E — Testing** (esfuerzo Grande) | ⏳ pendiente | Pirámide completa: unit, integración, **RLS (bloqueante)**, E2E críticos, visual regression, a11y, Lighthouse CI | **Tests RLS: 0** (criterio crítico). Solo 8 tests unit + 1 smoke E2E; falta E2E de compra/COD/cupón/admin, visual regression, a11y, ampliar cobertura a ≥70%. *Depende de C (RBAC/RLS reales).* |
| **F — Refund + Cupones** (esfuerzo Medio) | ⏳ pendiente | Redención de cupones en checkout; reembolso/cancelación desde admin | **Cupones: admin CRUD existe pero NO hay redención en checkout** (el cliente no puede aplicar cupón). **Refund/cancel desde admin no existe** (solo el saga maneja VOIDED entrante por webhook). Race de cupones sin resolver `[pendiente verificación]` |
| **Estudio de Personalización (diferenciador #1)** | 🔄 núcleo hecho, incompleto | Editor canvas slot-por-imán, finalize→PNG 300 DPI a producción, enlace desde PDP | **Solo 2 de 30 SVGs** de plantillas; **vista 3D nevera no existe**; **compartir diseño `/d/[token]` no existe**; 0% test coverage |

### Pendiente más adelante (no bloquea el primer lanzamiento estricto)

| Bloque / Fase | Estado | Qué incluye |
|---|---|---|
| **5 — Marketing engine** | ⏳ pendiente | Fidelidad, referidos, bundles, recuperación de carrito abandonado, blog MDX (los cupones de §F salen de aquí) |
| **6 — Backoffice/B2B** | ⏳ pendiente | Portal mayorista, garantías (`WarrantyClaim`), MFA admin obligatorio, B2B IVA/retenciones |
| **7 — Pulido + lanzamiento** | ⏳ pendiente | Migración Free→Pro, DNS dominio propio, DIAN, revisión legal de abogado, load testing, soft launch |

---

## 3. Camino al lanzamiento (secuencia recomendada)

El orden está mandado por **dependencias**: no se puede testear lo que aún no es seguro, y no se puede alertar sin el correo verificado.

**Paso 0 — Inmediato y bloqueante (acción humana):**
Verificar el **dominio de correo en Resend (DNS)** — P0-004. Desbloquea los emails desde dominio propio Y el motor de alertas del Bloque D.

**Paso 1 — Bloque C (Seguridad).** Va primero porque **el Testing (E) depende de él**: no se pueden escribir tests RLS ni E2E de admin sin que las políticas RLS y el RBAC estén firmes. Incluye: middleware `/admin/*` formal, MFA admin, `lib/csrf.ts`, validación de archivos, endurecer el CI con `pnpm audit`.

**Paso 2 — Bloque E (Testing), en paralelo con D.** Una vez que C deja RLS/RBAC firmes, escribir los **tests RLS (bloqueantes)**, los E2E de los flujos críticos (compra Wompi, COD, cupón, admin) y ampliar cobertura. El Bloque A ya dejó las tablas (`SagaLog`, `WebhookEvent`, `InventoryLog`) que estos tests consumen.

**Paso 3 — Bloque D (Observabilidad).** Dashboards `/admin/observability`, motor de alertas por Resend (necesita el Paso 0 hecho) y SLOs. Da visibilidad de operación para el día del lanzamiento.

**Paso 4 — Bloque F (Refund + Cupones).** Cerrar los dos huecos funcionales que el cliente sí ve: **aplicar cupón en checkout** y **reembolsar/cancelar desde admin** (este último es requisito de la Ley 1480).

**Paso 5 — Estudio (completar assets).** Diseñar/contratar los SVGs de plantillas faltantes (acción humana). Las vistas 3D y "compartir" son **deseables pero no bloqueantes** del primer lanzamiento.

**Paso 6 — Fase 7 (lanzamiento).** Migración Free→Pro, dominio propio, DIAN, revisión legal, load testing, soft launch con compra real.

**Qué BLOQUEA el launch:** Paso 0 (Resend DNS), Bloque C (seguridad mínima), tests RLS de E, Bloque F (cupones + refund admin), cuentas de producción Wompi/Aveonline, revisión legal y constitución del negocio.
**Deseable pero NO bloqueante:** vista 3D y compartir del Estudio, marketing engine (Fase 5), parte de la cobertura de tests no crítica, monitoreo externo.

---

## 4. Acciones humanas pendientes (de Lucy)

**ACCIÓN HUMANA REQUERIDA — bloqueante inmediato (P0-004):**
Verificar el dominio `mail.lucamsshop.co` en **Resend** creando en Cloudflare DNS los 4 records que Resend genere (SPF, DKIM, DMARC con política inicial `quarantine`, y MX). Luego activar Resend **Pro** y cambiar el remitente a `hola@mail.lucamsshop.co`.

**ACCIÓN HUMANA REQUERIDA — probar el admin en navegador:**
El pulido UX de hoy está cerrado en código pero **no verificado visualmente**. Probar en navegador las 6 mejoras (sub-categorías, flechas de reorden, precio base auto, ordenar por clic, fotos por opción, los 3 bugs).

**ACCIÓN HUMANA REQUERIDA — cuentas y pagos (pre-launch / Fase 7):**
- **Wompi:** aprobar cuenta de comercio, cargar llaves de producción, configurar webhook al dominio real, hacer una compra real mínima. (Migrar a **Vercel Pro antes de la 1ª transacción real** — el plan Hobby prohíbe uso comercial.)
- **Aveonline:** activar cuenta de producción, configurar dirección de origen, cargar API key prod, configurar webhook, envío real de prueba.
- **WhatsApp:** definir el número de WhatsApp Business definitivo (reemplazar el temporal +57 320 887 3826).

**ACCIÓN HUMANA REQUERIDA — decisiones de negocio y legal:**
- **DIAN:** decidir con tu contador cuándo activar facturación electrónica y con qué proveedor (Alegra/Siigo/Facture, ADR-025). *Nota favorable: como persona natural por debajo de 3.500 UVT NO estás obligada a factura electrónica al inicio — podés usar documento equivalente.*
- **Constituir el negocio:** RUES + Cámara de Comercio + RUT (responsabilidad 42) + resolución de numeración DIAN.
- **Legal:** revisión por abogado colombiano de los 9 documentos del sitio (ADR-020); confirmar si aplica registro RNBD ante la SIC; definir el NIT en el aviso de privacidad.
- **Emails de cumplimiento:** dejar operativos `habeas-data@` y `retracto@` con SLA de PQR (15 días hábiles).

**ACCIÓN HUMANA REQUERIDA — assets y contenido:**
- **Estudio:** diseñar/contratar los SVGs de plantillas faltantes (hay 2 de los ~30 prometidos).
- **Fotos de productos:** subir las imágenes faltantes `[pendiente verificación: si ya se completaron]`.

**ACCIÓN HUMANA REQUERIDA — infraestructura de despliegue:**
- Sincronizar manualmente las variables de entorno de `.env.local` → Vercel (Production/Preview/Development) antes de cualquier deploy que toque Supabase/Prisma.
- Cloudflare: configurar DNS del dominio + claves de Turnstile + R2 para backups.

**ACCIÓN HUMANA — rotación de secrets (política):** rotación anual (o ad-hoc si hay sospecha) de las llaves de Wompi prod, Supabase, Resend y Aveonline.

---

## 5. Riesgos / deudas abiertas

**Deuda documental (mandato #9 — afirmaciones sin verificar):**
- `ROADMAP.md` y `PLAN.md` están **materialmente desfasados**: marcan Fase 2 "en curso" y Fase 3/4 "pendientes" cuando el git muestra checkout y admin ya certificados. Necesitan refresh urgente para no confundir sesiones futuras.
- `PLAN.md` aún dice **"Next.js 15"** en varios puntos; el mandato vigente es **Next.js 16**.
- `INTEGRATIONS.md` y `OPERATIONS.md` siguen documentando **"Venndelo"** cuando la logística real es **Aveonline** (URL, credenciales y webhook HMAC de Aveonline **no documentados** → `[pendiente verificación]`).
- Inconsistencia menor: límites Free de Resend marcados como `[pendiente verificación]` en un doc y "verificado" en otro.
- Hueco en la bitácora de `STATE.md`: ~6 semanas de trabajo (mayo–junio 2026) existen en git pero no en la narrativa; el git log es la única fuente fiel de ese período.

**Hallazgos de auditoría sin cerrar:**
- **Mega-audit (2026-05-28):** mayoría de P0 drenados, pero siguen abiertos los de Bloque C (Turnstile registro, RBAC, RLS 18 tablas), D (ErrorReport/`/api/log-error`, `/admin/errores`, `/admin/performance`), E y F.
- **Visual audit admin (2026-06-26):** los P0 se cerraron (hotfix #2), pero de los **17 P1 / 10 P2 está `[pendiente verificación]` cuáles quedaron sin cerrar**.
- **Catch-all del admin** (`[...placeholder]`): captura módulos anunciados pero inexistentes (Plantillas, Recomendaciones) mostrando "En desarrollo" — ruido para vos, no bloqueante.

**Vacíos funcionales visibles al cliente (no-infra):**
- **Cupones sin redención en checkout** — el cliente no puede aplicar un cupón aunque exista el CRUD admin.
- **Refund/cancel desde admin no existe** — requisito de Ley 1480 (retracto).
- **Estudio incompleto** en assets (2/30 SVGs), sin 3D ni compartir.

**Decisiones pendientes:**
- Equivalencia exacta de la nomenclatura "Bloque D/E/F" no formalizada en docs → `[pendiente verificación]`.
- ADR-025 (proveedor DIAN), ADR-022 (monitoreo de errores), ADR-020 (revisión legal) sin tomar.
- `compareAtPrice` por opción (precio tachado por variante): **no aparece mencionado en ninguna de las 5 fuentes leídas** → `[pendiente verificación]` de su estado.
- Race condition en redención concurrente de cupones / límite de usos: no documentada como resuelta → `[pendiente verificación]`.