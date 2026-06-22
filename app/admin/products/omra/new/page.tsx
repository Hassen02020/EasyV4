/**
 * /admin/products/omra/new — Création d'un programme Omra
 */

import { Metadata } from "next"
import Link from "next/link"
import { redirect } from "next/navigation"
import { ArrowLeft } from "lucide-react"
import { Button } from "@/components/ui/button"
import { createServerSupabase } from "@/lib/supabase/server"
import { getCurrentAdminProfile } from "@/lib/auth/profile"
import { OmraProgramForm } from "@/components/admin/omra-program-form"
import { createOmraProgram } from "@/lib/omra/admin-actions"

export const metadata: Metadata = {
  title: "Nouveau programme Omra — Back-office",
}

export const dynamic = "force-dynamic"

export default async function NewOmraProgramPage() {
  const supabase = await createServerSupabase()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect("/admin/login?next=/admin/products/omra/new")

  const profile = await getCurrentAdminProfile(user.id)
  if (!profile || !["super_admin", "manager"].includes(profile.role)) {
    redirect("/admin")
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" asChild>
          <Link href="/admin/products/omra">
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <div>
          <h1 className="text-foreground text-3xl font-bold tracking-tight">
            Nouveau programme Omra
          </h1>
          <p className="text-muted-foreground mt-1">
            Saisissez les informations du forfait
          </p>
        </div>
      </div>

      <OmraProgramForm action={createOmraProgram} submitLabel="Créer le programme" />
    </div>
  )
}
