-- =============================================================================
-- Easy2Book — economic_entitlements_compensates_uniq (CANCEL-COMMISSION-01,
-- correctif Bloquant A : idempotence comptable de bout en bout)
-- =============================================================================
-- Contexte : `reverseCommissionOnCancellation()` (lib/finance/commission-reversal.ts)
-- appelle `debit_platform_commission()` (idempotent via idempotency_key, migration
-- 0133) PUIS insère une ligne compensatoire `economic_entitlements` pointant vers
-- l'entitlement d'origine via `compensates_id`. Un appel répété (retry réseau,
-- double-clic, ou — plus grave — deux transactions concurrentes sur la même
-- réservation) voyait le débit wallet correctement ignoré par l'idempotency key
-- SQL, mais le code TypeScript insérait quand même une SECONDE ligne
-- compensatoire sans aucune protection — traçabilité comptable dupliquée sans
-- mouvement wallet correspondant.
--
-- Le code applicatif (commission-reversal.ts) vérifie désormais l'existence
-- d'une compensation avant d'en insérer une nouvelle, mais un SELECT puis
-- INSERT dans la même transaction ne ferme PAS la fenêtre de course entre deux
-- transactions concurrentes (chacune peut voir "aucune compensation" avant que
-- l'autre ne committe la sienne). Cette contrainte UNIQUE est le filet de
-- sécurité au niveau DB qui rend la double-compensation structurellement
-- impossible, quel que soit le chemin applicatif qui y mène.
--
-- Portée : UNIQUE sur `compensates_id` (jamais sur `id`) — chaque entitlement
-- d'origine ne peut être compensé qu'UNE SEULE FOIS, pour toujours. Ce modèle
-- suppose qu'un reversement est binaire (fait / pas fait), jamais partiel —
-- cohérent avec les 3 politiques existantes (full_reversal = tout, non_refundable
-- = rien mais trace à 0.00, pro_rata_fee = rejeté/non implémenté). Si un futur
-- chantier introduit un reversement réellement partiel (plusieurs compensations
-- successives sur le même entitlement), cette contrainte devra être revue —
-- ce n'est pas le cas aujourd'hui (aucun call site ne fait de reversement
-- partiel, confirmé par audit du dépôt).
--
-- Index PARTIEL (WHERE compensates_id IS NOT NULL) : la plupart des lignes
-- economic_entitlements ne sont pas des compensations (compensates_id NULL) —
-- même convention que wallet_ledger_idempotency_uniq (migration 0084).
--
-- Application :
--   psql "$DATABASE_DIRECT_URL" -f drizzle/manual/0134_economic_entitlements_compensates_uniq.sql
-- NON APPLIQUÉ EN PRODUCTION PAR CETTE SESSION — préparé uniquement, sur la
-- branche de travail, en attente de validation/application manuelle.
--
-- Pré-requis AVANT application en production : vérifier qu'aucune ligne
-- existante ne viole déjà cette contrainte (la migration elle-même échouerait
-- sinon, sans rien corrompre — CREATE UNIQUE INDEX sur une table existante est
-- transactionnel et se rejette proprement en cas de doublon détecté) :
--
--   SELECT compensates_id, COUNT(*)
--   FROM economic_entitlements
--   WHERE compensates_id IS NOT NULL
--   GROUP BY compensates_id
--   HAVING COUNT(*) > 1;
--
-- Retour arrière :
--   DROP INDEX IF EXISTS economic_entitlements_compensates_uniq;
-- =============================================================================

BEGIN;

DROP INDEX IF EXISTS economic_entitlements_compensates_idx;

CREATE UNIQUE INDEX IF NOT EXISTS economic_entitlements_compensates_uniq
  ON economic_entitlements (compensates_id)
  WHERE compensates_id IS NOT NULL;

COMMIT;
