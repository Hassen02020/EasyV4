-- PUBLIC-NAV-VISA-CROISIERES-01 (2026-10-27)
-- Ajoute 2 nouveaux modules à la navigation publique : Visa et
-- Bateaux & Croisières. Visibles dans la navigation du header uniquement
-- (pas d'onglet dans le moteur de recherche de l'accueil — pas de
-- fonctionnalité de réservation pour ces modules à ce jour).
-- Additive, idempotent (ON CONFLICT), non destructif.
-- Même motif que drizzle/manual/0097_public_visual_content.sql.
-- Production application requires explicit GO.

BEGIN;

WITH default_agency AS (
  SELECT id FROM agencies
  WHERE agency_type = 'ota' AND domain IS NULL
  ORDER BY created_at ASC
  LIMIT 1
)
INSERT INTO public_module_visuals
  (agency_id, module_slug, enabled, sort_order, hero_image_url)
SELECT id, v.module_slug, true, v.sort_order, NULL
FROM default_agency
CROSS JOIN (VALUES
  ('bateaux-croisieres', 45),
  ('visa', 90)
) AS v(module_slug, sort_order)
ON CONFLICT (agency_id, module_slug) DO UPDATE
SET enabled = true,
    sort_order = EXCLUDED.sort_order,
    updated_at = now();

COMMIT;
