/**
 * Schéma Drizzle — Module Omra (Sprint 3A)
 *
 * Tables :
 *   - omra_packages : forfaits Omra avec allotements par date
 *   - omra_allotments : gestion fine des stocks par date/hôtel
 *   - omra_pilgrims : fiches détaillées des pèlerins (données visa, passeport)
 *   - omra_room_allocations : répartition des pèlerins par chambre
 *   - omra_flights : vols aller/retour par groupe
 *   - omra_hotels : hôtels La Mecque / Médine avec détails
 *
 * Sécurité :
 *   - FOR UPDATE sur les allotments pour éviter le surbooking
 *   - Transactions atomiques pour la réservation
 */

import { pgTable, uuid, varchar, integer, decimal, date, timestamp, boolean, text, jsonb, index, pgEnum } from "drizzle-orm/pg-core"
import { agencies } from "../schema"

/* -------------------------------------------------------------------------- */
/* Enums                                                                      */
/* -------------------------------------------------------------------------- */

export const omraPackageType = pgEnum("omra_package_type", [
  "omra", // Omra simple
  "hajj", // Hajj
  "ramadan", // Omra Ramadan
  "umrah_plus", // Omra + Ziarat étendu
])

export const omraVisaStatus = pgEnum("omra_visa_status", [
  "not_required", // Visa non requis (nationalité exemptée)
  "pending", // En attente de dépôt
  "submitted", // Dossier soumis
  "approved", // Visa accordé
  "rejected", // Visa refusé
  "expired", // Visa expiré
])

export const omraGender = pgEnum("omra_gender", ["male", "female"])

export const omraMaritalStatus = pgEnum("omra_marital_status", [
  "single",
  "married",
  "widowed",
  "divorced",
])

export const omraRoomType = pgEnum("omra_room_type", [
  "single", // 1 personne
  "double", // 2 personnes
  "triple", // 3 personnes
  "quad", // 4 personnes
  "suite", // Suite
])

export const omraMealPlan = pgEnum("omra_meal_plan", [
  "room_only", // Sans repas
  "breakfast", // Petit-déjeuner
  "half_board", // Demi-pension
  "full_board", // Pension complète
  "all_inclusive", // Tout inclus
])

export const omraHotelCategory = pgEnum("omra_hotel_category", [
  "economy", // 1-2 étoiles
  "standard", // 3 étoiles
  "comfort", // 4 étoiles
  "luxury", // 5 étoiles
  "premium", // 5 étoiles luxe
])

/* -------------------------------------------------------------------------- */
/* Omra Packages                                                               */
/* -------------------------------------------------------------------------- */

/**
 * Forfaits Omra/Hajj avec allotements par date.
 *
 * Chaque package définit :
 *   - Durée, villes visitées, inclusions
 *   - Prix par pèlerin (base)
 *   - Catégories d'hôtels La Mecque / Médine
 */
