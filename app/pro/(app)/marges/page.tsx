import { Percent } from "lucide-react"
import { ProPageShell } from "@/components/pro/pro-page-shell"
import { MarginsForm, type MarginRow } from "@/components/pro/margins-form"
import { getActivePartnerMargins } from "@/lib/pro/server-context"
import type { MarginModule } from "@/lib/pro/pricing"

export const metadata = { title: "Marges de vente | Espace Pro Easy2Book" }

export const dynamic = "force-dynamic"

const MODULES: MarginModule[] = [
  "hotel",
  "flight",
  "omra",
  "package",
  "activity",
  "transfer",
]

export default async function ProMarginsPage() {
  // Phase 9 : lit la table pricing_margins via getActivePartnerMargins
  // (fallback DEFAULT_MARGINS si la BDD n'est pas joignable).
  const map = await getActivePartnerMargins()
  const initial: MarginRow[] = MODULES.map((m) => ({
    module: m,
    marginType: map[m].marginType,
    marginValue: map[m].marginValue,
    isActive: map[m].isActive,
  }))

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
