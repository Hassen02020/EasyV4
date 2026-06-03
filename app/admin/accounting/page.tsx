/**
 * Module Comptabilité — Manager/Agent Compta
 * 
 * Tableau de bord financier avec KPIs, paiements et rapports
 */

import { Metadata } from "next"
import Link from "next/link"
import { redirect } from "next/navigation"
import {
  DollarSign,
  TrendingUp,
  TrendingDown,
  CreditCard,
  FileText,
  Download,
  Calendar,
  Filter,
  ArrowUpRight,
  ArrowDownRight,
  Wallet,
  Banknote,
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

export const metadata: Metadata = {
  title: "Comptabilité — Manager",
  description: "Gestion financière et rapports",
}

export const dynamic = "force-dynamic"

// Mock data pour la démo
const MOCK_PAYMENTS = [
  { id: "PAY-001", reference: "E2B-2024-001", client: "Ahmed Ben Ali", amount: 1250, method: "carte", status: "completed", date: "2024-01-15" },
  { id: "PAY-002", reference: "E2B-2024-002", client: "Sofia Trabelsi", amount: 890, method: "virement", status: "pending", date: "2024-01-16" },
  { id: "PAY-003", reference: "E2B-2024-003", client: "Karim Moussa", amount: 2100, method: "carte", status: "completed", date: "2024-01-17" },
  { id: "PAY-004", reference: "E2B-2024-004", client: "Amel Dridi", amount: 560, method: "espece", status: "completed", date: "2024-01-18" },
  { id: "PAY-005", reference: "E2B-2024-005", client: "Nadia Gharbi", amount: 1450, method: "carte", status: "failed", date: "2024-01-18" },
]

const MOCK_INVOICES = [
  { id: "FAC-2024-001", client: "Ahmed Ben Ali", amount: 1250, status: "payee", date: "2024-01-15" },
  { id: "FAC-2024-002", client: "Sofia Trabelsi", amount: 890, status: "en_attente", date: "2024-01-16" },
  { id: "FAC-2024-003", client: "Karim Moussa", amount: 2100, status: "payee", date: "2024-01-17" },
]

const PAYMENT_METHODS: Record<string, { label: string; color: string }> = {
  carte: { label: "Carte", color: "bg-blue-100 text-blue-800" },
  virement: { label: "Virement", color: "bg-purple-100 text-purple-800" },
  espece: { label: "Espèce", color: "bg-green-100 text-green-800" },
}

const STATUS_COLORS: Record<string, string> = {
  completed: "bg-emerald-100 text-emerald-800",
  pending: "bg-amber-100 text-amber-800",
  failed: "bg-red-100 text-red-800",
  payee: "bg-emerald-100 text-emerald-800",
  en_attente: "bg-amber-100 text-amber-800",
}

export default async function AccountingPage() {
  const supabase = await createServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    redirect("/login?next=/admin/accounting")
  }

  const profile = await getCurrentAdminProfile(user.id)
  const allowedRoles = ["super_admin", "manager", "agent_compta"]
  if (!profile || !allowedRoles.includes(profile.role)) {
    redirect("/admin")
  }

  const stats = {
    revenueToday: 6250,
    revenueMonth: 45200,
    pendingPayments: 2340,
    totalInvoices: 45,
    growth: 12.5,
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-foreground text-3xl font-bold tracking-tight">
            Comptabilité
          </h1>
          <p className="text-muted-foreground mt-1">
            Gestion financière et suivi des paiements
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm">
            <Calendar className="mr-2 h-4 w-4" />
            Ce mois
          </Button>
          <Button variant="outline" size="sm">
            <Download className="mr-2 h-4 w-4" />
            Export
          </Button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">CA Aujourd&apos;hui</CardTitle>
            <DollarSign className="text-emerald-500 h-4 w-4" />
          </CardHeader>
          <CardContent>
            <div className="flex items-baseline gap-2">
              <p className="text-2xl font-bold">{stats.revenueToday.toLocaleString("fr-FR")} DT</p>
              <Badge variant="outline" className="text-emerald-600">
                <ArrowUpRight className="mr-1 h-3 w-3" />
                +{stats.growth}%
              </Badge>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">CA Ce Mois</CardTitle>
            <TrendingUp className="text-blue-500 h-4 w-4" />
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{stats.revenueMonth.toLocaleString("fr-FR")} DT</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Paiements en Attente</CardTitle>
            <Wallet className="text-amber-500 h-4 w-4" />
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-amber-600">{stats.pendingPayments.toLocaleString("fr-FR")} DT</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Factures</CardTitle>
            <FileText className="text-purple-500 h-4 w-4" />
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{stats.totalInvoices}</p>
            <p className="text-xs text-gray-500">{MOCK_INVOICES.filter((i) => i.status === "en_attente").length} en attente</p>
          </CardContent>
        </Card>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="payments" className="space-y-4">
        <TabsList>
          <TabsTrigger value="payments">Paiements</TabsTrigger>
          <TabsTrigger value="invoices">Factures</TabsTrigger>
          <TabsTrigger value="reports">Rapports</TabsTrigger>
        </TabsList>

        <TabsContent value="payments" className="space-y-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>Derniers Paiements</CardTitle>
              <Button variant="outline" size="sm" asChild>
                <Link href="/admin/accounting/payments">Voir tout</Link>
              </Button>
            </CardHeader>
            <CardContent>
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
                    {MOCK_PAYMENTS.map((payment) => (
                      <TableRow key={payment.id}>
                        <TableCell className="font-mono text-sm">{payment.id}</TableCell>
                        <TableCell>{payment.client}</TableCell>
                        <TableCell className="font-semibold">{payment.amount.toLocaleString("fr-FR")} DT</TableCell>
                        <TableCell>
                          <Badge className={PAYMENT_METHODS[payment.method]?.color || "bg-gray-100"}>
                            {PAYMENT_METHODS[payment.method]?.label || payment.method}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <Badge className={STATUS_COLORS[payment.status] || "bg-gray-100"}>
                            {payment.status === "completed" ? "Complété" : 
                             payment.status === "pending" ? "En attente" : "Échoué"}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-sm text-gray-500">{payment.date}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
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
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>N° Facture</TableHead>
                      <TableHead>Client</TableHead>
                      <TableHead>Montant TTC</TableHead>
                      <TableHead>Statut</TableHead>
                      <TableHead>Date</TableHead>
                      <TableHead className="text-right">Action</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {MOCK_INVOICES.map((invoice) => (
                      <TableRow key={invoice.id}>
                        <TableCell className="font-mono text-sm">{invoice.id}</TableCell>
                        <TableCell>{invoice.client}</TableCell>
                        <TableCell className="font-semibold">{invoice.amount.toLocaleString("fr-FR")} DT</TableCell>
                        <TableCell>
                          <Badge className={STATUS_COLORS[invoice.status] || "bg-gray-100"}>
                            {invoice.status === "payee" ? "Payée" : "En attente"}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-sm text-gray-500">{invoice.date}</TableCell>
                        <TableCell className="text-right">
                          <Button variant="ghost" size="sm">
                            <FileText className="mr-2 h-4 w-4" />
                            PDF
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="reports" className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Rapports Mensuels</CardTitle>
                <CardDescription>Chiffre d&apos;affaires et évolution</CardDescription>
              </CardHeader>
              <CardContent className="space-y-2">
                {["Janvier 2024", "Décembre 2023", "Novembre 2023"].map((month) => (
                  <Button key={month} variant="outline" className="w-full justify-between" asChild>
                    <Link href={`/admin/accounting/reports?month=${month}`}>
                      {month}
                      <Download className="h-4 w-4" />
                    </Link>
                  </Button>
                ))}
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>Rapports Annnuels</CardTitle>
                <CardDescription>Bilan annuel et statistiques</CardDescription>
              </CardHeader>
              <CardContent className="space-y-2">
                {["2024", "2023"].map((year) => (
                  <Button key={year} variant="outline" className="w-full justify-between" asChild>
                    <Link href={`/admin/accounting/reports?year=${year}`}>
                      Année {year}
                      <Download className="h-4 w-4" />
                    </Link>
                  </Button>
                ))}
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  )
}
