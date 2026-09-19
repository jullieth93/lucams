# Auditoría UX responsive — Estudios, Admin y avisos Vercel (2026-09-18)

> **Origen:** validación manual del owner en web / tablet / móvil de TODA la solución (capa
> cliente + capa admin), con dos instrucciones explícitas: ① la plantilla de referencia
> positiva es el estudio de **Separadores de Libros** (canvas distribuido al ancho de la
> pantalla + fondo que recubre el pack/unidad) y todos los estudios deben converger a ella;
> ② no limitarse a sus comentarios — auditar más allá. Más dos avisos de Vercel: INP alto
> en `main#contenido` (home) y CSP sin dominios de la Vercel Toolbar.
>
> **Estado:** ✅ **REMEDIADA y VALIDADA por el owner en STG** el 2026-09-18 (dos rondas en la
> misma iniciativa; la ronda 2 nace de la validación del owner sobre la ronda 1 — ver §E).
> Pendientes de consolidación: liberación a PRD y revisión RUM de INP en ~1 semana (§D).
> Decisiones en **ADR-103** y **ADR-104** (DECISIONS.md). Changelog técnico del estudio:
> "Olas 31-34" en `apps/web/app/estudio/[slug]/README.md`.

## A. Alcance y método

- **Capa cliente — Estudios** (`apps/web/app/estudio/[slug]/`): los 14 slugs con editor
  (fotoimanes ×4, glass, tiras, separadores ×2, calendario, planner, cuadro, nombre,
  abecedario, vocales) × 5 anchos (375/768/1024/1280/1920) — captura automatizada con
  medición objetiva de overflow horizontal (`documentElement.scrollWidth > clientWidth`).
- **Capa cliente — Storefront público:** home, catálogo, PDP, carrito, checkout, estudio
  × 4 anchos (audit e2e E3 generalizado).
- **Capa admin:** las 41 rutas de primer nivel de `lib/admin-nav.ts` × 4 anchos
  (375/768/1024/1280) con admin efímero + MFA (audit e2e nuevo).
- **Avisos Vercel:** CSP (`lib/security-headers.ts`) e INP (home).
- Evidencia de capturas: `tmp/responsive-audit/{baseline,after-canvas,after-editors-full,after-zoom}/`
  y `tmp/screenshots/{e3,responsive-admin}/` (gitignored, regenerable con los specs).

## B. Hallazgos (severidad descendente) y su remediación

### 🔴 B-1 — Overflow horizontal REAL en estudios a 768-1280px

**Evidencia:** `tmp/responsive-audit/baseline/summary.json` — 5/70 mediciones con overflow:
`set-fotoimanes-polaroid` @768 y @1024, `set-fotoimanes-cuadrados` @1024,
`calendario-mes-a-mes-fotos` @1024 y @1280.

**Causa raíz (doble, confirmada con sonda Playwright):**
1. **Loop de medición flex** — la `<section>` del lienzo (`studio-editor.tsx:1458`) era flex
   item con `min-width: auto`: se estiraba con su contenido; el ResizeObserver de
   `studio-canvas-grid.tsx:255-266` fijaba el ancho YA estirado (medido: sección 1342px y
   el aside encogido de 288 a 153px en ≥1024).
2. **Pisos de slot mayores que el ancho útil** — piso texto-editable 260px × 3 cols + gaps =
   812px > ~720px útiles @768; piso calendario 280px × 3 = 864px > ~656px útiles @1024
   (`studio-canvas-grid-size.ts:43-53`).

**Remediación:** `min-w-0` en la sección (fix estructural) + guarda `fitColsToFloor` (los
pisos nunca desbordan: se reducen columnas). Verificado: 0/70.

### 🔴 B-2 — Canvas de estudios no fluido (la queja central del owner)

**Evidencia:** el marco de 82vh (`studio-canvas-grid-size.ts:126-145`) achicaba los slots en
ventanas bajas hasta los pisos → grid diminuto con ancho explícito centrado
(`studio-canvas-grid.tsx:558-563`) — "muy pequeño a la pantalla". Cap de contenedor 1280px.

