# EASY2BOOK — Hôtels Monde : besoins pour un futur développement

Phase 4 de la reconstruction des search journeys (`EASYV4_SEARCH_ENGINES_AUDIT_REPORT.md`,
finding CRITICAL #2). **Document uniquement — aucun code modifié dans cette
phase.** Conforme à l'instruction : "NE PAS développer maintenant. Documenter
provider/API/données/booking capability/pricing/availability/cancellation
nécessaires. Aucun mock en production."

## 1. Où on en est (constaté dans le code, pas supposé)

| Couche | État |
|---|---|
| Formulaire homepage (`components/booking-engine.tsx:639`, `HotelsMondeForm`) | Existe, pousse vers `/hotels-monde?destination=...` |
| Formulaire `/hotels-monde` (`components/hotels-monde/world-hotel-search.tsx`) | Existe, pousse vers `/hotels-monde/search?...` — **route inexistante, 404 systématique** |
| Destinations proposées | `POPULAR_DESTINATIONS` — 10 valeurs codées en dur (`istanbul`, `dubai`, `paris`…), pas une vraie liste de villes/aéroports |
| Schéma DB dédié | **Aucun** — pas de `lib/db/schema/hotels-monde.ts`, aucune table |
| Client API / provider | **Aucun** — aucun fichier dans `lib/` n'appelle un fournisseur externe pour ce module |
| Route API (`app/api/hotels-monde/*`) | **Inexistante** |
| Indice dans le schéma existant | `reservation_source` (`lib/db/schema.ts:97-99`) liste déjà `amadeus`, `sabre`, `expedia` comme sources possibles — l'architecture anticipait un agrégateur tiers pour ce module, jamais implémenté |

Contrairement à Car (voir `EASYV4_CAR_DECISION.md`), il n'existe **aucune**
brique de départ ici : ni schéma, ni RLS, ni type. Tout est à faire.

## 2. Pourquoi ce n'est pas juste "myGo avec plus de villes"

Le moteur myGo (`lib/mygo/client.ts`) est un flux XML fournisseur pour
l'inventaire hôtelier **tunisien** (contrat B2B avec un fournisseur local).
Hôtels Monde vise l'inventaire **mondial** — aucun fournisseur tunisien
n'a ce catalogue. Il faut un agrégateur global type OTA :

| Fournisseur envisageable | Modèle | Remarque |
|---|---|---|
| Expedia Rapid API (Expedia Partner Solutions) | Agrégateur mondial, contrat B2B/affilié | Déjà anticipé dans `reservation_source` |
| Booking.com Affiliate/Demand API | Agrégateur mondial | Accès généralement restreint (partenariat à négocier) |
| HotelBeds / TravelgateX | Bedbank B2B classique | Modèle proche de myGo (contrat B2B direct), pas de compte utilisateur final requis |
| Amadeus Hotel Search API | Agrégateur GDS | Cohérent avec `amadeus` déjà listé dans `reservation_source` (déjà envisagé pour Vols aussi) |

**Décision produit requise avant tout développement** : quel fournisseur,
quel type de contrat (self-service API key vs négociation commerciale),
quel délai d'accès. Rien dans ce rapport ne présuppose un choix.

## 3. Ce qu'il faudra construire (une fois le fournisseur choisi)

### 3.1 Provider / API
- Client HTTP dédié (`lib/hotels-monde/client.ts`), même architecture que
  `lib/mygo/client.ts` ou `lib/vols/client.ts` : circuit-breaker, cache,
  retry, timeout, **jamais de fixtures/mock actives par défaut en
  production** — le mode démo de `lib/vols/client.ts` n'est acceptable que
  parce qu'il est explicitement documenté comme tel et jamais présenté à
  l'utilisateur comme un vrai résultat sans divulgation ; ne pas reproduire
  ce compromis sans la même transparence si le fournisseur Hôtels Monde
  n'est pas encore sous contrat.
- Authentification fournisseur (clé API / OAuth machine-to-machine selon le
  fournisseur retenu) — secrets via variables d'environnement, jamais en dur.

### 3.2 Données
- Pas de schéma DB de catalogue nécessaire si le fournisseur est un
  agrégateur "search-on-demand" (Expedia/Booking/HotelBeds cherchent en
  direct, pas de synchronisation d'inventaire local) — à la différence de
  Car ou Transferts qui modélisent un catalogue propre à l'agence.
- Il faudra en revanche une extension `reservation_hotels_monde` (ou
  réutiliser `reservation_hotel` si la forme des données est compatible)
  pour stocker la référence de réservation fournisseur
  (`providerBookingId`), au même titre que `reservation_car.providerBookingId`
  déjà prévu pour un cas similaire.
- DTOs normalisés à définir, en s'inspirant des types déjà existants
  (`lib/mygo/types.ts` : `HotelSummaryDTO`, `HotelDetailsDTO`,
  `RoomOfferDTO`, `CancellationPolicyDTO`) pour que les composants de
  résultats/détail existants (`HotelListings`, filtres, tri) puissent être
  réutilisés sans réécriture si la forme des données est suffisamment proche.

### 3.3 Booking capability
- Le fournisseur permet-il une confirmation instantanée (comme myGo) ou
  uniquement une pré-réservation "on request" ? Détermine si le pipeline
  `/booking` générique (`lib/booking/actions.ts`) peut être réutilisé tel
  quel ou s'il faut un flux asynchrone (statut "en attente de confirmation
  fournisseur" avant `confirmed`).
- Génération de voucher : le fournisseur renvoie-t-il un voucher/référence à
  transmettre au client, ou faut-il générer un PDF Easy2Book comme pour les
  hôtels myGo (`lib/pdf/voucher-hotel.tsx`) ?

### 3.4 Pricing
- Marge B2B : `pricing_margins` est déjà générique par module — il suffira
  d'ajouter `hotels_monde` (ou réutiliser `hotel` si le fournisseur choisi
  est traité comme une extension du même module) à l'enum
  `reservation_module`, sans nouveau moteur de marge à écrire.
- Devise : la plupart des agrégateurs mondiaux cotent en USD/EUR — conversion
  vers TND nécessaire (`lib/finance/margin-calculator.ts` gère déjà la
  logique de marge, vérifier si la conversion de devise existante suffit ou
  si un taux de change fournisseur dédié est nécessaire).

### 3.5 Availability
- Recherche en temps réel côté fournisseur (pas de stock local à gérer,
  sauf si le fournisseur choisi est un bedbank avec allotement — à vérifier
  au moment du choix).

### 3.6 Cancellation
- Politique d'annulation : la plupart des agrégateurs renvoient une
  `CancellationPolicyDTO`-like structure par offre (délai, pénalité) — à
  mapper vers le type existant `CancellationPolicyDTO` (`lib/mygo/types.ts:74`)
  si compatible.
- Flux d'annulation : `lib/booking/cancel-actions.ts` (construit pendant
  l'audit UI Wiring de cette session pour les hôtels myGo) donne le pattern
  à suivre — annulation fournisseur + recrédit wallet — mais suppose une API
  fournisseur d'annulation synchrone comme myGo. À vérifier pour le
  fournisseur Hôtels Monde retenu.

## 4. Ce qui n'est PAS nécessaire de refaire

- Aucun nouveau moteur de tri/filtres : `lib/mygo/sort.ts`/`lib/mygo/facets.ts`
  sont déjà génériques sur la forme `HotelOfferDTO`-like — réutilisables tels
  quels si les DTOs Hôtels Monde suivent une forme compatible.
- Aucune nouvelle UI de résultats : `HotelListings`, `FilterSidebar`,
  `SortSelect` (déjà utilisés par `/hotels/search`) sont réutilisables si les
  données sont mappées vers les mêmes types.
- Aucun nouveau moteur de marge B2B (`pricing_margins` déjà générique).
- Aucun nouveau moteur de wallet/paiement.

## 5. Recommandation de séquencement (si le produit valide ce module)

1. Choix fournisseur + contrat (décision business, hors code).
2. Client API (`lib/hotels-monde/client.ts`) avec DTOs mappés vers les types
   existants autant que possible.
3. `app/api/hotels-monde/search/route.ts` — route publique B2C (pas de
   `requirePartnerSession`, même correction que Vols/Hôtels Tunisie cette
   session).
4. `app/hotels-monde/search/page.tsx` — Results Layer, même architecture que
   `app/vols/search/` construit en Phase 1 de cette même mission
   (Search State canonique, filtres/tri client, pas de formulaire dupliqué).
5. Détail + booking, en réutilisant `/booking` générique si le fournisseur
   permet une confirmation synchrone, sinon flux asynchrone dédié.

## 6. Risque si rien n'est fait

L'onglet "Hôtels Monde" reste un des trois échecs systématiques (avec Vols
— déjà corrigé en Phase 1 — et Car) parmi les sept modules visibles sur la
page d'accueil. Tant qu'aucune décision fournisseur n'est prise, l'option
la plus honnête reste de désactiver temporairement cet onglet plutôt que de
laisser un formulaire qui mène systématiquement à un 404 — cette page ne
tranche pas cette décision produit, elle documente ce qu'il faudrait pour
que le module fonctionne réellement.
