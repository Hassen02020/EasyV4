-- PAYMEE-EVENTID-01 : élargir payments.psp_transaction_id de varchar(64) à varchar(128)
--
-- Contexte : le champ eventId Paymee suit deux formats :
--   • paiement réussi avec transaction_id valide  → "paymee-transaction-{int}"  (≤ 27 chars) ✓
--   • paiement échoué ou transaction_id absent    → "paymee-{token}-{eventType}"
--     Avec un token réel de 40 chars (ex. "tok_" + UUID 36 chars), ce format atteint
--     7 + 40 + 1 + 22 = 70 chars > 64 — déclenchait une erreur PostgreSQL 22001
--     (value too long for type character varying(64)) dans les tests d'intégration.
--
-- Fix : varchar(64) → varchar(128). Compatible avec tous les autres PSP :
--   • Stripe PaymentIntent IDs  : ~28 chars
--   • SPS transaction_id        : format court, < 40 chars
--   • Paymee eventId fallback   : jusqu'à ~70 chars avec un token UUID
--
-- Migration idempotente (ALTER TYPE change vers un type plus large, jamais destructif).
-- Aucun index ni contrainte sur cette colonne — aucune dépendance à mettre à jour.

ALTER TABLE "payments" ALTER COLUMN "psp_transaction_id" SET DATA TYPE varchar(128);
