/**
 * Rendu du voucher PDF pour l'écran détail réservation Admin/Pro
 * (`/api/admin/reservations/[id]/voucher`, `/api/pro/reservations/[id]/voucher`).
 *
 * Jusqu'ici ces deux routes ne rendaient QUE le module "hotel"
 * (`isHotelReservationVoucherEligible`/`renderVoucherPdf`) — trouvé en
 * certification E2E (cycle "Final Screenshot Certification") : le bloc
 * "Voucher" de la page admin affichait "Non disponible pour ce
 * module/statut" pour Omra/Package/Activité/Vols/Hôtels Monde même
 * confirmés, alors que chacun de ces modules a déjà une route de
 * téléchargement guest fonctionnelle (`/api/{module}/voucher/[ref]`) avec
 * son propre renderer et sa propre fonction d'éligibilité — jamais
 * réutilisés côté back-office.
 *
 * Dispatch par module, même style que `loadModuleDetail`
 * (lib/booking/reservation-detail.ts) : un `switch` sur `reservations.module`,
 * chaque branche réutilisant EXACTEMENT le même renderer/éligibilité que la
 * route guest correspondante — aucun nouveau gabarit PDF, aucune nouvelle
 * règle d'éligibilité.
 */

import { eq } from "drizzle-orm"
import type { DrizzleTransaction } from "@/lib/db/client"
import {
  agencies,
  catalogActivities,
  catalogPackages,
  customers,
  omraPackages,
  reservationActivity,
  reservationFlight,
  reservationHotel,
  reservationOmra,
  reservationPackage,
  reservations,
} from "@/lib/db/schema"
import { renderVoucherPdf } from "@/lib/pdf/voucher-hotel"
import { renderOmraVoucherPdf } from "@/lib/pdf/voucher-omra"
import { renderPackageVoucherPdf } from "@/lib/pdf/voucher-package"
import { renderActivityVoucherPdf } from "@/lib/pdf/voucher-activity"
import { renderFlightVoucherPdf } from "@/lib/pdf/voucher-flight"
import {
  isVoucherEligible,
  isOmraVoucherEligible,
  isPackageVoucherEligible,
  isActivityVoucherEligible,
  isFlightVoucherEligible,
  isWorldHotelVoucherEligible,
} from "@/lib/pro/voucher-eligibility"

export type VoucherRenderResult =
  | { ok: true; pdf: Uint8Array; filename: string }
  | { ok: false; status: 404; error: "not_found" }
  | { ok: false; status: 404; error: "voucher_unavailable"; message: string }

/**
 * `reservationId` + le scope tenant (agencyId/isSuperAdmin) déjà appliqués
 * par l'appelant via `withTenantContext` — cette fonction ne fait QUE
 * regarder `module` et dispatcher, elle ne refait aucun contrôle d'accès.
 */
