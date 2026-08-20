/**
 * Schéma Drizzle — Module Location de Voitures (Car Rental)
 *
 * Tables :
 *   - car_locations         : agences/comptoirs de prise en charge et retour
 *   - car_categories        : catégories de véhicules (Économique, SUV, Luxe…)
 *   - car_fleet_vehicles    : parc réel (immatriculation, statut opérationnel)
 *   - car_availability      : stock par catégorie × lieu × date
 *   - car_pricing_rates     : tarif jour par catégorie, avec plages de validité
 *                             (la variation saisonnière = plusieurs lignes avec
 *                             des validFrom/validTo différents — même pattern
 *                             que catalog_transfer_pricing)
 *   - reservation_car       : extension 1-1 de `reservations` (module='car')
 *
 * Décisions d'architecture (à valider avec l'équipe) :
 *   1. Pas de table de marge dédiée. Le moteur de marge B2B existe déjà et
 *      est générique (`pricing_margins`, agencyId × module × marginType).
 *      Il suffit d'ajouter 'car' à l'enum `reservation_module` pour que les
 *      agences puissent configurer un markup/markdown sur ce module comme
 *      elles le font déjà pour hotel/flight/transfer/omra — dupliquer cette
 *      logique dans une table car_pricing_margins aurait recréé un moteur
 *      parallèle à maintenir.
 *   2. Pas de table `car_bookings` autonome. Le système existant modélise
 *      chaque réservation via la table polymorphique `reservations`
 *      (référence publique, statut, montants, wallet) + une extension 1-1
 *      par module (reservation_hotel, reservation_transfer, reservation_omra…).
 *      `reservation_car` suit exactement ce pattern : c'est ce qui donne accès
 *      gratuitement au débit wallet existant (debitPartnerCredit),
 *      aux paiements (`payments`), à l'audit (`audit_events`) et à l'historique
 *      de statuts (`reservation_status_history`, déjà générique — utilisé par
 *      transfer et omra, pas besoin d'un car_status_history séparé).
 *   3. `agency_id` est présent sur toutes les tables catalogue (comme
 *      catalog_transfer_zones/catalog_vehicles) pour l'isolation RLS à venir
 *      (cf. drizzle/manual/0001_rls_policies.sql et 0005/0006/0010 pour le
 *      pattern à répliquer ici : policy `agency_id = current_agency_id()`
 *      directe sur les tables qui l'ont, policy EXISTS-subquery via
 *      reservation_car -> reservations pour tout ce qui en découle).
 */

import {
  pgTable,
  uuid,
  varchar,
  integer,
  decimal,
  date,
  timestamp,
  boolean,
  text,
  jsonb,
  index,
  uniqueIndex,
  pgEnum,
} from "drizzle-orm/pg-core"
import { agencies, reservations } from "../schema"

/* -------------------------------------------------------------------------- */
/* Enums                                                                      */
/* -------------------------------------------------------------------------- */

export const carTransmissionType = pgEnum("car_transmission_type", [
  "manual",
  "automatic",
])

export const carFuelType = pgEnum("car_fuel_type", [
  "petrol",
  "diesel",
  "hybrid",
  "electric",
])

/** Statut opérationnel d'une unité de flotte (pas le statut de la réservation). */
export const carFleetStatus = pgEnum("car_fleet_status", [
  "available",
  "rented",
  "maintenance",
  "inactive",
])

export const carInsuranceLevel = pgEnum("car_insurance_level", [
  "basic", // Responsabilité civile minimale légale
  "standard", // + dommages collision (franchise réduite)
  "premium", // + vol, bris de glace, assistance 24/7
  "full", // Franchise zéro
])

/* -------------------------------------------------------------------------- */
/* Car Locations (comptoirs de prise en charge / retour)                      */
/* -------------------------------------------------------------------------- */

