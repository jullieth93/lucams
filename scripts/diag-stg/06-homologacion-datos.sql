-- Conteos y checksums de datos para homologación STG ↔ PRD.
-- checksum = md5 del agregado ordenado de id+updatedAt (detecta drift de contenido).
SELECT 'Product' || '|' || count(*) || '|' || md5(string_agg(id || coalesce("updatedAt"::text,''), '|' ORDER BY id)) FROM "Product"
UNION ALL SELECT 'Product.isActive' || '|' || count(*) || '|' || '' FROM "Product" WHERE "isActive"
UNION ALL SELECT 'ProductVariant' || '|' || count(*) || '|' || md5(string_agg(id || coalesce("updatedAt"::text,'') || coalesce(attributes::text,''), '|' ORDER BY id)) FROM "ProductVariant"
UNION ALL SELECT 'Category' || '|' || count(*) || '|' || md5(string_agg(id || coalesce("updatedAt"::text,''), '|' ORDER BY id)) FROM "Category"
UNION ALL SELECT 'OcasionTag' || '|' || count(*) || '|' || md5(string_agg(id, '|' ORDER BY id)) FROM "OcasionTag"
UNION ALL SELECT 'CmsSection' || '|' || count(*) || '|' || md5(string_agg(id, '|' ORDER BY id)) FROM "CmsSection"
UNION ALL SELECT 'CmsPage' || '|' || count(*) || '|' || md5(string_agg(id, '|' ORDER BY id)) FROM "CmsPage"
UNION ALL SELECT 'CmsField' || '|' || count(*) || '|' || md5(string_agg(id || coalesce("updatedAt"::text,'') || coalesce(body,'') || coalesce("isPublished"::text,''), '|' ORDER BY id)) FROM "CmsField"
UNION ALL SELECT 'CmsField.SETTING' || '|' || count(*) || '|' || md5(string_agg(key || coalesce(body,''), '|' ORDER BY key)) FROM "CmsField" WHERE kind='SETTING'
UNION ALL SELECT 'UrlRedirect' || '|' || count(*) || '|' || md5(string_agg(id || coalesce("updatedAt"::text,''), '|' ORDER BY id)) FROM "UrlRedirect"
UNION ALL SELECT 'PersonalizationTemplate' || '|' || count(*) || '|' || md5(string_agg(id || coalesce("updatedAt"::text,''), '|' ORDER BY id)) FROM "PersonalizationTemplate"
UNION ALL SELECT 'DesignGalleryImage' || '|' || count(*) || '|' || md5(string_agg(id || coalesce("updatedAt"::text,'') || coalesce("imageUrl",'') || coalesce("imageUrlB",'') || coalesce("variantFilter"::text,''), '|' ORDER BY id)) FROM "DesignGalleryImage"
UNION ALL SELECT 'Coupon' || '|' || count(*) || '|' || md5(string_agg(id || coalesce("updatedAt"::text,'') || coalesce(code,''), '|' ORDER BY id)) FROM "Coupon"
UNION ALL SELECT 'LetterTileSet' || '|' || count(*) || '|' || md5(string_agg(id, '|' ORDER BY id)) FROM "LetterTileSet"
UNION ALL SELECT 'LetterTile' || '|' || count(*) || '|' || md5(string_agg(id, '|' ORDER BY id)) FROM "LetterTile"
UNION ALL SELECT 'WholesaleTier' || '|' || count(*) || '|' || md5(string_agg(id, '|' ORDER BY id)) FROM "WholesaleTier"
UNION ALL SELECT 'Review' || '|' || count(*) || '|' || '' FROM "Review"
UNION ALL SELECT 'Order' || '|' || count(*) || '|' || '' FROM "Order"
UNION ALL SELECT 'Customer' || '|' || count(*) || '|' || '' FROM "Customer"
UNION ALL SELECT 'AdminUser' || '|' || count(*) || '|' || md5(string_agg(id || email || role, '|' ORDER BY id)) FROM "AdminUser"
ORDER BY 1;
