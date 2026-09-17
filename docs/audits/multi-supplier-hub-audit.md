# Audit — Chantier 7 : Multi-supplier Hub

Phase Premium 2. Recherche effectuée sur le code réel du dépôt (aucune
fabrication) — tous les fichiers cités ci-dessous ont été lus intégralement.

## Constat global

**Hôtels Tunisie a déjà un Hub multi-fournisseurs complet et réellement
câblé en production** (`lib/hotel-suppliers/**`, Phase 28) : interface
`HotelSupplierDriver` provider-neutre, orchestration parallèle avec
isolation timeout (`searchAcrossSuppliers()`), déduplication cross-
fournisseur, résolution tenant-scopée des comptes, 20 catégories de tests.
Appelé réellement par `/api/hotels/search`, `/api/hotels/search-public`,
`/pro/hotels` et la recherche par dates flexibles (un appel par candidat).

**Aucun second fournisseur hôtel réel n'existe ni n'est documentable
aujourd'hui.** Les 3 drivers non-myGo (`tunisia-bed`, `cyberesa`, `3t`)
sont des stubs honnêtes `DOCUMENTATION_REQUIRED` — voir
`lib/hotel-suppliers/core/stub-driver.ts` : chaque méthode renvoie
explicitement "non configuré", jamais un résultat fabriqué. La cause est
documentée dans chaque `<supplier>/config.ts` : documentation API jamais
obtenue (Tunisia Bed, Cyberesa) ou inaccessible depuis cet environnement
(3T — accès réseau bloqué vers `documenter.getpostman.com`, déjà
investigué en Phase 28). Rien de nouveau n'a été trouvé qui changerait ce
constat.

**Hôtels Monde et Vols n'ont aucune abstraction Hub.** Chacun appelle
directement son unique fournisseur virtuel
(`lib/hotels-monde/client.ts` → `virtual-supplier/engine.ts`,
`lib/vols/client.ts` → idem) — pas d'interface driver, pas
d'orchestration, pas de déduplication. Aucun second fournisseur réel
(virtuel ou non) n'a jamais été documenté ou évoqué pour ces deux modules.

## Deux défauts confirmés dans le Hub existant

### 1. Résultat Hub calculé puis jeté à chaque requête réelle (déjà connu — UX-026)

`executeHotelSearchThroughHub()`/`runSearchThroughHub()`
(`lib/hotel-suppliers/search-hub.ts`) exécutent réellement
`searchAcrossSuppliers()` (normalisation myGo + dédoublonnage) sur CHAQUE
recherche hôtel Tunisie en production — confirmé par les imports réels
dans les 4 points d'entrée listés ci-dessus, pas seulement les tests.
Mais `hubResult` ne sert qu'à `logHubSearchObservability()` (logs) ; la
réponse HTTP vient uniquement de `runResult`/`formatHotelSearchResponse()`
(pipeline myGo simple, `lib/mygo/search-core.ts`).

Ce n'est **pas un oubli** : le header du fichier documente une décision
d'architecture délibérée — reconstruire la réponse depuis
`NormalizedHotel`/`NormalizedRate` perdrait des champs réellement utilisés
en production (`cancellationPolicies[]` à plusieurs paliers,
`recommended`, `basePrice`/`photo`/`description`/`quantité` par chambre,
absents du contrat Normalized volontairement provider-neutre). Coût réel
payé aujourd'hui : une passe de normalisation + une passe de
déduplication sur des données déjà en mémoire (aucun appel réseau
dupliqué — le driver myGo est un pass-through documenté) — pas gratuit,
mais pas un aller-retour réseau non plus.

### 2. `rankOffers()`/`scoreOffer()` : code mort confirmé (déjà connu — UX-017)

`lib/hotel-suppliers/core/ranking.ts` n'est appelé nulle part en dehors
de son propre fichier et de ses tests (recherche exhaustive
`rankOffers|scoreOffer` dans `app/`+`lib/`, hors `ranking.ts`/`__tests__`
: zéro résultat). Le Hub renvoie déjà les résultats dans
`HubSearchResult.results` sans jamais appeler ce classement.

## Conclusion honnête sur le périmètre du chantier

Le titre du chantier ("Multi-supplier Hub") suggère d'ajouter/étendre du
multi-fournisseurs réel. Mais aucune donnée réelle ne permet de le faire
aujourd'hui : zéro second fournisseur (hôtel ou vol) n'a de documentation
API disponible, ni pour Hôtels Tunisie (déjà tenté, bloqué), ni pour
Hôtels Monde/Vols (jamais tenté, aucun candidat identifié). Fabriquer un
second fournisseur ou une intégration réelle serait de la donnée fictive
— explicitement interdit.

Trois options réellement actionnables, sans rien inventer :

- **(a) Hygiène minimale** : supprimer `ranking.ts` (code mort confirmé,
  zéro appelant) — ou le laisser en l'état si le risque de suppression
  (tests dédiés, 100+ lignes) est jugé disproportionné pour un gain nul.
  Rien d'autre à corriger : le calcul Hub "jeté" (UX-026) est une
  décision déjà documentée et délibérée, pas un bug.
- **(b) Parité structurelle Hôtels Monde/Vols** : construire la même
  forme d'interface driver + orchestration pour Hôtels Monde et Vols,
  enveloppant leur unique fournisseur virtuel actuel derrière un contrat
  driver-neutre — chacun n'aurait toujours qu'un seul driver CONFIGURED
  aujourd'hui (aucun second fournisseur réel en vue), mais la structure
  serait prête si un jour un vrai fournisseur apparaît. C'est un travail
  réel et scopé, mais spéculatif — aucun besoin concret ne le motive
  aujourd'hui (aucun second fournisseur Hôtels Monde/Vols n'a jamais été
  évoqué), ce qui va à l'encontre de la discipline "pas d'architecture
  pour un besoin hypothétique" déjà appliquée ailleurs dans ce dépôt.
- **(c) Fermeture audit-only** : constater qu'aucun travail multi-
  fournisseurs réel n'est possible aujourd'hui (ni nouveau fournisseur
  documentable, ni bug fonctionnel à corriger — seul du code mort
  optionnel), et passer directement au chantier 8 (Ranking/
  Recommandation) sans code ici.

Je recommande **(c)**, éventuellement combiné à **(a)** si tu veux
profiter du passage ici pour retirer `ranking.ts` — mais la décision
t'appartient, ce chantier n'a pas de "vrai" travail multi-fournisseurs
disponible sans fabriquer quelque chose.
