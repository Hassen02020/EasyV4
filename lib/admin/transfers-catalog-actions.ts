"use server"

/**
 * Back-office catalogue Transferts (zones + tarifs) — chantier "Centrale de
 * réservation multi-produit" (item 1 : Transferts + Voitures). Le flux
 * client (lib/transfers/{actions,pricing}.ts, app/(public)/[locale]/transferts/**)
 * existait déjà et fonctionne, mais rien ne permettait à un admin de créer
 * les zones/tarifs qu'il vend — même gap que celui fermé pour
 * Packages/Omra/Activités (Phase 13, voir lib/admin/packages-actions.ts).
 *
 * `catalog_transfer_pricing` n'a pas de colonne `status`/`isActive` (seul
 * `catalog_transfer_zones` en a une) : l'existence même de la ligne fait foi
 * pour `calculateTransferPrice()` (lib/transfers/pricing.ts, un simple match
 * agencyId+fromZoneId+toZoneId+vehicleType, sans filtre de date malgré les
 * colonnes validFrom/validTo — la contrainte unique sur ce triplet empêche
 * de toute façon plusieurs lignes concurrentes pour le même trajet). On
 * expose donc create/update/delete pour le tarif, pas un toggle de statut.
 */

import { and, eq } from "drizzle-orm"
import { revalidatePath } from "next/cache"
import { z } from "zod"
import { withTenantContext } from "@/lib/db/tenant-context"
import { catalogTransferZones, catalogTransferPricing, transferVehicleType, auditEvents } from "@/lib/db/schema"
import { assertProductManager } from "./product-guard"

export type CatalogActionResult<T = { id: string }> = { ok: true; data: T } | { ok: false; error: string }

const VEHICLE_TYPES = transferVehicleType.enumValues

/* -------------------------------------------------------------------------- */
/* Zones                                                                      */
/* -------------------------------------------------------------------------- */

const zoneSchema = z.object({
  name: z.string().trim().min(1).max(200),
  zoneType: z.enum(["airport", "hotel", "city", "station"]),
  latitude: z.coerce.number().min(-90).max(90).optional(),
  longitude: z.coerce.number().min(-180).max(180).optional(),
})
export type TransferZoneInput = z.input<typeof zoneSchema>

export async function listTransferZones() {
  const ctx = await assertProductManager().catch(() => null)
  if (!ctx) return []
  return withTenantContext({ agencyId: ctx.agencyId, userId: ctx.userId, isSuperAdmin: false }, (tx) =>
    tx.select().from(catalogTransferZones).where(eq(catalogTransferZones.agencyId, ctx.agencyId)).orderBy(catalogTransferZones.name),
  )
}

export async function createTransferZone(raw: TransferZoneInput): Promise<CatalogActionResult> {
  let ctx
  try {
    ctx = await assertProductManager()
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "FORBIDDEN" }
  }
  const parsed = zoneSchema.safeParse(raw)
  if (!parsed.success) return { ok: false, error: parsed.error.errors.map((e) => e.message).join(", ") }
  const data = parsed.data

  try {
    const result = await withTenantContext(
      { agencyId: ctx.agencyId, userId: ctx.userId, isSuperAdmin: false },
      async (tx) => {
        const [inserted] = await tx
          .insert(catalogTransferZones)
          .values({
            agencyId: ctx.agencyId,
            name: data.name,
            zoneType: data.zoneType,
            latitude: data.latitude != null ? data.latitude.toFixed(6) : undefined,
            longitude: data.longitude != null ? data.longitude.toFixed(6) : undefined,
          })
          .returning({ id: catalogTransferZones.id })

        await tx.insert(auditEvents).values({
          agencyId: ctx.agencyId,
          actorUserId: ctx.userId,
          entityType: "catalog_transfer_zone",
          entityId: inserted.id,
          action: "transfer_zone.created",
          diff: { name: data.name, zoneType: data.zoneType },
        })
        return inserted
      },
    )
    revalidatePath("/admin/transferts")
    return { ok: true, data: result }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Erreur interne" }
  }
}

export async function setTransferZoneStatus(zoneId: string, status: "active" | "inactive"): Promise<CatalogActionResult> {
  let ctx
  try {
    ctx = await assertProductManager()
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "FORBIDDEN" }
  }
  try {
    await withTenantContext({ agencyId: ctx.agencyId, userId: ctx.userId, isSuperAdmin: false }, async (tx) => {
      const [updated] = await tx
        .update(catalogTransferZones)
        .set({ status })
        .where(and(eq(catalogTransferZones.id, zoneId), eq(catalogTransferZones.agencyId, ctx.agencyId)))
        .returning({ id: catalogTransferZones.id })
      if (!updated) throw new Error("ZONE_NOT_FOUND")

      await tx.insert(auditEvents).values({
        agencyId: ctx.agencyId,
        actorUserId: ctx.userId,
        entityType: "catalog_transfer_zone",
        entityId: zoneId,
        action: `transfer_zone.${status}`,
        diff: { status },
      })
    })
    revalidatePath("/admin/transferts")
    return { ok: true, data: { id: zoneId } }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Erreur interne" }
  }
}

/* -------------------------------------------------------------------------- */
/* Tarifs (paire de zones x véhicule)                                         */
/* -------------------------------------------------------------------------- */

