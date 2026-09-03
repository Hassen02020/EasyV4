-- Favoris (Wishlist) — module explicitement demandé par la mission de
-- complétion produit, jusqu'ici un simple `useState` cosmétique côté client
-- (`isWishlisted` dans components/hotel-card.tsx) sans aucune persistance :
-- le favori disparaissait au rechargement de la page.
--
-- Rattaché à `auth_user_id` (Supabase), JAMAIS à `customers.id` : contrairement
-- à Loyalty (loyalty_accounts, dont le compte n'existe qu'après une première
-- réservation), un visiteur connecté doit pouvoir mettre un hôtel en favori
-- AVANT toute réservation — donc avant qu'une ligne `customers` existe pour
-- lui. Voir lib/booking/customer-identity.ts pour la distinction.
--
-- `item_ref` est toujours du texte : uuid du produit catalogue local
-- (omra/package/activity) ou identifiant myGo (hôtel, qui n'a aucune fiche
-- catalogue locale — voir app/hotels/[id]/page.tsx). Les colonnes
-- title/image_url/location/price_from/href sont un INSTANTANÉ capturé à
-- l'ajout, pour afficher "Mes favoris" sans redépendre d'un appel
-- fournisseur live — jamais réutilisées comme prix/disponibilité réels au
-- moment de la réservation (revérifiés comme toute réservation normale).

create table customer_favorites (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid not null references agencies(id) on delete cascade,
  auth_user_id uuid not null,
  item_type varchar(16) not null,
  item_ref varchar(128) not null,
  title varchar(255) not null,
  image_url text,
  location varchar(255),
  price_from decimal(12, 2),
  currency varchar(3),
  href varchar(255) not null,
  created_at timestamptz not null default now(),
  constraint customer_favorites_item_type_check
    check (item_type in ('hotel', 'omra', 'package', 'activity'))
);

-- Idempotence de toggleFavorite() : un double-clic / retry réseau sur le
-- même item ne crée jamais de doublon (voir lib/favorites/favorites-core.ts).
create unique index customer_favorites_uniq
  on customer_favorites (agency_id, auth_user_id, item_type, item_ref);
create index customer_favorites_user_idx on customer_favorites (auth_user_id, created_at);
create index customer_favorites_agency_idx on customer_favorites (agency_id);

alter table customer_favorites enable row level security;
alter table customer_favorites force row level security;

-- Même discipline que loyalty_accounts/loyalty_ledger (0039) : RLS
-- n'applique QUE l'isolation tenant (agency_id) — le connecteur applicatif
-- (postgres-js direct, pas PostgREST) n'a pas de GUC fiable portant
-- l'auth_user_id du client B2C courant (guestTenantContext() pose
-- `is_super_admin = true` pour les actions guest, voir lib/db/tenant-context.ts
-- et lib/hotel-suppliers/tenant/live-resolution.ts). L'appartenance
-- par utilisateur (auth_user_id = session Supabase courante, jamais un id
-- fourni par le client) est donc appliquée par le Server Action appelant
-- (lib/favorites/favorites-core.ts), même pattern que `ownedByCurrentCustomer`
-- pour les réservations.
create policy "customer_favorites_tenant_isolation" on customer_favorites
  for all
  using (agency_id = current_agency_id() or is_super_admin())
  with check (agency_id = current_agency_id() or is_super_admin());
