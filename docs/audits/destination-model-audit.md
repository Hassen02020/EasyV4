# Easy2Book — Audit "Destination" (Phase Premium 2, chantier 1)

**Portée** : cartographie factuelle de tout ce qui existe aujourd'hui en matière de
géographie/destination dans le code — préalable obligatoire à la conception du
Canonical Destination Model (chantier 2). Lecture seule, zéro modification de code.

**Méthode** : recherche exhaustive dans `lib/db/schema.ts` + `lib/db/schema/*.ts`,
les migrations `drizzle/**/*.sql`, le catalogue myGo (fixtures + mappers), les
tables `car_locations`/`catalog_transfer_zones`, les scripts de seed, l'admin
back-office, et le SEO existant (`generateMetadata`, sitemap).

---

## 1. Tables géographiques dans le schéma DB

**Aucune table `cities`, `countries`, `regions` ou `zones` n'existe.** La
géographie est modélisée uniquement en colonnes texte libre éparpillées sur des
tables métier, jamais avec une clé étrangère vers un référentiel partagé :

| Table | Colonnes géo | Fichier:ligne | Type | Consommateur réel |
|---|---|---|---|---|
| `products` | `destination varchar(128)`, `country varchar(64)`, `city varchar(64)` + index `product_destination_idx` | `lib/db/schema.ts:1850-1855,1959` | texte libre, pas de FK | **Aucun** — champ posé, jamais alimenté ni lu par le code applicatif |
| `car_locations` | `city varchar(100)` (texte libre, pas FK), `airportCode`, `lat/lng` | `lib/db/schema/cars.ts:92-126` | texte libre | `lib/cars/actions.ts` (lecture seule) |
| `catalog_transfer_zones` | `name`, `zoneType` (airport/hotel/city/station), `lat/lng` — **aucune colonne ville/pays** | `lib/db/schema.ts:935-950` | aucun rattachement géo | `lib/transfers/actions.ts` (lecture seule) |
| `omra_hotels.city` | `varchar(16)`, valeurs `'mecca'`/`'medina'` | `lib/db/schema/omra.ts:245-246` | énumération à 2 valeurs | module Omra uniquement |
| `catalog_activities.location` | `varchar(200)` | `lib/db/schema.ts:877` | texte libre non structuré | recherche `ILIKE` |
| `reservation_flight.destination`/`.returnDestination` | `varchar(8)` (IATA) | `lib/db/schema.ts:504,508` | code IATA | module Vols |

**Duplication de schéma non migrée** : `lib/db/schema/products.ts:68` définit une
**deuxième table `products`**, distincte de celle réellement migrée
(`lib/db/schema.ts:1831`, migrée dans `drizzle/0003_chemical_slapstick.sql:23`).
Cette deuxième version a une modélisation géo plus riche (`countryCode` ISO,
`coordinates` jsonb `{lat,lng}`) mais **n'est référencée par aucun fichier
applicatif** et `drizzle.config.ts:27` ne pointe que vers `lib/db/schema.ts` — code
mort, à ne jamais confondre avec la vraie table `products`.

---

## 2. Catalogue myGo (fournisseur hôtelier Tunisie)

Structure réelle (`lib/mygo/__fixtures__/listcity.json`, 36 entrées) :

```json
{ "Id": 10, "Name": "Hammamet", "Region": "Cap Bon", "Country": { "Id": 219, "Name": "Tunisie" } }
```

- Vraie hiérarchie fournisseur : **Country{Id,Name} → City{Id,Name,Region}**,
  mappée jusqu'au DTO applicatif (`lib/mygo/mappers.ts:67-76`, `CityDTO`).
- Le catalogue myGo **n'est pas limité à la Tunisie côté fournisseur** — le
  scoping "Tunisie uniquement" est un **filtre applicatif en mémoire** :
  ```ts
  // app/api/hotels/cities/route.ts:43-46
  .filter((c) => !c.countryName || c.countryName === "Tunisie")
  ```
- 36 villes réparties sur **12 régions** (texte libre, ex. "Cap Bon", "Sahel",
  "Djerid"), dont **10 "villes touristiques"** où le catalogue hôtelier réel est
  concentré (`lib/mygo/virtual-supplier/catalog.ts:70`, `TOURISTIC_CITY_IDS`).
- Cette hiérarchie **n'est jamais persistée en base** — elle transite en mémoire
  via `/api/hotels/cities` (cache 24h).

---

## 3. `car_locations` / `catalog_transfer_zones`

Toutes deux **scopées par agence (tenant)**, pas par géographie partagée
(`agencyId uuid NOT NULL references agencies.id`), sans FK vers une ville
canonique. **Aucune ligne de seed trouvée** pour ces deux tables
(`scripts/seed-base-infra.ts`, `scripts/seed-mock-data.ts`), et **aucune
interface d'admin** pour les peupler/gérer (`app/(internal)/admin/**` ne contient
aucun dossier `car`/`transfer`/`location`/`zone`).

