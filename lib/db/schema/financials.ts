/**
 * Schéma Financier — Easy2Book V6
 *
 * Domaines couverts :
 *  - Wallet Ledger (double-entry accounting)
 *  - Grand Livre / Journal Entries
 *  - Règles de marge (Margin Rules Engine)
 *  - Financials par réservation (prix achat vs vente)
 *
 * Principe d'atomicité :
 *  Toute opération financière doit être exécutée dans une transaction Drizzle.
 *  Chaque mouvement wallet enregistre balanceBefore + balanceAfter pour auditabilité.
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
/* Enums                                                                       */
/* -------------------------------------------------------------------------- */

export const walletAccountType = pgEnum("wallet_account_type", [
  "credit",     // Compte de dépôt (solde positif)
  "debit",      // Compte de débit (solde négatif autorisé)
  "escrow",     // Compte séquestre (acomptes en attente)
  "commission", // Compte de commission Easy2Book
])

export const walletTxTypeV6 = pgEnum("wallet_tx_type_v6", [
  "credit",     // Entrée (recharge, remboursement reçu)
  "debit",      // Sortie (réservation, commission)
  "refund",     // Remboursement sortant
  "adjustment", // Ajustement manuel admin
  "commission", // Commission Easy2Book prélevée
  "escrow_in",  // Mise en séquestre
  "escrow_out", // Libération du séquestre
])

export const walletTxStatusV6 = pgEnum("wallet_tx_status_v6", [
  "pending",   // En attente (séquestre)
  "completed", // Validée
  "reversed",  // Annulée/Inversée
])

export const marginTypeV6 = pgEnum("margin_type_v6", [
  "percent", // % du prix d'achat
  "fixed",   // Montant fixe ajouté
  "hybrid",  // % + montant fixe
])

export const journalEntryStatus = pgEnum("journal_entry_status", [
  "draft",    // Brouillon
  "posted",   // Passée
  "reversed", // Extournée
])

export const reservationTransition = pgEnum("reservation_transition", [
  "create",
  "submit_payment",
  "payment_success",
  "payment_fail",
  "provider_confirm",
  "provider_reject",
  "cancel",
  "complete",
  "refund",
])

/* -------------------------------------------------------------------------- */
/* Wallet Accounts (Comptes Wallet)                                            */
/* -------------------------------------------------------------------------- */

export const walletAccounts = pgTable(
  "wallet_accounts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    agencyId: uuid("agency_id").notNull(),

    type: walletAccountType("type").notNull().default("credit"),

    // Solde actuel (maintenu dénormalisé pour performance)
    currentBalance: decimal("current_balance", {
      precision: 14,
      scale: 2,
    })
      .notNull()
      .default("0"),

    currency: varchar("currency", { length: 3 }).notNull().default("TND"),

    // Limites
    creditLimit: decimal("credit_limit", { precision: 14, scale: 2 }), // Découvert autorisé
    alertThreshold: decimal("alert_threshold", { precision: 14, scale: 2 }), // Seuil d'alerte

    name: varchar("name", { length: 100 }).notNull(),
    description: text("description"),
    isActive: boolean("is_active").notNull().default(true),

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("wallet_accounts_agency_type_idx").on(t.agencyId, t.type),
  ],
)

/* -------------------------------------------------------------------------- */
/* Wallet Transactions (Mouvements Ledger)                                     */
/* -------------------------------------------------------------------------- */

export const walletLedger = pgTable(
  "wallet_ledger",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    walletAccountId: uuid("wallet_account_id").notNull(),

    // Double-entry: balance avant/après
    type: walletTxTypeV6("type").notNull(),
    status: walletTxStatusV6("status").notNull().default("completed"),
    amount: decimal("amount", { precision: 14, scale: 2 }).notNull(),
    balanceBefore: decimal("balance_before", { precision: 14, scale: 2 }).notNull(),
    balanceAfter: decimal("balance_after", { precision: 14, scale: 2 }).notNull(),

    // Corrélation métier
    reservationId: uuid("reservation_id"),
    paymentId: uuid("payment_id"),
    rechargeRequestId: uuid("recharge_request_id"),
    invoiceId: uuid("invoice_id"),

    // Description
    description: text("description").notNull(),
    category: varchar("category", { length: 50 }), // booking, refund, recharge, commission, fee

    // Audit
    metadata: jsonb("metadata").$type<Record<string, any>>(),
    createdBy: uuid("created_by"),

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    { name: "wallet_ledger_account_idx", on: t.walletAccountId },
    { name: "wallet_ledger_reservation_idx", on: t.reservationId },
    { name: "wallet_ledger_created_idx", on: t.createdAt },
  ],
)

