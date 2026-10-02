-- R10-01 (2026-10-02): waitlist projets de développement
-- Additive — ADD TABLE uniquement, aucune colonne existante modifiée.
BEGIN;

CREATE TABLE IF NOT EXISTS development_project_waitlist (
  id          UUID                        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id  UUID                        NOT NULL REFERENCES development_projects(id) ON DELETE CASCADE,
  email       TEXT                        NOT NULL,
  locale      TEXT                        NOT NULL DEFAULT 'fr',
  created_at  TIMESTAMP WITH TIME ZONE    NOT NULL DEFAULT now(),
  CONSTRAINT development_project_waitlist_project_email_uidx UNIQUE (project_id, email)
);

CREATE INDEX IF NOT EXISTS development_project_waitlist_project_id_idx
  ON development_project_waitlist (project_id);

COMMIT;
