-- Chantier "Mutuelle" — étape 2 : canal B2B2C réel (sans déclencher la
-- réservation). Voir drizzle/manual/0062_mutuelle_requests.sql pour le
-- cycle demande→validation (déjà en place).
--
-- Portée : le directeur sélectionne, PARMI le catalogue réel de l'agence
-- d'exécution du groupe (catalog_packages / catalog_activities /
-- omra_packages — les 3 seuls modules réellement "catalogue" de ce projet ;
-- Hôtels Tunisie/Monde et Vols sont de l'inventaire LIVE fournisseur, sans
-- liste de produits fixe à whitelister), les produits visibles par les
-- membres de son groupe. Aucune réservation, aucun markup appliqué à un
-- prix réel ici — chantiers suivants explicites (Markup Mutuelle → Devis →
-- Transmission → Booking → Facturation).
--
-- RLS : réutilise `current_mutuelle_group_id()` (posé par 0058), même
-- garde qu'ailleurs dans ce chantier — la distinction membre/directeur
-- reste vérifiée côté Server Action (lib/mutuelle/catalog-actions.ts),
-- jamais uniquement par RLS (voir 0061 : rôle DB réel = postgres,
-- BYPASSRLS).
--
-- Application : psql "$DATABASE_DIRECT_URL" -f drizzle/manual/0063_mutuelle_catalog.sql

begin;

create type mutuelle_catalog_product_type as enum ('package', 'activity', 'omra');

create table if not exists mutuelle_catalog_items (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references mutuelle_groups(id) on delete restrict,
  product_type mutuelle_catalog_product_type not null,
  -- Pas de FK typée : product_id pointe vers catalog_packages.id,
  -- catalog_activities.id ou omra_packages.id selon product_type (même
  -- polymorphisme déjà assumé par products.attributes JSONB) — validé côté
  -- Server Action (le produit doit appartenir à l'agence d'exécution du
  -- groupe ET être status='published'/'b2c' ou 'b2b' avant d'être
  -- autorisable), jamais côté DB.
  product_id uuid not null,
  added_by_user_id uuid not null references users(id),
  created_at timestamptz not null default now(),
  constraint mutuelle_catalog_items_uniq unique (group_id, product_type, product_id)
);

create index if not exists mutuelle_catalog_items_group_idx on mutuelle_catalog_items(group_id);
create index if not exists mutuelle_catalog_items_product_idx on mutuelle_catalog_items(product_type, product_id);

alter table mutuelle_catalog_items enable row level security;
alter table mutuelle_catalog_items force row level security;

create policy "mutuelle_catalog_items_group_read" on mutuelle_catalog_items
  for select using (group_id = current_mutuelle_group_id() or is_super_admin());

create policy "mutuelle_catalog_items_group_write" on mutuelle_catalog_items
  for all using (group_id = current_mutuelle_group_id() or is_super_admin())
  with check (group_id = current_mutuelle_group_id() or is_super_admin());

commit;
