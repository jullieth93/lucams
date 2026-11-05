# Branding — Lucams Shop

> **Nombre de marca (`ADR-138`):** la forma visible obligatoria es **«Lucams»** o **«Lucams Shop»** — nunca usar apóstrofo posesivo anglosajón ni guion bajo en textos visibles al cliente, correos, documentos legales o panel administrativo. El guion bajo únicamente sobrevive en identificadores técnicos externos o heredados (como el handle de redes sociales `@lucams_shop`, el tenant de Aveonline, nombres internos de cookies `lucams_*` o slugs de infraestructura/repositorio). En el código, la constante canónica vive en [`../apps/web/lib/site.ts`](../apps/web/lib/site.ts) (`SITE_NAME = "Lucams Shop"`) — todo texto nuevo visible debe consumir la constante o la grafía oficial, y los 8 documentos legales canónicos en `packages/db/legal-content/*.md` (junto con sus `FALLBACK` en `apps/web/app/legal/*/page.tsx`) están sincronizados a esta forma. El servicio logístico propio en Bogotá se denomina siempre **«Envío Lucams»** (o su identificador corto **`LUCAMS`**, `LUCAMS_CARRIER_NAME` en [`../apps/web/features/shipping/lucams-shipping.ts`](../apps/web/features/shipping/lucams-shipping.ts)); en firmas humanas del equipo: **«el equipo Lucams»**.

## Logo

Insignia circular con:

- **Mascota mapache** estilo kawaii sobre fondo morado lavanda, con mejillas rosadas y mirada amigable.
- Tipografía **«LUCAMS»** en estilo bubble/balloon con letras multicolor (turquesa, rosa, coral, amarillo).
- **«SHOP»** en pequeño debajo, color púrpura oscuro.
- **Corazones amarillos** flotando como acento decorativo.
- Trazo circular tipo brushstroke alrededor.

> **Activos en uso (desde `2026-05-11`):** la versión oficial en PNG con transparencia vive en [`../apps/web/public/brand/`](../apps/web/public/brand/README.md) (`lucams-logo.png` `468×468` RGBA y `lucams-mascot.png` `370×355` RGBA) y está activa en producción vía [`../apps/web/components/lucams-logo.tsx`](../apps/web/components/lucams-logo.tsx). Queda como pendiente opcional la versión **SVG** vectorial de alta resolución (hoy el componente consume el PNG optimizado y [`../apps/web/components/brand-mark.tsx`](../apps/web/components/brand-mark.tsx) actúa como respaldo vectorial).

### Patrón de marca «Lucams» (reverso de separadores)

Decisión de producto `2026-11-03` (`ADR-190`): la cara posterior (cara B) sin diseño personalizado en los separadores magnéticos de 2 caras se imprime con un **patrón de marca sutil**: el wordmark script «Lucams» repetido en diagonal (`-24°`, disposición tipo ladrillo) en tono gris-lila `#E9E6F0` sobre blanco. Se **genera de forma determinista en código** (no depende de un archivo estático): el módulo puro [`../apps/web/features/personalization/brand-back-pattern.ts`](../apps/web/features/personalization/brand-back-pattern.ts) dibuja exactamente el mismo patrón en el lienzo 2D y las escenas 3D del Estudio (usando la familia `Dancing Script` de [`../apps/web/app/estudio/fonts.ts`](../apps/web/app/estudio/fonts.ts)) y en el render de producción a 300 DPI (`DancingScript.ttf` vendorizado en `@napi-rs/canvas`). Si en el futuro se incorpora un lettering vectorial propietario, el trazo puede sustituirse en ese único módulo sin alterar el cableado de Estudio ni taller.

## Paleta de colores

### Tabla de tokens

