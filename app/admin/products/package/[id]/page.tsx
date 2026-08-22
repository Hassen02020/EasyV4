import { redirect, notFound } from "next/navigation"
import Link from "next/link"
import { ArrowLeft } from "lucide-react"
import { eq, and } from "drizzle-orm"
import { createServerSupabase } from "@/lib/supabase/server"
import { getCurrentAdminProfile } from "@/lib/auth/profile"
import { withTenantContext } from "@/lib/db/tenant-context"
import { catalogPackages, catalogPackageDepartures } from "@/lib/db/schema"
import { PackageProductForm } from "@/components/admin/package-product-form"
import { PackageDepartureManager } from "@/components/admin/package-departure-manager"

export const dynamic = "force-dynamic"

export default async function EditPackageProductPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createServerSupabase()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect(`/login?next=/admin/products/package/${id}`)
  const profile = await getCurrentAdminProfile(user.id)
  if (!profile || !["super_admin", "manager"].includes(profile.role) || profile.agencyType !== "ota") {
    redirect("/admin")
  }

  const result = await withTenantContext(
    { agencyId: profile.agencyId, userId: profile.id, isSuperAdmin: false },
    async (tx) => {
      const [product] = await tx
        .select()
        .from(catalogPackages)
        .where(and(eq(catalogPackages.id, id), eq(catalogPackages.agencyId, profile.agencyId)))
        .limit(1)
      if (!product) return null
      const departures = await tx
        .select()
        .from(catalogPackageDepartures)
        .where(eq(catalogPackageDepartures.packageId, id))
        .orderBy(catalogPackageDepartures.departureDate)
      return { product, departures }
    },
  )
  if (!result) notFound()
  const { product, departures } = result

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <Link href="/admin/products" className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1.5 text-sm">
        <ArrowLeft className="size-4" />
        Retour au catalogue
      </Link>
      <div>
        <h1 className="text-3xl font-bold tracking-tight">{product.title}</h1>
        <p className="text-muted-foreground mt-1">Code {product.code} — statut {product.status}</p>
      </div>

      <PackageDepartureManager
        productId={product.id}
        departures={departures.map((d) => ({
          id: d.id,
          departureDate: d.departureDate,
          returnDate: d.returnDate,
          adultPriceTnd: d.adultPriceTnd,
          childPriceTnd: d.childPriceTnd,
          totalSeats: d.totalSeats,
          bookedSeats: d.bookedSeats,
          status: d.status,
        }))}
      />

      <PackageProductForm
        productId={product.id}
        initial={{
          code: product.code,
          title: product.title,
          shortDescription: product.shortDescription ?? "",
          longDescription: product.longDescription ?? "",
          itinerary: (product.itinerary as { day: number; title: string; description?: string }[] | null) ?? [],
          coverImage: product.coverImage ?? "",
          galleryUrls: product.galleryUrls ?? [],
          departureLocations: product.departureLocations ?? [],
          transportMode: product.transportMode ?? "",
          durationDays: product.durationDays ?? 1,
          durationNights: product.durationNights ?? 0,
          inclusions: product.inclusions ?? [],
          exclusions: product.exclusions ?? [],
          channels: (product.channels as ("b2c" | "b2b" | "white_label")[]) ?? ["b2c"],
        }}
      />
    </div>
  )
}
