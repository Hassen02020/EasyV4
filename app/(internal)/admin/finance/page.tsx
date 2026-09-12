/**
 * /admin/finance — Dashboard financier cross-agences.
 *
 * Guards :
 *   - Session Supabase requise
 *   - Rôles autorisés : super_admin | manager | agent_compta
 *
 * KPIs réels depuis Drizzle (partnerCreditMovements + walletRechargeRequests).
 * Table interactive des mouvements avec export CSV.
 */

import { Suspense } from "react"
import { redirect } from "next/navigation"
import {
  ArrowDownCircle,
  ArrowUpCircle,
  Clock,
  TrendingUp,
  Wallet,
} from "lucide-react"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { createServerSupabase } from "@/lib/supabase/server"
import { getCurrentAdminProfile } from "@/lib/auth/profile"
import {
  loadFinanceKpis,
  loadFinanceMovements,
  loadRechargeRequests,
} from "@/lib/admin/finance-data"
import { logger } from "@/lib/logger"
import nextDynamic from "next/dynamic"
import { Skeleton } from "@/components/ui/skeleton"

const FinanceDataTable = nextDynamic(() =>
  import("@/components/admin/finance-data-table").then(
    (m) => m.FinanceDataTable,
  ),
)

export const metadata = {
  title: "Finance | Admin Easy2Book",
}

export const dynamic = "force-dynamic"

const ALLOWED_ROLES = ["super_admin", "manager", "agent_compta"] as const
type AllowedRole = (typeof ALLOWED_ROLES)[number]

const fmt3 = new Intl.NumberFormat("fr-FR", {
  minimumFractionDigits: 3,
  maximumFractionDigits: 3,
})

const RECHARGE_METHOD_LABEL: Record<string, string> = {
  cash: "Espèces",
  bank_transfer: "Virement bancaire",
  postal_transfer: "Virement postal",
  postal_mandate: "Mandat postal",
  check: "Chèque",
  card_international: "Carte internationale",
}

const RECHARGE_STATUS_META: Record<
  string,
  { label: string; className: string }
> = {
  pending: {
    label: "En attente",
    className: "border-amber-300 bg-amber-100 text-amber-800",
  },
  validated: {
    label: "Validée",
    className: "border-emerald-300 bg-emerald-100 text-emerald-800",
  },
  rejected: {
    label: "Refusée",
    className: "border-red-300 bg-red-100 text-red-800",
  },
}

export default async function AdminFinancePage() {
  const supabase = await createServerSupabase()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) redirect("/login?next=/admin/finance")

  const profile = await getCurrentAdminProfile(user.id)
  if (!profile) redirect("/login")

  if (!ALLOWED_ROLES.includes(profile.role as AllowedRole)) {
    logger.warn("Unauthorized access attempt to /admin/finance", {
      userId: user.id,
      role: profile.role,
    })
    redirect("/admin")
  }

  const [kpis, movements, rechargesPending] = await Promise.all([
    loadFinanceKpis(),
    loadFinanceMovements({ limit: 200 }),
    loadRechargeRequests({ status: "pending" }),
  ])

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-foreground text-3xl font-bold tracking-tight">
            Finance
          </h1>
          <p className="text-muted-foreground mt-1 text-sm">
            Mouvements wallet, recharges et soldes des agences partenaires.
          </p>
        </div>
        {rechargesPending.length > 0 ? (
          <Badge
            variant="outline"
            className="border-amber-300 bg-amber-100 text-amber-800 text-xs"
          >
            <Clock className="mr-1 h-3 w-3" />
            {rechargesPending.length} recharge
            {rechargesPending.length > 1 ? "s" : ""} en attente
          </Badge>
        ) : null}
      </div>

      {/* KPI Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">
              Recharges (30 j)
            </CardTitle>
            <ArrowUpCircle className="h-4 w-4 text-emerald-500" />
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold tabular-nums">
              {fmt3.format(kpis.totalCreditsMonth)} DT
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">
              Débits (30 j)
            </CardTitle>
            <ArrowDownCircle className="h-4 w-4 text-red-500" />
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold tabular-nums text-red-600">
              {fmt3.format(kpis.totalDebitsMonth)} DT
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">
              Recharges en attente
            </CardTitle>
            <Clock className="h-4 w-4 text-amber-500" />
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold tabular-nums">
              {kpis.pendingRechargesCount}
            </p>
            <p className="text-muted-foreground text-xs">
              {fmt3.format(kpis.pendingRechargesAmount)} DT total
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">
              Solde total actif
            </CardTitle>
            <Wallet className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent>
            <p className="text-primary text-2xl font-bold tabular-nums">
              {fmt3.format(kpis.totalWalletBalance)} DT
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="movements">
        <TabsList>
          <TabsTrigger value="movements">
            <TrendingUp className="mr-2 h-4 w-4" />
            Mouvements
          </TabsTrigger>
          <TabsTrigger value="recharges">
            <Clock className="mr-2 h-4 w-4" />
            Demandes de recharge
            {rechargesPending.length > 0 ? (
              <Badge className="ml-2 h-4 w-4 justify-center rounded-full p-0 text-[10px]">
                {rechargesPending.length}
              </Badge>
            ) : null}
          </TabsTrigger>
        </TabsList>

        {/* Mouvements */}
        <TabsContent value="movements" className="mt-4">
          <Suspense
            fallback={
              <div className="space-y-2">
                <Skeleton className="h-9 w-full" />
                {Array.from({ length: 8 }).map((_, i) => (
                  <Skeleton key={i} className="h-12 w-full" />
                ))}
              </div>
            }
          >
            <FinanceDataTable data={movements.rows} />
          </Suspense>
        </TabsContent>

        {/* Demandes de recharge */}
        <TabsContent value="recharges" className="mt-4">
          <div className="border-border/60 bg-card shadow-e2b-soft overflow-hidden rounded-2xl border">
            <div className="border-border/40 border-b px-4 py-3">
              <p className="text-sm font-semibold">
                Demandes en attente de validation
              </p>
            </div>
            {rechargesPending.length === 0 ? (
              <div className="text-muted-foreground py-12 text-center text-sm">
                Aucune demande en attente.
              </div>
            ) : (
              <div className="divide-y">
                {rechargesPending.map((req) => {
                  const statusMeta =
                    RECHARGE_STATUS_META[req.status] ??
                    RECHARGE_STATUS_META["pending"]!
                  return (
                    <div
                      key={req.id}
                      className="hover:bg-muted/30 flex flex-wrap items-center justify-between gap-4 px-4 py-3 transition-colors"
                    >
                      <div className="min-w-0">
                        <p className="text-sm font-semibold">
                          {req.agencyName || "—"}
                        </p>
                        <p className="text-muted-foreground text-xs">
                          {RECHARGE_METHOD_LABEL[req.method] ?? req.method}
                          {req.paymentReference
                            ? ` · ${req.paymentReference}`
                            : ""}
                        </p>
                        {req.note ? (
                          <p className="text-muted-foreground mt-0.5 max-w-[320px] truncate text-xs">
                            {req.note}
                          </p>
                        ) : null}
                      </div>

                      <div className="flex items-center gap-3">
                        <span className="text-sm font-bold tabular-nums">
                          {fmt3.format(req.amount)} DT
                        </span>
                        <Badge
                          variant="outline"
                          className={statusMeta.className}
                        >
                          {statusMeta.label}
                        </Badge>
                        <span className="text-muted-foreground text-xs">
                          {new Date(req.createdAt).toLocaleDateString("fr-FR")}
                        </span>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  )
}
