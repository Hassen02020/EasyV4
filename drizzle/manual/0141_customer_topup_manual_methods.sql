-- =============================================================================
-- WALLET-B2C-RECHARGE-METHODS-01 — recharges wallet B2C manuelles
-- =============================================================================
-- Étend customer_topup_requests (0132, conçue pour la carte Paymee seule) aux
-- moyens manuels : virement, versement bancaire, espèces à l'agence, D17
-- (déclaration manuelle — aucune intégration D17 officielle). Une demande
-- manuelle reste `pending` jusqu'à validation humaine ; le crédit passe
-- uniquement par creditCustomerWallet (wallet_ledger, clé d'idempotence =
-- id de la demande).
--
-- Ajoute topup_payment_methods : coordonnées et instructions par moyen,
-- administrées par le super_admin. Aucune valeur n'est insérée ici — un
-- moyen sans configuration complète et active n'est jamais proposé.
--
-- Idempotente (rejouable après db:push en CI) : IF NOT EXISTS / DROP ... IF
-- EXISTS partout.
--
-- Réversible :
--   DROP TABLE topup_payment_methods;
--   ALTER TABLE customer_topup_requests
--     DROP CONSTRAINT customer_topup_requests_method_check,
--     DROP CONSTRAINT customer_topup_requests_card_psp_check,
--     DROP CONSTRAINT customer_topup_requests_review_check,
--     DROP CONSTRAINT customer_topup_requests_status_check,
--     DROP COLUMN method, DROP COLUMN customer_reference,
--     DROP COLUMN customer_note, DROP COLUMN reviewed_by_user_id,
--     DROP COLUMN reviewed_at, DROP COLUMN rejection_reason;
--   ALTER TABLE customer_topup_requests ADD CONSTRAINT
--     customer_topup_requests_status_check
--     CHECK (status IN ('pending','completed','failed'));
--   (à faire uniquement s'il n'existe aucune ligne `rejected` ni manuelle)
-- =============================================================================

BEGIN;

-- 1. customer_topup_requests ---------------------------------------------------

-- DEFAULT 'card' : rattache les lignes existantes (toutes Paymee) et garde le
-- code déjà déployé fonctionnel pendant la fenêtre de déploiement. Une
-- insertion manuelle qui oublierait `method` est refusée par
-- customer_topup_requests_card_psp_check (psp NULL ⇒ method <> 'card').
ALTER TABLE customer_topup_requests
  ADD COLUMN IF NOT EXISTS method              TEXT NOT NULL DEFAULT 'card',
  ADD COLUMN IF NOT EXISTS customer_reference  TEXT,
  ADD COLUMN IF NOT EXISTS customer_note       TEXT,
  ADD COLUMN IF NOT EXISTS reviewed_by_user_id UUID,
  ADD COLUMN IF NOT EXISTS reviewed_at         TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS rejection_reason    TEXT;

ALTER TABLE customer_topup_requests
  DROP CONSTRAINT IF EXISTS customer_topup_requests_status_check;
ALTER TABLE customer_topup_requests
  ADD CONSTRAINT customer_topup_requests_status_check
  CHECK (status IN ('pending', 'completed', 'failed', 'rejected'));

ALTER TABLE customer_topup_requests
  DROP CONSTRAINT IF EXISTS customer_topup_requests_method_check;
ALTER TABLE customer_topup_requests
  ADD CONSTRAINT customer_topup_requests_method_check
  CHECK (method IN ('card', 'bank_transfer', 'bank_deposit', 'cash_agency', 'd17'));

-- Carte ⇔ PSP renseigné : une demande manuelle n'a jamais de PSP, donc aucun
-- webhook ne peut la corréler (voir aussi la garde de
-- lib/payment/customer-topup-webhook-core.ts).
ALTER TABLE customer_topup_requests
  DROP CONSTRAINT IF EXISTS customer_topup_requests_card_psp_check;
ALTER TABLE customer_topup_requests
  ADD CONSTRAINT customer_topup_requests_card_psp_check
  CHECK ((method = 'card') = (psp IS NOT NULL));

-- Une demande manuelle ne quitte `pending` que par une revue tracée ; un rejet
-- porte toujours un motif.
ALTER TABLE customer_topup_requests
  DROP CONSTRAINT IF EXISTS customer_topup_requests_review_check;
ALTER TABLE customer_topup_requests
  ADD CONSTRAINT customer_topup_requests_review_check
  CHECK (
    (status <> 'rejected' OR (
      rejection_reason IS NOT NULL AND length(btrim(rejection_reason)) > 0
    ))
    AND (method = 'card' OR status = 'pending' OR (
      reviewed_by_user_id IS NOT NULL AND reviewed_at IS NOT NULL
    ))
  );

CREATE INDEX IF NOT EXISTS topup_req_method_status_idx
  ON customer_topup_requests (method, status);

-- 2. topup_payment_methods -----------------------------------------------------

CREATE TABLE IF NOT EXISTS topup_payment_methods (
  id                 UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id          UUID        NOT NULL REFERENCES agencies(id),
  method             TEXT        NOT NULL
                       CHECK (method IN ('bank_transfer', 'bank_deposit', 'cash_agency', 'd17')),
  enabled            BOOLEAN     NOT NULL DEFAULT false,
  details            JSONB       NOT NULL DEFAULT '{}'::jsonb,
  instructions       TEXT,
  updated_by_user_id UUID,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT topup_payment_methods_agency_method_uniq UNIQUE (agency_id, method)
);

ALTER TABLE topup_payment_methods ENABLE ROW LEVEL SECURITY;

-- Lecture : l'agence concernée (page wallet B2C) ou super_admin.
DROP POLICY IF EXISTS topup_payment_methods_read ON topup_payment_methods;
CREATE POLICY topup_payment_methods_read ON topup_payment_methods
  FOR SELECT
  USING (agency_id = current_agency_id() OR is_super_admin());

-- Écriture : super_admin uniquement.
DROP POLICY IF EXISTS topup_payment_methods_write ON topup_payment_methods;
CREATE POLICY topup_payment_methods_write ON topup_payment_methods
  FOR ALL
  USING (is_super_admin())
  WITH CHECK (is_super_admin());

-- Pas de suppression applicative : un moyen se désactive (enabled = false).
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_runtime') THEN
    GRANT SELECT, INSERT, UPDATE ON topup_payment_methods TO app_runtime;
    REVOKE DELETE ON topup_payment_methods FROM app_runtime;
  END IF;
END
$$;

COMMIT;
