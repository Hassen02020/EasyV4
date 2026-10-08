-- Migration 0124 — RLS-FORCE-SUPPLIER-TABLES-01 (2026-10-07)
--
-- Audit NETWORK/SUPPLIER capacity matching (2026-10-07, déclenché par la
-- clarification canonique Easy2Book sur l'ownership SUPPLIER=capacité) a
-- trouvé 2 tables SUPPLIER avec ENABLE ROW LEVEL SECURITY + policy
-- correcte, mais SANS FORCE — contrairement à `suppliers` lui-même et à
-- `products` (déjà FORCE, vérifié en production avant cette migration).
--
-- Vérifié avant cette migration (même discipline que
-- RLS-FORCE-CRM-TABLES-01, PR #150) : `app_runtime` n'est PAS owner de ces
-- tables (owner = `postgres`, confirmé par `pg_tables.tableowner` en
-- production) — FORCE n'a donc aucun effet sur le trafic applicatif
-- normal aujourd'hui. Protection en profondeur, pas la correction d'un
-- trou actif.
--
-- Strictement additif : aucune table/colonne créée, aucune donnée
-- touchée, réversible par ALTER TABLE ... NO FORCE ROW LEVEL SECURITY.

BEGIN;

ALTER TABLE supplier_nodes FORCE ROW LEVEL SECURITY;
ALTER TABLE supplier_portal_users FORCE ROW LEVEL SECURITY;

COMMIT;