export const carLocations = pgTable(
  "car_locations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    agencyId: uuid("agency_id")
      .notNull()
      .references(() => agencies.id, { onDelete: "restrict" }),
    name: varchar("name", { length: 200 }).notNull(),
    /** 'airport' / 'city' / 'hotel' / 'train_station'. */
    locationType: varchar("location_type", { length: 16 })
      .notNull()
      .default("city"),
    address: text("address"),
    city: varchar("city", { length: 100 }).notNull(),
    /** Code IATA si prise en charge aéroport (ex. TUN, NBE, DJE). */
    airportCode: varchar("airport_code", { length: 3 }),
    latitude: decimal("latitude", { precision: 9, scale: 6 }),
    longitude: decimal("longitude", { precision: 9, scale: 6 }),
    /** Horaires par jour de semaine, ex. { mon: "08:00-20:00", ... }. */
    openingHours: jsonb("opening_hours"),
    /** Frais fixe si restitution dans un lieu différent (aller simple). */
    oneWayFeeTnd: decimal("one_way_fee_tnd", { precision: 10, scale: 3 }),
    status: varchar("status", { length: 16 }).notNull().default("active"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("car_locations_agency_idx").on(t.agencyId),
    index("car_locations_city_idx").on(t.city),
  ],
)

/* -------------------------------------------------------------------------- */
/* Car Categories (catégories × caractéristiques)                             */
/* -------------------------------------------------------------------------- */

export const carCategories = pgTable(
  "car_categories",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    agencyId: uuid("agency_id")
      .notNull()
      .references(() => agencies.id, { onDelete: "restrict" }),
    /** Code interne agence (ex. "ECO", "SUV", "LUX"). */
    code: varchar("code", { length: 32 }).notNull(),
    name: varchar("name", { length: 100 }).notNull(),
    description: text("description"),
    /** Modèles représentatifs affichés au client (ex. ["Clio 5", "208"]). */
    exampleModels: text("example_models").array(),
    seats: integer("seats").notNull().default(5),
    doors: integer("doors").notNull().default(4),
    luggageCapacity: integer("luggage_capacity").notNull().default(2),
    transmission: carTransmissionType("transmission").notNull().default("manual"),
    fuelType: carFuelType("fuel_type").notNull().default("petrol"),
    airConditioning: boolean("air_conditioning").notNull().default(true),
    /** Âge minimum du conducteur principal pour cette catégorie. */
    minDriverAge: integer("min_driver_age").notNull().default(21),
    /** Ancienneté de permis minimale en années. */
    minLicenseYears: integer("min_license_years").notNull().default(1),
    imageUrls: text("image_urls").array(),
    status: varchar("status", { length: 16 }).notNull().default("active"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("car_categories_agency_code_uniq").on(t.agencyId, t.code),
    index("car_categories_agency_idx").on(t.agencyId),
    index("car_categories_status_idx").on(t.status),
  ],
)

/* -------------------------------------------------------------------------- */
/* Car Fleet Vehicles (parc réel, suivi par immatriculation)                  */
/* -------------------------------------------------------------------------- */

export const carFleetVehicles = pgTable(
  "car_fleet_vehicles",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    agencyId: uuid("agency_id")
      .notNull()
      .references(() => agencies.id, { onDelete: "restrict" }),
    categoryId: uuid("category_id")
      .notNull()
      .references(() => carCategories.id, { onDelete: "restrict" }),
    /** Lieu où le véhicule se trouve actuellement (change à chaque restitution). */
    currentLocationId: uuid("current_location_id").references(
      () => carLocations.id,
      { onDelete: "set null" },
    ),
    plate: varchar("plate", { length: 32 }).notNull(),
    brand: varchar("brand", { length: 64 }).notNull(),
    model: varchar("model", { length: 64 }).notNull(),
    year: integer("year"),
    color: varchar("color", { length: 32 }),
    /** Kilométrage au dernier relevé (pour planifier l'entretien). */
    odometerKm: integer("odometer_km"),
    status: carFleetStatus("status").notNull().default("available"),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("car_fleet_agency_plate_uniq").on(t.agencyId, t.plate),
    index("car_fleet_agency_idx").on(t.agencyId),
    index("car_fleet_category_idx").on(t.categoryId),
    index("car_fleet_status_idx").on(t.status),
  ],
)

/* -------------------------------------------------------------------------- */
/* Car Availability (stock par catégorie × lieu × date)                       */
/* -------------------------------------------------------------------------- */

