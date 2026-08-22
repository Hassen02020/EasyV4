-- WhatsApp/CRM notification idempotency — DB-enforced guarantee on top of
-- the check-before-insert application logic in
-- lib/whatsapp/send-booking-confirmation.ts / lib/crm/sync-booking.ts.
--
-- Reuses the existing audit_events table (no new table/queue) as both the
-- structured audit trail (required for every notification attempt) and the
-- idempotency source of truth: at most one successful WhatsApp send or CRM
-- sync per reservation, DB-enforced — matching the same guarantee
-- convention already used for payments_reservation_captured_uniq
-- (Wallet/Payment Core migration). The application-level check
-- (hasAlreadySucceeded, a plain SELECT before INSERT) closes the common
-- case cheaply; this index closes the narrow race window a check-then-insert
-- alone leaves open under genuinely concurrent execution (e.g. an
-- at-least-once duplicate event delivery), the same way DB constraints
-- already back up every other double-processing guard in this project.
create unique index if not exists audit_events_notification_success_uniq
  on audit_events (entity_type, entity_id, action)
  where action in ('notification.whatsapp.sent', 'notification.crm.synced');
