"use server"

/**
 * NETWORK-B2C-01 — réservation Network B2C (guest checkout public).
 *
 * Modèle exact de `lib/activities/guest-booking-actions.ts` adapté à la
 * table `products` (pas de sessions, pas d'adultes/enfants, quantité brute).
 *
 * Différences clés avec la réservation B2B (`product-booking-actions.ts`) :
 *  - `getDefaultAgencyId()` au lieu de `resolveSessionContext()`
 *  - Règlement via `getPaymentProvider()` (carte/virement/espèces) au lieu
 *    de `debitPartnerCredit`
 *  - Idempotence guest (`withGuestIdempotency`) et jeton d'accès
 *    (`guestAccessToken`)
 *  - Marge calculée sur le canal "direct" (vente publique OTA)
 *  - Référence publique `NET-YYYY-NNNNNN`
 *
 * Invariants financiers communs avec B2B (voir commentaire de tête de
 * `product-booking-actions.ts`) :
 *  - Entitlements économiques : supplier_node (coût réel) + seller_margin
 *    (marge nette commission) + easy2book (commission)
 *  - `costPrice` toujours en TND (hypothèse non vérifiée, même que B2B)
 */

import { eq, and, sql } from "drizzle-orm"
import type { DrizzleTransaction } from "@/lib/db/client"
import { withTenantContext } from "@/lib/db/tenant-context"
import {
  products,
  customers,
  reservations,
  reservationNetworkProduct,
  payments,
  auditEvents,
} from "@/lib/db/schema"
import { getDefaultAgencyId } from "@/lib/agencies/default-agency"
import { getMarginsForAgency } from "@/lib/pro/server-context"
import { applyMargin } from "@/lib/pro/pricing"
import { priceDrifted } from "@/lib/booking/pricing"
import { getPaymentProvider } from "@/lib/payment/provider"
import { withGuestIdempotency } from "@/lib/booking/guest-idempotency"
import { resolveLinkedAuthUserId } from "@/lib/booking/customer-identity"
import { recordReservationFinancials } from "@/lib/finance/reservation-financials"
import { creditPlatformCommission } from "@/lib/finance/platform-commission"
import { earnPendingPoints } from "@/lib/loyalty/rewards-core"
import { getReservationPaymentSummary } from "@/lib/finance/payment-summary"
import { recordReservationTransition } from "@/lib/admin/reservation-status-history"
import { sendEvent } from "@/lib/inngest/client"
import {
  networkGuestBookingSchema,
  type NetworkGuestBookingInput,
} from "./schemas"
import type { GuestPaymentMethod } from "@/lib/booking/guest-actions"

export type CreateGuestNetworkBookingResult =
  | {
      ok: true
      reservationId: string
      publicRef: string
      guestAccessToken: string
      status: "confirmed" | "pending"
    }
  | { ok: false; error: string; code?: string; currentTotalTnd?: number }

function pad(n: number, w = 6) {
  return String(n).padStart(w, "0")
}

class PaymentRejected extends Error {
  code?: string
  constructor(message: string, code?: string) {
    super(message)
    this.code = code
  }
}

/** CART-DRIFT-01 — prix recalculé côté serveur différent de ce que le client avait accepté. */
class PriceChanged extends Error {
  constructor(public readonly currentTotalTnd: number) {
    super("PRICE_CHANGED")
  }
}

