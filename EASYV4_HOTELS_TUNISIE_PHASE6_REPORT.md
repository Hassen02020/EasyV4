# EASY2BOOK V6 — Phase 6 — Hôtels Tunisie / MyGo — Results Engine, Skeletons, Mobile Vaul, B2B/B2C UX

Mode suivi : INSPECT → AUDIT → IMPLEMENT → TEST → FIX → RETEST → BUILD.
Référence UX : VoyaGo.tn (fonctionnelle uniquement — aucun code/asset/design
copié). Contrainte respectée dans toute la phase : **aucune modification du
connecteur MyGo, du booking engine, ni du wallet.**

## 1. INSPECT — état réel avant cette phase

Les quatre documents cités comme source de vérité ont été relus, plus le
code réel. Constat principal : la quasi-totalité de "OTA RESULTS ENGINE +
FACETS + FILTERS + SORTING + DEDUPLICATION + BEST RATE" était **déjà
construite** dans une mission précédente de cette même session
(`EASYV4_HOTEL_SEARCH_ENGINE_REPORT.md`) :

| Capacité | État avant cette phase |
|---|---|
| Deduplication | ✅ réel (`dedupeOffersByHotelId`, `lib/mygo/mappers.ts`) |
| Facets | ✅ réel (`computeFacets`, `lib/mygo/facets.ts`) |
| Filtres | ✅ réels, persistés dans l'URL, Filter Chips | 
| Tri (Sort Engine) | ✅ réel (`lib/mygo/sort.ts`), 4 modes documentés |
| Best Rate Engine | ✅ réel (`lib/mygo/best-rate.ts`) |
| Recherche multi-chambres | ✅ réelle |
| Accès B2C public (`/api/hotels/search-public`) | ✅ réel, déjà séparé de la route B2B (`/api/hotels/search`) |
| **Skeletons** | ⚠️ partiel — `HotelListings` en a déjà (résultats), mais `FilterSidebar` n'en avait aucun (section vide plutôt que squelette), et le `Suspense` racine de la page n'avait qu'un `<div>` vide comme fallback |
| **Drawer mobile Filtres/Tri (Vaul)** | ❌ non construit — seul un empilement vertical brut existait, déjà documenté comme gap P3 dans le rapport précédent |
| **B2B/B2C UX** | Déjà correctement séparés architecturalement : `/hotels/search` (B2C, `useHotelSearch` → `/api/hotels/search-public`) vs `/pro/hotels` (B2B) — voir §5 |

Donc le périmètre réel restant pour cette phase, une fois l'audit fait,
était concentré sur exactement les deux items encore non cochés :
**Skeletons** et **Mobile Vaul**, plus un audit (sans modification) de la
séparation B2B/B2C.

## 2. AUDIT — pourquoi pas plus que ça

