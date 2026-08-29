-- Auditoría de seguridad (docs/audits/auditoria_seguridad_lucams.md) — cierra
-- el hallazgo G-1 [A05]: la función `public.rls_auto_enable()` (SECURITY DEFINER)
-- y su event trigger `ensure_rls` existen en PROD pero NO están versionados en el
-- repo ni existen en stg. Es la predecesora manual de
-- `public.enforce_rls_on_new_table()` (migración 00000000000014), mecanismo que
-- ya cubre el mismo mandato (RLS auto-habilitada en cada CREATE TABLE del schema
-- public) → el dúo es redundante y se elimina.
--
-- Efecto colateral positivo: al desaparecer la función quedan resueltos los WARN
-- de los advisors de Supabase (lints 0028/0029) que la marcaban como SECURITY
-- DEFINER ejecutable por `anon`/`authenticated` vía /rest/v1/rpc/.
--
-- Drift prod/stg: en stg ni la función ni el trigger existen → DROP ... IF EXISTS
-- hace de esta migración un no-op allí. Idempotente por construcción.
--
-- NOTA: el trigger y la función son objetos de esquema sin datos; el drop es
-- seguro en cualquier orden gracias a IF EXISTS.

DROP EVENT TRIGGER IF EXISTS ensure_rls;
DROP FUNCTION IF EXISTS public.rls_auto_enable();
