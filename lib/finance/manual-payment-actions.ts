"use server"

/**
 * Vérification staff d'un paiement manuel (cash / virement / dépôt bancaire
 * / mandat / wallet / pay-at-hotel) — Wallet/Payment Core, étendu Phase
 * 16.2 (Partial Payment Ledger) pour accepter un montant partiel.
 *
 * Ferme le gap trouvé en Phase 14.2 : `lib/admin/actions.ts::updateReservationStatus`
 * peut changer un statut mais ne crée jamais de trace financière ni ne
 * déclenche facture/voucher ; `reservation_validations` (schéma) n'est
 * référencée par aucun code applicatif. Cette action est le premier
 * appelant réel du principe "le staff NE PEUT PAS se contenter de changer
 * le statut" : elle enregistre un vrai `payments` (capturé), un
 * `auditEvents` (opérateur/méthode/référence/montant/horodatage), PUIS
 * seulement confirme la réservation (si le solde restant atteint zéro),
 * génère la facture et déclenche le voucher — dans cet ordre.
 *
 * Modèle de paiement partiel (Phase 16.2) : une réservation peut recevoir
 * PLUSIEURS captures (Wallet + virement + dépôt, par exemple) tant que
 * chaque tentative a sa propre clé d'idempotence (voir
 * `payments_capture_idempotency_uniq`, migration 0027) — la réservation
 * n'est confirmée QUE lorsque le solde restant (`getReservationPaymentSummary`,
 * calculé server-side, jamais fourni par le client) atteint zéro. Un
 * versement partiel laisse la réservation `pending` avec `paymentState:
 * "PARTIALLY_PAID"` — comportement additif, préserve le comportement
 * existant "paiement intégral requis pour confirmer".
 *
 * `wallet` route vers le VRAI moteur `debitCustomerWallet` (jamais un
 * aller-retour artificiel — voir la garde en tête de
 * lib/finance/customer-wallet.ts) ; les autres méthodes restent un
 * enregistrement `payments` + `auditEvents` direct, comme avant.
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
import { debitCustomerWallet } from "./customer-wallet"
import { getReservationPaymentSummary, TND_EPSILON, type PaymentState } from "./payment-summary"
import { pgErrorCode } from "@/lib/db/pg-error"
import {
  MANUAL_PAYMENT_ALLOWED_ROLES,
  toPaymentMethod,
  computeCaptureKind,
  isPastPaymentDeadline,
  type ManualPaymentMethod,
} from "./manual-payment-logic"

const inputSchema = z.object({
  reservationId: z.string().uuid(),
  method: z.enum(["cash", "transfer", "deposit", "mandate", "wallet", "at_hotel"]),
  /** Référence du règlement (n° bordereau, référence virement, mandat…). */
  reference: z.string().min(1).max(128),
  /** Montant réellement encaissé pour CETTE tentative — jamais le total de la réservation. */
  amountTnd: z.coerce.number().positive(),
})

export type VerifyManualPaymentInput = z.infer<typeof inputSchema>

export type VerifyManualPaymentResult =
  | {
      ok: true
      reservationId: string
      publicRef: string
      fullyPaid: boolean
      collectedTnd: number
      remainingTnd: number
      paymentState: PaymentState
    }
  | {
      ok: false
      error: string
      code?:
        | "EXPIRED"
        | "NOT_PENDING"
        | "UNAUTHORIZED"
        | "ALREADY_PROCESSED"
        | "AMOUNT_EXCEEDS_REMAINING"
        | "WALLET_INSUFFICIENT_FUNDS"
        | "INTERNAL_ERROR"
    }

/** Marqueur interne — distingue un échec de débit wallet (attendu) d'une
 * vraie erreur DB, même idiome que lib/booking/guest-actions.ts. Throw
 * délibéré pour faire ROLLBACK toute la transaction (y compris l'INSERT
 * `payments` déjà tenté) : un débit wallet raté ne doit jamais laisser une
 * ligne `payments` capturée orpheline. */
