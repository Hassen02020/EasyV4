/**
 * PHASE 27 — Multi-Tenant Universal Hotel Supplier Control Plane.
 *
 * Sépare volontairement 4 concepts distincts (voir lib/hotel-suppliers/):
 *   - hotel_suppliers            : définition technique (MyGo, Cyberesa…),
 *                                  aucun secret.
 *   - hotel_supplier_accounts    : un compte fournisseur appartenant à UN
 *                                  scope (master/agence/marque blanche —
 *                                  toujours une ligne réelle de `agencies`,
 *                                  voir ownerType), aucun secret.
 *   - hotel_supplier_credentials : le SEUL endroit où vivent des secrets,
 *                                  toujours chiffrés (lib/security/secret-crypto.ts).
 *   - hotel_supplier_authorizations : autorisation explicite d'un compte
 *                                  MASTER partagé pour une agence/marque
 *                                  blanche donnée — jamais un accès implicite.
 *
 * `agencyId` n'est PAS une référence Drizzle croisée vers `agencies`
 * (définie dans ../schema.ts) — même pattern que schema/financials.ts,
 * pour éviter un cycle d'import schema.ts <-> schema/hotel-suppliers.ts.
 * La contrainte FK réelle est posée en SQL brut dans la migration manuelle.
 */
import {
  pgTable,
  pgEnum,
  uuid,
  varchar,
  text,
  boolean,
  integer,
  jsonb,
  timestamp,
  uniqueIndex,
  index,
} from "drizzle-orm/pg-core"
import { sql } from "drizzle-orm"

export const hotelSupplierDocStatus = pgEnum("hotel_supplier_doc_status", [
  "documented",
  "documentation_required",
])

export const hotelSupplierOwnerType = pgEnum("hotel_supplier_owner_type", [
  "master",
  "agency",
  "whitelabel",
])

export const hotelSupplierAccountStatus = pgEnum("hotel_supplier_account_status", [
  "active",
  "disabled",
  "invalid_credentials",
  "not_configured",
  "error",
])

/**
 * Définition technique d'un fournisseur — code stable, jamais de secret.
 * `code` correspond exactement à SupplierName (lib/hotel-suppliers/core/types.ts).
 */
export const hotelSuppliers = pgTable(
  "hotel_suppliers",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    code: varchar("code", { length: 32 }).notNull(),
    name: varchar("name", { length: 100 }).notNull(),
    driver: varchar("driver", { length: 32 }).notNull(),
    capabilities: jsonb("capabilities").$type<string[]>().notNull().default(sql`'[]'::jsonb`),
    documentationStatus: hotelSupplierDocStatus("documentation_status")
      .notNull()
      .default("documentation_required"),
    isGloballyEnabled: boolean("is_globally_enabled").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("hotel_suppliers_code_uniq").on(t.code)],
)

/**
 * Un compte fournisseur appartenant à un scope précis (master/agence/marque
 * blanche). `agencyId` référence TOUJOURS une ligne réelle de `agencies` —
 * même pour "master" (l'agence OTA par défaut, cf. getDefaultAgencyId()) et
 * pour "whitelabel" (une agence agencyType='ota' avec domain non nul) : le
 * modèle tenant existant (`agencies`) est réutilisé tel quel, aucune
 * nouvelle hiérarchie n'est introduite. `ownerType` est dénormalisé pour la
 * lisibilité/observabilité mais toujours dérivé et validé côté serveur à
 * partir de l'agence réelle au moment de la création — jamais accepté tel
 * quel depuis un client.
 */
