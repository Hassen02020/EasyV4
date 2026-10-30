-- 0145 — compartiment Supabase Storage `product-media` (SITE-MEDIA-UPLOAD-01)
--
-- lib/media/storage.ts écrit dans le compartiment MEDIA_STORAGE_BUCKET
-- (= "product-media" en Production et Preview) via la clé service, puis sert
-- les fichiers par URL publique (getPublicUrl). Ce compartiment n'existait
-- pas en production (storage.buckets vide, constaté le 2026-10-30) : aucun
-- envoi de média n'y avait donc jamais abouti.
--
--  - public = true : lecture publique des images du site et des produits ;
--    l'écriture reste réservée à la clé service (aucune politique d'écriture
--    n'est ajoutée pour anon/authenticated).
--  - 20 Mo max et JPEG/PNG/WebP uniquement, identiques aux contrôles serveur
--    de lib/media/optimize.ts (MAX_FILE_SIZE_BYTES, ALLOWED_MEDIA_MIME_TYPES).
--
-- Idempotente (ON CONFLICT DO NOTHING). Sans effet sur un Postgres sans
-- schéma storage (base de test CI) : garde to_regclass.
--
-- Retour arrière (compartiment vide uniquement) :
--   DELETE FROM storage.buckets WHERE id = 'product-media';

DO $$
BEGIN
  IF to_regclass('storage.buckets') IS NOT NULL THEN
    INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    VALUES (
      'product-media',
      'product-media',
      true,
      20971520,
      ARRAY['image/jpeg', 'image/png', 'image/webp']
    )
    ON CONFLICT (id) DO NOTHING;
  END IF;
END $$;
