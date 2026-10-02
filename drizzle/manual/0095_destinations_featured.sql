-- R9-04 (2026-10-02) : destinations en croissance — is_featured + display_order
-- Migration additive — aucune donnée existante modifiée.
-- Application : psql "$DATABASE_DIRECT_URL" -f drizzle/manual/0095_destinations_featured.sql

BEGIN;

ALTER TABLE destinations
  ADD COLUMN IF NOT EXISTS is_featured   BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS display_order INTEGER NOT NULL DEFAULT 0;

-- Index partiel : accélère la requête home page (WHERE is_featured = true)
CREATE INDEX IF NOT EXISTS destinations_featured_idx
  ON destinations (display_order ASC, name ASC)
  WHERE is_featured = true;

COMMIT;
