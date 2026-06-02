import { redirect } from "next/navigation"
import { createServerSupabase } from "@/lib/supabase/server"
import { getCurrentAdminProfile } from "@/lib/auth/profile"
import { getAgencyBalance, getMovements } from "@/lib/finance/ledger"
import {
  Wallet,
  TrendingDown,
  TrendingUp,
  RefreshCw,
  SlidersHorizontal,
  AlertTriangle,
} from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"

export const dynamic = "force-dynamic"

const MOVEMENT_CONFIG = {
  credit:     { label: "Recharge",    color: "bg-emerald-100 text-emerald-800", icon: TrendingUp,   sign: "+" },
  debit:      { label: "Débit",       color: "bg-red-100 text-red-800",         icon: TrendingDown, sign: "-" },
  refund:     { label: "Remboursement", color: "bg-blue-100 text-blue-800",     icon: RefreshCw,    sign: "+" },
  adjustment: { label: "Ajustement",  color: "bg-gray-100 text-gray-700",       icon: SlidersHorizontal, sign: "±" },
}

function formatTnd(v: number) {
  return v.toLocaleString("fr-FR", { minimumFractionDigits: 3, maximumFractionDigits: 3 })
}

export default async function WalletPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>
}) {
  const { page: pageParam } = await searchParams
  const page = Math.max(1, parseInt(pageParam ?? "1", 10))
  const limit = 20
  const offset = (page - 1) * limit

  const supabase = await createServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect("/pro/login?next=/b2b/wallet")

  const profile = await getCurrentAdminProfile(user.id)
  if (!profile) redirect("/pro/login?next=/b2b/wallet")

  const [balanceRes, movementsRes] = await Promise.all([
    getAgencyBalance(profile.agencyId),
    getMovements({ agencyId: profile.agencyId, limit, offset }),
  ])

  const balance = balanceRes.ok ? balanceRes.data : null
  const movements = movementsRes.ok ? movementsRes.data.movements : []
  const total = movementsRes.ok ? movementsRes.data.total : 0
  const totalPages = Math.ceil(total / limit)

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-foreground text-2xl font-bold">Mon Wallet</h1>
        <p className="text-muted-foreground text-sm">
          Historique complet de votre compte de dépôt
        </p>
      </div>

      {/* Balance card */}
      {balance && (
        <Card className={balance.isLow ? "border-amber-400 bg-amber-50/50" : ""}>
          <CardContent className="flex items-center justify-between py-5">
            <div className="flex items-center gap-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-[#1e3a5f]/10">
                <Wallet className="h-6 w-6 text-[#1e3a5f]" />
              </div>
              <div>
                <p className="text-muted-foreground text-sm">Solde disponible</p>
                <p className="text-foreground text-3xl font-bold">
                  {formatTnd(balance.balance)}{" "}
                  <span className="text-muted-foreground text-lg font-normal">DT</span>
                </p>
              </div>
            </div>
            {balance.isLow && (
              <div className="flex items-center gap-2 rounded-lg border border-amber-300 bg-amber-100 px-4 py-2 text-amber-700">
                <AlertTriangle className="h-4 w-4" />
                <div>
                  <p className="text-xs font-semibold">Solde bas</p>
                  <p className="text-xs">
                    Seuil: {formatTnd(balance.creditLowThreshold)} DT
                  </p>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Movements table */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            Historique des mouvements
            <span className="text-muted-foreground ml-2 text-sm font-normal">
              ({total} au total)
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {movements.length === 0 ? (
            <p className="text-muted-foreground py-10 text-center text-sm">
              Aucun mouvement enregistré.
            </p>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-border bg-muted/40 border-b">
                      <th className="px-4 py-3 text-left font-medium text-gray-500">Date</th>
                      <th className="px-4 py-3 text-left font-medium text-gray-500">Type</th>
                      <th className="px-4 py-3 text-left font-medium text-gray-500">Description</th>
                      <th className="px-4 py-3 text-left font-medium text-gray-500">Référence</th>
                      <th className="px-4 py-3 text-right font-medium text-gray-500">Montant</th>
                      <th className="px-4 py-3 text-right font-medium text-gray-500">Solde après</th>
                    </tr>
                  </thead>
                  <tbody className="divide-border divide-y">
                    {movements.map((m) => {
                      const cfg = MOVEMENT_CONFIG[m.movementType]
                      const Icon = cfg.icon
                      const isDebit = m.movementType === "debit"
                      return (
                        <tr key={m.id} className="hover:bg-muted/30 transition-colors">
                          <td className="text-muted-foreground whitespace-nowrap px-4 py-3 text-xs">
                            {new Date(m.createdAt).toLocaleDateString("fr-FR", {
                              day: "2-digit",
                              month: "short",
                              year: "numeric",
                              hour: "2-digit",
                              minute: "2-digit",
                            })}
                          </td>
                          <td className="px-4 py-3">
                            <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${cfg.color}`}>
                              <Icon className="h-3 w-3" />
                              {cfg.label}
                            </span>
                          </td>
                          <td className="text-foreground px-4 py-3">
                            {m.description ?? "—"}
                          </td>
                          <td className="px-4 py-3 font-mono text-xs text-gray-500">
                            {m.reference ?? "—"}
                          </td>
                          <td className={`px-4 py-3 text-right font-bold ${isDebit ? "text-red-600" : "text-emerald-600"}`}>
                            {cfg.sign}{formatTnd(Math.abs(m.amount))} DT
                          </td>
                          <td className="text-foreground px-4 py-3 text-right font-medium">
                            {formatTnd(m.balanceAfter)} DT
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>

              {/* Pagination */}
              {totalPages > 1 && (
                <div className="border-border flex items-center justify-between border-t px-4 py-3">
                  <p className="text-muted-foreground text-xs">
                    Page {page} / {totalPages}
                  </p>
                  <div className="flex gap-2">
                    {page > 1 && (
                      <a
                        href={`/b2b/wallet?page=${page - 1}`}
                        className="border-border rounded-md border px-3 py-1.5 text-xs font-medium transition-colors hover:bg-gray-50"
                      >
                        ← Précédent
                      </a>
                    )}
                    {page < totalPages && (
                      <a
                        href={`/b2b/wallet?page=${page + 1}`}
                        className="bg-[#1e3a5f] rounded-md px-3 py-1.5 text-xs font-medium text-white transition-opacity hover:opacity-90"
                      >
                        Suivant →
                      </a>
                    )}
                  </div>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
