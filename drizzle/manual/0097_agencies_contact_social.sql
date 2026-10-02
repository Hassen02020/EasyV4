-- Migration 0097 — SITE-CONFIG-01
-- Ajoute les colonnes de contact/réseaux sociaux manquantes à la table agencies.
-- Toutes nullable, sans défaut, pour une compatibilité zero-downtime.

ALTER TABLE agencies
  ADD COLUMN IF NOT EXISTS whatsapp_number  varchar(32),
  ADD COLUMN IF NOT EXISTS facebook_url     text,
  ADD COLUMN IF NOT EXISTS instagram_url    text,
  ADD COLUMN IF NOT EXISTS tiktok_url       text;
