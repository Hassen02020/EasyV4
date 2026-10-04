-- J6 CRM→Distribution : canal d'acquisition du lead
--
-- Ajoute un pgEnum `lead_acquisition_channel` et une colonne nullable
-- `acquisition_channel` sur `leads`.
--
-- Vocabulaire délibérément aligné sur `commercial_agreement_channel` pour
-- cohérence inter-domaines : b2c · b2b · network · white_label · api.
-- NULL = inconnu / non renseigné (WhatsApp inbox, leads historiques).
-- La colonne est nullable : aucune migration de données, aucun NOT NULL DEFAULT
-- qui introduirait une valeur inventée sur les anciens enregistrements.

CREATE TYPE "lead_acquisition_channel" AS ENUM (
  'b2c',
  'b2b',
  'network',
  'white_label',
  'api'
);

ALTER TABLE "leads"
  ADD COLUMN "acquisition_channel" "lead_acquisition_channel";
