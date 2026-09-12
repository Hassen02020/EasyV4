/**
 * Module Comptabilité — Manager/Agent Compta
 *
 * Tableau de bord financier avec KPIs, paiements et rapports.
 *
 * Phase 18 : remplace MOCK_PAYMENTS/MOCK_INVOICES/stats fabriqués
 * (dont un badge de croissance "+12.5%" inventé) par de vraies requêtes
 * (lib/admin/accounting-data.ts, lib/finance/invoice-actions.ts) — même
 * structure/onglets que la version précédente (pas de refonte du
 * dashboard, seulement les données).
 */

import { Metadata } from "next"
import Link from "next/link"
import { redirect } from "next/navigation"
import {
  DollarSign,
  TrendingUp,
  CreditCard,
  FileText,
  Wallet,
} from "lucide-react"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Badge } from "@/components/ui/badge"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { createServerSupabase } from "@/lib/supabase/server"
import { getCurrentAdminProfile } from "@/lib/auth/profile"
import {
  loadAccountingStats,
  loadRecentPayments,
  loadMonthlyRevenueReport,
} from "@/lib/admin/accounting-data"
import { listAdminInvoices } from "@/lib/finance/invoice-actions"

export const metadata: Metadata = {
  title: "Comptabilité — Manager",
  description: "Gestion financière et rapports",
}

export const dynamic = "force-dynamic"

