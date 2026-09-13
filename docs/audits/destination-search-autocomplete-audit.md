# Easy2Book — Audit "Destination Search / Autocomplete unifié" (Phase Premium 2, chantier 3)

**Portée** : cartographie factuelle de la manière dont chaque module du
storefront public implémente aujourd'hui la recherche/sélection de
destination (ville, aéroport, zone), préalable à une future unification —
pas de conception, pas de code, lecture seule.

**Contexte** : chantier 1 (`docs/audits/destination-model-audit.md`) a
cartographié la géographie en base (6 systèmes d'ID non réconciliés) ;
chantier 2 a créé le Canonical Destination Model (`destinations` +
`destination_external_refs`, `lib/db/schema/destinations.ts`,
`drizzle/manual/0054_destinations.sql`), déjà en base mais **rebranché sur
aucun module**. Ce chantier 3 documente le **front-end** de la recherche
destination module par module, angle non couvert par le chantier 1 (qui
s'est concentré sur le back-end/schéma).

**Méthode** : lecture exhaustive des composants de recherche
(`components/**/*search*.tsx`, `components/booking-engine.tsx`), de leurs
hooks/état associés (`lib/*/search-state.ts`, `hooks/use-cities.ts`), des
routes API qu'ils appellent (`app/api/hotels/cities/route.ts` et
équivalents), des pages serveur qui alimentent les formulaires en données
réelles (`app/(public)/[locale]/{car,transferts}/page.tsx`), des fichiers
de traduction (`messages/{fr,en,ar}.json`) et des primitives UI partagées
(`components/ui/{select,command,popover}.tsx`).

---

## 1. Hôtels Tunisie (myGo)

**Composant** : `components/hotels-tunisie-search.tsx` — champ "City
Autocomplete" lignes 286-357.

- Pattern UI : `Popover` (Radix) + `Command`/`CommandInput`/`CommandList`
  (cmdk) — `role="combobox"`, `aria-expanded`, `aria-controls` sur le
  déclencheur (`hotels-tunisie-search.tsx:291-295`), `CommandEmpty` pour le
  cas "aucun résultat" (`:323-329`, 3 états distincts : chargement, erreur,
  aucune ville trouvée).
- Données : hook `hooks/use-cities.ts` — `useQuery` TanStack avec
  `staleTime: 1000 * 60 * 60 * 24` (24h, `use-cities.ts:28`) et
  `placeholderData: FALLBACK` (3 villes en dur, `:18-22`) affiché
  immédiatement pendant le premier chargement réseau.
- Endpoint : `GET /api/hotels/cities` (`app/api/hotels/cities/route.ts`) —
  `export const revalidate = 86400` (`:13`), appelle
  `getMyGoClient().listCities()` puis filtre
  `.filter((c) => !c.countryName || c.countryName === "Tunisie")` (`:46`,
  même filtre applicatif déjà identifié au chantier 1) et renvoie
  `Cache-Control: public, max-age=86400, immutable` (`:53`). Réponse triée
  alphabétiquement (`:47`).
- Filtrage à la frappe : **aucun appel réseau par frappe** — la liste
  complète (36 villes) est chargée une fois (cache 24h côté client ET
  côté HTTP) puis filtrée **en mémoire côté navigateur** par cmdk
  (`CommandInput`, filtrage fuzzy intégré à la librairie). Pas de
  debounce nécessaire car pas de requête réseau déclenchée par la frappe.
- ID transmis : `cityId` numérique myGo dans l'URL de résultats
  (`params.set("cityId", ...)`, `hotels-tunisie-search.tsx:187`, ainsi que
  `city` = nom texte, `:188`) — c'est le `mygo_city` du Canonical
  Destination Model (`destination_external_refs.module = 'mygo_city'`).
- Widget "Modifier" : `components/search-header.tsx:156-171` réutilise
  **le même composant** `HotelsTunisieSearch` dans un `Sheet`, avec
  préremplissage depuis les query params (`cityId`/`city`,
  `search-header.tsx:43-44`) — pas de logique dupliquée.

---

## 2. Hôtels Monde

**Composant formulaire dédié** : `components/hotels-monde/world-hotel-search.tsx`.
**État canonique** : `lib/hotels-monde/search-state.ts`.

- Pattern UI : `<Select>` (Radix `components/ui/select.tsx`) — liste
  fermée, **pas d'autocomplete texte libre** (`world-hotel-search.tsx:79-90`,
  itère `POPULAR_DESTINATIONS`).
