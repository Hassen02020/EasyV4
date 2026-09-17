# Audit — Chantier 6 : Pagination SERP

Phase Premium 2. Périmètre : les pages de résultats de recherche publiques
("SERP" au sens large — pas les tables back-office admin, hors périmètre).
Recherche effectuée sur le code réel du dépôt (aucune base locale n'était
démarrée pendant cet audit — comptes de lignes tirés des scripts de seed et
migrations, pas d'une requête live ; à revérifier si besoin en QA).

## Constat global

**Aucun des 7 modules publics ne pagine.** Chacun charge l'intégralité du
jeu de résultats en un seul appel et le rend en une fois, côté client.
Aucun paramètre `page`/`limit`/`offset`/curseur nulle part dans les API ou
pages publiques. Aucun "load more"/scroll infini.

## Détail par module

### 1. Hôtels Tunisie (myGo) — seul vrai risque de production

- `app/api/hotels/search-public/route.ts` → `executeHotelSearchThroughHub()`
  → aucun paramètre limit/offset accepté (`HotelSearchQuerySchema`,
  `lib/mygo/search-core.ts`).
- `lib/mygo/search-core.ts:279,364` : `count: offers.length` — le "count"
  de l'API est juste la taille du tableau complet, preuve qu'il n'y a
  aucun plafond serveur.
- UI (`app/(public)/[locale]/hotels/search/page.tsx:192-213`,
  `lib/mygo/use-hotel-search.ts:88-93`) : un seul fetch, filtre/tri
  entièrement côté client sur `allOffers`, jamais de découpage avant
  `<HotelListings>`.
- **Plafond réel : aucun** — borné uniquement par ce que myGo renvoie pour
  une recherche donnée. C'est le seul module où un GDS réel peut
  raisonnablement renvoyer des dizaines de résultats aujourd'hui.

### 2. Hôtels Monde — plafond structurel, pas un vrai besoin actuel

- `lib/hotels-monde/virtual-supplier/catalog.ts:32-39,51` : `TEMPLATES`
  fait exactement 6 entrées, `offerCount = 4 + rng()*3` → **toujours 4 à 6
  offres**, plafonné par la taille du catalogue de templates.
- Aucune pagination ni côté API ni côté
  `world-hotel-results-content.tsx`.
- Le "plafond" vient du fournisseur virtuel, pas d'une vraie pagination —
  paginer 4-6 résultats n'aurait aucun effet visible aujourd'hui.

### 3. Vols — même situation que Hôtels Monde

- `lib/vols/virtual-supplier/catalog.ts:87` : `offerCount = 3 + rng()*3`
  → toujours 3 à 5 offres. Même plafond structurel, aucune pagination
  nulle part.

### 4-6. Packages / Attractions / Omra — catalogues admin, non bornés en code

- Les trois listing pages (`packages/page.tsx`, `attractions/page.tsx`,
  `omra/page.tsx`) font une requête Drizzle sans aucun `.limit()` —
  génuinement non bornée en code.
- Données réelles aujourd'hui : ~1 ligne seedée par module
  (`scripts/seed-base-infra.ts`) — pas de risque immédiat, mais rien
  n'empêche la croissance via le Product Builder admin (chantier 13).

### 7. Index `/destinations` — hors de propos

- `lib/destinations/queries.ts:52-73` : deux requêtes non bornées, mais
  ~28 lignes au total (confirmé migration 0055) — une liste à plat reste
  lisible même à 10x cette taille. Priorité la plus basse des 7.

## Infrastructure déjà existante (non branchée)

- `components/ui/pagination.tsx` : primitives shadcn standard
  (`Pagination`/`PaginationContent`/`PaginationLink`/…), purement
  présentationnelles. **Zéro importeur dans tout le dépôt** — construit,
  jamais câblé.
- `lib/admin/pagination.ts` : malgré son chemin, le code est générique
  (pas couplé à l'admin) — `paginateOffset()`/`paginateCursor()` prennent
  n'importe quelle chaîne Drizzle `select`, avec plafond déjà en place
  (`Math.min(100, limit)`). **Zéro importeur trouvé nulle part, y compris
  dans les tables admin** — ce fichier est lui-même du code mort
  aujourd'hui, malgré son nom qui suggère le contraire. Vérifier/câbler
  l'admin est hors périmètre de ce chantier (portée = SERP public).

## Résumé

| Module | Pagination API/UI | Plafond actuel | Volume réel |
|---|---|---|---|
| Hôtels Tunisie (myGo) | aucune | aucun (count = taille réelle) | dépend du fournisseur — risque réel |
| Hôtels Monde | aucune | plafond structurel (catalogue à 6 templates) | 4-6, toujours |
| Vols | aucune | plafond structurel (générateur) | 3-5, toujours |
| Packages | aucune | aucun | ~1 seedé, non borné en prod |
| Attractions | aucune | aucun | ~1 seedé, non borné en prod |
| Omra | aucune | aucun | ~1 seedé, non borné en prod |
| `/destinations` | aucune | aucun | ~28, hors de propos |

## Question d'architecture à trancher avant le code

Deux portées possibles, avec un compromis réel :

- **(a) Hôtels Tunisie seulement** : seul module avec un vrai besoin de
  production aujourd'hui (fournisseur réel, volume non maîtrisé). Minimal,
  ne fabrique pas un besoin pour Hôtels Monde/Vols dont les fournisseurs
  virtuels plafonnent déjà à 4-6/3-5 résultats.
- **(b) Les 3 moteurs de recherche (Hôtels Tunisie, Hôtels Monde, Vols)
  uniformément** : cohérent avec l'intitulé du chantier et prépare le
  terrain pour le jour où Hôtels Monde/Vols auront un vrai fournisseur
  (chantier 7, Multi-supplier Hub) — mais ajoute une pagination
  fonctionnellement invisible sur des jeux de résultats qui ne dépassent
  jamais 6 lignes aujourd'hui.

Packages/Attractions/Omra (catalogues admin, non bornés en code mais ~1
ligne réelle aujourd'hui) : proposé en périmètre secondaire léger (simple
`.limit()`/`.offset()`, mécanisme trivial), indépendamment du choix (a)/(b)
ci-dessus.
