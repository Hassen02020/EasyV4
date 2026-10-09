-- PAY-COMMISSION-DB-01 — CHECK constraint : commission_percent >= 0
-- Objectif : rendre impossible une commission négative sans transaction
-- explicite de remboursement, dans les deux tables qui portent ce champ.
--
-- 1. margin_rules.commission_percent — nullable (aucune valeur par défaut) ;
--    une NULL est légale (= "pas de commission définie"), mais une valeur
--    présente ne peut pas être négative.
--
-- 2. reservation_financials.commission_percent — non nullable, DEFAULT '0' ;
--    la contrainte renforce l'invariant qu'un pourcentage est ≥ 0.
--
-- Les deux contraintes sont NOT VALID lors de leur création : elles
-- s'appliquent aux nouvelles lignes et aux UPDATE, sans bloquer le déploiement
-- sur des données historiques éventuellement incorrectes. Un VALIDATE
-- séparé peut être ajouté ultérieurement sans downtime.

ALTER TABLE margin_rules
  ADD CONSTRAINT margin_rules_commission_percent_non_negative
  CHECK (commission_percent IS NULL OR commission_percent >= 0)
  NOT VALID;

ALTER TABLE reservation_financials
  ADD CONSTRAINT reservation_financials_commission_percent_non_negative
  CHECK (commission_percent >= 0)
  NOT VALID;
