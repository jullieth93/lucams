I have everything needed. Compiling the report.

# Frente 4 — Validación de input + seguridad de subida de archivos

Auditoría contra `docs/SECURITY.md` §"Validación de input" (L471-530), §"File upload y Storage" (L567-595) y el código real. Stack confirmado: `sharp@0.34.5` (sin `file-type` ni `image-size` en `package.json`).

## Resumen ejecutivo

| # | Control | Estado | Severidad |
|---|---------|--------|-----------|
| 1 | MIME real (magic bytes) post-upload | ❌ falta (ambas vías) | **P1** |
| 2 | Límite de tamaño server-side | ✅ implementado | — |
| 3 | Strip EXIF (fotos de cliente) | ✅ implementado | — |
| 4 | Strip EXIF (fotos admin/producto) | 🟡 parcial (no se hace) | P2 |
| 5 | Content-type forzado en Storage | ✅ implementado | — |
| 6 | Nombres de archivo sanitizados | ✅ implementado (UUID) | — |
| 7 | Bucket cliente privado + signed URLs | ✅ implementado | — |
| 8 | Bucket producto público | ✅ correcto por diseño | — |
| 9 | Zod en server actions de upload | ✅ implementado | — |
| 10 | Rate limit en upload de fotos cliente | ❌ falta | **P1** |
| 11 | `metadata.owner_id` confiable para RLS | 🟡 frágil (cast `as never`) | P1 |
| 12 | SSRF / inyección en URLs | ✅ sin vectores | — |

---

## 1. MIME real (magic bytes) — ❌ FALTA · P1

**Foco principal del frente.** Ni el upload de producto ni el de cliente verifican los magic bytes del contenido. Confían en `file.type` (Content-Type que envía el navegador, falsificable).

- **Fotos de producto** — `apps/web/lib/storage.ts:77` valida `ALLOWED_MIME.has(file.type)` y en `:87` reenvía ese mismo `file.type` a Storage como `contentType`. `file.type` viene del `<input>` del cliente (`product-images.tsx:90`, atributo `accept`), no del binario. Un admin (o un atacante con sesión admin) podría subir un `.svg`/`.html`/`.exe` renombrado con Content-Type spoofeado a `image/png`.
- **Fotos de cliente** — `apps/web/features/personalization/actions.ts:219` valida `mimeType: file.type` vía Zod (`UploadAssetMetadataSchema`, `schemas.ts:188-196`), y `lib/storage.ts:191` revalida contra `CUSTOMER_UPLOAD_ALLOWED_MIME`. **Ambas usan `file.type`, no el contenido real.**

`docs/SECURITY.md:582` exige explícitamente: *"server valida MIME real con `file-type` package (no confiar en extensión ni Content-Type del cliente)"*. **No se cumple en ninguna de las dos rutas.**

**Mitigación parcial existente (por qué es P1 y no P0):**
- Los buckets declaran `allowed_mime_types` (migración `00000000000005:50` y `00000000000006:26`). Pero el server sube con **`service_role`** (`lib/supabase/service.ts`), y `service_role` bypassa RLS; la validación de `allowed_mime_types` se aplica según el `content-type` del request, que el server fija desde `file.type` — sigue siendo el valor no verificado. **No es una segunda línea de defensa real.** `[pendiente verificación: comportamiento exacto de allowed_mime_types con service_role en Supabase Storage — consultar supabase.com/docs/guides/storage]`
- Para fotos de cliente, `sharp().rotate().toBuffer()` (`storage.ts:207-220`) **re-decodifica y re-encoda** la imagen. Un archivo que no sea imagen real hace que sharp lance excepción → upload rechazado (`storage.ts:226-231`). Esto es un filtro de facto fuerte en la ruta cliente. **La ruta producto NO pasa por sharp** — sube el buffer crudo (`storage.ts:84-90`), sin re-procesamiento → ahí el riesgo es mayor.

**Fix (AUTÓNOMO, esfuerzo M):**
1. Agregar `file-type` (`pnpm add file-type`, >30 días en npm — OK).
2. En `uploadProductImage` y `uploadCustomerPhoto`, tras `Buffer.from(await file.arrayBuffer())`: `const ft = await fileTypeFromBuffer(buffer); if (!ft || !ALLOWED_MIME.has(ft.mime)) throw new StorageError("INVALID_TYPE", ...)`. Usar `ft.mime` (no `file.type`) como `contentType` y para inferir extensión.
3. Para la ruta producto, considerar pasar también por `sharp().rotate().toBuffer()` para neutralizar payloads polyglot.

