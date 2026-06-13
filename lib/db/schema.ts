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
  boolean,
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
])

export const agencyType = pgEnum("agency_type", [
  "ota", // OTA Easy2Book elle-même (ou agences en marque blanche)
  "partner", // agence partenaire B2B avec compte de dépôt
])

export const marginType = pgEnum("margin_type", ["percent", "fixed"])

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
])

export const reservationSource = pgEnum("reservation_source", [
  "mygo",
  "internal",
  "amadeus",
  "sabre",
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
  },
  (t) => [
    index("users_agency_idx").on(t.agencyId),
    uniqueIndex("users_email_uniq").on(t.email),
  ],
)

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
  },
  (t) => [
    uniqueIndex("reservations_public_ref_uniq").on(t.agencyId, t.publicRef),
    index("reservations_agency_idx").on(t.agencyId),
    index("reservations_module_idx").on(t.agencyId, t.module),
    index("reservations_customer_idx").on(t.customerId),
    index("reservations_status_idx").on(t.agencyId, t.status),
    index("reservations_created_idx").on(t.agencyId, t.createdAt),
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
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("pricing_margins_agency_idx").on(t.agencyId),
    uniqueIndex("pricing_margins_agency_module_uniq").on(t.agencyId, t.module),
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
    uniqueIndex("partner_invoices_number_uniq").on(t.invoiceNumber),
    index("partner_invoices_agency_idx").on(t.agencyId),
    index("partner_invoices_status_idx").on(t.agencyId, t.status),
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
    /** Référence externe (n° réservation, n° facture, etc.). */
    reference: varchar("reference", { length: 64 }),
    /** Lien optionnel à une réservation. */
    reservationId: uuid("reservation_id"),
    /** Lien optionnel à une facture. */
    invoiceId: uuid("invoice_id"),
    description: text("description"),
    createdByUserId: uuid("created_by_user_id"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("partner_credit_agency_idx").on(t.agencyId),
    index("partner_credit_created_idx").on(t.agencyId, t.createdAt),
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

export const walletTxType = pgEnum("wallet_tx_type", [
  "CREDIT",      // rechargement validé
  "DEBIT",       // débit réservation
  "REFUND",      // remboursement vers wallet
  "ADJUSTMENT",  // ajustement manuel admin
])

export const walletTopUpMethod = pgEnum("wallet_topup_method", [
  "VIREMENT",    // Virement bancaire (STB, BNA, Attijari, BH…)
  "MANDAT",      // Mandat postal / WafaCash / PosteNet
  "ZITOUNA_PAY", // Rechargement instantané via Zitouna Pay gateway
  "CASH",        // Espèces remises en agence
])

export const walletTxStatus = pgEnum("wallet_tx_status", [
  "PENDING",    // déclarée par l'agence, en attente de validation admin
  "VALIDATED",  // validée → balance incrémentée
  "REJECTED",   // rejetée (reçu incorrect, montant erroné…)
])

/**
 * Un wallet par agence. La colonne `balance` est modifiée uniquement
 * via des transactions SQL atomiques (voir lib/wallet/actions.ts).
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
    amount: decimal("amount", { precision: 14, scale: 3 }).notNull(),
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
export type Reservation = typeof reservations.$inferSelect
export type NewReservation = typeof reservations.$inferInsert
export type Payment = typeof payments.$inferSelect
export type NewPayment = typeof payments.$inferInsert
export type PricingMargin = typeof pricingMargins.$inferSelect
export type NewPricingMargin = typeof pricingMargins.$inferInsert
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
export type CatalogPackageDeparture = typeof catalogPackageDepartures.$inferSelect
export type CatalogActivity = typeof catalogActivities.$inferSelect
export type CatalogTransferZone = typeof catalogTransferZones.$inferSelect

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
/* Yield Engine — règles de marge par module et par agence                   */
/* -------------------------------------------------------------------------- */

export const yieldRuleType = pgEnum("yield_rule_type", [
  "percent",   // prix_vente = prix_net × (1 + pct/100)
  "fixed",     // prix_vente = prix_net + fixe
  "combined",  // prix_vente = prix_net × (1 + pct/100) + fixe
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
    /** Clé unique côté Redis : `e2b:lock:<module>:<itemId>:<sessionId>`. */
    redisKey: varchar("redis_key", { length: 256 }).notNull(),
    module: varchar("module", { length: 32 }).notNull(),
    /** Identifiant de l'offre verrouillée (token myGo, UUID package, etc.). */
    itemId: varchar("item_id", { length: 256 }).notNull(),
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
    index("inv_locks_redis_key_idx").on(t.redisKey),
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
/* Suppliers Module (API XML Integration) — imported from schema/suppliers.ts  */
/* -------------------------------------------------------------------------- */

export {
  suppliers,
  supplierModules,
  supplierLogs,
  supplierType,
  supplierStatus,
  type Supplier,
  type NewSupplier,
  type SupplierModule,
  type NewSupplierModule,
  type SupplierLog,
  type NewSupplierLog,
} from "./schema/suppliers"

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
} from "./validation"

/* -------------------------------------------------------------------------- */
/* Financials Module V6 — imported from schema/financials.ts                   */
/* -------------------------------------------------------------------------- */

export {
  walletAccounts,
  walletLedger,
  marginRules,
  reservationFinancials,
  journalEntries,
  journalLines,
  reservationStatusHistory,
  walletAccountType,
  walletTxTypeV6,
  walletTxStatusV6,
  marginTypeV6,
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
} from "./schema/financials"

/* -------------------------------------------------------------------------- */
/* Products Module V6 — imported from schema/products.ts                       */
/* -------------------------------------------------------------------------- */

export {
  productInventory,
  apiLogs,
  inventoryStatus,
  type ProductInventory,
  type NewProductInventory,
  type ApiLog,
  type NewApiLog,
} from "./schema/products"

/* -------------------------------------------------------------------------- */
/* Audit Module V6 — imported from schema/audit.ts                             */
/* -------------------------------------------------------------------------- */

export {
  auditAction,
} from "./schema/audit"
