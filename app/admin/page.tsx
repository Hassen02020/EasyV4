/**
 * Dashboard back-office Easy2Book.
 *
 * Server Component : on récupère l'agence courante via le profil utilisateur
 * connecté (middleware + layout ont déjà vérifié l'auth), puis on charge les
 * agrégats Drizzle via `loadDashboardData`. Si la BDD est down ou vide, on
 * affiche des valeurs neutres + un bandeau d'avertissement.
 */

import {
  AlertTriangle,
  Building2,
  Calendar,
  CheckCircle,
  Clock,
  DollarSign,
  Moon,
  Plane,
  RefreshCw,
  Users,
  XCircle,
} from "lucide-react"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Progress } from "@/components/ui/progress"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { redirect } from "next/navigation"
import { createServerSupabase } from "@/lib/supabase/server"
import { getCurrentAdminProfile } from "@/lib/auth/profile"
import {
  loadDashboardData,
  type RecentBooking,
} from "@/lib/admin/dashboard-data"

export const dynamic = "force-dynamic"

const TND_FORMAT = new Intl.NumberFormat("fr-FR", {
  maximumFractionDigits: 0,
})

const MODULE_META: Record<
  string,
  { label: string; color: string; icon: typeof Building2 }
> = {
  hotel: { label: "Hôtels Tunisie", color: "bg-secondary", icon: Building2 },
  flight: { label: "Vols", color: "bg-accent", icon: Plane },
  omra: { label: "Omra", color: "bg-primary", icon: Moon },
  package: { label: "Voyages Organisés", color: "bg-emerald-600", icon: Plane },
  activity: { label: "Activités", color: "bg-pink-500", icon: Plane },
  transfer: { label: "Transferts", color: "bg-slate-500", icon: Plane },
}

function moduleIcon(module: string) {
  const Icon = MODULE_META[module]?.icon ?? Building2
  return <Icon className="text-muted-foreground size-4" />
}

function statusBadge(status: RecentBooking["status"]) {
  switch (status) {
    case "confirmed":
      return (
        <Badge className="bg-green-100 text-green-700 hover:bg-green-100">
          <CheckCircle className="mr-1 size-3" />
          Confirmé
        </Badge>
      )
    case "pending":
    case "on_request":
      return (
        <Badge className="bg-amber-100 text-amber-700 hover:bg-amber-100">
          <Clock className="mr-1 size-3" />
          En attente
        </Badge>
      )
    case "cancelled":
    case "no_show":
    case "refunded":
      return (
        <Badge className="bg-red-100 text-red-700 hover:bg-red-100">
          <XCircle className="mr-1 size-3" />
          {status === "refunded" ? "Remboursé" : "Annulé"}
        </Badge>
      )
    default:
      return <Badge variant="outline">{status}</Badge>
  }
}

function formatTnd(amount: number): string {
  return `${TND_FORMAT.format(amount)} TND`
}

