-- LOT 7 — TAX-RULES-SUPERADMIN-01 : extension fiscalRules pour taxes à montant fixe par unité
-- (taxe de séjour, taxe de location…)
--
-- Colonnes ajoutées (additive, DEFAULT safe, règles existantes non affectées) :
--   tax_type        : 'percentage' (défaut, rétro-compatible) | 'fixed_per_unit' | 'mixed'
--   unit_amount     : montant fixe par unité en TND (ex: 8.00 pour taxe de séjour 3★)
--   unit_type       : granularité de l'unité (per_night_per_person, per_day, per_vehicle_per_day…)
--   max_units       : plafond d'unités taxées (ex: 10 nuits — LF 2024 Art. 46)
--   resident_amount : montant alternatif pour résidents tunisiens / UMA (si différent)
--
ALTER TABLE "fiscal_rules"
  ADD COLUMN "tax_type" varchar(24) NOT NULL DEFAULT 'percentage',
  ADD COLUMN "unit_amount" numeric(10, 2),
  ADD COLUMN "unit_type" varchar(32),
  ADD COLUMN "max_units" integer,
  ADD COLUMN "resident_amount" numeric(10, 2);
