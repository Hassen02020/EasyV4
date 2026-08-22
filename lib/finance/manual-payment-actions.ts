"use server"

/**
 * Vérification staff d'un paiement manuel (cash / virement / dépôt bancaire)
 * — Wallet/Payment Core.
 *
 * Ferme le gap trouvé en Phase 14.2 : `lib/admin/actions.ts::updateReservationStatus`
 * peut changer un statut mais ne crée jamais de trace financière ni ne
 * déclenche facture/voucher ; `reservation_validations` (schéma) n'est
 * référencée par aucun code applicatif. Cette action est le premier
 * appelant réel du principe "le staff NE PEUT PAS se contenter de changer
 * le statut" : elle enregistre un vrai `payments` (capturé), un
 * `auditEvents` (opérateur/méthode/référence/montant/horodatage), PUIS
 * seulement confirme la réservation, génère la facture et déclenche le
 * voucher — dans cet ordre, dans la même transaction pour les deux
 * premières étapes.
 *
 * Ne touche PAS `wallet_accounts`/`wallet_ledger` : un règlement manuel
 * n'est pas un solde client préexistant, c'est de l'argent reçu de
 * l'extérieur pour CETTE réservation — `payments` (transaction) +
 * `auditEvents` (trace) EST le grand livre de ce règlement, pas un
 * aller-retour crédit/débit wallet artificiel (voir la garde en tête de
 * lib/finance/customer-wallet.ts).
 *
 * Idempotence : `payments_reservation_captured_uniq` (index unique partiel
 * sur `reservation_id` WHERE `status='captured'`, migration Wallet/Payment
 * Core) rejette un deuxième INSERT capturé pour la même réservation — un
 * double-clic ou une double vérification concurrente ne peut jamais créer
 * deux paiements capturés ni confirmer deux fois.
 */

import { eq, and } from "drizzle-orm"
import { z } from "zod"
import { withTenantContext } from "@/lib/db/tenant-context"
import {
  reservations,
  reservationHotel,
  customers,
  payments,
  auditEvents,
} from "@/lib/db/schema"
import { createServerSupabase } from "@/lib/supabase/server"
import { getCurrentAdminProfile } from "@/lib/auth/profile"
import { isTransitionAllowed } from "@/lib/admin/reservation-status"
import { generateInvoiceForReservation } from "./invoice-actions"
import { sendEvent } from "@/lib/inngest/client"
import {
  MANUAL_PAYMENT_ALLOWED_ROLES,
  toPaymentMethod,
  isPastPaymentDeadline,
} from "./manual-payment-logic"

const inputSchema = z.object({
  reservationId: z.string().uuid(),
  method: z.enum(["cash", "transfer", "deposit"]),
  /** Référence du règlement (n° bordereau, référence virement…). */
  reference: z.string().min(1).max(128),
})

export type VerifyManualPaymentInput = z.infer<typeof inputSchema>

export type VerifyManualPaymentResult =
  | { ok: true; reservationId: string; publicRef: string }
  | { ok: false; error: string; code?: "EXPIRED" | "NOT_PENDING" | "UNAUTHORIZED" | "ALREADY_PROCESSED" }

