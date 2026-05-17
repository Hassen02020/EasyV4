import { UserCircle } from "lucide-react"
import { ProPageShell, ProPagePlaceholder } from "@/components/pro/pro-page-shell"

export const metadata = { title: "Mes clients | Espace Pro Easy2Book" }

export default function ProClientsPage() {
  return (
    <ProPageShell
      icon={UserCircle}
      title="Mes clients"
      description="Annuaire clients de votre agence (nom, téléphone, e-mail)."
    >
      <ProPagePlaceholder
        title="Liste des clients"
        hint="Le tableau (NOM · TEL · EMAIL) + recherche par mots-clés sera connecté à customers en phase 7."
      />
    </ProPageShell>
  )
}
