-- =============================================================================
-- PUBLIC-VISUAL-RLS-ROLE-GAP-01 — comble le trou RLS qui rendait
-- public_module_visuals / public_site_settings / public_promotions
-- illisibles par le rôle de connexion réel de l'application
-- =============================================================================
-- PROBLÈME CRITIQUE trouvé en audit (MASTER STRESS TEST, Scénario A — Smoke,
-- 2026-10-06) :
--
-- `0097_public_visual_content.sql` (PUBLIC-VISUAL-01, 2026-10-02) a créé les
-- policies RLS des 3 tables ci-dessous avec `FOR SELECT TO authenticated` /
-- `FOR ALL TO authenticated` — alors que TOUTE autre policy RLS du dépôt
-- (`pricing_margins`, `reservations`, `public_module_visuals` elle-même pour
-- l'écriture, etc.) utilise `USING (...)` SANS restriction de rôle, donc
-- valide pour tout rôle de connexion.
--
-- `app_runtime` — le rôle Postgres RÉEL utilisé par l'application
-- (`DATABASE_URL`, non-superuser, non-bypass RLS, voir `drizzle/manual/0012`
-- et le job CI `financial-e2e`) — n'est membre d'aucun rôle `authenticated`
-- (confirmé : `pg_auth_members` ne montre aucune appartenance). `authenticated`
-- est un rôle Supabase/PostgREST, jamais celui utilisé par les Server
-- Components/Server Actions Next.js qui lisent ces 3 tables
-- (`lib/public/site-content.ts`).
--
-- Avec `FORCE ROW LEVEL SECURITY` et aucune policy applicable à `app_runtime`,
-- Postgres retourne silencieusement 0 ligne à CHAQUE lecture — sans lever
-- d'exception (RLS filtre les lignes, il ne lève jamais d'erreur). Le bug est
-- resté invisible car les 3 fonctions de lecture (`getPublicModuleVisuals`/
-- `getPublicSiteConfig`/`getPublicPromotions`) avalent toute exception
-- (`catch { return [] / null }`) — ici il n'y a même pas d'exception à
-- avaler, juste un résultat vide légitime du point de vue de Postgres.
--
-- CONSÉQUENCE RÉELLE : la page d'accueil (tous locales) affiche zéro onglet
-- de navigation entre modules (`components/booking-engine.tsx` ::
-- `visibleTabs` dérivé de `enabledModules`, lui-même vide), zéro image hero
-- dynamique, zéro carrousel de promotions — dégradée silencieusement vers un
-- unique fallback codé en dur (`"hotels-tunisie"`), sans qu'aucune alerte ne
-- se déclenche. Prouvé en local (infra Postgres 16 + RLS forcée identique
-- prod) : `getPublicModuleVisuals()` retourne `[]` malgré 8 lignes réelles
-- `enabled=true` pour l'agence par défaut. Non re-vérifié en production
-- directement (pas d'accès réseau sortant depuis ce sandbox vers
-- easy2book-new.vercel.app) — mais le rôle/policy en cause est strictement
-- identique (même migrations, même `app_runtime`), donc le même symptôme est
-- attendu en production tant que ce correctif n'y est pas appliqué.
--
-- CORRECTIF :
-- Recrée les 6 policies des 3 tables SANS restriction `TO authenticated` —
-- même convention que toutes les autres policies RLS du dépôt. Comportement
-- inchangé pour tout rôle qui fonctionnait déjà (aucune policy existante ne
-- devient MOINS permissive) ; `app_runtime` devient enfin couvert, comme
-- toutes les autres tables tenant-scopées.
-- =============================================================================

BEGIN;

DROP POLICY IF EXISTS public_site_settings_read ON public_site_settings;
CREATE POLICY public_site_settings_read ON public_site_settings
  FOR SELECT
  USING (agency_id = current_agency_id() OR is_super_admin());

DROP POLICY IF EXISTS public_site_settings_write ON public_site_settings;
CREATE POLICY public_site_settings_write ON public_site_settings
  FOR ALL
  USING (agency_id = current_agency_id() OR is_super_admin())
  WITH CHECK (agency_id = current_agency_id() OR is_super_admin());

DROP POLICY IF EXISTS public_module_visuals_read ON public_module_visuals;
CREATE POLICY public_module_visuals_read ON public_module_visuals
  FOR SELECT
  USING (agency_id = current_agency_id() OR is_super_admin());

DROP POLICY IF EXISTS public_module_visuals_write ON public_module_visuals;
CREATE POLICY public_module_visuals_write ON public_module_visuals
  FOR ALL
  USING (is_super_admin())
  WITH CHECK (is_super_admin());

DROP POLICY IF EXISTS public_promotions_read ON public_promotions;
CREATE POLICY public_promotions_read ON public_promotions
  FOR SELECT
  USING (agency_id = current_agency_id() OR is_super_admin());

DROP POLICY IF EXISTS public_promotions_write ON public_promotions;
CREATE POLICY public_promotions_write ON public_promotions
  FOR ALL
  USING (is_super_admin())
  WITH CHECK (is_super_admin());

COMMIT;
