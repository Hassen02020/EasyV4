# EASY2BOOK / EasyV4 — ROADMAP CODE (pour Claude Code)

> Dérivée du **Master Prompt v2** (à placer à côté : `docs/MASTER_PROMPT.md`).
> Dépôt : `https://github.com/Hassen02020/EasyV4` · branche `main`.
> Date de rédaction : 28/09/2026.

---

## ⚠️ Statut de ce document

Cette roadmap est construite **à partir du Master Prompt, avant l'audit du code**. Elle fixe l'ordre, les dépendances, les critères de sortie et les garde-fous. Elle **ne prouve rien sur l'état réel du dépôt**.

Règle d'usage pour Claude Code :

1. La Phase 0 (audit) s'exécute en premier et **met à jour ce fichier** (colonne `État audit` de chaque chantier : `REUSE / EXTEND / FIX / CONSOLIDATE / CREATE / N/A`).
2. Un chantier que l'audit rend inutile passe à `N/A` avec la preuve (`fichier:ligne`).
3. Un P0 découvert par l'audit **s'insère avant** tout le reste.
4. Chaque chantier = une branche, une ou plusieurs petites PR, un **GO explicite** avant d'écrire.

---

## Comment l'utiliser

1. Copier ce fichier dans `docs/ROADMAP.md` et le Master Prompt dans `docs/MASTER_PROMPT.md`.
2. Ajouter dans `CLAUDE.md` (racine) :

```md
Lis docs/MASTER_PROMPT.md et docs/ROADMAP.md avant toute action.
Mode par défaut : lecture seule. Aucune écriture sans GO explicite.
Un seul chantier actif à la fois ; il est indiqué dans ROADMAP.md (section "Chantier actif").
```

3. Lancer la Phase 0 avec le prompt de la section « Prompts de lancement ».

---

## Chantier actif

```text
ID: (aucun — en attente de proposition du prochain chantier)
Statut: R1-10, R1-07, R1-02, R6-02, R1-04/05/06/08 et R1-03 CLÔTURÉS (voir ci-dessous). Tous les gaps P0-P2 de l'audit Phase 0 sont désormais clos. Prochain chantier à proposer un par un, un GO à la fois.
Branche: (aucune)
```

**Phase 0 exécutée le 2026-09-28** (agents A1-A8, lecture seule). Rapport complet livré en session. Résumé exécutif et détails par phase ci-dessous (colonne "État audit").

### R1-10 — CLÔTURÉ (2026-09-28)

`resolve_session_context(uuid)` (`SECURITY DEFINER`) était encore exécutable par `anon`/`authenticated` via REST malgré `0068` (qui avait fermé 5 autres fonctions du même type). `REVOKE EXECUTE` appliqué en production (`crygnaichvlxavvbifqi`) et versionné dans `drizzle/manual/0073_revoke_public_execute_resolve_session_context.sql`. Vérifié : `anon_can_exec=false`, `authenticated_can_exec=false`, `app_runtime_can_exec=true` ; advisory de sécurité correspondant disparu. PR : https://github.com/Hassen02020/EasyV4/pull/50 (mergée).

### R1-07 — CLÔTURÉ (2026-09-28)

Aucune CI n'existait (`.github/workflows` absent). Ajout de `.github/workflows/ci.yml` (5 jobs sur push/PR vers `main` : `typecheck`, `lint`, `format` non bloquant, `test`, `build`). Correction au passage de 12 erreurs lint réelles (2 fichiers `app/(internal)/admin/suppliers/{network,nodes}/page.tsx`, cosmétique) pour que `lint` soit un vrai gate. Premier run réel confirmé : `typecheck`/`lint`/`test`/`build` verts, `format` en échec attendu et documenté (744 fichiers pré-existants jamais formatés, hors périmètre — chantier séparé à proposer si souhaité). PR : https://github.com/Hassen02020/EasyV4/pull/51 (mergée, run https://github.com/Hassen02020/EasyV4/actions/runs/36489283550).

### R6-02 — CLÔTURÉ (2026-09-28)

`margin-analytics-core.ts` part d'un `INNER JOIN` sur `reservation_financials` — toute réservation sans ligne y était invisible (marge ET chiffre d'affaires). `recordReservationFinancials()` câblé sur les 6 points d'insertion omra/packages/activités (`supplierPriceTnd = salePriceTnd`, ces modules n'ayant pas de coût net séparé — décision documentée dans le code, `lib/pro/pricing.ts:36-45`). Module "cars" volontairement laissé hors périmètre (incohérence pré-existante entre `lib/pro/pricing.ts` et `lib/cars/pricing.ts`, `FEATURE_CAR=false` — décision produit à clarifier séparément). `typecheck`/`lint`/`test` (1068/1068) verts en local et en CI. PR : https://github.com/Hassen02020/EasyV4/pull/52 (mergée, run https://github.com/Hassen02020/EasyV4/actions/runs/36490140730).

