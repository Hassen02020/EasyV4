-- Migration 0123 — RLS-FORCE-CRM-TABLES-01 (2026-10-07)
--
-- AUDIT FINAL CRM (2026-10-07, docs/ROADMAP.md) a trouvé 6 tables CRM avec
-- ENABLE ROW LEVEL SECURITY + policy tenant isolation correcte, mais SANS
-- FORCE ROW LEVEL SECURITY — contrairement à toutes les autres tables du
-- projet déjà alignées sur cette doctrine (leads, loyalty_accounts,
-- loyalty_ledger, crm_conversations, crm_messages, search_demand_signals...).
--
-- Vérifié avant cette migration : `app_runtime` (le rôle Postgres réel de
-- DATABASE_URL) n'est PAS owner de ces 6 tables (GRANT explicite requis sur
-- chacune, ex. 0113_contact_01.sql:47) — FORCE n'a donc aucun effet sur le
-- trafic applicatif normal aujourd'hui. Seul effet réel : empêcher un accès
-- direct par le rôle owner (ex. requête manuelle via l'éditeur SQL Supabase)
-- de contourner la policy tenant isolation — protection en profondeur, pas
-- la correction d'un trou actif.
--
-- Strictement additif : aucune table/colonne créée, aucune donnée touchée,
-- réversible par ALTER TABLE ... NO FORCE ROW LEVEL SECURITY.

BEGIN;

ALTER TABLE contacts FORCE ROW LEVEL SECURITY;
ALTER TABLE lead_origin_events FORCE ROW LEVEL SECURITY;
ALTER TABLE campaigns FORCE ROW LEVEL SECURITY;
ALTER TABLE campaign_targets FORCE ROW LEVEL SECURITY;
ALTER TABLE campaign_attributions FORCE ROW LEVEL SECURITY;
ALTER TABLE promos FORCE ROW LEVEL SECURITY;

COMMIT;
