-- Migration 0130 — RLS-CONSENT-FIX (2026-10-10)
--
-- lead_consent_events est la seule table CRM avec ENABLE ROW LEVEL SECURITY
-- mais sans FORCE ROW LEVEL SECURITY. Les 13 autres tables CRM ont les deux
-- (migrations 0121/0123). Sans FORCE, le propriétaire de la table (postgres)
-- contourne les policies RLS — les 13 autres tables bloquent ce vecteur.
--
-- Correctif : 1 ligne. Aucune dépendance, aucun backfill.

BEGIN;

ALTER TABLE lead_consent_events FORCE ROW LEVEL SECURITY;

COMMIT;
