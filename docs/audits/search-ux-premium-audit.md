# Easy2Book — Audit UX Premium : Search → Results → Map → Hotel Detail → Reviews → Checkout

**Portée** : module Hôtels Tunisie (`/hotels/search`, `/hotels/[id]`, `/booking/*`), le module le plus abouti
et le plus représentatif de l'ambition "OTA moderne" — plus les points de contact transverses (homepage,
header/footer, i18n, cross-module) qui affectent l'expérience globale.

**Méthode** : audit-first, zéro modification de code. 5 investigations parallèles menées en lecture seule
sur le code réel (pas de supposition à partir des noms de fichiers) :
1. Inventaire frontend + design system (homepage, header/footer, widget recherche, résultats, fiche hôtel,
   chambres, checkout, compte, cohérence design, mobile).
2. Traçage complet du moteur de recherche (input → API → fournisseur → normalisation → pricing →
   disponibilité → dédoublonnage → tri → filtres → pagination → frontend).
3. Audit de l'intégration carte (dépendances, composants, géodonnées, config).
4. Audit du système d'avis + couverture i18n réelle (FR/EN/AR, y compris RTL et erreurs serveur).
5. Audit du cross-linking destination (Hôtels ↔ Activités ↔ Excursions ↔ Voyages organisés).

Complété par les constats déjà documentés dans `docs/audits/visual-commercial-audit.md` (transverses aux
5 autres modules — photos produit, hero, CTA) quand ils informent la cohérence globale du design system.

**⚠️ Constat opérationnel préalable** : la migration i18n (routes `/fr /en /ar`) et tout le travail décrit
dans ce rapport vivent sur la branche `audit/e2e-certification` (état réel de ce dépôt de travail), **non
fusionnée sur `main`** — un des agents d'audit, lancé sur un worktree basé sur `main`, a découvert que
`main` n'a ni la structure de routes `(public)/[locale]`, ni `messages/*.json`. Tant que la PR #41 n'est
pas mergée, rien de ce qui est certifié i18n/wallet dans ce rapport n'est réellement déployé. Hors périmètre
de correction ici (décision de merge, pas un défaut de code), mais à traiter avant toute mise en prod.

---

## Matrice PASS/FAIL/PARTIAL

Légende État : ✅ PASS · ⚠️ PARTIAL · ❌ FAIL · 🚫 ABSENT (fonctionnalité inexistante, pas un bug)

### Search (widget de recherche)

| ID | Domaine | Fonction | État | Evidence | Priorité |
|---|---|---|---|---|---|
| UX-001 | Search | Destination — Hôtels Tunisie (homepage) | ✅ PASS | `components/hotels-tunisie-search.tsx` — autocomplete réel via `Command`/`Popover` + `useCities()` (TanStack Query) | — |
| UX-002 | Search | Destination — Hôtels Monde (onglet homepage) | ❌ FAIL | `components/booking-engine.tsx:659-801` `HotelsMondeForm` — simple `&lt;Input&gt;` texte libre, aucune suggestion | P1 |
| UX-003 | Search | Destination — Hôtels Monde (page dédiée `/hotels-monde`) | ⚠️ PARTIAL | `components/hotels-monde/world-hotel-search.tsx` — `&lt;Select&gt;` sur liste `POPULAR_DESTINATIONS` codée en dur, pas d'autocomplete | P2 |
| UX-004 | Search | Occupancy — Hôtels Tunisie | ✅ PASS | Chambres + adultes + âges enfants (0-17) individuels | — |
| UX-005 | Search | Occupancy — Hôtels Monde (page dédiée) | ❌ FAIL | `world-hotel-search.tsx` — **aucun champ enfants/bébés du tout**, adultes+chambres seulement, alors que le même module sur l'onglet homepage les a | P1 |
| UX-006 | Search | Dates | ✅ PASS | Datepicker réel, validé, propagé en query params | — |
| UX-007 | Search | Cohérence du composant recherche (design system) | ❌ FAIL | 3+ implémentations divergentes pour Hôtels seul (Tunisie/Monde-tab/Monde-page), 5 de plus par les autres modules — aucun composant partagé pour destination/dates/occupancy, seulement des atomes de style (`components/search-field.tsx`) | P1 |
| UX-008 | Search | Recherche flexible de dates (±1/2/3j) | ✅ PASS | `components/flexible-date-search.tsx` réellement monté (`page.tsx:297-303`) → `/api/hotels/search-flexible` → `runFlexibleHotelSearch()`, pas orpheline contrairement à l'hypothèse initiale | — |
| UX-009 | Search | Champ devise (`currency`) | ❌ FAIL | Accepté par le schéma API (`HotelSearchQuerySchema`) mais jamais envoyé par le hook `useHotelSearch()` — mort en pratique, toujours TND | P2 |
| UX-010 | Search | Champ nationalité | 🚫 ABSENT | Déclaré dans le contrat Hub (`core/types.ts:23`) mais jamais peuplé nulle part | P3 |

