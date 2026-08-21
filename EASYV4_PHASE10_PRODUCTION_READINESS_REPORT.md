# EASYV4 — PHASE 10 — FINAL CROSS-MODULE QA + PRODUCTION READINESS

Audit transverse uniquement — aucun module n'a été reconstruit. Périmètre :
Vols, Hôtels Monde, Car, Hôtels Tunisie, Transferts, Omra, Packages.

## A. Executive Summary

Les 7 modules livrés sur les phases précédentes sont cohérents entre eux et
n'ont révélé aucune régression fonctionnelle. La QA transverse a trouvé et
corrigé un défaut réel et concret : **plusieurs points d'entrée de
recherche du moteur homepage (`components/booking-engine.tsx`) et du
formulaire Hôtels Tunisie (`components/hotels-tunisie-search.tsx`) avaient
des rôles ARIA/accessible-names manquants ou invalides**, ce qui cassait à
la fois le test E2E golden-path "Recherche Hôtels Tunisie" et plusieurs
pages du scan axe-core (Home, Booking). Corrigé au minimum (attributs
uniquement, aucune logique modifiée) ; les deux tests concernés passent
maintenant.

Aucun 404 trouvé sur les routes de recherche des 7 modules. Aucune donnée
fabriquée détectée. Aucune fuite de secret côté client détectée. Le module
Car est confirmé branché sur sa vraie base de données (aucune fixture
cachée). Le schéma DB est inchangé depuis la Phase 9. Le déploiement
Vercel reste bloqué sur un problème de propriété/scope que les outils
disponibles ne permettent pas de résoudre — documenté en section O, non
deviné.

## B. Module Matrix

| Module | Homepage→Form | Search State | URL | Route résultats | API/service | Results | Filters | Sort | Detail | Booking boundary |
|---|---|---|---|---|---|---|---|---|---|---|
| Vol | PASS | PASS | PASS | PASS | PASS (demo honnête) | PASS | PASS (direct/remboursable) | PASS | N/A (pas de détail séparé) | PARTIAL — désactivé volontairement |
| Hôtels Monde | PASS | PASS | PASS | PASS | PASS (demo honnête) | PASS | PASS (petit-déj/annulation) | PASS | N/A | PARTIAL — désactivé volontairement |
| Car | PASS | PASS | PASS | PASS | PASS (vraie DB) | PASS (ou état honnête "aucun tarif/véhicule") | N/A (une seule requête = un devis) | N/A | N/A | PARTIAL — nécessite session (hérité de Transfert) |
| Hôtels Tunisie | PASS | PASS | PASS | PASS | PASS (myGo réel) | PASS | PASS | PASS | PASS | PASS (B2B) / PARTIAL (B2C, gap déjà documenté) |
| Transfert | PASS | PASS | PASS | PASS | PASS (vraie DB) | PASS (devis) | N/A | N/A | N/A | PARTIAL — nécessite session |
| Omra | PASS | N/A (liste statique) | PASS | PASS (`/omra/[id]`) | PASS | PASS | N/A | N/A | PASS | Hors périmètre de cette phase |
| Packages | PASS | N/A (liste statique) | PASS | PASS (`/packages/[slug]`) | PASS | PASS | N/A | N/A | PASS | Hors périmètre de cette phase |

Aucune fonctionnalité volontairement désactivée (booking Vol/Hôtels Monde,
booking anonyme B2C) n'est comptée comme BUG — conforme à la consigne de
la mission.

## C. Route Matrix — 404 scan

Vérifié en direct (curl + navigateur) sur serveur dev local :

- `/vols` → `/vols/search` : **200**, aucune route morte.
- `/hotels-monde` → `/hotels-monde/search` : **200** (corrigé en Phase 9,
  confirmé toujours vert).
- `/car` → `/car/search` : **200** (corrigé en Phase 9, confirmé toujours
  vert), état honnête "Aucune agence de vente directe n'est configurée"
  en sandbox sans DB — comportement attendu, pas un bug.
- `/omra/[id]` et `/packages/[slug]` avec un id inexistant → **404**
  correct (`notFound()` applicatif, pas une route manquante). Les listes
  `/omra` et `/packages` sont vides en sandbox (pas de DB) — état honnête,
  pas de lien mort généré.
