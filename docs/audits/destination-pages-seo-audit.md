# Easy2Book — Audit "Pages Destination + SEO" (Phase Premium 2, chantier 4)

**Portée** : cartographie factuelle des aspects nécessaires à la conception
de pages `/destinations/[slug]` + SEO associé, non couverts en détail par
les audits précédents (chantier 1 : géographie générale ; chantier 3 :
recherche/autocomplete). Lecture seule, zéro modification de code, zéro
recommandation d'implémentation.

**Contexte** : chantier 1 a constaté "aucune page `/destinations/[slug]`,
aucun sitemap, `generateMetadata` sur 3 pages produit sans ville dans le
titre/description" (`docs/audits/destination-model-audit.md:85-90`).
Chantier 2 a créé le Canonical Destination Model (`destinations` +
`destination_external_refs`). Chantier 3 a cartographié la recherche/
autocomplete front-end et backfillé 11 pays / 17 villes / 29
correspondances (Hôtels Monde, Packages, Vols — pas myGo/Tunisie). Ce
chantier 4 complète sur : état SEO actualisé, pages produit qui mentionnent
déjà une destination sans lien, contenu réel disponible pour peupler une
page destination, et navigation actuelle.

**Méthode** : recherche exhaustive de `app/sitemap.ts`/`app/robots.ts`/
`public/robots.txt`, de `generateMetadata`/`export const metadata` sur
toutes les pages publiques (`app/(public)/[locale]/**`), de
`application/ld+json`, de `alternates.canonical`/`metadataBase`, lecture de
`i18n/routing.ts`/`i18n/navigation.ts`/`lib/seo/alternate-languages.ts`,
lecture ligne à ligne des pages détail produit (packages, attractions,
hôtels Tunisie, hôtels monde), du Media System (`lib/media/**`,
`drizzle/manual/0052_product_media.sql`), du header/footer/page d'accueil,
et relecture de `drizzle/manual/0055_destinations_seed.sql` pour confirmer
l'état des colonnes `coverMediaUrl`/`seoDescription`.

---

## 1. État actuel du SEO sur le site

### 1.1 Sitemap et robots

- **Aucun `app/sitemap.ts`** (ni équivalent) — `find` sur `sitemap*` dans
  tout le repo (hors `node_modules`/`.git`) ne retourne rien. Toujours vrai
  depuis le chantier 1.
- **Aucun `app/robots.ts` ni `public/robots.txt`** — `find` sur `robots*`
  ne retourne rien ; `public/` ne contient pas de fichier `robots.txt`.
  Aucune config `next-sitemap` dans `next.config.*`/`package.json`.

### 1.2 `generateMetadata` / `export const metadata` — inventaire par page produit publique

