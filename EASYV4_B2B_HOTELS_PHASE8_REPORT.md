# EASY2BOOK — Phase 8 — B2B Hotel Search: Decision + Targeted Implementation

Périmètre strict : `/pro/hotels` (SERP), le moteur B2C existant (référence,
non ré-audité — voir `EASYV4_HOTELS_RESULTS_PHASE7_REPORT.md`, considéré
fonctionnel et validé), et le pont entre les deux. Aucun ré-audit global,
MyGo, Wallet, ou DB.

## 1. Current architecture (avant cette phase)

`/pro/hotels` (`app/pro/(app)/hotels/page.tsx`) était un Server Component
lisant `lib/pro/hotels-fixture.ts` — **10 hôtels statiques**, avec
`listProHotels(_filter)` dont le paramètre de filtre était **littéralement
non utilisé** (`// TODO: implement real filtering when connected to live
data`) : la recherche ignorait déjà `cityId`/dates/pax avant cette phase.
`HotelsSerp` (`components/pro/hotels-serp.tsx`) réimplémentait ensuite son
propre filtrage/tri en mémoire sur ce jeu fixe. La marge agence
(`applyMarginsToHotel`) était bien appliquée — mais sur des prix fictifs.
`/pro/hotels/[id]` suivait le même schéma (`getProHotelById`,
`HotelRoomSelector`) et alimentait le tunnel de réservation
`booking-travelers-form.tsx`/`lib/pro/booking-context.ts`, déjà documenté
en Phase 5/7 comme P1 : aucune métadonnée myGo réelle dans ces
réservations, `confirmHotelWithProvider()` y renverrait `{attempted:
false}`.

## 2. B2C engine reused

Aucune duplication introduite. Réutilisé **tel quel** :
- `lib/mygo/search-core.ts` — `HotelSearchQuerySchema`,
  `validateSearchDateRange`, et le moteur lui-même (nouveau
  `runHotelSearch()`, voir §7 — extraction pure du corps déjà existant
  d'`executeHotelSearch`, comportement HTTP inchangé pour les deux routes
  existantes, vérifié).
- `lib/mygo/facets.ts` — `computeFacets`, `applyFilters`.
- `lib/mygo/sort.ts` — `sortOffers`.
- `lib/mygo/best-rate.ts` — utilisé indirectement via `sortOffers`
  (Phase 7).
- `components/filter-sidebar.tsx` — `FilterSidebar`, `FilterChips`,
  `MobileFilterSortBar` (drawer mobile Vaul + squelettes déjà corrects
  depuis les Phases 6-7, inclus gratuitement).
- `components/sort-select.tsx` — `SortSelect`.

**Non réutilisé, décision explicite** (voir §4) : `components/
hotel-listings.tsx`/`components/hotel-card.tsx` (B2C) — couplés en dur au
pont de réservation B2C (`encodeDraft` → `/booking`, wallet B2C) et à la
fiche hôtel publique `/hotels/[id]`. Les réutiliser aurait routé un agent
B2B vers le mauvais tunnel de réservation — pas une simplicité UI à
gagner, un vrai risque métier à éviter.

## 3. B2B differences

| | B2C (`/hotels/search`) | B2B (`/pro/hotels`, après cette phase) |
|---|---|---|
| Moteur | `runHotelSearch` (démo/réel) | **Même** `runHotelSearch`, appelé directement (pas de HTTP) |
| Filtres/tri/facets | `lib/mygo/facets.ts`/`sort.ts` | **Mêmes fonctions** |
| UI filtres/tri | `FilterSidebar`/`MobileFilterSortBar` | **Mêmes composants** |
| Prix affiché | `fromPrice` myGo, aucune marge | `fromPrice` + marge agence (`applyMarginToHotelOffer`) |
| Carte résultat | `HotelCard`/`hotel-listings.tsx` (B2C) | Nouvelle carte minimale (`ProHotelResultCard`, dans `pro-hotel-results.tsx`) — champs réels uniquement |
| Réservation | Réelle (pont `/booking`) | **Désactivée**, CTA "bientôt" documenté (P1, voir §9) |
| Détail hôtel / chambres | `/hotels/[id]` réel | `/pro/hotels/[id]` reste sur fixture, non lié depuis cette page |

## 4. Fixtures

`lib/pro/hotels-fixture.ts` **non supprimé, non modifié** — toujours
utilisé par `/pro/hotels/[id]`, `HotelSummaryCard`, `HotelRoomSelector`,
le tunnel de réservation B2B. `components/pro/hotels-serp.tsx`, `hotels-
filters.tsx`, `hotel-card.tsx` (pro) : également non modifiés, désormais
orphelins de la SERP (plus jamais rendus depuis `/pro/hotels/page.tsx`),
mais toujours présents dans le repository.

