import { Percent } from "lucide-react"
import { ProPageShell } from "@/components/pro/pro-page-shell"
import {
  MarginsForm,
  type MarginRow,
} from "@/components/pro/margins-form"

export const metadata = { title: "Marges de vente | Espace Pro Easy2Book" }

export const dynamic = "force-dynamic"

export default function ProMarginsPage() {
  // TODO Phase 9 : SELECT pricing_margins WHERE agency_id = current
  const initial: MarginRow[] = [
    { module: "hotel", marginType: "percent", marginValue: 10, isActive: true },
    { module: "flight", marginType: "fixed", marginValue: 25, isActive: true },
    { module: "omra", marginType: "percent", marginValue: 8, isActive: true },
    { module: "package", marginType: "percent", marginValue: 12, isActive: true },
    { module: "activity", marginType: "percent", marginValue: 15, isActive: true },
    { module: "transfer", marginType: "fixed", marginValue: 10, isActive: false },
  ]

  return (
    <ProPageShell
      icon={Percent}
      title="Marges de vente"
      iconTone="accent"
      description="Définissez la marge SHT appliquée à chaque module (% ou montant fixe TND)."
    >
      <MarginsForm initial={initial} />
    </ProPageShell>
  )
}
