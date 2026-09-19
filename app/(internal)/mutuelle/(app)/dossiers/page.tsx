/**
 * /mutuelle/dossiers — Chantier "Mutuelle" (cycle demande→validation), voir
 * lib/mutuelle/requests-actions.ts pour le périmètre exact et ce qui reste
 * volontairement hors scope (markup, catalogue restreint, transmission
 * automatique vers une réservation réelle, facturation).
 *
 * Une seule page, deux rendus selon le rôle résolu côté serveur
 * (mutuelle_member vs mutuelle_director) — jamais une seconde route.
 */

import { redirect } from "next/navigation"
import { Users } from "lucide-react"
import { createServerSupabase } from "@/lib/supabase/server"
import { getCurrentAdminProfile } from "@/lib/auth/profile"
import { listMyMutuelleRequests, listGroupMutuelleRequests } from "@/lib/mutuelle/requests-actions"
import { NewRequestForm } from "@/components/mutuelle/new-request-form"
import { RequestsTable } from "@/components/mutuelle/requests-table"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"

export const dynamic = "force-dynamic"

export default async function MutuelleDossiersPage() {
  const supabase = await createServerSupabase()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect("/mutuelle/login")

  const profile = await getCurrentAdminProfile(user.id)
  if (!profile || !profile.mutuelleGroupId) redirect("/mutuelle")

  const isDirector = profile.role === "mutuelle_director"
  const requests = isDirector ? await listGroupMutuelleRequests() : await listMyMutuelleRequests()
  const pendingCount = requests.filter((r) => r.status === "pending").length

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-foreground text-2xl font-bold">Dossiers Assurés</h1>
        <p className="text-muted-foreground text-sm">
          {isDirector
            ? `Demandes soumises par les membres de votre groupe — ${pendingCount} en attente`
            : "Vos demandes et leur statut"}
        </p>
      </div>

      {!isDirector && <NewRequestForm />}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Users className="h-4 w-4" />
            {isDirector ? "Toutes les demandes du groupe" : "Mes demandes"}
          </CardTitle>
          <CardDescription>
            {isDirector
              ? "Approuvez ou refusez — la suite (transmission à l'agence, tarification) reste manuelle pour l'instant."
              : "Statut mis à jour dès la décision de votre directeur."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <RequestsTable requests={requests} role={profile.role as "mutuelle_member" | "mutuelle_director"} />
        </CardContent>
      </Card>
    </div>
  )
}
