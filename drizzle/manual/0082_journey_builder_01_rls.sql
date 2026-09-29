-- JOURNEY-BUILDER-01 (suite de 0081) — RLS sur journeys/journey_lines,
-- activée dès la création (jamais un lot différé, voir le gap SEC-RLS-02).
-- Même pattern que les tables tenant existantes : agence propriétaire OU
-- super_admin. journey_lines n'a pas sa propre agency_id — scopée via
-- jointure sur journeys (même pattern que les tables flight_* enfants,
-- drizzle/manual/0076_flight_commission_supplier_rls.sql).

BEGIN;

ALTER TABLE journeys ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "journeys_tenant_isolation" ON journeys;
CREATE POLICY "journeys_tenant_isolation" ON journeys
  FOR ALL
  USING (agency_id = current_agency_id() OR is_super_admin())
  WITH CHECK (agency_id = current_agency_id() OR is_super_admin());

ALTER TABLE journey_lines ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "journey_lines_tenant_isolation" ON journey_lines;
CREATE POLICY "journey_lines_tenant_isolation" ON journey_lines
  FOR ALL
  USING (
    is_super_admin()
    OR EXISTS (
      SELECT 1 FROM journeys j
      WHERE j.id = journey_lines.journey_id
        AND j.agency_id = current_agency_id()
    )
  )
  WITH CHECK (
    is_super_admin()
    OR EXISTS (
      SELECT 1 FROM journeys j
      WHERE j.id = journey_lines.journey_id
        AND j.agency_id = current_agency_id()
    )
  );

COMMIT;
