-- R1-10 (audit Phase 0, 2026-09-28) : resolve_session_context(uuid) est
-- SECURITY DEFINER et contourne volontairement RLS sur `users` pour
-- bootstrapper l'identité tenant (lib/db/tenant-context.ts) — nécessaire
-- côté app, qui l'appelle via la connexion Postgres directe (app_runtime),
-- jamais via PostgREST.
--
-- Advisories Supabase (get_advisors) confirmaient EXECUTE encore accordé à
-- PUBLIC/anon/authenticated : n'importe qui pouvait appeler
-- /rest/v1/rpc/resolve_session_context avec un user_id arbitraire et
-- apprendre son agency_id/role/status en contournant RLS. Même classe de
-- problème que drizzle/manual/0068_revoke_public_execute_security_definer.sql,
-- qui avait fermé 5 autres fonctions SECURITY DEFINER mais omis celle-ci.
--
-- Aucun appelant applicatif ne passe par REST pour cette fonction (vérifié :
-- seul lib/db/tenant-context.ts l'appelle, via db.execute()/tx.execute() sur
-- la connexion directe app_runtime) — donc aucun risque de régression.

revoke execute on function public.resolve_session_context(uuid) from public;
revoke execute on function public.resolve_session_context(uuid) from anon;
revoke execute on function public.resolve_session_context(uuid) from authenticated;

grant execute on function public.resolve_session_context(uuid) to app_runtime;
