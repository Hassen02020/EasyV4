# Audit — Chantier 8 : Ranking / Recommandation

Phase Premium 2 (dernier chantier de la roadmap Destination). Recherche
effectuée sur le code et la base réels du dépôt (aucune fabrication).

## Constat global

**Le tri des offres (hôtels/vols) existe déjà et est hors périmètre** —
`lib/mygo/sort.ts` (`sortOffers`, modes `recommended`/`price_asc`/
`price_desc`/`best_deal`) est câblé sur les 3 moteurs de recherche depuis
un chantier antérieur ("Sort Engine"). Ce chantier ne le retouche pas.

**Aucun signal de popularité/tendance n'existe nulle part pour les
destinations.** `listActiveCountriesWithCities()`, l'index `/destinations`
et `/api/destinations/search` (autocomplete) trient tous par
`destinations.name` (alphabétique). Aucune colonne "popularity"/
"bookingCount"/"trending" n'existe sur `destinations`, et `reservations`
n'a aucune colonne destination structurée (seulement `providerPayload`
jsonb brut, spécifique à chaque fournisseur — en extraire un signal fiable
demanderait de parser 6 formats différents, hors périmètre raisonnable).
Fabriquer un score de popularité serait de la donnée fictive.

**Un signal réel et exploitable existe : les avis clients (`reviews`).**
Table déjà en production (migration 0047, chantier Reviews) —
`module`/`productRef`/`rating`/`status`. Aujourd'hui 0 ligne dans la base
locale (DB de test, pas représentative d'un volume réel), mais le
mécanisme est réel et bout-en-bout (soumission `/compte`, modération admin,
affichage public déjà câblé sur les fiches produit). C'est un signal
légitime pour classer, contrairement à une popularité inventée.

**Le cross-sell destination (chantier 5) ne classe pas ses résultats** —
`getCrossSellPackages()`/`getCrossSellActivities()`
(`lib/destinations/cross-sell.ts`) trient par `title` (alphabétique), pas
par note/pertinence. Les listings `/packages`, `/attractions`, `/omra`
font de même.

**Aucune "recommandation" de destination n'existe** au-delà de ce qui est
déjà construit : les villes sœurs d'un pays (déjà affichées sur la fiche
pays, chantier 4) et le cross-sell produit (chantier 5). Rien
d'équivalent à "destinations similaires" ou "vous pourriez aussi aimer"
entre destinations elles-mêmes.

## Options réellement actionnables

- **(a) Classer par note réelle (reviews) au lieu d'alphabétique** :
  packages/activités du cross-sell destination + listings `/packages`,
  `/attractions`, `/omra` — tri par note moyenne (avis approuvés)
  décroissante, repli sur l'ordre alphabétique actuel quand aucun avis
  n'existe (comportement inchangé pour tout produit sans avis — la
  situation de 100% du catalogue aujourd'hui). Signal réel, dégrade
  proprement, aucune donnée inventée.
- **(b) "Destinations similaires"** sur la fiche ville : proposer les
  autres villes du même pays qui n'apparaissent pas déjà (au-delà des
  simples "villes sœurs" déjà listées) — périmètre limité, réutilise le
  modèle canonique existant, aucune fabrication.
- **(c) Rien de plus** : constater que le tri offres (Sort Engine) est
  déjà fait, qu'aucun signal de popularité destination n'existe de façon
  honnête, et fermer ce chantier sans code — la roadmap Destination
  (8/8) serait alors terminée telle quelle.

Je recommande **(a)**, seule option avec un vrai signal de données
derrière (même si son volume est nul aujourd'hui, le mécanisme est réel et
le comportement actuel reste identique tant qu'aucun avis n'existe) —
**(b)** est plus spéculatif (aucune demande n'a jamais évoqué "destinations
similaires"), et **(c)** referme le chantier sans rien livrer.