### Results / Cards / Filtres / Tri

| ID | Domaine | Fonction | État | Evidence | Priorité |
|---|---|---|---|---|---|
| UX-011 | Results | Bouton "Modifier" (barre résultats) | ❌ FAIL | `components/search-header.tsx:94-97` — **aucun `onClick`**, complètement mort | **P0** |
| UX-012 | Results | Bouton "Afficher : X hôtels" | ❌ FAIL | `search-header.tsx:101-115` — aucun handler, aucun dropdown ; le texte "**100 hôtels**" est un **littéral codé en dur** dans `messages/{fr,en,ar}.json:554`, jamais le vrai total | **P0** |
| UX-013 | Results | Bouton "Trier : Recommandé" (même barre) | ❌ FAIL | `search-header.tsx:101-115` — même barre, même défaut : aucun handler, dupliqué fonctionnellement par le vrai `SortSelect` qui, lui, fonctionne correctement plus bas sur la même page | **P0** |
| UX-014 | Results | Compteur réel de résultats + tri réel | ✅ PASS | `HotelListings` + `SortSelect` (composants distincts de UX-012/013) affichent le vrai total et trient réellement — coexistent avec la barre morte ci-dessus | — |
| UX-015 | Results | Filtres (étoiles, board, prix, annulation gratuite, équipements) | ✅ PASS | `components/filter-sidebar.tsx` — `computeFacets()`/`applyFilters()` (`lib/mygo/facets.ts`), compteurs de facettes réels, handlers fonctionnels | — |
| UX-016 | Results | Tri (4 modes) | ✅ PASS | `lib/mygo/sort.ts` — recommended/price_asc/price_desc/best_deal, tous fonctionnels | — |
| UX-017 | Results | Tri par pertinence scorée | 🚫 ABSENT | Seulement des tris littéraux ; `lib/hotel-suppliers/core/ranking.ts::scoreOffer/rankOffers` existe mais est **mort** (jamais appelé hors tests) | P2 |
| UX-018 | Results | Pagination | 🚫 ABSENT | Aucun `page`/`limit` dans le schéma API ; liste entière rendue sans fenêtrage | P2 |
| UX-019 | Results | Carte hôtel — champs réels (photo, étoiles, lieu, équipements, board, annulation, prix, prix barré, réduction, badges) | ✅ PASS | `components/hotel-card.tsx` + `toCardShape()` — tout est branché sur des données réelles myGo, aucune valeur fabriquée (corrections "Phase 30" déjà documentées en commentaire) | — |
| UX-020 | Results | Galerie photo sur la carte résultat | ⚠️ PARTIAL | `toCardShape` ne fournit **qu'une seule image** (`h.image ? [h.image] : [PLACEHOLDER]`), mais `hotel-card.tsx` implémente un carrousel prev/next complet — UI de navigation multi-photo qui n'a jamais qu'une seule photo à montrer | P2 |
| UX-021 | Results | Note/nombre d'avis sur la carte résultat | 🚫 ABSENT | Pipeline avis réel existant (`/api/reviews/product`) mais jamais interrogé depuis la SERP — `CardHotelShape.rating` est en fait un doublon mort de `stars`, jamais lu par `hotel-card.tsx` | P1 |
| UX-022 | Results | États de chargement (skeletons) | ✅ PASS | `HotelSearchPageSkeleton`, `FilterControlsSkeleton`, skeletons par carte | — |
| UX-023 | Results | États vides (0 résultat fournisseur vs 0 après filtres) | ✅ PASS | Deux messages distincts et corrects (`hotel-listings.tsx:532-572`) | — |
| UX-024 | Results | États d'erreur | ✅ PASS | `service_unavailable`/`rate_limited`/`incomplete_query`/générique différenciés + bannière cache dégradé | — |
| UX-025 | Results | Filtres/tri sur mobile | ✅ PASS | `Drawer`-based `MobileFilterSortBar` — bottom sheets adaptatifs, pas juste une sidebar compressée | — |