| Token                         | HEX       | RGB           | HSL           | Uso principal                                                 |
| ----------------------------- | --------- | ------------- | ------------- | ------------------------------------------------------------- |
| `brand-purple` (primario)     | `#7C6AAD` | 124, 106, 173 | `253 26% 55%` | Fondos destacados, header, botones primarios y `CloseXButton` |
| `brand-purple-dark`           | `#3D2E5C` | 61, 46, 92    | `261 33% 27%` | Texto principal sobre claro, títulos `h1`–`h3`                |
| `brand-turquoise`             | `#5DD9D1` | 93, 217, 209  | `176 60% 61%` | Acento decorativo, bordes secundarios, insignias «nuevo»      |
| `brand-pink`                  | `#E85B9F` | 232, 91, 159  | `331 75% 63%` | CTAs de conversión directa, insignias de oferta               |
| `brand-coral`                 | `#F58A6F` | 245, 138, 111 | `12 86% 70%`  | Acentos cálidos, ilustraciones y banners                      |
| `brand-yellow`                | `#FFD93D` | 255, 217, 61  | `49 100% 62%` | Highlights, corazones, cintillos «envío gratis»               |
| `brand-cream`                 | `#FFF8F0` | 255, 248, 240 | `32 100% 97%` | Fondos suaves alternativos al blanco puro                     |
| `brand-muted` (`ADR-044`)     | `#6B6280` | 107, 98, 128  | `258 13% 44%` | Texto secundario accesible (~5.5:1 sobre blanco/crema)        |
| `brand-pink-ink` (`ADR-044`)  | `#C42B76` | 196, 43, 118  | `331 64% 47%` | Texto o enlace rosa pequeño con contraste AA                  |
| `brand-coral-ink` (`ADR-044`) | `#B0492E` | 176, 73, 46   | `12 59% 44%`  | Texto coral pequeño con contraste AA                          |
| `background` (neutral-white)  | `#FFFFFF` | 255, 255, 255 | `0 0% 100%`   | Fondos principales                                            |
| `foreground` (neutral-text)   | `#1F1733` | 31, 23, 51    | `258 38% 15%` | Texto corrido de cuerpo                                       |
| `muted-foreground`            | `#6B6383` | 107, 99, 131  | `253 14% 45%` | Texto secundario shadcn, placeholders                         |
| `success`                     | `#3FBE6E` | 63, 190, 110  | `142 50% 50%` | Confirmaciones, estados «pagado»                              |
| `error`                       | `#E84B5B` | 232, 75, 91   | `354 78% 60%` | Errores, validaciones destructivas                            |
| `warning`                     | `#F5A623` | 245, 166, 35  | `37 91% 55%`  | Avisos preventivos, alertas de stock bajo                     |

> Los tonos de **texto accesible** `brand-muted` (`#6B6280`), `brand-pink-ink` (`#C42B76`) y `brand-coral-ink` (`#B0492E`) definidos en `ADR-044` son derivados oscurecidos de la marca para texto pequeño o interactivo donde el tono pastel no alcanza WCAG AA (`≥ 4.5:1`). No reemplazan la paleta principal: los 7 colores kawaii originales se mantienen intactos para fondos, decoración y titulares grandes.

### Implementación en Tailwind v4 (CSS-first)

> **Tailwind v4 usa configuración CSS-first con `@theme inline` en [`../apps/web/app/globals.css`](../apps/web/app/globals.css), sin `tailwind.config.ts` (`ADR-015`).** Incluye además `@custom-variant dark (&:where(.dark, .dark *));` para que las utilidades `dark:*` respondan exclusivamente a la clase `.dark` y nunca al `prefers-color-scheme` del sistema operativo móvil.

```css
/* apps/web/app/globals.css */
@import "tailwindcss";
@import "tw-animate-css";

@custom-variant dark (&:where(.dark, .dark *));

/* Los valores reales viven en :root como variables --brand-*; @theme inline
   los mapea al namespace --color-* y --font-* que genera las utilidades
   (bg-brand-purple, text-brand-pink-ink, font-display, animate-float, etc.). */
@theme inline {
  /* Marca Lucams — kawaii colombiano */
  --color-brand-purple: var(--brand-purple);
  --color-brand-purple-dark: var(--brand-purple-dark);
  --color-brand-turquoise: var(--brand-turquoise);
  --color-brand-pink: var(--brand-pink);
  --color-brand-coral: var(--brand-coral);
  --color-brand-yellow: var(--brand-yellow);
  --color-brand-cream: var(--brand-cream);

  /* Tonos de TEXTO accesibles (WCAG AA ≥4.5:1) — ADR-044 */
  --color-brand-muted: var(--brand-muted);
  --color-brand-pink-ink: var(--brand-pink-ink);
  --color-brand-coral-ink: var(--brand-coral-ink);

  /* Neutrales y feedback */
  --color-background: var(--background);
  --color-foreground: var(--foreground);
  --color-success: var(--success);
  --color-error: var(--error);
  --color-warning: var(--warning);

  /* shadcn/ui semantic tokens */
  --color-card: var(--card);
  --color-card-foreground: var(--card-foreground);
  --color-popover: var(--popover);
  --color-popover-foreground: var(--popover-foreground);
  --color-primary: var(--primary);
  --color-primary-foreground: var(--primary-foreground);
  --color-secondary: var(--secondary);
  --color-secondary-foreground: var(--secondary-foreground);
  --color-muted: var(--muted);
  --color-muted-foreground: var(--muted-foreground);
  --color-accent: var(--accent);
  --color-accent-foreground: var(--accent-foreground);
  --color-destructive: var(--destructive);
  --color-destructive-foreground: var(--destructive-foreground);
  --color-border: var(--border);
  --color-input: var(--input);
  --color-ring: var(--ring);

  /* Tipografías locales (next/font/local en app/layout.tsx) */
  --font-display: var(--font-fredoka), "Baloo 2", system-ui, sans-serif;
  --font-body: var(--font-inter), "Nunito", system-ui, sans-serif;

  /* Radii suaves kawaii + animaciones de marca */
  --radius-sm: calc(var(--radius) - 4px);
  --radius-md: calc(var(--radius) - 2px);
  --radius-lg: var(--radius);
  --radius-xl: calc(var(--radius) + 4px);
  --animate-wiggle: wiggle 0.6s ease-in-out infinite;
  --animate-float: float 3s ease-in-out infinite;
  --animate-pop: pop 0.4s ease-out;
}

:root {
  --brand-purple: #7c6aad;
  --brand-purple-dark: #3d2e5c;
  --brand-turquoise: #5dd9d1;
  --brand-pink: #e85b9f;
  --brand-coral: #f58a6f;
  --brand-yellow: #ffd93d;
  --brand-cream: #fff8f0;

  --brand-muted: #6b6280;
  --brand-pink-ink: #c42b76;
  --brand-coral-ink: #b0492e;

  --background: #ffffff;
  --foreground: #1f1733;

  --success: #3fbe6e;
  --error: #e84b5b;
  --warning: #f5a623;
  /* … tokens semánticos completos shadcn/ui y bloque .dark en apps/web/app/globals.css … */
}
```

