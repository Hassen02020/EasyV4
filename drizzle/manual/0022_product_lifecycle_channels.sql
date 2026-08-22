-- =============================================================================
-- Easy2Book — Cycle de vie produit unifié + canaux de distribution
-- Phase 13, Product & Commerce Core
-- =============================================================================
-- POURQUOI :
-- Le "Master Admin Product Builder" (Phase 13) a besoin de deux garanties
-- qu'aucune des 3 tables catalogue existantes (`catalog_packages`,
-- `catalog_activities`, `omra_packages`) n'offre aujourd'hui :
--   1. Un vocabulaire de statut cohérent où "publié publiquement" a un nom
--      explicite et sans ambiguïté (aujourd'hui : `catalog_packages`/
--      `catalog_activities` utilisent 'draft'/'active', `omra_packages`
--      utilise seulement 'active' par défaut — un produit tout juste créé
--      par un admin y serait immédiatement public, contraire à la règle
--      "jamais public avant PUBLISHED").
--   2. Une notion de canal de distribution (B2C / B2B / marque blanche) —
--      colonne absente de tout le schéma (vérifié par recherche complète).
--
-- TABLES AFFECTÉES : catalog_packages, catalog_activities, omra_packages.
-- Volontairement PAS omra_allotments/catalog_package_departures/
-- catalog_activity_sessions (disponibilité) : le statut "épuisé" reste
-- calculé en direct (places restantes), jamais stocké — un stock recalculé
-- en direct ne peut jamais désynchroniser de la réalité, contrairement à un
-- flag SOLD_OUT stocké qui pourrait rester figé après l'ajout d'un nouveau
-- départ. Décision documentée dans le rapport Phase 13, pas un oubli.
--
-- COLONNES AJOUTÉES :
--   - `channels text[] NOT NULL DEFAULT '{b2c}'` sur les 3 tables. Défaut
--     '{b2c}' : préserve exactement le comportement actuel (tout ce qui
--     existe aujourd'hui est vendu en B2C direct via l'agence OTA) — aucune
--     régression de visibilité pour les lignes existantes.
--
-- MIGRATION DE DONNÉES (pas de nouvelle colonne pour `status`, juste un
-- renommage de valeur — `status` reste varchar(16) libre, déjà la
-- convention de tout le schéma, pas d'enum introduit) :
--   - 'active' -> 'published' (équivalent sémantique exact : c'est déjà la
--     valeur que toutes les pages publiques filtrent aujourd'hui).
--   - 'draft' reste 'draft' (déjà le comportement voulu : invisible tant
--     que non publié).
--   - Défaut de `omra_packages.status` changé de 'active' à 'draft' : un
--     nouveau package Omra créé par un admin ne doit pas être public tant
--     que personne ne l'a explicitement publié (aligne son comportement sur
--     `catalog_packages`/`catalog_activities`, qui étaient déjà correctement
--     à 'draft' par défaut).
--
-- COMPATIBILITÉ ASCENDANTE : additive et rétrocompatible — toute ligne
-- existante avec status='active' devient 'published' (même visibilité
-- exacte qu'avant, seul le nom change) ; `channels` par défaut ne change la
-- visibilité de rien. Le code applicatif (Phase 12) est mis à jour dans le
-- même commit pour filtrer sur 'published' au lieu de 'active'.
--
-- ROLLBACK : trivial — `ALTER TABLE ... DROP COLUMN channels`, puis
-- `UPDATE ... SET status='active' WHERE status='published'` pour revenir en
-- arrière si nécessaire (non scripté ici, symétrique et sans risque).
--
-- Application :
--   psql "$DATABASE_DIRECT_URL" -f drizzle/manual/0022_product_lifecycle_channels.sql
-- Idempotent : les ALTER TABLE ADD COLUMN sont gardés par IF NOT EXISTS ;
-- les UPDATE de renommage sont naturellement idempotents (une seconde
-- exécution ne trouve plus de ligne 'active' à renommer).
--
-- Déjà appliqué en production (projet Supabase vqhuptgjhoornteibbpj) via
-- Supabase MCP le 2026-08-22, dans le cadre de la Phase 13. Les 3 tables
-- étaient VIDES en production au moment de l'application (0 ligne chacune)
-- — confirmé par SELECT avant migration — donc aucune donnée à renommer ;
-- c'est la preuve concrète que le catalogue Omra/Packages n'a jamais pu
-- être peuplé faute d'outil admin (cf. rapport Phase 13). Colonnes
-- vérifiées post-application : `channels` défaut '{b2c}'::text[] et
-- `status` défaut 'draft' sur les 3 tables.
-- =============================================================================

BEGIN;

-- --- catalog_packages ---
ALTER TABLE catalog_packages ADD COLUMN IF NOT EXISTS channels text[] NOT NULL DEFAULT '{b2c}';
UPDATE catalog_packages SET status = 'published' WHERE status = 'active';

-- --- catalog_activities ---
ALTER TABLE catalog_activities ADD COLUMN IF NOT EXISTS channels text[] NOT NULL DEFAULT '{b2c}';
UPDATE catalog_activities SET status = 'published' WHERE status = 'active';

-- --- omra_packages ---
ALTER TABLE omra_packages ADD COLUMN IF NOT EXISTS channels text[] NOT NULL DEFAULT '{b2c}';
UPDATE omra_packages SET status = 'published' WHERE status = 'active';
ALTER TABLE omra_packages ALTER COLUMN status SET DEFAULT 'draft';

COMMIT;

-- =============================================================================
-- VÉRIFICATION POST-APPLICATION (à exécuter manuellement) :
--
--   SELECT table_name, column_name, column_default
--   FROM information_schema.columns
--   WHERE table_name IN ('catalog_packages','catalog_activities','omra_packages')
--     AND column_name IN ('channels','status');
--
--   SELECT status, count(*) FROM catalog_packages GROUP BY status;
--   SELECT status, count(*) FROM catalog_activities GROUP BY status;
--   SELECT status, count(*) FROM omra_packages GROUP BY status;
--   -- Attendu : plus aucune ligne 'active' — seulement 'draft'/'published'/
--   -- toute autre valeur métier déjà en usage (ex: 'suspended'/'archived').
-- =============================================================================
