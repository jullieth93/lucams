# Assets de marca Lucams_shop

Acá viven los archivos del logo oficial Lucams y assets visuales derivados.
Todo lo que esté en `public/brand/` es servido directo por Next.js bajo
`/brand/<filename>` — accesible desde cualquier `<Image src="/brand/...">`.

## Archivos esperados

| Archivo | Uso | Tamaño recomendado |
|---|---|---|
| `lucams-logo.png` (o `.svg`) | Logo completo (insignia + LUCAMS + SHOP). Usado en hero del home, página 404, emails, redes sociales | min 512×512 PNG, ideal SVG |
| `lucams-mascot.png` (o `.svg`) | Solo el mapache kawaii recortado, fondo transparente. Usado en el header de cada página (badge chico) | min 128×128 PNG cuadrado, fondo transparente, ideal SVG |
| `favicon.ico` / `favicon.svg` | Favicon del browser. Generado a partir del mascot o del logo (Lucy decide). Vive en `apps/web/app/favicon.ico` | 32×32 + 16×16 ICO |

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

## Acción pendiente al momento de este README (2026-05-11)

Estamos esperando que la operadora del proyecto suba:
1. `lucams-logo.png` (o equivalente) — actualmente vive como SVG kawaii
   placeholder dibujado a mano en `components/brand-mark.tsx`
2. `lucams-mascot.png` (o equivalente) — actualmente reusa el placeholder
3. `favicon.ico` brand-aware — actualmente Next.js default

Cuando esos archivos lleguen, `components/lucams-logo.tsx` los referencia
automáticamente y el placeholder SVG queda como fallback histórico.
