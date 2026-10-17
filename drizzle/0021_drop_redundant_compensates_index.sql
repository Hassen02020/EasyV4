-- INDEX-CLEANUP-01 : supprime l'index non-unique redondant
-- economic_entitlements_compensates_idx, apparu avant la migration 0134
-- qui a ajouté l'index UNIQUE economic_entitlements_compensates_uniq.
-- Les deux couvrent (booking_id, entitlement_type) ; le non-unique est
-- un doublon cosmétique pur — aucun code applicatif ne le référence.
-- Postgres utilise déjà l'index unique en priorité.
-- Rétrocompatible : IF EXISTS, aucun rollback nécessaire (l'index peut
-- être recréé avec CREATE INDEX IF NOT EXISTS si besoin).
DROP INDEX IF EXISTS "economic_entitlements_compensates_idx";
