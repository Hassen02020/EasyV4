# EASY2BOOK / EASYV4 — Phase 7 — Hotel Results Engine: Production Hardening + OTA UX

Mode suivi : INSPECT → AUDIT → IDENTIFY REAL GAPS → IMPLEMENT → TEST → FIX →
RETEST → TYPECHECK → LINT → TEST → BUILD → PLAYWRIGHT → REPORT → COMMIT →
PUSH. Référence UX : VoyaGo.tn (fonctionnelle uniquement, rien copié).
Principe suivi : **REUSE BEFORE CREATE / MEASURE BEFORE MODIFY / DO NOT
REBUILD WHAT ALREADY WORKS.**

## A. Executive Summary

Le moteur de résultats Hôtels Tunisie était déjà, avant cette phase, à un
niveau très proche du standard OTA visé par la mission : Search State
typé, dédoublonnage réel par `hotel.id`, Best Rate Engine, facets/filtres
combinés en ET, tri, multi-chambres avec âges enfants exacts, séparation
B2C/B2B propre, skeletons, drawer mobile Vaul (Phases 5-6 de cette même
session). L'audit de cette phase, fait en lisant le code réel (pas en
faisant confiance aux rapports précédents), a trouvé **deux bugs de
cohérence prix réels et démontrables** (pas des reconstructions, des
corrections ciblées d'une ligne de logique chacune) et **une lacune UX
réelle** (état vide générique sans action). Les trois sont corrigés,
testés, et poussés. Aucun autre gap réel n'a été trouvé qui justifie une
modification de code dans le périmètre de cette phase — le reste des
sections ci-dessous documente l'état déjà correct (vérifié par lecture de
code, pas supposé) ou les risques déjà connus et volontairement non
touchés (décision produit requise).

**MyGo, BookingCreation, Cancellation, Wallet, Ledger, Pricing/markup :
non modifiés.** Confirmé par `git diff --stat` (voir §W).

## B. Existing Architecture

```
Homepage (booking-engine.tsx → HotelsTunisieSearch)
  → childrenAges[] réels + rooms (multi-chambre)
  → splitIntoRooms() [lib/mygo/room-split.ts]
  → encodeRoomsParam() → URL (/hotels/search?cityId&checkin&checkout&adults&children&rooms&f_*&sort)
  → useHotelSearch() [lib/mygo/use-hotel-search.ts — B2C uniquement]
  → GET /api/hotels/search-public [B2C, sans session]
     (B2B : GET /api/hotels/search, requirePartnerSession — même moteur)
  → executeHotelSearch() [lib/mygo/search-core.ts, PARTAGÉ B2C/B2B]
  → HotelSearchQuerySchema (Zod) → decodeRoomsParam()
  → searchWithFallback() [circuit breaker + cache stale, lib/mygo/degraded-mode.ts]
  → MyGoClient.searchHotels() [SearchDetails.Rooms: [{Adult, Child: ages[]}]]
  → isRealHotelOffer + mapHotelOffer + dedupeOffersByHotelId [1 hôtel = 1 résultat]
  → HotelSearchResultDTO renvoyé au client

Côté client (app/hotels/search/page.tsx), PUREMENT LOCAL, jamais de
nouvel appel myGo :
  computeFacets(allOffers)              [toujours sur le jeu COMPLET]
  → applyFilters(allOffers, filters)    [ET entre tous les filtres actifs]
  → sortOffers(filtered, mode, filters.boardings)  [corrigé cette phase, voir §F/§I]
  → toCardShape(offer, activeBoardFilters) → selectBestRate(...)  [corrigé cette phase, voir §G]
  → HotelCard (Hotel Details → Rooms/Rates → booking existant, inchangé)
```

## C. Search State

Vérifié réel et complet : `destination(cityId)`, `checkIn`, `checkOut`,
`rooms` (multi-chambre, `HotelFilterState` séparé pour les filtres),
`adults`, `children`/`childAges`, `filters` (`f_stars`/`f_board`/
`f_amenities`/`f_price`/`f_rec`/`f_cancel`/`f_avail`), `sort`. Pas de champ
`nationality`/`currency` par utilisateur — myGo n'expose pas de tarification
par nationalité à ce niveau, et la devise de règlement est fixée à TND côté
`MyGoClient.createBooking` (`HOTEL_SETTLEMENT_CURRENCY`, non paramétrable
par design, voir §L). Aucun changement nécessaire.