export const omraPackages = pgTable(
  "omra_packages",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    agencyId: uuid("agency_id")
      .notNull()
      .references(() => agencies.id, { onDelete: "restrict" }),
    
    /** Type de package (Omra, Hajj, Ramadan, etc.) */
    type: omraPackageType("type").notNull(),
    
    /** Nom du package (ex: "Omra Ramadan 2026 - 10 jours") */
    name: varchar("name", { length: 128 }).notNull(),
    
    /** Description détaillée (itinéraire, inclusions) */
    description: text("description"),
    
    /** Durée en jours */
    durationDays: integer("duration_days").notNull(),
    
    /** Date de début de validité du package */
    validFrom: date("valid_from").notNull(),
    
    /** Date de fin de validité du package */
    validUntil: date("valid_until").notNull(),
    
    /** Prix de base par pèlerin (TND) */
    basePrice: decimal("base_price", { precision: 12, scale: 3 }).notNull(),
    
    /** Visa inclus dans le prix ? */
    includesVisa: boolean("includes_visa").notNull().default(true),
    
    /** Vols inclus dans le prix ? */
    includesFlights: boolean("includes_flights").notNull().default(true),
    
    /** Hôtels inclus dans le prix ? */
    includesHotels: boolean("includes_hotels").notNull().default(true),
    
    /** Transferts aéroport/hôtel inclus ? */
    includesTransfers: boolean("includes_transfers").notNull().default(true),
    
    /** Ziarat inclus ? (visites religieuses) */
    includesZiarat: boolean("includes_ziarat").notNull().default(true),
    
    /** Guide spirituel accompagnateur ? */
    includesGuide: boolean("includes_guide").notNull().default(false),
    
    /** Capacité maximale de pèlerins par groupe */
    maxPilgrims: integer("max_pilgrims").notNull().default(45),
    
    /** Capacité minimale pour départ garanti */
    minPilgrims: integer("min_pilgrims").notNull().default(20),
    
    /** Métadonnées (itinéraire détaillé, conditions) */
    metadata: jsonb("metadata"),
    
    /** Statut du package */
    status: varchar("status", { length: 16 }).notNull().default("active"),
    
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("omra_pkg_agency_idx").on(t.agencyId),
    index("omra_pkg_type_idx").on(t.type),
    index("omra_pkg_valid_idx").on(t.validFrom, t.validUntil),
    index("omra_pkg_status_idx").on(t.status),
  ],
)

/* -------------------------------------------------------------------------- */
/* Omra Allotments (Gestion des stocks)                                        */
/* -------------------------------------------------------------------------- */

/**
 * Allotements par date pour un package.
 *
 * Permet une gestion fine des disponibilités :
 *   - Stock total par date de départ
 *   - Stock réservé (en attente paiement)
 *   - Stock confirmé
 *   - Verrou FOR UPDATE pour éviter le surbooking
 */
export const omraAllotments = pgTable(
  "omra_allotments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    packageId: uuid("package_id")
      .notNull()
      .references(() => omraPackages.id, { onDelete: "cascade" }),
    
    /** Date de départ (date du vol aller) */
    departureDate: date("departure_date").notNull(),
    
    /** Capacité totale pour cette date */
    totalCapacity: integer("total_capacity").notNull(),
    
    /** Places réservées (en attente paiement) */
    reservedCount: integer("reserved_count").notNull().default(0),
    
    /** Places confirmées (payées) */
    confirmedCount: integer("confirmed_count").notNull().default(0),
    
    /** Places bloquées (problème paiement, annulation en cours) */
    blockedCount: integer("blocked_count").notNull().default(0),
    
    /** Places disponibles = total - (reserved + confirmed + blocked) */
    availableCount: integer("available_count").notNull(),
    
    /** Prix spécifique pour cette date (si différent du basePrice) */
    overridePrice: decimal("override_price", { precision: 12, scale: 3 }),
    
    /** Date limite de réservation pour ce départ */
    bookingDeadline: date("booking_deadline"),
    
    /** Statut de l'allotement */
    status: varchar("status", { length: 16 }).notNull().default("active"),
    
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("omra_allot_pkg_idx").on(t.packageId),
    index("omra_allot_date_idx").on(t.departureDate),
    index("omra_allot_status_idx").on(t.status),
    // Index composite pour les requêtes de disponibilité
    index("omra_allot_pkg_date_idx").on(t.packageId, t.departureDate),
  ],
)

/* -------------------------------------------------------------------------- */
/* Omra Hotels (La Mecque / Médine)                                            */
/* -------------------------------------------------------------------------- */

/**
 * Hôtels disponibles pour les séjours Omra.
 *
 * Stocke les détails des hôtels La Mecque et Médine :
 *   - Distance de la Kaaba / Mosquée du Prophète
 *   - Catégorie, services, photos
 */
