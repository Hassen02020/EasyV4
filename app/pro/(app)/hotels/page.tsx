import { BedDouble } from "lucide-react"
import { ProPageShell, ProPagePlaceholder } from "@/components/pro/pro-page-shell"

export const metadata = {
  title: "Recherche hôtels — SERP | Espace Pro Easy2Book",
}

export default function ProHotelsSerpPage() {
  return (
    <ProPageShell
      icon={BedDouble}
      title="Résultats de recherche — Hôtels"
      iconTone="accent"
      description="Liste des hôtels disponibles selon votre destination et vos dates."
    >
      <ProPagePlaceholder
        title="SERP Hôtels en cours de construction"
        hint="Cards avec tabs Résumé/Détails, badge RECOMMENDED, chips pension (LP/PD/DP/AI) et filtres latéraux — livraison en phase 4."
      />
    </ProPageShell>
  )
}
