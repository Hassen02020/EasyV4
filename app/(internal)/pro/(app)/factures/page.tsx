import { redirect } from "next/navigation"
import { FileText } from "lucide-react"
import { ProPageShell } from "@/components/pro/pro-page-shell"
import { InvoicesTable } from "@/components/pro/invoices-table"
import type { PartnerInvoice } from "@/lib/pro/mock-tables"
import { createServerSupabase } from "@/lib/supabase/server"
import { getCurrentPartnerProfile } from "@/lib/auth/partner-profile"
import { listPartnerInvoices } from "@/lib/finance/invoice-actions"

export const metadata = { title: "Mes factures | Espace Pro Easy2Book" }

export const dynamic = "force-dynamic"

const STATUS_MAP: Record<string, PartnerInvoice["status"]> = {
  draft: "pending",
  issued: "pending",
  paid: "paid",
  partial: "partial",
  overdue: "overdue",
  cancelled: "unpaid",
}

export default async function ProInvoicesPage() {
  const supabase = await createServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect("/pro/login")

  const profile = await getCurrentPartnerProfile(user.id)
  if (!profile) redirect("/pro/login")

  const invoices = await listPartnerInvoices(profile.agency.id, user.id)

  const rows: PartnerInvoice[] = invoices.map((inv) => ({
    id: inv.id,
    number: inv.invoiceNumber,
    date: inv.validationDate ?? "",
    amount: Number(inv.totalTtc),
    status: STATUS_MAP[inv.status] ?? "pending",
    type: inv.invoiceType as PartnerInvoice["type"],
    validatedAt: inv.validationDate ?? undefined,
    totalHT: Number(inv.totalHt),
    totalTVA: Number(inv.totalTva),
    totalSales: Number(inv.totalTtc),
    paidAmount: Number(inv.amountPaid),
    reservationId: inv.reservationId ?? undefined,
  }))

  return (
    <ProPageShell
      icon={FileText}
      title="Mes factures"
      description="Historique de facturation (Factures · Avoirs · Proforma)."
    >
      <InvoicesTable rows={rows} />
    </ProPageShell>
  )
}