export const omraHotels = pgTable(
  "omra_hotels",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    
    /** Nom de l'hôtel */
    name: varchar("name", { length: 128 }).notNull(),
    
    /** Ville : 'mecca' ou 'medina' */
    city: varchar("city", { length: 16 }).notNull(),
    
    /** Catégorie (étoiles) */
    category: omraHotelCategory("category").notNull(),
    
    /** Adresse complète */
    address: text("address"),
    
    /** Distance à pied de la Kaaba (en mètres) */
    distanceToKaaba: integer("distance_to_kaaba"),
    
    /** Distance à pied de la Mosquée du Prophète (en mètres) */
    distanceToProphetMosque: integer("distance_to_prophet_mosque"),
    
    /** Services disponibles (wifi, restaurant, piscine, etc.) */
    amenities: text("amenities").array(),
    
    /** URLs des photos (Supabase Storage) */
    photoUrls: text("photo_urls").array(),
    
    /** Description détaillée */
    description: text("description"),
    
    /** Note moyenne (1-5) */
    rating: decimal("rating", { precision: 2, scale: 1 }),
    
    /** Coordonnées GPS */
    latitude: decimal("latitude", { precision: 9, scale: 6 }),
    longitude: decimal("longitude", { precision: 9, scale: 6 }),
    
    /** Métadonnées supplémentaires */
    metadata: jsonb("metadata"),
    
    /** Statut de l'hôtel */
    status: varchar("status", { length: 16 }).notNull().default("active"),
    
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("omra_hotel_city_idx").on(t.city),
    index("omra_hotel_category_idx").on(t.category),
    index("omra_hotel_status_idx").on(t.status),
  ],
)

/* -------------------------------------------------------------------------- */
/* Omra Pilgrims (Fiches détaillées)                                           */
/* -------------------------------------------------------------------------- */

/**
 * Fiches détaillées des pèlerins.
 *
 * Contient toutes les informations requises pour :
 *   - Demande de visa
 *   - Réservation de vol
 *   - Allocation de chambre
 *   - Assurance voyage
 */
export const omraPilgrims = pgTable(
  "omra_pilgrims",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    
    /** Réservation associée */
    reservationId: uuid("reservation_id").notNull(),
    
    /** Agence */
    agencyId: uuid("agency_id")
      .notNull()
      .references(() => agencies.id, { onDelete: "restrict" }),
    
    /** Informations personnelles de base */
    firstName: varchar("first_name", { length: 64 }).notNull(),
    lastName: varchar("last_name", { length: 64 }).notNull(),
    firstNameAr: varchar("first_name_ar", { length: 64 }),
    lastNameAr: varchar("last_name_ar", { length: 64 }),
    
    /** Date de naissance */
    birthDate: date("birth_date").notNull(),
    
    /** Lieu de naissance */
    birthPlace: varchar("birth_place", { length: 64 }),
    
    /** Nationalité (code ISO 3166-1 alpha-2) */
    nationality: varchar("nationality", { length: 2 }).notNull(),
    
    /** Genre */
    gender: omraGender("gender").notNull(),
    
    /** Situation matrimoniale */
    maritalStatus: omraMaritalStatus("marital_status").notNull(),
    
    /** Numéro de téléphone */
    phone: varchar("phone", { length: 20 }).notNull(),
    
    /** Email */
    email: varchar("email", { length: 128 }),
    
    /** Adresse postale */
    address: text("address"),
    
    /** Ville */
    city: varchar("city", { length: 64 }),
    
    /** Code postal */
    postalCode: varchar("postal_code", { length: 16 }),
    
    /** Pays de résidence */
    country: varchar("country", { length: 2 }).notNull(),
    
    /** --- Passeport --- */
    passportNumber: varchar("passport_number", { length: 32 }).notNull(),
    passportIssueDate: date("passport_issue_date").notNull(),
    passportExpiryDate: date("passport_expiry_date").notNull(),
    passportIssuingCountry: varchar("passport_issuing_country", { length: 2 }).notNull(),
    
    /** --- Visa --- */
    visaStatus: omraVisaStatus("visa_status").notNull().default("pending"),
    visaNumber: varchar("visa_number", { length: 32 }),
    visaIssueDate: date("visa_issue_date"),
    visaExpiryDate: date("visa_expiry_date"),
    
    /** --- Santé --- */
    bloodType: varchar("blood_type", { length: 4 }),
    hasMedicalConditions: boolean("has_medical_conditions").notNull().default(false),
    medicalConditions: text("medical_conditions"),
    requiresSpecialAssistance: boolean("requires_special_assistance").notNull().default(false),
    specialAssistanceDetails: text("special_assistance_details"),
    
    /** --- Contact d'urgence --- */
    emergencyContactName: varchar("emergency_contact_name", { length: 128 }),
    emergencyContactPhone: varchar("emergency_contact_phone", { length: 20 }),
    emergencyContactRelation: varchar("emergency_contact_relation", { length: 32 }),
    
    /** --- Chambre --- */
    roomId: uuid("room_id"),
    roomType: omraRoomType("room_type"),
    
    /** --- Photo (pour badge) --- */
    photoUrl: text("photo_url"),
    
    /** --- Documents (passeport scan, etc.) --- */
    passportScanUrl: text("passport_scan_url"),
    
    /** Métadonnées supplémentaires */
    metadata: jsonb("metadata"),
    
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("omra_pilgrim_res_idx").on(t.reservationId),
    index("omra_pilgrim_agency_idx").on(t.agencyId),
    index("omra_pilgrim_passport_idx").on(t.passportNumber),
    index("omra_pilgrim_visa_idx").on(t.visaStatus),
    index("omra_pilgrim_room_idx").on(t.roomId),
  ],
)

