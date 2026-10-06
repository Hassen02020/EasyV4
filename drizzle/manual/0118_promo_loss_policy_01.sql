-- Migration 0118 — PROMO-LOSS-POLICY-01 (2026-10-06)
--
-- Audit de conception dédié (docs/ROADMAP.md) : une vente à perte
-- (salePrice remisé < supplierPrice) ne doit être ni autorisée
-- silencieusement, ni plafonnée silencieusement — c'est une décision
-- commerciale de l'agence, posée explicitement au moment de la
-- création de la promo, jamais déduite par PRICING ni par PROMO
-- lui-même après coup.
--
-- Défaut `false` (plafonnement au coût fournisseur) : conservateur,
-- n'introduit aucun risque de perte involontaire pour les promos
-- existantes (aucune ligne en production à ce jour).
--
-- Sans objet pour omra/package/activity/car (pas de coût fournisseur
-- séparé) — PRICING ignore ce champ pour ces modules, voir
-- lib/finance/promo-discount-core.ts.
--
-- Strictement additif : 1 colonne sur `promos`, aucune autre table
-- touchée.

BEGIN;

ALTER TABLE promos
  ADD COLUMN IF NOT EXISTS allow_below_cost boolean NOT NULL DEFAULT false;

COMMIT;
