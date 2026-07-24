# Prompt para plantillas tipo "post de red social" (Instagram / X / TikTok / etc.)

## Objetivo
Crear un SVG transparente que sirva de marco/chrome para productos fotoimán con formato de post de red social. El cliente debe poder:

1. Subir su foto en una zona rectangular definida.
2. Editar textos (usuario, ubicación, likes, caption, hashtags, título, etc.).
3. Elegir fondo claro/oscuro (o pasteles, según la red social).
4. Elegir si la foto va "con borde" (ventana clásica) o "sin borde" (a sangre, cubriendo todo el fondo).

## Reglas de diseño

### Canvas base
- Tamaño lógico: `450×600` (relación 3:4, equivalente a 7.5×10 cm físicos).
- `viewBox="0 0 450 600"`.
- Fondo transparente: el color real se aplica por capa Konva en el editor, no horneado en el SVG.

### Zonas editables (NO horneadas en el SVG)
Todas las zonas de texto deben ser capas `text` editables en el `unitTemplate` (Konva). En el SVG se dibuja solo el chrome estático (iconos, líneas, formas).

| Elemento | Ejemplo visual | Coordenadas aproximadas (450×600) |
|---|---|---|
| Avatar + anillo de historia | Círculo con foto | `(38, 26)` |
| Username | `@tu_usuario` | `(64, 20)` |
| Ubicación | `Bogotá, Colombia` | `(64, 42)` |
| Menú de 3 puntos | ··· | `(410, 26)` derecha |
| Ventana de foto | foto del cliente | centrada, ~400×400 |
| Iconos de interacción | ❤️ 💬 ✈️ 🔖 | `(25, 461)` |
| Likes / views | `362 me gusta` | `(25, 512)` |
| Caption / título | `Tu título acá` | `(25, 537)` |
| Hashtags / mentions | `@lucamsshop #familia` | `(25, 559)` |
| Ver comentarios | `Ver los 12 comentarios` | `(25, 582)` gris baja jerarquía |

> **NO incluir timestamp** (ej. "Hace 2 días"). Esos textos quedan desactualizados y rompen la sensación de producto propio.

### Fondo y contraste
- Proveer dos versiones del SVG: clara (`{nombre}.svg`) y oscura (`{nombre}_dark.svg`).
- Versión clara: chrome en gris/negro (`#262626`, `#8e8e8e`).
- Versión oscura: chrome en blanco con opacidad suave (`#FFFFFF`, opacity 0.6-0.8).
- El corazón / ícono principal puede conservar su color distintivo (rojo Instagram, etc.) porque contrasta en ambos fondos.

### Opción "con borde" / "sin borde"
- El SVG base debe dejar suficiente aire para que la foto pueda crecer a sangre sin cortar el chrome.
- En el seed de la plantilla se define la geometría normal (`x, y, width, height`) para "con borde".
- El código del editor reescribe la ventana de foto para modo "sin borde" (a sangre vertical hasta los iconos).

### Entregables esperados
1. SVG claro: `public/templates/{nombre}.svg`
2. SVG oscuro: `public/templates/{nombre}_dark.svg`
3. Preview PNG (opcional): `public/templates/{nombre}_preview.png` para la card de plantilla.
4. Entrada en seed de plantillas con capas `text` editables y `image-placeholder` correctamente dimensionado.

## Ejemplo de referencia: Instagram
Ver `public/templates/ig_post_3x4.svg` e `ig_post_3x4_dark.svg`. Puedes usarlo como base para adaptar a X, TikTok, Pinterest, etc.

## Checklist de calidad
- [ ] El SVG no hornea textos editables (usuario, caption, likes, etc.).
- [ ] No incluye timestamps ni nombres de persona reales.
- [ ] Tiene versión clara y oscura.
- [ ] La ventana de foto respeta la relación 3:4 y deja espacio para el chrome.
- [ ] Los iconos se leen bien sobre fondo claro y oscuro.
- [ ] El archivo pesa menos de 50 KB.
