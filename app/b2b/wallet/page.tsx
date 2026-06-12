import { redirect } from "next/navigation"
import { createServerSupabase } from "@/lib/supabase/server"
import { getCurrentAdminProfile } from "@/lib/auth/profile"
import { getAgencyBalance, getMovements } from "@/lib/finance/ledger"
import { getDb } from "@/lib/db/client"
import { walletRechargeRequests } from "@/lib/db/schema"
import { eq, desc } from "drizzle-orm"
import {
  Wallet,
  TrendingDown,
  TrendingUp,
  Clock,
  CheckCircle2,
  XCircle,
  Banknote,
  Building2,
  Mail,
  CreditCard,
} from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { WalletRechargeForm } from "@/components/b2b/wallet-recharge-form"

export const dynamic = "force-dynamic"

export const metadata = {
  title: "Mon Portefeuille — Easy2Book B2B",
}

function formatTnd(v: number) {
  return v.toLocaleString("fr-FR", {
    minimumFractionDigits: 3,
    maximumFractionDigits: 3,
  })
}

const METHOD_LABELS: Record<string, string> = {
  cash: "Espèces",
  bank_transfer: "Virement bancaire",
  postal_transfer: "Virement postal",
  postal_mandate: "Mandat postal",
  check: "Chèque",
  card_international: "Carte internationale",
}

const STATUS_CONFIG = {
  pending: { label: "En attente", variant: "secondary" as const, Icon: Clock },
  validated: { label: "Validée", variant: "default" as const, Icon: CheckCircle2 },
  rejected: { label: "Refusée", variant: "destructive" as const, Icon: XCircle },
}

export default async function WalletPage() {
  const supabase = await createServerSupabase()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect("/pro/login?next=/b2b/wallet")

  const profile = await getCurrentAdminProfile(user.id)
  if (!profile) redirect("/pro/login?next=/b2b/wallet")

  const [balanceRes, movementsRes] = await Promise.all([
    getAgencyBalance(profile.agencyId),
    getMovements({ agencyId: profile.agencyId, limit: 20 }),
  ])

  const balance = balanceRes.ok ? balanceRes.data : null
  const movements = movementsRes.ok ? movementsRes.data.movements : []

  // Récupérer les dernières demandes de recharge
  const db = getDb()
  const rechargeRequests = await db
    .select()
    .from(walletRechargeRequests)
    .where(eq(walletRechargeRequests.agencyId, profile.agencyId))
    .orderBy(desc(walletRechargeRequests.createdAt))
    .limit(10)

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Mon Portefeuille</h1>
        <p className="text-muted-foreground">
          Gérez votre solde, soumettez des recharges et consultez vos mouvements.
        </p>
      </div>

      {/* Solde */}
      <Card className={balance?.isLow ? "border-amber-400" : ""}>
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardTitle className="text-sm font-medium">Solde disponible</CardTitle>
          <Wallet className="text-muted-foreground h-5 w-5" />
        </CardHeader>
        <CardContent>
          <p className="text-3xl font-bold">
            {balance ? formatTnd(balance.balance) : "—"}{" "}
            <span className="text-muted-foreground text-lg font-normal">DT</span>
          </p>
          {balance?.isLow && (
            <p className="mt-1 text-sm text-amber-600">
              ⚠ Solde en dessous du seuil ({formatTnd(balance.threshold)} DT)
            </p>
          )}
        </CardContent>
      </Card>

      {/* Formulaire de recharge */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Banknote className="h-5 w-5" />
            Demander une recharge
          </CardTitle>
        </CardHeader>
        <CardContent>
          <WalletRechargeForm
            agencyId={profile.agencyId}
            userId={user.id}
          />
        </CardContent>
      </Card>

      {/* Demandes de recharge récentes */}
      {rechargeRequests.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Demandes de recharge</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="divide-border divide-y">
              {rechargeRequests.map((req) => {
                const cfg = STATUS_CONFIG[req.status as keyof typeof STATUS_CONFIG]
                return (
                  <div
                    key={req.id}
                    className="flex items-center justify-between py-3"
                  >
                    <div className="space-y-0.5">
                      <p className="text-sm font-medium">
                        {formatTnd(parseFloat(req.amount))} DT —{" "}
                        {METHOD_LABELS[req.method] ?? req.method}
                      </p>
                      {req.paymentReference && (
                        <p className="text-muted-foreground text-xs">
                          Réf: {req.paymentReference}
                        </p>
                      )}
                      <p className="text-muted-foreground text-xs">
                        {new Date(req.createdAt).toLocaleDateString("fr-FR", {
                          day: "numeric",
                          month: "short",
                          year: "numeric",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </p>
                    </div>
                    <Badge variant={cfg?.variant ?? "secondary"}>
                      {cfg?.label ?? req.status}
                    </Badge>
                  </div>
                )
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Historique des mouvements */}
      <Card>
        <CardHeader>
          <CardTitle>Historique des mouvements</CardTitle>
        </CardHeader>
        <CardContent>
          {movements.length === 0 ? (
            <p className="text-muted-foreground text-sm">
              Aucun mouvement enregistré.
            </p>
          ) : (
            <div className="divide-border divide-y">
              {movements.map((m) => {
                const isCredit = m.movementType === "credit" || m.movementType === "refund"
                return (
                  <div
                    key={m.id}
                    className="flex items-center justify-between py-3"
                  >
                    <div className="flex items-center gap-3">
                      {isCredit ? (
                        <TrendingUp className="h-4 w-4 text-green-600" />
                      ) : (
                        <TrendingDown className="h-4 w-4 text-red-600" />
                      )}
                      <div>
                        <p className="text-sm font-medium">
                          {m.description ?? m.movementType}
                        </p>
                        <p className="text-muted-foreground text-xs">
                          {new Date(m.createdAt).toLocaleDateString("fr-FR", {
                            day: "numeric",
                            month: "short",
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p
                        className={`text-sm font-semibold ${isCredit ? "text-green-600" : "text-red-600"}`}
                      >
                        {isCredit ? "+" : "−"}
                        {formatTnd(Math.abs(m.amount))} DT
                      </p>
                      <p className="text-muted-foreground text-xs">
                        Solde: {formatTnd(m.balanceAfter)} DT
                      </p>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