/* -------------------------------------------------------------------------- */
/* Omra Room Allocations                                                       */
/* -------------------------------------------------------------------------- */

/**
 * Allocation des pèlerins par chambre.
 *
 * Définit la répartition des pèlerins dans les chambres
 * pour chaque hôtel (La Mecque / Médine).
 */
export const omraRoomAllocations = pgTable(
  "omra_room_allocations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    
    /** Réservation associée */
    reservationId: uuid("reservation_id").notNull(),
    
    /** Package */
    packageId: uuid("package_id")
      .notNull()
      .references(() => omraPackages.id, { onDelete: "cascade" }),
    
    /** Hôtel */
    hotelId: uuid("hotel_id")
      .notNull()
      .references(() => omraHotels.id, { onDelete: "restrict" }),
    
    /** Type de chambre */
    roomType: omraRoomType("room_type").notNull(),
    
    /** Numéro de chambre (attribué par l'hôtel) */
    roomNumber: varchar("room_number", { length: 16 }),
    
    /** Étage */
    floor: varchar("floor", { length: 8 }),
    
    /** Capacité de la chambre */
    capacity: integer("capacity").notNull(),
    
    /** Nombre de pèlerins assignés */
    occupiedCount: integer("occupied_count").notNull().default(0),
    
    /** Plan repas */
    mealPlan: omraMealPlan("meal_plan").notNull().default("half_board"),
    
    /** Dates de séjour dans cet hôtel */
    checkInDate: date("check_in_date").notNull(),
    checkOutDate: date("check_out_date").notNull(),
    
    /** Prix par nuit pour cette chambre */
    pricePerNight: decimal("price_per_night", { precision: 12, scale: 3 }).notNull(),
    
    /** Métadonnées */
    metadata: jsonb("metadata"),
    
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("omra_room_res_idx").on(t.reservationId),
    index("omra_room_pkg_idx").on(t.packageId),
    index("omra_room_hotel_idx").on(t.hotelId),
    index("omra_room_dates_idx").on(t.checkInDate, t.checkOutDate),
  ],
)

