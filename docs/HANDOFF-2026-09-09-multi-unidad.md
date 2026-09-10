# HANDOFF — Ronda 3: modelo multi-unidad + ajustes IG/tiras (2026-09-09)

> Estado al cerrar la sesión. Este archivo vive en la rama `wip/multi-unidad-ola26-27`.
> `develop` quedó limpio en `9523cf2` (CI verde, desplegado en STG).

## Cómo retomar

```bash
git checkout wip/multi-unidad-ola26-27
```

Todo el trabajo en curso está commiteado en esa rama. Al terminarla: merge a
`develop` → push (despliega STG) → correr seeds CMS en STG (ver abajo) →
validación del owner → PRD.

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

| # | Punto del owner | Estado / dónde vive |
|---|---|---|
| 1.2.1.A | Clásica: preview blanca "ya se ve pero muy leve" | Implementado (checkerboard reforzado, Ola 26) — falta verificación visual del owner |
| 1.2.2.A | IG: tarjeta blanca → textos oscuros; negra → claros; #mirecuerdo #lucamsshop SIEMPRE azul | Implementado (color por capa, Ola 26 + instagram-template-spec) — falta verificación visual |
| 1.2.2.B | IG: "de cierta manera se obligue a tener esos textos" → respuesta del owner: **TODOS los textos obligatorios** (usuario, ubicación, título, hashtags; "362 me gusta" decorativo) | Implementado (bloqueo de «Vista previa» con campos faltantes, Ola 26) |
| 1.3.A-1 | Tiras: 3 fotos con Unidades 2+ "no se reflejan los lienzos" → respuesta del owner: quiere **VER las N tiras, regla general: las N elementos a diseñar en el estudio** | Es el modelo multi-unidad (Ola 27): N unidades diseñables con atajo "aplicar a todas" |
| 1.3.A-2 | Tiras: 4 fotos "ni siquiera aparece lienzo" | Bug corregido (plantilla 4 fotos añadida a `seed-templates.mjs`; nació en one-off `ola18b-cuadrados-tiras-fix.mjs`) — **requiere correr `seed-templates.mjs` en STG/PRD** |
| 1.7 | Nombre: "Borde de las fichas" ENCIMA de "Elige los colores" | Implementado (reorden en name-editor, Ola 26) |
| PDTA | Error `make` al reiniciar local (`EADDRINUSE :4000`) | Resuelto en sesión: era un `next dev` de pruebas ocupando el puerto; se liberó. Si recurre, `make web-stop` en el repo principal |
| Transversal | "Todo alineado entre admin y cliente" | Los textos nuevos van por CMS (keys en cms-site-map.mjs); prediseñados admin→/admin/disenos ya alineado |

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
