-- PUBLIC-VISUAL-01 (2026-10-02)
-- Public storefront visual/content configuration.
-- Additive and idempotent. Production application requires explicit GO.

BEGIN;

CREATE TABLE IF NOT EXISTS public_site_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id uuid NOT NULL REFERENCES agencies(id) ON DELETE CASCADE,
  hero_image_url text,
  facebook_url text,
  instagram_url text,
  tiktok_url text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS public_site_settings_agency_uniq
  ON public_site_settings(agency_id);

CREATE TABLE IF NOT EXISTS public_module_visuals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id uuid NOT NULL REFERENCES agencies(id) ON DELETE CASCADE,
  module_slug varchar(64) NOT NULL,
  enabled boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  hero_image_url text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS public_module_visuals_agency_module_uniq
  ON public_module_visuals(agency_id, module_slug);

CREATE INDEX IF NOT EXISTS public_module_visuals_agency_enabled_idx
  ON public_module_visuals(agency_id, enabled, sort_order);

CREATE TABLE IF NOT EXISTS public_promotions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id uuid NOT NULL REFERENCES agencies(id) ON DELETE CASCADE,
  title varchar(200) NOT NULL,
  subtitle varchar(300),
  destination varchar(120) NOT NULL,
  module_slug varchar(64) NOT NULL,
  href text NOT NULL,
  image_url text NOT NULL,
  flag varchar(16),
  enabled boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  starts_at timestamptz,
  ends_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS public_promotions_agency_active_idx
  ON public_promotions(agency_id, enabled, sort_order);

CREATE UNIQUE INDEX IF NOT EXISTS public_promotions_agency_destination_uniq
  ON public_promotions(agency_id, destination);

ALTER TABLE public_site_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public_site_settings FORCE ROW LEVEL SECURITY;
ALTER TABLE public_module_visuals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public_module_visuals FORCE ROW LEVEL SECURITY;
ALTER TABLE public_promotions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public_promotions FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS public_site_settings_read ON public_site_settings;
CREATE POLICY public_site_settings_read ON public_site_settings
  FOR SELECT TO authenticated
  USING (agency_id = current_agency_id() OR is_super_admin());

DROP POLICY IF EXISTS public_site_settings_write ON public_site_settings;
CREATE POLICY public_site_settings_write ON public_site_settings
  FOR ALL TO authenticated
  USING (is_super_admin())
  WITH CHECK (is_super_admin());

DROP POLICY IF EXISTS public_module_visuals_read ON public_module_visuals;
CREATE POLICY public_module_visuals_read ON public_module_visuals
  FOR SELECT TO authenticated
  USING (agency_id = current_agency_id() OR is_super_admin());

DROP POLICY IF EXISTS public_module_visuals_write ON public_module_visuals;
CREATE POLICY public_module_visuals_write ON public_module_visuals
  FOR ALL TO authenticated
  USING (is_super_admin())
  WITH CHECK (is_super_admin());

DROP POLICY IF EXISTS public_promotions_read ON public_promotions;
CREATE POLICY public_promotions_read ON public_promotions
  FOR SELECT TO authenticated
  USING (agency_id = current_agency_id() OR is_super_admin());

DROP POLICY IF EXISTS public_promotions_write ON public_promotions;
CREATE POLICY public_promotions_write ON public_promotions
  FOR ALL TO authenticated
  USING (is_super_admin())
  WITH CHECK (is_super_admin());

-- Seed only the default Easy2Book OTA tenant (domain IS NULL).
-- Images remain editable from the admin; these are the current visual defaults.
WITH default_agency AS (
  SELECT id FROM agencies
  WHERE agency_type = 'ota' AND domain IS NULL
  ORDER BY created_at ASC
  LIMIT 1
)
INSERT INTO public_site_settings (agency_id, hero_image_url)
SELECT id, 'https://images.unsplash.com/photo-1531761535209-180857e963b9?w=2400&q=80&auto=format&fit=crop'
FROM default_agency
ON CONFLICT (agency_id) DO UPDATE
SET hero_image_url = COALESCE(public_site_settings.hero_image_url, EXCLUDED.hero_image_url),
    updated_at = now();