**Remediación (Ola 31):** grids multi-fila dimensionados por ANCHO (marco 82vh solo para
productos de 1 fila — el bug original de stages gigantes); `MAX_VIEWPORT_WIDTH` 1280→1600;
tarjeta-unidad con fondo (`bg-white/70`) en TODOS los modos: agrupado (ya la tenía), packs
de fotoimanes **incluido 1 solo pack** (antes exigía >1 pack → caía a plano sin tarjeta) y
modo plano. El rótulo "Pack 1" y el pager se omiten con un solo pack (ruido).

### 🟡 B-3 — Editores de Juegos y Aprendizaje fuera de la plantilla

**Evidencia:** `name-editor.tsx:484` y `letter-set-editor.tsx:612` — columna fija
`max-w-3xl` (768px) con chrome propio y fichas de tamaño fijo `h-[72px] w-[62px]`.

**Remediación (Ola 32):** ambos al lienzo fluido: header sticky unificado
(`studio-simple-header.tsx`, mismo idioma del StudioToolbar sin su store), cap compartido
`STUDIO_MAX_WIDTH=1600` (`studio-layout.ts`), dos columnas lg+ (controles w-80 + lienzo
fluido en tarjeta-unidad), lienzo primero en móvil, fichas fluidas por ResizeObserver
(clamp 44-120px) y grilla de sets 4/6/8/10/12/13 columnas.

### 🟡 B-4 — Chrome móvil del estudio foto: ~700px antes del canvas a 375px

**Evidencia:** `tmp/responsive-audit/baseline/set-fotoimanes-cuadrados-375.png` — stepper de
packs + hint, tarjeta de estilo con label partido en 3 líneas, y fila de pills apilados;
canvas bajo el fold.

**Remediación (Ola 32):** style toolbar en una línea con scroll horizontal en <sm (labels
`whitespace-nowrap`), pills en una fila con scroll, hint del stepper oculto en <sm. Chrome
~700→~390px: la tarjeta del canvas inicia dentro del primer viewport.

### 🟡 B-5 — Admin: tablas sin modo tarjetas en el rango tablet (640-1023px)

**Evidencia:** la transformación tabla→tarjetas solo activaba <640px
(`globals.css:462-538`); 5 tablas con `minWidth: 800` (inventario, costos, materiales,
reclamos, performance) quedaban con scroll interno a 768px.

**Remediación:** tarjetas en todo `<lg` (media query 639→1023px; pistas `sm:hidden`→
`lg:hidden` en `admin-page.tsx`). Semántica de tabla intacta (roles/aria). Desktop ≥1024
pixel-idéntico.

### 🟡 B-6 — Admin: AdminTabBar sticky roto (doble causa)

**Evidencia:** `admin-tabs.tsx:89` (`sticky top-0 z-10`) bajo la topbar móvil (también
`top-0`, z-30) → quedaba oculta; y `admin-shell.tsx:165` (`overflow-x-hidden`) convertía al
ancestro en scroll container → el sticky NUNCA funcionaba (en ningún ancho).

**Remediación:** tabbar `sticky top-15 lg:top-0` (topbar móvil = 60px) y shell
`overflow-x-clip lg:overflow-x-hidden` (`clip` recorta sin crear scroll container; ≥lg
byte-idéntico). Verificado con check automatizado tras scroll a 375 y 768.

### 🟡 B-7 — INP home (aviso Vercel: 200ms en `main#contenido`)

**Análisis:** `<main id="contenido">` (`app/page.tsx:135`) es server component sin handlers;
el bloqueo es tarea larga de main thread. Sospechoso principal: 2 carruseles Embla con
autoplay PERMANENTE (`featured-carousel.tsx:24-34` 5s, `reviews-carousel.tsx:23-28` 7s)
haciendo scroll+setState aun fuera de pantalla, compitiendo con las interacciones.

**Remediación:** hook `use-autoplay-when-visible.ts` — autoplay gateado por
IntersectionObserver (fuera del viewport se frena; solo reanuda si estaba sonando: respeta
pausa manual y hover). WCAG 2.2.2 intacto; `prefers-reduced-motion` y `visibilitychange`
ya cubiertos. **Medición honesta:** Lighthouse prod local TBT 115→81ms promedio — dentro de
la varianza (los ticks son post-load y Lighthouse casi no los captura). La validación real
es RUM en Vercel Speed Insights tras desplegar. **Si no mejora → fase 2:** reducir JS de
hidratación de la home (dynamic imports diferidos de carruseles/CommandDialog).