### Search Engine — backend (traçage complet)

| ID | Domaine | Fonction | État | Evidence | Priorité |
|---|---|---|---|---|---|
| UX-026 | Engine | Pipeline multi-fournisseurs (dédoublonnage cross-supplier, matching géo/nom, `NormalizedRate.refundable`) | ❌ FAIL (mort) | `searchAcrossSuppliers()` calcule un `hubResult` complet à **chaque** requête, mais `executeHotelSearchThroughHub()` ne l'utilise que pour un log — la réponse HTTP vient uniquement du pipeline myGo simple (`lib/mygo/search-core.ts`) | P2 (dette archi) |
| UX-027 | Engine | Prix affiché = prix facturé | ❌ FAIL | Aucune marge appliquée nulle part côté affichage B2C (recherche/fiche/panier/checkout montrent le prix net myGo) ; la marge (10% défaut) n'est appliquée qu'**après** confirmation fournisseur, au moment de la capture — jamais montrée avant paiement | **P1** |
| UX-028 | Engine | Avis fournisseur/taxe touristique (`HotelSummaryDTO.note`) | ❌ FAIL | Mappé (`mappers.ts:118`) mais **jamais rendu** — contient parfois de vraies mentions légales/financières ("taxe de séjour à régler sur place") | P1 |
| UX-029 | Engine | Détail politique d'annulation payante (montant, échéance) | ⚠️ PARTIAL | Récupéré côté fournisseur mais réduit à un label générique "sur demande" pour tout ce qui n'est pas 100% gratuit — montant/échéance jamais montrés | P2 |
| UX-030 | Engine | Catégorie hôtel (`categoryTitle`), quantité de chambres, code board | 🚫 ABSENT (affichage) | Mappés, jamais lus/rendus — champs morts | P3 |

### Map

| ID | Domaine | Fonction | État | Evidence | Priorité |
|---|---|---|---|---|---|
| UX-031 | Map | Carte interactive résultats | 🚫 ABSENT | Aucune dépendance carte installée (ni Leaflet/Mapbox/Google Maps), aucun composant Map dans tout le dépôt, vivant ou mort | **P1** |
| UX-032 | Map | Carte sur fiche hôtel | ❌ FAIL | Lien externe "Voir sur Google Maps" uniquement (`page.tsx:885-900`) — pas de carte intégrée | P2 |
| UX-033 | Map | Géodonnées hôtel (lat/lng) disponibles | ✅ PASS (mais perdues en aval) | `lat`/`lng` traversent tout le pipeline myGo jusqu'à `HotelOfferDTO.hotel` — **supprimées** dans `toCardShape()` (`hotel-listings.tsx:218-233`) avant d'atteindre la grille de résultats | P1 (câblage) |
| UX-034 | Map | Clustering / sync liste↔carte | 🚫 ABSENT | N/A — rien à synchroniser, aucune carte n'existe | P1 (dépend UX-031) |

### Hotel Detail / Chambres

