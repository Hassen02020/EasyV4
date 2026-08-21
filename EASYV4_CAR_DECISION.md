# EASY2BOOK — Location de Voiture : décision à prendre

Phase 5 de la reconstruction des search journeys (`EASYV4_SEARCH_ENGINES_AUDIT_REPORT.md`,
finding CRITICAL #3). **Document uniquement — aucun code modifié dans cette
phase.** Conforme à l'instruction : "NE PAS développer maintenant. Préparer
une décision : A. provider réel identifié → développement ultérieur, ou
B. aucun provider → module temporairement désactivé du parcours public."

## 1. Ce qui existe déjà — plus qu'attendu

L'audit précédent classait Car "❌ Aucun. `lib/db/schema/cars.ts` existe
mais n'est référencé par aucun code de requête." En creusant ce fichier
pour cette phase, la réalité est plus nuancée :

| Couche | État |
|---|---|
| Formulaire homepage + `/car` (`CarForm`/`CarSearch`) | Existe, pousse vers `/car/search?...` — **route inexistante, 404 systématique** |
| Schéma DB (`lib/db/schema/cars.ts`) | **Complet et migré** : `car_locations`, `car_categories`, `car_fleet_vehicles`, `car_availability`, `car_pricing_rates`, `reservation_car` (migration `drizzle/0010_car_rental_module.sql`) |
| RLS | **Déjà écrites** (`drizzle/manual/0011_car_rental_rls.sql`) |
| `reservation_module` enum | `'car'` déjà présent (`lib/db/schema.ts:91`) |
| Code applicatif (requêtes, actions, routes) | **Zéro** — confirmé par recherche : aucune des tables `car_*` n'est référencée en dehors de leur propre fichier de définition |
| UI admin/pro pour peupler le catalogue | **Inexistante** — aucune page ne permet de créer un `car_location`, une `car_category` ou un `car_pricing_rate` |

Autrement dit : la couche donnée est **prête à 100%**, la couche
application est à **0%**. C'est l'inverse de Hôtels Monde (voir
`EASYV4_HOTELS_MONDE_REQUIREMENTS.md`), où rien n'existe à aucune couche.

## 2. Ce que le schéma révèle sur l'intention architecturale

Les commentaires de tête de `lib/db/schema/cars.ts` sont explicites sur le
modèle visé — et ce n'est **pas** un agrégateur tiers façon Vols/Hôtels
Monde :

- `car_locations`/`car_categories`/`car_fleet_vehicles`/`car_pricing_rates`
  sont toutes scopées `agencyId` — c'est un **catalogue propre à chaque
  agence partenaire**, exactement le même modèle que Transferts
  (`catalog_transfer_zones`/`catalog_transfer_pricing`), le seul module
  PASS de cette famille.
- `reservation_car.providerBookingId` est un champ optionnel isolé —
  "Référence contrat/fournisseur externe **si flotte gérée par un tiers**"
  — c'est-à-dire prévu comme cas particulier, pas comme le modèle par défaut.
- Le commentaire de tête dit explicitement que l'intégration wallet
  suivra "le même flux que `createTransferBooking` →
  `debitPartnerCredit(...)`" — le pattern cible est déjà nommé dans le code.

**Conclusion factuelle** : ce module a été conçu pour que chaque agence
partenaire déclare et loue sa **propre flotte** (comme elle déclare déjà ses
zones de transfert), pas pour interroger un GDS/agrégateur de location de
voiture tiers (type Rentalcars/Amadeus Cars). La question "quel provider ?"
ne se pose donc pas de la même façon que pour Hôtels Monde ou Vols.

## 3. Les deux options réelles

### Option A — Compléter la couche application (le catalogue existe déjà)

Ce n'est pas "trouver un fournisseur externe" mais "construire ce qui
manque autour d'un schéma déjà validé", en suivant le pattern Transferts
(le seul comparable déjà PASS) :

1. **UI admin/pro de catalogue** : pages pour qu'une agence déclare ses
   `car_locations` (comptoirs), `car_categories` (types de véhicules,
   caractéristiques), et `car_pricing_rates` (tarifs jour/semaine, saisons)
   — équivalent de ce qui existe déjà pour les zones de transfert.
2. **Moteur de prix** : `lib/car/pricing.ts::calculateCarPrice()` — même
   forme que `lib/transfers/pricing.ts::calculateTransferPrice()` (déjà
   corrigé cette session, un modèle direct à suivre), interrogeant
   `car_pricing_rates` avec les plages `validFrom`/`validTo`.
3. **Recherche/disponibilité** : requête sur `car_availability`
   (catégorie × lieu × date), même principe que `catalog_activity_sessions`.
4. **Résultats** : `app/car/resultats/page.tsx` (Server Component, même
   architecture que `app/transferts/resultats/page.tsx`, pas de nouveau
   moteur de tri/filtre nécessaire vu le faible nombre de catégories par
   agence).
5. **Booking** : `lib/cars/actions.ts::createCarBooking()`, calqué sur
   `createTransferBooking`/`createOmraBooking` — transaction atomique,
   `FOR UPDATE` sur `car_availability`, `debitPartnerCredit`, insertion
   `reservation_car`.
6. **Annulation** : suivre le pattern `lib/booking/cancel-actions.ts`
   (construit cette session pour les hôtels) adapté au wallet/disponibilité
   `car_availability`.

**Prérequis avant tout code** : au moins une agence partenaire doit
effectivement vouloir déclarer une flotte réelle — sans agence prête à
peupler `car_locations`/`car_categories`/`car_pricing_rates`, construire
cette UI ne résout rien (même risque que "Omra/Packages sans aucun
package actif en base", constaté dans la phase précédente de cette
mission). C'est une question business, pas technique.

### Option B — Désactiver temporairement l'onglet public

Si aucune agence n'est prête à peupler un catalogue de flotte à court
terme, laisser "Location de voiture" cliquable depuis la homepage revient à
garantir un 404 à chaque visiteur qui l'essaie — un des trois échecs
systématiques identifiés par l'audit (avec Vols, déjà corrigé, et Hôtels
Monde). Masquer proprement l'onglet (ou afficher "Bientôt disponible" sans
formulaire actif) est une option temporaire légitime, réversible en une
ligne le jour où l'Option A est engagée.

