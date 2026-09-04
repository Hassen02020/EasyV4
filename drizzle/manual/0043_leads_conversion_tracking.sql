-- CRM / Leads — Conversion tracking (étape 1/3 du plan CRM demandé :
-- Conversion → Scoring → Relance).
--
-- Avant cette migration, `leads.status = 'converted'` était un LABEL MANUEL
-- posé par le staff sans aucune preuve — confirmé en audit (lot Supplier/CRM) :
-- aucune colonne ne reliait un lead à la réservation qu'il aurait produite,
-- donc aucun taux de conversion réel n'était mesurable. Cette migration
-- ajoute le lien réel et l'impose au niveau DB : un lead ne peut passer à
-- 'converted' que s'il porte un `reservation_id`.
--
-- `reservation_id` est UNIQUE (NULLs multiples autorisés par défaut Postgres
-- sur un index unique) : une même réservation ne peut jamais être comptée
-- comme la conversion de deux leads différents — sinon le taux de conversion
-- serait gonflable artificiellement.
--
-- Application : psql "$DATABASE_DIRECT_URL" -f drizzle/manual/0043_leads_conversion_tracking.sql

begin;

alter table leads
  add column reservation_id uuid references reservations(id) on delete set null,
  add column converted_at timestamptz;

create unique index leads_reservation_id_uniq on leads (reservation_id);

alter table leads
  add constraint leads_converted_requires_reservation
  check (status != 'converted' or reservation_id is not null);

commit;
