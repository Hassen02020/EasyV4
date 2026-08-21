# EASY2BOOK — Phase 2 / Phase 1 : Reconstruction du Search Journey Vols

## Problème initial

`EASYV4_SEARCH_ENGINES_AUDIT_REPORT.md` classait le module Vols **BROKEN** :
le formulaire de recherche (`components/vols/flight-search.tsx`) construisait
déjà une navigation vers `/vols/search?...`, mais cette route **n'existait
pas** — toute recherche de vol se terminait en 404. Le widget rapide de la
homepage, lui, poussait vers `/vols?...`, qui ne faisait que réafficher un
formulaire au lieu de lancer une recherche : c'est l'anti-pattern "double
couche de recherche" déjà identifié pour les autres modules dans le rapport.

Le moteur backend (`app/api/vols/search/route.ts` → `lib/vols/client.ts`,
mode démo à 3 offres fixtures faute de `FLIGHTS_API_KEY`) fonctionnait déjà
correctement en isolation, mais était inaccessible : la route exigeait
`requirePartnerSession`, alors que son seul appelant réel est le parcours
public B2C (homepage → `/vols` → recherche). Un visiteur anonyme tombait
donc systématiquement sur une erreur de session plutôt que des résultats —
même classe de bug que celle déjà trouvée et corrigée sur
`/api/hotels/search` plus tôt dans cette session (voir
`EASYV4_B2C_PUBLIC_SEARCH_REPORT.md`).

## Cause racine

1. **Results Layer manquante** : personne n'avait jamais créé
   `app/vols/search/page.tsx`.
2. **Garde d'auth mal posée** : `requirePartnerSession` avait été copié sur
   la route vols par analogie avec les routes B2B, sans vérifier que son
   seul consommateur réel est public.
3. **Deux vocabulaires de paramètres d'URL incompatibles** : le widget
   homepage envoie `origin=Tunis (TUN)` / `class=economique` (texte libre,
   français), le formulaire interne envoie `origin=TUN` / `cabin=ECONOMY`
   (codes IATA propres, valeurs API) — rien ne réconciliait les deux avant
   cette phase.

## Architecture avant

```
Homepage (VolsForm) ──▶ /vols?origin=Tunis(TUN)&class=economique...
                              │
                              ▼
                    /vols (affiche le formulaire, ignore les params)
                              │
                    FlightSearch (formulaire interne)
                              │
                              ▼
                    /vols/search?origin=TUN&cabin=ECONOMY...
                              │
                              ▼
                            404
```

`/api/vols/search` existait et fonctionnait, mais n'était jamais atteint
depuis l'UI, et exigeait une session partenaire de toute façon.

## Architecture après

```
Homepage (VolsForm) ──▶ /vols?origin=Tunis(TUN)&class=economique...
                              │
                    parseFlightSearchParams() [lib/vols/search-state.ts]
                              │
                    params valides ? ──── non ──▶ formulaire (FlightSearch,
                              │                    pré-rempli au mieux)
                             oui
                              │
                              ▼
              redirect → /vols/search?origin=TUN&cabin=ECONOMY&tripType=...
                              │
                              ▼
        app/vols/search/page.tsx (Server Component : Header/Footer)
                              │
                    <Suspense><FlightResultsContent /></Suspense>
                              │
              fetch /api/vols/search?... (plus de requirePartnerSession)
                              │
                    lib/vols/client.ts → searchFlights() [inchangé]
                              │
              offres normalisées → filtres (direct/remboursable, client)
                              │
                    tri client (recommandé/prix/durée) → FlightCard[]
                              │
                    Réserver → bouton désactivé "bientôt" (gap documenté)
```

Le formulaire interne (`FlightSearch`) et le widget homepage restent deux
composants distincts (hors scope de fusionner), mais partagent maintenant
`AIRPORTS`, `parseAirportInput`, `parseCabin` depuis le même module
`lib/vols/search-state.ts`, qui sert aussi de traducteur unique entre les
deux vocabulaires de query params vers le format canonique attendu par
`SearchSchema` de la route API (elle-même non modifiée).

## Fichiers créés

