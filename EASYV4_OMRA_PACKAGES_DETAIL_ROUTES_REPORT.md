# EASY2BOOK — Omra / Voyages Organisés / Packages : correction des routes Detail

Périmètre strict de cette phase, sur la branche
`claude/easy2book-v6-modernization-7gyb5v` : uniquement Omra et Voyages
Organisés/Packages. Aucun fichier Vols, MyGo, Hôtels Tunisie, Transferts,
Wallet, Hôtels Monde ou Car n'a été touché.

## Git — avant

```
$ git status
On branch claude/easy2book-v6-modernization-7gyb5v
Your branch is up to date with 'origin/claude/easy2book-v6-modernization-7gyb5v'.
nothing to commit, working tree clean

$ git log --oneline -10
2597122 docs: Vols Results Layer reconstruction report
dda7510 feat(vols): reconstruct the flights Results Layer — 404 to bookable search
fa9ee6e docs: audit of all 9 search-engine modules (double search layer anti-pattern)
e1ab25c Merge pull request #32 from Hassen02020/claude/easy2book-v6-modernization-7gyb5v
cdc638f feat: wire real cancellation+refund, voucher download, and pro wallet recharge
9cc1830 Merge pull request #31 from Hassen02020/claude/easy2book-v6-modernization-7gyb5v
ee91eee feat: public B2C hotel search, separate from the B2B-authenticated route
ae090d1 Merge pull request #30 from Hassen02020/claude/easy2book-v6-modernization-7gyb5v
5bda7ee fix: gate /pro/utilisateurs (agency user management) to partner_owner only
f4c76fa feat: hotel search engine — sort, persisted filters, best rate, multi-room
```

La phase Vols (commits `dda7510`/`2597122`) était déjà terminée et poussée
avant le début de ce travail — confirmé non mélangé : le diff de cette phase
ne touche que 2 nouveaux fichiers, tous les deux sous `app/omra/` et
`app/packages/`.

## Problème initial (rappel — EASYV4_SEARCH_ENGINES_AUDIT_REPORT.md)

| # | Sévérité | Problème |
|---|---|---|
| 4 | 🟠 HIGH | Omra : lien de détail mort (404), booking bridge existant mais non branché au flux public |
| 5 | 🟠 HIGH | Packages/Voyages Organisés : lien de détail mort (404), aucun booking bridge du tout |

`components/omra/omra-package-list.tsx:86` liait déjà vers `/omra/${pkg.id}`
et `components/packages/package-list.tsx:69` vers `/packages/${pkg.slug}` —
mais ni l'une ni l'autre route n'existait. Le catalogue (recherche + liste)
fonctionnait déjà correctement avec de vraies données DB (Drizzle direct sur
`omraPackages`/`omraAllotments` et `catalogPackages`/`catalogPackageDepartures`)
— seule la couche Détail manquait.

## Cause racine

Personne n'avait jamais créé `app/omra/[id]/page.tsx` ni
`app/packages/[slug]/page.tsx`. Aucun bug dans le moteur de catalogue
lui-même.

## Ce qui a été fait

### `app/omra/[id]/page.tsx` (nouveau)

Server Component, même pattern que `app/omra/page.tsx` (`withSystemContext`,
requête Drizzle directe, catalogue public anonyme) :
- Récupère le package par `id` (garde regex UUID avant la requête SQL, pas de
  quote-injection possible de toute façon avec Drizzle, mais évite une
  requête inutile sur un id manifestement invalide) et `status = 'active'`
  uniquement. `notFound()` sinon.
- Récupère les allotements réellement actifs, futurs et disponibles
  (`status='active'`, `availableCount >= 1`), triés par date de départ —
  aucune disponibilité inventée.
