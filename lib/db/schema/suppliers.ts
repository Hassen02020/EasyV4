/**
 * Schéma pour la configuration des fournisseurs API XML
 * Permet de connecter l'application à des fournisseurs externes (MyGo, Amadeus, etc.)
 *
 * Phase 34 — Supplier Connectivity Ladder (L0→L5) :
 * Deux concepts distincts ajoutés sur la table suppliers :
 *
 *   connectivityLevel  : "comment parle-t-on au fournisseur ?" — technique pure.
 *   certificationStatus : "quelle est la valeur commerciale du fournisseur ?" — qualité.
 *
 * Les deux sont VOLONTAIREMENT SÉPARÉS (cf. vision produit §5) :
 * un artisan L0 peut être premium_partner ; un GDS L5 peut être simplement registered.
 * Ne jamais utiliser connectivityLevel comme proxy de qualité commerciale.
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

/**
 * Connectivity Ladder L0→L5 — dimension TECHNIQUE uniquement.
 * Représente "comment le fournisseur échange des données avec Easy2Book",
 * pas sa valeur commerciale.
 *
 * L0 : aucun logiciel — gestion 100% via le Supplier Portal Easy2Book
 * L1 : le fournisseur opère son propre Supplier Node dans la plateforme
 * L2 : synchronisation fichier structuré (CSV, Excel)
 * L3 : API REST/JSON — search/availability/booking/cancel
 * L4 : XML/SOAP/GDS/NDC/standards B2B (OTA, travelgate, …)
 * L5 : intégration native temps réel — webhooks, inventory live, reconciliation SLA
 */
export const supplierConnectivityLevel = pgEnum("supplier_connectivity_level", [
  "l0_manual",
  "l1_portal",
  "l2_file",
  "l3_api",
  "l4_xml_gds",
  "l5_native",
])

/**
 * Certification commerciale du fournisseur — dimension QUALITÉ uniquement.
 * Indépendante du niveau de connectivité.
 */
export const supplierCertificationStatus = pgEnum("supplier_certification_status", [
  "registered",
  "verified",
  "connected",
  "certified",
  "premium_partner",
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
    config: jsonb("config").$type<Record<string, unknown>>(),
    
    // Métadonnées
    logoUrl: text("logo_url"),
    website: text("website"),
    supportEmail: varchar("support_email", { length: 320 }),
    supportPhone: varchar("support_phone", { length: 32 }),
    
    // Connectivity Ladder (Phase 34)
    connectivityLevel: supplierConnectivityLevel("connectivity_level").notNull().default("l0_manual"),
    certificationStatus: supplierCertificationStatus("certification_status").notNull().default("registered"),

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
    config: jsonb("config").$type<Record<string, unknown>>(),
    
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
    details: jsonb("details").$type<Record<string, unknown>>(),
    
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

export type SupplierConnectivityLevel = (typeof supplierConnectivityLevel.enumValues)[number]
export type SupplierCertificationStatus = (typeof supplierCertificationStatus.enumValues)[number]
