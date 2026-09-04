-- CRM / Leads — Scoring (étape 2/3 du plan CRM demandé : Conversion → Scoring
-- → Relance, voir 0043 pour l'étape 1).
--
-- Score TRANSPARENT et CONFIGURABLE, comme demandé explicitement — jamais un
-- modèle opaque : 4 signaux FIXES, objectivement observables sur un lead
-- (jamais un critère métier inventé type "budget probable" ou "urgence"),
-- chacun valant un nombre de points configurable par le staff OTA (défaut :
-- 25 points chacun, poids neutre égal, éditable immédiatement — même
-- principe que DEFAULT_MARGINS, lib/pro/pricing.ts).
--
-- Une seule ligne par (agency_id, signal) — même pattern d'unicité que
-- pricing_margins (agency_id, module).
--
-- Application : psql "$DATABASE_DIRECT_URL" -f drizzle/manual/0044_lead_scoring.sql

begin;

create table lead_scoring_rules (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid not null references agencies(id) on delete cascade,
  signal varchar(32) not null,
  points integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint lead_scoring_rules_signal_check
    check (signal in ('contact_complete', 'has_message', 'specific_product', 'has_product_ref')),
  constraint lead_scoring_rules_points_check check (points >= 0 and points <= 1000)
);

create unique index lead_scoring_rules_agency_signal_uniq on lead_scoring_rules (agency_id, signal);
create index lead_scoring_rules_agency_idx on lead_scoring_rules (agency_id);

alter table lead_scoring_rules enable row level security;
alter table lead_scoring_rules force row level security;

-- Même discipline que pricing_margins (0005) / leads (0041) : isolation
-- tenant uniquement, aucune policy anon distincte (pas de lecture publique).
create policy "lead_scoring_rules_tenant_isolation" on lead_scoring_rules
  for all
  using (agency_id = current_agency_id() or is_super_admin())
  with check (agency_id = current_agency_id() or is_super_admin());

commit;