| Page | Fichier | Mécanisme | Titre | Description | Contient la ville/destination ? |
|---|---|---|---|---|---|
| Accueil `/` | `app/(public)/[locale]/page.tsx` | **Aucun** — aucune fonction `generateMetadata` ni `export const metadata` sur ce fichier (`page.tsx:1-22`) ; hérite uniquement de `buildSiteMetadata()` posé dans `app/(public)/[locale]/layout.tsx:20-22` | Titre plateforme générique (`lib/seo/site-metadata.ts:5`, ou nom du tenant White Label) | Générique plateforme | Non |
| `/hotels/search` (Hôtels Tunisie) | `app/(public)/[locale]/hotels/search/layout.tsx:15-22` | `generateMetadata` dans un `layout.tsx` dédié (car `page.tsx` est un Client Component, voir commentaire `:10`) | `t("searchMetaTitle")` (clé `next-intl`, dynamique par locale mais pas par ville) | `t("searchMetaDescription")` | Non — clé de traduction fixe, ne reçoit pas la ville recherchée en paramètre |
| `/hotels/[id]` (détail hôtel Tunisie) | `app/(public)/[locale]/hotels/[id]/page.tsx` | **Aucun** — fichier `"use client"` de bout en bout (`:1`), aucun `generateMetadata`/`export const metadata` trouvé | — | — | Non applicable (pas de métadonnées du tout) |
| `/hotels-monde` | `app/(public)/[locale]/hotels-monde/page.tsx:11-13` | `export const metadata` statique | `"Hôtels Monde \| Easy2Book"` | statique (en dur) | Non |
| `/hotels-monde/search` (résultats) | `app/(public)/[locale]/hotels-monde/search/page.tsx` | **Aucun** trouvé | — | — | Non applicable |
| `/packages` | `app/(public)/[locale]/packages/page.tsx:20-22` | `export const metadata` statique | `"Voyages Organisés \| Easy2Book"` | statique | Non |
| `/packages/[slug]` (détail) | `app/(public)/[locale]/packages/[slug]/page.tsx:125-156` | `generateMetadata` dynamique (params) | `` `${pkg.title} — Voyages Organisés \| Easy2Book` `` (`:139`) | `pkg.shortDescription ?? pkg.longDescription ?? fallback` (`:134-137`) | Non — `pkg.title` seul, aucune colonne ville sur `catalog_packages` (confirmé §2 ci-dessous) |
| `/omra` | `app/(public)/[locale]/omra/page.tsx:21-23` | `export const metadata` statique | `"Omraty — Réservez votre Omra \| Easy2Book"` | statique | Non |
| `/omra/[id]` (détail) | `app/(public)/[locale]/omra/[id]/page.tsx:106-127` | `generateMetadata` dynamique | `` `${pkg.name} — Omra \| Easy2Book` `` (`:117`) | dynamique (nom du produit) | Non — aucune mention de `mecca`/`medina` trouvée dans ce fichier (`grep` sur `city\|mecca\|medina` : 0 résultat) |
| `/attractions` | `app/(public)/[locale]/attractions/page.tsx:27-29` | `export const metadata` statique | `"Attractions \| Easy2Book"` | `"Excursions, visites guidées et activités à réserver en ligne en Tunisie."` | Non (générique Tunisie, pas de ville précise) |
| `/attractions/[slug]` (détail) | `app/(public)/[locale]/attractions/[slug]/page.tsx:97-126` | `generateMetadata` dynamique | `` `${activity.title} — Attractions \| Easy2Book` `` (`:109`) | `activity.shortDescription ?? activity.longDescription ?? fallback` (`:106-107`) | **Non dans les métadonnées** — bien que `activity.location` existe et soit maintenant **affiché dans le corps de page** (Badge `MapPin`, `:159-164` — évolution depuis chantier 1, qui constatait `location` jamais lu), il n'est **pas repris** dans `title`/`description` |
| `/vols` | `app/(public)/[locale]/vols/page.tsx:26-28` | `export const metadata` statique | `"Recherche de Vols \| Easy2Book"` | statique | Non |
| `/vols/search`, `/vols/book` | — | Aucun `generateMetadata` trouvé dans ces fichiers | — | — | Non applicable |
| `/car` | `app/(public)/[locale]/car/page.tsx:32-34` | `export const metadata` statique | `"Location de Voiture \| Easy2Book"` | statique | Non |
| `/car/search` | `app/(public)/[locale]/car/search/page.tsx:31-32` | `export const metadata` statique | `"Votre devis de location \| Easy2Book"` | statique | Non |
| `/transferts` | `app/(public)/[locale]/transferts/page.tsx:17-19` | `export const metadata` statique | `"Transferts Aéroport \| Easy2Book"` | statique | Non |
| `/transferts/resultats` | `app/(public)/[locale]/transferts/resultats/page.tsx:27-28` | `export const metadata` statique | `"Votre devis de transfert \| Easy2Book"` | statique | Non |

**Constat mis à jour vs chantier 1** : chantier 1 disait "`generateMetadata`
existe sur 3 pages produit (packages, omra, attractions)". Aujourd'hui la
couverture est **plus large** — statique ou dynamique sur quasiment toutes
les pages publiques listées (13 pages/layouts avec `title`/`description`,
recensées ci-dessus + `panier`, `compte`, `mentions-legales`,
`politique-confidentialite`, `cgv` hors périmètre produit). **Mais le
constat central reste inchangé** : aucune page, statique ou dynamique,
n'inclut une ville/destination dans son `title` ou sa `description`.

