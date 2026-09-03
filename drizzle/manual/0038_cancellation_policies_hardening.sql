-- PHASE 38A — POLICY ENGINE HARDENING
--
-- Deux corrections de cohérence/défense-en-profondeur sur
-- `cancellation_policies` (0037), aucune ne change le comportement pour un
-- rôle applicatif déjà conforme (app_runtime, non-propriétaire de la table) :
--
-- 1. FORCE ROW LEVEL SECURITY — 0037 avait activé RLS sans FORCE, seule
--    table manuelle du dépôt dans ce cas (`grep -L "force row level
--    security" drizzle/manual/*.sql` après ENABLE RLS ne retournait que ce
--    fichier) — toutes les tables tenant-scopées sœurs (reservations,
--    payments, wallet_accounts, wallet_ledger) l'ont déjà. FORCE ne change
--    rien pour le rôle propriétaire (`postgres`, superuser/BYPASSRLS,
--    jamais soumis à RLS de toute façon) ni pour `app_runtime` (déjà
--    non-propriétaire, donc déjà soumis à RLS avec ou sans FORCE) — pur
--    alignement défensif avec la convention du reste du schéma.
--
-- 2. CHECK sur cancellation_fee_percent — aucune borne n'existait en base
--    (seul `numeric(5,2)`). Un pourcentage négatif publié par erreur ferait
--    dépasser `creditableTnd` au montant réellement capturé et casserait
--    l'annulation (AMOUNT_EXCEEDS_CAPTURED, transaction annulée en entier).
--    La validation applicative existe désormais dans
--    `publishCancellationPolicyForAgency` — ce CHECK est le filet de sécurité
--    au niveau base, pour toute écriture future qui ne passerait pas par
--    cette fonction.

alter table cancellation_policies force row level security;

alter table cancellation_policies
  add constraint cancellation_policies_fee_percent_range
  check (cancellation_fee_percent is null or (cancellation_fee_percent >= 0 and cancellation_fee_percent <= 100));
