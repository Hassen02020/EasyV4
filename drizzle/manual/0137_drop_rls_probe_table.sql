-- RLS-PROBE-DROP-01 : suppression de la table sonde temporaire _rls_fix_probe_drop_me
-- Créée manuellement lors du débogage RLS (chantier CRM-C / migration 0129).
-- Table vide, aucune référence code, aucune dépendance FK externe.
-- La séquence _rls_fix_probe_id_seq est droppée automatiquement (deptype=a).
-- Grants déjà révoqués (étape 1 préalable : REVOKE ALL FROM anon/authenticated/service_role/app_runtime).

DROP TABLE IF EXISTS public._rls_fix_probe_drop_me;
DROP SEQUENCE IF EXISTS public._rls_fix_probe_id_seq;
