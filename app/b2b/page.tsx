import { redirect } from "next/navigation"
import { createServerSupabase } from "@/lib/supabase/server"
import { getCurrentAdminProfile } from "@/lib/auth/profile"
import { getAgencyBalance, getMovements } from "@/lib/finance/ledger"
import {
  Wallet,
  TrendingDown,
  TrendingUp,
  AlertTriangle,
  ArrowRight,
} from "lucide-react"
import Link from "next/link"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"

export const dynamic = "force-dynamic"

function formatTnd(v: number) {
  return v.toLocaleString("fr-FR", {
    minimumFractionDigits: 3,
    maximumFractionDigits: 3,
  })
}

export default async function B2BDashboard() {
  const supabase = await createServerSupabase()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect("/pro/login?next=/b2b")

  const profile = await getCurrentAdminProfile(user.id)
  if (!profile) redirect("/pro/login?next=/b2b")

  const [balanceRes, movementsRes] = await Promise.all([
    getAgencyBalance(profile.agencyId),
    getMovements({ agencyId: profile.agencyId, limit: 5 }),
  ])

  const balance = balanceRes.ok ? balanceRes.data : null
  const recentMovements = movementsRes.ok ? movementsRes.data.movements : []

  const totalDebits = recentMovements
    .filter((m) => m.movementType === "debit")
    .reduce((s, m) => s + Math.abs(m.amount), 0)

  const totalCredits = recentMovements
    .filter((m) => m.movementType === "credit" || m.movementType === "refund")
    .reduce((s, m) => s + m.amount, 0)

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-foreground text-2xl font-bold">Dashboard</h1>
        <p className="text-muted-foreground text-sm">
          Bienvenue, {profile.name ?? user.email}
        </p>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {/* Solde */}
        <Card className={balance?.isLow ? "border-amber-400" : ""}>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Solde Wallet</CardTitle>
            <Wallet className="text-muted-foreground h-4 w-4" />
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">
              {balance ? formatTnd(balance.balance) : "—"}{" "}
              <span className="text-muted-foreground text-base font-normal">
                DT
              </span>
            </p>
            {balance?.isLow && (
              <div className="mt-2 flex items-center gap-1.5 text-amber-600">
                <AlertTriangle className="h-3.5 w-3.5" />
                <span className="text-xs font-medium">Solde bas</span>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Débits récents */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">
              Débits (5 derniers)
            </CardTitle>
            <TrendingDown className="h-4 w-4 text-red-500" />
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-red-600">
              -{formatTnd(totalDebits)}{" "}
              <span className="text-muted-foreground text-base font-normal">
                DT
              </span>
            </p>
          </CardContent>
        </Card>

        {/* Crédits récents */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">
              Crédits (5 derniers)
            </CardTitle>
            <TrendingUp className="h-4 w-4 text-emerald-500" />
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-emerald-600">
              +{formatTnd(totalCredits)}{" "}
              <span className="text-muted-foreground text-base font-normal">
                DT
              </span>
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Recent movements */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base">Derniers mouvements</CardTitle>
          <Button variant="ghost" size="sm" asChild>
            <Link href="/b2b/wallet" className="gap-1">
              Voir tout <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </Button>
        </CardHeader>
        <CardContent>
          {recentMovements.length === 0 ? (
            <p className="text-muted-foreground py-6 text-center text-sm">
              Aucun mouvement enregistré.
            </p>
          ) : (
            <div className="divide-border divide-y">
              {recentMovements.map((m) => {
                const isDebit = m.movementType === "debit"
                return (
                  <div
                    key={m.id}
                    className="flex items-center justify-between py-3"
                  >
                    <div>
                      <p className="text-foreground text-sm font-medium">
                        {m.description ?? m.movementType}
                      </p>
                      <p className="text-muted-foreground text-xs">
                        {new Date(m.createdAt).toLocaleDateString("fr-FR", {
                          day: "2-digit",
                          month: "short",
                          year: "numeric",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                        {m.reference && (
                          <span className="ml-2 font-mono">{m.reference}</span>
                        )}
                      </p>
                    </div>
                    <div className="text-right">
                      <p
                        className={`font-bold ${isDebit ? "text-red-600" : "text-emerald-600"}`}
                      >
                        {isDebit ? "-" : "+"}
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
