-- CRM-C : Task Management
-- Table crm_tasks : tâches de suivi CRM associées à un lead ou à un agent.
-- agencyId dénormalisé depuis le lead pour simplifier les policies RLS.

CREATE TABLE IF NOT EXISTS crm_tasks (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id   UUID NOT NULL REFERENCES agencies(id) ON DELETE CASCADE,
  lead_id     UUID REFERENCES leads(id) ON DELETE SET NULL,
  assignee_id UUID REFERENCES users(id) ON DELETE SET NULL,
  created_by  UUID REFERENCES users(id) ON DELETE SET NULL,
  -- 'callback' | 'email' | 'visit' | 'followup' | 'other'
  type        VARCHAR(32) NOT NULL DEFAULT 'followup',
  -- 'open' | 'done' | 'cancelled'
  status      VARCHAR(16) NOT NULL DEFAULT 'open',
  title       VARCHAR(255) NOT NULL,
  notes       TEXT,
  due_at      TIMESTAMPTZ,
  done_at     TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS crm_tasks_agency_status_idx    ON crm_tasks(agency_id, status, due_at);
CREATE INDEX IF NOT EXISTS crm_tasks_agency_assignee_idx  ON crm_tasks(agency_id, assignee_id, status);
CREATE INDEX IF NOT EXISTS crm_tasks_lead_idx             ON crm_tasks(lead_id) WHERE lead_id IS NOT NULL;

COMMENT ON TABLE crm_tasks IS
  'CRM-C : tâches de suivi (rappel, email, visite…) assignées au staff et optionnellement liées à un lead.';

-- RLS : même discipline que leads / lead_origin_events.
ALTER TABLE crm_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE crm_tasks FORCE ROW LEVEL SECURITY;

-- La policy suit le pattern "tenant isolation" : chaque opération est autorisée
-- pour les utilisateurs dont l'agency_id dans public.users correspond à
-- crm_tasks.agency_id. Les services (service_role) contournent RLS par défaut.

DO $$
BEGIN
  -- SELECT
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'crm_tasks' AND policyname = 'crm_tasks_select_own_agency'
  ) THEN
    CREATE POLICY crm_tasks_select_own_agency ON crm_tasks
      FOR SELECT USING (
        agency_id = (
          SELECT agency_id FROM users WHERE id = auth.uid()
        )
      );
  END IF;

  -- INSERT
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'crm_tasks' AND policyname = 'crm_tasks_insert_own_agency'
  ) THEN
    CREATE POLICY crm_tasks_insert_own_agency ON crm_tasks
      FOR INSERT WITH CHECK (
        agency_id = (
          SELECT agency_id FROM users WHERE id = auth.uid()
        )
      );
  END IF;

  -- UPDATE
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'crm_tasks' AND policyname = 'crm_tasks_update_own_agency'
  ) THEN
    CREATE POLICY crm_tasks_update_own_agency ON crm_tasks
      FOR UPDATE USING (
        agency_id = (
          SELECT agency_id FROM users WHERE id = auth.uid()
        )
      );
  END IF;
END $$;
