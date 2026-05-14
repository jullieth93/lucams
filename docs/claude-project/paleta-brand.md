# Paleta de marca Lucams — colores autorizados

Estos son los ÚNICOS colores que se pueden usar en SVGs de Lucams_shop.

Cualquier color fuera de esta paleta debe ser justificado en un comentario al inicio del SVG.

## Colores brand primarios

| Token         | HEX       | Cuándo usarlo                                                                      |
| ------------- | --------- | ---------------------------------------------------------------------------------- |
| `purple`      | `#7C6AAD` | Color principal. Botones primarios, texto destacado, links, decoraciones primarias |
| `purple-dark` | `#3D2E5C` | Headings, texto sobre fondo claro, hover states del purple                         |
| `turquoise`   | `#5DD9D1` | Acentos secundarios, accent lines, "FOLLOW" buttons, ring de selección             |
| `pink`        | `#E85B9F` | Decoración cálida, ribbons, hearts, eventos femeninos (cumpleaños, baby shower)    |
| `coral`       | `#F58A6F` | Decoración cálida secundaria, sunset gradients, ribbons combinados con pink        |
| `yellow`      | `#FFD93D` | Confetti, sparkles, sol, eventos infantiles, alegría                               |
| `gold`        | `#D4AF37` | Decoración elegante, corner ornaments, bordes vintage, weddings                    |

## Colores neutros

| Token         | HEX       | Cuándo usarlo                                               |
| ------------- | --------- | ----------------------------------------------------------- |
| `cream`       | `#FFF8F0` | Fondo cálido alternativo al blanco puro                     |
| `blush`       | `#FFE5EC` | Fondo rosa pálido, fondo eventos femeninos suaves           |
| `sage-green`  | `#B5C9A8` | Hojas decorativas, weddings naturales, sustainability vibes |
| `white`       | `#FFFFFF` | Marco polaroid, card background, espacios negativos         |
| `neutral-900` | `#262626` | Texto principal, iconos sobre fondo claro                   |
| `neutral-500` | `#666666` | Texto secundario, hints, captions                           |

## Mapping concepto → paleta sugerida (la IA usa esto para decidir sola)

| Concepto / vibe                 | Dominante (60%)     | Acentos (30%)                  | Neutro (10%) | Mood                |
| ------------------------------- | ------------------- | ------------------------------ | ------------ | ------------------- |
| **Polaroid clásico romántico**  | gold                | pink                           | cream        | Elegante, atemporal |
| **Cumpleaños kawaii**           | yellow              | pink + coral                   | cream        | Alegre, infantil    |
| **Boda elegante**               | gold                | sage-green                     | cream        | Sofisticado         |
| **Baby shower**                 | blush               | sage-green + yellow (sparkles) | cream        | Tierno, suave       |
| **Minimalista moderno**         | turquoise OR purple | neutral-900                    | white        | Limpio, urbano      |
| **Social post (Instagram)**     | white               | neutral-900 + `#3897F0`        | neutral-500  | Tecnológico, viral  |
| **Vintage / retro**             | gold + coral        | sage-green                     | cream        | Nostálgico          |
| **Corporate / business**        | purple-dark         | turquoise                      | white        | Profesional         |
| **Día del padre**               | turquoise           | gold (sparkles)                | cream        | Sobrio, fuerte      |
| **Navidad / fiestas**           | coral               | gold + sage-green              | cream        | Cálido, festivo     |
| **Aniversario**                 | gold                | pink                           | cream        | Romántico maduro    |
| **Mascotas / pet love**         | sage-green          | yellow + blush                 | cream        | Tierno, natural     |
| **Halloween kawaii**            | purple-dark         | coral + yellow                 | cream        | Misterioso lúdico   |
| **Graduación**                  | purple              | gold                           | cream        | Logro, prestigio    |
| **Día de la madre**             | pink                | blush + sage-green             | cream        | Cálido, afectivo    |
| **Verano / playa**              | turquoise           | yellow + coral                 | cream        | Energético, fresco  |
| **Bautismo / primera comunión** | sage-green          | gold                           | white        | Sereno, espiritual  |

## Reglas para componer paletas brand (cuando elegís sola)

**Regla 1 — Jerarquía cromática 1 + 2 + 1**:

- 1 color **DOMINANTE** (~60% de la decoración visual)
- 2 colores **ACENTOS** (~30%)
- 1 color **NEUTRO** (~10%, fondos, separadores)

NO usar 4+ colores con peso igual — queda saturado y "tienda barata".

**Regla 2 — Coherencia tonal**:

- Combinar SOLO cálidos entre sí (pink + coral + yellow + gold), o
- SOLO fríos (purple + turquoise + sage-green), o
- 1 cálido + 1 frío contrastantes (turquoise + coral) = efecto pop
- NUNCA mezclar 3+ cálidos con 3+ fríos = confunde

**Regla 3 — Brand recognition**:
AL MENOS UN color brand fuerte debe estar presente (purple, turquoise, pink, coral, yellow, gold). No usar solo neutros + cream → la plantilla pierde identidad Lucams.

**Regla 4 — Cuándo usar gold**:

- Eventos elegantes (bodas, aniversarios, graduación, comunión)
- Decoraciones tipo "corner ornament" o "wreath"
- Combinado con cream y/o neutral-900 = efecto "premium"
- NO usar para infantil → para infantil usar yellow

**Regla 5 — Cuándo usar yellow**:

- Sparkles, confetti, alegría
- Infantil (cumpleaños niño, baby shower neutro)
- Verano, sol
- Pequeñas dosis (sparkles, dots) — yellow grande es agresivo

**Regla 6 — Cuándo usar purple-dark (#3D2E5C)**:

- Headings, corporate, halloween kawaii
- Como dominante en plantillas "sobrias" o "misteriosas"
- Combina bien con turquoise (contraste brand)
- NO usar para baby shower, primavera, eventos suaves

## Color azul Instagram excepcional

Cuando la plantilla replica estilo de redes sociales (post / story / reel), se permite usar `#3897F0` y `#00376B` (azules de UI Instagram standard) específicamente para:

- Botones tipo "FOLLOW"
- Hashtags (color `#00376B` para hashtags)
- Verified checkmark badge

NO usar estos azules para otros propósitos.

## Gradients permitidos

Los gradients deben usar SOLO 2-3 colores adyacentes de la paleta:

| Gradient sugerido  | Stops                  | Uso                              |
| ------------------ | ---------------------- | -------------------------------- |
| **Sunset**         | pink → coral           | Ribbons, decoraciones cálidas    |
| **Brand vibrante** | turquoise → purple     | Accent lines, badges premium     |
| **Soft pastel**    | blush → cream → yellow | Backgrounds suaves               |
| **Gold elegant**   | gold → cream           | Corners weddings, frames vintage |

NO mezclar más de 3 colores en un gradient (queda saturado, "tienda barata").
