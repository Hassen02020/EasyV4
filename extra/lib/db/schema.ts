/**
 * Schéma Drizzle (Postgres / Supabase) — multi-tenant TunisiaGo OTA.
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
  "super_admin", // accès cross-agencies (super-admin TunisiaGo)
  "manager", // owner agence
  "agent_resa", // agent réservation
  "agent_compta", // agent comptabilité
  "agent_excursions", // agent terrain (scan QR activités)
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

export const paymentPsp = pgEnum("payment_psp", ["sps", "manual"])

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
  (t) => [uniqueIndex("agencies_slug_uniq").on(t.slug)],
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
/* Module Configurations & Feature Flags (Étape 4 - Yield & Feature Flags)   */
/* -------------------------------------------------------------------------- */

/**
 * Table module_configs - Configuration globale des modules de réservation
 *
 * Cette table stocke l'état (ON/OFF) et la configuration de chaque module
 * de réservation. Le Super Admin peut activer/désactiver les flux XML
 * et configurer les marges depuis l'interface d'administration.
 *
 * Fonctionnalités :
 *  - Feature Flag ON/OFF par module (is_active)
 *  - Configuration du fournisseur actif (MyGo, Amadeus, Expedia, etc.)
 *  - Configuration de la marge par module (margin_percentage)
 *  - Un seul enregistrement par module (unique sur module_type)
 */
export const moduleConfigs = pgTable(
  "module_configs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** Type de module (hotel, flight, package, etc.) - Unique */
    moduleType: reservationModule("module_type").notNull().unique(),
    /** Feature Flag : module actif ou non (ON/OFF) */
    isActive: boolean("is_active").notNull().default(true),
    /** Nom du fournisseur actif (ex: 'MyGo', 'Amadeus', 'Expedia') */
    providerName: varchar("provider_name", { length: 64 }),
    /** Pourcentage de marge appliqué (ex: 15.00 pour 15%) */
    marginPercentage: decimal("margin_percentage", { precision: 5, scale: 2 })
      .notNull()
      .default("0.00"),
    /** Description ou notes pour l'admin */
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("module_configs_type_idx").on(t.moduleType)],
)

/* -------------------------------------------------------------------------- */
/* Wallet B2B & Financial Ledger (Étape 3 - Infrastructure Financière)       */
/* -------------------------------------------------------------------------- */

/**
 * Table agency_wallets - Portefeuille financier des agences partenaires B2B
 *
 * Chaque agence partenaire dispose d'un wallet unique pour gérer son solde
 * disponible et ses fonds bloqués. Le solde est utilisé pour acheter des
 * services (hôtels, vols, etc.) et est rechargé par virement bancaire.
 *
 * Contraintes de sécurité :
 *  - balance >= 0 (pas de solde négatif autorisé)
 *  - frozen_balance >= 0
 *  - Un seul wallet par agence (unique sur agency_id)
 */
export const agencyWallets = pgTable(
  "agency_wallets",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    agencyId: uuid("agency_id")
      .notNull()
      .unique()
      .references(() => agencies.id, { onDelete: "restrict" }),
    /** Solde disponible pour acheter des services. */
    balance: decimal("balance", { precision: 10, scale: 3 })
      .notNull()
      .default("0.000"),
    /** Fonds bloqués pour les réservations en cours de validation. */
    frozenBalance: decimal("frozen_balance", { precision: 10, scale: 3 })
      .notNull()
      .default("0.000"),
    currency: varchar("currency", { length: 3 }).notNull().default("TND"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("agency_wallets_agency_idx").on(t.agencyId),
    // Contrainte de sécurité : balance >= 0
    sql`CONSTRAINT balance_non_negative CHECK (balance >= 0)`,
    // Contrainte de sécurité : frozen_balance >= 0
    sql`CONSTRAINT frozen_balance_non_negative CHECK (frozen_balance >= 0)`,
  ],
)

/**
 * Enum pour les types de transactions du ledger
 */
export const walletTransactionType = pgEnum("wallet_transaction_type", [
  "credit", // Recharge (virement bancaire, remboursement)
  "debit", // Achat (hôtel, vol, package, etc.)
])

/**
 * Table wallet_ledger - Registre comptable immuable des mouvements financiers
 *
 * Chaque mouvement de fonds (crédit ou débit) est enregistré de manière
 * immuable dans ce ledger. Aucun mouvement ne peut être modifié ou supprimé
 * après sa création (pas de champ updated_at).
 *
 * Les corrections se font par des mouvements inverses (ex: remboursement).
 *
 * Exemples de transactions :
 *  - credit: "Recharge Virement Banque STB - Ref: VIR-2026-001"
 *  - debit: "Achat Hôtel Marriott Tunis - Résa: TG-2026-000123"
 */
export const walletLedger = pgTable(
  "wallet_ledger",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    walletId: uuid("wallet_id")
      .notNull()
      .references(() => agencyWallets.id, { onDelete: "cascade" }),
    /** Référence optionnelle à une réservation (pour les débits liés à un achat). */
    reservationId: uuid("reservation_id").references(() => reservations.id, {
      onDelete: "set null",
    }),
    transactionType: walletTransactionType("transaction_type").notNull(),
    amount: decimal("amount", { precision: 10, scale: 3 }).notNull(),
    description: varchar("description", { length: 255 }).notNull(),
    /** Timestamp immuable de création (pas de updated_at). */
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("wallet_ledger_wallet_idx").on(t.walletId),
    index("wallet_ledger_reservation_idx").on(t.reservationId),
    index("wallet_ledger_created_idx").on(t.createdAt),
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
export type AgencyWallet = typeof agencyWallets.$inferSelect
export type NewAgencyWallet = typeof agencyWallets.$inferInsert
export type WalletLedgerEntry = typeof walletLedger.$inferSelect
export type NewWalletLedgerEntry = typeof walletLedger.$inferInsert
export type ModuleConfig = typeof moduleConfigs.$inferSelect
export type NewModuleConfig = typeof moduleConfigs.$inferInsert
