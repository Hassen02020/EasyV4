import { ScrollText } from "lucide-react"
import { ProPageShell } from "@/components/pro/pro-page-shell"
import { LedgerReport } from "@/components/pro/ledger-report"
import { generateMockLedger } from "@/lib/pro/mock-tables"

export const metadata = { title: "Relevé de compte | Espace Pro Easy2Book" }

export const dynamic = "force-dynamic"

export default function ProReleveComptePage() {
  const rows = generateMockLedger()
  // Solde mock — sera lu depuis partner_agencies.deposit_balance en phase 9.
  const currentBalance = 12_540.5

  return (
    <ProPageShell
      icon={ScrollText}
      title="Relevé de compte"
      description="Générez un rapport détaillé débits / crédits sur une période."
      iconTone="secondary"
    >
      <LedgerReport rows={rows} currentBalance={currentBalance} />
    </ProPageShell>
  )
}
