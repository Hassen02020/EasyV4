"use server"

/**
 * Annulation B2C — Omra / Package / Activity (Policy Engine).
 *
 * Mécanisme COMMUN aux 3 produits — une seule implémentation, pas une par
 * module. Reprend le squelette déjà validé pour l'hôtel
 * (`lib/booking/customer-cancel-actions.ts::cancelMyHotelReservation`) :
 * authentification Supabase, appartenance vérifiée par
 * `ownedByCurrentCustomer` (jamais élargie à toute l'agence, une
 * réservation d'un autre client retombe sur `NOT_FOUND` jamais un
 * `FORBIDDEN` qui confirmerait son existence), verrou `FOR UPDATE`
 * anti-double-clic, crédit via `applyReservationRefund` (jamais un second
 * mécanisme de crédit, jamais un PSP — "Crédit Easy2Book" uniquement).
 *
 * Différence avec l'hôtel : la SOURCE du calcul n'est jamais un appel
 * fournisseur (myGo) mais le `policySnapshot` FIGÉ dans
 * `reservations.providerPayload` au moment de la réservation (voir
 * lib/booking/policy-engine.ts) — jamais une résolution live de la
 * politique, pour ne jamais modifier rétroactivement ce qu'un client a
 * accepté. `evaluateCancellation()` ne calcule QUE ce que ce snapshot
 * contient explicitement — aucun frais ni remboursement n'est jamais
 * inventé ici.
 *
 * Libération de stock (`releaseStock`) : inverse mécanique du décrément
 * fait à la création (chaque `*-guest-booking-actions.ts`) — pas une règle
 * métier, une correction de cohérence d'inventaire sans laquelle une place
 * annulée ne redeviendrait jamais réservable.
 */

import { eq, and } from "drizzle-orm"
import type { DrizzleTransaction } from "@/lib/db/client"
import { withTenantContext, type TenantContext } from "@/lib/db/tenant-context"
import { guestTenantContext } from "@/lib/hotel-suppliers/tenant/live-resolution"
import {
  reservations,
  reservationOmra,
  reservationPackage,
  reservationActivity,
  omraAllotments,
  catalogPackageDepartures,
  catalogActivitySessions,
  customers,
  auditEvents,
} from "@/lib/db/schema"
import { createServerSupabase } from "@/lib/supabase/server"
import { applyReservationRefund } from "@/lib/finance/refund-logic"
import { ownedByCurrentCustomer } from "@/lib/booking/customer-identity"
import { evaluateCancellation, type PolicySnapshot } from "@/lib/booking/policy-engine"
import { formatTnd, parseTnd } from "@/lib/pro/booking-actions"
import { logger } from "@/lib/logger"

const CANCELLABLE_STATUSES = ["confirmed", "pending", "on_request"] as const
const CANCELLABLE_MODULES = ["omra", "package", "activity"] as const
type CancellableModule = (typeof CANCELLABLE_MODULES)[number]

export type CancelPolicyReservationResult =
  | {
      ok: true
      allowed: true
      creditedTnd: number
      feePercent: number | null
      /** Libellés d'affichage exacts requis — jamais reformulés côté UI. */
      messages: string[]
    }
  | {
      ok: true
      allowed: false
      reason: string
      messages: string[]
    }
  | { ok: false; error: string; code?: string }

export async function cancelMyPolicyReservation(
  reservationId: string,
): Promise<CancelPolicyReservationResult> {
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

  return cancelPolicyReservationCore(tenant, { authUserId: user.id, verifiedEmail: user.email }, reservationId)
}

/**
 * Cœur testable, isolé de la résolution de session Supabase (même pattern
 * que `ownedByCurrentCustomer`/`resolveOrCreateLinkedCustomer` — voir
 * lib/booking/customer-identity.ts) : l'identité déjà résolue est passée en
 * paramètre plutôt que lue depuis une session live, testable directement
 * contre une vraie transaction DB sans session Supabase.
 */
