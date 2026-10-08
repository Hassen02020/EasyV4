/**
 * ANALYTICS-OVERVIEW-01 — page d'accueil /admin/analytics.
 * Sans cette page, le lien "Analytique" dans la nav produisait un 404.
 * Navigation statique vers les 12 sous-sections analytics.
 */

import Link from "next/link"
import {
  DollarSign,
  Users,
  TrendingUp,
  Activity,
  Target,
  Zap,
  Crown,
  Sparkles,
  Lightbulb,
  BookCheck,
  Send,
  BarChart2,
} from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"

const SECTIONS = [
  {
    href: "/admin/analytics/margins",
    icon: DollarSign,
    title: "Marges",
    description: "Suivi des marges par module, agence et période.",
  },
  {
    href: "/admin/analytics/niches",
    icon: Users,
    title: "Niches CRM",
    description: "Segmentation client — niches de valeur identifiées.",
  },
  {
    href: "/admin/analytics/search-demand",
    icon: TrendingUp,
    title: "Demande hôtel",
    description: "Destinations les plus recherchées sur la période.",
  },
  {
    href: "/admin/analytics/campaigns",
    icon: Activity,
    title: "Campagnes",
    description:
      "Performances CRM : exposés, convertis, CA et marge par campagne.",
  },
  {
    href: "/admin/analytics/conversion",
    icon: Target,
    title: "Conversion",
    description: "Entonnoir de conversion de la recherche à la réservation.",
  },
  {
    href: "/admin/analytics/trends",
    icon: TrendingUp,
    title: "Tendances",
    description: "Séries temporelles : réservations, revenus et marges.",
  },
  {
    href: "/admin/analytics/radar",
    icon: Zap,
    title: "Radar Métier",
    description: "Indicateurs opérationnels — alertes et anomalies.",
  },
  {
    href: "/admin/analytics/vip",
    icon: Crown,
    title: "Radar VIP",
    description: "Clients à fort potentiel — scoring et suivi.",
  },
  {
    href: "/admin/analytics/signal",
    icon: Sparkles,
    title: "Signaux",
    description: "Événements CRM détectés — opportunités et risques.",
  },
  {
    href: "/admin/analytics/action",
    icon: Lightbulb,
    title: "Actions",
    description: "Règles d'actions automatiques déclenchées par les signaux.",
  },
  {
    href: "/admin/analytics/learning",
    icon: BookCheck,
    title: "Apprentissage",
    description: "Historique des actions passées — taux de succès observé.",
  },
  {
    href: "/admin/analytics/campaign-engine",
    icon: Send,
    title: "Campagnes VIP",
    description: "Moteur CRM — création et lancement de campagnes ciblées.",
  },
]

export default function AnalyticsOverviewPage() {
  return (
    <div className="flex flex-col gap-6 p-6">
      <div>
        <div className="flex items-center gap-2">
          <BarChart2 className="text-muted-foreground h-6 w-6" />
          <h1 className="text-2xl font-semibold">Analytique</h1>
        </div>
        <p className="text-muted-foreground mt-1 text-sm">
          Tableaux de bord performance, CRM et intelligence marché.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {SECTIONS.map(({ href, icon: Icon, title, description }) => (
          <Link key={href} href={href} className="group block">
            <Card className="hover:border-primary/50 h-full transition-colors">
              <CardHeader className="flex flex-row items-center gap-3 pb-2">
                <Icon className="text-muted-foreground group-hover:text-primary h-5 w-5 shrink-0 transition-colors" />
                <CardTitle className="text-base">{title}</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-muted-foreground text-sm">{description}</p>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  )
}
