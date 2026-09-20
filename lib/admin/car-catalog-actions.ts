"use server"

/**
 * Back-office catalogue Voitures (lieux + catégories + tarifs) — chantier
 * "Centrale de réservation multi-produit" (item 1 : Transferts + Voitures,
 * même chantier technique). Le flux client (lib/cars/{actions,pricing}.ts,
 * app/(public)/[locale]/car/**) existait déjà et fonctionne, mais rien ne
 * permettait à un admin de créer les lieux/catégories/tarifs qu'il vend —
 * même gap que celui fermé pour Packages/Omra/Activités (Phase 13) et pour
 * Transferts (lib/admin/transfers-catalog-actions.ts, même chantier).
 *
 * Contrairement à `catalog_transfer_pricing`, `car_pricing_rates` a bien une
 * colonne `isActive` (voir lib/db/schema/cars.ts) : on expose donc un toggle
 * de statut plutôt qu'un delete pur pour les tarifs.
 */

import { and, eq } from "drizzle-orm"
import { revalidatePath } from "next/cache"
import { z } from "zod"
import { withTenantContext } from "@/lib/db/tenant-context"
import {
  carLocations,
  carCategories,
  carPricingRates,
  carTransmissionType,
  carFuelType,
  auditEvents,
} from "@/lib/db/schema"
import { assertProductManager } from "./product-guard"

export type CatalogActionResult<T = { id: string }> = { ok: true; data: T } | { ok: false; error: string }

/* -------------------------------------------------------------------------- */
/* Lieux (comptoirs)                                                          */
/* -------------------------------------------------------------------------- */

const locationSchema = z.object({
  name: z.string().trim().min(1).max(200),
  locationType: z.enum(["airport", "city", "hotel", "train_station"]),
  city: z.string().trim().min(1).max(100),
  address: z.string().trim().max(500).optional().or(z.literal("")),
  airportCode: z.string().trim().max(3).optional().or(z.literal("")),
  oneWayFeeTnd: z.coerce.number().min(0).optional(),
})
export type CarLocationInput = z.input<typeof locationSchema>

export async function listCarLocations() {
  const ctx = await assertProductManager().catch(() => null)
  if (!ctx) return []
  return withTenantContext({ agencyId: ctx.agencyId, userId: ctx.userId, isSuperAdmin: false }, (tx) =>
    tx.select().from(carLocations).where(eq(carLocations.agencyId, ctx.agencyId)).orderBy(carLocations.name),
  )
}

export async function createCarLocation(raw: CarLocationInput): Promise<CatalogActionResult> {
  let ctx
  try {
    ctx = await assertProductManager()
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "FORBIDDEN" }
  }
  const parsed = locationSchema.safeParse(raw)
  if (!parsed.success) return { ok: false, error: parsed.error.errors.map((e) => e.message).join(", ") }
  const data = parsed.data

  try {
    const result = await withTenantContext(
      { agencyId: ctx.agencyId, userId: ctx.userId, isSuperAdmin: false },
      async (tx) => {
        const [inserted] = await tx
          .insert(carLocations)
          .values({
            agencyId: ctx.agencyId,
            name: data.name,
            locationType: data.locationType,
            city: data.city,
            address: data.address || undefined,
            airportCode: data.airportCode || undefined,
            oneWayFeeTnd: data.oneWayFeeTnd != null ? data.oneWayFeeTnd.toFixed(3) : undefined,
          })
          .returning({ id: carLocations.id })

        await tx.insert(auditEvents).values({
          agencyId: ctx.agencyId,
          actorUserId: ctx.userId,
          entityType: "car_location",
          entityId: inserted.id,
          action: "car_location.created",
          diff: { name: data.name, city: data.city },
        })
        return inserted
      },
    )
    revalidatePath("/admin/car")
    return { ok: true, data: result }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Erreur interne" }
  }
}

export async function setCarLocationStatus(locationId: string, status: "active" | "inactive"): Promise<CatalogActionResult> {
  let ctx
  try {
    ctx = await assertProductManager()
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "FORBIDDEN" }
  }
  try {
    await withTenantContext({ agencyId: ctx.agencyId, userId: ctx.userId, isSuperAdmin: false }, async (tx) => {
      const [updated] = await tx
        .update(carLocations)
        .set({ status, updatedAt: new Date() })
        .where(and(eq(carLocations.id, locationId), eq(carLocations.agencyId, ctx.agencyId)))
        .returning({ id: carLocations.id })
      if (!updated) throw new Error("LOCATION_NOT_FOUND")

      await tx.insert(auditEvents).values({
        agencyId: ctx.agencyId,
        actorUserId: ctx.userId,
        entityType: "car_location",
        entityId: locationId,
        action: `car_location.${status}`,
        diff: { status },
      })
    })
    revalidatePath("/admin/car")
    return { ok: true, data: { id: locationId } }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Erreur interne" }
  }
}

