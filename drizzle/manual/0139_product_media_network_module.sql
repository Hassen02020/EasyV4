-- Migration 0139 — NETWORK-MEDIA-01 (2026-10-22)
--
-- Ajoute "network" à la contrainte CHECK `product_media_module_check`
-- (posée par 0052_product_media.sql : `check (module in ('omra', 'package',
-- 'activity'))`, qui anticipait déjà d'autres modules — voir son propre
-- commentaire "'flight' dans la contrainte CHECK pour l'instant").
--
-- Nécessaire car PRODUCT_MEDIA_MODULES (lib/admin/product-constants.ts) et
-- MODULE_TABLE (lib/admin/product-media-actions.ts) incluent désormais
-- "network" (réutilise la table `products` déjà existante, zéro nouvelle
-- colonne/table) — sans cette migration, toute écriture réelle avec
-- module='network' serait rejetée par la contrainte DB, incohérence entre
-- le code applicatif et le schéma.
--
-- `DROP CONSTRAINT IF EXISTS` (pas un simple DROP) — vérifié empiriquement
-- avant d'écrire ce fichier : `product_media` est défini en Drizzle
-- (lib/db/schema/media.ts) SANS cette contrainte CHECK (elle ne vit que
-- dans 0052, en commentaire explicite "Contrainte CHECK en base (migration
-- 0052)") et SANS RLS/policy non plus. Dans l'enchaînement réel de CI
-- (.github/workflows/ci.yml, étape "Rejouer drizzle/manual/*.sql") —
-- `db:push` crée d'abord `product_media` depuis ce schéma Drizzle, donc le
-- `create table` de 0052 échoue ensuite sur "already exists" dès sa
-- première ligne et ON_ERROR_STOP avorte TOUT le reste du fichier
-- (contrainte CHECK, RLS enable/force, policy y compris) — exactement le
-- même mécanisme de collision documenté pour 0035 juste au-dessus dans le
-- même step CI. Un DROP CONSTRAINT simple (sans IF EXISTS) casserait donc
-- le replay CI avec une vraie erreur ("constraint ... does not exist", qui
-- ne matche pas la tolérance "already exists" du script) — reproduit et
-- confirmé en local avant correction. `IF EXISTS` rend ce fichier sûr dans
-- les deux cas : contrainte 0052 réellement posée (production, si déployée
-- par un autre chemin que db:push) ou jamais posée (CI / ce labo).
--
-- Portée strictement limitée à la contrainte elle-même — RLS, policies et
-- colonnes de `product_media` restent inchangées (gap RLS/policy de 0052
-- constaté ci-dessus hors périmètre de ce fichier, à traiter séparément si
-- confirmé pertinent en production).
--
-- Application : psql "$DATABASE_DIRECT_URL" -f drizzle/manual/0139_product_media_network_module.sql

BEGIN;

ALTER TABLE product_media DROP CONSTRAINT IF EXISTS product_media_module_check;
ALTER TABLE product_media
  ADD CONSTRAINT product_media_module_check
  CHECK (module IN ('omra', 'package', 'activity', 'network'));

COMMIT;
