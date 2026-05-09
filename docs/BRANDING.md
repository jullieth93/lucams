# Branding — Lucams_shop

## Logo

Insignia circular con:
- **Mascota mapache** estilo kawaii sobre fondo morado lavanda, con mejillas rosadas y mirada amigable.
- Tipografía **"LUCAMS"** en estilo bubble/balloon con letras multicolor (turquesa, rosa, coral, amarillo).
- **"SHOP"** en pequeño debajo, color púrpura oscuro.
- **Corazones amarillos** flotando como acento decorativo.
- Trazo circular tipo brushstroke alrededor.

> Pendiente: el usuario debe entregar la versión final en SVG (preferido) o PNG transparente alta resolución. Mientras tanto, se trabaja con la imagen referencial compartida en chat.

## Paleta de colores

### Tabla de tokens

| Token | HEX | RGB | HSL | Uso principal |
|---|---|---|---|---|
| `brand-purple` (primario) | `#7C6AAD` | 124, 106, 173 | `253 26% 55%` | Fondos destacados, header, botones primarios |
| `brand-purple-dark` | `#3D2E5C` | 61, 46, 92 | `261 33% 27%` | Texto principal sobre claro, headings |
| `brand-turquoise` | `#5DD9D1` | 93, 217, 209 | `176 60% 61%` | Acento, badges "nuevo", links |
| `brand-pink` | `#E85B9F` | 232, 91, 159 | `331 75% 63%` | CTAs secundarias, precios en oferta |
| `brand-coral` | `#F58A6F` | 245, 138, 111 | `12 86% 70%` | Acentos cálidos, banners |
| `brand-yellow` | `#FFD93D` | 255, 217, 61 | `49 100% 62%` | Highlights, corazones, badges "envío gratis" |
| `brand-cream` | `#FFF8F0` | 255, 248, 240 | `32 100% 97%` | Fondos suaves alternativos al blanco puro |
| `neutral-white` | `#FFFFFF` | 255, 255, 255 | `0 0% 100%` | Fondos principales |
| `neutral-text` | `#1F1733` | 31, 23, 51 | `258 38% 15%` | Texto cuerpo |
| `neutral-muted` | `#6B6383` | 107, 99, 131 | `253 14% 45%` | Texto secundario, placeholders |
| `feedback-success` | `#3FBE6E` | — | — | Confirmaciones, "pagado" |
| `feedback-error` | `#E84B5B` | — | — | Errores, validaciones |
| `feedback-warning` | `#F5A623` | — | — | Avisos, stock bajo |

### Implementación en Tailwind v4 (CSS-first)