/* -------------------------------------------------------------------------- */
/* Omra Flights                                                                */
/* -------------------------------------------------------------------------- */

/**
 * Vols aller/retour pour les groupes Omra.
 *
 * Stocke les détails des vols par groupe :
 *   - Compagnie aérienne, numéro de vol
 *   - Horaires, aéroports
 *   - Classe de voyage
 */
export const omraFlights = pgTable(
  "omra_flights",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    
    /** Réservation associée */
    reservationId: uuid("reservation_id").notNull(),
    
    /** Package */
    packageId: uuid("package_id")
      .notNull()
      .references(() => omraPackages.id, { onDelete: "cascade" }),
    
    /** Direction : 'outbound' (aller) ou 'inbound' (retour) */
    direction: varchar("direction", { length: 16 }).notNull(),
    
    /** Compagnie aérienne */
    airline: varchar("airline", { length: 64 }).notNull(),
    
    /** Numéro de vol */
    flightNumber: varchar("flight_number", { length: 16 }).notNull(),
    
    /** Aéroport de départ (code IATA) */
    departureAirport: varchar("departure_airport", { length: 4 }).notNull(),
    
    /** Aéroport d'arrivée (code IATA) */
    arrivalAirport: varchar("arrival_airport", { length: 4 }).notNull(),
    
    /** Date de départ */
    departureDate: date("departure_date").notNull(),
    
    /** Heure de départ */
    departureTime: varchar("departure_time", { length: 8 }).notNull(),
    
    /** Date d'arrivée */
    arrivalDate: date("arrival_date").notNull(),
    
    /** Heure d'arrivée */
    arrivalTime: varchar("arrival_time", { length: 8 }).notNull(),
    
    /** Classe de voyage */
    travelClass: varchar("travel_class", { length: 16 }).notNull().default("economy"),
    
    /** Durée du vol (en minutes) */
    durationMinutes: integer("duration_minutes"),
    
    /** Escales (nombre) */
    stops: integer("stops").notNull().default(0),
    
    /** Métadonnées */
    metadata: jsonb("metadata"),
    
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("omra_flight_res_idx").on(t.reservationId),
    index("omra_flight_pkg_idx").on(t.packageId),
    index("omra_flight_dir_idx").on(t.direction),
    index("omra_flight_dates_idx").on(t.departureDate),
  ],
)

/* -------------------------------------------------------------------------- */
/* Type exports                                                               */
/* -------------------------------------------------------------------------- */

export type OmraPackage = typeof omraPackages.$inferSelect
export type NewOmraPackage = typeof omraPackages.$inferInsert
export type OmraAllotment = typeof omraAllotments.$inferSelect
export type NewOmraAllotment = typeof omraAllotments.$inferInsert
export type OmraHotel = typeof omraHotels.$inferSelect
export type NewOmraHotel = typeof omraHotels.$inferInsert
export type OmraPilgrim = typeof omraPilgrims.$inferSelect
export type NewOmraPilgrim = typeof omraPilgrims.$inferInsert
export type OmraRoomAllocation = typeof omraRoomAllocations.$inferSelect
export type NewOmraRoomAllocation = typeof omraRoomAllocations.$inferInsert
export type OmraFlight = typeof omraFlights.$inferSelect
export type NewOmraFlight = typeof omraFlights.$inferInsert

export type OmraPackageType = (typeof omraPackageType.enumValues)[number]
export type OmraVisaStatus = (typeof omraVisaStatus.enumValues)[number]
export type OmraGender = (typeof omraGender.enumValues)[number]
export type OmraMaritalStatus = (typeof omraMaritalStatus.enumValues)[number]
export type OmraRoomType = (typeof omraRoomType.enumValues)[number]
export type OmraMealPlan = (typeof omraMealPlan.enumValues)[number]
export type OmraHotelCategory = (typeof omraHotelCategory.enumValues)[number]