| ID | Domaine | Fonction | État | Evidence | Priorité |
|---|---|---|---|---|---|
| UX-035 | Detail | Galerie photo | ✅ PASS | Multi-image réelle avec vignettes, prev/next, compteur — fonctionne correctement (contrairement à la SERP) | — |
| UX-036 | Detail | Description, équipements groupés | ✅ PASS | Rendu conditionnel, aucun texte de remplissage | — |
| UX-037 | Detail | Chambres & tarifs | ✅ PASS | `HotelRoomRates` partagé SERP/détail, 3 états d'annulation réels, bug de collision de clé déjà corrigé | — |
| UX-038 | Detail | Comparaison tarifs en table (vs liste) | ⚠️ PARTIAL | Liste de lignes, pas de tableau comparatif côte-à-côte | P3 |
| UX-039 | Detail | Hôtels similaires | ✅ PASS | Requête réelle scopée, labels comparatifs calculés ("Moins cher"/"Même catégorie") | — |

### Reviews

| ID | Domaine | Fonction | État | Evidence | Priorité |
|---|---|---|---|---|---|
| UX-040 | Reviews | Note globale + nombre d'avis (fiche détail) | ✅ PASS | Réel, calculé, jamais fabriqué — `reviews-display.tsx` | — |
| UX-041 | Reviews | Note globale + nombre d'avis (carte résultat) | 🚫 ABSENT | Doublon de UX-021 — jamais requêté depuis la SERP | P1 |
| UX-042 | Reviews | Notes par catégorie (propreté/emplacement/service/rapport qualité-prix) | 🚫 ABSENT | Schéma `reviews` n'a qu'une colonne `rating` unique — aucune colonne catégorielle | P2 (data gap) |
| UX-043 | Reviews | Type de voyageur | 🚫 ABSENT | Colonne inexistante | P2 (data gap) |
| UX-044 | Reviews | Thèmes positifs/négatifs agrégés | 🚫 ABSENT | Aucune agrégation/NLP existante | P3 (major work) |
| UX-045 | Reviews | Modération avant publication | ✅ PASS | `status='pending'` par défaut, seul `listApprovedReviewsForProductCore` (filtre `approved`) est public | — |
| UX-046 | Reviews | Avis réellement présents en base | 🚫 ABSENT (par design) | Zéro avis seedé — fonctionnalité neuve, honnêtement vide ("les avis apparaissent après un séjour réellement vécu") | — (pas un défaut) |

### Checkout

| ID | Domaine | Fonction | État | Evidence | Priorité |
|---|---|---|---|---|---|
| UX-047 | Checkout | Récapitulatif prix (anti-tampering, `priceToken` vérifié serveur) | ✅ PASS | Bloque la page si le token échoue — déjà certifié, non ré-audité en détail (moteur financier) | — |
| UX-048 | Checkout | Photo hôtel dans le récapitulatif/panier | 🚫 ABSENT | Texte seul, aucune vignette — contrairement aux OTA de référence | P2 |
| UX-049 | Checkout | Formulaire voyageur | ✅ PASS | Validation Zod réelle, erreurs inline | — |
| UX-050 | Checkout | 6 méthodes de paiement (UI) | ✅ PASS | Toutes sélectionnables, icônes/labels réels — logique financière déjà certifiée séparément | — |

### i18n (FR/EN/AR)

| ID | Domaine | Fonction | État | Evidence | Priorité |
|---|---|---|---|---|---|
| UX-051 | i18n | Widget recherche, filtres, tri, cartes (storefront public) | ✅ PASS | `useTranslations`/`t()` réels, `ar.json` vérifié comme vraie traduction (pluriels ICU, adaptations dialectales), pas une copie FR/EN | — |
| UX-052 | i18n | Fiche hôtel (structure) | ✅ PASS | Titres de section traduits ; description/équipements = contenu fournisseur, non traduisible par nature (attendu) | — |
| UX-053 | i18n | Checkout, y compris "Dépôt bancaire" | ✅ PASS | Contrairement à l'hypothèse initiale, FR/EN/AR tous présents et distincts (`messages/*.json:959-960`) | — |
| UX-054 | i18n | Aria-label note avis (`star-row.tsx`) | ❌ FAIL | `` `${rating} sur 5` `` codé en dur, jamais localisé | P3 |
| UX-055 | i18n | Messages d'erreur soumission d'avis | ❌ FAIL | Erreurs serveur (`reviews-core.ts`, `submit-review.ts`) codées en dur en français, affichées telles quelles quelle que soit la langue — le fallback traduit côté UI est mort car `result.error` est toujours renseigné | P2 |
| UX-056 | i18n | RTL visuel | ⚠️ PARTIAL | Fix RTL déjà appliqué en session antérieure (`dir` sur `&lt;html&gt;`) mais non re-testé dans ce cycle sur écrans résultats/carte/avis spécifiquement | P2 (preuve manquante) |

