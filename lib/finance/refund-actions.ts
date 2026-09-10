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

import { eq, and } from "drizzle-orm"
import { z } from "zod"
import { withTenantContext } from "@/lib/db/tenant-context"
import { reservations } from "@/lib/db/schema"
import { createServerSupabase } from "@/lib/supabase/server"
import { getCurrentAdminProfile } from "@/lib/auth/profile"
import { isTransitionAllowed } from "@/lib/admin/reservation-status"
import { applyReservationRefund, REFUND_ALLOWED_ROLES } from "./refund-logic"

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
  const isSuperAdmin = profile.role === "super_admin"

  const outcome = await withTenantContext(
    { agencyId: isSuperAdmin ? null : profile.agencyId, userId: user.id, isSuperAdmin },
    async (tx) => {
      // Un super_admin doit pouvoir rembourser N'IMPORTE QUELLE réservation
      // (Vue consolidée /admin/reservations, cross-agence), pas seulement
      // celles de sa propre agence "domicile" — voir même correctif sur
      // lib/admin/actions.ts::updateReservationStatus. L'agence utilisée
      // ensuite pour `applyReservationRefund` est celle RÉELLE de la
      // réservation (`reservation.agencyId`), jamais `profile.agencyId`.
      const [reservation] = await tx
        .select({
          id: reservations.id,
          status: reservations.status,
          publicRef: reservations.publicRef,
          customerId: reservations.customerId,
          agencyId: reservations.agencyId,
        })
        .from(reservations)
        .where(
          isSuperAdmin
            ? eq(reservations.id, input.reservationId)
            : and(eq(reservations.id, input.reservationId), eq(reservations.agencyId, profile.agencyId)),
        )
        .for("update")

      if (!reservation) return { ok: false as const, error: "Réservation introuvable" }
      const agencyId = reservation.agencyId

      const result = await applyReservationRefund({
        tx,
        agencyId,
        reservationId: reservation.id,
        customerId: reservation.customerId,
        publicRef: reservation.publicRef,
        reason: input.reason,
        actorUserId: user.id,
        amountTnd: input.amountTnd,
        checkFullRefundAllowed: () =>
          isTransitionAllowed(reservation.status, "refunded")
            ? { ok: true }
            : {
                ok: false,
                error: `Statut actuel "${reservation.status}" : remboursement total impossible depuis cet état.`,
              },
      })
      if (!result.ok) {
        return { ok: false as const, code: result.code, error: result.error }
      }
      const { refundedTnd, fullyRefunded } = result

      if (fullyRefunded) {
        await tx
          .update(reservations)
          .set({ status: "refunded", updatedAt: new Date() })
          .where(eq(reservations.id, reservation.id))
      }

      return {
        ok: true as const,
        reservationId: reservation.id,
        publicRef: reservation.publicRef,
        refundedTnd: refundedTnd.toFixed(2),
        fullyRefunded,
      }
    },
  )

  return outcome
}