- Refaire le Sort/Filter/Dedup/Best-Rate Engine aurait été une reconstruction
  inutile d'un système déjà réel, testé et documenté — contraire au principe
  suivi tout du long dans cette session ("ne pas reconstruire ce qui
  fonctionne").
- Le seul point B2B/B2C non résolu identifié (`/pro/hotels` sur données
  fixture, complètement déconnecté du moteur MyGo réel — P1 du rapport
  précédent) **reste volontairement non touché** : le corriger toucherait le
  booking engine et le pricing B2B, explicitement interdits sans décision
  produit explicite sur la source de vérité (`/hotels/search` réel vs
  `/pro/hotels` fixture) — cf. §16 du rapport précédent, toujours valable,
  reconfirmé ici après relecture du code.

## 3. IMPLEMENT

### 3.1 Skeletons
- `components/filter-sidebar.tsx` : extraction du contenu des filtres dans
  `FilterControls` (réutilisable), ajout de `FilterControlsSkeleton`
  (squelettes `Skeleton` déjà utilisé ailleurs dans l'app, rien de nouveau
  installé), affiché tant que la recherche est **réellement en cours**
  (nouveau prop explicite `loading`, voir §4 — pas déduit de `facets ===
  null`, qui est aussi vrai pour "chargé, zéro résultat").
- `app/hotels/search/page.tsx` : le fallback du `Suspense` racine (page
  entière), auparavant un `<div>` vide, est maintenant un vrai squelette de
  la mise en page (barre de recherche, sidebar, 3 cartes) via
  `HotelSearchPageSkeleton`.

### 3.2 Mobile Vaul (bottom-sheets Filtres / Tri)
- `components/ui/drawer.tsx` (wrapper Vaul déjà présent, `vaul` déjà une
  dépendance du projet — confirmé avant tout ajout) réutilisé tel quel,
  aucun nouveau composant primitif créé.
- Nouveau `MobileFilterSortBar` (`components/filter-sidebar.tsx`) :
  deux boutons dédiés `lg:hidden` — "Filtres" (badge = nombre de filtres
  actifs, `countActiveFilters`) et "Trier" (libellé du tri courant) —
  chacun ouvrant son propre `Drawer` :
  - Drawer Filtres : contient `FilterControls` (même composant que la
    sidebar desktop, pas de logique dupliquée) + bouton "Voir les
    résultats" qui ferme le drawer.
  - Drawer Tri : liste des `SORT_OPTIONS` (déjà exportées par
    `lib/mygo/sort.ts`), sélectionner une option applique le tri **et**
    ferme le drawer dans le même geste (`DrawerClose asChild` sur chaque
    option).
- Desktop **strictement inchangé** : sidebar + `SortSelect` toujours
  rendus à l'identique, simplement masqués sous `lg` (`hidden lg:block` /
  `hidden shrink-0 lg:block lg:w-1/4`) au lieu de s'empiler verticalement.

### 3.3 B2B/B2C UX — audit, pas de code
Confirmé par relecture du code (`lib/mygo/use-hotel-search.ts`, commentaire
de tête explicite) : `/hotels/search` est **exclusivement** B2C
(`/api/hotels/search-public`, aucune session requise), le portail B2B
`/pro` ne l'utilise pas. Aucune UX partagée à faire cohabiter sur cette
page — donc rien à construire ici pour "B2B/B2C UX" au-delà de la
reconfirmation de cette séparation et du rappel du gap P1 déjà documenté
(`/pro/hotels` sur fixture) qui reste hors périmètre.

## 4. Bug trouvé et corrigé pendant TEST → FIX → RETEST

Premier jet : le squelette de `FilterSidebar`/`MobileFilterSortBar`
s'affichait quand `facets === null`. Or `facets` est `null` dans **deux**
cas bien distincts : (a) la recherche est en cours, et (b) la recherche a
répondu avec succès mais **zéro offre** (`allOffers.length === 0` →
`facets = null` par construction dans `page.tsx`). Vérifié en conditions
réelles dans ce sandbox : `/api/hotels/search-public` répond `200 {count:0,
offers:[]}` (fixture démo, pas de MyGo configuré) — exactement le cas (b).
Le premier jet aurait donc affiché un squelette de chargement **en
permanence** pour un résultat de recherche légitimement vide — un mensonge
d'UI, contraire au principe suivi dans toute cette session.

**Corrigé** avant commit : `loading` est maintenant un prop explicite
(`status === "loading"`, jamais déduit de `facets`), passé par
`page.tsx`. Ajouté aussi `hasResults` sur `MobileFilterSortBar` pour
désactiver le déclencheur "Trier" quand il n'y a rien à trier — même
condition que le `SortSelect` desktop (`status === "success" &&
sortedOffers.length > 0`), qui avait cette garde depuis le début et que
mon premier jet mobile n'avait pas répliquée.