**Pourquoi ne pas les avoir adaptés à `HotelOfferDTO` (mapping minimal)** :
examiné et rejeté. `ProHotel.boardings: HotelBoardingItem[]` est un **enum
figé à 4 codes** (`bb/hb/fb/ai`) alors que les pensions myGo réelles ont
des noms arbitraires — mapper l'un vers l'autre exige de deviner des
correspondances. `ProRoom.prices: Record<HotelBoarding, number>` suppose
**une seule liste de chambres partagée**, prix variant par pension — le
modèle myGo réel est `boarding → pax → rooms`, où des chambres
**différentes** existent par pension (pas la même chambre à 4 prix
différents). Forcer les vraies données dans cette forme aurait exigé
d'inventer des correspondances chambre-à-chambre ou pension-à-pension —
exactement le type de donnée fabriquée que cette session a refusé à
chaque phase précédente (prix, notes, disponibilité). D'où la décision de
`components/pro/pro-hotel-results.tsx` : une carte neuve, minimale,
n'affichant que des champs réellement présents dans `HotelOfferDTO`.

## 5. Security

Audité, **non modifié** — déjà correct :
- `getActivePartnerMargins()` (`lib/pro/server-context.ts`) résout
  l'agence **strictement depuis la session authentifiée**
  (`getCurrentPartnerProfile` → `resolve_session_context()`, le même
  bootstrap RLS-safe que `/pro/(app)/layout.tsx`), jamais depuis un
  paramètre client. `getMarginsForAgency(agencyId)` interroge
  `pricing_margins` sous `withTenantContext({agencyId, ...})` — isolation
  tenant déjà correcte.
- Les résultats de recherche hôtel eux-mêmes ne portent **aucune donnée
  d'agence** (l'inventaire myGo n'est pas scopé par tenant) — le seul
  risque de fuite cross-agence concevable ici est la **marge appliquée**,
  déjà correctement isolée comme ci-dessus. Aucune fuite trouvée.
- `/pro/(app)/layout.tsx` (protection de route, non touché) toujours
  actif — vérifié en direct : une requête anonyme sur `/pro/hotels`
  redirige toujours vers `/pro/login?next=%2Fpro%2Fhotels` (307), exact
  comportement d'avant cette phase.
- **Finding documenté, non exploité** : `requirePartnerSession`
  (`lib/api/auth-guard.ts`, garde HTTP de `/api/hotels/search`) a pour
  rôles par défaut `["super_admin", "manager", "agent_resa"]` — **sans**
  `partner_owner`/`partner_agent`, les rôles réels des agences partenaires
  côté `/pro` (`getCurrentPartnerProfile`). Un commentaire de
  `lib/auth/admin-gate.ts` révèle que `manager`/`agent_resa` sont en fait
  des rôles **partagés** entre le staff interne Easy2Book et le personnel
  d'agences partenaires (distingués par `agency_type`, pas par le rôle
  seul) — la taxonomie exacte des rôles autorisés sur cette route HTTP
  n'est pas évidente à trancher sans risque de mal comprendre un système
  de rôles déjà marqué comme site d'un bug de sécurité corrigé
  précédemment (voir le commentaire cité). **Non deviné, non modifié** —
  contournable proprement en appelant `runHotelSearch` directement
  (§2/§7), ce qui a été fait, évitant cette zone d'ambiguïté entièrement.
  Si un jour `/api/hotels/search` doit être appelé en HTTP pour un usage
  B2B (ex. un futur client mobile), cette question de rôles devra être
  tranchée explicitement.

## 6. Pricing

