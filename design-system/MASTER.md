# Easy2Book — Design System MASTER

> Règles globales de l'interface Easy2Book (plateforme de réservation en ligne / OTA).
> Stack : Next.js 16 (App Router) · React 19 · Tailwind CSS v4 · shadcn/Radix UI · class-variance-authority · lucide-react · next-intl (FR / EN / AR, RTL).
> Source de vérité du code : `app/globals.css` (tokens), `components/ui/*` (composants).
> Ce document décrit l'état réel après UI-LOT1A/1B (PR #373) et fixe les règles pour la suite. Rien ici n'impose de changer du code : tout écart est listé en section 14.

**Note de méthode.** Le skill `ui-ux-pro-max` n'est pas disponible dans cet environnement (introuvable parmi les skills). Ce design system a été rédigé à partir du code existant et des principes UI/UX usuels d'un OTA (confiance, lisibilité des prix, accessibilité). Les valeurs de contraste citées sont celles mesurées dans `app/globals.css`.

---

## 1. Principes

1. **Confiance avant tout.** Un OTA manipule de l'argent : prix, taxes, conditions d'annulation et statuts sont toujours explicites, jamais décoratifs.
2. **Une action doit dominer visuellement chaque écran** : l'action principale, en bleu de marque (`primary`). Les autres actions pertinentes restent possibles (secondaires, discrètes) ; c'est particulièrement vrai dans le back-office, où plusieurs actions de même importance peuvent coexister (filtres, export, actions en ligne). Règle : jamais deux boutons `primary` pleins en concurrence dans la même zone de décision.
3. **Le sens ne repose jamais sur la couleur seule** : icône + libellé (statuts, erreurs, disponibilité).
4. **Mobile d'abord** (390 px), puis 768 px, puis 1280 px. Aucun défilement horizontal de page.
5. **FR / EN / AR à égalité.** Le RTL est un cas nominal, pas une adaptation tardive.
6. **Tokens, jamais de couleurs en dur.** Pas de `#hex`, `bg-emerald-100`, `text-amber-800` dans les composants : utiliser les tokens sémantiques.
7. **White Label.** La couleur d'action vient de l'agence quand elle en définit une ; tout ce qui en dérive suit automatiquement.

## 2. Identité

| Élément        | Règle                                                                                                   |
| -------------- | ------------------------------------------------------------------------------------------------------- |
| Bleu de marque | `#003878` — actions primaires, liens, focus                                                             |
| Bleu profond   | `#002A5C` — navigation back-office (sidebar), texte de marque (`brand-ink`)                             |
| Or désert      | `#F4A261` — **décoratif uniquement** (icônes, filets, accent « 2 » du logo) ; jamais en fond d'un texte |
| Jasmin         | `#FAF9F6` — fond de page chaud                                                                          |
| Rouge          | `#B91C1C` — erreur / destructif **uniquement** ; plus jamais couleur d'action                           |
| Logo           | `public/easy2book-logo.png` ; ne pas recolorer ; zone de protection ≥ hauteur de la coche               |

## 3. Couleurs (tokens)

Toujours via les classes Tailwind sémantiques (`bg-primary`, `text-muted-foreground`…), définies dans `@theme inline` de `app/globals.css`.

### 3.1 Tokens et usage

