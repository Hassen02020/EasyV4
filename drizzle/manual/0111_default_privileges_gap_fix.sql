-- Migration 0111 — DEFAULT-PRIVILEGES-GAP-01 (2026-10-05)
--
-- Découvert en appliquant NETWORK-DEMAND-CAPTURE-01 (migration 0110) en
-- production : un ALTER DEFAULT PRIVILEGES préexistant (rôle postgres,
-- schéma public — voir 0069_database_url_app_runtime_cutover.sql) accorde
-- automatiquement INSERT/SELECT/UPDATE/DELETE à app_runtime sur TOUTE
-- nouvelle table créée dans public. Un GRANT restrictif explicite dans une
-- migration (ex. "GRANT SELECT, INSERT") ne retire PAS ce qui a déjà été
-- accordé par défaut — un REVOKE explicite est obligatoire.
--
-- Deux tables existantes affectées, vérifiées en production
-- (information_schema.role_table_grants) :
--
--  - notification_idempotency (0099) : intention d'origine documentée
--    "GRANT SELECT, INSERT" (jamais purgée, jamais réécrite) — avait
--    pourtant UPDATE+DELETE. Audité : ZÉRO appelant .update()/.delete()
--    dans tout lib/ — retrait sans risque des deux privilèges.
--
--  - audit_events : avait UPDATE+DELETE. Audité :
--      * .update(auditEvents) : ZÉRO appelant — UPDATE retiré.
--      * .delete(auditEvents) : appelant RÉEL et intentionnel
--        (app/api/cron/purge-audit/route.ts — purge des entrées de plus
--        de 30 jours, cron Vercel quotidien) — DELETE CONSERVÉ, jamais
--        retiré ici, sous peine de casser ce cron en production.
--
-- wallet_ledger et lead_origin_events (0110) ne sont pas concernés — déjà
-- correctement restreints (vérifié séparément).

REVOKE UPDATE, DELETE ON notification_idempotency FROM app_runtime;
REVOKE UPDATE ON audit_events FROM app_runtime;
