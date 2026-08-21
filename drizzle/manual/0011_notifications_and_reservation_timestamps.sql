-- Migration manuelle 0011 — Post-booking workflow Omra
--
-- 1. Garantit les colonnes de cycle de vie sur `reservations`
--    (`confirmed_at` / `cancelled_at`) — certaines bases dev étaient en retard
--    sur la migration 0003 qui les introduit. Idempotent.
-- 2. Crée la table `notifications` (back-office in-app + canaux sortants
--    extensibles : email / sms / whatsapp).
--
-- Idempotente : peut être ré-exécutée sans effet de bord.

/* -- 1. Colonnes cycle de vie réservation --------------------------------- */
ALTER TABLE reservations
  ADD COLUMN IF NOT EXISTS confirmed_at timestamptz;
ALTER TABLE reservations
  ADD COLUMN IF NOT EXISTS cancelled_at timestamptz;

/* -- 2. Table notifications ----------------------------------------------- */
CREATE TABLE IF NOT EXISTS notifications (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id    uuid NOT NULL REFERENCES agencies (id) ON DELETE RESTRICT,
  channel      varchar(16)  NOT NULL DEFAULT 'in_app',
  type         varchar(48)  NOT NULL,
  audience     varchar(16)  NOT NULL DEFAULT 'admin',
  title        varchar(160) NOT NULL,
  body         text,
  entity_type  varchar(32),
  entity_id    text,
  recipient    varchar(160),
  status       varchar(16)  NOT NULL DEFAULT 'pending',
  error        text,
  read_at      timestamptz,
  sent_at      timestamptz,
  metadata     jsonb,
  created_at   timestamptz  NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS notifications_agency_idx
  ON notifications (agency_id);
CREATE INDEX IF NOT EXISTS notifications_agency_read_idx
  ON notifications (agency_id, read_at);
CREATE INDEX IF NOT EXISTS notifications_entity_idx
  ON notifications (entity_type, entity_id);
CREATE INDEX IF NOT EXISTS notifications_type_idx
  ON notifications (type);