### 1.3 `alternates.languages` (hreflang) — fonction et couverture

- Fonction : `buildLanguageAlternates(href)`, définie
  `lib/seo/alternate-languages.ts:13-18`. Construit `{fr, en, ar,
  "x-default"}` via `getPathname({ locale, href })` de
  `i18n/navigation.ts` (lui-même `createNavigation(routing)` de
  `next-intl/navigation`, `i18n/navigation.ts:13-14`) plutôt qu'une
  concaténation manuelle de préfixe — `x-default` pointe vers la variante
  `defaultLocale` (français, `i18n/routing.ts:14`).
- **21 sites d'appel** trouvés (`grep` exhaustif) : `packages` (liste +
  détail), `panier`, `car` (page + search), `omra` (page + détail),
  `attractions` (page + détail), `transferts` (page + résultats),
  `mentions-legales`, `politique-confidentialite`, `compte` (page +
  connexion), `hotels-monde`, `hotels/search` (via `layout.tsx`), `cgv`,
  `vols`. **Absente** sur : accueil (`/`), `/hotels/[id]`,
  `/hotels-monde/search`, `/vols/search`, `/vols/book`,
  `/packages/[slug]/book`, `/attractions/[slug]/book`,
  `/hotels-monde/book` — cohérent avec l'absence totale de metadata sur ces
  pages (§1.2).
- Confirmé par test E2E réel (`e2e/header-footer-navigation.spec.ts:275-296`,
  "Lot 5") : vérifie la présence de balises `<link rel="alternate"
  hreflang>` fr/en/ar sur `/omra` (statique), `/packages/[slug]` (dynamique)
  et `/hotels/search` (gap comblé via `layout.tsx`).

### 1.4 JSON-LD / structured data

**Aucun** — `grep -rl "application/ld+json"` sur tout le repo (hors
`node_modules`) ne retourne aucun fichier. Aucun schema.org nulle part sur
le storefront public.

### 1.5 `<link rel="canonical">`

**Aucune gestion trouvée** — `grep -rn "canonical"` sur tout le repo ne
retourne aucune occurrence (ni `alternates.canonical`, ni balise manuelle).
Aucun `metadataBase` non plus (`grep -rn "metadataBase"` : 0 résultat) —
les URLs relatives passées à `openGraph.url` (ex.
`packages/[slug]/page.tsx:146`) n'ont donc pas de base absolue déclarée au
niveau Next.js Metadata API.

### 1.6 Structure des routes locale-prefixées

- `i18n/routing.ts:12-16` — `defineRouting({ locales: ["fr", "en", "ar"],
  defaultLocale: "fr", localePrefix: "always" })` : **toutes** les locales,
  y compris le français par défaut, ont un préfixe explicite
  (`/fr/...`, `/en/...`, `/ar/...`) — jamais de route sans préfixe pour le
  storefront public.
- Arborescence physique : `app/(public)/[locale]/**` — un unique segment
  dynamique `[locale]` au sommet, résolu par `generateStaticParams()`
  (`app/(public)/[locale]/layout.tsx:28-30`) sur les 3 locales.
- Back-office (`/admin`, `/pro`, `/b2b`, `/mutuelle`, `/login`) est **hors**
  de ce routing (`app/(internal)/**`, jamais enveloppé par
  `NextIntlClientProvider`, cf. commentaire `i18n/routing.ts:8-11`).
- Conséquence directe pour de futures pages destination : le pattern exact
  serait nécessairement `app/(public)/[locale]/destinations/[slug]/page.tsx`
  pour suivre la même convention que toutes les autres routes publiques.

---

## 2. Pages produit existantes qui mentionnent une destination/ville sans page dédiée

