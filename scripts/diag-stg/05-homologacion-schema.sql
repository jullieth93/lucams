-- Firma de esquema para homologación STG ↔ PRD (correr idéntica en ambos y diff).
\echo '=== 01 columns ==='
SELECT table_name || '|' || column_name || '|' || data_type || '|' || udt_name || '|' || is_nullable || '|' || coalesce(column_default,'')
FROM information_schema.columns WHERE table_schema='public'
ORDER BY 1;
\echo '=== 02 indexes ==='
SELECT tablename || '|' || indexname || '|' || indexdef FROM pg_indexes WHERE schemaname='public' ORDER BY 1;
\echo '=== 03 constraints ==='
SELECT conrelid::regclass::text || '|' || conname || '|' || pg_get_constraintdef(oid)
FROM pg_constraint WHERE connamespace='public'::regnamespace ORDER BY 1;
\echo '=== 04 triggers ==='
SELECT tgrelid::regclass::text || '|' || tgname || '|' || pg_get_triggerdef(oid)
FROM pg_trigger WHERE NOT tgisinternal AND tgrelid::regclass::text !~ '^(auth|storage|realtime|vault)\.' ORDER BY 1;
\echo '=== 05 functions (firma md5) ==='
SELECT p.proname || '|' || md5(pg_get_functiondef(p.oid))
FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
WHERE n.nspname='public' ORDER BY 1;
\echo '=== 06 enums ==='
SELECT t.typname || '|' || string_agg(e.enumlabel, ',' ORDER BY e.enumsortorder)
FROM pg_type t JOIN pg_enum e ON e.enumtypid=t.oid JOIN pg_namespace n ON n.oid=t.typnamespace
WHERE n.nspname='public' GROUP BY t.typname ORDER BY 1;
\echo '=== 07 extensions ==='
SELECT extname || '|' || extversion FROM pg_extension ORDER BY 1;
\echo '=== 08 RLS ==='
SELECT c.relname || '|' || c.relrowsecurity || '|' || c.relforcerowsecurity
FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
WHERE n.nspname='public' AND c.relkind='r' ORDER BY 1;
\echo '=== 09 policies ==='
SELECT schemaname || '|' || tablename || '|' || policyname || '|' || cmd || '|' || coalesce(qual,'') || '|' || coalesce(with_check,'')
FROM pg_policies WHERE schemaname='public' ORDER BY 1;
\echo '=== 10 sequences ==='
SELECT sequencename || '|' || data_type FROM pg_sequences WHERE schemaname='public' ORDER BY 1;
\echo '=== 11 cron jobs ==='
SELECT jobname || '|' || schedule || '|' || command || '|' || active FROM cron.job ORDER BY 1;
\echo '=== 12 storage buckets ==='
SELECT id || '|' || public || '|' || coalesce(file_size_limit::text,'') || '|' || coalesce(allowed_mime_types::text,'') FROM storage.buckets ORDER BY 1;
