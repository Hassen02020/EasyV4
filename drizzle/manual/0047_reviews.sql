-- Avis clients / notation — Gap #4 de l'audit senior OTA ("Absence totale
-- d'avis clients"). Un avis n'existe QUE rattaché à une réservation réelle
-- (jamais un formulaire libre) : contrainte unique sur reservation_id (un
-- avis par séjour/expérience réellement vécu, jamais par simple compte),
-- vérification d'appartenance faite côté action (voir
-- lib/reviews/reviews-core.ts) avant l'insert.
--
-- Modération avant publication (status 'pending' par défaut) : un avis non
-- approuvé n'est JAMAIS lisible publiquement — seule la lecture "system
-- context + status='approved'" (même pattern que les pages produit
-- publiques existantes) expose des avis, jamais RLS seul qui ne gère que
-- l'isolation tenant, pas le niveau de visibilité.
--
-- Portée : hotel/omra/package/activity seulement — transfert exclu, aucune
-- page produit "fiche unique" n'existe pour ce module (zones/trajets, pas
-- un catalogue à noter).
--
-- Application : psql "$DATABASE_DIRECT_URL" -f drizzle/manual/0047_reviews.sql

begin;

create table reviews (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid not null references agencies(id) on delete cascade,
  reservation_id uuid not null references reservations(id) on delete cascade,
  customer_id uuid not null references customers(id) on delete cascade,
  module varchar(16) not null,
  -- uuid catalogue (package/activity/omra) ou id myGo texte (hôtel) — même
  -- raisonnement que customer_favorites.item_ref : jamais de FK stricte,
  -- un seul champ texte couvre les deux formats d'identifiant source.
  product_ref varchar(128) not null,
  rating integer not null,
  comment text,
  status varchar(16) not null default 'pending',
  moderated_by_user_id uuid,
  moderated_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint reviews_module_check check (module in ('hotel', 'omra', 'package', 'activity')),
  constraint reviews_rating_check check (rating between 1 and 5),
  constraint reviews_status_check check (status in ('pending', 'approved', 'rejected'))
);

create unique index reviews_reservation_id_uniq on reviews (reservation_id);
create index reviews_product_idx on reviews (agency_id, module, product_ref, status);
create index reviews_agency_status_idx on reviews (agency_id, status, created_at);

alter table reviews enable row level security;
alter table reviews force row level security;

create policy "reviews_tenant_isolation" on reviews
  for all
  using (agency_id = current_agency_id() or is_super_admin())
  with check (agency_id = current_agency_id() or is_super_admin());

commit;
