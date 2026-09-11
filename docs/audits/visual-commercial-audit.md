# Audit visuel & commercial — Easy2Book

Basé sur les 40 captures réelles produites lors du cycle "Final Screenshot
Certification" (`docs/audits/screenshots/{omraty,voyages-organises,attractions,vols,hotels-monde}/`),
complétées par les 11 captures Hôtels Tunisie du cycle antérieur
(`docs/audits/screenshots/dashboard-ops-*.png`). Aucune capture n'a été fabriquée pour cet audit —
toutes proviennent des runs E2E réels déjà certifiés.

**Mise à jour — cycle de correction (même session, suite à "CORRIGER")** : 4 des 8 constats
ci-dessous ont été corrigés, vérifiés en navigateur réel après rebuild, avec capture avant/après
(`docs/audits/screenshots/corrections/`). Chaque section corrigée porte désormais un bandeau
**✅ CORRIGÉ**. Le reste (photos produit réelles, hero photographiques, "places restantes", preuve
mobile) reste non traité — nécessite soit des décisions produit (voir §Suite), soit un cycle de
captures dédié.

**Portée** : les écrans orientés client (recherche, résultats, fiche produit, réservation,
confirmation) des 5 modules capturés ce cycle. Les écrans back-office (06-09, admin) sont mentionnés
seulement quand ils affectent directement la confiance client (ex. voucher).

---

## Constats transverses (touchent plusieurs/tous les modules)

### 1. Aucune photo produit — uniquement des aplats de couleur

**Problème** : les cartes résultat (Omraty, Voyages organisés, Attractions) et les lignes de résultat
(Vols, Hôtels Monde) n'affichent jamais de photo réelle du produit — un bandeau de couleur unie (vert,
orange, bleu, violet, teal) avec le nom du produit en texte superposé, parfois une simple icône
(globe, boussole) quand le nom ne "remplit" pas assez visuellement.
**Impact** : une plateforme de voyage se vend par l'image (destination, hôtel, désert, mer). Sans
photo, chaque carte a l'air d'un wireframe/maquette non finalisée, pas d'un produit qu'on a envie
d'acheter. C'est probablement le frein commercial n°1 de toute la plateforme, avant même le prix ou
le CTA.
**Correction** : au minimum une photo de couverture par produit (destination, établissement ou
activité) dans le bandeau de carte, avec l'aplat de couleur actuel conservé comme fallback si aucune
image n'est encore renseignée en base (jamais une image générique/fictive).
**Composant** : `components/omra/omra-package-list.tsx`, `components/packages/package-list.tsx`,
`app/attractions/page.tsx` (cartes inline), `app/vols/search/flight-results-content.tsx`,
`app/hotels-monde/search/world-hotel-results-content.tsx`.
**Priorité** : P0 conversion.

### 2. Bannière "fournisseur simulé" visible par le client final (Vols, Hôtels Monde) — ✅ CORRIGÉ

**Problème** : sur les pages de résultats Vols et Hôtels Monde, un encadré jaune bien visible dit
littéralement *"Fournisseur de vols simulé. La connexion à un GDS réel (Amadeus/Sabre) n'est pas
encore configurée — ces compagnies, horaires et prix sont générés, pas une disponibilité de marché
réelle."* (même message pour les hôtels avec Expedia/Booking). Ce texte, écrit pour un auditeur
technique, est actuellement affiché tel quel à un client qui recherche un vol ou un hôtel.
**Impact** : c'est la phrase la plus destructrice de confiance possible sur une page de vente — elle
dit explicitement au client "les prix et disponibilités que vous voyez ne sont pas réels". Combinée
au badge footer "Disponibilité Réelle" affiché juste en dessous sur la même page, c'est une
contradiction visible en un seul écran. Aucun client ne réserve après avoir lu ça.
**Correction** : retirer cet encadré de l'écran client (ou le remplacer par rien) avant toute mise en
production réelle de ces deux modules ; le garder uniquement dans un contexte admin/QA si un signal
est nécessaire en interne (ex. badge discret réservé aux rôles admin).
**Composant** : `app/vols/search/flight-results-content.tsx`,
`app/hotels-monde/search/world-hotel-results-content.tsx`.
**Priorité** : P0 confiance — bloquant avant toute vente réelle sur ces 2 modules, indépendamment du
sujet fournisseur réel traité ailleurs (Vercel/GO-LIVE).

