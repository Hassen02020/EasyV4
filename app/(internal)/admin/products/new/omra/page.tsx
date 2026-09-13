import { redirect } from "next/navigation"
import Link from "next/link"
import { ArrowLeft } from "lucide-react"
import { createServerSupabase } from "@/lib/supabase/server"
import { getCurrentAdminProfile } from "@/lib/auth/profile"
import { OmraProductForm } from "@/components/admin/omra-product-form"

export const dynamic = "force-dynamic"

export default async function NewOmraProductPage() {
  const supabase = await createServerSupabase()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect("/login?next=/admin/products/new/omra")
  const profile = await getCurrentAdminProfile(user.id)
  if (!profile || !["super_admin", "manager"].includes(profile.role) || profile.agencyType !== "ota") {
    redirect("/admin")
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <Link href="/admin/products" className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1.5 text-sm">
        <ArrowLeft className="size-4" />
        Retour au catalogue
      </Link>
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Nouveau programme Omra</h1>
        <p className="text-muted-foreground mt-1">Le produit est créé en brouillon — publiez-le une fois prêt.</p>
      </div>
      <OmraProductForm />
    </div>
  )
}
