/**
 * Schéma Drizzle (Postgres / Supabase) — multi-tenant Easy2Book OTA.
 *
 * Conventions :
 *  - Toutes les tables métier ont `agency_id` NOT NULL → indexées en premier.
 *    Permet de poser des policies RLS Supabase de type
 *    `agency_id = (current_setting('app.current_agency')::uuid)`.
 *  - `reservations` est polymorphique : la colonne `module` discrimine
 *    le sous-type, et 1 table d'extension 1-1 stocke les champs spécifiques
 *    (`reservation_hotel`, `reservation_package`, `reservation_activity`,
 *    `reservation_transfer`, `reservation_flight`, `reservation_omra`).
 *  - Multi-currency encaissable : on stocke `original_currency`/
 *    `original_amount` (devise saisie par le client) ET `tnd_amount`
 *    (équivalent TND figé au moment du paiement, pour la comptabilité TN).
 *  - `payments` est dissocié de `reservations` : une réservation peut avoir
 *    plusieurs payments (acompte + solde, ou refunds).
 *
 * Migrations : `pnpm db:generate` produit du SQL dans `drizzle/`,
 * `pnpm db:push` l'applique directement (dev), `pnpm db:migrate` en prod.
 *
 * NB : ce fichier est le SOURCE OF TRUTH. Ne pas éditer le SQL généré.
 */

import { sql } from "drizzle-orm"
import {
  commissionSettlements,
  marginRules,
  marginType,
  walletTxType,
} from "./schema/financials"
import { supplierNodes } from "./schema/supplier-portal"
import { inventoryStatus } from "./schema/products"
import {
  bigint,
  boolean,
  check,
  date,
  decimal,
  index,
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
/* Enums                                                                      */
/* -------------------------------------------------------------------------- */

export const userRole = pgEnum("user_role", [
  "super_admin", // accès cross-agencies (super-admin Easy2Book)
  "manager", // owner agence (OTA)
  "agent_resa", // agent réservation
  "agent_compta", // agent comptabilité
  "agent_excursions", // agent terrain (scan QR activités)
  "partner_owner", // propriétaire d'une agence partenaire B2B
  "partner_agent", // sous-compte agent au sein d'une agence B2B
  "mutuelle_director", // responsable d'un groupe Mutuelle — valide les demandes des membres
  "mutuelle_member", // membre d'un groupe Mutuelle — soumet des demandes de réservation
])

export const agencyType = pgEnum("agency_type", [
  "ota", // OTA Easy2Book elle-même (ou agences en marque blanche)
  "partner", // agence partenaire B2B avec compte de dépôt
])

export const invoiceType = pgEnum("invoice_type", [
  "facture", // facture standard
  "avoir", // note de crédit
  "proforma", // facture proforma
])

export const paymentMode = pgEnum("payment_mode", [
  "transfer", // virement bancaire
  "card", // carte bancaire
  "cash", // espèces
  "credit_account", // compte de dépôt (débit du solde)
  "check", // chèque
])

export const creditMovementType = pgEnum("credit_movement_type", [
  "credit", // recharge du compte (+)
  "debit", // débit (réservation, achat)
  "refund", // remboursement (+)
  "adjustment", // ajustement manuel
])

export const userStatus = pgEnum("user_status", ["active", "suspended"])

export const reservationModule = pgEnum("reservation_module", [
  "hotel",
  "flight",
  "package",
  "activity",
  "transfer",
  "omra",
  "car",
  "hotel_monde",
  /** ECON-PILOT-01 : réservation d'un produit canonique `products` porté par
   * un supplier_node (Network), distincte de "activity" (catalogue agence
   * classique `catalog_activities`) pour ne jamais confondre les deux
   * origines dans le reporting/dashboards — même principe que "hotel_monde"
   * vs "hotel" (drizzle/manual/0051). */
  "network",
])

export const reservationSource = pgEnum("reservation_source", [
  "mygo",
  "internal",
  "amadeus",
  "sabre",
  "travelport",
  "expedia",
  "manual",
])

export const reservationStatus = pgEnum("reservation_status", [
  "pending", // créée, en attente paiement
  "on_request", // hôtel en attente confirmation
  "confirmed",
  "cancelled",
  "no_show",
  "completed", // séjour terminé
  "refunded",
  "expired", // paiement manuel jamais reçu sous 24h (payment_expires_at dépassé)
])

export const paymentStatus = pgEnum("payment_status", [
  "pending",
  "authorized",
  "captured",
  "failed",
  "refunded",
  "partial_refund",
])

export const paymentMethod = pgEnum("payment_method", [
  "card", // CB SPS
  "wallet", // futur (Edinar/D17)
  "transfer", // virement
  "cash",
  "at_hotel", // myGo MethodPayment=10
])

export const paymentPsp = pgEnum("payment_psp", [
  "sps", // SPS Monétique Tunisie (local — futur)
  "stripe", // Stripe (international — anticipé)
  "manual", // Validation manuelle admin (wallet recharge)
  "virtual", // Virtual Payment Provider — test/dev uniquement, jamais en prod
  "paymee", // Paymee (PSP tunisien réel — paiement B2C en ligne, redirection hébergée)
])

export const transferVehicleType = pgEnum("transfer_vehicle_type", [
  "sedan",
  "van",
  "minibus",
  "bus",
  "luxury",
])

/* -------------------------------------------------------------------------- */
/* Multi-tenant root: agencies                                                */
/* -------------------------------------------------------------------------- */

export const agencies = pgTable(
  "agencies",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    slug: varchar("slug", { length: 64 }).notNull(),
    name: varchar("name", { length: 200 }).notNull(),
    brandName: varchar("brand_name", { length: 200 }),
    contactEmail: varchar("contact_email", { length: 320 }),
    contactPhone: varchar("contact_phone", { length: 32 }),
    /** Type d'agence : OTA (Easy2Book) ou agence B2B partenaire. */
    agencyType: agencyType("agency_type").notNull().default("ota"),
    /** Matricule fiscale tunisien (format `1234567/A/B/C/000`). */
    matriculeFiscale: varchar("matricule_fiscale", { length: 32 }),
    /** Registre de commerce. */
    registreCommerce: varchar("registre_commerce", { length: 64 }),
    /** Adresse postale complète. */
    address: text("address"),
    /** Fax (optionnel). */
    fax: varchar("fax", { length: 32 }),
    /** URL du logo de l'agence (CDN/Supabase Storage). */
    logoUrl: text("logo_url"),
    /** Couleur d'accent White Label (`#RRGGBB`) — surcharge `--primary` sur le storefront public de cette agence, sinon la teinte corail par défaut. */
    primaryColor: varchar("primary_color", { length: 7 }),
    /** Numéro WhatsApp de l'agence (format international sans +, ex. "21698140514"). */
    whatsappNumber: varchar("whatsapp_number", { length: 32 }),
    /** URL page Facebook de l'agence. */
    facebookUrl: text("facebook_url"),
    /** URL profil Instagram de l'agence. */
    instagramUrl: text("instagram_url"),
    /** URL profil TikTok de l'agence. */
    tiktokUrl: text("tiktok_url"),
    /** Langue par défaut (fr/en/ar/tr). */
    defaultLanguage: varchar("default_language", { length: 4 })
      .notNull()
      .default("fr"),
    /** Devise par défaut affichée à l'utilisateur (TND/EUR/USD/DZD). */
    defaultCurrency: varchar("default_currency", { length: 3 })
      .notNull()
      .default("TND"),
    /** B2B : masquer le widget "Mon Crédit" dans l'interface. */
    maskCredit: boolean("mask_credit").notNull().default(false),
    /**
     * B2B : solde du compte de dépôt en TND (recharge prépayée).
     *
     * Précision `numeric(12, 3)` : TND est une devise à 3 décimales
     * (millimes). Plage couverte : −999 999 999.999 → 999 999 999.999 DT.
     */
    depositBalance: decimal("deposit_balance", { precision: 12, scale: 3 })
      .notNull()
      .default("0"),
    /** B2B : seuil d'alerte solde bas (déclenche notif). */
    creditLowThreshold: decimal("credit_low_threshold", {
      precision: 12,
      scale: 3,
    })
      .notNull()
      .default("100.000"),
    /**
     * B2B : tolérance de réservation — l'agence peut confirmer une
     * réservation même si `deposit_balance` devient temporairement négatif,
     * dans cette limite (`booking_capacity = deposit_balance +
     * reservation_tolerance`, voir `lib/pro/booking-actions.ts::debitPartnerCredit`).
     * Configurée par le Master Admin (`setAgencyReservationTolerance`,
     * `lib/admin/agencies-actions.ts`) — jamais par l'agence elle-même.
     * Le plancher `deposit_balance >= -reservation_tolerance` reste imposé
     * au niveau DB (voir migration 0050) : défense en profondeur, même
     * garantie que `agencies_deposit_balance_nonnegative` avant elle.
     */
    reservationTolerance: decimal("reservation_tolerance", {
      precision: 12,
      scale: 3,
    })
      .notNull()
      .default("0"),
    /** Devises affichées au client (front). La 1ʳᵉ est la devise par défaut. */
    displayCurrencies: text("display_currencies")
      .array()
      .notNull()
      .default(sql`ARRAY['TND','EUR','USD']::text[]`),
    /** Devises encaissables. */
    settlementCurrencies: text("settlement_currencies")
      .array()
      .notNull()
      .default(sql`ARRAY['TND']::text[]`),
    /** TVA par défaut (ex. 19 = 19 %). */
    defaultVatRate: decimal("default_vat_rate", { precision: 5, scale: 2 })
      .notNull()
      .default("19.00"),
    status: varchar("status", { length: 16 }).notNull().default("active"),
    /**
     * White Label (Phase 13.1) : hôte/domaine public dédié à cette agence
     * quand elle sert un storefront de marque blanche (ex.
     * "voyages.exemple.tn"). NULL pour Easy2Book B2C et pour les agences
     * partenaires B2B classiques (`/pro` reste leur seul accès, pas de
     * domaine dédié). Résolution : `lib/tenant/resolve-tenant.ts`.
     */
    domain: varchar("domain", { length: 255 }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("agencies_slug_uniq").on(t.slug),
    index("agencies_type_idx").on(t.agencyType),
    uniqueIndex("agencies_domain_uniq").on(t.domain),
    check("agencies_status_check", sql`${t.status} in ('active','suspended')`),
  ],
)

/* -------------------------------------------------------------------------- */
/* Mutuelles — distributeurs privés B2B2C (chantier "Mutuelle", voir           */
/* docs/audits/architecture-vision-audit.md). PAS une agence : un groupe      */
/* Mutuelle négocie une convention avec Easy2Book, valide les demandes de ses */
/* membres puis les transmet à une agence d'exécution réelle qui gère la      */
/* réservation — jamais de logique de réservation ici, uniquement l'identité  */
/* du groupe et ses conditions commerciales (chantier 1 : fondation données   */
/* seule ; catalogue autorisé/markup appliqué/workflow de validation =        */
/* chantiers suivants).                                                       */
/* -------------------------------------------------------------------------- */

export const mutuelleGroups = pgTable(
  "mutuelle_groups",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    slug: varchar("slug", { length: 64 }).notNull(),
    /** Identité / raison sociale du groupe (ex. "Mutuelle Générale de Tunisie"). */
    name: varchar("name", { length: 200 }).notNull(),
    /** Agence Easy2Book chargée d'exécuter les réservations validées de ce groupe. */
    executionAgencyId: uuid("execution_agency_id")
      .notNull()
      .references(() => agencies.id, { onDelete: "restrict" }),
    /** Taux de markup unique de la convention (%), appliqué au prix agence. */
    markupPercent: decimal("markup_percent", { precision: 5, scale: 2 })
      .notNull()
      .default("0"),
    /** Convention Easy2Book : bornes de validité (NULL = durée indéterminée). */
    conventionStartDate: date("convention_start_date"),
    conventionEndDate: date("convention_end_date"),
    contactEmail: varchar("contact_email", { length: 320 }),
    contactPhone: varchar("contact_phone", { length: 32 }),
    status: varchar("status", { length: 16 }).notNull().default("active"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("mutuelle_groups_slug_uniq").on(t.slug),
    index("mutuelle_groups_execution_agency_idx").on(t.executionAgencyId),
  ],
)

/* -------------------------------------------------------------------------- */
/* Users (admin/staff). Mappés sur Supabase auth.users via id (uuid).         */
/* -------------------------------------------------------------------------- */

export const users = pgTable(
  "users",
  {
    /** Doit correspondre à `auth.users.id` côté Supabase. */
    id: uuid("id").primaryKey(),
    agencyId: uuid("agency_id")
      .notNull()
      .references(() => agencies.id, { onDelete: "restrict" }),
    email: varchar("email", { length: 320 }).notNull(),
    name: varchar("name", { length: 200 }),
    role: userRole("role").notNull().default("agent_resa"),
    status: userStatus("status").notNull().default("active"),
    twoFactorEnabled: boolean("two_factor_enabled").notNull().default(false),
    lastLoginAt: timestamp("last_login_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    /** Renseigné uniquement pour role IN ('mutuelle_director','mutuelle_member') — NULL pour tout le reste. */
    mutuelleGroupId: uuid("mutuelle_group_id").references(
      () => mutuelleGroups.id,
      { onDelete: "restrict" },
    ),
  },
  (t) => [
    index("users_agency_idx").on(t.agencyId),
    uniqueIndex("users_email_uniq").on(t.email),
    index("users_mutuelle_group_idx").on(t.mutuelleGroupId),
  ],
)

/* -------------------------------------------------------------------------- */
/* Mutuelle — demandes membres (chantier "fondation cycle demande→validation",*/
/* voir drizzle/manual/0062_mutuelle_requests.sql). Portée volontairement     */
/* minimale : pas de catalogue restreint (description libre), pas            */
/* d'application du markup, pas de transmission automatique vers une vraie   */
/* réservation — chantiers suivants explicites.                              */
/* -------------------------------------------------------------------------- */

export const mutuelleRequestStatus = pgEnum("mutuelle_request_status", [
  "pending",
  "approved",
  "rejected",
])

export const mutuelleRequests = pgTable(
  "mutuelle_requests",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    groupId: uuid("group_id")
      .notNull()
      .references(() => mutuelleGroups.id, { onDelete: "restrict" }),
    memberUserId: uuid("member_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    /** Réutilise l'enum reservation_module existant — aucun catalogue restreint n'existe encore, ce champ reste une indication libre du besoin. */
    module: reservationModule("module").notNull(),
    description: text("description").notNull(),
    travelStartDate: date("travel_start_date").notNull(),
    travelEndDate: date("travel_end_date").notNull(),
    paxCount: integer("pax_count").notNull().default(1),
    status: mutuelleRequestStatus("status").notNull().default("pending"),
    directorNote: text("director_note"),
    reviewedByUserId: uuid("reviewed_by_user_id").references(() => users.id),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("mutuelle_requests_group_idx").on(t.groupId),
    index("mutuelle_requests_member_idx").on(t.memberUserId),
    index("mutuelle_requests_status_idx").on(t.status),
  ],
)

export type MutuelleRequest = typeof mutuelleRequests.$inferSelect
export type NewMutuelleRequest = typeof mutuelleRequests.$inferInsert

/* -------------------------------------------------------------------------- */
/* Mutuelle — catalogue privé (chantier "canal B2B2C", voir                   */
/* drizzle/manual/0063_mutuelle_catalog.sql). Le directeur sélectionne, parmi */
/* le catalogue réel de l'agence d'exécution du groupe, les produits visibles */
/* par ses membres. Pas de FK typée sur product_id : il pointe vers           */
/* catalogPackages.id / catalogActivities.id / omraPackages.id selon          */
/* productType — validé côté Server Action, jamais en DB.                    */
/* -------------------------------------------------------------------------- */

export const mutuelleCatalogProductType = pgEnum(
  "mutuelle_catalog_product_type",
  ["package", "activity", "omra"],
)

export const mutuelleCatalogItems = pgTable(
  "mutuelle_catalog_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    groupId: uuid("group_id")
      .notNull()
      .references(() => mutuelleGroups.id, { onDelete: "restrict" }),
    productType: mutuelleCatalogProductType("product_type").notNull(),
    productId: uuid("product_id").notNull(),
    addedByUserId: uuid("added_by_user_id")
      .notNull()
      .references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("mutuelle_catalog_items_uniq").on(
      t.groupId,
      t.productType,
      t.productId,
    ),
    index("mutuelle_catalog_items_group_idx").on(t.groupId),
    index("mutuelle_catalog_items_product_idx").on(t.productType, t.productId),
  ],
)

export type MutuelleCatalogItem = typeof mutuelleCatalogItems.$inferSelect
export type NewMutuelleCatalogItem = typeof mutuelleCatalogItems.$inferInsert

/* -------------------------------------------------------------------------- */
/* Customers (clients finaux)                                                 */
/* -------------------------------------------------------------------------- */

export const customers = pgTable(
  "customers",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    agencyId: uuid("agency_id")
      .notNull()
      .references(() => agencies.id, { onDelete: "restrict" }),
    /** Si compte client : auth Supabase. Sinon (booking guest) : null. */
    authUserId: uuid("auth_user_id"),
    civility: varchar("civility", { length: 8 }), // M / Mme / Mlle
    firstName: varchar("first_name", { length: 100 }).notNull(),
    lastName: varchar("last_name", { length: 100 }).notNull(),
    email: varchar("email", { length: 320 }),
    phone: varchar("phone", { length: 32 }),
    /** CIN tunisienne ou passeport. */
    civicId: varchar("civic_id", { length: 64 }),
    civicIdType: varchar("civic_id_type", { length: 16 }), // 'cin' | 'passport'
    birthDate: date("birth_date"),
    nationality: varchar("nationality", { length: 64 }),
    country: varchar("country", { length: 64 }),
    city: varchar("city", { length: 100 }),
    address: text("address"),
    language: varchar("language", { length: 8 }).default("fr"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("customers_agency_idx").on(t.agencyId),
    index("customers_email_idx").on(t.email),
    index("customers_civic_idx").on(t.civicId),
  ],
)

/* -------------------------------------------------------------------------- */
/* Currencies & exchange rates                                                */
/* -------------------------------------------------------------------------- */

export const currencies = pgTable("currencies", {
  code: varchar("code", { length: 3 }).primaryKey(), // ISO 4217: TND, EUR, USD...
  symbol: varchar("symbol", { length: 8 }).notNull(),
  name: varchar("name", { length: 100 }).notNull(),
  decimals: integer("decimals").notNull().default(2),
})

export const exchangeRates = pgTable(
  "exchange_rates",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    agencyId: uuid("agency_id")
      .notNull()
      .references(() => agencies.id, { onDelete: "restrict" }),
    fromCode: varchar("from_code", { length: 3 })
      .notNull()
      .references(() => currencies.code),
    toCode: varchar("to_code", { length: 3 })
      .notNull()
      .references(() => currencies.code),
    rate: decimal("rate", { precision: 18, scale: 8 }).notNull(),
    /** Source : 'manual' / 'ecb' / 'bct'. */
    source: varchar("source", { length: 16 }).notNull().default("manual"),
    validFrom: timestamp("valid_from", { withTimezone: true })
      .notNull()
      .defaultNow(),
    validTo: timestamp("valid_to", { withTimezone: true }),
  },
  (t) => [
    index("exchange_rates_agency_idx").on(t.agencyId),
    index("exchange_rates_pair_idx").on(t.fromCode, t.toCode, t.validFrom),
  ],
)