**✅ Correction appliquée** : supprimer purement et simplement le message aurait été malhonnête dans
l'autre sens (facturer un client réel pour un vol/hôtel qui n'existe pas, sans le lui dire, serait
une pratique commerciale trompeuse — hors de question). Le correctif retenu reformule le message en
langage client (plus de jargon "GDS/Amadeus/Sabre"/"pas une disponibilité de marché réelle"), le
raccourcit, et remplace le traitement visuel "alerte" (fond ambre, texte gras en rouge) par un
encadré neutre et discret : *"Offres de démonstration — la réservation est entièrement
fonctionnelle, la connexion à nos compagnies/partenaires est en cours de finalisation."* Toujours
honnête, plus jamais alarmant. Vérifié en navigateur réel après rebuild — voir
`docs/audits/screenshots/corrections/vols-before.png` / `vols-after.png` et
`hotels-monde-before.png` / `hotels-monde-after.png`.

### 3. CTA "Voir le programme" incohérent entre modules — ✅ CORRIGÉ

**Problème** : sur les cartes Omraty, le bouton "Voir le programme" est plein (fond vert, texte
blanc, fort contraste). Sur Voyages organisés et Attractions, le même bouton est en style
outline/blanc (fond blanc, bordure fine, texte sombre) — un CTA visuellement plus faible, qui se
détache moins de la carte.
**Impact** : le CTA principal d'une carte produit doit être l'élément le plus visible de la carte,
de façon identique quel que soit le module — sinon l'attention de l'œil varie sans raison
commerciale, et les modules avec CTA outline convertissent structurellement moins bien (contraste
plus faible = moins cliqué, constat classique en A/B testing e-commerce).
**Correction** : un seul traitement de CTA principal (fond plein, couleur de marque) partagé par
toutes les cartes produit des 5 modules, indépendamment du style visuel propre à chaque module
(couleur de bandeau, badges).
**Composant** : les mêmes 5 fichiers cartes listés au point 1 (probablement un composant `Button`
partagé déjà existant, variante `outline` utilisée par erreur sur Voyages/Attractions).
**Priorité** : P1 conversion.

**✅ Correction appliquée** : `components/packages/package-list.tsx` — `Button variant="outline"` →
bouton plein (`bg-violet-700`, même traitement que le bouton solide déjà correct d'Omraty). Le
catalogue Attractions (`app/attractions/page.tsx`) n'avait quant à lui AUCUN bouton visible du tout
(toute la carte était un simple lien sans CTA discret) — ajout d'un bouton plein "Voir les
disponibilités" (`bg-teal-700`) en bas de carte, cohérent avec les 2 autres modules. Vérifié en
navigateur réel — voir `docs/audits/screenshots/corrections/voyages-organises-*.png` et
`attractions-*.png`.

### 4. Prix absent des cartes résultat Attractions — ✅ CORRIGÉ (+ gap identique trouvé sur Voyages organisés)

**Problème** : les cartes du catalogue Attractions (`Excursion Sidi Bou Saïd & Carthage`, `Jeep
Safari Djerba`, `Safari Désert Douz`) n'affichent ni prix ni "à partir de X DT" — seulement durée et
lieu. Omraty et Voyages organisés affichent le prix bien en évidence sur leurs cartes équivalentes.
**Impact** : le prix est l'information n°1 qui permet de trier/décider en un coup d'œil dans une
liste. Son absence oblige à cliquer sur chaque carte pour comparer — friction directe, et
incohérence avec le reste du site qui laisse penser à un oubli plutôt qu'un choix.
**Correction** : ajouter le prix ("À partir de X DT") sur les cartes du catalogue Attractions, même
traitement visuel (taille, couleur) que sur Omraty/Voyages organisés.
**Composant** : `app/attractions/page.tsx`.
**Priorité** : P1 conversion.

**Correction (constat révisé en creusant le composant)** : `components/packages/package-list.tsx`
n'affichait en réalité AUCUN prix non plus (erreur dans la première rédaction de cet audit, qui
disait à tort le prix "visible" sur Voyages organisés — corrigé ici) : `CatalogPackage` n'a pas de
colonne prix, le prix vit uniquement dans `catalog_package_departures` (par départ programmé), jamais
agrégé jusqu'à la carte liste.

**✅ Correction appliquée** (Voyages organisés ET Attractions) : `app/packages/page.tsx` et
`app/attractions/page.tsx` calculent désormais le prix minimum réel parmi les départs/sessions
ouverts et à venir (`MIN(adultPriceTnd)` sur `catalog_package_departures`/`catalog_activity_sessions`,
jamais un prix inventé), et l'affichent "À partir de X DT" sur chaque carte, même traitement visuel
qu'Omraty. Vérifié en navigateur réel après rebuild — voir
`docs/audits/screenshots/corrections/voyages-organises-before.png` /
`voyages-organises-after.png` et `attractions-before.png` / `attractions-after.png`.

### 5. Aucun signal d'urgence/rareté exploité malgré la donnée disponible

