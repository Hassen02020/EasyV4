/**
 * /admin/agencies/new — Création d'une nouvelle agence.
 *
 * Crée une ligne `agencies` (voir lib/admin/agencies-actions.ts::createAgency)
 * — super_admin uniquement, même frontière que le reste de /admin/agencies.
 */

import { Metadata } from "next"
import Link from "next/link"
import { redirect } from "next/navigation"
import { ArrowLeft } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { createServerSupabase } from "@/lib/supabase/server"
import { getCurrentAdminProfile } from "@/lib/auth/profile"
import { NewAgencyForm } from "@/components/admin/new-agency-form"

export const metadata: Metadata = { title: "Nouvelle agence — Super Admin" }
export const dynamic = "force-dynamic"

export default async function NewAgencyPage() {
  const supabase = await createServerSupabase()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect("/login?next=/admin/agencies/new")

  const profile = await getCurrentAdminProfile(user.id)
  if (profile?.role !== "super_admin") {
    redirect("/admin/agencies")
  }

  return (
    <div className="mx-auto max-w-lg space-y-6">
      <Button variant="ghost" size="sm" asChild className="-ml-2">
        <Link href="/admin/agencies">
          <ArrowLeft className="mr-2 h-4 w-4" />
          Retour aux agences
        </Link>
      </Button>
      <Card>
        <CardHeader>
          <CardTitle>Nouvelle agence</CardTitle>
          <CardDescription>
            Crée une agence OTA ou partenaire B2B. Les utilisateurs (staff / partner_owner)
            se créent ensuite séparément via les invitations habituelles.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <NewAgencyForm />
        </CardContent>
      </Card>
    </div>
  )
}
