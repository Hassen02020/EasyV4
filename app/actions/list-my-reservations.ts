"use server"

/**
 * PHASE NEXT — Historique de réservations pour le compte client B2C
 * authentifié (`app/compte/page.tsx`).
 *
 * Contrairement à `lookupBooking()` (ref + email exacts, un seul résultat),
 * ceci liste TOUTES les réservations du client actuellement connecté —
 * "connecté" = session Supabase valide (magic-link), l'email vérifié par
 * Supabase servant de preuve de possession, exactement le même modèle de
 * confiance que `lookupBooking()` (ref + email texte), juste plus fort
 * (Supabase a réellement vérifié l'accès à la boîte mail via le lien).
 *
 * Portée tenant : résout l'agence OTA courante via `guestTenantContext()`
 * (le MÊME mécanisme déjà utilisé par le guest checkout — white-label-aware,
 * jamais un ID inventé) puis exécute la requête via `withTenantContext()` —
 * la policy RLS existante `reservations_tenant_isolation`
 * (`agency_id = current_agency_id()`) s'applique donc SANS AUCUNE nouvelle
 * policy : un client d'une agence White Label ne voit jamais les
 * réservations faites sur un autre tenant, même avec le même email — même
 * isolation que tout le reste de la plateforme.
 *
 * Aucune écriture ici. Depuis la phase "CUSTOMER RESERVATION LINK",
 * `customers.authUserId` est renseigné à la création de réservation (voir
 * lib/booking/customer-identity.ts + guest-actions.ts par module) : le
 * WHERE ci-dessous matche par `authUserId = session.user.id` OU par email
 * vérifié — jamais l'un au lieu de l'autre. L'email reste nécessaire pour
 * l'historique antérieur à cette phase (lignes `customers` jamais taguées
 * `authUserId`) ; `authUserId` est le signal le plus fort dès qu'il existe
 * (élargit l'ensemble matché, ne le restreint jamais).
 */

import { eq, desc } from "drizzle-orm"
import { withTenantContext } from "@/lib/db/tenant-context"
import type { DrizzleTransaction } from "@/lib/db/client"
import { guestTenantContext } from "@/lib/hotel-suppliers/tenant/live-resolution"
import {
  reservations,
  customers,
  payments,
  reviews,
  reservationHotel,
  reservationPackage,
  reservationActivity,
  reservationOmra,
  catalogPackages,
  catalogActivities,
  omraPackages,
} from "@/lib/db/schema"
import { hasConfiguredPaymentProvider } from "@/lib/payment/provider"
import { findInvoiceForReservation } from "@/lib/finance/invoice-actions"
import { createServerSupabase } from "@/lib/supabase/server"
import { ownedByCurrentCustomer } from "@/lib/booking/customer-identity"
import type { BookingSummary, BookingStatus } from "@/lib/booking/summary-types"
import type { PolicySnapshot } from "@/lib/booking/policy-engine"

const POLICY_ENGINE_MODULES = ["omra", "package", "activity"]

/**
 * Détail produit lisible (destination/produit, dates, voyageurs — ticket
 * E2B-004 section UX) — lu depuis la table d'extension propre à chaque
 * module, jamais deviné depuis `providerPayload` (dont la forme n'est ni
 * stable ni garantie identique entre modules). `null` si la réservation n'a
 * pas de ligne d'extension (jamais une erreur — juste rien à afficher).
 */
export async function getProductDetails(
  tx: DrizzleTransaction,
  reservationId: string,
  module: string,
): Promise<BookingSummary["product"]> {
  switch (module) {
    case "hotel": {
      const [row] = await tx
        .select({
          hotelName: reservationHotel.hotelName,
          cityName: reservationHotel.cityName,
          checkIn: reservationHotel.checkIn,
          checkOut: reservationHotel.checkOut,
          adults: reservationHotel.adults,
          childrenAges: reservationHotel.childrenAges,
        })
        .from(reservationHotel)
        .where(eq(reservationHotel.reservationId, reservationId))
        .limit(1)
      if (!row) return null
      return {
        label: row.cityName ? `${row.hotelName} — ${row.cityName}` : row.hotelName,
        startDate: row.checkIn,
        endDate: row.checkOut,
        travelers: row.adults + (row.childrenAges?.length ?? 0),
      }
    }
    case "package": {
      const [row] = await tx
        .select({
          title: catalogPackages.title,
          departureDate: reservationPackage.departureDate,
          returnDate: reservationPackage.returnDate,
          adults: reservationPackage.adults,
          childrenAges: reservationPackage.childrenAges,
        })
        .from(reservationPackage)
        .innerJoin(catalogPackages, eq(reservationPackage.packageId, catalogPackages.id))
        .where(eq(reservationPackage.reservationId, reservationId))
        .limit(1)
      if (!row) return null
      return {
        label: row.title,
        startDate: row.departureDate,
        endDate: row.returnDate,
        travelers: row.adults + (row.childrenAges?.length ?? 0),
      }
    }
    case "activity": {
      const [row] = await tx
        .select({
          title: catalogActivities.title,
          sessionDate: reservationActivity.sessionDate,
          adults: reservationActivity.adults,
          children: reservationActivity.children,
          seniors: reservationActivity.seniors,
        })
        .from(reservationActivity)
        .innerJoin(catalogActivities, eq(reservationActivity.activityId, catalogActivities.id))
        .where(eq(reservationActivity.reservationId, reservationId))
        .limit(1)
      if (!row) return null
      return {
        label: row.title,
        startDate: row.sessionDate,
        endDate: row.sessionDate,
        travelers: row.adults + row.children + row.seniors,
      }
    }
    case "omra": {
      const [row] = await tx
        .select({
          name: omraPackages.name,
          departureDate: reservationOmra.departureDate,
          returnDate: reservationOmra.returnDate,
          pilgrims: reservationOmra.pilgrims,
        })
        .from(reservationOmra)
        .innerJoin(omraPackages, eq(reservationOmra.omraPackageId, omraPackages.id))
        .where(eq(reservationOmra.reservationId, reservationId))
        .limit(1)
      if (!row) return null
      return {
        label: row.name,
        startDate: row.departureDate,
        endDate: row.returnDate,
        travelers: row.pilgrims,
      }
    }
    default:
      return null
  }
}

