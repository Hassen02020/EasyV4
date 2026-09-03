"use server"

/**
 * PHASE NEXT — Annulation B2C hôtel (compte client connecté).
 *
 * Ferme le trou P1 identifié à l'audit : `lib/booking/cancel-actions.ts::
 * cancelHotelReservation` existe déjà et fonctionne (frais = réponse myGo
 * réelle, jamais inventée ; crédit wallet ; verrou + idempotence), mais
 * n'est câblé QUE côté B2B (session partenaire, `getCurrentPartnerProfile`).
 * `/compte`/`/bookings` affichaient "l'annulation en ligne sera disponible
 * prochainement" — un placeholder honnête, pas une fonctionnalité cassée.
 *
 * Ce fichier réutilise EXACTEMENT le même mécanisme (I/O myGo hors
 * transaction, verrou `FOR UPDATE`, `applyReservationRefund` déjà partagé
 * avec le remboursement staff) pour un client B2C authentifié — seule
 * l'AUTORISATION diffère :
 *   - B2B (`cancelHotelReservation`) : scope = AGENCE entière (un partenaire
 *     gère toutes les réservations de son agence, légitimement).
 *   - Ici : scope = SA PROPRE réservation uniquement — vérifié par la MÊME
 *     règle que `app/actions/list-my-reservations.ts`
 *     (`customers.authUserId = session.user.id OU email vérifié`), jamais
 *     un accès élargi à l'agence. Un `reservationId` d'un autre client
 *     retombe sur `NOT_FOUND` (jamais un `FORBIDDEN` qui confirmerait son
 *     existence).
 *
 * Remboursement : crédite le wallet CLIENT (`applyReservationRefund` →
 * `creditCustomerWallet`) — jamais un remboursement carte réel (aucun PSP
 * réel branché, voir lib/finance/refund-logic.ts). `NO_CAPTURED_PAYMENT`
 * reste un no-op légitime (réservation jamais payée, ex. "cash"/"transfer"
 * encore `pending`) — l'annulation aboutit quand même, juste sans rien à
 * rembourser.
 *
 * Hors périmètre volontaire : annulation guest (non connecté, par token) —
 * `/compte` est déjà le point d'entrée sécurisé existant pour voir SES
 * réservations ; ajouter un second mécanisme d'autorisation par token pour
 * une action destructrice+financière n'est pas demandé et élargirait la
 * surface de risque sans nécessité démontrée.
 */

import { eq, and } from "drizzle-orm"
import { withTenantContext } from "@/lib/db/tenant-context"
import { guestTenantContext, resolveMyGoAccessForTenant } from "@/lib/hotel-suppliers/tenant/live-resolution"
import { reservations, reservationHotel, customers, auditEvents } from "@/lib/db/schema"
import { createServerSupabase } from "@/lib/supabase/server"
import { getMyGoClient } from "@/lib/mygo"
import { applyReservationRefund } from "@/lib/finance/refund-logic"
import { ownedByCurrentCustomer } from "@/lib/booking/customer-identity"
import { formatTnd, parseTnd } from "@/lib/pro/booking-actions"
import { reverseEarnedPoints } from "@/lib/loyalty/rewards-core"
import { logger } from "@/lib/logger"

const CANCELLABLE_STATUSES = ["confirmed", "pending", "on_request"] as const

export type CancelMyReservationResult =
  | { ok: true; refundedTnd: number; feeTnd: number }
  | { ok: false; error: string; code?: string }

