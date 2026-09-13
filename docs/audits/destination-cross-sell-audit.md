# Audit — Chantier 5 : Cross-sell par destination

Phase Premium 2. Suite du chantier 4 (Pages Destination + SEO), dont l'item
"cross-sell = chantier 5" reporté ici : les fiches `/destinations/[slug]`
n'affichent aujourd'hui que des liens de recherche pré-remplis, jamais de
vraies cartes produit. Objectif de cet audit : déterminer, module par
module, si un vrai produit catalogue peut être relié de façon fiable à une
destination — sans jamais fabriquer une association ou une donnée absente.

Toutes les valeurs citées ci-dessous viennent d'une lecture directe de la
base locale (`easyv4_e2e`, même mirroir que les chantiers précédents) et du
code réel des pages publiques existantes — aucune n'est supposée.

## 1. Packages (`catalog_packages`) — relation déjà réelle, réutilisable telle quelle

`catalog_packages` n'a pas de colonne destination. `app/(public)/[locale]/packages/page.tsx`
filtre déjà `?destination=<slug>` via une recherche `ILIKE` sur `title`,
au travers d'une table `DESTINATION_SEARCH_TERMS` codée en dur :

```
istanbul→"Istanbul", dubai→"Dubai", paris→"Paris", rome→"Rome",
barcelona→"Barcelone", london→"Londres", cairo→"Caire", casablanca→"Casablanca"
```

Ces 8 clés sont **exactement** les 8 lignes `destination_external_refs`
(`module='packages_slug'`) posées au chantier 3 — la correspondance
existe déjà, elle tourne déjà en production sur `/packages?destination=X`.
Données réelles locales : 4 packages publiés, dont "Istanbul Découverte"
(matche `istanbul`) et "Dubaï Luxe & Désert" (matche `dubai`) — la requête
existante les retrouve verbatim. "Séjour Djerba…" et "Escapade Sahara
Nomade" ne matchent aucune des 8 clés (Djerba n'est pas dans
`DESTINATION_SEARCH_TERMS`, seulement dans le modèle canonique) — signal
correct, pas un bug : pas de cross-sell pour ces deux-là tant que la table
n'est pas étendue, ce qui est un choix produit legitime (voir §4).

**Conclusion : cross-sell Packages faisable immédiatement**, en extrayant
cette requête (déjà écrite, déjà testée en prod sur `/packages`) dans un
helper partagé, appelé aussi par la fiche destination ville. Aucune
nouvelle table, aucune donnée inventée.

## 2. Attractions (`catalog_activities`) — relation réelle mais partielle

`catalog_activities.location` est un champ texte libre (pas de FK). Données
réelles locales (3 activités publiées) :

| title | location | correspond à une ville du modèle canonique ? |
|---|---|---|
| Excursion Sidi Bou Saïd & Carthage | Tunis | oui — `tunis` |
| Jeep Safari Djerba | Djerba | oui — `djerba` |
| Safari Désert Douz | Douz | non — Douz n'est pas une ville seedée |

Aucune table `destination_external_refs` dédiée aux activités n'existe.
`location` matche déjà le nom exact de 2 destinations sur 3 (comparaison
`ILIKE` sur le nom, même mécanisme que la recherche texte déjà en place
sur `/attractions?q=`, ligne 50 de `app/(public)/[locale]/attractions/page.tsx`).

**Conclusion : cross-sell Attractions faisable**, par comparaison
`ILIKE(location, destination.name)` — Douz n'ayant pas de fiche
destination, l'activité n'apparaît simplement nulle part (comportement
correct, pas une régression).

## 3. Omra (`omra_packages`) — aucune relation possible aujourd'hui

Aucune colonne destination, et aucun champ texte exploitable (`name`/`description`
ne citent pas systématiquement un pays). Le modèle canonique (28 lignes,
migration 0055) ne contient d'ailleurs **aucune destination Arabie
Saoudite/Mecque/Médine** — Omra est thématiquement hors du référentiel
géographique actuel. Le rattacher exigerait soit d'ajouter une nouvelle
destination au modèle (décision produit, hors périmètre de ce chantier),
soit une association inventée. **Omra reste hors périmètre de ce
chantier** — cohérent avec le fait que la Turquie/Émirats/etc. sont les
seules destinations "voyage" modélisées à ce jour.

## 4. Hôtels Monde / Vols — pas de cross-sell sans fabriquer une recherche

`parseWorldHotelSearchParams` (`lib/hotels-monde/search-state.ts`) exige
`checkIn`/`checkOut` non-optionnels ; même contrainte confirmée côté Vols
(date de départ obligatoire). Une carte "hôtel à partir de X DT" sur une
fiche destination sans dates utilisateur obligerait à choisir des dates
arbitraires pour obtenir un prix à afficher — c'est fabriquer un contexte
de recherche pour produire un chiffre qui a l'air réel mais ne correspond
à aucune intention utilisateur. **Chantier 4 a déjà couvert ce cas** par
un lien "Voir les hôtels à {ville}" vers la recherche pré-remplie (sans
auto-soumission) — ce chantier n'y touche pas, et n'ajoute aucune carte
prix Hôtels Monde/Vols sur les fiches destination.

## 5. FlashOffers (page d'accueil) — hors périmètre, non lié au modèle canonique

`components/flash-offers.tsx` : 3 cartes statiques codées en dur
(Istanbul/Djerba/Omra), aucune donnée serveur, explicitement documenté
dans le composant lui-même ("aucun prix/date n'est affiché ici"). Item 5
de l'architecture chantier 4 (rewiring de la carte Istanbul) reste
non-approuvé et n'est pas traité ici — la page d'accueil est hors
périmètre de ce chantier, qui porte sur les fiches `/destinations/[slug]`
elles-mêmes.

## 6. Table `destination_external_refs.module` — extension nécessaire ?

Pas pour Packages (déjà couvert par `packages_slug`). Pour Attractions,
deux options réelles :
- **(a)** Comparaison directe `ILIKE(catalog_activities.location, destinations.name)`
  — zéro migration, réutilise le champ déjà là, cohérent avec le
  mécanisme de recherche `/attractions?q=` déjà en prod.
- **(b)** Nouveau module `destination_external_refs` (ex. `activities_slug`)
  — plus rigoureux (relation explicite au lieu d'un texte libre) mais
  nécessite une migration + un curatoriat manuel des 2 lignes existantes,
  pour un gain marginal vu le volume actuel (3 activités).

Recommandation : (a) pour ce chantier — le volume actuel ne justifie pas
la migration, et rien n'empêche de migrer vers (b) plus tard sans casser
l'affichage (l'option (b) est un raffinement, pas un changement de
comportement visible).

## 7. Emplacement du cross-sell

Les fiches ville (`/destinations/[slug]`, type=`city`) sont les seules
concernées — les fiches pays n'ont pas de produit propre (elles listent
déjà leurs villes enfants). Le cross-sell s'ajoute sous la section
"Réserver" existante (chantier 4), avant le footer.

## Résumé

| Module | Cross-sell sur fiche ville ? | Mécanisme |
|---|---|---|
| Packages | Oui | `ILIKE(title)` sur les 8 clés `packages_slug` déjà seedées (réutilise la requête de `/packages`) |
| Attractions | Oui | `ILIKE(location, destination.name)` |
| Omra | Non | Aucune destination Omra dans le modèle canonique |
| Hôtels Monde / Vols | Non (déjà couvert chantier 4) | Dates obligatoires — lien de recherche uniquement, pas de carte prix |
| FlashOffers (accueil) | Non | Hors périmètre (page d'accueil, item 5 chantier 4 non-approuvé) |
