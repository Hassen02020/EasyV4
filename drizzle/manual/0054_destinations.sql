-- PHASE PREMIUM 2 — Chantier 2 : Canonical Destination Model.
--
-- Contexte (docs/audits/destination-model-audit.md, chantier 1) : aucune
-- table géographique partagée n'existait — 4 systèmes d'identifiants
-- distincts et non réconciliés (cityId myGo, slug Hôtels Monde, slug
-- Packages, code IATA). Ce chantier pose la fondation additive : deux
-- tables, aucune modification d'une table existante, aucun module de
-- recherche rebranché dessus ici (chantier 3).
--
-- destinations : hiérarchie réelle Pays -> Ville (2 niveaux, calquée sur la
-- vraie structure fournisseur myGo Country{Id,Name} -> City{Id,Name,Region}).
-- Table plateforme (pas de agency_id) — référentiel géo partagé par toute la
-- plateforme, pas une donnée par agence.
--
-- destination_external_refs : correspondance vers les ID déjà utilisés par
-- chaque module (myGo cityId, slug Hôtels Monde/Packages, code IATA) — les
-- modules continuent de parler leur propre langage, cette table fait le pont.
--
-- RLS : même raisonnement que hotel_suppliers
-- (0035_hotel_supplier_control_plane.sql) — catalogue plateforme sans secret,
-- lisible par toute session réelle authentifiée, écriture réservée au Master
-- Admin. Les pages publiques anonymes (recherche/autocomplete) lisent via
-- withSystemContext(), comme le reste du catalogue public
-- (catalog_packages, catalog_activities).
--
-- Application : psql "$DATABASE_DIRECT_URL" -f drizzle/manual/0054_destinations.sql

begin;

create type destination_type as enum ('country', 'city');

create table destinations (
  id uuid primary key default gen_random_uuid(),
  type destination_type not null,
  -- Null pour un pays ; obligatoire pour une ville (voir check ci-dessous).
  parent_id uuid references destinations(id) on delete restrict,
  -- URL-friendly, unique — sert aux futures pages /destinations/[slug] (chantier 4).
  slug varchar(64) not null,
  name varchar(120) not null,
  name_en varchar(120),
  name_ar varchar(120),
  -- ISO 3166-1 alpha-2, renseigné uniquement sur les lignes type='country'.
  country_code varchar(2),
  -- Texte libre côté ville (ex. "Cap Bon") — métadonnée, pas un niveau de hiérarchie.
  region varchar(100),
  latitude numeric(9, 6),
  longitude numeric(9, 6),
  cover_media_url text,
  seo_description text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint destinations_city_has_parent_check check (
    (type = 'country' and parent_id is null) or
    (type = 'city' and parent_id is not null)
  )
);

create unique index destinations_slug_uniq on destinations (slug);
create index destinations_parent_idx on destinations (parent_id);
create index destinations_type_active_idx on destinations (type, is_active);
create unique index destinations_country_code_uniq on destinations (country_code) where type = 'country';

create table destination_external_refs (
  id uuid primary key default gen_random_uuid(),
  destination_id uuid not null references destinations(id) on delete cascade,
  -- 'mygo_city' | 'hotels_monde_slug' | 'packages_slug' | 'iata' — varchar+check
  -- plutôt qu'un enum natif : cette liste de sources va grandir (transferts,
  -- nouveaux fournisseurs), un varchar+check s'étend par une migration simple.
  module varchar(32) not null,
  external_id varchar(64) not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint destination_external_refs_module_check check (
    module in ('mygo_city', 'hotels_monde_slug', 'packages_slug', 'iata')
  )
);

create unique index destination_external_refs_module_external_uniq on destination_external_refs (module, external_id);
create index destination_external_refs_destination_idx on destination_external_refs (destination_id);
create index destination_external_refs_module_idx on destination_external_refs (module, is_active);

alter table destinations enable row level security;
alter table destinations force row level security;
alter table destination_external_refs enable row level security;
alter table destination_external_refs force row level security;

-- destinations : catalogue plateforme (aucun secret) — lisible par toute
-- session réelle authentifiée, écriture réservée au Master Admin. Même
-- policy que hotel_suppliers_select (0035).
create policy "destinations_select" on destinations
  for select using (current_setting('app.current_user_id', true) is not null and current_setting('app.current_user_id', true) <> '');

create policy "destinations_admin_write" on destinations
  for all using (is_super_admin())
  with check (is_super_admin());

create policy "destination_external_refs_select" on destination_external_refs
  for select using (current_setting('app.current_user_id', true) is not null and current_setting('app.current_user_id', true) <> '');

create policy "destination_external_refs_admin_write" on destination_external_refs
  for all using (is_super_admin())
  with check (is_super_admin());

commit;
