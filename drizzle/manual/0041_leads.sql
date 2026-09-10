-- CRM / Leads — capture des demandes de contact ("Être rappelé" / "Demander
-- un devis") déposées par un visiteur AVANT toute réservation. Distincte de
-- `customers` (créée seulement au moment d'une réservation réelle) et de
-- lib/crm/provider.ts (pousse une réservation CONFIRMÉE vers un CRM externe,
-- jamais branché faute de système choisi pour ce projet). Tant qu'aucun CRM
-- externe n'est configuré, cette table EST le CRM.
--
-- Aucune UI de capture n'existait auparavant nulle part sur le site (audit :
-- seuls des liens tel:/WhatsApp existaient sur les pages produit) — ce n'est
-- donc pas la réparation d'un gap, mais la construction d'un module demandé
-- explicitement par le mandat produit.

create table leads (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid not null references agencies(id) on delete cascade,
  first_name varchar(100) not null,
  last_name varchar(100),
  email varchar(320),
  phone varchar(32),
  message text,
  product_type varchar(16) not null default 'general',
  product_ref varchar(128),
  product_label varchar(255),
  source_page varchar(255) not null,
  status varchar(16) not null default 'new',
  staff_notes text,
  handled_by_user_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint leads_product_type_check
    check (product_type in ('hotel', 'omra', 'package', 'activity', 'general')),
  constraint leads_status_check
    check (status in ('new', 'contacted', 'converted', 'closed')),
  -- Un moyen de recontact réel est requis — jamais un lead injoignable.
  constraint leads_contact_required check (email is not null or phone is not null)
);

create index leads_agency_status_idx on leads (agency_id, status, created_at);
create index leads_agency_idx on leads (agency_id);

alter table leads enable row level security;
alter table leads force row level security;

-- Même discipline que customer_favorites (0040)/loyalty_accounts (0039) :
-- RLS n'applique QUE l'isolation tenant — la soumission publique passe par
-- guestTenantContext() (is_super_admin=true), la lecture/gestion staff par
-- assertSupportStaff() + withTenantContext (voir lib/admin/leads-actions.ts).
create policy "leads_tenant_isolation" on leads
  for all
  using (agency_id = current_agency_id() or is_super_admin())
  with check (agency_id = current_agency_id() or is_super_admin());
