# HANDOFF — Ronda 3: modelo multi-unidad + ajustes IG/tiras (2026-09-09)

> Estado al cerrar la sesión. Este archivo vive en la rama `wip/multi-unidad-ola26-27`.
> `develop` quedó limpio en `9523cf2` (CI verde, desplegado en STG).

## CIERRE (2026-09-11) — la ola ya está en STG ✅

- Merge a `develop` vía PR #42 (`3cbeba8`), CI verde en PR y en develop. STG
  desplegado con el código nuevo.
- El E2E pendiente cazó 4 fallas: 3 de specs desactualizados (locator "Tira N
  de 2" ambiguo pager/heading + lazy-mount >6 slots, copy viejo de la modal,
  orden borde/colores en letter sets — el owner confirmó 2026-09-11 mantener
  el orden NUEVO también en abecedario/vocales) y 1 falla REAL de producto:
  **el precio multi-unidad se duplicaba** (el finalize espeja
  `metadata.unitCount` en todo V2 y `letterSetUnitCount` lo volvía a aplicar:
  tira ×2 se cobraba ×4) → gate `surface === "letterset"` en
  `design-units.ts` + regresiones. Además `/carrito` no mostraba el resumen
  de pieza ("2 tiras de 3 fotos") que documentaba la Ola 27 → se renderiza
  `pieceSummary` como ya hacía el checkout.
- "Aplicar este diseño a todas" existe y funciona (store + headers de sección
  - tarjetas de separadores + modal de slot para imán suelto + pager de sets).
- Verificación visual local de los 4 puntos del owner: capturas en
  `tmp/visual-ola26/` (checkerboard, IG blanca/negra con hashtags azules,
  bloqueo de «Vista previa», tira 4×2, Nombre con borde encima de colores).
- Operativa STG hecha: `migrate-cms-v2` (23 keys nuevas) + `seed-templates`
  (photo-strip-4-fotos activa) + caché CMS invalidada desde /admin/contenido
  (admin efímero E2E). Smoke en STG: tira 4 fotos × 2 unidades abre "Tira 1
  de 2" / "Tira 2 de 2" con 4 celdas por sección ✓.
- **Pendiente:** validación del owner en STG → con OK, merge
  `develop`→`production` y los MISMOS dos scripts contra PRD (son upserts; el
  env-guard solo exige `LUCAMS_ALLOW_DESTRUCTIVE_REMOTE=1` para destructivos).
  Recordatorio owner: precios de variantes "Sin imán" en STG están espejo.

## RONDA 4 (Ola 28, 2026-09-11) — también en STG ✅ (PR #43 → develop `469fe66`)

