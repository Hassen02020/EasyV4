/**
 * Schéma Audit — Easy2Book V6
 *
 * Traçabilité complète de toutes les modifications métier
 * Enregistre oldValues/newValues pour chaque action sur les entités
 */

import {
  boolean,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uuid,
  varchar,
} from "drizzle-orm/pg-core"

/* -------------------------------------------------------------------------- */
/* Enums                                                                        */
/* -------------------------------------------------------------------------- */

export const auditAction = pgEnum("audit_action", [
  "create",
  "update",
  "delete",
  "approve",
  "reject",
  "cancel",
  "complete",
  "refund",
  "login",
  "logout",
  "password_change",
  "role_change",
])

export const auditEntityType = pgEnum("audit_entity_type", [
  "reservation",
  "wallet_account",
  "wallet_ledger",
  "margin_rule",
  "product",
  "supplier",
  "user",
  "agency",
  "invoice",
  "journal_entry",
  "recharge_request",
])

/* -------------------------------------------------------------------------- */
/* Audit Logs (Traçabilité complète)                                           */
/* -------------------------------------------------------------------------- */

export const auditLogs = pgTable(
  "audit_logs",
  {
    id: uuid("id").primaryKey().defaultRandom(),

    // Qui a fait l'action
    userId: uuid("user_id"),
    agencyId: uuid("agency_id"),

    // Quelle entité a été modifiée
    entityType: auditEntityType("entity_type").notNull(),
    entityId: uuid("entity_id").notNull(),

    // Quelle action
    action: auditAction("action").notNull(),

    // Avant / Après (pour diff et rollback)
    oldValues: jsonb("old_values").$type<Record<string, any>>(),
    newValues: jsonb("new_values").$type<Record<string, any>>(),

    // Contexte
    description: text("description"),
    reason: text("reason"), // Motif de l'action (ex: annulation client)

    // Informations techniques
    ipAddress: varchar("ip_address", { length: 45 }), // IPv4 ou IPv6
    userAgent: text("user_agent"),
    requestId: varchar("request_id", { length: 100 }), // Pour corrélation entre logs

    // Métadonnées additionnelles
    metadata: jsonb("metadata").$type<Record<string, any>>(),

    // Timestamp
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    { name: "audit_logs_user_idx", on: t.userId },
    { name: "audit_logs_agency_idx", on: t.agencyId },
    { name: "audit_logs_entity_idx", on: t.entityType },
    { name: "audit_logs_entity_id_idx", on: t.entityId },
    { name: "audit_logs_action_idx", on: t.action },
    { name: "audit_logs_created_idx", on: t.createdAt },
  ],
)

/* -------------------------------------------------------------------------- */
/* Type Exports                                                                 */
/* -------------------------------------------------------------------------- */

export type AuditLog = typeof auditLogs.$inferSelect
export type NewAuditLog = typeof auditLogs.$inferInsert
