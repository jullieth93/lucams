-- Invariante a nivel DB: como máximo UNA dirección predeterminada por cliente
-- entre las NO borradas. El service ya lo garantiza en app-layer (desmarca el
-- resto en transacción), pero dos creates concurrentes de la PRIMERA dirección
-- podrían ambos tomar isDefault=true (ambos ven count=0). Este índice parcial
-- único cierra esa condición de carrera (el segundo insert falla con 23505,
-- que el service maneja). Ver revisión adversarial 2026-07-10, hallazgo #10.

CREATE UNIQUE INDEX IF NOT EXISTS "address_one_default_per_customer"
  ON "Address" ("customerId")
  WHERE "isDefault" AND "deletedAt" IS NULL;
