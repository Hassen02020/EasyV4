-- =============================================================================
-- FIX-IDEMPOTENCY-01 : table notification_idempotency
-- =============================================================================
-- Sépare les gardes d'idempotence de notifications (WhatsApp, email voucher,
-- CRM) de la table audit_events qui est purgée à 30 jours.
--
-- Problème : audit_events sert à la fois de journal d'audit (purge 30j) et
-- de garde d'idempotence Inngest (doit survivre au-delà de 30j). Une
-- réservation confirmée il y a > 30j peut recevoir un email voucher en
-- double si Inngest rejoue la fonction (ex. après un redéploiement).
--
-- Correctif : notification_idempotency — table permanente, jamais purgée,
-- stocke uniquement les livraisons réussies par (reservation_id, action).
-- audit_events reste la source d'audit exhaustive (toutes tentatives).
--
-- Consommateurs mis à jour :
--   lib/whatsapp/send-booking-confirmation.ts  (defaultNotificationAuditStore)
--   lib/crm/sync-booking.ts                    (defaultCrmAuditStore)
--   lib/inngest/functions/process-confirmed-booking.ts
--
-- Application :
--   psql "$DATABASE_DIRECT_URL" -f drizzle/manual/0099_notification_idempotency.sql
--
-- Dépend de : 0001_rls_policies.sql (agencies table, app_runtime grant pattern)
-- Idempotent : peut être réexécuté sans effet de bord.
-- =============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS notification_idempotency (
  id             UUID        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  agency_id      UUID        NOT NULL REFERENCES agencies(id) ON DELETE CASCADE,
  reservation_id UUID        NOT NULL,
  action         VARCHAR(64) NOT NULL,
  context        JSONB,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS notification_idempotency_sent_uniq
  ON notification_idempotency(reservation_id, action);

CREATE INDEX IF NOT EXISTS notification_idempotency_agency_idx
  ON notification_idempotency(agency_id);

CREATE INDEX IF NOT EXISTS notification_idempotency_reservation_idx
  ON notification_idempotency(reservation_id);

-- RLS — même pattern tenant-isolation que audit_events
ALTER TABLE notification_idempotency ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS notification_idempotency_tenant_isolation ON notification_idempotency;
CREATE POLICY notification_idempotency_tenant_isolation ON notification_idempotency
  FOR ALL
  USING  (agency_id = current_agency_id() OR is_super_admin())
  WITH CHECK (agency_id = current_agency_id() OR is_super_admin());

-- app_runtime peut écrire (Inngest, crons tournent sous ce rôle)
GRANT SELECT, INSERT ON notification_idempotency TO app_runtime;

COMMIT;
