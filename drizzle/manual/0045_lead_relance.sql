-- CRM / Leads — Relance (étape 3/3 du plan CRM : Conversion → Scoring →
-- Relance, voir 0043/0044 pour les étapes précédentes).
--
-- Portée délibérément limitée à l'ALERTE STAFF (un lead "new" resté sans
-- suivi plus de N jours devient visible/marqué dans /admin/support) — PAS
-- un envoi automatique (WhatsApp/email/SMS) vers le lead lui-même. Un envoi
-- automatique exigerait un contenu marketing précis et, pour WhatsApp, un
-- template pré-approuvé par Meta pour un contact hors fenêtre de service
-- client (voir .env.example, section WhatsApp) — décision produit/contenu
-- non tranchée, jamais inventée ici.
--
-- Une seule ligne de configuration par agence (délai + interrupteur
-- marche/arrêt, explicitement demandés par le mandat produit).
--
-- Application : psql "$DATABASE_DIRECT_URL" -f drizzle/manual/0045_lead_relance.sql

begin;

create table lead_relance_settings (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid not null references agencies(id) on delete cascade,
  threshold_days integer not null default 3,
  is_enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint lead_relance_settings_threshold_check check (threshold_days >= 1 and threshold_days <= 90)
);

create unique index lead_relance_settings_agency_uniq on lead_relance_settings (agency_id);

alter table lead_relance_settings enable row level security;
alter table lead_relance_settings force row level security;

create policy "lead_relance_settings_tenant_isolation" on lead_relance_settings
  for all
  using (agency_id = current_agency_id() or is_super_admin())
  with check (agency_id = current_agency_id() or is_super_admin());

commit;