export async function cancelMyHotelReservation(
  reservationId: string,
): Promise<CancelMyReservationResult> {
  if (!process.env.DATABASE_URL) {
    return { ok: false, error: "Base de données non configurée" }
  }

  const supabase = await createServerSupabase()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user?.email) return { ok: false, error: "NOT_AUTHENTICATED", code: "NOT_AUTHENTICATED" }

  const tenant = await guestTenantContext()
  if (!tenant) return { ok: false, error: "Aucune agence n'est configurée pour ce site." }

  // ---------------------------------------------------------------------
  // 1. Lecture hors verrou — appartenance vérifiée par la MÊME règle que
  //    listMyReservations() (authUserId OU email vérifié), jamais élargie à
  //    toute l'agence. Une réservation d'un autre client → NOT_FOUND.
  // ---------------------------------------------------------------------
  const preCheck = await withTenantContext(tenant, async (tx) => {
    const [row] = await tx
      .select({
        id: reservations.id,
        publicRef: reservations.publicRef,
        module: reservations.module,
        status: reservations.status,
        customerId: reservations.customerId,
        providerBookingId: reservationHotel.providerBookingId,
      })
      .from(reservations)
      .innerJoin(customers, eq(reservations.customerId, customers.id))
      .leftJoin(reservationHotel, eq(reservationHotel.reservationId, reservations.id))
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
    return row ?? null
  })

  if (!preCheck) return { ok: false, error: "Réservation introuvable.", code: "NOT_FOUND" }
  if (!CANCELLABLE_STATUSES.includes(preCheck.status as (typeof CANCELLABLE_STATUSES)[number])) {
    return {
      ok: false,
      error: `Cette réservation est déjà "${preCheck.status}" — impossible de l'annuler.`,
    }
  }
  if (preCheck.module !== "hotel" || !preCheck.providerBookingId) {
    return {
      ok: false,
      error: "Annulation non disponible pour cette réservation. Contactez le support.",
    }
  }

  // ---------------------------------------------------------------------
  // 2. Annulation réelle myGo — hors transaction (I/O réseau), compte
  //    fournisseur du TENANT résolu (jamais le client global si un compte
  //    tenant est configuré). Le montant des frais retourné par myGo fait
  //    foi — jamais un pourcentage inventé.
  // ---------------------------------------------------------------------
  const myGoAccess = await resolveMyGoAccessForTenant(tenant)
  const bookingId = Number(preCheck.providerBookingId)
  let feeTnd = 0
  try {
    const cancellation = await (myGoAccess.client ?? getMyGoClient()).cancelBooking({
      bookingId,
      currency: "TND",
    })
    feeTnd = cancellation.fee
  } catch (err) {
    logger.error("[cancelMyHotelReservation] myGo cancelBooking failed", {
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
  // 3. Transaction : re-vérifie sous verrou (anti double-clic), rembourse
  //    le wallet CLIENT via le canal déjà partagé avec le remboursement
  //    staff (applyReservationRefund — jamais une seconde logique de
  //    crédit), met à jour la réservation.
  // ---------------------------------------------------------------------
  try {
    return await withTenantContext(tenant, async (tx) => {
      const [locked] = await tx
        .select({ status: reservations.status, tndAmount: reservations.tndAmount })
        .from(reservations)
        .where(eq(reservations.id, reservationId))
        .for("update")

      if (!locked || !CANCELLABLE_STATUSES.includes(locked.status as (typeof CANCELLABLE_STATUSES)[number])) {
        throw new Error("ALREADY_CANCELLED_CONCURRENTLY")
      }

      const tndAmount = parseTnd(locked.tndAmount)
      const refundTnd = Math.max(0, tndAmount - feeTnd)

      // NO_CAPTURED_PAYMENT reste un no-op légitime (rien n'a encore été
      // payé, ex. "cash"/"transfer" pending) — l'annulation continue quand
      // même, juste sans rien à créditer.
      const refundResult = await applyReservationRefund({
        tx,
        agencyId: tenant.agencyId ?? "",
        reservationId,
        customerId: preCheck.customerId,
        publicRef: preCheck.publicRef,
        reason: `Annulation client — frais fournisseur ${formatTnd(feeTnd)} DT`,
        actorUserId: user.id,
        amountTnd: refundTnd,
      })
      if (!refundResult.ok && refundResult.code !== "NO_CAPTURED_PAYMENT") {
        throw new Error(refundResult.error)
      }

      await tx
        .update(reservations)
        .set({ status: "cancelled", cancelledAt: new Date() })
        .where(eq(reservations.id, reservationId))

      // Easy2Book Rewards (Phase 38D) — reprise des points gagnés (pending
      // ou déjà available) sur cette réservation, même transaction que
      // l'annulation. No-op silencieux si rien n'avait été gagné (module non
      // éligible, ou réservation encore `pending` jamais confirmée).
      await reverseEarnedPoints(tx, {
        agencyId: tenant.agencyId ?? "",
        customerId: preCheck.customerId,
        reservationId,
        idempotencyKey: `reverse:${reservationId}`,
        actorUserId: user.id,
      })

      await tx.insert(auditEvents).values({
        agencyId: tenant.agencyId ?? "",
        actorUserId: user.id,
        entityType: "reservation",
        entityId: reservationId,
        action: "reservation.cancelled",
        diff: {
          publicRef: preCheck.publicRef,
          bookingId,
          feeTnd,
          refundTnd,
          actor: "customer",
        },
      })

      return {
        ok: true,
        refundedTnd: refundResult.ok ? refundResult.refundedTnd : 0,
        feeTnd,
      } as CancelMyReservationResult
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    if (msg === "ALREADY_CANCELLED_CONCURRENTLY") {
      return {
        ok: false,
        error: "Cette réservation vient d'être annulée par une autre action — rafraîchissez la page.",
      }
    }
    logger.error("[cancelMyHotelReservation] transaction failed", { reservationId, err: msg })
    return {
      ok: false,
      error:
        "La réservation fournisseur a été annulée, mais l'enregistrement côté serveur a échoué. Contactez le support immédiatement avec la référence " +
        preCheck.publicRef +
        ".",
    }
  }
}
