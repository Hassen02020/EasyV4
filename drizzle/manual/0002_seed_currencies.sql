-- =============================================================================
-- TunisiaGo OTA — Seed devises ISO 4217 supportées
-- =============================================================================
-- Application :
--   psql "$DATABASE_DIRECT_URL" -f drizzle/manual/0002_seed_currencies.sql
--
-- Devises encaissables MVP : TND, EUR, USD.
-- Autres devises ajoutées en lecture pour future intégration GDS internationale.

INSERT INTO currencies (code, symbol, name, decimals) VALUES
  ('TND', 'TND', 'Dinar tunisien', 3),
  ('EUR', '€',   'Euro', 2),
  ('USD', '$',   'Dollar américain', 2),
  ('GBP', '£',   'Livre sterling', 2),
  ('CHF', 'CHF', 'Franc suisse', 2),
  ('CAD', 'C$',  'Dollar canadien', 2),
  ('SAR', 'SAR', 'Riyal saoudien', 2),
  ('AED', 'AED', 'Dirham émirati', 2),
  ('DZD', 'DZD', 'Dinar algérien', 2),
  ('MAD', 'MAD', 'Dirham marocain', 2),
  ('LYD', 'LYD', 'Dinar libyen', 3)
ON CONFLICT (code) DO UPDATE SET
  symbol = EXCLUDED.symbol,
  name = EXCLUDED.name,
  decimals = EXCLUDED.decimals;
