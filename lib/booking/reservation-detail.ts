/**
 * Détail complet d'une réservation — Phase 17 (Admin / Master Admin
 * dashboard). Source de vérité unique pour la vue "détail réservation" côté
 * `/admin/reservations/[id]` (Master Admin — cross-agence pour super_admin)
 * ET `/pro/reservations/[id]` (agence — scopée à sa propre agencyId), pour
 * éviter deux implémentations divergentes de la même page.
 *
 * Réutilise :
 *  - `getReservationPaymentSummary` (lib/finance/payment-summary.ts, Phase
 *    16.2) pour collected/remaining/paymentState — jamais recalculé ici.
 *  - `withTenantContext` (lib/db/tenant-context.ts) — même scoping RLS que
 *    le reste de l'app, jamais de filtre agencyId fourni par le client.
 */

import { and, desc, eq } from "drizzle-orm"
import { withTenantContext } from "@/lib/db/tenant-context"
import type { DrizzleTransaction } from "@/lib/db/client"
import {
  agencies,
  auditEvents,
  customers,
  partnerInvoices,
  payments,
  reservationActivity,
  reservationFlight,
  reservationHotel,
  reservationOmra,
  reservationPackage,
  reservationTransfer,
  reservations,
  users,
} from "@/lib/db/schema"
import {
  getReservationPaymentSummary,
  type ReservationPaymentSummary,
} from "@/lib/finance/payment-summary"

export interface ReservationDetailPaymentRow {
  id: string
  method: string
  status: string
  tndAmount: number
  refundedAmount: number
  capturedAt: string | null
  createdAt: string
}

export interface ReservationAuditEntry {
  id: string
  action: string
  actorName: string | null
  diff: unknown
  createdAt: string
}

export interface ReservationInvoiceInfo {
  invoiceNumber: string
  status: string
  totalTtc: number
}

export interface ReservationModuleDetail {
  /** Ce que la réservation "achète" concrètement — hôtel, PNR vol, etc. */
  supplierLabel: string
  startDate: string | null
  endDate: string | null
  providerBookingId: string | null
}

export interface ReservationDetail {
  id: string
  publicRef: string
  module: string
  source: string
  status: string
  originalCurrency: string
  originalAmount: number
  tndAmount: number
  createdAt: string
  confirmedAt: string | null
  cancelledAt: string | null
  paymentExpiresAt: string | null
  notes: string | null
  voucherUrl: string | null
  customer: { id: string; name: string; email: string | null; phone: string | null }
  agency: { id: string; name: string; agencyType: string }
  moduleDetail: ReservationModuleDetail | null
  paymentSummary: ReservationPaymentSummary
  payments: ReservationDetailPaymentRow[]
  auditTimeline: ReservationAuditEntry[]
  invoice: ReservationInvoiceInfo | null
}

export interface LoadReservationDetailInput {
  reservationId: string
  /** `null` uniquement pour un super_admin (RLS autorise alors tout agencyId). */
  agencyId: string | null
  isSuperAdmin: boolean
}