/* -------------------------------------------------------------------------- */
/* Reservations (polymorphic)                                                 */
/* -------------------------------------------------------------------------- */

export const reservations = pgTable(
  "reservations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    agencyId: uuid("agency_id")
      .notNull()
      .references(() => agencies.id, { onDelete: "restrict" }),
    /** Référence publique courte (ex. TG-2026-000123). */
    publicRef: varchar("public_ref", { length: 32 }).notNull(),
    customerId: uuid("customer_id")
      .notNull()
      .references(() => customers.id, { onDelete: "restrict" }),
    module: reservationModule("module").notNull(),
    source: reservationSource("source").notNull(),
    status: reservationStatus("status").notNull().default("pending"),
    originalCurrency: varchar("original_currency", { length: 3 }).notNull(),
    originalAmount: decimal("original_amount", {
      precision: 14,
      scale: 2,
    }).notNull(),
    /** Équivalent TND figé au moment de l'opération (pour compta locale). */
    tndAmount: decimal("tnd_amount", { precision: 14, scale: 2 }).notNull(),
    /** Acompte demandé en `originalCurrency`. */
    depositAmount: decimal("deposit_amount", { precision: 14, scale: 2 }),
    /** Acompte effectivement encaissé. */
    depositPaid: decimal("deposit_paid", { precision: 14, scale: 2 })
      .notNull()
      .default("0"),
    voucherUrl: text("voucher_url"),
    voucherQr: text("voucher_qr"),
    notes: text("notes"),
    /** Données brutes du fournisseur (myGo BookingDetail, GDS, etc.). */
    providerPayload: jsonb("provider_payload"),
    createdByUserId: uuid("created_by_user_id"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    confirmedAt: timestamp("confirmed_at", { withTimezone: true }),
    cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
    /** Deadline de règlement manuel (cash/virement) — dépassée sans paiement
     * confirmé, la réservation passe `expired` (cron
     * /api/cron/expire-pending-payments). `null` pour tout ce qui n'est pas
     * une réservation `pending` en attente de règlement manuel. */
    paymentExpiresAt: timestamp("payment_expires_at", { withTimezone: true }),
    /** Clé d'idempotence checkout — sha256(token:method) pour le guest
     * checkout B2C (Phase 20, lib/booking/guest-actions.ts) et
     * sha256(token:b2b) pour la création B2B (audit production readiness —
     * createReservationFromDraft n'avait initialement aucune protection
     * contre le double-submit, contrairement au chemin guest ; réutilise la
     * MÊME colonne/index plutôt qu'une seconde, voir lib/booking/actions.ts).
     * NULL pour tout ce qui n'est ni l'un ni l'autre (admin manuel...) :
     * backstop DB indépendant de Redis contre le double-submit simultané /
     * le retry après timeout. */
    guestIdempotencyKey: text("guest_idempotency_key"),
    /** Phase 21.1 (P0-1) — second identifiant privé, cryptographiquement
     * aléatoire, requis EN PLUS de `publicRef` par les routes guest
     * (confirmation/voucher) sans session. `publicRef` est séquentiel/
     * prévisible (`TG-2026-000123`) et reste l'identifiant humain de
     * support/communication — jamais utilisé seul comme frontière d'accès.
     * DEFAULT non-constant (`gen_random_uuid()` x2, 256 bits) : Postgres
     * réécrit la table et évalue une valeur DISTINCTE par ligne existante à
     * l'ALTER (comportement documenté, vérifié en direct sur ce projet),
     * donc aucune réservation existante ne reste sans token. Jamais fourni
     * par le client, jamais affiché dans /admin ou /pro. */
    guestAccessToken: text("guest_access_token")
      .notNull()
      .default(
        sql`(replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', ''))`,
      ),
  },
  (t) => [
    uniqueIndex("reservations_public_ref_uniq").on(t.agencyId, t.publicRef),
    index("reservations_agency_idx").on(t.agencyId),
    index("reservations_module_idx").on(t.agencyId, t.module),
    index("reservations_customer_idx").on(t.customerId),
    index("reservations_status_idx").on(t.agencyId, t.status),
    index("reservations_created_idx").on(t.agencyId, t.createdAt),
    uniqueIndex("reservations_guest_idempotency_uniq")
      .on(t.guestIdempotencyKey)
      .where(sql`${t.guestIdempotencyKey} is not null`),
    uniqueIndex("reservations_guest_access_token_uniq").on(t.guestAccessToken),
  ],
)

/* ----- Hotel extension --------------------------------------------------- */
export const reservationHotel = pgTable(
  "reservation_hotel",
  {
    reservationId: uuid("reservation_id")
      .primaryKey()
      .references(() => reservations.id, { onDelete: "cascade" }),
    agencyId: uuid("agency_id")
      .notNull()
      .references(() => agencies.id, { onDelete: "restrict" }),
    /** Référence externe myGo (BookingCreation.Id). */
    providerBookingId: varchar("provider_booking_id", { length: 64 }),
    /** Token retourné par HotelSearch (utile pour PreBooking/BookingCreation). */
    providerToken: text("provider_token"),
    hotelId: integer("hotel_id").notNull(),
    hotelName: varchar("hotel_name", { length: 200 }).notNull(),
    cityId: integer("city_id"),
    cityName: varchar("city_name", { length: 100 }),
    checkIn: date("check_in").notNull(),
    checkOut: date("check_out").notNull(),
    nights: integer("nights").notNull(),
    adults: integer("adults").notNull(),
    /** Âges enfants (ex. [5, 8]). */
    childrenAges: integer("children_ages").array(),
    boardCode: varchar("board_code", { length: 16 }),
    boardName: varchar("board_name", { length: 100 }),
    /** Détail chambres (jsonb pour flexibilité multi-rooms). */
    rooms: jsonb("rooms"),
    /** myGo MethodPayment : 10 = paiement à l'hôtel pour le solde. */
    methodPayment: integer("method_payment"),
    /** Montant restant à régler à l'hôtel (TND). */
    atHotelAmount: decimal("at_hotel_amount", { precision: 14, scale: 2 }),
    /** Politique d'annulation (snapshot au moment de la résa). */
    cancellationPolicies: jsonb("cancellation_policies"),
  },
  (t) => [
    index("res_hotel_agency_idx").on(t.agencyId),
    index("res_hotel_provider_idx").on(t.providerBookingId),
  ],
)

/* ----- Flight extension --------------------------------------------------- */
export const reservationFlight = pgTable(
  "reservation_flight",
  {
    reservationId: uuid("reservation_id")
      .primaryKey()
      .references(() => reservations.id, { onDelete: "cascade" }),
    agencyId: uuid("agency_id")
      .notNull()
      .references(() => agencies.id, { onDelete: "restrict" }),
    pnr: varchar("pnr", { length: 16 }),
    origin: varchar("origin", { length: 8 }).notNull(), // IATA
    destination: varchar("destination", { length: 8 }).notNull(),
    departAt: timestamp("depart_at", { withTimezone: true }).notNull(),
    arriveAt: timestamp("arrive_at", { withTimezone: true }),
    returnOrigin: varchar("return_origin", { length: 8 }),
    returnDestination: varchar("return_destination", { length: 8 }),
    returnDepartAt: timestamp("return_depart_at", { withTimezone: true }),
    returnArriveAt: timestamp("return_arrive_at", { withTimezone: true }),
    cabinClass: varchar("cabin_class", { length: 16 }), // economy/business/first
    adults: integer("adults").notNull(),
    children: integer("children").notNull().default(0),
    infants: integer("infants").notNull().default(0),
    eTicketUrls: text("e_ticket_urls").array(),
    segments: jsonb("segments"),
  },
  (t) => [index("res_flight_agency_idx").on(t.agencyId)],
)

/* ----- Package extension (Voyages Organisés) ------------------------------ */
export const reservationPackage = pgTable(
  "reservation_package",
  {
    reservationId: uuid("reservation_id")
      .primaryKey()
      .references(() => reservations.id, { onDelete: "cascade" }),
    agencyId: uuid("agency_id")
      .notNull()
      .references(() => agencies.id, { onDelete: "restrict" }),
    packageId: uuid("package_id").notNull(),
    departureId: uuid("departure_id").notNull(),
    departureDate: date("departure_date").notNull(),
    returnDate: date("return_date").notNull(),
    adults: integer("adults").notNull(),
    childrenAges: integer("children_ages").array(),
    /** Voyageurs détaillés (snapshot). */
    travelers: jsonb("travelers"),
    /** PDF programme complet (généré à la confirmation). */
    programmeUrl: text("programme_url"),
  },
  (t) => [
    index("res_pkg_agency_idx").on(t.agencyId),
    index("res_pkg_package_idx").on(t.packageId),
    index("res_pkg_departure_idx").on(t.departureId),
  ],
)

/* ----- Activity extension (Attractions) ----------------------------------- */
export const reservationActivity = pgTable(
  "reservation_activity",
  {
    reservationId: uuid("reservation_id")
      .primaryKey()
      .references(() => reservations.id, { onDelete: "cascade" }),
    agencyId: uuid("agency_id")
      .notNull()
      .references(() => agencies.id, { onDelete: "restrict" }),
    activityId: uuid("activity_id").notNull(),
    sessionId: uuid("session_id").notNull(),
    sessionDate: date("session_date").notNull(),
    sessionStart: varchar("session_start", { length: 5 }), // HH:MM
    sessionEnd: varchar("session_end", { length: 5 }),
    adults: integer("adults").notNull().default(0),
    children: integer("children").notNull().default(0),
    seniors: integer("seniors").notNull().default(0),
    eTicketUrl: text("e_ticket_url"),
    qrCode: text("qr_code"),
    scannedAt: timestamp("scanned_at", { withTimezone: true }),
    scannedByUserId: uuid("scanned_by_user_id"),
  },
  (t) => [
    index("res_activity_agency_idx").on(t.agencyId),
    index("res_activity_session_idx").on(t.sessionId, t.sessionDate),
  ],
)

/* ----- Network Product extension (ECON-PILOT-01) --------------------------
 * Réservation d'un produit CANONIQUE `products` porté par un supplier_node
 * (Network) — distincte de `reservation_activity` (catalogue agence
 * `catalog_activities`) : réutiliser cette dernière aurait conflaté deux
 * origines de données différentes (canonique vs catalogue historique) sous
 * un même `activityId` par convention, ambigu pour tout lecteur futur.
 * Nouvelle table minimale, volontairement étroite (scope du pilote =
 * prouver la chaîne, pas construire un système de réservation générique
 * complet — pas de sessions/disponibilité, contrairement à
 * reservation_activity). */
export const reservationNetworkProduct = pgTable(
  "reservation_network_product",
  {
    reservationId: uuid("reservation_id")
      .primaryKey()
      .references(() => reservations.id, { onDelete: "cascade" }),
    productId: uuid("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "restrict" }),
    supplierNodeId: uuid("supplier_node_id")
      .notNull()
      .references(() => supplierNodes.id, { onDelete: "restrict" }),
    /** Quantité réservée (pas de distinction adulte/enfant au stade pilote). */
    quantity: integer("quantity").notNull().default(1),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("res_network_product_product_idx").on(t.productId),
    index("res_network_product_supplier_node_idx").on(t.supplierNodeId),
  ],
)

/* ----- Economic Entitlements (ECON-BREAKDOWN-01) ---------------------------
 * `docs/ECONOMIC_MODEL.md` §3.1 — la table qui enregistre QUI a droit à QUOI
 * sur une réservation (couche Economic, distincte de Money Events déjà
 * portés par `wallet_ledger`/`partner_credit_movements`, inchangés). Seul
 * écrivain prévu par le modèle : `recordReservationFinancials()`
 * (lib/finance/reservation-financials.ts). Ce chantier ne câble QUE le
 * module Network (lib/network/product-booking-actions.ts) — les 8 autres
 * modules sont hors périmètre (ECON-WIRING-01, chantier séparé, pas encore
 * GO'd). Aucune logique de transition `earned → settleable/settled` ici :
 * seule la valeur initiale `earned` est écrite à la création.
 */
export const economicEntitlementRole = pgEnum("economic_entitlement_role", [
  "seller",
  "product_owner",
  "supplier",
  "partner",
  "easy2book",
  "tax_authority",
  "discount",
])

export const economicEntitlementStatus = pgEnum("economic_entitlement_status", [
  "pending",
  "earned",
  "settleable",
  "settled",
  "compensated",
])

export const economicEntitlements = pgTable(
  "economic_entitlements",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    reservationId: uuid("reservation_id")
      .notNull()
      .references(() => reservations.id, { onDelete: "cascade" }),

    /** Table conceptuelle que `partyId` référence ('agency' | 'supplier_node'
     * | 'easy2book' | 'external') — polymorphique, donc pas de FK Postgres
     * possible sur `partyId` lui-même. */
    partyType: varchar("party_type", { length: 30 }).notNull(),
    /** `agencies.id`, `supplier_nodes.id` — NULL pour easy2book/fournisseur
     * externe non modélisé (cf. audit : "le nœud fournisseur n'est crédité
     * nulle part"). */
    partyId: uuid("party_id"),

    role: economicEntitlementRole("role").notNull(),
    /** §3.1 : liste fermée, appliquée via CHECK (pas un pgEnum Postgres —
     * volontaire, cf. docs/ECONOMIC_MODEL.md qui la documente comme "text"
     * pour rester extensible sans ALTER TYPE). */
    qualification: varchar("qualification", { length: 30 }).notNull(),

    amount: decimal("amount", { precision: 14, scale: 2 }).notNull(),
    currency: varchar("currency", { length: 3 }).notNull().default("TND"),

    /** Description libre de la base de calcul, ex. "net × 5%". */
    basis: text("basis"),

    /** Placeholder EN ATTENDANT AGREEMENT-01 (pas de table
     * `commercial_agreements` dans ce chantier). PRÉCISION DIRECTION
     * (2026-09-30) : `margin_rules` N'EST PAS `commercial_agreements` — ceci
     * est un point d'attache TECHNIQUE PROVISOIRE au modèle économique
     * existant (cf. docs/ECONOMIC_MODEL.md §2 "Réutilisation"), pas une
     * équivalence conceptuelle. Volontairement SANS `.references()` /
     * SANS contrainte FK en base vers `margin_rules` — pour qu'AGREEMENT-01
     * puisse la repointer vers un vrai `commercial_agreements.id` par un
     * simple UPDATE de valeur, sans devoir défaire une contrainte. */
    agreementId: uuid("agreement_id"),
    /** `margin_rules.id` qui a produit CETTE ligne précisément — référence
     * RÉELLE et durable (indépendante d'AGREEMENT-01), donc FK conservée en
     * base. Peut être numériquement égal à `agreementId` aujourd'hui (même
     * table source, faute de mieux) ; ce n'est pas un doublon, c'est
     * documenté ici comme attendu. */
    ruleId: uuid("rule_id").references(() => marginRules.id, {
      onDelete: "set null",
    }),

    status: economicEntitlementStatus("status").notNull().default("pending"),
    effectiveAt: timestamp("effective_at", { withTimezone: true }).notNull(),

    /** §4 — colonne posée pour un futur chantier de compensation ;
     * aucune logique d'annulation/reversal n'utilise encore ce champ. */
    cancellationTreatment: varchar("cancellation_treatment", { length: 20 }),
    /** Auto-référence : la ligne compensatoire pointe vers la ligne qu'elle
     * corrige. Colonne posée pour le même futur chantier — non utilisée ici. */
    compensatesId: uuid("compensates_id"),

    settlementStatus: varchar("settlement_status", { length: 20 }),
    settlementRef: uuid("settlement_ref").references(
      () => commissionSettlements.id,
      { onDelete: "set null" },
    ),

    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("economic_entitlements_reservation_idx").on(t.reservationId),
    index("economic_entitlements_party_idx").on(t.partyId),
    index("economic_entitlements_status_idx").on(t.status),
    index("economic_entitlements_compensates_idx").on(t.compensatesId),
    check(
      "economic_entitlements_qualification_check",
      sql`${t.qualification} in ('supplier_cost','seller_margin','owner_share','commission','platform_fee','distribution_fee','revenue_share','service_fee','tax','discount')`,
    ),
    check(
      "economic_entitlements_cancellation_treatment_check",
      sql`${t.cancellationTreatment} is null or ${t.cancellationTreatment} in ('full_reversal','pro_rata_fee','non_refundable')`,
    ),
  ],
)

export type EconomicEntitlement = typeof economicEntitlements.$inferSelect
export type NewEconomicEntitlement = typeof economicEntitlements.$inferInsert

/**
 * AGREEMENT-01 — `commercial_agreements` (docs/ECONOMIC_MODEL.md §2, "Accord
 * commercial", 9 questions).
 *
 * Construit le MÉCANISME d'accord uniquement : ce chantier ne crée AUCUNE
 * ligne réelle/permanente ici (décision Direction, 2026-09-30 — le taux
 * D-01b "option 3, frais sur prix net" n'est pas tranché ; créer un accord
 * Network réel avec un taux inventé ou un taux à 0% "juste pour la preuve"
 * serait fabriquer une politique commerciale, pas construire un mécanisme).
 * Le premier accord réel, quel qu'il soit, est un chantier séparé (GO
 * explicite requis), une fois D-01b tranché.
 *
 * [D-01a] Qui détient le droit d'Easy2Book dans un accord ? Easy2Book
 * uniquement (création/modification super_admin) — une agence ne peut
 * JAMAIS modifier la part d'Easy2Book. Contrairement à la plupart des
 * tables de ce dépôt, il n'existe PAS de cas "une agence peut écrire ses
 * propres lignes" : RLS écriture = `is_super_admin()` uniquement, sans
 * exception. Lecture : élargie aux parties prenantes d'un accord (une
 * agence peut voir les accords où elle apparaît comme seller/owner/
 * supplier/collector), cf. 0088_agreement_01_rls.sql — le point dur demandé
 * par Direction est la RESTRICTION EN ÉCRITURE, pas la lecture.
 *
 * `*_party_type`/`*_party_id` : même convention polymorphique que
 * `economic_entitlements.party_type`/`party_id` ('agency' | 'supplier_node'
 * | 'easy2book' | 'external') — pas de FK Postgres possible sur l'id
 * lui-même. `owner_party_id`/`supplier_party_id`/`collector_party_id`
 * nullable — §2 : "Qui fournit ? supplier_party (ou « tout fournisseur du
 * produit »)" ; même principe étendu à owner/collector quand l'accord ne
 * vise pas une partie précise.
 */
export const commercialAgreementEasy2bookRole = pgEnum(
  "commercial_agreement_easy2book_role",
  ["platform", "distributor", "seller", "owner"],
)

export const commercialAgreementChannel = pgEnum(
  "commercial_agreement_channel",
  ["b2c", "b2b", "network", "white_label", "api"],
)

export const commercialAgreementStatus = pgEnum("commercial_agreement_status", [
  "draft",
  "active",
  "suspended",
  "terminated",
])

