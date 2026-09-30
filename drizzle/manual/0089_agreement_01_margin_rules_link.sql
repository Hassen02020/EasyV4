-- AGREEMENT-01 — margin_rules.agreement_id (créée par 0087/0088).
--
-- Colonne nullable, purement additive. AUCUNE ligne existante modifiée
-- (production = 0 ligne `margin_rules` au moment de cette migration,
-- confirmé par requête directe avant écriture). AUCUN lecteur réel
-- (`getMarginsForAgency()` — lib/pro/server-context.ts, `applyMargin()` —
-- lib/pro/pricing.ts, `lib/network/economic-pilot-actions.ts`) ne
-- sélectionne cette colonne : lus intégralement avant cette migration,
-- confirmé qu'aucun ne référence `agreement_id`. Le calcul de prix
-- (`applyMargin()`) est donc STRICTEMENT inchangé par cette migration.
--
-- Ne touche PAS `margin_rules_tenant_isolation` (policy RLS existante sur
-- `margin_rules` elle-même) : cette migration n'ajoute qu'une colonne, ne
-- modifie aucune policy. Le fait que cette policy autorise aujourd'hui une
-- agence à écrire `commission_percent` sur ses propres lignes (risque R-06,
-- docs/ECONOMIC_MODEL.md §2) est une divergence PRÉEXISTANTE et documentée
-- (jamais exploitée : aucun chemin d'écriture applicatif vers `margin_rules`
-- n'existe dans ce dépôt, confirmé par grep exhaustif) — hors scope
-- d'AGREEMENT-01, qui ne fait qu'ajouter un lien nullable, pas durcir une
-- RLS existante. Décision distincte, à soumettre séparément à la Direction.
--
-- Application :
--   psql "$DATABASE_DIRECT_URL" -f drizzle/manual/0089_agreement_01_margin_rules_link.sql
--
-- Idempotent : ADD COLUMN IF NOT EXISTS ; ajout de contrainte FK protégé par
-- un bloc DO/EXCEPTION (Postgres n'a pas d'équivalent direct à
-- "ADD CONSTRAINT IF NOT EXISTS").
-- Retour arrière en bas de fichier.
-- =============================================================================

BEGIN;

ALTER TABLE margin_rules ADD COLUMN IF NOT EXISTS agreement_id uuid;

DO $$ BEGIN
  ALTER TABLE margin_rules
    ADD CONSTRAINT margin_rules_agreement_id_fkey
    FOREIGN KEY (agreement_id) REFERENCES commercial_agreements(id) ON DELETE SET NULL;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS margin_rules_agreement_idx ON margin_rules (agreement_id);

COMMIT;

-- Retour arrière :
--   ALTER TABLE margin_rules DROP CONSTRAINT IF EXISTS margin_rules_agreement_id_fkey;
--   DROP INDEX IF EXISTS margin_rules_agreement_idx;
--   ALTER TABLE margin_rules DROP COLUMN IF EXISTS agreement_id;
