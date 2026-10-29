-- 0143 — reservation_transfer.pickup_at (VOUCHER-CAR-TRANSFER-DATA-01, lot "transfer")
--
-- Persiste l'instant de prise en charge d'un transfert (heure locale
-- Africa/Tunis convertie en UTC par l'application). Sans cette colonne, la
-- date/heure saisie n'existait que dans la requête de réservation et n'était
-- plus disponible lors de la validation d'un paiement manuel.
--
-- Additive et idempotente. Colonne NULLABLE : aucune reprise des lignes
-- existantes (leur heure réelle n'est connue nulle part — aucune valeur n'est
-- inventée). Aucune donnée n'est modifiée. Aucun changement RLS : la table et
-- ses policies existantes couvrent la nouvelle colonne.
--
-- Retour arrière : le code tolère l'absence de valeur ; la colonne peut rester
-- inerte (DROP COLUMN seulement après revert du code).

ALTER TABLE reservation_transfer
  ADD COLUMN IF NOT EXISTS pickup_at timestamptz;
