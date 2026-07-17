-- ADR-062 P1 — Endurecer el bucket privado `customer-uploads`.
--
-- Contexto: la migración 6 creó 3 policies TO authenticated sobre storage.objects para
-- este bucket. La app NUNCA usa la Storage API con el rol authenticated: sube, lee (URL
-- firmada) y borra SIEMPRE por service_role (lib/storage.ts → supabaseService), que bypassa
-- RLS. Esas policies, por tanto, no habilitan ningún flujo real de la app.
--
-- Riesgo que quitamos: la policy de INSERT (customer_uploads_insert_authenticated) solo exige
-- `bucket_id = 'customer-uploads'`, SIN scoping de dueño → cualquier usuario autenticado podía
-- empujar archivos de hasta 10 MB directo por la Storage API (registro es abierto) = DoS de
-- cuota de Storage. Al no existir política, el rol authenticated queda sin acceso (deny-by-
-- default de RLS) y el bucket solo es operable por service_role — que es como la app ya funciona.
--
-- Si algún día se decide subir/leer directo desde el cliente autenticado, re-crear estas
-- policies CON scoping de dueño (metadata->>'owner_id' = auth.uid()::text) también en INSERT.
--
-- Idempotente: DROP IF EXISTS.

DROP POLICY IF EXISTS "customer_uploads_insert_authenticated" ON storage.objects;
DROP POLICY IF EXISTS "customer_uploads_select_owner_or_admin" ON storage.objects;
DROP POLICY IF EXISTS "customer_uploads_delete_owner_or_admin" ON storage.objects;
