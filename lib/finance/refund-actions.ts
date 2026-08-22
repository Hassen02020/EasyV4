"use server"

/**
 * Remboursement staff — Wallet/Payment Core.
 *
 * Périmètre volontairement minimal et honnête : rembourse un paiement
 * CAPTURÉ (carte, wallet, ou manuel déjà vérifié) en créditant le solde
 * wallet du CLIENT (lib/finance/customer-wallet.ts — jamais une agence),
 * lié au paiement/réservation d'origine. N'émet AUCUN virement/
 * remboursement carte réel — ce projet n'a pas d'adaptateur PSP réel
 * (lib/payment/provider.ts) capable de rembourser un vrai paiement carte ;
 * inventer cet appel serait fabriquer une réponse fournisseur. Le
 * remboursement "physique" (virement retour, espèces) reste manuel côté
 * staff, hors périmètre de cette action — seul le crédit wallet + la
 * traçabilité comptable sont automatisés ici.
 */

import { eq, and } from "drizzle-orm"
import { z } from "zod"
import { withTenantContext } from "@/lib/db/tenant-context"
import { reservations, payments, auditEvents } from "@/lib/db/schema"
import { createServerSupabase } from "@/lib/supabase/server"
import { getCurrentAdminProfile } from "@/lib/auth/profile"
import { isTransitionAllowed } from "@/lib/admin/reservation-status"
import { creditCustomerWallet } from "./customer-wallet"

const ALLOWED_ROLES = ["super_admin", "manager", "agent_compta"] as const

const inputSchema = z.object({
  reservationId: z.string().uuid(),
  reason: z.string().min(1).max(500),
})

export type RefundReservationInput = z.infer<typeof inputSchema>

export type RefundReservationResult =
  | { ok: true; reservationId: string; publicRef: string; refundedTnd: string }
  | { ok: false; error: string; code?: "UNAUTHORIZED" | "NOT_REFUNDABLE" | "NO_CAPTURED_PAYMENT" }

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
      if (!isTransitionAllowed(reservation.status, "refunded")) {
        return {
          ok: false as const,
          code: "NOT_REFUNDABLE" as const,
          error: `Statut actuel "${reservation.status}" : remboursement impossible depuis cet état.`,
        }
      }

      const [payment] = await tx
        .select({ id: payments.id, tndAmount: payments.tndAmount, refundedAmount: payments.refundedAmount })
        .from(payments)
        .where(
          and(
            eq(payments.reservationId, reservation.id),
            eq(payments.agencyId, agencyId),
            eq(payments.status, "captured"),
          ),
        )
        .for("update")

      if (!payment) {
        return {
          ok: false as const,
          code: "NO_CAPTURED_PAYMENT" as const,
          error: "Aucun paiement capturé trouvé pour cette réservation — rien à rembourser.",
        }
      }

      await tx
        .update(payments)
        .set({ status: "refunded", refundedAmount: payment.tndAmount, refundedAt: new Date(), updatedAt: new Date() })
        .where(eq(payments.id, payment.id))

      await tx
        .update(reservations)
        .set({ status: "refunded", updatedAt: new Date() })
        .where(eq(reservations.id, reservation.id))

      const credit = await creditCustomerWallet({
        customerId: reservation.customerId,
        amountTnd: Number.parseFloat(payment.tndAmount),
        reservationId: reservation.id,
        paymentId: payment.id,
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
        diff: { publicRef: reservation.publicRef, amountTnd: payment.tndAmount, reason: input.reason },
      })

      return { ok: true as const, reservationId: reservation.id, publicRef: reservation.publicRef, refundedTnd: payment.tndAmount }
    },
  )

  return outcome
}