---

## 2. Límite de tamaño server-side — ✅ · 3. Strip EXIF (cliente) — ✅

- **Tamaño**: producto `storage.ts:74` (5 MB) + bucket `file_size_limit` 5242880. Cliente `storage.ts:185` (10 MB) + Zod `schemas.ts:195` + bucket 10485760. Triple capa. ✅
- **EXIF cliente**: `storage.ts:207` `sharp(buffer).rotate()` auto-orienta y descarta metadata (sharp por defecto **no** copia metadata salvo `.withMetadata()`; `.rotate()` aplica la orientación EXIF y luego el encode la elimina). HEIC→JPEG también re-encoda. `exifStripped: true` se persiste en `DesignAsset` (`actions.ts:286`). **GPS/geolocalización de fotos de cliente se elimina correctamente.** ✅

> Nota de robustez (P3, AUTÓNOMO): el strip depende de comportamiento implícito de sharp. Hacerlo explícito y auditable: si en el futuro alguien añade `.withMetadata()` para preservar orientación, reintroduce el leak EXIF silenciosamente. Recomiendo un comentario y, mejor, un test que suba un JPEG con tag GPS y verifique que el output no lo tiene.

## 4. Strip EXIF en fotos de producto (admin) — 🟡 P2

`uploadProductImage` (`storage.ts:65-98`) sube el buffer **crudo sin tocar metadata**. Las fotos de producto las sube Lucy/admin desde su equipo; pueden contener EXIF GPS de la ubicación del estudio/casa. Son públicas (bucket `product-images`, `public=true`). Riesgo de privacidad bajo pero real (geolocalización del negocio expuesta en headers de imágenes públicas).

**Fix (AUTÓNOMO, esfuerzo S):** pasar el buffer por `sharp(buffer).rotate().toBuffer()` antes del upload — resuelve esto y de paso da el re-encode que mitiga el #1 en esta ruta.

## 5. Content-type forzado — ✅ · 6. Nombres sanitizados — ✅