> **Tailwind v4 usa el directorio `@theme` en CSS, no `tailwind.config.ts`.** ADR-015. Sintaxis verificada contra [tailwindcss.com/docs/theme](https://tailwindcss.com/docs/theme) a 2026-05-09.

```css
/* apps/web/app/globals.css */
@import "tailwindcss";

@theme {
  /* Paleta de marca — generan utilidades bg-brand-purple, text-brand-pink, etc. */
  --color-brand-purple: #7C6AAD;
  --color-brand-purple-dark: #3D2E5C;
  --color-brand-turquoise: #5DD9D1;
  --color-brand-pink: #E85B9F;
  --color-brand-coral: #F58A6F;
  --color-brand-yellow: #FFD93D;
  --color-brand-cream: #FFF8F0;

  /* Neutrales y feedback */
  --color-neutral-text: #1F1733;
  --color-neutral-muted: #6B6383;
  --color-feedback-success: #3FBE6E;
  --color-feedback-error: #E84B5B;
  --color-feedback-warning: #F5A623;

  /* Tipografías — generan utilidades font-display, font-body */
  --font-display: "Fredoka", "Baloo 2", system-ui, sans-serif;
  --font-body: "Inter", "Nunito", system-ui, sans-serif;
}
```

> **Ejemplo de uso:** `class="bg-brand-purple text-white font-display"`. Las clases se generan automáticamente por namespace del token (`--color-*` → `bg-*`/`text-*`/`fill-*`/etc., `--font-*` → `font-*`).

> **Caveats v4 documentados** (ADR-015): proyectos shadcn/ui en v4 usan style `new-york`, paquete `tw-animate-css` en lugar del deprecado `tailwindcss-animate`, y `sonner` en lugar del componente `toast`.

### Reglas de uso

- **Botones primarios**: fondo `brand-purple`, texto blanco. Hover: oscurece 8%.
- **Botones secundarios**: borde `brand-turquoise`, texto `brand-purple-dark`, fondo transparente.
- **CTA "Comprar ahora"**: fondo `brand-pink`, texto blanco. Reservado para acciones de conversión.
- **Banner "Envío gratis"**: fondo `brand-yellow`, texto `brand-purple-dark`.
- **Headings (h1-h3)**: color `brand-purple-dark`, font display.
- **Cuerpo**: color `neutral-text`, font sans serif.
- **Links**: color `brand-turquoise`, subrayado en hover.
- **Fondos de sección**: alternar `neutral-white` y `brand-cream` para ritmo visual.

### Accesibilidad

- Contraste `brand-purple-dark` sobre `neutral-white` = 11.3:1 ✅ AAA.
- Contraste `brand-purple` sobre `neutral-white` = 4.6:1 ✅ AA.
- Contraste `brand-turquoise` sobre `neutral-white` = 1.7:1 ❌ — no usar como texto sobre blanco; usar solo sobre `brand-purple-dark` (contraste 6.2:1 ✅) o como fondo con texto oscuro.
- Contraste `brand-yellow` sobre `neutral-white` = 1.4:1 ❌ — no usar como texto; solo como fondo con texto oscuro.

## Mascota mapache (Lucams)

El mapache es **personaje recurrente**, no solo un logo. Usos:

| Contexto | Implementación |
|---|---|
| Loader de páginas | Mapache animado (Lottie o GIF) girando o saltando |
| Carrito vacío | "¡Lucams está esperando que llenes el carrito!" + ilustración |
| Página 404 | Mapache con cara confundida + "Esta página se perdió" |
| Empty state del estudio | "¡Hola! ¿Qué imán vamos a crear hoy?" |
| Programa de fidelidad | "Puntos Lucams" con el mapache sosteniendo monedas |
| Email de bienvenida | Mapache saludando |
| Email de confirmación de orden | Mapache empacando |
| Email de envío | Mapache montado en bicicleta o cartero |
| Push notifications | Cara del mapache como ícono |
| Favicon | Cara del mapache simplificada |

> Pendiente: ilustraciones derivadas del logo en variantes (saludo, empacando, sorprendido). Se pueden generar con IA o pedir al ilustrador del logo original.

## Tipografía

### Familias propuestas (Google Fonts, gratis)

| Familia | Uso | Pesos | Por qué |
|---|---|---|---|
| **Fredoka** o **Baloo 2** | Display / Headlines | 400, 500, 600, 700 | Bubble redondeada, encaja con el logo |
| **Inter** o **Nunito** | Cuerpo / UI | 400, 500, 600 | Legibilidad alta, tono amigable |
| **Inter** (con `tabular-nums`) | Precios, labels técnicos | 500, 600 | Alineación consistente de números |

### Escala tipográfica

| Token | Tamaño | Line height | Uso |
|---|---|---|---|
| `text-display` | 48px / 3rem | 1.1 | Hero, títulos de campaña |
| `text-h1` | 36px / 2.25rem | 1.2 | Títulos de página |
| `text-h2` | 28px / 1.75rem | 1.3 | Secciones |
| `text-h3` | 22px / 1.375rem | 1.4 | Subsecciones |
| `text-body` | 16px / 1rem | 1.5 | Cuerpo |
| `text-small` | 14px / 0.875rem | 1.5 | Labels, captions |
| `text-tiny` | 12px / 0.75rem | 1.4 | Badges, footnotes |

> Pendiente del usuario: confirmar si la guía Canva especifica otras tipografías. Si no responde, se usan `Fredoka` + `Inter`.

## Tono de voz

- **Cercano y familiar.** Tutea ("tú", no "vos" ni "usted").
- **Cálido y emocional.** Los imanes son productos sentimentales (recuerdos, regalos, fechas especiales).
- **Lúdico pero claro.** No es serio corporativo, pero tampoco infantil. Adultos que disfrutan lo lindo.
- **Colombianismos suaves** ("súper bonito", "qué chévere", "regalo de pana") sin caer en exceso.
- **CTA directos** sin floritura: "Personaliza el tuyo", "Agregar al carrito", "Pagar ahora".

### Ejemplos de copy

| Contexto | ❌ Evitar | ✅ Usar |
|---|---|---|
| Hero | "Soluciones magnéticas para tu hogar" | "Tus recuerdos, en imán" |
| CTA primario | "Realizar compra" | "Pagar ahora" |
| Carrito vacío | "El carrito se encuentra vacío" | "¡Tu carrito está esperando! Agrega un imancito ✨" |
| Error de stock | "Producto no disponible" | "¡Uy! Se agotó. Te avisamos cuando vuelva 💌" |
| Confirmación | "Su pedido ha sido procesado exitosamente" | "¡Listo! Empezamos a preparar tu pedido 🎉" |

## Activos a producir

> Lista de archivos a crear cuando llegue el momento.

- `public/brand/logo.svg` — logo completo
- `public/brand/logo-mark.svg` — solo la mascota (para favicons, badges)
- `public/brand/logo-text.svg` — solo "LUCAMS SHOP" tipográfico
- `public/brand/favicon.ico` — multi-tamaño (16, 32, 48)
- `public/brand/apple-touch-icon.png` — 180×180
- `public/brand/og-image.png` — 1200×630 con mascota + tagline
- `public/brand/og-image-square.png` — 1080×1080 para Instagram
- `public/brand/mascota-saludando.svg`
- `public/brand/mascota-empacando.svg`
- `public/brand/mascota-confundida.svg` (para 404)
- `public/brand/mascota-loader.json` — Lottie animado

## Pendientes de branding

> Lista canónica de pendientes de branding del usuario. `PLAN.md` apunta aquí (no duplica).

- [ ] Logo en SVG/PNG transparente alta resolución (entregable del usuario).
- [ ] Variantes de la mascota para distintos estados (entregable del usuario o generadas con IA): saludando, empacando, confundida, en bicicleta, sosteniendo monedas (puntos), durmiendo (loader).
- [x] ~~Confirmación de tipografías de la guía Canva~~ → **cerrado en ADR-021 (2026-05-09):** Fredoka (display) + Inter (body). Si la guía Canva trae otras, se reemplaza con un cambio en `globals.css` `@theme`.
- [ ] Tagline / propuesta de valor en una frase.
- [ ] Foto del usuario / equipo (opcional, para sección "Sobre nosotros").
