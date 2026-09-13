-- Media System (Mission Media) — table unique de métadonnées médias pour
-- les produits Omraty / Voyages Organisés / Attractions.
--
-- Le fichier binaire n'est JAMAIS stocké ici (mission §3) : seule la
-- référence Storage (storage_key + variants) l'est. `module` + `product_id`
-- est une référence POLYMORPHIQUE volontairement sans FK stricte — comme
-- customer_favorites.item_type/item_ref (0040) — car omra_packages /
-- catalog_packages / catalog_activities n'ont aucun parent commun.
-- Hôtels/Vols sont hors périmètre (mission §1) : pas de valeur 'hotel' /
-- 'flight' dans la contrainte CHECK pour l'instant — l'ajouter sera un
-- ALTER TABLE ... DROP/ADD CONSTRAINT trivial le jour où ces modules
-- rejoindront le Media System, pas une réécriture.

create table product_media (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid not null references agencies(id) on delete cascade,
  module varchar(16) not null,
  product_id uuid not null,
  storage_key text not null,
  variants jsonb not null,
  original_filename varchar(255) not null,
  mime_type varchar(64) not null,
  file_size integer not null,
  width integer,
  height integer,
  alt_text varchar(255),
  caption text,
  sort_order integer not null default 0,
  is_cover boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint product_media_module_check
    check (module in ('omra', 'package', 'activity'))
);

create index product_media_agency_idx
  on product_media (agency_id);

-- Galerie d'un produit dans l'ordre d'affichage — requête la plus fréquente
-- (fetch galerie complète pour une page produit ou le Media Manager admin).
create index product_media_product_idx
  on product_media (module, product_id, sort_order);

-- Une seule couverture par produit (mission §17). Index unique PARTIEL :
-- ne contraint que les lignes is_cover = true, donc n'empêche pas d'avoir
-- plusieurs images non-couverture pour le même produit.
create unique index product_media_one_cover_uniq
  on product_media (module, product_id)
  where (is_cover = true);

alter table product_media enable row level security;
alter table product_media force row level security;

-- Même discipline que customer_favorites (0040) / loyalty_accounts (0039) :
-- isolation tenant appliquée via agency_id = current_agency_id(), défini
-- dans 0001_rls_policies.sql.
create policy "product_media_tenant_isolation" on product_media
  for all
  using (agency_id = current_agency_id() or is_super_admin())
  with check (agency_id = current_agency_id() or is_super_admin());
