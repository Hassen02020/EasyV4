-- LOT 8 — TAX-RULES-SUPERADMIN-01 : règle provisoire TN+* (19 %)
--
-- Décision Direction 2026-10-23 : activer 19 % provisoirement pour débloquer
-- le déploiement LOT 6 (fail-closed hotel/package/activity).
-- Source : tableau des taxes agence de voyage Tunisie v2, option 3.
--
-- Résolution 4-passes — cette règle est catchée à la passe 2 (TN+*) :
--   Pass 1 : TN+hotel / TN+package / TN+activity (pas encore créées)
--   Pass 2 : TN+*  ← cette règle (catch-all Tunisie)
--   Pass 3 : *+hotel / *+package / *+activity (non atteintes)
--   Pass 4 : *+*  (non atteinte)
--
-- À remplacer module par module dès confirmation du conseiller fiscal
-- (tableau B bis DGI + réponse avis fiscal).
--
-- Rollback :
--   DELETE FROM fiscal_rules
--   WHERE validation_ref = 'PROVISOIRE-GO-DIRECTION-2026-10-23';
--   (réservations fail-closed bloquées à nouveau — opération réversible)

INSERT INTO "fiscal_rules" (
  "id",
  "country",
  "module",
  "fiscal_classification",
  "vat_rate",
  "status",
  "effective_from",
  "effective_to",
  "version",
  "validation_ref",
  "note",
  "created_by",
  "created_at",
  "activated_by",
  "activated_at",
  "tax_type",
  "unit_amount",
  "unit_type",
  "max_units",
  "resident_amount"
) VALUES (
  gen_random_uuid(),
  'TN',
  '*',
  'standard',
  19.00,
  'active',
  now(),
  NULL,
  1,
  'PROVISOIRE-GO-DIRECTION-2026-10-23',
  'Taux 19 % provisoire — décision Direction 2026-10-23 (tableau des taxes agence v2, option 3). '
  'Remplacer par des règles module/taux confirmés dès réception du tableau B bis DGI et avis conseiller fiscal. '
  'Modules fail-closed couverts : hotel, package, activity (passe 2 = TN+*). '
  'Modules pending-fallback non concernés : car, transfer, vol.',
  '00000000-0000-0000-0000-000000000000',
  now(),
  '00000000-0000-0000-0000-000000000000',
  now(),
  'percentage',
  NULL,
  NULL,
  NULL,
  NULL
);