| Token                            | Clair                                           | Sombre                      | Usage                                                                            |
| -------------------------------- | ----------------------------------------------- | --------------------------- | -------------------------------------------------------------------------------- |
| `background`                     | jasmin `#FAF9F6`                                | nuit `oklch(0.18 0.04 250)` | fond de page                                                                     |
| `foreground`                     | bleu nuit                                       | blanc cassé                 | texte courant                                                                    |
| `card` / `popover`               | blanc                                           | nuit surélevé               | surfaces                                                                         |
| `primary`                        | `#003878`                                       | `#6AA5F0`                   | action principale, liens, focus                                                  |
| `primary-foreground`             | `#FFFFFF`                                       | `#0B1B33`                   | texte sur `primary`                                                              |
| `primary-hover` / `-pressed`     | dérivés `color-mix`                             | dérivés                     | états du bouton principal                                                        |
| `primary-soft`                   | primary à 10 % sur blanc                        | primary à 18 % sur nuit     | survol discret, fonds de sélection                                               |
| `brand-ink`                      | `#002A5C`                                       | `#9CC2F5`                   | texte de marque (en-tête, panier, titres de marque) lisible dans les deux thèmes |
| `secondary` / `muted` / `accent` | chauds, neutres                                 | nuit                        | surfaces secondaires ; `accent` = or, décoratif                                  |
| `muted-foreground`               | `#6B7280`                                       | `oklch(0.72 …)`             | texte secondaire (voir 14.1)                                                     |
| `destructive`                    | `#B91C1C`                                       | `#EF6B6B`                   | erreur, suppression                                                              |
| `success`                        | `#047857`                                       | vert clair                  | confirmé, payé, disponible                                                       |
| `warning`                        | `#B45309`                                       | ambre clair                 | en attente, attention                                                            |
| `info`                           | `#0B5CAD`                                       | bleu clair                  | sur demande, information                                                         |
| `border` / `input` / `ring`      | chauds                                          | nuit                        | contours, champs ; `ring` = `primary`                                            |
| `sidebar*`                       | `#002A5C` + or                                  | nuit                        | back-office                                                                      |
| `chart-1..5`                     | bleu, méditerranée, or, bleu moyen, terre cuite | adaptés                     | graphiques                                                                       |

### 3.2 Contrastes (WCAG 2.x) — cibles

- Texte normal ≥ **4,5 : 1** ; grand texte (≥ 18 px ou 14 px gras) et composants d'interface ≥ **3 : 1**.
- Mesurés dans le code : blanc sur `#003878` = 11,43 : 1 ; blanc sur `#047857` = 5,48 : 1 ; blanc sur `#B45309` = 5,02 : 1 ; blanc sur `#B91C1C` = 6,47 : 1.
- Règle : `*-foreground` n'est valable que **sur son propre fond plein**. Pour du texte sur une teinte claire (`bg-warning/10`), utiliser la couleur sémantique elle-même (`text-warning`), pas `text-warning-foreground` (qui est blanc).

### 3.3 Interdits

- Couleurs Tailwind brutes (`emerald`, `amber`, `red`, `slate`…) dans les composants applicatifs.
- Texte or sur fond clair ; fond or avec texte blanc.
- Corail comme couleur d'action (palette historique, abandonnée).

## 4. Typographie

| Usage           | Police                                 | Notes                                             |
| --------------- | -------------------------------------- | ------------------------------------------------- |
| Latin (FR / EN) | **Geist** (`--font-geist-sans`)        | variable ; `font-sans`                            |
| Arabe           | **Noto Sans Arabic** (`--font-arabic`) | appliquée par `:lang(ar) body` ; `preload: false` |
| Monospace       | Geist Mono                             | références de réservation, codes                  |

Échelle (Tailwind) recommandée :

| Rôle                 | Classe                                          | Remarque                |
| -------------------- | ----------------------------------------------- | ----------------------- |
| Titre de page (hero) | `text-3xl md:text-5xl font-bold tracking-tight` | un seul `h1` par page   |
| Titre de section     | `text-2xl md:text-3xl font-semibold`            | `h2`                    |
| Titre de carte       | `text-lg font-semibold`                         | `h3`                    |
| Corps                | `text-base` (min. 16 px sur mobile)             |                         |
| Secondaire / aide    | `text-sm text-muted-foreground`                 |                         |
| Légende / badge      | `text-xs font-medium`                           | jamais sous 12 px       |
| Prix                 | `font-semibold tabular-nums`                    | alignement des chiffres |

Règles : interligne ≥ 1,5 pour le corps ; 45 à 75 caractères par ligne ; pas de texte justifié ; en arabe, ne pas appliquer `tracking-*` ni `italic`.

## 5. Espacement, formes, élévation, mouvement

- **Grille d'espacement** : pas de 4 px (`1 = 4px`). Gouttière de page 16 px sur mobile, 24 px et plus au-delà. Espacement vertical de section : `py-10 md:py-16`.
- **Rayons** : `--radius: 1rem` → `rounded-sm/md/lg/xl/2xl` dérivés. Cartes et champs de recherche : `rounded-2xl` ; boutons de formulaires courants : `rounded-md`.
- **Ombres** : trois niveaux — `shadow-xs` (champs), `shadow-md` (cartes, CTA de recherche), `shadow-lg` (popovers, tiroirs). Pas d'ombre colorée.
- **Largeur de contenu** : conteneur centré, max ≈ 1280 px ; formulaires de réservation ≤ 672 px.
- **Mouvement** : 150–250 ms, `ease-out` ; seulement `transform` et `opacity`. Respecter `prefers-reduced-motion` (supprimer les animations non essentielles). `tw-animate-css` est disponible.

