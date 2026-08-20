"use server"

/**
 * Annulation + remboursement d'une réservation hôtel confirmée — flux
 * jusqu'ici totalement absent de l'UI (bouton "Annulation" dans
 * `components/pro/partner-reservations-table.tsx` sans aucun `onClick`,
 * et aucune server action de cancel post-confirmation n'existait :
 * `getMyGoClient().cancelBooking()` n'était utilisé qu'en compensation
 * interne, best-effort, à l'intérieur de `createReservationFromDraft` en
 * cas d'échec juste après confirmation myGo — jamais déclenchable par un
 * partenaire pour une réservation déjà confirmée et payée).
 *
 * Pattern de verrouillage identique à `lib/pro/booking-actions.ts::debitPartnerCredit`
 * (SELECT ... FOR UPDATE, écriture du solde exclusivement via
 * `set_agency_deposit_balance()`, jamais `tx.update(agencies)` — voir le
 * commentaire détaillé là-bas). NEVER DELETE FINANCIAL TRANSACTIONS : le
 * remboursement est un nouveau mouvement `refund` (+), jamais une
 * suppression/modification du débit d'origine.
 *
 * Portée volontairement limitée au module hôtel avec un vrai
 * `providerBookingId` myGo — pour tout autre cas (module non hôtel, ou
 * réservation créée sans confirmation myGo réelle, ex. le flux fixture
 * `/pro/hotels` documenté comme risque séparé), on renvoie une erreur
 * explicite plutôt que d'inventer une logique de remboursement sans base
 * fournisseur réelle.
 */

import { eq, sql } from "drizzle-orm"
import { withTenantContext } from "@/lib/db/tenant-context"
import {
  reservations,
  reservationHotel,
  partnerCreditMovements,
  auditEvents,
  agencies,
  type NewPartnerCreditMovement,
} from "@/lib/db/schema"
import { getCurrentPartnerProfile } from "@/lib/auth/partner-profile"
import { createServerSupabase } from "@/lib/supabase/server"
import { getMyGoClient } from "@/lib/mygo"
import { formatTnd, parseTnd } from "@/lib/pro/booking-actions"
import { logger } from "@/lib/logger"

const CANCELLABLE_STATUSES = ["confirmed", "pending", "on_request"] as const

export type CancelReservationResult =
  | {
      ok: true
      refundedTnd: number
      feeTnd: number
      newBalanceTnd: string
    }
  | { ok: false; error: string }

