import { Users } from "lucide-react"
import { ProPageShell, ProPagePlaceholder } from "@/components/pro/pro-page-shell"

export const metadata = { title: "Gestion des utilisateurs | Espace Pro Easy2Book" }

export default function ProUtilisateursPage() {
  return (
    <ProPageShell
      icon={Users}
      title="Gestion des utilisateurs"
      description="Créez et gérez les comptes Owner / Agent de votre agence."
    >
      <ProPagePlaceholder
        title="Comptes de votre agence"
        hint="Liste des partner_users + CRUD (invite, suspendre, supprimer) avec contrôle de quota — connecté en phase 8."
      />
    </ProPageShell>
  )
}
