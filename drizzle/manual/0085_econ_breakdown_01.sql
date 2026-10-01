-- ECON-BREAKDOWN-01 (2026-09-30)
--
-- Première table du cœur "Economic" décrit par docs/ECONOMIC_MODEL.md §3 :
-- `economic_entitlements` enregistre QUI a droit à QUOI sur une réservation
-- (droit économique figé à la confirmation), distinct des Money Events déjà
-- portés par `wallet_ledger`/`partner_credit_movements` (inchangés par ce
-- chantier) et du Commercial (`reservations`).
--
-- Portée STRICTEMENT bornée par le GO reçu :
--   - 1 seule table nouvelle (`economic_entitlements`) ;
--   - AUCUNE table `commercial_agreements` (AGREEMENT-01, pas encore GO'd).
--
-- `agreement_id` — PRÉCISION DEMANDÉE PAR LA DIRECTION (2026-09-30) :
--   `margin_rules` N'EST PAS `commercial_agreements` et ne le devient pas
--   par ce chantier — c'est un simple point d'attache TECHNIQUE PROVISOIRE
--   au modèle économique existant, pas une équivalence conceptuelle. Pour
--   ne créer AUCUNE dépendance qui gênerait AGREEMENT-01 à remplacer cette
--   colonne par un vrai `commercial_agreements.id` plus tard, `agreement_id`
--   est un uuid nullable SANS contrainte FK vers `margin_rules` (trivialement
--   remplaçable — un simple UPDATE de valeur suffira, aucune migration de
--   contrainte à défaire). `rule_id`, lui, référence RÉELLEMENT et
--   durablement `margin_rules.id` (la règle System B qui a produit cette
--   ligne précise, indépendante d'AGREEMENT-01) — celui-ci garde une FK.
--   `agreement_id` peut être égal à `rule_id` aujourd'hui (même table
--   source, faute de mieux) ; ce n'est pas un doublon, c'est documenté ici.
--
--   - `status` initial = 'earned' uniquement (pas de transition
--     earned → settleable/settled implémentée ici) ;
--   - `cancellation_treatment`/`compensates_id` = colonnes posées pour un
--     futur chantier de compensation (D-02a), aucune logique ici.
--
-- Numéro de migration : 0085. Vérifié AVANT écriture : 0084 est réservé par
-- la PR #82 (LEDGER-INTEGRITY-01, encore ouverte/non mergée au moment de ce
-- chantier — drizzle/manual/0084_ledger_integrity_01.sql n'existe QUE dans
-- cette PR, pas sur `main`) — 0085 évite toute collision, qu'elle merge
-- avant ou après ce chantier.
--
-- Application :
--   psql "$DATABASE_DIRECT_URL" -f drizzle/manual/0085_econ_breakdown_01.sql
--
-- Idempotent : CREATE TABLE IF NOT EXISTS / CREATE INDEX IF NOT EXISTS.
-- Retour arrière en bas de fichier.
-- =============================================================================

BEGIN;

DO $$ BEGIN
  CREATE TYPE economic_entitlement_role AS ENUM (
    'seller', 'product_owner', 'supplier', 'partner', 'easy2book', 'tax_authority', 'discount'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE economic_entitlement_status AS ENUM (
    'pending', 'earned', 'settleable', 'settled', 'compensated'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS economic_entitlements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reservation_id uuid NOT NULL REFERENCES reservations(id) ON DELETE CASCADE,

  -- Polymorphique ('agency' | 'supplier_node' | 'easy2book' | 'external') —
  -- pas de FK possible sur party_id lui-même.
  party_type varchar(30) NOT NULL,
  party_id uuid,

  role economic_entitlement_role NOT NULL,
  qualification varchar(30) NOT NULL
    CONSTRAINT economic_entitlements_qualification_check
    CHECK (qualification IN (
      'supplier_cost', 'seller_margin', 'owner_share', 'commission', 'platform_fee',
      'distribution_fee', 'revenue_share', 'service_fee', 'tax', 'discount'
    )),

  amount numeric(14, 2) NOT NULL,
  currency varchar(3) NOT NULL DEFAULT 'TND',

  basis text,

  -- Placeholder AGREEMENT-01 (cf. commentaire en tête de fichier) :
  -- délibérément SANS FK vers margin_rules — stand-in technique provisoire,
  -- pas une équivalence margin_rules = commercial_agreements. Remplaçable
  -- par AGREEMENT-01 sans migration de contrainte.
  agreement_id uuid,
  -- Référence RÉELLE et durable à la règle System B qui a produit cette ligne.
  rule_id uuid REFERENCES margin_rules(id) ON DELETE SET NULL,

  status economic_entitlement_status NOT NULL DEFAULT 'pending',
  effective_at timestamptz NOT NULL,

  cancellation_treatment varchar(20)
    CONSTRAINT economic_entitlements_cancellation_treatment_check
    CHECK (cancellation_treatment IS NULL OR cancellation_treatment IN (
      'full_reversal', 'pro_rata_fee', 'non_refundable'
    )),
  compensates_id uuid REFERENCES economic_entitlements(id) ON DELETE SET NULL,

  settlement_status varchar(20),
  settlement_ref text,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS economic_entitlements_reservation_idx ON economic_entitlements (reservation_id);
CREATE INDEX IF NOT EXISTS economic_entitlements_party_idx ON economic_entitlements (party_id);
CREATE INDEX IF NOT EXISTS economic_entitlements_status_idx ON economic_entitlements (status);
CREATE INDEX IF NOT EXISTS economic_entitlements_compensates_idx ON economic_entitlements (compensates_id);

COMMIT;

-- Retour arrière :
--   DROP TABLE IF EXISTS economic_entitlements;
--   DROP TYPE IF EXISTS economic_entitlement_status;
--   DROP TYPE IF EXISTS economic_entitlement_role;
