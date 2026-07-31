-- Postura de grants del proyecto (verificada en prod 2026-06-29, ver el header
-- de features/security/rls-matrix.integration.test.ts): los roles `anon` y
-- `authenticated` NO tienen privilegios de tabla en el schema public — la API
-- pública (PostgREST) responde 42501 permission denied en TODAS las tablas y
-- RLS habilitada queda como backstop. El acceso legítimo es vía Prisma
-- (conexión directa / service_role).
--
-- En el stack LOCAL de Supabase (nightly A3) los defaults del image SÍ otorgan
-- privilegios a esos roles (anon update/delete no-error) → esta migración
-- deja cualquier ambiente nuevo (staging, local, DR) en la MISMA postura que
-- prod. Idempotente: revocar lo no otorgado es no-op.
--
-- NOTA: no toca `service_role` (sigue con acceso total vía API para el
-- backend) ni los schemas auth/storage (los maneja Supabase).

REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon, authenticated;

-- Que las tablas FUTURAS creadas por el rol owner hereden la misma postura.
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE ALL ON TABLES FROM anon, authenticated;
