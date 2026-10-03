-- =============================================================================
-- CHANNEL-DIM-01 : dimension `channel` dans `pricing_margins`
-- =============================================================================
-- Ajoute une colonne `channel` VARCHAR(16) NOT NULL DEFAULT 'direct' à la
-- table `pricing_margins` pour distinguer les marges par canal de distribution
-- (direct / b2b / white_label / api).
--
-- Motivation : sans dimension canal, une agence OTA ne peut configurer qu'un
-- seul taux de marge par module, partagé entre sa vente directe, ses
-- partenaires B2B et ses tenants White Label. Avec cette colonne, elle peut
-- définir des marges différentes par canal — par exemple +10% en B2C direct
-- mais +15% pour les reventes B2B afin de couvrir la commission partenaire.
--
-- La contrainte unique passe de (agency_id, module) à
-- (agency_id, module, channel). Les lignes existantes reçoivent
-- channel = 'direct' (valeur par défaut).
--
-- Application :
--   psql "$DATABASE_DIRECT_URL" -f drizzle/manual/0101_pricing_margins_channel.sql
--
-- Dépend de : migration initiale pricing_margins
-- Idempotent : IF NOT EXISTS / DROP IF EXISTS protègent les réexécutions.
-- =============================================================================

BEGIN;

-- Ajout de la colonne (les lignes existantes reçoivent la valeur DEFAULT)
ALTER TABLE pricing_margins
  ADD COLUMN IF NOT EXISTS channel VARCHAR(16) NOT NULL DEFAULT 'direct';

-- Remplacement de la contrainte unique
DROP INDEX IF EXISTS pricing_margins_agency_module_uniq;

CREATE UNIQUE INDEX IF NOT EXISTS pricing_margins_agency_module_channel_uniq
  ON pricing_margins(agency_id, module, channel);

COMMIT;