### R1-04/05/06/08 — CLÔTURÉ (2026-09-28)

Suppression de 4 artefacts morts confirmés : `package-lock.json` (obsolète, pnpm est le gestionnaire réel), `netlify.toml` (jamais opérationnel, Vercel est la cible active), `vite.config.js` (mort et cassé), `drizzle/0005_wallet_system.sql` (doublon octet-pour-octet non suivi par `drizzle/meta/_journal.json`). README corrigé : marque Easy2Book (pas TunisiaGo) et `/admin` décrit comme protégé (pas public). Reste du README (arborescence avec chemins obsolètes) volontairement laissé hors périmètre — à traiter dans un futur chantier documentaire. `typecheck`/`lint`/`test`/`build` verts en local et en CI. PR : https://github.com/Hassen02020/EasyV4/pull/53 (mergée).

### R1-03 — CLÔTURÉ (2026-09-28)

8 PR ouvertes réelles (pas 13 comme le supposait la baseline du Master Prompt) : #6, #7, #9, #10, #11, #12, #13, #16 — toutes issues de sessions Devin (mai-août 2026), aucune ne recoupant les PR fusionnées cette session (#44/#45/#46/#49/#50-53). Diagnostic : #9/#10/#12/#13/#16 ciblent un `main` vieux de plusieurs mois et sont en conflit réel (`mergeable_state: dirty`) ; #6/#7/#11 ciblent des branches intermédiaires d'une chaîne empilée jamais mergée dans `main` (lignée abandonnée, leur `mergeable_state: clean` ne reflète qu'une absence de conflit contre ces branches mortes, pas contre `main` réel). Sur le fond, toutes proposent des fonctionnalités déjà réimplémentées de façon plus robuste dans `main` actuel (RLS, idempotence, audit trail, millimes) ou déjà obsolètes (rebrand Easy2Book déjà fait). Décision : **fermeture des 8**, chacune avec un commentaire individuel expliquant pourquoi, sans suppression de branche (réversible).

**Bilan Phase 0** : tous les gaps classés P0/P1/P2 par l'audit sont clos (R1-10 sécurité, R1-07 CI, R1-02 secrets, R6-02 financial, R1-04/05/06/08 cleanup, R1-03 tri PR). Restent en `NOT VERIFIED`/à planifier, tous P6 ou nécessitant une décision produit non technique : R1-09 (consolidation de `docs/audits/`), R3-03 (modèle Quote — décision produit reçue et scopée, différé, voir Phase 3), le module "cars" (décision produit avant tout code), et la réécriture complète du README (arborescence obsolète au-delà des 2 lignes déjà corrigées).

### R3-01 — CLÔTURÉ (2026-09-29)

Audit Phase 3 (B2B User) demandé par l'utilisateur. Gap confirmé puis comblé, même forme que R2-05 : `/pro/clients` était un annuaire strictement lecture seule (`loadPartnerClients`), un client n'existait que via le *find-or-create* caché dans chaque flux de réservation. `createCustomer`/`updateCustomer` existaient déjà mais réservés à `ADMIN_ROLES` (staff OTA). Ajout de `createPartnerClient`/`updatePartnerClient` (`lib/pro/client-actions.ts`), gate `"clients.create"`/`"clients.edit"` — déjà dans la baseline `partner_owner` et délégable à un `partner_agent`, `getEffectivePermission` combinant déjà override et baseline (aucune nouvelle plomberie de permission). UI : `NewClientDialog`/`EditClientDialog` sur `/pro/clients`. `typecheck`/`lint`/`test` (1068/1068)/`build` verts. PR : https://github.com/Hassen02020/EasyV4/pull/55 (mergée).

**Phase 3 (B2B User) — état** : R3-01 (fait), R3-02 (`REUSE`, conditions commerciales déjà en place), R3-03 (modèle Quote — **absent, confirmé** ; **décision produit reçue le 2026-09-29, DIFFÉRÉE explicitement, à ne pas oublier :**

> **Pas de devis pour le moment** (2026-09-29). Périmètre futur précisé par l'utilisateur — **très important, à ne jamais refaire évaluer depuis zéro** : le devis (Quote) ne remplace PAS la facture partout. Il s'applique spécifiquement à 3 cas où une **facture immédiate n'a pas de sens** parce que le prix/la faisabilité ne sont pas figés au moment de la demande :
> 1. **Demandes de groupe** (group requests) — prix dépend du nombre final, négociation fournisseur.
> 2. **Transferts** — variantes véhicule/trajet à confirmer avant prix ferme.
> 3. **Voyage à la carte** (custom/tailor-made) — composition sur-mesure, rien de figé au départ.
>
> Pour ces 3 cas : **devis → validation client → facture**, au lieu du flux direct actuel (recherche → réservation → facture). Les autres modules (hôtels, vols, omra, packages, activités) restent en flux direct, PAS de devis à ajouter pour eux.
> **On y revient plus tard** — ne pas lancer ce chantier sans un nouveau GO explicite, mais ne jamais re-proposer "faut-il un Quote ?" comme question ouverte : la réponse produit est déjà tranchée et scopée ci-dessus.

), R3-04 (sans objet tant que R3-03 n'existe pas).

### R2-05 — CLÔTURÉ (2026-09-28)

Audit demandé par l'utilisateur en ouverture de la Phase 2 (Master User). Gap confirmé puis comblé : `createPartnerOwner` (`lib/admin/agencies-actions.ts`, super_admin, intégré à l'étape 2 optionnelle de `/admin/agencies/new`) et `createPartnerAgent` (`lib/auth/partner-agent-actions.ts`, partner_owner via le grant `"staff.create"`, bouton "Inviter un agent" sur `/pro/utilisateurs`) — même motif que `createStaffUser` (invitation Supabase Auth réelle, `users`+`auditEvents` dans la même transaction, rollback du compte Auth orphelin si le profil échoue). `typecheck`/`lint`/`test` (1068/1068)/`build` verts en local et en CI. PR : https://github.com/Hassen02020/EasyV4/pull/54 (mergée).

