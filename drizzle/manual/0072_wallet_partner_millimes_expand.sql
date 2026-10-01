-- =============================================================================
-- chantier-49C, étape 1 (expand/contract) — Ajoute des colonnes entiers de
-- millimes EN PARALLÈLE des colonnes `decimal` existantes sur wallet_ledger
-- et partner_credit_movements, backfille les lignes historiques.
--
-- Invariant financier P0 (Master Prompt section 13) : "Montants en unités
-- mineures entières… jamais de flottants". Les colonnes `decimal` existantes
-- restent la source de vérité pour l'instant — AUCUNE lecture ne dépend des
-- nouvelles colonnes. Le code applicatif (lib/finance/millimes.ts) les
-- double-écrit désormais sur chaque nouveau mouvement. Une fois la
-- concordance validée en production (comparer les deux représentations,
-- ex. via npm run audit:financial), un chantier séparé basculera la lecture
-- puis supprimera les colonnes decimal (étapes "contract").
--
-- Nullable : NULL signale une ligne pas encore couverte par la double-
-- écriture (historique, backfillé ci-dessous) — jamais confondu avec un 0
-- réel une fois la bascule de lecture envisagée.
-- =============================================================================

alter table wallet_ledger add column if not exists amount_millimes bigint;
alter table wallet_ledger add column if not exists balance_before_millimes bigint;
alter table wallet_ledger add column if not exists balance_after_millimes bigint;

update wallet_ledger
set amount_millimes = round(amount * 1000),
    balance_before_millimes = round(balance_before * 1000),
    balance_after_millimes = round(balance_after * 1000)
where amount_millimes is null;

alter table partner_credit_movements add column if not exists amount_millimes bigint;
alter table partner_credit_movements add column if not exists balance_after_millimes bigint;

update partner_credit_movements
set amount_millimes = round(amount * 1000),
    balance_after_millimes = round(balance_after * 1000)
where amount_millimes is null;
