import { z } from "zod"
import { PRODUCT_CHANNELS } from "../product-constants"

const isoDate = /^\d{4}-\d{2}-\d{2}$/

/**
 * Champs riches Omraty (vol, Makkah/Médine, transferts, accompagnateur) —
 * demandés par la Phase 13 mais sans colonne dédiée dans `omra_packages`
 * (schéma Sprint 3A). Stockés dans la colonne `metadata` (jsonb), déjà
 * documentée pour cet usage ("itinéraire détaillé, conditions") — ajouter
 * 15+ colonnes dédiées aurait été la réécriture de schéma que la mission
 * interdit explicitement ; ce typage Zod donne la même garantie de forme
 * qu'une colonne dédiée, juste porté par le jsonb existant.
 */
export const omraFlightInfoSchema = z.object({
  airline: z.string().trim().max(64).optional().or(z.literal("")),
  departureAirport: z.string().trim().max(4).optional().or(z.literal("")),
  arrivalAirport: z.string().trim().max(4).optional().or(z.literal("")),
  outboundFlightNumber: z.string().trim().max(16).optional().or(z.literal("")),
  returnFlightNumber: z.string().trim().max(16).optional().or(z.literal("")),
  departureTime: z.string().trim().max(8).optional().or(z.literal("")),
  arrivalTime: z.string().trim().max(8).optional().or(z.literal("")),
  baggageAllowance: z.string().trim().max(64).optional().or(z.literal("")),
})

export const omraCityStaySchema = z.object({
  hotelName: z.string().trim().max(200).optional().or(z.literal("")),
  nights: z.coerce.number().int().min(0).max(60).default(0),
  roomTypes: z.array(z.string().trim().min(1)).max(10).default([]),
  mealPlan: z.string().trim().max(64).optional().or(z.literal("")),
})

export const omraAccompanyingPersonSchema = z.object({
  name: z.string().trim().max(200).optional().or(z.literal("")),
  phone: z.string().trim().max(32).optional().or(z.literal("")),
  whatsapp: z.string().trim().max(32).optional().or(z.literal("")),
  role: z.string().trim().max(64).optional().or(z.literal("")),
})

export const omraProductMetadataSchema = z.object({
  flight: omraFlightInfoSchema.default({}),
  firstDestination: z.enum(["makkah", "madinah"]).default("makkah"),
  makkah: omraCityStaySchema.default({}),
  madinah: omraCityStaySchema.default({}),
  transfers: z.array(z.string().trim().min(1)).max(10).default([]),
  accompanyingPerson: omraAccompanyingPersonSchema.default({}),
  otherServices: z.array(z.string().trim().min(1)).max(20).default([]),
})

export type OmraProductMetadata = z.infer<typeof omraProductMetadataSchema>

export const omraProductSchema = z
  .object({
    type: z.enum(["omra", "hajj", "ramadan", "umrah_plus"]),
    name: z.string().trim().min(3, "Nom du programme requis").max(128),
    description: z.string().trim().max(5000).optional().or(z.literal("")),
    durationDays: z.coerce.number().int().min(1).max(90),
    validFrom: z.string().regex(isoDate, "Date invalide"),
    validUntil: z.string().regex(isoDate, "Date invalide"),
    basePrice: z.coerce.number().positive("Prix de base requis"),
    includesVisa: z.boolean().default(true),
    includesFlights: z.boolean().default(true),
    includesHotels: z.boolean().default(true),
    includesTransfers: z.boolean().default(true),
    includesZiarat: z.boolean().default(true),
    includesGuide: z.boolean().default(false),
    maxPilgrims: z.coerce.number().int().min(1).max(500).default(45),
    minPilgrims: z.coerce.number().int().min(1).max(500).default(20),
    metadata: omraProductMetadataSchema,
    channels: z.array(z.enum(PRODUCT_CHANNELS)).min(1, "Au moins un canal de vente requis").default(["b2c"]),
  })
  .superRefine((data, ctx) => {
    if (data.validUntil < data.validFrom) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["validUntil"],
        message: "La date de fin de validité doit être postérieure à la date de début",
      })
    }
    if (data.minPilgrims > data.maxPilgrims) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["minPilgrims"],
        message: "Le minimum de pèlerins ne peut pas dépasser le maximum",
      })
    }
  })

export type OmraProductInput = z.infer<typeof omraProductSchema>

export const omraDepartureSchema = z
  .object({
    departureDate: z.string().regex(isoDate, "Date de départ invalide"),
    totalCapacity: z.coerce.number().int().min(1, "Capacité requise").max(500),
    overridePrice: z.coerce.number().positive().optional(),
    bookingDeadline: z.string().regex(isoDate).optional().or(z.literal("")),
  })
  .superRefine((data, ctx) => {
    if (data.bookingDeadline && data.bookingDeadline > data.departureDate) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["bookingDeadline"],
        message: "La date limite de réservation doit être antérieure ou égale à la date de départ",
      })
    }
  })
export type OmraDepartureInput = z.infer<typeof omraDepartureSchema>
