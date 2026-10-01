"use server"

/**
 * PROVIDER-CONNECTIVITY-BRIDGE (P3) — Confirmation manuelle B2B_OFFLINE.
 *
 * Chemin séparé de `fulfillFlightBooking()` (fulfillment-action.ts), qui
 * reste intact et inchangé dans son comportement API_DIRECT
 * (recheck → book → issue → confirm via un GdsAdapter). Ce fichier ne
 * touche jamais un GdsAdapter — la disponibilité/le prix ont été vérifiés
 * hors-ligne par un membre du staff (portail B2B, téléphone, email
 * professionnel), pas par un appel API.
 *
 * Règles non négociables (voir audit du chantier) :
 *   - agit sur la ligne `flight_bookings` EXISTANTE, ne crée jamais de
 *     deuxième réservation ni de deuxième booking ;
 *   - jamais d'appel à adapter.book()/.issue() ;
 *   - même garde de rôle que le chemin API (FULFILL_ROLES, réutilisée
 *     telle quelle) ;
 *   - même verrou atomique (CAS PENDING → BOOKING_IN_PROGRESS) que l'Arm A
 *     de fulfillFlightBooking — empêche double-clic, double confirmation,
 *     et une confirmation manuelle concurrente à une confirmation API sur
 *     la même réservation (un seul des deux chemins peut gagner le CAS) ;
 *   - même point d'ancrage financier unique (finalizeFlightBookingFinancials),
 *     jamais une deuxième écriture si l'autre chemin a déjà réussi ;
 *   - ne réutilise ni n'écrase le snapshot immuable — le prix validé B2B
 *     est journalisé comme une transaction distincte
 *     (flight_supplier_transactions), jamais une réécriture de
 *     flight_price_snapshots.
 */

import { eq, and } from "drizzle-orm"
import { z } from "zod"
import { withSystemContext } from "@/lib/db/tenant-context"
import { reservations } from "@/lib/db/schema"
import { flightBookings, flightSupplierTransactions } from "@/lib/db/schema/flights"
import { updateFlightStatus } from "./flight-status-sync"
import { finalizeFlightBookingFinancials } from "./flight-financials"
import { createServerSupabase } from "@/lib/supabase/server"
import { getCurrentAdminProfile } from "@/lib/auth/profile"
import { isAllowedIntoAdmin } from "@/lib/auth/admin-gate"
import { recordReservationTransition } from "@/lib/admin/reservation-status-history"
import { FULFILL_ROLES } from "./fulfillment-action"

const manualConfirmationSchema = z.object({
  supplierBookingRef: z.string().trim().min(1).max(64),
  confirmedPrice: z.number().positive(),
  confirmedCurrency: z.string().trim().length(3).optional(),
  operatorNote: z.string().trim().max(1000).optional(),
})

export type ManualFlightConfirmationInput = z.infer<typeof manualConfirmationSchema>

export type ManualConfirmationResult =
  | { ok: true; publicRef: string; bookingId: string }
  | { ok: false; error: string; code: string }

