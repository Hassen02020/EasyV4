-- PHASE 38D — Easy2Book Rewards (Loyalty V1).
--
-- Deux tables, même modèle éprouvé que Wallet (wallet_accounts +
-- wallet_ledger, voir lib/db/schema/financials.ts) : un compte par client
-- (solde dénormalisé pour lecture rapide) + un grand livre APPEND-ONLY qui
-- reste la SEULE source de vérité (jamais `loyalty_accounts.*_points` seul
-- — voir lib/loyalty/rewards-core.ts). Volontairement une table DISTINCTE
-- de wallet_accounts/wallet_ledger : les points ne sont ni de l'argent, ni
-- transférables, ni encaissables (aucun cash-out) — les mélanger avec le
-- Wallet romprait cette distinction et la garantie "jamais de wallet_ledger
-- avec source='refund' pour un mouvement qui n'en est pas un" déjà
-- documentée dans lib/finance/customer-wallet.ts.
--
-- Deux compteurs (pending/available) reflètent le cycle de vie explicite du
-- mandat : "Points are PENDING at booking and AVAILABLE only after
-- validated completion." Chaque ligne de `loyalty_ledger` ne touche QU'UN
-- SEUL compteur (bucket) — une conversion pending→available s'écrit comme
-- DEUX lignes dans la MÊME transaction (une sortie pending, une entrée
-- available), jamais un seul mouvement ambigu.

create table loyalty_accounts (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid not null references agencies(id) on delete cascade,
  customer_id uuid not null references customers(id) on delete cascade,
  pending_points integer not null default 0,
  available_points integer not null default 0,
  lifetime_earned_points integer not null default 0,
  lifetime_redeemed_points integer not null default 0,
  -- Dernière activité (earn/redeem/reverse/reinstate) — base de l'expiration
  -- après 24 mois d'inactivité (lib/loyalty/rewards-core.ts::isExpiredByInactivity).
  last_activity_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint loyalty_accounts_pending_nonneg check (pending_points >= 0),
  constraint loyalty_accounts_available_nonneg check (available_points >= 0)
);

create unique index loyalty_accounts_customer_uniq on loyalty_accounts (customer_id);
create index loyalty_accounts_agency_idx on loyalty_accounts (agency_id);

alter table loyalty_accounts enable row level security;
alter table loyalty_accounts force row level security;

create policy "loyalty_accounts_tenant_isolation" on loyalty_accounts
  for all
  using (agency_id = current_agency_id() or is_super_admin())
  with check (agency_id = current_agency_id() or is_super_admin());

-- Grand livre — jamais modifié ni supprimé après insertion (même discipline
-- que wallet_ledger/audit_events). `idempotency_key` garantit "au plus une
-- fois" par événement métier (ex. "earn-pending:{reservationId}",
-- "convert-available:{reservationId}", "reverse:{reservationId}",
-- "redeem:{ledgerEntryId}") — un rejeu (retry réseau, double-clic, webhook
-- rejoué) ne produit jamais un second mouvement.
create table loyalty_ledger (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid not null references agencies(id) on delete cascade,
  loyalty_account_id uuid not null references loyalty_accounts(id) on delete cascade,
  customer_id uuid not null references customers(id) on delete cascade,
  -- 'earn_pending' | 'convert_pending_out' | 'convert_available_in' |
  -- 'redeem' | 'reverse_pending' | 'reverse_available' | 'reinstate' | 'expire'
  type varchar(32) not null,
  bucket varchar(16) not null,
  -- Delta signé appliqué à CE bucket (positif = crédit, négatif = débit).
  points integer not null,
  balance_before integer not null,
  balance_after integer not null,
  -- Réservation à l'origine du mouvement : celle qui a généré les points
  -- (earn/convert/reverse) OU celle contre laquelle ils sont dépensés
  -- (redeem/reinstate). Jamais de FK stricte (une réservation annulée par
  -- l'admin back-office reste consultable ici même si un jour purgée).
  reservation_id uuid,
  description text not null,
  metadata jsonb,
  idempotency_key text,
  created_by_user_id uuid,
  created_at timestamptz not null default now(),
  constraint loyalty_ledger_bucket_check check (bucket in ('pending', 'available'))
);

create unique index loyalty_ledger_idempotency_uniq
  on loyalty_ledger (idempotency_key)
  where idempotency_key is not null;
create index loyalty_ledger_account_idx on loyalty_ledger (loyalty_account_id, created_at);
create index loyalty_ledger_reservation_idx on loyalty_ledger (reservation_id);
create index loyalty_ledger_agency_idx on loyalty_ledger (agency_id);

alter table loyalty_ledger enable row level security;
alter table loyalty_ledger force row level security;

create policy "loyalty_ledger_tenant_isolation" on loyalty_ledger
  for all
  using (agency_id = current_agency_id() or is_super_admin())
  with check (agency_id = current_agency_id() or is_super_admin());