### 🟡 B-8 — CSP sin dominios de la Vercel Toolbar (aviso Vercel)

**Evidencia:** `security-headers.ts:72` — `vercel.live` solo en `script-src`/`frame-src`
(fixes 2026-08-05/06); faltaba en `img-src` (el aviso), `connect-src`, `style-src`,
`font-src`.

**Remediación:** en preview (`VERCEL_ENV=preview`) se añaden los valores oficiales de
vercel.com/docs/workflow-collaboration/vercel-toolbar/managing-toolbar: img
`vercel.live vercel.com`, connect `vercel.live wss://ws-us3.pusher.com`, style
`vercel.live`, font `vercel.live assets.vercel.com`. Producción intacta (sin toolbar).
Tests que fijan ambos comportamientos.

### 🟢 B-9 — Regresión colateral detectada por e2e: zoom de lienzo inerte

**Evidencia:** `estudio-studio-ux.spec.ts` (zoom) — con el dimensionado por ancho de B-2 el
grid llena el contenedor → `computeStageZoomCap` devolvía 1 → "+" clampado al 100% (la
feature de Ola 22 moría en silencio).

**Remediación (Ola 33):** tope de zoom fijo `STAGE_ZOOM_MAX` (2.5); el contenido zoomado
scrollea DENTRO del wrapper del grid (`overflow-x-auto` condicional, solo con overflow
real) — la página jamás desborda (gate 0/70 intacto). Sondas e2e de píxeles reescritas por
contraste de luminancia contra la tarjeta (la tinta por defecto es guía al 40% desde B4
2026-09-15 y la letra oscura es púrpura #3D2E5C no-neutral); el test de la Polaroid Clásica
se alineó a la regla VIGENTE del owner (letra blanca solo sobre tarjeta casi-negra — la
expectativa vieja estaba derogada desde 2026-09-14).

### 🟢 B-10 — Menores admin corregidos

Grids base que no colapsaban a 375px (ocasiones ×2 `grid-cols-3`, moderación `grid-cols-3`,
recovery-codes `grid-cols-2`, pedidos dl `grid-cols-2`, letter-grid `grid-cols-6`→4/6/9);
dropdown de rename `w-72` absoluto → `max-sm:fixed inset-x-4`. Verificados SIN problema
(sin cambios): filas flex `min-w-52/60` del CMS (tienen `flex-wrap` y caben), KPIs
dashboard/observability `grid-cols-2 text-3xl` (legibles a 375; 1 col haría scroll eterno).

### 🟢 B-11 — Menor estudios: grilla de vocales pegada a la izquierda @1280

`letter-set-editor.tsx` — grid → `flex flex-wrap justify-center` con anchos por breakpoint
exactos al track del grid: las 5 vocales centradas sin cambiar tamaños (y las filas
parciales del abecedario también centran).

## C. Verificación (todo ejecutado en local contra stack Supabase sembrado)

| Chequeo | Resultado |
|---|---|
| Capturas estudios 14 slugs × 5 anchos (overflow + error) | baseline 5/70 malas → **0/70** (after-canvas, after-editors-full, after-zoom) |
| Audit admin 41 rutas × 4 anchos (164 mediciones) | **0 overflows reales** (redirects por modo catálogo documentados) |
| Audit storefront E3 6 rutas × 4 anchos | **0/24** |
| Unit + integración (`pnpm --filter web test`) | **3919 passed / 8 skipped / 0 failed** (243 archivos) |
| typecheck + lint (`--max-warnings 0`) | ✅ |
| E2E estudio: studio-ux + letterset | 8 passed / 1 skipped (skip preexistente: variante sin imán ausente del seed) |
| E2E smoke / mobile-admin-link / admin-login | 9/9 · 4/4 ✅ |
| Lighthouse home (prod local) | TBT 115→81ms (dentro de varianza; validación real = RUM) |
| Gates CI cableados | PR: storefront-audit en `ci.yml`; Nightly: responsive-admin-audit en `nightly-full.yml` |

## D. Cierre y deuda residual

**Cerrado al 100% en código y VALIDADO por el owner en STG (2026-09-18, "aparentemente todo
Ok")** — release a STG en los commits `4ed8887`/`73b66e3`/`e84848d` (+2 fixes del gate e2e)
con CI 7/7 verde y migración `WebVital.target` aplicada en STG. Para la consolidación final
de la auditoría falta: ① liberación a PRD (decisión del owner); ② revisar en ~1 semana
Vercel Speed Insights (p75 INP de `#contenido`, ahora con el elemento exacto en
`WebVital.target`) — si no mejora, ejecutar la fase 2 de B-7/E-4; ③ confirmación visual de
la Vercel Toolbar en el preview (el despliegue ya sirve la CSP ampliada).

**Deuda anotada (no crítica):**
- Estético admin: aviso "lista publicada / Publicar nueva versión" en 3 columnas apretadas a
  375px (`contenido/campos/[id]`); tablas `minWidth 800` scrollean ~32px dentro de su wrapper
  a 1024 exacto (comportamiento de siempre en desktop estrecho).
- Oportunidad: `overflow-x-clip` global haría sticky también la topbar desktop (se dejó
  byte-idéntico a propósito).
- `cuadro-3-fotos` y `planner-mensual-con-foto` dan soft-404 en el seed local (preexistente;
  el contrato del modo plano quedó blindado por tests de componente y por glass/tiras).

---

## E. Ronda 2 — validación del owner sobre la ronda 1 (2026-09-18, tarde)

El owner validó y reportó: falta de uniformidad general, tamaños por defecto pequeños
(espec medido con el zoom del estudio), y 4 frentes nuevos (PDP, título móvil, guardado
admin, alertas Interaction Timing). Referencia correcta aclarada: **Magnéticos**
(separadores-magneticos) — tarjeta grande por unidad física. Nota metodológica: la
validación se hizo sobre el sitio DESPLEGADO (la ronda 1 aún no se había liberado); sus
porcentajes de zoom se tomaron como spec de tamaños absolutos y se verificaron con sonda
de píxeles.

### 🔴 E-1 — Slots por defecto pequeños (spec: "100% = lo que hoy se ve al 150% web / 125% móvil / 250% cuadrados móvil")

**Remediación (Ola 34):** las columnas se derivan del ANCHO OBJETIVO de slot (450px ≤6
slots / 300px ≥7) en vez de breakpoints fijos; en móvil (<640px) TODO estudio foto va a
UNA columna full-width; `MOBILE_FRAME_HEIGHT` constante (el slot ya no cambia de tamaño al
ocultarse la barra del navegador — la queja de tiras móvil); caps por conteo calibrados;
tiras ×1.5 en desktop; caras de separadores ×1.3-1.7; título del producto visible en móvil
en ambos headers sin inflar el chrome; editores de letras con fichas más grandes y lienzo
centrado (mobile ~90px×3 cols, desktop centrado con aire). Calendario intacto (aprobado).

**Medición objetiva (sonda playwright, px de slot antes→después):**

| Estudio | @375 | @1280 | @1920 |
|---|---|---|---|
| Polaroid | →327 (1 col) | 293→**448** | 420→**506** |
| Cuadrados | →327 (1 col) | 293→**448** | 506 |
| Tiras (ancho tira) | →327 | 429→**643** | 546→**682** |
| Sep. magnéticos/alargados (cara) | 120→**159** | 114-120→**200** | 153→**213** |
| Calendario | 327 | 450 (intacto) | 509 (intacto) |
| Abecedario/Vocales (ficha) | →90 (3c) | →100 (7c) | →126 (8c) |
| Nombre (ficha) | →89 | →144 | →144 |

### 🟡 E-2 — PDP sin variante preseleccionada

**Evidencia:** al entrar a `/producto/[slug]` sin `?variant=` no había selección y el CTA
abre bloqueado. **Remediación:** `pdpDefaultVariant`
(`features/products/variant-schemas.ts`) — preselecciona la variante que materializa la
primera opción visible de cada dimensión (mismo orden de chips del selector), prefiriendo
la primera combinación CON STOCK; `?variant=` explícito manda; subsume los defaults
especiales previos (Con-imán, N-mínimo polaroid). Verificado @1280 y @390 en 4 productos.

### 🔴 E-3 — Guardar en /admin/productos "no hace nada" (regresión percibida)

**Causa raíz (triple, NINGUNA es falta de revalidatePath — esa siempre estuvo bien):**
1. **Error de validación invisible** — el alert global exigía `state.error &&
   !state.fieldErrors` → cualquier rechazo Zod (que trae fieldErrors) no renderizaba nada.
2. **Trampa del dato legado** — el schema subió `warrantyMonths` a `min(12)` (piso legal);
   productos viejos con garantía menor fallaban el guardado COMPLETO al editar cualquier
   campo, sin mensaje.
3. **Validación HTML5 silenciosa** — un control inválido en una tab oculta bloqueaba el
   submit sin POST ni mensaje; y guardar OK retornaba `{}` (cero confirmación).

**Remediación:** `noValidate` (Zod es la única fuente), alert de error SIEMPRE visible con
etiquetas humanas + dot rojo en el tab afectado, `success:true` + confirmación
(role=status), mensajes Zod en español. Verificado end-to-end: nombre → PDP y catálogo;
destacado → carrusel home; legado inválido → mensaje claro y guardado correctamente
rechazado. **Mapa para el owner:** productos (`/admin/productos`) = datos estructurales
(nombre, flags, variantes, imágenes) que se reflejan directo; `/admin/contenido` (CMS) =
textos editoriales de la tienda. El nombre del producto NUNCA viene del CMS — no hay
duplicidad.

### 🟡 E-4 — Alertas "Interaction Timing" 200ms (Vercel): validación

**Pipeline RUM propio mapeado:** `web-vitals.tsx` → `/api/vitals` → tabla `WebVital`.
**Gap cerrado:** no se guardaba el ELEMENTO del INP → ahora se persiste
`attribution.interactionTarget` (columna `WebVital.target`, migración
`20260918120000_webvital_inp_target`) y `/estudio/[slug]` queda normalizado en el reporter.
SQL p75 por ruta listo para PRD (en el informe de investigación; también en §D).
**Sospechosos rankeados con evidencia:** #1 upscale/unsharp mask SÍNCRONO al subir foto
(`client-photo-upscale.ts:63-86`, ~36M iteraciones en 12MP); #2 snapshots Konva
`toDataURL` del botón Vista previa (`studio-editor.tsx:872-928`); #3 smartcrop al asignar
foto (`smart-crop.ts:55`); #4 gestos con filtros (re-cache Konva por frame); #5 previews
canvas de editores de letras. PDP/checkout/globales: sanos o ya mitigados (carruseles).
**Decisión:** no refactorizar a workers a ciegas — con `target` persistido, el RUM dirá en
~1 semana QUÉ elemento domina el INP real y se ataca ese (harness local propuesto en
`tmp/inp-audit/` como siguiente paso si hace falta).

### Verificación ronda 2

| Chequeo | Resultado |
|---|---|
| Capturas estudios 14×5 (`after-v2`) | **0/70** overflow |
| Sonda px slots | tabla E-1 (objetivos cumplidos) |
| Unit estudio | 483 verdes · `features/products` 136 verdes · admin productos 163 verdes |
| E2E studio-ux + letterset / smoke | verdes (1 flake por contención de carga, pasa aislado) |
| Vitals (reporter + endpoint + migración) | 14 tests verdes; migración aplicada en local |
| Gates CI (storefront + admin audits) | re-corridos tras Ola 34 — ver §C |

### Deuda ronda 2

- E2E `pdp-unidades.spec` / `pdp-cantidad-tira` / `ola19-separadores`: fallas
  PRE-EXISTENTES por drift de la fase B2 (2026-09-15): esperan grupo "Unidades" y los
  productos se relabelaron "Packs"; seed local de polaroid sin pares `magnet`. No gatean
  CI. Actualizarlos queda como follow-up de la fase B2.
- INP fase 2 (si el RUM lo confirma): mover canvas pesado del Estudio a Web Worker +
  OffscreenCanvas (upscale/unsharp, smartcrop, snapshots chunked en requestIdleCallback).