export const commercialAgreements = pgTable(
  "commercial_agreements",
  {
    id: uuid("id").primaryKey().defaultRandom(),

    /** Qui vend ? — toujours connu, jamais nul. */
    sellerPartyType: varchar("seller_party_type", { length: 30 }).notNull(),
    sellerPartyId: uuid("seller_party_id").notNull(),

    /** Qui possède ? — nullable : l'accord peut viser "tout propriétaire"
     * plutôt qu'une partie précise. */
    ownerPartyType: varchar("owner_party_type", { length: 30 }),
    ownerPartyId: uuid("owner_party_id"),

    /** Qui fournit ? — nullable : §2 "ou tout fournisseur du produit". */
    supplierPartyType: varchar("supplier_party_type", { length: 30 }),
    supplierPartyId: uuid("supplier_party_id"),

    /** Rôle d'Easy2Book dans CET accord (§0 : plateforme, distributeur,
     * vendeur ou propriétaire selon l'accord — jamais 4 moteurs distincts). */
    easy2bookRole: commercialAgreementEasy2bookRole("easy2book_role").notNull(),

    /** Périmètre canal — mêmes valeurs que le reste du dépôt
     * (product_authorizations, reservation_source côté network). */
    channel: commercialAgreementChannel("channel").notNull(),

    currency: varchar("currency", { length: 3 }).notNull().default("TND"),

    /** Qui paie ? — généralement 'customer', parfois 'seller' pour le net
     * (§2). Texte libre volontairement (comme `qualification` sur
     * `economic_entitlements`) plutôt qu'un enum fermé — extensible sans
     * ALTER TYPE. */
    payerRole: text("payer_role").notNull().default("customer"),

    /** Qui encaisse ? — nullable : peut être implicite (Easy2Book) tant que
     * non renseigné. */
    collectorPartyType: varchar("collector_party_type", { length: 30 }),
    collectorPartyId: uuid("collector_party_id"),

    status: commercialAgreementStatus("status").notNull().default("draft"),

    validFrom: date("valid_from"),
    validTo: date("valid_to"),

    createdByUserId: uuid("created_by_user_id").notNull(),

    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("commercial_agreements_seller_idx").on(
      t.sellerPartyType,
      t.sellerPartyId,
    ),
    index("commercial_agreements_owner_idx").on(
      t.ownerPartyType,
      t.ownerPartyId,
    ),
    index("commercial_agreements_supplier_idx").on(
      t.supplierPartyType,
      t.supplierPartyId,
    ),
    index("commercial_agreements_collector_idx").on(
      t.collectorPartyType,
      t.collectorPartyId,
    ),
    index("commercial_agreements_status_idx").on(t.status),
    index("commercial_agreements_channel_idx").on(t.channel),
  ],
)

export type CommercialAgreement = typeof commercialAgreements.$inferSelect
export type NewCommercialAgreement = typeof commercialAgreements.$inferInsert

/* ----- Transfer extension ------------------------------------------------- */
export const reservationTransfer = pgTable(
  "reservation_transfer",
  {
    reservationId: uuid("reservation_id")
      .primaryKey()
      .references(() => reservations.id, { onDelete: "cascade" }),
    agencyId: uuid("agency_id")
      .notNull()
      .references(() => agencies.id, { onDelete: "restrict" }),
    pickupZoneId: uuid("pickup_zone_id"),
    dropoffZoneId: uuid("dropoff_zone_id"),
    pickupAddress: text("pickup_address"),
    dropoffAddress: text("dropoff_address"),
    flightNumber: varchar("flight_number", { length: 16 }),
    flightArrivalAt: timestamp("flight_arrival_at", { withTimezone: true }),
    flightStatus: varchar("flight_status", { length: 32 }),
    pax: integer("pax").notNull(),
    luggageCount: integer("luggage_count").notNull().default(0),
    vehicleType: transferVehicleType("vehicle_type").notNull(),
    vehicleAssignedId: uuid("vehicle_assigned_id"),
    driverAssignedId: uuid("driver_assigned_id"),
    driverPhone: varchar("driver_phone", { length: 32 }),
    /** SID Twilio du SMS chauffeur. */
    smsSid: varchar("sms_sid", { length: 64 }),
    smsStatus: varchar("sms_status", { length: 16 }),
    /** Timeline statuts : assigned/en_route/arrived/picked_up/dropped_off/cancelled. */
    statusTimeline: jsonb("status_timeline"),
  },
  (t) => [
    index("res_transfer_agency_idx").on(t.agencyId),
    index("res_transfer_flight_idx").on(t.flightNumber, t.flightArrivalAt),
  ],
)

/* ----- Omra extension ----------------------------------------------------- */
export const reservationOmra = pgTable(
  "reservation_omra",
  {
    reservationId: uuid("reservation_id")
      .primaryKey()
      .references(() => reservations.id, { onDelete: "cascade" }),
    agencyId: uuid("agency_id")
      .notNull()
      .references(() => agencies.id, { onDelete: "restrict" }),
    omraPackageId: uuid("omra_package_id").notNull(),
    departureDate: date("departure_date").notNull(),
    returnDate: date("return_date").notNull(),
    pilgrims: integer("pilgrims").notNull(),
    travelers: jsonb("travelers"),
    /** Visa : 'pending' / 'submitted' / 'approved' / 'rejected'. */
    visaStatus: varchar("visa_status", { length: 16 }),
  },
  (t) => [index("res_omra_agency_idx").on(t.agencyId)],
)

/* -------------------------------------------------------------------------- */
/* Payments                                                                   */
/* -------------------------------------------------------------------------- */

export const payments = pgTable(
  "payments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    agencyId: uuid("agency_id")
      .notNull()
      .references(() => agencies.id, { onDelete: "restrict" }),
    reservationId: uuid("reservation_id")
      .notNull()
      .references(() => reservations.id, { onDelete: "restrict" }),
    psp: paymentPsp("psp").notNull(),
    method: paymentMethod("method").notNull(),
    /** ID externe SPS (Order_id / Trans_id). */
    pspOrderId: varchar("psp_order_id", { length: 64 }),
    pspTransactionId: varchar("psp_transaction_id", { length: 64 }),
    originalCurrency: varchar("original_currency", { length: 3 }).notNull(),
    originalAmount: decimal("original_amount", {
      precision: 14,
      scale: 2,
    }).notNull(),
    tndAmount: decimal("tnd_amount", { precision: 14, scale: 2 }).notNull(),
    /** Type d'opération : 'deposit' (acompte) / 'balance' (solde) / 'refund'. */
    kind: varchar("kind", { length: 16 }).notNull().default("deposit"),
    status: paymentStatus("status").notNull().default("pending"),
    cardBrand: varchar("card_brand", { length: 16 }),
    cardLast4: varchar("card_last4", { length: 4 }),
    threeDsOk: boolean("three_ds_ok"),
    rawResponse: jsonb("raw_response"),
    refundedAmount: decimal("refunded_amount", { precision: 14, scale: 2 })
      .notNull()
      .default("0"),
    capturedAt: timestamp("captured_at", { withTimezone: true }),
    refundedAt: timestamp("refunded_at", { withTimezone: true }),
    /** Clé déterministe par TENTATIVE de capture (Phase 16.2) — remplace
     * l'ancienne garde `payments_reservation_captured_uniq` qui bloquait
     * TOUT deuxième paiement capturé par réservation (incompatible avec le
     * modèle Wallet + virement + PAY_AT_HOTEL). Une tentative rejouée
     * (même clé) est rejetée ; deux versements légitimes différents
     * (clés différentes) sont tous deux acceptés. */
    idempotencyKey: text("idempotency_key"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("payments_agency_idx").on(t.agencyId),
    index("payments_reservation_idx").on(t.reservationId),
    index("payments_psp_order_idx").on(t.pspOrderId),
    index("payments_status_idx").on(t.agencyId, t.status),
    /** Au plus une capture par tentative (clé d'idempotence) — voir
     * commentaire de `idempotencyKey`. */
    uniqueIndex("payments_capture_idempotency_uniq")
      .on(t.reservationId, t.idempotencyKey)
      .where(sql`${t.status} = 'captured' and ${t.idempotencyKey} is not null`),
  ],
)

/* -------------------------------------------------------------------------- */
/* PSP webhooks (audit / idempotency)                                         */
/* -------------------------------------------------------------------------- */

export const pspWebhooks = pgTable(
  "psp_webhooks",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    agencyId: uuid("agency_id"),
    psp: paymentPsp("psp").notNull(),
    eventType: varchar("event_type", { length: 64 }).notNull(),
    payload: jsonb("payload").notNull(),
    signatureOk: boolean("signature_ok").notNull().default(false),
    processedAt: timestamp("processed_at", { withTimezone: true }),
    error: text("error"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("psp_webhooks_psp_idx").on(t.psp, t.createdAt)],
)

/* -------------------------------------------------------------------------- */
/* Audit log (qui a fait quoi, traçabilité réglementaire)                     */
/* -------------------------------------------------------------------------- */

export const auditEvents = pgTable(
  "audit_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    agencyId: uuid("agency_id")
      .notNull()
      .references(() => agencies.id, { onDelete: "restrict" }),
    actorUserId: uuid("actor_user_id"),
    /** Type d'objet : 'reservation' / 'payment' / 'customer' / etc. */
    entityType: varchar("entity_type", { length: 32 }).notNull(),
    entityId: text("entity_id").notNull(),
    /** 'create' / 'update' / 'cancel' / 'refund' / 'login' / etc. */
    action: varchar("action", { length: 32 }).notNull(),
    diff: jsonb("diff"),
    ipAddress: varchar("ip_address", { length: 64 }),
    userAgent: text("user_agent"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("audit_agency_idx").on(t.agencyId),
    index("audit_entity_idx").on(t.entityType, t.entityId),
    index("audit_actor_idx").on(t.actorUserId),
    /** Au plus une notification WhatsApp/email voucher envoyée, ou
     * synchronisation CRM réussie, par entité — garde DB contre le double
     * envoi sur retry Inngest, en plus de la vérification applicative (voir
     * lib/whatsapp/send-booking-confirmation.ts, lib/crm/sync-booking.ts,
     * lib/inngest/functions/process-confirmed-booking.ts). */
    uniqueIndex("audit_events_notification_success_uniq")
      .on(t.entityType, t.entityId, t.action)
      .where(
        sql`${t.action} in ('notification.whatsapp.sent', 'notification.crm.synced', 'notification.voucher_email.sent')`,
      ),
  ],
)

/**
 * Garde d'idempotence permanente pour les notifications (WhatsApp, email
 * voucher, CRM). Séparée de `audit_events` qui est purgée à 30 jours —
 * cette table n'est jamais purgée.
 *
 * N'enregistre que les livraisons réussies par (reservation_id, action).
 * `audit_events` reste la source d'audit exhaustive (toutes tentatives).
 */
export const notificationIdempotency = pgTable(
  "notification_idempotency",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    agencyId: uuid("agency_id")
      .notNull()
      .references(() => agencies.id, { onDelete: "cascade" }),
    reservationId: uuid("reservation_id").notNull(),
    action: varchar("action", { length: 64 }).notNull(),
    context: jsonb("context"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("notification_idempotency_sent_uniq").on(
      t.reservationId,
      t.action,
    ),
    index("notification_idempotency_agency_idx").on(t.agencyId),
    index("notification_idempotency_reservation_idx").on(t.reservationId),
  ],
)

export type NotificationIdempotency =
  typeof notificationIdempotency.$inferSelect
export type NewNotificationIdempotency =
  typeof notificationIdempotency.$inferInsert

/* -------------------------------------------------------------------------- */
/* Permission grants (Phase 22) — délégation explicite au-dessus du baseline  */
/* par rôle (lib/auth/rbac.ts / lib/auth/permissions.ts). Une ligne = override */
/* explicite (accordé/révoqué) pour CE user, dans SON agence ; son absence =  */
/* comportement baseline du rôle inchangé. Ne remplace aucun rôle existant.   */
/* -------------------------------------------------------------------------- */
export const permissionGrants = pgTable(
  "permission_grants",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    agencyId: uuid("agency_id")
      .notNull()
      .references(() => agencies.id, { onDelete: "restrict" }),
    userId: uuid("user_id").notNull(),
    /** Clé de lib/auth/rbac.ts::Permission (ex. "staff.create", "accounting.view"). */
    permission: text("permission").notNull(),
    /** true = permission accordée au-delà du baseline ; false = baseline révoqué pour ce user précis. */
    granted: boolean("granted").notNull(),
    grantedByUserId: uuid("granted_by_user_id").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("permission_grants_user_permission_uniq").on(
      t.agencyId,
      t.userId,
      t.permission,
    ),
    index("permission_grants_agency_idx").on(t.agencyId),
    index("permission_grants_user_idx").on(t.userId),
  ],
)

/* -------------------------------------------------------------------------- */
/* Catalog tables (production interne, modules Voyages / Activités /          */
/* Transferts / Omra). Squelette minimal pour itérations 5-9.                 */
/* -------------------------------------------------------------------------- */

export const catalogPackages = pgTable(
  "catalog_packages",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    agencyId: uuid("agency_id")
      .notNull()
      .references(() => agencies.id, { onDelete: "restrict" }),
    code: varchar("code", { length: 64 }).notNull(),
    title: varchar("title", { length: 200 }).notNull(),
    slug: varchar("slug", { length: 200 }).notNull(),
    shortDescription: text("short_description"),
    longDescription: text("long_description"),
    /** Itinéraire jour par jour. */
    itinerary: jsonb("itinerary"),
    coverImage: text("cover_image"),
    galleryUrls: text("gallery_urls").array(),
    departureLocations: text("departure_locations").array(),
    transportMode: varchar("transport_mode", { length: 32 }),
    durationDays: integer("duration_days"),
    durationNights: integer("duration_nights"),
    inclusions: text("inclusions").array(),
    exclusions: text("exclusions").array(),
    status: varchar("status", { length: 16 }).notNull().default("draft"),
    /** Canaux de distribution : 'b2c' / 'b2b' / 'white_label'. Phase 13. */
    channels: text("channels").array().notNull().default(["b2c"]),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("catalog_pkg_slug_uniq").on(t.agencyId, t.slug),
    index("catalog_pkg_agency_idx").on(t.agencyId),
  ],
)

export const catalogPackageDepartures = pgTable(
  "catalog_package_departures",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    agencyId: uuid("agency_id")
      .notNull()
      .references(() => agencies.id, { onDelete: "restrict" }),
    packageId: uuid("package_id")
      .notNull()
      .references(() => catalogPackages.id, { onDelete: "cascade" }),
    departureDate: date("departure_date").notNull(),
    returnDate: date("return_date").notNull(),
    adultPriceTnd: decimal("adult_price_tnd", {
      precision: 14,
      scale: 2,
    }).notNull(),
    childPriceTnd: decimal("child_price_tnd", { precision: 14, scale: 2 }),
    depositPercent: integer("deposit_percent").notNull().default(30),
    totalSeats: integer("total_seats").notNull(),
    bookedSeats: integer("booked_seats").notNull().default(0),
    status: varchar("status", { length: 16 }).notNull().default("open"),
  },
  (t) => [
    index("catalog_pkg_dep_agency_idx").on(t.agencyId),
    index("catalog_pkg_dep_package_idx").on(t.packageId, t.departureDate),
  ],
)

export const catalogActivities = pgTable(
  "catalog_activities",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    agencyId: uuid("agency_id")
      .notNull()
      .references(() => agencies.id, { onDelete: "restrict" }),
    code: varchar("code", { length: 64 }).notNull(),
    title: varchar("title", { length: 200 }).notNull(),
    slug: varchar("slug", { length: 200 }).notNull(),
    shortDescription: text("short_description"),
    longDescription: text("long_description"),
    location: varchar("location", { length: 200 }),
    durationMinutes: integer("duration_minutes"),
    coverImage: text("cover_image"),
    galleryUrls: text("gallery_urls").array(),
    inclusions: text("inclusions").array(),
    exclusions: text("exclusions").array(),
    /** ex. {child:"<12y", senior:">=65y"}. */
    tariffRules: jsonb("tariff_rules"),
    status: varchar("status", { length: 16 }).notNull().default("draft"),
    /** Canaux de distribution : 'b2c' / 'b2b' / 'white_label'. Phase 13. */
    channels: text("channels").array().notNull().default(["b2c"]),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("catalog_act_slug_uniq").on(t.agencyId, t.slug),
    index("catalog_act_agency_idx").on(t.agencyId),
  ],
)

export const catalogActivitySessions = pgTable(
  "catalog_activity_sessions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    agencyId: uuid("agency_id")
      .notNull()
      .references(() => agencies.id, { onDelete: "restrict" }),
    activityId: uuid("activity_id")
      .notNull()
      .references(() => catalogActivities.id, { onDelete: "cascade" }),
    sessionDate: date("session_date").notNull(),
    sessionStart: varchar("session_start", { length: 5 }).notNull(),
    sessionEnd: varchar("session_end", { length: 5 }).notNull(),
    capacity: integer("capacity").notNull(),
    booked: integer("booked").notNull().default(0),
    adultPriceTnd: decimal("adult_price_tnd", {
      precision: 14,
      scale: 2,
    }).notNull(),
    childPriceTnd: decimal("child_price_tnd", { precision: 14, scale: 2 }),
    seniorPriceTnd: decimal("senior_price_tnd", { precision: 14, scale: 2 }),
    status: varchar("status", { length: 16 }).notNull().default("open"),
    /**
     * Date limite de réservation (Phase 13.1). NULL = pas de délai dédié,
     * la date/heure de la session elle-même fait office de coupure.
     */
    bookingDeadline: timestamp("booking_deadline", { withTimezone: true }),
  },
  (t) => [
    index("catalog_act_sess_agency_idx").on(t.agencyId),
    index("catalog_act_sess_date_idx").on(t.activityId, t.sessionDate),
  ],
)

export const catalogTransferZones = pgTable(
  "catalog_transfer_zones",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    agencyId: uuid("agency_id")
      .notNull()
      .references(() => agencies.id, { onDelete: "restrict" }),
    name: varchar("name", { length: 200 }).notNull(),
    /** 'airport' / 'hotel' / 'city' / 'station'. */
    zoneType: varchar("zone_type", { length: 16 }).notNull(),
    latitude: decimal("latitude", { precision: 9, scale: 6 }),
    longitude: decimal("longitude", { precision: 9, scale: 6 }),
    status: varchar("status", { length: 16 }).notNull().default("active"),
  },
  (t) => [index("catalog_zones_agency_idx").on(t.agencyId)],
)

export const catalogTransferPricing = pgTable(
  "catalog_transfer_pricing",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    agencyId: uuid("agency_id")
      .notNull()
      .references(() => agencies.id, { onDelete: "restrict" }),
    fromZoneId: uuid("from_zone_id")
      .notNull()
      .references(() => catalogTransferZones.id, { onDelete: "cascade" }),
    toZoneId: uuid("to_zone_id")
      .notNull()
      .references(() => catalogTransferZones.id, { onDelete: "cascade" }),
    vehicleType: transferVehicleType("vehicle_type").notNull(),
    basePriceTnd: decimal("base_price_tnd", {
      precision: 14,
      scale: 2,
    }).notNull(),
    nightSurchargePercent: integer("night_surcharge_percent")
      .notNull()
      .default(0),
    validFrom: date("valid_from"),
    validTo: date("valid_to"),
  },
  (t) => [
    index("catalog_tpr_agency_idx").on(t.agencyId),
    uniqueIndex("catalog_tpr_pair_uniq").on(
      t.agencyId,
      t.fromZoneId,
      t.toZoneId,
      t.vehicleType,
    ),
  ],
)

