-- RLS deny-by-default para SupportTicketMessage (hilo de tickets de soporte,
-- migración Prisma 20260929120000_support_ticket_thread_case_links).
--
-- Misma estrategia que 00000000000036 (SecurityEvent), 00000000000034
-- (EmailTemplateOverride) y la propia SupportTicket (00000000000007): ENABLE RLS
-- sin policies. La app lee/escribe TODO vía Prisma con el rol privilegiado
-- (DATABASE_URL), que bypassa RLS → el hilo lo sirven los server components de
-- /admin/soporte y /mi-cuenta/soporte ya autorizados por RBAC/sesión. El cliente
-- anon (publishable key) queda sin acceso vía PostgREST: los mensajes pueden
-- contener PII y notas internas del equipo, nada debe filtrarse al storefront.
-- (Redundante a propósito con el event trigger enforce_rls_on_new_table de la
-- 014: la verificación inline de abajo convierte el gate en explícito.)

ALTER TABLE public."SupportTicketMessage" ENABLE ROW LEVEL SECURITY;

-- Verificación inline: si quedó sin RLS, falla la migración.
DO $$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n
  FROM pg_tables
  WHERE schemaname = 'public'
    AND tablename IN ('SupportTicketMessage')
    AND rowsecurity = false;
  IF n > 0 THEN
    RAISE EXCEPTION 'Quedan % tablas de mensajes de soporte sin RLS', n;
  END IF;
  RAISE NOTICE 'OK: tabla SupportTicketMessage con RLS habilitada (deny-by-default).';
END $$;
