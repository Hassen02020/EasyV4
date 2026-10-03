/**
 * Produits — sous-schéma résiduel.
 *
 * La table `products`, les enums `product_type`/`product_status` et la table
 * `product_inventory` sont définis dans `lib/db/schema.ts` (source de vérité).
 * Ce fichier ne contient que les éléments qui ne dupliquent PAS l'authoritative
 * schema :
 *   – `inventoryStatus` (uniquement ici)
 *   – `apiLogs` (uniquement ici)
 *
 * FIX-SCHEMA-01 / FIX-STATUS-01 (2026-10-03) : supprimé les doubles
 * définitions de `products`, `product_type`, `product_status` et
 * `product_inventory` qui coexistaient avec schema.ts et auraient causé un
 * crash Drizzle lors de la prochaine `db:generate`.
 */

import {
  boolean,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uuid,
  varchar,
} from "drizzle-orm/pg-core"

/* -------------------------------------------------------------------------- */
/* Enum inventoryStatus (uniquement ici)                                        */
/* -------------------------------------------------------------------------- */

export const inventoryStatus = pgEnum("inventory_status", [
  "available",
  "limited",
  "on_request",
  "sold_out",
])

/* -------------------------------------------------------------------------- */
/* API Logs (Traçabilité des appels XML/REST fournisseurs)                     */
/* -------------------------------------------------------------------------- */

export const apiLogs = pgTable(
  "api_logs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    supplierId: uuid("supplier_id"),
    operation: varchar("operation", { length: 50 }).notNull(),
    module: varchar("module", { length: 50 }).notNull(),
    requestPayload: text("request_payload"),
    requestHeaders: jsonb("request_headers").$type<Record<string, string>>(),
    requestUrl: text("request_url"),
    requestMethod: varchar("request_method", { length: 10 }),
    responsePayload: text("response_payload"),
    responseHeaders: jsonb("response_headers").$type<Record<string, string>>(),
    statusCode: integer("status_code"),
    durationMs: integer("duration_ms"),
    success: boolean("success").notNull().default(false),
    errorType: varchar("error_type", { length: 100 }),
    errorMessage: text("error_message"),
    errorCode: varchar("error_code", { length: 50 }),
    reservationId: uuid("reservation_id"),
    productId: uuid("product_id"),
    sessionId: varchar("session_id", { length: 100 }),
    environment: varchar("environment", { length: 20 }).default("production"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    { name: "api_logs_supplier_idx", on: t.supplierId },
    { name: "api_logs_reservation_idx", on: t.reservationId },
    { name: "api_logs_operation_idx", on: t.operation },
    { name: "api_logs_success_idx", on: t.success },
    { name: "api_logs_created_idx", on: t.createdAt },
  ],
)

export type ApiLog = typeof apiLogs.$inferSelect
export type NewApiLog = typeof apiLogs.$inferInsert
