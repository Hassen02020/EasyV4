-- AGREEMENT-01 (2026-09-30)
--
-- Construit le MÉCANISME d'accord commercial décrit par
-- docs/ECONOMIC_MODEL.md §2 : `commercial_agreements` (9 questions : qui
-- vend/possède/fournit/gagne/paie/encaisse/combien/quand/sous quelle règle).
--
-- Portée STRICTEMENT bornée par le GO reçu (AGREEMENT-01, décisions
-- Direction du 2026-09-30, confirmées après relecture de ce chantier) :
--   - 1 seule table nouvelle (`commercial_agreements`) ;
--   - AUCUNE ligne réelle/permanente créée par cette migration ou par ce
--     chantier — le taux D-01b (option 3, frais sur prix net) n'est pas
--     tranché ; le premier accord réel est un chantier séparé, sous son
--     propre GO, une fois D-01b décidé par la Direction ;
--   - AUCUNE modification de `margin_rules` existant (0 ligne en
--     production au moment de cette migration — confirmé par requête
--     directe avant écriture) ;
--   - AUCUNE modification d'`economic_entitlements` (ECON-BREAKDOWN-01,
--     déjà clôturé, hors scope ici) ni de `applyMargin()`/
--     `getMarginsForAgency()` (lus intégralement avant ce chantier —
--     aucun des deux ne lira jamais cette table ni `margin_rules.agreement_id`,
--     colonne posée par 0089).
--
-- [D-01a] Easy2Book uniquement détient le droit de créer/modifier un accord
-- (super_admin) — voir 0088_agreement_01_rls.sql pour l'application RLS
-- (AUCUNE exception agence, contrairement à la plupart des tables de ce
-- dépôt).
--
-- Numéro de migration : 0087. Vérifié AVANT écriture :
--   - 0084 réservé par la PR #82 (LEDGER-INTEGRITY-01, encore ouverte/non
--     mergée au moment de ce chantier) — ne touche que
--     wallet_ledger/partner_credit_movements/commission_settlement_entries,
--     aucune collision possible avec ce fichier ;
--   - 0085/0086 = ECON-BREAKDOWN-01, déjà mergé sur `main` (`economic_entitlements`) ;
--   - 0087 est donc le premier numéro libre, qu'il merge avant ou après la
--     PR #82.
--
-- Application :
--   psql "$DATABASE_DIRECT_URL" -f drizzle/manual/0087_agreement_01.sql
--
-- Idempotent : CREATE TYPE ... EXCEPTION WHEN duplicate_object, CREATE TABLE
-- IF NOT EXISTS, CREATE INDEX IF NOT EXISTS.
-- Retour arrière en bas de fichier.
-- =============================================================================

BEGIN;

DO $$ BEGIN
  CREATE TYPE commercial_agreement_easy2book_role AS ENUM (
    'platform', 'distributor', 'seller', 'owner'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE commercial_agreement_channel AS ENUM (
    'b2c', 'b2b', 'network', 'white_label', 'api'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE commercial_agreement_status AS ENUM (
    'draft', 'active', 'suspended', 'terminated'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS commercial_agreements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Qui vend ? — toujours connu.
  seller_party_type varchar(30) NOT NULL,
  seller_party_id uuid NOT NULL,

  -- Qui possède ? — nullable : "tout propriétaire" plutôt qu'une partie précise.
  owner_party_type varchar(30),
  owner_party_id uuid,

  -- Qui fournit ? — nullable : §2 "ou tout fournisseur du produit".
  supplier_party_type varchar(30),
  supplier_party_id uuid,

  easy2book_role commercial_agreement_easy2book_role NOT NULL,
  channel commercial_agreement_channel NOT NULL,

  currency varchar(3) NOT NULL DEFAULT 'TND',

  -- Qui paie ? — texte libre (comme economic_entitlements.qualification),
  -- extensible sans ALTER TYPE. Défaut 'customer' (§2 : le cas général).
  payer_role text NOT NULL DEFAULT 'customer',

  -- Qui encaisse ? — nullable.
  collector_party_type varchar(30),
  collector_party_id uuid,

  status commercial_agreement_status NOT NULL DEFAULT 'draft',

  valid_from date,
  valid_to date,

  created_by_user_id uuid NOT NULL,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS commercial_agreements_seller_idx ON commercial_agreements (seller_party_type, seller_party_id);
CREATE INDEX IF NOT EXISTS commercial_agreements_owner_idx ON commercial_agreements (owner_party_type, owner_party_id);
CREATE INDEX IF NOT EXISTS commercial_agreements_supplier_idx ON commercial_agreements (supplier_party_type, supplier_party_id);
CREATE INDEX IF NOT EXISTS commercial_agreements_collector_idx ON commercial_agreements (collector_party_type, collector_party_id);
CREATE INDEX IF NOT EXISTS commercial_agreements_status_idx ON commercial_agreements (status);
CREATE INDEX IF NOT EXISTS commercial_agreements_channel_idx ON commercial_agreements (channel);

COMMIT;

-- Retour arrière :
--   DROP TABLE IF EXISTS commercial_agreements;
--   DROP TYPE IF EXISTS commercial_agreement_status;
--   DROP TYPE IF EXISTS commercial_agreement_channel;
--   DROP TYPE IF EXISTS commercial_agreement_easy2book_role;
