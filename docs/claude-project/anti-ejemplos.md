# Anti-ejemplos — SVGs reales que rechazamos

> Casos reales del proyecto Lucams_shop donde una IA externa generó SVGs que parecían correctos pero fueron rechazados. Aprendé de estos para NO repetir los mismos errores.

## Anti-ejemplo 1: `post_ig.svg` — vectorización de bitmap

**Lo que pasó:** El usuario generó una captura de pantalla de un post de Instagram y la pasó por un servicio "image to SVG" (vectorizer.io o similar). El output era técnicamente un SVG, pero internamente era un trace pixel-a-pixel de la imagen.

**Resultado:**

- 9.973 paths (vs los 10-50 que debería tener un SVG marco editable)
- 6.1 MB de tamaño (vs los <15 KB requeridos)
- 0 elementos identificables (`<rect>`, `<text>`, `<g>`, `<image>`)
- Cada glifo de texto trazado como silueta de paths (no era texto real)
- El área de la foto estaba "embebida" como vectores (no había hueco transparente)

**Por qué se rechazó:**

- NO permitía editar nada (los textos eran paths, no `<text>`)
- NO tenía hueco para la foto del cliente
- Era inviable performance-wise (rasterizar 9.973 paths en mobile = 3-8 segundos por slot)
- Era un "SVG en nombre, bitmap en sustancia"

**Lección:** Si tu output tiene > 500 paths, REHACÉ desde cero con primitivas (rect, circle, path bezier corto). No vectorices imágenes.

---

## Anti-ejemplo 2: `polaroid-romantica.svg` v1 — marco blanco sobre fondo blanco

**Lo que pasó:** La IA generó correctamente la estructura (marco polaroid blanco + corners + área transparente), pero NO agregó ninguna decoración con color visible.

**Resultado:**

- Estructura técnicamente correcta
- Sin foto detrás: se veía como CUADRADO BLANCO COMPLETAMENTE VACÍO en la sidebar del editor
- El cliente NO podía distinguirla de "Cuadrado Minimal Art" u otras plantillas blancas

**Por qué se rechazó:**

- En el editor Lucams, el cliente ve las plantillas en una sidebar ANTES de elegir cuál aplicar
- Si la plantilla es solo marco blanco sin decoración → invisible sobre fondo blanco
- Resultado UX: confunde al cliente y reduce la conversión

**Lección:** SIEMPRE agrega al menos UNA decoración con color brand visible (corners gold, ribbon coral, accent line turquoise, stars yellow, etc.) que se distinga sobre fondo blanco. Aunque el "marco" sea técnicamente blanco, las decoraciones deben dar contraste.

**Fix aplicado:** Versión v2 agregó 4 corners triangulares dorados `#D4AF37` en las esquinas del área foto + 4 estrellitas decorativas. Ahora la plantilla se distingue claramente en la sidebar.

---

## Anti-ejemplo 3: `prueba.svg` v1 — rect duplicado + stroke molesto

**Lo que pasó:** La IA generó un polaroid correcto pero cometió 2 errores cosméticos:

```svg
<!-- Error 1: dos rects en (0,0,720,60) — el segundo tapa al primero -->
<g id="header">
  <rect x="0" y="0" width="720" height="60" fill="#FFF8F0"/>  ← cream nunca se ve
</g>
<g id="photo-frame">
  <rect x="0" y="0" width="720" height="60" fill="#FFFFFF"/>  ← blanco encima
  ...
</g>

<!-- Error 2: stroke 1px gris sobre el área foto sin opacity baja -->
<rect x="60" y="60" width="600" height="680" fill="none"
      stroke="#EEEEEE" stroke-width="1"/>
<!-- Cuando hay foto del cliente detrás, este stroke se ve como
     borde gris extraño encima de la foto. -->
```

**Por qué se rechazaron estos detalles:**

- Rect duplicado = código sucio + confusión sobre qué color debería ganar. Si quieres cream en el header, NO pongas un blanco encima.
- Stroke 1px con opacity alta sobre el área foto = visible cuando el cliente carga su foto, queda como un borde fino raro encima de su contenido.

**Lección:**

1. **1 superficie = 1 rect**. No dupliques en mismas coords.
2. **Stroke en área-foto**: si necesitas guía visual, usa `opacity="0.15"` o menos. Sino, sin stroke.

**Fix aplicado:** Versión v2 removió el rect cream duplicado + bajó opacity del stroke del área foto a 0.

---

## Patrón general: lo que distingue un SVG bueno

| Métrica                     | SVG bueno                  | SVG rechazado             |
| --------------------------- | -------------------------- | ------------------------- |
| Tamaño                      | < 15 KB                    | post_ig (6.1 MB)          |
| Paths count                 | 10-50                      | post_ig (9.973)           |
| Rects en misma posición     | 1 por posición             | prueba v1 (2)             |
| Decoraciones color brand    | Al menos 1 visible         | polaroid-romantica v1 (0) |
| Texto del usuario hardcoded | 0                          | (varios)                  |
| Imágenes raster embebidas   | 0                          | (varios)                  |
| Área foto transparente      | `fill="none"`              | post_ig (path trace)      |
| Stroke área foto            | opacity < 0.2              | prueba v1 (opacity 1)     |
| Fonts externas              | Solo Arial/Helvetica/Inter | (varios)                  |

## Checklist mental antes de devolver el SVG

Antes de mandar tu output, verificá mentalmente:

- [ ] ¿Pesa < 15 KB? (cuenta líneas — > 200 líneas suele estar OK; > 800 líneas sospechoso)
- [ ] ¿Tiene < 50 paths totales?
- [ ] ¿El área del centro está `fill="none"`?
- [ ] ¿Hay al menos UNA decoración con color brand (NO blanco) visible?
- [ ] ¿La zona reservada para caption está LIBRE de decoraciones?
- [ ] ¿No hay rects duplicados en mismas coords?
- [ ] ¿No hay `<text>` con contenido del usuario hardcoded?
- [ ] ¿El comentario inicial declara coords del agujero?
- [ ] ¿Los colores usados están en la paleta brand de `paleta-brand.md`?

Si alguno falla → corregí ANTES de devolver el output.
