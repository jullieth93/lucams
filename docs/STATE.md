# Estado del proyecto — Lucams_shop

> **Cómo leer este archivo.** Es el índice narrativo del proyecto. La fuente de verdad de cada dominio sigue siendo el `.md` correspondiente (ROADMAP, ARCHITECTURE, DECISIONS, etc.) — STATE.md te dice **dónde estás parado** y **qué pasó en la última sesión** sin tener que leer todo.
>
> **Cómo se mantiene.** Al cerrar cualquier sesión con cambios, Claude Code actualiza:
>
> 1. El bloque **Resumen actual** (un párrafo, siempre arriba).
> 2. La sección **Última sesión** (qué se hizo en esta iteración).
> 3. El bloque **Próximo paso** (qué viene cuando se reanude).
> 4. Una entrada nueva en **Bitácora** (append-only, más reciente arriba).

---

## Resumen actual

**✅ BARRIDO LEGAL-COLOMBIA COMPLETO (2026-07-19, cont.) — ADR-072.** Lucy pidió un barrido TOTAL de todos los textos/BD/copy ajustados a la ley colombiana. Se auditó TODO con un **workflow multi-agente (25 agentes**: auditar→redactar→verificar adversarial→consolidar) contra Ley 1581/2012, Ley 1480/2011 + Ley 2439/2024 y régimen tributario → 11 blockers / 23 high / 37 medium / 26 low. Hallazgo clave: el contenido PUBLICADO en BD (que gana sobre el fallback de código) estaba en estado placeholder. Remediado en **5 batches certificados (tsc+lint+prettier+166 tests) y pusheados**, y **verificado en el navegador** (nuke `.next` + restart):

- **Batch 1 — 8 documentos legales** reescritos y consistentes: persona natural (no S.A.S.); IVA régimen-agnóstico (sin prometer factura DIAN); retracto 5 días háb. + reembolso 15 días calendario desde el ejercicio (Ley 2439) + excepción de personalizados (art. 47); reversión del pago (art. 51); garantía 1 año con elección del consumidor (arts. 7-8/11); PQR 10/15 días háb.; SIC + jurisdicción; Versión 2. Subprocesadores reales (**Aveonline** no Venndelo, **Google/Gemini** no Anthropic), tabla Markdown (antes HTML crudo que no renderizaba). Contenido canónico en `packages/db/legal-content/*.md` + script reproducible `make seed-legal-2026-07` (para **replicar a PROD** al lanzar). Aplicado a BD dev + fallbacks de código.
- **Batch 2 — checkout:** autorización de tratamiento **previa** (casilla obligatoria + Consent, también invitados) antes de recolectar PII [blocker]; aviso de retracto/garantía en el punto de venta [blocker]; IVA/factura régimen-agnóstico; placeholder "S.A.S." corregido.
- **Batch 3 — correos:** identidad del responsable en los 20 (layout `LEGAL_ENTITY_LINE`); retracto/garantía + COP en confirmación; garantía como elección del consumidor; unsubscribe visible + One-Click en los comerciales (back-in-stock no tenía ninguno).
- **Batch 4 — PDP:** retracto por producto (solo los SIEMPRE a medida se exceptúan; `isPersonalizable` opcional conserva retracto); garantía mínima 12 meses irrenunciable (schema + clamp); "Coordinadora" → "transportadoras aliadas"; línea de precio total COP.
- **Batch 5 — config/docs:** CSP sin `api.venndelo.com`/`api.anthropic.com` (muertos, server-side); settings DPA reales; footer con identidad + enlace SIC (art. 50); COMPLIANCE.md corregido; ADR-072 con la lista consolidada de ACCIÓN HUMANA.