- Affiche : type de package, description, inclusions/exclusions dérivées des
  6 booléens réels du schéma (`includesVisa/Flights/Hotels/Transfers/Ziarat/Guide`),
  durée, capacité min/max, liste des départs avec places restantes et prix
  (prix spécifique de l'allotement si défini, sinon prix de base du package).

### `app/packages/[slug]/page.tsx` (nouveau)

Même pattern, sur `catalogPackages`/`catalogPackageDepartures` :
- Récupère le package par `slug` + `status='active'`. `notFound()` sinon.
- Récupère les départs `status='open'`, futurs, avec calcul des places
  restantes (`totalSeats - bookedSeats`) fait au moment de la requête plutôt
  que stocké — puis filtre les départs complets.
- Affiche : image de couverture (mêmes conventions Next/Image que
  `PackageList`, aucune nouvelle config nécessaire), description longue,
  inclusions/exclusions (colonnes `text[]` réelles), itinéraire jour par jour
  — rendu uniquement si la donnée `jsonb` correspond effectivement à la forme
  `{day, title, description}[]` déjà utilisée ailleurs dans le schéma
  (`lib/db/schema.ts:1245`), sinon simplement omis (pas de donnée inventée).

## Décision Booking — documentée, pas construite

Conformément à "ne pas créer de nouveaux moteurs" :

- **Omra** : `createOmraBooking` (`lib/omra/booking-actions.ts`) est réel,
  transactionnel, protégé contre le surbooking (`FOR UPDATE`) — mais exige
  une session partenaire authentifiée (`resolveSessionContext()`) et débite
  le **wallet de l'agence**. C'est une action B2B, aujourd'hui accessible
  uniquement depuis `/pro/sandbox` avec des données mockées
  (`MOCK_PACKAGES`/`MOCK_ALLOTMENTS` dans `omra-booking-form.tsx`). La
  brancher sur un bouton "Réserver" public aurait échoué silencieusement
  pour tout visiteur anonyme — exactement le gap déjà documenté cette
  session pour le B2C Checkout (audit UI Wiring, flux critique #4).
- **Packages** : aucun moteur de réservation n'existe, ni B2C ni B2B (recherche
  confirmée : aucun `createPackageBooking` dans `lib/`). Le construire est
  hors périmètre de cette phase.

Les deux pages affichent donc un CTA réel et fonctionnel — contact
téléphone/WhatsApp (`+216 98 140 514`) — plutôt qu'un bouton de paiement
simulé, cohérent avec l'état vide déjà utilisé par `OmraPackageList` et
`PackageList` ("Contactez-nous au..."). Un branchement B2B propre pour Omra
(page `/pro/omra/[id]` réutilisant `OmraBookingForm` avec de vraies données
au lieu des mocks) et un moteur de réservation Packages restent des gaps
identifiés pour une phase dédiée future.

## Fichiers créés

- `app/omra/[id]/page.tsx`
- `app/packages/[slug]/page.tsx`

## Fichiers modifiés

Aucun — les composants `OmraPackageList`/`PackageList` liaient déjà vers les
bonnes routes ; il n'y avait rien à changer côté liste.

## Fichiers supprimés

Aucun.

## Tests

Gates automatisés :
```
$ pnpm typecheck   → 0 erreur
$ pnpm lint        → 0 erreur (avertissements restants tous pré-existants,
                       sans rapport avec ce chantier)
$ pnpm test        → 228/228 passent (aucune régression)
$ pnpm build       → build de production réussi ; /omra/[id] et
                       /packages/[slug] présents dans la table des routes
```

Vérifications manuelles (dev server + curl/Playwright) :
- `/omra` et `/packages` (listes) : toujours 200, état vide affiché —
  cohérent avec la réalité actuelle de la base (voir limitation ci-dessous).
- `/omra/00000000-0000-0000-0000-000000000000` → 404 propre (`notFound()`),
  pas de crash.
- `/omra/not-a-uuid` → 404 propre (la garde regex UUID empêche une requête
  SQL inutile sur un id malformé), pas de crash.
- `/packages/some-random-slug` → 404 propre, pas de crash.

**Limitation de test assumée** : je n'ai pas pu vérifier en direct le rendu
d'une page Détail avec un vrai package (description, inclusions, départs).
Vérifié : `omra_packages` et `catalog_packages` sont **vides** dans la base
de production (`vqhuptgjhoornteibbpj`, requête directe via Supabase MCP) —
il n'existe donc aucun vrai package à parcourir, ni en production ni en
local (ce bac à sable n'a pas de `DATABASE_URL`). Insérer des lignes de test
dans la base de production partagée pour la démo aurait exposé des données
factices sur le site réel le temps du test — jugé plus risqué que la valeur
de la vérification, donc non fait. Le rendu du chemin "avec données" a été
vérifié par relecture de code et par réutilisation exacte du même schéma de
requête que les pages liste (`app/omra/page.tsx`/`app/packages/page.tsx`),
qui, elles, fonctionnent déjà en production avec de vraies données.

## Build

```
Route (app)
...
├ ƒ /omra
├ ƒ /omra/[id]
├ ƒ /packages
├ ƒ /packages/[slug]
...
```

## Risques restants

- **Pas de données de démonstration** : tant qu'aucun package Omra ou
  catalog_packages actif n'est créé en production, les deux nouvelles pages
  Détail ne seront jamais atteintes par un vrai utilisateur (les listes
  restent vides). Ce n'est pas un risque introduit par ce correctif — c'est
  la même situation que les pages liste aujourd'hui.
- **Pas de self-checkout pour Omra ni Packages** (décision assumée, voir
  ci-dessus) : un visiteur qui clique "Réserver" est redirigé vers un
  contact humain, pas vers un paiement en ligne. Documenté comme limitation
  produit connue, pas comme un bug.
- **`createOmraBooking` reste orphelin côté B2B** : toujours accessible
  uniquement depuis `/pro/sandbox` avec des données mockées — brancher une
  vraie page `/pro/omra/[id]` reste un gap pour une phase dédiée.
- Portée strictement respectée : aucune modification de Vols, MyGo, Hôtels
  Tunisie, Transferts, Wallet, Hôtels Monde ou Car.
