/**
 * /mutuelle/catalogue — Chantier "Mutuelle" étape 2 (canal B2B2C réel), voir
 * lib/mutuelle/catalog-actions.ts pour le périmètre exact : le directeur
 * choisit les produits visibles par son groupe parmi le catalogue publié de
 * l'agence d'exécution ; le membre ne voit ensuite QUE ce catalogue
 * restreint. Aucune réservation, aucune facturation déclenchée ici.
 *
 * Une seule route, deux rendus selon le rôle résolu côté serveur — même
 * pattern que /mutuelle/dossiers.
 */

import { redirect } from "next/navigation"
import { Package } from "lucide-react"
import { createServerSupabase } from "@/lib/supabase/server"
import { getCurrentAdminProfile } from "@/lib/auth/profile"
import { listExecutionAgencyCatalog, listMyMutuelleCatalog } from "@/lib/mutuelle/catalog-actions"
import { CatalogDirectorTable } from "@/components/mutuelle/catalog-director-table"
import { CatalogMemberGrid } from "@/components/mutuelle/catalog-member-grid"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"

export const dynamic = "force-dynamic"

export default async function MutuelleCataloguePage() {
  const supabase = await createServerSupabase()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect("/mutuelle/login")

  const profile = await getCurrentAdminProfile(user.id)
  if (!profile || !profile.mutuelleGroupId) redirect("/mutuelle")

  const isDirector = profile.role === "mutuelle_director"

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-foreground text-2xl font-bold">Catalogue Mutuelle</h1>
        <p className="text-muted-foreground text-sm">
          {isDirector
            ? "Sélectionnez les produits du catalogue de votre agence d'exécution que vos membres pourront consulter."
            : "Produits sélectionnés par votre directeur pour votre groupe."}
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Package className="h-4 w-4" />
            {isDirector ? "Catalogue de l'agence d'exécution" : "Votre catalogue"}
          </CardTitle>
          <CardDescription>
            {isDirector
              ? "Seuls les voyages organisés, activités et Omra publiés sont proposables — Hôtels et Vols restent hors périmètre (inventaire live, sans liste fixe à curer)."
              : "Prix public de référence et prix Mutuelle indicatif affichés dès qu'un tarif réel existe — aucune réservation n'est encore possible depuis cette page."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isDirector ? (
            <CatalogDirectorTable items={await listExecutionAgencyCatalog()} />
          ) : (
            <CatalogMemberGrid items={await listMyMutuelleCatalog()} />
          )}
        </CardContent>
      </Card>
    </div>
  )
}