**Phase 2 (Master User) — bilan** : R2-01/02/03 (`REUSE`), R2-04 (`EXTEND`, gap RLS `flight_*` dormant/non appliqué en prod, sans urgence), R2-05 (fait ci-dessus), R2-06 (`N/A`, pas de migration à faire, système déjà unique). Plus aucun gap P0/P1/P2 ouvert sur cette phase.

---

## Vue d'ensemble

| Phase | Nom | Priorité | Dépend de | Sortie attendue |
|---|---|---|---|---|
| 0 | Audit (lecture seule) | — | — | Rapport 16.1 + roadmap mise à jour |
| 1 | Socle & sécurité immédiate | P0 | 0 | `main` sain, CI verte, `/admin` protégé |
| 2 | Master User | P0/P1 | 1 | Un seul système identité / tenant / rôles, RLS prouvée |
| 3 | B2B User | P1 | 2 | Agence → utilisateur B2B → client → devis |
| 4 | Wallet (ledger) | P0/P1 | 2 | Ledger append-only, solde dérivé |
| 5 | Recharge wallet | P0/P1 | 4 | Recharge idempotente via prestataire de paiement |
| 6 | Financial & Booking | P0/P1 | 3, 4, 5 | Machine à états, décomposition prix, settlement |
| 7 | Honnêteté Commerce & Supply | P1/P3 | 1 | Aucun mock présenté comme réel, couche adapter |
| 8 | Front conversion | P2/P5 | 6, 7 | Parcours complet, FR/AR RTL, CWV, WCAG AA |
| 9 | Intelligence marché & projets | P4/P7 | 7 | Signaux sourcés, section « Prochainement » |
| 10 | Distribution, White Label, CRM | P1→P7 | 6 | Plus tard, après validation |

```text
0 → 1 → 2 ─┬→ 3 ─────────┐
           └→ 4 → 5 ─────┴→ 6 → 8 → 10
       1 → 7 ──────────────────┘→ 9
```

Les phases 3 et 4 peuvent avancer en parallèle **uniquement si** elles ne touchent pas les mêmes fichiers ni les mêmes tables.

---

## Phase 0 — Audit (session 1, lecture seule)

**Objectif :** établir le CURRENT réel et transformer cette roadmap en plan prouvé.

| ID | Tâche | Agent | Livrable |
|---|---|---|---|
| R0-01 | Carte architecture, doublons, config build/déploiement | A1 | Carte CURRENT + incohérences |
| R0-02 | Schéma Drizzle, migrations, RLS, isolation tenant | A2 | Matrice tables × tenant × RLS |
| R0-03 | Middleware, sessions, rôles, protection `/admin` et API | A3 | Matrice route × protection |
| R0-04 | Search / availability / pricing / booking : mock vs réel | A4 | Matrice module × état |
| R0-05 | Paiement, wallet, ledger, montants, idempotence | A5 | Flux + invariants violés |
| R0-06 | Providers, connecteurs, adaptateurs | A6 | Inventaire providers × N0–N4 |
| R0-07 | Parcours, mobile, RTL, perf, a11y, honnêteté des états | A7 | Audit UX + backlog conversion |
| R0-08 | Tests, CI, 13 PR ouvertes, état de `main` | A8 | Couverture réelle + tri des PR |

**Hypothèses à trancher en priorité** (Master Prompt §4) : README vs code, nom de marque, `package-lock.json` vs `pnpm-lock.yaml`, `vercel.json` vs `netlify.toml`, `vite.config.js` dans un projet Next.js, statut des 13 PR, `/admin` public.

**Critère de sortie :** rapport 16.1 livré · chaque chantier des phases 1 à 7 annoté `État audit` · liste `NOT VERIFIED` explicite · STOP.

