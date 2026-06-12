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
import { getDb } from "@/lib/db/client"
import { createServerSupabase } from "@/lib/supabase/server"
import {
  reservations,
  reservationTransfer,
  customers,
  auditEvents,
  catalogTransferZones,
  catalogTransferPricing,
  users,
} from "@/lib/db/schema"
import { walletDebitReservation } from "@/lib/wallet/actions"
import { calculateTransferPrice, type TransferPricingInput } from "./pricing"

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
  db: ReturnType<typeof getDb>,
  agencyId: string,
): Promise<string> {
  const year = new Date().getFullYear()
  const prefix = `TR-${year}-`
  const [row] = await db
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

  // Résoudre agencyId et userId depuis la session — jamais depuis le client
  let agencyId: string
  let createdByUserId: string | undefined
  try {
    const supabase = await createServerSupabase()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { ok: false, error: "Non authentifié" }
    const db0 = getDb()
    const [profile] = await db0
      .select({ agencyId: users.agencyId })
      .from(users)
      .where(eq(users.id, user.id))
      .limit(1)
    if (!profile) return { ok: false, error: "Profil utilisateur introuvable" }
    agencyId = profile.agencyId
    createdByUserId = user.id
  } catch {
    return { ok: false, error: "Erreur d'authentification" }
  }

  const db = getDb()

  try {
    const result = await db.transaction(async (tx) => {
      /* ------------------------------------------------------------------
       * 1. Calculer le prix
       * ------------------------------------------------------------------ */
      const pricingInput: TransferPricingInput = {
        fromZoneId: input.fromZoneId,
        toZoneId: input.toZoneId,
        vehicleType: input.vehicleType,
        pickupDate: input.pickupDate,
        pickupTime: input.pickupTime,
        agencyId,
      }
      const pricing = calculateTransferPrice(pricingInput)
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
       * 5. Débiter le wallet (atomique)
       * ------------------------------------------------------------------ */
      const debitResult = await walletDebitReservation({
        agencyId,
        reservationId,
        amountTnd: totalTnd,
        createdByUserId,
        txOverride: tx as Parameters<typeof walletDebitReservation>[0]["txOverride"],
      })

      if (!debitResult.ok) {
        throw new Error(
          debitResult.code === "INSUFFICIENT_BALANCE"
            ? "INSUFFICIENT_BALANCE"
            : "WALLET_DEBIT_FAILED",
        )
      }

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

    return {
      ok: true,
      reservationId: result.reservationId,
      publicRef: result.publicRef,
      totalTnd: result.totalTnd,
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    const codes: Record<string, string> = {
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
