-- Wallet/Payment Core (EASY2BOOK — WALLET/PAYMENT CORE mission, branche v7).
--
-- Appliquée en direct sur le projet Supabase live (vqhuptgjhoornteibbpj) via
-- l'outil MCP `apply_migration` lors de l'implémentation initiale du moteur
-- Wallet/Payment Core — jamais committée comme fichier de migration versionné
-- à l'époque (contrairement à toutes les autres migrations du repo). Ce
-- fichier capture a posteriori le SQL réellement appliqué, pour la parité
-- schéma/DB et la reproductibilité (notamment pour reconstruire un miroir
-- local fidèle en Phase 14.3).
--
-- reservation_status gagne "expired" (terminal — voir
-- lib/admin/reservation-status.ts, aucune transition sortante). reservations
-- gagne payment_expires_at (nullable, posé uniquement pour cash/transfer,
-- fenêtre de 24h). payments gagne un index unique partiel garantissant au
-- plus un paiement "captured" par réservation (garde-fou anti double-capture
-- au niveau DB). wallet_accounts (jusque-là 100% code mort, zéro appelant
-- réel — voir lib/db/schema/financials.ts) est réactivée comme le moteur
-- Wallet Client (B2C) : agency_id devient nullable, customer_id est ajouté,
-- une contrainte CHECK impose exactement un propriétaire (agence XOR
-- client) — le moteur B2B réel (agencies.deposit_balance +
-- partner_credit_movements) n'est pas touché.

alter type reservation_status add value if not exists 'expired';

alter table reservations
  add column if not exists payment_expires_at timestamptz;

create unique index if not exists payments_reservation_captured_uniq
  on payments (reservation_id) where status = 'captured';

alter table wallet_accounts
  add column if not exists customer_id uuid references customers(id) on delete restrict;

alter table wallet_accounts
  alter column agency_id drop not null;

alter table wallet_accounts
  drop constraint if exists wallet_accounts_owner_check;

alter table wallet_accounts
  add constraint wallet_accounts_owner_check
  check ((agency_id is not null and customer_id is null) or (agency_id is null and customer_id is not null));

create index if not exists wallet_accounts_customer_idx
  on wallet_accounts (customer_id) where customer_id is not null;