Un second signalement de test ("le drawer ne se ferme pas après clic sur
Voir les résultats") s'est révélé être un faux positif du script de test
(attente de 500 ms insuffisante pour l'animation de fermeture Vaul,
~1000-1200 ms) — reconfirmé fermé correctement avec une marge d'attente
suffisante, aucun changement de code nécessaire.

## 5. Fichiers modifiés

- `lib/mygo/facets.ts` — `countActiveFilters(state, facets)` (pure, +3 tests).
- `components/filter-sidebar.tsx` — extraction `FilterControls` +
  `FilterControlsSkeleton`, `FilterSidebar` devient un wrapper fin avec
  prop `loading` explicite, nouveau `MobileFilterSortBar`.
- `app/hotels/search/page.tsx` — wiring du `MobileFilterSortBar`, sidebar/
  `SortSelect` desktop masqués sous `lg`, nouveau fallback `Suspense`
  (`HotelSearchPageSkeleton`).
- `lib/mygo/__tests__/facets.test.ts` — 3 nouveaux tests
  (`countActiveFilters`).

**Non touchés (vérifié explicitement)** : `lib/mygo/client.ts`,
`lib/mygo/best-rate.ts`, `lib/mygo/sort.ts`, `lib/mygo/mappers.ts`,
`lib/mygo/degraded-mode.ts`, `lib/mygo/use-hotel-search.ts`,
`app/api/hotels/search*/route.ts`, `lib/booking/*`, tout code wallet
(`lib/finance/*`, `lib/pro/booking-actions.ts`), `lib/pro/*` (y compris le
gap `/pro/hotels` connu et non corrigé), aucune migration `drizzle/`.

## 6. Fichiers créés / supprimés

Aucun fichier créé ni supprimé — uniquement des modifications sur les 4
fichiers listés en §5 (`components/ui/drawer.tsx` et la dépendance `vaul`
existaient déjà, réutilisés tels quels).

## 7. Tests

Gates automatisés :
```
pnpm typecheck   → 0 erreur
pnpm lint        → 0 erreur (118 avertissements, tous pré-existants et
                    identiques en nombre avant/après cette phase)
pnpm test        → 231/231 passent (228 + 3 nouveaux countActiveFilters)
pnpm build       → build de production réussi
```

Vérification manuelle (Playwright, chromium, ce sandbox — fixture démo
`/api/hotels/search-public` répond `200 {count:0}`, pas de `MYGO_LOGIN`/
Supabase configurés, même contrainte documentée que le rapport précédent) :

- **Mobile (390px)** : sidebar desktop masquée ; boutons "Filtres"/"Trier"
  visibles ; drawer Filtres s'ouvre, affiche les vrais contrôles (pas un
  squelette bloqué) même avec zéro résultat, se ferme sur "Voir les
  résultats" ; drawer Tri s'ouvre, sélectionner "Prix croissant" met à jour
  l'URL (`sort=price_asc`) et ferme le drawer ; bouton "Trier" désactivé
  quand zéro résultat (cohérent avec le desktop) ; aucun débordement
  horizontal.
- **Desktop (1440px)** : sidebar + `SortSelect` rendus à l'identique
  d'avant cette phase ; barre mobile masquée ; Filter Chips depuis l'URL
  (`f_stars=4` → chip "4 étoiles") toujours fonctionnels.
- **BLOCKED, comme documenté précédemment** : validation E2E avec de
  vraies offres MyGo (dédoublonnage visuel réel, facets avec vrais
  compteurs, tri sur prix réels dans le drawer mobile) nécessite un
  environnement avec `MYGO_LOGIN`/Supabase configurés, non disponible dans
  ce sandbox.

## 8. Build

Build de production réussi (`✓ Compiled successfully`), aucune route
ajoutée ni supprimée (uniquement des composants sur des routes existantes).

## 9. Risques restants (uniquement ce qui n'est pas résolu)

1. **P1 — `/pro/hotels` sur données fixture, déconnecté du moteur MyGo réel**
   (déjà documenté dans `EASYV4_HOTEL_SEARCH_ENGINE_REPORT.md` §16.1,
   reconfirmé ici, toujours non corrigé) : nécessite une décision produit
   explicite avant tout correctif (toucherait booking engine + pricing B2B).
2. **P2 — cache MyGo non partitionné par tenant** (§16.3 du rapport
   précédent) : inchangé, toujours documenté, pas de fuite de prix détectée.
3. **P3 — pagination non implémentée** (§16.5 du rapport précédent) :
   toujours pas de preuve de volume la justifiant.
4. **BLOCKED — validation E2E avec données MyGo réelles** (§7 ci-dessus) :
   environnement sandbox sans `MYGO_LOGIN`/Supabase.

Les deux gaps P3 explicitement visés par cette phase (drawer mobile,
squelettes) sont désormais résolus.