`applyMarginToHotelOffer(offer, margins)` (`lib/pro/pricing.ts`, nouveau) —
applique `applyMargin` (formule existante et inchangée) à chaque prix de
chambre (`boardings[].pax[].rooms[].price`) et à `fromPrice`, immuablement.
Marge appliquée **avant** `computeFacets`/`applyFilters`/`sortOffers` —
cohérent avec la leçon de la Phase 7 (filtrer/trier doit opérer sur le prix
réellement affiché, jamais sur un prix net qui serait ensuite marginé
après coup et donc incohérent avec l'ordre/les bornes de prix montrés).

## 7. Implementation

Fichiers modifiés/créés (2 commits) :
- `lib/mygo/search-core.ts` — extraction de `runHotelSearch()` (résultat
  pur, sans `NextResponse`) ; `executeHotelSearch()` devient une fine
  couche HTTP au-dessus, comportement identique pour `/api/hotels/search`
  et `/api/hotels/search-public` (vérifié : headers `Cache-Control`/
  `X-Degraded-Mode`/`X-From-Cache`/`x-demo-mode`/`Retry-After` tous
  préservés à l'identique).
- `lib/pro/pricing.ts` — `applyMarginToHotelOffer`.
- `app/pro/(app)/hotels/page.tsx` — réécrit : parse `HotelSearchQuerySchema`
  depuis les `searchParams`, appelle `runHotelSearch` (jamais de HTTP vers
  sa propre route), applique la marge, rend `ProHotelResults`. États
  honnêtes pour destination "chaîne/région/toute la Tunisie" (aucun
  `cityId` unique résolvable → message explicite plutôt qu'un résultat
  vide/inventé), dates manquantes/invalides, erreur fournisseur, mode
  dégradé (bannière, réutilise le texte déjà établi côté B2C).
- `components/pro/pro-hotel-results.tsx` — nouveau, shell client
  interactif (filtres/tri via URL, comme `/hotels/search`), carte
  résultat minimale honnête, CTA réservation désactivé et expliqué.

## 8. Tests

Ajoutés uniquement les tests nécessaires (mission §7) :
- `lib/mygo/__tests__/search-core.test.ts` (+2) : `runHotelSearch` en mode
  démo renvoie les vraies offres du fixture pour une ville connue ; une
  ville inconnue renvoie zéro résultat sans erreur (pas un résultat
  inventé pour combler l'absence de correspondance).
- `lib/pro/__tests__/pricing.test.ts` (+2) : `applyMarginToHotelOffer`
  marque correctement chaque prix + `fromPrice` sans mutation de l'offre
  d'origine ; une marge inactive laisse les prix inchangés.

**Non réécrits** : aucun test B2C existant modifié (mission §7 — "ne pas
réécrire les tests déjà validés").

**Isolation cross-agence** : pas de nouveau test dédié — le mécanisme
(`withTenantContext`, RLS `pricing_margins`) est déjà exercé par les tests
existants de `getMarginsForAgency`/tenant-context (non dupliqués ici,
cf. mission §10 "ne refais pas l'audit Wallet/DB"), et le point réellement
neuf de cette phase (`applyMarginToHotelOffer`) est une fonction pure
sans accès DB — rien à isoler côté tenant à ce niveau, l'agence est déjà
résolue en amont par du code non touché.

Gates :
```
pnpm typecheck   → 0 erreur
pnpm lint        → 0 erreur (118 avertissements pré-existants, inchangés)
pnpm test        → 240/240 passent (+4 nouveaux)
pnpm build       → réussi, /pro/hotels et /pro/hotels/[id] toujours présents
```

Vérification manuelle : `/pro/hotels` sans session → redirige toujours
vers `/pro/login` (gate intact) ; `/api/hotels/search-public` et
`/hotels/search` (B2C) → réponses identiques avant/après le refactor
`search-core.ts` (curl + Playwright, fixture démo, 70 offres). **BLOCKED**
comme dans chaque phase précédente : parcours complet de `/pro/hotels`
authentifié non exécutable dans ce sandbox (pas de session Supabase
configurée).

## 9. Remaining business decisions

Ces points ne sont **pas devinés** — décision produit requise avant tout
code supplémentaire :

1. **Booking B2B réel** (le vrai blocage) : brancher `/pro/hotels/[id]` +
   `HotelRoomSelector` + le tunnel de réservation sur les vraies données
   myGo (au lieu du fixture) exige de faire transiter les métadonnées
   `myGoToken/cityId/boardingId/roomId` jusqu'à `BookingCreation`, exactement
   le P1 déjà documenté en Phase 5/7. Nécessite une décision explicite sur
   la source de vérité (myGo réel vs fixture volontairement conservé comme
   outil de démo) avant tout développement — pas tranché ici, conformément
   à "NE PAS modifier BookingCreation sans nécessité démontrée."
2. **Rôles HTTP `/api/hotels/search`** (§5) : si cette route doit un jour
   être appelée en HTTP par un client B2B (plutôt que server-side comme
   fait ici), la liste de rôles `requirePartnerSession` doit être
   explicitement décidée (inclure `partner_owner`/`partner_agent` ou non)
   — non deviné dans cette phase, contournement délibéré via l'appel
   direct `runHotelSearch`.
3. **Format d'affichage prix B2B** (mineur, non bloquant) : cette phase
   affiche uniquement le prix final marginé (comme le faisait déjà le
   fixture). Si un agent doit un jour voir le détail net + marge côte à
   côte, c'est une décision produit d'affichage, pas une contrainte
   technique — `marginDelta()` existe déjà et pourrait l'alimenter sans
   nouveau calcul.
4. **Destinations "chaîne"/"région"/"toute la Tunisie"** : non supportées
   pour la recherche réelle (myGo exige un `cityId` unique par requête).
   Les proposer à nouveau nécessiterait soit un fan-out multi-villes (coût/
   complexité à évaluer), soit leur suppression du sélecteur — décision
   produit, non tranchée ici (actuellement : message explicite invitant à
   choisir une ville précise, jamais un résultat vide silencieux).
