/**
 * Schéma pour la configuration des fournisseurs API XML
 * Permet de connecter l'application à des fournisseurs externes (MyGo, Amadeus, etc.)
 */

import { pgEnum, pgTable, uuid, varchar, text, boolean, timestamp, jsonb } from "drizzle-orm/pg-core"

export const supplierType = pgEnum("supplier_type", [
  "mygo",
  "amadeus",
  "sabre",
  "expedia",
  "booking",
  "travelgate",
  "hotelbeds",
  "custom",
])

export const supplierStatus = pgEnum("supplier_status", [
  "active",
  "inactive",
  "maintenance",
  "error",
])

export const suppliers = pgTable(
  "suppliers",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: varchar("name", { length: 200 }).notNull(),
    type: supplierType("type").notNull(),
    status: supplierStatus("status").notNull().default("inactive"),
    
    // Configuration API
    apiUrl: text("api_url"),
    apiKey: text("api_key"),
    apiSecret: text("api_secret"),
    apiUsername: text("api_username"),
    apiPassword: text("api_password"),
    
    // Configuration XML
    xmlEndpoint: text("xml_endpoint"),
    xmlNamespace: text("xml_namespace"),
    xmlVersion: varchar("xml_version", { length: 20 }),
    
    // Configuration spécifique
    config: jsonb("config").$type<Record<string, any>>(),
    
    // Métadonnées
    logoUrl: text("logo_url"),
    website: text("website"),
    supportEmail: varchar("support_email", { length: 320 }),
    supportPhone: varchar("support_phone", { length: 32 }),
    
    // Synchronisation
    lastSyncAt: timestamp("last_sync_at", { withTimezone: true }),
    syncInterval: varchar("sync_interval", { length: 20 }).default("1h"), // 1h, 6h, 12h, 24h
    autoSync: boolean("auto_sync").notNull().default(false),
    
    // Timestamps
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    // Index pour les requêtes fréquentes
    { name: "suppliers_type_idx", on: t.type },
    { name: "suppliers_status_idx", on: t.status },
  ],
)

export const supplierModules = pgTable(
  "supplier_modules",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    supplierId: uuid("supplier_id")
      .notNull()
      .references(() => suppliers.id, { onDelete: "cascade" }),
    
    // Modules disponibles
    module: varchar("module", { length: 50 }).notNull(), // hotel, flight, package, transfer, omra
    enabled: boolean("enabled").notNull().default(true),
    
    // Configuration spécifique au module
    config: jsonb("config").$type<Record<string, any>>(),
    
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    { name: "supplier_modules_supplier_idx", on: t.supplierId },
    { name: "supplier_modules_module_idx", on: t.module },
  ],
)

export const supplierLogs = pgTable(
  "supplier_logs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    supplierId: uuid("supplier_id")
      .notNull()
      .references(() => suppliers.id, { onDelete: "cascade" }),
    
    // Type de log
    type: varchar("type", { length: 50 }).notNull(), // sync, booking, cancellation, error
    level: varchar("level", { length: 20 }).notNull(), // info, warning, error
    
    // Détails
    message: text("message").notNull(),
    details: jsonb("details").$type<Record<string, any>>(),
    
    // Performance
    duration: varchar("duration", { length: 20 }), // 500ms, 2.5s
    
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    { name: "supplier_logs_supplier_idx", on: t.supplierId },
    { name: "supplier_logs_type_idx", on: t.type },
    { name: "supplier_logs_created_idx", on: t.createdAt },
  ],
)

// Type exports
export type Supplier = typeof suppliers.$inferSelect
export type NewSupplier = typeof suppliers.$inferInsert
export type SupplierModule = typeof supplierModules.$inferSelect
export type NewSupplierModule = typeof supplierModules.$inferInsert
export type SupplierLog = typeof supplierLogs.$inferSelect
export type NewSupplierLog = typeof supplierLogs.$inferInsert