---

## Phase 1 — Socle & sécurité immédiate (P0)

| ID | Chantier | État audit | Fichiers / domaines probables | Critère de sortie |
|---|---|---|---|---|
| R1-01 | **Protéger `/admin` et les API d'administration** (auth + rôle serveur, pas seulement côté UI) | **N/A (déjà fait)** — VERIFIED. `middleware.ts` n'existe plus, remplacé par `proxy.ts` (garde RBAC réelle lignes 176-198) + double vérification indépendante dans `app/(internal)/admin/layout.tsx:35-51` + chaque route API admin revérifie session+rôle. Le claim README ("/admin public") est faux/obsolète. | `proxy.ts`, `app/(internal)/admin/layout.tsx`, `app/api/admin/**` | Atteint |
| R1-02 | **Scan des secrets** (historique git inclus), rotation si fuite | **N/A (vérifié clean, 2026-09-28)** — `detect-secrets` (arbre de travail, hors node_modules/lockfiles) + grep ciblé sur `git log --all -p --full-history` (clés AWS, blocs PEM, clés Stripe live, tokens Slack, JWT Supabase, assignations `*_SECRET=`/`*_PASSWORD=` non-placeholder) : **0 secret réel**. Les 68 alertes heuristiques sont toutes des faux positifs vérifiés manuellement (fixtures de test JSON, `postgresql://test:test@...test_only_for_mocks`, `price-token-dev-secret-not-for-prod`, libellés FR contenant "password", couleurs hex). Aucun `.env`/`.env.local`/`.env.production` jamais committé (`.gitignore` couvre correctement `.env*`). | historique git complet (vérifié) | Atteint — aucune rotation nécessaire |
| R1-03 | **Tri des 13 PR** : fusionner / rebaser / fermer avec justification | **N/A (fait, 2026-09-28)** — 8 PR réelles (pas 13), toutes fermées avec commentaire de justification individuel. Voir narratif ci-dessus. | GitHub PR #6,7,9,10,11,12,13,16 | Atteint |
| R1-04 | **Un seul gestionnaire de paquets** | **N/A (fait, 2026-09-28, PR #53)** — VERIFIED. pnpm est le gestionnaire réel (lockfile à jour, 2026-09-26 ; README le documente). `package-lock.json` obsolète (dernier commit 2026-06-12, ~3.5 mois de retard) — résidu à supprimer. Aucune CI dans le repo pour trancher côté CI (voir R1-07). | `package-lock.json`, `pnpm-lock.yaml` | Suppression de `package-lock.json` |
| R1-05 | **Une seule cible de déploiement** | **N/A (fait, 2026-09-28, PR #53)** — VERIFIED. Vercel est la cible active et maintenue (6 cron jobs, fixes récents jusqu'au 2026-09-18, déploiements confirmés en prod cette session). `netlify.toml` mort/jamais opérationnel (dernier commit 2026-06-12, config minimale jamais suivie). | `vercel.json`, `netlify.toml` | Suppression de `netlify.toml` |
| R1-06 | **Config build cohérente** (`vite.config.js` : utilisé ou mort ?) | **N/A (fait, 2026-09-28, PR #53)** — VERIFIED mort et cassé : `vite`/`@vitejs/plugin-react` ne sont pas des dépendances directes (seulement transitif via vitest), aucun script ne le référence. | `vite.config.js` | Suppression |
| R1-07 | **Baseline CI verte** : typecheck, lint, unit, build, E2E smoke | **N/A (fait, 2026-09-28)** — `.github/workflows/ci.yml` créé, 4 jobs bloquants verts sur le premier run réel (PR #51 mergée, run https://github.com/Hassen02020/EasyV4/actions/runs/36489283550). `format` non bloquant (744 fichiers pré-existants, chantier séparé). E2E Playwright et tests DB-mode volontairement hors périmètre. Lighthouse/a11y CI restent dormants. | `.github/workflows/ci.yml` | Atteint (périmètre réduit assumé) |
| R1-08 | **README et nom de marque** alignés sur le code réel | **N/A (fait pour les 2 lignes ciblées, 2026-09-28, PR #53)** — VERIFIED. Marque réelle = Easy2Book (package.json, SEO, logo, 0 occurrence "TunisiaGo" dans app/lib/components). README.md ligne 1/3 dit encore "TunisiaGo" et ligne 99 dit `/admin` public (faux, voir R1-01). | `README.md` | Correction des 2 passages obsolètes |
| R1-09 | **Consolider les rapports d'audit** existants dans `docs/audits/` (archivés, marqués « historique ») | **NOT VERIFIED** — `docs/audits/` existe (confirmé en tout début de session), contenu non ré-audité pour doublons/statut "historique" explicite pendant cette Phase 0. | `docs/audits/**`, `*AUDIT*.md`, `*REPORT*.md` | Un seul index ; anciens rapports non autoritaires |

**Ordre recommandé (mis à jour) :** R1-01, R1-10, R1-07, R1-02, R1-04/05/06/08, R1-03 tous faits. Reste : R1-09 (à planifier, pas de P0/P1/P2 en jeu). R6-02 fait (voir Phase 6).

---

## Phase 2 — Master User (priorité métier n°1)

**Cible :** `Platform → Tenant/Agency → User → Role → Permissions`. Un seul système utilisateur.

| ID | Chantier | État audit | Critère de sortie |
|---|---|---|---|
| R2-01 | Cartographier tous les systèmes d'identité existants → décision **CONSOLIDATE** | **REUSE** — VERIFIED un seul système : Supabase Auth + table `users` (enum `user_role` unique : super_admin/manager/agent_resa/agent_compta/agent_excursions/partner_owner/partner_agent/mutuelle_director/mutuelle_member), pas de doublon trouvé. | Atteint |
| R2-02 | Modèle `tenant` et rattachement de chaque utilisateur | **REUSE** — VERIFIED `agencyType` (ota/partner) + `agencyId` sur `users`, distinction staff Easy2Book vs agence B2B documentée et vérifiée serveur (`admin-gate.ts`). | Atteint (à confirmer : contrainte DB "exactement un tenant" non vérifiée explicitement) |
| R2-03 | RBAC vérifié côté serveur | **REUSE** — VERIFIED defense-in-depth 4 couches (proxy → layout → route handler → Server Action), échantillon de 4+ fichiers de mutation sensible tous protégés par `assertSuperAdmin()`/`resolveSessionContext()`. ~46 fichiers `lib/admin|finance|pro/**` non échantillonnés individuellement (NOT VERIFIED exhaustif, pattern homogène observé). | Atteint sur échantillon ; grep exhaustif recommandé pour garantie totale |
| R2-04 | RLS sur toutes les tables tenant | **EXTEND** — VERIFIED 60/67 tables avec `agencyId` ont RLS. **GAP** : 7 tables `flight_*` (`flight_commercial_rules`, `flight_orders`, `flight_bookings`, `flight_price_snapshots`, `flight_searches`, `flight_supplier_configs`, `flight_supplier_credentials`) ont `agencyId NOT NULL` en schéma/migrations mais AUCUNE policy RLS trouvée. **Vérifié en production (crygnaichvlxavvbifqi) : ces 7 tables n'existent pas du tout en base** — gap de migration jamais appliquée, pas un risque actif, mais RLS à écrire AVANT toute application future de ces migrations. | Ajouter RLS aux migrations `0064/0065` (ou équivalent) avant activation du module "Flight Puzzle" |
| R2-05 | Profil, invitation, désactivation, audit log | **N/A (fait, 2026-09-28, PR #54)** — GAP CONFIRMÉ puis comblé : aucun chemin applicatif n'existait pour créer un `partner_owner`/`partner_agent` (`createStaffUser` exclut ces rôles, `createAgency` ne créait que le tenant, `/pro/utilisateurs` ne gérait que statut/permissions). Ajout de `createPartnerOwner` (super_admin, après création d'agence) et `createPartnerAgent` (partner_owner, gated par le grant `"staff.create"` déjà défini mais jamais câblé) — même motif que `createStaffUser` (invitation Supabase réelle + audit trail + rollback). Désactivation/audit log déjà en place (`setUserStatus`/`setPartnerAgentStatus`). | Atteint |
| R2-06 | Migration des comptes existants sans perte | **N/A** — pas de migration de système identité en cours, un seul système déjà en place. | — |

**Tests obligatoires :** RLS, Auth/RBAC, E2E login par rôle, régression des parcours publics.

---

## Phase 3 — B2B User

**Flux cible :** `Agency → B2B User → Customer → Search → Quote → Booking → Payment → Wallet`.

| ID | Chantier | État audit | Critère de sortie |
|---|---|---|---|
| R3-01 | Espace agence : utilisateurs B2B, clients de l'agence | **N/A (fait, 2026-09-29, PR #55)** — GAP CONFIRMÉ puis comblé : `/pro/clients` était un annuaire lecture seule, `createCustomer`/`updateCustomer` existaient mais réservés au staff OTA. Ajout de `createPartnerClient`/`updatePartnerClient`, gate `"clients.create"`/`"clients.edit"` (déjà dans la baseline partner_owner, délégable). | Atteint |
| R3-02 | Conditions commerciales par agence : markup, commission, devise | **REUSE** — VERIFIED `pricing_margins`/`margin_rules` avec RLS, `applyMargin`/`getMarginsForAgency` réellement utilisés (hôtels, vols, transferts, cars). Incohérence mineure notée (P6) : "car" appliqué hors du `MarginModule` type central. | Atteint, nettoyer l'incohérence "car" |
| R3-03 | Devis (`Quote`) | **DIFFÉRÉ (décision produit reçue 2026-09-29)** — absent, confirmé. Scope futur précis (voir narratif Phase 3 ci-dessus) : uniquement demandes de groupe, transferts, voyage à la carte — flux devis→validation→facture. Autres modules : pas de devis. Ne pas rouvrir la question, attendre un GO explicite pour l'implémenter. | Différé, scope déjà tranché |
| R3-04 | Conversion devis → réservation | **N/A si pas de Quote** — le flux actuel va directement recherche → booking → confirmation (VERIFIED par A4 sur tous les modules), sans étape devis intermédiaire identifiée. | À clarifier avec le produit |

---

## Phase 4 — Wallet (ledger)

**Invariants non négociables** (Master Prompt §13) : solde dérivé du ledger · append-only · montants entiers en unités mineures (TND = millimes, 3 décimales) · devise sur chaque montant · RLS par tenant.

| ID | Chantier | État audit | Critère de sortie |
|---|---|---|---|
| R4-01 | Schéma wallet/ledger, montants entiers, idempotence | **REUSE (largement)** — VERIFIED : `wallet_ledger`/`partner_credit_movements` avec `idempotencyKey` + index unique partiel (SAVEPOINT/ROLLBACK pour les courses concurrentes) ; colonnes `*_millimes` (bigint) ajoutées en double-écriture (étape "expand" du chantier-49C), colonnes `decimal` restent seules sources de vérité pour l'instant. Aucun `float`/`double` dans tout le schéma (grep négatif, 100 usages `decimal`). | Étape "expand" atteinte ; bascule lecture différée (observation en cours) |
| R4-02 | Solde dérivé du ledger, jamais modifié isolément | **REUSE** — VERIFIED : `agencies.deposit_balance` modifiable UNIQUEMENT via `set_agency_deposit_balance()` (SECURITY DEFINER), RLS ne permet pas d'UPDATE direct pour une session tenant normale ; les 7 sites d'appel sont tous accompagnés d'un insert `partnerCreditMovements` dans la même transaction. | Atteint |
| R4-03 | Interdiction UPDATE/DELETE sur ledger | **FIX (gap P2)** — VERIFIED : `lib/finance/commission-settlement.ts:80-92` fait un `UPDATE wallet_ledger SET settled_at=…, settlement_id=…` en code applicatif — viole l'append-only au sens strict (montants non touchés, seulement métadonnées de rapprochement). Aucune autre violation trouvée (les `.delete()` trouvés sont dans des fixtures de test). | À corriger : remplacer par une table de rapprochement séparée ou un événement supplémentaire, jamais un UPDATE du ledger |
| R4-04 | Service wallet serveur idempotent/transactionnel | **REUSE** — VERIFIED pattern à 3 couches (cache Redis best-effort + backstop DB par relecture + SAVEPOINT/ROLLBACK sur contrainte unique concurrente) sur `debitPartnerCredit`/`debitCustomerWallet`/`creditCustomerWallet`. Risque P3 documenté dans le code lui-même : dégradation silencieuse si Redis/Upstash absent (le backstop DB reste sûr). | Atteint |
| R4-05 | Écran wallet agence | **REUSE (confirmé, 2026-09-29)** — VERIFIED `/pro/releve-compte` (`loadPartnerLedger`, solde réel + historique réel). Export CSV absent (P6 mineur, pas de chantier dédié). | Atteint (export en option, non prioritaire) |

---

## Phase 5 — Recharge wallet

| ID | Chantier | État audit | Critère de sortie |
|---|---|---|---|
| R5-01 | Identifier le(s) prestataire(s) de paiement | **REUSE** — VERIFIED Stripe (HMAC-SHA256) + SPS/Paymee (SHA-512) déjà intégrés (`app/api/payment/webhook`), `SPS_ENVIRONMENT=sandbox` actuellement. | Atteint |
| R5-02 | `payment_intent` idempotent, machine à états | **REUSE** — VERIFIED `walletRechargeRequests.status` (pending→validated/rejected), idempotence par `payment_events` (`ON CONFLICT DO NOTHING` sur event_id) + vérif business-level (statut déjà != pending → `already_processed`). | Atteint |
| R5-03 | Webhook signé, rejouable sans double crédit | **REUSE** — VERIFIED signature vérifiée AVANT toute logique (400 si invalide), montant/devise re-vérifiés contre la demande pending (`matchesPendingRecharge`), verrou `FOR UPDATE`. Remboursement PSP géré (`reverseRechargeCredit`, mouvement tracé). Aucun gap trouvé sur ce chemin. | Atteint |
| R5-04 | Crédit ledger uniquement sur confirmation serveur | **REUSE** — VERIFIED, jamais sur retour navigateur (webhook uniquement). | Atteint |
| R5-05 | Recharge manuelle admin avec audit log | **REUSE** — VERIFIED `adminRechargeWallet()` (`lib/admin/agencies-actions.ts`), `assertSuperAdmin()`, insert `partnerCreditMovements` + `auditEvents`. | Atteint |

---

## Phase 6 — Financial & Booking

| ID | Chantier | État audit | Critère de sortie |
|---|---|---|---|
| R6-01 | Machine à états transitions validées serveur | **EXTEND (nuance)** — VERIFIED : `recordReservationTransition()` + `isTransitionAllowed()` appelés sur les 22 sites réels d'écriture de `reservations.status` (grep croisé exhaustif dans `lib/**`). **Mais** : c'est une validation applicative + une table d'audit (`reservation_status_history`), PAS une contrainte DB (aucun trigger/CHECK empêchant une transition invalide côté Postgres) — à ne pas présenter comme un garde-fou DB. | Atteint côté application ; contrainte DB en option (EXTEND futur) |
| R6-02 | Décomposition prix stockée par booking | **N/A (fait, 2026-09-28)** — `recordReservationFinancials` câblé sur omra/packages/activités (6 points, `supplierPriceTnd=salePriceTnd`, marge=0 assumée par design). "cars" hors périmètre (décision produit à clarifier). PR #52 mergée. | Atteint (cars excepté) |
| R6-03 | Séquence autoriser→réserver→capturer, échec→libérer/rembourser | **REUSE (partiel)** — VERIFIED pattern présent sur hôtels/B2B (verrou FOR UPDATE, rollback total si échec fournisseur) ; pas vérifié en détail sur tous les modules. | À confirmer par module |
| R6-04 | Annulation/remboursement | **REUSE** — VERIFIED `cancel-actions.ts`/`refund-logic.ts` avec écriture ledger tracée (millimes inclus). | Atteint |
| R6-05 | Settlement / rapprochement | **REUSE (avec gap P2)** — `commission-settlement.ts` existe et fonctionne, mais viole l'append-only du ledger (voir R4-03). | Corriger le pattern d'écriture (R4-03) |
| R6-06 | Vouchers depuis le booking réel | **REUSE** — VERIFIED `app/api/admin/reservations/[id]/voucher`, `app/api/pro/reservations/[id]/voucher` génèrent depuis les données réelles, protégés RBAC. | Atteint |

---

## Phase 7 — Honnêteté Commerce & Supply

| ID | Chantier | État audit | Critère de sortie |
|---|---|---|---|
| R7-01 | Registre de capacités par module | **CREATE — gap confirmé** — VERIFIED : aucune constante `IMPLEMENTED/CERTIFIED/PARTIAL/SCAFFOLDED/NOT_WIRED` trouvée nulle part dans `lib/**`. Seule doc humaine (`EASYV4_CAR_DECISION.md`, `docs/PRODUCTION_DEPLOYMENT_CHECKLIST.md`) porte cette information, rien de programmatique. | À créer |
| R7-02 | Modules non câblés affichés « Bientôt », non réservables | **REUSE (partiel)** — VERIFIED sur `components/pro/pro-module-tabs.tsx` (label "Bientôt disponible" + `disabled: true` réel, pas cosmétique). **Mais** : Vols et Hôtels Monde exposent un flux de réservation complet (PNR/confirmation) adossé à un fournisseur 100% virtuel, étiqueté `isDemo` côté UI (VERIFIED props transmises) — badge visible à l'écran NOT VERIFIED (revue visuelle requise). | Confirmer visuellement le badge démo ; étendre le pattern "Bientôt" si besoin |
| R7-03 | Mocks isolés, désactivés en prod | **FIX — gap de gouvernance P3/P4** — VERIFIED : les 7 `FEATURE_HOTELS_TUNISIE/HOTELS_MONDE/VOLS/OMRA/PACKAGES/TRANSFERTS/CAR` sont documentés dans `.env.example` mais **0 occurrence `process.env.FEATURE_` dans le code applicatif** — aucun flag n'est techniquement lu. Les routes vols/hôtels-monde restent pleinement accessibles même quand `FEATURE_VOLS=false` est documenté par défaut. Le garde-fou réel est le mode virtuel bloqué en prod pour myGo (`NODE_ENV=production` throw), pas ces flags. | Câbler les flags ou les supprimer s'ils ne servent à rien |
| R7-04 | Couche Connector/Adapter générique | **FIX — gap P2 confirmé** — VERIFIED `lib/booking/hotel-provider-booking.ts` et `lib/booking/actions.ts` sont 100% spécifiques myGo (`MyGoClient`, `MyGoBookingErrorKind` en dur), n'utilisent PAS le Hub générique existant (`lib/hotel-suppliers/core/orchestration.ts`) qui ne couvre que la recherche, pas le booking. Migration vers un 2e fournisseur hôtel réel nécessiterait une réécriture, pas une extension. | Différé — pas de second fournisseur réel à brancher aujourd'hui (déjà tranché par l'utilisateur en session précédente) |
| R7-05 | Pas de logique "Tunisia only" hardcodée | **FIX (nuance) — gap P3** — NOT VERIFIED de `if(country==="Tunisia")` littéral dans le cœur métier partagé (aucun trouvé). Le gap est structurel : le module booking hôtel n'a qu'un seul provider possible (myGo=Tunisie), sans abstraction Location/Coverage — même racine que R7-04. | Différé, même raison que R7-04 |

---

## Phase 8 — Front conversion

| ID | Chantier | Critère de sortie |
|---|---|---|
| R8-01 | Prix total TTC dès la liste, devise claire, conditions d'annulation avant paiement | Revue visuelle + test E2E prix liste = prix checkout |
| R8-02 | Parcours complet avec skeletons, états vides et erreurs, récapitulatif | Captures avant/après |
| R8-03 | FR/AR avec RTL correct, dates et montants localisés | Test visuel RTL sur pages clés |
| R8-04 | Performance : budgets Core Web Vitals via la config Lighthouse existante | Pas de régression LCP/CLS en CI |
| R8-05 | Accessibilité WCAG 2.2 AA | Audit automatisé + clavier sur parcours de réservation |
| R8-06 | Design system unique (tokens Tailwind/shadcn existants), suppression des doublons v0 | Un seul jeu de composants |
| R8-07 | Zéro fausse urgence, preuve sociale uniquement réelle | Revue de contenu |

---

## Phase 9 — Intelligence marché & projets resorts

| ID | Chantier | Critère de sortie |
|---|---|---|
| R9-01 | Modèles `MarketSignal` et `DevelopmentProject` (EXTEND si équivalent existe) | Champs `source_url`, `published_at`, `confidence` obligatoires |
| R9-02 | Rubrique « Actualités & tendances » sourcée et datée | Aucun chiffre en dur dans le code |
| R9-03 | Section « Prochainement » (`ANNONCÉ`) avec liste d'attente | Un projet n'est jamais réservable tant que supply/pricing/booking ne sont pas réels |
| R9-04 | Mise en avant des destinations en croissance **avec inventaire réel** | CTA → produits réservables uniquement |

---

## Phase 10 — Plus tard (sur GO séparé)

- **Distribution** : séparation Product / Offer / Distribution / CommercialTerms ; canaux B2C, B2B, API, Agency, Partner, Network.
- **Achat inter-tenant** : tenant A vend le produit de tenant B sans casser RLS, ownership, pricing, commissions, wallet.
- **White Label** : branding, domaine, catalogue, fournisseurs propres, sur le même cœur Commerce/Booking/Financial.
- **CRM** : orchestre la vente (pipeline, relances, historique client) — ne vend pas lui-même.
- **Intelligence (P7)** : recommandation, ranking, IA — seulement sur données fiables.

---

## Modèle de fiche chantier (à remplir par Claude Code avant chaque GO)

```text
ID:
OBJECTIF:
ÉTAT AUDIT: REUSE | EXTEND | FIX | CONSOLIDATE | CREATE
POURQUOI MAINTENANT:
DÉPENDANCES:
FICHIERS / DOMAINES:
CHANGEMENTS BASE DE DONNÉES:
RISQUE + PLAN DE RETOUR ARRIÈRE:
TESTS (unit / intégration / RLS / E2E / visuel):
CRITÈRE DE SORTIE:
ESTIMATION:
→ STOP, attente du GO
```

## Definition of Done (tous chantiers)

Objectif atteint · code et DB cohérents · Auth/RLS corrects · invariants financiers respectés · tests et E2E pertinents verts · régression vérifiée · visuel conforme au code · aucun mock présenté comme réel · aucun doublon créé · risques et `NOT VERIFIED` documentés · rapport 16.3 livré · `ROADMAP.md` mis à jour (statut + chantier actif suivant).

---

## Prompts de lancement

**Phase 0 :**

```text
Lis docs/MASTER_PROMPT.md et docs/ROADMAP.md. Lance la SESSION 1 en mode AUDIT-ONLY sur EasyV4 (main).
Déploie les agents A1 à A8 en parallèle (lecture seule), puis produis le rapport 16.1.
Mets à jour ROADMAP.md : colonne "État audit" de chaque chantier des phases 1 à 7, avec preuve fichier:ligne,
et insère en tête tout P0 découvert. Ne modifie aucun autre fichier. Termine par NEXT CHANTIER et STOP.
```

> Note : la mise à jour de `ROADMAP.md` est la seule écriture autorisée en Phase 0. Si tu préfères un audit strictement sans écriture, retire cette phrase et demande le tableau dans le rapport.

**Chaque chantier suivant :**

```text
Lis docs/ROADMAP.md. Prends le chantier <ID>. Remplis la fiche chantier, présente-la et STOP.
Après mon GO : branche dédiée, petites PR, tests, rapport 16.3, mise à jour de ROADMAP.md
(statut DONE + chantier actif suivant).
```
