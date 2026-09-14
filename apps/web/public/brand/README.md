# Assets de marca Lucams_shop

Acá viven los archivos del logo oficial Lucams y assets visuales derivados.
Todo lo que esté en `public/brand/` es servido directo por Next.js bajo
`/brand/<filename>` — accesible desde cualquier `<Image src="/brand/...">`.

## Archivos esperados

| Archivo                        | Uso                                                                                                            | Tamaño recomendado                                      |
| ------------------------------ | -------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------- |
| `lucams-logo.png` (o `.svg`)   | Logo completo (insignia + LUCAMS + SHOP). Usado en hero del home, página 404, emails, redes sociales           | min 512×512 PNG, ideal SVG                              |
| `lucams-mascot.png` (o `.svg`) | Solo el mapache kawaii recortado, fondo transparente. Usado en el header de cada página (badge chico)          | min 128×128 PNG cuadrado, fondo transparente, ideal SVG |
| `favicon.ico` / `favicon.svg`  | Favicon del browser. Generado a partir del mascot o del logo (Lucy decide). Vive en `apps/web/app/favicon.ico` | 32×32 + 16×16 ICO                                       |

## Convenciones

- **Formato preferido:** SVG > PNG con transparencia > JPG. SVG escala
  perfecto en cualquier tamaño, PNG es siguiente mejor, JPG último
  recurso porque pixela al escalar.
- **Naming:** kebab-case, sin acentos ni mayúsculas, prefijo `lucams-`
  para identificar la marca.
- **Optimización:** PNG/JPG deben pasar por TinyPNG o similar antes de
  commit. SVG por SVGO. Imágenes pesadas inflan el bundle y el TTI.
- **Uso desde código:** importar desde `<Image>` de `next/image`, NO
  desde `<img>` directo. Next.js maneja lazy load, srcset, formato
  óptimo (WebP/AVIF) automáticamente.

## Estado (actualizado 2026-09-03)

Los assets ya llegaron y están en uso en producción:

1. `lucams-logo.png` (468×468, RGBA) — recibido 2026-05-11. `components/lucams-logo.tsx`
   lo referencia automáticamente; el placeholder SVG kawaii de `components/brand-mark.tsx`
   queda como fallback onError.
2. `lucams-mascot.png` (370×355, RGBA) — recibido 2026-05-11.
3. Favicon brand-aware — desde 2026-07-22, con la convención de Next.js en `apps/web/app/`:
   `favicon.ico`, `icon.png`, `apple-icon.png`.

Pendiente: versiones **SVG** vectoriales del logo/mascota (hoy solo hay PNG — ver
`docs/BRANDING.md` § Activos a producir).
