/**
 * Server Actions — Back-office Omra (saisie des programmes)
 *
 * CRUD des forfaits Omra (`omra_packages`) depuis le back-office admin.
 * L'agencyId et le contrôle de rôle proviennent du profil admin Supabase.
 */

"use server"

import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"
import { eq } from "drizzle-orm"
import { z } from "zod"

import { getDb } from "@/lib/db/client"
import { omraPackages } from "@/lib/db/schema"
import type {
  NewOmraPackage,
  OmraItineraryDay,
} from "@/lib/db/schema/omra"
import { requireOmraEditor } from "@/lib/omra/guard"

const packageTypes = ["omra", "hajj", "ramadan", "umrah_plus"] as const
const formules = [
  "moyasara",
  "al_haram",
  "abraj_premium",
  "vip_exclusive",
] as const
const mealPlans = [
  "room_only",
  "breakfast",
  "half_board",
  "full_board",
  "all_inclusive",
] as const
const hotelCategories = [
  "economy",
  "standard",
  "comfort",
  "luxury",
  "premium",
] as const

const programSchema = z.object({
  type: z.enum(packageTypes),
  formule: z.enum(formules).optional().nullable(),
  name: z.string().min(3, "Nom requis (min. 3 caractères)").max(128),
  nameAr: z.string().max(128).optional().nullable(),
  slug: z.string().max(160).optional().nullable(),
  description: z.string().optional().nullable(),
  durationDays: z.coerce.number().int().min(1).max(120),
  validFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date invalide"),
  validUntil: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date invalide"),
  basePrice: z.coerce.number().min(0),
  departureCity: z.string().max(64).default("Tunis"),
  nightsMedina: z.coerce.number().int().min(0).max(60).optional().nullable(),
  nightsMakkah: z.coerce.number().int().min(0).max(60).optional().nullable(),
  mealPlanMedina: z.enum(mealPlans).optional().nullable(),
  mealPlanMakkah: z.enum(mealPlans).optional().nullable(),
  hotelMedinaName: z.string().max(128).optional().nullable(),
  hotelMedinaCategory: z.enum(hotelCategories).optional().nullable(),
  hotelMakkahName: z.string().max(128).optional().nullable(),
  hotelMakkahCategory: z.enum(hotelCategories).optional().nullable(),
  maxPilgrims: z.coerce.number().int().min(1).max(500).default(45),
  minPilgrims: z.coerce.number().int().min(1).max(500).default(20),
  includesVisa: z.boolean().default(true),
  includesFlights: z.boolean().default(true),
  includesHotels: z.boolean().default(true),
  includesTransfers: z.boolean().default(true),
  includesZiarat: z.boolean().default(true),
  includesGuide: z.boolean().default(false),
  highlights: z.array(z.string()).default([]),
  alternativeDurations: z.array(z.number().int()).default([]),
  itinerary: z
    .array(
      z.object({
        day: z.number().int(),
        title: z.string(),
        description: z.string(),
      }),
    )
    .default([]),
  coverImageUrl: z.string().optional().nullable(),
  photoUrls: z.array(z.string()).default([]),
  featured: z.boolean().default(false),
  allowsInstallments: z.boolean().default(true),
  status: z.enum(["active", "draft", "archived"]).default("active"),
})

export type OmraProgramActionResult =
  | { ok: true; id: string }
  | { ok: false; error: string }

function slugify(input: string): string {
  return input
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)+/g, "")
    .slice(0, 160)
}

/** Convertit une textarea (une entrée par ligne) en tableau nettoyé. */
function linesToArray(value: FormDataEntryValue | null): string[] {
  if (typeof value !== "string") return []
  return value
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
}

/** Parse une textarea d'itinéraire : "Titre | Description" par ligne. */
function parseItinerary(value: FormDataEntryValue | null): OmraItineraryDay[] {
  if (typeof value !== "string") return []
  return value
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .map((line, idx) => {
      const [title, ...rest] = line.split("|")
      return {
        day: idx + 1,
        title: (title ?? "").trim(),
        description: rest.join("|").trim(),
      }
    })
}