> **Ejemplo de uso:** `class="bg-brand-purple text-white font-display"`. Las clases utilitarias se generan automáticamente según el prefijo del token (`--color-*` → `bg-*` / `text-*` / `border-*` / `fill-*`, `--font-*` → `font-*`, `--animate-*` → `animate-*`).

> **Convenciones Tailwind v4 + shadcn/ui (`ADR-015`):** estilo `new-york`, paquete `tw-animate-css` (en reemplazo del deprecado `tailwindcss-animate`) y notificaciones con `sonner` (en lugar de `toast`).

### Reglas de uso

- **Botones primarios**: fondo `brand-purple`, texto blanco. Hover: oscurece 8 %.
- **Botones de cierre («X») de diálogos, sheets y modales**: fondo `brand-purple`, «X» blanca, redondos — componente único `CloseXButton` / `CLOSE_X_CLASS` ([`../apps/web/components/ui/close-x-button.tsx`](../apps/web/components/ui/close-x-button.tsx)). Nunca botones ghost grises: el cierre debe ser nítido sobre fotografías y cualquier fondo.
- **Botones secundarios**: borde `brand-turquoise`, texto `brand-purple-dark`, fondo transparente.
- **CTA de conversión directa («Comprar ahora» / «Pagar ahora»)**: fondo `brand-pink`, texto blanco. Reservado para acciones clave de conversión.
- **Banner «Envío gratis»**: fondo `brand-yellow`, texto `brand-purple-dark`.
- **Headings (`h1`–`h3`)**: color `brand-purple-dark`, fuente `font-display`.
- **Cuerpo**: color `foreground` (`#1F1733`), fuente `font-body`.
- **Enlaces pequeños o interactivos**: usar tonos con contraste suficiente (`brand-purple`, `brand-purple-dark` o `brand-pink-ink`) con subrayado en hover; `brand-turquoise` solo sobre fondos oscuros.
- **Fondos de sección**: alternar blanco puro (`background`) y `brand-cream` para dar ritmo visual.

### Accesibilidad

- Contraste `foreground` (`#1F1733`) sobre blanco (`#FFFFFF`) = `> 14:1` ✅ AAA.
- Contraste `brand-purple-dark` (`#3D2E5C`) sobre blanco (`#FFFFFF`) = `11.3:1` ✅ AAA.
- Contraste `brand-muted` (`#6B6280`) sobre blanco/crema = `~5.5:1` ✅ AA.
- Contraste `brand-purple` (`#7C6AAD`) sobre blanco (`#FFFFFF`) = `4.6:1` ✅ AA.
- Contraste `brand-pink-ink` (`#C42B76`) y `brand-coral-ink` (`#B0492E`) sobre blanco = `≥ 4.5:1` ✅ AA (`ADR-044`).
- Contraste `brand-turquoise` (`#5DD9D1`) sobre blanco = `1.7:1` ❌ — prohibido como texto sobre blanco; usar únicamente sobre `brand-purple-dark` (contraste `6.2:1` ✅) o como fondo decorativo con texto oscuro.
- Contraste `brand-yellow` (`#FFD93D`) sobre blanco = `1.4:1` ❌ — prohibido como texto; usar exclusivamente como fondo con texto `brand-purple-dark`.

