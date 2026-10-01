-- =============================================================================
-- chantier-49, sous-chantier B — Backstop DB pour l'idempotence des
-- mouvements financiers, indépendant de Redis.
--
-- Contexte (audit A2/A5) : `debitPartnerCredit` (lib/pro/booking-actions.ts)
-- et `debitCustomerWallet`/`creditCustomerWallet` (lib/finance/customer-
-- wallet.ts) acceptent un `idempotencyKey`, mais ne l'utilisaient QUE pour
-- un cache Redis (get-avant-run-avant-set, non atomique, ET dégradation
-- SILENCIEUSE si Redis est indisponible — aucune protection dans ce cas).
-- Les autres flux financiers critiques (`reservations`, `payments`,
-- `loyalty_ledger`) ont déjà un backstop DB (index unique partiel) depuis
-- les phases 20/22 — celui-ci comblait un angle mort resté ouvert sur
-- `wallet_ledger`/`partner_credit_movements`.
--
-- Même pattern que 0030_guest_reservation_idempotency.sql : colonne
-- nullable + index unique PARTIEL (où la clé n'est pas null), pour ne rien
-- casser sur les lignes historiques (idempotencyKey absent avant ce
-- chantier).
-- =============================================================================

alter table wallet_ledger add column if not exists idempotency_key text;

create unique index if not exists wallet_ledger_idempotency_uniq
  on wallet_ledger (idempotency_key)
  where idempotency_key is not null;

alter table partner_credit_movements add column if not exists idempotency_key text;

create unique index if not exists partner_credit_movements_idempotency_uniq
  on partner_credit_movements (idempotency_key)
  where idempotency_key is not null;
