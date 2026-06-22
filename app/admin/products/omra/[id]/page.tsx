/**
 * /admin/products/omra/[id] — Édition d'un programme Omra
 */

import { Metadata } from "next"
import Link from "next/link"
import { notFound, redirect } from "next/navigation"
import { ArrowLeft, Trash2 } from "lucide-react"
import { eq } from "drizzle-orm"
import { Button } from "@/components/ui/button"
import { createServerSupabase } from "@/lib/supabase/server"
import { getCurrentAdminProfile } from "@/lib/auth/profile"
import { getDb } from "@/lib/db/client"
import { omraPackages } from "@/lib/db/schema"
import { OmraProgramForm } from "@/components/admin/omra-program-form"
import { updateOmraProgram, deleteOmraProgram } from "@/lib/omra/admin-actions"

export const metadata: Metadata = {
  title: "Modifier un programme Omra — Back-office",
}

export const dynamic = "force-dynamic"

export default async function EditOmraProgramPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params

  const supabase = await createServerSupabase()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect(`/admin/login?next=/admin/products/omra/${id}`)

  const profile = await getCurrentAdminProfile(user.id)
  if (!profile || !["super_admin", "manager"].includes(profile.role)) {
    redirect("/admin")
  }

  const db = getDb()
  const rows = await db
    .select()
    .from(omraPackages)
    .where(eq(omraPackages.id, id))
    .limit(1)
  const program = rows[0]
  if (!program) notFound()

  const updateAction = updateOmraProgram.bind(null, id)
  const deleteAction = deleteOmraProgram.bind(null, id)

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" asChild>
            <Link href="/admin/products/omra">
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </Button>
          <div>
            <h1 className="text-foreground text-3xl font-bold tracking-tight">
              Modifier le programme
            </h1>
            <p className="text-muted-foreground mt-1">{program.name}</p>
          </div>
        </div>
        <form action={deleteAction}>
          <Button
            type="submit"
            variant="outline"
            className="text-red-600 hover:bg-red-50 hover:text-red-700"
          >
            <Trash2 className="mr-2 h-4 w-4" />
            Supprimer
          </Button>
        </form>
      </div>

      <OmraProgramForm
        action={updateAction}
        initial={program}
        submitLabel="Enregistrer les modifications"
      />
    </div>
  )
}
