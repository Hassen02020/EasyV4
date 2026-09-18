# Easy2Book — Audit Universal Search (Phase Premium 1)

**Mission** : "Unifier progressivement les différents moteurs de recherche : Hotels / Omra / Voyages /
Attractions / etc. sans casser leurs paramètres spécifiques." Ce document est l'étape **audit** (avant
toute correction) sur les 12 dimensions demandées, à travers les 8 modules produit existants : Hôtels
Tunisie, Hôtels Monde, Omra, Packages (Voyages organisés), Attractions, Vols, Car (location), Transferts.

**Méthode** : 5 audits en lecture seule menés en parallèle sur le code réel (jamais une supposition à
partir des noms de fichiers), zéro modification, zéro build lancé :
1. Hôtels Tunisie + Hôtels Monde (composants, params, endpoints, schémas, destination, dates/occupancy).
2. Omra + Packages + Attractions (mêmes dimensions).
3. Vols + Car + Transferts (existence réelle, mêmes dimensions) + matrice de nommage cross-module.
4. i18n FR/EN/AR + RTL sur tous les widgets de recherche.
5. Dates + Devise + Mobile, transverses à tous les modules.

**Correction préalable au contexte de départ** : le système i18n maison (`lib/i18n.ts`, cookie
`e2b_locale`) évoqué au lancement de cet audit n'existe plus. Le storefront public tourne intégralement
sur **next-intl** (routes `/fr /en /ar`, `messages/{fr,en,ar}.json`), confirmé par l'agent i18n — c'est un
acquis (chantier i18n déjà fait dans une session antérieure), pas un gap de cette mission.

---

## Résumé exécutif — comptage par priorité

| Priorité | Nombre de constats | Sens |
|---|---|---|
| **P0** | 28 | Bug utilisateur réel ou incohérence bloquante pour l'unification |
| **P1** | ~26 | Incohérence gênante à corriger avant/pendant l'unification |
| **P2** | ~15 | Amélioration mineure, non bloquante |
| 🚫 Légitime | plusieurs | Différence métier volontaire — à ne pas "corriger" |

**Les 3 constats les plus structurants** (conditionnent toute la suite du chantier "unifier sans casser") :

1. **Duplication systémique du widget de recherche** : Hôtels Monde, Omra et Packages ont chacun **deux
   implémentations indépendantes et non synchronisées** de leur barre de recherche — une sur la page
   dédiée (`/hotels-monde`, `/omra`, `/packages`), une dans le widget hero de l'accueil
   (`components/booking-engine.tsx`). Elles divergent sur les champs proposés, les valeurs par défaut, et
   parfois perdent silencieusement la saisie de l'utilisateur (ex. Hôtels Monde : `rooms`/`adults`/
   `children`/`babies` saisis dans le widget hero jamais transmis à la page résultats — H-06).
2. **La conversion de devise réelle n'existe que sur Hôtels Tunisie.** Les 6 autres modules (Hôtels Monde,
   Omra, Packages, Attractions, Vols, Car, Transferts) affichent des prix TND figés quelle que soit la
   devise sélectionnée dans le header — le sélecteur est unifié et persiste correctement, mais c'est une
   façade pour tout le reste du site (C3-C8).
3. **Aucun concept commun de "destination", "nombre de personnes" ou "date"** n'existe entre modules — 8
   noms différents pour "nombre de personnes" (`adults`/`pilgrims`/`travelers`/`pax`/absent), granularité
   incompatible pour les dates (jour précis vs mois vs absent), et Omra/Packages/Attractions n'ont **aucune
   route API de recherche** (tout est interrogé directement en DB depuis la Server Component de page) —
   contrairement à Hôtels Tunisie qui a un vrai contrat `/api/hotels/search-public` validé par zod. Unifier
   ces modules n'est donc pas un renommage de paramètres : c'est faire émerger un contrat qui n'existe pas
   encore pour 3 des 8 modules.

---

## 1. Composants de recherche existants