function formatTime(date: Date): string {
  return new Intl.DateTimeFormat("fr-FR", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(date)
}

export default async function AdminDashboard() {
  const supabase = await createServerSupabase()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  const profile = user ? await getCurrentAdminProfile(user.id) : null
  if (!profile?.agencyId) redirect("/login")
  const agencyId = profile.agencyId

  const dashboard = await loadDashboardData(agencyId)
  const { stats, recentBookings, byModule, apiErrors, available } = dashboard

  const totalByModule = byModule.reduce((acc, row) => acc + row.count, 0) || 1

  const statCards = [
    {
      title: "Chiffre d'Affaires",
      value: formatTnd(stats.monthlyRevenueTnd),
      icon: DollarSign,
      description: "Ce mois (TND)",
    },
    {
      title: "Réservations Aujourd'hui",
      value: stats.reservationsToday.toString(),
      icon: Calendar,
      description: "Depuis 00h00 UTC",
    },
    {
      title: "Erreurs API MyGo",
      value: stats.apiErrors24h.toString(),
      icon: AlertTriangle,
      description: "Dernières 24h",
      warning: stats.apiErrors24h > 0,
    },
    {
      title: "Clients Enregistrés",
      value: stats.activeCustomers.toString(),
      icon: Users,
      description: "Total agence",
    },
  ]

  return (
    <div className="space-y-8 p-6">
      <div className="e2b-fade-in-up flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-foreground text-3xl font-bold tracking-tight">
            Tableau de bord
          </h1>
          <p className="text-muted-foreground mt-1">
            Vue d&apos;ensemble de votre activité Easy2Book
          </p>
        </div>
        <Button
          className="bg-primary hover:bg-primary/90 text-primary-foreground shadow-e2b-soft rounded-2xl"
          asChild
        >
          <a href="/admin" aria-label="Recharger le tableau de bord">
            <RefreshCw className="mr-2 size-4" />
            Actualiser
          </a>
        </Button>
      </div>

      {!available ? (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          <strong>Mode dégradé.</strong> La base de données n&apos;est pas
          accessible ou aucune donnée n&apos;est encore enregistrée. Les
          compteurs sont à zéro tant que la première réservation n&apos;a pas
          été créée.
        </div>
      ) : null}

      <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
        {statCards.map((stat, idx) => (
          <Card
            key={stat.title}
            className="e2b-fade-in-up shadow-e2b-soft hover:shadow-e2b-elevated border-border/60 rounded-2xl transition-shadow"
            style={{ animationDelay: `${80 + idx * 70}ms` }}
          >
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-muted-foreground text-sm font-medium">
                {stat.title}
              </CardTitle>
              <div
                className={`flex size-10 items-center justify-center rounded-xl ${
                  stat.warning
                    ? "bg-accent/15 text-accent-foreground"
                    : "bg-secondary/60 text-secondary-foreground"
                }`}
              >
                <stat.icon
                  className={`size-5 ${
                    stat.warning ? "text-accent" : "text-primary"
                  }`}
                />
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-foreground text-3xl font-bold tracking-tight">
                {stat.value}
              </div>
              <div className="text-muted-foreground mt-1 text-xs">
                {stat.description}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div
        className="e2b-fade-in-up grid gap-6 lg:grid-cols-3"
        style={{ animationDelay: "400ms" }}
      >
        <Card className="shadow-e2b-soft rounded-2xl lg:col-span-2">
          <CardHeader>
            <CardTitle>Réservations récentes</CardTitle>
            <CardDescription>
              {recentBookings.length === 0
                ? "Aucune réservation enregistrée pour le moment."
                : `Les ${recentBookings.length} dernières réservations enregistrées`}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {recentBookings.length === 0 ? (
              <p className="text-muted-foreground py-12 text-center text-sm">
                Dès qu&apos;une réservation sera créée via le moteur, elle
                apparaîtra ici.
              </p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Réf.</TableHead>
                    <TableHead>Client</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead className="text-right">Montant</TableHead>
                    <TableHead>Statut</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {recentBookings.map((booking) => (
                    <TableRow key={booking.id}>
                      <TableCell className="font-mono text-xs">
                        {booking.reference}
                      </TableCell>
                      <TableCell className="font-medium">
                        {booking.customerName}
                      </TableCell>
                      <TableCell>{moduleIcon(booking.module)}</TableCell>
                      <TableCell className="text-right font-semibold">
                        {formatTnd(booking.totalTnd)}
                      </TableCell>
                      <TableCell>{statusBadge(booking.status)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        <div className="space-y-6">
          <Card className="shadow-e2b-soft rounded-2xl">
            <CardHeader>
              <CardTitle>Réservations par type</CardTitle>
              <CardDescription>Ce mois-ci</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {byModule.length === 0 ? (
                <p className="text-muted-foreground text-sm">
                  Aucune réservation ce mois-ci.
                </p>
              ) : (
                byModule.map((row) => {
                  const meta = MODULE_META[row.module] ?? {
                    label: row.module,
                    icon: Building2,
                  }
                  const percentage = Math.round(
                    (row.count / totalByModule) * 100,
                  )
                  const Icon = meta.icon
                  return (
                    <div key={row.module} className="space-y-2">
                      <div className="flex items-center justify-between text-sm">
                        <div className="flex items-center gap-2">
                          <Icon className="text-muted-foreground size-4" />
                          <span>{meta.label}</span>
                        </div>
                        <span className="font-semibold">{row.count}</span>
                      </div>
                      <Progress value={percentage} className="h-2" />
                    </div>
                  )
                })
              )}
            </CardContent>
          </Card>

          <Card className="shadow-e2b-soft rounded-2xl">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <AlertTriangle className="text-accent size-4" />
                Erreurs API MyGo
              </CardTitle>
              <CardDescription>Dernières 24 heures</CardDescription>
            </CardHeader>
            <CardContent>
              {apiErrors.length === 0 ? (
                <p className="text-muted-foreground py-6 text-center text-sm">
                  Aucune erreur API enregistrée.
                </p>
              ) : (
                <div className="space-y-3">
                  {apiErrors.map((error) => (
                    <div
                      key={error.id}
                      className="flex items-start justify-between rounded-lg border p-3"
                    >
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-xs font-medium">
                            {error.endpoint}
                          </span>
                          <span className="text-muted-foreground text-xs">
                            {formatTime(error.createdAt)}
                          </span>
                        </div>
                        <p className="text-muted-foreground text-xs">
                          {error.message}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
