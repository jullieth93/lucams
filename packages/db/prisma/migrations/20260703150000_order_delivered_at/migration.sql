-- Bloque F3 — fecha de entrega efectiva, ancla de la ventana de retracto (5 días
-- hábiles desde la entrega, Ley 1480 art. 47). Se sella al transicionar a DELIVERED.
ALTER TABLE "Order" ADD COLUMN "deliveredAt" TIMESTAMP(3);