| Module | Implémentations | État |
|---|---|---|
| Hôtels Tunisie | 1 composant unique (`HotelsTunisieSearch`), réutilisé partout | ✅ Référence |
| Hôtels Monde | **3** : `WorldHotelSearch` (page dédiée), `HotelsMondeForm` (widget hero, incohérent avec la page) | ❌ P0 |
| Omra | **2** : `OmraSearch` (page dédiée, sans `FIELD_SHELL`), `OmratyForm` (widget hero, incomplet — pas de champ pèlerins) | ⚠️ P1 |
| Packages | **2** : `PackageSearch` (page dédiée), `VoyagesOrganisesForm` (widget hero, sans champ mois) | ⚠️ P1 |
| Attractions | **2**, mécanismes différents : `&lt;form&gt;` HTML natif (page dédiée) vs state React + `router.push` (widget hero) pour le même champ `q` | P2 |
| Vols / Car / Transferts | 1 composant page dédiée chacun ; les 3 formulaires du widget hero (`VolsForm`/`CarForm`/`TransfertsForm`) sont **du code mort**, non branchés dans `tabsConfig` | Info (voir §12) |

---

## 2. Paramètres URL — matrice de nommage cross-module

| Concept | Hotels-TN | Hotels-Monde | Omra | Packages | Attractions | Vols | Car | Transferts |
|---|---|---|---|---|---|---|---|---|
| destination | `cityId` (num.) | `destination` (clé statique) | N/A (fixe) | `destination` (clé statique) | N/A (texte libre `q`) | `origin`+`destination` (IATA) | `pickup`+`dropoff` (UUID) | `from`+`to` (UUID) |
| date début | `checkin` | `checkIn` (casse !) | `month` (mois) | `month` (mois) | ABSENT | `departureDate` | `pickupDate` | `date` |
| date fin | `checkout` | `checkOut` (casse !) | N/A | `duration` (jours, pas une date) | ABSENT | `returnDate` (optionnel) | `returnDate` | N/A |
| nb. personnes | `adults` | `adults` | `pilgrims` | `travelers` | ABSENT | `adults` | ABSENT | `pax` |
| enfants | `children` (âges CSV) | ABSENT | ABSENT | ABSENT | ABSENT | `children` (compte simple) | ABSENT | ABSENT |
| chambres/unités | `roomsCount` **et** `rooms` (2 sens différents !) | `rooms` (entier) | N/A | N/A | N/A | N/A | `category` (véhicule) | `vehicle` (type) |
| devise | accepté par schéma, jamais envoyé | ABSENT à la recherche | ABSENT | ABSENT | ABSENT | ABSENT à la recherche | calculé serveur only | calculé serveur only |

**Incohérences bloquantes pour une unification naïve** :
- `rooms` désigne 2 choses différentes **dans le même module** (Hôtels Tunisie) : compteur d'affichage vs
  chaîne encodée âges-par-chambre consommée par l'API.
- `children` a 2 formats incompatibles sous le même nom : âges CSV (Hôtels Tunisie) vs compte simple (Vols).
- `checkin/checkout` (minuscule, Tunisie) vs `checkIn/checkOut` (camelCase, Monde) — même produit, deux
  conventions, et même **incohérence interne au module Monde** (la page landing lit `checkin` minuscule
  alors que le reste du module utilise `checkIn`).
- 4 noms différents pour "nombre de personnes" (`adults`/`pilgrims`/`travelers`/`pax`), absent sur 2 modules.

---

## 3. Endpoints appelés

| Module | Endpoint dédié | Moteur réel |
|---|---|---|
| Hôtels Tunisie | `/api/hotels/search-public` (zod validé, `HotelSearchQuerySchema`) | myGo (fournisseur réel) |
| Hôtels Monde | `/api/hotels-monde/search` | **Virtual World Hotel Supplier** — stub explicitement documenté, pas de vrai fournisseur branché |
| Vols | `/api/vols/search` (zod validé) | **Virtual Flight Supplier** — même statut stub |
| Omra | **Aucun** — requête Drizzle directe depuis la Server Component | — |
| Packages | **Aucun** — idem | — |
| Attractions | **Aucun** — idem, et pas même de dossier `app/api/attractions` | — |
| Car | **Aucun** — devis unique via `calculateCarPrice()` côté page | — |
| Transferts | **Aucun** — devis unique via `calculateTransferPrice()` côté page | — |

