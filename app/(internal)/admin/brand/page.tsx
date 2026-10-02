import { Palette } from "lucide-react"
import { getOtaBrandInitial } from "@/lib/admin/brand-actions"
import { BrandForm } from "@/components/admin/brand-form"

export const metadata = {
  title: "Marque Easy2Book | Admin",
}

export default async function BrandPage() {
  const initial = await getOtaBrandInitial()

  const fallback = {
    brandName: "",
    contactEmail: "",
    contactPhone: "",
    address: "",
    logoUrl: "",
    primaryColor: "",
    whatsappNumber: "",
    facebookUrl: "",
    instagramUrl: "",
    tiktokUrl: "",
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6 p-6">
      <div className="flex items-center gap-3">
        <div className="bg-primary/10 text-primary flex h-9 w-9 shrink-0 items-center justify-center rounded-lg">
          <Palette className="h-4.5 w-4.5" />
        </div>
        <div>
          <h1 className="text-xl font-semibold">Marque Easy2Book</h1>
          <p className="text-muted-foreground text-sm">
            Identité et coordonnées du Brand Owner — visibles sur le storefront public.
          </p>
        </div>
      </div>

      <BrandForm initial={initial ?? fallback} />
    </div>
  )
}
