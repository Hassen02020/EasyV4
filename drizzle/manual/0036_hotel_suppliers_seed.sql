-- PHASE 27 — Catalogue des définitions fournisseur (aucun secret). Reflète
-- exactement lib/hotel-suppliers/core/types.ts::SUPPLIER_NAMES et
-- lib/hotel-suppliers/registry.ts — jamais de fournisseur inventé ici.
-- Idempotent (ON CONFLICT DO NOTHING sur `code`, unique) — rejouable sans
-- effet de bord sur une base où ces lignes existent déjà.

insert into hotel_suppliers (code, name, driver, documentation_status, is_globally_enabled)
values
  ('mygo', 'myGo', 'mygo', 'documented', true),
  ('tunisia-bed', 'Tunisia Bed', 'tunisia-bed', 'documentation_required', true),
  ('cyberesa', 'Cyberesa', 'cyberesa', 'documentation_required', true),
  ('3t', '3T', '3t', 'documentation_required', true)
on conflict (code) do nothing;
