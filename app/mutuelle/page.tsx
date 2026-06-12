import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
  HeartHandshake,
  Users,
  FileText,
  TrendingUp,
  AlertCircle,
  ArrowRight,
  Clock,
} from "lucide-react"
import Link from "next/link"

export const dynamic = "force-dynamic"

const MOCK_STATS = {
  dossiersActifs: 12,
  dossiersEnAttente: 3,
  facturesMois: 8,
  montantTotal: 24500,
}
const MOCK_DOSSIERS = [
  {
    id: "MUT-2024-001",
    nom: "Dupont Martin",
    statut: "actif",
    dateDepart: "2024-07-15",
    destination: "Tunisie",
  },
  {
    id: "MUT-2024-002",
    nom: "Bernard Sophie",
    statut: "en_attente",
    dateDepart: "2024-08-01",
    destination: "Turquie",
  },
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
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">
              Dossiers Actifs
            </CardTitle>
            <HeartHandshake className="h-4 w-4 text-violet-500" />
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{MOCK_STATS.dossiersActifs}</p>
            <p className="text-muted-foreground text-xs">Assurés en voyage</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">En Attente</CardTitle>
            <Clock className="h-4 w-4 text-amber-500" />
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{MOCK_STATS.dossiersEnAttente}</p>
            <p className="text-muted-foreground text-xs">Dossiers à valider</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">
              Factures Ce Mois
            </CardTitle>
            <FileText className="h-4 w-4 text-blue-500" />
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{MOCK_STATS.facturesMois}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Montant Total</CardTitle>
            <TrendingUp className="h-4 w-4 text-emerald-500" />
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">
              {MOCK_STATS.montantTotal.toLocaleString("fr-FR")} DT
            </p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base">Dossiers Récents</CardTitle>
          <Button variant="ghost" size="sm" asChild>
            <Link href="/mutuelle/dossiers" className="gap-1">
              Voir tout <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </Button>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {MOCK_DOSSIERS.map((d) => (
              <div
                key={d.id}
                className="hover:bg-muted/50 flex items-center justify-between rounded-lg border p-3"
              >
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-violet-100">
                    <Users className="h-4 w-4 text-violet-600" />
                  </div>
                  <div>
                    <p className="font-medium">{d.nom}</p>
                    <p className="text-muted-foreground text-xs">
                      {d.id} • {d.dateDepart} • {d.destination}
                    </p>
                  </div>
                </div>
                <Badge
                  className={
                    d.statut === "actif"
                      ? "bg-emerald-100 text-emerald-800"
                      : "bg-amber-100 text-amber-800"
                  }
                >
                  {d.statut === "actif" ? "Actif" : "En attente"}
                </Badge>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card className="border-amber-200 bg-amber-50">
        <CardContent className="flex items-start gap-3 py-4">
          <AlertCircle className="mt-0.5 h-5 w-5 text-amber-600" />
          <div>
            <p className="font-medium text-amber-800">Alertes Mutuelle</p>
            <p className="text-sm text-amber-700">
              2 dossiers arrivent à expiration dans les 7 prochains jours.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
