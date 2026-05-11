-- supabase/migrations/00000000000004_sync_auth_users_delete.sql
--
-- Sincroniza el borrado de auth.users (Supabase) con las tablas de
-- dominio Customer y AdminUser (Lucams).
--
-- Problema que resuelve:
--   Cuando un user se borra de auth.users (vía Supabase Dashboard,
--   admin API, o lo que sea), Customer/AdminUser quedan huérfanas
--   apuntando a un supabaseUserId inexistente. Eso bloquea futuros
--   signups con el mismo email (unique constraint en Customer.email)
--   y deja datos inconsistentes.
--
--   No podemos declarar una FK formal entre Customer.supabaseUserId y
--   auth.users.id porque viven en schemas distintos y Supabase
--   desaconseja agregar FKs hacia su schema interno (auth.users puede
--   cambiar de estructura en futuras versiones).
--
-- Solución:
--   Trigger AFTER DELETE en auth.users que ejecuta una función
--   public.handle_auth_user_delete() — borra las filas Customer y
--   AdminUser con el mismo supabaseUserId.
--
--   El borrado de Customer dispara los onDelete cascade declarados en
--   schema.prisma:
--     - Address (Cascade): se borran direcciones del cliente.
--     - Order (SetNull): se preservan órdenes con customerId = NULL
--       (mantiene historial de ventas + analítica).
--     - Review (SetNull): se preservan reseñas con customerId = NULL.
--     - LoyaltyTxn (SetNull): se preserva histórico contable.
--     - Referrals (SetNull via Customer.referredBy): preservados.
--
--   El borrado de AdminUser no tiene relaciones cascada problemáticas
--   porque AdminActionLog.actorId es String puro (no FK formal) —
--   intencionalmente, para no perder audit log si un admin se va.
--
-- SECURITY DEFINER:
--   La función corre como el rol del owner (postgres / supabase_admin),
--   que tiene permisos para mutar public.Customer y public.AdminUser.
--   Sin esto, el trigger fallaría al ejecutar como el rol del caller.
--
-- Idempotencia:
--   DROP TRIGGER IF EXISTS + CREATE TRIGGER. Re-ejecutar el script no
--   duplica el trigger.
--
-- Referencias:
--   docs/CONVENTIONS.md § DB — foreign keys cascade explícito.
--   ADR-030 (separación cliente vs admin) — ambas tablas se sincronizan
--   acá porque ambas referencian auth.users.

CREATE OR REPLACE FUNCTION public.handle_auth_user_delete()
RETURNS TRIGGER AS $$
BEGIN
  -- Cast OLD.id::text porque auth.users.id es uuid y nuestras columnas
  -- supabaseUserId son text (Prisma String). Sin el cast, Postgres tira
  -- "operator does not exist: text = uuid" y el DELETE en auth.users
  -- falla por completo (Supabase Auth API lo reporta como "Database
  -- error deleting user").
  DELETE FROM "Customer" WHERE "supabaseUserId" = OLD.id::text;
  DELETE FROM "AdminUser" WHERE "supabaseUserId" = OLD.id::text;
  RETURN OLD;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Concede ejecución de la función a los roles que pueden disparar el
-- trigger desde auth.users:
--   - supabase_auth_admin: lo usa Supabase Auth API (admin.deleteUser
--     vía HTTP). Sin este GRANT, la Auth API tira "Database error
--     deleting user" porque no puede ejecutar la función disparada.
--   - postgres / service_role: por completitud, para SQL directo.
GRANT EXECUTE ON FUNCTION public.handle_auth_user_delete()
  TO supabase_auth_admin, postgres, service_role;

DROP TRIGGER IF EXISTS on_auth_user_deleted ON auth.users;
CREATE TRIGGER on_auth_user_deleted
  AFTER DELETE ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_auth_user_delete();
