-- Migration manuelle (idempotente) — Champs programme Omra
--
-- Étend `omra_packages` pour la saisie complète des programmes Omra
-- (refonte module Omra : hero, fiche détail, back-office).
--
-- Application :
--   psql "$DATABASE_URL" -f drizzle/manual/0010_omra_program_fields.sql
--
-- 100% idempotent : ré-exécutable sans erreur.

-- 1) Nouveau type enum "omra_formule" (gamme commerciale)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'omra_formule') THEN
    CREATE TYPE "public"."omra_formule" AS ENUM (
      'moyasara', 'al_haram', 'abraj_premium', 'vip_exclusive'
    );
  END IF;
END $$;

-- 2) Nouvelles colonnes sur omra_packages
ALTER TABLE "omra_packages" ADD COLUMN IF NOT EXISTS "name_ar" varchar(128);
ALTER TABLE "omra_packages" ADD COLUMN IF NOT EXISTS "slug" varchar(160);
ALTER TABLE "omra_packages" ADD COLUMN IF NOT EXISTS "formule" "omra_formule";
ALTER TABLE "omra_packages" ADD COLUMN IF NOT EXISTS "departure_city" varchar(64) DEFAULT 'Tunis' NOT NULL;
ALTER TABLE "omra_packages" ADD COLUMN IF NOT EXISTS "nights_medina" integer;
ALTER TABLE "omra_packages" ADD COLUMN IF NOT EXISTS "nights_makkah" integer;
ALTER TABLE "omra_packages" ADD COLUMN IF NOT EXISTS "meal_plan_medina" "omra_meal_plan";
ALTER TABLE "omra_packages" ADD COLUMN IF NOT EXISTS "meal_plan_makkah" "omra_meal_plan";
ALTER TABLE "omra_packages" ADD COLUMN IF NOT EXISTS "hotel_medina_name" varchar(128);
ALTER TABLE "omra_packages" ADD COLUMN IF NOT EXISTS "hotel_medina_category" "omra_hotel_category";
ALTER TABLE "omra_packages" ADD COLUMN IF NOT EXISTS "hotel_makkah_name" varchar(128);
ALTER TABLE "omra_packages" ADD COLUMN IF NOT EXISTS "hotel_makkah_category" "omra_hotel_category";
ALTER TABLE "omra_packages" ADD COLUMN IF NOT EXISTS "highlights" text[];
ALTER TABLE "omra_packages" ADD COLUMN IF NOT EXISTS "alternative_durations" integer[];
ALTER TABLE "omra_packages" ADD COLUMN IF NOT EXISTS "itinerary" jsonb;
ALTER TABLE "omra_packages" ADD COLUMN IF NOT EXISTS "cover_image_url" text;
ALTER TABLE "omra_packages" ADD COLUMN IF NOT EXISTS "photo_urls" text[];
ALTER TABLE "omra_packages" ADD COLUMN IF NOT EXISTS "featured" boolean DEFAULT false NOT NULL;
ALTER TABLE "omra_packages" ADD COLUMN IF NOT EXISTS "allows_installments" boolean DEFAULT true NOT NULL;

-- 3) Index pour le slug (URL publique) et la mise en avant (page d'accueil)
CREATE INDEX IF NOT EXISTS "omra_pkg_slug_idx" ON "omra_packages" USING btree ("slug");
CREATE INDEX IF NOT EXISTS "omra_pkg_featured_idx" ON "omra_packages" USING btree ("featured");