### Design system / cohérence

| ID | Domaine | Fonction | État | Evidence | Priorité |
|---|---|---|---|---|---|
| UX-057 | Design | Primitives UI (Button/Badge/Card) | ✅ PASS | Centralisées dans `components/ui/`, aucune ré-implémentation dupliquée trouvée | — |
| UX-058 | Design | Cohérence des composants de recherche | ❌ FAIL | Doublon de UX-007 | P1 |
| UX-059 | Design | Token couleur codé en dur (`bg-teal-700`) | ❌ FAIL | `world-hotel-search.tsx:175` — casse la cohérence de thème (impact White Label) | P3 |
| UX-060 | Design | Code mort (`VolsForm`/`TransfertsForm`/`CarForm` dans `booking-engine.tsx`) | ❌ FAIL | ~500 lignes inatteignables, dupliquant la logique déjà réelle de `components/vols/flight-search.tsx` etc. | P3 |
| UX-061 | Design | Navigation persistante entre modules (header) | 🚫 ABSENT | Header n'expose que Aide/Réservations/Panier/Compte — aucun lien vers Hôtels/Omra/Voyages une fois sorti de la homepage | P1 |
| UX-062 | Design | Sélecteur devise mobile | ❌ FAIL | `CURRENCIES=["TND","EUR","USD"]`, toggle mobile ne bascule qu'entre 2 — USD inatteignable | P1 |
| UX-063 | Design | Bannière "Flash Offers" (homepage) | ❌ FAIL | 3 destinations en dur, aucune donnée prix/date réelle malgré le label "offre" | P1 |

### Mobile

| ID | Domaine | Fonction | État | Evidence | Priorité |
|---|---|---|---|---|---|
| UX-064 | Mobile | Overflow 390px — pages couvertes par test E2E | ⚠️ PARTIAL | `e2e/mobile-overflow.spec.ts` couvre home/recherche/résultats mais **pas** fiche hôtel ni checkout | P2 |
| UX-065 | Mobile | Carte hôtel — layout responsive | ✅ PASS | Stack image/contenu correct, pas de largeur fixe sous `md:` | — |
| UX-066 | Mobile | Barre résultats mobile | ❌ FAIL | Sur mobile, seuls destination + le bouton "Modifier" mort restent visibles (dates/pax cachés) — aggrave UX-011 | P1 |

### Cross-module / Trip content

| ID | Domaine | Fonction | État | Evidence | Priorité |
|---|---|---|---|---|---|
| UX-067 | Trip | Modules indépendants réels (Hôtels/Omra/Packages/Attractions/Vols/Car/Transferts) | ✅ PASS | Les 8 modules ont catalogue + détail + réservation réels, aucun stub | — |
| UX-068 | Trip | Lien destination croisé (Hammamet → hôtels → activités) | 🚫 ABSENT | Aucune UI de découverte cross-module nulle part, ni sur la SERP hôtel ni sur la fiche détail | **P1** |
| UX-069 | Trip | Taxonomie destination partagée en base | 🚫 ABSENT | Table `products` conçue pour ça mais **orpheline** (jamais lue/écrite par l'app réelle) ; `catalog_packages` n'a même pas de colonne destination (recherche par mot-clé texte) | P2 (backend) |
| UX-070 | Trip | Capture de leads sur pages hôtel | ❌ FAIL | `LeadProductType` inclut déjà `"hotel"` côté backend CRM, mais `LeadCaptureForm` n'est jamais instancié sur `hotels/[id]` (l'est sur Packages/Omra) | P2 (quick win) |
| UX-071 | Trip | Attractions dans le moteur de recherche homepage | ❌ FAIL | Exclu de `tabsConfig` sur la base d'un commentaire obsolète affirmant "aucun parcours de réservation" — faux, le module Attractions a un flux de réservation complet et réel | P1 (quick win) |

