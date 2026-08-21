# Easy2Book — Audit critique de tous les moteurs de recherche

Audit uniquement — aucun code modifié dans ce document (conformément à la consigne
"NE MODIFIE PAS LE CODE AVANT D'AVOIR PRODUIT LA CARTOGRAPHIE"). Vérification manuelle
du cas de référence (`/vols`) effectuée directement, puis extension systématique aux 8
autres modules via une revue exhaustive du code source.

**Verdict global : le problème signalé sur `/vols` est confirmé, et le même
anti-pattern "double couche de recherche" existe identiquement sur 2 autres modules
(Hôtels Monde, Car) — 3 modules sur 9 sont des impasses à 404. 2 modules supplémentaires
(Omra, Voyages Organisés/Packages) ont un moteur de résultats réel mais une page de
détail cassée. Seuls Hôtels Tunisie et Transferts sont des parcours complets et sains.**

---

## A. Architecture actuelle

Le principe voulu (section 12/19 de la mission) est :

```
ONE BUSINESS SEARCH → ONE CANONICAL SEARCH ENGINE → ONE RESULTS FLOW
```

Dans la réalité du code, l'architecture homogène n'existe que pour 2 modules sur 9
(Hôtels Tunisie, Transferts). Pour les 7 autres, on trouve un des trois schémas suivants :

1. **Double formulaire + impasse 404** (Vols, Hôtels Monde, Car) : le widget de
   recherche de la homepage (`components/booking-engine.tsx`) envoie vers une route
   `/<module>?params`, qui affiche un **second formulaire de recherche indépendant**
   (composant différent, parfois avec un vocabulaire de champs différent) au lieu de
   résultats. Le second formulaire, lui, soumet vers une route `/<module>/search` qui
   **n'existe pas** → 404 garanti au deuxième clic.
2. **Auto-référence avec détail cassé** (Omra, Packages/Voyages Organisés) : la route
   `/<module>` est à la fois le formulaire ET la page de résultats (Server Component,
   requête DB réelle) — ce schéma fonctionne pour la recherche, mais le lien "voir le
   détail" pointe vers une route `[id]`/`[slug]` qui n'existe pas non plus.
3. **Parcours complet réel** (Hôtels Tunisie, Transferts) : un moteur, un état de
   recherche, une page de résultats réelle, un bridge de réservation réel.

## B. Carte complète des routes

| Module | Route homepage cible | Route "résultats" réellement atteignable | Existe ? |
|---|---|---|---|
| Vols | `/vols?origin=...` | `/vols/search?...` (cible du 2ᵉ formulaire) | ❌ n'existe pas |
| Hôtels Tunisie | `/hotels/search?...` (direct) | `/hotels/search` | ✅ |
| Hôtels Monde | `/hotels-monde?destination=...` | `/hotels-monde/search?...` (cible du 2ᵉ formulaire) | ❌ n'existe pas |
| Omra | `/omra?programme=...` | `/omra` (auto-référence) | ✅ mais détail `/omra/[id]` ❌ |
| Voyages Organisés / Packages | `/packages?destination=...` | `/packages` (auto-référence) | ✅ mais détail `/packages/[slug]` ❌ |
| Transferts | `/transferts/resultats?from=...` (direct) | `/transferts/resultats` | ✅ |
| Car | `/car?location=...` | `/car/search?...` (cible du 2ᵉ formulaire) | ❌ n'existe pas |
| Packages | (= Voyages Organisés, même route) | — | — |
| Booking/Checkout | `/booking?d=<draft>` | `/booking/travelers` → `/booking/checkout` → `/booking/confirmation/[ref]` | ✅ (hôtel uniquement) |

## C. Carte des Search Engines

