/**
 * Schéma Zod pour la validation du formulaire de recherche hôtelière
 * Valide les contraintes métier avant l'appel API
 */

import { z } from "zod"
import type { ChildAge } from "./types"
import { SEARCH_CONSTRAINTS } from "./types"

/**
 * Schéma pour une chambre
 */
export const roomOccupancySchema = z.object({
  adults: z
    .number()
    .min(SEARCH_CONSTRAINTS.MIN_ADULTS_PER_ROOM, "Au moins 1 adulte par chambre")
    .max(SEARCH_CONSTRAINTS.MAX_ADULTS_PER_ROOM, "Maximum 4 adultes par chambre"),
  children: z
    .number()
    .min(0)
    .max(SEARCH_CONSTRAINTS.MAX_CHILDREN_PER_ROOM, "Maximum 4 enfants par chambre"),
  childAges: z
    .array(z.number().min(0).max(17))
    .refine(
      (ages) => ages.length === 0 || ages.every((age) => age >= 0 && age <= 17),
      "L'âge des enfants doit être entre 0 et 17 ans"
    )
    .refine(
      (ages) => ages.length === 0 || ages.every((age) => age >= 0 && age <= 17),
      "L'âge des enfants doit être entre 0 et 17 ans"
    )
    .superRefine((ages, ctx) => {
      const children = ctx.parent?.children
      if (children !== undefined && ages.length !== children) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "L'âge est obligatoire pour chaque enfant",
        })
      }
    }),
})

/**
 * Schéma pour les dates
 */
export const datesSchema = z
  .object({
    checkIn: z.date({
      required_error: "La date d'arrivée est requise",
    }),
    checkOut: z.date({
      required_error: "La date de départ est requise",
    }),
  })
  .refine(
    (data) => data.checkOut > data.checkIn,
    "La date de départ doit être après la date d'arrivée"
  )
  .refine(
    (data) => {
      const nights = Math.ceil(
        (data.checkOut.getTime() - data.checkIn.getTime()) / (1000 * 60 * 60 * 24)
      )
      return nights >= SEARCH_CONSTRAINTS.MIN_NIGHTS
    },
    `Minimum ${SEARCH_CONSTRAINTS.MIN_NIGHTS} nuit(s)`
  )
  .refine(
    (data) => {
      const nights = Math.ceil(
        (data.checkOut.getTime() - data.checkIn.getTime()) / (1000 * 60 * 60 * 24)
      )
      return nights <= SEARCH_CONSTRAINTS.MAX_NIGHTS
    },
    `Maximum ${SEARCH_CONSTRAINTS.MAX_NIGHTS} nuits`
  )
  .refine(
    (data) => {
      const daysAhead = Math.ceil(
        (data.checkIn.getTime() - Date.now()) / (1000 * 60 * 60 * 24)
      )
      return daysAhead >= 0
    },
    "La date d'arrivée ne peut pas être dans le passé"
  )
  .refine(
    (data) => {
      const daysAhead = Math.ceil(
        (data.checkIn.getTime() - Date.now()) / (1000 * 60 * 60 * 24)
      )
      return daysAhead <= SEARCH_CONSTRAINTS.MAX_CHECKIN_DAYS_AHEAD
    },
    `La date d'arrivée ne peut pas dépasser ${SEARCH_CONSTRAINTS.MAX_CHECKIN_DAYS_AHEAD} jours`
  )

/**
 * Schéma pour la destination
 */
export const destinationSchema = z.object({
  city: z.string().min(1, "La ville est requise").optional(),
  country: z.string().min(1, "Le pays est requis").optional(),
  countryCode: z
    .string()
    .length(2, "Le code pays doit être ISO 3166-1 alpha-2")
    .optional(),
  coordinates: z
    .object({
      lat: z.number().min(-90).max(90),
      lng: z.number().min(-180).max(180),
    })
    .optional(),
})

/**
 * Schéma complet de recherche hôtelière
 */
export const hotelSearchSchema = z
  .object({
    destination: destinationSchema,
    dates: datesSchema,
    rooms: z
      .array(roomOccupancySchema)
      .min(1, "Au moins 1 chambre requise")
      .max(SEARCH_CONSTRAINTS.MAX_ROOMS, `Maximum ${SEARCH_CONSTRAINTS.MAX_ROOMS} chambres`)
      .refine(
        (rooms) => {
          const totalGuests = rooms.reduce(
            (sum, room) => sum + room.adults + room.children,
            0
          )
          return totalGuests <= SEARCH_CONSTRAINTS.MAX_TOTAL_GUESTS
        },
        `Maximum ${SEARCH_CONSTRAINTS.MAX_TOTAL_GUESTS} voyageurs au total`
      ),
    nationality: z.enum(["resident", "non_resident"], {
      required_error: "La nationalité est requise",
    }),
  })
  .refine(
    (data) => {
      // Au moins city ou countryCode doit être fourni
      return !!(data.destination.city || data.destination.countryCode)
    },
    "La destination (ville ou pays) est requise"
  )

/**
 * Type inféré du schéma
 */
export type HotelSearchFormData = z.infer<typeof hotelSearchSchema>

/**
 * Fonction utilitaire pour calculer le nombre de nuits
 */
export function calculateNights(checkIn: Date, checkOut: Date): number {
  return Math.ceil(
    (checkOut.getTime() - checkIn.getTime()) / (1000 * 60 * 60 * 24)
  )
}

/**
 * Fonction utilitaire pour valider les âges des enfants
 */
export function validateChildAges(children: number, childAges: number[]): boolean {
  if (children === 0) {
    return childAges.length === 0
  }
  return childAges.length === children && childAges.every((age) => age >= 0 && age <= 17)
}