---

## CURRENT STATE

Le module Hôtels Tunisie est **fonctionnellement solide en profondeur** (filtres, tri, états de
chargement/vide/erreur, sécurité anti-tampering du prix, formulaire voyageur, modération d'avis) mais
**visuellement et commercialement en retrait** d'une OTA moderne sur des points très visibles : une barre
de contrôle entière (Modifier/Afficher/Trier) est morte et affiche un chiffre inventé au-dessus de
résultats pourtant correctement comptés juste en dessous ; il n'y a aucune carte nulle part dans
l'application ; les notes d'avis existent mais n'apparaissent jamais sur la liste de résultats ; le widget
de recherche est réimplémenté 3 fois avec des capacités qui divergent silencieusement (Hôtels Monde perd
carrément le champ enfants sur sa page dédiée) ; et le prix affiché pendant tout le parcours n'est pas
celui réellement facturé (la marge n'apparaît qu'après coup). Le moteur multi-fournisseurs (dédoublonnage,
scoring) tourne à chaque requête mais son résultat est jeté — Easy2Book n'utilise aujourd'hui qu'un seul
vrai fournisseur (myGo) en pratique. Aucune donnée fictive n'a été trouvée nulle part dans ce module — le
problème n'est jamais "on invente", c'est "on calcule puis on n'affiche pas" ou "on n'a pas encore câblé".

## TARGET STATE

Une expérience où : (1) chaque contrôle visible est réellement fonctionnel (zéro bouton décoratif) ; (2)
le prix vu = le prix payé, à chaque étape ; (3) une vraie carte synchronisée liste↔marqueur existe côté
desktop (split list+map) et mobile (plein écran à la demande) ; (4) la note d'avis apparaît dès la carte
résultat, pas seulement après un clic ; (5) un seul composant de recherche partagé sert tous les modules
avec les mêmes capacités partout ; (6) rechercher un hôtel à Hammamet propose des activités/excursions
réelles au même endroit ; (7) le classement des résultats peut évoluer au-delà du tri littéral vers une
pertinence pondérée, une fois la matrice validée (Phase 7, non implémentée ici).

## GAPS (résumé)

- **19 findings classés P0/P1** touchant directement la conversion ou la confiance (boutons morts, faux
  chiffre, absence de carte, absence de note sur la SERP, prix affiché ≠ facturé, absence de nav module,
  devise mobile bloquée, offres flash sans données, widget dupliqué, Attractions exclu par erreur,
  absence de cross-sell destination).
- **14 findings P2** — polish premium et dette technique (pagination, pipeline multi-fournisseur mort,
  détail annulation réduit, erreurs d'avis non traduites, photo absente du récap checkout, etc.).
- **9 findings P3** — champs morts mineurs, incohérences de token de design, code mort sans impact
  utilisateur visible.
- **0 donnée fictive/avis fictif trouvé** dans ce module — conforme à la contrainte "aucune donnée
  fictive" de la mission.

## QUICK WINS (P0/P1, câblage simple, pas de nouvelle donnée nécessaire)

1. **UX-011/012/013** — câbler ou supprimer la barre morte Modifier/Afficher/Trier ; retirer le littéral
   "100 hôtels" des fichiers de traduction (le vrai total existe déjà juste en dessous).
2. **UX-070** — instancier `&lt;LeadCaptureForm productType="hotel" /&gt;` sur `hotels/[id]` (le backend
   l'accepte déjà).
3. **UX-071** — réintégrer Attractions dans `tabsConfig` de la homepage (le flux de réservation existe
   déjà réellement).
4. **UX-021/UX-041** — remonter note + nombre d'avis sur la carte résultat (la requête existe déjà pour
   la fiche détail, il s'agit de l'agréger en amont et de corriger `toCardShape`).
5. **UX-062** — corriger la logique de toggle du sélecteur de devise mobile (bug de rotation à 2 valeurs
   au lieu de 3).
6. **UX-033** — cesser de supprimer `latitude`/`longitude` dans `toCardShape()` (prérequis pour la carte).
7. **UX-028** — afficher `HotelSummaryDTO.note` quand elle existe (mention légale/taxe).

## MAJOR WORK (P1/P2, conception + développement substantiels)

1. **Carte interactive** (UX-031/032/034) — aucune dépendance installée, composant à construire de zéro
   (choix librairie, clé API, clustering, sync liste↔marqueur, layout split desktop / plein écran mobile).
2. **Prix affiché = prix facturé** (UX-027) — déplacer le calcul de marge en amont de l'affichage (impact
   sur `lib/pro/pricing.ts`/`guest-actions.ts` — nécessite validation produit avant tout changement, hors
   du moteur wallet certifié).
3. **Composant de recherche unifié** (UX-007/UX-058) — refonte du widget destination/dates/occupancy en un
   seul composant partagé par tous les modules, avec le même jeu de champs partout.
4. **Cross-module destination** (UX-068/069) — retrofit d'une clé destination partagée sur
   `catalog_activities`/`catalog_packages`, nouvelle requête "contenu proche", nouveau composant de
   découverte sur SERP + fiche hôtel.
5. **Catégories de notes d'avis** (UX-042/043) — nouvelles colonnes DB + UI, si le produit veut aller
   au-delà de la note globale actuelle.
6. **Pagination serveur** (UX-018) — nécessaire si le catalogue grossit au-delà de ce qu'un rendu complet
   en mémoire supporte confortablement.

## BACKEND GAPS

- Marge appliquée trop tard dans le cycle de vie de la réservation (UX-027).
- Pipeline Hub multi-fournisseurs calculé puis jeté à chaque requête (UX-026) — soit le brancher
  réellement, soit le retirer pour ne plus payer son coût de calcul pour rien.
- `rankOffers()`/`scoreOffer()` mort, jamais appelé (UX-017).
- Table `products` orpheline — soit la réactiver comme fondation de la taxonomie destination partagée,
  soit la retirer.
- Aucune colonne destination structurée sur `catalog_packages`/`catalog_activities` (UX-069).
- Schéma `reviews` limité à une note globale unique (UX-042/043).

## FRONTEND GAPS

- Barre de contrôle résultats entièrement morte (UX-011/012/013).
- Widget de recherche dupliqué 3+ fois avec capacités divergentes (UX-007).
- Carrousel photo sur la SERP qui n'a jamais qu'une image à montrer (UX-020).
- Aucune navigation module persistante (UX-061).
- Aucune photo dans le récapitulatif checkout/panier (UX-048).
- Code mort dans `booking-engine.tsx` (formulaires Vols/Transferts/Car inatteignables, UX-060).

## DATA GAPS

- Notes par catégorie, type de voyageur, thèmes positifs/négatifs : colonnes inexistantes (UX-042/043/044).
- Détail montant/échéance des politiques d'annulation payantes : réduit à un label générique (UX-029).
- Aucune donnée de proximité/POI pour un futur calcul de distance (déjà signalé dans le code source lui-même,
  `lib/mygo/types.ts`).

## PROVIDER GAPS

- myGo est le **seul** fournisseur réellement connecté ; tunisia-bed/cyberesa/3t sont des stubs
  `NOT_CONFIGURED` — tout le travail de dédoublonnage cross-fournisseur n'a aujourd'hui aucun deuxième
  fournisseur réel à dédoublonner.
- myGo ne fournit aucun score d'avis natif (explicitement documenté comme non-fabriqué dans le code —
  bon réflexe, pas un défaut).
- myGo n'expose aucune ligne de taxes/frais séparée — un seul total opaque (UX non concerné, c'est une
  limite fournisseur).

---

*Rapport produit par audit parallèle (5 investigations en lecture seule) le 2026-09-13, sur
`audit/e2e-certification` @ `4e27a81`. Aucun fichier de code modifié pendant cette phase.*
