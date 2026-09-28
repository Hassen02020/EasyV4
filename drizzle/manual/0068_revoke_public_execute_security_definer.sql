-- =============================================================================
-- chantier-49 (suite) — Ferme l'exposition REST publique de fonctions
-- SECURITY DEFINER sensibles.
--
-- Contexte : `mcp__Supabase__get_advisors` (type=security) signale que
-- `is_authorized_for_hotel_supplier_account`, `lock_agency_for_debit`,
-- `owns_hotel_supplier_account`, `set_agency_deposit_balance` et
-- `set_agency_reservation_tolerance` sont exécutables par les rôles `anon`
-- et `authenticated` via `/rest/v1/rpc/<nom>` (PostgREST). Vérifié par
-- `proacl` (pg_proc) : ces 5 fonctions avaient à la fois un GRANT à PUBLIC
-- ET un GRANT explicite nommant directement `anon`/`authenticated` — les
-- deux REVOKE ci-dessous sont nécessaires (PUBLIC seul ne suffit pas tant
-- qu'un GRANT explicite au rôle nommé subsiste).
--
-- Aucun appel `.rpc(...)` vers ces fonctions n'existe dans le code (grep sur
-- app/, components/, lib/ — 0 résultat) : elles ne sont utilisées que côté
-- serveur via la connexion directe Drizzle/postgres-js (`app_runtime`), qui
-- ne passe jamais par PostgREST. Le REVOKE ci-dessous ne casse donc aucun
-- chemin applicatif réel ; il ferme uniquement une exposition REST inutile.
--
-- `resolve_session_context` n'est pas touchée ici : PUBLIC y était déjà
-- révoqué (confirmé par requête), avec GRANT explicite à `app_runtime` posé
-- en 0061.
-- =============================================================================

BEGIN;

REVOKE EXECUTE ON FUNCTION is_authorized_for_hotel_supplier_account(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION lock_agency_for_debit(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION owns_hotel_supplier_account(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION set_agency_deposit_balance(uuid, numeric) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION set_agency_reservation_tolerance(uuid, numeric) FROM PUBLIC, anon, authenticated;

-- Le chemin applicatif réel (connexion directe app_runtime, hors PostgREST)
-- doit continuer à fonctionner : grant explicite, symétrique à celui déjà
-- posé sur resolve_session_context en 0061.
GRANT EXECUTE ON FUNCTION is_authorized_for_hotel_supplier_account(uuid) TO app_runtime;
GRANT EXECUTE ON FUNCTION lock_agency_for_debit(uuid) TO app_runtime;
GRANT EXECUTE ON FUNCTION owns_hotel_supplier_account(uuid) TO app_runtime;
GRANT EXECUTE ON FUNCTION set_agency_deposit_balance(uuid, numeric) TO app_runtime;
GRANT EXECUTE ON FUNCTION set_agency_reservation_tolerance(uuid, numeric) TO app_runtime;

COMMIT;

-- Application (production) :
--   psql "$DATABASE_DIRECT_URL" -f drizzle/manual/0068_revoke_public_execute_security_definer.sql
-- Idempotent (REVOKE/GRANT rejouables sans effet de bord).
