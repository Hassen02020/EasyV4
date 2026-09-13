-- PHASE PREMIUM 2 — Chantier 4 : Pages Destination + SEO
-- (architecture validée par l'utilisateur, section "Contenu réel").
--
-- Backfill de destinations.seo_description (confirmée NULL sur les 28
-- lignes par l'audit chantier 4) — phrases géographiques factuelles et
-- vérifiables (localisation, cours d'eau, mer bordée, statut de capitale),
-- jamais une affirmation commerciale inventée (pas de prix, avis, stats).
-- Français uniquement : seo_description n'a pas de variante par locale
-- (une seule colonne texte, contrairement à name/name_en/name_ar) — les
-- pages destination EN/AR utilisent un gabarit générique traduit à la
-- place (voir lib/destinations/queries.ts), jamais ce texte français.
-- coverMediaUrl reste volontairement NULL (aucune URL d'image devinée).
--
-- Application : psql "$DATABASE_DIRECT_URL" -f drizzle/manual/0056_destinations_seo_description.sql

begin;

-- Pays
update destinations set seo_description = 'La Turquie relie l''Europe et l''Asie, entre mer Égée, mer Noire et Méditerranée.' where slug = 'turquie';
update destinations set seo_description = 'Les Émirats Arabes Unis regroupent sept émirats sur la péninsule Arabique, au bord du golfe Persique.' where slug = 'emirats-arabes-unis';
update destinations set seo_description = 'La France, en Europe de l''Ouest, s''étend de la Manche à la Méditerranée.' where slug = 'france';
update destinations set seo_description = 'L''Italie forme une péninsule au cœur de la Méditerranée, entre Alpes et mer Tyrrhénienne.' where slug = 'italie';
update destinations set seo_description = 'L''Espagne occupe la majeure partie de la péninsule Ibérique, entre Atlantique et Méditerranée.' where slug = 'espagne';
update destinations set seo_description = 'Le Royaume-Uni regroupe l''Angleterre, l''Écosse, le Pays de Galles et l''Irlande du Nord, au large de l''Europe continentale.' where slug = 'royaume-uni';
update destinations set seo_description = 'L''Égypte s''étend entre l''Afrique du Nord-Est et la péninsule du Sinaï, traversée par le Nil.' where slug = 'egypte';
update destinations set seo_description = 'Le Maroc occupe l''extrémité nord-ouest de l''Afrique, entre Atlantique et Méditerranée.' where slug = 'maroc';
update destinations set seo_description = 'Les Pays-Bas bordent la mer du Nord, en Europe du Nord-Ouest.' where slug = 'pays-bas';
update destinations set seo_description = 'Les États-Unis s''étendent sur l''essentiel de l''Amérique du Nord, entre Atlantique et Pacifique.' where slug = 'etats-unis';
update destinations set seo_description = 'La Tunisie occupe l''extrémité nord de l''Afrique du Nord, au bord de la Méditerranée.' where slug = 'tunisie';

-- Villes
update destinations set seo_description = 'Istanbul s''étend de part et d''autre du détroit du Bosphore, entre Europe et Asie.' where slug = 'istanbul';
update destinations set seo_description = 'Dubaï, sur le golfe Persique, est la ville la plus peuplée des Émirats Arabes Unis.' where slug = 'dubai';
update destinations set seo_description = 'Paris, capitale de la France, est traversée par la Seine.' where slug = 'paris';
update destinations set seo_description = 'Rome, capitale de l''Italie, s''étend le long du Tibre.' where slug = 'rome';
update destinations set seo_description = 'Barcelone, en Catalogne, borde la mer Méditerranée.' where slug = 'barcelona';
update destinations set seo_description = 'Londres, capitale du Royaume-Uni, est traversée par la Tamise.' where slug = 'london';
update destinations set seo_description = 'Le Caire, capitale de l''Égypte, est bâtie sur les rives du Nil.' where slug = 'cairo';
update destinations set seo_description = 'Marrakech se trouve au pied de l''Atlas, dans le centre du Maroc.' where slug = 'marrakech';
update destinations set seo_description = 'Amsterdam, capitale des Pays-Bas, est traversée par ses canaux historiques.' where slug = 'amsterdam';
update destinations set seo_description = 'New York, aux États-Unis, s''étend autour de l''embouchure de l''Hudson.' where slug = 'new-york';
update destinations set seo_description = 'Casablanca, sur l''Atlantique, est la plus grande ville du Maroc.' where slug = 'casablanca';
update destinations set seo_description = 'Tunis, capitale de la Tunisie, borde le lac de Tunis et la Méditerranée.' where slug = 'tunis';
update destinations set seo_description = 'Sfax, sur la côte est de la Tunisie, est la deuxième ville du pays.' where slug = 'sfax';
update destinations set seo_description = 'Tozeur, aux portes du Sahara tunisien, est réputée pour son oasis.' where slug = 'tozeur';
update destinations set seo_description = 'Monastir se trouve sur la côte est de la Tunisie, dans le Sahel.' where slug = 'monastir';
update destinations set seo_description = 'Djerba est une île du sud-est tunisien, au large du golfe de Gabès.' where slug = 'djerba';
update destinations set seo_description = 'Lyon, en France, se situe au confluent du Rhône et de la Saône.' where slug = 'lyon';

commit;
