-- Fase 0 · Diagnóstico zonas de entrega (hallazgo 19: USME deshabilitada pero sugerida)
-- Ejecutar contra la DB de STG. Pegar el resultado completo en el chat.

-- 1) Settings vigentes de envío propio Lucams
SELECT key, value, "updatedAt"
FROM "CmsField"
WHERE key LIKE 'LUCAMS_SHIPPING%'
ORDER BY key;

-- Qué buscar:
--  - Si existe la key legacy LUCAMS_SHIPPING_LOCALITIES (array plano, formato V1)
--    y LUCAMS_SHIPPING_ZONES está ausente o vacío ({}), ese es el bug:
--    getLucamsShippingSettings cae al fallback legacy y habilita TODAS las
--    localidades del array viejo (features/shipping/settings.ts:203-228).
--  - Formato esperado V2: LUCAMS_SHIPPING_ZONES = {"11001": ["chapinero", ...]}
--    (lista de zoneId habilitados por cityCode; 'usme' NO debería estar).
