import { z } from "zod"
import { PRODUCT_CHANNELS } from "../product-constants"

const isoDate = /^\d{4}-\d{2}-\d{2}$/
const hhmm = /^\d{2}:\d{2}$/

export const activityProductSchema = z.object({
  code: z.string().trim().min(2).max(64),
  title: z.string().trim().min(3, "Titre requis").max(200),
  location: z.string().trim().max(200).optional().or(z.literal("")),
  shortDescription: z.string().trim().max(500).optional().or(z.literal("")),
  longDescription: z.string().trim().max(5000).optional().or(z.literal("")),
  durationMinutes: z.coerce.number().int().min(1).max(2880),
  coverImage: z.string().trim().url("URL image invalide").optional().or(z.literal("")),
  galleryUrls: z.array(z.string().trim().url()).max(30).default([]),
  inclusions: z.array(z.string().trim().min(1)).max(40).default([]),
  exclusions: z.array(z.string().trim().min(1)).max(40).default([]),
  channels: z.array(z.enum(PRODUCT_CHANNELS)).min(1, "Au moins un canal de vente requis").default(["b2c"]),
})

export type ActivityProductInput = z.infer<typeof activityProductSchema>

export const activitySessionSchema = z
  .object({
    sessionDate: z.string().regex(isoDate, "Date invalide"),
    sessionStart: z.string().regex(hhmm, "Heure invalide (HH:MM)"),
    sessionEnd: z.string().regex(hhmm, "Heure invalide (HH:MM)"),
    capacity: z.coerce.number().int().min(1, "Capacité requise").max(1000),
    adultPriceTnd: z.coerce.number().positive("Prix adulte requis"),
    childPriceTnd: z.coerce.number().positive().optional(),
    seniorPriceTnd: z.coerce.number().positive().optional(),
  })
  .superRefine((data, ctx) => {
    if (data.sessionEnd <= data.sessionStart) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["sessionEnd"], message: "L'heure de fin doit suivre l'heure de début" })
    }
  })

export type ActivitySessionInput = z.infer<typeof activitySessionSchema>
