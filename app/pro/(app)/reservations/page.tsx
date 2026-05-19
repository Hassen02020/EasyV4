import { Calendar } from "lucide-react"
import { ProPageShell } from "@/components/pro/pro-page-shell"
import { ReservationsTable } from "@/components/pro/reservations-table"
import { generateMockReservations } from "@/lib/pro/mock-tables"

export const metadata = { title: "Mes réservations | Espace Pro Easy2Book" }

export const dynamic = "force-dynamic"

export default function ProReservationsPage() {
  const rows = generateMockReservations()
  return (
    <ProPageShell
      icon={Calendar}
      title="Mes réservations"
      description="Suivez et gérez l'ensemble des dossiers de vos clients."
    >
      <ReservationsTable rows={rows} />
    </ProPageShell>
  )
}