**Problème** : les cartes Omraty affichent "Places dispo" en texte générique sans le nombre réel,
alors que la page détail du même produit affiche "28 places" quelques clics plus loin — la donnée
existe, elle n'est simplement pas remontée sur la carte liste.
**Impact** : "28 places restantes" (ou une variante orientée urgence en dessous d'un seuil, ex. "Plus
que 4 places") est un levier de conversion classique en vente de voyages à stock limité (Omra,
départs groupés) — actuellement invisible avant le clic.
**Correction** : afficher le nombre réel de places sur la carte liste, avec un traitement visuel
distinct (couleur ambre/rouge) sous un seuil bas, cohérent avec le badge déjà utilisé sur la page
détail (`28 places` en pastille verte).
**Composant** : `components/omra/omra-package-list.tsx`, `components/packages/package-list.tsx`.
**Priorité** : P2 conversion.

### 6. Hero de page — aplat de couleur uni, aucune photographie

**Problème** : chaque page module (`/omra`, `/packages`, `/attractions`, `/vols`, `/hotels-monde`)
ouvre sur un bandeau plein écran en dégradé de couleur uni (vert Omraty, violet Voyages, teal
Attractions, bleu Vols) avec titre/sous-titre en texte blanc — jamais de photo de destination ou
d'ambiance.
**Impact** : c'est le tout premier écran vu par le client sur chaque module — le moment "donne envie"
par excellence sur n'importe quelle OTA (Booking, GetYourGuide, Expedia ouvrent tous sur une photo
plein cadre). Un aplat de couleur, aussi propre soit-il, lit comme une maquette, pas comme une
plateforme de voyage premium.
**Correction** : photo de fond plein cadre (destination emblématique du module) sous l'overlay de
couleur actuel (conservé comme overlay de lisibilité du texte, pas comme fond seul).
**Composant** : les composants hero de chacune des 5 pages module (`app/omra/page.tsx`,
`app/packages/page.tsx`, `app/attractions/page.tsx`, `app/vols/page.tsx`, `app/hotels-monde/page.tsx`
ou leur layout partagé si commun).
**Priorité** : P1 premium/conversion.

### 7. Mobile non vérifié ce cycle — aucune preuve visuelle disponible

**Problème** : les 40 captures de ce cycle sont toutes en résolution desktop (viewport large). Aucune
capture mobile n'a été produite pour les 5 modules recertifiés.
**Impact** : impossible de juger honnêtement la colonne "Mobile" du tableau demandé sur la base des
preuves actuelles — la majorité du trafic OTA est mobile, un défaut non détecté ici (card qui déborde,
CTA hors écran, formulaire illisible) resterait invisible tant qu'aucune capture mobile n'existe.
**Correction** : un cycle de captures dédié à 375px/390px (iPhone standard) sur les mêmes 5 parcours,
avant de pouvoir répondre "Mobile : PASS" avec preuve.
**Composant** : n/a (constat de couverture de preuve, pas un défaut de composant).
**Priorité** : P1 preuve manquante — à traiter avant de certifier "Mobile" dans un rapport futur.

### 8. Badge footer "Disponibilité Réelle" contredit par le contenu de la page (Vols/Hôtels Monde)

**Problème** : le bloc de réassurance en pied de page (`Paiement 100% Sécurisé · Support Local 7j/7 ·
Disponibilité Réelle · Agence Physique`) est identique sur toutes les pages, y compris Vols et Hôtels
Monde où le contenu de la même page affirme l'inverse (voir point 2).
**Impact** : au-delà du problème de fond (point 2), la contradiction est visible dans le MÊME
screenshot — le client n'a même pas besoin de naviguer pour la voir.
**Correction** : conditionner ce badge (ou le neutraliser) sur les pages où l'inventaire est
actuellement simulé, une fois le point 2 traité le badge redevient valable partout.
**Composant** : bloc de réassurance partagé (footer/trust bar), probablement
`components/site-trust-bar.tsx` ou équivalent — à confirmer à l'implémentation.
**Priorité** : P1 confiance (dépend du correctif du point 2).

---

## Grille par critère (les 5 modules recertifiés)

