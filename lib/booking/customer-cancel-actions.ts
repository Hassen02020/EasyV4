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
import {
  guestTenantContext,
  resolveMyGoAccessForTenant,
} from "@/lib/hotel-suppliers/tenant/live-resolution"
import {
  reservations,
  reservationHotel,
  customers,
  auditEvents,
} from "@/lib/db/schema"
import { createServerSupabase } from "@/lib/supabase/server"
import { getMyGoClient } from "@/lib/mygo"
import { applyReservationRefund } from "@/lib/finance/refund-logic"
import { ownedByCurrentCustomer } from "@/lib/booking/customer-identity"
import { formatTnd, parseTnd } from "@/lib/pro/booking-actions"
import {
  reverseEarnedPoints,
  reinstateRedeemedPoints,
} from "@/lib/loyalty/rewards-core"
import { recordCancellationFinancials } from "@/lib/finance/cancellation-financials"
import { reverseCommissionOnCancellation } from "@/lib/finance/commission-reversal"
import { recordReservationTransition } from "@/lib/admin/reservation-status-history"
import { logger } from "@/lib/logger"
import { cancel as cancelVirtualHotel } from "@/lib/hotels-monde/virtual-supplier/engine"

const CANCELLABLE_STATUSES = ["confirmed", "pending", "on_request"] as const

export type CancelMyReservationResult =
  | { ok: true; refundedTnd: number; feeTnd: number }
  | { ok: false; error: string; code?: string }

/**
 * Résultat de l'annulation B2C Hôtel Monde — distinct de
 * `CancelMyReservationResult` (myGo, feeTnd réel) : ici `feeTnd` est
 * toujours 0 (pas de frais calculés par le fournisseur virtuel dans cette
 * itération) et `supplierNotified` est toujours `false` — l'annulation
 * n'est PAS transmise au fournisseur réel automatiquement.
 */