export type MyReservationsResult =
  | { ok: true; email: string; bookings: BookingSummary[] }
  | { ok: false; error: string }

/** Nombre max de réservations affichées — au-delà, un historique très long relève d'une vraie pagination (hors périmètre minimal ici). */
const MAX_RESERVATIONS = 50

export async function listMyReservations(): Promise<MyReservationsResult> {
  if (!process.env.DATABASE_URL) {
    return { ok: false, error: "Service temporairement indisponible." }
  }

  const supabase = await createServerSupabase()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user?.email) {
    return { ok: false, error: "NOT_AUTHENTICATED" }
  }

  const tenant = await guestTenantContext()
  if (!tenant) {
    return { ok: false, error: "Aucune agence n'est configurée pour ce site." }
  }

  try {
    const onlinePaymentAvailable = hasConfiguredPaymentProvider()

    // Une seule transaction pour tout l'historique — même style séquentiel
    // que `lookupBooking()` (requête principale puis paiement/facture par
    // réservation), juste étendu à N lignes au lieu d'une seule.
    const bookings = await withTenantContext(tenant, async (tx) => {
      const rows = await tx
        .select({
          id: reservations.id,
          publicRef: reservations.publicRef,
          module: reservations.module,
          status: reservations.status,
          originalAmount: reservations.originalAmount,
          originalCurrency: reservations.originalCurrency,
          tndAmount: reservations.tndAmount,
          createdAt: reservations.createdAt,
          confirmedAt: reservations.confirmedAt,
          cancelledAt: reservations.cancelledAt,
          paymentExpiresAt: reservations.paymentExpiresAt,
          guestAccessToken: reservations.guestAccessToken,
          providerPayload: reservations.providerPayload,
          firstName: customers.firstName,
          lastName: customers.lastName,
          email: customers.email,
          phone: customers.phone,
        })
        .from(reservations)
        .innerJoin(customers, eq(reservations.customerId, customers.id))
        .where(
          ownedByCurrentCustomer({
            agencyId: tenant.agencyId ?? "",
            authUserId: user.id,
            verifiedEmail: user.email!,
          }),
        )
        .orderBy(desc(reservations.createdAt))
        .limit(MAX_RESERVATIONS)

      const result: BookingSummary[] = []
      for (const row of rows) {
        const [lastPayment] = await tx
          .select({ method: payments.method, status: payments.status })
          .from(payments)
          .where(eq(payments.reservationId, row.id))
          .orderBy(desc(payments.createdAt))
          .limit(1)
        const invoice = await findInvoiceForReservation(tx, row.id)
        const product = await getProductDetails(tx, row.id, row.module)
        const [existingReview] = await tx
          .select({ id: reviews.id })
          .from(reviews)
          .where(eq(reviews.reservationId, row.id))
          .limit(1)

        // Policy Engine (Omra/Package/Activity uniquement) — la politique
        // FIGÉE au moment de CETTE réservation, jamais une résolution live
        // (voir lib/booking/policy-engine.ts, doc de tête).
        let cancellationPolicy: BookingSummary["cancellationPolicy"] = undefined
        if (POLICY_ENGINE_MODULES.includes(row.module)) {
          const payload = (row.providerPayload ?? {}) as { policySnapshot?: PolicySnapshot }
          const policy = payload.policySnapshot?.policy ?? null
          cancellationPolicy = policy
            ? {
                cancellable: policy.cancellable,
                modifiable: policy.modifiable,
                deadlineHours: policy.deadlineHours,
                cancellationFeePercent: policy.cancellationFeePercent,
                refundAllowed: policy.refundAllowed,
                creditAllowed: policy.creditAllowed,
                nonRefundable: policy.nonRefundable,
              }
            : null
        }

        result.push({
          id: row.id,
          publicRef: row.publicRef,
          module: row.module,
          status: row.status as BookingStatus,
          originalAmount: row.originalAmount,
          originalCurrency: row.originalCurrency,
          tndAmount: row.tndAmount,
          createdAt: row.createdAt.toISOString(),
          confirmedAt: row.confirmedAt?.toISOString() ?? null,
          cancelledAt: row.cancelledAt?.toISOString() ?? null,
          paymentExpiresAt: row.paymentExpiresAt?.toISOString() ?? null,
          payment: lastPayment ? { method: lastPayment.method, status: lastPayment.status } : null,
          onlinePaymentAvailable,
          guestAccessToken: row.guestAccessToken,
          hasInvoice: invoice != null,
          customer: {
            firstName: row.firstName,
            lastName: row.lastName,
            email: row.email ?? "",
            phone: row.phone ?? null,
          },
          cancellationPolicy,
          hasReview: existingReview != null,
          product,
        })
      }
      return result
    })

    return { ok: true, email: user.email, bookings }
  } catch (err) {
    console.error("[listMyReservations]", err)
    return { ok: false, error: "Erreur technique. Veuillez réessayer." }
  }
}
