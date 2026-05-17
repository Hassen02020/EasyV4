import { FileText } from "lucide-react"
import { ProPageShell, ProPagePlaceholder } from "@/components/pro/pro-page-shell"

export const metadata = { title: "Mes factures | Espace Pro Easy2Book" }

export default function ProFacturesPage() {
  return (
    <ProPageShell
      icon={FileText}
      title="Mes factures"
      description="Liste des factures, avoirs et proformas émis pour vos dossiers."
    >
      <ProPagePlaceholder
        title="Liste des factures"
        hint="Tableau (N° · TYPE · DATE · TVA · VENTE · PAYÉ · ACTIONS) connecté à partner_invoices en phase 7."
      />
    </ProPageShell>
  )
}
