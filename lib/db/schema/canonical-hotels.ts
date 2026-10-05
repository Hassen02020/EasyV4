/**
 * CANONICAL-HOTEL-01 (2026-10-05) — identité Easy2Book stable pour un hôtel,
 * indépendante de tout fournisseur, pilote de la proposition CANONICAL
 * (audit du même jour : aucune vertical ne persistait jusqu'ici une identité
 * produit partagée entre fournisseurs — voir docs/ROADMAP.md).
 *
 * Deux tables seulement, strictement additives :
 *   - canonical_hotels                : l'identité elle-même (attributs peu
 *                                        volatils : nom, ville, pays).
 *   - canonical_hotel_supplier_mappings : une ligne par (fournisseur, code
 *                                        fournisseur) rattachée à une seule
 *                                        identité canonical — jamais deux
 *                                        identités pour le même couple
 *                                        (contrainte unique), jamais
 *                                        réécrite/fusionnée après coup.
 *
 * Ne porte NI offer (prix/conditions d'un fournisseur à un instant donné)
 * NI availability (volatile, jamais persisté) NI price (propriété de
 * reservation_financials/margin-calculator.ts) — strictement l'identité et
 * la provenance. Voir lib/hotel-suppliers/core/canonical-persistence.ts pour
 * la seule logique d'écriture (best-effort, seuil EXACT uniquement).
 */
import {
  pgTable,
  uuid,
  varchar,
  timestamp,
  uniqueIndex,
  index,
} from "drizzle-orm/pg-core"

export const canonicalHotels = pgTable("canonical_hotels", {
  id: uuid("id").primaryKey().defaultRandom(),
  /** Repris de l'hôtel normalisé ayant créé cette identité (premier fournisseur vu) — jamais réécrit automatiquement par un rattachement ultérieur. */
  name: varchar("name", { length: 255 }).notNull(),
  city: varchar("city", { length: 128 }),
  country: varchar("country", { length: 64 }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
})

/**
 * `supplier`/`supplierHotelCode` en varchar (pas un pgEnum) — même
 * convention que `hotel_suppliers.code` (schema/hotel-suppliers.ts) : la
 * liste des fournisseurs réels (SupplierName,
 * lib/hotel-suppliers/core/types.ts) évolue indépendamment du schéma DB.
 */
export const canonicalHotelSupplierMappings = pgTable(
  "canonical_hotel_supplier_mappings",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    canonicalHotelId: uuid("canonical_hotel_id")
      .notNull()
      .references(() => canonicalHotels.id, { onDelete: "cascade" }),
    supplier: varchar("supplier", { length: 32 }).notNull(),
    supplierHotelCode: varchar("supplier_hotel_code", {
      length: 128,
    }).notNull(),
    /**
     * Confiance du rattachement au moment de la création — toujours
     * "EXACT" aujourd'hui (seul seuil auto-persisté, voir
     * canonical-persistence.ts). Conservée pour traçabilité/debug, jamais
     * réévaluée après coup par ce chantier.
     */
    matchConfidence: varchar("match_confidence", { length: 16 }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("canonical_hotel_supplier_mappings_supplier_code_uniq").on(
      t.supplier,
      t.supplierHotelCode,
    ),
    index("canonical_hotel_supplier_mappings_canonical_idx").on(
      t.canonicalHotelId,
    ),
  ],
)

export type CanonicalHotelRow = typeof canonicalHotels.$inferSelect
export type NewCanonicalHotelRow = typeof canonicalHotels.$inferInsert
export type CanonicalHotelSupplierMappingRow =
  typeof canonicalHotelSupplierMappings.$inferSelect
export type NewCanonicalHotelSupplierMappingRow =
  typeof canonicalHotelSupplierMappings.$inferInsert
