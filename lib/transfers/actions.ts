/**
 * Server Actions — Module Transferts (Sprint 3B)
 *
 * createTransferBooking : réservation atomique de transfert
 *   - Calcul du prix (via pricing.ts)
 *   - Débit wallet atomique (FOR UPDATE)
 *   - Création réservation générique + extension Transfer
 *   - Historisation comptable (audit)
 *
 * Sécurité :
 *   - Transaction SQL atomique
 *   - Verrou FOR UPDATE sur wallet
 *   - Rollback complet si erreur
 */

"use server"

import { eq, and, sql } from "drizzle-orm"
import { runInTenantContext } from "@/lib/db/tenant-context"
import type { DrizzleTransaction } from "@/lib/db/client"
import {
  reservations,
  reservationTransfer,
  customers,
  auditEvents,
  catalogTransferZones,
  payments,
} from "@/lib/db/schema"
import { debitPartnerCredit } from "@/lib/pro/booking-actions"
import { calculateTransferPrice } from "./pricing"

/* -------------------------------------------------------------------------- */
/* Types                                                                      */
/* -------------------------------------------------------------------------- */

export interface TransferBookingInput {
  // agencyId résolu depuis la session serveur
  fromZoneId: string
  toZoneId: string
  vehicleType: "sedan" | "van" | "minibus" | "bus" | "luxury"
  pickupDate: string // YYYY-MM-DD
  pickupTime: string // HH:MM
  flightNumber?: string
  flightArrivalAt?: string // ISO datetime
  pax: number
  luggageCount?: number
  /** Informations du client principal */
  customer: {
    firstName: string
    lastName: string
    phone: string
    email?: string
    civicId?: string
  }
  // createdByUserId résolu depuis la session serveur
}

export type TransferBookingResult =
  | { ok: true; reservationId: string; publicRef: string; totalTnd: number }
  | { ok: false; error: string; code?: string }

/* -------------------------------------------------------------------------- */
/* Helpers                                                                    */
/* -------------------------------------------------------------------------- */

function pad(n: number, w = 6) {
  return String(n).padStart(w, "0")
}