| Module | Moteur réel ? | Détail |
|---|---|---|
| Vols | ⚠️ Existe mais inaccessible | `lib/vols/client.ts` (stub Amadeus/Sabre, fixtures démo), exposé via `app/api/vols/search/route.ts` (validé, rate-limité) — **jamais appelé par aucune page** |
| Hôtels Tunisie | ✅ Réel | myGo XML (`lib/mygo/client.ts`), partagé B2C/B2B via `lib/mygo/search-core.ts` |
| Hôtels Monde | ❌ Aucun | Pas de client, pas d'API, rien |
| Omra | ✅ Réel (DB) | Requête Drizzle directe sur `omraPackages`/`omraAllotments` dans le Server Component |
| Voyages Organisés / Packages | ✅ Réel (DB) | Requête Drizzle directe sur `catalogPackages`/`catalogPackageDepartures` |
| Transferts | ✅ Réel (DB) | `lib/transfers/pricing.ts::calculateTransferPrice()` sur zones DB réelles |
| Car | ❌ Aucun | `lib/db/schema/cars.ts` existe mais n'est référencé par **aucun** code de requête |
| Booking/Checkout | ✅ Réel (pour hôtel) | `lib/booking/actions.ts`, écritures DB réelles ; paiement explicitement **simulé** (`checkout-form.tsx`: "simulation") |

## D. Carte des APIs / providers

| Route API | Statut |
|---|---|
| `app/api/hotels/search-public/route.ts`, `app/api/hotels/search/route.ts` | ✅ réelles, partagent `lib/mygo/search-core.ts`, aucune duplication |
| `app/api/vols/search/route.ts` | ✅ implémentée mais **orpheline** — aucune page ne l'appelle |
| `app/api/transferts/*` | N/A — Transferts n'a pas d'API dédiée, tout passe par des Server Components + Server Actions (légitime) |
| `app/api/hotels-monde/*`, `app/api/car/*` | **Inexistantes** |
| `extra/lib/flights/gds-client.ts` + `extra/app/api/flights/search/route.ts` | 🗑️ **Second moteur vols indépendant**, hors de l'arbre `app/` actif (dossier `extra/`), non atteignable mais présent dans le repo — duplication de code, pas de risque runtime actuel |

## E. Matrice des modules

| Module | Entry | Search State | API | Engine | Results | Filters | Detail | Booking | Statut |
|---|---|---|---|---|---|---|---|---|---|
| Vols | `booking-engine.tsx:424` | ad-hoc `useState` ×2 | orpheline | fixtures démo | ❌ | ❌ | ❌ | ❌ | **BROKEN** |
| Hôtels Tunisie | `booking-engine.tsx:126` | typé (`lib/hotel-search/*`) | ✅ partagée B2C/B2B | myGo réel | ✅ | ✅ | ✅ | ✅ | **PASS** |
| Hôtels Monde | `booking-engine.tsx:639` | ad-hoc `useState` ×2 | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | **BROKEN** |
| Omra | `booking-engine.tsx:805` | ad-hoc `useState` | N/A (Server Component) | DB réel | ✅ | via SQL | ❌ 404 | ❌ non branché | **PARTIAL** |
| Voyages Organisés / Packages | `booking-engine.tsx:886` | ad-hoc `useState` | N/A (Server Component) | DB réel | ✅ | via SQL | ❌ 404 | ❌ non branché | **PARTIAL** |
| Transferts | `booking-engine.tsx:968` | ad-hoc `useState` | N/A (Server Component) | DB réel | ✅ (devis) | N/A | N/A | ✅ réel | **PASS** |
| Car | `booking-engine.tsx:1098` | ad-hoc `useState` ×2 | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | **NOT IMPLEMENTED** |
| Booking/Checkout | (hôtel uniquement) | token `encodeDraft` | N/A | DB réel | N/A | N/A | N/A | ✅ (hôtel seul) | **PASS (hôtel)** / **NON CÂBLÉ (5 autres modules déclarés)** |

## F. Liste des doublons

