-- Migration 0121 — RLS-FORCE-CRM-01 (2026-10-06)
--
-- Audit CRM final : these tenant-scoped CRM tables already had RLS
-- policies, but RLS was only ENABLED, not FORCED. PostgreSQL table
-- owners can bypass ordinary RLS; FORCE makes the tenant-isolation
-- policy apply to the owner role as well.
--
-- Scope is deliberately security-only:
--   campaigns / campaign_targets / campaign_attributions / promos /
--   contacts / lead_origin_events
--
-- No policy, grant, schema, ownership, data or application logic is
-- changed. All six tables already have the canonical tenant-isolation
-- policy from their creation migrations.
--
-- Idempotent by PostgreSQL semantics.

BEGIN;

ALTER TABLE campaigns FORCE ROW LEVEL SECURITY;
ALTER TABLE campaign_targets FORCE ROW LEVEL SECURITY;
ALTER TABLE campaign_attributions FORCE ROW LEVEL SECURITY;
ALTER TABLE promos FORCE ROW LEVEL SECURITY;
ALTER TABLE contacts FORCE ROW LEVEL SECURITY;
ALTER TABLE lead_origin_events FORCE ROW LEVEL SECURITY;

COMMIT;
