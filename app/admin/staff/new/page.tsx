/**
 * /admin/staff/new — Invitation d'un nouveau membre du personnel.
 *
 * Crée un vrai compte Supabase Auth (invitation email) + une ligne `users`
 * dans la MÊME agence que l'appelant — voir lib/admin/users-actions.ts.
 */

import { Metadata } from "next"
import Link from "next/link"
import { redirect } from "next/navigation"
import { ArrowLeft } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { createServerSupabase } from "@/lib/supabase/server"
import { getCurrentAdminProfile } from "@/lib/auth/profile"
import { NewStaffForm } from "@/components/admin/new-staff-form"

export const metadata: Metadata = { title: "Nouvel agent — Personnel" }
export const dynamic = "force-dynamic"

const ALLOWED_ROLES = ["super_admin", "manager"] as const

export default async function NewStaffPage() {
  const supabase = await createServerSupabase()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect("/login?next=/admin/staff/new")

  const profile = await getCurrentAdminProfile(user.id)
  if (!profile || !(ALLOWED_ROLES as readonly string[]).includes(profile.role)) {
    redirect("/admin/staff")
  }

  return (
    <div className="mx-auto max-w-lg space-y-6">
      <Button variant="ghost" size="sm" asChild className="-ml-2">
        <Link href="/admin/staff">
          <ArrowLeft className="mr-2 h-4 w-4" />
          Retour au personnel
        </Link>
      </Button>
      <Card>
        <CardHeader>
          <CardTitle>Nouvel agent</CardTitle>
          <CardDescription>Invite un nouveau membre du personnel dans votre agence.</CardDescription>
        </CardHeader>
        <CardContent>
          <NewStaffForm canGrantSuperAdmin={profile.role === "super_admin"} />
        </CardContent>
      </Card>
    </div>
  )
}
