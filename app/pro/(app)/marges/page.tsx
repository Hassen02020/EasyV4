import { Percent } from "lucide-react"
import { ProPageShell, ProPagePlaceholder } from "@/components/pro/pro-page-shell"

export const metadata = { title: "Marges de vente | Espace Pro Easy2Book" }

export default function ProMargesPage() {
  return (
    <ProPageShell
      icon={Percent}
      title="Marges de vente"
      iconTone="accent"
      description="Configurez votre markup (pourcentage ou montant fixe) par module."
    >
      <ProPagePlaceholder
        title="Configuration des marges"
        hint="Formulaire Marge SHT (% ou DT fixe) par module hôtel/transfert/activité/formule — connecté à pricing_margins en phase 8 et appliqué aux prix affichés en phase 9."
      />
    </ProPageShell>
  )
}
