-- PHASE PREMIUM 2 — Chantier 3 : Destination Search / Autocomplete unifié
-- (architecture validée par l'utilisateur, section "Backfill des données").
--
-- Reprise EXACTE des valeurs déjà en dur dans le code (aucune donnée
-- inventée) :
--   - lib/hotels-monde/search-state.ts::POPULAR_DESTINATIONS (10 slugs)
--   - components/booking-engine.tsx::PACKAGE_DESTINATION_VALUES /
--     components/packages/package-search.tsx::DESTINATIONS (8 slugs)
--   - lib/vols/search-state.ts::AIRPORTS (11 codes IATA)
--
-- Chaque module continue d'émettre exactement le même external_id
-- qu'aujourd'hui (ex. destination=istanbul, origin=IST) — ce backfill
-- alimente uniquement la NOUVELLE surface d'autocomplete
-- (/api/destinations/search), il ne remplace ni les tableaux statiques
-- existants (qui restent la source de vérité pour la validation/le
-- parsing des query params, volontairement non touchés) ni le catalogue
-- myGo (Hôtels Tunisie, hors périmètre de ce chantier).
--
-- Plusieurs external_id peuvent pointer vers la MÊME ville canonique
-- (ex. 'istanbul' en hotels_monde_slug + packages_slug + IST en iata) —
-- c'est exactement le rôle de destination_external_refs posé au
-- chantier 2 : un seul référentiel géo, plusieurs vocabulaires modules.
--
-- Application : psql "$DATABASE_DIRECT_URL" -f drizzle/manual/0055_destinations_seed.sql

begin;

-- 1) Pays (11, un par ville ci-dessous)
insert into destinations (type, slug, name, name_en, name_ar, country_code) values
  ('country', 'turquie', 'Turquie', 'Turkey', 'تركيا', 'TR'),
  ('country', 'emirats-arabes-unis', 'Émirats Arabes Unis', 'United Arab Emirates', 'الإمارات العربية المتحدة', 'AE'),
  ('country', 'france', 'France', 'France', 'فرنسا', 'FR'),
  ('country', 'italie', 'Italie', 'Italy', 'إيطاليا', 'IT'),
  ('country', 'espagne', 'Espagne', 'Spain', 'إسبانيا', 'ES'),
  ('country', 'royaume-uni', 'Royaume-Uni', 'United Kingdom', 'المملكة المتحدة', 'GB'),
  ('country', 'egypte', 'Égypte', 'Egypt', 'مصر', 'EG'),
  ('country', 'maroc', 'Maroc', 'Morocco', 'المغرب', 'MA'),
  ('country', 'pays-bas', 'Pays-Bas', 'Netherlands', 'هولندا', 'NL'),
  ('country', 'etats-unis', 'États-Unis', 'United States', 'الولايات المتحدة', 'US'),
  ('country', 'tunisie', 'Tunisie', 'Tunisia', 'تونس', 'TN');

-- 2) Villes (17, rattachées à leur pays ci-dessus)
insert into destinations (type, slug, name, name_en, name_ar, parent_id)
select 'city', v.slug, v.name, v.name_en, v.name_ar, d.id
from (values
  ('istanbul', 'Istanbul', 'Istanbul', 'إسطنبول', 'turquie'),
  ('dubai', 'Dubaï', 'Dubai', 'دبي', 'emirats-arabes-unis'),
  ('paris', 'Paris', 'Paris', 'باريس', 'france'),
  ('rome', 'Rome', 'Rome', 'روما', 'italie'),
  ('barcelona', 'Barcelone', 'Barcelona', 'برشلونة', 'espagne'),
  ('london', 'Londres', 'London', 'لندن', 'royaume-uni'),
  ('cairo', 'Le Caire', 'Cairo', 'القاهرة', 'egypte'),
  ('marrakech', 'Marrakech', 'Marrakech', 'مراكش', 'maroc'),
  ('amsterdam', 'Amsterdam', 'Amsterdam', 'أمستردام', 'pays-bas'),
  ('new-york', 'New York', 'New York', 'نيويورك', 'etats-unis'),
  ('casablanca', 'Casablanca', 'Casablanca', 'الدار البيضاء', 'maroc'),
  -- 'مدينة تونس' (littéralement "ville de Tunis") plutôt que 'تونس' seul :
  -- désambiguïse de la ligne pays 'Tunisie'/'تونس' juste au-dessus, qui
  -- partage le même nom arabe usuel — convention standard (cartes, médias)
  -- pour distinguer la capitale du pays quand les deux apparaissent ensemble.
  ('tunis', 'Tunis', 'Tunis', 'مدينة تونس', 'tunisie'),
  ('sfax', 'Sfax', 'Sfax', 'صفاقس', 'tunisie'),
  ('tozeur', 'Tozeur', 'Tozeur', 'توزر', 'tunisie'),
  ('monastir', 'Monastir', 'Monastir', 'المنستير', 'tunisie'),
  ('djerba', 'Djerba', 'Djerba', 'جربة', 'tunisie'),
  ('lyon', 'Lyon', 'Lyon', 'ليون', 'france')
) as v(slug, name, name_en, name_ar, country_slug)
join destinations d on d.slug = v.country_slug and d.type = 'country';

-- 3) Correspondances vers les ID déjà utilisés par chaque module (29) —
--    external_id copié tel quel depuis les tableaux statiques listés en tête.
insert into destination_external_refs (destination_id, module, external_id)
select d.id, r.module, r.external_id
from (values
  ('istanbul', 'hotels_monde_slug', 'istanbul'),
  ('dubai', 'hotels_monde_slug', 'dubai'),
  ('paris', 'hotels_monde_slug', 'paris'),
  ('rome', 'hotels_monde_slug', 'rome'),
  ('barcelona', 'hotels_monde_slug', 'barcelona'),
  ('london', 'hotels_monde_slug', 'london'),
  ('cairo', 'hotels_monde_slug', 'cairo'),
  ('marrakech', 'hotels_monde_slug', 'marrakech'),
  ('amsterdam', 'hotels_monde_slug', 'amsterdam'),
  ('new-york', 'hotels_monde_slug', 'new_york'),
  ('istanbul', 'packages_slug', 'istanbul'),
  ('dubai', 'packages_slug', 'dubai'),
  ('paris', 'packages_slug', 'paris'),
  ('rome', 'packages_slug', 'rome'),
  ('barcelona', 'packages_slug', 'barcelona'),
  ('london', 'packages_slug', 'london'),
  ('cairo', 'packages_slug', 'cairo'),
  ('casablanca', 'packages_slug', 'casablanca'),
  ('tunis', 'iata', 'TUN'),
  ('sfax', 'iata', 'SFA'),
  ('tozeur', 'iata', 'TOE'),
  ('monastir', 'iata', 'MIR'),
  ('djerba', 'iata', 'DJE'),
  ('paris', 'iata', 'CDG'),
  ('paris', 'iata', 'ORY'),
  ('lyon', 'iata', 'LYS'),
  ('rome', 'iata', 'FCO'),
  ('istanbul', 'iata', 'IST'),
  ('dubai', 'iata', 'DXB')
) as r(city_slug, module, external_id)
join destinations d on d.slug = r.city_slug and d.type = 'city';

commit;