WITH default_agency AS (
  SELECT id FROM agencies
  WHERE agency_type = 'ota' AND domain IS NULL
  ORDER BY created_at ASC
  LIMIT 1
)
INSERT INTO public_module_visuals
  (agency_id, module_slug, enabled, sort_order, hero_image_url)
SELECT id, v.module_slug, true, v.sort_order, v.hero_image_url
FROM default_agency
CROSS JOIN (VALUES
  ('hotels-tunisie', 10, 'https://images.unsplash.com/photo-1566073771259-6a8506099945?w=1800&q=85&auto=format&fit=crop'),
  ('hotels-monde', 20, 'https://images.unsplash.com/photo-1542314831-068cd1dbfeeb?w=1800&q=85&auto=format&fit=crop'),
  ('omraty', 30, 'https://images.unsplash.com/photo-1564769625905-50e93615e769?w=1800&q=85&auto=format&fit=crop'),
  ('voyages-organises', 40, 'https://images.unsplash.com/photo-1530789253388-582c481c54b0?w=1800&q=85&auto=format&fit=crop'),
  ('attractions', 50, 'https://images.unsplash.com/photo-1531761535209-180857e963b9?w=1800&q=85&auto=format&fit=crop'),
  ('vols', 60, 'https://images.unsplash.com/photo-1436491865332-7a61a109cc05?w=1800&q=85&auto=format&fit=crop'),
  ('transferts', 70, 'https://images.unsplash.com/photo-1549317661-bd32c8ce0db2?w=1800&q=85&auto=format&fit=crop'),
  ('car', 80, 'https://images.unsplash.com/photo-1503376780353-7e6692767b70?w=1800&q=85&auto=format&fit=crop')
) AS v(module_slug, sort_order, hero_image_url)
ON CONFLICT (agency_id, module_slug) DO UPDATE
SET hero_image_url = COALESCE(public_module_visuals.hero_image_url, EXCLUDED.hero_image_url),
    enabled = true,
    sort_order = EXCLUDED.sort_order,
    updated_at = now();

WITH default_agency AS (
  SELECT id FROM agencies
  WHERE agency_type = 'ota' AND domain IS NULL
  ORDER BY created_at ASC
  LIMIT 1
)
INSERT INTO public_promotions
  (agency_id, title, subtitle, destination, module_slug, href, image_url, flag, enabled, sort_order)
SELECT id, v.title, v.subtitle, v.destination, v.module_slug, v.href, v.image_url, v.flag, true, v.sort_order
FROM default_agency
CROSS JOIN (VALUES
  ('Istanbul', 'Vols + Hôtel', 'Istanbul', 'hotels-monde', '/hotels-monde', 'https://images.unsplash.com/photo-1524231757912-21f4fe3a7200?w=600&h=400&fit=crop', '🇹🇷', 10),
  ('Djerba', 'Tout Inclus', 'Djerba', 'hotel', '/hotels/search', 'https://images.unsplash.com/photo-1582719508461-905c673771fd?w=600&h=400&fit=crop', '🇹🇳', 20),
  ('Omra', 'Programme Éco', 'Omra', 'omraty', '/omra', 'https://images.unsplash.com/photo-1591604129939-f1efa4d9f7fa?w=600&h=400&fit=crop', '🇸🇦', 30)
) AS v(title, subtitle, destination, module_slug, href, image_url, flag, sort_order)
ON CONFLICT (agency_id, destination) DO UPDATE
SET title = EXCLUDED.title,
    subtitle = EXCLUDED.subtitle,
    module_slug = EXCLUDED.module_slug,
    href = EXCLUDED.href,
    image_url = EXCLUDED.image_url,
    flag = EXCLUDED.flag,
    sort_order = EXCLUDED.sort_order,
    updated_at = now();

COMMIT;
