-- SEC-RLS-02 — Versionnement fidèle des policies RLS déjà appliquées en
-- production sur les 14 tables Flight Puzzle + fournisseurs.
--
-- AUCUN CHANGEMENT DE COMPORTEMENT : cette migration documente exactement
-- ce qui existe déjà en production (vérifié par lecture directe de
-- pg_policies/pg_class le 2026-09-29), pas une nouvelle politique d'accès.
-- Gap constaté : ces tables ont été créées par des migrations (0011-0013,
-- 0064-0065, 0075) qui ne posaient aucune policy RLS ; les policies
-- ci-dessous ont été ajoutées en production par une action DDL directe,
-- jamais tracée dans le dépôt. Cette migration comble uniquement ce trou
-- de traçabilité.
--
-- Écart de convention noté (non corrigé ici, hors scope de ce chantier) :
-- les autres tables tenant-scopées de ce projet (voir 0050_missing_rls_
-- hardening.sql) posent systématiquement `FORCE ROW LEVEL SECURITY` en plus
-- de `ENABLE`. Les 14 tables ci-dessous n'ont PAS ce FORCE en production
-- (vérifié) — reproduit fidèlement tel quel, candidat pour un futur
-- chantier de durcissement si jugé nécessaire.
--
-- Idempotence : chaque policy est recréée via DROP POLICY IF EXISTS +
-- CREATE POLICY (seul mécanisme idempotent pour les policies en
-- PostgreSQL — pas de "CREATE POLICY IF NOT EXISTS"). Si cette migration
-- est appliquée sur une base qui a déjà exactement ces policies (le cas de
-- la production actuelle), le résultat est strictement identique.

-- ── Tables avec agency_id propre — isolation directe ────────────────────────

alter table flight_searches enable row level security;
drop policy if exists "flight_searches_tenant_isolation" on flight_searches;
create policy "flight_searches_tenant_isolation" on flight_searches
  for all
  using (agency_id = current_agency_id() or is_super_admin())
  with check (agency_id = current_agency_id() or is_super_admin());

alter table flight_price_snapshots enable row level security;
drop policy if exists "flight_price_snapshots_tenant_isolation" on flight_price_snapshots;
create policy "flight_price_snapshots_tenant_isolation" on flight_price_snapshots
  for all
  using (agency_id = current_agency_id() or is_super_admin())
  with check (agency_id = current_agency_id() or is_super_admin());

alter table flight_bookings enable row level security;
drop policy if exists "flight_bookings_tenant_isolation" on flight_bookings;
create policy "flight_bookings_tenant_isolation" on flight_bookings
  for all
  using (agency_id = current_agency_id() or is_super_admin())
  with check (agency_id = current_agency_id() or is_super_admin());

alter table flight_commercial_rules enable row level security;
drop policy if exists "flight_commercial_rules_tenant_isolation" on flight_commercial_rules;
create policy "flight_commercial_rules_tenant_isolation" on flight_commercial_rules
  for all
  using (agency_id = current_agency_id() or is_super_admin())
  with check (agency_id = current_agency_id() or is_super_admin());

alter table flight_orders enable row level security;
drop policy if exists "flight_orders_tenant_isolation" on flight_orders;
create policy "flight_orders_tenant_isolation" on flight_orders
  for all
  using (agency_id = current_agency_id() or is_super_admin())
  with check (agency_id = current_agency_id() or is_super_admin());

alter table flight_supplier_configs enable row level security;
drop policy if exists "flight_supplier_configs_tenant_isolation" on flight_supplier_configs;
create policy "flight_supplier_configs_tenant_isolation" on flight_supplier_configs
  for all
  using (agency_id = current_agency_id() or is_super_admin())
  with check (agency_id = current_agency_id() or is_super_admin());

alter table flight_supplier_credentials enable row level security;
drop policy if exists "flight_supplier_credentials_tenant_isolation" on flight_supplier_credentials;
create policy "flight_supplier_credentials_tenant_isolation" on flight_supplier_credentials
  for all
  using (agency_id = current_agency_id() or is_super_admin())
  with check (agency_id = current_agency_id() or is_super_admin());