export const catalogVehicles = pgTable(
  "catalog_vehicles",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    agencyId: uuid("agency_id")
      .notNull()
      .references(() => agencies.id, { onDelete: "restrict" }),
    type: transferVehicleType("type").notNull(),
    capacity: integer("capacity").notNull(),
    plate: varchar("plate", { length: 32 }).notNull(),
    brand: varchar("brand", { length: 64 }),
    model: varchar("model", { length: 64 }),
    color: varchar("color", { length: 32 }),
    /** 'active' / 'maintenance' / 'inactive'. */
    status: varchar("status", { length: 16 }).notNull().default("active"),
    notes: text("notes"),
  },
  (t) => [
    uniqueIndex("catalog_veh_plate_uniq").on(t.agencyId, t.plate),
    index("catalog_veh_agency_idx").on(t.agencyId),
  ],
)

export const catalogDrivers = pgTable(
  "catalog_drivers",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    agencyId: uuid("agency_id")
      .notNull()
      .references(() => agencies.id, { onDelete: "restrict" }),
    name: varchar("name", { length: 200 }).notNull(),
    phone: varchar("phone", { length: 32 }).notNull(),
    licenseNumber: varchar("license_number", { length: 64 }),
    languages: text("languages").array(),
    status: varchar("status", { length: 16 }).notNull().default("active"),
  },
  (t) => [index("catalog_drivers_agency_idx").on(t.agencyId)],
)

/* -------------------------------------------------------------------------- */
/* B2B Partner Portal — pricing margins, invoices, payments, credit ledger    */
/* -------------------------------------------------------------------------- */

/**
 * Règles de marge appliquées par agence × module produit.
 *
 * Exemple : agence "Carthage Tours" → +10% sur hotel, +5 TND fixe sur flight.
 * Permet de calculer prix public = prix net × (1 + margin) ou prix net + margin.
 */
export const pricingMargins = pgTable(
  "pricing_margins",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    agencyId: uuid("agency_id")
      .notNull()
      .references(() => agencies.id, { onDelete: "cascade" }),
    module: reservationModule("module").notNull(),
    marginType: marginType("margin_type").notNull(),
    /** Valeur du markup : pourcentage (5 = 5%) ou montant fixe TND. */
    marginValue: decimal("margin_value", { precision: 10, scale: 2 }).notNull(),
    isActive: boolean("is_active").notNull().default(true),
    notes: text("notes"),
    /** Canal de distribution — CHANNEL-DIM-01. 'direct' = vente directe OTA
     * (défaut), 'b2b' = revente partenaire, 'white_label' = marque blanche. */
    channel: varchar("channel", { length: 16 }).notNull().default("direct"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("pricing_margins_agency_idx").on(t.agencyId),
    uniqueIndex("pricing_margins_agency_module_channel_uniq").on(
      t.agencyId,
      t.module,
      t.channel,
    ),
  ],
)

/** Type de produit autorisé pour la revente B2B / White Label. */
export const authorizedProductType = pgEnum("authorized_product_type", [
  "package",
  "omra",
  "activity",
  /** DISTRIBUTION-01 : produit canonique `products` (Network, ECON-PILOT-01). */
  "network",
  /** DISTRIB-EXTEND-01 : location de voiture (module 'car'). */
  "car",
  /** DISTRIB-EXTEND-01 : transfert aéroport/hôtel (module 'transfer'). */
  "transfer",
])

/**
 * Autorisations de revente B2B / White Label (Phase 13.1).
 *
 * Constat de l'audit Phase 13.1 : `catalog_packages`/`omra_packages`/
 * `catalog_activities` ont une policy RLS stricte `agency_id =
 * current_agency_id()` (0001_rls_policies.sql) — un produit appartient à
 * l'agence OTA qui l'a créé (`assertProductManager`). Une agence
 * partenaire B2B (agencyType='partner') n'a donc, par construction,
 * JAMAIS pu lire un produit qu'elle n'a pas créé elle-même — et
 * `assertProductManager` interdit justement aux agences non-OTA d'en
 * créer. Résultat : `createOmraBooking` (B2B, déjà existant) ne pouvait
 * matériellement jamais trouver de package pour une vraie agence
 * partenaire, RLS bloquant la lecture en amont de toute logique
 * applicative. C'est le vrai verrou derrière le gap "B2B — vendre les
 * nouveaux produits".
 *
 * Cette table est la liste explicite des autorisations : quelle agence
 * (`agency_id`, un partenaire B2B OU un tenant White Label) peut voir et
 * vendre quel produit (`product_type` + `product_id`, pas de FK Postgres
 * cross-table possible avec 3 tables cibles différentes — intégrité
 * garantie côté applicatif par `assertProductManager` + validation du
 * productId à la création de l'autorisation).
 *
 * `channel` distingue une autorisation B2B classique d'une autorisation
 * White Label — même table, pas un deuxième système ("Ne crée pas un
 * deuxième système B2B").
 *
 * Le `agency_id = current_agency_id()` du produit lui-même RESTE le seul
 * chemin d'ÉCRITURE (WITH CHECK inchangé dans la migration RLS) : une
 * autorisation donne un accès LECTURE SEULE au produit d'un tiers, jamais
 * un droit de le modifier.
 */
export const productAuthorizations = pgTable(
  "product_authorizations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** Agence revendeuse (partenaire B2B ou tenant White Label). */
    agencyId: uuid("agency_id")
      .notNull()
      .references(() => agencies.id, { onDelete: "cascade" }),
    productType: authorizedProductType("product_type").notNull(),
    productId: uuid("product_id").notNull(),
    /** 'b2b' (revente agence classique) ou 'white_label' (tenant marque blanche). */
    channel: varchar("channel", { length: 16 }).notNull().default("b2b"),
    isActive: boolean("is_active").notNull().default(true),
    createdByUserId: uuid("created_by_user_id"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("product_auth_agency_product_uniq").on(
      t.agencyId,
      t.productType,
      t.productId,
    ),
    index("product_auth_product_idx").on(t.productType, t.productId),
    index("product_auth_agency_idx").on(t.agencyId),
  ],
)

/**
 * JOURNEY-BUILDER-01 — composition B2B multi-produits (Flight/Hotel/
 * Transfer/Activity/Car/Package/Omra/Network) au-dessus des moteurs de
 * réservation EXISTANTS, jamais un nouveau booking/pricing/financial
 * engine. Une agence (ou le staff, agence explicite comme
 * `upsertAgencyPricingMargin`) compose un `journey` = plusieurs
 * `journey_lines`, chacune ciblant un module réel (`reservationModule`,
 * réutilisé tel quel — jamais un second enum de modules). Le prix
 * agrégé (`priceTnd` par ligne) est un SNAPSHOT commercial, jamais
 * une nouvelle formule : au moment de la confirmation, c'est TOUJOURS
 * le moteur réel du module (lib/activities/booking-actions.ts,
 * lib/packages/booking-actions.ts, etc.) qui recalcule et débite le
 * prix réel — voir lib/journeys/journey-actions.ts.
 *
 * Décision produit actée (pas d'atomicité multi-moteurs — chaque moteur
 * a SA PROPRE transaction/débit/idempotence indépendante) :
 * `journey_lines.status` : pending → processing → confirmed | failed.
 * `journeys.status` (dérivé, jamais écrit directement) :
 * draft → ready → processing → confirmed | partially_confirmed | failed.
 * Une ligne `confirmed` n'est JAMAIS supprimée/écrasée pour simuler un
 * rollback (RULE FINANCIÈRE) — seule une annulation via les mécanismes
 * existants (lib/booking/cancel-actions.ts etc.) peut la défaire, hors
 * périmètre de ce chantier.
 */
export const journeyStatus = pgEnum("journey_status", [
  "draft",
  "ready",
  "processing",
  "confirmed",
  "partially_confirmed",
  "failed",
])

export const journeyLineStatus = pgEnum("journey_line_status", [
  "pending",
  "processing",
  "confirmed",
  "failed",
])

export const journeys = pgTable(
  "journeys",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    agencyId: uuid("agency_id")
      .notNull()
      .references(() => agencies.id, { onDelete: "cascade" }),
    /** Client final de l'agence (optionnel — composition possible avant identification du client). */
    customerId: uuid("customer_id").references(() => customers.id, {
      onDelete: "set null",
    }),
    createdByUserId: uuid("created_by_user_id").notNull(),
    title: text("title"),
    /** Dérivé de journey_lines.status par recomputeJourneyStatus() (lib/journeys/journeys-core.ts) — jamais écrit à la main ailleurs. */
    status: journeyStatus("status").notNull().default("draft"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("journeys_agency_idx").on(t.agencyId),
    index("journeys_customer_idx").on(t.customerId),
  ],
)

export const journeyLines = pgTable(
  "journey_lines",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    journeyId: uuid("journey_id")
      .notNull()
      .references(() => journeys.id, { onDelete: "cascade" }),
    module: reservationModule("module").notNull(),
    status: journeyLineStatus("status").notNull().default("pending"),
    /** Payload exact attendu par le moteur réel du module (ex. ActivityPartnerBookingInput) — jamais réinterprété ici, transmis tel quel à la confirmation. */
    payload: jsonb("payload").notNull(),
    /** Snapshot commercial non-authoritatif — le moteur réel recalcule à la confirmation. */
    priceTnd: decimal("price_tnd", { precision: 14, scale: 2 }),
    reservationId: uuid("reservation_id").references(() => reservations.id, {
      onDelete: "set null",
    }),
    errorMessage: text("error_message"),
    /** Posée par la CAS pending/failed → processing (lib/journeys/journeys-core.ts) — garantit qu'un double-clic/retry n'appelle jamais deux fois le moteur réel. */
    confirmationIdempotencyKey: varchar("confirmation_idempotency_key", {
      length: 100,
    }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("journey_lines_journey_idx").on(t.journeyId),
    index("journey_lines_reservation_idx").on(t.reservationId),
    uniqueIndex("journey_lines_idempotency_uniq")
      .on(t.confirmationIdempotencyKey)
      .where(sql`${t.confirmationIdempotencyKey} is not null`),
  ],
)

export type Journey = typeof journeys.$inferSelect
export type NewJourney = typeof journeys.$inferInsert
export type JourneyLine = typeof journeyLines.$inferSelect
export type NewJourneyLine = typeof journeyLines.$inferInsert

/**
 * Policy Engine — politiques d'annulation/modification, Omra/Package/
 * Activity UNIQUEMENT (jamais Hôtel : `cancellationPolicies` fournisseur
 * myGo, normalisées par le Universal Hub, restent la seule autorité —
 * voir lib/booking/cancel-actions.ts et lib/booking/customer-cancel-
 * actions.ts, non touchés par cette table).
 *
 * Versionnée, jamais écrasée : "modifier" = INSERT d'une nouvelle ligne
 * avec `version = ancienne + 1` et `isActive: true`, en désactivant
 * l'ancienne (`isActive: false`) — l'historique complet reste en base,
 * interrogeable, jamais supprimé. Une réservation déjà créée garde SA
 * PROPRE copie figée de la politique acceptée (voir
 * `reservations.providerPayload.policySnapshot`, lib/booking/policy-
 * engine.ts) — un changement de version ultérieur ne change jamais
 * rétroactivement ce qu'un client a déjà accepté.
 *
 * Résolution (lib/booking/policy-engine.ts::resolveCancellationPolicy) :
 * produit/offre spécifique (`productId` non nul) > politique par défaut de
 * l'agence pour ce `productType` (`productId` nul) > aucune politique
 * (`null` — jamais un défaut inventé, ex. "10% de frais").
 *
 * Champs volontairement TOUS nullables sauf `cancellable`/`modifiable`/
 * `refundAllowed`/`creditAllowed` (le Master Admin doit trancher ces 4
 * questions oui/non pour publier une politique) — `deadlineHours` et
 * `cancellationFeePercent` restent `null` tant que l'Admin ne les a pas
 * explicitement saisis : `null` ≠ `0`, jamais confondus.
 */
export const cancellationPolicies = pgTable(
  "cancellation_policies",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    agencyId: uuid("agency_id")
      .notNull()
      .references(() => agencies.id, { onDelete: "cascade" }),
    productType: authorizedProductType("product_type").notNull(),
    /** `null` = politique par défaut pour tout ce `productType` chez cette agence. Sinon : id du produit précis (catalog_packages.id / omra_packages.id / catalog_activities.id — pas de FK Postgres cross-table, même choix déjà fait par `product_authorizations`). */
    productId: uuid("product_id"),
    version: integer("version").notNull().default(1),
    isActive: boolean("is_active").notNull().default(true),
    cancellable: boolean("cancellable").notNull(),
    modifiable: boolean("modifiable").notNull(),
    /** Heures avant le début du service au-delà desquelles la politique ne s'applique plus telle quelle (voir `postDeadlineDescription`). `null` = aucune échéance configurée. */
    deadlineHours: integer("deadline_hours"),
    /** 0–100. `null` = aucun frais configuré (distinct de 0 explicite). */
    cancellationFeePercent: decimal("cancellation_fee_percent", {
      precision: 5,
      scale: 2,
    }),
    refundAllowed: boolean("refund_allowed").notNull(),
    creditAllowed: boolean("credit_allowed").notNull(),
    nonRefundable: boolean("non_refundable").notNull().default(false),
    requiresValidatedDocument: boolean("requires_validated_document")
      .notNull()
      .default(false),
    /** Texte libre décrivant les conditions après l'échéance — jamais un calcul automatique inventé. */
    postDeadlineDescription: text("post_deadline_description"),
    effectiveFrom: timestamp("effective_from", { withTimezone: true })
      .notNull()
      .defaultNow(),
    createdByUserId: uuid("created_by_user_id"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("cancellation_policies_lookup_idx").on(
      t.agencyId,
      t.productType,
      t.productId,
      t.isActive,
    ),
    index("cancellation_policies_agency_idx").on(t.agencyId),
  ],
)

/* -------------------------------------------------------------------------- */
/* Easy2Book Rewards (Loyalty V1, Phase 38D)                                  */
/*                                                                            */
/* Même modèle éprouvé que Wallet (wallet_accounts + wallet_ledger) : un      */
/* compte par client (soldes dénormalisés pour lecture rapide) + un grand    */
/* livre APPEND-ONLY qui reste la SEULE source de vérité — voir              */
/* lib/loyalty/rewards-core.ts. Table DISTINCTE du Wallet (jamais fusionnée) */
/* : les points ne sont ni de l'argent, ni transférables, ni encaissables.   */
/* -------------------------------------------------------------------------- */

export const loyaltyAccounts = pgTable(
  "loyalty_accounts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    agencyId: uuid("agency_id")
      .notNull()
      .references(() => agencies.id, { onDelete: "cascade" }),
    customerId: uuid("customer_id")
      .notNull()
      .references(() => customers.id, { onDelete: "cascade" }),
    pendingPoints: integer("pending_points").notNull().default(0),
    availablePoints: integer("available_points").notNull().default(0),
    lifetimeEarnedPoints: integer("lifetime_earned_points")
      .notNull()
      .default(0),
    lifetimeRedeemedPoints: integer("lifetime_redeemed_points")
      .notNull()
      .default(0),
    /** Base de l'expiration après 24 mois d'inactivité. */
    lastActivityAt: timestamp("last_activity_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("loyalty_accounts_customer_uniq").on(t.customerId),
    index("loyalty_accounts_agency_idx").on(t.agencyId),
  ],
)

/**
 * Grand livre — jamais modifié ni supprimé après insertion. `idempotencyKey`
 * garantit "au plus une fois" par événement métier (retry réseau,
 * double-clic, webhook rejoué). Chaque ligne ne touche QU'UN SEUL bucket
 * (pending ou available) — une conversion pending→available s'écrit comme
 * deux lignes dans la même transaction.
 */
export const loyaltyLedger = pgTable(
  "loyalty_ledger",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    agencyId: uuid("agency_id")
      .notNull()
      .references(() => agencies.id, { onDelete: "cascade" }),
    loyaltyAccountId: uuid("loyalty_account_id")
      .notNull()
      .references(() => loyaltyAccounts.id, { onDelete: "cascade" }),
    customerId: uuid("customer_id")
      .notNull()
      .references(() => customers.id, { onDelete: "cascade" }),
    /** 'earn_pending' | 'convert_pending_out' | 'convert_available_in' | 'redeem' | 'reverse_pending' | 'reverse_available' | 'reinstate' | 'expire' */
    type: varchar("type", { length: 32 }).notNull(),
    bucket: varchar("bucket", { length: 16 }).notNull(),
    /** Delta signé appliqué à CE bucket. */
    points: integer("points").notNull(),
    balanceBefore: integer("balance_before").notNull(),
    balanceAfter: integer("balance_after").notNull(),
    /** Réservation à l'origine (earn/convert/reverse) ou cible (redeem/reinstate) du mouvement. Jamais de FK stricte. */
    reservationId: uuid("reservation_id"),
    description: text("description").notNull(),
    metadata: jsonb("metadata"),
    idempotencyKey: text("idempotency_key"),
    createdByUserId: uuid("created_by_user_id"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("loyalty_ledger_idempotency_uniq")
      .on(t.idempotencyKey)
      .where(sql`${t.idempotencyKey} is not null`),
    index("loyalty_ledger_account_idx").on(t.loyaltyAccountId, t.createdAt),
    index("loyalty_ledger_reservation_idx").on(t.reservationId),
    index("loyalty_ledger_agency_idx").on(t.agencyId),
  ],
)

/* -------------------------------------------------------------------------- */
/* Favoris (Wishlist)                                                         */
/*                                                                            */
/* Rattaché à `auth_user_id` (Supabase), JAMAIS à `customers.id` : un client  */
/* peut mettre un hôtel en favori avant toute réservation, donc avant qu'une  */
/* ligne `customers` existe pour lui (contrairement à Loyalty, où le compte   */
/* n'existe qu'après une réservation — voir lib/booking/customer-identity.ts).*/
/* -------------------------------------------------------------------------- */

/**
 * Un favori par (agence, utilisateur, type, référence) — contrainte unique
 * qui rend `toggleFavorite` idempotent (un double-clic / retry réseau ne
 * crée jamais de doublon). `itemRef` est TOUJOURS du texte : uuid du produit
 * catalogue local (omra/package/activity) ou identifiant myGo (hôtel, qui
 * n'a aucune fiche catalogue locale). `title`/`imageUrl`/`location`/
 * `priceFrom`/`href` sont un INSTANTANÉ capturé au moment de l'ajout — pour
 * afficher la liste "Mes favoris" sans redépendre d'un appel fournisseur
 * live ; jamais réutilisé comme prix ou disponibilité réels au moment de la
 * réservation (voir lib/favorites/favorites-core.ts).
 */
