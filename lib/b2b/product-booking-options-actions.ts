"use server"

/**
 * Options de réservation (départs/allotements/sessions) pour un produit
 * autorisé — Server Action invocable directement depuis le client
 * (`/pro/produits`, Phase 13.1, gap #2).
 *
 * `agencyId` n'est JAMAIS accepté en paramètre ici (contrairement à
 * `lib/b2b/authorized-products.ts`, qui n'est PAS une Server Action) —
 * résolu uniquement via `resolveSessionContext()` côté serveur, pour ne
 * jamais permettre à un client de consulter les options d'un produit avec
 * l'identité d'une autre agence. RLS (0023_commerce_completion.sql) refuse
 * de toute façon la lecture si l'agence résolue n'est ni propriétaire ni
 * autorisée — défense en profondeur, pas la seule barrière.
 */

import { eq, and, gte } from "drizzle-orm"
import { resolveSessionContext, withTenantContext } from "@/lib/db/tenant-context"
import {
  catalogPackages,
  catalogPackageDepartures,
  omraPackages,
  omraAllotments,
  catalogActivities,
  catalogActivitySessions,
} from "@/lib/db/schema"

export type BookableOption =
  | { kind: "departure"; id: string; date: string; endDate: string; seatsLeft: number; adultPriceTnd: number; childPriceTnd?: number }
  | { kind: "session"; id: string; date: string; start: string; end: string; capacityLeft: number; adultPriceTnd: number; childPriceTnd?: number }

export type GetBookableOptionsResult =
  | { ok: true; options: BookableOption[] }
  | { ok: false; error: string }

export async function getBookableOptionsForProduct(
  productType: "package" | "omra" | "activity",
  productId: string,
): Promise<GetBookableOptionsResult> {
  if (!process.env.DATABASE_URL) return { ok: false, error: "Base de données non configurée" }

  const session = await resolveSessionContext()
  if (!session.ok || !session.agencyId) return { ok: false, error: "Non authentifié" }
  const agencyId = session.agencyId

  try {
    return await withTenantContext({ agencyId, userId: session.userId, isSuperAdmin: session.isSuperAdmin }, async (tx) => {
      if (productType === "package") {
        const [pkg] = await tx.select().from(catalogPackages).where(eq(catalogPackages.id, productId)).limit(1)
        if (!pkg) return { ok: false, error: "Produit introuvable ou non autorisé" }
        const rows = await tx
          .select()
          .from(catalogPackageDepartures)
          .where(
            and(
              eq(catalogPackageDepartures.packageId, productId),
              eq(catalogPackageDepartures.status, "open"),
              gte(catalogPackageDepartures.departureDate, new Date().toISOString().split("T")[0]!),
            ),
          )
          .orderBy(catalogPackageDepartures.departureDate)
        const options: BookableOption[] = rows
          .map((d) => ({
            kind: "departure" as const,
            id: d.id,
            date: d.departureDate,
            endDate: d.returnDate,
            seatsLeft: d.totalSeats - d.bookedSeats,
            adultPriceTnd: parseFloat(d.adultPriceTnd),
            childPriceTnd: d.childPriceTnd ? parseFloat(d.childPriceTnd) : undefined,
          }))
          .filter((o) => o.seatsLeft > 0)
        return { ok: true, options }
      }

      if (productType === "omra") {
        const [pkg] = await tx.select().from(omraPackages).where(eq(omraPackages.id, productId)).limit(1)
        if (!pkg) return { ok: false, error: "Produit introuvable ou non autorisé" }
        const rows = await tx
          .select()
          .from(omraAllotments)
          .where(and(eq(omraAllotments.packageId, productId), eq(omraAllotments.status, "active")))
          .orderBy(omraAllotments.departureDate)
        const basePrice = parseFloat(pkg.basePrice)
        const options: BookableOption[] = rows
          .filter((a) => a.availableCount > 0)
          .map((a) => ({
            kind: "departure" as const,
            id: a.id,
            date: a.departureDate,
            endDate: a.departureDate,
            seatsLeft: a.availableCount,
            adultPriceTnd: a.overridePrice ? parseFloat(a.overridePrice) : basePrice,
          }))
        return { ok: true, options }
      }

      const [activity] = await tx.select().from(catalogActivities).where(eq(catalogActivities.id, productId)).limit(1)
      if (!activity) return { ok: false, error: "Produit introuvable ou non autorisé" }
      const rows = await tx
        .select()
        .from(catalogActivitySessions)
        .where(
          and(
            eq(catalogActivitySessions.activityId, productId),
            eq(catalogActivitySessions.status, "open"),
            gte(catalogActivitySessions.sessionDate, new Date().toISOString().split("T")[0]!),
          ),
        )
        .orderBy(catalogActivitySessions.sessionDate)
      const now = new Date()
      const options: BookableOption[] = rows
        .filter((s) => {
          const capacityLeft = s.capacity - s.booked
          const deadline = s.bookingDeadline ?? new Date(`${s.sessionDate}T${s.sessionStart}:00`)
          return capacityLeft > 0 && now < deadline
        })
        .map((s) => ({
          kind: "session" as const,
          id: s.id,
          date: s.sessionDate,
          start: s.sessionStart,
          end: s.sessionEnd,
          capacityLeft: s.capacity - s.booked,
          adultPriceTnd: parseFloat(s.adultPriceTnd),
          childPriceTnd: s.childPriceTnd ? parseFloat(s.childPriceTnd) : undefined,
        }))
      return { ok: true, options }
    })
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Erreur interne" }
  }
}