| Page | Affiche une ville/destination ? | Comment | Fichier:ligne | Lien cliquable vers une page destination ? |
|---|---|---|---|---|
| `/packages/[slug]` (détail package) | **Non, nulle part** | `catalog_packages` n'a **aucune colonne** ville/pays/destination (schéma vérifié, `lib/db/schema.ts:799-835` — seulement `title`, `shortDescription`, `longDescription`, `departureLocations` texte libre array) ; la page n'affiche que `pkg.departureLocations` ("départ de...", `packages/[slug]/page.tsx:342-347`), jamais une ville d'arrivée/destination | `lib/db/schema.ts:799-835` (schéma), `packages/[slug]/page.tsx:342-347` (affichage) | Non |
| `/attractions/[slug]` (détail attraction) | **Oui** | `activity.location` (texte libre, `catalog_activities.location varchar(200)`) affiché en Badge avec icône `MapPin`, en haut de page | `attractions/[slug]/page.tsx:159-164` | **Non** — texte brut dans un `<Badge>`, pas un `<Link>` |
| `/hotels-monde/search` (résultats) | **Oui** | `offer.city`/`offer.country` affichés par carte (`:104`, `` `{offer.city}, {offer.country}` ``) ; en-tête de résultats `t("hotelsInCity", { city: state.city, country: state.country })` (`:179`) ; lien "Modifier la recherche" vers `/hotels-monde?destination=${state.destination}` (`:193`, retour au formulaire, pas vers une page destination) | `world-hotel-results-content.tsx:67,104,179,193` | Non — le seul lien lié à la ville renvoie au formulaire de recherche, pas à une fiche destination |
| `/hotels-monde` (détail hôtel monde) | Non déterminable comme page séparée — pas de route `/hotels-monde/[id]` trouvée dans l'arborescence (`app/(public)/[locale]/hotels-monde/{book,search}` seulement) | — | — | — |
| `/hotels/search` (résultats Hôtels Tunisie) | **Oui** | `cityName` (texte, depuis `searchParams.get("city")`, fallback `"Hammamet"`) passé à `<SearchHeader city={cityName} .../>` | `hotels/search/page.tsx:178,268` | Non — pas de lien détecté vers une fiche destination dans cet extrait |
| `/hotels/[id]` (détail hôtel Tunisie, myGo) | **Oui** | `hotel.cityName`, `hotel.region`, `hotel.cityId` (numérique myGo) affichés en texte (`[hotel.address, hotel.cityName, hotel.region].filter(Boolean).join(", ")`) ; `cityId` réutilisé uniquement pour reconstruire une query vers `/hotels/search` (`:314-315,321`) | `hotels/[id]/page.tsx:553-562` (affichage), `:306-321` (réutilisation du `cityId` pour navigation) | Non — `cityId`/`cityName` ne pointent que vers `/hotels/search`, jamais vers une fiche destination dédiée |
| `/omra/[id]` (détail programme Omra) | **Non trouvé** | `grep` sur `city\|mecca\|medina` dans ce fichier : 0 résultat — la ville (`mecca`/`medina`, `omraHotels.city`) n'est affichée nulle part sur cette page (cohérent avec le constat chantier 3 : Omra n'expose aucun filtre géographique public) | `app/(public)/[locale]/omra/[id]/page.tsx` | Non applicable |

**Synthèse §2** : sur 6 pages produit examinées qui pourraient afficher une
destination, **4 le font déjà** (Attractions détail, Hôtels Monde résultats,
Hôtels Tunisie résultats, Hôtels Tunisie détail) mais **aucune ne le fait
sous forme de lien cliquable** vers quoi que ce soit d'assimilable à une
fiche destination — soit en texte brut (`Badge`, `<span>`), soit en lien
vers une page de recherche/résultats (jamais une page "destination").
Packages et Omra n'ont structurellement aucune donnée ville à afficher (pas
de colonne, confirmé schéma).

---

## 3. Contenu réel disponible pour peupler une page destination

### 3.1 `destinations.coverMediaUrl` / `destinations.seoDescription`

