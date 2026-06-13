/**
 * Schéma Produits — Easy2Book V6
 *
 * Gestion du catalogue produits : hôtels, vols, packages, transferts, omra.
 * Chaque produit est lié à un fournisseur et dispose d'un inventaire temps réel.
 */

import {
  boolean,
  date,
  decimal,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core"

/* -------------------------------------------------------------------------- */
/* Interfaces TypeScript pour JSONB                                              */
/* -------------------------------------------------------------------------- */

export interface ProductMetadata {
  supplierReference?: string
  supplierCode?: string
  amenities?: string[]
  images?: string[]
  policies?: Record<string, unknown>
  specialOffers?: string[]
}

/* -------------------------------------------------------------------------- */
/* Enums                                                                        */
/* -------------------------------------------------------------------------- */

export const productType = pgEnum("product_type", [
  "hotel",
  "flight",
  "package",
  "transfer",
  "omra",
  "activity",
])

export const productStatus = pgEnum("product_status", [
  "draft",       // Brouillon
  "active",      // Actif - visible et réservable
  "inactive",    // Désactivé
  "archived",    // Archivé
  "out_of_stock",// Plus de disponibilité
])

export const inventoryStatus = pgEnum("inventory_status", [
  "available",
  "limited",  // < 10% restant
  "on_request",
  "sold_out",
])

/* -------------------------------------------------------------------------- */
/* Products (Catalogue Central)                                                 */
/* -------------------------------------------------------------------------- */

export const products = pgTable(
  "products",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    agencyId: uuid("agency_id").notNull(),
    supplierId: uuid("supplier_id"), // Lié au fournisseur API source

    // Identification
    type: productType("type").notNull(),
    status: productStatus("status").notNull().default("draft"),

    // Références fournisseur
    supplierCode: varchar("supplier_code", { length: 100 }), // Code produit fournisseur
    supplierRef: varchar("supplier_ref", { length: 200 }),   // Référence unique fournisseur

    // Informations produit
    name: varchar("name", { length: 300 }).notNull(),
    nameAr: varchar("name_ar", { length: 300 }),             // Traduction arabe
    nameEn: varchar("name_en", { length: 300 }),             // Traduction anglaise
    description: text("description"),
    descriptionAr: text("description_ar"),
    descriptionEn: text("description_en"),

    // Localisation
    city: varchar("city", { length: 100 }),
    country: varchar("country", { length: 100 }),
    countryCode: varchar("country_code", { length: 3 }),   // ISO 3166-1 alpha-2/3
    coordinates: jsonb("coordinates").$type<{ lat: number; lng: number }>(),
    address: text("address"),

    // Tarification de base (prix achat fournisseur)
    basePrice: decimal("base_price", { precision: 14, scale: 2 }),
    baseCurrency: varchar("base_currency", { length: 3 }).default("TND"),
    salePrice: decimal("sale_price", { precision: 14, scale: 2 }), // Prix vente affiché (avec marge)

    // Disponibilité
    availableFrom: date("available_from"),
    availableTo: date("available_to"),
    minNights: integer("min_nights"),   // Pour hôtels
    maxNights: integer("max_nights"),
    minPersons: integer("min_persons").default(1),
    maxPersons: integer("max_persons"),

    // Médias
    images: jsonb("images").$type<string[]>().default([]),
    mainImage: text("main_image"),

    // Caractéristiques (flexible selon le type)
    amenities: jsonb("amenities").$type<string[]>().default([]),
    metadata: jsonb("metadata").$type<ProductMetadata>(),

    // Synchronisation fournisseur
    lastSyncAt: timestamp("last_sync_at", { withTimezone: true }),
    syncStatus: varchar("sync_status", { length: 20 }).default("pending"), // pending, ok, error

    // Stats
    totalBookings: integer("total_bookings").notNull().default(0),
    averageRating: decimal("average_rating", { precision: 3, scale: 2 }),

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    { name: "products_agency_idx", on: t.agencyId },
    { name: "products_supplier_idx", on: t.supplierId },
    { name: "products_type_idx", on: t.type },
    { name: "products_status_idx", on: t.status },
    { name: "products_country_idx", on: t.countryCode },
  ],
)

