-- =============================================================================
-- Easy2Book — Migration corrective : rattrape en base les objets 0053/0020
-- que la reconciliation live (SQL Editor, confirmée par l'utilisateur) a
-- trouvés absents en production, alors que le code applicatif les suppose
-- déjà présents (lib/db/schema.ts::agencies.reservationTolerance,
-- lib/pro/booking-actions.ts::debitPartnerCredit, lib/finance/wallet-credit.ts,
-- lib/admin/agencies-actions.ts::setAgencyReservationTolerance).
--
-- Ne rejoue AUCUN fichier historique : reconstruit directement l'état final
-- attendu par le code actuel (signature 3 colonnes de lock_agency_for_debit,
-- comme dans 0053 — pas la version 2 colonnes de 0025, jamais appliquée et
-- inutile ici).
--
-- Hors périmètre, volontairement non touché par ce fichier :
--   - agencies.primary_color (0057) — non cité dans le périmètre demandé.
--   - Toute autre table/policy/fonction (is_super_admin(), current_agency_id(),
--     RLS existante, etc.) — y compris le fait connu que is_super_admin()
--     est encore la version 0001 (auth.uid()) en production : ce fichier ne
--     la corrige pas, voir "Risques" dans la réponse qui accompagne ce SQL.
--   - Rôle `app_runtime` : n'existe pas en production et n'est PAS créé ici.
--     Les GRANT ci-dessous ne ciblent donc que `authenticated, service_role`
--     (rôles Supabase natifs) — pas app_runtime. Un GRANT EXECUTE ... TO
--     app_runtime devra être ajouté séparément une fois ce rôle créé/décidé.
--
-- Idempotent : IF NOT EXISTS / CREATE OR REPLACE / DROP ... IF EXISTS partout.
-- Application (quand décidé — PAS exécuté par cette réponse) :
--   psql "$DATABASE_DIRECT_URL" -f drizzle/manual/0060_agency_debit_tolerance_functions_recovery.sql
-- =============================================================================

BEGIN;

-- -----------------------------------------------------------------------------
-- 1. agencies.reservation_tolerance (0053) — colonne attendue par
--    lib/db/schema.ts (numeric(12,3) NOT NULL DEFAULT 0, vérifié identique).
-- -----------------------------------------------------------------------------
ALTER TABLE agencies
  ADD COLUMN IF NOT EXISTS reservation_tolerance numeric(12, 3) NOT NULL DEFAULT 0;

-- -----------------------------------------------------------------------------
-- 2. Contraintes associées (0053). Le DROP de l'ancienne contrainte 0016
--    (agencies_deposit_balance_nonnegative) est un no-op si elle n'existe pas
--    (confirmé : 0016 absente en production).
-- -----------------------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'agencies_deposit_balance_nonnegative'
  ) THEN
    ALTER TABLE agencies DROP CONSTRAINT agencies_deposit_balance_nonnegative;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'agencies_deposit_balance_floor'
  ) THEN
    ALTER TABLE agencies
      ADD CONSTRAINT agencies_deposit_balance_floor
      CHECK (deposit_balance >= -reservation_tolerance);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'agencies_reservation_tolerance_nonnegative'
  ) THEN
    ALTER TABLE agencies
      ADD CONSTRAINT agencies_reservation_tolerance_nonnegative
      CHECK (reservation_tolerance >= 0);
  END IF;
END $$;

-- -----------------------------------------------------------------------------
-- 3. lock_agency_for_debit(uuid) — version finale 0053 (3 colonnes de sortie),
--    signature exacte attendue par lib/pro/booking-actions.ts:279
--    (`select id, deposit_balance as "depositBalance", reservation_tolerance
--    as "reservationTolerance" from lock_agency_for_debit(...)`).
--    DROP explicite : CREATE OR REPLACE seul refuse un changement de colonnes
--    de sortie (OUT params) pour une fonction à TABLE().
-- -----------------------------------------------------------------------------
DROP FUNCTION IF EXISTS lock_agency_for_debit(uuid);

CREATE FUNCTION lock_agency_for_debit(p_agency_id uuid)
RETURNS TABLE(id uuid, deposit_balance numeric, reservation_tolerance numeric)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT (p_agency_id = current_agency_id() OR is_super_admin()) THEN
    RAISE EXCEPTION 'FORBIDDEN: cannot lock another agency''s wallet balance'
      USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT a.id, a.deposit_balance, a.reservation_tolerance
  FROM agencies a WHERE a.id = p_agency_id FOR UPDATE;
END;
$$;

GRANT EXECUTE ON FUNCTION lock_agency_for_debit(uuid) TO authenticated, service_role;

-- -----------------------------------------------------------------------------
-- 4. set_agency_reservation_tolerance(uuid, numeric) (0053) — signature exacte
--    attendue par lib/admin/agencies-actions.ts:121.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION set_agency_reservation_tolerance(
  p_agency_id uuid,
  p_tolerance numeric
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT is_super_admin() THEN
    RAISE EXCEPTION 'FORBIDDEN: only super_admin can set an agency reservation tolerance'
      USING ERRCODE = '42501';
  END IF;

  IF p_tolerance < 0 THEN
    RAISE EXCEPTION 'INVALID_TOLERANCE: must be >= 0' USING ERRCODE = '22023';
  END IF;

  UPDATE agencies
  SET reservation_tolerance = p_tolerance, updated_at = now()
  WHERE id = p_agency_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'AGENCY_NOT_FOUND: %', p_agency_id
      USING ERRCODE = 'P0002';
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION set_agency_reservation_tolerance(uuid, numeric)
  TO authenticated, service_role;

-- -----------------------------------------------------------------------------
-- 5. set_agency_deposit_balance(uuid, numeric) (0020) — signature exacte
--    attendue par lib/pro/booking-actions.ts:383 et lib/finance/wallet-credit.ts.
-- -----------------------------------------------------------------------------
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

GRANT EXECUTE ON FUNCTION set_agency_deposit_balance(uuid, numeric)
  TO authenticated, service_role;

COMMIT;
