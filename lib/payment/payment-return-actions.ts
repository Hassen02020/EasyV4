"use server"

/**
 * Page de retour générique après un paiement en ligne redirect-based (SPS/
 * Paymee/Stripe Checkout) — voir app/paiement-retour/[ref]/page.tsx.
 *
 * Contrairement à `virtual-checkout-actions.ts::getVirtualPaymentSession`
 * (qui exige `status==="pending"` car la page va ENSUITE simuler une
 * issue), cette action est un simple LOOKUP en lecture : elle ne modifie
 * jamais rien et fonctionne quel que soit le statut du paiement (déjà
 * capturé si le webhook a gagné la course contre le retour navigateur, ou
 * toujours pending sinon) — la page `/booking/confirmation/[ref]` vers
 * laquelle on redirige affiche déjà correctement les deux cas (voir QA live
 * Paiement B2C réel). Ne confirme jamais rien elle-même : le webhook signé
 * reste l'unique source de vérité, un retour navigateur sur cette page ne
 * fait jamais gagner une confirmation par lui-même.
 */

import { eq, and } from "drizzle-orm"
import { withSystemContext } from "@/lib/db/tenant-context"
import { payments, reservations } from "@/lib/db/schema"

export type PaymentReturnTarget =
  | { ok: true; publicRef: string; guestAccessToken: string }
  | { ok: false; error: string }

export async function getPaymentReturnTarget(ref: string): Promise<PaymentReturnTarget> {
  if (!process.env.DATABASE_URL) {
    return { ok: false, error: "Base de données non configurée" }
  }

  const [row] = await withSystemContext((tx) =>
    tx
      .select({
        publicRef: reservations.publicRef,
        guestAccessToken: reservations.guestAccessToken,
      })
      .from(payments)
      .innerJoin(reservations, eq(reservations.id, payments.reservationId))
      .where(and(eq(payments.pspOrderId, ref), eq(payments.method, "card")))
      .limit(1),
  )

  if (!row) {
    return { ok: false, error: "Paiement introuvable." }
  }

  return { ok: true, publicRef: row.publicRef, guestAccessToken: row.guestAccessToken }
}
