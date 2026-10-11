-- =============================================================================
-- Easy2Book — RLS-HOTEL-01 : Row-Level Security sur hotel_commercial_rules
-- =============================================================================
--
-- Contexte (audit MIGRATION-READINESS-01, 2026-10-11) :
--
--   La table `hotel_commercial_rules` créée par la migration Drizzle
--   0019_hotel_commercial_rules.sql (PR #184) n'avait pas de RLS ni de
--   policy, contrairement à sa table miroir `flight_commercial_rules`
--   (migration 0076, RLS + policy `flight_commercial_rules_tenant_isolation`).
--
--   État avant cette migration (vérifié en production) :
--     relrowsecurity = false  → toute requête, quel que soit le rôle, voit
--                               toutes les lignes de toutes les agences
--     relforcerowsecurity = false
--     Policies : 0
--
--   Grants confirmés en production :
--     anon         : DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE,
--                    UPDATE (Supabase default — même profil que
--                    flight_commercial_rules et pricing_margins)
--     authenticated : idem
--     app_runtime  : DELETE, INSERT, SELECT, UPDATE
--     service_role : idem anon (Supabase default)
--     postgres     : idem anon (owner, grantable)
--
--   Impact actif : table vide en production → 0 ligne exposée aujourd'hui.
--   Impact futur (si une règle est insérée avant cette migration) : toutes
--   les agences verraient les règles de toutes les autres agences via
--   PostgREST/Supabase client.
--
-- Décision de conception :
--   Aucun REVOKE sur anon/authenticated — cohérent avec le pattern établi
--   sur `flight_commercial_rules`, `pricing_margins` et l'ensemble des
--   tables métier (protection par RLS, pas par retrait de grants). Revoquer
--   les grants Supabase par défaut est un chantier séparé et orthogonal.
--
-- ENABLE vs FORCE :
--   ENABLE alone : exempte le propriétaire de la table (rôle `postgres`).
--   FORCE         : propriétaire lui aussi soumis à RLS (mais pas un rôle
--                   BYPASSRLS — voir §5 de 0012). `postgres` a BYPASSRLS en
--                   production : FORCE n'a donc aucun effet sur le trafic
--                   applicatif actuel.
--   Choix ici : ENABLE + FORCE — miroir de `pricing_margins` (table
--   financière de même nature), plus défensif que `flight_commercial_rules`
--   qui utilise ENABLE seul.
--
-- Impact serveur (withSystemContext) :
--   Le rôle `postgres` (DATABASE_URL) a BYPASSRLS → RLS inerte pour les
--   requêtes applicatives actuelles. Quand/si DATABASE_URL bascule vers
--   `app_runtime` (non-BYPASSRLS), withSystemContext positionne
--   `app.is_super_admin = 'true'` → is_super_admin() = TRUE → policy passe
--   pour toutes les lignes (y compris rules globales agency_id IS NULL).
--   Aucun impact fonctionnel sur le moteur hôtel (lib/hotels/commercial-
--   engine.ts, findBestHotelCommercialRule).
--
-- Dépend de :
--   drizzle/0019_hotel_commercial_rules.sql  (table + FK + index)
--   drizzle/manual/0001_rls_policies.sql     (current_agency_id())
--   drizzle/manual/0012_rls_session_context.sql (is_super_admin() GUC-based)
--
-- Application :
--   psql "$DATABASE_DIRECT_URL" -f drizzle/manual/0131_hotel_commercial_rules_rls.sql
--
-- Idempotent (ENABLE est idempotent, DROP POLICY IF EXISTS / CREATE POLICY).
-- Réversible : ALTER TABLE hotel_commercial_rules NO FORCE ROW LEVEL SECURITY;
--              ALTER TABLE hotel_commercial_rules DISABLE ROW LEVEL SECURITY;
--              DROP POLICY hotel_commercial_rules_tenant_isolation ON hotel_commercial_rules;
--
-- =============================================================================

BEGIN;

-- -----------------------------------------------------------------------------
-- 1. Activer RLS (+ FORCE pour défense en profondeur, miroir pricing_margins)
-- -----------------------------------------------------------------------------
ALTER TABLE "hotel_commercial_rules" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "hotel_commercial_rules" FORCE ROW LEVEL SECURITY;

-- -----------------------------------------------------------------------------
-- 2. Politique d'isolation tenant — miroir exact de flight_commercial_rules
--    et pricing_margins.
--
--    USING  : ce qu'une session peut LIRE / référencer
--    WITH CHECK : ce qu'une session peut ÉCRIRE (INSERT / UPDATE)
--
--    Lecture (USING) :
--      - agency_id = current_agency_id() : agence propre uniquement
--      - is_super_admin()                : accès croisé (super_admin +
--                                          withSystemContext)
--      - Les règles globales (agency_id IS NULL) sont délibérément exclues
--        pour les clients directs (NULL = current_agency_id() est toujours
--        FALSE). Seul le serveur (bypassrls) et withSystemContext (super_admin
--        = true) y accèdent — comportement voulu : les règles globales sont
--        une configuration plateforme, pas un paramètre lisible par les
--        agences via PostgREST.
--
--    Écriture (WITH CHECK) :
--      - Une agence ne peut écrire que pour elle-même (agency_id = son
--        current_agency_id()).
--      - Elle ne peut PAS créer de règles globales (agency_id IS NULL ≠
--        current_agency_id() → denied) — seul le super_admin peut le faire.
-- -----------------------------------------------------------------------------
DROP POLICY IF EXISTS "hotel_commercial_rules_tenant_isolation"
  ON "hotel_commercial_rules";

CREATE POLICY "hotel_commercial_rules_tenant_isolation"
  ON "hotel_commercial_rules"
  FOR ALL
  USING  (agency_id = current_agency_id() OR is_super_admin())
  WITH CHECK (agency_id = current_agency_id() OR is_super_admin());

COMMIT;

-- =============================================================================
-- VÉRIFICATION POST-APPLICATION (à exécuter en read-only après le COMMIT)
-- =============================================================================
--
-- 1. RLS activée et FORCE :
--    SELECT relname, relrowsecurity, relforcerowsecurity
--    FROM   pg_class
--    WHERE  relname = 'hotel_commercial_rules';
--    → { relrowsecurity: true, relforcerowsecurity: true }
--
-- 2. Policy créée :
--    SELECT policyname, cmd, qual, with_check
--    FROM   pg_policies
--    WHERE  tablename = 'hotel_commercial_rules';
--    → 1 ligne :
--      { policyname: "hotel_commercial_rules_tenant_isolation",
--        cmd: "ALL",
--        qual: "((agency_id = current_agency_id()) OR is_super_admin())",
--        with_check: "((agency_id = current_agency_id()) OR is_super_admin())" }
--
-- 3. Isolation anon (doit renvoyer 0 ligne) :
--    SET ROLE anon;
--    SELECT count(*) FROM hotel_commercial_rules;
--    → 0
--    RESET ROLE;
--
-- 4. Isolation authenticated agency A (ne voit QUE ses lignes) :
--    SET LOCAL app.current_agency_id = '<uuid-agency-A>';
--    SET LOCAL app.is_super_admin = 'false';
--    -- Insérer une règle agency A et une règle agency B, puis :
--    SELECT count(*) FROM hotel_commercial_rules;
--    → 1 (uniquement agency A)
--
-- 5. Super admin (voit toutes les lignes) :
--    SET LOCAL app.is_super_admin = 'true';
--    SELECT count(*) FROM hotel_commercial_rules;
--    → N (toutes les règles + globales)
-- =============================================================================
