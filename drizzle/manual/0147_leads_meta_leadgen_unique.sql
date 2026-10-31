-- 0147 — un seul lead par (agence, leadgen_id Meta) (CRM-LEADADS-UNIQUE-01, écart G-17)
--
-- captureMetaLeadCore (lib/meta-leadads/lead-capture-core.ts) déduplique par
-- `leads.source_page = 'meta_leadads:<leadgen_id>'` sous verrou transactionnel
-- (PR #323). Cet index est le filet de sécurité en base : même un chemin de
-- code sans verrou ne peut plus créer deux leads pour la même livraison Meta.
--
-- PARTIEL (`LIKE 'meta_leadads:%'`) : le site enregistre légitimement le même
-- `source_page` pour plusieurs demandes (ex. /hotels/519 — 1 doublon réel en
-- production au 2026-10-31). Un index non partiel échouerait.
--
-- Audit préalable production (lecture seule, 2026-10-31) : 4 leads, 0 ligne
-- `meta_leadads:%`, table 112 kB — création sans conflit, verrou négligeable.
--
-- Idempotente (IF NOT EXISTS). Aucune donnée modifiée.
--
-- Retour arrière :
--   DROP INDEX IF EXISTS leads_agency_meta_leadgen_uniq;

CREATE UNIQUE INDEX IF NOT EXISTS leads_agency_meta_leadgen_uniq
  ON leads (agency_id, source_page)
  WHERE source_page LIKE 'meta_leadads:%';