- Aucun bouton "Rechercher" des 7 modules ne pointe vers une route qui
  n'existe pas.

## D. Search State

- `lib/vols/search-state.ts` et `lib/hotels-monde/search-state.ts` :
  parsing/reconstruction de state canonique déjà couverts par tests
  unitaires (existants pour vols, ajoutés en Phase 9 pour hôtels monde) —
  relance : tous verts.
- Test E2E bout-en-bout (golden path) : Home → onglet Hôtels Tunisie →
  destination → dates → recherche → `/hotels/search` → résultats visibles.
  **Échouait avant cette phase** (rôles ARIA cassés, voir section F/I),
  **passe maintenant** après le fix minimal.
- Search → Filtres → Tri → Détail → Retour : le pattern
  `requestKey`/`fetchState` (Vols, Hôtels Monde, Hôtels Tunisie) garantit
  qu'un changement de query params déclenche un seul fetch et que l'état
  affiché correspond toujours à la dernière requête effective — vérifié à
  la lecture, inchangé depuis les phases précédentes.
- Search → Refresh : toutes les pages de résultats lisent l'état
  entièrement depuis l'URL (`useSearchParams`/`searchParams` serveur),
  aucun state React non persisté n'est nécessaire pour reconstituer les
  résultats après un refresh.

## E. Results

Aucun changement de code dans les moteurs de résultats eux-mêmes lors de
cette phase (Vols, Hôtels Monde, Hôtels Tunisie, Car, Transferts). Vérifié
que les 3 modules avec revalidation "douce" (re-fetch au montage de la
page de résultats) ne déclenchent qu'un seul appel par jeu de paramètres
identique (garde `requestKey`).

## F. Demo/Real Providers

Vérifié en conditions réelles sur serveur local (variables d'env
manipulées manuellement) :

- **Sans clé** (`FLIGHTS_API_KEY`/`WORLD_HOTELS_API_KEY` absentes) : les
  deux clients retournent des fixtures marquées `"source": "demo"`,
  jamais présentées comme une disponibilité réelle, bouton de réservation
  désactivé dans l'UI avec un message explicite.
- **Avec une clé configurée mais un fournisseur inatteignable** (clé
  factice + URL invalide) : testé en direct — `GET /api/vols/search` →
  `502 {"error":"fetch failed"}` ; `GET /api/hotels-monde/search` → `502
  {"error":"fetch failed"}`. **Aucun repli silencieux vers les fixtures
  démo** — conforme à l'exigence explicite de la mission. Le code ne
  contient d'ailleurs aucun chemin qui le permettrait : le bloc `catch`
  retourne toujours `{ok:false, error}`, jamais `buildDemoOffers()`.

## G. Car — DB integration audit

Relecture complète de `lib/cars/pricing.ts` et `lib/cars/actions.ts` :

- Aucune fixture cachée, aucun prix hardcodé — `calculateCarPrice` lit
  exclusivement `car_pricing_rates` (agencyId + categoryId + fenêtre de
  validité) et retourne `null` si rien n'est configuré ; l'appelant
  affiche alors un état "Aucun tarif configuré" (jamais un prix par
  défaut).
- Disponibilité : `checkCarAvailability` (dans `createCarBooking`) réutilise
  `car_availability` si une ligne existe pour la date, sinon retombe sur le
  compte réel de `car_fleet_vehicles` `status='available'` — jamais une
  disponibilité inventée ; en l'absence des deux sources, la réservation
  est refusée (`NO_AVAILABILITY`).
- Tenant/agency isolation : `agencyId` n'est jamais un champ accepté du
  client dans `CarBookingInput` — résolu uniquement via
  `runInTenantContext` (session) côté booking, ou `getDefaultAgencyId()`
  (agence OTA publique, même helper que `/transferts`) côté recherche
  publique.
- RLS : `car_locations`/`car_categories`/`car_fleet_vehicles`/
  `car_availability`/`car_pricing_rates`/`reservation_car` ont toutes une
  policy `agency_id = current_agency_id() OR is_super_admin()`
  (`drizzle/manual/0011_car_rental_rls.sql`, déjà en place, non modifiée).
  La lecture publique passe par `withSystemContext` (équivalent
  `is_super_admin`), filtrée explicitement sur l'agencyId résolu
  côté serveur — jamais un filtre côté client.