async function nextPublicRef(
  tx: DrizzleTransaction,
  agencyId: string,
): Promise<string> {
  const year = new Date().getFullYear()
  const prefix = `TR-${year}-`
  const [row] = await tx
    .select({
      maxRef: sql<string | null>`MAX(${reservations.publicRef})`,
    })
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

/* -------------------------------------------------------------------------- */
/* Main Action                                                                */
/* -------------------------------------------------------------------------- */

/**
 * Crée une réservation de transfert de manière atomique.
 *
 * Flow :
 *   1. Calculer le prix (via pricing.ts)
 *   2. Créer le client
 *   3. Créer la réservation générique
 *   4. Débiter le wallet (atomique)
 *   5. Insérer l'extension Transfer
 *   6. Log audit
 *
 * Toute erreur → rollback complet.
 */
export async function createTransferBooking(
  input: TransferBookingInput,
): Promise<TransferBookingResult> {
  if (!process.env.DATABASE_URL) {
    return { ok: false, error: "Base de données non configurée" }
  }

  if (input.pax <= 0 || input.pax > 50) {
    return { ok: false, error: "Nombre de passagers invalide (1-50)" }
  }

  // Résout la session Supabase + pose le contexte RLS (app.current_agency_id
  // etc. — voir lib/db/tenant-context.ts) pour toute la transaction ci-dessous.
  try {
    const outcome = await runInTenantContext(async (tx, ctx) => {
      if (!ctx.agencyId) {
        throw new Error("NO_AGENCY")
      }
      const agencyId = ctx.agencyId
      const createdByUserId = ctx.userId

      const pricing = await calculateTransferPrice({
        fromZoneId: input.fromZoneId,
        toZoneId: input.toZoneId,
        vehicleType: input.vehicleType,
        pickupDate: input.pickupDate,
        pickupTime: input.pickupTime,
        agencyId,
      })
      if (!pricing) {
        throw new Error("NO_PRICING")
      }

      const totalTnd = pricing.totalTnd

      /* ------------------------------------------------------------------
       * 2. Récupérer les noms des zones (pour le providerPayload)
       * ------------------------------------------------------------------ */
      const [fromZone] = await tx
        .select({ name: catalogTransferZones.name })
        .from(catalogTransferZones)
        .where(eq(catalogTransferZones.id, input.fromZoneId))
        .limit(1)

      const [toZone] = await tx
        .select({ name: catalogTransferZones.name })
        .from(catalogTransferZones)
        .where(eq(catalogTransferZones.id, input.toZoneId))
        .limit(1)

      /* ------------------------------------------------------------------
       * 3. Créer le client
       * ------------------------------------------------------------------ */
      const [customer] = await tx
        .insert(customers)
        .values({
          agencyId,
          civility: "M",
          firstName: input.customer.firstName,
          lastName: input.customer.lastName,
          email: input.customer.email,
          phone: input.customer.phone,
          civicId: input.customer.civicId,
          civicIdType: input.customer.civicId ? "cin" : undefined,
        })
        .returning({ id: customers.id })

      const customerId = customer.id

      /* ------------------------------------------------------------------
       * 4. Créer la réservation générique
       * ------------------------------------------------------------------ */
      const publicRef = await nextPublicRef(tx, agencyId)
      const [reservation] = await tx
        .insert(reservations)
        .values({
          agencyId,
          customerId,
          publicRef,
          module: "transfer",
          source: "internal",
          status: "pending",
          originalCurrency: "TND",
          originalAmount: String(totalTnd),
          tndAmount: String(totalTnd),
          depositAmount: String(totalTnd),
          depositPaid: "0",
          providerPayload: {
            fromZoneId: input.fromZoneId,
            toZoneId: input.toZoneId,
            fromZoneName: fromZone?.name,
            toZoneName: toZone?.name,
            vehicleType: input.vehicleType,
            pickupDate: input.pickupDate,
            pickupTime: input.pickupTime,
            pax: input.pax,
            luggageCount: input.luggageCount,
            flightNumber: input.flightNumber,
            flightArrivalAt: input.flightArrivalAt,
            pricing,
          },
        })
        .returning({ id: reservations.id, publicRef: reservations.publicRef })

      const reservationId = reservation.id

      /* ------------------------------------------------------------------
       * 5. Débiter le crédit agence (atomique) — `agencies.deposit_balance`,
       *    le seul solde que les flux de rechargement réels créditent (voir
       *    lib/booking/actions.ts pour le détail de la correction).
       * ------------------------------------------------------------------ */
      const debitResult = await debitPartnerCredit({
        agencyId,
        amountTnd: totalTnd,
        reference: publicRef,
        description: `Réservation Transfert — ${fromZone?.name ?? input.fromZoneId} → ${toZone?.name ?? input.toZoneId}`,
        createdByUserId,
        reservationId,
        idempotencyKey: `booking-debit:${reservationId}`,
        txOverride: tx as Parameters<typeof debitPartnerCredit>[0]["txOverride"],
      })

      if (!debitResult.ok) {
        throw new Error(
          debitResult.code === "INSUFFICIENT_FUNDS"
            ? "INSUFFICIENT_BALANCE"
            : "WALLET_DEBIT_FAILED",
        )
      }

      // status=confirmed + paiement — auparavant fait par walletDebitReservation.
      await tx
        .update(reservations)
        .set({ status: "confirmed", confirmedAt: new Date(), updatedAt: new Date() })
        .where(eq(reservations.id, reservationId))

      await tx.insert(payments).values({
        agencyId,
        reservationId,
        psp: "manual",
        method: "wallet",
        originalCurrency: "TND",
        originalAmount: totalTnd.toFixed(2),
        tndAmount: totalTnd.toFixed(2),
        kind: "deposit",
        status: "captured",
        capturedAt: new Date(),
      })

      /* ------------------------------------------------------------------
       * 6. Insérer l'extension Transfer
       * ------------------------------------------------------------------ */
      await tx.insert(reservationTransfer).values({
        reservationId,
        agencyId,
        pickupZoneId: input.fromZoneId,
        dropoffZoneId: input.toZoneId,
        pickupAddress: fromZone?.name,
        dropoffAddress: toZone?.name,
        flightNumber: input.flightNumber,
        flightArrivalAt: input.flightArrivalAt
          ? new Date(input.flightArrivalAt)
          : undefined,
        pax: input.pax,
        luggageCount: input.luggageCount ?? 0,
        vehicleType: input.vehicleType,
        statusTimeline: {
          created: { at: new Date().toISOString(), status: "created" },
        },
      })

      /* ------------------------------------------------------------------
       * 7. Log audit
       * ------------------------------------------------------------------ */
      await tx.insert(auditEvents).values({
        agencyId,
        actorUserId: createdByUserId,
        entityType: "reservation",
        entityId: reservationId,
        action: "transfer_booking.created",
        diff: {
          fromZoneId: input.fromZoneId,
          toZoneId: input.toZoneId,
          vehicleType: input.vehicleType,
          pickupDate: input.pickupDate,
          pickupTime: input.pickupTime,
          pax: input.pax,
          totalTnd,
          publicRef,
        },
      })

      return { reservationId, publicRef, totalTnd }
    })

    if (!outcome.ok) {
      return { ok: false, error: outcome.error }
    }
    return {
      ok: true,
      reservationId: outcome.result.reservationId,
      publicRef: outcome.result.publicRef,
      totalTnd: outcome.result.totalTnd,
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    const codes: Record<string, string> = {
      NO_AGENCY: "Aucune agence rattachée à ce compte",
      NO_PRICING: "Aucun tarif configuré pour cet itinéraire et ce véhicule",
      INSUFFICIENT_BALANCE: "Solde wallet insuffisant",
      WALLET_DEBIT_FAILED: "Erreur lors du débit wallet",
    }

    const code = Object.keys(codes).find((k) => msg.startsWith(k))
    return {
      ok: false,
      error: code ? codes[code] : `Erreur interne: ${msg}`,
      code: code ?? "INTERNAL_ERROR",
    }
  }
}
