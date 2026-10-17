-- B2C-CANCEL-MONDE-02 : ajoute provider_offer_id à reservation_hotel
-- pour permettre l'appel cancel() du fournisseur virtuel lors des annulations.
-- Nullable et rétrocompatible — réservations existantes = NULL.
ALTER TABLE "reservation_hotel" ADD COLUMN IF NOT EXISTS "provider_offer_id" varchar(128);