- Données : `POPULAR_DESTINATIONS` — **tableau statique en dur**, 10
  entrées (`search-state.ts:19-30`), confirmant le constat du chantier 1
  (`destination-model-audit.md:108`). Aucun appel réseau, aucun backend —
  liste importée directement dans le composant client.
- Correspondance texte libre → valeur connue :
  `matchDestination()` (`search-state.ts:44-54`) — égalité stricte sur
  `value` puis recherche par sous-chaîne dans `label` ; retourne `""` si
  rien ne correspond (jamais de valeur inventée).
- Aucun état "aucun résultat" visible dans `world-hotel-search.tsx` — le
  `<Select>` ne peut par construction afficher que les 10 valeurs
  connues ; un texte non reconnu envoyé par un autre point d'entrée
  (widget accueil) produit un toast d'erreur (`toastSelectDestination`,
  `world-hotel-search.tsx:47-50`) plutôt qu'un état vide dans la liste.
- ID transmis : `value` slug texte (`destination=istanbul`, etc.,
  `search-state.ts:56-58,126-136`) — le `hotels_monde_slug` du Canonical
  Destination Model.
- i18n : **labels non traduits** — `POPULAR_DESTINATIONS` contient des
  chaînes françaises en dur ("Istanbul, Turquie", "Dubaï, Émirats Arabes
  Unis", etc., `search-state.ts:20-29`), aucun appel `useTranslations`
  dans ce fichier ; `world-hotel-search.tsx` affiche `d.label` tel quel
  (`:86`) — donc en FR même si `next-intl` est configuré en EN/AR pour le
  reste de la page (labels de champs traduits via `t("destinationLabel")`
  etc., mais pas les noms de destination eux-mêmes).

---

## 3. Packages / Voyages Organisés

**Composant** : `components/packages/package-search.tsx`.

- Pattern UI : `<Select>` (Radix) — liste fermée
  (`package-search.tsx:49-60`).
- Données : `DESTINATIONS` — tableau statique de **8 slugs**
  (`package-search.tsx:18`), liste différente de celle Hôtels Monde
  (constat déjà noté au chantier 1, `destination-model-audit.md:109`).
- i18n : **labels traduits** — contrairement à Hôtels Monde, les libellés
  passent par `t(`destinations.${d}`)` (`package-search.tsx:56`), avec des
  clés `Packages.destinations.*` présentes et traduites dans les 3
  locales (`messages/fr.json`, `messages/en.json`, `messages/ar.json` —
  ex. `istanbul` → "Istanbul"/"Istanbul"/"إسطنبول").
- Aucun état "aucun résultat" — liste fermée, pas de recherche texte.
- ID transmis : `destination` slug texte (`package-search.tsx:33`) — le
  `packages_slug` du Canonical Destination Model.
- Filtrage réel côté page résultats : recherche par `ILIKE` sur le titre
  (commentaire `components/booking-engine.tsx:864-865` : "Doit
  correspondre aux clés DESTINATION_SEARCH_TERMS de app/packages/page.tsx
  — recherche par ILIKE sur le titre, pas de colonne destination dédiée")
  — confirme le constat chantier 1 : pas de colonne géo structurée sur
  Packages.

---

## 4. Omra

- **Aucune notion de destination géographique recherchable** — le module
  Omra n'a qu'une ville figée en base : `omraHotels.city varchar(16)`,
  valeurs `'mecca'`/`'medina'` (`lib/db/schema/omra.ts:245-246`), jamais
  exposée comme filtre de recherche public.
- Composants `components/omra/omra-search.tsx` (page `/omra`) et
  `OmratyForm` dans `components/booking-engine.tsx:803-862` (widget
  accueil, onglet "omraty") ne proposent que deux filtres : `programme`
  (enum `omra_package_type` — omra/ramadan/umrah_plus/hajj) et `month`
  (1-12) — **aucun champ destination** dans l'un ou l'autre
  (`omra-search.tsx:23-98`, `booking-engine.tsx:803-862`).

---

## 5. Attractions

**Page** : `app/(public)/[locale]/attractions/page.tsx`.

- Pattern UI : **texte libre**, pas d'autocomplete — `<Input type="text"
  name="q">` dans un `<form action="/attractions">` classique (soumission
  serveur GET, pas de JavaScript côté client), `page.tsx:120-131`.
- Pas de suggestions, pas de liste déroulante, pas de debounce (le champ
  ne déclenche rien avant soumission du formulaire).
- Requête réelle : `ilike(catalogActivities.title, ...)` **OU**
  `ilike(catalogActivities.location, ...)` (`page.tsx:47-52`) — confirme
  le constat chantier 1 : `catalog_activities.location` est un champ texte
  libre non structuré (`destination-model-audit.md:26`), interrogé mais
  jamais présenté comme un champ "destination" dédié à l'utilisateur —
  c'est une recherche plein-texte multi-critères (titre + lieu confondus).
- État "aucun résultat" : géré, `t("noResultsForQuery", { query: q })`
  vs `t("emptyState")` (`page.tsx:139`) — mais c'est un résultat de page
  (liste vide après soumission), pas une réaction en direct à la frappe.
- Widget accueil : `AttractionsForm` dans `components/booking-engine.tsx:963-995`
  — même pattern, `<input type="text">` libre, aucune suggestion.

---

## 6. Vols

**Composant page dédiée** : `components/vols/flight-search.tsx`.
**État canonique** : `lib/vols/search-state.ts`.

- Pattern UI (page `/vols`, `flight-search.tsx`) : **deux `<Select>`**
  (origine et destination), liste fermée de `AIRPORTS`
  (`flight-search.tsx:133-144` origine, `:154-164` destination — cette
  dernière filtre en plus `AIRPORTS.filter((a) => a.code !== origin)`
  pour exclure l'aéroport déjà choisi comme origine).
- Données : `AIRPORTS` — tableau statique de **11 codes IATA**
  (`search-state.ts:33-45`), confirmant le chantier 1
  (`destination-model-audit.md:110`). Labels en dur français
  ("Tunis–Carthage (TUN)", etc.) non traduits via `next-intl`.
- Widget accueil (`VolsForm`, `components/booking-engine.tsx:432-662`) :
  UX **différente** — `origin`/`destination` sont des **`<Input>` texte
  libre** (`:526-544`), valeur par défaut `"Tunis (TUN)"` /
  `"Istanbul (IST)"`, **pas de liste déroulante ni de suggestions**.
- Réconciliation des deux formats : `parseAirportInput()`
  (`search-state.ts:75-80`) accepte indifféremment un code nu ("TUN") ou
  le format libre "Ville (CODE)" envoyé par le widget accueil, extrait le
  code IATA par regex, et **n'est pas restreint à la liste `AIRPORTS`**
  (tout code 3 lettres bien formé est accepté — commentaire
  `search-state.ts:70-73`).
- ID transmis : code IATA (`destination=IST`, etc.) — le `iata` du
  Canonical Destination Model.
- Aucun état "aucun résultat" dédié : les deux `<Select>` sont des listes
  fermées ; le widget accueil (texte libre) ne valide le format qu'à la
  soumission (`toast.error` si origine = destination,
  `booking-engine.tsx:462-467`), sans vérifier que le code existe
  réellement.

---

## 7. Car / Transferts

Les deux modules partagent le même pattern : `<Select>` alimenté par des
données **réellement chargées depuis la base côté serveur** (pas des
fixtures statiques), scopées par `agencyId` (confirmant le chantier 1).

### Transferts

- `components/transfer/transfer-search.tsx:81-119` — deux `<Select>`
  (`fromZone`/`toZone`) itérant la prop `zones: CatalogTransferZone[]`.
- Alimentation réelle : `app/(public)/[locale]/transferts/page.tsx` —
  requête `db.select().from(catalogTransferZones).where(eq(status,
  "active")).orderBy(name)` (lignes ~28-32), sans filtre `agencyId`
  explicite visible dans cet extrait (à vérifier au chantier
  architecture si pertinent).
- État "aucune zone disponible" : géré (`t("noZoneAvailable")`,
  `transfer-search.tsx:88`) — mais c'est un état de catalogue vide, pas
  une réaction à une frappe utilisateur (pas de champ texte).
- ID transmis : `from`/`to` = `uuid` de `catalog_transfer_zones.id`
  (`transfer-search.tsx:57-64`) — **aucun équivalent possible** dans le
  Canonical Destination Model actuel : ces zones n'ont aucune colonne
  ville/pays (confirmé chantier 1, `destination-model-audit.md:24`), donc
  pas de `destination_external_refs.module` envisageable en l'état.

### Car

- `components/car/car-search.tsx:151-207` — deux `<Select>`
  (`pickupLocation`/`dropoffLocation`) itérant la prop
  `locations: CarLocation[]`.
- Alimentation réelle : `app/(public)/[locale]/car/page.tsx:45-60` —
  requête `carLocations`/`carCategories` filtrées par
  `eq(carLocations.agencyId, agencyId)` où `agencyId` = agence "OTA
  directe" résolue via `getDefaultAgencyId()` (commentaire
  `car/page.tsx:5-11` : la vitrine publique représente la flotte
  Easy2Book elle-même, pas un marketplace multi-agences).
- **Commentaire explicite dans le code** (`car/page.tsx:13-17`) : avant
  cette page, `CarSearch` utilisait une liste `LOCATIONS`/`CATEGORIES`
  codée en dur qui **ne correspondait à aucune ligne réelle** de
  `car_locations`/`car_categories`, et la recherche menait de toute façon
  à un 404 (`/car/search` n'existait pas encore) — bug historique
  documenté et corrigé dans cette page, mais dont une trace fossile
  subsiste dans le widget accueil (voir §8).
- ID transmis : `pickup`/`dropoff` = `uuid` de `car_locations.id`
  (`car-search.tsx:124-131`) — même constat que Transferts : aucune
  colonne ville/pays sur `car_locations` (confirmé chantier 1), donc pas
  de mapping direct possible vers `destinations` aujourd'hui.

---

## 8. Widget de recherche accueil (`components/booking-engine.tsx`)

- **Onglets réellement affichés** (`tabsConfig`, lignes 108-114, 5
  entrées) : `hotels-tunisie`, `hotels-monde`, `omraty`,
  `voyages-organises`, `attractions`. Le switch `ActiveModuleForm`
  (lignes 124-143) ne route que vers ces 5 formulaires.
- **Code mort constaté** : `VolsForm` (`:432-662`), `TransfertsForm`
  (`:1001-1113`) et `CarForm` (`:1131-1336`) sont définis dans ce même
  fichier mais **ne sont référencés nulle part** — ni dans `tabsConfig`,
  ni dans `ActiveModuleForm`, ni ailleurs (`grep` sur ces trois noms dans
  le fichier ne retourne que leur définition). Le fichier
  `components/booking-engine.tsx` lui-même n'est importé que par
  `app/(public)/[locale]/page.tsx:2`. Ces trois formulaires sont donc
  inatteignables par un utilisateur réel dans l'état actuel du code —
  vestiges d'une navigation antérieure plus large (le commentaire
  `booking-engine.tsx:98-107` documente explicitement ce recentrage :
  "Vols/Transferts/Car restent des modules réels [...] mais ne sont plus
  mis en avant dans l'onglet de recherche principal").
- **Un composant, plusieurs champs destination selon l'onglet** : chaque
  `*Form` interne définit son propre state et son propre rendu — aucun
  sous-composant `<DestinationField>` ou équivalent n'est partagé entre
  ces formulaires (seul le **style** `FIELD_SHELL`/`FieldLabel` est
  partagé, voir §9).
- **Le `CarForm` mort utilise une liste `CAR_LOCATIONS` codée en dur**
  (`booking-engine.tsx:1115-1121`, 5 entrées : `tunis-airport`,
  `enfidha`, `djerba-airport`, `hammamet`, `sousse`) — c'est exactement
  le même type de liste fossile que celle documentée comme bug corrigé
  dans `car/page.tsx:13-17` (§7), mais ici le code mort n'a **jamais été
  corrigé ni supprimé** puisqu'il n'est plus exécuté.
- **Réconciliation partielle documentée pour Car** :
  `components/car/car-search.tsx:20-51` contient une table de
  correspondance (`AIRPORT_CODE_FROM_HOME`, `CITY_FROM_HOME`,
  `CATEGORY_CODE_FROM_HOME`) commentée comme faisant le pont entre les
  slugs fixes qu'enverrait le widget accueil et les vrais `uuid` de
  `car_locations`/`car_categories` — code défensif présent bien que
  `CarForm` (source théorique de ces slugs) soit lui-même mort ; ce
  mapping ne peut donc être déclenché aujourd'hui que par une URL
  construite manuellement.
- **Hôtels Tunisie** : le widget accueil réutilise directement le
  composant `HotelsTunisieSearch` complet (import dynamique,
  `booking-engine.tsx:71-81`) — pas de réimplémentation, seul module dans
  ce cas.
- **Hôtels Monde** : `HotelsMondeForm` (`:664-792`) réimplémente sa propre
  UI — **texte libre** (`<Input name="destination">`,
  `:713-719`) passé à `matchDestination()` (import direct de
  `lib/hotels-monde/search-state.ts:63`) — UX différente du `<Select>` de
  `components/hotels-monde/world-hotel-search.tsx` pour la même donnée
  sous-jacente (`POPULAR_DESTINATIONS`).
- **Voyages Organisés** : `VoyagesOrganisesForm` (`:883-961`) réutilise un
  `<Select>` sur `PACKAGE_DESTINATION_VALUES`
  (`booking-engine.tsx:868-877`, dupliqué depuis `DESTINATIONS` de
  `package-search.tsx:18` — même 8 valeurs, tableau redéclaré séparément
  plutôt qu'importé).
- **Mobile** : toute la carte de recherche (tous champs confondus, pas
  seulement la destination) bascule dans un `Drawer` (bottom-sheet Radix,
  `booking-engine.tsx:255-321`) en dessous du breakpoint `lg`. Aucun
  traitement mobile spécifique au champ destination lui-même — c'est le
  même `Popover`/`Select`/`Input` qu'en desktop, simplement rendu à
  l'intérieur du tiroir.

---

## 9. Synthèse transversale

### 9.1 Composants distincts implémentant une logique de sélection de destination

| Composant | Fichier | Pattern | Données |
|---|---|---|---|
| `HotelsTunisieSearch` (ville) | `components/hotels-tunisie-search.tsx:286-357` | Popover + cmdk Command (combobox filtrable) | API `/api/hotels/cities`, cache 24h |
| `WorldHotelSearch` (destination monde) | `components/hotels-monde/world-hotel-search.tsx:79-90` | `<Select>` | `POPULAR_DESTINATIONS` statique (10) |
| `PackageSearch` (destination) | `components/packages/package-search.tsx:49-60` | `<Select>` | `DESTINATIONS` statique (8) |
| `FlightSearch` (origine + destination) | `components/vols/flight-search.tsx:133-164` | 2× `<Select>` | `AIRPORTS` statique (11) |
| `TransferSearch` (from/to zone) | `components/transfer/transfer-search.tsx:81-119` | 2× `<Select>` | `catalog_transfer_zones` (DB réelle) |
| `CarSearch` (pickup/dropoff) | `components/car/car-search.tsx:151-207` | 2× `<Select>` | `car_locations` (DB réelle) |
| Attractions (recherche texte) | `app/(public)/[locale]/attractions/page.tsx:120-131` | `<Input type="text">` + submit serveur | `catalog_activities` (ILIKE) |
| `VolsForm` (widget accueil, **mort**) | `components/booking-engine.tsx:526-544` | 2× `<Input>` texte libre | aucune (texte brut) |
| `HotelsMondeForm` (widget accueil) | `components/booking-engine.tsx:713-719` | `<Input>` texte libre + `matchDestination()` | `POPULAR_DESTINATIONS` (fuzzy match) |
| `OmratyForm` (widget accueil) | `components/booking-engine.tsx:803-862` | aucun champ destination | — |
| `VoyagesOrganisesForm` (widget accueil) | `components/booking-engine.tsx:883-961` | `<Select>` | `PACKAGE_DESTINATION_VALUES` (dupliqué) |
| `AttractionsForm` (widget accueil) | `components/booking-engine.tsx:963-995` | `<Input type="text">` | aucune |
| `TransfertsForm` (widget accueil, **mort**) | `components/booking-engine.tsx:1039-1076` | 2× `<Select>` | prop `zones` (jamais alimentée en pratique, code inatteignable) |
| `CarForm` (widget accueil, **mort**) | `components/booking-engine.tsx:1184-1216` | `<Select>` | `CAR_LOCATIONS` statique fossile (5) |

**Total : 14 implémentations distinctes** (11 réellement atteignables par
un utilisateur + 3 mortes) réparties sur 9 fichiers. **Aucun composant
générique `<DestinationAutocomplete>` ou équivalent partagé n'existe** —
chaque module (et chaque widget accueil vs page dédiée pour le même
module) réimplémente sa propre UI et son propre state. Le seul élément
réellement partagé entre modules est **le style visuel**
(`FIELD_SHELL`/`FieldLabel`, `components/search-field.tsx`, utilisé par
`booking-engine.tsx` et `hotels-tunisie-search.tsx`, commentaire
`search-field.tsx:1-10`), pas la logique.

### 9.2 Endpoints API renvoyant une liste de destinations interrogeable

**Un seul** trouvé dans tout le storefront : `GET /api/hotels/cities`
(`app/api/hotels/cities/route.ts`). Tous les autres modules consomment
soit une liste statique importée côté client (`POPULAR_DESTINATIONS`,
`DESTINATIONS`, `AIRPORTS`, `CAR_LOCATIONS`), soit une requête Drizzle
directe exécutée côté serveur dans le composant page
(`car_locations`/`catalog_transfer_zones`, pas exposée via une route API
publique dédiée — chargée une fois au rendu de la page, pas interrogeable
dynamiquement par le client).

### 9.3 Gestion du "aucun résultat"

Disparate, sans convention commune :

- **Hôtels Tunisie** : seul module avec un vrai état "recherche en cours →
  aucun résultat trouvé" réactif à la frappe (`CommandEmpty`,
  3 sous-états : chargement/erreur/vide).
- **Attractions** : état vide géré mais uniquement après soumission de
  formulaire (rendu serveur), pas en direct.
- **Hôtels Monde / Packages / Vols (page dédiée)** : pas d'état "aucun
  résultat" possible côté sélection — listes fermées, on ne peut
  sélectionner qu'une valeur existante. L'échec se déplace à la
  validation (`toast.error` si champ vide) plutôt qu'à la recherche
  elle-même.
- **Vols (widget accueil), Hôtels Monde (widget accueil)** : texte libre
  non validé en direct — une saisie invalide n'est détectée qu'à la
  soumission (`matchDestination` retourne `""`, `toast.error`).
- **Transferts / Car** : pas d'état "aucun résultat de recherche" — le
  seul état vide possible est "aucune zone/lieu disponible dans le
  catalogue" (catalogue vide côté agence), pas une réaction à une saisie.

### 9.4 Debounce / appels réseau par frappe

**Aucun module n'effectue d'appel réseau à chaque frappe.** Le seul appel
réseau lié à la destination (`/api/hotels/cities`) est déclenché une fois
par montage de composant (`useQuery`, `hooks/use-cities.ts:25-30`), avec
`staleTime` 24h — le filtrage pendant la frappe se fait ensuite
entièrement en mémoire côté client (cmdk). Tous les autres modules
utilisent des données déjà en mémoire (listes statiques importées, ou
props reçues du serveur au rendu de la page) — donc **aucun besoin de
debounce nulle part dans le code actuel**, car aucune recherche-as-you-type
contre un serveur n'existe.

### 9.5 Accessibilité (pattern ARIA)

Deux patterns coexistent, non unifiés :

1. **cmdk Command (Hôtels Tunisie uniquement)** : `role="combobox"`,
   `aria-expanded`, `aria-controls` explicites sur le déclencheur
   (`hotels-tunisie-search.tsx:291-295`), navigation clavier native cmdk
   (flèches, Entrée, Échap) sur une liste filtrable en direct.
2. **Radix Select (tous les autres modules avec choix fermé)** — ARIA
   géré nativement par le primitive Radix (`components/ui/select.tsx`),
   mais c'est un pattern différent : liste fermée, pas de filtrage texte,
   navigation par flèches/lettre-jump plutôt que recherche live.

`components/ui/command.tsx` (wrapper cmdk) n'est importé que par
`hotels-tunisie-search.tsx` (`grep` confirmé) — aucun autre module ne
l'utilise, alors même que c'est le seul pattern à offrir une vraie
recherche-en-tapant avec listbox filtré. Les champs texte libre (Vols et
Hôtels Monde du widget accueil, Attractions) n'ont **aucun pattern ARIA
combobox** — ce sont de simples `<input>`/`<Input>` sans `role`,
`aria-expanded` ni liste de suggestions associée.

### 9.6 i18n des libellés de destination

| Source | Traduit FR/EN/AR ? | Preuve |
|---|---|---|
| Villes Hôtels Tunisie (myGo) | Non déterminable avec certitude — noms retournés tels quels par `/api/hotels/cities`, pas de clé `next-intl` visible dans `hotels-tunisie-search.tsx` pour `city.name`/`city.region` | `hotels-tunisie-search.tsx:341,343` (affiche `city.name`/`city.region` bruts) |
| Destinations Hôtels Monde | **Non** — chaînes françaises en dur | `lib/hotels-monde/search-state.ts:19-30`, aucun `useTranslations` dans ce fichier |
| Destinations Packages | **Oui** — clés `Packages.destinations.*` | `messages/{fr,en,ar}.json`, `package-search.tsx:56` |
| Aéroports Vols | Non — labels français en dur | `lib/vols/search-state.ts:33-45` |
| Zones Transferts / Lieux Car | Non — colonne `name` unique en base, pas de `name_en`/`name_ar` | `lib/db/schema.ts:941` (`catalogTransferZones.name`), `lib/db/schema/cars.ts:99` (`carLocations.name`) |
| Libellés de champs (labels/placeholders, hors noms de destination) | Oui, partout — via `next-intl` (`useTranslations`) | présent dans tous les composants revus |

Seul le module Packages traduit réellement les **noms de destination**
eux-mêmes dans les 3 langues ; tous les autres modules traduisent les
libellés de champs (labels, placeholders, boutons) mais affichent les noms
de lieux en français brut (listes statiques) ou tels quels depuis la
source (myGo, DB agence).

### 9.7 Mobile

Aucun module n'implémente de UX spécifique **au champ destination**
lui-même sur petit écran (pas de plein-écran ni de bottom-sheet dédié à
la sélection de ville/destination). Le seul comportement mobile observé
est au niveau du **widget accueil dans son ensemble** :
`components/booking-engine.tsx:255-321` bascule tout le formulaire
(tous champs, pas seulement destination) dans un `Drawer` Radix
(bottom-sheet) sous le breakpoint `lg`. `HotelsTunisieSearch` (page
dédiée `/hotels`, widget "Modifier" de `search-header.tsx`, et onglet
accueil) utilise le même `Popover` ancré, sans variante responsive
(`components/ui/popover.tsx` — pas de media query, largeur fixe
`w-[320px]`/`w-72`).

---

## 10. Tableau de correspondance vers le Canonical Destination Model

| Module | Champ(s) actuel(s) (param URL/state) | Module `destination_external_refs` cible | Mappable aujourd'hui ? |
|---|---|---|---|
| Hôtels Tunisie | `cityId` (numérique myGo) | `mygo_city` | **Oui** — correspondance directe, c'est la clé pivot déjà retenue au chantier 2 |
| Hôtels Monde | `destination` (slug, ex. `istanbul`) | `hotels_monde_slug` | **Oui** — la table `destination_external_refs` a déjà ce module prévu ; nécessite un mapping manuel des 10 slugs vers des lignes `destinations` (peuvent ne pas exister encore si la ville n'est pas tunisienne) |
| Packages / Voyages Organisés | `destination` (slug, ex. `casablanca`) | `packages_slug` | **Oui** — module déjà prévu ; les 8 slugs sont différents de ceux d'Hôtels Monde malgré des noms proches (constat chantier 1), mapping à faire séparément |
| Vols | `origin`/`destination` (code IATA) | `iata` | **Oui** — module déjà prévu ; 11 codes, dont plusieurs correspondent à des villes déjà couvertes par myGo (ex. `TUN`) et d'autres non (ex. `CDG`, `FCO`) |
| Omra | *(aucun champ destination)* | — | **Non applicable** — pas de recherche géographique dans ce module ; seule donnée géo est `omraHotels.city` (`mecca`/`medina`), non exposée comme filtre |
| Attractions | `q` (texte libre, titre + lieu confondus) | — | **Non mappable en l'état** — `catalog_activities.location` est un champ texte libre non structuré (constat chantier 1), aucune colonne dédiée à normaliser avant tout mapping |
| Car | `pickup`/`dropoff` (`uuid` de `car_locations.id`) | *(aucun module prévu dans le schéma actuel)* | **Non mappable en l'état** — `car_locations` n'a aucune colonne ville/pays structurée reliable à une ligne `destinations` (confirmé chantier 1) ; nécessiterait un nouveau module dans le CHECK de `destination_external_refs` **et** un enrichissement du schéma `car_locations` |
| Transferts | `from`/`to` (`uuid` de `catalog_transfer_zones.id`) | *(aucun module prévu dans le schéma actuel)* | **Non mappable en l'état** — même situation que Car : `catalog_transfer_zones` n'a aucun rattachement ville (confirmé chantier 1) |

---

## Constats clés

1. **Aucun composant d'autocomplete générique partagé n'existe.** 14
   implémentations distinctes de sélection de destination ont été
   recensées sur 9 fichiers, dont 3 mortes (inatteignables) ; seul le
   style visuel (`FIELD_SHELL`) est mutualisé, jamais la logique.
2. **Un seul module a une vraie recherche-en-tapant contre des données
   réelles** : Hôtels Tunisie (`cmdk` Command + `/api/hotels/cities`,
   cache 24h). Tous les autres modules utilisent soit des listes fermées
   statiques (`<Select>`), soit du texte libre non guidé, soit des
   `<Select>` alimentés une fois par le serveur — jamais de recherche
   réseau réactive à la frappe ailleurs, donc aucun besoin de debounce
   observé nulle part dans le code actuel.
3. **Le widget de recherche accueil (`booking-engine.tsx`) contient 3
   formulaires morts** (Vols, Transferts, Car) — définis mais jamais
   routés depuis le recentrage commercial documenté dans le code
   (`booking-engine.tsx:98-107`). L'un d'eux (`CarForm`) contient une
   liste de lieux fossile (`CAR_LOCATIONS`) qui reproduit exactement le
   bug déjà corrigé côté page dédiée (`car/page.tsx:13-17`), sans que
   personne n'ait eu besoin de le corriger puisque le code est
   inatteignable.
4. **Le même module peut avoir deux UX différentes pour la même
   destination** selon le point d'entrée : Hôtels Monde et Vols ont
   chacun un `<Select>` liste fermée sur leur page dédiée, mais un champ
   texte libre avec matching flou sur le widget accueil — deux
   comportements coexistants pour la même donnée sous-jacente
   (`POPULAR_DESTINATIONS`/`AIRPORTS`).
5. **Seul Packages traduit réellement les noms de destination** en
   FR/EN/AR ; Hôtels Monde et Vols affichent des noms de lieux en
   français en dur malgré `next-intl` déjà configuré et utilisé pour les
   libellés de champs dans les mêmes composants.
6. **Car et Transferts n'ont aucun chemin de mapping possible** vers le
   Canonical Destination Model actuel, ni côté champ front (`uuid`
   opaque de zone/lieu, sans nom de ville structuré), ni côté schéma
   (`destination_external_refs.module` ne prévoit aujourd'hui que
   `mygo_city`/`hotels_monde_slug`/`packages_slug`/`iata` — confirmé
   `drizzle/manual/0054_destinations.sql:76`) : un mapping éventuel
   dépendrait d'abord d'un enrichissement du schéma `car_locations`/
   `catalog_transfer_zones` eux-mêmes, hors du périmètre du modèle déjà
   créé au chantier 2.
7. **Omra et Attractions n'ont structurellement rien à mapper** : Omra
   n'expose aucun filtre géographique public ; Attractions interroge un
   champ texte libre non structuré (`catalog_activities.location`) qui
   devrait d'abord être normalisé avant qu'un mapping ait un sens.
8. **Les deux patterns ARIA (cmdk combobox filtrable vs Radix Select liste
   fermée) coexistent sans convention explicite** sur quand utiliser
   l'un ou l'autre — le choix semble avoir suivi la disponibilité d'un
   backend interrogeable (Hôtels Tunisie) plutôt qu'une décision de
   design system.

---

*Prochaine étape (chantier 3, suite — architecture, distincte et pas
commencée) : conception de l'unification de la recherche/autocomplete de
destination à partir de ces constats, avec validation utilisateur séparée
avant tout code.*
