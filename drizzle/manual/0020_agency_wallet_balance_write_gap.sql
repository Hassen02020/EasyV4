-- =============================================================================
-- Easy2Book — comble le trou RLS qui empêchait tout débit wallet réel
-- =============================================================================
-- PROBLÈME CRITIQUE (P0) trouvé en audit :
--
-- `agencies` n'a que 2 policies :
--   agencies_admin_write : cmd=ALL,    qual = is_super_admin()
--   agencies_select      : cmd=SELECT, qual = (id = current_agency_id() OR is_super_admin())
--
-- Aucune policy ne couvre UPDATE pour une session tenant normale
-- (is_super_admin() = false). Or `debitPartnerCredit()`
-- (lib/pro/booking-actions.ts) — appelée pour CHAQUE réservation B2B réelle,
-- toujours avec `isSuperAdmin: false` (le débiteur est l'agent/owner
-- partenaire qui réserve, jamais un super_admin) — fait :
--
--   1. SELECT ... FOR UPDATE sur agencies   → autorisé (agencies_select)
--   2. INSERT dans partner_credit_movements → autorisé (policy ALL tenant)
--   3. UPDATE agencies SET deposit_balance  → SILENCIEUSEMENT FILTRÉ PAR RLS
--      (aucune policy UPDATE ne couvre ce rôle) : 0 ligne affectée, AUCUNE
--      erreur levée (RLS filtre les lignes, il ne lève pas d'exception).
--
-- Le code appelant n'inspectait jamais le résultat de cet UPDATE (ni
-- `.returning()`, ni rowCount) : la fonction retournait `{ok: true, ...}`
-- comme si le débit avait réussi. Conséquence réelle en production :
-- **le solde `agencies.deposit_balance` d'une agence partenaire n'a jamais
-- pu diminuer suite à une vraie réservation** — seules les recharges (qui
-- s'exécutent en `isSuperAdmin: true` via validateRechargeRequest/webhook)
-- modifient réellement la colonne. Le ledger (`partner_credit_movements`)
-- enregistre pourtant des débits avec un `balance_after` décroissant qui ne
-- correspond à AUCUNE écriture réelle sur `agencies` — ledger et solde
-- divergent silencieusement, et une agence partenaire peut réserver sans
-- jamais épuiser réellement son solde affiché.
--
-- CORRECTIF :
-- Une fonction SECURITY DEFINER dédiée, seul canal autorisé pour modifier
-- `agencies.deposit_balance` depuis une session tenant normale. Elle
-- vérifie elle-même `current_agency_id() = p_agency_id OR is_super_admin()`
-- (donc un partenaire ne peut JAMAIS modifier le solde d'une autre agence,
-- même en l'appelant directement) — même pattern que
-- `resolve_session_context()` (migration 0012), qui contourne volontairement
-- RLS pour un besoin précis, avec sa propre vérification interne.
--
-- On n'élargit PAS `agencies_admin_write`/n'ajoute PAS de policy UPDATE
-- large sur `agencies` : un partenaire ne doit toujours pas pouvoir modifier
-- `matricule_fiscale`, `agency_type`, `credit_low_threshold`, `status`, etc.
-- via un appel API/DB direct — seul `deposit_balance`, et uniquement via
-- cette fonction (donc jamais avec une valeur arbitraire choisie par le
-- client : lib/pro/booking-actions.ts et lib/finance/wallet-credit.ts
-- calculent `newBalance` sous verrou FOR UPDATE avant d'appeler la
-- fonction — celle-ci ne fait qu'appliquer un solde déjà calculé
-- côté serveur, jamais une valeur transmise sans contrôle).
--
-- Le CHECK `agencies_deposit_balance_nonnegative` (migration 0016) continue
-- de s'appliquer normalement (les CHECK constraints ne sont jamais
-- contournées par SECURITY DEFINER).
--
-- Application :
--   psql "$DATABASE_DIRECT_URL" -f drizzle/manual/0020_agency_wallet_balance_write_gap.sql
--
-- Dépend de : 0012 (current_agency_id()/is_super_admin()), 0016 (CHECK).
-- Idempotent : peut être réexécuté sans effet de bord (CREATE OR REPLACE).
-- =============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION set_agency_deposit_balance(
  p_agency_id uuid,
  p_new_balance numeric
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT (p_agency_id = current_agency_id() OR is_super_admin()) THEN
    RAISE EXCEPTION 'FORBIDDEN: cannot modify another agency''s wallet balance'
      USING ERRCODE = '42501';
  END IF;

  UPDATE agencies
  SET deposit_balance = p_new_balance, updated_at = now()
  WHERE id = p_agency_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'AGENCY_NOT_FOUND: %', p_agency_id
      USING ERRCODE = 'P0002';
  END IF;
END;
$$;

-- SECURITY DEFINER exécute avec les droits du propriétaire de la fonction
-- (le rôle des migrations), pas ceux de l'appelant — mais l'appelant doit
-- quand même avoir le droit d'EXECUTE la fonction elle-même. `app_runtime`
-- (rôle réel de DATABASE_URL en production, connexion directe postgres-js)
-- ET `authenticated`/`service_role` (si jamais appelée via PostgREST) —
-- même convention que resolve_session_context() dans 0012.
GRANT EXECUTE ON FUNCTION set_agency_deposit_balance(uuid, numeric)
  TO authenticated, service_role, app_runtime;

COMMIT;