**Confirmé vides** — relecture de `drizzle/manual/0055_destinations_seed.sql`
(chantier 3) : les deux `INSERT INTO destinations` (pays `:29-40`, villes
`:43-68`) ne renseignent que `type`, `slug`, `name`, `name_en`, `name_ar`,
`country_code` (pays) ou `parent_id` (villes). Ni `cover_media_url` ni
`seo_description` n'apparaissent dans la liste de colonnes insérées sur
aucune des deux requêtes — ces deux colonnes restent donc à leur valeur par
défaut, c'est-à-dire `NULL` (aucun `default` déclaré sur ces colonnes dans
`lib/db/schema/destinations.ts:88-89` / `drizzle/manual/0054_destinations.sql:48-49`).
**Les 17 villes et 11 pays en base ont donc `coverMediaUrl = NULL` et
`seoDescription = NULL` sans exception.**

### 3.2 Système de médias existant réutilisable

- **`lib/media/storage.ts`** — adapter `MediaStorageAdapter` avec
  `put(key, buffer, contentType)`, `remove(keys)`, `getPublicUrl(key)`
  (`:29-37`). Deux backends : Supabase Storage (bucket
  `MEDIA_STORAGE_BUCKET`, défaut `"product-media"`, clés
  `media/<agencyId>/<module>/<productId>/...`) ou filesystem local
  (`MEDIA_STORAGE_BACKEND=local`, servi par `app/api/media/[...key]/route.ts`)
  — sélection via `getMediaStorage()` (`:119-122`), jamais de détection
  automatique.
- **`lib/media/query.ts`** — `getProductMedia(tx, agencyId, module,
  productId)` et `getCoverMediaForProducts(...)`, résolvent les lignes DB
  `product_media` vers des URLs publiques par variante (`large`/`medium`/
  `card`/`thumbnail`).
- **`lib/admin/product-media-actions.ts`** — server actions d'upload (non
  détaillées ici, hors périmètre demandé).
