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
**Aucun** — ACTION-ENGINE-01 CLÔTURÉ (2026-10-08, commit `a0231ea`).
**Aucun** — LEARNING-01 CLÔTURÉ (2026-10-08, commit `3b25026`).
**Aucun** — CAMPAIGN-ENGINE-01 CLÔTURÉ (2026-10-08, commit `a14e671`).
**Aucun** — CAMPAIGN-LIFECYCLE-01 CLÔTURÉ (2026-10-08, commit `22b6182`).
**Aucun** — CAMPAIGN-LINK-01 CLÔTURÉ (2026-10-08) — `?campaign=<uuid>` câblé dans les 8 tunnels de réservation (UI → serveur).
**Aucun** — CAMPAIGN-DELIVERY-01 CLÔTURÉ (2026-10-08, PRs #162+#163) — Inngest `deliverCampaign` + `deliverCampaignCore` + migration 0125 (`delivery_status`/`delivered_at`) + live consent RGPD art.7.
**Aucun** — CAMPAIGN-DELIVERY-STATS-01 CLÔTURÉ (2026-10-08) — `getCampaignPerformanceCore` étendu : `sent`/`failed`/`skipped`/`pending`/`totalTargets` via SQL COUNT(CASE WHEN); page `/admin/analytics/campaigns` affiche les 4 colonnes livraison; 4 tests comportementaux vitest.
**Aucun** — PROMO-PRICING-COVERAGE-01 CLÔTURÉ (2026-10-07, PR #156, merge `6965d233`).
**Aucun** — REVENUE-CONSOLIDATE-01 CLÔTURÉ (2026-10-07, PR #157, merge `a0f91877`).
**Aucun** — NICHE-UI-01 CLÔTURÉ (2026-10-07, PR #158, merge `7abc1acc`).
