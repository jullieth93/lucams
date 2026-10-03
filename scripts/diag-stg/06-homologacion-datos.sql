-- Conteos y checksums de datos para homologación STG ↔ PRD.
-- checksum = md5 del agregado ordenado de CONTENIDO por clave natural.
--
-- Reglas (2026-10-02 — fix de falsos positivos):
--   * NUNCA incluir updatedAt/createdAt: cualquier UPDATE (incluido un sync
--     exitoso) toca updatedAt y el checksum DIFFera eternamente aunque el
--     contenido ya sea idéntico.
--   * NUNCA ordenar/agregar por id cuid: las cuid difieren entre ambientes en
--     filas sembradas independientes (lección del sync de galería) — el
--     agregado va por CLAVE NATURAL (slug/sku/key/tag+name) y las FKs se
--     expresan por la clave natural del padre (join), no por cuid.
--   * URLs de Storage normalizadas: se recorta el host
--     (^https?://<host>/storage/v1/object/public/ → storage://) porque cada
--     ambiente sirve sus propias imágenes (decisión 2026-09-20) y el host NO
--     es diferencia de contenido.
--   * ProductVariant.stock NO entra al checksum: es operativo por ambiente
--     (PRD lo descuenta con órdenes reales) y nunca se sincroniza.
--   * Coupon.usedCount tampoco (operativo).
--   * coalesce(md5(...),''): con 0 filas string_agg devuelve NULL y la fila
--     entera saldría NULL (línea vacía) — el comparador necesita ver el count.
-- Formato de salida (lo consume homologacion.sh): '<Tabla>|<count>|<md5>'.

WITH norm_cat AS (
  SELECT c.slug, c.name, coalesce(c.description,'') AS description,
         coalesce(c."richDescription",'') AS rich_description, coalesce(c."useCase",'') AS use_case,
         coalesce(regexp_replace(c.image, '^https?://[^/]+/storage/v1/object/public/', 'storage://'),'') AS image,
         coalesce(c.icon,'') AS icon, coalesce(c.gradient,'') AS gradient,
         coalesce(c."visibleFilters"::text,'') AS visible_filters, coalesce(c."defaultSort",'') AS default_sort,
         coalesce(c."featuredProductSlug",'') AS featured_product_slug,
         coalesce(c."activeFrom"::text,'') AS active_from, coalesce(c."activeUntil"::text,'') AS active_until,
         coalesce(p.slug,'') AS parent_slug, c."order"::text AS ord, c."isActive"::text AS is_active,
         coalesce(c."deletedAt"::text,'') AS deleted_at
  FROM "Category" c LEFT JOIN "Category" p ON p.id = c."parentId"
)
SELECT 'Category|' || count(*) || '|' || coalesce(md5(string_agg(
  slug || name || description || rich_description || use_case || image || icon || gradient ||
  visible_filters || default_sort || featured_product_slug || active_from || active_until ||
  parent_slug || ord || is_active || deleted_at, '|' ORDER BY slug)),'') FROM norm_cat

UNION ALL
SELECT 'Product.isActive|' || count(*) || '|' || '' FROM "Product" WHERE "isActive"

UNION ALL
SELECT 'Product|' || count(*) || '|' || coalesce(md5(string_agg(
  p.slug || p.sku || p.name || coalesce(p.description,'') || p."basePrice"::text ||
  coalesce(p."compareAtPrice"::text,'') || coalesce(p.cost::text,'') || p."isPersonalizable"::text ||
  p."personalizationKind"::text || coalesce(p."personalizationSchema"::text,'') ||
  coalesce(p."richDescription",'') || coalesce(p."whyChooseThis",'') || p."idealFor"::text ||
  coalesce(p."physicalSpecs"::text,'') || p."warrantyMonths"::text || p."productionDays"::text ||
  p."shippingDaysMin"::text || p."shippingDaysMax"::text || p."minimumQuantity"::text ||
  coalesce(p."maximumQuantity"::text,'') ||
  coalesce((SELECT string_agg(regexp_replace(u, '^https?://[^/]+/storage/v1/object/public/', 'storage://'), ',' ORDER BY u) FROM unnest(p.images) u),'') ||
  c.slug || p."isActive"::text || p."isFeatured"::text || coalesce(p."seoTitle",'') ||
  coalesce(p."seoDescription",'') || coalesce(p."deletedAt"::text,''),
  '|' ORDER BY p.slug)),'')
FROM "Product" p JOIN "Category" c ON c.id = p."categoryId"

UNION ALL
-- stock EXCLUIDO a propósito (operativo por ambiente, nunca se sincroniza).
SELECT 'ProductVariant|' || count(*) || '|' || coalesce(md5(string_agg(
  v.sku || p.slug || v.name || coalesce(v.description,'') || coalesce(v.price::text,'') ||
  coalesce(v."compareAtPrice"::text,'') ||
  coalesce((SELECT string_agg(regexp_replace(u, '^https?://[^/]+/storage/v1/object/public/', 'storage://'), ',' ORDER BY u) FROM unnest(v.images) u),'') ||
  v.attributes::text || v."isActive"::text || coalesce(v."deletedAt"::text,''),
  '|' ORDER BY v.sku)),'')
FROM "ProductVariant" v JOIN "Product" p ON p.id = v."productId"

UNION ALL
SELECT 'OcasionTag|' || count(*) || '|' || coalesce(md5(string_agg(
  slug || name || description || coalesce("monthHint"::text,'') || coalesce("suggestedQuantityRange"::text,''),
  '|' ORDER BY slug)),'') FROM "OcasionTag"

UNION ALL
SELECT 'CmsPage|' || count(*) || '|' || coalesce(md5(string_agg(
  slug || title || coalesce(description,'') || coalesce(path,'') || coalesce(icon,'') || "sortOrder"::text,
  '|' ORDER BY slug)),'') FROM "CmsPage"

UNION ALL
SELECT 'CmsSection|' || count(*) || '|' || coalesce(md5(string_agg(
  p.slug || s.key || s.title || coalesce(s.description,'') || s."sortOrder"::text,
  '|' ORDER BY p.slug, s.key)),'')
FROM "CmsSection" s JOIN "CmsPage" p ON p.id = s."pageId"

UNION ALL
-- body de campos type=IMAGE guarda un CmsMedia.id (cuid por ambiente): se
-- normaliza al path del medio, que sí es comparable entre ambientes.
SELECT 'CmsField|' || count(*) || '|' || coalesce(md5(string_agg(
  f.key || f.kind::text || f.label || coalesce(f."helpText",'') || f.type::text ||
  coalesce(CASE WHEN f.type = 'IMAGE' THEN (SELECT m.path FROM "CmsMedia" m WHERE m.id = f.body)
                ELSE f.body END,'') ||
  f.metadata::text || f.category || f."sortOrder"::text || f."isPublished"::text ||
  coalesce(f."deletedAt"::text,'') || sp.slug || s.key,
  '|' ORDER BY f.key)),'')
FROM "CmsField" f
JOIN "CmsSection" s ON s.id = f."sectionId"
JOIN "CmsPage" sp ON sp.id = s."pageId"

UNION ALL
SELECT 'CmsField.SETTING|' || count(*) || '|' || coalesce(md5(string_agg(key || coalesce(body,''), '|' ORDER BY key)),'')
FROM "CmsField" WHERE kind = 'SETTING'

UNION ALL
SELECT 'UrlRedirect|' || count(*) || '|' || coalesce(md5(string_agg(
  "fromPath" || "toPath" || "statusCode"::text || coalesce(description,'') || "isActive"::text,
  '|' ORDER BY "fromPath")),'') FROM "UrlRedirect"

UNION ALL
SELECT 'PersonalizationTemplate|' || count(*) || '|' || coalesce(md5(string_agg(
  t.slug || coalesce(p.slug,'') || t.kind::text || t.mode::text || t.name || coalesce(t.description,'') ||
  coalesce(regexp_replace(t."previewUrl", '^https?://[^/]+/storage/v1/object/public/', 'storage://'),'') ||
  t."canvasData"::text || t."isActive"::text || t."order"::text || coalesce(t."deletedAt"::text,''),
  '|' ORDER BY t.slug)),'')
FROM "PersonalizationTemplate" t LEFT JOIN "Product" p ON p.id = t."productId"

UNION ALL
SELECT 'DesignGalleryImage|' || count(*) || '|' || coalesce(md5(string_agg(
  tag || name ||
  coalesce(regexp_replace("imageUrl", '^https?://[^/]+/storage/v1/object/public/', 'storage://'),'') ||
  coalesce(regexp_replace("imageUrlB", '^https?://[^/]+/storage/v1/object/public/', 'storage://'),'') ||
  coalesce("variantFilter"::text,'') || "order"::text || "isActive"::text || coalesce("deletedAt"::text,''),
  '|' ORDER BY tag, name)),'') FROM "DesignGalleryImage"

UNION ALL
-- usedCount EXCLUIDO (operativo). Coupon NO se sincroniza entre ambientes;
-- este checksum solo detecta drift de definición (code/type/value/vigencias).
SELECT 'Coupon|' || count(*) || '|' || coalesce(md5(string_agg(
  code || type::text || value::text || coalesce("minOrder"::text,'') || coalesce("maxUses"::text,'') ||
  "validFrom"::text || "validTo"::text || "isActive"::text,
  '|' ORDER BY code)),'') FROM "Coupon"

UNION ALL
SELECT 'LetterTileSet|' || count(*) || '|' || coalesce(md5(string_agg(
  name || language || "isActive"::text || "isDefault"::text || "order"::text || coalesce("deletedAt"::text,''),
  '|' ORDER BY name, language)),'') FROM "LetterTileSet"

UNION ALL
SELECT 'LetterTile|' || count(*) || '|' || coalesce(md5(string_agg(
  s.name || t.char ||
  coalesce(regexp_replace(t."imageUrl", '^https?://[^/]+/storage/v1/object/public/', 'storage://'),'') ||
  coalesce(t.label,'') || t."order"::text,
  '|' ORDER BY s.name, t.char)),'')
FROM "LetterTile" t JOIN "LetterTileSet" s ON s.id = t."setId"

UNION ALL
SELECT 'WholesaleTier|' || count(*) || '|' || coalesce(md5(string_agg(
  coalesce(p.slug,'') || "minQty"::text || "unitPrice"::text || coalesce(note,'') || w."isActive"::text,
  '|' ORDER BY coalesce(p.slug,''), "minQty")),'')
FROM "WholesaleTier" w LEFT JOIN "Product" p ON p.id = w."productId"

UNION ALL SELECT 'Review|' || count(*) || '|' || '' FROM "Review"
UNION ALL SELECT 'Order|' || count(*) || '|' || '' FROM "Order"
UNION ALL SELECT 'Customer|' || count(*) || '|' || '' FROM "Customer"
UNION ALL SELECT 'AdminUser|' || count(*) || '|' || coalesce(md5(string_agg(email || role::text, '|' ORDER BY email)),'') FROM "AdminUser"
ORDER BY 1;