- `contentType` se setea explícito en ambos uploads (`storage.ts:87`, `:242`). ✅ (mejora: usar el MIME detectado, ver #1).
- Nombres: `${productId}/${randomUUID()}.${ext}` (`storage.ts:82`) y `${ownerId}/${designSegment}/${randomUUID()}.${ext}` (`storage.ts:235`). El nombre **original del cliente nunca se usa** — sin path traversal ni colisión. `ext` se deriva de un `switch` cerrado (`inferExtension`, `storage.ts:45-58`), no del nombre. ✅

---

## 7. Bucket cliente privado + signed URLs — ✅ · 8. Producto público — ✅

- `customer-uploads`: `public=false` (`00000000000006:24`), RLS SELECT/DELETE `owner_or_admin` por `metadata->>'owner_id' = auth.uid()` (`:45-68`). Acceso vía signed URL TTL 3600s (`storage.ts:258`), refresco gated por ownership (`page.tsx:104` `getOwnedDesign` antes de `refreshCustomerUploadSignedUrl`). UUID en filename previene enumeración. ✅ Coherente con SECURITY.md L559 y STRIDE Flujo 3.
- `production-assets`: `public=false`, RLS admin-only (`:127-132`). ✅
- `product-images`: `public=true` por diseño (next/image optimizer), RLS write=admin (`00000000000005:76-93`). Correcto — son fotos de catálogo públicas. ✅

## 11. `metadata.owner_id` para RLS — 🟡 frágil · P1

`storage.ts:248` pasa `metadata: { owner_id }` con cast `as never` y comentario admitiendo incertidumbre sobre si el JS client lo persiste. **Toda la RLS owner-only de `customer-uploads` depende de que ese campo quede guardado** en `storage.objects.metadata`. Si Supabase lo guarda en `user_metadata` u otra columna (la API distingue `metadata` de `user_metadata`), la policy `(metadata->>'owner_id') = auth.uid()` (`00000000000006:53`) **nunca matchea** → ningún cliente autenticado puede leer sus propias fotos vía publishable key (hoy se salva porque todo el acceso va por signed URL del server con service_role, que bypassa RLS — por eso no se ha notado).

**El cast `as never` es una señal de que esto no está verificado contra la API real.**

**Fix (NECESITA-LUCY para test E2E real, esfuerzo M):** verificar con un upload real qué columna persiste el `owner_id` (`select metadata, user_metadata from storage.objects where bucket_id='customer-uploads'`) y ajustar policy o el campo del upload para que coincidan. Documentar en ADR. **Marcar como `[pendiente verificación]`** hasta confirmar contra Supabase real — no se puede confirmar solo leyendo código.

## 10. Rate limit en upload de fotos de cliente — ❌ FALTA · P1

`docs/SECURITY.md:579` y STRIDE Flujo 3 (L862) especifican **30 uploads / 10 min por usuario** contra DoS de storage (1000×10MB/min). `uploadDesignAssetAction` (`actions.ts:213-319`) **no llama a `rateLimit`** (grep: cero referencias en el archivo). El flujo anónimo (sessionId) lo hace explotable sin cuenta: subir miles de imágenes de 10 MB que sharp procesa (CPU + costo Storage). Es el upload más expuesto del sistema (público, anon-friendly) y es el único sin rate limit.

**Fix (AUTÓNOMO, esfuerzo S):** al inicio de `uploadDesignAssetAction`, `rateLimit(\`upload:${ownerId}\`, 30, 600)` con respuesta 429 amigable. La infra ya existe (`lib/rate-limit.ts`).

---

## 3 (Zod) y 4 (SSRF) del mandato

**Zod en mutaciones (general):** de 27 archivos `"use server"`, 7 no importan Zod. Revisados: `auth/logout` (sin input), `checkout/pago/actions.ts` (sin input de usuario, `payWompiAction` no toma params), `usuarios/actions.ts` (validación por whitelist manual `ROLES.includes` — aceptable), `aveonline/actions.ts` (trim manual de URLs admin), `pedidos/[number]/actions.ts` (solo `orderId` string + `getCurrentAdmin`), `redirects`, `search` (string simple). **Ninguno confía en formData crudo sin validación**, pero los de upload del frente sí validan con Zod (`UploadAssetMetadataSchema`). El gap real no es Zod sino el MIME real (#1). 🟡 menor / P2: estandarizar Zod en las 7 actions admin restantes por consistencia (AUTÓNOMO, S).

**SSRF / inyección — ✅:** revisé las rutas de archivos. No hay input de usuario que llegue a `fetch`/URL/query SQL sin sanitizar en el flujo de upload. Las URLs de Storage se construyen server-side desde `getPublicUrl`/`createSignedUrl` (`storage.ts:96,258`). `deleteProductImage` parsea la URL con un marker fijo y devuelve no-op si no matchea el bucket propio (`storage.ts:120-125`) — no se usa para hacer requests. Prisma parametriza todas las queries. Sin `dangerouslySetInnerHTML` en el render de imágenes (`product-images.tsx:141` usa `<img src={url}>` con URLs de origen propio). Las URLs de imagen renderizadas provienen de `Product.images`/`ProductVariant.images`, escritas solo por admin validado. Sin vector.

---

## Acciones priorizadas

**P1 (resolver antes de launch):**
1. **MIME real con `file-type`** en ambos uploads (#1) — AUTÓNOMO, M.
2. **Rate limit** en `uploadDesignAssetAction` 30/10min (#10) — AUTÓNOMO, S.
3. **Verificar `metadata.owner_id`** persiste donde la RLS lo busca (#11) — NECESITA-LUCY (test E2E Supabase real), M. `[pendiente verificación]`.

**P2:**
4. Strip EXIF + re-encode sharp en fotos de producto (#4) — AUTÓNOMO, S.
5. Estandarizar Zod en 7 actions admin sin esquema — AUTÓNOMO, S.

**P3:** test de regresión de strip EXIF (subir JPEG con GPS, assert sin metadata) — AUTÓNOMO, S.

**Archivos clave:** `apps/web/lib/storage.ts` (uploads + validación), `apps/web/features/personalization/actions.ts` (action cliente, falta rate limit), `apps/web/features/personalization/schemas.ts:188` (Zod metadata), `apps/web/app/admin/(panel)/productos/image-actions.ts` y `.../[id]/variants/image-actions.ts` (actions producto/variante), `supabase/migrations/00000000000006_storage_personalization.sql` (RLS customer-uploads), `supabase/migrations/00000000000005_search_and_storage.sql` (RLS product-images).