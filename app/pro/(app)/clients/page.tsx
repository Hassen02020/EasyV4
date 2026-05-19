import { Users } from "lucide-react"
import { ProPageShell } from "@/components/pro/pro-page-shell"
import { ClientsTable } from "@/components/pro/clients-table"
import { generateMockClients } from "@/lib/pro/mock-tables"

export const metadata = { title: "Mes clients | Espace Pro Easy2Book" }

export const dynamic = "force-dynamic"

export default function ProClientsPage() {
  const rows = generateMockClients()
  return (
    <ProPageShell
      icon={Users}
      title="Mes clients"
      description="Annuaire des clients finaux liés aux dossiers de votre agence."
      iconTone="secondary"
    >
      <ClientsTable rows={rows} />
    </ProPageShell>
  )
}
