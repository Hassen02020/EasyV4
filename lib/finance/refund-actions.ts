"use server"

/**
 * Remboursement staff — Wallet/Payment Core, étendu Phase 16.2 (Partial
 * Payment Ledger) pour un remboursement partiel.
 *
 * Périmètre volontairement minimal et honnête : rembourse un ou plusieurs
 * paiements CAPTURÉS (carte, wallet, ou manuel déjà vérifié — désormais
 * potentiellement PLUSIEURS lignes par réservation, voir
 * lib/finance/payment-summary.ts) en créditant le solde wallet du CLIENT
 * (lib/finance/customer-wallet.ts — jamais une agence), lié à la
 * réservation d'origine. N'émet AUCUN virement/remboursement carte réel —
 * ce projet n'a pas d'adaptateur PSP réel (lib/payment/provider.ts)
 * capable de rembourser un vrai paiement carte ; inventer cet appel
 * serait fabriquer une réponse fournisseur. Le remboursement "physique"
 * (virement retour, espèces) reste manuel côté staff, hors périmètre de
 * cette action — seul le crédit wallet + la traçabilité comptable sont
 * automatisés ici.
 *
 * Remboursement partiel (`amountTnd` fourni) : consomme les lignes
 * `payments` remboursables (captured/partial_refund) dans l'ordre de
 * capture, ligne par ligne, jusqu'à épuiser le montant demandé — chaque
 * ligne garde son propre `refundedAmount` honnête (jamais un remboursement
 * global déconnecté des lignes réelles). `partial_refund` (valeur d'enum
 * déjà déclarée, jamais utilisée avant cette phase) marque une ligne
 * partiellement consommée ; `refunded` une ligne intégralement consommée.
 * Le statut de la RÉSERVATION ne passe à `refunded` que si ce
 * remboursement épuise la totalité du montant remboursable (cohérent avec
 * la Phase 16.1 : le statut de réservation reste indépendant de l'état de
 * paiement, sauf transition explicite déjà existante).
 */

import { eq, and, inArray, asc } from "drizzle-orm"
import { z } from "zod"
import { withTenantContext } from "@/lib/db/tenant-context"
import { reservations, payments, auditEvents } from "@/lib/db/schema"
import { createServerSupabase } from "@/lib/supabase/server"
import { getCurrentAdminProfile } from "@/lib/auth/profile"
import { isTransitionAllowed } from "@/lib/admin/reservation-status"
import { creditCustomerWallet } from "./customer-wallet"
import { TND_EPSILON } from "./payment-summary"
import { allocateRefund } from "./refund-allocation"
import { REFUND_ALLOWED_ROLES } from "./refund-logic"

const ALLOWED_ROLES = REFUND_ALLOWED_ROLES

const inputSchema = z.object({
  reservationId: z.string().uuid(),
  reason: z.string().min(1).max(500),
  /** Omis = remboursement total du montant encore remboursable. */
  amountTnd: z.coerce.number().positive().optional(),
})

export type RefundReservationInput = z.infer<typeof inputSchema>

export type RefundReservationResult =
  | { ok: true; reservationId: string; publicRef: string; refundedTnd: string; fullyRefunded: boolean }
  | {
      ok: false
      error: string
      code?: "UNAUTHORIZED" | "NOT_REFUNDABLE" | "NO_CAPTURED_PAYMENT" | "AMOUNT_EXCEEDS_CAPTURED"
    }

export async function refundReservation(
  raw: RefundReservationInput,
): Promise<RefundReservationResult> {
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
  if (!(ALLOWED_ROLES as readonly string[]).includes(profile.role)) {
    return { ok: false, code: "UNAUTHORIZED", error: "Votre rôle n'est pas autorisé à effectuer un remboursement." }
  }
  const agencyId = profile.agencyId

  const outcome = await withTenantContext(
    { agencyId, userId: user.id, isSuperAdmin: profile.role === "super_admin" },
    async (tx) => {
      const [reservation] = await tx
        .select({
          id: reservations.id,
          status: reservations.status,
          publicRef: reservations.publicRef,
          customerId: reservations.customerId,
        })
        .from(reservations)
        .where(and(eq(reservations.id, input.reservationId), eq(reservations.agencyId, agencyId)))
        .for("update")

      if (!reservation) return { ok: false as const, error: "Réservation introuvable" }

      // Verrouille TOUTES les lignes remboursables (captured ou déjà
      // partiellement remboursées) — plus une seule ligne supposée
      // (Phase 16.2 : une réservation peut avoir plusieurs captures).
      const refundableRows = await tx
        .select({ id: payments.id, tndAmount: payments.tndAmount, refundedAmount: payments.refundedAmount })
        .from(payments)
        .where(
          and(
            eq(payments.reservationId, reservation.id),
            eq(payments.agencyId, agencyId),
            inArray(payments.status, ["captured", "partial_refund"]),
          ),
        )
        .orderBy(asc(payments.capturedAt))
        .for("update")

      const allocation = allocateRefund(refundableRows, input.amountTnd, TND_EPSILON)
      if (!allocation.ok) {
        return { ok: false as const, code: allocation.code, error: allocation.error }
      }
      const { requestedTnd, fullyRefunded, updates } = allocation

      if (fullyRefunded && !isTransitionAllowed(reservation.status, "refunded")) {
        return {
          ok: false as const,
          code: "NOT_REFUNDABLE" as const,
          error: `Statut actuel "${reservation.status}" : remboursement total impossible depuis cet état.`,
        }
      }

      // Applique l'allocation ligne par ligne — chaque ligne garde son
      // propre refundedAmount honnête (voir lib/finance/refund-allocation.ts).
      for (const update of updates) {
        await tx
          .update(payments)
          .set({
            refundedAmount: update.newRefundedAmount.toFixed(2),
            status: update.newStatus,
            refundedAt: new Date(),
            updatedAt: new Date(),
          })
          .where(eq(payments.id, update.id))
      }

      if (fullyRefunded) {
        await tx
          .update(reservations)
          .set({ status: "refunded", updatedAt: new Date() })
          .where(eq(reservations.id, reservation.id))
      }

      const credit = await creditCustomerWallet({
        customerId: reservation.customerId,
        amountTnd: requestedTnd,
        reservationId: reservation.id,
        description: `Remboursement réservation ${reservation.publicRef} — ${input.reason}`,
        source: "refund",
        txOverride: tx as Parameters<typeof creditCustomerWallet>[0]["txOverride"],
      })
      if (!credit.ok) {
        throw new Error(`Échec du crédit wallet client : ${credit.message}`)
      }

      await tx.insert(auditEvents).values({
        agencyId,
        actorUserId: user.id,
        entityType: "reservation",
        entityId: reservation.id,
        action: "payment.refunded",
        diff: {
          publicRef: reservation.publicRef,
          amountTnd: requestedTnd.toFixed(2),
          fullyRefunded,
          reason: input.reason,
        },
      })

      return {
        ok: true as const,
        reservationId: reservation.id,
        publicRef: reservation.publicRef,
        refundedTnd: requestedTnd.toFixed(2),
        fullyRefunded,
      }
    },
  )

  return outcome
}
