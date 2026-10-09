# 2026-10-09 — Certificación de referencias cross-ambiente (URLs de storage)

> Origen: bug latente del sync de galería (filas de PRD con host de STG → prediseñados rotos en PRD, detectado por el owner). Tras el fix (rehost de las 192 filas en PRD + corrección del script en `55a272a`), barrido de certificación de TODAS las columnas con URLs en los 3 ambientes. Read-only. Harness: `tmp/diag-20261008/cert-url-refs.mjs`.

## Veredicto: ✓ CERTIFICADO — 0 referencias cruzadas, 0 objetos faltantes

| Ambiente | Columnas auditadas | Resultado |
|---|---|---|
| STG | Product.images (12), ProductVariant.images (230), DesignGalleryImage.imageUrl (192) / imageUrlB (127), Design.previewUrl (4), Design.productionUrls (24), DesignAsset.storageUrl (210), LetterTile.imageUrl (53), Category.image (1) | 100% host propio o path relativo ✓ |
| PRD | mismas columnas (12/230/192/127/1/12/19/53/1) | 100% host propio o path relativo ✓ |
| LOCAL | mismas (53/230/192/127/1) | 100% host local ✓; las 41 refs "externas" de Product.images son hotlinks Unsplash de los seeds canónicos (dato preexistente documentado, no cruce de ambientes) |

## Qué se verificó

1. **Clasificación de host** de cada URL: propio del ambiente / otro ambiente / localhost-LAN / externa. Cero URLs de un ambiente apuntando a otro en los tres.
2. **Existencia de objetos**: cada path referenciado bajo `/storage/v1/object/public/` existe en `storage.objects` del propio ambiente (muestra de hasta 400 por columna — cobertura total de las columnas activas). Cero huérfanos.
3. **Spot-check HTTP**: imagen de galería de PRD responde 200 con bytes reales desde el bucket de PRD; asignación de prediseñado confirmada por el owner en PRD.

## Contexto y fix asociados

- Bug: `sync-gallery-stg-to-prd.mjs` copiaba `imageUrl`/`imageUrlB` verbatim (host STG) — latente desde 2026-10-03. El guard anti-SSRF de `assignPredesignedToDesignAction` rechazaba esos URLs en PRD («Diseño no disponible»).
- Fix: rehost in situ de las 192 filas en PRD (objetos ya estaban en el bucket) + el script ahora reescribe el host al destino (insert y update) + `--to=local` en los dos scripts de sync (galería sincronizada a LOCAL: 192 filas + 319 objetos).
- Lecciones registradas en `docs/OPERATIONS.md` § Changelog operativo (2026-10-09 tarde, addendum h).

## Notas

- El caché `gallery-thumbs` (TTL 1h) puede servir miniaturas con el host viejo tras un fix de este tipo — se sana solo; la acción de asignación lee la fila fresca y no depende de ese caché.
- Excepciones deliberadas vigentes (ADR-121): `AdminUser` QA en STG, crons de email solo en PRD, tablas/funciones del uptime-monitor solo en STG, cupón `LOCURA` solo en STG (pendiente decisión owner), campo CMS huérfano `estudio.comun.ver-diseno` solo en STG (sin consumidor).
