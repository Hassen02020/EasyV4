import { ScrollText } from "lucide-react"
import { ProPageShell, ProPagePlaceholder } from "@/components/pro/pro-page-shell"

export const metadata = { title: "Relevé de compte | Espace Pro Easy2Book" }

export default function ProReleveComptePage() {
  return (
    <ProPageShell
      icon={ScrollText}
      title="Relevé de compte"
      description="Générez un rapport détaillé débits / crédits sur une période."
    >
      <ProPagePlaceholder
        title="Générateur de relevé"
        hint="Sélecteurs (plage de dates, type Factures&Avoirs / Réservation, bouton Générer rapport) connectés au ledger partner_credit_movements en phase 7."
      />
    </ProPageShell>
  )
}
