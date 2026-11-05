# Activos de marca — Lucams Shop

Esta carpeta (`apps/web/public/brand/`) aloja los archivos gráficos oficiales de **Lucams Shop**.
Todo archivo ubicado en `public/brand/` es servido directamente por Next.js bajo `/brand/<archivo>`
y puede consumirse desde el frontend mediante `<Image src="/brand/...">`.

## Inventario actual en producción y tamaños recomendados

| Archivo / Ruta                                       | Uso principal                                                                                  | Estado actual en repo                                                                                | Tamaño / formato ideal recomendado                       |
| ---------------------------------------------------- | ---------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- | -------------------------------------------------------- |
| `/brand/lucams-logo.png`                             | Logo completo (insignia + wordmark) en hero del home, página 404, correos y metadatos sociales | `468×468` RGBA; usado por `components/lucams-logo.tsx` con fallback `onError` en `brand-mark.tsx`    | Mínimo `512×512` PNG RGBA; ideal `.svg` vectorial        |
| `/brand/lucams-mascot.png`                           | Mapache kawaii recortado con fondo transparente (badge del header, estados vacíos y acentos)   | `370×355` RGBA con transparencia                                                                     | Mínimo `128×128` PNG cuadrado transparente; ideal `.svg` |
| `apps/web/app/{favicon.ico,icon.png,apple-icon.png}` | Favicon del navegador, pestaña e instalación PWA (`app/manifest.ts`)                           | `favicon.ico` (`32×32 + 16×16` ICO), `icon.png` y `apple-icon.png` bajo convención nativa App Router | `32×32 + 16×16` ICO + PNG/SVG de alta densidad           |

## Convenciones de ingeniería y diseño

- **Nombre de marca (`ADR-138`):**
  escribe siempre **«Lucams»** o **«Lucams Shop»** (está prohibido usar apóstrofo o guion bajo en
  textos visibles o prosa).
- **Jerarquía de formatos:**
  **`SVG > PNG con transparencia > JPG`**. SVG escala con nitidez perfecta en cualquier densidad de
  pantalla; PNG RGBA es el siguiente estándar cuando el activo es raster; JPG queda como último
  recurso porque carece de canal alfa y pixela los bordes gráficos.
- **Nomenclatura (`naming`):**
  usa siempre `kebab-case`, sin acentos ni mayúsculas, con prefijo `lucams-` (por ejemplo
  `lucams-logo.png`, `lucams-mascot.png`) para identificar inequívocamente los activos de marca.
- **Optimización previa a commit:**
  pasa todo PNG/JPG por TinyPNG (o compresor equivalente sin pérdida perceptible) y limpia todo SVG
  con SVGO antes de versionar para no inflar el peso de página ni degradar el LCP/TTI.
- **Consumo desde interfaz vs correos:**
  en componentes web importa siempre mediante `<Image>` de `next/image` (gestiona lazy loading,
  `srcset` responsive y conversión automática a WebP/AVIF) y evita `<img>` directo. La única
  excepción son las plantillas de correo HTML (`features/emails/`), que exigen URL absoluta
  `https://` sobre el dominio canónico `lucamsshop.com`.
- **Fallback resiliente en UI:**
  `components/lucams-logo.tsx` carga `/brand/lucams-logo.png` y conmuta automáticamente al isotipo
  vectorial kawaii de `components/brand-mark.tsx` en su manejador `onError` si falla la carga del
  activo raster.

## Ejemplo rápido de consumo

```tsx
// En componentes Next.js (con fallback automático onError hacia BrandMark):
import { LucamsLogo } from "@/components/lucams-logo";
<LucamsLogo size={40} />;
```

## Pendiente opcional de diseño

- Incorporar versiones vectoriales `.svg` equivalentes de `lucams-logo` y `lucams-mascot` cuando se
  exporten desde el editable maestro (hoy operan en PNG RGBA optimizados; consulta el sistema visual
  completo en [`docs/BRANDING.md`](../../../../docs/BRANDING.md)).
