-- 0150 — CANCEL-FINANCIAL-COHERENCE-01, étape 2a : le règlement fournisseur
-- ne peut jamais porter sur une ligne de COMPENSATION.
--
-- Contexte : D-02a (docs/ECONOMIC_MODEL.md §4, validée 2026-09-30) prévoit,
-- à l'annulation, une ligne de compensation par droit économique
-- (`economic_entitlements.compensates_id` → ligne d'origine, montant négatif,
-- ajout seulement : UPDATE/DELETE interdits par 0092, une compensation
-- maximum par ligne d'origine par l'index unique de 0134). Le code qui écrira
-- ces compensations (étape 2b) n'existe pas encore ; cette migration rend le
-- règlement fournisseur Network (0135) compatible AVANT.
--
-- Avant : declare_supplier_settlement / request_supplier_settlement_correction
-- acceptaient tout droit `supplier_cost` d'un `supplier_node`, y compris une
-- future ligne de compensation — qui aurait pu être « réglée » comme une
-- dette autonome.
--
-- Après : un déclencheur BEFORE INSERT sur supplier_settlement_entries
-- refuse toute jonction vers une ligne de compensation. Il couvre TOUS les
-- chemins d'écriture (les fonctions de 0135 et tout chemin futur) sans
-- réécrire les fonctions existantes. La dette nette (origine + compensations)
-- est exposée côté application (lib/finance/supplier-settlement.ts).
--
-- Audit préalable production (lecture seule, 2026-11-08) : 0 ligne dans
-- supplier_settlement_entries ; 3 lignes economic_entitlements, aucune
-- compensation ; aucune donnée modifiée par cette migration.
--
-- Idempotente.
--
-- Retour arrière :
--   DROP TRIGGER IF EXISTS supplier_settlement_entries_reject_compensation
--     ON supplier_settlement_entries;
--   DROP FUNCTION IF EXISTS reject_compensation_entitlement_in_settlement();

BEGIN;

CREATE OR REPLACE FUNCTION reject_compensation_entitlement_in_settlement()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM economic_entitlements
    WHERE id = NEW.entitlement_id AND compensates_id IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'SUPPLIER_SETTLEMENT_COMPENSATION_ENTITLEMENT: entitlement=% est une ligne de compensation (D-02a) — seule la ligne d''origine peut être réglée', NEW.entitlement_id;
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION reject_compensation_entitlement_in_settlement() FROM PUBLIC;

DROP TRIGGER IF EXISTS supplier_settlement_entries_reject_compensation
  ON supplier_settlement_entries;
CREATE TRIGGER supplier_settlement_entries_reject_compensation
  BEFORE INSERT ON supplier_settlement_entries
  FOR EACH ROW EXECUTE FUNCTION reject_compensation_entitlement_in_settlement();

COMMIT;
