-- Currencies est une table de référence (ISO 4217). On veut un read public
-- pour pouvoir afficher les devises dans l'UI sans contexte agence.
-- Migration générée pendant l'audit de sécurité Phase 1.

DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'currencies'
      AND policyname = 'currencies_public_read'
  ) THEN
    RAISE NOTICE 'Policy currencies_public_read already exists, skipping.';
  ELSE
    EXECUTE 'CREATE POLICY currencies_public_read ON currencies FOR SELECT TO anon, authenticated USING (true)';
  END IF;
END $$;

GRANT SELECT ON currencies TO anon, authenticated;