async function loadModuleDetail(
  tx: DrizzleTransaction,
  reservationId: string,
  module: string,
): Promise<ReservationModuleDetail | null> {
  switch (module) {
    case "hotel": {
      const rows = await tx
        .select({
          hotelName: reservationHotel.hotelName,
          cityName: reservationHotel.cityName,
          checkIn: reservationHotel.checkIn,
          checkOut: reservationHotel.checkOut,
          providerBookingId: reservationHotel.providerBookingId,
        })
        .from(reservationHotel)
        .where(eq(reservationHotel.reservationId, reservationId))
      const row = rows[0] as
        | { hotelName: string; cityName: string | null; checkIn: string; checkOut: string; providerBookingId: string | null }
        | undefined
      if (!row) return null
      return {
        supplierLabel: row.cityName ? `${row.hotelName} — ${row.cityName}` : row.hotelName,
        startDate: row.checkIn,
        endDate: row.checkOut,
        providerBookingId: row.providerBookingId,
      }
    }
    case "omra": {
      const rows = await tx
        .select({ departureDate: reservationOmra.departureDate, returnDate: reservationOmra.returnDate })
        .from(reservationOmra)
        .where(eq(reservationOmra.reservationId, reservationId))
      const row = rows[0] as { departureDate: string; returnDate: string } | undefined
      if (!row) return null
      return { supplierLabel: "Omra", startDate: row.departureDate, endDate: row.returnDate, providerBookingId: null }
    }
    case "package": {
      const rows = await tx
        .select({ departureDate: reservationPackage.departureDate, returnDate: reservationPackage.returnDate })
        .from(reservationPackage)
        .where(eq(reservationPackage.reservationId, reservationId))
      const row = rows[0] as { departureDate: string; returnDate: string } | undefined
      if (!row) return null
      return { supplierLabel: "Voyage organisé", startDate: row.departureDate, endDate: row.returnDate, providerBookingId: null }
    }
    case "flight": {
      const rows = await tx
        .select({ origin: reservationFlight.origin, destination: reservationFlight.destination, departAt: reservationFlight.departAt, pnr: reservationFlight.pnr })
        .from(reservationFlight)
        .where(eq(reservationFlight.reservationId, reservationId))
      const row = rows[0] as { origin: string; destination: string; departAt: Date | string; pnr: string | null } | undefined
      if (!row) return null
      const departIso = row.departAt instanceof Date ? row.departAt.toISOString() : String(row.departAt)
      return {
        supplierLabel: `Vol ${row.origin} → ${row.destination}${row.pnr ? ` (PNR ${row.pnr})` : ""}`,
        startDate: departIso,
        endDate: null,
        providerBookingId: row.pnr,
      }
    }
    case "activity": {
      const rows = await tx
        .select({ sessionDate: reservationActivity.sessionDate })
        .from(reservationActivity)
        .where(eq(reservationActivity.reservationId, reservationId))
      const row = rows[0] as { sessionDate: string } | undefined
      if (!row) return null
      return { supplierLabel: "Activité", startDate: row.sessionDate, endDate: null, providerBookingId: null }
    }
    case "transfer": {
      const rows = await tx
        .select({ pickupAddress: reservationTransfer.pickupAddress, dropoffAddress: reservationTransfer.dropoffAddress })
        .from(reservationTransfer)
        .where(eq(reservationTransfer.reservationId, reservationId))
      const row = rows[0] as { pickupAddress: string | null; dropoffAddress: string | null } | undefined
      if (!row) return null
      return {
        supplierLabel: [row.pickupAddress, row.dropoffAddress].filter(Boolean).join(" → ") || "Transfert",
        startDate: null,
        endDate: null,
        providerBookingId: null,
      }
    }
    default:
      return null
  }
}

