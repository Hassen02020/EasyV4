/**
 * Schéma Drizzle — Flight Puzzle Easy2Book
 *
 * Tables :
 *   - flight_searches            : chaque requête de recherche
 *   - flight_price_snapshots     : offre présentée au client (immuable)
 *   - flight_bookings            : demande de billet (PENDING → CONFIRMED)
 *   - flight_booking_passengers  : détail voyageurs
 *   - flight_booking_segments    : tronçons du voyage (audit)
 *   - flight_tickets             : e-tickets émis
 *   - flight_supplier_transactions : log toutes transactions GDS
 *
 * Décisions d'architecture :
 *   - flight_bookings.reservation_id → reservations (module="flight") :
 *     bridge vers le Booking Core partagé. CRM / Finance / Customer 360 /
 *     Admin historique lisent `reservations`; le Flight Puzzle lit
 *     `flight_bookings` pour la machine d'état granulaire (8 statuts GDS).
 *     Pattern identique à reservation_hotel pour les hôtels.
 *   - Le prix fournisseur ne remonte jamais au frontend : seul le snapshotId
 *     transite dans l'URL/session.
 *   - La colonne `itinerary` (jsonb) contient un CanonicalItinerary complet —
 *     pas de dépendance à un schéma provider spécifique.
 */

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
  uuid,
  varchar,
} from "drizzle-orm/pg-core"
import { agencies, reservations } from "../schema"

// ---------------------------------------------------------------------------
// Enums
// ---------------------------------------------------------------------------

export const flightTripType = pgEnum("flight_trip_type", [
  "ONE_WAY",
  "ROUND_TRIP",
  "MULTI_CITY",
])

export const flightBookingStatus = pgEnum("flight_booking_status", [
  "PENDING",
  "PRICE_RECHECK",
  "PRICE_CHANGED",
  "APPROVED",
  "BOOKING_IN_PROGRESS",
  "BOOKED",
  "TICKETING_IN_PROGRESS",
  "CONFIRMED",
  "FAILED",
  "CANCELLED",
])

export const flightTicketStatus = pgEnum("flight_ticket_status", [
  "NOT_ISSUED",
  "ISSUING",
  "ISSUED",
  "FAILED",
  "VOIDED",
  "REFUNDED",
])

export const flightSnapshotStatus = pgEnum("flight_snapshot_status", [
  "ACTIVE",
  "USED",
  "EXPIRED",
  "INVALIDATED",
])

export const flightRecheckStatus = pgEnum("flight_recheck_status", [
  "AVAILABLE",
  "PRICE_CHANGED",
  "UNAVAILABLE",
  "EXPIRED",
  "ERROR",
])

// ---------------------------------------------------------------------------
// Tables
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// G6 — Commercial Rules (per-agency, per-channel DB-backed pricing rules)
// ---------------------------------------------------------------------------

/**
 * product_scope shape:
 *   { cabin?: string, provider?: string, origin?: string, destination?: string, airline?: string }
 * NULL in any scope field means "matches all values for that dimension".
 * NULL agency_id  = applies to ALL partners.
 * NULL channel    = applies to ALL channels.
 * Higher priority integer wins when multiple rules match.
 */
export const flightCommercialRules = pgTable(
  "flight_commercial_rules",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    // NULL = applies to all agencies (global rule)
    agencyId: uuid("agency_id").references(() => agencies.id, { onDelete: "cascade" }),
    // NULL = applies to all channels
    channel: varchar("channel", { length: 16 }),
    priority: integer("priority").notNull().default(50),
    // JSONB product scope: { cabin?, provider?, origin?, destination?, airline? }
    productScope: jsonb("product_scope"),
    fixedFee: decimal("fixed_fee", { precision: 12, scale: 3 }).notNull().default("0"),
    markupRate: decimal("markup_rate", { precision: 8, scale: 5 }).notNull().default("0"),
    // Optional floor/ceiling on computed markup amount
    minMarkup: decimal("min_markup", { precision: 12, scale: 3 }),
    maxMarkup: decimal("max_markup", { precision: 12, scale: 3 }),
    currency: varchar("currency", { length: 3 }).notNull().default("TND"),
    isActive: boolean("is_active").notNull().default(true),
    validFrom: timestamp("valid_from", { withTimezone: true }),
    validTo: timestamp("valid_to", { withTimezone: true }),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("flight_commercial_rules_priority_idx").on(t.priority),
    index("flight_commercial_rules_agency_channel_idx").on(t.agencyId, t.channel),
    index("flight_commercial_rules_active_idx").on(t.isActive),
  ],
)