export const customerFavorites = pgTable(
  "customer_favorites",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    agencyId: uuid("agency_id")
      .notNull()
      .references(() => agencies.id, { onDelete: "cascade" }),
    authUserId: uuid("auth_user_id").notNull(),
    /** 'hotel' | 'omra' | 'package' | 'activity' */
    itemType: varchar("item_type", { length: 16 }).notNull(),
    itemRef: varchar("item_ref", { length: 128 }).notNull(),
    title: varchar("title", { length: 255 }).notNull(),
    imageUrl: text("image_url"),
    location: varchar("location", { length: 255 }),
    priceFrom: decimal("price_from", { precision: 12, scale: 2 }),
    currency: varchar("currency", { length: 3 }),
    href: varchar("href", { length: 255 }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("customer_favorites_uniq").on(
      t.agencyId,
      t.authUserId,
      t.itemType,
      t.itemRef,
    ),
    index("customer_favorites_user_idx").on(t.authUserId, t.createdAt),
    index("customer_favorites_agency_idx").on(t.agencyId),
  ],
)

export const REVIEW_MODULES = ["hotel", "omra", "package", "activity"] as const
export const REVIEW_STATUSES = ["pending", "approved", "rejected"] as const

/**
 * Avis clients (0047) — un avis n'existe QUE rattaché à une réservation
 * réelle (unique sur reservationId), jamais un formulaire libre. Modéré
 * avant publication : voir lib/reviews/reviews-core.ts pour la garantie
 * qu'aucune lecture publique ne renvoie un statut autre que 'approved'.
 */
export const reviews = pgTable(
  "reviews",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    agencyId: uuid("agency_id")
      .notNull()
      .references(() => agencies.id, { onDelete: "cascade" }),
    reservationId: uuid("reservation_id")
      .notNull()
      .references(() => reservations.id, { onDelete: "cascade" }),
    customerId: uuid("customer_id")
      .notNull()
      .references(() => customers.id, { onDelete: "cascade" }),
    /** 'hotel' | 'omra' | 'package' | 'activity' */
    module: varchar("module", { length: 16 }).notNull(),
    /** uuid catalogue ou id myGo texte — même raisonnement que customerFavorites.itemRef. */
    productRef: varchar("product_ref", { length: 128 }).notNull(),
    rating: integer("rating").notNull(),
    comment: text("comment"),
    /** 'pending' | 'approved' | 'rejected' */
    status: varchar("status", { length: 16 }).notNull().default("pending"),
    moderatedByUserId: uuid("moderated_by_user_id"),
    moderatedAt: timestamp("moderated_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("reviews_reservation_id_uniq").on(t.reservationId),
    index("reviews_product_idx").on(
      t.agencyId,
      t.module,
      t.productRef,
      t.status,
    ),
    index("reviews_agency_status_idx").on(t.agencyId, t.status, t.createdAt),
  ],
)

/* -------------------------------------------------------------------------- */
/* CRM / Leads                                                                */
/*                                                                            */
/* Capture des demandes de contact ("Être rappelé" / "Demander un devis")    */
/* déposées par un visiteur AVANT toute réservation — distinct de `customers` */
/* (créé seulement au moment d'une réservation réelle) et de                 */
/* lib/crm/provider.ts (pousse une réservation CONFIRMÉE vers un CRM externe,*/
/* jamais branché faute de système choisi). Tant qu'aucun CRM externe n'est  */
/* configuré, cette table EST le CRM — jamais un formulaire "fantôme" qui    */
/* affiche un succès sans rien persister.                                    */
/* -------------------------------------------------------------------------- */

export const leads = pgTable(
  "leads",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    agencyId: uuid("agency_id")
      .notNull()
      .references(() => agencies.id, { onDelete: "cascade" }),
    firstName: varchar("first_name", { length: 100 }).notNull(),
    lastName: varchar("last_name", { length: 100 }),
    email: varchar("email", { length: 320 }),
    phone: varchar("phone", { length: 32 }),
    message: text("message"),
    /** 'hotel' | 'omra' | 'package' | 'activity' | 'general' */
    productType: varchar("product_type", { length: 16 })
      .notNull()
      .default("general"),
    /** uuid produit catalogue (omra/package/activity) ou id myGo (hôtel) — texte, jamais de FK stricte (voir customerFavorites.itemRef, même raisonnement). */
    productRef: varchar("product_ref", { length: 128 }),
    /** Instantané du titre produit au moment de la demande — évite un join pour afficher la liste des leads. */
    productLabel: varchar("product_label", { length: 255 }),
    /** Chemin de la page d'où la demande a été envoyée (ex. "/packages/mon-voyage") — utile pour prioriser/comprendre la demande, jamais affiché comme donnée client. */
    sourcePage: varchar("source_page", { length: 255 }).notNull(),
    /**
     * CRM-NICHE-01 — destination demandée (ville/pays), texte libre saisi
     * par le visiteur ou déduit du produit catalogue au moment de la
     * capture — jamais une FK stricte (même raisonnement que productRef).
     */
    destination: varchar("destination", { length: 128 }),
    /**
     * CRM-NICHE-01 — 'groupe' | 'transfert' | 'a_la_carte' | 'standard'.
     * Alignée sur la décision Devis (2026-09-29, ROADMAP Phase 3 R3-03) :
     * les 3 valeurs non-standard correspondent exactement aux 3 cas où un
     * futur flux devis s'appliquera. Validé en code (LEAD_INTENTIONS,
     * lib/crm/leads-core.ts), pas un enum DB — permet d'ajouter une
     * intention sans migration.
     */
    intention: varchar("intention", { length: 16 })
      .notNull()
      .default("standard"),
    /**
     * CRM-NICHE-01 — marché/marque Easy2Book (ex. "tunisia"), pas un code
     * pays ISO générique : une entité commerciale distincte (Tunisia, puis
     * USA, Asia...). Validé contre LEAD_MARKETS (lib/crm/leads-core.ts),
     * pas un enum DB — ajouter un marché ne demande aucune migration.
     */
    market: varchar("market", { length: 32 }).notNull().default("tunisia"),
    /**
     * NETWORK-DEMAND-CAPTURE-01 — cache RÉSOLU (rang de confiance maximal
     * par rôle, jamais un simple départage par date — voir
     * LEAD_ORIGIN_SOURCE_TRUST, lib/crm/network-demand-capture-core.ts),
     * jamais écrit directement : toujours dérivé du journal append-only
     * `leadOriginEvents` par `recordLeadOriginEventCore()`. Distinct de
     * `agencyId` (tenant propriétaire, ci-dessus) : ici, l'agence qui a
     * APPORTÉ la demande (ex. une agence `agencyType='partner'`) — peut
     * être une agence différente du tenant propriétaire.
     */
    originAgencyId: uuid("origin_agency_id").references(() => agencies.id, {
      onDelete: "set null",
    }),
    /** NETWORK-DEMAND-CAPTURE-01 — cache résolu : le commercial/agent apporteur, distinct de `handledByUserId` (qui TRAITE le lead après coup). */
    capturedByUserId: uuid("captured_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    /** NETWORK-DEMAND-CAPTURE-01 — cache résolu : canal de capture, validé contre LEAD_CHANNELS (lib/crm/leads-core.ts), pas un enum DB. */
    channel: varchar("channel", { length: 32 }),
    /** NETWORK-DEMAND-CAPTURE-01 — cache résolu : référence de campagne/acquisition, texte libre (aucun mécanisme de capture structuré n'existe encore — ce chantier prépare la forme, pas le branchement). */
    campaignRef: varchar("campaign_ref", { length: 255 }),
    /** 'new' | 'contacted' | 'converted' | 'closed' */
    status: varchar("status", { length: 16 }).notNull().default("new"),
    staffNotes: text("staff_notes"),
    handledByUserId: uuid("handled_by_user_id"),
    /**
     * Réservation réelle produite par ce lead — jamais renseigné
     * automatiquement (voir convertLeadCore, lib/crm/leads-core.ts) : le
     * staff choisit explicitement la réservation lors de la conversion.
     * UNIQUE (0043) : une réservation ne peut être la conversion que d'un
     * seul lead. CHECK (0043) : `status='converted'` exige cette colonne.
     */
    reservationId: uuid("reservation_id").references(() => reservations.id, {
      onDelete: "set null",
    }),
    convertedAt: timestamp("converted_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("leads_agency_status_idx").on(t.agencyId, t.status, t.createdAt),
    index("leads_agency_idx").on(t.agencyId),
    uniqueIndex("leads_reservation_id_uniq").on(t.reservationId),
    /** CRM-NICHE-01 — colonnes de group-by de getNicheSegmentsCore(). */
    index("leads_agency_market_product_intention_idx").on(
      t.agencyId,
      t.market,
      t.productType,
      t.intention,
    ),
    /** NETWORK-DEMAND-CAPTURE-01 — colonnes de group-by futures (CRM-NICHE-02). */
    index("leads_agency_origin_channel_idx").on(
      t.agencyId,
      t.originAgencyId,
      t.channel,
    ),
  ],
)

/**
 * NETWORK-DEMAND-CAPTURE-01 — journal append-only du chemin de provenance
 * d'un lead (campagne → partenaire → commercial → canal → agence...).
 * JAMAIS de UPDATE/DELETE (même invariant que `wallet_ledger`, R4-03) :
 * une correction s'écrit comme un NOUVEL événement, l'ancien reste visible.
 * Les colonnes résolues sur `leads` (originAgencyId/capturedByUserId/
 * channel/campaignRef) sont un cache dérivé de ce journal — rang de
 * confiance maximal par rôle, jamais un simple départage par date (voir
 * LEAD_ORIGIN_SOURCE_TRUST, lib/crm/network-demand-capture-core.ts) —
 * jamais écrites directement par l'app hors de `recordLeadOriginEventCore()`.
 */
export const leadOriginEvents = pgTable(
  "lead_origin_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** Dénormalisé depuis leads.agencyId — évite un join dans la policy RLS. */
    agencyId: uuid("agency_id")
      .notNull()
      .references(() => agencies.id, { onDelete: "cascade" }),
    leadId: uuid("lead_id")
      .notNull()
      .references(() => leads.id, { onDelete: "cascade" }),
    /** 'campaign' | 'origin_agency' | 'captured_by_user' | 'channel' — validé contre LEAD_ORIGIN_ROLES (lib/crm/network-demand-capture-core.ts). */
    role: varchar("role", { length: 24 }).notNull(),
    /** uuid (agence/user) ou texte libre (canal/campagne) selon le rôle — jamais interprété au niveau DB. */
    actorRef: varchar("actor_ref", { length: 255 }).notNull(),
    /** Mécanisme de capture — rang de confiance défini dans LEAD_ORIGIN_SOURCE_TRUST (lib/crm/network-demand-capture-core.ts). */
    source: varchar("source", { length: 64 }).notNull(),
    notes: text("notes"),
    recordedAt: timestamp("recorded_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("lead_origin_events_lead_idx").on(t.leadId, t.recordedAt),
    index("lead_origin_events_agency_idx").on(t.agencyId),
  ],
)

/**
 * Scoring des leads (0044, étape 2/3 : Conversion → Scoring → Relance).
 * 4 signaux FIXES objectivement observables (jamais un critère métier
 * inventé) — chacun vaut un nombre de points configurable par le staff OTA
 * via `lead-scoring-actions.ts`. Voir `computeLeadScore()`
 * (lib/crm/lead-scoring-core.ts) pour le calcul, toujours transparent (le
 * détail signal-par-signal est retourné, jamais un score opaque).
 */
export const leadScoringRules = pgTable(
  "lead_scoring_rules",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    agencyId: uuid("agency_id")
      .notNull()
      .references(() => agencies.id, { onDelete: "cascade" }),
    signal: varchar("signal", { length: 32 }).notNull(),
    points: integer("points").notNull().default(0),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("lead_scoring_rules_agency_idx").on(t.agencyId),
    uniqueIndex("lead_scoring_rules_agency_signal_uniq").on(
      t.agencyId,
      t.signal,
    ),
  ],
)

/**
 * Relance des leads (0045, étape 3/3 : Conversion → Scoring → Relance).
 * Portée limitée à l'ALERTE STAFF (un lead "new" sans suivi depuis
 * `thresholdDays` devient visible dans /admin/support) — PAS un envoi
 * automatique vers le lead (WhatsApp/email), qui exigerait un contenu
 * marketing et, pour WhatsApp, un template pré-approuvé Meta : décision
 * produit non tranchée, jamais inventée ici. Voir `isLeadStale()`
 * (lib/crm/lead-relance-core.ts).
 */
export const leadRelanceSettings = pgTable(
  "lead_relance_settings",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    agencyId: uuid("agency_id")
      .notNull()
      .references(() => agencies.id, { onDelete: "cascade" }),
    thresholdDays: integer("threshold_days").notNull().default(3),
    isEnabled: boolean("is_enabled").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [uniqueIndex("lead_relance_settings_agency_uniq").on(t.agencyId)],
)

export const CRM_CHANNELS = [
  "whatsapp",
  "instagram",
  "messenger",
  "call",
  "email",
  "web",
] as const
export type CrmChannel = (typeof CRM_CHANNELS)[number]

/**
 * CONSENT-01 — journal append-only de permission marketing, par point de
 * contact (PAS par lead ni par "personne" — aucune de ces deux entités
 * n'a d'identité canonique dans ce dépôt, voir audit de conception).
 * JAMAIS de UPDATE/DELETE (même invariant que lead_origin_events/
 * wallet_ledger) : une révocation ou un nouvel opt-in s'écrit comme un
 * NOUVEL événement, l'ancien reste visible pour la preuve (point 5 du
 * modèle : qui/quoi, quand, par quel mécanisme).
 *
 * Clé de résolution : (agencyId, channel, contactRef, purpose). Dernier
 * événement par `occurredAt` fait foi — contrairement à
 * `lead_origin_events` (NETWORK-DEMAND-CAPTURE-01), "dernier gagne" est
 * ICI la règle correcte : un seul auteur légitime (la personne elle-même
 * ou un staff agissant pour elle) exprime une volonté séquentielle, pas
 * des tiers concurrents qui s'affirment des choses contradictoires.
 */
export const CONSENT_PURPOSES = ["marketing"] as const
export type ConsentPurpose = (typeof CONSENT_PURPOSES)[number]

export const CONSENT_ACTIONS = ["granted", "withdrawn"] as const
export type ConsentAction = (typeof CONSENT_ACTIONS)[number]

export const leadConsentEvents = pgTable(
  "lead_consent_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    agencyId: uuid("agency_id")
      .notNull()
      .references(() => agencies.id, { onDelete: "cascade" }),
    /** 'whatsapp' | 'instagram' | ... — réutilise CRM_CHANNELS, pas un second vocabulaire canal. */
    channel: varchar("channel", { length: 32 }).notNull(),
    /** Email (minuscules) ou téléphone — texte brut, PAS une FK vers customers/leads (aucune identité canonique n'existe). */
    contactRef: varchar("contact_ref", { length: 320 }).notNull(),
    /** 'marketing' — seule finalité gérée ; le transactionnel n'a aucune ligne ici, jamais soumis à ce contrôle. */
    purpose: varchar("purpose", { length: 32 }).notNull(),
    /** 'granted' | 'withdrawn'. */
    action: varchar("action", { length: 16 }).notNull(),
    occurredAt: timestamp("occurred_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    /** Mécanisme d'enregistrement — ex. "lead_capture_form_checkbox", "staff_manual_entry". */
    source: varchar("source", { length: 64 }).notNull(),
    /** Référence/version du texte de consentement, si pertinent — jamais le contenu intégral. */
    proofRef: varchar("proof_ref", { length: 255 }),
    /** null = la personne elle-même ; renseigné = un staff a agi en son nom. */
    recordedByUserId: uuid("recorded_by_user_id"),
  },
  (t) => [
    index("lead_consent_events_resolution_idx").on(
      t.agencyId,
      t.channel,
      t.contactRef,
      t.purpose,
      t.occurredAt,
    ),
  ],
)

/**
 * CONTACT-01 — registre de POINTS DE CONTACT normalisés, PAS une
 * identité "personne". Une ligne = (agencyId, channel, contactRef)
 * normalisé, avec un id stable réutilisable par d'autres modules
 * (ex. CAMPAIGN) pour regrouper sans fusionner.
 *
 * Audit de conception dédié (docs/ROADMAP.md) : `customers` a été
 * explicitement exclu comme fondation (aucun index unique sur
 * email/phone, et lib/admin/customer-360-core.ts documente déjà qu'un
 * même lead peut correspondre à plusieurs `customerId` sans jamais être
 * fusionné). Ce registre ne prétend PAS résoudre qui est la personne —
 * seulement reconnaître qu'une même valeur de contact réapparaît.
 *
 * PAS append-only (contrairement à lead_consent_events) : `lastSeenAt`
 * est mis à jour à chaque résolution du même point de contact — c'est
 * un registre/dimension, pas un journal d'événements.
 *
 * Aucune colonne leadId/customerId/personId ici, et AUCUN backfill —
 * le registre se peuple uniquement à l'appel explicite d'un
 * consommateur (voir lib/crm/contact-core.ts), jamais par migration de
 * données historiques.
 */
export const contacts = pgTable(
  "contacts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    agencyId: uuid("agency_id")
      .notNull()
      .references(() => agencies.id, { onDelete: "cascade" }),
    channel: varchar("channel", { length: 32 }).notNull(),
    contactRef: varchar("contact_ref", { length: 320 }).notNull(),
    firstSeenAt: timestamp("first_seen_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("contacts_resolution_uniq").on(
      t.agencyId,
      t.channel,
      t.contactRef,
    ),
  ],
)

/**
 * BEHAVIORAL-SIGNAL-01 — signal de DEMANDE MARCHÉ agrégé, PAS un
 * historique individuel. Audit de conception dédié (docs/ROADMAP.md,
 * BEHAVIORAL-INTENT-01/BEHAVIORAL-SIGNAL-01, décisions actées avec
 * l'utilisateur) :
 *  - AUCUN tracking individuel, aucune IP, aucun fingerprint, aucun
 *    identifiant de visiteur — une recherche hôtel incrémente un COMPTEUR
 *    partagé (agencyId, productType, destination, searchDate), jamais
 *    une ligne par recherche ;
 *  - "pilote" strictement limité au produit hôtel ("hotel") pour ce
 *    chantier — pas une plateforme générique d'événements comportementaux ;
 *  - jamais fusionné avec VIP Score (valeur client) ni NICHE
 *    (segmentation) — ce signal mesure la demande marché, pas une
 *    personne.
 */
export const searchDemandSignals = pgTable(
  "search_demand_signals",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    agencyId: uuid("agency_id")
      .notNull()
      .references(() => agencies.id, { onDelete: "cascade" }),
    /** "hotel" uniquement pour ce pilote — jamais un second vocabulaire que `leads.productType`. */
    productType: varchar("product_type", { length: 32 }).notNull(),
    /** Valeur canonique (ex. `destinationByValue(...).value`) — jamais un libellé localisé comme clé d'agrégation. */
    destination: varchar("destination", { length: 100 }).notNull(),
    /** Jour de l'agrégation (UTC) — granularité volontairement journalière, pas horaire. */
    searchDate: date("search_date").notNull(),
    searchCount: integer("search_count").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("search_demand_signals_agg_uniq").on(
      t.agencyId,
      t.productType,
      t.destination,
      t.searchDate,
    ),
    index("search_demand_signals_agency_date_idx").on(t.agencyId, t.searchDate),
  ],
)

