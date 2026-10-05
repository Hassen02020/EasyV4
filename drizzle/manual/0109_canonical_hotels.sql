-- Migration 0109 — CANONICAL-HOTEL-01 (2026-10-05)
--
-- Audit CANONICAL (2026-10-01, docs/ROADMAP.md) : aucune vertical fournisseur
-- ne persistait jusqu'ici une identité produit stable, partagée entre
-- fournisseurs. Proposition approuvée (même date) : pilote minimal sur le
-- Hub Hôtel TN (lib/hotel-suppliers/**), seule vertical où le calcul de
-- correspondance cross-fournisseur (mapping.ts::matchHotels) existe déjà et
-- est correct — seule la persistance manquait.
--
-- Deux tables, strictement additives, aucune colonne/table existante
-- touchée :
--   - canonical_hotels                   : l'identité elle-même (attributs
--                                           peu volatils).
--   - canonical_hotel_supplier_mappings  : une ligne par (supplier,
--                                           supplier_hotel_code), jamais
--                                           deux identités pour le même
--                                           couple (contrainte unique),
--                                           jamais réécrite après coup.
--
-- Pas de RLS : identité partagée, non partitionnée par agence (même esprit
-- que hotel_suppliers — définition technique, pas une donnée tenant). Pas
-- de FK vers agencies : ces tables ne portent ni offer ni price ni
-- availability, uniquement l'identité produit et sa provenance fournisseur
-- (voir lib/hotel-suppliers/core/canonical-persistence.ts).

BEGIN;

CREATE TABLE IF NOT EXISTS canonical_hotels (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name varchar(255) NOT NULL,
  city varchar(128),
  country varchar(64),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS canonical_hotel_supplier_mappings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  canonical_hotel_id uuid NOT NULL REFERENCES canonical_hotels(id) ON DELETE CASCADE,
  supplier varchar(32) NOT NULL,
  supplier_hotel_code varchar(128) NOT NULL,
  match_confidence varchar(16) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS canonical_hotel_supplier_mappings_supplier_code_uniq
  ON canonical_hotel_supplier_mappings (supplier, supplier_hotel_code);

CREATE INDEX IF NOT EXISTS canonical_hotel_supplier_mappings_canonical_idx
  ON canonical_hotel_supplier_mappings (canonical_hotel_id);

-- app_runtime (production, non-BYPASSRLS) : même convention que 0099
-- (notification_idempotency) — GRANT explicite plutôt que de dépendre
-- d'ALTER DEFAULT PRIVILEGES. Constaté à l'application réelle (production,
-- crygnaichvlxavvbifqi) : ALTER DEFAULT PRIVILEGES (0061) accorde en fait
-- déjà SELECT/INSERT/UPDATE/DELETE automatiquement sur toute nouvelle
-- table — REVOKE explicite ensuite pour retrouver l'empreinte minimale
-- voulue (append-only : jamais de DELETE sur les deux tables, jamais
-- d'UPDATE sur les mappings — une ligne de mapping n'est jamais réécrite,
-- voir canonical-persistence.ts).
GRANT SELECT, INSERT, UPDATE ON canonical_hotels TO app_runtime;
REVOKE DELETE ON canonical_hotels FROM app_runtime;
GRANT SELECT, INSERT ON canonical_hotel_supplier_mappings TO app_runtime;
REVOKE UPDATE, DELETE ON canonical_hotel_supplier_mappings FROM app_runtime;

COMMIT;

-- Retour arrière :
--   DROP TABLE IF EXISTS canonical_hotel_supplier_mappings;
--   DROP TABLE IF EXISTS canonical_hotels;