export async function verifyManualPayment(
  raw: VerifyManualPaymentInput,
): Promise<VerifyManualPaymentResult> {
  const parsed = inputSchema.safeParse(raw)
  if (!parsed.success) {
    return { ok: false, error: "Entrée invalide : " + parsed.error.errors.map((e) => e.message).join(", ") }
  }
  const input = parsed.data

  if (!process.env.DATABASE_URL) {
    return { ok: false, error: "Base de données non configurée" }
  }

  const supabase = await createServerSupabase()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: "Session expirée" }

  const profile = await getCurrentAdminProfile(user.id)
  if (!profile?.agencyId) {
    return { ok: false, error: "Profil administrateur introuvable ou non lié à une agence" }
  }
  if (!(MANUAL_PAYMENT_ALLOWED_ROLES as readonly string[]).includes(profile.role)) {
    return {
      ok: false,
      code: "UNAUTHORIZED",
      error: "Votre rôle n'est pas autorisé à valider un règlement manuel.",
    }
  }
  const agencyId = profile.agencyId

  const outcome = await withTenantContext(
    { agencyId, userId: user.id, isSuperAdmin: profile.role === "super_admin" },
    async (tx) => {
      const [row] = await tx
        .select({
          id: reservations.id,
          status: reservations.status,
          publicRef: reservations.publicRef,
          tndAmount: reservations.tndAmount,
          paymentExpiresAt: reservations.paymentExpiresAt,
        })
        .from(reservations)
        .where(and(eq(reservations.id, input.reservationId), eq(reservations.agencyId, agencyId)))
        .for("update")

      if (!row) {
        return { ok: false as const, error: "Réservation introuvable" }
      }

      // Expiration défensive server-authoritative — même si le cron
      // /api/cron/expire-pending-payments n'est pas encore passé, une
      // tentative de validation après le délai flippe explicitement le
      // statut plutôt que de valider un règlement hors délai.
      if (row.status === "pending" && isPastPaymentDeadline(row.paymentExpiresAt)) {
        await tx
          .update(reservations)
          .set({ status: "expired", updatedAt: new Date() })
          .where(eq(reservations.id, row.id))
        return {
          ok: false as const,
          code: "EXPIRED" as const,
          error: "Le délai de paiement (24h) est dépassé — cette réservation est expirée et ne peut plus être validée.",
        }
      }

      if (row.status !== "pending" || !isTransitionAllowed(row.status, "confirmed")) {
        return {
          ok: false as const,
          code: "NOT_PENDING" as const,
          error: `Impossible de valider un règlement : statut actuel "${row.status}" (attendu "pending").`,
        }
      }

      // Idempotence DB : payments_reservation_captured_uniq (migration
      // Wallet/Payment Core) rejette un 2ᵉ paiement capturé pour cette
      // réservation — double-clic / double vérification concurrente.
      try {
        await tx.insert(payments).values({
          agencyId,
          reservationId: row.id,
          psp: "manual",
          method: toPaymentMethod(input.method),
          pspTransactionId: input.reference,
          originalCurrency: "TND",
          originalAmount: row.tndAmount,
          tndAmount: row.tndAmount,
          kind: "deposit",
          status: "captured",
          capturedAt: new Date(),
        })
      } catch (err) {
        const pgErr = err as { code?: string }
        if (pgErr.code === "23505") {
          return {
            ok: false as const,
            code: "ALREADY_PROCESSED" as const,
            error: "Cette réservation a déjà un règlement capturé — aucune double validation effectuée.",
          }
        }
        throw err
      }

      await tx
        .update(reservations)
        .set({ status: "confirmed", confirmedAt: new Date(), updatedAt: new Date() })
        .where(eq(reservations.id, row.id))

      await tx.insert(auditEvents).values({
        agencyId,
        actorUserId: user.id,
        entityType: "reservation",
        entityId: row.id,
        action: "payment.manual_verified",
        diff: {
          publicRef: row.publicRef,
          method: input.method,
          reference: input.reference,
          amountTnd: row.tndAmount,
        },
      })

      return { ok: true as const, reservationId: row.id, publicRef: row.publicRef }
    },
  )

  if (!outcome.ok) return outcome

  // --- Facture + voucher (hors transaction, best-effort — mêmes garanties
  // que createReservationFromDraft/createGuestReservationFromDraft : la
  // réservation et le paiement sont déjà commités, un échec ici ne doit
  // jamais invalider un règlement réellement reçu). ---
  try {
    const invoiceResult = await generateInvoiceForReservation({
      agencyId,
      reservationId: outcome.reservationId,
      actorUserId: user.id,
    })
    if (!invoiceResult.ok) {
      console.error("[manual-payment] génération facture échouée", invoiceResult.error)
    }
  } catch (err) {
    console.error(
      "[manual-payment] génération facture échouée",
      err instanceof Error ? err.message : String(err),
    )
  }

  try {
    const [detail] = await withTenantContext(
      { agencyId, userId: user.id, isSuperAdmin: profile.role === "super_admin" },
      (tx) =>
        tx
          .select({
            module: reservations.module,
            tndAmount: reservations.tndAmount,
            customerEmail: customers.email,
            customerFirstName: customers.firstName,
            customerLastName: customers.lastName,
            customerPhone: customers.phone,
            hotelName: reservationHotel.hotelName,
            checkIn: reservationHotel.checkIn,
            checkOut: reservationHotel.checkOut,
            nights: reservationHotel.nights,
            adults: reservationHotel.adults,
            childrenAges: reservationHotel.childrenAges,
          })
          .from(reservations)
          .innerJoin(customers, eq(customers.id, reservations.customerId))
          .leftJoin(reservationHotel, eq(reservationHotel.reservationId, reservations.id))
          .where(eq(reservations.id, outcome.reservationId))
          .limit(1),
    )

    // Le handler voucher (processConfirmedBooking) n'existe que pour le
    // module hôtel — même garde que lib/booking/actions.ts/guest-actions.ts.
    if (detail?.module === "hotel" && detail.customerEmail && detail.hotelName) {
      await sendEvent("booking/confirmed", {
        reservationId: outcome.reservationId,
        publicRef: outcome.publicRef,
        agencyId,
        customerEmail: detail.customerEmail,
        customerName: `${detail.customerFirstName} ${detail.customerLastName}`.trim(),
        customerPhone: detail.customerPhone ?? "",
        hotelName: detail.hotelName,
        checkIn: detail.checkIn ?? "",
        checkOut: detail.checkOut ?? "",
        nights: detail.nights ?? 1,
        adults: detail.adults ?? 1,
        children: detail.childrenAges?.length ?? 0,
        totalTnd: Number.parseFloat(detail.tndAmount),
      }).catch(() => {
        /* fire-and-forget — le retry Inngest suffira */
      })
    }
  } catch (err) {
    console.error(
      "[manual-payment] déclenchement voucher échoué",
      err instanceof Error ? err.message : String(err),
    )
  }

  return { ok: true, reservationId: outcome.reservationId, publicRef: outcome.publicRef }
}