export const flightSearches = pgTable(
  "flight_searches",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    agencyId: uuid("agency_id")
      .notNull()
      .references(() => agencies.id, { onDelete: "restrict" }),
    tripType: flightTripType("trip_type").notNull(),
    origin: varchar("origin", { length: 8 }).notNull(),
    destination: varchar("destination", { length: 8 }).notNull(),
    departureDate: date("departure_date").notNull(),
    returnDate: date("return_date"),
    segments: jsonb("segments"),
    adults: integer("adults").notNull().default(1),
    children: integer("children").notNull().default(0),
    infants: integer("infants").notNull().default(0),
    cabin: varchar("cabin", { length: 16 }).notNull().default("ECONOMY"),
    currency: varchar("currency", { length: 3 }).notNull().default("TND"),
    provider: varchar("provider", { length: 32 }),
    searchId: varchar("search_id", { length: 64 }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("flight_searches_agency_idx").on(t.agencyId),
    index("flight_searches_created_idx").on(t.createdAt),
  ],
)

export const flightPriceSnapshots = pgTable(
  "flight_price_snapshots",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    searchId: uuid("search_id").references(() => flightSearches.id, { onDelete: "set null" }),
    agencyId: uuid("agency_id")
      .notNull()
      .references(() => agencies.id, { onDelete: "restrict" }),
    provider: varchar("provider", { length: 32 }).notNull(),
    providerOfferId: varchar("provider_offer_id", { length: 128 }).notNull(),
    itinerary: jsonb("itinerary").notNull(),
    supplierAmount: decimal("supplier_amount", { precision: 12, scale: 3 }).notNull(),
    supplierCurrency: varchar("supplier_currency", { length: 3 }).notNull().default("TND"),
    fee: decimal("fee", { precision: 12, scale: 3 }).notNull().default("0"),
    markup: decimal("markup", { precision: 12, scale: 3 }).notNull().default("0"),
    sellingAmount: decimal("selling_amount", { precision: 12, scale: 3 }).notNull(),
    sellingCurrency: varchar("selling_currency", { length: 3 }).notNull().default("TND"),
    baggage: jsonb("baggage"),
    fareRules: jsonb("fare_rules"),
    status: flightSnapshotStatus("status").notNull().default("ACTIVE"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  },
  (t) => [
    index("flight_snapshots_agency_idx").on(t.agencyId),
    index("flight_snapshots_status_idx").on(t.status),
    index("flight_snapshots_expires_idx").on(t.expiresAt),
  ],
)

// ---------------------------------------------------------------------------
// G5 — Flight Order (groups one or more PNRs for a single customer trip)
// ---------------------------------------------------------------------------

export const flightOrders = pgTable(
  "flight_orders",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    agencyId: uuid("agency_id")
      .notNull()
      .references(() => agencies.id, { onDelete: "restrict" }),
    reservationId: uuid("reservation_id").references(() => reservations.id, { onDelete: "set null" }),
    customerId: uuid("customer_id"),
    tripType: flightTripType("trip_type").notNull(),
    status: varchar("status", { length: 32 }).notNull().default("PENDING"),
    /** NDC/GDS order ID when the provider supports Order Management. */
    providerOrderId: varchar("provider_order_id", { length: 128 }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("flight_orders_agency_idx").on(t.agencyId),
    index("flight_orders_reservation_idx").on(t.reservationId),
    index("flight_orders_status_idx").on(t.status),
  ],
)

