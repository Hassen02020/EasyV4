import { redirect } from "next/navigation"
import { Banknote, CreditCard } from "lucide-react"
import { ProPageShell } from "@/components/pro/pro-page-shell"
import { PaymentsTable } from "@/components/pro/payments-table"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { WalletRechargeForm } from "@/components/b2b/wallet-recharge-form"
import { createServerSupabase } from "@/lib/supabase/server"
import { getCurrentPartnerProfile } from "@/lib/auth/partner-profile"
import { loadPartnerPayments } from "@/lib/pro/partner-data"

export const metadata = { title: "Mes paiements | Espace Pro Easy2Book" }

export const dynamic = "force-dynamic"

export default async function ProPaymentsPage() {
  const supabase = await createServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect("/pro/login")

  const profile = await getCurrentPartnerProfile(user.id)
  if (!profile) redirect("/pro/login")

  const rows = await loadPartnerPayments(profile.agency.id)

  return (
    <ProPageShell
      icon={CreditCard}
      title="Mes paiements"
      description="Historique de vos demandes de recharge wallet."
      iconTone="accent"
    >
      <div className="space-y-6">
        {/* Formulaire de recharge — jusqu'ici uniquement accessible via
            /b2b/wallet ; /pro/paiements n'affichait que l'historique en
            lecture seule sans aucun moyen de soumettre une nouvelle demande
            depuis le portail principal. Réutilise le même composant réel
            (submitRechargeRequest) plutôt que d'en dupliquer un second. */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Banknote className="h-5 w-5" />
              Demander une recharge
            </CardTitle>
          </CardHeader>
          <CardContent>
            <WalletRechargeForm agencyId={profile.agency.id} userId={user.id} />
          </CardContent>
        </Card>

        <PaymentsTable rows={rows} />
      </div>
    </ProPageShell>
  )
}