const TND_FORMAT = new Intl.NumberFormat("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })

const PAYMENT_METHODS: Record<string, { label: string; color: string }> = {
  card: { label: "Carte", color: "bg-blue-100 text-blue-800" },
  transfer: { label: "Virement", color: "bg-purple-100 text-purple-800" },
  cash: { label: "Espèce", color: "bg-green-100 text-green-800" },
  wallet: { label: "Wallet", color: "bg-indigo-100 text-indigo-800" },
  at_hotel: { label: "À l'hôtel", color: "bg-amber-100 text-amber-800" },
}

const STATUS_COLORS: Record<string, string> = {
  captured: "bg-emerald-100 text-emerald-800",
  partial_refund: "bg-amber-100 text-amber-800",
  refunded: "bg-red-100 text-red-800",
  pending: "bg-amber-100 text-amber-800",
  proforma: "bg-amber-100 text-amber-800",
  validee: "bg-emerald-100 text-emerald-800",
}

export default async function AccountingPage() {
  const supabase = await createServerSupabase()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect("/login?next=/admin/accounting")
  }

  const profile = await getCurrentAdminProfile(user.id)
  const allowedRoles = ["super_admin", "manager", "agent_compta"]
  if (!profile || !allowedRoles.includes(profile.role)) {
    redirect("/admin")
  }

  const isSuperAdmin = profile.role === "super_admin"
  const scopeAgencyId = isSuperAdmin ? null : profile.agencyId

  const [stats, recentPayments, recentInvoices, monthlyReport] = await Promise.all([
    loadAccountingStats(scopeAgencyId, isSuperAdmin),
    loadRecentPayments(scopeAgencyId, isSuperAdmin, 10),
    listAdminInvoices(scopeAgencyId, user.id, isSuperAdmin).then((rows) => rows.slice(0, 10)),
    loadMonthlyRevenueReport(scopeAgencyId, isSuperAdmin),
  ])

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-foreground text-3xl font-bold tracking-tight">
            Comptabilité
          </h1>
          <p className="text-muted-foreground mt-1">
            Gestion financière et suivi des paiements — {isSuperAdmin ? "toutes agences" : "votre agence"}
          </p>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">
              Encaissé Aujourd&apos;hui
            </CardTitle>
            <DollarSign className="h-4 w-4 text-emerald-500" />
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">
              {TND_FORMAT.format(stats.revenueTodayTnd)} DT
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Encaissé Ce Mois</CardTitle>
            <TrendingUp className="h-4 w-4 text-blue-500" />
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">
              {TND_FORMAT.format(stats.revenueMonthTnd)} DT
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">
              Réservations en attente
            </CardTitle>
            <Wallet className="h-4 w-4 text-amber-500" />
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-amber-600">
              {TND_FORMAT.format(stats.pendingPaymentsTnd)} DT
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Factures</CardTitle>
            <FileText className="h-4 w-4 text-purple-500" />
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{stats.totalInvoices}</p>
          </CardContent>
        </Card>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="payments" className="space-y-4">
        <TabsList>
          <TabsTrigger value="payments">Paiements</TabsTrigger>
          <TabsTrigger value="invoices">Factures</TabsTrigger>
          <TabsTrigger value="recharges">Recharges Wallet</TabsTrigger>
          <TabsTrigger value="reports">Rapports</TabsTrigger>
        </TabsList>

        <TabsContent value="payments" className="space-y-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>Derniers Paiements</CardTitle>
              <Button variant="outline" size="sm" asChild>
                <Link href="/admin/finance/pending-payments">Paiements en attente</Link>
              </Button>
            </CardHeader>
            <CardContent>
              {recentPayments.length === 0 ? (
                <p className="text-muted-foreground py-8 text-center text-sm">Aucun paiement encaissé récemment.</p>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Référence</TableHead>
                        <TableHead>Client</TableHead>
                        <TableHead>Montant</TableHead>
                        <TableHead>Méthode</TableHead>
                        <TableHead>Statut</TableHead>
                        <TableHead>Date</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {recentPayments.map((payment) => (
                        <TableRow key={payment.id}>
                          <TableCell className="font-mono text-sm">{payment.publicRef}</TableCell>
                          <TableCell>{payment.customerName}</TableCell>
                          <TableCell className="font-semibold">
                            {TND_FORMAT.format(payment.tndAmount)} DT
                          </TableCell>
                          <TableCell>
                            <Badge className={PAYMENT_METHODS[payment.method]?.color || "bg-gray-100"}>
                              {PAYMENT_METHODS[payment.method]?.label || payment.method}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <Badge className={STATUS_COLORS[payment.status] || "bg-gray-100"}>
                              {payment.status}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-sm text-gray-500">
                            {payment.capturedAt ? new Date(payment.capturedAt).toLocaleDateString("fr-FR") : "—"}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="invoices" className="space-y-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>Factures Récentes</CardTitle>
              <Button variant="outline" size="sm" asChild>
                <Link href="/admin/accounting/invoices">Voir tout</Link>
              </Button>
            </CardHeader>
            <CardContent>
              {recentInvoices.length === 0 ? (
                <p className="text-muted-foreground py-8 text-center text-sm">Aucune facture.</p>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>N° Facture</TableHead>
                        {isSuperAdmin ? <TableHead>Agence</TableHead> : null}
                        <TableHead>Montant TTC</TableHead>
                        <TableHead>Statut</TableHead>
                        <TableHead>Date</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {recentInvoices.map((invoice) => (
                        <TableRow key={invoice.id}>
                          <TableCell className="font-mono text-sm">{invoice.invoiceNumber}</TableCell>
                          {isSuperAdmin ? <TableCell>{invoice.agencyName ?? "—"}</TableCell> : null}
                          <TableCell className="font-semibold">
                            {TND_FORMAT.format(Number.parseFloat(invoice.totalTtc))} DT
                          </TableCell>
                          <TableCell>
                            <Badge className={STATUS_COLORS[invoice.status] || "bg-gray-100"}>
                              {invoice.status}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-sm text-gray-500">{invoice.validationDate ?? "—"}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="recharges" className="space-y-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>Demandes de recharge wallet B2B</CardTitle>
              <Button variant="outline" size="sm" asChild>
                <Link href="/admin/accounting/recharges">
                  Gérer les recharges
                </Link>
              </Button>
            </CardHeader>
            <CardContent>
              <p className="text-muted-foreground text-sm">
                Validez ou refusez les demandes de recharge wallet soumises par
                les agences partenaires (espèces, virement bancaire, virement
                postal, mandat postal, chèque).
              </p>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="reports" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <CreditCard className="h-4 w-4" />
                Chiffre d&apos;affaires — 3 derniers mois
              </CardTitle>
              <CardDescription>Encaissé net (paiements capturés, remboursements déduits).</CardDescription>
            </CardHeader>
            <CardContent>
              {monthlyReport.length === 0 ? (
                <p className="text-muted-foreground py-8 text-center text-sm">
                  Aucune donnée sur la période.
                </p>
              ) : (
                <div className="space-y-2">
                  {monthlyReport.map((m) => (
                    <div
                      key={m.monthLabel}
                      className="flex items-center justify-between rounded-md border px-4 py-3"
                    >
                      <span className="font-medium capitalize">{m.monthLabel}</span>
                      <span className="text-muted-foreground text-sm">{m.paymentsCount} paiement(s)</span>
                      <span className="font-semibold">{TND_FORMAT.format(m.revenueTnd)} DT</span>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}