-- ── Tables filles sans agency_id — isolation indirecte via flight_bookings ──
-- Même schéma que reservation_financials (vérifié par comparaison directe) :
-- une ligne n'est visible/écrivable que si la réservation de vol parente
-- appartient à l'agence courante.

alter table flight_booking_passengers enable row level security;
drop policy if exists "flight_booking_passengers_tenant_isolation" on flight_booking_passengers;
create policy "flight_booking_passengers_tenant_isolation" on flight_booking_passengers
  for all
  using (
    is_super_admin() or exists (
      select 1 from flight_bookings fb
      where fb.id = flight_booking_passengers.booking_id
        and fb.agency_id = current_agency_id()
    )
  )
  with check (
    is_super_admin() or exists (
      select 1 from flight_bookings fb
      where fb.id = flight_booking_passengers.booking_id
        and fb.agency_id = current_agency_id()
    )
  );

alter table flight_booking_segments enable row level security;
drop policy if exists "flight_booking_segments_tenant_isolation" on flight_booking_segments;
create policy "flight_booking_segments_tenant_isolation" on flight_booking_segments
  for all
  using (
    is_super_admin() or exists (
      select 1 from flight_bookings fb
      where fb.id = flight_booking_segments.booking_id
        and fb.agency_id = current_agency_id()
    )
  )
  with check (
    is_super_admin() or exists (
      select 1 from flight_bookings fb
      where fb.id = flight_booking_segments.booking_id
        and fb.agency_id = current_agency_id()
    )
  );

alter table flight_tickets enable row level security;
drop policy if exists "flight_tickets_tenant_isolation" on flight_tickets;
create policy "flight_tickets_tenant_isolation" on flight_tickets
  for all
  using (
    is_super_admin() or exists (
      select 1 from flight_bookings fb
      where fb.id = flight_tickets.booking_id
        and fb.agency_id = current_agency_id()
    )
  )
  with check (
    is_super_admin() or exists (
      select 1 from flight_bookings fb
      where fb.id = flight_tickets.booking_id
        and fb.agency_id = current_agency_id()
    )
  );

alter table flight_ancillaries enable row level security;
drop policy if exists "flight_ancillaries_tenant_isolation" on flight_ancillaries;
create policy "flight_ancillaries_tenant_isolation" on flight_ancillaries
  for all
  using (
    is_super_admin() or exists (
      select 1 from flight_bookings fb
      where fb.id = flight_ancillaries.booking_id
        and fb.agency_id = current_agency_id()
    )
  )
  with check (
    is_super_admin() or exists (
      select 1 from flight_bookings fb
      where fb.id = flight_ancillaries.booking_id
        and fb.agency_id = current_agency_id()
    )
  );

alter table flight_supplier_transactions enable row level security;
drop policy if exists "flight_supplier_transactions_tenant_isolation" on flight_supplier_transactions;
create policy "flight_supplier_transactions_tenant_isolation" on flight_supplier_transactions
  for all
  using (
    is_super_admin() or (
      booking_id is not null and exists (
        select 1 from flight_bookings fb
        where fb.id = flight_supplier_transactions.booking_id
          and fb.agency_id = current_agency_id()
      )
    )
  )
  with check (
    is_super_admin() or (
      booking_id is not null and exists (
        select 1 from flight_bookings fb
        where fb.id = flight_supplier_transactions.booking_id
          and fb.agency_id = current_agency_id()
      )
    )
  );

-- ── Réseau fournisseur global — verrouillé au super_admin uniquement ────────
-- Pas de agency_id : ce sont des données de référence réseau, pas des
-- données par agence (même logique que suppliers/supplier_modules).

alter table supplier_nodes enable row level security;
drop policy if exists "supplier_nodes_superadmin" on supplier_nodes;
create policy "supplier_nodes_superadmin" on supplier_nodes
  for all
  using (is_super_admin())
  with check (is_super_admin());

alter table supplier_portal_users enable row level security;
drop policy if exists "supplier_portal_users_superadmin" on supplier_portal_users;
create policy "supplier_portal_users_superadmin" on supplier_portal_users
  for all
  using (is_super_admin())
  with check (is_super_admin());