export async function confirmManualFlightBooking(
  reservationId: string,
  input: ManualFlightConfirmationInput,
): Promise<ManualConfirmationResult> {
  // ── 0. Auth — même garde que le chemin API ─────────────────────────────────
  const supabase = await createServerSupabase()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: "Non authentifié.", code: "UNAUTHORIZED" }

  const profile = await getCurrentAdminProfile(user.id)
  if (
    !profile ||
    !isAllowedIntoAdmin(profile.role, profile.agencyType) ||
    !(FULFILL_ROLES as readonly string[]).includes(profile.role)
  ) {
    return { ok: false, error: "Permission insuffisante.", code: "FORBIDDEN" }
  }

  // ── 1. Validation des données B2B minimales (section 5 du chantier) ────────
  const parsed = manualConfirmationSchema.safeParse(input)
  if (!parsed.success) {
    return {
      ok: false,
      error: "Données de confirmation invalides : " + parsed.error.errors.map((e) => e.message).join(", "),
      code: "INVALID_INPUT",
    }
  }
  const { supplierBookingRef, confirmedPrice, confirmedCurrency, operatorNote } = parsed.data

  // ── 2. Claim atomique — copie exacte de l'Arm A de fulfillFlightBooking ────
  // Un seul des deux chemins (API ou manuel) peut gagner ce CAS pour une
  // même réservation — protège contre double-clic, deux opérateurs, retry,
  // et une course entre confirmation API et confirmation manuelle.
  const claimedRows = await withSystemContext(async (tx) => {
    const rows = await tx
      .update(flightBookings)
      .set({ status: "BOOKING_IN_PROGRESS", updatedAt: new Date() })
      .where(
        and(
          eq(flightBookings.reservationId, reservationId),
          eq(flightBookings.status, "PENDING"),
        ),
      )
      .returning({
        id: flightBookings.id,
        priceSnapshotId: flightBookings.priceSnapshotId,
        provider: flightBookings.provider,
      })

    if (rows.length > 0) {
      await tx
        .update(reservations)
        .set({ status: "on_request", updatedAt: new Date() })
        .where(eq(reservations.id, reservationId))
      await recordReservationTransition(tx, {
        reservationId,
        from: "pending",
        to: "on_request",
        triggeredBy: user.id,
        reason: "Prise en charge validation B2B manuelle (claim booking)",
      })
    }

    return rows
  })

  if (claimedRows.length === 0) {
    const existingRows = await withSystemContext((tx) =>
      tx
        .select({ status: flightBookings.status })
        .from(flightBookings)
        .where(eq(flightBookings.reservationId, reservationId))
        .limit(1),
    )
    if (!existingRows.length) {
      return { ok: false, error: "Réservation de vol introuvable.", code: "NOT_FOUND" }
    }
    return {
      ok: false,
      error: `Ce dossier est déjà en statut ${existingRows[0]!.status}.`,
      code: "WRONG_STATUS",
    }
  }

  const claimed = claimedRows[0]!
  const bookingId = claimed.id

  // ── 3. Journaliser la validation B2B — jamais une réécriture du snapshot ───
  // (section 6 du chantier : Displayed Price → B2B Validated Supplier Price
  // → Final Sale Price doit rester traçable, jamais un écrasement).
  await withSystemContext((tx) =>
    tx.insert(flightSupplierTransactions).values({
      bookingId,
      snapshotId: claimed.priceSnapshotId ?? undefined,
      provider: claimed.provider ?? "b2b_offline",
      transactionType: "B2B_VALIDATION",
      status: "SUCCESS",
      request: { reservationId },
      response: {
        supplierBookingRef,
        confirmedPrice,
        confirmedCurrency: confirmedCurrency ?? "TND",
        operatorId: user.id,
        operatorNote: operatorNote ?? null,
      },
    }),
  )

  // ── 4. Confirmer — réutilise supplierBookingRef existant + updateFlightStatus
  // existant (même sync reservations.status, mêmes vérifications de
  // transition légale, même historique) — aucun nouvel état créé.
  await withSystemContext((tx) =>
    tx
      .update(flightBookings)
      .set({
        supplierBookingRef,
        fulfillmentMode: "b2b_offline",
        updatedAt: new Date(),
      })
      .where(eq(flightBookings.id, bookingId)),
  )
  await updateFlightStatus(bookingId, "CONFIRMED")

  // ── 5. Point d'ancrage financier unique — jamais un deuxième si l'autre
  // chemin a déjà réussi (garanti par le CAS de l'étape 2).
  await withSystemContext((tx) =>
    finalizeFlightBookingFinancials(tx, { reservationId, snapshotId: claimed.priceSnapshotId }),
  )

  const [res] = await withSystemContext((tx) =>
    tx
      .select({ publicRef: reservations.publicRef })
      .from(reservations)
      .where(eq(reservations.id, reservationId))
      .limit(1),
  )

  return { ok: true, publicRef: res?.publicRef ?? "", bookingId }
}