/**
 * CAMPAIGN-PERSISTENCE-01 — identité, objectif et état d'une campagne
 * commerciale dans le temps. Audit de conception dédié (docs/ROADMAP.md) :
 * CAMPAIGN décide "à qui et pour quelle action commerciale" — jamais
 * "quelle offre" (PROMO), "quel prix" (PRICING) ni "quelle réservation"
 * (BOOKING). Aucune de ces colonnes n'apparaît ici.
 *
 * `objective` est un texte libre (ex. "Istanbul Novembre") — pas une FK
 * vers NICHE/AUDIENCE, qui restent des calculs à la demande, jamais
 * persistés. `promoRef` est un pointeur nullable, posé pour PROMO (non
 * construit), jamais une valeur de remise elle-même — même pattern que
 * `economicEntitlements.agreementId` (AGREEMENT-01) : une référence
 * technique provisoire, pas une équivalence conceptuelle.
 */
export const CAMPAIGN_STATUSES = [
  "draft",
  "active",
  "completed",
  "cancelled",
] as const
export type CampaignStatus = (typeof CAMPAIGN_STATUSES)[number]

export const campaigns = pgTable(
  "campaigns",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    agencyId: uuid("agency_id")
      .notNull()
      .references(() => agencies.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 200 }).notNull(),
    objective: text("objective"),
    /** Réutilise CRM_CHANNELS — une campagne cible UN canal, jamais un mélange implicite. */
    channel: varchar("channel", { length: 32 }).notNull(),
    /**
     * CAMPAIGN-EXTENSION-01 — contenu réellement montré à la cible.
     * Figé dès que `status !== 'draft'` (voir `updateCampaignCore`,
     * lib/crm/campaign-persistence-core.ts) : décision explicite de
     * l'utilisateur (2026-10-06) — changer le message après lancement
     * exige une NOUVELLE campagne, jamais une édition en place. Pas de
     * mécanisme de version séparé : la nouvelle campagne EST la nouvelle
     * version.
     */
    message: text("message"),
    status: varchar("status", { length: 16 }).notNull().default("draft"),
    /**
     * CAMPAIGN-EXTENSION-01 — fenêtre PLANIFIÉE, distincte de la date
     * réelle de clôture (transition `active → completed`, déjà portée
     * par `updatedAt`). Décision explicite de l'utilisateur (2026-10-06) :
     * champ dédié plutôt que déduit du statut. Contrairement à
     * name/objective/channel/message, restent modifiables même après
     * lancement — un planning s'ajuste, le contenu montré non (décision
     * non posée par l'utilisateur, tranchée ici et signalée explicitement).
     */
    startAt: timestamp("start_at", { withTimezone: true }),
    endAt: timestamp("end_at", { withTimezone: true }),
    /** Nullable — posé pour PROMO, jamais construit par ce chantier. */
    promoRef: uuid("promo_ref"),
    createdByUserId: uuid("created_by_user_id"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("campaigns_agency_status_idx").on(t.agencyId, t.status),
    check(
      "campaigns_status_check",
      sql`${t.status} in ('draft','active','completed','cancelled')`,
    ),
  ],
)

export type Campaign = typeof campaigns.$inferSelect
export type NewCampaign = typeof campaigns.$inferInsert

/**
 * CAMPAIGN-PERSISTENCE-01 — snapshot figé de la cible d'une campagne au
 * moment de son LANCEMENT (transition de statut 'draft' → 'active'),
 * PAS à sa création : une campagne se prépare un jour et se lance un
 * autre — les contacts visés doivent être figés au lancement, jamais
 * avant (sinon l'audience réelle au moment de l'action commerciale ne
 * correspondrait pas à ce qui a été préparé). JAMAIS un recalcul live
 * après coup : AUDIENCE n'est pas persistée (NICHE/SIGNAL/TREND restent
 * des calculs à la demande), donc c'est CE snapshot, pris une seule
 * fois au lancement, qui permet à CONVERSION/LEARNING de mesurer "qui a
 * été visé" sans que l'audience ne dérive après coup.
 *
 * `contactId` référence CONTACT-01 (jamais une copie d'email/téléphone
 * ici). `consentStatusAtSnapshot` est une COPIE HORODATÉE à but de
 * preuve ("ce qui était vrai à cet instant") — CONSENT-01 reste l'unique
 * source de vérité pour "est-ce vrai maintenant ?", jamais relue depuis
 * cette table. `leadIds` (jsonb) : traçabilité des demandes d'origine
 * ayant résolu à ce contact — jamais une fusion d'identité, uniquement
 * la liste telle que CAMPAIGN-01 (`filterAudienceByConsentCore`) l'a
 * produite.
 *
 * Seuls les contacts ÉLIGIBLES (CAMPAIGN-01) sont enregistrés ici — un
 * contact exclu (pas de consentement, pas de contactRef résolvable)
 * n'est jamais une "cible", donc jamais une ligne de cette table.
 */
export const campaignTargets = pgTable(
  "campaign_targets",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    campaignId: uuid("campaign_id")
      .notNull()
      .references(() => campaigns.id, { onDelete: "cascade" }),
    agencyId: uuid("agency_id")
      .notNull()
      .references(() => agencies.id, { onDelete: "cascade" }),
    contactId: uuid("contact_id")
      .notNull()
      .references(() => contacts.id),
    leadIds: jsonb("lead_ids").notNull(),
    consentStatusAtSnapshot: boolean("consent_status_at_snapshot").notNull(),
    snapshotAt: timestamp("snapshot_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    /** CAMPAIGN-DELIVERY-01 — statut de livraison du message pour ce contact. */
    deliveryStatus: varchar("delivery_status", { length: 16 })
      .notNull()
      .default("pending"),
    deliveredAt: timestamp("delivered_at", { withTimezone: true }),
  },
  (t) => [
    uniqueIndex("campaign_targets_campaign_contact_uniq").on(
      t.campaignId,
      t.contactId,
    ),
    index("campaign_targets_agency_idx").on(t.agencyId),
    index("campaign_targets_delivery_status_idx").on(
      t.campaignId,
      t.deliveryStatus,
    ),
  ],
)

export type CampaignTarget = typeof campaignTargets.$inferSelect
export type NewCampaignTarget = typeof campaignTargets.$inferInsert

/**
 * CAMPAIGN-ATTRIBUTION-01 — lien STABLE ET TRAÇABLE entre une réservation
 * réelle (BOOKING) et la campagne qui l'a généreée, écrit UNE SEULE FOIS
 * au moment où le rapprochement est calculé. Audit de conception dédié
 * (docs/ROADMAP.md) : un calcul recomposé à la lecture (jointure
 * reservations → customers → contacts → campaign_targets à la demande)
 * n'est PAS traçable — si la logique de rapprochement change plus tard,
 * l'historique changerait silencieusement rétroactivement. D'où cette
 * table, écrite une fois, jamais recalculée.
 *
 * BOOKING n'est JAMAIS modifié par ce chantier : aucune colonne ajoutée
 * sur `reservations`/`customers`, aucun des ~15 fichiers de création de
 * réservation touché. Le rapprochement est calculé par un job CAMPAIGN
 * (cron, lib/crm/campaign-attribution-core.ts), en LECTURE SEULE côté
 * BOOKING (reservations.customerId → customers.email/phone, normalisés
 * via CONTACT-01, jamais une seconde normalisation).
 *
 * Règle de sélection déterministe (1 réservation = 1 crédit, jamais
 * plusieurs) actée explicitement par l'utilisateur (2026-10-06) :
 * parmi les campagnes dont le contact fait partie de `campaign_targets`,
 * encore éligibles (statut 'active'/'completed', jamais 'cancelled'),
 * et dont la fenêtre [snapshotAt, endAt ?? +∞] couvre la date de la
 * réservation — le snapshot le plus RÉCENT gagne ; égalité parfaite →
 * `campaignId` le plus petit comme tie-breaker stable.
 *
 * `reservationId` UNIQUE : contrainte DB qui rend structurellement
 * impossible une double attribution, pas seulement une convention de
 * code.
 */
export const campaignAttributions = pgTable(
  "campaign_attributions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    agencyId: uuid("agency_id")
      .notNull()
      .references(() => agencies.id, { onDelete: "cascade" }),
    campaignId: uuid("campaign_id")
      .notNull()
      .references(() => campaigns.id),
    contactId: uuid("contact_id")
      .notNull()
      .references(() => contacts.id),
    reservationId: uuid("reservation_id")
      .notNull()
      .references(() => reservations.id),
    attributedAt: timestamp("attributed_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("campaign_attributions_reservation_uniq").on(t.reservationId),
    index("campaign_attributions_campaign_idx").on(t.campaignId),
    index("campaign_attributions_agency_idx").on(t.agencyId),
  ],
)

export type CampaignAttribution = typeof campaignAttributions.$inferSelect
export type NewCampaignAttribution = typeof campaignAttributions.$inferInsert

/**
 * PROMO-01 — définition d'une offre commerciale, STRICTEMENT liée à UNE
 * campagne (décision explicite de l'utilisateur, 2026-10-06 : pas de
 * promo générique indépendante — `campaignId` obligatoire et UNIQUE,
 * 1 promo par campagne, cohérent avec `campaigns.promoRef`, un pointeur
 * singulier posé dès CAMPAIGN-PERSISTENCE-01).
 *
 * Audit de conception dédié (docs/ROADMAP.md) : PROMO décide "quelle
 * offre", JAMAIS "quel prix final" (PRICING) ni "quelle réservation"
 * (BOOKING) — aucune colonne prix/réservation ici. `discountType`/
 * `discountValue` suivent le même vocabulaire que `marginRules`
 * (percent/fixed) — pas une deuxième convention.
 *
 * Immutabilité : comme `campaigns.message`, une promo n'est modifiable
 * que tant que la campagne propriétaire est en statut 'draft' — gardé
 * en code (`updatePromoCore`), pas par un grant DB séparé (même
 * discipline que CAMPAIGN-EXTENSION-01).
 */
export const PROMO_DISCOUNT_TYPES = ["percent", "fixed"] as const
export type PromoDiscountType = (typeof PROMO_DISCOUNT_TYPES)[number]

export const promos = pgTable(
  "promos",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    agencyId: uuid("agency_id")
      .notNull()
      .references(() => agencies.id, { onDelete: "cascade" }),
    campaignId: uuid("campaign_id")
      .notNull()
      .references(() => campaigns.id, { onDelete: "cascade" }),
    discountType: varchar("discount_type", { length: 16 }).notNull(),
    discountValue: decimal("discount_value", {
      precision: 10,
      scale: 2,
    }).notNull(),
    /** Texte libre — ex. "séjour 3 nuits minimum", jamais interprété par le code (même choix que `marginRules.name`/`economicEntitlements.basis`). */
    conditions: text("conditions"),
    /** `null` = sans borne de ce côté. */
    validFrom: timestamp("valid_from", { withTimezone: true }),
    validTo: timestamp("valid_to", { withTimezone: true }),
    /**
     * PROMO-LOSS-POLICY-01 — décision commerciale EXPLICITE de l'agence,
     * jamais déduite par PRICING. `false` (défaut) : PRICING plafonne la
     * remise au coût fournisseur quand un coût séparé existe (hotel/
     * flight/transfer/network) — sans objet pour omra/package/activity/
     * car, qui n'ont pas de coût fournisseur distinct (`supplierPriceTnd
     * === salePriceTnd`, vérifié par lecture de ces modules). `true` :
     * l'agence autorise explicitement une vente à perte pour cette promo.
     * Ni PRICING ni PROMO n'inventent cette politique — elle est posée
     * ici, au moment de la création de la promo, par celui qui la décide.
     */
    allowBelowCost: boolean("allow_below_cost").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("promos_campaign_uniq").on(t.campaignId),
    index("promos_agency_idx").on(t.agencyId),
    check(
      "promos_discount_type_check",
      sql`${t.discountType} in ('percent','fixed')`,
    ),
  ],
)

export type Promo = typeof promos.$inferSelect
export type NewPromo = typeof promos.$inferInsert

/**
 * CRM / Inbox omnicanal (0046) — fondations "Customer 360" du diagramme
 * cible joint à l'audit senior OTA. Modèle agnostique du canal ; seul
 * WhatsApp a une intégration entrante réelle à ce stade (voir
 * app/api/webhooks/whatsapp/route.ts) — Instagram/Messenger/Call restent
 * des valeurs de `channel` valides mais sans provider branché (pas de
 * credentials Meta App Review / téléphonie), jamais simulés.
 */
export const crmConversations = pgTable(
  "crm_conversations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    agencyId: uuid("agency_id")
      .notNull()
      .references(() => agencies.id, { onDelete: "cascade" }),
    /** 'whatsapp' | 'instagram' | 'messenger' | 'call' | 'email' | 'web' */
    channel: varchar("channel", { length: 16 }).notNull(),
    contactPhone: varchar("contact_phone", { length: 32 }),
    contactExternalId: varchar("contact_external_id", { length: 128 }),
    contactName: varchar("contact_name", { length: 200 }),
    leadId: uuid("lead_id").references(() => leads.id, {
      onDelete: "set null",
    }),
    /** 'open' | 'closed' */
    status: varchar("status", { length: 16 }).notNull().default("open"),
    lastMessageAt: timestamp("last_message_at", { withTimezone: true }),
    /** Dernier message ENTRANT — base du calcul de la fenêtre de service WhatsApp 24h. */
    lastInboundAt: timestamp("last_inbound_at", { withTimezone: true }),
    lastMessagePreview: varchar("last_message_preview", { length: 500 }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("crm_conversations_agency_channel_phone_uniq")
      .on(t.agencyId, t.channel, t.contactPhone)
      .where(sql`${t.contactPhone} is not null`),
    uniqueIndex("crm_conversations_agency_channel_external_uniq")
      .on(t.agencyId, t.channel, t.contactExternalId)
      .where(sql`${t.contactExternalId} is not null`),
    index("crm_conversations_agency_idx").on(t.agencyId, t.lastMessageAt),
    index("crm_conversations_lead_idx").on(t.leadId),
  ],
)

export const crmMessages = pgTable(
  "crm_messages",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** Dénormalisé depuis crmConversations, même convention que payments.agencyId. */
    agencyId: uuid("agency_id")
      .notNull()
      .references(() => agencies.id, { onDelete: "cascade" }),
    conversationId: uuid("conversation_id")
      .notNull()
      .references(() => crmConversations.id, { onDelete: "cascade" }),
    /** 'inbound' | 'outbound' */
    direction: varchar("direction", { length: 8 }).notNull(),
    body: text("body"),
    handledByUserId: uuid("handled_by_user_id"),
    /** wamid Meta (ou équivalent futur) — idempotence des redélivrances webhook. */
    externalMessageId: varchar("external_message_id", { length: 128 }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("crm_messages_external_message_id_uniq")
      .on(t.externalMessageId)
      .where(sql`${t.externalMessageId} is not null`),
    index("crm_messages_conversation_idx").on(t.conversationId, t.createdAt),
  ],
)

/**
 * Factures émises par l'OTA à une agence B2B partenaire.
 *
 * Une facture peut grouper plusieurs réservations (lignes JSONB).
 */
export const partnerInvoices = pgTable(
  "partner_invoices",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    agencyId: uuid("agency_id")
      .notNull()
      .references(() => agencies.id, { onDelete: "restrict" }),
    /** Numéro public (ex. F-2026-00012). */
    invoiceNumber: varchar("invoice_number", { length: 32 }).notNull(),
    invoiceType: invoiceType("invoice_type").notNull().default("facture"),
    validationDate: date("validation_date"),
    /** Liste des réservations facturées (jsonb : [{reservationId, label, amount}]). */
    lineItems: jsonb("line_items"),
    /**
     * Réservation facturée individuellement (facture générée automatiquement
     * après confirmation — voir lib/finance/invoice-actions.ts). NULL pour
     * une facture consolidée multi-réservations (lineItems). Index unique
     * partiel (WHERE NOT NULL) : garantit au niveau DB qu'une réservation
     * facturée individuellement ne peut jamais avoir deux factures, même
     * sous deux appels concurrents à generateInvoiceForReservation().
     */
    reservationId: uuid("reservation_id").references(() => reservations.id, {
      onDelete: "restrict",
    }),
    totalHt: decimal("total_ht", { precision: 14, scale: 2 }).notNull(),
    totalTva: decimal("total_tva", { precision: 14, scale: 2 }).notNull(),
    totalTtc: decimal("total_ttc", { precision: 14, scale: 2 }).notNull(),
    amountPaid: decimal("amount_paid", { precision: 14, scale: 2 })
      .notNull()
      .default("0"),
    /** 'draft' / 'issued' / 'paid' / 'partial' / 'overdue' / 'cancelled'. */
    status: varchar("status", { length: 16 }).notNull().default("draft"),
    /** Date d'échéance de règlement. */
    dueDate: date("due_date"),
    /** URL PDF (Supabase Storage). */
    pdfUrl: text("pdf_url"),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    /** Phase 21.2 — scopé PAR AGENCE (jamais global) : nextInvoiceNumber()
     * (lib/finance/invoice-actions.ts) compte les factures existantes de
     * la SEULE agence appelante pour calculer le prochain numéro — un
     * index global sur invoiceNumber seul faisait donc collisionner la
     * "FA-2026-00001" de deux agences différentes dès que chacune émettait
     * sa première facture de l'année (bug latent trouvé en vérification
     * live Phase 21.2, jamais un choix de design). Même motif que
     * `reservations_public_ref_uniq` (agencyId, publicRef), déjà correct. */
    uniqueIndex("partner_invoices_number_uniq").on(t.agencyId, t.invoiceNumber),
    index("partner_invoices_agency_idx").on(t.agencyId),
    index("partner_invoices_status_idx").on(t.agencyId, t.status),
    uniqueIndex("partner_invoices_reservation_uniq")
      .on(t.reservationId)
      .where(sql`${t.reservationId} IS NOT NULL`),
  ],
)

/**
 * Règlements (entrées de paiement liées aux factures).
 *
 * 1 facture peut avoir N règlements (paiement partiel + solde).
 */
export const partnerPayments = pgTable(
  "partner_payments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    agencyId: uuid("agency_id")
      .notNull()
      .references(() => agencies.id, { onDelete: "restrict" }),
    invoiceId: uuid("invoice_id").references(() => partnerInvoices.id, {
      onDelete: "set null",
    }),
    paymentMode: paymentMode("payment_mode").notNull(),
    /** Date d'échéance prévue. */
    dueDate: date("due_date"),
    /** Date d'émission effective du règlement. */
    issueDate: date("issue_date"),
    /** Montant initialement attendu. */
    originalAmount: decimal("original_amount", {
      precision: 14,
      scale: 2,
    }).notNull(),
    /** Montant restant à payer après cette opération. */
    remainingAmount: decimal("remaining_amount", { precision: 14, scale: 2 })
      .notNull()
      .default("0"),
    /** Crédit accordé (avance/dépôt). */
    creditAmount: decimal("credit_amount", { precision: 14, scale: 2 }),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("partner_payments_agency_idx").on(t.agencyId),
    index("partner_payments_invoice_idx").on(t.invoiceId),
  ],
)

/**
 * Ledger des mouvements sur le compte de dépôt d'une agence B2B.
 *
 * Tout débit/crédit de `agencies.depositBalance` génère ici une ligne pour
 * traçabilité comptable (relevé de compte, audit).
 */