export async function loadReservationDetail(
  input: LoadReservationDetailInput,
): Promise<ReservationDetail | null> {
  if (!process.env.DATABASE_URL) return null

  return withTenantContext(
    { agencyId: input.agencyId, userId: "", isSuperAdmin: input.isSuperAdmin },
    async (tx) => {
      const whereClause = input.isSuperAdmin
        ? eq(reservations.id, input.reservationId)
        : and(eq(reservations.id, input.reservationId), eq(reservations.agencyId, input.agencyId as string))

      const rows = await tx
        .select({
          id: reservations.id,
          publicRef: reservations.publicRef,
          module: reservations.module,
          source: reservations.source,
          status: reservations.status,
          originalCurrency: reservations.originalCurrency,
          originalAmount: reservations.originalAmount,
          tndAmount: reservations.tndAmount,
          createdAt: reservations.createdAt,
          confirmedAt: reservations.confirmedAt,
          cancelledAt: reservations.cancelledAt,
          paymentExpiresAt: reservations.paymentExpiresAt,
          notes: reservations.notes,
          voucherUrl: reservations.voucherUrl,
          agencyId: reservations.agencyId,
          customerId: customers.id,
          customerFirstName: customers.firstName,
          customerLastName: customers.lastName,
          customerEmail: customers.email,
          customerPhone: customers.phone,
          agencyName: agencies.name,
          agencyType: agencies.agencyType,
        })
        .from(reservations)
        .leftJoin(customers, eq(customers.id, reservations.customerId))
        .leftJoin(agencies, eq(agencies.id, reservations.agencyId))
        .where(whereClause)
        .limit(1)

      const row = rows[0]
      if (!row) return null

      const [paymentSummary, moduleDetail, paymentRows, auditRows, invoiceRows] = await Promise.all([
        getReservationPaymentSummary({
          reservationId: row.id,
          txOverride: tx as Parameters<typeof getReservationPaymentSummary>[0]["txOverride"],
        }),
        loadModuleDetail(tx, row.id, row.module),
        tx
          .select({
            id: payments.id,
            method: payments.method,
            status: payments.status,
            tndAmount: payments.tndAmount,
            refundedAmount: payments.refundedAmount,
            capturedAt: payments.capturedAt,
            createdAt: payments.createdAt,
          })
          .from(payments)
          .where(eq(payments.reservationId, row.id))
          .orderBy(desc(payments.createdAt)),
        tx
          .select({
            id: auditEvents.id,
            action: auditEvents.action,
            actorUserId: auditEvents.actorUserId,
            actorName: users.name,
            actorEmail: users.email,
            diff: auditEvents.diff,
            createdAt: auditEvents.createdAt,
          })
          .from(auditEvents)
          .leftJoin(users, eq(users.id, auditEvents.actorUserId))
          .where(and(eq(auditEvents.entityType, "reservation"), eq(auditEvents.entityId, row.id)))
          .orderBy(desc(auditEvents.createdAt))
          .limit(50),
        tx
          .select({
            invoiceNumber: partnerInvoices.invoiceNumber,
            status: partnerInvoices.status,
            totalTtc: partnerInvoices.totalTtc,
          })
          .from(partnerInvoices)
          .where(eq(partnerInvoices.reservationId, row.id))
          .limit(1),
      ])

      return {
        id: row.id,
        publicRef: row.publicRef,
        module: row.module,
        source: row.source,
        status: row.status,
        originalCurrency: row.originalCurrency,
        originalAmount: Number.parseFloat(row.originalAmount),
        tndAmount: Number.parseFloat(row.tndAmount),
        createdAt: row.createdAt.toISOString(),
        confirmedAt: row.confirmedAt ? row.confirmedAt.toISOString() : null,
        cancelledAt: row.cancelledAt ? row.cancelledAt.toISOString() : null,
        paymentExpiresAt: row.paymentExpiresAt ? row.paymentExpiresAt.toISOString() : null,
        notes: row.notes,
        voucherUrl: row.voucherUrl,
        customer: {
          id: row.customerId ?? "",
          name: [row.customerFirstName, row.customerLastName].filter(Boolean).join(" ").trim() || "—",
          email: row.customerEmail,
          phone: row.customerPhone,
        },
        agency: { id: row.agencyId, name: row.agencyName ?? "—", agencyType: row.agencyType ?? "ota" },
        moduleDetail,
        paymentSummary,
        payments: (paymentRows as Array<{ id: string; method: string; status: string; tndAmount: string; refundedAmount: string; capturedAt: Date | null; createdAt: Date }>).map((p) => ({
          id: p.id,
          method: p.method,
          status: p.status,
          tndAmount: Number.parseFloat(p.tndAmount),
          refundedAmount: Number.parseFloat(p.refundedAmount),
          capturedAt: p.capturedAt ? p.capturedAt.toISOString() : null,
          createdAt: p.createdAt.toISOString(),
        })),
        auditTimeline: (auditRows as Array<{ id: string; action: string; actorName: string | null; actorEmail: string | null; diff: unknown; createdAt: Date }>).map((a) => ({
          id: a.id,
          action: a.action,
          actorName: a.actorName ?? a.actorEmail ?? null,
          diff: a.diff,
          createdAt: a.createdAt.toISOString(),
        })),
        invoice: (() => {
          const inv = (invoiceRows as Array<{ invoiceNumber: string; status: string; totalTtc: string }>)[0]
          return inv ? { invoiceNumber: inv.invoiceNumber, status: inv.status, totalTtc: Number.parseFloat(inv.totalTtc) } : null
        })(),
      }
    },
  )
}
