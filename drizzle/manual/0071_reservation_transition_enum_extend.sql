-- =============================================================================
-- chantier-49A — Étend l'enum reservation_transition avec les 2 libellés
-- manquants pour couvrir tous les statuts réellement écrits dans le code
-- (confirmé par grep sur lib/) : "expired" (délai de paiement dépassé,
-- lib/finance/manual-payment-actions.ts) et "on_request" (en attente de
-- confirmation fournisseur, ex. lib/vols/fulfillment-action.ts et
-- flight-status-sync.ts) n'avaient aucun libellé de transition existant.
--
-- ALTER TYPE ... ADD VALUE est additif et sans verrou bloquant significatif
-- (Postgres 12+) ; ne peut pas s'exécuter dans le même bloc BEGIN/COMMIT
-- qu'une utilisation de la nouvelle valeur (limitation Postgres), donc pas
-- de wrapping transactionnel ici — chaque ADD VALUE est déjà atomique.
-- =============================================================================

alter type reservation_transition add value if not exists 'expire';
alter type reservation_transition add value if not exists 'await_provider';