/* -------------------------------------------------------------------------- */
/* Margin Rules Engine                                                         */
/* -------------------------------------------------------------------------- */

export const marginRules = pgTable(
  "margin_rules",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    agencyId: uuid("agency_id").notNull(),

    // Scope de la règle (du plus spécifique au plus général)
    supplierId: uuid("supplier_id"),          // Fournisseur spécifique
    productType: varchar("product_type", { length: 50 }), // hotel, flight, package, transfer, omra
    destination: varchar("destination", { length: 100 }), // Code pays ISO (TN, FR, MA...)

    // Conditions de déclenchement
    minPrice: decimal("min_price", { precision: 14, scale: 2 }),
    maxPrice: decimal("max_price", { precision: 14, scale: 2 }),

    // Valeur de la marge
    type: marginTypeV6("type").notNull().default("percent"),
    percentValue: decimal("percent_value", { precision: 5, scale: 2 }), // % sur le prix achat
    fixedValue: decimal("fixed_value", { precision: 14, scale: 2 }),    // Montant fixe TND

    // Commission Easy2Book (prélevée sur la marge)
    commissionPercent: decimal("commission_percent", { precision: 5, scale: 2 }),

    // Priorité : règle la plus haute gagne (ex: fournisseur > produit > global)
    priority: integer("priority").notNull().default(0),

    // Validité temporelle
    validFrom: date("valid_from"),
    validTo: date("valid_to"),

    name: varchar("name", { length: 200 }).notNull(),
    description: text("description"),
    isActive: boolean("is_active").notNull().default(true),

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    { name: "margin_rules_agency_idx", on: t.agencyId },
    { name: "margin_rules_supplier_idx", on: t.supplierId },
    { name: "margin_rules_priority_idx", on: t.priority },
  ],
)

/* -------------------------------------------------------------------------- */
/* Reservation Financials (Liaison prix achat ↔ vente ↔ marge)                */
/* -------------------------------------------------------------------------- */

export const reservationFinancials = pgTable(
  "reservation_financials",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    reservationId: uuid("reservation_id").notNull(),

    // Prix achat fournisseur (coût réel)
    supplierPrice: decimal("supplier_price", { precision: 14, scale: 2 }).notNull(),
    supplierCurrency: varchar("supplier_currency", { length: 3 }).notNull(),
    supplierPriceTnd: decimal("supplier_price_tnd", { precision: 14, scale: 2 }).notNull(), // Converti en TND

    // Prix de vente client
    salePrice: decimal("sale_price", { precision: 14, scale: 2 }).notNull(),
    saleCurrency: varchar("sale_currency", { length: 3 }).notNull(),
    salePriceTnd: decimal("sale_price_tnd", { precision: 14, scale: 2 }).notNull(), // Converti en TND

    // Marge calculée automatiquement
    marginAmount: decimal("margin_amount", { precision: 14, scale: 2 }).notNull(),
    marginPercent: decimal("margin_percent", { precision: 5, scale: 2 }).notNull(),
    marginRuleId: uuid("margin_rule_id"), // Règle appliquée

    // Commission Easy2Book prélevée
    commissionAmount: decimal("commission_amount", { precision: 14, scale: 2 }).default("0"),
    commissionPercent: decimal("commission_percent", { precision: 5, scale: 2 }).default("0"),

    // Taux de change appliqué
    exchangeRate: decimal("exchange_rate", { precision: 10, scale: 6 }).default("1"),
    exchangeRateAt: timestamp("exchange_rate_at", { withTimezone: true }),

    // Grand Livre
    journalEntryId: uuid("journal_entry_id"),

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("reservation_financials_reservation_idx").on(t.reservationId),
  ],
)

/* -------------------------------------------------------------------------- */
/* Journal Entries (Grand Livre — Double-entry Accounting)                     */
/* -------------------------------------------------------------------------- */

