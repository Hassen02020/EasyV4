-- =============================================================================
-- SUPPLIER-SETTLEMENT-01 — Suivi du règlement des dettes fournisseur (V1)
-- =============================================================================
-- PÉRIMÈTRE VÉRIFIÉ CONTRE LE DÉPÔT RÉEL (et non supposé) : `economic_entitlements`
-- avec `qualification='supplier_cost'` n'a PAS un sens unique selon le module :
--   - partyType='supplier_node', partyId=<supplier_nodes.id> réel      → module Network UNIQUEMENT
--     (lib/network/product-booking-actions.ts:292)
--   - partyType='external_supplier', partyId=NULL (fournisseur réel mais
--     non identifié)                                                   → hotel/flight/package/booking
--   - partyType='agency', partyId=<agencies.id>                        → cars/transfers (coût de flotte
--     propre à l'agence, PAS une dette envers un tiers)
-- Ce mécanisme ne s'applique donc QUE aux entitlements partyType='supplier_node' —
-- vérifié et imposé par les fonctions ci-dessous (SUPPLIER_SETTLEMENT_UNSUPPORTED_PARTY_TYPE).
-- Les deux autres cas sont des GAPS PRÉEXISTANTS, non résolus par ce chantier,
-- documentés ici pour ne pas être confondus avec une couverture complète.
--
-- CYCLE DE VIE : pending → declared → paid → reversed (terminal) ; pending/declared
-- → cancelled ; declared → failed. Partagé par règlements normaux, corrections
-- (amount_correction) et réversions.
--
-- TROIS OPÉRATIONS DISTINCTES, JAMAIS INTERCHANGEABLES :
--   1. Règlement normal (correction_type NULL)            : paiement réel, montant saisi.
--   2. Remboursement réel (correction_type='amount_correction',
--      correction_cause='supplier_refund')                : encaissement réel, montant saisi + référence externe obligatoire.
--   3. Réversion (correction_type='reversal')              : annulation comptable d'un règlement
--      invalide — AUCUN montant saisi, toujours calculé automatiquement (-lié(cible)).
--      Ferme structurellement le risque qu'une réversion serve à masquer un remboursement réel.
--
-- CASCADE SÉLECTIVE À LA RÉVERSION : seules les corrections 'supplier_refund'
-- chaînées (corrects_settlement_id = cible) sont cascade-réversées. Les corrections
-- 'calculation_error'/'duplicate_entry' NE SONT JAMAIS cascadées — elles corrigent
-- la dette reconnue de l'entitlement, indépendamment de la validité d'un règlement précis.
--
-- SÉCURITÉ ACTEUR (point résolu ce chantier) : en plus de REVOKE EXECUTE anon/authenticated
-- (comme les fonctions financières existantes), chaque fonction vérifie désormais que
-- p_actor_user_id correspond à un `users.role='super_admin' AND status='active'` RÉEL —
-- un appelant disposant du rôle SQL app_runtime ne peut plus faire accepter un acteur
-- inexistant ou non-privilégié, même en contournant entièrement le code applicatif.
-- Limite assumée, inchangée par rapport à `credit_platform_commission`/`mark_econ_commission_settled` :
-- ceci ne prouve PAS que l'appelant EST réellement cet utilisateur (aucune session SQL),
-- seulement que l'identifiant fourni désigne un super_admin actif réel au moment de l'appel.
--
-- Application (test UNIQUEMENT — jamais sur $DATABASE_DIRECT_URL de production
-- sans un GO explicite séparé) :
--   psql "$DATABASE_DIRECT_URL" -f drizzle/manual/0135_supplier_settlement_01.sql
-- Idempotent (IF NOT EXISTS / OR REPLACE / DO $$ EXCEPTION).
-- Retour arrière en bas de fichier.
-- =============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS supplier_settlements (
  id                        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  supplier_id               uuid NOT NULL,
  status                    varchar(20) NOT NULL DEFAULT 'pending',
  correction_type           varchar(20),
  correction_cause          varchar(20),
  reversal_cause            varchar(30),
  corrects_settlement_id    uuid REFERENCES supplier_settlements(id),
  reversed_by_settlement_id uuid REFERENCES supplier_settlements(id),
  reversed_via_cascade_of   uuid REFERENCES supplier_settlements(id),
  reversed_at               timestamptz,
  total_amount              numeric(14,2) NOT NULL,
  origin_system             varchar(30) NOT NULL DEFAULT 'manual',
  external_reference        text,
  proof_reference           text,
  notes                     text,
  declared_by               uuid NOT NULL,
  declared_at               timestamptz,
  confirmed_by              uuid,
  confirmed_at              timestamptz,
  created_at                timestamptz NOT NULL DEFAULT now(),
  updated_at                timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT supplier_settlements_status_check
    CHECK (status IN ('pending','declared','paid','reversed','failed','cancelled')),
  CONSTRAINT supplier_settlements_correction_type_check
    CHECK (correction_type IS NULL OR correction_type IN ('amount_correction','reversal')),
  CONSTRAINT supplier_settlements_correction_cause_check
    CHECK (correction_cause IS NULL OR correction_cause IN ('calculation_error','duplicate_entry','supplier_refund')),
  CONSTRAINT supplier_settlements_reversal_cause_check
    CHECK (reversal_cause IS NULL OR reversal_cause IN ('rejected_payment','erroneous_confirmation','duplicate_payment','other')),
  CONSTRAINT supplier_settlements_cause_consistency_check
    CHECK (
      (correction_type IS NULL AND correction_cause IS NULL AND reversal_cause IS NULL)
      OR (correction_type = 'amount_correction' AND correction_cause IS NOT NULL AND reversal_cause IS NULL)
      OR (correction_type = 'reversal' AND reversal_cause IS NOT NULL AND correction_cause IS NULL)
    )
);

CREATE UNIQUE INDEX IF NOT EXISTS supplier_settlements_anti_double_reversal
  ON supplier_settlements (corrects_settlement_id)
  WHERE correction_type = 'reversal' AND status NOT IN ('failed','cancelled');

CREATE UNIQUE INDEX IF NOT EXISTS supplier_settlements_anti_double_external_ref
  ON supplier_settlements (supplier_id, origin_system, external_reference)
  WHERE external_reference IS NOT NULL AND status NOT IN ('failed','cancelled');

CREATE INDEX IF NOT EXISTS supplier_settlements_supplier_idx ON supplier_settlements (supplier_id);
CREATE INDEX IF NOT EXISTS supplier_settlements_status_idx ON supplier_settlements (status);

CREATE TABLE IF NOT EXISTS supplier_settlement_entries (
  id                        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  settlement_id             uuid NOT NULL REFERENCES supplier_settlements(id),
  entitlement_id            uuid NOT NULL REFERENCES economic_entitlements(id),
  entry_kind                varchar(20) NOT NULL,
  amount                    numeric(14,2) NOT NULL,
  unlinked_at               timestamptz,
  unlinked_by_settlement_id uuid REFERENCES supplier_settlements(id),
  cancellation_review_note  text,
  created_at                timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT supplier_settlement_entries_entry_kind_check
    CHECK (entry_kind IN ('normal','amount_correction','reversal'))
);

CREATE UNIQUE INDEX IF NOT EXISTS supplier_settlement_entries_one_active_normal
  ON supplier_settlement_entries (entitlement_id)
  WHERE unlinked_at IS NULL AND entry_kind = 'normal';

CREATE INDEX IF NOT EXISTS supplier_settlement_entries_entitlement_idx
  ON supplier_settlement_entries (entitlement_id);
CREATE INDEX IF NOT EXISTS supplier_settlement_entries_settlement_idx
  ON supplier_settlement_entries (settlement_id);

-- ──────────────────────────────────────────────────────────────────────────────
-- Triggers : force 'pending' à la naissance, garde de transition d'état
-- (mirrors enforce_reservation_status_transition(), déjà en production).
-- ──────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION supplier_settlements_force_pending()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.status := 'pending';
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS supplier_settlements_force_pending_trg ON supplier_settlements;
CREATE TRIGGER supplier_settlements_force_pending_trg
  BEFORE INSERT ON supplier_settlements
  FOR EACH ROW EXECUTE FUNCTION supplier_settlements_force_pending();

CREATE OR REPLACE FUNCTION enforce_supplier_settlement_transition()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.status = NEW.status THEN
    RETURN NEW;
  END IF;
  IF (OLD.status, NEW.status) NOT IN (
    ('pending','declared'), ('pending','cancelled'),
    ('declared','paid'), ('declared','cancelled'), ('declared','failed'),
    ('paid','reversed')
  ) THEN
    RAISE EXCEPTION 'SUPPLIER_SETTLEMENT_INVALID_TRANSITION: % -> %', OLD.status, NEW.status
      USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS supplier_settlements_transition_guard ON supplier_settlements;
CREATE TRIGGER supplier_settlements_transition_guard
  BEFORE UPDATE ON supplier_settlements
  FOR EACH ROW EXECUTE FUNCTION enforce_supplier_settlement_transition();

-- ──────────────────────────────────────────────────────────────────────────────
-- Helper interne (pas exposé) : vérifie l'acteur, partagé par les 5 fonctions.
-- ──────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION assert_supplier_settlement_actor(p_actor_user_id uuid)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM users WHERE id = p_actor_user_id AND role = 'super_admin' AND status = 'active'
  ) THEN
    RAISE EXCEPTION 'SUPPLIER_SETTLEMENT_ACTOR_NOT_SUPER_ADMIN: %', p_actor_user_id;
  END IF;
