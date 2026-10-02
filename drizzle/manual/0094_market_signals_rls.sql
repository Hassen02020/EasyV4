-- R9-01 (2026-10-02) : RLS pour market_signals + development_projects
-- Lecture publique (agents authentifiés) ; écriture super_admin uniquement.

-- -------------------------------------------------------------------------
-- RLS activation
-- -------------------------------------------------------------------------

ALTER TABLE market_signals       ENABLE ROW LEVEL SECURITY;
ALTER TABLE development_projects ENABLE ROW LEVEL SECURITY;

ALTER TABLE market_signals       FORCE ROW LEVEL SECURITY;
ALTER TABLE development_projects FORCE ROW LEVEL SECURITY;

-- -------------------------------------------------------------------------
-- market_signals policies
-- -------------------------------------------------------------------------

-- Lecture : tout utilisateur authentifié (agent, manager, partner, etc.)
DROP POLICY IF EXISTS market_signals_read ON market_signals;
CREATE POLICY market_signals_read
  ON market_signals
  FOR SELECT
  TO authenticated
  USING (true);

-- Écriture : super_admin uniquement
DROP POLICY IF EXISTS market_signals_admin_write ON market_signals;
CREATE POLICY market_signals_admin_write
  ON market_signals
  FOR ALL
  TO authenticated
  USING    (is_super_admin())
  WITH CHECK (is_super_admin());

-- -------------------------------------------------------------------------
-- development_projects policies
-- -------------------------------------------------------------------------

DROP POLICY IF EXISTS development_projects_read ON development_projects;
CREATE POLICY development_projects_read
  ON development_projects
  FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS development_projects_admin_write ON development_projects;
CREATE POLICY development_projects_admin_write
  ON development_projects
  FOR ALL
  TO authenticated
  USING    (is_super_admin())
  WITH CHECK (is_super_admin());