export async function createGuestNetworkBooking(input: {
  booking: NetworkGuestBookingInput
  paymentMethod: GuestPaymentMethod
  /** CART-DRIFT-01 — montant que le client a vu avant de confirmer. */
  expectedTotalTnd?: number
}): Promise<CreateGuestNetworkBookingResult> {
  if (!process.env.DATABASE_URL) {
    return { ok: false, error: "Base de données non configurée" }
  }

  const parsed = networkGuestBookingSchema.safeParse(input.booking)
  if (!parsed.success) {
    return {
      ok: false,
      error:
        "Réservation invalide : " +
        parsed.error.errors.map((e) => e.message).join(", "),
    }
  }
  if (!["card", "transfer", "cash"].includes(input.paymentMethod)) {
    return {
      ok: false,
      error: "Mode de paiement invalide pour une réservation en ligne.",
    }
  }

  const booking = parsed.data

  const { createHash } = await import("node:crypto")
  const idempotencyKey = createHash("sha256")
    .update(
      JSON.stringify({
        productId: booking.productId,
        quantity: booking.quantity,
        travelerEmail: booking.traveler.email,
        paymentMethod: input.paymentMethod,
        expectedTotalTnd: input.expectedTotalTnd ?? null,
      }),
    )
    .digest("hex")

  const linkedAuthUserId = await resolveLinkedAuthUserId(booking.traveler.email)

  return withGuestIdempotency(idempotencyKey, () =>
    runCreateGuestNetworkBooking(
      booking,
      input.paymentMethod,
      linkedAuthUserId,
      input.expectedTotalTnd,
    ),
  )
}

