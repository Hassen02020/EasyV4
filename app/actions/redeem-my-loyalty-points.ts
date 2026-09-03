"use server"

/**
 * Easy2Book Rewards (Phase 38E) — rédemption client authentifié, `/compte`.
 *
 * Gap confirmé à l'audit : `redeemPoints` (lib/loyalty/rewards-core.ts)
 * existait depuis la Phase 38D mais n'était câblé nulle part côté client —
 * aucune action, aucune UI. Reste un mouvement de GRAND LIVRE uniquement
 * (voir la doc de tête de rewards-core.ts) : ne modifie jamais
 * `reservations.tndAmount`/`payments`/le montant réellement facturé,
 * `tndEquivalent` renvoyé est purement informatif — brancher ceci au
 * montant réellement encaissé au checkout reste explicitement HORS
 * PÉRIMÈTRE V1.
 *
 * Autorisation : même garde que `cancelMyHotelReservation`/
 * `cancelPolicyReservationCore` — appartenance de la réservation CIBLE
 * vérifiée par `ownedByCurrentCustomer` (authUserId OU email vérifié),
 * jamais élargie à toute l'agence, jamais un FORBIDDEN qui confirmerait
 * l'existence d'une réservation d'autrui (NOT_FOUND à la place).
 *
 * Montant éligible : recalculé serveur via `getReservationPaymentSummary`
 * DANS la même transaction — jamais un montant fourni par le client, jamais
 * un prix d'affichage. Le compte fidélité débité est celui du
 * `customerId` propriétaire RÉEL de la réservation cible (colonne
 * `reservations.customer_id`) — pas une agrégation multi-lignes `customers`
 * comme `getMyLoyaltySummary()`/`getMyLoyaltyHistory()` (affichage
 * seulement) : une rédemption doit débiter un compte précis et unique,
 * jamais un total agrégé ambigu.
 *
 * Idempotence : le client fournit un `idempotencyKey` (UUID généré côté UI
 * à l'ouverture du formulaire, renvoyé identique en cas de retry réseau —
 * même convention que `createGuestReservationFromDraft`), préfixé ici par
 * la réservation cible pour éviter toute collision inter-réservations.
 */

import { z } from "zod"
import { withTenantContext } from "@/lib/db/tenant-context"
import { guestTenantContext } from "@/lib/hotel-suppliers/tenant/live-resolution"
import { reservations, customers } from "@/lib/db/schema"
import { eq, and } from "drizzle-orm"
import { createServerSupabase } from "@/lib/supabase/server"
import { ownedByCurrentCustomer } from "@/lib/booking/customer-identity"
import { getReservationPaymentSummary } from "@/lib/finance/payment-summary"
import { redeemPoints } from "@/lib/loyalty/rewards-core"

const inputSchema = z.object({
  reservationId: z.string().uuid(),
  points: z.number().int().positive(),
  idempotencyKey: z.string().uuid(),
})

export type RedeemMyLoyaltyPointsInput = z.infer<typeof inputSchema>

export type RedeemMyLoyaltyPointsResult =
  | { ok: true; points: number; tndEquivalent: number }
  | { ok: false; error: string; code?: string }

export async function redeemMyLoyaltyPoints(
  raw: RedeemMyLoyaltyPointsInput,
): Promise<RedeemMyLoyaltyPointsResult> {
  const parsed = inputSchema.safeParse(raw)
  if (!parsed.success) {
    return { ok: false, error: "Entrée invalide." }
  }
  const { reservationId, points, idempotencyKey } = parsed.data

  if (!process.env.DATABASE_URL) {
    return { ok: false, error: "Service temporairement indisponible." }
  }

  const supabase = await createServerSupabase()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user?.email) {
    return { ok: false, error: "Session expirée — reconnectez-vous.", code: "NOT_AUTHENTICATED" }
  }

  const tenant = await guestTenantContext()
  if (!tenant) {
    return { ok: false, error: "Aucune agence n'est configurée pour ce site." }
  }

  try {
    return await withTenantContext(tenant, async (tx) => {
      const [row] = await tx
        .select({ id: reservations.id, customerId: reservations.customerId })
        .from(reservations)
        .innerJoin(customers, eq(reservations.customerId, customers.id))
        .where(
          and(
            eq(reservations.id, reservationId),
            ownedByCurrentCustomer({
              agencyId: tenant.agencyId ?? "",
              authUserId: user.id,
              verifiedEmail: user.email!,
            }),
          ),
        )
        .limit(1)

      if (!row) {
        return { ok: false, error: "Réservation introuvable.", code: "NOT_FOUND" }
      }

      // Montant éligible recalculé serveur, net de tout remboursement déjà
      // appliqué — jamais un prix d'affichage ni une valeur fournie par le
      // client (même contrat que earn/convert — voir doc de tête
      // rewards-core.ts).
      const paymentSummary = await getReservationPaymentSummary({
        reservationId,
        txOverride: tx as Parameters<typeof getReservationPaymentSummary>[0]["txOverride"],
      })

      const result = await redeemPoints(tx, {
        agencyId: tenant.agencyId ?? "",
        customerId: row.customerId,
        targetReservationId: reservationId,
        targetReservationEligibleTnd: paymentSummary.collectedTnd,
        pointsToRedeem: points,
        idempotencyKey: `redeem:${reservationId}:${idempotencyKey}`,
        actorUserId: user.id,
      })

      if (!result.ok) {
        return { ok: false, error: result.error, code: result.code }
      }
      return { ok: true, points: result.points, tndEquivalent: result.tndEquivalent }
    })
  } catch (err) {
    console.error("[redeemMyLoyaltyPoints]", err)
    return { ok: false, error: "Erreur technique. Veuillez réessayer." }
  }
}
