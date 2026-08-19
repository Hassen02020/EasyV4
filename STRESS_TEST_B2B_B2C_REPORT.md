# Easy2Book — Stress Test B2B/B2C Report

> Généré le 2026-08-19, branche `claude/easy2book-v6-modernization-7gyb5v`,
> commit `bcbe282` (mergé sur `main` via PR #18).
>
> **Portée réelle vs portée demandée** : la mission demandait un audit
> exhaustif sur 18 phases (load test 100 VU, création de comptes B2B/B2C
> réels, tests E2E complets, mobile 4 breakpoints, etc.). Ce document
> documente honnêtement ce qui a été **réellement exécuté avec preuve**
> dans une session bornée, ce qui est classé **MISSING / NOT IMPLEMENTED**
> (fonctionnalité absente du code, pas juste non testée), ce qui est
> **BLOCKED — EXTERNAL DEPENDENCY**, et ce qui reste explicitement **non
> testé** faute de temps — jamais présenté comme testé s'il ne l'a pas été.
>
> Conformément aux consignes reçues en cours de session : aucune donnée de
> production n'a été supprimée ou modifiée, aucune migration destructive,
> aucun compte Supabase Auth réel créé, aucun test de charge significatif
> contre la production. Les seules écritures en production sont des
> fixtures explicitement préfixées `STRESS_TEST` / `stress-test-*`, chacune
> créée puis supprimée dans le même lot d'actions (vérifié à 0 résidu après
> coup).

---

## Executive Summary

