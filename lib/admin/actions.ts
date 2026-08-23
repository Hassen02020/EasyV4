"use server"

/**
 * Server actions du back-office Easy2Book.
 *
 * Périmètre PR #3 :
 *  - `updateReservationStatus` : transition de statut atomique sur une
 *    réservation, avec validation de la transition (state machine simple),
 *    log dans `audit_events` et `revalidatePath`.
 *
 * Les actions exigent une session Supabase valide (le middleware bloque
 * déjà `/admin/*` aux anonymes, on re-vérifie ici pour les server actions
 * appelées en POST direct).
 */

import { revalidatePath } from "next/cache"
import { eq, and } from "drizzle-orm"
import { z } from "zod"
import { withTenantContext } from "@/lib/db/tenant-context"
import { reservations, reservationHotel, auditEvents } from "@/lib/db/schema"
import { createServerSupabase } from "@/lib/supabase/server"
import { sendBroadcast } from "@/lib/supabase/broadcast"
import { getCurrentAdminProfile } from "@/lib/auth/profile"
import { getMyGoClient } from "@/lib/mygo"
import { applyReservationRefund } from "@/lib/finance/refund-logic"
import { getReservationPaymentSummary } from "@/lib/finance/payment-summary"
import { logger } from "@/lib/logger"
import {
  classifyMyGoBookingError,
  describeMyGoCancellationErrorForUser,
} from "@/lib/booking/hotel-provider-booking"
import {
  RESERVATION_STATUSES,
  RESERVATION_STATUS_ALLOWED_ROLES,
  isTransitionAllowed,
  type ReservationStatus,
} from "./reservation-status"

const inputSchema = z.object({
  reservationId: z.string().uuid(),
  nextStatus: z.enum(RESERVATION_STATUSES),
})

export type UpdateStatusInput = z.infer<typeof inputSchema>

export type UpdateStatusResult =
  | {
      ok: true
      reservationId: string
      previousStatus: ReservationStatus
      nextStatus: ReservationStatus
    }
  | { ok: false; error: string }