## 6. Mode sombre

- Activé par la classe `.dark` (`next-themes`, thème par défaut **clair**, `enableSystem`).
- Chaque token a sa valeur sombre : **ne jamais** écrire `dark:bg-slate-900` à la main si un token existe.
- Texte de marque : `text-brand-ink`, pas `text-sidebar` (le second est trop sombre sur fond nuit).
- Surfaces claires « flottantes » dans le thème sombre (ex. carte de recherche) : leurs textes secondaires doivent rester ≥ 4,5 : 1 sur **leur** fond (voir 14.1).

## 7. Composants

Tous dans `components/ui/` (shadcn/Radix). Règle de réutilisation : **SEARCH → REUSE → EXTEND → CREATE** ; créer un composant en dernier recours.

### 7.1 Button (`button.tsx`)

| Variante      | Usage                                                                 |
| ------------- | --------------------------------------------------------------------- |
| `default`     | **une seule** action principale par vue (Rechercher, Réserver, Payer) |
| `outline`     | action secondaire (Connexion, Modifier)                               |
| `secondary`   | action tertiaire dans une surface                                     |
| `ghost`       | actions de barre d'outils, icônes                                     |
| `link`        | navigation textuelle                                                  |
| `destructive` | suppression / annulation irréversible, avec confirmation              |

