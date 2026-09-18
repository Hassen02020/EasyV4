-- Durcit lib/finance/reconciliation.ts (PR "Add v1 payment reconciliation
-- cron") contre les écritures audit_events dupliquées : sans contrainte,
-- deux exécutions qui se chevauchent (avant le verrou applicatif ajouté
-- dans ce même correctif) pouvaient journaliser DEUX FOIS le même écart
-- (même webhook/paiement/réservation/agence+jour).
--
-- Index unique PARTIEL, scopé à entity_type='reconciliation' uniquement —
-- n'affecte aucune autre ligne audit_events, en particulier pas l'index
-- partiel existant audit_events_notification_success_uniq (scopé à 3
-- actions 'notification.*' totalement disjointes).
--
-- Application : psql "$DATABASE_DIRECT_URL" -f drizzle/manual/0059_reconciliation_idempotency.sql

begin;

create unique index if not exists audit_events_reconciliation_uniq
  on audit_events (entity_type, entity_id, action)
  where entity_type = 'reconciliation';

commit;
