/**
 * Audit sous-schéma — Easy2Book V6
 *
 * FIX-AUDIT-01 (2026-10-03) : supprimé la table `audit_logs` (doublon de
 * celle définie dans lib/db/schema.ts:auditLogs avec les colonnes étendues
 * userEmail/userRole/changes/oldValue/newValue) et l'enum `auditEntityType`
 * (également défini dans schema.ts sous le même nom PostgreSQL avec un
 * vocabulaire différent — conflit Drizzle garanti à la prochaine migration).
 *
 * Ne reste que `auditAction` (enum "audit_action") qui est uniquement défini
 * ici et est réexporté dans le barrel schema.ts.
 */

import { pgEnum } from "drizzle-orm/pg-core"

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
