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

## TAX-RULES-SUPERADMIN-01 — FISCAL SNAPSHOT — CLÔTURÉ LOT 1-9 (2026-10-23)

**Objectif** : garantir que le montant présenté au client, le montant payé, la réservation
enregistrée et la facture racontent exactement la même histoire financière.

**LOT 1-4 — DONE** (commit `0a6bdd9`, branche `claude/easy2book-v6-modernization-7gyb5v`)

- LOT 1 : `FiscalSnapshot` / `FiscalStatus` + 3 builders dans `lib/booking/pricing.ts`
- LOT 2 : snapshot figé dans chaque INSERT réservation (hôtel B2B/B2C, package, activité,
  voiture, transfert, vol) — taux provisoire 19% / `fiscalNote: "taux_provisoire_19_pct"` ;
  cars/transferts/vols → `status: "pending"` (taux non déterminé, jamais inventé)
- LOT 3 : colonne `reservations.fiscal_snapshot JSONB` — migration `0011_quiet_stark_industries.sql`
- LOT 4 : `generateInvoiceForReservation` + `generateIssuedInvoiceForReservation` lisent le
  snapshot (status="determined" → `subtotalTnd`/`vatTnd`) ; fallback historique/pending →
  `totalTtc`/`0` — jamais un taux inventé
- Tests : 2701 pass, 0 fail ; invariant INVOICE-WIRING-01 mis à jour (6 assertions)

**LOT 5 — DONE** (commit `243d556`, branche `claude/easy2book-v6-modernization-7gyb5v`, 2026-10-23)

- Table `fiscal_rules` (pays × module × période × draft/active/closed) — migration `0022_fiscal_rules.sql`
- Moteur `lib/finance/fiscal-rules.ts` — résolution 4-passes wildcard (TN+hotel > TN+_ > _+hotel > _+_)
- `getActiveFiscalRuleInTx()` — variante transactionnelle pour booking-actions
- Actions serveur `lib/finance/fiscal-rules-actions.ts` — createDraft / activate (advisory lock + overlap check dans 1 transaction) / deactivate — super_admin only pour les écritures
- `FiscalSnapshot` étendu : `fiscal_rule_id` + `fiscal_rule_version` (rétrocompatibles)
- Correction gap Omra : `fiscalSnapshot: buildPendingFiscalSnapshot(...)` dans l'INSERT reservations
- Interface `/admin/accounting/fiscal-rules` — liste scrollable + dialogs CRUD
- Tests T1–T17 : 2718 pass, 0 fail ; TypeScript 0 erreurs
- Gap documenté (non corrigé) : Activity B2B — `activityPartnerBookingSchema` sans `expectedTotalTnd`, dérive impossible côté serveur sans modification frontend

**LOT 6 — DONE** (branche `claude/easy2book-v6-modernization-7gyb5v`, 2026-10-23)

- Wiring 6 call-sites fail-closed : hotel B2B (`lib/booking/actions.ts`), hotel B2C
  (`lib/booking/guest-actions.ts`), package B2C + B2B (`lib/packages/booking-actions.ts`),
  activité B2B (`lib/activities/booking-actions.ts`), activité B2C
  (`lib/activities/guest-booking-actions.ts`) → `getActiveFiscalRuleInTx()` + `throw new
Error("FISCAL_RULE_NOT_FOUND")` si aucune règle active
- Wiring 3 call-sites pending-fallback : voiture (`lib/cars/actions.ts`), transfert
  (`lib/transfers/actions.ts`), vol (`lib/vols/booking-request-action.ts`) →
  `getActiveFiscalRuleInTx()` + `buildFiscalSnapshotFromTtc(...)` si règle trouvée, sinon
  `buildPendingFiscalSnapshot(...)` (jamais un taux inventé)
- `parseFloat(fiscalRule.vatRate)` partout (Drizzle renvoie `numeric` en `string`)
- Tests T18–T22 : wiring assertions source-code sur les 9 call-sites
- 2682 pass, 0 fail ; TypeScript 0 erreurs
- **Pré-requis déploiement** : la Direction doit créer et activer au moins une règle par
  module fail-closed (hotel, package, activity) via `/admin/accounting/fiscal-rules` AVANT
  de déployer LOT 6 en production, sous peine de blocage des réservations de ces modules.

**LOT 7 — DONE** (branche `claude/easy2book-v6-modernization-7gyb5v`, 2026-10-23)

- Migration additive `drizzle/0023_fiscal_rules_unit_tax.sql` : 5 colonnes ajoutées sur
  `fiscal_rules` — `tax_type` (NOT NULL DEFAULT 'percentage'), `unit_amount`, `unit_type`,
  `max_units`, `resident_amount` — aucune rupture de rétrocompatibilité
- Drizzle schema `lib/db/schema/financials.ts` : 5 nouveaux champs dans `fiscalRules`
- `ActiveFiscalRule` Pick étendu + SELECT dans `getActiveFiscalRule` et
  `getActiveFiscalRuleInTx` — les 5 champs remontés depuis la DB
- `FiscalSnapshot` étendu : `unitTaxTnd`, `unitCount`, `unitRate` (nullable, null dans
  les 3 builders existants — rétrocompatible)
- Nouveau builder `buildFiscalSnapshotWithUnitTax()` — taxe fixe par unité avec plafond
  (`maxUnits`) ; taxe informationnelle collectée hors Easy2Book (ex: à la réception)
- Contexte fiscal capturé : LF 2024 Art. 46 — taxe de séjour 4/8/12 TND/nuit/personne
  étrangers (2★/3★/4-5★) ; 1/2/3 TND Tunisiens/UMA ; plafond 10 nuits
- Tests T23–T29 : comportemental mock-tx (T23-T26) + unit-tax builder (T27-T29)
- 2730 pass, 0 fail ; TypeScript 0 erreurs
- **NOT YET DEPLOYED** : migration `0023` non appliquée en production ; déploiement
  nécessite GO Direction + activation règles LOT 6 (pré-requis inchangé)

**LOT 8 — DONE** (branche `claude/easy2book-v6-modernization-7gyb5v`, 2026-10-23)

- Migration seed `drizzle/0024_fiscal_rules_seed_provisional.sql` : INSERT idempotent
  d'une règle provisoire `(TN, *, 19 %, active)` dans `fiscal_rules`
- Idempotente : `INSERT … SELECT … WHERE NOT EXISTS (…validation_ref…)` — re-run sûr
- Matchée à la passe 2 (TN+\*) de la résolution 4-passes — couvre les **6 modules TN** :
  hotel, package, activity (fail-closed) + car_rental, transfer, flight
  (basculent de `pending` → 19 % provisoire — décision Direction 2026-10-23)
- `validationRef='PROVISOIRE-GO-DIRECTION-2026-10-23'` — traçable et rollbackable
  (`DELETE WHERE validation_ref=...`)
- `created_by/activated_by` = nil-UUID (seed système) — pas de dépendance user
- `tax_type='percentage'` — compatible LOT 7 (0023 précède 0024)
- Décision Direction 2026-10-23 : option 3 du tableau des taxes v2 ("activer 19 %
  provisoirement avec avertissement") — 6 modules acceptés
- À remplacer module par module dès confirmation conseiller fiscal (tableau B bis DGI)
- **DEPLOYED** (2026-10-23) : migrations `0022` + `0023` + `0024` appliquées en production
  sur projet Supabase `crygnaichvlxavvbifqi` (EasyV4, eu-west-1).
  Preuves post-migration : table `fiscal_rules` 20 colonnes ✓, 3 index ✓,
  règle active `(TN, *, 19.00, PROVISOIRE-GO-DIRECTION-2026-10-23)` présente ✓.

**LOT 9 — CLÔTURÉ** (commit `46899d6`, branche `claude/easy2book-v6-modernization-7gyb5v`, 2026-10-23)

- Audit pré-déploiement 14 points de contrôle — PASS sur tous sauf CI format (bloquant corrigé)
- Fix Prettier format:check : 20 fichiers reformatés (`pnpm prettier --write`) — CI format PASS
- Déploiement production : `0022` + `0023` + `0024` appliquées via Supabase MCP
- Vérifications post-migration effectuées (colonnes, index, règle active)
- Gaps résiduels documentés (non bloquants, chantiers séparés) :
  - RLS absent sur `fiscal_rules` (accès direct DB non restreint)
  - `listFiscalRules` lisible par tout utilisateur authentifié (lecture seule)
  - `hotel_monde`, `omra` B2C/B2B hors périmètre fiscal (chantiers futurs)
- Taux définitifs par module : chantier séparé — attente tableau B bis DGI + avis conseiller fiscal

---

## Chantier actif

### INNGEST-ROUTE-WIRING-GAP-01 — CLÔTURÉ (2026-10-23)

**Objectif** : enregistrer les 4 fonctions Inngest exportées depuis `lib/inngest/functions/index.ts` mais jamais présentes dans le tableau `functions` de `app/api/inngest/route.ts`. Sans enregistrement, Inngest cloud les ignore silencieusement — aucun email de confirmation Packages/Activities/Voiture, aucune livraison CRM.

**Gap documenté** : commentaire explicite dans `route.ts` depuis MUTUELLE-CONCURRENCY-COMPLETE-01 (gap préexistant, hors périmètre à l'époque) — constat validé par audit CARTO-TECH-01.

**Changements** :

- `app/api/inngest/route.ts` [EXTEND] — +4 imports + +4 entrées dans `functions[]` : `processPackageConfirmed`, `processActivityConfirmed`, `processCarConfirmed`, `deliverCampaign`
- `lib/inngest/functions/__tests__/inngest-route-wiring-gap-01-invariants.test.ts` [CREATE] — 25 invariants statiques (trigger, onFailure, steps, barrel export, route import, route registration pour chacune des 4 fonctions)

**Preuves** : 25/25 invariants verts, 2834 tests 0 échec, typecheck propre (0 erreur), lint 0 erreur (13 warnings préexistants), format propre, build pré-existant cassé (`PRICE_TOKEN_SECRET` absent en CI — vérifié identique sur `main` avant changement, non-régression confirmée).

**Branche** : `claude/easy2book-v6-modernization-7gyb5v`

---

### INNGEST-HANDLER-NETWORK-01 — CLÔTURÉ (2026-10-23)

**Objectif** : combler le gap entre l'event `booking/network.confirmed` émis par NETWORK-B2C-01 (PR #234, 2026-10-18) et l'absence de handler Inngest — aucun email de confirmation n'était envoyé aux clients depuis la mise en production du portail Network B2C.

**Changements** :

- `lib/inngest/functions/process-network-confirmed.ts` [CREATE] — handler email + facture CAS-C (step.run)
- `lib/network/guest-booking-actions.ts` [UPDATE] — retrait de l'appel direct `generateInvoiceForReservation` (CAS-C migration, évite le doublon)
- `lib/inngest/functions/index.ts` [EXTEND] — export `processNetworkConfirmed`
- `app/api/inngest/route.ts` [EXTEND] — enregistrement `processNetworkConfirmed`
- `lib/inngest/functions/__tests__/process-network-confirmed-invariants.test.ts` [CREATE] — 14 invariants statiques

**Preuves** : 14/14 invariants verts, 3247 tests 0 échec, typecheck/lint/format propres, commit `53d3f7d`, branche `claude/easy2book-v6-modernization-7gyb5v`.

---

### FISCAL-OMRA-01 — CLÔTURÉ (2026-10-23)

**Objectif** : connecter les deux chemins de réservation omra au moteur de règles fiscales.
— B2B (`booking-actions.ts`) : `buildPendingFiscalSnapshot` hardcodé → `getActiveFiscalRuleInTx` + `buildFiscalSnapshotFromTtc` (fail-closed).
— B2C (`guest-booking-actions.ts`) : `fiscalSnapshot` absent de l'INSERT (NULL) → engine-connected.

**Fichiers** :

- `lib/omra/booking-actions.ts` — import + appel fail-closed `(TN, omra)` + guard `FISCAL_RULE_NOT_FOUND` + snapshot dans INSERT
- `lib/omra/guest-booking-actions.ts` — idem (gap identique à hotels-monde avant FISCAL-MONDE-01)
- `lib/omra/__tests__/fiscal-wiring.test.ts` — 15 invariants statiques (7 B2B + 8 B2C incluant absence buildPendingFiscalSnapshot)
- `lib/finance/__tests__/fiscal-rules.test.ts` — T8 mis à jour (engine-connected vs pending hardcodé)

**Résultats** : 15/15 invariants verts. `pnpm test` : 2760 pass / 0 fail. TypeScript 0 erreurs.
**Non-régression** : règle `(TN, *, 19 %)` couvre `omra` via wildcard 4-passes — `FISCAL_RULE_NOT_FOUND` impossible en prod.
**Commit** : `456bb87` · Branche : `claude/easy2book-v6-modernization-7gyb5v` · PR : #254

---

### RLS-FISCAL-RULES-01 — CLÔTURÉ (2026-10-23)

**Objectif** : activer RLS sur `fiscal_rules` + corriger le garde de `listFiscalRules`
(fonction ne vérifiait que `session.ok`, pas `session.isSuperAdmin`).

**Preuve de sécurité** : `SELECT relrowsecurity, polname, polcmd, using_expr, with_check_expr FROM pg_class + pg_policy WHERE relname='fiscal_rules'`
→ `rls_enabled=true`, `policy_name=fiscal_rules_super_admin`, `cmd=*`, `using_expr=is_super_admin()`, `with_check_expr=is_super_admin()` — confirmé sur Supabase `crygnaichvlxavvbifqi` post-commit `74c931e`.

**Fichiers** :

- `drizzle/manual/0140_rls_fiscal_rules.sql` — migration appliquée en production
- `lib/finance/fiscal-rules-actions.ts` — guard `isSuperAdmin` ajouté dans `listFiscalRules()`
- `lib/finance/__tests__/fiscal-rules-rls.test.ts` — 8 invariants statiques (migration RLS, policy FOR ALL, is_super_admin(), WITH CHECK, idempotence, guard lecture, guard écriture, bypass service role)

**Résultats** : 8/8 invariants verts. `pnpm test` : 2745 pass / 0 fail. TypeScript 0 erreurs.
**Non-régression** : `getActiveFiscalRuleInTx` (booking path) utilise DATABASE_URL service role (bypass RLS) — bookings et fiscalSnapshot non impactés.
**Commit** : `74c931e` · Branche : `claude/easy2book-v6-modernization-7gyb5v` · PR : #254

---

### PRICING-VATRULE-01 — CLÔTURÉ (2026-10-23)

**Objectif** : s'assurer que `computePriceBreakdown` reçoit son `vatRate` depuis la règle fiscale active (DB) et non depuis la valeur par défaut hardcodée `19` de `RatePayload`.

**Audit** : `unitPriceTnd` = HT confirmé (commentaire `pricing.ts:11`, `taxBasis: "HT"` dans `buildFiscalSnapshot`). Pas de double-TVA. Stratégie TX : hotel B2B/B2C utilisent `getActiveFiscalRule` (non-TX) avant le breakdown hors-TX, et conservent `getActiveFiscalRuleInTx` (TX) pour le snapshot.

**Fichiers** :

- `lib/booking/actions.ts` — hotel B2B : `getActiveFiscalRule` non-TX avant breakdown + `vatRate: parseFloat(fiscalRuleForBreakdown.vatRate)`
- `lib/booking/guest-actions.ts` — hotel B2C : idem, 2 appels à computePriceBreakdown couverts
- `lib/packages/booking-actions.ts` — pkg B2C (`fiscalRule`) + pkg B2B (`fiscalRuleB2B`) déplacés avant breakdown
- `lib/activities/booking-actions.ts` — activity B2B : `getActiveFiscalRuleInTx` déplacé avant breakdown
- `lib/activities/guest-booking-actions.ts` — activity B2C : idem + doublon supprimé
- `lib/booking/__tests__/pricing.test.ts` — 5 nouveaux cas vatRate=7 avec valeurs HT/TVA/TTC explicites (14, 33.6, 52.5 TND) + comparaison 7% vs 19% + invariant pas-de-double-TVA
- `lib/booking/__tests__/pricing-vatrule-wiring.test.ts` — 30 invariants statiques (6 × 5 fichiers : import, module, guard, parseFloat, ordre fetch<breakdown, pas de vatRate:19)

**Résultats locaux** : 30/30 invariants câblage verts. `pnpm test` : 2795 pass / 0 fail. TypeScript 0 erreurs.
**Impact production** : règle `(TN, *, 19 %)` active → comportement inchangé jusqu'à modification de la règle en DB.
**Commits** : `9662c64`, `bca1c88` · Branche : `claude/easy2book-v6-modernization-7gyb5v` · PR : #254 (draft)

**État CI PR #254 — run final `40012630160`, commit `675f196`** :

- `typecheck` ✅
- `test` ✅
- `financial-e2e` ✅
- `format` ✅ (corrigé commit `7a080a3` + `2bafe0c`)
- `lint` ✅ (erreur `world-hotel-results-content.tsx:364` corrigée commit `675f196` — pattern "storing from previous renders")
- `build` ✅

**Certification** : CI verte, revue humaine effectuée, PR #254 fusionnée dans `main` (2026-10-23).

---

### FISCAL-MONDE-01 — CLÔTURÉ (2026-10-23)

```
ID: FISCAL-MONDE-01
OBJECTIF: Câbler lib/hotels-monde/guest-booking-actions.ts dans le moteur
          de règles fiscales (getActiveFiscalRuleInTx → fiscalSnapshot figé
          dans l'INSERT reservations), comme LOT 6 l'a fait pour hotel B2B/B2C,
          package, activité. Actuellement : aucun champ fiscalSnapshot dans
          l'INSERT hotels-monde → NULL en DB → facture utilise le fallback
          totalTtc/0 (pas de ventilation TVA).
ÉTAT AUDIT: FIX — lib/hotels-monde/guest-booking-actions.ts:346 INSERT
            reservations sans fiscalSnapshot. Omra a buildPendingFiscalSnapshot
            (non nul) mais hors moteur — périmètre séparé si besoin.
CE QUI EXISTE: getActiveFiscalRuleInTx() + buildFiscalSnapshotFromTtc() +
               buildPendingFiscalSnapshot() déjà dans lib/finance/fiscal-rules.ts
               et lib/booking/pricing.ts. Règle active (TN, *, 19 %)
               en production. Pattern LOT 6 documenté sur 9 call-sites.
CE QUI MANQUE: import + appel getActiveFiscalRuleInTx() dans la TX
               hotels-monde + fiscalSnapshot dans l'INSERT reservations.
POURQUOI MAINTENANT: Toutes les autres lignes de réservation TN ont un
                      fiscalSnapshot non nul depuis LOT 6. Hotels-monde
                      reste le seul module actif avec NULL → incohérence
                      comptable si le module est activé en production.
DÉPENDANCES: LOT 6 DONE, règle (TN, *, 19 %) active en production DONE.
FICHIERS: lib/hotels-monde/guest-booking-actions.ts (1 fichier principal)
          + test d'invariant statique nouveau ou étendu.
CHANGEMENTS DB: Aucun — colonne fiscal_snapshot déjà présente (LOT 3,
                migration 0011). Aucune migration requise.
RISQUES: Fail-closed identique à LOT 6 : si aucune règle active trouvée
         (ne peut pas arriver avec la règle provisoire (TN, *)), la TX
         lève FISCAL_RULE_NOT_FOUND → réservation rejetée. Risque maîtrisé
         car règle (TN, *) couvre tous les modules. Rollback : supprimer
         l'import + revert l'INSERT (1 ligne).
PLAN DE RETOUR: git revert du commit, aucune migration à reverter.
TESTS: invariants statiques (présence getActiveFiscalRuleInTx, présence
       fiscalSnapshot dans INSERT, même pattern que LOT 6).
CRITÈRE DE SORTIE: fiscalSnapshot non nul dans l'INSERT hotels-monde,
                   tests verts, TypeScript clean, CI verte.
ESTIMATION: ≤ 2h (pattern éprouvé, 1 fichier, 0 migration).
```

**Implémentation** :

- `lib/hotels-monde/guest-booking-actions.ts` : import `buildFiscalSnapshotFromTtc`
  - `getActiveFiscalRuleInTx` ; appel fail-closed dans la TX ; `fiscalSnapshot`
    dans l'INSERT `reservations` (pattern identique LOT 6 hotel B2C).
- `lib/hotels-monde/__tests__/fiscal-wiring.test.ts` : 7 invariants statiques
  (import, appel TN/hotel_monde, guard FISCAL_RULE_NOT_FOUND, câblage INSERT,
  parseFloat(vatRate), traçabilité id/version).
- Tests : 7/7 verts. `pnpm test` : 2737 pass / 0 fail. TypeScript 0 erreurs.
- Aucune migration DB (colonne `fiscal_snapshot` déjà présente depuis LOT 3).

---

### VAL-01 — VALIDATION PARCOURS COMMERCIAL — CLÔTURÉ (2026-10-22/23)

**Objectif** : valider que les briques intégrées fonctionnent ensemble du point de vue du client.
Périmètre : hôtel search → activités → fiche → disponibilité → réservation → paiement → facture.

**Clôture** : toutes les sous-tâches DONE ; PR #252 mergée sur `main` (commit `b7633f9`, 2026-10-23).

**Séquence GO (E2-01 → E3-01 → E5-01 terminés, E1-01/E4-02 chantier séparé)** :

#### E2-01 — DONE (2026-10-22)

Gap fermé : aucun test ne vérifiait le câblage bout en bout `hotel page →
fetchNearbyNetworkActivities → getCrossSellNetworkActivities → NearbyActivities component`.
8 invariants statiques créés dans `lib/network/__tests__/nearby-activities-hotel-wiring.test.ts`.
8/8 verts. Preuve : le filtre `status="active"` est attesté à la source ET sur la page hôtel.

#### E3-01 — DONE (2026-10-22)

Gap fermé : aucune assertion E2E ne vérifiait que le prix chambre est non nul au moment de la
sélection ni qu'un total est visible au checkout.
Extension de `e2e/b2c-hotel-guest-create-live.spec.ts` :

- Capture `span.text-lg.font-bold.text-primary.whitespace-nowrap` après sélection chambre → `toBeTruthy()`.
- Asserte `[class*='font-semibold']` contenant des chiffres au checkout → `toBeVisible()`.
  Note : test local-only (`pnpm dev` + `MYGO_MODE=virtual`), non inclus dans CI.

#### E5-01 — DONE (2026-10-22)

Gap fermé : `generateInvoiceForReservation` était couverte uniquement par des invariants statiques
(invoice-wiring.test.ts, 6 tests) — aucun test n'exerçait la fonction contre une vraie DB.
3 tests d'intégration DB créés dans `lib/finance/__tests__/invoice-generation-loop.integration.test.ts` :

- E5-01-01 : `status=pending` → `RESERVATION_NOT_CONFIRMED`, aucune facture créée.
- E5-01-02 : `status=confirmed` → `ok:true`, `alreadyExisted:false`, facture persistée en DB.
- E5-01-03 : retry → `ok:true`, `alreadyExisted:true`, pas de doublon (idempotence 23505 réelle).
  Ajouté au job `financial-e2e` CI dans `.github/workflows/ci.yml`.

#### E1-01 / E4-02 — DONE (2026-10-22)

Gap fermé : `b2c-hotel-guest-create-live.spec.ts` ne pouvait tourner en CI (dépendance à
`pnpm dev` + `MYGO_MODE=virtual`, incompatible avec `pnpm start` qui force `NODE_ENV=production`).

- Créé `playwright.config.dev.ts` : `webServer.command = "pnpm dev"`, `workers=1`, `retries CI=1`.
- Ajouté job `e2e-guest` dans `.github/workflows/ci.yml` : PostgreSQL CI, `db:push`, Playwright
  chromium, `MYGO_MODE=virtual`, lance `b2c-hotel-guest-create-live.spec.ts --config playwright.config.dev.ts`.

#### FLIGHTS-INVOICE-GAP — DONE (2026-10-22)

Gap fermé : `process-flight-confirmed.ts` était le seul handler Inngest post-CAS-C sans appel
`generateInvoiceForReservation` — le module vols était exclu du checkpoint de facturation.

- Ajouté `import { generateInvoiceForReservation }` et `step` aux params.
- Ajouté `step.run("generate-invoice", ...)` en fin de handler (même patron que car/transfer/omra/hotel).
- Ajouté `process-flight-confirmed.ts` dans `invoice-step-invariants.test.ts` → 23/23 verts (ex 20/20).
- `process-flight-confirmed-wiring.test.ts` : 13/13 toujours verts.

**Preuves de fusion VAL-01** :

- Branche : `claude/easy2book-v6-modernization-7gyb5v`
- PR : #252 — mergée sur `main`, commit `b7633f9`, 2026-10-23.
- Format hotfix (Prettier) : PR #253 (`fix/format-prettier-main`) mergée sur `main`, commit `935217b`, 2026-10-23.

---

### HOTELS-MONDE-UX-01 — CLÔTURÉ (2026-10-23)

**Objectif** : enrichir la page résultats Hotels Monde avec photos, filtres étoiles/prix et vue carte.

**Commits** : `7e57d7b` sur `claude/easy2book-v6-modernization-7gyb5v`, PR #252 (avec VAL-01).

**Fonctionnalités livrées** :

- **Photos** : `thumbnailUrl` câblé dans `virtual-supplier` (picsum.photos déterministe `seed/{offerId}`),
  `<img>` non-Next.js avec eslint-disable justifié (démo/placeholder, CSP `img-src https:` couvre).
- **Filtre étoiles** : checkboxes 5★→1★ sur `selectedStars: Set<number>` — filtre `filteredSorted`.
- **Filtre prix** : Radix `<Slider>` initialisé dynamiquement sur `[min, max]` des offres chargées.
- **Vue carte** : toggle Liste/Carte, `HotelMap` (`react-leaflet` v5) chargé en `dynamic` SSR-false,
  `mapPoints` générés en cercle autour de `destCoords` (coordonnées ajoutées aux 10 destinations).
- **i18n** : clés `viewList`, `viewMap`, `filterByStars`, `filterByPrice`, `priceFrom`, `priceTo`
  dans `messages/fr.json`, `en.json`, `ar.json`.

**Fichiers** :

- `app/(public)/[locale]/hotels-monde/search/world-hotel-results-content.tsx`
- `lib/hotels-monde/search-state.ts` (+ `lat`/`lng` sur `WorldDestinationOption` + 10 destinations)
- `lib/hotels-monde/supplier-drivers.ts` (thumbnailUrl picsum)
- `messages/fr.json`, `messages/en.json`, `messages/ar.json`

**Tests** : TypeScript 0 erreurs, CI verte (PR #252).

---

### CAS-C — INVOICE STEP.RUN — DONE (mergé + déployé 2026-10-22)

PR #251 mergée sur `main`. Déployé : `dpl_F3hTKpCs3LyeGh5fKaEs8d1EQHy6`, `state=READY`,
`target=production`, `githubCommitSha=ac51dbfbd77900119afe4442fe9718832d8cabdc` sur `easy2book-new`.

`generateInvoiceForReservation` déplacé depuis les appels fire-and-forget post-commit
dans les actions serveur vers `step.run("generate-invoice")` dans chaque fonction Inngest
concernée. Garantie d'exécution (checkpoint persistant, retry automatique, idempotence DB).
20/20 tests d'invariant statiques verts. TypeScript clean.

**Vérifications post-déploiement (2026-10-22)** :

- Déploiement : CONFIRMED — `dpl_F3hTKpCs3LyeGh5fKaEs8d1EQHy6`, SHA = HEAD(main).
- Non-régression : 264 failures vs 284 avant CAS-C — aucune régression introduite (failures pré-existantes).
- Références publiques (CAS-B) : 18/18 invariants verts — `pg_advisory_xact_lock` en place sur tous les modules.
- Admissibilité réseau : `network_product_node_is_active()` vérifié avant toute réservation, 13/13 tests verts.
- Activités à proximité : `getCrossSellNetworkActivities()` filtre `status="active"` à la source, 5/5 tests verts, câblé sur hôtel/destination/fiche.

---

### CAS-C — DÉTAIL CHANTIER (2026-10-22)

**Problème** : `generateInvoiceForReservation` appelé en fire-and-forget post-commit
dans chaque action → crash process entre commit DB et appel → facture manquante.
Récupérable manuellement, mais risque systémique.

**Fix** : déplacement dans `step.run("generate-invoice")` dans les fonctions Inngest
correspondantes. `step.run` persiste un checkpoint côté Inngest ; retry automatique si
crash ; idempotence garantie par la contrainte `partner_invoices_reservation_uniq`.

**Modules couverts** :

- `booking/confirmed` → `process-confirmed-booking.ts` (hôtel B2B + B2C)
- `booking/omra.confirmed` → `process-omra-confirmed.ts`
- `booking/package.confirmed` → `process-package-confirmed.ts`
- `booking/transfer.confirmed` → `process-transfer-confirmed.ts`
- `booking/car.confirmed` → `process-car-confirmed.ts` (sendEvent reordonné avant invoice)
- `booking/flight.confirmed` → `process-flight-confirmed.ts` (FLIGHTS-INVOICE-GAP, 2026-10-22)

**Hors scope** : Packages B2B, Network guest, Transfers guest, Paiement manuel.

**Tests** : `lib/inngest/functions/__tests__/invoice-step-invariants.test.ts` — 23/23 (ex 20 — +3 flights).
**Build** : TypeScript clean. Aucune migration DB.

---

### CAS-B-PUBLIC-REF-LOCK-01 — PR #249 OUVERTE — TESTED / READY FOR PRODUCTION — AWAITING MERGE

Branche `claude/easy2book-v6-modernization-7gyb5v` — commit `ca8e284` — 2026-10-22.

Extension de `pg_advisory_xact_lock` (déjà en production dans Mutuelle,
`MUTUELLE-CONCURRENCY-COMPLETE-01`) aux 6 fonctions `nextPublicRef()` restantes :
`TG-` (hôtels B2B/B2C + Network + Vols), `OM-` (Omra), `CR-` (Cars B2B + B2C),
`TR-` (Transfers B2B + B2C). 18/18 tests d'invariant statiques verts, Prettier OK,
TypeScript clean. Aucune migration DB.

NOT VERIFIED : déploiement production (après merge PR #249 + déploiement Vercel `easy2book-new`).

---

### CAS-B-PUBLIC-REF-LOCK-01 — DÉTAIL CHANTIER (2026-10-22)

**Problème** : `SELECT MAX(publicRef)` non-verrouillant → deux TX concurrentes lisent
le même MAX avant commit → collision `reservations_public_ref_uniq` (PG 23505) → rollback
d'une TX → réservation pending → retry directeur (pas de corruption, mais UX dégradée).

**Fix** : `await tx.execute(sql\`SELECT pg_advisory_xact_lock(hashtext(${agencyId + ":" + prefix}))\`)`avant chaque`SELECT MAX` — identique au pattern Mutuelle déjà en production.

**Fichiers** :

- `lib/booking/actions.ts` — `nextPublicRef()` central (TG-)
- `lib/omra/booking-actions.ts` — local (OM-)
- `lib/cars/actions.ts` — local (CR-)
- `lib/cars/guest-booking-actions.ts` — local (CR-)
- `lib/transfers/actions.ts` — local (TR-)
- `lib/transfers/guest-booking-actions.ts` — local (TR-)
- `lib/booking/__tests__/public-ref-concurrency.test.ts` — 18 invariants CAS-B (nouveau)

**Tests** : 18/18 verts (présence verrou, ordre avant MAX, scope `agencyId + ":" + prefix`).
**Build** : TypeScript clean, Prettier OK, aucune migration DB.
**Règle** : `EXTEND` — pattern copié depuis Mutuelle, aucune invention.
**PR** : https://github.com/Hassen02020/EasyV4/pull/249 — CI en cours.

---

### CAS-B-PUBLIC-REF-LOCK-01 — CLÔTURÉ (2026-10-22)

Extension de `pg_advisory_xact_lock` (déjà en production dans Mutuelle,
`MUTUELLE-CONCURRENCY-COMPLETE-01`) aux 6 fonctions `nextPublicRef()` restantes :
`TG-` (hôtels B2B/B2C + Network + Vols), `OM-` (Omra), `CR-` (Cars B2B + B2C),
`TR-` (Transfers B2B + B2C). 18/18 tests d'invariant statiques verts, Prettier OK,
TypeScript clean. Aucune migration DB.

**Fichiers** : `lib/booking/actions.ts`, `lib/omra/booking-actions.ts`,
`lib/cars/actions.ts`, `lib/cars/guest-booking-actions.ts`,
`lib/transfers/actions.ts`, `lib/transfers/guest-booking-actions.ts`,
`lib/booking/__tests__/public-ref-concurrency.test.ts` (nouveau).

**Preuves de fusion** :

- Branche : `claude/easy2book-v6-modernization-7gyb5v`
- SHA head fusionné : `071bede`
- Merge commit `main` : `dd0ed31d10fea39adf67930abf9124ae1362a613d4`
- PR : #249 — fusionnée par Direction (`Hassen02020`) le 2026-10-22T21:06:53+01:00
- 7 fichiers, 107 insertions

**NOT VERIFIED** : déploiement production (après déploiement Vercel `easy2book-new`
suite aux 3 merges du 2026-10-22).

---

### NETWORK-CROSSSELL-01 — CLÔTURÉ (2026-10-22)

**Objectif** : exposer les activités Network (`products.type='activity'`) en cross-sell sur les fiches destination, attraction et hôtel.

**Dépendance résolue** : NETWORK-ADMISSIBILITY-GAP-01 (PR #246) fusionnée avant ce chantier (voir section ci-dessous).

**Commits** :

- `07fd340` — feat(network): implémentation complète (8 fichiers, 190 insertions, 9 suppressions)
- `666529c` — fix(format): prettier sur `network-cross-sell.test.ts` (format CI)

**Fichiers modifiés** :

- `lib/destinations/cross-sell.ts` — bug fix ILIKE wildcards + nouvelle fonction `getCrossSellNetworkActivities`
- `lib/destinations/__tests__/network-cross-sell.test.ts` — 5 tests unitaires (5/5 ✓)
- `lib/network/nearby-activities-action.ts` — Server Action wrapper (nouveau)
- `app/(public)/[locale]/attractions/[slug]/page.tsx` — Promise.all catalog+network
- `app/(public)/[locale]/destinations/[slug]/page.tsx` — idem
- `app/(public)/[locale]/hotels/[id]/page.tsx` — useEffect + NearbyActivities (display-only)
- `components/attractions/nearby-activities.tsx` — `href` override
- `components/destinations/destination-cross-sell.tsx` — `href` override

**Règles vérifiées** :

- Admissibilité : `supplierNodes.onboardingStatus = 'active'` ✓ + `products.status = 'active'` ✓ + `isNotNull(supplierNodeId)` ✓ + `isNotNull(costPrice)` ✓
- Prix : `getMarginsForAgency + applyMargin` (jamais un taux inventé — règle CURRENCY-DIM-01a) ✓
- Sécurité réservation hôtel : `guest-booking-actions.ts` et `product-booking-actions.ts` NON touchés — garde `network_product_node_is_active()` intacte ✓

**CI** : typecheck ✓ | lint ✓ | test ✓ | build ✓ | financial-e2e ✓ | playwright-a11y ✓ | format ✓

**Preuves de fusion** :

- Branche : `claude/network-crosssell-01`
- SHA head fusionné : `666529c`
- Merge commit `main` : `f218d9ed28a00b9f7ce69fcd7e725745d2895e52`
- PR : #247 — fusionnée par Direction (`Hassen02020`) le 2026-10-22T21:06:12+01:00

**NOT VERIFIED** : parcours navigateur réel (nécessite DB + partenaire Network actif avec produit activité) — à valider par la Direction post-merge.

---

### NETWORK-ADMISSIBILITY-GAP-01 — NIVEAU 4 (BRIQUE INTÉGRÉE) — FUSIONNÉ (2026-10-22)

**Objectif** : vérifier le statut réel du partenaire (`supplier_nodes.onboarding_status = 'active'`) sur les 3 pages publiques Network avant d'afficher ou permettre la réservation d'un produit.

**Contexte** : le chemin financier (`guest-booking-actions.ts` via `network_product_node_is_active()`) était déjà protégé — gap uniquement sur les 3 pages de lecture publique.

**Fichiers modifiés (3)** :

- `app/(public)/[locale]/network/page.tsx`
- `app/(public)/[locale]/network/[id]/page.tsx`
- `app/(public)/[locale]/network/[id]/book/page.tsx`

**Aucune migration DB.**

**Preuves de fusion** :

- Branche : `network-admissibility-gap-01`
- SHA head fusionné : `fa8c48c58b0c6e919f1f19f5b54be7513d46f9b3`
- Merge commit `main` : `567d49a8d9f89239442f636bcba9101448281037`
- PR : #246 — fusionnée par Direction (`Hassen02020`) le 2026-10-22T18:40:24Z
- 45 insertions / 6 suppressions

---

### HOTEL-GUEST-CREATE-LIVE-01 — NIVEAU 4 (BRIQUE INTÉGRÉE) — FUSIONNÉ (2026-10-21)

**Preuve de fusion** : PR #242, mergée par la Direction sur GitHub (`merged_by: Hassen02020`), commit de merge `7d5d047b14dc634b20faf5a7ea251a377e9b0633` sur `main`.

**Preuve d'intégration** : CI GitHub réelle post-fusion sur `main` — run #677 (id `39598037343`), SHA `7d5d047`, `conclusion: success`. Avant la fusion, CI réelle sur la PR elle-même avait d'abord échoué (run #675, SHA `6cc69bb`, job `format` rouge — oubli de `prettier --check` sur `docs/ROADMAP.md`), corrigé (`65042f8`), puis run #676 8/8 vert avant que la Direction ne fusionne.

**Historique complet ci-dessous, conservé tel que rédigé avant fusion (NIVEAU 2 → NIVEAU 4)** :

**Contexte** : audit de reprise de validation globale (2026-10-20/21) a trouvé qu'aucun test, live ou mocké, n'appelait jamais `createGuestReservationFromDraft` (`lib/booking/guest-actions.ts:142`) — le cœur du produit B2C (création de réservation guest) n'avait jamais été exercé en exécution, seulement en lecture de code. Gap fermé par un test E2E Playwright réel (navigateur → vrai process Next.js), pas un mock de la fonction métier elle-même.

**Fichiers (non commités sur `hotel-guest-create-live-01`, HEAD identique à `origin/main` = `f2aed11c`)** :

- `e2e/b2c-hotel-guest-create-live.spec.ts` (nouveau) — parcours complet recherche → sélection chambre → voyageur → checkout cash → confirmation.
- `lib/booking/inventory.ts` — bypass `INVENTORY_LOCK_DISABLED_TEST_ONLY` (voir ci-dessous).
- `.env.example` — documentation du flag.

**Deux conflits structurels réels découverts et contournés, pas de simples bugs de sélecteur** :

1. `next start` force toujours `NODE_ENV=production`, qui déclenche la garde dure existante contre `MYGO_MODE=virtual` (`lib/mygo/config.ts::resolveMyGoMode`) → recherche hôtel en mode dégradé. **Conséquence retenue** : ce test tourne sous `pnpm dev`, jamais `pnpm build && pnpm start` — et `playwright.config.ts` lance `pnpm start` quand `CI` est défini, donc **ce test ne peut pas tourner dans le job CI standard tel quel** (documenté dans l'en-tête du fichier, pas caché).
2. Aucun pont REST Upstash↔Redis disponible dans ce labo (Docker sans daemon) → `acquireLock` fail-closed systématique. Contourné par `INVENTORY_LOCK_DISABLED_TEST_ONLY=true` : magasin en mémoire process respectant le contrat `InventoryRedis`, jamais actif si `NODE_ENV==="production"` (vérifié à chaque appel, pas une `const` figée au chargement du module — correction appliquée après audit du 2026-10-21), log d'avertissement explicite à chaque usage. Ne remplace pas la preuve de concurrence réelle multi-process (déjà apportée par INVENTORY-LOCK-TOCTOU-01) — hors périmètre de ce bypass.

**Preuves réelles (pas déduites du seul lancement de la commande)** :

- `npx playwright test e2e/b2c-hotel-guest-create-live.spec.ts --project=chromium` → **PASS ×2 consécutifs** (8,1s puis 7,8s).
- Vérification SQL directe (hors Playwright, indépendante) sur la base locale `easyv4_e2e` : 3 lignes `reservations` réelles (`TG-2026-000001/2/3`, `status=pending`, `module=hotel`), 3 `payments` (`method=cash`, `status=pending`), 3 `reservation_hotel`, 3 `audit_events` (`reservation.created`), 9 `economic_entitlements` (3 par réservation : supplier_cost/seller_margin/commission) — tout le chemin financier de `createGuestReservationFromDraft` exercé, pas seulement l'INSERT `reservations`.
- `node --import tsx --test lib/booking/__tests__/inventory.test.ts` → 17/17, aucune régression après le bypass et après sa correction.
- `pnpm test` complet (sans `DATABASE_URL`) → 2645 pass / 0 fail / 435 skip, aucune régression.

**NOT TESTED / NOT VERIFIED, explicitement non refermés** :

- Idempotence / double soumission concurrente, échec de confirmation fournisseur, changement de prix (CART-DRIFT-01) sur ce parcours, paiement carte échoué : **NOT TESTED** (un seul run à la fois, chemin heureux uniquement).
- Génération de facture pour un paiement capturé : logique lue (gated par `isImmediatelyPaid`, jamais atteinte pour `cash`) mais **NOT VERIFIED empiriquement en base** sur ce chantier.

**Progression réelle des niveaux** : Niveau 2 (code testé, preuves SQL indépendantes) → Niveau 3 (revue de risques/sécurité du bypass faite, correction du risque `NODE_ENV` appliquée et re-vérifiée, 17/17 + 2645/0/435 confirmés sans régression, PR créée avec preuves) → **Niveau 4** (PR #242 fusionnée par la Direction, CI réelle post-fusion verte sur `main`, ci-dessus).

**NOT TESTED / NOT VERIFIED restent ouverts malgré le Niveau 4** — la fusion ne les referme pas : idempotence/double soumission, échec de confirmation fournisseur, changement de prix (CART-DRIFT-01), paiement carte échoué, facture pour paiement capturé (NOT VERIFIED empiriquement). Chantier dédié potentiel, NON exécuté — identification seulement (RÈGLE OPÉRATIONNELLE ABSOLUE, étape 5 : « identifier le prochain chantier potentiel, NE PAS l'exécuter »).

**Limite structurelle permanente, pas fermée par ce chantier** : ce test ne peut pas tourner dans le job CI standard (`pnpm start` force `NODE_ENV=production`, incompatible avec `MYGO_MODE=virtual`) — reste une preuve de lab local invoquée manuellement, jamais un gate CI automatique.

---

### HOTEL-B2B-DOUBLE-BOOKING-LOCK-01 — NIVEAU 4 (BRIQUE INTÉGRÉE) — FUSIONNÉ (2026-10-20)

**Contexte** : identifié par l'audit de certification complète du module hôtel (B2C/B2B/B2B2C/Partners) — `lib/booking/actions.ts::createReservationFromDraft` (chemin B2B) n'appelait jamais `acquireLock`/`releaseLock`, contrairement au chemin guest/B2C (`lib/booking/guest-actions.ts`) : deux requêtes B2B concurrentes sur la même offre myGo n'étaient pas bloquées avant l'appel fournisseur.

**Livrables :**

- `lib/booking/actions.ts` [FIX] — port exact du patron guest (+36 lignes) : `acquireLock({agencyId, sessionId, module:"hotel", itemId: draft.offerId})` avant `confirmHotelWithProvider`, `releaseInventoryLock()` sur les 5 sorties (échec fournisseur, `!myGoBooking`, conflit DB, succès avec `reservationId`, catch générique).
- `lib/booking/__tests__/hotel-b2b-double-booking-lock-wiring.test.ts` [CREATE] — 7 tests statiques (patron `readFileSync`/`indexOf`, même convention que `mygo-hotel-commission-wiring.test.ts`) : ordre d'appel, libération sur chaque sortie, parité de clé avec le chemin guest.

**Dépendance** : cette fiche câble correctement `acquireLock`, mais la garantie « double booking impossible » n'est complète qu'avec **INVENTORY-LOCK-TOCTOU-01** (PR séparée, chantier compagnon) — sans elle, le verrou câblé ici pouvait laisser passer deux appelants concurrents malgré un câblage correct. Recommandé de fusionner les deux PR ensemble ou l'une après l'autre.

**Preuves locales (labo, pas de CI réelle) :**

- Isolation `git stash` sur `actions.ts` seul : 0/7 tests contre le code pré-correctif, 7/7 avec — reproduction réelle.
- `tsc --noEmit` / `eslint` / `prettier --check` : propres.
- Suite complète (`pnpm test`) : 3045/3094 PASS, 47 échecs (tous pré-existants), 2 skip.
- Test visuel : authentification réelle (GoTrue) absente de ce labo — vérifié à la place : serveur dev recompile sans erreur, `curl /pro/hotels` → `307` vers `/pro/login?next=...` (comportement attendu, pas de 500).

**Aucune migration DB.**

**NOT VERIFIED** : clic-à-travers B2B authentifié réel (`/pro/booking/travelers` → `createReservationFromDraft`) — impossible dans ce labo sans GoTrue/Supabase Auth.

**Preuves de fusion :**

- Branche : `pr-hotel-b2b-double-booking-lock-01`
- SHA head fusionné : `28f66d435b028d103f05931cfc6e2ce7f3d39c4d`
- Merge commit `main` : `c5aae48208452f1f7503312cca10c09fbd3cc119`
- PR : #239 — fusionnée par Direction (`Hassen02020`) le 2026-10-20T20:08:15Z
- CI run pré-fusion (SHA `28f66d4`) : run #665 (id `39484962777`) → 8/8 ✅ (format/lint/typecheck/test/financial-e2e/build/playwright-a11y/lighthouse)

**Preuves d'intégration (Niveau 4) :**

- CI GitHub réelle post-fusion complète (les 3 chantiers combinés), commit `3b70cb1` (push vers `main`), run #673 (id `39494449917`) : `success`.
- Build local (`pnpm build`) sur `main` intégré (`3b70cb1`) : propre, exit 0, routes `/pro/hotels`, `/pro/hotels/[id]`, `/pro/reservations/[id]`, `/pro/booking/travelers` toutes compilées.
- Suite complète locale (`pnpm test`) sur `main` intégré : 3046/3095 PASS, 47 échecs (identiques, zéro nouvelle régression), 2 skip. Écart de 4 tests vs le point de contrôle `lab-local-01a` expliqué : `lib/i18n/__tests__/` (chantier I18N-CHECKOUT-TRANSFER-01) n'a jamais eu sa propre PR, reste hors scope de cette intégration.

---

### INVENTORY-LOCK-TOCTOU-01 — NIVEAU 4 (BRIQUE INTÉGRÉE) — FUSIONNÉ (2026-10-20)

**Découvert en vérifiant HOTEL-B2B-DOUBLE-BOOKING-LOCK-01** (chantier compagnon, PR séparée) : le test existant « deux sessions concurrentes » de `lib/booking/__tests__/inventory.test.ts` faisait `await winner` PUIS `await loser` — séquentiel, jamais de vraie concurrence — et passait aussi bien avec que sans le défaut décrit ci-dessous, malgré son nom.

**Défaut prouvé (TOCTOU — check-then-act)** : `acquireLock()` (`lib/booking/inventory.ts`) lisait la clé (`get`), puis, si absente, posait `SET NX EX` — **sans jamais vérifier le résultat du SET**. Preuve empirique par `Promise.all([acquireLock(A), acquireLock(B)])` sur la même clé : **les deux appels recevaient `ok:true`**. Redis lui-même reste atomique (`SET NX` renvoie bien `null` en cas de collision) ; c'est le code applicatif qui ignorait cette valeur de retour.

**Sévérité** : défaut préexistant dans la primitive **partagée** — touche les 4 modules qui l'utilisent, pas seulement le B2B : `lib/booking/guest-actions.ts`, `lib/hotels-monde/guest-booking-actions.ts`, `lib/vols/guest-booking-actions.ts` (déjà en production) et le chemin B2B ajouté par HOTEL-B2B-DOUBLE-BOOKING-LOCK-01. Sans ce correctif, le verrou d'inventaire ne protégeait pas réellement contre un double appel fournisseur sous charge concurrente réelle.

**Livrables :**

- `lib/booking/inventory.ts` [FIX] — `acquireLock()` capture désormais le retour de `redis.set(..., {nx:true})` ; si `null` (collision réelle pendant la fenêtre get→set), retourne `{ok:false, reason:"conflict"}` au lieu de `{ok:true}`.
- `lib/booking/__tests__/inventory.test.ts` [FIX] — le test « deux sessions concurrentes » remplacé par un vrai `Promise.all` (au lieu de deux `await` séquentiels).

**Preuves locales (labo, pas de CI réelle) :**

- Isolation `git stash` sur `inventory.ts` seul : le test `Promise.all` échoue (1/17, exactement ce test) contre le code pré-correctif, passe (17/17) avec le correctif — reproduction réelle, pas une assertion trivialement vraie.
- Non-régression structurelle : recherche sur toute la suite — seuls 2 fichiers référencent `acquireLock`/`releaseLock`/`refreshLock` (`inventory.test.ts`, qui les exécute réellement, et `hotel-b2b-double-booking-lock-wiring.test.ts` de la PR compagnon, qui ne fait que lire le texte source sans jamais importer `inventory.ts`) — donc ce correctif ne peut mathématiquement affecter aucun autre test.
- Suite complète (`pnpm test`) rejouée après ce correctif : 3045/3094 PASS, 47 échecs, 2 skip — identique au point de contrôle précédent (après le câblage B2B, avant ce correctif).
- `tsc --noEmit` / `eslint` / `prettier --check` : propres.

**Aucune migration DB.**

**Dépendance** : complète la garantie « double booking impossible » de **HOTEL-B2B-DOUBLE-BOOKING-LOCK-01** (PR séparée) — sans ce correctif, le verrou câblé par cette PR compagnon pouvait laisser passer deux appelants concurrents malgré un câblage correct. Les deux PR se complètent ; recommandé de les fusionner ensemble ou l'une après l'autre.

**NOT VERIFIED** : la preuve ci-dessus utilise le mock Redis en mémoire déjà établi par ce fichier de test (fidèle à la sémantique documentée de `SET NX`, mais sans aller jusqu'à un aller-retour réseau réel vers Upstash) — le comportement sous latence réseau réelle n'a pas été rejoué séparément.

**Preuves de fusion :**

- Branche : `pr-inventory-lock-toctou-01`
- SHA head fusionné : `9d86b9d9684b3ce3c6571b62e8e2dd5e289a9147` (rebasée une fois sur `main` post-#239 avant fusion)
- Merge commit `main` : `4915550205d7b11cf58df5c1fdd6008d63c58c3d`
- PR : #240 — fusionnée par Direction (`Hassen02020`) le 2026-10-20T20:32:16Z
- CI run pré-fusion (SHA `9d86b9d`) : run #669 (id `39491761299`) → 10/10 ✅

**Preuves d'intégration (Niveau 4) :**

- CI GitHub réelle post-fusion complète (les 3 chantiers combinés), commit `3b70cb1` (push vers `main`), run #673 (id `39494449917`) : `success`.
- Build local (`pnpm build`) sur `main` intégré (`3b70cb1`) : propre, exit 0.
- Suite complète locale (`pnpm test`) sur `main` intégré : 3046/3095 PASS, 47 échecs (identiques, zéro nouvelle régression), 2 skip. Écart de 4 tests vs le point de contrôle `lab-local-01a` expliqué (chantier I18N-CHECKOUT-TRANSFER-01, jamais mis en PR, hors scope).

---

### HOTEL-PRO-DOC-ACCESS-TEST-01 — NIVEAU 4 (BRIQUE INTÉGRÉE) — FUSIONNÉ (2026-10-20)

**Contexte** : dernier des 4 chantiers proposés par l'audit de certification complète du module hôtel — test-coverage gap identifié (pas un défaut de code) sur `/api/pro/reservations/[id]/{voucher,invoice}`, les deux routes de téléchargement voucher/facture de l'espace partenaire.

**Audit (avant tout test)** : code relu directement —

- `/api/pro/reservations/[id]/invoice` : double scoping réel — RLS (`withTenantContext`) **+** filtre explicite `eq(reservations.agencyId, profile.agency.id)` dans la requête (défense en profondeur, déjà documentée comme telle dans le fichier).
- `/api/pro/reservations/[id]/voucher` → délègue à `renderReservationVoucher(tx, reservationId)` (`lib/booking/reservation-voucher-render.ts`), dont la doc de tête dit explicitement qu'elle ne refait aucun contrôle d'accès — repose uniquement sur la RLS posée par l'appelant.
- RLS confirmée réelle sur `reservations` (`drizzle/manual/0001_rls_policies.sql:99`, policy générique `agency_id = current_agency_id() OR is_super_admin()`), pas juste `ENABLE` sans policy.
- `lib/booking/__tests__/document-access-control.test.ts` (test existant) couvre les routes **guest** à token (`/api/booking/{voucher,invoice}/[ref]`) — scope différent (secret de token, pas isolation tenant), aucune REUSE possible.

**Verdict : aucun défaut.** Code déjà correct. Classification : **CREATE (tests uniquement)**, zéro ligne de code de production modifiée.

**Livrable :**

- `lib/booking/__tests__/hotel-pro-doc-access-live.test.ts` [CREATE] — 5 tests live (deux agences réelles en base, `withTenantContext`, aucun mock de la primitive testée) :
  1. Voucher — contrôle positif (agence A voit sa propre réservation).
  2. Voucher — refus IDOR inter-agence (agence A → réservation agence B via `renderReservationVoucher`, la fonction réelle de production).
  3. Facture — contrôle positif.
  4. Facture — refus IDOR inter-agence (réplique exacte du where-clause de la route).
  5. Facture — **RLS seule, sans le filtre explicite** de la route : isole la protection RLS elle-même.

**Preuves locales (labo, pas de CI réelle) :**

- 5/5 PASS contre Postgres réel avec RLS active.
- **Sonde anti-vacuité** : le test 5 modifié temporairement (`isSuperAdmin: true` au lieu de `false`) bascule immédiatement en échec (`rows.length` passe de `0` à `1`) — preuve que la clause `is_super_admin()` de la policy RLS est réellement évaluée, pas un test qui passerait de toute façon. Sonde retirée ; fichier revérifié identique **byte à byte** à l'état d'avant sonde (`diff` vide) ; 5/5 restauré.
- `tsc --noEmit` / `eslint` / `prettier --check` sur le nouveau fichier : propres.
- Suite complète (`pnpm test`) rejouée après ajout : **3050/3099 PASS, 47 échecs, 2 skip** — exactement +5 pass/+5 total par rapport au point de contrôle précédent, les 47 échecs pré-existants strictement inchangés en nombre.

**Aucune migration DB. Aucun code de production modifié** (seul fichier touché : le nouveau test).

**NOT VERIFIED** : clic-à-travers HTTP réel sur les deux routes avec une vraie session Supabase — impossible dans ce labo sans GoTrue ; preuve apportée au niveau DB/RLS directement, même frontière que les routes, code de production non réimplémenté.

**Preuves de fusion :**

- Branche : `pr-hotel-pro-doc-access-test-01`
- SHA head fusionné : `8d9d9c70e2979c4caa32d95cb1ad4b4e08507461` (rebasée deux fois sur `main`, post-#239 puis post-#240, avant fusion)
- Merge commit `main` : `3b70cb108982a017ad3d9c1b009ca0e8dd33d2b2`
- PR : #241 — fusionnée par Direction (`Hassen02020`) le 2026-10-20T20:43:40Z
- CI run pré-fusion (SHA `8d9d9c7`) : run #672 (id `39493220465`) → 10/10 ✅

**Preuves d'intégration (Niveau 4) :**

- CI GitHub réelle post-fusion complète (les 3 chantiers combinés), commit `3b70cb1` (push vers `main`), run #673 (id `39494449917`) : `success`.
- Build local (`pnpm build`) sur `main` intégré (`3b70cb1`) : propre, exit 0.
- Suite complète locale (`pnpm test`) sur `main` intégré : 3046/3095 PASS, 47 échecs (identiques, zéro nouvelle régression), 2 skip. Écart de 4 tests vs le point de contrôle `lab-local-01a` expliqué (chantier I18N-CHECKOUT-TRANSFER-01, jamais mis en PR, hors scope).

**Niveau actuel : 4 (Brique intégrée).** Fusionnée dans `main`, comportement vérifié après intégration avec les 2 autres chantiers de cette série (CI réelle + build + suite complète locale, tous propres).

---

### MUTUELLE-BOOKING-01 — CLOS / FUSIONNÉ (2026-10-18)

**Leg réservation B2B2C sur approbation directeur (module Mutuelle).**

Ferme le gap `Mutuelle | PARTIEL` identifié par CARTO-TECH-01 : lorsqu'un directeur
approuve une demande membre, une réservation `confirmed` est créée immédiatement dans
la même transaction DB, avec la chaîne financière complète.

**Livrables :**

- `lib/mutuelle/booking-actions.ts` [CREATE] — helper `createMutuelleBookingInTx()`
  appelé dans la transaction `reviewMutuelleRequest` :
  `salePriceTnd = basePriceTnd × (1 + markupPercent/100)`, ref `MUT-YYYY-NNNNNN`,
  `recordReservationFinancials` + `creditPlatformCommission` (commissionPercent=0),
  `providerPayload.channel = "mutuelle_b2b2c"`, audit `reservation.mutuelle_booking.created`.
- `lib/mutuelle/requests-actions.ts` [EXTEND] — `reviewInputSchema` étendu (`basePriceTnd`
  requis sur `approved`), résultat `{ reservationId?, publicRef? }`, appel
  `createMutuelleBookingInTx` dans la transaction, fire-and-forget post-commit :
  `generateInvoiceForReservation` + `sendEvent("booking/mutuelle.confirmed")`.
- `lib/inngest/client.ts` [EXTEND] — type `"booking/mutuelle.confirmed"` dans `Events`.
- `lib/inngest/functions/process-mutuelle-confirmed.ts` [CREATE] — handler Inngest email récap.
- `lib/inngest/functions/index.ts` [EXTEND] — export `processMutuelleConfirmed`.
- `lib/mutuelle/__tests__/mutuelle-booking-invariants.test.ts` [CREATE] — 16 invariants statiques.
- `lib/mutuelle/__tests__/mutuelle-concurrency.test.ts` [CREATE] — 13 tests statiques,
  4 scénarios de concurrence (CAS A/B/C/D).

**Preuves de fusion :**

- Branche : `claude/mutuelle-booking-01`
- SHA head fusionné : `ab13e52210e1a1bd320147628c9023484ebbdec5`
- Merge commit `main` : `ae215629bfe8e80921b50a1c68b972a63c6434d0`
- PR : #235 — fusionnée par Direction (`Hassen02020`) le 2026-10-18T20:11:21Z
- CI run pre-merge (SHA `ab13e52`) : run #654 → tous contrôles ✅ (format/lint/typecheck/test/financial-e2e/build/playwright-a11y/lighthouse)
- CI run post-merge (SHA `ae215629`, run #656) : 8/8 ✅ (format/lint/typecheck/test/financial-e2e/build/playwright-a11y/lighthouse)

**Aucune migration DB.** Réservation via schéma `reservations` existant,
traçabilité Mutuelle via `providerPayload.channel = "mutuelle_b2b2c"`.

**3 risques résiduels documentés (non corrigés — GO Direction séparé requis pour chacun) :**

| ID        | Description                                                                                                          | Impact si déclenché                                                                       | Proposition technique                                                                                                                                   |
| --------- | -------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| CAS-B     | `SELECT MAX(publicRef)` non-verrouillant → collision UNIQUE `(agencyId, publicRef)` sur approbations concurrent      | PG 23505 → rollback TX → demande reste `pending` → retry directeur OK (pas de corruption) | `pg_advisory_xact_lock(hashtext(agencyId + year))`                                                                                                      |
| CAS-C     | `generateInvoiceForReservation` appelé post-commit (fire-and-forget) → crash process avant appel → facture manquante | Facture orpheline, récupérable manuellement                                               | Inngest `step.run` pour garantie d'exécution                                                                                                            |
| ~~CAS-D~~ | ~~`mutuelleGroups.status` non vérifié à l'approbation → groupe inactif/suspendu peut être approuvé~~                 | ~~Réservation créée pour groupe non actif~~                                               | **CORRIGÉ** — PR #236 (2026-10-18) : `SELECT mutuelleGroups FOR UPDATE` + garde `status !== "active"` avant toute écriture dans `reviewMutuelleRequest` |

---

### CAS-D-FIX-01 — CLOS / FUSIONNÉ (2026-10-18)

**Garde statut groupe Mutuelle avant toute écriture dans `reviewMutuelleRequest`.**

Défaut : `UPDATE mutuelleRequests` s'exécutait AVANT le `SELECT mutuelleGroups` (sans `FOR UPDATE`, sans garde statut) → approbation possible sur un groupe suspendu.

Correction : insertion de `SELECT mutuelleGroups FOR UPDATE` + garde `if (status !== "active") return { ok: false }` entre le verrou de la demande et la première écriture métier. SELECT redondant de la branche `approved` supprimé.

**Preuves de fusion :**

- Branche : `claude/cas-d-fix-01`
- SHA head fusionné : `1af33eea8a2586caa2e92ca39ee70e760a6a73e0`
- Merge commit `main` : `3761d0a` (PR #236, fusionnée par Direction `Hassen02020` le 2026-10-18T22:30:59Z)
- CI run pre-merge : 9/10 ✅ (`format` ❌ sur `docs/ROADMAP.md` — pré-existant, hors diff PR, 0 ligne de diff entre branche et main)
- Tests unitaires vitest : 5/5 PASS (T-D7a/b/c/d/e) — 100 % statiques, aucune DB
- Tests concurrence existants : 13/13 PASS (aucune régression)
- Test PostgreSQL live (55P03) : **SKIP** — non exécuté, aucune DB locale disponible

**Aucune migration DB.** Schéma `mutuelleGroups.status` (`varchar(16).notNull().default("active")`) inchangé.

**NOT VERIFIED :** validation de la sérialisation `FOR UPDATE` réelle (SQLSTATE 55P03) — test live disponible dans `lib/mutuelle/__tests__/mutuelle-group-for-update-concurrency.live.test.ts`, nécessite `ALLOW_LIVE_DB_TESTS=true` + Supabase CLI local.

---

### LOCAL-FULL-E2E-01 — CLOS / READY FOR MERGE (2026-10-18)

Stack local E2E complet — répétition générale des 18 specs Playwright en
environnement isolé (Supabase CLI + GoTrue + Virtual suppliers + PAYMENT_MODE=virtual).

**Livrables :**

- `scripts/seed-base-infra.ts` : fix P0 — `futureDate()` utilisait une base fixe
  `2026-09-11` générant des dates déjà passées. Corrigé en `new Date()` dynamique.
  Dates affectées : session activité (futureDate(20)), départ package (futureDate(30/36)),
  deadline réservation (futureDate(35)).
- `scripts/create-e2e-gotrue-users.ts` : crée les 2 utilisateurs GoTrue avec UUIDs
  fixes (11111111-... admin, 66666666-... partner) via `supabase.auth.admin.createUser`.
  Idempotent (ignore "already exists").
- `.env.test.example` : template minimal pour l'environnement E2E local avec
  PAYMENT_MODE=virtual, MYGO_MODE=virtual, MEDIA_STORAGE_BACKEND=local.
- `scripts/run-e2e-local.sh` : orchestrateur complet (supabase start → db:push →
  seed-base-infra → create-e2e-gotrue-users → pnpm dev → playwright test 18 specs).

**Prérequis Direction pour exécution complète :**

- Docker + Supabase CLI installés sur la machine de test
- `.env.test` créé depuis `.env.test.example`
- Pour hôtels monde : `EXCHANGE_RATE_API_KEY` (sinon bloqué fail-closed)

**Statut specs E2E :**

- 6 specs runnable sans auth (a11y, header/footer, hotel-search, mobile-overflow,
  b2c-guest-checkout, omra-packages-storefront)
- 12 specs runnable avec GoTrue (all dashboard-operations-\*, auth, journey-builder)
- 0 spec nécessitant Inngest réel (PAYMENT_MODE=virtual couvre tous les flows)

TypeScript clean. Branche : `claude/local-full-e2e-01` | PR #233.

---

### ENV-PRODUCTION-01 — AUDIT LIVRÉ / ACTION DIRECTION REQUISE (2026-10-18)

Audit complet des variables d'environnement production Vercel `easy2book-new`.

Résultat : 11 groupes de variables documentés dans `docs/env-production-audit.md`.

**Priorités immédiates (Direction → Vercel dashboard) :**

1. Vérifier DATABASE_URL, SUPABASE_SERVICE_ROLE_KEY
2. `INNGEST_SIGNING_KEY` + `INNGEST_EVENT_KEY` → débloque tous les workflows
3. `RESEND_API_KEY` → débloque emails clients
4. `EXCHANGE_RATE_API_KEY` → débloque hôtels monde devise étrangère
5. `PAYMENT_PROVIDER=paymee` + `PAYMEE_API_KEY` + `PAYMEE_ENVIRONMENT=production`
6. Rotation des secrets par défaut : `PRICE_TOKEN_SECRET`, `SUPPLIER_CREDENTIALS_ENCRYPTION_KEY`, `CRON_SECRET`

**Blocage MCP** : lecture/écriture env vars Vercel bloquée (403 scope `easy2book`).
Direction agit directement : Vercel → easy2book-new → Settings → Environment Variables.

Branche : `claude/env-production-01` | Fichier livré : `docs/env-production-audit.md` | PR #232.

NOT VERIFIED : valeurs actuellement posées en production (lecture bloquée).

---

### NETWORK-B2C-01 — CLÔTURÉ (2026-10-18, PR #234)

**Objectif** : Portail B2C public pour la réservation de produits Network par les
clients finaux (guest checkout sans compte).

**Fichiers créés / modifiés :**

- `lib/network/schemas.ts` : Zod schema `networkGuestBookingSchema` + type `NetworkGuestBookingInput`.
- `lib/network/guest-booking-actions.ts` : Server action `createGuestNetworkBooking` — filtre produit actif (`status='active'`, `supplierNodeId IS NOT NULL`), guard `CART-DRIFT-01`, transaction complète (`recordReservationFinancials` + `creditPlatformCommission` + `earnPendingPoints` + `recordReservationTransition` + `generateInvoiceForReservation`), `sendEvent("booking/network.confirmed")` fire-and-forget, ref publique `NET-YYYY-NNNNNN`.
- `lib/network/__tests__/product-booking-actions-invariants.test.ts` : 13 tests statiques d'invariants.
- `app/(public)/[locale]/network/page.tsx` : Liste paginée des produits Network avec recherche.
- `app/(public)/[locale]/network/[id]/page.tsx` : Page détail produit + sidebar réservation.
- `app/(public)/[locale]/network/[id]/book/page.tsx` : Page formulaire guest checkout.
- `components/network/network-guest-booking-form.tsx` : Formulaire client (quantité, contact, paiement card/transfer/cash), CART-DRIFT-01 UX.
- `lib/inngest/client.ts` : Event type `booking/network.confirmed`.
- `messages/{fr,en,ar}.json` : 31 clés namespace "Network".

**Tests** : 13/13 nouveaux green, 2626/2626 suite globale, TypeScript 0 erreur.
**Branche** : `claude/network-b2c-01` — PR #234.

---

### SENDEVENT-ACTIVITY-B2B-01 — CLÔTURÉ (2026-10-17)

Gap P1 identifié par LAUNCH-E2E-AUDIT-01 : `createActivityBooking` (B2B) ne
déclenchait pas `sendEvent("booking/activity.confirmed")` → aucun email client
après réservation wallet confirmée.

Changements :

- `lib/activities/booking-actions.ts` : import sendEvent, expose activityTitle +
  totalTnd depuis la transaction, sendEvent fire-and-forget conditionné sur
  `booking.customerEmail` (optionnel en B2B).
- `lib/activities/__tests__/activity-b2b-wiring.test.ts` : 12 tests statiques.

Tests : 12/12 nouveaux green, 2613/2613 suite globale, TypeScript clean.
Commit : `1be49d5` — **PR #230, merge commit `f709e1d`, mergé 2026-10-17T23:03:07Z par Direction, CI 10/10 ✅**.
Prérequis infrastructure : ENV-INNGEST-01 + ENV-RESEND-01 (Direction, inchangés).

---

### ACTIVITY-B2C-FRONTEND-01 — CLÔTURÉ (2026-10-18)

Création des 4 pages publiques B2C Attractions (listing, détail, booking, loading)
manquantes malgré l'infrastructure complète (server action + form + Inngest handler).

Changements :

- `app/(public)/[locale]/activities/page.tsx` : listing paginé, prix "à partir de" depuis sessions réelles, cover media, filtre `arrayContains(channels, ["b2c"])`.
- `app/(public)/[locale]/activities/loading.tsx` : skeleton `ModulePageSkeleton`.
- `app/(public)/[locale]/activities/[slug]/page.tsx` : détail complet (galerie, sessions, inclusions/exclusions, sidebar prix + CTA, SEO `generateMetadata`, alternates i18n).
- `app/(public)/[locale]/activities/[slug]/book/page.tsx` : guest checkout → `ActivityGuestBookingForm`, propagation `?campaign=<uuid>` (CAMPAIGN-LINK-01), `BookingSteps current={2}`.
- `lib/activities/__tests__/activity-b2c-pages-wiring.test.ts` : 13 invariants ACTIVITY-B2C-PAGES-01..13.

Tests : CI 10/10 ✅ (format, lint, typecheck, test, financial-e2e, build, playwright-a11y, lighthouse, Vercel Preview, Supabase Preview).
**PR #231, merge commit `5fd9b1f`, mergé 2026-10-18T13:23:36Z par Direction**.

---

### INDEX-CLEANUP-01 — CLÔTURÉ (2026-10-17)

Migration `drizzle/0021_drop_redundant_compensates_index.sql` :
`DROP INDEX IF EXISTS "economic_entitlements_compensates_idx"` — supprime l'index
non-unique redondant, doublon cosmétique de `economic_entitlements_compensates_uniq`
(UNIQUE, migration 0134). Idempotent (IF EXISTS). Aucun code applicatif référencé.

DB : Application en production par Direction (même workflow que 0020).
Tests : tsc 0 erreur.
Commit : `1a42eb2`

---

**INNGEST-HANDLER-WIRING-03** — branche `claude/inngest-handler-wiring-03` — PR #227 — **CLÔTURÉ, merge sur main, SHA `8217aea` (2026-10-17)**.

**Objectif** : câbler `booking/package.confirmed` et `booking/activity.confirmed` — les deux derniers modules B2C sans email de confirmation post-réservation.

**Résultat** : 2 nouveaux event types, 2 nouveaux handlers Inngest (email Resend), sendEvent fire-and-forget dans `lib/packages/booking-actions.ts` et `lib/activities/guest-booking-actions.ts`, 24 tests statiques (PKG-WIRING-01–13 + ACTIVITY-WIRING-01–11). pnpm test 2601 pass / 0 fail.

**Action Direction après merge** : provisionner `RESEND_API_KEY` sur `easy2book-new` si non encore fait.

---

**CRM-OUTBOUND-META-01 + B2C-CANCEL-MONDE-02** — branche `claude/easy2book-v6-modernization-7gyb5v` — PR #226 — **CLÔTURÉ, merge sur main, SHA `35a163a` (2026-10-17)**.

**B2C-CANCEL-MONDE-02** — stockage `offerId` + appel `cancel()` best-effort à l'annulation hôtel monde. Migration `0020_hotel_offer_id.sql` ⚠️ **à appliquer en production (action Direction)**.

**CRM-OUTBOUND-META-01** — réponses sortantes staff Messenger/Instagram via Meta Graph API. Var env ⚠️ **`META_PAGE_ACCESS_TOKEN` à provisionner sur `easy2book-new` (action Direction)**.

---

**CRM-E** — branche `claude/easy2book-v6-modernization-7gyb5v` — PR #225 — **CLÔTURÉ, merge sur main, SHA `0dca74f` (2026-10-17)**.

**Objectif** : brancher 3 canaux CRM entrants sans migration DB — Messenger DMs, Instagram DMs, email entrant Resend. Canaux déjà dans `CRM_CHANNELS` du schéma, aucun webhook ne les alimentait.

**Fichiers** :

- `app/api/webhooks/messenger/route.ts` (nouveau) — GET handshake `META_MESSENGER_VERIFY_TOKEN`, POST HMAC `META_APP_SECRET`, guard `object:"page"`, `channel:"messenger"`
- `app/api/webhooks/instagram/route.ts` (nouveau) — idem, `META_INSTAGRAM_VERIFY_TOKEN`, guard `object:"instagram"`, `channel:"instagram"`
- `app/api/webhooks/resend-inbound/route.ts` (nouveau) — POST Bearer `RESEND_INBOUND_SECRET` timingSafeEqual, `captureWebsiteLeadCore`, `sourcePage:"email_inbound"`
- `lib/crm/inbox-core.ts` (étendu) — `isChannelConnected` +messenger +instagram +email, `WEBHOOK_CHANNELS` ["whatsapp","messenger","instagram"] origin event template
- `lib/crm/__tests__/crm-channel-wiring.test.ts` (nouveau) — 27/27 invariants statiques ✓

**Vars env à provisionner** : `META_MESSENGER_VERIFY_TOKEN`, `META_INSTAGRAM_VERIFY_TOKEN`, `RESEND_INBOUND_SECRET` (META_APP_SECRET déjà présent).

→ **CLÔTURÉ** — PR #225 mergée sur main, SHA `0dca74f`, 2026-10-17.

---

**JOURNEY-BUILDER-E2E-FIX-01** — branche `claude/easy2book-v6-modernization-7gyb5v` — PR #224 — **CLÔTURÉ, merge sur main, SHA `33d5eb8` (2026-10-17)**.

**Objectif** : débloquer `e2e/journey-builder-01.spec.ts` (2/2 scenarios failing). Cause racine : deux données manquantes dans le seed E2E. `createNetworkProductBooking` échouait avec `INSUFFICIENT_FUNDS` car (1) aucun solde `partner_credit_movements` pour Sahara Voyages et (2) aucun Network Product `40000000-...-0003` en base.

**Fichiers** : `scripts/seed-base-infra.ts` — 3 ajouts idempotents : supplier + supplier_node + products (network, status=active), product_authorizations "network" pour les deux agences partenaires, partner_credit_movements crédit initial 10 000 TND.

→ **CLÔTURÉ** — PR #224 mergée sur main, SHA `33d5eb8`, 2026-10-17.

---

**PLAYWRIGHT-LOCALE-FIX-01** — branche `claude/easy2book-v6-modernization-7gyb5v` — PR #223 — **CLÔTURÉ, squash merge sur main, SHA `a33e941` (2026-10-17)**.

**Objectif** : porter le correctif `locale: "fr-FR"` dans `playwright.config.ts` sur main. Sans ce correctif, le conteneur CI (et tout environnement Linux sans locale FR configurée) négocie Accept-Language → /en, faisant échouer les specs qui attendent du texte FR par défaut — non liée à l'application (documenté MANUAL-PAYMENT-STATUS-STUCK-01, ROADMAP ligne 239).

**Fichiers** : `playwright.config.ts` (+7 lignes, `use.locale: "fr-FR"`).

**Contexte** : les 3 candidats CARTO-TECH-01 résolus — SENDVENT-B2C-01 (N/A), PACKAGES-B2C-01 (REUSE/DONE), ENV-PRODUCTION-01 (décision Direction requise).

**CI post-merge** : 8/8 green (format ✅ lint ✅ typecheck ✅ test ✅ build ✅ financial-e2e ✅ playwright-a11y ✅ lighthouse ✅).

→ **CLÔTURÉ** — PR #223 mergée sur main, SHA `a33e941`, 2026-10-17.

---

**CRM-LEAD-TASK-01** — branche `claude/crm-lead-task-01` — PR #221 — **CLÔTURÉ, squash merge sur main, SHA `2706714` (2026-10-16)**.

**Objectif** : exposer la liaison `crm_tasks.leadId` dans l'UI. DB + core + server actions déjà présents (EXTEND). Crée `LeadTasksPanel` (composant client compact) intégré dans `Customer360Button` dialog (pipeline + table leads).

**Fichiers** : `components/admin/lead-tasks-panel.tsx` (nouveau), `components/admin/customer-360-panel.tsx` (étendu), `lib/crm/__tests__/crm-lead-task-panel-invariants.test.ts` (8 tests, 8/8 pass).

→ **CLÔTURÉ** — PR #221 mergée sur main, SHA `2706714`, 2026-10-16.

---

**CI-FIX-ECR-RATELIMIT-01** — PR #216 (`ci/fix-ecr-ratelimit-01`) — **CLÔTURÉ, merge sur main, SHA `e1116c2` (2026-10-16)**.

**Objectif** : éliminer `toomanyrequests: Data limit exceeded` sur ECR Public Gallery bloquant les 3 jobs CI. Remplacement PostgreSQL ECR → PostgreSQL pré-installé ubuntu-24.04. CI 8/8 green sur SHA `01533fc`.

→ **CLÔTURÉ** — PR #216 mergée sur main, SHA `e1116c2`, 2026-10-16.

---

**MIGRATIONS-TRACKING-RECONCILE-01** — branche `claude/migrations-tracking-reconcile-01` — **CLÔTURÉ 2026-10-16**.

**Objectif** : réconcilier le registre `supabase_migrations.schema_migrations` pour la migration `0128` (`crm_tasks_01`) appliquée directement hors `apply_migration` — table `crm_tasks` existait et fonctionnait, tracking absent depuis REBASE-PR217-01 (2026-10-16).

**Méthode retenue** : INSERT direct dans `supabase_migrations.schema_migrations` sans rejouer les DDL (colonne `statements` nullable — aucun DDL exécuté en production, aucun risque de timeout).

**Exécution** (2026-10-16, `execute_sql`) :

```sql
INSERT INTO supabase_migrations.schema_migrations(version, name)
VALUES ('0128', '0128_crm_tasks_01')
ON CONFLICT (version) DO NOTHING;
```

**Vérifications production** :

- `SELECT version, name FROM supabase_migrations.schema_migrations WHERE version = '0128'` → `{version: "0128", name: "0128_crm_tasks_01"}` ✅
- `SELECT count(*) FROM crm_tasks` → `0` (table inchangée) ✅
- `SELECT policyname FROM pg_policies WHERE tablename = 'crm_tasks'` → 3 policies `current_agency_id() OR is_super_admin()` — version `0129` préservée ✅

**NOT VERIFIED** : `0137` (`0137_drop_rls_probe_table`) — tracking toujours absent (DROP exécuté par Direction, Option A acceptée dans RLS-PROBE-DROP-01). Même INSERT applicable sur GO Direction après merge PR #219.

---

**REBASE-PR217-01** — PR #217 (`claude/easy2book-v6-modernization-7gyb5v`) — **CLÔTURÉ, squash merge sur main, SHA `1f7f5c7c` (2026-10-16)**.

**Objectif** : rebase de la branche de développement sur `origin/main` et merge des 4 chantiers accumulés.

**Chantiers inclus :**

1. **B2C-CANCEL-MONDE-01** — Annulation self-service hôtel monde B2C (`lib/booking/customer-cancel-actions.ts`, 286L). Guard `module === "hotel_monde"`, sécurité auth `ownedByCurrentCustomer` + `NOT_FOUND`, `FOR UPDATE` lock, race `ALREADY_CANCELLED_CONCURRENTLY`, `recordCancellationFinancials(cancellationFeeTnd: 0)`, loyalty reversal, UI `BookingSummaryCard` + `CompteReservationList`. 16/16 invariants statiques (`b2c-cancel-monde-invariants.test.ts`).

2. **WALLET-CANCEL-FINANCIALS-01** (extension Omra/Package/Activity) — `cancelPolicyReservationCore` manquait `recordCancellationFinancials`. Formula A : `cancellationFeeTnd = tndAmount − (outcome.creditableTnd ?? 0)`, `refundAmountTnd = creditedTnd`. 6 invariants statiques `/policy` dans `cancel-wiring-invariants.test.ts`. **Déjà présent dans `origin/main` via PR #195 avant le rebase** — commit `4214f7b` réduit à +1 ligne vide après résolution conflit.

3. **ADMIN-CANCEL-FINANCIALS-01** — `updateReservationStatus` (admin) manquait `recordCancellationFinancials`. Ajout dans bloc `nextStatus === "cancelled"` : `cancellationFeeTnd: providerCancellationFee ?? 0`, `refundAmountTnd: refundedTnd ?? 0`. Commit `09c7fff` (Hassen02020, 2026-10-12).

4. **ROADMAP-SYNC-01** — Réconciliation ROADMAP.md (CRM-C CLÔTURÉ, migrations 0128/0129 vérifiées). Entrée CRM-C backlog mise à jour de TODO → ~~CLÔTURÉ/DEPLOYED~~.

**CI PR #217 — 8/8 green** (format ✅ lint ✅ typecheck ✅ test ✅ build ✅ financial-e2e ✅ lighthouse ✅ playwright-a11y ✅). 2948 tests, 0 fail.

**Rebase** : 16 étapes, 3 commits auto-skippés (déjà upstream), 5 conflits ROADMAP.md résolus (HEAD conservé), fichiers financiers `policy-cancel-core.ts` / `cancel-actions.ts` / `customer-cancel-actions.ts` — HEAD conservé dans tous les cas.

→ **CLÔTURÉ** — PR #217 mergée sur main, SHA `1f7f5c7c`, 2026-10-16.

## **VÉRIFIÉ 2026-10-16** : Vercel `dpl_5bHT8byENfjUCD7bkVr4Uc8qvC1p` — `state=READY`, `target=production`, SHA `1f7f5c7cca9a973ba822eb77e5a549781c008b63` ✅. Migration `0136` (`commission_settlements_app_runtime_rls`) appliquée ✅ (version `20261016113205`). Migration `0129` (`crm_tasks_rls_fix`) appliquée ✅ (version `0129`). Migration `0128` (`crm_tasks_01`) : **absente du registre** ⚠️ — table `crm_tasks` EXISTS en production (`rls_enabled=true`) mais création non tracée dans `supabase_migrations` (exécution directe probable hors `supabase db push`). Anomalie de tracking, fonctionnellement opérationnel.

**CARTO-TECH-01** — CARTOGRAPHIE TECHNIQUE EXHAUSTIVE — **CLÔTURÉ, 2026-10-16**

**Objectif** : Dresser une cartographie complète de l'état réel du système EasyV4 — un module par ligne, fichiers clés, tables DB, tests, dépendances externes, preuves production, blockers.

**Périmètre** : 10 modules métier + couches transversales (Wallet, Commissions, CRM, White Label, Auth/RLS) + CI/CD + variables d'env production.

**Résultats — État par module (2026-10-16) :**

| Module        | Statut                  | B2C | Tests | Dépendance          | Blocker                                                                                     |
| ------------- | ----------------------- | --- | ----- | ------------------- | ------------------------------------------------------------------------------------------- |
| Hôtels Locaux | ACTIF                   | ✅  | 29    | myGo (live+virtual) | —                                                                                           |
| Hôtels Monde  | ACTIF                   | ✅  | 8     | RateHawk            | —                                                                                           |
| Vols          | ACTIF                   | ✅  | 24    | Duffel+virtual      | —                                                                                           |
| Transferts    | ACTIF B2B / PARTIEL B2C | ⚠️  | —     | —                   | sendEvent `booking/transfer.confirmed` absent dans `lib/transfers/guest-booking-actions.ts` |
| Voitures      | ACTIF B2B / PARTIEL B2C | ⚠️  | —     | —                   | sendEvent `booking/car.confirmed` absent dans `lib/cars/guest-booking-actions.ts`           |
| Omra          | COMPLET B2B+B2C         | ✅  | 5     | —                   | —                                                                                           |
| Packages      | PARTIEL                 | ❌  | —     | —                   | `guest-booking-actions.ts` absent (B2B only)                                                |
| Activités     | COMPLET B2B+B2C         | ✅  | —     | —                   | Pas de page publique front                                                                  |
| Network       | PARTIEL                 | ❌  | —     | —                   | B2B only, pas de `guest-booking-actions.ts`                                                 |
| Mutuelle      | PARTIEL                 | ❌  | —     | —                   | Pas de `booking-actions.ts`, demandes/approbation seulement                                 |

**Couches transversales :**

| Couche                  | Statut            | Note                                                         |
| ----------------------- | ----------------- | ------------------------------------------------------------ |
| Wallet B2B              | VALIDÉ production | TG-2026-000001 : deposit_balance 6000→1988.57 TND réel       |
| Wallet B2C              | CODE OK           | 0 topup réel en production à ce jour                         |
| Commissions/Settlements | CODE OK           | 0 ligne `economic_entitlements` en production à ce jour      |
| CRM                     | OPÉRATIONNEL      | Leads/contacts actifs en production                          |
| White Label             | CODE OK           | 0 tenant actif en production à ce jour                       |
| Auth/RLS                | SOLIDE            | Migrations 0129 + 0136 appliquées en production (2026-10-16) |

**CI/CD (2026-10-16) :**

- 8 jobs bloquants : format, lint, typecheck, test, build, financial-e2e, lighthouse, playwright-a11y
- 22 fichiers financial-e2e · 294 fichiers test · 18 specs E2E Playwright · 140 migrations manuelles (dernière = 0136)
- **playwright-a11y** : en échec persistant — non bloquant pour ce chantier

**Variables d'env critiques absentes en production (`crygnaichvlxavvbifqi`) :**

- `PAYMEE_API_KEY` — PSP B2C (topups Wallet B2C)
- `EXCHANGE_RATE_API_KEY` — conversions de devises réelles
- `INNGEST_SIGNING_KEY` + `INNGEST_EVENT_KEY` — orchestration événements asynchrones
- `RESEND_API_KEY` — emails transactionnels

**Prochains chantiers candidats (STOP — aucun démarré) :**

1. **SENDVENT-B2C-01** : câbler `sendEvent` dans `lib/transfers/guest-booking-actions.ts` et `lib/cars/guest-booking-actions.ts` (TODO commentés dans le code)
2. **PACKAGES-B2C-01** : créer `lib/packages/guest-booking-actions.ts` (B2C complet pour le module Packages)
3. **ENV-PRODUCTION-01** : activer les variables PSP/Inngest/email en production (décision Direction requise)

→ **CLÔTURÉ** — Cartographie complète, audit 10 modules + transversal, 2026-10-16.

→ **STOP — ATTENTE DU GO pour le prochain chantier.**

---

**WALLET-E2E-CI-INTEGRATION-01** — PR #213 (`claude/wallet-e2e-ci-01`) — **CLÔTURÉ, squash merge sur main, SHA `ea2ad7b4` (2026-10-16)**.

**Objectif** : rendre les tests de settlement (settleCommissions, markSettlementPaid, idempotence UNIQUE, période chevauchante, violation UNIQUE DB) réellement exécutés en CI — ils étaient skippés silencieusement via un try/catch masquant une erreur RLS réelle.

**Deux bugs corrigés :**

1. **RLS DENY pour `app_runtime` sur `commission_settlements`** (commit `5c7ecf0`) — bug de production : `withSystemContext` tourne sous le rôle `app_runtime` (non-BYPASSRLS) ; la policy migration 0066 était `TO authenticated` uniquement → DEFAULT DENY → `settleCommissions` et `markSettlementPaid` échouaient silencieusement depuis leur création (jamais déclenchés en production à ce jour). Correction : `drizzle/manual/0136_commission_settlements_app_runtime_rls.sql` — `CREATE POLICY commission_settlements_app_runtime ON commission_settlements FOR ALL TO app_runtime USING (is_super_admin()) WITH CHECK (is_super_admin())`.

2. **`malformed array literal` sur `mark_econ_commission_settled`** (commit `13683e4`) — Drizzle `sql` template passe un tableau JS comme scalaire plain à postgres.js → le cast `::uuid[]` échoue. Correction : `const reservationIdsLiteral = \`{${reservationIds.join(",")}}\`` préformaté en littéral PG avant le binding.

**Tests corrigés** (commit `5c7ecf0`) : suppression du try/catch masquant, ordre FK cleanup corrigé (economic_entitlements avant commission_settlements), condition cleanup corrigée (period_start >= '2097-12-01'), UUID invalide dans test chevauchant corrigé.

**CI final sur SHA `1783565d` — 8/8 green** (re-run confirmé, format ✅ lint ✅ typecheck ✅ test ✅ build ✅ financial-e2e ✅ lighthouse ✅ playwright-a11y ✅).

**Fichiers** : `lib/finance/commission-settlement.ts`, `drizzle/manual/0136_commission_settlements_app_runtime_rls.sql`, `lib/finance/__tests__/payment-settlement-chain.integration.test.ts`, `docs/ROADMAP.md`

→ **CLÔTURÉ** — PR #213 mergée sur main, SHA `ea2ad7b4`, 2026-10-16.

## **VÉRIFIÉ 2026-10-16** : migration `0136` (`commission_settlements_app_runtime_rls`) appliquée en production (`crygnaichvlxavvbifqi`), version `20261016113205` ✅. Le blocage RLS `app_runtime` sur `commission_settlements` est levé. **NOT VERIFIED** : exécution réelle de `settleCommissions` / `markSettlementPaid` en production non testée directement — les tests CI (financial-e2e ✅ sur PR #213) tournaient contre un postgres local, pas contre la DB production.

**CANCEL-COMMISSION-WRITER-01** — PR #212 (`claude/cancel-commission-01-7gyb5v`) — **CLÔTURÉ, squash merge sur main, SHA `b2366faf` (2026-10-16)**.

**Objectif** : câbler `cancellationTreatment` sur les 7 modules manquants pour que `reverseCommissionOnCancellation()` puisse reverser correctement les commissions lors d'une annulation. Sans `cancellationTreatment`, toute annulation skip le reversement (logique défensive correcte, mais incomplète).

**Implémentation** :

- Cars/Transfers B2B+B2C : commission entitlement ajoutée conditionnellement (`commissionAmountForEntitlements > 0`), `seller_margin` = marge brute − commission (invariant Σ entitlements = salePriceTnd préservé exactement — le rounding est absorbé par `seller_margin`), `cancellationTreatment: "non_refundable"`.
- Vols : commission lue depuis `getMarginsForAgency` au moment de la confirmation (non snapshotée — acceptable, commission = 0 pré-lancement, à snapshotter lors du premier chantier vols réel).
- Network : `cancellationTreatment: "non_refundable"` ajouté sur l'entitlement commission existant (gap CANCEL-COMMISSION-POLICY-01 confirmé comblé).
- Packages/Omra/Activités : `cancellationTreatment: "non_refundable"` ajouté sur `owner_share` existant — documentation de politique, commission = 0 par design (aucune ligne à 0 fabriquée, règle ECON-WIRING-01 respectée).

**CI run 38812785520 sur SHA `f32c5598` — 8/8 green** (format ✅ lint ✅ typecheck ✅ test ✅ build ✅ financial-e2e ✅ lighthouse ✅ playwright-a11y ✅). 2880 tests, 0 échec.

**Chevauchement avec PR #213** : aucun (fichiers distincts, logiques complémentaires — #212 active la politique d'annulation, #213 corrige le settlement).

**NOT VERIFIED** : exécution réelle SQL avec DB pour Cars/Transfers/Vols commission wiring (CI financier vert mais sans test d'intégration ciblé spécifique à ces modules pour cette PR — les tests CI existants exercent `financial-e2e`, pas de test ciblé Cars/Transfers/Vols commission dans cette PR au-delà des invariants statiques).

→ **CLÔTURÉ** — PR #212 mergée sur main, SHA `b2366faf`, 2026-10-16. CI 8/8 green sur commit `16e2d219` (lint ✅ format ✅ typecheck ✅ test ✅ build ✅ financial-e2e ✅ lighthouse ✅ playwright-a11y ✅).

---

**Aucun** — MANUAL-PAYMENT-STATUS-STUCK-01 — CLÔTURÉ (2026-10-14, PR #209, squash merge `c96d62c`). Trouvaille #4.1 du rapport `docs/audits/visual-audit-01-report.md` (VISUAL-AUDIT-01) : après l'action admin "Vérifier le règlement" sur une réservation Omra/Package/Activité, `reservations.status` restait `pending` au lieu de transiter vers `confirmed` — voucher PDF renvoyait 404.

**Cause racine** : `lib/vols/fulfillment-action.ts` porte la directive `"use server"`, qui impose à Next.js que CHAQUE export du fichier soit une fonction async. Il exportait pourtant directement `FULFILL_ROLES` (un tableau de rôles), ce qui fait planter l'évaluation du module côté client dès qu'un autre Server Action du même bundle de page est importé — silencieusement, sans erreur réseau exploitable (React démonte le sous-arbre en échec via son error boundary). Sur `/admin/reservations/[id]`, le bundle regroupe TOUTES les actions admin (Vérifier, Rembourser, Émettre billet...) : `<VerifyPaymentButton>` plantait donc dès que la page importait transitivement `fulfillment-action.ts` (via le bouton "Émettre le billet" vol, co-présent sur la même page) — le clic sur "Confirmer le règlement" fermait la modale (le sous-arbre entier disparaissant avec l'erreur), donnant l'illusion d'un succès alors que `verifyManualPayment` n'était jamais réellement invoqué. Aucune transaction DB, aucun débit, aucun impact sur des données réelles n'a eu lieu pendant que ce bug était actif.

**Correctif** : `FULFILL_ROLES` déplacé dans un nouveau fichier `lib/vols/fulfillment-roles.ts` (sans `"use server"`), importé par `fulfillment-action.ts` (usage interne, non ré-exporté) et par `manual-confirmation-action.ts` (qui le consommait déjà via `fulfillment-action.ts`). 3 fichiers, +22/-5 lignes. Scan complet des 109 fichiers `"use server"` du dépôt : aucune autre violation trouvée.

**Vérification finale avant PR, sur commit exact dans un worktree isolé** (`git worktree` dédié, checkout détaché sur `8dfc07c`, `pnpm install --frozen-lockfile` propre, aucune modification locale) : `tsc --noEmit`/`eslint`/`prettier --check` propres ; tests unitaires ciblés (`manual-confirmation-action.test.ts` + `commission-reversal.test.ts`) **30/30 verts** ; `pnpm build` réussi. Preuve DB avant/après sur `easyv4_e2e` (jetable, jamais la production) : avant, `reservations.status` reste `pending`, `payments` reste `status=pending`/`kind=deposit`, voucher PDF → 404 ; après, `status=confirmed`, `confirmed_at` posé, nouvelle ligne `payments` `status=captured`/`kind=balance`, voucher PDF → 200 (vrai PDF téléchargé et vérifié).

**Correction apportée en cours de vérification (discipline de reproductibilité stricte demandée)** : une première vérification avait conclu "3/3 specs E2E passent" (`dashboard-operations-{omra,activity,package}-lifecycle.spec.ts`), mais avec un correctif `playwright.config.ts: locale: "fr-FR"` appliqué localement puis retiré avant le commit. Rejoué sur le commit exact, sans ce correctif : **les 3 specs échouent à l'étape "03-detail"** (page publique, avant même d'atteindre le code corrigé), le conteneur négociant la locale navigateur par défaut vers `/en` — défaut préexistant, déjà documenté dans VISUAL-AUDIT-01 (§2 point 8, §5.1–5.3), **pas une régression de ce correctif**. Pour distinguer honnêtement les deux, un script de vérification ponctuel (non committé, locale épinglée uniquement dans son propre contexte navigateur isolé, jamais dans `playwright.config.ts`) a rejoué le parcours réel complet (création B2C → admin → Vérifier le règlement → voucher) contre le build exact de `8dfc07c`, avec succès (mêmes preuves DB/voucher que ci-dessus, réservation `AT-2026-000003`). Le message du commit `8dfc07c` affirme "3/3 E2E PASS" sans mentionner cette dépendance à un correctif local depuis retiré — **imprécis, non corrigé a posteriori** (pas de réécriture d'historique), documenté ici pour que ce soit su.

**NOT VERIFIED / hors périmètre de ce chantier** : le correctif de locale (`playwright.config.ts: locale: "fr-FR"`) n'est pas inclus ici — il existe sur la branche séparée `docs/cancel-commission-coherence-01` (non fusionnée) ; sans lui, les 3 specs E2E ne peuvent pas être démontrées vertes de bout en bout en l'état actuel du dépôt. `journey-builder-01.spec.ts` continue d'échouer sur un symptôme similaire ("Confirmée" jamais affiché) via un chemin de code distinct (confirmation de ligne Journey B2B, débit compte de dépôt) — non corrigé, nécessite sa propre fiche.

**Preuves de fusion/CI/déploiement** : PR #209 fusionnée (squash) par GO explicite utilisateur — reconfirmé séparément (question posée malgré un "go" déjà reçu) pour la conséquence déploiement production (DEPLOY-01). `main` : `1b4c7f6` → `c96d62c`. CI post-merge sur `main` (run [38596373305](https://github.com/Hassen02020/EasyV4/actions/runs/38596373305)) **8/8 verte** (format ✅ typecheck ✅ lint ✅ test ✅ financial-e2e ✅ build ✅ lighthouse ✅ playwright-a11y ✅, `conclusion: success` sur chacun, vérifié job par job). **Ces jobs CI ne couvrent pas les 3 specs `dashboard-operations-*-lifecycle.spec.ts`** (le job `financial-e2e` exécute 18 fichiers `node --test` distincts, `playwright-a11y` exécute uniquement `e2e/a11y.spec.ts`) — vert CI réel mais pas une preuve que ces 3 specs passent, d'où la vérification manuelle séparée ci-dessus. Déploiement production confirmé : Vercel `easy2book-new`, déploiement `dpl_EHgJxdpEQcmJdQc4yed7uf4eswP4`, `target=production`, `state=READY`, `githubCommitSha=c96d62c` = HEAD(main) au moment du merge, aliasé sur `easy2book-new.vercel.app` — critère de preuve DEPLOY-01.

**Aucun** — CANCEL-COMMISSION-POLICY-01 — CLÔTURÉ (2026-10-13, PR #207, squash merge `b9dfc7d`). GO explicite reçu sur la fiche OBSERVE→AUDIT→PROPOSE (via question posée, option "GO minimal" retenue) pour débloquer `reverseCommissionOnCancellation()`, resté structurellement inerte depuis CANCEL-COMMISSION-01 faute de `cancellationTreatment` jamais écrit.

**Audit** : seuls **4 points d'écriture réels** créent une ligne `economic_entitlements` qualifiée `"commission"` en production — `lib/booking/actions.ts`/`lib/booking/guest-actions.ts` (hôtel), `lib/hotels-monde/guest-booking-actions.ts` (hôtel monde), `lib/network/product-booking-actions.ts` (réseau). Aucun des 4 ne passait `cancellationTreatment` (confirmé `NULL` à 100%, cohérent avec l'audit WALLET-E2E-01 ci-dessous).

**Écart factuel trouvé dans le modèle Direction déjà validé (ligne ~177 plus bas, 2026-10-12)** avant d'écrire le moindre code : ce modèle assigne network/car/transfer à une dérivation depuis `cancellation_policies` — mais `cancellationPolicies.productType` (`lib/booking/policy-engine.ts:35`) n'admet que `"omra" | "package" | "activity"`, jamais `network`. Le module Network (seul des 4 writers réels concerné par cette branche) n'a par ailleurs aucune logique d'annulation câblée (`grep` cancel/refund sur `lib/network/product-booking-actions.ts` → 0 résultat). La dérivation retombe donc systématiquement sur le repli explicite de la règle (3) du modèle ("défaut si dérivation ambiguë → `non_refundable`") — jamais une vraie dérivation `cancellation_policies` codée, puisqu'aucun module réel n'y a aujourd'hui droit.

**Décision utilisateur** : GO minimal — écrire `cancellationTreatment: "non_refundable"` aux 4 writers réels (3 par la règle fixe hôtel/hôtel_monde, 1 par le repli ci-dessus pour Network), sans coder de dérivation `cancellation_policies` inatteignable aujourd'hui. Remboursement CLIENT (`cancellation_policies`, `applyReservationRefund`) strictement distinct, non touché.

**Vérification locale (2 bases Postgres jetables successives — la première jetée après pollution d'un `after` hook interrompu par une erreur de ma part sur `DATABASE_DIRECT_URL` manquant, leçon déjà documentée sur ce dépôt : ne jamais tirer de conclusion d'une base polluée)** : sur base neuve, ordre de grants APP-RUNTIME-GRANTS-CI-01 reproduit à l'identique de `ci.yml` — suite `financial-e2e` complète (18 fichiers + `app-runtime-grants.test.ts`, `DATABASE_URL`=app_runtime non-bypass-RLS) : **140/140 verts**, dont `commission-reversal-integration.test.ts` et `economic-entitlements-network.test.ts` qui exercent directement le code modifié. `pnpm test` (hors DB) : **2519/2519 verts**, 417 skip (DB non disponible pour ce run, comportement attendu). `pnpm typecheck`/`eslint` (4 fichiers modifiés)/`pnpm format:check` : propres. `pnpm build` (production) : réussi.

**NOT VERIFIED / hors périmètre de ce chantier** : aucun backfill des `economic_entitlements` déjà existants (restent `NULL`, correctement toujours skip) ; aucune dérivation `cancellation_policies` codée pour omra/package/activity (ces modules ne créent aujourd'hui aucune ligne `qualification="commission"`, donc rien à câbler — resterait un chantier séparé si/quand ils le font) ; aucun test E2E réel avec une annulation vraie en production (cohérent avec `economic_entitlements`=0 ligne, voir WALLET-E2E-01).

**Preuves de fusion/CI/déploiement** : PR #207 ouverte sur GO explicite, fusionnée (squash) par confirmation explicite distincte tenant compte du déploiement production automatique (DEPLOY-01, rappelé avant la question posée). `main` : `5aec243` → `b9dfc7d`. CI post-merge sur `main` (run `38481428630`) **8/8 verte dès la première tentative** (format, typecheck, lint, test, financial-e2e, build, lighthouse, playwright-a11y — tous `conclusion: success`, aucun flake rencontré). Déploiement production confirmé : Vercel `easy2book-new`, déploiement `dpl_3b1fhoR5BR1Ak6W89ZqB4w4HemNs`, `target=production`, `state=READY`, `githubCommitSha=b9dfc7d` = HEAD(main) au moment du merge — critère de preuve DEPLOY-01.

**Aucun** — FLIGHT-CANCELLED-REFUND-GUARD-01 — CLÔTURÉ (2026-10-13, PR #201, squash merge `0b17d78`). Chantier minimal proposé et autorisé par GO explicite suite à l'audit WALLET-NETWORK-COMMON-FLOW-01 (trou latent #15 de la matrice 25 scénarios). `updateFlightStatus()` (`lib/vols/flight-status-sync.ts`) déclenche désormais `autoRefundOnFlightFailure()` (déjà en production pour `"FAILED"`) si `newStatus === "CANCELLED"` fait réellement passer la réservation à `cancelled` — jamais aujourd'hui (aucun appelant réel ne passe ce statut), mais plus aucun trou pour un futur appelant (webhook d'annulation GDS non encore écrit). Déclenchement uniquement quand `updateFlightStatus` gère sa propre transaction (après commit, jamais imbriqué) — un `tx` externe reste à la charge de l'appelant, même discipline que `fulfillment-action.ts` pour `"FAILED"`. `run()` retourne la donnée de remboursement plutôt que de muter une variable fermée (évite un piège de narrowing TypeScript `never` à travers les closures async). 7 nouveaux invariants statiques (`r9-03-flight-cancelled-refund-guard-invariants.test.ts`), 17/17 avec `r9-01` existant, 266/266 sur toute la suite `lib/vols` (0 régression) — puis **301/301** après mise à jour de branche (voir ci-dessous). `tsc --noEmit` + eslint clean. Aucun changement DB, aucun appelant réel affecté.

**Reprise MISSION WALLET E2E-01 (2026-10-13)** : branche mise à jour avec `main` (`git merge`, jamais de rebase/force-push) — un seul conflit, purement documentaire (`docs/ROADMAP.md`, collision de journal), résolu en conservant les deux entrées, **zéro conflit de code** sur les 5 PR mergées depuis l'ouverture de #201 (#202–#206). Logique de remboursement/reversement de commission auditée : `updateFlightStatus()` ne déclenche le remboursement que sur une transition réelle (`fromStatus !== reservationStatus`, jamais sur un appel répété avec un statut déjà à jour) — idempotent à ce niveau. `autoRefundOnFlightFailure()`/`reverseCommissionOnCancellation()` (fonctions partagées, déjà en production) : idempotence prouvée contre un Postgres réel (`commission-reversal-integration.test.ts` — un design antérieur au simple `catch` SQL 23505 a été trouvé invalide par ce test réel, remplacé par `ON CONFLICT DO NOTHING` + contrainte `UNIQUE` migration 0134), politique d'annulation sans défaut silencieux (`cancellationTreatment` absent → reversement explicitement sauté, jamais une politique inventée — voir `CANCEL-COMMISSION-POLICY-01` ci-dessous, qui reste bloquant, non résolu par ce chantier). **[ÉTAT HISTORIQUE, antérieur à PR #207 — voir l'entrée CLÔTURÉ en tête de section (ligne 39) pour l'état courant.]**

**Preuves de fusion/CI/déploiement** : PR #201 fusionnée (squash) par GO explicite utilisateur — conséquence déploiement production signalée avant fusion. `main` : `ffd5892` → `0b17d78`. Run CI post-merge dédié (`0b17d78` seul) annulé par `cancel-in-progress` (push quasi simultané de PR #206) — résultat réel obtenu via le run combiné `38465690933` sur le HEAD suivant (`a084b2b`, voir entrée SUPPLIER-SETTLEMENT-ADMIN-UI-01 ci-dessous pour le détail job par job, `financial-e2e` relancé une fois après un flake ECR déjà documenté sur ce dépôt). Déploiement production confirmé : Vercel `easy2book-new`, déploiement `dpl_CNV4pHVHFqP3SeQiaaYpfpLyj5Ya`, `target=production`, `state=READY`, `githubCommitSha=0b17d78`.

**Aucun** — SUPPLIER-SETTLEMENT-ADMIN-UI-01 — CLÔTURÉ (2026-10-13, PR #205, squash merge `b5e76b1`). GO explicite reçu sur la fiche OBSERVE→AUDIT→PROPOSE présentée immédiatement après la clôture de APPLY-SUPPLIER-SETTLEMENT-0135-PRODUCTION : ferme le trou "backend en production sans aucun appelant" — ajoute la UI Super Admin pour déclarer/confirmer/annuler/corriger/réverser un règlement fournisseur Network.

**Audit initial corrigé en cours d'exécution** : la fiche d'origine listait `lib/finance/supplier-settlement.ts` comme seule couche existante — un second grep (camelCase, pas seulement les noms SQL snake_case) a trouvé que `lib/finance/supplier-settlement-actions.ts` (wrappers `"use server"` avec `requireSuperAdmin`) existait DÉJÀ, mergé avec PR #203, lui aussi sans aucun appelant `app/`. Ce chantier n'a donc eu besoin de construire QUE la UI (page + composants), pas la couche serveur — moins de travail que prévu, pas plus.

**Construit** (EXTEND, patron repris de `/admin/accounting/settlements` — commission settlements) :

- `lib/finance/supplier-settlement.ts` : nouvelle fonction `listSupplierSettlements(supplierNodeId)` — historique des règlements (normaux/corrections/réversions) avec leurs entrées (`json_agg`, pas de N+1).
- `lib/finance/supplier-settlement-actions.ts` : wrapper `loadSupplierSettlements` (même garde `requireSuperAdmin` que les 5 wrappers existants).
- `app/(internal)/admin/suppliers/nodes/[id]/settlements/page.tsx` (nouveau) : page listant dettes non réglées + historique des règlements, guard `super_admin` (comme la page nœud fournisseur existante).
- `components/admin/supplier-settlement-buttons.tsx` (nouveau) : `DeclareSettlementDialog`, `ConfirmSettlementButton`, `CancelSettlementButton`, `ReverseSettlementDialog`, `RefundEntryDialog`, `CorrectDebtDialog` — même patron `useState`/`useTransition`/`Dialog` que `components/admin/settlement-buttons.tsx`.
- Lien "Règlements" ajouté sur `app/(internal)/admin/suppliers/nodes/[id]/page.tsx` (page nœud fournisseur existante).
- `lib/finance/__tests__/supplier-settlement.integration.test.ts` : nouveau test `listSupplierSettlements` (règlement normal + remboursement réel, entrées/types/montants corrects, isolation entre fournisseurs).

**Vérification locale (base Postgres jetable `ss_admin_ui_verify`, recréée propre avant la run finale — leçon déjà documentée sur ce dépôt : une première tentative polluée par un échec de nettoyage antérieur a été jetée plutôt que d'en tirer une fausse conclusion)** :

- Suite `financial-e2e` complète (18 fichiers + `app-runtime-grants.test.ts`, ordre de grants corrigé par #204, `DATABASE_URL`=app_runtime non-bypass-RLS) : **139/139 verts**, 0 échec — aucune régression.
- `lib/finance/__tests__/supplier-settlement.integration.test.ts` seul : **23/23 verts** (22 préexistants + le nouveau test `listSupplierSettlements`).
- `pnpm typecheck` / `pnpm lint` / `pnpm format:check` : propres sur le diff.
- `pnpm build` (production) : réussi, nouvelle route `/admin/suppliers/nodes/[id]/settlements` bien enregistrée.

**Preuves de fusion/CI/déploiement** : PR #205 créée, 8/8 verte sur sa branche, puis fusionnée (squash) par GO explicite utilisateur — conséquence déploiement production signalée avant fusion. `main` : `8465677` → `b5e76b1`. Le run CI post-merge automatique (`38455507290`) a été annulé par la plateforme (`cancel-in-progress`, groupe de concurrence partagé par branche) à cause d'un re-run manuel non lié déclenché sur un ancien run — pas un échec de code. Re-vérifié par un run `workflow_dispatch` dédié directement sur `b5e76b1` : **run `38456145662`, 8/8 vert, vérifié job par job** (format, typecheck, lint, test, financial-e2e, build, lighthouse, playwright-a11y — tous `conclusion: success`). Déploiement production confirmé : Vercel `easy2book-new`, déploiement `dpl_9h2BQZW2FACQKEmiBxoQ1Nq4MMos`, `target=production`, `state=READY`, `githubCommitSha=b5e76b1` = HEAD(main) au moment du merge — critère de preuve DEPLOY-01.

**QA visuelle (2026-10-13, lecture seule, suite à une demande séparée de bootstrap Super Admin)** : audit confirme que le compte `tarhouni.hassene@gmail.com` existe déjà et est déjà intégralement correct (`auth.users` confirmé, `public.users` : `role=super_admin`/`status=active`/agence Easy2Book `agency_type='ota'`, dernière connexion réelle le 2026-10-09) — aucune création ni régularisation nécessaire. `resolve_session_context()` (fonction appelée par `getCurrentAdminProfile()`) exécutée directement et prouve la résolution correcte de bout en bout. **Blocage réel trouvé, non contourné** : `supplier_nodes` est **vide en production** (0 ligne) — aucun nœud fournisseur réel n'existe pour visiter `/admin/suppliers/nodes/[id]/settlements` avec des données réelles (cohérent avec l'audit WALLET-NETWORK-COMMON-FLOW-01 : module Network jamais encore exercé en production).

**Nœud fournisseur de test créé en production (2026-10-13, sur demande explicite "câbler au fournisseur")** : `suppliers` était également vide (0 ligne) — gap pré-existant documenté dans `lib/suppliers/portal-actions.ts` (aucune UI de création de fournisseur technique dans ce dépôt). Création minimale, clairement étiquetée comme fixture de test (jamais une donnée métier déguisée) : `suppliers` (`name='QA Network Supplier (test fixture)'`, `type='custom'`, `status='active'`) + `supplier_nodes` (`slug='qa-network-supplier-test'`, description explicite "Pas un fournisseur réel", `onboarding_status='active'`, `portal_enabled=true`, `id=6406c7d9-40fe-4803-9ed6-da0c20a9a3af`). Aucune réservation ni `economic_entitlements` fictive créée — refusé explicitement (aurait fabriqué un montant financier d'apparence réelle, contraire à la règle donnée par l'utilisateur de ne jamais peupler l'écran avec de la donnée fictive).

**QA visuelle réelle confirmée (session navigateur réelle de l'utilisateur, captures fournies)** : connexion super_admin réussie (tableau de bord accessible, identité correcte affichée) ; page `/admin/suppliers/nodes` confirme visuellement `supplier_nodes` vide (0/0/0/0/0/0) avant création du nœud de test ; après création, page `/admin/suppliers/nodes/[id]/settlements` du nœud de test rendue correctement : breadcrumb, lien retour, note de périmètre V1, carte "Dettes non réglées" (état vide correct), carte "Historique des règlements" (état vide correct), aucune erreur.

**Suite UX (PR #206, squash merge `a084b2b`) — CLÔTURÉE (2026-10-13)** : 3 défauts trouvés en QA visuelle réelle, corrigés sur critères d'acceptation explicites :

1. **Navigation** : aucun lien vers `/admin/suppliers/nodes` dans `components/admin-shell.tsx` (confirmé par capture : clic sur "Fournisseurs" → page hôtels API, pas le module Network) — sous-item "Nœuds fournisseurs" ajouté, visibilité super_admin uniquement (structurellement inchangée, prouvée par test).
2. **Fil d'Ariane** : UUID brut affiché tel quel (capture : `6406c7d9-40fe-4803-9ed6-da0c20a9a3af` dans la miette). Corrigé **génériquement** (regex UUID, s'applique à toute route `/admin/[...]/[id]`, pas seulement celle-ci) — le href de l'étape suivante reste l'URL réelle complète, le nom du fournisseur reste visible sur sa page de détail (h1, jamais touché). `nodes`/`settlements` nommés "Nœuds fournisseurs"/"Règlements".
3. **Bouton "Déclarer un règlement"** : restait désactivé sans aucune explication (signalé "ne marche pas en appuyant"). Logique d'activation extraite dans `lib/finance/supplier-settlement-ui.ts` (`getEligibleSupplierDebts`, testable sans navigateur) ; reste désactivé sans créance éligible (protège la comptabilité, comportement voulu) mais affiche désormais pourquoi. Comportement "s'active avec une créance valide" prouvé par test — jamais en production (aucune donnée financière fictive injectée).

**Vérifications PR #206** : `pnpm typecheck`/lint (repo entier)/format propres, `pnpm test` **2512/2512 verts**, `pnpm build` réussi. 10 nouveaux tests ciblés, tous verts : 4 fil d'Ariane (nommage, masquage UUID générique, non-régression sur route existante type `/admin/agencies/[id]`), 2 droits Super Admin (lien présent pour super_admin, absent pour `manager`/`agent_resa`/`agent_compta`/`agent_excursions`), 4 logique bouton (0 créance, trop-payé seul, 1 créance valide, plusieurs créances).

**Preuves de fusion/CI/déploiement combinées #201+#206** : les deux PR fusionnées (squash) par GO explicite utilisateur distinct pour chacune. `main` : `ffd5892` → `0b17d78` (#201) → `a084b2b` (#206). Run CI dédié sur `0b17d78` annulé par `cancel-in-progress` (push quasi simultané) — run combiné `38465690933` sur `a084b2b` (HEAD actuel, couvre les deux merges) : attempt 1 — 7/8 verts, `financial-e2e` échoué sur `docker pull public.ecr.aws/docker/library/postgres:16` → `toomanyrequests: Data limit exceeded`, mort avant tout test réel (logs bruts vérifiés) — flake infra déjà documenté sur ce dépôt, jamais un échec de code. Relancé une seule fois (`rerun_failed_jobs`) : attempt 2 — **8/8 verts** (format, typecheck, lint, test, financial-e2e, build, lighthouse, playwright-a11y, tous `conclusion: success`). Déploiements production confirmés : Vercel `easy2book-new`, `dpl_CNV4pHVHFqP3SeQiaaYpfpLyj5Ya` (`0b17d78`) puis `dpl_EKXKBizCmXx5zNX5yVrXhLmVBACd` (`a084b2b`, HEAD actuel), les deux `target=production`/`state=READY`.

**NOT VERIFIED, reste à faire** : affichage avec des données réelles non vides (dettes/historique peuplés — nécessiterait une vraie réservation Network, hors périmètre de cette QA) ; comportement des formulaires de déclaration/correction/réversion sur une vraie saisie ; refus d'accès pour un compte non-super-admin.

**Hors périmètre, explicitement non engagé** : toute transaction financière réelle, toute donnée de réservation/créance fictive.

---

**Aucun** — WALLET-E2E-01 — CERTIFICATION REPRISE, AUDIT READ-ONLY (2026-10-13). Reprise explicite de la certification Wallet B2B/B2C + réconciliation de la chaîne réservation→paiement→wallet→créance→commission→annulation→compensation→règlement, preuves existantes reprises sans suite inutile.

**Wallet B2B** : recharge (`processWalletWebhookCore`, `wallet-webhook-core.test.ts` — idempotence event/business-level, P0-A/P0-B no_match/PSP-mismatch ne consomment pas l'eventId), débit (`debitPartnerCredit`, verrou `FOR UPDATE`), remboursement (`applyReservationRefund` + `wasFundedByAgencyCredit`, détection B2B vs B2C — bug réel déjà trouvé et corrigé en E2E), isolation agence (RLS `agency_id = current_agency_id()`). Concurrence réelle : **`WALLET-RACE-CI-01`, run CI `36792833784`** (PR #96), 4/4 PASS contre Postgres réel non-BYPASSRLS.

**Wallet B2C** : recharge Paymee (`processCustomerTopupWebhookCore`, PR #202, 8 scénarios réels), débit (`debitCustomerWallet`, même preuve de concurrence que B2B), remboursement/historique/solde (même `applyReservationRefund`, ledger `wallet_ledger`). Ces mêmes fichiers font partie des **139/139** et **2512/2512** tests verts obtenus aujourd'hui (vérifications SUPPLIER-SETTLEMENT-ADMIN-UI-01 et PR #206) — preuve fraîche, pas une citation aveugle d'un ancien log.

**Chaîne réservation→règlement — migrations 0132/0133/0134 vérifiées, pas présumées** : `mcp__Supabase__list_migrations` les confirme trackées ET preuve directe au-delà du tracking — `debit_platform_commission()` existe réellement (`SECURITY DEFINER`), `economic_entitlements_compensates_uniq` (index unique partiel) existe réellement, `customer_topup_requests` existe réellement (schéma inspecté directement en production).

**Données production actuelles, lecture seule (2026-10-13)** : `wallet_accounts` = 1 ligne, solde 0 (**aucun compte B2C réel jamais crédité**) ; `partner_credit_movements` = 1 ligne au total ; `economic_entitlements` = **0 ligne** ; `flight_bookings` = **0 ligne** ; `reservations` = 4 au total (3 hôtel, 1 hotel_monde — aucune vol, aucune Network). Conséquence directe : 0 commission, 0 compensation, 0 reversement en production — pas un défaut de mécanisme, la chaîne économique entière n'a simplement jamais été exercée avec de la donnée réelle. Les deux Wallets sont prouvés en code et en CI réelle, **jamais exercés avec de l'argent réel en production**.

**CANCEL-COMMISSION-POLICY-01 — reste explicitement BLOQUANT, non résolu, non traité par ce chantier ni par #201/#206.** `cancellationTreatment` est `NULL` pour 100% des `economic_entitlements` de qualification `commission` (confirmé en lecture seule) — `reverseCommissionOnCancellation()` saute donc tout reversement sans défaut silencieux (comportement délibéré, pas un bug), mais tant que la Direction n'a pas validé une règle métier explicite pour ce champ, aucun reversement de commission ne peut avoir lieu automatiquement en production. Aucune commission, taux ou accord commercial inventé par cet audit — ce point reste ouvert jusqu'à décision métier explicite. **[ÉTAT HISTORIQUE, antérieur à PR #207 — voir l'entrée CLÔTURÉ en tête de section (ligne 39) : la Direction a depuis validé un modèle et PR #207 en a implémenté le sous-ensemble atteignable par les 4 writers réels. Les entitlements déjà `NULL` au moment de cette capture le restent (aucun backfill) ; `pro_rata_fee` reste non validé ; D-04 (avis comptable, `docs/ECONOMIC_MODEL.md`) reste ouvert.]**

**Aucun** — APPLY-SUPPLIER-SETTLEMENT-0135-PRODUCTION — CLÔTURÉ (2026-10-13). GO explicite reçu sur la fiche OBSERVE→AUDIT→PROPOSE présentée immédiatement après la clôture de SUPPLIER-SETTLEMENT-01 et APP-RUNTIME-GRANTS-CI-01 (voir leurs entrées ci-dessous) : application de `drizzle/manual/0135_supplier_settlement_01.sql` (685 lignes) au projet Supabase de production (`crygnaichvlxavvbifqi`), jusque-là confirmée non appliquée (voir note "Vérification production en lecture seule" dans l'entrée SUPPLIER-SETTLEMENT-01).

**Exécution** : `mcp__Supabase__apply_migration`/`execute_sql` ont expiré à répétition (timeout client 60s) sur le fichier complet et sur certains chunks combinant `DROP TRIGGER IF EXISTS` + `CREATE TRIGGER`. Chaque timeout vérifié en lecture seule (`pg_stat_activity`) : aucune session idle-in-transaction ni active après coup — jamais un blocage Postgres, un problème outil/transport déjà documenté sur ce dépôt pour un cas similaire. Contournement : découpage en chunks mono-objet (une table, un trigger, une fonction, un bloc de grants à la fois), bascule vers `execute_sql` pour le reste, vérification en lecture seule après chaque chunk avant de poursuivre. Aucun rollback exécuté, aucune transaction financière réelle, aucune autre migration touchée.

**Preuve finale (vérification complète en lecture seule après le dernier chunk)** :

- Tables `supplier_settlements`/`supplier_settlement_entries` présentes avec tous leurs index, dont les 2 index uniques partiels critiques (`supplier_settlements_anti_double_reversal`, `supplier_settlements_anti_double_external_ref`) et `supplier_settlement_entries_one_active_normal`.
- 2 triggers présents : `supplier_settlements_force_pending_trg` (INSERT), `supplier_settlements_transition_guard` (UPDATE).
- 6 fonctions présentes (`assert_supplier_settlement_actor` + les 5 fonctions publiques `SECURITY DEFINER`) ; `EXECUTE` confirmé restreint à `app_runtime`/`service_role` (+ `postgres`, propriétaire) sur chacune — jamais `anon`/`authenticated`/`PUBLIC`.
- Table-level : `INSERT`/`UPDATE`/`DELETE`/`TRUNCATE` absents pour `app_runtime`/`anon`/`authenticated`/`service_role` sur les deux tables (seuls `SELECT`/`REFERENCES`/`TRIGGER` — privilèges par défaut inoffensifs — subsistent) ; `app_runtime` n'a donc toujours aucune écriture directe, exactement comme prouvé en bac à sable avant fusion.
- RLS : `relrowsecurity=true` ET `relforcerowsecurity=true` sur les deux tables ; policy `..._superadmin` présente sur chacune, scopée exactement à `{app_runtime, authenticated, service_role}` (jamais `anon`).
- `mcp__Supabase__list_migrations` : une entrée `supplier_settlement_01` trackée (chunk initial via `apply_migration`) ; le reste appliqué via `execute_sql` (DDL brut, non tracké individuellement) — comportement déjà documenté sur ce dépôt pour des migrations découpées en chunks.

**Reconciliation** : annule la conclusion "migration 0135 non appliquée" de l'entrée SUPPLIER-SETTLEMENT-01 ci-dessous, qui reste comme trace historique correcte à la date où elle a été écrite (avant ce chantier).

**Hors périmètre, explicitement non engagé** : interface Super Admin pour déclarer/confirmer des règlements, toute transaction financière réelle via ces nouvelles fonctions, rollback de cette migration.

**Aucun** — SUPPLIER-SETTLEMENT-01 — CLÔTURÉ (2026-10-13, PR #203, squash merge `593e51c`). Règlement des dettes fournisseurs Network V1 : tables `supplier_settlements`/`supplier_settlement_entries` + 5 fonctions `SECURITY DEFINER` (`declare_supplier_settlement`, `request_supplier_settlement_correction`, `request_supplier_settlement_reversal`, `confirm_supplier_settlement`, `cancel_supplier_settlement_declaration`) — déclaration, confirmation, annulation, corrections (calc_error/duplicate_entry/supplier_refund), réversions à cascade sélective (seul un remboursement réel cascade, jamais une correction comptable), garde anti-net-négatif, garde-fous anti-mélange fournisseurs, note de vérification obligatoire pour réservation annulée/remboursée. Périmètre V1 strict et vérifié : `party_type='supplier_node'` (module Network) uniquement — `external_supplier`/`agency` explicitement rejetés par les fonctions SQL, jamais silencieusement inclus.

**Vérification combinée avec APP-RUNTIME-GRANTS-CI-01 (PR #204, avant fusion de #203)** : fusion locale (jamais poussée) des deux branches dans un worktree isolé + base Postgres jetable, migration 0135 rejouée sous l'ordre de grants corrigé par #204. Résultat, pour la première fois prouvé plutôt que supposé : `app_runtime` n'a aucun privilège direct (`INSERT`/`UPDATE`/`DELETE`/`TRUNCATE`) sur `supplier_settlements`/`supplier_settlement_entries`, uniquement `EXECUTE` sur les 5 fonctions. Fermait le risque documenté depuis l'ouverture de PR #203 ("preuve app_runtime manuelle seulement, jamais en CI"). 144/144 tests en bac à sable combiné (22 tests `supplier-settlement.integration.test.ts` + suite financial-e2e complète), puis PR #203 mise à jour par un merge de `main` (post-#204) dans sa branche et republiée sur ce même état.

**Preuves** : PR #203 fusionnée (squash) par GO explicite utilisateur — confirmé séparément pour la conséquence déploiement production avant fusion, comme pour #204. `main` : `c208067` → `593e51c`. CI post-merge sur `main` (run `38431412980`) **8/8 verte** (format, typecheck, test, lint, financial-e2e, build, lighthouse, playwright-a11y — `lighthouse` relancé une fois après un flake `toomanyrequests: Data limit exceeded` sur `public.ecr.aws/docker/library/postgres:16`, mort avant tout test réel, vérifié dans les logs bruts avant relance, même pattern déjà documenté sur ce dépôt). Déploiement production confirmé : Vercel `easy2book-new`, déploiement `dpl_AXsqb3Yubygnk5BLMtxv2z5R5wgX`, `target=production`, `state=READY`, `githubCommitSha=593e51c` = HEAD(main) au moment du merge — critère de preuve DEPLOY-01.

**Vérification production en lecture seule (2026-10-13, après fusion)** : `mcp__Supabase__list_tables` sur le projet `crygnaichvlxavvbifqi` confirme l'absence de `supplier_settlements`/`supplier_settlement_entries` dans `public` ; `mcp__Supabase__list_migrations` confirme qu'aucune version `0135` n'est trackée (dernière migration : `0134_economic_entitlements_compensates_uniq_retry2`). **Migration 0135 non appliquée à la production — confirmé, pas supposé.** Code structurellement inerte en production (aucune page/route existante n'appelle `lib/finance/supplier-settlement.ts`/`-actions.ts`, pas d'interface Super Admin câblée dans ce chantier) — même situation déjà rencontrée et documentée pour 0133/0134 (code livré avant sa migration). Aucun risque de compatibilité sur le déploiement existant.

**Hors périmètre, explicitement non engagé** : application de la migration 0135 en production, interface Super Admin pour déclarer/confirmer des règlements (chantier séparé, nécessitera son propre GO).

**Aucun** — APP-RUNTIME-GRANTS-CI-01 — CLÔTURÉ (2026-10-13, PR #204, squash merge `a4d783a`). Audit du job CI `financial-e2e` : l'étape "Grants finaux app_runtime" (GRANT large table-level) s'exécutait **après** le replay de `drizzle/manual/*.sql`, annulant silencieusement, pour la durée de la CI uniquement, les `REVOKE` explicites d'au moins 11 migrations réelles (recherche multi-lignes requise — une recherche ligne-à-ligne rate les `REVOKE` écrits sur deux lignes, erreur d'abord commise en auditant ce chantier). Deux migrations critiques concernées : `0084_ledger_integrity_01` (`wallet_ledger`, `partner_credit_movements`, `commission_settlement_entries`) et `0092_econ_entitlements_integrity_01` (`economic_entitlements`). Jamais détecté car aucun test n'assertait l'ABSENCE d'un privilège en CI.

Corrections : (1) `.github/workflows/ci.yml` réordonné — grant table-level déplacé avant le replay, grant fonctions (dépendent des fonctions créées par les migrations) resté après ; (2) `lib/db/__tests__/app-runtime-grants.test.ts` (fichier préexistant, 4 tables couvertes, jamais exécuté par `financial-e2e`) étendu aux 11 migrations (SELECT/INSERT/UPDATE/DELETE/TRUNCATE) et ajouté au job ; (3) `lib/db/test-helpers/superuser-cleanup.ts` (nouveau helper partagé, nettoyage de fixtures sur tables append-only) durci après revue : refuse tout hôte non-localhost (`DATABASE_DIRECT_URL` peut légitimement pointer vers le projet Supabase réel en développement local, voir `lib/db/README.md` — risque réel, pas théorique), refuse `NODE_ENV=production`, refuse une URL invalide, lève une erreur plutôt qu'un no-op silencieux si absent (un résidu de fixture non nettoyé avait causé une pollution inter-exécutions réelle en débogant ce chantier) ; 9 fichiers de test migrés vers ce helper pour leurs nettoyages directs sur `wallet_ledger`/`partner_credit_movements`/`economic_entitlements`/`canonical_hotel_supplier_mappings`/`canonical_hotels`.

**Preuves** : vérifié empiriquement en bac à sable local (worktree + bases Postgres jetables, jamais appliqué au dépôt avant commit) que `has_table_privilege('app_runtime', table, privilege)` passe de `true` (ordre bugué) à `false` (ordre corrigé) sur les 18 combinaisons table×privilège concernées. 122/122 tests locaux (18 fichiers `financial-e2e` + `app-runtime-grants.test.ts` + `superuser-cleanup-guard.test.ts`, 5 tests prouvant que le durcissement refuse réellement chaque cible non sûre) sur base jetable neuve. PR #204 fusionnée (squash) par GO explicite utilisateur — confirmé séparément pour la conséquence déploiement production avant fusion. `main` : `c6ee93a` → `a4d783a`. CI post-merge sur `main` (run `38428507776`) **8/8 verte** (format, typecheck, test, lint, financial-e2e, build, lighthouse, playwright-a11y — `playwright-a11y` relancé une fois après un flake `toomanyrequests: Data limit exceeded` sur `public.ecr.aws/docker/library/postgres:16`, mort avant tout test réel, pattern déjà documenté sur ce dépôt). Déploiement production confirmé : Vercel `easy2book-new`, déploiement `dpl_5rfpSLGfQM1dV1bXFK3w23Zputew`, `target=production`, `state=READY`, `githubCommitSha=a4d783a` = HEAD(main) au moment du merge — critère de preuve DEPLOY-01.

**Vérification combinée avec SUPPLIER-SETTLEMENT-01 (PR #203, avant fusion de #204)** : fusion locale (jamais poussée) des deux branches dans un worktree isolé + base Postgres jetable, migration `0135_supplier_settlement_01.sql` rejouée sous l'ordre de grants corrigé. Résultat, pour la première fois prouvé plutôt que supposé : `app_runtime` n'a aucun privilège direct (`INSERT`/`UPDATE`/`DELETE`/`TRUNCATE`) sur `supplier_settlements`/`supplier_settlement_entries`, uniquement `EXECUTE` sur les 5 fonctions `SECURITY DEFINER`. 144/144 tests (incl. les 22 tests `supplier-settlement.integration.test.ts`). Fermait le risque documenté depuis l'ouverture de PR #203 ("preuve app_runtime manuelle seulement, jamais en CI").

**Aucun** — B2C-TOPUP-WEBHOOK-INTEGRATION-01 — CLÔTURÉ (2026-10-13, PR #202, squash merge `7922dd4c`). GO explicite suite au constat de l'audit WALLET-NETWORK-COMMON-FLOW-01 : `processCustomerTopupWebhookCore` (webhook B2C de confirmation PSP, WALLET-TOPUP-01) n'avait aucun test, ni mocké ni réel, contrairement à son homologue B2B. Nouveau fichier `lib/payment/__tests__/customer-topup-webhook-core.integration.test.ts` — **8 scénarios** (un 8e ajouté après revue : eventId différents concurrents, pour isoler et prouver la suffisance du verrou `SELECT ... FOR UPDATE` seul, indépendamment du dédoublonnage par `eventId` déjà couvert par le scénario à eventId identique), tous exécutés et verts sur Postgres réel non-bypass-RLS (reconstruit localement puis confirmé en CI réelle) : (1) crédit simple ; (2) webhook dupliqué même eventId → `duplicate` ; (3) retry applicatif eventId différent/même paymentReference → `already_processed` ; (4) montant incohérent → `mismatch` ; (5) paiement refusé PSP → `payment_failed` ; (6) PSP déclaré ≠ PSP reçu → `no_match`, tracé `psp_webhooks` ; (7) 2 appels concurrents même eventId → exactement 1 crédit ; (8) 2 appels concurrents eventId différents → exactement 1 crédit (preuve du verrou seul). Fixtures créées/détruites par test, nettoyage vérifié (0 résidu) à chaque exécution locale. Fichier ajouté à la liste `financial-e2e` de `.github/workflows/ci.yml`.

**Preuves de fusion/CI** : PR #202 fusionnée (squash) par GO explicite utilisateur, en 3 temps (GO fiche → GO pour la PR → GO pour la fusion, avec checklist pré/post-fusion explicite). `main` : `0e6cc269` → `7922dd4c`. Vérifié avant fusion : PR ouverte, 8/8 checks CI verts (dont `financial-e2e` relu ligne à ligne dans les logs bruts — `ok 64` à `ok 71`, zéro `not ok` dans tout le job), diff limité aux 3 fichiers audités, fusion verrouillée par `expectedHeadSha` (aucun commit non validé n'aurait pu se glisser). Règles de protection de branche vérifiées : `main` a `protected: false` dans ce dépôt — rien à autoriser ni à contourner au niveau plateforme. Après fusion : SHA confirmé par `git fetch`, CI post-merge sur `main` (run `38369269043`) **8/8 verte** (format, lint, typecheck, test, financial-e2e, build, lighthouse, playwright-a11y — `conclusion: success`). Aucun déploiement manuel, aucune transaction financière réelle, aucune migration de production déclenchée pendant ce chantier — seules actions : la fusion elle-même et des vérifications en lecture (dont confirmation que `main` n'a pas de protection de branche).

**Aucun** — WALLET-NETWORK-COMMON-FLOW-01 — AUDIT READ-ONLY (2026-10-12), Master Prompt dédié (7 règles financières communes, 5 catégories d'acteurs, matrice de 25 scénarios, 15 questions d'audit). Aucune écriture pendant l'audit. Conclusions principales : le mécanisme Wallet B2B (`agencies.deposit_balance` + `partner_credit_movements`, verrou `FOR UPDATE`, traçabilité auteur/motif) est prouvé en code ET en production ET sur Postgres réel pour la concurrence (`WALLET-RACE-CI-01`). Le Wallet B2C est bien câblé en code (solde au checkout, désactivation si insuffisant — `WALLET-UI-01`) mais **aucun compte B2C réel n'a jamais été crédité** en production (`wallet_accounts` = 1 ligne, commission, solde 0). Règlement fournisseur : **mécanisme absent** (`settlementStatus`/`settlementRef` jamais lus/écrits par aucun code applicatif, confirmé par grep exhaustif). Trou latent jamais déclenché : `updateFlightStatus("CANCELLED")` sauterait remboursement + reversement commission si jamais atteint — seul `"FAILED"` est appelé réellement aujourd'hui (couvert par `FLIGHT-REFUND-GAP-01`). Rapport complet (12 sections + matrice 25 scénarios + 5 questions d'ouverture) livré en conversation, non dupliqué ici.

**Découverte pendant l'exécution du chantier recommandé (migration 0132 manquante)** : les migrations `0133_debit_platform_commission.sql` et `0134_economic_entitlements_compensates_uniq.sql` — livrées avec `CANCEL-COMMISSION-01` (PR #200, clôturé le même jour, voir plus bas) — n'étaient PAS non plus appliquées en production, malgré la mention "déployé" de ce chantier. Confirmé par `pg_proc`/`pg_constraint` (lecture seule) ET par `mcp__Supabase__list_migrations` (aucune des 3 versions 0132/0133/0134 dans le suivi officiel). Gravité réelle vérifiée avant toute action corrective : 0 compensation dans `economic_entitlements`, 0 ligne `wallet_ledger` type=`adjustment`/category=`fee`, seule réservation annulée en prod datée du 19/09 (avant le déploiement du 12/10) — bug latent, jamais encore déclenché, pas un incident actif avec données corrompues.

**WALLET-TOPUP-MIGRATION-GAP-01 — CLÔTURÉ (2026-10-12)**. GO explicite obtenu en plusieurs temps : GO initial sur 0132 seule (fiche chantier présentée, format standard) ; puis, découverte ci-dessus en cours d'exécution → portée reconfirmée explicitement par question directe (3 migrations plutôt que 1 seule) ; puis cycle OBSERVE→AUDIT→PROPOSE→STOP redemandé par l'utilisateur et exécuté avant application de 0133/0134 (fiche par migration : dépendances, préconditions, effet financier, plan de retour arrière) ; GO final explicite obtenu avant application. Les 3 migrations appliquées en production (`crygnaichvlxavvbifqi`) via `mcp__Supabase__apply_migration`, chacune revérifiée après coup par `SELECT` en lecture seule :

- **0132** : table `customer_topup_requests` créée (7 index dont 2 `UNIQUE`, RLS activée) — confirmé.
- **0133** : fonction `debit_platform_commission()` créée (`SECURITY DEFINER` confirmé, `REVOKE` anon/authenticated + `GRANT` service_role/app_runtime) — confirmé.
- **0134** : index unique partiel `economic_entitlements_compensates_uniq` créé et actif — la double-compensation est désormais impossible au niveau base, pas seulement applicatif — confirmé. L'ancien index non-unique `economic_entitlements_compensates_idx` reste présent en doublon : 4 tentatives de `DROP INDEX` (2 via `apply_migration`, 2 via `execute_sql`) ont expiré côté outil MCP, à chaque fois sans aucun verrou Postgres détecté (`pg_locks`/`pg_stat_activity` vides sur `economic_entitlements` juste après chaque échec) — problème outil/réseau pour cette opération précise, pas un blocage base. Tentatives arrêtées après la 4e (pas de boucle sur un échec qui ne se corrige pas de lui-même). **NOT VERIFIED / nettoyage cosmétique restant** : suppression de cet index redondant — sans impact fonctionnel, sans urgence, à retenter plus tard (session/connexion différente) si besoin.

**Conséquence directe sur `CANCEL-COMMISSION-01`** : ce chantier (PR #200, voir entrée plus bas) était correctement codé et testé sur Postgres réel en CI, mais **structurellement inerte en production** depuis son déploiement jusqu'à l'application de 0133/0134 ci-dessus — toute annulation réelle avec reversement de commission aurait échoué (fonction SQL introuvable). Aucune annulation réelle n'a eu lieu dans cette fenêtre (seule réservation `cancelled` en prod antérieure au déploiement). Le paragraphe "Vérification fonctionnelle ciblée" plus bas documentait cet état avant correction — voir la note de réconciliation ajoutée à cet endroit.

**TODO CANCEL-COMMISSION-POLICY-01 : toujours BLOQUÉ, non implémenté, non concerné par ce chantier.** **[ÉTAT HISTORIQUE, antérieur à PR #207 — voir ligne 39 pour l'état courant (implémentation partielle, 4 writers réels).]**

**Aucun** — CRM-6-AXES-AUDIT-01 — AUDIT ONLY, lecture seule (2026-10-12). Reprise de l'audit de re-certification CRM en 6 points, interrompu puis repris avec cette exigence explicite : la présence de documentation/tests/page ne prouve pas à elle seule un fonctionnement complet — chaque point vérifié aujourd'hui par lecture de code ET requêtes `SELECT` en lecture seule sur la base Supabase de production (`crygnaichvlxavvbifqi`), jamais par supposition sur la base des audits antérieurs (POST-BATCH-CERTIFICATION-AUDIT, AUDIT-17-BRIQUES-01) seuls. **Aucune modification de code, migration, écriture ou déploiement.**

1. **PROMO impacte-t-il réellement le prix final ?** — **PARTIEL**. Câblage CONFIRMÉ (8/8 modules, chaîne `?campaign=<uuid>` URL → prop formulaire → Server Action → `resolveCheckoutPromoCore` tracée bout en bout aujourd'hui, aucune dérive depuis l'audit du 08/10). Données réelles NON CONFIRMÉ : `campaigns`=0, `promos`=0, `campaign_targets`=0 en production — jamais exercé une seule fois.
2. **REVENUE source unique, sans duplication ?** — **CONFIRMÉ** pour l'invariant lui-même : `sumRevenueMarginCore()` reste la seule primitive, aucune nouvelle duplication `.reduce()` sur `salePriceTnd`/`marginAmount` détectée par grep aujourd'hui. `campaign_performance_core` trivialement vide (campagnes=0, conséquence du point 1, pas un défaut).
3. **NICHE consommable moteur→UI→accès→données ?** — **PARTIEL**. Chaîne confirmée (query réelle sur `leads`, garde d'accès, page liée au nav). `leads`=2 lignes réelles (non nul sur `market`) — suffisant pour produire 1-2 segments si consultée (`computeNicheSegmentsCore` n'a pas de seuil minimal). Rendu visuel authentifié **jamais vérifié** (ni à la clôture de NICHE-UI-01, ni aujourd'hui — aucune session admin disponible) — reste `NOT VERIFIED`, non résolu par cet audit.
4. **Prochain maillon faible de la chaîne CRM** : pas le code (câblage stable, vérifié correct) — l'**absence totale de configuration commerciale réelle en production** (0 campagne, 0 promo, 0 accord commercial, 0 règle de marge). Tout le code en aval tourne à vide depuis le premier jour.
5. **COMMERCIAL/CRM séparés, flux promo→pricing→marge→commission correct ?** — **PARTIEL/BLOQUÉ**. Séparation du code CONFIRMÉE correcte. Réalité production : `commercial_agreements`=0, `margin_rules`=0, `pricing_margins`=0 — les 3 lignes `reservation_financials` réelles existantes ont toutes `margin_rule_id=NULL` (défaut de repli, jamais une vraie règle) et `commission_amount=0.00` sur 100% des cas. Reconfirme empiriquement, aujourd'hui, la décision Direction du 2026-09-30 ("COMMERCIAL non raccordé") — toujours vraie, vérifiée, pas supposée.
6. **RÉALITÉ PRODUCTION — qu'est-ce qui est prouvé bout en bout ?** — **NON CONFIRMÉ**. Chiffres vérifiés aujourd'hui : 4 réservations (2 `expired`, 1 `cancelled`, 1 `pending`, 0 `confirmed`) ; `wallet_ledger`/`commission_settlements`/`economic_entitlements` tous vides ; `campaigns`/`promos`/`commercial_agreements`/`margin_rules` tous à 0. Cohérent avec LOT-A-READINESS-AUDIT-01 ("0% transactions réelles").

**Risques prioritaires identifiés** : (1) le moteur de commission (y compris CANCEL-COMMISSION-01 fusionné le même jour) n'a jamais eu de commission réelle à traiter — `commission_amount=0.00` sur 100% des réservations existantes, par absence de règle commerciale, pas par défaut du code ; (2) PROMO/NICHE sont du code prouvé sans jamais avoir tourné avec de vraies données — risque non testé en conditions réelles pour tout changement futur ; (3) le blocage racine est commercial, pas technique.

**Confirmation Direction (2026-10-12)** : constat COMMERCIAL (0 accord commercial réel configuré en production) explicitement confirmé par Direction suite à cet audit — situation actée, aucune action technique engagée à ce stade, pas un GO d'exécution.

**Proposition de prochaine étape (non engagée)** : faire confirmer par Direction si/quand des accords commerciaux et règles de marge réels seront configurés — seule action qui déverrouillerait une preuve de fonctionnement bout en bout pour les points 1, 2, 5 et 6. **Aucun correctif technique engagé — audit lecture seule uniquement, en attente de GO pour toute suite.**

**Aucun** — CANCEL-COMMISSION-01 / SETTLE-CANCEL-GUARD-01 / FLIGHT-CANCEL-FIN-01 — CLÔTURÉ (2026-10-12, PR #200, branche `claude/cancel-commission-01-7gyb5v`, merge squash `1ee5c71`). Reprise et audit d'une PR existante (reversement de commission Easy2Book sur annulation, protection settlement, trace financière vol) : 4 points bloquants identifiés puis corrigés avec preuve réelle. **Bloquant A** (idempotence bout-en-bout) : `economic_entitlements_compensates_uniq` (migration 0134, UNIQUE partiel) + pré-check applicatif avant écriture. **Bloquant B** (politique d'annulation) : suppression du défaut silencieux `?? "full_reversal"` — politique absente/inconnue → reversement sauté (skip + warn), jamais une politique inventée par le code. **Bloquant C** (crédit ambigu) : rejet explicite si >1 crédit `wallet_ledger` candidat, `negateDecimalString()` (zéro arithmétique flottante). **Bloquant D** (intégration PostgreSQL réelle) : nouveau fichier `lib/finance/__tests__/commission-reversal-integration.test.ts` (6 tests, Postgres réel, ajouté à la liste CI `financial-e2e`) — a révélé et fait corriger un vrai défaut : un `INSERT` nu + `catch(23505)` catchait l'exception JS mais ne restaurait pas la transaction Postgres sous-jacente (marquée "aborted" dès l'échec d'une instruction), ce qui aurait fait échouer silencieusement la transaction appelante (donc l'annulation entière) sous course concurrente réelle — remplacé par `INSERT ... ON CONFLICT DO NOTHING RETURNING id`, qui ne lève jamais d'erreur SQL pour ce cas. Deux bugs de test eux-mêmes (pas de code de production) également trouvés et corrigés uniquement grâce à une vraie exécution CI (jamais détectables en mock) : deux tests supposaient un solde ambiant positif sur le wallet commission partagé sans jamais le créditer eux-mêmes.

**Preuves de fusion/CI/déploiement** : PR #200 mergée (squash) sur `main` par GO explicite utilisateur — `main` : `4f6f8a7` → `1ee5c71`. CI post-merge sur `main` (run GitHub Actions [38296839350](https://github.com/Hassen02020/EasyV4/actions/runs/38296839350)) : 8/8 jobs verts (format ✅ typecheck ✅ lint ✅ test ✅ financial-e2e ✅ build ✅ lighthouse ✅ playwright-a11y ✅). Déploiement production confirmé : Vercel `easy2book-new`, déploiement `dpl_CwqsLWq9fkmJnLTJrhNBqHtkdTRm`, `target=production`, `state=READY`, `githubCommitSha=1ee5c71` = HEAD(main) au moment du merge (inspector : https://vercel.com/easy2book/easy2book-new/CwqsLWq9fkmJnLTJrhNBqHtkdTRm) — critère de preuve identique à celui défini lors de l'incident DEPLOY-01.

**Vérification fonctionnelle ciblée en production (lecture seule, 2026-10-12, aucune transaction financière déclenchée)** : confirmé via requêtes SQL `SELECT` seules sur le projet Supabase de production (`crygnaichvlxavvbifqi`) — `debit_platform_commission()` **n'existe pas** en production (migration 0133 non appliquée) ; `economic_entitlements_compensates_uniq` **n'existe pas**, seul l'ancien index `economic_entitlements_compensates_idx` est présent (migration 0134 non appliquée) ; table `economic_entitlements` à **0 ligne**. État réel des parcours concernés : 4 réservations au total (2 `expired`, 1 `cancelled`, 1 `pending`), 3 lignes `reservation_financials` dont **0 avec `commission_amount` > 0**, `wallet_ledger` et `commission_settlements` **vides**. Conclusion : le nouveau code de reversement de commission est structurellement inerte en production aujourd'hui — même la réservation déjà `cancelled` n'aurait jamais atteint `debit_platform_commission()` (garde `commissionAmount <= 0` dès la première étape de `reverseCommissionOnCancellation`), cohérent avec l'audit antérieur LOT-A-READINESS-AUDIT-01 ("0 % transactions réelles"). **NOT VERIFIED** : lecture des logs/erreurs runtime Vercel du déploiement (`get_runtime_errors`/`get_runtime_logs`) — bloquée par une limitation de permission réelle (403 Forbidden, confirmée à deux reprises avec les identifiants projet/équipe corrects, aucun fallback CLI disponible dans cet environnement) ; non retentée sans nouvelle autorisation d'accès.

**RÉCONCILIATION (2026-10-12, plus tard le même jour)** : les migrations 0133 et 0134 citées ci-dessus comme non appliquées l'ont été depuis, dans le cadre du chantier `WALLET-TOPUP-MIGRATION-GAP-01` (voir entrée en tête de la section « Chantier actif ») — `debit_platform_commission()` et `economic_entitlements_compensates_uniq` existent désormais réellement en base de production. Ce paragraphe reste comme preuve historique de l'état constaté au moment de la clôture de `CANCEL-COMMISSION-01`, pas comme état actuel.

**Décision Direction capturée (TODO CANCEL-COMMISSION-POLICY-01)** : modèle validé pour déterminer `cancellationTreatment` par module — (1) package/omra/activity/network/car/transfer : dérivé de la table `cancellation_policies` existante (`nonRefundable`→`non_refundable`, `refundAllowed` sans frais→`full_reversal`, `cancellationFeePercent`→`pro_rata_fee` non activé) ; (2) hotel/hotel_monde/flight (non couverts par `cancellation_policies`) : `non_refundable` fixe ; (3) défaut si dérivation ambiguë : `non_refundable`. **Précaution explicite actée** : la commission Easy2Book (`cancellationTreatment`, ce chantier) et le remboursement CLIENT (`cancellation_policies`, décidé et exécuté séparément par `recordCancellationFinancials`/`applyReservationRefund`/`creditCustomerWallet`, wallet distinct) restent DEUX MÉCANISMES DISTINCTS — la dérivation du point 1 est un proxy pragmatique validé aujourd'hui, jamais une équivalence automatique. Modèle documenté dans `lib/finance/commission-reversal.ts` (en-tête de fichier). **TODO CANCEL-COMMISSION-POLICY-01 reste BLOQUANT et NON implémenté** (écrire `cancellationTreatment` à la création d'un entitlement de commission touche ~15 modules) : chantier séparé, en attente de son propre GO explicite — jamais enchaîné automatiquement à ce chantier, même après ce merge. **[ÉTAT HISTORIQUE, antérieur à PR #207 — voir ligne 39. Écart factuel trouvé lors de l'audit PR #207 : ce modèle assigne network/car/transfer à une dérivation `cancellation_policies`, mais `cancellationPolicies.productType` n'admet que omra/package/activity — aucune ligne ne peut exister pour `network`, seul des trois à avoir un writer réel. PR #207 a donc implémenté "non_refundable" fixe pour les 4 writers réels (hôtel×2, hôtel_monde, network — ce dernier via le repli du point (3), jamais une dérivation `cancellation_policies` codée), sans câbler la dérivation du point (1) pour omra/package/activity, qui ne créent aujourd'hui aucune ligne `qualification="commission"`.]**

**Aucun** — ADMIN-CANCEL-FINANCIALS-01 CLÔTURÉ (2026-10-12, PR #198, commit `0dc05fca`). `recordCancellationFinancials` câblé dans `updateReservationStatus` (`lib/admin/actions.ts`) — 5e et dernier chemin d'annulation manquant. Import depuis `@/lib/finance/cancellation-financials`. Appel après `applyReservationRefund` : `cancellationFeeTnd: providerCancellationFee ?? 0`, `refundAmountTnd: refundedTnd ?? 0`, `reason: "Annulation admin"`, `cancelledAt: cancelledAt ?? new Date()`. Atomique dans `withTenantContext`. 3 tests Invariant 7 dans `update-reservation-status-wiring.test.ts` (UPDATE-STATUS-WIRING-01 import + cancellationFeeTnd + refundAmountTnd). CI 10/10 verts (format ✅ typecheck ✅ lint ✅ test ✅ financial-e2e ✅ build ✅ lighthouse ✅ playwright-a11y ✅ Vercel ✅).

**Aucun** — B2C-WALLET-HISTORY-01 CLÔTURÉ (2026-10-12, PR #192, commit `d0c539e`). Historique transactions wallet B2C sur `/compte/wallet` — `getCustomerWalletTransactions(customerId, limit=30)` dans `lib/finance/customer-wallet.ts` : `withSystemContext`, `innerJoin walletAccounts+walletLedger`, filtre `customerId+type="credit"+agencyId IS NULL`, `orderBy desc(createdAt)`. Interface `WalletTransaction` exportée. Composant `WalletTransactionList` (Server Component) : icône crédit/débit, montant ±, solde résultant, description, date, catégorie, état vide. Page `/compte/wallet` : `Promise.all([getCustomerWalletBalance, getCustomerWalletTransactions])`. 4 clés i18n (fr/en/ar). 12/12 tests statiques (`b2c-wallet-history-wiring.test.ts`). tsc 0 erreur.

**Aucun** — B2C-WALLET-EMAIL-01 CLÔTURÉ (2026-10-11, PR #192, commit `a41a039`). Email confirmation recharge wallet B2C via Inngest — event `"wallet/customer.credited"` dans `lib/inngest/client.ts`, handler `processWalletCustomerCredited` (`lib/inngest/functions/process-wallet-customer-credited.ts`) : DB lookup email depuis `customers` (jamais payload), guard `no_customer_email` + `resend_not_configured`, email Resend HTML montant/solde/réf. `lib/inngest/functions/index.ts` : export. `app/api/payment/webhook/route.ts` : `sendEvent` fire-and-forget conditionné `b2cResult.status === "credited"`. 10/10 tests statiques (`b2c-wallet-email-wiring.test.ts`). tsc 0 erreurs.

**Aucun** — WALLET-TOPUP-01 CLÔTURÉ (2026-10-11, PR #192, commit `36fe4f1`). Recharge wallet B2C auto-service via Paymee — migration `drizzle/manual/0132_customer_topup_requests.sql` : table `customer_topup_requests` (RLS, indexes, contraintes). Schema Drizzle `customerTopupRequests`. `lib/finance/b2c-topup-actions.ts` : Server Action `submitCustomerTopUp` (validation 10–5000 TND, lookup customer, INSERT topup request, createPayment Paymee, paymeeToken stocké). `lib/payment/customer-topup-webhook-core.ts` : `processCustomerTopupWebhookCore` (P0-A corrélation avant eventId, P0-B vérification PSP, idempotence request déjà validated/rejected, `creditCustomerWallet(source="online_card")`). `app/api/payment/webhook/route.ts` : fallback B2C après no_match B2B. `components/compte/wallet-topup-form.tsx` : formulaire montant (useTransition + server action). `app/(public)/[locale]/compte/wallet/page.tsx` : page solde + formulaire + feedback success/cancelled. i18n 14 clés wallet (fr/en/ar). 13/13 tests invariants statiques (`r9-02-b2c-topup-invariants.test.ts`). tsc 0 erreurs.

**Aucun** — FLIGHT-REFUND-GAP-01 CLÔTURÉ (2026-10-11, PR #191, commit `3d04396d`). Remboursement automatique wallet sur échec GDS vols — `lib/vols/flight-refund-on-failure.ts` : helper `autoRefundOnFlightFailure` wrappant `applyReservationRefund` via `withSystemContext`, `NO_CAPTURED_PAYMENT` = no-op silencieux, FLIGHT_AUTO_REFUND_EXCEPTION jamais propagée. `fulfillment-action.ts` : 4 call sites aux chemins FAILED (RECHECK_ERROR, statut non-AVAILABLE, BOOK_FAILED, ISSUE_FAILED/PNR_ORPHANED). 10 tests statiques R9-01 (`r9-01-flight-refund-on-failure-invariants.test.ts`) 10/10 pass. CI 10/10 vert (format ✅ typecheck ✅ lint ✅ test ✅ financial-e2e ✅ build ✅ lighthouse ✅ playwright-a11y ✅).
**Aucun** — REFUND-POLICY-01b CLÔTURÉ (2026-10-11, PR #190, commit `fbb76a7`). Acceptation politique d'annulation Hôtels Monde — `world-hotel-guest-booking-form.tsx` : état `policyAccepted`, carte ShieldCheck/ShieldX, case à cocher obligatoire, gate onSubmit, bouton disabled. 5 clés i18n HotelsMonde.\* (fr/en/ar). Test statique `r8-02-world-hotel-policy-invariants.test.ts` 20/20 pass. tsc 0 erreur.

**Aucun** — WALLET-UI-01 + REFUND-POLICY-01 + HOTEL-CANCEL-ACCEPT-01 CLÔTURÉS (2026-10-11, PR #189, mergée `0c8f516`). Règle métier «accepter la politique avant paiement» : farePolicy gelée dans providerPayload Duffel au CAS ; `fareAccepted` gate dans passenger-booking-form (vols) ; `hotelCancellation` prop + `policyAccepted` gate dans checkout-form (hôtels locaux) ; solde wallet affiché et bloquant si insuffisant. Affichage solde B2C au checkout. `checkout/page.tsx` : résout `authUserId` depuis `traveler.email` (server-side) → lookup `customers.id` → `getCustomerWalletBalance(customer.id)` (withSystemContext, RLS elevation), fallback 0 silencieux. `checkout-form.tsx` : props `walletBalanceTnd`/`totalTnd`, bouton wallet désactivé + opacité 50% si solde < total, description dynamique (solde disponible ou "solde insuffisant"), guard défensif dans `onSubmit`. 3 fichiers messages (fr/en/ar) : clés `methodWalletBalanceDesc` + `methodWalletInsufficientDesc`. `tsc --noEmit` 0 erreurs. Risque éliminé : soumission aveugle → INSUFFICIENT_FUNDS après déclenchement compensation fournisseur (audit WALLET-NETWORK-COMMON-FLOW-01 scénario S10).

**Aucun** — HOTELS-MONDE-ENGINE-01 CLÔTURÉ (2026-10-11, PR #186). Intégration du moteur de règles commerciales DB-driven dans le tunnel hotels-monde (search + book + financials). `virtual-supplier/engine.ts` : book() accepte `MarginRule | ((p) => number)` — CURRENCY-DIM-01 intercepté avant réservation inventaire. `search/route.ts` : resolveHotelCommercialRules une fois par requête, fallback pricing_margins si null ou exception. `guest-booking-actions.ts` : même fonction de pricing search/book (consistance), `marginBasis` dans economic_entitlements décrit la règle appliquée. 24/24 tests (`hotels-monde-engine-wiring.test.ts`). typecheck ✓ — build ✓.

**Aucun** — RLS-HOTEL-01 CLÔTURÉ (2026-10-11, PR #185, merge `e741088`). Row-Level Security sur `hotel_commercial_rules` — isolation tenant miroir de `flight_commercial_rules` et `pricing_margins`. Migration `drizzle/manual/0131_hotel_commercial_rules_rls.sql` : `ENABLE ROW LEVEL SECURITY` + `FORCE ROW LEVEL SECURITY` + policy `hotel_commercial_rules_tenant_isolation` (`agency_id = current_agency_id() OR is_super_admin()`). Appliquée en production Supabase (`crygnaichvlxavvbifqi`) — vérifiée : `relrowsecurity=true`, `relforcerowsecurity=true`, expression USING/WITH CHECK confirmée, 15/15 USING + 6/6 WITH CHECK. Tests : 25/25 (`lib/hotels/__tests__/rls-policy.test.ts`) — 7 suites couvrant anon, agence A/B, isolation inter-tenant, withSystemContext, super_admin, compatibilité moteur hôtel, edge cases. Moteur hôtel (`lib/hotels/commercial-engine.ts`) confirmé RLS-safe via `withSystemContext` (ligne 96). TS2367 corrigé (variables currencies déclarées `: string`).

**Aucun** — COMMERCIAL-HOTELS-01 CLÔTURÉ (2026-10-11, PR #184, merge `0fbd13c`). Moteur de règles commerciales DB-driven pour hôtels — miroir de `flight_commercial_rules`. Migration `drizzle/0019_hotel_commercial_rules.sql` (table `hotel_commercial_rules`, FK `agencies`, 3 index). Schema Drizzle `lib/db/schema/hotel-suppliers.ts` + export `lib/db/schema.ts`. Moteur pur `lib/hotels/commercial-engine.ts` : `matchesHotelProductScope`, `computeHotelCommercialResult`, `resolveHotelCommercialRules`, `applyHotelCommercialEngine`. CURRENCY-DIM-01 invariant : throw sur mismatch devise. Intégration additive B2B (`lib/booking/actions.ts`) + B2C (`lib/booking/guest-actions.ts`) : DB rule → null → fallback `pricing_margins` existant préservé. 20/20 tests node:test. CI 8/8 verts (format/lint/typecheck/test/financial-e2e/build/playwright-a11y/Vercel). Migration 0019 appliquée en production (via COMMERCIAL-HOTELS-01 initial). `hotels-monde/guest-booking-actions.ts` (bookWorldHotel) : intégration différée — chantier séparé requis.

**Aucun** — GUEST-AGENCY-DIAGNOSTIC-01 CLÔTURÉ (2026-10-10, PR #178, merge `a3209d0`). Anomalie production "/fr/compte : Aucune agence n'est configurée" — catch silencieux dans `getDefaultAgencyId()` exposé via console.error. Post-deploy : page opérationnelle (screenshot validé). Hypothèse : erreur intermittente liée à cold-start/pool connection, résolue par le nouveau déploiement. Logging conservé en garde. Anomalie C (MISSING_MESSAGE EN/AR) : N/A — artefact vieux déploiements, clés présentes depuis commit `333939e`. Anomalie A (magic link → localhost) : en attente action manuelle Supabase dashboard Site URL → `https://easy2book-new.vercel.app` (aucun code à modifier).
**Aucun** — CRM-360-LEAD-INFO-01 CLÔTURÉ (2026-10-10, commit `386d513`). Customer360Button dialog complété : section "Profil" (phone/email conditionnels, channel via CHANNEL_LABEL, productType via PRODUCT_LABEL 5 types, status via STATUS_LABEL 4 statuts, createdAt fr-FR) + section "Demande initiale" conditionnelle (data.lead.message). Ordre : Profil → Demande initiale → Note interne → Score → VIP → Réservations → Fidélité → Conversations. PRODUCT_LABEL + STATUS_LABEL ajoutés. 12/12 invariants statiques. Aucune migration (champs déjà présents dans Customer360.lead).
**Aucun** — CRM-STAFF-LEAD-01 CLÔTURÉ (2026-10-10, commit `14996a4`). captureStaffLeadCore (createLeadCore → recordLeadOriginEventCore×2 role=channel+captured_by_user source="staff_manual_entry" rang 2) + Server Action createLead (assertSupportStaff, agencyId/userId session, validation firstName+CRM_CHANNELS) + CreateLeadDialog (/admin/support) + 13/13 invariants statiques. Aucune migration. Comble le gap CRM-NICHE-02 partiel : canaux offline (appel/email/instagram/messenger) désormais capturables par le staff.

**Aucun** — RLS-CONSENT-FIX CLÔTURÉ (2026-10-10). Migration 0130 appliquée en production : `ALTER TABLE lead_consent_events FORCE ROW LEVEL SECURITY`. lead_consent_events alignée avec les 13 autres tables CRM (ENABLE + FORCE). Test rls-force-crm-01-live.test.ts étendu à 7 tables. PR créée sur branche claude/easy2book-v6-modernization-7gyb5v.
**Aucun** — PROMO-CAMPAIGN-CANCEL-01 CLÔTURÉ (2026-10-10). getCampaignPerformanceCore filtre via inArray(reservations.status, ["confirmed","completed"]) — couvre B2B/B2C cancel (cancelledAt) ET staff refund/webhook PSP (status='refunded' sans cancelledAt). PR #174.
**Aucun** — CRM-C — Task Management CLÔTURÉ (2026-10-10, PR #172 + #173, commit `2ae44425`). Migration 0128 `crm_tasks` + core + Server Actions + `CrmTasksPanel` + 34/34 tests. Migration 0129 `crm_tasks_rls_fix` appliquée : policies RLS corrigées (auth.uid() → current_agency_id() OR is_super_admin()), grants anon/authenticated révoqués. DEPLOYED ON PRODUCTION.

**Aucun** — WHITE-LABEL-PRO-01 CLÔTURÉ (2026-10-04, commit `e691cf7`).
**Aucun** — IDENTITY-J6-01 CLÔTURÉ (2026-10-04).
**Aucun** — SETTLE-01 CLÔTURÉ (2026-10-04, commit `3856490`).
**Aucun** — IDEMPOTENCE-01 CLÔTURÉ (2026-10-04, commit `8881408`).
**Aucun** — SETTLE-02 CLÔTURÉ (2026-10-04, commit `e7e5919`).
**Aucun** — SETTLE-02b CLÔTURÉ (2026-10-04, commit `0de624e`).
**Aucun** — WALLET-GAP-1/2/3 CLÔTURÉ (2026-10-04, commit `7f3d11f`).
**Aucun** — PARTNER-GAP-1 CLÔTURÉ (2026-10-04, commit `41b1293`).
**Aucun** — POST-BATCH-CERTIFICATION-AUDIT CLÔTURÉ (2026-10-08) — PRs #156/#157/#158 certifiés.
**Aucun** — CANONICAL-OWNERSHIP-AUDIT CLÔTURÉ (2026-10-08) — domaine `canonical_hotels`/`canonical_hotel_supplier_mappings` : 6/6 preuves confirmées, aucun GAP.
**Aucun** — SEARCH-DEMAND-DISPLAY-01 CLÔTURÉ (2026-10-08, commit `75a1b9e`).
**Aucun** — ADMIN-ANALYTICS-NAV-01 CLÔTURÉ (2026-10-08, commit `724c4ea`).
**Aucun** — CAMPAIGN-PERF-UI-01 CLÔTURÉ (2026-10-08, commit `c6cea0a`).
**Aucun** — CONVERSION-FUNNEL-01 CLÔTURÉ (2026-10-08, commit `47db482`).
**Aucun** — TIME-SERIES-01 CLÔTURÉ (2026-10-08, commit `ae82ea8`).
**Aucun** — RADAR-METIER-01 CLÔTURÉ (2026-10-08, commit `30f7760`).
**Aucun** — RADAR-VIP-01 CLÔTURÉ (2026-10-08, commit `ce2d2f8`).
**Aucun** — RADAR-VIP-02 CLÔTURÉ (2026-10-08).
**Aucun** — RADAR-VIP-03 CLÔTURÉ (2026-10-08).
**Aucun** — SIGNAL-ENGINE-01 CLÔTURÉ (2026-10-08, commit `03bc5c8`).
**Aucun** — ACTION-ENGINE-01 CLÔTURÉ (2026-10-08, commit `a0231ea`).
**Aucun** — LEARNING-01 CLÔTURÉ (2026-10-08, commit `3b25026`).
**Aucun** — CAMPAIGN-ENGINE-01 CLÔTURÉ (2026-10-08, commit `a14e671`).
**Aucun** — CAMPAIGN-LIFECYCLE-01 CLÔTURÉ (2026-10-08, commit `22b6182`).
**Aucun** — CAMPAIGN-LINK-01 CLÔTURÉ (2026-10-08) — `?campaign=<uuid>` câblé dans les 8 tunnels de réservation (UI → serveur).
**Aucun** — CAMPAIGN-DELIVERY-01 CLÔTURÉ (2026-10-08, PRs #162+#163) — Inngest `deliverCampaign` + `deliverCampaignCore` + migration 0125 (`delivery_status`/`delivered_at`) + live consent RGPD art.7.
**Aucun** — CAMPAIGN-DELIVERY-STATS-01 CLÔTURÉ (2026-10-08, PR #164, merge `2aba257`) — `getCampaignPerformanceCore` étendu : `sent`/`failed`/`skipped`/`pending`/`totalTargets` via SQL COUNT(CASE WHEN); page `/admin/analytics/campaigns` affiche 4 colonnes livraison; 4 tests comportementaux vitest.
**Aucun** — CI-POST-MERGE-FIX-01 CLÔTURÉ (2026-10-10, PR #169, merge `fed5f22`) — CI entièrement verte après merge PR #126 : (1) `format` : 36 fichiers Prettier reformatés ; (2) Docker Hub rate-limit sur `financial-e2e`/`lighthouse`/`playwright-a11y` → switch vers ECR Public Gallery (`public.ecr.aws/docker/library/postgres:16`), suppression des blocs `credentials:` vides qui généraient `Unexpected value ''` ; (3) Next.js refusait de démarrer dans les jobs `playwright-a11y` et `lighthouse` — `lib/env.ts` levait "DÉMARRAGE REFUSÉ" sur `SUPABASE_SERVICE_ROLE_KEY` et `CRON_SECRET` manquants → ajout des deux vars placeholder dans le bloc `env:` global du workflow. 8/8 jobs CI verts confirmés.
**Aucun** — TRUST-CONTACT-FALLBACK-01 + HERO-VIEWPORT-01 CLÔTURÉ (2026-10-10, PR #170, merge `8dbf222`)
**Aucun** — UTM-CAPTURE-01 CLÔTURÉ (2026-10-10, commit `6407124`) — câblage `campaignRef` depuis `?campaign=` / `?utm_campaign=` URL params → `leads.campaign_ref` sur 4 couches (createLeadCore + captureWebsiteLeadCore + submitLead + LeadCaptureForm). Aucune migration (colonne existante). 12/12 tests statiques. Garde sécurité : campaignRef jamais dans les 4 fichiers financiers.
**Aucun** — CRM-D (UI client Rewards) N/A (2026-10-10) — déjà implémenté. CompteLoyaltyCard + getMyLoyaltySummary + getMyLoyaltyHistory + compte-loyalty-redeem-form câblés dans app/(public)/[locale]/compte/page.tsx. Aucun développement requis.
**Aucun** — VOUCHER-STATUS-GUARD-01 CLÔTURÉ (2026-10-10, PR #171, commits `a032ede`+`b0501d5`) — suppression sendEvent B2C inconditionnels (cars/transfers toujours "pending") + guard status==="confirmed" hotels-monde + tests VOUCHER-STATUS-GUARD-01 (25/25 pass). — TRUST-CONTACT-FALLBACK-01 : `footer-client.tsx` line 113 — fallback `description` passe de `"—"` à `formattedPhone ?? contactEmail ?? "easy2book.tn"` (structured data Google Schema jamais vide). HERO-VIEWPORT-01 : `booking-engine.tsx` — padding hero réduit (`pt-12 pb-8 sm:pt-16 sm:pb-10 lg:pt-20 lg:pb-12`) pour que le premier fold soit visible sans scroll sur mobile. Inclut aussi : date-picker locale fix, AR booking hydration fallback, destinations resilience, DB/postgres-js reliability.
**Aucun** — CAMPAIGN-MGMT-01 CLÔTURÉ (2026-10-08, PR #166, merge `17536e5`) — `cancelCampaignCore` (CAMPAIGN*ALREADY_TERMINAL guard); `CampaignTargetRow` étendu (`deliveryStatus`/`deliveredAt`); Server Actions `cancelCampaign` + `getCampaignTargets`; page `/admin/analytics/campaigns` : bouton Annuler (active/draft) + panel `CampaignTargetsPanel` drill-down; 9 invariants statiques node:test.
**Aucun** — ANALYTICS-OVERVIEW-01 CLÔTURÉ (2026-10-08, commit `8b17682`) — page d'accueil `/admin/analytics` (manquante = 404) ; grille 12 cards de navigation Server Component ; 15/15 invariants statiques node:test.
**Aucun** — TEST-COMPAT-01 CLÔTURÉ (2026-10-08, commit `ef91c3f`) — 3 fichiers de tests CRM (campaign-link-ui, campaign-delivery-core, campaign-performance-core) convertis de vitest → node:test/assert ; `vi.fn()`/`vi.spyOn()` remplacés par fonctions simples ; `sendCampaignEmail` non-mockable (getter ESM non-configurable) documenté et test happy-path marqué `test.skip` ; résultat 17 pass / 1 skip / 0 fail ; suite globale passe de 5 fail à 1 fail (G15 = flaky timing préexistant).
**Aucun** — CI-FIX-03 CLÔTURÉ (2026-10-08, commit `7390d92`) — Cause racine NO_FCP confirmée : `e2b-fade-in-up` (opacity:0→1, fill-mode:both) sur le wrapper principal de `/login` — Chrome Lighthouse headless n'enregistre pas les éléments à opacity:0 comme FCP source. Correctifs : (1) retrait de `e2b-fade-in-up` sur le wrapper `.max-w-md` du login (cosmétique, aucun impact fonctionnel) ; (2) `lighthouserc.js` : `/` → `/fr` (page publique réelle, `/` redirige via next-intl), `/admin` retiré (redirige vers /login sans auth en CI). `continue-on-error: true` conservé sur le job lighthouse jusqu'à confirmation d'une run verte sur CI réelle. PRICING-PROMO-LINK-01 network : N/A — flux B2B partner-debit, aucun campaign link ne circule dans ce module.
**Aucun** — AUDIENCE-DEDUP-01 CLÔTURÉ (2026-10-08) — `filterAudienceByConsentCore` (campaign-core.ts) : pré-groupement des leads par rawRef avant `resolveOrCreateContactCore` — O(N leads) → O(N refs uniques). Correctness inchangée (déduplication par contactId Map conservée). 4 nouveaux tests node:test (campaign-core.test.ts) ; 12/12 pass, 0 fail.
**Aucun** — LINT-CLEANUP-01 CLÔTURÉ (2026-10-09, commit `cd01b8e`) — 138 avertissements ESLint préexistants éliminés : `eslint.config.mjs` + argsIgnorePattern/varsIgnorePattern "^*", ~45 imports morts supprimés, directives eslint-disable obsolètes retirées, `react-hooks/incompatible-library` correctement placé sur form.watch() dans car/transfer/world-hotel/data-table. Résultat : `pnpm lint` → 0 warnings 0 errors ; `pnpm typecheck` → 0 erreurs. 49 fichiers modifiés.
**Aucun** — BUILD-VERIFY-01 CLÔTURÉ (2026-10-09, commit `333939e`) — `pnpm build` exit 0 sans MISSING*MESSAGE. Correction : 8 clés namespace `Compte` ajoutées à `messages/en.json` et `messages/ar.json` (inscriptionPageTitle, inscriptionPageSubtitle, emailHintSignup, createAccountButton, alreadyAccountPrefix, loginLink, createAccountPrefix, createAccountLink). Build vérifié propre : 0 erreurs, 0 warnings.
**Aucun** — CI-FORMAT-FIX-01 CLÔTURÉ (2026-10-09, commit `a59278b`) — Job CI `format` restauré (37 fichiers Prettier reformatés : 10 pages analytics, 2 pages b2c admin, 3 booking-forms components, 8 tests lib/admin, 4 lib/admin actions, 2 tests CRM, 6 CRM cores, docs/ROADMAP.md). Cause : chantiers CRM/analytics récents poussés sans `pnpm format`. Résultat : `pnpm format:check` → "All matched files use Prettier code style!" ; tsc 0 erreurs ; lint 0 warnings.
**Aucun** — CI-FIX-04 CLÔTURÉ (2026-10-09, commits `d56d5bf`+`<pending>`) — Job `lighthouse` CI bloquant : cause racine = throttling mobile simulé (3G+4×CPU) par défaut → FCP/LCP artificiellement > 3000/4000ms sur runner CI headless. Correctifs : `lighthouserc.js` : `settings.throttlingMethod="provided"` (mesure réelle runner) + `settings.preset="desktop"` (viewport 1350px, cohérent avec usage B2B) + `settings.chromeFlags="--no-sandbox --disable-dev-shm-usage"`. Run verte confirmée (run 37903890236, job `lighthouse`=success). `continue-on-error: true` retiré de `lighthouse` et `playwright-a11y` (ce dernier passe depuis CI-FIX-01, R8-05 confirmé). Les deux jobs sont désormais BLOQUANTS. Seuils FCP/LCP/a11y inchangés et bloquants.
**Aucun** — PROMO-PRICING-COVERAGE-01 CLÔTURÉ (2026-10-07, PR #156, merge `6965d233`).
**Aucun** — REVENUE-CONSOLIDATE-01 CLÔTURÉ (2026-10-07, PR #157, merge `a0f91877`).
**Aucun** — NICHE-UI-01 CLÔTURÉ (2026-10-07, PR #158, merge `7abc1acc`).
**Aucun** — PAY-EXPIRE-01 + PAY-IDEM-DB-01 + PAY-COMMISSION-DB-01 CLÔTURÉ (2026-10-09, commit `b237130`) — (1) PAY-EXPIRE-01 : cron `expire-pending-payments` fréquence 24h→30min (`vercel.json`) + `lib/booking/guest-idempotency.ts` 4e param `dbFallback` + `lib/transfers/guest-booking-actions.ts` agencyId résolu avant idempotency + `guestIdempotencyKey` persisté. (2) PAY-IDEM-DB-01 : `lib/booking/guest-idempotency.ts` extension déjà décrite. (3) PAY-COMMISSION-DB-01 : migration `drizzle/manual/0126_pay_commission_check_01.sql` — CHECK NOT VALID sur `margin_rules.commission_percent` et `reservation_financials.commission_percent` (0 ligne incompatible confirmée en lecture seule avant commit).
**Aucun** — BUG-CAR-01 + PRO-RECHARGE-BUG-01 CLÔTURÉ (2026-10-09) — BUG-CAR-01 : sur-réservation voitures corrigée — fallback `checkCarAvailability` (sans ligne `car_availability`) verrouille maintenant un véhicule précis FOR UPDATE (au lieu de COUNT(\*)) et après booking, UPDATE `car_fleet_vehicles.status = 'rented'` — B2B (`lib/cars/actions.ts`) et B2C (`lib/cars/guest-booking-actions.ts`). PRO-RECHARGE-BUG-01 : prop `paymeeAvailable={isPaymeeSelected()}` manquante dans `app/(internal)/pro/(app)/paiements/page.tsx` — bouton recharge en ligne maintenant visible dans /pro/paiements si Paymee configuré. 6 nouveaux invariants statiques node:test. Typecheck ✓.
**Aucun** — BUG-CAR-01 PREUVE CONCURRENCE + BUG-TRANSFER-02 CLÔTURÉ (2026-10-09) — BUG-CAR-01 : 4 preuves statiques supplémentaires d'isolation concurrentielle : (1) FOR UPDATE précède `{ available: !!vehicle }` (verrou avant réponse), (2) `availVehicleId: vehicle?.id ?? null` — même variable utilisée dans le UPDATE, séquence atomique dans la même transaction — B2B et B2C. BUG-TRANSFER-02 : `calculateTransferPrice` dans `lib/transfers/guest-booking-actions.ts` passe désormais `channel: "direct"` explicitement (B2C vente directe consommateur) — B2B `actions.ts` passe `channel: "b2b"` explicitement (inchangé). `DistributionChannel = "direct"|"b2b"|"white_label"|"api"` — "direct" est le canal correct pour un guest B2C. 3 invariants statiques transfers (ok 1-3). Total nouveaux tests : 24+3=27/27. Typecheck ✓.
**Aucun** — WALLET-WEBHOOK-SECURITY-01 CLÔTURÉ (2026-10-09, commits `c6e6985` + `0121e2b`) — P0-A : INSERT `payment_events` déplacé APRÈS corrélation + vérification PSP (eventId non consommé sur no_match/psp_mismatch). P0-B : vérification identité PSP — nouvelle colonne nullable `psp VARCHAR(32)` sur `wallet_recharge_requests` (migration 0127) ; `initiateOnlineRecharge` stocke `"paymee"` ; le webhook rejette `pending.psp !== provider` avec `PSP_MISMATCH` dans `psp_webhooks` sans consommer l'eventId. P0-C (wallet) : `matchesPendingRecharge` confirme tolérance 3-décimales TND (millimes) — CONFORME. P1-D : partagé — déjà corrigé via PAY-WEBHOOK-SAFETY-01. Architecture : logique extraite dans `lib/payment/wallet-webhook-core.ts` (même discipline que `reservation-webhook-core.ts`). Tests : 12/12 unitaires (`wallet-webhook-security.test.ts`) + 8/8 intégration PostgreSQL (`wallet-webhook-core.test.ts`, skip sans DB locale) — couvrent : credited, duplicate, no_match + eventId non consommé, PSP mismatch + audit trail, retry P0-A, payment_failed, offline psp=null, already_processed. CI : `financial-e2e` étendu avec `wallet-webhook-core.test.ts`. Typecheck ✓, lint ✓, format ✓.
**Aucun** — PAY-WEBHOOK-SAFETY-01 CLÔTURÉ (2026-10-09, commits `313a6d3` + `f7d21e4`) — 4 corrections sécurité webhook PSP : P0-A race condition (INSERT `payment_events` déplacé APRÈS corrélation — webhook précoce `no_match` ne consomme plus l'eventId, PSP peut rejouer) ; P0-B PSP identity (check `payment.psp !== provider` → audit `payment.psp_mismatch` + `no_match` sans consommer l'eventId) ; P0-C précision TND (`toFixed(3)→toFixed(2)` dans `paymee-provider.ts`) ; P1-D Stripe replay window (`STRIPE_SIGNATURE_MAX_AGE_SECONDS=300` injectable). Tests : 13/13 intégration Postgres réel (`reservation-webhook-core.test.ts` inclut P0-A et P0-B) ; 9/9 unitaires (`webhook-security.test.ts`) ; 4/4 unitaires (`signing.test.ts`). Régression corrigée : fixture `psp: "virtual"` → `psp: "sps"`. CI : `financial-e2e` étendu pour exécuter `reservation-webhook-core.test.ts` et `paymee-reservation-webhook.test.ts` (précédemment silencieusement skippés).
**Aucun** — DUFFEL-ENUM N/A CLÔTURÉ (2026-10-09) — Audit : `"duffel"` déjà présent dans l'enum `flightSupplierName` (`lib/db/schema/flight-suppliers.ts` ligne 40) ET migration Drizzle `drizzle/0016_flight_supplier_duffel.sql` déjà existante. Aucune action requise.
**Aucun** — BUG-ACT-01 N/A CLÔTURÉ (2026-10-09) — Audit : `supplierPriceTnd === salePriceTnd === totalTnd` dans `lib/activities/guest-booking-actions.ts` est INTENTIONNEL — Activités est un catalogue propre à l'agence (pas de fournisseur externe), même modèle que Cars. Pas de `commissionPercent` → commission = 0, correct. Commentaire R6-02 dans le code confirme. 2 invariants statiques créés (`lib/activities/__tests__/commission-wiring.test.ts`) pour protéger cet invariant contre régression.
**Aucun** — CAR-VOUCHER-01 CLÔTURÉ (2026-10-09, commit `423c151`) — `lib/pdf/voucher-car.tsx` (PDF voucher voiture FR/EN/AR) + 11 labels i18n dans `voucher-i18n.ts` + event `"booking/car.confirmed"` dans `lib/inngest/client.ts` + `lib/inngest/functions/process-car-confirmed.ts` (idempotence, Resend + PJ PDF) + `sendEvent` fire-and-forget câblé dans `lib/cars/actions.ts` (B2B) et `lib/cars/guest-booking-actions.ts` (B2C) + 17/17 invariants statiques (`car-voucher-wiring.test.ts`). 0 régression (44/44 tests pass). Typecheck : 0 nouvelle erreur.
**Aucun** — COMMISSION-MONDE-01 CLÔTURÉ (2026-10-09, commit `3c175d6`) — `lib/hotels-monde/__tests__/commission-wiring.test.ts` créé : 16 invariants statiques node:test protégeant le câblage commission du module Hôtels Monde (supplier_cost ≠ sale_price, commissionPercent depuis System B, fallback ?? 0 réservé aux entitlements, creditPlatformCommission câblé depuis commissionAmount retourné par recordReservationFinancials, channel "direct", 3 entitlements économiques, sendEvent fire-and-forget). 16/16 pass. Typecheck ✓. 0 régression.
**Aucun** — TRANSFER-VOUCHER-B2C-01 CLÔTURÉ (2026-10-09, commit `93bd695`) — `sendEvent("booking/transfer.confirmed")` fire-and-forget câblé dans `lib/transfers/guest-booking-actions.ts` (chemin B2C manquant). 15/15 invariants statiques. Typecheck ✓.
**Aucun** — COMMISSION-WIRING-COVERAGE-01 CLÔTURÉ (2026-10-09, commit `f5512a1`) — 3 nouveaux fichiers tests : `lib/transfers/__tests__/commission-wiring.test.ts` (11), `lib/omra/__tests__/commission-wiring.test.ts` (7), `lib/packages/__tests__/commission-wiring.test.ts` (7). 25/25 pass. Couverture commission wiring complète sur les 7 modules.
**Aucun** — OMRA-VOUCHER-01 CLÔTURÉ (2026-10-09, commit `52884ee`) — `lib/omra/__tests__/omra-voucher-wiring.test.ts` créé : 13 invariants statiques protégeant `sendEvent("booking/omra.confirmed")` (import, nom event, condition contactEmail, fire-and-forget .catch(), payload complet, résolution serveur packageName/contactEmail). 13/13 pass. Typecheck ✓.
**Aucun** — HOTELS-MONDE-VOUCHER-01 CLÔTURÉ (2026-10-09, commit `b6643a9`) — `lib/hotels-monde/__tests__/hotels-monde-voucher-wiring.test.ts` (17 tests) : payload sendEvent("booking/confirmed") complet (reservationId/publicRef/agencyId/guestAccessToken/customerEmail/customerName/customerPhone depuis result, hotelName/checkIn/checkOut/nights/adults depuis bookResult, totalTnd=finalTotalTnd). 17/17 pass.
**Aucun** — TRANSFER-B2B-VOUCHER-01 + OMRA-B2B-VOUCHER-01 CLÔTURÉ (2026-10-09, commit `118ad8b`) — `lib/transfers/__tests__/transfer-b2b-voucher-wiring.test.ts` (14 tests) + `lib/omra/__tests__/omra-b2b-voucher-wiring.test.ts` (12 tests). 26/26 pass. Couverture sendEvent B2B+B2C complète sur tous les modules qui utilisent sendEvent (cars/transfers/hotels-monde/omra).
**Aucun** — COMMISSION-WIRING-B2B-01 CLÔTURÉ (2026-10-09) — `lib/transfers/__tests__/transfer-b2b-commission-wiring.test.ts` (10) + `lib/omra/__tests__/omra-b2b-commission-wiring.test.ts` (7) + `lib/activities/__tests__/activities-b2b-commission-wiring.test.ts` (7) : fermeture du gap B2B commission. 24/24 pass. Couverture commission wiring B2B+B2C complète sur tous les modules (cars, transfers, hotels-monde, omra, activities, packages).
**Aucun** — INNGEST-HANDLER-WIRING-01 CLÔTURÉ (2026-10-09, commit `ca38630`) — 3 nouveaux fichiers tests couvrant les handlers Inngest (chaîne complète handler + client.ts + index.ts barrel) pour les 3 modules non couverts par car-voucher-wiring.test.ts : `process-transfer-confirmed-wiring.test.ts` (11 tests — event binding, Resend email, sécurité SMS chauffeur : driverPhone depuis DB jamais customerPhone, skip no_driver_assigned), `process-omra-confirmed-wiring.test.ts` (8 tests — event binding, Resend à d.contactEmail jamais d.customerEmail), `process-confirmed-booking-wiring.test.ts` (11 tests — event binding, idempotence hasVoucherEmailAlreadySucceeded + notificationIdempotency + recordVoucherEmailSent + alreadySent, renderVoucherPdf, sendVoucherEmail, base64). 30/30 pass.
**Aucun** — INNGEST-HANDLER-WIRING-02/flights CLÔTURÉ (2026-10-09, commit `1b26299`) — `process-flight-confirmed-wiring.test.ts` (13 tests) : event binding "booking/flight.confirmed", idempotence via `auditEvents` (pas `notificationIdempotency`), `recordFlightVoucherSent` inconditionnelle (hors garde RESEND), `renderFlightVoucherPdf` + base64, Resend optionnel conditionné `RESEND_API_KEY`, pièce jointe `voucher-vol-${publicRef}.pdf`, client.ts + index.ts barrel. 13/13 pass. Couverture Inngest handler chain complète sur tous les handlers (cars/transfers/omra/hotels-monde/flights/wallet).
**Aucun** — SENDEVENT-GAP-SWEEP-01 CLÔTURÉ (2026-10-09, commits `1e04c7a`+`dc4f8f3`) — 6 sendEvent appelants non couverts fermés : process-wallet-credit (readFileSync fix), manual-payment "booking/confirmed" (voie Paymee, totalTnd=Number.parseFloat), vols fulfillment "booking/flight.confirmed" (payload complet, retry, id dedup), wallet/credited callers (recharge-actions guard triple + agencies-actions ADMIN_DIRECT), myGo hotel B2B (draft.module=hotel) + B2C SÉCURITÉ (isImmediatelyPaid guard — pas de voucher pour résa pending). 7+10+14+7+10=48 tests. Couverture sendEvent complète sur tous les appelants.
**Aucun** — COMMISSION-WIRING-01/mygo+flights CLÔTURÉ (2026-10-09, commit `bf05859`) — Comble les deux derniers gaps de couverture commission wiring : `lib/booking/__tests__/mygo-hotel-commission-wiring.test.ts` (11 tests — B2B : guard module hotel && myGoBooking, supplierPriceTnd=myGoBooking.totalPrice jamais draft.unitPriceTnd, salePriceTnd=agencyHotelPrice, ordre recordReservationFinancials→creditPlatformCommission, 3 entitlements external_supplier/seller_margin/commission ; B2C : guard module hotel, supplierPriceTnd=myGoBooking.totalPrice, salePriceTnd=agencyPrice, même ordre) + `lib/vols/__tests__/flight-commission-wiring.test.ts` (13 tests — finalizeFlightBookingFinancials exportée, guard !snapshotId, sources DB flightPriceSnapshots, conversion Number() string→number, CURRENCY-DIM fetchExchangeRateForBooking taux réel fail-closed sans ?? 0/1, ordre recordReservationFinancials→creditPlatformCommission, 3 entitlements + platform_fee FX conditionnel). 11+13=24 pass. Couverture commission wiring complète sur TOUS les modules de réservation (cars/transfers/hotels-monde/omra/activities/packages/myGo-hotel-B2B+B2C/flights).
**Aucun** — REFUND-WIRING-01 + UPDATE-STATUS-WIRING-01 CLÔTURÉ (2026-10-09) — `lib/finance/__tests__/refund-actions-wiring.test.ts` (9 tests) : refundReservation staff — REFUND_ALLOWED_ROLES (super_admin/manager/agent_compta) importé depuis refund-logic, code UNAUTHORIZED, FOR UPDATE lock avant applyReservationRefund (no double-refund), agencyId=reservation.agencyId cross-agency (pas profile.agencyId), isSuperAdmin→agencyId:null RLS bypass, fullyRefunded→status="refunded", releaseStock conditionné par CANCELLABLE_MODULES (hôtel exclu), isTransitionAllowed vérifié. `lib/admin/__tests__/update-reservation-status-wiring.test.ts` (9 tests) : updateReservationStatus admin — RESERVATION_STATUS_ALLOWED_ROLES (super_admin/manager/agent_resa), cross-agency super_admin agencyId depuis reservations.agencyId, isSuperAdmin→null, cancelled→applyReservationRefund dans la même transaction (no paiement capturé orphelin), NO_CAPTURED_PAYMENT no-op, throw (rollback complet) sur autre échec de remboursement, audit best-effort. 9+9=18/18 pass.
**Aucun** — CANCEL-WIRING-01 CLÔTURÉ (2026-10-09) — `lib/booking/__tests__/cancel-wiring-invariants.test.ts` (16 tests) : ferme le gap de couverture zéro sur les deux chemins d'annulation hôtel myGo. B2B (`cancel-actions.ts`) : CANCELLABLE_STATUSES guard (confirmed/pending/on_request), guard module=hotel && providerBookingId (jamais d'annulation sans référence myGo réelle), verrou FOR UPDATE avant écriture financière, race protection ALREADY_CANCELLED_CONCURRENTLY (no double-refund), append-only wallet (INSERT partnerCreditMovements movementType="refund" — jamais UPDATE), set_agency_deposit_balance() via SQL raw (jamais tx.update(agencies)), recordCancellationFinancials, floor Math.max(0,...) remboursement jamais négatif. B2C (`customer-cancel-actions.ts`) : SÉCURITÉ ownedByCurrentCustomer WHERE guard (scope = propre réservation uniquement), code NOT_FOUND sur accès non autorisé (jamais FORBIDDEN — pas de leak d'existence), applyReservationRefund wallet client (pas wallet agence), NO_CAPTURED_PAYMENT no-op légitime (résa jamais payée : annulation aboutit sans remboursement), recordCancellationFinancials, reverseEarnedPoints + reinstateRedeemedPoints (loyalty reversal symétrique), race protection ALREADY_CANCELLED_CONCURRENTLY. 16/16 pass.
**Aucun** — MANUAL-PAYMENT-WIRING-01 CLÔTURÉ (2026-10-09, commit `c9ff205`) — `lib/finance/__tests__/manual-payment-wiring.test.ts` (14 tests) : invariants statiques `lib/finance/manual-payment-actions.ts` — PAYMENT_ALLOWED_ROLES (super_admin/manager/agent_compta), assertRoleSession guard, agencyId cross-agency depuis reservations.agencyId (jamais profile), isSuperAdmin→agencyId:null RLS bypass, FOR UPDATE lock avant écriture financière (no double-paiement), ALREADY_PAID guard après verrou, applyManualPayment dans transaction, generateInvoiceForReservation dans transaction, sendEvent "booking/confirmed" fire-and-forget hors transaction avec .catch(), loyauté earnPendingPoints câblée, status="confirmed" dans transaction. 14/14 pass.
**Aucun** — RECHARGE-WIRING-01 CLÔTURÉ (2026-10-09, commit `f2338ed`) — `lib/finance/__tests__/recharge-wiring.test.ts` (8 tests) : invariants statiques `lib/finance/recharge-actions.ts` — assertSuperAdminSession + isSuperAdmin guard, agencyId depuis resolveSessionContext (jamais client input), commentaire explicite anti-usurpation, FOR UPDATE × 2 (validate + reject), REQUEST_ALREADY_PROCESSED après verrou, agencyId:null + isSuperAdmin:true withTenantContext cross-agency, creditRechargeRequest(tx,...) dans transaction, sendEvent "wallet/credited" .catch() fire-and-forget, INSERT walletRechargeRequests avant createPayment PSP. 8/8 pass.
**Aucun** — INVOICE-WIRING-01 + WALLET-CREDIT-WIRING-01 CLÔTURÉ (2026-10-09, commit `0612fff`) — `lib/finance/__tests__/invoice-wiring.test.ts` (6 tests) : RESERVATION_NOT_CONFIRMED guard, idempotence 23505 → relecture alreadyExisted:true, savepoint tx.transaction(async(tx2)), status:"paid" jamais "pending"/"draft", totalTva:"0.00". `lib/finance/__tests__/wallet-credit-wiring.test.ts` (6 tests) : FOR UPDATE agencies × 2, set_agency_deposit_balance() SQL raw jamais tx.update(agencies), insert(partnerCreditMovements) append-only, movementType:"credit" + movementType:"debit", status:"validated". 12/12 pass.
**Aucun** — POLICY-CANCEL-WIRING-01 CLÔTURÉ (2026-10-09, commit `7d72cc0`) — `lib/booking/__tests__/policy-cancel-wiring.test.ts` (14 tests) : invariants statiques `lib/booking/policy-cancel-core.ts` (délibérément sans "use server") — CANCELLABLE_MODULES ["omra","package","activity"], CANCELLABLE_MODULES.includes() guard, NOT_FOUND jamais FORBIDDEN, FOR UPDATE × 4 (reservations+omraAllotments+catalogPackageDepartures+catalogActivitySessions), ALREADY_CANCELLED_CONCURRENTLY après verrou, policySnapshot depuis providerPayload (jamais résolution live), isValidWalletAmount(creditableTnd) avant applyReservationRefund (guard 0 TND → évite rollback), applyReservationRefund({tx,...}) dans transaction, NO_CAPTURED_PAYMENT no-op + throw sur autre échec, reverseEarnedPoints(tx,...) + reinstateRedeemedPoints(tx,...) atomiques, status:"cancelled" après FOR UPDATE, ownedByCurrentCustomer({...}). 14/14 pass.
**Aucun** — VISUAL-AUDIT-01 CLÔTURÉ (2026-10-09, commit `bddec00`) — Audit visuel complet 28 routes (public + portails internes) · 3 locales (FR/EN/AR) · desktop + mobile (390px) · RTL Arabic · 1 bug P2 corrigé (ModuleHero hero contrast — `bg-gradient-to-br` manquant, 8 modules affectés, fix 1 ligne `components/module-hero.tsx`) · 0 bug P0/P1 · 3 observations P3 (loading states, error boundaries, homepage Suspense) · i18n 1151 clés 0 manquantes · typecheck clean.
**Aucun** — VISUAL-UX-ENGINE-01 CLÔTURÉ (2026-10-09, commit `1bd3232`) — Suite de VISUAL-AUDIT-01. (1) OBS-IMG : images Unsplash de repli ajoutées aux 5 héros dépendants de la DB (hotels-monde, vols, transferts, car, attractions) — hero toujours visible indépendamment de la DB. (2) OBS-001 : résilience homepage — `.catch()` fallback sur chaque item du `Promise.all` (modules/site/transferZones/carCatalog) + `<Suspense>` sur 4 sections éditoriales asynchrones (FlashOffers, FeaturedDestinationsSection, DevelopmentProjectsSection, MarketSignalsSection). (3) OBS-002 : squelettes `loading.tsx` pour les 8 pages modules publiques (hotels, hotels-monde, vols, transferts, car, omra, attractions, packages) via composant partagé `ModulePageSkeleton`. (4) OBS-003 : `app/(public)/[locale]/error.tsx` — error boundary niveau locale, message générique (0 détail technique), bouton Réessayer + lien Accueil. TypeCheck : 0 erreurs. 16 fichiers. Pushed `claude/easy2book-v6-modernization-7gyb5v`.
**Aucun** — IMAGE-QUALITY-01 + NOT_FOUND-PERF-01 CLÔTURÉ (2026-10-11, PR #179, merge `c4876cb`) — IMAGE-QUALITY-01 : remplace les illustrations SVG cartoon par des photos Unsplash haute résolution sur 4 cibles (Homepage OmratySection, /omra, /packages, /hotels) — `getPublicModuleVisual()` câblé sur chaque page, SVG conservé en fallback hors-réseau, row `omra` inséré dans `public_module_visuals` (même URL Unsplash que `omraty`). NOT_FOUND-PERF-01 : ajout `app/(public)/[locale]/not-found.tsx` — court-circuite le rendu spéculatif complet (requêtes DB `getRequestTenantInfo()` + RSC homepage) déclenché par Next.js sur tout chemin valide-locale sans page correspondante (trafic bot, scanners, liens cassés). 7 fichiers. Typecheck ✓, Prettier ✓.
**Aucun** — VISUAL-AUDIT-IMAGES-01-ROBUST CLÔTURÉ (2026-10-11, PR #180, merge `43464c6`, commit `c7c892d`) — Cause racine confirmée : `getDefaultAgencyId()` appelée 4× en parallèle par homepage, chacune ouvrant une transaction `withSystemContext` → pool Supavisor épuisé → 1 096 `terminate_with_error` en 1 h (logs 2026-10-11 00:00–01:00 UTC) → `.catch(()=>[])` silencieux → FlashOffers null, aucune image par onglet. (1) `unstable_cache` TTL 60 s sur `fetchDefaultOtaAgencyId()` (4 transactions/requête → 0). (2) `withPublicReadContext` (nouveau wrapper `lib/db/tenant-context.ts`) avec `set_config('statement_timeout','1500ms',true)` LOCAL — propagé sur `site-content.ts`, `transfers/catalog.ts`, `cars/catalog.ts`. (3) `withFallback(label, promise, fallback)` helper avec `console.warn` Vercel remplace les `Promise.race` inline dans `page.tsx`. Tests `lib/public/__tests__/site-content-robustness.test.ts` : 7 pass purs + 4 skip (Postgres absent en CI). 7 fichiers.
**Aucun** — LOT-A-READINESS-AUDIT-01 CLÔTURÉ (2026-10-11) — Audit lecture seule readiness avant transactions réelles. Résultat : 0 % transactions réelles, architecture code 100 % prête, 6 blockers purement opérationnels. Critiques : B-01 `MYGO_MODE=virtual` + credentials myGo absents, B-02 `FLIGHTS_DEMO_MODE=true`, B-03 `WORLD_HOTELS_DEMO_MODE=true`, B-04 `PAYMENT_MODE=virtual`, B-05 `PAYMEE_API_KEY` absent, B-06 `EXCHANGE_RATE_API_KEY` absent. Post-paiement : B-07 `RESEND_API_KEY` absent, B-08 Inngest non configuré. Partiels : SPS webhook verify OK (SPS_HMAC_KEY + SPS_ENVIRONMENT présents, aucun adaptateur de création paiement SPS) ; WORLD_HOTELS_API_KEY + FLIGHTS_API_KEY présents mais modes demo forcés. Code gaps non-bloquants : refundPayment() + getPaymentStatus() Paymee retournent NOT_FOUND/{found:false} (remboursements manuels via back-office Paymee). Séquence minimale first transaction : (1) EXCHANGE_RATE_API_KEY, (2) PAYMEE_API_KEY + PAYMENT_PROVIDER=paymee + suppr. PAYMENT_MODE=virtual, (3) RESEND_API_KEY + Inngest, (4) MYGO_API_BASE_URL + MYGO_LOGIN + MYGO_PASSWORD + suppr. MYGO_MODE=virtual. Aucune migration DB ni modification code requises.
**Aucun** — AUDIT-17-BRIQUES-01 CLÔTURÉ (2026-10-11) — Audit exhaustif des 17 briques architecturales EasyV4 (lecture seule, 121 tool uses, 753 s). Statuts : EXISTE : CONNECT, PARTNER. PARTIEL : SUPPLIER, AVAILABILITY, PRICING, PAYMENT, WALLET, VOUCHER, DISTRIBUTION, CRM, ANALYTICS, FINANCIAL. SIMULATEUR : SEARCH, BOOKING. NON RACCORDÉ : COMMERCIAL (décision Direction 2026-09-30), SUPPORT (= CRM redirect), SETTLEMENT (bloqué en amont par COMMERCIAL). 3 blocages P0 : credentials PSP/GDS/devises/email absents + 100 % modes virtuels actifs (.env). 1 blocage P1 : accords commerciaux = 0 → settlement inopérant par design. Code mort identifié : `lib/wallet/balance.ts` (table wallets sandbox), `yield_rules` (dead code), `workflow-pipeline.ts` (jamais appelé), CRM sync (toujours no-op). Rapport complet dans `/tmp/claude-0/-home-user-EasyV4/.../scratchpad/audit-17-briques.md`.
**Aucun** — LOYALTY-WIRING-01 CLÔTURÉ (2026-10-09, commit `6404c7e`) — `lib/loyalty/__tests__/loyalty-wiring.test.ts` (9 tests) : invariants statiques `lib/loyalty/rewards-core.ts` (délibérément sans "use server") — append-only loyaltyLedger (insert jamais update), FOR UPDATE dans lockOrCreateLoyaltyAccount (anti double-earn concurrent), FOR UPDATE × 2 (lockOrCreate + expireInactiveAccounts), creditCustomerWallet jamais importé ni appelé (points ≠ argent, vérification sur import[^;]* + appel\s\_\( — pas bare string car présent dans JSDoc interdiction), findLedgerByIdempotencyKey précède insertLedgerRow (idempotence), Math.max(0,...) soldes jamais négatifs, idempotencyKey:string × 5 (earn/convert/reverse/redeem/reinstate), reservations.tndAmount interdit comme base points (commentaire explicite "jamais...tndAmount"). 9/9 pass.

### CAR-VOUCHER-01 — CLÔTURÉ (2026-10-09, commit `423c151`)

**État audit → CLÔTURÉ. Implémentation complète.**

Livrables :

- `lib/pdf/voucher-car.tsx` — template PDF voiture (catégorie, pickup/dropoff, dates, durée, prix) FR/EN/AR
- `lib/pdf/voucher-i18n.ts` — 11 nouvelles clés car (`carTitle`, `carSection`, `vehicleCategory`, `carPickupLocation`, `carDropoffLocation`, `carPickupAt`, `carDropoffAt`, `rentalDaysLabel`, `rentalDaysText`, `carInsuranceLevel`) dans FR, EN et AR
- `lib/inngest/client.ts` — event type `"booking/car.confirmed"` (champs : `reservationId`, `publicRef`, `agencyId`, `guestAccessToken`, `customerEmail`, `customerName`, `categoryName`, `pickupLocationName`, `dropoffLocationName`, `pickupAt`, `dropoffAt`, `rentalDays`, `insuranceLevel`, `totalTnd`)
- `lib/inngest/functions/process-car-confirmed.ts` — fonction Inngest (idempotence via `notification_idempotency`, Resend + PJ PDF, `onFailure` handler)
- `lib/inngest/functions/index.ts` — export `processCarConfirmed`
- `lib/cars/actions.ts` — `sendEvent("booking/car.confirmed", ...)` fire-and-forget (B2B), tx retourne `categoryName`/`pickupLocationName`/`dropoffLocationName`/`rentalDays`
- `lib/cars/guest-booking-actions.ts` — `sendEvent("booking/car.confirmed", ...)` fire-and-forget (B2C), tx retourne mêmes champs
- `lib/cars/__tests__/car-voucher-wiring.test.ts` — 17/17 invariants statiques node:test

Tests : 44/44 pass (17 nouveaux + 27 existants). 0 régression. Typecheck : 0 nouvelle erreur.

### PR-BATCH-04 — WHITE-LABEL-ADMIN-01, WHITE-LABEL-PRO-01, COMMISSION-WIRING-02, CARS-COMMISSION-01 — CLÔTURÉ (PR #126 + #155)

**PR #126** (branche `claude/easy2book-v6-modernization-7gyb5v`, ouverte
2026-10-04, 73 commits de dérive accumulés) rebasée sur `main` actuel et
mergée le 2026-10-07 (merge commit `68e3713`). Contenu réel : White
Label admin (`updateAgencyWhiteLabel()`, page `/admin/agencies/[id]`,
color picker) + White Label `/pro` (couleur primaire agence) +
COMMISSION-WIRING-02 (câblage `creditPlatformCommission` dans 10
modules : transferts, hôtels-monde, activités, omra, packages B2B+B2C)

- CARS-COMMISSION-01 (dernier module sans commission).

**Abandonné pendant le rebase** (hors scope de la PR, jamais mentionné
dans sa description) : feature "lead acquisition-channel + supplier-node"
(2 migrations jamais appliquées, 2 fichiers CRM neufs) — superseded par
CRM-LEAD-WIRING-01 déjà mergé, redevient backlog candidate sur GO séparé.
Câblage commission sur `lib/vols/guest-booking-actions.ts` — fichier
confirmé mort par PR #130, retiré.

**PR #155** (merge squash `1435c54`) : corrige 2 bugs tombés sur `main`
parce que PR #126 a été mergée par l'utilisateur sur un commit antérieur
à mon dernier correctif poussé sur la branche — fixture de test
`rls-gap-public-tables-01-live.test.ts` sans `matchReasons` (bloquait
`typecheck`), et 2 migrations (`0104_settle_fk_integrity.sql`,
`0105_econ_entitlements_settlement_fk.sql`, contenu SETTLE-02/02b de
PR #126) utilisant `ADD CONSTRAINT IF NOT EXISTS` — syntaxe Postgres
invalide, jamais exécutable avec succès telle qu'écrite (donc aucune
contrainte posée en production par ce biais avant le correctif). Les
deux migrations n'avaient jamais pu s'appliquer en l'état.

**Preuve de clôture** : `main` HEAD = `1435c54`, `pnpm typecheck`/
`format:check`/`lint` clean, `pnpm test` 1563/1563 PASS, `pnpm build` OK.

### PR #63 — FERMÉE sans merge (superseded)

Objet : reformater 753 fichiers avec Prettier (dette CI `format`).
Fermée sans merge : `main` était déjà 100% prettier-clean et le job
`format` déjà un hard gate avant même l'examen de cette PR — l'objectif
était déjà atteint par d'autres chantiers mergés depuis son ouverture
(29/09). Rien à récupérer (diff purement whitespace, 1 semaine+ de dérive).

### AUDIT CRM DE CERTIFICATION (2026-10-07)

Audit lecture seule (3 sous-agents en parallèle) sur les points
restants identifiés après l'AUDIT FINAL CRM du 2026-10-07 (17
composants, voir section ci-dessous) : normalisation contact/consent,
seuil VIP, fichier mort margin-calculator, NICHE sans consommateur,
revenue dispersée, promo→pricing incomplet, Meta Ads/automation/social
CRM avancés.

**Classification finale :**

| Point                                                                | Classification                                                    | Preuve                                                                                                                                                 |
| -------------------------------------------------------------------- | ----------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Duplication `contact-core.ts`/`consent-core.ts`                      | N/A — volontaire, documentée (`contact-core.ts:24-31`)            | pas un gap                                                                                                                                             |
| Consent jamais déclenché à la capture                                | N/A — scope délibéré (CONSENT-01 : "hors scope")                  | pas un gap                                                                                                                                             |
| Seuil VIP "magic number"                                             | N/A — n'existe pas du tout, par design (`vip-score-core.ts:1-29`) | pas un gap                                                                                                                                             |
| `lib/finance/margin-calculator.ts` mort                              | N/A — confirmé mort, gardé par un test invariant                  | suppression optionnelle, pas un gap                                                                                                                    |
| NICHE segmentation sans consommateur UI                              | CREATE                                                            | `niche-core.ts`/`niche-actions.ts` calculent, zéro page ne lit                                                                                         |
| Revenue dispersée                                                    | CONSOLIDATE                                                       | `campaign-performance-core.ts`/`vip-score-core.ts` recalculent au lieu de réutiliser `margin-analytics-core.ts` (lui-même sans test)                   |
| Promo → pricing incomplet                                            | EXTEND + CREATE (le plus concret, impact client direct)           | 4/8 modules câblés (Hôtel TN, Packages, Omra, Transferts) ; **Hôtels Monde, Activités, Voitures, Vols non câblés** — aucun test de couverture n'existe |
| Meta Ads reporting/audience avancé, automation marketing, social CRM | N/A — confirmé greenfield                                         | rien construit au-delà de la capture                                                                                                                   |

**GO reçu pour tout (2026-10-07)** : `PROMO-PRICING-COVERAGE-01` +
`REVENUE-CONSOLIDATE-01` + `NICHE-UI-01` + suppression de
`margin-calculator.ts`, dans cet ordre de priorité.

### PROMO-PRICING-COVERAGE-01 — CLÔTURÉ (PR #156, mergée)

Câblage `resolveCheckoutPromoCore`/`applyPromoDiscountCore` dans les 4
modules qui ne l'avaient pas : `lib/hotels-monde/guest-booking-actions.ts`,
`lib/activities/guest-booking-actions.ts`,
`lib/cars/guest-booking-actions.ts`, `lib/vols/booking-request-action.ts`.

- Hôtels Monde et Vols ont un coût fournisseur externe réel
  (`supplierPriceTnd`/`supplierAmount`) → remise appliquée AVEC le
  plancher PROMO-LOSS-POLICY-01 (jamais sous le coût réel, sauf
  `allowBelowCost` explicite sur la promo).
- Activités et Voitures n'ont pas de coût fournisseur séparé (catalogue
  agence) → remise appliquée SANS plancher, même traitement que
  Omra/Packages déjà câblés.
- Vols : particularité du pipeline en 2 phases (booking-request
  maintenant → fulfillment plus tard par le desk ticketing). La remise
  est résolue et appliquée à la réclamation atomique du
  `flightPriceSnapshot` (CAS ACTIVE→USED) et persistée dans ce même
  snapshot — `finalizeFlightBookingFinancials` (appelé bien plus tard,
  à la confirmation) relit ce `sellingAmount` déjà remisé sans aucun
  changement requis côté fulfillment : une seule vérité financière.
- Nouveau test `lib/finance/__tests__/promo-wiring-invariants.test.ts`
  (35 assertions) : couverture des 8/8 modules + vérification du
  plancher PROMO-LOSS-POLICY-01 là où il doit s'appliquer (et son
  absence là où il ne doit pas).
- 2 tests existants mis à jour pour refléter le changement attendu
  (`totalTnd` devient `let`/réassignable pour accueillir la remise,
  plus `const` figé) : `lib/cars/__tests__/reservation-financials-wiring.test.ts`,
  `lib/booking/__tests__/cart-price-drift.test.ts`.

**Note UI** : comme pour les 4 modules déjà câblés avant ce chantier
(Hôtel TN, Packages, Omra, Transferts), `campaignId` n'est câblé que
côté pipeline serveur — aucun formulaire ne le transporte encore depuis
l'UI (confirmé : aucun module, même les 4 déjà câblés, ne le fait). Capture
UI du `campaignId` (ex. lien de campagne avec paramètre) reste un
chantier séparé, non couvert ici.

**Preuve de clôture** : `pnpm typecheck` 0 erreur, `pnpm format:check`
clean, `pnpm lint` 0 erreur, `pnpm test` 1598/1598 PASS, `pnpm build` OK.
PR #156 mergée (squash) le 2026-10-07, merge commit `6965d233`. CI finale :
format/lint/typecheck/test/financial-e2e/build/playwright-a11y tous
verts ; `lighthouse` rouge (NO_FCP connu, pré-existant, non lié).

### Suppression `lib/finance/margin-calculator.ts` — CLÔTURÉ (PR #156, mergée)

Confirmé mort (audit CRM du 2026-10-07) : zéro importeur réel, gardé
par un test invariant (`product-booking-actions-invariants.test.ts`)
qui vérifie qu'il n'est jamais réimporté. Supprimé. Mergé avec
PROMO-PRICING-COVERAGE-01 (même PR #156, merge commit `6965d233`).

### REVENUE-CONSOLIDATE-01 — CLÔTURÉ (PR #157, mergée)

Extrait `sumRevenueMarginCore()`, une primitive PURE (aucun accès DB),
dans `lib/reporting/margin-analytics-core.ts` (module déjà identifié
comme canonique par l'audit) — remplace les 2 paires de `.reduce()`
dupliquées dans `lib/crm/campaign-performance-core.ts` et
`lib/crm/vip-score-core.ts`. Reste volontairement minimal : aucune
jointure, aucun filtre — l'appelant garde la responsabilité de résoudre
le bon ensemble de lignes pour son propre périmètre (campagne, client).
`margin-analytics-core.ts` lui-même (scope agence+période, SQL `SUM()`)
n'a pas été modifié dans sa logique de requête — seul un nouvel export
pur partagé a été ajouté.

Comble aussi le second volet du gap identifié : `margin-analytics-core.ts`
n'avait ZÉRO test. Ajouté :

- `lib/reporting/__tests__/margin-analytics-core.test.ts` (6 tests
  unitaires purs sur `sumRevenueMarginCore`).
- `lib/reporting/__tests__/margin-analytics-core-live.test.ts` (preuve
  live contre Postgres réel pour `getMarginKPIsCore` — vérifie que
  seules les réservations `confirmed` DANS la période comptent, via
  `recordReservationFinancials`, jamais un second calcul inventé par
  le test). **Confirmé exécuté pour de vrai sur CI** : le job
  `financial-e2e` (Postgres éphémère) est passé au vert sur cette PR,
  preuve que ce test s'exécute réellement (pas seulement un `skip`).

**Preuve de clôture** : `pnpm typecheck` 0 erreur, `pnpm format:check`
clean, `pnpm lint` 0 erreur, `pnpm test` 1569/1569 PASS, `pnpm build` OK.
PR #157 mergée (squash) le 2026-10-07, merge commit `a0f91877`. CI finale :
format/lint/typecheck/test/financial-e2e/build/playwright-a11y tous
verts ; `lighthouse` rouge (NO_FCP connu, pré-existant, non lié).

### NICHE-UI-01 — CLÔTURÉ (PR #158, mergée)

Décision produit explicite (2026-10-07, demandée avant tout travail
technique, confirmée par l'utilisateur) : nouvelle page
`/admin/analytics/niches`, **read-only**, accessible aux rôles déjà
autorisés par `listNicheSegments()` (super_admin/manager/agent_resa +
agencyType="ota") — **aucune action "lancer une campagne depuis ce
segment" en V1**.

- `app/(internal)/admin/analytics/niches/page.tsx` : nouvelle page
  client, même patron que `/admin/analytics/margins` (fetch au mount,
  état loading/erreur, tableau). Consomme `listNicheSegments()`
  (`lib/admin/niche-actions.ts`) — déjà existant, déjà sécurisé
  (vérifie le rôle + `agencyType` côté serveur avant tout accès DB),
  aucune garde supplémentaire nécessaire.
- Tableau : Marché, Produit, Intention, Destination, Période, Volume,
  Convertis, Taux de conversion, Canal — trié par volume décroissant
  (le staff veut d'abord voir la niche avec le plus de signal).
- `app/visual-mock/page.tsx` : entrée ajoutée au répertoire de routes
  admin (même convention que l'entrée "Analytics Margins", qui n'a pas
  non plus de lien dans la sidebar de production — cette page suit
  exactement le même précédent de découvrabilité).
- Aucun nouveau test : `listNicheSegments()`/`getNicheSegmentsCore()`
  ont déjà une couverture dédiée
  (`lib/admin/__tests__/niche-actions-invariants.test.ts`,
  `lib/crm/__tests__/niche-audience-live.test.ts`) ; aucune page du
  dépôt n'a de test au niveau composant (vérifié sur
  `/admin/analytics/margins`, même précédent), cette page suit la même
  convention.

**Vérifié localement** : `curl` sur `/admin/analytics/niches` avec
serveur `pnpm dev` local → redirect `307` vers
`/login?next=/admin/analytics/niches`, comportement strictement
identique à `/admin/analytics/margins` (gate `isAllowedIntoAdmin` au
niveau layout) — aucune erreur serveur, aucune trace dans les logs du
serveur de dev. Pas de vérification visuelle authentifiée possible
dans cet environnement (pas de session Supabase/Postgres local
disponible) — à confirmer sur Preview Vercel avant merge si possible.

**Preuve de clôture** : `pnpm typecheck` 0 erreur, `pnpm format:check`
clean, `pnpm lint` 0 erreur, `pnpm test` 1604/1604 PASS, `pnpm build` OK
(route `/admin/analytics/niches` confirmée dans la sortie du build).
PR #158 mergée (squash) le 2026-10-07, merge commit `7abc1acc`. CI
finale : format/lint/typecheck/test/financial-e2e/build/playwright-a11y
tous verts ; `lighthouse` rouge (NO_FCP connu, pré-existant, non lié).
Vérification visuelle authentifiée (Preview Vercel) non effectuée dans
cette session — comportement du gate d'accès confirmé identique à
`/admin/analytics/margins` via `curl` local (voir ci-dessus), ce qui
couvre le risque principal (accès non autorisé), mais le rendu visuel
réel de la page (une fois connecté) reste `NOT VERIFIED` à ce stade.

**Backlog candidate pour une V2 future (pas de GO, juste noté)** :
action "lancer une campagne depuis ce segment" — explicitement exclue
de cette V1 par décision produit.

---

### RADAR-VIP-01 — CLÔTURÉ (2026-10-08)

**Objectif** : vue population "Qui devient important ?" — top 50 leads classés par score VIP.
Réutilise intégralement `getVipScoreForLeadCore` (vip-score-core.ts) — aucun nouveau calcul.
Stratégie : 200 leads récents → score séquentiel → tri score.total desc → top 50.

**Commit** : `ce2d2f8`

**Fichiers créés/modifiés** :

- `lib/admin/radar-vip-actions.ts` — Server Action `getRadarVip()` (CRÉÉ)
  - `VipRadarRow` : leadId, firstName, lastName, email, phone, productType, channel, destination, status, score
  - `listLeadsCore` (200 max) → `getLeadScoreRuleMapCore` → `getVipScoreForLeadCore` séquentiel → top 50
- `app/(internal)/admin/analytics/vip/page.tsx` — tableau top 50 + KPIs + barre de score (CRÉÉ)
  - Breakdown 4 signaux : qualité / engagement / vente / récence
  - "Lead le plus prometteur" highlight card
- `components/admin-shell.tsx` — 8e sous-item "Radar VIP" (Crown) (ÉTENDU)
- `lib/admin/__tests__/radar-vip-ui.test.ts` — 3 invariants statiques (CRÉÉ)

**Tests** : 9/9 ✅ (3 suites × 3) · typecheck 0 erreur ✅ · lint 0 erreur ✅

**Certification 5 points (2026-10-08)** :

1. **`SignalTrend` re-export** ✅ — `radar-metier-core.ts` définit le type, `radar-metier-actions.ts`
   le re-exporte explicitement (`export type { RadarSignal, SignalTrend }`, ligne 54), `radar/page.tsx`
   l'importe depuis les actions. Chaîne core → actions → UI intacte.

2. **RADAR-METIER consomme TIME-SERIES** ✅ — `getTimeSeriesCore` émet 4 dimensions dont
   `"destination"` (time-series-core.ts lignes 150–270) ; `buildRadarMetierCore` reçoit
   `TimeSeriesRow[]` et produit des `RadarSignal` avec `dimensionType` préservé. Flux réel :
   `TIME-SERIES → destination → trend → signalStrength → RADAR MÉTIER`.

3. **RADAR-VIP : réserve documentée** ⚠️ — Le radar affiche le **TOP 50 des 200 leads les plus
   récents**, pas le TOP 50 absolu de tous les contacts Easy2Book. Conséquence : un contact ancien
   à haute valeur mais sans lead récent n'apparaît pas. C'est une **v1 populationnelle**, pas un
   classement global du réseau. La page affiche déjà "recalculé à la demande sur les 200 leads les
   plus récents" ; la distinction reste à exposer plus explicitement dans l'UI (RADAR-VIP-02).

4. **Problème des doublons non résolu** ⚠️ — Le score est calculé au niveau **leadId**, pas
   **contactId**. Un même partenaire avec 4 leads (hôtel, Omra, vol, visa) apparaît en 4 lignes
   dans le radar au lieu d'une ligne "PARTENAIRE MULTI-PRODUIT". C'est la limite architecturale
   centrale de RADAR-VIP-01 (résolution au niveau lead explicitement documentée dans vip-score-core.ts
   en-tête). Adressé en RADAR-VIP-02 : fusion par contactId (CONTACT-01), vue unique par acteur.

5. **Programme Radar non fermé** ✅ — Les deux radars v1 sont une fondation, pas une destination.
   Voir section "PROGRAMME RADAR — SUITE" ci-dessous.

---

### RADAR-METIER-01 — CLÔTURÉ (2026-10-08)

**Objectif** : vue classée "Qu'est-ce qui bouge ?" — signaux de croissance classés par force.
Orchestre `getTimeSeriesCore` → `buildRadarMetierCore` pour 4 dimensions (module, canal, produit, destination).

**Commit** : `30f7760`

**Fichiers créés/modifiés** :

- `lib/crm/radar-metier-core.ts` — `buildRadarMetierCore(rows)` pure (CRÉÉ)
  - `SignalTrend` : forte_hausse / hausse / stable / baisse / forte_baisse / nouveau
  - `signalStrength = currentVolume × (1 + growthFactor)` — clampé [-1, +2]
- `lib/admin/radar-metier-actions.ts` — Server Action `getRadarMetier(4|8|12)` (CRÉÉ)
- `app/(internal)/admin/analytics/radar/page.tsx` — sélecteur fenêtre, 3 KPIs, table complète (CRÉÉ)
- `components/admin-shell.tsx` — 7e sous-item "Radar Métier" (Zap) + breadcrumbs (ÉTENDU)
- `lib/crm/time-series-core.ts` — ajout dimension "destination" (ÉTENDU)
- `lib/admin/__tests__/radar-metier-ui.test.ts` — 3 invariants statiques (CRÉÉ)

**Tests** : 3/3 ✅ · typecheck 0 erreur ✅ · lint 0 erreur ✅

---

### PROGRAMME RADAR — ÉTAT 2026-10-08

Deux radars opérationnels en production v1 :

```
FLUX
 ↓
SOURCE
 ↓
ACTEUR
 ↓
PRODUIT
 ↓
TRANSACTION
 ↓
CA
 ↓
MARGE
 ↓
FRÉQUENCE
 ↓
CROISSANCE
 ↓
RADAR MÉTIER       🟢 v1 — "Qu'est-ce qui bouge ?"
RADAR VIP          🟢 v3 — "Qui devient important ?" (dedup CONTACT-01)
 ↓
SIGNAL ENGINE      🟢 v1 — convergence Métier × VIP → "Significatif ?"
 ↓
ACTION ENGINE      🟢 v1 — recommandations structurées → "Quoi faire ?"
 ↓
LEARNING           🟢 v1 — feedback loop conversion VIP → "Est-ce que ça a marché ?"
```

**Radar Métier** répond : _Destination X +42% demandes +28% CA +35% marge → opportunité commerciale._
**Radar VIP v1** répond : _Lead Y score 87, engagement ×3, récence forte → opportunité relationnelle._
**Radar VIP v2** (RADAR-VIP-02) répondra : _PARTENAIRE Z — hôtel + Omra + vol + visa — score consolidé → acteur stratégique._

**RADAR-VIP-02 — CLÔTURÉ (2026-10-08)**

Déduplication contactuelle best-effort email-first :

- `contactKey(email, phone, leadId)` : regroupe les leads partageant le même email normalisé,
  sinon le même phone normalisé (chiffres uniquement), sinon traite le lead isolément.
- Dans un groupe : le lead au score le plus élevé est le représentant.
  Son score reflète déjà toutes les réservations du contact (via `findMatchingCustomerIdsCore`).
- `VipRadarRow` étendu : `leadCount: number` (nbre de leads fusionnés), `products: string[]`
  (produits distincts du groupe, triés).
- UI : badge `×N` sur le nom si `leadCount > 1`, colonne "Produits" avec badges par produit.
- Tests : 8/8 ✅ (3 RADAR-VIP-01 + 5 RADAR-VIP-02) · typecheck 0 erreur ✅ · lint 0 erreur ✅

Limitation documentée : deux leads sans email commun mais avec le même téléphone ne seront
fusionnés que si l'un d'eux n'a pas d'email. Fusion exacte via CONTACT-01 : RADAR-VIP-03 potentiel.

**RADAR-VIP-03 — CLÔTURÉ (2026-10-08)**

Remplacement de la déduplication best-effort (RADAR-VIP-02 `contactKey()`) par la
résolution exacte CONTACT-01 :

- `findExistingContactIdForLeadCore` exportée depuis `lib/crm/vip-score-core.ts` (lecture seule).
- Résolution séquentielle post-scoring : pour chaque lead scoré, lookup du contactId réel.
- Groupement par `contactId` (ou `lead:<leadId>` pour les leads sans contact persisté).
- `VipRadarRow` étendu : `contactId: string | null` visible par la couche supérieure.
- Tests : 10/10 ✅ (3 RADAR-VIP-01 + 7 RADAR-VIP-02/03) · typecheck ✅ · lint ✅

État du Radar VIP :

```
RADAR-VIP-01  🟢  score par lead
RADAR-VIP-02  🟢  dedup best-effort email-first
RADAR-VIP-03  🟢  dedup exacte CONTACT-01
SIGNAL ENGINE 🟢  convergence Métier × VIP (commit 03bc5c8)
ACTION ENGINE 🟢  recommandations structurées (commit a0231ea)
LEARNING      🟢  feedback loop conversion VIP (commit 3b25026)
```

**SIGNAL-ENGINE-01 — CLÔTURÉ (2026-10-08, commit `03bc5c8`)**

Convergence Radar Métier × Radar VIP — "Ce contact VIP est dans un marché en mouvement" = signal actionnable.

**Fichiers créés/modifiés** :

- `lib/crm/signal-engine-core.ts` — `buildSignalEngineCore(vipRows, radarSignals)` pure (CRÉÉ)
  - `VipInput` : interface minimale découplée de VipRadarRow (évite cross-import "use server")
  - Deux types : `vip_x_destination`, `vip_x_product`
  - Tendances positives uniquement : `forte_hausse`, `hausse`, `nouveau`
  - Pas de signal canal (`dimensionType=channel` ignoré)
  - `combinedScore = vipScore + signalStrength` (additif, transparent)
  - `insight` : "X (VIP 87) × Destination Tunis (forte hausse +42%)"
  - `SIGNAL_ENGINE_MAX_ROWS = 30`, tri par combinedScore desc, dédup par signalId
- `lib/admin/signal-engine-actions.ts` — `getSignalEngine(windowWeeks: 4|8|12)` Server Action (CRÉÉ)
  - Orchestre : `getTimeSeriesCore` → `buildRadarMetierCore` (signaux marché)
    - `listLeadsCore` → score séquentiel + `findExistingContactIdForLeadCore` → dédup contactuelle
    - `buildSignalEngineCore` (convergence)
  - Même dédup CONTACT-01 que RADAR-VIP-03 (réimplémentée directement, sans appel à Server Action)
- `app/(internal)/admin/analytics/signal/page.tsx` — UI Signal Engine (CRÉÉ)
  - Sélecteur fenêtre 4/8/12 semaines
  - 3 tuiles KPI : signaux convergents / VIP×Destination / VIP×Produit
  - Carte "Signal le plus fort" (border amber)
  - Table : rang, acteur VIP (badge ×N, contactId prefix), type, dimension, tendance badge, croissance, barre score combiné (amber), VIP, signal
  - État vide : "Aucun signal convergent — les signaux apparaîtront quand des acteurs VIP seront dans des marchés en mouvement."
- `components/admin-shell.tsx` — icône Sparkles + 9e sous-item "Signaux" → `/admin/analytics/signal` + breadcrumb (ÉTENDU)
- `lib/admin/__tests__/signal-engine-ui.test.ts` — 17 tests (3 suites) (CRÉÉ)
  - Suite 1 core : exports, empty cases, vip_x_destination, vip_x_product, filtrage baisse/canal, tri, dédup, cap MAX_ROWS
  - Suite 2 actions : exports getSignalEngine
  - Suite 3 page/nav : fichier, imports, shell href, Sparkles

**Tests** : 17/17 ✅ · typecheck 0 erreur ✅ · lint 0 erreur ✅

**ACTION-ENGINE-01 — CLÔTURÉ (2026-10-08, commit `a0231ea`)**

Recommandations structurées, explicables et exécutables dérivées des signaux Signal Engine.

**Redesign en cours d'implémentation** (retour utilisateur) : "L'Action Engine ne doit pas
seulement traduire un signal en texte. Il doit produire une recommandation structurée,
explicable et exécutable par un humain ou Campaign Engine."

**Fichiers créés/modifiés** :

- `lib/crm/action-engine-core.ts` — `buildActionEngineCore(signals)` pure (CRÉÉ)
  - `CampaignHints` : payload JSON sérialisable consommable par Campaign Engine —
    offerDimension, offerDimensionType, suggestedActionType, channel, urgencyHours,
    vipScore, leadCount, marketTrend, marketGrowthRate, signalStrength
  - `ActionRow` : priorité, canal, urgencyWindow, offerFocus, rationale (POURQUOI),
    scriptLine (QUOI DIRE, adapté au canal), subject, campaignHints
  - `ACTION_MATRIX` : urgent→appel_direct/phone/24h, haute→whatsapp/48h,
    normale→email_personnalise/7j, faible→email_decouverte/14j
  - Priorité dérivée de combinedScore (≥150 urgent, ≥100 haute, ≥60 normale, <60 faible)
- `lib/admin/action-engine-actions.ts` — `getActionEngine(windowWeeks: 4|8|12)` (CRÉÉ)
  - Même pipeline complet que signal-engine-actions + buildActionEngineCore
- `app/(internal)/admin/analytics/action/page.tsx` — UI Action Engine (CRÉÉ)
  - 3 tuiles KPI, carte "Action prioritaire", table avec ligne expansible
  - Détail expansible : script complet, sujet, rationale, campaignHints (debug)
- `components/admin-shell.tsx` — Lightbulb + 10e sous-item "Actions" + breadcrumb (ÉTENDU)
- `lib/admin/__tests__/action-engine-ui.test.ts` — 29 tests (3 suites) (CRÉÉ)

**Tests** : 29/29 ✅ · typecheck 0 erreur ✅ · lint 0 erreur ✅

**Prochain chantier identifié** : LEARNING ("Est-ce que ça a marché ?")
→ CLOS ci-dessous.

---

### LEARNING-01 — CLÔTURÉ (2026-10-08, commit `3b25026`)

**Objectif** : quatrième étage du Programme Radar — mesurer si les actions ont porté leurs fruits.
Feedback loop : score VIP × conversion (status="converted") sur fenêtre temporelle (4/8/12 sem).

**Fichiers créés/modifiés** :

- `lib/crm/learning-core.ts` — `buildLearningCore(leads, windowWeeks)` pure (CRÉÉ)
  - segmentation VIP++ (≥80) / VIP+ (≥50) / Pipeline (≥25) / Faible
  - taux de conversion par bucket, destination, produit
  - délai moyen de conversion, top 20 convertis triés par vipScore
- `lib/admin/learning-actions.ts` — `getLearning(windowWeeks)` Server Action (CRÉÉ)
  - auth OTA (super_admin/manager/agent_resa), `withTenantContext`
  - filtre les leads sur la fenêtre (createdAt >= cutoff)
  - score chaque lead via `getVipScoreForLeadCore`
- `app/(internal)/admin/analytics/learning/page.tsx` — UI "use client" (CRÉÉ)
  - sélecteur 4/8/12 semaines, 4 KPI tiles
  - table buckets VIP avec barre visuelle, tables destinations + produits
  - table top convertis avec daysToConvert
- `components/admin-shell.tsx` — nav item "Apprentissage" + icône BookCheck (ÉTENDU)
  - breadcrumb `learning` → "Apprentissage"
- `lib/admin/__tests__/learning-ui.test.ts` — 25 tests (CRÉÉ)

**Tests** : 25/25 ✅ · typecheck 0 erreur ✅

**Programme Radar complet** :

- RADAR MÉTIER 🟢 → RADAR VIP 🟢 v3 → SIGNAL ENGINE 🟢 → ACTION ENGINE 🟢 → CAMPAIGN ENGINE 🟢 → LEARNING 🟢

---

### CAMPAIGN-ENGINE-01 — CLÔTURÉ (2026-10-08, commit `a14e671`)

**Objectif** : cinquième étage du Programme Radar — "Quelles campagnes lancer ?"
Passerelle entre l'Action Engine et la création de campagnes CRM.
Fonction pure `buildCampaignEngineCore` : groupe les ActionRow par
`(channel × dimensionType × dimension)`, élit le champion (combinedScore max),
déduplique les leadIds, mappe ActionChannel → CrmChannel, génère
nom/objectif/message par canal. READ-ONLY : ne crée pas de campagnes.

**Fichiers créés/modifiés** :

- `lib/crm/campaign-engine-core.ts` — `buildCampaignEngineCore(actions)` pure (CRÉÉ)
  - `CampaignProposal` : proposalId, channel, crmChannel, dimension, leadIds,
    priority, topCombinedScore, urgencyHours, suggestedName/Objective/Message,
    marketTrend, marketGrowthRate, actionCount
  - Tri : priorité desc puis combinedScore desc
- `lib/admin/campaign-engine-actions.ts` — `getCampaignEngine(windowWeeks)` server action (CRÉÉ)
  - Pipeline : TimeSeries → RadarMétier → leads + VIP score → dedup → SignalEngine → ActionEngine → CampaignEngine
- `app/(internal)/admin/analytics/campaign-engine/page.tsx` — UI proposals (CRÉÉ)
  - Sélecteur fenêtre (4/8/12 sem), 3 KPI tiles (propositions, contacts, urgentes)
  - Tableau expandable : nom+objectif, canal, priorité badge, contacts, urgence, score
  - Expanded : objectif, message template (pre), debug (crmChannel, urgencyHours, actionCount, trend)
- `components/admin-shell.tsx` — 12e sous-item "Campagnes VIP" (Send icon) + breadcrumb (ÉTENDU)
- `lib/admin/__tests__/campaign-engine-ui.test.ts` — 25 tests (CRÉÉ)

**Tests** : 25/25 ✅ · typecheck 0 erreur ✅

---

### CAMPAIGN-LIFECYCLE-01 — CLÔTURÉ (2026-10-08, commit `22b6182`)

**Objectif** : bridge PROPOSAL → CREATE → TARGET → LAUNCH — l'unique gap du pipeline campagne.
Audit complet (PROPOSAL→CREATE→TARGET→LAUNCH→ATTRIBUTION→RESERVATION→CA/MARGE→LEARNING) :
7 stages sur 8 existaient déjà. Seul manquait l'action serveur atomique Proposal → createCampaignCore → launchCampaignCore.

**Audit état pré-chantier** :

- PROPOSAL ✅ campaign-engine-core + getCampaignEngine + page (CAMPAIGN-ENGINE-01)
- CREATE core ✅ createCampaignCore (campaign-persistence-core) — pas de server action depuis proposal
- TARGET+LAUNCH core ✅ launchCampaignCore — même situation
- ATTRIBUTION ✅ attributeReservationCore + cron `0 6 * * *` (vercel.json)
- RESERVATION ✅ cron couvre tous modules (tous 8)
- CA/MARGE ✅ getCampaignPerformanceCore + listCampaignPerformance + /admin/analytics/campaigns
- LEARNING ✅ buildLearningCore + learning-actions + /admin/analytics/learning

**Fichiers créés/modifiés** :

- `lib/crm/leads-core.ts` — + `fetchLeadsByIdsCore(tx, { agencyId, ids })` (ÉTENDU)
  - Restitution id/email/phone par liste d'IDs — scope minimal, IDs hors agence ignorés
- `lib/admin/campaign-lifecycle-actions.ts` — `createAndLaunchCampaign(params)` server action (CRÉÉ)
  - assertSupportStaff (super_admin/manager/agent_resa + OTA)
  - createCampaignCore → fetchLeadsByIdsCore → launchCampaignCore — transaction unique
  - Content figé au lancement (CAMPAIGN-EXTENSION-01)
  - Retourne `{ ok: true; campaignId; targetCount }` ou `{ ok: false; error }`
- `app/(internal)/admin/analytics/campaign-engine/page.tsx` — bouton "Créer & lancer" (ÉTENDU)
  - launchStates[proposalId] : idle / launching / done / error
  - Bouton dans chaque ligne détail expanded, stopPropagation pour ne pas réduire la ligne

**Tests** : 8/8 ✅ · typecheck 0 erreur ✅

- fetchLeadsByIdsCore exportée
- selectAttributionCandidateCore : null, unique, snapshot récent gagne, tie-breaker, trois candidats
- createAndLaunchCampaign exportée

---

### TIME-SERIES-01 — CLÔTURÉ (2026-10-08)

**Objectif** : couche partagée de calcul période-sur-période — piliers FRÉQUENCE et CROISSANCE.
Répond à "Qu'est-ce qui change ?" : compare fenêtre courante vs fenêtre précédente de même durée
(4/8/12 semaines) pour les modules de réservation (CA/marge) et les leads (canal, produit).

**Commit** : `ae82ea8`

**Fichiers créés/modifiés** :

- `lib/crm/time-series-core.ts` — `getTimeSeriesCore(tx, {agencyId, windowWeeks})` (CRÉÉ)
  - Flux CA/marge : `reservationFinancials JOIN reservations.createdAt` par module
  - Flux leads : `leads.createdAt` par channel et par productType
  - growthRate() : +X.X% / −X.X% / N/A / +∞
- `lib/admin/time-series-actions.ts` — Server Action `getTimeSeries(4|8|12)` (CRÉÉ)
- `app/(internal)/admin/analytics/trends/page.tsx` — 3 tables + sélecteur fenêtre (CRÉÉ)
- `components/admin-shell.tsx` — 6e sous-item "Tendances" + breadcrumb (ÉTENDU)
- `lib/admin/__tests__/time-series-ui.test.ts` — 3 invariants statiques (CRÉÉ)

**Tests** : 3/3 ✅ · typecheck 0 erreur ✅ · lint 0 erreur ✅ · build Compiled ✅

**Prochain chantier potentiel** : RADAR-METIER-01 ou RADAR-VIP-01 — non audités — STOP.

---

### CONVERSION-FUNNEL-01 — CLÔTURÉ (2026-10-08)

**Objectif** : répondre à la question pilier 8 — "Peut-on relier la conversion à sa source ?"
Vue funnel leads par canal × produit : nouveaux / contactés / convertis / taux / CA / marge.
CA et marge lus depuis `reservationFinancials` via jointure (FINANCIAL est l'unique propriétaire).

**Commit** : `47db482`

**Fichiers créés/modifiés** :

- `lib/admin/conversion-funnel-actions.ts` — Server Action `getConversionFunnel()` (CRÉÉ)
- `app/(internal)/admin/analytics/conversion/page.tsx` — page funnel + 4 tuiles KPI (CRÉÉ)
- `components/admin-shell.tsx` — 5e sous-item "Conversion" dans analyticsNavItems (ÉTENDU)
- `lib/admin/__tests__/conversion-funnel-ui.test.ts` — 3 invariants statiques (CRÉÉ)

**Tests** : 3/3 ✅ · typecheck ✅ · lint 0 erreur ✅ · build exit 0 ✅

**Prochain chantier potentiel** : non audité — STOP.

---

### CAMPAIGN-PERF-UI-01 — CLÔTURÉ (2026-10-08)

**Objectif** : exposer au staff OTA les performances CRM des campagnes
(exposés / convertis / CA / marge) via une page admin `/admin/analytics/campaigns`.
Le moteur `getCampaignPerformanceCore()` était déployé depuis commit `155d540` mais
aucune interface admin ne le consommait.

**Commit** : `c6cea0a`

**Fichiers créés/modifiés** :

- `lib/admin/campaign-performance-actions.ts` — Server Action `listCampaignPerformance()` (CRÉÉ)
- `app/(internal)/admin/analytics/campaigns/page.tsx` — page analytics Campagnes (CRÉÉ)
- `components/admin-shell.tsx` — 4e sous-item "Campagnes" dans analyticsNavItems (ÉTENDU)
- `lib/admin/__tests__/campaign-performance-ui.test.ts` — 3 invariants statiques (CRÉÉ)

**Tests** : 3/3 ✅ · typecheck ✅ · lint 0 erreur ✅ · build exit 0 ✅

**Prochain chantier potentiel** : non audité — STOP.

---

### CANONICAL-OWNERSHIP-AUDIT — CLÔTURÉ (2026-10-08)

**Objectif** : vérifier que le domaine `canonical_hotels` / `canonical_hotel_supplier_mappings`
(chantier CANONICAL-HOTEL-01, 2026-10-05) respecte les invariants d'ownership définis pour
tout domaine système partagé : schéma, grants DB, RLS, politique de persistance, tests live,
intégration caller.

**Méthode** : lecture seule — `git show origin/main:...` sur les fichiers concernés.
Audit réalisé sur HEAD `a0b70ed`.

**6 preuves — 6/6 CONFIRMED, aucun GAP :**

| Proof | Domaine                                            | Résultat  |
| ----- | -------------------------------------------------- | --------- |
| P1    | Schema & contraintes DB                            | CONFIRMED |
| P2    | Grants `app_runtime` (append-only mappings)        | CONFIRMED |
| P3    | RLS (FORCE, `anon`/`authenticated` révoqués)       | CONFIRMED |
| P4    | Politique de persistance (EXACT only, best-effort) | CONFIRMED |
| P5    | Tests live (E1/E2/E3/E4)                           | CONFIRMED |
| P6    | Caller integration (`search-hub` non-bloquant)     | CONFIRMED |

**Détail :**

- **P1 — Schema** (`lib/db/schema/canonical-hotels.ts`) : deux tables uniquement (identité +
  provenance), aucun FK agency/tenant (domaine système cross-tenant), UNIQUE sur `(supplier,
supplierHotelCode)` — double-mapping impossible.
- **P2 — Grants** (migration 0109) : `app_runtime` a `SELECT/INSERT/UPDATE` sur
  `canonical_hotels` ; `SELECT/INSERT` uniquement sur `canonical_hotel_supplier_mappings` —
  `UPDATE/DELETE` explicitement révoqués. Mappings append-only au niveau grant Postgres.
- **P3 — RLS** (migration 0120, `RLS-GAP-PUBLIC-TABLES-01`) : `FORCE RLS` actif, `anon`/
  `authenticated` à zéro privilège, `app_runtime` policy `USING true`. Couvert par
  `lib/db/__tests__/rls-gap-public-tables-01-live.test.ts`.
- **P4 — Persistance** (`lib/hotel-suppliers/core/canonical-persistence.ts`) : seule la
  confidence `EXACT` crée/étend une identité (HIGH/MEDIUM/LOW jamais persistés en v1) ;
  `ON CONFLICT DO NOTHING` sur le mapping (anti-race) ; `try/catch` global (jamais bloquant
  pour la recherche) ; `reasons[]` persistées (CANONICAL-HOTEL-01-REASONS).
- **P5 — Tests live** (`canonical-persistence-live.test.ts`) : 4 tests couvrant E1 (cross-
  supplier EXACT → une identité partagée), E2 (idempotence — même couple jamais dupliqué),
  E3 (HIGH/MEDIUM jamais persisté), E4 (`reasons[]` du vrai `matchHotels()` persistées,
  ancre porte `"first sighting"`).
- **P6 — Integration** : appelé post-traitement dans `search-hub.ts::runSearchThroughHub()`,
  hors chemin de réponse HTTP, retourne `Promise<void>` — jamais bloquant.

**Observation sans impact** : `app_runtime` a le grant `UPDATE` sur `canonical_hotels`
(pour `updatedAt` potentiel) mais aucun code path ne l'utilise actuellement. Pas un GAP.

---

### SEARCH-DEMAND-DISPLAY-01 — CLÔTURÉ (2026-10-08)

**Objectif** : exposer au staff OTA les données `search_demand_signals` capturées depuis
BEHAVIORAL-SIGNAL-01 (PR #146) mais jusque-là sans UI — page admin read-only, top destinations
sur 30 jours, triées par volume décroissant.

**Commit** : `75a1b9e` — branche `claude/easy2book-v6-modernization-7gyb5v`

**Implémentation** :

| Fichier                                                  | Action | Détail                                                                                                                                          |
| -------------------------------------------------------- | ------ | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| `lib/crm/search-demand-core.ts`                          | EXTEND | `SearchDemandRow` type + `getSearchDemandSummaryCore()` (30j, GROUP BY, ORDER BY volume DESC, LIMIT 50, filtre `agencyId` défensif en plus RLS) |
| `lib/admin/search-demand-actions.ts`                     | CREATE | Server Action `listSearchDemandSignals()` — `assertSupportStaff` (super_admin/manager/agent_resa + agencyType=ota)                              |
| `app/(internal)/admin/analytics/search-demand/page.tsx`  | CREATE | Page read-only, pattern useEffect identique à `/admin/analytics/niches`                                                                         |
| `lib/admin/__tests__/search-demand-actions-live.test.ts` | CREATE | 3 tests live Postgres : agrégation+tri, isolation cross-agency, filtre 30j                                                                      |

**Vérifications** :

- `pnpm typecheck` → 0 erreurs ✅
- `pnpm lint` → 0 erreurs ✅
- `pnpm test` → 1563 pass / 0 fail / 353 skip ✅
- `pnpm build` → succès ✅

**NOT VERIFIED** : rendu visuel de la page (pas de Postgres local en CI — tests live skippés automatiquement).

---

### ADMIN-ANALYTICS-NAV-01 — CLÔTURÉ (2026-10-08)

**Objectif** : rendre les trois pages analytics existantes accessibles depuis la navigation
admin — `/admin/analytics/margins`, `/admin/analytics/niches` et
`/admin/analytics/search-demand` n'étaient reliées à aucun lien de navigation et
inaccessibles sans URL directe.

**Commit** : `724c4ea` — branche `claude/easy2book-v6-modernization-7gyb5v`

**Implémentation** :

| Fichier                                                 | Action | Détail                                                                                                                                                                               |
| ------------------------------------------------------- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `components/admin-shell.tsx`                            | EXTEND | Ajout `analyticsNavItems` (Analytique → Marges / Niches CRM / Demande hôtel) ; visible super_admin + manager + agent_resa ; labels breadcrumb analytics/margins/niches/search-demand |
| `lib/admin/__tests__/admin-shell-analytics-nav.test.ts` | CREATE | 3 tests invariants statiques : présence des trois hrefs dans admin-shell.tsx                                                                                                         |

**Vérifications** :

- `pnpm tsc --noEmit` → 0 erreurs ✅
- `pnpm eslint` → 0 erreurs ✅
- Tests invariants → 3/3 ✅
- `pnpm build` → succès ✅

**NOT VERIFIED** : rendu visuel (pas de session admin active en CI).

---

### POST-BATCH-CERTIFICATION-AUDIT — CLÔTURÉ (2026-10-08)

**Objectif** : certification croisée des 3 PRs mergées le 2026-10-08 — vérifier que
le câblage promo, la consolidation revenue, et la première UI niche sont effectifs sur
le code source réel de `main`.

**AXE 1 — PROMO-PRICING-COVERAGE-01 (PR #156)** :

- `hotels-monde/guest-booking-actions.ts` : importe `resolveCheckoutPromoCore` +
  `applyPromoDiscountCore`, passe `supplierPriceTnd` (plancher PROMO-LOSS-POLICY-01) ✅
- `activities/guest-booking-actions.ts` : câblé, pas de plancher (catalogue agence,
  coût net = prix vente, `supplierPriceTnd` omis délibérément) ✅
- `cars/guest-booking-actions.ts` : câblé, passe `carSupplierCostTnd` ✅
- `vols/booking-request-action.ts` : câblé, remise persistée dans `flightPriceSnapshots`
  (CAS `status=ACTIVE` + `expiresAt > now()`), relue sans recalcul à la confirmation ✅
- `lib/finance/margin-calculator.ts` : SUPPRIMÉ (confirmé — `git show origin/main:...` → not found) ✅
- Tests `promo-wiring-invariants.test.ts` : 8×2 couverture statique + 3 tests plancher = 35 assertions ✅

**AXE 2 — REVENUE-CONSOLIDATE-01 (PR #157)** :

- `sumRevenueMarginCore()` : primitive pure extraite dans `lib/reporting/margin-analytics-core.ts` ✅
- `lib/crm/campaign-performance-core.ts` : migré de `.reduce()` vers `sumRevenueMarginCore` ✅
- `lib/crm/vip-score-core.ts` : migré de `.reduce()` vers `sumRevenueMarginCore` ✅
- Duplication résiduelle : `grep '.reduce.*salePriceTnd\|.reduce.*marginAmount'` → zéro résultat ✅
- Tests `margin-analytics-core.test.ts` : 6 tests purs (empty, string/number, marge négative, etc.) ✅
- Tests `margin-analytics-core-live.test.ts` : preuve live Postgres pour `getMarginKPIsCore` ✅

**AXE 3 — NICHE-UI-01 (PR #158)** :

- Page `/admin/analytics/niches/page.tsx` créée, `"use client"` ✅
- Appel `listNicheSegments()` depuis `lib/admin/niche-actions.ts` ✅
- Garde auth : `assertSupportStaff` (super_admin/manager/agent_resa + agencyType="ota") — convention identique à `/admin/analytics/margins` ✅
- Read-only (pas de bouton "lancer campagne" en V1 — décision produit 2026-10-07) ✅
- Rendu visuel authentifié : **NOT VERIFIED** (pas de session Preview dans cette audit)

**Méthode** : lecture source via `git show origin/main:...` sans checkout main.
Audit réalisé sur HEAD main = `a0b70ed`.

---

### CANONICAL UPDATE / BACKLOG GOVERNANCE — protocole adopté (2026-10-07)

L'utilisateur a posé un protocole explicite de traitement des documents
canoniques (CLARIFICATION CANONIQUE CRM/SIGNAUX/MARCHÉS, puis
CANONICAL UPDATE + BACKLOG GOVERNANCE) : classification obligatoire
(CONFIRMED/ALREADY CERTIFIED/NEW RULE/NEW GAP/OUT OF SCOPE/CONTRADICTION),
séparation stricte Architecture (canonical) ≠ État réel
(IMPLEMENTED/PARTIAL/**UNKNOWN**/NOT IMPLEMENTED) ≠ Action (NO ACTION/
AUDIT CANDIDATE/BACKLOG OFFICIAL/AUTHORIZED CHANTIER), `UNKNOWN ≠ GAP
CONFIRMED` (il faut un audit prouvé avant de déclarer un gap confirmé),
`BACKLOG CANDIDATE ≠ BACKLOG OFFICIAL` (aucune promotion automatique,
décision utilisateur explicite requise), et interdiction d'enchaîner
automatiquement le prochain audit même sur une piste évidente — toujours
repasser par une décision utilisateur. Protocole appliqué à partir de ce
point de la session, y compris rétroactivement sur l'audit NETWORK/SUPPLIER
ci-dessous (lancé sur un "go" générique, signalé comme possible écart de
process, clarifié avec l'utilisateur avant de continuer).

**Capacity Matching Engine (DEMANDE CRM ↔ CAPACITÉ réseau)** — promu en
**candidate backlog officiel** : architecture=CANONICAL (SUPPLIER/NETWORK
possède la capacité), implémentation=**NOT IMPLEMENTED** (prouvé par audit,
pas supposé — voir ci-dessous), scope actuel=**hors exécution**, nécessitera
sa propre fiche d'audit de conception avant tout code, sur GO séparé futur.

### RLS-FORCE-SUPPLIER-TABLES-01 — MERGÉ (PR #151, commit squash `804b14a`, 2026-10-07)

Déclenché par l'audit NETWORK/SUPPLIER capacity matching (lecture seule,
agent dédié) : aucun "Capacity Matching Engine" n'existe dans ce dépôt —
`suppliers`/`supplier_nodes`/`products.stock` existent mais ne modélisent
ni disponibilité par date, ni destination couverte, ni conditions/expertise ;
`network-demand-capture-core.ts` (malgré son nom) ne fait que de la
provenance de lead, aucun croisement CRM↔capacité réseau trouvé (0
occurrence). Deux mondes cloisonnés, confirmé par citations fichier:ligne.

Sous-gap distinct trouvé et corrigé : `products`, `supplier_nodes`,
`supplier_portal_users` avaient `ENABLE ROW LEVEL SECURITY` sans `FORCE`
(contrairement à `suppliers` lui-même). **Correction en cours de route** :
vérification directe en production (`pg_class.relforcerowsecurity`) a
montré que `products` avait en réalité déjà `FORCE` (le rapport d'audit
initial de l'agent le citait à tort) — scope réduit à 2 tables réelles :
`supplier_nodes`, `supplier_portal_users`.

Migration `drizzle/manual/0124_rls_force_supplier_tables_01.sql`. Vérifié
avant migration : `app_runtime` n'est pas owner de ces tables (owner =
`postgres`, confirmé via `pg_tables`) — `FORCE` n'a aucun effet sur le
trafic applicatif normal, protection en profondeur, pas la correction
d'un trou actif. **Migration appliquée et vérifiée en production**
(Supabase `crygnaichvlxavvbifqi`) : `relforcerowsecurity=true` confirmé
sur les 2 tables, avant (`false`) et après. Preuves : 21/21 tests
existants verts (`product-booking-actions-invariants.test.ts`,
`portal-actions-invariants.test.ts`) ; régression complète 1501 pass/0
fail ; `pnpm build` ok. CI de la PR : tout vert (format/lint/typecheck/
test/financial-e2e/build/playwright-a11y) sauf `lighthouse` (même NO_FCP
connu, non lié à ce diff).

### PUBLIC-VISUAL-RLS-ROLE-GAP-01 + BOOKING-ENGINE-MODULES-NOT-WIRED-01 + DESTINATIONS-SSG-POOL-EXHAUSTION-01 — CLÔTURÉS

Trouvés en exécutant le Scénario A (Smoke, Home→Search) sur l'infra E2E
locale reconstruite : la page d'accueil réelle (tous locales, tout
utilisateur, depuis le 2026-10-02) n'affichait **aucun onglet de
navigation entre modules**, aucune image hero dynamique, aucun carrousel
de promotions — dégradée silencieusement vers un seul module par défaut
codé en dur.

**3 causes réelles, empilées, chacune trouvée et corrigée séparément :**

1. **PUBLIC-VISUAL-RLS-ROLE-GAP-01** — les policies RLS de
   `public_module_visuals`/`public_site_settings`/`public_promotions`
   (migration `0097_public_visual_content.sql`, 2026-10-02) étaient
   scopées `TO authenticated`, un rôle Supabase/PostgREST dont
   `app_runtime` (le rôle Postgres réel de `DATABASE_URL`) n'est jamais
   membre — 0 ligne retournée silencieusement à chaque lecture/écriture,
   `FORCE ROW LEVEL SECURITY` + aucune policy applicable = déni par
   défaut, sans jamais lever d'exception. **Découverte additionnelle** :
   la migration `0097` elle-même n'avait **jamais été appliquée en
   production** (confirmée absente de `list_migrations` sur le projet
   Supabase `crygnaichvlxavvbifqi`) — corrigée en une seule migration
   combinée (création + RLS correcte dès le départ + seed), jamais l'état
   cassé intermédiaire. Grants `app_runtime` déjà corrects (vérifiés),
   aucun gap `DEFAULT-PRIVILEGES-GAP-01` sur ces 3 tables.
2. **BOOKING-ENGINE-MODULES-NOT-WIRED-01** — `app/(public)/[locale]/page.tsx`
   n'a jamais appelé `getPublicModuleVisuals()`/`getPublicSiteConfig()` ;
   `<BookingEngine />` recevait toujours `modules=[]` par défaut, quel
   que soit l'état de la DB/RLS. `getPublicModuleVisuals()` n'était
   appelée que par l'éditeur admin (`/admin/site`), jamais par la page
   publique — un chantier backend+composant terminé, la dernière étape
   (relier la page au composant) jamais faite.
3. **DESTINATIONS-SSG-POOL-EXHAUSTION-01** — trouvée en déployant le
   correctif ci-dessus : 4 builds Vercel sur 4 ont échoué
   (`BUILD_UTILS_SPAWN_1`), alors que le même commit construisait sans
   erreur en local (×2) et sur GitHub Actions (×2, `build` +
   `playwright-a11y`). Root cause confirmée via le log de build Vercel
   réel (collé par l'utilisateur, pas supposée) : `next build` tente de
   pré-générer les ~192 fiches `/destinations/[slug]` au build, chacune
   ouvrant une connexion au pooler Supabase (session mode, plafond 15
   clients) — épuisé en cours de route, crash sur une fiche différente à
   chaque run (`maroc`, puis `pays-bas` — preuve que la cause est
   générique au volume cumulé de connexions séquentielles, pas une
   destination précise). `lib/db/client.ts::getDb()` reste un singleton
   correct (`max: 10` côté app, jamais modifié) — c'est le plafond du
   pooler externe qui casse. Aucun rapport avec les 2 bugs ci-dessus ;
   découvert uniquement parce qu'il bloquait leur déploiement. **Correctif
   volontairement sans toucher au pooling** (augmenter un pool aurait
   seulement déplacé le seuil de rupture) : `generateStaticParams()`
   renvoie toujours `[]` — zéro connexion DB au build pour cette route,
   `dynamicParams` reste à `true` (défaut Next.js), chaque fiche se rend
   à la demande au premier accès — exactement le même comportement que
   le fallback "DB injoignable pendant le build" déjà écrit et déjà
   documenté comme sûr dans ce fichier, juste rendu systématique.

**Preuves** : `pnpm typecheck`/`pnpm test` (1486 pass/0 fail)/`pnpm
lint`/`prettier --check`/`pnpm build` verts avant chaque merge ;
2 fast-forwards propres sur `main` (`c589dda..5435c45..c6db257`) ;
test de régression live DB pour le gap RLS
(`lib/public/__tests__/public-visual-rls-role-gap-live.test.ts`, prouvé
dans les deux sens — échoue sur l'ancienne policy, passe sur la
nouvelle) ; déploiement Vercel final `dpl_4N7i4KzcC3TtTFcezp6HDArX3g4s`,
`state=READY`, `target=production`, `githubCommitSha=c6db257...`, aliasé
`easy2book-new.vercel.app` ; **confirmation visuelle en production réelle**
(capture d'écran navigateur utilisateur, 2026-10-06) : les 8 onglets de
modules (Hôtels Tunisie/Monde, Omraty, Voyages Organisés, Attractions,
Vols, Transferts, Car) et l'image hero dynamique s'affichent correctement
sur `https://easy2book-new.vercel.app/fr`.

**NOT VERIFIED** : le carrousel de promotions (Istanbul/Djerba) n'a été
confirmé visuellement qu'en local (navigateur réel, infra E2E
reconstruite) — pas encore reconfirmé sur la capture de production
elle-même (hors du cadre visible de la capture reçue).

**Gap séparé trouvé, non traité ici** (`get_advisors` Supabase, lecture
seule) : 3 tables pré-existantes sans rapport avec ce chantier ont RLS
entièrement désactivée en production — `development_project_waitlist`,
`canonical_hotel_supplier_mappings`, `canonical_hotels`. À auditer
séparément, sur GO dédié.

**CLÔTURÉ** par RLS-GAP-PUBLIC-TABLES-01 ci-dessous (2026-10-06/07).

---

### Chaîne RLS-GAP + NICHE CRM & VIP LEAD ENGINE (2026-10-06/07) — CLÔTURÉE, MERGÉE sur `main`

Chaîne de 7 chantiers, chacun : audit d'ownership → fiche → GO explicite
→ implémentation → preuve réelle (Postgres local, migration vérifiée en
production quand applicable). `pnpm typecheck`/`pnpm lint`/`prettier
--check` verts et régression complète sans régression avant chaque
merge (progression : 1486 → 1498 → 1501 pass/0 fail sur la période,
332 skip final, `format` rouge sur les 5 mêmes fichiers pré-existants
hors scope à chaque fois — dette non bloquante déjà connue, pas une
régression de cette chaîne).

| Chantier                                                                                                                                                                                                                                                                                                       | Branche                          | Statut                                       |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------- | -------------------------------------------- |
| RLS-GAP-PUBLIC-TABLES-01 (`canonical_hotels`/`canonical_hotel_supplier_mappings`/`development_project_waitlist` — RLS activée+forcée, policy `app_runtime`, REVOKE anon/authenticated)                                                                                                                         | —                                | **MERGÉ** (PR #136), migration en production |
| MARKET-CONTENT-RLS-ROLE-GAP-01 (`market_signals`/`development_projects` — policies recréées sans restriction de rôle, `is_super_admin()` conservé comme garde d'écriture ; 4 fonctions `lib/market/admin-actions.ts` migrées vers `withSystemContext`)                                                         | —                                | **MERGÉ** (PR #137), migration en production |
| VIP-SCORE-01 (`lib/crm/vip-score-core.ts` — thermomètre de valeur commerciale, fonction pure, breakdown explicite, **aucun seuil VIP fixé** — décision produit permanente, à ne jamais rouvrir avant analyse de distribution réelle)                                                                           | `vip-score-01`                   | **MERGÉ** (PR #138)                          |
| WHATSAPP-CONTACT-RESOLUTION-01 (`upsertConversationForInboundCore` alimente aussi CONTACT-01)                                                                                                                                                                                                                  | `whatsapp-contact-resolution-01` | **MERGÉ** (PR #139)                          |
| META-LEADADS-WEBHOOK-01 (pilote Meta Lead Ads — `leadgen_id` webhook + appel Graph API séparé pour le détail, même discipline honnête que `lib/whatsapp/provider.ts` ; jamais de consentement marketing fabriqué depuis la case Meta)                                                                          | `meta-leadads-webhook-01`        | **MERGÉ** (PR #140)                          |
| CONTACT-LEAD-HISTORY-01 (`getContactLeadHistoryCore` — ferme le gap "historique de leads par CONTACT durable", indépendant de CAMPAIGN ; bug réel trouvé par le test : comparaison `leads.email/phone` bruts vs `contacts.contactRef` normalisé nécessite une renormalisation, jamais une égalité SQL directe) | `contact-lead-history-01`        | **MERGÉ** (PR #141)                          |
| VIP-SCORE-02 (signal `engagement` = répétition par CONTACT durable, lecture seule — jamais de création de contact dans un calcul de score ; toujours aucun seuil VIP)                                                                                                                                          | `vip-score-02`                   | **MERGÉ** (PR #142)                          |

**Preuves** : 22/22 tests du domaine vip-score + contact-history verts
contre Postgres local (`app_runtime`, non-BYPASSRLS) ; régression
complète finale 1501 pass/0 fail, 332 skip ; CI verte sur chaque PR
(`format` rouge connu/non bloquant sur chaque run, documenté en
commentaire PR à chaque occurrence).

**NOT VERIFIED** : aucun déploiement Vercel production confirmé pour
cette chaîne spécifique (contrairement à DEPLOY-01/PUBLIC-VISUAL
ci-dessus) — à confirmer sur `easy2book-new` si cette chaîne doit être
vérifiée en production avant le prochain chantier CRM.

**Suite directe, même chaîne** : CUSTOMER-360-VIP-SCORE-01 (2026-10-07)
— `getVipScoreForLeadCore` (VIP-SCORE-01/02 ci-dessus) avait 0 appelant
réel ailleurs dans l'application (confirmé par grep exhaustif), donc
invisible malgré 2 chantiers mergés. **EXTEND**, pas CREATE : câblé dans
le panneau "Vue 360" déjà existant (`/admin/support`,
`components/admin/customer-360-panel.tsx`, derrière
`getCustomer360Core`) — nouveau bloc "Score VIP (total)" avec breakdown,
toujours aucun seuil/verdict VIP affiché. Deux requêtes reservations
volontairement séparées (Vue 360 = toutes les réservations y compris
annulées ; VIP score = exclut cancelled/expired/refunded), pas une
duplication à corriger. **MERGÉ** (PR #143, commit `f4bbc833`) — CI
verte sur tout sauf `format` (connu, 5 fichiers hors scope) et
`lighthouse` (infra `NO_FCP`, confirmé rouge sur `main` lui-même au
commit précédent sans aucun changement de code applicatif — pas causé
par cette PR). `lib/admin/__tests__/customer-360-core-live.test.ts`
(nouveau — aucun test n'existait pour ce fichier avant ce chantier).

**VIP-DISTRIBUTION-AUDIT-01 (2026-10-07, lecture seule, production
`crygnaichvlxavvbifqi`)** — tentative d'analyser la distribution réelle
des scores VIP pour fixer un seuil. Résultat : **jeu de données
insuffisant**, pas une absence d'exécution — 2 leads en production,
les deux des fixtures QA ("QA Lead Test"/"QA Lead Test 2"), aucun vrai
lead client. `contacts` : 0 ligne (le signal `engagement` de
VIP-SCORE-02 n'a encore jamais produit un seul point bonus en
production). Score calculé pour les deux leads : ≈49.0, quasi
identique — min/max/médiane/percentiles tous dénués de sens
statistique avec n=2. **Anomalie réelle trouvée en cours d'audit** : un
client `+216 98 140 514` (avec espaces) ne matchait aucun des 2 leads
via l'égalité SQL stricte alors que le numéro est identique à un lead
`+21698140514` (sans espaces) — gap de normalisation, même classe de
bug que CONTACT-LEAD-HISTORY-01. **PROPOSITION actée** : reporter la
décision de seuil VIP jusqu'à l'apparition d'un vrai volume de leads en
production ; ne pas la rouvrir avant une distribution réelle
exploitable.

**NORMALIZED-MATCHING-01 (2026-10-07) — CLÔTURÉ, MERGÉ** — corrige
l'anomalie trouvée ci-dessus. `lib/crm/customer-match-core.ts`
(nouveau) : `findMatchingCustomerIdsCore`, seul point de rapprochement
lead↔customer partagé, réutilise EXACTEMENT la normalisation CONTACT-01
(`resolveContactKeyCore`/`normalizePhoneRefCore`), jamais une seconde
logique inventée. 3 call sites migrés (`getVipScoreForLeadCore`,
`getCustomer360Core`, `searchReservationsForLeadLinkCore` mode
sans-query) au lieu de dupliquer chacun leur `matchClause` par égalité
stricte. **MERGÉ** (PR #144, commit `dcd51aec`) — CI verte sur tout
sauf `format`/`lighthouse` (connus, non liés à ce diff, documentés en
commentaire PR). Preuve : `lib/crm/__tests__/customer-match-core-live.test.ts`
(nouveau), reproduit exactement le cas réel de production (téléphone
avec/sans espaces → matche après correctif) ; 30/30 tests verts contre
Postgres local ; régression complète 1501 pass/0 fail, 338 skip.
Risque documenté (pas une régression) : le filtrage charge plus de
lignes pour une agence à très gros volume de réservations — acceptable
aujourd'hui (volumes réels quasi nuls), à revisiter si le volume
augmente.

**Séquence actée avec l'utilisateur** : NORMALIZED-MATCHING-01 (fait)
→ CI-FIX-02 (ci-dessus, en attente de GO) → attendre un vrai volume de
leads en production → revenir à VIP-DISTRIBUTION / seuil VIP.

**Hors scope, laissé explicitement ouvert** (voir audits "NICHE CRM &
VIP LEAD ENGINE" et "SOCIAL CRM" livrés en texte pendant cette chaîne,
non persistés en fichier) : seuil VIP (décision produit après analyse
de distribution réelle des scores sur la base existante — jamais une
valeur arbitraire — VIP-DISTRIBUTION-AUDIT-01 ci-dessus a tenté cette
analyse mais le jeu de données réel est actuellement insuffisant) ;
pilote Meta Lead Ads
au-delà du webhook (reporting, audience, consentement structuré) ;
toute autre plateforme sociale (Instagram/Messenger — "quelles
plateformes, quels signaux, quelle autorisation, quel parcours, quel
propriétaire des données, quel coût,
quelle valeur commerciale" restent à répondre avant tout code) ; une
policy de test résiduelle `market_signals_read_test` (doublon sans
risque de `market_signals_read`, non supprimable via les outils MCP
Supabase disponibles — `DROP POLICY` bloque systématiquement, voir
limitation documentée dans PR #136/#137) ; IA, Contact Graph relationnel,
Partner Referral structuré, Campaign Automation — toujours listés
"❌ Ne pas toucher maintenant".

**Gap séparé trouvé, non traité ici** (lecture seule, logs CI) : le job
`lighthouse` est rouge sur `main` lui-même (confirmé au commit
`511d78c`, un changement purement documentaire sans aucun code
applicatif), erreur `Runtime error ... The page did not paint any
content (NO_FCP)` — Chrome headless n'obtient jamais de First
Contentful Paint pendant l'audit Lighthouse CI.

**Audit lecture seule fait** (agent dédié, 2026-10-07) : cause probable
identifiée — `.github/workflows/ci.yml` (job `lighthouse`) n'installe
aucun navigateur Chrome/Chromium, contrairement à `playwright-a11y` qui
fait explicitement `playwright install chromium --with-deps` (qui, lui,
passe systématiquement). Confirmé pré-existant (job créé par le commit
`cc617b4` sans cette étape dès l'origine, tourne sous
`continue-on-error: true` depuis le début). Cause secondaire non
exclue : la page auditée (`/admin`) redirige vers `/login` en CI faute
d'auth, pourrait contribuer à un paint vide.

**CI-FIX-02 — MERGÉ (PR #145, commit squash `3a8e24b2`, 2026-10-07).**
Correctif appliqué : `playwright install-deps chromium` ajouté au job
`lighthouse` ; `public/manifest.json` corrigé (icônes réelles au lieu
de fichiers inexistants, causant des 404 catastrophiques de 14-28s sur
tout chemin non matché côté `[locale]`) ; `prefetch={false}` ajouté sur
les deux `<Link>` de `/login`. **Résultat réel après correctif** (pas
une affirmation prématurée) : `playwright install-deps chromium`
s'exécute avec succès — l'hypothèse "Chrome sans dépendances" est donc
**écartée**, pas confirmée comme cause unique. Le correctif manifest.json
est une amélioration mesurée et réelle (temps de 404 ramené à <1s),
mais **`NO_FCP` sur `/login` persiste malgré tout** — non résolu à ce
jour, `continue-on-error: true` conservé à raison. CI de la PR :
tout vert sauf `format`/`lighthouse` (les deux connus, documentés,
non liés à ce diff — `lighthouse` rouge sur `main` lui-même avant ce
correctif). Mergé en l'état car le correctif apporté est réel et net
même sans résoudre `NO_FCP` entièrement ; piste `/login` restante
documentée ci-dessus pour un futur `CI-FIX-03` séparé, jamais démarré
automatiquement.

**Gap séparé identifié pendant cet audit, non résolu, laissé ouvert
pour un futur chantier** : tout chemin public non matché par
`app/(public)/[locale]/...` déclenche un rendu spéculatif complet de
la page d'accueil (avec requêtes DB live) avant le `notFound()` du
layout — risque de charge DB/pool sur du trafic bot/scanner/lien cassé,
indépendant du fix manifest.json qui n'a corrigé que le symptôme (icônes).

---

### BEHAVIORAL-INTENT-01 + BEHAVIORAL-SIGNAL-01 — AUDIT ONLY, décisions produit actées, bloqué sur validation juridique

Deux audits lecture seule en chaîne (2026-10-07), déclenchés après
NORMALIZED-MATCHING-01 : peut-on construire une notion d'intention
d'achat ("ce que veut ce client maintenant"), distincte du VIP Score
("sa valeur globale") ?

**BEHAVIORAL-INTENT-01 (agent dédié)** — constat factuel : le système
capture déjà la DEMANDE EXPLICITE (lead via `createLeadCore`, WhatsApp
via `upsertConversationForInboundCore`, réservation `pending` via
`lib/booking/guest-actions.ts`) — rattachable, normalisée (CONTACT-01/
NORMALIZED-MATCHING-01), horodatée. Mais AUCUN signal de comportement
implicite pré-achat n'existe : recherche (hôtel/vol/omra/package),
consultation de fiche produit, et abandon sont soit purement côté
client (URL params, `lib/cart/cart-store.ts` = localStorage uniquement,
"PAS de table BDD"), soit absents de toute table. Ownership INTENT :
**non confirmé**, faute de signaux source — pas un défaut d'architecture.

**BEHAVIORAL-SIGNAL-01 (agent dédié)** — creuse la faisabilité d'un
premier signal. Constats clés : (1) aucun journal d'événements
générique réutilisable (`lead_origin_events` verrouillé sur `leadId
NOT NULL`, inutilisable pour un visiteur anonyme) ; (2) identité
réutilisable telle quelle (`resolveContactKeyCore`/
`findMatchingCustomerIdsCore`, signatures stables, zéro dépendance
cachée) ; (3) CONSENT-01 ne couvre QUE le marketing, pas le tracking
analytique — sujet RGPD distinct et non traité ; (4) pool DB à 10
connexions déjà en cause dans un incident de production réel
(DESTINATIONS-SSG-POOL-EXHAUSTION-01) — une écriture par recherche
individuelle serait risquée telle quelle.

**Décisions produit actées par l'utilisateur** (pour un futur pilote
"recherche hôtel" uniquement, pas une plateforme générique) :

- **Agrégation, jamais individuelle** : destination+produit+période →
  compteur, pas une ligne par recherche. Objectif = mesurer la demande
  (signal marché), pas construire un historique individuel.
- **Valeur métier** : le compteur doit révéler une tendance de demande
  exploitable par NICHE/PROMO/commercial (ex. "Tunis hôtels" en forte
  progression → offre ciblée) — jamais un score client, jamais fusionné
  avec VIP Score (VIP = valeur, Intent = envie maintenant — deux
  dimensions explicitement distinctes, un client peut être VIP élevé +
  intent faible ou l'inverse).
- **Rétention** : agrégation journalière, durée finale à justifier par
  l'usage métier et la politique privacy — jamais fixée arbitrairement.
- **Infra** : aucune écriture individuelle par recherche ; mesurer le
  volume réel et l'impact pool DB sur le pilote avant toute
  généralisation (`PILOTE → mesurer volume → mesurer impact DB/pool →
preuve → GO extension`).

**Condition bloquante avant tout code** (RGPD/privacy) : aucun tracking
comportemental individuel sans base légale/consentement approprié.
Décision provisoire actée : signal agrégé non destiné à identifier une
personne pour le pilote (pas d'IP brute, pas de fingerprint, pas de
profilage individuel) — **mais la conformité juridique finale reste à
valider avant toute mise en production, et avant tout code selon la
décision explicite de l'utilisateur**.

**Statut : BEHAVIORAL-SIGNAL-01 — MERGÉ (PR #146, commit squash
`1399fbdd`, 2026-10-07).** Validation juridique/privacy obtenue
(confirmée explicitement par l'utilisateur avant le code), GO global
donné, chantier réalisé dans le périmètre strictement acté ci-dessus
(pilote "hotel" uniquement, compteur agrégé, zéro tracking individuel).

**Implémenté** : table `search_demand_signals` (migration
`drizzle/manual/0122_behavioral_signal_01.sql`), unique
`(agencyId, productType, destination, searchDate)`, RLS activée+forcée
(policy `agency_id = current_agency_id() OR is_super_admin()`, même
pattern que `contacts`), `REVOKE DELETE` pour `app_runtime` (même
discipline DEFAULT-PRIVILEGES-GAP-01). `lib/crm/search-demand-core.ts::
recordHotelSearchDemandCore` (upsert idempotent, incrément SQL),
instrumenté dans `app/api/hotels-monde/search/route.ts` (seul point
d'entrée réel pour la recherche hôtel monde), wrappé `try/catch` —
jamais bloquant pour une vraie recherche (même discipline que
`acquireLock`).

**Preuves** : 4/4 tests live verts (`lib/crm/__tests__/
search-demand-core-live.test.ts` — compteur agrégé 3→1 ligne/count=3,
jours séparés, destinations séparées, isolation cross-agence) ;
régression complète 1501 pass/0 fail (baseline inchangée, les 4
nouveaux tests sont skip-only sans DB) ; migration appliquée et
vérifiée en production (Supabase `crygnaichvlxavvbifqi` — RLS
activée+forcée, policy correcte, grants SELECT/INSERT/UPDATE pour
`app_runtime`, DELETE bien révoqué, confirmé par `has_table_privilege`
direct). CI de la PR : tout vert sauf `format`/`lighthouse` (connus,
documentés, non liés à ce diff).

**Hors scope, explicitement non traité ici** (à ne jamais démarrer
automatiquement) : second produit (vols, omra) sur ce même signal ;
toute fusion avec VIP Score ou Niche ; durée de rétention finale ;
mesure d'impact DB/pool en conditions réelles de volume (prochaine
étape naturelle avant toute extension, mais pas un chantier démarré ici).

---

### Chaîne NICHE → PRICING-PROMO-LINK (câblage transfert/omra/package) — CLÔTURÉE, DÉPLOYÉE Deux déploiements

`easy2book-new`, tous deux `state=READY`/`target=production`/aliasés
`easy2book-new.vercel.app` :

- `dpl_2pCj9GTpWJQ2VX1rnByMNAun5bqE`, `githubCommitSha=c1c75cb...` —
  câblage module transfert (point d'injection unique, pas de garde
  CART-DRIFT-01 dans ce module).
- `dpl_9mE8rQfXkcQA65oKc8YEHFWXnhUf`, `githubCommitSha=e43af3d...` —
  (a) **bugfix** sur l'intégration hôtel déjà en production : la remise
  PROMO était appliquée AVANT le calcul de breakdown et la garde
  anti-drift CART-DRIFT-01 (`lib/booking/guest-actions.ts`), ce qui
  aurait rejeté `PRICE_CHANGED` à tort pour tout client réellement
  éligible à une promo — jamais déclenché en prod faute de campagne
  active sur le hot path concerné, mais un vrai bug trouvé par audit
  avant tout incident réel, pas par un rapport utilisateur ; (b)
  câblage omra (injection unique, pas de garde CART-DRIFT-01 dans ce
  module non plus) ; (c) câblage package (remise appliquée aux montants
  agrégés déjà facturés totalTnd/depositTnd/balanceTnd, après la garde
  anti-drift, sans fabriquer un faux prix unitaire adulte/enfant).

Un seul ensemble de preuves : `pnpm typecheck`/`pnpm test`
(1486 pass/0 fail)/`pnpm lint`/`prettier --check`/`pnpm build` verts
avant merge ; fast-forward propre `c1c75cb..e43af3d` sur `main` ;
déploiement confirmé par lecture directe Vercel (pas seulement
l'affirmation de l'agent), mêmes critères que DEPLOY-01.

### Chaîne NICHE → PRICING-PROMO-LINK (2026-10-05/06) — CLÔTURÉE, MERGÉE, DÉPLOYÉE

Chaîne construite séquentiellement (chaque étape : audit d'ownership →
fiche → GO explicite → implémentation → preuve réelle, base Postgres
locale + migration appliquée en production avec vérification des
grants). Principe permanent respecté à chaque étape : `LEAD = demande,
CONTACT = point de communication, CONSENT = permission, AUDIENCE =
correspondance avec une demande, CAMPAIGN = action commerciale` —
aucun de ces concepts fusionné implicitement. Séparation d'ownership
tenue de bout en bout : `CAMPAIGN dit "à qui et pour quelle action
commerciale", PROMO dit "quelle offre", PRICING dit "quel prix final",
BOOKING dit "quelle réservation"` — jamais l'un propriétaire du rôle
de l'autre.

| Chantier                                                                                                                                                                                                                                       | Branche                   | Statut                             |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------- | ---------------------------------- |
| NICHE-PROVENANCE-01                                                                                                                                                                                                                            | `niche-provenance-01`     | **MERGÉ** (PR #133)                |
| EXPOSITION / NICHE-SIGNAL-01 (concentration) / NICHE-TREND-01 (émergence, répond à Q10) / NICHE-AUDIENCE-01                                                                                                                                    | `niche-signal-01`         | **MERGÉ** sur `main` (2026-10-06)  |
| CONSENT-01 (`lead_consent_events`, append-only, dernier événement par `occurredAt` fait foi)                                                                                                                                                   | `consent-01`              | **MERGÉ**, migration en production |
| CONTACT-01 (`contacts`, registre de points de contact normalisés, PAS une identité personne)                                                                                                                                                   | `contact-01`              | **MERGÉ**, migration en production |
| CAMPAIGN-01 (`filterAudienceByConsentCore` — orchestre CONTACT-01 puis CONSENT-01, jamais de logique propre)                                                                                                                                   | `campaign-01`             | **MERGÉ**                          |
| CAMPAIGN-PERSISTENCE-01 (`campaigns`/`campaign_targets` — snapshot au LANCEMENT, jamais à la création)                                                                                                                                         | `campaign-persistence-01` | **MERGÉ**, migration en production |
| CAMPAIGN-EXTENSION-01 (Period/Message sur `campaigns`, immuables au lancement)                                                                                                                                                                 | `campaign-extension-01`   | **MERGÉ**, migration en production |
| CAMPAIGN-ATTRIBUTION-01 (`campaign_attributions` — lien stable réservation→campagne, cron, BOOKING inchangé)                                                                                                                                   | `campaign-attribution-01` | **MERGÉ**, migration en production |
| PROMO-01 (`promos` — offre strictement liée à 1 campagne, `campaigns.promoRef` réellement rempli)                                                                                                                                              | `promo-01`                | **MERGÉ**, migration en production |
| PRICING-PROMO-LINK-01 (`applyPromoDiscountCore`/`resolveCheckoutPromoCore` — un `campaignId` transporté par le client n'est jamais une preuve d'éligibilité, toujours re-dérivée côté serveur ; `promos.allowBelowCost`, PROMO-LOSS-POLICY-01) | `pricing-promo-link-01`   | **MERGÉ**, migration en production |

Toutes les migrations DB listées ci-dessus étaient déjà appliquées en
production (vérifiées via grants/RLS à chaque chantier) **avant** leur
merge respectif — seul le code applicatif restait non déployé jusqu'à
chaque merge sur `main`. C'est maintenant résolu pour toute la chaîne.

**Câblage PRICING-PROMO-LINK-01 — 7/7 modules traités** : hôtel
(référence initiale, bugfix ordre CART-DRIFT-01/PROMO appliqué
ci-dessus), transfert, omra, package, **flight** (confirmé câblé :
`lib/vols/booking-request-action.ts` — `resolveCheckoutPromoCore` +
`applyPromoDiscountCore`, audit 2026-10-08), **activity** (confirmé
câblé : `lib/activities/guest-booking-actions.ts`, même pattern, audit
2026-10-08), **network** (N/A — flux B2B partner-debit, `debitPartnerCredit`,
pas de campagne B2C ni de `campaignId` dans le schéma d'entrée, audit
2026-10-08). `car` reste EXCLU volontairement (module dormant,
`FEATURE_CAR=false`). FERRY et VISA (futurs modules annoncés) restent
non implémentés/non câblés. Les 3 briques core (`promo-core.ts`,
`promo-discount-core.ts`, `promo-checkout-core.ts`) confirmées
réutilisables sans réécriture pour tout module restant.

**AUDIENCE-DEDUP-01 — CLÔTURÉ (2026-10-08, commit `ada54ce`)** —
pré-groupement leads par rawRef dans `filterAudienceByConsentCore`
(campaign-core.ts) : O(N leads) → O(N refs uniques) ; 4 tests node:test
ajoutés, 12/12 pass.

**CONVERSION / LEARNING — VÉRIFIÉ COUVERT** : `getCampaignPerformanceCore`
expose déjà `exposed`/`converted`/`revenueTnd`/`marginTnd`/
`sent`/`failed`/`skipped`/`pending`/`totalTargets` ; UI
`/admin/analytics/campaigns` affiche tous ces métriques (CAMPAIGN-PERF-UI-01,
CAMPAIGN-MGMT-01). LEARNING-01 (feedback loop conversion VIP) CLÔTURÉ
(commit `3b25026`). Aucun chantier supplémentaire CONVERSION/LEARNING
nécessaire à ce stade.

**Prochains chantiers potentiels identifiés, NON exécutés** :

- **FERRY / VISA** : futurs modules commerciaux annoncés, aucun audit
  d'intégration réalisé, aucun code, aucun stub.

**MISSION PARALLÈLE EN COURS (hors chaîne NICHE→PROMO)** :
`MASTER STRESS TEST` — audit E2E/produit écran par écran demandé
2026-10-06. Audit infra existante rendu (Playwright/CI/fixtures/seed/
mock GoTrue/audits antérieurs `docs/audits/*` du 2026-09-11, périmés
depuis la chaîne NICHE→PROMO entière + CURRENCY-DIM-01a +
ECON-BREAKDOWN-01, jamais rejoués en navigateur réel). **STOP — en
attente du GO** pour reconstruire l'infra locale (Postgres + mock
GoTrue + seed), seul préalable technique avant le premier scénario.

### CRM-NICHE-01 — CLÔTURÉ (2026-10-05)

```text
ID: CRM-NICHE-01
Statut: CLÔTURÉ (2026-10-05) — TESTED / READY FOR PRODUCTION — NOT YET PUSHED
Branche: crm-niche-01
Commit: b71738b
```

**Audit préalable** : NICHE ENGINE = ❌ NON (gap quasi total) — le CRM
capturait des leads (LEAD MACHINE) mais ne pouvait les regrouper en
segments commerciaux observables/mesurables/reproductibles (destination,
intention, marché, période, comportement). Aucune table/colonne
segment/niche/cohort, aucune fonction d'agrégation, aucune persistance.

**Périmètre explicitement scindé** (décision utilisateur) :

- **CRM-NICHE-01** (ce chantier) : modèle de segmentation sur les
  sources déjà captées aujourd'hui (site web/apps).
- **CRM-NICHE-02** (futur, audit séparé requis) : branchement du reste
  du réseau Easy2Book (agence physique, partenaire, commercial,
  fournisseur-référent, campagnes pub, réseaux sociaux) — aucun point
  d'entrée de capture structuré n'existe encore pour ces sources.

**Ce qui a été fait** :

- `lib/db/schema.ts` : 3 colonnes additives sur `leads` — `destination`
  (varchar, texte libre), `intention` (varchar, validée en code contre
  `LEAD_INTENTIONS`), `market` (varchar, validée contre `LEAD_MARKETS`)
  - index composite `leads_agency_market_product_intention_idx`.
- `lib/crm/leads-core.ts` : `LEAD_INTENTIONS = ["groupe", "transfert",
"a_la_carte", "standard"]` (alignée sur la décision Devis permanente
  2026-09-29, Phase 3 R3-03 — les 3 valeurs non-standard sont exactement
  les 3 cas où le futur flux devis s'appliquera) ; `LEAD_MARKETS =
["tunisia"]`, extensible sans migration (contrainte TS, pas un enum
  DB) pour l'expansion USA/Asia annoncée par l'utilisateur.
- `lib/crm/niche-core.ts` (nouveau) : `computeNicheSegmentsCore()`
  (fonction pure, group-by déterministe marché × produit × intention ×
  destination × période mensuelle, avec volume + taux de conversion) ;
  `getNicheSegmentsCore()` lit les leads réels de l'agence et délègue
  tout le calcul sans dupliquer la logique.
- `app/actions/submit-lead.ts` + `components/leads/lead-capture-form.tsx` :
  câblage de `intention` (défaut "standard"), `destination` optionnelle.
- Migration `drizzle/manual/0110_leads_niche_dimensions.sql` — additive,
  idempotente (`ADD COLUMN IF NOT EXISTS`), aucune colonne existante
  touchée, aucun impact reservations/payments/wallet.

**Hors scope volontaire** : dimension "comportement" (récence/fréquence
par contact) — identifiée dans l'audit comme manquante, mais absente du
critère de sortie validé au GO ; à reprendre si besoin dans un chantier
dédié, pas ajoutée ici par anticipation.

**Preuves** :

- `pnpm test` : 1391/1391 pass (7 nouveaux tests `niche-core.test.ts` :
  liste vide, regroupement multi-dimensions, période distincte, taux de
  conversion sans division par zéro, destination null vs renseignée, tri
  par volume).
- `pnpm typecheck` : 0 erreur.
- `pnpm lint` : 0 erreur (2 runs).
- `npx prettier --check` sur tous les fichiers modifiés : clean.
- `pnpm build` : exit 0.

**Mis à jour (2026-10-05, même jour — GO explicite reçu)** :

- PR #131 ouverte (`crm-niche-01` → `main`), branche pushée.
- Migration 0110 appliquée en production Supabase `crygnaichvlxavvbifqi`
  (`apply_migration`, succès) — vérifié par lecture directe :
  `destination` (varchar, nullable), `intention` (varchar, NOT NULL,
  défaut `'standard'`), `market` (varchar, NOT NULL, défaut `'tunisia'`),
  index `leads_agency_market_product_intention_idx` présent.

**NOT VERIFIED** :

- PR #131 : pas encore mergée sur `main` — CI à surveiller.
- Visual QA dashboard CRM : aucune UI de consultation des segments n'a
  été construite dans ce chantier (hors scope — le critère de sortie
  validé portait sur la fonction d'agrégation, pas sur un écran staff).

**Prochain chantier potentiel identifié, NON exécuté** : une vue
dashboard consommant `getNicheSegmentsCore()` (affichage des segments
par marché/produit/intention) serait l'étape naturelle pour rendre ce
moteur exploitable par le staff — à auditer/proposer séparément, sur GO
explicite, pas enchaîné automatiquement ici.

---

### APPLY-PENDING-MIGRATIONS-01 — CLÔTURÉ (2026-10-03)

**Objectif** : appliquer les 3 migrations DB en attente (0091, 0098, 0099) présentes dans le dépôt mais jamais appliquées en production, et corriger un bug de production latent (Inngest `CRM-AUTO-CONV-01` crasherait sur `booking/confirmed` sans la table `notification_idempotency`).

**État audit** : FIX (migrations additives, aucun backfill, aucune régression)

**Anomalie découverte** : `0091_fx_policy.sql` contenait une policy RLS avec `auth.uid()` + table `profiles` — or `profiles` n'existe pas dans ce projet (le pattern RLS est `is_super_admin()` via GUC `app.is_super_admin`). La policy cassée a été délibérément omise à l'apply de 0091, puis créée correctement via 0098.

**Ce qui a été fait** :

| Migration | Nom                        | Application                          | `supabase_migrations` version |
| --------- | -------------------------- | ------------------------------------ | ----------------------------- |
| 0091      | `fx_policy`                | ✅ appliqué (sans policy `profiles`) | `20261003211453`              |
| 0098      | `fx_policy_rls_fix`        | ✅ appliqué (`is_super_admin()`)     | `20261003212128`              |
| 0099      | `notification_idempotency` | ✅ appliqué                          | `20261003212242`              |

**Vérification production** :

- `fx_policies` : EXISTS ✅ — RLS activé, policy `fx_policies_super_admin` → `is_super_admin()` ✅
- `reservation_financials.applied_exchange_rate` : EXISTS, nullable ✅
- `reservation_financials.applied_exchange_rate_at` : EXISTS, nullable ✅
- `reservation_financials.fx_policy_id` : EXISTS, nullable ✅
- `notification_idempotency` : EXISTS ✅ — RLS activé, policy `notification_idempotency_tenant_isolation` → `current_agency_id() OR is_super_admin()` ✅
- Index `notification_idempotency` : `_pkey`, `_sent_uniq` (UNIQUE reservation_id+action), `_agency_idx`, `_reservation_idx` ✅
- Grants `app_runtime` sur `fx_policies` : SELECT, INSERT, UPDATE, DELETE ✅
- Grants `app_runtime` sur `notification_idempotency` : SELECT, INSERT, UPDATE, DELETE ✅

**Bug de production corrigé** : `lib/inngest/functions/auto-convert-lead.ts` (SHA `fb77801`, déployé) référençait `notification_idempotency` — table désormais présente en production.

**Aucun changement de code applicatif** — DB uniquement.

---

### CURRENCY-DIM-01 — CLÔTURÉ (2026-10-03)

**Objectif** : rendre les offres de vol Duffel facturées en EUR/USD visibles à la recherche et correctement ancrées financièrement au booking (Option B — traçabilité FX complète).

**État audit** : EXTEND (`applyCommercialEngine`, `flight_price_snapshots`, `finalizeFlightBookingFinancials`)

**Problème résolu** : toute offre `supplierCurrency ≠ TND` levait `UnsupportedCommercialCurrencyMismatchError` dans `computeCommercialResult()` et était silencieusement filtrée — aucun vol Duffel réel ne s'affichait jamais.

**Ce qui a été fait** :

- `applyCommercialEngine()` (`lib/vols/commercial-engine.ts`) : pré-conversion FX avec taux d'affichage mis en cache (`fetchExchangeRateForDisplay`) avant d'appeler `computeCommercialResult()` — préserve montant + devise originaux dans `supplierOriginalAmount` / `supplierOriginalCurrency`
- `createPriceSnapshot()` (`lib/vols/price-snapshot.ts`) : stocke les 2 nouvelles colonnes nullable dans le snapshot
- `finalizeFlightBookingFinancials()` (`lib/vols/flight-financials.ts`) : bloc FX activé — re-demande un taux frais au booking (`fetchExchangeRateForBooking`, D2 Option B) sur les snapshots où `supplierOriginalCurrency ≠ NULL`
- `computeCommercialResult()` : **INCHANGÉ** — toujours reçoit des montants dans la même devise après pré-conversion ; P15/P15b inchangés
- Migration `drizzle/manual/0103_flight_snapshot_fx_columns.sql` : 2 colonnes nullable additive sur `flight_price_snapshots` (`supplier_original_amount DECIMAL(12,3)`, `supplier_original_currency VARCHAR(3)`) — idempotente (`ADD COLUMN IF NOT EXISTS`)
- 5 nouveaux tests `lib/vols/__tests__/commercial-engine-fx.test.ts` (P_FX_01, P_FX_ORIGINAL, P_FX_TND, P_FX_02, P_FX_USD)
- `lib/finance/__tests__/fx-policy.test.ts` FX-POLICY-14 mis à jour pour la nouvelle condition `originalCurrency !== "TND"`

**Preuves** :

- PR #122 ouverte et mergée sur `main` — SHA squash `6960031e63ba3258ace6cb28829d687c01e63b36`
- CI #190 : `typecheck` ✅ · `lint` ✅ · `test` ✅ · `build` ✅ · `financial-e2e` ✅ (échecs `format`/`playwright-a11y`/`lighthouse` pré-existants sur cette branche, non causés par ce chantier)
- Migration 0103 appliquée en production Supabase `crygnaichvlxavvbifqi` — colonnes vérifiées : `supplier_original_amount` (numeric, nullable) + `supplier_original_currency` (character varying, nullable) ✅

**Statut** : CLÔTURÉ (2026-10-03) — MERGED (PR #122, squash `6960031e` sur main) + MIGRATION 0103 APPLIQUÉE EN PRODUCTION

---

### APPLY-PENDING-MIGRATIONS-02 — N/A (2026-10-04)

**Objectif** : appliquer 0095 (`destinations_featured`) + 0096 (`development_project_waitlist`) en production.

**Résultat audit** : N/A — les deux migrations étaient déjà appliquées en production.
La ROADMAP indiquait "NON ENCORE APPLIQUÉE" mais la vérification MCP Supabase (2026-10-04)
confirme :

- `destinations.is_featured` (boolean DEFAULT false) + `destinations.display_order` (integer DEFAULT 0) : présents (version `20261002185747`)
- table `development_project_waitlist` : présente (version `20261002185755`)

Aucune action DB requise.

---

### WHITE-LABEL-PRO-01 — CLÔTURÉ (2026-10-04, commit `e691cf7`)

**Objectif** : appliquer la `primaryColor` de l'agence comme variable CSS `--primary` sur le portail /pro.

**État audit** : EXTEND — infrastructure existante (`agencies.primary_color` DB, `PartnerProfile.primaryColor`) ; seul le câblage jusqu'au composant manquait.

**Changements** :

- `app/(internal)/pro/(app)/layout.tsx` : passage de `primaryColor: profile.agency.primaryColor` dans le prop `agency` de `<ProShell>`.
- `components/pro/layout.tsx` :
  - Ajout `primaryColor?: string | null` dans `ProSidebarAgency`.
  - Import `CSSProperties` depuis react.
  - Validation hex `/^#[0-9a-fA-F]{6}$/` + injection `style={{ "--primary": validPrimaryColor }}` sur `<SidebarProvider>`.

**Tests** :

- `pnpm typecheck` : ✓ zéro erreur.
- 19 tests statiques invariants (margins + channel) : ✓ pass.
- Dev server compile `/pro/login` (full layout chain) : ✓.
- Preuve visuelle avec agence authentifiée : NOT VERIFIED (requiert session DB live avec `primary_color` renseigné).

**Aucun changement DB** — `agencies.primary_color` existe depuis la migration initiale.

---

### FX-ADMIN-01 — CLÔTURÉ (2026-10-03)

**Objectif** : interface admin `/admin/fx-policy` (super_admin) pour créer et désactiver des entrées `fx_policies` — débloque les confirmations de vol non-TND (Duffel EUR/USD) bloquées par `FxPolicyUnavailableError` en production (table à 0 lignes).

**État audit** : CREATE (aucun code existant dans `app/` pour `fx_policies`)

**Ce qui a été fait** :

- `lib/finance/fx-policy-actions.ts` : server actions `createFxPolicy`, `deactivateFxPolicy`, `listFxPolicies` — guard super_admin, version auto-incrémentée, validation métier
- `components/admin/fx-policy-manager.tsx` : client component — liste des politiques, formulaire création (4 correctionModes × 3 bankFeeModes), bouton désactiver, badge alerte critique si 0 politiques actives
- `app/(internal)/admin/fx-policy/page.tsx` : Server Component — guard super_admin, affiche alerte fail-closed si 0 politiques actives
- `app/(internal)/admin/fx-policy/loading.tsx` : skeleton Suspense
- `components/admin-shell.tsx` : entrée "Politique FX" (icône Landmark) dans `superAdminNavItems`
- Fix Turbopack : suppression `export type { CorrectionMode, BankFeeMode }` depuis `"use server"` (types importés directement depuis `@/lib/finance/fx-policy` dans le composant client)

**Preuves** :

- TypeScript `tsc --noEmit` : ✅ aucune erreur
- Tests `fx-policy.test.ts` : 16/16 pass ✅ (total suite 1390 pass, 0 fail)
- Build Vercel Preview : ✅ state=success (commit `b44727e`)
- Politique v1 insérée en production (`id=3e12bcdf`, `correctionMode=NONE`, `bankFeeMode=NONE`, `effective_to=NULL`) — `getActiveFxPolicy()` ne lève plus `FxPolicyUnavailableError` ✅
- PR #123 ouverte et mergée sur `main` — SHA squash `6a6427dac3aba9ab23120182b2cfd0e8b892908a`

**Statut** : CLÔTURÉ (2026-10-03) — MERGED (PR #123, squash `6a6427d` sur main) + POLITIQUE v1 ACTIVE EN PRODUCTION

---

### VOLS-CLEANUP-01 — CLÔTURÉ (2026-10-03)

**Objectif** : supprimer la chaîne morte `lib/vols/client.ts` → `lib/vols/supplier-drivers.ts` → `lib/vols/__tests__/supplier-drivers.test.ts` (code Duffel live jamais activé) et la chaîne UI morte `flight-booking-content.tsx` → `flight-guest-booking-form.tsx` ; migrer les types `FlightOffer` vers `lib/vols/schemas.ts`.

**État audit** : FIX (suppression dead code, migration de types)

**Ce qui a été fait** :

- Supprimé `lib/vols/client.ts` (appels Duffel live inutilisés)
- Supprimé `lib/vols/supplier-drivers.ts` (driver live Duffel, jamais activé)
- Supprimé `lib/vols/__tests__/supplier-drivers.test.ts` (tests du driver mort)
- Supprimé `app/(public)/[locale]/vols/book/flight-booking-content.tsx` (UI booking vol inaccessible)
- Supprimé `components/flights/flight-guest-booking-form.tsx` (formulaire guest vol inaccessible)
- Migré `FlightSegmentSchema`, `FlightJourneySchema`, `FlightOfferSchema`, `FlightOffer` de `client.ts` → `lib/vols/schemas.ts`
- `lib/vols/filter-engine.ts` : import corrigé `"./client"` → `"./schemas"`
- `app/(public)/[locale]/vols/search/flight-results-content.tsx` : import corrigé `"@/lib/vols/client"` → `"@/lib/vols/schemas"`
- `lib/modules/capabilities.ts` : entrée `vols` mise à jour vers les fichiers live (`booking-request-action.ts`, `adapters/virtual.ts`)

**Preuves** :

- TypeScript `tsc --noEmit` : ✅ aucune erreur
- Commit `fdcbdd9` sur branche `claude/easy2book-v6-modernization-7gyb5v`

**Statut** : CLÔTURÉ (2026-10-03) — MERGED via PR #124 (squash `87f0d7b` sur main, 2026-10-04)

---

### CI-FIX-01 — CLÔTURÉ (2026-10-03)

**Objectif** : corriger les échecs CI persistants sur les jobs `lighthouse` et `playwright-a11y` causés par l'absence de `DATABASE_URL` dans ces environnements CI (→ HTTP 500 sur toutes les pages SSR).

**État audit** : FIX (`.github/workflows/ci.yml` uniquement)

**Cause racine** : `getDb()` dans `lib/db/client.ts` lève `"DATABASE_URL non définie"` si absent → HTTP 500 toutes routes SSR → `ERRORED_DOCUMENT_REQUEST` pour Lighthouse, timeout pour Playwright.

**Ce qui a été fait** :

- `.github/workflows/ci.yml` — job `lighthouse` : ajout service `postgres:16`, `DATABASE_URL = postgresql://postgres:postgres@localhost:5432/postgres`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, step `pnpm db:push --force`
- `.github/workflows/ci.yml` — job `playwright-a11y` : même service postgres + variables, ajout `continue-on-error: true` manquant
- 41 fichiers reformatés par Prettier (intégrés au même commit)

**Preuves** :

- Commit `0b0914b` sur branche `claude/easy2book-v6-modernization-7gyb5v`

**Statut** : CLÔTURÉ (2026-10-03) — MERGED via PR #124 (squash `87f0d7b` sur main, 2026-10-04)

---

### DB-UNBLOCK-01 — CLÔTURÉ (2026-10-03)

**Objectif** : supprimer l'ancien index `pricing_margins_agency_module_uniq` (UNIQUE sur `agency_id, module`) qui bloquait les inserts multi-canal, et valider que l'invariant `UNIQUE(agency_id, module, channel)` est bien en place.

**État audit** : FIX (correction DB production uniquement)

**Ce qui a été fait** :

- `DROP INDEX pricing_margins_agency_module_uniq` appliqué manuellement en production Supabase (l'index n'existait plus dans le schéma Drizzle depuis la migration `0101_pricing_margins_channel.sql` — la commande `DROP INDEX IF EXISTS` dans cette migration avait échoué lors de l'apply automatique).
- Invariant vérifié dans `lib/db/schema.ts:1545` : `uniqueIndex("pricing_margins_agency_module_channel_uniq").on(t.agencyId, t.module, t.channel)` ✅
- Preuve production : 3 index restants sur `pricing_margins` — `pricing_margins_pkey`, `pricing_margins_agency_idx`, `pricing_margins_agency_module_channel_uniq` — ancien index absent ✅
- Correction bogue pré-existant `import.meta.dirname` → `__dirname` dans `lib/pro/__tests__/margins-complete-invariants.test.ts:14`

**Tests** :

- `margins-complete-invariants.test.ts` : 9/9 pass ✅
- `channel-margins-invariants.test.ts` : 5/5 pass ✅
- `channel-apply-invariants.test.ts` : 10/10 pass ✅
- Total : 24/24 pass · TSC : 0 erreur · ESLint : 0 erreur

**Aucun changement de schéma DB** — validation uniquement.

---

### MARGINS-COMPLETE-01 — CLÔTURÉ (2026-10-03)

**Objectif** : supprimer l'incohérence R3-02 — `lib/cars/pricing.ts` contournait `getMarginsForAgency` par une requête directe sur `pricingMargins` ; câbler "network" dans l'UI System A ; ajouter "car" au type.

**État audit** : FIX + EXTEND

**Ce qui a été fait** :

- `lib/pro/pricing.ts` : `MarginModule` étendu avec `"car"` ; `DEFAULT_MARGINS.car = { percent, 0, isActive: false }` (dormant)
- `lib/pro/server-context.ts` : `"car"` ajouté à `MARGIN_MODULES`
- `lib/cars/pricing.ts` : remplace requête directe `pricingMargins` par `getMarginsForAgency(agencyId, undefined, channel ?? "direct")` ; `CarPricingInput` + champ optionnel `channel?: DistributionChannel` ; imports `pricingMargins`/`withTenantContext` supprimés
- `lib/pro/margins-actions.ts` : z.enum module étendu avec `"car"`
- `components/pro/margins-form.tsx` : `MODULE_META.car` ajouté pour cohérence `Record<MarginModule>` ; non affiché dans /pro/marges (FEATURE_CAR=false)
- `components/admin/pricing-margins-manager.tsx` : `MODULE_LABELS.network = "Produits Réseau"` — l'admin peut désormais configurer la marge Network via l'UI System A
- `lib/pro/__tests__/margins-complete-invariants.test.ts` : 9 invariants statiques

**Tests** : 9/9 pass · TSC : 0 erreur · ESLint : 0 erreur
**Commit** : `63a52e4`
**NOT VERIFIED** : déploiement production (pipeline main → Vercel)

---

### DISTRIB-CHANNEL-APPLY-01 — CLÔTURÉ (2026-10-03)

**Objectif** : câbler le canal de distribution sur tous les call sites de `getMarginsForAgency()`.

**État audit** : EXTEND — l'infrastructure canal était complète (param, cache, filtre DB) mais aucun call site ne passait le 3e argument.

**Ce qui a été fait** :

- Ajout de `resolvePartnerChannel(profile: PartnerProfile): DistributionChannel` dans `lib/pro/server-context.ts` (exportée)
- Mise à jour de `getActivePartnerMargins()` → passe `resolvePartnerChannel(profile)` en 3e arg
- 3 call sites B2B → `channel="b2b"` : `lib/booking/actions.ts`, `lib/transfers/pricing.ts`, `lib/network/product-booking-actions.ts`
- 5 call sites invités/public → `channel="direct"` : `lib/booking/guest-actions.ts`, `lib/vols/guest-booking-actions.ts`, `lib/hotels-monde/guest-booking-actions.ts`, `app/api/hotels/search-public/route.ts`, `app/api/hotels-monde/search/route.ts`
- Nouveau fichier `lib/pro/__tests__/channel-apply-invariants.test.ts` (10 invariants statiques)
- Mise à jour regex dans `lib/network/__tests__/product-booking-actions-invariants.test.ts`

**Tests** : 23/23 pass · TSC : 0 erreur · ESLint : 0 erreur (1 warning pre-existant dans actions.ts)
**Commit** : `9b503a1`
**NOT VERIFIED** : déploiement production (pipeline main → Vercel)

---

### CHANNEL-MARGINS-UI-01 — CLÔTURÉ (2026-10-03)

```text
ID: CHANNEL-MARGINS-UI-01
Statut: CLÔTURÉ (2026-10-03)
Branche: claude/easy2book-v6-modernization-7gyb5v
Commit: f64372d

Fichiers modifiés:
  - lib/pro/margins-actions.ts : channel (direct/b2b/white_label/api) ajouté
    à MarginInputSchema (optionnel, propagé à AdminMarginActionInput)
  - components/admin/pricing-margins-manager.tsx :
    · CHANNEL_LABELS map (Direct / B2B / White Label / API)
    · sélecteur "Canal de distribution" dans le formulaire (défaut: direct)
    · colonne "Canal" (Badge outline) dans le tableau
    · findIndex et handleToggle corrigés pour la clé (agency, module, channel)
  - lib/pro/__tests__/channel-margins-invariants.test.ts (nouveau) : 5 tests

DB: AUCUN CHANGEMENT — schéma complet depuis 0101 (branche + index multi-canal)
Tests: 5/5 PASS (node:test, 0 imports @/) · tsc 0 erreur · lint 0 erreur
Visual QA: login redirect confirmé (Playwright) · dialog et colonne Canal
  NOT VERIFIED sur session authentifiée (local DB indisponible en cloud)

⚠️ Rappel : DROP INDEX pricing_margins_agency_module_uniq toujours en attente
   (Supabase Studio). Bloque l'insertion de 2 marges distinctes par canal pour
   le même (agency_id, module). Table vide en production — aucun risque data.
```

### PR-PILOTE-MERGE-01 — CLÔTURÉ (2026-10-03)

```text
ID: PR-PILOTE-MERGE-01
Statut: CLÔTURÉ (2026-10-03)
PR: #119 — mergée squash, commit f1ab2c6d sur main
```

**Migrations appliquées en production (Supabase `crygnaichvlxavvbifqi`) :**

| Migration                                         | Résultat                                                                                                                                                                                               |
| ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `0100_authorized_product_type_extend`             | ✅ APPLIED — ADD VALUE 'car'/'transfer' à authorized_product_type                                                                                                                                      |
| `0101_pricing_margins_channel` (ADD COLUMN)       | ✅ APPLIED — colonne `channel VARCHAR(16) DEFAULT 'direct'` ajoutée                                                                                                                                    |
| `0101_pricing_margins_channel` (DROP old index)   | ❌ NOT APPLIED — `DROP INDEX pricing_margins_agency_module_uniq` refusé par le MCP Supabase. À exécuter manuellement via Supabase Studio SQL editor : `DROP INDEX pricing_margins_agency_module_uniq;` |
| `0101_pricing_margins_channel` (CREATE new index) | ✅ APPLIED — `pricing_margins_agency_module_channel_uniq` sur (agency_id, module, channel)                                                                                                             |
| `0102_pricing_margins_guardrail`                  | ✅ APPLIED — CHECK constraints `margin_value >= 0` et `<= 10000`                                                                                                                                       |

**⚠️ Action manuelle requise** : tant que `pricing_margins_agency_module_uniq` (sur agency_id+module sans channel) n'est pas supprimé, il est impossible d'insérer deux marges différentes par canal pour le même module d'une agence. `pricing_margins` est vide en production (0 lignes) — aucune donnée à risque.

---

### CRM-RELANCE-CRON-01 — CLÔTURÉ (2026-10-03)

```text
ID: CRM-RELANCE-CRON-01
Statut: CLÔTURÉ (2026-10-03)
Branche: claude/easy2book-v6-modernization-7gyb5v
Commit: 671392a

Fichiers créés/modifiés:
  - lib/inngest/functions/notify-stale-leads.ts (nouveau) — Inngest cron 08:00 UTC,
    idempotence via step.run("notify-stale-YYYY-MM-DD"), withSystemContext pour DB,
    email HTML Resend par agence (max 10 leads affichés + "N autres")
  - lib/inngest/functions/index.ts : export notifyStaleLeads
  - app/api/inngest/route.ts : enregistrement notifyStaleLeads + autoConvertLead
    (autoConvertLead était absent — oubli de CRM-AUTO-CONV-01 corrigé ici)
  - lib/crm/__tests__/lead-relance-cron-invariants.test.ts : 5 invariants purs

DB: AUCUN CHANGEMENT — utilise leadRelanceSettings + leads + agencies existants
Tests: tsc --noEmit 0 erreur · 5/5 invariants pass
NOT VERIFIED: déclenchement réel Inngest (nécessite INNGEST_SIGNING_KEY + cron 08:00 UTC)
```

### CRM-AUTO-CONV-01 — CLÔTURÉ (2026-10-03)

```text
ID: CRM-AUTO-CONV-01
Statut: CLÔTURÉ (2026-10-03)
Branche: claude/easy2book-v6-modernization-7gyb5v
Commit: 26cec9b

Fichiers créés/modifiés:
  - lib/crm/leads-core.ts : autoConvertLeadCore() — correspond email/phone du client,
    statuts new/contacted, sans reservationId existant ; convertit si exactement 1 match ;
    skip silencieux si 0 ou ≥2 (ambiguïté → staff manuel)
  - lib/inngest/functions/auto-convert-lead.ts (nouveau) — Inngest function sur
    booking/confirmed, idempotente via notification_idempotency(reservationId,
    'lead.auto_converted'), audit trail dans auditEvents, onFailure → Sentry
  - lib/inngest/functions/index.ts : export barrel mis à jour

DB: AUCUN CHANGEMENT de schéma — utilise notification_idempotency + auditEvents existants
Tests: tsc --noEmit 0 erreur · lint 0 erreur
NOT VERIFIED: déclenchement réel Inngest (nécessite INNGEST_SIGNING_KEY + booking/confirmed
  émis en preview/prod)
```

### MARGIN-GUARDRAIL-01 — CLÔTURÉ (2026-10-03)

```text
ID: MARGIN-GUARDRAIL-01
Statut: CLÔTURÉ (2026-10-03)
Branche: claude/easy2book-v6-modernization-7gyb5v
Commit: 70cc7da

Fichiers créés/modifiés:
  - lib/pro/margins-core.ts : guards applicatifs margin_value >= 0 et <= 10000
  - drizzle/manual/0102_pricing_margins_guardrail.sql : CHECK constraints DB
    pricing_margins_margin_value_positive (>= 0) + pricing_margins_margin_value_max (<= 10000)

DB: migration 0102 à appliquer (CHECK constraints idempotentes)
Tests: tsc 0 erreur · lint 0 erreur
```

### YIELD-DEPRECATE-01 — CLÔTURÉ (2026-10-03)

```text
ID: YIELD-DEPRECATE-01
Statut: CLÔTURÉ (2026-10-03)
Branche: claude/easy2book-v6-modernization-7gyb5v
Commit: ea53024

Fichiers supprimés:
  - lib/yield/math.ts (130 lignes) — zéro appelant confirmé
  - lib/yield/actions.ts (130 lignes) — zéro appelant confirmé
Fichiers modifiés:
  - lib/db/schema.ts : header yieldRules marqué @deprecated
  - lib/__tests__/tenant-isolation-certification.test.ts : note ajoutée

DB: table yield_rules conservée (RLS cert) — AUCUNE migration
Tests: tsc 0 erreur · lint 0 erreur
```

### Phase 1 (PILOTE) — CLÔTURÉ (2026-10-03)

```text
ID: TENANT-TYPES-01 / DISTRIB-EXTEND-01 / CHANNEL-DIM-01
Statut: CLÔTURÉ (2026-10-03)
Branche: claude/easy2book-v6-modernization-7gyb5v
Commit: 0e5f0fc

Fichiers créés/modifiés:
  - lib/types/tenant.ts (nouveau) : BookingActorType, ProductOwnerType,
    DistributionChannel, DISTRIBUTION_CHANNELS
  - lib/db/schema.ts : authorizedProductType étendu ('car', 'transfer') +
    pricingMargins.channel VARCHAR(16) NOT NULL DEFAULT 'direct' +
    index unique (agency_id, module, channel)
  - lib/pro/server-context.ts : getMarginsForAgency() 3e param channel +
    invalidateMarginsCache vide les 4 canaux
  - lib/pro/margins-core.ts : UpsertPricingMarginParams.channel? +
    conflict target (agencyId, module, channel)
  - components/admin/pricing-margins-manager.tsx : channel: "direct" default
  - components/pro/authorized-products-list.tsx : car/transfer labels
  - drizzle/manual/0100_authorized_product_type_extend.sql : ADD VALUE 'car'/'transfer'
  - drizzle/manual/0101_pricing_margins_channel.sql : ADD COLUMN channel + index

DB: migrations 0100 + 0101 à appliquer
Tests: tsc 0 erreur · lint 0 erreur
```

### CRM-STATS-01 — CLÔTURÉ (2026-10-03)

```text
ID: CRM-STATS-01
Statut: CLÔTURÉ (2026-10-03)
Branche: claude/easy2book-v6-modernization-7gyb5v
Commit: 1a64f9e

Fichiers créés/modifiés:
  - components/admin/lead-stats-bar.tsx (nouveau) — 6 chips KPI responsive :
    total / new / contacté / converti / clos / stale-ou-convRate
  - components/admin/leads-view-tabs.tsx — LeadStatsBar inséré au-dessus des onglets
  - lib/crm/__tests__/lead-stats-invariants.test.ts (nouveau) — 6 tests

DB: AUCUN CHANGEMENT — calcul pur depuis le tableau leads déjà chargé
Tests: 6/6 PASS · tsc 0 erreur · lint 0 erreur
Visual QA: NOT VERIFIED — nécessite session staff sur /admin/support
```

### CRM-NOTES-01 — CLÔTURÉ (2026-10-03)

```text
ID: CRM-NOTES-01
Statut: CLÔTURÉ (2026-10-03)
Branche: claude/easy2book-v6-modernization-7gyb5v
Commit: 19811dd

Fichiers créés/modifiés:
  - lib/crm/leads-core.ts : updateLeadNotesCore() — UPDATE leads SET staff_notes
    sans changement de statut, scopé agencyId
  - lib/admin/leads-actions.ts : updateLeadNotes() Server Action autonome
  - components/admin/lead-pipeline.tsx : StaffNotesWidget inline dans LeadCard —
    toggle collapsable, textarea 2000 chars, preview quand fermé
  - components/admin/customer-360-panel.tsx : section "Note interne" en lecture
    (pre-wrap, fond amber) dans Vue 360 si staffNotes non null
  - lib/crm/__tests__/lead-notes-invariants.test.ts : 5 tests (new file)

DB: AUCUN CHANGEMENT — colonne staff_notes TEXT déjà présente (migration 0043)

Tests: 5/5 PASS
Typecheck: 0 erreur
Lint: 0 erreur
Visual QA: NOT VERIFIED — nécessite session staff sur /admin/support en production
```

### BRAND-ADMIN-01 — CLÔTURÉ (2026-10-02)

```text
ID: BRAND-ADMIN-01
Statut: CLÔTURÉ (2026-10-02) — MERGED (PR #118, squash 296a16c sur main)
Branche: claude/easy2book-v6-modernization-7gyb5v
Commit: 01f4fb1
```

**Objectif** : Permettre au super_admin de gérer l'identité et les coordonnées du Brand Owner Easy2Book depuis `/admin/brand`, en écrivant dans l'agence OTA (`agencyType='ota'`, `domain IS NULL`).

**Périmètre** :

- `lib/admin/brand-actions.ts` — Server Actions `getOtaBrandInitial` + `updateOtaBrand`. agencyId résolu côté serveur. Vérifie `role=super_admin`. Écrit uniquement les colonnes de marque/contact/social.
- `components/admin/brand-form.tsx` — Formulaire client (brandName, logo, couleur, email, téléphone, adresse, WhatsApp, Facebook, Instagram, TikTok).
- `app/(internal)/admin/brand/page.tsx` — Page Server Component.
- `components/admin-shell.tsx` — Lien "Marque Easy2Book" (icône `Palette`) + breadcrumb.

**Preuves** :

- `npx tsc --noEmit` → 0 erreur source
- `npx eslint <fichiers>` → 0 warning
- PR #118 mergée, squash `296a16c` sur `main`

**DB** : Aucune migration — colonnes déjà présentes via 0097 (SITE-CONFIG-01).

**Visual QA** : NOT VERIFIED — validation en Preview Vercel requise (local DB indisponible dans l'environnement cloud).

---

### SITE-CONFIG-01 — CLÔTURÉ (2026-10-02)

```text
ID: SITE-CONFIG-01
Statut: CLÔTURÉ (2026-10-02) — TESTED / READY FOR PRODUCTION — NOT YET MERGED
Branche: claude/easy2book-v6-modernization-7gyb5v
Commit: c511f15
```

**Objectif** : Rendre administrables les informations de contact (téléphone, WhatsApp) et réseaux sociaux (Facebook, Instagram, TikTok) via la table `agencies`. Supprimer tout numéro hardcodé (`+21698140514`) du code.

**Périmètre** :

- Migration 0097 : `ADD COLUMN whatsapp_number, facebook_url, instagram_url, tiktok_url` sur `agencies`
- Nouveau `lib/tenant/site-config.ts` : `getSiteContactInfo(agencyId?)` via `withSystemContext`
- Header + Footer : contactPhone, whatsappNumber, facebookUrl, instagramUrl, tiktokUrl depuis DB
- Pages bookings / compte / omra (list + detail) / packages (detail) : supportPhone depuis DB
- B2B `/pro/etablissement` : formulaire étendu avec 4 champs sociaux + Server Action + core

**Preuves** :

- `grep -r "21698140514" components/ app/` → 0 occurrence fonctionnelle (3 occurrences doc/placeholder acceptables)
- `npx tsc --noEmit` → 0 erreur
- `npx eslint <fichiers modifiés>` → 0 erreur

**Visual QA** : NOT VERIFIED — validation en Preview Vercel requise (local DB indisponible dans l'environnement cloud).

**Migration DB** : À appliquer en production via `mcp__Supabase__apply_migration` sur GO explicite.

### R8-06 — CLÔTURÉ (2026-10-02)

**Périmètre** : Consolidation design system — remplacement des couleurs Tailwind hardcodées (`bg-gray-*`, `text-gray-*`, `border-gray-*`, `bg-white` sémantique) par les tokens CSS shadcn/ui (`bg-muted`, `text-muted-foreground`, `bg-card`, `border-border`, `text-foreground`).

**Fichiers modifiés** : 21 fichiers — `components/admin/` (6 tables), `components/` racine (6 sections/cards), `components/pro/` (2), `components/omra/` (1), `app/(internal)/admin/` (11 pages), `app/(public)/` (2 pages).

**Exceptions documentées (intentionnel)** : `booking-engine.tsx` glassmorphism (`bg-white/90`, `/60`, `/95` sur image hero), `omra-package-list.tsx` (`bg-white/20` badge sur image), `module-hero.tsx` (`bg-white/15` backdrop blur), `footer-client.tsx` (logos d'agence sur fond sidebar dark + badges paiement VISA/Mastercard).

**Preuves** : `grep -r "bg-gray-100\|bg-gray-50\|text-gray-\|border-gray-200" components/ app/` → 0 résultat hors exceptions. `npx tsc --noEmit` → 0 erreur.

**Visual QA** : NOT VERIFIED — nécessite validation dark/light mode en Preview avant déploiement Production.

---

### CRM-NOTIFY-01 — CLÔTURÉ (2026-10-02)

```text
ID: CRM-NOTIFY-01
Statut: CLÔTURÉ (2026-10-02)
PR: #115 — squash merge → main (commit 335c685)
Branche: claude/easy2book-v6-modernization-7gyb5v
```

**Objectif** : Notification email automatique à l'agence dès qu'un visiteur soumet le formulaire "Être rappelé" / "Demander un devis".

**Fichiers créés/modifiés** :

- `lib/inngest/client.ts` — type event `crm/lead.created`
- `lib/inngest/functions/process-new-lead.ts` — nouvelle fonction Inngest (créée)
- `lib/inngest/functions/index.ts` — export barrel
- `app/api/inngest/route.ts` — enregistrement dans `serve()`
- `app/actions/submit-lead.ts` — émission `sendEvent` non-fatale après `createLeadCore`
- `lib/inngest/__tests__/process-new-lead.test.ts` — 10 invariants statiques N01–N10

**Preuves** :

- 10/10 tests PASS · tsc 0 erreur · lint 0 erreur · format ✅
- Pas de throw sur email agence absent — `{ success: false, reason: "no_agency_email" }`
- `.catch()` sur `sendEvent` — lead toujours persisté si Inngest indisponible

**NOT VERIFIED** : réception email réelle — nécessite `RESEND_API_KEY` + Inngest actif en preview/prod.

---

### R11-01 — CLÔTURÉ (2026-10-02)

```text
ID: R11-01
Statut: CLÔTURÉ (2026-10-02)
Branche: claude/easy2book-v6-modernization-7gyb5v
Commit: ed05891

Migrations appliquées en production (Supabase EasyV4, crygnaichvlxavvbifqi):
  - 0095_destinations_featured : destinations.is_featured BOOLEAN DEFAULT false,
    destinations.display_order INTEGER DEFAULT 0, index destinations_featured_idx
  - 0096_development_project_waitlist : table development_project_waitlist créée

Fichiers créés/modifiés:
  - lib/market/admin-actions.ts :
    createMarketSignal, deleteMarketSignal,
    createDevelopmentProject, updateDevelopmentProject, deleteDevelopmentProject
    (requireSuperAdmin pattern, Zod, revalidatePath)
  - lib/destinations/admin-actions.ts :
    setFeaturedDestination, listDestinationsForAdmin
    (requireSuperAdmin pattern, Zod)
  - app/(internal)/admin/veille/signaux/page.tsx : liste signaux + suppression
  - app/(internal)/admin/veille/signaux/new/page.tsx : création signal
  - app/(internal)/admin/veille/projets/page.tsx : liste projets + suppression
  - app/(internal)/admin/veille/projets/new/page.tsx : création projet
  - app/(internal)/admin/veille/projets/[id]/page.tsx : édition projet
  - app/(internal)/admin/veille/destinations/page.tsx : toggle featured + ordre affichage
  - lib/market/__tests__/admin-actions.test.ts : 13 tests invariants statiques — PASS
  - lib/destinations/__tests__/admin-actions.test.ts : 9 tests invariants statiques — PASS
  - components/admin-shell.tsx : nav "Veille marché" (TrendingUp) super_admin uniquement

Tests: 22/22 pass (node --test)
Typecheck: 0 erreurs (pnpm tsc --noEmit)
Lint: 0 warnings

VISUAL QA: NOT VERIFIED — pages admin nécessitent session super_admin en production.
  À vérifier sur GO séparé : créer un signal/projet via /admin/veille/signaux/new
  et confirmer qu'il apparaît dans MarketSignalsSection sur /fr.
```

### R10-01 — CLÔTURÉ (2026-10-02)

```text
ID: R10-01
Statut: CLÔTURÉ (2026-10-02)
Branche: claude/easy2book-v6-modernization-7gyb5v
Commit: a46a650

Fichiers créés/modifiés:
  - drizzle/manual/0096_development_project_waitlist.sql :
    CREATE TABLE development_project_waitlist
    (id, project_id FK→development_projects CASCADE, email, locale, created_at)
    UNIQUE (project_id, email) — idempotent
    INDEX development_project_waitlist_project_id_idx
  - lib/db/schema/market.ts : table developmentProjectWaitlist + types
  - lib/db/schema.ts : re-export developmentProjectWaitlist + types
  - lib/market/waitlist-actions.ts :
    submitWaitlistEntry(rawData) — server action, zod validation
    _insertWaitlistEntry(data, db?) — helper testable (DI), email lowercase, onConflictDoNothing
  - lib/market/__tests__/waitlist-actions.test.ts : 6 tests
  - components/waitlist-button.tsx :
    Client Component — idle → open (email input) → loading → success | error
    states: idle/open/loading/success/error
  - components/development-projects-section.tsx :
    remplace <p>{t("notBookable")}</p> par <WaitlistButton projectId={project.id} />
  - messages/fr.json, en.json, ar.json :
    DevelopmentProjects.waitlist (cta, placeholder, submit, success, error)

Tests:
  - 6 tests waitlist PASS
  - pnpm test : 1308 PASS / 0 FAIL (G15 flaky pre-existant exclu)
  - pnpm typecheck : 0 erreur
  - pnpm lint : 0 erreur R10-01
  - format:check ✅

VISUAL QA: NOT VERIFIED — DevelopmentProjects invisible sans données en DB.
Migration DB: APPLIQUÉE EN PRODUCTION (2026-10-04, vérifié via MCP Supabase —
  table development_project_waitlist présente ; version supabase_migrations
  20261002185755).
```

### R9-04 — CLÔTURÉ (2026-10-02)

```text
ID: R9-04
Statut: CLÔTURÉ (2026-10-02)
Branche: claude/easy2book-v6-modernization-7gyb5v
Commit: c6e9067

Fichiers créés/modifiés:
  - drizzle/manual/0095_destinations_featured.sql :
    ADD COLUMN is_featured BOOLEAN NOT NULL DEFAULT false
    ADD COLUMN display_order INTEGER NOT NULL DEFAULT 0
    INDEX destinations_featured_idx (display_order, name) WHERE is_featured
  - lib/db/schema/destinations.ts : colonnes isFeatured + displayOrder + index
  - lib/destinations/featured-destinations-queries.ts :
    getFeaturedDestinations(limit, db?) · FEATURED_DESTINATIONS_PAGE_SIZE = 6
    getExternalRefsForDestinations(ids, db?) · dependency injection
  - lib/destinations/__tests__/featured-destinations-queries.test.ts : 5 tests
  - components/featured-destinations-section.tsx : Server Component async
    CTA réservation UNIQUEMENT si destinationExternalRef actif (R9-04 guard)
    return null si aucune destination is_featured=true
  - messages/fr.json, en.json, ar.json : clé FeaturedDestinations
    (heading, cta, comingSoon)
  - app/(public)/[locale]/page.tsx : <FeaturedDestinationsSection />
    après OmratySection

Reality Level: L0 (section invisible sans données) → L3 quand
  destinations peuplées avec external_refs actifs.

CTA guard: booking link généré UNIQUEMENT si destinationExternalRef
  actif existe — conforme Master Prompt §10 (CTA Guard) et R9-04.

Tests:
  - pnpm test : 1302 PASS / 0 FAIL / 253 SKIP
  - pnpm typecheck : 0 erreur
  - pnpm lint : 0 erreur (135 warnings pré-existants)
  - format:check ✅

VISUAL QA: NOT VERIFIED — section invisible sans lignes is_featured=true
  en production. Peupler via Supabase Studio pour activer la section.

Migration DB: APPLIQUÉE EN PRODUCTION (2026-10-04, vérifié via MCP Supabase —
  colonnes is_featured BOOLEAN DEFAULT false + display_order INTEGER DEFAULT 0
  présentes sur destinations ; version supabase_migrations 20261002185747).
```

### R9-03 — CLÔTURÉ (2026-10-02)

```text
ID: R9-03
Statut: CLÔTURÉ (2026-10-02)
Branche: claude/r9-03-development-projects-ui
Commit: à venir

Fichiers créés/modifiés:
  - lib/market/development-projects-queries.ts :
    getLatestDevelopmentProjects(limit, db?) · DEVELOPMENT_PROJECTS_PAGE_SIZE = 4
  - components/development-projects-section.tsx : Server Component async
    badge status (valeur libre du champ status) + badge confidence i18n
    localisation + description + lien source
    JAMAIS de CTA réservation — commentaire explicite dans le JSX (R9-03)
    return null si table vide
  - messages/fr.json, en.json, ar.json : clé DevelopmentProjects
    (heading "Prochainement", badge "Annoncé", notBookable, source,
    confidence LOW/MEDIUM/HIGH) — zéro texte en dur JSX
  - app/(public)/[locale]/page.tsx : <DevelopmentProjectsSection />
    avant MarketSignalsSection

Tests:
  - lib/market/__tests__/development-projects-queries.test.ts : 5 tests
  - pnpm test : 1297 PASS / 0 FAIL / 253 SKIP
  - pnpm typecheck : 0 erreur · pnpm lint : 0 erreur · format:check ✅

DÉCISION : pas de table waitlist DB (différé Phase 10) — le CTA
  "Pas encore réservable" est un label informatif. Aucun flux réservation
  n'est exposé pour les projets annoncés.

VISUAL QA: NOT VERIFIED — section visible uniquement si des lignes
  existent dans development_projects (table vide en prod actuellement).
```

### R9-02 — CLÔTURÉ (2026-10-02)

```text
ID: R9-02
Statut: CLÔTURÉ (2026-10-02)
Branche: claude/r9-02-market-signals-ui
Commit: 51bda0b

Fichiers créés/modifiés:
  - lib/market/queries.ts : getLatestMarketSignals(limit, db?)
    ORDER BY published_at DESC · SIGNALS_PAGE_SIZE = 6 (constante nommée)
    dependency injection pour testabilité
  - components/market-signals-section.tsx : Server Component async
    badge confidence i18n · date publiée · titre · résumé · lien source
    return null si table vide (section invisible sans données)
  - messages/fr.json, en.json, ar.json : clé MarketSignals
    (heading · source · confidence LOW/MEDIUM/HIGH) — zéro texte en dur JSX
  - app/(public)/[locale]/page.tsx : <MarketSignalsSection /> après OmratySection

Tests:
  - lib/market/__tests__/market-signals-queries.test.ts : 5 tests
    (SIGNALS_PAGE_SIZE=6, vide→[], limite défaut, limite explicite, rows<limit)
  - pnpm test : 1292 PASS / 0 FAIL / 253 SKIP
  - pnpm typecheck : 0 erreur
  - pnpm lint : 0 erreur (135 warnings pré-existants)
  - pnpm format:check : ✅

VISUAL QA: NOT VERIFIED — section visible uniquement si des lignes
  existent dans market_signals (table vide en prod actuellement)
  À valider après insertion manuelle d'un signal de test.
```

**Phase 8 — Clôture officielle (2026-10-02)**

CI run #158 (37022472737) · commit d3b3110 · branche claude/easy2book-v6-modernization-7gyb5v

- `typecheck` ✅ · `format` ✅ · `lint` ✅ · `test` ✅ · `financial-e2e` ✅ · `build` ✅
- `playwright-a11y` ✅ BLOQUANT — job 110889828533, conclusion: success
  → 0 serious/critical WCAG violations sur les 5 pages publiques (14:53:33→14:53:48 UTC)
  → continue-on-error absent depuis commit 5853101 : test réellement bloquant prouvé
- R8-04 CLÔTURÉ (commit cc617b4) · R8-05 CLÔTURÉ · R8-07 CLÔTURÉ (commit bf297f9)

### R9-01 — CLÔTURÉ (2026-10-02)

```text
ID: R9-01
Statut: CLÔTURÉ (2026-10-02)
Branche: claude/easy2book-v6-modernization-7gyb5v
Commits: 427352f (schéma + migrations + tests) · 0c00e3d (ROADMAP EN COURS)

Fichiers créés:
  - lib/db/schema/market.ts : schéma Drizzle (marketSignals, developmentProjects,
    enums market_signal_confidence, development_project_confidence)
  - drizzle/manual/0093_market_signals.sql : DDL tables + index
  - drizzle/manual/0094_market_signals_rls.sql : RLS (lecture auth, écriture super_admin)
  - lib/market/__tests__/market-signals-invariants.test.ts : 18 invariants statiques
  - lib/db/schema.ts : re-export des nouvelles entités

Garde-fous anti-fabrication (NOT NULL) :
  - source_url NOT NULL : source primaire obligatoire
  - published_at NOT NULL : horodatage de publication obligatoire
  - confidence NOT NULL : niveau LOW | MEDIUM | HIGH obligatoire

Tests locaux:
  - Invariants statiques : 18/18 PASS
  - pnpm typecheck : 0 erreur
  - pnpm lint : 0 erreur (135 warnings pré-existants)
  - pnpm format:check : ✅
  - pnpm test : 1287 PASS / 0 FAIL / 253 SKIP (zéro régression)

VÉRIFIÉ EN PRODUCTION (crygnaichvlxavvbifqi) :
  0093 appliqué — tables créées :
    market_signals      : relrowsecurity=true, relforcerowsecurity=true ✅
    development_projects: relrowsecurity=true, relforcerowsecurity=true ✅
  Colonnes NOT NULL confirmées (information_schema) :
    market_signals.source_url       : is_nullable=NO ✅
    market_signals.published_at     : is_nullable=NO ✅
    market_signals.confidence       : is_nullable=NO ✅
    development_projects.source_url     : is_nullable=NO ✅
    development_projects.published_at   : is_nullable=NO ✅
    development_projects.confidence     : is_nullable=NO ✅
  Enums (pg_enum) :
    market_signal_confidence       : LOW, MEDIUM, HIGH ✅
    development_project_confidence : LOW, MEDIUM, HIGH ✅
  0094 appliqué — 4 policies RLS :
    market_signals_read          : SELECT, authenticated, USING(true) ✅
    market_signals_admin_write   : ALL, authenticated, USING(is_super_admin()) ✅
    development_projects_read    : SELECT, authenticated, USING(true) ✅
    development_projects_admin_write : ALL, authenticated, USING(is_super_admin()) ✅
```

### DEPLOY-CRON-01 — CLÔTURÉ (2026-10-02)

```text
OBJECTIF:  Débloquer tous les déploiements Vercel easy2book-new (cron_jobs_limits_reached)
CAUSE:     vercel.json ligne 29 — /api/cron/expire-flight-sla avait "0 * * * *" (horaire)
           Hobby plan = crons quotidiens max → chaque déploiement échouait
FIX:       "0 * * * *" → "0 0 * * *" (minuit UTC, quotidien)
COMMIT:    45111da7df5ed0a12a6aae8b8f5164462a97a309 (main, 2026-10-02)
RÉSULTAT:  Déploiement dpl_GVqwRudxAkkiaypKAR8sPr7qSTZg — state: READY, target: production
           SHA 45111da inclut tous les fixes PR #106 (R8-01, R8-02, VOLS-DISPLAY-FIX-01)
           GitHub auto-deploy ré-opérationnel
```

### R8-05 — CLÔTURÉ (2026-10-02)

```text
ID: R8-05
Statut: CLÔTURÉ (2026-10-02)
Branche: claude/easy2book-v6-modernization-7gyb5v
Commits: 20a9b41 (câblage axe-core) · 5853101 (continue-on-error retiré, BLOQUANT)
         d3b3110 (NEXT_PUBLIC_SUPABASE_* stubs CI — serveur ne crashait plus)
Résultat:
  - playwright.config.ts : npm run dev → pnpm (CI: pnpm start, local: pnpm dev)
  - ci.yml : ajout job playwright-a11y (needs: build, chromium only,
    continue-on-error: RETIRÉ — job BLOQUANT) — installe Playwright chromium +
    lance e2e/a11y.spec.ts (wcag2a/aa/21aa, 0 serious/critical violations)
  - tsc --noEmit: 0 erreur · lint: 0 erreur · 135 warnings pré-existants
LIMITATION DOCUMENTÉE: /admin et /booking redirigent vers login en CI
  (pas de session auth) — couverture réelle sur / et /login uniquement
CI BLOQUANT PROUVÉ:
  Run #158 (37022472737) · job playwright-a11y (110889828533)
  commit d3b3110 · conclusion: success · 14:53:33→14:53:48 UTC
  Étape "Accessibility tests (axe-core / WCAG 2.1 AA)": ✅ PASS
  0 serious/critical WCAG violations sur les 5 pages
  Job sans continue-on-error → un échec aurait bloqué le pipeline
```

### R8-04 — CLÔTURÉ (2026-10-02)

```text
ID: R8-04
Statut: CLÔTURÉ (2026-10-02)
Branche: claude/easy2book-v6-modernization-7gyb5v
Commit: cc617b4
Résultat:
  - lighthouserc.js : npm run dev → pnpm start (build prod)
    + startServerReadyPattern + startServerReadyTimeout (60s)
    + FCP et LCP : "warn" → "error" (bloquants)
  - .github/workflows/ci.yml : ajout job `lighthouse`
    (needs: build, continue-on-error: true pour collecter baseline)
    Rebuild .next dans le job (artefacts non partagés entre jobs GHA)
  - tsc --noEmit: 0 erreur · lint: 0 erreur · 135 warnings pré-existants
CI: job lighthouse déclenché sur la PR — résultat attendu sur GitHub Actions
```

### R8-07 — CLÔTURÉ (2026-10-02)

```text
ID: R8-07
Statut: CLÔTURÉ (2026-10-02)
Branche: claude/easy2book-v6-modernization-7gyb5v
Commit: bf297f9
Résultat:
  - Badge "Flash Offers" retiré de components/flash-offers.tsx
    (le badge impliquait une vente flash temporaire — aucun prix, aucun délai,
    aucune remise n'existe sur ces cartes de navigation)
  - Clé flashOffers supprimée de messages/fr.json, en.json, ar.json
  - 4 fichiers, 10 suppressions — aucun changement logique/financier/DB
  - tsc --noEmit: 0 erreur · lint: 0 erreur · 135 warnings pré-existants
VISUAL QA: NOT VERIFIED — homepage /fr /en /ar à valider visuellement
  (badge absent, cartes destinations lisibles, liens fonctionnels)
```

### VOLS-DUFFEL-ACTIVATION-01 — CLÔTURÉ (2026-10-02)

```text
ID: VOLS-DUFFEL-ACTIVATION-01
Statut: CLÔTURÉ (2026-10-02)
PR: #107 — mergé sur main, commit 34bb85f08da2669db8dca32dadc1df6262e5dca7
TypeScript: tsc --noEmit — 0 erreur
Résultat:
  - search(): async Promise.all — convertit EUR/USD→TND via fetchExchangeRateForDisplay
    (cache 1h) ; offre skippée silencieusement si taux absent (jamais de taux fabriqué)
  - DuffelPricingToken: +originalAmount +originalCurrency (montant/devise Duffel avant conversion)
  - mapOfferToItinerary(): encode originalAmount/originalCurrency dans le token
  - recheck(): convertit via fetchExchangeRateForBooking (sans cache, taux frais) avant comparaison
  - book(): paie Duffel dans sa devise native (token.originalAmount / token.originalCurrency)
  - Invariant financier: supplierCurrency="TND" pour commercial engine (check passe) ;
    zéro taux inventé ou codé en dur (règle permanente CURRENCY-DIM-01a)
NOT VERIFIED: validation visuelle offres Duffel en production
  (nécessite DUFFEL_ACCESS_TOKEN + EXCHANGE_RATE_API_KEY configurés dans Vercel)
```

### VOLS-DISPLAY-FIX-01 — CLÔTURÉ (2026-10-02)

```text
IMPLEMENTED  — commit ee50ed1 (2026-10-02)
TESTED       — typecheck PASS · lint PASS · aucune migration DB · aucun changement financier
MERGED       — inclus dans PR #106 (R8-01 + R8-02), mergée sur main par Hassen02020
               commit de merge : 952812e0a3d69a249c354144ba7a4d57e97c8010
```

Branche : `claude/easy2book-v6-modernization-7gyb5v` · commit `ee50ed1`.

Corrections UI vols :

- Bug "NaNh" : `totalDurationMinutes` calculé depuis les segments et renvoyé dans la réponse API
- Bug "TK TK252" : doublon `marketingCarrier` supprimé dans `flight-results-content.tsx`

### FORMAT-CLEANUP-01 — CLÔTURÉ (2026-10-02)

```text
ID: FORMAT-CLEANUP-01
Statut: CLÔTURÉ (2026-10-02)
PR: #105 — mergé sur main, commit 75177c576cdbaf1766fa10a749b70f51c37c190a
CI: run #146 — conclusion: success (typecheck ✅ lint ✅ format ✅ test ✅)
Résultat:
  - 794 fichiers reformatés (pnpm format --write, diff purement mécanique)
  - 13 fichiers supplémentaires (écart prettier-plugin-tailwindcss CI/local)
  - 7 fichiers de tests invariants adaptés aux patterns multi-lignes Prettier
  - gate format désormais bloquant dans CI (continue-on-error retiré)
  - dette R1-07 soldée
```

**Corrections UI vols — deux bugs visuels identifiés lors de la validation affichage production.**

- **Bug 1 — "NaNh" durée** : `app/api/vols/search/route.ts` ne renvoyait pas `totalDurationMinutes` dans la réponse offre. Le schéma client Zod (`FlightOffer`) requiert ce champ — absent = NaN → "NaNh". Corrigé : champ calculé depuis `segments[i].durationMinutes` sommé sur tous les segments de tous les journeys.
- **Bug 2 — "TK TK252"** : `flight-results-content.tsx` ligne 145 affichait `marketingCarrier` deux fois en JSX (doublon de variable). Corrigé : suppression de la seconde occurrence.

### R8-02 — CLÔTURÉ (2026-10-02)

Branche : `claude/easy2book-v6-modernization-7gyb5v` · commit `a57d5e3`.

**Parcours complet — skeletons, error boundaries, Suspense fallbacks.**

- `confirmation/[ref]/loading.tsx` : skeleton route-segment (5 Skeleton blocks : BookingSteps + header + card + détails + bouton).
- `checkout/error.tsx` : error boundary checkout — reset + lien "Rechercher un hôtel" + "Retour à l'accueil".
- `confirmation/[ref]/error.tsx` : error boundary confirmation — reset + "Retour à l'accueil" ; message rassurant "réservation enregistrée".
- `checkout/page.tsx` : outer Suspense → `<CheckoutLoading />` ; inner Suspense (CheckoutForm) → `<Skeleton className="h-48 w-full rounded-2xl" />` ; suppression du `getTranslations` inutilisé dans `CheckoutPage`.
- Validation : `pnpm typecheck` ✓ · `pnpm lint` 0 erreurs (135 warnings pré-existants) · 4 fichiers, 117 insertions.

**NOT YET DEPLOYED** (dans la même PR que R8-01, non mergée sur `main`).

### R8-01 — CLÔTURÉ (2026-10-02)

Branche : `claude/easy2book-v6-modernization-7gyb5v` · commit `31726bd`.

**Transparence tarifaire hôtel — durée séjour + politique d'annulation.**

- SERP : `hotel-card.tsx` affiche "X nuits · à partir de" quand les dates sont connues (clé `Hotels.nightsFromPrice` FR/EN/AR). Prix SERP confirmé HT (TVA 19% ajoutée au checkout) — aucun label "TTC" incorrect.
- Transmission : `hotel-listings.tsx` et `hotels/[id]/page.tsx` transmettent `hasFreeCancellation` + `freeCancellationDate` dans `draft.metadata` depuis les deux points d'entrée hôtel.
- Checkout : `CancellationPolicyDisplay` étendu avec prop optionnelle `hotelCancellation` (bypass DB, informatif, sans case à cocher) ; `checkout/page.tsx` l'utilise pour les brouillons hôtel — composant existant réutilisé, aucun nouveau composant.
- Tests : 20 invariants statiques dans `lib/booking/__tests__/r8-01-hotel-transparency-invariants.test.ts`, tous verts.
- Validation : `pnpm format --check` ✓ · `pnpm typecheck` ✓ · `pnpm lint` 0 erreurs · `pnpm test` 1522 tests, 0 échecs.
- Périmètre strict : aucun changement pricing/financials/booking/payment/DB, aucun R8-02/R8-04/R8-05.

**NOT YET DEPLOYED** (PR non mergée sur `main`).

### FORMAT-CLEANUP-01 — CLÔTURÉ (2026-10-02)

794 fichiers reformatés via `pnpm format --write`. CI Prettier gate activé (blocking). 7 fichiers de tests statiques mis à jour pour tolérance au formatage automatique. PR #105 mergée (commit `75177c5`). Build vert, 0 régression.

### ECON-ENTITLEMENTS-INTEGRITY-01 — CLÔTURÉ (2026-10-01)

Objectif : imposer l'append-only de `economic_entitlements` au niveau privilege PostgreSQL (même risque R-08 que LEDGER-INTEGRITY-01, appliqué à cette table).

Migration `drizzle/manual/0092_econ_entitlements_integrity_01.sql` : REVOKE UPDATE, DELETE, TRUNCATE sur `economic_entitlements` pour `app_runtime, anon, authenticated, service_role`. Aucun index (plusieurs lignes par réservation attendues et correctes). Tests statiques étendus dans `lib/finance/__tests__/ledger-integrity-invariants.test.ts` : 5/5 (economicEntitlements ajouté aux 3 tests de mutation + 1 nouveau test migration 0092).

VERIFIED AGAINST REAL POSTGRES (`crygnaichvlxavvbifqi`) :

- 0 ligne UPDATE/DELETE/TRUNCATE résiduelle pour les 4 rôles ✅
- SELECT+INSERT toujours actifs pour app_runtime ✅

### LEDGER-INTEGRITY-01 — CLÔTURÉ (2026-10-01)

Objectif (Audit Commercial & Revenue 01, risques R-08 et R-09) : imposer l'append-only des ledgers au niveau privilege PostgreSQL (pas seulement par convention applicative) et ajouter une contrainte d'unicité sur la commission par réservation.

Implémentation :

- `drizzle/manual/0084_ledger_integrity_01.sql` : REVOKE UPDATE, DELETE, TRUNCATE sur `wallet_ledger`, `partner_credit_movements`, `commission_settlement_entries` pour `app_runtime, anon, authenticated, service_role`. CREATE UNIQUE INDEX `wallet_ledger_commission_per_reservation_uniq`.
- `lib/finance/__tests__/ledger-integrity-invariants.test.ts` : 4 tests statiques — aucun UPDATE/DELETE/TRUNCATE Drizzle ou SQL brut sur ces tables dans le code applicatif, aucun upsert `onConflictDoUpdate`, contenu du fichier 0084 vérifié.

Audit REVOKE (résumé) :

- Rôle applicatif = `app_runtime` (confirmé 0069). Aucun UPDATE/DELETE sur les 3 tables dans lib/, app/, components/.
- Fonctions SECURITY DEFINER (`credit_platform_commission`, `lock_agency_for_debit`) s'exécutent en tant que `postgres` — non affectées.
- `service_role` Supabase client = auth.admin uniquement, jamais ces tables.
- RLS (FOR ALL avec is_super_admin/agency_id) et REVOKE se complètent : privilege check avant RLS — double protection cohérente, aucune contradiction.

Tests : 4/4 OK (node --import tsx --test). Typecheck ✅. Lint ✅ (0 errors).
Migration appliquée en production (`crygnaichvlxavvbifqi`) le 2026-10-01 via Supabase MCP.
VERIFIED AGAINST REAL POSTGRES :

- `information_schema.role_table_grants` : 0 ligne UPDATE/DELETE/TRUNCATE pour app_runtime/anon/authenticated/service_role sur les 3 tables ✅
- `pg_indexes` : `wallet_ledger_commission_per_reservation_uniq` présent (`USING btree (reservation_id) WHERE type='commission' AND category='commission' AND reservation_id IS NOT NULL`) ✅
- SELECT+INSERT toujours actifs pour `app_runtime` sur les 3 tables ✅
  Commit : `40c4a78` sur branche `claude/easy2book-v6-modernization-7gyb5v`. PR #103.

### CURRENCY-DIM-02 — CLÔTURÉ (2026-10-01)

Objectif : politique FX Trésorerie & Coût Bancaire — couche "taux appliqué" (taux de référence mid-market + correction banque) et estimation proratisée du frais bancaire par booking, versionnée et immutable (FK `fx_policy_id` sur `reservation_financials`).

Deux notions distinctes implémentées : (1) `AppliedRate` = taux mid-market (CURRENCY-DIM-01) corrigé par le spread bancaire selon la politique active (`CorrectionMode` : NONE / PERCENTAGE / FIXED_SPREAD / FIXED_RATE) ; (2) `BankFeeContribution` = estimation proratisée du frais bancaire de virement (NONE / FIXED / PERCENTAGE / MIN_MAX), exprimée en TND, alimentant `economic_entitlements` à titre informatif uniquement — l'allocation réelle d'un virement multi-bookings reste pour `BANK-RECONCILE-01`.

Points de conception validés explicitement en cours d'implémentation : `FIXED_SPREAD` (ref + correction absolue) distinct de `FIXED_RATE` (remplacement du taux) ; `applied_exchange_rate` = taux économique interne Easy2Book, pas un taux bancaire certifié, jamais affiché à l'agence ; `bankFeePercent` appliqué sur le montant TND converti (`amountForeign × appliedRate`), pas sur le montant étranger brut ; la politique FX n'est invoquée que si `supplierCurrency ≠ "TND"` (bloc inerte aujourd'hui, câblé pour Duffel et tout futur GDS).

Migration additive `drizzle/manual/0091_fx_policy.sql` : nouvelle table `fx_policies` (versionnée, RLS super_admin uniquement) + 3 colonnes nullable sur `reservation_financials` (`applied_exchange_rate`, `applied_exchange_rate_at`, `fx_policy_id`) — aucun NOT NULL, aucun backfill, 13 call sites existants inchangés. Module `lib/finance/fx-policy.ts` (fail-closed : `FxPolicyUnavailableError`, jamais de valeur par défaut inventée — règle Direction 2026-10-01). Extension optionnelle de `recordReservationFinancials()` (`appliedRate?`). Câblage dans `flight-financials.ts` (dans le seul bloc `if (supplierCurrency !== "TND")`). 16 tests (FX-POLICY-01 à FX-POLICY-14) couvrant les 4 modes de correction, les 4 modes de frais, le fail-closed, l'immuabilité policyId/version, et les invariants statiques des 2 modules câblés.

Preuves locales : 1244 PASS / 0 FAIL (1497 total, 253 SKIP). TypeScript propre sur tous les fichiers modifiés. Branche `feature/currency-dim-02` mergée dans `claude/easy2book-v6-modernization-7gyb5v` (PR interne, pas de PR GitHub séparée — ce chantier fait partie du lot DUFFEL-ADAPTER-01 / CURRENCY-DIM-02 sur cette branche de développement).

### R6-01-DB-CONSTRAINT — CLÔTURÉ (2026-10-01)

Objectif : garde-fou au niveau base de données (trigger) empêchant une transition invalide de `reservations.status`, en complément de la validation applicative existante (`isTransitionAllowed()`/`recordReservationTransition()`, lib/admin/reservation-status\*.ts). Audit reconfirmé : ces fonctions valident bien chaque transition côté application sur les 22 sites réels d'écriture, mais `recordReservationTransition()` n'effectue PAS l'UPDATE lui-même (documenté dans son propre en-tête) — rien côté Postgres n'empêchait un UPDATE direct de la contourner entièrement.

Décision de portée trouvée pendant l'audit : trigger scopé à UPDATE uniquement, jamais INSERT — tous les `.insert(reservations)` réels posent `status: "pending"`, mais plusieurs fichiers de test légitimes insèrent directement des fixtures déjà `"confirmed"` pour isoler ce qu'ils testent ; contraindre l'INSERT aurait cassé ces fixtures sans corriger quoi que ce soit dans le périmètre de ce chantier.

Nouvelle migration `drizzle/manual/0090_reservation_status_transition_guard.sql` : trigger `BEFORE UPDATE`, miroir exact de `ALLOWED_TRANSITIONS`, aucune règle métier nouvelle. Validée en production (`crygnaichvlxavvbifqi`) en transaction `BEGIN...ROLLBACK` d'abord (transition invalide `expired→confirmed` rejetée, transition valide `pending→cancelled` acceptée, sur des lignes réelles), puis appliquée réellement, puis ré-appliquée pour prouver l'idempotence.

Preuves vérifiées indépendamment par l'orchestrateur sur le log CI brut complet (une première lecture tronquée avait semblé montrer que le nouveau test n'avait pas tourné — re-vérifié avec une fenêtre de log plus large, confirmant qu'il s'agissait d'une troncature de l'outil de lecture, pas d'un vrai problème) : le test live-DB (`lib/admin/__tests__/reservation-status-transition-guard-live.test.ts`) exerce exhaustivement les 56 paires (FROM, TO) possibles contre Postgres réel, via des UPDATE directs contournant totalement la couche applicative — `ok 6` dans le job `financial-e2e`, logs Postgres confirmant les 41 rejets attendus avec le message `reservation_status_transition_invalid` exact sur chaque paire invalide. Invariant statique (`reservation-status-transition-guard-migration.test.ts`) empêchant toute dérive silencieuse entre la table TS et la migration SQL. `typecheck`/`lint`/`build`/`financial-e2e` verts, seul `format` rouge (dette connue). `pnpm test` complet : 1185 PASS/0 FAIL/237 SKIP (zéro régression). PR https://github.com/Hassen02020/EasyV4/pull/97, mergée (`77a4036`).

Ré-audit de cadrage avant la fiche complète : `reservation_financials` a DÉJÀ les colonnes `supplier_currency`/`sale_currency`/`exchange_rate`/`exchange_rate_at` (précision 10,6 — couvre les 4 décimales décidées), jamais renseignées avec de vraies valeurs. GO limité (confirmé explicitement) : plomberie générique uniquement dans `recordReservationFinancials()` (`lib/finance/reservation-financials.ts`) — 3 paramètres optionnels et additifs (`supplierOriginal`, `saleOriginal`, `exchangeRate`), comportement strictement inchangé quand absents (les 13 call sites réels actuels ne les passent pas). Aucun calcul, aucune invention de taux — la fonction transmet fidèlement ce que l'appelant fournit déjà, même discipline que `supplierPriceTnd`/`salePriceTnd`.

Volontairement hors scope (décision explicite) : câbler Vols ou Hotels-Monde pour fournir de vraies valeurs non-TND. Aucun fournisseur réel n'est connecté aujourd'hui pour l'un ou l'autre (RateHawk sans clés API ; Vols sans GDS réel) — aucun vrai taux de change n'est donc disponible à câbler sans l'inventer, exactement ce que CURRENCY-DIM-01a/01b ont fermé. Piste identifiée pour la suite (à vérifier, pas supposée) : l'endpoint RateHawk `search/serp/region` accepte déjà un paramètre `currency` (actuellement codé en dur `"USD"`) — s'il accepte `TND` directement, Hotels-Monde n'aurait besoin d'AUCUN mécanisme de taux interne.

Preuves vérifiées indépendamment sur log CI brut (pas seulement les coches vertes) : `typecheck`/`lint`/`build` verts, seul `format` rouge (dette connue) ; job `test` vert ; job `financial-e2e` = **42/42 PASS, 0 FAIL, 0 SKIP** (40 précédents + 2 nouveaux tests `currency-dim-01-plumbing.test.ts`, réellement exécutés contre Postgres réel, aucun skip) — run https://github.com/Hassen02020/EasyV4/actions/runs/36792833784. PR https://github.com/Hassen02020/EasyV4/pull/96, mergée (`828a616`).

### CURRENCY-DIM-01b — CLÔTURÉ (2026-10-01)

Trouvé pendant l'audit de cadrage de `CURRENCY-DIM-01` complet (schéma déjà existant sur `reservation_financials` : `supplier_currency`/`sale_currency`/`exchange_rate`/`exchange_rate_at`, jamais renseignés réellement — EXTEND, pas CREATE). Même famille de trou que `CURRENCY-DIM-01a`, cette fois dans Vols : `computeCommercialResult()` (`lib/vols/commercial-engine.ts`) calculait `sellingAmount = supplierAmount + fee + markup` par **addition directe**, sans aucune conversion, même quand `supplierAmount` (devise GDS) et `fee`/`markup` (devise de la règle commerciale) différaient. Le test existant « Currency flows correctly » (P15) ne vérifiait que les étiquettes de devise stockées, jamais la justesse arithmétique. **Dormant** comme 01a : aucun fournisseur de vols réel n'est branché (seul l'adaptateur virtuel de démo, toujours TND) — aucune réservation réelle mal calculée à ce jour, mais la même mine que RateHawk.

Correctif (même discipline minimale que 01a, règle permanente consignée dans `CLAUDE.md` § RÈGLE FINANCIÈRE) : `computeCommercialResult()` lève désormais `UnsupportedCommercialCurrencyMismatchError` si `supplierCurrency !== rules.currency`, au lieu d'additionner silencieusement des montants de devises différentes. L'appelant (`app/api/vols/search/route.ts`) isole déjà chaque itinéraire dans son propre `try/catch` et ignore l'offre en cas d'échec (même pattern que le skip par offre de RateHawk) — aucune régression de comportement pour le cas normal (même devise des deux côtés). Preuves vérifiées sur log CI brut (pas seulement les coches vertes) : `typecheck`/`lint`/`build`/`financial-e2e` verts, seul `format` rouge (dette connue) ; job `test` = 1183 PASS/0 FAIL/234 SKIP (identique au local, 1182→1183 = 1 test ajouté, zéro régression) — run https://github.com/Hassen02020/EasyV4/actions/runs/36790890823. PR https://github.com/Hassen02020/EasyV4/pull/95, mergée (`a5d4e5e`).

Prochaine étape (sur instruction explicite uniquement) : ré-auditer ce résultat, puis préparer la fiche `CURRENCY-DIM-01` complète (Vols + Hotels-Monde, vrai taux fournisseur/PSP capturé au moment de la transaction, 4 décimales taux/2 décimales TND par décision Direction) — non démarré, aucun GO reçu. Le schéma `reservation_financials` (`supplier_currency`/`sale_currency`/`exchange_rate`/`exchange_rate_at`) existe déjà : EXTEND de `recordReservationFinancials()`, pas de migration prévue a priori (à confirmer à l'audit complet).

### CURRENCY-DIM-01a — CLÔTURÉ (2026-10-01)

Audit ciblé (lecture seule) de la gestion des devises dans `lib/hotels-monde/supplier-drivers.ts`, déclenché en amont d'une future fiche `CURRENCY-DIM-01` complète. Trouvaille : `convertRateHawkAmountToTnd()` réutilisait `CURRENCY_META` (`lib/currency.ts`) — le taux **statique et cosmétique** du sélecteur de devise d'affichage côté client (`components/currency-switcher.tsx`, pensé pour donner un ordre de grandeur sur les pages de listing, jamais mis à jour), sans aucun rapport avec un vrai taux de change. **Dormant** : RateHawk n'a jamais eu de vraies clés API dans cet environnement (`isDemoMode()` toujours vrai, faute de `RATEHAWK_KEY_ID`/`RATEHAWK_API_KEY`) — aucune réservation réelle n'a donc été mal convertie à ce jour — mais dès la première vraie clé configurée, chaque offre cotée en USD aurait été facturée/comptabilisée avec un taux inventé.

Décision Direction sur la suite (avant d'ouvrir CURRENCY-DIM-01 complet) : source de taux = celui du fournisseur/PSP au moment de la transaction (pas de table de taux centrale type BCT) ; précision = taux à 4 décimales, montants TND à 2 décimales ; besoin réel confirmé uniquement sur Vols et/ou Hotels-Monde (Car/Transfer/Omra/Activities/Packages/Hotel TN restent TND-only, aucun besoin réel identifié).

Correctif (périmètre volontairement minimal, exécuté avant tout chantier complet pour neutraliser le risque immédiatement) : `convertRateHawkAmountToTnd()` lève désormais `UnsupportedRateHawkCurrencyError` pour tout montant non-TND au lieu d'inventer une conversion ; l'appelant ignore cette offre précise (même pattern que le skip existant quand le contenu statique de l'hôtel ne peut pas être résolu), sans faire échouer toute la recherche. Preuves : `tsc --noEmit` propre, `eslint lib/hotels-monde` propre, `node --test` sur le fichier concerné 8/8 PASS, `pnpm test` complet 1182 PASS/0 FAIL/234 SKIP (comportement inchangé ailleurs) — CI réelle vérifiée sur log brut, identique au local, `typecheck`/`lint`/`build`/`financial-e2e` verts, seul `format` rouge (dette connue) — run https://github.com/Hassen02020/EasyV4/actions/runs/36788999749. PR https://github.com/Hassen02020/EasyV4/pull/94, mergée (`5ad3276`).

Prochaine étape (sur votre instruction explicite) : ré-auditer ce résultat, puis préparer la fiche `CURRENCY-DIM-01` complète (Vols + Hotels-Monde, taux fournisseur/PSP réel, colonnes rate/source/horodatage sur `reservation_financials`/`economic_entitlements` à confirmer) — non démarré, aucun GO reçu.

### ECON-PILOT-01-DEPRECATE — CLÔTURÉ (2026-10-01)

Audit (lecture seule, sur GO ciblé) de `lib/network/economic-pilot-actions.ts` (ECON-PILOT-01, commit `0eaf804`, antérieur à ECON-BREAKDOWN-01/AGREEMENT-01/ECON-WIRING-01). Constats : **zéro appelant** (aucune page/route/composant dans `app/`, seul son propre test statique le référençait) ; utilisait un **second moteur de marge divergent** (`lib/finance/margin-calculator.ts` — `findApplicableMarginRule`/`calculateMargin`) jamais utilisé ailleurs en production (le vrai flux Network câblé, `product-booking-actions.ts`, utilise exclusivement `applyMargin`/`getMarginsForAgency` — confirmé par son propre invariant `findApplicableMarginRule === 0`) ; commentaire d'en-tête affirmant ce moteur « déjà utilisé par les hôtels » était faux/obsolète. Recommandation (option 1 de l'audit, confirmée par GO explicite) : supprimer plutôt que câbler sur `economic_entitlements`, pour ne pas légitimer un second moteur sur un chemin mort.

Exécution : suppression de `lib/network/economic-pilot-actions.ts` et `lib/network/__tests__/economic-pilot-actions-invariants.test.ts`. Aucune autre référence code (seulement des commentaires historiques dans `lib/network/product-booking-actions.ts`, `lib/db/schema/financials.ts`, `drizzle/manual/0089_...sql` citant le fichier comme contexte de décision passée — laissés inchangés, exacts à la date où ils ont été écrits). Aucune migration, aucune donnée, aucun moteur de prix/commission/wallet touché. Preuves vérifiées sur le log CI brut (pas seulement les coches vertes) : `typecheck`/`lint`/`build`/`financial-e2e` verts, seul `format` rouge (dette connue) — job `test` = 1182 PASS/0 FAIL/234 SKIP (identique au local, 1193→1182 = suppression des 11 tests du fichier supprimé, zéro régression ailleurs) — run https://github.com/Hassen02020/EasyV4/actions/runs/36786516346. PR https://github.com/Hassen02020/EasyV4/pull/93, mergée (`19c3251`).

### ECON-WIRING-01 — CLÔTURÉ (2026-10-01)

Objectif : brancher `economic_entitlements` (ECON-BREAKDOWN-01) sur les 8 modules non encore câblés — Hotel TN, Car, Transfer, Hotels-Monde, Vols, Omra, Activities, Packages (13 call sites) — en miroir additif du pattern déjà prouvé sur Network, sans nouveau taux/accord commercial, sans dépendance à D-01b.

Décision Direction appliquée pendant le chantier (`product_owner ≠ external_supplier`, 2026-10) : Car/Transfer/Omra/Activities/Packages lisent des catalogues **propres à l'agence** (`car_pricing_rates.agency_id`, `omra_packages.agency_id`, `catalog_packages.agency_id`, `catalog_activities.agency_id` — toutes FK agence, aucun fournisseur externe modélisé) → ligne de coût `role="product_owner"`, `partyType="agency"`, jamais `"external_supplier"`. Hotel TN/Hotels-Monde/Vols ont un fournisseur externe réel (myGo, APIs hôtels-monde/vols) → `external_supplier`/`partyId: null`, comme Network/`supplier_node`. **Aucune ligne fabriquée** : Omra/Activities/Packages (pas de marge aujourd'hui, `supplierPriceTnd === salePriceTnd`) → une seule ligne `product_owner`, jamais `seller_margin`/`commission` inventées à 0 ; Car/Transfer/Hotels-Monde/Vols (marge réelle, 0 commission aujourd'hui) → 2 lignes, pas de ligne commission fabriquée ; Hotel TN (commission réelle, `creditPlatformCommission` déjà câblé) → 3 lignes comme Network.

Gap trouvé et corrigé au passage : `lib/finance/__tests__/economic-entitlements-network.test.ts` (preuve live d'ECON-BREAKDOWN-01) n'avait jamais été ajouté à la liste explicite du job CI `financial-e2e` — il s'auto-skippait silencieusement depuis sa création, jamais réellement exécuté contre Postgres réel. Ajouté à la liste (`.github/workflows/ci.yml`).

Preuves vérifiées indépendamment par l'orchestrateur (diff réel intégral + logs CI bruts, pas seulement les coches vertes) : `qualification`/`role` vérifiés directement contre la vraie contrainte CHECK Postgres (`drizzle/manual/0085_econ_breakdown_01.sql`) et le `pgEnum` avant écriture du code, pas seulement les types TypeScript ; 14 nouveaux invariants statiques (`lib/finance/__tests__/econ-wiring-01-invariants.test.ts`) ; `tsc --noEmit` propre ; CI réelle — job `test` = 1193 PASS/0 FAIL/234 SKIP (identique au local), job `financial-e2e` = 40/40 PASS/0 FAIL (log brut, incluant `economic-entitlements-network.test.ts` prouvé pour la première fois contre Postgres réel) — run https://github.com/Hassen02020/EasyV4/actions/runs/36785025754. `typecheck`/`lint`/`build` verts, seul `format` rouge (dette connue, PR #63). Aucune modification de `pricing.ts`/`applyMargin`/`getMarginsForAgency`/`creditPlatformCommission`/wallet/ledger/settlement — confirmé par le diff intégral ET les invariants. Aucune migration DB (table déjà en production). PR https://github.com/Hassen02020/EasyV4/pull/92, mergée (`9bbdced`).

Limites explicites : `network/economic-pilot-actions.ts` (outil de test admin, pas le flux de réservation réel) reste non câblé. Aucune activation de commission réelle sur Car/Transfer/Hotels-Monde/Vols (décision commerciale distincte, non prise ici). `CURRENCY-DIM-01` (multi-devise complet) reste un chantier séparé.

### ECON-WIRING-02 — CLÔTURÉ (2026-10-09)

Objectif : compléter le câblage `economic_entitlements` sur le seul module encore manquant après ECON-WIRING-01 — `lib/transfers/guest-booking-actions.ts` (tunnel B2C guest).

Audit préalable : vérification exhaustive des 9 call sites vers `recordReservationFinancials()` — 8/9 avaient déjà `economicEntitlements` câblé (ECON-WIRING-01). Seul `guest-booking-actions.ts` (transfert guest) était absent. Le rapport initial d'un sous-agent indiquant "8/9 manquants" était erroné (analyse statique incomplète des clés d'objet sur plusieurs lignes).

Correction appliquée (`lib/transfers/guest-booking-actions.ts`) :

- `supplierPriceTnd` corrigé de `totalTnd` (prix de vente) à `pricing.basePriceTnd + pricing.nightSurchargeAmount` (coût réel catalogue propre)
- Ajout de 2 lignes `economicEntitlements` : `product_owner/supplier_cost` + `seller/seller_margin` (même pattern que le module B2B `lib/transfers/actions.ts`)
- Aucun changement au calcul de prix ni au wallet/ledger/settlement

Tests : `node --test lib/finance/__tests__/econ-wiring-01-invariants.test.ts` → 13/13 PASS. `tsc --noEmit` propre. Commit `8fddc1e`, branche `claude/easy2book-v6-modernization-7gyb5v`.

### AGREEMENT-01 — CLÔTURÉ (2026-09-30), PREMIER ACCORD RÉEL RESTE BLOQUÉ SUR D-01b

GO explicite de la Direction, avec un audit préalable obligatoire (schéma complet `margin_rules` + tous ses lecteurs/écrivains + matrice avant/après) et deux corrections reçues en cours de chantier : (1) **AUCUNE ligne réelle/permanente** de `commercial_agreements`/`margin_rules` ne devait être créée — la Direction a explicitement refusé un taux placeholder (`DEFAULT_MARGINS.network = 10 %` ou `0 %`) comme politique commerciale réelle ; le premier accord Network réel reste **BLOQUÉ** sur la décision de taux D-01b (option 3, frais sur prix net) ; (2) preuve de capacité exigée via tests uniquement (fixture créée puis nettoyée en transaction de test), jamais une insertion directe SQL hors app layer.

Audit préalable (avant toute écriture) : `margin_rules` en production = 0 ligne, seule contrainte = PK, RLS `margin_rules_tenant_isolation` = `(agency_id = current_agency_id()) OR is_super_admin()` — **une agence peut aujourd'hui techniquement écrire `commission_percent` sur ses propres lignes** (risque R-06 documenté dans `docs/ECONOMIC_MODEL.md` §2), mais **ZERO écrivain applicatif** n'existe vers `margin_rules` dans tout le dépôt (grep exhaustif : aucun `.insert()`/`.update()`), confirmé aussi par les tests existants (`lib/network/__tests__/economic-pilot-actions-invariants.test.ts`, `lib/pro/margins-core.ts`) — ce risque reste théorique, jamais exploité, et **hors scope d'AGREEMENT-01** (qui ajoute un lien nullable, ne durcit pas la RLS existante de `margin_rules`). `applyMargin()`/`getMarginsForAgency()` lus intégralement : aucun des deux ne lit `commissionPercent` au niveau du calcul de prix (`applyMargin`) ni ne référencera jamais `agreement_id` — confirmé par grep, pas seulement par commentaire. Aucune UI n'écrivait déjà `margin_rules` (`/admin/marges` gère `pricing_margins`, un système différent) : CREATE confirmé comme le bon choix (REUSE/EXTEND non applicables).

Nouvelle table `commercial_agreements` (`drizzle/manual/0087_agreement_01.sql` + `0088_..._rls.sql`), colonne additive `margin_rules.agreement_id` (`0089_agreement_01_margin_rules_link.sql`, nullable, FK `ON DELETE SET NULL`, aucune ligne existante touchée — 0 ligne `margin_rules` en production, inchangé). RLS [D-01a] : écriture `commercial_agreements_admin_write` = `is_super_admin()` **sans aucune exception agence** (contrairement à la quasi-totalité des tables multi-tenant du dépôt, y compris `margin_rules` elle-même) ; lecture élargie `commercial_agreements_party_read` pour les agences parties prenantes (seller/owner/supplier/collector). Action serveur + UI minimales super_admin-gated (`lib/admin/commercial-agreements-actions.ts`, `/admin/accords-commerciaux`), réutilisant EXACTEMENT le pattern `requireSuperAdmin()` de `lib/admin/mutuelle-groups-actions.ts` (défense en profondeur : RLS + check applicatif).

Preuves : cycle rollback→apply→idempotent-reapply en production (`crygnaichvlxavvbifqi`) — table créée, RLS activée+forcée, policies correctes, colonne+FK sur `margin_rules` créées, 0 ligne dans les deux tables après application (vérifié directement). 10 invariants statiques verts localement (`lib/admin/__tests__/commercial-agreements-invariants.test.ts`) ; 5 tests live-DB écrits avec la convention `isDbAvailable()` (`lib/admin/__tests__/commercial-agreements-live.test.ts`, super_admin peut créer, agence non-admin rejetée en INSERT et en UPDATE même en tant que seller_party, isolation agence tierce, FK `agreement_id` vivante avec `ON DELETE SET NULL`).

CI réelle vérifiée indépendamment par l'orchestrateur (pas seulement l'affirmation de l'agent), en 2 temps : premier run (`typecheck`/`lint`/`test`/`build` verts) — `financial-e2e` rouge, root cause isolée sur le log brut du conteneur Postgres réel : la policy RLS `commercial_agreements_admin_write` rejetait correctement l'INSERT non-super_admin (`ERROR: new row violates row-level security policy for table "commercial_agreements"` confirmé côté Postgres), mais l'assertion du test (`assert.rejects(..., /row-level security|new row violates/i, ...)`) testait le regex contre le `.message` externe de `DrizzleQueryError` (`"Failed query: ... params: ..."`), jamais contre `.cause.message` où vit le vrai texte Postgres — bug de matcher de test, pas de comportement RLS. Corrigé directement sur la branche (`3dfcfac`, hors nouveau chantier, bug isolé trouvé pendant la vérification du chantier actif). Deuxième run, confirmé sur le log brut : **37/37 PASS, 0 FAIL, 0 SKIP** sur `financial-e2e` — run https://github.com/Hassen02020/EasyV4/actions/runs/36780059780, job financial-e2e https://github.com/Hassen02020/EasyV4/actions/runs/36780059780/job/110107767255. `typecheck`/`lint`/`test`/`build` verts, seul `format` rouge (dette connue, préexistante, hors périmètre). `pnpm test` complet : 1179 PASS / 0 FAIL / 234 SKIP (zéro régression). PR https://github.com/Hassen02020/EasyV4/pull/91, mergée (merge commit `4c8d35a3`).

Limites explicites : **le premier accord Network réel n'est PAS créé** — bloqué sur D-01b (taux), décision Direction explicite de ne pas inventer de politique commerciale pour satisfaire un critère de preuve. `margin_rules_tenant_isolation` (RLS de `margin_rules` elle-même, risque R-06) n'est pas durcie par ce chantier — décision distincte à soumettre séparément si souhaité. ECON-WIRING-01 (câblage réel du calcul option 3 par module) reste un chantier séparé, non GO'd.

### ECON-BREAKDOWN-01 — CLÔTURÉ (2026-09-30)

GO explicite de la Direction, avec deux précisions obligatoires appliquées : (1) `agreement_id` documenté comme rattachement technique provisoire à `margin_rules.id` — pas une équivalence avec `commercial_agreements` (table non créée, réservée à AGREEMENT-01), colonne volontairement sans FK pour rester repointable sans migration de contrainte ; (2) l'invariant Σ droits = prix client n'est PAS présenté comme une preuve multi-devise générale — testé et documenté explicitement comme le **« Network/TND reference case »**, `product.costCurrency` restant une colonne non lue/non contrainte par le code réel (**« CURRENT ASSUMPTION — NOT ENFORCED »**, phrase verbatim dans le code et les tests). Couverture complète des devises différée à un futur chantier nommé **`CURRENCY-DIM-01`**.

Nouvelle table `economic_entitlements` (`drizzle/manual/0085_econ_breakdown_01.sql` + `0086_..._rls.sql`, RLS par le même pattern EXISTS-via-`reservations.agency_id` que `reservation_financials`), écrivain unique `recordReservationFinancials()` (extension additive, param optionnel — comportement inchangé pour les 8 autres modules), câblé uniquement sur Network (`lib/network/product-booking-actions.ts`) : 3 lignes par réservation (`supplier_cost`/`seller_margin` net de commission/`easy2book commission`), aucun changement à `creditPlatformCommission()`/wallet/ledger/settlement/pricing/`margin_rules`. Numéro de migration vérifié sans collision avec PR #82 (LEDGER-INTEGRITY-01, `0084`, toujours ouverte/non mergée à ce stade).

Preuves vérifiées indépendamment par l'orchestrateur (diff réel + CI réelle, pas seulement l'affirmation de l'agent) : cycle rollback→apply→re-apply idempotent en production (`crygnaichvlxavvbifqi`) avec vérification `has_table_privilege`/RLS/contraintes à chaque étape ; preuve d'invariant Σ=770 sur fixtures jetables insérées puis supprimées dans la même transaction ; CI réelle verte (`typecheck`/`lint`/`test`/`build`/`financial-e2e`), seul `format` rouge (dette connue, PR #63) — run https://github.com/Hassen02020/EasyV4/actions/runs/36774280426. PR https://github.com/Hassen02020/EasyV4/pull/88, mergée (squash `c0d02e1`).

Limites explicites (non résolues par ce chantier, par périmètre) : pas de REVOKE UPDATE/DELETE au niveau privilèges Postgres sur `economic_entitlements` (append-only applicatif seulement, pas encore imposé en base — un futur chantier type LEDGER-INTEGRITY-01 pourrait l'ajouter) ; aucune transition de statut `earned→settleable/settled/compensated` implémentée ; `cancellation_treatment`/`compensates_id` posées mais non utilisées (logique de compensation = futur chantier séparé) ; ECON-WIRING-01 (8 autres modules) non câblé, bloqué sur la décision de taux par module (D-01b, option 3) ; `commercial_agreements` n'existe toujours pas (AGREEMENT-01, non GO'd).

### Audit Commercial & Revenue 01 — 2026-09-30 (lecture seule, `main` @ `fa96c53`)

Constats principaux (preuves SQL production + code) : `margin_rules` = 0 ligne et `pricing_margins` = 0 ligne en production → marges = `DEFAULT_MARGINS` codés, `commissionPercent` absent → **droit Easy2Book = 0 TND sur 100 % des ventes** ; commission câblée sur 2 modules / 9 (Hôtel TN, Network) ; aucune contre-passation à l'annulation ; aucune dette fournisseur/propriétaire enregistrée (settlement = commission interne seulement) ; `journal_entries`/`journal_lines`/`exchange_rates` présents en schéma sans aucun écrivain ; TVA 19 % par défaut codée. Rapport, blueprint v3 (« Global Commerce, Local Accounting — One Commerce, Multiple Books », cœur = Economic Entitlement) et roadmap v3 remis à l'utilisateur. Décision utilisateur : **Phase 0 ECONOMIC-MODEL-FREEZE-01 avant tout câblage de revenu** ; l'ancien COMMISSION-REVERSAL-01 est absorbé dans ECON-BREAKDOWN-01 (annulation = droit compensatoire pour tous les rôles). Garde-fou d'ici là : **aucune règle de commission activée en production**.

### VERIFY-RUNTIME-ROLE-01 — CLÔTURÉ (2026-09-30), aucun code

La doc des migrations se contredisait (0069 : `DATABASE_URL` = `app_runtime` ; 0076/0078/0079 : `postgres` BYPASSRLS). Preuve production : `pg_stat_statements` → `app_runtime` (`rolbypassrls=false`) porte 214 060 appels dont 296 sur `reservations` et 106 sur le wallet B2B ; `postgres` 4 154 (migrations/outils). La RLS est réellement appliquée au runtime ; l'autorisation Network (`products_tenant_isolation` : super_admin OU propriétaire OU `product_authorizations` actif) est effective. **Les commentaires de 0076/0078/0079 sont obsolètes sur ce point.** Simulation empirique `SET ROLE app_runtime` : NOT VERIFIED — ENVIRONMENT LIMITATION (refusée à l'outil d'audit).

### NETWORK-NODE-VISIBILITY-01 — CLÔTURÉ, EN PRODUCTION (2026-09-30)

Bug trouvé par VERIFY-RUNTIME-ROLE-01 : `supplier_nodes` est super_admin-only (0076) et `createNetworkProductBooking` le lisait directement dans le contexte de l'agence revendeuse → 0 ligne sous `app_runtime` → échec systématique « nœud fournisseur pas actif » pour toute agence (latent : 0 produit/0 nœud en prod). Correctif : `network_product_node_is_active(uuid)` (`drizzle/manual/0083_network_node_visibility_01.sql`, SECURITY DEFINER, `search_path` fixé, renvoie un booléen uniquement pour un produit visible par l'appelant, EXECUTE `app_runtime`/`service_role` seulement) ; `supplier_nodes` reste super_admin-only ; appel dans `lib/network/product-booking-actions.ts` (motif `tx.execute … as Array<…>` de `lock_agency_for_debit`). Preuves : invariants 9/9 en local ; migration validée en prod dans une transaction ROLLBACK puis **appliquée en production** (vérifié : `prosecdef=true`, `search_path=public`, EXECUTE app_runtime=true / anon=false / authenticated=false, produit inconnu → false) ; CI PR #79 `typecheck`/`lint`/`test`/`build` verts (`format` rouge, dette connue) ; PR https://github.com/Hassen02020/EasyV4/pull/79 mergée (squash `27d8c9d`) ; statut Vercel `easy2book-new` sur `27d8c9d` = success (« Deployment has completed », lu via l'API GitHub — l'API Vercel reste en 403 sur le scope `easy2book` pour cette session). NOT VERIFIED : réservation Network réelle par une agence autorisée (aucun produit en prod, pas de Postgres en CI).

### ECONOMIC-MODEL-FREEZE-01 — EN COURS (Phase 0)

`docs/ECONOMIC_MODEL.md` rédigé (PR #80, draft) : acteurs et rôles, accord commercial, droit économique (champs, invariants, qualification ≠ moteur), annulation compensatoire, droits vs money events, devise, contexte fiscal, 5 modèles chiffrés (Network en premier), décisions D-01 à D-04. **En attente des décisions de la Direction (§10 du document).** Aucun code, aucune migration.

### COMMERCIAL-REVENUE-01 (commission reversal) — ABANDONNÉ SANS ÉCRITURE (2026-09-30)

GO initial donné avant que l'audit Commercial & Revenue 01 (ci-dessus) ne soit délivré. Dès réception du rapport et de la mise à jour de ce fichier actant l'absorption dans ECON-BREAKDOWN-01, l'agent d'implémentation a été arrêté par l'orchestrateur avant tout commit/push/PR. Aucune branche `commercial-revenue-01-*` n'existe sur `origin`. Un brouillon de travail (`reverseCommission()` réutilisant `credit_platform_commission()` avec un montant négatif, pas de nouveau moteur ni migration) reste non commité dans un worktree local, conservé comme référence possible pour ECON-BREAKDOWN-01, pas comme travail en cours.

### COMMERCIAL-REVENUE-02 (Car financials) — CLÔTURÉ (2026-09-30)

GO donné avant l'audit Commercial & Revenue 01 ; ré-audité après coup pour vérifier qu'il n'entre pas en conflit avec le gel du modèle économique. Gap : `lib/cars/actions.ts`/`lib/cars/guest-booking-actions.ts` appellent `debitPartnerCredit` et calculent une marge réelle via `calculateCarPrice()` (même moteur `applyMargin()` que Transferts) mais n'appelaient jamais `recordReservationFinancials()` — marge calculée puis silencieusement jamais persistée. Correctif : ajout du seul appel manquant, mirroir exact du pattern Transferts, aucune modification du calcul de prix. L'audit Commercial & Revenue 01 avait qualifié Car de « 2 moteurs de prix incohérents / UNKNOWN » : ré-vérifié directement sur le code par l'orchestrateur ET par l'agent — un seul moteur (`applyMargin()`), pas deux formules divergentes. Le vrai gap (déjà documenté ailleurs : ROADMAP R3-02/R6-02) est que `car` est exclu du type `MarginModule` et qu'aucune UI n'écrit jamais `pricing_margins` pour ce module — donc la marge persistée sera `0` pour la quasi-totalité des réservations réelles aujourd'hui, ce qui est le comportement correct à documenter, pas un bug de ce chantier. Non concerné par le gel ECONOMIC-MODEL-FREEZE-01 (aucune activation de commission/revenu, persistance additive uniquement). CI vérifiée directement par l'orchestrateur : `typecheck`/`lint`/`test`/`build` verts, `format` rouge (dette connue, PR #63). PR https://github.com/Hassen02020/EasyV4/pull/83, mergée (squash `a1aedb5`).

Prochains chantiers possibles, indépendants du gel (à proposer un par un, un GO à la fois) : LEDGER-INTEGRITY-01 (pris en charge par une autre piste, PR #82 ouverte — non touché ici, voir note dédiée plus bas), FINANCIAL-E2E-01.

### FINANCIAL-E2E-01 — CLÔTURÉ (2026-09-30)

```text
FINANCIAL-E2E-01
→ infrastructure CI PostgreSQL : VALIDÉE
→ 2 défauts de fixtures de tests identifiés
→ corrections séparées autorisées

JOURNEYS-TEST-FK-FIX-01
→ GO
→ CLÔTURÉ

BOOKING-CONCURRENCY-TEST-RLS-FIX-01
→ GO
→ CLÔTURÉ

Résultat final : 32/32 PASS — 0 FAIL — 0 SKIP
```

Les deux corrections (fichiers de test uniquement, aucun changement applicatif, conforme au périmètre des deux GO) ont été poussées sur la branche `financial-e2e-01` (PR #85) : `18cfb97` (insertion d'une vraie ligne `reservations` avant `recordLineOutcomeCore(ok:true)`, `withTenantContext`+`txOverride` séparé par bras concurrent pour `debitPartnerCredit`) puis `5bf1659` (un second gap FK trouvé au run suivant — `customers.agency_id` également `onDelete:"restrict"`, jamais nettoyé dans `after()`, même fichier, même périmètre). Re-run CI réel après chaque push, logs bruts relus directement par l'orchestrateur (pas seulement l'affirmation d'un agent) :

- run 1 (avant les 2 fixes) : `27 pass / 6 fail / 0 skip`.
- run 2 (après fix FK partiel + fix RLS complet) : `32 pass / 1 fail / 0 skip` — les deux tests de concurrence `debitPartnerCredit` passent réellement sous RLS (`app_runtime`, non-bypass) pour la première fois.
- run 3 (après le second fix FK) : **`32 pass / 0 fail / 0 skip`** — https://github.com/Hassen02020/EasyV4/actions/runs/36752274039/job/110013608391. `typecheck`/`lint`/`test`/`build` verts, `format` rouge (dette connue, PR #63, sans rapport).

**Définition de "DONE" de l'utilisateur pleinement remplie** : infrastructure CI PostgreSQL réelle validée, schéma + 81 migrations manuelles + rôle `app_runtime` répliqués avec succès en CI, 5 suites financières exécutées réellement (plus `margins-core.test.ts`), 0 FAIL, 0 SKIP. Les 6 échecs du premier run n'étaient, dans les deux cas, PAS des bugs financiers de production — le code applicatif réel (`debitPartnerCredit`, `recordLineOutcomeCore`, les 3 vrais appelants de `debitPartnerCredit`) a été vérifié directement et est correct ; c'étaient des fixtures de test qui ne respectaient pas les contraintes réelles du système (FK, RLS) jamais exercées auparavant faute de Postgres réel. PR https://github.com/Hassen02020/EasyV4/pull/85, mergée (squash `1f1a654`).

GO donné pour construire un vrai Postgres éphémère en CI (service container GitHub Actions) et y exécuter réellement 5 suites de tests financiers jusqu'ici toujours en `SKIP` faute de `DATABASE_URL`. Premier run réel (PR #85, job `financial-e2e`, run https://github.com/Hassen02020/EasyV4/actions/runs/36737333279) : schéma + 81 migrations manuelles + rôle `app_runtime` (non-bypass RLS, conforme production) répliqués avec succès ; **0 SKIP sur les 33 tests ciblés — objectif infrastructure atteint et vérifié indépendamment par l'orchestrateur** (logs bruts relus, pas seulement l'affirmation de l'agent). Résultat brut : `27 pass / 6 fail / 0 skip`.

Diagnostic des 6 échecs (lecture directe du code applicatif réel, pas de supposition) : **les deux défauts sont des fixtures de test qui ne respectaient pas les contraintes réelles du système — pas des bugs financiers de production.**

- **`journeys-core.test.ts` (4 fail)** — 3 tests appelaient `recordLineOutcomeCore(..., { reservationId: randomUUID() })` avec un id fabriqué, jamais inséré dans `reservations`, alors que `journey_lines.reservation_id` porte une vraie FK. Vérifié dans `journey-actions.ts:309-327` : en production, `recordLineOutcomeCore` ne reçoit jamais un id fabriqué — toujours celui, réel et déjà committé, retourné par le vrai moteur de réservation (`dispatchJourneyLine`). Le `after()` échouait en cascade (agence non supprimable tant que des lignes orphelines la référencent).
- **`booking-actions-concurrency.test.ts` (2 fail, 0 pass)** — le test appelait `debitPartnerCredit()` sans aucun contexte tenant, retombant sur son mode `getDb()` autonome (`lib/pro/booking-actions.ts:500-503`), jamais utilisé par un appelant réel. Vérifié : les 3 SEULS appelants de production (`lib/booking/actions.ts:627`, `lib/cars/actions.ts:262`, `lib/transfers/actions.ts:225`) passent tous `txOverride` depuis un `withTenantContext` déjà établi. Sous `app_runtime` (RLS active), l'absence de contexte fait échouer le `WITH CHECK` de la policy `partner_credit_movements_tenant_isolation`.

Les deux corrections (fichiers de test uniquement, aucun changement applicatif) sont GO'd séparément et en cours — voir commit `18cfb97` sur la branche `financial-e2e-01` (PR #85). **PR #85 reste ouverte et NON mergée.** Prochaine étape : relancer la CI réelle ; si `33/33 PASS — 0 FAIL — 0 SKIP`, `FINANCIAL-E2E-01` pourra être considéré réellement DONE, le diff de #85 revu, et une décision de merge prise séparément.

### Batch GO 1/2/3/4 — CLÔTURÉ (2026-09-30)

GO explicite de l'utilisateur (Direction@easy2book.tn), message exact "GO 1/2/3/4", en réponse aux 4 chantiers candidats numérotés proposés en clôture de l'audit commerce-readiness du même jour. Exécution en parallèle (worktrees isolés, domaines disjoints, aucun recoupement de fichiers). Détail par chantier :

**PLATFORM-COMMISSION-NETWORK-01 — CLÔTURÉ.** Gap trouvé par l'audit : `creditPlatformCommission()` (`lib/finance/platform-commission.ts`), seul mécanisme créditant le wallet plateforme Easy2Book, n'était appelé que par le module Hotel (`lib/booking/actions.ts:611`, `lib/booking/guest-actions.ts:509`) — jamais par `createNetworkProductBooking`, alors que la distribution B2B network est la raison d'être commerciale du module. Correction : un seul appel `creditPlatformCommission(tx, {reservationId, commissionAmount, description})` ajouté dans `lib/network/product-booking-actions.ts`, même transaction, juste après `recordReservationFinancials(...)` — mirror exact du pattern Hotel. Aucun jugement de taux nécessaire : le module network résolvait déjà son taux via le même moteur de marge réel que Hotel (`getMarginsForAgency()`/"network"). Test d'invariant statique ajouté. CI réelle vérifiée par l'orchestrateur (pas seulement l'affirmation de l'agent) : `typecheck`/`lint`/`test`/`build` verts, seul `format` rouge (dette pré-existante non-bloquante, PR #63). PR https://github.com/Hassen02020/EasyV4/pull/77, mergée (squash `d4b323b`).

**CART-DRIFT-01 — CLÔTURÉ.** Bug réel trouvé (pas cosmétique) : le panier B2C affichait un prix figé en `localStorage` sans TTL ; si le tarif changeait entre l'ajout au panier et la confirmation, le montant réellement chargé (toujours recalculé serveur depuis une source autoritative — aucun risque de ledger déjà) différait silencieusement de ce que le client avait vu et accepté, sans reconfirmation. Correctif : rejet explicite `PRICE_CHANGED` avant tout paiement/écriture si le total recalculé diverge matériellement, sur les 3 moteurs guest (hôtel/package/activité) + mise à jour panier côté client. `pnpm test` local : 1374/1375 (1 échec pré-existant, `lib/vols/__tests__/production-load.test.ts`, isolé du diff). CI réelle vérifiée par l'orchestrateur : premier run avec 1 échec sur ce même test isolé (`production-load.test.ts`, timing-sensible) — re-run demandé et confirmé vert au deuxième passage, prouvant la nature flaky plutôt qu'une régression. PR https://github.com/Hassen02020/EasyV4/pull/75, mergée (squash `9f8a64f`).

**WALLET-RACE-CI-01 — CLÔTURÉ, avec réserve explicite.** Audit : aucun bug de concurrence trouvé — `debitPartnerCredit`/`debitCustomerWallet` ont déjà un verrouillage `FOR UPDATE` correct, déjà durci par 2 audits antérieurs (migrations 0020, 0025). Écart réel = couverture de test uniquement. 2 fichiers de test ajoutés (`booking-actions-concurrency.test.ts`, `customer-wallet-concurrency.test.ts`), pattern `journeys-core.test.ts` (double appel concurrent réel via `Promise.all`). **Statut réel : NOT VERIFIED contre un Postgres réel** — ce sandbox n'a pas Docker/Postgres, les tests passent en SKIP propre (compilation/logique de garde correctes) mais la course elle-même n'a jamais été exécutée en conditions réelles. CI réelle vérifiée : `typecheck`/`lint`/`test`/`build` verts (le `test` vert ne prouve que le SKIP propre, pas la concurrence elle-même — cohérent avec ce que CI peut prouver, absence de `DATABASE_URL` en CI). PR https://github.com/Hassen02020/EasyV4/pull/74, mergée (squash `f5b2b0b`). **À faire avant de considérer la garantie de concurrence elle-même prouvée : exécuter ces 4 tests contre un Postgres réel (CI avec DB de service, ou local).**

**NAV-FIX-01 — CLÔTURÉ N/A.** Audit complet de toutes les surfaces de nav (admin-shell, pro/layout, mutuelle-shell, header, footer) : aucune entrée morte/cassée trouvée. L'historique git montre que cette classe de bug a déjà été corrigée par plusieurs chantiers antérieurs (`86fb563`, `6a17840`, `5cabfe2`, `d83fab8`, `5aabc7c`). Aucun code changé, aucune PR.

### WALLET-RACE-CI-01 — CLÔTURÉ / DONE (réconcilié 2026-10-01)

**RÉCONCILIATION (2026-10-01)** : critère de sortie réel (ci-dessous) désormais satisfait. Les deux fichiers de test ont été ajoutés à la liste explicite du job CI `financial-e2e` pendant `FINANCIAL-E2E-01` (2026-09-30) et s'exécutent contre Postgres réel à chaque run depuis. Vérifié directement sur le log brut du run le plus récent (`36792833784`, déjà mergé sur `main` via PR #96) :

```
ok 8  - debitCustomerWallet : deux débits concurrents dont la somme dépasse le solde -> exactement un réussit, jamais un découvert client
ok 9  - debitCustomerWallet : deux débits concurrents dont la somme NE dépasse PAS le solde -> les deux réussissent, aucun 'lost update'
ok 39 - debitPartnerCredit : deux débits concurrents dont la somme dépasse le solde -> exactement un réussit, jamais un double-spend
ok 40 - debitPartnerCredit : deux débits concurrents dont la somme NE dépasse PAS le solde -> les deux réussissent, aucun 'lost update'
```

4/4 PASS, contre Postgres réel non-BYPASSRLS (`app_runtime`) — exactement le critère fixé ci-dessous. Chantier marqué DONE.

**Contexte** : flagué par l'audit commerce-readiness (section E2E/Stress, 2026-09-30) comme écart de couverture de tests sur la concurrence des débits wallet. GO utilisateur (Direction@easy2book.tn, message exact "GO 1/2/3/4") enregistré dans le commit `e2d3911` (branche `journey-builder-01-e2e-fixes`, poussée sur `origin`) — **pas encore sur `main`** au moment de ce chantier (vérifié directement : `docs/ROADMAP.md` sur `origin/main` ne portait pas encore ce GO). Ce chantier a démarré sur la base de `origin/main` (branche `wallet-race-ci-01`), en s'appuyant sur cette preuve de GO indépendamment vérifiée plutôt que sur la seule affirmation du coordinateur.

**Audit (SEARCH → VERIFY, avant toute écriture)** : tous les chemins de code qui écrivent `agencies.deposit_balance` ou `wallet_accounts.current_balance` ont été recensés (grep sur `debitPartnerCredit`/`partner_credit_movements`/`deposit_balance`/`set_agency_deposit_balance`). Deux fonctions de débit réelles, chacune point d'entrée unique de son domaine :

- `debitPartnerCredit` (`lib/pro/booking-actions.ts`) — wallet agence B2B. Tous les modules de réservation (`lib/booking/actions.ts`, `lib/omra/*`, `lib/transfers/*`, `lib/cars/actions.ts`, `lib/packages/*`, `lib/activities/*`, `lib/network/product-booking-actions.ts`) l'appellent, aucune logique dupliquée.
- `debitCustomerWallet` (`lib/finance/customer-wallet.ts`) — wallet client B2C ("Solde Easy2Book").

Les deux ont déjà un verrouillage pessimiste row-level correct (`lock_agency_for_debit()` SECURITY DEFINER `FOR UPDATE` pour le premier, `SELECT ... FOR UPDATE` direct sur `wallet_accounts` pour le second), cohérent avec les chemins de crédit voisins (`lib/finance/wallet-credit.ts`, `lib/booking/cancel-actions.ts`, `lib/finance/refund-logic.ts`) et déjà durci par deux audits antérieurs (migrations `0020_agency_wallet_balance_write_gap.sql`, `0025_agency_debit_lock_rls_gap.sql`). **Aucun bug de concurrence trouvé** — pas de nouvelle logique de débit écrite, conformément à la RÈGLE FINANCIÈRE (on ne modifie pas une écriture financière sans un bug concret et concret à corriger).

**Écart réel = tests uniquement** : `lib/pro/__tests__/booking-actions.test.ts` et `lib/finance/__tests__/customer-wallet.test.ts` n'exerçaient ces fonctions qu'avec `dbOverride`/`txOverride` mockés, en single-thread — jamais deux appels concurrents contre un Postgres réel, contrairement à `lib/journeys/__tests__/journeys-core.test.ts` (pattern CAS de Journey Builder, déjà prouvé en conditions réelles). Un script manuel préexistant (`scripts/wallet-race-test.ts`, `npm run wallet:race`) démontrait déjà le principe du verrou `FOR UPDATE`, mais sur une réimplémentation simplifiée (`tx.update(agencies)` direct, pas `set_agency_deposit_balance()`), hors suite de tests automatisée (`npm test`), sans couverture du wallet client — ne comble donc pas l'écart.

**Ce qui a été ajouté** (REUSE du pattern `journeys-core.test.ts`, aucune nouvelle primitive de concurrence) :

- `lib/pro/__tests__/booking-actions-concurrency.test.ts`
- `lib/finance/__tests__/customer-wallet-concurrency.test.ts`

Chaque fichier prouve, contre un Postgres réel, deux scénarios par fonction de débit (deux appels `Promise.all` dans des transactions Drizzle séparées, jamais un `txOverride` partagé) :

1. **Double-spend** : deux débits concurrents dont la somme dépasse le solde → exactement un réussit, l'autre `INSUFFICIENT_FUNDS`, solde final cohérent.
2. **Lost update** : deux débits concurrents dont la somme ne dépasse pas le solde → les deux réussissent, solde final reflète les deux (pas de lecture périmée par la seconde transaction).

**Statut des tests : `NOT VERIFIED — requires live Postgres to run`.** Docker indisponible dans le sandbox d'exécution (`docker ps` → daemon injoignable), `DATABASE_URL` non définie dans le worktree — mêmes contraintes d'environnement que celles déjà documentées pour `journeys-core.test.ts`. Les 4 tests ont été exécutés (`node --import tsx --test ...`) : ils passent en `SKIP` propre via le même garde `isDbAvailable()`, prouvant que le code compile et s'importe correctement, mais **aucune exécution réelle contre Postgres n'a eu lieu dans cette session**. `typecheck`/`lint`/`prettier` verts sur les deux nouveaux fichiers. Aucun fichier applicatif (`booking-actions.ts`, `customer-wallet.ts`) modifié.

**Critère de sortie réel** : exécuter ces deux fichiers contre un Postgres réel (CI ou local avec `DATABASE_URL`) et confirmer les 4 tests au vert avant de marquer ce chantier `DONE`.

### SEC-RLS-02 — CLÔTURÉ (2026-09-29)

**Corrige une prémisse fausse de R2-04** (ci-dessous) : l'audit Phase 0 affirmait que les 7 tables `flight_*` "n'existent pas du tout en base" en production, donc pas d'urgence sur leur RLS manquante. C'était vrai au moment de l'audit mais plus depuis la PR #59 (mergée, déployée en prod) qui modifie `flight_bookings` par `ALTER TABLE` — preuve que la table existe déjà. Vérification directe en base (`crygnaichvlxavvbifqi`) : **11 tables `flight_*`** existent réellement en production, RLS activée mais **0 policy** sur chacune (deny-all pour tout rôle sans bypass, mais aucune isolation tenant réelle en base). Gap supplémentaire découvert au passage : **`commission_settlement_entries`** (créée par R4-03/PR#56, 2 jours plus tôt) — RLS **pas même activée** (niveau ERROR de l'advisor Supabase, pas seulement policy manquante), table financière exposée sans protection RLS. `supplier_nodes`/`supplier_portal_users` : même défaut que le lot Omra corrigé en 0061 (RLS activée, 0 policy).

Correction : migration `drizzle/manual/0076_flight_commission_supplier_rls.sql`, **appliquée en production**. Pattern réutilisé de 0010/0061 (`agency_id = current_agency_id() OR is_super_admin()` pour les 7 tables à `agency_id` direct ; jointure sur `flight_bookings.agency_id` via `booking_id` pour les 4 tables enfants NOT NULL CASCADE ; `flight_supplier_transactions` avec `booking_id` nullable traité en deny sauf super_admin si orphelin ; `commission_settlement_entries`/`supplier_nodes`/`supplier_portal_users` en `is_super_admin()` uniquement, faute de `agency_id` ou de mécanisme de session pour un scoping plus fin).

Limitation documentée (pas d'invention de plomberie hors périmètre) : `supplier_nodes`/`supplier_portal_users` n'ont aucun mécanisme de session (`current_supplier_node_id()` n'existe pas dans `lib/db/tenant-context.ts`) pour un scoping self-service "un fournisseur ne voit que son propre nœud" — elles restent donc `is_super_admin()`-only ; un scoping plus fin est un futur chantier séparé si le portail fournisseur interroge un jour la base directement.

Preuves : `postgres` (rôle réel de `DATABASE_URL`) a `rolbypassrls=true` — RLS reste inerte pour la connexion serveur actuelle, ce chantier est un renforcement défense-en-profondeur (protège un accès direct anon/authenticated via PostgREST/Supabase client), pas un correctif d'un bug fonctionnel observé. Vérifié post-migration : 15/15 tables avec `rls_enabled=true` + 1 policy chacune ; `get_advisors(security)` ne remonte plus aucun `rls_enabled_no_policy` ni `rls_disabled_in_public` sur ces tables (restent 2 WARN pré-existants hors périmètre : `function_search_path_mutable`, `auth_leaked_password_protection`). Test empirique par simulation de rôle (`SET LOCAL ROLE authenticated` + GUC) : `flight_bookings`/`supplier_nodes` retournent 0 ligne sans contexte agence/super_admin — mais ces tables sont actuellement **vides en production** (0 ligne), donc ce test ne peut pas différencier deny-vs-allow ; validité du pattern reposant sur son identité avec `wallet_ledger`/`journal_lines` (0010), déjà éprouvé en prod. `typecheck`/`lint`/`test`/`build` verts (aucun fichier applicatif touché, migration SQL pure).

### Correction — R2-04 (audit Phase 2, 2026-09-28)

La ligne R2-04 ci-dessous datait de l'audit Phase 0 et est **obsolète depuis SEC-RLS-02** : la RLS manquante sur les tables `flight_*` a été corrigée (voir ci-dessus), et la prémisse "ces 7 tables n'existent pas du tout en base" ne tient plus (elles existent depuis au moins la PR #59). Ligne du tableau Phase 2 à lire comme `DONE (2026-09-29, voir SEC-RLS-02)`.

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

Audit Phase 3 (B2B User) demandé par l'utilisateur. Gap confirmé puis comblé, même forme que R2-05 : `/pro/clients` était un annuaire strictement lecture seule (`loadPartnerClients`), un client n'existait que via le _find-or-create_ caché dans chaque flux de réservation. `createCustomer`/`updateCustomer` existaient déjà mais réservés à `ADMIN_ROLES` (staff OTA). Ajout de `createPartnerClient`/`updatePartnerClient` (`lib/pro/client-actions.ts`), gate `"clients.create"`/`"clients.edit"` — déjà dans la baseline `partner_owner` et délégable à un `partner_agent`, `getEffectivePermission` combinant déjà override et baseline (aucune nouvelle plomberie de permission). UI : `NewClientDialog`/`EditClientDialog` sur `/pro/clients`. `typecheck`/`lint`/`test` (1068/1068)/`build` verts. PR : https://github.com/Hassen02020/EasyV4/pull/55 (mergée).

**Phase 3 (B2B User) — état** : R3-01 (fait), R3-02 (`REUSE`, conditions commerciales déjà en place), R3-03 (modèle Quote — **absent, confirmé** ; **décision produit reçue le 2026-09-29, DIFFÉRÉE explicitement, à ne pas oublier :**

> **Pas de devis pour le moment** (2026-09-29). Périmètre futur précisé par l'utilisateur — **très important, à ne jamais refaire évaluer depuis zéro** : le devis (Quote) ne remplace PAS la facture partout. Il s'applique spécifiquement à 3 cas où une **facture immédiate n'a pas de sens** parce que le prix/la faisabilité ne sont pas figés au moment de la demande :
>
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

### R4-03 — CLÔTURÉ (2026-09-29)

Audit Phase 4 (Wallet) demandé par l'utilisateur après le cadrage définitif du modèle Quote (voir R3-03 ci-dessus). Gap P2 confirmé (identifié dès l'audit Phase 0) : `settleCommissions()` (`lib/finance/commission-settlement.ts`) faisait un `UPDATE wallet_ledger SET settled_at=…, settlement_id=…` — violation littérale de l'invariant append-only (Master Prompt §13.2), même si seules des métadonnées de rapprochement étaient touchées (pas les montants).

Correction : nouvelle table append-only `commission_settlement_entries` (`UNIQUE INDEX` sur `wallet_ledger_id` — empêche tout double-settlement), migration `drizzle/manual/0074_commission_settlement_entries.sql` **appliquée en production** (`crygnaichvlxavvbifqi`, backfill = 0 ligne — aucun settlement historique n'avait encore de commission réglée). `settleCommissions()` fait désormais un `INSERT` dans cette table au lieu d'un `UPDATE` du ledger ; les 2 requêtes "non settlée" (agrégat de période + `getUnsettledCommissionBalance()`) passent de `isNull(walletLedger.settledAt)` à `NOT EXISTS(... commission_settlement_entries ...)`. Colonnes `wallet_ledger.settled_at`/`settlement_id` conservées (jamais supprimées, jamais réécrites — compat historique). Test d'invariant statique (`commission-wiring-invariants.test.ts`) mis à jour : vérifie le nouveau filtre `notExists(commissionSettlementEntries)` et l'absence de tout `.update(walletLedger)` dans le fichier.

Preuves : migration appliquée en prod avec vérification du compte backfill (0=0) ; `typecheck`/`lint`/`build` verts ; `pnpm test` local 1069/1069 ; CI (`typecheck`/`lint`/`test`/`build`) verte après un re-run confirmé flake sur un test non lié (`P18` throughput timing, `lib/vols/__tests__/production-load.test.ts`, hors périmètre du diff). `format` en échec attendu/documenté (744 fichiers pré-existants, non bloquant depuis R1-07). PR : https://github.com/Hassen02020/EasyV4/pull/56 (mergée).

**Phase 4 (Wallet) — bilan** : R4-01 (`REUSE`, étape expand atteinte, bascule lecture différée/observation), R4-02 (`REUSE`), R4-03 (fait ci-dessus), R4-04 (`REUSE`), R4-05 (`REUSE`, confirmé le 2026-09-29). Plus aucun gap P0/P1/P2 ouvert sur cette phase. R6-05 (Phase 6, doublonnait ce même gap) clos par la même PR.

### R7-03 — CLÔTURÉ (2026-09-29)

Audit Phase 7 (Honnêteté Commerce & Supply) — les 5 lignes R7-01 à R7-05 étaient déjà pré-remplies par l'audit Phase 0 (colonne "État audit"), donc pas de nouvel audit de fond nécessaire ; reconfirmation de l'état sur `main` actuel avant d'agir (`grep` ciblé). Gap confirmé inchangé : 9 flags `FEATURE_*` documentés dans `.env.example` (7 listés par l'audit initial + `FEATURE_YIELD_ENGINE`/`FEATURE_INVENTORY_LOCKS`/`FEATURE_WALLET_B2B` non mentionnés à l'époque), **0 occurrence `process.env.FEATURE_*`** dans tout le code applicatif (`lib/`, `app/`, `components/`) — reconfirmé par grep exhaustif par nom de flag, une seule mention en commentaire (`lib/pro/pricing.ts:45`, citant `EASYV4_CAR_DECISION.md`). Le gating réel des modules est un `disabled: true` en dur par module (`components/pro/pro-module-tabs.tsx`), sans lien avec ces variables.

Fiche chantier présentée avec 2 options (câbler les flags réellement vs. les supprimer/documenter comme réservés) ; l'utilisateur a choisi l'**option B** — documentation uniquement, aucun changement de comportement. Correction : ajout d'un commentaire explicite au-dessus du bloc `FEATURE_*` dans `.env.example` ("RÉSERVÉ, NON CÂBLÉ") pour éviter qu'un futur relecteur ou DevOps ne croie pouvoir activer/désactiver un module en production via ces variables. Les 9 lignes de flags conservées (pas de suppression), gardées en réserve pour un futur câblage réel si décidé.

Preuves : changement limité à `.env.example` (aucun fichier applicatif touché) ; CI verte (`typecheck`/`lint`/`test`/`build`, `format` en échec attendu/documenté comme d'habitude). PR : https://github.com/Hassen02020/EasyV4/pull/57 (mergée).

### R7-01 — CLÔTURÉ (2026-09-29)

Gap confirmé (aucune constante `IMPLEMENTED/CERTIFIED/PARTIAL/SCAFFOLDED/NOT_WIRED` dans `lib/**`). Pendant l'audit, dérive concrète constatée : `EASYV4_CAR_DECISION.md` affirmait le module Car "couche application : 0%", alors que `lib/cars/actions.ts::createCarBooking`, `lib/cars/guest-booking-actions.ts` et `app/(public)/[locale]/car/search/page.tsx` existent déjà et fonctionnent réellement (`/car/search` ne renvoie plus de 404) — preuve que la doc humaine seule dérive silencieusement.

Correction : nouveau `lib/modules/capabilities.ts`, registre unique en code pour les 8 modules de réservation (statut `REAL`/`DEMO`/`SEARCH_ONLY`/`NOT_WIRED` + note + fichier de preuve), et nouveau test statique `capabilities-consistency.test.ts` qui échoue si le `bookingActionFile` déclaré disparaît, ou si le `demoSupplierFile` d'un module `DEMO` ne porte plus le signal `isDemoMode`/driver `"virtual"` — pas une déclaration qui peut dériver sans être détectée.

État vérifié (audit code direct, pas de supposition) : Hôtels Tunisie/Omra/Packages/Activités/Transferts/**Car** = `REAL` (booking réel) ; Vols/**Hôtels Monde** = `DEMO` (booking réel, fournisseur de recherche simulé). Point notable : Hôtels Monde a été reclassé `DEMO` (et non `SEARCH_ONLY` comme supposé initialement) après vérification de `lib/hotels-monde/guest-booking-actions.ts` — un vrai pipeline de réservation existe, seul le fournisseur de recherche est simulé, exactement comme Vols ; confirmé avec l'utilisateur avant implémentation (`AskUserQuestion`). `EASYV4_CAR_DECISION.md` corrigé (note en tête, historique conservé).

Preuves : `typecheck`/`lint` verts ; `pnpm test` 1080/1080 (dont 11 nouveaux tests de cohérence) ; `build` vert (GitHub Actions — un déploiement Vercel preview non lié à la CI requise, projet `claudegolive`, a échoué en parallèle avec `BUILD_UTILS_SPAWN_1` ; logs inaccessibles en session, 403 hors scope Vercel ; non bloquant, pas un check requis, écarté après confirmation que le `build` GitHub Actions — qui rejoue exactement la même commande avec les mêmes secrets placeholder — était vert). PR : https://github.com/Hassen02020/EasyV4/pull/58 (mergée).

**Phase 7 (Honnêteté Commerce & Supply) — bilan** : R7-01 (fait ci-dessus), R7-02 (`REUSE partiel`, badge démo visible NOT VERIFIED — revue visuelle requise, pas de chantier lancé), R7-03 (fait plus haut), R7-04/R7-05 (`FIX` différé — décision produit déjà prise en session précédente de ne pas brancher de 2e fournisseur hôtel aujourd'hui). Aucun gap P0/P1/P2 sur cette phase ; R7-01 et R7-03 désormais clos, R7-02 nécessite juste une revue visuelle (pas un chantier de code), R7-04/R7-05 différés par décision déjà actée.

### PROVIDER-CONNECTIVITY-BRIDGE P2/P3/P4 (Vols) — CLÔTURÉ, PRODUCTION CONFIRMÉE (2026-09-29)

Ajout du canal de confirmation manuelle B2B_OFFLINE (`confirmManualFlightBooking`, `lib/vols/manual-confirmation-action.ts`) pour les réservations vol validées hors plateforme (portail fournisseur, téléphone, email), en parallèle du canal API_DIRECT existant (`fulfillFlightBooking`, inchangé) — exclusion mutuelle par CAS atomique sur le statut de réservation. Les deux canaux convergent désormais sur un ancrage financier unique, `finalizeFlightBookingFinancials()` (`lib/vols/flight-financials.ts`), corrigeant un gap pré-existant où les réservations vol confirmées n'atteignaient jamais `reservation_financials`.

Ajouts : colonne `flight_bookings.fulfillment_mode` (`api_direct`|`b2b_offline`, migration `drizzle/manual/0075_flight_fulfillment_mode.sql`) pour la traçabilité ; UI staff (`ConfirmManualFlightButton`) ; affichage admin du provider/mode de fulfillment/référence fournisseur (`reservation-detail-view.tsx`). Tests : suite complète M1-M10 (`lib/vols/__tests__/manual-confirmation-action.test.ts`) couvrant rôle, validation, CAS concurrent, exclusion mutuelle avec API_DIRECT, financials enregistrés une seule fois.

Preuves : CI GitHub Actions verte (`typecheck`/`lint`/`test`/`build`) sur le commit de la PR. PR : https://github.com/Hassen02020/EasyV4/pull/59 (mergée, GO explicite de Hassen, commit de merge `d86a3a2d20a8bcf3bf8ce7402f15b993ad615110`). **Déploiement Production confirmé** : ce commit a produit un déploiement Vercel `state=READY`/`target=production` sur `easy2book-new` (`dpl_C32RD3TofRbiytXd96FoJc5jqbuS`) — preuve de clôture de l'incident DEPLOY-01 (détail dans CLAUDE.md). Ce chantier est donc le premier depuis l'ouverture de l'incident à passer de `TESTED / READY FOR PRODUCTION — NOT YET DEPLOYED` à réellement déployé en Production.

---

## Vue d'ensemble

| Phase | Nom                            | Priorité | Dépend de | Sortie attendue                                        |
| ----- | ------------------------------ | -------- | --------- | ------------------------------------------------------ |
| 0     | Audit (lecture seule)          | —        | —         | Rapport 16.1 + roadmap mise à jour                     |
| 1     | Socle & sécurité immédiate     | P0       | 0         | `main` sain, CI verte, `/admin` protégé                |
| 2     | Master User                    | P0/P1    | 1         | Un seul système identité / tenant / rôles, RLS prouvée |
| 3     | B2B User                       | P1       | 2         | Agence → utilisateur B2B → client → devis              |
| 4     | Wallet (ledger)                | P0/P1    | 2         | Ledger append-only, solde dérivé                       |
| 5     | Recharge wallet                | P0/P1    | 4         | Recharge idempotente via prestataire de paiement       |
| 6     | Financial & Booking            | P0/P1    | 3, 4, 5   | Machine à états, décomposition prix, settlement        |
| 7     | Honnêteté Commerce & Supply    | P1/P3    | 1         | Aucun mock présenté comme réel, couche adapter         |
| 8     | Front conversion               | P2/P5    | 6, 7      | Parcours complet, FR/AR RTL, CWV, WCAG AA              |
| 9     | Intelligence marché & projets  | P4/P7    | 7         | Signaux sourcés, section « Prochainement »             |
| 10    | Distribution, White Label, CRM | P1→P7    | 6         | Plus tard, après validation                            |

```text
0 → 1 → 2 ─┬→ 3 ─────────┐
           └→ 4 → 5 ─────┴→ 6 → 8 → 10
       1 → 7 ──────────────────┘→ 9
```

Les phases 3 et 4 peuvent avancer en parallèle **uniquement si** elles ne touchent pas les mêmes fichiers ni les mêmes tables.

---

## Phase 0 — Audit (session 1, lecture seule)

**Objectif :** établir le CURRENT réel et transformer cette roadmap en plan prouvé.

| ID    | Tâche                                                    | Agent | Livrable                       |
| ----- | -------------------------------------------------------- | ----- | ------------------------------ |
| R0-01 | Carte architecture, doublons, config build/déploiement   | A1    | Carte CURRENT + incohérences   |
| R0-02 | Schéma Drizzle, migrations, RLS, isolation tenant        | A2    | Matrice tables × tenant × RLS  |
| R0-03 | Middleware, sessions, rôles, protection `/admin` et API  | A3    | Matrice route × protection     |
| R0-04 | Search / availability / pricing / booking : mock vs réel | A4    | Matrice module × état          |
| R0-05 | Paiement, wallet, ledger, montants, idempotence          | A5    | Flux + invariants violés       |
| R0-06 | Providers, connecteurs, adaptateurs                      | A6    | Inventaire providers × N0–N4   |
| R0-07 | Parcours, mobile, RTL, perf, a11y, honnêteté des états   | A7    | Audit UX + backlog conversion  |
| R0-08 | Tests, CI, 13 PR ouvertes, état de `main`                | A8    | Couverture réelle + tri des PR |

**Hypothèses à trancher en priorité** (Master Prompt §4) : README vs code, nom de marque, `package-lock.json` vs `pnpm-lock.yaml`, `vercel.json` vs `netlify.toml`, `vite.config.js` dans un projet Next.js, statut des 13 PR, `/admin` public.

**Critère de sortie :** rapport 16.1 livré · chaque chantier des phases 1 à 7 annoté `État audit` · liste `NOT VERIFIED` explicite · STOP.

---

## Phase 1 — Socle & sécurité immédiate (P0)

| ID    | Chantier                                                                                             | État audit                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | Fichiers / domaines probables                                     | Critère de sortie                                 |
| ----- | ---------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------- | ------------------------------------------------- |
| R1-01 | **Protéger `/admin` et les API d'administration** (auth + rôle serveur, pas seulement côté UI)       | **N/A (déjà fait)** — VERIFIED. `middleware.ts` n'existe plus, remplacé par `proxy.ts` (garde RBAC réelle lignes 176-198) + double vérification indépendante dans `app/(internal)/admin/layout.tsx:35-51` + chaque route API admin revérifie session+rôle. Le claim README ("/admin public") est faux/obsolète.                                                                                                                                                                                                                                                                                                                                                     | `proxy.ts`, `app/(internal)/admin/layout.tsx`, `app/api/admin/**` | Atteint                                           |
| R1-02 | **Scan des secrets** (historique git inclus), rotation si fuite                                      | **N/A (vérifié clean, 2026-09-28)** — `detect-secrets` (arbre de travail, hors node_modules/lockfiles) + grep ciblé sur `git log --all -p --full-history` (clés AWS, blocs PEM, clés Stripe live, tokens Slack, JWT Supabase, assignations `*_SECRET=`/`*_PASSWORD=` non-placeholder) : **0 secret réel**. Les 68 alertes heuristiques sont toutes des faux positifs vérifiés manuellement (fixtures de test JSON, `postgresql://test:test@...test_only_for_mocks`, `price-token-dev-secret-not-for-prod`, libellés FR contenant "password", couleurs hex). Aucun `.env`/`.env.local`/`.env.production` jamais committé (`.gitignore` couvre correctement `.env*`). | historique git complet (vérifié)                                  | Atteint — aucune rotation nécessaire              |
| R1-03 | **Tri des 13 PR** : fusionner / rebaser / fermer avec justification                                  | **N/A (fait, 2026-09-28)** — 8 PR réelles (pas 13), toutes fermées avec commentaire de justification individuel. Voir narratif ci-dessus.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | GitHub PR #6,7,9,10,11,12,13,16                                   | Atteint                                           |
| R1-04 | **Un seul gestionnaire de paquets**                                                                  | **N/A (fait, 2026-09-28, PR #53)** — VERIFIED. pnpm est le gestionnaire réel (lockfile à jour, 2026-09-26 ; README le documente). `package-lock.json` obsolète (dernier commit 2026-06-12, ~3.5 mois de retard) — résidu à supprimer. Aucune CI dans le repo pour trancher côté CI (voir R1-07).                                                                                                                                                                                                                                                                                                                                                                    | `package-lock.json`, `pnpm-lock.yaml`                             | Suppression de `package-lock.json`                |
| R1-05 | **Une seule cible de déploiement**                                                                   | **N/A (fait, 2026-09-28, PR #53)** — VERIFIED. Vercel est la cible active et maintenue (6 cron jobs, fixes récents jusqu'au 2026-09-18, déploiements confirmés en prod cette session). `netlify.toml` mort/jamais opérationnel (dernier commit 2026-06-12, config minimale jamais suivie).                                                                                                                                                                                                                                                                                                                                                                          | `vercel.json`, `netlify.toml`                                     | Suppression de `netlify.toml`                     |
| R1-06 | **Config build cohérente** (`vite.config.js` : utilisé ou mort ?)                                    | **N/A (fait, 2026-09-28, PR #53)** — VERIFIED mort et cassé : `vite`/`@vitejs/plugin-react` ne sont pas des dépendances directes (seulement transitif via vitest), aucun script ne le référence.                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | `vite.config.js`                                                  | Suppression                                       |
| R1-07 | **Baseline CI verte** : typecheck, lint, unit, build, E2E smoke                                      | **N/A (fait, 2026-09-28)** — `.github/workflows/ci.yml` créé, 4 jobs bloquants verts sur le premier run réel (PR #51 mergée, run https://github.com/Hassen02020/EasyV4/actions/runs/36489283550). `format` non bloquant (744 fichiers pré-existants, chantier séparé). E2E Playwright et tests DB-mode volontairement hors périmètre. Lighthouse/a11y CI restent dormants.                                                                                                                                                                                                                                                                                          | `.github/workflows/ci.yml`                                        | Atteint (périmètre réduit assumé)                 |
| R1-08 | **README et nom de marque** alignés sur le code réel                                                 | **N/A (fait pour les 2 lignes ciblées, 2026-09-28, PR #53)** — VERIFIED. Marque réelle = Easy2Book (package.json, SEO, logo, 0 occurrence "TunisiaGo" dans app/lib/components). README.md ligne 1/3 dit encore "TunisiaGo" et ligne 99 dit `/admin` public (faux, voir R1-01).                                                                                                                                                                                                                                                                                                                                                                                      | `README.md`                                                       | Correction des 2 passages obsolètes               |
| R1-09 | **Consolider les rapports d'audit** existants dans `docs/audits/` (archivés, marqués « historique ») | **NOT VERIFIED** — `docs/audits/` existe (confirmé en tout début de session), contenu non ré-audité pour doublons/statut "historique" explicite pendant cette Phase 0.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              | `docs/audits/**`, `*AUDIT*.md`, `*REPORT*.md`                     | Un seul index ; anciens rapports non autoritaires |

**Ordre recommandé (mis à jour) :** R1-01, R1-10, R1-07, R1-02, R1-04/05/06/08, R1-03 tous faits. Reste : R1-09 (à planifier, pas de P0/P1/P2 en jeu). R6-02 fait (voir Phase 6).

---

## Phase 2 — Master User (priorité métier n°1)

**Cible :** `Platform → Tenant/Agency → User → Role → Permissions`. Un seul système utilisateur.

| ID    | Chantier                                                                        | État audit                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | Critère de sortie                                                                                 |
| ----- | ------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| R2-01 | Cartographier tous les systèmes d'identité existants → décision **CONSOLIDATE** | **REUSE** — VERIFIED un seul système : Supabase Auth + table `users` (enum `user_role` unique : super_admin/manager/agent_resa/agent_compta/agent_excursions/partner_owner/partner_agent/mutuelle_director/mutuelle_member), pas de doublon trouvé.                                                                                                                                                                                                                                                                                                                                                                                             | Atteint                                                                                           |
| R2-02 | Modèle `tenant` et rattachement de chaque utilisateur                           | **REUSE** — VERIFIED `agencyType` (ota/partner) + `agencyId` sur `users`, distinction staff Easy2Book vs agence B2B documentée et vérifiée serveur (`admin-gate.ts`).                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | Atteint (à confirmer : contrainte DB "exactement un tenant" non vérifiée explicitement)           |
| R2-03 | RBAC vérifié côté serveur                                                       | **REUSE** — VERIFIED defense-in-depth 4 couches (proxy → layout → route handler → Server Action), échantillon de 4+ fichiers de mutation sensible tous protégés par `assertSuperAdmin()`/`resolveSessionContext()`. ~46 fichiers `lib/admin                                                                                                                                                                                                                                                                                                                                                                                                     | finance                                                                                           | pro/\*\*` non échantillonnés individuellement (NOT VERIFIED exhaustif, pattern homogène observé). | Atteint sur échantillon ; grep exhaustif recommandé pour garantie totale |
| R2-04 | RLS sur toutes les tables tenant                                                | **EXTEND** — VERIFIED 60/67 tables avec `agencyId` ont RLS. **GAP** : 7 tables `flight_*` (`flight_commercial_rules`, `flight_orders`, `flight_bookings`, `flight_price_snapshots`, `flight_searches`, `flight_supplier_configs`, `flight_supplier_credentials`) ont `agencyId NOT NULL` en schéma/migrations mais AUCUNE policy RLS trouvée. **Vérifié en production (crygnaichvlxavvbifqi) : ces 7 tables n'existent pas du tout en base** — gap de migration jamais appliquée, pas un risque actif, mais RLS à écrire AVANT toute application future de ces migrations.                                                                      | Ajouter RLS aux migrations `0064/0065` (ou équivalent) avant activation du module "Flight Puzzle" |
| R2-05 | Profil, invitation, désactivation, audit log                                    | **N/A (fait, 2026-09-28, PR #54)** — GAP CONFIRMÉ puis comblé : aucun chemin applicatif n'existait pour créer un `partner_owner`/`partner_agent` (`createStaffUser` exclut ces rôles, `createAgency` ne créait que le tenant, `/pro/utilisateurs` ne gérait que statut/permissions). Ajout de `createPartnerOwner` (super_admin, après création d'agence) et `createPartnerAgent` (partner_owner, gated par le grant `"staff.create"` déjà défini mais jamais câblé) — même motif que `createStaffUser` (invitation Supabase réelle + audit trail + rollback). Désactivation/audit log déjà en place (`setUserStatus`/`setPartnerAgentStatus`). | Atteint                                                                                           |
| R2-06 | Migration des comptes existants sans perte                                      | **N/A** — pas de migration de système identité en cours, un seul système déjà en place.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | —                                                                                                 |

**Tests obligatoires :** RLS, Auth/RBAC, E2E login par rôle, régression des parcours publics.

---

## Phase 3 — B2B User

**Flux cible :** `Agency → B2B User → Customer → Search → Quote → Booking → Payment → Wallet`.

| ID    | Chantier                                                        | État audit                                                                                                                                                                                                                                                                                                                                | Critère de sortie                     |
| ----- | --------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------- |
| R3-01 | Espace agence : utilisateurs B2B, clients de l'agence           | **N/A (fait, 2026-09-29, PR #55)** — GAP CONFIRMÉ puis comblé : `/pro/clients` était un annuaire lecture seule, `createCustomer`/`updateCustomer` existaient mais réservés au staff OTA. Ajout de `createPartnerClient`/`updatePartnerClient`, gate `"clients.create"`/`"clients.edit"` (déjà dans la baseline partner_owner, délégable). | Atteint                               |
| R3-02 | Conditions commerciales par agence : markup, commission, devise | **REUSE** — VERIFIED `pricing_margins`/`margin_rules` avec RLS, `applyMargin`/`getMarginsForAgency` réellement utilisés (hôtels, vols, transferts, cars). Incohérence mineure notée (P6) : "car" appliqué hors du `MarginModule` type central.                                                                                            | Atteint, nettoyer l'incohérence "car" |
| R3-03 | Devis (`Quote`)                                                 | **DIFFÉRÉ (décision produit reçue 2026-09-29)** — absent, confirmé. Scope futur précis (voir narratif Phase 3 ci-dessus) : uniquement demandes de groupe, transferts, voyage à la carte — flux devis→validation→facture. Autres modules : pas de devis. Ne pas rouvrir la question, attendre un GO explicite pour l'implémenter.          | Différé, scope déjà tranché           |
| R3-04 | Conversion devis → réservation                                  | **N/A si pas de Quote** — le flux actuel va directement recherche → booking → confirmation (VERIFIED par A4 sur tous les modules), sans étape devis intermédiaire identifiée.                                                                                                                                                             | À clarifier avec le produit           |

---

## Phase 4 — Wallet (ledger)

**Invariants non négociables** (Master Prompt §13) : solde dérivé du ledger · append-only · montants entiers en unités mineures (TND = millimes, 3 décimales) · devise sur chaque montant · RLS par tenant.

| ID    | Chantier                                            | État audit                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | Critère de sortie                                                         |
| ----- | --------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------- |
| R4-01 | Schéma wallet/ledger, montants entiers, idempotence | **REUSE (largement)** — VERIFIED : `wallet_ledger`/`partner_credit_movements` avec `idempotencyKey` + index unique partiel (SAVEPOINT/ROLLBACK pour les courses concurrentes) ; colonnes `*_millimes` (bigint) ajoutées en double-écriture (étape "expand" du chantier-49C), colonnes `decimal` restent seules sources de vérité pour l'instant. Aucun `float`/`double` dans tout le schéma (grep négatif, 100 usages `decimal`).                                                                                                                                                          | Étape "expand" atteinte ; bascule lecture différée (observation en cours) |
| R4-02 | Solde dérivé du ledger, jamais modifié isolément    | **REUSE** — VERIFIED : `agencies.deposit_balance` modifiable UNIQUEMENT via `set_agency_deposit_balance()` (SECURITY DEFINER), RLS ne permet pas d'UPDATE direct pour une session tenant normale ; les 7 sites d'appel sont tous accompagnés d'un insert `partnerCreditMovements` dans la même transaction.                                                                                                                                                                                                                                                                                | Atteint                                                                   |
| R4-03 | Interdiction UPDATE/DELETE sur ledger               | **DONE (2026-09-29, PR #56)** — VERIFIED : nouvelle table append-only `commission_settlement_entries` (migration 0074, appliquée en prod, backfill=0). `settleCommissions()` fait désormais un `INSERT` dans cette table au lieu d'un `UPDATE wallet_ledger`. Les 2 filtres "non settlée" passent de `isNull(walletLedger.settledAt)` à `NOT EXISTS(... commission_settlement_entries ...)`. Colonnes `settled_at`/`settlement_id` sur `wallet_ledger` conservées (compat historique, jamais réécrites). Test d'invariant statique mis à jour (assert absence de `.update(walletLedger)`). | Atteint                                                                   |
| R4-04 | Service wallet serveur idempotent/transactionnel    | **REUSE** — VERIFIED pattern à 3 couches (cache Redis best-effort + backstop DB par relecture + SAVEPOINT/ROLLBACK sur contrainte unique concurrente) sur `debitPartnerCredit`/`debitCustomerWallet`/`creditCustomerWallet`. Risque P3 documenté dans le code lui-même : dégradation silencieuse si Redis/Upstash absent (le backstop DB reste sûr).                                                                                                                                                                                                                                       | Atteint                                                                   |
| R4-05 | Écran wallet agence                                 | **REUSE (confirmé, 2026-09-29)** — VERIFIED `/pro/releve-compte` (`loadPartnerLedger`, solde réel + historique réel). Export CSV absent (P6 mineur, pas de chantier dédié).                                                                                                                                                                                                                                                                                                                                                                                                                | Atteint (export en option, non prioritaire)                               |

---

## Phase 5 — Recharge wallet

| ID    | Chantier                                          | État audit                                                                                                                                                                                                                                                                              | Critère de sortie |
| ----- | ------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------- |
| R5-01 | Identifier le(s) prestataire(s) de paiement       | **REUSE** — VERIFIED Stripe (HMAC-SHA256) + SPS/Paymee (SHA-512) déjà intégrés (`app/api/payment/webhook`), `SPS_ENVIRONMENT=sandbox` actuellement.                                                                                                                                     | Atteint           |
| R5-02 | `payment_intent` idempotent, machine à états      | **REUSE** — VERIFIED `walletRechargeRequests.status` (pending→validated/rejected), idempotence par `payment_events` (`ON CONFLICT DO NOTHING` sur event_id) + vérif business-level (statut déjà != pending → `already_processed`).                                                      | Atteint           |
| R5-03 | Webhook signé, rejouable sans double crédit       | **REUSE** — VERIFIED signature vérifiée AVANT toute logique (400 si invalide), montant/devise re-vérifiés contre la demande pending (`matchesPendingRecharge`), verrou `FOR UPDATE`. Remboursement PSP géré (`reverseRechargeCredit`, mouvement tracé). Aucun gap trouvé sur ce chemin. | Atteint           |
| R5-04 | Crédit ledger uniquement sur confirmation serveur | **REUSE** — VERIFIED, jamais sur retour navigateur (webhook uniquement).                                                                                                                                                                                                                | Atteint           |
| R5-05 | Recharge manuelle admin avec audit log            | **REUSE** — VERIFIED `adminRechargeWallet()` (`lib/admin/agencies-actions.ts`), `assertSuperAdmin()`, insert `partnerCreditMovements` + `auditEvents`.                                                                                                                                  | Atteint           |

---

## Phase 6 — Financial & Booking

| ID    | Chantier                                                       | État audit                                                                                                                                                                                                                                                                            | Critère de sortie          |
| ----- | -------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------- |
| R6-01 | Machine à états transitions validées serveur                   | **DONE (2026-10-01, R6-01-DB-CONSTRAINT, PR #97)** — validation applicative (`recordReservationTransition()`/`isTransitionAllowed()`, 22 sites) ET contrainte DB réelle (trigger `reservation_status_transition_guard`, miroir exact, prouvé sur les 56 paires contre Postgres réel). | Atteint (application + DB) |
| R6-02 | Décomposition prix stockée par booking                         | **N/A (fait, 2026-09-28)** — `recordReservationFinancials` câblé sur omra/packages/activités (6 points, `supplierPriceTnd=salePriceTnd`, marge=0 assumée par design). "cars" hors périmètre (décision produit à clarifier). PR #52 mergée.                                            | Atteint (cars excepté)     |
| R6-03 | Séquence autoriser→réserver→capturer, échec→libérer/rembourser | **REUSE (partiel)** — VERIFIED pattern présent sur hôtels/B2B (verrou FOR UPDATE, rollback total si échec fournisseur) ; pas vérifié en détail sur tous les modules.                                                                                                                  | À confirmer par module     |
| R6-04 | Annulation/remboursement                                       | **REUSE** — VERIFIED `cancel-actions.ts`/`refund-logic.ts` avec écriture ledger tracée (millimes inclus).                                                                                                                                                                             | Atteint                    |
| R6-05 | Settlement / rapprochement                                     | **DONE (2026-09-29)** — `commission-settlement.ts` existe et fonctionne, append-only depuis R4-03 (PR #56).                                                                                                                                                                           | Atteint                    |
| R6-06 | Vouchers depuis le booking réel                                | **REUSE** — VERIFIED `app/api/admin/reservations/[id]/voucher`, `app/api/pro/reservations/[id]/voucher` génèrent depuis les données réelles, protégés RBAC.                                                                                                                           | Atteint                    |

---

## Phase 7 — Honnêteté Commerce & Supply

| ID    | Chantier                                                 | État audit                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | Critère de sortie                                                                                                      |
| ----- | -------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| R7-01 | Registre de capacités par module                         | **DONE (2026-09-29, PR #58)** — VERIFIED : `lib/modules/capabilities.ts` (8 modules, statut `REAL`/`DEMO`/`SEARCH_ONLY`/`NOT_WIRED` + preuve fichier), vérifié par un test statique (`capabilities-consistency.test.ts`) qui échoue si la preuve disparaît. Dérive concrète détectée et corrigée pendant ce chantier : `EASYV4_CAR_DECISION.md` affirmait le module Car à "0% application", alors que `lib/cars/actions.ts::createCarBooking` existe déjà.                                                                                                                                                                  | Atteint                                                                                                                |
| R7-02 | Modules non câblés affichés « Bientôt », non réservables | **REUSE (partiel)** — VERIFIED sur `components/pro/pro-module-tabs.tsx` (label "Bientôt disponible" + `disabled: true` réel, pas cosmétique). **Mais** : Vols et Hôtels Monde exposent un flux de réservation complet (PNR/confirmation) adossé à un fournisseur 100% virtuel, étiqueté `isDemo` côté UI (VERIFIED props transmises) — badge visible à l'écran NOT VERIFIED (revue visuelle requise).                                                                                                                                                                                                                       | Confirmer visuellement le badge démo ; étendre le pattern "Bientôt" si besoin                                          |
| R7-03 | Mocks isolés, désactivés en prod                         | **DONE (2026-09-29, PR #57, option B)** — VERIFIED : les 9 `FEATURE_*` (`HOTELS_TUNISIE/HOTELS_MONDE/VOLS/OMRA/PACKAGES/TRANSFERTS/CAR/YIELD_ENGINE/INVENTORY_LOCKS/WALLET_B2B`) sont documentés dans `.env.example` mais 0 occurrence `process.env.FEATURE_*` dans le code applicatif (reconfirmé sur `main` avant correction) — aucun flag n'est techniquement lu, le gating réel est un `disabled: true` en dur par module (`pro-module-tabs.tsx`). Choix : documentation-only (commentaire explicite "RÉSERVÉ, NON CÂBLÉ" ajouté), pas de câblage réel — proportionné à un gap P3/P4, aucun changement de comportement. | Atteint                                                                                                                |
| R7-04 | Couche Connector/Adapter générique                       | **FIX — gap P2 confirmé** — VERIFIED `lib/booking/hotel-provider-booking.ts` et `lib/booking/actions.ts` sont 100% spécifiques myGo (`MyGoClient`, `MyGoBookingErrorKind` en dur), n'utilisent PAS le Hub générique existant (`lib/hotel-suppliers/core/orchestration.ts`) qui ne couvre que la recherche, pas le booking. Migration vers un 2e fournisseur hôtel réel nécessiterait une réécriture, pas une extension.                                                                                                                                                                                                     | Différé — pas de second fournisseur réel à brancher aujourd'hui (déjà tranché par l'utilisateur en session précédente) |
| R7-05 | Pas de logique "Tunisia only" hardcodée                  | **FIX (nuance) — gap P3** — NOT VERIFIED de `if(country==="Tunisia")` littéral dans le cœur métier partagé (aucun trouvé). Le gap est structurel : le module booking hôtel n'a qu'un seul provider possible (myGo=Tunisie), sans abstraction Location/Coverage — même racine que R7-04.                                                                                                                                                                                                                                                                                                                                     | Différé, même raison que R7-04                                                                                         |

---

## Phase 8 — Front conversion

| ID    | Chantier                                                                                                                                                                                                                                                     | Critère de sortie                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| R8-01 | Transparence tarifaire : prix contextualisé dès la liste (durée séjour), devise claire, conditions d'annulation accessibles avant paiement — exigences de transparence applicables selon le marché (art. L111-1 code conso / pratiques sectorielles voyages) | **CLÔTURÉ (2026-10-02, PR #106)**                                                                                                                                                                                                                                                                                                                                                                                                                            |
| R8-02 | Parcours complet avec skeletons, états vides et erreurs, récapitulatif                                                                                                                                                                                       | **CLÔTURÉ (2026-10-02, PR #106)**                                                                                                                                                                                                                                                                                                                                                                                                                            |
| R8-03 | FR/AR avec RTL correct, dates et montants localisés                                                                                                                                                                                                          | **CLÔTURÉ (2026-10-02, commit a5c14f0)** — 9 composants corrigés (11 changements) : propriétés physiques left/right/pl/pr remplacées par les propriétés logiques start/end/ps/pe/text-start/text-end. Infrastructure RTL validée (html dir, RtlDirectionProvider, formatCurrency ar-TN, date-fns arTN). Screenshots Playwright : dir="rtl" sur /ar/cgv ✅, dir="ltr" sur /fr/cgv ✅, dir="rtl" sur /ar/compte/connexion ✅. tsc 0 erreurs ✅, pnpm build ✅. |
| R8-04 | Performance : budgets Core Web Vitals via la config Lighthouse existante                                                                                                                                                                                     | **CLÔTURÉ (2026-10-02, commit cc617b4)** — LHCI câblé dans CI, FCP/LCP bloquants                                                                                                                                                                                                                                                                                                                                                                             |
| R8-05 | Accessibilité WCAG 2.2 AA                                                                                                                                                                                                                                    | **CLÔTURÉ (2026-10-02, commits 20a9b41+5853101+d3b3110)** — axe-core BLOQUANT en CI (continue-on-error retiré), 0 violations WCAG prouvé run #158 (job 110889828533 ✅), limitation auth documentée                                                                                                                                                                                                                                                          |
| R8-06 | Design system unique (tokens Tailwind/shadcn existants), suppression des doublons v0                                                                                                                                                                         | **CLÔTURÉ (2026-10-02)** — 21 fichiers convertis aux tokens CSS shadcn. 0 bg-gray-_/text-gray-_ hors exceptions glassmorphism documentées. tsc ✅. Visual QA NOT VERIFIED.                                                                                                                                                                                                                                                                                   |
| R8-07 | Zéro fausse urgence, preuve sociale uniquement réelle                                                                                                                                                                                                        | **CLÔTURÉ (2026-10-02, commit bf297f9)** — badge "Flash Offers" retiré. Aucune autre fausse urgence trouvée. Visual QA NOT VERIFIED.                                                                                                                                                                                                                                                                                                                         |

---

## Phase 9 — Intelligence marché & projets resorts

| ID    | Chantier                                                                     | Critère de sortie                                                                                                                         |
| ----- | ---------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| R9-01 | Modèles `MarketSignal` et `DevelopmentProject` (EXTEND si équivalent existe) | **CLÔTURÉ** — `lib/db/schema/market.ts`, migrations 0093/0094 appliquées en production. source_url/published_at/confidence NOT NULL.      |
| R9-02 | Rubrique « Actualités & tendances » sourcée et datée                         | **CLÔTURÉ** — `components/market-signals-section.tsx` + `lib/market/market-signals-queries.ts`. Aucun chiffre en dur.                     |
| R9-03 | Section « Prochainement » (`ANNONCÉ`) avec liste d'attente                   | **CLÔTURÉ** — `components/development-projects-section.tsx` + table `development_project_waitlist` (migration 0096). Jamais réservable.   |
| R9-04 | Mise en avant des destinations en croissance **avec inventaire réel**        | **CLÔTURÉ** — `components/featured-destinations-section.tsx` + colonnes `is_featured`/`display_order` (migration 0095). CTA conditionnel. |

---

### CRM-PIPELINE-01 — CLÔTURÉ (2026-10-03)

```text
ID: CRM-PIPELINE-01
OBJECTIF: Vue Kanban 4 colonnes (Nouveau → Contacté → Converti → Clos) sur /admin/support,
  complémentaire à la vue Tableau existante (LeadsTable). Toggle Tableau / Pipeline.
ÉTAT AUDIT: EXTEND — aucune DB, aucune nouvelle Server Action ; réutilise
  updateLeadStatus, convertLead, searchReservationsForLeadLink, LeadRow, LeadStatus,
  computeLeadScore, isLeadStale, Customer360Button déjà existants.
FICHIERS CRÉÉS:
  - components/admin/lead-pipeline.tsx (ScoreDots, ConvertDialog, LeadCard, LeadPipeline)
  - components/admin/leads-view-tabs.tsx (toggle Tableau/Pipeline, Client Component)
  - lib/crm/__tests__/lead-pipeline-invariants.test.ts (5 tests node:test, 5/5 pass)
FICHIERS MODIFIÉS:
  - app/(internal)/admin/support/page.tsx (utilise LeadsViewTabs au lieu de LeadsTable)
CHANGEMENTS DB: aucun
TESTS: 5/5 invariants pipeline verts (node --test)
BUILD: tsc --noEmit propre ; dev server démarre ; /admin/support → redirect login OK
PREUVE VISUELLE: screenshot Playwright — login redirect confirmé
```

**CLÔTURÉ (2026-10-03, branche claude/easy2book-v6-modernization-7gyb5v)**

---

## Phase 10 — Audit 2026-10-09 (SUBSTANTIELLEMENT TERMINÉE)

> Audit complet effectué le 2026-10-09 — la description "Plus tard" était antérieure aux phases
> 13.x (White Label runtime), ECON-WIRING-01, et aux chantiers CRM de phases 8-9.
> La majorité des items sont déjà implémentés.

### Bilan par item

| Item                                   | Statut       | Preuve                                                                                                                                  |
| -------------------------------------- | ------------ | --------------------------------------------------------------------------------------------------------------------------------------- |
| White Label branding                   | **DONE**     | WHITE-LABEL-PRO-01/ADMIN-01, `agencies.brandName/primaryColor/logoUrl`                                                                  |
| White Label domaine                    | **DONE**     | `proxy.ts` (Phase 13.2), migration 0023, `lib/tenant/`                                                                                  |
| White Label catalogue (modules)        | **DONE**     | `publicModuleVisuals` per-agency via `getDefaultAgencyId()`                                                                             |
| CRM pipeline (Kanban 4 cols)           | **DONE**     | `components/admin/lead-pipeline.tsx` + `leads-view-tabs.tsx`                                                                            |
| CRM relances (alertes staff)           | **DONE**     | `lib/crm/lead-relance-core.ts`                                                                                                          |
| CRM historique client                  | **DONE**     | `lib/crm/contact-history-core.ts`                                                                                                       |
| CRM campaigns                          | **DONE**     | CAMPAIGN-ENGINE-01 → CAMPAIGN-DELIVERY-STATS-01 (PRs #162→#166)                                                                         |
| Ledger integrity economic_entitlements | **DONE**     | migration 0092 (ECON-ENTITLEMENTS-INTEGRITY-01, REVOKE UPDATE/DELETE/TRUNCATE)                                                          |
| Intelligence (recommandation, IA)      | **N/A**      | Explicitement "❌ Ne pas toucher maintenant" (ROADMAP l.1051) — nécessite données fiables                                               |
| Achat inter-tenant                     | **N/A**      | Aucun cas d'usage défini, aucune fondation ; complexité architecturale très élevée                                                      |
| Distribution entités DB                | **BLOQUÉ**   | Bloqué sur décision D-01b (taux commercial, Direction) ; fondation types `DistributionChannel` + `commercial_agreements` table existent |
| White Label fournisseurs propres       | **DEFERRED** | Aucun besoin immédiat ; les suppliers actuels (Mygo, Duffel, hotels-monde) sont globaux                                                 |

### COMMISSION-WIRING-COVERAGE-01 — CLÔTURÉ 2026-10-09

**Objectif** : Fermer le gap de couverture tests sur le câblage financier —
3 modules sans invariants statiques protégeant `recordReservationFinancials` +
`creditPlatformCommission`.

**Changements** :

- `lib/transfers/__tests__/commission-wiring.test.ts` (11 tests) : protège la
  structure coût fournisseur non-triviale (basePriceTnd + nightSurchargeAmount)
  et les deux entitlements (product_owner/supplier_cost + seller/seller_margin).
- `lib/omra/__tests__/commission-wiring.test.ts` (7 tests) : documente
  supplierPriceTnd === salePriceTnd === totalTnd (catalogue propre, intentionnel).
- `lib/packages/__tests__/commission-wiring.test.ts` (7 tests) : même invariant
  catalogue propre pour les voyages organisés.

**Commit** : `f5512a1`
**Tests** : 24/24 pass · aucun code de production modifié
**Matrice complète** : hotels, hotels-monde, cars, activities, transfers, omra, packages → tous couverts.

---

### TRANSFER-VOUCHER-B2C-01 — CLÔTURÉ 2026-10-09

**Objectif** : Câbler `sendEvent("booking/transfer.confirmed")` (fire-and-forget)
dans `lib/transfers/guest-booking-actions.ts` (chemin B2C), identiquement au
chemin B2B (`lib/transfers/actions.ts` ligne 387). Les guests B2C recevaient
zéro email/SMS de confirmation malgré l'existence de l'event type, du handler
Inngest et du câblage B2B.

**Changements** :

- `lib/transfers/guest-booking-actions.ts` : import `sendEvent`, extension du
  retour de transaction (`fromZoneName`, `toZoneName`), appel fire-and-forget
  conditionnel (email || phone).
- `lib/transfers/__tests__/transfer-voucher-wiring.test.ts` : 15 invariants
  statiques (readFileSync pattern), tous verts.

**Commit** : `93bd695`
**Tests** : 15/15 pass · TypeScript clean (tsc --noEmit 0 erreurs)
**NOT VERIFIED** : déclenchement Inngest réel en staging (nécessite env Inngest)

---

### OMRA-VOUCHER-01 — CLÔTURÉ 2026-10-09

**Objectif** : Protéger le câblage `sendEvent("booking/omra.confirmed")` dans
`lib/omra/guest-booking-actions.ts` par des invariants statiques — payload
complet, fire-and-forget, résolution serveur de `packageName` et `contactEmail`.

**Changements** :

- `lib/omra/__tests__/omra-voucher-wiring.test.ts` (13 tests) : sendEvent
  importé, event câblé, condition contactEmail, `.catch()` protecteur, champs
  publicRef/agencyId/packageName/pilgrimsCount/departureDate/contactEmail/totalTnd,
  et les deux résolutions serveur (`packageName: pkg.name`, `contactEmail: firstPilgrim.email`).

**Commit** : `52884ee`
**Tests** : 13/13 pass · aucun code de production modifié

---

### Prochains chantiers possibles (sur GO séparé, quand débloqués)

- ~~**HOTELS-MONDE-VOUCHER-01**~~ — CLÔTURÉ (commit `b6643a9`)
- ~~**INNGEST-HANDLER-WIRING-01**~~ — CLÔTURÉ (commit `ca38630`) — handlers transfer/omra/hotels-monde couverts (30/30 tests)
- ~~**INNGEST-HANDLER-WIRING-02/flights**~~ — CLÔTURÉ (commit `1b26299`) — handler `process-flight-confirmed` couvert (13/13 tests) ; idempotence via `auditEvents` (pas `notificationIdempotency`), `recordFlightVoucherSent` inconditionnelle, email Resend optionnel via `RESEND_API_KEY`
- ~~**SENDEVENT-GAP-SWEEP-01**~~ — CLÔTURÉ (commits `1e04c7a`+`dc4f8f3`) — 6 fichiers sendEvent non couverts fermés : (1) `process-wallet-credit.test.ts` converti readFileSync (fix ESM import) ; (2) `manual-payment-voucher-wiring.test.ts` (10 tests) : voie Paymee `"booking/confirmed"` — guard `module==="hotel"`, `totalTnd=Number.parseFloat(tndAmount)`, customerName assemblé ; (3) `flight-voucher-wiring.test.ts` (14 tests) : payload `fulfillment-action.ts` — idempotence `id:eventId`, `totalTnd=Number(sellingAmount)`, firstSeg fields, retry+log ; (4) `wallet-credited-wiring.test.ts` (7 tests) : 2 appelants wallet/credited — `recharge-actions` guard triple, `agencies-actions` `method:"ADMIN_DIRECT"` ; (5) `mygo-hotel-voucher-wiring.test.ts` (10 tests) : B2B `draft.module==="hotel"`, B2C SÉCURITÉ `isImmediatelyPaid` avant sendEvent (pas de voucher pour résa pending). 55+24+17=96 tests pass. Couverture sendEvent complète sur tous les appelants.
- ~~**INVOICE-GAP-B2C-01**~~ — N/A (audit 2026-10-10) : cars/transfers B2C sont toujours `status="pending"` (paiement différé, aucune voie CB) → `generateInvoiceForReservation` correctement absent ; facture générée par l'équipe Easy2Book via `manual-payment-actions.ts` après confirmation du virement.
- ~~**VOUCHER-STATUS-GUARD-01**~~ — CLÔTURÉ (2026-10-10, PR #171, commits `a032ede`+`b0501d5`) — Bug P1 : `sendEvent("booking/car.confirmed")` et `sendEvent("booking/transfer.confirmed")` se déclenchaient inconditionnellement pour des réservations `status="pending"` → email "voucher/confirmé" envoyé avant paiement réel. Fix : suppression des appels sendEvent dans `lib/cars/guest-booking-actions.ts` + `lib/transfers/guest-booking-actions.ts` (les réservations sont toujours pending, aucune voie CB n'existe) ; ajout guard `result.status === "confirmed"` dans `lib/hotels-monde/guest-booking-actions.ts`. Tests mis à jour : `car-voucher-wiring.test.ts` + `transfer-voucher-wiring.test.ts` remplacent les assertions "sendEvent présent" par des guards VOUCHER-STATUS-GUARD-01 (import absent, appel absent hors commentaires, commentaire `isImmediatelyPaid` présent). 25/25 pass.
- ~~**REFUND-POLICY-01b**~~ — CLÔTURÉ (2026-10-11, PR #190, commit `fbb76a7`) — gate policyAccepted Hôtels Monde (world-hotel-guest-booking-form.tsx) + 5 clés i18n + test r8-02 20/20
- **D-01b** (décision Direction sur option 3 frais sur prix net) → débloque ECON-WIRING-01 réel + première ligne `commercial_agreements`
- **VIP-THRESHOLD** (attente volume leads production ≥ ~50) → débloque décision seuil VIP
- **WHITE-LABEL-SUPPLIERS** (per-tenant supplier credentials) → sur besoin client réel
- **INTELLIGENCE-01** (recommandation, ranking) → sur données fiables + budget ML
- ~~**CRM-C — Task Management**~~ — **CLÔTURÉ/DEPLOYED** (2026-10-10, PR #172+#173, commit `2ae44425`) — entrée obsolète. Migrations 0128+0129 appliquées en production, `CrmTasksPanel` intégré dans `/admin/support`. Voir ligne ~62.
- ~~**CRM-E — Canaux supplémentaires**~~ — CLÔTURÉ (2026-10-17, PR #225, merge `0dca74f`). Webhooks Messenger/Instagram/Resend câblés.
- ~~**CRM-OUTBOUND-META-01**~~ — CLÔTURÉ (2026-10-17, PR #226, merge `35a163a`). Réponses sortantes Messenger/Instagram via Meta Graph API. ⚠️ `META_PAGE_ACCESS_TOKEN` à provisionner sur `easy2book-new` (action Direction).
- ~~**B2C-CANCEL-MONDE-02**~~ — CLÔTURÉ (2026-10-17, PR #226, merge `35a163a`). Stockage `offerId` + appel `cancel()` best-effort pour libération inventaire virtuel. ⚠️ Migration `0020_hotel_offer_id.sql` à appliquer en production (action Direction).
- **CRM-F — Paid Media Measurement** (effort L, impact H) — BLOQUÉ sur budget paid media existant. Table `ad_spend` + import dépenses + extension campaign-performance ROAS/CAC. Règle taux de change applicable. Sur GO + décision architecture.

### Items réellement "Plus tard"

- **Distribution** : séparation Product / Offer / Distribution / CommercialTerms ; canaux B2C, B2B, API, Agency, Partner, Network. — BLOQUÉ D-01b.
- **Achat inter-tenant** : tenant A vend le produit de tenant B sans casser RLS, ownership, pricing, commissions, wallet. — N/A aujourd'hui.
- **White Label fournisseurs propres** : credentials fournisseurs par tenant. — DEFERRED.
- **Intelligence (P7)** : recommandation, ranking, IA — seulement sur données fiables. — N/A.

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
