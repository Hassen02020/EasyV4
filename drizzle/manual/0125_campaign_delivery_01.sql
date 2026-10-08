-- Migration 0125 — CAMPAIGN-DELIVERY-01 (2026-10-08)
--
-- Ajoute le suivi de livraison sur campaign_targets :
--   delivery_status : 'pending' | 'sent' | 'failed' | 'skipped'
--   delivered_at    : horodatage réel de l'envoi (nul si pending/skipped/failed)
--
-- La colonne delivery_status permet à l'Inngest function deliver-campaign
-- d'être idempotente : seules les lignes 'pending' sont traitées. Un retry
-- Inngest ne renvoie jamais un message déjà 'sent'.

BEGIN;

ALTER TABLE campaign_targets
  ADD COLUMN IF NOT EXISTS delivery_status text NOT NULL DEFAULT 'pending'
    CHECK (delivery_status IN ('pending', 'sent', 'failed', 'skipped')),
  ADD COLUMN IF NOT EXISTS delivered_at timestamptz;

CREATE INDEX IF NOT EXISTS campaign_targets_delivery_status_idx
  ON campaign_targets (campaign_id, delivery_status);

COMMIT;
