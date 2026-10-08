-- Migration 0115 — CAMPAIGN-EXTENSION-01 (2026-10-06)
--
-- Audit de conception dédié (docs/ROADMAP.md) : Period/Version/Message
-- étaient en périmètre ; Results/Attribution exclu de ce chantier (gap
-- en amont côté BOOKING — aucun `contactId` résolu à la réservation,
-- à auditer séparément : BOOKING-CONTACT-LINK-01).
--
-- Décisions explicites de l'utilisateur (2026-10-06) :
--   1. Une nouvelle version de message exige une NOUVELLE campagne —
--      aucun mécanisme de version séparé construit ici.
--   2. `end_at` est un champ dédié PLANIFIÉ, distinct de la date réelle
--      de clôture (transition de statut active → completed).
--
-- Strictement additif : 3 nouvelles colonnes sur `campaigns`, aucune
-- colonne/table existante touchée, aucun backfill (NULL par défaut).

BEGIN;

ALTER TABLE campaigns
  ADD COLUMN IF NOT EXISTS message text,
  ADD COLUMN IF NOT EXISTS start_at timestamptz,
  ADD COLUMN IF NOT EXISTS end_at timestamptz;

COMMIT;