class ManualWalletDebitFailedError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message)
    this.name = "ManualWalletDebitFailedError"
  }
}

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

  let outcome: Extract<VerifyManualPaymentResult, { ok: true }> | Extract<VerifyManualPaymentResult, { ok: false }>
  try {
    outcome = await withTenantContext(
      { agencyId, userId: user.id, isSuperAdmin: profile.role === "super_admin" },
      async (tx) => {
        const [row] = await tx
          .select({
            id: reservations.id,
            status: reservations.status,
            publicRef: reservations.publicRef,
            tndAmount: reservations.tndAmount,
            paymentExpiresAt: reservations.paymentExpiresAt,
            customerId: reservations.customerId,
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

        // --- Solde restant calculé server-side, JAMAIS fourni par le client. ---
        const summaryBefore = await getReservationPaymentSummary({
          reservationId: row.id,
          txOverride: tx as Parameters<typeof getReservationPaymentSummary>[0]["txOverride"],
        })
        if (input.amountTnd > summaryBefore.remainingTnd + TND_EPSILON) {
          return {
            ok: false as const,
            code: "AMOUNT_EXCEEDS_REMAINING" as const,
            error: `Montant saisi (${input.amountTnd.toFixed(2)} DT) supérieur au solde restant (${summaryBefore.remainingTnd.toFixed(2)} DT).`,
          }
        }

        const remainingAfter = Math.max(summaryBefore.remainingTnd - input.amountTnd, 0)
        const fullyPaid = remainingAfter <= TND_EPSILON
        const idempotencyKey = `manual:${row.id}:${input.method}:${input.reference}`

        // Idempotence DB : payments_capture_idempotency_uniq (migration
        // 0027) rejette un 2ᵉ INSERT capturé pour la MÊME tentative
        // (même réservation + même clé) — double-clic / double
        // vérification concurrente — tout en acceptant un versement
        // légitimement différent (autre méthode/référence/montant).
        try {
          await tx.insert(payments).values({
            agencyId,
            reservationId: row.id,
            psp: "manual",
            method: toPaymentMethod(input.method as ManualPaymentMethod),
            pspTransactionId: input.reference,
            idempotencyKey,
            originalCurrency: "TND",
            originalAmount: input.amountTnd.toFixed(2),
            tndAmount: input.amountTnd.toFixed(2),
            kind: computeCaptureKind(remainingAfter, TND_EPSILON),
            status: "captured",
            capturedAt: new Date(),
          })
        } catch (err) {
          if (pgErrorCode(err) === "23505") {
            return {
              ok: false as const,
              code: "ALREADY_PROCESSED" as const,
              error: "Cette tentative de règlement a déjà été capturée — aucune double validation effectuée.",
            }
          }
          throw err
        }

        // --- Méthode "wallet" : vrai débit via le moteur existant. Un
        // échec ici doit annuler l'INSERT payments ci-dessus (throw →
        // ROLLBACK complet), jamais une ligne "captured" orpheline sans
        // débit réel derrière. ---
        if (input.method === "wallet") {
          const debit = await debitCustomerWallet({
            customerId: row.customerId,
            amountTnd: input.amountTnd,
            reservationId: row.id,
            description: `Règlement manuel wallet — réservation ${row.publicRef}`,
            txOverride: tx as Parameters<typeof debitCustomerWallet>[0]["txOverride"],
          })
          if (!debit.ok) {
            throw new ManualWalletDebitFailedError(debit.code, debit.message)
          }
        }

        if (fullyPaid) {
          await tx
            .update(reservations)
            .set({ status: "confirmed", confirmedAt: new Date(), updatedAt: new Date() })
            .where(eq(reservations.id, row.id))
        }

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
            amountTnd: input.amountTnd.toFixed(2),
            collectedTnd: (summaryBefore.collectedTnd + input.amountTnd).toFixed(2),
            remainingTnd: remainingAfter.toFixed(2),
            fullyPaid,
          },
        })

        return {
          ok: true as const,
          reservationId: row.id,
          publicRef: row.publicRef,
          fullyPaid,
          collectedTnd: summaryBefore.collectedTnd + input.amountTnd,
          remainingTnd: remainingAfter,
          paymentState: fullyPaid ? ("FULLY_PAID" as const) : ("PARTIALLY_PAID" as const),
        }
      },
    )
  } catch (err) {
    if (err instanceof ManualWalletDebitFailedError) {
      return {
        ok: false,
        code: "WALLET_INSUFFICIENT_FUNDS",
        error: err.code === "INSUFFICIENT_FUNDS" ? "Solde wallet client insuffisant pour ce règlement." : err.message,
      }
    }
    return {
      ok: false,
      code: "INTERNAL_ERROR",
      error: err instanceof Error ? `Échec transactionnel : ${err.message}` : "Échec transactionnel inattendu.",
    }
  }

  if (!outcome.ok) return outcome
  if (!outcome.fullyPaid) return outcome

  // --- Facture + voucher UNIQUEMENT quand le solde restant atteint zéro
  // (comportement préexistant préservé : jamais de facture/voucher pour un
  // acompte partiel) — hors transaction, best-effort : la réservation et
  // le paiement sont déjà commités, un échec ici ne doit jamais invalider
  // un règlement réellement reçu. ---
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
            guestAccessToken: reservations.guestAccessToken,
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
        guestAccessToken: detail.guestAccessToken,
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

  return outcome
}