export const flightBookings = pgTable(
  "flight_bookings",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    agencyId: uuid("agency_id")
      .notNull()
      .references(() => agencies.id, { onDelete: "restrict" }),
    priceSnapshotId: uuid("price_snapshot_id").references(
      () => flightPriceSnapshots.id,
      { onDelete: "restrict" },
    ),
    /** Bridge to shared Booking Core — visible in CRM, Finance, Customer 360. */
    reservationId: uuid("reservation_id").references(() => reservations.id, {
      onDelete: "set null",
    }),
    customerId: uuid("customer_id"),
    /** Links this booking to a FlightOrder when multi-PNR grouping is used. */
    orderId: uuid("order_id").references(() => flightOrders.id, { onDelete: "set null" }),
    tripType: flightTripType("trip_type").notNull(),
    itinerary: jsonb("itinerary").notNull(),
    contact: jsonb("contact").notNull(),
    status: flightBookingStatus("status").notNull().default("PENDING"),
    provider: varchar("provider", { length: 32 }),
    supplierBookingRef: varchar("supplier_booking_ref", { length: 64 }),
    pnr: varchar("pnr", { length: 16 }),
    lastRecheckStatus: flightRecheckStatus("last_recheck_status"),
    lastRecheckAt: timestamp("last_recheck_at", { withTimezone: true }),
    opsNotes: text("ops_notes"),
    slaDeadline: timestamp("sla_deadline", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("flight_bookings_agency_idx").on(t.agencyId),
    index("flight_bookings_status_idx").on(t.status),
    index("flight_bookings_snapshot_idx").on(t.priceSnapshotId),
    index("flight_bookings_reservation_idx").on(t.reservationId),
    index("flight_bookings_created_idx").on(t.createdAt),
  ],
)

export const flightBookingPassengers = pgTable(
  "flight_booking_passengers",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    bookingId: uuid("booking_id")
      .notNull()
      .references(() => flightBookings.id, { onDelete: "cascade" }),
    passengerType: varchar("passenger_type", { length: 3 }).notNull().default("ADT"),
    firstName: varchar("first_name", { length: 100 }).notNull(),
    lastName: varchar("last_name", { length: 100 }).notNull(),
    birthDate: date("birth_date"),
    nationality: varchar("nationality", { length: 2 }),
    passportNumber: varchar("passport_number", { length: 32 }),
    passportExpiry: date("passport_expiry"),
    sequence: integer("sequence").notNull().default(1),
  },
  (t) => [index("flight_pax_booking_idx").on(t.bookingId)],
)

export const flightBookingSegments = pgTable(
  "flight_booking_segments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    bookingId: uuid("booking_id")
      .notNull()
      .references(() => flightBookings.id, { onDelete: "cascade" }),
    sequence: integer("sequence").notNull(),
    origin: varchar("origin", { length: 8 }).notNull(),
    destination: varchar("destination", { length: 8 }).notNull(),
    departure: timestamp("departure", { withTimezone: true }).notNull(),
    arrival: timestamp("arrival", { withTimezone: true }).notNull(),
    airline: varchar("airline", { length: 4 }).notNull(),
    flightNumber: varchar("flight_number", { length: 16 }).notNull(),
    durationMin: integer("duration_min"),
    stops: integer("stops").notNull().default(0),
    equipment: varchar("equipment", { length: 16 }),
    cabin: varchar("cabin", { length: 16 }).notNull().default("ECONOMY"),
    pnr: varchar("pnr", { length: 16 }),
  },
  (t) => [index("flight_seg_booking_idx").on(t.bookingId)],
)

