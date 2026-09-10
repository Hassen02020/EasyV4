/**
 * GET /api/admin/reservations/[id]/invoice
 *
 * Équivalent admin de `/api/admin/reservations/[id]/voucher` (Phase 21.2,
 * P1) — même scoping : super_admin cross-tenant, autres rôles admin
 * scopés à leur propre agencyId. Facture déjà émise uniquement
 * (`findInvoiceForReservation`) — jamais un recalcul, voir
 * `app/api/booking/invoice/[ref]/route.ts`.
 */

import { NextRequest, NextResponse } from "next/server"
import { and, eq } from "drizzle-orm"
import { withTenantContext } from "@/lib/db/tenant-context"
import { agencies, customers, reservations } from "@/lib/db/schema"
import { getCurrentAdminProfile } from "@/lib/auth/profile"
import { isAllowedIntoAdmin } from "@/lib/auth/admin-gate"
import { createServerSupabase } from "@/lib/supabase/server"
import { findInvoiceForReservation } from "@/lib/finance/invoice-actions"
import { getReservationPaymentSummary } from "@/lib/finance/payment-summary"
import { renderInvoicePdf } from "@/lib/pdf/invoice"

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: reservationId } = await params

  const supabase = await createServerSupabase()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: "not_authenticated" }, { status: 401 })
  }

  const profile = await getCurrentAdminProfile(user.id)
  if (!profile || !isAllowedIntoAdmin(profile.role, profile.agencyType)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 })
  }

  if (!process.env.DATABASE_URL) {
    return NextResponse.json({ error: "server_misconfigured" }, { status: 500 })
  }

  const isSuperAdmin = profile.role === "super_admin"

  const result = await withTenantContext(
    { agencyId: isSuperAdmin ? null : profile.agencyId, userId: user.id, isSuperAdmin },
    async (tx) => {
      const whereClause = isSuperAdmin
        ? eq(reservations.id, reservationId)
        : and(eq(reservations.id, reservationId), eq(reservations.agencyId, profile.agencyId))
      const [row] = await tx
        .select({
          id: reservations.id,
          publicRef: reservations.publicRef,
          providerPayload: reservations.providerPayload,
          module: reservations.module,
          customerFirstName: customers.firstName,
          customerLastName: customers.lastName,
          customerEmail: customers.email,
          agencyName: agencies.name,
          agencyBrandName: agencies.brandName,
          agencyMatriculeFiscale: agencies.matriculeFiscale,
          agencyAddress: agencies.address,
        })
        .from(reservations)
        .innerJoin(customers, eq(customers.id, reservations.customerId))
        .innerJoin(agencies, eq(agencies.id, reservations.agencyId))
        .where(whereClause)
        .limit(1)
      if (!row) return null

      const invoice = await findInvoiceForReservation(tx, row.id)
      if (!invoice) return { row, invoice: null }

      const summary = await getReservationPaymentSummary({
        reservationId: row.id,
        txOverride: tx as unknown as Parameters<typeof getReservationPaymentSummary>[0]["txOverride"],
      })
      return { row, invoice, summary }
    },
  )

  if (!result || !result.row) {
    return NextResponse.json({ error: "not_found" }, { status: 404 })
  }
  if (!result.invoice || !result.summary) {
    return NextResponse.json(
      {
        error: "invoice_unavailable",
        message: "La facture n'est disponible qu'une fois la réservation confirmée et intégralement réglée.",
      },
      { status: 404 },
    )
  }

  const { row, invoice, summary } = result
  const payload = (row.providerPayload as Record<string, unknown> | null) ?? {}
  const label = typeof payload.offerLabel === "string" ? payload.offerLabel : `Réservation ${row.module}`

  const pdf = await renderInvoicePdf({
    invoiceNumber: invoice.invoiceNumber,
    publicRef: row.publicRef,
    validationDate: invoice.validationDate ?? new Date().toISOString().slice(0, 10),
    customerName: `${row.customerFirstName} ${row.customerLastName}`.trim(),
    customerEmail: row.customerEmail ?? undefined,
    agencyName: row.agencyBrandName ?? row.agencyName,
    agencyMatriculeFiscale: row.agencyMatriculeFiscale ?? undefined,
    agencyAddress: row.agencyAddress ?? undefined,
    label,
    totalHt: parseFloat(invoice.totalHt),
    totalTva: parseFloat(invoice.totalTva),
    totalTtc: parseFloat(invoice.totalTtc),
    collectedTnd: summary.collectedTnd,
    remainingTnd: summary.remainingTnd,
    paymentState: summary.paymentState,
  })

  return new NextResponse(Buffer.from(pdf), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="facture-${row.publicRef}.pdf"`,
      "Cache-Control": "private, no-store",
    },
  })
}