## 4. Ce qui n'est PAS nécessaire de refaire (si Option A est retenue)

- Pas de nouveau schéma DB — déjà migré et RLS déjà écrites.
- Pas de nouveau moteur de marge B2B — `pricing_margins` déjà générique,
  `'car'` déjà dans `reservation_module`.
- Pas de nouveau moteur de wallet — `debitPartnerCredit` déjà généraliste,
  déjà utilisé par Transferts et Omra à l'identique.
- Pas de nouvelle table `car_bookings` — `reservation_car` (extension 1-1
  de `reservations`) existe déjà et suit le pattern standard.

## 5. Recommandation

Cette page ne tranche pas la décision produit (Option A vs B), mais la
structure factuelle penche pour une réponse séquencée : puisque le schéma
et les RLS sont déjà prêts et que le pattern à suivre (Transferts) est déjà
en production, **l'Option A est un développement contenu et à faible risque
technique le jour où une agence partenaire est prête à déclarer sa
flotte** — contrairement à Hôtels Monde qui dépend d'abord d'une
négociation commerciale externe. En attendant cette confirmation business,
l'**Option B (masquer l'onglet)** évite de laisser un 404 systématique
accessible depuis la page d'accueil.

## 6. Risque si rien n'est fait

Le module Car reste, avec Hôtels Monde, l'un des deux échecs systématiques
restants parmi les sept modules visibles en page d'accueil (Vols corrigé en
Phase 1 de cette mission). Contrairement à Hôtels Monde, la voie technique
pour le débloquer est déjà largement balisée par le schéma existant — le
blocage est aujourd'hui business (aucune flotte partenaire déclarée), pas
technique.