END;
$$;
REVOKE ALL ON FUNCTION assert_supplier_settlement_actor(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION assert_supplier_settlement_actor(uuid) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION assert_supplier_settlement_actor(uuid) TO service_role, app_runtime;

-- ──────────────────────────────────────────────────────────────────────────────
-- 1. declare_supplier_settlement — règlement normal (batch)
-- ──────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION declare_supplier_settlement(
  p_actor_user_id uuid,
  p_supplier_id   uuid,
  p_entries       jsonb,
  p_proof_reference text,
  p_notes         text
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_settlement_id uuid;
  v_entry record;
  v_reservation_status reservation_status;
  v_party_type varchar(30);
  v_party_id uuid;
  v_inserted uuid;
BEGIN
  PERFORM assert_supplier_settlement_actor(p_actor_user_id);

  PERFORM 1 FROM economic_entitlements
  WHERE id IN (SELECT (e->>'entitlement_id')::uuid FROM jsonb_array_elements(p_entries) e)
  ORDER BY id FOR UPDATE;

  FOR v_entry IN
    SELECT (e->>'entitlement_id')::uuid AS entitlement_id,
           (e->>'amount')::numeric AS amount,
           e->>'cancellation_review_note' AS cancellation_review_note
    FROM jsonb_array_elements(p_entries) e
  LOOP
    SELECT r.status, ee.party_type, ee.party_id INTO v_reservation_status, v_party_type, v_party_id
    FROM economic_entitlements ee
    JOIN reservations r ON r.id = ee.reservation_id
    WHERE ee.id = v_entry.entitlement_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'SUPPLIER_SETTLEMENT_ENTITLEMENT_NOT_FOUND: %', v_entry.entitlement_id;
    END IF;

    IF v_party_type != 'supplier_node' THEN
      RAISE EXCEPTION 'SUPPLIER_SETTLEMENT_UNSUPPORTED_PARTY_TYPE: entitlement=%, party_type=% (seul supplier_node est couvert par ce mécanisme V1)',
        v_entry.entitlement_id, v_party_type;
    END IF;

    -- GARDE CROISÉE (étape 2 de la mission) : la créance doit appartenir au
    -- fournisseur déclaré p_supplier_id — ferme à la fois "dette du fournisseur A
    -- réglée sous le nom du fournisseur B" et "un même règlement mélange plusieurs
    -- fournisseurs" (chaque entrée du batch est vérifiée individuellement contre
    -- LE MÊME p_supplier_id).
    IF v_party_id IS DISTINCT FROM p_supplier_id THEN
      RAISE EXCEPTION 'SUPPLIER_SETTLEMENT_SUPPLIER_MISMATCH: entitlement=%, entitlement_supplier=%, declared_supplier=%',
        v_entry.entitlement_id, v_party_id, p_supplier_id;
    END IF;

    IF v_reservation_status IN ('cancelled','refunded')
       AND (v_entry.cancellation_review_note IS NULL OR btrim(v_entry.cancellation_review_note) = '') THEN
      RAISE EXCEPTION 'SUPPLIER_SETTLEMENT_REVIEW_NOTE_REQUIRED: entitlement=%, reservation_status=%',
        v_entry.entitlement_id, v_reservation_status;
    END IF;
  END LOOP;

  INSERT INTO supplier_settlements (supplier_id, total_amount, proof_reference, notes, declared_by)
  VALUES (
    p_supplier_id,
    (SELECT COALESCE(SUM((e->>'amount')::numeric), 0) FROM jsonb_array_elements(p_entries) e),
    p_proof_reference, p_notes, p_actor_user_id
  )
  RETURNING id INTO v_settlement_id;

  UPDATE supplier_settlements SET status = 'declared', declared_at = now() WHERE id = v_settlement_id;

  FOR v_entry IN
    SELECT (e->>'entitlement_id')::uuid AS entitlement_id,
           (e->>'amount')::numeric AS amount,
           e->>'cancellation_review_note' AS cancellation_review_note
    FROM jsonb_array_elements(p_entries) e
  LOOP
    INSERT INTO supplier_settlement_entries (settlement_id, entitlement_id, entry_kind, amount, cancellation_review_note)
    VALUES (v_settlement_id, v_entry.entitlement_id, 'normal', v_entry.amount, v_entry.cancellation_review_note)
    ON CONFLICT (entitlement_id) WHERE unlinked_at IS NULL AND entry_kind = 'normal'
    DO NOTHING
    RETURNING id INTO v_inserted;

    IF v_inserted IS NULL THEN
      RAISE EXCEPTION 'SUPPLIER_SETTLEMENT_ALREADY_ACTIVE: entitlement=% a déjà une jonction normale active', v_entry.entitlement_id;
    END IF;
  END LOOP;

  RETURN v_settlement_id;
END;
$$;

-- ──────────────────────────────────────────────────────────────────────────────
-- 2. request_supplier_settlement_correction — amount_correction (refund / calc_error / duplicate_entry)
-- ──────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION request_supplier_settlement_correction(
  p_actor_user_id uuid,
  p_entitlement_id uuid,
  p_target_settlement_id uuid,
  p_correction_cause text,
  p_amount numeric,
  p_external_reference text,
  p_cancellation_review_note text
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_settlement_id uuid;
  v_supplier_id uuid;
  v_party_type varchar(30);
  v_reservation_status reservation_status;
  v_net_decaisse numeric;
BEGIN
  PERFORM assert_supplier_settlement_actor(p_actor_user_id);

  IF p_correction_cause NOT IN ('calculation_error','duplicate_entry','supplier_refund') THEN
    RAISE EXCEPTION 'SUPPLIER_SETTLEMENT_INVALID_CAUSE: %', p_correction_cause;
  END IF;

  -- Récupérer la créance D'ABORD (avant toute vérification liée à p_target_settlement_id) :
  -- v_supplier_id (= le VRAI fournisseur de cette créance) doit être connu avant de
  -- pouvoir vérifier que la cible appartient bien à ce même fournisseur (étape 2 de
  -- la mission : "un remboursement doit cibler un règlement du même fournisseur").
  SELECT ee.party_id, ee.party_type, r.status INTO v_supplier_id, v_party_type, v_reservation_status
  FROM economic_entitlements ee JOIN reservations r ON r.id = ee.reservation_id
  WHERE ee.id = p_entitlement_id
  FOR UPDATE OF ee;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'SUPPLIER_SETTLEMENT_ENTITLEMENT_NOT_FOUND: %', p_entitlement_id;
  END IF;

  IF v_party_type != 'supplier_node' THEN
    RAISE EXCEPTION 'SUPPLIER_SETTLEMENT_UNSUPPORTED_PARTY_TYPE: entitlement=%, party_type=%', p_entitlement_id, v_party_type;
  END IF;

  IF p_correction_cause = 'supplier_refund' THEN
    IF p_target_settlement_id IS NULL OR p_external_reference IS NULL OR btrim(p_external_reference) = '' THEN
      RAISE EXCEPTION 'SUPPLIER_SETTLEMENT_REFUND_REQUIRES_TARGET_AND_REFERENCE';
    END IF;
    IF p_amount >= 0 THEN
      RAISE EXCEPTION 'SUPPLIER_SETTLEMENT_REFUND_MUST_BE_NEGATIVE: %', p_amount;
    END IF;

    -- GARDE CROISÉE : la cible doit être réellement payée ET appartenir au MÊME
    -- fournisseur que la créance remboursée — un remboursement ne peut jamais
    -- cibler un règlement d'un autre fournisseur, même s'il est "paid".
    PERFORM 1 FROM supplier_settlements s
    WHERE s.id = p_target_settlement_id AND s.status = 'paid' AND s.supplier_id = v_supplier_id
    FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'SUPPLIER_SETTLEMENT_TARGET_NOT_PAID_OR_SUPPLIER_MISMATCH: target=%, expected_supplier=%',
        p_target_settlement_id, v_supplier_id;
    END IF;

    -- GARDE EXACTE : la cible doit réellement contenir (ou avoir contenu) une
    -- jonction pour CETTE créance précise — jamais un règlement du même
    -- fournisseur mais sans rapport avec la dette remboursée.
    IF NOT EXISTS (
      SELECT 1 FROM supplier_settlement_entries se
      WHERE se.settlement_id = p_target_settlement_id AND se.entitlement_id = p_entitlement_id
    ) THEN
      RAISE EXCEPTION 'SUPPLIER_SETTLEMENT_TARGET_DOES_NOT_CONTAIN_ENTITLEMENT: target=%, entitlement=%',
        p_target_settlement_id, p_entitlement_id;
    END IF;

    -- CORRIGÉ (audit complémentaire) : net_decaisse = paiements réellement
    -- CONFIRMÉS (status='paid') moins remboursements réellement CONFIRMÉS —
    -- jamais une jonction d'un règlement encore 'declared'/'pending'/'cancelled'
    -- (pas un flux de trésorerie réel), et jamais les corrections
    -- calculation_error/duplicate_entry (elles ajustent la dette reconnue, pas
    -- la caisse). Verrou sur les entrées via le verrou déjà pris plus haut sur
    -- la ligne supplier_settlements cible (et l'entitlement) — suffisant car
    -- toute écriture passe exclusivement par ces fonctions.
    SELECT COALESCE(SUM(se.amount) FILTER (WHERE se.entry_kind = 'normal'), 0)
         + COALESCE(SUM(se.amount) FILTER (WHERE se.entry_kind = 'amount_correction' AND s.correction_cause = 'supplier_refund'), 0)
      INTO v_net_decaisse
    FROM supplier_settlement_entries se
    JOIN supplier_settlements s ON s.id = se.settlement_id
    WHERE se.entitlement_id = p_entitlement_id AND se.unlinked_at IS NULL AND s.status = 'paid';

    IF v_net_decaisse + p_amount < 0 THEN
      RAISE EXCEPTION 'SUPPLIER_SETTLEMENT_REFUND_EXCEEDS_NET: net_decaisse=%, refund=%', v_net_decaisse, p_amount;
    END IF;
  ELSE
    IF p_target_settlement_id IS NOT NULL THEN
      RAISE EXCEPTION 'SUPPLIER_SETTLEMENT_CALC_CORRECTION_MUST_NOT_TARGET_SETTLEMENT';
    END IF;
  END IF;

  IF v_reservation_status IN ('cancelled','refunded')
     AND (p_cancellation_review_note IS NULL OR btrim(p_cancellation_review_note) = '') THEN
    RAISE EXCEPTION 'SUPPLIER_SETTLEMENT_REVIEW_NOTE_REQUIRED: entitlement=%, reservation_status=%',
      p_entitlement_id, v_reservation_status;
  END IF;

  INSERT INTO supplier_settlements (
    supplier_id, correction_type, correction_cause, corrects_settlement_id,
    total_amount, external_reference, declared_by
  ) VALUES (
    v_supplier_id, 'amount_correction', p_correction_cause, p_target_settlement_id,
    p_amount, p_external_reference, p_actor_user_id
  ) RETURNING id INTO v_settlement_id;

  UPDATE supplier_settlements SET status = 'declared', declared_at = now() WHERE id = v_settlement_id;

  INSERT INTO supplier_settlement_entries (settlement_id, entitlement_id, entry_kind, amount, cancellation_review_note)
  VALUES (v_settlement_id, p_entitlement_id, 'amount_correction', p_amount, p_cancellation_review_note);

  RETURN v_settlement_id;
END;
$$;

-- ──────────────────────────────────────────────────────────────────────────────
-- 3. request_supplier_settlement_reversal — montant TOUJOURS auto-calculé
-- ──────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION request_supplier_settlement_reversal(
  p_actor_user_id uuid,
  p_target_settlement_id uuid,
  p_reversal_cause text,
  p_reference text
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_settlement_id uuid;
  v_supplier_id uuid;
  v_amount numeric;
  v_inserted uuid;
BEGIN
  PERFORM assert_supplier_settlement_actor(p_actor_user_id);

  IF p_reversal_cause NOT IN ('rejected_payment','erroneous_confirmation','duplicate_payment','other') THEN
    RAISE EXCEPTION 'SUPPLIER_SETTLEMENT_INVALID_REVERSAL_CAUSE: %', p_reversal_cause;
  END IF;

  SELECT supplier_id INTO v_supplier_id
  FROM supplier_settlements WHERE id = p_target_settlement_id AND status = 'paid'
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'SUPPLIER_SETTLEMENT_TARGET_NOT_PAID: %', p_target_settlement_id;
  END IF;

  SELECT COALESCE(SUM(amount), 0) INTO v_amount
  FROM supplier_settlement_entries WHERE settlement_id = p_target_settlement_id AND unlinked_at IS NULL;

  INSERT INTO supplier_settlements (
    supplier_id, correction_type, reversal_cause, corrects_settlement_id,
    total_amount, external_reference, declared_by
  ) VALUES (
    v_supplier_id, 'reversal', p_reversal_cause, p_target_settlement_id,
    -v_amount, p_reference, p_actor_user_id
  )
  ON CONFLICT (corrects_settlement_id) WHERE correction_type = 'reversal' AND status NOT IN ('failed','cancelled')
  DO NOTHING
  RETURNING id INTO v_inserted;

  IF v_inserted IS NULL THEN
    RAISE EXCEPTION 'SUPPLIER_SETTLEMENT_ALREADY_REVERSED: %', p_target_settlement_id;
  END IF;

  UPDATE supplier_settlements SET status = 'declared', declared_at = now() WHERE id = v_inserted;

  RETURN v_inserted;
END;
$$;

-- ──────────────────────────────────────────────────────────────────────────────
-- 4. confirm_supplier_settlement — confirme normal / correction / réversion (cascade sélective)
-- ──────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION confirm_supplier_settlement(
  p_actor_user_id uuid,
  p_settlement_id uuid
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_row supplier_settlements%ROWTYPE;
  v_entry record;
  v_target_amount numeric;
  v_cascade record;
  v_refund_entitlement_id uuid;
  v_refund_amount numeric;
  v_net_decaisse_at_confirm numeric;
BEGIN
  PERFORM assert_supplier_settlement_actor(p_actor_user_id);

  SELECT * INTO v_row FROM supplier_settlements WHERE id = p_settlement_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'SUPPLIER_SETTLEMENT_NOT_FOUND: %', p_settlement_id;
  END IF;

  IF v_row.correction_type IS DISTINCT FROM 'reversal' THEN
    IF v_row.status != 'declared' THEN
      RAISE EXCEPTION 'SUPPLIER_SETTLEMENT_NOT_DECLARED: % (status=%)', p_settlement_id, v_row.status;
    END IF;

    FOR v_entry IN
      SELECT se.entitlement_id, se.cancellation_review_note, r.status AS reservation_status
      FROM supplier_settlement_entries se
      JOIN economic_entitlements ee ON ee.id = se.entitlement_id
      JOIN reservations r ON r.id = ee.reservation_id
      WHERE se.settlement_id = p_settlement_id AND se.unlinked_at IS NULL
    LOOP
      IF v_entry.reservation_status IN ('cancelled','refunded')
         AND (v_entry.cancellation_review_note IS NULL OR btrim(v_entry.cancellation_review_note) = '') THEN
        RAISE EXCEPTION 'SUPPLIER_SETTLEMENT_REVIEW_NOTE_MISSING_AT_CONFIRM: entitlement=%, reservation_status=%',
          v_entry.entitlement_id, v_entry.reservation_status;
      END IF;
    END LOOP;

    -- REVÉRIFICATION ANTI-NET-NÉGATIF À LA CONFIRMATION (gap de concurrence
    -- trouvé lors de l'audit complémentaire) : la vérification faite à la
    -- déclaration (request_supplier_settlement_correction) ne compte que les
    -- entrées déjà 'paid' — deux remboursements déclarés avant que l'un ou
    -- l'autre ne soit confirmé passent chacun la vérification individuellement.
    -- Sans cette revérification, confirmer le second APRÈS le premier pourrait
    -- faire passer le net réellement décaissé sous zéro. Verrou sur
    -- l'entitlement : sérialise deux confirmations concurrentes visant la
    -- même créance.
    IF v_row.correction_type = 'amount_correction' AND v_row.correction_cause = 'supplier_refund' THEN
      SELECT se.entitlement_id, se.amount INTO v_refund_entitlement_id, v_refund_amount
      FROM supplier_settlement_entries se WHERE se.settlement_id = p_settlement_id LIMIT 1;

      PERFORM 1 FROM economic_entitlements WHERE id = v_refund_entitlement_id FOR UPDATE;

      SELECT COALESCE(SUM(se.amount) FILTER (WHERE se.entry_kind = 'normal'), 0)
           + COALESCE(SUM(se.amount) FILTER (WHERE se.entry_kind = 'amount_correction' AND s2.correction_cause = 'supplier_refund'), 0)
        INTO v_net_decaisse_at_confirm
      FROM supplier_settlement_entries se
      JOIN supplier_settlements s2 ON s2.id = se.settlement_id
      WHERE se.entitlement_id = v_refund_entitlement_id AND se.unlinked_at IS NULL
        AND s2.status = 'paid' AND s2.id != p_settlement_id;

      IF v_net_decaisse_at_confirm + v_refund_amount < 0 THEN
        RAISE EXCEPTION 'SUPPLIER_SETTLEMENT_REFUND_EXCEEDS_NET_AT_CONFIRM: net_decaisse=%, refund=%',
          v_net_decaisse_at_confirm, v_refund_amount;
      END IF;
    END IF;

    UPDATE supplier_settlements
    SET status = 'paid', confirmed_by = p_actor_user_id, confirmed_at = now()
    WHERE id = p_settlement_id;
  ELSE
    SELECT COALESCE(SUM(amount), 0) INTO v_target_amount
    FROM supplier_settlement_entries
    WHERE settlement_id = v_row.corrects_settlement_id AND unlinked_at IS NULL;

    PERFORM 1 FROM supplier_settlements WHERE id = v_row.corrects_settlement_id AND status = 'paid' FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'SUPPLIER_SETTLEMENT_REVERSAL_TARGET_NOT_PAID: %', v_row.corrects_settlement_id;
    END IF;

    UPDATE supplier_settlement_entries
    SET unlinked_at = now(), unlinked_by_settlement_id = p_settlement_id
    WHERE settlement_id = v_row.corrects_settlement_id AND unlinked_at IS NULL;

    UPDATE supplier_settlements
    SET status = 'reversed', reversed_by_settlement_id = p_settlement_id, reversed_at = now()
    WHERE id = v_row.corrects_settlement_id;

    FOR v_cascade IN
      SELECT id FROM supplier_settlements
      WHERE corrects_settlement_id = v_row.corrects_settlement_id
        AND correction_type = 'amount_correction'
        AND correction_cause = 'supplier_refund'
        AND status = 'paid'
    LOOP
      UPDATE supplier_settlement_entries
      SET unlinked_at = now(), unlinked_by_settlement_id = p_settlement_id
      WHERE settlement_id = v_cascade.id AND unlinked_at IS NULL;

      UPDATE supplier_settlements
      SET status = 'reversed', reversed_via_cascade_of = v_row.corrects_settlement_id, reversed_at = now()
      WHERE id = v_cascade.id;
    END LOOP;

    UPDATE supplier_settlements
    SET total_amount = -v_target_amount, status = 'paid', confirmed_by = p_actor_user_id, confirmed_at = now()
    WHERE id = p_settlement_id;
  END IF;
END;
$$;

-- ──────────────────────────────────────────────────────────────────────────────
-- 5. cancel_supplier_settlement_declaration
-- ──────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION cancel_supplier_settlement_declaration(
  p_actor_user_id uuid,
  p_settlement_id uuid
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_status varchar(20);
BEGIN
  PERFORM assert_supplier_settlement_actor(p_actor_user_id);

  SELECT status INTO v_status FROM supplier_settlements WHERE id = p_settlement_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'SUPPLIER_SETTLEMENT_NOT_FOUND: %', p_settlement_id;
  END IF;
  IF v_status NOT IN ('pending','declared') THEN
    RAISE EXCEPTION 'SUPPLIER_SETTLEMENT_CANNOT_CANCEL: status=%', v_status;
  END IF;

  -- CORRIGÉ (audit complémentaire, point 4) : sans ceci, les jonctions créées
  -- à la déclaration restaient actives (unlinked_at IS NULL) après annulation
  -- — bloquant toute réaffectation future de la créance (index unique partiel
  -- "une seule jonction normale active") ET risquant d'être comptées comme un
  -- paiement réel si le filtre status='paid' de la lecture financière venait
  -- à être retiré par erreur un jour. Annuler une déclaration doit désactiver
  -- ses propres jonctions, exactement comme une réversion le fait pour un
  -- règlement payé.
  UPDATE supplier_settlement_entries
  SET unlinked_at = now(), unlinked_by_settlement_id = p_settlement_id
  WHERE settlement_id = p_settlement_id AND unlinked_at IS NULL;

  UPDATE supplier_settlements SET status = 'cancelled' WHERE id = p_settlement_id;
END;
$$;

-- ──────────────────────────────────────────────────────────────────────────────
-- GRANTS — aucune écriture directe, RLS super_admin, EXECUTE service_role/app_runtime uniquement
-- ──────────────────────────────────────────────────────────────────────────────
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON supplier_settlements, supplier_settlement_entries
  FROM app_runtime, anon, authenticated, service_role;
GRANT SELECT ON supplier_settlements, supplier_settlement_entries TO authenticated, service_role, app_runtime;

ALTER TABLE supplier_settlements ENABLE ROW LEVEL SECURITY;
ALTER TABLE supplier_settlement_entries ENABLE ROW LEVEL SECURITY;

-- NOTE (trouvé en test réel ce chantier) : le précédent `commission_settlements_superadmin`
-- (0066) scope sa policy `TO authenticated` seul — `app_runtime` (rôle de connexion
-- réel du backend, PAS membre du rôle `authenticated`, vérifié : aucune ligne
-- `pg_auth_members`) ne peut alors lire ces tables par un SELECT direct (lecture
-- admin/reporting), seulement via les fonctions SECURITY DEFINER (propriétaire
-- exempté de RLS). Possible écart préexistant sur `commission_settlements`, non
-- corrigé ici (hors périmètre, table financière déjà en production) — mais corrigé
-- dès l'origine ici en scopant explicitement la policy aux 3 rôles qui en ont besoin.
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='supplier_settlements' AND policyname='supplier_settlements_superadmin') THEN
    EXECUTE $policy$
      CREATE POLICY supplier_settlements_superadmin ON supplier_settlements
        FOR ALL TO authenticated, service_role, app_runtime USING (is_super_admin()) WITH CHECK (is_super_admin())
    $policy$;
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='supplier_settlement_entries' AND policyname='supplier_settlement_entries_superadmin') THEN
    EXECUTE $policy$
      CREATE POLICY supplier_settlement_entries_superadmin ON supplier_settlement_entries
        FOR ALL TO authenticated, service_role, app_runtime USING (is_super_admin()) WITH CHECK (is_super_admin())
    $policy$;
  END IF;
END $$;
ALTER TABLE supplier_settlements FORCE ROW LEVEL SECURITY;
ALTER TABLE supplier_settlement_entries FORCE ROW LEVEL SECURITY;

REVOKE ALL ON FUNCTION declare_supplier_settlement(uuid, uuid, jsonb, text, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION declare_supplier_settlement(uuid, uuid, jsonb, text, text) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION declare_supplier_settlement(uuid, uuid, jsonb, text, text) TO service_role, app_runtime;

REVOKE ALL ON FUNCTION request_supplier_settlement_correction(uuid, uuid, uuid, text, numeric, text, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION request_supplier_settlement_correction(uuid, uuid, uuid, text, numeric, text, text) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION request_supplier_settlement_correction(uuid, uuid, uuid, text, numeric, text, text) TO service_role, app_runtime;

REVOKE ALL ON FUNCTION request_supplier_settlement_reversal(uuid, uuid, text, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION request_supplier_settlement_reversal(uuid, uuid, text, text) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION request_supplier_settlement_reversal(uuid, uuid, text, text) TO service_role, app_runtime;

REVOKE ALL ON FUNCTION confirm_supplier_settlement(uuid, uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION confirm_supplier_settlement(uuid, uuid) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION confirm_supplier_settlement(uuid, uuid) TO service_role, app_runtime;

REVOKE ALL ON FUNCTION cancel_supplier_settlement_declaration(uuid, uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION cancel_supplier_settlement_declaration(uuid, uuid) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION cancel_supplier_settlement_declaration(uuid, uuid) TO service_role, app_runtime;

COMMIT;

-- Retour arrière :
--   BEGIN;
--   DROP FUNCTION IF EXISTS cancel_supplier_settlement_declaration(uuid, uuid);
--   DROP FUNCTION IF EXISTS confirm_supplier_settlement(uuid, uuid);
--   DROP FUNCTION IF EXISTS request_supplier_settlement_reversal(uuid, uuid, text, text);
--   DROP FUNCTION IF EXISTS request_supplier_settlement_correction(uuid, uuid, uuid, text, numeric, text, text);
--   DROP FUNCTION IF EXISTS declare_supplier_settlement(uuid, uuid, jsonb, text, text);
--   DROP FUNCTION IF EXISTS assert_supplier_settlement_actor(uuid);
--   DROP TABLE IF EXISTS supplier_settlement_entries;
--   DROP TABLE IF EXISTS supplier_settlements;
--   DROP FUNCTION IF EXISTS enforce_supplier_settlement_transition();
--   DROP FUNCTION IF EXISTS supplier_settlements_force_pending();
--   COMMIT;