/* -------------------------------------------------------------------------- */
/* Catégories de véhicules                                                    */
/* -------------------------------------------------------------------------- */

const TRANSMISSION_VALUES = carTransmissionType.enumValues
const FUEL_VALUES = carFuelType.enumValues

const categorySchema = z.object({
  code: z
    .string()
    .trim()
    .min(1)
    .max(32)
    .regex(/^[A-Z0-9-]+$/, "Code : majuscules, chiffres et tirets uniquement"),
  name: z.string().trim().min(1).max(100),
  seats: z.coerce.number().int().min(1).max(60).default(5),
  doors: z.coerce.number().int().min(2).max(6).default(4),
  luggageCapacity: z.coerce.number().int().min(0).max(20).default(2),
  transmission: z.enum(TRANSMISSION_VALUES as [string, ...string[]]).default("manual"),
  fuelType: z.enum(FUEL_VALUES as [string, ...string[]]).default("petrol"),
  minDriverAge: z.coerce.number().int().min(18).max(99).default(21),
})
export type CarCategoryInput = z.input<typeof categorySchema>

export async function listCarCategories() {
  const ctx = await assertProductManager().catch(() => null)
  if (!ctx) return []
  return withTenantContext({ agencyId: ctx.agencyId, userId: ctx.userId, isSuperAdmin: false }, (tx) =>
    tx.select().from(carCategories).where(eq(carCategories.agencyId, ctx.agencyId)).orderBy(carCategories.name),
  )
}

export async function createCarCategory(raw: CarCategoryInput): Promise<CatalogActionResult> {
  let ctx
  try {
    ctx = await assertProductManager()
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "FORBIDDEN" }
  }
  const parsed = categorySchema.safeParse(raw)
  if (!parsed.success) return { ok: false, error: parsed.error.errors.map((e) => e.message).join(", ") }
  const data = parsed.data

  try {
    const result = await withTenantContext(
      { agencyId: ctx.agencyId, userId: ctx.userId, isSuperAdmin: false },
      async (tx) => {
        const [inserted] = await tx
          .insert(carCategories)
          .values({
            agencyId: ctx.agencyId,
            code: data.code,
            name: data.name,
            seats: data.seats,
            doors: data.doors,
            luggageCapacity: data.luggageCapacity,
            transmission: data.transmission as (typeof TRANSMISSION_VALUES)[number],
            fuelType: data.fuelType as (typeof FUEL_VALUES)[number],
            minDriverAge: data.minDriverAge,
          })
          .returning({ id: carCategories.id })

        await tx.insert(auditEvents).values({
          agencyId: ctx.agencyId,
          actorUserId: ctx.userId,
          entityType: "car_category",
          entityId: inserted.id,
          action: "car_category.created",
          diff: { code: data.code, name: data.name },
        })
        return inserted
      },
    )
    revalidatePath("/admin/car")
    return { ok: true, data: result }
  } catch (e) {
    const message = e instanceof Error ? e.message : "Erreur interne"
    if (message.includes("car_categories_agency_code_uniq")) {
      return { ok: false, error: "Ce code catégorie existe déjà pour votre agence." }
    }
    return { ok: false, error: message }
  }
}

export async function setCarCategoryStatus(categoryId: string, status: "active" | "inactive"): Promise<CatalogActionResult> {
  let ctx
  try {
    ctx = await assertProductManager()
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "FORBIDDEN" }
  }
  try {
    await withTenantContext({ agencyId: ctx.agencyId, userId: ctx.userId, isSuperAdmin: false }, async (tx) => {
      const [updated] = await tx
        .update(carCategories)
        .set({ status, updatedAt: new Date() })
        .where(and(eq(carCategories.id, categoryId), eq(carCategories.agencyId, ctx.agencyId)))
        .returning({ id: carCategories.id })
      if (!updated) throw new Error("CATEGORY_NOT_FOUND")

      await tx.insert(auditEvents).values({
        agencyId: ctx.agencyId,
        actorUserId: ctx.userId,
        entityType: "car_category",
        entityId: categoryId,
        action: `car_category.${status}`,
        diff: { status },
      })
    })
    revalidatePath("/admin/car")
    return { ok: true, data: { id: categoryId } }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Erreur interne" }
  }
}

/* -------------------------------------------------------------------------- */
/* Tarifs (par catégorie, éventuellement par lieu)                            */
/* -------------------------------------------------------------------------- */

const pricingRateSchema = z.object({
  categoryId: z.string().uuid(),
  locationId: z.string().uuid().optional().or(z.literal("")),
  dailyRateTnd: z.coerce.number().positive(),
  weeklyRateTnd: z.coerce.number().positive().optional(),
  minRentalDays: z.coerce.number().int().min(1).max(90).default(1),
  depositTnd: z.coerce.number().min(0).default(0),
})
export type CarPricingRateInput = z.input<typeof pricingRateSchema>

