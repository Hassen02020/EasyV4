-- =============================================================================
-- CURRENCY-DIM-01 : flight_price_snapshots — colonnes FX fournisseur originales
-- =============================================================================
-- Contexte : avant ce chantier, commercial-engine.ts rejetait toute offre
-- Duffel facturée en EUR/USD (UnsupportedCommercialCurrencyMismatchError) car
-- computeCommercialResult() ne pouvait additionner deux devises différentes.
-- Désormais applyCommercialEngine() pré-convertit le montant fournisseur vers
-- TND (fetchExchangeRateForDisplay — taux de recherche, traçable), puis
-- stocke le montant ORIGINAL dans ces deux colonnes pour que
-- finalizeFlightBookingFinancials() puisse, au moment de la confirmation,
-- re-obtenir un taux frais (fetchExchangeRateForBooking — D2 Option B).
--
-- supplier_original_amount  : montant fournisseur avant conversion (ex. 200.000 EUR)
-- supplier_original_currency: devise fournisseur avant conversion (ex. "EUR")
-- Nullable : NULL = fournisseur déjà en TND, pas de conversion effectuée.
--
-- Application :
--   psql "$DATABASE_DIRECT_URL" -f drizzle/manual/0103_flight_snapshot_fx_columns.sql
--
-- Dépend de : migration initiale flight_price_snapshots (schéma drizzle)
-- Idempotent : ADD COLUMN IF NOT EXISTS.
-- =============================================================================

BEGIN;

ALTER TABLE flight_price_snapshots
  ADD COLUMN IF NOT EXISTS supplier_original_amount   DECIMAL(12, 3),
  ADD COLUMN IF NOT EXISTS supplier_original_currency VARCHAR(3);

COMMIT;
