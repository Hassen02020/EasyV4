-- Chantier "Mutuelle" (fondation données) — voir
-- docs/audits/architecture-vision-audit.md et le message architecture fourni
-- par l'utilisateur : une Mutuelle est un distributeur privé B2B2C, PAS une
-- agence — elle négocie une convention (markup, catalogue autorisé) avec
-- Easy2Book, ses membres soumettent des demandes que le directeur valide,
-- puis la demande validée est transmise à une agence d'exécution réelle qui
-- gère la réservation. Ce fichier pose uniquement l'identité du groupe et le
-- modèle de rôle réel (directeur/membre) — le rôle DB 'mutuelle' unique
-- utilisé jusqu'ici par app/actions/validate-role.ts n'existait dans AUCUNE
-- migration (confirmé par grep sur ce dépôt) : /mutuelle était donc
-- inatteignable pour tout compte réel. Catalogue autorisé, application du
-- markup et workflow de validation sont des chantiers suivants.
--
-- Application : psql "$DATABASE_DIRECT_URL" -f drizzle/manual/0058_mutuelle_groups.sql

begin;

-- Nouvelles valeurs de rôle — additif, ne modifie aucune ligne existante.
-- ADD VALUE ne peut pas être utilisée dans la même transaction qu'une
-- commande qui référence la nouvelle valeur ; ce fichier ne fait rien de tel.
alter type user_role add value if not exists 'mutuelle_director';
alter type user_role add value if not exists 'mutuelle_member';

create table if not exists mutuelle_groups (
  id uuid primary key default gen_random_uuid(),
  slug varchar(64) not null,
  name varchar(200) not null,
  execution_agency_id uuid not null references agencies(id) on delete restrict,
  markup_percent numeric(5,2) not null default 0,
  convention_start_date date,
  convention_end_date date,
  contact_email varchar(320),
  contact_phone varchar(32),
  status varchar(16) not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists mutuelle_groups_slug_uniq on mutuelle_groups(slug);
create index if not exists mutuelle_groups_execution_agency_idx on mutuelle_groups(execution_agency_id);

alter table users add column if not exists mutuelle_group_id uuid references mutuelle_groups(id) on delete restrict;
create index if not exists users_mutuelle_group_idx on users(mutuelle_group_id);

-- resolve_session_context() : ajoute mutuelle_group_id (même pattern que
-- 0014_resolve_session_context_profile_fields.sql — DROP+CREATE requis,
-- Postgres n'autorise pas CREATE OR REPLACE sur un changement de colonnes de
-- retour TABLE()). Nécessaire pour que lib/db/tenant-context.ts puisse poser
-- le GUC app.current_mutuelle_group_id sans lecture RLS préalable (même
-- poule-et-œuf que agency_id/role).
drop function if exists resolve_session_context(uuid);

create function resolve_session_context(p_user_id uuid)
returns table(agency_id uuid, role text, status text, email text, name text, agency_type text, mutuelle_group_id uuid)
language sql
security definer
stable
set search_path = public
as $$
  select u.agency_id, u.role::text, u.status::text, u.email, u.name, a.agency_type::text, u.mutuelle_group_id
  from users u
  join agencies a on a.id = u.agency_id
  where u.id = p_user_id
$$;

revoke all on function resolve_session_context(uuid) from public;
grant execute on function resolve_session_context(uuid) to authenticated, service_role, app_runtime;

-- RLS : un directeur/membre ne voit QUE son propre groupe — jamais via
-- current_agency_id() (qui reste réservé au scoping agence classique), un
-- nouveau GUC dédié app.current_mutuelle_group_id, posé par
-- lib/db/tenant-context.ts::withTenantContext(), évite toute confusion avec
-- le scoping agence.
alter table mutuelle_groups enable row level security;
alter table mutuelle_groups force row level security;

create or replace function current_mutuelle_group_id()
returns uuid
language sql
stable
as $$
  select nullif(current_setting('app.current_mutuelle_group_id', true), '')::uuid
$$;

create policy "mutuelle_groups_admin_write" on mutuelle_groups
  for all using (is_super_admin())
  with check (is_super_admin());

create policy "mutuelle_groups_self_read" on mutuelle_groups
  for select using (id = current_mutuelle_group_id() or is_super_admin());

commit;