## Mascota mapache (Lucams)

El mapache es **personaje recurrente de la experiencia**, no solo parte del logotipo:

| Contexto                       | Implementación                                                |
| ------------------------------ | ------------------------------------------------------------- |
| Loader de páginas              | Mapache animado (Lottie o ilustración) girando o saltando     |
| Carrito vacío                  | «¡Lucams está esperando que llenes el carrito!» + ilustración |
| Página 404                     | Mapache con expresión confundida + «Esta página se perdió»    |
| Empty state del Estudio        | «¡Hola! ¿Qué imán vamos a crear hoy?»                         |
| Programa de fidelidad          | «Puntos Lucams» con el mapache sosteniendo monedas            |
| Email de bienvenida            | Mapache saludando                                             |
| Email de confirmación de orden | Mapache empacando tu pedido                                   |
| Email de envío                 | Mapache cartero o en bicicleta                                |
| Notificaciones / avisos        | Rostro del mapache como avatar amigable                       |
| Favicon e íconos de app        | Rostro del mapache simplificado                               |

> Pendiente opcional: ilustraciones vectoriales derivadas en poses específicas (saludando, empacando, sorprendido/confundido); actualmente operan sobre el recorte oficial `lucams-mascot.png` y `brand-mark.tsx`.

## Tipografía

### Arquitectura de fuentes locales (`ADR-021`, `ADR-132`)

El proyecto **no descarga fuentes desde `fonts.googleapis.com` ni en build ni en runtime**: todas las familias viven vendorizadas en `apps/web/assets/fonts/` y se cargan con `next/font/local`, separadas en 3 capas para optimizar el LCP móvil y garantizar fidelidad de impresión:

1. **Sitio global ([`../apps/web/app/layout.tsx`](../apps/web/app/layout.tsx)):** sirve únicamente los **subsets latinos `.woff2`** ultralivianos (`Fredoka.subset.woff2`: `159 KB → 65 KB`, `weight: "300 700"`; `Inter.subset.woff2`: `876 KB → 67 KB`, `weight: "100 900"`) con `display: "swap"` (`ADR-132`).
2. **Estudio de personalización ([`../apps/web/app/estudio/fonts.ts`](../apps/web/app/estudio/fonts.ts) + `app/estudio/layout.tsx`):** aísla las **6 familias creativas `.ttf`** (`Caveat.ttf`, `Baloo2.ttf`, `Nunito.ttf`, `PatrickHand.ttf`, `PlayfairDisplay.ttf`, `DancingScript.ttf`; ~2 MB en conjunto) fuera del layout raíz y con `preload: false`. El lienzo las solicita **bajo demanda** mediante `document.fonts.load()` solo cuando el cliente elige efectivamente esa fuente.
3. **Render de producción a 300 DPI (`@napi-rs/canvas` server-side):** registra por ruta en `GlobalFonts` los archivos `.ttf` completos de `apps/web/assets/fonts/` (`Fredoka.ttf`, `Inter.ttf` y las 6 familias del Estudio), asegurando paridad tipográfica exacta entre pantalla e imprenta.

### Familias tipográficas en uso

| Familia                                                                          | Ámbito y archivo local                                  | Pesos               | Propósito                                                                   |
| -------------------------------------------------------------------------------- | ------------------------------------------------------- | ------------------- | --------------------------------------------------------------------------- |
| **Fredoka** (`--font-fredoka`)                                                   | Global (`Fredoka.subset.woff2`) + 300 DPI (`TTF`)       | 300–700             | Display y titulares (`font-display`); redondeada y afín al logo multicolor  |
| **Inter** (`--font-inter`)                                                       | Global (`Inter.subset.woff2`) + 300 DPI (`TTF`)         | 100–900             | Cuerpo de interfaz y lectura general (`font-body`)                          |
| **Inter** con `tabular-nums`                                                     | Global (`Inter.subset.woff2`)                           | 500, 600            | Precios COP, contadores, tablas financieras y etiquetas técnicas            |
| **Caveat · Baloo 2 · Nunito · Patrick Hand · Playfair Display · Dancing Script** | Solo `/estudio/*` (`*.ttf`, `preload: false`) + 300 DPI | Variables / 400–900 | Selector tipográfico de calendarios, textos personalizados y patrón reverso |

### Escala tipográfica