export async function updateReservationStatus(
  raw: UpdateStatusInput,
): Promise<UpdateStatusResult> {
  const parsed = inputSchema.safeParse(raw)
  if (!parsed.success) {
    return { ok: false, error: "Entrée invalide" }
  }
  const { reservationId, nextStatus } = parsed.data

  if (!process.env.DATABASE_URL) {
    return { ok: false, error: "Base de données non configurée" }
  }

  const supabase = await createServerSupabase()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return { ok: false, error: "Session expirée" }
  }

  const profile = await getCurrentAdminProfile(user.id)
  if (!profile?.agencyId) {
    return { ok: false, error: "Profil administrateur introuvable ou non lié à une agence" }
  }
  // Phase 21.2 (P1) — même frontière que la page /admin/reservations
  // (jusqu'ici imposée seulement côté UI) : un changement de statut, y
  // compris une annulation qui déclenche un remboursement, exige un rôle
  // avec responsabilité réservation, jamais agent_compta/agent_excursions
  // ni un profil partenaire B2B en appelant directement cette action.
  if (!(RESERVATION_STATUS_ALLOWED_ROLES as readonly string[]).includes(profile.role)) {
    return { ok: false, error: "Votre rôle n'est pas autorisé à changer le statut d'une réservation." }
  }
  const agencyId = profile.agencyId

  const outcome = await withTenantContext(
    { agencyId, userId: user.id, isSuperAdmin: profile.role === "super_admin" },
    async (db) => {
      const current = await db
        .select({
          id: reservations.id,
          status: reservations.status,
          publicRef: reservations.publicRef,
          module: reservations.module,
          customerId: reservations.customerId,
        })
        .from(reservations)
        .where(
          and(
            eq(reservations.id, reservationId),
            eq(reservations.agencyId, agencyId),
          ),
        )
        .limit(1)

      const row = current[0]
      if (!row) {
        return { ok: false as const, error: "Réservation introuvable" }
      }

      const previousStatus = row.status as ReservationStatus
      if (!isTransitionAllowed(previousStatus, nextStatus)) {
        return {
          ok: false as const,
          error: `Transition interdite : ${previousStatus} → ${nextStatus}`,
        }
      }

      // --- Phase 21.1 (P0-2) — une réservation ne peut jamais être confirmée
      // tant qu'elle n'est pas intégralement payée. Seule source de vérité :
      // getReservationPaymentSummary (jamais depositPaid, jamais un SUM
      // recalculé ici, jamais un montant fourni par le client). Ce chemin
      // générique (dropdown /admin/reservations) n'avait jusqu'ici AUCUNE
      // vérification de paiement — contrairement à verifyManualPayment, qui
      // confirme déjà correctement sous cette même condition.
      if (nextStatus === "confirmed") {
        const summary = await getReservationPaymentSummary({
          reservationId,
          txOverride: db as Parameters<typeof getReservationPaymentSummary>[0]["txOverride"],
        })
        if (summary.paymentState !== "FULLY_PAID") {
          return {
            ok: false as const,
            error: `Confirmation refusée : paiement incomplet (${summary.paymentState}, restant ${summary.remainingTnd.toFixed(2)} DT). Une réservation ne peut être confirmée qu'une fois intégralement réglée.`,
          }
        }
      }

      const cancelledAt = nextStatus === "cancelled" ? new Date() : null

      // --- Annulation fournisseur (myGo) AVANT la transition de statut ---
      // Si cette réservation hôtel a été réellement confirmée auprès de myGo
      // (providerBookingId présent), on annule côté fournisseur d'abord : on
      // ne veut pas marquer "cancelled" en interne pendant que l'hôtel
      // attend toujours le client.
      let providerCancellationFee: number | undefined
      if (nextStatus === "cancelled" && row.module === "hotel") {
        const [hotelRow] = await db
          .select({ providerBookingId: reservationHotel.providerBookingId })
          .from(reservationHotel)
          .where(
            and(
              eq(reservationHotel.reservationId, reservationId),
              eq(reservationHotel.agencyId, agencyId),
            ),
          )
          .limit(1)

        if (hotelRow?.providerBookingId) {
          try {
            const cancellation = await getMyGoClient().cancelBooking({
              bookingId: Number(hotelRow.providerBookingId),
            })
            providerCancellationFee = cancellation.fee
          } catch (err) {
            // Annulation retry-safe côté fournisseur (idempotente) : on ne
            // change PAS le statut local, l'admin peut relancer sans risque
            // — contrairement à la création, une annulation ré-essayée est
            // sans danger (no-op si déjà annulée côté myGo).
            const kind = classifyMyGoBookingError(err)
            return {
              ok: false as const,
              error: describeMyGoCancellationErrorForUser(kind),
            }
          }
        }
      }

      await db
        .update(reservations)
        .set({
          status: nextStatus,
          updatedAt: new Date(),
          ...(cancelledAt ? { cancelledAt } : {}),
        })
        .where(
          and(
            eq(reservations.id, reservationId),
            eq(reservations.agencyId, agencyId),
          ),
        )

      // --- Intégrité paiement/ledger : une annulation ne doit jamais
      // laisser un paiement CAPTURÉ orphelin. Une réservation B2B (financée
      // par le crédit agence, jamais par `payments` — voir
      // lib/pro/booking-actions.ts) n'a simplement aucune ligne à
      // rembourser ici : NO_CAPTURED_PAYMENT est alors un no-op silencieux,
      // pas une erreur. Le remboursement, s'il y en a un, s'applique dans
      // la MÊME transaction que le changement de statut.
      let refundedTnd: number | undefined
      if (nextStatus === "cancelled") {
        const refund = await applyReservationRefund({
          tx: db,
          agencyId,
          reservationId,
          customerId: row.customerId,
          publicRef: row.publicRef,
          reason: "Annulation réservation (back-office)",
          actorUserId: user.id,
        })
        if (refund.ok) {
          refundedTnd = refund.refundedTnd
        } else if (refund.code !== "NO_CAPTURED_PAYMENT") {
          // Ne jamais `return` un échec ici : le statut a déjà été mis à
          // jour ci-dessus dans CETTE transaction — un `return` la
          // committerait quand même (seul un throw fait rollback). On
          // préfère throw pour annuler aussi le changement de statut plutôt
          // que de committer un statut "cancelled" incohérent avec un
          // remboursement en échec.
          throw new Error(refund.error)
        }
      }

      try {
        await db.insert(auditEvents).values({
          agencyId,
          actorUserId: user.id,
          entityType: "reservation",
          entityId: reservationId,
          action: "status_update",
          diff: {
            publicRef: row.publicRef,
            from: previousStatus,
            to: nextStatus,
            ...(providerCancellationFee != null
              ? { providerCancellationFeeTnd: providerCancellationFee }
              : {}),
            ...(refundedTnd != null ? { refundedTnd: refundedTnd.toFixed(2) } : {}),
          },
        })
      } catch {
        /* audit best-effort, on n'échoue pas la mutation pour ça */
      }

      return { ok: true as const, row, previousStatus }
    },
  ).catch((err: unknown) => {
    logger.error("[updateReservationStatus] transaction failed", { err })
    return { ok: false as const, error: "Échec de l'opération — aucune modification appliquée." }
  })

  if (!outcome.ok) {
    return { ok: false, error: outcome.error }
  }
  const { row, previousStatus } = outcome

  revalidatePath("/admin/reservations")
  revalidatePath("/admin")
  revalidatePath(`/booking/confirmation/${row.publicRef}`)

  // Notifie en live la page publique /booking/confirmation/[ref] qui ne peut
  // pas souscrire à `postgres_changes` (RLS bloque anon). Broadcast contourne
  // RLS car c'est un simple bus de messages, pas une lecture de table.
  await sendBroadcast({
    topic: `reservation-${row.publicRef}`,
    event: "status_change",
    payload: {
      publicRef: row.publicRef,
      previousStatus,
      nextStatus,
      at: Date.now(),
    },
  })

  return {
    ok: true,
    reservationId,
    previousStatus,
    nextStatus,
  }
}