/**
 * Même principe que `catalog_activity_sessions` / `product_inventory` :
 * un pool de disponibilité par jour, pas un verrou par véhicule individuel.
 * `totalUnits` peut être renseigné manuellement (objectif commercial) ou
 * dérivé du compte de `car_fleet_vehicles` actifs sur ce lieu — au choix de
 * l'agence, cette table ne force pas l'un ou l'autre.
 */
export const carAvailability = pgTable(
  "car_availability",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    agencyId: uuid("agency_id")
      .notNull()
      .references(() => agencies.id, { onDelete: "restrict" }),
    categoryId: uuid("category_id")
      .notNull()
      .references(() => carCategories.id, { onDelete: "cascade" }),
    locationId: uuid("location_id")
      .notNull()
      .references(() => carLocations.id, { onDelete: "cascade" }),
    date: date("date").notNull(),
    totalUnits: integer("total_units").notNull(),
    bookedUnits: integer("booked_units").notNull().default(0),
    status: varchar("status", { length: 16 }).notNull().default("open"),
  },
  (t) => [
    uniqueIndex("car_avail_category_location_date_uniq").on(
      t.categoryId,
      t.locationId,
      t.date,
    ),
    index("car_avail_agency_idx").on(t.agencyId),
    index("car_avail_date_idx").on(t.date),
  ],
)

/* -------------------------------------------------------------------------- */
/* Car Pricing Rates (tarif jour + variation saisonnière)                     */
/* -------------------------------------------------------------------------- */

/**
 * La variation saisonnière n'est pas un type de ligne à part : c'est
 * simplement plusieurs lignes pour la même catégorie avec des plages
 * `validFrom`/`validTo` différentes (identique à `catalog_transfer_pricing`
 * et `catalog_package_departures`). Ex. : une ligne "haute saison juillet-août"
 * à 120 DT/jour et une ligne "basse saison" le reste de l'année à 80 DT/jour.
 *
 * Les marges B2B (markup/markdown par agence) passent par `pricing_margins`
 * (module='car') — pas de colonne de marge ici, cf. note d'architecture en
 * tête de fichier.
 */
export const carPricingRates = pgTable(
  "car_pricing_rates",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    agencyId: uuid("agency_id")
      .notNull()
      .references(() => agencies.id, { onDelete: "restrict" }),
    categoryId: uuid("category_id")
      .notNull()
      .references(() => carCategories.id, { onDelete: "cascade" }),
    /** NULL = tarif valable pour tous les lieux de cette agence. */
    locationId: uuid("location_id").references(() => carLocations.id, {
      onDelete: "cascade",
    }),
    dailyRateTnd: decimal("daily_rate_tnd", { precision: 10, scale: 3 }).notNull(),
    /** Optionnel : tarif dégressif si location >= 7 jours. */
    weeklyRateTnd: decimal("weekly_rate_tnd", { precision: 10, scale: 3 }),
    minRentalDays: integer("min_rental_days").notNull().default(1),
    extraDriverFeeTnd: decimal("extra_driver_fee_tnd", {
      precision: 10,
      scale: 3,
    }).default("0"),
    /** Franchise (dépôt de garantie) exigée pour cette catégorie. */
    depositTnd: decimal("deposit_tnd", { precision: 10, scale: 3 }).default("0"),
    /** Tarif journalier additionnel par niveau d'assurance optionnelle. */
    insuranceDailyFeeTnd: jsonb("insurance_daily_fee_tnd").$type<
      Partial<Record<"basic" | "standard" | "premium" | "full", number>>
    >(),
    validFrom: date("valid_from"),
    validTo: date("valid_to"),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("car_rates_agency_idx").on(t.agencyId),
    index("car_rates_category_idx").on(t.categoryId, t.validFrom, t.validTo),
    index("car_rates_location_idx").on(t.locationId),
  ],
)

/* -------------------------------------------------------------------------- */
/* Reservation Car — extension 1-1 de `reservations` (module='car')           */
/* -------------------------------------------------------------------------- */