export const flightTickets = pgTable(
  "flight_tickets",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    bookingId: uuid("booking_id")
      .notNull()
      .references(() => flightBookings.id, { onDelete: "cascade" }),
    passengerId: uuid("passenger_id").references(() => flightBookingPassengers.id, {
      onDelete: "set null",
    }),
    ticketNumber: varchar("ticket_number", { length: 32 }),
    status: flightTicketStatus("status").notNull().default("NOT_ISSUED"),
    /**
     * G9 — Per-coupon GDS status tracking.
     * Stored as JSONB array: [{segment, couponStatus: "OPEN"|"USED"|"EXCH"|"RFND"}]
     */
    couponStatus: jsonb("coupon_status"),
    issuedAt: timestamp("issued_at", { withTimezone: true }),
    voidedAt: timestamp("voided_at", { withTimezone: true }),
    eticketUrl: text("eticket_url"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("flight_tickets_booking_idx").on(t.bookingId)],
)

export const flightSupplierTransactions = pgTable(
  "flight_supplier_transactions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    bookingId: uuid("booking_id").references(() => flightBookings.id, { onDelete: "set null" }),
    snapshotId: uuid("snapshot_id").references(() => flightPriceSnapshots.id, {
      onDelete: "set null",
    }),
    provider: varchar("provider", { length: 32 }).notNull(),
    transactionType: varchar("transaction_type", { length: 32 }).notNull(),
    status: varchar("status", { length: 16 }).notNull(),
    request: jsonb("request"),
    response: jsonb("response"),
    durationMs: integer("duration_ms"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("flight_tx_booking_idx").on(t.bookingId),
    index("flight_tx_provider_idx").on(t.provider),
  ],
)

// ---------------------------------------------------------------------------
// G7 — Flight Ancillaries (upsell services: baggage, seat, meal, lounge…)
// ---------------------------------------------------------------------------

export const flightAncillaries = pgTable(
  "flight_ancillaries",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    bookingId: uuid("booking_id")
      .notNull()
      .references(() => flightBookings.id, { onDelete: "cascade" }),
    ancillaryType: varchar("ancillary_type", { length: 16 }).notNull(),
    description: text("description"),
    amount: decimal("amount", { precision: 12, scale: 3 }).notNull(),
    currency: varchar("currency", { length: 3 }).notNull().default("TND"),
    /** Sequence numbers of segments this ancillary applies to (null = all segments). */
    segmentRefs: jsonb("segment_refs"),
    /** Sequence number of the passenger this ancillary is for (null = all passengers). */
    passengerRef: integer("passenger_ref"),
    status: varchar("status", { length: 16 }).notNull().default("PENDING"),
    providerAncillaryId: varchar("provider_ancillary_id", { length: 64 }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("flight_ancillaries_booking_idx").on(t.bookingId),
    index("flight_ancillaries_type_idx").on(t.ancillaryType),
  ],
)

// ---------------------------------------------------------------------------
// Inferred types
// ---------------------------------------------------------------------------

export type FlightCommercialRule = typeof flightCommercialRules.$inferSelect
export type NewFlightCommercialRule = typeof flightCommercialRules.$inferInsert
export type FlightOrder = typeof flightOrders.$inferSelect
export type NewFlightOrder = typeof flightOrders.$inferInsert
export type FlightSearch = typeof flightSearches.$inferSelect
export type NewFlightSearch = typeof flightSearches.$inferInsert
export type FlightPriceSnapshot = typeof flightPriceSnapshots.$inferSelect
export type NewFlightPriceSnapshot = typeof flightPriceSnapshots.$inferInsert
export type FlightBooking = typeof flightBookings.$inferSelect
export type NewFlightBooking = typeof flightBookings.$inferInsert
export type FlightBookingPassenger = typeof flightBookingPassengers.$inferSelect
export type NewFlightBookingPassenger = typeof flightBookingPassengers.$inferInsert
export type FlightTicket = typeof flightTickets.$inferSelect
export type FlightAncillary = typeof flightAncillaries.$inferSelect
export type NewFlightAncillary = typeof flightAncillaries.$inferInsert
export type FlightSupplierTransaction = typeof flightSupplierTransactions.$inferSelect
