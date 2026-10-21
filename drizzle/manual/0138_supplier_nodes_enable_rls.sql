-- Migration 0138 — SUPPLIER-NODES-RLS-GAP-01 (2026-10-21)
--
-- Trouvé en auditant RLS-DEFENSE-IN-DEPTH-GAP-01 (3 tables : supplier_nodes,
-- mutuelle_catalog_items, loyalty_accounts) : contrairement aux deux autres
-- (dont la correction RLS existait déjà intégralement dans 0063/0039, juste
-- jamais rejouée dans ce labo), `supplier_nodes` n'a JAMAIS eu de
-- `ENABLE ROW LEVEL SECURITY` committé dans aucune migration de ce dépôt
-- (vérifié par recherche exhaustive sur drizzle/ et drizzle/manual/).
--
-- 0076_flight_commission_supplier_rls.sql a ajouté la policy
-- `supplier_nodes_superadmin` en supposant ENABLE déjà présent ("RLS
-- activée, 0 policy" — jamais vérifié directement dans ce dépôt).
-- 0124_rls_force_supplier_tables_01.sql a ajouté FORCE en affirmant avoir
-- "vérifié en production avant cette migration" que ENABLE existait déjà —
-- mais sans qu'aucun fichier committé ne le prouve. Si cette vérification
-- de production était correcte, cette migration est un no-op sûr partout
-- où ENABLE existe déjà (ALTER ... ENABLE ROW LEVEL SECURITY est
-- idempotent). Si elle ne l'était pas, ce fichier ferme le vrai trou.
--
-- Portée strictement limitée à l'instruction manquante elle-même — la
-- policy (0076) et FORCE (0124) restent inchangés, jamais réécrits ici.
--
-- Application : psql "$DATABASE_DIRECT_URL" -f drizzle/manual/0138_supplier_nodes_enable_rls.sql

BEGIN;

ALTER TABLE supplier_nodes ENABLE ROW LEVEL SECURITY;

COMMIT;