- **Contrainte structurelle bloquante pour réutilisation directe** : la
  table `product_media` a `agency_id uuid not null` (`drizzle/manual/0052_product_media.sql:16`)
  et une contrainte `CHECK module in ('omra', 'package', 'activity')`
  (`:32-33`, confirmé aussi côté TypeScript
  `PRODUCT_MEDIA_MODULES = ["omra", "package", "activity"]`,
  `lib/admin/product-constants.ts:30`) — **ni `'destination'`/`'hotel'`
  n'est une valeur acceptée**, et le système est conçu comme
  agency-scoped (une ligne par produit d'UNE agence), alors que
  `destinations` est une table plateforme sans `agency_id`
  (`lib/db/schema/destinations.ts:31-35` : "table plateforme, pas de
  agency_id"). Le storage adapter lui-même (`getMediaStorage()`,
  `put`/`getPublicUrl`) n'a aucune dépendance à `product_media` ou à un
  `agencyId` — c'est la table `product_media` et sa contrainte `module`
  qui sont scopées, pas l'adapter Storage sous-jacent.

### 3.3 Mécanisme de filtrage actuel Packages → réutilisabilité du slug canonique

- `DESTINATION_SEARCH_TERMS` (`app/(public)/[locale]/packages/page.tsx:37-46`) —
  `Record<string, string>` de 8 entrées, mappant un slug (`istanbul`,
  `dubai`, `paris`, `rome`, `barcelona`, `london`, `cairo`, `casablanca`)
  vers un terme de recherche texte (`"Istanbul"`, `"Dubai"`, ...,
  `"Caire"` pour `cairo`).
- Utilisation réelle (`:69-73`) : `filters.destination` (le slug reçu en
  query param) sert de clé pour retrouver le terme, puis
  `ilike(catalogPackages.title, \`%${searchTerm}%\`)` — recherche
  plein-texte sur le **titre** du package, aucune colonne dédiée.
- Ces 8 slugs sont **identiques** aux 8 `packages_slug` déjà backfillés
  dans `destination_external_refs` au chantier 3
  (`drizzle/manual/0055_destinations_seed.sql:85-92` : istanbul, dubai,
  paris, rome, barcelona, london, cairo, casablanca) — même vocabulaire,
  déjà réconcilié côté table de correspondance. Le mécanisme actuel
  (`DESTINATION_SEARCH_TERMS` codé en dur, `ilike` sur titre) reste
  cependant totalement indépendant de `destinations`/
  `destination_external_refs` : aucun import, aucune requête vers ces
  tables dans `packages/page.tsx`.
- Volumétrie réelle de produits rattachables par destination : **non
  déterminable en lecture de code seule** (nécessiterait une requête SQL
  sur les données réelles, hors périmètre lecture-de-code de cet audit).

---

## 4. Navigation actuelle

### 4.1 Header / Footer

- **`components/header.tsx`** (rendu par `HeaderWrapper`,
  `components/header-wrapper.tsx:7-22`) — tous les liens de navigation
  trouvés (`grep` sur `Link`/`href=`) pointent vers `/`, `tel:...`,
  `/bookings`, `/compte` (`components/header.tsx:56-173`). **Aucune
  mention de nom de ville** (Istanbul, Dubaï, etc.) dans ce fichier.
- **`components/footer-client.tsx`** — seule mention géographique trouvée :
  `<span>Tunis, Tunisie</span>` (`:213`), qui est l'adresse physique de la
  société dans le bloc contact, pas un lien de navigation vers une
  destination. `t("atunis")` (`:90`) est une autre chaîne traduite non
  vérifiée en détail ici (hors périmètre : probablement aussi une mention
  d'adresse, pas de navigation destination).
- **Conclusion §4.1** : aucun lien "Istanbul"/"Dubaï"/etc. en dur dans le
  header ou le footer.

### 4.2 Page d'accueil — section destinations

- Confirmé : la section visible sur la page d'accueil est
  **`<FlashOffers />`** (`app/(public)/[locale]/page.tsx:3,15`), rendue
  entre `<BookingEngine />` et `<OmratySection />`.
- Titre affiché : clé `Common.meilleurOffres`, dont la valeur réelle est
  **"Nos meilleures offres au départ de Tunis"** (FR,
  `messages/fr.json:59`), `"Our best deals from Tunis"` (EN,
  `messages/en.json:59`), `"أفضل عروضنا انطلاقًا من تونس"` (AR,
  `messages/ar.json:59`) — correspond exactement à la capture QA
  mentionnée dans le brief.
- **Données de cette section : tableau statique `offers`, 3 entrées codées
  en dur** (`components/flash-offers.tsx:16-44`) :
  1. `{ destination: "Istanbul", type: "Vols + Hôtel", href: "/hotels-monde", image: <Unsplash>, flag: "🇹🇷" }`
  2. `{ destination: "Djerba", type: "Tout Inclus", href: "/hotels/search", image: <Unsplash>, flag: "🇹🇳" }`
  3. `{ destination: "Omra", type: "Programme Éco", href: "/omra", image: <Unsplash>, flag: "🇸🇦" }`
- Commentaire explicite dans le code (`flash-offers.tsx:9-15`) : "aucun
  prix/date n'est affiché ici : ces chiffres n'existent nulle part côté
  serveur pour ces cartes [...] chaque carte pointe vers la vraie page de
  recherche du module correspondant plutôt que d'inventer un tarif."
- **Aucune requête serveur, aucune lecture de `destinations`/
  `destination_external_refs`, aucune image hébergée en interne** — les
  3 images sont des URLs Unsplash externes en dur, pas des
  `coverMediaUrl` de la table `destinations` (qui sont de toute façon
  `NULL`, §3.1). Les `href` mènent vers des pages de recherche par module
  (`/hotels-monde`, `/hotels/search`, `/omra`), jamais vers une page
  `/destinations/[slug]` — cohérente avec l'absence totale de cette route
  (confirmé chantier 1, toujours vrai ici).
- Chaque carte a un `href` "en dur" par entrée, pas de lien généré depuis
  un slug canonique — "Istanbul" ici n'est reliée à aucune donnée
  `destinations`/`destination_external_refs`, c'est une chaîne d'affichage
  indépendante.

---

## Constats clés

1. **Sitemap et robots.txt restent inexistants** — confirmé inchangé
   depuis le chantier 1, malgré la migration i18n (Lot 5) intervenue
   entre-temps.
2. **La couverture de `generateMetadata`/`export const metadata` s'est
   élargie depuis le chantier 1** (13 pages/layouts publiques avec
   title/description propre, contre "3 pages" constatées au chantier 1) et
   `alternates.languages` via `buildLanguageAlternates()` couvre 21 sites
   d'appel — **mais aucune page, ancienne ou nouvelle, n'inclut de
   ville/destination dans son `title` ou sa `description`**, y compris sur
   `/attractions/[slug]` qui affiche pourtant déjà `activity.location`
   dans le corps de page.
3. **Aucun JSON-LD, aucun `alternates.canonical`, aucun `metadataBase`**
   nulle part sur le site — trois surfaces SEO totalement vierges, non
   mentionnées explicitement par le chantier 1.
4. **4 pages produit sur 6 affichent déjà une ville/destination** en texte
   brut (Attractions détail, résultats Hôtels Monde, résultats et détail
   Hôtels Tunisie) mais **aucune ne la transforme en lien cliquable** vers
   quoi que ce soit — le lien, quand il existe, ramène systématiquement
   vers une page de recherche du même module, jamais vers une fiche
   destination (qui n'existe pas).
5. **Packages et Omra n'ont structurellement aucune colonne géo** sur leur
   table catalogue (`catalog_packages`, confirmé schéma ligne par ligne) —
   rien à afficher même si on le voulait, cohérent avec le constat
   chantier 1/3 sur l'absence de colonne géo structurée pour ces deux
   modules.
6. **`destinations.coverMediaUrl` et `destinations.seoDescription` sont
   confirmées `NULL` sur les 28 lignes seedées** (11 pays + 17 villes) —
   aucun contenu éditorial ni image n'existe aujourd'hui pour peupler une
   future page destination à partir de ces colonnes.
7. **Le Media System existant (`product_media`) ne peut pas stocker une
   image de couverture destination sans modification de schéma** : table
   `agency_id NOT NULL` + `CHECK module IN ('omra','package','activity')`
   — une table plateforme sans agence (`destinations`) ne rentre pas dans
   ce moule tel quel, même si l'adapter Storage sous-jacent
   (`getMediaStorage()`) n'a lui-même aucune dépendance à `product_media`.
8. **Le mécanisme de filtrage géographique de Packages
   (`DESTINATION_SEARCH_TERMS` + `ilike` sur titre) utilise déjà
   exactement les mêmes 8 slugs que `destination_external_refs.module =
   'packages_slug'`** backfillés au chantier 3, mais les deux systèmes
   sont aujourd'hui totalement déconnectés — aucun import, aucune requête
   croisée dans le code actuel.
9. **La section "Nos meilleures offres au départ de Tunis" de la page
   d'accueil (`FlashOffers`) est un tableau statique de 3 entrées**
   (Istanbul/Djerba/Omra) codées en dur avec images Unsplash externes,
   sans aucun lien avec `destinations`/`destination_external_refs` ni avec
   le Media System — chaque carte pointe vers une page de recherche par
   module, jamais vers une fiche destination.
10. **Aucun lien de navigation vers une destination dans header/footer** —
    la seule mention géographique du footer est l'adresse physique de la
    société ("Tunis, Tunisie"), pas un lien de navigation.
11. **Le pattern de route à suivre pour toute future page destination est
    contraint et déjà bien défini** : `localePrefix: "always"`
    (`i18n/routing.ts:15`) impose un préfixe de locale explicite sur les 3
    langues, donc une route `app/(public)/[locale]/destinations/[slug]/
    page.tsx` pour rester cohérente avec l'ensemble du storefront public.

---

*Prochaine étape (chantier 4, suite — architecture, distincte et pas
commencée) : conception des pages `/destinations/[slug]` et de leur SEO
(sitemap, robots.txt, JSON-LD, canonical, contenu éditorial/média,
rattachement des produits existants) à partir de ces constats, avec
validation utilisateur séparée avant tout code.*