Parcours testé (Playwright, voir §V) : Search → Results → Filter → Sort →
Hotel (lien "Voir détails" transmet `currentSearchQuery` complet) → Back
(résultats + filtres + tri conservés) → Refresh (état reconstruit
entièrement depuis l'URL, aucun state perdu).

## D. URL State

Refresh-safe, deep-linkable, partageable, browser-back compatible — déjà
confirmé en Phase 5/6, revérifié ici par lecture de `filtersToSearchParams`/
`filtersFromSearchParams` (round-trip testé, `lib/mygo/__tests__/
facets.test.ts`) et par test manuel (URL avec `f_stars=4&sort=price_asc`
copiée/collée reconstruit exactement le même état). Aucun changement.

## E. Results Engine

**Confirmé "1 hôtel = 1 résultat", pas "1 rate = 1 hôtel"** — vérifié dans
le code (`dedupeOffersByHotelId`, `lib/mygo/mappers.ts`) : regroupement par
`offer.hotel.id`, fusion des boardings de toutes les entrées myGo brutes
pour ce même hôtel, `fromPrice` = minimum réel. Les rates/boardings
individuels ne sont jamais des résultats de premier niveau — ils vivent
dans `HotelOfferDTO.boardings[]`, affichés dans la card puis le détail.
Aucun changement nécessaire.

## F. Deduplication

Clé réelle : `hotel.id` (identifiant myGo stable). Cas vérifiés dans le
code : plusieurs entrées myGo pour le même hôtel → `pickBetterOffer`
préfère l'entrée avec étoiles connues, puis celle avec le plus de
facilities/thèmes/image ; tous les boardings sont fusionnés (dédupliqués
par `code || name`) plutôt que la variante perdante étant simplement jetée
— aucune option de pension n'est perdue silencieusement. Aucun changement
nécessaire.

## G. Best Rate

**Bug trouvé et corrigé** (voir aussi §I) : `selectBestRate` ne filtrait
pas les chambres `stopReservation` (sur demande / complet côté myGo) — une
chambre à 150 TND marquée stop pouvait être choisie comme "meilleur tarif"
affiché alors qu'elle n'est pas réellement réservable, incohérent avec
`fromPrice` (source : `lowestPrice`, qui exclut déjà `stopReservation`) et
avec le filtre "Disponible seulement" (`hasAvailableRoom`, même exclusion).
Corrigé : les chambres `stopReservation` sont exclues du pool de
candidates ; repli sur l'ensemble complet uniquement si **toutes** les
chambres de l'offre sont en stop (afficher un prix indicatif reste
préférable à n'en afficher aucun pour une offre déjà listée). +3 tests.

## H. Facets

Vérifié dans le code : `computeFacets(allOffers)` est appelé avec le jeu
**complet non filtré** (`app/hotels/search/page.tsx`), jamais avec
`filteredOffers` — chaque case à cocher reste cohérente avec les autres
filtres actifs, pas de double filtrage, pas de compteurs basés sur des
données inexistantes (chaque section de filtre ne s'affiche que si
`facets.x.length > 0`). Aucun changement nécessaire.

## I. Filters

Combinaison en ET vérifiée dans `applyFilters` (`lib/mygo/facets.ts`) :
étoiles (OR interne entre étoiles cochées, ET avec les autres filtres),
pension, prix, recommandé, annulation gratuite, disponible — testé avec la
combinaison `4 étoiles AND All Inclusive AND Free Cancellation AND
Price<=X` en conditions réelles (Playwright, fixture démo 70 hôtels, voir
§V) : résultats bien à l'intersection.

**Bug trouvé et corrigé** (lié à Best Rate, §G) : le tri par prix
(`sortOffers`) utilisait toujours `fromPrice` (le moins cher toutes
pensions confondues), même quand un filtre de pension actif changeait le
prix réellement affiché sur la card via `selectBestRate`. Exemple concret
vérifié par test : Hôtel A (Petit-déj 200, All Inclusive 500) et Hôtel B
(Petit-déj 300, All Inclusive 450) — avec le filtre "All Inclusive" actif,
"Prix croissant" affichait A puis B (200 < 300) alors que les cards
montraient 500 puis 450, un ordre visuellement décroissant. Corrigé :
`sortOffers` accepte maintenant le filtre de pension actif et compare le
même prix que celui affiché (`selectBestRate`-dérivé), pour `price_asc`,
`price_desc`, `best_deal`, et le départage de `recommended`. Vérifié en
conditions réelles (fixture démo, filtre All Inclusive + tri croissant →
prix des cards effectivement 1682 < 1691 < 1735 < 1761 TND, voir §V).

## J. Sorting

4 modes vérifiés : `recommended` (recommandé myGo puis prix), `price_asc`,
`price_desc`, `best_deal` (`prix affiché / max(stars,1)`, formule
documentée, aucun score opaque). Tous utilisent maintenant le prix
réellement affiché (§I). Le prix qui gouverne le tri n'est jamais un "prix
fournisseur" distinct du "prix client" — aucune marge n'est appliquée à ce
niveau (confirmé §L) donc `fromPrice`/prix Best-Rate EST le prix client. Le
seul mode absent : "Meilleure note" — délibérément non construit, `myGo`
n'expose aucune note utilisateur vérifiée (`hotel.note` n'est pas un
système d'avis réel), inventer ce tri aurait fabriqué un classement sur une
donnée non fiable (déjà documenté Phase 5, reconfirmé ici).

## K. Ranking

`recommended` : deux critères réels et documentés (flag `Recommended` myGo,
puis prix croissant en départage) — stable, compréhensible, testable
(`lib/mygo/__tests__/sort.test.ts`). Aucune IA, aucun score opaque introduit.

## L. Hotel Cards

Structure vérifiée dans `components/hotel-card.tsx`/`hotel-listings.tsx` :
image, étoiles réelles, nom, ville, pensions/annulation réelles, prix "À
partir de" (Best Rate), nombre de nuits, CTA "Voir les chambres". **Aucune
donnée fabriquée trouvée** : pas de note/avis inventés (`hotel.note` myGo
utilisé tel quel s'il existe, jamais généré), pas de distance fabriquée,
pas de badge de promotion inventé. **Scarcity** (§Q du plan mission) :
recherche explicite de toute mention "plus que N chambres" / "très
demandé" / "X personnes regardent" — **aucune trouvée dans le code**, rien
à supprimer. `RoomOfferDTO.quantity` existe dans le DTO mais n'est jamais
utilisé comme compte à rebours artificiel dans l'UI actuelle.

**Pricing/sécurité prix (§18/§31 du plan mission)** : tracé
`MyGoClient.searchHotels` → `mapHotelOffer`/`lowestPrice` → `HotelOfferDTO.
fromPrice` → card → tri/facets → détail. Confirmé qu'aucun champ
prix/markup/commission/agency_id/wallet_id n'est lu depuis la requête
cliente à aucune étape (`HotelSearchQuerySchema`, `lib/mygo/search-core.ts`,
relu explicitement — commentaire de tête du fichier confirme cette
frontière). Le frontend ne peut décider ni du prix fournisseur, ni d'un
markup, ni d'un impact wallet — tout ça reste côté backend
(`lib/booking/pricing.ts`, non touché). `MYGO_LOGIN`/`MYGO_PASSWORD` : grep
explicite sur tout `app/`/`components/`/`lib/mygo/` — jamais renvoyés dans
une réponse HTTP, jamais dans une variable `NEXT_PUBLIC_*`, uniquement lus
côté serveur dans `lib/mygo/config.ts`/`client.ts`.

## M. B2C

Confirmé par lecture de code (`lib/mygo/use-hotel-search.ts`, commentaire
de tête explicite) : `/hotels/search` est **exclusivement** B2C —
`/api/hotels/search-public`, aucune session requise. Testé sans session
partenaire (navigation anonyme, Playwright) : Search → Results → Filter →
Sort fonctionnent sans redirection ni erreur d'auth. Aucune dépendance
accidentelle à `/pro`/`/admin`/session partenaire trouvée dans ce chemin.

## N. B2B

`/pro/hotels` audité (pas modifié — décision produit requise, voir §AA).
Confirmé (reconfirmation du P1 déjà documenté en Phase 5/6) : `/pro/hotels`
utilise `getProHotelById()` (`lib/pro/hotels-fixture.ts`), des données
**100% fictives**, avec marge appliquée dessus (`lib/pro/pricing.ts`),
totalement déconnecté du moteur myGo réel utilisé par `/hotels/search`. Les
réservations issues de ce flux n'ont pas les métadonnées myGo
(`myGoToken/cityId/boardingId/roomId`) nécessaires à une confirmation
fournisseur réelle. **Non corrigé dans cette phase** (toucherait booking
engine + pricing B2B sans décision produit explicite sur la source de
vérité B2B — `/hotels/search` réel vs `/pro/hotels` fixture).

Architecture actuelle, différences, gaps connus — résumé :

| | B2C (`/hotels/search`) | B2B (`/pro/hotels`) |
|---|---|---|
| Moteur | myGo réel (`search-core.ts` partagé) | Fixture (`hotels-fixture.ts`) |
| Session | Aucune | `requirePartnerSession` |
| Composants partagés | `filter-sidebar.tsx`, `hotel-listings.tsx`, `lib/mygo/*` | Composants `components/pro/*` distincts, aucun composant partagé avec le B2C |
| Pricing | `fromPrice` myGo, aucune marge à ce niveau | `applyMarginsToHotel`/`applyMarginsToOffers` (marge agence) |
| Booking réel | Oui (`myGoToken` transmis) | Non — `confirmHotelWithProvider()` retournerait `{attempted:false}` |

## O. Mobile Vaul

Déjà construit en Phase 6. Retesté à 390px (Playwright) : ouverture via
clic ET clavier (Tab + Enter), fermeture via bouton "Voir les résultats",
via sélection d'une option de tri, et via `Escape` — tous confirmés. Pas de
scroll-lock cassé ni de perte de focus observée. Aucun changement de code
nécessaire cette phase.

## P. Skeletons

Déjà construits et corrigés en Phase 6 (distinction `loading` explicite vs
`facets === null`, qui est aussi vrai pour "chargé, zéro résultat" —
c'était le bug corrigé en Phase 6). Revérifié : `facets === null` n'est
plus utilisé comme preuve de chargement nulle part dans le code actuel.
Aucun changement cette phase.

## Q. Empty/Error States

**Erreurs** : déjà différenciées par `errorCode` (`service_unavailable`,
`rate_limited`, `incomplete_query`, générique) — une panne fournisseur
n'est jamais silencieusement montrée comme "0 hôtels" (`components/
hotel-listings.tsx`, bloc `status === "error"`, distinct du bloc succès à
zéro résultat). Bouton "Réessayer" présent sauf sur `incomplete_query`
(rien à réessayer sans critères). Aucun changement nécessaire.

**Réponse partielle/ambiguë** : `searchWithFallback` (`lib/mygo/
degraded-mode.ts`, non modifié) distingue déjà panne fournisseur (503 +
retry-after, ou cache figé avec bannière "mode dégradé" visible) d'un vrai
zéro résultat — un problème fournisseur ne devient jamais silencieusement
"0 résultats" dans le code actuel.

**État vide — bug trouvé et corrigé** : un seul message générique
("Aucun hôtel ne correspond aux filtres sélectionnés") s'affichait pour
**tout** cas à zéro résultat, y compris quand myGo lui-même n'avait rien
renvoyé (rien à voir avec les filtres), sans aucune action proposée.
Corrigé — différencié via `totalCount` (déjà disponible, avant filtrage)
vs `offers.length` (après filtrage) :
- `totalCount === 0` (myGo n'a rien renvoyé) → "Aucun hôtel disponible pour
  cette recherche" + lien réel "Modifier la recherche" vers `/` (aucune
  page `/hotels` dédiée formulaire+landing n'existe, confirmé avant de
  créer ce lien — le widget réel vit sur la homepage).
- `totalCount > 0` mais filtré à zéro → message conservé + nombre réel de
  résultats pré-filtrage + bouton "Effacer tous les filtres" fonctionnel
  (réutilise `EMPTY_FILTER_STATE`, déjà le mécanisme de `FilterChips`).

Vérifié en conditions réelles (Playwright) : `cityId=999` (aucun hôtel) →
premier message + lien ; `f_stars=1` sur la fixture démo (majoritairement
3-5 étoiles) → second message + bouton qui retire effectivement `f_stars`
de l'URL au clic.

## R. Performance

Mesuré/audité sans modification (aucune preuve de problème trouvée,
conforme à "ne pas optimiser sans preuve") : filtrage/tri/facets sont
`useMemo`-mémorisés sur les offres déjà chargées, aucun nouvel appel myGo
au changement de filtre/tri (confirmé par lecture de `useHotelSearch` —
ses dépendances sont strictement les paramètres de recherche myGo, jamais
`f_*`/`sort`). Pas de re-fetch en cascade observé. Aucune preuve de volume
justifiant une optimisation supplémentaire (75 hôtels dans la fixture démo,
rendu instantané en local).

## S. Cache

Déjà documenté (Phase 5, P2, reconfirmé ici par relecture de
`lib/mygo/search-core.ts`/`client.ts`) : clé de cache
`mygo:search:${stableHash(body)}` ne contient aucun identifiant tenant —
un résultat cache est potentiellement partagé entre agences pour une même
recherche. Aucune fuite de prix incorrect (aucune marge tenant-spécifique
appliquée à ce niveau). **La revalidation myGo avant booking reste
obligatoire et inchangée** — le cache de recherche n'est jamais utilisé
comme autorité finale du prix au moment de la réservation (confirmé :
`BookingCreation` fait un appel myGo dédié, `preBooking` en dry-run
recommandé, jamais servi depuis le cache de recherche). Non corrigé cette
phase (nécessiterait de faire passer `agencyId`/contexte tenant dans la clé
de cache — changement du connecteur myGo/cache, hors périmètre sans
décision produit sur son utilité réelle vu l'absence de fuite de prix).

## T. Accessibility

Spot-check réel (Playwright, pas une revue WCAG exhaustive — mesure avant
modification) : drawer mobile filtres s'ouvre au clavier (Tab jusqu'au
déclencheur + Entrée) et se ferme via `Escape` — confirmé fonctionnel.
Composants sous-jacents (Radix Select/Checkbox, Vaul Drawer) sont déjà
conformes ARIA par construction (pas de réimplémentation custom trouvée
qui casserait cette conformité). Aucun problème trouvé qui justifierait un
changement de code dans le périmètre de cette phase.

## U. Security

Voir §L pour le détail (prix/markup non manipulable côté client,
credentials myGo jamais exposés). Aucune donnée sensible trouvée exposée
côté client : pas de clé API, pas de secret fournisseur, pas de marge
interne, pas d'information wallet dans les réponses `/api/hotels/search*`
(vérifié : `HotelSearchResultDTO` ne contient que `searchId/count/offers`,
`offers[].hotel/token/currency/fromPrice/recommended/boardings` — rien de
financier interne).

## V. E2E Tests

Scénario complet exécuté (Playwright, fixture démo `cityId=10`, 70 hôtels
réels — pas de `MYGO_LOGIN`/Supabase dans ce sandbox, cf. §AA) :

- Homepage-style deep link → `/hotels/search?cityId=10&checkin=...&
  checkout=...&adults=2&children=4,9&city=Hammamet` → résultats affichés
  ("70 hôtels à Hammamet"), aucun débordement horizontal à 390px avec les
  âges enfants dans l'URL.
- Filtre 4 étoiles → coché, appliqué.
- Filtre All Inclusive → coché, appliqué.
- Tri Prix croissant → appliqué, URL `sort=price_asc`.
- Prix des cards effectivement croissants avec le filtre de pension actif
  (1682 < 1691 < 1735 < 1761 TND) — confirme le fix §I/§G en conditions
  réelles, pas seulement en test unitaire.
- État vide (filtré à zéro) → message + bouton "Effacer tous les filtres"
  fonctionnel.
- État vide (zéro résultat total) → message + lien "Modifier la recherche"
  fonctionnel.
- Drawer mobile Filtres → ouverture clavier, fermeture Escape.

**BLOCKED, comme documenté depuis la Phase 5** : validation avec de
vraies offres myGo (au lieu de la fixture démo), `Room Détail → Booking →
Revalidation → réservation existante` de bout en bout, nécessite
`MYGO_LOGIN`/Supabase configurés — non disponibles dans ce sandbox.
Le flux de booking lui-même (`handleBookHotel`, `encodeDraft`,
`myGoToken/cityId/boardingId/roomId` transmis) n'a subi **aucune
modification** cette phase — vérifié par `git diff` (voir §W/§Z).

## W. Files Modified

- `lib/mygo/best-rate.ts` — exclusion `stopReservation`.
- `lib/mygo/sort.ts` — tri sur le prix réellement affiché.
- `lib/mygo/__tests__/best-rate.test.ts` — +3 tests.
- `lib/mygo/__tests__/sort.test.ts` — +2 tests.
- `app/hotels/search/page.tsx` — passe `filters.boardings` à `sortOffers`,
  wire `onClearFilters`.
- `components/hotel-listings.tsx` — état vide différencié.

**Non touchés (vérifié explicitement par `git diff --stat`)** :
`lib/mygo/client.ts`, `lib/mygo/mappers.ts`, `lib/mygo/facets.ts` (sauf
Phase 6, pas cette phase), `lib/mygo/degraded-mode.ts`,
`lib/mygo/use-hotel-search.ts`, `app/api/hotels/search*/route.ts`,
`lib/mygo/search-core.ts`, `lib/booking/*`, `lib/finance/*`,
`lib/pro/*`, tout fichier `components/pro/*`, `components/hotel-card.tsx`.

## X. Database Changes

Aucune. Aucun fichier `drizzle/` touché (confirmé `git diff --stat`).

## Y. MyGo Changes

Aucune. `MyGoClient` (requêtes, retry, circuit breaker, cache, XML/JSON
envoyé à myGo) strictement inchangé.

## Z. Booking Changes

Aucune. `lib/booking/actions.ts`, `lib/booking/hotel-provider-booking.ts`,
`lib/booking/pricing.ts`, `handleBookHotel` (page et `hotel-listings.tsx`)
inchangés — les deux bugs corrigés cette phase (§G/§I) sont strictement
en amont de l'affichage/tri, jamais dans le chemin de réservation.

## AA. Remaining Risks (classification P0-P3)

| # | Sévérité | Risque |
|---|---|---|
| 1 | 🟠 P1 | `/pro/hotels` sur données fixture, déconnecté du moteur myGo réel — nécessite une décision produit avant correctif (booking + pricing B2B), non pris ici (§N). |
| 2 | 🟡 P2 | Cache myGo non partitionné par tenant (§S) — pas de fuite de prix détectée, à durcir si une tarification différenciée par agence est introduite au niveau recherche. |
| 3 | 🟡 P2 | Pas de pagination — aucune preuve de volume la justifiant (§R), décision volontairement différée. |
| 4 | 🟢 P3 | Mode "Meilleure note" absent du Sort Engine — myGo n'a pas de notation utilisateur fiable, fabriquer ce tri aurait été un mensonge d'UI (§J). |
| 5 | 🔵 BLOCKED | Validation E2E avec vraies offres myGo (§V) — nécessite `MYGO_LOGIN`/Supabase, indisponibles dans ce sandbox. |

## AB. Phase 8 Recommendations

1. **Décision produit B2B** (P1, le seul item vraiment bloquant) : choisir
   entre (a) brancher `/pro/hotels` sur le moteur myGo réel partagé
   (réutiliser `lib/mygo/search-core.ts`, cohérent avec le reste de cette
   session) ou (b) documenter `/pro/hotels` comme outil de démonstration
   volontairement séparé — actuellement ambigu, ce qui est le vrai risque.
2. Si un volume de production réel apparaît (§R), réévaluer la pagination
   avec de vraies métriques plutôt qu'une estimation.
3. Si une tarification différenciée par agence est introduite au niveau
   recherche (pas seulement au niveau booking), partitionner la clé de
   cache myGo par tenant (§S) avant que ça devienne un vrai risque de prix.
4. Revue d'accessibilité WCAG complète (au-delà du spot-check §T) si ce
   niveau de rigueur devient un objectif explicite — non fait ici faute de
   preuve d'un problème réel, conformément à "mesurer avant de modifier".

## Git / Commits

```
$ git status (avant)
On branch claude/easy2book-v6-modernization-7gyb5v
nothing to commit, working tree clean

$ git log --oneline -6 (après)
5ca436e fix(hotels): differentiate empty-result states with real, working actions
a4eb84c fix(hotels): Best Rate Engine ignores stopReservation rooms; sort follows displayed price
2b12e8a docs: Phase 6 Hotels Tunisie report — audit + skeletons + mobile Vaul
...
```

Deux commits logiques, scope strictement Hotel Search/Results/UX — aucun
fichier hors périmètre modifié (confirmé `git diff --stat` avant chaque
commit). Gates : `pnpm typecheck / lint / test (236/236) / build` tous
verts après chaque fix.
