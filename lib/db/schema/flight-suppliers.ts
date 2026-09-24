/**
 * Flight Supplier Control Plane — Easy2Book
 *
 * Mirrors the hotel-suppliers pattern:
 *   - flight_supplier_configs     : display/booking mode per agency+supplier (no secrets)
 *   - flight_supplier_credentials : encrypted credentials (ciphertext+keyVersion)
 *
 * `agencyId` avoids a circular Drizzle import (same pattern as hotel-suppliers.ts).
 * The FK constraint is enforced in the SQL migration (0013_flight_supplier_configs.sql).
 */
import {
  pgTable,
  pgEnum,
  uuid,
  text,
  boolean,
  integer,
  timestamp,
  uniqueIndex,
  index,
} from "drizzle-orm/pg-core"

// ---------------------------------------------------------------------------
// Enums
// ---------------------------------------------------------------------------

export const flightDisplayMode = pgEnum("flight_display_mode", ["SITE", "API"])

export const flightBookingMode = pgEnum("flight_booking_mode", [
  "OFFLINE",
  "API",
  "AUTOMATIC",
])

export const flightSupplierName = pgEnum("flight_supplier_name", [
  "virtual",
  "amadeus",
  "travelport",
  "sabre",
])

// ---------------------------------------------------------------------------
// Tables
// ---------------------------------------------------------------------------

export const flightSupplierConfigs = pgTable(
  "flight_supplier_configs",
  {
    id: uuid("id").primaryKey().defaultRandom().notNull(),
    /** Always references a real agencies row — no Drizzle import to avoid cycle. */
    agencyId: uuid("agency_id").notNull(),
    supplier: flightSupplierName("supplier").notNull(),
    displayMode: flightDisplayMode("display_mode").notNull().default("API"),
    /** Only relevant when displayMode = 'SITE'. Enforced at application level. */
    displayUrl: text("display_url"),
    bookingMode: flightBookingMode("booking_mode").notNull().default("OFFLINE"),
    active: boolean("active").notNull().default(true),
    /** Lower value = higher priority when multiple suppliers are active. */
    priority: integer("priority").notNull().default(100),
    /** Quick kill-switch: disables API calls without changing bookingMode. */
    apiEnabled: boolean("api_enabled").notNull().default(false),
    createdByUserId: uuid("created_by_user_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("flight_supplier_configs_agency_supplier_uniq").on(t.agencyId, t.supplier),
    index("flight_supplier_configs_agency_idx").on(t.agencyId),
    index("flight_supplier_configs_active_idx").on(t.active),
  ],
)

export const flightSupplierCredentials = pgTable(
  "flight_supplier_credentials",
  {
    id: uuid("id").primaryKey().defaultRandom().notNull(),
    configId: uuid("config_id").notNull().unique(),
    /** Denormalised from config for RLS scoping without a join. */
    agencyId: uuid("agency_id").notNull(),
    ciphertext: text("ciphertext").notNull(),
    keyVersion: integer("key_version").notNull().default(1),
    updatedByUserId: uuid("updated_by_user_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("flight_supplier_credentials_agency_idx").on(t.agencyId)],
)

// ---------------------------------------------------------------------------
// Inferred types
// ---------------------------------------------------------------------------

export type FlightSupplierConfig = typeof flightSupplierConfigs.$inferSelect
export type NewFlightSupplierConfig = typeof flightSupplierConfigs.$inferInsert
export type FlightSupplierCredential = typeof flightSupplierCredentials.$inferSelect
export type NewFlightSupplierCredential = typeof flightSupplierCredentials.$inferInsert