function parseForm(formData: FormData) {
  const altRaw = (formData.get("alternativeDurations") as string) ?? ""
  const alternativeDurations = altRaw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => Number.parseInt(s, 10))
    .filter((n) => Number.isFinite(n))

  const nullable = (key: string) => {
    const v = formData.get(key)
    if (typeof v !== "string") return null
    const t = v.trim()
    return t.length > 0 ? t : null
  }

  return programSchema.safeParse({
    type: formData.get("type"),
    formule: nullable("formule"),
    name: formData.get("name"),
    nameAr: nullable("nameAr"),
    slug: nullable("slug"),
    description: nullable("description"),
    durationDays: formData.get("durationDays"),
    validFrom: formData.get("validFrom"),
    validUntil: formData.get("validUntil"),
    basePrice: formData.get("basePrice"),
    departureCity: (formData.get("departureCity") as string) || "Tunis",
    nightsMedina: nullable("nightsMedina"),
    nightsMakkah: nullable("nightsMakkah"),
    mealPlanMedina: nullable("mealPlanMedina"),
    mealPlanMakkah: nullable("mealPlanMakkah"),
    hotelMedinaName: nullable("hotelMedinaName"),
    hotelMedinaCategory: nullable("hotelMedinaCategory"),
    hotelMakkahName: nullable("hotelMakkahName"),
    hotelMakkahCategory: nullable("hotelMakkahCategory"),
    maxPilgrims: formData.get("maxPilgrims") || 45,
    minPilgrims: formData.get("minPilgrims") || 20,
    includesVisa: formData.get("includesVisa") === "on",
    includesFlights: formData.get("includesFlights") === "on",
    includesHotels: formData.get("includesHotels") === "on",
    includesTransfers: formData.get("includesTransfers") === "on",
    includesZiarat: formData.get("includesZiarat") === "on",
    includesGuide: formData.get("includesGuide") === "on",
    highlights: linesToArray(formData.get("highlights")),
    alternativeDurations,
    itinerary: parseItinerary(formData.get("itinerary")),
    coverImageUrl: nullable("coverImageUrl"),
    photoUrls: linesToArray(formData.get("photoUrls")),
    featured: formData.get("featured") === "on",
    allowsInstallments: formData.get("allowsInstallments") === "on",
    status: (formData.get("status") as string) || "active",
  })
}

function buildValues(
  parsed: z.infer<typeof programSchema>,
  agencyId: string,
): NewOmraPackage {
  return {
    agencyId,
    type: parsed.type,
    formule: parsed.formule ?? null,
    name: parsed.name,
    nameAr: parsed.nameAr ?? null,
    slug: parsed.slug?.trim() ? slugify(parsed.slug) : slugify(parsed.name),
    description: parsed.description ?? null,
    durationDays: parsed.durationDays,
    validFrom: parsed.validFrom,
    validUntil: parsed.validUntil,
    basePrice: parsed.basePrice.toFixed(3),
    departureCity: parsed.departureCity,
    nightsMedina: parsed.nightsMedina ?? null,
    nightsMakkah: parsed.nightsMakkah ?? null,
    mealPlanMedina: parsed.mealPlanMedina ?? null,
    mealPlanMakkah: parsed.mealPlanMakkah ?? null,
    hotelMedinaName: parsed.hotelMedinaName ?? null,
    hotelMedinaCategory: parsed.hotelMedinaCategory ?? null,
    hotelMakkahName: parsed.hotelMakkahName ?? null,
    hotelMakkahCategory: parsed.hotelMakkahCategory ?? null,
    maxPilgrims: parsed.maxPilgrims,
    minPilgrims: parsed.minPilgrims,
    includesVisa: parsed.includesVisa,
    includesFlights: parsed.includesFlights,
    includesHotels: parsed.includesHotels,
    includesTransfers: parsed.includesTransfers,
    includesZiarat: parsed.includesZiarat,
    includesGuide: parsed.includesGuide,
    highlights: parsed.highlights,
    alternativeDurations: parsed.alternativeDurations,
    itinerary: parsed.itinerary,
    coverImageUrl: parsed.coverImageUrl ?? null,
    photoUrls: parsed.photoUrls,
    featured: parsed.featured,
    allowsInstallments: parsed.allowsInstallments,
    status: parsed.status,
  }
}

export async function createOmraProgram(formData: FormData): Promise<void> {
  const auth = await requireOmraEditor()
  if ("error" in auth) throw new Error(auth.error)

  const parsed = parseForm(formData)
  if (!parsed.success) {
    throw new Error(parsed.error.issues.map((i) => i.message).join(" · "))
  }

  const db = getDb()
  await db.insert(omraPackages).values(buildValues(parsed.data, auth.agencyId))

  revalidatePath("/admin/products/omra")
  revalidatePath("/omra")
  redirect("/admin/products/omra?saved=created")
}

export async function updateOmraProgram(
  id: string,
  formData: FormData,
): Promise<void> {
  const auth = await requireOmraEditor()
  if ("error" in auth) throw new Error(auth.error)

  const parsed = parseForm(formData)
  if (!parsed.success) {
    throw new Error(parsed.error.issues.map((i) => i.message).join(" · "))
  }

  const db = getDb()
  const { agencyId: _agencyId, ...values } = buildValues(
    parsed.data,
    auth.agencyId,
  )
  await db
    .update(omraPackages)
    .set({ ...values, updatedAt: new Date() })
    .where(eq(omraPackages.id, id))

  revalidatePath("/admin/products/omra")
  revalidatePath(`/admin/products/omra/${id}`)
  revalidatePath("/omra")
  redirect("/admin/products/omra?saved=updated")
}

export async function deleteOmraProgram(
  id: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const auth = await requireOmraEditor()
  if ("error" in auth) return { ok: false, error: auth.error }

  try {
    const db = getDb()
    await db.delete(omraPackages).where(eq(omraPackages.id, id))
  } catch (e) {
    const message = e instanceof Error ? e.message : "Suppression impossible."
    return { ok: false, error: message }
  }

  revalidatePath("/admin/products/omra")
  revalidatePath("/omra")
  return { ok: true }
}
