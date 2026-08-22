import { redirect, notFound } from "next/navigation"
import Link from "next/link"
import { ArrowLeft } from "lucide-react"
import { eq, and } from "drizzle-orm"
import { createServerSupabase } from "@/lib/supabase/server"
import { getCurrentAdminProfile } from "@/lib/auth/profile"
import { withTenantContext } from "@/lib/db/tenant-context"
import { omraPackages, omraAllotments } from "@/lib/db/schema"
import { OmraProductForm } from "@/components/admin/omra-product-form"
import { OmraAllotmentManager } from "@/components/admin/omra-allotment-manager"
import { omraProductMetadataSchema } from "@/lib/admin/schemas/omra-product"

export const dynamic = "force-dynamic"

export default async function EditOmraProductPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createServerSupabase()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect(`/login?next=/admin/products/omra/${id}`)
  const profile = await getCurrentAdminProfile(user.id)
  if (!profile || !["super_admin", "manager"].includes(profile.role) || profile.agencyType !== "ota") {
    redirect("/admin")
  }

  const result = await withTenantContext(
    { agencyId: profile.agencyId, userId: profile.id, isSuperAdmin: false },
    async (tx) => {
      const [product] = await tx
        .select()
        .from(omraPackages)
        .where(and(eq(omraPackages.id, id), eq(omraPackages.agencyId, profile.agencyId)))
        .limit(1)
      if (!product) return null
      const allotments = await tx
        .select()
        .from(omraAllotments)
        .where(eq(omraAllotments.packageId, id))
        .orderBy(omraAllotments.departureDate)
      return { product, allotments }
    },
  )
  if (!result) notFound()
  const { product, allotments } = result
  const metadataParsed = omraProductMetadataSchema.safeParse(product.metadata ?? {})

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <Link href="/admin/products" className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1.5 text-sm">
        <ArrowLeft className="size-4" />
        Retour au catalogue
      </Link>
      <div>
        <h1 className="text-3xl font-bold tracking-tight">{product.name}</h1>
        <p className="text-muted-foreground mt-1">Statut {product.status}</p>
      </div>

      <OmraAllotmentManager
        productId={product.id}
        allotments={allotments.map((a) => ({
          id: a.id,
          departureDate: a.departureDate,
          totalCapacity: a.totalCapacity,
          availableCount: a.availableCount,
          overridePrice: a.overridePrice,
          status: a.status,
        }))}
      />

      <OmraProductForm
        productId={product.id}
        initial={{
          type: product.type,
          name: product.name,
          description: product.description ?? "",
          durationDays: product.durationDays,
          validFrom: product.validFrom,
          validUntil: product.validUntil,
          basePrice: parseFloat(product.basePrice),
          includesVisa: product.includesVisa,
          includesFlights: product.includesFlights,
          includesHotels: product.includesHotels,
          includesTransfers: product.includesTransfers,
          includesZiarat: product.includesZiarat,
          includesGuide: product.includesGuide,
          maxPilgrims: product.maxPilgrims,
          minPilgrims: product.minPilgrims,
          metadata: metadataParsed.success ? metadataParsed.data : omraProductMetadataSchema.parse({}),
          channels: (product.channels as ("b2c" | "b2b" | "white_label")[]) ?? ["b2c"],
        }}
      />
    </div>
  )
}