| Critère | Constat |
|---|---|
| 🎨 Design | Propre, cohérent en typographie/espacement, mais visuellement "maquette" plutôt que "produit fini" — l'absence totale de photo (constat 1/6) est la cause principale. Pas de defect de mise en page observé (aucun élément cassé/chevauché sur les captures desktop). |
| 🧭 Compréhension | Bonne — hiérarchie titre/sous-titre/formulaire de recherche claire sur toutes les pages hero, labels de champs explicites. Aucun écran ambigu observé. |
| 💰 Prix | ✅ Depuis correction : visible sur les 5 modules (Omraty/Vols/Hôtels Monde l'avaient déjà ; Voyages organisés et Attractions ne l'avaient pas du tout — corrigé, voir constat 4). |
| 🔴 CTA | ✅ Depuis correction : bouton plein cohérent sur les 5 modules (Voyages organisés/Attractions étaient en style outline ou sans bouton du tout — corrigé, voir constat 3). |
| 🖼️ Images | Absentes partout (constat 1) — le point faible le plus sévère de cet audit, transverse aux 5 modules. Non corrigé ce cycle (nécessite une décision sur la source des photos, voir §Suite). |
| 🛡️ Confiance | Bloc de réassurance (paiement sécurisé, support local, agence physique) présent partout — bon réflexe. La bannière "fournisseur simulé" (constat 2) a été reformulée en langage client, ton neutre — ✅ corrigé. |
| 📱 Mobile | Non vérifiable ce cycle (constat 7) — aucune capture mobile disponible, à ne pas certifier tant qu'aucune preuve n'existe. |
| 🛒 Conversion | Trois freins concrets identifiés : absence d'image (1), CTA affaibli sur 2 modules (3), absence de signal d'urgence exploitable (5). Le frein le plus lourd reste l'image, avant même le CTA. |
| ✨ Premium | Palette de couleurs et typographie déjà de niveau correct (pas de faute de goût), mais l'absence de photographie tire nettement l'ensemble vers le bas comparé à une OTA moderne (Booking/GetYourGuide/Expedia) où chaque carte et chaque hero est une photo. |
| 🇹🇳 Easy2Book | Identité de marque cohérente et répétée sur toutes les pages (logo, avion stylisé, palette bleu marine/orange, "Votre partenaire de confiance..." en footer) — élément le plus solide de cet audit, rien à corriger ici. |

---

## Synthèse priorisée (ordre de traitement recommandé)

| # | Constat | Priorité | Modules touchés | Statut |
|---|---|---|---|---|
| 2 | Bannière "fournisseur simulé" visible client | **P0 confiance** | Vols, Hôtels Monde | ✅ Corrigé |
| 1 | Aucune photo produit (cartes + hero) | **P0 conversion** | Les 5 modules | ⏳ Décision requise, voir §Suite |
| 3 | CTA outline/absent plus faible sur 2 modules | P1 conversion | Voyages organisés, Attractions | ✅ Corrigé |
| 4 | Prix absent des cartes (Attractions ET Voyages organisés) | P1 conversion | Voyages organisés, Attractions | ✅ Corrigé |
| 6 | Hero sans photographie | P1 premium/conversion | Les 5 modules | ⏳ Décision requise, voir §Suite |
| 8 | Badge "Disponibilité Réelle" contredit | P1 confiance | Vols, Hôtels Monde | Atténué (constat 2 corrigé — la contradiction textuelle explicite a disparu) |
| 7 | Mobile non vérifié ce cycle | P1 preuve manquante | Les 5 modules | Non traité |
| 5 | Pas de signal d'urgence (places restantes) | P2 conversion | Omraty, Voyages organisés | Non traité |

## Suite — ce qui reste, et pourquoi

**Photos produit (constats 1 et 6, P0/P1)** : le modèle de données supporte déjà les photos pour
Voyages organisés et Attractions (`catalog_packages.coverImage`/`catalog_activities.coverImage`,
formulaire admin existant avec un champ URL, cartes déjà câblées pour les afficher dès qu'une URL est
renseignée — vérifié dans le code, ce n'est PAS un défaut de câblage). Le blocage est uniquement
l'absence d'URL de photo réelle sur les produits de démonstration utilisés pour la certification.
**Omraty n'a en revanche aucune colonne image** (`omra_packages`) — ajouter le support demanderait une
vraie migration + un champ formulaire admin, pas juste une donnée à renseigner. **Vols/Hôtels Monde**
(fournisseurs virtuels génériques, sans fiche catalogue admin par offre) demanderaient une nouvelle
table de correspondance destination→photo, une décision produit distincte. Aucune photo n'a été
ajoutée ce cycle : renseigner une URL de photo pour un produit qui n'en a pas nécessite soit des
photos réelles fournies par l'agence, soit une décision explicite sur une source de photos de
démonstration — décision qui n'est pas la mienne à prendre unilatéralement.

**Mobile (constat 7)** : nécessite un cycle de captures dédié à largeur téléphone, pas encore fait.

**Places restantes (constat 5, P2)** : la donnée existe déjà en base pour Omraty/Voyages organisés
(departures.totalSeats/bookedSeats) mais n'a pas été remontée sur les cartes ce cycle — laissé pour
un futur passage, priorité plus basse que les points ci-dessus.

---

*Sections marquées ✅ CORRIGÉ : implémentées, vérifiées en navigateur réel (rebuild + Playwright),
preuve DB (`psql`), preuve avant/après dans `docs/audits/screenshots/corrections/`. Le reste de ce
document ne modifie aucun composant. Chaque correction restante doit être validée
individuellement avant implémentation, suivant la boucle capture → audit → correction → nouvelle
capture.*