export const hotelSupplierAccounts = pgTable(
  "hotel_supplier_accounts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    supplierId: uuid("supplier_id")
      .notNull()
      .references(() => hotelSuppliers.id, { onDelete: "restrict" }),
    ownerType: hotelSupplierOwnerType("owner_type").notNull(),
    agencyId: uuid("agency_id").notNull(),
    displayName: varchar("display_name", { length: 200 }).notNull(),
    status: hotelSupplierAccountStatus("status").notNull().default("not_configured"),
    /** Libre (pas un enum rigide) — seul myGo distingue live/virtual aujourd'hui ; les futurs fournisseurs ne partagent pas forcément ce concept. */
    mode: varchar("mode", { length: 16 }).notNull().default("live"),
    /** Plus petit = priorité plus haute dans le ranking/orchestration de CETTE agence pour CE fournisseur. */
    priority: integer("priority").notNull().default(100),
    timeoutMs: integer("timeout_ms"),
    isDefault: boolean("is_default").notNull().default(false),
    lastTestedAt: timestamp("last_tested_at", { withTimezone: true }),
    lastTestStatus: varchar("last_test_status", { length: 32 }),
    lastTestErrorCode: varchar("last_test_error_code", { length: 64 }),
    createdByUserId: uuid("created_by_user_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("hotel_supplier_accounts_agency_idx").on(t.agencyId),
    index("hotel_supplier_accounts_supplier_idx").on(t.supplierId),
    index("hotel_supplier_accounts_owner_type_idx").on(t.ownerType),
  ],
)

/**
 * Secrets — TOUJOURS chiffrés (lib/security/secret-crypto.ts), jamais en
 * clair. Table séparée du compte pour qu'aucune requête de liste/CRUD
 * ordinaire ne les rapporte jamais par accident (un simple `select()` sur
 * hotel_supplier_accounts ne peut structurellement pas exposer un secret).
 * `agencyId` dénormalisé depuis le compte pour permettre une policy RLS de
 * scoping sans jointure.
 */
export const hotelSupplierCredentials = pgTable(
  "hotel_supplier_credentials",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    accountId: uuid("account_id")
      .notNull()
      .references(() => hotelSupplierAccounts.id, { onDelete: "cascade" }),
    agencyId: uuid("agency_id").notNull(),
    ciphertext: text("ciphertext").notNull(),
    keyVersion: integer("key_version").notNull(),
    updatedByUserId: uuid("updated_by_user_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("hotel_supplier_credentials_account_uniq").on(t.accountId),
    index("hotel_supplier_credentials_agency_idx").on(t.agencyId),
  ],
)

/**
 * Autorisation explicite d'un compte MASTER partagé pour une agence ou
 * marque blanche précise. Jamais d'accès implicite : l'absence de ligne =
 * pas d'accès, quel que soit le statut global du fournisseur.
 */
export const hotelSupplierAuthorizations = pgTable(
  "hotel_supplier_authorizations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    accountId: uuid("account_id")
      .notNull()
      .references(() => hotelSupplierAccounts.id, { onDelete: "cascade" }),
    authorizedAgencyId: uuid("authorized_agency_id").notNull(),
    authorizedByUserId: uuid("authorized_by_user_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("hotel_supplier_authorizations_account_agency_uniq").on(
      t.accountId,
      t.authorizedAgencyId,
    ),
    index("hotel_supplier_authorizations_agency_idx").on(t.authorizedAgencyId),
  ],
)

export type HotelSupplierRow = typeof hotelSuppliers.$inferSelect
export type NewHotelSupplierRow = typeof hotelSuppliers.$inferInsert
export type HotelSupplierAccountRow = typeof hotelSupplierAccounts.$inferSelect
export type NewHotelSupplierAccountRow = typeof hotelSupplierAccounts.$inferInsert
export type HotelSupplierCredentialRow = typeof hotelSupplierCredentials.$inferSelect
export type NewHotelSupplierCredentialRow = typeof hotelSupplierCredentials.$inferInsert
export type HotelSupplierAuthorizationRow = typeof hotelSupplierAuthorizations.$inferSelect
export type NewHotelSupplierAuthorizationRow = typeof hotelSupplierAuthorizations.$inferInsert
