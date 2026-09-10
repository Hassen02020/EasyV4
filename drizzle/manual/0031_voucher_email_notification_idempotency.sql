-- Phase 20 — étend la garde d'idempotence notification (migration 0026,
-- déjà utilisée par WhatsApp/CRM) à l'envoi email voucher
-- (process-confirmed-booking.ts), qui n'avait aucun garde-fou : un retry
-- Inngest après un succès partiel (email envoyé mais la réponse perdue
-- avant que le job ne le sache) renvoyait l'email PDF en double. Pas un
-- risque financier/réservation (aucune mutation reservations/payments
-- dans cette fonction au-delà d'un touch idempotent de updatedAt), mais
-- évite l'email en double comme pour WhatsApp/CRM — même mécanisme, pas
-- une nouvelle table/file.

drop index if exists audit_events_notification_success_uniq;

create unique index if not exists audit_events_notification_success_uniq
  on audit_events (entity_type, entity_id, action)
  where action in (
    'notification.whatsapp.sent',
    'notification.crm.synced',
    'notification.voucher_email.sent'
  );
