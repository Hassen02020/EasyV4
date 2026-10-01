-- =============================================================================
-- R6-01-DB-CONSTRAINT (2026-10-01)
--
-- Audit (Phase 0, confirmé à nouveau le 2026-10-01) : `isTransitionAllowed()`
-- (lib/admin/reservation-status.ts) + `recordReservationTransition()`
-- (lib/admin/reservation-status-history.ts) valident déjà chaque transition
-- CÔTÉ APPLICATION, sur les 22 sites réels d'écriture de `reservations
-- .status`. Mais `recordReservationTransition()` N'EFFECTUE PAS l'UPDATE
-- lui-même (voir son propre commentaire) — rien côté Postgres n'empêche un
-- UPDATE direct (bug futur, contournement, requête manuelle) de poser une
-- transition invalide. Ce trigger est le dernier filet de sécurité,
-- strictement au niveau DB, MIROIR EXACT de la table ALLOWED_TRANSITIONS
-- TypeScript ci-dessous — aucune règle métier nouvelle inventée ici.
--
-- ALLOWED_TRANSITIONS (lib/admin/reservation-status.ts, recopiée à l'identique) :
--   pending     -> confirmed, on_request, cancelled, expired
--   on_request  -> confirmed, cancelled
--   confirmed   -> cancelled, completed, refunded
--   cancelled   -> pending
--   no_show     -> refunded
--   completed   -> refunded
--   refunded    -> (terminal)
--   expired     -> (terminal)
--
-- Portée volontairement limitée à l'UPDATE (BEFORE UPDATE, OLD.status IS
-- DISTINCT FROM NEW.status) — PAS à l'INSERT. Audit confirmé : aucun flux
-- applicatif réel n'insère une réservation avec un statut initial autre que
-- 'pending' ; mais de nombreux fichiers de test (fixtures, non des flux
-- réels) insèrent directement une réservation déjà 'confirmed' pour isoler
-- ce qu'ils testent (ex. document-access-control.test.ts,
-- customer-ownership.test.ts, policy-cancel.test.ts, economic-entitlements-
-- network.test.ts, currency-dim-01-plumbing.test.ts). Contraindre l'INSERT
-- casserait ces fixtures légitimes sans rapport avec ce que ce chantier
-- corrige (une TRANSITION invalide, pas une création).
--
-- Application : psql "$DATABASE_DIRECT_URL" -f drizzle/manual/0090_reservation_status_transition_guard.sql
-- Idempotent (CREATE OR REPLACE FUNCTION, DROP TRIGGER IF EXISTS avant
-- CREATE TRIGGER). Retour arrière en bas de fichier.
-- =============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION enforce_reservation_status_transition()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    IF NOT (
      (OLD.status = 'pending'    AND NEW.status IN ('confirmed', 'on_request', 'cancelled', 'expired')) OR
      (OLD.status = 'on_request' AND NEW.status IN ('confirmed', 'cancelled')) OR
      (OLD.status = 'confirmed'  AND NEW.status IN ('cancelled', 'completed', 'refunded')) OR
      (OLD.status = 'cancelled'  AND NEW.status = 'pending') OR
      (OLD.status = 'no_show'    AND NEW.status = 'refunded') OR
      (OLD.status = 'completed'  AND NEW.status = 'refunded')
      -- 'refunded' et 'expired' sont terminaux : aucune ligne ne les autorise
      -- comme OLD.status ci-dessus, donc tout NEW.status depuis l'un des
      -- deux est rejeté par ce garde-fou.
    ) THEN
      RAISE EXCEPTION 'reservation_status_transition_invalid: % -> % (reservation %)',
        OLD.status, NEW.status, OLD.id
        USING ERRCODE = '23514'; -- check_violation, cohérent avec un CHECK
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS reservation_status_transition_guard ON reservations;

CREATE TRIGGER reservation_status_transition_guard
  BEFORE UPDATE ON reservations
  FOR EACH ROW
  EXECUTE FUNCTION enforce_reservation_status_transition();

COMMIT;

-- Retour arrière :
--   DROP TRIGGER IF EXISTS reservation_status_transition_guard ON reservations;
--   DROP FUNCTION IF EXISTS enforce_reservation_status_transition();