export interface CarPricingRateRow {
  id: string
  categoryId: string
  categoryName: string
  locationId: string | null
  locationName: string | null
  dailyRateTnd: number
  weeklyRateTnd: number | null
  minRentalDays: number
  depositTnd: number
  isActive: boolean
}

export async function listCarPricingRates(): Promise<CarPricingRateRow[]> {
  const ctx = await assertProductManager().catch(() => null)
  if (!ctx) return []
  return withTenantContext({ agencyId: ctx.agencyId, userId: ctx.userId, isSuperAdmin: false }, async (tx) => {
    const [categories, locations, rates] = await Promise.all([
      tx.select().from(carCategories).where(eq(carCategories.agencyId, ctx.agencyId)),
      tx.select().from(carLocations).where(eq(carLocations.agencyId, ctx.agencyId)),
      tx.select().from(carPricingRates).where(eq(carPricingRates.agencyId, ctx.agencyId)),
    ])
    const categoryNameById = new Map(categories.map((c) => [c.id, c.name]))
    const locationNameById = new Map(locations.map((l) => [l.id, l.name]))

    return rates.map((r) => ({
      id: r.id,
      categoryId: r.categoryId,
      categoryName: categoryNameById.get(r.categoryId) ?? "—",
      locationId: r.locationId,
      locationName: r.locationId ? (locationNameById.get(r.locationId) ?? "—") : null,
      dailyRateTnd: Number(r.dailyRateTnd),
      weeklyRateTnd: r.weeklyRateTnd ? Number(r.weeklyRateTnd) : null,
      minRentalDays: r.minRentalDays,
      depositTnd: Number(r.depositTnd ?? 0),
      isActive: r.isActive,
    }))
  })
}

export async function createCarPricingRate(raw: CarPricingRateInput): Promise<CatalogActionResult> {
  let ctx
  try {
    ctx = await assertProductManager()
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "FORBIDDEN" }
  }
  const parsed = pricingRateSchema.safeParse(raw)
  if (!parsed.success) return { ok: false, error: parsed.error.errors.map((e) => e.message).join(", ") }
  const data = parsed.data

  try {
    const result = await withTenantContext(
      { agencyId: ctx.agencyId, userId: ctx.userId, isSuperAdmin: false },
      async (tx) => {
        const [category] = await tx
          .select({ id: carCategories.id })
          .from(carCategories)
          .where(and(eq(carCategories.id, data.categoryId), eq(carCategories.agencyId, ctx.agencyId)))
        if (!category) throw new Error("Catégorie introuvable pour cette agence.")

        if (data.locationId) {
          const [location] = await tx
            .select({ id: carLocations.id })
            .from(carLocations)
            .where(and(eq(carLocations.id, data.locationId), eq(carLocations.agencyId, ctx.agencyId)))
          if (!location) throw new Error("Lieu introuvable pour cette agence.")
        }

        const [inserted] = await tx
          .insert(carPricingRates)
          .values({
            agencyId: ctx.agencyId,
            categoryId: data.categoryId,
            locationId: data.locationId || undefined,
            dailyRateTnd: data.dailyRateTnd.toFixed(3),
            weeklyRateTnd: data.weeklyRateTnd != null ? data.weeklyRateTnd.toFixed(3) : undefined,
            minRentalDays: data.minRentalDays,
            depositTnd: data.depositTnd.toFixed(3),
            isActive: true,
          })
          .returning({ id: carPricingRates.id })

        await tx.insert(auditEvents).values({
          agencyId: ctx.agencyId,
          actorUserId: ctx.userId,
          entityType: "car_pricing_rate",
          entityId: inserted.id,
          action: "car_pricing_rate.created",
          diff: { categoryId: data.categoryId, locationId: data.locationId || null, dailyRateTnd: data.dailyRateTnd },
        })
        return inserted
      },
    )
    revalidatePath("/admin/car")
    return { ok: true, data: result }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Erreur interne" }
  }
}

export async function setCarPricingRateActive(rateId: string, isActive: boolean): Promise<CatalogActionResult> {
  let ctx
  try {
    ctx = await assertProductManager()
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "FORBIDDEN" }
  }
  try {
    await withTenantContext({ agencyId: ctx.agencyId, userId: ctx.userId, isSuperAdmin: false }, async (tx) => {
      const [updated] = await tx
        .update(carPricingRates)
        .set({ isActive, updatedAt: new Date() })
        .where(and(eq(carPricingRates.id, rateId), eq(carPricingRates.agencyId, ctx.agencyId)))
        .returning({ id: carPricingRates.id })
      if (!updated) throw new Error("RATE_NOT_FOUND")

      await tx.insert(auditEvents).values({
        agencyId: ctx.agencyId,
        actorUserId: ctx.userId,
        entityType: "car_pricing_rate",
        entityId: rateId,
        action: isActive ? "car_pricing_rate.activated" : "car_pricing_rate.deactivated",
        diff: { isActive },
      })
    })
    revalidatePath("/admin/car")
    return { ok: true, data: { id: rateId } }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Erreur interne" }
  }
}
