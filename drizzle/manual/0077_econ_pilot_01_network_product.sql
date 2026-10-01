-- ECON-PILOT-01 : premier branchement réel Supplier Node (Network) →
-- Product (canonique) → Cost → Margin (Système B, margin_rules déjà réel)
-- → Booking → reservation_financials (déjà réel, inchangé) → Settlement
-- (déjà réel, inchangé).
--
-- Additif pur : `products` (0 ligne en production, vérifié) gagne 3
-- colonnes nullables ; `reservation_module` gagne une valeur d'enum ;
-- 1 nouvelle table d'extension minimale. Aucune table/colonne existante
-- n'est modifiée dans son comportement — voir le design report ECON-PILOT-01A
-- pour la justification complète (pourquoi pas de nouvelle table
-- canonical_products/supplier_products, pourquoi pas de réutilisation de
-- reservation_activity).

ALTER TABLE products
  ADD COLUMN IF NOT EXISTS supplier_node_id uuid REFERENCES supplier_nodes(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS cost_price numeric(14, 3),
  ADD COLUMN IF NOT EXISTS cost_currency varchar(3);

CREATE INDEX IF NOT EXISTS products_supplier_node_idx ON products (supplier_node_id);

-- ALTER TYPE ... ADD VALUE ne peut pas être combiné, dans la même
-- transaction, avec une requête qui référence la nouvelle valeur
-- (limitation Postgres) — ce fichier ne fait que l'ajout (même précaution
-- que drizzle/manual/0051_hotel_monde_module.sql).
ALTER TYPE reservation_module ADD VALUE IF NOT EXISTS 'network';

CREATE TABLE IF NOT EXISTS reservation_network_product (
  reservation_id uuid PRIMARY KEY REFERENCES reservations(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
  supplier_node_id uuid NOT NULL REFERENCES supplier_nodes(id) ON DELETE RESTRICT,
  quantity integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS res_network_product_product_idx ON reservation_network_product (product_id);
CREATE INDEX IF NOT EXISTS res_network_product_supplier_node_idx ON reservation_network_product (supplier_node_id);
