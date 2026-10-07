-- =============================================================================
-- SETTLE-02b (2026-10-04) — FK DB economic_entitlements.settlement_ref
--                            → commission_settlements(id)
--
-- GAP-2 identifié lors de l'audit ownership SETTLEMENT :
--   `economic_entitlements.settlement_ref` était `text` (pas de FK). Le lien
--   entre un droit économique réglé et son settlement était une convention de
--   code, pas une contrainte DB.
--
-- Corrections :
--   1. ALTER COLUMN settlement_ref : text → uuid
--      (USING settlement_ref::uuid — toutes les valeurs existantes sont des
--      UUID sérialisés écrits par mark_econ_commission_settled(), idempotent
--      si la colonne est déjà NULL ou contient un UUID valide)
--   2. ADD CONSTRAINT FK ON DELETE SET NULL
--      (SET NULL plutôt que RESTRICT : on ne peut pas supprimer un settlement
--       actif à cause de commission_settlement_entries FK RESTRICT — mais on
--       préfère ne pas bloquer l'opération en cascade sur economic_entitlements
--       si un cas exceptionnel l'exige)
--   3. CREATE OR REPLACE FUNCTION mark_econ_commission_settled() :
--      retirer le cast ::text devenu inutile (settlement_ref est maintenant uuid)
--
-- Application :
--   psql "$DATABASE_DIRECT_URL" -f drizzle/manual/0105_econ_entitlements_settlement_fk.sql
-- Retour arrière en bas de fichier.
-- =============================================================================

BEGIN;

-- 1. Changer le type de text → uuid
ALTER TABLE economic_entitlements
  ALTER COLUMN settlement_ref TYPE uuid USING settlement_ref::uuid;

-- 2. Ajouter la FK ON DELETE SET NULL (idempotent : bloc DO/EXCEPTION, même
--    raisonnement que drizzle/manual/0089_agreement_01_margin_rules_link.sql
--    — Postgres n'a pas d'équivalent direct à "ADD CONSTRAINT IF NOT EXISTS")
DO $$ BEGIN
  ALTER TABLE economic_entitlements
    ADD CONSTRAINT economic_entitlements_settlement_ref_fk
    FOREIGN KEY (settlement_ref)
    REFERENCES commission_settlements(id)
    ON DELETE SET NULL;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- 3. Mettre à jour mark_econ_commission_settled pour écrire directement uuid
--    (retirer l'ancien cast ::text devenu inutile)
CREATE OR REPLACE FUNCTION mark_econ_commission_settled(
  p_reservation_ids uuid[],
  p_settlement_ref  uuid
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE economic_entitlements
  SET
    settlement_status = 'settled',
    settlement_ref    = p_settlement_ref,
    updated_at        = now()
  WHERE
    reservation_id = ANY(p_reservation_ids)
    AND qualification = 'commission'
    AND party_type    = 'easy2book';
END;
$$;

-- GRANT inchangés (définis dans 0093 — CREATE OR REPLACE les conserve)
REVOKE ALL ON FUNCTION mark_econ_commission_settled(uuid[], uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION mark_econ_commission_settled(uuid[], uuid)
  FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION mark_econ_commission_settled(uuid[], uuid)
  TO service_role, app_runtime;

COMMIT;

-- Retour arrière :
--   BEGIN;
--   ALTER TABLE economic_entitlements
--     DROP CONSTRAINT IF EXISTS economic_entitlements_settlement_ref_fk;
--   ALTER TABLE economic_entitlements
--     ALTER COLUMN settlement_ref TYPE text USING settlement_ref::text;
--   -- Restaurer la version originale de mark_econ_commission_settled (0093)
--   COMMIT;