export async function renderReservationVoucher(
  tx: DrizzleTransaction,
  reservationId: string,
): Promise<VoucherRenderResult> {
  const [base] = await tx
    .select({
      publicRef: reservations.publicRef,
      module: reservations.module,
      status: reservations.status,
      tndAmount: reservations.tndAmount,
      customerFirstName: customers.firstName,
      customerLastName: customers.lastName,
      agencyName: agencies.name,
      agencyBrandName: agencies.brandName,
    })
    .from(reservations)
    .innerJoin(customers, eq(customers.id, reservations.customerId))
    .innerJoin(agencies, eq(agencies.id, reservations.agencyId))
    .where(eq(reservations.id, reservationId))
    .limit(1)

  if (!base) return { ok: false, status: 404, error: "not_found" }

  const customerName = `${base.customerFirstName} ${base.customerLastName}`.trim()
  const agencyName = base.agencyBrandName ?? base.agencyName
  const totalTnd = parseFloat(base.tndAmount)
  const unavailable = (message: string): VoucherRenderResult => ({
    ok: false,
    status: 404,
    error: "voucher_unavailable",
    message,
  })

  switch (base.module) {
    case "hotel":
    case "hotel_monde": {
      const [row] = await tx
        .select({
          hotelName: reservationHotel.hotelName,
          checkIn: reservationHotel.checkIn,
          checkOut: reservationHotel.checkOut,
          nights: reservationHotel.nights,
          adults: reservationHotel.adults,
          childrenAges: reservationHotel.childrenAges,
        })
        .from(reservationHotel)
        .where(eq(reservationHotel.reservationId, reservationId))
        .limit(1)
      const input = { module: base.module, status: base.status, hotelName: row?.hotelName, checkIn: row?.checkIn, checkOut: row?.checkOut }
      const eligible = base.module === "hotel" ? isVoucherEligible(input) : isWorldHotelVoucherEligible(input)
      if (!eligible) {
        return unavailable(
          base.module === "hotel"
            ? "Le voucher n'est disponible qu'une fois la réservation confirmée."
            : "Aucun voucher hôtel pour cette réservation.",
        )
      }
      const pdf = await renderVoucherPdf({
        publicRef: base.publicRef,
        customerName,
        hotelName: row!.hotelName,
        checkIn: row!.checkIn,
        checkOut: row!.checkOut,
        nights: row!.nights ?? 1,
        adults: row!.adults ?? 1,
        children: row!.childrenAges?.length ?? 0,
        totalTnd,
        agencyName,
      })
      return { ok: true, pdf, filename: `voucher-${base.publicRef}.pdf` }
    }

    case "omra": {
      const [row] = await tx
        .select({
          packageName: omraPackages.name,
          departureDate: reservationOmra.departureDate,
          returnDate: reservationOmra.returnDate,
          pilgrims: reservationOmra.pilgrims,
        })
        .from(reservationOmra)
        .leftJoin(omraPackages, eq(omraPackages.id, reservationOmra.omraPackageId))
        .where(eq(reservationOmra.reservationId, reservationId))
        .limit(1)
      const input = { module: base.module, status: base.status, packageName: row?.packageName, departureDate: row?.departureDate, returnDate: row?.returnDate }
      if (!isOmraVoucherEligible(input)) {
        return unavailable("Le voucher n'est disponible qu'une fois la réservation confirmée.")
      }
      const pdf = await renderOmraVoucherPdf({
        publicRef: base.publicRef,
        customerName,
        packageName: input.packageName,
        departureDate: input.departureDate,
        returnDate: input.returnDate,
        pilgrimsCount: row!.pilgrims ?? 1,
        totalTnd,
        agencyName,
      })
      return { ok: true, pdf, filename: `voucher-omra-${base.publicRef}.pdf` }
    }

    case "package": {
      const [row] = await tx
        .select({
          packageName: catalogPackages.title,
          departureDate: reservationPackage.departureDate,
          returnDate: reservationPackage.returnDate,
          adults: reservationPackage.adults,
          childrenAges: reservationPackage.childrenAges,
        })
        .from(reservationPackage)
        .leftJoin(catalogPackages, eq(catalogPackages.id, reservationPackage.packageId))
        .where(eq(reservationPackage.reservationId, reservationId))
        .limit(1)
      const input = { module: base.module, status: base.status, packageName: row?.packageName, departureDate: row?.departureDate, returnDate: row?.returnDate }
      if (!isPackageVoucherEligible(input)) {
        return unavailable("Le voucher n'est disponible qu'une fois la réservation confirmée.")
      }
      const pdf = await renderPackageVoucherPdf({
        publicRef: base.publicRef,
        customerName,
        packageName: input.packageName,
        departureDate: input.departureDate,
        returnDate: input.returnDate,
        adults: row!.adults ?? 1,
        children: row!.childrenAges?.length ?? 0,
        totalTnd,
        agencyName,
      })
      return { ok: true, pdf, filename: `voucher-package-${base.publicRef}.pdf` }
    }

    case "activity": {
      const [row] = await tx
        .select({
          activityName: catalogActivities.title,
          sessionDate: reservationActivity.sessionDate,
          sessionStart: reservationActivity.sessionStart,
          sessionEnd: reservationActivity.sessionEnd,
          adults: reservationActivity.adults,
          children: reservationActivity.children,
        })
        .from(reservationActivity)
        .leftJoin(catalogActivities, eq(catalogActivities.id, reservationActivity.activityId))
        .where(eq(reservationActivity.reservationId, reservationId))
        .limit(1)
      const input = { module: base.module, status: base.status, activityName: row?.activityName, sessionDate: row?.sessionDate }
      if (!isActivityVoucherEligible(input)) {
        return unavailable("Le voucher n'est disponible qu'une fois la réservation confirmée.")
      }
      const pdf = await renderActivityVoucherPdf({
        publicRef: base.publicRef,
        customerName,
        activityName: input.activityName,
        sessionDate: input.sessionDate,
        sessionStart: row!.sessionStart,
        sessionEnd: row!.sessionEnd,
        adults: row!.adults ?? 1,
        children: row!.children ?? 0,
        totalTnd,
        agencyName,
      })
      return { ok: true, pdf, filename: `voucher-activity-${base.publicRef}.pdf` }
    }

    case "flight": {
      const [row] = await tx
        .select({
          pnr: reservationFlight.pnr,
          origin: reservationFlight.origin,
          destination: reservationFlight.destination,
          departAt: reservationFlight.departAt,
          arriveAt: reservationFlight.arriveAt,
          cabinClass: reservationFlight.cabinClass,
          adults: reservationFlight.adults,
          children: reservationFlight.children,
          segments: reservationFlight.segments,
        })
        .from(reservationFlight)
        .where(eq(reservationFlight.reservationId, reservationId))
        .limit(1)
      const input = {
        module: base.module,
        status: base.status,
        origin: row?.origin,
        destination: row?.destination,
        departAt: row?.departAt ? row.departAt.toISOString() : null,
      }
      if (!isFlightVoucherEligible(input)) {
        return unavailable("Le voucher n'est disponible qu'une fois la réservation confirmée.")
      }
      const firstSegment = (row!.segments as Array<{ carrier?: string; flightNumber?: string }> | null)?.[0]
      const pdf = await renderFlightVoucherPdf({
        publicRef: base.publicRef,
        customerName,
        pnr: row!.pnr,
        origin: row!.origin!,
        destination: row!.destination!,
        departAt: row!.departAt!.toISOString(),
        arriveAt: row!.arriveAt ? row!.arriveAt.toISOString() : null,
        carrier: firstSegment?.carrier ?? null,
        flightNumber: firstSegment?.flightNumber ?? null,
        cabinClass: row!.cabinClass,
        adults: row!.adults ?? 1,
        children: row!.children ?? 0,
        totalTnd,
        agencyName,
      })
      return { ok: true, pdf, filename: `voucher-vol-${base.publicRef}.pdf` }
    }

    default:
      return unavailable("Aucun voucher disponible pour ce module.")
  }
}
