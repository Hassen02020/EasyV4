/**
 * Schéma pour le workflow de validation des réservations
 * Permet de suivre et gérer le processus de validation des réservations
 */

import { pgEnum, pgTable, uuid, varchar, text, boolean, timestamp, jsonb } from "drizzle-orm/pg-core"

export const validationStatus = pgEnum("validation_status", [
  "pending",
  "pending_supplier",
  "pending_payment",
  "approved",
  "rejected",
  "cancelled",
])

export const validationStep = pgEnum("validation_step", [
  "initial",
  "supplier_check",
  "availability_check",
  "price_verification",
  "payment_verification",
  "final_approval",
])

export const reservationValidations = pgTable(
  "reservation_validations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    reservationId: uuid("reservation_id").notNull(),
    
    // Workflow status
    status: validationStatus("status").notNull().default("pending"),
    currentStep: validationStep("current_step").notNull().default("initial"),
    
    // Validation details
    supplierId: uuid("supplier_id"), // Fournisseur API utilisé
    supplierReference: varchar("supplier_reference", { length: 100 }), // Réf fournisseur
    
    // Availability check
    availabilityChecked: boolean("availability_checked").notNull().default(false),
    availabilityConfirmed: boolean("availability_confirmed"),
    availabilityMessage: text("availability_message"),
    
    // Price verification
    priceVerified: boolean("price_verified").notNull().default(false),
    originalPrice: varchar("original_price", { length: 20 }),
    verifiedPrice: varchar("verified_price", { length: 20 }),
    priceDifference: varchar("price_difference", { length: 20 }),
    
    // Payment verification
    paymentVerified: boolean("payment_verified").notNull().default(false),
    paymentMethod: varchar("payment_method", { length: 50 }),
    paymentReference: varchar("payment_reference", { length: 100 }),
    
    // Rejection details
    rejectionReason: text("rejection_reason"),
    rejectionCategory: varchar("rejection_category", { length: 50 }), // price, availability, policy, other
    
    // Additional data
    metadata: jsonb("metadata").$type<Record<string, any>>(),
    
    // Timestamps
    submittedAt: timestamp("submitted_at", { withTimezone: true }).notNull().defaultNow(),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    reviewedBy: uuid("reviewed_by"),
    
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    { name: "reservation_validations_reservation_idx", on: t.reservationId },
    { name: "reservation_validations_status_idx", on: t.status },
    { name: "reservation_validations_step_idx", on: t.currentStep },
  ],
)

export const validationComments = pgTable(
  "validation_comments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    validationId: uuid("validation_id")
      .notNull()
      .references(() => reservationValidations.id, { onDelete: "cascade" }),
    
    userId: uuid("user_id").notNull(),
    
    comment: text("comment").notNull(),
    isInternal: boolean("is_internal").notNull().default(false), // Visible au client ou non
    
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    { name: "validation_comments_validation_idx", on: t.validationId },
    { name: "validation_comments_user_idx", on: t.userId },
  ],
)

export const validationHistory = pgTable(
  "validation_history",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    validationId: uuid("validation_id")
      .notNull()
      .references(() => reservationValidations.id, { onDelete: "cascade" }),
    
    // Change tracking
    fromStatus: validationStatus("from_status"),
    toStatus: validationStatus("to_status").notNull(),
    fromStep: validationStep("from_step"),
    toStep: validationStep("to_step"),
    
    // Who made the change
    userId: uuid("user_id"),
    automated: boolean("automated").notNull().default(false), // Change système ou manuel
    
    // Additional context
    reason: text("reason"),
    metadata: jsonb("metadata").$type<Record<string, any>>(),
    
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    { name: "validation_history_validation_idx", on: t.validationId },
    { name: "validation_history_created_idx", on: t.createdAt },
  ],
)

// Type exports
export type ReservationValidation = typeof reservationValidations.$inferSelect
export type NewReservationValidation = typeof reservationValidations.$inferInsert
export type ValidationComment = typeof validationComments.$inferSelect
export type NewValidationComment = typeof validationComments.$inferInsert
export type ValidationHistory = typeof validationHistory.$inferSelect
export type NewValidationHistory = typeof validationHistory.$inferInsert
