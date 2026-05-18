# RAPPORT D'AUDIT — EasyV4

> Audit Qualité Logiciel + Architecture Base de Données
> Branche : `devin/1778834500-b2b-portal` (PR #8)
> Mode : **lecture seule** — aucune modification appliquée, validation utilisateur requise avant nettoyage.

---

## 0. Synthèse exécutive

| Domaine | Note | Constat principal |
|---|---|---|
| Drizzle CLI `check` | ✅ OK | `Everything's fine 🐶🔥` — aucun conflit sur les migrations tracées. |
| Cohérence schéma ↔ migrations Drizzle | ⚠️ **DRIFT** | `lib/db/schema.ts` (27 tables) **diverge** des migrations Drizzle tracées (23 tables dans `0000_*.sql`). Les 4 tables B2B + 5 enums + extension `user_role` ne vivent QUE dans `drizzle/manual/0004_partner_b2b_portal.sql`. |
| TypeScript (`tsc --noEmit`) | ✅ OK | 0 erreur. |
| ESLint | ✅ OK | 0 erreur, **1 warning** (`_ACTIVITIES` non utilisé dans `scripts/seed-mock-data.ts`). |
| Prettier | ⚠️ Drift | **43 fichiers** présentent des écarts de formatage (PR récents ajoutés sans `pnpm format`). |
| Sécurité — secrets hardcodés | ✅ OK | Toutes les références sont des `process.env.*` (Supabase / MyGo / SPS / Twilio). Aucun secret en dur. |
| Sécurité — RLS | ✅ OK | 27/27 tables ont `ENABLE ROW LEVEL SECURITY` (cf. `0001` + `0002` + `0004`). |
| `.gitignore` | ⚠️ À renforcer | OK pour Next/pnpm/tsbuildinfo, mais bloque `test-plan*.md` / `test-report*.md` ce qui empêche de versionner les plans QA si on veut les conserver. |
| `.prettierignore` | 🔴 **DOUBLONS** | 2 blocs concaténés (v0 + standard) avec des entrées dupliquées (`node_modules`, `.next`, etc.) et patterns douteux (`drizzle/manual/*.sql`, `public`). |
| FK + index BDD | ✅ OK | 30+ contraintes `references()` avec `ON DELETE restrict|cascade|set null` explicite ; indexes systématiques sur `agency_id`, statuts, dates. |
| Sécurité Headers HTTP | ✅ OK | CSP, HSTS, X-Frame-Options DENY, X-Content-Type-Options, Permissions-Policy bien configurés dans `next.config.mjs`. |

---

## 1. Validation CLI Drizzle & cohérence DB

### 1.1 `pnpm drizzle-kit check`

```text
No config path provided, using default 'drizzle.config.ts'
Reading config file '/home/ubuntu/repos/EasyV4/drizzle.config.ts'
Everything's fine 🐶🔥
```

→ **OK** : pas de breakpoint cassé, pas de checksum incohérent sur les migrations tracées.

### 1.2 ⚠️ Drift schéma ↔ migrations Drizzle (**critique**)

**Constat factuel** (vérifié par `pnpm db:generate` en mode lecture — j'ai ensuite **annulé** les fichiers générés pour rester en lecture seule) :

| Source | Nb de tables | Nb d'enums |
|---|---|---|
| `lib/db/schema.ts` (source of truth) | **27** | **13** (avec `agency_type`, `margin_type`, `invoice_type`, `payment_mode`, `credit_movement_type` + `partner_owner` / `partner_agent` dans `user_role`) |
| `drizzle/0000_married_sebastian_shaw.sql` (auto) | **23** | **8** (sans les 5 enums B2B, et `user_role` sans `partner_*`) |
| `drizzle/manual/0004_partner_b2b_portal.sql` | **4** (`pricing_margins`, `partner_invoices`, `partner_payments`, `partner_credit_movements`) | **5** B2B + `ALTER TYPE user_role ADD VALUE` |
| `drizzle/meta/_journal.json` | tracke **uniquement** `0000` | — |

**Conséquence opérationnelle** : si quelqu'un fait `pnpm db:migrate` sur une BDD vierge, **seul `0000` est appliqué** → les tables `partner_*` et `pricing_margins` n'existent pas → l'app crashe à l'ouverture de `/pro/marges`, `/pro/factures`, `/pro/paiements`.

**Test reproductible** (j'ai déclenché puis reverté) :
```bash
pnpm db:generate
# → drizzle-kit produit un NOUVEAU 0001_*.sql contenant les enums B2B + les 4 tables B2B
# → preuve formelle que Drizzle ne « voit » pas les manual migrations
```

**Recommandation** (à valider avant action) :
- **Option A — Réconciliation propre** : générer une nouvelle migration `0001_b2b_portal_partner.sql` via `pnpm db:generate`, **supprimer** `drizzle/manual/0004_partner_b2b_portal.sql` après vérification que le SQL généré couvre 100% (tables + enums + indexes + FKs), et **conserver** uniquement les fichiers `0002`/`0003` manual (RLS, currencies seed, realtime publication) qui ne sont pas exprimables en Drizzle.
- **Option B — Garder le manuel** : ajouter une note `lib/db/README.md` explicite : "ne JAMAIS faire `pnpm db:push` ; appliquer les manuals via `psql -f` après chaque `db:migrate`."
- ⚠️ NE PAS choisir l'option A sans appliquer d'abord la migration générée à un environnement de test pour vérifier qu'elle ne tente pas de **recréer** des tables déjà créées par le manuel.

### 1.3 Clés étrangères & indexation

Vérifié dans `lib/db/schema.ts` :
- **30+ FKs** avec `onDelete` explicite (`restrict` pour `agency_id` → empêche suppression d'agence avec données ; `cascade` pour extensions de réservation ; `set null` pour `invoice_id` dans `partner_payments`).
- **Indexes systématiques** sur `agency_id` (filtre RLS principal), statuts, dates de création, références publiques (`reference_no`).
- **Unique indexes** sur `(agency_id, reference_no)` pour les réservations, `(invoice_number, agency_id)` pour les factures.

→ **conforme aux best-practices Postgres multi-tenant**.

### 1.4 Types Postgres

- `uuid` partout pour les PKs (avec `gen_random_uuid()` default).
- `numeric(14,2)` pour les montants → suffisant jusqu'à 999 999 999 999.99 DT.
- `numeric(10,2)` pour `margin_value` → 99 999 999.99 (largement suffisant).
- `timestamp with time zone` pour `created_at`/`updated_at` → bonne pratique.
- `jsonb` pour `line_items` factures → searchable et indexable.

→ **OK**.

---

## 2. Audit technique global

### 2.1 TypeScript

```text
> tsc --noEmit
✅ 0 erreurs
```

### 2.2 ESLint

```text
scripts/seed-mock-data.ts
  180:7  warning  '_ACTIVITIES' is assigned a value but never used  @typescript-eslint/no-unused-vars

✖ 1 problem (0 errors, 1 warning)
```

→ 1 warning à traiter : la constante `_ACTIVITIES` dans le seed script est définie mais jamais utilisée (vestige PR #6).

### 2.3 Prettier

**43 fichiers** présentent du drift de formatage. Liste extraite de `pnpm format:check` :

- Racine : `AUDIT_ARCHITECTURE.md`, `TEST_PLAN_PR7.md`, `TEST_PLAN_PR9.md`, `TEST_REPORT_PR9.md`, `next-env.d.ts`
- Pages : `app/admin/page.tsx`, `app/booking/checkout/page.tsx`, `app/booking/travelers/page.tsx`, `app/hotels/[id]/page.tsx`, `app/login/page.tsx`, `app/page.tsx`
- Composants : `components/admin/reservations-data-table.tsx`, `components/admin-shell.tsx`, `components/easy2book-logo.tsx`, et **18 composants `components/pro/*`**
- Lib : `lib/admin/__tests__/actions.test.ts`, `lib/admin/actions.ts`, `lib/admin/reservations-data.ts`, `lib/pro/__tests__/pricing.test.ts`, `lib/pro/destinations.ts`, `lib/pro/hotels-fixture.ts`, `lib/pro/mock-tables.ts`

→ **action recommandée** : `pnpm format` (write) — pas de risque fonctionnel, juste réécriture cohérente.

### 2.4 Sécurité — secrets hardcodés

Recherche exhaustive (`sk_live`, `sk_test`, `AKIA`, `ghp_`, `gho_`, `github_pat_`, `service_role`, `SUPABASE_SERVICE`, `MYGO_PASSWORD=` en littéral) :

- `lib/supabase/broadcast.ts:19` → `process.env.SUPABASE_SERVICE_ROLE_KEY` ✅ env var
- `lib/supabase/server.ts:57,61` → idem ✅

**Aucun secret en dur dans le code**. `.env.example` est rempli avec des valeurs vides (gabarit), `.env.local` est ignoré par `.gitignore` (`.env*.local`).

### 2.5 Sécurité — Headers HTTP (`next.config.mjs`)

```text
✅ Content-Security-Policy (default-src 'self', strict)
✅ Strict-Transport-Security (HSTS 2 ans + preload)
✅ X-Frame-Options: DENY
✅ X-Content-Type-Options: nosniff
✅ Referrer-Policy: strict-origin-when-cross-origin
✅ Permissions-Policy (camera/microphone/browsing-topics désactivés)
```

⚠️ Point à confirmer : le CSP `script-src` inclut `'unsafe-inline'` et `'unsafe-eval'` — nécessaire pour Next.js dev mais à durcir en prod via nonce (chantier futur).

### 2.6 Sécurité — RLS Postgres

`drizzle/manual/0001_rls_policies.sql` + `0004_partner_b2b_portal.sql` activent RLS sur 27/27 tables métier avec policies `agency_id = current_agency_id()` ou `is_super_admin()`. ✅ Conforme au modèle multi-tenant.

### 2.7 Middleware Next.js

⚠️ Le fichier est nommé `proxy.ts` (et non `middleware.ts` comme la convention Next standard). Vérifier que **Next 15 reconnaît `proxy.ts`** comme middleware — sinon les protections `/admin/*` et `/pro/*` ne sont **pas appliquées en production** et il faudrait renommer `proxy.ts` → `middleware.ts`.

**Recommandation forte** : vérifier le routing du middleware en chargeant `/admin` sans cookie de session sur le preview Vercel ; si la redirection vers `/login` se déclenche → OK ; sinon → renommer.

### 2.8 Blocs commentés morts

Grep exhaustif `^// ` (commentaires de ligne hors JSDoc) — **aucun bloc de code commenté trouvé**. Les commentaires existants sont :
- Section headers (ex. `// ---- Helpers ----`)
- Notes pédagogiques ou justifications (ex. `// useSyncExternalStore résout proprement l'hydration mismatch…`)
- 1 `// eslint-disable-next-line` justifié dans `lib/supabase/use-realtime-table.ts:41`

→ **Rien à supprimer** dans cette catégorie.

### 2.9 Primitives shadcn/ui non utilisées (faux positifs)

Comptage des imports `@/components/ui/<primitive>` :
- `dialog.tsx` → 0 import direct **MAIS** utilisé par `command.tsx` → conserver.
- `sheet.tsx` → 0 import direct **MAIS** utilisé par `sidebar.tsx` → conserver.
- `tooltip.tsx` → 0 import direct **MAIS** utilisé par `sidebar.tsx` → conserver.

→ **Aucune primitive shadcn vraiment morte**.

### 2.10 `next-env.d.ts` modifié

`next-env.d.ts` a été modifié localement (Turbopack a réécrit la ligne `import "./.next/types/routes.d.ts"` → `import "./.next/dev/types/routes.d.ts"`). Devrait être en lecture seule selon la doc Next. À restaurer (`git checkout next-env.d.ts`).

---

## 3. Nettoyage des fichiers temporaires & obsolètes

### 3.1 Cache build (à supprimer + ignorer)

| Fichier | Taille | Action proposée |
|---|---|---|
| `tsconfig.tsbuildinfo` | 367 KB | **Supprimer** (déjà dans `.gitignore` via `*.tsbuildinfo` — mais non committé donc juste à nettoyer du workdir si présent à `git status`). |

→ déjà couvert par `.gitignore` `*.tsbuildinfo`.

### 3.2 Rapports QA à la racine (à archiver ou ignorer)

| Fichier | Taille | Action proposée |
|---|---|---|
| `AUDIT_ARCHITECTURE.md` | 13 KB | **Conserver** mais déplacer → `docs/architecture/AUDIT_ARCHITECTURE.md` (référence historique). |
| `TEST_PLAN_PR7.md` | 8.6 KB | **Archiver** → `docs/tests/TEST_PLAN_PR7.md`. |
| `TEST_PLAN_PR9.md` | 11.4 KB | **Archiver** → `docs/tests/TEST_PLAN_PR9.md`. |
| `TEST_REPORT_PR9.md` | 15 KB | **Archiver** → `docs/tests/TEST_REPORT_PR9.md`. |
| `test-report-pr6.md` | 6.8 KB | **Archiver** → `docs/tests/test-report-pr6.md` (ou supprimer si périmé). |
| `test-report-pr7.md` | 7.1 KB | **Archiver** → `docs/tests/test-report-pr7.md` (ou supprimer si périmé). |
| `ARBORESCENCE.md` | 28 KB | **Conserver** à la racine (référence projet vivante). |
| `README.md` | — | **Conserver**. |

**Note** : `.gitignore` actuel contient `test-plan*.md` et `test-report*.md` (case-sensitive **uniquement**) → les fichiers `TEST_PLAN_PR7.md` / `TEST_REPORT_PR9.md` (UPPERCASE) **ne sont PAS ignorés** et ont été commités par mégarde. Soit on les déplace dans `docs/tests/`, soit on étend `.gitignore` (mais alors ils ne seront plus versionnés).

### 3.3 `.gitignore` — recommandations

Le `.gitignore` actuel :

```gitignore
# v0 sandbox internal files
__v0_runtime_loader.js
__v0_devtools.tsx
__v0_jsx-dev-runtime.ts
.snowflake/
.v0-trash/
.vercel/
next.user-config.*

# Environment variables
.env*.local

# Common ignores
node_modules
.next/
.DS_Store

# TypeScript
*.tsbuildinfo

# Test artifacts (locaux, ne pas commit)
test-plan*.md
test-report*.md
test-plan*.txt
```

**Recommandations** :
- Ajouter `.env` (sans suffix) pour éviter d'oublier le fichier le plus dangereux.
- Ajouter `coverage/`, `*.log`, `*.tmp` pour les sorties de tests/jest.
- Ajouter `.vscode/` si utilisé localement (ou whitelist `.vscode/settings.json` partagés).
- Décider du sort de `test-plan*.md` : soit on les versionne (les enlever du `.gitignore`), soit on archive et on garde l'exclusion.
- Considérer `# Supabase` : `supabase/.temp/`, `supabase/.branches/` si Supabase CLI est utilisée localement.

### 3.4 `.prettierignore` — 🔴 doublons à corriger

Le fichier actuel a deux blocs concaténés sans entête, avec doublons :

```
AUDIT_ARCHITECTURE.md          ← non listé ? à vérifier
...
node_modules                    ← doublonné plus bas
.next                           ← doublonné plus bas
...
dist
coverage
pnpm-lock.yaml
*.log
drizzle/0000_*.sql              ← prettier ne devrait PAS toucher les migrations
drizzle/manual/*.sql            ← idem
public                          ← OK
```

**Recommandations** :
- Réécrire proprement le fichier (dédupliquer).
- Ajouter `tsconfig.tsbuildinfo`, `.next/`, `*.lockb`.
- Confirmer que `drizzle/*.sql` soit bien ignoré (Prettier ne formate pas SQL nativement, mais des extensions IDE peuvent).

---

## 4. Sécurisation & chasse aux bugs

| Item | Statut |
|---|---|
| Imports morts détectés par ESLint | 0 |
| Variables non utilisées détectées par ESLint | 1 (`_ACTIVITIES` dans `scripts/seed-mock-data.ts`) |
| Erreurs de syntaxe `tsc` | 0 |
| Blocs `// commented code` à supprimer | 0 |
| `@ts-ignore` / `@ts-expect-error` non justifiés | 0 (seul `eslint-disable` dans `use-realtime-table.ts` est justifié) |
| Secrets en dur | 0 |
| Console.log / TODO / FIXME / XXX / HACK à nettoyer | 0 |
| Fichiers `.env*` versionnés par erreur | 0 (seul `.env.example` versionné, c'est OK) |

---

## 5. Formatage & standardisation

### 5.1 `pnpm format:check`

→ **43 fichiers** à reformater. Aucune logique impactée, simple normalisation Prettier.

### 5.2 Imports

L'ordre des imports n'est PAS enforcé par ESLint actuellement (pas de règle `import/order` configurée). Les imports sont organisés à la main, ce qui est globalement cohérent mais non automatisé.

**Recommandation optionnelle** : ajouter `eslint-plugin-import` avec `"import/order"` configuré pour grouper `[builtin, external, internal, parent, sibling, index]` + `newlines-between: "always"`. Pas indispensable car le code est propre, mais utile pour les futurs contributeurs.

---

## 6. Liste consolidée des fichiers à supprimer / déplacer / modifier

> ⚠️ **AUCUNE de ces actions n'a été exécutée. Je demande votre validation explicite (par item ou en bloc) avant d'agir.**

### 🗑️ À supprimer (workdir uniquement, déjà gitignored)

- `tsconfig.tsbuildinfo` — cache tsc local (régénéré au prochain `pnpm typecheck`).

### 📦 À archiver dans `docs/tests/` et `docs/architecture/`

| Source | Destination | Justification |
|---|---|---|
| `AUDIT_ARCHITECTURE.md` | `docs/architecture/AUDIT_ARCHITECTURE.md` | Référence historique, vide la racine. |
| `TEST_PLAN_PR7.md` | `docs/tests/TEST_PLAN_PR7.md` | Plan QA PR #7. |
| `TEST_PLAN_PR9.md` | `docs/tests/TEST_PLAN_PR9.md` | Plan QA PR #9. |
| `TEST_REPORT_PR9.md` | `docs/tests/TEST_REPORT_PR9.md` | Rapport exécution PR #9. |
| `test-report-pr6.md` | `docs/tests/test-report-pr6.md` (ou supprimer) | Rapport PR #6 — vous décidez. |
| `test-report-pr7.md` | `docs/tests/test-report-pr7.md` (ou supprimer) | Rapport PR #7 — vous décidez. |

### ✏️ À modifier

| Fichier | Action |
|---|---|
| `.gitignore` | Réorganiser (ajouter `.env`, `coverage/`, `*.log` ; décider du sort de `test-plan*.md`). |
| `.prettierignore` | Réécrire proprement (dédupliquer, ajouter `tsconfig.tsbuildinfo`, `*.lockb`). |
| `next-env.d.ts` | `git checkout next-env.d.ts` (restaurer la version d'origine modifiée par Turbopack). |
| `scripts/seed-mock-data.ts:180` | Supprimer la constante `_ACTIVITIES` non utilisée. |
| `drizzle/manual/0004_partner_b2b_portal.sql` ↔ `lib/db/schema.ts` | **DÉCISION ARCHITECTURALE** requise — Option A (régénérer en migration Drizzle propre) ou Option B (garder le manuel et documenter strictement). |
| Tous fichiers Prettier-drift (43) | `pnpm format` (write). |

### 🚀 À ajouter

| Item | Justification |
|---|---|
| `docs/architecture/` (dossier) | Accueillir l'audit. |
| `docs/tests/` (dossier) | Accueillir les plans + rapports QA. |
| `eslint-plugin-import` + `import/order` (optionnel) | Auto-tri des imports pour les futurs contributeurs. |

---

## 7. Plan d'action proposé (à valider)

Si vous validez **en bloc**, je propose l'ordre suivant pour ne rien casser :

1. **Restaurer** `next-env.d.ts` (`git checkout`).
2. **Nettoyer** le warning ESLint (`_ACTIVITIES` dans seed-mock-data).
3. **Créer** `docs/architecture/` et `docs/tests/`, déplacer les MD listés (`git mv`).
4. **Réécrire** `.gitignore` + `.prettierignore` (proprement dédupliqués).
5. **Exécuter** `pnpm format` sur tout le repo.
6. **Décider** de la résolution du drift Drizzle (Option A ou B — bloquant en prod si non résolu).
7. **Re-vérifier** : `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm drizzle-kit check`.
8. **Commit unique** : `chore(audit): cleanup root files, fix prettier drift, restore next-env, resolve drizzle manual migration drift`.

---

## 8. Décisions explicites requises de votre part

Avant que je touche à quoi que ce soit, **merci de répondre par OUI/NON (ou détail) à chaque ligne** :

| # | Décision | Réponse attendue |
|---|---|---|
| **D1** | Déplacer `AUDIT_ARCHITECTURE.md`, `TEST_PLAN_PR7.md`, `TEST_PLAN_PR9.md`, `TEST_REPORT_PR9.md` → `docs/tests/` (et `docs/architecture/`) | OUI / NON |
| **D2** | Sort de `test-report-pr6.md` et `test-report-pr7.md` (anciens rapports) | ARCHIVER / SUPPRIMER |
| **D3** | Supprimer la constante `_ACTIVITIES` dans `scripts/seed-mock-data.ts:180` | OUI / NON |
| **D4** | Réécrire `.gitignore` + `.prettierignore` proprement (avec dédup + ajouts standards) | OUI / NON |
| **D5** | Exécuter `pnpm format` sur les 43 fichiers en drift | OUI / NON |
| **D6** | **Résolution drift Drizzle** : Option A (régénérer une migration Drizzle propre `0001_b2b_portal.sql` et supprimer le manuel) **OU** Option B (garder le manuel + documenter) | A / B |
| **D7** | Conserver `ARBORESCENCE.md` à la racine ou déplacer dans `docs/` | RACINE / DOCS |
| **D8** | Restaurer `next-env.d.ts` (revert modification Turbopack) | OUI / NON |
| **D9** | Ajouter `eslint-plugin-import` avec `import/order` (optionnel mais propre) | OUI / NON |
| **D10** | Tout regrouper dans **un seul commit** sur la branche PR #9 ou ouvrir une **nouvelle PR #10 chore/cleanup** | MÊME PR / NOUVELLE PR |

---

## 9. Annexes — Logs bruts

### `pnpm drizzle-kit check`
```text
No config path provided, using default 'drizzle.config.ts'
Reading config file '/home/ubuntu/repos/EasyV4/drizzle.config.ts'
Everything's fine 🐶🔥
```

### `pnpm typecheck`
```text
> tsc --noEmit
(no output — 0 errors)
```

### `pnpm lint`
```text
scripts/seed-mock-data.ts
  180:7  warning  '_ACTIVITIES' is assigned a value but never used  @typescript-eslint/no-unused-vars

✖ 1 problem (0 errors, 1 warning)
```

### `pnpm format:check`
```text
[warn] 43 fichiers en drift (liste complète disponible)
[warn] Code style issues found in 43 files. Run Prettier with --write to fix.
ELIFECYCLE Command failed with exit code 1.
```

### Drift Drizzle (preuve de reproductibilité)
```text
pnpm db:generate
→ drizzle-kit produit un nouveau fichier 0001 + 0002 contenant les enums B2B + les 4 tables partner_*
→ confirme que Drizzle ignore drizzle/manual/0004_partner_b2b_portal.sql
[fichiers générés supprimés après vérification — état initial restauré]
```
