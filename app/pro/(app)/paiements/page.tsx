import { Receipt } from "lucide-react"
import { ProPageShell, ProPagePlaceholder } from "@/components/pro/pro-page-shell"

export const metadata = { title: "Mes paiements | Espace Pro Easy2Book" }

export default function ProPaiementsPage() {
  return (
    <ProPageShell
      icon={Receipt}
      title="Mes paiements"
      description="Liste des règlements émis : modes, échéances, montants."
    >
      <ProPagePlaceholder
        title="Liste des règlements"
        hint="Tableau (DATE · MODE · ÉCHÉANCE · ÉMISSION · ORIGINE · RESTANT · CRÉDIT · FACTURE) connecté à partner_payments en phase 7."
      />
    </ProPageShell>
  )
}