**⚠️ Los drafts son base compliant — NO reemplazan la revisión de un abogado colombiano antes del lanzamiento (ADR-020).** ACCIÓN HUMANA consolidada en ADR-072: **contador** (régimen IVA / documento tributario), **abogado** (tensión art. 50 identificación, fotos como dato sensible, base de transferencia internacional, RNBD, opt-in newsletter, flete de devolución), **operación** (provisionar `habeas-data@`/`retracto@`/`security@`, replicar CMS legal a prod, `security.txt` Expires), **doc** (CLAUDE.md #5 dice "Venndelo" vs. código Aveonline).

---

**✅ BACKLOG AUDITORÍA v3 — COLA DE CALIDAD CERRADA (2026-07-19, cont.).** Con las 4 decisiones de Lucy resueltas, se barrió el **tail de calidad** de las Tandas 5-7 que quedaba pendiente. Todo certificado (tsc + eslint + prettier + tests donde aplica) y pusheado a `origin/develop`:

- **T5 pulido** (`T5 #16/#22/#26`): **#16** en móvil el buy-box del PDP (selector + CTA) sube por encima de la descripción larga (flex + `order-*` en los 6 hijos, CSS-only; md+ conserva el orden natural). **#22** en `/checkout/pago` móvil el resumen+total va ANTES del botón de pagar (order-1/order-2, avisos full-width; lg+ restaura 2 columnas). **#26** validación inline "reward early, punish late" en `/checkout/datos`: el error rojo del cliente aparece solo tras el primer blur (`touched`) y se oculta al reeditar (nombre/email/teléfono/documento).
- **T6 restante** (`T6 #5/#10`): **#5** `/pedido/[token]` en `PENDING_PAYMENT` ya no es un callejón sin salida (banner ámbar "Estamos confirmando tu pago" + salida a WhatsApp; el timeline se oculta mientras se confirma). **#10** el drawer móvil del mega-menú ahora tiene sección "Tu cuenta" session-aware (Ingresar/Crear cuenta o Mi cuenta + ayuda + contacto).
- **T7 último test** (`#7`): cobertura **por-PR** de la orquestación de `finalizeDesign` (nuevo `finalize-design.orchestration.integration.test.ts`, 7 tests verdes) — mockea solo el I/O de Storage (`supabaseService`, `vi.mock` hoisted) y usa Prisma real → corre en el gate por-PR (antes solo el nightly la tocaba). Cubre camino feliz (render server-side 3240px reemplaza el PNG del cliente), fallback (slot con **filtro** fuerza NEEDS_KONVA en ambos motores → conserva el PNG del cliente; se corrigió la premisa del hallazgo: una capa de **texto** NO cae a fallback, el tier canvas la renderiza), los 4 guards y `calendarYear` en metadata.

**Con esto el backlog de auditoría v3 (Tandas 1-8 + FB1-FB5 + piezas mayores) queda 100% barrido en código.** Lo que resta para producción es **verificación GUI de Lucy** (`docs/audits/2026-07-19-plan-validacion-gui.md`) + los ítems de **ACCIÓN HUMANA** (cuenta Wompi propia, abogado/contador, replicar CMS legal a prod, dominio+correos).

---

**✅ PIEZAS MAYORES + DECISIONES DE LUCY (2026-07-19, cont.).** Tras cerrar Tanda 8, se resolvieron los 4 frentes que Lucy autorizó:

- **Wompi validado por API** (`GET /v1/merchants`): la cuenta soporta Tarjeta/PSE/Nequi/**Daviplata**/Bancolombia. **ACCIÓN HUMANA:** hoy es sandbox de otro comercio ("KAIU") → Lucy debe crear su propia cuenta y poner llaves de producción. Cerró **#31** (lista canónica de medios de pago con Daviplata, `lib/payment-methods.ts`).
- **Pieza mayor #1** (`ADR-070`, commit tras `fa1e883`): `OrderItem` guarda un **snapshot autocontenido del diseño** (`designAssetUrl` + `metadata.designSnapshot`) al crear la orden → producción no depende de que el `Design` sobreviva. Vistas de pedido resuelven `designAssetUrl ?? design.previewUrl ?? foto`. **Visual en el checkout**: `/checkout/gracias` muestra miniaturas con badge "Tu diseño". Checkout 36/36 verde.
- **`/rastrear`** (#14): página pública de rastreo (número + correo → `/pedido/<token>`), anti-enumeración + rate-limit, enlace en footer + sitemap. Verificada (miss→error, match→303).
- **Figura jurídica: persona natural** (`ADR-071`, #15/#16): Lucy Jullieth Hurtado Rodríguez, persona natural, Bogotá D.C. Corregidos los fallbacks de código (S.A.S.→persona natural) Y el **contenido CMS** (dev DB) de términos/privacidad/hábeas-data. **Exposición mínima (elección de Lucy):** público = nombre + Bogotá + correo/WhatsApp; **cédula y dirección exacta NO se publican** (a solicitud), y NO viven en git. **ACCIÓN HUMANA:** (a) revisión de abogado; (b) régimen tributario con contador; (c) el contenido CMS se editó en la BD de DEV → replicar en el CMS de PROD al lanzar; (d) al tener dominio, cuadrar correos + evaluar dirección de notificación alterna.
- **Higiene dev:** barridas 4 categorías de test que ensuciaban el footer de dev.

---

**✅ BACKLOG AUDITORÍA v3 — TANDA 8 COMPLETA + PLAN DE VALIDACIÓN GUI (2026-07-19).** Los 31 findings de descubrimiento (recomendador, reseñas, SEO/OG, redirects) se re-validaron por workflow (25 VALID + 2 PARTIALLY_FIXED + 3 ALREADY_FIXED + 1 agente fallido recuperado a mano). **Los 27 accionables implementados, certificados (tsc+lint+prettier+tests) y pusheados** en 7 batches por afinidad:

- **Batch A** (`aca912d`) recomendador lógica: #1 presupuesto = filtro duro (overlap del rango completo), #2 destinatario por token (no substring, sin falso positivo "mi"⊂"familiar", etiquetas legibles), #3 ocasiones vacías ocultas, #5 agotados despriorizados, #9 CTA "Personalízalo" en cards, #11 pool determinista. +tests recommend 7/7. Verificado por API.
- **Batch B** (`1bbf186`) wizard UX/estado: #6 a11y (foco, aria-pressed, live regions), #7 empty state kawaii con 3 salidas reales, #10 estado en la URL (deep-link + rehidratación). Extraído `lib/recomendador-options.ts`. **Verificado en Chromium** (empty state con mascota, sync de URL, deep-link a paso 2, CTA Estudio).
- **Batch C** (`eac02d8`) reseñas storefront: #12 textarea controlado (no pierde el comentario al fallar), #16 encabezado usa el agregado real (== JSON-LD), #19 gate de compra visible (4 estados). Shared const `REVIEWABLE_ORDER_STATUSES`.
- **Batch D** (`2531d37`) reseñas admin: #13 `?productId=` honrado (filtro pegajoso + chip), #14 botón "Rechazar" no-op retirado (sin schema).
- **Batch E** (`3c2450c`) reseñas datos/tests: #17 índice único parcial (migración aplicada) + captura P2002, #18 cron excluye soft-borrados, #20 17 AdminUser residuales barridos + cleanup endurecido, #21 **2 suites de integración nuevas** (service 11 + actions 5 = 16 tests verdes).
- **Batch F** (`03c16f6`) SEO/OG: #22 sitemap completo, #23 canonical de subcategoría (padre real + redirect + noindex), #25 og:image en landings (patrón `parent`), #26 **OG real 1200×630 con next/og** (reemplaza copia 468px), #27 títulos sin marca duplicada, #28 URL base única (`getCanonicalSiteUrl`), #31 **3 íconos PWA reales** (192/512/maskable). Verificado por curl + Chromium.
- **Batch G** (`fa1e883`) redirects: #24 anti-bucle/cadena + anti-colisión con rutas vivas, #29 fromPath case-insensitive (write+read), #30 preserva UTM en el redirect. +proxy 18/18, +redirects 69/69.

**📋 Entregable final:** `docs/audits/2026-07-19-plan-validacion-gui.md` — checklist en tuteo para que Lucy valide visualmente Tandas 4-8 + FB1-FB5, por bloques con prioridad 🔴🟡🟢 y marca 📱 donde aplica.

**⏳ Pendiente (depende de decisiones de Lucy):** figura jurídica (legales T6 #15/#16), Daviplata en Wompi (#31), página `/rastrear` (#14), pieza mayor #1 (snapshot OrderItem + ADR). Además el pulido menor de T5 (#16/#22/#26) y el tail de a11y/tests de T7.

---

**🧹 🔄 BACKLOG AUDITORÍA v3 — TANDAS 6 y 7 EN CURSO (2026-07-19).** Validadas por workflow (Tanda 6: 21 vigentes de 31; Tanda 7: 28 de 29). Implementado y pusheado, cada uno certificado (tsc+lint+prettier):

- **Tanda 6 (cuenta/nav/copy)** — 9 de 21: **#2** contraentrega ya no dice "Pagado" (dice "Confirmado" + aviso persistente de efectivo, en guest + mi-cuenta) · **#9** transportadora legible (`aff6b7f`) · **#12/#22** entrega unificada a "4-9 días" · **#28** "Fotoimanes" · **#26** "contraentrega" (`8f99644`) · **#6** copy de recuperación en futuro + código · **#7** saludos sin género · **#18** breadcrumbs de marca (`6eca16c`).
- **Tanda 7 (a11y/admin/perf/tests)** — 5 de 28: **#1** búsqueda ya no truncada a 8 (LIMIT parametrizado; el conteo/filtros de /productos operan sobre el set completo) · **#2** `listStorefrontCategories` con React cache() per-request (`b23854d`) · **#24** copy de reembolso COD (transferencia, no Wompi) · **#26** títulos de item con nombre de producto (no SKU) · **#29** estado en español (`3e15ea9`).
- **⏳ Restante T6 (12)**: legales (#15/#16/#20), seguimiento (#5 PENDING sin salida, #14 página /rastrear), nav móvil (#10 drawer), transaccional (#23/#24/#25/#29/#31), deep-link (#4). **Restante T7 (23)**: a11y WCAG (#15-#22), backfill de tests (#7-#14, 8 findings), CI gates (#5/#6), admin UX/guards (#23/#25/#27/#28), perf (#3/#4).
- **Pendiente**: **Tanda 8** (descubrimiento, 38 — validando) + **pieza mayor #1** (snapshot OrderItem, ADR propio) + **T5 pulido** (#16/#22/#26) + **plan de validación GUI** final.
- **Herramientas**: harness Chromium + rutas dev `/internal/correos` y `/internal/3d-preview`; validación por workflow reutilizable (`scriptPath` con args {file,count}).

**🛍️ ✅ BACKLOG AUDITORÍA v3 — TANDA 5 (UX storefront, 2026-07-19).** Workflow de validación (31 agentes) → **26 vigentes + 4 ya-arreglados** (#10 basePrice=minVariantPrice, #19 reseñas [DEMO], #23 whitelist checkout, #27 decodeURIComponent). ~21 implementados y pusheados, cada uno certificado (tsc+lint+prettier) y verificado con Chromium donde aplica:

- **Home** (`3b81b59`): #1 CTA "Personalizar el mío" → /productos?personalizable=1 (no a WhatsApp), #2 agotados al final del carrusel destacado (sort estable), #3 chip del hero condicionado a COD_ENABLED ("Pago contraentrega disponible").
- **Filtros** (`6010ac9`): #4 ocasión persistente, #7 chips de precio en COP formateado, #8 búsqueda honra Destacados/Ordenar (isFeatured en searchStorefrontProducts), #9 drawer móvil se cierra + "Ver N productos", #11 precio de URL acotado/normalizado.
- **Cards** (`2d80a88`): #5 badge "Agotado" en ProductFromCatalogCard (inStock propagado), #6 conteo de /ocasion solo productos activos, #12 grid 2-col en móvil, #13 related strip con minVariantPrice+inStock.
- **PDP** (`03b2992` + `97fd84f`): #17 JSON-LD con precio efectivo (Offer/AggregateOffer), #18 a11y del selector (role=group + toggles), #20 precio que envuelve, #15 **strip de confianza** (producción/envío/pago/garantía).
- **Contenido** (`b13d220`): #21 reemplazado el placeholder inapropiado (foto de paciente hospitalizado) en 8 productos — seed + UPDATE quirúrgico en BD dev.
- **Checkout parte 1** (`674f1c1`): #28 Spanglish, #29 tuteo, #30 helper formatCityDept (Bogotá D.C. sin duplicar), #31 botón válido en el carrito.
- **⏳ Restante de T5**: PDP #14 (precio por-ficha más claro, PARTIALLY) + #16 (orden del CTA en móvil, layout); Checkout parte 2 #22/#24/#25/#26 (orden del botón de pago móvil, CTA invitado, reintento de cotización, validación diferida). Luego **Tandas 6-8** (~92: cuenta/nav/copy, a11y/admin/perf/tests, descubrimiento) + **pieza mayor #1** (snapshot OrderItem, ADR propio).
- **🔎 Verificación**: harness Chromium (`scratchpad/shots.mjs`) — verificados visualmente chip COD, chips de precio, conteo de ocasión, strip de confianza del PDP, imagen del calendario corregida.

**🎨 ✅ TANDA 4 (Estudio) + FEEDBACK DE LUCY (2026-07-18).** Barrido de los 17 findings de Estudio del backlog v3 (workflow de validación: 14 vigentes + 3 ya-arreglados #4/#8/#10) en 5 batches certificados y pusheados, MÁS 4 comentarios de producto de Lucy evaluados críticamente. Además se armó una **galería de preview de correos** dev-only (`/internal/correos`, `8754e8a`) con los 19 transaccionales.

- **Batch A** (`b2c7cab`) copy/i18n: voseo→tuteo en onboarding/hints (#7/#13) + término correcto de slot "separador" vs "imán" en separadores (#14, prop `slotNoun`).
- **Batch B** (`12d0fa9`) editores: #11 el nombre ya no traga letras (auto-crece `count`, maxLength al máximo real), #15 subtítulo veraz (solo promete "dibujito" si hay estilos), #16 a11y de swatches (aria por color + 40px), #17 CTA unificado.
- **Batch C** (`8657609`) UX móvil: #5 ancho del tip de gestos, #6 X del sheet visible+44px, #9 copy táctil de los 3 hints 3D (hook `useIsTouch`).
- **Batch D** (`efb8938`) 3D: #12 helper `FitCamera` (encuadre por aspecto) en las 3 vistas (nombre/libro/nevera) + `makeDefault`/maxDistance.
- **Batch E** (`78afcb0` #1/#2 + `b5edd43` #3): #1 fondo heart/circle recortado a la silueta; #2 `setBrandFont` fuerza el eje `wght` de las fuentes variables (@napi-rs ignoraba el peso); #3 el preview del calendario muestra las páginas reales (mes/grilla/festivos), no fotos sueltas.
- **Feedback de Lucy — los 5 items resueltos** (evaluado en [[feedback_lucy_ux_2026_07_18]]): **FB1** ícono de cuenta visible en móvil + **FB2** botón "Salir" claro del estudio (`8047ade`); **FB3** festivos colombianos en el calendario (color+nombre+leyenda, computus + Ley Emiliani, módulo `colombian-holidays` con 11 tests) (`b62d643`); **FB5** pase de realismo 3D — env-map procedural (`<Environment>`+`<Lightformer>`, sin HDRI externo → CSP-safe) + backdrop + PBR/envMapIntensity en las 3 escenas (`04eaa53`); **FB4** editor de foto a pantalla completa en táctil (`StudioSlotFocus`) + grilla sin captura de gestos (`interactiveSlots`) → libera el scroll (`416e492`). **Build verde en cada uno.**
- **🔎 Verificación con Chromium headless** (idea de Lucy): harness de capturas (`scratchpad/shots.mjs`) + rutas dev-only `/internal/correos` y `/internal/3d-preview`. Verificado leyendo las imágenes: FB1/FB2/FB3 (festivos se ven hermosos, Emiliani correcto), subtítulo abecedario, onboarding tuteo, sin regresión en la grilla táctil post-FB4.
- **⚠️ Necesita ojo/dispositivo de Lucy:** FB5 reflejos 3D en GPU real (el render por software los subrepresenta); FB4 scroll/pinch real en un celular. Hallazgo menor: el banner de cookies tapa los controles inferiores del Estudio en la primera visita.

**✉️ ✅ BACKLOG AUDITORÍA v3 — TANDA 3 (emails + estados de error, 2026-07-18).** Workflow de validación (agentes por hallazgo) sobre los 18 findings de la tanda → **6 ya-arreglados** (obsoletos: fila de descuento, escape del nombre, `after()` en emails de soporte, circuit-open ya cubierto por Tanda 1 #18, `decodeURIComponent` doble, `loading.tsx` de envío ya existía) + **12 vigentes** implementados en 3 batches, cada uno certificado (tsc + eslint + prettier + tests) y pusheado. Lucy resolvió 4 decisiones: **One-Click POST** para el unsubscribe, supresión **solo comerciales**, y aprobó el copy de retracto-rechazado y los mensajes de error de checkout.

- **Batch A** (`43e82b9`): #1 saga notifica el email correcto por transición post-pago (REFUNDED→refunded, CANCELLED post-pago→cancelled, pre-pago→payment-failed), #9 URLs dinámicas (`SITE_URL`) en order-cancelled/design-rejected, #15 `loading.tsx` del Estudio, #16 `error.tsx` del panel admin.
- **Batch B** (`52772c8`): #12 `safeCheckoutMessage` (solo códigos de `CheckoutError` con copy seguro llegan al cliente; el detalle interno queda en el log), #14 los 4 catch del Estudio loguean el detalle y muestran copy es-CO genérico, #17 estado de error + "Reintentar" en el wizard recomendador, #18 fallback por escena en la galería 3D.
- **Batch C** (`e92da7a`): #7 **List-Unsubscribe / One-Click** (RFC 8058) en los emails comerciales + endpoint `POST /api/unsubscribe`; #8 **supresión de rebotes duros/quejas** en comerciales (consulta `EmailEvent`, transaccionales siempre se intentan); #2 **email al cliente cuando se rechaza un retracto** (antes pasaba a REJECTED en silencio) — template `retract-rejected` + `sendRetractRejected`; #10 los emails design-rejected/review-request enlazan a `/pedido/<token>` para invitados (fallback a `/mi-cuenta`). Cobertura nueva: supresión comercial + headers en `resend.test.ts`, retract-rejected y links guest en los tests de templates.
- **PENDIENTE #1 opción A completa** (heredado de Tanda 2): snapshot del preview en `OrderItem` — pieza mayor con ADR propio; el safe slice ya cubre diseños sin pedido.
- **Quedan ~140 del backlog** en 5 tandas: estudio, UX storefront, descubrimiento (SEO/recomendador/reseñas), cuenta/nav/copy, a11y/admin/perf/tests.

**🔐 ✅ BACKLOG AUDITORÍA v3 — TANDA 2 (privacidad Ley 1581 + enlaces/tokens, 2026-07-18).** Workflow de validación (20 agentes) → **3 obsoletos** (ya cerrados: validación de cupones, clamp de límite, /signup) + **~15 implementados** en 4 batches, cada uno certificado (tsc+lint+prettier+tests) y pusheado. Lucy resolvió 4 decisiones de política: retirar imágenes = **opción A** (snapshot en OrderItem), retención PII = **180 días**, dirección guest = **enmascarar calle**, consentimiento back-in-stock **aprobado**.

- **Batch A** (`b2ca97a`): redacción de email/teléfono en logs (`to`/`*Email`/`*Phone`), supresión marca órdenes para el cron de reseñas, tope al `reason` del retracto, secreto de cron solo por header.
- **Batch B** (`826d1af`): rate-limit por IP en las 3 acciones del Estudio, PII enmascarada en `/pedido/[token]` (email `lu•••@`, calle oculta).
- **Batch C** (`4c2a1e2`): "Dejar de compartir" un diseño sin archivar (`revokeShareAction`), merge de carrito al recuperar (sin pisar el actual, `mergeCartsAdopt`), unsubscribe con param opaco firmado (`?u=`, email fuera de la URL), rate-limit en `/carrito/recuperar/[token]`.
- **Batch D** (`bf5431f`): purga de EmailEvent/WebhookEvent a **180d** (`purgeExpiredEventLogs` + cron + migración pg_cron 016 + heartbeat), consentimiento **BACK_IN_STOCK** (nuevo ConsentScope + migración Prisma + aviso en UI), y safe slice de #1 (borra el preview público de diseños READY sin pedido al archivar).
- **PENDIENTE #1 opción A completa**: el snapshot del preview dentro de `OrderItem` (para retirar la foto pública de diseños USED_IN_ORDER al archivar) es una pieza mayor con ADR propio — el safe slice ya cubre los diseños sin pedido.
- **ACCIONES HUMANAS**: agendar/verificar el cron `lucams-purge-event-logs` en Supabase (migración 016); + la de Tanda 1 (#15, monitor de uptime externo a `/api/health/crons`).
- **Quedan ~158 del backlog** en 6 tandas: emails/errores, estudio, UX storefront, descubrimiento, cuenta/nav/copy, a11y/admin/perf/tests.

**🛡️ ✅ BACKLOG AUDITORÍA v3 — TANDA 1 (robustez operativa, 2026-07-18).** Lucy eligió seguir barriendo el backlog de la auditoría v3 (197 restantes: 116 medium + 81 low) por tandas de afinidad. **Tanda 1 = "fallar en silencio" en dinero/saga/concurrencia/observabilidad** (19 hallazgos). Workflow de validación (20 agentes) re-validó cada uno contra el código actual: **18 vigentes + 1 obsoleto** (#1 ya lo resolví con COUPON_INVALIDATED). Implementados en 5 batches, cada uno certificado (tsc + lint + prettier + build + tests) y pusheado:

- **Batch 1** (`7af9cf0`) observabilidad: #16 captureServerError en los 6 crons, #17 resumen diario no sella si el email falla, #18 batches de email no marcan en circuit-open, #9 alerta de orden Wompi PENDING >2h, #13 back-in-stock topa por stock (FIFO), #19 SLI de checkout no supera 100%, #10 mensaje de retry de guía.
- **Batch 2** (`21f09ae`) atomicidad: #11 transitionOrder gateado por status (anti-TOCTOU cancel vs webhook PAID), #12 stock admin con CAS.
- **Batch 3** (`6f942d2`) saga/webhooks: #5 timeout de guía no libera el claim (evita guía duplicada), #6 stale-reclaim excluye reconciliación, #7 self-heal PAID→FULFILLING, #8 transición fallida se superficia + webhook Aveonline no sella processedAt ante excepción, #14 webhook Wompi marca reconciliación + no sella processedAt.
- **Batch 4** (`6ca5d7a`) dinero: #2 retracto prorratea el descuento del cupón (+test), #3 cupones admin en PESOS con preview live.
- **Batch 5** (`222b2a6`) #15 dead-man switch de pg_cron (heartbeat + alerta interna + `/api/health/crons` + tile).
- **Diferido**: #4 (cron de conciliación que CONSULTA Wompi por referencia) — requiere verificar el endpoint contra la doc Wompi (mandato #9) + agendar pg_cron; la visibilidad ya la cubren #9 (alerta) y #14 (reconciliación en el catch).
- **Certificación**: integración combinada orders/saga/checkout/cupones/retracto **136/136** + alertas 2/2. (El test daily-summary queda flaky en la DB compartida por la clave global AlertState — pre-existente, pasa en CI.)
- **ACCIÓN HUMANA (#15)**: cablear un monitor de uptime externo a `GET /api/health/crons` tras el lanzamiento.

**Quedan 6 tandas del backlog** (~178): privacidad/enlaces, emails/errores, estudio, UX storefront, descubrimiento (SEO/recomendador/reseñas), cuenta/nav/copy, a11y/admin/perf/tests.

**🎟️ ✅ FLUJO DE CUPONES — fluido + efectivo (2026-07-18, ADR-069).** Lucy pidió (tras resolver el retracto: **el cliente asume el costo**, ADR-068) asegurar que el flujo de cupones fuera fluido y efectivo. Auditoría adversarial dedicada (25 agentes, 6 facetas, verificación por refutación) → **17 confirmados**. Veredicto: el **motor monetario ya era correcto** (nunca cobra mal, invariante `usedCount==count(CouponUsage)` bajo concurrencia); las debilidades reales eran de **fluidez** (cupón-inválido = callejón sin salida) y **efectividad** (timezone, tope invitado). Se remediaron los **9 fixes**, certificados (tsc+lint+prettier+build+tests):

- **#1 HIGH** — cupones con fecha expiraban ~29 h antes en hora Colombia (validTo a medianoche UTC). Nuevo `features/coupons/dates.ts` ancla la vigencia al día COT completo (−05:00 fijo) en la ingesta. Sin backfill (no hay cupones reales pre-lanzamiento). +tests.
- **#2 HIGH** — cupón inválido = callejón sin salida; `CouponField` ahora tiene 3er estado ámbar que nombra el cupón + razón + botón quitar.
- **#4 HIGH** — `maxUsesPerCustomer` evadible por invitados; columna `CouponUsage.email` + conteo por (customerId OR email). Migración `20260718120000_coupon_usage_email` aplicada.
- **#3/#5/#6/#7/#8/#9** — banner suave (no «pago fallido») + evitar round-trip; `needsReconciliation` en la misma tx cuando maxUses se excede; a11y del error; guard PERCENT 1-100 en edición; `requiresMinQuantity` sobre elegibles; pulido (spinner/foco/required/placeholder).
- Copy de **retracto** alineado a «el cliente asume el costo» (UI + 2 emails), commit `f45efad`.

**🛡️ ✅ AUDITORÍA ADVERSARIAL v3 (2026-07-18) — 5 blockers + 16 highs + 14 quick wins remediados y certificados (ADR-068).** Lucy pidió una **verificación adversarial multi-agente sobre el código real** con miras a producción y **rigor máximo en UX/UI web + móvil**. Pipeline: finders por 7 dimensiones → paneles de verificación adversarial (jueces que intentan refutar) → crítico de completitud → síntesis. **~253 agentes · 183 crudos → 218 confirmados** (5 blocker · 16 high · 116 medium · 81 low). **Score de entrada 47/100 — NO LANZAR.** Se presentó el resultado a Lucy y, autorizado (opción a), se remediaron de corrido blocker+high+quick-win, cada uno certificado (tsc + eslint `--max-warnings 0` + prettier + tests + build) y con push a `develop`. Informe completo: [`docs/audits/2026-07-18-adversarial-v3.md`](audits/2026-07-18-adversarial-v3.md).

- **Tanda A — Dinero** (`8aa29b8`): 3 blockers + 3 high del camino del dinero. Doble cobro COD→Wompi (normaliza `paymentMethod`), webhook DECLINED que verificaba mal la transacción, orden con 2 items del mismo variant atascada por P2002 (`aggregateByVariant`), reuso de orden PENDING con total viejo (reconcilia en sitio), APPROVED sobre orden terminal/COD (marca `needsReconciliation`).
- **Tanda B — Estudio WYSIWYG** (`618c293`): Polaroid invendible (marco SVG opaco + autosave que reventaba por regex sin `_`), filtro de calendario que no llegaba al PNG, fallback que exportaba a resolución de pantalla (→ 300 DPI reales), indicadores de edición horneados en el PNG.
- **Tanda C — Legal/privacidad** (`e86be2c`): acuse+alerta de retracto (reloj legal ya no corre en silencio), supresión Ley 1581 que ahora anonimiza `Order.email`/`phone`.
- **Tanda D — UX alto** (`ba70918` + `4b3ab4b` + `87e46a7` + `4a986b5`): header/footer en `/ocasion` y `/productos/[cat]/[subcat]`, personalizables hechos a pedido (5/9 dejaban de figurar «agotados»), buy-box en sync instantáneo (`SelectedVariantProvider`), loading de envío, FABs y banner del Estudio en móvil, reseñas fabricadas fuera del rating/JSON-LD, home ya no niega el Estudio.
- **Tanda E — Quick wins** (este commit): #4 `/signup`→`/registro`, #5 `decodeURIComponent` doble, #6 voseo (8 en UI; DB verificada 0/54 plantillas), #8 `COUPON_INVALIDATED` (no cobrar en silencio un total sin el descuento visto), #9 clamp de `limit`/`offset`, #10 fila «Descuento» en email + 2 vistas de pedido (+test), #12 fuente de la hoja de armado (`assets/fonts`), #13 copy de retracto alineado con `/legal/devoluciones`, #14 `after()` en emails de soporte+newsletter.
- **2 políticas diferidas a Lucy** (ADR-068): (1) **quién paga la devolución** en retracto — copy neutralizado hasta que Lucy decida; (2) **cupón invalidado en checkout** — nueva política de re-confirmar en vez de cobrar en silencio.
- **Backlog**: 116 medium + 81 low documentados en `audit-v3-final.json` para ronda(s) siguiente(s); patrón a atacar: **«fallar en silencio»** (webhooks/crons).

**🔧 ✅ TANDA DE GAPS AUTÓNOMOS DEL AUDIT (2026-07-17) — 10/10 cerrados, CI verde.** Con los tracks maestros cerrados, un **workflow de auditoría** (7 áreas × lectura de código real + verificación adversarial, 17 agentes) mapeó los gaps que SEGUÍAN abiertos (autónomos + verificables) para no rehacer lo hecho ni perseguir falsos positivos. Los 10 confirmados, ejecutados de corrido y certificados (tsc+lint+prettier+tests+build+CI):

- **Dinero** (`466e344`): (1) reembolso/cancelación **liberaba stock pero NO el cupón** → un cupón single-use quedaba quemado por una orden reembolsada; ahora `transitionOrder` borra el `CouponUsage` + decrementa `usedCount` en la misma tx, simétrico a la saga (la existencia del usage es la verdad → no decrementa de más). (2) **overflow INT4** en el total (pedido caro × cantidad alta) reventaba el INSERT crudo → `lib/money.ts` (MAX_MONEY_CENTS + fitsMoneyInt4) + `OrderAmountTooLargeError` antes del INSERT. +3 integración +3 unit.
- **Retención Ley 1581** (`82cd383`): las fotos crudas anónimas de `customer-uploads` se acumulaban sin fin (la supresión por cuenta filtra por customerId). `retention-service.ts` + cron `/api/cron/purge-anon-designs` purga diseños DRAFT anónimos ≥30d sin carrito/pedido + assets huérfanos (bytes primero, best-effort con reintento). +5 integración + COMPLIANCE.md.
- **pg_cron versionado** (`ada76bd`): los 6 crons HTTP vivían solo como SQL manual → migración 15 los versiona leyendo secreto+URL del **Vault** (no en el SQL, mandato #12). Validada en dev en txn con ROLLBACK.
- **SEO listados** (`dcd876d`): los listados no emitían structured data y las categorías compartían `<title>Tienda</title>`. `lib/seo/structured-data.ts` + `<JsonLd>` compartido → BreadcrumbList + CollectionPage/ItemList en /productos, subcategoría y /ocasion + metadata por categoría + canonicals self-ref. PDP refactorizado al helper. +4 unit.
- **Copy + limpieza** (`3568cac`): FAQ /ayuda al día (Estudio en vivo, no WhatsApp/futuro; COD activo, no "próximamente") + retiro del stub `requestPickup` (método landmine sin callers) del contrato ShippingProvider. + 3 voseos→tuteo de paso.

**🎨 ✅ WORKSTREAM ESTUDIO — P1 + P2 INMERSIVO COMPLETOS (2026-07-17, ADR-063).** Lucy pidió (adicional al plan maestro) un análisis profundo del Estudio por categoría con **ejecución directa**: cada lienzo con la tecnología acorde a la necesidad, cubriendo creación, WYSIWYG, **recepción del admin/producción**, mapeo de tech y **visualización inmersiva** (UX fantástica). Workflow multi-agente (8 agentes) → **plan de 22 ítems** en [Artifact `03cdb758`](https://claude.ai/code/artifact/03cdb758-ee2e-41dd-94dc-945bcb2594d0) + ADR-063. **El bloque P2 inmersivo quedó cerrado con variedad de escenas del hogar (feedback de Lucy: "no solo neveras").**

- **Hallazgo central (2 P0):** (T1) el admin NO podía descargar los PNGs de producción — `getOrder` no traía `productionUrls[]` y usaba el campo legacy `designAssetUrl`; (CAL1) el "calendario" se produce como **12 fotos desnudas** (mes/año/grilla son overlays DOM que no entran al PNG). Rompe WYSIWYG.
- **✅ BLOQUE P1 AUTÓNOMO COMPLETO — todo en `origin/develop`, cada ítem certificado (tsc+lint+prettier+tests+build):**
  - **T1** (`64eea43`+`d86d887`) — descarga de producción por slot en /admin/pedidos (`getProductionAssetSignedUrls`, firma batch verificada en vivo).
  - **CAL1** (`ec5b0d2`) — calendario REAL: compositor server-side que hornea foto + mes + año + **grilla de días** por página. `calendar-grid.ts`/`calendar-layout.ts`/`renderCalendarMonthPagesCanvas`. Verificado visual (Enero/Febrero 2027). Bug `loadImage` (FOTO2) cazado: `new Image()+src` decodifica pixels async → drawImage en blanco; fix `await mod.loadImage`.
  - **T2** (`e5d4aad`) — moderación revisa cada PNG de producción por-slot (grid con zoom), no un thumbnail de 40px.
  - **T4** (`427e762`) — blindar boot del editor (fallback unitTemplate).
  - **D1** (`4863927`) — gatear superficies fantasma phrase/event/logo → "lo hacemos a medida" + WhatsApp (no caen al editor de foto). NOM1 verificado (name/letterset ya poblaban productionUrls).
  - **FOTO1** (`8a9f51b`) — corte a silueta en producción (corazón/círculo transparentes afuera = troquel). sharp lanza NEEDS_KONVA → canvas clipa a `shapeSilhouettePath`. Verificado visual + tests (esquinas alpha 0).
  - **T3** (`432f290`) — archivo de imprenta LIMPIO: ocultar capas `name="realism"` (sombra/glossy/edge) en el snapshot de producción (el preview sí las conserva). + recorte de silueta en el fallback de cliente.
  - **CAL2** (`c3f35c6`) — el cliente elige el AÑO del calendario (selector, rango seguro), persistido por-diseño en `metadata.calendarYear`, prioridad cliente→schema→próximo año.
  - **FOTO2** (`31f170f`) — localizar a ES el marco "Polaroid Instagram" (ig_post.svg + capa seed "362 likes"→"362 me gusta"). **Hallazgo abierto (lane de contenido/brand + re-seed):** la plantilla dibuja el marco SVG con texto Y capas editables que lo replican → doble-texto + posiciones no alineadas; el rediseño (SVG solo-chrome + capas alineadas, o marco decorativo fijo) es decisión visual de Lucy.
  - **T5** (`fdf400b`) — lazy-mount de stages Konva (>6 slots; IntersectionObserver) + `ensureAllStagesMounted()` blindando preview/producción/3D.
  - **CAL4** (`4943888`) — 🎉 **calendario 3D inmersivo navegable** (lo que Lucy pidió). Arquitectura WYSIWYG: `calendar-draw.ts` (dibujo compartido cliente=servidor), compositor cliente (`lib/compose-calendar-page.ts`), escena r3f CSP-safe (`calendar-view-3d.tsx`) con espiral + página que voltea + navegación mes a mes (año = el de CAL2). Verificado build + página cliente (Diciembre 2027).
  - **T7** (`5d20bd0`) — **ZIP de producción + hoja de armado** (Lucy aprobó `jszip`). `/admin/pedidos/[number]/produccion` → .zip con piezas nombradas por mes/pieza + `armado.png` (miniaturas + estado moderación, verificada visual) + LEEME. `downloadProductionAsset`, `getOrderProductionBundle`, `composeAssemblySheet`.
- **✅ BLOQUE P2 INMERSIVO COMPLETO — cada producto estrena su PROPIA escena del hogar (no todo en la nevera). Todo en `origin/develop`, CI verde, cada ítem certificado:**
  - **SEP1** (`1894fcd`) — separador en un **libro** abierto (r3f, marcador asomando entre páginas). No son imanes → su hogar es un libro.
  - **FOTO3** (`d4d2586`) — fotoimán en un **flat-lay de regalo** (compositor 2D procedural: papel cálido + cinta turquesa + moño + etiqueta "Para ti"). Verificado headless.
  - **FOTO4 + NOM2 re-skin** (`4414b35`) — **galería consolidada "Ver en tu espacio"** (`scene-gallery.tsx`): UN botón abre un modal con chips 🧊 Nevera · 🖼️ Mural · 📚 Repisa · 🎁 Regalo (evita la barra de 5 botones que se desborda en móvil). Escenas nuevas: `RoomBoardView3D` (tablero magnético enmarcado en un cuarto, estilo memo/cork, r3f CSP-safe) + `compose-shelf-flatlay` (REPISA — piezas apoyadas en un estante, **asentado por alfa**: detecta el borde inferior real de la silueta y la posa sobre la madera; un corazón descansa su punta, no flota; verificado headless n=1 y n=3). **NOM2 re-skin:** el nombre (imanes de letras) pasa de la nevera a su propio tablero magnético en un cuarto (`RoomBoardView3D` memo). Las texturas por imán se calculan una vez; los compositores 2D se arman perezosamente por chip y se cachean.
- **⏭️ Estudio restante (carril de Lucy, contenido/brand):** **CAL3** (arte de meses) + rediseño del marco Polaroid (FOTO2 — doble-texto SVG+capas). **Prueba GUI pendiente (WebGL no renderiza headless):** vistas 3D de tablero/mural + libro + galería de escenas en el navegador.

**🏭 PLAN MAESTRO (ADR-062) — carril autónomo en curso.** Lucy pidió priorizar los launch-blockers verificables. Hecho:

- **Seguridad P2** (`a7a9c31`) — 3 hallazgos con test: CORS (scope de equipo ahora OBLIGATORIO en previews Vercel — antes `lucams-shop-<x>.vercel.app` sin scope matcheaba → squatting), `/api/health/all` baseUrl de env confiable (no del Host spoofable → SSRF), `/api/coupons/public` sin `ACAO:*` hard-codeado (política central del proxy gobierna). +8 tests.
- **✅ LEDGER DE CONCILIACIÓN COD (ADR-064) — cerrado con review adversarial.** La dimensión más débil del audit (55). Workflow de comprensión (5 agentes) → diseño: `CodReconciliation` operacional, creado SOLO al resolver; "por remitir" DERIVADO. Cero cambios en la saga. Schema+migración (RLS auto vía event trigger, `relrowsecurity=t`) + service idempotente + `/admin/finanzas/conciliacion` (SUPERADMIN) + sidebar Finanzas→grupo + resumen diario. **Review adversarial (26 agentes, 19 hallazgos) → v2** (`3e762e8`): universo anclado a `deliveredAt` (reembolsar un COD entregado ya no borra la deuda del mensajero); discrepancias entran en pesos (`receivedCop`+`shortfallCop`); "Ingresos" resta el faltante; atomicidad `$transaction`; cota INT4; no pisar motivo ajeno; REMITTED reabrible como discrepancia; a11y/paginación. GUI validado por Lucy (era la tilde en la URL). Certificado: 10 integración + 2 unit + build + **CI verde**. Diferidos: MFA adaptativo (diseño global), copy pre-existente.
- **✅ CARRIL AUTÓNOMO DEL PLAN MAESTRO — CERRADO.** Los 5 ítems que no dependían de Lucy, hechos y CI verde:
  - **Anti-abuso COD** (ADR-065, `bb918e7`) — `assessCodRisk` bloquea COD fraudulento por identidad (velocidad/en-vuelo/cliente-nuevo-alto/devolución-previa) antes de la guía. 6 tests integración.
  - **SLOs cuantitativos** (ADR-066, `6d699c0`) — `evaluateSlo` + panel en /admin/observability (Web Vitals, éxito de checkout, webhooks) + alerta en resumen diario. Los de infra (disponibilidad/latencia) → monitor externo post-lanzamiento.
  - **Lighthouse gate** (ADR-066, `d03a1fd`) — CI sobre home+/productos; a11y/SEO error ≥0.9 (deterministas), perf/bp warn. Calibrado con Chromium de Playwright (home 85/97/92/96, /productos 87/100/100/96).
  - **Wompi E2E sandbox** (ADR-067, `cbe0b1e`) — smoke LIVE no-destructivo contra la API sandbox real (merchant/acceptance + getTransaction), gate estricto sandbox-only (jamás prod), skipIf sin creds. 2/2 verde local; activable en nightly vía GitHub Secrets.
- **⏭️ Queda (dependen de Lucy):** cargar `WOMPI_*` sandbox como GitHub Secrets → activa el live-smoke en nightly; smoke live de Aveonline (mismo patrón). (P2 inmersivo del Estudio ✅ completo — ver bloque Estudio arriba.)
- **Deuda de pruebas GUI (Lucy, navegador):** panel SLOs en /admin/observability, descarga producción + ZIP en /admin/pedidos, grid por-slot en /admin/moderacion, selector de año, lazy-mount, **calendario 3D**. (Conciliación COD ✅ validada.)
- **Carril de Lucy (contenido):** arte de meses (CAL3), rediseño del marco Polaroid (FOTO2), marcos temáticos, tamaños, fichas de letras.
- **Deuda de pruebas GUI (Lucy, navegador):** /admin/pedidos descarga producción (T1), /admin/moderacion grid por-slot (T2), editor de calendario selector de año (CAL2), lazy-mount + finalize con muchos slots (T5).
- **Regla operativa reforzada:** certificar CADA cambio con **tsc + lint + prettier + voseo + tests + build/CI verde** (T1 falló prettier en CI por saltarme el formato — corregido; prettier ahora es parte fija del checklist por cambio).

**Higiene:** limpié basura de tests filtrada a la DB de dev (11 productos, 35 variantes, 6 categorías, 7 diseños) de runs de integración matados por timeout.

---

**🏭 AUDITORÍA DE PRODUCCIÓN 18-DIM + EJECUCIÓN DEL PLAN (2026-07-16, ADR-062).** Lucy pidió subir el nivel: auditoría con lente de producción cuyo entregable es el plan de go-live. Workflow multi-agente **18 dimensiones** (las 13 previas + dinero end-to-end, resiliencia órdenes, emails, ops de lanzamiento, observabilidad, ciclo-de-vida-de-datos, todo-cableado), verificación adversarial + crítico de completitud (**135 agentes, 0 errores, ~7.5M tokens**) → **score 71/100 "no-lanzar"** (baseline 72, plano — el lente más duro relocalizó el riesgo de vago a específico). [Informe (Artifact)](https://claude.ai/code/artifact/00dd8c48-9ca0-4524-b691-7a7b70723956). Núcleo de comercio ~90% listo (Pagos 85, Checkout 82, Compliance 84); el "no-lanzar" lo fijan **4 compuertas**: MFA en Server Actions (código), moderación de contenido print-on-demand (código+proceso), identidad legal + DIAN (carril de Lucy). El crítico destapó 3 gaps nuevos valiosos: moderación de imágenes, cero prueba de carga pre-Instagram, antifraude+conciliación COD.

**✅ AMBOS BLOQUEADORES DE CÓDIGO CERRADOS + CI VERDE POR PRIMERA VEZ.** Ejecución del carril autónomo del plan, todo certificado y en `origin/develop`:

- **P0-1 MFA/RBAC en Server Actions** ✅ (`b79e38d`) — guard central `requireAdminAction({roles,aal2})` (`lib/admin-rbac-guard.ts`) aplicado a las **72 Server Actions** de los 19 módulos admin. Cierra el blocker: el MFA solo se validaba en el render del layout, no en las acciones (endpoints POST directos) → contraseña robada bastaba para reembolsar/auto-promoverse a SUPERADMIN. Unifica RBAC: catálogo→MANAGER_UP (antes sin chequeo), finanzas/usuarios→SUPER, pedidos→ALL/refund→SUPER. `ADMIN_ROLE_SETS`. 7 tests.
- **Lote endurecimiento P1** ✅ (`533bdf4`) — env fail-fast si `WOMPI_DISABLE_TIMESTAMP_CHECK=true` en prod; `getClientIp` anti-spoof en consent/admin-audit/reviews; idle-timeout admin (cookie maxAge 30d >> límite 30min + limpieza en /admin/login, cierra zona muerta); migración 13 DROP 3 policies TO authenticated de `customer-uploads` (INSERT sin scoping = DoS cuota; app usa service_role); webhook Aveonline timing-safe (`lib/timing-safe`) + preferir header. +1 test proxy.
- **RLS event trigger** ✅ (`63c5803`, migración 14) — cierra el gap de deploy incremental: event trigger `ddl_command_end` auto-habilita RLS en toda tabla nueva de public. Verificado: postgres (no-superuser) puede crearlo en Supabase + tabla de prueba auto-obtiene rowsecurity=t.

- **Reparación de CI (nunca había estado verde)** ✅ (`82daf5d`+`f5815a9`+`82a0afc`) — 4 fallas pre-existentes: voseo en seed-templates; `supabaseService` eager reventaba tests sin env → **lazy Proxy** + `skipIf` en tests de Storage; 193 archivos con Tailwind sin ordenar → `prettier --write` repo-wide; `/productos` vacío con doble texto → oculté el conteo "0". **CI 100% verde por primera vez.**
- **P0-2 MODERACIÓN DE CONTENIDO** ✅ (`f171b6a`) — 2º bloqueador de código. `ModerationStatus` en Design (migración) + service (cola/approve/reject/gate) + gate que bloquea SHIPPED con diseños sin aprobar + email de rechazo + `/admin/moderacion` (MANAGER_UP+MFA) + consentimiento de derechos de imagen de baja fricción (`Order.contentRightsAcceptedAt` al crear la orden + cláusula reforzada en /legal/terminos). Alcance: revisar TODOS los personalizados. 10 tests.
- **Bug de concurrencia cazado y arreglado** ✅ (`63bfb40`) — `generateOrderNumber` (count()+1) no era concurrency-safe → colisión de `Order.number` bajo carga (lo expuso el test en paralelo; un pico de Instagram lo haría en prod). Fix de raíz: `pg_advisory_xact_lock` transaccional (el retry queda de backstop).

**Estado de bloqueadores del audit 18-dim (71/100):** los **2 de CÓDIGO cerrados** (MFA + moderación). Quedan los **2 legales/negocio** (identidad legal + DIAN) = carril de Lucy.

**Próximos autónomos:** P1 ledger de conciliación financiera COD, luego P2 (CORS regex al sufijo de equipo, ACAO coupons, health/all baseUrl de fuente confiable, SLOs, anti-abuso COD, E2E sandboxes, Lighthouse). **Carril de Lucy (en paralelo):** abogado (figura legal + NIT), contador (DIAN), provisionar Wompi/Aveonline prod + dominio + R2 + DNS de correo, agendar crons en pg_cron. **GUI test pendiente de Lucy:** loguear admin → `/admin/moderacion` (aprobar/rechazar un diseño).

---

**🚀 RUTA A PRODUCCIÓN — auditoría verificada + P0 launch-readiness (2026-07-13).** Lucy pidió retomar el plan maestro hacia producción con evidencia real de código. Se corrió una **auditoría multi-agente** (8 subagentes en paralelo, 514K tokens, 0 errores) que verificó cada área CONTRA EL CÓDIGO (no contra los docs). Hallazgo central: **6/8 áreas sin bloqueadores de lanzamiento**; lo que bloquea vender el día 1 **casi no es código** sino legal + cuentas de producción. Los 2 diferenciadores estrella (vista 3D en nevera + asistente IA Claude) **NO existen en código** (solo Konva). Ruta priorizada en artifact (dashboard 2 carriles). Se ejecutó **P0 · Launch-readiness (8/8, commit `11a6be0`)**: links legales 404 en registro→/legal/\*, Turnstile en checkout (Wompi+COD), consentimiento habeas data persistido (fila Consent scope=HABEAS_DATA), copy FAQ DIAN suavizada (riesgo Ley 1480) + voseo, UI muerta de puntos/referido oculta, validación central de env al arranque (`lib/env.ts`+register), panel /admin/integraciones Venndelo→Aveonline, y security.txt (RFC 9116). tsc+lint+build exit 0.

**Investigación legal colombiana (2026-07-13, fuentes oficiales — orientación, no asesoría):** (1) **NO se requiere S.A.S.** para arrancar — persona natural comerciante + **matrícula mercantil** (Cámara de Comercio, renovar ene–mar) + **RUT** basta; la S.A.S. es opcional (limita responsabilidad patrimonial). (2) **Habeas Data / RNBD:** personas naturales y pymes con activos ≤ **100.000 UVT** (≈$5.000M COP) están **EXENTAS de registrar bases de datos ante la SIC**; igual deben CUMPLIR la Ley 1581 (política, consentimiento, derechos, seguridad — ya en código). (3) **Factura electrónica DIAN sí** aplica a persona natural comerciante obligada a facturar (Res. 000165/2023 mod. 000202/2025) → necesita contador + resolución de numeración. **Implicación de código pendiente:** las páginas legales dicen "S.A.S. · NIT en trámite"; cuando Lucy+abogado definan figura+NIT, actualizar a persona natural. Cuentas prod: Wompi ✅ Aveonline ✅ (según Lucy); Cloudflare + Resend → Claude la guía; dominio lucamsshop.co pendiente.

**Avance del carril código (2026-07-13):** **P1.1 E2E/axe en CI** ✅ (`16a6b83` — job `e2e`: build prod + Postgres + seed → next start → smoke/a11y/axe/compra en cada PR; visual/estudio/admin-auth documentados como follow-up). **P1.4 Vista 3D en nevera** ✅ (`bb6cc59` + `24ede31` realista dos-puertas — diferenciador #1: `fridge-3d-view.tsx` con React Three Fiber, self-contained sin assets externos por CSP, lazy-load; botón "Ver en 3D" + modal accesible; texturas por-slot recortadas a la silueta; **verificado en navegador** — nevera grande de dos puertas + imanes pequeños agrupados en la puerta, feedback de Lucy aplicado. Deps three+R3F+drei autorizadas). **P2 SupportTicket admin** ✅ (`23fe715` — `/admin/soporte` + card en dashboard: lista por estado, Tomar/Cerrar/Reabrir, Responder mailto, audit trail; guard SUPERADMIN|MANAGER). Lucy aclaró: "orden = secuencia, NO exclusión" → AI + R2 + DIAN también autorizados.

**P2 Motivo al cancelar orden** ✅ (`268f92c` — audit trail). **P2 WarrantyClaim (garantías Ley 1480) end-to-end** ✅ (`5e12d30`): modelo + migración (hand-written, `warrantyClaim.count()` runtime OK) + service con elegibilidad (ventana `warrantyMonths` desde entrega; personalizados SÍ cubiertos; bloquea reclamo activo duplicado) + flujo cliente (`WarrantyControl` en mi-cuenta/pedido → "Reportar garantía" + email) + panel `/admin/garantias` (diagnóstico→remedio reparar/cambiar/devolver o rechazo, audit + card dashboard) + emails (recibida/resuelta + aviso interno) + 4 tests unitarios. Nota RAM: builds fallan si corren en paralelo con el dev server (contención) → `make down` antes de `pnpm build` en esta VM.

**P1.5 Asistente IA de sugerencias** ✅ (`1ac31cb`, ADR-058): el 2º diferenciador. Adaptador **proveedor-agnóstico** (`AiProvider`) + **Gemini** vía REST (sin dep npm, key server-only, sin tocar CSP) + **fallback entre modelos** (flash-lite→flash) + rate-limit + action + UI (botón "Ideas" en el editor → ocasión → frase/color/composición/tip). Se eligió Gemini sobre Claude por free-tier (mandato #2) tras evaluación de costo-beneficio con Lucy. Falla-seguro (nunca rompe el editor). 6 tests (incl. fallback). **Con esto ambos diferenciadores (3D + IA) están listos.** **VERIFICADO EN VIVO** con la `GEMINI_API_KEY` real de Lucy (2026-07-13): sugerencia real para "cumpleaños de mi mamá" → frase + color de marca (rosado #E85B9F) + composición + tip, es-CO tuteo, kawaii. Key en `.env.local` (raíz — que es la que `make up` sourcea) + `apps/web/.env.local` + Vercel.

**P1.2 Gate de cobertura + 60 tests** ✅ (`34523b2`): baseline medido (suite completa, 1830 tests) = lines 79.0% · stmts 77.7% · funcs 78.1% · branches 69.1%. `vitest.config.ts` con **thresholds** (lines 72 / stmts 70 / funcs 70 / branches 62 — margen bajo el baseline porque CI cubre algo menos: rls-matrix real-Supabase se salta; comentado para apretar tras ver el nº real de CI) → gate de regresión. CI corre `test:coverage` → se enforza en cada PR (timeout 12→15). +60 tests: 23 render de plantillas que estaban al 0% (refund-issued, retract-approved, retract-refunded, offline con mock de `@/lib/cms`) + 37 de la máquina de estados de garantía (guards review/approve/resolve/reject + validación createWarrantyClaim + elegibilidad getWarrantyItems, mock de `@/lib/db` con vi.hoisted). Tras los tests: lines 80.9% · stmts 79.6% · funcs 80.2% · branches 70.9% (gate verde verificado). Nota: `pg_dump` local es 13, el server Supabase es **PG17** (relevante abajo).

**P2 Backup off-site DB → R2** ✅ (`c92d99e`, ADR-059): copia independiente del PITR (DR drill #2). `apps/web/scripts/backup-db-to-r2.mjs` (pg*dump plano → gzip → sube a R2 con `@aws-sdk/client-s3` → poda por retención `BACKUP_KEEP=8`) + `backup-lib.mjs` (helpers puros, **9 tests**, salvaguardas anti-vaciado) + workflow `.github/workflows/backup.yml` (cron semanal + instala `postgresql-client-17` porque el server es PG17; job `gate` que **salta limpio si faltan secrets** → sin correos de error). `@aws-sdk/client-s3` como devDep de apps/web (no toca el bundle). **NO verificado en vivo:** las `R2*_`en`.env.local`son aún los **placeholders** de`.env.example`(R2 sin provisionar) → el round-trip real espera la provisión. ACCIÓN HUMANA (carril "Cloudflare"): crear bucket`lucams-backups` + token R2, setear GitHub secrets (`BACKUP*DATABASE_URL`directa +`R2*_`), disparar el workflow una vez.

**Nevera 3D realista** ✅ (`d4c1873`, ADR-057): rediseño a electrodoméstico convencional (gris satinado, top-freezer, manijas verticales izquierda, patas) — feedback de Lucy con foto de referencia; verificado en navegador (Chromium+WebGL).

**AUDITORÍA DE PRODUCCIÓN + FIXES (2026-07-13, ADR-060):** Workflow multi-agente (13 auditores + verificación adversarial, 20 agentes) → **score 72/100 "no-lanzar"**, 80 hallazgos, 6 bloqueadores. [Informe navegable (Artifact)](https://claude.ai/code/artifact/69d7eb9f-6a5f-437d-9614-ba8194f3c017). **Ejecutados y certificados** (commits 796b977→094d13f): TODOS los P0 autónomos (env fail-fast, RLS sweep, RBAC server-side, emails de estado/cancelación, voseo→tuteo+lint CI, Svix, unitPrice) → 4 de 6 bloqueadores cerrados; P1 seguridad/resiliencia (índices FK, IP anti-spoofing ×22, PII/secreto redactados, AlertState fail-safe, needsReconciliation); P3 **lint RED→GREEN** (6 errores pre-existentes que rompían CI + gate estricto) + limpieza de sobrantes.

**Segunda tanda de auditoría (2026-07-13, commits d4c1873→791f2b3):** **Nevera 3D v2** (`6f5cc73`) — imanes a escala real (clúster pequeño) + panel biselado + manijas finas (2º feedback de Lucy). **P1 stock "Agotado"** (`36e7c2e`) — card+PDP+JSON-LD availability + **P2 JSON-LD escaping** (anti-XSS). **P2 seguridad** (`56b706e`) — rate-limit search/vitals/health + RLS de ProductVariant por producto activo. **React cache()** de la ficha (`5a71e60`). **pg_cron versionado** (`33f0f43`) — migración guardada+idempotente de los jobs de limpieza. **SEO categorías** (`c27d3d3`) — robots vs sitemap alineados + canonical. **Tests de seguridad del proxy** (`791f2b3`) — extraídos CSP/CORS a lib + 10 tests (antes 0) + gap RLS-CI documentado.

**Editar diseño desde el carrito** ✅ (`7238279`): "Editar" un diseño READY del carrito clonaba mal (arrancaba en blanco + duplicaba el item). Solución: `cloneDesignForEdit` clona READY→DRAFT (copia canvas+metadata+assets con ids nuevos, **remapea los assetId** del canvas vía helper puro `canvas-remap.ts`; original INTACTO → sin riesgo de abandono) + `replaceDesignId` en `addPersonalizedToCart` reemplaza el item EN SITIO (no duplica). 5 tests unit (remap) + 4 de integración (clon + reemplazo, cleanup verificado). ACCIÓN HUMANA: prueba GUI del flujo editar-desde-carrito.

**Tercera tanda — cierre del plan (2026-07-14, commits 67e6054→…):** **Infra de tests** (`67e6054`) — workflow nocturno `nightly-full.yml` (scheduled+dispatch) que corre rls-matrix de comportamiento + E2E admin-login/MFA/Estudio contra Supabase real (gate salta si faltan secrets STAGING\_\*); rls-matrix verificado local 45/45. **Palancas de ingreso (P3) — TODAS hechas:** email de reseña post-entrega (`549ecda`, cron review-request), **recuperación de carrito abandonado** (`4fd7660`, logueados+anónimos: hook en checkout + token de recuperación que restaura la sesión + cron), **wishlist + "avísame cuando vuelva"** (modelos WishlistItem+BackInStockSubscription, corazón en PDP/cards/favoritos, botón avísame en PDP agotado, crons). Cada palanca con tests + migración + doc pg_cron. **ACCIÓN HUMANA:** agendar los nuevos crons (review-request, cart-recovery, back-in-stock) en pg_cron + probar wishlist en navegador (UI nueva).

**Diferido con razón (menor):** JSON-LD de categoría enriquecido (BreadcrumbList/Organization) — SEO polish. Anon cart-recovery + wishlist ya cubren lo grande.

**Carril humano (Lucy):** identidad legal (persona natural vs S.A.S. + abogado), DIAN (contador/copy FAQ), R2 (provisionar bucket), DROP modelos muertos (Referral/BlogPost/SiteEvent). **DIAN InvoiceProvider** espera decisión de proveedor. Ver ADR-060 + artifact.

**ACCIÓN HUMANA — pruebas GUI pendientes de Lucy:** (1) **Vista 3D**: `/estudio/set-fotoimanes-cuadrados` → subir foto → "Ver en 3D" → girar/acercar. (2) **Admin soporte**: loguear admin → `/admin/soporte` (gestionar tickets). Ambas verificadas por Claude (tsc/lint/build/render o guard 307) pero faltan los ojos de Lucy.

**Investigación legal (2026-07-13):** ver bloque abajo — NO requiere S.A.S. (persona natural + matrícula mercantil + RUT); RNBD probablemente exento (≤100.000 UVT); factura electrónica DIAN sí aplica. Implicación de código pendiente: páginas legales dicen "S.A.S." → actualizar a persona natural cuando Lucy+abogado definan figura+NIT.

---

**✅ COMPLETO — Plan de las 3 categorías del Estudio + render server-side (2026-07-13, ADR-057).** Lucy pidió ejecutar TODO el plan ([PLAN_CATEGORIAS_ESTUDIO.md](PLAN_CATEGORIAS_ESTUDIO.md)) y certificar cada fase. Las 4 fases entregadas, verificadas y en `develop`:

- **Fase A (render server-side) — COMPLETA y certificada.** A0 (`bd7aa90`, persistir encuadre), A1a (`edff931`+`768a5bd`, sharp para foto pura), A1b (`01bfc0a`+`c566c9a`, @napi-rs/canvas para texto/marcos). Cada una con revisión adversarial (workflow) y fixes conservadores. Tier en finalizeDesign: sharp→canvas→cliente, con fallback seguro (nunca rompe producción). Filtros siguen en fallback al cliente (filtro exacto de Konva).
- **Fase B (Separadores) — COMPLETA.** Unificados los 2 productos inactivos en UNO vendible "Separadores para Libros" (`separadores-libros`, `a8c12d9`): PHOTO_PACK, variantes forma (cuadrado 1:1 / rectangular 5:14) × cantidad (1/3/5). Plantillas dedicadas por forma (`2bbfbff`) → el rectangular renderiza tall (WYSIWYG); ruteo por aspecto certificado. **B2** — galería de diseños PREDISEÑADOS: modelo `DesignGalleryImage` + `/admin/disenos` (Lucy sube diseños) + sección "Diseños prediseñados" en el modal del editor con anti-SSRF; `assignPredesignedToDesignAction` reusa el pipeline de subida testeado. La visión de Lucy (prediseñados + subir imagen por cantidad) queda cubierta.
- **Fase C (Fotoimanes) — COMPLETA.** Ruteo por aspecto arreglado: Polaroid alineado a su plantilla 400×580 (antes el filtro la excluía → "no hay plantillas" = roto), Corazón `aspectRatio "1:1"`, Cuadrado con plantilla dedicada SIN texto, voseo "Escribí"→"Escribe" corregido. `make fix-fotoimanes`.
- **Fase D (Calendarios) — COMPLETA.** Editor con slots etiquetados por MES (Ene…Dic) + banner de AÑO (2027), ruteando a `CALENDAR_PHOTO_MONTH`. `slotLabels`/`calendarYear` threaded page→StudioEditor→Grid→Slot (`eab069c`). La grilla de días queda como elemento de impresión estándar (refinamiento WYSIWYG futuro documentado).

**Recorrido visual (Playwright/Chromium sobre localhost:4000, 2026-07-13).** Se verificó CADA categoría con navegador real (no curl): capturas + assert por DOM. Resultado: separadores rectangular (lienzos altos 5:14) vs cuadrado (1:1) ✓, fotoimanes cuadrados sin texto ✓, calendario con 12 slots ENERO…DICIEMBRE + banner "Calendario 2027" ✓. **Bug cazado y arreglado:** el Polaroid mostraba "No hay plantillas disponibles" para TODAS sus variantes (el marco 400×580=0.69 es forma fija, pero las variantes pisaban aspectRatio con el tamaño físico 7:9/6:8/4:5 → el filtro |a-target|≤0.05 excluía la única plantilla). Fix `376b06c`: las variantes heredan el aspecto de la plantilla; barrido de las 44 variantes personalizables → 0 rotas. Dato ya aplicado en la BD dev compartida (aplica a localhost y Vercel). Nota WYSIWYG pendiente (mejora, no bug): el slot de **corazón** vacío no insinúa la forma de corazón (la máscara solo se ve con foto cargada) — evaluar dibujar guía de forma en slot vacío.

**Pendiente de Lucy (ACCIÓN HUMANA, no bloquea código):** subir diseños prediseñados en `/admin/disenos`; subir las 53 fichas de letras en `/admin/fichas`; fotos de catálogo; confirmar el cobro por letra con producción; **recorrido en Vercel** (dar la URL del preview de `develop` para certificar paridad prod: fuentes + @napi-rs/canvas del build).

**Fase A del Estudio: render de producción EN EL SERVIDOR (2026-07-12 cont., ADR-057).** Arranque del plan de las 3 categorías restantes ([PLAN_CATEGORIAS_ESTUDIO.md](PLAN_CATEGORIAS_ESTUDIO.md)) por la fundación de calidad (gap #1 del research): el PNG 300 DPI de impresión se generaba en el celular del cliente. **A0** (`bd7aa90`): el `SlotStateSchema` (Zod v4 strip) descartaba `photoTransform` (encuadre pan/zoom) + `textOverrides` → el encuadre manual se **perdía al guardar/recargar** (bug real) y bloqueaba el render server; se persisten con rangos anti-tamper. **A1a** (`edff931` + `768a5bd`): módulo `production-render.ts` (sharp) que reconstruye el PNG de cada slot replicando la matemática de Konva del editor; integrado en `finalizeDesign` (solo-foto → server-side; texto/marco/filtro → fallback al PNG del cliente). **Revisión adversarial** (32 agentes, 14 hallazgos → 7 confirmados, incl. un CRÍTICO: foto que no cargaba → PNG en blanco silencioso) → fix **conservador**: el server solo renderiza casos 100% fieles (foto sin filtro/rotación/cornerRadius/múltiples-placeholders/stage-sano/foto-que-carga), todo lo demás cae al cliente. Verificado: tsc + lint + 13 unit + 15 integración (2 e2e finalize) + build. **Pendiente A1b** (Konva-on-node para Polaroid/texto/marcos + filtros con fidelidad exacta) — requiere la dependencia nativa `canvas` (aprobación de Lucy). También se **limpiaron 12 categorías basura** (`Cat …`) de fixtures de tests filtrados a la BD dev (`make cleanup-test-junk`, script reproducible).

**Categoría "Juegos y Aprendizaje" CERRADA — precio por ficha + estilos/ocasiones + revisión adversarial (2026-07-12 cont., ADR-057 addendum).** Tras feedback experto de Lucy se cerró el abecedario: (1) **Nombre Personalizado con precio POR FICHA** — `variant.price` es el precio de UNA ficha, el total = nº letras × precio-ficha, calculado en vivo en editor y carrito con el mismo cálculo (sin desajuste); selector "¿cuántas letras?" en la ficha; idioma FUERA de Nombre (el alfabeto con Ñ se resuelve en el editor), 6 variantes. (2) **CTA adaptativo** "tu imán/tu adhesivo" según variante. (3) **"Esto recibes" quitado** de la ficha (el visual vive en el Estudio). (4) **Completo/Vocales con los mismos controles de color que Nombre** (hook compartido `useLetterColors` + `ThemePicker`/`SwatchRow`). (5) **Estilos = ocasión** — selector en el Estudio: "Solo letra" (Default, sin arte, vendible ya) + estilos ilustrados (Animales/Navidad/Dinos…) que son `LetterTileSet` (el modelo ya era multi-set); admin `/admin/fichas` con **"Crear estilo"**; fichas **VERTICALES** (espejan el imán físico); estilo guardado en `metadata.styleSetId`; no cambia el precio. **Revisión adversarial de la ruta del dinero** (workflow, 34 agentes, 15 hallazgos → **2 confirmados**, 13 descartados por escépticos): subcobro por tamper (draft genérico sobre Nombre cobraba 1 ficha) → el carrito ahora **gatea por la VARIANTE** (por-ficha exige letras server-side, si no rechaza) + test anti-tamper; `selectedIndex` obsoleto al acortar el nombre → clampado al nº de fichas. 4 commits en `develop` (f5f4b2c, 588bd8c, 3c07914, ab3622a + fixes). Verificado: tsc + lint + tests de integración (precio por ficha + anti-tamper). Pendiente de Lucy (ACCIÓN HUMANA): subir fichas por estilo, dibujar más estilos, ajustar precios por ficha en admin, fotos de catálogo de Completo/Vocales, confirmar cobro por letra con producción.

**Fase 3 EN EJECUCIÓN — Estudio fit-for-purpose por tipo de producto (2026-07-12, ADR-057).** Tras decidir
"aumentar Konva, no refactorizar", se construyó el **primer editor a la medida** (Nombre Personalizado del
abecedario: escribe una palabra → tira de fichas kawaii, con temas de color + color por letra + barajar) y
se adoptó el patrón **"la ficha configura, el editor personaliza"** (opciones idioma/tamaño/imantado en la
ficha vía VariantSelector; editor solo para lo creativo). El **abecedario se reestructuró a 3 productos**
(Completo · Vocales · Nombre), idioma como opción, 30 variantes con precios editables en admin. Se **certificó
el flujo de imágenes por variante** (prueba funcional real + 11 hallazgos, 8 corregidos, incl. un HIGH que
afectaba todo producto creado en admin). Se construyó el **admin de "Sets de fichas"** (`/admin/fichas`) para
que Lucy suba las 53 ilustraciones de letras; el editor ya las usa (placeholder si faltan). Todo verificado
(tsc/build/tests + pruebas funcionales contra dev) y en `develop`. Pendiente de Lucy: subir las 53 fichas +
ajustar precios + fotos por variante. Detalle en la bitácora 2026-07-12 (cont.).

**Compartir diseño COMPLETO + revisión adversarial (2026-07-12, ADR-056).** Se cableó la infra de
`Design.shareToken` (existía sin usar) en un feature de punta a punta: **"Mis diseños"**
(`/mi-cuenta/disenos`, pestaña nueva en la cuenta) con grilla de los diseños finalizados del cliente +
preview + acciones Compartir (copia link) / WhatsApp / Ver / Archivar; y una **vista pública `/d/[token]`**
(preview + producto + CTA "Crear el mío", `noindex`, OG image para miniatura al compartir en WhatsApp).
Aislado por `customerId`, token de 16 bytes hex (sin IDOR). **Revisión adversarial** (4 dims × 3 escépticos):
6/7 hallazgos confirmados y corregidos — toast de copiado honesto (antes mentía "copiado"), archivar REVOCA
el link (shareToken=null), popup WhatsApp en el gesto (iOS Safari), `ensureDesignShareToken` atómico
(concurrencia), `getSharedDesign` dedup con `cache()`. **Decisión diferida (ADR-056):** archivar NO borra
el preview público porque las 3 vistas de pedido (cliente/confirmación/**producción admin**) leen
`design.previewUrl` en vivo → retirar la imagen exige desacoplar pedido↔imagen (snapshot en OrderItem o
bucket privado con signed URLs); **pendiente de decisión de Lucy**. Verificado: tsc + build OK · integración
compartir 13/13 · suite completa 1666 passed.

**Pago contra entrega (COD) COMPLETO + endurecido (2026-07-11, ADR-055).** El requisito de lanzamiento
que faltaba (mandato #5): selector Wompi/COD en el checkout, guía Aveonline con contraentrega +
valorRecaudo, banner y email de confirmación, reusando el saga battle-tested. Pasó revisión adversarial
(dinero real, 39 agentes) → 11 hallazgos confirmados, todos arreglados: el P0 (COD sobre carrito Wompi
abandonado → guía prepagada sin recaudo → despacho gratis), P1s (banner engañoso si falla la guía/stock;
devolución que deja la orden atascada e invisible), P2s (ingresos contaban COD antes de cobrar → ahora
Wompi capturado + COD entregado, con "COD por cobrar" aparte en resumen + finanzas + panel; rate-limit COD
propio; botón cancelar admin roto en PAID). **Toggle COD_ENABLED** (setting BOOLEAN con interruptor real en
/admin/contenido/configuracion) para activar/desactivar contra entrega. También en esta racha: **Bloque D
resumen diario de operación** (email 8am + panel /admin/observability + tests) y el blindaje de webhooks
(tests de route Aveonline+Wompi). Verificado a lo largo: tsc + build + suites verdes.

**Webhooks críticos blindados con tests de route (2026-07-11).** El bug del webhook de Aveonline
(guia numérica) pasó a producción con CI VERDE porque NINGÚN test ejercitaba el route real — solo los
saga se testeaban directamente. Se cerró el hueco para AMBOS webhooks: `route.integration.test.ts` de
Aveonline (path real POST→handleWebhook con guia numérica→transición de orden; probado que ATRAPA la
regresión: revertir el fix → test falla) y de Wompi (firma HMAC real + anti-replay + validación de monto

- idempotencia + ruteo por status, 9 casos, saga mockeado). Gate de regresión: **suite completa 1648/1648
  verde**. (Cleanup de test corregido: dejaba webhookEvents huérfanos en la DB compartida.)

**Integración Aveonline auditada 100% vs doc oficial (2026-07-11, ADR-054).** Auditoría multi-agente de
las 7 áreas (auth/cotización/guía/agentes/transportadoras/tracking/webhooks) contra la doc oficial +
ground-truth de las respuestas reales → 12 hallazgos confirmados, 11 arreglados. El más grave: el webhook
mandaba `guia` como número y reventaba silenciosamente la búsqueda de la orden (String column) → ninguna
orden pasaba a SHIPPED/DELIVERED ni salían correos; ahora se coacciona a String (+ test). También:
cache-poisoning 24h de transportadoras (bloqueaba guías de pedidos pagados), `valorMinimo` que sub-aseguraba
a $10.000, `fechamostrar` mal leído, `plugin` a "apiave", tipos String en productos, timezone Bogotá en
webhooks. Verificado: tsc + build + unit 8/8 + live smoke 2/2 (código real vs API) + saga 30/30. Pendiente:
confirmar keys de listWebhook/deleteWebhook (no documentados). Antes: fix del valorDeclarado en centavos.

**Cotización de envío ARREGLADA + ruta endurecida (2026-07-11, ADR-053).** La dueña reportó "no
pudo cotizar envío en el step 2". Causa raíz **medida** contra la cuenta Aveonline real: el endpoint
`cotizarDoble` tarda 7–11 s (cotiza 10 transportadoras server-side) pero el timeout estaba en 5 s
(uniformado por ADR-045) → todo intento expiraba. Fix: timeout 5→15 s, retry acotado a 2, maxDuration
del step 30→45. Una **revisión adversarial multi-agente** (3 lentes × panel escéptico, 48 agentes)
encontró 9 hallazgos confirmados más, todos arreglados: producto sin peso/dims rompía TODA la
cotización y filtraba el mensaje admin al cliente (ahora banner genérico + gate de dims al publicar),
breaker compartido que dejaba una tormenta de cotización bloquear la generación de guía de órdenes YA
PAGADAS (breaker separado), error de selección invisible, respuesta de error top-level tragada, fetches
de Resend sin timeout, PICKUP vacío mandando origen `()`, etc. Verificado: tsc + build + 904 unit + 100
integración (productos/checkout, incl. gate de publicación) verdes.

**Direcciones: bucle de reuso 100% CERRADO en ambos sentidos (2026-07-11, ADR-051/052).** La cuenta
y el checkout comparten el MISMO formato estructurado (DANE + urbano/rural + vía/cruce), guardado tal
cual en `Address.structured`. Una dirección guardada se reusa 100% al pagar (`applySavedAddress` con
reset previo, evita direcciones mezcladas) **y** ahora el checkout puede GUARDAR la dirección nueva en
la cuenta (checkbox opt-in, solo logueados, idempotente por line1+city+department, no-fatal). Mapeo
`structured→libro` centralizado en `buildAddressInput` (fuente única, line1 canónico = el del courier).
Editar direcciones legacy pre-siembra depto/ciudad y avisa. Se cerraron **8 hallazgos** de la revisión
adversarial del ADR-051. Verificado: build OK · tsc limpio · 38 unit + 45 integración verdes. Antes de
esto, el área **/mi-cuenta** quedó funcional y completa (ADR-050).

**Checkout/pagos CERTIFICADO + Compliance Bloque B cerrado (2026-06-27).** El flujo de
checkout (Wompi + Aveonline + saga POST-PAID) pasó por una **certificación adversarial
multi-agente** que encontró y cerró un P0 bloqueante (índice unique de InventoryLog sin
variantId rompía toda orden multi-ítem, reproducido contra DB) + 4 fixes pre-launch + 5
post-launch + un P1 de doble-guía concurrente hallado en la verificación. Garantías ahora
en el código: idempotencia física del ledger (índice parcial `(orderId, reason, variantId)`

- manejo P2002), claim atómico de guía (`Order.shipmentClaimedAt`), clearCart dentro de la
  tx PAID, email de confirmación idempotente/recuperable (`confirmationSentAt`),
  VOIDED→REFUNDED con revert de stock, retry de colisión de `Order.number`, unique parcial de
  `Order.cartId`, anti-replay + env-match en webhook, reconciliación visible
  (`needsReconciliation` + banner en /admin/pedidos). **48 tests de orders (integración DB
  real) verdes.** **Bloque B compliance:** `/unsubscribe` (Ley 1581), textos legales reales
  (privacidad/términos/devoluciones/subprocesadores Aveonline), retracto verificado contra
  Ley 2439/2024 (reembolso 15 días calendario), voseo→tuteo en emails. **Admin restructurado
  (Opción C):** /admin/inventario, sub-nav del producto (Editar/Versiones/Reseñas), bulk
  actions, sidebar reagrupado. **Pulido UX admin "amigable" (2026-06-27):** auditoría
  multi-agente de ~18 comentarios de Lucy → 3 bugs cerrados (precio opción en pesos, orden
  categorías determinista, sidebar sticky) + sprint "Admin amigable" + sub-categorías +
  flechas reorden + precio base auto-derivado + ordenar por clic en columnas + **fotos por
  opción (D1: migración `ProductVariant.images` + uploader admin + galería reactiva en el
  PDP)**. Los 6 bloques del feedback cerrados (7 commits). **Bloque C Seguridad CERRADO
  (7/7, 2026-06-29):** P0 (rate-limit, RLS 17 tablas, CI) + MFA admin completo (enroll/QR +
  reto + **códigos de respaldo** + cambiar dispositivo) + Reseñas + Turnstile registro/reset +
  RBAC por rol + logout global + idle-timeout 30min + rate-limit checkout/upload + **CSP por
  nonce en prod** (ADR-042/043). **Bloque E Testing a fondo (2026-07-03):** ~1.529 tests vitest
  (servicio/lib + 83 de UI con revisión adversarial) + **CI-DB LISTO** (Postgres real en cada PR)
- **E2E Playwright 17/17** — smoke, compra, login admin, **reto MFA (TOTP RFC 6238 propio +
  código de respaldo)** y **Estudio Konva**; runner local serial (next dev + pooler no toleran
  concurrencia). **Próximo: validar C3 (CSP) en deploy preview de Vercel + P0-004 verificar
  dominio Resend (ACCIÓN HUMANA DNS); en Bloque E falta a11y con axe (dep por aprobar), E2E
  envío/pago (deps externas), visual y load; o pasar a Bloque F (Reembolsos+Cupones).** Detalle
  de fases intermedias en el historial git + bitácora abajo.

**Capa de resiliencia CABLEADA (2026-07-09, ADR-045).** Se cerró el hallazgo abierto de la
auditoría (`fetchWithTimeout`+`withRetry`+`CircuitBreaker`, ROADMAP:195): Aveonline tenía **7/8
llamadas fetch sin timeout** (riesgo real de colgar el checkout / atascar órdenes). Ahora todos los
proveedores externos pasan por timeout obligatorio + circuit breaker per-instancia + retry con
backoff SOLO en llamadas idempotentes (generar-guía NO reintenta: evita guía duplicada). Verificado:
14 tests unitarios nuevos + 90/90 unit + **65/65 integration contra el path REAL de Aveonline demo**.

---

## 🔴 PENDIENTE SERIO (Lucy 2026-07-04) — Investigación profunda de plantillas del Estudio

Lucy validó `/admin/plantillas`: las plantillas están presentes pero **NO son realmente
funcionales todavía**. Pidió, para **más adelante** (NO ahora), un **trabajo investigativo fuerte**:

- ¿La tecnología es la correcta (react-konva) o conviene otro enfoque?
- Que las plantillas sean **realmente utilizables** (no solo la interacción), bien enfocadas.
- Filosofía: **menos cantidad, pero correctamente enfocadas y funcionales** (coincide con la
  investigación: calidad > cantidad, ~12-16 por ocasión).
- Los previews actuales usan relleno gradiente genérico → muestran estructura, no diseño final.
  **Decisión:** diferido; retomar como bloque dedicado (investigación tech + rediseño de plantillas).
  El pipeline de previews + galería admin YA están listos como infraestructura para cuando se retome.

## ⏳ EN CURSO — 2026-07-04 (Fase 3 Estudio: enfoque de plantillas VALIDADO, produciendo)

> **Checkpoint de continuidad.** Investigación TERMINADA; ahora en fase de producción.

**Investigación (workflow `deep-research` `wf_9c6d6ec3-28e`) — COMPLETADA.** 11 claims verificados
adversarialmente (output: `/tmp/claude-1000/.../tasks/wtdq9m96v.output` — `/tmp` no sobrevive reboot).
**Veredicto: plantilla-first es CORRECTO** (Customer's Canvas recomienda template > lienzo blanco;
Shutterfly imanes es template/product-first, ~291 diseños por ocasión; academia "customization via
starting solutions" gana a atributo-por-atributo). PERO 2 matices fuertes: (1) **móvil se simplifica
radical** — la app de Snapfish es SOLO-FOTO (quitaron el editor en móvil); para imanes foto el patrón
simple "sube tu foto → listo" convierte (Mixtiles/Snapfish-imanes). (2) **NO apuntar a 30 plantillas**:
choice-overload es real y condicional — calidad > cantidad; leaders categorizan por OCASIÓN.

**Diagnóstico del código (hecho):** 51 plantillas en DB (8 activas: 7 "libre-\*" lienzo blanco por kind

- 1 premium; 42 inactivas con canvasData real pero **previews Unsplash placeholder** que Lucy rechazó,
  ADR-037). Cuello de botella = **producción de contenido con la barra de calidad de Lucy, no código**.
  NO hay admin CRUD de plantillas.

**PLAN (progreso):**

1. ✅ **Pipeline de previews REALES** (`6bd1a33`) — ruta interna `/internal/plantilla-preview/[slug]`
   renderiza con el `StudioSlot` real (Konva) + foto de muestra (SVG data-URL); generador gateado
   `GEN_PREVIEWS=1` screenshotea el `<canvas>` → Storage `product-images/template-previews/<slug>.png`
   → `previewUrl`. **46/46 regeneradas, 0 fallos.** Incluye soft-deleted.
2. ✅ **Galería admin `/admin/plantillas`** (`5078920`, grupo Catálogo, SUPERADMIN/MANAGER) — preview
   real por plantilla + estado 🟢/🟡/⚫ + aprobar (isActive+restore) / ocultar. Auditado.
3. ⏳ **[ACCIÓN LUCY]** revisar `/admin/plantillas` y aprobar el set curado por ocasión (~12-16).
4. ✅ **Copy móvil del Estudio device-aware** (`99d8664`) — el onboarding decía "arrastra al panel
   de la izquierda" (no existe en móvil). Ahora `useIsMobile` → copy "toca y sube tu foto";
   hint del sidebar device-neutral. Observado + verificado con screenshot a 390px. NO se tocó el
   canvas (feature madura co-diseñada).
5. ⏳ **[PROPONER a Lucy] rediseño mayor del flujo móvil** (tabs por ocasión, entrada radical
   simple tipo Mixtiles/Snapfish) — toca su feature co-diseñada + depende de la curación de
   plantillas por ocasión. Requiere su visión, no hacerlo a ciegas.

**Al retomar:** (a) si Lucy no aprobó plantillas, recordarle abrir `/admin/plantillas`; (b) si dio
su visión del flujo móvil, ejecutar paso 5; si no, proponérselo con opciones.

## Última sesión — 2026-07-17 (Estudio P2 inmersivo + variedad de escenas del hogar — ADR-063)

Cierre del bloque **P2 inmersivo** del Estudio (el detalle vive en el "Resumen actual" arriba). Lo
distintivo de la sesión fue el feedback creativo de Lucy: **"¿solo neveras? ¿no planteas otros
escenarios de un hogar?"** → cada producto estrena su PROPIA escena, y el fotoimán suma varias:

- **SEP1** (`1894fcd`) — separador en un **libro** (r3f). **FOTO3** (`d4d2586`) — fotoimán en un
  **flat-lay de regalo** (2D procedural). Ambos verificados headless.
- **FOTO4 + NOM2 re-skin** (`4414b35`) — decisión de UX: en vez de sumar botones sueltos (5 se
  desbordan en móvil), **una galería única `scene-gallery.tsx`** con chips: 🧊 Nevera · 🖼️ Mural ·
  📚 Repisa · 🎁 Regalo. Escenas nuevas: `RoomBoardView3D` (tablero magnético en un cuarto, r3f
  CSP-safe, memo/cork) + `compose-shelf-flatlay` (repisa con **asentado por alfa** — la silueta real
  posa sobre la madera, no la caja; corazón no flota). **NOM2:** el nombre pasa de la nevera a su
  propio tablero magnético (escena distinta a la de los fotoimanes).
- Patrón de verificación reforzado: los compositores 2D se verifican **headless** con un harness
  napi-canvas que replica el dibujo; las vistas 3D (WebGL) no renderizan headless → quedan marcadas
  para **prueba GUI de Lucy**. Todo certificado (tsc+lint+prettier repo incl. md+build) y **CI verde**.

**Al retomar:** el Estudio (P1 + P2 inmersivo) está completo del lado de código. Lo que queda es
**carril de Lucy**: contenido (CAL3 arte de meses, rediseño marco Polaroid FOTO2) y **pruebas GUI**
en navegador de las escenas 3D (tablero/mural/libro/calendario) + galería de escenas. Si Lucy pide
más, la conversación abierta era si darle también a los separadores/otros su propia variedad.

## Última sesión — 2026-07-11 (Direcciones: reuso bidireccional + guardar-al-pagar — ADR-051/052)

Continuación del trabajo de unificación de direcciones (ADR-051). Se cerraron los **8 hallazgos** de su revisión
adversarial (commit 9aa6f96) y luego se completó el bucle de reuso (ADR-052, commit siguiente).

**Fixes de la revisión (9aa6f96):** #1 [HIGH] `applySavedAddress` ahora resetea TODOS los campos antes de aplicar la
guardada → evita dirección MEZCLADA (ciudad nueva + calle vieja) que pasaba validación en silencio. #2/#5/#10 [MED]
editar una dirección legacy pre-siembra depto/ciudad/CP desde los nombres planos (DANE por nombre) + aviso con la
dirección anterior; ya no abre en blanco ni bloquea. #3/#4/#9 [LOW] la cuenta usa el `composeAddressLine` CANÓNICO
(el del courier), `line2=null`; se eliminó el duplicado lossy de `parse-address.ts`. #6 [LOW] error de CP visible.
#8 [LOW] copy honesto del selector.

**Guardar-al-pagar (ADR-052):** `buildAddressInput` centraliza el mapeo `structured→libro` (fuente única, elimina la
3ª copia). `saveCheckoutAddressToAccount` guarda opt-in desde el checkout, **idempotente** por line1+city+department,
no hijackea la default, es **no-fatal** (si falla, se loguea y el pago sigue). UI: checkbox "💾 Guardar esta dirección"
solo para logueados (`canSaveAddress`) + etiqueta opcional; el action re-verifica `getCurrentCustomer` (no confía en
el form). Housekeeping: **fix voseo** en el action del checkout ("completa", "Reintenta", "avísanos").

**Verificado:** `next build` OK · `tsc` limpio · **38 unit** (incl. `buildAddressInput`, urbano/rural/isDefault) +
**45 integración** DB (direcciones+checkout, incl. idempotencia de guardado) verdes.

**ACCIÓN HUMANA sugerida:** re-guardar la dirección legacy "Casa" con el form nuevo (pasa a reuso 100%); probar en el
navegador el checkout logueado → marcar "Guardar esta dirección" → verificar que aparece en /mi-cuenta/direcciones.

## Última sesión — 2026-07-10 (Área de cuenta /mi-cuenta funcional — ADR-050)

Lucy validó `/mi-cuenta` y la calificó "básica, poco funcional e incompleta". Se construyó el área COMPLETA
(ADR-050). Hallazgo del mapeo: **"Mis pedidos" ya existía y funcionaba** pero la landing no lo conectaba (mostraba
"Pronto aquí" estático). Ahora: **shell** (layout+nav+overview hub, guard con `getCurrentCustomer` memoizado) +
**perfil** editable + **direcciones** CRUD (invariante 1-default, 6 tests) + **reseñas** (estado + borrar propia) +
**seguridad** (cambiar contraseña con re-auth+HIBP+rate-limit) + **eliminar cuenta** (Ley 1581: anonimizar+soft-delete
conservando órdenes por DIAN + borrar auth user; política en COMPLIANCE.md). Housekeeping: labels OrderStatus
compartidos, **fix voseo** en pedidos/[number], correo habeas-data reconciliado (`habeas-data@`), login `?next=`.
`next build` OK (8 rutas) + typecheck + eslint + tests. Validación visual de Lucy: OK.

**Revisión adversarial del área de cuenta (ADR-048-style) → 15 hallazgos confirmados, 0 falsos positivos, todos
arreglados.** El clúster crítico fue **eliminar cuenta**: la implementación inicial dejaba PII sensible sin borrar
(fotos del Estudio en customer-uploads = rostros, tickets de soporte, columnas PII de Address, snapshot
Order.shippingAddress, logs). `delete-service.ts` se reescribió para supresión EXHAUSTIVA (3 buckets Storage +
scrub de todas las tablas + fallback de baneo si deleteUser falla). Más: promover default al borrar, índice
parcial-único DB one-default, robots noindex, count real de pedidos, voseo email delivered. Ver ADR-050 addendum.

**Conexión cuenta ↔ checkout + UNIFICACIÓN de direcciones (ADR-051, validado por Lucy: reusa 100%).** (1) El
checkout pre-llena el CONTACTO (nombre/correo/tel/documento) desde el perfil del cliente logueado. (2) "Usar una
dirección guardada" en el checkout. (3) **Unificación**: la cuenta y el checkout ahora usan el MISMO formato
estructurado (DANE + urbano/rural + vía/cruce) — `Address.structured` (JSONB, migración 20260710120000),
componente compartido `components/address/structured-address-fields.tsx`, parseo/validación compartido
`features/checkout/parse-address.ts` (el action del checkout se refactorizó para usarlo). Reuso 100% al pagar.
Direcciones legacy (form viejo, structured null) → fallback depto/ciudad; al re-guardarlas pasan a 100%.
**EN CURSO al momento de escribir:** suite completa + revisión adversarial de la unificación (commit 6cb6b65)
corriendo — al terminar, arreglar hallazgos confirmados. Mejora futura: "guardar dirección" en el checkout;
hidratar el edit de legacy; el form inline del checkout puede adoptar el componente compartido (deuda menor).

**Antes de todo esto**: se cazó y arregló una contaminación de test (`captureClientError` "message vacío" dejaba
filas "unknown" en el panel real → fix + [[project_integration_tests_share_dev_db]]).

## Última sesión — 2026-07-09 (Resiliencia + open-redirect + errores cliente — ADR-045/046/047)

**Qué se hizo.** Se implementó y **cableó** la capa de resiliencia que quedaba pendiente en la
auditoría de productive-readiness. Tres helpers nuevos en `apps/web/lib/`:

- `fetch-with-timeout.ts` — `fetchWithTimeout(url, {timeoutMs})` con `AbortController` + `AbortSignal.any`
  (respeta la señal del caller); timeout → `FetchTimeoutError` (name `TimeoutError`).
- `retry.ts` — `withRetry` (3 intentos, backoff exp + jitter, `sleep` inyectable) sobre `isRetryable`
  (timeouts/red/5xx/408/429; **nunca 4xx**).
- `circuit-breaker.ts` — `CircuitBreaker` per-instancia (`threshold:5/resetMs:30s`), closed/open/half-open.

**Cableado (criterio = idempotencia):**

- **Aveonline** (helper `aveonlineFetch` + `aveonlineCB`): auth/quote/carriers/agents/tracking/list-webhooks
  con `retry:true`; **`createShipment` con timeout(15s)+CB pero SIN retry** (generar guía NO es idempotente
  → un reintento crearía guía duplicada). Antes 7/8 fetch NO tenían timeout — el hueco más grande.
- **Wompi** (`wompiCB`): `getTransaction` (GET estado, idempotente) → retry+CB; su timeout bajó 10s→5s
  (con retry+backoff es más robusto que 10s pelado).

**Orden clave:** retry POR FUERA del breaker (`withRetry(() => cb.exec(fetch))`) → el CB ve cada intento
y, abierto, `CircuitOpenError` (no reintentable) corta el loop de una.

**Verificación:** 14 tests unitarios nuevos + 90/90 unit (wompi/payments) + **65/65 integration contra el
path REAL de Aveonline demo** (saga + checkout, 174s) → el cableado NO rompe el happy path. typecheck limpio.
**Falta:** cablear el cliente Anthropic (Studio IA) cuando se implemente (Fase 3).

**Open-redirect cerrado + `safeRedirectTarget` (ADR-046).** Segundo hallazgo de seguridad abierto
(ROADMAP:196). El CMS de redirects admin (`UrlRedirect`, servido por proxy.ts) aceptaba destinos
disfrazados de internos (`//evil.com`, `/\evil.com`) que el navegador resuelve a host externo → phishing.
Los tests ya lo **documentaban como `BUG:`**. Nuevo `lib/safe-redirect.ts`: `isSafeInternalPath`/
`safeRedirectTarget` (solo interno, para `?next=`) + `isAllowedRedirectDestination` (interno o externo
http(s) explícito, para el CMS). Cableado en `createRedirect`/`updateRedirect` (rechaza disfrazados,
mantiene externos por diseño) y en **login** (ahora honra `?next=` sanitizado — antes iba a `/` fijo).
13 tests unitarios nuevos + los 2 `BUG:` reescritos a "BLOQUEA" → **75/75 integration contra DB real**.

**Observabilidad: loop de errores del cliente cerrado (ADR-047).** Bloque D capturaba errores del
servidor (onRequestError→ErrorLog) pero los error boundaries del cliente solo hacían `console.error` →
los errores client-side se perdían. El modelo `ErrorReport` (dedup por fingerprint) ya existía sin writer.
Se cerró: `captureClientError` (upsert por SHA-1(message+stack[:3]), best-effort, race-safe) +
`/api/log-error` (Zod + rate-limit IP + nunca 5xx) + `error.tsx`/`global-error.tsx` reportan con keepalive +
panel `/admin/observability` con tile "Errores cliente" + sección de reportes abiertos **accionable**
(botones Resolver/Ignorar → server actions SUPERADMIN + audit log). 9 tests integración nuevos.
**Pendiente-mejora:** reabrir auto un reporte resuelto si el fingerprint recurre.

**Revisión adversarial multi-agente + 8 arreglos (ADR-048).** Se sometió TODO el código de la sesión
(36 archivos) a un workflow de revisión: 8 dimensiones de alto riesgo en paralelo, cada hallazgo verificado
por 3 escépticos con lentes distintas (correctness/security/reproducibilidad), sobreviviendo solo ≥2/3.
14 hallazgos → **8 confirmados** (0 críticos), 6 correctamente refutados. Arreglados los 8: timeout de
createShipment restaurado 15s→**20s** (mandato #9, evita guía huérfana/doble), reabrir reportes RESUELTOS que
recurren, prueba única en half-open del circuit breaker, fingerprint incluye digest + normaliza tokens volátiles,
tope global anti-bloat en /api/log-error, y **gate de producción en `/internal/plantilla-preview`** (era pública
sin auth → enumeración de plantillas ocultas). Suite completa (1614 tests) verde antes y después.

**`maxDuration` explícito en el path de pago (ADR-049).** Investigando el descartado #5 de ronda 1 (retry budget
vs límite serverless) se verificó en docs oficiales que Vercel con Fluid Compute da **300s** (Hobby y Pro), así que
los presupuestos (15.7s retry, 20s createShipment) caben — PERO ninguna función lo declaraba. Se descubrió que
**3 funciones corren createShipment** (webhook + `/checkout/gracias` fallback + admin retry), no 2. Las 3 → `maxDuration=60`;
`/checkout/envio` (quote, lectura) → 30. Evita que la plataforma mate createShipment (no-idempotente) a mitad → guía
huérfana. **ACCIÓN HUMANA (lanzar):** confirmar Fluid Compute ON + plan Pro honra maxDuration≥60.

**Ronda 2 (verificación de los arreglos):** 2º workflow adversarial atacó cada arreglo → 6 confirmados, refinados.
Los 2 MEDIUM: el backstop de /api/log-error cambiaba bloat por **supresión de observabilidad** (bucket por-request
ocultaba otros bugs) → rediseñado a tope solo-filas-nuevas dentro de `captureClientError` (findUnique-first,
incrementos nunca se frenan, reopen solo si RESUELTO); y el preview gate dejaba **preview deployments abiertos**
contra la BD real → endurecido a `if (VERCEL_ENV) notFound()`. Más 4 LOW (regex de fingerprint sin colapsar URL
entera, precondición del CB documentada). Suite completa verde. Ver ADR-048 §Ronda 2.

**Nota de continuidad:** el bloque "🔴 PENDIENTE SERIO" (investigación profunda de plantillas) y el
checkpoint "⏳ EN CURSO" de Fase 3 siguen vigentes/diferidos — no se tocaron esta sesión.

## Sesión — 2026-07-03 (deploy + git flow + regresión visual + Bloque D + F + axe)

**Deploy + flujo Git normalizado (`8be9f97`).** Se descubrió que **116 commits vivían solo en la VM**
(sin push) — el sitio en Vercel corría código viejo (por eso `/api/cron/alerts` daba 404). Se pusheó
`develop` a GitHub, se creó la rama **`production`** (release/live; `main` no existe — decisión de Lucy),
y Vercel redesplegó → **todo el trabajo quedó EN VIVO** (endpoint de alertas confirma `{"ok":true,...}`;
la cron pg_cron ya recibe 200). Estrategia de ramas en OPERATIONS.md. **De aquí en más: push a develop
al cerrar cada tanda** (memoria [[feedback_push_develop_regularly]]). ACCIÓN HUMANA opcional: cambiar
Production Branch de Vercel a `production`.

**Regresión visual (`b872b5d`).** Playwright `toHaveScreenshot` nativo (sin deps) sobre 4 páginas
ESTÁTICAS (404, ayuda, legal/privacidad, legal/terminos) → baselines deterministas linux (verificado:
re-run pasa en 17s). Overlays dinámicos enmascarados, animaciones off. **Clave:** `waitUntil: "load"`
(NO `networkidle` — el reporter de Web Vitals mantiene conexiones → networkidle nunca resuelve, goto
expira; con networkidle tardó 16min y falló 2/4; con load: 24s genera, 17s verifica). Regenerar tras
cambio visual intencional: `playwright test visual --update-snapshots`.

## Sesión — 2026-07-03 (Bloque D observabilidad + Bloque F completo + axe WCAG AA)

**Bloque D — observabilidad sin Sentry (`35fe80a`, `118cd78`). Backend listo.**

- **Captura de errores en DB (`ErrorLog`):** `instrumentation.ts` `onRequestError` (hook oficial de
  Next 16, lo que usa Sentry) → `captureServerError` → `ErrorLog`. Best-effort. **Verificado
  end-to-end:** una ruta que lanza 500 aparece en `ErrorLog` con routePath/routeType.
- **Panel `/admin/observability` (salud técnica, SUPERADMIN):** tiles (rojo si errores/reconciliación
  > 0), top errores 7d, órdenes a reconciliar, reversas de stock, Web Vitals + link a /api/health/all.
  > `getTechHealth` agrega de ErrorLog/WebhookEvent/Order/InventoryLog/WebVital. Nav en Analítica.
- **Alertas por email (`/api/cron/alerts`):** `evaluateAlerts` (pico 5xx ≥5/5min, órdenes a
  reconciliar, webhooks atascados >1h — cada una con "qué se rompió + qué hacer") + `dispatchAlerts`
  (dedup 30min vía `AlertState` + Resend a `ALERT_EMAIL`). Endpoint gateado por `CRON_SECRET`
  (timing-safe, 401 fail-closed verificado). **ACCIÓN HUMANA:** agendar pg_cron + `CRON_SECRET`
  (SQL en OPERATIONS.md). 4 tests integración. Falta: SLOs cuantitativos + resumen diario 8am.

## Sesión — 2026-07-03 (Bloque F COMPLETO: cupones + reembolso + retracto + axe WCAG AA)

**Bloque F3 — retracto UI + gestión admin (`567d53d`, parte 2 de 2). Bloque F cerrado.**

- **Cliente:** `RetractControl` por item en `/mi-cuenta/pedidos/[number]` — "Solicitar retracto"
  con motivo si el item es elegible, badge de estado si ya hay solicitud, nota "personalizado →
  sin retracto" si aplica; `requestRetractAction` re-valida.
- **Admin:** `/admin/retractos` (SUPERADMIN, deny-by-default) lista por estado + acciones del ciclo
  (aprobar → email instrucciones, marcar recibido, registrar reembolso con método → email
  reembolso, rechazar con motivo). Dinero **manual** (el UI lo dice). Per-item; NO toca el estado
  de la orden ni restaura stock (devuelto puede no ser revendible; el admin ajusta a mano).
- Servicio: state machine `RETRACT_TRANSITIONS` + approve/reject/markReceived/refundRetract
  (auditados) + `listRetractRequests`. 2 plantillas email + wrappers best-effort. Nav "Retractos"
  en Ventas. Tests: +4 ciclo admin → **18 tests de retracto** (pure + integración).
- **Correr integración fiable/rápido:** `DATABASE_URL="$DIRECT_URL" vitest` (evita el pooler).

**Revisión adversarial de Bloque F (`c8cc069`).** Workflow multi-agente (5 dimensiones: matemática
cupones · concurrencia · reembolso · elegibilidad legal · seguridad IDOR) con verificación
adversarial por hallazgo → **8 bugs reales confirmados, 0 falsos positivos.** Arreglados 7:

- **[HIGH legal]** ventana de retracto en UTC del servidor, no COT → recortaba ~5h. Ahora en hora
  Colombia (UTC-5 fijo).
- **[HIGH seguridad]** `refundOrderAction` + acciones `/admin/retractos` sin gate de rol (un
  FULFILLMENT podía reembolsar). Server Actions son POST invocables directo → gate SUPERADMIN en
  cada acción.
- **[MED integridad]** `usedCount` de cupón sin incremento atómico → 2 pagos concurrentes lo
  inflaban sobre `maxUses`. Ahora `updateMany` gateado (`usedCount < maxUses` vía field ref) gatea
  incremento + `CouponUsage`.
- **[MED]** `transitionOrderAction` permitía →REFUNDED saltando auditoría/email → bloqueado.
- **[MED seguridad]** IDOR: `createRetractRequest`/`getRetractableItems` saltaban el chequeo de
  dueño con `customerId` null (pedidos invitado) → ahora estricto.
- **[LOW]** TOCTOU retracto → captura P2002. **[LOW aceptado]** oráculo de enumeración de cupones
  (promo no es secreto + rate-limit + UX) — documentado.
  Tests: +COT-aware, +IDOR, +cupón-agotado. Todo verde (retract 19, saga 30). **Lección:** la
  revisión adversarial en un build largo con dinero/legal caza bugs que el typecheck+tests felices
  no ven.

## Sesión — 2026-07-03 (Bloque F: cupones + reembolso admin + retracto backend + axe WCAG AA)

**Bloque F3 — retracto backend (`7f9ce0e`, parte 1 de 2).** Fundamento del derecho de retracto
(Ley 1480 art. 47 + Ley 2439/2024). Falta la UI.

- Schema: enum `RetractStatus` + modelo `RetractRequest` (1:1 por `OrderItem`) + `Order.deliveredAt`
  (ancla la ventana de 5 días hábiles). Dos migraciones vía `migrate deploy` (la shadow DB de
  `migrate dev` no tiene `pg_trgm`); **ojo:** `migrate diff` sugiere DROPs de objetos NO-Prisma
  (índices trgm, `rate_limit_buckets`) → se quitaron a mano del SQL.
- `transitionOrder` sella `deliveredAt` al pasar a DELIVERED.
- `features/retract/service.ts`: `addBusinessDays`/`isWithinRetractWindow` (puros, Lun-Vie, sin
  festivos CO — documentado; el admin aprueba cada solicitud), `isItemPersonalized` (customDesign/
  designId → exceptuado), `getRetractableItems` (elegibilidad + motivo por item), `createRetractRequest`
  (re-validación atómica; refundAmount = línea; `RetractError`).
- Tests: 10 puros + 5 integración DB. **Dev server reiniciado** (cliente Prisma nuevo).
- **PRÓXIMO (F3 parte 2):** UI cliente (botón "Solicitar retracto" en `/mi-cuenta/pedidos/[number]`
  para items elegibles + acción) + gestión admin (`/admin/retractos`: aprobar/rechazar/recibir/
  reembolsar, reusa `refundOrder`) + emails (solicitud recibida + instrucciones devolución +
  reembolso).

## Sesión — 2026-07-03 (Bloque F1 cupones + F2 reembolso admin + axe WCAG AA)

**Bloque F2 — reembolso desde admin (`191f95f`).** La máquina de estados (PAID/DELIVERED →
REFUNDED) + revert de stock atómico ya existían; se sumó el flujo admin encima. El dinero en
Wompi se mueve **MANUAL** (contraentrega + preferencia de operar la pasarela a mano).

- Migración `20260703120000_order_refund_audit_fields`: Order gana `refundedAt`/`refundedBy`/
  `refundReason`/`refundAmount`. (Aplicada con `migrate deploy` — `migrate dev` falla por la
  shadow DB sin `pg_trgm`, mismo issue del CI-DB; se creó el SQL a mano.)
- `refundOrder(orderId, {adminId, reason})`: valida reembolsable, transiciona a REFUNDED (revierte
  stock vía `transitionOrder`), sella auditoría (`refundAmount` = total) + email. Idempotente
  (ya-REFUNDED → no-op, sin doble-revert).
- Plantilla `refund-issued` + `sendOrderRefunded` (idempotencyKey por orden). Acción admin
  `refundOrderAction` (auditada) + disclosure "Reembolsar pedido…" con motivo + aviso "el dinero
  se emite manual en Wompi" + Card de reembolso en el detalle.
- Tests: `refundOrder` PAID→REFUNDED (auditoría + revert + log ORDER_REFUNDED + email +
  idempotencia) + rechazo de estado no reembolsable. **Dev server reiniciado** (cliente Prisma
  nuevo). **Hallazgo:** los tests de integración flakean por el pooler transaccional (`:6543`
  read-after-write); correr con `DIRECT_URL` (`:5432`) los estabiliza (CI usa Postgres real, sin
  pooler). **Próximo: F3 retracto (Ley 2439).**

## Sesión — 2026-07-03 (Bloque F1: redención de cupones en checkout + axe WCAG AA + E2E)

**Bloque F1 — cupones en checkout (`1ccc5e4`).** La infra de cupones (modelos, admin CRUD,
service) ya existía; faltaba APLICARLOS al pagar. Implementado punta a punta:

- `features/coupons/redemption.ts`: `priceCouponPure` (núcleo puro — valida TODAS las reglas del
  modelo: activo, vigencia, usos globales + por-cliente, minOrder, requiresMinQuantity,
  restricción por categoría/producto; calcula descuento PERCENT/FIXED/FREE_SHIPPING sobre el
  subtotal elegible) + `priceCouponForCart` (carga cupón + items con slug producto/categoría,
  acepta un TransactionClient).
- `createOrderFromCart` aplica el cupón con **re-validación atómica dentro de la tx** (si venció
  entre aplicar y pagar → se ignora en silencio, orden sin descuento; nunca revienta el checkout).
  Persiste `discount` + `couponId`.
- Saga PAID: registra `CouponUsage` + incrementa `usedCount`, atómico con la transición a PAID,
  una sola vez (bloque guardado + `orderId @unique`). NO en la creación (una PENDING puede no
  pagarse).
- Estado de checkout lleva `couponCode`; acciones `applyCoupon`/`removeCoupon` rate-limited
  (anti-enumeración de códigos) + `CouponField` en el paso de pago + línea de descuento en
  `OrderSummary`.
- Tests: **17 unit puros + 5 integración DB + saga CouponUsage** (idempotente). 85 tests de
  orders/checkout sin regresión. **Próximo: F2 (reembolso admin) y F3 (retracto Ley 2439).**

## Sesión — 2026-07-03 (Bloque E: axe WCAG AA + contraste sin tocar paleta + E2E MFA/Estudio/a11y)

**axe-core WCAG 2.1 AA + remediación de contraste (`032bf85`, `b8d4d8e`).** Lucy aprobó la dep
`@axe-core/playwright`. Integrado (`axe.spec.ts` + `_helpers/axe-scan.ts`): auditoría de 9 páginas
clave con gate ESTRICTA (0 serious/critical). axe halló 3 tipos de violación real:

- **select-name** (crítico): el `<select>` de ordenar del catálogo tenía label visible pero sin
  asociar → `htmlFor`/`id`.
- **link-in-text-block** (serio): enlaces privacidad/términos en contacto/registro distinguidos
  solo por color → subrayado persistente.
- **color-contrast** (serio, sistémico en las 9): la paleta kawaii pastel no llega a AA 4.5:1 en
  texto pequeño. **Decisión (ADR-044): cumplir AA SIN tocar los 7 colores** — tokens de texto
  derivados AA (`--brand-muted #6b6280`, `--brand-pink-ink #c42b76`, `--brand-coral-ink`), pills/
  enlaces purple sólido→`purple-dark`, botón WhatsApp `emerald-600→700`. 299 usos en ~90 archivos.
  Los colores vibrantes se conservan para fondos/decoración/títulos grandes. **axe 9/9 = 0
  violaciones** (antes: contraste en las 9). Commit grande: 108 archivos.
- **ACCIÓN HUMANA REQUERIDA (Lucy):** revisar visualmente que el look kawaii se conserva (el texto
  secundario quedó algo más oscuro/legible; badges/enlaces rosa pequeños usan rosa más profundo).
  Si algo se ve pesado, se ajusta el token en un solo lugar (`globals.css`). Suite E2E total: **35**
  (smoke+compra+admin+MFA+Estudio+a11y 9+axe 9), verde (33 pass + 2 flakes tolerados).

## Sesión — 2026-07-03 (Bloque E: E2E reto MFA + Estudio + a11y skip-link + runner estable)

**a11y sin dependencia (`6fe4e2c`):** encontrado un gap real — **no había skip-link**
(WCAG 2.4.1 Bypass Blocks) en todo el sitio. Agregado en el layout raíz como primer
elemento enfocable (oculto con `sr-only`, visible con `focus:not-sr-only`, salta a
`#contenido`), con `id="contenido" tabIndex={-1}` en los **19 `<main>`** del storefront/cuenta

- el `<main>` del `AdminShell`. `a11y.spec.ts` (Playwright nativo, sin `@axe-core`) guarda los
  invariantes — `lang="es-CO"`, un solo `main#contenido`, ninguna `<img>` sin `alt`, ≥1 `h1` —
  en 5 páginas públicas + una PDP real, conduce el skip-link de punta a punta (Tab lo enfoca →
  Enter mueve el foco a `main#contenido` + ancla la URL), y verifica que **todos los campos de
  `/login` y `/registro` tienen nombre accesible** (WCAG 4.1.2/3.3.2 — pasan; los forms ya usan
  `<Label htmlFor>` + `<Input id>`). **9/9 a11y verdes. Suite E2E total: 26, 0 flaky (2.9 min).**
  **ACCIÓN HUMANA REQUERIDA (opcional):** para la capa AUTOMATIZADA de reglas WCAG falta aprobar
  la dependencia dev `@axe-core/playwright` (no instalada — mandato de no instalar deps sin OK).

**Reto MFA E2E (`95967e8`):** el flujo completo de control de acceso admin con MFA.
`tests/e2e/_helpers/totp.ts` implementa **TOTP RFC 6238 con Node crypto** (no hay lib de TOTP
en el proyecto) — verificado: Supabase acepta nuestros códigos. `admin-mfa.spec.ts` crea un
admin efímero, le **enrola MFA** vía supabase-js en `beforeAll` e inserta un código de respaldo
conocido (replicando `hashCode` = sha256 del código normalizado, porque `recovery-codes.ts`
tiene `import "server-only"` y no se puede importar en el contexto Node de Playwright). Dos
caminos: login → reto TOTP → dashboard; login → **código de respaldo** → `/admin/seguridad?reconfig=1`
(el respaldo DESACTIVA el MFA, por eso `describe.serial` con TOTP primero).

**Estudio E2E (`ed7e600`):** el diferenciador #1. `estudio.spec.ts` navega al Estudio de un
producto real personalizable (catálogo 100% personalizable → solo navegación, sin mutación) y
verifica que el editor carga (pasa el dynamic-import spinner) y **monta el lienzo Konva
(`<canvas>`)** + su chrome (barra de herramientas + subir foto). No conduce el canvas (drag/drop
Konva es demasiado frágil en Playwright). `test.slow()` + `waitUntil:"domcontentloaded"` absorben
el cold-compile on-demand de `next dev` para la ruta pesada de Konva (>60s local; instantáneo
contra el build prod de CI). Un slug inexistente → 404 (la ruta no es un agujero abierto).

**Runner E2E estabilizado (mismo `95967e8`):** la suite completa flakeaba bajo concurrencia.
Causa raíz **verificada** (no fue lag transitorio): dos add-to-cart en paralelo contra `next dev`

- el pooler hacen que uno **pierda su redirect `?added=1`** (serial pasa 2/2, paralelo flakea).
  Fixes: `compra.spec.ts addToCart` ahora espera el redirect `?added=1` (señal fiable del write)
  en vez del conteo del header (read de una sola vez por el pooler, stale bajo carga sin retry);
  `playwright.config.ts` → **local workers=1** (CI 2 contra build prod), test timeout 60s (headroom
  addToCart + toPass), retries 2. **Suite E2E 17/17, 0 flaky (2.5 min serial).**

**Correr E2E:** `PLAYWRIGHT_BASE_URL=http://localhost:4000 dotenv -e ../../.env.local -- playwright test`
desde `apps/web` (necesita el dev server en :4000 + DATABASE_URL/llaves Supabase; sin ellas los
specs que tocan Supabase se saltan limpio).

## Sesión — 2026-06-29 (Bloque C 7/7 + Bloque E arranque: R3 + 368 unit tests + disco + MFA recovery)

**Infra:** la VM se quedó sin espacio (`/home` 10G al 100% → FATAL de Turbopack). Se liberó
borrando `.next` + prune de pnpm, y luego se **amplió `/home` de 10G a 40G** vía LVM tomando
espacio de `/srv/isos` (todo XFS = no encoge → respaldo + lvremove + lvextend + xfs_growfs +
recrear donante; data verificada idéntica con `diff -r`, reboot-safe). Quedan 17G de buffer
en el grupo LVM.

**Cuenta admin:** validada `r.julliethhr@gmail.com` (SUPERADMIN, MFA activo). Reseteo de
contraseña vía service role (con login real de verificación).

**Códigos de respaldo MFA (feedback de Lucy):** el módulo de Seguridad estaba incompleto.
Se agregó: tabla `AdminRecoveryCode` (hash sha256, RLS), generar/regenerar 10 códigos
(mostrados una vez), usar un código al entrar (`/admin/login/mfa` → consume + desactiva TOTP
vía service role), y **cambiar de autenticador/dispositivo**. Commit `105c786`.

**Bloque C Seguridad — los 6 items que faltaban (ADR-043):** A5 RBAC por rol (`08f9cd4`),
A7/A8/A9 idle-timeout + logout global + cookie flags (`4e2fc3e`), T4/F2 rate-limit
checkout+upload (`d35b899`), C3 CSP por nonce en prod (`036b261`). Bloque C queda **7/7**.
Verificación C3 prod-like: 0 scripts sin nonce en 9 páginas. 56 tests verdes.

**Bloque E Testing — en curso (misma sesión):** R3 matriz RLS (`5d488b3`, 43 tests — el
impostor anon/authenticated no lee/escribe 20 tablas sensibles vía PostgREST; hallazgo: anon
Y authenticated reciben 42501 en TODAS las tablas, PostgREST cerrado). + 368 unit tests para
8 módulos sin cobertura vía workflow de 8 agentes auto-verificados (`628b9e8`): wompi (firma
integridad+webhook), admin-rbac, validadores Colombia, DIVIPOLA, password-strength, cupones,
recovery-codes, wa. **Lote 2 (`7e25f45`, 332 tests)** con pipeline write→revisión adversarial

- refuerzo: checkout/service, cart/service, customers/service, rate-limit (incl. concurrencia
  atómica), turnstile + pwned-passwords (fetch mockeado), storage (MIME magic bytes + upload
  happy path), photo-validation, cart-session, checkout-session. La revisión adversarial halló y
  reforzó 1 weak (storage: happy path no se ejercitaba por mock incompleto). **Suite 56 → 805
  tests, todos verdes.** Fixes derivados: filterNavByRole descarta grupos vacíos;
  validatePhone/stripPhone toleran +57 (`4f601fe`); `retry:2` en vitest para el flake del pooler
  de Supabase bajo concurrencia (`714e814`). Caveats benignos documentados.

**E2E Playwright arrancado (`2a176d2`/`68d984d`):** arreglado el config (default :4000, reusa el
dev server de make) + 1er flujo de compra (`compra.spec.ts`, 2 tests): como el catálogo real es
100% personalizable, el test crea un producto efímero NO personalizable y lo limpia — cubre
PDP→agregar al carrito→/carrito muestra ítem→/checkout/datos carga con ítems. Suite E2E 11/11
(2 compra + 9 smoke; arreglado 1 smoke stale de privacidad). De paso, limpiados 9 productos
basura que la desconexión dejó en el catálogo. Observación a revisar: el `<Link>` "Ir a pagar"
(nav RSC client-side) rebotó a /carrito justo tras agregar (el goto directo funciona) — posible
sutileza de prefetch/cookie. Correr E2E: `PLAYWRIGHT_BASE_URL=http://localhost:4000 dotenv -e
.env.local -- playwright test`.

**E2E ampliado + bug "Ir a pagar" resuelto (`8a27a84`/`551d5f9`):** investigado el rebote — con
logs server-side se confirmó que loadCheckoutContext recibe el sessionId correcto pero
getCartDetail ve el carrito intermitentemente vacío (**read-after-write del pooler de Supabase**)
y en prod el prefetch del `<Link>` cachea ese redirect → fix `prefetch={false}` en "Ir a pagar".
Sumado: **login admin E2E** (admin efímero sin MFA → dashboard; credenciales inválidas → login).
Robustez: los asserts post-mutación usan `expect().toPass()` + retry:1 local en Playwright (mismo
motivo que retry:2 en vitest). **Suite E2E 13/13** (9 smoke + 2 compra + 2 admin login).
Investigación carrito (corrige nota previa): las mutaciones del carrito (cantidad/quitar) SÍ
funcionan — verificado a nivel DB (CartItem 1→0 al quitar). La flakiness del E2E es la
**staleness del read del pooler de Supabase en el SSR** (el dev server lee stale mientras la DB
ya está actualizada), no un form roto. **Hallazgos de calidad pendientes (pre-existentes, para
investigación dedicada):** (1) mismatch de hidratación "won't be patched up" en páginas con el
footer; (2) el footer (NewsletterForm con Turnstile) carga Cloudflare Turnstile en TODAS las
páginas → 403s del challenge-platform + preload sin usar. Vale la pena lazy-load del Turnstile.

**Lote 3 de tests + 3 bugs de código arreglados (`1595995`/`4def824`):** 416 tests (catálogo:
products/categories/ocasiones + lib/catalog, cms/service, redirects, consent Ley 1581, resend
mockeado, admin-roles) con pipeline write→revisión adversarial (8 sólidos + 1 weak corregido).
La revisión destapó y se arreglaron 3 bugs REALES: (1) `adminRoleLabel('__proto__'/'toString')`
devolvía la propiedad heredada en vez de string → `Object.hasOwn`; (2) `products.listProducts`
el "desde $X" incluía variantes INACTIVAS → filtro `isActive:true`; (3) `categories.updateCategory`
crasheaba con P2002 al renombrar al slug de una archivada → `findUnique` + error amigable.
**Suite total ~1.221 tests vitest**, todos verdes. Bloque E acumula 4 bugs reales cazados por
los tests (+ el +57 y "Ir a pagar" de tramos previos).

**Lote 4 revenue-critical (`78dd926`, ~206 tests):** el corazón de la ruta de ingresos —
orders/saga (POST-PAID: PAID→stock→guía→email, idempotencia), orders/service (createOrderFromCart,
total, número único, snapshot), payments/provider (factory + adapter Wompi), emails/templates (las
7 plantillas), lib/auth (sesión mockeada) — pipeline write→revisión adversarial (4 sólidos +
provider weak→solid). **6º bug de código:** getPaymentProvider hacía require('./wompi') antes del
check → reordenado. Fixes de calidad de la revisión: afterAll resiliente (no deja huérfanos),
makeVariant con SKU único por llamada (retry-safe, evitó un P2002 real en la corrida completa),
reconciliation direccional. **Suite total ~1.446 tests vitest.** Bloque E ya cubre catálogo,
cupones, checkout/cart/customers, cms/redirects/consent, pagos+webhook, RLS, storage, MFA/RBAC,
la saga de órdenes y los emails al cliente.

**CI-DB LISTO (`16c3835`) — el mayor salto de calidad:** el CI corría los tests con un
DATABASE_URL placeholder → los ~1.400 de integración NO protegían nada (solo local). Ahora el
job levanta un **service container postgres:15** y arma el schema desde cero: `.github/ci/
supabase-compat.sql` (stub de lo que Supabase provee y las migraciones necesitan en un PG pelado
— extensiones pg_trgm/unaccent/pgcrypto/uuid-ossp, roles anon/authenticated/service_role, auth

- auth.uid(), stubs storage) → `prisma migrate deploy` → las 7 SQL de supabase/migrations → vitest.
  Conexión DIRECTA (sin pooler) → **rápido y sin flakiness**. NEXT_PUBLIC_SUPABASE_URL vacío → R3
  (rls-matrix, que exige PostgREST/GoTrue real) salta limpio; R3 refactorizado a clientes lazy para
  saltar sin romper la colección. **VALIDADO localmente** montando un Postgres real (mismo flujo +
  env del CI): **1403 pasan, 43 saltan, 0 fallan en ~21s** (vs ~15 min con el pooler). Cada PR ahora
  enforza la suite. (Bonus: el Postgres local en :5433 sirve para correr los tests localmente en
  segundos en vez de minutos.)

**Capa de UI cubierta (`bc2a2cf`/`75e9831`) — antes 0%:** 83 tests de componentes con
@testing-library + jsdom + queries ACCESIBLES (getByRole/getByLabelText). ProductCard (plantilla, 8) + batch de 6 con pipeline write→revisión adversarial (5 sólidos + global-search): cookies-banner
(consent Ley 1581), products-filters (URL/router, atrapa un bug de closure ya documentado),
password-input, email-input, ocasion-filter-strip, global-search. Gotchas documentados:
afterEach(cleanup) manual (globals:false), alt="" decorativo, nbsp de Intl en formatCOP, mocks de
next/link·image·navigation. **Suite total ~1.529 vitest.** Follow-ups no bloqueantes: slider de
precio + re-sync back/forward, casos de cierre de modal, medidor de fuerza con anchor semántico;
**a11y con axe/vitest-axe queda pendiente de aprobar la dep** (TESTING.md la pide, WCAG 2.1 AA).

**Próximo:** seguir Bloque E con más unit tests verificables, o el setup E2E (Playwright), o el
**CI-DB** (Supabase local en CI — OJO: necesita Docker, no se valida en esta VM, se prueba al
hacer push). Pendiente además: Lucy valida C3 en deploy preview de Vercel (consola buscando
errores CSP); ACCIÓN HUMANA dominio Resend (DNS) + Turnstile keys en prod + branch protection.

---

## Sesión — 2026-06-27 (Barrido UX/UI integral — 2da tanda de feedback de Lucy)

**Origen:** Lucy dio una 2da tanda de comentarios (productos, opciones, generales) + el
mandato "recorre TODO el ecosistema UX/UI, no des por hecho, ajusta y certifica". Auditoría
multi-agente de 6 frentes → `docs/audits/2026-06-27-ux-sweep/`. Decisiones: D1 precio tachado
por opción = SÍ (migrar); atributos forma/acabado/proporción = quitar del form; nombre opción
= libre + sugerencia; módulos técnicos = dejar pero simplificar.

**Hechos por commit (7):**

- `a1b87bc` **Globales:** cursor "manito" (1 regla global en globals.css `@layer base`) ·
  voseo→tuteo (~38 strings, "Diseñá"→"Diseña" etc.) · sin jerga dev en UI ("make seed-…",
  "/api/coupons/public").
- `48bfcb5` **Productos:** ordenar por Código (sku) y Categoría además de Producto/Precio
  (service + whitelist + SortableHeader) · paginación « Primera/Última » + "ir a página N"
  (form GET con filtros hidden) + clamp de page fuera de rango.
- `7b10158` **Opciones:** form de edición FUERA de la tabla (era `<tr colSpan>` bajo el
  thead — el "error de UI" que vio Lucy) · atributos a lenguaje llano (4 campos; forma/
  acabado/proporción ocultos preservados) · nombre con sugerencia en vivo · precio con "$"+COP.
- `e2ba896` **Precio tachado por opción (D1):** `ProductVariant.compareAtPrice`
  (migración 20260627150000, manual + backfill que evita descuento negativo) · form de opción
  con el campo · PDP usa el tachado de la opción elegida (reactivo) · cards leen
  `product.compareAtPrice` denormalizado = promo de la opción más barata (syncProductBasePrice).
- `b4c8063` **Loading (G2):** `<Button loading>` + primitive `<PendingSubmitButton>` ·
  propagado a "Añadir al carrito" (anti doble-clic), ProductQuickActions, toggle+flechas de
  categorías. El `<SubmitButton>` queda de patrón para el resto.
- `6244436` **Módulos:** cupones Tipo en español · finanzas sin jerga de fases · roles con
  diccionario único (`lib/admin-roles`) — antes el sidebar usaba valores de enum inexistentes.

**Pendiente (backlog de pulido, no bloqueante):** propagar el spinner a los ~50 botones
restantes (reseñas/usuarios/redirects/ocasiones server-component forms); D4 "simplificar lo
técnico" en Auditoría/Redirects/Integraciones; pulidos menores (dashboard KPI "Pedidos del
mes", inventario "↳ misma familia", ocasiones "2/5/10"). Todo con typecheck+build+smoke verde.

**Prueba GUI pendiente (Lucy):** ordenar productos por Código/Categoría + "ir a página";
editar opción (form solo, precio $, sugerencia de nombre, precio tachado); tienda con promo
por opción; cursor manito + spinners; cupones/finanzas/roles en español.

---

## Última sesión previa — 2026-06-27 (Pulido UX admin "amigable" — feedback de Lucy)

**Origen:** Lucy dio un batch de ~18 comentarios sobre el panel admin con la premisa "el
admin es importante PERO debe ser simple y amigable para mí (no soy técnica)", y pidió
aterrizarlos "a la realidad del desarrollo, tanto admin como front cliente".

**Auditoría:** workflow multi-agente (6 clusters verificados contra el código real)
→ `docs/audits/2026-06-27-admin-ux-feedback/` (00-PLAN.md + 6 clusters). Veredicto:
3 bugs reales, ~11 mejoras, 5 decisiones. Decisiones de Lucy: fotos por opción = SÍ todo
el catálogo; reordenar categorías = flechas ↑/↓; sub-categorías = SÍ; precio base = auto.

**Hechos por commit:**

- `b9aa66a` **3 bugs:** precio de opción guardaba CENTAVOS crudos (escribir "5000" → $50);
  ahora en pesos como el producto (display /100, guardar ×100). Orden de categorías sin
  desempate → menú del cliente indeterminado; ahora `[{order},{name}]` en `lib/catalog.ts`.
  Sidebar no sticky → `lg:sticky lg:top-0 lg:h-screen`.
- `d06047e` **Sprint "Admin amigable":** "Descripción corta"→"Descripción"; bot/SEO/desc
  larga colapsados (`CollapsibleDetails`, nota "Google ya funciona solo"); stock fuera del
  form full de opción (updateVariant no lo pisa); resumen de stock → desglose por opción;
  cupones con form colapsable + Cancelar; widget cupones honesto + badge "🏪 General";
  foto de portada explícita + botón "Hacer portada".
- `892343b` **Categorías D2+D3:** sub-categorías (parentId, selector "categoría madre",
  validación 1 nivel, listado en árbol indentado, badge "N sub") + reordenar con flechas
  ↑/↓ (`moveCategory` re-secuencia el grupo, robusto ante orders duplicados); fuera el
  campo manual "número de orden" (auto-asignado).
- `dd638fd` **D4 precio base auto:** `syncProductBasePrice` (= precio mínimo de las
  opciones activas) corre tras crear/editar/borrar opción; campo escondido en Avanzado.
- `0a105ba` **D6 ordenar por clic:** primitive `<SortableHeader>` (RSC, sin JS cliente) +
  migrados productos/inventario/cupones/categorías; dropdown "Ordenar por" solo en mobile.
- `8b46680` **D1 fotos por opción:** `ProductVariant.images String[]` (migración manual
  20260627090000 aplicada con `db execute` + `migrate resolve` — el shadow DB de migrate dev
  falla por pg_trgm, y db push quería dropear `rate_limit_buckets` por drift). Uploader por
  opción en admin (`variant-images.tsx` + `image-actions.ts`, herencia explicada). PDP:
  galería = fotos de la opción si tiene, si no las del producto; `key={variantId}` reinicia
  al cambiar. **OJO drift preexistente:** `rate_limit_buckets` está en la DB pero NO en el
  schema Prisma — NO usar `prisma db push` (lo dropearía); usar migraciones manuales.

**Prueba GUI pendiente (Lucy, navegador):** precio opción en pesos, desglose stock, Detalles
limpio, "Hacer portada", crear sub-categoría + flechas, ordenar por clic en encabezados,
sidebar fijo, Cancelar en cupones.

---

## Última sesión — 2026-05-11 (Fase 2 — Catálogo admin + storefront público + carrito anon)

**Origen:** Fase 1.b admin testeada 4/4, Lucy autorizó continuar a Fase 2. Esta sesión cubre todo el bloque catálogo + carrito hasta dejar el flow guest "ver → agregar → ver carrito → ajustar qty" funcionando end-to-end, listo para el siguiente paso (checkout Wompi en Fase 3).

**Hechos por commit:**

**1) Admin CRUD productos (commit `d9fab6b`):**

- `features/products/{schemas,service}.ts` separados (patrón CONVENTIONS). Schema Zod estricto: slug kebab-case, SKU `[A-Z0-9-]+`, basePrice/compareAtPrice/cost como `z.number().int().nonnegative()` (centavos COP, mandato CLAUDE.md). `ProductValidationError` clase con field tipado.
- `app/admin/productos/page.tsx`: listado paginado 20/page con búsqueda fuzzy en name/sku/slug. Sin paginación de cursor todavía (offset basta < 1k productos).
- `app/admin/productos/nuevo/page.tsx` + `[id]/page.tsx`: forms create/edit con shared `product-form.tsx`. PriceField muestra pesos al usuario, persiste centavos via hidden input + Math.round. Auto-slug desde name (slugify con NFD). Checkbox helpers, sección SEO opcional, botón "Archivar" en edit (soft-delete vía `deletedAt`).
- `actions.ts`: create/update/delete con `getCurrentAdmin()` defensivo + revalidatePath + redirect con flag (`?created=1`, `?deleted=1`).

**2) Admin CRUD categorías (commit `8714985`):**

- `features/categories/{schemas,service}.ts`. `softDeleteCategory` bloqueado si hay productos asociados (anti-orphan: el producto requiere categoryId NOT NULL).
- `app/admin/categorias/page.tsx`: tabla simple (categorías < 20) + form inline `create-category-form.tsx`. Edit-inline diferido (no es bloqueante todavía).
- Dashboard admin gana cards "Categorías" + "Productos" como "Disponible" (antes "Próximamente").

**3) Seed catálogo demo (commit `d31f037`):**

- `packages/db/scripts/seed-products.mjs`: 4 categorías (`fotoimanes`, `recorditos-eventos`, `organizate-bonito`, `calendarios`) + 8 productos (3 featured con compareAtPrice para mostrar descuentos). Idempotente: `upsert by slug`. Precios en centavos COP. SKUs estructurados (`FI-POL-G-6`, `EVT-BS-KIT`, etc).
- Makefile: `make seed-products` (en /home/ansible/workspaces/lucams-shop-local/Makefile).

**4) Storefront público (commit `c77e641`):**

- `features/products/public-service.ts` separado de admin: enforza `deletedAt:null + isActive:true` en product Y category. Tres funciones: `listStorefrontCategories`, `listStorefrontProducts({categorySlug?, featured?, limit?})`, `getStorefrontProductBySlug`. Anti-leak: nada de archivados aparece al público.
- `app/productos/page.tsx`: grid 2/3/4 cols responsive, category chips con counts, empty state kawaii con CTA.
- `app/producto/[slug]/page.tsx`: galería placeholder (gradient kawaii cuando no hay imágenes), breadcrumb, badge "Personalizable" + descuento -X%, WhatsApp deep-link con mensaje pre-armado contextual (`Hola Lucams 👋 Quiero saber más sobre "<name>" (SKU X)`), generateMetadata dinámico con seoTitle/seoDescription fallback.
- `components/product-card.tsx`: reutilizable. Hover scale, badges absolute corners.
- `lib/format.ts`: `formatCOP(centavos)` shared (`Intl.NumberFormat('es-CO', {currency:'COP'})`). Removido duplicate inline de admin.
- Home gana CTA "Ver catálogo →". Header gana link "Tienda".

**5) Carrito anon end-to-end (commit `7bfc879`):**

- **Schema-side:** `features/products/service.ts createProduct` ahora crea variant "Default" (`sku-DEFAULT`) en la misma transacción Prisma. CartItem y OrderItem requieren variantId; sin variantes admin reales todavía, el default es el path mínimo para comprar. `seed-products.mjs` backfilea variants default por producto existente (idempotente).
- **`lib/cart-session.ts`:** cookie `cart_session` con UUID v4 server-generated. HttpOnly, SameSite=Lax, Secure(prod), 30 días. **No HMAC-firmada:** 122 bits de entropía es suficiente para data efímera sin PII; documentado el trade-off en el archivo.
- **`features/cart/service.ts`:** `getCartDetail` / `getCartItemCount` / `addProductToCart` / `updateCartItemQty` / `removeCartItem` / `mergeAnonCartIntoCustomer`. Pricing snapshot al agregar (`variant.price ?? product.basePrice`). Items con producto archivado se filtran en read (el admin que archive un producto efectivamente lo saca de carritos en vuelo). MAX_QTY_PER_ITEM=99.
- **Merge inteligente al login/signup:**
  - Anon vacío + customer sin cart → noop.
  - Anon con items + customer sin cart → re-asignar anon a customer (mismo sessionId).
  - Ambos existen → fold del anon en customer cart sumando qty por variantId; **hard-delete del anon** post-merge (Cart no tiene valor de auditoría y `sessionId @unique` no respeta `deletedAt`).
  - Cookie se rota al sessionId del customer cart si era distinto.
  - Errores de merge se loggean (`cart.merge_fail`) pero NO bloquean auth.
- **`/carrito` page:** lista con qty controls (+/−), remove forms, sidebar con subtotal/total/items count, CTA checkout disabled "(próximamente)". Empty state.
- **`/producto/[slug]`:** botón "Añadir al carrito" wired al server action. Banner ✨ "Agregado" cuando vuelve con `?added=1` + link "Ver carrito →".
- **Header:** ShoppingBag icon con badge pink mostrando cartCount (cap 99+).

**Validaciones técnicas:**

- `make typecheck` OK
- `make lint` OK
- Smoke tests curl: `/productos`, `/producto/<slug>`, `/producto/no-existe` (404), `/productos?categoria=fotoimanes` (filter), `/carrito` — todos 200 con contenido esperado.

**Pendiente prueba visual por Lucy (anon + login flow + merge):**

- Anon: agregar al carrito → counter sube → ver carrito → cambiar qty → remover.
- Login con cart anon poblado → merge funcionando.
- Logout → cookie persiste, cart sigue visible (comportamiento e-commerce estándar).

**Decisiones tomadas en sesión (cocreación):**

- **Cart storage:** Postgres + sessionId cookie (vs cookie pura o Redis). Justificación: enables abandoned cart recovery emails posterior, server-authoritative, sin dependencias externas. Aliné con mandato #11 CLAUDE.md.
- **Merge policy:** suma inteligente por variantId (vs reemplaza / descarta). Mejor UX: "no perdiste nada".
- **Cookie sin firmar:** discutible; mitigado por (a) UUID alta entropía + (b) cart sin PII ni precio autoritativo. TODO: revisar si más adelante guardamos customDesign con datos personales.
- **Default variant pattern:** sin schema migration. Cada producto tiene su "Default" 1:1 hasta que existan variantes admin reales. Cuando lleguen, se reemplazan o expanden.

**Pendiente próximo turno (Fase 2 cierre + Fase 3):**

- Imágenes de productos: upload via Supabase Storage en admin form + render real en cards/detail/cart. Hasta entonces gradient kawaii como placeholder.
- Admin de variantes reales (multi-variant products).
- Estudio de personalización en vivo (react-konva) — diferenciador #1.
- Phase 3: checkout Wompi (PaymentProvider adapter + saga de pago + Venndelo logística + DIAN factura).

---

## Sesión anterior — 2026-05-11 (Fase 1.b — Admin flow + roles unificados)

**Origen:** Cerrada Fase 1.a customer, Lucy autorizó la combinación A+B (admin mínimo primero, después catálogo). Este turno implementa el admin completo.

**Hechos (commits `1b9b2c9` + `eae7740`):**

1. **`lib/auth.ts` extiende con `getCurrentAdmin()`** análogo a `getCurrentCustomer()`. Retorna AdminUser si está activo (`isActive=true, deletedAt=null`).

2. **Layout admin sobrio** (`app/admin/layout.tsx`) — slate-50 bg, `robots: noindex`, sin kawaii. Diferenciado del flow customer.

3. **`/admin/login` con server action propia** (`app/admin/login/{page,login-form,actions}.tsx`):
   - Validación Zod + rate-limit doble IP+email (estricto: 5/15min prod, vs 15/15min cliente).
   - Verifica `signInWithPassword` + AdminUser activo.
   - **Anti-enumeration:** si email+password OK pero NO admin → `signOut()` + mismo error "Credenciales incorrectas" que credenciales mal.

4. **`/admin/dashboard` con métricas** (`app/admin/dashboard/page.tsx`):
   - 4 cards (Customers / Orders / Products / Pending reviews) via `Promise.all` de `prisma.count`.
   - 3 cards "Próximamente · Fase 2/4" como placeholders de futuros CRUDs.
   - Header con email + role + botón "Ir al sitio" + logout.

5. **Gate en `proxy.ts`** (Edge-safe): `/admin/*` excepto `/admin/login` requiere sesión Supabase. La verificación AdminUser activa la hacen las pages con `getCurrentAdmin()` (Prisma no corre en Edge).

6. **`SiteHeader` muestra chip "Panel admin"** cuando el current user es admin. Solo desktop (`sm:inline-flex`).

7. **`packages/db/scripts/seed-admin.mjs`** — script idempotente. `EMAIL=x@y.com make seed-admin` promueve a SUPERADMIN un auth.user existente. Reactivación + actualización si ya existe.

8. **`packages/db/scripts/seed-test-customer.mjs`** — para testing de "user no-admin". Usa `supabase.auth.admin.createUser` con `email_confirm=true` → bypasea sandbox de Resend. Default: `test+cliente@example.com / TestCliente2026!`.

9. **Documentación de Fase 1.b en ROADMAP:** ⏸️ → 🟡 EN CURSO → ✅ (auth completo).

**Verificación end-to-end por Lucy (4/4 pruebas pasaron):**

- ✅ Prueba A: Login cliente + chip "Panel admin" en header + acceso a `/admin/dashboard` sin re-login (cookie persiste, una sola sesión multi-rol)
- ✅ Prueba B: Logout → `/admin/dashboard` redirect a `/admin/login` → login → dashboard
- ✅ Prueba C: `/admin/login` con `test+cliente@example.com` → "Credenciales incorrectas" (anti-enumeration validado)
- ✅ Prueba D: Login normal con test customer → home cliente OK + NO chip admin + intento `/admin/dashboard` → redirige a `/admin/login`

**Modelo de roles validado:**

- 1 `auth.users` row + 1 cookie sesión = 1 identidad de auth
- N tablas de rol (Customer, AdminUser) apuntan al mismo `supabaseUserId`
- Cada page pregunta por la fila de rol que necesita
- `/login` y `/admin/login` usan la MISMA sesión pero rutean según rol verificado

**Pendiente próximo turno (Fase 2):**

- Admin CRUD productos (sin esto, storefront no tiene qué mostrar)
- Storefront público `/productos` + `/producto/[slug]`
- Carrito anon vía sessionId cookie (ADR-031 guest-first)
- Categorías CRUD
- Upload imágenes Supabase Storage

---

## Última sesión — 2026-05-11 (Hardening + UX polish + cierre Fase 1 customer auth)

**Origen:** Lucy validó visualmente el flujo y empezamos a probarlo end-to-end. Durante el testing surgieron varios issues + ideas de mejora. Se cocrearon como un solo arco temático: **completar y endurecer el flow de auth customer hasta dejarlo listo para tráfico real**.

**Hechos por dominio:**

**1) Templates de email + flujo OTP:**

- Migración de Reset password de link a OTP (commit `9ef96cd`) — mismo patrón que signup, evita bug de Gmail prefetch que consume tokens.
- Reescritura de `/restablecer-password`: ahora recibe email + OTP + nueva password en una sola action (`verifyOtp` + `updateUser` + `signOut global` atómicos).
- 3 templates HTML kawaii pegados en Supabase Dashboard: Confirm signup, Reset password, Password changed. Layout tabla anidada con inline CSS (estándar email cross-client), logo desde URL absoluta Vercel, paleta brand-purple/pink/cream.
- Tracking de estado de los 13 templates Supabase Auth en nuevo `docs/EMAIL_TEMPLATES.md` (✅ personalizados / ⚠️ default / descarte por flow no implementado).

**2) Seguridad — 4 mejoras propuestas y aceptadas por Lucy (commit `88791a2`):**

- **Pwned Passwords check** (`lib/pwned-passwords.ts`): SHA-1 prefijo de 5 chars → HaveIBeenPwned API gratis con k-anonymity. Bloquea registro/reset si la contraseña aparece en breaches conocidos. Fail-open si HIBP cae. Smoke-test: `password123` detectada con 2.25M de breaches.
- **signOut global al cambiar password** (`scope: 'global'`): invalida todas las refresh tokens del user en otros devices. Si alguien robó la contraseña, cambiarla lo echa de TODO.
- **Rate-limit doble IP + email** (`lib/rate-limit-keys.ts`): email se hashea con SHA-256 truncado (no aparece en claro en buckets). Cubre botnet (muchas IPs ↔ 1 email) Y atacante con muchos emails desde 1 IP. Cabled en signup/login/reset-password/verify-recovery.
- **Eventos `security.*` estructurados** en logger pino (login.success/fail, pwned.signup_block/reset_block/api_fail, password.reset_success con flag globalSignOut).
- Lucy preguntó por **anti-reutilización de últimas N contraseñas**. Análisis honesto: alto costo operacional (PasswordHistory paralela + bcrypt.compare) vs beneficio marginal vs Pwned Passwords. Decidido NO implementar y se documentó la decisión en `docs/SECURITY.md`.

**3) UX hardening:**

- **Confirm password en `/restablecer-password`** (paridad con signup, Zod `.refine()` + validación inline cliente).
- **`<EmailInput>` component** (`apps/web/components/email-input.tsx`): dropdown de 8 dominios populares cuando user tipea `lucy@gma...`, validación HTML5 pattern más estricta que el default `type="email"` (requiere TLD 2-24 chars), animación fade-in slide-from-top. Cabled en /registro, /login, /recuperar-password. Lucy verificó visualmente en web + móvil.
- **EmailInput justificación:** mejora UX sin reemplazar Zod server-side. Server valida independientemente.

**4) Brand assets reales:**

- Lucy subió `apps/web/public/brand/lucams-logo.png` (468×468 RGBA, 256KB en repo → ~5KB WebP servido al browser via Next.js Image optimizer).
- BrandMark unificado: usa el mismo `lucams-logo.png` en TODOS los headers + hero. Tamaños 56px (storefront/mi-cuenta), 72px (auth pages), 180px (hero home).
- Decisión cocreada con Lucy: descartado el mascot-only crop después de probarlo — un solo asset es más simple de mantener.
- `<RaccoonFace />` SVG kawaii custom queda como **fallback defensivo** del `<LucamsLogo />` (se renderea solo si el archivo PNG no carga).

**5) Bugs y fixes encontrados durante testing:**

- **Trigger SQL sync auth.users → Customer descartado** (commit `c62174b`): la Supabase Auth API HTTP falla con 500 cuando hay cualquier trigger custom en auth.users que toque schema public. Documentado todo en `supabase/migrations/00000000000004_sync_auth_users_delete.sql` (comentario largo con TODAS las cosas que probamos sin éxito) — historia para que nadie pierda tiempo intentando lo mismo. Reemplazo: `FORCE=1 make seed-clean` script (`packages/db/scripts/seed-clean.mjs`) hace cleanup explícito Customer + AdminUser + auth.users.
- **CSP `upgrade-insecure-requests` en dev** rompía estilos en http://192.168.20.180:3000 (LAN IP no tiene HTTPS). Fix: gate en `IS_PROD_DEPLOY` (commit `b264c79`). Estilos solo se rompen en `http` cuando es dev/preview, en producción Vercel sigue con HSTS.
- **Chrome/Linux sin Noto Color Emoji** renderea emojis como "ND GLYPH". Fix: reemplazar todos los emojis renderizados al cliente por SVG inline o lucide-react icons (commits `13fde9d`, `ddf58f9`). Emojis solo en comentarios de código.
- **Next.js 16 bloquea HMR desde IP LAN** por safety. Fix: `allowedDevOrigins: ['192.168.20.180','localhost','127.0.0.1']` en `next.config.ts` (commit `93f5ee8`).
- **OTP 8 dígitos vs form maxLength=6**: form muy estricto bloqueaba escribir el código completo. Fix: maxLength=10 + pattern `\d{6,10}` + Zod regex idem (commit `1157ff0`).
- **Rate-limit email demasiado estricto durante pre-launch** (3/h colaba a Lucy testeando). Fix: bajar email bucket a igualar el de IP (commit `88ae83e`). Anotado TODO para apretar al lanzar real.

**6) Verificación end-to-end por Lucy:**

- ✅ Signup con Pwned check, OTP de email, confirmación de cuenta, redirect a home con header logged-in.
- ✅ Login con email autocomplete dropdown, caps lock alert, password toggle.
- ✅ Logout, vuelta a anónimo.
- ✅ Recuperar password → email con OTP kawaii → restablecer-password con OTP + nueva password + confirm.
- ✅ Reentrar con nueva password tras signOut global.
- ✅ Visual en Chrome + Firefox + móvil 375px — todos OK.

**Pendientes administrativos cerrados en este turno:**

- STATE.md actualizado.
- ROADMAP.md: marcar Fase 1.a customer-side como completa.
- Optimización PNG: descartada — Next.js Image optimizer ya entrega 5KB WebP en lugar del PNG raw de 256KB (verificado con curl).

**Próximo bloque (acordado con Lucy via AskUserQuestion):**

- **Fase 1.b admin flow mínimo** (`/admin/login` + `/admin/dashboard` + gate `proxy.ts` para `/admin/*` + seed primer AdminUser via SQL).
- Después: **Fase 2 catálogo público + carrito anon** (guest-first per ADR-031: listing de productos, página de producto, carrito vía sessionId cookie, integración con stock realtime).

---

## Última sesión — 2026-05-10 (flujo cliente AUTH COMPLETO — callback, reset, logout, mi-cuenta, header)

**Origen:** Lucy aprobó visualmente el batch anterior y preguntó "¿este login es para admins o cómo va a funcionar?". Eso disparó decisión arquitectónica formalizada en **ADR-030: URLs separadas para cliente (`/login`) vs admin (`/admin/login`)**. Confirmó vía AskUserQuestion: (a) completar primero flujo cliente, (b) URLs separadas. Procedí en autónomo a cerrar el flujo cliente completo.

**Hechos (commit `5bdd81d`):**

1. **`lib/auth.ts`** — helpers server-side:
   - `getCurrentUser()`: `supabase.auth.getUser()` (no `getSession()` para authz — Supabase docs explicit).
   - `getCurrentCustomer()`: join con tabla `Customer` vía Prisma `findFirst` (no `findUnique` porque combina `supabaseUserId` + `deletedAt: null`). Devuelve null si no hay sesión o no hay Customer row o soft-deleted.

2. **`/auth/callback`** route handler — URL a la que apuntan los emails de Supabase (signup confirmation, password recovery). Lee `?code`, llama `exchangeCodeForSession` (escribe cookies vía el adapter), redirige según `?type`: `recovery` → `/restablecer-password`, otro → `/`. Errors → `/login?error=link-invalido|link-expirado`.

3. **`/restablecer-password`** — página protegida (redirect si no hay sesión temporal del recovery flow). Form con un único password field (min 8). Action: `supabase.auth.updateUser({password})` + `signOut()` para forzar re-login limpio. Redirect `/login?reset=ok` con banner success.

4. **`/auth/logout`** — server action que llama `signOut()` y redirige a `/`. Usable desde cualquier `<form action={logoutAction}>`. Logs `auth.logout.success`.

5. **`/mi-cuenta`** — página protegida (redirect a `/login?next=/mi-cuenta` si no hay sesión Customer). Muestra perfil: nombre, email, teléfono, puntos Lucams, código de referido. Lista secciones pendientes (órdenes, direcciones, etc.). Botón "Cerrar sesión" en header propio.

6. **`SiteHeader` (`components/site-header.tsx`)** — Server Component async. Logged-out: links a `/login` + button primary a `/registro`. Logged-in: "Hola, {firstName}" + botón logout. Integrado en `/` (home).

7. **`/login` page** — reescrita como async para leer `searchParams` (Next 16 async). Mapea `?error=link-invalido|link-expirado` y `?reset=ok` a banners (rojo / verde) que se muestran arriba del form. `LoginForm` acepta `initialError`/`initialSuccess` props.

**Verificaciones:**

- typecheck + build ✓ — 10 rutas (`/`, `/_not-found`, `/api/health`, `/api/health/db`, `/auth/callback`, `/login`, `/mi-cuenta`, `/recuperar-password`, `/registro`, `/restablecer-password`) + Proxy middleware.
- Local: rutas públicas 200, protected → 307 con redirect correcto.
- Producción Vercel: mismas verificaciones, todo OK.

**ADR-030 — Separación URLs cliente vs admin (`docs/DECISIONS.md`):**

- Decisión: URLs separadas (no login único con role-check).
- Razones: superficie de ataque, UX clara, branding distinto, authorization granular, no risk de admin self-registration.
- Trade-off: pequeña duplicación de código aceptable; se puede extraer `<AuthCard>` compartido si crece.

**ACCIONES HUMANAS pendientes para que Auth funcione real:**

1. **Supabase Dashboard → Authentication → URL Configuration:**
   - Site URL: `https://lucams-shop.vercel.app`
   - Additional Redirect URLs: `https://lucams-shop.vercel.app/**`, `http://localhost:3000/**`
2. **Prueba GUI end-to-end** del flujo completo (signup real + email confirm + login + mi-cuenta + logout + forgot + reset).
3. (Opcional) Customizar Email Templates en Supabase Dashboard, o migrar a Resend SMTP en próxima fase.

**Próximos bloques Fase 1:**

- **Admin flow** — `/admin/login` (sin registro público) + `/admin/dashboard` + gate `proxy.ts` para `/admin/*` + seed primer AdminUser via Supabase + Prisma manual. **Sin GUI shadcn kawaii — usar layout más sobrio/utilitario para admin** per ADR-030.
- Email template customization Resend SMTP.
- Customer profile editing (cambiar nombre, teléfono, contraseña).
- Right to deletion Ley 1581 art. 8 (soft delete Customer + `supabaseService.auth.admin.deleteUser`).
- Audit middleware Prisma `$extends` para auto-fill `createdBy`/`updatedBy`.

---

## Última sesión — 2026-05-10 (Auth flow básico — primera UI visible Lucams)

**Origen:** Lucy pidió continuar con el enfoque de magneticas.cl como referencia funcional. Implementé Auth flow básico (login/registro/recuperar-password) con identidad Lucams REAL (no shadcn genérico).

**Hechos:**

1. **Estudio competitivo:** WebFetch a magneticas.cl. Patrones detectados (`/account/login`, `/account/register`): email + contraseña sin social login ni "remember me", links a forgot-password + register, tono cálido emocional, layout centered card, identidad minimalista blanca.

2. **shadcn components instalados** vía `pnpm dlx shadcn add`: button, card, input, label (style `radix-nova`).

3. **`app/(auth)/layout.tsx`** (commit `ca1d73e`) — layout dedicado para auth. Gradiente `brand-cream → white → brand-purple/10`, wordmark "Lucams + shop" en Fredoka con colores brand, footer con link a WhatsApp `+57 320 887 3826`. **Opuesto al minimalismo blanco de magneticas** — fondo cálido kawaii.

4. **`/login`** — Card con título "Bienvenida de vuelta" en Fredoka brand-purple-dark + Input email/password + button primary brand-purple + links a /recuperar-password (text-brand-pink) y /registro. Server action `loginAction` valida con Zod, rate-limit `login:<ip>` 5/15min, llama `supabase.auth.signInWithPassword`. Error genérico al cliente (no enumera cuentas) + log estructurado con código.

5. **`/registro`** — Card con título "Crea tu cuenta Lucams" + grid 2-cols nombre/apellido + email + password (min 8) + texto de consentimiento Ley 1581. Server action `signupAction` con saga: (a) Zod, (b) rate-limit `signup:<ip>` 3/hora, (c) `supabase.auth.signUp`, (d) `prisma.customer.create` con `supabaseUserId` + `referralCode` (`LCS-<8hex>`) + audit `createdBy=userId`. Compensación en falla (4): `supabaseService.auth.admin.deleteUser` para no dejar huérfanos. Muestra "Te enviamos un correo para confirmar" inline si Supabase devuelve `session: null`; si confirmación está apagada, redirect a `/`.

6. **`/recuperar-password`** — Card con email field. Server action `recuperarPasswordAction` con rate-limit `reset-password:<ip>` 3/hora. **SIEMPRE devuelve success genérico** independiente de si el email existe (mitigación de account enumeration). Llama `supabase.auth.resetPasswordForEmail`.

7. **Patrón React 19 `useActionState`** en los 3 form components para mostrar errores inline + estado pending sin redirect roundtrip. `aria-invalid` + `aria-describedby` para a11y básica.

8. **Eventos de logger estructurados:**
   - `auth.login.{success,fail,rate_limited}`
   - `auth.signup.{success,auth_fail,customer_create_fail,rollback_fail,rate_limited}`
   - `auth.reset.{sent,fail,rate_limited}`

**Verificaciones:**

- typecheck + build ✓ (7 rutas: home, login, registro, recuperar-password, /api/health, /api/health/db, \_not-found + Proxy).
- Local: HTTP 200 en `/login`, `/registro`, `/recuperar-password`. HTML inspection confirma headings, buttons, links, wordmark.
- Producción Vercel `ca1d73e`: las 6 URLs públicas en HTTP 200.

**⚠️ ACCIONES HUMANAS PENDIENTES para que Auth funcione end-to-end:**

1. **Supabase Dashboard → Authentication → URL Configuration:**
   - Site URL: `https://lucams-shop.vercel.app`
   - Additional Redirect URLs: `https://lucams-shop.vercel.app/**`, `http://localhost:3000/**`

2. **Email Templates** (opcional pero importante para identidad): Authentication → Email Templates. Por default Supabase manda emails en inglés genéricos. Customizar para español + tono Lucams, O esperar a integración Resend (próxima fase).

3. **Prueba visual del flujo** en navegador (ver bloque GUI suggested abajo).

**🔍 PRUEBA VISUAL pendiente** — el flujo es la primera UI visible de Lucams. Hay que validar visualmente que el branding queda Lucams (kawaii) y no genérico shadcn.

**Pendiente Fase 1 (próximos bloques):**

- **Audit middleware** Prisma `$extends` para auto-fill `createdBy`/`updatedBy` desde sesión actual.
- **Reset-password callback** — la página que recibe el link del email y permite establecer nueva contraseña (`/establecer-password` o similar).
- **Logout** — server action que llama `supabase.auth.signOut()`.
- **Customer profile page** (`/mi-cuenta`) — magneticas pattern.
- **Header logged-in vs logged-out** — depende de helper `lib/auth.ts` (función `getCurrentUser()` server-side).
- **Email confirmation callback** — Supabase emails apuntan a una URL que debemos implementar para hacer `exchangeCodeForSession`.
- **Email templates Resend SMTP** — sustituir los defaults de Supabase para tener brand consistente.

---

## Última sesión — 2026-05-10 (datalayer completo: 20 modelos + migración + RLS + rate-limit)

**Origen:** Lucy autorizó "procede con todo" tras el cierre del datalayer foundation. Ejecuté schema completo + migración + RLS + rate-limit en una pasada autónoma.

**Hechos:**

1. **Schema expansion** (commit `e572ebf`) — `packages/db/prisma/schema.prisma` extendido de 5 a **20 modelos** + 5 enums (AdminRole, OrderStatus, PaymentMethod, CouponType, WebhookSource). Modelos añadidos: AdminUser, InventoryLog, Cart, CartItem, Order, OrderItem, Coupon, Review, AbandonedCart, LoyaltyTxn, Referral, BlogPost, WebhookEvent, StockReservation, AdminActionLog. Audit fields uniformes en mutables; append-only logs solo con createdAt. Foreign-key cascade rules explícitas por modelo per `docs/CONVENTIONS.md` (Cascade/SetNull/Restrict según semántica). Indexes en `(deletedAt)` + columnas de lookup.

2. **dotenv-cli** (commit `e572ebf`) — añadido como devDep en `packages/db/`. Scripts `db:migrate`/`db:push`/`db:studio` envueltos con `dotenv -e ../../.env.local --` porque Prisma solo lee `.env` por defecto. `postinstall: prisma generate` sigue sin envolverlo porque no necesita DB.

3. **Migración inicial aplicada** (commit `e572ebf`) — `pnpm --filter @lucams/db db:migrate --name init` ejecutó contra Supabase (aws-1-us-east-2.pooler.supabase.com, schema `public`). Migración guardada en `packages/db/prisma/migrations/20260510203116_init/`. Las 20 tablas existen ahora en la DB de producción.

4. **RLS policies** (commit `e572ebf`) — `supabase/migrations/00000000000002_rls_policies.sql` aplicado via `prisma db execute --file ...`:
   - `ENABLE ROW LEVEL SECURITY` en las 20 tablas Prisma.
   - **Catálogo público:** Category/Product/ProductVariant/Review (approved)/BlogPost (published) → SELECT abierto a `anon`+`authenticated` con filtros de visibilidad (`isActive`/`isApproved`/`isPublished`+`deletedAt IS NULL`).
   - **Customer-owned (via `auth.uid()::text = Customer.supabaseUserId`):** Customer (SELECT/UPDATE), Address (ALL), Cart+CartItem (ALL para carros con customer; anon carts vía service_role), Order+OrderItem (SELECT), LoyaltyTxn (SELECT), Review (INSERT propio → moderación).
   - **Deny-by-default (RLS sin policies):** AdminUser, InventoryLog, Coupon, AbandonedCart, Referral, WebhookEvent, StockReservation, AdminActionLog. Solo `service_role` los toca (bypasea RLS).
   - SQL idempotente: cada CREATE POLICY precedido por DROP POLICY IF EXISTS.

5. **Rate limit Postgres** (commit `002eff1`, ADR-016):
   - `supabase/migrations/00000000000003_rate_limit.sql`: tabla `rate_limit_buckets` (snake_case, no-Prisma) + función SQL `rate_limit_check(key, limit, window_seconds)` con `INSERT...ON CONFLICT` atómico que increment + reset por ventana. RLS habilitada deny-by-default; solo service_role accede.
   - `apps/web/lib/rate-limit.ts`: wrapper `rateLimit(key, limit, windowSeconds)` via `prisma.$queryRaw`. `import 'server-only'`. Fail-open si la función no devuelve filas (defensa).
   - **Smoke test end-to-end verificado:** 3 calls con limit=3 → `allowed: true` (count 1/2/3); 4ta call → `allowed: false` (count 4); reset_at consistente; cleanup OK.

**Verificación final producción Vercel:**

- home → 200
- `/api/health` → version `002eff1d...` (último commit)
- `/api/health/db` → 338ms latencyMs (mejoró desde 452ms — Prisma client warm cache)
- Schema migrado, RLS activo, rate-limit funcional, todos los endpoints verificados.

**Decisiones técnicas tomadas en el camino:**

- Audit fields solo en mutables (skip en append-only logs como InventoryLog/LoyaltyTxn/etc.).
- Carts anónimos NO via RLS — pasan por service_role en server-side. Más simple y seguro.
- Rate-limit fail-open por defecto si SQL devuelve no-rows (mejor permitir que bloquear sin razón).
- Cleanup automático de buckets via pg_cron diferido hasta que pg_cron esté activado en Supabase.

**Bloque GUI evitado intencionalmente:** Auth flow (login/register) requiere componentes shadcn + pruebas visuales en navegador. Lo dejé para próximo turno cuando Lucy pueda validarlo. Este turno fue 100% backend → ninguna prueba GUI necesaria.

**Pendiente Fase 1 (próximos bloques):**

- **Audit fields middleware** — Prisma `$extends` que auto-llena `createdBy`/`updatedBy` desde la sesión Supabase actual (lee del cookie store del request).
- **Auth flow** (NEEDS GUI) — `/login` + `/register` con shadcn UI + Supabase Auth + server actions. Incluye rate-limit en endpoints de auth.
- **Webhook handler genérico** con idempotencia via tabla `WebhookEvent` (cuando se conecten Wompi/Venndelo en Fase 4/5).
- **pg_cron jobs** (cuando se active la extensión): cleanup rate_limit_buckets + cart-recovery emails + stock reservation expiry.

---

## Última sesión — 2026-05-10 (datalayer foundation: packages/db + /api/health/db)

**Origen:** Lucy pidió continuar autónomo + dos reglas nuevas: "marcar acciones que requieren humano" (ya guardada en sesión previa) + "recordar pruebas GUI cuando aplique".

**Hechos:**

1. **`packages/db/`** creado como workspace package `@lucams/db` (commit `e9d25d8`):
   - `prisma/schema.prisma` con los 5 modelos CORE: `Customer`, `Address`, `Category`, `Product`, `ProductVariant`. Audit fields uniformes por modelo (`createdAt`, `updatedAt`, `createdBy`, `updatedBy`, `deletedAt`, `deletedBy`) per `docs/CONVENTIONS.md`. Foreign-key cascade rules explícitas (Customer.referredBy → SetNull, Address.customer → Cascade, Category.parent → Restrict, Product.category → Restrict, ProductVariant.product → Cascade). Indexes en `(deletedAt)` y columnas de lookup.
   - `src/index.ts` con `PrismaClient` singleton + global cache (sobrevive HMR de Next sin fugar conexiones).
   - `postinstall: prisma generate` en package.json — clave para que el client se regenere en Vercel build.
   - **Bug resuelto:** quité `output` custom del generator. Con un output custom, `apps/web` no resolvía `@prisma/client` por pnpm hoisting. Dejándolo al default, Prisma lo genera en `node_modules/.pnpm/...` y todos los workspaces lo ven.
   - Aprobé build scripts de `prisma`, `@prisma/client`, `@prisma/engines` en `pnpm-workspace.yaml`.

2. **`apps/web/lib/db.ts`** re-exporta `prisma` + tipos desde `@lucams/db`. `import 'server-only'` enforced — Prisma jamás runtime cliente.

3. **`apps/web/app/api/health/db/route.ts`** — Postgres connectivity probe. Ejecuta `prisma.$queryRaw\`SELECT 1\``, devuelve `{status, check, latencyMs, timestamp}`. On error: log estructurado (`event: 'health.db.fail'`) + RFC 7807 `InternalError`500 vía`problemResponse`. `force-dynamic`+`runtime: 'nodejs'`.

**Verificaciones:**

- Local: `/api/health/db` 200 con latencyMs 1800-4400ms (Bogotá→Supabase US).
- Producción Vercel: 452ms — confirma que postinstall hook ejecutó `prisma generate` en build y que `DATABASE_URL` + `SUPABASE_SECRET_KEY` en Vercel env vars están bien configurados.
- typecheck + build pasaron en ambos contextos. Build output ahora muestra 5 rutas (`/`, `/_not-found`, `/api/health`, `/api/health/db`, + Proxy middleware).

**Memoria nueva guardada:**

- `feedback_gui_test_reminder.md` — Cuando un cambio toque UI/UX (storefront, branding, emails, studio canvas), recordar a Lucy probar visualmente en navegador. Backend puro (lib/\*, API JSON, infra) no requiere recordatorio. Este turno fue 100% backend → ninguna prueba GUI necesaria.

**Pendiente Fase 1 (siguiente bloque):**

- Resto de modelos Prisma de `docs/ARCHITECTURE.md`: `Cart`, `CartItem`, `Order`, `OrderItem`, `Coupon`, `Review`, `InventoryLog`, `AdminUser`, `AbandonedCart`, `LoyaltyTxn`, `Referral`, `BlogPost`, `WebhookEvent`, `StockReservation`, `AdminActionLog`.
- `supabase/migrations/*.sql` para RLS policies (Prisma no las maneja).
- Audit fields middleware (auto-fill `createdBy`/`updatedBy` desde sesión).
- `prisma migrate dev` para crear las tablas en Supabase y commitear la migration generada.
- `lib/rate-limit.ts` Postgres-based (ADR-016).
- Auth flow básico (`/login`, `/register` con Supabase Auth).

---

## Última sesión — 2026-05-10 (capa transversal Fase 1: errors + logger + Supabase + proxy)

**Origen:** después de cerrar el deploy de Vercel, Lucy pidió continuar Fase 1 en autonomía. Implementé en una pasada todas las utilidades transversales que el resto del código va a usar.

**Hechos:**

1. **`lib/errors.ts`** (commit `b09477c`) — RFC 7807 Problem Details. `AppError` base + 8 subclases (`Validation`, `NotFound`, `Unauthorized`, `Forbidden`, `Conflict`, `Unprocessable`, `TooManyRequests`, `InternalError`). `problemResponse()` convierte error → `Response` con `application/problem+json`. Adaptado a Zod v4: usa `z.flattenError()` (la API `error.flatten()` v3 está deprecada).

2. **`lib/request-id.ts`** (commit `b09477c`) — UUID v4 propagado vía `AsyncLocalStorage` (Node API). `withRequestId(id, fn)` envuelve handlers, `getRequestId()` lee desde cualquier código aguas abajo sin pasar el ID explícito.

3. **`lib/logger.ts`** (commit `b09477c`) — `pino` con redact paths cubriendo secretos por patrón (`*Key`, `*Secret`, `*Token`), headers sensibles (`auth`, `cookie`), y PII directa (`email`, `phone`, `password`). JSON crudo en producción (Vercel logs lo parsea), `pino-pretty` en dev.

4. **`lib/supabase/{browser,server,service}.ts`** (commit `039ab76`) — 3 clientes con privilegios distintos:
   - `browser.ts`: `createBrowserClient` con publishable key → rol Postgres `anon` con RLS.
   - `server.ts`: `createServerClient` con publishable key + adapter `getAll/setAll` para cookies (Next.js 16 `await cookies()`). Try/catch silencioso en setAll porque Server Components no pueden mutar cookies — proxy.ts maneja refresh.
   - `service.ts`: secret key → rol `service_role`, bypassa RLS, `import 'server-only'` enforce. Reservado para webhooks, jobs, admin scripts.

5. **`proxy.ts`** (commit `779deae`) — middleware Next 16 (renombrado de `middleware.ts`, edge runtime no soportado). Cuatro responsabilidades en orden:
   - Generar `X-Request-Id` (UUID v4), exponerlo en response — incluso en 403.
   - Refrescar sesión Supabase con `getAll/setAll` adapter + `getUser()` trigger.
   - CORS allowlist para `/api/*`: lucamsshop.co + www + `*.vercel.app` previews + (dev) localhost. Origen no permitido → 403.
   - Security headers: HSTS (2y), X-Frame-Options DENY, X-Content-Type-Options nosniff, Referrer-Policy strict-origin-when-cross-origin, Permissions-Policy (camera/mic/geo denegados), X-DNS-Prefetch-Control on, Content-Security-Policy completa (Wompi/Cloudflare/Supabase/Venndelo/Anthropic en allowlists; nonces diferidos).

**Verificaciones:**

- `pnpm --filter web typecheck` ✓ y `build` ✓ en cada commit (4 rutas, 0 warnings, build con `ƒ Proxy (Middleware)` confirmado).
- Local: `curl -I http://localhost:3000/` muestra 7 headers de seguridad + X-Request-Id. CORS bloquea `Origin: https://evil.com` → 403 con X-Request-Id presente.
- Producción Vercel: deploys exitosos `b09477c → 039ab76 → 779deae`. Headers de seguridad confirmados con `curl -I https://lucams-shop.vercel.app/`.

**Decisiones técnicas en el camino (sin necesidad de ADR):**

- Zod v4 (`z.flattenError`) sobre v3 (`err.flatten()`).
- `pino-pretty` solo en dev vía `transport.target` con guard `isDev`.
- Errores de dominio (`payment-declined`, `shipping-unavailable`, `webhook-signature-invalid`) diferidos a sus features (no en `lib/errors.ts` genérico).
- `proxy.ts` matcher excluye `_next/static`, `_next/image`, fonts, imágenes — no necesitan headers/cookies.
- Bug encontrado al escribir comments JSDoc: `*/` literal (en `app/api/*/route.ts`) cierra el block comment. Corregido reformulando.

**Memoria nueva guardada:**

- `feedback_flag_human_required.md` — cuando una tarea requiera acción humana (UI dashboards, cuentas, rotación, pagos), prefijar con `**ACCIÓN HUMANA REQUERIDA:**` y separarlo del análisis técnico. Razón: en sesiones previas Lucy se quedó esperando sin saber si yo trabajaba o si ella tenía que hacer algo.

**Pendiente Fase 1:** `packages/db` (Prisma schema + audit fields + RLS policies) → `lib/rate-limit.ts` (Postgres-based, ADR-016) → `/api/health/db` (healthcheck Postgres) → posiblemente auth flow básico.

---

## Última sesión — 2026-05-10 (debug + fix de Vercel deploy productivo)

**Origen:** después de cerrar el scaffolding local, push a Vercel devolvía HTTP 404 en home y `/api/health` durante 2.5+ minutos. Build aparecía como "Deployment Failed".

**Diagnóstico contra doc oficial Vercel (actualizada 2026-03-17):**

1. **Auditoría de config Vercel UI:** Root Directory = `apps/web` ✓, "Include files outside" = Enabled ✓, Node 24.x ✓. **Pero Framework Preset = "Other"** (debió ser Next.js).
2. **Auditoría de `vercel.json`:** estaba en `/vercel.json` (repo root). La doc dice _"This file should be created in your project's root directory"_ — y "project's root directory" en Vercel = el Root Directory configurado, NO el repo root. **Por eso Vercel ignoraba el archivo entero** y `framework: "nextjs"` no aplicaba.
3. **Webhook GitHub→Vercel funcionaba**, los pushes sí disparaban deploys (verificado con `git ls-remote` y `91eea18` apareciendo en lista). El problema NO era de tracking de branch.

**Fix aplicado (commit `62a83ae`):**

- `git mv vercel.json apps/web/vercel.json`
- Simplificado a solo `{"$schema": ..., "framework": "nextjs"}`
- Removido `outputDirectory` (auto-derivado cuando framework=nextjs) y `ignoreCommand` (paths se romperían con la nueva ubicación; "Skip deployments unaffected" del UI lo cubre).

**Resultado:**

- Build exitoso en 25s. `Detected Next.js version: 16.2.6` confirmado en log.
- Producción: `https://lucams-shop.vercel.app/` → HTTP 200, `/api/health` → JSON con `version: "62a83aea..."`, `environment: "production"`.
- Build cache creado para acelerar próximos deploys.
- Decisión registrada como **ADR-027** en `docs/DECISIONS.md`.

**Lección clave para futuro:** En monorepos Vercel con Root Directory configurado, **`vercel.json` vive en el Root Directory**, no en el repo root. La frase "project's root directory" en la doc es ambigua y confunde.

---

## Última sesión — 2026-05-09 (segunda iteración: productive readiness)

**Origen:** el usuario reframea — "lo de la primera sesión es el piso, no el techo. Para productivo falta más". Lanza segunda auditoría completa.

**Hechos:**

1. **Verificaciones contra fuentes oficiales** (mandato #9):
   - DIAN facturación electrónica: Resolución 165/2023, sanciones 1% ingresos / 950 UVT ([DIAN — Obligados](https://www.dian.gov.co/impuestos/sociedades/Paginas/obligadosfacturar.aspx)).
   - Ley 1480 art. 47: 5 días hábiles retracto, 15 días reembolso, **exclusión por personalización** ([Función Pública](https://www.funcionpublica.gov.co/eva/gestornormativo/norma.php?i=44306)).
   - RFC 7807 Problem Details: schema y campos verificados ([RFC 7807](https://datatracker.ietf.org/doc/html/rfc7807)).
   - STRIDE: definiciones textuales de las 6 categorías ([Microsoft Learn](https://learn.microsoft.com/en-us/azure/security/develop/threat-modeling-tool-threats)).
   - Tailwind v4 `@theme` directive: sintaxis confirmada ([tailwindcss.com/docs/theme](https://tailwindcss.com/docs/theme)).

2. **Auditoría productive readiness:** 43 hallazgos clasificados en 9 bloqueantes + 21 importantes + 13 nice-to-have. Documento en [`docs/audits/2026-05-09-productive-readiness-audit.md`](audits/2026-05-09-productive-readiness-audit.md).

3. **4 documentos nuevos creados:**
   - **[`docs/CONVENTIONS.md`](CONVENTIONS.md)** — patrones FE+BE+DB, naming, error format RFC 7807, capa de servicio, **saga pattern**, idempotency keys, migration strategy expand-then-contract, indexing, soft delete + audit fields, FK cascade, retention, resiliencia (timeouts/retry/circuit breaker), logging con request ID.
   - **[`docs/OBSERVABILITY.md`](OBSERVABILITY.md)** — SLOs cuantitativos, SLIs, error budgets, dashboards, alertas accionables, postmortem process, métricas custom.
   - **[`docs/COMPLIANCE.md`](COMPLIANCE.md)** — Ley 1581 con tabla `Consent` versionada, Ley 1480 (retracto art. 47 con `RetractRequest` schema, garantía art. 7-15, reversión pago art. 51), DIAN facturación electrónica con `InvoiceProvider` interface, IVA y retenciones, subprocesadores, calendario de cumplimiento.
   - **[`docs/TESTING.md`](TESTING.md)** — pirámide, mock vs real, tests RLS automatizados, E2E con Playwright, visual regression, accesibilidad automatizada, performance/load (k6), smoke tests post-deploy, coverage targets.

4. **5 documentos expandidos:**
   - **`SECURITY.md`** — STRIDE aplicado a 4 flujos críticos (registro/login, checkout, estudio, jobs), IRP con runbooks por escenario (4 IRPs concretos), clasificación de datos formal, cookie consent banner con código de implementación.
   - **`ARCHITECTURE.md`** — sección "Patrones cross-cutting" referenciando CONVENTIONS + nota sobre audit fields auto-aplicados.
   - **`INTEGRATIONS.md`** — Sección 7 DIAN provider (`InvoiceProvider` interface + flujo emisión + notas crédito) + Sección 8 Resiliencia compartida (tabla timeouts/retries/circuit breakers por integración) + Sección 9 Background jobs renumerada.
   - **`OPERATIONS.md`** — DevOps strategy (branching trunk-based, releases CD + canary, environments, feature flags con comparación de proveedores) + DR (RPO/RTO + procedimiento + drills cuatrimestrales con calendario).
   - **`ROADMAP.md`** — tareas distribuidas en cada fase con subsecciones "productive readiness audit": Fase 1 (patrones cross-cutting + observabilidad), Fase 2 (estados UI + visual regression), Fase 3 (security upload), Fase 4 (saga + retracto + cookie banner + idempotency), Fase 5 (feature flags + email lifecycle), Fase 6 (audit log admin + MFA + garantía), Fase 7 (DIAN + threat model + pen test + DR drill + IRP).

5. **Decisiones nuevas a tomar (ADRs futuros):**
   - ADR-025: proveedor DIAN (Alegra / Siigo / Facture) — antes de Fase 7.
   - ADR-026: proveedor de feature flags (sugerencia: GrowthBook cloud Free) — antes de Fase 5.
   - ADR-027: necesidad de staging environment — re-evaluar post-lanzamiento.

---

## Última sesión — 2026-05-09 (primera iteración: coherencia + endurecimiento productivo)

**Alcance:** carga de contexto inicial + auditoría de coherencia + endurecimiento productivo de toda la documentación.

**Hechos:**

1. **Auditoría de coherencia** completa de los 7 documentos del proyecto. 21 hallazgos detectados, registrados en [`docs/audits/2026-05-09-coherence-audit.md`](audits/2026-05-09-coherence-audit.md). H5 retirado tras verificación contra Wompi docs.
2. **Verificación contra fuentes oficiales** de las afirmaciones técnicas críticas:
   - Wompi: `2.65% + $700 + IVA` confirmado ([wompi.com/es/co/planes-tarifas](https://wompi.com/es/co/planes-tarifas/)).
   - Tarjeta sandbox `4242 4242 4242 4242` confirmada ([docs.wompi.co](https://docs.wompi.co/en/docs/colombia/datos-de-prueba-en-sandbox/)).
   - shadcn/ui soporta Tailwind v4 + React 19 en producción ([ui.shadcn.com/docs/tailwind-v4](https://ui.shadcn.com/docs/tailwind-v4)).
   - Vercel KV deprecado desde dic-2024, migrado a Upstash ([vercel.com/docs/redis](https://vercel.com/docs/redis)).
   - Upstash Free: 500K cmd/mes + 256 MB ([upstash.com/pricing](https://upstash.com/pricing)).
   - Supabase Queues = pgmq, durable, exactly-once ([supabase.com/docs/guides/queues](https://supabase.com/docs/guides/queues)).
3. **6 decisiones nuevas cerradas** (ADRs 014–019):
   - **ADR-014** — Reserva de stock al `PENDING_PAYMENT` con TTL 15 min + descuento al `PAID`.
   - **ADR-015** — Tailwind v4 + React 19 (alineado con default oficial de shadcn/ui).
   - **ADR-016** — Rate-limit y cache en Postgres + `pg_cron`, sin proveedor externo. Migrar solo si p95 > 50 ms.
   - **ADR-017** — Background jobs en Supabase Queues (`pgmq`) + `pg_cron`, no Vercel Cron.
   - **ADR-018** — Mandato "argumentación obligatoria, sin suposiciones".
   - **ADR-019** — Traceability inter-sesión vía `docs/STATE.md` y `docs/audits/`.
4. **Documentos creados:**
   - `docs/STATE.md` (este archivo).
   - `docs/SECURITY.md` (fuente única de seguridad: RLS, CORS, headers, rate limit, RBAC, validación, secrets, CSP, TTLs, file upload, audit logs).
   - `docs/audits/2026-05-09-coherence-audit.md` (auditoría inicial).
   - `.gitignore` exhaustivo en raíz del repo.
   - `.env.example` con todas las variables placeholder.
5. **Documentos actualizados:**
   - `CLAUDE.md` — estado, monorepo en mandato #3, mandatos #9 (argumentación), #10 (VM dedicada), #11 (background jobs en Supabase), #12 (seguridad por defecto). Lectura mínima incluye STATE.md y SECURITY.md.
   - `ROADMAP.md` — Fase 0a marcada completa con fecha; Fase 0b/1 actualizadas (sin Upstash, con `pgmq` + `pg_cron`, healthchecks, Turnstile).
   - `PLAN.md` — comisión Wompi completa, política stock, dedupe pendientes, sustitución Vercel KV/Upstash, sección background jobs.
   - `ARCHITECTURE.md` — snippet Tailwind v4 CSS-first, sección Storage buckets, sección Extensiones Postgres, workers consumidores de pgmq.
   - `INTEGRATIONS.md` — `VENNDELO_ORIGIN_CITY` declarado, sección Background jobs (pgmq+pg_cron), referencias Vercel KV eliminadas.
   - `OPERATIONS.md` — comisión Wompi completa, política stock, runbook con consumers pgmq, vars Turnstile, sección Entorno de desarrollo (VM dedicada símil Vercel local).
   - `BRANDING.md` — snippet Tailwind v4, dedupe pendientes.
   - `README.md` — monorepo mencionado en stack.
   - `DECISIONS.md` — 6 ADRs nuevos (014–019).

---

## Próximo paso

**Requiere a Lucy (decisiones / verificación):**

1. **Prueba visual del feature de compartir** (ver Bitácora 2026-07-12): `/mi-cuenta/disenos` con un
   diseño finalizado → Compartir (copia link) / WhatsApp / Ver / Archivar; abrir `/d/<token>` en incógnito
   (público) y comprobar la miniatura al pegar el link en WhatsApp. Requiere un diseño `READY`/`USED_IN_ORDER`.
2. **Decisión ADR-056 — take-down real de la imagen.** Hoy archivar revoca el link pero la imagen pública
   del preview sigue accesible en su URL directa. Retirarla exige desacoplar pedido↔imagen (snapshot del
   preview en `OrderItem` al confirmar, luego borrar/rotar el preview al archivar; o bucket privado con
   signed URLs — afecta las 3 vistas de pedido). ¿Se aborda ahora o se deja para el endurecimiento de
   privacidad pre-lanzamiento? (Relevante Ley 1581 — fotos personales.)
3. **🔴 PENDIENTE SERIO — plantillas del Estudio** (sección arriba, Lucy 2026-07-04): curaduría de
   plantillas reales + visión del flujo móvil. Necesita input de Lucy antes de producir.

**Autónomo (candidatos, calidad-primero):**

1. **Backlog auditoría v3: 100% barrido en código** (Tandas 1-8 + FB1-FB5 + piezas mayores + tail de calidad T5/T6/T7). No queda deuda de auditoría accionable sin decisión/verificación de Lucy.
2. Otros pulidos de Fase 3 storefront/estudio que no dependan de la curaduría de plantillas.
3. Barrido de coherencia de datos revenue/COD end-to-end si aparece señal.

**Cuentas creadas just-in-time durante fases posteriores:**

- Cloudflare (DNS + Turnstile + R2) → durante Fase 1 (Turnstile en signup) y Fase 7 (DNS + R2 al lanzar productivo).
- Anthropic API key → durante Fase 3 (Estudio de IA con Claude).
- Venndelo sandbox → durante Fase 4 (checkout con cotización).
- Wompi sandbox → durante Fase 4 (en gestión externa de la operadora).

**Cola de verificación pendiente** (mandato #9):

✅ **Verificadas el 2026-05-09** (registradas con cita en `OPERATIONS.md § Verificación de tiers Free`):

- Vercel Hobby: 60s function timeout · 100GB bandwidth · 1M invocations · 4 CPU-hrs · 1h log retention · **ToS prohíbe uso comercial** (cita textual).
- Supabase Free: 500 MB DB · 1 GB storage · 50k MAU · 500k Edge Function invocations · 5 GB egress · pausa a 1 semana · 2 proyectos máx.
- Resend Free: 3k/mes · 100/día · 1 dominio custom · 30 días retención.
- Anthropic: Sonnet 4.6 = $3/MTok input + $15/MTok output, 1M context, 64k max output.
- Cloudflare R2 Free: 10 GB · 1M Class A ops · 10M Class B ops · egress gratis.
- Cloudflare Turnstile Free: 1M siteverify/mes/sitio · 20 widgets/cuenta.

✅ **Cerrado el 2026-05-09 (sesión 7):**

- `pgmq`, `pg_cron`, `pgcrypto`, `pg_stat_statements` habilitados sin error en proyecto Supabase Free `zxkucphbsfygakgxcnik`. Validan ADR-016 (rate-limit/cache en Postgres + pg_cron) y ADR-017 (background jobs en pgmq).

🟡 **Pendiente todavía (consultas dirigidas al crear cuentas o tomar ADRs):**

- TTL configurable de access/refresh tokens en Supabase Auth Free → `supabase.com/docs/guides/auth/sessions` (revisar al implementar Auth en Fase 1).
- Política de password configurable en plan Free → `supabase.com/docs/guides/auth/password-security` (Fase 1).
- Coordinadora 1.100+ destinos vía Venndelo → confirmar al crear cuenta sandbox Venndelo (Fase 0b).
- Costos y APIs de Alegra/Siigo/Facture → para ADR-025 (antes de Fase 7).
- RNBD ante SIC: ¿obligatorio para nuestro volumen? → consulta legal cuando contratemos abogado (ADR-020, antes de Fase 7).
- UVT 2026 valor exacto en COP (impacta tope sanciones DIAN) → `dian.gov.co` cuando se redacten T&C.

---

## Bitácora (append-only, más reciente arriba)

### 2026-07-19 (cont.) — Barrido legal-Colombia integral (ADR-072)

Lucy: "barrido TOTAL de todos los textos, db, etc… ajustados a la ley colombiana". Se mapeó dónde vive todo el texto legal (8 páginas `legal.*` con doble capa código-fallback/BD-CmsBlock, footer, checkout, 20 correos, PDP, settings) y se corrió un **workflow multi-agente (25 agentes, ~47 min, 1.36M tokens)**: cada superficie auditada + redactada contra la ley y verificada adversarialmente (citas de artículo, hechos inventados, voseo, exposición PII, IVA-régimen), + crítico de consistencia transversal. Salida: 11 blockers / 23 high / 37 medium / 26 low + 8 drafts verificados + 21 needsHuman.

Hallazgo raíz: `getCmsBlock` renderiza `publishedVersion.body`; los fallbacks compliant del código no se veían porque la BD publicada era placeholder ("en revisión legal, próximamente"), sin identidad del responsable, con retracto mal (30 días/recepción), subprocesadores equivocados (Venndelo/Anthropic) y HTML crudo que react-markdown no renderiza.

Remediado en 5 batches (Batch 1 legales · 2 checkout · 3 correos · 4 PDP · 5 config/docs), cada uno certificado (tsc+lint+prettier) y pusheado; 166 tests verdes (consent/back-in-stock/emails/reviews). El contenido legal canónico quedó committed en `packages/db/legal-content/*.md` + `seed-legal-content-2026-07.mjs` (reproducible a PROD). **Verificado en el navegador** tras nuke `.next`: persona natural, retracto 15 días calendario, reversión del pago, Aveonline+Gemini, tabla renderiza, Versión 2, footer con identidad+SIC, PDP con retracto/COP/transportadoras — sin fugas de cédula/dirección/S.A.S. Decisiones humanas (contador/abogado/operación) consolidadas en ADR-072. Base compliant; requiere visto bueno de abogado antes del lanzamiento (ADR-020).

### 2026-07-19 (cont.) — Cierre del tail de calidad v3 (T5/T6/T7) + orquestación de finalizeDesign por-PR

Cerrada la cola de calidad autorizada por Lucy ("procede en el orden que consideres… calidad de implementación, sin importar el tiempo de esfuerzo"). Tres commits pusheados a `develop`, cada uno certificado (tsc+eslint+prettier, y test verde donde aplica):

- **T5 pulido** — **#16** buy-box del PDP sobre el fold en móvil (flex + `order-*` en los 6 hijos de la columna derecha, CSS-only; wrapper para el `SelectedVariantProvider` que no emite nodo DOM); **#22** `/checkout/pago` móvil con resumen+total antes del botón de pagar (order-1/2, avisos full-width, lg+ restaura 2 col); **#26** validación diferida "reward early, punish late" (`touched` por campo: error solo tras blur, se oculta al reeditar) en nombre/email/teléfono/documento.
- **T6 restante** — **#5** salida de `PENDING_PAYMENT` en `/pedido/[token]` (banner ámbar + WhatsApp, timeline oculto mientras confirma); **#10** sección "Tu cuenta" session-aware en el drawer móvil (antes no había entrada a la cuenta en móvil desde el mega-menú).
- **T7 último test (#7)** — `finalize-design.orchestration.integration.test.ts` (7 tests): mockea solo el I/O de Storage (`supabaseService` vía `vi.mock` hoisted) + Prisma real → corre en el gate por-PR (antes la orquestación de `finalizeDesign` solo la cubría el nightly con Storage real). Verifica render server-side (3240px reemplaza el PNG del cliente), **fallback** por slot con filtro (NEEDS_KONVA en sharp Y canvas → conserva el PNG del cliente), los 4 guards (only DRAFT / INCOMPLETE_SLOTS ×2 / not owned) y `calendarYear` en metadata. **Corrección al hallazgo original:** una capa de TEXTO no cae a fallback (el tier canvas la renderiza); el disparador real de fallback es el FILTRO — verificado contra `production-render.ts:116` y `production-render-canvas.ts:156`.

**Estado:** backlog de auditoría v3 100% barrido en código. Lo que sigue es verificación GUI de Lucy + ACCIÓN HUMANA (Wompi propio, abogado/contador, CMS legal a prod, dominio/correos).

### 2026-07-18 (cont.) — Retracto (cliente asume costo) + flujo de cupones fluido/efectivo (ADR-068 #1 resuelto, ADR-069)

Lucy resolvió la decisión diferida del retracto: **el cliente asume el costo del envío de la devolución** (salvo defecto/error → Garantías). Copy alineado en UI + 2 emails (`f45efad`). Luego pidió asegurar el **flujo de cupones fluido y efectivo** → auditoría adversarial dedicada (25 agentes, 6 facetas) → 17 confirmados. El motor monetario ya era correcto; se cerraron 9 huecos de fluidez (cupón-inválido: 3er estado ámbar, banner suave, sin round-trip, a11y, pulido) y efectividad (timezone COT en la ingesta, tope por-cliente por email para invitados con nueva columna `CouponUsage.email`, `needsReconciliation` atómico, guards de config). Migración `20260718120000_coupon_usage_email`. Certificado + push. Informe: `docs/audits/2026-07-18-coupon-flow.md`, ADR-069.

### 2026-07-18 — Auditoría adversarial v3 sobre código real (UX/UI web+móvil) + remediación blocker/high/quick-win (ADR-068)

Verificación adversarial multi-agente (~253 agentes, 7 dimensiones, paneles que intentan refutar cada hallazgo) → **218 confirmados** (5 blocker · 16 high · 116 medium · 81 low), score de entrada **47/100 NO-LANZAR**. Se presentó el resultado a Lucy; autorizada la opción (a), se remediaron **de corrido** los 5 blockers + 16 highs + 14 quick wins, cada uno certificado (tsc+lint+prettier+tests+build) con push a `develop`. Tandas A (dinero `8aa29b8`), B (Estudio `618c293`), C (legal/Ley 1581 `e86be2c`), D (UX alto `ba70918`/`4b3ab4b`/`87e46a7`/`4a986b5`), E (quick wins). **2 políticas diferidas a Lucy**: quién paga la devolución (retracto) y política de cupón invalidado en checkout (`COUPON_INVALIDATED`). Informe: `docs/audits/2026-07-18-adversarial-v3.md`. Backlog 116 medium + 81 low para siguiente ronda (patrón: «fallar en silencio»).

### 2026-07-12 (cont.) — Fase 3 EJECUTADA: abecedario a 3 productos + editor de nombre + fichas + cert imágenes (ADR-057)

Tras la estrategia (abajo), se construyó el primer editor fit-for-purpose end-to-end y se reestructuró
el catálogo del abecedario, todo verificado (tsc/build/tests + pruebas funcionales reales contra dev).

- **Enrutador de superficie** (`features/personalization/surface.ts`): el Estudio ramifica por
  kind+config+variante → 5 superficies + carrito directo. Discriminador de variante ahora sobrevive
  (`variant-schemas.ts`). 17 tests. (f9bdfa5)
- **Editor de NOMBRE** (abecedario): escribe una palabra → tira de fichas en vivo. Lógica de normalización
  (José→JOSE, Ñ solo es, sin números, 3-10, repetición) 15 tests. Paleta de temas + **color por letra** +
  **re-clic baraja** + **22 colores vivos** (no pastel) + ejemplos + letras repetidas. Reutiliza
  finalize/carrito (canvasData v1, datos en metadata). (b70a989, f95fffa, 8e2e258, 64a21da, 301146e, a39a178)
- **Patrón "ficha configura, editor personaliza"** (decisión de Lucy sobre su Fotoimanes): opciones
  (idioma/tamaño/imantado) en la FICHA (VariantSelector + dims Idioma/Imantado), editor solo para lo
  creativo. **Abecedario → 3 productos**: Abecedario Completo · Pack Vocales · Nombre Personalizado (NONE/
  TEXT_ONLY), idioma como opción, 30 variantes (`restructure-abecedario.mjs`, viejos archivados). Carrito
  variant-aware. Nombres sin "Magnético". (d7ac4e1)
- **Certificación de imágenes por variante** (workflow, 37 agentes): prueba funcional real (subida→variante→
  storefront→swap) + 11 hallazgos, **8 corregidos** — el HIGH era la variante "Default" fantasma que
  desincronizaba galería/precio en TODO producto creado desde el admin. (2511293)
- **Sets de fichas** (ADR-057): modelos `LetterTileSet`+`LetterTile` (migración) + admin `/admin/fichas`
  (grilla del abecedario, subir por letra, progreso 24/27) + editor usa fichas reales (placeholder si
  faltan). Seed de 2 sets es/en. Prueba funcional real. (05af94e, cc46271)
- **Reproducibilidad:** `make seed-abecedario` + `make seed-letter-sets`. (89e3d5c)
- **PENDIENTE de Lucy:** subir las 53 ilustraciones en `/admin/fichas`; ajustar precios de variantes en
  `/admin/productos`; subir portada + fotos por variante. **Diferido (pulido no bloqueante):** feedback
  optimista en reorder de imágenes + swap de imagen atómico (hoy va con round-trip RSC).

### 2026-07-12 — Estrategia del Estudio: aumentar Konva, no refactorizar (ADR-057)

- **Origen:** Lucy pidió "pensar muy bien" el Estudio (core) antes de masificar — funcional (coherente con
  cada producto, no talla única) + evaluar la tecnología desde cero, dispuesta a refactorizar si aplicaba.
  Detonante: el "Abecedario Magnético" muestra una cajita de foto cuando debería ser "escribe un nombre".
- **3 investigaciones en paralelo** (139 agentes, verificación adversarial, cruzadas contra el código):
  calidad de impresión+UX (105 agentes, fuentes citadas), taxonomía de personalización por tipo, y
  evaluación de tecnología. Entregables: [ESTUDIO_STRATEGY.md](ESTUDIO_STRATEGY.md) + [ADR-057] + artifact
  visual para Lucy (claude.ai).
- **Veredicto: AUMENTAR, no refactorizar.** Konva es la fundación correcta (mismo motor que Polotno
  US$899/mo). Gaps reales: (1) el archivo de impresión se genera en el **celular del cliente** → mover al
  servidor ($0, Fase 0); (2) el editor **no ramifica por tipo** → aplana ~24/30 productos a "foto+texto",
  3 tipos rotos → **enrutador** por tipo+config+variante hacia 5 superficies. Calidad visual ya cumple el
  estándar (300 DPI, validación pre-pago, sangrado); CMYK condicional a imprenta local; 3D opcional.
- **Plan por fases $0** (0 fundación → 1 sub-editores+plantillas → 2 CMYK → 3 3D). Fase 0 = migración de
  datos (el discriminador de variante hoy se descarta) + carrito por variante + extraer núcleo del editor.
- **También en esta racha (antes):** feature de compartir diseño (ADR-056) + hardening de MIME por magic
  bytes en la subida de fotos del cliente (commit `b9484d1`).
- **Pendiente de Lucy:** decisiones de producto (acentos en nombres — la más urgente, año de calendario,
  prioridad por ventas reales de IG, limpieza de catálogo) + acción humana: 53 ilustraciones de letras.
  **Nada de código del Estudio se ha tocado aún** — esperando sus decisiones para arrancar la Fase 0.

### 2026-07-12 — Compartir diseño (Fase 3) + revisión adversarial (ADR-056)

- **Feature completo** cableando `Design.shareToken` (existía sin usar): `/mi-cuenta/disenos` ("Mis
  diseños", pestaña nueva) con grilla + preview + Compartir/WhatsApp/Ver/Archivar, y vista pública
  `/d/[token]` (preview + producto + CTA "Crear el mío", noindex, OG image). Aislado por `customerId`,
  token 16 bytes hex (sin IDOR). Nuevos: `app/mi-cuenta/disenos/{page,actions,design-grid}.tsx`,
  `app/d/[token]/page.tsx`, 4 funciones en `features/personalization/service.ts`.
- **Revisión adversarial** (workflow, 4 dims × 3 escépticos, 25 agentes): 7 crudos → **6 confirmados**,
  todos arreglados. `handleCopy` mostraba "Link copiado" aunque `writeText` rechazara → ahora try/catch
  con fallback que muestra el link. Archivar solo ocultaba la tarjeta → ahora anula `shareToken` (revoca
  el link). `window.open` de WhatsApp tras el await → bloqueado en iOS Safari → abierto sincrónicamente
  en el gesto. `ensureDesignShareToken` read-then-write no atómico → `updateMany where shareToken:null` +
  re-lectura. `getSharedDesign` corría 2×/request → `cache()` de React.
- **Diferido (ADR-056):** archivar NO borra el preview público — las 3 vistas de pedido (cliente,
  confirmación, **producción admin**) leen `design.previewUrl` en vivo; borrarlo rompería esas imágenes
  para `USED_IN_ORDER`. Take-down real = desacoplar pedido↔imagen (snapshot en OrderItem o bucket privado).
  Pendiente de decisión de Lucy.
- **Verificación:** tsc + build OK (rutas `/d/[token]` y `/mi-cuenta/disenos` registradas) · integración
  compartir **13/13** (IDOR, idempotencia, revocación real, tokens malformados) · **suite completa 1666
  passed** (confirmación definitiva pedida por Lucy) · commit `6b3b6f1` pushed a origin/develop.

### 2026-06-27 — Certificación Bloque A (checkout/pagos) + Bloque B (compliance)

> Nota: entre 2026-05-11 y esta fecha hubo varias sesiones (imágenes producto,
> checkout Wompi, integración Aveonline, admin UX redesign, restructuración
> Catálogo "Opción C") que NO quedaron registradas en bitácora; su detalle está
> en el historial git. Esta entrada cubre la sesión de certificación + compliance.

- **Certificación adversarial de Bloque A (saga/pagos)** con workflow multi-agente
  (6 atacantes + verificación de cada hallazgo). Veredicto inicial 🔴 NO APTO: un
  **P0 reproducido contra la DB** — el índice unique `InventoryLog(orderId, reason)`
  sin `variantId` hacía fallar el 2º INSERT de toda orden multi-ítem → P2002 →
  rollback → Order atascada PENDING_PAYMENT pese a Wompi APPROVED. Reportes en
  `docs/audits/2026-06-26-certify-bloque-a/`.
- **Pre-launch (commit 900a0e0):** índice corregido a `(orderId, reason, variantId)`
  - manejo P2002 (`StockAlreadyAppliedError`); `/gracias` no miente (ramifica por
    order.status); `Order.needsReconciliation` visible en /admin/pedidos; unique
    parcial `Order.cartId` + catch P2002; env-match del webhook desde `WOMPI_ENV`.
  - regression tests (integración DB real).
- **Post-launch + P1 (commit siguiente):** persistir trackingNumber + **claim
  atómico `Order.shipmentClaimedAt`** (cierra el P1 de doble-guía concurrente que
  la verificación adversarial encontró); clearCart dentro de la tx PAID; email
  idempotente/recuperable (`confirmationSentAt`); VOIDED→REFUNDED con revert +
  retry TOCTOU; retry colisión `Order.number`. **48 tests verdes.** Verificación en
  `docs/audits/2026-06-26-certify-bloque-a/01-VERIFY-POSTLAUNCH.md`.
- **Bloque B compliance:** `/unsubscribe?email=&token=` (Ley 1581, token SHA-256
  verificado timing-safe, registra Consent revocación + Resend unsubscribed);
  textos legales reales en privacidad/términos/devoluciones/subprocesadores
  (Aveonline, no Venndelo); **retracto verificado contra Ley 2439/2024** (mandato
  #9 — el retracto sigue 5 días hábiles; el cambio es reembolso e-commerce a 15
  días calendario); voseo→tuteo en email templates. 55 tests verdes.
- **Docs:** COMPLIANCE.md cita Ley 2439/2024; SECURITY.md actualizado (webhooks
  Wompi+Aveonline, anti-replay, env-match, claim de guía); memoria
  `reference_retracto_ley_2439_2024`.
- **Pendiente:** P0-004 verificar dominio `mail.lucamsshop.co` en Resend (ACCIÓN
  HUMANA — DNS SPF/DKIM/DMARC). Siguiente bloque sugerido: C (Seguridad).

### 2026-05-11 — Fase 2: catálogo admin + storefront público + carrito anon

Sesión larga que cubrió todo el bloque catálogo + carrito hasta dejar el flow guest "ver → agregar → carrito → ajustar qty" operativo. Commits: `d9fab6b` (admin productos CRUD) → `8714985` (admin categorías) → `d31f037` (seed demo 4×8) → `c77e641` (storefront público) → `7bfc879` (carrito anon + merge).

Decisiones cocreadas con Lucy:

- **Cart en Postgres** + sessionId cookie (vs cookie pura o Redis). Habilita abandoned-cart emails posterior, server-authoritative, alineado con mandato #11 CLAUDE.md.
- **Merge inteligente** al login (suma qty por variantId, vs reemplazo). UX no destructiva.
- **Cookie sin firmar HMAC** — UUID server-generated de 122 bits + ausencia de PII en cart hacen suficiente la entropía. Documentado en `lib/cart-session.ts` para revisar si se almacena `customDesign` con datos sensibles.
- **Default variant pattern** sin schema migration: cada producto auto-crea variant "Default" en createProduct para satisfacer `CartItem.variantId` required. Bridge hasta variantes admin reales.

Detalles arquitectura:

- `features/products/public-service.ts` separado de `service.ts` admin — enforza `deletedAt:null + isActive:true` en product Y category. El admin service queda libre para surfacear archivados en `/admin`.
- `features/cart/service.ts` con merge transaccional + hard-delete del anon (sessionId @unique no respeta deletedAt). Items con producto archivado se filtran en `getCartDetail` (admin que archive efectivamente saca el item de carritos en vuelo).
- `lib/format.ts` shared (eliminada duplicación en admin/productos/page.tsx).

Pendiente prueba visual end-to-end por Lucy + imágenes Storage + variantes admin reales.

### 2026-05-09 — Fix deploy Vercel: Root Directory + simplificación vercel.json (sesión 12)

**Síntoma:** después de pushear el commit `a025589` (que agregaba `/api/health`), el deploy de Vercel seguía respondiendo HTTP 404 con `x-vercel-error: NOT_FOUND` en `lucams-shop.vercel.app/`.

**Diagnóstico** (gracias al build log que la operadora extrajo del dashboard):

```
23:29:58.579 Warning: Could not identify Next.js version, ensure it is defined as a project dependency.
23:29:58.593 Error: No Next.js version detected. Make sure your package.json has "next" in either "dependencies" or "devDependencies". Also check your Root Directory setting matches the directory of your package.json file.
```

El log mostró que Vercel SÍ ejecutó nuestro `installCommand` (`pnpm install --frozen-lockfile` desde root, 12.3s OK con las 667 deps). Pero después intentó detectar Next.js leyendo el `package.json` del **Root Directory** (que estaba en `./` por default, importado antes de tener `apps/web/`). El `package.json` del workspace root NO contiene `next` — `next` vive en `apps/web/package.json`. Resultado: error y deploy fallido.

**Aprendizaje crítico:** declarar `framework: "nextjs"` en `vercel.json` **NO supera** esa validación. Vercel valida `next` en el `package.json` del Root Directory **antes** de leer `vercel.json` para framework override. La solución canónica para monorepos es **Root Directory = `apps/web`** en Vercel UI.

**Acciones:**

1. **Operadora cambió Root Directory a `apps/web`** en Vercel UI (Settings → General → Root Directory). Disparó re-deploy automático.
2. **Claude simplificó `vercel.json` del repo** a solo `ignoreCommand`. Eliminados `framework`, `buildCommand`, `installCommand`, `outputDirectory` — Vercel los auto-detecta correctamente cuando Root Directory apunta a `apps/web/`. El `ignoreCommand` se queda porque se ejecuta desde la raíz del repo (no del Root Directory) y necesitamos paths relativos al repo entero para skip-docs-only.
3. **`OPERATIONS.md` actualizado:** sección "vercel.json del repo" reescrita para reflejar la versión minimal + nueva subsección "Configuración requerida en Vercel UI" listando Root Directory y otros settings auto-detect. Nota explicativa del aprendizaje incluida.

**Validación pendiente:** próximo push debe disparar deploy que sirva la home Lucams en HTTP 200 + `/api/health` con JSON correcto.

### 2026-05-09 — Operadora actualiza .env.local + state dir movido a workspaces (sesión 11)

**Hechos:**

1. **Operadora reemplazó `[YOUR-PASSWORD]` en `.env.local`.** Verificado por `make env-check`: las 6 vars críticas ahora están loaded sin placeholder (`DATABASE_URL` 124 chars, `DIRECT_URL` 109 chars). Esto desbloquea Prisma para Fase 1 schema.

2. **State dir movido de `/tmp/lucams-shop-local/` a `/home/ansible/workspaces/lucams-shop-local/`.** Razón de la operadora: `/tmp/` se puede borrar por antigüedad o reboot de la VM, perdiendo histórico de logs entre sesiones. La nueva ubicación es:
   - Paralela al repo (no adentro) → no contamina el árbol git ni requiere gitignore.
   - Persistente entre reinicios → histórico de logs accesible para debug "qué pasó hace 3 días".
   - Coherente con la convención del workspace de la operadora (todo en `/home/ansible/workspaces/`).

3. **`STATE_DIR ?= /home/ansible/workspaces/lucams-shop-local`** ahora es el default del Makefile. Smoke test post-move verde: `make help`, `env-check`, `health` desde la nueva ubicación funcionan idénticamente.

4. **OPERATIONS.md y STATE.md** actualizados — todas las menciones a `/tmp/lucams-shop-local/` reemplazadas por la nueva ruta.

### 2026-05-09 — Compatibilidad local↔Vercel + Makefile orquestador (sesión 10)

**Operadora pidió:** (1) validar que el entorno local sea compatible con Vercel dado que la VM es ambiente de desarrollo; (2) crear un `Makefile` + sistema de logs en `/home/ansible/workspaces/lucams-shop-local/` siguiendo el patrón de `/tmp/commerce-ops-local/`.

**Hechos:**

1. **Vercel CLI 53.3.1 instalado** globalmente (`sudo npm install -g vercel`). No se hizo `vercel link` interactivo — la operadora puede hacerlo después si quiere `vercel pull`. Para validación documental no fue necesario.

2. **Hallazgo crítico de paridad:** Vercel está deployando desde la raíz del repo (donde el `package.json` es del workspace, no de Next.js) → todos los deploys post-push devuelven HTTP 404 con `x-vercel-error: NOT_FOUND`. **Solución implementada:** `vercel.json` en la raíz del repo declarando explícitamente:
   - `framework: "nextjs"` (forzar)
   - `buildCommand: "pnpm --filter web build"`
   - `installCommand: "pnpm install --frozen-lockfile"`
   - `outputDirectory: "apps/web/.next"`
   - `ignoreCommand` que skipea deploy cuando solo cambian docs

3. **Makefile creado en `/home/ansible/workspaces/lucams-shop-local/Makefile`** con comandos espejo del runtime de Vercel:
   - **Stack:** `make up`, `down`, `restart`, `status`, `logs SERVICE=web`, `clean`.
   - **Quality gates:** `make build`, `typecheck`, `lint`, `format`.
   - **Validación local↔cloud:** `make env-check` (lista vars sin exponer valores, detecta placeholders), `make health` (healthchecks Supabase Auth + REST + web local), `make vercel-parity` (reproduce el build EXACTO de Vercel).
   - Patrón heredado del otro proyecto: `nohup` + PID files + log redirection + healthcheck por `kill -0`.
   - Make instalado en la VM con `sudo dnf install -y make`.

4. **Smoke test del Makefile completo verde:** `up`, `status` (RUNNING + PID), `health` (3/3 checks 200), `down`, `vercel-parity` (build limpio, BUILD_ID generado), `env-check` (detecta correctamente vars cargadas vs placeholders).

5. **Hallazgo CRÍTICO descubierto por `make env-check`:** en `.env.local` los campos `DATABASE_URL` y `DIRECT_URL` **siguen con `[YOUR-PASSWORD]` literal** — la operadora copió las connection strings de Supabase Dashboard pero no reemplazó el placeholder con la database password real. **No bloquea hoy** (el código actual no toca DB) **pero bloqueará Fase 1 schema** cuando Prisma intente conectar. **Acción de la operadora**: reemplazar `[YOUR-PASSWORD]` en ambas líneas de `.env.local` con la password generada al crear el proyecto Supabase.

6. **Gap pendiente para Vercel** (no bloqueante para deploy actual del Hello World, sí para Fase 1 con Supabase):
   - Las env vars del proyecto NO están en Vercel UI todavía. Antes del próximo deploy con código que use Supabase, la operadora debe ir a Vercel Dashboard → Settings → Environment Variables y copiar las 11 variables de `.env.local` para los 3 entornos (Production, Preview, Development), marcando como Encrypted las que son secretas.

**Documentación añadida:**

- `OPERATIONS.md` § "Compatibilidad local ↔ Vercel" — matriz de paridad + lista de env vars a sincronizar + descripción del `vercel.json`.
- `OPERATIONS.md` § "Entorno local con Make (símil-Vercel)" — comandos disponibles, convenciones, cuándo usarlo.

### 2026-05-09 — Fase 1 scaffolding inicial (sesión 9)

**Modo autonomía:** la operadora pidió que actuara con más autonomía dentro de los permisos `Bash(*)` de la VM dedicada (mandato #10). Procedí con bloques digeribles + commits frecuentes + pausa solo en decisiones destructivas.

**Hechos:**

- **Tooling instalado:** Node.js 22.22.2 (NodeSource RPM en Oracle Linux 9.7) + pnpm 11.0.9 (vía corepack) + npm 10.9.7.
- **Monorepo inicializado:** `pnpm-workspace.yaml` con `apps/*` y `packages/*`. `package.json` root con scripts compartidos (`dev`, `build`, `lint`, `typecheck`, `format`). `engines` y `packageManager` declarados.
- **`apps/web` creado:** `pnpm create next-app@latest --typescript --tailwind --eslint --app --no-src-dir --import-alias "@/*" --use-pnpm --turbopack`. Llegó **Next.js 16.2.6** (no 15.x como decían los docs originales — actualizamos).
- **Hallazgo crítico:** Next.js 16 trae breaking changes vs 15. La advertencia oficial `apps/web/AGENTS.md` lo señala explícitamente: _"This is NOT the Next.js you know."_ Leí `node_modules/next/dist/docs/01-app/02-guides/upgrading/version-16.md` y documenté los cambios que afectan nuestra arquitectura (saga, middleware, async APIs, themeColor, revalidateTag, images config) en **ADR-024**.
- **shadcn/ui v4 instalado:** `pnpm dlx shadcn@latest init --defaults --no-monorepo --base radix`. Style `radix-nova` (la evolución del antiguo "new-york" — actualizamos ADR-021 para reflejar el nombre real). Dependencias: `class-variance-authority`, `clsx`, `lucide-react`, `radix-ui`, `tailwind-merge`, `tw-animate-css`.
- **Branding aplicado en código:**
  - `lib/utils.ts` con `cn()` helper.
  - `app/globals.css` reemplazado: `@theme inline` con paleta brand Lucams (morado/turquesa/coral/rosa/amarillo/cream) + tokens semánticos shadcn mapeados a la paleta + `--font-display: Fredoka` y `--font-body: Inter` + radii kawaii (12px) + estilos base con `prefers-reduced-motion`.
  - `app/layout.tsx`: `lang="es-CO"`, fuentes vía `next/font/google` con `display: swap`, metadata + viewport export separados (Next 16 breaking change), título y descripción Lucams.
  - `app/page.tsx`: home placeholder con mascota mapache 🦝, paleta brand visible, propuesta de valor, link a Instagram. Reemplaza la default Next welcome.
  - Assets default removidos (`next.svg`, `vercel.svg`, etc.).
- **Quality gates pasando:**
  - Typecheck: ✅ sin errores.
  - Lint (ESLint flat config): ✅ sin errores.
  - Build de producción: ✅ 4.6s con Turbopack, 4 páginas estáticas pre-renderizadas, **sin warnings** tras mover `themeColor` a `viewport` export.
  - Dev server: arranca en ~500ms con Turbopack default.
- **Prettier:** instalado en root con `prettier-plugin-tailwindcss`. `.prettierrc.json` y `.prettierignore` configurados. Scripts `format` y `format:check` ya estaban en root `package.json`.
- **pnpm build approvals:** `sharp` (next/image), `unrs-resolver` (tailwind/eslint), `msw` (testing) aprobados explícitamente vía `pnpm-workspace.yaml` `allowBuilds`.

**Documentación actualizada:**

- ADR-024 nuevo en `DECISIONS.md` documentando Next.js 16 + breaking changes que adoptamos.
- ARCHITECTURE.md: tabla de versiones actualizada (Next.js 15.x → 16.x).
- CLAUDE.md mandato #3: stack actualizado con Next.js 16 + style `radix-nova` + advertencia sobre breaking changes.

**Lo que NO hicimos en este bloque (Fase 1 continúa):**

- Prisma + `packages/db` schema (siguiente).
- RLS policies + tests automáticos.
- Auth Supabase (registro, login, recuperación).
- Patrones cross-cutting (`lib/errors.ts`, `lib/rate-limit.ts`, `lib/cache.ts`, `lib/queue.ts`, `lib/logger.ts`, `lib/idempotency.ts`, `lib/circuit-breaker.ts`, etc. per CONVENTIONS.md).
- Healthchecks `/api/health/*`.
- Header + Footer + WhatsApp FAB.
- CI GitHub Actions (typecheck + lint + tests + secret scanning).
- Cloudflare + Turnstile (cuenta a crear cuando lleguemos a signup form).

### 2026-05-09 — Cierre Fase 0b con re-scope (sesión 8)

**Decisión de la operadora:** cerrar Fase 0b con las 4 cuentas críticas (GitHub, Supabase, Vercel, Resend) y diferir Cloudflare/Anthropic/Venndelo a sus fases respectivas. Razón pragmática: ninguna de las 4 postergadas bloquea Fase 1, y mantener cuentas "frías" no usadas suma surface area sin beneficio.

**Lo creado y validado en esta tanda:**

- **Vercel Hobby** (`lucams-shop.vercel.app`): conectado a GitHub `jullieth93/lucams`, primer deploy exitoso con HTTP 404 esperado (no hay código aún), webhook GitHub→Vercel funcionando.
- **Resend Free**: API key con scope "Sending access" (least privilege), validada con `restricted_api_key` error code (confirma key válida + scoped). Dominio default `resend.dev`.

**Incidente de seguridad #2 durante esta tanda:** al diagnosticar un 401 de Resend (que era esperado por el scope, no por key inválida), Claude usó `cat -A .env.local` con regex de redacción `[A-Za-z0-9]+` que NO incluía underscore. La key real quedó parcialmente visible en transcript. Resuelto: rotación + revocación + actualización de memoria con anti-patrones específicos (no usar `cat`, no combinar prefix+suffix, no redacciones parciales).

**Documentación actualizada:**

- `ROADMAP.md` Fase 0b marcada 🟢 con re-scope explícito documentado.
- `STATE.md` resumen actual y próximo paso ahora apuntan a Fase 1.
- `feedback_never_read_env_files.md` ampliada con sección "Anti-patrones específicos" (cat, regex incompletas, prefix+suffix combinados).

### 2026-05-09 — Setup proyecto Supabase + extensiones + connection test (sesión 7)

**Hechos:**

- Proyecto Supabase creado: `zxkucphbsfygakgxcnik.supabase.co`, region `sa-east-1` (São Paulo), Postgres standard (NO OrioleDB Alpha), GitHub linked a `jullieth93/lucams`, Auto-RLS ON, Auto-expose tables OFF, Data API ON.
- Las 5 vars de Supabase copiadas a `.env.local` (ignorado por git): URL + Publishable + Secret + DATABASE_URL pooled (6543) + DIRECT_URL direct (5432).
- 4 extensiones habilitadas vía dashboard: `pgmq`, `pg_cron`, `pgcrypto`, `pg_stat_statements`. **Cierra el último pendiente práctico de la cola de verificación.** Confirma que ADR-016 y ADR-017 son ejecutables en plan Free.
- Connection test ejecutado sin exponer credenciales (`set -a; source .env.local; set +a; curl`). Resultados:
  - Auth health, Auth settings, Storage list: HTTP 200 con publishable key.
  - REST root con secret key: HTTP 200.
  - **Hallazgo nuevo:** REST root `/rest/v1/` con publishable da HTTP 401 con mensaje _"Only secret API keys can be used for this endpoint"_ — comportamiento nuevo del sistema publishable/secret. La introspección OpenAPI del schema ahora requiere secret. Es **mejor postura de seguridad** (la publishable no puede leak schema completo). Documentado en `INTEGRATIONS.md` § Supabase.

**Bug en `.env.example` corregido:** `EMAIL_FROM=Lucams_shop <onboarding@resend.dev>` rompía bash `source` por los `<`/`>`. Corregido a `EMAIL_FROM="Lucams_shop <onboarding@resend.dev>"` (con quotes) en `.env.example` y `.env.local`.

**Var rename:** `DIRECT_DATABASE_URL` → `DIRECT_URL` (convención oficial Supabase+Prisma per [supabase.com/docs/guides/database/prisma](https://supabase.com/docs/guides/database/prisma)). Aplicado a `.env.example`, `.env.local` (vía `sed`, sin leer contenido para no exponer secretos), `docs/OPERATIONS.md`, `docs/INTEGRATIONS.md`, `docs/ARCHITECTURE.md`.

**⚠️ Incidente de seguridad — leak de secret key:**

- Mientras hacía un Edit a `.env.local`, la herramienta Edit exigió Read previo. Al hacer `Read .env.local`, la `SUPABASE_SECRET_KEY` real (`sb_secret_REDACTED`) entró a mi contexto y por lo tanto al transcript del chat.
- Severidad real: P0 según runbook IRP-001. Severidad práctica: baja (DB vacía, dev environment, no producción).
- Operadora decidió no rotar inmediatamente — queda como **deuda crítica obligatoria antes de cerrar la sesión**.
- Aprendizaje guardado en memory `feedback_never_read_env_files.md`: **nunca usar Read/Edit/Write sobre `.env*`**. Solo `sed` via Bash, que modifica in-place sin exponer contenido. Inspeccionar nombres de vars con `grep`/`cut`. Cargar valores en subshell con `set -a; source; set +a` para que vivan en el subprocess y no en mi contexto.

### 2026-05-09 — Migración a publishable/secret keys de Supabase (sesión 6)

**Hallazgo del operador (Lucy):** al copiar credenciales del dashboard Supabase a `.env.local`, observó que las API keys ya no se llaman `anon` y `service_role` sino **Publishable** y **Secret**.

**Verificación contra docs oficiales** ([supabase.com/docs/guides/api/api-keys](https://supabase.com/docs/guides/api/api-keys), [Supabase Discussion #29260](https://github.com/orgs/supabase/discussions/29260)):

- Las legacy `anon`/`service_role` (formato JWT) están siendo reemplazadas por `sb_publishable_*` y `sb_secret_*` (token strings con prefijo).
- Cita textual crítica: _"Projects restored from 1st November 2025 will no longer be restored with the legacy API keys. **New projects no longer have anon and service_role available for use.**"_
- Nuestro proyecto se creó hoy (2026-05-09) → solo tiene las nuevas keys.
- Mapeo de seguridad idéntico: publishable → rol Postgres `anon`, secret → rol Postgres `service_role`. Drop-in replacement.
- Ventaja del nuevo sistema: múltiples secret keys revocables (rotación sin downtime).

**Cambios aplicados:**

- `.env.example` y `.env.local`: `NEXT_PUBLIC_SUPABASE_ANON_KEY` → `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`; `SUPABASE_SERVICE_ROLE_KEY` → `SUPABASE_SECRET_KEY` (editado por el operador).
- `docs/OPERATIONS.md`: bloque env vars + política de rotación actualizada.
- `docs/SECURITY.md`: inventario de claves, runbook IRP-001 (con nuevo paso "revocar la key vieja explícitamente"), threat model, clasificación de datos.
- `docs/INTEGRATIONS.md`: nota explicativa al inicio de la sección Supabase con cita oficial; bloque env vars; snippets de `lib/supabase/{browser,server,service}.ts`.
- `docs/ARCHITECTURE.md`: comentarios en estructura de carpetas; sección RLS aclarando equivalencia publishable→`anon`, secret→`service_role`.
- `docs/PLAN.md`: 2 menciones puntuales en sección de seguridad y reglas.

**Decisión operativa:** Las menciones a "rol `anon`" y "rol `service_role`" en docs (cuando refieren al rol Postgres y no al nombre de la key) **se mantienen** — los roles no cambiaron, solo cambió el formato de las API keys que activan cada rol.

### 2026-05-09 — Verificaciones de tiers Free (sesión 5)

Cola de verificación pendiente cerrada para los 6 servicios externos críticos. Resultados documentados en `OPERATIONS.md § Verificación de tiers Free contra docs oficiales` con cita y URL por cada cifra.

**Hallazgo crítico:** Vercel Hobby ToS **prohíbe explícitamente uso comercial** — _"You shall only use the Services under a Hobby plan for your personal or non-commercial use."_ Implica que el upgrade a Vercel Pro al primer pago real es **obligación contractual**, no preferencia de capacidad. Ya estaba planeado en Fase 7; queda confirmado como bloqueante.

**Resumen de cifras clave verificadas:**

- Vercel Hobby: 60s function timeout, 100 GB bandwidth, 1M invocations, 1h log retention, ToS no comercial.
- Supabase Free: 500 MB DB + 1 GB storage + 50k MAU + 500k Edge Function invocations + pausa a 1 semana + 2 proyectos máx.
- Resend Free: 3k/mes + 100/día + 1 dominio + 30 días retención.
- Anthropic Sonnet 4.6: $3 input / $15 output por MTok, 1M context, 64k max output. Costo estimado por sugerencia IA: ~$0.006 USD.
- Cloudflare R2 Free: 10 GB + 1M Class A + 10M Class B + **egress gratis**.
- Cloudflare Turnstile Free: 1M siteverify/mes/sitio + 20 widgets/cuenta.

**Único pendiente práctico:** confirmar `pgmq` y `pg_cron` disponibles en Supabase Free al crear el proyecto real (Fase 0b). Si estuvieran restringidos, replanteamos ADR-017.

### 2026-05-09 — Cierre de ADRs pendientes (sesión 4) + commit inicial

**ADRs cerrados con input del usuario:**

- **ADR-020 — Estrategia legal:** Lucams redacta plantillas con base en COMPLIANCE.md + abogado colombiano especialista en consumo/comercio digital revisa antes de Fase 7. Costo estimado ~$300–600 USD, 2–4 semanas. Bloqueante para lanzamiento.
- **ADR-021 — Tipografías:** **Fredoka** (display) + **Inter** (body). Ambas Google Fonts, vía `next/font/google` con `display: swap`. Definidas en `globals.css` `@theme` desde Fase 1.
- **ADR-026 — Feature flags:** tabla `FeatureFlag` en Postgres + helper `lib/feature-flags.ts` con cache 60s. Sin vendor externo (mismo principio que ADR-016). Criterios de migración futura a GrowthBook documentados.

**Commit hygiene:**

- Configurado `git config --local user.name "Lucy Hurtado" --local user.email "r.julliethhr@gmail.com"`.
- `.claude/` agregado a `.gitignore` (settings.json es personal, no se comparte).
- Branch `develop` se mantiene como rama de trabajo. Se renombra a `main` al crear el repo en GitHub (Fase 0b).
- **Commit `9a2c826`** ejecutado: 21 files, 8.854 inserciones, 8 borrados. Conventional Commits style. Sin Co-Authored-By per preferencia del operador.

**Estado de ADRs:**

- 22 ADRs cerrados (001 a 021, 026).
- 6 ADRs todavía abiertos: 022 (monitoreo errores, Fase 7), 023 (Redis trigger, futuro), 024 (OpenTelemetry, futuro), 025 (DIAN provider, antes de Fase 7), 027 (staging, post-lanzamiento), 028 (GrowthBook trigger, futuro).

### 2026-05-09 — Análisis competitivo + catálogo seed (sesión 3)

Reconocimiento real de magneticas.cl ejecutado: home + sitemap.xml + 6 categorías (packs fotos, recuerdos, calendarios, organización, publicitarios, juegos, decoración, coleccionables) + FAQ + política de devolución. Creados [`docs/CATALOG_SEED.md`](CATALOG_SEED.md) (37 productos paritarios + 6 productos NUEVOS exclusivos Lucams + 11 descartados con motivo legal/cultural) y [`docs/COMPETITIVE_ANALYSIS.md`](COMPETITIVE_ANALYSIS.md) (visión general del competidor, lo que copiamos, lo que mejoramos, riesgos legales detectados, gaps de UX). Categorías Lucams definidas (8): foto-imanes, recorditos-eventos, organizate, calendarios, pequenes, decora-espacio, regalos-corazon, mayorista. Política firme: **no replicar productos con marcas registradas no licenciadas** (Snoopy/Disney/Harry Potter/Coca-Cola/Spotify/Bad Bunny/Katy Perry/Hannah Montana — descartados con motivo en el doc).

### 2026-05-09 — Auditoría productive readiness (sesión 2)

Tras feedback del usuario reframeando "esto no es ambicioso, es el piso para productivo", se ejecutó segunda auditoría con 43 hallazgos. Creados 4 docs nuevos (CONVENTIONS, OBSERVABILITY, COMPLIANCE, TESTING). Expandidos 5 docs existentes (SECURITY con STRIDE+IRP, ARCHITECTURE referenciando convenciones, INTEGRATIONS con DIAN+resiliencia, OPERATIONS con DevOps+DR, ROADMAP con tareas por fase). Compliance colombiano operativizado (Ley 1581 con tabla `Consent`, Ley 1480 con `RetractRequest` y exclusión por personalización, DIAN con `InvoiceProvider` adapter). Threat model STRIDE por flujo crítico. IRP con 4 runbooks concretos. SLOs cuantitativos definidos. DR drills cuatrimestrales programados.

### 2026-05-09 — Endurecimiento productivo + auditoría inicial

**Sesión completa con tres bloques:**

1. **Carga de contexto** (lectura completa de los 7 docs + README + CLAUDE.md).
2. **Auditoría de coherencia** (21 hallazgos, 6 ADRs nuevos, fuentes verificadas con WebFetch).
3. **Endurecimiento productivo:**
   - Creación de `docs/SECURITY.md` con cobertura completa (autenticación, autorización, RLS, CORS, headers, rate limit, secrets, validación, RBAC, CSP, CSRF, TTLs, file upload, audit logs, PII/Habeas Data, dependency scanning, webhook security).
   - `.gitignore` y `.env.example` listos.
   - Sección "Entorno de desarrollo" en OPERATIONS.md con setup local símil-Vercel (logs, env, Supabase local, healthchecks).

**Salida:** documentación lista para arrancar Fase 0b sin sorpresas.

### 2026-05-09 — Creación inicial de la documentación (Fase 0a)

Antes de esta sesión, ya existían los 7 docs base + CLAUDE.md + README.md. Estado al inicio de la sesión actual: documentos completos pero con inconsistencias internas, referencias obsoletas a tecnologías y suposiciones técnicas sin verificar.
