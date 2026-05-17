import { Calendar } from "lucide-react"
import { ProPageShell, ProPagePlaceholder } from "@/components/pro/pro-page-shell"

export const metadata = { title: "Mes réservations | Espace Pro Easy2Book" }

export default function ProReservationsPage() {
  return (
    <ProPageShell
      icon={Calendar}
      title="Mes réservations"
      description="Suivez et gérez l'ensemble des dossiers de vos clients."
    >
      <ProPagePlaceholder
        title="Liste des réservations"
        hint="Le tableau filtres + actions (Consulter, Imprimer devis, Facture proforma, Annulation) sera connecté aux données partner_* en phase 7."
      />
    </ProPageShell>
  )
}