| # | Type | Détail |
|---|---|---|
| 1 | Formulaires dupliqués | Vols : `VolsForm` (`booking-engine.tsx:424`) vs `FlightSearch` (`components/vols/flight-search.tsx:56`) — champs différents (`class` vs `cabin`, pas de `tripType` sur le second) |
| 2 | Formulaires dupliqués | Hôtels Monde : `HotelsMondeForm` (`booking-engine.tsx:639`) vs `WorldHotelSearch` (`components/hotels-monde/world-hotel-search.tsx:51`) — casse différente (`checkin` vs `checkIn`) |
| 3 | Formulaires dupliqués | Car : `CarForm` (`booking-engine.tsx:1098`) vs `CarSearch` (`components/car/car-search.tsx:61`) — vocabulaires si différents qu'un mapping de traduction (`LOCATION_FROM_HOME`/`CATEGORY_FROM_HOME`) a dû être écrit pour les faire cohabiter |
| 4 | Formulaires redondants (non bloquants) | Omra : `OmratyForm` vs `OmraSearch` — mêmes noms de params, cible commune, pas d'impasse mais logique dupliquée inutilement |
| 5 | Formulaires redondants (non bloquants) | Voyages Organisés/Packages : `VoyagesOrganisesForm` vs `PackageSearch` — idem |
| 6 | Moteur dupliqué | Vols : `lib/vols/client.ts` (actif, orphelin) vs `extra/lib/flights/gds-client.ts` (hors arbre actif) — deux implémentations indépendantes de la même logique métier |
| 7 | Pipelines de réservation parallèles | 3 mécanismes de "booking bridge" distincts coexistent pour un concept que `MODULE_LABEL` traite comme unifié : `encodeDraft`/`/booking` (hôtel), `createTransferBooking` (transferts, autonome), `createOmraBooking` (omra, autonome, mais atteignable seulement depuis `/pro/sandbox` avec des données mockées) |

## G. Liste des redirections inutiles / cassées

| Origine | Redirection | Problème |
|---|---|---|
| `app/vols/page.tsx` | ré-affiche `FlightSearch` au lieu de résultats | Perd les paramètres de recherche réels de l'URL, ne lance rien |
| `FlightSearch` submit | `/vols/search?...` | Route inexistante — 404 |
| `app/hotels-monde/page.tsx` | ré-affiche `WorldHotelSearch` | Idem Vols |
| `WorldHotelSearch` submit | `/hotels-monde/search?...` | Route inexistante — 404 |
| `app/car/page.tsx` | ré-affiche `CarSearch` | Idem Vols |
| `CarSearch` submit | `/car/search?...` | Route inexistante — 404, et aucune API n'existerait de toute façon |
| `components/omra/omra-package-list.tsx:86` | `/omra/${pkg.id}` | Route `[id]` inexistante — 404 sur "voir le détail" |
| `components/packages/package-list.tsx:69` | `/packages/${pkg.slug}` | Route `[slug]` inexistante — 404 sur "voir le détail" |

## H. Liste des Search States

| Module | Type | URL reconstructible après refresh/deep-link ? |
|---|---|---|
| Hôtels Tunisie | Typé (`lib/hotel-search/*`), + filtres/tri persistés dans l'URL (`f_*`, `sort`, `rooms`) | ✅ Oui — vérifié dans les sessions précédentes de cet audit |
| Vols | `useState` ad-hoc, deux implémentations différentes | ⚠️ Partiel — les params homepage et les params du 2ᵉ formulaire ne se correspondent même pas 1:1 (`class` vs `cabin`) |
| Hôtels Monde | `useState` ad-hoc ×2 | ⚠️ Partiel, même problème de casse de params |
| Omra | `useState` ad-hoc, mais résultats pilotés par les vrais query params (`programme`, `month`, `pilgrims`) | ✅ Oui pour les résultats (Server Component), pas de state client à perdre |
| Voyages Organisés/Packages | Idem Omra | ✅ Oui pour les résultats |
| Transferts | `useState` ad-hoc, résultats pilotés par les vrais query params | ✅ Oui pour le devis (Server Component) |
| Car | `useState` ad-hoc ×2 | ❌ Sans objet — aucun résultat n'existe de toute façon |