Constat structurant : **5 des 8 modules n'ont aucune API de recherche** — la "recherche" y est en réalité
une requête serveur directe à l'affichage de la page. Unifier "l'endpoint de recherche" suppose donc de
faire émerger ce contrat pour ces 5 modules avant de pouvoir parler d'unification technique.

---

## 4. Schémas de données

Les DTO retournés sont structurellement incompatibles même entre les 2 modules hôteliers : `HotelOfferDTO`
(Tunisie, imbriqué : `hotel.id:number`, `boardings[].pax[].rooms[]`, devise dynamique) vs `WorldHotelOffer`
(Monde, plat : `id:string`, `pricePerNightTnd`, devise toujours "TND" en dur) — **aucun champ
structurellement identique** (H-11, P0). Par ailleurs, Car/Transferts renvoient **un devis unique**
(pas de liste `offers[]`) alors que Hôtels/Vols renvoient un tableau — un type `SearchResponse` générique
ne peut pas couvrir les deux familles sans variante de type (P1).

---

## 5. Destination / autocomplete

| Module | Source de données | Type |
|---|---|---|
| Hôtels Tunisie | `/api/hotels/cities` (catalogue myGo réel, cache 24h) | ✅ Autocomplete réel |
| Hôtels Monde | Liste statique 10 destinations | ⚠️ Décalage avec le marketing ("1M+ établissements") — P1 |
| Omra | N/A (mono-destination) | 🚫 Légitime |
| Packages | Liste statique 8 valeurs, matchée par `ILIKE` sur titre (pas de colonne DB dédiée), **dupliquée deux fois** en dur (page + widget hero) | ❌ P1 |
| Attractions | Texte libre `ILIKE` sur titre/localisation, aucun sélecteur structuré alors qu'une colonne `location` dédiée existe | ⚠️ P2 |
| Vols | `&lt;Select&gt;` figé sur liste `AIRPORTS` statique | Pas d'autocomplete réel |
| Car / Transferts | `&lt;Select&gt;` de lieux/zones réels issus du catalogue DB par agence | ✅ Correct pour leur besoin |

Aucun des modules non-Hôtels-Tunisie ne réutilise `useCities()` — chacun réinvente sa propre solution (P1,
XMOD-02).

---

## 6. Dates

- 4 implémentations différentes de sélecteur : Calendar Radix range (Hôtels Tunisie, seul avec blocage
  réel des dates passées côté UI) ; `&lt;input type="date"&gt;` natif (Monde/Vols/Car/Transferts, blocage
  "mou" via `min=`) ; `&lt;input type="month"&gt;` (Packages) ; `&lt;Select&gt;` de mois (Omra).
- **Aucun module, y compris Hôtels Tunisie, ne revalide `checkin ≥ aujourd'hui` côté serveur** (D4, P1) —
  une requête forgée contournant l'UI est acceptée par le backend sur tous les modules hôtel.
- `checkin < checkout` non vérifié côté JS sur la page Vols dédiée (contrairement à Car et Hôtels Monde
  dans le même repo) — D5, P1.
- Nombre de nuits affiché de façon incohérente **au sein même du module Hôtels Monde** : affiché sur le
  widget hero, absent sur la page dédiée — D6, P1.
