-- Auditoría adversarial v3 · #17 — Una reseña ACTIVA por cliente y producto,
-- garantizada a nivel de base de datos.
--
-- Antes el gate era read-then-write (findFirst + create) en READ COMMITTED sin
-- constraint: dos submitReviewAction concurrentes del mismo cliente/producto
-- (doble-click / dos pestañas / reintento de red) pasaban ambos el findFirst
-- antes de que existiera la fila → 2 reseñas del mismo cliente para el producto.
--
-- Índice parcial (mismo patrón que Order_cartId_pending_unique):
--   · WHERE "deletedAt" IS NULL  → permite volver a reseñar tras borrar la propia.
--   · WHERE "customerId" IS NOT NULL → excluye las reseñas seed/demo (customerId
--     null), que por tanto no bloquean la creación del índice ni chocan entre sí.
--
-- El action captura el P2002 de este índice y devuelve el mismo mensaje amable.
CREATE UNIQUE INDEX "Review_productId_customerId_active_unique"
  ON "Review"("productId", "customerId")
  WHERE "deletedAt" IS NULL AND "customerId" IS NOT NULL;
