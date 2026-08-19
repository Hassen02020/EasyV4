-- =============================================================================
-- Easy2Book — resolve_session_context() : ajoute email/name/agency_type
-- =============================================================================
-- Trouvé pendant le stress test B2B/B2C : lib/auth/profile.ts::getCurrentAdminProfile
-- faisait un SELECT direct sur `users` via Drizzle (connexion directe), donc
-- systématiquement bloqué par la policy RLS `users_select` depuis que
-- FORCE ROW LEVEL SECURITY est actif (0012) — même poule-et-œuf que celui déjà
-- résolu pour resolveSessionContext() dans lib/db/tenant-context.ts. En
-- pratique, cela rendait `getCurrentAdminProfile()` — donc /admin et une
-- bonne partie de /pro qui en dépendent indirectement — invisible en
-- production : la fonction renvoie toujours `null`.
--
-- resolve_session_context() (0012) résout déjà ce problème pour
-- agency_id/role/status, mais getCurrentAdminProfile a aussi besoin de
-- email/name pour l'affichage, et agency_type pour distinguer le staff
-- Easy2Book (agency_type='ota') d'un compte d'agence partenaire B2B — les
-- rôles manager/agent_resa/agent_compta/agent_excursions sont partagés entre
-- les deux (cf. lib/api/auth-guard.ts::requirePartnerSession), donc le rôle
-- seul ne suffit pas à distinguer qui a le droit d'entrer dans /admin.
-- Signature de retour étendue en conséquence
-- (DROP + CREATE requis : Postgres n'autorise pas CREATE OR REPLACE sur un
-- changement de colonnes de retour TABLE()).
--
-- Application :
--   psql "$DATABASE_DIRECT_URL" -f drizzle/manual/0014_resolve_session_context_profile_fields.sql
--
-- Dépend de : 0012_rls_session_context.sql
-- Idempotent : peut être réexécuté sans effet de bord.
-- =============================================================================

BEGIN;

DROP FUNCTION IF EXISTS resolve_session_context(uuid);

CREATE FUNCTION resolve_session_context(p_user_id uuid)
RETURNS TABLE(agency_id uuid, role text, status text, email text, name text, agency_type text)
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT u.agency_id, u.role::text, u.status::text, u.email, u.name, a.agency_type::text
  FROM users u
  JOIN agencies a ON a.id = u.agency_id
  WHERE u.id = p_user_id
$$;

REVOKE ALL ON FUNCTION resolve_session_context(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION resolve_session_context(uuid) TO authenticated, service_role, app_runtime;

COMMIT;
