import { CreditCard } from "lucide-react"
import { ProPageShell } from "@/components/pro/pro-page-shell"
import { PaymentsTable } from "@/components/pro/payments-table"
import { generateMockPayments } from "@/lib/pro/mock-tables"

export const metadata = { title: "Mes paiements | Espace Pro Easy2Book" }

export const dynamic = "force-dynamic"

export default function ProPaymentsPage() {
  const rows = generateMockPayments()
  return (
    <ProPageShell
      icon={CreditCard}
      title="Mes paiements"
      description="Liste des règlements émis et reçus par votre agence."
      iconTone="accent"
    >
      <PaymentsTable rows={rows} />
    </ProPageShell>
  )
}
