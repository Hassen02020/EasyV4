-- PROVIDER-CONNECTIVITY-BRIDGE (P2) : canal de fulfillment réellement
-- utilisé pour une réservation vol donnée (api_direct via GdsAdapter, ou
-- b2b_offline via confirmation manuelle staff) — additif pur, colonne
-- nullable, aucune donnée existante réécrite. Voir lib/db/schema/flights.ts
-- pour la justification complète (pourquoi flight_bookings et pas
-- reservations ni flight_supplier_configs).

CREATE TYPE flight_fulfillment_mode AS ENUM ('api_direct', 'b2b_offline');

ALTER TABLE flight_bookings
  ADD COLUMN IF NOT EXISTS fulfillment_mode flight_fulfillment_mode;
