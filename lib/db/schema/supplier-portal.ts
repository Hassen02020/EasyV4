/**
 * SUPPLIER PORTAL — L0/L1 Foundation (Phase 35)
 *
 * Modélise les deux briques manquantes pour qu'un fournisseur externe
 * rejoigne le réseau Easy2Book, quel que soit son niveau technologique :
 *
 * supplier_nodes
 *   Un "Nœud Fournisseur" dans le réseau Easy2Book : identité, contact,
 *   modules couverts, statut d'onboarding, niveau de connectivité cible.
 *   Un nœud correspond toujours à une ligne de la table `suppliers`.
 *   Séparé de `suppliers` (définition technique + API credentials) pour
 *   ne pas mélanger les couches : `suppliers` = comment on parle au
 *   fournisseur ; `supplier_nodes` = qui est le fournisseur dans le réseau.
 *
 * supplier_portal_users
 *   Les utilisateurs humains qui ont accès au portail d'un nœud donné.
 *   Référence un userId Supabase Auth existant et définit le rôle portail :
 *   owner → accès total (seul à pouvoir transférer le nœud)
 *   manager → produits + disponibilités + bookings, pas les paramètres du compte
 *   staff → lecture seule + confirmation de présence
 *
 * Pattern identique à hotel_supplier_credentials : aucun secret dans ces
 * tables ; tout secret passe par lib/security/secret-crypto.ts.
 */

import {
  pgTable,
  pgEnum,
  uuid,
  varchar,
  text,
  boolean,
  timestamp,
  jsonb,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core"
import { suppliers } from "./suppliers"

export const supplierOnboardingStatus = pgEnum("supplier_onboarding_status", [
  "invited",        // Invitation envoyée, pas encore acceptée
  "onboarding",     // En cours d'onboarding (formulaire, documents)
  "pending_review", // Soumis, en attente de validation Easy2Book
  "active",         // Validé et actif dans le réseau
  "suspended",      // Suspendu (violation, non-paiement, …)
  "offboarded",     // Quitte le réseau
])

export const supplierPortalUserRole = pgEnum("supplier_portal_user_role", [
  "owner",   // Accès complet + paramètres compte + transfert de nœud
  "manager", // Produits + disponibilités + bookings ; pas les paramètres
  "staff",   // Lecture + confirmation de présence ; pas d'édition
])

/**
 * Nœud Fournisseur dans le réseau Easy2Book.
 * Représente le fournisseur en tant qu'ENTITÉ RÉSEAU (pas la config technique).
 */
export const supplierNodes = pgTable(
  "supplier_nodes",
  {
    id: uuid("id").primaryKey().defaultRandom(),

    /** Référence la définition technique du fournisseur (type, connectivity level…). */
    supplierId: uuid("supplier_id")
      .notNull()
      .references(() => suppliers.id, { onDelete: "restrict" }),

    /** Slug unique pour les URLs du portail (ex. "artisan-poterie-nabeul"). */
    slug: varchar("slug", { length: 100 }).notNull(),

    /** Nom commercial affiché dans le réseau. */
    displayName: varchar("display_name", { length: 200 }).notNull(),

    /** Description publique courte (pitch deck réseau). */
    shortDescription: text("short_description"),

    // Contact primaire (propriétaire du nœud)
    contactName: varchar("contact_name", { length: 200 }),
    contactEmail: varchar("contact_email", { length: 320 }),
    contactPhone: varchar("contact_phone", { length: 32 }),
    contactCountry: varchar("contact_country", { length: 3 }), // ISO 3166

    // Modules que ce fournisseur couvre dans le réseau
    // ex. ["activity","transfer"] pour un DMC local
    modules: jsonb("modules").$type<string[]>().notNull().default([]),

    onboardingStatus: supplierOnboardingStatus("onboarding_status")
      .notNull()
      .default("invited"),

    /** Accès portail activé (false pendant onboarding, true après validation). */
    portalEnabled: boolean("portal_enabled").notNull().default(false),

    /** URL du logo/photo de profil du fournisseur (stockée dans le Media System). */
    logoUrl: text("logo_url"),

    /** Notes internes Easy2Book (jamais affichées au fournisseur). */
    internalNotes: text("internal_notes"),

    /** Utilisateur Easy2Book qui a créé/invité ce nœud. */
    invitedByUserId: uuid("invited_by_user_id"),

    /** Date à laquelle le nœud a été validé et rendu actif. */
    activatedAt: timestamp("activated_at", { withTimezone: true }),

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("supplier_nodes_slug_uniq").on(t.slug),
    uniqueIndex("supplier_nodes_supplier_uniq").on(t.supplierId),
    index("supplier_nodes_onboarding_idx").on(t.onboardingStatus),
    index("supplier_nodes_portal_idx").on(t.portalEnabled),
  ],
)

/**
 * Utilisateurs humains ayant accès au portail d'un nœud fournisseur.
 * Un même userId peut être owner sur plusieurs nœuds (cas d'un DMC gérant
 * plusieurs entités), mais ne peut avoir qu'un rôle par nœud.
 */
export const supplierPortalUsers = pgTable(
  "supplier_portal_users",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    supplierNodeId: uuid("supplier_node_id")
      .notNull()
      .references(() => supplierNodes.id, { onDelete: "cascade" }),

    /** userId Supabase Auth — jamais nul une fois l'invitation acceptée. */
    userId: uuid("user_id").notNull(),

    role: supplierPortalUserRole("role").notNull().default("staff"),

    /** E-mail de l'invitation (avant que l'utilisateur ait un userId). */
    invitedEmail: varchar("invited_email", { length: 320 }),

    /** Token d'invitation (HMAC signé, TTL 7 jours) — nul après acceptation. */
    invitationToken: varchar("invitation_token", { length: 128 }),
    invitationTokenExpiresAt: timestamp("invitation_token_expires_at", { withTimezone: true }),

    invitedAt: timestamp("invited_at", { withTimezone: true }).notNull().defaultNow(),
    acceptedAt: timestamp("accepted_at", { withTimezone: true }),

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("supplier_portal_users_node_user_uniq").on(t.supplierNodeId, t.userId),
    index("supplier_portal_users_user_idx").on(t.userId),
    index("supplier_portal_users_node_idx").on(t.supplierNodeId),
    index("supplier_portal_users_role_idx").on(t.role),
  ],
)

// Type exports
export type SupplierNode = typeof supplierNodes.$inferSelect
export type NewSupplierNode = typeof supplierNodes.$inferInsert
export type SupplierPortalUser = typeof supplierPortalUsers.$inferSelect
export type NewSupplierPortalUser = typeof supplierPortalUsers.$inferInsert
export type SupplierOnboardingStatus = (typeof supplierOnboardingStatus.enumValues)[number]
export type SupplierPortalUserRole = (typeof supplierPortalUserRole.enumValues)[number]
