-- 0067 — Chantier 39 : Cancellation/Refund financials
--
-- Ajoute les colonnes d'annulation dans `reservation_financials` afin que le
-- Dashboard Marges et les rapports de règlement puissent distinguer les
-- réservations annulées avec frais (cancellation_fee > 0), remboursées
-- entièrement ou partiellement, et la date effective d'annulation.
--
-- Ces colonnes sont NULLABLE (UPDATE après confirmation myGo) — les lignes
-- créées à la réservation restent intactes ; seul un UPDATE au moment de
-- l'annulation les renseigne. Aucune donnée existante n'est modifiée.
--
-- cancellation_fee   : frais retenus par le fournisseur (réponse myGo réelle,
--                      jamais un pourcentage inventé). 0 si annulation gratuite.
-- refund_amount      : montant effectivement recrédité au wallet client/agence.
--                      = tnd_amount - cancellation_fee (toujours ≥ 0).
-- cancelled_at       : timestamp de l'annulation confirmée côté fournisseur.
-- cancellation_reason: motif libre ("Annulation client", "Annulation partenaire",
--                      message fournisseur…).

ALTER TABLE reservation_financials
  ADD COLUMN IF NOT EXISTS cancellation_fee     NUMERIC(14, 2),
  ADD COLUMN IF NOT EXISTS refund_amount        NUMERIC(14, 2),
  ADD COLUMN IF NOT EXISTS cancelled_at         TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS cancellation_reason  TEXT;

-- Index partiel pour les rapports d'annulation — ne couvre que les lignes
-- effectivement annulées, donc très petit et très sélectif.
CREATE INDEX IF NOT EXISTS reservation_financials_cancelled_idx
  ON reservation_financials (cancelled_at)
  WHERE cancelled_at IS NOT NULL;

COMMENT ON COLUMN reservation_financials.cancellation_fee    IS 'Frais retenus par le fournisseur lors de l''annulation (TND). NULL = pas encore annulée.';
COMMENT ON COLUMN reservation_financials.refund_amount       IS 'Montant recrédité au wallet (TND) = tnd_amount - cancellation_fee. NULL = pas encore annulée.';
COMMENT ON COLUMN reservation_financials.cancelled_at        IS 'Timestamp de l''annulation confirmée côté fournisseur.';
COMMENT ON COLUMN reservation_financials.cancellation_reason IS 'Motif d''annulation (libre).';