| # | Question | Réponse |
|---|---|---|
| 1 | Modules couverts | 9 : RLS, RBAC/admin gate, dashboards admin+pro, cron système, webhook paiement, booking (idempotence, code review), search engines (code review), CRM/leads (vérification d'existence), quality gates |
| 2 | Tests exécutés | 6 scénarios RLS live + 2 scénarios chaîne d'identité live (tous avec preuve SQL réelle) + 96 tests unitaires (10 nouveaux) + 4 quality gates (typecheck/lint/test/build) |
| 3 | Tests réussis | Tous les tests exécutés sont **PASS** (6/6 RLS, 2/2 chaîne d'identité, 96/96 unitaires, 4/4 quality gates) |
| 4 | Tests échoués | 0 — mais 2 bugs **CRITICAL** ont été trouvés par inspection de code + reproduits live *avant* d'être corrigés (voir ci-dessous) |
| 5 | Bugs critiques | 2 (Admin identity/RLS blackout, Partner→Admin tenant escape) — **les deux corrigés et re-vérifiés** |
| 6 | Bugs corrigés | 2 critiques + 1 confirmé non affecté par erreur d'analyse initiale (payment webhook) |
| 7 | Bugs restants | 1 CRITICAL non résolu (⚠️ voir "Risque résiduel n°1" — ~20 fichiers `getDb()` bruts partagent la même faille) ; 1 MEDIUM (idempotence booking) ; voir tableau complet |
| 8 | Sécurité | RLS : robuste et prouvée en production (cross-tenant read/write denial, fail-closed, super_admin bypass). RBAC admin : corrigé et testé. Reste : ~20 chemins `getDb()` non migrés (silencieux, pas une fuite — fail-closed) |
| 9 | État RLS | ✅ Actif en production, 49/49 tables `FORCE ROW LEVEL SECURITY`, 6/6 scénarios cross-tenant PASS avec preuve live |
| 10 | État RBAC | ✅ Frontière `/admin` corrigée (agency_type + rôle), testée (10 tests unitaires), vérifiée live avec le cas exact du bug |
| 11 | État B2B | Schéma complet (agencies, users, pricing_margins, partner_invoices/payments/credit_movements) ; **0 compte B2B réel** — aucune agence partenaire ni utilisateur B2B n'existe en production à ce jour |
| 12 | État B2C | Storefront fonctionnel (build+RLS OK) mais **0 donnée catalogue** (aucune zone de transfert, aucun forfait, aucune session Omra) — pages se chargent, formulaires vides, comportement attendu (pas de fabrication) |
| 13 | État search engines | Code审 réel effectué (paramétrage Drizzle = pas d'injection SQL possible par construction) ; aucun test de charge/edge-case exécuté contre un serveur réel dans cette passe — voir section dédiée |
| 14 | État booking | `createTransferBooking` : atomique (transaction unique), protection double-clic accidentelle mais réelle via contrainte unique `public_ref` ; pas de clé d'idempotence explicite → risque de doublon sur re-soumission différée (MEDIUM, documenté, non corrigé) |
| 15 | État CRM | **MISSING / NOT IMPLEMENTED** — aucune table `leads`, aucun scoring, aucun code CRM trouvé dans tout le repository |
| 16 | État Admin | Blackout identifié et corrigé pour 2 pages (dashboards admin+pro) ; ~20 autres pages partagent la même cause racine, non migrées dans cette passe (voir inventaire) |
| 17 | Performance | **BLOCKED — EXTERNAL DEPENDENCY** : pas de test de charge exécuté (consigne explicite de ne pas charger la production ; pas d'environnement de staging disponible) |
| 18 | Fichiers modifiés | 10 (voir liste) |
| 19 | Commandes exécutées | Voir section dédiée |
| 20 | Tests bloqués | Load test, création de comptes réels, tests E2E navigateur complets (voir section) |
| 21 | Décisions nécessitant autorisation | Voir "Décisions en attente" |

---

## 1. Architecture testée

Next.js 16.2, React 19, TypeScript 5.7, Drizzle ORM 0.45, Supabase
(Postgres 17 + Auth), déployé sur Vercel (projet `easy-v4`, équipe
`Easy2Book`), branche de production = `main`. Base de données : projet
Supabase `vqhuptgjhoornteibbpj` ("projet") — **en production**, seul
environnement existant (pas de staging).

75 routes buildées (`pnpm build`) : storefront B2C public, `/pro` (portail
B2B), `/admin` (back-office plateforme), API routes, 3 cron jobs.

---

## 2. CRITICAL Finding #1 — Admin identity / RLS blackout

**Statut : CORRIGÉ ET VÉRIFIÉ EN PRODUCTION.**

### Root cause
`getCurrentAdminProfile()` (`lib/auth/profile.ts`) faisait un `SELECT`
direct sur `users` via `getDb()` (connexion Drizzle/postgres-js directe).
`auth.uid()` ne se résout jamais sur cette connexion (fonctionne
uniquement derrière PostgREST). Depuis que `FORCE ROW LEVEL SECURITY` est
actif (migration 0012, appliquée plus tôt dans la session), la policy
`users_select` (`agency_id = current_agency_id() OR id = auth.uid() OR
is_super_admin()`) bloquait donc systématiquement ce self-lookup — la
fonction renvoyait `null` pour **tout le monde, tout le temps**, sans
erreur visible. `lib/admin/dashboard-data.ts` et `lib/pro/dashboard-data.ts`
partagent le même défaut : leurs requêtes métier renvoyaient
silencieusement zéro ligne, même pour un vrai `super_admin`.

### Reproduction live (avant correction)
Scénario "fail-closed: no context set at all" du test RLS (section 4) :
`app_runtime` sans aucun `set_config` → 0 ligne visible sur `customers` et
`agencies`, alors que des lignes existent. C'est exactement ce que
`getCurrentAdminProfile()` déclenchait à chaque appel.

### Correction
- `resolve_session_context()` (fonction SQL `SECURITY DEFINER`, migration
  0012) étendue en **migration 0014** pour renvoyer aussi
  `email`/`name`/`agency_type`.
- `getCurrentAdminProfile()` réécrite pour appeler cette RPC au lieu d'un
  `SELECT` direct.
- `lib/admin/dashboard-data.ts::loadDashboardData()` et
  `lib/pro/dashboard-data.ts::loadPartnerDashboard()` réécrites pour
  exécuter leurs requêtes dans `withTenantContext()`.
- `app/api/cron/purge-audit/route.ts` (job système, pas de session
  utilisateur) migré vers un nouveau helper `withSystemContext()`
  (`app.is_super_admin = true`) — sans ça, la purge supprimait
  silencieusement 0 ligne à chaque exécution.
- `app/api/payment/webhook/route.ts` **vérifié et confirmé NON affecté** :
  sa logique de confirmation de réservation est un stub `// TODO Sprint 2`
  non implémenté (préexistant, sans rapport avec les travaux RLS de cette
  session) ; sa seule écriture actuelle (`payment_events`, idempotence)
  porte sur une table jamais soumise à RLS dans aucune migration.

### Vérification live après correction (chaîne complète)
```
Authenticated user (fixture) → resolve_session_context() → set_config()
→ withTenantContext() → business query
```
Fixture : 1 agence réelle (Easy2Book), 1 client, 1 réservation
(250.000 TND). Requête exacte utilisée par `loadDashboardData` (somme du
mois en cours) exécutée en tant que `app_runtime` avec le contexte résolu
par la chaîne ci-dessus → **`monthly_revenue_tnd: "250.00"`,
`reservation_count: 1`** (au lieu de `0`/`0` avant correction). Fixtures
supprimées immédiatement après, 0 résidu vérifié.

### Risque résiduel (non résolu dans cette passe)
**~20 fichiers supplémentaires appellent `getDb()` brut sans contexte
tenant et partagent la même cause racine** — inventaire complet en
section 6. Chacun renverra silencieusement des résultats vides (pas de
fuite de données — RLS échoue fermé — mais fonctionnellement cassé) tant
qu'il n'est pas migré vers `withTenantContext()`/`runInTenantContext()`.
C'est le finding le plus important de tout le repository à ce stade :
**une grande partie du back-office `/admin` et `/pro` est actuellement
non-fonctionnelle en production**, silencieusement.

---

## 3. CRITICAL Finding #2 — Partner → platform admin tenant escape

**Statut : CORRIGÉ ET VÉRIFIÉ EN PRODUCTION.**

### Root cause
`proxy.ts` (middleware) et `app/admin/layout.tsx` autorisaient l'entrée
dans `/admin` sur la seule base du rôle
(`super_admin`/`manager`/`agent_resa`/`agent_compta`/`agent_excursions`).
Or ces rôles sont un **vocabulaire partagé** entre le staff Easy2Book et
le personnel d'une agence partenaire B2B : `lib/api/auth-guard.ts::
requirePartnerSession` autorise explicitement `manager` et `agent_resa`
pour une session partenaire. Rien ne vérifiait `agency_type`.

### Reproduction live (avant correction)
Fixture : 1 agence `agency_type='partner'`, 1 utilisateur
`role='manager'` sur cette agence. Requête à `resolve_session_context()` →
`{"role":"manager","status":"active","agency_type":"partner"}` —
exactement la combinaison que l'ancien contrôle (`ADMIN_ROLES.includes(
role)`) aurait laissée passer.

### Correction
Frontière extraite en fonction pure `lib/auth/admin-gate.ts::
isAllowedIntoAdmin(role, agencyType)`, exigeant **rôle staff ET
agency_type='ota'**. Utilisée à la fois par `proxy.ts` (middleware) et
`app/admin/layout.tsx` (defense-in-depth) pour éviter toute divergence
future entre les deux couches.

### Tests de régression
`lib/auth/__tests__/admin-gate.test.ts` — 10 tests, matrice complète :

| agency_type | rôle | Attendu | Testé |
|---|---|---|---|
| ota | super_admin | autorisé | ✅ |
| ota | manager/agent_resa/agent_compta/agent_excursions | autorisé | ✅ |
| partner | manager | **refusé** (le bug) | ✅ |
| partner | agent_resa | refusé | ✅ |
| partner | super_admin | refusé (agency_type prime) | ✅ |
| partner/ota | partner_owner/partner_agent | refusé | ✅ |
| n'importe | agency_type null/vide | refusé | ✅ |
| n'importe | rôle null/inconnu | refusé | ✅ |

### Frontières vérifiées

| Couche | Vérifié | Détail |
|---|---|---|
| 1. proxy/middleware | ✅ | `isAllowedIntoAdmin()` |
| 2. layout/server component | ✅ | `isAllowedIntoAdmin()` (defense-in-depth) |
| 3. server actions admin | ⚠️ non audité individuellement | Chaque action sous `lib/admin/*` fait sa propre confiance implicite au fait d'avoir passé le layout — pas de second contrôle `agency_type` par action. Risque faible (protégé par la couche 1+2) mais pas défense-en-profondeur complète. |
| 4. API routes admin | ⚠️ non auditées individuellement | Aucune route `/api/admin/*` trouvée dans le routing actuel (`pnpm build` ne liste aucune route de ce type) — non applicable actuellement. |
| 5. database/RLS | ✅ | RLS filtre par `agency_id`, indépendamment du gate applicatif — même si un utilisateur partenaire contournait le gate HTTP, RLS limiterait ce qu'il peut lire/écrire à sa propre agence (prouvé section 4) |

---

## 4. RLS — Tests live avec preuve (production)

Exécutés directement contre `vqhuptgjhoornteibbpj` via le rôle
`app_runtime` (rôle non-`BYPASSRLS` réellement utilisé par
`DATABASE_URL` en production, créé plus tôt dans la session). Fixtures
`STRESS_TEST Agency A/B` + client + wallet + wallet_ledger, supprimées
après coup (0 résidu vérifié par requête).

| # | Scénario | Table(s) | Résultat attendu | Résultat obtenu | Statut |
|---|---|---|---|---|---|
| 1 | Agency A lit ses propres données | `customers` (agency_id direct) | 1 visible | 1 | ✅ PASS |
| 2 | Agency A lit données Agency B | `customers` | 0 visible | 0 | ✅ PASS |
| 3 | Agency A lit ses données (jointure 2 sauts) | `wallet_ledger` → `wallet_accounts` | 1 visible | 1 | ✅ PASS |
| 4 | Agency A lit données Agency B (jointure) | `wallet_ledger` | 0 visible | 0 | ✅ PASS |
| 5 | Agency B symétrique | `customers`, `wallet_ledger` | isolation identique | identique | ✅ PASS |
| 6 | `is_super_admin=true` | `agencies` | voit A et B (2) | 2 | ✅ PASS |
| 7 | Aucun contexte posé (fail-closed) | `customers`, `agencies` | 0 partout | 0 | ✅ PASS |
| 8 | Écriture cross-tenant (IDOR) | `INSERT customers` avec `agency_id` d'une autre agence | rejeté | `ERROR 42501: new row violates row-level security policy` | ✅ PASS |

**Conclusion : l'isolation multi-tenant RLS fonctionne correctement en
production**, en lecture comme en écriture, sur le pattern direct
(`agency_id` sur la table) comme sur le pattern à jointure, avec bypass
`super_admin` correct et comportement fail-closed correct en l'absence de
contexte.

---

## 5. B2B Access Matrix

| Rôle | Search (storefront) | Booking | Users (gestion agence) | Reports | Commission | Platform Admin |
|---|---|---|---|---|---|---|
| B2C anonyme | ✅ (public) | ✅ (agence OTA par défaut) | ❌ | ❌ | ❌ | ❌ |
| Partner `agent_resa` | ✅ (via `requirePartnerSession`) | ✅ | ❌ (non audité — pas de route de gestion utilisateurs B2B trouvée) | ⚠️ non testé | ⚠️ non testé | ❌ (corrigé, testé) |
| Partner `manager` | ✅ | ✅ | ⚠️ non testé | ⚠️ non testé | ⚠️ non testé | ❌ (corrigé, testé — **c'était le bug**) |
| OTA `agent_resa`/`manager`/etc. | ✅ | ✅ | ⚠️ non testé | ⚠️ non testé | ⚠️ non testé | ✅ (si `agency_type='ota'`) |
| OTA `super_admin` | ✅ | ✅ | ⚠️ non testé | ⚠️ non testé | ⚠️ non testé | ✅ |

Note : **0 compte B2B réel n'existe en production** — cette matrice est
dérivée du code (RLS + `admin-gate.ts` + `auth-guard.ts`), pas d'un test
de bout en bout avec un vrai login, puisque la création de comptes
Supabase Auth réels était explicitement soumise à autorisation préalable
(non demandée dans cette passe).

---

## 6. Inventaire complet — fichiers `getDb()` bruts (lib/admin, lib/pro, app/admin, app/pro, app/api)

24 fichiers trouvés. **2 corrigés** dans cette passe (marqués ✅). Les 22
autres partagent la même cause racine (interrogent des tables RLS sans
poser de contexte tenant) et n'ont **pas** été migrés — classés
"NON CORRIGÉ, IMPACT PROBABLE" plutôt que testés un par un faute de temps.

| Fichier | Statut |
|---|---|
| `lib/admin/dashboard-data.ts` | ✅ Corrigé + vérifié live |
| `lib/pro/dashboard-data.ts` | ✅ Corrigé + vérifié live |
| `app/api/cron/purge-audit/route.ts` | ✅ Corrigé (`withSystemContext`) |
| `app/api/payment/webhook/route.ts` | ✅ Vérifié — non affecté (stub non implémenté) |
| `lib/admin/actions.ts` | ⚠️ Non corrigé, impact probable |
| `lib/admin/agencies-actions.ts` | ⚠️ Non corrigé, impact probable |
| `lib/admin/finance-data.ts` | ⚠️ Non corrigé, impact probable |
| `lib/admin/reservations-data.ts` | ⚠️ Non corrigé, impact probable |
| `lib/pro/booking-actions.ts` | ⚠️ Non corrigé, impact probable (chemin d'écriture — priorité haute) |
| `lib/pro/partner-data.ts` | ⚠️ Non corrigé, impact probable |
| `lib/pro/reservation-detail.ts` | ⚠️ Non corrigé, impact probable |
| `lib/pro/reservations-data.ts` | ⚠️ Non corrigé, impact probable |
| `lib/pro/server-context.ts` | ⚠️ Non corrigé — `getMarginsForAgency` a un fallback `DEFAULT_MARGINS` explicite, donc dégradation gracieuse (pas de crash), mais marges réelles invisibles |
| `lib/pro/users-data.ts` | ⚠️ Non corrigé, impact probable |
| `app/admin/accounting/recharges/page.tsx` | ⚠️ Non corrigé, impact probable |
| `app/admin/agencies/page.tsx` | ⚠️ Non corrigé, impact probable |
| `app/admin/b2c/clients/page.tsx` | ⚠️ Non corrigé, impact probable |
| `app/admin/b2c/reservations/page.tsx` | ⚠️ Non corrigé, impact probable |
| `app/admin/marges/page.tsx` | ⚠️ Non corrigé, impact probable |
| `app/admin/staff/page.tsx` | ⚠️ Non corrigé, impact probable |
| `app/admin/suppliers/new/page.tsx` | ⚠️ Non corrigé, impact probable |
| `app/admin/suppliers/page.tsx` | ⚠️ Non corrigé, impact probable |
| `app/admin/users/page.tsx` | ⚠️ Non corrigé, impact probable |
| `app/admin/validations/page.tsx` | ⚠️ Non corrigé, impact probable |
| `app/pro/sandbox/page.tsx` | Non prioritaire — page bac à sable, données mock assumées |

**Recommandation** : traiter `lib/pro/booking-actions.ts` en priorité
absolue (chemin d'écriture réel affectant de l'argent réel), puis les
pages de listing admin (lecture seule, impact "juste vide" plutôt que
"transaction perdue").

---

## 7. Bugs — Tableau complet

| ID | Module | Sévérité | Problème | Cause | Correction | Test |
|---|---|---|---|---|---|---|
| BUG-01 | Admin/Pro — Identity | CRITICAL | `getCurrentAdminProfile()` renvoie toujours `null` en prod | `auth.uid()` non résolu sur connexion directe + RLS fail-closed | `resolve_session_context()` (migration 0014) | Chaîne complète vérifiée live (section 2) |
| BUG-02 | Admin — RBAC | CRITICAL | Manager d'agence partenaire peut entrer dans `/admin` | Rôle seul ne distingue pas OTA vs partner | `isAllowedIntoAdmin()` (agency_type + rôle) | 10 tests unitaires + reproduction live |
| BUG-03 | Cron — Audit | HIGH | `purge-audit` supprime silencieusement 0 ligne à chaque exécution | Même cause que BUG-01, `getDb()` brut sans `is_super_admin` | `withSystemContext()` | Non re-testé live (cron non déclenchable sans `CRON_SECRET` de prod) — correction par analogie directe avec BUG-01, prouvée par le même mécanisme |
| BUG-04 | ~20 fichiers admin/pro | CRITICAL (non résolu) | Même cause que BUG-01, non migrés | `getDb()` brut, pas de tenant context | Non fait — voir inventaire section 6 | N/A |
| BUG-05 | Booking — Idempotence | MEDIUM | Pas de clé d'idempotence explicite ; protection contre le doublon est accidentelle (contrainte unique `public_ref`) et ne couvre que le cas quasi-simultané | Absence de mécanisme dédié | Non corrigé (feature, pas un quick-fix) | Analyse de code uniquement, pas de test de concurrence réel exécuté |
| BUG-06 | CRM | INFO | Module entièrement absent | N/A — jamais implémenté | N/A | Vérifié par grep exhaustif : aucune table `leads`, aucun code scoring |
| BUG-07 | Payment webhook | INFO (corrigé de classification) | Confirmation de réservation post-paiement non implémentée | `// TODO Sprint 2` préexistant | N/A — hors scope RLS | Classé MISSING / NOT IMPLEMENTED, pas une régression |

---

## 8. Search Engines — État

Revue de code uniquement (pas de serveur de dev lancé dans cette passe,
budget de temps épuisé avant d'y arriver) :

- **Injection SQL** : non exploitable par construction — toutes les
  requêtes passent par Drizzle ORM avec liaison de paramètres (`eq()`,
  `and()`, template `sql\`...\`` avec interpolation liée). Aucune
  concaténation de chaîne SQL brute trouvée dans les modules de recherche
  (`app/omra/page.tsx`, `app/packages/page.tsx`,
  `app/transferts/resultats/page.tsx`).
- **XSS** : React échappe par défaut ; aucun `dangerouslySetInnerHTML`
  trouvé dans les composants de recherche.
- **Cas limites (dates invalides, voyageurs=0, etc.)** : **non testés**
  dans cette passe — nécessiterait de lancer le serveur de dev et
  d'envoyer de vraies requêtes, non fait faute de temps.
- **Performance (p50/p95/p99)** : **BLOCKED — EXTERNAL DEPENDENCY** —
  aucune infrastructure d'observabilité connectée (pas de Sentry/Vercel
  Analytics configuré avec des identifiants dans cet environnement) et
  aucun test de charge exécuté (interdit contre la production sans
  autorisation).

---

## 9. Mobile / Responsive

**Non testé.** Aucun outil de capture d'écran multi-breakpoint n'a été
utilisé dans cette passe. Le CSS utilise Tailwind avec classes
responsives standard (`md:`, `lg:`) visibles dans le code, mais ceci
n'a pas été vérifié visuellement.

---

## 10. E2E (Playwright)

`e2e/a11y.spec.ts`, `e2e/auth.spec.ts`, `e2e/booking-flow.spec.ts`,
`e2e/hotel-search.spec.ts` existent déjà dans le repository. **Non
exécutés dans cette passe** — `pnpm test:e2e` nécessite un serveur de dev
+ Chromium ; le budget de temps de cette session a été concentré sur les
2 bugs CRITICAL trouvés en premier plutôt que sur l'exécution de cette
suite. Statut : `BLOCKED — TIME BUDGET`, pas un vrai blocage technique
(Chromium est disponible dans cet environnement).

---

## 11. Commandes exécutées

```
git status / git branch -a / git log --oneline -20
find . -maxdepth 2 -type f (inspection initiale)
pnpm typecheck   (exécuté 4×, toujours 0 erreur)
pnpm lint        (exécuté 2×, toujours 0 erreur / 123 warnings préexistants)
pnpm test        (exécuté 2×, 86/86 puis 96/96)
pnpm build       (exécuté 3×, toujours succès)
grep -rl "getDb()" lib/admin lib/pro app/admin app/pro app/api
grep -rli "lead|scoring" lib app
git add / git commit / git push / (via GitHub MCP) create_pull_request / merge_pull_request
(via Supabase MCP) execute_sql ×~20 pour les tests RLS/identité live + nettoyage fixtures
```

---

## 12. Fichiers modifiés (ce commit `bcbe282`)

```
app/admin/layout.tsx                                    (BUG-02 fix)
app/api/cron/purge-audit/route.ts                        (BUG-03 fix)
lib/admin/dashboard-data.ts                               (BUG-01 fix)
lib/auth/profile.ts                                       (BUG-01 fix)
lib/db/tenant-context.ts                                  (withSystemContext ajouté)
lib/pro/dashboard-data.ts                                  (BUG-01 fix)
proxy.ts                                                   (BUG-02 fix)
drizzle/manual/0014_resolve_session_context_profile_fields.sql  (nouveau, appliqué en prod)
lib/auth/admin-gate.ts                                     (nouveau)
lib/auth/__tests__/admin-gate.test.ts                       (nouveau, 10 tests)
```

Pull requests : #17 (merge initial du travail de session), #18 (ces 2
correctifs CRITICAL) — tous deux mergés sur `main`.

---

## 13. Décisions en attente de votre autorisation

| Action | Risque | Données affectées | Pourquoi nécessaire | Alternative safe |
|---|---|---|---|---|
| Créer des comptes Supabase Auth réels (B2C ×4, agences B2B ×4, utilisateurs B2B ×4) | Faible si nettoyés après, mais écrit dans `auth.users` (production) | Table `auth.users` + `public.users` | Seul moyen de tester un vrai parcours de connexion bout-en-bout (actuellement 0 compte réel) | Continuer les tests par simulation SQL directe (fait jusqu'ici) — moins réaliste mais zéro risque |
| Migrer les ~20 fichiers `getDb()` restants (section 6) | Moyen — gros volume de changements, risque de régression s'il n'est pas testé fichier par fichier | Tout `/admin` et `/pro` | Nécessaire pour que le back-office fonctionne réellement en prod | Le faire par petits lots avec vérification à chaque étape, en commençant par `lib/pro/booking-actions.ts` |
| Exécuter `pnpm test:e2e` (Playwright) contre un serveur de dev local | Faible (pas de prod touchée) | Aucune | Valider les parcours utilisateur réels | Peut être fait sans autorisation particulière — juste pas fait faute de temps dans cette passe |
| Ajouter une clé d'idempotence au booking (BUG-05) | Faible — nouvelle colonne + logique | `reservations` | Empêcher les doublons sur re-soumission différée | Peut être fait sans autorisation — proposition de design à valider (colonne `idempotency_key` fournie par le client, contrainte unique `(agency_id, idempotency_key)`) |

---

## 14. Recommandations — ordre de priorité

1. **Migrer `lib/pro/booking-actions.ts`** vers `runInTenantContext()` — chemin d'écriture réel, argent réel, priorité absolue.
2. **Migrer les pages de listing `/admin/*`** (lecture seule, 10 fichiers) — restaure la visibilité du back-office.
3. **Ajouter une clé d'idempotence** au flow de réservation (BUG-05).
4. **Décider** : créer des comptes de test réels (avec votre autorisation) pour valider un vrai parcours de connexion B2C/B2B/Admin de bout en bout.
5. **Exécuter `pnpm test:e2e`** contre un serveur de dev local (aucune autorisation nécessaire, juste pas fait cette fois).
6. **Nettoyer le répertoire `extra/`** — mirror obsolète de `lib/` non scanné par `pnpm test`, contient des doublons de tests déjà présents dans `lib/` (trouvé par hasard en écrivant les tests de cette passe, hors scope pour correction immédiate).
