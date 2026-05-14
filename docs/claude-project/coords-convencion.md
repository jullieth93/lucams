# Convención de coordenadas del seed Lucams

> Reglas que debe respetar el SVG output para que se integre correctamente al editor canvas Konva.

## Origen de coordenadas

- `(0, 0)` es la **esquina top-left** del stage SVG
- `x` crece hacia la derecha
- `y` crece hacia ABAJO (sentido SVG estándar, opuesto al sentido matemático Y)

## Conversión cm físico ↔ px SVG

Para que el seed pueda calcular el production PNG a 300 DPI, el stage SVG debe usar dimensiones proporcionales al tamaño físico:

| Tamaño físico imán | Stage SVG recomendado | DPI implícito |
|---|---|---|
| 5×5 cm | 590×590 o 1080×1080 | 118 o 216 |
| 5×7 cm | 590×826 o 720×1008 | 118 o 144 |
| 7×9 cm | 720×920 o 826×1063 | 103 o 118 |
| 8×10 cm | 800×1000 o 944×1180 | 100 o 118 |
| 10×15 cm | 1000×1500 o 1180×1772 | 100 o 118 |
| 15×15 cm | 1500×1500 o 1772×1772 | 100 o 118 |

**Recomendado**: usar ~100 px/cm (factor visual cómodo). El seed Lucams después escala al render 300 DPI server-side.

## Photo placeholder coordinates

El `<rect>` que marca el agujero transparente DEBE estar dentro del stage y respetar márgenes de marco:

```svg
<!-- Stage 720×920 (7×9 cm vertical) -->
<svg viewBox="0 0 720 920" width="720" height="920">
  <!-- Photo area: (60, 60, 600, 680) — 60px de margen alrededor -->
  <rect x="60" y="60" width="600" height="680" fill="none"/>
</svg>
```

Convenciones:
- **x, y son top-left del rect**, no center
- **width / height son las dimensiones del rect**, no del stage
- **Margen mínimo recomendado: 5-10% del stage** (60px en stage 720, 80px en stage 800, etc.)
- **Para shape circle**: agregar `rx="N"` donde N = width/2 → convierte rect en círculo perfecto
- **Para shape heart**: usar `<path>` con bezier curves, NO rect

## Cómo el seed-templates.mjs consume coords

El archivo `seed-templates.mjs` declara cada plantilla como un objeto con `canvasData.stage` + `canvasData.layers`. Tu SVG **NO va a ser parseado** por el seed — solo se referencia como `asset` layer dentro del canvasData:

```js
{
  slug: "mi-plantilla-nueva",
  kind: "PHOTO_PACK",
  canvasData: {
    version: 1,
    stage: { width: 720, height: 920 }, // ← debe matchear viewBox del SVG
    layers: [
      // Capa 1: foto del cliente (el editor la pone)
      photoSlot({ id: "p1", x: 60, y: 60, width: 600, height: 680 }),
      // Capa 2: TU SVG asset
      asset({
        id: "frame",
        src: "/templates/mi-plantilla-nueva.svg",
        x: 0,
        y: 0,
        width: 720,   // ← debe matchear width del SVG
        height: 920,  // ← debe matchear height del SVG
      }),
      // Capa 3: text overlays editables (futuro M.3.b.D)
      text({ id: "caption", x: 360, y: 820, ... }),
    ],
  },
}
```

**Por eso es crítico que tu SVG declare coords consistentes**:
- El `photoSlot.x/y/width/height` que pongo en seed debe MATCHEAR las coords del agujero transparente de tu SVG
- Si tu SVG tiene agujero en (60, 60, 600, 680), el seed debe poner photoSlot en (60, 60, 600, 680). Sino la foto del cliente no calza con el marco.

## Zonas reservadas para text overlay

Indicá en el comentario inicial del SVG las coords de zonas que dejaste LIBRES (sin decoración) para text overlays futuros:

```svg
<!--
  polaroid-amigos-bff.svg
  Stage: 720×920
  Agujero foto: (60, 60, 600, 680)
  Zonas reservadas overlay:
    - caption inferior: (60, 760, 600, 80)
    - nombre top-left: (80, 20, 280, 30)
-->
```

El seed después usa esas coords para los `text()` layers editables.

## Convención de orientación

Cuando el usuario diga "7×9 cm vertical": el **primer número es ANCHO** (x), el **segundo es ALTO** (y).
- 7×9 vertical → stage `width=720 height=920` (más alto que ancho)
- 9×7 horizontal → stage `width=920 height=720` (más ancho que alto)

Si el briefing dice solo "7×9" sin orientar, default a **vertical** (es lo más común en polaroids).

## Corner radius vs shape

| Necesidad | Solución técnica |
|---|---|
| Esquinas vivas rectangulares | `<rect>` sin `rx` |
| Esquinas redondeadas suaves | `<rect rx="8">` o `rx="12"` |
| Esquinas redondeadas notables | `<rect rx="24">` |
| Forma circular | `<circle>` o `<rect rx="N">` con `N = width/2` |
| Forma corazón | `<path d="M50,82 C28,68 6,52 6,32 ...">` (bezier curves) |
| Forma personalizada | `<path>` con coords absolutas |

Para shape heart, el editor Lucams tiene un path estándar:
```
M50,82 C28,68 6,52 6,32 C6,18 16,8 28,8 C38,8 44,12 50,22 C56,12 62,8 72,8 C84,8 94,18 94,32 C94,52 72,68 50,82 Z
```
(ViewBox 100×100, escala al width/height del slot). Usalo si la plantilla pide forma corazón.
