-- Migration 0110 — CANONICAL-HOTEL-01-REASONS (2026-10-05)
--
-- Complément direct de 0109 (CANONICAL-HOTEL-01). Trouvaille en audit
-- (échange avec la Direction) : `canonical_hotel_supplier_mappings`
-- persiste `match_confidence` ("EXACT") mais jamais le détail humainement
-- lisible qui le justifie (`matchHotels()` retourne déjà `reasons:
-- string[]`, ex. `["geo within 42m", "name similarity 0.87"]`) — avant ce
-- correctif, ce "pourquoi" ne vivait que dans les logs de la recherche qui
-- avait créé le rattachement, jamais requêtable après coup.
--
-- Colonne additive, NOT NULL sans défaut : la table a 0 ligne en production
-- à ce jour (vérifié avant application), donc aucune ligne existante à
-- migrer — toute nouvelle écriture (lib/hotel-suppliers/core/
-- canonical-persistence.ts) fournit désormais systématiquement cette
-- valeur, jamais un tableau vide/inventé.

BEGIN;

ALTER TABLE canonical_hotel_supplier_mappings
  ADD COLUMN IF NOT EXISTS match_reasons jsonb NOT NULL DEFAULT '[]'::jsonb;

-- Le DEFAULT ci-dessus n'existe que pour permettre l'ADD COLUMN NOT NULL
-- sans échouer si une ligne existait déjà (aucune aujourd'hui) — jamais
-- utilisé en pratique par le code applicatif, qui fournit toujours une
-- vraie valeur. On le retire immédiatement pour qu'un oubli applicatif
-- échoue bruyamment plutôt que d'insérer silencieusement un "[]" fabriqué.
ALTER TABLE canonical_hotel_supplier_mappings
  ALTER COLUMN match_reasons DROP DEFAULT;

GRANT SELECT, INSERT ON canonical_hotel_supplier_mappings TO app_runtime;

COMMIT;

-- Retour arrière :
--   ALTER TABLE canonical_hotel_supplier_mappings DROP COLUMN IF EXISTS match_reasons;
