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
ID: R0-AUDIT
Statut: À LANCER
Branche: (aucune — lecture seule)
```

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
| R1-01 | **Protéger `/admin` et les API d'administration** (auth + rôle serveur, pas seulement côté UI) | ? | `middleware.ts`, `app/admin/**`, routes API admin | Test E2E : anonyme → 401/redirect ; non-admin → 403 ; admin → 200 |
| R1-02 | **Scan des secrets** (historique git inclus), rotation si fuite | ? | `.env*`, config, historique | Aucun secret dans l'arbre ni l'historique récent ; `.env.example` à jour |
| R1-03 | **Tri des 13 PR** : fusionner / rebaser / fermer avec justification | ? | PR ouvertes | Chaque PR a une décision écrite ; aucune PR orpheline touchant un domaine P0 |
| R1-04 | **Un seul gestionnaire de paquets** | ? | lockfiles, CI | Un lockfile, CI l'utilise, install propre reproductible |
| R1-05 | **Une seule cible de déploiement** | ? | `vercel.json`, `netlify.toml` | Cible unique documentée ; l'autre supprimée avec preuve qu'elle n'est pas utilisée |
| R1-06 | **Config build cohérente** (`vite.config.js` : utilisé ou mort ?) | ? | configs racine | Suppression prouvée ou rôle documenté |
| R1-07 | **Baseline CI verte** : typecheck, lint, unit, build, E2E smoke | ? | `.github/workflows/**`, `e2e/` | CI bloquante sur PR ; `main` vert |
| R1-08 | **README et nom de marque** alignés sur le code réel | ? | `README.md` | README décrit CURRENT, pas une vision passée |
| R1-09 | **Consolider les rapports d'audit** existants dans `docs/audits/` (archivés, marqués « historique ») | ? | `*AUDIT*.md`, `*REPORT*.md` | Un seul index ; anciens rapports non autoritaires |

**Ordre recommandé :** R1-01 → R1-02 → R1-03 → R1-07 → R1-04/05/06 → R1-08 → R1-09.
R1-01 et R1-02 passent avant tout s'ils sont confirmés.

---

## Phase 2 — Master User (priorité métier n°1)

**Cible :** `Platform → Tenant/Agency → User → Role → Permissions`. Un seul système utilisateur.

| ID | Chantier | Critère de sortie |
|---|---|---|
| R2-01 | Cartographier tous les systèmes d'identité existants (auth provider, tables `users`/`profiles`, sessions) → décision **CONSOLIDATE** | Un seul modèle documenté, doublons listés avec plan de migration |
| R2-02 | Modèle `tenant` (plateforme, agence, partenaire, fournisseur) et rattachement de chaque utilisateur | Chaque utilisateur a exactement un tenant principal ; contrainte en base |
| R2-03 | RBAC : rôles (`platform_admin`, `agency_admin`, `agent`, `supplier`, `customer`…) et permissions vérifiées **côté serveur** | Matrice rôle × action testée |
| R2-04 | RLS sur toutes les tables porteuses d'un `tenant_id` | Tests RLS : tenant A ne lit/n'écrit jamais les données de B |
| R2-05 | Profil, invitation, désactivation, audit log des accès | E2E invitation → activation → accès limité au tenant |
| R2-06 | Migration des comptes existants sans perte | Script de migration réversible, testé sur copie |

**Tests obligatoires :** RLS, Auth/RBAC, E2E login par rôle, régression des parcours publics.

---

## Phase 3 — B2B User

**Flux cible :** `Agency → B2B User → Customer → Search → Quote → Booking → Payment → Wallet`.

| ID | Chantier | Critère de sortie |
|---|---|---|
| R3-01 | Espace agence : utilisateurs B2B, clients de l'agence (ownership par tenant) | CRUD client isolé par tenant, testé |
| R3-02 | Conditions commerciales par agence : markup, commission, devise, plafonds | Modèle `CommercialTerms` séparé du produit |
| R3-03 | Devis (`Quote`) : figer prix fournisseur, prix commercial, prix client, validité | Devis reproductible, expiration gérée |
| R3-04 | Conversion devis → réservation (branchée sur la Phase 6) | E2E devis → booking en statut `pending` |

---

## Phase 4 — Wallet (ledger)

**Invariants non négociables** (Master Prompt §13) : solde dérivé du ledger · append-only · montants entiers en unités mineures (TND = millimes, 3 décimales) · devise sur chaque montant · RLS par tenant.

| ID | Chantier | Critère de sortie |
|---|---|---|
| R4-01 | Schéma `wallet_account` (par tenant et devise) et `ledger_entry` (double entrée, `amount_minor BIGINT`, `currency`, `reference_type`, `reference_id`, `idempotency_key UNIQUE`) | Migration + contraintes en base ; aucun `float`/`numeric` libre pour un montant |
| R4-02 | Solde = vue ou agrégat du ledger (pas de colonne `balance` modifiable, ou colonne maintenue uniquement par trigger vérifié) | Test : somme des entrées = solde, toujours |
| R4-03 | Interdiction UPDATE/DELETE sur `ledger_entry` (policy + trigger) ; corrections par écriture inverse | Test : UPDATE/DELETE refusés |
| R4-04 | Service wallet côté serveur : `credit`, `debit`, `hold`, `release`, idempotents et transactionnels | Tests concurrence : deux débits simultanés ne passent pas sous zéro |
| R4-05 | Écran wallet (solde, historique, export) pour l'agence | UI = données réelles, montants localisés |

---

## Phase 5 — Recharge wallet

| ID | Chantier | Critère de sortie |
|---|---|---|
| R5-01 | Identifier le(s) prestataire(s) de paiement déjà présents dans le code ; sinon proposer 2–3 options avec compromis (**décision utilisateur**) | Choix validé par GO |
| R5-02 | Intention de recharge (`payment_intent`) avec clé d'idempotence, statut `pending → succeeded | failed` | Machine à états testée |
| R5-03 | Webhook signé et vérifié, rejouable sans double crédit | Test : même webhook ×3 → un seul crédit ledger |
| R5-04 | Crédit ledger uniquement sur confirmation serveur (jamais sur retour navigateur) | E2E recharge sandbox → solde à jour |
| R5-05 | Recharge manuelle par admin (virement) avec justificatif et audit log | Trace complète, double validation si montant élevé |

---

## Phase 6 — Financial & Booking

| ID | Chantier | Critère de sortie |
|---|---|---|
| R6-01 | Machine à états booking et payment (`pending → confirmed | failed | cancelled | refunded`), transitions validées serveur | Transitions invalides rejetées, testées |
| R6-02 | Décomposition prix : `supplier_price · commercial_price · customer_price · markup · commission · margin` stockée sur chaque booking | Recalcul impossible à modifier après confirmation |
| R6-03 | Séquence : autoriser / bloquer wallet → réserver fournisseur → capturer ; échec → libérer / rembourser avec trace | Tests des 3 chemins d'échec |
| R6-04 | Annulation et remboursement selon politique affichée | E2E annulation → écriture inverse ledger |
| R6-05 | Settlement : dû fournisseur, commissions agences, rapprochement | Rapport de rapprochement = ledger |
| R6-06 | Vouchers / confirmations générés depuis le booking réel | Voucher cohérent avec booking et paiement |

---

## Phase 7 — Honnêteté Commerce & Supply

| ID | Chantier | Critère de sortie |
|---|---|---|
| R7-01 | Registre de capacités : chaque module expose `IMPLEMENTED · CERTIFIED · PARTIAL · SCAFFOLDED · NOT_WIRED` | Source unique utilisée par l'UI |
| R7-02 | Tout module/onglet non câblé affiché « Bientôt » (non réservable) | Aucun bouton « Réserver » sur un mock |
| R7-03 | Données mockées isolées derrière un `MockProvider` explicite, désactivé en production | Flag vérifié en build prod |
| R7-04 | Couche `Supplier → Connector → Adapter → Canonical` : interface commune, premier adapter réel ou virtuel déclaré | Aucun fournisseur hardcodé dans le cœur |
| R7-05 | Retirer toute logique « Tunisia only » du cœur (passer par Location/Coverage) | Recherche indépendante du pays dans le code métier |

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