/* -------------------------------------------------------------------------- */
/* Product Inventory (Disponibilités Temps Réel)                               */
/* -------------------------------------------------------------------------- */

export const productInventory = pgTable(
  "product_inventory",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    productId: uuid("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "cascade" }),

    // Fenêtre de disponibilité
    date: date("date").notNull(),              // Date spécifique (hôtels, transferts)
    endDate: date("end_date"),                 // Pour packages (date de début → fin)

    // Stock
    totalCapacity: integer("total_capacity").notNull(),
    available: integer("available").notNull().default(0),
    onHold: integer("on_hold").notNull().default(0),    // Réservations en cours de paiement
    confirmed: integer("confirmed").notNull().default(0), // Réservées et confirmées

    // Tarif de cette période (peut varier)
    price: decimal("price", { precision: 14, scale: 2 }),
    currency: varchar("currency", { length: 3 }).default("TND"),

    // Statut calculé
    status: inventoryStatus("status").notNull().default("available"),

    // Sync fournisseur
    supplierStock: integer("supplier_stock"),
    lastSyncAt: timestamp("last_sync_at", { withTimezone: true }),

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("product_inventory_product_date_idx").on(t.productId, t.date),
    { name: "product_inventory_status_idx", on: t.status },
  ],
)

/* -------------------------------------------------------------------------- */
/* API Logs (Traçabilité des appels XML/REST fournisseurs)                     */
/* -------------------------------------------------------------------------- */

export const apiLogs = pgTable(
  "api_logs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    supplierId: uuid("supplier_id"),

    // Type d'opération
    operation: varchar("operation", { length: 50 }).notNull(),
    // search, availability, book, cancel, confirm, amend, voucher, status_poll
    module: varchar("module", { length: 50 }).notNull(),
    // hotel, flight, package, transfer, omra

    // Requête envoyée
    requestPayload: text("request_payload"),    // XML/JSON envoyé
    requestHeaders: jsonb("request_headers").$type<Record<string, string>>(),
    requestUrl: text("request_url"),
    requestMethod: varchar("request_method", { length: 10 }),

    // Réponse reçue
    responsePayload: text("response_payload"),  // XML/JSON reçu
    responseHeaders: jsonb("response_headers").$type<Record<string, string>>(),
    statusCode: integer("status_code"),

    // Performance
    durationMs: integer("duration_ms"),         // Temps de réponse en millisecondes
    success: boolean("success").notNull().default(false),

    // Erreur
    errorType: varchar("error_type", { length: 100 }),
    errorMessage: text("error_message"),
    errorCode: varchar("error_code", { length: 50 }),

    // Corrélation
    reservationId: uuid("reservation_id"),
    productId: uuid("product_id"),
    sessionId: varchar("session_id", { length: 100 }),  // Session de recherche

    // Environnement
    environment: varchar("environment", { length: 20 }).default("production"),

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    { name: "api_logs_supplier_idx", on: t.supplierId },
    { name: "api_logs_reservation_idx", on: t.reservationId },
    { name: "api_logs_operation_idx", on: t.operation },
    { name: "api_logs_success_idx", on: t.success },
    { name: "api_logs_created_idx", on: t.createdAt },
  ],
)

/* -------------------------------------------------------------------------- */
/* Type Exports                                                                 */
/* -------------------------------------------------------------------------- */

export type Product = typeof products.$inferSelect
export type NewProduct = typeof products.$inferInsert
export type ProductInventory = typeof productInventory.$inferSelect
export type NewProductInventory = typeof productInventory.$inferInsert
export type ApiLog = typeof apiLogs.$inferSelect
export type NewApiLog = typeof apiLogs.$inferInsert
