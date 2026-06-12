import { FileText } from "lucide-react"
import { ProPageShell } from "@/components/pro/pro-page-shell"
import { InvoicesTable } from "@/components/pro/invoices-table"

export const metadata = { title: "Mes factures | Espace Pro Easy2Book" }

export const dynamic = "force-dynamic"

export default function ProInvoicesPage() {
  return (
    <ProPageShell
      icon={FileText}
      title="Mes factures"
      description="Historique de facturation (Factures · Avoirs · Proforma)."
    >
      <InvoicesTable rows={[]} />
    </ProPageShell>
  )
}
