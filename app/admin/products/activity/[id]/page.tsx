import { redirect, notFound } from "next/navigation"
import Link from "next/link"
import { ArrowLeft } from "lucide-react"
import { eq, and } from "drizzle-orm"
import { createServerSupabase } from "@/lib/supabase/server"
import { getCurrentAdminProfile } from "@/lib/auth/profile"
import { withTenantContext } from "@/lib/db/tenant-context"
import { catalogActivities, catalogActivitySessions } from "@/lib/db/schema"
import { ActivityProductForm } from "@/components/admin/activity-product-form"
import { ActivitySessionManager } from "@/components/admin/activity-session-manager"

export const dynamic = "force-dynamic"

export default async function EditActivityProductPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createServerSupabase()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect(`/login?next=/admin/products/activity/${id}`)
  const profile = await getCurrentAdminProfile(user.id)
  if (!profile || !["super_admin", "manager"].includes(profile.role) || profile.agencyType !== "ota") {
    redirect("/admin")
  }

  const result = await withTenantContext(
    { agencyId: profile.agencyId, userId: profile.id, isSuperAdmin: false },
    async (tx) => {
      const [product] = await tx
        .select()
        .from(catalogActivities)
        .where(and(eq(catalogActivities.id, id), eq(catalogActivities.agencyId, profile.agencyId)))
        .limit(1)
      if (!product) return null
      const sessions = await tx
        .select()
        .from(catalogActivitySessions)
        .where(eq(catalogActivitySessions.activityId, id))
        .orderBy(catalogActivitySessions.sessionDate)
      return { product, sessions }
    },
  )
  if (!result) notFound()
  const { product, sessions } = result

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <Link href="/admin/products" className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1.5 text-sm">
        <ArrowLeft className="size-4" />
        Retour au catalogue
      </Link>
      <div>
        <h1 className="text-3xl font-bold tracking-tight">{product.title}</h1>
        <p className="text-muted-foreground mt-1">Statut {product.status}</p>
      </div>

      <ActivitySessionManager
        productId={product.id}
        sessions={sessions.map((s) => ({
          id: s.id,
          sessionDate: s.sessionDate,
          sessionStart: s.sessionStart,
          sessionEnd: s.sessionEnd,
          capacity: s.capacity,
          booked: s.booked,
          adultPriceTnd: s.adultPriceTnd,
          childPriceTnd: s.childPriceTnd,
          seniorPriceTnd: s.seniorPriceTnd,
          status: s.status,
        }))}
      />

      <ActivityProductForm
        productId={product.id}
        initial={{
          code: product.code,
          title: product.title,
          location: product.location ?? "",
          shortDescription: product.shortDescription ?? "",
          longDescription: product.longDescription ?? "",
          durationMinutes: product.durationMinutes ?? 60,
          coverImage: product.coverImage ?? "",
          galleryUrls: product.galleryUrls ?? [],
          inclusions: product.inclusions ?? [],
          exclusions: product.exclusions ?? [],
          channels: (product.channels as ("b2c" | "b2b" | "white_label")[]) ?? ["b2c"],
        }}
      />
    </div>
  )
}
