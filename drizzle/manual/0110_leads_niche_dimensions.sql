-- Migration 0110 — CRM-NICHE-01 (2026-10-05)
--
-- Audit NICHE (2026-10-05, docs/ROADMAP.md) : la table `leads` ne portait
-- aucune dimension exploitable pour segmenter la demande au-delà du
-- produit — pas de destination, pas d'intention (groupe/transfert/à la
-- carte, cf. décision Devis 2026-09-29), pas de marché. `getNicheSegmentsCore()`
-- (lib/crm/niche-core.ts) regroupe les leads réels sur ces colonnes ; sans
-- elles, aucun group-by pertinent n'était possible.
--
-- Strictement additif — 3 colonnes nullable/avec défaut, aucune colonne
-- existante touchée, aucun impact sur reservations/payments/wallet.
-- `intention` et `market` sont validées en code (LEAD_INTENTIONS,
-- LEAD_MARKETS — lib/crm/leads-core.ts), pas des enums DB : ajouter une
-- intention ou un marché (usa, asia, ...) ne demande aucune migration
-- future.

BEGIN;

ALTER TABLE leads
  ADD COLUMN IF NOT EXISTS destination varchar(128),
  ADD COLUMN IF NOT EXISTS intention varchar(16) NOT NULL DEFAULT 'standard',
  ADD COLUMN IF NOT EXISTS market varchar(32) NOT NULL DEFAULT 'tunisia';

CREATE INDEX IF NOT EXISTS leads_agency_market_product_intention_idx
  ON leads (agency_id, market, product_type, intention);

COMMIT;
