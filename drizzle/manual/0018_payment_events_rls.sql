-- =============================================================================
-- Easy2Book — RLS pour payment_events (gap trouvé en audit wallet/paiement)
-- =============================================================================
-- PROBLÈME : `payment_events` (table d'idempotence event-level du webhook
-- PSP — un event_id PSP ne doit être traité qu'une seule fois) n'avait
-- jamais reçu de policy RLS. N'importe quel utilisateur authentifié pouvait
-- lire/insérer/modifier directement cette table (pas de fuite de données
-- personnelles — elle ne contient que event_id/provider/event_type/
-- reservation_id — mais un utilisateur malveillant aurait pu y insérer des
-- event_id arbitraires pour faire échouer silencieusement le traitement de
-- vrais webhooks PSP, ou lire quels événements ont déjà été traités).
--
-- Contrairement à wallet_recharge_requests/omra_pilgrims (isolation par
-- agence), `payment_events` n'a pas de colonne agency_id : c'est un
-- registre technique du webhook lui-même, jamais consulté par un
-- utilisateur final. Policy : `is_super_admin()` uniquement — aucun accès
-- agence, aucun accès anonyme/authenticated normal.
--
-- Appliqué APRÈS avoir migré app/api/payment/webhook/route.ts pour écrire
-- via `withSystemContext()` (app.is_super_admin=true) plutôt qu'un
-- `getDb()` brut — sans cet ordre, activer RLS ici aurait cassé
-- silencieusement l'insertion d'idempotence du webhook (RLS fail-closed,
-- cause racine documentée dans STRESS_TEST_B2B_B2C_REPORT.md §2, BUG-01).
--
-- Application :
--   psql "$DATABASE_DIRECT_URL" -f drizzle/manual/0018_payment_events_rls.sql
--
-- Dépend de : 0012 (is_super_admin()), et du passage du webhook route à
-- withSystemContext() (voir app/api/payment/webhook/route.ts).
-- Idempotent : peut être réexécuté sans effet de bord.
-- Déjà appliqué en production (projet Supabase vqhuptgjhoornteibbpj) via
-- Supabase MCP le 2026-08-20, dans le cadre de cet audit.
-- =============================================================================

BEGIN;

ALTER TABLE payment_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "payment_events_system_only" ON payment_events;
CREATE POLICY "payment_events_system_only" ON payment_events
  FOR ALL
  USING (is_super_admin())
  WITH CHECK (is_super_admin());

ALTER TABLE payment_events FORCE ROW LEVEL SECURITY;

COMMIT;
