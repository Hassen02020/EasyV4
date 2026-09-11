# Media System — Architecture

Upload haute résolution, stockage, optimisation et galerie pour les
produits Omraty / Voyages Organisés / Attractions (Easy2Book / EasyV4).

Cette architecture est générique : elle est conçue pour être étendue plus
tard à Hôtels Tunisie/Monde sans réécriture (voir §Extensibilité), mais
n'a été branchée que sur les 3 modules ci-dessus dans cette mission. Vols
et Hôtels ne sont pas concernés (Vols n'a pas besoin de galerie produit).

## 1. Vue d'ensemble

```
Admin (navigateur)
  └─ MediaManager (components/admin/media-manager.tsx)
       └─ uploadProductMedia() [Server Action]
            ├─ validateImageBuffer()   [lib/media/optimize.ts]
            ├─ generateMediaVariants() [lib/media/optimize.ts, sharp]
            ├─ getMediaStorage().put() [lib/media/storage.ts]
            └─ insert product_media    [lib/db/schema/media.ts]

Frontend public (cartes, détail, galerie)
  └─ getProductMedia() / getCoverMediaForProducts() [lib/media/query.ts]
       └─ résout les storageKey en URLs publiques
```

Trois couches, séparées pour des raisons de sécurité et de testabilité :

- **`lib/media/optimize.ts`** — validation + pipeline sharp. Pas de
  secret, pas de `"server-only"` (testable directement par
  `node --test`, sharp est de toute façon un module natif non bundlable
  côté client).
- **`lib/media/storage.ts`** — accès Storage (Supabase ou filesystem
  local). `"server-only"` car peut manipuler la clé service role
  Supabase — jamais testé directement par un test unitaire committé,
  seulement par vérification manuelle documentée (§7).
- **`lib/media/media-core.ts`** — requêtes DB brutes + logique
  transactionnelle (réassignation de couverture, validation d'un
  réordonnancement, bascule de couverture atomique). Pas de secret,
  testable directement (`lib/media/__tests__/media-core.test.ts`).
- **`lib/media/query.ts`** — combine media-core + storage pour produire
  des `ResolvedProductMedia` (URLs publiques prêtes à afficher).
  `"server-only"` (dépend de storage.ts).
- **`lib/admin/product-media-actions.ts`** — Server Actions
  (`"use server"`) : garde d'autorisation (`assertProductManager`,
  réutilisée telle quelle, aucune logique de rôle parallèle) + orchestration
  upload/suppression/réordonnancement/couverture/remplacement.

## 2. Base de données

### 2.1 Table `product_media`

Une seule table de métadonnées pour les 3 modules (migration
`drizzle/manual/0052_product_media.sql`, schéma Drizzle
`lib/db/schema/media.ts`).

```
product_media
  id             uuid primary key
  agency_id      uuid not null references agencies(id)
  module         varchar(16) not null   -- 'omra' | 'package' | 'activity' (CHECK)
  product_id     uuid not null          -- référence polymorphique (voir §2.2)
  storage_key    text not null          -- clé de l'original
  variants       jsonb not null         -- { original, large, medium, card, thumbnail }
  original_filename varchar(255) not null
  mime_type      varchar(64) not null
  file_size      integer not null
  width          integer
  height         integer
  alt_text       varchar(255)
  caption        text
  sort_order     integer not null default 0
  is_cover       boolean not null default false
  created_at     timestamptz not null default now()
  updated_at     timestamptz not null default now()
```

Le fichier binaire n'est **jamais** stocké en base — uniquement la
référence Storage (`storage_key` + `variants`).

### 2.2 Référence polymorphique (pas de FK)

`omra_packages`, `catalog_packages` et `catalog_activities` n'ont aucun
parent commun. `module` + `product_id` réplique exactement le pattern
déjà utilisé par `customer_favorites.item_type`/`item_ref`
(`drizzle/manual/0040_customer_favorites.sql`) : pas de FK stricte,
contrainte `CHECK (module in ('omra','package','activity'))`, appartenance
vérifiée "à la main" dans chaque Server Action
(`assertProductOwnership()`) avant toute écriture.

### 2.3 Invariants imposés par la base, pas seulement par le code