La validación del owner sobre la Ola 26/27 trajo 4 ajustes (su mensaje verbatim:
1.2.1.A persiste texto invisible · 1.2.2.A "no se ve texto preview, se ve vacío"
· 1.3.A sobra el stepper de fotos en el lienzo, poner «Unidades» · 1.7 "Toca una
letra" activo con Sin borde). Detalle de implementación: README del estudio,
sección "Ola 28". Resumen:

- **1.2.1.A**: el preview de la pestaña Texto pinta el fondo del color EFECTIVO
  de la tarjeta (`cardBackgroundHex`, helper compartido en frame-palette — el
  `borderColor` null de la Clásica era la trampa) + cuadrícula de transparencia
  y aviso CMS cuando la letra casi no contrasta (`lib/contrast.ts`, WCAG < 1.2).
- **1.2.2.A**: excepción IG a Ola 25 — los textos por defecto SE VEN (color por
  capa intacto: oscuros/claros según tarjeta, hashtags siempre azules).
  `renderText(showTemplateDefault)` — el bloqueo de textos requeridos (Ola 26)
  sigue impidiendo finalizar con placeholders; "362 me gusta" imprime su default.
- **1.3.A**: banner del Estudio de tiras pasa a stepper «Unidades»
  (`StudioUnitCountControl` + `store.setUnitCount`); la composición se elige en
  la PDP. Keys CMS `estudio.lienzo.unidades-*`.
- **1.7**: con «Sin borde» se apaga el pintado ficha a ficha (hint oculto,
  fichas disabled, fila de colores oculta) en name-editor y letter-set-editor.
- Validación: vitest 3615 ✓ · E2E 4 specs desktop+mobile 39 ✓ · capturas
  `tmp/visual-ola28/` · CI PR y develop verdes.
- STG: deploy verificado en vivo (marcador sin-borde) + `migrate-cms-v2` (8 keys
  nuevas, 1008 campos BLOCK) + caché CMS invalidada + smoke (IG blanca con
  tinta oscura + hashtags azules medidos por píxel; banner «Unidades» con
  "2 unidades" y sin stepper de fotos).
- **Pendiente:** validación del owner en STG → PRD (`develop`→`production` +
  `migrate-cms-v2` contra PRD; no hubo cambios de plantillas).

## RONDA 5 (Ola 29, 2026-09-11) — también en STG ✅ (PR #44 → develop `568d23a`)

Dos ajustes del owner (verbatim: 1.2.1.A "el lienzo tenga los textos de un color
que visualmente se vea — blanco→negro, rosado→blanco" · 1.3.A "grilla de 2 o 3
máximo horizontal; 4 unidades → 3+1"). Detalle: README del estudio, "Ola 29".

- **1.2.1.A**: `defaultTextFillOnCard` (frame-palette; umbral Rec.601 0.56 —
  `isDarkColor` 0.5 INTACTA porque también decide la tarjeta binaria IG).
  Misma regla en lienzo + producción + editor de texto (`textDefaultFills` por
  capa: el form arranca con el default del lienzo; sin tocar la paleta no se
  guarda override). El override de color del cliente siempre manda.
- **1.3.A**: secciones de tira en grilla horizontal 2-3 por fila con wrap
  (`unitSectionsPerRowFor`; umbral 900px del CONTENEDOR porque el Estudio
  desktop resta la barra lateral — 1280 de viewport ≈ 944 de lienzo). Mobile/
  tableta: 2 por fila. Calendarios/separadores intactos.
- Specs preexistentes reparados al pasar: `estudio.spec` (la sidebar es
  solo-desktop por diseño — la aserción nunca aplicó a mobile),
  `studio-gestures` mobile (el setup subía sin consentimiento Ley 1581 con el
  Sheet cerrado → upload rechazado; queda desktop-only documentado),
  lazy-mount de tiras con secciones en fila (ambas montan al abrir).
- Validación: vitest 3626 ✓ · E2E 6 specs desktop+mobile 48 ✓ · capturas
  `tmp/visual-ola29/` · CI PR y develop verdes · smoke STG: y de secciones
  [505,505,505,1275] = 3+1 ✓.
- Sin keys CMS ni plantillas nuevas → STG solo necesitó el deploy.
- **Pendiente:** validación del owner en STG → PRD (`develop`→`production`;
  sin seeds esta ronda).

## RELEASE A PRD (2026-09-11, owner: "Haz merge") ✅

- `production` fast-forward `f88aeef` → `f35ab29` (Ola 26/27/28/29 completas),
  CI verde en `production` y `develop`. PRD en vivo en lucamsshop.com:
  grilla de tiras 3+1 medida en DOM (y=[505,505,505,1275]) y el bug original
  del owner (tira 4 fotos sin lienzo) verificado cerrado: 2 secciones × 4
  celdas en una columna ✓.
- Seeds PRD: `migrate-cms-v2` (54 keys creadas — PRD venía atrás de Ola
  26/27/28; 1008 campos BLOCK, sin anomalías) + `seed-templates` (14 activas;
  `photo-strip-4-fotos` activa ✓). Env usado: `.env.local.nube-backup` (el de
  la nube PRD; ambos scripts son upserts, sin env-guard).
- Ramas normalizadas: `wip/multi-unidad-ola26-27`, `wip/ola28-validacion-owner`
  y `wip/ola29-validacion-owner` (ya mergeadas por PR #42/43/44) borradas en
  local y remoto. Quedan `develop`, `production`, `catalogo-whatsapp` (rama
  viva), `master` (legacy) y las de dependabot.
- **Recordatorio (formalidad, no bloquea):** invalidar el caché CMS en PRD
  desde /admin/contenido («Actualizar caché de contenido»). Las 54 keys nuevas
  sirven YA con su texto por defecto (idéntico al sembrado) porque el migrate
  solo CREA campos faltantes y nunca pisa los existentes — el clic deja la DB
  como fuente visible. En STG sí se invalidó (admin efímero E2E); en PRD no se
  pueden crear usuarios efímeros (env-guard), así que es clic manual del owner.
- Recordatorio owner (sigue vigente): precios de variantes "Sin imán" en STG
  están espejo — ajustarlas en el admin cuando aplique.

## Cómo retomar

Todo está en `develop` y `production` (misma punta tras el release
`f35ab29`). Para trabajo nuevo: rama `wip/...` desde `develop` → PR → CI →
merge (despliega STG) → validación owner → release ff a `production`.

## Contexto del alcance (aprobado por el owner en esta sesión)

1. **Modelo multi-unidad diseñable (Ola 27, el cambio grande):** "Unidades" = N
   unidades del producto, CADA UNA diseñable en el Estudio. Desaparece el
   concepto "copias idénticas". Con atajo "Aplicar este diseño a todas".
   Vista previa/carrito/producción muestran/renderizan las N unidades.
2. Polaroid IG: textos oscuros con tarjeta blanca / claros con negra;
   hashtags (#mirecuerdo #lucamsshop) SIEMPRE azules (WYSIWYG).
3. Polaroid IG: TODOS los textos obligatorios para finalizar (usuario,
   ubicación, título, hashtags; "362 me gusta" decorativo).
4. Polaroid Clásica: cuadrícula (checkerboard) MÁS visible ("muy leve").
5. Bug: tira de 4 fotos no mostraba lienzo en el estudio.
6. Nombre Personalizado: "Borde de las fichas" ENCIMA de "Elige los colores".

## Estado del código (verificado al cerrar)

- `pnpm --filter web typecheck` ✓ · `lint` ✓ · **vitest completo: 224 archivos,
  3588 tests ✓** (8 skipped live-probes habituales).
- Los detalles de implementación están en `apps/web/app/estudio/[slug]/README.md`
  (secciones "Ola 26" y "Ola 27") y en el docblock de
  `apps/web/features/personalization/design-units.ts` (modelo de datos:
  `unitCount?`/`unitSlots?` aditivos en canvasData V2, invariante
  `slotCount = unitCount × unitSlots`, multiplicador de precio derivado en
  servidor — nunca confía en el cliente).

### Lo que YA está implementado (según README/diffs y tests verdes)

- Ola 26: colores de texto por capa en IG (hashtags azules), textos IG
  requeridos para finalizar (bloqueo de «Vista previa» con mensaje),
  checkerboard reforzado, orden borde/colores en name-editor, fix tira 4 fotos
  (su unitTemplate nació en el one-off `ola18b-cuadrados-tiras-fix.mjs` y no
  estaba en `seed-templates.mjs` — ahora sí, ojo al correr seeds).
- Ola 27 (multi-unidad): esquema canvasData aditivo + helpers
  (`design-units.ts`, tests), precio derivado en servidor, PDP `?copies=N`
  reinterpretado como "N unidades a diseñar", store del estudio con unidades,
  navegación por unidad en el grid, modal Vista previa con todas las unidades,
  producción/cart/service/spec extendidos.

### Lo que FALTA verificar/terminar (no confirmado al cierre)

1. **E2E y verificación VISUAL en :4000** de ambos frentes (los agentes se
   cortaron por tiempo antes de reportar). Correr: `make web-start` y luego
   `apps/web/tests/e2e`: `pdp-cantidad-tira`, `pdp-unidades`,
   `estudio-studio-ux`, `estudio-letterset`. En particular validar a mano:
   tira 4 fotos con 2 unidades en el estudio, IG con tarjeta blanca/negra,
   bloqueo de finalizar con textos vacíos, checkerboard.
2. **"Aplicar este diseño a todas"**: confirmar que el atajo existe y funciona
   (si no está, es el primer pendiente de código).
3. **Letter sets (abecedario/vocales) y Nombre** bajo el modelo multi-unidad:
   era la parte de diseño más incierta — revisar el comportamiento por unidad
   (el README Ola 27 documenta lo decidido).
4. **Sweep final de comentarios** que aún hablen de "copias idénticas".
5. **CI de la rama** (corre al hacer push): debe quedar verde antes del merge.

## Trazabilidad del mensaje de validación del owner (2026-09-09, verbatim)

Cada punto de su último mensaje y dónde quedó:

| #           | Punto del owner                                                                                                                                                                  | Estado / dónde vive                                                                                                                                                       |
| ----------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1.2.1.A     | Clásica: preview blanca "ya se ve pero muy leve"                                                                                                                                 | Implementado (checkerboard reforzado, Ola 26) — falta verificación visual del owner                                                                                       |
| 1.2.2.A     | IG: tarjeta blanca → textos oscuros; negra → claros; #mirecuerdo #lucamsshop SIEMPRE azul                                                                                        | Implementado (color por capa, Ola 26 + instagram-template-spec) — falta verificación visual                                                                               |
| 1.2.2.B     | IG: "de cierta manera se obligue a tener esos textos" → respuesta del owner: **TODOS los textos obligatorios** (usuario, ubicación, título, hashtags; "362 me gusta" decorativo) | Implementado (bloqueo de «Vista previa» con campos faltantes, Ola 26)                                                                                                     |
| 1.3.A-1     | Tiras: 3 fotos con Unidades 2+ "no se reflejan los lienzos" → respuesta del owner: quiere **VER las N tiras, regla general: las N elementos a diseñar en el estudio**            | Es el modelo multi-unidad (Ola 27): N unidades diseñables con atajo "aplicar a todas"                                                                                     |
| 1.3.A-2     | Tiras: 4 fotos "ni siquiera aparece lienzo"                                                                                                                                      | Bug corregido (plantilla 4 fotos añadida a `seed-templates.mjs`; nació en one-off `ola18b-cuadrados-tiras-fix.mjs`) — **requiere correr `seed-templates.mjs` en STG/PRD** |
| 1.7         | Nombre: "Borde de las fichas" ENCIMA de "Elige los colores"                                                                                                                      | Implementado (reorden en name-editor, Ola 26)                                                                                                                             |
| PDTA        | Error `make` al reiniciar local (`EADDRINUSE :4000`)                                                                                                                             | Resuelto en sesión: era un `next dev` de pruebas ocupando el puerto; se liberó. Si recurre, `make web-stop` en el repo principal                                          |
| Transversal | "Todo alineado entre admin y cliente"                                                                                                                                            | Los textos nuevos van por CMS (keys en cms-site-map.mjs); prediseñados admin→/admin/disenos ya alineado                                                                   |

Decisiones del owner tomadas vía preguntas en esta sesión (no volver a preguntar):

- IG obligatorios: **"Todos los textos"**.
- Tiras/unidades: **"Ver las N tiras… la regla debería ser en general, las N elementos a diseñar en el estudio"** → confirmado como **"N unidades diseñables"** (con atajo "aplicar este diseño a todas"), no copias idénticas ni solo-visual.

## Operativa pendiente tras el merge a develop

1. `pnpm --filter @lucams/db exec node scripts/migrate-cms-v2.mjs` con
   `.env.stg` (keys nuevas de Ola 26) — y luego en PRD.
2. `seed-templates.mjs` con `.env.stg` **y luego PRD** (la plantilla de tira 4
   fotos ahora está en el seed canónico).
3. Invalidar caché CMS desde `/admin/contenido` en STG.
4. Validación del owner en STG → con OK: merge `develop`→`production`,
   mismos seeds contra PRD (env-guard: PRD exige
   `LUCAMS_ALLOW_DESTRUCTIVE_REMOTE=1` solo para scripts destructivos;
   migrate-cms-v2 y seed-templates son upserts).
5. Recordatorio owner: precios de variantes "Sin imán" en STG están espejo;
   ajustarlas en el admin cuando aplique.

## Historial de la sesión (resumen)

- Rondas 1-2 de validación STG ya están en `develop` (`9523cf2`) y desplegadas.
- MFA de STG reseteado (break-glass) para r.julliethhr@gmail.com; el Site URL
  de Supabase STG debía configurarse en el dashboard (issuer del QR TOTP).
- Normalización de variantes por SKU aplicada en STG
  (`normalize-variant-pack-size.mjs`, idempotente, ya en develop).
- CI estabilizado: ratchet CMS, sharp 0.35.4, retry de playwright install.
