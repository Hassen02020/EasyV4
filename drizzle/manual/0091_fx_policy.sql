-- CURRENCY-DIM-02 : Politique FX Trésorerie & Coût Bancaire
--
-- Crée la table `fx_policies` (politique Super Admin, versionnée)
-- et ajoute 3 colonnes additives nullable sur `reservation_financials`.
--
-- Entièrement additif : aucune colonne NOT NULL sur une table existante,
-- aucun backfill. Les 13 call sites existants écrivent NULL dans les
-- nouvelles colonnes — comportement financier inchangé.

-- ---------------------------------------------------------------------------
-- Table fx_policies
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS fx_policies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Version auto-incrémentée : la politique active est celle dont
  -- effective_to IS NULL avec le version le plus élevé.
  version integer NOT NULL,
  CONSTRAINT fx_policies_version_unique UNIQUE (version),

  -- Plage de validité temporelle
  effective_from timestamptz NOT NULL DEFAULT now(),
  effective_to   timestamptz,

  -- Correction du taux mid-market (spread bancaire)
  -- NONE      = taux appliqué = taux référence
  -- PERCENTAGE= taux appliqué = ref × (1 + correction_value / 100)
  -- FIXED_RATE= taux appliqué = correction_value (taux fixe absolu)
  correction_mode  text NOT NULL DEFAULT 'NONE'
    CHECK (correction_mode IN ('NONE', 'PERCENTAGE', 'FIXED_SPREAD', 'FIXED_RATE')),
  correction_value numeric(10, 4) NOT NULL DEFAULT 0,

  -- Frais bancaire de virement (proratisé par booking)
  -- NONE        = 0 frais
  -- FIXED       = bank_fee_fixed TND par booking
  -- PERCENTAGE  = bank_fee_percent % du montant en devise étrangère converti en TND
  -- MIN_MAX     = PERCENTAGE clampé entre bank_fee_min et bank_fee_max
  bank_fee_mode    text NOT NULL DEFAULT 'NONE'
    CHECK (bank_fee_mode IN ('NONE', 'FIXED', 'PERCENTAGE', 'MIN_MAX')),
  bank_fee_fixed   numeric(10, 2),
  bank_fee_percent numeric(6,  4),
  bank_fee_min     numeric(10, 2),
  bank_fee_max     numeric(10, 2),
  bank_fee_currency varchar(3) NOT NULL DEFAULT 'TND',

  note       text,
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- RLS — accès Super Admin uniquement
-- ---------------------------------------------------------------------------

ALTER TABLE fx_policies ENABLE ROW LEVEL SECURITY;

-- Lecture + écriture Super Admin
CREATE POLICY fx_policies_super_admin ON fx_policies
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role = 'super_admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role = 'super_admin'
    )
  );

-- ---------------------------------------------------------------------------
-- Colonnes additives sur reservation_financials
-- ---------------------------------------------------------------------------

-- Taux réellement appliqué pour la conversion financière
-- (= taux référence + correction politique FX)
ALTER TABLE reservation_financials
  ADD COLUMN IF NOT EXISTS applied_exchange_rate     numeric(10, 6),
  ADD COLUMN IF NOT EXISTS applied_exchange_rate_at  timestamptz,
  ADD COLUMN IF NOT EXISTS fx_policy_id              uuid REFERENCES fx_policies(id);

-- Index FK
CREATE INDEX IF NOT EXISTS reservation_financials_fx_policy_idx
  ON reservation_financials(fx_policy_id)
  WHERE fx_policy_id IS NOT NULL;