export type CancelMyHotelMondeResult =
  | { ok: true; refundedTnd: number; feeTnd: 0; supplierNotified: boolean }
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
  if (!user?.email)
    return { ok: false, error: "NOT_AUTHENTICATED", code: "NOT_AUTHENTICATED" }

  const tenant = await guestTenantContext()
  if (!tenant)
    return { ok: false, error: "Aucune agence n'est configurée pour ce site." }

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
      .leftJoin(
        reservationHotel,
        eq(reservationHotel.reservationId, reservations.id),
      )
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

  if (!preCheck)
    return { ok: false, error: "Réservation introuvable.", code: "NOT_FOUND" }
  if (
    !CANCELLABLE_STATUSES.includes(
      preCheck.status as (typeof CANCELLABLE_STATUSES)[number],
    )
  ) {
    return {
      ok: false,
      error: `Cette réservation est déjà "${preCheck.status}" — impossible de l'annuler.`,
    }
  }
  if (preCheck.module !== "hotel" || !preCheck.providerBookingId) {
    return {
      ok: false,
      error:
        "Annulation non disponible pour cette réservation. Contactez le support.",
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
    const cancellation = await (
      myGoAccess.client ?? getMyGoClient()
    ).cancelBooking({
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
        .select({
          status: reservations.status,
          tndAmount: reservations.tndAmount,
        })
        .from(reservations)
        .where(eq(reservations.id, reservationId))
        .for("update")

      if (
        !locked ||
        !CANCELLABLE_STATUSES.includes(
          locked.status as (typeof CANCELLABLE_STATUSES)[number],
        )
      ) {
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

      await recordReservationTransition(tx, {
        reservationId,
        from: locked.status as (typeof CANCELLABLE_STATUSES)[number],
        to: "cancelled",
        triggeredBy: user.id,
        reason: "Annulation self-service client",
      })

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

      // Symétrique de reverseEarnedPoints ci-dessus, mais pour les points
      // DÉPENSÉS sur cette réservation (redeemPoints) — sans ceci, un client
      // qui annule une réservation contre laquelle il avait payé avec des
      // points perdait ces points définitivement. No-op silencieux si rien
      // n'avait été dépensé sur cette réservation.
      await reinstateRedeemedPoints(tx, {
        agencyId: tenant.agencyId ?? "",
        customerId: preCheck.customerId,
        reservationId,
        idempotencyKey: `reinstate:${reservationId}`,
        actorUserId: user.id,
      })

      const cancelledAt = new Date()
      const effectiveRefundTnd = refundResult.ok ? refundResult.refundedTnd : 0

      await recordCancellationFinancials({
        tx,
        reservationId,
        cancellationFeeTnd: feeTnd,
        refundAmountTnd: effectiveRefundTnd,
        reason: `Annulation client — frais fournisseur ${formatTnd(feeTnd)} DT`,
        cancelledAt,
      })

      await reverseCommissionOnCancellation(tx, {
        reservationId,
        publicRef: preCheck.publicRef,
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
        refundedTnd: effectiveRefundTnd,
        feeTnd,
      } as CancelMyReservationResult
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    if (msg === "ALREADY_CANCELLED_CONCURRENTLY") {
      return {
        ok: false,
        error:
          "Cette réservation vient d'être annulée par une autre action — rafraîchissez la page.",
      }
    }
    logger.error("[cancelMyHotelReservation] transaction failed", {
      reservationId,
      err: msg,
    })
    return {
      ok: false,
      error:
        "La réservation fournisseur a été annulée, mais l'enregistrement côté serveur a échoué. Contactez le support immédiatement avec la référence " +
        preCheck.publicRef +
        ".",
    }
  }
}

/**
 * Annulation B2C self-service pour les réservations Hôtel Monde
 * (`module = "hotel_monde"`).
 *
 * DIFFÉRENCES CLÉS par rapport à `cancelMyHotelReservation` (myGo) :
 *
 * 1. PAS d'appel au fournisseur virtuel — `offerId` n'est pas stocké en DB
 *    pour cette itération (`reservationHotel.providerBookingId` = numéro de
 *    confirmation, pas l'offerId requis par `cancel()`). L'annulation reste
 *    LOCALE à Easy2Book. Un TODO marqué ci-dessous trace le delta.
 *
 * 2. `supplierNotified: false` — TOUJOURS. Le résultat porte ce flag
 *    explicitement ; l'UI doit l'afficher honnêtement (jamais laisser
 *    croire que l'hôtel a confirmé l'annulation). L'admin est tracé via
 *    l'audit event (`supplierNotified: false` dans le diff) et doit
 *    transmettre la demande au fournisseur manuellement.
 *
 * 3. Remboursement conditionné par `cancellationPolicies.refundable`
 *    (figé à la réservation, jamais recalculé). Si non remboursable :
 *    `applyReservationRefund` N'EST PAS appelée (évite `creditCustomerWallet(0)`).
 *    Si remboursable : trois outcomes distincts —
 *      - `NO_CAPTURED_PAYMENT` → no-op (rien n'a été encaissé), annulation continue
 *      - `ok: true`            → remboursement réel, montant = `refundResult.refundedTnd`
 *      - autre erreur          → `throw` → rollback → réservation NON annulée
 *
 * 4. `feeTnd = 0` — pas de frais fournisseur dans cette itération.
 */
export async function cancelMyHotelMondeReservation(
  reservationId: string,
): Promise<CancelMyHotelMondeResult> {
  if (!process.env.DATABASE_URL) {
    return { ok: false, error: "Base de données non configurée" }
  }

  const supabase = await createServerSupabase()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user?.email)
    return { ok: false, error: "NOT_AUTHENTICATED", code: "NOT_AUTHENTICATED" }

  const tenant = await guestTenantContext()
  if (!tenant)
    return { ok: false, error: "Aucune agence n'est configurée pour ce site." }

  // ---------------------------------------------------------------------
  // 1. Pré-vérification hors verrou — appartenance, module, statut,
  //    politique de remboursement.
  // ---------------------------------------------------------------------
  const preCheck = await withTenantContext(tenant, async (tx) => {
    const [row] = await tx
      .select({
        id: reservations.id,
        publicRef: reservations.publicRef,
        module: reservations.module,
        status: reservations.status,
        customerId: reservations.customerId,
        cancellationPolicies: reservationHotel.cancellationPolicies,
        providerOfferId: reservationHotel.providerOfferId,
        checkIn: reservationHotel.checkIn,
        hotelRooms: reservationHotel.rooms,
      })
      .from(reservations)
      .innerJoin(customers, eq(reservations.customerId, customers.id))
      .leftJoin(
        reservationHotel,
        eq(reservationHotel.reservationId, reservations.id),
      )
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

  if (!preCheck)
    return { ok: false, error: "Réservation introuvable.", code: "NOT_FOUND" }
  if (
    !CANCELLABLE_STATUSES.includes(
      preCheck.status as (typeof CANCELLABLE_STATUSES)[number],
    )
  ) {
    return {
      ok: false,
      error: `Cette réservation est déjà "${preCheck.status}" — impossible de l'annuler.`,
    }
  }
  if (preCheck.module !== "hotel_monde") {
    return {
      ok: false,
      error:
        "Cette action ne s'applique qu'aux réservations Hôtel Monde. Contactez le support.",
    }
  }

  const policies = preCheck.cancellationPolicies as {
    refundable?: boolean
  } | null
  const refundable = policies?.refundable ?? false

  // ---------------------------------------------------------------------
  // 2. Transaction : re-vérifie sous verrou (anti double-clic), calcule
  //    le remboursement selon la politique figée, annule la réservation.
  //
  // ---------------------------------------------------------------------
  try {
    const result = await withTenantContext(tenant, async (tx) => {
      const [locked] = await tx
        .select({
          status: reservations.status,
          tndAmount: reservations.tndAmount,
        })
        .from(reservations)
        .where(eq(reservations.id, reservationId))
        .for("update")

      if (
        !locked ||
        !CANCELLABLE_STATUSES.includes(
          locked.status as (typeof CANCELLABLE_STATUSES)[number],
        )
      ) {
        throw new Error("ALREADY_CANCELLED_CONCURRENTLY")
      }

      // ------------------------------------------------------------------
      // Remboursement : trois outcomes selon la politique et l'état des
      // paiements.
      // ------------------------------------------------------------------
      let refundedTnd = 0

      if (refundable) {
        const refundResult = await applyReservationRefund({
          tx,
          agencyId: tenant.agencyId ?? "",
          reservationId,
          customerId: preCheck.customerId,
          publicRef: preCheck.publicRef,
          reason: "Annulation client Hôtel Monde",
          actorUserId: user.id,
          // amountTnd omis = remboursement total du montant remboursable
          // (borné par ce qui a réellement été encaissé moins les
          // remboursements déjà effectués — jamais supérieur).
        })

        if (refundResult.ok) {
          // Outcome 2 : remboursement réussi — montant RÉEL crédité.
          refundedTnd = refundResult.refundedTnd
        } else if (refundResult.code === "NO_CAPTURED_PAYMENT") {
          // Outcome 1 : rien n'a été encaissé — no-op légitime, annulation
          // continue sans remboursement (réservation "pending cash/transfer").
          refundedTnd = 0
        } else {
          // Outcome 3 : erreur de remboursement — rollback via throw,
          // réservation NON annulée, client peut réessayer.
          throw new Error(
            `REFUND_ERROR:${refundResult.code}:${refundResult.error}`,
          )
        }
      }
      // Si non remboursable : refundedTnd reste 0, pas d'appel à
      // applyReservationRefund (évite creditCustomerWallet(0)).

      await tx
        .update(reservations)
        .set({ status: "cancelled", cancelledAt: new Date() })
        .where(eq(reservations.id, reservationId))

      await recordReservationTransition(tx, {
        reservationId,
        from: locked.status as (typeof CANCELLABLE_STATUSES)[number],
        to: "cancelled",
        triggeredBy: user.id,
        reason: "Annulation self-service client Hôtel Monde",
      })

      await reverseEarnedPoints(tx, {
        agencyId: tenant.agencyId ?? "",
        customerId: preCheck.customerId,
        reservationId,
        idempotencyKey: `reverse:${reservationId}`,
        actorUserId: user.id,
      })

      await reinstateRedeemedPoints(tx, {
        agencyId: tenant.agencyId ?? "",
        customerId: preCheck.customerId,
        reservationId,
        idempotencyKey: `reinstate:${reservationId}`,
        actorUserId: user.id,
      })

      const cancelledAt = new Date()

      await recordCancellationFinancials({
        tx,
        reservationId,
        cancellationFeeTnd: 0,
        refundAmountTnd: refundedTnd,
        reason: "Annulation client Hôtel Monde",
        cancelledAt,
      })

      await reverseCommissionOnCancellation(tx, {
        reservationId,
        publicRef: preCheck.publicRef,
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
          module: "hotel_monde",
          refundedTnd,
          refundable,
          actor: "customer",
          supplierNotified: !!preCheck.providerOfferId,
          requiresSupplierAction: !preCheck.providerOfferId,
        },
      })

      return {
        ok: true as const,
        refundedTnd,
        feeTnd: 0 as const,
        supplierNotified: !!preCheck.providerOfferId,
      }
    })

    // Best-effort : libère l'inventaire virtuel (ne lève jamais).
    if (result.ok && preCheck.providerOfferId && preCheck.checkIn) {
      const rooms =
        (preCheck.hotelRooms as Array<{ quantity?: number }> | null)?.[0]
          ?.quantity ?? 1
      await cancelVirtualHotel({
        offerId: preCheck.providerOfferId,
        checkIn: preCheck.checkIn,
        rooms,
      })
    }

    return result
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    if (msg === "ALREADY_CANCELLED_CONCURRENTLY") {
      return {
        ok: false,
        error:
          "Cette réservation vient d'être annulée par une autre action — rafraîchissez la page.",
      }
    }
    if (msg.startsWith("REFUND_ERROR:")) {
      const parts = msg.split(":")
      logger.error("[cancelMyHotelMondeReservation] refund error", {
        reservationId,
        code: parts[1],
        detail: parts.slice(2).join(":"),
      })
      return {
        ok: false,
        code: parts[1],
        error:
          "Le remboursement a échoué — la réservation n'a pas été annulée. Réessayez ou contactez le support avec la référence " +
          preCheck.publicRef +
          ".",
      }
    }
    logger.error("[cancelMyHotelMondeReservation] transaction failed", {
      reservationId,
      err: msg,
    })
    return {
      ok: false,
      error:
        "L'annulation a échoué. Réessayez ou contactez le support avec la référence " +
        preCheck.publicRef +
        ".",
    }
  }
}
