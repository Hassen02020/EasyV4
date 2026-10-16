-- =============================================================================
-- RLS-GAP-COMMISSION-SETTLEMENTS-01 (2026-10-16)
--
-- GAP identifié lors du chantier WALLET-E2E-CI-INTEGRATION-01 :
--   La policy `commission_settlements_superadmin` (migration 0066) était
--   définie `TO authenticated` UNIQUEMENT. Or `withSystemContext` exécute ses
--   requêtes via le rôle `app_runtime` (non-BYPASSRLS) — aucune policy ne
--   s'appliquait à ce rôle → défaut RLS = DENY → INSERT dans
--   `commission_settlements` échouait silencieusement pour tout appelant
--   passant par `withSystemContext` (settleCommissions, markSettlementPaid).
--
--   En production, `DATABASE_URL` pointe vers `app_runtime` ; `settleCommissions`
--   était donc cassée en production depuis sa création (jamais appelée en prod
--   avant ce chantier).
--
-- Correction :
--   Ajouter une policy `TO app_runtime` identique à celle de `authenticated`,
--   conditionnée sur `is_super_admin()` — même garde que la policy existante.
--   Seul un contexte `withSystemContext` (app.is_super_admin='true') peut
--   lire/écrire — jamais une requête app_runtime sans contexte élevé.
--
-- `is_super_admin()` est déjà exécutable par `app_runtime` (GRANT EXECUTE
-- posé par le step "Grants finaux" du job financial-e2e et en production par
-- migration 0001/0012).
--
-- Idempotent : bloc DO/IF NOT EXISTS.
-- =============================================================================

BEGIN;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'commission_settlements'
      AND policyname = 'commission_settlements_app_runtime'
  ) THEN
    CREATE POLICY commission_settlements_app_runtime
      ON commission_settlements
      FOR ALL
      TO app_runtime
      USING (is_super_admin())
      WITH CHECK (is_super_admin());
  END IF;
END $$;

COMMIT;

-- Retour arrière :
--   DROP POLICY IF EXISTS commission_settlements_app_runtime ON commission_settlements;