- `lib/vols/search-state.ts` — Search State canonique : `AIRPORTS`,
  `parseAirportInput`, `parseCabin`, `parseFlightSearchParams` (parse
  tolérant des deux formats d'URL), `flightStateToApiParams`,
  `flightStateToResultsParams`.
- `app/vols/search/page.tsx` — Server Component : Header/Footer +
  `<Suspense>` autour du contenu client.
- `app/vols/search/flight-results-content.tsx` — Client Component :
  résumé de recherche, skeleton de chargement, états vide/erreur avec
  retry, filtres (direct uniquement / remboursable uniquement), tri
  client, cartes de vol, bouton Réserver désactivé.

## Fichiers modifiés

- `app/api/vols/search/route.ts` — suppression de `requirePartnerSession`
  (route publique B2C) ; clé de rate-limit préfixée `vols:search:` au lieu
  d'un compteur IP nu partagé avec d'autres routes ; `SearchSchema` et
  l'appel `searchFlights()` inchangés.
- `app/vols/page.tsx` — si les params URL constituent une recherche
  valide, redirige vers `/vols/search` au lieu d'afficher le formulaire ;
  sinon comportement inchangé (formulaire, pré-rempli au mieux).
- `components/vols/flight-search.tsx` — réutilise
  `AIRPORTS`/`parseAirportInput`/`parseCabin` depuis le nouveau module
  partagé au lieu de dupliquer la liste d'aéroports et la table de
  traduction français→enum (qui ne couvrait pas tous les cas, voir
  Risques).

## Fichiers supprimés

Aucun.

## Tests

Scénarios manuels exécutés (dev server + Playwright/curl), sur `/vols` et
`/vols/search` :

1. **Homepage → Search** : `/vols?origin=TUN&destination=IST&...` redirige
   (307) vers `/vols/search?...` — vérifié.
2. **Search → Results** : résultats affichés, "3 vols trouvés" — vérifié.
3. **Deep link URL** : accès direct à `/vols/search?...` sans passer par
   `/vols` — vérifié, rendu identique.
4. **Refresh** : rechargement de `/vols/search?...`, le résumé de
   recherche (`<h1>`) est préservé — vérifié.
5. **Modifier la recherche** : retour vers `/vols` avec les params
   préservés, y compris le round-trip de la classe (Économique Premium
   testée spécifiquement après le fix ci-dessous) — vérifié.
6. **Back / Forward** navigateur : testé sur la paire `/vols` (avant
   redirection) ↔ `/vols/search` — vérifié, l'historique reste cohérent.
7. **Filtres combinés** (direct + remboursable) : appliqués côté client
   sans nouvel appel réseau — vérifié.
8. **Erreur / params manquants** : `/vols/search` sans query params
   affiche l'état "Recherche incomplète" avec lien de retour — vérifié.
   (L'état d'erreur réseau — API 5xx — est couvert par le code mais non
   déclenché en conditions réelles : le moteur est en mode démo permanent
   et répond toujours 200 ; le chemin `catch`/retry a été relu, pas
   observé en direct.)
9. **Mobile (390px)** : pas de débordement horizontal — vérifié.
10. **Desktop (1440px)** : mise en page vérifiée par capture d'écran.

Gates automatisés :
- `pnpm typecheck` : 0 erreur.
- `pnpm lint` : 0 erreur (avertissements restants tous pré-existants et
  sans rapport avec ce chantier).
- `pnpm test` : 228/228 passent (aucune régression).
- `pnpm build` : build de production réussi, route `/vols/search`
  présente dans la table des routes générées.

## Build

```
✓ Compiled successfully
  Running TypeScript ... Finished
  Generating static pages (23/23)
...
├ ƒ /vols
└ ƒ /vols/search
```

## Bug rencontré et corrigé pendant le chantier

Le premier jet de `app/vols/search/page.tsx` était un unique fichier
`"use client"` important `HeaderWrapper` (qui lit les cookies via
`next/headers`, une API Server Component uniquement) — le build échouait
avec `You're importing a module that depends on "next/headers"... in the
Pages Router`. Corrigé en séparant la page en un Server Component
(`page.tsx`, Header/Footer) qui enveloppe un Client Component
(`flight-results-content.tsx`, logique interactive), même séparation que
`app/transferts/resultats/page.tsx` / `app/vols/page.tsx`.

Un deuxième défaut mineur trouvé pendant la vérification manuelle : le lien
"Modifier la recherche" envoyait `class=${cabin.toLowerCase()}` (ex.
`premium_economy`), mais la table de traduction du formulaire
(`CABIN_FROM_HOME`) ne reconnaissait que les mots français
(`economique`/`premium`/`business`) — une recherche en Classe Affaires ou
Premium perdait sa classe en revenant au formulaire. Corrigé en exportant
`parseCabin` (déjà tolérant aux deux vocabulaires) depuis
`lib/vols/search-state.ts` et en le réutilisant côté formulaire ; vérifié
par test Playwright dédié (round-trip Premium Economy préservé).

## Risques restants

- **Booking vols non branché** (documenté, décision assumée) :
  `lib/booking/actions.ts` ne confirme réellement une réservation que pour
  `module === "hotel"` — brancher un vrai bouton "Réserver" sur le pipeline
  générique de booking aurait créé une réservation + débit wallet réel sans
  aucune confirmation fournisseur derrière (le moteur vols est en mode démo
  permanent, `FLIGHTS_API_KEY` absent). Le bouton est désactivé
  volontairement plutôt que de simuler un achat de billet.
- **Mode démo permanent** : tant qu'aucune clé `FLIGHTS_API_KEY` n'est
  configurée, les résultats affichés sont 3 offres fixtures identiques à
  chaque recherche (prix, horaires) — acceptable pour cette phase
  (reconstruction du parcours, pas du fournisseur), mais à garder en tête
  avant toute mise en production réelle du module vols.
- **`babies`/`infants` et dates flexibles non modélisés** : le widget
  homepage envoie ces champs, mais ni `SearchSchema` (route API) ni
  `FlightOfferSchema` (client) n'ont de notion de passager infant ou de
  tarif flexible — ces champs sont silencieusement ignorés plutôt que
  simulés. Documenté en commentaire dans `lib/vols/search-state.ts`.
- Portée strictement respectée : aucune modification du moteur MyGo Hotels
  Tunisie, des Transferts, du Wallet, ou du booking hôtel fonctionnel.
  Hôtels Monde, Car, et les routes Detail Omra/Voyages restent hors
  périmètre de cette phase, comme demandé.