Tailles : `sm` 32 px, `default` 36 px, `lg` 40 px, `icon*`. **Cible tactile : 44 × 44 px est la cible générale pour toute interaction tactile sur mobile** (boutons, liens isolés, champs, éléments de liste cliquables). Pour les actions importantes, utiliser `lg` ou une hauteur explicite `h-11`. Des exceptions sont admises si elles sont justifiées (par exemple contrôles denses de tableau en back-office, icônes à l'intérieur d'un champ déjà assez grand, liens dans un paragraphe de texte), à condition que la zone cliquable reste confortable (espacement suffisant autour) et qu'une alternative accessible existe.
États : `hover` (`primary-hover`), `active` (`primary-pressed`), `focus-visible` (anneau 3 px `ring`), `disabled` (opacité 50 % + `pointer-events-none`).
Bouton désactivé : **toujours expliquer pourquoi** (texte d'aide relié par `aria-describedby`, ex. `Hotels.searchHint`) ; ne pas laisser un grisé muet.

### 7.2 StatusBadge (`status-badge.tsx`)

Badge unique pour tous les statuts (réservation, paiement, compte). Tons : `success`, `warning`, `danger`, `info`, `neutral`. Icône + libellé traduit fournis par l'appelant. Pas de couleur en dur. Correspondance de référence (réservations) :

| Statut                   | Ton     |
| ------------------------ | ------- |
| `pending`                | warning |
| `on_request`             | info    |
| `confirmed`, `completed` | success |
| `cancelled`, `expired`   | danger  |
| `refunded`               | info    |
| `no_show`                | neutral |

Affichage seulement : le badge ne décide jamais d'un statut métier.

### 7.3 PageState (`page-state.tsx`)

États de page standardisés : `empty`, `error` (`role="alert"`), `loading` (`role="status"`, `aria-busy`). Utiliser à la place de messages ad hoc. Toujours proposer une action de sortie (réessayer, modifier la recherche, retour).

### 7.4 Autres composants de base

`Card`, `Input`, `Select`, `Checkbox`, `RadioGroup`, `Tabs`, `Dialog`, `Sheet` / `Drawer` (mobile), `Tooltip`, `Popover`, `Calendar`, `Table` / `DataTable`, `Skeleton`, `Alert`, `Breadcrumb`, `Pagination`, `Sonner` (toasts). Les formulaires passent par `Form` / `Field` + `Label` (jamais un placeholder seul comme libellé).

## 8. Patterns OTA

### 8.1 Recherche (accueil, par module)

- Onglets de modules : Hôtels Tunisie, Hôtels Monde, Omraty, Voyages Organisés, Attractions, Vols, Transferts, Car (+ Visa, Bateaux & Croisières en navigation). Onglet actif : `bg-primary text-primary-foreground`.
- Champs : destination, dates, voyageurs, puis **un seul** CTA « Rechercher » (`primary`, solide, plus de dégradé).
- Mobile / tablette : carte compacte qui ouvre un **tiroir plein écran** ; bureau : formulaire en ligne.
- Le formulaire peut être rendu **deux fois** (bureau et mobile) : tout `id` / `aria-describedby` doit être généré par `useId()`, jamais statique.
- CTA inactif : phrase d'aide visible (« Choisissez une destination et vos dates… »), reliée par `aria-describedby`.
- Dates : sélection d'une plage, résumé « 3 nuits » visible ; erreurs inline (dates passées, départ avant arrivée).

### 8.2 Résultats et fiches

- Carte de résultat : image (ratio fixe, `aspect-ratio`), nom, localisation, note (si disponible), points forts, **prix** et **CTA** alignés à droite (bureau) / en bas (mobile).
- **Prix** : montant total visible en premier ; préciser « par nuit / total », la période, la devise, et ce qui est inclus ou non (taxes, frais). Aucun prix n'apparaît sans devise ni base de calcul. Chiffres en `tabular-nums`. Jamais de prix barré inventé.
- Disponibilité et conditions d'annulation (gratuite / non remboursable) : badge + texte, pas seulement une couleur.
- Filtres : tiroir sur mobile avec bouton « Voir N résultats » ; puces de filtres actifs supprimables ; tri explicite.
- États : chargement = `Skeleton` de la même forme que la carte ; aucun résultat = `PageState empty` avec action « modifier la recherche ».

### 8.3 Réservation et paiement

- Parcours linéaire, étapes numérotées, récapitulatif persistant (`booking-summary-card`) : dates, voyageurs, prix total, conditions.
- Un champ = un libellé visible ; erreurs sous le champ, message en langage clair, focus placé sur la première erreur.
- Bouton final explicite (« Confirmer et payer 1 240 TND ») ; état de chargement qui bloque le double envoi.
- Confirmation : référence en monospace copiable, statut (`StatusBadge`), prochaines étapes, contact.
- **Règle financière** : l'interface ne calcule ni n'invente aucun montant, taux de change ou commission ; elle affiche ce que renvoie le serveur. Pas de conversion de devise cosmétique présentée comme un prix réel.

### 8.4 Signaux de confiance

Agence et coordonnées visibles (pied de page), conditions d'annulation avant paiement, moyens de paiement acceptés, messages d'erreur honnêtes (jamais « succès » tant que non confirmé par le serveur), statuts en temps réel.

### 8.5 Back-office (admin, pro, mutuelle, B2B)

Sidebar `#002A5C` ; tableaux denses (`DataTable`) avec en-tête collant, tri, pagination ; statuts via `StatusBadge` ; actions destructives dans un `AlertDialog` ; états vides et d'erreur via `PageState`.

## 9. Accessibilité (obligatoire)

- Navigation clavier complète ; focus visible (anneau `ring`) ; ordre logique ; pas de piège de focus hors modales.
- Cibles tactiles : 44 × 44 px comme cible générale sur mobile, avec exceptions justifiées (voir 7.1) ; espacement ≥ 8 px entre cibles.
- Chaque champ a un libellé programmatique ; erreurs `aria-invalid` + `aria-describedby`.
- Annonces : erreurs `role="alert"`, chargements `role="status"`.
- Images : `alt` utile ou `alt=""` si décoratives ; icônes seules avec `aria-label`.
- Contrastes selon 3.2 ; zoom 200 % sans perte ; texte jamais dans une image.
- Vérification : tests axe (`playwright-a11y`) et Lighthouse déjà en CI — ne pas les contourner.

## 10. Internationalisation et RTL

- Tous les textes passent par `messages/{fr,en,ar}.json` ; **aucune** chaîne en dur ; parité des clés entre les trois fichiers.
- `dir` et `lang` posés sur `<html>` par le layout de locale ; en arabe, `dir="rtl"`.
- Utiliser les propriétés **logiques** : `ms-*` / `me-*`, `ps-*` / `pe-*`, `start-*` / `end-*`, `text-start` / `text-end` (pas `ml-*`, `left-*`).
- Icônes directionnelles (flèches, chevrons) : retourner en RTL (`rtl:rotate-180`) ; icônes non directionnelles inchangées.
- Nombres, dates, devises : formatage via `Intl` selon la locale ; montants et références gardent des chiffres lisibles et alignés.
- Prévoir des textes plus longs selon la langue (FR plus long que EN) : pas de largeur fixe sur les libellés.

## 11. White Label

- `lib/theme/brand-color.ts` (`brandColorVars()`) pose `--primary` et `--primary-foreground` en style inline sur `<html>`.
- Les dérivés (`primary-hover`, `primary-pressed`, `primary-soft`, anneau de focus) utilisent `color-mix(… var(--primary) …)` et suivent donc la couleur d'agence.
- Règles : n'écrire **aucune** couleur de marque en dur ; utiliser `bg-primary`, `text-primary`, `ring`. `brand-ink` reste le bleu marine Easy2Book (texte d'en-tête) quelle que soit l'agence.
- Toute couleur d'agence doit être validée côté produit pour le contraste du texte (`primary-foreground` calculé) avant affichage.

