-- 0146 — vidéo Hero du site public (SITE-VIDEO-01)
--
-- 1) public_site_settings.hero_video_url : URL publique de la vidéo d'arrière-
--    plan du Hero d'accueil (nullable, additive, aucune donnée reprise).
-- 2) Compartiment Storage `product-media` (0145) : accepte en plus les vidéos
--    MP4/WebM et passe à 50 Mo par fichier. Les images restent limitées à
--    20 Mo par le contrôle serveur (lib/media/optimize.ts) ; les vidéos sont
--    envoyées directement par le navigateur via une URL d'envoi signée et
--    vérifiées ensuite (signature binaire) par lib/media/site-video.ts.
--
-- Idempotente. Le bloc Storage est sans effet sur un Postgres sans schéma
-- storage (base de test CI).
--
-- Retour arrière :
--   ALTER TABLE public_site_settings DROP COLUMN IF EXISTS hero_video_url;
--   UPDATE storage.buckets SET file_size_limit = 20971520,
--     allowed_mime_types = ARRAY['image/jpeg','image/png','image/webp']
--   WHERE id = 'product-media';

ALTER TABLE public_site_settings ADD COLUMN IF NOT EXISTS hero_video_url text;

DO $$
BEGIN
  IF to_regclass('storage.buckets') IS NOT NULL THEN
    UPDATE storage.buckets
    SET file_size_limit = 52428800,
        allowed_mime_types = ARRAY[
          'image/jpeg', 'image/png', 'image/webp', 'video/mp4', 'video/webm'
        ]
    WHERE id = 'product-media';
  END IF;
END $$;
