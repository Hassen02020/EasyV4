import Link from "next/link"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { HeartHandshake, Users, FileText, TrendingUp, AlertCircle } from "lucide-react"
import { createServerSupabase } from "@/lib/supabase/server"
import { getCurrentAdminProfile } from "@/lib/auth/profile"
import { listMyMutuelleRequests, listGroupMutuelleRequests } from "@/lib/mutuelle/requests-actions"

export const dynamic = "force-dynamic"

export default async function MutuelleDashboard() {
  const supabase = await createServerSupabase()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  const profile = user ? await getCurrentAdminProfile(user.id) : null
  const isDirector = profile?.role === "mutuelle_director"
  const requests =
    profile?.mutuelleGroupId && profile
      ? isDirector
        ? await listGroupMutuelleRequests()
        : await listMyMutuelleRequests()
      : []

  const activeCount = requests.filter((r) => r.status === "approved").length
  const pendingCount = requests.filter((r) => r.status === "pending").length
  const recentRequests = requests.slice(0, 5)

  // "Factures Ce Mois"/"Montant Total" : aucune facturation n'existe encore
  // dans ce chantier (voir lib/mutuelle/requests-actions.ts, hors scope
  // explicite) — laissés honnêtement à "—" plutôt qu'un chiffre inventé.
  const statCards = [
    {
      label: "Dossiers Actifs",
      sub: "Demandes approuvées",
      icon: HeartHandshake,
      iconClass: "text-violet-500",
      value: String(activeCount),
    },
    {
      label: "En Attente",
      sub: "Dossiers à valider",
      icon: Users,
      iconClass: "text-amber-500",
      value: String(pendingCount),
    },
    { label: "Factures Ce Mois", sub: undefined, icon: FileText, iconClass: "text-blue-500", value: "—" },
    { label: "Montant Total", sub: undefined, icon: TrendingUp, iconClass: "text-emerald-500", value: "—" },
  ]

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
        {statCards.map((stat) => (
          <Card key={stat.label}>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">
                {stat.label}
              </CardTitle>
              <stat.icon className={`h-4 w-4 ${stat.iconClass}`} />
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold">{stat.value}</p>
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
          {recentRequests.length === 0 ? (
            <div className="text-muted-foreground flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed py-10 text-center text-sm">
              <Users className="h-6 w-6" />
              <p>Aucune demande pour le moment.</p>
              <Link href="/mutuelle/dossiers" className="text-primary text-xs hover:underline">
                {isDirector ? "Voir la file d'attente" : "Soumettre une demande"}
              </Link>
            </div>
          ) : (
            <div className="space-y-2">
              {recentRequests.map((r) => (
                <div key={r.id} className="flex items-center justify-between rounded-lg border p-3 text-sm">
                  <div>
                    <p className="font-medium">{r.description.slice(0, 60)}</p>
                    <p className="text-muted-foreground text-xs">
                      {new Date(r.travelStartDate).toLocaleDateString("fr-FR")} —{" "}
                      {new Date(r.travelEndDate).toLocaleDateString("fr-FR")}
                    </p>
                  </div>
                  <span className="text-muted-foreground text-xs capitalize">{r.status}</span>
                </div>
              ))}
              <Link href="/mutuelle/dossiers" className="text-primary block text-xs hover:underline">
                Voir tous les dossiers →
              </Link>
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="border-border bg-muted/30">
        <CardContent className="flex items-start gap-3 py-4">
          <AlertCircle className="text-muted-foreground mt-0.5 h-5 w-5" />
          <div>
            <p className="font-medium">Alertes Mutuelle</p>
            <p className="text-muted-foreground text-sm">
              Facturation et alertes automatiques : fonctionnalité à venir.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
