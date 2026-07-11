-- Address.structured: la dirección en el mismo formato estructurado del checkout
-- (deptCode/cityCode DANE + urbano/rural + vía/cruce/detalle), para reuso 100% al
-- pagar. Null en direcciones legacy creadas con el form plano. Ver ADR-051.
ALTER TABLE "Address" ADD COLUMN "structured" JSONB;