- **Une seule couverture par produit** (mission §17) : index unique
  **partiel** `product_media_one_cover_uniq on (module, product_id) where
  (is_cover = true)`. Les Server Actions basculent la couverture en deux
  UPDATE dans la même transaction (retirer partout, puis poser) — jamais
  deux lignes `is_cover = true` vraies en même temps, donc jamais de
  conflit avec cet index.
- **Ordre d'affichage** : `sort_order`, index `(module, product_id,
  sort_order)` pour la lecture de galerie la plus fréquente.

### 2.4 RLS

`enable/force row level security`, policy `product_media_tenant_isolation`
identique au pattern déjà utilisé par `loyalty_accounts`/
`customer_favorites` : `agency_id = current_agency_id() or
is_super_admin()`.

## 3. Storage

### 3.1 Backend Supabase Storage (cible production)

`lib/media/storage.ts::createSupabaseMediaStorage()` — bucket
`MEDIA_STORAGE_BUCKET` (défaut `product-media`), distinct du bucket
`agency-docs` déjà utilisé par le wallet (documents privés vs contenu
commercial public). Upload via `supabase.storage.from(bucket).upload()`
avec la clé service role (jamais côté client).

**Ce bucket n'a pas été créé** — ce sandbox n'a pas de projet Supabase
réel configuré (voir `.env.local` : `NEXT_PUBLIC_SUPABASE_URL` pointe vers
le serveur mock GoTrue local, pas un vrai projet Supabase). Voir §7
(Tests) pour ce qui a réellement été vérifié.

### 3.2 Backend filesystem local (`MEDIA_STORAGE_BACKEND=local`)

`lib/media/storage.ts::createLocalMediaStorage()` — écrit sous
`.media-local/` (gitignored), servi par `app/api/media/[...key]/route.ts`
(pas d'auth : contenu commercial public, cache long car les clés
incluent toujours un uuid unique par upload donc jamais réécrites en
place). Sélection du backend par variable d'environnement explicite,
**jamais auto-détectée** — même discipline que `MYGO_MODE=virtual` /
`PAYMENT_MODE=virtual` déjà dans ce repo : un flag délibéré, pas un
sniff d'URL qui masquerait un vrai échec Supabase en production.

### 3.3 Clé de stockage

```
media/<agencyId>/<module>/<productId>/<assetId>/<variant>.<ext>
```

`assetId` (uuid) généré serveur, jamais dérivé du nom de fichier envoyé
par le navigateur (mission §11 : pas de path traversal, pas de collision,
jamais le nom original comme clé). Le nom original est conservé
uniquement en métadonnée DB (`original_filename`).

## 4. Pipeline d'upload

```
Navigateur
  → validation client (type, taille — lib/admin/media-manager.tsx)
  → FormData(module, productId, file) → Server Action uploadProductMedia()
      → assertProductManager() [garde d'autorisation existante]
      → validateImageBuffer() [REVALIDATION SERVEUR COMPLÈTE — mission §9]
      → generateMediaVariants() [sharp]
      → storage.put() × 5 (original + 4 variantes)
      → assertProductOwnership() + insert product_media (transaction)
      → nettoyage best-effort des fichiers Storage si l'étape DB échoue
```

La validation client n'est **jamais** un substitut à la validation
serveur : `validateImageBuffer()` revérifie taille, décodabilité réelle
(sharp), dimensions, et que le contenu binaire correspond vraiment au
`mimeType` déclaré par le navigateur (détecte un fichier renommé/usurpé —
testé, voir `lib/media/__tests__/optimize.test.ts`).

### 4.1 Limites

- Taille max : 20MB (`MAX_FILE_SIZE_BYTES`, dans la fourchette 15–25MB de
  la mission).
- Dimension min : 200px (`MIN_DIMENSION_PX`) — en dessous, ce n'est pas
  une photo commerciale exploitable.
- Formats acceptés : JPEG, PNG, WebP (`ALLOWED_MEDIA_MIME_TYPES`). Pas
  d'AVIF en entrée (fiabilité prioritaire sur l'exhaustivité, mission
  §5/§7).
- `next.config.mjs` : `experimental.serverActions.bodySizeLimit = "25mb"`
  (la limite par défaut de 1MB des Server Actions Next.js aurait rejeté
  l'upload avant même la validation applicative).

## 5. Optimisation — variantes générées

| Variante | Usage prévu | Dimensions | Fit | Format | Qualité |
|---|---|---|---|---|---|
| `original` | archive / téléchargement haute résolution | telle quelle, **aucun traitement** | — | inchangé | — |
| `large` | hero, page détail, galerie plein écran | ≤ 1920×1080 | inside (jamais suramplifié) | WebP | 82 |
| `medium` | contenu secondaire | ≤ 1024×576 | inside | WebP | 80 |
| `card` | cartes produit, résultats de recherche | 640×360 exact | cover | WebP | 78 |
| `thumbnail` | miniatures galerie, gestion admin | 240×240 exact | cover | WebP | 75 |

**`card` est dérivé d'un usage réel vérifié dans le repo**, pas choisi au
hasard (mission §6/§33) :
`components/packages/package-list.tsx:20` (conteneur `h-44`/176px,
`sizes="(max-width: 768px) 100vw, 33vw"`) et `app/attractions/page.tsx:109`
(conteneur `h-40`/160px, même `sizes`), grille
`md:grid-cols-2 lg:grid-cols-3` dans les deux cas. Pire cas retina : 33vw
d'un viewport desktop large (~1920px) × DPR 2 ≈ 634px — 640px couvre ce
cas quasi exactement, très inférieur à un original haute résolution
(vérifié : original 4000×2667 ≈ 300KB → variante card ≈ 4.5KB, voir §7.1).

`large`/`medium`/`thumbnail` n'ont **pas d'équivalent existant** à
inspecter (page détail + galerie produit sont construites par cette même
mission) : valeurs standard raisonnables, documentées comme telles plutôt
que présentées comme dérivées d'un composant réel.

`original` n'est jamais retraité par sharp — les bytes uploadés sont
conservés tels quels (préserve la qualité commerciale, mission §5/§13).
Les navigateurs respectent nativement l'orientation EXIF à l'affichage ;
les 4 variantes générées appliquent `.rotate()` (auto-orientation) avant
redimensionnement.

## 6. Server Actions (`lib/admin/product-media-actions.ts`)

Toutes protégées par `assertProductManager()` (garde déjà utilisée par
les autres Product Builders — aucune logique de rôle parallèle).

- **`uploadProductMedia(formData)`** — voir §4. Première image d'un
  produit → couverture automatique (mission §17).
- **`deleteProductMedia(mediaId)`** — supprime la ligne DB (+ réassigne
  la couverture au premier média restant si la ligne supprimée était la
  couverture — `reassignCoverAfterDelete()`) **PUIS** les fichiers
  Storage. Jamais l'inverse : un fichier Storage orphelin sur échec est
  préférable à une ligne DB pointant vers rien (mission §20 — solution
  simple pour ce V1, pas de garbage-collector).
- **`reorderProductMedia(module, productId, orderedMediaIds)`** — rejette
  toute liste qui ne correspond pas EXACTEMENT à l'ensemble réel des
  médias du produit (`isValidReorderSet()`) — jamais un ordre partiel ou
  un id d'un autre produit/agence injecté (test sécurité, mission §26).
- **`setCoverProductMedia(mediaId)`** — `setCoverAtomic()` : retire la
  couverture de tous les médias du produit puis pose la nouvelle, dans la
  même transaction — jamais deux couvertures vraies simultanément (voir
  §2.3).
- **`replaceProductMedia(mediaId, formData)`** — upload du nouveau
  contenu sous un nouvel `assetId` (jamais d'écrasement), la ligne DB
  bascule seulement après succès, l'ancien Storage n'est supprimé
  **qu'ensuite** (mission §19 — jamais l'ancien supprimé avant que le
  nouveau soit disponible).

## 7. Tests

### 7.1 LOCAL TEST (réellement exécuté dans ce sandbox)

- `lib/media/__tests__/optimize.test.ts` (10 tests) — validation
  (landscape haute résolution, portrait, sombre, claire, trop petite,
  fichier vide, mimeType non supporté, contenu non-image, mime
  spoofing) + génération des variantes (dimensions, pas de
  suramplification, aspect ratio préservé). Images synthétiques générées
  par sharp lui-même, jamais une vraie photo (mission §33).
- `lib/media/__tests__/media-core.test.ts` (9 tests) — contre un Postgres
  16 local réel (`DATABASE_URL`) : contrainte CHECK module, index unique
  partiel couverture, scénario exact mission §17 (5 images → cover=image3
  → delete image3 → nouvelle couverture = premier restant), suppression
  du dernier média (zéro couverture, pas d'erreur), bascule atomique de
  couverture, ordre `sortOrder`, isolation tenant sur
  `fetchCoverMediaRows`.
- Suite complète du repo : **913 tests, 759 passent, 0 échec** (154
  `skip` — DB-mode tests d'autres modules, comportement normal documenté
  ailleurs dans le repo, pas lié à cette mission).
- **E2E navigateur réel** (Playwright, Chromium local, serveur
  `mock-gotrue` local, `MEDIA_STORAGE_BACKEND=local`) : login admin réel
  → `/admin/products/omra/[id]` → upload de 3 photos de test (labellisées
  "TEST IMAGE", générées par sharp, jamais une vraie photo de Mecque/
  Médine) → previews avec statut par fichier → changement de couverture
  → réordonnancement → suppression (toast "Photo supprimée.", couverture
  réassignée visible en direct) → carte `/omra` (vraie photo affichée) →
  page détail `/omra/[id]` (galerie avec navigation, compteur "1/3",
  vignettes) → viewport mobile 390px → répété (upload réduit) sur
  `/admin/products/package/[id]` et `/admin/products/activity/[id]` →
  cartes `/packages` et `/attractions` (fallback dégradé de marque
  correctement affiché sur les produits sans média, jamais de fausse
  photo). Deux défauts réels trouvés et corrigés pendant ce test (voir
  §9).

### 7.2 SUPABASE TEST — NON EXÉCUTÉ

Ce sandbox n'a pas de projet Supabase réel configuré (`.env.local` pointe
vers un serveur mock GoTrue local, pas `*.supabase.co`). Le bucket
`product-media`, les policies Storage, et l'upload réel vers Supabase
Storage n'ont **jamais été exercés** — seul le code de l'adapter
(`createSupabaseMediaStorage()`) a été relu et typé, jamais exécuté
contre un vrai projet. Ne pas confondre avec le LOCAL TEST ci-dessus.

### 7.3 PRODUCTION TEST — NON EXÉCUTÉ

Aucun déploiement, aucune vérification en production dans cette mission.

## 8. Frontend — fallback et affichage

### 8.1 Chaîne de fallback (mission §23)

```
Media System (product_media, si disponible)
  → sinon champ legacy (coverImage / metadata.coverImage)
  → sinon dégradé de marque + icône (JAMAIS de fausse photo, mission §33)
```

Implémentée indépendamment sur chacun des 3 modules (pas de composant
"universel" caché qui masquerait le fallback réel) :

- `app/omra/page.tsx` / `components/omra/omra-package-list.tsx` :
  `coverMediaUrl || metadata.coverImage || <dégradé>`
- `app/packages/page.tsx` / `components/packages/package-list.tsx` :
  `coverMediaUrl || coverImage || <dégradé>`
- `app/attractions/page.tsx` : `coverMediaUrl || coverImage || <dégradé>`

`lib/media/query.ts::getCoverMediaForProducts()` résout la couverture de
toute une liste de produits en **une seule requête** (évite le N+1 sur
une grille de cartes) — l'appelant applique le fallback pour les produits
sans résultat.

### 8.2 `ProductMediaGallery` (mission §25)

`components/products/product-media-gallery.tsx` — commun aux 3 modules.
S'adapte au nombre de médias plutôt que d'imposer une galerie lourde :

- 0 média → le composant ne se rend pas (la page ne le monte pas).
- 1 média → image simple, sans flèches/vignettes/compteur.
- 2+ médias → image principale + flèches précédent/suivant + compteur
  ("2/5") + bande de vignettes cliquables + swipe tactile (mobile) + mode
  plein écran (Dialog).

### 8.3 `MediaManager` (mission §14)

`components/admin/media-manager.tsx` — commun aux 3 modules, monté sur
les 3 pages d'édition admin (`app/admin/products/{omra,package,activity}/
[id]/page.tsx`).

- **UploadZone** : glisser-déposer (desktop) + bouton "Ajouter des
  photos" (fonctionne sans drag & drop, y compris sur mobile où il ouvre
  le sélecteur natif — mission §16).
- **UploadProgress** : statut réel par fichier (en cours / réussi /
  échec + réessayer). Pas de pourcentage — les Server Actions Next.js
  n'exposent aucun événement de progression par octet (contrairement à
  XHR), un pourcentage aurait été fabriqué.
- **MediaGallery** : grille de vignettes, badge "★ Couverture", boutons
  monter/descendre (réordonnancement, accessible clavier — pas de
  bibliothèque drag-and-drop externe), couverture, remplacer, supprimer
  (avec confirmation).
- Upload multiple : un échec sur un fichier n'annule jamais les autres
  (`Promise.allSettled`, mission §15).

## 9. Défauts réels trouvés et corrigés pendant les tests E2E

Ces deux défauts n'existaient pas avant l'upload réel en navigateur — ils
n'auraient pas été trouvés par la seule lecture de code.

1. **CSP bloquait l'aperçu local pendant l'upload** :
   `img-src 'self' data: https:` (`next.config.mjs`) ne listait pas
   `blob:`, hors l'aperçu local instantané (`URL.createObjectURL`, avant
   que le Server Action ait renvoyé une URL Storage réelle) en dépend.
   Corrigé en ajoutant `blob:` à `img-src`.
2. **`ReferenceError: ProductChannel is not defined` sur les Server
   Actions Voyages Organisés** : `lib/admin/packages-actions.ts` avait un
   `export type { ProductChannel }` (export de type mort, aucun
   consommateur ailleurs dans le repo) que le bundler Turbopack des
   Server Actions traitait à tort comme une valeur runtime, cassant
   **toutes** les Server Actions de la page package (pas seulement
   celles du Media System) dès qu'une nouvelle action était ajoutée à la
   page. Bug préexistant, latent, révélé par l'ajout de
   `uploadProductMedia` à `app/admin/products/package/[id]/page.tsx`.
   Corrigé en supprimant l'export mort.

## 10. Sécurité

- Aucune clé service role Supabase côté client — `lib/media/storage.ts`
  n'est importé que par du code serveur (`"server-only"`).
- Autorisation : `assertProductManager()` (rôle `super_admin`/`manager`,
  agence `agency_type='ota'`) sur toutes les Server Actions — aucune
  logique de rôle parallèle inventée.
- Tenant isolation : RLS DB (policy `product_media_tenant_isolation`) +
  vérification applicative explicite (`agencyId` dans chaque requête,
  `assertProductOwnership()` avant toute écriture) — testée
  (`lib/media/__tests__/media-core.test.ts`, cas isolation tenant).
- Validation serveur complète, jamais confiance dans le navigateur
  (mission §9) — voir §4/§7.1.
- Clés Storage générées serveur (`assetId` uuid), jamais le nom de
  fichier utilisateur (mission §11 — pas de path traversal).

## 11. Migration / compatibilité (mission §21–23)

Les champs legacy (`omra_packages.metadata.coverImage`,
`catalog_packages.coverImage`/`galleryUrls`,
`catalog_activities.coverImage`/`galleryUrls`) **n'ont pas été
supprimés** — aucune preuve que tous les consommateurs (admin forms
existants, éventuelles intégrations externes) aient migré. La chaîne de
fallback (§8.1) permet un déploiement progressif : un produit avec
uniquement l'ancien champ reste visible, un produit migré vers le Media
System l'utilise en priorité. Aucune migration automatique de données
externes n'a été effectuée (mission §22 : jamais télécharger une
ressource externe sans vérifier licence/accessibilité).

## 12. Extensibilité (Hôtels)

`PRODUCT_MEDIA_MODULES` (`lib/admin/product-constants.ts`) liste
volontairement `['omra', 'package', 'activity']` — ajouter Hôtels
Tunisie/Monde plus tard est un ajout de valeur à cette constante + à la
contrainte CHECK (`ALTER TABLE ... DROP/ADD CONSTRAINT`), pas une
réécriture : `product_media`, le pipeline d'optimisation, le storage
adapter, `MediaManager` et `ProductMediaGallery` sont déjà génériques.
