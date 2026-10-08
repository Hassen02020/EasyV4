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
ACTION ENGINE      🔴 — "Quoi faire ?"
 ↓
LEARNING           🔴 — "Est-ce que ça a marché ?"
```

**Radar Métier** répond : *Destination X +42% demandes +28% CA +35% marge → opportunité commerciale.*
**Radar VIP v1** répond : *Lead Y score 87, engagement ×3, récence forte → opportunité relationnelle.*
**Radar VIP v2** (RADAR-VIP-02) répondra : *PARTENAIRE Z — hôtel + Omra + vol + visa — score consolidé → acteur stratégique.*

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
              ↓
ACTION ENGINE 🔴  "Quoi faire ?" — prochaine étape
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
    + `listLeadsCore` → score séquentiel + `findExistingContactIdForLeadCore` → dédup contactuelle
    + `buildSignalEngineCore` (convergence)
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

**Prochain chantier identifié** : ACTION ENGINE ("Quoi faire ?") ou CI-FIX-03 (NO_FCP /login)
— non audités — STOP.

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

| Proof | Domaine | Résultat |
|-------|---------|----------|
| P1 | Schema & contraintes DB | CONFIRMED |
| P2 | Grants `app_runtime` (append-only mappings) | CONFIRMED |
| P3 | RLS (FORCE, `anon`/`authenticated` révoqués) | CONFIRMED |
| P4 | Politique de persistance (EXACT only, best-effort) | CONFIRMED |
| P5 | Tests live (E1/E2/E3/E4) | CONFIRMED |
| P6 | Caller integration (`search-hub` non-bloquant) | CONFIRMED |

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

| Fichier | Action | Détail |
|---------|--------|--------|
| `lib/crm/search-demand-core.ts` | EXTEND | `SearchDemandRow` type + `getSearchDemandSummaryCore()` (30j, GROUP BY, ORDER BY volume DESC, LIMIT 50, filtre `agencyId` défensif en plus RLS) |
| `lib/admin/search-demand-actions.ts` | CREATE | Server Action `listSearchDemandSignals()` — `assertSupportStaff` (super_admin/manager/agent_resa + agencyType=ota) |
| `app/(internal)/admin/analytics/search-demand/page.tsx` | CREATE | Page read-only, pattern useEffect identique à `/admin/analytics/niches` |
| `lib/admin/__tests__/search-demand-actions-live.test.ts` | CREATE | 3 tests live Postgres : agrégation+tri, isolation cross-agency, filtre 30j |

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

| Fichier | Action | Détail |
|---------|--------|--------|
| `components/admin-shell.tsx` | EXTEND | Ajout `analyticsNavItems` (Analytique → Marges / Niches CRM / Demande hôtel) ; visible super_admin + manager + agent_resa ; labels breadcrumb analytics/margins/niches/search-demand |
| `lib/admin/__tests__/admin-shell-analytics-nav.test.ts` | CREATE | 3 tests invariants statiques : présence des trois hrefs dans admin-shell.tsx |

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

**Câblage PRICING-PROMO-LINK-01 — 4/7 modules restants faits** : hôtel
(référence initiale, bugfix ordre CART-DRIFT-01/PROMO appliqué
ci-dessus), transfert, omra, package. **Restent NON câblés** : flight
(signalé plus complexe — prix utilisé à 2 points séparés du fichier,
audit dédié requis avant câblage), activity, network. `car` reste
EXCLU volontairement (module dormant, non commercialisé,
`FEATURE_CAR=false`). FERRY et VISA (futurs modules annoncés) restent
non implémentés/non câblés/non certifiés. Les 3 briques core
(`promo-core.ts`, `promo-discount-core.ts`, `promo-checkout-core.ts`)
confirmées réutilisables sans réécriture pour tout module restant.

**NOT VERIFIED, restant après ce chantier** : AUDIENCE-DEDUP-01
potentiel non traité — CAMPAIGN opère par CONTACT unique (prouvé), mais
AUDIENCE elle-même (NICHE-AUDIENCE-01) ne déduplique pas les `LeadRow`
bruts avant que CAMPAIGN-01 ne les reçoive — sans conséquence sur le
consentement (toujours strict), seulement sur le volume de leads
traités par appel.

**Prochains chantiers potentiels identifiés, NON exécutés** :

- **Câblage PRICING-PROMO-LINK-01 dans les 3 modules restants**
  (activity, network, flight) — flight signalé plus complexe (prix à
  2 points séparés du fichier), audit dédié requis avant câblage ;
  activity/network pas encore audités dans ce round.
- **CONVERSION / LEARNING** : exploiter `campaign_attributions` pour
  mesurer "17 réservations générées par la campagne Istanbul" — aucun
  audit réalisé. `CAMPAIGN-PERFORMANCE-01` (exposed/converted/CA/marge
  par campagne, lecture pure, MERGÉ et DÉPLOYÉ — commit `155d540`,
  `dpl_GBqWhaMnzZ3MDEnQ8JfP4gbZ34rX`) en couvre une partie ; LEARNING
  proprement dit (apprentissage/optimisation) reste non traité.
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
