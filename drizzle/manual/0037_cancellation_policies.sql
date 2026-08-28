-- PHASE "POLICY ENGINE OMRA/PACKAGE/ACTIVITY" — moteur central de
-- politiques d'annulation/modification, UNIQUEMENT pour Omra/Package/
-- Activity (jamais Hôtel : cancellationPolicies fournisseur myGo, déjà
-- normalisées par le Universal Hub, restent la seule autorité).
--
-- Versionnée, jamais écrasée : "modifier" = INSERT d'une nouvelle ligne
-- (version+1, isActive=true), en désactivant l'ancienne — l'historique
-- complet reste interrogeable, jamais supprimé. Résolution (lib/booking/
-- policy-engine.ts) : produit/offre spécifique (product_id non nul) >
-- politique par défaut de l'agence pour ce product_type (product_id nul)
-- > aucune politique (jamais un défaut inventé).
--
-- RLS : même pattern générique que le reste du dépôt
-- (agency_id = current_agency_id() OR is_super_admin(), voir
-- 0001_rls_policies.sql) — le Master Admin (assertProductManager(),
-- lib/admin/product-guard.ts) écrit toujours dans SA PROPRE agence OTA ;
-- le guest checkout B2C (guestTenantContext(), isSuperAdmin: true) lit au
-- même titre que pour customers/reservations.

create table cancellation_policies (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid not null references agencies(id) on delete cascade,
  product_type authorized_product_type not null,
  -- null = politique par défaut pour tout ce product_type chez cette
  -- agence. Sinon : id du produit précis (catalog_packages.id /
  -- omra_packages.id / catalog_activities.id — pas de FK Postgres
  -- cross-table, même choix déjà fait par product_authorizations).
  product_id uuid,
  version integer not null default 1,
  is_active boolean not null default true,
  cancellable boolean not null,
  modifiable boolean not null,
  -- Heures avant le début du service au-delà desquelles la politique ne
  -- s'applique plus telle quelle. null = aucune échéance configurée.
  deadline_hours integer,
  -- 0-100. null = aucun frais configuré (distinct de 0 explicite).
  cancellation_fee_percent numeric(5, 2),
  refund_allowed boolean not null,
  credit_allowed boolean not null,
  non_refundable boolean not null default false,
  requires_validated_document boolean not null default false,
  -- Texte libre décrivant les conditions après l'échéance — jamais un
  -- calcul automatique inventé.
  post_deadline_description text,
  effective_from timestamptz not null default now(),
  created_by_user_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index cancellation_policies_lookup_idx
  on cancellation_policies (agency_id, product_type, product_id, is_active);
create index cancellation_policies_agency_idx
  on cancellation_policies (agency_id);

alter table cancellation_policies enable row level security;

create policy "cancellation_policies_tenant_isolation" on cancellation_policies
  for all
  using (agency_id = current_agency_id() or is_super_admin())
  with check (agency_id = current_agency_id() or is_super_admin());