export const journalEntries = pgTable(
  "journal_entries",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    agencyId: uuid("agency_id").notNull(),

    // Référence document
    reference: varchar("reference", { length: 50 }).notNull(), // FAC-2024-001, RES-001
    referenceType: varchar("reference_type", { length: 50 }).notNull(), // invoice, reservation, payment, refund

    // Date comptable
    entryDate: date("entry_date").notNull(),

    // Description
    description: text("description").notNull(),

    // Contrôle (débit = crédit)
    totalDebit: decimal("total_debit", { precision: 14, scale: 2 }).notNull(),
    totalCredit: decimal("total_credit", { precision: 14, scale: 2 }).notNull(),

    status: journalEntryStatus("status").notNull().default("posted"),

    // Audit
    createdBy: uuid("created_by"),
    reversedBy: uuid("reversed_by"),       // Référence à l'écriture d'extourne
    reversedAt: timestamp("reversed_at", { withTimezone: true }),

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    { name: "journal_entries_agency_idx", on: t.agencyId },
    { name: "journal_entries_reference_idx", on: t.reference },
    { name: "journal_entries_date_idx", on: t.entryDate },
  ],
)

export const journalLines = pgTable(
  "journal_lines",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    journalEntryId: uuid("journal_entry_id")
      .notNull()
      .references(() => journalEntries.id, { onDelete: "cascade" }),

    // Plan comptable tunisien (système de comptes 6 chiffres)
    accountCode: varchar("account_code", { length: 20 }).notNull(), // 411000, 701000, 706000...
    accountName: varchar("account_name", { length: 200 }).notNull(),

    // Débit / Crédit
    debit: decimal("debit", { precision: 14, scale: 2 }).notNull().default("0"),
    credit: decimal("credit", { precision: 14, scale: 2 }).notNull().default("0"),

    description: text("description"),

    // Corrélation
    reservationId: uuid("reservation_id"),
    walletLedgerId: uuid("wallet_ledger_id"),
    invoiceId: uuid("invoice_id"),

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    { name: "journal_lines_entry_idx", on: t.journalEntryId },
    { name: "journal_lines_account_idx", on: t.accountCode },
  ],
)

/* -------------------------------------------------------------------------- */
/* Reservation Status Machine Transitions                                       */
/* -------------------------------------------------------------------------- */

export const reservationStatusHistory = pgTable(
  "reservation_status_history",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    reservationId: uuid("reservation_id").notNull(),

    fromStatus: varchar("from_status", { length: 50 }),
    toStatus: varchar("to_status", { length: 50 }).notNull(),
    transition: reservationTransition("transition").notNull(),

    // Contexte du changement
    triggeredBy: uuid("triggered_by"),     // userId ou null si automatique
    automated: boolean("automated").notNull().default(false),
    reason: text("reason"),

    // Payload (ex: réponse fournisseur, réf paiement...)
    metadata: jsonb("metadata").$type<Record<string, any>>(),

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    { name: "res_status_history_reservation_idx", on: t.reservationId },
    { name: "res_status_history_created_idx", on: t.createdAt },
  ],
)

/* -------------------------------------------------------------------------- */
/* Type Exports                                                                 */
/* -------------------------------------------------------------------------- */

export type WalletAccount = typeof walletAccounts.$inferSelect
export type NewWalletAccount = typeof walletAccounts.$inferInsert
export type WalletLedger = typeof walletLedger.$inferSelect
export type NewWalletLedger = typeof walletLedger.$inferInsert
export type MarginRule = typeof marginRules.$inferSelect
export type NewMarginRule = typeof marginRules.$inferInsert
export type ReservationFinancial = typeof reservationFinancials.$inferSelect
export type NewReservationFinancial = typeof reservationFinancials.$inferInsert
export type JournalEntry = typeof journalEntries.$inferSelect
export type NewJournalEntry = typeof journalEntries.$inferInsert
export type JournalLine = typeof journalLines.$inferSelect
export type NewJournalLine = typeof journalLines.$inferInsert
export type ReservationStatusHistory = typeof reservationStatusHistory.$inferSelect
export type NewReservationStatusHistory = typeof reservationStatusHistory.$inferInsert