async function runCreateGuestNetworkBooking(
  booking: NetworkGuestBookingInput,
  paymentMethod: GuestPaymentMethod,
  linkedAuthUserId: string | null,
  expectedTotalTnd: number | undefined,
): Promise<CreateGuestNetworkBookingResult> {
  const agencyId = await getDefaultAgencyId()
  if (!agencyId) {
    return {
      ok: false,
      error: "Aucune agence de vente directe n'est configurée pour le moment.",
    }
  }

  // Marge réelle canal "direct" (vente publique OTA) — même moteur que
  // hotel/flight/transfer/network B2B. Appelée AVANT la transaction.
  const directMarginRule = (await getMarginsForAgency(agencyId, "", "direct"))
    .network

  try {
    const result = await withTenantContext(
      { agencyId, userId: "", isSuperAdmin: false },
      async (tx) => {
        // --- 1. Produit ---
        const [product] = await tx
          .select()
          .from(products)
          .where(eq(products.id, booking.productId))
          .limit(1)
        if (!product)
          return { ok: false as const, error: "Produit introuvable" }
        if (product.status !== "active") {
          return {
            ok: false as const,
            error: "Ce produit n'est plus actif.",
            code: "PRODUCT_NOT_ACTIVE",
          }
        }
        if (!product.supplierNodeId || !product.costPrice) {
          return {
            ok: false as const,
            error: "Produit Network incomplet (coût/fournisseur manquant)",
          }
        }

        // NETWORK-NODE-VISIBILITY-01 — fonction SECURITY DEFINER (0083)
        const nodeRows = (await tx.execute(
          sql`SELECT network_product_node_is_active(${booking.productId}::uuid) AS "isActive"`,
        )) as Array<{ isActive: boolean }>
        if (nodeRows[0]?.isActive !== true) {
          return {
            ok: false as const,
            error: "Le nœud fournisseur de ce produit n'est pas actif",
          }
        }

        // --- 2. Prix de vente (coût × quantité + marge directe) ---
        const costPriceTnd = Number(product.costPrice) * booking.quantity
        const totalTnd = applyMargin(costPriceTnd, directMarginRule)

        // CART-DRIFT-01
        if (priceDrifted(expectedTotalTnd, totalTnd)) {
          throw new PriceChanged(totalTnd)
        }

        // --- 3. Règlement carte ---
        if (paymentMethod === "card") {
          const provider = getPaymentProvider()
          const paymentResult = await provider.createPayment({
            amountTnd: totalTnd,
            currency: "TND",
            reference: `guest-network-${Date.now()}`,
            description: `Produit Network — ${product.name}`,
            customerEmail: booking.traveler.email,
            customerFirstName: booking.traveler.firstName,
            customerLastName: booking.traveler.lastName,
            customerPhone: booking.traveler.phone,
          })
          if (!paymentResult.ok) {
            throw new PaymentRejected(
              paymentResult.message ?? "Le paiement n'a pas pu être traité.",
              paymentResult.code,
            )
          }
        }
        const isImmediatelyPaid = paymentMethod === "card"

        // --- 4. Client ---
        const [customer] = await tx
          .insert(customers)
          .values({
            agencyId,
            civility: booking.traveler.civility,
            firstName: booking.traveler.firstName,
            lastName: booking.traveler.lastName,
            email: booking.traveler.email,
            phone: booking.traveler.phone,
            civicId: booking.traveler.civicId,
            civicIdType: booking.traveler.civicIdType,
            birthDate: booking.traveler.birthDate || undefined,
            nationality: booking.traveler.nationality || undefined,
            authUserId: linkedAuthUserId ?? undefined,
          })
          .returning({ id: customers.id })
        const customerId = customer.id

        // --- 5. Réservation ---
        const publicRef = await nextNetworkPublicRef(tx, agencyId)
        const [reservation] = await tx
          .insert(reservations)
          .values({
            agencyId,
            customerId,
            publicRef,
            module: "network",
            source: "internal",
            status: "pending",
            originalCurrency: "TND",
            originalAmount: String(totalTnd),
            tndAmount: String(totalTnd),
            depositAmount: String(totalTnd),
            depositPaid: "0",
            providerPayload: {
              productId: booking.productId,
              quantity: booking.quantity,
              productName: product.name,
              channel: "b2c_guest",
              paymentMethod,
            },
          })
          .returning({
            id: reservations.id,
            guestAccessToken: reservations.guestAccessToken,
          })
        const reservationId = reservation.id
        const guestAccessToken = reservation.guestAccessToken

        if (isImmediatelyPaid) {
          await tx
            .update(reservations)
            .set({
              status: "confirmed",
              confirmedAt: new Date(),
              updatedAt: new Date(),
            })
            .where(eq(reservations.id, reservationId))

          await recordReservationTransition(tx, {
            reservationId,
            from: "pending",
            to: "confirmed",
            automated: true,
            reason:
              "Règlement carte immédiat à la création (guest network B2C)",
          })
        }

        await tx.insert(payments).values({
          agencyId,
          reservationId,
          psp: "manual",
          method: paymentMethod === "bank_deposit" ? "transfer" : paymentMethod,
          originalCurrency: "TND",
          originalAmount: totalTnd.toFixed(2),
          tndAmount: totalTnd.toFixed(2),
          kind: "deposit",
          status: isImmediatelyPaid ? "captured" : "pending",
          capturedAt: isImmediatelyPaid ? new Date() : undefined,
        })

        // --- 6. Snapshot financier (même structure que B2B Network) ---
        const marginAmountTnd = totalTnd - costPriceTnd
        const commissionRateForEntitlements =
          directMarginRule.commissionPercent ?? 0
        const commissionAmountForEntitlements =
          Math.round(
            marginAmountTnd * (commissionRateForEntitlements / 100) * 100,
          ) / 100

        const { commissionAmount } = await recordReservationFinancials({
          tx,
          reservationId,
          supplierPriceTnd: costPriceTnd,
          salePriceTnd: totalTnd,
          commissionPercent: directMarginRule.commissionPercent,
          marginRuleId: directMarginRule.ruleId,
          economicEntitlements: [
            {
              partyType: "supplier_node",
              partyId: product.supplierNodeId,
              role: "supplier",
              qualification: "supplier_cost",
              amount: costPriceTnd,
              basis: "coût fournisseur réel (products.cost_price × quantité)",
              ruleId: directMarginRule.ruleId ?? null,
              agreementId: directMarginRule.ruleId ?? null,
            },
            {
              partyType: "agency",
              partyId: agencyId,
              role: "seller",
              qualification: "seller_margin",
              amount: marginAmountTnd - commissionAmountForEntitlements,
              basis: `marge vendeur nette de commission (${
                directMarginRule.marginType === "percent"
                  ? `${directMarginRule.marginValue}%`
                  : `${directMarginRule.marginValue} TND`
              } − commission ${commissionRateForEntitlements}%)`,
              ruleId: directMarginRule.ruleId ?? null,
              agreementId: directMarginRule.ruleId ?? null,
            },
            {
              partyType: "easy2book",
              partyId: null,
              role: "easy2book",
              qualification: "commission",
              amount: commissionAmountForEntitlements,
              basis: `commission Easy2Book sur marge (${commissionRateForEntitlements}% × marge)`,
              ruleId: directMarginRule.ruleId ?? null,
              agreementId: directMarginRule.ruleId ?? null,
              cancellationTreatment: "non_refundable",
            },
          ],
        })

        await creditPlatformCommission(tx, {
          reservationId,
          commissionAmount,
          description: `Commission network B2C — réservation ${publicRef}`,
        })

        // Easy2Book Rewards — B2C uniquement, montant réellement capturé
        if (isImmediatelyPaid) {
          const rewardsSummary = await getReservationPaymentSummary({
            reservationId,
            txOverride: tx as Parameters<
              typeof getReservationPaymentSummary
            >[0]["txOverride"],
          })
          await earnPendingPoints(tx, {
            agencyId,
            customerId,
            reservationId,
            module: "network",
            eligibleTnd: rewardsSummary.collectedTnd,
            idempotencyKey: `earn-pending:${reservationId}`,
          })
        }

        // --- 7. Extension Network Product ---
        await tx.insert(reservationNetworkProduct).values({
          reservationId,
          productId: booking.productId,
          supplierNodeId: product.supplierNodeId,
          quantity: booking.quantity,
        })

        await tx.insert(auditEvents).values({
          agencyId,
          entityType: "reservation",
          entityId: reservationId,
          action: "network_booking.created",
          diff: {
            productId: booking.productId,
            quantity: booking.quantity,
            totalTnd,
            publicRef,
            via: "b2c_guest",
            paymentMethod,
          },
        })

        return {
          reservationId,
          publicRef,
          guestAccessToken,
          status: (isImmediatelyPaid ? "confirmed" : "pending") as
            | "confirmed"
            | "pending",
          productName: product.name,
          totalTnd,
        }
      },
    )

    if (!("reservationId" in result)) {
      return result
    }

    if (result.status === "confirmed" && booking.traveler.email) {
      sendEvent("booking/network.confirmed", {
        reservationId: result.reservationId,
        publicRef: result.publicRef,
        agencyId,
        productName: result.productName,
        quantity: booking.quantity,
        totalTnd: result.totalTnd,
        contactEmail: booking.traveler.email,
      }).catch(() => {
        /* fire-and-forget */
      })
    }

    return {
      ok: true as const,
      reservationId: result.reservationId as string,
      publicRef: result.publicRef as string,
      guestAccessToken: result.guestAccessToken as string,
      status: result.status as "confirmed" | "pending",
    }
  } catch (err) {
    if (err instanceof PaymentRejected) {
      return { ok: false, error: err.message, code: err.code }
    }
    if (err instanceof PriceChanged) {
      return {
        ok: false,
        error: `Le prix de ce produit a changé depuis votre consultation (${expectedTotalTnd?.toFixed(3)} DT → ${err.currentTotalTnd.toFixed(3)} DT). Merci de vérifier le nouveau montant avant de confirmer à nouveau.`,
        code: "PRICE_CHANGED",
        currentTotalTnd: err.currentTotalTnd,
      }
    }
    const msg = err instanceof Error ? err.message : String(err)
    return {
      ok: false,
      error: "Erreur interne lors de la création de la réservation.",
      code: "INTERNAL_ERROR",
    }
  }
}

async function nextNetworkPublicRef(
  tx: DrizzleTransaction,
  agencyId: string,
): Promise<string> {
  const year = new Date().getFullYear()
  const prefix = `NET-${year}-`
  const [row] = await tx
    .select({ maxRef: sql<string | null>`MAX(${reservations.publicRef})` })
    .from(reservations)
    .where(
      and(
        eq(reservations.agencyId, agencyId),
        sql`${reservations.publicRef} LIKE ${prefix + "%"}`,
      ),
    )
  const maxRef = row?.maxRef
  const max = maxRef ? Number(maxRef.slice(prefix.length)) : 0
  return `${prefix}${pad(Number.isFinite(max) ? max + 1 : 1)}`
}
