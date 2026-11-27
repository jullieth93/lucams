-- Fase 4 (#15): índice aditivo en WebVital(createdAt) para respaldar
-- lecturas ordenadas descendentes acotadas en /admin/performance y purgas por retención.
CREATE INDEX IF NOT EXISTS "WebVital_createdAt_idx" ON "WebVital"("createdAt");

