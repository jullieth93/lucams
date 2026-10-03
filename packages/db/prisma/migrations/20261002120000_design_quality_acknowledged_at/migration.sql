-- Paquete C (2026-10-02) — aceptación explícita de calidad de fotos en la Vista Previa
-- del Estudio.
--
-- Cuando el diseño USA fotos con avisos de calidad (validación sharp server-side:
-- resolución / nitidez / luz), la Vista Previa lista cada foto con su aviso y exige un
-- checkbox obligatorio ("Entiendo que estas fotos pueden imprimirse con menor calidad y
-- acepto el resultado") antes de habilitar el botón de confirmar. La server action de
-- finalize recibe la aceptación y sella el momento en esta columna — evidencia ante
-- reclamos de garantía ("llegó pixelada/borroso") y visible en /admin/moderacion.
--
-- Nullable: los diseños sin avisos (o finalizados antes de esta ola) quedan en null.
-- Aditiva y reversible (DROP COLUMN), sin backfill ni locks largos (Postgres añade
-- columnas nullable sin default como metadata-only). Escrita a mano y aplicada con
-- `migrate deploy` — `migrate dev` no funciona contra esta DB (shadow DB en Supabase,
-- convención del repo).

ALTER TABLE "Design" ADD COLUMN "qualityAcknowledgedAt" TIMESTAMP(3);
