/**
 * Widget KPIs Omra pour le dashboard back-office.
 * Server Component : charge ses propres agrégats.
 */

import Link from "next/link"
import {
  Moon,
  Calendar,
  Clock,
  CheckCircle2,
  DollarSign,
  TrendingUp,
  Armchair,
  ArrowRight,
} from "lucide-react"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { loadOmraKpis } from "@/lib/omra/reservations-data"

const TND = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 })

export async function OmraKpiWidget({ agencyId }: { agencyId: string }) {
  const kpi = await loadOmraKpis(agencyId)

  const items = [
    {
      label: "Réservations aujourd'hui",
      value: String(kpi.reservationsToday),
      icon: Calendar,
      accent: "text-slate-700",
    },
    {
      label: "En attente",
      value: String(kpi.pending),
      icon: Clock,
      accent: "text-amber-600",
    },
    {
      label: "Confirmées",
      value: String(kpi.confirmed),
      icon: CheckCircle2,
      accent: "text-emerald-600",
    },
    {
      label: "Chiffre d'affaires",
      value: `${TND.format(kpi.revenueConfirmed)} TND`,
      icon: DollarSign,
      accent: "text-blue-600",
    },
    {
      label: "Taux de conversion",
      value: `${kpi.conversionRate}%`,
      icon: TrendingUp,
      accent: "text-purple-600",
    },
    {
      label: "Places restantes",
      value: String(kpi.seatsRemaining),
      icon: Armchair,
      accent: "text-teal-600",
    },
  ]

  return (
    <Card className="shadow-e2b-soft border-border/60 rounded-2xl">
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="flex items-center gap-2 text-base font-semibold">
          <Moon className="h-5 w-5 text-[#1e3a5f]" />
          Omra
        </CardTitle>
        <Link
          href="/admin/omra/reservations"
          className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1 text-sm"
        >
          Voir les réservations
          <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
          {items.map((item) => (
            <div key={item.label} className="space-y-1">
              <div className="text-muted-foreground flex items-center gap-1.5 text-xs">
                <item.icon className={`h-3.5 w-3.5 ${item.accent}`} />
                {item.label}
              </div>
              <div className={`text-xl font-bold ${item.accent}`}>
                {item.value}
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}
