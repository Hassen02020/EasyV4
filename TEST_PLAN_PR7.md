# Test Plan — PR #7 (Back-Office dark mode + Data Table + Realtime + Rebrand Easy2Book)

PR: https://github.com/Hassen02020/EasyV4/pull/7
Branch: `devin/1778748975-backoffice-refonte`
Stack: Next 16 / Tailwind / shadcn / Supabase Realtime
Run against: `http://localhost:3000` (dev) — Supabase project `gkuxrxyxmwrbkrmtvqbp`

## What changed (user-visible)

1. **Rebrand TunisiaGo → Easy2Book** sur l'ensemble du Front-Office (header, footer, page login, page booking, page confirmation). Logo officiel `/easy2book-logo.png` + wordmark `Easy` (`#1e3a5f`) `2` (`#e5b94e`) `Book`.
2. **Back-Office dark mode natif** (`next-themes`) + toggle Light/Sombre/Système dans la sidebar admin.
3. **Data Table réservations** sur `/admin/reservations` : recherche texte, filtres statut/module, tri colonnes, pagination, action "Changer statut…" avec state machine (`updateReservationStatus`).
4. **Realtime sync Back ↔ Front** : changement de statut admin → badge sur `/booking/confirmation/[ref]` se met à jour en live.

## Primary flow (ce qui doit prouver que ça marche)

### Test 1 — Front-Office rebrand visible (demande explicite utilisateur)

Couvre la dernière demande exacte de l'utilisateur : *« montre moi les nouveaux frontoffice »*.

| Étape | Action | Critère pass/fail concret |
|---|---|---|
| 1.1 | Aller sur `http://localhost:3000/` | Header contient `<img alt="Easy2Book…">` + wordmark visible : `Easy` bleu `2` jaune `Book` bleu. Aucune occurrence du texte `TunisiaGo`. |
| 1.2 | Scroller jusqu'au footer | Footer contient `Easy2Book` (logo + wordmark), tel `+216 98 140 514`, badge "Paiement 100% Sécurisé SPS / Monétique Tunisie", copyright `© 2026 Easy2Book — Centrale de Réservation`. |
| 1.3 | Aller sur `/booking` | Page booking accessible, BookingSteps en haut, formulaire de saisie offre actif (le rebrand doit être propagé via Header). |
| 1.4 | Aller sur `/booking/confirmation/TG-2026-001251` | Page rend une carte verte de confirmation, référence `TG-2026-001251` en mono, montant `4 403 TND`. Le badge statut affiche `En attente de validation` (couleur ambre). Header rebrandé visible en haut. |
| 1.5 | Vérifier le `<title>` HTML | doit contenir `Easy2Book — Centrale de Réservation` (et non `TunisiaGo`). |

**Pourquoi ce test n'est pas trivial à faire passer si la PR est cassée** : un rebrand incomplet laisserait subsister `TunisiaGo` quelque part (header, footer, title, copyright). On vérifie 4 emplacements distincts.

### Test 2 — Back-Office dark mode + Data Table

| Étape | Action | Critère pass/fail concret |
|---|---|---|
| 2.1 | Aller sur `/login`, saisir `tarhouni.hassene@gmail.com` + password de session, soumettre | Redirection `/admin`. Pas d'erreur d'authentification. |
| 2.2 | Vérifier que le shell admin est en **dark mode** par défaut | Background admin sombre (`bg-card` rendu en couleurs dark : `#0a0a0a` ou similaire). Texte clair sur fond sombre. |
| 2.3 | Sidebar : logo Easy2Book visible | Présence de `<img alt="Easy2Book…">` et wordmark `Easy2Book` dans la sidebar (rebrand back-office). |
| 2.4 | Naviguer sur `/admin/reservations` | Data Table avec ≥ 250 lignes en pagination. Référence `TG-2026-001251` visible sur la première page (date `2026-02-...` la plus récente). |
| 2.5 | Saisir `TG-2026-001251` dans le champ recherche | La table doit filtrer à exactement **1 ligne**. |
| 2.6 | Cliquer sur le dropdown statut "Changer statut…" de cette ligne | Le menu doit lister exactement les transitions autorisées depuis `pending` : `Confirmée`, `Sur demande`, `Annulée`. Aucune autre option (pas de `Remboursée`, pas de `Terminée`). |

**Pourquoi ce test n'est pas trivial à faire passer si la PR est cassée** : la state machine est testée — un dropdown affichant `Remboursée` ou `Terminée` depuis `pending` indique que la PR ne respecte pas la machine à états.

### Test 3 — Realtime sync Back-Office → Front-Office (cœur de la PR)

| Étape | Action | Critère pass/fail concret |
|---|---|---|
| 3.1 | **Ouvrir 2 fenêtres côte à côte** : Window A = admin sur `/admin/reservations` filtré sur `TG-2026-001251` ; Window B = `/booking/confirmation/TG-2026-001251` | Window B affiche badge ambre `En attente de validation`. |
| 3.2 | Sur Window A, cliquer dropdown "Changer statut…" → sélectionner `Confirmée` | Toast vert apparaît côté admin : `Statut mis à jour : En attente → Confirmée` (ou équivalent). |
| 3.3 | **Sans rafraîchir manuellement**, regarder Window B | Le badge doit passer ambre → vert (`Confirmée par Easy2Book` avec icône check) en < 3 secondes via Realtime. |
| 3.4 | Sur Window A, statut maintenant `Confirmée` → re-cliquer dropdown | Les options autorisées doivent être `Annulée`, `Terminée`, `Remboursée`. (Plus de `Sur demande` ni `Confirmée`.) |
| 3.5 | (cleanup) repasser le statut à `Annulée` puis `Pending` pour rétablir l'état initial avant fin de test | Statut final TG-2026-001251 doit être `pending` pour ne pas casser de futurs tests. |

**Pourquoi ce test n'est pas trivial à faire passer si la PR est cassée** : sans Realtime, Window B resterait sur ambre `En attente` même après le changement admin — il faudrait F5 pour voir le nouveau statut. Ce test échouera visiblement si `useRealtimeTable` n'est pas branché ou si le canal Supabase n'écoute pas la bonne table.

## Key assertions résumées

- **Front-Office** : aucun reliquat `TunisiaGo` sur 4 emplacements (header, footer, title, copyright), logo Easy2Book présent.
- **Admin Data Table** : 250+ lignes chargées, recherche par référence fonctionne, dropdown statut respecte la state machine (depuis `pending` : 3 transitions autorisées, pas plus).
- **Realtime** : change statut côté admin → badge front bascule ambre→vert en < 3s sans refresh.

## Out of scope (untested ici)

- Validations Front-Office côté formulaires (déjà testé dans PR #6).
- Markup engine / B2B / RLS strict (scope PR #4 et PR #5, pas encore livré).
- Email transactionnel / vouchers (non implémenté).

## Recording

Enregistrement vidéo unique couvrant Test 1 → Test 2 → Test 3 avec annotations structurées (`test_start` / `assertion`) à chaque assertion clé.