export async function cancelHotelReservation(
  reservationId: string,
): Promise<CancelReservationResult> {
  const supabase = await createServerSupabase()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: "NOT_AUTHENTICATED" }

  const profile = await getCurrentPartnerProfile(user.id)
  if (!profile) return { ok: false, error: "FORBIDDEN" }

  if (!process.env.DATABASE_URL) {
    return { ok: false, error: "Base de données non configurée" }
  }

  // ---------------------------------------------------------------------
  // 1. Lecture (hors verrou) — confirme le module, le statut annulable, et
  //    récupère l'id de réservation fournisseur myGo requis pour annuler.
  //    `withTenantContext` scope déjà la requête à `profile.agency.id` — un
  //    partenaire ne peut jamais lire/annuler la réservation d'une autre
  //    agence, quel que soit le `reservationId` fourni.
  // ---------------------------------------------------------------------
  const preCheck = await withTenantContext(
    { agencyId: profile.agency.id, userId: user.id, isSuperAdmin: false },
    async (tx) => {
      const [row] = await tx
        .select({
          id: reservations.id,
          publicRef: reservations.publicRef,
          module: reservations.module,
          status: reservations.status,
          tndAmount: reservations.tndAmount,
          providerBookingId: reservationHotel.providerBookingId,
        })
        .from(reservations)
        .leftJoin(
          reservationHotel,
          eq(reservationHotel.reservationId, reservations.id),
        )
        .where(eq(reservations.id, reservationId))
        .limit(1)
      return row ?? null
    },
  )

  if (!preCheck) return { ok: false, error: "RESERVATION_NOT_FOUND" }
  if (!CANCELLABLE_STATUSES.includes(preCheck.status as (typeof CANCELLABLE_STATUSES)[number])) {
    return {
      ok: false,
      error: `Cette réservation est déjà "${preCheck.status}" — impossible de l'annuler.`,
    }
  }
  if (preCheck.module !== "hotel" || !preCheck.providerBookingId) {
    return {
      ok: false,
      error:
        "Annulation non disponible pour cette réservation (module non hôtel ou aucune confirmation fournisseur réelle associée). Contactez le support.",
    }
  }

  // ---------------------------------------------------------------------
  // 2. Annulation réelle côté myGo — appelée HORS transaction DB (I/O
  //    réseau, ne doit jamais tenir un verrou de ligne pendant l'attente).
  //    Le montant des frais d'annulation retourné par myGo fait foi — on
  //    n'invente jamais nous-mêmes un pourcentage de pénalité.
  // ---------------------------------------------------------------------
  const bookingId = Number(preCheck.providerBookingId)
  let feeTnd = 0
  try {
    const cancellation = await getMyGoClient().cancelBooking({
      bookingId,
      currency: "TND",
    })
    feeTnd = cancellation.fee
  } catch (err) {
    logger.error("[cancelHotelReservation] myGo cancelBooking failed", {
      reservationId,
      bookingId,
      err: err instanceof Error ? err.message : String(err),
    })
    return {
      ok: false,
      error:
        "L'annulation auprès du fournisseur hôtelier a échoué. Réessayez ou contactez le support avant de réessayer pour éviter une double annulation.",
    }
  }

  // ---------------------------------------------------------------------
  // 3. Transaction : re-vérifie le statut sous verrou (anti double-clic /
  //    anti double-annulation concurrente), calcule le remboursement,
  //    crédite le wallet via le canal sanctionné, met à jour la réservation.
  // ---------------------------------------------------------------------
  try {
    return await withTenantContext(
      { agencyId: profile.agency.id, userId: user.id, isSuperAdmin: false },
      async (tx) => {
        const [locked] = await tx
          .select({ status: reservations.status, tndAmount: reservations.tndAmount })
          .from(reservations)
          .where(eq(reservations.id, reservationId))
          .for("update")

        if (
          !locked ||
          !CANCELLABLE_STATUSES.includes(
            locked.status as (typeof CANCELLABLE_STATUSES)[number],
          )
        ) {
          // La réservation myGo est déjà annulée à ce stade (étape 2) même
          // si cette course très improbable se produit — on ne peut pas
          // revenir en arrière côté fournisseur, mais on ne double-crédite
          // jamais un remboursement déjà appliqué par un appel concurrent.
          throw new Error("ALREADY_CANCELLED_CONCURRENTLY")
        }

        const tndAmount = parseTnd(locked.tndAmount)
        const refundTnd = Math.max(0, tndAmount - feeTnd)

        let newBalanceTnd = ""
        if (refundTnd >= 0.001) {
          const [agency] = await tx
            .select({
              id: agencies.id,
              depositBalance: agencies.depositBalance,
            })
            .from(agencies)
            .where(eq(agencies.id, profile.agency.id))
            .for("update")

          const currentBalance = parseTnd(agency.depositBalance)
          const newBalance = currentBalance + refundTnd
          newBalanceTnd = formatTnd(newBalance)

          const movement: NewPartnerCreditMovement = {
            agencyId: profile.agency.id,
            movementType: "refund",
            amount: formatTnd(refundTnd),
            balanceAfter: newBalanceTnd,
            reference: `REFUND-${preCheck.publicRef}`,
            description: `Remboursement annulation réservation ${preCheck.publicRef} (frais myGo : ${formatTnd(feeTnd)} DT)`,
            reservationId,
            createdByUserId: user.id,
          }
          await tx.insert(partnerCreditMovements).values(movement)

          // Seul canal autorisé pour écrire agencies.deposit_balance — voir
          // lib/pro/booking-actions.ts::debitPartnerCredit pour le pourquoi
          // (agencies n'a pas de policy RLS UPDATE tenant, uniquement
          // is_super_admin() ; set_agency_deposit_balance() fait sa propre
          // vérification current_agency_id() = p_agency_id en interne).
          await tx.execute(
            sql`SELECT set_agency_deposit_balance(${profile.agency.id}::uuid, ${newBalanceTnd}::numeric)`,
          )
        }

        await tx
          .update(reservations)
          .set({ status: "cancelled", cancelledAt: new Date() })
          .where(eq(reservations.id, reservationId))

        await tx.insert(auditEvents).values({
          agencyId: profile.agency.id,
          actorUserId: user.id,
          entityType: "reservation",
          entityId: reservationId,
          action: "reservation.cancelled",
          diff: {
            publicRef: preCheck.publicRef,
            bookingId,
            feeTnd,
            refundTnd,
          },
        })

        return {
          ok: true,
          refundedTnd: refundTnd,
          feeTnd,
          newBalanceTnd,
        } as CancelReservationResult
      },
    )
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    if (msg === "ALREADY_CANCELLED_CONCURRENTLY") {
      return {
        ok: false,
        error:
          "Cette réservation vient d'être annulée par une autre action — rafraîchissez la page.",
      }
    }
    logger.error("[cancelHotelReservation] transaction failed", {
      reservationId,
      err: msg,
    })
    return {
      ok: false,
      error:
        "La réservation fournisseur a été annulée, mais l'enregistrement du remboursement a échoué côté serveur. Contactez le support immédiatement avec la référence " +
        preCheck.publicRef +
        ".",
    }
  }
}