| Token          | Tamaño          | Line height | Uso                      |
| -------------- | --------------- | ----------- | ------------------------ |
| `text-display` | 48px / 3rem     | 1.1         | Hero, títulos de campaña |
| `text-h1`      | 36px / 2.25rem  | 1.2         | Títulos de página        |
| `text-h2`      | 28px / 1.75rem  | 1.3         | Secciones principales    |
| `text-h3`      | 22px / 1.375rem | 1.4         | Subsecciones y tarjetas  |
| `text-body`    | 16px / 1rem     | 1.5         | Cuerpo general           |
| `text-small`   | 14px / 0.875rem | 1.5         | Labels, captions         |
| `text-tiny`    | 12px / 0.75rem  | 1.4         | Badges, notas al pie     |

## Tono de voz

- **Cercano y familiar (`es-CO` en tuteo estricto):** tratamos siempre de **«tú»** (_«diseña el tuyo», «elige tu tamaño», «cuéntanos»_). Están prohibidos tanto el voseo (auditado automáticamente en `make check`) como el trato corporativo distante de «usted».
- **Cálido y emocional:** los imanes atesoran recuerdos familiares, viajes, mascotas y celebraciones especiales.
- **Lúdico pero claro:** alegre y cercano sin volverse infantil; pensado para jóvenes y adultos que disfrutan los detalles bonitos.
- **Colombianismos suaves** (_«súper bonito», «qué chévere»_) con mesura y naturalidad.
- **CTAs directos sin floritura:** _«Personaliza el tuyo», «Agregar al carrito», «Pagar ahora», «Rastrear pedido»_.
- **Rigor comercial (Ley 1480):** nunca prometer entregas garantizadas en fecha fija cuando interviene transportadora; informar siempre por separado días hábiles de producción y días estimados de envío.

### Ejemplos de copy

| Contexto       | ❌ Evitar                                  | ✅ Usar                                             |
| -------------- | ------------------------------------------ | --------------------------------------------------- |
| Hero           | "Soluciones magnéticas para tu hogar"      | "Tus recuerdos, en imán"                            |
| CTA primario   | "Realizar compra"                          | "Pagar ahora"                                       |
| Carrito vacío  | "El carrito se encuentra vacío"            | "¡Tu carrito está esperando! Agrega un imancito ✨" |
| Error de stock | "Producto no disponible"                   | "¡Uy! Se agotó. Te avisamos cuando vuelva 💌"       |
| Confirmación   | "Su pedido ha sido procesado exitosamente" | "¡Listo! Empezamos a preparar tu pedido 🎉"         |

## Activos en producción y por producir

> **Activos operativos hoy:** existen `apps/web/public/brand/lucams-logo.png` (`468×468` RGBA) y `apps/web/public/brand/lucams-mascot.png` (`370×355` RGBA) en producción. Los íconos de aplicación siguen la convención nativa de Next.js en `apps/web/app/`: `favicon.ico`, `icon.png` y `apple-icon.png`. Las imágenes sociales (`1200×630`) se generan dinámicamente con `apps/web/app/opengraph-image.tsx` y `apps/web/app/twitter-image.tsx`. Activos opcionales por producir:

- `public/brand/logo.svg` / `logo-mark.svg` / `logo-text.svg` — versiones vectoriales maestras (hoy cubiertas por PNG RGBA + `brand-mark.tsx`)
- `public/brand/mascota-saludando.svg`
- `public/brand/mascota-empacando.svg`
- `public/brand/mascota-confundida.svg` (para página 404)
- `public/brand/mascota-loader.json` — animación Lottie ligera

## Pendientes de branding

> Lista viva de entregables opcionales de identidad visual (referenciada desde [`ROADMAP.md`](ROADMAP.md)).

- [~] ~~Logo en SVG/PNG transparente de alta resolución~~ → **PNG oficial recibido (`2026-05-11`) y activo en producción** (`public/brand/lucams-logo.png`). Queda opcional únicamente la versión **SVG** vectorial.
- [ ] Variantes ilustradas de la mascota para estados específicos (saludando, empacando, confundida, en bicicleta, sosteniendo monedas de Puntos Lucams, durmiendo en loader); el recorte base `lucams-mascot.png` ya opera en producción.
- [x] ~~Confirmación y optimización de tipografías oficiales~~ → **cerrado en `ADR-021` y `ADR-132`:** `Fredoka` (display) + `Inter` (body) servidas localmente en `.subset.woff2` y `.ttf`.
- [ ] Tagline / propuesta de valor corta unificada en una sola frase maestra.
- [ ] Fotografía real de taller / equipo humano (opcional, para enriquecer la página «Sobre nosotros»).
