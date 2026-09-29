-- DISTRIBUTION-01 : rend un Network Product (`products`, ECON-PILOT-01)
-- distribuable à une agence B2B/White Label, en réutilisant le mécanisme
-- product_authorizations existant (0023_commerce_completion.sql) plutôt
-- que d'inventer un nouveau moteur de distribution.
--
-- 1. authorized_product_type + 'network' (additif, ALTER TYPE ADD VALUE
--    seul dans ce fichier, même précaution que 0051/0077 — ne jamais
--    combiner avec une requête qui référence la nouvelle valeur).
-- 2. RLS sur `products` — table sans AUCUNE policy jusqu'ici (confirmé,
--    ERROR-level sur l'advisor Supabase). Même pattern que les 3 tables
--    catalogue existantes : agence propriétaire (agency_id) OU
--    autorisation active dans product_authorizations OU super_admin.
--
-- Le rôle applicatif réel de DATABASE_URL est `postgres`
-- (rolbypassrls=true) — RLS est inerte pour la connexion serveur actuelle
-- (voir 0061/0076/0078). Renforcement défense-en-profondeur, pas un
-- correctif d'un bug fonctionnel observé (products a 0 ligne en
-- production à ce jour).

ALTER TYPE authorized_product_type ADD VALUE IF NOT EXISTS 'network';
