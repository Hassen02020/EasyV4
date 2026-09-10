-- PHASE 27 — Multi-Tenant Universal Hotel Supplier Control Plane.
--
-- 4 tables, strictly separating supplier DEFINITION, ACCOUNT, CREDENTIALS
-- (always encrypted, never selected by ordinary CRUD/list queries) and
-- AUTHORIZATION (explicit grants, never implicit access). `agency_id`
-- columns reuse the existing `agencies` tenant model as-is — no new
-- hierarchy/parent-agency concept introduced. RLS reuses the exact
-- `agency_id = current_agency_id() OR is_super_admin()` pattern already
-- used across the codebase (see 0001_rls_policies.sql).

create type hotel_supplier_doc_status as enum ('documented', 'documentation_required');
create type hotel_supplier_owner_type as enum ('master', 'agency', 'whitelabel');
create type hotel_supplier_account_status as enum ('active', 'disabled', 'invalid_credentials', 'not_configured', 'error');

create table hotel_suppliers (
  id uuid primary key default gen_random_uuid(),
  code varchar(32) not null,
  name varchar(100) not null,
  driver varchar(32) not null,
  capabilities jsonb not null default '[]'::jsonb,
  documentation_status hotel_supplier_doc_status not null default 'documentation_required',
  is_globally_enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index hotel_suppliers_code_uniq on hotel_suppliers (code);

create table hotel_supplier_accounts (
  id uuid primary key default gen_random_uuid(),
  supplier_id uuid not null references hotel_suppliers(id) on delete restrict,
  owner_type hotel_supplier_owner_type not null,
  agency_id uuid not null references agencies(id) on delete restrict,
  display_name varchar(200) not null,
  status hotel_supplier_account_status not null default 'not_configured',
  mode varchar(16) not null default 'live',
  priority integer not null default 100,
  timeout_ms integer,
  is_default boolean not null default false,
  last_tested_at timestamptz,
  last_test_status varchar(32),
  last_test_error_code varchar(64),
  created_by_user_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index hotel_supplier_accounts_agency_idx on hotel_supplier_accounts (agency_id);
create index hotel_supplier_accounts_supplier_idx on hotel_supplier_accounts (supplier_id);
create index hotel_supplier_accounts_owner_type_idx on hotel_supplier_accounts (owner_type);

create table hotel_supplier_credentials (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references hotel_supplier_accounts(id) on delete cascade,
  agency_id uuid not null references agencies(id) on delete restrict,
  ciphertext text not null,
  key_version integer not null,
  updated_by_user_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index hotel_supplier_credentials_account_uniq on hotel_supplier_credentials (account_id);
create index hotel_supplier_credentials_agency_idx on hotel_supplier_credentials (agency_id);

create table hotel_supplier_authorizations (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references hotel_supplier_accounts(id) on delete cascade,
  authorized_agency_id uuid not null references agencies(id) on delete cascade,
  authorized_by_user_id uuid,
  created_at timestamptz not null default now()
);
create unique index hotel_supplier_authorizations_account_agency_uniq on hotel_supplier_authorizations (account_id, authorized_agency_id);
create index hotel_supplier_authorizations_agency_idx on hotel_supplier_authorizations (authorized_agency_id);

-- Fonctions SECURITY DEFINER dédiées (même pattern que resolve_session_context,
-- 0012_rls_session_context.sql) : `hotel_supplier_accounts` et
-- `hotel_supplier_authorizations` se référencent mutuellement dans leurs
-- policies SELECT respectives (le compte vérifie s'il existe une autorisation
-- pour l'agence courante ; l'autorisation vérifie si l'agence courante possède
-- le compte). Deux EXISTS RLS-protégés qui se référencent l'un l'autre créent
-- une récursion infinie ("infinite recursion detected in policy") dès la
-- première évaluation. Ces fonctions contournent volontairement la RLS
-- (SECURITY DEFINER, propriétaire superuser) pour ne faire QUE le calcul
-- booléen nécessaire, sans jamais exposer de ligne complète.
create or replace function is_authorized_for_hotel_supplier_account(p_account_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from hotel_supplier_authorizations
    where account_id = p_account_id
      and authorized_agency_id = current_agency_id()
  );
$$;

create or replace function owns_hotel_supplier_account(p_account_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from hotel_supplier_accounts
    where id = p_account_id
      and agency_id = current_agency_id()
  );
$$;

alter table hotel_suppliers enable row level security;
alter table hotel_suppliers force row level security;
alter table hotel_supplier_accounts enable row level security;
alter table hotel_supplier_accounts force row level security;
alter table hotel_supplier_credentials enable row level security;
alter table hotel_supplier_credentials force row level security;
alter table hotel_supplier_authorizations enable row level security;
alter table hotel_supplier_authorizations force row level security;

-- hotel_suppliers : catalogue plateforme (aucun secret) — lisible par tout
-- contexte tenant authentifié réel, écriture réservée au Master Admin.
-- Même raisonnement que la policy existante sur `suppliers`
-- (0013_suppliers_policy_fix.sql) : une ressource plateforme sans agency_id
-- n'a pas de sens à restreindre par agence, seulement par "session réelle".
create policy "hotel_suppliers_select" on hotel_suppliers
  for select using (current_setting('app.current_user_id', true) is not null and current_setting('app.current_user_id', true) <> '');

create policy "hotel_suppliers_admin_write" on hotel_suppliers
  for all using (is_super_admin())
  with check (is_super_admin());

-- hotel_supplier_accounts : lecture = comptes de sa propre agence, OU
-- comptes MASTER explicitement autorisés pour sa propre agence, OU
-- super_admin (tout). Écriture = uniquement ses propres comptes (jamais un
-- compte autorisé-partagé, jamais un compte d'une autre agence).
create policy "hotel_supplier_accounts_select" on hotel_supplier_accounts
  for select using (
    agency_id = current_agency_id()
    or is_super_admin()
    or is_authorized_for_hotel_supplier_account(id)
  );

create policy "hotel_supplier_accounts_write" on hotel_supplier_accounts
  for all using (agency_id = current_agency_id() or is_super_admin())
  with check (agency_id = current_agency_id() or is_super_admin());

-- hotel_supplier_credentials : JAMAIS de bypass par autorisation partagée —
-- une agence autorisée à UTILISER un compte MASTER ne peut jamais lire ses
-- identifiants, même chiffrés. Seule l'agence propriétaire (ou super_admin)
-- a accès à cette table ; le resolver applicatif lit les identifiants d'un
-- compte MASTER partagé via un contexte serveur privilégié
-- (withSystemContext), jamais via le contexte tenant de l'agence autorisée.
create policy "hotel_supplier_credentials_select" on hotel_supplier_credentials
  for select using (agency_id = current_agency_id() or is_super_admin());

create policy "hotel_supplier_credentials_write" on hotel_supplier_credentials
  for all using (agency_id = current_agency_id() or is_super_admin())
  with check (agency_id = current_agency_id() or is_super_admin());

-- hotel_supplier_authorizations : une agence voit ses propres autorisations
-- reçues ; le propriétaire du compte (généralement master/super_admin) voit
-- qui est autorisé ; seul super_admin peut créer/révoquer.
create policy "hotel_supplier_authorizations_select" on hotel_supplier_authorizations
  for select using (
    is_super_admin()
    or authorized_agency_id = current_agency_id()
    or owns_hotel_supplier_account(account_id)
  );

create policy "hotel_supplier_authorizations_admin_write" on hotel_supplier_authorizations
  for all using (is_super_admin())
  with check (is_super_admin());

-- Note sécurité (Supabase security advisor) : `is_authorized_for_hotel_supplier_account`
-- et `owns_hotel_supplier_account` sont rapportées "exécutables par anon/authenticated
-- via /rest/v1/rpc/*" (comme TOUTE fonction SECURITY DEFINER du schéma public,
-- Postgres accorde EXECUTE à PUBLIC par défaut). Un `revoke ... from anon,
-- authenticated` a été tenté puis abandonné : ces 2 fonctions sont appelées
-- DANS les expressions RLS de `hotel_supplier_accounts`/`hotel_supplier_authorizations`
-- — leur retirer EXECUTE ferait échouer (erreur, pas juste 0 ligne) toute
-- évaluation RLS de ces tables pour anon/authenticated, exactement comme
-- `current_agency_id()`/`is_super_admin()` (0001_rls_policies.sql) doivent
-- eux aussi rester PUBLIC-exécutables pour la même raison. Le WARN est donc
-- accepté, cohérent avec ce pattern déjà établi (voir aussi
-- resolve_session_context/lock_agency_for_debit/set_agency_deposit_balance,
-- même WARN pré-existant) — sans impact car ces fonctions ne renvoient qu'un
-- booléen dérivé du GUC `app.current_agency_id`, jamais positionné pour une
-- session anon/authenticated PostgREST (donc toujours `false` si appelées
-- ainsi hors contexte applicatif).
