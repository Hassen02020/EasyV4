-- Chantier "Mutuelle" — fondation du cycle demande→validation (voir
-- drizzle/manual/0058_mutuelle_groups.sql pour l'identité du groupe, déjà en
-- place). Périmètre volontairement minimal, conforme à l'analyse validée
-- avant implémentation :
--   - un membre soumet une demande libre (module + description + dates +
--     pax) — AUCUN catalogue restreint n'existe encore, donc pas de
--     product_ref structuré ici, uniquement du texte ;
--   - un directeur du MÊME groupe valide/refuse ;
--   - AUCUNE application de markup, AUCUNE transmission automatique vers une
--     réservation réelle, AUCUNE facturation — chantiers suivants explicites,
--     volontairement hors de ce fichier.
--
-- RLS : réutilise le mécanisme déjà posé par 0058 (`current_mutuelle_group_id()`,
-- GUC `app.current_mutuelle_group_id` positionné par
-- lib/db/tenant-context.ts::withTenantContext()) — jamais une seconde
-- implémentation. Comme documenté dans 0061, la connexion applicative réelle
-- (rôle `postgres`, BYPASSRLS) rend RLS actuellement inerte en production ;
-- ces policies sont posées par cohérence avec le reste du schéma et pour le
-- jour où la bascule vers `app_runtime` sera faite — l'autorisation réelle
-- aujourd'hui est appliquée côté Server Action (lib/mutuelle/requests-actions.ts),
-- jamais uniquement côté RLS.
--
-- Application : psql "$DATABASE_DIRECT_URL" -f drizzle/manual/0062_mutuelle_requests.sql

begin;

create type mutuelle_request_status as enum ('pending', 'approved', 'rejected');

create table if not exists mutuelle_requests (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references mutuelle_groups(id) on delete restrict,
  member_user_id uuid not null references users(id) on delete restrict,
  -- Réutilise l'enum existant reservation_module (hotel/flight/package/...)
  -- plutôt qu'un second enum dupliqué — aucun catalogue restreint n'existe
  -- encore, donc ce module reste une indication libre du besoin, pas un lien
  -- vers un vrai produit.
  module reservation_module not null,
  description text not null,
  travel_start_date date not null,
  travel_end_date date not null,
  pax_count integer not null default 1,
  status mutuelle_request_status not null default 'pending',
  director_note text,
  reviewed_by_user_id uuid references users(id),
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint mutuelle_requests_dates_check check (travel_end_date >= travel_start_date),
  constraint mutuelle_requests_pax_check check (pax_count >= 1)
);

create index if not exists mutuelle_requests_group_idx on mutuelle_requests(group_id);
create index if not exists mutuelle_requests_member_idx on mutuelle_requests(member_user_id);
create index if not exists mutuelle_requests_status_idx on mutuelle_requests(status);

alter table mutuelle_requests enable row level security;
alter table mutuelle_requests force row level security;

-- Lecture partagée par tout le groupe (membre voit les demandes de son
-- groupe, directeur a besoin de voir celles de TOUS les membres pour les
-- valider — même granularité que mutuelle_groups_self_read, pas une
-- distinction par rôle que RLS ne peut pas vérifier ici, voir doc de tête).
create policy "mutuelle_requests_group_read" on mutuelle_requests
  for select using (group_id = current_mutuelle_group_id() or is_super_admin());

-- Un membre ne peut créer une demande que pour lui-même, dans son propre
-- groupe — jamais un member_user_id ou group_id arbitraire.
create policy "mutuelle_requests_member_insert" on mutuelle_requests
  for insert with check (
    group_id = current_mutuelle_group_id()
    and member_user_id = current_user_id()
  );

-- Mise à jour (validation/refus par le directeur) restreinte au même groupe
-- — la distinction directeur/membre reste appliquée côté Server Action
-- (reviewMutuelleRequest), RLS ne fait ici que confirmer l'appartenance au
-- groupe, défense en profondeur.
create policy "mutuelle_requests_group_update" on mutuelle_requests
  for update using (group_id = current_mutuelle_group_id() or is_super_admin())
  with check (group_id = current_mutuelle_group_id() or is_super_admin());

commit;
