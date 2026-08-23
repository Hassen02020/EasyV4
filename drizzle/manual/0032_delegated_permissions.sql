-- Phase 22 — Modèle de permissions déléguées minimal, additif.
--
-- Ne remplace AUCUN rôle existant : `permission_grants` est une couche
-- d'AUTORISATION explicite au-dessus du baseline par rôle (lib/auth/rbac.ts
-- + lib/auth/permissions.ts) — présence d'une ligne = override explicite
-- (accordé ou révoqué) pour CE user précis, dans SON agence ; absence =
-- comportement baseline du rôle inchangé. `agencyId` reste la frontière
-- tenant (RLS identique au pattern générique déjà utilisé partout).
create table if not exists permission_grants (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid not null references agencies(id) on delete restrict,
  user_id uuid not null,
  permission text not null,
  granted boolean not null,
  granted_by_user_id uuid not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists permission_grants_user_permission_uniq
  on permission_grants (agency_id, user_id, permission);
create index if not exists permission_grants_agency_idx on permission_grants (agency_id);
create index if not exists permission_grants_user_idx on permission_grants (user_id);

alter table permission_grants enable row level security;
alter table permission_grants force row level security;

create policy "permission_grants_tenant_isolation" on permission_grants
  for all
  using (agency_id = current_agency_id() or is_super_admin())
  with check (agency_id = current_agency_id() or is_super_admin());

-- Élargit users_manager_insert/update/delete à `partner_owner`, scopé à sa
-- propre agence — condition NÉCESSAIRE mais pas SUFFISANTE : la couche
-- applicative (lib/auth/partner-agent-actions.ts) exige EN PLUS que ce
-- partner_owner détienne explicitement le grant `staff.edit`/`staff.create`
-- via permission_grants avant d'émettre la requête — "Partner Owner may
-- manage Partner Agents only if explicitly authorized". RLS fournit ici la
-- frontière tenant+rôle large (comme pour `manager`), pas la vérification
-- fine du grant — même séparation RLS/application que partout ailleurs
-- dans ce projet (ex. REFUND_ALLOWED_ROLES, MANUAL_PAYMENT_ALLOWED_ROLES).
drop policy if exists "users_manager_insert" on users;
drop policy if exists "users_manager_update" on users;
drop policy if exists "users_manager_delete" on users;

create policy "users_manager_insert" on users
  for insert with check (
    is_super_admin() or (
      agency_id = current_agency_id() and exists (
        select 1 from users me
        where me.id = current_user_id() and me.role in ('manager', 'super_admin', 'partner_owner')
      )
    )
  );

create policy "users_manager_update" on users
  for update using (
    is_super_admin() or (
      agency_id = current_agency_id() and exists (
        select 1 from users me
        where me.id = current_user_id() and me.role in ('manager', 'super_admin', 'partner_owner')
      )
    )
  )
  with check (
    is_super_admin() or (
      agency_id = current_agency_id() and exists (
        select 1 from users me
        where me.id = current_user_id() and me.role in ('manager', 'super_admin', 'partner_owner')
      )
    )
  );

create policy "users_manager_delete" on users
  for delete using (
    is_super_admin() or (
      agency_id = current_agency_id() and exists (
        select 1 from users me
        where me.id = current_user_id() and me.role in ('manager', 'super_admin', 'partner_owner')
      )
    )
  );