---

## 4. Concept unifié de "destination" existant

**Aucun** — ni table, ni enum, ni migration. Seules traces : les colonnes texte
libre déjà listées (§1), plus un commentaire JSDoc mentionnant
`destinations?: string[]` dans le JSONB polymorphique `products.attributes`
(`lib/db/schema.ts:1827,1893`) — non indexable, non structuré.

---

## 5-6. Pages "destination" et SEO

- **Aucune page** `/destinations/[slug]` ou équivalent, même en brouillon.
- **Aucun sitemap** (`app/sitemap.ts` ou équivalent — inexistant).
- `generateMetadata` existe sur 3 pages produit (packages, omra, attractions)
  mais **aucune n'inclut la ville/destination** dans le titre ou la description
  — alors même que `catalogActivities.location` existe déjà en base et n'est
  simplement jamais lu dans `attractions/[slug]/page.tsx:106-107`.

---

## 7. Admin back-office

**Aucun dossier** `cities`/`regions`/`destinations`/`locations`/`zones` dans
`app/(internal)/admin/**`. Aucune interface CRUD géographique n'existe, ni
câblée ni morte.

---

## 8. Volumétrie réelle

| Source | Nombre | Preuve |
|---|---|---|
| Villes myGo (Tunisie) | 36, sur 12 régions | `lib/mygo/__fixtures__/listcity.json` |
| — dont villes touristiques actives | 10 | `catalog.ts:70` |
| Destinations statiques Hôtels Monde | 10 | `lib/hotels-monde/search-state.ts:19-30` |
| Destinations statiques Packages | 8 (liste **différente** de celle Hôtels Monde) | `components/packages/package-search.tsx:18` |
| Aéroports Vols | 11 codes IATA | `lib/vols/search-state.ts:33-45` |
| Car/Transfer locations en base | non déterminable — aucun seed trouvé | — |
| Mock hôtels démo réservations | 8 hôtels / 3 villes, `cityId` **incompatibles** avec les IDs myGo réels (ex. Hammamet=3 ici vs 10 chez myGo) | `scripts/seed-mock-data.ts:147-161` |

**Ordre de grandeur global** : une petite quarantaine de lieux distincts tous
modules confondus, répartis sur **6 systèmes d'identifiants différents et non
réconciliés** :
1. `cityId` numérique myGo (officiel, avec `Country.Id`/`Region`)
2. `value` slug texte Hôtels Monde
3. `value` slug texte Packages (liste différente de la précédente malgré des
   noms similaires)
4. Code IATA Vols
5. `zoneType`/`name` libres Transferts (aucune ville rattachée)
6. `cityId` ad hoc du seed de démo (incompatible avec les IDs myGo réels)

---

## Constats clés pour la conception du Canonical Destination Model (chantier 2)

1. **Aucune fondation réutilisable** : pas de table géo partagée, même morte,
   sur laquelle construire. Tout est à créer.
2. **Six systèmes d'ID non réconciliés** coexistent — la conception devra soit
   choisir une clé pivot (ex. le `cityId` myGo comme référence officielle
   Tunisie), soit un nouveau slug canonique avec table de correspondance
   explicite par module (pas de magie de matching automatique fiable, vu que
   les listes Hôtels Monde et Packages divergent déjà entre elles malgré des
   noms proches).
3. **La seule vraie hiérarchie Pays→Région→Ville existante est côté myGo**, en
   mémoire, filtrée en dur sur "Tunisie" — la réutiliser pour Hôtels Monde
   supposerait de lever ce filtre applicatif, pas une contrainte fournisseur.
4. **Attractions et Packages n'ont aucune colonne géo structurée** exploitable
   pour un backfill automatique — un mapping manuel/semi-assisté sera
   nécessaire (36+18 lieux à rattacher, ordre de grandeur gérable
   manuellement).
5. **`car_locations`/`catalog_transfer_zones` sont scopées par tenant**, sans
   donnée de seed observable et sans admin — leur intégration dans un modèle
   partagé est un chantier à part (dépend de savoir comment/si les agences
   peuplent réellement ces tables en production).
6. **Un champ `products.destination` existe déjà mais est orphelin** (posé,
   jamais lu/écrit) — à ne pas réutiliser en l'état sans vérifier qu'aucun
   effet de bord n'est déjà attendu ailleurs.
7. **Aucun SEO ni page publique n'exploite la destination aujourd'hui** — le
   futur modèle est donc un vrai ajout net, pas une migration d'existant côté
   frontend/SEO.
8. **Toute table canonique nécessitera aussi son admin CRUD** — rien à
   réutiliser côté back-office.

---

*Prochaine étape (chantier 2, distinct — pas commencé) : conception du Canonical
Destination Model (schéma, stratégie de réconciliation des 6 systèmes d'ID,
scope du backfill) à partir de ces constats.*
