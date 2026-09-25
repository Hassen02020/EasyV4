-- Phase 34 — Supplier Connectivity Ladder (L0→L5)
--
-- Ajoute deux dimensions SÉPARÉES sur la table suppliers :
--   connectivity_level  : dimension TECHNIQUE (L0→L5) — "comment parle-t-on au fournisseur ?"
--   certification_status: dimension QUALITÉ/COMMERCIALE — indépendante du niveau technique.
--
-- RÈGLE ABSOLUE : connectivity_level NE DOIT PAS être utilisé comme score
-- de qualité commerciale. Un artisan L0 peut être premium_partner.
-- Un GDS L5 peut être simplement registered.

-- Enum: niveau de connectivité technique
CREATE TYPE supplier_connectivity_level AS ENUM (
  'l0_manual',
  'l1_portal',
  'l2_file',
  'l3_api',
  'l4_xml_gds',
  'l5_native'
);

-- Enum: statut de certification commerciale
CREATE TYPE supplier_certification_status AS ENUM (
  'registered',
  'verified',
  'connected',
  'certified',
  'premium_partner'
);

-- Colonnes sur la table suppliers (existante)
ALTER TABLE suppliers
  ADD COLUMN connectivity_level supplier_connectivity_level NOT NULL DEFAULT 'l0_manual',
  ADD COLUMN certification_status supplier_certification_status NOT NULL DEFAULT 'registered';

-- Index pour filtrage par niveau (admin dashboard, orchestration)
CREATE INDEX suppliers_connectivity_level_idx ON suppliers (connectivity_level);
CREATE INDEX suppliers_certification_status_idx ON suppliers (certification_status);
