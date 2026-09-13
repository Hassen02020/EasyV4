import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { HeartHandshake, Users, FileText, TrendingUp, AlertCircle } from "lucide-react"

export const dynamic = "force-dynamic"

const STAT_CARDS = [
  { label: "Dossiers Actifs", sub: "Assurés en voyage", icon: HeartHandshake, iconClass: "text-violet-500" },
  { label: "En Attente", sub: "Dossiers à valider", icon: Users, iconClass: "text-amber-500" },
  { label: "Factures Ce Mois", sub: undefined, icon: FileText, iconClass: "text-blue-500" },
  { label: "Montant Total", sub: undefined, icon: TrendingUp, iconClass: "text-emerald-500" },
]

export default function MutuelleDashboard() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-foreground text-2xl font-bold">
          Dashboard Mutuelle
        </h1>
        <p className="text-muted-foreground text-sm">
          Vue d&apos;ensemble de vos dossiers assurés
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {STAT_CARDS.map((stat) => (
          <Card key={stat.label}>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">
                {stat.label}
              </CardTitle>
              <stat.icon className={`h-4 w-4 ${stat.iconClass}`} />
            </CardHeader>
            <CardContent>
              <p className="text-muted-foreground text-2xl font-bold">—</p>
              {stat.sub && (
                <p className="text-muted-foreground text-xs">{stat.sub}</p>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Dossiers Récents</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-muted-foreground flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed py-10 text-center text-sm">
            <Users className="h-6 w-6" />
            <p>
              La gestion des dossiers assurés n&apos;est pas encore reliée à
              une source de données.
            </p>
            <p className="text-xs">Contactez votre gestionnaire de compte.</p>
          </div>
        </CardContent>
      </Card>

      <Card className="border-border bg-muted/30">
        <CardContent className="flex items-start gap-3 py-4">
          <AlertCircle className="text-muted-foreground mt-0.5 h-5 w-5" />
          <div>
            <p className="font-medium">Alertes Mutuelle</p>
            <p className="text-muted-foreground text-sm">
              Aucune source de données connectée pour le moment — fonctionnalité à venir.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