export const partnerCreditMovements = pgTable(
  "partner_credit_movements",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    agencyId: uuid("agency_id")
      .notNull()
      .references(() => agencies.id, { onDelete: "restrict" }),
    movementType: creditMovementType("movement_type").notNull(),
    /**
     * Montant en TND avec son signe (positif pour `credit`/`refund`,
     * négatif pour `debit`/`adjustment` réducteur). Format `numeric(12, 3)`
     * pour aligner avec la précision millime du Dinar tunisien.
     */
    amount: decimal("amount", { precision: 12, scale: 3 }).notNull(),
    /** Solde après ce mouvement (snapshot). */
    balanceAfter: decimal("balance_after", {
      precision: 12,
      scale: 3,
    }).notNull(),
    /**
     * chantier-49C, étape 1 (expand/contract) — voir commentaire équivalent
     * sur wallet_ledger (lib/db/schema/financials.ts). Nullable, double-
     * écrites par lib/finance/millimes.ts, aucune lecture n'en dépend encore.
     */
    amountMillimes: bigint("amount_millimes", { mode: "number" }),
    balanceAfterMillimes: bigint("balance_after_millimes", { mode: "number" }),
    /** Référence externe (n° réservation, n° facture, etc.). */
    reference: varchar("reference", { length: 64 }),
    /** Lien optionnel à une réservation (présent sur tout débit booking). */
    reservationId: uuid("reservation_id"),
    /** Lien optionnel à une facture. */
    invoiceId: uuid("invoice_id"),
    description: text("description"),
    createdByUserId: uuid("created_by_user_id"),
    /**
     * Backstop DB indépendant de Redis (chantier-49, sous-chantier B) — même
     * pattern que `reservations.guest_idempotency_key` (0030) et
     * `payments.idempotency_key` (index unique partiel) : un retry après
     * timeout (Redis up ou down) retrouve le mouvement déjà créé au lieu
     * d'en créer un second ; un double-appel vraiment simultané se résout
     * via la contrainte unique elle-même.
     */
    idempotencyKey: text("idempotency_key"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("partner_credit_agency_idx").on(t.agencyId),
    index("partner_credit_created_idx").on(t.agencyId, t.createdAt),
    index("partner_credit_reservation_idx")
      .on(t.reservationId)
      .where(sql`${t.reservationId} is not null`),
    uniqueIndex("partner_credit_movements_idempotency_uniq")
      .on(t.idempotencyKey)
      .where(sql`${t.idempotencyKey} is not null`),
  ],
)

/* -------------------------------------------------------------------------- */
/* WALLET RECHARGE REQUESTS                                                  */
/* -------------------------------------------------------------------------- */

export const rechargeMethod = pgEnum("recharge_method", [
  "cash", // espèces à l'agence
  "bank_transfer", // virement bancaire
  "postal_transfer", // virement postal (CCP / La Poste)
  "postal_mandate", // mandat postal
  "check", // chèque
  "card_international", // CB internationale (Stripe — futur)
])

export const rechargeStatus = pgEnum("recharge_status", [
  "pending", // en attente de validation admin
  "validated", // validé — wallet crédité
  "rejected", // refusé
])

/**
 * Demandes de recharge wallet.
 *
 * Workflow :
 *   1. Agent B2B soumet une demande (montant + méthode + justificatif)
 *   2. Admin valide → `status = validated`, `agencies.deposit_balance` crédité
 *   3. Un mouvement `credit` est créé dans `partner_credit_movements`
 *
 * Le justificatif (photo reçu, bordereau virement) est stocké dans Supabase Storage.
 */
export const walletRechargeRequests = pgTable(
  "wallet_recharge_requests",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    agencyId: uuid("agency_id")
      .notNull()
      .references(() => agencies.id, { onDelete: "cascade" }),
    /** Utilisateur qui a soumis la demande. */
    requestedByUserId: uuid("requested_by_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "set null" }),
    /** Montant demandé en TND (millimes). */
    amount: decimal("amount", { precision: 12, scale: 3 }).notNull(),
    /** Méthode de paiement utilisée pour recharger. */
    method: rechargeMethod("method").notNull(),
    /** Référence du paiement (n° virement, n° mandat, etc.). */
    paymentReference: varchar("payment_reference", { length: 128 }),
    /** URL du justificatif (photo reçu, scan bordereau) dans Supabase Storage. */
    proofUrl: text("proof_url"),
    /** Note libre de l'agent. */
    note: text("note"),
    /** PSP identifier (stripe|sps|paymee) — set only for card_international recharges.
     * NULL for offline methods (cash/virement/mandat/chèque). Used by the webhook
     * handler to verify PSP identity before crediting the wallet. */
    psp: varchar("psp", { length: 32 }),
    status: rechargeStatus("status").notNull().default("pending"),
    /** Admin qui a validé/refusé. */
    reviewedByUserId: uuid("reviewed_by_user_id"),
    /** Motif de refus (si rejected). */
    rejectionReason: text("rejection_reason"),
    /** Date de validation/refus. */
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("recharge_req_agency_idx").on(t.agencyId),
    index("recharge_req_status_idx").on(t.status),
    index("recharge_req_created_idx").on(t.createdAt),
  ],
)

/* -------------------------------------------------------------------------- */
/* PRODUCTS - Catalogue multisectoriel polymorphique                          */
/* -------------------------------------------------------------------------- */

export const productStatus = pgEnum("product_status", [
  "draft",
  "active",
  "inactive",
  "archived",
])

export const productType = pgEnum("product_type", [
  "hotel",
  "flight",
  "package",
  "activity",
  "transfer",
  "omra",
  "car",
])

/**
 * Table products - Catalogue unifié avec attributs JSONB polymorphiques
 *
 * Architecture:
 * - type: discrimine le type de produit
 * - basePrice, currency: tarification de base
 * - attributes: JSONB contenant les spécificités selon le type
 *   * Hotel: { stars, amenities[], roomTypes[], location, boardType }
 *   * Flight: { airline, flightNumber, departure, arrival, duration, stops }
 *   * Package: { durationDays, destinations[], inclusions[], exclusions[] }
 *   * Activity: { duration, difficulty, meetingPoint, equipment[] }
 *   * Omra: { season, visa, includesZiarat, meccaHotel, madinaHotel }
 */
export const products = pgTable(
  "products",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    agencyId: uuid("agency_id")
      .notNull()
      .references(() => agencies.id, { onDelete: "cascade" }),
    /**
     * ECON-PILOT-01 : nœud fournisseur réseau (supplier_nodes) propriétaire
     * réel de ce produit, quand il vient du Network plutôt que du catalogue
     * agence classique. `null` pour tout produit non-Network (comportement
     * inchangé — cette colonne est additive et ne modifie aucune ligne
     * existante). Un produit Network garde `agencyId` = agence OTA par
     * défaut (`getDefaultAgencyId()`, même précédent que le guest checkout
     * B2C sans agence réelle) plutôt qu'un `agencyId` nullable — évite de
     * relâcher la contrainte NOT NULL sur une table déjà partitionnée par
     * agence.
     */
    supplierNodeId: uuid("supplier_node_id").references(
      () => supplierNodes.id,
      {
        onDelete: "set null",
      },
    ),
    /**
     * ECON-PILOT-01 : coût fournisseur réel (HT), distinct du prix de vente.
     * `null` = pas de coût connu séparément (comportement historique
     * inchangé pour tout produit créé avant ce chantier). Le prix de vente
     * n'est JAMAIS stocké ici — il est dérivé à la réservation via
     * `lib/finance/margin-calculator.ts` (Système B, déjà réel), jamais une
     * deuxième formule de marge.
     */
    costPrice: decimal("cost_price", { precision: 14, scale: 3 }),
    costCurrency: varchar("cost_currency", { length: 3 }),
    /** SKU unique par agence */
    sku: varchar("sku", { length: 64 }).notNull(),
    /** Type de produit discriminant */
    type: productType("type").notNull(),
    /** Statut du produit */
    status: productStatus("status").notNull().default("draft"),
    /** Nom commercial */
    name: varchar("name", { length: 255 }).notNull(),
    /** Description courte */
    shortDescription: text("short_description"),
    /** Description longue */
    longDescription: text("long_description"),
    /** Destination principale */
    destination: varchar("destination", { length: 128 }),
    /** Pays */
    country: varchar("country", { length: 64 }),
    /** Ville */
    city: varchar("city", { length: 64 }),
    /** Prix de base */
    basePrice: decimal("base_price", { precision: 12, scale: 3 }).notNull(),
    /** Devise */
    currency: varchar("currency", { length: 3 }).notNull().default("TND"),
    /** TVA applicable */
    vatRate: decimal("vat_rate", { precision: 4, scale: 2 }).default("7"),
    /** Stock disponible (null = illimité) */
    stock: integer("stock"),
    /**
     * ATTRIBUTS POLYMORPHIQUES JSONB
     * Structure selon le type:
     */
    attributes: jsonb("attributes").$type<
      | {
          // Hotel attributes
          stars?: number
          amenities?: string[]
          roomTypes?: { name: string; capacity: number; price: number }[]
          boardType?: "bb" | "hb" | "fb" | "ai"
          checkIn?: string
          checkOut?: string
          photos?: string[]
        }
      | {
          // Flight attributes
          airline?: string
          flightNumber?: string
          departure: { airport: string; time: string; date: string }
          arrival: { airport: string; time: string; date: string }
          duration?: string
          stops?: number
          cabinClass?: "economy" | "business" | "first"
          baggage?: { cabin: string; checked: string }
        }
      | {
          // Package attributes
          durationDays?: number
          destinations?: string[]
          inclusions?: string[]
          exclusions?: string[]
          itinerary?: { day: number; title: string; description: string }[]
          groupSize?: { min: number; max: number }
          guideLanguages?: string[]
        }
      | {
          // Activity attributes
          duration?: string
          difficulty?: "easy" | "moderate" | "hard"
          meetingPoint?: string
          equipment?: string[]
          minAge?: number
          maxParticipants?: number
          schedule?: { startTime: string; endTime: string; days: string[] }
        }
      | {
          // Omra attributes
          season?: string
          includesVisa?: boolean
          includesZiarat?: boolean
          includesTransfer?: boolean
          meccaHotel?: {
            name: string
            stars: number
            nights: number
            distance: string
          }
          madinaHotel?: {
            name: string
            stars: number
            nights: number
            distance: string
          }
          flightDetails?: { airline: string; departureCity: string }
          scholarGuide?: string
        }
    >(),
    /** Métadonnées SEO */
    seoMeta: jsonb("seo_meta").$type<{
      title?: string
      description?: string
      keywords?: string[]
    }>(),
    /** Configuration marges (override par défaut) */
    marginConfig: jsonb("margin_config").$type<{
      type: "percent" | "fixed"
      value: number
    }>(),
    /** Dates de validité */
    validFrom: date("valid_from"),
    validUntil: date("valid_until"),
    /** Créateur du produit */
    createdByUserId: uuid("created_by_user_id").references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("product_sku_agency_idx").on(t.agencyId, t.sku),
    index("product_type_idx").on(t.type),
    index("product_status_idx").on(t.status),
    index("product_destination_idx").on(t.destination),
    index("product_gin_idx").on(
      t.agencyId,
      sql`to_tsvector('french', ${t.name} || ' ' || COALESCE(${t.shortDescription}, ''))`,
    ),
  ],
)

/* -------------------------------------------------------------------------- */
/* PRODUCT INVENTORY - Disponibilités Temps Réel                              */
/* -------------------------------------------------------------------------- */

export const productInventory = pgTable(
  "product_inventory",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    productId: uuid("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "cascade" }),
    date: date("date").notNull(),
    endDate: date("end_date"),
    totalCapacity: integer("total_capacity").notNull(),
    available: integer("available").notNull().default(0),
    onHold: integer("on_hold").notNull().default(0),
    confirmed: integer("confirmed").notNull().default(0),
    price: decimal("price", { precision: 14, scale: 2 }),
    currency: varchar("currency", { length: 3 }).default("TND"),
    status: inventoryStatus("status").notNull().default("available"),
    supplierStock: integer("supplier_stock"),
    lastSyncAt: timestamp("last_sync_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("product_inventory_product_date_idx").on(t.productId, t.date),
    { name: "product_inventory_status_idx", on: t.status },
  ],
)

export type ProductInventory = typeof productInventory.$inferSelect
export type NewProductInventory = typeof productInventory.$inferInsert

/* -------------------------------------------------------------------------- */
/* AUDIT LOGS - Traçabilité des actions critiques                             */
/* -------------------------------------------------------------------------- */

export const auditActionType = pgEnum("audit_action_type", [
  // Réservations
  "reservation.created",
  "reservation.updated",
  "reservation.status_changed",
  "reservation.cancelled",
  "reservation.refunded",
  // Clients
  "client.created",
  "client.updated",
  "client.deleted",
  // Produits
  "product.created",
  "product.updated",
  "product.deleted",
  "product.price_changed",
  "product.status_changed",
  // Paiements
  "payment.processed",
  "payment.refunded",
  "invoice.generated",
  // Authentification
  "user.login",
  "user.logout",
  "user.password_changed",
  "user.role_changed",
  // Administration
  "staff.created",
  "staff.updated",
  "staff.deleted",
  "config.changed",
])

export const auditEntityType = pgEnum("audit_entity_type", [
  "reservation",
  "client",
  "product",
  "payment",
  "invoice",
  "user",
  "agency",
  "config",
])

/**
 * Table audit_logs - Enregistrement immuable de toutes les actions critiques
 *
 * Architecture:
 * - userId: qui a fait l'action
 * - action: type d'action (enum)
 * - entityType + entityId: quelle ressource a été affectée
 * - oldValue + newValue: snapshot des changements (JSONB)
 * - ipAddress + userAgent: contexte technique
 * - metadata: informations supplémentaires contextuelles
 */
export const auditLogs = pgTable(
  "audit_logs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    agencyId: uuid("agency_id")
      .notNull()
      .references(() => agencies.id, { onDelete: "cascade" }),
    /** Utilisateur ayant effectué l'action */
    userId: uuid("user_id").references(() => users.id),
    /** Email de l'utilisateur (denormalisé pour audit immuable) */
    userEmail: varchar("user_email", { length: 255 }),
    /** Rôle de l'utilisateur au moment de l'action */
    userRole: varchar("user_role", { length: 32 }),
    /** Type d'action */
    action: auditActionType("action").notNull(),
    /** Type d'entité concernée */
    entityType: auditEntityType("entity_type").notNull(),
    /** ID de l'entité concernée */
    entityId: varchar("entity_id", { length: 64 }),
    /** Valeur avant modification (snapshot JSON) */
    oldValue: jsonb("old_value"),
    /** Valeur après modification (snapshot JSON) */
    newValue: jsonb("new_value"),
    /** Diff calculé (pour affichage rapide) */
    changes:
      jsonb("changes").$type<Record<string, { from: unknown; to: unknown }>>(),
    /** IP de l'utilisateur */
    ipAddress: varchar("ip_address", { length: 45 }),
    /** User-Agent */
    userAgent: text("user_agent"),
    /** Métadonnées contextuelles (route, timestamp frontend, etc.) */
    metadata: jsonb("metadata"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("audit_logs_agency_idx").on(t.agencyId),
    index("audit_logs_user_idx").on(t.userId),
    index("audit_logs_action_idx").on(t.action),
    index("audit_logs_entity_idx").on(t.entityType, t.entityId),
    index("audit_logs_created_idx").on(t.createdAt),
    index("audit_logs_agency_created_idx").on(t.agencyId, t.createdAt),
  ],
)

/* -------------------------------------------------------------------------- */
/* Wallet (portefeuille électronique par agence)                             */
/* -------------------------------------------------------------------------- */

export const walletTopUpMethod = pgEnum("wallet_topup_method", [
  "VIREMENT", // Virement bancaire (STB, BNA, Attijari, BH…)
  "MANDAT", // Mandat postal / WafaCash / PosteNet
  "ZITOUNA_PAY", // Rechargement instantané via Zitouna Pay gateway
  "CASH", // Espèces remises en agence
])

export const walletTxStatus = pgEnum("wallet_tx_status", [
  "PENDING", // déclarée par l'agence, en attente de validation admin
  "VALIDATED", // validée → balance incrémentée
  "REJECTED", // rejetée (reçu incorrect, montant erroné…)
])

/**
 * Un wallet par agence — DÉPRÉCIÉ (chantier-49, nettoyage) : aucun flux de
 * rechargement en production ne crédite plus ce solde. Le solde réellement
 * crédité est `agencies.deposit_balance` (`partner_credit_movements`) —
 * voir lib/pro/booking-actions.ts::debitPartnerCredit. Conservé pour
 * `getWalletBalance()` (lib/wallet/balance.ts, sandbox `/pro` uniquement).
 *
 * `numeric(14,3)` : millimes TND, plage ±99 999 999 999.999 DT.
 */
export const wallets = pgTable(
  "wallets",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    agencyId: uuid("agency_id")
      .notNull()
      .unique()
      .references(() => agencies.id, { onDelete: "restrict" }),
    balance: decimal("balance", { precision: 14, scale: 3 })
      .notNull()
      .default("0.000"),
    currency: varchar("currency", { length: 3 }).notNull().default("TND"),
    /** Seuil d'alerte solde bas (déclenche notification). */
    lowBalanceThreshold: decimal("low_balance_threshold", {
      precision: 14,
      scale: 3,
    })
      .notNull()
      .default("100.000"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("wallets_agency_idx").on(t.agencyId)],
)

/**
 * Historique immuable des mouvements de wallet.
 *
 * Règle : ne jamais UPDATE une ligne wallet_transactions —
 * seul `status` peut passer PENDING → VALIDATED/REJECTED (via validateTopUp).
 *
 * Pour les CREDIT (rechargements) :
 *   - `proof_url` = URL Supabase Storage du reçu (virement / mandat)
 *   - `reference_number` = n° de bordereau bancaire ou mandat
 *
 * Pour les DEBIT (réservations) :
 *   - `reservation_id` = FK vers la réservation débitée
 *   - status est directement VALIDATED (débit immédiat si solde OK)
 */
export const walletTransactions = pgTable(
  "wallet_transactions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    walletId: uuid("wallet_id")
      .notNull()
      .references(() => wallets.id, { onDelete: "restrict" }),
    agencyId: uuid("agency_id")
      .notNull()
      .references(() => agencies.id, { onDelete: "restrict" }),
    type: walletTxType("type").notNull(),
    method: walletTopUpMethod("method"),
    /** Montant absolu (toujours positif — le signe est dans `type`). */
    amount: decimal("amount", { precision: 14, scale: 2 }).notNull(),
    /** Numéro de référence : n° virement, n° bordereau mandat, txId Zitouna. */
    referenceNumber: varchar("reference_number", { length: 128 }),
    /** URL Supabase Storage du reçu / preuve (photo borderereau). */
    proofUrl: text("proof_url"),
    status: walletTxStatus("status").notNull().default("PENDING"),
    /** FK vers la réservation débitée (pour DEBIT uniquement). */
    reservationId: uuid("reservation_id").references(() => reservations.id, {
      onDelete: "restrict",
    }),
    /** Message de rejet ou note admin. */
    adminNote: text("admin_note"),
    /** Métadonnées libres (réponse Zitouna, détails virement, etc.). */
    metadata: jsonb("metadata"),
    /** Admin qui a validé/rejeté. */
    validatedByUserId: uuid("validated_by_user_id"),
    validatedAt: timestamp("validated_at", { withTimezone: true }),
    createdByUserId: uuid("created_by_user_id"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("wallet_tx_wallet_idx").on(t.walletId),
    index("wallet_tx_agency_idx").on(t.agencyId),
    index("wallet_tx_status_idx").on(t.agencyId, t.status),
    index("wallet_tx_reservation_idx").on(t.reservationId),
    index("wallet_tx_created_idx").on(t.agencyId, t.createdAt),
  ],
)

/* -------------------------------------------------------------------------- */
/* Type exports                                                               */
/* -------------------------------------------------------------------------- */

export type Agency = typeof agencies.$inferSelect
export type NewAgency = typeof agencies.$inferInsert
export type User = typeof users.$inferSelect
export type Customer = typeof customers.$inferSelect
export type NewCustomer = typeof customers.$inferInsert
export type Reservation = typeof reservations.$inferSelect
export type NewReservation = typeof reservations.$inferInsert
export type Payment = typeof payments.$inferSelect
export type NewPayment = typeof payments.$inferInsert
export type PricingMargin = typeof pricingMargins.$inferSelect
export type NewPricingMargin = typeof pricingMargins.$inferInsert
export type LeadScoringRule = typeof leadScoringRules.$inferSelect
export type NewLeadScoringRule = typeof leadScoringRules.$inferInsert
export type LeadRelanceSetting = typeof leadRelanceSettings.$inferSelect
export type NewLeadRelanceSetting = typeof leadRelanceSettings.$inferInsert
export type PartnerInvoice = typeof partnerInvoices.$inferSelect
export type NewPartnerInvoice = typeof partnerInvoices.$inferInsert
export type PartnerPayment = typeof partnerPayments.$inferSelect
export type PartnerCreditMovement = typeof partnerCreditMovements.$inferSelect
export type NewPartnerCreditMovement =
  typeof partnerCreditMovements.$inferInsert

// Products
export type Product = typeof products.$inferSelect
export type NewProduct = typeof products.$inferInsert
export type ProductStatus = typeof products.$inferSelect.status
export type ProductType = typeof products.$inferSelect.type

// Catalog
export type CatalogPackage = typeof catalogPackages.$inferSelect
export type NewCatalogPackage = typeof catalogPackages.$inferInsert
export type CatalogPackageDeparture =
  typeof catalogPackageDepartures.$inferSelect
export type CatalogActivity = typeof catalogActivities.$inferSelect
export type CatalogActivitySession = typeof catalogActivitySessions.$inferSelect
export type CatalogTransferZone = typeof catalogTransferZones.$inferSelect

// Product authorizations (B2B / White Label — Phase 13.1)
export type ProductAuthorization = typeof productAuthorizations.$inferSelect
export type NewProductAuthorization = typeof productAuthorizations.$inferInsert

// Audit Logs
export type AuditLog = typeof auditLogs.$inferSelect
export type NewAuditLog = typeof auditLogs.$inferInsert
export type AuditActionType = typeof auditLogs.$inferSelect.action
export type AuditEntityType = typeof auditLogs.$inferSelect.entityType

// Wallet
export type Wallet = typeof wallets.$inferSelect
export type NewWallet = typeof wallets.$inferInsert
export type WalletTransaction = typeof walletTransactions.$inferSelect
export type NewWalletTransaction = typeof walletTransactions.$inferInsert
export type WalletTxType = (typeof walletTxType.enumValues)[number]
export type WalletTopUpMethod = (typeof walletTopUpMethod.enumValues)[number]
export type WalletTxStatus = (typeof walletTxStatus.enumValues)[number]

/* -------------------------------------------------------------------------- */
/* Yield Engine — @deprecated                                                */
/* lib/yield/ supprimé (YIELD-DEPRECATE-01) : aucun appelant dans le flux   */
/* réel booking/pricing. La table DB yield_rules subsiste pour RLS. Le      */
/* moteur de prix réel est pricingMargins + applyMargin() (lib/pro/pricing). */
/* -------------------------------------------------------------------------- */

export const yieldRuleType = pgEnum("yield_rule_type", [
  "percent", // prix_vente = prix_net × (1 + pct/100)
  "fixed", // prix_vente = prix_net + fixe
  "combined", // prix_vente = prix_net × (1 + pct/100) + fixe
])

export const yieldRules = pgTable(
  "yield_rules",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    agencyId: uuid("agency_id")
      .notNull()
      .references(() => agencies.id, { onDelete: "cascade" }),
    /** Module de réservation ciblé. */
    module: varchar("module", { length: 32 }).notNull(),
    ruleType: yieldRuleType("rule_type").notNull().default("percent"),
    /** Pourcentage de marge (ex: 10.0000 = 10 %). */
    percentValue: decimal("percent_value", { precision: 8, scale: 4 })
      .notNull()
      .default("10.0000"),
    /** Montant fixe TND ajouté en sus (ex: 5.000 DT par offre). */
    fixedValueTnd: decimal("fixed_value_tnd", { precision: 10, scale: 3 })
      .notNull()
      .default("0.000"),
    /** Prix minimum TND en dessous duquel on ne vend pas. */
    minPriceTnd: decimal("min_price_tnd", { precision: 10, scale: 3 })
      .notNull()
      .default("0.000"),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("yield_rules_agency_module_uniq").on(t.agencyId, t.module),
    index("yield_rules_agency_idx").on(t.agencyId),
  ],
)