## 12. Responsive

| Point d'arrêt | Largeur | Comportement clé                                                        |
| ------------- | ------- | ----------------------------------------------------------------------- |
| mobile        | 390 px  | une colonne, carte de recherche compacte + tiroir, navigation hamburger |
| tablette      | 768 px  | deux colonnes pour les résultats, formulaire en tiroir                  |
| bureau        | 1280 px | formulaire de recherche en ligne, grille 3 à 4 colonnes                 |

Tester systématiquement 390 / 768 / 1280, en FR et AR, en clair et en sombre.

## 13. Règles de contribution

1. Chercher d'abord un composant ou un token existant (`SEARCH → REUSE → EXTEND → CREATE`).
2. Aucune couleur en dur ; aucun `text-sidebar` pour du texte de marque en en-tête ; pas de `*-foreground` sur teinte claire.
3. Toute chaîne visible dans les trois fichiers de messages.
4. Propriétés logiques (RTL) ; `useId()` pour les `id` de formulaires rendus plusieurs fois.
5. Un état désactivé s'explique ; un statut a une icône et un libellé.
6. Avant de fusionner : lint, typecheck, tests, build, a11y verts ; captures avant/après à 390 / 768 / 1280 (FR + AR, clair + sombre) pour tout changement visuel.
7. Aucune modification de logique métier, paiement, réservation ou base de données dans un lot purement visuel.

## 14. Écarts connus (à traiter dans des lots séparés, sur GO)

1. **Contraste des onglets inactifs en mode sombre** (carte de recherche de l'accueil) : texte gris clair sur carte claire, environ 2 : 1 (estimé). Préexistant, gravité moyenne.
2. **Couleurs brutes restantes** dans des composants publics et admin (`emerald`, `amber`, `red`, `slate`…) à migrer vers les tokens et `StatusBadge`.
3. **Accent doré du « 2 » du logo** : valeur fixe, à confirmer pour le mode sombre.
4. **Vérifications manquantes en vrai navigateur** : formulaire de recherche avec JavaScript sur la production, pages admin authentifiées (`StatusBadge` du tableau des réservations), vraie agence White Label.
5. **Cibles tactiles** : certains boutons `default` (36 px) sont sous la cible générale de 44 px sur mobile ; à examiner au cas par cas (exception justifiée ou passage à `lg`).
6. **`muted-foreground` clair `#6B7280`** : environ 4,5 : 1 sur le fond jasmin, à la limite ; ne pas l'utiliser pour du texte de moins de 14 px sur une surface plus foncée.

## 15. Références dans le dépôt

`app/globals.css` · `components/ui/button.tsx` · `components/ui/status-badge.tsx` · `components/ui/page-state.tsx` · `components/booking-engine.tsx` · `components/hotels-tunisie-search.tsx` · `components/header.tsx` · `lib/theme/brand-color.ts` · `lib/theme/__tests__/lot1a-tokens.test.ts` · `lib/theme/__tests__/lot1b-header-dark.test.ts` · `docs/audits/` (captures et rapports)
