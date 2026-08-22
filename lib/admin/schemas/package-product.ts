import { z } from "zod"
import { PRODUCT_CHANNELS } from "../product-guard"

const isoDate = /^\d{4}-\d{2}-\d{2}$/

export const packageProductSchema = z.object({
  code: z.string().trim().min(2).max(64),
  title: z.string().trim().min(3, "Titre requis (min 3 caractères)").max(200),
  shortDescription: z.string().trim().max(500).optional().or(z.literal("")),
  longDescription: z.string().trim().max(5000).optional().or(z.literal("")),
  itinerary: z
    .array(z.object({ day: z.number().int().min(1), title: z.string().trim().min(1), description: z.string().trim().optional() }))
    .max(60)
    .optional(),
  coverImage: z.string().trim().url("URL image invalide").optional().or(z.literal("")),
  galleryUrls: z.array(z.string().trim().url()).max(30).default([]),
  departureLocations: z.array(z.string().trim().min(1)).max(20).default([]),
  transportMode: z.string().trim().max(32).optional().or(z.literal("")),
  durationDays: z.coerce.number().int().min(1, "Durée requise").max(90),
  durationNights: z.coerce.number().int().min(0).max(90),
  inclusions: z.array(z.string().trim().min(1)).max(40).default([]),
  exclusions: z.array(z.string().trim().min(1)).max(40).default([]),
  channels: z.array(z.enum(PRODUCT_CHANNELS)).min(1, "Au moins un canal de vente requis").default(["b2c"]),
})

export type PackageProductInput = z.infer<typeof packageProductSchema>

export const packageDepartureSchema = z
  .object({
    departureDate: z.string().regex(isoDate, "Date de départ invalide"),
    returnDate: z.string().regex(isoDate, "Date de retour invalide"),
    adultPriceTnd: z.coerce.number().positive("Prix adulte requis"),
    childPriceTnd: z.coerce.number().positive().optional(),
    depositPercent: z.coerce.number().int().min(0).max(100).default(30),
    totalSeats: z.coerce.number().int().min(1, "Capacité requise").max(1000),
  })
  .superRefine((data, ctx) => {
    if (data.returnDate < data.departureDate) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["returnDate"], message: "La date de retour doit suivre le départ" })
    }
  })

export type PackageDepartureInput = z.infer<typeof packageDepartureSchema>