const pricingSchema = z.object({
  fromZoneId: z.string().uuid(),
  toZoneId: z.string().uuid(),
  vehicleType: z.enum(VEHICLE_TYPES as [string, ...string[]]),
  basePriceTnd: z.coerce.number().positive(),
  nightSurchargePercent: z.coerce.number().min(0).max(200).default(0),
  validFrom: z.string().optional().or(z.literal("")),
  validTo: z.string().optional().or(z.literal("")),
})
export type TransferPricingInputForm = z.input<typeof pricingSchema>

export interface TransferPricingRow {
  id: string
  fromZoneId: string
  fromZoneName: string
  toZoneId: string
  toZoneName: string
  vehicleType: string
  basePriceTnd: number
  nightSurchargePercent: number
}

export async function listTransferPricing(): Promise<TransferPricingRow[]> {
  const ctx = await assertProductManager().catch(() => null)
  if (!ctx) return []
  return withTenantContext({ agencyId: ctx.agencyId, userId: ctx.userId, isSuperAdmin: false }, async (tx) => {
    const zones = await tx.select().from(catalogTransferZones).where(eq(catalogTransferZones.agencyId, ctx.agencyId))
    const zoneNameById = new Map(zones.map((z) => [z.id, z.name]))

    const rows = await tx.select().from(catalogTransferPricing).where(eq(catalogTransferPricing.agencyId, ctx.agencyId))
    return rows.map((r) => ({
      id: r.id,
      fromZoneId: r.fromZoneId,
      fromZoneName: zoneNameById.get(r.fromZoneId) ?? "—",
      toZoneId: r.toZoneId,
      toZoneName: zoneNameById.get(r.toZoneId) ?? "—",
      vehicleType: r.vehicleType,
      basePriceTnd: Number(r.basePriceTnd),
      nightSurchargePercent: r.nightSurchargePercent,
    }))
  })
}

export async function createTransferPricing(raw: TransferPricingInputForm): Promise<CatalogActionResult> {
  let ctx
  try {
    ctx = await assertProductManager()
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "FORBIDDEN" }
  }
  const parsed = pricingSchema.safeParse(raw)
  if (!parsed.success) return { ok: false, error: parsed.error.errors.map((e) => e.message).join(", ") }
  const data = parsed.data
  if (data.fromZoneId === data.toZoneId) return { ok: false, error: "Les zones de départ et d'arrivée doivent être différentes." }

  try {
    const result = await withTenantContext(
      { agencyId: ctx.agencyId, userId: ctx.userId, isSuperAdmin: false },
      async (tx) => {
        const zones = await tx
          .select({ id: catalogTransferZones.id })
          .from(catalogTransferZones)
          .where(
            and(
              eq(catalogTransferZones.agencyId, ctx.agencyId),
              eq(catalogTransferZones.status, "active"),
            ),
          )
        const zoneIds = new Set(zones.map((z) => z.id))
        if (!zoneIds.has(data.fromZoneId) || !zoneIds.has(data.toZoneId)) {
          throw new Error("Zone introuvable ou inactive pour cette agence.")
        }

        const [inserted] = await tx
          .insert(catalogTransferPricing)
          .values({
            agencyId: ctx.agencyId,
            fromZoneId: data.fromZoneId,
            toZoneId: data.toZoneId,
            vehicleType: data.vehicleType as (typeof VEHICLE_TYPES)[number],
            basePriceTnd: data.basePriceTnd.toFixed(2),
            nightSurchargePercent: Math.round(data.nightSurchargePercent),
            validFrom: data.validFrom || undefined,
            validTo: data.validTo || undefined,
          })
          .returning({ id: catalogTransferPricing.id })

        await tx.insert(auditEvents).values({
          agencyId: ctx.agencyId,
          actorUserId: ctx.userId,
          entityType: "catalog_transfer_pricing",
          entityId: inserted.id,
          action: "transfer_pricing.created",
          diff: { fromZoneId: data.fromZoneId, toZoneId: data.toZoneId, vehicleType: data.vehicleType },
        })
        return inserted
      },
    )
    revalidatePath("/admin/transferts")
    return { ok: true, data: result }
  } catch (e) {
    const message = e instanceof Error ? e.message : "Erreur interne"
    if (message.includes("catalog_tpr_pair_uniq")) {
      return { ok: false, error: "Un tarif existe déjà pour ce trajet et ce type de véhicule — supprimez-le d'abord." }
    }
    return { ok: false, error: message }
  }
}

export async function deleteTransferPricing(pricingId: string): Promise<CatalogActionResult> {
  let ctx
  try {
    ctx = await assertProductManager()
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "FORBIDDEN" }
  }
  try {
    await withTenantContext({ agencyId: ctx.agencyId, userId: ctx.userId, isSuperAdmin: false }, async (tx) => {
      const [deleted] = await tx
        .delete(catalogTransferPricing)
        .where(and(eq(catalogTransferPricing.id, pricingId), eq(catalogTransferPricing.agencyId, ctx.agencyId)))
        .returning({ id: catalogTransferPricing.id })
      if (!deleted) throw new Error("PRICING_NOT_FOUND")

      await tx.insert(auditEvents).values({
        agencyId: ctx.agencyId,
        actorUserId: ctx.userId,
        entityType: "catalog_transfer_pricing",
        entityId: pricingId,
        action: "transfer_pricing.deleted",
        diff: {},
      })
    })
    revalidatePath("/admin/transferts")
    return { ok: true, data: { id: pricingId } }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Erreur interne" }
  }
}