/**
 * Suit exactement le pattern de reservation_transfer/reservation_omra dans
 * lib/db/schema.ts : reservationId est à la fois PK et FK vers reservations,
 * agencyId est dupliqué ici (comme sur les autres extensions) pour que les
 * policies RLS puissent filtrer sans jointure.
 *
 * L'intégration wallet ne demande aucune colonne supplémentaire : le flux
 * (à écrire dans lib/cars/actions.ts, hors périmètre de ce fichier) sera le
 * même que createTransferBooking → debitPartnerCredit({ agencyId,
 * amountTnd, reference, description, reservationId, txOverride, ... }),
 * reservationId étant la même clé que celle utilisée par
 * reservations.tndAmount/payments/partner_credit_movements.
 */
export const reservationCar = pgTable(
  "reservation_car",
  {
    reservationId: uuid("reservation_id")
      .primaryKey()
      .references(() => reservations.id, { onDelete: "cascade" }),
    agencyId: uuid("agency_id")
      .notNull()
      .references(() => agencies.id, { onDelete: "restrict" }),
    categoryId: uuid("category_id")
      .notNull()
      .references(() => carCategories.id, { onDelete: "restrict" }),
    /** Assigné à la préparation du contrat, pas forcément au moment de la résa. */
    vehicleId: uuid("vehicle_id").references(() => carFleetVehicles.id, {
      onDelete: "set null",
    }),
    pickupLocationId: uuid("pickup_location_id")
      .notNull()
      .references(() => carLocations.id, { onDelete: "restrict" }),
    dropoffLocationId: uuid("dropoff_location_id")
      .notNull()
      .references(() => carLocations.id, { onDelete: "restrict" }),
    pickupAt: timestamp("pickup_at", { withTimezone: true }).notNull(),
    dropoffAt: timestamp("dropoff_at", { withTimezone: true }).notNull(),
    rentalDays: integer("rental_days").notNull(),
    driverFullName: varchar("driver_full_name", { length: 200 }).notNull(),
    driverLicenseNumber: varchar("driver_license_number", {
      length: 64,
    }).notNull(),
    driverLicenseCountry: varchar("driver_license_country", { length: 64 }),
    driverBirthDate: date("driver_birth_date"),
    /** Conducteurs additionnels déclarés (snapshot, pas de table dédiée). */
    extraDrivers: jsonb("extra_drivers").$type<
      { fullName: string; licenseNumber: string }[]
    >(),
    insuranceLevel: carInsuranceLevel("insurance_level")
      .notNull()
      .default("basic"),
    /** NULL = kilométrage illimité. */
    mileageLimitKm: integer("mileage_limit_km"),
    depositAmountTnd: decimal("deposit_amount_tnd", {
      precision: 10,
      scale: 3,
    }).default("0"),
    /** Référence contrat/fournisseur externe si flotte gérée par un tiers. */
    providerBookingId: varchar("provider_booking_id", { length: 64 }),
    notes: text("notes"),
  },
  (t) => [
    index("res_car_agency_idx").on(t.agencyId),
    index("res_car_category_idx").on(t.categoryId),
    index("res_car_vehicle_idx").on(t.vehicleId),
    index("res_car_pickup_idx").on(t.pickupLocationId, t.pickupAt),
  ],
)

/* -------------------------------------------------------------------------- */
/* Type exports                                                               */
/* -------------------------------------------------------------------------- */

export type CarLocation = typeof carLocations.$inferSelect
export type NewCarLocation = typeof carLocations.$inferInsert
export type CarCategory = typeof carCategories.$inferSelect
export type NewCarCategory = typeof carCategories.$inferInsert
export type CarFleetVehicle = typeof carFleetVehicles.$inferSelect
export type NewCarFleetVehicle = typeof carFleetVehicles.$inferInsert
export type CarAvailability = typeof carAvailability.$inferSelect
export type NewCarAvailability = typeof carAvailability.$inferInsert
export type CarPricingRate = typeof carPricingRates.$inferSelect
export type NewCarPricingRate = typeof carPricingRates.$inferInsert
export type ReservationCar = typeof reservationCar.$inferSelect
export type NewReservationCar = typeof reservationCar.$inferInsert