- **Aucune modification du modèle DB** dans cette phase ni la précédente.

**Point relevé, non corrigé (hors périmètre "ne pas modifier Transfert")** :
`calculateCarPrice` est un Server Action (`"use server"`), donc un
endpoint HTTP public appelable directement avec n'importe quel `agencyId`
en paramètre, en contournant l'UI — un appelant qui connaîtrait l'UUID
d'une agence partenaire pourrait lire son tarif/marge réels. C'est
exactement le même pattern que `calculateTransferPrice` (préexistant,
non introduit par cette phase) : reproduit fidèlement, pas une régression
nouvelle, mais un gap de durcissement partagé par les deux modules — voir
section I et P.

## H. B2C/B2B

- B2B Hôtels Tunisie (`/pro/hotels` → booking → wallet) : inchangé depuis
  Phase 9, non re-testé en profondeur (hors périmètre "ne pas refaire
  l'audit MyGo/Wallet") — seul le test E2E golden-path B2C a été rejoué.
- B2C anonyme (Transferts, Car) : le gap déjà documenté aux phases
  précédentes persiste à l'identique — `createTransferBooking`/
  `createCarBooking` exigent une session résolue (`runInTenantContext`),
  donc un visiteur anonyme obtient un devis en temps réel mais ne peut pas
  finaliser sans compte. Ce n'est pas une régression de cette phase ; ce
  n'était pas dans le périmètre à corriger ("NE PAS refaire Booking").

## I. Security

- Aucun secret/clé API dans le bundle client — scan systématique de tous
  les fichiers `"use client"` pour `process.env.*` non `NEXT_PUBLIC_` :
  aucune occurrence.
- `agencyId` jamais accepté depuis le client dans les nouveaux chemins
  (Car, Hôtels Monde) — toujours résolu côté serveur
  (`getCurrentPartnerProfile`, `runInTenantContext`, ou
  `getDefaultAgencyId()` pour le trafic public).
- Prix/marge jamais calculés ni acceptés côté client — `calculateCarPrice`/
  `calculateTransferPrice`/`applyMargin` s'exécutent toujours côté serveur,
  le montant réellement débité est recalculé au moment du booking, jamais
  lu depuis une valeur envoyée par le formulaire.
- **Gap de durcissement identifié (voir G)** : les Server Actions de
  pricing (Car, Transfert) acceptent un `agencyId` arbitraire de
  l'appelant. Impact réel limité (UUID non énumérable), mais recommandé
  pour une phase future : soit valider `agencyId === getDefaultAgencyId()`
  pour le chemin public, soit scinder un chemin "public" et un chemin
  "session partenaire" distincts. Non corrigé ici (modifier `pricing.ts`
  de Transfert est explicitement hors périmètre de cette phase).

## J. Mobile

Vérifié par un test Playwright ajouté (`e2e/mobile-overflow.spec.ts`,
`document.documentElement.scrollWidth` vs `clientWidth`) à 390px et
1440px, sur Home, Hôtels Tunisie (résultats), Hôtels Monde (accueil +
résultats), Vols (accueil + résultats), Car (accueil) : **14/14 puis
20/20 verts, aucun débordement horizontal détecté**. Filtres/recherche/
boutons/cards non vérifiés visuellement image par image (hors budget de
cette phase) mais l'absence d'overflow élimine la classe de bug la plus
fréquente sur mobile pour ce type de layout.

## K. Performance

Aucun problème évident trouvé dans le code ajouté/modifié en Phase 9-10 :
aucun `<img>` brut (pas de souci de lazy-loading introduit), garde
`requestKey` empêchant les doubles fetch sur Vols/Hôtels Monde/Hôtels
Tunisie. Aucune optimisation prématurée entreprise, conformément à la
consigne.

## L. Tests

- `pnpm typecheck` : clean.
- `pnpm lint` : 0 erreur, 119 warnings (baseline pré-existante, inchangée
  après les fixes de cette phase).
- `pnpm test` : **255/255** tests unitaires passent.
- E2E Playwright (chromium) :
  - `hotel-search.spec.ts` (golden path Hôtels Tunisie) : **cassé →
    corrigé → PASS**.
  - `a11y.spec.ts` : Home, Login, Booking **PASS** (Booking redirige vers
    Home sans état de recherche) ; Admin Dashboard/Admin Reservations
    **FAIL** — pré-existant, hors périmètre des 7 modules de cette phase
    (`<html>` sans `lang`/`<title>` sur `/admin`, potentiellement lié à
    l'absence de session admin en sandbox plutôt qu'un vrai bug — non
    creusé plus loin).
  - `mobile-overflow.spec.ts` (nouveau) : **20/20 PASS**.
  - `auth.spec.ts` et `booking-flow.spec.ts` : **FAIL**, mais dépendent
    tous les deux d'une vraie session Supabase / de données "offres
    flash" en base — indisponibles dans ce sandbox sans `DATABASE_URL`,
    limitation déjà documentée à chaque phase précédente, pas une
    régression de cette phase.
- Aucun test n'a été contourné pour obtenir du vert — chaque échec a été
  inspecté, sa cause racine identifiée, et soit corrigé (rôles ARIA), soit
  documenté comme limitation d'environnement/hors périmètre.

## M. Build

`pnpm build` : succès, toutes les routes des 7 modules se génèrent,
aucune régression sur les routes existantes (`/pro/*`, `/booking/*`,
`/transferts/*`, `/admin/*`).

## N. Database

Aucune migration créée ni modifiée dans cette phase. `git log --oneline
-- drizzle/` confirme qu'aucun commit touchant `drizzle/` n'a eu lieu
depuis la Phase 9. Le module Car utilise exclusivement les tables déjà
créées et RLS-protégées en Phase 9 (`0010_car_rental_module.sql`,
`0011_car_rental_rls.sql`).

## O. Vercel

Conformément à la consigne explicite de cette phase : **aucune tentative
de création, renommage ou modification du projet Vercel `easyv4`**.

État déjà établi lors d'une session précédente et non résolu depuis : le
projet `easyv4` retourne `409 already exists` à la création, mais
`list_projects`/`get_project` sur l'équipe `easy2book`
(`team_32LT0Y5AfZ3sMn86l736IXtD`, seule équipe visible via `list_teams`)
le renvoient tous les deux vides. Les outils disponibles dans cette
session ne permettent pas de déterminer sous quel compte/équipe le projet
existant se trouve réellement.

**Conclusion : Vercel ownership/scope requires user action.** Aucune
supposition n'a été faite, aucune action à l'aveugle n'a été tentée.

## P. Remaining blockers

1. **Déploiement Vercel** — bloqué sur la propriété/scope du projet
   existant (section O). Nécessite une vérification manuelle côté
   utilisateur dans le dashboard Vercel.
2. **A11y `/admin`** — `document-title`/`html-has-lang` manquants sur
   `/admin` et `/admin/reservations` en sandbox. Hors périmètre des 7
   modules de cette phase ; à vérifier séparément avec une vraie session
   admin (l'échec pourrait être un artefact du sandbox sans DB plutôt
   qu'un vrai bug de layout).
3. **Server Actions de pricing sans validation d'agencyId côté appelant**
   (Car + Transfert, section G/I) — gap de durcissement partagé, pas une
   régression de cette phase, nécessite une décision produit/archi avant
   correction (impacterait 2 modules à la fois).
4. **B2C anonyme** (Transferts, Car, Hôtels Tunisie) — gap déjà documenté
   aux phases précédentes, non résolu (hors périmètre).
5. **`auth.spec.ts`/`booking-flow.spec.ts`** — non vérifiables sans une
   vraie base de données/session Supabase dans ce sandbox.

## Q. Recommended next phase

- Résoudre la propriété Vercel (action utilisateur) puis effectuer un
  premier déploiement réel.
- Décider si `calculateCarPrice`/`calculateTransferPrice` doivent
  restreindre l'`agencyId` accepté depuis un appel public (point P.3).
- Si le B2C anonyme (booking sans compte) devient une priorité produit,
  cadrer cette décision d'architecture séparément — elle touche
  Hôtels Tunisie, Transferts et Car à la fois, pas un seul module.
- Peupler un vrai catalogue Car (lieux/catégories/tarifs) pour une agence
  OTA réelle et valider le parcours de bout en bout avec de vraies
  données, actuellement seulement vérifiable en `l'état honnête "aucune
  agence configurée"` faute de DB en sandbox.