export async function cancelPolicyReservationCore(
  tenant: TenantContext,
  identity: { authUserId: string; verifiedEmail: string },
  reservationId: string,
): Promise<CancelPolicyReservationResult> {
  const actorUserId = identity.authUserId

  // ---------------------------------------------------------------------
  // 1. Lecture hors verrou — appartenance vérifiée par la MÊME règle que
  //    listMyReservations()/cancelMyHotelReservation (authUserId OU email
  //    vérifié), jamais élargie à toute l'agence.
  // ---------------------------------------------------------------------
  const preCheck = await withTenantContext(tenant, async (tx) => {
    const [row] = await tx
      .select({
        id: reservations.id,
        publicRef: reservations.publicRef,
        module: reservations.module,
        status: reservations.status,
        customerId: reservations.customerId,
        tndAmount: reservations.tndAmount,
        providerPayload: reservations.providerPayload,
      })
      .from(reservations)
      .innerJoin(customers, eq(reservations.customerId, customers.id))
      .where(
        and(
          eq(reservations.id, reservationId),
          ownedByCurrentCustomer({
            agencyId: tenant.agencyId ?? "",
            authUserId: identity.authUserId,
            verifiedEmail: identity.verifiedEmail,
          }),
        ),
      )
      .limit(1)
    return row ?? null
  })

  if (!preCheck) return { ok: false, error: "Réservation introuvable.", code: "NOT_FOUND" }
  if (!CANCELLABLE_MODULES.includes(preCheck.module as CancellableModule)) {
    return {
      ok: false,
      error: "Ce module de réservation n'est pas géré par ce mécanisme d'annulation.",
    }
  }
  if (!CANCELLABLE_STATUSES.includes(preCheck.status as (typeof CANCELLABLE_STATUSES)[number])) {
    return {
      ok: false,
      error: `Cette réservation est déjà "${preCheck.status}" — impossible de l'annuler.`,
    }
  }

  // ---------------------------------------------------------------------
  // 2. Évaluation à partir du snapshot FIGÉ à la réservation — jamais une
  //    résolution live (voir doc de tête).
  // ---------------------------------------------------------------------
  const providerPayload = (preCheck.providerPayload ?? {}) as { policySnapshot?: PolicySnapshot }
  const snapshot = providerPayload.policySnapshot ?? null
  const tndAmount = parseTnd(preCheck.tndAmount)
  const outcome = evaluateCancellation(snapshot, tndAmount)

  if (!outcome.allowed) {
    return {
      ok: true,
      allowed: false,
      reason: outcome.reason ?? "Annulation non autorisée selon la politique.",
      messages: ["Annulation non autorisée selon la politique"],
    }
  }

  // ---------------------------------------------------------------------
  // 3. Transaction : re-vérifie sous verrou (anti double-clic), rembourse
  //    le wallet CLIENT via le canal déjà partagé (applyReservationRefund),
  //    libère le stock, met à jour la réservation.
  // ---------------------------------------------------------------------
  try {
    return await withTenantContext(tenant, async (tx) => {
      const [locked] = await tx
        .select({ status: reservations.status })
        .from(reservations)
        .where(eq(reservations.id, reservationId))
        .for("update")

      if (!locked || !CANCELLABLE_STATUSES.includes(locked.status as (typeof CANCELLABLE_STATUSES)[number])) {
        throw new Error("ALREADY_CANCELLED_CONCURRENTLY")
      }

      const refundResult = await applyReservationRefund({
        tx,
        agencyId: tenant.agencyId ?? "",
        reservationId,
        customerId: preCheck.customerId,
        publicRef: preCheck.publicRef,
        reason:
          outcome.feePercent != null
            ? `Annulation client — frais configurés ${outcome.feePercent}%`
            : "Annulation client",
        actorUserId,
        amountTnd: outcome.creditableTnd ?? 0,
      })
      if (!refundResult.ok && refundResult.code !== "NO_CAPTURED_PAYMENT") {
        throw new Error(refundResult.error)
      }

      await tx
        .update(reservations)
        .set({ status: "cancelled", cancelledAt: new Date() })
        .where(eq(reservations.id, reservationId))

      await releaseStock(tx, preCheck.module as CancellableModule, reservationId)

      const creditedTnd = refundResult.ok ? refundResult.refundedTnd : 0

      await tx.insert(auditEvents).values({
        agencyId: tenant.agencyId ?? "",
        actorUserId,
        entityType: "reservation",
        entityId: reservationId,
        action: "reservation.cancelled",
        diff: {
          publicRef: preCheck.publicRef,
          feePercent: outcome.feePercent,
          creditedTnd,
          actor: "customer",
          via: "policy_engine",
        },
      })

      const messages = ["Annulation acceptée"]
      if (outcome.feePercent != null && outcome.feePercent > 0) {
        messages.push(`Frais configurés: ${outcome.feePercent}%`)
      }
      messages.push(`Crédit Easy2Book: ${formatTnd(creditedTnd)} DT`)

      return {
        ok: true,
        allowed: true,
        creditedTnd,
        feePercent: outcome.feePercent,
        messages,
      } as CancelPolicyReservationResult
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    if (msg === "ALREADY_CANCELLED_CONCURRENTLY") {
      return {
        ok: false,
        error: "Cette réservation vient d'être annulée par une autre action — rafraîchissez la page.",
      }
    }
    logger.error("[cancelMyPolicyReservation] transaction failed", { reservationId, err: msg })
    return {
      ok: false,
      error:
        "Erreur lors de l'annulation. Contactez le support avec la référence " + preCheck.publicRef + ".",
    }
  }
}

async function releaseStock(
  tx: DrizzleTransaction,
  module: CancellableModule,
  reservationId: string,
): Promise<void> {
  if (module === "omra") {
    const [ext] = await tx
      .select({
        omraPackageId: reservationOmra.omraPackageId,
        departureDate: reservationOmra.departureDate,
        pilgrims: reservationOmra.pilgrims,
      })
      .from(reservationOmra)
      .where(eq(reservationOmra.reservationId, reservationId))
      .limit(1)
    if (!ext) return
    const [allotment] = await tx
      .select()
      .from(omraAllotments)
      .where(
        and(
          eq(omraAllotments.packageId, ext.omraPackageId),
          eq(omraAllotments.departureDate, ext.departureDate),
        ),
      )
      .limit(1)
      .for("update")
    if (!allotment) return
    await tx
      .update(omraAllotments)
      .set({
        reservedCount: Math.max(0, allotment.reservedCount - ext.pilgrims),
        availableCount: allotment.availableCount + ext.pilgrims,
        updatedAt: new Date(),
      })
      .where(eq(omraAllotments.id, allotment.id))
    return
  }

  if (module === "package") {
    const [ext] = await tx
      .select({
        departureId: reservationPackage.departureId,
        adults: reservationPackage.adults,
        childrenAges: reservationPackage.childrenAges,
      })
      .from(reservationPackage)
      .where(eq(reservationPackage.reservationId, reservationId))
      .limit(1)
    if (!ext) return
    const paxCount = ext.adults + (ext.childrenAges?.length ?? 0)
    const [departure] = await tx
      .select()
      .from(catalogPackageDepartures)
      .where(eq(catalogPackageDepartures.id, ext.departureId))
      .limit(1)
      .for("update")
    if (!departure) return
    await tx
      .update(catalogPackageDepartures)
      .set({ bookedSeats: Math.max(0, departure.bookedSeats - paxCount) })
      .where(eq(catalogPackageDepartures.id, departure.id))
    return
  }

  const [ext] = await tx
    .select({
      sessionId: reservationActivity.sessionId,
      adults: reservationActivity.adults,
      children: reservationActivity.children,
    })
    .from(reservationActivity)
    .where(eq(reservationActivity.reservationId, reservationId))
    .limit(1)
  if (!ext) return
  const paxCount = ext.adults + ext.children
  const [session] = await tx
    .select()
    .from(catalogActivitySessions)
    .where(eq(catalogActivitySessions.id, ext.sessionId))
    .limit(1)
    .for("update")
  if (!session) return
  await tx
    .update(catalogActivitySessions)
    .set({ booked: Math.max(0, session.booked - paxCount) })
    .where(eq(catalogActivitySessions.id, session.id))
}
