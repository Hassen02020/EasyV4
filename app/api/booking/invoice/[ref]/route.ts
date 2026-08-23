/**
 * GET /api/booking/invoice/{ref}?token=...
 *
 * Téléchargement à la demande de la facture PDF pour le tunnel B2C public
 * (`/booking/confirmation/[ref]`) — Phase 21.2 (P1). Réutilise EXACTEMENT
 * le même mécanisme d'accès guest que le voucher (Phase 21.1) :
 * `publicRef` + `guestAccessToken` combinés dans la même requête, jamais
 * `publicRef` seul — voir `app/api/booking/voucher/[ref]/route.ts` pour le
 * détail de ce correctif. Pas un second token, pas un second mécanisme.
 *
 * N'affiche la facture QUE si `generateInvoiceForReservation` en a déjà
 * émis une (donc réservation `confirmed`, donc — depuis Phase 21.1 —
 * intégralement payée) : `findInvoiceForReservation` lit l'enregistrement
 * déjà écrit, ne recalcule jamais un total. Le résumé de paiement affiché
 * (encaissé/restant/état) vient exclusivement de
 * `getReservationPaymentSummary()`, jamais de `reservations.depositPaid`
 * ni d'un recalcul indépendant.
 */

import { NextRequest, NextResponse } from "next/server"
import { and, eq } from "drizzle-orm"
import { withSystemContext } from "@/lib/db/tenant-context"
import { agencies, customers, reservations } from "@/lib/db/schema"
import { findInvoiceForReservation } from "@/lib/finance/invoice-actions"
import { getReservationPaymentSummary } from "@/lib/finance/payment-summary"
import { renderInvoicePdf } from "@/lib/pdf/invoice"

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ ref: string }> },
) {
  const { ref } = await params
  const token = req.nextUrl.searchParams.get("token")

  if (!process.env.DATABASE_URL) {
    return NextResponse.json({ error: "server_misconfigured" }, { status: 500 })
  }
  if (!token) {
    return NextResponse.json({ error: "not_found" }, { status: 404 })
  }

  const result = await withSystemContext(async (tx) => {
    const [row] = await tx
      .select({
        id: reservations.id,
        publicRef: reservations.publicRef,
        tndAmount: reservations.tndAmount,
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
      .where(and(eq(reservations.publicRef, ref), eq(reservations.guestAccessToken, token)))
      .limit(1)
    if (!row) return null

    const invoice = await findInvoiceForReservation(tx, row.id)
    if (!invoice) return { row, invoice: null }

    const summary = await getReservationPaymentSummary({
      reservationId: row.id,
      txOverride: tx as unknown as Parameters<typeof getReservationPaymentSummary>[0]["txOverride"],
    })
    return { row, invoice, summary }
  })

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