**Aucun module ne stocke son Search State *uniquement* en mémoire React sans le
refléter dans l'URL au moment de la recherche** — le problème n'est donc pas la
persistance de l'état, c'est que 3 modules perdent cet état en le repassant dans un
second formulaire au lieu de l'utiliser pour lancer une vraie recherche.

## I. Liste des problèmes critiques

| # | Sévérité | Problème |
|---|---|---|
| 1 | 🔴 CRITICAL | Vols : parcours de recherche totalement cassé (double formulaire → 404) |
| 2 | 🔴 CRITICAL | Hôtels Monde : identique à Vols, aucun module (formulaire, API, moteur) ne fonctionne |
| 3 | 🔴 CRITICAL | Car : identique à Vols, et c'est le module le moins avancé de toute l'app (zéro backend, zéro fixture) |
| 4 | 🟠 HIGH | Omra : lien de détail mort (404), booking bridge existant mais non branché au flux public |
| 5 | 🟠 HIGH | Packages/Voyages Organisés : lien de détail mort (404), aucun booking bridge du tout |
| 6 | 🟡 MEDIUM | Formulaires dupliqués redondants sur Omra/Packages (pas d'impasse, mais logique dupliquée à maintenir deux fois) |
| 7 | 🟢 LOW | Moteur vols dupliqué dans `extra/` (hors arbre actif, aucun risque runtime actuel) |
| 8 | 🟢 LOW | 3 pipelines de réservation distincts pour un concept censé être unifié (`MODULE_LABEL`) |

## J. Plan de consolidation (proposé, non exécuté)

**Ordre de priorité recommandé** (root cause → impact → solution → fichiers), sans
rien exécuter à ce stade :

1. **Vols** (CRITICAL) — root cause : la homepage et `/vols` utilisent deux
   formulaires distincts avec des vocabulaires de champs incompatibles, et le second
   formulaire cible une route jamais construite. Solution la plus sûre : soit (a)
   faire pointer directement le formulaire homepage vers une vraie page de résultats
   qui appelle l'API déjà existante et fonctionnelle (`app/api/vols/search/route.ts`),
   en supprimant le second formulaire redondant ; soit (b), si le vrai fournisseur
   (Amadeus/Sabre) n'est pas prêt commercialement, désactiver proprement l'onglet
   "Vols" de la homepage plutôt que de laisser un 404 en production. Fichiers :
   `app/vols/page.tsx`, `components/vols/flight-search.tsx`,
   `components/booking-engine.tsx`, nouveau `app/vols/search/page.tsx`.
2. **Hôtels Monde** (CRITICAL) — même schéma que Vols mais sans même un moteur
   backend. Décision produit requise : construire le moteur (quel fournisseur ?) ou
   désactiver l'onglet en attendant. Ne pas laisser un 404 accessible depuis la
   homepage.
3. **Car** (CRITICAL) — module le moins avancé, mêmes options que Hôtels Monde.
4. **Omra / Packages** (HIGH) — root cause commune : détail `[id]`/`[slug]` jamais
   construit. Solution plus contenue : ajouter les deux pages de détail manquantes et
   brancher un vrai booking bridge (probablement en réutilisant le pattern
   `encodeDraft`/`/booking` déjà supporté par `MODULE_LABEL` pour ces types).
5. **Formulaires redondants** (MEDIUM) — pour Omra/Packages/Transferts, envisager de
   faire pointer le formulaire homepage directement vers la route de résultats
   (comme Hôtels Tunisie et Transferts le font déjà) plutôt que de maintenir un
   second composant de formulaire quasi identique.

## K. Architecture cible

```
Homepage (booking-engine.tsx)
   │  UN SEUL formulaire par module (pas de doublon)
   ▼
/<module>/search?<params réels>
   │
   ▼
Route de résultats dédiée (jamais un formulaire nu)
   │
   ▼
Search Engine canonique (1 par module — réutilisé B2C/B2B si applicable,
comme lib/mygo/search-core.ts le fait déjà pour Hôtels Tunisie)
   │
   ▼
Résultats + Filtres/Tri (côté client, sans nouvel appel fournisseur)
   │
   ▼
Détail (route [id]/[slug] réelle)
   │
   ▼
Booking bridge unique (idéalement le pipeline générique /booking déjà conçu
pour 6 types de modules dans MODULE_LABEL, plutôt que 3 pipelines parallèles)
```

## L. Fichiers concernés (pour un futur correctif, non modifiés ici)

- `components/booking-engine.tsx` (tous les formulaires homepage)
- `app/vols/page.tsx`, `components/vols/flight-search.tsx`, `app/api/vols/search/route.ts`
- `app/hotels-monde/page.tsx`, `components/hotels-monde/world-hotel-search.tsx`
- `app/car/page.tsx`, `components/car/car-search.tsx`, `lib/db/schema/cars.ts`
- `app/omra/page.tsx`, `components/omra/omra-package-list.tsx`, `components/omra/omra-booking-form.tsx`
- `app/packages/page.tsx`, `components/packages/package-list.tsx`
- `extra/lib/flights/gds-client.ts`, `extra/app/api/flights/search/route.ts` (à évaluer pour suppression — code mort dupliqué)

## M. Tests à effectuer (une fois un correctif choisi)

- Recherche complète Vols/Hôtels Monde/Car avec paramètres réalistes → vérifier
  qu'on atteint une vraie page de résultats, pas un 404 ni un formulaire vide.
- Clic "voir le détail" sur un résultat Omra et Packages → vérifier que la page de
  détail existe et affiche les bonnes données.
- Refresh / deep-link / navigation arrière sur chaque module corrigé → vérifier que
  l'état de recherche se reconstruit depuis l'URL.
- Vérifier qu'aucun clic de filtre/tri ne redéclenche un appel fournisseur inutile
  (déjà validé pour Hôtels Tunisie ; à revalider pour tout module dont le moteur
  changerait).
- Non-régression : `pnpm typecheck && pnpm lint && pnpm test && pnpm build`.

## N. Risques

1. **Risque business le plus visible** : un visiteur qui clique "Vols", "Hôtels
   Monde" ou "Location de voiture" depuis la homepage — trois des sept onglets du
   moteur de recherche vitrine — tombe systématiquement sur une impasse (404 ou
   formulaire qui ne mène nulle part). C'est le module Vols qui a été signalé, mais
   le même problème touche 3 modules sur 7 visibles en page d'accueil.
2. **Risque de confusion produit** : Omra et Packages *semblent* fonctionner
   (recherche + résultats réels) jusqu'à ce que l'utilisateur clique sur un résultat
   — le premier vrai test utilisateur bout-en-bout échoue systématiquement au moment
   du "voir le détail".
3. **Risque de decision non prise** : sans arbitrage produit sur Hôtels Monde/Vols/Car
   (construire le vrai fournisseur vs désactiver l'onglet), rien de ce rapport ne
   peut être corrigé "proprement" — masquer un onglet cassé est une option
   temporaire légitime à considérer en attendant.
4. **Aucun risque de sécurité/financier direct** trouvé ici (contrairement aux audits
   précédents de cette session sur le wallet/RLS) — ces problèmes sont des ruptures
   de parcours UX, pas des failles de données ou de paiement.

---

## Classification finale (section 18 de la mission)

| Sévérité | Modules concernés |
|---|---|
| **CRITICAL** | Vols, Hôtels Monde, Car |
| **HIGH** | Omra (détail cassé), Packages/Voyages Organisés (détail cassé) |
| **MEDIUM** | Formulaires redondants Omra/Packages (fonctionnels mais dupliqués) |
| **LOW** | Moteur vols dupliqué dans `extra/` (code mort, pas de risque runtime) |
| **INFO** | 3 pipelines de booking parallèles pour un concept déclaré unifié |
