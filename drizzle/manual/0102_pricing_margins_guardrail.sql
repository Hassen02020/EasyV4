-- =============================================================================
-- MARGIN-GUARDRAIL-01 : contraintes CHECK sur pricing_margins.margin_value
-- =============================================================================
-- Ajoute deux contraintes CHECK sur la colonne `margin_value` de la table
-- `pricing_margins` pour garantir que la valeur est toujours dans la plage
-- [0, 10000] au niveau base de données — indépendamment des chemins
-- applicatifs.
--
-- Motivation : le seul garde actif était Zod .min(0).max(1000) dans une
-- Server Action (margins-actions.ts). Tout appelant direct de
-- upsertPricingMarginCore() (tests, scripts, migrations, futur code) pouvait
-- contourner ce garde et insérer une valeur négative. applyMargin() n'a pas
-- de clamp — une valeur négative en DB produirait silencieusement un prix
-- de vente inférieur au coût fournisseur.
--
-- La borne haute 10000 couvre les marges fixes (TND) pour les modules flight
-- (ex. +150 TND forfait) avec une marge de sécurité × 10 par rapport au
-- max Zod (1000). La borne basse 0 interdit la revente sous coût.
--
-- Application :
--   psql "$DATABASE_DIRECT_URL" -f drizzle/manual/0102_pricing_margins_guardrail.sql
--
-- Dépend de : migration initiale pricing_margins + 0101_pricing_margins_channel.sql
-- Idempotent : DO $$ … END $$ protège les réexécutions.
-- Réversible : ALTER TABLE pricing_margins DROP CONSTRAINT IF EXISTS …
-- =============================================================================

BEGIN;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'pricing_margins_margin_value_positive'
       AND conrelid = 'pricing_margins'::regclass
  ) THEN
    ALTER TABLE pricing_margins
      ADD CONSTRAINT pricing_margins_margin_value_positive
        CHECK (margin_value >= 0);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'pricing_margins_margin_value_max'
       AND conrelid = 'pricing_margins'::regclass
  ) THEN
    ALTER TABLE pricing_margins
      ADD CONSTRAINT pricing_margins_margin_value_max
        CHECK (margin_value <= 10000);
  END IF;
END $$;

COMMIT;