- Valeurs par défaut incohérentes : Hôtels Tunisie toujours pré-rempli (aujourd'hui/demain) partout ; Hôtels
  Monde vide sur la page dédiée mais pré-rempli sur le widget hero — D7, P1.
- Format d'affichage locale-aware (`date-fns` + locale) seulement sur Hôtels Tunisie ; tous les autres
  modules utilisent le format natif du navigateur, indépendant de la langue du site — D8, P2.

---

## 7. Occupancy

- Décomposition par âge (adultes + enfants avec âges individuels 0-17) : **seulement Hôtels Tunisie**.
  Tous les autres modules utilisent un compteur simple sans âges (`pilgrims`, `travelers`, `pax`,
  `adults`+`children` en compte simple pour Vols) — écart légitime pour Omra/Packages/Transferts (pas de
  besoin business documenté), mais incohérent pour Hôtels Monde qui devrait suivre le même modèle que
  Hôtels Tunisie (H-08, P0 — champs enfants/bébés proposés en UI sur le widget hero mais jamais supportés
  par l'API/moteur Monde : perte de saisie garantie).
- Limites numériques divergentes sans justification métier apparente : adults max 6/8/10/16/20 selon
  l'implémentation regardée pour un seul et même produit "hôtel" (H-16, P0).
- Car n'a **aucun champ occupant** — capacité implicite via la catégorie de véhicule (légitime).

---

## 8. Devise

- Sélecteur (`CurrencySwitcher`) et persistance (`localStorage`, `CurrencyProvider` racine) : **unifiés et
  corrects** sur tout le site (C1/C2, référence positive).
- Conversion réelle (`useCurrency`/`formatCurrency`) : **branchée uniquement sur Hôtels Tunisie**. Hôtels
  Monde, Vols, Packages, Omra, Car, Transferts affichent tous des prix TND figés quelle que soit la devise
  choisie — **6 constats P0** (C3-C8). C'est le gap le plus sérieux et le plus simple à isoler (un seul
  hook à réutiliser, déjà existant et éprouvé).
- Taux de change statiques codés en dur (`lib/currency.ts`, EUR=0.3, USD=0.32), pas de taux live — P2,
  même sur le module où la conversion fonctionne.

---

## 9. i18n FR/EN/AR

- **Couverture des clés** : complète pour tous les namespaces de recherche audités (0 clé manquante en
  EN/AR), pluralisation ICU (`one`/`two`/`other`) correctement implémentée dans les 3 langues — bon signe,
  référence positive (C-01/C-02 de l'agent i18n).
- **3 des 7 onglets du widget hero de l'accueil sont intégralement non traduits** : Vols, Transferts, Car
  (`booking-engine.tsx::VolsForm/TransfertsForm/CarForm`) — y compris les messages d'erreur de validation
  — alors que les 4 autres onglets (Hôtels Tunisie, Hôtels Monde, Omraty, Voyages, Attractions) le sont.
  Implémentation manifestement incomplète, pas un oubli isolé (S-01/S-02/S-03, **P0**). Ces 3 formulaires
  sont actuellement du code mort (non branchés, cf. §12) donc sans impact utilisateur direct aujourd'hui —
  mais bloquant s'ils sont un jour réactivés sans passer par cet audit.
- Badge "Pourquoi ce choix" et bloc "dates flexibles" de la SERP Hôtels Tunisie (module le plus utilisé) :
  texte français en dur, aucun `useTranslations` (S-04/S-05, **P0**).
- Destinations Hôtels Monde (`POPULAR_DESTINATIONS`) : labels français en dur ("Émirats Arabes Unis",
  "Égypte"...) non traduits (S-06, P1).
- Formatage des prix (`toLocaleString("fr-FR")` codé en dur, indépendant de la locale) sur Hôtels Tunisie,
  Omra, Packages — alors que Hôtels Monde et Vols le font déjà correctement de façon locale-aware
  (`getIntlLocale(locale)`) : le pattern correct existe, il n'a simplement pas été repris partout (F-01/
  F-02/F-03, **P0** pour Hôtels Tunisie vu son trafic).

---

## 10. RTL

- **Aucun mécanisme RTL n'est câblé dans les primitives Radix** (Popover/Select/Command) utilisées par
  toutes les barres de recherche — pas de `DirectionProvider`, pas de prop `dir`. Le positionnement
  `align="start"/"end"` reste calé en LTR physique quelle que soit la langue (R-01, **P0**).
- Bouton "inverser" origine/destination du module Vols : `absolute -left-5` sans variante `rtl:`, reste
  physiquement à gauche en arabe (R-02, **P0**).
- Icônes/espacements physiques (`ml-`/`mr-`/`pl-`/`pr-` non mirrorés) sur le widget Hôtels Tunisie (dropdown
  ville, popover occupancy, filtre étoiles) — R-03, P1.
- **Point positif à répliquer** : le calendrier (`components/ui/calendar.tsx`) a un mirroring RTL correct
  des chevrons via `rtl:**:[...]:rotate-180` — c'est le seul pattern RTL propre du repo, à généraliser.

---

## 11. Mobile

C'est la dimension la mieux traitée globalement — aucun bug bloquant de débordement ou de CTA inatteignable
sur 390px identifié :
- Hôtels Tunisie (formulaire + `Sheet` d'édition) et le widget hero (bottom-sheet dédié avec
  `safe-area-inset-bottom`) ont un vrai traitement mobile soigné — référence positive.
- Le composant `Calendar` partagé gère nativement l'empilement des 2 mois sous 768px.
- Point faible récurrent mais mineur : CTA "Rechercher" non pleine-largeur sur 6 pages dédiées (Hôtels
  Monde, Omra, Packages, Transfert, Car, Vols) contre pleine-largeur sur Hôtels Tunisie et le widget hero —
  incohérence UX répétée, pas un bug (M5, P1).
- "Modifier la recherche" compact depuis la page résultats n'existe que pour Hôtels Tunisie — les autres
  modules n'ont pas d'équivalent (M6, P2).

---

## 12. Différences Hotels Tunisie / Hotels Monde / Omra / Voyages / Attractions / Vols / Car / Transferts

| Dimension | Tunisie | Monde | Omra | Packages | Attractions | Vols | Car | Transferts |
|---|---|---|---|---|---|---|---|---|
| Fournisseur | myGo réel | Virtual (stub) | DB directe | DB directe | DB directe | Virtual (stub) | DB directe | DB directe |
| API recherche | ✅ zod validée | ✅ zod validée | 🚫 | 🚫 | 🚫 | ✅ zod validée | 🚫 | 🚫 |
| Résultat | liste `offers[]` | liste `offers[]` | liste (page) | liste (page) | liste (page) | liste `offers[]` | devis unique | devis unique |
| Devise dynamique | ✅ seule | ❌ TND figé | ❌ TND figé | ❌ TND figé | ❌ TND figé | ❌ TND figé | ❌ TND figé | ❌ TND figé |
| Lié depuis la nav/accueil | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ orphelin | ❌ orphelin | ❌ orphelin |

**Vols/Car/Transferts sont fonctionnels de bout en bout (recherche→réservation) mais volontairement
retirés de la navigation principale** — documenté explicitement en commentaire dans le code
(`booking-engine.tsx:96-105` : "pour ne pas disperser l'effort commercial"). Ce n'est pas un bug : c'est
une décision produit existante, à respecter tant qu'elle n'est pas révisée explicitement. Conséquence pour
la mission d'unification : investir dans l'unification fine de ces 3 modules a un impact utilisateur
quasi nul tant qu'ils restent non liés — leurs gaps sont documentés ici mais à traiter en dernier.

**Légitime métier (à ne pas "corriger")** : absence de destination pour Omra (mono-destination), absence de
dates au listing Attractions (disponibilité vérifiée à la session, pas au listing), absence de subdivision
région/wilaya pour Hôtels Monde, absence de décomposition d'âges pour pilgrims/travelers/pax (pas un besoin
documenté), Car/Transferts en devis unique plutôt qu'en liste (produit à sélection fermée, pas un catalogue
à parcourir).

---

## Notes de méthode / limites

- Cet audit est en lecture seule — aucune correction n'a été appliquée. Le fichier
  `EASYV4_SEARCH_ENGINES_AUDIT_REPORT.md` (racine du repo) est **obsolète** sur Hôtels Monde (il affirmait
  "Aucun moteur, 404 garanti" — faux dans l'état actuel du code) : ne pas s'y fier pour la suite du
  chantier, ce document-ci fait foi.
- Tous les constats citent `fichier:ligne` — se référer au code source pour vérifier avant toute correction,
  l'état du code peut avoir évolué depuis la rédaction.
