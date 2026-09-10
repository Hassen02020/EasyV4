-- Audit général (code mort/sécurité) — quatre tables tenant-scopées
-- (`agency_id` non-nul) créées lors de phases précédentes sans migration RLS
-- correspondante, alors que TOUTES les autres tables tenant-scopées de ce
-- projet en ont une (voir 0001_rls_policies.sql et suivantes). Signalé une
-- première fois dans WALLET_PAYMENT_AUDIT_REPORT.md (WALLET-14/17), resté
-- non corrigé depuis — corrigé ici.
--
-- `audit_logs` et `inventory_locks` interrogeaient jusqu'ici la connexion
-- postgres-js directe via `getDb()` (aucun GUC de contexte posé) — activer
-- RLS+FORCE sans rien changer d'autre aurait cassé silencieusement tout
-- audit logging et tout verrouillage d'inventaire (0 ligne visible, écritures
-- rejetées). Les deux fichiers concernés (lib/audit/logger.ts,
-- lib/booking/inventory.ts) ont été convertis vers `withSystemContext()`
-- dans le même changement que cette migration — jamais l'un sans l'autre.
--
-- `products` : table sans aucun point d'appel actuellement (audit code mort
-- confirmé) — RLS ajoutée par cohérence/hygiène, zéro risque de régression.
--
-- `yield_rules` : déjà interrogée exclusivement via `withTenantContext()`
-- (lib/yield/actions.ts) — RLS ajoutée sans changement de code nécessaire.

alter table products enable row level security;
alter table products force row level security;
create policy "products_tenant_isolation" on products
  for all
  using (agency_id = current_agency_id() or is_super_admin())
  with check (agency_id = current_agency_id() or is_super_admin());

alter table audit_logs enable row level security;
alter table audit_logs force row level security;
create policy "audit_logs_tenant_isolation" on audit_logs
  for all
  using (agency_id = current_agency_id() or is_super_admin())
  with check (agency_id = current_agency_id() or is_super_admin());

alter table yield_rules enable row level security;
alter table yield_rules force row level security;
create policy "yield_rules_tenant_isolation" on yield_rules
  for all
  using (agency_id = current_agency_id() or is_super_admin())
  with check (agency_id = current_agency_id() or is_super_admin());

alter table inventory_locks enable row level security;
alter table inventory_locks force row level security;
create policy "inventory_locks_tenant_isolation" on inventory_locks
  for all
  using (agency_id = current_agency_id() or is_super_admin())
  with check (agency_id = current_agency_id() or is_super_admin());
