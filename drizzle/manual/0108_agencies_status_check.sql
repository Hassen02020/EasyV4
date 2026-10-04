-- =============================================================================
-- PARTNER-GAP-1 (2026-10-04) — CHECK constraint agencies.status
--
-- GAP identifié lors de l'audit ownership PARTNER :
--   `agencies.status` était varchar(16) sans CHECK — n'importe quelle
--   valeur pouvait être insérée (convention applicative seulement).
--
-- Valeurs autorisées (exhaustives) :
--   'active'    — agence opérationnelle (valeur par défaut)
--   'suspended' — agence suspendue (accès bloqué côté applicatif)
--
-- Application :
--   psql "$DATABASE_DIRECT_URL" -f drizzle/manual/0108_agencies_status_check.sql
-- Idempotent (DO block). Retour arrière en bas de fichier.
-- =============================================================================

BEGIN;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'agencies_status_check'
  ) THEN
    ALTER TABLE agencies
      ADD CONSTRAINT agencies_status_check
      CHECK (status IN ('active','suspended'));
  END IF;
END;
$$;

COMMIT;

-- Retour arrière :
--   ALTER TABLE agencies
--     DROP CONSTRAINT IF EXISTS agencies_status_check;
