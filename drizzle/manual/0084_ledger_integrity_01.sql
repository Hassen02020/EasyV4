-- =============================================================================
-- LEDGER-INTEGRITY-01 (2026-09-30)
--
-- Audit Commercial & Revenue 01, risques R-08 et R-09 :
--   R-08 — l'append-only des ledgers n'était garanti que par convention
--          applicative. Constat production (pg_class/has_table_privilege) :
--          app_runtime, anon, authenticated et service_role avaient UPDATE et
--          DELETE sur wallet_ledger, partner_credit_movements et
--          commission_settlement_entries ; anon/authenticated/service_role
--          avaient même TRUNCATE (non soumis à la RLS).
--   R-09 — credit_platform_commission() n'avait aucune unicité par réservation.
--
-- Audit code (grep lib/, app/, scripts/) : AUCUN UPDATE/DELETE/TRUNCATE
-- applicatif sur ces tables ; aucun accès via le client Supabase. Seule
-- écriture non-INSERT connue : le backfill millimes de 0072, exécuté en
-- migration par `postgres` (propriétaire) — non concerné par ce REVOKE.
--
-- Choix : protection par PRIVILÈGES sur les rôles runtime (et non trigger) :
--   - le runtime de production (`app_runtime`, prouvé par pg_stat_statements
--     dans VERIFY-RUNTIME-ROLE-01) ne peut plus que lire et insérer ;
--   - le propriétaire `postgres` garde la main pour les migrations de
--     données explicites (ex. étapes suivantes de 0072) et le nettoyage des
--     tests d'intégration (qui tournent avec DATABASE_URL local) ;
--   - les fonctions SECURITY DEFINER existantes (credit_platform_commission,
--     set_agency_deposit_balance…) n'insèrent que dans ces tables : inchangées.
--
-- Unicité commission : une seule ligne type='commission' / category='commission'
-- par réservation. Une future écriture compensatoire (annulation, cf.
-- docs/ECONOMIC_MODEL.md §4) utilisera un autre type (`adjustment`) et n'est
-- donc pas bloquée. 0 ligne commission en production : création sans risque.
--
-- Application : psql "$DATABASE_DIRECT_URL" -f drizzle/manual/0084_ledger_integrity_01.sql
-- Idempotent. Retour arrière en bas de fichier.
-- =============================================================================

BEGIN;

REVOKE UPDATE, DELETE, TRUNCATE ON TABLE wallet_ledger
  FROM app_runtime, anon, authenticated, service_role;

REVOKE UPDATE, DELETE, TRUNCATE ON TABLE partner_credit_movements
  FROM app_runtime, anon, authenticated, service_role;

REVOKE UPDATE, DELETE, TRUNCATE ON TABLE commission_settlement_entries
  FROM app_runtime, anon, authenticated, service_role;

CREATE UNIQUE INDEX IF NOT EXISTS wallet_ledger_commission_per_reservation_uniq
  ON wallet_ledger (reservation_id)
  WHERE type = 'commission' AND category = 'commission' AND reservation_id IS NOT NULL;

COMMIT;

-- Retour arrière :
--   GRANT UPDATE, DELETE ON TABLE wallet_ledger, partner_credit_movements, commission_settlement_entries TO app_runtime;
--   GRANT UPDATE, DELETE, TRUNCATE ON TABLE wallet_ledger, partner_credit_movements, commission_settlement_entries TO anon, authenticated, service_role;
--   DROP INDEX IF EXISTS wallet_ledger_commission_per_reservation_uniq;