export type YieldRule = typeof yieldRules.$inferSelect
export type NewYieldRule = typeof yieldRules.$inferInsert

/* -------------------------------------------------------------------------- */
/* Inventory Locks — verrouillage panier Redis-backed (TTL 10 min)           */
/* -------------------------------------------------------------------------- */

export const inventoryLockStatus = pgEnum("inventory_lock_status", [
  "active",
  "confirmed",
  "expired",
  "released",
])

export const inventoryLocks = pgTable(
  "inventory_locks",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    agencyId: uuid("agency_id")
      .notNull()
      .references(() => agencies.id, { onDelete: "cascade" }),
    /**
     * Clé unique côté Redis : `e2b:lock:<agencyId>:<module>:<itemId>:<sessionId>`.
     * `text` (pas varchar(256)) : un itemId réel (token myGo/Hôtels Monde/
     * Vols signé) mesure ~330-410 caractères en pratique — un varchar(256)
     * ferait échouer cet INSERT sur toute offre réelle, jamais détecté avant
     * que `lib/booking/inventory.ts::acquireLock()` n'ait un appelant réel
     * (chantier "Inventory Hold Integration").
     */
    redisKey: text("redis_key").notNull(),
    module: varchar("module", { length: 32 }).notNull(),
    /** Identifiant de l'offre verrouillée (token myGo, UUID package, etc.) — voir redisKey. */
    itemId: text("item_id").notNull(),
    /** Session ou userId qui détient le verrou. */
    sessionId: varchar("session_id", { length: 128 }).notNull(),
    /** Montant TND figé au moment du verrou. */
    priceTnd: decimal("price_tnd", { precision: 12, scale: 3 }),
    status: inventoryLockStatus("status").notNull().default("active"),
    /** Réservation créée à partir de ce verrou (null jusqu'à confirmation). */
    reservationId: uuid("reservation_id"),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("inv_locks_agency_idx").on(t.agencyId),
    // uniqueIndex (pas index) : lib/booking/inventory.ts::acquireLock() fait
    // .onConflictDoUpdate({ target: [inventoryLocks.redisKey] }), qui exige
    // une vraie contrainte unique — un index simple ne satisfait pas
    // ON CONFLICT (reproduit directement : "no unique or exclusion
    // constraint matching the ON CONFLICT specification"). Jamais détecté
    // avant parce qu'aucun appelant réel n'existait avant ce chantier.
    uniqueIndex("inv_locks_redis_key_uniq").on(t.redisKey),
    index("inv_locks_expires_idx").on(t.status, t.expiresAt),
  ],
)

export type InventoryLock = typeof inventoryLocks.$inferSelect
export type NewInventoryLock = typeof inventoryLocks.$inferInsert

/* -------------------------------------------------------------------------- */
/* Payment Events — idempotence des webhooks PSP                              */
/* -------------------------------------------------------------------------- */

/**
 * Enregistre chaque event PSP traité (Stripe / SPS).
 * Garantit qu'un event ne peut être traité qu'une seule fois même si le PSP
 * rejoue la notification (timeout réseau, retry Stripe, etc.).
 *
 * Politique : INSERT ... ON CONFLICT DO NOTHING avant tout dispatch.
 * Si la ligne existe déjà → l'event est un duplicat → retourner 200 sans retraiter.
 */
export const paymentEvents = pgTable(
  "payment_events",
  {
    /** Identifiant unique de l'event côté PSP (ex: evt_stripe_xxx, sps_xxx). */
    eventId: varchar("event_id", { length: 128 }).primaryKey(),
    /** PSP source : 'stripe' | 'sps'. */
    provider: varchar("provider", { length: 16 }).notNull(),
    /** Type d'event PSP (ex: payment_intent.succeeded). */
    eventType: varchar("event_type", { length: 64 }).notNull(),
    /** Réservation concernée si identifiable au moment du traitement. */
    reservationId: uuid("reservation_id"),
    /** Date de première réception et traitement. */
    processedAt: timestamp("processed_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("pmt_events_provider_idx").on(t.provider),
    index("pmt_events_processed_idx").on(t.processedAt),
  ],
)

export type PaymentEvent = typeof paymentEvents.$inferSelect
export type NewPaymentEvent = typeof paymentEvents.$inferInsert

/* -------------------------------------------------------------------------- */
/* Omra Module (Sprint 3A) — imported from schema/omra.ts                     */
/* -------------------------------------------------------------------------- */

export {
  omraPackages,
  omraAllotments,
  omraHotels,
  omraPilgrims,
  omraRoomAllocations,
  omraFlights,
  omraPackageType,
  omraVisaStatus,
  omraGender,
  omraMaritalStatus,
  omraRoomType,
  omraMealPlan,
  omraHotelCategory,
  type OmraPackage,
  type NewOmraPackage,
  type OmraAllotment,
  type NewOmraAllotment,
  type OmraHotel,
  type NewOmraHotel,
  type OmraPilgrim,
  type NewOmraPilgrim,
  type OmraRoomAllocation,
  type NewOmraRoomAllocation,
  type OmraFlight,
  type NewOmraFlight,
  type OmraPackageType,
  type OmraVisaStatus,
  type OmraGender,
  type OmraMaritalStatus,
  type OmraRoomType,
  type OmraMealPlan,
  type OmraHotelCategory,
} from "./schema/omra"

/* -------------------------------------------------------------------------- */
/* Media Module (Mission Media) — imported from schema/media.ts               */
/* -------------------------------------------------------------------------- */

export {
  productMedia,
  type ProductMedia,
  type NewProductMedia,
  type ProductMediaVariants,
} from "./schema/media"

/* -------------------------------------------------------------------------- */
/* Suppliers Module (API XML Integration) — imported from schema/suppliers.ts  */
/* -------------------------------------------------------------------------- */

export {
  suppliers,
  supplierModules,
  supplierLogs,
  supplierType,
  supplierStatus,
  supplierConnectivityLevel,
  supplierCertificationStatus,
  type Supplier,
  type NewSupplier,
  type SupplierModule,
  type NewSupplierModule,
  type SupplierLog,
  type NewSupplierLog,
  type SupplierConnectivityLevel,
  type SupplierCertificationStatus,
} from "./schema/suppliers"

/* -------------------------------------------------------------------------- */
/* Hotel Supplier Control Plane (Phase 27) — imported from schema/hotel-suppliers.ts */
/* -------------------------------------------------------------------------- */

export {
  hotelSuppliers,
  hotelSupplierAccounts,
  hotelSupplierCredentials,
  hotelSupplierAuthorizations,
  hotelSupplierDocStatus,
  hotelSupplierOwnerType,
  hotelSupplierAccountStatus,
  type HotelSupplierRow,
  type NewHotelSupplierRow,
  type HotelSupplierAccountRow,
  type NewHotelSupplierAccountRow,
  type HotelSupplierCredentialRow,
  type NewHotelSupplierCredentialRow,
  type HotelSupplierAuthorizationRow,
  type NewHotelSupplierAuthorizationRow,
} from "./schema/hotel-suppliers"

/* -------------------------------------------------------------------------- */
/* CANONICAL-HOTEL-01 — imported from schema/canonical-hotels.ts              */
/* -------------------------------------------------------------------------- */

export {
  canonicalHotels,
  canonicalHotelSupplierMappings,
  type CanonicalHotelRow,
  type NewCanonicalHotelRow,
  type CanonicalHotelSupplierMappingRow,
  type NewCanonicalHotelSupplierMappingRow,
} from "./schema/canonical-hotels"

/* -------------------------------------------------------------------------- */
/* PUBLIC-VISUAL-01 — imported from schema/public-site.ts                     */
/* CI-FIX (2026-10-05) : import orphelin depuis la fusion de PR #116, jamais  */
/* ré-exporté — cassait lib/admin/public-site-actions.ts et                  */
/* lib/public/site-content.ts (TS2459), typecheck rouge sur main.            */
/* -------------------------------------------------------------------------- */

export {
  publicSiteSettings,
  publicModuleVisuals,
  publicPromotions,
  type PublicSiteSettings,
  type NewPublicSiteSettings,
  type PublicModuleVisual,
  type NewPublicModuleVisual,
  type PublicPromotion,
  type NewPublicPromotion,
} from "./schema/public-site"

/* -------------------------------------------------------------------------- */
/* Validation Module — imported from schema/validation.ts                     */
/* -------------------------------------------------------------------------- */

export {
  reservationValidations,
  validationComments,
  validationHistory,
  validationStatus,
  validationStep,
  type ReservationValidation,
  type NewReservationValidation,
  type ValidationComment,
  type NewValidationComment,
  type ValidationHistory,
  type NewValidationHistory,
} from "./schema/validation"

/* -------------------------------------------------------------------------- */
/* Financials Module V6 — imported from schema/financials.ts                   */
/* -------------------------------------------------------------------------- */

export {
  walletAccounts,
  walletLedger,
  marginRules,
  reservationFinancials,
  fxPolicies,
  journalEntries,
  journalLines,
  reservationStatusHistory,
  commissionSettlements,
  commissionSettlementEntries,
  walletAccountType,
  walletTxType,
  walletTxStatusV6,
  marginType,
  journalEntryStatus,
  reservationTransition,
  type WalletAccount,
  type NewWalletAccount,
  type WalletLedger,
  type NewWalletLedger,
  type MarginRule,
  type NewMarginRule,
  type ReservationFinancial,
  type NewReservationFinancial,
  type JournalEntry,
  type NewJournalEntry,
  type JournalLine,
  type NewJournalLine,
  type ReservationStatusHistory,
  type NewReservationStatusHistory,
  type CommissionSettlement,
  type NewCommissionSettlement,
  type CommissionSettlementEntry,
  type NewCommissionSettlementEntry,
} from "./schema/financials"

/* -------------------------------------------------------------------------- */
/* Products Module V6 — apiLogs + inventoryStatus from schema/products.ts     */
/* productInventory is defined directly above (after the products table).     */
/* -------------------------------------------------------------------------- */

export {
  apiLogs,
  inventoryStatus,
  type ApiLog,
  type NewApiLog,
} from "./schema/products"

/* -------------------------------------------------------------------------- */
/* Audit Module V6 — imported from schema/audit.ts                             */
/* -------------------------------------------------------------------------- */

export { auditAction } from "./schema/audit"

/* -------------------------------------------------------------------------- */
/* Car Rental Module — imported from schema/cars.ts                            */
/* -------------------------------------------------------------------------- */

export {
  carLocations,
  carCategories,
  carFleetVehicles,
  carAvailability,
  carPricingRates,
  reservationCar,
  carTransmissionType,
  carFuelType,
  carFleetStatus,
  carInsuranceLevel,
  type CarLocation,
  type NewCarLocation,
  type CarCategory,
  type NewCarCategory,
  type CarFleetVehicle,
  type NewCarFleetVehicle,
  type CarAvailability,
  type NewCarAvailability,
  type CarPricingRate,
  type NewCarPricingRate,
  type ReservationCar,
  type NewReservationCar,
} from "./schema/cars"

/* -------------------------------------------------------------------------- */
/* Canonical Destination Model — imported from schema/destinations.ts          */
/* -------------------------------------------------------------------------- */

export {
  destinations,
  destinationExternalRefs,
  destinationType,
  type Destination,
  type NewDestination,
  type DestinationExternalRef,
  type NewDestinationExternalRef,
} from "./schema/destinations"

/* -------------------------------------------------------------------------- */
/* Flight Puzzle — imported from schema/flights.ts                            */
/* -------------------------------------------------------------------------- */

export {
  flightTripType,
  flightBookingStatus,
  flightTicketStatus,
  flightSnapshotStatus,
  flightRecheckStatus,
  flightFulfillmentMode,
  flightCommercialRules,
  flightSearches,
  flightPriceSnapshots,
  flightOrders,
  flightBookings,
  flightBookingPassengers,
  flightBookingSegments,
  flightTickets,
  flightSupplierTransactions,
  flightAncillaries,
  type FlightSearch,
  type NewFlightSearch,
  type FlightPriceSnapshot,
  type NewFlightPriceSnapshot,
  type FlightBooking,
  type NewFlightBooking,
  type FlightBookingPassenger,
  type NewFlightBookingPassenger,
  type FlightTicket,
  type FlightSupplierTransaction,
} from "./schema/flights"

/* -------------------------------------------------------------------------- */
/* Flight Supplier Control Plane — imported from schema/flight-suppliers.ts   */
/* -------------------------------------------------------------------------- */

export {
  flightDisplayMode,
  flightBookingMode,
  flightSupplierName,
  flightSupplierConfigs,
  flightSupplierCredentials,
  type FlightSupplierConfig,
  type NewFlightSupplierConfig,
  type FlightSupplierCredential,
  type NewFlightSupplierCredential,
} from "./schema/flight-suppliers"

/* -------------------------------------------------------------------------- */
/* Supplier Portal Foundation (Phase 35) — L0/L1 self-service                 */
/* imported from schema/supplier-portal.ts                                    */
/* -------------------------------------------------------------------------- */

export {
  supplierOnboardingStatus,
  supplierPortalUserRole,
  supplierNodes,
  supplierPortalUsers,
  type SupplierNode,
  type NewSupplierNode,
  type SupplierPortalUser,
  type NewSupplierPortalUser,
  type SupplierOnboardingStatus,
  type SupplierPortalUserRole,
} from "./schema/supplier-portal"

/* -------------------------------------------------------------------------- */
/* Market Signals & Development Projects (R9-01) — anti-fabrication guards    */
/* -------------------------------------------------------------------------- */

export {
  marketSignalConfidence,
  developmentProjectConfidence,
  marketSignals,
  developmentProjects,
  developmentProjectWaitlist,
  type MarketSignal,
  type NewMarketSignal,
  type DevelopmentProject,
  type NewDevelopmentProject,
  type DevelopmentProjectWaitlistEntry,
  type NewDevelopmentProjectWaitlistEntry,
} from "./schema/market"
